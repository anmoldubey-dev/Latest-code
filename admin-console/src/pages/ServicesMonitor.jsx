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

import React, { useState, useCallback, useEffect } from 'react'
import { RefreshCw, Activity, Globe2, Mic2, Layers, Radio, Languages, AudioWaveform, Gauge, Cpu, MemoryStick, PhoneCall, Minus, Plus } from 'lucide-react'
import StatusPill from '../components/ui/StatusPill.jsx'
import Btn from '../components/ui/Btn.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { useManualRefresh } from '../hooks/usePolling.js'
import { checkAllHealth, backendApi } from '../api/client.js'

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

// ── Capacity Tab ──────────────────────────────────────────────────────────────
function CapacityTab() {
  const [cap, setCap]       = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [val, setVal]       = useState(10)

  const load = useCallback(async () => {
    try {
      const d = await backendApi.getCapacity()
      setCap(d)
      setVal(d.max_calls)
    } catch {}
  }, [])

  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t) }, [load])

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      await backendApi.setCapacity(val)
      await load()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* silently ignore */ }
    finally { setSaving(false) }
  }

  const sys = cap?.system || {}
  const used = cap?.active_total ?? 0
  const max  = cap?.max_calls ?? val
  const pct  = max ? Math.round((used / max) * 100) : 0
  const barColor = pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--gold)' : 'var(--green)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Active calls bar */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Active Calls</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: barColor }}>{used} / {max}</span>
        </div>
        <div style={{ height: 8, background: 'var(--bg-overlay)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.4s' }} />
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          {cap?.slots_free ?? 0} slots free · {cap?.by_voice && Object.keys(cap.by_voice).length} voice(s) busy
        </div>
      </div>

      {/* System stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { icon: Cpu,         label: 'CPU',       val: sys.cpu_pct != null ? `${sys.cpu_pct}%` : '—',                        color: 'var(--purple)' },
          { icon: MemoryStick, label: 'RAM Free',  val: sys.ram_free_gb != null ? `${sys.ram_free_gb} GB` : '—',              color: 'var(--cyan)'   },
          { icon: MemoryStick, label: 'RAM Used',  val: sys.ram_pct != null ? `${sys.ram_pct}%` : '—',                        color: 'var(--gold)'   },
          { icon: PhoneCall,   label: 'Recommend', val: cap?.recommended_max != null ? `≤ ${cap.recommended_max} calls` : '—', color: 'var(--green)'  },
        ].map(({ icon: Icon, label, val: v, color }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: color + '18', border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={13} style={{ color }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{v}</div>
            </div>
          </div>
        ))}
      </div>

      {/* System recommendation note */}
      {cap?.recommended_max && (
        <div style={{ background: 'rgba(212,168,83,0.07)', border: '1px solid rgba(212,168,83,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--gold)' }}>
          Based on your available RAM ({sys.ram_free_gb} GB free), we recommend keeping max calls at <strong>≤ {cap.recommended_max}</strong> to avoid overload.
        </div>
      )}

      {/* Max calls setter */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Max Concurrent Calls</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setVal(v => Math.max(1, v - 1))} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-overlay)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Minus size={14} />
          </button>
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', minWidth: 36, textAlign: 'center' }}>{val}</span>
          <button onClick={() => setVal(v => Math.min(50, v + 1))} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-overlay)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={14} />
          </button>
          <button onClick={save} disabled={saving} style={{ marginLeft: 8, padding: '7px 16px', borderRadius: 8, background: saved ? 'rgba(80,200,120,0.15)' : 'rgba(212,168,83,0.15)', border: `1px solid ${saved ? 'rgba(80,200,120,0.4)' : 'rgba(212,168,83,0.3)'}`, color: saved ? 'var(--green)' : 'var(--gold)', fontSize: 12, cursor: 'pointer', transition: 'all 0.3s' }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Apply'}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>Range: 1 – 50 · Applied instantly, no restart needed</div>
      </div>

      {/* Per-voice breakdown */}
      {cap?.by_voice && Object.keys(cap.by_voice).length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Active by Voice</div>
          {Object.entries(cap.by_voice).map(([voice, count]) => (
            <div key={voice} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
              <span>{voice}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{count} active</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ServicesMonitor() {
  const [tab, setTab]       = useState('services')
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

  useManualRefresh(fetchAll, 12000)

  const TABS = [
    { id: 'services',  label: 'Services' },
    { id: 'capacity',  label: 'Capacity' },
  ]

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Services Monitor"
        subtitle="Health, status and capacity of all Voice AI microservices"
        action={
          tab === 'services' && (
            <Btn variant="secondary" icon={RefreshCw} loading={refreshing} onClick={fetchAll}>
              Refresh
            </Btn>
          )
        }
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', fontSize: 12.5, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? 'var(--gold)' : 'var(--text-muted)',
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid var(--gold)' : '2px solid transparent',
            marginBottom: -1, transition: 'all var(--t-fast)',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'services' && (
        <>
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

          <div style={{ marginTop: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Port Map
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {ALL_SERVICES.map((s, i) => (
                <div key={s.id} style={{ padding: '14px 16px', borderRight: i < ALL_SERVICES.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>:{s.port}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>{s.name}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'capacity' && <CapacityTab />}
    </div>
  )
}
