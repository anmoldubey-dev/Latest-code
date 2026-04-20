# Email service — SMTP dispatch for abandoned-call and no-answer notifications.
# Adapted from Routing/livekit/callcenter/email_service.py
# SMTP settings are loaded from admin_config table at startup and refreshed on save.

import asyncio
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger("callcenter.email")

# In-memory cache populated from DB on startup (or admin save)
_smtp_cache: dict = {}


async def load_email_config_from_db():
    """Load SMTP settings from admin_config into the in-memory cache."""
    global _smtp_cache
    try:
        from . import db
        _smtp_cache = {
            "host":     await db.get_config("smtp_host")     or os.getenv("SMTP_HOST", "smtp.gmail.com"),
            "port":     int(await db.get_config("smtp_port") or os.getenv("SMTP_PORT", "587")),
            "user":     await db.get_config("smtp_user")     or os.getenv("SMTP_USER", ""),
            "password": await db.get_config("smtp_password") or os.getenv("SMTP_PASSWORD", ""),
            "from":     await db.get_config("smtp_from")     or os.getenv("SMTP_FROM", ""),
            "use_tls":  (
                await db.get_config("smtp_use_tls") or os.getenv("SMTP_USE_TLS", "true")
            ).lower() in ("true", "1", "yes"),
        }
        logger.info("SMTP config loaded from DB (user=%s)", _smtp_cache.get("user") or "not set")
    except Exception as exc:
        logger.warning("Could not load SMTP config from DB: %s", exc)


def _get_config() -> dict:
    if _smtp_cache:
        return _smtp_cache
    return {
        "host":     os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port":     int(os.getenv("SMTP_PORT", "587")),
        "user":     os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from":     os.getenv("SMTP_FROM", ""),
        "use_tls":  os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes"),
    }


def is_configured() -> bool:
    cfg = _get_config()
    return bool(cfg["user"] and cfg["password"] and cfg["from"])


def _blocking_send(to_email: str, subject: str,
                   body_html: str, body_text: str = "") -> dict:
    """Blocking SMTP call — always run via executor."""
    cfg = _get_config()
    if not is_configured():
        return {"ok": False,
                "error": "SMTP not configured — set SMTP_USER, SMTP_PASSWORD, SMTP_FROM in .env or admin config"}

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = cfg["from"]
    msg["To"]      = to_email

    if body_text:
        msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    try:
        if cfg["use_tls"]:
            server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=15)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=15)

        server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from"], [to_email], msg.as_string())
        server.quit()
        logger.info("Email sent → %s: %s", to_email, subject)
        return {"ok": True}
    except Exception as exc:
        logger.error("Email send failed → %s: %s", to_email, exc)
        return {"ok": False, "error": str(exc)}


async def send_email(to_email: str, subject: str,
                     body_html: str, body_text: str = "") -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _blocking_send, to_email, subject, body_html, body_text
    )


# ── Email templates ───────────────────────────────────────────────────────────

async def send_abandoned_call_email(user_email: str, department: str):
    """Caller hung up while waiting in queue."""
    subject   = "We're Sorry We Missed You — SR Comsoft"
    body_html = """
    <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;
                background:#0f1420;color:#e8edf5;padding:40px;border-radius:16px;">
        <h1 style="color:#22d3ee;font-size:24px;">We're Really Sorry</h1>
        <p style="color:#8892a8;line-height:1.8;font-size:16px;">
            You tried to reach our
            <strong style="color:#818cf8;">{department}</strong> team,
            but all our agents were busy at that time.
        </p>
        <p style="color:#8892a8;line-height:1.8;font-size:16px;">
            We truly value your time and patience. Our team will reach out to you
            as soon as an agent becomes available.
        </p>
        <p style="color:#8892a8;line-height:1.8;font-size:16px;">
            If your matter is urgent, please call us again during our working hours
            <strong style="color:#e8edf5;">(9:00 AM – 6:00 PM)</strong>.
        </p>
        <p style="color:#5a6275;margin-top:30px;font-size:14px;">— The SR Comsoft Team</p>
    </div>
    """.format(department=department)
    return await send_email(user_email, subject, body_html)


async def send_outbound_no_answer_email(user_email: str, department: str):
    """System tried to call back but the user didn't pick up."""
    subject   = "We Tried to Reach You — SR Comsoft"
    body_html = """
    <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;
                background:#0f1420;color:#e8edf5;padding:40px;border-radius:16px;">
        <h1 style="color:#22d3ee;font-size:24px;">We Tried Calling You Back</h1>
        <p style="color:#8892a8;line-height:1.8;font-size:16px;">
            Our <strong style="color:#818cf8;">{department}</strong> team
            attempted to reach you, but it seems you were unavailable.
        </p>
        <p style="color:#8892a8;line-height:1.8;font-size:16px;">
            Could you please let us know the best time to call you?
            Simply reply to this email with your preferred time.
        </p>
        <p style="color:#8892a8;line-height:1.8;font-size:16px;">
            You can also call us anytime during our working hours
            <strong style="color:#e8edf5;">(9:00 AM – 6:00 PM)</strong>.
        </p>
        <p style="color:#5a6275;margin-top:30px;font-size:14px;">— The SR Comsoft Team</p>
    </div>
    """.format(department=department)
    return await send_email(user_email, subject, body_html)
