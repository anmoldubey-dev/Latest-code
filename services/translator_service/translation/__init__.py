# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# translation * Neural machine translation module namespace
#   |
#   |----> TranslatorEngine * M2M-100 NMT inference engine
#           |
#           |----> Exports: TranslatorEngine
#
# ================================================================
from .translator_engine import TranslatorEngine

__all__ = ["TranslatorEngine"]
