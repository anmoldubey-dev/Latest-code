# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#    |
#    v
# +-------------------------------+
# | load_model()                  |
# | * detect device at startup    |
# +-------------------------------+
#    |
#    |----> is_available()
#    |        * pick CUDA or CPU device
#    |
#    v
# +-------------------------------+
# | diarize_audio()               |
# | * POST /diarize diarization   |
# +-------------------------------+
#    |
#    |----> <Pipeline> -> from_pretrained()
#    |        * lazy-load pyannote pipeline
#    |
#    |----> <Pipeline> -> __call__()
#    |        * run speaker diarization
#    |
#    |----> itertracks()
#    |        * extract speaker segments
#    |
#    v
# [ RETURN list of start, end, speaker dicts ]
#
# ================================================================

import os
import sys

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pyannote.audio import Pipeline
import torch

# ── Shared logging setup ──────────────────────────────────────────────────────
_SERVICES_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SERVICES_DIR not in sys.path:
    sys.path.insert(0, _SERVICES_DIR)

from log_utils import setup_logger, log_execution   # noqa: E402

logger = setup_logger("diarization")

# 1. Initialize App
app = FastAPI(title="Diarization Microservice")

# 2. Global Model Storage
pipeline = None


# --------------------------------------------------
# Pydantic request model for /diarize endpoint (file_path + hf_token)
# --------------------------------------------------
class AudioRequest(BaseModel):
    file_path: str
    hf_token: str  # Pass token securely


# --------------------------------------------------
# Detect compute device at startup; pipeline loaded lazily on first request
# --------------------------------------------------
@app.on_event("startup")
@log_execution
def load_model():
    global pipeline
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("[Diarization] startup  device=%s  pipeline=lazy", device)


# --------------------------------------------------
# Run pyannote speaker diarization on audio file, return speaker segments
# --------------------------------------------------
@app.post("/diarize")
@log_execution
async def diarize_audio(request: AudioRequest):
    global pipeline

    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk.")

    try:
        if pipeline is None:
            logger.info("[Diarization] lazy-loading pipeline with provided token")
            pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=request.hf_token
            )
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            pipeline.to(device)

        logger.info("[Diarization] processing  file=%s", request.file_path)
        diarization = pipeline(request.file_path)

        segments = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "start":   turn.start,
                "end":     turn.end,
                "speaker": speaker,
            })

        logger.info("[Diarization] done  segments=%d", len(segments))
        return {"segments": segments}

    except Exception as exc:
        logger.exception("[Diarization] inference error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)
