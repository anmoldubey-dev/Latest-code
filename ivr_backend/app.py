# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------+
# | lifespan()                    |
# | * migrate DB and seed data    |
# +-------------------------------+
#     |
#     |----> <inspect> -> get_table_names()
#     |        * check existing tables
#     |
#     |----> <conn> -> execute()
#     |        * ALTER status ENUM migration
#     |
#     |----> <Base.metadata> -> create_all()
#     |        * create ORM tables
#     |
#     |----> <Path> -> mkdir()
#     |        * ensure recordings dir
#     |
#     |----> seed_demo_data()
#     |        * insert demo agents and calls
#     |
#     v
# +-------------------------------+
# | health()                      |
# | * GET /health liveness probe  |
# +-------------------------------+
#
# ================================================================

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect as sa_inspect

from .database.connection import engine
from .database.connection import Base, SessionLocal
from .routes import calls, tts
from .services.call_service import seed_demo_data

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)
logger = logging.getLogger("ivr_backend")

RECORDINGS_DIR = Path(__file__).parent / "recordings"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("IVR Backend starting up…")

    existing_tables = sa_inspect(engine).get_table_names()
    if "calls" in existing_tables:
        with engine.connect() as conn:
            try:
                conn.execute(text(
                    "ALTER TABLE calls MODIFY COLUMN status "
                    "ENUM('dialing','ringing','connected','on_hold','conference',"
                    "'transferred','ended') DEFAULT 'dialing'"
                ))
                conn.commit()
                logger.info("calls.status enum updated.")
            except Exception as exc:
                logger.warning("calls enum alter skipped: %s", exc)

    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ready.")
    RECORDINGS_DIR.mkdir(exist_ok=True)
    db = SessionLocal()
    try:
        seed_demo_data(db)
        logger.info("Demo data seeded.")
    finally:
        db.close()
    logger.info("IVR Backend ready on port 8001.")
    yield
    logger.info("IVR Backend shutting down.")


app = FastAPI(
    title="SR Comsoft IVR Backend",
    description="Call management, routing, transcripts, and TTS proxy.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(calls.router, prefix="/calls")
app.include_router(tts.router,   prefix="/tts")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ivr_backend"}
