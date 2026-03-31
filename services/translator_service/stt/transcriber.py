# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +------------------------------------------+
# | __init__()                               |
# | * detect device load Whisper model       |
# +------------------------------------------+
#     |
#     |----> _best_device()
#     |        * detect CUDA or CPU
#     |
#     v
# +------------------------------------------+
# | transcribe_pcm()                         |
# | * clip normalize and transcribe PCM      |
# +------------------------------------------+
#     |
#     |----> _write_wav()
#     |        * write float32 PCM to temp WAV
#     |
#     |----> <WhisperModel> -> transcribe()
#     |        * run Whisper large-v3 STT
#     |
#     |----> _script_ok()
#     |        * validate output script
#     |
#     v
# +------------------------------------------+
# | _write_wav()                             |
# | * convert float32 PCM to int16 WAV       |
# +------------------------------------------+
#     |
#     v
# +------------------------------------------+
# | _best_device()                           |
# | * return cuda or cpu device string       |
# +------------------------------------------+
#
# ================================================================
# SUPPORTED LANGUAGES (whisper-large-v3)
# ================================================================
#
#   Indian languages
#   ┌──────────────────────────────────────────────────┐
#   │  hi  Hindi       bn  Bengali     ta  Tamil       │
#   │  te  Telugu      mr  Marathi     gu  Gujarati    │
#   │  kn  Kannada     ml  Malayalam   pa  Punjabi     │
#   │  or  Odia        as  Assamese    ur  Urdu        │
#   │  ne  Nepali      en-in English (Indian accent)   │
#   └──────────────────────────────────────────────────┘
#
#   Global languages
#   ┌──────────────────────────────────────────────────┐
#   │  en  English     fr  French      de  German      │
#   │  es  Spanish     pt  Portuguese  pl  Polish      │
#   │  it  Italian     nl  Dutch       ar  Arabic      │
#   │  ru  Russian     zh  Chinese     ja  Japanese    │
#   │  ko  Korean      tr  Turkish                     │
#   └──────────────────────────────────────────────────┘
#
# ================================================================

import logging
import os
import tempfile
import time
import wave

import numpy as np
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# All supported language codes
# ---------------------------------------------------------------------------
INDIC_LANGS: frozenset[str] = frozenset({
    "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "or", "as",
})

GLOBAL_LANGS: frozenset[str] = frozenset({
    "en", "en-in", "fr", "de", "es", "pt", "pl", "it", "nl",
    "ar", "ur", "ru", "zh", "ja", "ko", "tr", "ne",
})

_ALL_SUPPORTED_LANGS: frozenset[str] = INDIC_LANGS | GLOBAL_LANGS

# ---------------------------------------------------------------------------
# Script Unicode ranges — for output validation.
# If the selected language requires a non-Latin script but the output has
# zero characters from that range, it's romanized garbage — discard it.
# ---------------------------------------------------------------------------
_SCRIPT_RANGES: dict[str, tuple[int, int]] = {
    "hi": (0x0900, 0x097F), "mr": (0x0900, 0x097F), "ne": (0x0900, 0x097F),
    "ml": (0x0D00, 0x0D7F),
    "ta": (0x0B80, 0x0BFF),
    "te": (0x0C00, 0x0C7F),
    "kn": (0x0C80, 0x0CFF),
    "gu": (0x0A80, 0x0AFF),
    "pa": (0x0A00, 0x0A7F),
    "bn": (0x0980, 0x09FF),
    "as": (0x0980, 0x09FF),
    "or": (0x0B00, 0x0B7F),
    "ar": (0x0600, 0x06FF),
    "ur": (0x0600, 0x06FF),
    "ru": (0x0400, 0x04FF),
    "zh": (0x4E00, 0x9FFF),
    "ja": (0x3040, 0x30FF),
    "ko": (0xAC00, 0xD7AF),
}


def _script_ok(text: str, language: str | None) -> bool:
    """Return True if text contains at least one character from the expected
    script range.  Latin-script languages always return True."""
    if not language or language not in _SCRIPT_RANGES:
        return True
    if not text or not text.strip():
        return True
    lo, hi = _SCRIPT_RANGES[language]
    return any(lo <= ord(ch) <= hi for ch in text)


# ---------------------------------------------------------------------------
# Native-script seed phrases — prepended to initial_prompt to bias Whisper's
# decoder toward the correct script (prevents romanized output).
# ---------------------------------------------------------------------------
_SCRIPT_SEEDS: dict[str, str] = {
    "hi": "हाँ, बताइए।",
    "mr": "हो, सांगा.",
    "ne": "हो, भन्नुस्।",
    "bn": "হ্যাঁ, বলুন।",
    "ta": "ஆமா, சொல்லுங்க.",
    "te": "అవును, చెప్పండి.",
    "gu": "હા, કહો.",
    "kn": "ಹೌದು, ಹೇಳಿ.",
    "ml": "ഹാ, പറയൂ.",
    "pa": "ਹਾਂ, ਦੱਸੋ.",
    "or": "ହଁ, କୁହ.",
    "as": "হয়, কওক.",
    "ur": "جی، بتائیے۔",
    "ar": "نعم، تفضل.",
    "ru": "Да, говорите.",
    "zh": "好的，请说。",
    "ja": "はい、どうぞ。",
    "ko": "네, 말씀하세요.",
}

# ── Model resolution: project models/ → HF cache → HF download ─────────────
_PROJ  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
_LOCAL = os.path.join(_PROJ, "models")
_HF    = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")

_WHISPER_NAMES = {
    "large-v3": ("faster-whisper-large-v3",  "models--Systran--faster-whisper-large-v3",  "edaa852ec7e145841d8ffdb056a99866b5f0a478"),
    "medium":   ("faster-whisper-medium",     "models--Systran--faster-whisper-medium",     "08e178d48790749d25932bbc082711ddcfdfbc4f"),
    "small":    ("faster-whisper-small",      "models--Systran--faster-whisper-small",      "536b0662742c02347bc0e980a01041f333bce120"),
    "small.en": ("faster-whisper-small.en",   "models--Systran--faster-whisper-small.en",   "d1d751a5f8271d482d14ca55d9e2deeebbae577f"),
    "base.en":  ("faster-whisper-base.en",    "models--Systran--faster-whisper-base.en",    "3d3d5dee26484f91867d81cb899cfcf72b96be6c"),
}

def _resolve_whisper(name: str) -> str:
    entry = _WHISPER_NAMES.get(name)
    if entry:
        local_folder, hf_folder, snapshot = entry
        p = os.path.join(_LOCAL, local_folder)
        if os.path.isdir(p): return p
        p = os.path.join(_HF, hf_folder, "snapshots", snapshot)
        if os.path.isdir(p): return p
    return name

_MODEL_NAME: str = _resolve_whisper(os.getenv("WHISPER_MODEL", "small"))


# ===========================================================================
# StreamingTranscriber
# ===========================================================================

class StreamingTranscriber:
    """
    Real-time PCM → text transcriber backed by Whisper large-v3.

    Supports all languages in one model — Indian (Hindi, Malayalam, Tamil,
    Telugu, Kannada, Gujarati, Punjabi, Bengali, Marathi, Odia, Assamese,
    Urdu, Nepali) and global (English, French, Arabic, Russian, Chinese, etc.)

    Input contract:
        pcm            — float32 NumPy array, 16 kHz, mono, values in [-1, 1]
        language       — BCP-47 language code string or None for auto-detect
        initial_prompt — optional Whisper context/hint string
    """

    def __init__(self, model_size: str = _MODEL_NAME) -> None:
        device, compute_type = self._best_device()
        logger.info("[STT] Loading Whisper '%s' on %s (%s) …", model_size, device, compute_type)
        self._model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            cpu_threads=6,
        )
        logger.info("[STT] Whisper ready.")

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def transcribe_pcm(
        self,
        pcm: np.ndarray,
        language: str | None = None,
        initial_prompt: str | None = None,
    ) -> str:
        """
        Transcribe a mono 16 kHz float32 PCM utterance to text.

        Returns transcribed text string, or "" on silence / empty input.
        """
        if pcm is None or len(pcm) == 0:
            return ""

        # Hard clip
        pcm = np.clip(pcm, -1.0, 1.0)

        # RMS normalise — boost quiet speech to target RMS 0.12
        current_rms = float(np.sqrt(np.mean(pcm ** 2)))
        if current_rms > 0.0005:
            gain = min(0.12 / current_rms, 30.0)
            if gain > 1.0:
                pcm = np.clip(pcm * gain, -1.0, 1.0)
                logger.debug("[STT] PCM normalised: rms %.5f → %.5f (gain=%.1fx)",
                             current_rms, min(current_rms * gain, 1.0), gain)

        # Normalise language code
        _lang = language
        if _lang == "en-in":
            _lang = "en"
        lang_hint: str | None = _lang if _lang in _ALL_SUPPORTED_LANGS else None

        # Prepend native-script seed to bias decoder toward correct script
        seed = _SCRIPT_SEEDS.get(lang_hint or "", "")
        if seed and initial_prompt:
            effective_prompt = seed + " " + initial_prompt
        elif seed:
            effective_prompt = seed
        else:
            effective_prompt = initial_prompt

        duration_sec = len(pcm) / 16_000
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp.close()
        t0 = time.perf_counter()
        try:
            self._write_wav(tmp.name, pcm)

            segments, info = self._model.transcribe(
                tmp.name,
                language=lang_hint,
                initial_prompt=effective_prompt,
                beam_size=5,
                best_of=1,
                temperature=0,
                condition_on_previous_text=False,
                vad_filter=False,
                no_speech_threshold=0.6,
            )
            result = " ".join(s.text.strip() for s in segments).strip()

            # Script validation — discard if output is in wrong script
            if result and not _script_ok(result, lang_hint):
                logger.warning(
                    "[STT] Script mismatch for lang=%s — discarding romanized output: %r",
                    lang_hint, result[:60],
                )
                result = ""

            elapsed_ms = (time.perf_counter() - t0) * 1000
            logger.info(
                "[STT] audio=%.2fs | detected=%s(%.0f%%) | %.0fms | %r",
                duration_sec,
                info.language,
                info.language_probability * 100,
                elapsed_ms,
                result[:80] if result else "(empty)",
            )
            return result

        finally:
            if os.path.exists(tmp.name):
                os.unlink(tmp.name)

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    @staticmethod
    def _write_wav(path: str, pcm: np.ndarray) -> None:
        pcm_int16 = (pcm * 32_767).astype(np.int16)
        with wave.open(path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16_000)
            wf.writeframes(pcm_int16.tobytes())

    @staticmethod
    def _best_device() -> tuple[str, str]:
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda", "float16"
        except ImportError:
            pass
        return "cpu", "float32"
