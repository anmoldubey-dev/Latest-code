// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | ServiceCard()             |
// | * single service status   |
// +---------------------------+
//     |
//     |----> StatusPill()
//     |        * display service health
//     |
//     v
// +---------------------------+
// | ActivityFeed()            |
// | * recent event list       |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | Dashboard()               |
// | * system overview page    |
// +---------------------------+
//     |
//     |----> useServiceHealth()
//     |        * poll service statuses
//     |
//     |----> useEffect()
//     |        * fetch TTS health
//     |
//     |----> ServiceCard()
//     |        * render service cards
//     |
//     |----> ActivityFeed()
//     |        * render activity feed
//     |
//     v
// [ END ]
// ================================================================

import React, { useState, useEffect } from 'react'
import { Activity, Mic2, BrainCircuit, Globe2, HardDrive, Zap, Clock, Layers } from 'lucide-react'
import MetricCard from '../components/ui/MetricCard.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { useServiceHealth } from '../hooks/useServiceHealth.js'
import { backendApi, ttsGlobalApi, ttsIndicApi } from '../api/client.js'

const SERVICE_CONFIGS = [
  { name: 'Backend API',    port: 8000, icon: Activity,     color: 'var(--cyan)',   path: '/services' },
  { name: 'TTS Global',     port: 8003, icon: Globe2,       color: 'var(--purple)', path: '/voice-lab' },
  { name: 'TTS Indic',      port: 8004, icon: Mic2,         color: 'var(--green)',  path: '/voice-lab' },
  { name: 'Diarization',    port: 8001, icon: Layers,       color: 'var(--yellow)', path: '/pipeline'  },
  { name: 'LiveKit',        port: 7880, icon: BrainCircuit, color: 'var(--cyan)',   path: '/livekit'   },
]

function ServiceCard({ name, port, icon: Icon, color, status, model, device }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      transition: 'border-color var(--t-fast)',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = color + '44'}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: color + '18',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${color}33`,
          }}>
            <Icon size={14} style={{ color }} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>{name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>:{port}</div>
          </div>
        </div>
        <StatusPill
          status={status === 'loading' ? 'loading' : status === true || status === 'online' || status === 'ready' ? 'online' : 'offline'}
          pulse={status === 'loading'}
        />
      </div>
      {model && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          {model}
          {device && <span style={{ marginLeft: 8, color: 'var(--cyan)', opacity: 0.7 }}>{device.toUpperCase()}</span>}
        </div>
      )}
    </div>
  )
}

function ActivityFeed({ items }) {
  if (!items.length) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 12 }}>
      No recent activity
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          padding: '10px 12px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          transition: 'background var(--t-fast)',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{
            width: 6, height: 6, borderRadius: '50%', marginTop: 4, flexShrink: 0,
            background: item.type === 'error' ? 'var(--red)' : item.type === 'success' ? 'var(--green)' : 'var(--cyan)',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }} className="truncate">{item.message}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{item.time}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { services, loading } = useServiceHealth(6000)
  const [ttsGlobalData, setTtsGlobalData] = useState(null)
  const [ttsIndicData, setTtsIndicData] = useState(null)
  const [activity] = useState([
    { type: 'success', message: 'STT model large-v3 loaded on CPU', time: 'Just now' },
    { type: 'info',    message: 'Voice registry built — 21 languages, 42 voices', time: '2 min ago' },
    { type: 'info',    message: 'FAISS index loaded from backend/faiss_index', time: '2 min ago' },
    { type: 'success', message: 'Gemini 2.5 Flash LLM connected', time: '3 min ago' },
    { type: 'info',    message: 'TTS Global service started on :8003', time: '5 min ago' },
    { type: 'info',    message: 'TTS Indic service started on :8004', time: '5 min ago' },
    { type: 'info',    message: 'Diarization microservice started on :8001', time: '6 min ago' },
  ])

  useEffect(() => {
    ttsGlobalApi.health().then(setTtsGlobalData).catch(() => {})
    ttsIndicApi.health().then(setTtsIndicData).catch(() => {})
  }, [])

  const onlineCount = services.filter(s => s.ok).length

  // Build enriched service list
  const enrichedServices = [
    { name: 'Backend API',  port: 8000, icon: Activity,     color: 'var(--cyan)',   ...services.find(s => s.name === 'Backend') },
    { name: 'TTS Global',   port: 8003, icon: Globe2,       color: 'var(--purple)', status: ttsGlobalData?.status, model: ttsGlobalData?.model, device: ttsGlobalData?.device },
    { name: 'TTS Indic',    port: 8004, icon: Mic2,         color: 'var(--green)',  status: ttsIndicData?.status,  model: ttsIndicData?.model,  device: ttsIndicData?.device  },
    { name: 'Diarization',  port: 8001, icon: Layers,       color: 'var(--yellow)', status: 'offline' },
    { name: 'LiveKit',      port: 7880, icon: BrainCircuit, color: 'var(--cyan)',   status: services.find(s => s.name === 'Backend')?.ok ? 'ready' : 'offline', model: 'ws://localhost:7880' },
  ]

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="System Overview"
        subtitle="Real-time status across all Voice AI microservices"
      />

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <MetricCard label="Services Online" value={loading ? '…' : `${onlineCount}`} sub={`of ${enrichedServices.length} total`} accent="var(--green)" icon={Activity} />
        <MetricCard label="Languages"       value="28"      sub="11 Indic + 17 Global"            accent="var(--cyan)"   icon={Globe2}  />
        <MetricCard label="TTS Voices"      value="42"      sub="Global + Indic combined"         accent="var(--purple)" icon={Mic2}    />
        <MetricCard label="STT Model"       value="large-v3" sub="faster-whisper · CTranslate2"  accent="var(--yellow)" icon={Zap}     />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Services grid */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Microservices
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {enrichedServices.map(s => (
              <ServiceCard key={s.name} {...s} />
            ))}
          </div>

          {/* Quick info row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
            {[
              { icon: HardDrive, label: 'FAISS Index',    value: 'backend/faiss_index', color: 'var(--cyan)' },
              { icon: Clock,     label: 'VAD Silence Gap', value: '550 ms',             color: 'var(--purple)' },
              { icon: Zap,       label: 'LLM Tokens Max',  value: '200 (Gemini)',       color: 'var(--green)' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Icon size={13} style={{ color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity feed */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Recent Activity
          </div>
          <div style={{ padding: '6px 4px', overflowY: 'auto', maxHeight: 380 }}>
            <ActivityFeed items={activity} />
          </div>
        </div>
      </div>
    </div>
  )
}
