"""
routing_routes.py — Call routing API for the AI call center.

POST /api/route        — Given lang+caller_id, returns which AI voice/LLM to use
GET  /routing/rules    — List all routing rules
POST /routing/rules/reload — Hot-reload rules from disk
POST /routing/decision — Dry-run: test routing for given params (no side effects)
"""
import time
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from backend.routing import routing_engine

logger = logging.getLogger("callcenter.routing_routes")

routing_api_router = APIRouter()


# ── Request / Response models ──────────────────────────────────────────────────

class RouteRequest(BaseModel):
    lang:      str = "en"       # BCP-47 language code
    source:    str = "browser"  # browser | sip | phone
    caller_id: str = ""         # phone number or web session id


class RouteResponse(BaseModel):
    voice:          str    # AI voice name to use
    llm:            str    # gemini | ollama
    lang:           str    # resolved language
    queue_name:     str
    rule_name:      str
    matched:        bool
    fallback_action: str


class DecisionRequest(BaseModel):
    lang:      str = "en"
    source:    str = "browser"
    caller_id: str = ""


# ── Endpoints ──────────────────────────────────────────────────────────────────

@routing_api_router.post("/api/route", response_model=RouteResponse)
async def route_call(req: RouteRequest):
    """
    Main routing endpoint — called by frontend before opening the WebSocket.
    Returns the AI voice, LLM, and language to use for this call.
    """
    from backend.routing.engine import CallRequest
    cr = CallRequest(
        lang      = req.lang,
        source    = req.source,
        caller_id = req.caller_id,
    )
    decision = await routing_engine.route(cr)
    logger.info("[Route] lang=%s → rule=%s voice=%s llm=%s",
                req.lang, decision.rule_name, decision.voice, decision.llm)
    return RouteResponse(
        voice          = decision.voice,
        llm            = decision.llm,
        lang           = decision.lang,
        queue_name     = decision.queue_name,
        rule_name      = decision.rule_name,
        matched        = decision.matched,
        fallback_action = decision.fallback_action,
    )


@routing_api_router.get("/routing/rules")
async def list_rules():
    """List all routing rules in evaluation order."""
    rules = routing_engine.rules_snapshot()
    return {"rules": rules, "count": len(rules), "timestamp": time.time()}


@routing_api_router.post("/routing/rules/reload")
async def reload_rules():
    """Hot-reload routing rules from disk without restart."""
    count = routing_engine.reload_rules()
    logger.info("[Routing] rules reloaded: %d", count)
    return {"status": "ok", "rules_loaded": count, "timestamp": time.time()}


@routing_api_router.post("/routing/decision")
async def test_routing_decision(req: DecisionRequest):
    """Dry-run: test routing logic without booking anything."""
    from backend.routing.engine import CallRequest
    cr = CallRequest(lang=req.lang, source=req.source, caller_id=req.caller_id)
    d  = await routing_engine.route(cr)
    return {
        "matched":        d.matched,
        "rule_name":      d.rule_name,
        "queue_name":     d.queue_name,
        "voice":          d.voice,
        "llm":            d.llm,
        "lang":           d.lang,
        "fallback_action": d.fallback_action,
        "timestamp":      d.ts,
    }
