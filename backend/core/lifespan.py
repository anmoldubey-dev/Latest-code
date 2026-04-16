# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------+
# | lifespan()                    |
# | * startup resource management |
# +-------------------------------+
#     |
#     |----> setup_logger()
#     |        * init logging system
#     |
#     |----> load_greetings()
#     |        * load persona greetings
#     |
#     |----> build_voice_registry()
#     |        * load TTS voices
#     |
#     |----> health_check()
#     |        * verify remote services
#     |
#     v
# [ END ]
# ================================================================
import time
from contextlib import asynccontextmanager
from datetime import datetime

from backend.core.config import (
    BACKEND_ROOT, PROJECT_ROOT,
    OLLAMA_ENABLED, OLLAMA_MODEL, HAUP_RAG_ENABLED,
)
from backend.core.greeting_loader import load_greetings
from backend.core.logger import setup_logger
from backend.core.state import _m
from backend.speech.tts_client import build_voice_registry

logger = setup_logger("callcenter")


def _ensure_ollama_model(model: str = "qwen2.5:7b", base_url: str = "http://localhost:11434") -> bool:
    """
    Wait for Ollama to start, then pull the model if not already present.
    Returns True when the model is ready, False if Ollama is unreachable.
    """
    import requests as _r
    import time as _t

    # Wait up to 30 s for the Ollama server to come up
    for attempt in range(10):
        try:
            _r.get(f"{base_url}/api/tags", timeout=3).raise_for_status()
            break
        except Exception:
            if attempt == 0:
                logger.info("[Ollama] waiting for server to start...")
            _t.sleep(3)
    else:
        logger.warning("[Ollama] server not reachable after 30 s — model pull skipped")
        return False

    # Check whether the model is already downloaded
    try:
        tags = _r.get(f"{base_url}/api/tags", timeout=5)
        if tags.ok:
            present = [m["name"] for m in tags.json().get("models", [])]
            if any(model == n or n.startswith(model) for n in present):
                logger.info("[Ollama] model %s already present", model)
                return True
    except Exception:
        pass

    # Pull the model (qwen2.5:7b is ~4.5 GB — first run takes a few minutes)
    logger.info("[Ollama] pulling %s — first run may take several minutes...", model)
    try:
        resp = _r.post(
            f"{base_url}/api/pull",
            json={"name": model, "stream": False},
            timeout=1800,   # 30 min ceiling for large models on slow connections
        )
        if resp.ok:
            logger.info("[Ollama] %s downloaded successfully", model)
            return True
        logger.error("[Ollama] pull failed  status=%s  body=%s", resp.status_code, resp.text[:300])
        return False
    except Exception as exc:
        logger.error("[Ollama] pull error: %s", exc)
        return False


@asynccontextmanager
async def lifespan(app):
    _t0 = time.perf_counter()
    logger.info("[START] lifespan  at=%s", datetime.now().strftime("%H:%M:%S"))

    from backend.speech.stt.transcriber import StreamingTranscriber
    _m["stt"] = StreamingTranscriber()

    logger.info("Initialising Gemini responder…")
    try:
        from backend.language.llm.gemini_responder import GeminiResponder
        _m["gemini"] = GeminiResponder()
        logger.info("Gemini ready.")
    except Exception as exc:
        logger.warning("Gemini unavailable: %s", exc)
        _m["gemini"] = None

    if OLLAMA_ENABLED:
        logger.info("Ollama enabled — ensuring qwen2.5:7b is ready...")
        model_ready = _ensure_ollama_model(OLLAMA_MODEL)
        if model_ready:
            try:
                from backend.language.llm.ollama_responder import OllamaResponder
                _m["ollama"] = OllamaResponder(model=OLLAMA_MODEL)
                logger.info("Ollama ready  model=%s", OLLAMA_MODEL)
            except Exception as exc:
                logger.warning("Ollama responder init failed: %s", exc)
                _m["ollama"] = None
        else:
            _m["ollama"] = None
            logger.warning("Ollama model not available — LLM router will fall back to Gemini")
    else:
        _m["ollama"] = None
        logger.info("Ollama disabled (OLLAMA=false) — using Gemini")

    _m["greetings"] = load_greetings()

    logger.info("Initialising pgvector conversation memory (Neon)…")
    try:
        from backend.memory import pg_memory as _pgm
        _pgm._get_embedder()
        _pgm.init_avatar_table()
        _pgm.init_call_records_table()
        _pgm.init_routing_rules_table()
        _m["pg_memory"] = _pgm
        logger.info("pgvector memory ready.")
    except Exception as exc:
        logger.warning("pgvector memory unavailable: %s", exc)
        _m["pg_memory"] = None

    DOCUMENTS_DIR     = BACKEND_ROOT / "documents"
    MAX_CONTEXT_CHARS = 8000
    company_ctx       = ""
    if DOCUMENTS_DIR.exists():
        for doc in sorted(DOCUMENTS_DIR.glob("*.txt")):
            try:
                company_ctx += doc.read_text(encoding="utf-8") + "\n\n"
            except Exception as exc:
                logger.warning("Could not read %s: %s", doc.name, exc)
        company_ctx = company_ctx.strip()[:MAX_CONTEXT_CHARS]
        logger.info(
            "Company context: %d chars loaded." if company_ctx else "Documents folder empty — no context loaded.",
            len(company_ctx) if company_ctx else None,
        ) if company_ctx else logger.info("Documents folder empty — no context loaded.")
    else:
        logger.info("No documents/ folder — running without company context.")
    _m["company_context"] = company_ctx

    _m["voice_registry"] = build_voice_registry()
    logger.info("Voice registry: %s", {k: len(v) for k, v in _m["voice_registry"].items()})

    if HAUP_RAG_ENABLED:
        logger.info("Initialising HAUP RAG client…")
        try:
            from backend.memory.haup_rag_client import get_haup_client
            haup    = get_haup_client()
            haup_ok = await haup.health_check()
            _m["haup_rag"] = haup
            if haup_ok:
                logger.info("HAUP RAG service reachable on :8088 — RAG enabled.")
            else:
                logger.warning("HAUP RAG service not reachable on :8088 — calls will proceed without RAG context.")
        except Exception as exc:
            logger.warning("HAUP RAG client init failed: %s", exc)
            _m["haup_rag"] = None
    else:
        logger.info("HAUP RAG disabled (HAUP_RAG=false).")
        _m["haup_rag"] = None

    logger.info("Initialising diarization client…")
    try:
        from backend.services.diarization_client import get_diarization_client
        diar    = get_diarization_client()
        diar_ok = await diar.health_check()
        _m["diarization"]           = diar
        _m["diarization_available"] = diar_ok
        if diar_ok:
            logger.info("Diarization service reachable on :8001 — post-call diarization enabled.")
        else:
            logger.warning("Diarization service not reachable on :8001 — post-call diarization will be skipped.")
    except Exception as exc:
        logger.warning("Diarization client init failed: %s", exc)
        _m["diarization"]           = None
        _m["diarization_available"] = False

    _m["long_term_memory"] = _m.get("pg_memory")

    # Callcenter DB init
    try:
        from backend.api.callcenter import db as ccdb
        from backend.api.callcenter import queue_engine
        from backend.api.callcenter import business_hours
        from backend.api.callcenter.email_service import load_email_config_from_db
        await ccdb.init_db()
        await business_hours.load_config_from_db()
        await load_email_config_from_db()
        await queue_engine.start_kafka()
        from backend.api.callcenter.outbound_engine import start_outbound_monitor
        await start_outbound_monitor()
        logger.info("Callcenter DB ready.")
    except Exception as exc:
        logger.warning("Callcenter DB init failed: %s", exc)

    logger.info(
        "[END]   lifespan  elapsed=%.3fs  — all models ready, server is up.",
        time.perf_counter() - _t0,
    )
    yield
    # Callcenter shutdown
    try:
        from backend.api.callcenter import queue_engine, db as ccdb
        from backend.api.callcenter.outbound_engine import stop_outbound_monitor
        await stop_outbound_monitor()
        await queue_engine.stop_kafka()
        await ccdb.close_db()
    except Exception:
        pass
    logger.info("Shutdown complete.")
