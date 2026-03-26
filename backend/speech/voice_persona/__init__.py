"""
voice_persona
=============
Voice Persona Engine — modulation, persona config, and voice-cloner client.

Sub-modules
-----------
persona_config  : static persona definitions (voice presets per agent)
persona_engine  : runtime modulation (tone, pitch, speed, SSML generation)
cloner_client   : HTTP client to the voice-cloner microservice (port 8005)

License: Apache 2.0
"""

from .persona_engine import PersonaEngine, get_persona_engine
from .persona_config import PERSONA_REGISTRY, VoicePersona

__all__ = [
    "PersonaEngine",
    "get_persona_engine",
    "PERSONA_REGISTRY",
    "VoicePersona",
]
