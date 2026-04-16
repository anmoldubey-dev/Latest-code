# ======================== Home Router ========================
# Home Router -> Handles user-scoped home page endpoints for call stats summary and recent activity feed.
# ||
# ||
# ||
# Functions/Methods -> get_home_stats()       -> Fetch 7-day call count, avg per day, active regions
# ||                 | get_recent_activity()  -> Fetch latest N call log entries for activity feed
# ||                 |
# ||                 |---> Logic Flow -> Request lifecycle:
# ||                                  |
# ||                                  |--- All routes -> Depend on require_user -> Reject unauthenticated
# ||                                  |
# ||                                  |--- get_home_stats()
# ||                                  |    ├── Query -> COUNT call_logs WHERE created_at >= NOW() - 7 days
# ||                                  |    ├── Compute -> avg_per_day = total_calls_7d / 7 (rounded)
# ||                                  |    ├── Query -> COUNT DISTINCT area_code (non-null)
# ||                                  |    └── Return -> total_calls_7d, avg_per_day, active_regions
# ||                                  |
# ||                                  |--- get_recent_activity()
# ||                                  |    ├── Accept -> limit query param (default 5, max 20)
# ||                                  |    ├── Query -> call_logs ORDER BY created_at DESC -> LIMIT
# ||                                  |    ├── Serialize -> Convert datetime created_at to string
# ||                                  |    └── Return -> List of recent call log entries
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

# get_home_stats -> Returns 7-day call summary stats scoped to authenticated user
# Includes -> total calls (7d), avg calls per day, count of distinct active regions
@router.get("/home/stats")
def get_home_stats(user=Depends(require_user)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Query -> COUNT calls in last 7 days for this user
    cursor.execute("""
        SELECT COUNT(*) as total
        FROM call_logs
        WHERE user_id = %s
          AND created_at >= NOW() - INTERVAL '7 days'
    """, (user["id"],))
    total_calls_7d = cursor.fetchone()["total"]

    # Compute -> Average calls per day over the 7-day window (rounded to 1 decimal)
    avg_per_day = round(total_calls_7d / 7, 1)

    # Query -> COUNT distinct non-null area codes as active regions
    cursor.execute("""
        SELECT COUNT(DISTINCT area_code) as regions
        FROM call_logs
        WHERE user_id = %s AND area_code IS NOT NULL
    """, (user["id"],))
    active_regions = cursor.fetchone()["regions"]

    cursor.close()
    conn.close()

    # Return -> Home stats payload for dashboard KPI cards
    return {
        "total_calls_7d": total_calls_7d,
        "avg_per_day":    avg_per_day,
        "active_regions": active_regions,
    }


# get_recent_activity -> Returns latest N call log entries for the authenticated user
# limit -> Query param, default 5, capped at 20 to prevent large payloads
@router.get("/home/recent-activity")
def get_recent_activity(
    limit: int = Query(default=5, le=20),
    user=Depends(require_user),
):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Query -> Recent calls ordered newest first -> LIMIT by param
    cursor.execute("""
        SELECT id, call_id, direction, to_number, from_number,
               duration_seconds, status, pathway, created_at
        FROM call_logs
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT %s
    """, (user["id"], limit))
    activity = cursor.fetchall()

    # Serialize -> Convert datetime created_at to string for JSON compatibility
    for item in activity:
        if item.get("created_at"):
            item["created_at"] = str(item["created_at"])

    cursor.close()
    conn.close()
    return activity