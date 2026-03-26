# ================================================================
# EXECUTION FLOW DIAGRAM
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | lifespan()                       |
# | * init all models at startup     |
# +----------------------------------+
#     |
#     |----> <AudioTranscriber> -> __init__()
#     |        * load Whisper STT model
#     |
#     |----> <GeminiResponder> -> __init__()
#     |        * init Gemini Flash client
#     |
#     |----> <ConversationMemory> -> __init__()
#     |        * load or create FAISS index
#     |
#     |----> build_voice_registry()
#     |        * build static voice registry
#     |
#     v
# +----------------------------------+
# | ui()                             |
# | * serve Jinja2 HTML frontend     |
# +----------------------------------+
#     |
#     v
# +----------------------------------+
# | list_assets()                    |
# | * list WAV files in assets dir   |
# +----------------------------------+
#     |
#     v
# +----------------------------------+
# | process_audio()                  |
# | * run full AI pipeline POST      |
# +----------------------------------+
#     |
#     |----> <AudioTranscriber> -> transcribe()
#     |        * convert speech to text
#     |
#     |----> get_remote_diarization()
#     |        * POST audio path to port 8001
#     |
#     |----> merge_transcription_and_diarization()
#     |        * align speakers with transcript
#     |
#     |----> <GeminiResponder> -> generate_response()
#     |        * generate AI reply via Gemini
#     |
#     |----> <ConversationMemory> -> save_interaction()
#     |        * persist turn to FAISS index
#     |
#     |----> tts()
#     |        * HTTP synthesize reply to WAV
#     |
#     v
# [ RETURN transcript, ai_response, audio_url ]
#
# ================================================================

import os
import time
import uuid
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import requests
from dotenv import load_dotenv

from backend.stt.transcriber import AudioTranscriber
from backend.llm.gemini_responder import GeminiResponder
from backend.memory.vector_store import ConversationMemory
from backend.services.merger import merge_transcription_and_diarization
from backend.core.tts import tts as tts_synthesize, build_voice_registry

load_dotenv()
ASSETS_DIR = "assets"

DIARIZATION_URL = "http://127.0.0.1:8001/diarize"
HF_TOKEN = os.getenv("HF_TOKEN")

models = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🔹 [Startup] Loading Models...")
    start_time = time.time()

    models["stt"] = AudioTranscriber(model_size="small", device="cpu")

    models["llm"] = GeminiResponder()

    models["memory"] = ConversationMemory(index_path="backend/faiss_index")

    models["voice_registry"] = build_voice_registry()

    print(f"✅ [Startup] All systems ready in {time.time() - start_time:.2f}s")
    yield
    print("🔻 [Shutdown] Cleaning up...")
    models.clear()

app = FastAPI(lifespan=lifespan, title="Voice AI Backend")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
templates = Jinja2Templates(directory="templates")

class AudioRequest(BaseModel):
    filename: str

def get_remote_diarization(file_path):
    try:
        response = requests.post(
            DIARIZATION_URL,
            json={"file_path": os.path.abspath(file_path), "hf_token": HF_TOKEN},
            timeout=5
        )
        if response.status_code == 200:
            return response.json().get("segments", [])
    except Exception:
        pass
    return []

@app.get("/")
async def ui(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/list-assets")
async def list_assets():
    files = [f for f in os.listdir(ASSETS_DIR) if f.endswith(".wav") and "response" not in f]
    return {"files": files}

@app.post("/process-audio")
async def process_audio(req: AudioRequest):
    start_total = time.time()
    input_path = os.path.join(ASSETS_DIR, req.filename)

    if not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        print(f"🎤 Processing {req.filename}...")
        stt_res = models["stt"].transcribe(input_path)

        speakers = get_remote_diarization(input_path)
        if not speakers: speakers = [{"start": 0.0, "end": 9999.0, "speaker": "User"}]

        merged_log = merge_transcription_and_diarization(stt_res["segments"], speakers)
        full_text = " ".join([m["text"] for m in merged_log])

        ai_reply = models["llm"].generate_response(merged_log, stt_res["language"])

        full_convo = "\n".join([f"[{m['speaker']}]: {m['text']}" for m in merged_log])
        models["memory"].save_interaction(full_convo, ai_reply, stt_res["language"])

        lang = stt_res["language"]
        print(f"🔊 Synthesizing in [{lang}]...")
        output_filename = f"response_{uuid.uuid4().hex[:6]}.wav"
        output_path = os.path.join(ASSETS_DIR, output_filename)

        # Pick the first available voice for the detected language,
        # falling back to English if the language isn't in the registry.
        registry = models.get("voice_registry", {})
        voices = registry.get(lang) or registry.get("en") or []
        voice_name = voices[0]["name"] if voices else ""

        wav_bytes = await tts_synthesize(ai_reply, lang, voice_name)
        if wav_bytes:
            with open(output_path, "wb") as _f:
                _f.write(wav_bytes)

        proc_time = time.time() - start_total
        print(f"✅ Done in {proc_time:.2f}s")

        return {
            "transcript": full_text,
            "ai_response": ai_reply,
            "audio_url": f"/assets/{output_filename}",
            "processing_time": proc_time,
            "detected_language": stt_res["language"]
        }

    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
