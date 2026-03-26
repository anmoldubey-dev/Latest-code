# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ DATA SOURCE — no methods defined in this file ]
#
# Shared dict _m is populated by lifespan() at startup.
# Consumed by:
#     |----> stt_sync()
#     |        * reads shared STT model
#     |----> _gemini_sync()
#     |        * reads shared Gemini client
#     |----> _build_final_system()
#     |        * reads company context string
#     |----> _build_qwen_system()
#     |        * reads company context string
#     |----> api_voices()
#     |        * reads voice registry dict
#
# ================================================================

from typing import Dict

_m: Dict = {}
