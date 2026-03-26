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

PRESETS = {
    "neutral": {
        "description": "speaks clearly and professionally like a friendly Indian call center agent",
    },
    "happy": {
        "description": "speaks in a warm, cheerful and welcoming manner like a helpful Indian customer service agent",
    },
    "sad": {
        "description": "speaks softly and empathetically like an Indian call center agent expressing understanding and concern",
    },
    "angry": {
        "description": "speaks firmly and seriously with a controlled, assertive tone like an Indian escalation specialist",
    },
    "urgent": {
        "description": "speaks quickly and alertly with urgency like an Indian call center agent handling a critical issue",
    },
    "calm": {
        "description": "speaks slowly and reassuringly like a patient Indian call center agent resolving a customer problem",
    },
}

EMOTION_LABELS = list(PRESETS.keys())

VOICES = {
    "Divya (Warm Female)": {
        "gender": "female",
        "description": "Divya is a female Indian speaker with a warm, slightly high-pitched voice and a clear Indian accent speaking very fast",
    },
    "Rohit (Professional Male)": {
        "gender": "male",
        "description": "Rohit is a male Indian speaker with a confident, low-pitched professional voice and a clear Indian accent speaking very fast",
    },

    "Aditi (Clear Female)": {
        "gender": "female",
        "description": "Aditi is a female Indian speaker with a clear, crisp, slightly high-pitched voice and a neutral Indian English accent speaking very fast",
    },
    "Aakash (Assertive Male)": {
        "gender": "male",
        "description": "Aakash is a male Indian speaker with a strong, assertive, low-pitched voice and a clear Indian English accent speaking very fast",
    },

    "Sunita (Fluent Female)": {
        "gender": "female",
        "description": "Sunita is a female Indian speaker with a soft, fluent, high-pitched voice and a clear Indian accent speaking very fast",
    },
    "Sanjay (Calm Male)": {
        "gender": "male",
        "description": "Sanjay is a male Indian speaker with a calm, composed, slightly low-pitched voice and a clear Indian accent speaking very fast",
    },

    "Riya (Warm Female)": {
        "gender": "female",
        "description": "Riya is a female Indian speaker with a warm, slightly high-pitched voice and a clear Bengali Indian accent speaking very fast",
    },
    "Sourav (Professional Male)": {
        "gender": "male",
        "description": "Sourav is a male Indian speaker with a confident, low-pitched professional voice and a clear Bengali Indian accent speaking very fast",
    },

    "Kavitha (Clear Female)": {
        "gender": "female",
        "description": "Kavitha is a female Indian speaker with a clear, slightly high-pitched voice and a crisp Tamil Indian accent speaking very fast",
    },
    "Karthik (Calm Male)": {
        "gender": "male",
        "description": "Karthik is a male Indian speaker with a calm, low-pitched composed voice and a clear Tamil Indian accent speaking very fast",
    },

    "Padma (Bright Female)": {
        "gender": "female",
        "description": "Padma is a female Indian speaker with a bright, high-pitched voice and a clear Telugu Indian accent speaking very fast",
    },
    "Venkat (Authoritative Male)": {
        "gender": "male",
        "description": "Venkat is a male Indian speaker with a strong, low-pitched authoritative voice and a clear Telugu Indian accent speaking very fast",
    },

    "Nisha (Warm Female)": {
        "gender": "female",
        "description": "Nisha is a female Indian speaker with a warm, high-pitched voice and a clear Gujarati Indian accent speaking very fast",
    },
    "Bhavesh (Professional Male)": {
        "gender": "male",
        "description": "Bhavesh is a male Indian speaker with a confident, slightly low-pitched professional voice and a clear Gujarati Indian accent speaking very fast",
    },

    "Rekha (Clear Female)": {
        "gender": "female",
        "description": "Rekha is a female Indian speaker with a clear, slightly high-pitched voice and a crisp Kannada Indian accent speaking very fast",
    },
    "Sunil (Calm Male)": {
        "gender": "male",
        "description": "Sunil is a male Indian speaker with a calm, low-pitched composed voice and a clear Kannada Indian accent speaking very fast",
    },

    "Lakshmi (Soft Female)": {
        "gender": "female",
        "description": "Lakshmi is a female Indian speaker with a soft, gentle, high-pitched voice and a clear Malayalam Indian accent speaking very fast",
    },
    "Sreejith (Warm Male)": {
        "gender": "male",
        "description": "Sreejith is a male Indian speaker with a warm, low-pitched baritone voice and a clear Malayalam Indian accent speaking very fast",
    },

    "Gurpreet (Bright Female)": {
        "gender": "female",
        "description": "Gurpreet is a female Indian speaker with a bright, high-pitched lively voice and a clear Punjabi Indian accent speaking very fast",
    },
    "Harjinder (Deep Male)": {
        "gender": "male",
        "description": "Harjinder is a male Indian speaker with a deep, low-pitched resonant voice and a clear Punjabi Indian accent speaking very fast",
    },

    "Smita (Warm Female)": {
        "gender": "female",
        "description": "Smita is a female Indian speaker with a warm, slightly high-pitched voice and a clear Odia Indian accent speaking very fast",
    },
    "Bibhuti (Professional Male)": {
        "gender": "male",
        "description": "Bibhuti is a male Indian speaker with a confident, low-pitched professional voice and a clear Odia Indian accent speaking very fast",
    },

    "Mousumi (Soft Female)": {
        "gender": "female",
        "description": "Mousumi is a female Indian speaker with a soft, gentle, high-pitched voice and a clear Assamese Indian accent speaking very fast",
    },
    "Dipen (Calm Male)": {
        "gender": "male",
        "description": "Dipen is a male Indian speaker with a calm, slightly low-pitched composed voice and a clear Assamese Indian accent speaking very fast",
    },

    "Zara (Warm Female)": {
        "gender": "female",
        "description": "Zara is a female Indian speaker with a warm, slightly high-pitched voice and a clear Urdu Indian accent speaking very fast",
    },
    "Faraz (Professional Male)": {
        "gender": "male",
        "description": "Faraz is a male Indian speaker with a confident, low-pitched professional voice and a clear Urdu Indian accent speaking very fast",
    },

    "Priya (Bright Female)": {
        "gender": "female",
        "description": "Priya is a female Indian speaker with a bright, high-pitched voice and a clear Indian accent speaking very fast at a fast pace",
    },
    "Ananya (Clear Female)": {
        "gender": "female",
        "description": "Ananya is a female Indian speaker with a clear, slightly high-pitched voice and a crisp Indian accent speaking very fast",
    },
    "Kavya (Young Female)": {
        "gender": "female",
        "description": "Kavya is a young female Indian speaker with a high-pitched, energetic voice and a clear Indian accent speaking very fast and lively",
    },
    "Meera (Mature Female)": {
        "gender": "female",
        "description": "Meera is a mature female Indian speaker with a composed, slightly high-pitched voice and a clear Indian accent speaking very fast",
    },
    "Arjun (Warm Male)": {
        "gender": "male",
        "description": "Arjun is a male Indian speaker with a warm, low-pitched baritone voice and a clear Indian accent speaking very fast",
    },
    "Rahul (Clear Male)": {
        "gender": "male",
        "description": "Rahul is a male Indian speaker with a clear, slightly low-pitched voice and a crisp Indian accent speaking very fast",
    },
    "Vikram (Authoritative Male)": {
        "gender": "male",
        "description": "Vikram is a male Indian speaker with a strong, low-pitched authoritative voice and a clear Indian accent speaking very fast at a fast pace",
    },
    "Rohan (Soft Male)": {
        "gender": "male",
        "description": "Rohan is a male Indian speaker with a soft, slightly low-pitched gentle voice and a clear Indian accent speaking very fast",
    },
    "Suresh (Deep Male)": {
        "gender": "male",
        "description": "Suresh is a male Indian speaker with a deep, low-pitched resonant voice and a clear Indian accent speaking very fast",
    },
    "Aditya (Young Male)": {
        "gender": "male",
        "description": "Aditya is a young male Indian speaker with a slightly low-pitched, energetic voice and a clear Indian accent speaking very fast",
    },
}

VOICE_LABELS = list(VOICES.keys())

LANGUAGES = {
    "Hindi":            {"native": "हिन्दी",    "voices": ["Divya (Warm Female)",    "Rohit (Professional Male)"]},
    "English (Indian)": {"native": "English",    "voices": ["Aditi (Clear Female)",   "Aakash (Assertive Male)"]},
    "Marathi":          {"native": "मराठी",      "voices": ["Sunita (Fluent Female)", "Sanjay (Calm Male)"]},
    "Bengali":          {"native": "বাংলা",      "voices": ["Riya (Warm Female)",     "Sourav (Professional Male)"]},
    "Tamil":            {"native": "தமிழ்",      "voices": ["Kavitha (Clear Female)", "Karthik (Calm Male)"]},
    "Telugu":           {"native": "తెలుగు",     "voices": ["Padma (Bright Female)",  "Venkat (Authoritative Male)"]},
    "Gujarati":         {"native": "ગુજરાતી",    "voices": ["Nisha (Warm Female)",    "Bhavesh (Professional Male)"]},
    "Kannada":          {"native": "ಕನ್ನಡ",      "voices": ["Rekha (Clear Female)",   "Sunil (Calm Male)"]},
    "Malayalam":        {"native": "മലയാളം",     "voices": ["Lakshmi (Soft Female)",  "Sreejith (Warm Male)"]},
    "Punjabi":          {"native": "ਪੰਜਾਬੀ",     "voices": ["Gurpreet (Bright Female)","Harjinder (Deep Male)"]},
    "Odia":             {"native": "ଓଡ଼ିଆ",      "voices": ["Smita (Warm Female)",    "Bibhuti (Professional Male)"]},
    "Assamese":         {"native": "অসমীয়া",    "voices": ["Mousumi (Soft Female)",  "Dipen (Calm Male)"]},
    "Urdu":             {"native": "اردو",       "voices": ["Zara (Warm Female)",     "Faraz (Professional Male)"]},
}

LANGUAGE_LABELS = list(LANGUAGES.keys())
