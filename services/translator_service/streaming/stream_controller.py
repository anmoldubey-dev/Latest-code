# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +------------------------------+
# | __init__()                   |
# | * init per-session state     |
# +------------------------------+
#     |
#     v
# +------------------------------+
# | run()                        |
# | * WebSocket message loop     |
# +------------------------------+
#     |
#     |----> _process_loop()
#     |        * VAD background task
#     |
#     |----> _handle_control()
#     |        * parse control JSON
#     |
#     v
# +---------------------------------------+
# | _process_loop()                       |
# | * VAD speech silence detection        |
# +---------------------------------------+
#     |
#     |----> _process_buffer()
#     |        * flush on utterance end
#     |
#     v
# +-----------------------------------------------+
# | _process_buffer()                             |
# | * core STT NMT TTS pipeline                  |
# +-----------------------------------------------+
#     |
#     |----> <StreamingTranscriber> -> transcribe_pcm()
#     |        * speech to text
#     |
#     |----> _collapse_repetitions()
#     |        * remove hallucination loops
#     |
#     |----> _extract_new_text()
#     |        * delta dedup new words
#     |
#     |----> <TranslatorEngine> -> translate()
#     |        * translate new text
#     |
#     |----> <PiperTTSEngine> -> synthesize()
#     |        * synthesize translated audio
#     |
#     |----> _send()
#     |        * send JSON over WebSocket
#     |
#     v
# +------------------------------+
# | _send()                      |
# | * safe WebSocket JSON send   |
# +------------------------------+
#     |
#     v
# +-------------------------------+
# | _collapse_repetitions()       |
# | * collapse Whisper loop loops |
# +-------------------------------+
#     |
#     v
# +------------------------------+
# | _extract_new_text()          |
# | * return only new words      |
# +------------------------------+
#
# ================================================================

import asyncio
import base64
import json
import logging
import time
from typing import Any, Dict

import numpy as np

logger = logging.getLogger(__name__)

MIN_AUDIO_SEC = 1.5
MIN_SAMPLES = int(16_000 * MIN_AUDIO_SEC)

MAX_AUDIO_SEC = 6.0
MAX_SAMPLES = int(16_000 * MAX_AUDIO_SEC)

PROCESS_INTERVAL = 0.5

SILENCE_RMS = 0.0008
SPEECH_RMS  = 0.0015

UTTERANCE_END_SILENCE = 0.8

MIN_TRANSLATE_WORDS = 3


class StreamController:

    def __init__(self, websocket, models: Dict[str, Any]):
        self._ws = websocket
        self._models = models
        self.source_lang: str = "hi"
        self.target_lang: str = "en"

        self._chunks: list[np.ndarray] = []

        self._last_transcript: str = ""

        self._is_processing: bool = False
        self._running: bool = False

        self._speech_active: bool = False
        self._silence_since: float | None = None

    async def run(self) -> None:
        self._running = True
        bg = asyncio.create_task(self._process_loop(), name="pipeline-loop")
        try:
            while self._running:
                try:
                    msg = await asyncio.wait_for(
                        self._ws.receive(), timeout=30.0
                    )
                except asyncio.TimeoutError:
                    continue

                if msg.get("type") == "websocket.disconnect":
                    logger.info("Client disconnected gracefully.")
                    break

                if "text" in msg:
                    await self._handle_control(msg["text"])

                elif "bytes" in msg and msg["bytes"]:
                    pcm = np.frombuffer(msg["bytes"], dtype=np.float32).copy()
                    self._chunks.append(pcm)

        except Exception:
            logger.exception("Session error")
        finally:
            self._running = False
            bg.cancel()
            try:
                await bg
            except asyncio.CancelledError:
                pass
            logger.info("Stream session ended.")

    async def _handle_control(self, raw: str) -> None:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Malformed control JSON: %r", raw[:120])
            return

        action = data.get("action")

        if action == "start":
            self.source_lang = data.get("source_lang", "hi")
            self.target_lang = data.get("target_lang", "en")
            self._chunks.clear()
            self._last_transcript = ""
            logger.info(
                "Session started: %s → %s", self.source_lang, self.target_lang
            )
            await self._send({"type": "status", "message": "listening"})

        elif action == "stop":
            logger.info("Client requested stop.")
            self._running = False

        elif action == "flush":
            await self._process_buffer()

        elif action == "ping":
            await self._send({"type": "pong"})

    async def _process_loop(self) -> None:
        while self._running:
            await asyncio.sleep(PROCESS_INTERVAL)

            if self._is_processing or not self._chunks:
                continue

            total_samples = sum(len(c) for c in self._chunks)
            total_sec = total_samples / 16_000

            all_audio = np.concatenate(self._chunks)
            recent   = all_audio[-8_000:]
            rms      = float(np.sqrt(np.mean(recent ** 2)))
            now      = time.perf_counter()

            if rms >= SPEECH_RMS:
                if not self._speech_active:
                    logger.info(
                        "[VAD] speech START  RMS=%.4f  buffer=%.2fs",
                        rms, total_sec,
                    )
                self._speech_active = True
                self._silence_since = None

                if total_sec >= MAX_AUDIO_SEC:
                    logger.info("[VAD] buffer full (%.2fs) — force flush", total_sec)
                    await self._process_buffer()

            elif self._speech_active:
                if self._silence_since is None:
                    self._silence_since = now
                    logger.info(
                        "[VAD] speech END (silence started)  RMS=%.4f  buffer=%.2fs",
                        rms, total_sec,
                    )

                silence_dur = now - self._silence_since

                if silence_dur >= UTTERANCE_END_SILENCE:
                    logger.info(
                        "[VAD] utterance DONE  silence=%.2fs  buffer=%.2fs → flush",
                        silence_dur, total_sec,
                    )
                    self._speech_active = False
                    self._silence_since = None
                    if total_sec >= MIN_AUDIO_SEC:
                        await self._process_buffer()
                    else:
                        logger.info("[VAD] utterance too short (%.2fs) — discard", total_sec)
                        self._chunks.clear()

            else:
                if total_samples > 8_000:
                    self._chunks = [all_audio[-8_000:]]

    async def _process_buffer(self) -> None:
        if self._is_processing or not self._chunks:
            return

        snapshot = self._chunks.copy()
        self._chunks.clear()

        total_samples = sum(len(c) for c in snapshot)
        if total_samples < MIN_SAMPLES:
            self._chunks = snapshot + self._chunks
            return

        self._is_processing = True
        t_pipeline = time.perf_counter()
        try:
            audio = np.concatenate(snapshot)
            audio_sec = len(audio) / 16_000

            if len(audio) > MAX_SAMPLES:
                audio = audio[-MAX_SAMPLES:]

            rms = float(np.sqrt(np.mean(audio ** 2)))
            logger.info(
                "[PIPELINE] start  audio=%.2fs  samples=%d  RMS=%.4f",
                audio_sec, len(audio), rms,
            )
            if rms < SILENCE_RMS:
                logger.info("[PIPELINE] skip — silent (RMS=%.4f < %.4f)", rms, SILENCE_RMS)
                tail = audio[-16_000:]
                self._chunks.insert(0, tail)
                return

            await self._send({"type": "status", "message": "processing"})

            loop = asyncio.get_event_loop()
            logger.info("[STT] submitting %.2fs of audio …", audio_sec)
            t_stt = time.perf_counter()
            transcript: str = await loop.run_in_executor(
                None,
                self._models["stt"].transcribe_pcm,
                audio,
                self.source_lang,
            )
            stt_ms = (time.perf_counter() - t_stt) * 1000
            logger.info("[STT] done in %.0fms → %r", stt_ms, transcript[:80] if transcript else "(empty)")

            if not transcript:
                logger.info("[PIPELINE] no transcript — keeping last 1s as context")
                tail = audio[-16_000:]
                self._chunks.insert(0, tail)
                await self._send({"type": "status", "message": "listening"})
                return

            before = transcript
            transcript = self._collapse_repetitions(transcript)
            if transcript != before:
                logger.info(
                    "[GUARD-C] collapsed: %d→%d words  %r → %r",
                    len(before.split()), len(transcript.split()),
                    before[:50], transcript[:50],
                )

            words = transcript.split()

            if len(words) > 40:
                logger.warning(
                    "[GUARD-A] discarding hallucination (%d words): %r",
                    len(words), transcript[:80],
                )
                await self._send({"type": "status", "message": "listening"})
                return

            if len(words) >= 6:
                unique = len({w.lower().strip(".,?!\"'") for w in words})
                ratio  = unique / len(words)
                if ratio < 0.35:
                    logger.warning(
                        "[GUARD-B] discarding repetitive hallucination "
                        "(unique_ratio=%.2f, words=%d): %r", ratio, len(words), transcript[:80]
                    )
                    await self._send({"type": "status", "message": "listening"})
                    return

            if len(words) < MIN_TRANSLATE_WORDS:
                logger.info(
                    "[GUARD-D] too short (%d word(s)): %r",
                    len(words), transcript,
                )
                await self._send({"type": "status", "message": "listening"})
                return

            if transcript.lower().strip() == self._last_transcript.lower().strip():
                logger.info("[PIPELINE] transcript unchanged — skip translate")
                await self._send({"type": "status", "message": "listening"})
                return

            new_text = self._extract_new_text(self._last_transcript, transcript)
            self._last_transcript = transcript
            logger.info("[DELTA] new_text=%r", new_text[:80] if new_text else "(none)")

            await self._send({"type": "transcript", "text": transcript})

            if not new_text:
                await self._send({"type": "status", "message": "listening"})
                return

            logger.info("[NMT] translating %r (%s→%s) …", new_text[:60], self.source_lang, self.target_lang)
            t_nmt = time.perf_counter()
            translation: str = await loop.run_in_executor(
                None,
                self._models["translator"].translate,
                new_text,
                self.source_lang,
                self.target_lang,
            )
            nmt_ms = (time.perf_counter() - t_nmt) * 1000
            logger.info("[NMT] done in %.0fms → %r", nmt_ms, translation[:80] if translation else "(empty)")

            if not translation:
                return

            await self._send({"type": "translation", "text": translation})

            logger.info("[TTS] synthesizing %r (lang=%s) …", translation[:60], self.target_lang)
            t_tts = time.perf_counter()
            try:
                wav_bytes: bytes = await self._models["tts"].synthesize(
                    translation, self.target_lang
                )
                tts_ms = (time.perf_counter() - t_tts) * 1000
                logger.info("[TTS] done in %.0fms  wav=%d bytes", tts_ms, len(wav_bytes) if wav_bytes else 0)
                if wav_bytes:
                    b64 = base64.b64encode(wav_bytes).decode("utf-8")
                    await self._send({"type": "audio", "data": b64})
            except Exception:
                tts_ms = (time.perf_counter() - t_tts) * 1000
                logger.exception("[TTS] failed after %.0fms — sending text-only", tts_ms)

            total_ms = (time.perf_counter() - t_pipeline) * 1000
            logger.info(
                "[PIPELINE] done  total=%.0fms  (STT=%.0f NMT=%.0f TTS=%.0f)",
                total_ms, stt_ms, nmt_ms, tts_ms,
            )
            await self._send({"type": "status", "message": "listening"})

        except Exception:
            logger.exception("Pipeline error")
            await self._send(
                {"type": "error", "message": "Internal pipeline error"}
            )
        finally:
            self._is_processing = False

    async def _send(self, data: dict) -> None:
        try:
            await self._ws.send_json(data)
        except Exception as exc:
            logger.warning("WebSocket send failed: %s", exc)
            self._running = False

    @staticmethod
    def _collapse_repetitions(text: str) -> str:
        words = text.split()
        n = len(words)
        if n < 4:
            return text

        def _is_repeating(seq: list, unit_len: int, min_reps: int = 2) -> bool:
            unit = seq[:unit_len]
            reps = 0
            for i in range(0, len(seq), unit_len):
                chunk = seq[i : i + unit_len]
                if chunk != unit[: len(chunk)]:
                    return False
                reps += 1
            return reps >= min_reps

        for ul in range(1, n // 2 + 1):
            if _is_repeating(words, ul):
                return " ".join(words[:ul])

        for prefix_end in range(1, n - 3):
            suffix = words[prefix_end:]
            m = len(suffix)
            for ul in range(1, m // 2 + 1):
                if _is_repeating(suffix, ul, min_reps=3):
                    return " ".join(words[:prefix_end] + suffix[:ul])

        return text

    @staticmethod
    def _extract_new_text(previous: str, current: str) -> str:
        if not previous:
            return current

        prev_words = previous.lower().split()
        curr_words = current.split()

        overlap = 0
        for i in range(min(len(prev_words), len(curr_words)), 0, -1):
            if prev_words[-i:] == [w.lower() for w in curr_words[:i]]:
                overlap = i
                break

        if overlap:
            tail = curr_words[overlap:]
            return " ".join(tail).strip()

        return current
