# ======================== Analytics Router ========================
# Analytics Router -> Handles user-scoped analytics endpoints for call summaries, charts, outcomes, and reports.
# ||
# ||
# ||
# Functions/Methods -> get_date_filter()        -> Resolve datetime lower bound from period string
# ||                 |
# ||                 | get_analytics_calls()    -> Full analytics payload: summary, chart, outcomes,
# ||                 |                            duration dist, cost breakdown, raw calls
# ||                 | get_analytics_reports()  -> Lightweight report payload: KPIs + daily chart
# ||                 |
# ||                 |---> Logic Flow -> Request lifecycle:
# ||                                  |
# ||                                  |--- All routes -> Depend on require_user -> Reject unauthenticated
# ||                                  |--- All routes -> Accept period query param -> Pass to get_date_filter()
# ||                                  |
# ||                                  |--- get_date_filter()
# ||                                  |    ├── "today"      -> Midnight of current day
# ||                                  |    ├── "last_month" -> now - 30 days
# ||                                  |    └── default      -> now - 7 days
# ||                                  |
# ||                                  |--- get_analytics_calls()
# ||                                  |    ├── Query -> Aggregate summary (total, cost, avg duration, issues)
# ||                                  |    ├── Query -> Daily call volume chart (grouped by DATE)
# ||                                  |    ├── Query -> Outcome breakdown (completed, voicemail, failed, unknown)
# ||                                  |    ├── Query -> Duration distribution (<2min, 2-5min, >5min)
# ||                                  |    ├── Compute -> Cost breakdown (60% AI, 25% telephony, 15% other)
# ||                                  |    ├── Query -> Raw call list ordered newest first
# ||                                  |    └── Return -> Combined analytics payload dict
# ||                                  |
# ||                                  |--- get_analytics_reports()
# ||                                  |    ├── Query -> Aggregate KPIs + completed count
# ||                                  |    ├── Compute -> success_rate = completed / total * 100
# ||                                  |    ├── Query -> Daily call volume chart (grouped by DATE)
# ||                                  |    └── Return -> Lightweight report payload dict
# ||
# ======================================================================

# ---------------------------------------------------------------
# SECTION: IMPORTS
# ---------------------------------------------------------------
import psycopg2.extras
from fastapi import APIRouter, Depends, Query
from deps import require_user
from models.db import get_db
from datetime import datetime, timedelta

# ---------------------------------------------------------------
# SECTION: ROUTER INIT
# ---------------------------------------------------------------
router = APIRouter()


# ---------------------------------------------------------------
# SECTION: HELPERS
# ---------------------------------------------------------------

# get_date_filter -> Resolves a datetime lower bound from a period string
# period -> "today" | "last_month" | default (last 7 days)
# Returns -> datetime object used as WHERE created_at >= threshold
def get_date_filter(period: str):
    now = datetime.now()

    # today -> Midnight of current day (00:00:00)
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)

    # last_month -> 30 days ago from now
    elif period == "last_month":
        return now - timedelta(days=30)

    # default -> 7 days ago from now
    else:
        return now - timedelta(days=7)


# ---------------------------------------------------------------
# SECTION: ROUTE HANDLERS
# ---------------------------------------------------------------

# get_analytics_calls -> Returns full analytics payload scoped to authenticated user
# Includes -> summary, daily chart, outcomes, duration dist, cost breakdown, raw calls
@router.get("/analytics/calls")
def get_analytics_calls(
    period: str = Query(default="last_week"),
    user=Depends(require_user),
):
    # Resolve -> Date threshold from period param
    since  = get_date_filter(period)
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Query -> Aggregate summary stats for the period
    cursor.execute("""
        SELECT
            COUNT(*)                              AS total_calls,
            COALESCE(SUM(cost), 0)                AS total_cost,
            COALESCE(AVG(duration_seconds), 0)    AS avg_duration_seconds,
            COALESCE(SUM(CAST(issues AS INTEGER)), 0) AS total_issues
        FROM call_logs
        WHERE user_id = %s AND created_at >= %s
    """, (user["id"], since))
    summary_row = cursor.fetchone()

    # Build -> Summary dict with explicit float casting and zeroed transfers
    summary = {
        "total_calls":          summary_row["total_calls"],
        "total_cost":           float(summary_row["total_cost"]),
        "avg_duration_seconds": float(summary_row["avg_duration_seconds"]),
        "total_transfers":      0,         # Not yet tracked in schema
        "total_issues":         summary_row["total_issues"],
    }

    # Query -> Daily call volume grouped by DATE -> ASC for chart rendering
    cursor.execute("""
        SELECT DATE(created_at) as day, COUNT(*) as calls
        FROM call_logs
        WHERE user_id = %s AND created_at >= %s
        GROUP BY DATE(created_at)
        ORDER BY day ASC
    """, (user["id"], since))
    chart_rows = cursor.fetchall()

    # Format -> Dates as "Mon DD" strings for frontend chart labels
    chart = [
        {"date": row["day"].strftime("%b %d"), "calls": row["calls"]}
        for row in chart_rows
    ]

    # Query -> COUNT calls grouped by status for outcome breakdown
    cursor.execute("""
        SELECT status, COUNT(*) as count
        FROM call_logs
        WHERE user_id = %s AND created_at >= %s
        GROUP BY status
    """, (user["id"], since))
    outcome_rows = cursor.fetchall()

    # Map -> Status counts into fixed outcome keys, default all to 0
    outcomes = {"completed": 0, "voicemail": 0, "failed": 0, "unknown": 0}
    for row in outcome_rows:
        s = row["status"] or "unknown"
        if s in outcomes:
            outcomes[s] = row["count"]

    # Query -> Duration distribution across 3 bands (<2min, 2-5min, >5min)
    cursor.execute("""
        SELECT
            SUM(CASE WHEN duration_seconds < 120 THEN 1 ELSE 0 END)                    AS under_2min,
            SUM(CASE WHEN duration_seconds BETWEEN 120 AND 300 THEN 1 ELSE 0 END)      AS two_to_5min,
            SUM(CASE WHEN duration_seconds > 300 THEN 1 ELSE 0 END)                    AS over_5min
        FROM call_logs
        WHERE user_id = %s AND created_at >= %s
    """, (user["id"], since))
    dur = cursor.fetchone()

    # Build -> Duration dist dict with NULL fallback to 0
    duration_dist = {
        "under_2min":  dur["under_2min"]  or 0,
        "two_to_5min": dur["two_to_5min"] or 0,
        "over_5min":   dur["over_5min"]   or 0,
    }

    # Compute -> Cost breakdown as fixed ratios of total cost (no DB query needed)
    total_cost = summary["total_cost"]
    cost_breakdown = {
        "ai_usage":  round(total_cost * 0.60, 4),   # 60% attributed to AI usage
        "telephony": round(total_cost * 0.25, 4),   # 25% attributed to telephony
        "other":     round(total_cost * 0.15, 4),   # 15% attributed to other costs
    }

    # Query -> Full raw call list ordered newest first for call log table
    cursor.execute("""
        SELECT id, call_id, direction, to_number, from_number,
               duration_seconds, cost, status, pathway, issues, created_at
        FROM call_logs
        WHERE user_id = %s AND created_at >= %s
        ORDER BY created_at DESC
    """, (user["id"], since))
    calls = cursor.fetchall()

    # Serialize -> Convert datetime + Decimal fields for JSON compatibility
    for call in calls:
        if call.get("created_at"):
            call["created_at"] = str(call["created_at"])
        call["cost"] = float(call["cost"] or 0)

    cursor.close()
    conn.close()

    # Return -> Full analytics payload for frontend consumption
    return {
        "summary":        summary,
        "chart":          chart,
        "outcomes":       outcomes,
        "duration_dist":  duration_dist,
        "cost_breakdown": cost_breakdown,
        "calls":          calls,
    }


# get_analytics_reports -> Returns lightweight report KPIs + daily chart for the period
# Includes -> total calls, cost, avg duration, success rate, issues, chart
@router.get("/analytics/reports")
def get_analytics_reports(
    period: str = Query(default="last_week"),
    user=Depends(require_user),
):
    # Resolve -> Date threshold from period param
    since  = get_date_filter(period)
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Query -> Aggregate KPIs including completed count for success rate
    cursor.execute("""
        SELECT
            COUNT(*)                                                        AS total_calls,
            COALESCE(SUM(cost), 0)                                          AS total_cost,
            COALESCE(AVG(duration_seconds), 0)                              AS avg_duration_seconds,
            COALESCE(SUM(CAST(issues AS INTEGER)), 0)                       AS issues,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)           AS completed
        FROM call_logs
        WHERE user_id = %s AND created_at >= %s
    """, (user["id"], since))
    row = cursor.fetchone()

    total = row["total_calls"]

    # Compute -> Success rate as percentage of completed calls, guard divide-by-zero
    success_rate = round((row["completed"] / total * 100), 1) if total > 0 else 0.0

    # Query -> Daily call volume grouped by DATE -> ASC for chart rendering
    cursor.execute("""
        SELECT DATE(created_at) as day, COUNT(*) as calls
        FROM call_logs
        WHERE user_id = %s AND created_at >= %s
        GROUP BY DATE(created_at) ORDER BY day ASC
    """, (user["id"], since))
    chart_rows = cursor.fetchall()

    # Format -> Dates as "Mon DD" strings for frontend chart labels
    chart = [
        {"date": r["day"].strftime("%b %d"), "calls": r["calls"]}
        for r in chart_rows
    ]

    cursor.close()
    conn.close()

    # Return -> Lightweight report payload for reports page
    return {
        "total_calls":          total,
        "total_cost":           float(row["total_cost"]),
        "avg_duration_seconds": float(row["avg_duration_seconds"]),
        "success_rate":         success_rate,
        "issues":               row["issues"],
        "chart":                chart,
    }