# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------+
# | lifespan()                    |
# | * app lifecycle management    |
# +-------------------------------+
#     |
#     |----> _init_models()
#     |        * load AI engines
#     |
#     v
# +-------------------------------+
# | websocket_call()              |
# | * real-time call handler      |
# +-------------------------------+
#     |
#     |----> _send_greetings()
#     |        * play welcome audio
#     |
#     |----> _listen_loop()
#     |        * stream and process audio
#     |
#     v
# +-------------------------------+
# | _process_turn()               |
# | * turn processing logic       |
# +-------------------------------+
#     |
#     |----> stt_sync()
#     |        * audio to text
#     |
#     |----> _qwen_sync()
#     |        * LLM response gen
#     |
#     |----> tts()
#     |        * text to audio
#     |
#     v
# [ END ]
# ================================================================
import asyncio
import base64
import json
import random
import sys
import time
import uuid
from typing import List, Optional

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response

from backend.audio.barge_in import BargeInHandler
from backend.audio.call_vad import SimpleVAD
from backend.core.config import (
    BACKEND_ROOT, PROJECT_ROOT,
    LANGUAGE_CONFIG, SMART_RAG_ENABLED, RAG_TABLES,
)
from backend.core.decorator import log_execution
from backend.core.greeting_loader import load_greetings
from backend.core.lifespan import lifespan
from backend.core.logger import setup_logger
from backend.core.persona import extract_agent_name, generate_greeting
from backend.core.post_call import _post_call_tasks
from backend.core.state import _m
from backend.language.llm_core import _qwen_sync
from backend.speech.stt_core import stt_sync
from backend.speech.stt.postprocessor import _collapse_repetitions, _is_hallucination
from backend.speech.tts_client import tts, _humanize_text

sys.path.insert(0, str(PROJECT_ROOT))
load_dotenv(PROJECT_ROOT / ".env")

logger = setup_logger("callcenter")

STATIC = BACKEND_ROOT / "static"
STATIC.mkdir(exist_ok=True)

app = FastAPI(title="SR Comsoft Call Center AI", lifespan=lifespan)

from backend.agent import livekit_router          # noqa: E402
from backend.api.avatar_routes import router as avatar_router
from backend.api.session_routes import router as session_router
from backend.api.routing_routes import routing_api_router
from backend.routing_ivr.ivr_routes import ivr_router
from backend.api.auth_routes import router as auth_router
from backend.api.webrtc_routes import router as webrtc_router
from backend.api.home_routes import router as home_router
from backend.api.callcenter.api import cc_router
from backend.api.callcenter.ws_router import ws_router as cc_ws_router
from backend.api.superuser_routes import superuser_router
from backend.routing import routing_engine as _re

# Load routing rules at startup
try:
    _re.load_rules()
    logger.info("Routing rules loaded: %d rules", len(_re.rules_snapshot()))
except Exception as _e:
    logger.warning("Routing rules load failed: %s", _e)

app.include_router(livekit_router)
app.include_router(avatar_router)
app.include_router(session_router)
app.include_router(routing_api_router)
app.include_router(ivr_router)
app.include_router(auth_router)
app.include_router(webrtc_router)
app.include_router(home_router)
app.include_router(cc_router, prefix="/api")
app.include_router(cc_ws_router, prefix="/api/cc")
app.include_router(superuser_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/assets/call_centre_room.wav")
async def serve_room_audio():
    path = PROJECT_ROOT / "services" / "tts_service" / "indic_tts" / "assets" / "call_centre_room.wav"
    if not path.exists():
        return Response(status_code=404)
    return FileResponse(str(path), media_type="audio/wav")


@app.get("/")
@log_execution
async def index():
    html = STATIC / "index.html"
    if not html.exists():
        return HTMLResponse("<h1>index.html not found in backend/static/</h1>", status_code=404)
    return HTMLResponse(html.read_text(encoding="utf-8"))


@app.get("/stt-test")
@log_execution
async def stt_test_page():
    html = BACKEND_ROOT / "stt" / "stt_test.html"
    if not html.exists():
        return HTMLResponse("<h1>stt_test.html not found in backend/stt/</h1>", status_code=404)
    return HTMLResponse(html.read_text(encoding="utf-8"))


@app.get("/api/voices")
@log_execution
async def api_voices():
    return _m.get("voice_registry", {})


@app.websocket("/ws/stt-test")
@log_execution
async def ws_stt_test(ws: WebSocket, lang: str = "en", gap: int = 1000):
    await ws.accept()
    loop       = asyncio.get_event_loop()
    processing = False

    async def _transcribe(pcm: np.ndarray) -> None:
        nonlocal processing
        processing = True
        raw_rms = float(np.sqrt(np.mean(pcm ** 2)))
        await ws.send_json({"type": "processing"})
        t0 = loop.time()
        try:
            stt_prompt = LANGUAGE_CONFIG.get(lang, {}).get("stt_prompt")
            text = await loop.run_in_executor(
                None, lambda: _m["stt"].transcribe_pcm(pcm, language=lang, initial_prompt=stt_prompt)
            )
        except Exception:
            logger.exception("[STT-test] transcription error")
            text = ""
        elapsed_ms = int((loop.time() - t0) * 1000)
        processing  = False
        if text:
            text = _collapse_repetitions(text)
            await ws.send_json({"type": "transcript", "text": text, "rms": raw_rms, "elapsed_ms": elapsed_ms})
        else:
            await ws.send_json({"type": "skipped", "rms": raw_rms, "reason": "whisper"})

    vad = SimpleVAD(on_utterance=_transcribe, silence_gap=gap / 1000.0, loop=loop)
    try:
        while True:
            msg = await ws.receive()
            if "bytes" in msg and msg["bytes"]:
                vad.feed(np.frombuffer(msg["bytes"], dtype=np.float32), locked=processing)
            elif "text" in msg and msg["text"]:
                if json.loads(msg["text"]).get("type") == "end":
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("[STT-test] WS error")


@app.websocket("/ws/call")
@log_execution
async def ws_call(ws: WebSocket):
    await ws.accept()

    try:
        raw  = await asyncio.wait_for(ws.receive_text(), timeout=10.0)
        init = json.loads(raw)
    except Exception:
        await ws.close(1002, "Expected JSON init message")
        return

    lang         = init.get("lang",  "en")
    llm_key      = init.get("llm",   "gemini")
    voice_name   = init.get("voice", "")
    client_phone = init.get("phone") or str(ws.client.host if ws.client else "unknown")

    registry    = _m.get("voice_registry", {})
    lang_voices = registry.get(lang) or registry.get("en") or []
    selected    = next((v for v in lang_voices if v["name"] == voice_name), None) or (lang_voices[0] if lang_voices else None)
    if selected is None:
        for voices in registry.values():
            if voices:
                selected = voices[0]
                break
    voice_stem = selected["name"] if selected else (voice_name or "Agent")
    agent_name = extract_agent_name(voice_stem)
    session_id    = str(uuid.uuid4())
    call_start_ts = time.time()

    logger.info("📞 Call start | session=%s lang=%s llm=%s voice=%s agent=%s",
                session_id[:8], lang, llm_key, voice_stem, agent_name)

    customer_ctx = ""
    if _m.get("pg_memory"):
        try:
            customer_ctx = await asyncio.get_event_loop().run_in_executor(
                None, _m["pg_memory"].get_customer_context, client_phone
            )
            if customer_ctx:
                logger.info("[PGMem] returning caller context loaded (%d chars)", len(customer_ctx))
        except Exception as exc:
            logger.debug("[PGMem] get_customer_context failed: %s", exc)
    _m["customer_context"] = customer_ctx

    avatar_config = None
    if _m.get("pg_memory"):
        try:
            avatar_config = await asyncio.get_event_loop().run_in_executor(
                None, _m["pg_memory"].get_avatar_config, voice_stem
            )
        except Exception as exc:
            logger.debug("[PGMem] get_avatar_config failed: %s", exc)

    if avatar_config and avatar_config.get("generated_greeting"):
        greeting_text = avatar_config["generated_greeting"]
        logger.info("Greeting [generated] agent=%s: %r", agent_name, greeting_text)
    else:
        _greetings    = load_greetings()
        _raw_greeting = _greetings.get(lang) or generate_greeting(lang, agent_name)
        greeting_text = _raw_greeting.format(name=agent_name)
        logger.info("Greeting [%s] agent=%s: %r",
                    "file" if lang in _greetings else "fallback", agent_name, greeting_text)

    history:           List[dict]      = []
    session_turns:     List[dict]      = []
    call_audio_chunks: List[np.ndarray] = []

    lock              = asyncio.Lock()
    loop              = asyncio.get_event_loop()
    barge             = BargeInHandler()
    current_turn_task: Optional[asyncio.Task] = None

    async def _gen_greeting() -> str:
        try:
            wav = await tts(greeting_text, lang, voice_stem)
            return base64.b64encode(wav).decode()
        except Exception:
            logger.warning("Greeting TTS failed — sending text only")
            return ""

    async def process_turn(pcm: np.ndarray) -> None:
        nonlocal current_turn_task

        async with lock:
            logger.info("┌─ TURN START  pcm=%.2fs", len(pcm) / 16_000)
            try:
                user_text = await loop.run_in_executor(None, stt_sync, pcm, lang)
            except Exception:
                logger.exception("  STT error")
                return
            if not user_text:
                logger.info("└─ TURN END   (empty STT)")
                return

            user_text = _collapse_repetitions(user_text)
            if _is_hallucination(user_text):
                logger.warning("  STT hallucination dropped")
                return

            logger.info("  STT  → %r", user_text)
            try:
                await ws.send_json({"type": "transcript", "text": user_text})
            except Exception:
                return

            history.append({"role": "user", "text": user_text})
            hist_snap = list(history)

            rag_context = ""
            if SMART_RAG_ENABLED and RAG_TABLES:
                try:
                    from backend.memory.smart_rag import search as _smart_rag_search
                    smart_ctx = await loop.run_in_executor(None, _smart_rag_search, user_text, RAG_TABLES)
                    if smart_ctx:
                        rag_context = smart_ctx
                        logger.info("  RAG  → %d chars | preview: %s", len(smart_ctx), smart_ctx[:120].replace("\n", " "))
                    else:
                        logger.info("  RAG  → no match (threshold not met)")
                except Exception as exc:
                    logger.warning("  RAG  → failed: %s", exc)

            logger.info("  LLM  → calling ollama")
            llm_fn  = _qwen_sync
            custom_prompt_text = avatar_config.get("generated_prompt") if avatar_config else None
            llm_fut = loop.run_in_executor(None, lambda: llm_fn(
                hist_snap, lang, voice_stem, rag_context, customer_ctx, custom_prompt_text
            ))

            try:
                ai_text = await llm_fut
            except Exception:
                logger.exception("  LLM error")
                canned = LANGUAGE_CONFIG.get(lang, {}).get(
                    "canned_error", "Sorry, I had a connection issue. Could you repeat that?"
                )
                try:
                    await ws.send_json({"type": "response", "text": canned, "audio": ""})
                except Exception:
                    pass
                return

            if not ai_text:
                return

            logger.info("  LLM  ← %r", ai_text[:120])

            if barge.consume():
                barge_text  = random.choice(LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG["en"])["barge_phrases"])
                logger.info("🛑 Barge-in pivot: %r", barge_text)
                history.append({"role": "assistant", "text": barge_text})
                session_turns.append({"role": "assistant", "text": barge_text, "ts": time.time()})
                try:
                    b_wav = await tts(barge_text, lang, voice_stem)
                    b64   = base64.b64encode(b_wav).decode()
                except Exception:
                    b64 = ""
                try:
                    await ws.send_json({"type": "response", "text": barge_text, "audio": b64, "barge_in": True})
                except Exception:
                    pass
                return

            history.append({"role": "assistant", "text": ai_text})
            session_turns.append({"role": "user",      "text": user_text, "ts": time.time()})
            session_turns.append({"role": "assistant",  "text": ai_text,  "ts": time.time()})

            tts_text = _humanize_text(ai_text, lang)
            try:
                wav = await tts(tts_text, lang, voice_stem)
                a64 = base64.b64encode(wav).decode()
                logger.info("  TTS  → %.1fkB audio", len(wav) / 1024)
            except Exception:
                logger.warning("  TTS  → failed (no audio)")
                a64 = ""
            try:
                await ws.send_json({"type": "response", "text": ai_text, "audio": a64})
                logger.info("└─ TURN END")
            except Exception:
                logger.debug("  WS send failed — client disconnected")

            if _m.get("pg_memory"):
                async def _persist():
                    try:
                        pgm = _m["pg_memory"]
                        await loop.run_in_executor(None, pgm.save_turn, session_id, "user",      user_text, lang)
                        await loop.run_in_executor(None, pgm.save_turn, session_id, "assistant", ai_text,   lang)
                    except Exception as exc:
                        logger.debug("pgvector turn persist error: %s", exc)
                asyncio.create_task(_persist())

    async def _barge_response() -> None:
        async with lock:
            if not barge.consume():
                return
            barge_text = random.choice(
                LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG["en"])["barge_phrases"]
            )
            logger.info("🛑 Barge phrase: %r", barge_text)
            history.append({"role": "assistant", "text": barge_text})
            session_turns.append({"role": "assistant", "text": barge_text, "ts": time.time()})
            try:
                b_wav = await tts(barge_text, lang, voice_stem)
                b64   = base64.b64encode(b_wav).decode()
            except Exception:
                b64 = ""
            try:
                await ws.send_json({"type": "response", "text": barge_text, "audio": b64, "barge_in": True})
            except Exception:
                pass

    async def _on_utterance(pcm: np.ndarray) -> None:
        nonlocal current_turn_task
        current_turn_task = asyncio.create_task(process_turn(pcm))

    vad = SimpleVAD(on_utterance=_on_utterance, silence_gap=0.5, loop=loop)

    greet_task = asyncio.create_task(_gen_greeting())
    while not greet_task.done():
        try:
            msg = await asyncio.wait_for(ws.receive(), timeout=10.0)
            if "bytes" in msg and msg["bytes"]:
                chunk = np.frombuffer(msg["bytes"], dtype=np.float32)
                call_audio_chunks.append(chunk)
                vad.feed(chunk, locked=lock.locked())
            elif "text" in msg and msg["text"]:
                evt = json.loads(msg["text"]).get("type")
                if evt == "end":
                    greet_task.cancel()
                    return
                elif evt == "interrupt":
                    greet_task.cancel()
                    barge.trigger(current_turn_task)
                    asyncio.ensure_future(_barge_response())
                    break
        except asyncio.TimeoutError:
            try:
                await ws.send_json({"type": "ping"})
            except Exception:
                greet_task.cancel()
                return
        except Exception:
            greet_task.cancel()
            return

    try:
        g_b64 = await greet_task
    except BaseException:
        g_b64 = ""

    await ws.send_json({"type": "greeting", "text": greeting_text, "audio": g_b64, "agent_name": agent_name})
    history.append({"role": "assistant", "text": greeting_text})
    session_turns.append({"role": "assistant", "text": greeting_text, "ts": time.time()})

    try:
        while True:
            msg = await ws.receive()

            if "bytes" in msg and msg["bytes"]:
                chunk = np.frombuffer(msg["bytes"], dtype=np.float32)
                call_audio_chunks.append(chunk)
                is_locked = lock.locked()
                vad.feed(chunk, locked=is_locked)
                if is_locked and not barge.interrupted and float(np.sqrt(np.mean(chunk ** 2))) > 0.05:
                    barge.trigger(current_turn_task)
                    asyncio.ensure_future(_barge_response())

            elif "text" in msg and msg["text"]:
                evt_type = json.loads(msg["text"]).get("type")
                if evt_type == "end":
                    logger.info("Client sent end-of-call")
                    break
                elif evt_type == "interrupt":
                    logger.info("🛑 Barge-in received")
                    barge.trigger(current_turn_task)
                    asyncio.ensure_future(_barge_response())

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception:
        logger.exception("WS loop error")
    finally:
        logger.info("📵 Call ended | session=%s lang=%s llm=%s", session_id[:8], lang, llm_key)
        asyncio.create_task(_post_call_tasks(
            session_id=session_id,
            lang=lang,
            client_phone=client_phone,
            session_turns=list(session_turns),
            audio_chunks=list(call_audio_chunks),
            voice_stem=voice_stem,
            llm_used=llm_key,
            call_start_ts=call_start_ts,
        ))
