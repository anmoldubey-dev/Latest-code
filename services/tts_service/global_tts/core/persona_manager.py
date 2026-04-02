# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#    |
#    v
# +-------------------------------+
# | __init__()                    |
# | * init cache and active key   |
# +-------------------------------+
#    |
#    v
# +-------------------------------+
# | build_description()           |
# | * compose Parler TTS prompt   |
# +-------------------------------+
#    |
#    |----> get()
#    |        * fetch voice profile dict
#    |
#    |----> get()
#    |        * fetch emotion style text
#    |
#    v
# +-------------------------------+
# | get_or_encode()               |
# | * tokenize and cache tensor   |
# +-------------------------------+
#    |
#    |----> build_description()
#    |        * assemble description string
#    |
#    |----> <Tokenizer> -> __call__()
#    |        * encode to input tensor on cache miss
#    |
#    v
# +-------------------------------+
# | guard()                       |
# | * enforce language guardrail  |
# +-------------------------------+
#    |
#    |----> voices_for_language()
#    |        * get valid voice list
#    |
#    v
# +-------------------------------+
# | clear_cache()                 |
# | * reset all cached tensors    |
# +-------------------------------+
#
# ================================================================

import logging
import torch
from typing import Optional

from core.presets import VOICES, PRESETS, LANGUAGES

logger = logging.getLogger(__name__)

INFERENCE_SEED = 2026


class PersonaManager:

    def __init__(self):
        self._cache: dict[str, tuple] = {}
        self._active_key: Optional[str] = None

    def build_description(
        self,
        voice_name: str,
        emotion: str,
        language: str,
        custom_style: Optional[str] = None,
        custom_speed: Optional[str] = None,
    ) -> str:
        voice      = VOICES.get(voice_name, {})
        # IDENTITY LOCK: speaker + pitch_desc are ALWAYS pulled from VOICES
        speaker    = voice.get("parler_speaker", "Laura")
        pitch_desc = voice.get("pitch_desc", "slightly high-pitched")

        if custom_style or custom_speed:
            # Dynamic behavior injection — identity stays locked
            preset = PRESETS.get(emotion, PRESETS["neutral"])
            style      = custom_style or preset["style"]
            speed_desc = custom_speed or preset["speed_desc"]
        else:
            preset     = PRESETS.get(emotion, PRESETS["neutral"])
            speed_desc = preset["speed_desc"]
            style      = preset["style"]

        lang_note = language if language else "English"

        return (
            f"{speaker}'s voice is {pitch_desc} and {style}, "
            f"speaking {lang_note} {speed_desc}. "
            f"The recording is very close-sounding, very clear, "
            f"with no background noise and no reverberation."
        )

    def get_or_encode(
        self,
        voice_name: str,
        emotion: str,
        language: str,
        tokenizer,
        device: str,
        custom_style: Optional[str] = None,
        custom_speed: Optional[str] = None,
    ) -> tuple:
        key = f"{voice_name}||{emotion}||{language}||{custom_style or ''}||{custom_speed or ''}"

        if key not in self._cache:
            description = self.build_description(voice_name, emotion, language, custom_style, custom_speed)
            encoded = tokenizer(description, return_tensors="pt").to(device)
            self._cache[key] = (
                encoded.input_ids,
                encoded.attention_mask,
                description,
            )
            logger.info("Persona cached [%s]: %s", key, description)
        else:
            if key != self._active_key:
                logger.info("Persona anchor restored from cache [%s]", key)

        self._active_key = key
        return self._cache[key]

    @staticmethod
    def voices_for_language(language: str) -> list[str]:
        lang_data = LANGUAGES.get(language)
        if not lang_data:
            return list(VOICES.keys())
        return lang_data["voices"]

    @staticmethod
    def guard(voice_name: str, language: str) -> str:
        valid = PersonaManager.voices_for_language(language)
        if voice_name in valid:
            return voice_name
        fallback = valid[0]
        logger.warning(
            "Voice '%s' not valid for language '%s' — falling back to '%s'",
            voice_name, language, fallback,
        )
        return fallback

    def clear_cache(self):
        self._cache.clear()
        self._active_key = None
        logger.info("Persona cache cleared.")
