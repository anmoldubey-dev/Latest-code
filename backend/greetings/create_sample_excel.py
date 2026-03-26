# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | sys.path.insert()                |
# | * bootstrap project import path  |
# +----------------------------------+
#     |
#     v
# +----------------------------------+
# | DataFrame()                      |
# | * build two-column greeting data |
# +----------------------------------+
#     |
#     |----> to_excel()
#     |        * write greetings.xlsx to disk
#     |
#     v
# [ END ]
#
# ================================================================

import sys
from pathlib import Path

_HERE    = Path(__file__).resolve().parent
_BACKEND = _HERE.parent
_PROJECT = _BACKEND.parent
for _p in (_PROJECT, _BACKEND):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

try:
    from backend.core.config import LANGUAGE_CONFIG
    ROWS = [
        (lang, cfg["greeting"])
        for lang, cfg in LANGUAGE_CONFIG.items()
        if "greeting" in cfg
    ]
except ImportError:
    ROWS = [
        ("en", "Hello, I'm {name} from SR Comsoft. How can I help you today?"),
        ("hi", "नमस्ते, मैं {name} SR Comsoft से बोल रहा हूँ। मैं आपकी कैसे मदद कर सकता हूँ?"),
        ("mr", "नमस्कार, मी {name} SR Comsoft मधून बोलत आहे. मी आपली कशी मदत करू शकतो?"),
        ("ml", "നമസ്കാരം, ഞാൻ {name} SR Comsoft ൽ നിന്നാണ്. എനിക്ക് എങ്ങനെ സഹായിക്കാം?"),
        ("te", "నమస్కారం, నేను {name} SR Comsoft నుండి మాట్లాడుతున్నాను. నేను మీకు ఎలా సహాయం చేయగలను?"),
        ("ta", "வணக்கம், நான் {name} SR Comsoft இலிருந்து. நான் உங்களுக்கு எப்படி உதவலாம்?"),
        ("ar", "مرحباً، أنا {name} من SR Comsoft. كيف يمكنني مساعدتك اليوم؟"),
        ("es", "Hola, soy {name} de SR Comsoft. ¿En qué puedo ayudarle hoy?"),
        ("fr", "Bonjour, je suis {name} de SR Comsoft. Comment puis-je vous aider aujourd'hui?"),
        ("ru", "Здравствуйте, я {name} из SR Comsoft. Чем могу помочь?"),
        ("ne", "नमस्ते, म {name} SR Comsoft बाट बोल्दैछु। म कसरी सहयोग गर्न सक्छु?"),
        ("zh", "您好，我是SR Comsoft的{name}，请问有什么需要帮助的？"),
    ]

try:
    import pandas as pd
except ImportError:
    raise SystemExit(
        "pandas is not installed.  Run:\n"
        "    pip install pandas openpyxl\n"
        "then re-run this script."
    )

OUT = _HERE / "greetings.xlsx"
df  = pd.DataFrame(ROWS, columns=["lang", "greeting"])
df.to_excel(OUT, sheet_name="greetings", index=False)

print(f"Created : {OUT}")
print(f"Rows    : {len(df)}")
print(f"Langs   : {list(df['lang'])}")
print()
print("Edit greetings.xlsx in Excel / LibreOffice to customise any greeting.")
print("Keep {name} in the text — it is replaced with the agent name at runtime.")
print("Changes take effect on the next WebSocket call (no server restart).")
