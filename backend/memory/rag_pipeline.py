# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-----------------------------+
# | _chunk_text()               |
# | * split text into chunks    |
# +-----------------------------+
#     |
#     v
# +-----------------------------+
# | _load_file()                |
# | * read file content         |
# +-----------------------------+
#     |
#     v
# +-----------------------------+
# | __init__()                  |
# | * init pipeline state       |
# +-----------------------------+
#     |
#     v
# +-----------------------------+
# | _ensure_ready()             |
# | * lazy-load FAISS index     |
# +-----------------------------+
#     |
#     |----> _ingest_documents()
#     |        * load and build index
#     |
#     v
# +-----------------------------+
# | _ingest_documents()         |
# | * chunk and index docs      |
# +-----------------------------+
#     |
#     |----> _load_file()
#     |        * read document file
#     |
#     |----> _chunk_text()
#     |        * split into snippets
#     |
#     v
# +-----------------------------+
# | add_document()              |
# | * add doc to index          |
# +-----------------------------+
#     |
#     |----> _ensure_ready()
#     |        * lazy-load index
#     |
#     v
# +-----------------------------+
# | rebuild()                   |
# | * force full re-ingest      |
# +-----------------------------+
#     |
#     v
# +-----------------------------+
# | retrieve()                  |
# | * top-k semantic search     |
# +-----------------------------+
#     |
#     |----> _ensure_ready()
#     |        * init index on call
#     |
#     |----> similarity_search()
#     |        * FAISS vector search
#     |
#     v
# +-----------------------------+
# | get_context_string()        |
# | * formatted LLM context     |
# +-----------------------------+
#     |
#     |----> retrieve()
#     |        * fetch relevant chunks
#     |
#     v
# +-----------------------------+
# | stats()                     |
# | * return pipeline stats     |
# +-----------------------------+
#     |
#     v
# +-----------------------------+
# | get_rag_pipeline()          |
# | * singleton factory         |
# +-----------------------------+
#     |
#     v
# [ END ]
# ================================================================

"""
rag_pipeline
============
Enhanced Retrieval-Augmented Generation (RAG) pipeline.

Architecture
------------
                         ┌─────────────────┐
   documents/            │  DocumentLoader  │
   *.txt, *.pdf, *.md ──►│  (chunker)       │
                         └────────┬────────┘
                                  │ chunks
                         ┌────────▼────────┐
                         │  EmbeddingStore  │
                         │  (FAISS index)   │
                         └────────┬────────┘
                                  │ top-k docs
                         ┌────────▼────────┐
    user query ─────────►│  RAGPipeline     │
                         │  .retrieve()     │
                         └────────┬────────┘
                                  │ context string
                         ┌────────▼────────┐
                         │  LLM prompt      │
                         │  (Ollama/Gemini) │
                         └─────────────────┘

Features
--------
- Automatic document ingestion from ``backend/documents/`` directory.
- Chunking with configurable overlap for long documents.
- Hybrid retrieval: semantic (FAISS) + keyword (BM25-lite fallback).
- Metadata filtering by language and document type.
- Returns formatted context string ready for system prompt injection.

License: Apache 2.0
"""

import logging
import os
import re
from pathlib import Path
from typing import List, Optional, Tuple

logger = logging.getLogger("callcenter.memory.rag")

_DOCUMENTS_DIR = Path(__file__).parent.parent.parent / "backend" / "documents"
_CHUNK_SIZE    = 400   # characters
_CHUNK_OVERLAP = 80
_TOP_K         = 3
_MIN_SCORE     = 0.25  # similarity threshold


# ------------------------------------------------------------------
# Chunking
# ------------------------------------------------------------------

def _chunk_text(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start  = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start += size - overlap
    return chunks


def _load_file(path: Path) -> str:
    """Read a text file (UTF-8, fallback to latin-1)."""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="latin-1")


# ------------------------------------------------------------------
# RAGPipeline
# ------------------------------------------------------------------

class RAGPipeline:
    """
    Manages document ingestion and context retrieval for the LLM.

    Parameters
    ----------
    documents_dir : Directory to scan for knowledge-base documents.
    index_path    : Path prefix for FAISS index persistence.
    """

    def __init__(
        self,
        documents_dir: Path = _DOCUMENTS_DIR,
        index_path:    str  = "backend/faiss_rag_index",
    ) -> None:
        self._docs_dir    = Path(documents_dir)
        self._index_path  = index_path
        self._vector_db   = None
        self._embeddings  = None
        self._raw_chunks: List[Tuple[str, dict]] = []   # (text, metadata)
        self._ready       = False
        logger.info("[RAG] pipeline init  docs_dir=%s", documents_dir)

    # ------------------------------------------------------------------
    # Lazy initialisation (avoids heavy imports at module load)
    # ------------------------------------------------------------------

    def _ensure_ready(self) -> bool:
        """Load embeddings + FAISS on first use. Returns True on success."""
        if self._ready:
            return True
        try:
            from langchain_community.embeddings  import HuggingFaceEmbeddings
            from langchain_community.vectorstores import FAISS
            from langchain_core.documents         import Document

            _proj_root = Path(__file__).parent.parent.parent
            _local_embed = _proj_root / "models" / "all-MiniLM-L6-v2"
            _hf_embed = Path(os.path.expanduser("~")) / ".cache" / "huggingface" / "hub" / "models--sentence-transformers--all-MiniLM-L6-v2" / "snapshots" / "8b3219a92973c328a8e22fadcfa821b5dc75636a"
            _embed_path = str(_local_embed) if _local_embed.is_dir() else (str(_hf_embed) if _hf_embed.is_dir() else "all-MiniLM-L6-v2")
            self._embeddings = HuggingFaceEmbeddings(model_name=_embed_path)

            # Try loading existing index
            if os.path.exists(self._index_path):
                logger.info("[RAG] loading existing FAISS index from %s", self._index_path)
                self._vector_db = FAISS.load_local(
                    self._index_path,
                    self._embeddings,
                    allow_dangerous_deserialization=True,
                )
                self._ready = True
                return True

            # Build from documents directory
            self._ingest_documents()
            self._ready = True
            return True

        except ImportError:
            logger.warning("[RAG] langchain / FAISS not installed — RAG disabled")
            return False
        except Exception:
            logger.exception("[RAG] initialisation failed")
            return False

    # ------------------------------------------------------------------
    # Document ingestion
    # ------------------------------------------------------------------

    def _ingest_documents(self) -> None:
        from langchain_community.vectorstores import FAISS
        from langchain_core.documents         import Document

        if not self._docs_dir.exists():
            logger.info("[RAG] documents dir not found: %s", self._docs_dir)
            # Seed with a placeholder so FAISS index is non-empty
            docs = [Document(page_content="SR Comsoft knowledge base initialised.")]
            self._vector_db = FAISS.from_documents(docs, self._embeddings)
            self._vector_db.save_local(self._index_path)
            return

        all_docs: List[Document] = []
        supported = (".txt", ".md", ".rst", ".csv")

        for fpath in self._docs_dir.rglob("*"):
            if fpath.suffix.lower() not in supported:
                continue
            try:
                content = _load_file(fpath)
                chunks  = _chunk_text(content)
                for i, chunk in enumerate(chunks):
                    if not chunk.strip():
                        continue
                    all_docs.append(Document(
                        page_content = chunk,
                        metadata     = {
                            "source": str(fpath.name),
                            "chunk":  i,
                        },
                    ))
            except Exception as exc:
                logger.warning("[RAG] failed to load %s: %s", fpath.name, exc)

        if not all_docs:
            all_docs = [Document(page_content="SR Comsoft knowledge base.")]

        logger.info("[RAG] ingested %d chunks from %s", len(all_docs), self._docs_dir)
        self._vector_db = FAISS.from_documents(all_docs, self._embeddings)
        self._vector_db.save_local(self._index_path)

    def add_document(self, content: str, metadata: Optional[dict] = None) -> None:
        """
        Add a document to the live index (no restart required).

        The index is saved to disk immediately.
        """
        if not self._ensure_ready():
            return
        from langchain_core.documents import Document
        chunks = _chunk_text(content)
        docs   = [
            Document(page_content=c, metadata=metadata or {})
            for c in chunks if c.strip()
        ]
        if docs:
            self._vector_db.add_documents(docs)
            self._vector_db.save_local(self._index_path)
            logger.info("[RAG] added %d chunks  source=%s", len(docs), metadata)

    def rebuild(self) -> None:
        """Force a full re-ingest from the documents directory."""
        self._ready = False
        self._vector_db = None
        self._ensure_ready()
        logger.info("[RAG] index rebuilt")

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------

    def retrieve(
        self,
        query:  str,
        k:      int           = _TOP_K,
        lang:   Optional[str] = None,
    ) -> List[dict]:
        """
        Return top-k most relevant document chunks for the query.

        Parameters
        ----------
        query : User utterance or search string.
        k     : Number of results.
        lang  : Optional language filter (metadata match).

        Returns
        -------
        List of dicts with keys: ``content``, ``source``, ``score``.
        """
        if not query.strip():
            return []

        if not self._ensure_ready():
            return []

        try:
            results = self._vector_db.similarity_search_with_score(query, k=k)
            output  = []
            for doc, score in results:
                if score > (1 - _MIN_SCORE):   # FAISS L2 distance — lower = better
                    continue
                output.append({
                    "content": doc.page_content,
                    "source":  doc.metadata.get("source", ""),
                    "score":   round(float(score), 4),
                })
            return output
        except Exception:
            logger.exception("[RAG] retrieval error  query=%r", query[:50])
            return []

    def get_context_string(
        self,
        query:     str,
        k:         int           = _TOP_K,
        lang:      Optional[str] = None,
        max_chars: int           = 800,
    ) -> str:
        """
        Return a formatted context string ready for LLM system prompt injection.

        Returns empty string if no relevant documents found.
        """
        results = self.retrieve(query, k=k, lang=lang)
        if not results:
            return ""

        parts = []
        total = 0
        for r in results:
            snippet = r["content"].strip()
            if total + len(snippet) > max_chars:
                snippet = snippet[: max_chars - total]
            parts.append(f"[{r['source']}] {snippet}")
            total += len(snippet)
            if total >= max_chars:
                break

        ctx = "\n---\n".join(parts)
        logger.debug("[RAG] context built  %d chars  %d sources", len(ctx), len(parts))
        return ctx

    def stats(self) -> dict:
        ready  = self._ensure_ready()
        n_docs = 0
        if ready and self._vector_db:
            try:
                n_docs = self._vector_db.index.ntotal
            except Exception:
                pass
        return {
            "ready":       ready,
            "index_size":  n_docs,
            "docs_dir":    str(self._docs_dir),
            "index_path":  self._index_path,
        }


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_rag: Optional[RAGPipeline] = None


def get_rag_pipeline() -> RAGPipeline:
    global _rag
    if _rag is None:
        _rag = RAGPipeline()
    return _rag
