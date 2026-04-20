import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Btn, Lbl, Field, Textarea, TabBar, EmptyState } from "../../components/dashboard/UI";

// ══════════════════════════════════════════════════════════════════════════════
// REUSABLE COMPONENTS - Toggle switch & Select dropdown
// ══════════════════════════════════════════════════════════════════════════════

// Toggle switch component (checkbox styled as iOS toggle)
const Toggle = ({ checked, onChange }) => (
  <div
    onClick={() => onChange(!checked)}
    style={{
      width: 46,
      height: 26,
      borderRadius: 13,
      background: checked ? "var(--pur)" : "var(--bdr2)",
      position: "relative",
      cursor: "pointer",
      transition: "background 0.2s",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "white",
        position: "absolute",
        top: 3,
        left: checked ? 23 : 3,
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }}
    />
  </div>
);

// Select dropdown styled to match Field component
const SelectField = ({ value, onChange, options }) => (
  <select
    className="field-input"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width: "100%",
      background: "var(--elev)",
      border: "1px solid var(--bdr)",
      borderRadius: 10,
      padding: "11px 14px",
      fontSize: 13.5,
      fontFamily: "'Syne',sans-serif",
      color: "var(--txt)",
      cursor: "pointer",
    }}
  >
    {options.map((opt) => (
      <option key={opt} value={opt}>
        {opt}
      </option>
    ))}
  </select>
);

// ══════════════════════════════════════════════════════════════════════════════
// PANEL 1: MODEL SETTINGS
// Configure AI model, language, keywords, temperature, interruption
// ══════════════════════════════════════════════════════════════════════════════

const ModelSettingsPanel = () => {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [model, setModel] = useState("core"); // core | turbo
  const [language, setLanguage] = useState("English (Babel)");
  const [keywords, setKeywords] = useState(""); // Input field value
  const [kwList, setKwList] = useState([]); // Added keywords (pills)
  const [waitGreeting, setWaitGreeting] = useState(false);
  const [temp, setTemp] = useState(0.5); // Temperature 0-1
  const [interruption, setInterruption] = useState(500); // Interruption threshold (ms)
  const [words, setWords] = useState([]); // Pronunciation guide pairs

  // ─── Keyword Handler ────────────────────────────────────────────────────────
  // Add keyword when user presses Enter or comma
  const addKw = (e) => {
    if ((e.key === "Enter" || e.key === ",") && keywords.trim()) {
      e.preventDefault();
      setKwList((prev) => [...prev, keywords.trim()]);
      setKeywords("");
    }
  };

  return (
    <div
      className="fade-in"
      style={{
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          Model Selector - CORE vs TURBO (2-column grid)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {[
          {
            id: "core",
            icon: "✦",
            name: "CORE",
            badge: "Recommended",
            bc: "#ebebeb", // Badge background
            bt: "#444", // Badge text
            desc: "Best choice for most use cases. Reliable instruction-following, full feature support, and fast.",
          },
          {
            id: "turbo",
            icon: "🚀",
            name: "TURBO",
            badge: "Fast",
            bc: "#fff3cd",
            bt: "#856404",
            desc: "3x faster responses but less reliable for complex tasks. Use only when speed is critical.",
          },
        ].map((m) => (
          <div
            key={m.id}
            onClick={() => setModel(m.id)}
            style={{
              background: model === m.id ? "var(--purl)" : "var(--elev)",
              border: `2px solid ${model === m.id ? "var(--pur)" : "var(--bdr)"}`,
              borderRadius: 12,
              padding: "18px 20px",
              cursor: "pointer",
              transition: "all 0.2s",
              position: "relative",
            }}
          >
            {/* Header: icon + name + badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 9,
              }}
            >
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "1.2px" }}>
                {m.name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 9px",
                  borderRadius: 6,
                  background: m.bc,
                  color: m.bt,
                  fontWeight: 700,
                }}
              >
                {m.badge}
              </span>
            </div>

            {/* Description */}
            <p style={{ fontSize: 12.5, color: "var(--txt2)", lineHeight: 1.55 }}>
              {m.desc}
            </p>

            {/* Radio button indicator (top-right) */}
            <div
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `2px solid ${model === m.id ? "var(--pur)" : "var(--bdr2)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {model === m.id && (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "var(--pur)",
                  }}
                />
              )}
            </div>

            {/* Footer badge */}
            <div style={{ marginTop: 10, fontSize: 10, color: "var(--muted)" }}>
              BUILT BY <span style={{ color: "var(--pur2)", fontWeight: 700 }}>≈≈</span>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Language Selection
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <Lbl>Language</Lbl>
        <SelectField
          value={language}
          onChange={setLanguage}
          options={[
            "English (Babel)",
            "Spanish (Babel)",
            "French (Babel)",
            "German (Babel)",
            "Hindi (Babel)",
            "English (Basic)",
            "Spanish (Basic)",
          ]}
        />
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            marginTop: 7,
            lineHeight: 1.6,
          }}
        >
          Select your agent's language. Babel's speech recognition offers lower
          latency, higher accuracy, robust background noise handling, adaptive
          response timing, language switching and more. Use Basic options for use
          cases that require keyword boosting (coming soon to Babel).
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Keywords - Pill-based input with removable tags
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <Lbl>Keywords</Lbl>
        <div
          style={{
            background: "var(--elev)",
            border: "1px solid var(--bdr)",
            borderRadius: 10,
            padding: "10px 14px",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignItems: "center",
            minHeight: 48,
          }}
        >
          {/* Display added keywords as pills */}
          {kwList.map((kw, i) => (
            <span
              key={i}
              style={{
                background: "var(--purl)",
                color: "var(--pur2)",
                border: "1px solid var(--bdr2)",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 12,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {kw}
              {/* Remove button */}
              <span
                onClick={() => setKwList((prev) => prev.filter((_, j) => j !== i))}
                style={{ cursor: "pointer", opacity: 0.6, fontSize: 15 }}
              >
                ×
              </span>
            </span>
          ))}

          {/* Input field for new keywords */}
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={addKw}
            placeholder="Enter keywords"
            style={{
              flex: 1,
              minWidth: 100,
              background: "transparent",
              border: "none",
              padding: "2px 0",
              fontSize: 13,
              outline: "none",
              color: "var(--txt)",
            }}
          />
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
          These keywords will be boosted in the transcription engine — recommended
          for proper nouns or words that are frequently mis-transcribed. Press Enter
          or use commas to add multiple keywords.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Wait for Greeting Toggle
          ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
          paddingTop: 4,
          borderTop: "1px solid var(--bdr)",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>
            Wait for Greeting
          </div>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--txt2)",
              lineHeight: 1.55,
              maxWidth: 560,
            }}
          >
            If enabled, the agent will wait for the call recipient to speak first
            before responding. Note: This is processed separately from the AI's
            decision making, and overrides it.
          </p>
        </div>
        <Toggle checked={waitGreeting} onChange={setWaitGreeting} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Pronunciation Guide - Add word/pronunciation pairs
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>
          Pronunciation Guide
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--txt2)",
            marginBottom: 14,
            lineHeight: 1.55,
          }}
        >
          The pronunciation guide is an array of objects that guides the LLM on how
          to say specific words. This is great for situations with complicated terms
          or names.
        </p>

        {/* List of word/pronunciation pairs */}
        {words.map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <Field
              placeholder="Word"
              value={w.word}
              onChange={(e) =>
                setWords((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, word: e.target.value } : x))
                )
              }
            />
            <Field
              placeholder="Pronunciation"
              value={w.pron}
              onChange={(e) =>
                setWords((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, pron: e.target.value } : x))
                )
              }
            />
            {/* Remove button */}
            <Btn
              variant="ghost"
              onClick={() => setWords((prev) => prev.filter((_, j) => j !== i))}
              style={{ color: "var(--red)", flexShrink: 0 }}
            >
              ✕
            </Btn>
          </div>
        ))}

        {/* Add new word button */}
        <Btn
          variant="secondary"
          onClick={() => setWords((prev) => [...prev, { word: "", pron: "" }])}
          style={{ fontSize: 13 }}
        >
          + Add Word
        </Btn>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Temperature Slider (0-1)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700 }}>Temperature</div>
          <span className="mono" style={{ fontSize: 13, color: "var(--pur2)" }}>
            {temp}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={temp}
          onChange={(e) => setTemp(parseFloat(e.target.value))}
          style={{ width: "100%" }}
        />
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            marginTop: 8,
            lineHeight: 1.55,
          }}
        >
          A value between 0 and 1 that controls the randomness of the LLM. 0 will
          follow rules better, while 1 will be more creative.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Interruption Threshold Slider (0-2000ms)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            Interruption Threshold
          </div>
          <span className="mono" style={{ fontSize: 13, color: "var(--pur2)" }}>
            {interruption} ms
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={2000}
          step={50}
          value={interruption}
          onChange={(e) => setInterruption(parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            marginTop: 8,
            lineHeight: 1.55,
          }}
        >
          Adjusts how patient the AI is when waiting for the user to finish
          speaking. Lower values mean the AI will respond more quickly, while higher
          values mean the AI will wait longer before responding.
        </p>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PANEL 2: DISPATCH SETTINGS
// Transfer numbers, max duration, webhook, timezone, retry
// ══════════════════════════════════════════════════════════════════════════════

const DispatchPanel = () => {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [transfers, setTransfers] = useState([{ label: "", number: "" }]); // Transfer phone list
  const [maxDur, setMaxDur] = useState(30); // Max duration in minutes
  const [webhook, setWebhook] = useState("");
  const [tz, setTz] = useState("UTC");
  const [retry, setRetry] = useState(0); // Retry count (0-5)
  const [areaCode, setAreaCode] = useState("");

  return (
    <div
      className="fade-in"
      style={{
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          Transfer Numbers - Label/Number pairs
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <Lbl>Transfer Numbers</Lbl>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--txt2)",
            marginBottom: 14,
            lineHeight: 1.55,
          }}
        >
          Add phone numbers the agent can transfer calls to. The agent will use the
          label to decide when to transfer.
        </p>

        {/* List of transfer number pairs */}
        {transfers.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <Field
              placeholder="Label (e.g. Sales, Support)"
              value={t.label}
              onChange={(e) =>
                setTransfers((prev) =>
                  prev.map((x, j) =>
                    j === i ? { ...x, label: e.target.value } : x
                  )
                )
              }
            />
            <Field
              placeholder="+1 (555) 000-0000"
              value={t.number}
              onChange={(e) =>
                setTransfers((prev) =>
                  prev.map((x, j) =>
                    j === i ? { ...x, number: e.target.value } : x
                  )
                )
              }
            />
            {/* Remove button */}
            <Btn
              variant="ghost"
              onClick={() => setTransfers((prev) => prev.filter((_, j) => j !== i))}
              style={{ color: "var(--red)", flexShrink: 0 }}
            >
              ✕
            </Btn>
          </div>
        ))}

        {/* Add transfer button */}
        <Btn
          variant="secondary"
          onClick={() => setTransfers((prev) => [...prev, { label: "", number: "" }])}
          style={{ fontSize: 13 }}
        >
          + Add Transfer Number
        </Btn>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Max Duration Slider (1-120 minutes)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              Max Duration
            </div>
            <p style={{ fontSize: 12.5, color: "var(--txt2)" }}>
              Maximum call duration in minutes before the call is automatically
              ended.
            </p>
          </div>
          <span
            className="mono"
            style={{ fontSize: 14, color: "var(--pur2)", flexShrink: 0 }}
          >
            {maxDur} min
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={120}
          step={1}
          value={maxDur}
          onChange={(e) => setMaxDur(parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Webhook URL
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 20 }}>
        <Lbl>Webhook / Callback URL</Lbl>
        <Field
          placeholder="https://your-server.com/webhook"
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
        />
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
          Receives a POST request with call data when the call ends. Includes call
          transcripts, summaries, and custom analysis data.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Caller Area Code
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 20 }}>
        <Lbl>Caller Area Code</Lbl>
        <Field
          placeholder="e.g. 415"
          value={areaCode}
          onChange={(e) => setAreaCode(e.target.value)}
          style={{ maxWidth: 200 }}
        />
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          Attempt to use a phone number with the matching area code when
          dispatching.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Timezone Selection
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 20 }}>
        <Lbl>Timezone</Lbl>
        <SelectField
          value={tz}
          onChange={setTz}
          options={[
            "UTC",
            "America/New_York",
            "America/Chicago",
            "America/Los_Angeles",
            "Europe/London",
            "Asia/Kolkata",
            "Asia/Tokyo",
            "Australia/Sydney",
          ]}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Retry Count (increment/decrement buttons, 0-5)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 20 }}>
        <Lbl>Retry Count</Lbl>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
          <Btn
            variant="secondary"
            onClick={() => setRetry(Math.max(0, retry - 1))}
            style={{ padding: "8px 18px", fontSize: 18, minWidth: 42 }}
          >
            −
          </Btn>
          <span
            className="mono"
            style={{
              fontSize: 20,
              fontWeight: 700,
              minWidth: 32,
              textAlign: "center",
            }}
          >
            {retry}
          </span>
          <Btn
            variant="secondary"
            onClick={() => setRetry(Math.min(5, retry + 1))}
            style={{ padding: "8px 18px", fontSize: 18, minWidth: 42 }}
          >
            +
          </Btn>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          Number of times to retry the call if it fails or goes unanswered (max 5).
        </p>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PANEL 3: KNOWLEDGE
// Tools, knowledge bases, memory, pathways
// ══════════════════════════════════════════════════════════════════════════════

const KnowledgePanel = () => {
  const [pathways, setPathways] = useState([]); // Routing pathways

  return (
    <div
      className="fade-in"
      style={{
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          Tools and Knowledge Bases
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <Lbl>Tools and Knowledge Bases</Lbl>
        <SelectField
          value=""
          onChange={() => {}}
          options={[
            "Select tools and knowledge bases",
            "Knowledge Base — FAQ",
            "Knowledge Base — Products",
            "Tool — CRM Lookup",
            "Tool — Calendar Booking",
          ]}
        />

        {/* Empty state: no memory stores */}
        <div
          style={{
            border: "2px dashed var(--bdr)",
            borderRadius: 12,
            padding: "36px 20px",
            textAlign: "center",
            marginTop: 14,
          }}
        >
          <div style={{ fontSize: 30, marginBottom: 12 }}>🧠</div>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 7 }}>
            No memory stores configured
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--txt2)",
              marginBottom: 18,
              lineHeight: 1.55,
            }}
          >
            Memory stores allows your agent to remember past conversations and user
            information across sessions.
          </p>
          <Btn variant="secondary" style={{ fontSize: 13 }}>
            + Create Your First Memory
          </Btn>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Router Pathways - ID/Description pairs
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          Router Prompt with Pathways
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--txt2)",
            marginBottom: 16,
            lineHeight: 1.55,
          }}
        >
          Use the above Prompt input as a router which is capable of routing to
          multiple pathways. Add the pathway IDs below and explain when to use each
          one. For example, "Use this pathway when asked to book an appointment" or
          "Switch to this pathway for technical support."
        </p>

        {/* List of pathway ID/description pairs */}
        {pathways.map((pw, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <Field
              placeholder="Pathway ID"
              value={pw.id}
              onChange={(e) =>
                setPathways((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, id: e.target.value } : x))
                )
              }
            />
            <Field
              placeholder="When to use this pathway..."
              value={pw.desc}
              onChange={(e) =>
                setPathways((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x))
                )
              }
              style={{ flex: 2 }}
            />
            {/* Remove button */}
            <Btn
              variant="ghost"
              onClick={() => setPathways((prev) => prev.filter((_, j) => j !== i))}
              style={{ color: "var(--red)", flexShrink: 0 }}
            >
              ✕
            </Btn>
          </div>
        ))}

        {/* Add pathway button */}
        <Btn
          variant="secondary"
          onClick={() => setPathways((prev) => [...prev, { id: "", desc: "" }])}
          style={{ fontSize: 13 }}
        >
          + Add Pathway
        </Btn>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PANEL 4: AUDIO
// Background audio, noise cancellation, IVR, recording
// ══════════════════════════════════════════════════════════════════════════════

const AudioPanel = () => {
  const [bgAudio, setBgAudio] = useState("None");
  const [noise, setNoise] = useState(false);
  const [ivr, setIvr] = useState(false);
  const [record, setRecord] = useState(true);

  return (
    <div
      className="fade-in"
      style={{
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          Background Audio Selection
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <Lbl>Background Audio</Lbl>
        <SelectField
          value={bgAudio}
          onChange={setBgAudio}
          options={["None", "Office", "Café", "Nature", "White Noise", "City"]}
        />
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            marginTop: 7,
            lineHeight: 1.55,
          }}
        >
          Select an audio track that you'd like to play in the background during the
          call. The audio will play continuously when the agent isn't speaking, and
          is incorporated into its speech as well. Use this to provide a more
          natural, seamless, engaging experience for the conversation.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Toggle Options - Noise Cancellation, IVR, Recording
          ═══════════════════════════════════════════════════════════════════════ */}
      {[
        {
          label: "Noise Cancellation",
          desc: "Enable noise cancellation to reduce background noise during your call. This feature uses advanced algorithms to filter out unwanted sounds, ensuring clearer communication.",
          val: noise,
          set: setNoise,
        },
        {
          label: "IVR Mode",
          desc: "Enable IVR mode to allow the agent to interact with IVR systems more effectively. This prevents the agent from hanging up after long periods of silence and ensures the agent can correctly press buttons.",
          val: ivr,
          set: setIvr,
        },
        {
          label: "Record",
          desc: "To record your phone call, set to true. When your call completes, you can access through the recording_url field in the call details or your webhook.",
          val: record,
          set: setRecord,
        },
      ].map((item) => (
        <div
          key={item.label}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            paddingTop: 20,
            borderTop: "1px solid var(--bdr)",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>
              {item.label}
            </div>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--txt2)",
                lineHeight: 1.55,
                maxWidth: 580,
              }}
            >
              {item.desc}
            </p>
          </div>
          <Toggle checked={item.val} onChange={item.set} />
        </div>
      ))}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PANEL 5: VOICEMAIL
// Voicemail detection, action, message, answered-by
// ══════════════════════════════════════════════════════════════════════════════

const VoicemailPanel = () => {
  const [enabled, setEnabled] = useState(false);
  const [action, setAction] = useState("Hangup"); // Hangup | Ignore | Leave Message | Leave SMS
  const [message, setMessage] = useState("");
  const [answeredBy, setAnsweredBy] = useState(true);
  const [sensitive, setSensitive] = useState(false);

  // Action buttons data
  const actions = [
    ["Hangup", "✕"],
    ["Ignore", "⊘"],
    ["Leave Message", "💬"],
    ["Leave SMS", "✉"],
  ];

  return (
    <div
      className="fade-in"
      style={{
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          Enable Voicemail Behavior Toggle
          ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>
            Voicemail Behavior
          </div>
          <p style={{ fontSize: 12.5, color: "var(--txt2)", lineHeight: 1.55 }}>
            Enable voicemail behavior for the call.
          </p>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Voicemail Settings (disabled when not enabled)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          opacity: enabled ? 1 : 0.38,
          pointerEvents: enabled ? "all" : "none",
          transition: "opacity 0.2s",
          borderTop: "1px solid var(--bdr)",
          paddingTop: 22,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {/* Action Selection (4-column grid) */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>
            Voicemail Action
          </div>
          <p style={{ fontSize: 12.5, color: "var(--txt2)", marginBottom: 16 }}>
            This is processed separately from the AI's decision making, and
            overrides it.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 8,
            }}
          >
            {actions.map(([a, ico]) => (
              <button
                key={a}
                onClick={() => setAction(a)}
                style={{
                  padding: "13px 8px",
                  borderRadius: 10,
                  border: `1px solid ${action === a ? "var(--pur)" : "var(--bdr)"}`,
                  background: action === a ? "var(--purl)" : "var(--elev)",
                  color: action === a ? "var(--pur2)" : "var(--txt2)",
                  fontFamily: "'Syne',sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                }}
              >
                {ico} {a}
              </button>
            ))}
          </div>
        </div>

        {/* Voicemail Message Input */}
        <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 22 }}>
          <Lbl>Voicemail Message</Lbl>
          <Field
            placeholder="Hey, just checking in!"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <p
            style={{
              fontSize: 12,
              color: "var(--muted)",
              marginTop: 7,
              lineHeight: 1.55,
            }}
          >
            When the AI encounters a voicemail, it will leave this message after the
            beep and then immediately end the call.{" "}
            <strong style={{ color: "var(--org)" }}>Warning:</strong> if{" "}
            <em>ivr mode</em> is set to true or voicemail action is set to ignore,
            then this will still work for voicemails, but it will not hang up for
            IVR systems.
          </p>
        </div>

        {/* Toggle Options */}
        {[
          {
            label: "Answered By",
            desc: "If this is set to true, we process the audio from the start of the call to determine if it was answered by a human or a voicemail. In the call details or webhook response, you'll see the field with the value human, unknown or voicemail.",
            val: answeredBy,
            set: setAnsweredBy,
          },
          {
            label: "Sensitive Voicemail Detection",
            desc: "Enable sensitive voicemail detection to improve detection accuracy in edge cases. May increase latency at the start of the call.",
            val: sensitive,
            set: setSensitive,
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 20,
              paddingTop: 20,
              borderTop: "1px solid var(--bdr)",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>
                {item.label}
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--txt2)",
                  lineHeight: 1.55,
                  maxWidth: 580,
                }}
              >
                {item.desc}
              </p>
            </div>
            <Toggle checked={item.val} onChange={item.set} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE: SEND CALL
// Configure and dispatch individual calls
// ══════════════════════════════════════════════════════════════════════════════

const SendCallPage = () => {
  const navigate = useNavigate();

  // ─── State ──────────────────────────────────────────────────────────────────
  const [codeShown, setCodeShown] = useState(false); // Show/hide JSON preview
  const [activeTab, setActiveTab] = useState("Prompt"); // Prompt | Pathway
  const [chip, setChip] = useState("Telehealth"); // Selected template chip
  const [prompt, setPrompt] = useState("");
  const [firstSentence, setFirstSentence] = useState("");
  const [phone, setPhone] = useState("83053 41095");
  const [cc, setCc] = useState("🇮🇳 +91"); // Country code
  const [voice, setVoice] = useState("Elizabeth");
  const [openSec, setOpenSec] = useState(null); // Open accordion section

  // ─── Constants ──────────────────────────────────────────────────────────────
  
  // Template chips for quick prompt ideas
  const chips = ["Telehealth", "Small business", "Stadium venues", "Inbound sales"];

  // Accordion sections with their panels
  const SECS = [
    {
      id: "model",
      title: "Model Settings",
      desc: "Tune the model and language settings",
      panel: <ModelSettingsPanel />,
    },
    {
      id: "dispatch",
      title: "Dispatch Settings",
      desc: "Add transfer numbers and set duration",
      panel: <DispatchPanel />,
    },
    {
      id: "knowledge",
      title: "Knowledge",
      desc: "Add tools and pathways",
      panel: <KnowledgePanel />,
    },
    {
      id: "audio",
      title: "Audio",
      desc: "Fine tune the audio of the call",
      panel: <AudioPanel />,
    },
    {
      id: "voicemail",
      title: "Voicemail Behavior",
      desc: "Enable voicemail behavior for the call",
      panel: <VoicemailPanel />,
    },
    {
      id: "analysis",
      title: "Analysis",
      desc: "Specify the data you want to extract from the call",
      panel: null, // Not implemented yet
    },
    {
      id: "postcall",
      title: "Post Call",
      desc: "Configure post call summaries and events",
      panel: null, // Not implemented yet
    },
    {
      id: "advanced",
      title: "Advanced",
      desc: "Configure advanced settings for the call",
      panel: null, // Not implemented yet
    },
  ];

  // ─── JSON Payload ───────────────────────────────────────────────────────────
  // Generated from current form state
  const json = JSON.stringify(
    {
      phone_number: `${cc.split(" ")[1]}${phone}`,
      voice,
      task: prompt || "Enter a prompt...",
      model: "enhanced",
      first_sentence: firstSentence || null,
    },
    null,
    2
  );

  return (
    <div style={{ padding: "36px 42px" }}>
      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER - Title + Action Buttons
          ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>
          Send Call
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Btn variant="ghost" style={{ color: "var(--pur2)" }}>
            Read Docs
          </Btn>
          <Btn variant="secondary" onClick={() => setCodeShown((v) => !v)}>
            {"{ } "}
            {codeShown ? "Hide" : "Show"} Code
          </Btn>
          <Btn variant="ghost">JSON Mode</Btn>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN LAYOUT - Left (Form) + Right (JSON Preview)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: "flex",
          gap: 26,
          alignItems: "flex-start",
          paddingBottom: 90,
        }}
      >
        {/* ─── LEFT COLUMN: Form ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, maxWidth: 730 }}>
          {/* Section Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 5 }}>
              Basic
            </div>
            <div style={{ fontSize: 14, color: "var(--txt2)" }}>
              Enter a phone number and a prompt to get started
            </div>
          </div>

          {/* Phone Number Input (country code + number) */}
          <div style={{ marginBottom: 20 }}>
            <Lbl>Phone Number</Lbl>
            <div style={{ display: "flex" }}>
              {/* Country code dropdown */}
              <select
                className="field-input"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                style={{
                  width: 120,
                  borderRadius: "10px 0 0 10px",
                  borderRight: "none",
                }}
              >
                {["🇮🇳 +91", "🇺🇸 +1", "🇬🇧 +44", "🇦🇺 +61"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {/* Phone number input */}
              <input
                className="field-input"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                style={{ flex: 1, borderRadius: "0 10px 10px 0" }}
              />
            </div>
          </div>

          {/* Voice Selection */}
          <div style={{ marginBottom: 24 }}>
            <Lbl>Voice</Lbl>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "var(--elev)",
                border: "1px solid var(--bdr)",
                borderRadius: 10,
                padding: "12px 16px",
              }}
            >
              {/* Live indicator dot */}
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "var(--grn)",
                  boxShadow: "0 0 7px var(--grn)",
                  flexShrink: 0,
                }}
              />
              {/* Voice dropdown */}
              <select
                className="field-input"
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  flex: 1,
                }}
              >
                {[
                  "Elizabeth",
                  "Priyamvada",
                  "Angela",
                  "Carl",
                  "Josh",
                  "Harry",
                  "Maeve",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tab Bar: Prompt vs Pathway */}
          <TabBar
            tabs={["Prompt", "Pathway"]}
            active={activeTab}
            onChange={setActiveTab}
            style={{ marginBottom: 16 }}
          />

          {/* ─── PROMPT TAB ────────────────────────────────────────────────────── */}
          {activeTab === "Prompt" && (
            <div>
              {/* Template chips */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                {chips.map((c) => (
                  <button
                    key={c}
                    onClick={() => setChip(c)}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 20,
                      border: `1px solid ${chip === c ? "var(--pur)" : "var(--bdr)"}`,
                      background: chip === c ? "var(--purl)" : "var(--elev)",
                      color: chip === c ? "var(--pur2)" : "var(--txt2)",
                      fontFamily: "'Syne',sans-serif",
                      fontSize: 12.5,
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.18s",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Prompt textarea */}
              <div style={{ marginBottom: 20 }}>
                <Textarea
                  placeholder="Enter a prompt for the call"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 8,
                  }}
                >
                  <a
                    href="#"
                    style={{
                      color: "var(--pur2)",
                      fontSize: 13,
                      textDecoration: "none",
                    }}
                  >
                    Prompting Guide ↗
                  </a>
                </div>
              </div>

              {/* First sentence */}
              <div style={{ marginBottom: 20 }}>
                <Lbl>First Sentence</Lbl>
                <Field
                  placeholder="Enter a first sentence for the call"
                  value={firstSentence}
                  onChange={(e) => setFirstSentence(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ─── PATHWAY TAB ────────────────────────────────────────────────────── */}
          {activeTab === "Pathway" && (
            <EmptyState
              icon="⧖"
              text="No pathways found. Create one to use here."
              action="Create Pathway →"
              onAction={() => navigate("/user/pathways")}
            />
          )}

          {/* ─── ACCORDION: Advanced Settings ──────────────────────────────────── */}
          <div
            style={{
              border: "1px solid var(--bdr)",
              borderRadius: 14,
              overflow: "hidden",
              background: "var(--card)",
              marginTop: 8,
            }}
          >
            {SECS.map((sec, i) => (
              <div key={sec.id}>
                {/* Accordion header (clickable) */}
                <div
                  onClick={() => setOpenSec(openSec === sec.id ? null : sec.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "19px 24px",
                    borderBottom:
                      i < SECS.length - 1 || openSec === sec.id
                        ? "1px solid var(--bdr)"
                        : "none",
                    cursor: "pointer",
                    transition: "background 0.18s",
                    background: openSec === sec.id ? "var(--purl)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (openSec !== sec.id)
                      e.currentTarget.style.background = "rgba(124,92,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (openSec !== sec.id)
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14.5,
                        fontWeight: 700,
                        marginBottom: 3,
                        color: openSec === sec.id ? "var(--pur2)" : "var(--txt)",
                      }}
                    >
                      {sec.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                      {sec.desc}
                    </div>
                  </div>
                  {/* Arrow indicator */}
                  <span
                    style={{
                      color: openSec === sec.id ? "var(--pur2)" : "var(--muted)",
                      fontSize: 19,
                      transition: "transform 0.2s",
                      transform: openSec === sec.id ? "rotate(90deg)" : "none",
                    }}
                  >
                    ›
                  </span>
                </div>

                {/* Accordion panel (expanded when active) */}
                {openSec === sec.id &&
                  (sec.panel || (
                    <div
                      style={{
                        padding: "28px 32px",
                        color: "var(--txt2)",
                        fontSize: 14,
                      }}
                    >
                      <p style={{ color: "var(--muted)" }}>
                        Configure {sec.title.toLowerCase()} settings here.
                      </p>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* ─── RIGHT COLUMN: JSON Preview (sticky) ──────────────────────────────── */}
        {codeShown && (
          <div
            style={{
              width: 390,
              flexShrink: 0,
              background: "var(--bg2)",
              border: "1px solid var(--bdr)",
              borderRadius: 16,
              overflow: "hidden",
              position: "sticky",
              top: 20,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderBottom: "1px solid var(--bdr)",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "var(--lbl)",
                }}
              >
                JSON Preview
              </span>
              <Btn
                variant="ghost"
                style={{ fontSize: 11 }}
                onClick={() => navigator.clipboard?.writeText(json)}
              >
                Copy
              </Btn>
            </div>

            {/* JSON code block */}
            <pre
              style={{
                padding: 20,
                fontSize: 12,
                lineHeight: 1.7,
                color: "var(--grn)",
                overflowX: "auto",
                maxHeight: 540,
                overflowY: "auto",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              {json}
            </pre>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          FOOTER - Fixed bottom bar with Send button
          ═══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          right: 0,
          left: 250, // Account for sidebar width
          background: "var(--bg2)",
          borderTop: "1px solid var(--bdr)",
          padding: "14px 44px",
          display: "flex",
          justifyContent: "flex-end",
          zIndex: 50,
        }}
      >
        <Btn style={{ fontSize: 16, padding: "14px 34px" }}>↗ Send Call</Btn>
      </div>
    </div>
  );
};

export default SendCallPage;