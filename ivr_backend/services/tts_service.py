# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | _resolve_model()                 |
# | * model key to onnx path         |
# +----------------------------------+
#     |
#     |----> get()
#     |        * lookup by model key
#     |
#     |----> glob()
#     |        * fallback scan common/
#     |
#     v
# +----------------------------------+
# | _piper_sync()                    |
# | * blocking Piper subprocess call |
# +----------------------------------+
#     |
#     |----> <NamedTemporaryFile> -> __init__()
#     |        * create temp WAV file
#     |
#     |----> run()
#     |        * invoke piper subprocess
#     |
#     |----> open()
#     |        * read WAV bytes
#     |
#     |----> unlink()
#     |        * delete temp file
#     |
#     v
# +----------------------------------+
# | generate_speech()                |
# | * async TTS entry point          |
# +----------------------------------+
#     |
#     |----> get_model_key()
#     |        * language to model key
#     |
#     |----> _resolve_model()
#     |        * key to onnx path
#     |
#     |----> run_in_executor()
#     |        * offload _piper_sync() to thread
#
# ================================================================

import asyncio
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from .voice_mapper import get_model_key

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).parent.parent.parent
_PIPER_EXE    = str(_PROJECT_ROOT / "backend" / "tts" / "piper" / "piper.exe")
_MODELS_DIR   = _PROJECT_ROOT / "backend" / "tts" / "piper" / "models"

_VOICE_MODELS: dict[str, str] = {
    "en": str(_MODELS_DIR / "en"     / "en_US-lessac-medium.onnx"),
    "hi": str(_MODELS_DIR / "hi"     / "hi_IN-priyamvada-medium.onnx"),
    "es": str(_MODELS_DIR / "common" / "es_MX-claude-high.onnx"),
    "fr": str(_MODELS_DIR / "common" / "fr_FR-siwis-medium.onnx"),
    "ne": str(_MODELS_DIR / "common" / "ne_NP-chitwan-medium.onnx"),
    "te": str(_MODELS_DIR / "common" / "te_IN-padmavathi-medium.onnx"),
    "ml": str(_MODELS_DIR / "common" / "ml_IN-meera-medium.onnx"),
    "ru": str(_MODELS_DIR / "common" / "ru_RU-irina-medium.onnx"),
    "ar": str(_MODELS_DIR / "common" / "ar_JO-kareem-medium.onnx"),
    "zh": str(_MODELS_DIR / "common" / "zh_CN-huayan-medium.onnx"),
}


def _resolve_model(model_key: str) -> str:
    path = _VOICE_MODELS.get(model_key, _VOICE_MODELS["en"])
    if not os.path.exists(path):
        common = _MODELS_DIR / "common"
        if common.exists():
            for f in common.glob(f"{model_key}_*.onnx"):
                return str(f)
        return _VOICE_MODELS["en"]
    return path


def _piper_sync(text: str, model_path: str) -> bytes:
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    try:
        res = subprocess.run(
            [
                _PIPER_EXE,
                "--model",            model_path,
                "--output_file",      tmp.name,
                "--noise_scale",      "0.667",
                "--noise_w",          "0.8",
                "--length_scale",     "1.0",
                "--sentence_silence", "0.1",
                "-q",
            ],
            input=text.encode("utf-8"),
            capture_output=True,
        )
        if res.returncode != 0:
            err = res.stderr.decode("utf-8", errors="replace").strip()
            logger.error("[tts_service] piper failed  model=%s  err=%s", model_path, err)
            raise RuntimeError(err)
        with open(tmp.name, "rb") as fh:
            wav = fh.read()
        logger.debug("[tts_service] piper done  model=%s  bytes=%d", model_path, len(wav))
        return wav
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


async def generate_speech(
    text: str,
    language: str = "English",
    model_path: Optional[str] = None,
) -> bytes:
    if model_path and os.path.exists(model_path):
        resolved = model_path
    else:
        model_key = get_model_key(language)
        resolved  = _resolve_model(model_key)
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _piper_sync, text.strip(), resolved)
