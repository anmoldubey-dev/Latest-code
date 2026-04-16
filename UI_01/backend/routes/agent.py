# ======================== Agent Router ========================
# Agent Router -> Handles all agent-scoped API endpoints for profile, CSAT, call logs, call stats, and IVR status.
# ||
# ||
# ||
# Functions/Methods -> date_filter_clause() -> Build dynamic date WHERE clauses from optional query params
# ||                 |
# ||                 | get_agent_profile()    -> Fetch full profile of the authenticated agent
# ||                 | get_agent_csat()       -> Calculate CSAT score from positive sentiment ratio
# ||                 | get_agent_calls()      -> Fetch paginated + filtered call logs for agent
# ||                 | get_agent_call_stats() -> Aggregate KPIs, breakdowns, heatmap, sankey for agent
# ||                 | get_ivr_status()       -> Fetch top 6 IVR pathway nodes from last 24 hours
# ||                 |
# ||                 |---> Logic Flow -> Request lifecycle:
# ||                                  |
# ||                                  |--- All routes -> Depend on get_current_user -> Reject unauthenticated
# ||                                  |--- All routes -> Resolve agent_id from current_user["id"] via agents table
# ||                                  |--- IF agent not found -> Return 404 or empty response
# ||                                  |
# ||                                  |--- date_filter_clause()
# ||                                  |    ├── IF date_from -> Append >= clause
# ||                                  |    ├── IF date_to   -> Append <= clause (+ 23:59:59)
# ||                                  |    └── Return combined WHERE fragment + params list
# ||                                  |
# ||                                  |--- get_agent_profile()
# ||                                  |    ├── JOIN agents + users on user_id
# ||                                  |    ├── SELECT all profile fields with camelCase aliases
# ||                                  |    └── IF not found -> Raise 404
# ||                                  |
# ||                                  |--- get_agent_csat()
# ||                                  |    ├── Resolve agent_id
# ||                                  |    ├── Apply date + channel filters
# ||                                  |    └── ROUND( SUM(Positive) * 100 / COUNT ) AS csat
# ||                                  |
# ||                                  |--- get_agent_calls()
# ||                                  |    ├── Resolve agent_id
# ||                                  |    ├── Apply date, channel, category, status filters dynamically
# ||                                  |    └── SELECT call fields -> ORDER BY created_at DESC -> LIMIT + OFFSET
# ||                                  |
# ||                                  |--- get_agent_call_stats()
# ||                                  |    ├── Resolve agent_id
# ||                                  |    ├── Apply date + channel filters
# ||                                  |    ├── Query statusBreakdown, categoryBreakdown, sentimentBreakdown
# ||                                  |    ├── Query dailyVolume (14 days), hourlyHeatmap, sankeyRaw
# ||                                  |    ├── Query aggregate KPIs (total, resolved, escalated, cost, etc.)
# ||                                  |    └── Return combined stats dict
# ||                                  |
# ||                                  |--- get_ivr_status()
# ||                                  |    ├── Resolve agent_id
# ||                                  |    └── GROUP BY pathway -> last 24 hours -> TOP 6 by hits
# ||
# ======================================================================

# ---------------------------------------------------------------
# SECTION: IMPORTS
# ---------------------------------------------------------------
import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException, Query
from deps import get_current_user
from models.db import get_db
from typing import Optional

# ---------------------------------------------------------------
# SECTION: ROUTER INIT
# ---------------------------------------------------------------
router = APIRouter(prefix="/api/agent", tags=["agent"])


# ---------------------------------------------------------------
# SECTION: HELPERS
# ---------------------------------------------------------------

# date_filter_clause -> Builds dynamic SQL WHERE fragment from optional date range params
# alias -> Table alias to prefix created_at column (default "cl")
# Returns -> (sql_fragment string, params list) to be appended to queries
def date_filter_clause(date_from: Optional[str], date_to: Optional[str], alias: str = "cl") -> tuple[str, list]:
    clauses, params = [], []

    # date_from -> Add lower bound filter if provided
    if date_from:
        clauses.append(f"{alias}.created_at >= %s")
        params.append(date_from)

    # date_to -> Add upper bound filter with end-of-day time if provided
    if date_to:
        clauses.append(f"{alias}.created_at <= %s")
        params.append(date_to + " 23:59:59")

    return (" AND " + " AND ".join(clauses)) if clauses else "", params


# ---------------------------------------------------------------
# SECTION: ROUTE HANDLERS
# ---------------------------------------------------------------

# get_agent_profile -> Returns full agent profile joined with user email and phone
# Scoped -> current_user["id"] matched against agents.user_id
@router.get("/profile")
def get_agent_profile(current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # JOIN -> agents + users -> SELECT all profile fields with camelCase aliases
    cursor.execute("""
        SELECT
            a.id, a.name, a.model_variant AS "modelVariant",
            a.skill_level AS "skillLevel", a.risk_level AS "riskLevel",
            a.calls_handled AS "callsHandled", a.resolved_count AS "resolvedCount",
            a.escalated_count AS "escalations", a.transferred_count AS "transferredCount",
            a.callback_count AS "callbackCount", a.csat_score AS "csat",
            a.avg_latency_ms AS "avgLatencyMs", a.workload_percent AS "workload",
            a.is_active AS "isActive",
            u.email, u.phone_number AS "phone"
        FROM agents a
        JOIN users u ON a.user_id = u.id
        WHERE a.user_id = %s
        LIMIT 1
    """, (current_user["id"],))
    agent = cursor.fetchone()
    cursor.close()
    db.close()

    # Guard -> Return empty profile if no agent row (superuser/admin users etc.)
    if not agent:
        return {
            "id": None, "name": current_user.get("name", ""),
            "email": current_user.get("email", ""), "phone": None,
            "modelVariant": None, "skillLevel": None, "riskLevel": None,
            "callsHandled": 0, "resolvedCount": 0, "escalations": 0,
            "transferredCount": 0, "callbackCount": 0, "csat": None,
            "avgLatencyMs": None, "workload": None, "isActive": False,
        }
    return dict(agent)


# get_agent_csat -> Calculates CSAT as percentage of Positive sentiment calls
# Filters -> date range + optional channel (mapped to category column)
@router.get("/csat")
def get_agent_csat(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    cursor = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Resolve -> Get agent_id from authenticated user
    cursor.execute("SELECT id FROM agents WHERE user_id = %s LIMIT 1", (current_user["id"],))
    row = cursor.fetchone()

    # Guard -> Return zero CSAT if agent record not found
    if not row:
        cursor.close(); db.close()
        return {"csat": 0, "totalCalls": 0}

    agent_id = row["id"]

    # Filters -> Build date clause + optional channel filter
    extra, params = date_filter_clause(date_from, date_to)
    channel_clause = " AND cl.category = %s" if channel else ""
    if channel:
        params.append(channel)

    # CSAT -> SUM(Positive) * 100 / COUNT(*) rounded to 1 decimal
    cursor.execute(f"""
        SELECT
            ROUND(
                SUM(CASE WHEN sentiment = 'Positive' THEN 1 ELSE 0 END) * 100.0
                / NULLIF(COUNT(*), 0)
            , 1) AS csat,
            COUNT(*) AS "totalCalls"
        FROM call_logs cl
        WHERE cl.agent_id = %s {extra} {channel_clause}
    """, [agent_id] + params)

    result = cursor.fetchone()
    cursor.close(); db.close()
    return dict(result) if result else {"csat": 0, "totalCalls": 0}


# get_agent_calls -> Returns paginated call logs for agent with full field set
# Filters -> date, channel, category, status (all optional, dynamically appended)
@router.get("/calls")
def get_agent_calls(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    cursor = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Resolve -> Get agent_id from authenticated user
    cursor.execute("SELECT id FROM agents WHERE user_id = %s LIMIT 1", (current_user["id"],))
    row = cursor.fetchone()

    # Guard -> Return empty list if agent not found
    if not row:
        cursor.close(); db.close()
        return []
    agent_id = row["id"]

    # Filters -> Dynamically append each active filter to WHERE clause
    extra, params = date_filter_clause(date_from, date_to)
    if channel:
        extra += " AND cl.category = %s"; params.append(channel)
    if category:
        extra += " AND cl.category = %s"; params.append(category)
    if status:
        extra += " AND cl.status = %s"; params.append(status)

    # Query -> Full call log fields with camelCase aliases -> ORDER BY newest -> paginated
    cursor.execute(f"""
        SELECT
            cl.id, cl.call_id AS "callId", cl.direction,
            cl.to_number AS "toNumber", cl.from_number AS "fromNumber",
            cl.duration_seconds AS "duration", cl.cost,
            cl.status, cl.category, cl.sentiment,
            cl.issue_summary AS "issueSummary",
            cl.caller_name AS "callerName", cl.caller_number AS "callerNumber",
            cl.pathway, cl.issues, cl.area_code AS "areaCode",
            cl.created_at AS "createdAt"
        FROM call_logs cl
        WHERE cl.agent_id = %s {extra}
        ORDER BY cl.created_at DESC
        LIMIT %s OFFSET %s
    """, [agent_id] + params + [limit, offset])

    calls = cursor.fetchall()
    cursor.close(); db.close()
    return [dict(c) for c in calls]


# get_agent_call_stats -> Returns full analytics payload: KPIs, breakdowns, heatmap, sankey
# Filters -> date range + optional channel
@router.get("/call-stats")
def get_agent_call_stats(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    cursor = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Resolve -> Get agent_id from authenticated user
    cursor.execute("SELECT id FROM agents WHERE user_id = %s LIMIT 1", (current_user["id"],))
    row = cursor.fetchone()

    # Guard -> Return zeroed-out stats shape if agent not found
    if not row:
        cursor.close(); db.close()
        return {
            "kpis": {"total": 0, "resolved": 0, "escalated": 0, "transferred": 0,
                     "avgDuration": 0, "totalCost": 0, "positiveCalls": 0},
            "statusBreakdown": [], "categoryBreakdown": [], "sentimentBreakdown": [],
            "dailyVolume": [], "hourlyHeatmap": [], "sankeyRaw": [],
        }
    agent_id = row["id"]

    # Filters -> Build date + channel WHERE fragment
    extra, params = date_filter_clause(date_from, date_to)
    if channel:
        extra += " AND category = %s"; params.append(channel)

    # base -> Reusable param list starting with agent_id for all sub-queries
    base = [agent_id] + params

    # Query -> COUNT calls grouped by status
    cursor.execute(f"SELECT status, COUNT(*) AS cnt FROM call_logs WHERE agent_id = %s {extra} GROUP BY status", base)
    status_breakdown = [dict(r) for r in cursor.fetchall()]

    # Query -> COUNT calls grouped by category
    cursor.execute(f"SELECT category, COUNT(*) AS cnt FROM call_logs WHERE agent_id = %s {extra} GROUP BY category", base)
    category_breakdown = [dict(r) for r in cursor.fetchall()]

    # Query -> COUNT calls grouped by sentiment
    cursor.execute(f"SELECT sentiment, COUNT(*) AS cnt FROM call_logs WHERE agent_id = %s {extra} GROUP BY sentiment", base)
    sentiment_breakdown = [dict(r) for r in cursor.fetchall()]

    # Query -> Daily call volume + avg duration -> last 14 days -> ASC order
    cursor.execute(f"""
        SELECT DATE(created_at) AS day, COUNT(*) AS calls,
               AVG(duration_seconds) AS "avgDuration"
        FROM call_logs
        WHERE agent_id = %s {extra}
        GROUP BY DATE(created_at)
        ORDER BY day ASC
        LIMIT 14
    """, base)
    daily_volume = [dict(r) for r in cursor.fetchall()]

    # Query -> Hourly call distribution for heatmap rendering
    cursor.execute(f"""
        SELECT EXTRACT(HOUR FROM created_at) AS hour, COUNT(*) AS calls
        FROM call_logs WHERE agent_id = %s {extra}
        GROUP BY EXTRACT(HOUR FROM created_at)
    """, base)
    hourly = [dict(r) for r in cursor.fetchall()]

    # Query -> Pathway + status pairs for Sankey chart -> NULL pathways excluded
    cursor.execute(f"""
        SELECT pathway, status, COUNT(*) AS cnt
        FROM call_logs WHERE agent_id = %s {extra} AND pathway IS NOT NULL
        GROUP BY pathway, status
    """, base)
    sankey_raw = [dict(r) for r in cursor.fetchall()]

    # Query -> Aggregate KPIs: totals, averages, cost, positive call count
    cursor.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) AS escalated,
            SUM(CASE WHEN status = 'voicemail' THEN 1 ELSE 0 END) AS transferred,
            AVG(duration_seconds) AS "avgDuration",
            SUM(cost) AS "totalCost",
            SUM(CASE WHEN sentiment = 'Positive' THEN 1 ELSE 0 END) AS "positiveCalls"
        FROM call_logs WHERE agent_id = %s {extra}
    """, base)
    kpis = dict(cursor.fetchone())

    cursor.close(); db.close()

    # Return -> Combined stats payload for agent dashboard consumption
    return {
        "kpis":               kpis,
        "statusBreakdown":    status_breakdown,
        "categoryBreakdown":  category_breakdown,
        "sentimentBreakdown": sentiment_breakdown,
        "dailyVolume":        daily_volume,
        "hourlyHeatmap":      hourly,
        "sankeyRaw":          sankey_raw,
    }


# get_ivr_status -> Returns top 6 IVR pathway nodes hit in the last 24 hours for the agent
@router.get("/ivr-status")
def get_ivr_status(current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Resolve -> Get agent_id from authenticated user
    cursor.execute("SELECT id FROM agents WHERE user_id = %s LIMIT 1", (current_user["id"],))
    row = cursor.fetchone()

    # Guard -> Return empty nodes list if agent not found
    if not row:
        cursor.close(); db.close()
        return {"nodes": []}
    agent_id = row["id"]

    # Query -> GROUP BY pathway -> last 24 hours -> ORDER BY hits DESC -> TOP 6
    cursor.execute("""
        SELECT pathway AS node, COUNT(*) AS hits
        FROM call_logs
        WHERE agent_id = %s AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY pathway ORDER BY hits DESC LIMIT 6
    """, (agent_id,))
    nodes = [dict(r) for r in cursor.fetchall()]
    cursor.close(); db.close()
    return {"nodes": nodes}