# Global Parler TTS Voice Studio

A web-based voice synthesis studio using [parler-tts/parler-tts-mini-v1.1](https://huggingface.co/parler-tts/parler-tts-mini-v1.1) with emotional prosody control, room ambience mixing, and acoustic enhancement. Runs on **port 8003**.

---

## Quick Start

```bash
# 1. Navigate
cd human_tts

# 2. Create venv
python -m venv venv

# 3. Activate
source venv/bin/activate        # Linux/Mac
venv\Scripts\activate           # Windows

# 4. Install
pip install -r requirements.txt

# 5. Environment
cp .env.example .env

# 6. Run
uvicorn app:app --host 0.0.0.0 --port 8003 --reload

# 7. Open
http://localhost:8003
```

---

## Supported Languages

| Language   | Native     | Notes          |
|------------|------------|----------------|
| English    | English    | Primary, best quality |
| French     | Français   | Strong         |
| German     | Deutsch    | Strong         |
| Spanish    | Español    | Strong         |
| Portuguese | Português  | Strong         |
| Polish     | Polski     | Good           |
| Italian    | Italiano   | Good           |
| Dutch      | Nederlands | Good           |

---

## Emotion Presets

| Emotion | Description |
|---------|-------------|
| neutral | Clear and professional |
| happy   | Warm, cheerful, welcoming |
| sad     | Soft, empathetic |
| angry   | Firm, assertive, controlled |
| urgent  | Fast, alert, critical |
| calm    | Slow, reassuring, patient |

---

## Pipeline

```
Input Text
    │
    ▼
PersonaManager.build_description()
    │  "A female speaker delivers warm and clear English speech.
    │   speaks clearly and professionally. No background noise."
    ▼
ParlerTTSForConditionalGeneration.generate()
    │  raw audio @ 24000 Hz
    ▼
HumanVoiceSculptor.process()
    │  ├─ peak normalize
    │  ├─ mix room ambience (if call_centre_room.wav present)
    │  ├─ EQ: +2.5dB @ 400Hz warmth, +2.0dB @ 4kHz clarity
    │  └─ loudness normalize to -24 LUFS
    ▼
outputs/recordings/recN.wav
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/generate` | Generate speech |
| `GET` | `/health` | Model status |
| `GET` | `/voices` | List all voices |
| `GET` | `/languages` | Language → voice mapping |
| `GET` | `/recordings` | List saved recordings |
| `DELETE` | `/recordings` | Clear all recordings |
| `GET` | `/audio/{filename}` | Serve WAV file |

### POST /generate

```json
{
  "text": "Your order has been confirmed.",
  "language": "English",
  "voice_name": "Emma (Warm Female)",
  "emotion": "neutral"
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVICE` | `cuda` | `cuda` or `cpu` |
| `MODEL_NAME` | `parler-tts/parler-tts-mini-v1.1` | HuggingFace model ID |
| `MAX_TEXT_LENGTH` | `300` | Max chars before sentence splitting |
| `OUTPUT_DIR` | `outputs/recordings` | Where WAV files are saved |
| `PORT` | `8003` | Server port |
| `HF_TOKEN` | _(optional)_ | HuggingFace token |

---

## Folder Structure

```
human_tts/
├── app.py                  # FastAPI application
├── requirements.txt
├── .env.example
├── core/
│   ├── __init__.py
│   ├── tts_engine.py       # Parler TTS inference wrapper
│   ├── persona_manager.py  # Voice description builder + cache
│   ├── presets.py          # Voices, emotions, languages
│   └── voice_sculptor.py   # DSP post-processing pipeline
├── static/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── assets/
│   └── call_centre_room.wav  (optional — place here to enable room ambience)
└── outputs/
    └── recordings/           (auto-created)
```

---

## Room Ambience (Optional)

Place `call_centre_room.wav` in the `assets/` folder to enable subtle room tone mixing. Without it the pipeline runs clean — no errors.
