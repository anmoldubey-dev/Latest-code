# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | _serialize_call()                |
# | * convert ORM Call to dict       |
# +----------------------------------+
#     |
#     |----> compute live duration    * if call still active
#     |
#     |----> return dict              * JSON serializable call data
#     |
#     v
# +----------------------------------+
# | start_call()                     |
# | * POST /calls/start new call     |
# +----------------------------------+
#     |
#     |----> <call_service> -> create_call()      * INSERT calls row
#     |
#     |----> <call_service> -> add_transcript()   * system turn inserted
#     |
#     |----> _serialize_call()                    * return call data
#     |
#     v
# +----------------------------------+
# | end_call()                       |
# | * POST /calls/{id}/end close     |
# +----------------------------------+
#     |
#     |----> <call_service> -> end_call()         * UPDATE status ended
#     |
#     |----> <call_service> -> add_transcript()   * system turn inserted
#     |
#     |----> _serialize_call()                    * return call data
#     |
#     v
# +----------------------------------+
# | active_calls()                   |
# | * GET /calls/active list calls   |
# +----------------------------------+
#     |
#     |----> <call_service> -> get_active_calls() * query active statuses
#     |
#     v
# +----------------------------------+
# | call_history()                   |
# | * GET /calls/history paginated   |
# +----------------------------------+
#     |
#     |----> <call_service> -> get_call_history() * paginated ended calls
#     |
#     v
# +----------------------------------+
# | transfer_call()                  |
# | * POST /calls/{id}/transfer      |
# +----------------------------------+
#     |
#     |----> <call_service> -> get_call_by_id()  * lookup call
#     |
#     |----> <call_service> -> transfer_call()   * INSERT CallRoute row
#     |
#     |----> <call_service> -> add_transcript()  * system turn inserted
#     |
#     |----> _serialize_call()                   * return call data
#     |
#     v
# +----------------------------------+
# | add_transcript()                 |
# | * POST /calls/{id}/transcript    |
# +----------------------------------+
#     |
#     |----> <call_service> -> add_transcript()  * INSERT Transcript row
#     |
#     v
# +----------------------------------+
# | get_transcripts()                |
# | * GET /calls/{id}/transcripts    |
# +----------------------------------+
#     |
#     |----> <call_service> -> get_transcripts() * SELECT ordered turns
#     |
#     v
# +----------------------------------+
# | delete_call()                    |
# | * DELETE /calls/{id} cascade     |
# +----------------------------------+
#     |
#     |----> <call_service> -> delete_call()     * DELETE with cascade
#     |
#     v
# +----------------------------------+
# | set_recording_path()             |
# | * PATCH /calls/{id}/recording    |
# +----------------------------------+
#     |
#     |----> <call_service> -> get_call_by_id()  * lookup call
#     |
#     |----> <db> -> commit()                    * persist recording path
#     |
#     v
# +----------------------------------+
# | get_recording()                  |
# | * GET /calls/{id}/recording WAV  |
# +----------------------------------+
#     |
#     |----> <call_service> -> get_call_by_id()  * lookup call
#     |
#     |----> return FileResponse()               * stream audio/wav bytes
#
# ================================================================

from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database.connection import get_db
from ..schemas.call import CallStartRequest, TransferRequest
from ..schemas.transcript import TranscriptCreate
from ..services import call_service


class RecordingUpdate(BaseModel):
    recording_path: str

router = APIRouter(tags=["calls"])

RECORDINGS_DIR = Path(__file__).parent.parent / "recordings"


def _serialize_call(call) -> dict:
    duration = call.duration_seconds
    if call.status in ("connected", "on_hold", "conference") and call.started_at:
        duration = int((datetime.utcnow() - call.started_at).total_seconds())

    return {
        "id": call.id,
        "caller_number": call.caller_number,
        "agent_id": call.agent_id,
        "agent_name": call.agent.name if call.agent else None,
        "department": call.department,
        "status": call.status,
        "started_at": call.started_at.isoformat() if call.started_at else None,
        "ended_at": call.ended_at.isoformat() if call.ended_at else None,
        "duration_seconds": duration,
        "recording_path": call.recording_path,
        "created_at": call.created_at.isoformat() if call.created_at else None,
        "routes": [
            {
                "id": r.id,
                "from_department": r.from_department,
                "to_department": r.to_department,
                "action_type": r.action_type,
                "routed_at": r.routed_at.isoformat() if r.routed_at else None,
            }
            for r in call.routes
        ],
    }


@router.post("/start")
def start_call(req: CallStartRequest, db: Session = Depends(get_db)):
    from ..models.user import Agent
    agent = db.query(Agent).filter(Agent.is_active == True).first()  # noqa: E712
    call = call_service.create_call(
        db,
        caller_number=req.caller_number,
        department=req.department or "General",
        agent_id=req.agent_id or (agent.id if agent else None),
    )
    call_service.add_transcript(db, call.id, "system", f"Call started — {call.department}")
    db.refresh(call)
    return _serialize_call(call)


@router.post("/{call_id}/end")
def end_call(call_id: int, db: Session = Depends(get_db)):
    call = call_service.end_call(db, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    call_service.add_transcript(db, call.id, "system", "Call ended")
    db.refresh(call)
    return _serialize_call(call)


@router.get("/active")
def active_calls(db: Session = Depends(get_db)):
    return [_serialize_call(c) for c in call_service.get_active_calls(db)]


@router.get("/history")
def call_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return [_serialize_call(c) for c in call_service.get_call_history(db, page=page, limit=limit)]


@router.post("/{call_id}/transfer")
def transfer_call(call_id: int, req: TransferRequest, db: Session = Depends(get_db)):
    call = call_service.get_call_by_id(db, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    route = call_service.transfer_call(
        db,
        call_id=call_id,
        to_department=req.to_department,
        to_agent_id=req.to_agent_id,
        action_type=req.action_type,
    )
    if not route:
        raise HTTPException(status_code=400, detail="Transfer failed")
    call_service.add_transcript(db, call_id, "system", f"Call transferred to {req.to_department or 'Agent'}")
    db.refresh(call)
    return _serialize_call(call)


@router.post("/{call_id}/transcript")
def add_transcript(call_id: int, req: TranscriptCreate, db: Session = Depends(get_db)):
    entry = call_service.add_transcript(db, call_id, req.speaker, req.text)
    if not entry:
        raise HTTPException(status_code=404, detail="Call not found")
    return {"id": entry.id, "call_id": entry.call_id, "speaker": entry.speaker,
            "text": entry.text, "created_at": entry.created_at.isoformat()}


@router.get("/{call_id}/transcripts")
def get_transcripts(call_id: int, db: Session = Depends(get_db)):
    entries = call_service.get_transcripts(db, call_id)
    return [{"id": e.id, "call_id": e.call_id, "speaker": e.speaker,
             "text": e.text, "created_at": e.created_at.isoformat()} for e in entries]


@router.delete("/{call_id}")
def delete_call(call_id: int, db: Session = Depends(get_db)):
    deleted = call_service.delete_call(db, call_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Call not found")
    return {"deleted": True, "call_id": call_id}


@router.patch("/{call_id}/recording")
def set_recording_path(call_id: int, req: RecordingUpdate, db: Session = Depends(get_db)):
    call = call_service.get_call_by_id(db, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    call.recording_path = req.recording_path
    db.commit()
    return {"ok": True, "recording_path": req.recording_path}


@router.get("/{call_id}/recording")
def get_recording(call_id: int, db: Session = Depends(get_db)):
    call = call_service.get_call_by_id(db, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    if not call.recording_path:
        raise HTTPException(status_code=404, detail="No recording for this call")
    path = RECORDINGS_DIR / call.recording_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="Recording file not found")
    return FileResponse(str(path), media_type="audio/wav")
