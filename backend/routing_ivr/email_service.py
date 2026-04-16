"""
email_service.py — Missed call / queue-full email notifications.
Adapted from UI_01/Routing/Routing/livekit/callcenter/email_service.py
"""
import asyncio
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger("callcenter.email")


def _cfg() -> dict:
    return {
        "host":     os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port":     int(os.getenv("SMTP_PORT", "587")),
        "user":     os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from":     os.getenv("SMTP_FROM", ""),
        "use_tls":  os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1"),
    }


def is_configured() -> bool:
    c = _cfg()
    return bool(c["user"] and c["password"] and c["from"])


def _blocking_send(to: str, subject: str, html: str) -> bool:
    c = _cfg()
    if not is_configured():
        logger.warning("[Email] SMTP not configured — skipping send to %s", to)
        return False
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = c["from"]
    msg["To"]      = to
    msg.attach(MIMEText(html, "html"))
    try:
        srv = smtplib.SMTP(c["host"], c["port"], timeout=15)
        srv.ehlo()
        if c["use_tls"]:
            srv.starttls(); srv.ehlo()
        srv.login(c["user"], c["password"])
        srv.sendmail(c["from"], [to], msg.as_string())
        srv.quit()
        logger.info("[Email] sent to %s: %s", to, subject)
        return True
    except Exception as exc:
        logger.error("[Email] failed to %s: %s", to, exc)
        return False


async def send_email(to: str, subject: str, html: str) -> bool:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _blocking_send, to, subject, html)


async def send_queue_full_email(to: str, lang: str = "en") -> bool:
    """Sent when all agents are busy and queue is full."""
    subject = "We're Sorry We Missed You — SR Comsoft"
    html = """
<div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;background:#0f1420;color:#e8edf5;padding:40px;border-radius:16px;">
  <h1 style="color:#d4a853;font-size:22px;margin-bottom:16px;">We're Really Sorry</h1>
  <p style="color:#8892a8;line-height:1.8;font-size:15px;">
    You tried to reach <strong style="color:#e8edf5;">SR Comsoft AI</strong>, but all our agents were busy and the queue was full at that moment.
  </p>
  <p style="color:#8892a8;line-height:1.8;font-size:15px;">
    We truly value your time and patience. Please try calling again — our team is available <strong style="color:#e8edf5;">9:00 AM – 6:00 PM</strong>.
  </p>
  <p style="color:#8892a8;line-height:1.8;font-size:15px;">
    We will do our best to assist you as soon as possible.
  </p>
  <p style="color:#5a6275;margin-top:30px;font-size:13px;">— The SR Comsoft Team</p>
</div>"""
    return await send_email(to, subject, html)
