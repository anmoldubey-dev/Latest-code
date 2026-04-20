import { useState, useRef } from "react";
import { Btn, Lbl, Field, EmptyState } from "../../components/dashboard/UI";

// ======================== Batch Call Orchestrator ========================
// BatchesPage -> Primary controller for bulk outbound telephony operations.
// Orchestrates the lifecycle of batch creation—from CSV-based recipient
// ingestion to persona configuration (Voice/Prompt) and routing logic.
// ||
// ||
// ||
// Functions -> BatchesPage()-> Root functional entry point for batch management:
// ||           |
// ||           |--- setView()-> [State Transition]: Toggles between historical 
// ||           |    registry (list) and the creation pipeline (create).
// ||           |
// ||           |--- handleFileUpload()-> [Sub-process]: Reactive hook for 
// ||           |    CSV telemetry ingestion and validation.
// ||           |
// ||           |--- setPathTab()-> [Logic Branch]: Modulates the configuration 
// ||           |    mode between static Prompts and dynamic Pathways.
// ||           |
// ||           └── (State Buffers Tree):
// ||                ├── batchName -> Identifies the operational node.
// ||                ├── voice -> Maps to hardware TTS engine assets.
// ||                └── prompt -> Injects LLM-specific context instructions.
// ||
// =========================================================================

const BatchesPage = () => {

  // ---------------------------------------------------------------
  // SECTION: STATE MANAGEMENT (OPERATIONAL BUFFERS)
  // ---------------------------------------------------------------

  const [view, setView] = useState("list");
  const [batchName, setBatchName] = useState("");
  const [voice, setVoice] = useState("Priyamvada");
  const [prompt, setPrompt] = useState("");
  const [chip, setChip] = useState("Telehealth");
  const [pathTab, setPathTab] = useState("Prompt");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const fileRef = useRef();

  const chips = [
    "Telehealth",
    "Small business",
    "Stadium venues",
    "Inbound sales",
  ];

  const voices = [
    "Elizabeth",
    "Priyamvada",
    "Angela",
    "Carl",
    "Josh",
    "Harry",
    "Maeve",
  ];

  // ---------------------------------------------------------------
  // SECTION: CONDITIONAL RENDER (HISTORICAL LIST VIEW)
  // ---------------------------------------------------------------

  if (view === "list")
    return (
      <div style={{ padding: "36px 42px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <h2 style={{ fontSize: 28, fontWeight: 800 }}>Batches</h2>
          <Btn onClick={() => setView("create")}>+ Create Batch Call</Btn>
        </div>
        <div
          style={{
            border: "2px dashed var(--bdr)",
            borderRadius: 16,
            minHeight: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>
              ⬡
            </div>
            <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              No batches yet
            </p>
            <p
              style={{ fontSize: 13.5, color: "var(--txt2)", marginBottom: 20 }}
            >
              Create your first batch to send calls at scale.
            </p>
            <Btn onClick={() => setView("create")} style={{ fontSize: 13 }}>
              Create Batch Call
            </Btn>
          </div>
        </div>
      </div>
    );

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (CREATION PIPELINE)
  // ---------------------------------------------------------------

  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "20px 36px",
          borderBottom: "1px solid var(--bdr)",
        }}
      >
        <button
          onClick={() => setView("list")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
          }}
        >
          ‹
        </button>
        <h2 style={{ fontSize: 24, fontWeight: 800 }}>Create Batch Call</h2>
      </div>

      <div style={{ padding: "28px 40px" }}>
        <div style={{ marginBottom: 20 }}>
          <Lbl>Batch Name</Lbl>
          <Field
            placeholder="Untitled Batch"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <Lbl>Upload Recipients</Lbl>
          <p style={{ fontSize: 13, color: "var(--txt2)", marginBottom: 12 }}>
            CSV must include a{" "}
            <strong style={{ color: "var(--pur2)" }}>phone_number</strong>{" "}
            column.
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--pur)" : "var(--bdr)"}`,
              borderRadius: 12,
              padding: "48px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "var(--purl)" : "var(--elev)",
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => setFile(e.target.files[0])}
            />
            {file ? (
              <p style={{ fontWeight: 600, color: "var(--grn)" }}>
                ✓ {file.name}
              </p>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                <p style={{ fontSize: 13 }}>Drag & drop or click to upload</p>
              </>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
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
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--grn)",
                boxShadow: "0 0 7px var(--grn)",
              }}
            />
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              style={{ flex: 1, background: "transparent", border: "none" }}
            >
              {voices.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", marginBottom: 14 }}>
          {["Prompt", "Pathway"].map((t) => (
            <button
              key={t}
              onClick={() => setPathTab(t)}
              style={{
                flex: 1,
                padding: "11px",
                border: "1px solid var(--bdr)",
                background: pathTab === t ? "var(--purl)" : "var(--elev)",
                color: pathTab === t ? "var(--pur2)" : "var(--txt2)",
                cursor: "pointer",
              }}
            >
              {t}
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
                    padding: "6px 14px",
                    borderRadius: 20,
                    border: `1px solid ${chip === c ? "var(--pur)" : "var(--bdr)"
                      }`,
                    background: chip === c ? "var(--purl)" : "var(--elev)",
                    cursor: "pointer",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Enter a prompt for the call"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--bdr)",
              }}
            />
          </>
        )}

        {pathTab === "Pathway" && (
          <EmptyState
            icon="⧖"
            text="No pathways found. Create one to use here."
          />
        )}
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          right: 0,
          left: 250,
          background: "var(--bg2)",
          borderTop: "1px solid var(--bdr)",
          padding: "13px 44px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={() => setView("list")}
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          ‹ Back
        </button>
        <Btn variant="secondary" style={{ padding: "12px 28px" }}>
          Review Batch
        </Btn>
      </div>
    </div>
  );
};

export default BatchesPage;