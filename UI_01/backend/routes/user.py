# ======================== User Router ========================
# User Router -> Handles user-scoped call log retrieval with optional status filtering.
# ||
# ||
# ||
# Functions/Methods -> get_call_logs() -> Fetch call logs for authenticated user with optional status filter
# ||                 |
# ||                 |---> Logic Flow -> Request lifecycle:
# ||                                  |
# ||                                  |--- Route -> Depends on require_user -> Reject unauthenticated
# ||                                  |--- Accept -> status query param (default "all")
# ||                                  |
# ||                                  |--- get_call_logs()
# ||                                  |    ├── IF status != "all" -> WHERE user_id + status
# ||                                  |    ├── ELSE              -> WHERE user_id only
# ||                                  |    ├── Serialize -> Convert datetime created_at to string
# ||                                  |    ├── Serialize -> Cast cost to float (NULL safe)
# ||                                  |    └── Return -> { calls: [...] }
# ||
# ======================================================================

# ---------------------------------------------------------------
# SECTION: IMPORTS
# ---------------------------------------------------------------
import psycopg2.extras
from fastapi import APIRouter, Depends, Query
from deps import require_user
from models.db import get_db

# ---------------------------------------------------------------
# SECTION: ROUTER INIT
# ---------------------------------------------------------------
router = APIRouter()


# ---------------------------------------------------------------
# SECTION: ROUTE HANDLERS
# ---------------------------------------------------------------

# get_call_logs -> Returns call logs for the authenticated user
# status -> Query param filter: "all" returns everything, any other value filters by exact status match
@router.get("/call-logs")
def get_call_logs(
    status: str = Query(default="all"),
    user=Depends(require_user),
):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Branch -> Apply status filter if not "all", otherwise fetch all user call logs
    if status != "all":
        # Filtered -> WHERE user_id + status match
        cursor.execute("""
            SELECT id, call_id, direction, to_number AS phone_number,
                   from_number, duration_seconds AS duration,
                   cost, status, pathway, created_at
            FROM call_logs
            WHERE user_id = %s AND status = %s
            ORDER BY created_at DESC
        """, (user["id"], status))
    else:
        # Unfiltered -> WHERE user_id only -> Return all statuses
        cursor.execute("""
            SELECT id, call_id, direction, to_number AS phone_number,
                   from_number, duration_seconds AS duration,
                   cost, status, pathway, created_at
            FROM call_logs
            WHERE user_id = %s
            ORDER BY created_at DESC
        """, (user["id"],))

    calls = cursor.fetchall()

    # Serialize -> Convert datetime created_at to string for JSON compatibility
    # Serialize -> Cast cost to float with NULL fallback to 0
    for call in calls:
        if call.get("created_at"):
            call["created_at"] = str(call["created_at"])
        call["cost"] = float(call["cost"] or 0)

    cursor.close()
    conn.close()
    return {"calls": calls}