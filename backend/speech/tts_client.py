# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-----------------------------+
# | build_voice_registry()      |
# | * build static voice dict   |
# +-----------------------------+
#     |
#     v
# +-----------------------------+
# | _humanize_text()            |
# | * normalize target text     |
# +-----------------------------+
#     |
#     |----> _normalize_for_tts()
#     |        * transliterate to native script
#     |
#     |----> endswith()
#     |        * ensure terminal punctuation
#     |
#     v
# +-----------------------------+
# | tts()                       |
# | * async TTS entry point     |
# +-----------------------------+
#     |
#     |----> run_in_executor()
#     |        * offload HTTP call
#     |
#     v
# +-----------------------------+
# | _http_tts_sync()            |
# | * blocking HTTP TTS call    |
# +-----------------------------+
#     |
#     |----> post()
#     |        * POST to generate endpoint
#     |
#     |----> get()
#     |        * download WAV bytes
#     |
#     v
# [ END ]
#
# ================================================================
# SERVICE ROUTING TABLE
# ================================================================
#
#   GLOBAL TTS  (human_tts  — http://localhost:8003)
#   ┌──────────────────────────────────────────────────┐
#   │  en  English     fr  French      de  German      │
#   │  es  Spanish     pt  Portuguese  pl  Polish      │
#   │  it  Italian     nl  Dutch                       │
#   └──────────────────────────────────────────────────┘
#
#   INDIC TTS   (human_tts_2 — http://localhost:8004)
#   ┌──────────────────────────────────────────────────┐
#   │  hi  Hindi       bn  Bengali     ta  Tamil       │
#   │  te  Telugu      mr  Marathi     gu  Gujarati    │
#   │  kn  Kannada     ml  Malayalam   pa  Punjabi     │
#   │  or  Odia        as  Assamese    ur  Urdu        │
#   │  en-in  English (Indian)                        │
#   └──────────────────────────────────────────────────┘
#
# ================================================================

import asyncio
import logging
import os
import random
import re

import requests as _req

logger = logging.getLogger("callcenter.tts")

# ---------------------------------------------------------------------------
# TTS service endpoints — overridable via environment variables
# ---------------------------------------------------------------------------
_GLOBAL_TTS_URL: str = os.getenv("GLOBAL_TTS_URL", "http://localhost:8003")
_INDIC_TTS_URL:  str = os.getenv("INDIC_TTS_URL",  "http://localhost:8004")

# Maps BCP-47 language code → (display language name sent to TTS service, service base URL)
# The display name must exactly match the LANGUAGES key in each service's presets.py.
_LANG_TO_TTS: dict[str, tuple[str, str]] = {
    # ── Global TTS (human_tts, Parler TTS, port 8003) ───────────────────────
    "en":    ("English",           _GLOBAL_TTS_URL),
    "fr":    ("French",            _GLOBAL_TTS_URL),
    "de":    ("German",            _GLOBAL_TTS_URL),
    "es":    ("Spanish",           _GLOBAL_TTS_URL),
    "pt":    ("Portuguese",        _GLOBAL_TTS_URL),
    "pl":    ("Polish",            _GLOBAL_TTS_URL),
    "it":    ("Italian",           _GLOBAL_TTS_URL),
    "nl":    ("Dutch",             _GLOBAL_TTS_URL),
    # ── Indic TTS (human_tts_2, Indic Parler TTS, port 8004) ─────────────────
    "hi":    ("Hindi",             _INDIC_TTS_URL),
    "bn":    ("Bengali",           _INDIC_TTS_URL),
    "ta":    ("Tamil",             _INDIC_TTS_URL),
    "te":    ("Telugu",            _INDIC_TTS_URL),
    "mr":    ("Marathi",           _INDIC_TTS_URL),
    "gu":    ("Gujarati",          _INDIC_TTS_URL),
    "kn":    ("Kannada",           _INDIC_TTS_URL),
    "ml":    ("Malayalam",         _INDIC_TTS_URL),
    "pa":    ("Punjabi",           _INDIC_TTS_URL),
    "or":    ("Odia",              _INDIC_TTS_URL),
    "as":    ("Assamese",          _INDIC_TTS_URL),
    "ur":    ("Urdu",              _INDIC_TTS_URL),
    "en-in": ("English (Indian)",  _INDIC_TTS_URL),
}

# ---------------------------------------------------------------------------
# English→native script transliteration tables (unchanged)
# Injected into TTS text so the model reads technical terms correctly.
# ---------------------------------------------------------------------------
_TTS_NORMALIZE: dict[str, dict[str, str]] = {
    "hi": {
        "website":      "वेबसाइट",
        "websites":     "वेबसाइट्स",
        "webpage":      "वेबपेज",
        "url":          "यूआरएल",
        "urls":         "यूआरएल",
        "http":         "एचटीटीपी",
        "https":        "एचटीटीपीएस",
        "internet":     "इंटरनेट",
        "network":      "नेटवर्क",
        "server":       "सर्वर",
        "domain":       "डोमेन",
        "ip":           "आईपी",
        "wifi":         "वाईफाई",
        "browser":      "ब्राउज़र",
        "login":        "लॉगिन",
        "logout":       "लॉगआउट",
        "password":     "पासवर्ड",
        "username":     "यूज़रनेम",
        "account":      "अकाउंट",
        "otp":          "ओटीपी",
        "email":        "ईमेल",
        "download":     "डाउनलोड",
        "upload":       "अपलोड",
        "install":      "इंस्टॉल",
        "update":       "अपडेट",
        "reset":        "रिसेट",
        "refresh":      "रिफ्रेश",
        "click":        "क्लिक",
        "search":       "सर्च",
        "open":         "ओपन",
        "delete":       "डिलीट",
        "submit":       "सबमिट",
        "load":         "लोड",
        "loading":      "लोडिंग",
        "software":     "सॉफ्टवेयर",
        "app":          "ऐप",
        "apps":         "ऐप्स",
        "system":       "सिस्टम",
        "computer":     "कंप्यूटर",
        "mobile":       "मोबाइल",
        "phone":        "फ़ोन",
        "screen":       "स्क्रीन",
        "database":     "डेटाबेस",
        "api":          "एपीआई",
        "cache":        "कैश",
        "data":         "डेटा",
        "error":        "एरर",
        "errors":       "एरर",
        "issue":        "इशू",
        "issues":       "इशू",
        "bug":          "बग",
        "crash":        "क्रैश",
        "support":      "सपोर्ट",
        "ticket":       "टिकट",
        "link":         "लिंक",
        "page":         "पेज",
        "file":         "फ़ाइल",
        "folder":       "फ़ोल्डर",
        "button":       "बटन",
        "message":      "मैसेज",
        "chat":         "चैट",
        "notification": "नोटिफिकेशन",
        "setting":      "सेटिंग",
        "settings":     "सेटिंग्स",
        "profile":      "प्रोफ़ाइल",
        "form":         "फ़ॉर्म",
        "icon":         "आइकन",
        "popup":        "पॉपअप",
        "tab":          "टैब",
        "ok":           "ओके",
    },
    "te": {
        "website":  "వెబ్‌సైట్",
        "url":      "యూఆర్ఎల్",
        "internet": "ఇంటర్నెట్",
        "network":  "నెట్‌వర్క్",
        "server":   "సర్వర్",
        "browser":  "బ్రౌజర్",
        "login":    "లాగిన్",
        "logout":   "లాగ్అవుట్",
        "password": "పాస్‌వర్డ్",
        "account":  "అకౌంట్",
        "email":    "ఇమెయిల్",
        "otp":      "ఓటీపీ",
        "download": "డౌన్‌లోడ్",
        "upload":   "అప్‌లోడ్",
        "install":  "ఇన్‌స్టాల్",
        "update":   "అప్‌డేట్",
        "reset":    "రీసెట్",
        "software": "సాఫ్ట్‌వేర్",
        "app":      "యాప్",
        "error":    "ఎర్రర్",
        "issue":    "ఇష్యూ",
        "support":  "సపోర్ట్",
        "data":     "డేటా",
        "mobile":   "మొబైల్",
        "phone":    "ఫోన్",
        "screen":   "స్క్రీన్",
        "click":    "క్లిక్",
        "search":   "సెర్చ్",
        "open":     "ఓపెన్",
        "delete":   "డిలీట్",
        "file":     "ఫైల్",
        "link":     "లింక్",
        "page":     "పేజీ",
        "message":  "మెసేజ్",
        "setting":  "సెట్టింగ్",
        "settings": "సెట్టింగ్స్",
        "profile":  "ప్రొఫైల్",
    },
    "ml": {
        "website":  "വെബ്‌സൈറ്റ്",
        "url":      "യൂആർഎൽ",
        "internet": "ഇന്റർനെറ്റ്",
        "network":  "നെറ്റ്‌വർക്ക്",
        "server":   "സെർവർ",
        "browser":  "ബ്രൗസർ",
        "login":    "ലോഗിൻ",
        "logout":   "ലോഗൗട്ട്",
        "password": "പാസ്‌വേഡ്",
        "account":  "അക്കൗണ്ട്",
        "email":    "ഇമെയിൽ",
        "otp":      "ഒടിപി",
        "download": "ഡൗൺലോഡ്",
        "upload":   "അപ്‌ലോഡ്",
        "install":  "ഇൻസ്‌റ്റാൾ",
        "update":   "അപ്‌ഡേറ്റ്",
        "reset":    "റീസെറ്റ്",
        "software": "സോഫ്‌റ്റ്‌വെയർ",
        "app":      "ആപ്പ്",
        "error":    "എറർ",
        "issue":    "ഇഷ്യൂ",
        "support":  "സപ്പോർട്ട്",
        "data":     "ഡേറ്റ",
        "mobile":   "മൊബൈൽ",
        "phone":    "ഫോൺ",
        "click":    "ക്ലിക്ക്",
        "search":   "സേർച്ച്",
        "open":     "ഓപ്പൺ",
        "delete":   "ഡിലീറ്റ്",
        "file":     "ഫയൽ",
        "link":     "ലിങ്ക്",
        "page":     "പേജ്",
        "message":  "മെസ്സേജ്",
        "setting":  "സെറ്റിങ",
        "settings": "സെറ്റിങ്‌സ്",
        "profile":  "പ്രൊഫൈൽ",
    },
    "ta": {
        "website":  "வெப்சைட்",
        "url":      "யூஆர்எல்",
        "internet": "இன்டர்நெட்",
        "network":  "நெட்வொர்க்",
        "server":   "சர்வர்",
        "browser":  "பிரவுசர்",
        "login":    "லாகின்",
        "logout":   "லாக்அவுட்",
        "password": "பாஸ்வேர்ட்",
        "account":  "அக்கவுண்ட்",
        "email":    "இமெயில்",
        "otp":      "ஓடிபி",
        "download": "டவுன்லோட்",
        "upload":   "அப்லோட்",
        "install":  "இன்ஸ்டால்",
        "update":   "அப்டேட்",
        "reset":    "ரீசெட்",
        "software": "சாப்ட்வேர்",
        "app":      "ஆப்",
        "error":    "எர்ரர்",
        "issue":    "இசு",
        "support":  "சப்போர்ட்",
        "data":     "டேட்டா",
        "mobile":   "மொபைல்",
        "phone":    "ஃபோன்",
        "click":    "கிளிக்",
        "search":   "சர்ச்",
        "open":     "ஓப்பன்",
        "delete":   "டிலீட்",
        "file":     "பைல்",
        "link":     "லிங்க்",
        "page":     "பேஜ்",
        "message":  "மெசேஜ்",
        "setting":  "செட்டிங்",
        "settings": "செட்டிங்ஸ்",
        "profile":  "புரொஃபைல்",
    },
}
# Marathi and Nepali share the Hindi transliteration table
_TTS_NORMALIZE["mr"] = _TTS_NORMALIZE["hi"]
_TTS_NORMALIZE["ne"] = _TTS_NORMALIZE["hi"]

# Pre-compile regex patterns per language (longest-match, case-insensitive)
_TTS_PATTERNS: dict[str, re.Pattern] = {}
for _lang, _table in _TTS_NORMALIZE.items():
    _words = sorted(_table.keys(), key=len, reverse=True)
    _TTS_PATTERNS[_lang] = re.compile(
        r"\b(" + "|".join(re.escape(w) for w in _words) + r")\b",
        re.IGNORECASE,
    )


# ===========================================================================
# Text preprocessing helpers (unchanged — feed into TTS services as-is)
# ===========================================================================

def _normalize_for_tts(text: str, lang: str) -> str:
    """Replace English technical terms with native-script equivalents."""
    pattern = _TTS_PATTERNS.get(lang)
    if pattern is None:
        return text
    table = _TTS_NORMALIZE[lang]
    return pattern.sub(lambda m: table[m.group(0).lower()], text)


def _humanize_text(text: str, lang: str) -> str:
    """
    Post-process LLM reply text before passing to TTS:
      1. Transliterate English technical terms to native script.
      2. Ensure terminal punctuation so TTS adds a natural pause.
      3. 15% chance to prepend a conversational filler for English.
    """
    text = text.strip()
    if not text:
        return text
    text = _normalize_for_tts(text, lang)
    if text[-1] not in ".?!":
        text += "."
    if lang == "en" and random.random() < 0.15:
        text = random.choice(["Well, ", "So, ", "Hmm... ", "Right, "]) + text
    return text


# ===========================================================================
# Voice registry builder
# ===========================================================================

def build_voice_registry() -> dict:
    """
    Return the full voice registry keyed by BCP-47 language code.

    Each entry is a list of voice dicts:
        {"name": "<display voice name>", "display_lang": "<TTS service language key>"}

    The registry is built from the known LANGUAGES/VOICES defined in both
    human_tts (Global) and human_tts_2 (Indic) presets.  It is intentionally
    static so the backend can start independently of the TTS microservices.
    """
    # ── Global TTS voices (human_tts — Parler TTS, port 8003) ────────────────
    _GLOBAL: dict[str, tuple[str, list[str]]] = {
        "en": ("English",    ["Emma (Warm Female)",         "James (Professional Male)"]),
        "fr": ("French",     ["Sophie (Clear Female)",      "Louis (Calm Male)"]),
        "de": ("German",     ["Lena (Bright Female)",       "Klaus (Deep Male)"]),
        "es": ("Spanish",    ["Maria (Warm Female)",        "Carlos (Professional Male)"]),
        "pt": ("Portuguese", ["Ana (Soft Female)",          "Pedro (Calm Male)"]),
        "pl": ("Polish",     ["Zofia (Clear Female)",       "Marek (Warm Male)"]),
        "it": ("Italian",    ["Giulia (Expressive Female)", "Marco (Professional Male)"]),
        "nl": ("Dutch",      ["Fenna (Clear Female)",       "Lars (Calm Male)"]),
    }

    # ── Indic TTS voices (human_tts_2 — Indic Parler TTS, port 8004) ─────────
    _INDIC: dict[str, tuple[str, list[str]]] = {
        "hi":    ("Hindi",            ["Divya (Warm Female)",      "Rohit (Professional Male)"]),
        "en-in": ("English (Indian)", ["Aditi (Clear Female)",     "Aakash (Assertive Male)"]),
        "mr":    ("Marathi",          ["Sunita (Fluent Female)",   "Sanjay (Calm Male)"]),
        "bn":    ("Bengali",          ["Riya (Warm Female)",       "Sourav (Professional Male)"]),
        "ta":    ("Tamil",            ["Kavitha (Clear Female)",   "Karthik (Calm Male)"]),
        "te":    ("Telugu",           ["Padma (Bright Female)",    "Venkat (Authoritative Male)"]),
        "gu":    ("Gujarati",         ["Nisha (Warm Female)",      "Bhavesh (Professional Male)"]),
        "kn":    ("Kannada",          ["Rekha (Clear Female)",     "Sunil (Calm Male)"]),
        "ml":    ("Malayalam",        ["Lakshmi (Soft Female)",    "Sreejith (Warm Male)"]),
        "pa":    ("Punjabi",          ["Gurpreet (Bright Female)", "Harjinder (Deep Male)"]),
        "or":    ("Odia",             ["Smita (Warm Female)",      "Bibhuti (Professional Male)"]),
        "as":    ("Assamese",         ["Mousumi (Soft Female)",    "Dipen (Calm Male)"]),
        "ur":    ("Urdu",             ["Zara (Warm Female)",       "Faraz (Professional Male)"]),
    }

    registry: dict[str, list[dict]] = {}
    for lang_code, (display_lang, voices) in {**_GLOBAL, **_INDIC}.items():
        registry[lang_code] = [
            {"name": v, "display_lang": display_lang} for v in voices
        ]
    return registry


# ===========================================================================
# HTTP TTS — calls the correct microservice and returns raw WAV bytes
# ===========================================================================

def _http_tts_sync(
    text:       str,
    lang:       str,
    voice_name: str,
    emotion:    str = "neutral",
) -> bytes:
    """
    Blocking HTTP call to the appropriate TTS microservice.

    Flow:
      1. Resolve service URL + display language from _LANG_TO_TTS.
      2. POST /generate → receive audio file URL.
      3. GET /audio/<file> → return raw WAV bytes.

    Returns empty bytes on any error so the caller can degrade gracefully
    instead of crashing the call session.

    Args:
        text       : Text to synthesise (already humanized).
        lang       : BCP-47 language code (e.g. "hi", "en", "ta").
        voice_name : Display voice name matching the service's VOICES dict
                     (e.g. "Divya (Warm Female)", "Emma (Warm Female)").
        emotion    : Emotion preset key: neutral/happy/sad/angry/urgent/calm.
    """
    entry = _LANG_TO_TTS.get(lang)
    if entry is None:
        logger.warning("[TTS] No HTTP service mapped for lang=%r — skipping", lang)
        return b""

    display_lang, service_url = entry

    try:
        # Step 1 — request audio generation from the TTS microservice
        gen = _req.post(
            f"{service_url}/generate",
            json={
                "text":       text,
                "emotion":    emotion,
                "voice_name": voice_name,
                "language":   display_lang,
            },
            timeout=600,
        )
        gen.raise_for_status()
        audio_path: str = gen.json()["url"]   # e.g. "/audio/rec1.wav"

        # Step 2 — download the generated WAV file
        wav = _req.get(f"{service_url}{audio_path}", timeout=60)
        wav.raise_for_status()

        logger.debug(
            "[TTS] %s | lang=%s voice=%r emotion=%s → %d bytes",
            "indic" if service_url == _INDIC_TTS_URL else "global",
            lang, voice_name, emotion, len(wav.content),
        )
        return wav.content

    except Exception as exc:
        logger.error(
            "[TTS] HTTP TTS failed | lang=%s voice=%r: %s",
            lang, voice_name, exc,
        )
        return b""


async def tts(
    text:       str,
    lang:       str,
    voice_name: str,
    emotion:    str = "neutral",
) -> bytes:
    """
    Async TTS entry point.

    Routes to Global TTS (human_tts) or Indic TTS (human_tts_2) based on
    the language code, then returns raw WAV bytes for the caller to stream.

    Args:
        text       : Reply text (will NOT be humanized here — caller must call
                     _humanize_text() before passing in if needed).
        lang       : BCP-47 language code.
        voice_name : Display voice name from the voice registry.
        emotion    : Emotion preset (default: "neutral").
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _http_tts_sync, text, lang, voice_name, emotion
    )
