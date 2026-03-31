# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------+
# | __init__()                    |
# | * load or create FAISS index  |
# +-------------------------------+
#     |
#     |----> <HuggingFaceEmbeddings> -> __init__()
#     |        * load sentence embedding model
#     |
#     |----> <FAISS> -> load_local()
#     |        * load existing index from disk
#     |      OR
#     |----> <FAISS> -> from_texts()
#     |        * create new index with seed doc
#     |
#     v
# +-------------------------------+
# | save_interaction()            |
# | * embed and persist one turn  |
# +-------------------------------+
#     |
#     |----> <Document> -> __init__()
#     |        * wrap turn text as document
#     |
#     |----> <FAISS> -> add_documents()
#     |        * add embedding to index
#     |
#     |----> <FAISS> -> save_local()
#     |        * persist index to disk
#     |
#     v
# +-------------------------------+
# | search_similar()              |
# | * semantic top-k search       |
# +-------------------------------+
#     |
#     |----> <FAISS> -> similarity_search()
#     |        * top-k query over index
#     |
#     v
# [ RETURN List[Document] ]
#
# ================================================================

import datetime
import logging
import os
from typing import List

from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document

logger = logging.getLogger("callcenter.memory")


class ConversationMemory:
    """
    FAISS-backed semantic memory store for call center conversations.

    Embeds and persists each conversation turn so that relevant prior
    exchanges can be retrieved via similarity search across sessions.
    """

    def __init__(self, index_path: str = "faiss_index") -> None:
        self.index_path = index_path
        logger.info("[Memory] Loading embedding model (all-MiniLM-L6-v2)…")
        _proj   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        _local  = os.path.join(_proj, "models", "all-MiniLM-L6-v2")
        _model  = _local if os.path.isdir(_local) else "all-MiniLM-L6-v2"
        self.embeddings = HuggingFaceEmbeddings(model_name=_model)

        if os.path.exists(index_path):
            logger.info("[Memory] Loading existing FAISS index from %s", index_path)
            self.vector_db = FAISS.load_local(
                index_path,
                self.embeddings,
                allow_dangerous_deserialization=True,
            )
        else:
            logger.info("[Memory] No existing index found — creating new FAISS index.")
            self.vector_db = FAISS.from_texts(["System Initialized"], self.embeddings)

    def save_interaction(
        self,
        user_text:   str,
        ai_response: str,
        language:    str,
    ) -> None:
        """
        Embed and persist one call-center conversation turn.

        Args:
            user_text   : The caller's transcribed utterance.
            ai_response : The agent's generated reply.
            language    : BCP-47 language code for this turn.
        """
        timestamp = datetime.datetime.now().isoformat()
        content   = f"User: {user_text}\nAI: {ai_response}"
        metadata  = {
            "user_text":   user_text,
            "ai_response": ai_response,
            "language":    language,
            "timestamp":   timestamp,
        }

        self.vector_db.add_documents([Document(page_content=content, metadata=metadata)])
        self.vector_db.save_local(self.index_path)
        logger.debug("[Memory] Interaction saved  lang=%s", language)

    def search_similar(self, query: str, k: int = 2) -> List[Document]:
        """
        Return the top-k most semantically similar past interactions.

        Args:
            query : The text to search against the vector index.
            k     : Number of results to return (default: 2).

        Returns:
            List of LangChain Document objects with content and metadata.
        """
        return self.vector_db.similarity_search(query, k=k)
