/*
===========================================================================
ASCII EXECUTION FLOW -- App.jsx (Voice Cloner Frontend)
===========================================================================

  Browser loads page
       |
       v
+----------------------+
| App()                |
| * root UI component  |
+----------------------+
       |
       |----> handleFile()
       |         |
       |         |----> getFileDuration()
       |
       |----> insertTag()
       |         |
       |         |----> requestAnimationFrame()
       |
       |----> applyMood()
       |
       |----> onDrop()
       |         |
       |         |----> handleFile()
       |
       |----> generate()
       |         |
       |         |----> fetch()   POST /api/generate
       |         |
       |         |----> setRecordings()
       |
       |----> deleteRecording()
       |         |
       |         |----> URL.revokeObjectURL()
       |
       |----> downloadRec()
       |
       |----> reset()
       |
       v
+----------------------+
| LangSelect()         |
| * language dropdown  |
+----------------------+
       |
       |----> useState()
       |----> useEffect()   close on outside click
       |----> onChange()
       |
       v
+----------------------+
| RecordingRow()       |
| * single saved clip  |
+----------------------+
       |
       |----> useState()
       |----> useEffect()   track play/pause/ended
       |----> onDownload()
       |----> onDelete()
       |
       v
+----------------------+
| HowToRun()           |
| * setup instructions |
+----------------------+

===========================================================================
*/

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  Mic, Upload, Wand2, Download, RotateCcw,
  CheckCircle, AlertCircle, Loader, Zap, Settings2, Info, Trash2, ChevronDown, ChevronUp
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────
const API = '/api'
const MIN_DUR = 10
const MAX_DUR = 60

const LANGUAGES = [
  { code: 'en', name: 'English',    flag: '🇬🇧' },
  { code: 'ar', name: 'Arabic',     flag: '🇸🇦' },
  { code: 'da', name: 'Danish',     flag: '🇩🇰' },
  { code: 'de', name: 'German',     flag: '🇩🇪' },
  { code: 'el', name: 'Greek',      flag: '🇬🇷' },
  { code: 'es', name: 'Spanish',    flag: '🇪🇸' },
  { code: 'fi', name: 'Finnish',    flag: '🇫🇮' },
  { code: 'fr', name: 'French',     flag: '🇫🇷' },
  { code: 'he', name: 'Hebrew',     flag: '🇮🇱' },
  { code: 'hi', name: 'Hindi',      flag: '🇮🇳' },
  { code: 'it', name: 'Italian',    flag: '🇮🇹' },
  { code: 'ja', name: 'Japanese',   flag: '🇯🇵' },
  { code: 'ko', name: 'Korean',     flag: '🇰🇷' },
  { code: 'ms', name: 'Malay',      flag: '🇲🇾' },
  { code: 'nl', name: 'Dutch',      flag: '🇳🇱' },
  { code: 'no', name: 'Norwegian',  flag: '🇳🇴' },
  { code: 'pl', name: 'Polish',     flag: '🇵🇱' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian',    flag: '🇷🇺' },
  { code: 'sv', name: 'Swedish',    flag: '🇸🇪' },
  { code: 'sw', name: 'Swahili',    flag: '🇰🇪' },
  { code: 'tr', name: 'Turkish',    flag: '🇹🇷' },
  { code: 'zh', name: 'Chinese',    flag: '🇨🇳' },
]

const MOODS = [
  { id: 'neutral',  label: 'Neutral',  emoji: '😐', exaggeration: 0.35, cfgWeight: 0.50 },
  { id: 'happy',    label: 'Happy',    emoji: '😊', exaggeration: 0.70, cfgWeight: 0.60 },
  { id: 'sad',      label: 'Sad',      emoji: '😢', exaggeration: 0.60, cfgWeight: 0.40 },
  { id: 'angry',    label: 'Angry',    emoji: '😠', exaggeration: 0.85, cfgWeight: 0.70 },
  { id: 'excited',  label: 'Excited',  emoji: '🤩', exaggeration: 0.90, cfgWeight: 0.65 },
  { id: 'whisper',  label: 'Whisper',  emoji: '🤫', exaggeration: 0.20, cfgWeight: 0.30 },
]

const TAGS = ['[laugh]', '[sigh]', '[breath]', '[cough]']

// ── Tiny helpers ──────────────────────────────────────────────────────────
function fmt(secs) {
  if (secs == null) return '—'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function DurBadge({ dur, valid }) {
  const col = valid === false ? '#f0503c' : valid === true ? '#3ec97a' : 'rgba(240,236,227,0.35)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      background: col + '18', border: `1px solid ${col}30`,
      color: col, fontSize: 10.5, fontWeight: 500, whiteSpace: 'nowrap',
    }}>
      {fmt(dur)}
    </span>
  )
}

function Pill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 14px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
      border: `1px solid ${active ? 'rgba(212,168,83,0.45)' : 'rgba(255,255,255,0.08)'}`,
      background: active ? 'rgba(212,168,83,0.12)' : 'rgba(255,255,255,0.03)',
      color: active ? '#d4a853' : 'rgba(240,236,227,0.5)',
      cursor: 'pointer', transition: 'all 0.15s ease',
    }}>{label}</button>
  )
}

function WaveViz({ playing }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 24 }}>
      {[0.3, 0.6, 1, 0.7, 0.45, 0.8, 0.55].map((h, i) => (
        <div key={i} style={{
          width: 3, height: 24 * h, borderRadius: 2,
          background: playing ? '#d4a853' : 'rgba(212,168,83,0.35)',
          animation: playing ? `wave 0.8s ease-in-out ${i * 0.1}s infinite` : 'none',
          transition: 'background 0.2s',
        }} />
      ))}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  // Reference audio
  const [refFile,    setRefFile]    = useState(null)
  const [refUrl,     setRefUrl]     = useState(null)
  const [refDur,     setRefDur]     = useState(null)
  const [refValid,   setRefValid]   = useState(null)
  const [refErr,     setRefErr]     = useState(null)
  const [dragging,   setDragging]   = useState(false)
  const [refPlaying, setRefPlaying] = useState(false)

  // Generation settings
  const [text,         setText]        = useState('')
  const [model,        setModel]       = useState('standard')
  const [mood,         setMood]        = useState('neutral')
  const [exaggeration, setExaggeration]= useState(0.35)
  const [cfgWeight,    setCfgWeight]   = useState(0.50)
  const [language,     setLanguage]    = useState('en')
  const [showAdvanced, setShowAdvanced]= useState(false)
  const [showHowTo,    setShowHowTo]   = useState(false)

  // Generation state
  const [loading,    setLoading]    = useState(false)
  const [recordings, setRecordings] = useState([])   // [{id, url, label, text, mood, genTime, ts}]
  const [error,      setError]      = useState(null)

  // Refs
  const fileInputRef  = useRef(null)
  const refAudioRef   = useRef(null)
  const textareaRef   = useRef(null)
  const audioRefs     = useRef({})   // keyed by recording id

  // ── Mood change ───────────────────────────────────────────────────────
  const applyMood = (moodId) => {
    setMood(moodId)
    if (model === 'standard') {
      const m = MOODS.find(m => m.id === moodId)
      if (m) { setExaggeration(m.exaggeration); setCfgWeight(m.cfgWeight) }
    }
  }

  // ── Tag insertion ─────────────────────────────────────────────────────
  const insertTag = (tag) => {
    const el = textareaRef.current
    if (!el) { setText(t => t + tag); return }
    const start = el.selectionStart
    const end   = el.selectionEnd
    const before = text.slice(0, start)
    const after  = text.slice(end)
    const newText = (before + tag + after).slice(0, 500)
    setText(newText)
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + tag.length
      el.focus()
    })
  }

  // ── Get audio duration from File ──────────────────────────────────────
  const getFileDuration = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => { resolve(a.duration); URL.revokeObjectURL(url) }
    a.onerror = reject
    a.src = url
  })

  // ── Handle file selection ─────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return
    if (!file.type.startsWith('audio/')) {
      setRefErr('Please upload an audio file (WAV, MP3, OGG, FLAC).')
      return
    }
    setRefFile(file); setRefErr(null); setRefValid(null); setRefDur(null); setError(null)
    const blobUrl = URL.createObjectURL(file)
    setRefUrl(blobUrl)
    try {
      const dur = await getFileDuration(file)
      setRefDur(dur)
      if (dur < MIN_DUR) {
        setRefValid(false)
        setRefErr(`Too short: ${fmt(dur)}. Need at least ${MIN_DUR} seconds.`)
      } else if (dur > MAX_DUR) {
        setRefValid(false)
        setRefErr(`Too long: ${fmt(dur)}. Maximum is ${MAX_DUR} seconds.`)
      } else {
        setRefValid(true)
      }
    } catch { setRefErr('Could not read audio duration.') }
  }, [])

  // ── Drag & drop ───────────────────────────────────────────────────────
  const onDrop      = useCallback((e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]) }, [handleFile])
  const onDragOver  = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = ()  => setDragging(false)

  // ── Ref audio playback ────────────────────────────────────────────────
  useEffect(() => {
    const el = refAudioRef.current
    if (!el) return
    const on  = (fn) => () => fn(true)
    const off = (fn) => () => fn(false)
    el.addEventListener('play',  on(setRefPlaying))
    el.addEventListener('pause', off(setRefPlaying))
    el.addEventListener('ended', off(setRefPlaying))
    return () => {
      el.removeEventListener('play',  on(setRefPlaying))
      el.removeEventListener('pause', off(setRefPlaying))
      el.removeEventListener('ended', off(setRefPlaying))
    }
  }, [refUrl])

  // ── Generate ──────────────────────────────────────────────────────────
  const generate = async () => {
    if (!refFile || !refValid || !text.trim() || loading) return
    setLoading(true); setError(null)
    const t0 = Date.now()

    try {
      const fd = new FormData()
      fd.append('reference',    refFile)
      fd.append('text',         text.trim())
      fd.append('model',        model)
      fd.append('exaggeration', exaggeration)
      fd.append('cfg_weight',   cfgWeight)
      fd.append('language',     language)

      const res = await fetch(`${API}/generate`, { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.detail || `Server error ${res.status}`)
      }

      const blob    = await res.blob()
      const url     = URL.createObjectURL(blob)
      const genTime = ((Date.now() - t0) / 1000).toFixed(1)
      const index   = recordings.length + 1
      const label   = `rec${index}`

      const langDef = LANGUAGES.find(l => l.code === language)
      setRecordings(prev => [...prev, {
        id: Date.now(), label, url,
        text: text.trim(), mood, model,
        language: model === 'multilingual' ? langDef : null,
        genTime, ts: new Date().toISOString(),
      }])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Delete recording ──────────────────────────────────────────────────
  const deleteRecording = (id) => {
    setRecordings(prev => {
      const rec = prev.find(r => r.id === id)
      if (rec) URL.revokeObjectURL(rec.url)
      const remaining = prev.filter(r => r.id !== id)
      // Re-label sequentially
      return remaining.map((r, i) => ({ ...r, label: `rec${i + 1}` }))
    })
  }

  // ── Download recording ────────────────────────────────────────────────
  const downloadRec = (rec) => {
    const a = document.createElement('a')
    a.href = rec.url; a.download = `${rec.label}.wav`; a.click()
  }

  // ── Reset all ─────────────────────────────────────────────────────────
  const reset = () => {
    recordings.forEach(r => URL.revokeObjectURL(r.url))
    setRefFile(null); setRefUrl(null); setRefDur(null)
    setRefValid(null); setRefErr(null); setRefPlaying(false)
    setRecordings([]); setError(null); setText('')
  }

  const canGenerate = refValid && text.trim().length > 0 && !loading

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', padding: '28px 20px' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: 'linear-gradient(145deg,#c8952a,#d4a853,#f0c36b)',
          borderRadius: 14, padding: '9px 14px', marginBottom: 14,
          boxShadow: '0 4px 20px rgba(212,168,83,0.3)',
        }}>
          <Mic size={20} color="rgba(10,8,4,0.85)" />
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em',
          background: 'linear-gradient(120deg, #f0c36b 0%, #d4a853 50%, #c8952a 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: 6,
        }}>Voice Cloner</h1>
        <p style={{ color: 'rgba(240,236,227,0.42)', fontSize: 12.5 }}>
          Zero-shot voice cloning · Powered by Chatterbox TTS (Resemble AI)
        </p>
      </header>

      {/* ── Main grid ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 20, maxWidth: 860, margin: '0 auto',
      }}>

        {/* ── LEFT: Reference audio ─────────────────────────────────── */}
        <div className="glass" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mic size={14} color="#d4a853" />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#d4a853', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Reference Voice
              </span>
            </div>
            {refDur && <DurBadge dur={refDur} valid={refValid} />}
          </div>

          {/* Drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !refFile && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'rgba(212,168,83,0.6)' : refValid === true ? 'rgba(62,201,122,0.4)' : refValid === false ? 'rgba(240,80,60,0.4)' : 'rgba(212,168,83,0.18)'}`,
              borderRadius: var_r_lg,
              padding: refFile ? '14px 16px' : '32px 16px',
              textAlign: 'center',
              cursor: refFile ? 'default' : 'pointer',
              background: dragging ? 'rgba(212,168,83,0.05)' : 'rgba(255,255,255,0.015)',
              transition: 'all 0.2s ease',
              marginBottom: 14,
            }}
          >
            {!refFile ? (
              <>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(212,168,83,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 10px',
                  animation: dragging ? 'pulse-ring 1s ease infinite' : 'none',
                }}>
                  <Upload size={18} color="#d4a853" />
                </div>
                <p style={{ color: 'rgba(240,236,227,0.7)', fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}>
                  Drop audio here or click to browse
                </p>
                <p style={{ color: 'rgba(240,236,227,0.28)', fontSize: 11 }}>
                  WAV · MP3 · OGG · FLAC &nbsp;|&nbsp; {MIN_DUR}–{MAX_DUR} seconds
                </p>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <WaveViz playing={refPlaying} />
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <p style={{ color: 'rgba(240,236,227,0.85)', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {refFile.name}
                  </p>
                  <p style={{ color: 'rgba(240,236,227,0.35)', fontSize: 10.5, marginTop: 2 }}>
                    {(refFile.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); reset() }}
                  style={{
                    background: 'rgba(240,80,60,0.1)', border: '1px solid rgba(240,80,60,0.2)',
                    borderRadius: 6, padding: '4px 8px', color: '#f0503c',
                    cursor: 'pointer', fontSize: 10.5, fontWeight: 500,
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files?.[0])} />

          {refErr && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
              background: 'rgba(240,80,60,0.08)', border: '1px solid rgba(240,80,60,0.2)',
              borderRadius: var_r_sm, marginBottom: 10,
            }}>
              <AlertCircle size={12} color="#f0503c" />
              <span style={{ color: '#f0503c', fontSize: 11.5 }}>{refErr}</span>
            </div>
          )}

          {refUrl && refValid && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <p style={{ color: 'rgba(240,236,227,0.3)', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                Preview Reference
              </p>
              <audio ref={refAudioRef} controls src={refUrl} />
            </div>
          )}

          {refValid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 12, color: '#3ec97a', fontSize: 11.5 }}>
              <CheckCircle size={12} />
              Reference audio valid · {fmt(refDur)} captured
            </div>
          )}
        </div>

        {/* ── RIGHT: Settings + Generate ────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Text input + Tags ──────────────────────────────────── */}
          <div className="glass" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Wand2 size={14} color="#d4a853" />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#d4a853', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Text to Speak
              </span>
              <span style={{ marginLeft: 'auto', color: 'rgba(240,236,227,0.25)', fontSize: 10.5 }}>
                {text.length}/500
              </span>
            </div>

            {/* Tag buttons */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => insertTag(tag)}
                  style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 500,
                    border: '1px solid rgba(212,168,83,0.22)',
                    background: 'rgba(212,168,83,0.07)',
                    color: 'rgba(212,168,83,0.75)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    fontFamily: 'monospace',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,168,83,0.15)'; e.currentTarget.style.color = '#d4a853' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(212,168,83,0.07)'; e.currentTarget.style.color = 'rgba(212,168,83,0.75)' }}
                  title={`Insert ${tag} at cursor`}
                >
                  {tag}
                </button>
              ))}
              <span style={{ color: 'rgba(240,236,227,0.2)', fontSize: 10, alignSelf: 'center', marginLeft: 2 }}>
                click to insert at cursor
              </span>
            </div>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value.slice(0, 500))}
              placeholder="Type what you want the cloned voice to say…"
              rows={5}
              style={{ resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          {/* ── Mood selector ─────────────────────────────────────── */}
          <div className="glass" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13 }}>🎭</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#d4a853', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Mood / Tone
              </span>
              {model === 'turbo' && (
                <span style={{ marginLeft: 'auto', color: 'rgba(240,236,227,0.25)', fontSize: 10 }}>
                  visual only · turbo ignores sliders
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
              {MOODS.map(m => (
                <button
                  key={m.id}
                  onClick={() => applyMood(m.id)}
                  style={{
                    padding: '7px 8px', borderRadius: var_r_md,
                    border: `1px solid ${mood === m.id ? 'rgba(212,168,83,0.5)' : 'rgba(255,255,255,0.07)'}`,
                    background: mood === m.id ? 'rgba(212,168,83,0.13)' : 'rgba(255,255,255,0.03)',
                    color: mood === m.id ? '#f0ece3' : 'rgba(240,236,227,0.45)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    fontSize: 11.5, fontWeight: mood === m.id ? 600 : 400,
                    boxShadow: mood === m.id ? '0 0 0 1px rgba(212,168,83,0.18)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{m.emoji}</span>
                  {m.label}
                </button>
              ))}
            </div>
            {model === 'standard' && (
              <p style={{ marginTop: 8, color: 'rgba(240,236,227,0.25)', fontSize: 10, lineHeight: 1.5 }}>
                Sets exaggeration={MOODS.find(m => m.id === mood)?.exaggeration.toFixed(2)} cfg={MOODS.find(m => m.id === mood)?.cfgWeight.toFixed(2)}
              </p>
            )}
          </div>

          {/* ── Model selector ────────────────────────────────────── */}
          <div className="glass" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Zap size={13} color="#d4a853" />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#d4a853', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Model
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Pill label="Standard"      active={model === 'standard'}     onClick={() => setModel('standard')} />
              <Pill label="⚡ Turbo"      active={model === 'turbo'}        onClick={() => setModel('turbo')} />
              <Pill label="🌍 Multilingual" active={model === 'multilingual'} onClick={() => setModel('multilingual')} />
            </div>
            <p style={{ marginTop: 8, color: 'rgba(240,236,227,0.3)', fontSize: 10.5, lineHeight: 1.5 }}>
              {model === 'turbo'        ? 'Faster inference. CFG & exaggeration disabled.'
               : model === 'multilingual' ? '23 languages. Select language below.'
               : 'Full quality. Emotion & guidance controls available.'}
            </p>

            {/* Language selector — multilingual only */}
            {model === 'multilingual' && (
              <div style={{ marginTop: 12, animation: 'fadeIn 0.2s ease' }}>
                <label style={{ color: 'rgba(240,236,227,0.45)', fontSize: 11, display: 'block', marginBottom: 6 }}>
                  Output Language
                </label>
                <LangSelect value={language} onChange={setLanguage} />
                <p style={{ marginTop: 5, color: 'rgba(240,236,227,0.2)', fontSize: 10 }}>
                  Write your text in the chosen language for best results.
                </p>
              </div>
            )}
          </div>

          {/* ── Advanced controls (standard only) ─────────────────── */}
          {model === 'standard' && (
            <div className="glass" style={{ padding: 18 }}>
              <button
                onClick={() => setShowAdvanced(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(240,236,227,0.45)', fontSize: 11.5, fontWeight: 500,
                  padding: 0, marginBottom: showAdvanced ? 14 : 0, transition: 'color 0.15s',
                }}
              >
                <Settings2 size={12} />
                Advanced Controls
                <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>{showAdvanced ? '▲' : '▼'}</span>
              </button>

              {showAdvanced && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn 0.2s ease' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                      <label style={{ color: 'rgba(240,236,227,0.6)', fontSize: 11.5 }}>Emotion Exaggeration</label>
                      <span style={{ color: '#d4a853', fontSize: 11.5, fontWeight: 600 }}>{exaggeration.toFixed(2)}</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.05}
                      value={exaggeration}
                      onChange={e => setExaggeration(parseFloat(e.target.value))} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ color: 'rgba(240,236,227,0.2)', fontSize: 9.5 }}>Neutral</span>
                      <span style={{ color: 'rgba(240,236,227,0.2)', fontSize: 9.5 }}>Expressive</span>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                      <label style={{ color: 'rgba(240,236,227,0.6)', fontSize: 11.5 }}>CFG Weight</label>
                      <span style={{ color: '#d4a853', fontSize: 11.5, fontWeight: 600 }}>{cfgWeight.toFixed(2)}</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.05}
                      value={cfgWeight}
                      onChange={e => setCfgWeight(parseFloat(e.target.value))} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ color: 'rgba(240,236,227,0.2)', fontSize: 9.5 }}>Loose</span>
                      <span style={{ color: 'rgba(240,236,227,0.2)', fontSize: 9.5 }}>Strict</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Generate Button ────────────────────────────────────────────── */}
      <div style={{ maxWidth: 860, margin: '20px auto 0', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={generate}
          disabled={!canGenerate}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '13px 40px', borderRadius: 999,
            background: canGenerate
              ? 'linear-gradient(145deg, #c8952a 0%, #d4a853 50%, #f0c36b 100%)'
              : 'rgba(255,255,255,0.05)',
            border: `1px solid ${canGenerate ? 'rgba(212,168,83,0.4)' : 'rgba(255,255,255,0.06)'}`,
            color: canGenerate ? 'rgba(10,8,4,0.9)' : 'rgba(240,236,227,0.2)',
            fontWeight: 700, fontSize: 13.5, letterSpacing: '0.01em',
            cursor: canGenerate ? 'pointer' : 'not-allowed',
            boxShadow: canGenerate ? '0 6px 24px rgba(212,168,83,0.3)' : 'none',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { if (canGenerate) { e.currentTarget.style.filter = 'brightness(1.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }}}
          onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = '' }}
        >
          {loading
            ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(10,8,4,0.3)', borderTopColor: 'rgba(10,8,4,0.8)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> Generating…</>
            : <><Wand2 size={16} /> Clone &amp; Generate</>
          }
        </button>
      </div>

      {/* ── Loading bar ────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ maxWidth: 860, margin: '14px auto 0', animation: 'fadeIn 0.3s ease' }}>
          <div style={{
            height: 2, borderRadius: 2,
            background: 'linear-gradient(90deg, transparent, #d4a853, transparent)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s linear infinite',
          }} />
          <p style={{ textAlign: 'center', color: 'rgba(240,236,227,0.3)', fontSize: 11, marginTop: 8 }}>
            {model === 'turbo'        ? '⚡ Turbo inference running…'
           : model === 'multilingual' ? `🌍 Multilingual · ${LANGUAGES.find(l=>l.code===language)?.name ?? language}…`
           : `Cloning voice · mood: ${mood}…`}
          </p>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          maxWidth: 860, margin: '16px auto 0',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', borderRadius: var_r_md,
          background: 'rgba(240,80,60,0.08)', border: '1px solid rgba(240,80,60,0.22)',
          animation: 'fadeIn 0.3s ease',
        }}>
          <AlertCircle size={14} color="#f0503c" style={{ flexShrink: 0 }} />
          <span style={{ color: '#f0503c', fontSize: 12.5 }}>{error}</span>
        </div>
      )}

      {/* ── Recordings list ────────────────────────────────────────────── */}
      {recordings.length > 0 && (
        <div style={{ maxWidth: 860, margin: '24px auto 0', animation: 'fadeIn 0.4s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={14} color="#3ec97a" />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#3ec97a', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Recordings
              </span>
              <span style={{
                padding: '1px 7px', borderRadius: 999, fontSize: 10,
                background: 'rgba(62,201,122,0.1)', border: '1px solid rgba(62,201,122,0.2)',
                color: '#3ec97a',
              }}>{recordings.length}</span>
            </div>
            <button
              onClick={() => { recordings.forEach(r => URL.revokeObjectURL(r.url)); setRecordings([]) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 12px', borderRadius: 999, fontSize: 10.5,
                background: 'rgba(240,80,60,0.06)', border: '1px solid rgba(240,80,60,0.18)',
                color: 'rgba(240,80,60,0.7)', cursor: 'pointer',
              }}
            >
              <Trash2 size={10} /> Clear all
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recordings.map((rec, idx) => (
              <RecordingRow
                key={rec.id}
                rec={rec}
                isLatest={idx === recordings.length - 1}
                onDownload={() => downloadRec(rec)}
                onDelete={() => deleteRecording(rec.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── How to Run ─────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 860, margin: '28px auto 0' }}>
        <div className="glass" style={{ padding: 18 }}>
          <button
            onClick={() => setShowHowTo(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(240,236,227,0.5)', fontSize: 12, fontWeight: 500, padding: 0,
            }}
          >
            <Info size={13} color="#d4a853" />
            <span style={{ color: '#d4a853' }}>How to Run</span>
            <span style={{ marginLeft: 'auto', color: 'rgba(240,236,227,0.3)', fontSize: 10 }}>
              {showHowTo ? '▲ hide' : '▼ show'}
            </span>
          </button>

          {showHowTo && (
            <div style={{ marginTop: 16, animation: 'fadeIn 0.2s ease' }}>
              <HowToRun />
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer style={{ textAlign: 'center', marginTop: 32, color: 'rgba(212,168,83,0.2)', fontSize: 10.5 }}>
        Chatterbox TTS v0.1.6 · Resemble AI · MIT License
      </footer>
    </div>
  )
}

// ── Custom language dropdown ──────────────────────────────────────────────
function LangSelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = LANGUAGES.find(l => l.code === value) || LANGUAGES[0]

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: var_r_md,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? 'rgba(212,168,83,0.45)' : 'rgba(255,255,255,0.08)'}`,
          color: 'var(--text-primary)', cursor: 'pointer',
          boxShadow: open ? '0 0 0 3px rgba(212,168,83,0.08)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <span style={{ fontSize: 16 }}>{selected.flag}</span>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 12.5, fontWeight: 500 }}>{selected.name}</span>
        <span style={{ color: 'rgba(240,236,227,0.3)', fontSize: 10, fontFamily: 'monospace' }}>{selected.code}</span>
        <ChevronDown size={13} color="rgba(240,236,227,0.35)"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* Dropdown list */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: '#1a1a22', border: '1px solid rgba(212,168,83,0.2)',
          borderRadius: var_r_md, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          maxHeight: 240, overflowY: 'auto',
          animation: 'fadeIn 0.12s ease',
        }}>
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { onChange(l.code); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', background: l.code === value ? 'rgba(212,168,83,0.12)' : 'transparent',
                border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                color: l.code === value ? '#d4a853' : 'rgba(240,236,227,0.65)',
                cursor: 'pointer', textAlign: 'left', fontSize: 12.5,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (l.code !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (l.code !== value) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{l.flag}</span>
              <span style={{ flex: 1, fontWeight: l.code === value ? 600 : 400 }}>{l.name}</span>
              <span style={{ color: 'rgba(240,236,227,0.25)', fontSize: 10, fontFamily: 'monospace' }}>{l.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Recording row component ────────────────────────────────────────────────
function RecordingRow({ rec, isLatest, onDownload, onDelete }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onPlay  = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)
    el.addEventListener('play',  onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('play',  onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
    }
  }, [])

  const moodDef = rec.mood ? MOODS.find(m => m.id === rec.mood) : null

  return (
    <div className="glass" style={{
      padding: '14px 18px',
      border: isLatest ? '1px solid rgba(212,168,83,0.25)' : '1px solid rgba(255,255,255,0.05)',
      animation: isLatest ? 'fadeIn 0.4s ease' : 'none',
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <WaveViz playing={playing} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ color: '#d4a853', fontWeight: 600, fontSize: 12 }}>{rec.label}</span>
            {moodDef && (
              <span style={{
                padding: '1px 7px', borderRadius: 999, fontSize: 10,
                background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.18)',
                color: 'rgba(212,168,83,0.7)',
              }}>
                {moodDef.emoji} {moodDef.label}
              </span>
            )}
            {rec.language && (
              <span style={{
                padding: '1px 7px', borderRadius: 999, fontSize: 10,
                background: 'rgba(100,180,255,0.08)', border: '1px solid rgba(100,180,255,0.18)',
                color: 'rgba(140,200,255,0.8)',
              }}>
                {rec.language.flag} {rec.language.name}
              </span>
            )}
            {rec.genTime && (
              <span style={{ color: 'rgba(240,236,227,0.2)', fontSize: 10 }}>{rec.genTime}s</span>
            )}
            <span style={{ marginLeft: 'auto', color: 'rgba(240,236,227,0.2)', fontSize: 10 }}>
              {fmtTime(rec.ts)}
            </span>
          </div>
          <p style={{
            color: 'rgba(240,236,227,0.45)', fontSize: 11, fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2,
          }}>
            "{rec.text.slice(0, 90)}{rec.text.length > 90 ? '…' : ''}"
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onDownload}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 999, fontSize: 11,
              background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.22)',
              color: '#d4a853', cursor: 'pointer',
            }}
          >
            <Download size={10} /> Save
          </button>
          <button
            onClick={onDelete}
            style={{
              padding: '5px 8px', borderRadius: 999, fontSize: 11,
              background: 'rgba(240,80,60,0.06)', border: '1px solid rgba(240,80,60,0.18)',
              color: 'rgba(240,80,60,0.7)', cursor: 'pointer',
            }}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Audio player */}
      <audio ref={audioRef} controls src={rec.url} autoPlay={isLatest} style={{ marginTop: 2 }} />
    </div>
  )
}

// ── How to Run panel ──────────────────────────────────────────────────────
function HowToRun() {
  const step = (num, title, code) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, borderRadius: '50%',
          background: 'rgba(212,168,83,0.15)', border: '1px solid rgba(212,168,83,0.3)',
          color: '#d4a853', fontSize: 10.5, fontWeight: 700, flexShrink: 0,
        }}>{num}</span>
        <span style={{ color: 'rgba(240,236,227,0.8)', fontSize: 12, fontWeight: 500 }}>{title}</span>
      </div>
      {code && (
        <pre style={{
          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: var_r_sm, padding: '10px 14px', margin: '0 0 0 28px',
          fontSize: 11, color: 'rgba(240,236,227,0.65)', fontFamily: 'monospace',
          overflowX: 'auto', lineHeight: 1.7, whiteSpace: 'pre',
        }}>{code}</pre>
      )}
    </div>
  )

  return (
    <div>
      <p style={{ color: 'rgba(240,236,227,0.35)', fontSize: 11, marginBottom: 16 }}>
        Prerequisites: Python 3.10+, Node 18+, Chatterbox installed in <code style={{ fontFamily: 'monospace', color: 'rgba(212,168,83,0.6)' }}>backend/tts/.venv</code>
      </p>

      {step(1, 'Start the FastAPI backend (uses Chatterbox venv)',
`# From project root (voice-ai-core/)
cd voice-cloner
backend/tts/.venv/Scripts/python server.py
# → Listening on http://localhost:8005`)}

      {step(2, 'Install frontend dependencies (first time only)',
`cd voice-cloner/frontend
npm install`)}

      {step(3, 'Start the Vite dev server',
`cd voice-cloner/frontend
npm run dev
# → http://localhost:5174`)}

      {step(4, 'Open in browser', 'Navigate to  http://localhost:5174')}

      <div style={{
        marginTop: 8, padding: '10px 14px', borderRadius: var_r_sm,
        background: 'rgba(212,168,83,0.05)', border: '1px solid rgba(212,168,83,0.12)',
      }}>
        <p style={{ color: 'rgba(240,236,227,0.45)', fontSize: 11, lineHeight: 1.7 }}>
          <strong style={{ color: 'rgba(212,168,83,0.7)' }}>Supported tags in text:</strong>&nbsp;
          <code style={{ fontFamily: 'monospace', color: 'rgba(212,168,83,0.6)' }}>[laugh]</code>&nbsp;
          <code style={{ fontFamily: 'monospace', color: 'rgba(212,168,83,0.6)' }}>[sigh]</code>&nbsp;
          <code style={{ fontFamily: 'monospace', color: 'rgba(212,168,83,0.6)' }}>[breath]</code>&nbsp;
          <code style={{ fontFamily: 'monospace', color: 'rgba(212,168,83,0.6)' }}>[cough]</code>&nbsp;
          — embed in the text and Chatterbox will render them as sounds.
          <br />
          <strong style={{ color: 'rgba(212,168,83,0.7)' }}>Models:</strong>&nbsp;
          Standard = higher quality + mood sliders · Turbo = 3–5× faster, ignores exaggeration/CFG.
          <br />
          <strong style={{ color: 'rgba(212,168,83,0.7)' }}>Reference audio:</strong>&nbsp;
          10–60 seconds of clean speech in WAV/MP3/OGG/FLAC. No background music.
        </p>
      </div>
    </div>
  )
}

// CSS-in-JS border-radius helpers (avoids var() in JS objects)
const var_r_lg = '16px'
const var_r_md = '10px'
const var_r_sm = '6px'
