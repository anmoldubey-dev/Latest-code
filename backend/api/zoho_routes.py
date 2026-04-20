"""
Zoho Integration Routes — CRM, Desk, Mail, OAuth2, and Webhook receiver.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ZOHO CONFIGURATION GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — Zoho API Console (already configured with provided credentials)
  - App type: Server-based Application
  - Redirect URI: {ngrok_url}/api/zoho/auth/callback
  - Scopes: ZohoCRM.modules.contacts.ALL, Desk.tickets.ALL,
            Desk.basic.READ, ZohoMail.messages.ALL, ZohoMail.accounts.READ

STEP 2 — Token Setup (tokens pre-loaded in admin_config table)
  - Credentials are seeded at startup via init_db()
  - Tokens auto-refresh via get_valid_zoho_token() before each API call
  - Refresh token valid for 60 days; access token valid for 1 hour

STEP 3 — Zoho CRM Webhook (create contact.created / contact.updated / contact.deleted)
  1. Go to: Zoho CRM → Settings → Developer Space → Webhooks → New Webhook
  2. URL: https://{your-ngrok-url}.ngrok-free.app/api/zoho/webhook
  3. Module: Contacts
  4. Events: On Create, On Edit, On Delete
  5. Parameters (JSON body): include $Contact.id, $Contact.Email,
     $Contact.Full_Name, $Contact.Phone, $Contact.Account_Name
  6. Custom Headers: X-Zoho-Webhook-Token = srcomsoft_webhook_2024
  7. Click Test — should return {"status": "ok"}

STEP 4 — Zoho CRM Workflow Rule (fires webhook automatically)
  1. Go to: Settings → Automation → Workflow Rules → Create Rule
  2. Module: Contacts, Trigger: Record Created OR Record Edited
  3. Action: Webhook → select the webhook from Step 3
  4. Activate the rule

STEP 5 — Zoho Desk Webhook (optional, for ticket status sync)
  1. Go to: Zoho Desk → Settings → Developer Space → Webhooks → New Webhook
  2. URL: https://{your-ngrok-url}.ngrok-free.app/api/zoho/webhook
  3. Events: Ticket Created, Ticket Updated
  4. Add same X-Zoho-Webhook-Token header

STEP 6 — Verify full flow
  1. Create contact in Zoho CRM → crm_contacts row appears in Neon DB
  2. Accept call → CrmSidebar shows real caller data
  3. Desk ticket auto-created, visible in CRM page Tickets tab
  4. Type note in CrmSidebar → appears in crm_notes and Zoho Desk ticket
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import asyncio
import logging
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Request, HTTPException

from .callcenter.db import get_pool, get_config, set_config

logger = logging.getLogger("zoho_routes")
zoho_router = APIRouter()

# Prevent concurrent token refresh races
_token_lock = asyncio.Lock()


# ─────────────────────────────────────────────────────────────────────────────
# Internal: token management
# ─────────────────────────────────────────────────────────────────────────────

async def _accounts_domain() -> str:
    return await get_config("zoho_accounts_domain") or "accounts.zoho.in"


async def _api_domain() -> str:
    return await get_config("zoho_api_domain") or "zohoapis.in"


async def get_valid_zoho_token() -> str:
    """Return a valid Zoho access token, refreshing if within 5 minutes of expiry."""
    async with _token_lock:
        expires_at = float(await get_config("zoho_token_expires_at") or "0")
        if time.time() < expires_at - 300:
            token = await get_config("zoho_access_token")
            if token:
                return token
        # Refresh
        client_id     = await get_config("zoho_client_id")
        client_secret = await get_config("zoho_client_secret")
        refresh_token = await get_config("zoho_refresh_token")
        accounts      = await _accounts_domain()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"https://{accounts}/oauth/v2/token",
                data={
                    "grant_type":    "refresh_token",
                    "client_id":     client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                },
            )
        if resp.status_code != 200:
            logger.error("[Zoho] Token refresh failed: %s", resp.text)
            # Fall back to stored token even if potentially expired
            return await get_config("zoho_access_token") or ""
        data = resp.json()
        new_token  = data.get("access_token", "")
        expires_in = int(data.get("expires_in", 3600))
        await set_config("zoho_access_token", new_token)
        await set_config("zoho_token_expires_at", str(time.time() + expires_in))
        logger.info("[Zoho] Token refreshed, expires in %ds", expires_in)
        return new_token


async def _zoho_headers() -> dict:
    token = await get_valid_zoho_token()
    return {"Authorization": f"Zoho-oauthtoken {token}"}


# ─────────────────────────────────────────────────────────────────────────────
# OAuth2 endpoints
# ─────────────────────────────────────────────────────────────────────────────

@zoho_router.get("/api/zoho/auth/url")
async def zoho_auth_url():
    client_id    = await get_config("zoho_client_id")
    redirect_uri = await get_config("zoho_redirect_uri") or ""
    accounts     = await _accounts_domain()
    scope = (
        "ZohoCRM.modules.contacts.ALL,"
        "Desk.tickets.ALL,Desk.basic.READ,"
        "ZohoMail.messages.ALL,ZohoMail.accounts.READ"
    )
    url = (
        f"https://{accounts}/oauth/v2/auth"
        f"?client_id={client_id}"
        f"&response_type=code"
        f"&access_type=offline"
        f"&redirect_uri={redirect_uri}"
        f"&scope={scope}"
    )
    return {"url": url}


@zoho_router.get("/api/zoho/auth/callback")
async def zoho_auth_callback(code: str, request: Request):
    """Zoho redirects here with ?code= after admin approves OAuth2."""
    client_id     = await get_config("zoho_client_id")
    client_secret = await get_config("zoho_client_secret")
    redirect_uri  = await get_config("zoho_redirect_uri") or ""
    accounts      = await _accounts_domain()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://{accounts}/oauth/v2/token",
            data={
                "grant_type":    "authorization_code",
                "client_id":     client_id,
                "client_secret": client_secret,
                "redirect_uri":  redirect_uri,
                "code":          code,
            },
        )
    if resp.status_code != 200:
        raise HTTPException(400, f"Token exchange failed: {resp.text}")
    data = resp.json()
    await set_config("zoho_access_token",    data.get("access_token", ""))
    await set_config("zoho_refresh_token",   data.get("refresh_token", ""))
    await set_config("zoho_token_expires_at", str(time.time() + int(data.get("expires_in", 3600))))
    return {"status": "ok", "message": "Zoho tokens stored. You can close this tab."}


@zoho_router.post("/api/zoho/auth/refresh")
async def force_refresh():
    token = await get_valid_zoho_token()
    return {"status": "ok", "token_preview": token[:20] + "..." if token else ""}


# ─────────────────────────────────────────────────────────────────────────────
# Zoho CRM — Contacts
# ─────────────────────────────────────────────────────────────────────────────

@zoho_router.get("/api/zoho/contacts/lookup")
async def lookup_contact(email: str = "", phone: str = ""):
    if not email and not phone:
        raise HTTPException(400, "email or phone required")
    api    = await _api_domain()
    hdrs   = await _zoho_headers()
    criteria = f"(Email:equals:{email})" if email else f"(Phone:equals:{phone})"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"https://www.{api}/crm/v2/Contacts/search",
            params={"criteria": criteria},
            headers=hdrs,
        )
    if resp.status_code == 204 or not resp.json().get("data"):
        return {"found": False, "contact": {}}

    rec = resp.json()["data"][0]
    contact_data = {
        "zoho_contact_id": rec.get("id"),
        "email":           rec.get("Email", email),
        "phone":           rec.get("Phone", phone),
        "name":            rec.get("Full_Name", ""),
        "company":         rec.get("Account_Name", ""),
        "segment":         rec.get("Customer_Segment", "standard"),
    }
    # Sync to Neon
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO crm_contacts (zoho_contact_id, email, phone, name, company, segment, zoho_synced_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW())
               ON CONFLICT (email) DO UPDATE SET
                 zoho_contact_id=$1, phone=$3, name=$4, company=$5, segment=$6, zoho_synced_at=NOW()""",
            contact_data["zoho_contact_id"], contact_data["email"], contact_data["phone"],
            contact_data["name"], contact_data["company"], contact_data["segment"],
        )
    return {"found": True, "contact": contact_data}


@zoho_router.post("/api/zoho/contacts")
async def create_zoho_contact(payload: dict):
    api  = await _api_domain()
    hdrs = await _zoho_headers()
    body = {"data": [{
        "Last_Name":    payload.get("name", "Unknown"),
        "Email":        payload.get("email", ""),
        "Phone":        payload.get("phone", ""),
        "Account_Name": payload.get("company", ""),
    }]}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://www.{api}/crm/v2/Contacts", json=body, headers=hdrs
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(502, f"Zoho CRM error: {resp.text}")
    zoho_id = resp.json()["data"][0]["details"]["id"]
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO crm_contacts (zoho_contact_id, email, phone, name, company, zoho_synced_at)
               VALUES ($1,$2,$3,$4,$5,NOW())
               ON CONFLICT (email) DO UPDATE SET zoho_contact_id=$1, zoho_synced_at=NOW()""",
            zoho_id, payload.get("email",""), payload.get("phone",""),
            payload.get("name",""), payload.get("company",""),
        )
    return {"zoho_contact_id": zoho_id, "status": "created"}


@zoho_router.patch("/api/zoho/contacts/{zoho_contact_id}")
async def update_zoho_contact(zoho_contact_id: str, payload: dict):
    api  = await _api_domain()
    hdrs = await _zoho_headers()
    field_map = {"name": "Last_Name", "phone": "Phone", "company": "Account_Name"}
    data = {field_map[k]: v for k, v in payload.items() if k in field_map}
    data["id"] = zoho_contact_id
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.put(
            f"https://www.{api}/crm/v2/Contacts", json={"data": [data]}, headers=hdrs
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(502, f"Zoho CRM update error: {resp.text}")
    pool = await get_pool()
    async with pool.acquire() as conn:
        sets, params = [], [zoho_contact_id]
        for k, v in payload.items():
            if k in ("name", "phone", "company", "segment"):
                params.append(v)
                sets.append(f"{k}=${len(params)}")
        if sets:
            await conn.execute(
                f"UPDATE crm_contacts SET {', '.join(sets)}, zoho_synced_at=NOW() WHERE zoho_contact_id=$1",
                *params
            )
    return {"status": "updated"}


@zoho_router.delete("/api/zoho/contacts/{zoho_contact_id}")
async def delete_zoho_contact(zoho_contact_id: str):
    """Delete a contact from Zoho CRM. Also removes from Neon DB."""
    api_domain = await _api_domain()
    hdrs = await _zoho_headers()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(
            f"https://www.{api_domain}/crm/v2/Contacts/{zoho_contact_id}",
            headers=hdrs,
        )
    if resp.status_code not in (200, 204):
        logger.warning("[Zoho] Delete contact %s failed: %s", zoho_contact_id, resp.text)
    # Remove from Neon DB
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM crm_contacts WHERE zoho_contact_id=$1", zoho_contact_id
        )
    return {"status": "deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# Zoho Desk — Tickets
# ─────────────────────────────────────────────────────────────────────────────

async def _desk_base() -> str:
    return "https://desk.zoho.in/api/v1"


async def _desk_headers() -> dict:
    token    = await get_valid_zoho_token()
    org_id   = await get_config("zoho_desk_org_id") or ""
    return {
        "Authorization": f"Zoho-oauthtoken {token}",
        "orgId": org_id,
    }


@zoho_router.get("/api/zoho/desk/tickets")
async def list_desk_tickets(contact_email: str = ""):
    base = await _desk_base()
    hdrs = await _desk_headers()
    params = {}
    if contact_email:
        params["email"] = contact_email
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{base}/tickets", params=params, headers=hdrs)
    if resp.status_code != 200:
        logger.warning("[ZohoDesk] list tickets error: %s", resp.text)
        return []
    data = resp.json().get("data", [])
    return [
        {
            "zoho_ticket_id": t.get("id"),
            "subject":        t.get("subject", ""),
            "status":         t.get("status", "open"),
            "priority":       t.get("priority", "medium"),
            "created_at":     t.get("createdTime"),
        }
        for t in data
    ]


@zoho_router.post("/api/zoho/desk/tickets")
async def create_desk_ticket(payload: dict):
    base    = await _desk_base()
    hdrs    = await _desk_headers()
    dept_id = await get_config("zoho_desk_dept_id") or ""
    contact_email   = payload.get("contact_email", "")
    subject         = payload.get("subject", f"Support Request — {contact_email}")
    description     = payload.get("description", "Call initiated from VoiceAicore agent dashboard.")
    priority        = payload.get("priority", "medium")
    call_session_id = str(payload.get("call_session_id", ""))

    body = {
        "subject":      subject,
        "description":  description,
        "priority":     priority,
        "departmentId": dept_id,
        "email":        contact_email,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{base}/tickets", json=body, headers=hdrs)

    zoho_ticket_id: Optional[str] = None
    if resp.status_code in (200, 201):
        zoho_ticket_id = resp.json().get("id")
    else:
        logger.warning("[ZohoDesk] create ticket warning: %s", resp.text)

    # Always persist locally
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            if zoho_ticket_id:
                row = await conn.fetchrow(
                    """INSERT INTO crm_tickets (zoho_ticket_id, contact_email, subject, priority, call_session_id)
                       VALUES ($1,$2,$3,$4,$5)
                       ON CONFLICT (zoho_ticket_id) DO UPDATE SET subject=EXCLUDED.subject RETURNING *""",
                    zoho_ticket_id, contact_email, subject, priority, call_session_id,
                )
            else:
                row = await conn.fetchrow(
                    """INSERT INTO crm_tickets (contact_email, subject, priority, call_session_id)
                       VALUES ($1,$2,$3,$4) RETURNING *""",
                    contact_email, subject, priority, call_session_id,
                )
        if not row:
            raise ValueError("DB insert returned no row")
        return {
            "id":             row["id"],
            "zoho_ticket_id": row["zoho_ticket_id"],
            "contact_email":  row["contact_email"],
            "subject":        row["subject"],
            "status":         row["status"],
            "priority":       row["priority"],
            "created_at":     row["created_at"].isoformat() if row["created_at"] else None,
            "call_session_id": row["call_session_id"],
        }
    except Exception as exc:
        logger.error("[ZohoDesk] ticket persist error: %s", exc)
        return {"zoho_ticket_id": zoho_ticket_id, "contact_email": contact_email, "subject": subject, "error": str(exc)}


@zoho_router.post("/api/zoho/desk/tickets/{zoho_ticket_id}/notes")
async def add_desk_note(zoho_ticket_id: str, payload: dict, request: Request):
    note_text = payload.get("note_text", "").strip()
    if not note_text:
        raise HTTPException(400, "note_text is required")

    agent_id = payload.get("agent_id", "unknown")

    # Push to Zoho Desk
    base = await _desk_base()
    hdrs = await _desk_headers()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{base}/tickets/{zoho_ticket_id}/comments",
            json={"content": note_text, "isPublic": False},
            headers=hdrs,
        )
    if resp.status_code not in (200, 201):
        logger.warning("[ZohoDesk] add note warning: %s", resp.text)

    # Persist locally
    pool = await get_pool()
    async with pool.acquire() as conn:
        ticket = await conn.fetchrow(
            "SELECT id FROM crm_tickets WHERE zoho_ticket_id=$1", zoho_ticket_id
        )
        if ticket:
            await conn.execute(
                "INSERT INTO crm_notes (ticket_id, agent_id, note_text) VALUES ($1,$2,$3)",
                ticket["id"], agent_id, note_text,
            )
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# Zoho Mail
# ─────────────────────────────────────────────────────────────────────────────

async def _mail_account_id() -> str:
    return await get_config("zoho_mail_account_id") or ""


@zoho_router.get("/api/zoho/mail/threads")
async def list_mail_threads(contact_email: str = ""):
    account_id = await _mail_account_id()
    token = await get_valid_zoho_token()
    hdrs = {"Authorization": f"Zoho-oauthtoken {token}"}
    params: dict = {"limit": 20}
    if contact_email:
        params["searchKey"] = contact_email
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"https://mail.zoho.in/api/accounts/{account_id}/messages/search",
            params=params, headers=hdrs,
        )
    if resp.status_code != 200:
        logger.warning("[ZohoMail] list threads error: %s", resp.text)
        return []
    items = resp.json().get("data", [])
    return [
        {
            "thread_id":    m.get("messageId"),
            "subject":      m.get("subject", ""),
            "from_address": m.get("fromAddress", ""),
            "date":         m.get("receivedTime", ""),
            "snippet":      m.get("summary", ""),
        }
        for m in items
    ]


@zoho_router.post("/api/zoho/mail/send")
async def send_mail(payload: dict):
    account_id  = await _mail_account_id()
    mail_from   = await get_config("zoho_mail_from") or "srcom_soft@zohomail.in"
    token       = await get_valid_zoho_token()
    hdrs        = {"Authorization": f"Zoho-oauthtoken {token}"}

    body = {
        "fromAddress": mail_from,
        "toAddress":   payload.get("to", ""),
        "subject":     payload.get("subject", ""),
        "content":     payload.get("body", ""),
    }
    if payload.get("thread_id"):
        body["mailId"] = payload["thread_id"]

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://mail.zoho.in/api/accounts/{account_id}/messages",
            json=body, headers=hdrs,
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(502, f"Zoho Mail send error: {resp.text}")
    return {"status": "sent", "message_id": resp.json().get("data", {}).get("messageId")}


# ─────────────────────────────────────────────────────────────────────────────
# Zoho Webhook receiver — PUBLIC (no JWT)
# ─────────────────────────────────────────────────────────────────────────────

async def _parse_webhook_body(request: Request) -> dict:
    """
    Parse Zoho webhook payload regardless of how it was sent:
    - JSON body (Body Type = JSON)
    - Form data (Body Type = Form-Data)
    - Query parameters (Body Type = None)
    Also normalises field names from Zoho's format to what we expect.
    """
    # Try JSON body first
    try:
        raw = await request.json()
    except Exception:
        raw = {}

    # Fallback: form data
    if not raw:
        try:
            form = await request.form()
            raw = dict(form)
        except Exception:
            raw = {}

    # Fallback: query parameters (Body Type = None in Zoho)
    if not raw:
        raw = dict(request.query_params)

    # Merge query params always (token may arrive there too)
    for k, v in request.query_params.items():
        if k not in raw:
            raw[k] = v

    # Normalise field names — Zoho sends them exactly as you named the parameters
    # Map the user-defined names → our standard keys
    field_map = {
        "first name":   "first_name",
        "last name":    "last_name",
        "account name": "Account_Name",
        "phone":        "Phone",
        "email":        "Email",
        "id":           "id",
        # Standard Zoho CRM field names (if user uses these instead)
        "Email":        "Email",
        "Phone":        "Phone",
        "Full_Name":    "Full_Name",
        "Account_Name": "Account_Name",
    }
    normalised = {}
    for k, v in raw.items():
        mapped = field_map.get(k, k)
        normalised[mapped] = v

    # Build Full_Name from first + last if not already present
    if "Full_Name" not in normalised:
        first = normalised.get("first_name", "")
        last  = normalised.get("last_name", "")
        if first or last:
            normalised["Full_Name"] = f"{first} {last}".strip()

    logger.info("[ZohoWebhook] parsed payload keys=%s", list(normalised.keys()))
    return normalised


async def _verify_webhook_token(request: Request, body: dict):
    """Check token in HTTP headers OR in the parsed body (Custom Parameters)."""
    expected = await get_config("zoho_webhook_secret") or "srcomsoft_webhook_2024"
    import hmac
    # Check HTTP header first (correct setup)
    incoming = request.headers.get("X-Zoho-Webhook-Token", "")
    # Also check inside parsed body (current user setup uses Custom Parameters)
    if not incoming:
        incoming = body.get("X-Zoho-Webhook-Token", "")
    if not hmac.compare_digest(incoming, expected):
        raise HTTPException(status_code=403, detail="Invalid webhook token")


@zoho_router.post("/api/zoho/webhook/contact-upsert")
async def webhook_contact_upsert(request: Request):
    """Zoho Workflow Rule fires this on Contact Created OR Contact Edited."""
    body = await _parse_webhook_body(request)
    await _verify_webhook_token(request, body)
    await _sync_contact_upsert(body)
    return {"status": "ok"}


@zoho_router.post("/api/zoho/webhook/contact-delete")
async def webhook_contact_delete(request: Request):
    """Zoho Workflow Rule fires this on Contact Deleted."""
    body = await _parse_webhook_body(request)
    await _verify_webhook_token(request, body)
    await _sync_contact_delete(body)
    return {"status": "ok"}


@zoho_router.post("/api/zoho/webhook/ticket")
async def webhook_ticket(request: Request):
    """Zoho Desk Webhook fires this on Ticket Created or Updated."""
    body = await _parse_webhook_body(request)
    await _verify_webhook_token(request, body)
    await _sync_ticket(body)
    return {"status": "ok"}


@zoho_router.post("/api/zoho/webhook")
async def zoho_webhook_legacy(request: Request):
    """Legacy single-endpoint webhook — backward compatibility."""
    body = await _parse_webhook_body(request)
    await _verify_webhook_token(request, body)
    event = body.get("event", "")
    data  = body.get("data", body)
    if event in ("contact.created", "contact.updated") or (not event and body.get("Email")):
        await _sync_contact_upsert(data)
    elif event == "contact.deleted":
        await _sync_contact_delete(data)
    elif event in ("ticket.created", "ticket.updated"):
        await _sync_ticket(data)
    return {"status": "ok"}


async def _sync_contact_upsert(data: dict):
    zoho_id = data.get("id") or data.get("contactId")
    email   = data.get("Email") or data.get("email", "")
    if not email:
        return
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO crm_contacts (zoho_contact_id, email, phone, name, company, segment, zoho_synced_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW())
               ON CONFLICT (email) DO UPDATE SET
                 zoho_contact_id=$1, phone=$3, name=$4, company=$5, segment=$6, zoho_synced_at=NOW()""",
            zoho_id,
            email,
            data.get("Phone", ""),
            data.get("Full_Name", "") or data.get("name", ""),
            data.get("Account_Name", "") or data.get("company", ""),
            data.get("Customer_Segment", "standard"),
        )
    logger.info("[ZohoWebhook] upserted contact %s", email)


async def _sync_contact_delete(data: dict):
    zoho_id = data.get("id") or data.get("contactId")
    if not zoho_id:
        return
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE crm_contacts SET zoho_contact_id=NULL, zoho_synced_at=NOW() WHERE zoho_contact_id=$1",
            zoho_id,
        )
    logger.info("[ZohoWebhook] unlinked deleted contact %s", zoho_id)


async def _sync_ticket(data: dict):
    zoho_ticket_id = data.get("id") or data.get("ticketId")
    contact_email  = data.get("email") or data.get("contactEmail", "")
    subject        = data.get("subject", "")
    status         = data.get("status", "open")
    priority       = data.get("priority", "medium")
    if not zoho_ticket_id:
        return
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO crm_tickets (zoho_ticket_id, contact_email, subject, status, priority)
               VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (zoho_ticket_id) DO UPDATE SET status=$4, priority=$5""",
            zoho_ticket_id, contact_email, subject, status, priority,
        )
    logger.info("[ZohoWebhook] synced ticket %s", zoho_ticket_id)
