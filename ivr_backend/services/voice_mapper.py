# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | get_model_key()                  |
# | * language name to model key     |
# +----------------------------------+
#     |
#     |----> get()
#     |        * lookup by language name
#     |      OR
#     |----> get()
#     |        * return default fallback key
#     |
#     v
# +----------------------------------+
# | get_voice_name()                 |
# | * language name to display label |
# +----------------------------------+
#     |
#     |----> get()
#     |        * lookup display name
#     |      OR
#     |----> get()
#     |        * return default fallback name
#
# ================================================================

LATIN_GROUP      = ["English", "Spanish", "French"]
DEVANAGARI_GROUP = ["Hindi", "Marathi", "Nepali"]
DRAVIDIAN_GROUP  = ["Telugu", "Malayalam"]
OTHER_GROUP      = ["Russian", "Arabic", "Chinese"]

SUPPORTED_LANGUAGES = LATIN_GROUP + DEVANAGARI_GROUP + DRAVIDIAN_GROUP + OTHER_GROUP

ENGLISH_GROUP = LATIN_GROUP
HINDI_GROUP   = DEVANAGARI_GROUP

LANGUAGE_TO_MODEL: dict[str, str] = {
    "English":   "en",
    "Spanish":   "es",
    "French":    "fr",
    "Hindi":     "hi",
    "Marathi":   "hi",
    "Nepali":    "ne",
    "Telugu":    "te",
    "Malayalam": "ml",
    "Russian":   "ru",
    "Arabic":    "ar",
    "Chinese":   "zh",
}

LANGUAGE_TO_VOICE_NAME: dict[str, str] = {
    "English":   "Lessac (US)",
    "Spanish":   "Claude (MX)",
    "French":    "Siwis (FR)",
    "Hindi":     "Priyamvada (IN)",
    "Marathi":   "Priyamvada (IN)",
    "Nepali":    "Chitwan (NP)",
    "Telugu":    "Padmavathi (IN)",
    "Malayalam": "Meera (IN)",
    "Russian":   "Irina (RU)",
    "Arabic":    "Kareem (JO)",
    "Chinese":   "Huayan (CN)",
}


def get_voice_name(language: str) -> str:
    return LANGUAGE_TO_VOICE_NAME.get(language, "Lessac (US)")


def get_model_key(language: str) -> str:
    return LANGUAGE_TO_MODEL.get(language, "en")
