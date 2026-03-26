// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | AudioPipeline()           |
// | * end-to-end pipeline test|
// +---------------------------+
//     |
//     |----> loadAssets()
//     |        * fetches WAV files list
//     |
//     |----> runPipeline()
//     |        * animates steps, posts audio
//     |
//     v
// [ END ]
//
// ================================================================

import React, { useState } from 'react'
import { Upload, Play, Layers, ArrowDown, CheckCircle2 } from 'lucide-react'
import Btn from '../components/ui/Btn.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import Spinner from '../components/ui/Spinner.jsx'

const PIPELINE_STEPS = [
  { id: 'stt',         label: 'Speech-to-Text',         icon: '🎤', desc: 'Whisper large-v3 · VAD filter · 16kHz mono' },
  { id: 'diarization', label: 'Speaker Diarization',    icon: '👥', desc: 'Pyannote 3.1 · segment assignment' },
  { id: 'merge',       label: 'Transcript Merge',       icon: '🔀', desc: 'Align text + speaker segments by time' },
  { id: 'llm',         label: 'LLM Response',           icon: '🧠', desc: 'Gemini 2.5 Flash · max 200 tokens' },
  { id: 'memory',      label: 'Save to Memory',         icon: '💾', desc: 'FAISS vector store · MiniLM-L6-v2 embed' },
  { id: 'tts',         label: 'TTS Synthesis',          icon: '🔊', desc: 'Parler TTS · language-aware routing' },
]

export default function AudioPipeline() {
  const [filename, setFilename] = useState('')
  const [running, setRunning] = useState(false)
  const [activeStep, setActiveStep] = useState(-1)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [assets, setAssets] = useState([])
  const [loadingAssets, setLoadingAssets] = useState(false)

  async function loadAssets() {
    setLoadingAssets(true)
    try {
      const d = await fetch('/api/backend/list-assets').then(r => r.json())
      setAssets(d.files ?? [])
    } catch { setAssets([]) } finally { setLoadingAssets(false) }
  }

  async function runPipeline() {
    if (!filename) return
    setRunning(true); setResult(null); setError(null); setActiveStep(0)
    try {
      // Animate through steps
      for (let i = 0; i < PIPELINE_STEPS.length; i++) {
        setActiveStep(i)
        await new Promise(r => setTimeout(r, 600))
      }
      const res = await fetch('/api/backend/process-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      }).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() })
      setResult(res)
      setActiveStep(PIPELINE_STEPS.length) // all done
    } catch (e) {
      setError(e.message)
      setActiveStep(-1)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <SectionHeader title="Audio Pipeline" subtitle="Full end-to-end pipeline test — STT → Diarization → LLM → TTS" />

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        {/* Left: File selector + trigger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Audio Files (assets/)
              </span>
              <Btn variant="ghost" size="sm" onClick={loadAssets} loading={loadingAssets}>Load</Btn>
            </div>
            {assets.length === 0 ? (
              <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                <Upload size={20} style={{ opacity: 0.2, marginBottom: 8 }} />
                <div>Click "Load" to list WAV files in assets/</div>
              </div>
            ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {assets.map(f => (
                  <button key={f} onClick={() => setFilename(f)} style={{
                    width: '100%', textAlign: 'left', padding: '8px 14px',
                    fontSize: 12, fontFamily: 'var(--font-mono)',
                    color: filename === f ? 'var(--cyan)' : 'var(--text-secondary)',
                    background: filename === f ? 'var(--bg-active)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', transition: 'background var(--t-fast)',
                  }}>
                    {f}
                  </button>
                ))}
              </div>
            )}
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
                Or type filename
              </label>
              <input
                value={filename}
                onChange={e => setFilename(e.target.value)}
                placeholder="input.wav"
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </div>
          </div>

          <Btn variant="primary" size="lg" icon={Play} onClick={runPipeline} disabled={!filename || running} loading={running}>
            {running ? 'Processing…' : 'Run Pipeline'}
          </Btn>
        </div>

        {/* Right: Pipeline visualization + result */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Steps */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              Pipeline Steps
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {PIPELINE_STEPS.map((step, i) => {
                const done    = activeStep > i
                const current = activeStep === i && running
                const pending = activeStep < i || activeStep === -1

                return (
                  <div key={step.id}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: current ? 'var(--bg-active)' : done ? 'var(--green-dim)' : 'transparent',
                      border: `1px solid ${current ? 'var(--border-cyan)' : done ? 'rgba(0,201,123,0.2)' : 'transparent'}`,
                      transition: 'all var(--t-med)',
                    }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                        background: done ? 'var(--green-dim)' : current ? 'var(--cyan-dim)' : 'var(--bg-elevated)',
                        flexShrink: 0,
                      }}>
                        {current ? <Spinner size={14} /> : done ? <CheckCircle2 size={14} style={{ color: 'var(--green)' }} /> : step.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: current ? 600 : 500, color: done ? 'var(--green)' : current ? 'var(--cyan)' : pending ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                          {step.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{step.desc}</div>
                      </div>
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div style={{ paddingLeft: 26, paddingBlock: 2 }}>
                        <ArrowDown size={10} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Result */}
          {error && (
            <div style={{ padding: '12px 14px', background: 'var(--red-dim)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--red)' }}>
              Pipeline error: {error}
            </div>
          )}

          {result && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-cyan)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 500, color: 'var(--cyan)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Pipeline Result
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['Transcript',  result.transcript,      'var(--text-primary)'],
                  ['AI Response', result.ai_response,     'var(--text-primary)'],
                  ['Language',    result.detected_language,'var(--cyan)'],
                  ['Time',        `${result.processing_time?.toFixed(2)}s`, 'var(--green)'],
                ].map(([k, v, c]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{k}</div>
                    <div style={{ fontSize: 13, color: c, lineHeight: 1.5 }}>{v}</div>
                  </div>
                ))}
                {result.audio_url && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Audio Output</div>
                    <audio controls src={`/api/backend${result.audio_url}`} style={{ width: '100%', height: 32 }} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
