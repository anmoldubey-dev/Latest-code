import React, { useState } from "react";
import { Btn, TabBar, FCard, Lbl } from "../../components/dashboard/UI";

// pricing plans used by the billing page
const PLANS = [
  {
    name: "Starter",
    price: "₹4,116 /mo",
    cur: false,
    col: "#7c5cff",
    feats: {
      "AI Voice Agent": "1 AI Voice Agent",
      Minutes: "500 minutes/month",
      Analytics: "Basic analytics dashboard",
      Support: "Email support",
      Models: "Standard voice models",
    },
    cta: "Get Started",
  },
  {
    name: "Pro",
    price: "₹13,716 /mo",
    cur: true,
    col: "#7c5cff",
    feats: {
      "AI Voice Agent": "Up to 3 AI Voice Agents",
      Minutes: "2,500 minutes/month",
      Analytics: "Advanced analytics dashboard",
      Support: "Priority email support",
      Models: "All voice models",
    },
    cta: "Current Plan",
  },
  {
    name: "Enterprise",
    price: "Custom",
    cur: false,
    col: "#7c5cff",
    feats: {
      "AI Voice Agent": "Unlimited agents",
      Minutes: "Unlimited",
      Analytics: "Custom analytics solutions",
      Support: "Dedicated support",
      Models: "Custom and premium voices",
    },
    cta: "Contact Us",
  },
];

// ===== BILLING PAGE =====
// Plan cards, usage limits, credit balance

const BillingPage = () => {
  const [tab, setTab] = useState("Plan & Limits");
  return (
    <div style={{ padding: "36px 42px" }}>
      <h2
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "-0.5px",
          marginBottom: 24,
        }}
      >
        Billing & Credits
      </h2>
      <TabBar
        tabs={["Plan & Limits", "Purchase Credits", "Billing Settings"]}
        active={tab}
        onChange={setTab}
        style={{ maxWidth: 500, marginBottom: 28 }}
      />

      {/* Usage limits */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 24,
        }}
      >
        {[
          ["Hourly Limit", "0 / 100", 0],
          ["Daily Limit", "0 / 100", 0],
        ].map(([lbl, val, pct]) => (
          <FCard key={lbl} style={{ padding: "18px 24px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Lbl>{lbl}</Lbl>
              <span
                className="mono"
                style={{ fontSize: 13, color: "var(--muted)" }}
              >
                {val}
              </span>
            </div>
            <div
              style={{
                height: 5,
                background: "var(--elev)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: "linear-gradient(90deg,var(--pur),var(--acc))",
                  borderRadius: 3,
                }}
              />
            </div>
          </FCard>
        ))}
      </div>

      {/* Balance */}
      <FCard style={{ marginBottom: 28 }}>
        <Lbl>Current Balance</Lbl>
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 8 }}>
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono',monospace",
              background: "linear-gradient(135deg,var(--pur2),var(--acc))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            2.00
          </div>
          <span style={{ fontSize: 17, color: "var(--txt2)", marginLeft: 10 }}>
            credits
          </span>
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            marginTop: 8,
            lineHeight: 1.55,
          }}
        >
          Contact Centre Ai bills based on your plan: Talk Time
          ($0.11–$0.14/min) and Transfer Time ($0.03–$0.05/min), prorated to the
          exact second.
        </p>
      </FCard>

      {/* Plan cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {PLANS.map((p) => (
          <div
            key={p.name}
            style={{
              background: p.cur ? "rgba(124,92,255,0.04)" : "var(--card)",
              border: `1px solid ${p.cur ? "var(--pur)" : "var(--bdr)"}`,
              borderRadius: 16,
              padding: 26,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = p.col;
              e.currentTarget.style.boxShadow =
                "0 4px 22px rgba(124,92,255,0.14)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = p.cur
                ? "var(--pur)"
                : "var(--bdr)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: p.col }}>
                {p.name}{" "}
                {p.cur && (
                  <span style={{ fontSize: 12, color: "var(--grn)" }}>●</span>
                )}
              </div>
              <div
                className="mono"
                style={{ fontSize: 16, fontWeight: 700, color: "var(--txt2)" }}
              >
                {p.price}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              {Object.entries(p.feats).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--bdr)",
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ color: "var(--txt2)" }}>{k}:</span>
                  <span
                    className="mono"
                    style={{ fontWeight: 600, fontSize: 12.5 }}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
            {p.cur ? (
              <Btn
                variant="secondary"
                disabled
                style={{ justifyContent: "center" }}
              >
                Base Plan
              </Btn>
            ) : p.name === "Enterprise" ? (
              <Btn variant="secondary" style={{ justifyContent: "center" }}>
                Contact Us
              </Btn>
            ) : (
              <Btn style={{ justifyContent: "center" }}>Increase Scale</Btn>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BillingPage;
