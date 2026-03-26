# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ DATA SOURCE — no methods defined in this file ]
#
# LANGUAGE_CONFIG consumed by:
#     |----> build_system_prompt()    * uses llm_rule per language
#     |----> generate_greeting()      * uses greeting template
#     |----> stt_sync()               * uses stt_prompt hint
#
# NATIVE_AGENT_NAMES consumed by:
#     |----> extract_agent_name()     * native script name lookup
#
# BASE_PERSONA consumed by:
#     |----> build_system_prompt()    * injects agent_name
#
# TTS_LANG_FALLBACK consumed by:
#     |----> tts()                    * language to service routing
#
# ================================================================

from pathlib import Path
from typing import Dict

BACKEND_ROOT = Path(__file__).parent.parent
PROJECT_ROOT = BACKEND_ROOT.parent

OLLAMA_URL     = "http://localhost:11434/api/chat"
OLLAMA_ENABLED = False   # Set to False to skip Ollama/Qwen warm-up entirely

LANGUAGE_CONFIG: Dict[str, dict] = {
    "en": {
        "name":         "English",
        "llm_rule":     "Reply ONLY in English.",
        "script":       "Latin",
        "greeting":     "Hello, I'm {name} from S R Comsoft. How can I help you today?",
        "canned_error": "Sorry, I had a connection issue. Could you repeat that?",
        "barge_phrases": [
            "Oh — sorry, go ahead.",
            "Yeah? I'm listening.",
            "Mm-hmm, go ahead.",
            "Sure, what is it?",
            "Okay, I'm listening.",
        ],
    },
    "hi": {
        "name":         "Hindi",
        "llm_rule":     (
            "Reply in Hindi (Devanagari script). "
            "Indian callers naturally mix English words into Hindi — this is called Hinglish and is completely normal. "
            "UNDERSTAND the caller's intent even when they use English words mid-sentence (e.g. 'website', 'error', 'software', 'password', 'download'). "
            "In your reply, use Hindi naturally but keep English technical terms as-is (do NOT force-translate them to pure Sanskrit-Hindi). "
            "Example: 'आपकी website का error fix हो जाएगा' is correct — do not say 'आपके जालस्थल का त्रुटि'."
        ),
        "stt_prompt":   (
            "हाँ, बताइए। website खुल नहीं रही, error आ रहा है, "
            "software install करना है, password reset करना है, login नहीं हो रहा, "
            "download हुआ क्या, account बंद हो गया, mobile number, call आया था, "
            "internet नहीं चल रहा, server down है, app crash हो रही है।"
        ),
        "script":       "Devanagari",
        "greeting":     "नमस्ते, मैं {name} SR Comsoft से बोल रहा हूँ। मैं आपकी कैसे मदद कर सकता हूँ?",
        "canned_error": "क्षमा करें, कनेक्शन में समस्या हुई। क्या आप दोबारा बोल सकते हैं?",
        "barge_phrases": [
            "हाँ, बोलिए?",
            "जी, कहिए।",
            "हाँ? मैं सुन रहा हूँ।",
            "ठीक है, बोलिए।",
        ],
    },
    "mr": {
        "name":         "Marathi",
        "llm_rule":     (
            "Reply in Marathi (Devanagari script). "
            "Callers often mix English technical words into Marathi — understand this naturally. "
            "In your reply, keep English technical terms (website, error, software, password, etc.) as-is; do not force-translate them."
        ),
        "stt_prompt":   (
            "हो, सांगा. website उघडत नाही, error येत आहे, "
            "software install करायचे आहे, password reset करायचे, login होत नाही, download झाले का, "
            "account band झाले, mobile number, internet चालत नाही, server down आहे."
        ),
        "script":       "Devanagari",
        "greeting":     "नमस्कार, मी {name} SR Comsoft मधून बोलत आहे. मी आपली कशी मदत करू शकतो?",
        "canned_error": "माफ करा, कनेक्शनमध्ये समस्या आली. कृपया पुन्हा सांगाल का?",
        "barge_phrases": [
            "हो, बोला?",
            "हाँ, सांगा।",
            "ठीक आहे, बोला।",
            "हो? मी ऐकतो.",
        ],
    },
    "ml": {
        "name":         "Malayalam",
        "llm_rule":     (
            "Reply in Malayalam script. "
            "Callers often mix English technical words into Malayalam — understand this naturally. "
            "Keep English technical terms (website, error, software, password, etc.) as-is in your reply."
        ),
        "stt_prompt":   (
            "ഹാ, പറയൂ. website തുറക്കുന്നില്ല, error വരുന്നു, "
            "software install ചെയ്യണം, password reset, login ആകുന്നില്ല, download ആയോ, "
            "account block ആയി, mobile number, internet ഇല്ല, server down ആയി."
        ),
        "script":       "Malayalam",
        "greeting":     "നമസ്കാരം, ഞാൻ {name} SR Comsoft ൽ നിന്നാണ്. എനിക്ക് എങ്ങനെ സഹായിക്കാം?",
        "canned_error": "ക്ഷമിക്കണം, ഒരു കണക്ഷൻ പ്രശ്നം ഉണ്ടായി. ദയവായി വീണ്ടും പറയാമോ?",
        "barge_phrases": [
            "ഹാ, പറയൂ?",
            "ഉം, കേൾക്കുന്നു.",
            "ശരി, പറഞ്ഞോ.",
            "അതെ? ഞാൻ കേൾക്കുന്നു.",
        ],
    },
    "te": {
        "name":         "Telugu",
        "llm_rule":     (
            "Reply in Telugu script. "
            "Callers often mix English technical words into Telugu — understand this naturally. "
            "Keep English technical terms (website, error, software, password, etc.) as-is in your reply."
        ),
        "stt_prompt":   (
            "అవును, చెప్పండి. website open అవ్వట్లేదు, error వస్తోంది, "
            "software install చేయాలి, password reset కావాలి, login అవ్వట్లేదు, download అయిందా, "
            "account block అయింది, mobile number, internet లేదు, server down అయింది."
        ),
        "script":       "Telugu",
        "greeting":     "నమస్కారం, నేను {name} SR Comsoft నుండి మాట్లాడుతున్నాను. నేను మీకు ఎలా సహాయం చేయగలను?",
        "canned_error": "క్షమించండి, కనెక్షన్ సమస్య వచ్చింది. మళ్ళీ చెప్పగలరా?",
        "barge_phrases": [
            "హా, చెప్పండి?",
            "అవును, వింటున్నాను.",
            "సరే, చెప్పండి.",
            "హా? నేను వింటున్నాను.",
        ],
    },
    "ta": {
        "name":         "Tamil",
        "llm_rule":     (
            "Reply in Tamil script. "
            "Callers often mix English technical words into Tamil — understand this naturally. "
            "Keep English technical terms (website, error, software, password, etc.) as-is in your reply."
        ),
        "stt_prompt":   (
            "ஆமா, சொல்லுங்க. website open ஆகல, error வருது, "
            "software install பண்ணணும், password reset பண்ணணும், login ஆகல, download ஆச்சா, "
            "account block ஆச்சு, mobile number, internet இல்ல, server down ஆச்சு."
        ),
        "script":       "Tamil",
        "greeting":     "வணக்கம், நான் {name} SR Comsoft இலிருந்து. நான் உங்களுக்கு எப்படி உதவலாம்?",
        "canned_error": "மன்னிக்கவும், இணைப்பு பிரச்சனை இருந்தது. மீண்டும் சொல்ல முடியுமா?",
        "barge_phrases": [
            "ஆமா, சொல்லுங்க?",
            "சரி, கேக்குறேன்.",
            "ஆமா, பேசுங்க.",
            "சரி? நான் கேக்குறேன்.",
        ],
    },
    "ar": {
        "name":         "Arabic",
        "llm_rule":     "Reply ONLY in Arabic.",
        "script":       "Arabic",
        "greeting":     "مرحباً، أنا {name} من SR Comsoft. كيف يمكنني مساعدتك اليوم؟",
        "canned_error": "آسف، حدثت مشكلة في الاتصال. هل يمكنك التكرار؟",
        "barge_phrases": [
            "نعم، تفضل?",
            "آه، أسمعك.",
            "حسناً، تفضل.",
            "نعم؟ أنا أسمع.",
        ],
    },
    "es": {
        "name":         "Spanish",
        "llm_rule":     "Reply ONLY in Spanish.",
        "script":       "Latin",
        "greeting":     "Hola, soy {name} de SR Comsoft. ¿En qué puedo ayudarle hoy?",
        "canned_error": "Lo siento, tuve un problema de conexión. ¿Puedes repetir eso?",
        "barge_phrases": [
            "Sí, diga?",
            "Mm-hmm, te escucho.",
            "Claro, adelante.",
            "Sí? Te estoy escuchando.",
        ],
    },
    "fr": {
        "name":         "French",
        "llm_rule":     "Reply ONLY in French.",
        "script":       "Latin",
        "greeting":     "Bonjour, je suis {name} de SR Comsoft. Comment puis-je vous aider aujourd'hui?",
        "canned_error": "Désolé, j'ai eu un problème de connexion. Pouvez-vous répéter?",
        "barge_phrases": [
            "Oui, allez-y?",
            "Mm-hmm, je vous écoute.",
            "D'accord, continuez.",
            "Oui? Je vous écoute.",
        ],
    },
    "ru": {
        "name":         "Russian",
        "llm_rule":     "Reply ONLY in Russian.",
        "script":       "Cyrillic",
        "greeting":     "Здравствуйте, я {name} из SR Comsoft. Чем могу помочь?",
        "canned_error": "Извините, возникла проблема с соединением. Можете повторить?",
        "barge_phrases": [
            "Да, слушаю?",
            "Угу, говорите.",
            "Хорошо, продолжайте.",
            "Да? Я слушаю.",
        ],
    },
    "ne": {
        "name":         "Nepali",
        "llm_rule":     (
            "Reply in Nepali (Devanagari script). "
            "Callers often mix English technical words into Nepali — understand this naturally. "
            "Keep English technical terms (website, error, software, password, etc.) as-is in your reply."
        ),
        "stt_prompt":   (
            "हजुर, भन्नुस्. website खुलेन, error आयो, "
            "software install गर्नुस्, password reset गर्नु छ, login भएन, download भयो कि, "
            "account band भयो, mobile number, internet चल्दैन, server down भयो।"
        ),
        "script":       "Devanagari",
        "greeting":     "नमस्ते, म {name} SR Comsoft बाट बोल्दैछु। म कसरी सहयोग गर्न सक्छु?",
        "canned_error": "माफ गर्नुस्, जडान समस्या भयो। कृपया फेरि भन्नुहुन्छ?",
        "barge_phrases": [
            "हजुर, बोल्नुस्?",
            "हाँ, सुनिरहेको छु।",
            "ठीक छ, भन्नुस्।",
            "हो? म सुनिरहेको छु।",
        ],
    },
    "zh": {
        "name":         "Chinese",
        "llm_rule":     "Reply ONLY in Simplified Chinese.",
        "script":       "Chinese",
        "greeting":     "您好，我是SR Comsoft的{name}，请问有什么需要帮助的？",
        "canned_error": "抱歉，连接出现问题。您能重复一下吗？",
        "barge_phrases": [
            "嗯，说吧?",
            "好的，我听着。",
            "您说吧。",
            "嗯? 我在听。",
        ],
    },
}

SUPPORTED_STT_LANGS = set(LANGUAGE_CONFIG.keys())

TTS_LANG_FALLBACK: Dict[str, str] = {
    "mr": "hi",
}

NATIVE_AGENT_NAMES: Dict[str, Dict[str, str]] = {
    "pratham":    {"hi": "प्रथम",      "mr": "प्रथम"},
    "rohan":      {"hi": "रोहन",       "mr": "रोहन"},
    "priyamvada": {"hi": "प्रियम्वदा", "mr": "प्रियंवदा"},

    "arjun":      {"ml": "അർജുൻ"},
    "meera":      {"ml": "മീര"},

    "maya":       {"te": "మాయ"},
    "padmavathi": {"te": "పద్మావతి"},
    "venkatesh":  {"te": "వెంకటేష్"},

    "chitwan":    {"ne": "चितवन"},

    "denis":      {"ru": "Денис"},
    "dmitri":     {"ru": "Дмитрий"},
    "irina":      {"ru": "Ирина"},

    "kareem":     {"ar": "كريم"},

    "chaowen":    {"zh": "超文"},
    "huayan":     {"zh": "花颜"},
    "xiao_ya":    {"zh": "小雅"},
}

BASE_PERSONA = (
    "You are {agent_name}, a real human working in a professional call center at SR Comsoft.\n\n"
    "You are not a robot. You are not scripted. You are a real person.\n\n"
    "LANGUAGE UNDERSTANDING — CRITICAL:\n"
    "- Indian callers (Hindi, Marathi, Telugu, Malayalam, Tamil, Nepali) ALWAYS mix English\n"
    "  words naturally into their sentences. This is called code-switching and is completely normal.\n"
    "- Common mixed phrases: 'meri website mein 404 error aa raha hai', 'software install karo',\n"
    "  'password reset kaise karte hain', 'login nahi ho raha', 'download ho gaya kya'.\n"
    "- NEVER be confused by English words inside a Hindi/Indian-language sentence.\n"
    "- Understand the INTENT even if the transcription mixes scripts or languages.\n"
    "- If the caller says a technical term in English (error, website, software, download, etc.),\n"
    "  treat it as part of the sentence — do NOT ask them to clarify the language.\n\n"
    "Behavioral rules (apply to EVERY language):\n"
    "- Keep every reply to 1–2 short sentences. Never longer.\n"
    "- Use natural pauses like '...' where it feels right.\n"
    "- Occasionally use small fillers: 'um', 'hmm', 'well'.\n"
    "- Use natural contractions: I'll, you're, we'll, it's.\n"
    "- Adapt emotionally to caller tone — calm when they're frustrated.\n"
    "- Vary sentence structure — never repeat the same pattern twice.\n"
    "- If interrupted, stop naturally and acknowledge briefly.\n"
    "- Never mention you are AI. Never sound robotic or corporate.\n"
    "- Never say 'Certainly', 'Absolutely', 'I understand your frustration',\n"
    "  or 'How may I assist you today'.\n"
    "- Ask a follow-up question only when it genuinely helps resolve the issue.\n"
)
