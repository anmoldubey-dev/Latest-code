/* ============================================================
   Indic Parler TTS — Voice Studio  |  app.js
============================================================ */

const API = "";  // same origin

// DOM refs
const langSel      = document.getElementById("language");
const voiceSel     = document.getElementById("voice");
const voiceCount   = document.getElementById("voice-count");
const emotionSel   = document.getElementById("emotion");
const textInput    = document.getElementById("text-input");
const charCount    = document.getElementById("char-count");
const genBtn       = document.getElementById("generate-btn");
const errorMsg     = document.getElementById("error-msg");
const statusMsg    = document.getElementById("status-msg");
const modelBanner  = document.getElementById("model-banner");

const currentSection  = document.getElementById("current-section");
const currentCard     = document.getElementById("current-card");
const previousSection = document.getElementById("previous-section");
const previousCard    = document.getElementById("previous-card");
const recordingsList  = document.getElementById("recordings-list");
const clearBtn        = document.getElementById("clear-btn");
const newBadge        = document.getElementById("new-badge");

// State
let generating = false;
let healthPoller = null;
let elapsedInterval = null;
let currentAudio = null;
let languageMap = {};  // { "Hindi": { native, voices: [...] }, ... }

// ============================================================
// Init
// ============================================================
window.addEventListener("DOMContentLoaded", async () => {
  await fetchLanguageMap();
  loadPrefs();
  updateCharCount();
  loadRecordings();
  checkHealth();
});

// ============================================================
// localStorage prefs
// ============================================================
// ============================================================
// Language map — fetch from API
// ============================================================
async function fetchLanguageMap() {
  try {
    const res = await fetch(`${API}/languages`);
    if (res.ok) languageMap = await res.json();
  } catch {}
  // Always use explicit first option value, not langSel.value which may be "" before DOM settles
  const defaultLang = langSel.options[0]?.value || "Hindi";
  langSel.value = defaultLang;
  populateVoices(defaultLang);
}

function populateVoices(langName) {
  const saved = voiceSel.value;
  const voices = languageMap[langName]?.voices || [];
  voiceSel.innerHTML = "";
  voices.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v.replace(" (", " — ").replace(")", "");
    voiceSel.appendChild(opt);
  });
  // Restore saved voice if still available in this language
  if (saved && voices.includes(saved)) voiceSel.value = saved;
  voiceCount.textContent = voices.length ? `${voices.length} voices` : "";
}

langSel.addEventListener("change", () => {
  populateVoices(langSel.value);
  savePrefs();
});

// ============================================================
// Prefs
// ============================================================
function loadPrefs() {
  const prefs = JSON.parse(localStorage.getItem("tts_prefs") || "{}");
  if (prefs.language && langSel.querySelector(`option[value="${prefs.language}"]`)) {
    langSel.value = prefs.language;
    populateVoices(prefs.language);  // re-populate voices for saved language
  }
  // Only restore saved voice if it exists in the current (filtered) voice dropdown
  if (prefs.voice && voiceSel.querySelector(`option[value="${CSS.escape(prefs.voice)}"]`)) {
    voiceSel.value = prefs.voice;
  }
  if (prefs.emotion) emotionSel.value = prefs.emotion;
}

function savePrefs() {
  localStorage.setItem("tts_prefs", JSON.stringify({
    language: langSel.value,
    voice:    voiceSel.value,
    emotion:  emotionSel.value,
  }));
}

[langSel, voiceSel, emotionSel].forEach(el => el.addEventListener("change", savePrefs));

// ============================================================
// Char counter
// ============================================================
textInput.addEventListener("input", updateCharCount);

function updateCharCount() {
  const len = textInput.value.length;
  charCount.textContent = `${len} / 1000`;
  charCount.classList.toggle("over", len > 1000);
}

// ============================================================
// Health polling
// ============================================================
async function checkHealth() {
  try {
    const res = await fetch(`${API}/health`);
    const data = await res.json();
    if (data.status === "loading") {
      modelBanner.classList.remove("hidden");
      if (!healthPoller) {
        healthPoller = setInterval(checkHealth, 3000);
      }
    } else {
      modelBanner.classList.add("hidden");
      if (healthPoller) {
        clearInterval(healthPoller);
        healthPoller = null;
      }
    }
  } catch {
    // Server not up yet — keep polling
    modelBanner.classList.remove("hidden");
    if (!healthPoller) {
      healthPoller = setInterval(checkHealth, 3000);
    }
  }
}

// ============================================================
// Generate
// ============================================================
genBtn.addEventListener("click", handleGenerate);

async function handleGenerate() {
  const text = textInput.value.trim();
  if (!text) {
    showError("Please enter some text before generating.");
    return;
  }

  clearError();
  setGenerating(true);
  const t0 = Date.now();
  startElapsedTimer(t0);

  try {
    const res = await fetch(`${API}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language:   langSel.value,
        voice_name: voiceSel.value,
        emotion:    emotionSel.value,
      }),
    });

    if (res.status === 429) {
      const d = await res.json();
      showError(d.detail || "Generation in progress, please wait.");
      return;
    }
    if (res.status === 503) {
      showError("Model is still loading. Please wait a moment.");
      return;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      showError(d.detail || `Server error ${res.status}`);
      return;
    }

    const data = await res.json();
    renderCurrentCard(data);
    if (data.previous_url) renderPreviousCard(data.previous_url);
    autoPlay(data.url);
    loadRecordings();

  } catch (err) {
    showError("Network error: " + err.message);
  } finally {
    setGenerating(false);
    stopElapsedTimer();
  }
}

// ============================================================
// UI helpers
// ============================================================
function setGenerating(val) {
  generating = val;
  genBtn.disabled = val;
  genBtn.textContent = val ? "Generating…" : "Generate";
  statusMsg.classList.toggle("hidden", !val);
  if (val) {
    statusMsg.innerHTML = `<span class="spinner"></span><span id="elapsed-label">Generating… 0s</span>`;
  }
}

function startElapsedTimer(t0) {
  elapsedInterval = setInterval(() => {
    const el = document.getElementById("elapsed-label");
    if (el) el.textContent = `Generating… ${((Date.now() - t0) / 1000).toFixed(1)}s`;
  }, 200);
}

function stopElapsedTimer() {
  if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; }
  statusMsg.classList.add("hidden");
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove("hidden");
}

function clearError() {
  errorMsg.textContent = "";
  errorMsg.classList.add("hidden");
}

// ============================================================
// Render cards
// ============================================================
function buildAudioCard(url, filename, meta, large = false) {
  const div = document.createElement("div");
  div.className = "audio-card" + (large ? " current-card" : "");

  const playBtn = document.createElement("button");
  playBtn.className = "play-btn" + (large ? "" : " small");
  playBtn.textContent = "▶";
  playBtn.title = "Play";

  const info = document.createElement("div");
  info.className = "card-info";
  info.innerHTML = `<div class="card-name">${filename}</div>
                    <div class="card-meta">${meta}</div>`;

  // Waveform decoration (static decorative bars)
  const waveform = document.createElement("div");
  waveform.className = "waveform-bar";
  for (let i = 0; i < 20; i++) {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = (20 + Math.random() * 80) + "%";
    waveform.appendChild(bar);
  }

  const dl = document.createElement("a");
  dl.href = url;
  dl.download = filename;
  dl.className = "download-btn";
  dl.textContent = "↓ Download";

  // Play logic
  let audio = null;
  playBtn.addEventListener("click", () => {
    if (audio && !audio.paused) {
      audio.pause();
      playBtn.textContent = "▶";
      waveform.classList.remove("playing");
    } else {
      if (currentAudio && currentAudio !== audio) {
        currentAudio.pause();
      }
      audio = new Audio(url);
      currentAudio = audio;
      audio.play();
      playBtn.textContent = "⏸";
      waveform.classList.add("playing");
      audio.addEventListener("ended", () => {
        playBtn.textContent = "▶";
        waveform.classList.remove("playing");
      });
    }
  });

  div.appendChild(playBtn);
  div.appendChild(info);
  if (large) div.appendChild(waveform);
  div.appendChild(dl);
  return div;
}

function renderCurrentCard(data) {
  currentCard.innerHTML = "";
  const meta = `${data.language} · ${data.voice_name} · ${data.emotion} · ${data.duration_seconds}s · ${data.generation_time_seconds}s`;
  const card = buildAudioCard(data.url, data.filename, meta, true);
  currentCard.appendChild(card);
  currentSection.classList.remove("hidden");
}

function renderPreviousCard(url) {
  previousCard.innerHTML = "";
  const filename = url.split("/").pop();
  const card = buildAudioCard(url, filename, "Previous recording", false);
  previousCard.appendChild(card);
  previousSection.classList.remove("hidden");
}

function autoPlay(url) {
  if (currentAudio) currentAudio.pause();
  currentAudio = new Audio(url);
  currentAudio.play().catch(() => {});
}

// ============================================================
// All recordings list
// ============================================================
async function loadRecordings() {
  try {
    const res = await fetch(`${API}/recordings`);
    if (!res.ok) return;
    const data = await res.json();
    renderRecordingsList(data.recordings);
  } catch {}
}

function renderRecordingsList(recordings) {
  if (!recordings || recordings.length === 0) {
    recordingsList.innerHTML = '<p class="empty-state">No recordings yet. Generate your first voice.</p>';
    return;
  }

  // newest first
  const sorted = [...recordings].sort((a, b) => b.created_at - a.created_at);
  recordingsList.innerHTML = "";

  sorted.forEach((rec, idx) => {
    const item = document.createElement("div");
    item.className = "rec-item" + (idx === 0 ? " is-new" : "");

    const playBtn = document.createElement("button");
    playBtn.className = "play-btn small";
    playBtn.textContent = "▶";

    let audio = null;
    playBtn.addEventListener("click", () => {
      if (audio && !audio.paused) {
        audio.pause();
        playBtn.textContent = "▶";
      } else {
        if (currentAudio) currentAudio.pause();
        audio = new Audio(rec.url);
        currentAudio = audio;
        audio.play();
        playBtn.textContent = "⏸";
        audio.addEventListener("ended", () => { playBtn.textContent = "▶"; });
      }
    });

    const name = document.createElement("div");
    name.className = "rec-name";
    name.textContent = rec.filename.replace(".wav", "");

    const meta = document.createElement("div");
    meta.className = "rec-meta";
    meta.textContent = `${rec.duration_seconds}s`;

    const dl = document.createElement("a");
    dl.href = rec.url;
    dl.download = rec.filename;
    dl.className = "download-btn";
    dl.textContent = "↓";
    dl.title = "Download";

    if (idx === 0) {
      const badge = document.createElement("span");
      badge.className = "badge-new";
      badge.textContent = "NEW";
      item.appendChild(badge);
    }

    item.appendChild(playBtn);
    item.appendChild(name);
    item.appendChild(meta);
    item.appendChild(dl);
    recordingsList.appendChild(item);
  });
}

// ============================================================
// Clear recordings
// ============================================================
clearBtn.addEventListener("click", async () => {
  if (!confirm("Delete all recordings?")) return;
  try {
    await fetch(`${API}/recordings`, { method: "DELETE" });
    currentSection.classList.add("hidden");
    previousSection.classList.add("hidden");
    loadRecordings();
  } catch (err) {
    showError("Failed to clear: " + err.message);
  }
});
