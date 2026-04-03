# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------+
# | get_livekit_token()           |
# | * issue JWT and spawn worker  |
# +-------------------------------+
#     |
#     |----> generate_token()
#     |        * sign browser JWT
#     |
#     |----> ai_worker_task()
#     |        * spawn background worker
#     |
#     v
# +-------------------------------+
# | ai_worker_task()              |
# | * full call lifecycle         |
# +-------------------------------+
#     |
#     |----> <Room> -> connect()
#     |        * join LiveKit room
#     |
#     |----> <TtsAudioSource> -> start()
#     |        * launch audio pump task
#     |
#     |----> <LiveKitSessionManager> -> add()
#     |        * register session by id
#     |
#     |----> <SessionMemory> -> __init__()
#     |        * init per-call memory
#     |
#     |----> _send_greeting()
#     |        * TTS greeting to room
#     |
#     v
# +-------------------------------+
# | _inbound_audio_loop()         |
# | * receive mic PCM frames      |
# +-------------------------------+
#     |
#     |----> <AudioBuf> -> push()
#     |        * buffer and gate PCM
#     |
#     |----> <InterruptionDetector> -> update_audio()
#     |        * detect energy barge-in
#     |
#     |----> _process_turn()
#     |        * fire AI pipeline
#     |
#     v
# +-------------------------------+
# | _process_turn()               |
# | * turn processing pipeline    |
# +-------------------------------+
#     |
#     |----> stt_sync()
#     |        * transcribe PCM to text
#     |
#     |----> <FeedbackLoop> -> apply()
#     |        * apply STT corrections
#     |
#     |----> <InterruptionDetector> -> check_text()
#     |        * detect keyword barge-in
#     |
#     |----> <NERExtractor> -> extract()
#     |        * extract named entities
#     |
#     |----> <LLMRouter> -> route()
#     |        * primary/fallback inference
#     |
#     |----> <PersonaEngine> -> modulate_audio()
#     |        * pitch and speed DSP
#     |
#     |----> <SessionMemory> -> add_turn()
#     |        * store turn in session
#     |
#     |----> <RAGPipeline> -> retrieve()
#     |        * fetch context chunks
#     |
#     |----> <SmartSuggestions> -> suggest()
#     |        * generate reply suggestions
#     |
#     |----> tts()
#     |        * synthesize reply audio
#     |
#     |----> <TtsAudioSource> -> push_tts_wav()
#     |        * enqueue WAV to LiveKit
#     |
#     |----> save_transcript()
#     |        * persist turn to API
#     |
#     |----> <ConversationMemory> -> save_interaction()
#     |        * persist to FAISS
#     |
#     v
# +-------------------------------+
# | _post_call_cleanup()          |
# | * summarise and persist history|
# +-------------------------------+
#     |
#     |----> <CallSummarizer> -> summarize()
#     |        * generate call summary
#     |
#     |----> <LongTermMemory> -> save_call_record()
#     |        * persist summary to SQLite
#
#     v
# [ END ]
# ================================================================

import asyncio
import json
import logging
import random
import time
import uuid

import numpy as np
from fastapi import APIRouter

from .audio_source    import TtsAudioSource
from .livekit_session import LiveKitSession
from .session_manager import livekit_session_manager
from .token_service   import LIVEKIT_URL, LIVEKIT_API_KEY, generate_token

from backend.core.config  import LANGUAGE_CONFIG
from backend.core.state   import _m
from backend.core.persona import extract_agent_name, generate_greeting
from backend.speech.stt_core     import stt_sync
from backend.speech.stt.postprocessor import _collapse_repetitions, _is_hallucination
from backend.speech.tts_client     import tts, _humanize_text
from backend.core.greeting_loader import load_greetings
from backend.agent.services.ivr_service import (
    register_ivr_call, save_transcript, finalize_ivr_call,
)

# ── New modules ─────────────────────────────────────────────────────────────
from backend.language.llm.llm_router            import llm_route_sync
from backend.speech.stt.feedback              import get_feedback_loop
from backend.language.ner_extractor    import get_ner_extractor
from backend.language.interruption_detector import get_interruption_detector
from backend.language.language_router  import get_language_router
from backend.memory.session_memory     import SessionMemory
from backend.memory.summarization.call_summarizer   import get_call_summarizer
from backend.memory.summarization.smart_suggestions import get_smart_suggestions
from backend.speech.voice_persona         import get_persona_engine
from backend.speech.voice_persona.cloner_client import clone_speech as _clone_speech
from backend.language.translator_client import translate_text

logger = logging.getLogger("callcenter.livekit.worker")

_WORKER_IDENTITY_PREFIX = "ai-worker-"


# ────────────────────────────────────────────────────────────────────────────
# Speech synthesis helper — voice cloner → Parler TTS fallback
# ────────────────────────────────────────────────────────────────────────────

async def _synthesize(text: str, session: "LiveKitSession") -> bytes:
    """
    Synthesise speech for *text* using the best available method:

    1. Voice-cloner service (port 8005) when persona.cloning_enabled=True
       and a reference WAV file path is set.  Falls back silently.
    2. Parler TTS (global port 8003 / Indic port 8004) + persona DSP.

    Returns WAV bytes or empty bytes on total failure.
    """
    import os

    loop        = asyncio.get_running_loop()
    persona_eng = get_persona_engine()
    persona     = persona_eng.resolve(session.voice_name, session.lang)

    # ── Path 1: Voice cloner ──────────────────────────────────────────────
    if persona.cloning_enabled and persona.clone_ref_audio:
        ref_path = persona.clone_ref_audio
        if os.path.isfile(ref_path):
            try:
                with open(ref_path, "rb") as fh:
                    ref_audio = fh.read()
                wav = await loop.run_in_executor(
                    None, _clone_speech, text, ref_audio, session.lang
                )
                if wav:
                    logger.debug(
                        "[Synth] voice-cloner  persona=%s  %d bytes  session=%s",
                        persona.name, len(wav), session.session_id[:8],
                    )
                    return wav
            except Exception:
                logger.warning(
                    "[Synth] voice-cloner failed, falling back to Parler  session=%s",
                    session.session_id[:8],
                )
        else:
            logger.warning(
                "[Synth] clone_ref_audio not found: %s  session=%s",
                ref_path, session.session_id[:8],
            )

    # ── Path 2: Parler TTS + persona DSP ─────────────────────────────────
    wav = await tts(text, session.lang, session.voice_name)
    if wav:
        wav = persona_eng.modulate_audio(wav, persona)
    return wav or b""

livekit_router = APIRouter(prefix="/livekit", tags=["livekit"])


# ────────────────────────────────────────────────────────────────────────────
# Token endpoint
# ────────────────────────────────────────────────────────────────────────────

@livekit_router.get("/token")
async def get_livekit_token(
    lang:  str = "en",
    llm:   str = "ollama",   # default changed to ollama (production)
    voice: str = "",
):
    room_id    = str(uuid.uuid4())
    session_id = str(uuid.uuid4())

    registry    = _m.get("voice_registry", {})
    lang_voices = registry.get(lang) or registry.get("en") or []
    selected    = (
        next((v for v in lang_voices if v["name"] == voice), None)
        or (lang_voices[0] if lang_voices else None)
    )
    voice_stem = selected["name"] if selected else voice
    agent_name = extract_agent_name(voice_stem)

    user_token = generate_token(
        room_name    = room_id,
        identity     = f"user-{session_id[:8]}",
        name         = "Caller",
        can_publish  = True,
        can_subscribe= True,
    )

    asyncio.ensure_future(
        ai_worker_task(
            room_id    = room_id,
            session_id = session_id,
            lang       = lang,
            llm_key    = llm,
            voice_stem = voice_stem,
            agent_name = agent_name,
        )
    )

    logger.info(
        "[Token] issued  session=%s  room=%s  lang=%s llm=%s voice=%s agent=%s",
        session_id[:8], room_id[:8], lang, llm, voice_stem, agent_name,
    )

    return {
        "token":      user_token,
        "url":        LIVEKIT_URL,
        "room":       room_id,
        "agent_name": agent_name,
        "session_id": session_id,
    }


@livekit_router.get("/health")
async def livekit_health():
    return {
        "status":          "ok",
        "active_sessions": livekit_session_manager.count,
        "livekit_url":     LIVEKIT_URL,
        "api_key":         LIVEKIT_API_KEY,
    }


# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────

async def _publish_data(session: LiveKitSession, msg: dict) -> None:
    if session.room is None or session.closed:
        return
    try:
        await session.room.local_participant.publish_data(
            payload  = json.dumps(msg).encode("utf-8"),
            reliable = True,
        )
    except Exception:
        pass


async def _send_greeting(session: LiveKitSession) -> None:
    try:
        greetings    = load_greetings()
        raw_greeting = (
            greetings.get(session.lang)
            or generate_greeting(session.lang, session.agent_name)
        )
        greeting_text = raw_greeting.format(name=session.agent_name)
        session.history.append({"role": "assistant", "text": greeting_text})

        # Log to session memory
        if session.session_mem:
            await session.session_mem.add_turn(
                role="assistant", text=greeting_text, lang=session.lang
            )

        wav_bytes = await _synthesize(greeting_text, session)
        if wav_bytes:
            logger.info(
                "[Greeting] TTS done  %d bytes  session=%s",
                len(wav_bytes), session.session_id[:8],
            )
            await session.audio_source.push_tts_wav(wav_bytes)
            session.recording_turns.append({"type": "ai", "wav": wav_bytes})
        else:
            logger.warning(
                "[Greeting] TTS returned empty bytes  session=%s", session.session_id[:8]
            )

        await _publish_data(session, {
            "type":       "greeting",
            "text":       greeting_text,
            "agent_name": session.agent_name,
        })

        if session.ivr_call_id:
            asyncio.ensure_future(
                save_transcript(session.ivr_call_id, "agent", greeting_text)
            )

        logger.info(
            "[Greeting] sent  session=%s  text=%r",
            session.session_id[:8], greeting_text[:60],
        )
    except Exception:
        logger.exception("[Greeting] error  session=%s", session.session_id[:8])


# ────────────────────────────────────────────────────────────────────────────
# Inbound audio loop
# ────────────────────────────────────────────────────────────────────────────

async def _inbound_audio_loop(session: LiveKitSession, track) -> None:
    from livekit import rtc

    logger.info("[Inbound] audio loop started  session=%s", session.session_id[:8])

    try:
        stream = rtc.AudioStream(track, sample_rate=16_000, num_channels=1)
    except TypeError:
        stream = rtc.AudioStream(track)

    async for event in stream:
        if session.closed:
            break

        frame = getattr(event, "frame", event)
        raw   = getattr(frame, "data", None)
        if raw is None:
            continue

        from backend.audio.converter import int16_to_float32, resample_audio
        pcm_int16 = np.frombuffer(bytes(raw), dtype=np.int16)
        pcm_f32   = int16_to_float32(pcm_int16)

        sr = getattr(frame, "sample_rate", 16_000)
        if sr != 16_000:
            pcm_f32 = resample_audio(pcm_f32, sr, 16_000)

        session.buf.push(pcm_f32)

        # ── Interruption detector — audio path ───────────────────────
        if session.interruption_detector and session.audio_source:
            is_playing = not session.audio_source._queue.empty() if hasattr(session.audio_source, '_queue') else False
            session.interruption_detector.set_tts_playing(is_playing)
            evt = session.interruption_detector.update_audio(pcm_f32)
            if evt and evt.confidence > 0.6 and not session.lock.locked():
                logger.debug(
                    "[Inbound] interruption detected via audio  conf=%.2f  session=%s",
                    evt.confidence, session.session_id[:8],
                )
                session.mark_interrupted()
                await _publish_data(session, {"type": "barge_in"})

        if session.buf.ready() and not session.lock.locked():
            pcm_utt = session.buf.flush()
            if pcm_utt is not None:
                session.recording_turns.append({"type": "user", "pcm": pcm_utt})

                drained = session.audio_source.clear()
                session._trim_last_ai_turn(drained)
                await _publish_data(session, {"type": "barge_in"})

                asyncio.ensure_future(_process_turn(pcm_utt, session))

    logger.info("[Inbound] audio loop ended  session=%s", session.session_id[:8])


# ────────────────────────────────────────────────────────────────────────────
# Main turn processing pipeline
# ────────────────────────────────────────────────────────────────────────────

async def _process_turn(pcm: np.ndarray, session: LiveKitSession) -> None:
    loop    = asyncio.get_running_loop()
    turn_t0 = time.perf_counter()

    async with session.lock:
        session.interrupted = False

        # ── 1. STT ────────────────────────────────────────────────────
        t_stt = time.perf_counter()
        try:
            user_text: str = await loop.run_in_executor(
                None, stt_sync, pcm, session.lang
            )
        except Exception:
            logger.exception("[Turn] STT error  session=%s", session.session_id[:8])
            session.buf.flush()
            return
        stt_ms = (time.perf_counter() - t_stt) * 1000

        if not user_text:
            return

        user_text = _collapse_repetitions(user_text)
        if _is_hallucination(user_text):
            logger.warning("[Turn] hallucination dropped  session=%s", session.session_id[:8])
            return

        # ── 2. STT Feedback Loop ──────────────────────────────────────
        feedback   = get_feedback_loop()
        user_text  = feedback.apply(user_text, session.lang)

        # ── 3. NER ────────────────────────────────────────────────────
        ner      = get_ner_extractor()
        entities = await loop.run_in_executor(
            None, ner.extract, user_text, session.lang
        )

        # ── 3b. Long-term memory context injection (first phone hit) ──
        ltm = _m.get("long_term_memory")
        if ltm and entities.get("phones") and not getattr(session, "_ltm_injected", False):
            phone = entities["phones"][0]
            try:
                ctx = await loop.run_in_executor(None, ltm.get_customer_context, phone)
                if ctx:
                    existing = _m.get("company_context", "")
                    _m["company_context"] = ctx + "\n\n" + existing
                    session._ltm_injected = True
                    logger.info(
                        "[Turn] LTM context injected  phone=%s  session=%s",
                        phone, session.session_id[:8],
                    )
            except Exception as exc:
                logger.debug("[Turn] LTM inject error: %s", exc)

        # ── 4. Interruption keyword check ─────────────────────────────
        if session.interruption_detector:
            evt = session.interruption_detector.check_text(user_text)
            if evt:
                logger.debug("[Turn] interruption keyword=%r  session=%s",
                             evt.keyword, session.session_id[:8])

        # ── 5. Language detection update ──────────────────────────────
        if session.lang_router:
            detected_lang = await loop.run_in_executor(
                None, session.lang_router.update, user_text
            )
            if detected_lang != session.lang:
                logger.info(
                    "[Turn] lang switch %s→%s  session=%s",
                    session.lang, detected_lang, session.session_id[:8],
                )
                # Translate user text to detected language for LLM context
                if detected_lang != "en" and session.lang == "en":
                    translated = await loop.run_in_executor(
                        None, translate_text, user_text, "en", detected_lang
                    )
                    if translated:
                        user_text = translated
                session.lang = detected_lang

        await _publish_data(session, {
            "type":     "transcript",
            "text":     user_text,
            "entities": entities,
        })
        session.history.append({"role": "user", "text": user_text})
        hist_snap = list(session.history)

        if session.ivr_call_id:
            asyncio.ensure_future(
                save_transcript(session.ivr_call_id, "caller", user_text)
            )

        # ── 6. RAG context retrieval ──────────────────────────────────
        rag_context = ""
        rag_pipeline = _m.get("rag")
        if rag_pipeline:
            try:
                rag_context = await loop.run_in_executor(
                    None, rag_pipeline.get_context_string, user_text, 3, session.lang
                )
            except Exception as exc:
                logger.debug("[Turn] RAG error: %s", exc)

        # Inject RAG context into company_context temporarily
        original_ctx = _m.get("company_context", "")
        if rag_context:
            _m["company_context"] = rag_context + "\n\n" + original_ctx

        # ── 7. LLM — Ollama primary, Gemini fallback ──────────────────
        t_llm = time.perf_counter()
        try:
            ai_text, backend_used = await loop.run_in_executor(
                None, llm_route_sync,
                hist_snap, session.lang, session.voice_name, session.llm_key
            )
        except Exception:
            logger.exception("[Turn] LLM error  session=%s", session.session_id[:8])
            session.buf.flush()
            canned = LANGUAGE_CONFIG.get(session.lang, LANGUAGE_CONFIG["en"]).get(
                "canned_error", "Sorry, I had a connection issue. Could you repeat that?"
            )
            await _publish_data(session, {"type": "response", "text": canned})
            return
        finally:
            # Restore company context
            _m["company_context"] = original_ctx

        llm_ms = (time.perf_counter() - t_llm) * 1000
        logger.info(
            "[Turn] LLM done  backend=%s  text=%r  session=%s",
            backend_used, (ai_text or "")[:60], session.session_id[:8],
        )

        if not ai_text:
            return

        # ── 8. Smart suggestions (async fire-and-forget) ─────────────
        if session.smart_suggestions:
            async def _send_suggestions() -> None:
                try:
                    sug = await loop.run_in_executor(
                        None, session.smart_suggestions.suggest, hist_snap, user_text
                    )
                    await _publish_data(session, {"type": "suggestions", "items": sug})
                except Exception:
                    pass
            asyncio.ensure_future(_send_suggestions())

        await asyncio.sleep(random.uniform(0.2, 0.5))

        # ── 9. Barge-in pivot ─────────────────────────────────────────
        if session.interrupted:
            session.interrupted = False
            barge_text = random.choice(
                LANGUAGE_CONFIG.get(session.lang, LANGUAGE_CONFIG["en"])["barge_phrases"]
            )
            logger.info("[Turn] barge-in pivot=%r  session=%s", barge_text, session.session_id[:8])
            session.history.append({"role": "assistant", "text": barge_text})
            try:
                barge_wav = await tts(barge_text, session.lang, session.voice_name)
                await session.audio_source.push_tts_wav(barge_wav)
                session.recording_turns.append({"type": "ai", "wav": barge_wav})
            except Exception:
                logger.exception("[Turn] barge-in TTS error  session=%s", session.session_id[:8])
            await _publish_data(session, {
                "type": "response", "text": barge_text, "barge_in": True
            })
            return

        session.history.append({"role": "assistant", "text": ai_text})
        tts_text = _humanize_text(ai_text, session.lang)

        # ── 10. TTS + Persona modulation / Voice cloning ──────────────
        t_tts = time.perf_counter()
        try:
            wav_bytes = await _synthesize(tts_text, session)
            if not wav_bytes:
                logger.warning(
                    "[Turn] TTS returned empty bytes  session=%s", session.session_id[:8]
                )
            else:
                tts_ms   = (time.perf_counter() - t_tts) * 1000
                total_ms = (time.perf_counter() - turn_t0) * 1000
                logger.info(
                    "[Latency] stt=%.0fms llm=%.0fms tts=%.0fms total=%.0fms  backend=%s  session=%s",
                    stt_ms, llm_ms, tts_ms, total_ms, backend_used, session.session_id[:8],
                )
                await session.audio_source.push_tts_wav(wav_bytes)
                session.recording_turns.append({"type": "ai", "wav": wav_bytes})

                # ── 11. Session memory ─────────────────────────────────
                if session.session_mem:
                    asyncio.ensure_future(session.session_mem.add_turn(
                        role       = "user",
                        text       = user_text,
                        lang       = session.lang,
                        entities   = entities,
                        latency_ms = {"stt": stt_ms, "llm": llm_ms, "tts": tts_ms},
                    ))
                    asyncio.ensure_future(session.session_mem.add_turn(
                        role = "assistant",
                        text = ai_text,
                        lang = session.lang,
                    ))

        except Exception:
            logger.exception("[Turn] TTS error  session=%s", session.session_id[:8])

        await _publish_data(session, {"type": "response", "text": ai_text})

        if session.ivr_call_id:
            asyncio.ensure_future(
                save_transcript(session.ivr_call_id, "agent", ai_text)
            )

        # ── 12. Long-term FAISS memory ────────────────────────────────
        if _m.get("memory"):
            _u, _a, _l = user_text, ai_text, session.lang
            async def _persist() -> None:
                try:
                    await loop.run_in_executor(
                        None, _m["memory"].save_interaction, _u, _a, _l
                    )
                except Exception as exc:
                    logger.debug("[Turn] FAISS error: %s", exc)
            asyncio.create_task(_persist())


# ────────────────────────────────────────────────────────────────────────────
# Post-call cleanup: summarise + persist
# ────────────────────────────────────────────────────────────────────────────

async def _post_call_cleanup(session: LiveKitSession) -> None:
    """Generate call summary and persist to long-term memory."""
    loop = asyncio.get_running_loop()
    try:
        summarizer = get_call_summarizer()
        entities   = session.session_mem.get_entities_aggregate() if session.session_mem else {}
        summary    = await loop.run_in_executor(
            None,
            summarizer.summarize,
            session.history,
            session.lang,
            session.session_id,
            session.session_mem.start_time if session.session_mem else 0.0,
            entities,
        )

        # Publish summary to browser
        await _publish_data(session, {"type": "call_summary", "summary": summary})

        logger.info(
            "[Cleanup] summary  intent=%s  sentiment=%s  turns=%d  session=%s",
            summary.get("primary_intent"), summary.get("sentiment"),
            summary.get("turns"), session.session_id[:8],
        )

        # Persist to long-term memory if phone number known
        ltm = _m.get("long_term_memory")
        phone = session.session_mem.get_entities_aggregate().get("phones", [""])[0] if session.session_mem else ""
        if ltm and phone:
            await loop.run_in_executor(
                None, ltm.save_call_record,
                phone, session.session_id, summary, session.lang,
            )

    except Exception:
        logger.exception("[Cleanup] post-call error  session=%s", session.session_id[:8])


# ────────────────────────────────────────────────────────────────────────────
# Worker task
# ────────────────────────────────────────────────────────────────────────────

async def ai_worker_task(
    room_id:    str,
    session_id: str,
    lang:       str,
    llm_key:    str,
    voice_stem: str,
    agent_name: str,
) -> None:
    from livekit import rtc

    session = LiveKitSession(
        session_id = session_id,
        agent_name = agent_name,
        lang       = lang,
        llm_key    = llm_key,
        voice_name = voice_stem,
    )

    # ── Attach new modules to session ─────────────────────────────────
    session.session_mem           = SessionMemory(session_id, agent_name, lang)
    session.interruption_detector = get_interruption_detector(lang)
    session.lang_router           = get_language_router(lang)
    session.smart_suggestions     = get_smart_suggestions(lang)

    room = rtc.Room()
    session.room = room

    worker_token = generate_token(
        room_name     = room_id,
        identity      = f"{_WORKER_IDENTITY_PREFIX}{session_id[:8]}",
        name          = agent_name,
        can_publish   = True,
        can_subscribe = True,
    )

    @room.on("participant_connected")
    def _on_participant_connected(participant) -> None:
        ident: str = getattr(participant, "identity", "") or ""
        if _WORKER_IDENTITY_PREFIX in ident:
            return
        if not session.connected:
            session.connected = True
            logger.info(
                "[Worker] user joined  participant=%s  session=%s",
                ident[:16], session.session_id[:8],
            )
            asyncio.ensure_future(_send_greeting(session))

    @room.on("participant_disconnected")
    def _on_participant_disconnected(participant) -> None:
        ident: str = getattr(participant, "identity", "") or ""
        if _WORKER_IDENTITY_PREFIX in ident:
            return
        remaining = [
            p for p in room.remote_participants.values()
            if _WORKER_IDENTITY_PREFIX not in (getattr(p, "identity", "") or "")
        ]
        if not remaining:
            logger.info(
                "[Worker] user disconnected — ending session  session=%s",
                session.session_id[:8],
            )
            session.closed = True

    @room.on("track_subscribed")
    def _on_track_subscribed(track, publication, participant) -> None:
        ident: str = getattr(participant, "identity", "") or ""
        if _WORKER_IDENTITY_PREFIX in ident:
            return

        is_audio = isinstance(track, rtc.RemoteAudioTrack)
        if not is_audio:
            kind_val = getattr(track, "kind", None)
            is_audio = (kind_val == 1 or kind_val == rtc.TrackKind.KIND_AUDIO
                        if hasattr(rtc, "TrackKind") else kind_val == 1)

        if is_audio:
            logger.info(
                "[Worker] subscribing to mic track  session=%s  participant=%s",
                session.session_id[:8], ident[:16],
            )
            loop = asyncio.get_running_loop()
            asyncio.ensure_future(_inbound_audio_loop(session, track), loop=loop)

    @room.on("data_received")
    def _on_data_received(data_packet) -> None:
        try:
            raw   = getattr(data_packet, "data", data_packet)
            msg   = json.loads(bytes(raw).decode("utf-8"))
            mtype = msg.get("type", "")

            if mtype == "interrupt":
                session.mark_interrupted()
                logger.info("[Worker] barge-in  session=%s", session.session_id[:8])

            elif mtype == "hangup":
                logger.info("[Worker] hangup  session=%s", session.session_id[:8])
                session.closed = True

            elif mtype == "stt_correction":
                # Agent provides a correction → feedback loop
                bad       = msg.get("bad_text", "")
                corrected = msg.get("corrected", "")
                if bad and corrected:
                    feedback = get_feedback_loop()
                    feedback.record_correction(bad, corrected, session.lang)
                    logger.info(
                        "[Worker] STT correction recorded  lang=%s  session=%s",
                        session.lang, session.session_id[:8],
                    )

            elif mtype == "rag_document":
                # Runtime document injection
                content = msg.get("content", "")
                if content and _m.get("rag"):
                    asyncio.ensure_future(
                        asyncio.get_running_loop().run_in_executor(
                            None, _m["rag"].add_document, content, {"source": "live"}
                        )
                    )

        except Exception:
            pass

    @room.on("disconnected")
    def _on_disconnected(*args) -> None:
        session.closed = True

    # ── Connect to LiveKit ─────────────────────────────────────────────
    try:
        await room.connect(LIVEKIT_URL, worker_token)
        logger.info(
            "[Worker] connected  session=%s  room=%s",
            session.session_id[:8], room_id[:8],
        )
    except Exception:
        logger.exception("[Worker] failed to connect  session=%s", session.session_id[:8])
        return

    # ── Publish audio track ────────────────────────────────────────────
    try:
        audio_source         = TtsAudioSource()
        session.audio_source = audio_source
        audio_source.start()

        ai_track = rtc.LocalAudioTrack.create_audio_track(
            "ai-voice", audio_source.source
        )
        publish_options = rtc.TrackPublishOptions(
            source = rtc.TrackSource.SOURCE_MICROPHONE,
        )
        await room.local_participant.publish_track(ai_track, publish_options)
        logger.info("[Worker] audio track published  session=%s", session.session_id[:8])
    except Exception:
        logger.exception("[Worker] failed to publish audio  session=%s", session.session_id[:8])
        await room.disconnect()
        return

    await livekit_session_manager.add(session)
    asyncio.ensure_future(register_ivr_call(session))

    # Handle users already in the room
    for participant in room.remote_participants.values():
        ident = getattr(participant, "identity", "") or ""
        if _WORKER_IDENTITY_PREFIX not in ident and not session.connected:
            session.connected = True
            asyncio.ensure_future(_send_greeting(session))
            break

    logger.info("[Worker] waiting  session=%s", session.session_id[:8])
    while not session.closed:
        await asyncio.sleep(0.5)

    logger.info("[Worker] session ending  session=%s", session.session_id[:8])

    # ── Post-call cleanup ───────────────────────────────────────────────
    await _post_call_cleanup(session)

    if session.audio_source:
        session.audio_source.stop()

    try:
        await _publish_data(session, {"type": "hangup"})
    except Exception:
        pass

    asyncio.ensure_future(finalize_ivr_call(session))
    await livekit_session_manager.cleanup_session(session.session_id)

    try:
        await room.disconnect()
    except Exception:
        pass

    logger.info("[Worker] task complete  session=%s", session.session_id[:8])
