# SR Comsoft AI — Frontend & Backend

> Full-stack AI voice calling SaaS platform with role-based dashboards, real-time polling, and Neon PostgreSQL.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Roles & Access](#roles--access)
- [Pages & Features](#pages--features)
- [API Endpoints](#api-endpoints)
- [Database](#database)
- [Real-time Updates](#real-time-updates)
- [Known Issues & Pending Work](#known-issues--pending-work)
- [Test Credentials](#test-credentials)

---

## Overview

SR Comsoft AI is a full-stack AI voice calling platform. It provides separate dashboards for four user roles — **Admin**, **Superuser**, **Agent**, and **User** — each with role-scoped data, live charts, call log management, and agent performance analytics.

**Architecture:**

```
React Frontend (Vite)  ──→  FastAPI Backend  ──→  Neon PostgreSQL (serverless)
     port 5174                port 5000
  /api/* proxied via Vite
```

---

## Tech Stack

### Frontend
| Package | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| Vite | 7 | Build tool + dev server |
| React Router | 7 | Client-side routing |
| Tailwind CSS | — | Utility styling |
| echarts-for-react | — | All dashboard charts |
| @react-three/fiber | — | 3D bubble charts |
| @react-three/drei | — | Three.js helpers |
| Three.js | r128 | 3D rendering |
| html2canvas + jsPDF | — | PDF export |
| xlsx | — | Excel export |

### Backend
| Package | Purpose |
|---|---|
| FastAPI | API framework |
| psycopg2-binary | PostgreSQL driver |
| python-jose / PyJWT | JWT auth |
| bcrypt | Password hashing |
| python-dotenv | Env var loading |

### Database
- **Neon PostgreSQL** (serverless, ap-south-1 / us-east-1)
- Migrated from MySQL on 22/3/26

---

## Project Structure

```
sr-comsoft-ai/
├── backend/
│   ├── main.py                  # FastAPI app, CORS, router registry
│   ├── config.py                # DATABASE_URL, JWT_SECRET
│   ├── deps.py                  # JWT auth middleware + role guards
│   ├── models/
│   │   └── db.py                # psycopg2 Neon connection
│   └── routes/
│       ├── auth.py              # POST /api/register, /api/login
│       ├── admin.py             # /api/admin/*, /api/calls
│       ├── superuser.py         # /api/agents, /api/sankey, /api/stats
│       ├── agent.py             # /api/agent/*
│       ├── home.py              # /api/home/*
│       ├── analytics.py         # /api/analytics/*
│       └── user.py              # /api/call-logs
│
└── src/
    ├── App.jsx
    ├── main.jsx
    ├── styles/global.css
    ├── context/
    │   └── AuthContext.jsx
    ├── routes/
    │   ├── AppRoutes.jsx
    │   └── ProtectedRoute.jsx
    ├── layout/
    │   ├── AppShell.jsx
    │   └── Sidebar.jsx
    ├── hooks/
    │   └── useAgentDashboard.js
    ├── utils/
    │   └── agentHelpers.js
    ├── services/
    │   └── api.js
    ├── components/
    │   ├── dashboard/
    │   │   ├── fulldashboard.jsx  # All superuser widgets
    │   │   ├── AIChatBox.jsx
    │   │   ├── GlobalStyles.jsx
    │   │   └── UI.jsx
    │   └── agentDashboard/
    │       ├── Sidebar.jsx
    │       ├── Header.jsx
    │       ├── Charts.jsx
    │       ├── CallTable.jsx
    │       └── Tabs.jsx
    └── pages/
        ├── Login.jsx
        ├── Register.jsx
        ├── AdminPage.jsx
        ├── AgentPage.jsx
        ├── SuperuserPage.jsx
        ├── admin/
        │   ├── Admindashboard.jsx
        │   ├── AdminSettings.jsx
        │   ├── StaffPerformance.jsx
        │   ├── AIQueryCategories.jsx
        │   └── LiveQuerySimulator.jsx
        ├── superuser/
        │   ├── Dashboard.jsx
        │   ├── Agents.jsx
        │   ├── AgentDetail.jsx
        │   ├── CallAnalytics.jsx
        │   ├── Settings.jsx
        │   ├── IVRStudio.jsx      # placeholder
        │   └── Escalations.jsx    # placeholder
        ├── agent/
        │   └── AgentDashboard.jsx
        └── user/
            ├── HomePage.jsx
            ├── AnalyticsPage.jsx
            ├── CallLogsPage.jsx
            ├── SendCallPage.jsx   # UI only
            ├── PersonasPage.jsx   # UI only
            ├── PathwaysPage.jsx   # UI only
            ├── BatchesPage.jsx    # UI only
            ├── BillingPage.jsx    # UI only
            ├── VoicesPage.jsx     # UI only
            ├── KnowledgeBasesPage.jsx  # UI only
            ├── WebWidgetPage.jsx  # UI only
            └── ToolsPage.jsx      # UI only
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- Git

### 1. Clone the repo

```bash
git clone https://github.com/your-org/sr-comsoft-ai.git
cd sr-comsoft-ai
```

### 2. Frontend setup

```bash
npm install
```

### 3. Backend setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# Mac / Linux
source .venv/bin/activate

pip install fastapi uvicorn psycopg2-binary python-jose bcrypt python-dotenv pyjwt
```

### 4. Environment variables

Create `backend/.env`:

```env
DATABASE_URL=postgresql://your_neon_connection_string?sslmode=require
JWT_SECRET=your_secret_key_here
```

### 5. Run

**Backend** (from inside `backend/` with venv active):

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 5000
```

**Frontend** (from project root):

```bash
npm run dev
```

Frontend runs on `http://localhost:5174`. All `/api/*` calls are proxied to `http://localhost:5000` via Vite config.

---

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `DATABASE_URL` | `backend/.env` | Neon PostgreSQL connection string |
| `JWT_SECRET` | `backend/.env` | Secret for signing JWT tokens |

---

## Roles & Access

| Role | Landing | Data Scope |
|---|---|---|
| `admin` | `/admin` | Full access — all users, all calls |
| `superuser` | `/superuser` | Team-scoped — only agents where `superuser_id = user.id` |
| `agent` | `/agent` | Own data only — own call logs and profile |
| `user` | `/welcome` → `/user` | Own call logs only |

**Login flow:**

```
POST /api/login → JWT token → role-based redirect
  admin      → /admin
  superuser  → /superuser
  agent      → /agent
  user       → /welcome
```

Token stored in `localStorage.getItem("token")`. User object in `localStorage.getItem("user")`.

---

## Pages & Features

### Admin

| Page | Path | Status | Features |
|---|---|---|---|
| Admin Landing | `/admin` | ✅ | Nav shell |
| Admin Dashboard | `/admin/dashboard` | ✅ Connected + polling | Call logs, sankey, 3D charts, staff performance, query categories, live simulator |
| Admin Settings | `/admin/settings` | ✅ Connected + polling | User list, activate/deactivate, add credits, role + status filters |

### Superuser

| Page | Path | Status | Features |
|---|---|---|---|
| Superuser Landing | `/superuser` | ✅ | Nav shell |
| Dashboard | `/superuser/dashboard` | ✅ Connected + polling | 3D bubble chart, sankey flow, risk panel, KPI panel, export PDF/Excel |
| Agents | `/superuser/agents` | ✅ Connected | Team agent list (superuser-scoped) |
| Agent Detail | `/superuser/agent/:id` | ✅ Connected | Profile, call logs, category chart |
| Call Analytics | `/superuser/analytics` | ✅ Connected + polling | 3D category bubbles, call log drilldown, audio player |
| Settings | `/superuser/settings` | ✅ Connected | Agent CRUD — create, edit, toggle, delete |
| IVR Studio | `/superuser/ivr-studio` | ⬜ Placeholder | Not yet implemented |
| Escalations | `/superuser/escalations` | ⬜ Placeholder | Not yet implemented |

### Agent

| Page | Path | Status | Features |
|---|---|---|---|
| Agent Landing | `/agent` | ✅ | Sidebar + Open Dashboard button |
| Agent Dashboard | `/agent/dashboard` | ✅ Connected + polling | Overview, call history, analytics, settings tabs. IVR card, date/channel filter, CSAT badge |

**Agent Dashboard tabs:**

- **Overview** — KPI row, daily line chart, hourly heatmap, status donut, sentiment donut, category bubble, sankey, recent calls
- **Call History** — full table with direction, sentiment, cost, detail modal with recording + transcript
- **Analytics** — all charts full height
- **Settings** — read-only profile card

### User

| Page | Path | Status |
|---|---|---|
| Home | `/user` | ✅ Connected + polling |
| Analytics | `/user/analytics` | ✅ Connected |
| Call Logs | `/user/call-logs` | ✅ Connected + polling |
| Send Call | `/user/send-call` | ⬜ UI only |
| Personas | `/user/personas` | ⬜ UI only |
| Pathways | `/user/pathways` | ⬜ UI only |
| Batches | `/user/batches` | ⬜ UI only |
| Billing | `/user/billing` | ⬜ UI only |
| Voices | `/user/voices` | ⬜ UI only |
| Knowledge Bases | `/user/knowledge-bases` | ⬜ UI only |
| Web Widget | `/user/web-widget` | ⬜ UI only |
| Tools | `/user/tools` | ⬜ UI only |

---

## API Endpoints

### Auth
```
POST /api/register    — Create new user account
POST /api/login       — Login, returns JWT token
```

### Admin
```
GET  /api/admin/stats              — Total users, agents, calls
GET  /api/admin/users              — All users list
PUT  /api/admin/users/:id/status   — Toggle active/inactive
PUT  /api/admin/users/:id/credits  — Add credits to user
GET  /api/calls                    — Last 100 call logs
POST /api/calls                    — Create call log
PUT  /api/calls/:id                — Update call status
```

### Superuser (all team-scoped by superuser_id)
```
GET    /api/agents                    — Team agents list
POST   /api/agents                    — Create new agent
GET    /api/agents/:id                — Agent detail + calls + graph
PUT    /api/agents/:id                — Update agent
DELETE /api/agents/:id                — Delete agent
GET    /api/sankey                    — Call flow sankey data
GET    /api/call-stats                — Category call counts
GET    /api/calls/category/:cat       — Calls by category
GET    /api/stats                     — Team KPIs
```

### Agent (scoped to logged-in agent)
```
GET /api/agent/profile               — Agent profile + user info
GET /api/agent/csat                  — CSAT score (filterable)
GET /api/agent/calls                 — Paginated call history
GET /api/agent/call-stats            — Charts data + KPIs
GET /api/agent/ivr-status            — IVR pathway hits last 24h
```

All agent endpoints accept query params: `date_from`, `date_to`, `channel`

### User
```
GET /api/home/stats                  — 7-day call stats
GET /api/home/recent-activity        — Last N call activities
GET /api/analytics/calls             — Full analytics data
GET /api/analytics/reports           — Analytics report summary
GET /api/call-logs                   — User call logs (filterable by status)
```

---

## Database

### Tables

**users**
```sql
id SERIAL PRIMARY KEY
name VARCHAR(100)
email VARCHAR(255) UNIQUE
password_hash VARCHAR(255)
phone_number VARCHAR(20)
is_active BOOLEAN DEFAULT TRUE
role VARCHAR(20)  -- 'user' | 'admin' | 'superuser' | 'agent'
```

**agents**
```sql
id SERIAL PRIMARY KEY
user_id INTEGER REFERENCES users(id)
superuser_id INTEGER REFERENCES users(id)  -- scopes agent to a team
name VARCHAR(100)
model_variant VARCHAR(50)
skill_level VARCHAR(50)
calls_handled INTEGER
resolved_count INTEGER
escalated_count INTEGER
transferred_count INTEGER
callback_count INTEGER
csat_score FLOAT
avg_latency_ms INTEGER
hallucination_rate FLOAT
workload_percent INTEGER
risk_level VARCHAR(20)
is_active BOOLEAN DEFAULT TRUE
```

**call_logs**
```sql
id SERIAL PRIMARY KEY
agent_id INTEGER REFERENCES agents(id)
user_id INTEGER REFERENCES users(id)
call_id VARCHAR(100)
direction VARCHAR(20)
to_number VARCHAR(20)
from_number VARCHAR(20)
duration_seconds INTEGER
cost DECIMAL(10,5)
status VARCHAR(50)
category VARCHAR(100)
sentiment VARCHAR(50)
issue_summary TEXT
caller_name VARCHAR(100)
caller_number VARCHAR(20)
pathway VARCHAR(100)
issues TEXT
area_code VARCHAR(10)
created_at TIMESTAMP DEFAULT NOW()
```

**system_settings**
```sql
id SERIAL PRIMARY KEY
key VARCHAR(100) UNIQUE
value TEXT
```

### Important Notes

- All PostgreSQL column aliases must be **quoted** to preserve camelCase:
  ```sql
  SELECT risk_level AS "riskLevel" FROM agents
  ```
  Unquoted aliases are lowercased by PostgreSQL → frontend field mismatch.

- Use `RETURNING id` instead of `cursor.lastrowid` for inserts.

- Use `INTERVAL '24 hours'` not `INTERVAL 24 HOUR` (MySQL syntax).

- All routes use `psycopg2.extras.RealDictCursor` for dict-style row access.

---

## Real-time Updates

All dashboards poll the backend every **30 seconds** automatically.

| Dashboard | Hook / Function | Interval |
|---|---|---|
| Superuser Dashboard | `handleRefresh` (useCallback) | 30s |
| Admin Dashboard | `fetchDashboardData` (useCallback) | 30s |
| Admin Settings | `fetchAll` (useCallback) | 30s |
| Agent Dashboard | `loadAll` in `useAgentDashboard.js` | 30s |
| User Home | `fetchAll` (useCallback) | 30s |
| User Call Logs | `loadCalls` (useCallback) | 30s |
| Call Analytics | `fetchStats` (useCallback) | 30s |

**Pattern used in every dashboard:**

```js
const fetchData = useCallback(async () => {
  // fetch from API
}, []);

useEffect(() => { fetchData(); }, [fetchData]);

useEffect(() => {
  const interval = setInterval(fetchData, 30000);
  return () => clearInterval(interval); // cleanup on unmount
}, [fetchData]);
```

**Planned:** WebSocket listener (post WebRTC integration). Migration path — replace `clearInterval` with `ws.close()` only, no other changes needed.

---

## Known Issues & Pending Work

### Missing Backend Endpoints

| Endpoint | Used By | Status |
|---|---|---|
| `POST /api/ask` | AIChatBox (superuser) | Not built |
| `POST /api/nl2sql` | Smart search (admin) | Not built |
| `POST /api/rag` | Live query simulator | Not built (falls back to keyword detection) |

### Frontend Bugs

- `LiveQuerySimulator.jsx` — typo `stystyle=` in 3D modal, change to `style=`

### Not Yet Connected to Backend

- `SendCallPage`, `PersonasPage`, `PathwaysPage`, `BatchesPage`
- `BillingPage`, `VoicesPage`, `KnowledgeBasesPage`, `WebWidgetPage`, `ToolsPage`

### Placeholders

- `IVRStudio.jsx` — no functionality
- `Escalations.jsx` — no functionality

### Infrastructure

- No connection pooling — each request opens/closes a new psycopg2 connection
- WebRTC calling not built yet
- Webhook endpoint for call completion not built yet

---

## Test Credentials

| Email | Password | Role |
|---|---|---|
| `shaileydubey21@gmail.com` | `srcomairenture@123` | admin |
| `shaileyvan27@gmail.com` | `1234567890` | superuser |
| `shailey.dubey@srcomsoft.co.in` | `srcomsoft` | agent |
| `dubeyon712@gmail.com` | `shaileydubey@123` | user |

---

## CSS Variables (Dashboard Theme)

Defined in `src/styles/global.css`:

```css
--bg      #080a1a    /* page background */
--bg2     #0c0f22    /* sidebar / card background */
--card    #11142a    /* card surface */
--bdr     rgba(110,85,230,0.14)  /* border */
--pur     #7c5cff    /* primary purple */
--grn     #00d4a0    /* green accent */
--red     #ff4757    /* danger red */
--txt     #e6e1ff    /* primary text */
--txt2    #8e8ab0    /* secondary text */
```

---

## License

Private — SR Comsoft. All rights reserved.
