# ================================================================
# backend/stt/postprocessor.py
# ================================================================
#
# [ START ]
#     |
#     v
# +------------------------------------------+
# | _collapse_repetitions()                  |
# | * collapse n-gram loops to one unit      |
# +------------------------------------------+
#     |
#     |----> _is_repeating()
#     |        * detect repeating n-gram units
#     |
#     v
# +------------------------------------------+
# | _is_hallucination()                      |
# | * detect and reject bad STT output       |
# +------------------------------------------+
#     |
#     |----> _collapse_repetitions()
#     |        * clean loops before guarding
#     |
#     v
# [ RETURN bool ]
#
# ================================================================

import logging

logger = logging.getLogger("callcenter.stt")


def _collapse_repetitions(text: str) -> str:
    """Collapse repeating n-gram hallucinations into a single occurrence."""
    words = text.split()
    n = len(words)
    if n < 4:
        return text

    def _is_repeating(seq: list, unit_len: int, min_reps: int = 2) -> bool:
        unit = seq[:unit_len]
        reps = 0
        for i in range(0, len(seq), unit_len):
            if seq[i: i + unit_len] != unit[: len(seq[i: i + unit_len])]:
                return False
            reps += 1
        return reps >= min_reps

    for ul in range(1, n // 2 + 1):
        if _is_repeating(words, ul):
            return " ".join(words[:ul])

    for prefix_end in range(1, n - 3):
        suffix = words[prefix_end:]
        m = len(suffix)
        for ul in range(1, m // 2 + 1):
            if _is_repeating(suffix, ul, min_reps=3):
                return " ".join(words[:prefix_end] + suffix[:ul])

    return text


def _is_hallucination(text: str) -> bool:
    """Return True if the transcript looks like a Whisper hallucination."""
    text = _collapse_repetitions(text)
    words = text.split()
    if len(words) > 40:
        logger.warning("[GUARD-A] dropping: too many words (%d): %r", len(words), text[:80])
        return True
    if len(words) >= 6:
        unique = len({w.lower().strip(".,?!\"'") for w in words})
        if unique / len(words) < 0.35:
            logger.warning("[GUARD-B] dropping: repetitive (unique=%.0f%%): %r",
                           unique / len(words) * 100, text[:80])
            return True
    return False
