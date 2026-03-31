#!/usr/bin/env python3
# ================================================================
# FILE EXECUTION FLOW
# ================================================================
# [ START ]
#     |
#     v
# +--------------------------------------------+
# | main()                                     |
# | * parse CLI args, run call loop            |
# +--------------------------------------------+
#     |
#     |----> _init_models()
#     |        * load Whisper, LLMs, FAISS
#     |
#     |----> load_greetings()
#     |        * fetch greeting for language
#     |
#     |----> _http_tts_sync()
#     |        * synthesize greeting audio
#     |
#     |----> _play_wav()
#     |        * play greeting through speakers
#     |
#     |----> _listen_turn()
#     |        * stream mic until utterance ready
#     |
#     |----> stt_sync()
#     |        * Whisper transcription
#     |
#     |----> _collapse_repetitions()
#     |        * remove repeated phrases
#     |
#     |----> _is_hallucination()
#     |        * discard Whisper artefacts
#     |
#     |----> _qwen_sync()
#     |        * LLM reply generation
#     |      OR
#     |----> _gemini_sync()
#     |        * LLM reply generation
#     |
#     |----> _humanize_text()
#     |        * normalize text for TTS
#     |
#     |----> _http_tts_sync()
#     |        * synthesize reply audio
#     |
#     |----> _play_wav()
#     |        * play reply, detect barge-in
#     |
#     v
# [ END ]
# ================================================================

import argparse
import io
import random
import sys
import threading
import time
import wave
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import numpy as np

# ── resolve project root so relative imports work from any CWD ───────────────
_HERE = Path(__file__).parent          # backend/
_ROOT = _HERE.parent                   # voice-ai-core/
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dotenv import load_dotenv
load_dotenv(_ROOT / ".env")

# ── project imports ───────────────────────────────────────────────────────────
from backend.core.config import LANGUAGE_CONFIG, BACKEND_ROOT
from backend.core.state import _m
from backend.core.persona import extract_agent_name, generate_greeting
from backend.audio.vad import AudioBuf
from backend.speech.stt_core import stt_sync
from backend.speech.stt.postprocessor import _collapse_repetitions, _is_hallucination
from backend.speech.tts_client import _http_tts_sync, _humanize_text, build_voice_registry
from backend.language.llm_core import _gemini_sync, _qwen_sync
from backend.core.greeting_loader import load_greetings
from backend.core.logger import setup_logger

logger = setup_logger("cli")

# ── audio constants ───────────────────────────────────────────────────────────
SR          = 16_000   # Whisper input sample rate (Hz)
CHUNK       = 1600     # mic frame size = 100 ms at 16 kHz
BARGE_RMS   = 0.04     # RMS threshold that counts as a barge-in frame
BARGE_N     = 4        # consecutive frames above threshold → interrupt


# ===========================================================================
# Model initialisation (mirrors app.py lifespan, no HTTP server required)
# ===========================================================================

def _init_models(llm_key: str) -> None:
    _t0 = time.perf_counter()
    logger.info("[START] init  at=%s", datetime.now().strftime("%H:%M:%S"))

    # ── Whisper STT ──────────────────────────────────────────────────────────
    logger.info("Loading Whisper STT…")
    from backend.speech.stt.transcriber import StreamingTranscriber
    _m["stt"] = StreamingTranscriber()
    logger.info("Whisper ready.")

    # ── Gemini (optional) ────────────────────────────────────────────────────
    if llm_key == "gemini":
        logger.info("Loading Gemini responder…")
        try:
            from backend.language.llm.gemini_responder import GeminiResponder
            _m["gemini"] = GeminiResponder()
            logger.info("Gemini ready.")
        except Exception as exc:
            logger.warning("Gemini unavailable: %s", exc)
            _m["gemini"] = None
    else:
        _m["gemini"] = None

    # ── Ollama / Qwen (optional) ─────────────────────────────────────────────
    if llm_key == "ollama":
        logger.info("Loading Ollama responder (qwen2.5:7b)…")
        try:
            from backend.language.llm.ollama_responder import OllamaResponder
            resp = OllamaResponder(model="qwen2.5:7b")
            if resp.health_check():
                _m["ollama"] = resp
                logger.info("Ollama ready.")
            else:
                _m["ollama"] = None
                logger.warning("Ollama not reachable — Gemini will be used as fallback")
                # Load Gemini as automatic fallback
                if _m.get("gemini") is None:
                    try:
                        from backend.language.llm.gemini_responder import GeminiResponder
                        _m["gemini"] = GeminiResponder()
                        logger.info("Gemini fallback ready.")
                    except Exception:
                        pass
        except Exception as exc:
            logger.warning("Ollama init failed: %s", exc)
            _m["ollama"] = None
    else:
        _m["ollama"] = None

    # ── FAISS long-term memory (optional) ────────────────────────────────────
    try:
        from backend.memory.vector_store import ConversationMemory
        _m["memory"] = ConversationMemory(
            index_path=str(BACKEND_ROOT / "faiss_index")
        )
        logger.info("FAISS memory ready.")
    except Exception as exc:
        logger.warning("FAISS unavailable: %s", exc)
        _m["memory"] = None

    # ── Company knowledge context ─────────────────────────────────────────────
    company_ctx = ""
    docs_dir = BACKEND_ROOT / "documents"
    if docs_dir.exists():
        for doc in sorted(docs_dir.glob("*.txt")):
            try:
                company_ctx += doc.read_text(encoding="utf-8") + "\n\n"
            except Exception:
                pass
    _m["company_context"] = company_ctx.strip()[:8000]
    if _m["company_context"]:
        logger.info("Company context loaded (%d chars).", len(_m["company_context"]))

    logger.info("[END]   init  elapsed=%.3fs", time.perf_counter() - _t0)


# ===========================================================================
# WAV helpers
# ===========================================================================

def _wav_bytes_to_array(wav_bytes: bytes) -> tuple[np.ndarray, int]:
    """Decode raw WAV bytes → (float32 mono array, sample_rate)."""
    with io.BytesIO(wav_bytes) as buf:
        with wave.open(buf, "rb") as wf:
            n_ch = wf.getnchannels()
            sr   = wf.getframerate()
            raw  = wf.readframes(wf.getnframes())
    pcm = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if n_ch > 1:
        pcm = pcm.reshape(-1, n_ch).mean(axis=1)
    return pcm, sr


# ===========================================================================
# Speaker playback with barge-in detection
# ===========================================================================

def _play_wav(wav_bytes: bytes, interrupted_out: threading.Event) -> bool:
    """
    Play WAV bytes through system speakers.
    While playing, the mic is monitored for barge-in energy spikes.
    Sets `interrupted_out` and returns True if the user interrupted.
    """
    try:
        import sounddevice as sd
    except ImportError:
        logger.error("sounddevice not installed — run: pip install sounddevice")
        return False

    if not wav_bytes:
        return False

    try:
        pcm, sr = _wav_bytes_to_array(wav_bytes)
    except Exception as exc:
        logger.error("WAV decode error: %s", exc)
        return False

    barge_count = [0]
    barge_event = threading.Event()

    def _mic_cb(indata, _frames, _time_info, _status):
        rms = float(np.sqrt(np.mean(indata[:, 0] ** 2)))
        if rms > BARGE_RMS:
            barge_count[0] += 1
            if barge_count[0] >= BARGE_N:
                barge_event.set()
        else:
            barge_count[0] = 0

    try:
        with sd.InputStream(
            samplerate=SR,
            channels=1,
            dtype="float32",
            blocksize=CHUNK,
            callback=_mic_cb,
        ):
            sd.play(pcm, sr)
            # Poll until playback finishes or barge-in detected
            while True:
                time.sleep(0.02)
                if barge_event.is_set():
                    sd.stop()
                    break
                try:
                    if not sd.get_stream().active:
                        break
                except Exception:
                    break
    except Exception as exc:
        logger.debug("Playback error: %s", exc)

    if barge_event.is_set():
        interrupted_out.set()
        return True
    return False


# ===========================================================================
# Microphone capture with adaptive VAD
# ===========================================================================

def _listen_turn(buf: AudioBuf) -> Optional[np.ndarray]:
    """
    Open mic, stream 100 ms frames into AudioBuf.
    Blocks until VAD detects a complete utterance (speech + silence gap).
    Returns the PCM float32 array or None on error.
    Max wait: 30 seconds.
    """
    try:
        import sounddevice as sd
    except ImportError:
        logger.error("sounddevice not installed — run: pip install sounddevice")
        return None

    result: list[Optional[np.ndarray]] = [None]
    done = threading.Event()

    def _cb(indata, frames, time_info, status):
        chunk = indata[:, 0].copy()
        buf.push(chunk)
        if buf.ready():
            result[0] = buf.flush()
            done.set()
            raise sd.CallbackStop()

    try:
        with sd.InputStream(
            samplerate=SR,
            channels=1,
            dtype="float32",
            blocksize=CHUNK,
            callback=_cb,
        ):
            done.wait(timeout=30.0)
    except Exception as exc:
        logger.debug("Listen stream error: %s", exc)

    return result[0]


# ===========================================================================
# CLI entry point
# ===========================================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Voice AI Core — real-time CLI (mic → STT → LLM → TTS → speaker)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m backend.main\n"
            "  python -m backend.main --lang hi --llm gemini\n"
            "  python -m backend.main --lang en --voice \"James (Professional Male)\"\n"
            "  python -m backend.main --list-voices\n"
        ),
    )
    parser.add_argument("--lang",        default="en",    help="BCP-47 language code (en, hi, ta, …)")
    parser.add_argument("--voice",       default="",      help="Voice display name (leave blank for default)")
    parser.add_argument("--llm",         default="ollama", choices=["ollama", "gemini"], help="LLM backend")
    parser.add_argument("--list-voices", action="store_true", help="Print all available voices and exit")
    args = parser.parse_args()

    # ── voice registry ────────────────────────────────────────────────────────
    registry = build_voice_registry()

    if args.list_voices:
        print("\nAvailable voices:\n")
        for code, voices in sorted(registry.items()):
            lang_name = LANGUAGE_CONFIG.get(code, {}).get("name", code)
            print(f"  [{code}] {lang_name}")
            for v in voices:
                print(f"      {v['name']}")
        print()
        return

    lang    = args.lang
    llm_key = args.llm

    # Resolve voice for chosen language
    lang_voices = registry.get(lang) or registry.get("en") or []
    if args.voice:
        voice_entry = next(
            (v for v in lang_voices if v["name"] == args.voice), None
        )
        if voice_entry is None:
            print(f"[WARN] Voice '{args.voice}' not found for lang={lang}, using default.")
            voice_entry = lang_voices[0] if lang_voices else None
    else:
        voice_entry = lang_voices[0] if lang_voices else None

    voice_stem = voice_entry["name"] if voice_entry else "Agent"
    agent_name = extract_agent_name(voice_stem)

    # ── initialise models ─────────────────────────────────────────────────────
    _init_models(llm_key)

    # ── greeting ──────────────────────────────────────────────────────────────
    _greetings   = load_greetings()
    raw_greeting = _greetings.get(lang) or generate_greeting(lang, agent_name)
    greeting_txt = raw_greeting.format(name=agent_name)

    print(f"\n{'='*62}")
    print(f"  Voice AI Core — CLI")
    print(f"  lang={lang}  llm={llm_key}  voice={voice_stem}")
    print(f"  Agent: {agent_name}")
    print(f"  Press Ctrl+C to end the call")
    print(f"{'='*62}\n")

    print(f"[Agent] {greeting_txt}")
    greeting_wav = _http_tts_sync(greeting_txt, lang, voice_stem)
    interrupted  = threading.Event()
    _play_wav(greeting_wav, interrupted)

    # ── choose LLM function ───────────────────────────────────────────────────
    # Fallback chain: ollama → gemini; gemini → ollama (if other missing)
    def _llm(history: List[dict]) -> str:
        if llm_key == "ollama" and _m.get("ollama") is not None:
            try:
                return _qwen_sync(history, lang, voice_stem)
            except Exception as exc:
                logger.warning("Ollama failed (%s) — trying Gemini fallback", exc)
        if _m.get("gemini") is not None:
            return _gemini_sync(history, lang, voice_stem)
        raise RuntimeError("No LLM available (both Ollama and Gemini unavailable)")

    # ── conversation loop ─────────────────────────────────────────────────────
    history: List[dict] = [{"role": "assistant", "text": greeting_txt}]
    buf = AudioBuf()

    try:
        while True:
            print("\n[Listening…]")
            interrupted.clear()

            pcm = _listen_turn(buf)

            if pcm is None:
                print("[timeout — no speech detected, try again]")
                continue

            # STT
            user_text = stt_sync(pcm, lang)
            if not user_text:
                print("[silence / noise — skipped]")
                continue
            user_text = _collapse_repetitions(user_text)
            if _is_hallucination(user_text):
                logger.debug("Hallucination filtered: %r", user_text)
                print("[hallucination filtered]")
                continue

            print(f"\n[You]   {user_text}")
            history.append({"role": "user", "text": user_text})

            # LLM
            print("[Thinking…]", end="", flush=True)
            t0 = time.perf_counter()
            try:
                ai_text = _llm(list(history))
            except Exception as exc:
                logger.error("LLM error: %s", exc)
                canned = LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG["en"])["canned_error"]
                print(f"\r[Agent] {canned}  ")
                canned_wav = _http_tts_sync(canned, lang, voice_stem)
                _play_wav(canned_wav, interrupted)
                continue

            elapsed = time.perf_counter() - t0
            print(f"\r[Agent] {ai_text}  ({elapsed:.1f}s LLM)")
            history.append({"role": "assistant", "text": ai_text})

            # TTS → playback (with barge-in detection)
            tts_text  = _humanize_text(ai_text, lang)
            wav_bytes = _http_tts_sync(tts_text, lang, voice_stem)

            interrupted.clear()
            was_interrupted = _play_wav(wav_bytes, interrupted)

            if was_interrupted:
                barge_phrases = LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG["en"])["barge_phrases"]
                pivot = random.choice(barge_phrases)
                print(f"[Barge-in → pivot] {pivot}")
                history.append({"role": "assistant", "text": pivot})
                pivot_wav = _http_tts_sync(pivot, lang, voice_stem)
                interrupted.clear()
                _play_wav(pivot_wav, interrupted)

            # Persist interaction to FAISS (best-effort)
            if _m.get("memory"):
                try:
                    _m["memory"].save_interaction(user_text, ai_text, lang)
                except Exception as exc:
                    logger.debug("FAISS persist error: %s", exc)

    except KeyboardInterrupt:
        print("\n\n[Call ended]")

        # Optional: print call summary
        if len(history) > 2:
            try:
                from backend.memory.summarization.call_summarizer import summarize_call
                print("\n[Generating call summary…]")
                summary = summarize_call(history, lang)
                print(f"\n[Summary]\n{summary}\n")
            except Exception:
                pass


if __name__ == "__main__":
    main()
