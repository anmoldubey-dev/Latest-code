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

import React, { useEffect, useState } from 'react'
import { Activity, Mic2, BrainCircuit, Globe2, Zap, Layers } from 'lucide-react'
import MetricCard from '../components/ui/MetricCard.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { useServiceHealth } from '../hooks/useServiceHealth.js'
import { backendApi, ttsGlobalApi, ttsIndicApi } from '../api/client.js'

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


export default function Dashboard() {
  const { services, loading } = useServiceHealth(6000)
  const [ttsGlobalData, setTtsGlobalData] = useState(null)
  const [ttsIndicData, setTtsIndicData] = useState(null)
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
      <div className="dash-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <MetricCard label="Services Online" value={loading ? '…' : `${onlineCount}`} sub={`of ${enrichedServices.length} total`} accent="var(--green)" icon={Activity} />
        <MetricCard label="Languages"       value="28"      sub="11 Indic + 17 Global"            accent="var(--cyan)"   icon={Globe2}  />
        <MetricCard label="TTS Voices"      value="42"      sub="Global + Indic combined"         accent="var(--purple)" icon={Mic2}    />
        <MetricCard label="STT Model"       value="large-v3" sub="faster-whisper · CTranslate2"  accent="var(--yellow)" icon={Zap}     />
      </div>

      <div>
        {/* Services grid */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Microservices
          </div>
          <div className="dash-services" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {enrichedServices.map(s => (
              <ServiceCard key={s.name} {...s} />
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
