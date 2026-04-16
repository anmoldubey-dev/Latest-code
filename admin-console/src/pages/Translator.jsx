// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | Translator()              |
// | * M2M-100 translate page  |
// +---------------------------+
//     |
//     |----> useEffect()
//     |        * fetch languages on mount
//     |
//     |----> swap()
//     |        * swap source and target
//     |
//     |----> translate()
//     |        * call translation API
//     |
//     |----> copy()
//     |        * copy output to clip
//     |
//     |----> handleKey()
//     |        * trigger on Ctrl+Enter
//     |
//     v
// [ END ]
// ================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { ArrowRightLeft, Languages, Loader2, Copy, Check } from 'lucide-react'
import { translatorApi } from '../api/client.js'

const S = {
  page: {
    padding: '28px 32px',
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'linear-gradient(145deg,#c8952a,#d4a853)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 4px 14px rgba(212,168,83,0.3)',
  },
  title: { fontSize: 18, fontWeight: 600, color: '#f0ece3', letterSpacing: '-0.01em' },
  subtitle: { fontSize: 12, color: 'rgba(212,168,83,0.55)', marginTop: 2 },
  panel: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    gap: 16,
    alignItems: 'start',
  },
  col: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: 500,
    color: 'rgba(212,168,83,0.7)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  select: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 10,
    border: '1px solid rgba(212,168,83,0.2)',
    background: 'rgba(255,255,255,0.04)',
    color: '#f0ece3',
    fontSize: 13,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%23d4a853' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 32,
  },
  textarea: {
    width: '100%',
    minHeight: 220,
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid rgba(212,168,83,0.2)',
    background: 'rgba(255,255,255,0.03)',
    color: '#f0ece3',
    fontSize: 14,
    lineHeight: 1.6,
    resize: 'vertical',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  outputBox: {
    width: '100%',
    minHeight: 220,
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(0,0,0,0.25)',
    color: 'rgba(240,236,227,0.85)',
    fontSize: 14,
    lineHeight: 1.6,
    boxSizing: 'border-box',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    position: 'relative',
  },
  swapBtn: {
    marginTop: 42,
    width: 38,
    height: 38,
    borderRadius: '50%',
    border: '1px solid rgba(212,168,83,0.25)',
    background: 'rgba(212,168,83,0.07)',
    color: '#d4a853',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
  translateBtn: {
    padding: '10px 28px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg,#c8952a,#d4a853)',
    color: '#0c0c10',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'opacity 0.15s',
    alignSelf: 'flex-start',
  },
  copyBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 7,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(212,168,83,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  statusBar: {
    fontSize: 11,
    color: 'rgba(212,168,83,0.45)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  offline: {
    padding: '12px 16px',
    borderRadius: 10,
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.2)',
    color: 'rgba(239,68,68,0.8)',
    fontSize: 13,
  },
}

export default function Translator() {
  const [langs, setLangs]         = useState({})
  const [srcLang, setSrcLang]     = useState('en')
  const [tgtLang, setTgtLang]     = useState('hi')
  const [input, setInput]         = useState('')
  const [output, setOutput]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [copied, setCopied]       = useState(false)
  const [offline, setOffline]     = useState(false)
  const [charCount, setCharCount] = useState(0)

  useEffect(() => {
    translatorApi.languages()
      .then(d => setLangs(d.languages ?? {}))
      .catch(() => setOffline(true))
  }, [])

  const sortedLangs = Object.entries(langs).sort(([, a], [, b]) => a.localeCompare(b))

  const swap = useCallback(() => {
    setSrcLang(tgtLang)
    setTgtLang(srcLang)
    setInput(output)
    setOutput(input)
  }, [srcLang, tgtLang, input, output])

  const translate = useCallback(async () => {
    if (!input.trim() || loading) return
    setLoading(true)
    setOutput('')
    try {
      const res = await translatorApi.translate({ text: input.trim(), src_lang: srcLang, tgt_lang: tgtLang })
      setOutput(res.translated ?? '')
    } catch (e) {
      setOutput(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [input, srcLang, tgtLang, loading])

  const copy = () => {
    if (!output) return
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) translate()
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.iconBox}>
          <Languages size={16} color="#0c0c10" />
        </div>
        <div>
          <div style={S.title}>Text Translator</div>
          <div style={S.subtitle}>M2M-100 · 100 languages · local inference</div>
        </div>
      </div>

      {offline && (
        <div style={S.offline}>
          Translator service offline — start it on port 8002 first.
        </div>
      )}

      {/* Main panel */}
      <div style={S.panel}>
        {/* Source column */}
        <div style={S.col}>
          <span style={S.label}>Source language</span>
          <select
            value={srcLang}
            onChange={e => setSrcLang(e.target.value)}
            style={S.select}
          >
            {sortedLangs.map(([code, name]) => (
              <option key={code} value={code}>{name} ({code})</option>
            ))}
          </select>
          <textarea
            style={{ ...S.textarea, borderColor: input ? 'rgba(212,168,83,0.35)' : 'rgba(212,168,83,0.15)' }}
            placeholder="Enter text to translate… (Ctrl+Enter to translate)"
            value={input}
            onChange={e => { setInput(e.target.value); setCharCount(e.target.value.length) }}
            onKeyDown={handleKey}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              style={{ ...S.translateBtn, opacity: loading || !input.trim() ? 0.5 : 1 }}
              onClick={translate}
              disabled={loading || !input.trim()}
            >
              {loading
                ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Translating…</>
                : <><ArrowRightLeft size={14} /> Translate</>
              }
            </button>
            <span style={S.statusBar}>{charCount} chars</span>
          </div>
        </div>

        {/* Swap button */}
        <button
          style={S.swapBtn}
          onClick={swap}
          title="Swap languages"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,168,83,0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(212,168,83,0.07)' }}
        >
          <ArrowRightLeft size={15} />
        </button>

        {/* Target column */}
        <div style={S.col}>
          <span style={S.label}>Target language</span>
          <select
            value={tgtLang}
            onChange={e => setTgtLang(e.target.value)}
            style={S.select}
          >
            {sortedLangs.map(([code, name]) => (
              <option key={code} value={code}>{name} ({code})</option>
            ))}
          </select>
          <div style={{ position: 'relative' }}>
            <div style={{
              ...S.outputBox,
              color: output ? 'rgba(240,236,227,0.85)' : 'rgba(255,255,255,0.2)',
              fontStyle: output ? 'normal' : 'italic',
            }}>
              {output || (loading ? 'Translating…' : 'Translation will appear here')}
            </div>
            {output && (
              <button style={S.copyBtn} onClick={copy} title="Copy">
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            )}
          </div>
          {output && (
            <div style={S.statusBar}>
              {output.length} chars · {langs[tgtLang] ?? tgtLang}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
