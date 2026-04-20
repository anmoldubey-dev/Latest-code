# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | __init__()                       |
# | * validate exe register voices   |
# +----------------------------------+
#     |
#     v
# +----------------------------------+
# | synthesize()                     |
# | * async lookup model run piper   |
# +----------------------------------+
#     |
#     |----> _run_piper()
#     |        * blocking subprocess TTS
#     |
#     v
# +----------------------------------+
# | _run_piper()                     |
# | * run piper exe return WAV bytes |
# +----------------------------------+
#     |
#     v
# +------------------------------+
# | supported_languages()        |
# | * return registered langs    |
# +------------------------------+
#
# ================================================================

import asyncio
import logging
import os
import subprocess
import tempfile
from typing import Dict

logger = logging.getLogger(__name__)


class PiperTTSEngine:

    def __init__(self, piper_exe: str, voice_map: Dict[str, str]):
        if not os.path.isfile(piper_exe):
            raise FileNotFoundError(
                f"Piper executable not found: {piper_exe}"
            )
        self._piper_exe = piper_exe
        self._voices: Dict[str, str] = {}

        for lang, model_path in voice_map.items():
            if os.path.isfile(model_path):
                self._voices[lang] = model_path
                logger.info(
                    "Piper voice registered: %s → %s",
                    lang,
                    os.path.basename(model_path),
                )
            else:
                logger.warning(
                    "Piper voice model not found for '%s': %s", lang, model_path
                )

    async def synthesize(self, text: str, lang: str) -> bytes:
        text = (text or "").strip()
        if not text:
            return b""

        model_path = self._voices.get(lang)
        if not model_path:
            raise ValueError(
                f"No Piper voice available for language '{lang}'. "
                f"Registered: {list(self._voices.keys())}"
            )

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._run_piper, text, model_path
        )

    def _run_piper(self, text: str, model_path: str) -> bytes:
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp.close()
        try:
            result = subprocess.run(
                [
                    self._piper_exe,
                    "--model",            model_path,
                    "--output_file",      tmp.name,
                    "--noise_scale",      "0.667",
                    "--noise_w",          "0.8",
                    "--length_scale",     "1.0",
                    "--sentence_silence", "0.1",
                    "-q",
                ],
                input=text.encode("utf-8"),
                capture_output=True,
            )

            if result.returncode != 0:
                err = result.stderr.decode("utf-8", errors="replace").strip()
                logger.error(
                    "[TTS] Piper failed (rc=%d): %s | text=%r",
                    result.returncode, err, text[:80],
                )
                raise RuntimeError(
                    f"Piper failed (rc={result.returncode}): {err}"
                )

            if not os.path.isfile(tmp.name) or os.path.getsize(tmp.name) == 0:
                logger.warning("[TTS] Piper produced no output for text: %r", text[:80])
                return b""

            with open(tmp.name, "rb") as fh:
                wav = fh.read()

            logger.info("[TTS] Piper produced %d bytes WAV for %r", len(wav), text[:40])
            return wav

        finally:
            if os.path.exists(tmp.name):
                os.unlink(tmp.name)

    def supported_languages(self) -> list[str]:
        return list(self._voices.keys())
