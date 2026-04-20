# ======================== Superuser Router ========================
# Superuser Router -> Handles all superuser-scoped endpoints for agent CRUD, sankey data,
#                    call stats, category filtering, and platform KPI summary.
# ||
# ||
# ||
# Functions/Methods -> get_agents()             -> Fetch all agents scoped to superuser
# ||                 | add_agent()              -> Insert new agent under superuser
# ||                 | get_agent_detail()       -> Fetch single agent + call logs + graph data
# ||                 | update_agent()           -> Update agent fields by agent_id
# ||                 | delete_agent()           -> Delete agent by agent_id
# ||                 | get_sankey()             -> Build nodes + links payload for Sankey chart
# ||                 | get_call_stats()         -> Fetch call counts grouped by category
# ||                 | get_calls_by_category()  -> Fetch call logs filtered by category
# ||                 | get_stats()              -> Fetch platform KPIs (traffic, CSAT, latency, escalation)
# ||                 |
# ||                 |---> Logic Flow -> Request lifecycle:
# ||                                  |
# ||                                  |--- All routes -> Depend on require_superuser -> Reject non-superusers
# ||                                  |--- All queries -> Scoped to superuser_id = user["id"]
# ||                                  |
# ||                                  |--- get_agents()
# ||                                  |    └── SELECT agents WHERE superuser_id -> camelCase aliases
# ||                                  |
# ||                                  |--- add_agent()
# ||                                  |    └── INSERT agents -> RETURNING id -> Commit -> Return id
# ||                                  |
# ||                                  |--- get_agent_detail()
# ||                                  |    ├── SELECT agent WHERE id + superuser_id
# ||                                  |    ├── IF not found -> Raise 404
# ||                                  |    ├── SELECT call_logs for agent -> Serialize created_at
# ||                                  |    ├── SELECT category counts for graph
# ||                                  |    └── Return -> agent, callLogs, graphData
# ||                                  |
# ||                                  |--- update_agent()
# ||                                  |    └── UPDATE agents SET all fields WHERE id + superuser_id
# ||                                  |
# ||                                  |--- delete_agent()
# ||                                  |    └── DELETE agents WHERE id + superuser_id -> Commit
# ||                                  |
# ||                                  |--- get_sankey()
# ||                                  |    ├── Query -> category + status counts via JOIN agents
# ||                                  |    ├── Build -> nodes list (All Calls + unique categories + statuses)
# ||                                  |    ├── Build -> node_index map (name -> id)
# ||                                  |    ├── Compute -> cat_totals for source links
# ||                                  |    ├── Build -> links (All Calls -> category, category -> status)
# ||                                  |    └── Return -> { nodes, links }
# ||                                  |
# ||                                  |--- get_call_stats()
# ||                                  |    └── COUNT call_logs grouped by category via JOIN agents
# ||                                  |
# ||                                  |--- get_calls_by_category()
# ||                                  |    └── SELECT calls WHERE category + superuser_id -> Serialize created_at
# ||                                  |
# ||                                  |--- get_stats()
# ||                                  |    ├── Query -> COUNT total calls via JOIN agents
# ||                                  |    ├── Query -> AVG csat_score across team agents
# ||                                  |    ├── Query -> AVG avg_latency_ms across team agents
# ||                                  |    ├── Query -> escalation_rate = SUM(escalated) / SUM(handled) * 100
# ||                                  |    └── Return -> KPI payload with hardcoded placeholders
# ||
# ======================================================================

# ---------------------------------------------------------------
# SECTION: IMPORTS
# ---------------------------------------------------------------
import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from deps import require_superuser
from models.db import get_db

# ---------------------------------------------------------------
# SECTION: ROUTER INIT
# ---------------------------------------------------------------
router = APIRouter()


# ---------------------------------------------------------------
# SECTION: REQUEST MODELS
# ---------------------------------------------------------------

# AgentCreate -> Validates fields for creating a new agent
# risk_level -> Defaults to "Low" if not provided
class AgentCreate(BaseModel):
    name:             str
    model_variant:    Optional[str] = None
    skill_level:      Optional[str] = None
    risk_level:       Optional[str] = "Low"
    csat_score:       Optional[float] = None
    avg_latency_ms:   Optional[int] = None
    workload_percent: Optional[int] = None


# AgentUpdate -> Same shape as AgentCreate, used for PUT requests
class AgentUpdate(AgentCreate):
    pass


# ---------------------------------------------------------------
# SECTION: ROUTE HANDLERS
# ---------------------------------------------------------------

# get_agents -> Returns all agents belonging to the authenticated superuser
# Scoped -> WHERE superuser_id = user["id"]
@router.get("/agents")
def get_agents(user=Depends(require_superuser)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Query -> SELECT all team agents with camelCase aliases for frontend
    cursor.execute("""
    SELECT id, name,
           model_variant    AS "model",
           skill_level      AS "skillLevel",
           calls_handled    AS "callsHandled",
           escalated_count  AS "escalations",
           csat_score       AS "csat",
           avg_latency_ms   AS "avgLatency",
           workload_percent AS "workload",
           risk_level       AS "riskLevel",
           is_active        AS "isActive"
    FROM agents
    WHERE superuser_id = %s
""", (user["id"],))
    agents = cursor.fetchall()
    cursor.close()
    conn.close()
    return agents


# add_agent -> Inserts a new agent under the authenticated superuser -> Returns new id
@router.post("/agents", status_code=201)
def add_agent(body: AgentCreate, user=Depends(require_superuser)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Insert -> New agent with superuser_id ownership -> RETURNING id (PostgreSQL)
    cursor.execute("""
        INSERT INTO agents (name, model_variant, skill_level, risk_level, csat_score, avg_latency_ms, workload_percent, superuser_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (
        body.name, body.model_variant, body.skill_level,
        body.risk_level, body.csat_score, body.avg_latency_ms,
        body.workload_percent, user["id"],
    ))
    new_id = cursor.fetchone()["id"]
    conn.commit()
    cursor.close()
    conn.close()
    return {"id": new_id}


# get_agent_detail -> Returns agent profile + call logs + category graph data
# Guard -> 404 if agent not found or not owned by this superuser
@router.get("/agents/{agent_id}")
def get_agent_detail(agent_id: int, user=Depends(require_superuser)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Query -> Fetch agent with ownership check (id + superuser_id)
    cursor.execute("""
    SELECT id, name,
           model_variant    AS "model",
           skill_level      AS "skillLevel",
           calls_handled    AS "callsHandled",
           escalated_count  AS "escalations",
           csat_score       AS "csat",
           avg_latency_ms   AS "avgLatency",
           workload_percent AS "workload",
           risk_level       AS "riskLevel",
           is_active        AS "isActive"
    FROM agents WHERE id = %s AND superuser_id = %s
""", (agent_id, user["id"]))
    agent = cursor.fetchone()

    # Guard -> Raise 404 if agent not found or not owned by superuser
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Query -> Full call log history for this agent ordered newest first
    cursor.execute("""
        SELECT id, caller_name, caller_number, category, sentiment,
               status, duration_seconds, issue_summary, created_at
        FROM call_logs WHERE agent_id = %s ORDER BY created_at DESC
    """, (agent_id,))
    call_logs = cursor.fetchall()

    # Serialize -> Convert datetime created_at to string for JSON compatibility
    for log in call_logs:
        if log.get("created_at"):
            log["created_at"] = str(log["created_at"])

    # Query -> Category distribution for agent detail graph
    cursor.execute("""
        SELECT category, COUNT(*) as count
        FROM call_logs WHERE agent_id = %s GROUP BY category
    """, (agent_id,))
    graph_data = cursor.fetchall()

    cursor.close()
    conn.close()
    return {"agent": agent, "callLogs": call_logs, "graphData": graph_data}


# update_agent -> Updates all editable agent fields by agent_id + superuser ownership
@router.put("/agents/{agent_id}")
def update_agent(agent_id: int, body: AgentUpdate, user=Depends(require_superuser)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Update -> All AgentUpdate fields -> WHERE id + superuser_id for ownership safety
    cursor.execute("""
        UPDATE agents SET name=%s, model_variant=%s, skill_level=%s,
        risk_level=%s, csat_score=%s, avg_latency_ms=%s, workload_percent=%s
        WHERE id=%s AND superuser_id=%s
    """, (
        body.name, body.model_variant, body.skill_level,
        body.risk_level, body.csat_score, body.avg_latency_ms,
        body.workload_percent, agent_id, user["id"],
    ))
    conn.commit()
    cursor.close()
    conn.close()
    return {"success": True}


# delete_agent -> Deletes agent by agent_id scoped to superuser ownership
@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: int, user=Depends(require_superuser)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Delete -> WHERE id + superuser_id prevents cross-team deletion
    cursor.execute("DELETE FROM agents WHERE id = %s AND superuser_id = %s", (agent_id, user["id"]))
    conn.commit()
    cursor.close()
    conn.close()
    return {"success": True}


# get_sankey -> Builds Sankey chart payload (nodes + links) from category→status call flow
# Flow -> All Calls -> category nodes -> status nodes
@router.get("/sankey")
def get_sankey(user=Depends(require_superuser)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Query -> COUNT calls grouped by category + status via JOIN to scope by superuser
    cursor.execute("""
        SELECT cl.category, cl.status, COUNT(*) as count
        FROM call_logs cl
        JOIN agents a ON cl.agent_id = a.id
        WHERE a.superuser_id = %s
        GROUP BY cl.category, cl.status
    """, (user["id"],))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    # Build -> Nodes list starting with root "All Calls" node
    nodes      = [{"name": "All Calls", "id": 0}]
    node_names = set()

    # Build -> Add unique category and status nodes with auto-incremented ids
    for row in rows:
        cat    = row["category"] or "Unknown"
        status = row["status"]   or "Unknown"
        if cat not in node_names:
            nodes.append({"name": cat, "id": len(nodes)})
            node_names.add(cat)
        if status not in node_names:
            nodes.append({"name": status, "id": len(nodes)})
            node_names.add(status)

    # Build -> node_index map for O(1) id lookup by name
    node_index = {n["name"]: n["id"] for n in nodes}

    # Compute -> Total calls per category for root → category link values
    cat_totals = {}
    for row in rows:
        cat = row["category"] or "Unknown"
        cat_totals[cat] = cat_totals.get(cat, 0) + row["count"]

    # Build -> Links: root → category, then category → status
    links = []
    for cat, total in cat_totals.items():
        links.append({"source": 0, "target": node_index[cat], "value": total})
    for row in rows:
        cat    = row["category"] or "Unknown"
        status = row["status"]   or "Unknown"
        links.append({
            "source": node_index[cat],
            "target": node_index[status],
            "value":  row["count"],
        })

    return {"nodes": nodes, "links": links}


# get_call_stats -> Returns call counts grouped by category for the superuser's team
@router.get("/call-stats")
def get_call_stats(user=Depends(require_superuser)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Query -> COUNT calls per category -> JOIN agents for superuser scoping
    cursor.execute("""
        SELECT cl.category, COUNT(*) as count
        FROM call_logs cl
        JOIN agents a ON cl.agent_id = a.id
        WHERE a.superuser_id = %s
        GROUP BY cl.category
    """, (user["id"],))
    stats = cursor.fetchall()
    cursor.close()
    conn.close()
    return stats


# get_calls_by_category -> Returns all calls for a given category scoped to superuser's team
# Includes -> agent name via LEFT JOIN, created_at serialized to string
@router.get("/calls/category/{category}")
def get_calls_by_category(category: str, user=Depends(require_superuser)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Query -> Calls filtered by category + superuser ownership -> newest first
    cursor.execute("""
        SELECT cl.id, cl.caller_name, cl.caller_number, cl.category,
               cl.sentiment, cl.status, cl.duration_seconds,
               cl.issue_summary, cl.created_at, a.name AS agent_name
        FROM call_logs cl
        LEFT JOIN agents a ON cl.agent_id = a.id
        WHERE cl.category = %s AND a.superuser_id = %s
        ORDER BY cl.created_at DESC
    """, (category, user["id"]))
    calls = cursor.fetchall()

    # Serialize -> Convert datetime created_at to string for JSON compatibility
    for call in calls:
        if call.get("created_at"):
            call["created_at"] = str(call["created_at"])

    cursor.close()
    conn.close()
    return calls


# get_stats -> Returns platform-wide KPI summary for the superuser's team
# Includes -> total traffic, avg CSAT, avg latency, escalation rate
# Note -> activeStreams, hardwareLoad, avgSentiment are hardcoded placeholders
@router.get("/stats")
def get_stats(user=Depends(require_superuser)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Query -> COUNT all calls across team agents
    cursor.execute("""
        SELECT COUNT(*) as total FROM call_logs cl
        JOIN agents a ON cl.agent_id = a.id
        WHERE a.superuser_id = %s
    """, (user["id"],))
    total_traffic = cursor.fetchone()["total"]

    # Query -> Average CSAT score across all team agents
    cursor.execute("SELECT AVG(csat_score) as avg_csat FROM agents WHERE superuser_id = %s", (user["id"],))
    avg_csat = cursor.fetchone()["avg_csat"] or 0

    # Query -> Average latency in ms across all team agents
    cursor.execute("SELECT AVG(avg_latency_ms) as avg_latency FROM agents WHERE superuser_id = %s", (user["id"],))
    avg_latency = cursor.fetchone()["avg_latency"] or 0

    # Query -> Escalation rate = SUM(escalated) / SUM(handled) * 100 -> NULLIF guards divide-by-zero
    cursor.execute("""
        SELECT ROUND((SUM(escalated_count) / NULLIF(SUM(calls_handled), 0)) * 100, 1) as rate
        FROM agents WHERE superuser_id = %s
    """, (user["id"],))
    escalation_rate = cursor.fetchone()["rate"] or 0

    cursor.close()
    conn.close()

    # Return -> KPI payload (activeStreams, hardwareLoad, avgSentiment are hardcoded placeholders)
    return {
        "totalTraffic":   total_traffic,
        "activeStreams":   0,
        "globalCsat":     round(float(avg_csat), 2),
        "avgLatency":     round(float(avg_latency)),
        "escalationRate": f"{escalation_rate}%",
        "hardwareLoad":   "38%",
        "avgSentiment":   "4.1",
    }