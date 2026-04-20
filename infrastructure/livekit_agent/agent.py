"""
LiveKit Agent — Voice AI Core
==============================
Connects to LiveKit Cloud room, runs STT→LLM→TTS pipeline,
integrates with routing engine for voice/LLM selection.

Run:
    conda activate serviceA
    cd /home/swayam/Documents/VoiceAicore
    python -m infrastructure.livekit_agent.agent dev
"""

import asyncio
import logging
import os
import sys
import io
import wave
from typing import AsyncIterator

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    AgentSession,
    Agent,
    JobContext,
    WorkerOptions,
    cli,
    RoomInputOptions,
    stt as stt_base,
    tts as tts_base,
    llm as llm_base,
)
from livekit.agents.voice import VoiceAgent

load_dotenv("/home/swayam/Documents/VoiceAicore/.env")
sys.path.insert(0, "/home/swayam/Documents/VoiceAicore")

logger = logging.getLogger("callcenter.livekit_agent")

# ── Our custom STT adapter (wraps faster-whisper transcriber) ─────────────────

class WhisperSTT(stt_base.STT):
    """Adapter: wraps our existing faster-whisper transcriber."""

    def __init__(self):
        super().__init__(capabilities=stt_base.STTCapabilities(streaming=False, interim_results=False))
        self._transcriber = None

    def _get_transcriber(self):
        if self._transcriber is None:
            from backend.speech.stt.transcriber import Transcriber
            self._transcriber = Transcriber()
        return self._transcriber

    async def _recognize_impl(
        self, buffer: stt_base.AudioBuffer, *, language: str | None = None
    ) -> stt_base.SpeechEvent:
        loop = asyncio.get_event_loop()
        # Convert AudioBuffer frames to raw PCM bytes
        pcm_frames = b"".join(f.data.tobytes() for f in buffer)
        import numpy as np
        audio_np = np.frombuffer(pcm_frames, dtype=np.int16).astype(np.float32) / 32768.0

        transcriber = self._get_transcriber()
        text = await loop.run_in_executor(
            None, transcriber.transcribe_numpy, audio_np
        )
        return stt_base.SpeechEvent(
            type=stt_base.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt_base.SpeechData(text=text or "", language=language or "en")],
        )


# ── Our custom TTS adapter (wraps port 8003/8004 HTTP TTS) ───────────────────

class VoiceCoreTTS(tts_base.TTS):
    """Adapter: wraps our existing HTTP TTS services."""

    def __init__(self, voice: str = "Emma (Warm Female)", lang: str = "en"):
        super().__init__(
            capabilities=tts_base.TTSCapabilities(streaming=False),
            sample_rate=22050,
            num_channels=1,
        )
        self._voice = voice
        self._lang  = lang

    async def synthesize(self, text: str, *, conn_options=None) -> tts_base.ChunkedStream:
        return VoiceCoreTTSStream(text, self._voice, self._lang, self.sample_rate)


class VoiceCoreTTSStream(tts_base.ChunkedStream):
    def __init__(self, text: str, voice: str, lang: str, sample_rate: int):
        super().__init__()
        self._text   = text
        self._voice  = voice
        self._lang   = lang
        self._sr     = sample_rate

    async def _run(self) -> None:
        from backend.speech.tts_client import tts as _tts
        try:
            wav_bytes = await _tts(self._text, self._lang, self._voice)
            # Parse WAV and emit audio frames
            buf = io.BytesIO(wav_bytes)
            with wave.open(buf) as wf:
                sr     = wf.getframerate()
                n_ch   = wf.getnchannels()
                sw     = wf.getsampwidth()
                frames = wf.readframes(wf.getnframes())
            import numpy as np
            pcm = np.frombuffer(frames, dtype=np.int16)
            # Emit in 20ms chunks
            chunk_samples = sr // 50
            for i in range(0, len(pcm), chunk_samples):
                chunk = pcm[i:i + chunk_samples]
                frame = rtc.AudioFrame(
                    data=chunk.tobytes(),
                    sample_rate=sr,
                    num_channels=n_ch,
                    samples_per_channel=len(chunk),
                )
                self._event_ch.send_nowait(
                    tts_base.SynthesizedAudio(request_id=self._request_id, frame=frame)
                )
        except Exception as exc:
            logger.warning("[TTS] synthesis failed: %s", exc)


# ── Our custom LLM adapter (wraps GeminiResponder) ────────────────────────────

class GeminiLLM(llm_base.LLM):
    """Adapter: wraps our GeminiResponder for AgentSession."""

    def __init__(self, lang: str = "en", agent_name: str = "Emma"):
        super().__init__()
        self._lang       = lang
        self._agent_name = agent_name
        self._responder  = None

    def _get_responder(self):
        if self._responder is None:
            from backend.language.llm.gemini_responder import GeminiResponder
            self._responder = GeminiResponder()
        return self._responder

    def chat(self, *, chat_ctx: llm_base.ChatContext, conn_options=None) -> llm_base.LLMStream:
        return GeminiLLMStream(self, chat_ctx, self._lang, self._agent_name)


class GeminiLLMStream(llm_base.LLMStream):
    def __init__(self, llm_inst, chat_ctx, lang: str, agent_name: str):
        super().__init__(llm_inst, chat_ctx=chat_ctx, fnc_ctx=None)
        self._lang       = lang
        self._agent_name = agent_name

    async def _run(self):
        # Extract last user message
        user_text = ""
        memory    = []
        for msg in self._chat_ctx.messages:
            if msg.role == "user":
                user_text = msg.content if isinstance(msg.content, str) else str(msg.content)
            elif msg.role == "assistant":
                memory.append({"role": "assistant", "content": msg.content})

        try:
            from backend.language.llm.gemini_responder import GeminiResponder
            responder = GeminiResponder()
            response  = await responder.respond(
                user_text, lang=self._lang,
                memory=memory, agent_name=self._agent_name
            )
        except Exception as exc:
            logger.warning("[LLM] Gemini failed: %s", exc)
            response = "I'm sorry, I had trouble processing that. Could you repeat?"

        # Emit as a single text chunk
        self._event_ch.send_nowait(
            llm_base.ChatChunk(
                request_id=self._request_id,
                choices=[llm_base.Choice(
                    delta=llm_base.ChoiceDelta(role="assistant", content=response),
                    index=0,
                )],
            )
        )


# ── Main entrypoint ───────────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext):
    """Called when a room is assigned to this agent worker."""
    await ctx.connect()

    room     = ctx.room
    metadata = room.metadata or ""

    # Parse routing from room metadata (set by /api/create-room)
    lang       = "en"
    voice_stem = "Emma (Warm Female)"
    llm_name   = "gemini"
    agent_name = "Emma"

    try:
        import json
        meta = json.loads(metadata)
        lang       = meta.get("lang", lang)
        voice_stem = meta.get("voice", voice_stem)
        llm_name   = meta.get("llm", llm_name)
        agent_name = meta.get("agent", agent_name)
    except Exception:
        pass

    logger.info("[Agent] room=%s lang=%s voice=%s llm=%s", room.name, lang, voice_stem, llm_name)

    session = AgentSession(
        stt=WhisperSTT(),
        llm=GeminiLLM(lang=lang, agent_name=agent_name),
        tts=VoiceCoreTTS(voice=voice_stem, lang=lang),
    )

    await session.start(
        room=room,
        agent=Agent(instructions=(
            f"You are {agent_name}, a helpful AI assistant from SR Comsoft. "
            f"Respond naturally in {'Hindi' if lang == 'hi' else 'English'} "
            f"and keep responses concise."
        )),
        room_input_options=RoomInputOptions(),
    )

    await session.generate_reply(
        instructions=f"Greet the caller as {agent_name} from SR Comsoft and ask how you can help."
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            api_key    = os.getenv("LIVEKIT_API_KEY"),
            api_secret = os.getenv("LIVEKIT_API_SECRET"),
            ws_url     = os.getenv("LIVEKIT_URL"),
        )
    )
