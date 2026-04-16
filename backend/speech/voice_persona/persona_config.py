# =============================================================================
# FILE: persona_config.py
# DESC: Static registry of VoicePersona definitions and lookup helpers.
# =============================================================================
#
# EXECUTION FLOW
# =============================================================================
#
#  +--------------------------------+
#  | PERSONA_REGISTRY               |
#  | * static dict of personas      |
#  +--------------------------------+
#           |
#           v
#  +--------------------------------+
#  | get_persona()                  |
#  | * case-insensitive name lookup |
#  +--------------------------------+
#           |
#           v
#  +--------------------------------+
#  | personas_for_lang()            |
#  | * filter personas by lang code |
#  +--------------------------------+
#
# =============================================================================
"""
persona_config
==============
Static registry of Voice Persona definitions.

Each persona specifies:
- display_name      : Human-readable label
- lang_codes        : Languages this persona supports
- pitch_shift       : Semitones relative to model baseline (float)
- speed_factor      : Playback speed multiplier (0.8–1.3 range)
- tts_description   : Parler-TTS style description string
- parler_speaker_id : Speaker ID used by Parler for this voice
- clone_ref_audio   : Optional path to reference WAV for voice-cloning

Adding a new persona: append an entry to PERSONA_REGISTRY and create a
matching greeting/voice preset in ``backend/core/config.py`` if needed.

License: Apache 2.0
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass(frozen=True)
class VoicePersona:
    """Immutable descriptor for one agent voice persona."""

    # Identity
    name:         str
    display_name: str
    lang_codes:   List[str] = field(default_factory=list)

    # Acoustic modulation
    pitch_shift:  float = 0.0    # semitones; negative = lower
    speed_factor: float = 1.0    # 1.0 = natural speed

    # Parler TTS
    tts_description:   str = ""
    parler_speaker_id: str = ""

    # Voice cloning
    clone_ref_audio:   Optional[str] = None   # absolute or relative path to WAV
    cloning_enabled:   bool          = False


# ------------------------------------------------------------------
# Default persona pool — extend as needed
# ------------------------------------------------------------------

PERSONA_REGISTRY: Dict[str, VoicePersona] = {

    # ── English personas ────────────────────────────────────────
    "aria": VoicePersona(
        name         = "aria",
        display_name = "Aria (EN-F warm)",
        lang_codes   = ["en"],
        pitch_shift  = 1.5,
        speed_factor = 1.0,
        tts_description = (
            "Aria speaks with a warm, clear American accent. "
            "Her voice is calm and professional, with natural intonation."
        ),
        parler_speaker_id = "Aria",
    ),

    "james": VoicePersona(
        name         = "james",
        display_name = "James (EN-M authoritative)",
        lang_codes   = ["en"],
        pitch_shift  = -2.0,
        speed_factor = 0.97,
        tts_description = (
            "James speaks with a deep, confident British accent. "
            "His tone is authoritative but approachable."
        ),
        parler_speaker_id = "James",
    ),

    # ── Hindi / Indic personas ───────────────────────────────────
    "priya": VoicePersona(
        name         = "priya",
        display_name = "Priya (HI-F natural)",
        lang_codes   = ["hi", "mr", "ne"],
        pitch_shift  = 1.0,
        speed_factor = 1.02,
        tts_description = (
            "Priya speaks fluent Hindi with a warm, natural Delhi accent. "
            "Her voice is clear and friendly."
        ),
        parler_speaker_id = "Priya",
    ),

    "rajan": VoicePersona(
        name         = "rajan",
        display_name = "Rajan (HI-M calm)",
        lang_codes   = ["hi", "mr"],
        pitch_shift  = -1.5,
        speed_factor = 0.98,
        tts_description = (
            "Rajan speaks in calm, measured Hindi. "
            "His voice projects reliability and professionalism."
        ),
        parler_speaker_id = "Rajan",
    ),

    "meera": VoicePersona(
        name         = "meera",
        display_name = "Meera (ML-F gentle)",
        lang_codes   = ["ml", "ta"],
        pitch_shift  = 0.5,
        speed_factor = 1.0,
        tts_description = (
            "Meera speaks gentle, melodic Malayalam with a Kochi accent. "
            "Soft, empathetic, and clear."
        ),
        parler_speaker_id = "Meera",
    ),

    "arjun": VoicePersona(
        name         = "arjun",
        display_name = "Arjun (TE-M confident)",
        lang_codes   = ["te"],
        pitch_shift  = -1.0,
        speed_factor = 1.0,
        tts_description = (
            "Arjun speaks confident Telugu with a Hyderabad accent. "
            "His voice is clear and professional."
        ),
        parler_speaker_id = "Arjun",
    ),

    # ── Cloned persona (example) ─────────────────────────────────
    "custom_clone": VoicePersona(
        name             = "custom_clone",
        display_name     = "Custom Clone",
        lang_codes       = ["en", "hi"],
        pitch_shift      = 0.0,
        speed_factor     = 1.0,
        tts_description  = "A custom cloned voice.",
        cloning_enabled  = True,
        clone_ref_audio  = None,   # set at runtime via API
    ),
}


def get_persona(name: str) -> Optional[VoicePersona]:
    """Case-insensitive persona lookup; returns None if not found."""
    return PERSONA_REGISTRY.get(name.lower())


def personas_for_lang(lang: str) -> List[VoicePersona]:
    """Return all personas that support a given language code."""
    return [p for p in PERSONA_REGISTRY.values() if lang in p.lang_codes]
