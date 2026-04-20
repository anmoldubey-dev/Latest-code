import React, { useState } from "react";
import { Btn, FlatTabs } from "../../components/dashboard/UI";

// ===== TOOLS PAGE =====
// Empty state for custom tools/integrations

const ToolsPage = () => {
  const [tab, setTab] = useState("TOOLS");
  return (
    <div style={{ padding: "36px 42px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h2 style={{ fontSize: 28, fontWeight: 800 }}>Tools</h2>
          <span
            style={{
              fontSize: 10,
              padding: "3px 10px",
              borderRadius: 20,
              background: "var(--purl)",
              color: "var(--pur2)",
              border: "1px solid var(--bdr2)",
              fontWeight: 700,
            }}
          >
            BETA
          </span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Btn variant="secondary">🔑 Secrets</Btn>
          <Btn>+ Create New Tool</Btn>
        </div>
      </div>
      <FlatTabs
        tabs={["TOOLS", "CONNECTIONS", "INTEGRATIONS", "ANALYTICS"]}
        active={tab}
        onChange={setTab}
      />

      {/* Quick actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          {
            ico: "+",
            t: "New Tool",
            d: "Create a new custom or integration-based tool",
          },
          {
            ico: "⊞",
            t: "Explore Integrations",
            d: "Browse available integrations to build tools with",
          },
          {
            ico: "⊡",
            t: "Legacy Tools (Deprecated)",
            d: "Legacy tools do not support variable mapping.",
          },
        ].map((c) => (
          <div
            key={c.t}
            style={{
              background: "var(--card)",
              border: "1px solid var(--bdr)",
              borderRadius: 14,
              padding: 22,
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--pur)";
              e.currentTarget.style.boxShadow = "0 4px 20px var(--purgl)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--bdr)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--elev)",
                border: "1px solid var(--bdr)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--pur2)",
                flexShrink: 0,
              }}
            >
              {c.ico}
            </div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>
                {c.t}
              </div>
              <div style={{ fontSize: 13, color: "var(--txt2)" }}>{c.d}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--card)",
          border: "1px solid var(--bdr)",
          borderRadius: 10,
          padding: "4px 16px",
          marginBottom: 16,
        }}
      >
        <span style={{ color: "var(--muted)", fontSize: 16 }}>⌕</span>
        <input
          type="text"
          placeholder="Search tools..."
          className="fi"
          style={{
            background: "transparent",
            border: "none",
            padding: "8px 0",
          }}
        />
      </div>

      {/* Empty state */}
      <div
        style={{
          border: "1px dashed var(--bdr)",
          borderRadius: 16,
          minHeight: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--card)",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>
            No tools created
          </p>
          <p style={{ fontSize: 14, color: "var(--txt2)", marginBottom: 20 }}>
            Get started by creating your first custom tool.
          </p>
          <Btn style={{ padding: "12px 28px" }}>Create Tool</Btn>
        </div>
      </div>
    </div>
  );
};

export default ToolsPage;
