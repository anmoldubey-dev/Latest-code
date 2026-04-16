# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------------------+
# | __init__()                                   |
# | * validate API key, init client              |
# +----------------------------------------------+
#     |
#     |----> <genai.Client> -> __init__()
#     |        * create Google GenAI client
#     |
#     v
# [ END ]
#
# ================================================================

import logging
import os

from dotenv import load_dotenv
import google.genai as genai

load_dotenv()

logger = logging.getLogger(__name__)


class GeminiResponder:

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_MNI_API_KEY")
        if not api_key:
            raise ValueError(
                "GEMINI_API_KEY not found in .env — "
                "add it or set VITE_MNI_API_KEY as a fallback."
            )

        self.client   = genai.Client(api_key=api_key)
        self.model_id = "gemini-2.5-flash"
        logger.info("[GeminiResponder] ready  model=%s", self.model_id)
