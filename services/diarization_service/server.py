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
#    |----> torch.cuda.is_available()
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
#    |----> pipeline()
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
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pyannote.audio import Pipeline
import torch

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
# Flow:
#   startup event
#     ||
#   torch.cuda check
#     ||
#   device set; pipeline stays None
# --------------------------------------------------
@app.on_event("startup")
def load_model():
    global pipeline
    print("🔹 [Microservice] Loading Pyannote Pipeline...")

    # Use CPU by default for safety, or 'cuda' if available
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"🔹 [Microservice] Running on: {device}")

    try:
        # We load the pipeline logic but wait for the first request's token
        # OR hardcode the token here if you prefer.
        # Ideally, we load it here to save time.
        # NOTE: You must export HF_TOKEN in your env or pass it.
        # For simplicity in this microservice, let's assume valid token env var or passing it.
        pass
    except Exception as e:
        print(f"❌ [Microservice] Model Init Error: {e}")

# --------------------------------------------------
# Run pyannote speaker diarization on audio file, return speaker segments
# Flow:
#   AudioRequest (file_path, hf_token)
#     ||
#   Lazy-load pyannote Pipeline
#     ||
#   Run inference
#     ||
#   Return [{start,end,speaker}]
# --------------------------------------------------
@app.post("/diarize")
async def diarize_audio(request: AudioRequest):
    global pipeline

    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk.")

    try:
        # Lazy loading / Auth check
        if pipeline is None:
            print("🔹 [Microservice] Initializing Pipeline with Token...")
            pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=request.hf_token
            )
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            pipeline.to(device)

        # Run Inference
        print(f"🔹 [Microservice] Processing: {request.file_path}")
        diarization = pipeline(request.file_path)

        # Format Response
        segments = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "start": turn.start,
                "end": turn.end,
                "speaker": speaker
            })

        return {"segments": segments}

    except Exception as e:
        print(f"❌ [Microservice] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Run on Port 8001 to avoid conflict with Main Backend (8000)
    uvicorn.run(app, host="127.0.0.1", port=8001)
