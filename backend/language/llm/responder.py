# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------------------+
# | __init__()                                   |
# | * init OllamaLLM with model name             |
# +----------------------------------------------+
#     |
#     |----> <OllamaLLM> -> __init__()
#     |        * init Ollama LLM client
#     |
#     v
# +----------------------------------------------+
# | generate_response()                          |
# | * run LangChain inference chain              |
# +----------------------------------------------+
#     |
#     |----> <ChatPromptTemplate> -> from_messages()
#     |        * build system and user prompt
#     |
#     |----> invoke()
#     |        * run prompt through LLM chain
#     |
#     v
# [ END ]
#
# ================================================================

import logging

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import OllamaLLM

logger = logging.getLogger(__name__)


class LanguageResponder:

    def __init__(self, model_name: str = "qwen2.5:7b"):
        self.llm = OllamaLLM(model=model_name)

    def generate_response(self, user_text: str, system_prompt: str) -> str:
        prompt_template = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("user",   "{input}"),
        ])
        chain = prompt_template | self.llm | StrOutputParser()

        try:
            result = chain.invoke({"input": user_text}).strip()
            logger.debug("[LanguageResponder] generate_response done  model=%s", self.llm.model)
            return result
        except Exception as exc:
            logger.error("[LanguageResponder] generate_response error: %s", exc)
            return f"Error generating response: {exc}"
