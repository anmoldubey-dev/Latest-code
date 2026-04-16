import React, { useState } from "react";
import { Btn, TabBar, EmptyState } from "../../components/dashboard/UI";

// sample voice data that powers the voice list
const VOICES_DATA = [
  {
    name: "Priyamvada",
    gen: "Female",
    desc: "Indian female voice.",
    flag: "🇮🇳",
    tags: ["Beige Clone V2", "Bland Curated", "female", "indian"],
  },
  {
    name: "Angela",
    gen: "Female",
    desc: "Soft-spoken American Female.",
    flag: "🇺🇸",
    tags: ["Beige Clone V2", "Bland Curated", "female"],
  },
];

// ===== VOICES PAGE =====
// Voice library with search, play controls

const VoicesPage = () => {
  const [tab, setTab] = useState("Curated Voices");
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState(null); // Currently playing voice

  const filtered = search
    ? VOICES_DATA.filter(
        (v) =>
          v.name.toLowerCase().includes(search.toLowerCase()) ||
          v.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : VOICES_DATA;

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
        <h2 style={{ fontSize: 28, fontWeight: 800 }}>Voices</h2>
        <div style={{ display: "flex", gap: 12 }}>
          <Btn variant="secondary">Customize TTS Text</Btn>
          <Btn>+ Create new voice</Btn>
        </div>
      </div>
      <TabBar
        tabs={["Curated Voices", "Voice Studio", "TTS Docs"]}
        active={tab}
        onChange={setTab}
        style={{ maxWidth: 420, marginBottom: 24 }}
      />

      {tab === "Curated Voices" && (
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 5 }}>
            Curated Voices ({VOICES_DATA.length})
          </h3>
          <p style={{ fontSize: 14, color: "var(--txt2)", marginBottom: 20 }}>
            Handpicked voices tailored for professional use cases.
          </p>

          {/* Search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--card)",
              border: "1px solid var(--bdr)",
              borderRadius: 10,
              padding: "8px 16px",
              marginBottom: 20,
            }}
          >
            <span style={{ color: "var(--muted)", fontSize: 16 }}>⌕</span>
            <input
              type="text"
              placeholder="Search Voices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="fi"
              style={{
                background: "transparent",
                border: "none",
                padding: "7px 0",
              }}
            />
          </div>

          {/* Voice list */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "var(--card)",
              border: "1px solid var(--bdr)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {filtered.map((v, i) => (
              <div
                key={v.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 22px",
                  borderBottom:
                    i < filtered.length - 1 ? "1px solid var(--bdr)" : "none",
                  transition: "background 0.18s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--purl)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,var(--pur),var(--acc))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {v.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 3,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700 }}>
                      {v.flag} {v.name}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--txt2)" }}>
                      {v.gen}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: "var(--grnl)",
                        color: "var(--grn)",
                        fontWeight: 700,
                        border: "1px solid rgba(0,212,160,0.2)",
                      }}
                    >
                      V2
                    </span>
                  </div>
                  {v.desc && (
                    <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                      {v.desc}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 5,
                    flexWrap: "wrap",
                    maxWidth: 380,
                  }}
                >
                  {v.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 10,
                        padding: "3px 10px",
                        borderRadius: 12,
                        background: "var(--purl)",
                        color: "var(--pur2)",
                        border: "1px solid var(--bdr2)",
                        fontWeight: 600,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <Btn variant="ghost" style={{ fontSize: 13 }}>
                    ⊡
                  </Btn>
                  <button
                    onClick={() =>
                      setPlaying((p) => (p === v.name ? null : v.name))
                    }
                    style={{
                      background:
                        playing === v.name ? "var(--purl)" : "var(--elev)",
                      border: `1px solid ${
                        playing === v.name ? "var(--pur)" : "var(--bdr2)"
                      }`,
                      color: playing === v.name ? "var(--pur2)" : "var(--txt)",
                      borderRadius: 8,
                      padding: "8px 18px",
                      fontFamily: "'Syne',sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      minWidth: 88,
                      transition: "all 0.2s",
                    }}
                  >
                    {playing === v.name ? "⏸ Stop" : "▶ Play"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab !== "Curated Voices" && (
        <EmptyState
          icon={tab === "Voice Studio" ? "◑" : "📄"}
          text={`${tab} coming soon.`}
        />
      )}
    </div>
  );
};

export default VoicesPage;
