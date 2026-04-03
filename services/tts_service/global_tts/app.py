# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------+
# | startup_event()               |
# | * load Parler TTS             |
# +-------------------------------+
#     |
#     |----> <TTSEngine> -> load()
#     |        * init Parler model
#     |
#     v
# +-------------------------------+
# | generate()                    |
# | * POST TTS request            |
# +-------------------------------+
#     |
#     |----> <PersonaManager> -> guard()
#     |        * apply voice guardrail
#     |
#     |----> <TTSEngine> -> generate()
#     |        * Parler TTS inference
#     |
#     |----> <HumanVoiceSculptor> -> process()
#     |        * audio loudness DSP
#     |
#     |----> _next_filename()
#     |        * resolve rec name
#     |
#     v
# +-------------------------------+
# | list_voices()                 |
# | * GET voice list              |
# +-------------------------------+
#     |
#     v
# +-------------------------------+
# | list_languages()              |
# | * GET supported languages     |
# +-------------------------------+
#     |
#     v
# +-------------------------------+
# | list_recordings()             |
# | * GET file metadata           |
# +-------------------------------+
#     |
#     |----> _get_recordings_meta()
#     |        * build file stats
#     |
#     v
# [ END ]
# ================================================================

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import httpx
import numpy as np
import soundfile as sf
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

# ── Shared logging setup ──────────────────────────────────────────────────────
_SERVICES_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)  # global_tts -> tts_service -> services
if _SERVICES_DIR not in sys.path:
    sys.path.insert(0, _SERVICES_DIR)

from log_utils import setup_logger, log_execution   # noqa: E402

logger = setup_logger("global_tts")

MODEL_NAME = os.getenv("MODEL_NAME", "parler-tts/parler-tts-mini-v1.1")
DEVICE = os.getenv("DEVICE", "cuda")
MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "1000"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "outputs/recordings"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 24000
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

from core.tts_engine import TTSEngine
from core.voice_sculptor import HumanVoiceSculptor

engine = TTSEngine(model_name=MODEL_NAME, device=DEVICE)
sculptor = HumanVoiceSculptor()

_generation_lock = asyncio.Lock()
_model_loading   = True
_cancel_flag     = False   # set by /cancel; checked before each new generation

app = FastAPI(title="human_tts", version="1.0.0")


@app.on_event("startup")
@log_execution
async def startup_event():
    global _model_loading
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, engine.load)
    except Exception as exc:
        logger.error("Model load failed: %s", exc)
    finally:
        _model_loading = False


def _next_filename() -> str:
    existing = list(OUTPUT_DIR.glob("rec*.wav"))
    if not existing:
        return "rec1.wav"
    nums = []
    for f in existing:
        stem = f.stem
        try:
            nums.append(int(stem[3:]))
        except ValueError:
            pass
    return f"rec{max(nums) + 1}.wav" if nums else "rec1.wav"


def _get_recordings_meta() -> list[dict]:
    files = sorted(
        OUTPUT_DIR.glob("rec*.wav"),
        key=lambda f: (
            int(f.stem[3:]) if f.stem[3:].isdigit() else 0
        ),
    )
    results = []
    for f in files:
        stat = f.stat()
        try:
            with sf.SoundFile(str(f)) as sf_f:
                duration = len(sf_f) / sf_f.samplerate
        except Exception:
            duration = 0.0
        results.append(
            {
                "filename": f.name,
                "url": f"/audio/{f.name}",
                "size_bytes": stat.st_size,
                "duration_seconds": round(duration, 2),
                "created_at": stat.st_mtime,
            }
        )
    return results


class GenerateRequest(BaseModel):
    text: str
    emotion: str = "neutral"
    voice_name: str = "Emma (Warm Female)"
    language: str = "English"
    # Optional identity-safe behavior overrides (from Ollama summarize endpoint)
    custom_style: Optional[str] = None
    custom_speed: Optional[str] = None


class SummarizePersonaRequest(BaseModel):
    raw_prompt: str                 # user's free-form text (any language)
    tts_type: str = "global"        # "global" or "indic"


class GenerateResponse(BaseModel):
    filename: str
    url: str
    previous_url: str | None
    emotion: str
    voice_name: str
    language: str
    duration_seconds: float
    generation_time_seconds: float


@app.get("/health")
@log_execution(rate_limit=60)
async def health():
    if _model_loading:
        status = "loading"
    elif engine.ready:
        status = "ready"
    else:
        status = "error"
    return {
        "status": status,
        "model": MODEL_NAME,
        "device": engine.device,
    }


@app.post("/cancel")
async def cancel_generation():
    """Signal the TTS service to skip the next queued generation (barge-in support)."""
    global _cancel_flag
    _cancel_flag = True
    return {"status": "cancel_requested"}


@app.post("/generate", response_model=GenerateResponse)
@log_execution
async def generate(req: GenerateRequest):
    global _cancel_flag
    if _model_loading:
        raise HTTPException(status_code=503, detail="Model is still loading, please wait.")
    if not engine.ready:
        raise HTTPException(status_code=503, detail="Model failed to load. Check server logs.")

    if _generation_lock.locked():
        raise HTTPException(status_code=429, detail="Generation in progress, please wait.")

    # Barge-in: skip this generation if a cancel was requested while we were waiting
    if _cancel_flag:
        _cancel_flag = False
        raise HTTPException(status_code=503, detail="Generation cancelled by barge-in.")

    from core.presets import VOICES, EMOTION_LABELS, LANGUAGES
    valid_emotions = EMOTION_LABELS
    if req.emotion not in valid_emotions:
        raise HTTPException(status_code=400, detail=f"emotion must be one of {valid_emotions}")
    if req.voice_name not in VOICES:
        raise HTTPException(status_code=400, detail=f"Unknown voice: {req.voice_name}")
    if req.language not in LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unknown language: {req.language}")

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text cannot be empty")

    async with _generation_lock:
        t0 = time.time()
        loop = asyncio.get_event_loop()

        logger.info(
            "Generate | voice=%s  emotion=%s  lang=%s  text=%r",
            req.voice_name, req.emotion, req.language, text,
        )

        raw_audio: np.ndarray = await loop.run_in_executor(
            None,
            lambda: engine.generate(
                text=text,
                voice_name=req.voice_name,
                emotion=req.emotion,
                language=req.language,
                max_length=MAX_TEXT_LENGTH,
                custom_style=req.custom_style or None,
                custom_speed=req.custom_speed or None,
            ),
        )
        logger.info("TTS done  | raw audio %.2fs", len(raw_audio) / getattr(engine, "sample_rate", SAMPLE_RATE))

        sr = getattr(engine, "sample_rate", SAMPLE_RATE)
        processed: np.ndarray = await loop.run_in_executor(
            None,
            lambda: sculptor.process(raw_audio, req.emotion, sr),
        )
        logger.info("DSP done  | processed %.2fs", len(processed) / sr)

        gen_time = round(time.time() - t0, 2)
        sr = getattr(engine, "sample_rate", SAMPLE_RATE)
        duration = round(len(processed) / sr, 2)

        existing = sorted(
            OUTPUT_DIR.glob("rec*.wav"),
            key=lambda f: int(f.stem[3:]) if f.stem[3:].isdigit() else 0,
        )
        previous_url = f"/audio/{existing[-1].name}" if existing else None

        filename = _next_filename()
        out_path = OUTPUT_DIR / filename
        sf.write(str(out_path), processed, sr, subtype="PCM_16")

        logger.info("Saved %s  (%.2fs gen, %.2fs audio)", filename, gen_time, duration)

        return GenerateResponse(
            filename=filename,
            url=f"/audio/{filename}",
            previous_url=previous_url,
            emotion=req.emotion,
            voice_name=req.voice_name,
            language=req.language,
            duration_seconds=duration,
            generation_time_seconds=gen_time,
        )


@app.get("/voices")
async def list_voices():
    from core.presets import VOICES
    return {"voices": list(VOICES.keys())}


@app.get("/languages")
async def list_languages():
    from core.presets import LANGUAGES
    return {
        name: {
            "native": data["native"],
            "voices": data["voices"],
        }
        for name, data in LANGUAGES.items()
    }


@app.get("/recordings")
async def list_recordings():
    return {"recordings": _get_recordings_meta()}


@app.delete("/recordings")
async def delete_recordings():
    count = 0
    for f in OUTPUT_DIR.glob("rec*.wav"):
        f.unlink()
        count += 1
    return {"deleted": count}


@app.get("/audio/{filename}")
async def serve_audio(filename: str):
    path = OUTPUT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), media_type="audio/wav")


_OLLAMA_SYSTEM = (
    "You are a prompt engineer for Parler TTS. "
    "Translate the user's input to English. "
    "Extract the emotional style and the speaking speed. "
    "Return ONLY a JSON object with keys 'style' and 'speed_desc'. "
    "DO NOT include any speaker names or extra text. "
    "Examples: {\"style\": \"warm and cheerful\", \"speed_desc\": \"at a moderate pace\"}"
)

_OLLAMA_SYSTEM_INDIC = (
    "You are a prompt engineer for Indic Parler TTS (English-conditioned). "
    "Translate the user's input to plain English. "
    "Extract a short emotional style phrase and a speaking speed phrase. "
    "Return ONLY a JSON object with keys 'style' and 'speed_desc'. "
    "Keep phrases under 8 words each. No speaker names. "
    "Examples: {\"style\": \"gentle and expressive\", \"speed_desc\": \"slowly\"}"
)


@app.post("/api/avatar/summarize-persona")
@log_execution
async def summarize_persona(req: SummarizePersonaRequest):
    """
    Send user's free-form behavior description to local Ollama.
    Returns style + speed_desc safe to inject into Parler TTS prompt.
    Voice identity (speaker name + pitch) is NOT touched here.
    """
    system_prompt = _OLLAMA_SYSTEM_INDIC if req.tts_type == "indic" else _OLLAMA_SYSTEM
    payload = {
        "model": OLLAMA_MODEL,
        "system": system_prompt,
        "prompt": req.raw_prompt,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
        resp.raise_for_status()
        raw = resp.json().get("response", "")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Ollama timed out. Try a lighter model or shorter prompt.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ollama error: {exc}")

    # Extract JSON from the response (model may wrap it in markdown)
    try:
        start = raw.index("{")
        end   = raw.rindex("}") + 1
        data  = json.loads(raw[start:end])
        style      = str(data.get("style", "clear and professional"))
        speed_desc = str(data.get("speed_desc", "at a moderate pace"))
    except (ValueError, KeyError, json.JSONDecodeError):
        logger.warning("Ollama returned non-JSON: %r — using fallback", raw)
        style, speed_desc = "clear and professional", "at a moderate pace"

    return {"style": style, "speed_desc": speed_desc, "raw_ollama": raw}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
