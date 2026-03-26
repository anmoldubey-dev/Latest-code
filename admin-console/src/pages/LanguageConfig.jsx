// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | Check()                   |
// | * checkmark icon helper   |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | LanguageConfig()          |
// | * STT/TTS coverage matrix |
// +---------------------------+
//     |
//     |----> Check()
//     |        * renders per-cell support icon
//     |
//     v
// [ END ]
//
// ================================================================

import React, { useState } from 'react'
import { CheckCircle2, XCircle, Globe2, Mic2 } from 'lucide-react'
import SectionHeader from '../components/ui/SectionHeader.jsx'

const LANGUAGE_DATA = [
  // code, name, indic_prompt, stt, tts_service, tts_lang, voices
  { code: 'hi',    name: 'Hindi',              script: 'Devanagari', stt: true, tts: 'indic',  ttsLang: 'Hindi',            prompt: 'यह एक हिंदी वार्तालाप है। इसमें तकनीकी शब्द भी हो सकते हैं।' },
  { code: 'en',    name: 'English',            script: 'Latin',      stt: true, tts: 'global', ttsLang: 'English',          prompt: 'This is an Indian English conversation. It may contain technical terms.' },
  { code: 'en-in', name: 'English (Indian)',   script: 'Latin',      stt: true, tts: 'indic',  ttsLang: 'English (Indian)', prompt: 'This is an Indian English conversation. It may contain technical terms and local nuances.' },
  { code: 'mr',    name: 'Marathi',            script: 'Devanagari', stt: true, tts: 'indic',  ttsLang: 'Marathi',          prompt: 'हा एक मराठी संवाद आहे. यात तांत्रिक शब्द असू शकतात.' },
  { code: 'bn',    name: 'Bengali',            script: 'Bengali',    stt: true, tts: 'indic',  ttsLang: 'Bengali',          prompt: 'এটি একটি বাংলা কথোপকথন। এতে প্রযুক্তিগত শব্দও থাকতে পারে।' },
  { code: 'ta',    name: 'Tamil',              script: 'Tamil',      stt: true, tts: 'indic',  ttsLang: 'Tamil',            prompt: 'இது ஒரு தமிழ் உரையாடல். இதில் தொழில்நுட்ப வார்த்தைகளும் இருக்கலாம்.' },
  { code: 'te',    name: 'Telugu',             script: 'Telugu',     stt: true, tts: 'indic',  ttsLang: 'Telugu',           prompt: 'ఇది తెలుగు సంభాషణ. ఇందులో సాంకేతిక పదాలు కూడా ఉండవచ్చు.' },
  { code: 'gu',    name: 'Gujarati',           script: 'Gujarati',   stt: true, tts: 'indic',  ttsLang: 'Gujarati',         prompt: 'આ એક ગુજરાતી વાતચીત છે. આમાં તકનીકી શબ્દો પણ હોઈ શકે છે.' },
  { code: 'kn',    name: 'Kannada',            script: 'Kannada',    stt: true, tts: 'indic',  ttsLang: 'Kannada',          prompt: 'ಇದು ಕನ್ನಡ ಸಂಭಾಷಣೆ. ಇದರಲ್ಲಿ ತಾಂತ್ರಿಕ ಪದಗಳೂ ಇರಬಹುದು.' },
  { code: 'ml',    name: 'Malayalam',          script: 'Malayalam',  stt: true, tts: 'indic',  ttsLang: 'Malayalam',        prompt: 'ഈ സംഭാഷണം മലയാളത്തിലാണ്. ഇതിൽ സാങ്കേതിക പദങ്ങളും ഉൾപ്പെടുന്നു.' },
  { code: 'pa',    name: 'Punjabi',            script: 'Gurmukhi',   stt: true, tts: 'indic',  ttsLang: 'Punjabi',          prompt: 'ਇਹ ਇੱਕ ਪੰਜਾਬੀ ਗੱਲਬਾਤ ਹੈ। ਇਸ ਵਿੱਚ ਤਕਨੀਕੀ ਸ਼ਬਦ ਵੀ ਹੋ ਸਕਦੇ ਹਨ।' },
  { code: 'or',    name: 'Odia',               script: 'Odia',       stt: true, tts: 'indic',  ttsLang: 'Odia',             prompt: 'ଏହା ଏକ ଓଡ଼ିଆ କଥୋପକଥନ | ଏଥିରେ ବୈଷୟିକ ଶବ୍ଦ ମଧ୍ୟ ଥାଇପାରେ |' },
  { code: 'as',    name: 'Assamese',           script: 'Bengali',    stt: true, tts: 'indic',  ttsLang: 'Assamese',         prompt: 'এইটো এটা অসমীয়া কথোপকথন। ইয়াত কাৰিকৰী শব্দও থাকিব পাৰে।' },
  { code: 'ur',    name: 'Urdu',               script: 'Nastaliq',   stt: true, tts: 'indic',  ttsLang: 'Urdu',             prompt: 'یہ ایک اردو گفتگو ہے۔ اس میں تکنیکی الفاظ بھی ہو سکتے ہیں۔' },
  { code: 'ne',    name: 'Nepali',             script: 'Devanagari', stt: true, tts: null,     ttsLang: null,               prompt: 'हो, भन्नुस्।' },
  { code: 'fr',    name: 'French',             script: 'Latin',      stt: true, tts: 'global', ttsLang: 'French',           prompt: "C'est une conversation en français. Elle peut contenir des termes techniques." },
  { code: 'de',    name: 'German',             script: 'Latin',      stt: true, tts: 'global', ttsLang: 'German',           prompt: 'Dies ist ein deutschsprachiges Gespräch. Es kann Fachbegriffe enthalten.' },
  { code: 'es',    name: 'Spanish',            script: 'Latin',      stt: true, tts: 'global', ttsLang: 'Spanish',          prompt: 'Esta es una conversación en español. Puede contener términos técnicos.' },
  { code: 'pt',    name: 'Portuguese',         script: 'Latin',      stt: true, tts: 'global', ttsLang: 'Portuguese',       prompt: 'Esta é uma conversa em português. Pode conter termos técnicos.' },
  { code: 'pl',    name: 'Polish',             script: 'Latin',      stt: true, tts: 'global', ttsLang: 'Polish',           prompt: 'To jest rozmowa w języku polskim. Może zawierać terminy techniczne.' },
  { code: 'it',    name: 'Italian',            script: 'Latin',      stt: true, tts: 'global', ttsLang: 'Italian',          prompt: 'Questa è una conversazione in italiano. Può contenere termini tecnici.' },
  { code: 'nl',    name: 'Dutch',              script: 'Latin',      stt: true, tts: 'global', ttsLang: 'Dutch',            prompt: 'Dit is een gesprek in het Nederlands. Het kan technische termen bevatten.' },
  { code: 'ar',    name: 'Arabic',             script: 'Arabic',     stt: true, tts: null,     ttsLang: null,               prompt: 'نعم، تفضل.' },
  { code: 'ru',    name: 'Russian',            script: 'Cyrillic',   stt: true, tts: null,     ttsLang: null,               prompt: 'Да, говорите.' },
  { code: 'zh',    name: 'Chinese',            script: 'Hanzi',      stt: true, tts: null,     ttsLang: null,               prompt: '好的，请说。' },
  { code: 'ja',    name: 'Japanese',           script: 'Hiragana',   stt: true, tts: null,     ttsLang: null,               prompt: 'はい、どうぞ。' },
  { code: 'ko',    name: 'Korean',             script: 'Hangul',     stt: true, tts: null,     ttsLang: null,               prompt: '네, 말씀하세요.' },
  { code: 'tr',    name: 'Turkish',            script: 'Latin',      stt: true, tts: null,     ttsLang: null,               prompt: 'Bu bir Türkçe konuşmadır. Teknik terimler içerebilir.' },
]

function Check({ ok }) {
  return ok
    ? <CheckCircle2 size={13} style={{ color: 'var(--green)', flexShrink: 0 }} />
    : <XCircle     size={13} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.3 }} />
}

export default function LanguageConfig() {
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all') // all | indic | global | tts-only

  const stats = {
    total: LANGUAGE_DATA.length,
    withTTS: LANGUAGE_DATA.filter(l => l.tts).length,
    sttOnly: LANGUAGE_DATA.filter(l => l.stt && !l.tts).length,
    global: LANGUAGE_DATA.filter(l => l.tts === 'global').length,
    indic: LANGUAGE_DATA.filter(l => l.tts === 'indic').length,
  }

  const filtered = LANGUAGE_DATA.filter(l => {
    if (filter === 'indic')    return l.tts === 'indic'
    if (filter === 'global')   return l.tts === 'global'
    if (filter === 'stt-only') return !l.tts
    return true
  })

  const sel = LANGUAGE_DATA.find(l => l.code === selected)

  return (
    <div className="animate-fade-in">
      <SectionHeader title="Language Config" subtitle="Coverage matrix — STT prompts, TTS routing, and script validation" />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total',      value: stats.total,    color: 'var(--cyan)'   },
          { label: 'Full Stack', value: stats.withTTS,  color: 'var(--green)'  },
          { label: 'STT Only',   value: stats.sttOnly,  color: 'var(--yellow)' },
          { label: 'Indic TTS',  value: stats.indic,    color: 'var(--purple)' },
          { label: 'Global TTS', value: stats.global,   color: 'var(--cyan)'   },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['all', 'All Languages'], ['indic', 'Indic TTS'], ['global', 'Global TTS'], ['stt-only', 'STT Only']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            padding: '5px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
            border: `1px solid ${filter === k ? 'var(--cyan)' : 'var(--border)'}`,
            background: filter === k ? 'var(--bg-active)' : 'transparent',
            color: filter === k ? 'var(--cyan)' : 'var(--text-secondary)',
            transition: 'all var(--t-fast)',
          }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        {/* Table */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 90px 80px 80px 80px', padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', gap: 8 }}>
            <span>Code</span><span>Language</span><span>Script</span><span>STT</span><span>TTS</span><span>Prompt</span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 460 }}>
            {filtered.map(l => (
              <div key={l.code} onClick={() => setSelected(l.code === selected ? null : l.code)} style={{
                display: 'grid', gridTemplateColumns: '50px 1fr 90px 80px 80px 80px',
                padding: '9px 14px', gap: 8, alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: selected === l.code ? 'var(--bg-active)' : 'transparent',
                transition: 'background var(--t-fast)',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)' }}>{l.code}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>{l.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{l.script}</span>
                <div style={{ display: 'flex', justifyContent: 'center' }}><Check ok={l.stt} /></div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, alignItems: 'center' }}>
                  {l.tts === 'global' && <Globe2 size={11} style={{ color: 'var(--purple)' }} />}
                  {l.tts === 'indic'  && <Mic2   size={11} style={{ color: 'var(--green)'  }} />}
                  {!l.tts && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}><Check ok={!!l.prompt} /></div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {sel ? (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{sel.code}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{sel.name}</span>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                ['Script',    sel.script],
                ['STT',       sel.stt ? 'Supported (Whisper large-v3)' : 'Not supported'],
                ['TTS Service', sel.tts === 'global' ? 'Global (port 8003 · parler-tts)' : sel.tts === 'indic' ? 'Indic (port 8004 · indic-parler-tts)' : 'Not supported'],
                ['TTS Language', sel.ttsLang ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{k}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{v}</div>
                </div>
              ))}

              {/* STT Prompt */}
              {sel.prompt && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    STT Initial Prompt (INDIC_PROMPTS)
                  </div>
                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--text-primary)',
                    fontFamily: sel.script === 'Latin' || sel.script === 'Cyrillic' ? 'var(--font)' : 'inherit',
                    direction: ['Arabic', 'Nastaliq'].includes(sel.script) ? 'rtl' : 'ltr',
                  }}>
                    {sel.prompt}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                    Anchors Whisper BPE tokenizer to {sel.script} script branch
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            Select a language to view details
          </div>
        )}
      </div>
    </div>
  )
}
