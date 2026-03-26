// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | RoleBadge()               |
// | * colored role label      |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | UserRow()                 |
// | * user table row          |
// +---------------------------+
//     |
//     |----> RoleBadge()
//     |        * shows role color/label
//     |
//     v
// +---------------------------+
// | EditUserModal()           |
// | * user edit overlay       |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | RBAC()                    |
// | * user & roles admin page |
// +---------------------------+
//     |
//     |----> useCallback() -> handleToggle()
//     |        * toggles user active state
//     |
//     |----> useCallback() -> handleSave()
//     |        * saves edited user
//     |
//     |----> UserRow()
//     |        * renders user table rows
//     |
//     |----> EditUserModal()
//     |        * shown when editUser set
//     |
//     v
// [ END ]
//
// ================================================================

/**
 * RBAC.jsx — Role-Based Access Control management page
 *
 * Manages users, roles, and permissions for the Voice AI admin system.
 * Roles: super_admin | admin | supervisor | agent | viewer
 *
 * Apache 2.0
 */

import { useState, useEffect, useCallback } from "react";

// ─── Mock data (replace with real API calls) ────────────────────────────────
const ROLES = [
  { id: "super_admin", label: "Super Admin",  color: "#ef4444", permissions: ["*"] },
  { id: "admin",       label: "Admin",        color: "#f97316", permissions: ["users.manage","agents.manage","config.write","analytics.view"] },
  { id: "supervisor",  label: "Supervisor",   color: "#eab308", permissions: ["agents.view","sessions.monitor","analytics.view","corrections.write"] },
  { id: "agent",       label: "Agent",        color: "#22c55e", permissions: ["sessions.join","corrections.write","suggestions.view"] },
  { id: "viewer",      label: "Viewer",       color: "#6b7280", permissions: ["analytics.view","sessions.view"] },
];

const PERMISSIONS = [
  { id: "users.manage",      label: "Manage Users",         category: "Administration" },
  { id: "agents.manage",     label: "Manage Agents",        category: "Administration" },
  { id: "config.write",      label: "Edit Configuration",   category: "Administration" },
  { id: "analytics.view",    label: "View Analytics",       category: "Reporting" },
  { id: "sessions.monitor",  label: "Monitor Sessions",     category: "Operations" },
  { id: "sessions.join",     label: "Join Sessions",        category: "Operations" },
  { id: "sessions.view",     label: "View Sessions",        category: "Operations" },
  { id: "agents.view",       label: "View Agents",          category: "Operations" },
  { id: "corrections.write", label: "Submit STT Corrections", category: "Quality" },
  { id: "suggestions.view",  label: "View Smart Suggestions", category: "Quality" },
];

const INITIAL_USERS = [
  { id: 1, name: "System Admin",    email: "admin@srcomsoft.com",      role: "super_admin", active: true,  last_login: "2026-03-25" },
  { id: 2, name: "Ops Manager",     email: "ops@srcomsoft.com",        role: "admin",       active: true,  last_login: "2026-03-24" },
  { id: 3, name: "Team Lead",       email: "lead@srcomsoft.com",       role: "supervisor",  active: true,  last_login: "2026-03-23" },
  { id: 4, name: "Agent Priya",     email: "priya@srcomsoft.com",      role: "agent",       active: true,  last_login: "2026-03-25" },
  { id: 5, name: "Analyst View",    email: "analyst@srcomsoft.com",    role: "viewer",      active: false, last_login: "2026-03-10" },
];

// ─── Sub-components ─────────────────────────────────────────────────────────

function RoleBadge({ roleId }) {
  const role = ROLES.find(r => r.id === roleId);
  if (!role) return null;
  return (
    <span style={{
      background: role.color + "22",
      color: role.color,
      border: `1px solid ${role.color}44`,
      borderRadius: 12,
      padding: "2px 10px",
      fontSize: 12,
      fontWeight: 600,
    }}>
      {role.label}
    </span>
  );
}

function UserRow({ user, onEdit, onToggle }) {
  return (
    <tr style={{ borderBottom: "1px solid #1f2937" }}>
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "#374151", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 14, fontWeight: 700,
            color: "#9ca3af",
          }}>
            {user.name[0]}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#f9fafb" }}>{user.name}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{user.email}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: "12px 16px" }}><RoleBadge roleId={user.role} /></td>
      <td style={{ padding: "12px 16px" }}>
        <span style={{ color: user.active ? "#22c55e" : "#6b7280", fontSize: 13 }}>
          {user.active ? "● Active" : "○ Inactive"}
        </span>
      </td>
      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 13 }}>
        {user.last_login}
      </td>
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onEdit(user)}
            style={{ background: "#1f2937", color: "#d1d5db", border: "1px solid #374151",
                     borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>
            Edit
          </button>
          <button
            onClick={() => onToggle(user)}
            style={{ background: user.active ? "#451a03" : "#052e16",
                     color: user.active ? "#fb923c" : "#4ade80",
                     border: "none", borderRadius: 6, padding: "4px 12px",
                     cursor: "pointer", fontSize: 12 }}>
            {user.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function EditUserModal({ user, onSave, onClose }) {
  const [form, setForm] = useState({ ...user });
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "#111827", border: "1px solid #374151", borderRadius: 12,
        padding: 28, width: 440,
      }}>
        <h3 style={{ color: "#f9fafb", margin: "0 0 20px" }}>Edit User</h3>
        {["name", "email"].map(field => (
          <div key={field} style={{ marginBottom: 14 }}>
            <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>
              {field.charAt(0).toUpperCase() + field.slice(1)}
            </label>
            <input
              value={form[field]}
              onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              style={{ width: "100%", background: "#1f2937", border: "1px solid #374151",
                       borderRadius: 6, padding: "8px 12px", color: "#f9fafb",
                       fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
        ))}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>
            Role
          </label>
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            style={{ width: "100%", background: "#1f2937", border: "1px solid #374151",
                     borderRadius: 6, padding: "8px 12px", color: "#f9fafb", fontSize: 13 }}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose}
            style={{ background: "#374151", color: "#9ca3af", border: "none",
                     borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => onSave(form)}
            style={{ background: "#4f46e5", color: "#fff", border: "none",
                     borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function RBAC() {
  const [users, setUsers]         = useState(INITIAL_USERS);
  const [editUser, setEditUser]   = useState(null);
  const [activeTab, setActiveTab] = useState("users");   // "users" | "roles"

  const handleToggle = useCallback((user) => {
    setUsers(us => us.map(u => u.id === user.id ? { ...u, active: !u.active } : u));
  }, []);

  const handleSave = useCallback((updated) => {
    setUsers(us => us.map(u => u.id === updated.id ? updated : u));
    setEditUser(null);
  }, []);

  const roleStats = ROLES.map(r => ({
    ...r,
    count: users.filter(u => u.role === r.id).length,
  }));

  const s = {
    page:     { padding: 24, color: "#f9fafb", fontFamily: "system-ui, sans-serif" },
    card:     { background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 20, marginBottom: 20 },
    table:    { width: "100%", borderCollapse: "collapse" },
    th:       { padding: "10px 16px", textAlign: "left", color: "#6b7280", fontSize: 12,
                fontWeight: 600, textTransform: "uppercase", borderBottom: "1px solid #1f2937" },
    tab:      { padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600 },
  };

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Access Control</h1>
        <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
          Manage users, roles, and permissions
        </p>
      </div>

      {/* Role summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {roleStats.map(r => (
          <div key={r.id} style={{
            ...s.card, padding: "14px 20px", marginBottom: 0,
            borderLeft: `3px solid ${r.color}`, flex: "1 1 150px",
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: r.color }}>{r.count}</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>{r.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["users", "roles"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ ...s.tab,
              background: activeTab === tab ? "#4f46e5" : "#1f2937",
              color:      activeTab === tab ? "#fff"    : "#9ca3af",
            }}>
            {tab === "users" ? "Users" : "Role Permissions"}
          </button>
        ))}
      </div>

      {activeTab === "users" && (
        <div style={s.card}>
          <table style={s.table}>
            <thead>
              <tr>
                {["User", "Role", "Status", "Last Login", "Actions"].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <UserRow key={u.id} user={u}
                  onEdit={setEditUser}
                  onToggle={handleToggle}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "roles" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {ROLES.map(role => (
            <div key={role.id} style={{ ...s.card, borderTop: `3px solid ${role.color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: role.color }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: "#f9fafb" }}>{role.label}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {PERMISSIONS.map(p => {
                  const has = role.permissions.includes("*") || role.permissions.includes(p.id);
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: has ? "#22c55e" : "#374151", fontSize: 14 }}>
                        {has ? "✓" : "○"}
                      </span>
                      <span style={{ fontSize: 12, color: has ? "#d1d5db" : "#4b5563" }}>
                        {p.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editUser && (
        <EditUserModal user={editUser} onSave={handleSave} onClose={() => setEditUser(null)} />
      )}
    </div>
  );
}
