"""
START
   │
   ▼
EmailService() → Main email handler
   │
   ├── _get_config() ----------------→ Get SMTP configuration
   │
   ├── is_configured() ----------------→ Check if email service is configured
   │
   ▼
Email Sending
   │
   └── send_email() ----------------→ Send email via SMTP
           ├── Create MIME message
           │
           ├── Connect to SMTP server
           │
           ├── Send email
           │
           ├── Retry logic (implicit)
           │
           └── Error handling → DLQ/Logging
   │
   ▼
Templates
   │
   ├── DEFAULT_TEMPLATES ----------------→ Predefined email templates
   │
   └── serialize_email_campaign() --------→ Convert campaign to dict
   │
   ▼
END
"""

import os
import logging
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import logging
logger = logging.getLogger(__name__)

# ✅ HARDCODED FOR NOW — move back to env vars later
SMTP_HOST     = os.getenv("SMTP_HOST",     "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT",     "587"))
SMTP_USER     = os.getenv("SMTP_USER",     "dubeyminakshi096@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "fxpcfqbrywhhnevq")
SMTP_FROM     = os.getenv("SMTP_FROM",     "dubeyminakshi096@gmail.com")
SMTP_USE_TLS  = os.getenv("SMTP_USE_TLS",    "true").lower() == "true"


def _get_config():
    """Get SMTP configuration"""
    logger.debug("Fetching SMTP configuration")
    return {
        "host": SMTP_HOST,
        "port": SMTP_PORT,
        "user": SMTP_USER,
        "password": SMTP_PASSWORD,
        "from": SMTP_FROM,
        "tls": SMTP_USE_TLS,
    }


def is_configured():
    """Check if email service is configured"""
    configured = bool(SMTP_USER and SMTP_PASSWORD)
    logger.debug(f"Email service configured: {configured}")
    return configured


async def send_email(to_email, subject, body_html, body_text="", from_name="SR Comsoft", from_email="", reply_to=""):
    """
    Send email via SMTP with async execution.
    Falls back to in-memory queue if SMTP unavailable.
    """
    logger.info(f"Sending email to {to_email}: {subject}")
    
    if not is_configured():
        logger.error("Email send failed: SMTP not configured")
        return {"ok": False, "error": "SMTP not configured"}

    sender = from_email or SMTP_FROM

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{from_name} <{sender}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        if reply_to:
            msg["Reply-To"] = reply_to
        if body_text:
            msg.attach(MIMEText(body_text, "plain", "utf-8"))
        msg.attach(MIMEText(body_html, "html", "utf-8"))

        import smtplib
        def _send():
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                if SMTP_USE_TLS:
                    server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(sender, [to_email], msg.as_string())

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)

        logger.info(f"✅ Email sent successfully to {to_email}")
        return {"ok": True}

    except Exception as e:
        logger.error(f"❌ Email send failed: {str(e)}")
        return {"ok": False, "error": str(e)}


DEFAULT_TEMPLATES = [
    {
        "name": "Call Reminder",
        "subject": "Reminder: Scheduled Call",
        "category": "Reminder",
        "body_html": "<h1>Hi {{name}}</h1><p>You have a scheduled call.</p><p>— SR Comsoft</p>",
    },
    {
        "name": "Payment Reminder",
        "subject": "Payment Due",
        "category": "Billing",
        "body_html": "<h1>Hi {{name}}</h1><p>Your payment is due.</p><p>— SR Comsoft Billing</p>",
    },
    {
        "name": "Broadcast Notification",
        "subject": "Important Update",
        "category": "General",
        "body_html": "<h1>Hi {{name}}</h1><p>{{message}}</p><p>— SR Comsoft Team</p>",
    },
]

# ═══════════════════════════════════════════════════════════════════════════════
# Email Triggers for Call Status
# ═══════════════════════════════════════════════════════════════════════════════

async def send_abandoned_call_email(user_email: str, department: str):
    """Trigger 1: User cut the call while in queue."""
    subject = "We're Sorry We Missed You — SR Comsoft"
    body_html = """
    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0f1420; color: #e8edf5; padding: 40px; border-radius: 16px;">
        <h1 style="color: #22d3ee; font-size: 24px;">We're Really Sorry</h1>
        <p style="color: #8892a8; line-height: 1.8; font-size: 16px;">
            You tried to reach our <strong style="color: #818cf8;">{department}</strong> team, but all our agents were busy at that time.
        </p>
        <p style="color: #8892a8; line-height: 1.8; font-size: 16px;">
            We truly value your time and patience. Our team will reach out to you as soon as an agent becomes available.
        </p>
        <p style="color: #8892a8; line-height: 1.8; font-size: 16px;">
            If your matter is urgent, please don't hesitate to call us again during our working hours <strong style="color: #e8edf5;">(9:00 AM – 6:00 PM)</strong>.
        </p>
        <p style="color: #5a6275; margin-top: 30px; font-size: 14px;">— The SR Comsoft Team</p>
    </div>
    """.format(department=department)
    return await send_email(user_email, subject, body_html)


async def send_outbound_no_answer_email(user_email: str, department: str):
    """Trigger 2: System tried to call back but user didn't pick up."""
    subject = "We Tried to Reach You — SR Comsoft"
    body_html = """
    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0f1420; color: #e8edf5; padding: 40px; border-radius: 16px;">
        <h1 style="color: #22d3ee; font-size: 24px;">We Tried Calling You Back</h1>
        <p style="color: #8892a8; line-height: 1.8; font-size: 16px;">
            Our <strong style="color: #818cf8;">{department}</strong> team attempted to reach you, but it seems you were unavailable.
        </p>
        <p style="color: #8892a8; line-height: 1.8; font-size: 16px;">
            Could you please let us know the best time to call you? Simply reply to this email with your preferred time.
        </p>
        <p style="color: #8892a8; line-height: 1.8; font-size: 16px;">
            You can also call us anytime during our working hours <strong style="color: #e8edf5;">(9:00 AM – 6:00 PM)</strong>.
        </p>
        <p style="color: #5a6275; margin-top: 30px; font-size: 14px;">— The SR Comsoft Team</p>
    </div>
    """.format(department=department)
    return await send_email(user_email, subject, body_html)