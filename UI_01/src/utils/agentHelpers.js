export const fmt = (n, d = 1) => (n == null ? "—" : Number(n).toFixed(d));

export const fmtDur = (s) => {
  if (!s) return "0s";
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return m ? `${m}m ${sec}s` : `${sec}s`;
};

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

export const statusColor = {
  completed:   "#185FA5",
  failed:      "#E24B4A",
  voicemail:   "#BA7517",
  unknown:     "#888780",
  resolved:    "#1D9E75",
  escalated:   "#E24B4A",
  transferred: "#BA7517",
  missed:      "#888780",
};

export const sentimentColor = {
  positive: "#1D9E75",
  neutral:  "#888780",
  negative: "#E24B4A",
  Positive: "#1D9E75",
  Neutral:  "#888780",
  Negative: "#E24B4A",
};

export const channelIcon = {
  voice: "🎙",
  chat:  "💬",
  email: "✉",
};