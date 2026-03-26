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
#     |----> <LANGUAGE_TO_MODEL> -> get()    * lookup by language name
#     |
#     |----> return model key string         * e.g. "en", "hi", "te"
#     |       OR
#     |----> return "en"                     * default fallback
#     |
#     v
# +----------------------------------+
# | get_voice_name()                 |
# | * language name to display label |
# +----------------------------------+
#     |
#     |----> <LANGUAGE_TO_VOICE_NAME> -> get()  * lookup display name
#     |
#     |----> return voice label string          * e.g. "Lessac (US)"
#     |       OR
#     |----> return "Lessac (US)"               * default fallback
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
