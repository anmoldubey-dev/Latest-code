// ================================================================
// AvatarManager.jsx — Voice Agent Avatar & Persona Management
// Apache 2.0
// ================================================================

import { useState, useCallback, useRef } from "react";
import { backendApi, ttsGlobalApi, ttsIndicApi } from "../api/client";

// ── Constants ────────────────────────────────────────────────────
const LANG_OPTIONS = [
  // Global
  { code: "en", label: "English",    tts: "global" },
  { code: "fr", label: "French",     tts: "global" },
  { code: "de", label: "German",     tts: "global" },
  { code: "es", label: "Spanish",    tts: "global" },
  { code: "pt", label: "Portuguese", tts: "global" },
  { code: "pl", label: "Polish",     tts: "global" },
  { code: "it", label: "Italian",    tts: "global" },
  { code: "nl", label: "Dutch",      tts: "global" },
  // Indic
  { code: "hi", label: "Hindi",      tts: "indic" },
  { code: "en_in", label: "English (Indian)", tts: "indic" },
  { code: "mr", label: "Marathi",    tts: "indic" },
  { code: "bn", label: "Bengali",    tts: "indic" },
  { code: "ta", label: "Tamil",      tts: "indic" },
  { code: "te", label: "Telugu",     tts: "indic" },
  { code: "gu", label: "Gujarati",   tts: "indic" },
  { code: "kn", label: "Kannada",    tts: "indic" },
  { code: "ml", label: "Malayalam",  tts: "indic" },
  { code: "pa", label: "Punjabi",    tts: "indic" },
  { code: "or", label: "Odia",       tts: "indic" },
  { code: "as", label: "Assamese",   tts: "indic" },
  { code: "ur", label: "Urdu",       tts: "indic" },
];

// Voices as they truly exist in presets.py — names never changed
const GLOBAL_VOICES = [
  "Emma (Warm Female)", "James (Professional Male)",
  "Sophie (Clear Female)", "Louis (Calm Male)",
  "Lena (Bright Female)", "Klaus (Deep Male)",
  "Maria (Warm Female)", "Carlos (Professional Male)",
  "Ana (Soft Female)", "Pedro (Calm Male)",
  "Zofia (Clear Female)", "Marek (Warm Male)",
  "Giulia (Expressive Female)", "Marco (Professional Male)",
  "Fenna (Clear Female)", "Lars (Calm Male)",
];

const INDIC_VOICES = [
  "Divya (Warm Female)", "Rohit (Professional Male)",
  "Aditi (Clear Female)", "Aakash (Assertive Male)",
  "Sunita (Fluent Female)", "Sanjay (Calm Male)",
  "Riya (Warm Female)", "Sourav (Professional Male)",
  "Kavitha (Clear Female)", "Karthik (Calm Male)",
  "Padma (Bright Female)", "Venkat (Authoritative Male)",
  "Nisha (Warm Female)", "Bhavesh (Professional Male)",
  "Rekha (Clear Female)", "Sunil (Calm Male)",
  "Lakshmi (Soft Female)", "Sreejith (Warm Male)",
  "Gurpreet (Bright Female)", "Harjinder (Deep Male)",
  "Smita (Warm Female)", "Bibhuti (Professional Male)",
  "Mousumi (Soft Female)", "Dipen (Calm Male)",
  "Zara (Warm Female)", "Faraz (Professional Male)",
];

const AVATAR_COLORS = [
  "#4f46e5", "#0ea5e9", "#22c55e", "#f59e0b",
  "#ef4444", "#a855f7", "#14b8a6", "#f97316",
];

// Voice cloning is ONLY English + Hindi
const CLONE_SUPPORTED_LANGS = ["en", "hi"];

// Determine TTS backend from language codes
function ttsTypeForLangs(lang_codes) {
  const hasIndic = lang_codes.some(c => LANG_OPTIONS.find(o => o.code === c)?.tts === "indic");
  return hasIndic ? "indic" : "global";
}

// Per-language, both genders — exact names from presets.py
const LANG_TO_VOICES = {
  // Global
  en: { female: "Emma (Warm Female)",        male: "James (Professional Male)" },
  fr: { female: "Sophie (Clear Female)",     male: "Louis (Calm Male)" },
  de: { female: "Lena (Bright Female)",      male: "Klaus (Deep Male)" },
  es: { female: "Maria (Warm Female)",       male: "Carlos (Professional Male)" },
  pt: { female: "Ana (Soft Female)",         male: "Pedro (Calm Male)" },
  pl: { female: "Zofia (Clear Female)",      male: "Marek (Warm Male)" },
  it: { female: "Giulia (Expressive Female)", male: "Marco (Professional Male)" },
  nl: { female: "Fenna (Clear Female)",      male: "Lars (Calm Male)" },
  
  // Indic
  hi: { female: "Divya (Warm Female)",       male: "Rohit (Professional Male)" },
  en_in: { female: "Aditi (Clear Female)",    male: "Aakash (Assertive Male)" },
  mr: { female: "Sunita (Fluent Female)",    male: "Sanjay (Calm Male)" },
  bn: { female: "Riya (Warm Female)",        male: "Sourav (Professional Male)" },
  ta: { female: "Kavitha (Clear Female)",    male: "Karthik (Calm Male)" },
  te: { female: "Padma (Bright Female)",     male: "Venkat (Authoritative Male)" },
  gu: { female: "Nisha (Warm Female)",       male: "Bhavesh (Professional Male)" },
  kn: { female: "Rekha (Clear Female)",      male: "Sunil (Calm Male)" },
  ml: { female: "Lakshmi (Soft Female)",     male: "Sreejith (Warm Male)" },
  pa: { female: "Gurpreet (Bright Female)",  male: "Harjinder (Deep Male)" },
  or: { female: "Smita (Warm Female)",       male: "Bibhuti (Professional Male)" },
  as: { female: "Mousumi (Soft Female)",     male: "Dipen (Calm Male)" },
  ur: { female: "Zara (Warm Female)",        male: "Faraz (Professional Male)" },
};

function getLangsForVoice(voiceName, isGlobal) {
  const codes = [];
  Object.entries(LANG_TO_VOICES).forEach(([code, genders]) => {
    if (genders.female === voiceName || genders.male === voiceName) codes.push(code);
  });
  if (codes.length === 0) return [isGlobal ? "en" : "hi"];
  return codes;
}

const INITIAL_PERSONAS = [
  ...GLOBAL_VOICES.map((v, i) => ({
    id: `global-${i}`, name: v.split(" ")[0].toLowerCase(), display_name: v.split(" (")[0],
    lang_codes: getLangsForVoice(v, true), pitch_shift: 0, speed_factor: 1.0,
    tts_description: `Preview for ${v}`,
    cloning_enabled: false, clone_ref_audio: null, color: AVATAR_COLORS[i % AVATAR_COLORS.length],
    avatar_emoji: v.includes("Female") ? "👩" : "👨", custom_style: null, custom_speed: null,
    is_fixed: true, fixed_voice: v, tts_type: "global",
  })),
  ...INDIC_VOICES.map((v, i) => ({
    id: `indic-${i}`, name: v.split(" ")[0].toLowerCase(), display_name: v.split(" (")[0],
    lang_codes: getLangsForVoice(v, false), pitch_shift: 0, speed_factor: 1.0,
    tts_description: `Preview for ${v}`,
    cloning_enabled: false, clone_ref_audio: null, color: AVATAR_COLORS[(i + 4) % AVATAR_COLORS.length],
    avatar_emoji: v.includes("Female") ? "👩‍💼" : "👨‍💼", custom_style: null, custom_speed: null,
    is_fixed: true, fixed_voice: v, tts_type: "indic",
  }))
];

// Code already moved above

function voiceForPersona(lang_codes, gender) {
  const primary = lang_codes[0] || "en";
  const map = LANG_TO_VOICES[primary] || LANG_TO_VOICES.en;
  return map[gender] || map.female;
}

// ─── Avatar Card ─────────────────────────────────────────────────
function AvatarCard({ persona, onEdit, onDelete }) {
  return (
    <div style={{
      background: "#111827", border: "1px solid #1f2937", borderRadius: 14,
      padding: 20, display: "flex", flexDirection: "column", gap: 14,
      borderTop: `3px solid ${persona.color}`,
    }}>
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
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {persona.cloning_enabled && (
            <span style={{
              background: "#a855f722", color: "#a855f7", border: "1px solid #a855f744",
              borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600,
            }}>CLONED</span>
          )}
          <span style={{
            background: ttsTypeForLangs(persona.lang_codes) === "indic" ? "#06403022" : "#1e3a8a22",
            color: ttsTypeForLangs(persona.lang_codes) === "indic" ? "#4ade80" : "#60a5fa",
            border: `1px solid ${ttsTypeForLangs(persona.lang_codes) === "indic" ? "#06403066" : "#1e3a8a66"}`,
            borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 600,
          }}>
            {ttsTypeForLangs(persona.lang_codes) === "indic" ? "INDIC" : "GLOBAL"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {persona.lang_codes.map(l => {
          const lang = LANG_OPTIONS.find(o => o.code === l);
          return (
            <span key={l} style={{
              background: "#1f2937", color: "#9ca3af", borderRadius: 8,
              padding: "2px 8px", fontSize: 11,
            }}>{lang?.label || l}</span>
          );
        })}
      </div>

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
                <div style={{ height: "100%", width: `${pct}%`, background: persona.color, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        background: "#0d1117", borderRadius: 8, padding: "10px 12px",
        fontSize: 12, color: "#6b7280", fontStyle: "italic",
      }}>
        "{persona.tts_description}"
      </div>

      {persona.custom_style && (
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          AI style: <span style={{ color: "#a3e635" }}>{persona.custom_style}</span>
          {" · "}<span style={{ color: "#a3e635" }}>{persona.custom_speed}</span>
        </div>
      )}

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

// ─── Edit Modal ───────────────────────────────────────────────────
function EditModal({ persona, onSave, onClose }) {
  const [form, setForm]                   = useState({ ...persona });
  const [behaviorPrompt, setBehaviorPrompt] = useState("");
  const [ollamaStatus, setOllamaStatus]   = useState(null);
  const [ollamaError, setOllamaError]     = useState("");

  // Preview playback state
  const [previewText, setPreviewText]     = useState("");
  const [previewStatus, setPreviewStatus] = useState(null); // null | "loading" | "playing" | "error"
  const [previewError, setPreviewError]   = useState("");
  const prevAudioUrl                      = useRef(null);
  const audioRef                          = useRef(null);

  // Voice cloning state
  const [cloneAudio, setCloneAudio]       = useState(persona.clone_file_obj || null);
  const [cloneValidErr, setCloneValidErr] = useState("");
  const [cloningName, setCloningName]     = useState(persona.clone_voice_name || "");
  const [gender, setGender]               = useState(persona.gender || "female");

  const ttsType = ttsTypeForLangs(form.lang_codes);
  const api     = ttsType === "indic" ? ttsIndicApi : ttsGlobalApi;
  const primaryVoice = voiceForPersona(form.lang_codes, gender);

  const toggleLang = (code) => {
    setForm(f => ({
      ...f,
      lang_codes: f.lang_codes.includes(code)
        ? f.lang_codes.filter(l => l !== code)
        : [...f.lang_codes, code],
    }));
  };

  // Validate ref audio duration 15-30s
  const handleCloneAudio = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCloneValidErr("");
    const url = URL.createObjectURL(file);
    const tmp = new Audio(url);
    tmp.onloadedmetadata = () => {
      if (tmp.duration < 15 || tmp.duration > 30) {
        setCloneValidErr(`Audio must be 15–30 seconds (yours: ${tmp.duration.toFixed(1)}s)`);
        setCloneAudio(null);
      } else {
        setCloneAudio(file);
        setForm(f => ({ ...f, clone_ref_audio: file.name, clone_file_obj: file }));
      }
      URL.revokeObjectURL(url);
    };
  };

  // Generate preview audio — delete previous on new generation
  const handlePreview = async () => {
    if (!previewText.trim()) return;
    setPreviewStatus("loading");
    setPreviewError("");
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    try {
      // Delete previous preview file from server
      if (prevAudioUrl.current) {
        // best-effort; server auto-cleans on next gen via _next_filename rolling
      }

      let audioUrl;
      const finalTtsType = form.is_fixed ? form.tts_type : ttsTypeForLangs(form.lang_codes);
      const code = form.lang_codes[0] || (finalTtsType === "indic" ? "hi" : "en");
      const langOption = LANG_OPTIONS.find(o => o.code === code);
      // Ensure we send the full label (e.g. "Hindi", "French") expected by the backend
      const langLabel = langOption ? langOption.label : (finalTtsType === "indic" ? "Hindi" : "English");

      if (!form.is_fixed && form.cloning_enabled) {
        if (!cloneAudio && !form.clone_file_obj) throw new Error("Please upload a reference audio file first.");
        const formData = new FormData();
        formData.append("text", previewText.trim());
        formData.append("ref_audio", form.clone_file_obj || cloneAudio);
        formData.append("language", form.lang_codes.includes("hi") ? "hi" : "en");
        
        // Use standard fetch since it returns Blob directly
        const res = await fetch('/api/voice-cloner/generate', { method: 'POST', body: formData });
        if (!res.ok) throw new Error("Voice cloner failed");
        audioUrl = URL.createObjectURL(await res.blob());
      } else {
        const apiToUse = finalTtsType === "indic" ? ttsIndicApi : ttsGlobalApi;
        const res = await apiToUse.generate({
          text: previewText.trim(),
          voice_name: form.is_fixed ? form.fixed_voice : primaryVoice,
          emotion: "neutral",
          language: langLabel,
          custom_style: form.custom_style || undefined,
          custom_speed: form.custom_speed || undefined,
        });
        audioUrl = apiToUse.audioUrl(res.filename);
      }

      prevAudioUrl.current = audioUrl;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => setPreviewStatus(null);
      audio.onerror = () => { setPreviewStatus("error"); setPreviewError("Playback failed."); };
      audio.play();
      setPreviewStatus("playing");
    } catch (err) {
      setPreviewStatus("error");
      setPreviewError(err.message || "TTS generation failed.");
    }
  };

  const stopPreview = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPreviewStatus(null);
  };

  const handleReplay = () => {
    if (!prevAudioUrl.current) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const audio = new Audio(prevAudioUrl.current);
    audioRef.current = audio;
    audio.onended = () => setPreviewStatus(null);
    audio.onerror = () => { setPreviewStatus("error"); setPreviewError("Playback failed."); };
    audio.play();
    setPreviewStatus("playing");
  };

  const sectionLabel = (txt) => (
    <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: 1, margin: "18px 0 10px", borderBottom: "1px solid #1f2937",
                  paddingBottom: 6 }}>{txt}</div>
  );

  const field = (key, label, type = "text", extra = {}) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>{label}</label>
      {type === "textarea" ? (
        <textarea value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          rows={3}
          style={{ width: "100%", background: "#1f2937", border: "1px solid #374151",
                   borderRadius: 6, padding: "8px 12px", color: "#f9fafb",
                   fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
      ) : (
        <input type={type} value={form[key]} min={extra.min} max={extra.max} step={extra.step}
          onChange={e => setForm(f => ({
            ...f, [key]: type === "range" || type === "number" ? parseFloat(e.target.value) : e.target.value,
          }))}
          style={{ width: "100%", background: "#1f2937", border: "1px solid #374151",
                   borderRadius: 6, padding: "8px 12px", color: "#f9fafb",
                   fontSize: 13, boxSizing: "border-box" }} />
      )}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
                  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 14,
                    padding: 28, width: 540, maxHeight: "90vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ color: "#f9fafb", margin: 0 }}>
            {form.is_fixed ? `${form.display_name} - (Preview Beta)` : `Configure Cloned Persona`}
          </h3>
          <span style={{
            background: ttsType === "indic" ? "#06403033" : "#1e3a8a33",
            color: ttsType === "indic" ? "#4ade80" : "#60a5fa",
            borderRadius: 8, padding: "3px 10px", fontSize: 11, fontWeight: 700,
          }}>
            {ttsType === "indic" ? "Indic TTS (auto)" : "Global TTS (auto)"}
          </span>
        </div>

        {/* Fixed Personas vs Cloned Personas Logic */}
        {!form.is_fixed ? (
          <>
            {sectionLabel("Identity")}
            {field("display_name", "Display Name")}
            {field("name",         "Internal Name")}
            {field("avatar_emoji", "Avatar Emoji")}
            
            {sectionLabel("Languages (Cloner supports EN / HI)")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {LANG_OPTIONS.filter(l => CLONE_SUPPORTED_LANGS.includes(l.code)).map(l => {
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

            {sectionLabel("Voice Cloning (Required)")}
            <div style={{ background: "#0d1117", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                Upload a 15-30 second clear audio clip to mimic.
              </div>
              <div>
                <label style={{ display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>
                  Reference Audio
                </label>
                <input type="file" accept="audio/*" onChange={handleCloneAudio}
                  style={{ color: "#9ca3af", fontSize: 12 }} />
                {cloneValidErr && <div style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>{cloneValidErr}</div>}
                {cloneAudio && !cloneValidErr && (
                  <div style={{ color: "#4ade80", fontSize: 12, marginTop: 4 }}>✓ Attached</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div style={{ marginBottom: 14, color: "#9ca3af", fontSize: 13, background: "#1f2937", padding: "12px", borderRadius: 8 }}>
            <span style={{color: "#facc15", fontWeight: 600}}>STATIC VOICE:</span> You are previewing a permanent Parler TTS identity. You cannot change its base name, language, or clone its voice. You can only adjust its Pitch, Speed, and AI Behavior Pipeline.
          </div>
        )}

        {sectionLabel("AI Behavior Prompt")}
        <textarea value={behaviorPrompt}
          onChange={e => setBehaviorPrompt(e.target.value)}
          rows={3}
          placeholder='e.g. "Should sound very warm and slow, like a caring teacher" — any language'
          style={{ width: "100%", background: "#1f2937", border: "1px solid #374151",
                   borderRadius: 6, padding: "8px 12px", color: "#f9fafb",
                   fontSize: 13, resize: "vertical", boxSizing: "border-box", marginBottom: 8 }} />
        {form.custom_style && (
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
            Locked → style: <span style={{ color: "#a3e635" }}>{form.custom_style}</span>
            {" · "}speed: <span style={{ color: "#a3e635" }}>{form.custom_speed}</span>
            {" "}
            <button onClick={() => setForm(f => ({ ...f, custom_style: null, custom_speed: null }))}
              style={{ background: "none", border: "none", color: "#ef4444",
                       cursor: "pointer", fontSize: 11, padding: 0 }}>clear</button>
          </div>
        )}
        {ollamaStatus === "loading" && (
          <div style={{ padding: "10px 14px", background: "#1c1f26", border: "1px solid #374151",
                        borderRadius: 8, fontSize: 13, color: "#facc15", marginBottom: 8 }}>
            Translating and formatting persona for TTS... may take up to 5 minutes.
          </div>
        )}
        {ollamaStatus === "error" && (
          <div style={{ padding: "10px 14px", background: "#450a0a", borderRadius: 8,
                        fontSize: 13, color: "#f87171", marginBottom: 8 }}>{ollamaError}</div>
        )}
        {ollamaStatus === "done" && (
          <div style={{ padding: "10px 14px", background: "#052e16", borderRadius: 8,
                        fontSize: 13, color: "#4ade80", marginBottom: 8 }}>
            Behavior applied. Voice identity preserved.
          </div>
        )}
        {behaviorPrompt.trim() && (
          <button disabled={ollamaStatus === "loading"}
            onClick={async () => {
              setOllamaStatus("loading"); setOllamaError("");
              try {
                const callTtsType = form.is_fixed ? form.tts_type : ttsTypeForLangs(form.lang_codes);
                const res = await backendApi.summarizePersona({
                  raw_prompt: behaviorPrompt.trim(),
                  tts_type: callTtsType,
                });
                setForm(f => ({ ...f, custom_style: res.style, custom_speed: res.speed_desc }));
                setOllamaStatus("done");
              } catch (err) {
                setOllamaStatus("error");
                setOllamaError(err.message || "Ollama request failed.");
              }
            }}
            style={{ background: ollamaStatus === "loading" ? "#374151" : "#7c3aed",
                     color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px",
                     cursor: ollamaStatus === "loading" ? "not-allowed" : "pointer",
                     fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
            {ollamaStatus === "loading" ? "Analyzing..." : "Apply Behavior via AI"}
          </button>
        )}

        {sectionLabel("Preview Playback")}
        <textarea value={previewText}
          onChange={e => setPreviewText(e.target.value)}
          rows={2}
          placeholder="Type something to hear how this avatar sounds..."
          style={{ width: "100%", background: "#1f2937", border: "1px solid #374151",
                   borderRadius: 6, padding: "8px 12px", color: "#f9fafb",
                   fontSize: 13, resize: "vertical", boxSizing: "border-box", marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <button disabled={!previewText.trim() || previewStatus === "loading"}
            onClick={handlePreview}
            style={{ background: previewStatus === "loading" ? "#374151" : "#0ea5e9",
                     color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px",
                     cursor: (!previewText.trim() || previewStatus === "loading") ? "not-allowed" : "pointer",
                     fontWeight: 600, fontSize: 13 }}>
            {previewStatus === "loading" ? "Generating..." : previewStatus === "playing" ? "Regenerate" : "▶ Preview"}
          </button>
          {previewStatus === "playing" && (
            <button onClick={stopPreview}
              style={{ background: "#374151", color: "#9ca3af", border: "none",
                       borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>
              ■ Stop
            </button>
          )}
          {prevAudioUrl.current && previewStatus !== "loading" && previewStatus !== "playing" && (
            <button onClick={handleReplay}
              style={{ background: "#10b981", color: "#fff", border: "none",
                       borderRadius: 8, padding: "8px 18px", cursor: "pointer",
                       fontWeight: 600, fontSize: 13 }}>
              🔄 Replay
            </button>
          )}
        </div>
        {previewStatus === "error" && (
          <div style={{ fontSize: 12, color: "#f87171", marginBottom: 4 }}>{previewError}</div>
        )}
        {previewStatus === "playing" && prevAudioUrl.current && (
          <div style={{ fontSize: 12, color: "#4ade80" }}>Playing... (audio saved to session)</div>
        )}

        {sectionLabel("Avatar Color")}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {AVATAR_COLORS.map(c => (
            <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
              style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: "none",
                       cursor: "pointer", outline: form.color === c ? "2px solid #fff" : "none" }} />
          ))}
        </div>

        {/* Removed redundant Voice Cloning section for fixed voices */}

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

// ─── Main Page ────────────────────────────────────────────────────
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
    const p = {
      id: Date.now(), name: "new_persona", display_name: "New Agent",
      lang_codes: ["en"], pitch_shift: 0, speed_factor: 1.0,
      tts_description: "Custom Voice Cloned Agent",
      cloning_enabled: true, clone_ref_audio: null, clone_voice_name: "My Cloned Agent",
      color: AVATAR_COLORS[personas.length % AVATAR_COLORS.length],
      avatar_emoji: "🎙️", custom_style: null, custom_speed: null,
      is_fixed: false, clone_file_obj: null,
    };
    setPersonas(ps => [...ps, p]);
    setEditing(p);
  }, [personas]);

  return (
    <div style={{ padding: 24, color: "#f9fafb", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Avatar Manager</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            Configure voice agent personas — TTS backend auto-selected by language
          </p>
        </div>
        <button onClick={handleAdd}
          style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8,
                   padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
          + New Persona
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Personas", value: personas.length,                                       color: "#4f46e5" },
          { label: "Cloned Voices",  value: personas.filter(p => p.cloning_enabled).length,        color: "#a855f7" },
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
