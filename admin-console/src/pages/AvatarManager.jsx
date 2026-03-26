// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | AvatarCard()              |
// | * persona display card    |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | EditModal()               |
// | * persona edit overlay    |
// +---------------------------+
//     |
//     |----> toggleLang()
//     |        * adds/removes language code
//     |
//     |----> field()
//     |        * renders input/textarea field
//     |
//     v
// +---------------------------+
// | AvatarManager()           |
// | * persona management page |
// +---------------------------+
//     |
//     |----> useCallback() -> handleSave()
//     |        * updates persona in list
//     |
//     |----> useCallback() -> handleDelete()
//     |        * removes persona from list
//     |
//     |----> useCallback() -> handleAdd()
//     |        * creates new persona entry
//     |
//     |----> AvatarCard()
//     |        * renders each persona
//     |
//     |----> EditModal()
//     |        * shown when editing set
//     |
//     v
// [ END ]
//
// ================================================================

/**
 * AvatarManager.jsx — Voice Agent Avatar & Persona Management
 *
 * Configure voice personas: display name, language assignments,
 * pitch/speed modulation, TTS description, and voice cloning.
 *
 * Apache 2.0
 */

import { useState, useCallback } from "react";

const LANG_OPTIONS = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "mr", label: "Marathi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ml", label: "Malayalam" },
  { code: "kn", label: "Kannada" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
  { code: "pa", label: "Punjabi" },
  { code: "ne", label: "Nepali" },
  { code: "ar", label: "Arabic" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese" },
];

const AVATAR_COLORS = [
  "#4f46e5", "#0ea5e9", "#22c55e", "#f59e0b",
  "#ef4444", "#a855f7", "#14b8a6", "#f97316",
];

const INITIAL_PERSONAS = [
  {
    id: 1, name: "aria", display_name: "Aria",
    lang_codes: ["en"], pitch_shift: 1.5, speed_factor: 1.0,
    tts_description: "Aria speaks with a warm, clear American accent.",
    cloning_enabled: false, clone_ref_audio: null, color: "#4f46e5",
    avatar_emoji: "👩",
  },
  {
    id: 2, name: "priya", display_name: "Priya",
    lang_codes: ["hi", "mr", "ne"], pitch_shift: 1.0, speed_factor: 1.02,
    tts_description: "Priya speaks fluent Hindi with a warm, natural Delhi accent.",
    cloning_enabled: false, clone_ref_audio: null, color: "#22c55e",
    avatar_emoji: "👩‍💼",
  },
  {
    id: 3, name: "james", display_name: "James",
    lang_codes: ["en"], pitch_shift: -2.0, speed_factor: 0.97,
    tts_description: "James speaks with a deep, confident British accent.",
    cloning_enabled: false, clone_ref_audio: null, color: "#0ea5e9",
    avatar_emoji: "👨",
  },
  {
    id: 4, name: "meera", display_name: "Meera",
    lang_codes: ["ml", "ta"], pitch_shift: 0.5, speed_factor: 1.0,
    tts_description: "Meera speaks gentle, melodic Malayalam.",
    cloning_enabled: false, clone_ref_audio: null, color: "#a855f7",
    avatar_emoji: "👩‍🎤",
  },
];

// ─── Avatar Card ─────────────────────────────────────────────────────────────

function AvatarCard({ persona, onEdit, onDelete }) {
  return (
    <div style={{
      background: "#111827", border: "1px solid #1f2937", borderRadius: 14,
      padding: 20, display: "flex", flexDirection: "column", gap: 14,
      borderTop: `3px solid ${persona.color}`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: persona.color + "22", border: `2px solid ${persona.color}44`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
        }}>
          {persona.avatar_emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#f9fafb" }}>
            {persona.display_name}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>@{persona.name}</div>
        </div>
        {persona.cloning_enabled && (
          <span style={{
            background: "#a855f722", color: "#a855f7", border: "1px solid #a855f744",
            borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600,
          }}>
            CLONED
          </span>
        )}
      </div>

      {/* Languages */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {persona.lang_codes.map(l => {
          const lang = LANG_OPTIONS.find(o => o.code === l);
          return (
            <span key={l} style={{
              background: "#1f2937", color: "#9ca3af", borderRadius: 8,
              padding: "2px 8px", fontSize: 11,
            }}>
              {lang?.label || l}
            </span>
          );
        })}
      </div>

      {/* Modulation sliders (read-only display) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: "Pitch", value: persona.pitch_shift, unit: "st", range: [-6, 6] },
          { label: "Speed", value: persona.speed_factor, unit: "×",  range: [0.7, 1.4] },
        ].map(({ label, value, unit, range }) => {
          const pct = ((value - range[0]) / (range[1] - range[0])) * 100;
          return (
            <div key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                <span>{label}</span>
                <span style={{ color: "#9ca3af" }}>{value > 0 && label === "Pitch" ? "+" : ""}{value}{unit}</span>
              </div>
              <div style={{ height: 4, background: "#1f2937", borderRadius: 2 }}>
                <div style={{
                  height: "100%", width: `${pct}%`,
                  background: persona.color, borderRadius: 2,
                  transition: "width 0.3s",
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* TTS description */}
      <div style={{
        background: "#0d1117", borderRadius: 8, padding: "10px 12px",
        fontSize: 12, color: "#6b7280", fontStyle: "italic",
      }}>
        "{persona.tts_description}"
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onEdit(persona)}
          style={{ flex: 1, background: "#1f2937", color: "#d1d5db",
                   border: "1px solid #374151", borderRadius: 8, padding: "8px",
                   cursor: "pointer", fontSize: 13 }}>
          Configure
        </button>
        <button onClick={() => onDelete(persona.id)}
          style={{ background: "#450a0a", color: "#f87171",
                   border: "none", borderRadius: 8, padding: "8px 14px",
                   cursor: "pointer", fontSize: 13 }}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({ persona, onSave, onClose }) {
  const [form, setForm] = useState({ ...persona });

  const toggleLang = (code) => {
    setForm(f => ({
      ...f,
      lang_codes: f.lang_codes.includes(code)
        ? f.lang_codes.filter(l => l !== code)
        : [...f.lang_codes, code],
    }));
  };

  const field = (key, label, type = "text", extra = {}) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>
        {label}
      </label>
      {type === "textarea" ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          rows={3}
          style={{ width: "100%", background: "#1f2937", border: "1px solid #374151",
                   borderRadius: 6, padding: "8px 12px", color: "#f9fafb",
                   fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
        />
      ) : (
        <input
          type={type} value={form[key]}
          min={extra.min} max={extra.max} step={extra.step}
          onChange={e => setForm(f => ({
            ...f,
            [key]: type === "range" || type === "number" ? parseFloat(e.target.value) : e.target.value,
          }))}
          style={{ width: "100%", background: "#1f2937", border: "1px solid #374151",
                   borderRadius: 6, padding: "8px 12px", color: "#f9fafb",
                   fontSize: 13, boxSizing: "border-box" }}
        />
      )}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
                  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 14,
                    padding: 28, width: 520, maxHeight: "85vh", overflowY: "auto" }}>
        <h3 style={{ color: "#f9fafb", margin: "0 0 20px" }}>Configure Persona</h3>

        {field("display_name", "Display Name")}
        {field("name",         "Internal Name")}
        {field("avatar_emoji", "Avatar Emoji")}
        {field("tts_description", "TTS Voice Description", "textarea")}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>
            Pitch Shift: {form.pitch_shift > 0 ? "+" : ""}{form.pitch_shift} semitones
          </label>
          <input type="range" min={-6} max={6} step={0.5} value={form.pitch_shift}
            onChange={e => setForm(f => ({ ...f, pitch_shift: parseFloat(e.target.value) }))}
            style={{ width: "100%" }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>
            Speed Factor: {form.speed_factor}×
          </label>
          <input type="range" min={0.7} max={1.4} step={0.01} value={form.speed_factor}
            onChange={e => setForm(f => ({ ...f, speed_factor: parseFloat(e.target.value) }))}
            style={{ width: "100%" }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 8 }}>
            Supported Languages
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {LANG_OPTIONS.map(l => {
              const sel = form.lang_codes.includes(l.code);
              return (
                <button key={l.code} onClick={() => toggleLang(l.code)}
                  style={{ background: sel ? "#4f46e5" : "#1f2937",
                           color: sel ? "#fff" : "#9ca3af",
                           border: `1px solid ${sel ? "#4f46e5" : "#374151"}`,
                           borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>
            Avatar Color
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {AVATAR_COLORS.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: "none",
                         cursor: "pointer", outline: form.color === c ? "2px solid #fff" : "none" }} />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={form.cloning_enabled}
              onChange={e => setForm(f => ({ ...f, cloning_enabled: e.target.checked }))} />
            <span style={{ color: "#9ca3af", fontSize: 13 }}>Enable Voice Cloning</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose}
            style={{ background: "#374151", color: "#9ca3af", border: "none",
                     borderRadius: 8, padding: "8px 20px", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => onSave(form)}
            style={{ background: "#4f46e5", color: "#fff", border: "none",
                     borderRadius: 8, padding: "8px 24px", cursor: "pointer", fontWeight: 600 }}>
            Save Persona
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AvatarManager() {
  const [personas, setPersonas] = useState(INITIAL_PERSONAS);
  const [editing,  setEditing]  = useState(null);

  const handleSave = useCallback((updated) => {
    setPersonas(ps => ps.map(p => p.id === updated.id ? updated : p));
    setEditing(null);
  }, []);

  const handleDelete = useCallback((id) => {
    if (!window.confirm("Delete this persona?")) return;
    setPersonas(ps => ps.filter(p => p.id !== id));
  }, []);

  const handleAdd = useCallback(() => {
    const newPersona = {
      id: Date.now(), name: "new_persona", display_name: "New Agent",
      lang_codes: ["en"], pitch_shift: 0, speed_factor: 1.0,
      tts_description: "A professional call center agent.",
      cloning_enabled: false, clone_ref_audio: null,
      color: AVATAR_COLORS[personas.length % AVATAR_COLORS.length],
      avatar_emoji: "🤖",
    };
    setPersonas(ps => [...ps, newPersona]);
    setEditing(newPersona);
  }, [personas]);

  return (
    <div style={{ padding: 24, color: "#f9fafb", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Avatar Manager</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            Configure voice agent personas and modulation settings
          </p>
        </div>
        <button onClick={handleAdd}
          style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8,
                   padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
          + New Persona
        </button>
      </div>

      {/* Stat strip */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Personas", value: personas.length, color: "#4f46e5" },
          { label: "Cloned Voices",  value: personas.filter(p => p.cloning_enabled).length, color: "#a855f7" },
          { label: "Languages",      value: [...new Set(personas.flatMap(p => p.lang_codes))].length, color: "#22c55e" },
        ].map(s => (
          <div key={s.label} style={{
            background: "#111827", border: "1px solid #1f2937", borderRadius: 10,
            padding: "14px 20px", flex: "1 1 160px",
          }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Persona grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
        {personas.map(p => (
          <AvatarCard key={p.id} persona={p} onEdit={setEditing} onDelete={handleDelete} />
        ))}
      </div>

      {editing && (
        <EditModal persona={editing} onSave={handleSave} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
