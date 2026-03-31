# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +---------------------------+
# | lifespan()                |
# | * load M2M-100 on startup |
# +---------------------------+
#     |
#     |----> <TranslatorEngine> -> __init__()
#     |        * load M2M-100 NMT model
#     |
#     v
# +---------------------------+
# | health()                  |
# | * return service status   |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | languages()               |
# | * return supported langs  |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | http_translate()          |
# | * text-to-text translate  |
# +---------------------------+
#     |
#     |----> <TranslatorEngine> -> translate()
#     |        * M2M-100 beam search
#     |
#     v
# [ END ]
#
# ================================================================

import os
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

TRANSLATOR_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT    = os.path.dirname(TRANSLATOR_ROOT)   # = services/

for _p in (TRANSLATOR_ROOT, PROJECT_ROOT):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from log_utils import setup_logger, log_execution   # noqa: E402  (needs sys.path above)

logger = setup_logger("translator")

# All languages supported by facebook/m2m100_418M
LANGUAGES: dict[str, str] = {
    "af": "Afrikaans", "am": "Amharic", "ar": "Arabic", "ast": "Asturian",
    "az": "Azerbaijani", "ba": "Bashkir", "be": "Belarusian", "bg": "Bulgarian",
    "bn": "Bengali", "br": "Breton", "bs": "Bosnian", "ca": "Catalan",
    "ceb": "Cebuano", "cs": "Czech", "cy": "Welsh", "da": "Danish",
    "de": "German", "el": "Greek", "en": "English", "es": "Spanish",
    "et": "Estonian", "fa": "Persian", "ff": "Fulah", "fi": "Finnish",
    "fr": "French", "fy": "Western Frisian", "ga": "Irish", "gd": "Scottish Gaelic",
    "gl": "Galician", "gu": "Gujarati", "ha": "Hausa", "he": "Hebrew",
    "hi": "Hindi", "hr": "Croatian", "ht": "Haitian Creole", "hu": "Hungarian",
    "hy": "Armenian", "id": "Indonesian", "ig": "Igbo", "ilo": "Ilocano",
    "is": "Icelandic", "it": "Italian", "ja": "Japanese", "jv": "Javanese",
    "ka": "Georgian", "kk": "Kazakh", "km": "Khmer", "kn": "Kannada",
    "ko": "Korean", "lb": "Luxembourgish", "lg": "Luganda", "ln": "Lingala",
    "lo": "Lao", "lt": "Lithuanian", "lv": "Latvian", "mg": "Malagasy",
    "mk": "Macedonian", "ml": "Malayalam", "mn": "Mongolian", "mr": "Marathi",
    "ms": "Malay", "my": "Burmese", "ne": "Nepali", "nl": "Dutch",
    "no": "Norwegian", "ns": "Northern Sotho", "oc": "Occitan", "or": "Odia",
    "pa": "Punjabi", "pl": "Polish", "ps": "Pashto", "pt": "Portuguese",
    "ro": "Romanian", "ru": "Russian", "sd": "Sindhi", "si": "Sinhala",
    "sk": "Slovak", "sl": "Slovenian", "so": "Somali", "sq": "Albanian",
    "sr": "Serbian", "ss": "Swati", "su": "Sundanese", "sv": "Swedish",
    "sw": "Swahili", "ta": "Tamil", "th": "Thai", "tl": "Filipino",
    "tn": "Tswana", "tr": "Turkish", "uk": "Ukrainian", "ur": "Urdu",
    "uz": "Uzbek", "vi": "Vietnamese", "wo": "Wolof", "xh": "Xhosa",
    "yi": "Yiddish", "yo": "Yoruba", "zh": "Chinese", "zu": "Zulu",
}

models: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    _t0 = time.perf_counter()
    logger.info("[START] lifespan  at=%s", datetime.now().strftime("%H:%M:%S"))

    logger.info("[1/1] Loading M2M-100 translation model …")
    from translation.translator_engine import TranslatorEngine
    models["translator"] = TranslatorEngine()
    logger.info("[1/1] Translation ready.")

    logger.info(
        "[END]   lifespan  elapsed=%.3fs  — translator ready on http://localhost:8002",
        time.perf_counter() - _t0,
    )
    yield

    models.clear()
    logger.info("Models released.  Shutdown complete.")


app = FastAPI(title="Translator Service", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
@log_execution(rate_limit=60)
async def health() -> dict:
    return {
        "status": "ok",
        "models_loaded": list(models.keys()),
    }


@app.get("/languages")
@log_execution
async def languages() -> dict:
    return {"languages": LANGUAGES}


@app.post("/translate")
@log_execution
async def http_translate(request: Request) -> dict:
    """
    Text-to-text translation endpoint for backend integration.

    Request JSON: {"text": str, "src_lang": str, "tgt_lang": str}
    Response:     {"translated": str, "src_lang": str, "tgt_lang": str}

    src_lang / tgt_lang use M2M-100 language codes, e.g. "en", "hi", "ta".
    Returns {"translated": ""} with HTTP 200 when the model is not loaded.
    """
    body = await request.json()
    text     = body.get("text", "").strip()
    src_lang = body.get("src_lang", "en")
    tgt_lang = body.get("tgt_lang", "en")

    if not text or src_lang == tgt_lang:
        return {"translated": text, "src_lang": src_lang, "tgt_lang": tgt_lang}

    translator = models.get("translator")
    if translator is None:
        logger.warning("/translate called before translator model loaded")
        return {"translated": text, "src_lang": src_lang, "tgt_lang": tgt_lang}

    translated = translator.translate(text, src_lang, tgt_lang)
    logger.info(
        "[/translate] %s→%s  %d→%d chars",
        src_lang, tgt_lang, len(text), len(translated),
    )
    return {"translated": translated, "src_lang": src_lang, "tgt_lang": tgt_lang}


