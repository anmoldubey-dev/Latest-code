"""
CRM Routes — Pure Neon PostgreSQL CRUD for contacts, tickets, notes, and caller profiles.
No Zoho dependency — works standalone. Zoho sync is handled separately by zoho_routes.py.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Request, HTTPException

from .callcenter.db import get_pool

logger = logging.getLogger("crm_routes")
crm_router = APIRouter()


def _agent_id_from_request(request: Request) -> str:
    """Extract agent identity from JWT claims stored by auth middleware."""
    user = getattr(request.state, "user", None)
    if user:
        return user.get("email") or user.get("sub") or "unknown"
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            import jwt, os
            payload = jwt.decode(auth[7:], os.getenv("JWT_SECRET", ""), algorithms=["HS256"])
            return payload.get("email") or payload.get("sub") or "unknown"
        except Exception:
            pass
    return "unknown"


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/crm/contacts
# ─────────────────────────────────────────────────────────────────────────────
@crm_router.get("/api/crm/contacts")
async def list_contacts(search: str = "", segment: str = "", limit: int = 100):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if search and segment:
            rows = await conn.fetch(
                """SELECT * FROM crm_contacts
                   WHERE (name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)
                     AND segment = $2
                   ORDER BY created_at DESC LIMIT $3""",
                f"%{search}%", segment, limit
            )
        elif search:
            rows = await conn.fetch(
                """SELECT * FROM crm_contacts
                   WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1
                   ORDER BY created_at DESC LIMIT $2""",
                f"%{search}%", limit
            )
        elif segment:
            rows = await conn.fetch(
                "SELECT * FROM crm_contacts WHERE segment=$1 ORDER BY created_at DESC LIMIT $2",
                segment, limit
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM crm_contacts ORDER BY created_at DESC LIMIT $1", limit
            )
    return [_fmt_contact(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# PATCH /api/crm/contacts/{email}  — edit contact in Neon DB + Zoho CRM
# ─────────────────────────────────────────────────────────────────────────────
@crm_router.patch("/api/crm/contacts/{email:path}")
async def update_contact(email: str, payload: dict):
    allowed = {"name", "phone", "company", "segment"}
    sets, params = [], [email]
    for k, v in payload.items():
        if k in allowed:
            params.append(v)
            sets.append(f"{k}=${len(params)}")
    if not sets:
        raise HTTPException(400, "No valid fields to update")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE crm_contacts SET {', '.join(sets)} WHERE email=$1 RETURNING *", *params
        )
    if not row:
        raise HTTPException(404, "Contact not found")

    # Mirror to Zoho CRM if synced
    if row["zoho_contact_id"]:
        try:
            from backend.api.zoho_routes import update_zoho_contact
            await update_zoho_contact(row["zoho_contact_id"], payload)
        except Exception:
            pass  # Zoho failure doesn't block local save

    return _fmt_contact(row)


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /api/crm/contacts/{email}  — delete from Neon DB + Zoho CRM
# ─────────────────────────────────────────────────────────────────────────────
@crm_router.delete("/api/crm/contacts/{email:path}")
async def delete_contact(email: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "DELETE FROM crm_contacts WHERE email=$1 RETURNING id, zoho_contact_id", email
        )
    if not row:
        raise HTTPException(404, "Contact not found")

    # Delete from Zoho CRM if synced
    if row["zoho_contact_id"]:
        try:
            from backend.api.zoho_routes import delete_zoho_contact
            await delete_zoho_contact(row["zoho_contact_id"])
        except Exception:
            pass  # Zoho failure doesn't block local delete

    return {"status": "deleted", "id": row["id"]}


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/crm/contacts/{email}
# ─────────────────────────────────────────────────────────────────────────────
@crm_router.get("/api/crm/contacts/{email:path}")
async def get_contact(email: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        contact = await conn.fetchrow(
            "SELECT * FROM crm_contacts WHERE email=$1", email
        )
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")

        sessions = await conn.fetch(
            """SELECT s.id, s.status, s.call_duration, s.department, s.created_at, s.ended_at,
                      AVG(CASE t.sentiment WHEN 'positive' THEN 1 WHEN 'negative' THEN -1 ELSE 0 END) as sent_score
               FROM cc_sessions s
               JOIN cc_callers c ON c.id = s.caller_id
               LEFT JOIN transcripts t ON t.session_id = s.session_id
               WHERE c.email = $1
               GROUP BY s.id ORDER BY s.created_at DESC LIMIT 10""",
            email
        )
        tickets = await conn.fetch(
            "SELECT * FROM crm_tickets WHERE contact_email=$1 ORDER BY created_at DESC LIMIT 20",
            email
        )

    return {
        "contact": _fmt_contact(contact),
        "sessions": [_fmt_session_brief(r) for r in sessions],
        "tickets": [_fmt_ticket(r) for r in tickets],
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/crm/caller-profile/{call_id}
# Primary endpoint used by CrmSidebar when agent accepts a call.
# ─────────────────────────────────────────────────────────────────────────────
@crm_router.get("/api/crm/caller-profile/{call_id}")
async def caller_profile(call_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Resolve session — match by numeric id, session_id, or room_id
        session = None
        if call_id.isdigit():
            session = await conn.fetchrow("SELECT * FROM cc_sessions WHERE id=$1", int(call_id))
        if not session:
            session = await conn.fetchrow(
                "SELECT * FROM cc_sessions WHERE session_id=$1 OR room_id=$1 ORDER BY created_at DESC LIMIT 1",
                call_id
            )
        if not session:
            return {"caller": {}, "contact": {}, "sessions": [], "stats": {}, "current_ticket": None}

        # Caller info
        caller = await conn.fetchrow("SELECT * FROM cc_callers WHERE id=$1", session["caller_id"]) if session["caller_id"] else None
        caller_email = caller["email"] if caller else ""
        caller_name  = caller["display_name"] if caller else ""

        # Upsert crm_contacts so every caller is tracked
        if caller_email:
            await conn.execute(
                """INSERT INTO crm_contacts (email, name) VALUES ($1, $2)
                   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name""",
                caller_email, caller_name or caller_email.split("@")[0]
            )

        # Contact record
        contact = await conn.fetchrow(
            "SELECT * FROM crm_contacts WHERE email=$1", caller_email
        ) if caller_email else None

        # Auto-sync to Zoho CRM if this contact isn't linked yet (fire-and-forget)
        if contact and not contact["zoho_contact_id"] and caller_email and not caller_email.endswith("@guest"):
            import asyncio
            asyncio.create_task(_auto_sync_to_zoho(caller_email, caller_name, caller))

        # Past sessions for this caller
        past_sessions = []
        avg_sent = "neutral"
        total_calls = 0
        last_call_date = None
        if caller_email:
            # Fetch true total count separately (past_sessions is capped at 5 for display)
            total_calls = await conn.fetchval(
                """SELECT COUNT(DISTINCT s.id) FROM cc_sessions s
                   JOIN cc_callers c ON c.id = s.caller_id
                   WHERE c.email = $1""",
                caller_email
            ) or 0
            past_sessions = await conn.fetch(
                """SELECT s.id, s.status, s.call_duration, s.department, s.created_at, s.ended_at,
                          AVG(CASE t.sentiment WHEN 'positive' THEN 1 WHEN 'negative' THEN -1 ELSE 0 END) as sent_score
                   FROM cc_sessions s
                   JOIN cc_callers c ON c.id = s.caller_id
                   LEFT JOIN transcripts t ON t.session_id = s.session_id
                   WHERE c.email = $1
                   GROUP BY s.id ORDER BY s.created_at DESC LIMIT 5""",
                caller_email
            )
            if past_sessions:
                last_call_date = past_sessions[0]["created_at"].isoformat() if past_sessions[0]["created_at"] else None
            scores = [float(r["sent_score"] or 0) for r in past_sessions if r["sent_score"] is not None]
            if scores:
                avg = sum(scores) / len(scores)
                avg_sent = "positive" if avg > 0.2 else "negative" if avg < -0.2 else "neutral"

        # Tickets
        open_count = resolved_count = 0
        current_ticket = None
        if caller_email:
            ticket_rows = await conn.fetch(
                "SELECT * FROM crm_tickets WHERE contact_email=$1 ORDER BY created_at DESC LIMIT 20",
                caller_email
            )
            open_count     = sum(1 for t in ticket_rows if t["status"] in ("open", "on_hold", "pending"))
            resolved_count = sum(1 for t in ticket_rows if t["status"] in ("closed", "resolved"))
            current_ticket = next((t for t in ticket_rows if t["status"] in ("open", "on_hold", "pending")), None)

    return {
        "caller":  {"name": caller_name, "email": caller_email, "phone": ""},
        "contact": _fmt_contact(contact) if contact else {},
        "sessions": [_fmt_session_brief(r) for r in past_sessions],
        "current_ticket": _fmt_ticket(current_ticket) if current_ticket else None,
        "stats": {
            "total_calls":     total_calls,
            "avg_sentiment":   avg_sent,
            "last_call_date":  last_call_date,
            "open_tickets":    open_count,
            "resolved_tickets": resolved_count,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/crm/tickets
# ─────────────────────────────────────────────────────────────────────────────
@crm_router.get("/api/crm/tickets")
async def list_tickets(status: str = "", priority: str = "", contact_email: str = "", limit: int = 100):
    pool = await get_pool()
    conditions, params = [], []
    if status:
        params.append(status);         conditions.append(f"status=${len(params)}")
    if priority:
        params.append(priority);       conditions.append(f"priority=${len(params)}")
    if contact_email:
        params.append(contact_email);  conditions.append(f"contact_email=${len(params)}")
    params.append(limit)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM crm_tickets {where} ORDER BY created_at DESC LIMIT ${len(params)}",
            *params
        )
    return [_fmt_ticket(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/crm/tickets
# ─────────────────────────────────────────────────────────────────────────────
@crm_router.post("/api/crm/tickets")
async def create_ticket(payload: dict):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO crm_tickets (contact_email, subject, priority, call_session_id)
               VALUES ($1,$2,$3,$4) RETURNING *""",
            payload.get("contact_email", ""),
            payload.get("subject", "Support Ticket"),
            payload.get("priority", "medium"),
            payload.get("call_session_id"),
        )
    return _fmt_ticket(row)


# ─────────────────────────────────────────────────────────────────────────────
# PATCH /api/crm/tickets/{ticket_id}
# ─────────────────────────────────────────────────────────────────────────────
@crm_router.patch("/api/crm/tickets/{ticket_id}")
async def update_ticket(ticket_id: int, payload: dict):
    allowed = {"status", "priority", "subject", "zoho_ticket_id"}
    sets, params = [], [ticket_id]
    for k, v in payload.items():
        if k in allowed:
            params.append(v)
            sets.append(f"{k}=${len(params)}")
    if not sets:
        raise HTTPException(400, "No valid fields to update")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE crm_tickets SET {', '.join(sets)} WHERE id=$1 RETURNING *", *params
        )
    return _fmt_ticket(row)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/crm/tickets/{ticket_id}/notes
# ─────────────────────────────────────────────────────────────────────────────
@crm_router.get("/api/crm/tickets/{ticket_id}/notes")
async def list_notes(ticket_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM crm_notes WHERE ticket_id=$1 ORDER BY created_at ASC", ticket_id
        )
    return [_fmt_note(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/crm/tickets/{ticket_id}/notes
# ─────────────────────────────────────────────────────────────────────────────
@crm_router.post("/api/crm/tickets/{ticket_id}/notes")
async def add_note(ticket_id: int, payload: dict, request: Request):
    note_text = payload.get("note_text", "").strip()
    if not note_text:
        raise HTTPException(400, "note_text is required")
    agent_id = _agent_id_from_request(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO crm_notes (ticket_id, agent_id, note_text) VALUES ($1,$2,$3) RETURNING *",
            ticket_id, agent_id, note_text
        )
    return _fmt_note(row)


# ─────────────────────────────────────────────────────────────────────────────
# Auto-sync helper — pushes a new contact to Zoho CRM in the background
# ─────────────────────────────────────────────────────────────────────────────

async def _auto_sync_to_zoho(email: str, name: str, caller_row):
    """
    Called as a fire-and-forget task when a new caller has no zoho_contact_id.
    1. Looks up the contact in Zoho CRM by email.
    2. If found → links the zoho_contact_id in crm_contacts.
    3. If not found → creates it in Zoho CRM and links the ID.
    Errors are swallowed so they never affect the call flow.
    """
    try:
        from backend.api.zoho_routes import lookup_contact, create_zoho_contact
        # Try lookup first (contact may already exist in Zoho from before)
        result = await lookup_contact(email=email, phone="")
        if result.get("found") and result.get("contact", {}).get("zoho_contact_id"):
            # Already exists in Zoho — zoho_routes already upserted crm_contacts
            logger.info("[AutoSync] Linked existing Zoho contact for %s", email)
            return

        # Not in Zoho → create it
        phone = ""  # cc_callers has no phone column; Zoho lookup may fill it later
        await create_zoho_contact({
            "name":    name or email.split("@")[0],
            "email":   email,
            "phone":   phone,
            "company": "",
        })
        logger.info("[AutoSync] Created new Zoho contact for %s", email)
    except Exception as exc:
        logger.warning("[AutoSync] Zoho sync failed for %s: %s", email, exc)


# ─────────────────────────────────────────────────────────────────────────────
# Formatters
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_contact(r) -> dict:
    if not r:
        return {}
    return {
        "id":              r["id"],
        "zoho_contact_id": r["zoho_contact_id"],
        "email":           r["email"],
        "phone":           r["phone"] or "",
        "name":            r["name"] or "",
        "company":         r["company"] or "",
        "segment":         r["segment"] or "standard",
        "zoho_synced_at":  r["zoho_synced_at"].isoformat() if r["zoho_synced_at"] else None,
        "created_at":      r["created_at"].isoformat() if r["created_at"] else None,
    }


def _fmt_ticket(r) -> dict:
    if not r:
        return {}
    return {
        "id":              r["id"],
        "zoho_ticket_id":  r["zoho_ticket_id"],
        "contact_email":   r["contact_email"],
        "subject":         r["subject"] or "",
        "status":          r["status"] or "open",
        "priority":        r["priority"] or "medium",
        "created_at":      r["created_at"].isoformat() if r["created_at"] else None,
        "call_session_id": r["call_session_id"],
    }


def _fmt_note(r) -> dict:
    return {
        "id":         r["id"],
        "ticket_id":  r["ticket_id"],
        "agent_id":   r["agent_id"],
        "note_text":  r["note_text"],
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
    }


def _fmt_session_brief(r) -> dict:
    score = float(r["sent_score"] or 0) if "sent_score" in r.keys() else 0
    sentiment = "positive" if score > 0.2 else "negative" if score < -0.2 else "neutral"
    duration = r["call_duration"] or 0
    if not duration and r.get("ended_at") and r.get("created_at"):
        duration = int((r["ended_at"] - r["created_at"]).total_seconds())
    return {
        "id":            r["id"],
        "status":        r["status"],
        "call_duration": duration,
        "department":    r["department"] or "General",
        "created_at":    r["created_at"].isoformat() if r["created_at"] else None,
        "ended_at":      r["ended_at"].isoformat() if r.get("ended_at") else None,
        "sentiment":     sentiment,
    }


# ─────────────────────────────────────────────────────────────────────────────
# [CRM Assistant] POST /api/ai-chat
# Handles natural-language questions from the Smart CRM Assistant in the
# browser call sidebar. Looks up the caller by phone, fetches their full
# history (sessions, tickets, recent transcripts), builds an LLM context,
# and returns a synthesized answer via Gemini (primary) or Ollama (fallback).
# ─────────────────────────────────────────────────────────────────────────────

@crm_router.post("/api/ai-chat")
async def crm_ai_chat(payload: dict):
    # [CRM Assistant] Extract and validate inputs
    phone    = (payload.get("phone")    or "").strip()
    question = (payload.get("question") or "").strip()

    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # [CRM Assistant] cc_callers has no phone column; match on email instead
            # The CrmSidebar passes customer.phone which may actually be email for web callers
            caller = None
            if phone:
                caller = await conn.fetchrow(
                    "SELECT * FROM cc_callers WHERE email = $1", phone
                )
            if not caller and phone:
                caller = await conn.fetchrow(
                    "SELECT * FROM cc_callers WHERE display_name ILIKE $1", f"%{phone}%"
                )

            if not caller:
                return {"answer": f"No customer found matching '{phone}'. Unable to retrieve CRM data."}

            caller_id = caller["id"]

            # [CRM Assistant] Fetch last 20 sessions for this caller
            sessions = await conn.fetch("""
                SELECT
                    s.id,
                    s.room_id,
                    s.status,
                    s.department,
                    s.wait_seconds,
                    s.created_at AT TIME ZONE 'UTC' AS created_at,
                    s.ended_at   AT TIME ZONE 'UTC' AS ended_at,
                    a.agent_name
                FROM cc_sessions s
                LEFT JOIN agent_states a ON a.agent_identity = s.agent_id
                WHERE s.caller_id = $1
                ORDER BY s.created_at DESC
                LIMIT 20
            """, caller_id)

            # [CRM Assistant] Fetch open/recent tickets for this caller
            tickets = await conn.fetch("""
                SELECT title, status, priority, created_at AT TIME ZONE 'UTC' AS created_at, description
                FROM crm_tickets
                WHERE contact_email = $1
                ORDER BY created_at DESC
                LIMIT 10
            """, caller["email"] or "")

            # [CRM Assistant] Fetch recent transcript snippets (last 30 turns)
            transcripts = await conn.fetch("""
                SELECT t.speaker, t.text, t.created_at AT TIME ZONE 'UTC' AS created_at
                FROM transcripts t
                JOIN cc_sessions s ON s.room_id = t.session_id OR CAST(s.id AS TEXT) = t.session_id
                WHERE s.caller_id = $1
                ORDER BY t.created_at DESC
                LIMIT 30
            """, caller_id)

        # [CRM Assistant] Build human-readable context from DB data
        sessions_text = "\n".join(
            f"- {str(r['created_at'])[:16]} UTC | Status: {r['status']} | "
            f"Agent: {r['agent_name'] or 'Unassigned'} | Dept: {r['department'] or '-'} | "
            f"Wait: {r['wait_seconds'] or 0}s | "
            f"Duration: {int((r['ended_at'] - r['created_at']).total_seconds()) if r['ended_at'] and r['created_at'] else '-'}s"
            for r in sessions
        ) or "No call sessions found."

        tickets_text = "\n".join(
            f"- [{r['status'].upper()}] {r['title']} | Priority: {r['priority']} | "
            f"Created: {str(r['created_at'])[:10]}"
            for r in tickets
        ) or "No tickets found."

        transcript_text = "\n".join(
            f"  {r['speaker']}: {r['text']}"
            for r in reversed(transcripts)  # chronological order
        ) or "No transcript data."

        # [CRM Assistant] Assemble full system prompt with customer context
        context = (
            f"You are a smart CRM assistant. Answer the agent's question about this customer.\n\n"
            f"Customer Profile:\n"
            f"- Name: {caller['display_name'] or 'Unknown'}\n"
            f"- Email: {caller['email'] or '-'}\n"  # [CRM Assistant] cc_callers has no phone column
            f"- Tier: {caller.get('tier') or 'Standard'}\n\n"
            f"Call History ({len(sessions)} sessions shown):\n{sessions_text}\n\n"
            f"Support Tickets:\n{tickets_text}\n\n"
            f"Recent Conversation Transcript:\n{transcript_text}\n\n"
            f"Agent Question: {question}\n\n"
            "Instructions:\n"
            "- Be concise, helpful, and factual.\n"
            "- Use bullet points if listing multiple items.\n"
            "- Only use data present above — do not guess.\n"
            "- If the data is insufficient, say so clearly.\n"
        )

        # [CRM Assistant] Try Gemini first (primary), fall back to Ollama
        from backend.core.state import _m
        answer = None

        if _m.get("gemini"):
            try:
                from backend.language.llm_core import _gemini_sync
                answer = _gemini_sync(
                    [{"role": "user", "text": question}],
                    "en", "CRMAssistant",
                    custom_prompt_text=context,
                )
            except Exception as e:
                logger.warning("[CRM Assistant] Gemini failed: %s", e)

        if not answer:
            # [CRM Assistant] Ollama fallback
            try:
                import requests as _req
                from backend.core.config import OLLAMA_URL, OLLAMA_MODEL
                r = _req.post(OLLAMA_URL, timeout=60, json={
                    "model":    OLLAMA_MODEL,
                    "messages": [
                        {"role": "system", "content": context},
                        {"role": "user",   "content": question},
                    ],
                    "stream":     False,
                    "keep_alive": -1,
                    "options":    {"temperature": 0.3, "num_predict": 300, "num_ctx": 4096},
                })
                r.raise_for_status()
                answer = r.json()["message"]["content"].strip()
            except Exception as e:
                logger.warning("[CRM Assistant] Ollama failed: %s", e)

        if not answer:
            answer = (
                "CRM Assistant is offline. Both Gemini and Ollama are unavailable. "
                "Please check your AI configuration."
            )

        return {"answer": answer}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[CRM Assistant] Unexpected error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
