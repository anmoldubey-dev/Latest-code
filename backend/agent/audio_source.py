# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#    |
#    v
# +-------------------------------+
# | __init__()                    |
# | * init queue and audio source |
# +-------------------------------+
#    |
#    |----> <AudioSource> -> __init__()
#    |        * create LiveKit audio source
#    |
#    v
# +-------------------------------+
# | start()                       |
# | * launch background pump      |
# +-------------------------------+
#    |
#    |----> _pump()
#    |        * schedule pump coroutine
#    |
#    v
# +-------------------------------+
# | push_tts_wav()                |
# | * decode resample enqueue WAV |
# +-------------------------------+
#    |
#    |----> wav_bytes_to_pcm()
#    |        * parse WAV bytes to PCM
#    |
#    |----> resample_audio()
#    |        * resample to 48 kHz
#    |
#    |----> float32_to_int16()
#    |        * convert sample format
#    |
#    |----> <Queue> -> put_nowait()
#    |        * enqueue audio chunks
#    |
#    v
# +-------------------------------+
# | _pump()                       |
# | * dequeue and send to LiveKit |
# +-------------------------------+
#    |
#    |----> <Queue> -> get()
#    |        * dequeue next audio chunk
#    |
#    |----> <AudioSource> -> capture_frame()
#    |        * push frame to LiveKit
#    |
#    v
# +-------------------------------+
# | clear()                       |
# | * drain queue on barge-in     |
# +-------------------------------+
#    |
#    |----> <Queue> -> get_nowait()
#    |        * drain queued frames
#    |
#    v
# +-------------------------------+
# | stop()                        |
# | * cancel pump task            |
# +-------------------------------+
#    |
#    v
# +-------------------------------+
# | stats()                       |
# | * expose queue telemetry      |
# +-------------------------------+
#
# ================================================================

import asyncio
import logging
import time
from typing import Optional

import numpy as np

from backend.audio.converter import wav_bytes_to_pcm, resample_audio, float32_to_int16

logger = logging.getLogger("callcenter.livekit.audio_source")

_SR            = 48_000
_FRAME_SAMPLES = 960
_MAX_QUEUE     = 1500


class TtsAudioSource:

    def __init__(self) -> None:
        from livekit import rtc
        self.source: "rtc.AudioSource" = rtc.AudioSource(
            sample_rate  = _SR,
            num_channels = 1,
        )
        self._queue:          asyncio.Queue[np.ndarray] = asyncio.Queue(maxsize=_MAX_QUEUE)
        self._closed:         bool = False
        self._task:           Optional[asyncio.Task] = None

        # Telemetry
        self._overflow_count: int   = 0
        self._frames_pushed:  int   = 0
        self._last_push_t:    float = 0.0

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.ensure_future(self._pump())

    def stop(self) -> None:
        self._closed = True
        if self._task and not self._task.done():
            self._task.cancel()

    # ------------------------------------------------------------------
    # Outbound pump
    # ------------------------------------------------------------------

    async def _pump(self) -> None:
        from livekit import rtc

        while not self._closed:
            try:
                chunk: np.ndarray = await asyncio.wait_for(
                    self._queue.get(), timeout=1.0
                )
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception:
                break

            frame = rtc.AudioFrame(
                data                = chunk.tobytes(),
                sample_rate         = _SR,
                num_channels        = 1,
                samples_per_channel = _FRAME_SAMPLES,
            )
            try:
                await self.source.capture_frame(frame)
            except Exception as exc:
                logger.debug("[TtsAudioSource] capture_frame error (skipped): %s", exc)

    # ------------------------------------------------------------------
    # Ingest TTS WAV
    # ------------------------------------------------------------------

    async def push_tts_wav(self, wav_bytes: bytes) -> None:
        if not wav_bytes:
            logger.warning("[TtsAudioSource] push_tts_wav called with empty bytes — skipping")
            return

        t0   = time.perf_counter()
        loop = asyncio.get_event_loop()

        def _decode_and_resample() -> np.ndarray:
            pcm_f32, native_sr = wav_bytes_to_pcm(wav_bytes)
            if native_sr != _SR:
                pcm_f32 = resample_audio(pcm_f32, native_sr, _SR)
            return float32_to_int16(pcm_f32)

        try:
            pcm_i16 = await loop.run_in_executor(None, _decode_and_resample)
        except Exception:
            logger.exception("[TtsAudioSource] Failed to decode/resample WAV bytes — skipping")
            return

        decode_ms = (time.perf_counter() - t0) * 1000
        logger.debug("[TtsAudioSource] decode+resample %.0f ms  %d samples", decode_ms, len(pcm_i16))

        self._last_push_t = time.perf_counter()
        enqueued = 0

        for i in range(0, len(pcm_i16), _FRAME_SAMPLES):
            chunk = pcm_i16[i : i + _FRAME_SAMPLES]

            if len(chunk) < _FRAME_SAMPLES:
                chunk = np.pad(chunk, (0, _FRAME_SAMPLES - len(chunk)))

            if self._queue.full():
                try:
                    self._queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                self._overflow_count += 1
                logger.warning(
                    "[TtsAudioSource] queue overflow — oldest frame dropped  total_overflows=%d",
                    self._overflow_count,
                )

            try:
                self._queue.put_nowait(chunk)
                enqueued += 1
            except asyncio.QueueFull:
                pass

        self._frames_pushed += enqueued
        logger.debug("[TtsAudioSource] enqueued %d frames  queue_size=%d", enqueued, self._queue.qsize())

    # ------------------------------------------------------------------
    # Barge-in drain
    # ------------------------------------------------------------------

    def clear(self) -> int:
        drained = 0
        while True:
            try:
                self._queue.get_nowait()
                drained += 1
            except asyncio.QueueEmpty:
                break
        if drained:
            logger.debug("[TtsAudioSource] cleared %d frames on barge-in", drained)
        return drained

    # ------------------------------------------------------------------
    # Telemetry
    # ------------------------------------------------------------------

    def stats(self) -> dict:
        return {
            "queue_size":     self._queue.qsize(),
            "queue_max":      _MAX_QUEUE,
            "overflow_count": self._overflow_count,
            "frames_pushed":  self._frames_pushed,
            "closed":         self._closed,
        }
