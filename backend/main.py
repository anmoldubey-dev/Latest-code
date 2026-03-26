# [ START ]
#     |
#     v
# +----------------------------------------------+
# | get_next_output_path()                       |
# | * generate unique numbered WAV path          |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | get_remote_diarization()                     |
# | * POST audio path to diarization port        |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | main()                                       |
# | * CLI batch pipeline entry point             |
# +----------------------------------------------+
#     |
#     |----> <AudioTranscriber> -> __init__()
#     |        * load Whisper model on CPU
#     |
#     |----> <GeminiResponder> -> __init__()
#     |        * init Gemini Flash client
#     |
#     |----> <ConversationMemory> -> __init__()
#     |        * load or create FAISS index
#     |
#     |----> <PiperTTS> -> __init__()
#     |        * init Piper TTS engine
#     |
#     |----> <AudioTranscriber> -> transcribe()
#     |        * convert speech file to text
#     |
#     |----> get_remote_diarization()
#     |        * fetch speaker segments
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
#     |----> <PiperTTS> -> synthesize()
#     |        * render reply to WAV file
#     |
#     v
# [ END ]

import os
import sys
import argparse
import time
import requests
from dotenv import load_dotenv

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(PROJECT_ROOT)

load_dotenv()

from backend.speech.stt.transcriber import AudioTranscriber
from backend.language.llm.gemini_responder import GeminiResponder
from backend.memory.vector_store import ConversationMemory
from backend.audio.merger import merge_transcription_and_diarization
from backend.speech.tts_client import tts as PiperTTS  # piper moved to services/translator_service/tts/

DEFAULT_AUDIO_PATH = os.path.join(PROJECT_ROOT, "assets", "Test1.wav")
ASSETS_FOLDER = os.path.join(PROJECT_ROOT, "assets")
BASE_OUTPUT_NAME = "output_response.wav"

PIPER_EXE_PATH = os.path.join(PROJECT_ROOT, "backend", "tts", "piper", "piper.exe")
PIPER_MODEL_PATH = os.path.join(PROJECT_ROOT, "backend", "tts", "piper", "models", "en_US-lessac-medium.onnx")

DIARIZATION_SERVICE_URL = "http://127.0.0.1:8001/diarize"
HF_TOKEN = "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"

def get_next_output_path(base_folder, base_filename):
    name, ext = os.path.splitext(base_filename)
    counter = 1
    while os.path.exists(os.path.join(base_folder, f"{name}_{counter}{ext}")):
        counter += 1
    return os.path.join(base_folder, f"{name}_{counter}{ext}")

def get_remote_diarization(file_path):
    try:
        print("🔹 Calling Diarization Service...")
        response = requests.post(
            DIARIZATION_SERVICE_URL,
            json={"file_path": os.path.abspath(file_path), "hf_token": HF_TOKEN},
            timeout=10
        )
        if response.status_code == 200:
            return response.json().get("segments", [])
    except Exception:
        print("⚠️ Diarization unavailable. Using single speaker.")
    return []

def main():
    parser = argparse.ArgumentParser(description="Voice AI Backend (Gemini Edition)")
    parser.add_argument("--file", type=str, default=DEFAULT_AUDIO_PATH)
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"❌ File not found: {args.file}")
        return

    print("🔹 SYSTEM STARTUP (Gemini Flash Mode)...")
    start_total = time.time()

    try:
        transcriber = AudioTranscriber(model_size="medium", device="cpu")

        responder = GeminiResponder()

        memory = ConversationMemory(index_path="backend/faiss_index")
        tts_engine = PiperTTS(piper_exe_path=PIPER_EXE_PATH, model_path=PIPER_MODEL_PATH)

        print("\n--- 1. Transcribing ---")
        stt_res = transcriber.transcribe(args.file)
        print(f"📝 Text: {stt_res['text'][:50]}... ({stt_res['language']})")

        print("\n--- 2. Diarizing ---")
        speakers = get_remote_diarization(args.file)
        if not speakers:
            speakers = [{"start": 0.0, "end": 9999.0, "speaker": "User"}]

        merged_log = merge_transcription_and_diarization(stt_res["segments"], speakers)
        full_conversation = "\n".join([f"[{m['speaker']}]: {m['text']}" for m in merged_log])

        print("\n--- 3. Gemini Generation ---")
        llm_start = time.time()

        ai_reply = responder.generate_response(merged_log, stt_res["language"])

        print(f"🤖 Gemini ({time.time() - llm_start:.2f}s): {ai_reply}")

        memory.save_interaction(full_conversation, ai_reply, stt_res["language"])

        print("\n--- 4. TTS Synthesis ---")
        out_path = get_next_output_path(ASSETS_FOLDER, BASE_OUTPUT_NAME)
        tts_engine.synthesize(ai_reply, out_path)

        print(f"\n✅ Done! Total Time: {time.time() - start_total:.2f}s")
        print(f"🔊 Output: {out_path}")

    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
