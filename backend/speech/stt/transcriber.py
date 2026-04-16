# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# ── StreamingTranscriber (real-time, used by app.py) ─────────────────────
#
# [ START ]
#     |
#     v
# +------------------------------------------+
# | __init__()                               |
# | * load Whisper model                     |
# +------------------------------------------+
#     |
#     |----> _best_device()
#     |        * pick CUDA or CPU
#     |
#     v
# +------------------------------------------+
# | transcribe_pcm()                         |
# | * PCM to text string                     |
# +------------------------------------------+
#     |
#     |----> process_audio_for_stt()
#     |        * resample to 16k mono
#     |
#     |----> _build_prompt()
#     |        * merge context prompts
#     |
#     |----> <WhisperModel> -> transcribe()
#     |        * Whisper inference
#     |
#     |----> _script_ok()
#     |        * validate script output
#     |
#     v
# [ END ]
#
# ── AudioTranscriber ──────────────────────────────────────────────────────
#
# [ START ]
#     |
#     v
# +------------------------------------------+
# | __init__()                               |
# | * load Whisper on device                 |
# +------------------------------------------+
#     |
#     |----> _best_device()
#     |        * pick CUDA or CPU
#     |
#     v
# +------------------------------------------+
# | transcribe()                             |
# | * WAV path to text                       |
# +------------------------------------------+
#     |
#     |----> process_audio_for_stt()
#     |        * resample file to 16k
#     |
#     |----> _build_prompt()
#     |        * merge context prompts
#     |
#     |----> <WhisperModel> -> transcribe()
#     |        * Whisper inference
#     |
#     |----> _script_ok()
#     |        * validate script output
#     |
#     v
# [ END ]
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
import time

import numpy as np
from faster_whisper import WhisperModel

from backend.audio.preprocessor import process_audio_for_stt

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Language sets
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
# Script Unicode ranges — for output script validation
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
    """Return True if text contains at least one char from the expected script.
    Latin-script languages always return True."""
    if not language or language not in _SCRIPT_RANGES:
        return True
    if not text or not text.strip():
        return True
    lo, hi = _SCRIPT_RANGES[language]
    return any(lo <= ord(ch) <= hi for ch in text)


# ---------------------------------------------------------------------------
# INDIC_PROMPTS — rich full-sentence context prompts.
#
# WHY THIS BEATS SINGLE-WORD SEEDS:
#   Whisper's decoder is conditioned on the initial_prompt as "prior context".
#   A full sentence in the target script does two things simultaneously:
#     1. Forces the BPE tokenizer down the correct script's token branch,
#        eliminating Romanisation / transliteration hallucinations.
#     2. Signals "conversational, informal, may contain tech terms" so the
#        decoder doesn't over-correct to formal/literary vocabulary.
# ---------------------------------------------------------------------------
INDIC_PROMPTS: dict[str, str] = {
    "hi": "यह एक हिंदी वार्तालाप है। इसमें तकनीकी शब्द भी हो सकते हैं।",
    "en": "This is an Indian English conversation. It may contain technical terms and local nuances.",
    "mr": "हा एक मराठी संवाद आहे. यात तांत्रिक शब्द असू शकतात.",
    "bn": "এটি একটি বাংলা কথোপকথন। এতে প্রযুক্তিগত শব্দও থাকতে পারে।",
    "ta": "இது ஒரு தமிழ் உரையாடல். இதில் தொழில்நுட்ப வார்த்தைகளும் இருக்கலாம்.",
    "te": "ఇది తెలుగు సంభాషణ. ఇందులో సాంకేతిక పదాలు కూడా ఉండవచ్చు.",
    "gu": "આ એક ગુજરાતી વાતચીત છે. આમાં તકનીકી શબ્દો પણ હોઈ શકે છે.",
    "kn": "ಇದು ಕನ್ನಡ ಸಂಭಾಷಣೆ. ಇದರಲ್ಲಿ ತಾಂತ್ರಿಕ ಪದಗಳೂ ಇರಬಹುದು.",
    "ml": "ഈ സംഭാഷണം മലയാളത്തിലാണ്. ഇതിൽ സാങ്കേതിക പദങ്ങളും ഉൾപ്പെടുന്നു.",
    "pa": "ਇਹ ਇੱਕ ਪੰਜਾਬੀ ਗੱਲਬਾਤ ਹੈ। ਇਸ ਵਿੱਚ ਤਕਨੀਕੀ ਸ਼ਬਦ ਵੀ ਹੋ ਸਕਦੇ ਹਨ।",
    "or": "ଏହା ଏକ ଓଡ଼ିଆ କଥୋପକଥନ | ଏଥିରେ ବୈଷୟିକ ଶବ୍ଦ ମଧ୍ୟ ଥାଇପାରେ |",
    "as": "এইটো এটা অসমীয়া কথোপকথন। ইয়াত কাৰিকৰী শব্দও থাকিব পাৰে।",
    "ur": "یہ ایک اردو گفتگو ہے۔ اس میں تکنیکی الفاظ بھی ہو سکتے ہیں۔",
    # ── Global TTS languages (human_tts — port 8003) ────────────────────────
    "fr": "C'est une conversation en français. Elle peut contenir des termes techniques.",
    "de": "Dies ist ein deutschsprachiges Gespräch. Es kann Fachbegriffe enthalten.",
    "es": "Esta es una conversación en español. Puede contener términos técnicos.",
    "pt": "Esta é uma conversa em português. Pode conter termos técnicos.",
    "pl": "To jest rozmowa w języku polskim. Może zawierać terminy techniczne.",
    "it": "Questa è una conversazione in italiano. Può contenere termini tecnici.",
    "nl": "Dit is een gesprek in het Nederlands. Het kan technische termen bevatten.",
    # ── Other non-Indic seeds ────────────────────────────────────────────────
    "ar": "نعم، تفضل.",
    "ru": "Да, говорите.",
    "zh": "好的，请说。",
    "ja": "はい、どうぞ。",
    "ko": "네, 말씀하세요.",
    "ne": "हो, भन्नुस्।",
    "tr": "Bu bir Türkçe konuşmadır. Teknik terimler içerebilir.",
    # en-in maps to Indian English — explicit entry prevents silent fallback to None
    "en-in": "This is an Indian English conversation. It may contain technical terms and local nuances.",
}

# ── Model resolution: project-local models/ folder takes priority ────────────
#    Place models at:  voice-ai-core/models/faster-whisper-small/  etc.
#    Falls back to ~/.cache/huggingface/hub/, then HF auto-download.
_PROJECT_ROOT  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
_LOCAL_MODELS  = os.path.join(_PROJECT_ROOT, "models")
_HF            = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")

_WHISPER_NAMES = {
    "large-v3": ("faster-whisper-large-v3",  "models--Systran--faster-whisper-large-v3",  "edaa852ec7e145841d8ffdb056a99866b5f0a478"),
    "medium":   ("faster-whisper-medium",     "models--Systran--faster-whisper-medium",     "08e178d48790749d25932bbc082711ddcfdfbc4f"),
    "small":    ("faster-whisper-small",      "models--Systran--faster-whisper-small",      "536b0662742c02347bc0e980a01041f333bce120"),
    "small.en": ("faster-whisper-small.en",   "models--Systran--faster-whisper-small.en",   "d1d751a5f8271d482d14ca55d9e2deeebbae577f"),
    "base.en":  ("faster-whisper-base.en",    "models--Systran--faster-whisper-base.en",    "3d3d5dee26484f91867d81cb899cfcf72b96be6c"),
}

def _resolve_whisper(name: str) -> str:
    """Priority: project models/ → HF cache → HF auto-download."""
    entry = _WHISPER_NAMES.get(name)
    if entry:
        local_folder, hf_folder, snapshot = entry
        # 1. project-local models/ folder
        p = os.path.join(_LOCAL_MODELS, local_folder)
        if os.path.isdir(p):
            return p
        # 2. HF cache snapshot
        p = os.path.join(_HF, hf_folder, "snapshots", snapshot)
        if os.path.isdir(p):
            return p
    # 3. Let faster-whisper download from HF
    return name

_MODEL_NAME: str = _resolve_whisper(os.getenv("WHISPER_MODEL", "large-v3"))

# ---------------------------------------------------------------------------
# Shared inference defaults — tuned for real-time voice bots
# ---------------------------------------------------------------------------
_INFER_DEFAULTS: dict = dict(
    beam_size=3,                           # 40 % faster than 5; ample for short utterances
    best_of=1,
    temperature=0.0,                       # deterministic — no sampling noise
    condition_on_previous_text=False,      # prevents cross-utterance hallucination loops
    vad_filter=True,                       # Silero VAD strips silence before decode
    vad_parameters=dict(
        min_silence_duration_ms=300,       # aggressive silence cut for voice bots
        speech_pad_ms=100,                 # keep 100 ms padding around speech
        threshold=0.45,                    # balanced — rejects noise, passes real speech
    ),
    no_speech_threshold=0.3,
    word_timestamps=False,                 # skip per-word alignment; saves ~5 ms
    without_timestamps=False,             # keep segment-level timestamps for logging
)


def _build_prompt(lang_hint: str | None, extra: str | None = None) -> str | None:
    """
    Build the initial_prompt by combining:
      1. INDIC_PROMPTS full-sentence context  (script anchor + domain signal)
      2. Any caller-supplied extra hint        (e.g. agent persona / call topic)

    Returns None if nothing available — avoids passing empty string to whisper.
    """
    parts: list[str] = []
    if lang_hint:
        base = INDIC_PROMPTS.get(lang_hint)
        if base:
            parts.append(base)
    if extra:
        parts.append(extra.strip())
    return " ".join(parts) if parts else None


# ===========================================================================
# StreamingTranscriber  (real-time PCM → text, used by app.py)
# ===========================================================================

class StreamingTranscriber:
    """
    Real-time PCM → text transcriber backed by Whisper large-v3.
    Single model handles all Indian and global languages.

    Input: float32 NumPy array, 16 kHz mono, values in [-1, 1].

    Key optimisation: audio is passed as a NumPy array directly to
    faster-whisper — the old temp-WAV write is eliminated, saving
    10-30 ms of disk I/O per utterance.
    """

    def __init__(self, model_size: str = _MODEL_NAME) -> None:
        device, compute_type = self._best_device()
        logger.info("[STT] Loading Whisper '%s' on %s (%s) …", model_size, device, compute_type)
        try:
            self._model = WhisperModel(
                model_size,
                device=device,
                compute_type=compute_type,
                cpu_threads=os.cpu_count() or 4,
                num_workers=2,
            )
        except RuntimeError as e:
            if "out of memory" in str(e).lower() and device == "cuda":
                logger.warning("[STT] GPU OOM — falling back to CPU (Ollama is using GPU memory)")
                self._model = WhisperModel(
                    model_size,
                    device="cpu",
                    compute_type="int8",
                    cpu_threads=os.cpu_count() or 4,
                    num_workers=2,
                )
            else:
                raise
        logger.info("[STT] Whisper ready.")

    def transcribe_pcm(
        self,
        pcm: np.ndarray,
        language: str | None = None,
        initial_prompt: str | None = None,
    ) -> str:
        """
        Transcribe a mono 16 kHz float32 PCM utterance to text.

        The incoming `pcm` is run through the audio preprocessor to
        guarantee correct sample rate, channel count, and RMS level
        before being handed to faster-whisper — no temp files written.
        """
        if pcm is None or len(pcm) == 0:
            return ""

        # Normalise via the shared preprocessor (clip + RMS boost).
        # Passes the numpy array directly — no temp file, no bytes conversion.
        pcm = process_audio_for_stt(pcm)

        _lang = language
        if _lang == "en-in":
            _lang = "en"
        lang_hint: str | None = _lang if _lang in _ALL_SUPPORTED_LANGS else None

        prompt = _build_prompt(lang_hint, initial_prompt)
        duration_sec = len(pcm) / 16_000

        t0 = time.perf_counter()
        segments, info = self._model.transcribe(
            pcm,                        # NumPy array — no disk I/O
            language=lang_hint,
            initial_prompt=prompt,
            **_INFER_DEFAULTS,
        )
        result = " ".join(s.text.strip() for s in segments).strip()

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

    @staticmethod
    def _best_device() -> tuple[str, str]:
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda", "int8_float16"
        except ImportError:
            pass
        return "cpu", "float32"


# ===========================================================================
# AudioTranscriber  (batch WAV → dict, used by translator service)
# ===========================================================================

class AudioTranscriber:
    """
    Batch WAV-file transcriber backed by Whisper large-v3.
    Accepts a file path, preprocesses it in-memory, and returns
    text, language, confidence, and segments.
    """

    def __init__(
        self,
        model_size: str = _MODEL_NAME,
        device: str = "cpu",
    ) -> None:
        compute_type = "float32" if device == "cpu" else "float16"
        logger.info("[STT] Loading AudioTranscriber '%s' on %s (%s) …", model_size, device, compute_type)
        self._model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            cpu_threads=os.cpu_count() or 4,
            num_workers=2,
        )
        logger.info("[STT] AudioTranscriber ready.")

    def transcribe(self, file_path: str, language: str | None = None) -> dict:
        """
        Transcribe a WAV/audio file to text.

        The file is preprocessed to 16 kHz mono via process_audio_for_stt
        before inference — handles mismatched sample rates from field recordings.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"[STT] Audio file not found: {file_path}")

        _lang = language
        if _lang == "en-in":
            _lang = "en"
        lang_hint: str | None = _lang if _lang in _ALL_SUPPORTED_LANGS else None

        prompt = _build_prompt(lang_hint)
        start = time.perf_counter()

        # Preprocess to guaranteed 16k mono float32 numpy array
        pcm = process_audio_for_stt(file_path)

        segments_gen, info = self._model.transcribe(
            pcm,
            language=lang_hint,
            initial_prompt=prompt,
            **_INFER_DEFAULTS,
        )

        segments = list(segments_gen)
        elapsed = time.perf_counter() - start
        logger.info("[STT] Batch transcription completed in %.2fs", elapsed)

        text = " ".join(s.text.strip() for s in segments).strip()

        if text and not _script_ok(text, lang_hint):
            logger.warning("[STT] Script mismatch for lang=%s — discarding: %r", lang_hint, text[:60])
            text = ""

        return {
            "text":       text,
            "language":   info.language,
            "confidence": info.language_probability,
            "segments":   segments,
        }

    @staticmethod
    def _best_device() -> tuple[str, str]:
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda", "int8_float16"
        except ImportError:
            pass
        return "cpu", "float32"
