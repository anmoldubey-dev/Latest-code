# human_tts_2 — Indic Parler TTS Voice Studio

**Stack:** Indic Parler TTS → Librosa → Audiomentations → Final Human Audio

Generates natural-sounding Indic language speech for call center AI.
3–8 second generation · 21 Indian languages · No reference audio needed · Apache 2.0

---

## Quick Start

```bash
# 1. Enter folder
cd human_tts_2

# 2. Create venv
python -m venv venv

# 3. Activate
source venv/bin/activate        # Linux / Mac
venv\Scripts\activate           # Windows

# 4. Install dependencies
pip install -r requirements.txt

# 5. Copy environment config
cp .env.example .env

# 6. Start server
uvicorn app:app --host 0.0.0.0 --port 8002 --reload

# 7. Open in browser
# http://localhost:8002
```

> **First launch:** The model (~1.5 GB) downloads automatically from HuggingFace.
> A banner appears in the UI until the model is ready (~30s on fast internet).

---

## Pipeline

```
Text + Voice Description Prompt
        ↓
Indic Parler TTS (raw audio @ 24 kHz)
        ↓
Librosa (emotion prosody — tempo + pitch + ±2% jitter)
        ↓
Audiomentations (humanization — noise + EQ + reverb + HPF)
        ↓
Final WAV output
```

---

## Emotion Presets

| Emotion  | Tempo  | Pitch Steps | Voice Description              |
|----------|--------|-------------|--------------------------------|
| neutral  | 1.00×  | 0.0         | moderate pace, clear delivery  |
| happy    | 1.15×  | +1.5        | fast, upbeat, animated speech  |
| sad      | 0.87×  | −1.2        | slow, soft, gentle tone        |
| angry    | 1.05×  | −0.5        | firm, serious, authoritative   |
| urgent   | 1.18×  | +2.0        | fast, high energy, alert       |
| calm     | 0.93×  | 0.0         | slow, smooth, composed         |

---

## API

### `POST /generate`
```json
{
  "text": "Aapka order confirm ho gaya hai",
  "emotion": "happy",
  "gender": "female",
  "quality": "clear"
}
```
Returns:
```json
{
  "filename": "rec3.wav",
  "url": "/audio/rec3.wav",
  "previous_url": "/audio/rec2.wav",
  "emotion": "happy",
  "duration_seconds": 3.4,
  "generation_time_seconds": 5.1
}
```

### `GET /health`
Returns `{"status": "ready"}` when model is loaded.

### `GET /recordings`
Returns list of all saved recordings with metadata.

### `DELETE /recordings`
Clears all recordings from disk.

### `GET /audio/{filename}`
Serves a WAV file.

---

## Environment Variables (`.env`)

| Variable         | Default                        | Description                  |
|------------------|--------------------------------|------------------------------|
| `DEVICE`         | `cuda`                         | `cuda` or `cpu`              |
| `MODEL_NAME`     | `ai4bharat/indic-parler-tts`   | HuggingFace model ID         |
| `MAX_TEXT_LENGTH`| `300`                          | Auto-split threshold (chars) |
| `OUTPUT_DIR`     | `outputs/recordings`           | Where WAV files are saved    |
| `PORT`           | `8002`                         | (used by uvicorn command)    |

---

## Folder Structure

```
human_tts_2/
├── venv/                       ← isolated Python env
├── static/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── outputs/recordings/         ← generated WAV files
├── core/
│   ├── __init__.py
│   ├── tts_engine.py           ← Indic Parler TTS wrapper
│   ├── voice_sculptor.py       ← Librosa + Audiomentations
│   └── presets.py              ← emotion presets
├── app.py                      ← FastAPI app (port 8002)
├── requirements.txt
├── .env.example
└── README.md
```

---

## Notes

- Language is **auto-detected** by Parler from input text script — do not hardcode.
- All audio stays at **24000 Hz** — no upsampling.
- Concurrent requests return **HTTP 429** with a message.
- Long texts (>300 chars) are **sentence-split**, each generated separately, joined with 200ms silence.
- On **CUDA OOM**, generation falls back to CPU automatically.
