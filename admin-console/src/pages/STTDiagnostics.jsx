// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | RMSBar()                  |
// | * audio level meter bar   |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | STTDiagnostics()          |
// | * live STT test page      |
// +---------------------------+
//     |
//     |----> useEffect()
//     |        * scrolls transcript log
//     |
//     |----> useEffect()
//     |        * cleanup on unmount
//     |
//     |----> startSession()
//     |        * opens mic + WebSocket
//     |
//     |----> stopSession()
//     |        * closes ws, mic, AudioContext
//     |
//     |----> RMSBar()
//     |        * renders live RMS level
//     |
//     v
// [ END ]
//
// ================================================================

import React, { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Radio } from 'lucide-react'
import Btn from '../components/ui/Btn.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'

const ALL_LANGS = [
  { code: 'hi', name: 'Hindi', script: 'Devanagari' },
  { code: 'en', name: 'English', script: 'Latin' },
  { code: 'en-in', name: 'English (Indian)', script: 'Latin' },
  { code: 'mr', name: 'Marathi', script: 'Devanagari' },
  { code: 'bn', name: 'Bengali', script: 'Bengali' },
  { code: 'ta', name: 'Tamil', script: 'Tamil' },
  { code: 'te', name: 'Telugu', script: 'Telugu' },
  { code: 'gu', name: 'Gujarati', script: 'Gujarati' },
  { code: 'kn', name: 'Kannada', script: 'Kannada' },
  { code: 'ml', name: 'Malayalam', script: 'Malayalam' },
  { code: 'pa', name: 'Punjabi', script: 'Gurmukhi' },
  { code: 'or', name: 'Odia', script: 'Odia' },
  { code: 'as', name: 'Assamese', script: 'Bengali' },
  { code: 'ur', name: 'Urdu', script: 'Nastaliq' },
  { code: 'ne', name: 'Nepali', script: 'Devanagari' },
  { code: 'fr', name: 'French', script: 'Latin' },
  { code: 'de', name: 'German', script: 'Latin' },
  { code: 'es', name: 'Spanish', script: 'Latin' },
  { code: 'pt', name: 'Portuguese', script: 'Latin' },
  { code: 'pl', name: 'Polish', script: 'Latin' },
  { code: 'it', name: 'Italian', script: 'Latin' },
  { code: 'nl', name: 'Dutch', script: 'Latin' },
  { code: 'ar', name: 'Arabic', script: 'Arabic' },
  { code: 'ru', name: 'Russian', script: 'Cyrillic' },
  { code: 'zh', name: 'Chinese', script: 'Hanzi' },
  { code: 'ja', name: 'Japanese', script: 'Hiragana/Katakana' },
  { code: 'ko', name: 'Korean', script: 'Hangul' },
  { code: 'tr', name: 'Turkish', script: 'Latin' },
]

const VAD_PARAMS = {
  speechRMS:     0.009,
  silenceRMS:    0.0015,
  minSpeech:     300,
  silenceGap:    550,
  maxUtterance:  15000,
  floorRMS:      0.015,
  noSpeechThreshold: 0.6,
  vadThreshold:  0.35,
}

function RMSBar({ rms = 0 }) {
  const pct = Math.min(100, (rms / 0.1) * 100)
  const color = rms > VAD_PARAMS.speechRMS ? 'var(--green)' : rms > VAD_PARAMS.silenceRMS ? 'var(--yellow)' : 'var(--text-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 100ms, background 200ms', boxShadow: `0 0 6px ${color}` }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: 40, textAlign: 'right' }}>
        {rms.toFixed(4)}
      </span>
    </div>
  )
}

export default function STTDiagnostics() {
  const [lang, setLang] = useState('en')
  const [status, setStatus] = useState('idle') // idle | connecting | active | error
  const [rms, setRms] = useState(0)
  const [transcripts, setTranscripts] = useState([])
  const [wsStatus, setWsStatus] = useState('disconnected')
  const wsRef = useRef(null)
  const mediaRef = useRef(null)
  const processorRef = useRef(null)
  const ctxRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcripts])

  useEffect(() => () => stopSession(), [])

  async function startSession() {
    setStatus('connecting')
    setTranscripts([])
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })
      mediaRef.current = stream

      const ctx = new AudioContext({ sampleRate: 16000 })
      ctxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)

      await ctx.audioWorklet.addModule('/worklet-processor.js')
      const node = new AudioWorkletNode(ctx, 'pcm-processor')
      processorRef.current = node

      const ws = new WebSocket(`ws://localhost:8000/ws/stt-test?lang=${lang}&gap=1000`)
      wsRef.current = ws
      setWsStatus('connecting')

      ws.onopen = () => { setWsStatus('connected'); setStatus('active') }
      ws.onclose = () => { setWsStatus('disconnected'); setStatus('idle') }
      ws.onerror = () => { setWsStatus('error'); setStatus('error') }
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'transcript') {
          setTranscripts(t => [...t, { text: msg.text, rms: msg.rms, elapsed: msg.elapsed_ms, ts: new Date().toLocaleTimeString() }])
          setRms(msg.rms ?? 0)
        } else if (msg.type === 'skipped') {
          setRms(msg.rms ?? 0)
        }
      }

      node.port.onmessage = (e) => {
        const pcm = e.data
        const sum = pcm.reduce((a, v) => a + v * v, 0)
        setRms(Math.sqrt(sum / pcm.length))
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(pcm.buffer)
        }
      }

      src.connect(node)
      node.connect(ctx.destination)

    } catch (err) {
      setStatus('error')
      setTranscripts(t => [...t, { text: `❌ ${err.message}`, ts: new Date().toLocaleTimeString(), error: true }])
    }
  }

  function stopSession() {
    wsRef.current?.close()
    processorRef.current?.disconnect()
    ctxRef.current?.close().catch(() => {})
    mediaRef.current?.getTracks().forEach(t => t.stop())
    setStatus('idle'); setRms(0)
  }

  const selectedLang = ALL_LANGS.find(l => l.code === lang)

  return (
    <div className="animate-fade-in">
      <SectionHeader title="STT Diagnostics" subtitle="Live speech-to-text testing with VAD visualization — Whisper large-v3" />

      {/* Worklet note */}
      <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--yellow-dim)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 'var(--radius-sm)', fontSize: 11.5, color: 'var(--yellow)' }}>
        Requires <code style={{ fontFamily: 'var(--font-mono)' }}>public/worklet-processor.js</code> — backend WebSocket at ws://localhost:8000/ws/stt-test
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        {/* Left: Lang selector + VAD params */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Language */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Language ({ALL_LANGS.length})
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {ALL_LANGS.map(l => (
                <button key={l.code} onClick={() => setLang(l.code)} style={{
                  width: '100%', textAlign: 'left',
                  padding: '7px 14px', fontSize: 12.5,
                  color: lang === l.code ? 'var(--cyan)' : 'var(--text-secondary)',
                  background: lang === l.code ? 'var(--bg-active)' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', transition: 'background var(--t-fast)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span>{l.name}</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', opacity: 0.5 }}>{l.code}</span>
                </button>
              ))}
            </div>
          </div>

          {/* VAD params */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              VAD Parameters
            </div>
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                ['Speech RMS',     VAD_PARAMS.speechRMS,    'var(--green)'],
                ['Silence RMS',    VAD_PARAMS.silenceRMS,   'var(--yellow)'],
                ['Floor RMS',      VAD_PARAMS.floorRMS,     'var(--text-muted)'],
                ['Min Speech',     `${VAD_PARAMS.minSpeech}ms`,     'var(--cyan)'],
                ['Silence Gap',    `${VAD_PARAMS.silenceGap}ms`,    'var(--cyan)'],
                ['Max Utterance',  `${VAD_PARAMS.maxUtterance/1000}s`, 'var(--cyan)'],
                ['VAD Threshold',  VAD_PARAMS.vadThreshold, 'var(--purple)'],
                ['No-Speech Thr.', VAD_PARAMS.noSpeechThreshold, 'var(--red)'],
              ].map(([k, v, c]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k}</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: c }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Active session */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Controls */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: status === 'active' ? 'var(--green-dim)' : 'var(--bg-elevated)',
                  border: `1px solid ${status === 'active' ? 'var(--green)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all var(--t-med)',
                }}>
                  {status === 'active'
                    ? <Mic size={16} style={{ color: 'var(--green)', animation: 'pulse-dot 1.4s infinite' }} />
                    : <MicOff size={16} style={{ color: 'var(--text-muted)' }} />
                  }
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {status === 'active' ? 'Recording…' : status === 'connecting' ? 'Connecting…' : 'Ready to record'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Language: <span style={{ color: 'var(--cyan)' }}>{selectedLang?.name} ({lang})</span> · Script: {selectedLang?.script}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StatusPill status={wsStatus === 'connected' ? 'online' : wsStatus === 'connecting' ? 'loading' : 'offline'} label={wsStatus} pulse={wsStatus === 'connecting'} />
                {status === 'active'
                  ? <Btn variant="danger" onClick={stopSession} icon={MicOff}>Stop</Btn>
                  : <Btn variant="primary" onClick={startSession} loading={status === 'connecting'} icon={Mic}>Start Recording</Btn>
                }
              </div>
            </div>

            {/* RMS meter */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Input Level (RMS)</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {rms > VAD_PARAMS.speechRMS ? '🎤 Speech detected' : rms > VAD_PARAMS.silenceRMS ? '🔇 Low signal' : '— Silence'}
                </span>
              </div>
              <RMSBar rms={rms} />
            </div>
          </div>

          {/* Transcript log */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Transcript Log ({transcripts.length})
              </span>
              {transcripts.length > 0 && (
                <Btn variant="ghost" size="sm" onClick={() => setTranscripts([])}>Clear</Btn>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px', maxHeight: 340 }}>
              {transcripts.length === 0
                ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Transcripts will appear here…</div>
                : transcripts.map((t, i) => (
                  <div key={i} style={{
                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                    transition: 'background var(--t-fast)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: 13, color: t.error ? 'var(--red)' : 'var(--text-primary)', lineHeight: 1.5 }}>{t.text}</div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.ts}</span>
                      {t.rms !== undefined && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>rms={t.rms?.toFixed(4)}</span>}
                      {t.elapsed !== undefined && <span style={{ fontSize: 10, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{t.elapsed}ms</span>}
                    </div>
                  </div>
                ))
              }
              <div ref={endRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
