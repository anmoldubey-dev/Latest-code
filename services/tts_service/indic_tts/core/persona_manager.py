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
# | * compose Indic TTS prompt    |
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

from indic_tts.core.presets import VOICES, PRESETS, LANGUAGES

logger = logging.getLogger(__name__)

CALL_CENTER_DIRECTIVE = (
    "Professional, patient, helpful, and empathetic agent tone. "
    "No background noise, clear studio quality recording."
)

INFERENCE_SEED = 2026


class PersonaManager:

    def __init__(self):
        self._cache: dict[str, tuple] = {}
        self._active_key: Optional[str] = None

    def build_description(self, voice_name: str, emotion: str, language: str) -> str:
        voice = VOICES.get(voice_name, {})
        full_desc = voice.get("description", "A female Indian speaker with a clear Indian accent")
        short_desc = full_desc.split(" speaking ")[0].split(", speaking")[0]

        emotion_desc = PRESETS.get(emotion, PRESETS["neutral"])["description"]
        lang_note = f"native {language} speaker" if language else "native Indian speaker"

        return (
            f"{short_desc}, speaking very fast. "
            f"{lang_note.capitalize()}. {emotion_desc}. "
            f"Clear studio audio, no background noise."
        )

    def get_or_encode(
        self,
        voice_name: str,
        emotion: str,
        language: str,
        tokenizer,
        device: str,
    ) -> tuple:
        key = f"{voice_name}||{emotion}||{language}"

        if key not in self._cache:
            description = self.build_description(voice_name, emotion, language)
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
