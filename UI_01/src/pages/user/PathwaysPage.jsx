import React from "react";
import { Btn, FCard, SecTitle, EmptyState } from "../../components/dashboard/UI";

// ======================== Conversational Pathways Orchestrator ========================
// PathwaysPage -> Primary presentational node for managing branching conversation 
// logic. Facilitates organizational pathing through hierarchical folder management 
// and projects high-impact quick actions for pathway generation (Audio/JSON/Scratch).
// ||
// ||
// ||
// Functions -> PathwaysPage()-> Root functional container for the pathways segment:
// ||           |
// ||           |--- Sidebar Mapping: projects navigational nodes and folder actions.
// ||           |
// ||           |--- Action Grid: Dynamically renders feature-highlighted interaction 
// ||           |    nodes for creation and templates.
// ||           |
// ||           └── Hover Logic -> Interaction Handler: Manages depth-scaling (lerp) 
// ||                and border transitions for interactive FCard segments.
// ||
// ======================================================================================

const PathwaysPage = () => (
  <div style={{ display: "flex", height: "100vh" }}>

    {/* ---------------------------------------------------------------
        SECTION: NAVIGATION SIDEBAR
        --------------------------------------------------------------- */}
    <div
      style={{
        width: 290,
        flexShrink: 0,
        background: "var(--bg2)",
        borderRight: "1px solid var(--bdr)",
        padding: "20px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--elev)",
          border: "1px solid var(--bdr)",
          borderRadius: 10,
          padding: "4px 14px",
          marginBottom: 12,
        }}
      >
        <span style={{ color: "var(--muted)", fontSize: 16 }}>⌕</span>
        <input
          type="text"
          placeholder="Search for Pathways"
          className="field-input"
          style={{
            background: "transparent",
            border: "none",
            padding: "8px 0",
            flex: 1,
            fontSize: 13.5,
          }}
        />
      </div>
      {[
        ["⌂ All Pathways", true],
        ["📁 Folders ⌄", false],
      ].map(([lbl, active]) => (
        <button
          key={lbl}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 13px",
            borderRadius: 8,
            fontSize: 14,
            color: active ? "var(--txt)" : "var(--txt2)",
            cursor: "pointer",
            background: active ? "var(--purl)" : "transparent",
            border: "none",
            width: "100%",
            textAlign: "left",
            fontFamily: "'Syne',sans-serif",
            fontWeight: 500,
          }}
        >
          {lbl}
        </button>
      ))}
      <button
        style={{
          background: "transparent",
          border: "1px dashed var(--bdr)",
          color: "var(--muted)",
          borderRadius: 8,
          padding: "10px 15px",
          fontFamily: "'Syne',sans-serif",
          fontSize: 13,
          cursor: "pointer",
          margin: "4px 0",
          transition: "all 0.18s",
        }}
      >
        + New Folder
      </button>
      <div
        style={{
          marginTop: "auto",
          paddingTop: 18,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {["⚑ Get help with pathways ↗", "⌨ Developer docs ↗"].map((lbl) => (
          <a
            key={lbl}
            href="#"
            style={{
              fontSize: 13,
              color: "var(--muted)",
              textDecoration: "none",
              padding: "7px 13px",
              borderRadius: 6,
              display: "block",
            }}
          >
            {lbl}
          </a>
        ))}
      </div>
    </div>

    {/* ---------------------------------------------------------------
        SECTION: PRIMARY VIEWPORT (PATHWAY CANVAS)
        --------------------------------------------------------------- */}
    <div style={{ flex: 1, padding: "30px 38px", overflowY: "auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 28,
        }}
      >
        <Btn>+ Create Pathway</Btn>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 30,
        }}
      >
        {[
          {
            icon: "⚡",
            t: "Create a Pathway",
            d: "Build a new conversational pathway from scratch or generate one from audio, JSON, or a use case",
            feat: true,
          },
          {
            icon: "📋",
            t: "Start with a Template",
            d: "Duplicate our production-ready Car Rental template to use a complete pathway in action",
            feat: false,
          },
          {
            icon: "🌐",
            t: "Pathway Showcase",
            d: "Explore community pathways and gain inspiration from real-world implementations",
            feat: false,
          },
        ].map((c) => (
          <div
            key={c.t}
            style={{
              background: c.feat ? "var(--card-h)" : "var(--card)",
              border: `1px solid ${c.feat ? "var(--bdr2)" : "var(--bdr)"}`,
              borderRadius: 14,
              padding: 22,
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              borderTopColor: c.feat ? "var(--pur)" : "inherit",
              flexDirection: "column",
              gap: 12,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--pur)";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 20px var(--purgl)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = c.feat
                ? "var(--bdr2)"
                : "var(--bdr)";
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{ fontSize: 24 }}>{c.icon}</div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>
                {c.t}
              </div>
              <div
                style={{ fontSize: 13, color: "var(--txt2)", lineHeight: 1.55 }}
              >
                {c.d}
              </div>
            </div>
          </div>
        ))}
      </div>

      <FCard>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <SecTitle>All Pathways</SecTitle>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            0 pathways
          </span>
        </div>
        <EmptyState
          icon="⌕"
          text={"No pathways found\nCreate your first pathway to get started"}
        />
      </FCard>
    </div>
  </div>
);

export default PathwaysPage;