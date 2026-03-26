# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | _build_registry()                |
# | * scan ONNX models on disk       |
# +----------------------------------+
#     |
#     |----> <_MODELS_DIR> -> rglob()   * find all .onnx files
#     |
#     |----> apply _LANG_FALLBACK       * mr shares hi model
#     |
#     |----> return registry dict       * lang to voice list
#     |
#     v
# +----------------------------------+
# | tts_voices()                     |
# | * GET /tts/voices voice registry |
# +----------------------------------+
#     |
#     |----> _build_registry()          * scan ONNX models
#     |
#     |----> return dict                * lang to voice names
#     |
#     v
# +----------------------------------+
# | tts_generate()                   |
# | * POST /tts/generate WAV bytes   |
# +----------------------------------+
#     |
#     |----> <tts_service> -> generate_speech()  * run Piper subprocess
#     |           |
#     |           |----> <voice_mapper> -> get_model_key()  * lang to model key
#     |           |
#     |           |----> _resolve_model()                   * key to onnx path
#     |           |
#     |           |----> <loop> -> run_in_executor()        * offload to thread pool
#     |                       |
#     |                       |----> _piper_sync()          * blocking subprocess call
#     |
#     |----> return Response()          * stream audio/wav bytes
#
# ================================================================

from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from ..services.tts_service import generate_speech

router = APIRouter(tags=["tts"])

_MODELS_DIR = (
    Path(__file__).parent.parent.parent / "backend" / "tts" / "piper" / "models"
)
_LANG_FALLBACK = {"mr": "hi"}


def _build_registry() -> dict:
    registry: dict = {}
    if _MODELS_DIR.exists():
        for onnx in sorted(_MODELS_DIR.rglob("*.onnx")):
            stem = onnx.stem
            lang_code = stem.split("_")[0].lower()
            registry.setdefault(lang_code, [])
            if not any(v["name"] == stem for v in registry[lang_code]):
                registry[lang_code].append(
                    {"name": stem, "model_path": str(onnx)}
                )
    for lang_code, src_lang in _LANG_FALLBACK.items():
        if lang_code not in registry and src_lang in registry:
            registry[lang_code] = list(registry[src_lang])
    return registry


@router.get("/voices")
def tts_voices():
    return _build_registry()


class TTSRequest(BaseModel):
    text: str
    language: Optional[str] = "English"
    model_path: Optional[str] = None


@router.post("/generate")
async def tts_generate(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=422, detail="text is required")
    try:
        wav = await generate_speech(req.text, req.language or "English", req.model_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"TTS error: {exc}")
    return Response(content=wav, media_type="audio/wav")
