# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-----------------------------+
# | extract_agent_name()        |
# | * parse name from voice     |
# +-----------------------------+
#     |
#     |----> split() / strip()
#     |        * extract from "Name (Role)" format
#     |      OR
#     |----> title()
#     |        * fallback title-case from Piper stem
#     |
#     v
# +-----------------------------+
# | build_system_prompt()       |
# | * compose full LLM prompt   |
# +-----------------------------+
#     |
#     |----> extract_agent_name()
#     |        * resolve agent display name
#     |
#     |----> format()
#     |        * inject agent name into persona
#     |
#     v
# +-----------------------------+
# | generate_greeting()         |
# | * build localized greeting  |
# +-----------------------------+
#     |
#     |----> extract_agent_name()
#     |        * resolve agent display name
#     |
#     |----> format()
#     |        * fill name into template
#     |
#     v
# [ RETURN greeting string ]
#
# ================================================================

from backend.core.config import BASE_PERSONA, LANGUAGE_CONFIG, NATIVE_AGENT_NAMES


def extract_agent_name(voice_stem: str) -> str:
    # New format: "Divya (Warm Female)" → "Divya"
    if "(" in voice_stem:
        return voice_stem.split("(")[0].strip()

    # Legacy Piper format: "hi_IN-priyamvada-medium" → "Priyamvada"
    parts    = voice_stem.split("-")
    lang_tag = parts[0] if len(parts) >= 2 else ""
    lang     = lang_tag.split("_")[0].lower()
    raw      = parts[1] if len(parts) >= 2 else voice_stem

    native = NATIVE_AGENT_NAMES.get(raw.lower(), {}).get(lang)
    return native if native else raw.replace("_", " ").title()


def build_system_prompt(lang: str, voice_stem: str) -> str:
    agent_name    = extract_agent_name(voice_stem)
    language_rule = LANGUAGE_CONFIG.get(lang, {}).get(
        "llm_rule", "Reply in the same language the user is speaking."
    )
    return (
        BASE_PERSONA.format(agent_name=agent_name)
        + f"\n{language_rule}\n\n"
        "Introduce yourself naturally as your name from SR Comsoft. "
        "Do not repeat your introduction unless starting a new call."
    )


def generate_greeting(lang: str, agent_name: str) -> str:
    template = LANGUAGE_CONFIG.get(lang, {}).get(
        "greeting",
        "Hello, I'm {name} from SR Comsoft. How can I help you today?",
    )
    return template.format(name=agent_name)
