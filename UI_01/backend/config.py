# ======================== Config ========================
# Config -> Loads environment variables and defines app-wide constants for database, JWT auth settings.
# ||
# ||
# ||
# Functions/Methods -> (no functions) -> Module-level constants only
# ||                 |
# ||                 |---> Logic Flow -> Module load sequence:
# ||                                  |
# ||                                  |--- load_dotenv() -> Load .env file into environment
# ||                                  |--- DATABASE_URL  -> Read from env -> Fallback to Neon string
# ||                                  |--- JWT_SECRET    -> Read from env -> Fallback to "change-me"
# ||                                  |--- JWT_ALGO      -> Hardcoded "HS256"
# ||                                  |--- JWT_EXPIRE_DAYS -> Hardcoded 7 days
# ||
# ======================================================================

# ---------------------------------------------------------------
# SECTION: IMPORTS
# ---------------------------------------------------------------
import os
from dotenv import load_dotenv

# ---------------------------------------------------------------
# SECTION: ENVIRONMENT LOAD
# ---------------------------------------------------------------
load_dotenv()  # Load .env into os.environ

# ---------------------------------------------------------------
# SECTION: DATABASE CONFIG
# ---------------------------------------------------------------
# Fallback -> Neon dev string (override via .env in production)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_GFJ4LkRQV8IS@ep-rapid-king-am0fu5vg.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
)

# ---------------------------------------------------------------
# SECTION: JWT CONFIG
# ---------------------------------------------------------------
JWT_SECRET      = os.getenv("JWT_SECRET", "change-me")  # Override in production
JWT_ALGO        = "HS256"                                # HMAC-SHA256
JWT_EXPIRE_DAYS = 7                                      # Token valid for 7 days