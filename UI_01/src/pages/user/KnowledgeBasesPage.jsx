import React, { useState } from "react";
import { Btn } from "../../components/dashboard/UI";

// ======================== Knowledge Base Orchestrator ========================
// KnowledgeBasesPage -> Central controller for Retrieval-Augmented Generation 
// (RAG) assets. Manages the lifecycle of vector stores, conversational memory, 
// and recursive learning loops designed to transform unresolved queries into 
// high-fidelity knowledge nodes.
// ||
// ||
// ||
// Functions -> KnowledgeBasesPage()-> Primary functional entry point for RAG management:
// ||           |
// ||           |--- setOuterTab()-> [State Transition]: Toggles between static 
// ||           |    Knowledge Bases and the dynamic Memory Store.
// ||           |
// ||           |--- setInnerTab()-> [State Transition]: Navigates sub-modules 
// ||           |    (Analytics vs Playground vs Registry).
// ||           |
// ||           └── setLoTab()-> [Logic Branch]: Orchestrates the filtering of 
// ||                automated Learning Opportunities (Beta).
// ||
// ==============================================================================

const KnowledgeBasesPage = () => {

  // ---------------------------------------------------------------
  // SECTION: STATE MANAGEMENT (NAVIGATION BUFFERS)
  // ---------------------------------------------------------------

  // Initialization -> OuterTab State: Manages the high-level operational domain
  const [outerTab, setOuterTab] = useState("KNOWLEDGE BASES");

  // Initialization -> InnerTab State: Manages the functional viewport within the domain
  const [innerTab, setInnerTab] = useState("HOME");

  // Initialization -> loTab State: Manages the telemetry filter for learning loops
  const [loTab, setLoTab] = useState("Open (0)");

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{ padding: "36px 42px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 22,
        }}
      >
        <h2 style={{ fontSize: 28, fontWeight: 800 }}>Knowledge Bases</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="amber" style={{ gap: 7, fontSize: 14 }}>
            + Upload
          </Btn>
          <Btn variant="secondary" style={{ gap: 7, fontSize: 13.5 }}>
            🧪 Test Knowledge Base
          </Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 3, marginBottom: 0 }}>
        {["KNOWLEDGE BASES", "MEMORY STORE"].map((t) => (
          <button
            key={t}
            onClick={() => setOuterTab(t)}
            style={{
              padding: "9px 18px",
              border: `1px solid ${outerTab === t ? "var(--bdr2)" : "var(--bdr)"
                }`,
              borderRadius: "8px 8px 0 0",
              background: outerTab === t ? "var(--card)" : "var(--elev)",
              color: outerTab === t ? "var(--txt)" : "var(--txt2)",
              fontFamily: "'Syne',sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.8px",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--bdr)",
          borderRadius: "0 14px 14px 14px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            borderBottom: "1px solid var(--bdr)",
          }}
        >
          {["HOME", "KNOWLEDGE", "ANALYTICS", "PLAYGROUND"].map((t) => (
            <button
              key={t}
              onClick={() => setInnerTab(t)}
              style={{
                padding: "14px",
                border: "none",
                borderRight: "1px solid var(--bdr)",
                background: innerTab === t ? "var(--purl)" : "transparent",
                color: innerTab === t ? "var(--pur2)" : "var(--txt2)",
                fontFamily: "'Syne',sans-serif",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "1px",
                transition: "all 0.18s",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ padding: "28px 32px" }}>
          {innerTab === "HOME" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 22,
                }}
              >
                <div>
                  <h3
                    style={{ fontSize: 20, fontWeight: 800, marginBottom: 5 }}
                  >
                    Knowledge Base
                  </h3>
                  <p style={{ fontSize: 13.5, color: "var(--txt2)" }}>
                    Transform unanswered questions into permanent knowledge
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Last 7 days", "Last 30 days"].map((t) => (
                    <button
                      key={t}
                      style={{
                        padding: "7px 14px",
                        border: "1px solid var(--bdr)",
                        borderRadius: 8,
                        background: "var(--elev)",
                        color: "var(--txt2)",
                        fontFamily: "'Syne',sans-serif",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid var(--bdr)",
                  borderRadius: 12,
                  padding: "40px 20px",
                  textAlign: "center",
                  marginBottom: 28,
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>
                  ⏱
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 7 }}>
                  No analytics data yet
                </p>
                <p style={{ fontSize: 13, color: "var(--txt2)" }}>
                  Analytics will appear once your knowledge base starts
                  receiving queries.
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <h3 style={{ fontSize: 19, fontWeight: 800 }}>
                    Learning Opportunities
                  </h3>
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
                <p
                  style={{
                    fontSize: 13.5,
                    color: "var(--txt2)",
                    marginBottom: 18,
                  }}
                >
                  Document once, answer forever. Each question becomes permanent
                  knowledge.
                </p>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: "flex", gap: 4 }}>
                    {["Open (0)", "Resolved (0)", "Irrelevant (0)"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setLoTab(t)}
                        style={{
                          padding: "8px 16px",
                          border: `1px solid ${loTab === t ? "var(--bdr2)" : "var(--bdr)"
                            }`,
                          borderRadius: 8,
                          background:
                            loTab === t ? "var(--purl)" : "var(--elev)",
                          color: loTab === t ? "var(--pur2)" : "var(--txt2)",
                          fontFamily: "'Syne',sans-serif",
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.18s",
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div
                    style={{ display: "flex", gap: 10, alignItems: "center" }}
                  >
                    <span style={{ fontSize: 13, color: "var(--txt2)" }}>
                      Filter:
                    </span>
                    <select
                      className="fi"
                      style={{ width: 180, padding: "7px 12px", fontSize: 13 }}
                    >
                      <option>All Knowledge Bases</option>
                    </select>
                    <span style={{ fontSize: 13, color: "var(--txt2)" }}>
                      Sort:
                    </span>
                    <select
                      className="fi"
                      style={{ width: 140, padding: "7px 12px", fontSize: 13 }}
                    >
                      <option>Most Recent</option>
                    </select>
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: "1px solid var(--bdr)",
                  borderRadius: 12,
                  padding: "44px 20px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.25 }}>
                  📖
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                  Great news! Your agent has answers for everything asked so
                  far.
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--txt2)",
                    lineHeight: 1.65,
                  }}
                >
                  Learning Opportunities appear when your agent encounters
                  questions it can't answer. These become chances to strengthen
                  your knowledge base and ensure your agent always has the right
                  information.
                </p>
              </div>
            </>
          )}

          {innerTab !== "HOME" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "60px 0",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.25 }}>
                {innerTab === "KNOWLEDGE"
                  ? "📚"
                  : innerTab === "ANALYTICS"
                    ? "◈"
                    : "🎮"}
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                {innerTab} coming soon
              </p>
              <p style={{ fontSize: 13, color: "var(--txt2)" }}>
                This section is under construction.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBasesPage;