# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# Module-level shared state container.
# No standalone methods — _m dict is populated by lifespan()
# and consumed by stt_sync(), _gemini_sync(), and route handlers.
#
#     lifespan()        -- writes to _m["stt"], _m["gemini"], etc.
#     stt_sync()        -- reads  _m["stt"]
#     _gemini_sync()    -- reads  _m["gemini"]
#
# ================================================================

from typing import Dict

_m: Dict = {}
