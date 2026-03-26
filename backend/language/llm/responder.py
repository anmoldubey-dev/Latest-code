# [ START ]
#     |
#     v
# +----------------------------------------------+
# | __init__()                                   |
# | * init OllamaLLM with model name             |
# +----------------------------------------------+
#     |
#     |----> <OllamaLLM> -> __init__()
#     |        * init with given model name
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
# [ RETURN stripped response string ]

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import OllamaLLM


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
            return chain.invoke({"input": user_text}).strip()
        except Exception as exc:
            return f"Error generating response: {exc}"
