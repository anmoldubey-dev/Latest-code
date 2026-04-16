# Outbound engine — background loop that monitors pending callbacks,
# assigns them to free agents via WebSocket popup, and cleans up timeouts.
# Adapted from Routing/livekit/callcenter/outbound_engine.py
# Key change: event_hub imported from local .event_hub module.

import asyncio
import logging
from datetime import datetime, timezone

from . import db
from .email_service import send_outbound_no_answer_email
from .event_hub import event_hub

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
                    active_agents = [a for a in agents if not _is_agent_ignoring(a)]

                    if active_agents:
                        # Mark as broadcasting (attempts=1) so this item won't be re-polled
                        await db.mark_outbound_broadcasting(item["id"])

                        # Notify ALL free agents in the department simultaneously
                        for agent in active_agents:
                            await event_hub.publish({
                                "type":           "outbound_callback",
                                "outbound_id":    item["id"],
                                "user_email":     item["user_email"],
                                "department":     item["department"],
                                "countdown":      20,
                                "target_agent":   agent["agent_identity"],
                                "attempt_number": 1,
                            })

                        logger.info(
                            "Outbound %d broadcast to %d agent(s) in %s for %s",
                            item["id"], len(active_agents),
                            item["department"], item["user_email"],
                        )

            # Clean up stuck 'assigned'/'broadcasting' items after 25s (no agent accepted)
            stuck_items = await db.get_stuck_outbound(timeout_seconds=25)
            for item in stuck_items:
                current = await db.get_outbound(item["id"])
                if current and current.get("status") in ("completed", "no_answer", "declined"):
                    logger.info(
                        "Outbound %d already %s, skipping",
                        item["id"], current.get("status"),
                    )
                    continue

                await db.complete_outbound(item["id"], "no_answer")
                logger.info(
                    "Outbound %d → no_answer: no agent accepted (25s timeout)",
                    item["id"],
                )
                if item["user_email"]:
                    await send_outbound_no_answer_email(
                        item["user_email"], item["department"]
                    )
                    await event_hub.publish({
                        "type":       "outbound_cancelled",
                        "user_email": item["user_email"],
                    })

            # Clean up abandoned items (pending/broadcasting with attempts > 0 for 1+ hour)
            orphaned = await db.get_orphaned_outbound(timeout_minutes=60)
            for item in orphaned:
                if item.get("status") in ("completed", "no_answer", "declined"):
                    continue
                await db.complete_outbound(item["id"], "no_answer")
                logger.info(
                    "Outbound %d → no_answer: abandoned after %d attempt(s)",
                    item["id"], item.get("attempts", 0),
                )
                if item["user_email"]:
                    await send_outbound_no_answer_email(
                        item["user_email"], item["department"]
                    )
                    await event_hub.publish({
                        "type":       "outbound_cancelled",
                        "user_email": item["user_email"],
                    })

        except Exception as exc:
            logger.error("Outbound monitor error: %s", exc)

        await asyncio.sleep(5)
