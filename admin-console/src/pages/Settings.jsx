// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | EnvRow()                  |
// | * single env var row      |
// +---------------------------+
//     |
//     |----> copy()
//     |        * copies value to clipboard
//     |
//     v
// +---------------------------+
// | Settings()                |
// | * env vars + params page  |
// +---------------------------+
//     |
//     |----> EnvRow()
//     |        * renders each env variable
//     |
//     v
// [ END ]
//
// ================================================================

import React, { useState } from 'react'
import { Settings as SettingsIcon, Eye, EyeOff, Copy, CheckCheck } from 'lucide-react'
import Btn from '../components/ui/Btn.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'

const ENV_VARS = [
  // group, key, value, secret, description
  { group: 'STT',      key: 'WHISPER_MODEL',     value: 'large-v3',                    secret: false, desc: 'Whisper model size — turbo, large-v3, medium, small' },
  { group: 'STT',      key: 'HF_TOKEN',          value: 'hf_●●●●●●●●●●●●●●●●',        secret: true,  desc: 'HuggingFace token for pyannote diarization model' },
  { group: 'LLM',      key: 'GEMINI_API_KEY',    value: 'AIzaSy●●●●●●●●●●●●●●●●',     secret: true,  desc: 'Google Gemini API key (or VITE_MNI_API_KEY)' },
  { group: 'LLM',      key: 'OLLAMA_URL',        value: 'http://localhost:11434/api/chat', secret: false, desc: 'Ollama API endpoint for Qwen 2.5:7b' },
  { group: 'LLM',      key: 'OLLAMA_ENABLED',    value: 'false',                       secret: false, desc: 'Enable Qwen/Ollama as LLM backend (true/false)' },
  { group: 'TTS',      key: 'GLOBAL_TTS_URL',    value: 'http://localhost:8003',       secret: false, desc: 'Global TTS microservice URL (en, fr, de, es, pt, pl, it, nl)' },
  { group: 'TTS',      key: 'INDIC_TTS_URL',     value: 'http://localhost:8004',       secret: false, desc: 'Indic TTS microservice URL (hi, bn, ta, te, mr, gu...)' },
  { group: 'TTS',      key: 'MODEL_NAME',        value: 'parler-tts/parler-tts-mini-v1.1', secret: false, desc: 'Parler TTS model (human_tts service)' },
  { group: 'TTS',      key: 'DEVICE',            value: 'cuda',                        secret: false, desc: 'Compute device for TTS inference (cuda / cpu)' },
  { group: 'TTS',      key: 'MAX_TEXT_LENGTH',   value: '1000',                        secret: false, desc: 'Maximum character length for TTS input' },
  { group: 'TTS',      key: 'OUTPUT_DIR',        value: 'outputs/recordings',          secret: false, desc: 'TTS recording output directory' },
  { group: 'LiveKit',  key: 'LIVEKIT_URL',       value: 'ws://localhost:7880',         secret: false, desc: 'LiveKit server WebSocket URL' },
  { group: 'LiveKit',  key: 'LIVEKIT_API_KEY',   value: 'devkey',                      secret: false, desc: 'LiveKit API key' },
  { group: 'LiveKit',  key: 'LIVEKIT_API_SECRET',value: '●●●●●●●●●●●●',               secret: true,  desc: 'LiveKit API secret for JWT signing' },
]

const MODEL_PARAMS = [
  { label: 'STT Beam Size',          value: '3',     unit: '',     desc: 'Whisper decoder beam size — 3 is 40% faster than 5' },
  { label: 'STT Temperature',        value: '0.0',   unit: '',     desc: 'Deterministic decoding (0.0 = no sampling)' },
  { label: 'VAD Threshold',          value: '0.35',  unit: '',     desc: 'Silero VAD speech probability threshold' },
  { label: 'VAD Silence Duration',   value: '300',   unit: 'ms',   desc: 'Minimum silence duration before cutting segment' },
  { label: 'VAD Speech Pad',         value: '100',   unit: 'ms',   desc: 'Padding around detected speech segment' },
  { label: 'No-Speech Threshold',    value: '0.60',  unit: '',     desc: 'Whisper no-speech probability rejection threshold' },
  { label: 'RMS Floor',              value: '0.015', unit: '',     desc: 'Minimum RMS — frames below are skipped' },
  { label: 'Max Utterance',          value: '15',    unit: 's',    desc: 'Maximum utterance duration before forced flush' },
  { label: 'Silence Gap (VAD buf)',  value: '550',   unit: 'ms',   desc: 'Silence duration to finalize utterance in AudioBuf' },
  { label: 'LLM History (Gemini)',   value: '8',     unit: 'turns', desc: 'Conversation turns included in LLM context' },
  { label: 'LLM History (Qwen)',     value: '6',     unit: 'turns', desc: 'Conversation turns included in Qwen context' },
  { label: 'FAISS Search k',         value: '2',     unit: '',     desc: 'Top-k results returned from memory vector search' },
  { label: 'Company Context Max',    value: '8000',  unit: 'chars', desc: 'Maximum characters injected from documents/ into LLM prompt' },
  { label: 'RMS Normalise Target',   value: '0.12',  unit: '',     desc: 'Audio preprocessor target RMS level' },
  { label: 'Max Gain',               value: '30x',   unit: '',     desc: 'Audio preprocessor maximum amplification gain' },
]

function EnvRow({ item }) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(item.value.replace(/●+/g, '[REDACTED]'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const display = item.secret && !shown ? item.value : item.value

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '80px 200px 1fr auto',
      padding: '9px 14px', gap: 12, alignItems: 'center',
      borderBottom: '1px solid var(--border)',
      transition: 'background var(--t-fast)',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ fontSize: 10, color: 'var(--cyan)', background: 'var(--cyan-dim)', padding: '1px 6px', borderRadius: 3, fontWeight: 500, textAlign: 'center' }}>{item.group}</span>
      <span style={{ fontSize: 11.5, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{item.key}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: item.secret && !shown ? 'var(--text-muted)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: 2 }} className="truncate">
          {display}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{item.desc}</div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {item.secret && (
          <button onClick={() => setShown(s => !s)} style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
            {shown ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
        <button onClick={copy} style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
          {copied ? <CheckCheck size={12} style={{ color: 'var(--green)' }} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  )
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('env')
  const groups = [...new Set(ENV_VARS.map(e => e.group))]

  return (
    <div className="animate-fade-in">
      <SectionHeader title="Settings" subtitle="Environment variables and model parameter reference" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[['env', 'Environment Variables'], ['params', 'Model Parameters']].map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{
            padding: '8px 14px', fontSize: 12.5, fontWeight: activeTab === k ? 600 : 400, cursor: 'pointer',
            border: 'none', background: 'transparent',
            color: activeTab === k ? 'var(--cyan)' : 'var(--text-secondary)',
            borderBottom: `2px solid ${activeTab === k ? 'var(--cyan)' : 'transparent'}`,
            marginBottom: -1,
            transition: 'color var(--t-fast)',
          }}>
            {l}
          </button>
        ))}
      </div>

      {activeTab === 'env' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 200px 1fr auto', padding: '8px 14px', gap: 12, fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
            <span>Group</span><span>Key</span><span>Value · Description</span><span></span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 520 }}>
            {ENV_VARS.map(item => <EnvRow key={item.key} item={item} />)}
          </div>
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
            {ENV_VARS.filter(e => e.secret).length} secrets hidden · Edit values in root <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>.env</code> file
          </div>
        </div>
      )}

      {activeTab === 'params' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 80px 60px 1fr', padding: '8px 14px', gap: 12, fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
            <span>Parameter</span><span>Value</span><span>Unit</span><span>Description</span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 520 }}>
            {MODEL_PARAMS.map((p, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '220px 80px 60px 1fr',
                padding: '9px 14px', gap: 12, alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                transition: 'background var(--t-fast)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{p.label}</span>
                <span style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{p.value}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.unit || '—'}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{p.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
