# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ DATA SOURCE — no methods defined in this file ]
#
# Module-level constants consumed by PersonaManager:
#     |----> <PersonaManager> -> guard()
#     |        * enforces language-to-voice mapping
#     |
#     |----> <PersonaManager> -> build_description()
#     |        * reads VOICES and PRESETS dicts
#
# ================================================================

# Emotion presets
# speed_desc : embedded into Parler TTS prompt to control speaking rate
# style      : embedded into Parler TTS prompt to control tone/expression
PRESETS = {
    "neutral": {
        "speed_desc":  "at a moderate pace",
        "style":       "clear and professional",
    },
    "happy": {
        "speed_desc":  "quite fast",
        "style":       "expressive and animated, warm and upbeat",
    },
    "sad": {
        "speed_desc":  "slowly",
        "style":       "soft and gentle",
    },
    "angry": {
        "speed_desc":  "at a slightly fast pace",
        "style":       "firm and assertive, very expressive",
    },
    "urgent": {
        "speed_desc":  "very fast",
        "style":       "high energy, urgent and alert",
    },
    "calm": {
        "speed_desc":  "slowly",
        "style":       "smooth, composed and reassuring",
    },
}

EMOTION_LABELS = list(PRESETS.keys())

# Each voice is bound to a real named speaker from the parler-tts-mini-v1.1
# training roster. Using named speakers (Laura, Gary, etc.) anchors the voice
# identity so every generation sounds consistent for that character.
# pitch_desc and speed_desc are embedded verbatim into the Parler prompt.
VOICES = {
    # --- English ---
    "Emma (Warm Female)": {
        "gender":         "female",
        "parler_speaker": "Laura",
        "pitch_desc":     "slightly high-pitched",
        "quality":        "warm and clear",
    },
    "James (Professional Male)": {
        "gender":         "male",
        "parler_speaker": "Gary",
        "pitch_desc":     "low-pitched",
        "quality":        "confident and professional",
    },
    # --- French ---
    "Sophie (Clear Female)": {
        "gender":         "female",
        "parler_speaker": "Lea",
        "pitch_desc":     "slightly high-pitched",
        "quality":        "clear and articulate",
    },
    "Louis (Calm Male)": {
        "gender":         "male",
        "parler_speaker": "Jon",
        "pitch_desc":     "slightly low-pitched",
        "quality":        "calm and composed",
    },
    # --- German ---
    "Lena (Bright Female)": {
        "gender":         "female",
        "parler_speaker": "Karen",
        "pitch_desc":     "high-pitched",
        "quality":        "bright and crisp",
    },
    "Klaus (Deep Male)": {
        "gender":         "male",
        "parler_speaker": "David",
        "pitch_desc":     "very low-pitched",
        "quality":        "deep and authoritative",
    },
    # --- Spanish ---
    "Maria (Warm Female)": {
        "gender":         "female",
        "parler_speaker": "Brenda",
        "pitch_desc":     "slightly high-pitched",
        "quality":        "warm and expressive",
    },
    "Carlos (Professional Male)": {
        "gender":         "male",
        "parler_speaker": "Rick",
        "pitch_desc":     "low-pitched",
        "quality":        "professional and clear",
    },
    # --- Portuguese ---
    "Ana (Soft Female)": {
        "gender":         "female",
        "parler_speaker": "Eileen",
        "pitch_desc":     "slightly high-pitched",
        "quality":        "soft and fluent",
    },
    "Pedro (Calm Male)": {
        "gender":         "male",
        "parler_speaker": "Jordan",
        "pitch_desc":     "slightly low-pitched",
        "quality":        "calm and clear",
    },
    # --- Polish ---
    "Zofia (Clear Female)": {
        "gender":         "female",
        "parler_speaker": "Joy",
        "pitch_desc":     "slightly high-pitched",
        "quality":        "clear and professional",
    },
    "Marek (Warm Male)": {
        "gender":         "male",
        "parler_speaker": "Will",
        "pitch_desc":     "low-pitched",
        "quality":        "warm and composed",
    },
    # --- Italian ---
    "Giulia (Expressive Female)": {
        "gender":         "female",
        "parler_speaker": "Danielle",
        "pitch_desc":     "slightly high-pitched",
        "quality":        "expressive and warm",
    },
    "Marco (Professional Male)": {
        "gender":         "male",
        "parler_speaker": "James",
        "pitch_desc":     "low-pitched",
        "quality":        "professional and clear",
    },
    # --- Dutch ---
    "Fenna (Clear Female)": {
        "gender":         "female",
        "parler_speaker": "Yann",
        "pitch_desc":     "slightly high-pitched",
        "quality":        "clear and crisp",
    },
    "Lars (Calm Male)": {
        "gender":         "male",
        "parler_speaker": "Mike",
        "pitch_desc":     "low-pitched",
        "quality":        "calm and professional",
    },
}

VOICE_LABELS = list(VOICES.keys())

LANGUAGES = {
    "English":    {"native": "English",    "voices": ["Emma (Warm Female)",         "James (Professional Male)"]},
    "French":     {"native": "Français",   "voices": ["Sophie (Clear Female)",      "Louis (Calm Male)"]},
    "German":     {"native": "Deutsch",    "voices": ["Lena (Bright Female)",       "Klaus (Deep Male)"]},
    "Spanish":    {"native": "Español",    "voices": ["Maria (Warm Female)",        "Carlos (Professional Male)"]},
    "Portuguese": {"native": "Português",  "voices": ["Ana (Soft Female)",          "Pedro (Calm Male)"]},
    "Polish":     {"native": "Polski",     "voices": ["Zofia (Clear Female)",       "Marek (Warm Male)"]},
    "Italian":    {"native": "Italiano",   "voices": ["Giulia (Expressive Female)", "Marco (Professional Male)"]},
    "Dutch":      {"native": "Nederlands", "voices": ["Fenna (Clear Female)",       "Lars (Calm Male)"]},
}

LANGUAGE_LABELS = list(LANGUAGES.keys())
