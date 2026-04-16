from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
import datetime
import email_service
import asyncio

router = APIRouter(prefix="/email", tags=["email"])

# In-memory DBs for email logic
TEMPLATES_DB = []
CAMPAIGNS_DB = []

class EmailTemplateCreate(BaseModel):
    name: str
    subject: str
    body_html: str
    category: str = "General"

class EmailSendRequest(BaseModel):
    title: str
    subject: str
    body_html: str
    sender_name: str = "SR Comsoft"
    department: str = "General"
    recipients: List[Dict[str, str]]
    variables: Dict[str, Any] = {}
    schedule_at: Optional[str] = None

@router.get("/status")
def get_email_status():
    return {"configured": email_service.is_configured()}

@router.get("/templates")
def get_templates():
    return TEMPLATES_DB

@router.post("/templates")
def create_template(data: EmailTemplateCreate):
    tpl = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "subject": data.subject,
        "body_html": data.body_html,
        "category": data.category
    }
    TEMPLATES_DB.append(tpl)
    return tpl

@router.post("/templates/seed")
def seed_templates():
    global TEMPLATES_DB
    TEMPLATES_DB = [{"id": str(uuid.uuid4()), **t} for t in email_service.DEFAULT_TEMPLATES]
    return {"status": "seeded", "count": len(TEMPLATES_DB)}

@router.get("/campaigns")
def get_campaigns():
    return sorted(CAMPAIGNS_DB, key=lambda x: x.get("created_at", ""), reverse=True)

@router.post("/send")
async def send_campaign(data: EmailSendRequest):
    if not data.recipients:
        raise HTTPException(status_code=400, detail="No recipients provided")

    campaign_id = str(uuid.uuid4())
    campaign = {
        "id": campaign_id,
        "title": data.title,
        "subject": data.subject,
        "department": data.department,
        "status": "sending",
        "total_recipients": len(data.recipients),
        "sent_count": 0,
        "failed_count": 0,
        "created_at": datetime.datetime.utcnow().isoformat()
    }
    CAMPAIGNS_DB.append(campaign)

    # Process emails directly instead of a background task so we can catch auth errors immediately
    sent = 0
    failed = 0
    last_error = None
    
    for rec in data.recipients:
        to_email = rec.get("email")
        rec_name = rec.get("name", "")
        
        # Simple variable replacement
        html = data.body_html.replace("{{name}}", rec_name).replace("{{email}}", to_email)
        
        res = await email_service.send_email(
            to_email=to_email,
            subject=data.subject,
            body_html=html,
            from_name=data.sender_name
        )
        if res.get("ok"):
            sent += 1
        else:
            failed += 1
            last_error = res.get("error")
            
    # Update campaign status
    campaign["status"] = "completed" if failed == 0 else "failed"
    campaign["sent_count"] = sent
    campaign["failed_count"] = failed
    
    if failed > 0 and sent == 0:
        # All failed. Likely an SMTP Auth issue. Surface physical error to the user UI
        raise HTTPException(status_code=400, detail=f"SMTP Error: {last_error}")

    return {"status": "started", "campaign": campaign}
