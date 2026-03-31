# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | create_call()                    |
# | * INSERT new call row            |
# +----------------------------------+
#     |
#     |----> <Call> -> __init__()
#     |        * build ORM object
#     |
#     |----> <db> -> add()
#     |        * stage for insert
#     |
#     |----> <db> -> commit()
#     |        * persist to MySQL
#     |
#     v
# +----------------------------------+
# | end_call()                       |
# | * UPDATE call status to ended    |
# +----------------------------------+
#     |
#     |----> <db> -> query()
#     |        * fetch call by id
#     |
#     |----> <db> -> commit()
#     |        * persist status change
#     |
#     v
# +----------------------------------+
# | get_active_calls()               |
# | * SELECT non-ended calls         |
# +----------------------------------+
#     |
#     |----> <db> -> query()
#     |        * filter active statuses
#     |
#     v
# +----------------------------------+
# | get_call_history()               |
# | * SELECT paginated ended calls   |
# +----------------------------------+
#     |
#     |----> <db> -> query()
#     |        * paginated ended calls
#     |
#     v
# +----------------------------------+
# | get_call_by_id()                 |
# | * SELECT single call by id       |
# +----------------------------------+
#     |
#     |----> <db> -> query()
#     |        * filter by call id
#     |
#     v
# +----------------------------------+
# | delete_call()                    |
# | * DELETE call with cascade       |
# +----------------------------------+
#     |
#     |----> <db> -> delete()
#     |        * cascade routes and transcripts
#     |
#     |----> <db> -> commit()
#     |        * persist deletion
#     |
#     v
# +----------------------------------+
# | transfer_call()                  |
# | * INSERT CallRoute update call   |
# +----------------------------------+
#     |
#     |----> <CallRoute> -> __init__()
#     |        * build route ORM object
#     |
#     |----> <db> -> commit()
#     |        * persist route and call
#     |
#     v
# +----------------------------------+
# | add_transcript()                 |
# | * INSERT Transcript row          |
# +----------------------------------+
#     |
#     |----> <db> -> query()
#     |        * verify call exists
#     |
#     |----> <Transcript> -> __init__()
#     |        * build ORM object
#     |
#     |----> <db> -> commit()
#     |        * persist transcript
#     |
#     v
# +----------------------------------+
# | get_transcripts()                |
# | * SELECT ordered transcripts     |
# +----------------------------------+
#     |
#     |----> <db> -> query()
#     |        * filter by call_id asc
#     |
#     v
# +----------------------------------+
# | seed_demo_data()                 |
# | * insert demo agents if empty    |
# +----------------------------------+
#     |
#     |----> <db> -> query()
#     |        * check Agent count
#     |
#     |----> <db> -> add_all()
#     |        * insert Agent and Call rows
#     |
#     |----> <db> -> add()
#     |        * insert CallRoute row
#     |
#     |----> <db> -> commit()
#     |        * persist all demo data
#
# ================================================================

import logging
from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ..models.call import Call
from ..models.call_route import CallRoute
from ..models.transcript import Transcript
from ..models.user import Agent


def create_call(
    db: Session,
    caller_number: str,
    department: str = "General",
    agent_id: Optional[int] = None,
) -> Call:
    call = Call(
        caller_number=caller_number,
        agent_id=agent_id,
        department=department,
        status="connected",
        started_at=datetime.utcnow(),
    )
    db.add(call)
    db.commit()
    db.refresh(call)
    logger.info("[call_service] call created  id=%s  caller=%s  dept=%s", call.id, caller_number, department)
    return call


def end_call(db: Session, call_id: int) -> Optional[Call]:
    call = db.query(Call).filter(Call.id == call_id).first()
    if not call:
        return None
    now = datetime.utcnow()
    call.ended_at = now
    call.status   = "ended"
    if call.started_at:
        call.duration_seconds = int((now - call.started_at).total_seconds())
    db.commit()
    db.refresh(call)
    logger.info("[call_service] call ended  id=%s  duration=%ss", call.id, call.duration_seconds)
    return call


def get_active_calls(db: Session) -> List[Call]:
    active_statuses = ("dialing", "ringing", "connected", "on_hold", "conference")
    return (
        db.query(Call)
        .filter(Call.status.in_(active_statuses))
        .order_by(Call.started_at.desc())
        .all()
    )


def get_call_history(db: Session, page: int = 1, limit: int = 20) -> List[Call]:
    offset = (page - 1) * limit
    return (
        db.query(Call)
        .filter(Call.status.in_(("ended", "transferred")))
        .order_by(Call.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def get_call_by_id(db: Session, call_id: int) -> Optional[Call]:
    return db.query(Call).filter(Call.id == call_id).first()


def delete_call(db: Session, call_id: int) -> bool:
    call = db.query(Call).filter(Call.id == call_id).first()
    if not call:
        return False
    db.delete(call)
    db.commit()
    return True


def transfer_call(
    db: Session,
    call_id: int,
    to_department: Optional[str],
    to_agent_id: Optional[int],
    from_agent_id: Optional[int] = None,
    action_type: str = "transfer",
) -> Optional[CallRoute]:
    call = db.query(Call).filter(Call.id == call_id).first()
    if not call:
        return None

    route = CallRoute(
        call_id=call_id,
        from_agent_id=from_agent_id,
        to_agent_id=to_agent_id,
        from_department=call.department,
        to_department=to_department,
        action_type=action_type,
    )
    db.add(route)

    call.status = "transferred"
    if to_department:
        call.department = to_department
    if to_agent_id:
        call.agent_id = to_agent_id
    db.commit()
    db.refresh(route)
    return route


def add_transcript(db: Session, call_id: int, speaker: str, text: str) -> Optional[Transcript]:
    call = db.query(Call).filter(Call.id == call_id).first()
    if not call:
        return None
    entry = Transcript(call_id=call_id, speaker=speaker, text=text)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_transcripts(db: Session, call_id: int) -> List[Transcript]:
    return (
        db.query(Transcript)
        .filter(Transcript.call_id == call_id)
        .order_by(Transcript.created_at.asc())
        .all()
    )


def seed_demo_data(db: Session) -> None:
    if db.query(Agent).count() > 0:
        return

    agents = [
        Agent(user_id=1, name="Angela",     persona="Friendly English support agent", voice_model="en", is_active=True),
        Agent(user_id=1, name="Priyamvada", persona="Hindi language support agent",   voice_model="hi", is_active=True),
        Agent(user_id=1, name="Raj",        persona="Billing and accounts specialist", voice_model="hi", is_active=True),
    ]
    db.add_all(agents)
    db.flush()

    now = datetime.utcnow()
    demo_calls = [
        Call(caller_number="+91-98765-43210", agent_id=agents[0].id, department="Sales",
             status="ended", started_at=now - timedelta(hours=2),
             ended_at=now - timedelta(hours=1, minutes=45), duration_seconds=900),
        Call(caller_number="+91-87654-32109", agent_id=agents[1].id, department="Support",
             status="ended", started_at=now - timedelta(hours=3),
             ended_at=now - timedelta(hours=2, minutes=50), duration_seconds=600),
        Call(caller_number="+1-555-234-5678",  agent_id=agents[0].id, department="Sales",
             status="ended", started_at=now - timedelta(hours=5),
             ended_at=now - timedelta(hours=4, minutes=45), duration_seconds=180),
        Call(caller_number="+91-76543-21098", agent_id=agents[2].id, department="Billing",
             status="ended", started_at=now - timedelta(hours=6),
             ended_at=now - timedelta(hours=5, minutes=50), duration_seconds=420),
        Call(caller_number="+91-65432-10987", agent_id=agents[1].id, department="Support",
             status="transferred", started_at=now - timedelta(hours=8),
             ended_at=now - timedelta(hours=7, minutes=50), duration_seconds=310),
        Call(caller_number="+1-555-345-6789",  agent_id=agents[0].id, department="Sales",
             status="ended", started_at=now - timedelta(days=1),
             ended_at=now - timedelta(days=1) + timedelta(minutes=8), duration_seconds=480),
        Call(caller_number="+91-54321-09876", agent_id=agents[1].id, department="Support",
             status="ended", started_at=now - timedelta(days=1, hours=3),
             ended_at=now - timedelta(days=1, hours=2, minutes=50), duration_seconds=270),
    ]
    db.add_all(demo_calls)
    db.flush()

    transcripts = [
        Transcript(call_id=demo_calls[0].id, speaker="system", text="Call connected — Sales department"),
        Transcript(call_id=demo_calls[0].id, speaker="agent",  text="Hello, thank you for calling SR Comsoft Sales. I'm Angela. How can I help you today?"),
        Transcript(call_id=demo_calls[0].id, speaker="caller", text="Hi, I wanted to enquire about your enterprise plan pricing."),
        Transcript(call_id=demo_calls[0].id, speaker="agent",  text="Our enterprise plan starts at ₹5000 per month. Let me walk you through the features."),
        Transcript(call_id=demo_calls[0].id, speaker="caller", text="Can you also tell me about the onboarding process?"),
        Transcript(call_id=demo_calls[0].id, speaker="agent",  text="Onboarding takes 2-3 business days. We provide full support throughout."),
        Transcript(call_id=demo_calls[0].id, speaker="system", text="Call ended"),

        Transcript(call_id=demo_calls[1].id, speaker="system", text="Call connected — Support department"),
        Transcript(call_id=demo_calls[1].id, speaker="agent",  text="नमस्ते, SR Comsoft सपोर्ट में आपका स्वागत है। मैं प्रियमवदा हूँ।"),
        Transcript(call_id=demo_calls[1].id, speaker="caller", text="मेरे अकाउंट में लॉगिन नहीं हो रहा है।"),
        Transcript(call_id=demo_calls[1].id, speaker="agent",  text="मैं आपकी मदद करूँगी। कृपया अपना रजिस्टर्ड मोबाइल नंबर बताइए।"),
        Transcript(call_id=demo_calls[1].id, speaker="caller", text="87654-32109"),
        Transcript(call_id=demo_calls[1].id, speaker="agent",  text="आपका अकाउंट मिल गया। मैं अभी पासवर्ड रीसेट लिंक भेज देती हूँ।"),
        Transcript(call_id=demo_calls[1].id, speaker="system", text="Call ended"),
    ]
    db.add_all(transcripts)

    db.add(CallRoute(
        call_id=demo_calls[4].id,
        from_agent_id=agents[1].id,
        to_agent_id=agents[0].id,
        from_department="Support",
        to_department="Sales",
        action_type="transfer",
    ))

    db.commit()
