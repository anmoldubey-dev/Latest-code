// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | ServiceRow()              |
// | * single service detail   |
// +---------------------------+
//     |
//     |----> StatusPill()
//     |        * online/offline badge
//     |
//     v
// +---------------------------+
// | ServicesMonitor()         |
// | * all services health page|
// +---------------------------+
//     |
//     |----> useCallback() -> fetchAll()
//     |        * calls checkAllHealth()
//     |
//     |----> useManualRefresh()
//     |        * auto-refreshes every 8s
//     |
//     |----> ServiceRow()
//     |        * renders per service
//     |
//     v
// [ END ]
//
// ================================================================

import React, { useState, useCallback } from 'react'
import { RefreshCw, Activity, Globe2, Mic2, Layers, Radio, Languages, AudioWaveform } from 'lucide-react'
import StatusPill from '../components/ui/StatusPill.jsx'
import Btn from '../components/ui/Btn.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { useManualRefresh } from '../hooks/usePolling.js'
import { ttsGlobalApi, ttsIndicApi, checkAllHealth } from '../api/client.js'

const ALL_SERVICES = [
  { id: 'backend',      name: 'Backend API',    port: 8000, icon: Activity,  color: 'var(--cyan)',   desc: 'Main FastAPI — STT, LLM router, memory, LiveKit agent', model: 'Whisper large-v3 + Ollama qwen2.5:7b' },
  { id: 'Diarization',  name: 'Diarization',    port: 8001, icon: Layers,    color: 'var(--yellow)', desc: 'Pyannote speaker-diarization-3.1 — speaker segmentation', model: 'pyannote/speaker-diarization-3.1' },
  { id: 'Translator',   name: 'Translator',     port: 8002, icon: Languages, color: 'var(--yellow)', desc: 'M2M-100 offline NMT — cross-language translation', model: 'facebook/m2m100_418M' },
  { id: 'TTS Global',   name: 'TTS Global',     port: 8003, icon: Globe2,    color: 'var(--purple)', desc: 'Parler TTS — Global (en, fr, de, es, pt, it, nl)', model: 'parler-tts-mini-v1.1' },
  { id: 'TTS Indic',    name: 'TTS Indic',      port: 8004, icon: Mic2,      color: 'var(--green)',  desc: 'Indic Parler TTS — (hi, ta, te, kn, ml, gu, mr…)', model: 'ai4bharat/indic-parler-tts' },
  { id: 'Voice Cloner', name: 'Voice Cloner',   port: 8005, icon: AudioWaveform, color: 'var(--purple)', desc: 'Chatterbox TTS — 10s reference voice cloning', model: 'resemble-ai/chatterbox' },
  { id: 'livekit',      name: 'LiveKit Server', port: 7880, icon: Radio,     color: 'var(--cyan)',   desc: 'WebRTC real-time audio rooms for browser calls', model: 'livekit-server' },
]

function ServiceRow({ svc, health }) {
  const ok = health?.ok || health?.status === 'ready' || health?.status === 'online'
  const status = ok ? (health.status === 'loading' ? 'loading' : 'online') : 'offline'

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      display: 'grid',
      gridTemplateColumns: '36px 1fr auto',
      gap: 14,
      alignItems: 'start',
      transition: 'border-color var(--t-fast)',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = svc.color + '44'}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: svc.color + '18',
        border: `1px solid ${svc.color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svc.icon size={16} style={{ color: svc.color }} />
      </div>

      {/* Info */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{svc.name}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', background: 'var(--bg-overlay)', padding: '1px 5px', borderRadius: 3 }}>:{svc.port}</span>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{svc.desc}</p>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: svc.color, marginRight: 4 }}>model</span>{svc.model}
          </span>
          {health?.device && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: svc.color, marginRight: 4 }}>device</span>{health.device.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      <StatusPill status={status} pulse={status === 'loading'} />
    </div>
  )
}

export default function ServicesMonitor() {
  const [healths, setHealths] = useState({})
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    setRefreshing(true)
    try {
      const results = await checkAllHealth()
      const map = {}
      results.forEach(s => { map[s.name] = s })
      setHealths(map)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useManualRefresh(fetchAll, 8000)

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Services Monitor"
        subtitle="Health and status of all Voice AI microservices"
        action={
          <Btn variant="secondary" icon={RefreshCw} loading={refreshing} onClick={fetchAll}>
            Refresh
          </Btn>
        }
      />

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { label: `${Object.values(healths).filter(h => h.ok).length} Online`, color: 'var(--green)', bg: 'var(--green-dim)' },
          { label: `${Object.values(healths).filter(h => !h.ok).length + (ALL_SERVICES.length - Object.keys(healths).length)} Offline`, color: 'var(--red)', bg: 'var(--red-dim)' },
        ].map(({ label, color, bg }) => (
          <span key={label} style={{ padding: '4px 10px', borderRadius: 99, background: bg, color, fontSize: 11, fontWeight: 500 }}>
            {label}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ALL_SERVICES.map(svc => (
          <ServiceRow key={svc.id} svc={svc} health={healths[svc.id]} />
        ))}
      </div>

      {/* Port map */}
      <div style={{ marginTop: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Port Map
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {ALL_SERVICES.map((s, i) => (
            <div key={s.id} style={{
              padding: '14px 16px',
              borderRight: i < ALL_SERVICES.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
                :{s.port}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>{s.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
