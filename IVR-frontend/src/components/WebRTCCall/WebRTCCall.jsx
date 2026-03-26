/**
 * WebRTCCall.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * AI call panel rendered inside the Dialer.
 *
 * Props (all passed from Dialer via useWebRTCCall() output):
 *   rtcState, agentName, transcript, aiResponse, isMuted, errorMsg,
 *   startCall, hangup, interrupt, toggleMute, remoteAudioRef
 */

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Zap, AlertCircle, Radio, Bot } from 'lucide-react';

// ── Static language map — display names for every language in backend config ──
// Only entries whose lang code appears in the fetched voice registry are shown.
const LANG_META = {
  // ── Global TTS (port 8003) ─────────────────────────────────────────────────
  en:    'English',
  fr:    'French',
  de:    'German',
  es:    'Spanish',
  pt:    'Portuguese',
  pl:    'Polish',
  it:    'Italian',
  nl:    'Dutch',
  // ── Indic TTS (port 8004) ─────────────────────────────────────────────────
  hi:    'Hindi',
  'en-in': 'English (Indian)',
  mr:    'Marathi',
  bn:    'Bengali',
  ta:    'Tamil',
  te:    'Telugu',
  gu:    'Gujarati',
  kn:    'Kannada',
  ml:    'Malayalam',
  pa:    'Punjabi',
  or:    'Odia',
  as:    'Assamese',
  ur:    'Urdu',
  // ── Other ─────────────────────────────────────────────────────────────────
  ar:    'Arabic',
  ru:    'Russian',
  zh:    'Chinese',
  ne:    'Nepali',
};

const LLM_OPTIONS = [
  { key: 'gemini', label: 'Gemini Flash' },
  { key: 'qwen',   label: 'Qwen 2.5 7B' },
];

// ── Voice name prettifier ─────────────────────────────────────────────────────
// "en_US-lessac-medium"    → "Lessac (US)"
// "hi_IN-priyamvada-medium"→ "Priyamvada (IN)"
// "zh_CN-xiao_ya-medium"   → "Xiao Ya (CN)"
// "ne_NP-google-medium"    → "Google (NP)"
function prettyVoiceName(stem) {
  // stem format: {lang}_{REGION}-{name}-{quality}
  const m = stem.match(/^[a-z]+_([A-Z]+)-([^-]+)/);
  if (!m) return stem;
  const region = m[1];
  const raw    = m[2].replace(/_/g, ' ');
  const name   = raw.replace(/\b\w/g, c => c.toUpperCase());
  return `${name} (${region})`;
}

// ── Fetch voice registry from backend ────────────────────────────────────────
async function fetchVoices() {
  try {
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const res = await fetch(`${base}/api/voices`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

// ── RTC state → display helpers ───────────────────────────────────────────────
const STATE_LABEL = {
  idle:        { text: 'Ready',         color: '#4b5563' },
  connecting:  { text: 'Connecting…',   color: '#eab308' },
  negotiating: { text: 'Negotiating…',  color: '#f97316' },
  connected:   { text: 'Live',          color: '#22c55e' },
  ended:       { text: 'Call Ended',    color: '#94a3b8' },
  error:       { text: 'Error',         color: '#ef4444' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ state }) {
  const meta    = STATE_LABEL[state] ?? STATE_LABEL.idle;
  const isPulse = ['connected', 'negotiating', 'connecting'].includes(state);
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          background: meta.color,
          boxShadow:  `0 0 5px ${meta.color}99`,
          animation:  isPulse ? 'pulse-dot 1.2s ease-in-out infinite' : 'none',
        }}
      />
      <span className="text-xs font-medium" style={{ color: meta.color }}>
        {meta.text}
      </span>
    </div>
  );
}

function AudioWaveform({ active }) {
  const bars = [4, 8, 12, 8, 4, 10, 6, 12, 9, 5];
  return (
    <div className="flex items-end gap-0.5 h-5">
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-1 rounded-full"
          style={{
            height:     active ? `${h}px` : '3px',
            background: active ? '#6366f1' : 'rgba(255,255,255,0.1)',
            transition: 'height 0.15s ease',
            animation:  active ? `pulse-dot ${0.8 + i * 0.07}s ease-in-out infinite` : 'none',
          }}
        />
      ))}
    </div>
  );
}

function MicRing({ active }) {
  return (
    <div className="relative flex items-center justify-center w-10 h-10">
      {active && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: 'rgba(99,102,241,0.2)',
            animation:  'pulse-dot 1s ease-in-out infinite',
          }}
        />
      )}
      <div
        className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center"
        style={{
          background: active
            ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
            : 'rgba(255,255,255,0.07)',
        }}
      >
        <Mic size={14} className={active ? 'text-white' : 'text-gray-500'} />
      </div>
    </div>
  );
}

// ── Select style (matches dark theme) ────────────────────────────────────────
const SEL = {
  background:   'rgba(255,255,255,0.05)',
  border:       '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  color:        '#e2e8f0',
  padding:      '8px 10px',
  fontSize:     '13px',
  width:        '100%',
  outline:      'none',
  cursor:       'pointer',
};

// ── Main component ────────────────────────────────────────────────────────────
export default function WebRTCCall({
  rtcState,
  agentName,
  transcript,
  aiResponse,
  isMuted,
  errorMsg,
  startCall,
  hangup,
  interrupt,
  toggleMute,
  remoteAudioRef,
}) {
  // ── Config state ───────────────────────────────────────────────────────────
  const [lang,    setLang]    = useState('en');
  const [llm,     setLlm]     = useState('gemini');
  const [voice,   setVoice]   = useState('');
  // registry: { [langCode]: [{name, model_path}] }
  const [registry, setRegistry] = useState(null);   // null = not yet loaded

  // ── Fetch voice registry once ──────────────────────────────────────────────
  useEffect(() => {
    fetchVoices().then(reg => {
      setRegistry(reg);
      // Auto-select: prefer English, then first available language
      const enVoices = reg['en'] || [];
      if (enVoices.length > 0) {
        setLang('en');
        setVoice(enVoices[0].name);
      } else {
        const firstLang = Object.keys(reg).find(k => reg[k].length > 0);
        if (firstLang) {
          setLang(firstLang);
          setVoice(reg[firstLang][0].name);
        }
      }
    });
  }, []);

  // When language changes, reset voice to first available for that lang
  useEffect(() => {
    if (!registry) return;
    const available = registry[lang] || [];
    setVoice(available.length > 0 ? available[0].name : '');
  }, [lang, registry]);

  // ── Languages that actually have voices (filtered from LANG_META) ──────────
  const availableLangs = registry
    ? Object.keys(LANG_META).filter(code => (registry[code] || []).length > 0)
    : ['en'];

  // Voices for currently selected language
  const voiceList = registry ? (registry[lang] || []) : [];

  // ── AI speaking detection ─────────────────────────────────────────────────
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const aiTimer = useRef(null);
  useEffect(() => {
    if (aiResponse) {
      setAiSpeaking(true);
      clearTimeout(aiTimer.current);
      const dur = Math.max(1500, aiResponse.length * 80);
      aiTimer.current = setTimeout(() => setAiSpeaking(false), dur);
    }
    return () => clearTimeout(aiTimer.current);
  }, [aiResponse]);

  // ── State flags ───────────────────────────────────────────────────────────
  const isIdle   = rtcState === 'idle' || rtcState === 'ended';
  const isActive = rtcState === 'connected';
  const isBusy   = rtcState === 'connecting' || rtcState === 'negotiating';
  const isError  = rtcState === 'error';

  const canStart = !registry
    ? false                                  // still loading
    : voiceList.length > 0;                  // need at least one voice

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
          >
            <Radio size={13} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">AI Voice Call</div>
            <div className="text-xs text-gray-600 leading-tight">WebRTC · Real-time</div>
          </div>
        </div>
        <StatusBadge state={rtcState} />
      </div>

      {/* ── Pre-call config ─────────────────────────────────────────────────── */}
      {(isIdle || isError) && (
        <div className="flex flex-col gap-3">

          {/* Language */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Language</label>
            {registry === null ? (
              <div className="text-xs text-gray-600 py-2 px-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                Loading languages…
              </div>
            ) : (
              <select value={lang} onChange={e => setLang(e.target.value)} style={SEL}>
                {availableLangs.map(code => (
                  <option key={code} value={code} style={{ background: '#0f172a' }}>
                    {LANG_META[code] || code.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Voice */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Voice</label>
            {registry === null ? (
              <div className="text-xs text-gray-600 py-2 px-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                Loading voices…
              </div>
            ) : voiceList.length === 0 ? (
              <div className="text-xs text-red-400 py-2 px-3 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                No voice model available for this language
              </div>
            ) : (
              <select value={voice} onChange={e => setVoice(e.target.value)} style={SEL}>
                {voiceList.map(v => (
                  <option key={v.name} value={v.name} style={{ background: '#0f172a' }}>
                    {prettyVoiceName(v.name)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* LLM */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">AI Model</label>
            <div className="flex gap-2">
              {LLM_OPTIONS.map(o => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setLlm(o.key)}
                  className="flex-1 py-2 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background: llm === o.key
                      ? 'linear-gradient(135deg,#6366f110,#8b5cf610)'
                      : 'rgba(255,255,255,0.04)',
                    border: llm === o.key
                      ? '1px solid rgba(99,102,241,0.5)'
                      : '1px solid rgba(255,255,255,0.07)',
                    color: llm === o.key ? '#a5b4fc' : '#94a3b8',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {isError && errorMsg && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border:     '1px solid rgba(239,68,68,0.2)',
                color:      '#fca5a5',
              }}
            >
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Start button */}
          <button
            type="button"
            disabled={!canStart}
            onClick={() => canStart && startCall({ lang, llm, voice })}
            className="btn-success w-full gap-2 py-3.5 text-sm mt-1"
            style={!canStart ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
          >
            <Radio size={15} />
            {registry === null
              ? 'Loading…'
              : isError
              ? 'Retry Call'
              : 'Start AI Call'}
          </button>
        </div>
      )}

      {/* ── Connecting / Negotiating ────────────────────────────────────────── */}
      {isBusy && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg,#6366f115,#8b5cf615)',
              border:     '1px solid rgba(99,102,241,0.2)',
            }}
          >
            <Bot size={24} style={{ color: '#6366f1' }} />
          </div>
          <div className="text-center">
            <div className="text-sm font-medium text-white mb-1">
              {rtcState === 'connecting' ? 'Connecting to agent…' : 'Establishing media…'}
            </div>
            <div className="text-xs text-gray-600">
              {rtcState === 'connecting'
                ? 'Opening signaling channel'
                : 'WebRTC negotiation in progress'}
            </div>
          </div>
          <div className="flex gap-1.5">
            {[0,1,2,3].map(i => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: '#6366f1',
                  animation:  `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={hangup}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Active call ─────────────────────────────────────────────────────── */}
      {isActive && (
        <div className="flex flex-col gap-3">

          {/* Agent card */}
          <div
            className="flex items-center gap-3 px-3 py-3 rounded-xl"
            style={{
              background: 'rgba(34,197,94,0.06)',
              border:     '1px solid rgba(34,197,94,0.15)',
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#6366f120,#8b5cf620)' }}
            >
              <Bot size={16} style={{ color: '#a5b4fc' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">
                {agentName || 'AI Agent'}
              </div>
              <AudioWaveform active={aiSpeaking} />
            </div>
            <MicRing active={!!transcript} />
          </div>

          {/* AI response caption */}
          {aiResponse && (
            <div
              className="px-3.5 py-3 rounded-xl text-xs leading-relaxed"
              style={{
                background: 'rgba(99,102,241,0.08)',
                border:     '1px solid rgba(99,102,241,0.15)',
                color:      '#c7d2fe',
              }}
            >
              <span className="text-xs font-semibold mr-1.5" style={{ color: '#818cf8' }}>
                {agentName || 'Agent'}:
              </span>
              {aiResponse}
            </div>
          )}

          {/* User transcript caption */}
          {transcript && (
            <div
              className="px-3.5 py-3 rounded-xl text-xs leading-relaxed"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border:     '1px solid rgba(255,255,255,0.08)',
                color:      '#94a3b8',
              }}
            >
              <span className="text-xs font-semibold text-gray-500 mr-1.5">You:</span>
              {transcript}
            </div>
          )}

          {/* Placeholder when no captions yet */}
          {!aiResponse && !transcript && (
            <div
              className="flex flex-col items-center gap-2 py-4"
              style={{
                border:       '1px dashed rgba(255,255,255,0.07)',
                borderRadius: '12px',
              }}
            >
              <Mic size={16} className="text-gray-700" />
              <span className="text-xs text-gray-700">Speak now — the agent is listening</span>
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={toggleMute}
              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-all"
              style={{
                background: isMuted ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                border:     isMuted ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(255,255,255,0.07)',
                color:      isMuted ? '#f87171' : '#94a3b8',
              }}
            >
              {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>

            <button
              type="button"
              onClick={interrupt}
              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-all"
              style={{
                background: 'rgba(99,102,241,0.08)',
                border:     '1px solid rgba(99,102,241,0.2)',
                color:      '#a5b4fc',
              }}
            >
              <Zap size={15} />
              Interrupt
            </button>
          </div>
        </div>
      )}

      {/* Hidden remote audio — AI voice plays here */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
    </div>
  );
}
