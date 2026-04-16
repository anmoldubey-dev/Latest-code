/**
 * script.js — Real-Time Speech Translator Frontend
 * ──────────────────────────────────────────────────
 *
 * Flow
 * ────
 * 1. User selects source / target language.
 * 2. "Start Call" → request microphone permission, open WebSocket.
 * 3. AudioContext + AudioWorklet capture PCM @ 16 kHz.
 * 4. Every 500 ms, Float32Array chunks are sent as binary WebSocket frames.
 * 5. Backend replies with JSON:
 *      { type: "status",      message: "listening" | "processing" }
 *      { type: "transcript",  text: "..." }
 *      { type: "translation", text: "..." }
 *      { type: "audio",       data: "<base64 WAV>" }
 * 6. Audio is decoded and played via the Web Audio API.
 * 7. "Stop Call" → close mic, close WebSocket.
 */

'use strict';

// ── Debug logger with elapsed-time prefix ────────────────────────────────────
let _dbgStart = null;
function dbg(...args) {
  const ms = _dbgStart !== null ? ((performance.now() - _dbgStart) / 1000).toFixed(2) : '—';
  console.log(`[T+${ms}s]`, ...args);
}

// ── Language display names ────────────────────────────────────────────────────
const LANG_NAMES = {
  en: 'English',
  hi: 'Hindi (हिन्दी)',
  ja: 'Japanese (日本語)',
};

// ── DOM references ────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const startBtn       = $('startBtn');
const stopBtn        = $('stopBtn');
const swapBtn        = $('swapBtn');
const srcLangSel     = $('srcLang');
const tgtLangSel     = $('tgtLang');
const statusBadge    = $('statusBadge');
const statusDot      = statusBadge.querySelector('.status-dot');
const statusText     = $('statusText');
const transcriptBox  = $('transcriptBox');
const translationBox = $('translationBox');
const panelSrcLabel  = $('panelSrcLang');
const panelTgtLabel  = $('panelTgtLang');
const panelSource    = $('panelSource');
const panelTarget    = $('panelTarget');
const footerSession  = $('footerSession');
const footerLast     = $('footerLast');

// ── Session state ─────────────────────────────────────────────────────────────
let ws            = null;
let audioCtx      = null;
let workletNode   = null;
let micStream     = null;
let isActive      = false;
let sessionStart  = null;
let sessionTimer  = null;
let tTranscript   = null;  // timestamp when last transcript arrived (for response timer)

// Audio playback queue (prevents overlapping speech)
let playQueue     = Promise.resolve();
let _audioSeq     = 0;   // increments on every new clip; stale clips self-skip
let sending       = true; // paused while TTS is playing to prevent mic feedback

// ══════════════════════════════════════════════════════════════════════════════
// UI helpers
// ══════════════════════════════════════════════════════════════════════════════

function setStatus(label, cls = '') {
  statusBadge.className = 'status-badge' + (cls ? ' ' + cls : '');
  statusText.textContent = label;
}

function updateLangLabels() {
  const src = LANG_NAMES[srcLangSel.value] || srcLangSel.value;
  const tgt = LANG_NAMES[tgtLangSel.value] || tgtLangSel.value;
  panelSrcLabel.textContent = src;
  panelTgtLabel.textContent = tgt;
}

function setControlsEnabled(enabled) {
  startBtn.disabled    = !enabled;
  stopBtn.disabled     =  enabled;
  srcLangSel.disabled  = !enabled;
  tgtLangSel.disabled  = !enabled;
  swapBtn.disabled     = !enabled;
}

function resetPanels() {
  transcriptBox.innerHTML  = '<p class="placeholder">Your speech will appear here…</p>';
  translationBox.innerHTML = '<p class="placeholder">Translation will appear here…</p>';
  panelSource.classList.remove('active');
  panelTarget.classList.remove('has-content');
}

// ── Transcript display ────────────────────────────────────────────────────────
let _currentTranscriptEl = null;

function updateTranscript(text) {
  const placeholder = transcriptBox.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  // Update in-place for the rolling current-utterance entry
  if (!_currentTranscriptEl) {
    _currentTranscriptEl = document.createElement('div');
    _currentTranscriptEl.className = 'transcript-entry current';
    transcriptBox.appendChild(_currentTranscriptEl);
  }
  _currentTranscriptEl.textContent = text;
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
  panelSource.classList.add('active');
}

function commitTranscript() {
  // "Seal" the current entry — future updates start a new block
  if (_currentTranscriptEl) {
    _currentTranscriptEl.classList.remove('current');
    _currentTranscriptEl = null;
  }
}

// ── Translation display ───────────────────────────────────────────────────────
function appendTranslation(text) {
  const placeholder = translationBox.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  // Calculate response time from transcript → translation
  const elapsed = tTranscript ? ((Date.now() - tTranscript) / 1000).toFixed(1) : null;
  tTranscript = null;

  const div = document.createElement('div');
  div.className = 'translation-entry';

  const txtSpan = document.createElement('span');
  txtSpan.textContent = text;
  div.appendChild(txtSpan);

  if (elapsed != null) {
    const badge = document.createElement('span');
    badge.style.cssText = 'margin-left:8px;font-size:10px;opacity:0.55;color:#4f8ef7;';
    badge.textContent = `⚡ ${elapsed}s`;
    div.appendChild(badge);
  }

  translationBox.appendChild(div);
  translationBox.scrollTop = translationBox.scrollHeight;
  panelTarget.classList.add('has-content');

  footerLast.textContent = elapsed != null ? `⚡ Last response: ${elapsed}s` : 'Last: ' + new Date().toLocaleTimeString();

  // Seal previous transcript when we get a confirmed translation
  commitTranscript();
}

// ── Session timer ─────────────────────────────────────────────────────────────
function startTimer() {
  sessionStart = Date.now();
  sessionTimer = setInterval(() => {
    const s = Math.floor((Date.now() - sessionStart) / 1000);
    footerSession.textContent = `Session: ${s}s`;
  }, 1000);
}

function stopTimer() {
  clearInterval(sessionTimer);
  sessionTimer = null;
  footerSession.textContent = 'Session ended';
}

// ══════════════════════════════════════════════════════════════════════════════
// Audio playback — WAV base64
// ══════════════════════════════════════════════════════════════════════════════

function enqueueAudio(b64) {
  // Bump sequence number — any clip already waiting in the queue will see
  // that its captured seq is stale and skip itself, preventing pile-up.
  const seq = ++_audioSeq;
  playQueue = playQueue.then(async () => {
    if (seq < _audioSeq) {
      dbg('audio skipped (stale seq=%d, current=%d)', seq, _audioSeq);
      return;
    }
    sending = false;   // stop sending mic while TTS plays
    dbg('mic muted for TTS playback');
    try {
      await playWav(b64);
    } finally {
      sending = true;  // resume mic after TTS finishes (or errors)
      dbg('mic unmuted after TTS');
    }
  });
}

// Single shared AudioContext for all playback — avoids browser limit on
// simultaneous contexts and keeps it alive across utterances.
let _playCtx = null;
function getPlayCtx() {
  if (!_playCtx || _playCtx.state === 'closed') {
    _playCtx = new AudioContext();
  }
  return _playCtx;
}

async function playWav(b64) {
  const t0 = performance.now();
  try {
    const binary = atob(b64);
    const buf    = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);

    const ctx = getPlayCtx();

    // Chrome suspends AudioContext if no recent user gesture — resume it.
    if (ctx.state === 'suspended') {
      await ctx.resume();
      dbg('AudioContext resumed from suspended state');
    }

    const audio = await ctx.decodeAudioData(buf.buffer.slice(0));
    dbg('audio decode OK — duration=%.2fs', audio.duration);
    const src   = ctx.createBufferSource();
    src.buffer  = audio;
    src.connect(ctx.destination);

    await new Promise(resolve => {
      src.onended = () => {
        dbg('audio playback ended — play_time=%.0fms', performance.now() - t0);
        resolve();
      };
      dbg('audio playback start');
      src.start();
    });
  } catch (e) {
    console.warn('[audio] Playback error:', e.message, e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// WebSocket
// ══════════════════════════════════════════════════════════════════════════════

function openWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws/translate`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    dbg('WS connected — sending start');
    ws.send(JSON.stringify({
      action:      'start',
      source_lang: srcLangSel.value,
      target_lang: tgtLangSel.value,
    }));
  };

  ws.onmessage = ({ data }) => {
    try {
      handleMessage(JSON.parse(data));
    } catch (e) {
      console.warn('[ws] Bad message:', e);
    }
  };

  ws.onerror = e => {
    console.error('[ws] Error:', e);
    setStatus('Error', '');
  };

  ws.onclose = () => {
    dbg('WS closed');
    if (isActive) stopCall();
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'status':
      dbg('status → %s', msg.message);
      if (msg.message === 'listening')   setStatus('Listening',   'listening');
      else if (msg.message === 'processing') setStatus('Processing', 'processing');
      break;

    case 'transcript':
      dbg('transcript → %r', msg.text);
      tTranscript = Date.now();  // start response timer
      updateTranscript(msg.text);
      break;

    case 'translation':
      dbg('translation → %r', msg.text);
      appendTranslation(msg.text);
      break;

    case 'audio':
      dbg('audio received — %d bytes (b64)', msg.data.length);
      enqueueAudio(msg.data);
      break;

    case 'error':
      console.error('[T+?] server error:', msg.message);
      setStatus('Error', '');
      break;

    case 'pong':
      // heartbeat ack — no-op
      break;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Microphone capture — AudioWorklet
// ══════════════════════════════════════════════════════════════════════════════

async function startMic() {
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount:     1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl:  true,
    },
  });

  // Create AudioContext — request 16 kHz if the browser supports it.
  // (Most modern browsers honour this; some clamp to 44100 / 48000.)
  audioCtx = new AudioContext({ sampleRate: 16000 });

  // Load AudioWorklet processor from static files
  await audioCtx.audioWorklet.addModule('/static/audio-processor.js');

  // Resume AudioContext — Chrome auto-suspends until explicitly resumed
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const micSource = audioCtx.createMediaStreamSource(micStream);
  workletNode = new AudioWorkletNode(audioCtx, 'audio-processor', {
    processorOptions: { sampleRate: audioCtx.sampleRate },
  });

  // Forward Float32 PCM chunks to WebSocket as binary frames
  let _chunkCount = 0;
  workletNode.port.onmessage = ({ data }) => {
    if (sending && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data.buffer);
      _chunkCount++;
      if (_chunkCount % 10 === 0) {   // log every 10 chunks (every ~5 s)
        dbg('audio chunks sent: %d  (%.1f s captured)', _chunkCount, _chunkCount * 0.5);
      }
    }
  };

  // Chrome only calls process() on nodes connected to the audio graph.
  // Route through a zero-gain node so audio processes but never plays back.
  const silentSink = audioCtx.createGain();
  silentSink.gain.value = 0;
  micSource.connect(workletNode);
  workletNode.connect(silentSink);
  silentSink.connect(audioCtx.destination);
}

function stopMic() {
  try { workletNode && workletNode.disconnect(); } catch (_) {}
  try { audioCtx && audioCtx.close(); }           catch (_) {}
  try { micStream && micStream.getTracks().forEach(t => t.stop()); } catch (_) {}
  try { _playCtx && _playCtx.close(); }           catch (_) {}
  workletNode = null;
  audioCtx    = null;
  micStream   = null;
  _playCtx    = null;
  _audioSeq++;                    // invalidate any queued clips immediately
  playQueue   = Promise.resolve();
  sending     = true;             // reset for next session
}

// ══════════════════════════════════════════════════════════════════════════════
// Call control
// ══════════════════════════════════════════════════════════════════════════════

async function startCall() {
  if (isActive) return;
  isActive = true;
  _dbgStart = performance.now();
  dbg('startCall — src=%s tgt=%s', srcLangSel.value, tgtLangSel.value);

  setControlsEnabled(false);
  resetPanels();
  updateLangLabels();
  setStatus('Connecting…', '');
  _currentTranscriptEl = null;
  footerLast.textContent = '–';

  try {
    dbg('opening WebSocket …');
    openWebSocket();
    dbg('requesting microphone …');
    await startMic();
    dbg('mic + worklet ready  sampleRate=%dHz', audioCtx.sampleRate);
    setStatus('Listening', 'listening');
    startTimer();
  } catch (err) {
    console.error('[startCall]', err);
    setStatus('Error', '');
    alert(`Could not start call:\n${err.message}`);
    await stopCall();
  }
}

async function stopCall() {
  if (!isActive) return;
  isActive = false;

  // Tell backend we're done (so it can flush)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'stop' }));
    ws.close();
  }
  ws = null;

  stopMic();
  stopTimer();
  setControlsEnabled(true);
  setStatus('Idle', '');
}

// ── Language swap ─────────────────────────────────────────────────────────────
swapBtn.addEventListener('click', () => {
  if (isActive) return; // prevent swap during live session
  [srcLangSel.value, tgtLangSel.value] = [tgtLangSel.value, srcLangSel.value];
  updateLangLabels();
});

// ── Button listeners ──────────────────────────────────────────────────────────
startBtn.addEventListener('click', startCall);
stopBtn.addEventListener('click',  stopCall);
srcLangSel.addEventListener('change', updateLangLabels);
tgtLangSel.addEventListener('change', updateLangLabels);

// ── Init ──────────────────────────────────────────────────────────────────────
updateLangLabels();
setStatus('Idle', '');
