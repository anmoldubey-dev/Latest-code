import React, { useState } from "react";
import { Btn, Field, Lbl, Toggle } from "../../components/dashboard/UI";

// ===== WEB WIDGET PAGE =====
// Configure embeddable chat widget with live preview

const WebWidgetPage = () => {
  // State: settings
  const [settingsTab, setSettingsTab] = useState("SETTINGS"); // SETTINGS | DIMENSIONS | CUSTOM COMPONENTS
  const [widgetName, setWidgetName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [headerContent, setHeaderContent] = useState("Chat Support");
  const [hideFooter, setHideFooter] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [pathTab, setPathTab] = useState("Prompt"); // Prompt | Pathway
  const [chip, setChip] = useState("Telehealth");
  const [voice, setVoice] = useState("Elizabeth");
  const [domains, setDomains] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookMode, setWebhookMode] = useState("All Messages"); // All Messages | End Conversation Only
  const [timeout, setTimeout_] = useState("86400");
  const [warningTime, setWarningTime] = useState("60");
  const [warningMsg, setWarningMsg] = useState("");
  const [timeoutMsg, setTimeoutMsg] = useState("");

  // State: chat preview
  const [chatMsgs, setChatMsgs] = useState([
    { from: "agent", text: "Hi! How can I help you?" },
    { from: "user", text: "Hello" },
  ]);
  const [inputMsg, setInputMsg] = useState("");

  const chips = [
    "Telehealth",
    "Small business",
    "Stadium venues",
    "Inbound sales",
  ];

  const sendMsg = () => {
    if (!inputMsg.trim()) return;
    setChatMsgs((p) => [...p, { from: "user", text: inputMsg }]);
    setInputMsg("");
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Left: Configuration panel */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          borderRight: "1px solid var(--bdr)",
        }}
      >
        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 28px",
            borderBottom: "1px solid var(--bdr)",
          }}
        >
          <button
            style={{
              background: "none",
              border: "none",
              color: "var(--txt2)",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ‹
          </button>
          <span style={{ color: "var(--txt2)", fontSize: 14 }}>Web Widget</span>
          <span style={{ color: "var(--muted)", fontSize: 14 }}>/</span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>New Widget</span>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            padding: "10px 28px 0",
            borderBottom: "1px solid var(--bdr)",
          }}
        >
          {["SETTINGS", "DIMENSIONS", "CUSTOM COMPONENTS"].map((t) => (
            <button
              key={t}
              onClick={() => setSettingsTab(t)}
              style={{
                padding: "9px 16px",
                border: `1px solid ${
                  settingsTab === t ? "var(--bdr2)" : "transparent"
                }`,
                borderBottom: `2px solid ${
                  settingsTab === t ? "var(--pur)" : "transparent"
                }`,
                borderRadius: "8px 8px 0 0",
                background: settingsTab === t ? "var(--purl)" : "transparent",
                color: settingsTab === t ? "var(--pur2)" : "var(--txt2)",
                fontFamily: "'Syne',sans-serif",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.18s",
                letterSpacing: "0.8px",
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginBottom: -1,
              }}
            >
              {t === "CUSTOM COMPONENTS" && <span>🔒</span>}
              {t}
            </button>
          ))}
        </div>

        <div
          style={{
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 22,
          }}
        >
          {/* Widget Name */}
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>
              Widget Name
            </div>
            <p
              style={{ fontSize: 12.5, color: "var(--txt2)", marginBottom: 10 }}
            >
              A name to identify this widget in the dashboard.
            </p>
            <Field
              placeholder="My Widget"
              value={widgetName}
              onChange={(e) => setWidgetName(e.target.value)}
            />
          </div>

          {/* Code Snippet */}
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>
              Code Snippet
            </div>
            <p
              style={{ fontSize: 12.5, color: "var(--txt2)", marginBottom: 12 }}
            >
              Copy the code snippet below and add it to the header of your
              website.
            </p>
            <div
              style={{
                background: "#0a0a1a",
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid var(--bdr)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "10px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <button
                  style={{
                    background: "none",
                    border: "none",
                    color: "#aaa",
                    fontSize: 12.5,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  Copy Code 📋
                </button>
              </div>
              <div style={{ padding: "30px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#ccc",
                    marginBottom: 4,
                  }}
                >
                  Widget Not Saved
                </p>
                <p style={{ fontSize: 12, color: "#666" }}>
                  Save your widget configuration to get the embed code
                </p>
              </div>
            </div>
          </div>

          {/* Prompt / Pathway */}
          <div>
            <div style={{ display: "flex", marginBottom: 14 }}>
              {["Prompt", "Pathway"].map((t) => (
                <button
                  key={t}
                  onClick={() => setPathTab(t)}
                  style={{
                    flex: 1,
                    padding: "11px",
                    border: `1px solid var(--bdr)`,
                    borderRadius:
                      t === "Prompt" ? "10px 0 0 10px" : "0 10px 10px 0",
                    background: pathTab === t ? "var(--purl)" : "var(--elev)",
                    color: pathTab === t ? "var(--pur2)" : "var(--txt2)",
                    fontFamily: "'Syne',sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                  }}
                >
                  {t === "Prompt" ? "≡" : "⧖"} {t}
                </button>
              ))}
            </div>
            {pathTab === "Prompt" && (
              <>
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
                        border: `1px solid ${
                          chip === c ? "var(--pur)" : "var(--bdr)"
                        }`,
                        background: chip === c ? "var(--purl)" : "var(--elev)",
                        color: chip === c ? "var(--pur2)" : "var(--txt2)",
                        fontFamily: "'Syne',sans-serif",
                        fontSize: 12.5,
                        cursor: "pointer",
                        transition: "all 0.18s",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <textarea
                  className="fi"
                  placeholder="Enter a prompt for the call"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  style={{
                    resize: "vertical",
                    minHeight: 120,
                    marginBottom: 8,
                  }}
                />
                <a
                  href="#"
                  style={{
                    color: "var(--pur2)",
                    fontSize: 12.5,
                    textDecoration: "none",
                  }}
                >
                  Prompting Guide ↗
                </a>
              </>
            )}
          </div>

          {/* Voice */}
          <div>
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
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "var(--grn)",
                  boxShadow: "0 0 7px var(--grn)",
                }}
              />
              <select
                className="fi"
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  flex: 1,
                }}
              >
                {["Elizabeth", "Priyamvada", "Angela", "Carl", "Josh"].map(
                  (v) => (
                    <option key={v}>{v}</option>
                  )
                )}
              </select>
            </div>
          </div>

          {/* Allowed Domains */}
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>
              Allowed Domains
            </div>
            <p
              style={{ fontSize: 12.5, color: "var(--txt2)", marginBottom: 12 }}
            >
              Only the selected domains will be able to connect to this widget.
            </p>
            {domains.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Field
                  placeholder="https://example.com"
                  value={d}
                  onChange={(e) =>
                    setDomains((p) =>
                      p.map((x, j) => (j === i ? e.target.value : x))
                    )
                  }
                />
                <Btn
                  variant="ghost"
                  onClick={() => setDomains((p) => p.filter((_, j) => j !== i))}
                  style={{ color: "var(--red)", flexShrink: 0 }}
                >
                  ✕
                </Btn>
              </div>
            ))}
            <Btn
              variant="secondary"
              onClick={() => setDomains((p) => [...p, ""])}
              style={{ fontSize: 13 }}
            >
              + Add Domain
            </Btn>
          </div>

          {/* Appearance accordion */}
          <div
            style={{
              border: "1px solid var(--bdr)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                background: "var(--elev)",
                cursor: "pointer",
              }}
            >
              <div>
                <div
                  style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}
                >
                  Appearance
                </div>
                <div style={{ fontSize: 12.5, color: "var(--txt2)" }}>
                  Customize the look and feel of your widget
                </div>
              </div>
              <span style={{ color: "var(--muted)", fontSize: 18 }}>⌄</span>
            </div>
            <div
              style={{
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}
                >
                  Widget Icon
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--txt2)",
                    marginBottom: 8,
                  }}
                >
                  Leave empty to use default icon
                </p>
                <Field
                  placeholder="Enter icon URL"
                  value={iconUrl}
                  onChange={(e) => setIconUrl(e.target.value)}
                />
              </div>
              <div>
                <div
                  style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}
                >
                  Header Content
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--txt2)",
                    marginBottom: 8,
                  }}
                >
                  Either text, or a URL to display an image
                </p>
                <Field
                  placeholder="Chat Support"
                  value={headerContent}
                  onChange={(e) => setHeaderContent(e.target.value)}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 20,
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}
                  >
                    Hide Footer
                  </div>
                  <p style={{ fontSize: 12, color: "var(--txt2)" }}>
                    Hide the Contact Centre Ai branding footer
                  </p>
                </div>
                <Toggle checked={hideFooter} onChange={setHideFooter} />
              </div>
              <div>
                <div
                  style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}
                >
                  Colors
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 16px",
                      border: "1px solid var(--bdr)",
                      borderRadius: 9,
                      background: "var(--elev)",
                      fontFamily: "'Syne',sans-serif",
                      fontSize: 12.5,
                      color: "var(--txt)",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#000",
                        border: "2px solid #555",
                      }}
                    />{" "}
                    User Message Color
                  </button>
                  <button
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 16px",
                      border: "1px solid var(--bdr)",
                      borderRadius: 9,
                      background: "var(--elev)",
                      fontFamily: "'Syne',sans-serif",
                      fontSize: 12.5,
                      color: "var(--txt)",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#000",
                        border: "2px solid #555",
                      }}
                    />{" "}
                    Button Color
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Webhook accordion */}
          <div
            style={{
              border: "1px solid var(--bdr)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                background: "var(--elev)",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>Webhook</div>
              <span style={{ color: "var(--muted)", fontSize: 18 }}>⌄</span>
            </div>
            <div
              style={{
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}
                >
                  Webhook URL
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--txt2)",
                    marginBottom: 8,
                  }}
                >
                  The widget thread data will be sent to this URL.
                </p>
                <Field
                  placeholder="https://your-server.com/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </div>
              <div>
                <div
                  style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}
                >
                  Webhook Mode
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["All Messages", "End Conversation Only"].map((m) => (
                    <button
                      key={m}
                      onClick={() => setWebhookMode(m)}
                      style={{
                        padding: "9px 16px",
                        border: `1px solid ${
                          webhookMode === m ? "var(--pur)" : "var(--bdr)"
                        }`,
                        borderRadius: 8,
                        background:
                          webhookMode === m ? "var(--purl)" : "var(--elev)",
                        color:
                          webhookMode === m ? "var(--pur2)" : "var(--txt2)",
                        fontFamily: "'Syne',sans-serif",
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.18s",
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <p
                  style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}
                >
                  {webhookMode === "All Messages"
                    ? "Webhook will be triggered for every message in the conversation."
                    : "Webhook will be triggered only when the conversation ends."}
                </p>
              </div>
            </div>
          </div>

          {/* Timeout accordion */}
          <div
            style={{
              border: "1px solid var(--bdr)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                background: "var(--elev)",
                cursor: "pointer",
              }}
            >
              <div>
                <div
                  style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}
                >
                  Timeout Settings
                </div>
                <div style={{ fontSize: 12.5, color: "var(--txt2)" }}>
                  Configure conversation timeout behavior and messages
                </div>
              </div>
              <span style={{ color: "var(--muted)", fontSize: 18 }}>⌄</span>
            </div>
            <div
              style={{
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}
                >
                  Timeout (seconds)
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--txt2)",
                    marginBottom: 8,
                  }}
                >
                  Duration of inactivity until ending the conversation. Default
                  is 24 hours (86400 seconds).
                </p>
                <Field
                  placeholder="86400"
                  value={timeout}
                  onChange={(e) => setTimeout_(e.target.value)}
                />
              </div>
              <div>
                <div
                  style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}
                >
                  Warning Time (seconds)
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--txt2)",
                    marginBottom: 8,
                  }}
                >
                  Duration of inactivity until agent sends a warning message.
                </p>
                <Field
                  placeholder="60"
                  value={warningTime}
                  onChange={(e) => setWarningTime(e.target.value)}
                />
              </div>
              <div>
                <div
                  style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}
                >
                  Warning Message
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--txt2)",
                    marginBottom: 8,
                  }}
                >
                  Message shown to the user before the conversation times out.
                </p>
                <Field
                  placeholder="Your session will expire soon due to inactivity."
                  value={warningMsg}
                  onChange={(e) => setWarningMsg(e.target.value)}
                />
              </div>
              <div>
                <div
                  style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}
                >
                  Timeout Message
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--txt2)",
                    marginBottom: 8,
                  }}
                >
                  Message shown when the conversation has timed out.
                </p>
                <Field
                  placeholder="This conversation has ended due to inactivity."
                  value={timeoutMsg}
                  onChange={(e) => setTimeoutMsg(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Btn
            variant="amber"
            style={{
              justifyContent: "center",
              padding: "13px",
              fontSize: 14.5,
            }}
          >
            Save widget
          </Btn>
        </div>
      </div>

      {/* Right: Live chat preview */}
      <div
        style={{
          width: 380,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--bdr)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Btn variant="secondary" style={{ fontSize: 12.5, gap: 6 }}>
            ⚙ Test settings
          </Btn>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-end",
            padding: 20,
          }}
        >
          <div
            style={{
              width: 340,
              background: "#f5f5f0",
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Chat header */}
            <div
              style={{
                background: "#f5f5f0",
                padding: "14px 18px",
                borderBottom: "1px solid #e0e0d8",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 14.5, fontWeight: 700, color: "#111" }}>
                {headerContent || "Chat Support"}
              </span>
              <button
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 18,
                  color: "#888",
                  cursor: "pointer",
                }}
              >
                ···
              </button>
            </div>
            {/* Messages */}
            <div
              style={{
                padding: "16px",
                minHeight: 260,
                maxHeight: 380,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                background: "#f5f5f0",
              }}
            >
              {chatMsgs.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent:
                      m.from === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "75%",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background: m.from === "user" ? "#1a1a1a" : "#e8e8e0",
                      color: m.from === "user" ? "#fff" : "#111",
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            {/* Input */}
            <div
              style={{
                padding: "12px 14px",
                borderTop: "1px solid #e0e0d8",
                background: "#f5f5f0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMsg()}
                  placeholder="Type your message..."
                  style={{
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    outline: "none",
                    fontFamily: "'Syne',sans-serif",
                    fontSize: 13.5,
                    color: "#333",
                  }}
                />
                <button
                  onClick={sendMsg}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "#1a1a1a",
                    border: "none",
                    color: "#fff",
                    fontSize: 16,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✈
                </button>
              </div>
              {!hideFooter && (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    color: "#aaa",
                    marginTop: 8,
                  }}
                >
                  ≡ Powered By Contact Centre Ai
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebWidgetPage;
