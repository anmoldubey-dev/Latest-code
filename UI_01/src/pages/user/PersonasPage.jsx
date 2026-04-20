import { useState } from "react";
import { Btn } from "../../components/dashboard/UI";

// ===== PERSONAS PAGE =====
const PersonasPage = () => {
  const [showIntro, setShowIntro] = useState(true);
  const [editingPersona, setEditingPersona] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [personaName, setPersonaName] = useState("Untitled Persona");
  const [editingName, setEditingName] = useState(false);
  const [personaRole, setPersonaRole] = useState("Customer Support");
  const [editingRole, setEditingRole] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("English (US)");
  const [bgNoiseExpanded, setBgNoiseExpanded] = useState(true);
  const [globalPrompt, setGlobalPrompt] = useState(
    "You are a friendly and helpful customer support agent."
  );
  const [waitForGreeting, setWaitForGreeting] = useState(false);
  const [interruptionThreshold, setInterruptionThreshold] = useState(50);
  const [routings, setRoutings] = useState([]);
  const [selectedKB, setSelectedKB] = useState("");
  const [selectedTool, setSelectedTool] = useState("");
  const [conversationalMemory, setConversationalMemory] = useState(false);
  const [summaryPrompt, setSummaryPrompt] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [previewMode, setPreviewMode] = useState("voice");
  const [isCalling, setIsCalling] = useState(false);

  const inp = {
    width: "100%",
    padding: "9px 13px",
    borderRadius: 8,
    border: "1px solid var(--bdr)",
    background: "var(--bg2)",
    color: "var(--txt)",
    fontSize: 13.5,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const lbl = {
    fontSize: 11.5,
    fontWeight: 700,
    color: "var(--lbl)",
    letterSpacing: "0.5px",
    marginBottom: 5,
    display: "block",
  };
  const sec = { marginBottom: 28 };
  const row = {
    background: "var(--bg2)",
    border: "1px solid var(--bdr)",
    borderRadius: 10,
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    cursor: "pointer",
  };

  if (showIntro)
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(4px)",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: "36px 40px",
            maxWidth: 520,
            width: "92%",
            boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
          }}
        >
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#111",
              marginBottom: 7,
            }}
          >
            Introducing Personas
          </h2>
          <p
            style={{
              fontSize: 13.5,
              color: "#666",
              lineHeight: 1.6,
              marginBottom: 28,
            }}
          >
            Your unified orchestration layer for managing conversations across
            all channels
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 30,
            }}
          >
            {[
              {
                icon: "⚡",
                title: "Unified Orchestration",
                desc: "Manage all your AI agents from one place",
                badge: null,
              },
              {
                icon: "🔀",
                title: "Conversational Pathways",
                desc: "Route conversations intelligently across flows",
                badge: null,
              },
              {
                icon: "🧠",
                title: "Self-Learning",
                desc: "Agents improve automatically over time",
                badge: "Coming Soon",
              },
              {
                icon: "🔐",
                title: "Intelligent Access",
                desc: "Role-based access to knowledge and tools",
                badge: null,
              },
            ].map((f) => (
              <div
                key={f.title}
                style={{
                  background: "#f8f8f8",
                  borderRadius: 12,
                  padding: "16px 18px",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    marginBottom: 5,
                  }}
                >
                  <span
                    style={{ fontSize: 13, fontWeight: 700, color: "#222" }}
                  >
                    {f.title}
                  </span>
                  {f.badge && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 7px",
                        borderRadius: 20,
                        background: "#fef3c7",
                        color: "#92400e",
                        fontWeight: 700,
                      }}
                    >
                      {f.badge}
                    </span>
                  )}
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "#777",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setShowIntro(false);
              setEditingPersona(true);
            }}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: 10,
              background: "#f59e0b",
              border: "none",
              color: "#fff",
              fontSize: 14.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Get Started
          </button>
        </div>
      </div>
    );

  if (!editingPersona)
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 34px",
            borderBottom: "1px solid var(--bdr)",
            background: "var(--bg2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800 }}>Personas</h2>
            <span
              style={{
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 20,
                background: "var(--purl)",
                color: "var(--pur2)",
                border: "1px solid var(--bdr2)",
                fontWeight: 700,
                letterSpacing: "1px",
              }}
            >
              BETA
            </span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost">Help</Btn>
            <Btn onClick={() => setEditingPersona(true)}>+ Create Persona</Btn>
          </div>
        </div>
        <div style={{ padding: "34px 40px" }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            Your Personas
          </h3>
          <p style={{ fontSize: 14, color: "var(--txt2)", marginBottom: 30 }}>
            Manage, customize, and evaluate your organization's agents
          </p>
          <div
            style={{
              border: "2px dashed var(--bdr)",
              borderRadius: 16,
              minHeight: 230,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = "var(--pur)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = "var(--bdr)")
            }
            onClick={() => setEditingPersona(true)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "var(--muted)",
                fontSize: 15.5,
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 24 }}>⊕</span> Create your first persona
            </div>
          </div>
        </div>
      </div>
    );

  const tabs = ["general", "behavior", "knowledge", "analysis"];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Breadcrumb bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 22px",
          borderBottom: "1px solid var(--bdr)",
          background: "var(--bg2)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13.5,
          }}
        >
          <span
            style={{ color: "var(--txt2)", cursor: "pointer" }}
            onClick={() => setEditingPersona(false)}
          >
            ← Personas
          </span>
          <span style={{ color: "var(--muted)" }}>/</span>
          <span style={{ fontWeight: 600 }}>{personaName}</span>
          <span
            style={{
              fontSize: 10,
              padding: "3px 10px",
              borderRadius: 20,
              background: "#dcfce7",
              color: "#166534",
              fontWeight: 700,
              letterSpacing: "0.5px",
              marginLeft: 4,
            }}
          >
            ✓ Production
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Btn variant="ghost" style={{ fontSize: 12.5, padding: "6px 13px" }}>
            ↺ Versions
          </Btn>
          <Btn variant="ghost" style={{ fontSize: 12.5, padding: "6px 13px" }}>
            ⬆ Dispatch
          </Btn>
          <button
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              background: "#f59e0b",
              border: "none",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--bdr)",
          background: "var(--bg2)",
          flexShrink: 0,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              padding: "12px 32px",
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: activeTab === t ? "var(--pur2)" : "var(--muted)",
              borderBottom:
                activeTab === t
                  ? "2px solid var(--pur2)"
                  : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {/* Split body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Editor */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 34px" }}>
          {activeTab === "general" && (
            <div>
              {/* Persona header */}
              <div
                style={{
                  ...row,
                  marginBottom: 24,
                  cursor: "default",
                  justifyContent: "flex-start",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "linear-gradient(135deg,#f97316,#dc2626)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}
                >
                  🤖
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {personaName}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Customer Support · less than a minute ago
                  </div>
                </div>
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--muted)",
                  }}
                >
                  <span>👍 0</span>
                  <span>👎 0</span>
                  <span>📞 0</span>
                  <span>↗ 1</span>
                </div>
              </div>
              <div style={sec}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                  Identity
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 16,
                  }}
                >
                  How and where your Persona appears to users.
                </p>
                {/* Avatar */}
                <div style={row}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: "linear-gradient(135deg,#f97316,#dc2626)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                      }}
                    >
                      🤖
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        Avatar
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        Click to upload a custom profile image
                      </div>
                    </div>
                  </div>
                </div>
                {/* Name */}
                <div style={row}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flex: 1,
                    }}
                  >
                    <span style={{ fontSize: 16, color: "var(--muted)" }}>
                      ≡
                    </span>
                    <div style={{ flex: 1 }}>
                      {editingName ? (
                        <input
                          value={personaName}
                          onChange={(e) => setPersonaName(e.target.value)}
                          onBlur={() => setEditingName(false)}
                          autoFocus
                          style={{ ...inp, padding: "4px 8px", fontSize: 13 }}
                        />
                      ) : (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {personaName}
                          </div>
                          <div
                            style={{ fontSize: 11.5, color: "var(--muted)" }}
                          >
                            Your display name
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      cursor: "pointer",
                      color: "var(--muted)",
                      fontSize: 14,
                    }}
                    onClick={() => setEditingName(true)}
                  >
                    ✏️
                  </span>
                </div>
                {/* Role */}
                <div style={row}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flex: 1,
                    }}
                  >
                    <span style={{ fontSize: 16, color: "var(--muted)" }}>
                      ≡
                    </span>
                    <div style={{ flex: 1 }}>
                      {editingRole ? (
                        <input
                          value={personaRole}
                          onChange={(e) => setPersonaRole(e.target.value)}
                          onBlur={() => setEditingRole(false)}
                          autoFocus
                          style={{ ...inp, padding: "4px 8px", fontSize: 13 }}
                        />
                      ) : (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {personaRole}
                          </div>
                          <div
                            style={{ fontSize: 11.5, color: "var(--muted)" }}
                          >
                            Describe the Persona's role and responsibilities
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      cursor: "pointer",
                      color: "var(--muted)",
                      fontSize: 14,
                    }}
                    onClick={() => setEditingRole(true)}
                  >
                    ✏️
                  </span>
                </div>
                {/* Voice */}
                <div style={row}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "#e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                      }}
                    >
                      🔊
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>June</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        American Female
                      </div>
                    </div>
                  </div>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>›</span>
                </div>
                {/* Language */}
                <div style={row}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flex: 1,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>🇺🇸</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {selectedLanguage}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        Choose your preferred language
                      </div>
                    </div>
                  </div>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    style={{
                      ...inp,
                      width: "auto",
                      padding: "4px 8px",
                      fontSize: 12,
                    }}
                  >
                    <option>English (US)</option>
                    <option>English (UK)</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                    <option>Hindi</option>
                  </select>
                </div>
                {/* Background noise */}
                <div
                  style={{
                    border: "1px solid var(--bdr)",
                    borderRadius: 10,
                    overflow: "hidden",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{ ...row, margin: 0, borderRadius: 0 }}
                    onClick={() => setBgNoiseExpanded(!bgNoiseExpanded)}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <span style={{ fontSize: 16 }}>🔈</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          Background noise
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                          Add ambient sounds to your persona's calls
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        color: "var(--muted)",
                        fontSize: 13,
                        transition: "0.2s",
                        transform: bgNoiseExpanded ? "rotate(90deg)" : "none",
                      }}
                    >
                      ›
                    </span>
                  </div>
                  {bgNoiseExpanded && (
                    <div
                      style={{
                        background: "#111",
                        padding: "12px 18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#fff",
                          }}
                        >
                          Office
                        </div>
                        <div style={{ fontSize: 11.5, color: "#999" }}>
                          Office-style soundscape. Includes faint typing,
                          chatter, clicks, and other office sounds.
                        </div>
                      </div>
                      <span style={{ color: "#aaa", fontSize: 13 }}>∧</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Modalities */}
              <div style={sec}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                  Modalities
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 16,
                  }}
                >
                  Utilize your Persona across all channels.
                </p>
                {[
                  {
                    icon: "📞",
                    title: "Voice & Calls",
                    desc: "Manage phone numbers and call settings",
                    btn: "Add to Inbound Numbers",
                  },
                  {
                    icon: "💬",
                    title: "SMS Messaging",
                    desc: "Manage SMS phone numbers and messaging settings",
                    btn: "Add SMS Numbers",
                  },
                  {
                    icon: "🌐",
                    title: "Web Widget (coming soon)",
                    desc: "Configure your persona's web widget",
                    btn: null,
                    disabled: true,
                  },
                ].map((m) => (
                  <div
                    key={m.title}
                    style={{ ...row, opacity: m.disabled ? 0.5 : 1 }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <span style={{ fontSize: 18, opacity: 0.7 }}>
                        {m.icon}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {m.title}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                          {m.desc}
                        </div>
                      </div>
                    </div>
                    {m.btn && !m.disabled && (
                      <button
                        style={{
                          padding: "7px 14px",
                          borderRadius: 7,
                          background: "#f59e0b",
                          border: "none",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {m.btn}
                      </button>
                    )}
                    {m.disabled && (
                      <div
                        style={{
                          width: 42,
                          height: 22,
                          borderRadius: 11,
                          background: "var(--bdr)",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            background: "#fff",
                            position: "absolute",
                            top: 2,
                            left: 2,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Policy */}
              <div style={sec}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                  Policy & Compliance
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 16,
                  }}
                >
                  Ensure your persona is secure and compliant with your
                  organization and/or state policies.
                </p>
                <div style={row}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <span style={{ fontSize: 16, opacity: 0.7 }}>🛡</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        Guard Rails
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        Monitor your agent for TCPA or other critical policy
                        violations
                      </div>
                    </div>
                  </div>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>›</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "behavior" && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                General Behavior
              </h3>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--txt2)",
                  marginBottom: 22,
                }}
              >
                Configure overall behaviors and key conversational settings.
              </p>
              <div
                style={{
                  border: "1px solid var(--bdr)",
                  borderRadius: 10,
                  overflow: "hidden",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    padding: "13px 18px",
                    background: "var(--bg2)",
                    borderBottom: "1px solid var(--bdr)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ fontSize: 16, color: "var(--muted)" }}>
                      ∑
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        Global Prompt
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        Describe the Persona's overall behaviors, personality,
                        and motivations.
                      </div>
                    </div>
                  </div>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>∧</span>
                </div>
                <div style={{ padding: "14px" }}>
                  <textarea
                    value={globalPrompt}
                    onChange={(e) => setGlobalPrompt(e.target.value)}
                    style={{
                      ...inp,
                      minHeight: 180,
                      resize: "vertical",
                      lineHeight: 1.6,
                    }}
                    placeholder="Describe the Persona's overall behaviors, personality, and motivations..."
                  />
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    border: "1px solid var(--bdr)",
                    borderRadius: 10,
                    padding: "14px 18px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        Wait for Greeting
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--muted)",
                          lineHeight: 1.4,
                          marginTop: 3,
                        }}
                      >
                        Only begin speaking after the recipient has said
                        something
                      </div>
                    </div>
                    <div
                      onClick={() => setWaitForGreeting(!waitForGreeting)}
                      style={{
                        width: 42,
                        height: 22,
                        borderRadius: 11,
                        background: waitForGreeting
                          ? "var(--pur2)"
                          : "var(--bdr)",
                        cursor: "pointer",
                        position: "relative",
                        transition: "background 0.2s",
                        flexShrink: 0,
                        marginLeft: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          background: "#fff",
                          position: "absolute",
                          top: 2,
                          left: waitForGreeting ? 22 : 2,
                          transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid var(--bdr)",
                    borderRadius: 10,
                    padding: "14px 18px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Interruption Threshold
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--pur2)",
                        background: "var(--purl)",
                        padding: "2px 8px",
                        borderRadius: 6,
                      }}
                    >
                      {interruptionThreshold}ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={500}
                    value={interruptionThreshold}
                    onChange={(e) => setInterruptionThreshold(+e.target.value)}
                    style={{ width: "100%", accentColor: "var(--pur2)" }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 10.5,
                      color: "var(--muted)",
                      marginTop: 4,
                    }}
                  >
                    <span>Lower values respond faster</span>
                    <span>Higher values wait longer</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                  Conversational Pathways
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 14,
                  }}
                >
                  Describe when the Persona should utilize pathways for specific
                  tasks and procedures.
                </p>
                <div
                  style={{
                    border: "2px dashed var(--bdr)",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  {routings.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--bdr)",
                      }}
                    >
                      <input
                        value={r.desc}
                        onChange={(e) => {
                          const n = [...routings];
                          n[i].desc = e.target.value;
                          setRoutings(n);
                        }}
                        placeholder="Describe when to use this pathway..."
                        style={{ ...inp, flex: 1, fontSize: 12.5 }}
                      />
                      <input
                        value={r.id}
                        onChange={(e) => {
                          const n = [...routings];
                          n[i].id = e.target.value;
                          setRoutings(n);
                        }}
                        placeholder="Pathway ID"
                        style={{ ...inp, width: 140, fontSize: 12.5 }}
                      />
                      <button
                        onClick={() =>
                          setRoutings(routings.filter((_, j) => j !== i))
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--muted)",
                          cursor: "pointer",
                          fontSize: 16,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setRoutings([...routings, { desc: "", id: "" }])
                    }
                    style={{
                      width: "100%",
                      padding: "13px",
                      background: "#111",
                      border: "none",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    + Add routing
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "knowledge" && (
            <div>
              <div style={sec}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                  Knowledge Base
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 16,
                  }}
                >
                  The sources and context and your Persona will have access to
                  at all times.
                </p>
                <div
                  style={{
                    border: "1px solid var(--bdr)",
                    borderRadius: 10,
                    padding: "28px",
                    textAlign: "center",
                    marginBottom: 14,
                    background: "var(--bg2)",
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--muted)",
                      marginBottom: 4,
                    }}
                  >
                    No knowledge bases connected yet.
                  </p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>
                    Connect knowledge bases from your library to give your
                    Persona access to specific information.
                  </p>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>Connect from library</label>
                  <select
                    style={inp}
                    value={selectedKB}
                    onChange={(e) => setSelectedKB(e.target.value)}
                  >
                    <option value="">🔍 Search knowledge bases...</option>
                    <option>Product FAQ</option>
                    <option>Company Policy Docs</option>
                    <option>Support Runbooks</option>
                  </select>
                </div>
                <Btn
                  variant="secondary"
                  style={{ fontSize: 12.5, padding: "7px 16px" }}
                >
                  Manage Knowledge Bases
                </Btn>
              </div>
              <div style={sec}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                  Tools
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 16,
                  }}
                >
                  External tools and integrations your Persona can use to
                  perform actions and retrieve information.
                </p>
                <div
                  style={{
                    border: "1px solid var(--bdr)",
                    borderRadius: 10,
                    padding: "28px",
                    textAlign: "center",
                    marginBottom: 14,
                    background: "var(--bg2)",
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--muted)",
                      marginBottom: 4,
                    }}
                  >
                    No tools connected yet.
                  </p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>
                    Connect tools from your library to give your Persona access
                    to external integrations and actions.
                  </p>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>Connect from library</label>
                  <select
                    style={inp}
                    value={selectedTool}
                    onChange={(e) => setSelectedTool(e.target.value)}
                  >
                    <option value="">🔍 Search tools...</option>
                    <option>CRM Lookup</option>
                    <option>Calendar Booking</option>
                    <option>Payment Processor</option>
                  </select>
                </div>
                <Btn
                  variant="secondary"
                  style={{ fontSize: 12.5, padding: "7px 16px" }}
                >
                  Manage Tools
                </Btn>
              </div>
              <div style={sec}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 3,
                  }}
                >
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>
                    Learning Opportunities
                  </h3>
                  <span
                    style={{
                      fontSize: 9,
                      padding: "2px 7px",
                      borderRadius: 20,
                      background: "#dbeafe",
                      color: "#1e40af",
                      fontWeight: 700,
                      letterSpacing: "0.5px",
                    }}
                  >
                    BETA
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 14,
                  }}
                >
                  Document answers once, available forever. Each answer becomes
                  permanent knowledge.
                </p>
                <div style={{ display: "flex", gap: 0, marginBottom: 14 }}>
                  {["Open (0)", "Resolved (0)", "Irrelevant (0)"].map(
                    (t, i) => (
                      <button
                        key={t}
                        style={{
                          padding: "7px 16px",
                          fontSize: 12.5,
                          fontWeight: 600,
                          border: "1px solid var(--bdr)",
                          background: i === 0 ? "var(--bg)" : "var(--bg2)",
                          cursor: "pointer",
                          color: "var(--txt)",
                          borderRadius:
                            i === 0
                              ? "7px 0 0 7px"
                              : i === 2
                              ? "0 7px 7px 0"
                              : "0",
                          marginLeft: i > 0 ? "-1px" : "0",
                        }}
                      >
                        {t}
                      </button>
                    )
                  )}
                </div>
                <div
                  style={{
                    border: "1px solid var(--bdr)",
                    borderRadius: 10,
                    padding: "36px",
                    textAlign: "center",
                    background: "var(--bg2)",
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 10 }}>📖</div>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}
                  >
                    All caught up!
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    Your agent has answers for everything asked so far. New
                    questions will appear here automatically.
                  </div>
                </div>
              </div>
              <div style={sec}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                  Memory
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 14,
                  }}
                >
                  Remember previous conversations across all calls per user, and
                  have context for future calls.
                </p>
                <div style={row}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <span style={{ fontSize: 16, opacity: 0.6 }}>ℹ</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        Conversational Memory
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        Store memory of all conversations automatically.
                      </div>
                    </div>
                  </div>
                  <div
                    onClick={() =>
                      setConversationalMemory(!conversationalMemory)
                    }
                    style={{
                      width: 42,
                      height: 22,
                      borderRadius: 11,
                      background: conversationalMemory
                        ? "var(--pur2)"
                        : "var(--bdr)",
                      cursor: "pointer",
                      position: "relative",
                      transition: "background 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        background: "#fff",
                        position: "absolute",
                        top: 2,
                        left: conversationalMemory ? 22 : 2,
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "analysis" && (
            <div>
              <div style={sec}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                  Post-Conversation Analysis
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 20,
                  }}
                >
                  Customize your automated reports and analysis.
                </p>
                <div
                  style={{
                    border: "1px solid var(--bdr)",
                    borderRadius: 10,
                    overflow: "hidden",
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      padding: "13px 18px",
                      background: "var(--bg2)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 15, opacity: 0.7 }}>≡</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        Generate Summary
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        Automatically create short summaries after each
                        conversation.
                      </div>
                    </div>
                    <span
                      style={{
                        marginLeft: "auto",
                        color: "var(--muted)",
                        fontSize: 13,
                      }}
                    >
                      ∧
                    </span>
                  </div>
                  <div style={{ padding: "14px" }}>
                    <textarea
                      value={summaryPrompt}
                      onChange={(e) => setSummaryPrompt(e.target.value)}
                      placeholder="Summarize the conversation between the agent and customer..."
                      style={{
                        ...inp,
                        minHeight: 120,
                        resize: "vertical",
                        lineHeight: 1.6,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div style={sec}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                  Data Extraction
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 16,
                  }}
                >
                  Specify what data to extract from conversations
                </p>
                <div
                  style={{
                    border: "1px solid var(--bdr)",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "13px 18px",
                      background: "var(--bg2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontFamily: "monospace",
                          color: "var(--muted)",
                        }}
                      >
                        {"{}"}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          Citation Schemas
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                          Extract specific information from calls or assess
                          subjective quality (Enterprise only).
                        </div>
                      </div>
                    </div>
                    <button
                      style={{
                        padding: "6px 13px",
                        borderRadius: 7,
                        background: "var(--bg)",
                        border: "1px solid var(--bdr)",
                        color: "var(--txt)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Manage Citations
                    </button>
                  </div>
                  <div style={{ padding: "12px 14px" }}>
                    <select style={{ ...inp, color: "var(--muted)" }}>
                      <option value="">Select citation schemas...</option>
                      <option>Lead Qualification Schema</option>
                      <option>Support Resolution Schema</option>
                      <option>Sales Outcome Schema</option>
                    </select>
                  </div>
                </div>
              </div>
              <div style={sec}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                  Webhook
                </h3>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--txt2)",
                    marginBottom: 16,
                  }}
                >
                  Override the webhook configuration in settings for this
                  Persona.
                </p>
                <div
                  style={{
                    border: "1px solid var(--bdr)",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "14px 18px",
                      borderBottom: "1px solid var(--bdr)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <label style={{ ...lbl, marginBottom: 0 }}>URL</label>
                      <button
                        style={{
                          fontSize: 12,
                          color: "var(--pur2)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        ⚡ Test Webhook
                      </button>
                    </div>
                    <p
                      style={{
                        fontSize: 11.5,
                        color: "var(--muted)",
                        marginBottom: 8,
                      }}
                    >
                      When the call ends, we'll send the call details in a POST
                      request to the URL you specify here.
                    </p>
                    <input
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://example.com/webhook"
                      style={inp}
                    />
                  </div>
                  <div style={{ padding: "14px 18px" }}>
                    <label style={lbl}>Events</label>
                    <p
                      style={{
                        fontSize: 11.5,
                        color: "var(--muted)",
                        marginBottom: 8,
                      }}
                    >
                      Specify which events to stream to the webhook during the
                      call.
                    </p>
                    <select style={{ ...inp, color: "var(--muted)" }}>
                      <option value="">Select webhook events...</option>
                      <option>call.started</option>
                      <option>call.ended</option>
                      <option>transfer.initiated</option>
                      <option>voicemail.detected</option>
                      <option>tool.called</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preview panel */}
        <div
          style={{
            width: 280,
            borderLeft: "1px solid var(--bdr)",
            background: "var(--bg2)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--bdr)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}
            >
              Preview
            </span>
            <div style={{ display: "flex", gap: 0 }}>
              {["Voice", "SMS"].map((m, i) => (
                <button
                  key={m}
                  onClick={() => setPreviewMode(m.toLowerCase())}
                  style={{
                    padding: "5px 13px",
                    fontSize: 11.5,
                    fontWeight: 600,
                    border: "1px solid var(--bdr)",
                    background:
                      previewMode === m.toLowerCase()
                        ? "var(--bg)"
                        : "transparent",
                    cursor: "pointer",
                    color:
                      previewMode === m.toLowerCase()
                        ? "var(--txt)"
                        : "var(--muted)",
                    borderRadius: i === 0 ? "6px 0 0 6px" : "0 6px 6px 0",
                    marginLeft: i > 0 ? "-1px" : "0",
                  }}
                >
                  {m === "Voice" ? "🔊 Voice" : "💬 SMS"}
                </button>
              ))}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                height: 48,
              }}
            >
              {[0.3, 0.6, 1, 0.7, 0.9, 0.4, 0.8, 0.5, 1, 0.6, 0.3, 0.8].map(
                (h, i) => (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      borderRadius: 2,
                      background: "var(--bdr)",
                      height: `${h * 40}px`,
                    }}
                  />
                )
              )}
            </div>
            <div
              style={{ fontSize: 13.5, fontWeight: 600, color: "var(--muted)" }}
            >
              {personaName}
            </div>
          </div>
          <div
            style={{
              padding: "14px 18px",
              borderTop: "1px solid var(--bdr)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: "var(--bg)",
                border: "1px solid var(--bdr)",
                cursor: "pointer",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              🔇
            </button>
            <button
              onClick={() => setIsCalling(!isCalling)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                background: isCalling ? "#ef4444" : "#22c55e",
                border: "none",
                cursor: "pointer",
                fontSize: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(34,197,94,0.4)",
              }}
            >
              {isCalling ? "📵" : "📞"}
            </button>
            <button
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: "var(--bg)",
                border: "1px solid var(--bdr)",
                cursor: "pointer",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ⚙
            </button>
          </div>
          <div style={{ padding: "8px 18px 14px", textAlign: "center" }}>
            <button
              style={{
                fontSize: 11.5,
                color: "var(--pur2)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ↗ Testing Draft Version
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonasPage;
