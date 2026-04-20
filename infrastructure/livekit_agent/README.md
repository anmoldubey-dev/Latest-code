# LiveKit Agent — Voice AI Core

## What this does
Replaces the raw WebSocket audio loop in app.py with a proper LiveKit room.
Browser joins a LiveKit room → LiveKit Agent (this folder) handles STT→LLM→TTS inside the room.

## Architecture
```
Browser (livekit-client SDK)
    │
    ▼
LiveKit Server :7880          ← handles WebRTC / media rooms
    │
    ▼
LiveKit Agent (agent.py)      ← Python worker, subscribes to room audio
    │
    ├── STT  → faster-whisper (same as before)
    ├── LLM  → Gemini / Ollama (same as before)
    └── TTS  → port 8003/8004 (same as before)
```

## Run LiveKit Server (no Docker)

Download Linux binary:
```bash
wget https://github.com/livekit/livekit/releases/latest/download/livekit_linux_amd64.tar.gz
tar -xzf livekit_linux_amd64.tar.gz -C /home/swayam/Documents/VoiceAicore/
mv livekit-server /home/swayam/Documents/VoiceAicore/livekit-server-linux
chmod +x /home/swayam/Documents/VoiceAicore/livekit-server-linux
```

Start it:
```bash
./livekit-server-linux --config livekit.yaml
# or dev mode (no config needed):
./livekit-server-linux --dev
```

Env vars to set in backend/.env:
```
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
```

## Install Agent SDK
```bash
conda activate serviceA
pip install livekit livekit-agents livekit-plugins-silero
```

## Files
- `agent.py`   — LiveKit agent worker (to be built)
- `token.py`   — Token generator helper (uses LIVEKIT_API_KEY/SECRET)
