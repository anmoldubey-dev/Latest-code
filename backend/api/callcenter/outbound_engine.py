# Outbound engine — background loop that monitors pending callbacks,
# assigns them to free agents via WebSocket popup, and cleans up timeouts.
# Adapted from Routing/livekit/callcenter/outbound_engine.py
# Key change: event_hub imported from local .event_hub module.

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from . import db
from .email_service import send_outbound_no_answer_email
from .event_hub import event_hub
from .token_service import generate_token, LIVEKIT_URL

logger = logging.getLogger("callcenter.outbound")

_outbound_task: asyncio.Task = None


async def start_outbound_monitor():
    """Start the background polling loop. Called from app lifespan."""
    global _outbound_task
    _outbound_task = asyncio.create_task(_monitor_loop())
    logger.info("Outbound monitor started")


async def stop_outbound_monitor():
    """Stop the background loop. Called from app shutdown."""
    global _outbound_task
    if _outbound_task:
        _outbound_task.cancel()
        try:
            await _outbound_task
        except asyncio.CancelledError:
            pass
        _outbound_task = None
    logger.info("Outbound monitor stopped")


def _is_agent_ignoring(agent: dict) -> bool:
    until = agent.get("ignore_outbounds_until")
    if until:
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) < until
    return False


async def _monitor_loop():
    """
    Every 5 seconds:
    1. Fetch fresh 'pending' (attempts=0) items from outbound_queue
    2. Find ALL free agents in the matching department
    3. Broadcast a popup event to each free agent simultaneously
    4. First agent to accept wins; others dismiss on 'outbound_accepted'
    5. Clean up stuck/orphaned items (broadcasting → no_answer after 25s)
    """
    while True:
        try:
            pending = await db.get_pending_outbound()

            if pending:
                for item in pending:
                    agents = await db.get_all_free_agents_for_department(item["department"])
                    if not agents and item["department"].lower() != "general":
                        agents = await db.get_all_free_agents_for_department("General")
                    if not agents:
                        agents = await db.get_all_online_agents()
                    active_agents = [a for a in agents if not _is_agent_ignoring(a)]

                    if active_agents:
                        # Mark as broadcasting (attempts=1) so this item won't be re-polled
                        await db.mark_outbound_broadcasting(item["id"])

                        # Single broadcast to all agents in department (no per-agent filtering)
                        await event_hub.publish({
                            "type":           "outbound_callback",
                            "outbound_id":    item["id"],
                            "user_email":     item["user_email"],
                            "department":     item["department"],
                            "countdown":      20,
                            "attempt_number": 1,
                        })

                        logger.info(
                            "Outbound %d broadcast to %d agent(s) in %s for %s",
                            item["id"], len(active_agents),
                            item["department"], item["user_email"],
                        )

            # Auto-accept stuck 'broadcasting' items after 25s (no agent manually accepted)
            stuck_items = await db.get_stuck_outbound(timeout_seconds=25)
            for item in stuck_items:
                current = await db.get_outbound(item["id"])
                if current and current.get("status") in ("completed", "no_answer", "declined", "in_progress"):
                    continue

                # Try to find a free agent for auto-accept (with General fallback)
                agents = await db.get_all_free_agents_for_department(item["department"])
                if not agents and item["department"].lower() != "general":
                    agents = await db.get_all_free_agents_for_department("General")
                if not agents:
                    agents = await db.get_all_online_agents()
                active_agents = [a for a in agents if not _is_agent_ignoring(a)]

                if active_agents:
                    agent = active_agents[0]
                    agent_identity = agent["agent_identity"]
                    room_id = f"outbound-auto-{int(time.time())}-{uuid.uuid4().hex[:6]}"
                    agent_token = generate_token(
                        room_name=room_id, identity=agent_identity,
                        name="Agent", can_publish=True, can_subscribe=True,
                    )
                    await db.mark_outbound_in_progress(item["id"], agent_identity)
                    await db.set_agent_busy(agent_identity)

                    # Tell agent's browser to auto-join
                    await event_hub.publish({
                        "type":           "outbound_auto_accept",
                        "agent_identity": agent_identity,
                        "token":          agent_token,
                        "room":           room_id,
                        "url":            LIVEKIT_URL,
                        "outbound_id":    item["id"],
                    })
                    # Notify user to pick up
                    if item.get("user_email"):
                        await event_hub.publish({
                            "type":        "caller_pickup",
                            "user_email":  item["user_email"],
                            "room":        room_id,
                            "department":  item.get("department", "Support"),
                            "outbound_id": item["id"],
                        })
                    logger.info("Outbound %d auto-accepted by agent %s", item["id"], agent_identity)
                else:
                    # No free agents — notify user we tried
                    await db.complete_outbound(item["id"], "no_answer")
                    logger.info("Outbound %d → no_answer: no free agents for auto-accept", item["id"])
                    if item.get("user_email"):
                        await send_outbound_no_answer_email(item["user_email"], item["department"])
                        await event_hub.publish({"type": "outbound_cancelled", "user_email": item["user_email"]})

            # Clean up abandoned items — in_progress after 5min (agent closed browser), others after 60min
            orphaned = await db.get_orphaned_outbound(timeout_minutes=5)
            for item in orphaned:
                if item.get("status") in ("completed", "no_answer", "declined"):
                    continue
                if item.get("status") == "in_progress":
                    # Agent likely closed browser — reset to pending so engine retries with a free agent
                    pool = await db.get_pool()
                    async with pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE outbound_queue SET status='pending', attempts=0, assigned_agent=NULL WHERE id=$1",
                            item["id"],
                        )
                    logger.info("Outbound %d reset pending (orphaned in_progress, agent disconnected)", item["id"])
                else:
                    # Never connected — mark no_answer and email
                    await db.complete_outbound(item["id"], "no_answer")
                    logger.info("Outbound %d → no_answer: abandoned after %d attempt(s)", item["id"], item.get("attempts", 0))
                    if item.get("user_email"):
                        await send_outbound_no_answer_email(item["user_email"], item["department"])
                        await event_hub.publish({"type": "outbound_cancelled", "user_email": item["user_email"]})

        except Exception as exc:
            logger.error("Outbound monitor error: %s", exc)

        await asyncio.sleep(5)
