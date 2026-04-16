import mysql.connector
import psycopg2
import psycopg2.extras

MYSQL_CONFIG = {
    "host":     "localhost",
    "user":     "root",
    "password": "shaileydubey123",
    "database": "sr_comsoft_db",
}

NEON_URL = "postgresql://neondb_owner:npg_9VnTJojz2uOD@ep-rapid-king-am0fu5vg.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

def migrate():
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cur  = mysql_conn.cursor(dictionary=True)

    neon_conn = psycopg2.connect(NEON_URL)
    neon_conn.autocommit = True
    neon_cur  = neon_conn.cursor()

    print("migrating users...")
    mysql_cur.execute("SELECT id, name, email, password_hash, phone_number, is_active, role FROM users")
    users = mysql_cur.fetchall()
    for u in users:
        neon_cur.execute("""
            INSERT INTO users (id, name, email, password_hash, phone_number, is_active, role)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
        """, (u["id"], u["name"], u["email"], u["password_hash"], u["phone_number"], bool(u["is_active"]), u["role"]))
    print(f"  {len(users)} users migrated")

    print("migrating agents...")
    mysql_cur.execute("SELECT id, user_id, superuser_id, name, model_variant, skill_level, calls_handled, resolved_count, escalated_count, transferred_count, callback_count, csat_score, avg_latency_ms, hallucination_rate, workload_percent, risk_level, is_active FROM agents")
    agents = mysql_cur.fetchall()
    for a in agents:
        neon_cur.execute("""
            INSERT INTO agents (id, user_id, superuser_id, name, model_variant, skill_level, calls_handled, resolved_count, escalated_count, transferred_count, callback_count, csat_score, avg_latency_ms, hallucination_rate, workload_percent, risk_level, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
        """, (a["id"], a["user_id"], a["superuser_id"], a["name"], a["model_variant"], a["skill_level"], a["calls_handled"], a["resolved_count"], a["escalated_count"], a["transferred_count"], a["callback_count"], a["csat_score"], a["avg_latency_ms"], a["hallucination_rate"], a["workload_percent"], a["risk_level"], bool(a["is_active"])))
    print(f"  {len(agents)} agents migrated")

    print("migrating call_logs...")
    mysql_cur.execute("SELECT id, agent_id, user_id, call_id, direction, to_number, from_number, duration_seconds, cost, status, category, sentiment, issue_summary, caller_name, caller_number, pathway, issues, area_code, created_at FROM call_logs")
    calls = mysql_cur.fetchall()
    for c in calls:
        neon_cur.execute("""
            INSERT INTO call_logs (id, agent_id, user_id, call_id, direction, to_number, from_number, duration_seconds, cost, status, category, sentiment, issue_summary, caller_name, caller_number, pathway, issues, area_code, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
        """, (c["id"], c["agent_id"], c["user_id"], c["call_id"], c["direction"], c["to_number"], c["from_number"], c["duration_seconds"], c["cost"], c["status"], c["category"], c["sentiment"], c["issue_summary"], c["caller_name"], c["caller_number"], c["pathway"], c["issues"], c["area_code"], c["created_at"]))
    print(f"  {len(calls)} call_logs migrated")

    print("migrating system_settings...")
    mysql_cur.execute("SELECT user_id, latency_alert_threshold, hallucination_trigger_percent, primary_model, deployment_region FROM system_settings")
    settings = mysql_cur.fetchall()
    for s in settings:
        neon_cur.execute("INSERT INTO system_settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING", ("latency_alert_threshold", str(s["latency_alert_threshold"])))
        neon_cur.execute("INSERT INTO system_settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING", ("hallucination_trigger_percent", str(s["hallucination_trigger_percent"])))
        neon_cur.execute("INSERT INTO system_settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING", ("primary_model", str(s["primary_model"])))
        neon_cur.execute("INSERT INTO system_settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING", ("deployment_region", str(s["deployment_region"])))
    print(f"  {len(settings)} settings migrated")

    mysql_cur.close()
    mysql_conn.close()
    neon_cur.close()
    neon_conn.close()
    print("migration complete!")

if __name__ == "__main__":
    migrate()