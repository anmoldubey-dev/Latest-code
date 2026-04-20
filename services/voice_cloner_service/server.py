"""
Voice Cloner Server -- Chatterbox TTS
=====================================
FastAPI backend for zero-shot voice cloning.

Run from voice-cloner/ with the local venv:
    .venv/Scripts/activate.bat
    python -m uvicorn server:app --port 8005 --reload

API:
    GET  /health      - service status
    POST /generate    - clone voice and synthesize speech
    POST /preview     - validate reference audio duration only

# ===========================================================================
# ASCII EXECUTION FLOW
# ===========================================================================
#
# [ START ]
#     |
#     v
# +----------------------+
# | health()             |
# | * return device info |
# +----------------------+
#     |
#     v
# +----------------------+
# | preview()            |
# | * validate duration  |
# +----------------------+
#     |
#     |----> _wav_duration()
#     |        * compute audio seconds
#     |
#     v
# +-------------------------+
# | generate()              |
# | * clone voice to WAV    |
# +-------------------------+
#     |
#     |----> _wav_duration()
#     |        * check input length
#     |
#     |----> _load()
#     |        * lazy-load model
#     |
#     |----> _device()
#     |        * pick CUDA or CPU
#     |
#     |----> <ChatterboxTTS> -> from_local()
#     |        * init from filesystem
#     |
#     |----> <ChatterboxTTS> -> generate()
#     |        * zero-shot inference
#     |
#     |----> _tensor_to_wav_bytes()
#     |        * save to memory
#     |
#     v
# [ END ]
#
# ===========================================================================
"""

import io
import os
import sys
import tempfile
from pathlib import Path

import torch
import torchaudio
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# ── Shared logging setup ──────────────────────────────────────────────────────
_SERVICES_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SERVICES_DIR not in sys.path:
    sys.path.insert(0, _SERVICES_DIR)

from log_utils import setup_logger, log_execution   # noqa: E402

logger = setup_logger("voice_cloner")

app = FastAPI(title="Voice Cloner", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Model paths — use local HF cache, never re-download
# ---------------------------------------------------------------------------
_PROJ     = Path(__file__).parent.parent.parent
_LOCAL    = _PROJ / "models"
_HF_CACHE = Path(os.path.expanduser("~/.cache/huggingface/hub"))

def _resolve_model(local_name: str, hf_folder: str, snapshot: str) -> Path:
    p = _LOCAL / local_name
    if p.is_dir():
        return p
    p = _HF_CACHE / hf_folder / "snapshots" / snapshot
    return p  # may not exist — chatterbox.from_pretrained will download

_MODEL_DIRS = {
    "standard":     _resolve_model("chatterbox",       "models--ResembleAI--chatterbox",       "05e904af2b5c7f8e482687a9d7336c5c824467d9"),
    "turbo":        _resolve_model("chatterbox-turbo",  "models--ResembleAI--chatterbox-turbo", "749d1c1a46eb10492095d68fbcf55691ccf137cd"),
    "multilingual": _resolve_model("chatterbox",        "models--ResembleAI--chatterbox",       "05e904af2b5c7f8e482687a9d7336c5c824467d9"),
}

# ---------------------------------------------------------------------------
# Lazy model cache — loaded on first request, kept in memory after
# ---------------------------------------------------------------------------
_models: dict = {}


def _device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def _load(model_type: str = "standard"):
    if model_type in _models:
        return _models[model_type]

    device = _device()
    ckpt_dir = _MODEL_DIRS.get(model_type)
    if ckpt_dir and ckpt_dir.exists():
        logger.info("Loading model=%s from local cache  device=%s", model_type, device)
    else:
        logger.warning("Local cache not found for model=%s, falling back to HuggingFace download", model_type)
        ckpt_dir = None

    if model_type == "turbo":
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        if ckpt_dir:
            _models[model_type] = ChatterboxTurboTTS.from_local(str(ckpt_dir), device=device)
        else:
            _models[model_type] = ChatterboxTurboTTS.from_pretrained(device=device)
    elif model_type == "multilingual":
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        if ckpt_dir:
            _models[model_type] = ChatterboxMultilingualTTS.from_local(str(ckpt_dir), device)
        else:
            _models[model_type] = ChatterboxMultilingualTTS.from_pretrained(device=device)
    else:
        from chatterbox.tts import ChatterboxTTS
        if ckpt_dir:
            _models[model_type] = ChatterboxTTS.from_local(str(ckpt_dir), device=device)
        else:
            _models[model_type] = ChatterboxTTS.from_pretrained(device=device)

    logger.info("Model ready: %s", model_type)
    return _models[model_type]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _wav_duration(path: str) -> float:
    """Return duration in seconds of a WAV/MP3/etc file using torchaudio."""
    info = torchaudio.info(path)
    return info.num_frames / info.sample_rate


def _tensor_to_wav_bytes(wav: torch.Tensor, sr: int = 24_000) -> bytes:
    if wav.dim() == 1:
        wav = wav.unsqueeze(0)
    buf = io.BytesIO()
    torchaudio.save(buf, wav.cpu().float(), sr, format="wav")
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
@log_execution(rate_limit=60)
async def health():
    from chatterbox.mtl_tts import SUPPORTED_LANGUAGES
    return {
        "status":             "ok",
        "device":             _device(),
        "cuda_available":     torch.cuda.is_available(),
        "models_loaded":      list(_models.keys()),
        "supported_languages": SUPPORTED_LANGUAGES,
    }


@app.post("/preview")
@log_execution
async def preview(reference: UploadFile = File(...)):
    """Validate reference audio and return its duration — no generation."""
    suffix = Path(reference.filename or "ref.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await reference.read())
        tmp_path = tmp.name
    try:
        dur = _wav_duration(tmp_path)
        if dur < 10.0:
            raise HTTPException(status_code=422, detail=f"Audio too short ({dur:.1f}s). Minimum is 10 seconds.")
        if dur > 60.0:
            raise HTTPException(status_code=422, detail=f"Audio too long ({dur:.1f}s). Maximum is 60 seconds.")
        return {"duration": round(dur, 2), "valid": True}
    finally:
        os.unlink(tmp_path)


@app.post("/generate")
@log_execution
async def generate(
    reference:   UploadFile = File(...,   description="Reference audio 10–60 s"),
    text:        str        = Form(...,   description="Text to synthesize"),
    model:       str        = Form("standard", description="standard | turbo | multilingual"),
    exaggeration: float     = Form(0.5,  description="Emotion 0.0–1.0 (standard/multilingual only)"),
    cfg_weight:  float      = Form(0.5,  description="CFG strength 0.0–1.0 (standard/multilingual only)"),
    language:    str        = Form("en", description="Language code for multilingual model (e.g. en, fr, ja)"),
):
    # ── Validation ──────────────────────────────────────────────────────────
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    if len(text) > 500:
        raise HTTPException(status_code=400, detail="Text too long (max 500 characters).")
    if model not in ("standard", "turbo", "multilingual"):
        raise HTTPException(status_code=400, detail="Model must be 'standard', 'turbo', or 'multilingual'.")

    suffix = Path(reference.filename or "ref.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await reference.read())
        tmp_path = tmp.name

    try:
        # ── Duration check ───────────────────────────────────────────────────
        dur = _wav_duration(tmp_path)
        if dur < 10.0:
            raise HTTPException(status_code=422, detail=f"Reference audio too short ({dur:.1f}s). Need 10–60 s.")
        if dur > 60.0:
            raise HTTPException(status_code=422, detail=f"Reference audio too long ({dur:.1f}s). Max 60 s.")

        # ── Generate ─────────────────────────────────────────────────────────
        tts_model = _load(model)
        logger.info("Generating  model=%s  lang=%s  dur=%.1fs  text=%r", model, language, dur, text[:60])

        if model == "turbo":
            wav = tts_model.generate(text=text, audio_prompt_path=tmp_path)
        elif model == "multilingual":
            from chatterbox.mtl_tts import SUPPORTED_LANGUAGES
            if language not in SUPPORTED_LANGUAGES:
                raise HTTPException(status_code=400, detail=f"Unsupported language '{language}'. Supported: {', '.join(SUPPORTED_LANGUAGES)}")
            wav = tts_model.generate(
                text=text,
                language_id=language,
                audio_prompt_path=tmp_path,
                exaggeration=exaggeration,
                cfg_weight=cfg_weight,
            )
        else:
            wav = tts_model.generate(
                text=text,
                audio_prompt_path=tmp_path,
                exaggeration=exaggeration,
                cfg_weight=cfg_weight,
            )

        wav_bytes = _tensor_to_wav_bytes(wav, sr=24_000)
        logger.info("Done  output_bytes=%d", len(wav_bytes))

        return StreamingResponse(
            io.BytesIO(wav_bytes),
            media_type="audio/wav",
            headers={"Content-Disposition": 'attachment; filename="cloned.wav"'},
        )

    finally:
        os.unlink(tmp_path)
