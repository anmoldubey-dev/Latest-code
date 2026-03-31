# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +---------------------------+
# | log_execution()           |
# | * wrap sync or async func |
# +---------------------------+
#     |
#     |----> _set_trace()
#     |        * inject UUID trace ID
#     |
#     |----> wrapper()
#     |        * call decorated function
#     |
#     |----> logger.info()
#     |        * log elapsed time
#     |
#     | (on error)
#     |----> logger.exception()
#     |        * log traceback + elapsed
#     |
#     v
# [ END ]
#
# ================================================================

"""
decorator
=========
@log_execution — production execution decorator for Voice AI Core.

Usage
-----
    from backend.core.decorator import log_execution

    @log_execution
    async def my_route(req: Request):
        ...

    @log_execution
    def my_sync_helper(text: str) -> str:
        ...

Each call emits:
    [START] <module.qualname>  trace=<8-char hex>
    [END]   <module.qualname>  trace=<8-char hex>  elapsed=<Xms>
    [EXCEPTION] ... (on unhandled exception, then re-raises)

License: Apache 2.0
"""

import asyncio
import functools
import logging
import time
import uuid
from datetime import datetime
from typing import Callable, Optional

# Per-function last-logged wall-clock time, used by rate_limit throttle
_last_logged: dict = {}


def log_execution(func: Optional[Callable] = None, *, rate_limit: Optional[float] = None) -> Callable:
    """
    Decorator that logs START / END / EXCEPTION with elapsed time
    and per-call trace ID for both sync and async functions.

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
                do_log  = _should_log()
                trace_id = uuid.uuid4().hex[:8]
                _set_trace(trace_id)
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
                do_log  = _should_log()
                trace_id = uuid.uuid4().hex[:8]
                _set_trace(trace_id)
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


def _set_trace(trace_id: str) -> None:
    """Inject trace ID via backend.core.logger (best-effort)."""
    try:
        from backend.core.logger import set_trace_id
        set_trace_id(trace_id)
    except Exception:
        pass
