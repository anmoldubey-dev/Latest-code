// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | RecordingRow()            |
// | * audio playback row      |
// +---------------------------+
//     |
//     |----> togglePlay()
//     |        * plays/pauses audio ref
//     |
//     v
// +---------------------------+
// | VoiceLab()                |
// | * TTS synthesis test page |
// +---------------------------+
//     |
//     |----> useEffect()
//     |        * fetches TTS health on mount
//     |
//     |----> useEffect()
//     |        * resets lang/voice on mode change
//     |
//     |----> useEffect()
//     |        * updates voice on lang change
//     |
//     |----> loadRecordings()
//     |        * fetches recording list
//     |
//     |----> generate()
//     |        * calls api.generate(), plays audio
//     |
//     |----> clearAll()
//     |        * deletes all recordings
//     |
//     |----> RecordingRow()
//     |        * renders each recording
//     |
//     v
// [ END ]
//
// ================================================================

import React, { useState, useEffect, useRef } from 'react'
import { Play, Trash2, Download, Globe2, Mic2, ChevronDown } from 'lucide-react'
import Btn from '../components/ui/Btn.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { ttsGlobalApi, ttsIndicApi } from '../api/client.js'

const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'urgent', 'calm']

const GLOBAL_LANG_VOICES = {
  English:    ['Emma (Warm Female)', 'James (Professional Male)'],
  French:     ['Sophie (Clear Female)', 'Louis (Calm Male)'],
  German:     ['Lena (Bright Female)', 'Klaus (Deep Male)'],
  Spanish:    ['Maria (Warm Female)', 'Carlos (Professional Male)'],
  Portuguese: ['Ana (Soft Female)', 'Pedro (Calm Male)'],
  Polish:     ['Zofia (Clear Female)', 'Marek (Warm Male)'],
  Italian:    ['Giulia (Expressive Female)', 'Marco (Professional Male)'],
  Dutch:      ['Fenna (Clear Female)', 'Lars (Calm Male)'],
}

const INDIC_LANG_VOICES = {
  'Hindi':             ['Divya (Warm Female)', 'Rohit (Professional Male)'],
  'English (Indian)':  ['Aditi (Clear Female)', 'Aakash (Assertive Male)'],
  'Marathi':           ['Sunita (Fluent Female)', 'Sanjay (Calm Male)'],
  'Bengali':           ['Riya (Warm Female)', 'Sourav (Professional Male)'],
  'Tamil':             ['Kavitha (Clear Female)', 'Karthik (Calm Male)'],
  'Telugu':            ['Padma (Bright Female)', 'Venkat (Authoritative Male)'],
  'Gujarati':          ['Nisha (Warm Female)', 'Bhavesh (Professional Male)'],
  'Kannada':           ['Rekha (Clear Female)', 'Sunil (Calm Male)'],
  'Malayalam':         ['Lakshmi (Soft Female)', 'Sreejith (Warm Male)'],
  'Punjabi':           ['Gurpreet (Bright Female)', 'Harjinder (Deep Male)'],
  'Odia':              ['Smita (Warm Female)', 'Bibhuti (Professional Male)'],
  'Assamese':          ['Mousumi (Soft Female)', 'Dipen (Calm Male)'],
  'Urdu':              ['Zara (Warm Female)', 'Faraz (Professional Male)'],
}

function RecordingRow({ rec, audioBase }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const url = `${audioBase}/audio/${rec.filename}`

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else {
      a.src = url
      a.play().then(() => setPlaying(true)).catch(() => {})
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
      borderBottom: '1px solid var(--border)',
    }}>
      <audio ref={audioRef} onEnded={() => setPlaying(false)} />
      <Btn variant="ghost" onClick={togglePlay} icon={playing ? undefined : Play} size="sm">
        {playing ? <Spinner size={12} /> : null}
        {playing ? 'Playing…' : 'Play'}
      </Btn>
      <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{rec.filename}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{rec.duration_seconds?.toFixed(1)}s</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(rec.size_bytes / 1024).toFixed(0)} KB</span>
      <a href={url} download={rec.filename} style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
        <Download size={13} />
      </a>
    </div>
  )
}

export default function VoiceLab() {
  const [mode, setMode] = useState('global') // 'global' | 'indic'
  const [text, setText] = useState("Hello! I'm your AI assistant. How can I help you today?")
  const [language, setLanguage] = useState('English')
  const [voice, setVoice] = useState('Emma (Warm Female)')
  const [emotion, setEmotion] = useState('neutral')
  const [loading, setLoading] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [error, setError] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [globalHealth, setGlobalHealth] = useState(null)
  const [indicHealth, setIndicHealth] = useState(null)
  const audioRef = useRef(null)

  const api = mode === 'global' ? ttsGlobalApi : ttsIndicApi
  const audioBase = mode === 'global' ? '/api/tts-global' : '/api/tts-indic'
  const langs = mode === 'global' ? GLOBAL_LANG_VOICES : INDIC_LANG_VOICES

  useEffect(() => {
    ttsGlobalApi.health().then(setGlobalHealth).catch(() => {})
    ttsIndicApi.health().then(setIndicHealth).catch(() => {})
  }, [])

  useEffect(() => {
    const firstLang = Object.keys(langs)[0]
    setLanguage(firstLang)
    setVoice(langs[firstLang][0])
  }, [mode])

  useEffect(() => {
    setVoice(langs[language]?.[0] ?? '')
  }, [language])

  async function loadRecordings() {
    try {
      const data = await api.recordings()
      setRecordings(data.recordings?.slice(-10).reverse() ?? [])
    } catch { setRecordings([]) }
  }

  useEffect(() => { loadRecordings() }, [mode])

  async function generate() {
    if (!text.trim()) return
    setLoading(true); setError(null); setLastResult(null)
    try {
      const res = await api.generate({ text: text.trim(), emotion, voice_name: voice, language })
      setLastResult(res)
      if (audioRef.current) {
        audioRef.current.src = `${audioBase}/audio/${res.filename}`
        audioRef.current.play().catch(() => {})
      }
      loadRecordings()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function clearAll() {
    if (!confirm('Delete all recordings on this service?')) return
    await api.deleteAll().catch(() => {})
    setRecordings([])
  }

  const activeHealth = mode === 'global' ? globalHealth : indicHealth

  return (
    <div className="animate-fade-in">
      <SectionHeader title="Voice Lab" subtitle="Test TTS synthesis across all supported languages and voices" />

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { k: 'global', label: 'Global TTS', icon: Globe2,  color: 'var(--purple)', port: 8003, health: globalHealth },
          { k: 'indic',  label: 'Indic TTS',  icon: Mic2,    color: 'var(--green)',  port: 8004, health: indicHealth },
        ].map(({ k, label, icon: Icon, color, port, health }) => (
          <button key={k} onClick={() => setMode(k)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${mode === k ? color : 'var(--border)'}`,
            background: mode === k ? color + '18' : 'transparent',
            color: mode === k ? color : 'var(--text-secondary)',
            fontSize: 12.5, fontWeight: mode === k ? 600 : 400, cursor: 'pointer',
            transition: 'all var(--t-fast)',
          }}>
            <Icon size={13} />
            {label}
            <span style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>:{port}</span>
            {health && (
              <StatusPill status={health.status === 'ready' ? 'online' : health.status === 'loading' ? 'loading' : 'offline'} />
            )}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        {/* Left panel: Language/Voice config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Language */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Language
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {Object.keys(langs).map(lang => (
                <button key={lang} onClick={() => setLanguage(lang)} style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 14px',
                  fontSize: 12.5,
                  color: language === lang ? 'var(--cyan)' : 'var(--text-secondary)',
                  background: language === lang ? 'var(--bg-active)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'background var(--t-fast)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  {lang}
                  {language === lang && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan)' }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Voice */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Voice
            </div>
            {(langs[language] ?? []).map(v => (
              <button key={v} onClick={() => setVoice(v)} style={{
                width: '100%', textAlign: 'left',
                padding: '8px 14px', fontSize: 12.5,
                color: voice === v ? 'var(--cyan)' : 'var(--text-secondary)',
                background: voice === v ? 'var(--bg-active)' : 'transparent',
                border: 'none', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', transition: 'background var(--t-fast)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                {v}
                {voice === v && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan)' }} />}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Input + Output */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Text input */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Text to Synthesize
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={4}
              style={{
                width: '100%', resize: 'none', border: 'none',
                background: 'transparent', padding: '14px',
                fontSize: 13, lineHeight: 1.6,
                borderRadius: 0,
              }}
              placeholder="Type text to synthesize…"
            />
          </div>

          {/* Emotion picker */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Emotion</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EMOTIONS.map(e => (
                <button key={e} onClick={() => setEmotion(e)} style={{
                  padding: '4px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 500,
                  border: `1px solid ${emotion === e ? 'var(--cyan)' : 'var(--border)'}`,
                  background: emotion === e ? 'var(--bg-active)' : 'transparent',
                  color: emotion === e ? 'var(--cyan)' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all var(--t-fast)',
                  textTransform: 'capitalize',
                }}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Generate */}
          <Btn variant="primary" size="lg" onClick={generate} loading={loading} disabled={!text.trim()}>
            {loading ? 'Synthesizing…' : 'Generate Audio'}
          </Btn>

          {/* Error */}
          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--red-dim)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          {/* Result */}
          {lastResult && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-cyan)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
              <audio ref={audioRef} controls style={{ width: '100%', height: 32, marginBottom: 12 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  ['Duration', `${lastResult.duration_seconds}s`],
                  ['Gen Time', `${lastResult.generation_time_seconds}s`],
                  ['File', lastResult.filename],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recordings */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Recordings ({recordings.length})
              </span>
              <Btn variant="danger" size="sm" icon={Trash2} onClick={clearAll}>Clear All</Btn>
            </div>
            {recordings.length === 0
              ? <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No recordings yet</div>
              : recordings.map(rec => <RecordingRow key={rec.filename} rec={rec} audioBase={audioBase} />)
            }
          </div>
        </div>
      </div>
    </div>
  )
}
