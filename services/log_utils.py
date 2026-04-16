# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +---------------------------+
# | setup_logger()            |
# | * configure root logger   |
# +---------------------------+
#     |
#     |----> <StreamHandler> -> __init__()
#     |        * console output
#     |
#     |----> <RotatingFileHandler> -> __init__()
#     |        * JSON log rotation
#     |
#     v
# +---------------------------+
# | log_execution()           |
# | * function decorator      |
# +---------------------------+
#     |
#     |----> _set_trace()
#     |        * inject trace ID
#     |
#     |----> wrapper()
#     |        * call decorated function
#     |
#     |----> logger.info()
#     |        * log elapsed time
#     |
#     v
# [ END ]
#
# ================================================================

"""
log_utils
=========
Shared logging utilities for Voice AI microservices.

Self-contained — no backend imports required.  Each isolated microservice
adds ``services/`` to sys.path and imports from here.

Usage
-----
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    from log_utils import setup_logger, log_execution

    logger = setup_logger("my_service")

    @log_execution
    async def my_handler(req):
        ...

Environment variables
---------------------
    LOG_LEVEL    : DEBUG | INFO | WARNING | ERROR  (default: INFO)
    LOG_FILE     : Rotating log file path          (default: logs/services.log)
    LOG_JSON     : true | false                    (default: false)
    LOG_NO_COLOR : true | false                    (default: false)

License: Apache 2.0
"""

import asyncio
import functools
import json
import logging
import logging.handlers
import os
import sys
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Callable, Optional

# ── ANSI colour palette ───────────────────────────────────────────────────────
_RESET = "\033[0m"
_LEVEL_COLORS: dict = {
    "DEBUG":    "\033[90m",
    "INFO":     "\033[92m",
    "WARNING":  "\033[93m",
    "ERROR":    "\033[91m",
    "CRITICAL": "\033[1;91m",
}

# ── Env config ────────────────────────────────────────────────────────────────
_LOG_LEVEL = os.getenv("LOG_LEVEL",    "INFO").upper()
_LOG_FILE  = os.getenv("LOG_FILE",     "logs/services.log")
_LOG_JSON  = os.getenv("LOG_JSON",     "false").lower() == "true"
_NO_COLOR  = os.getenv("LOG_NO_COLOR", "false").lower() == "true"

# ── Per-request trace ID ──────────────────────────────────────────────────────
_trace_id: ContextVar[str] = ContextVar("trace_id", default="")


def get_trace_id() -> str:
    return _trace_id.get()


def set_trace_id(tid: str) -> None:
    _trace_id.set(tid)


# ── Formatters ────────────────────────────────────────────────────────────────

class _ColorFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        color = "" if _NO_COLOR else _LEVEL_COLORS.get(record.levelname, "")
        reset = "" if _NO_COLOR else _RESET
        tid   = get_trace_id()
        tid_part = f"  trace={tid}" if tid else ""
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        line = (
            f"[{ts}] [{record.levelname:<8}] [{record.name}]"
            f" [{record.funcName}]  {record.getMessage()}{tid_part}"
        )
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return f"{color}{line}{reset}"


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts":       datetime.now(timezone.utc).isoformat(),
            "level":    record.levelname,
            "logger":   record.name,
            "module":   record.module,
            "function": record.funcName,
            "line":     record.lineno,
            "message":  record.getMessage(),
        }
        tid = get_trace_id()
        if tid:
            payload["trace_id"] = tid
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


# ── Logger factory ────────────────────────────────────────────────────────────

_configured = False


def setup_logger(
    name:  Optional[str] = None,
    level: Optional[str] = None,
) -> logging.Logger:
    """
    Configure the root logger once (idempotent) and return a named child logger.

    Adds:
    - Console handler: colorized (or JSON when LOG_JSON=true)
    - File handler:    rotating JSON, 10 MB × 5 backups
    """
    global _configured
    root = logging.getLogger()

    if not _configured:
        _configured = True
        lvl = getattr(logging, level or _LOG_LEVEL, logging.INFO)
        root.setLevel(lvl)
        root.handlers.clear()

        ch = logging.StreamHandler(sys.stdout)
        ch.setLevel(lvl)
        ch.setFormatter(_JsonFormatter() if _LOG_JSON else _ColorFormatter())
        root.addHandler(ch)

        fpath = _LOG_FILE
        try:
            os.makedirs(os.path.dirname(os.path.abspath(fpath)), exist_ok=True)
            fh = logging.handlers.RotatingFileHandler(
                fpath,
                maxBytes    = 10 * 1024 * 1024,
                backupCount = 5,
                encoding    = "utf-8",
            )
            fh.setLevel(lvl)
            fh.setFormatter(_JsonFormatter())
            root.addHandler(fh)
        except OSError as exc:
            root.warning("[log_utils] Cannot open log file %s: %s", fpath, exc)

    return logging.getLogger(name) if name else root


# ── Execution decorator ───────────────────────────────────────────────────────

# Per-function last-logged wall-clock time, used by rate_limit throttle
_last_logged: dict = {}


def log_execution(func: Optional[Callable] = None, *, rate_limit: Optional[float] = None) -> Callable:
    """
    Log START / END / EXCEPTION with elapsed time and per-call trace ID.
    Works for both sync and async callables.

    Usage
    -----
        @log_execution                    # log every call
        @log_execution(rate_limit=60)     # log at most once per 60 seconds
    """
    def _decorator(fn: Callable) -> Callable:
        mod_logger = logging.getLogger(fn.__module__)
        qualified  = f"{fn.__module__}.{fn.__qualname__}"

        def _should_log() -> bool:
            if rate_limit is None:
                return True
            now = time.monotonic()
            if now - _last_logged.get(qualified, 0) >= rate_limit:
                _last_logged[qualified] = now
                return True
            return False

        if asyncio.iscoroutinefunction(fn):

            @functools.wraps(fn)
            async def _async_wrapper(*args, **kwargs):
                do_log   = _should_log()
                trace_id = uuid.uuid4().hex[:8]
                set_trace_id(trace_id)
                if do_log:
                    mod_logger.info("[START] %s  trace=%s  at=%s", qualified, trace_id, datetime.now().strftime("%H:%M:%S"))
                t0 = time.perf_counter()
                try:
                    result = await fn(*args, **kwargs)
                    if do_log:
                        mod_logger.info(
                            "[END]   %s  trace=%s  elapsed=%.3fs",
                            qualified, trace_id, time.perf_counter() - t0,
                        )
                    return result
                except Exception:
                    mod_logger.exception(
                        "[EXCEPTION] %s  trace=%s  elapsed=%.3fs",
                        qualified, trace_id, time.perf_counter() - t0,
                    )
                    raise

            return _async_wrapper

        else:

            @functools.wraps(fn)
            def _sync_wrapper(*args, **kwargs):
                do_log   = _should_log()
                trace_id = uuid.uuid4().hex[:8]
                set_trace_id(trace_id)
                if do_log:
                    mod_logger.info("[START] %s  trace=%s  at=%s", qualified, trace_id, datetime.now().strftime("%H:%M:%S"))
                t0 = time.perf_counter()
                try:
                    result = fn(*args, **kwargs)
                    if do_log:
                        mod_logger.info(
                            "[END]   %s  trace=%s  elapsed=%.3fs",
                            qualified, trace_id, time.perf_counter() - t0,
                        )
                    return result
                except Exception:
                    mod_logger.exception(
                        "[EXCEPTION] %s  trace=%s  elapsed=%.3fs",
                        qualified, trace_id, time.perf_counter() - t0,
                    )
                    raise

            return _sync_wrapper

    # Support both @log_execution and @log_execution(rate_limit=60)
    if func is not None:
        return _decorator(func)
    return _decorator
