// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | LLMConfig()               |
// | * LLM settings + test     |
// +---------------------------+
//     |
//     |----> runTest()
//     |        * simulates LLM response
//     |
//     v
// [ END ]
//
// ================================================================

import React, { useState } from 'react'
import { BrainCircuit, Zap, Send } from 'lucide-react'
import Btn from '../components/ui/Btn.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'

const SYSTEM_PROMPT = `You are a real human customer service representative at SR Comsoft.
You handle customer queries naturally — never reveal you are an AI.
Keep replies to 1-2 short sentences.
Use natural contractions and fillers (uh, sure, of course).
Respond in the same language as the caller.`

const LANG_RULES = {
  hi: 'Reply in Hindi (Devanagari). Indian callers mix English naturally — allow Hinglish.',
  en: 'Crisp British/Indian English. Professional but warm.',
  fr: 'Répondre en français. Tutoyer uniquement si le client commence.',
  de: 'Auf Deutsch antworten. Formal mit "Sie" anreden.',
  es: 'Responder en español. Tono cálido y profesional.',
  ta: 'தமிழில் பதிலளிக்கவும். ஆங்கில கலவை ஏற்றுக்கொள்ளலாம்.',
  te: 'తెలుగులో సమాధానం ఇవ్వండి. ఇంగ్లీష్ మిక్స్ అనుమతించబడింది.',
  ml: 'മലയാളത്തിൽ മറുപടി നൽകുക. ഇംഗ്ലീഷ് മിശ്രണം സ്വീകാര്യം.',
}

export default function LLMConfig() {
  const [backend, setBackend] = useState('gemini')
  const [temp, setTemp] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(200)
  const [numPredict, setNumPredict] = useState(100)
  const [testInput, setTestInput] = useState('My internet is not working.')
  const [testLang, setTestLang] = useState('en')
  const [testResult, setTestResult] = useState(null)
  const [loading, setLoading] = useState(false)

  async function runTest() {
    setLoading(true); setTestResult(null)
    // Simulate — hook up to /ws/call or a test endpoint
    await new Promise(r => setTimeout(r, 800))
    const mock = {
      en: "I'm sorry to hear that. Let me check your connection status right now — can I get your account number?",
      hi: 'मुझे खेद है। मैं अभी आपका connection देखती हूँ — क्या आप account number बता सकते हैं?',
      ta: 'மன்னிக்கவும். நான் இப்போது உங்கள் இணைப்பை சரிபார்க்கிறேன் — account number சொல்ல முடியுமா?',
    }
    setTestResult(mock[testLang] ?? mock.en)
    setLoading(false)
  }

  return (
    <div className="animate-fade-in">
      <SectionHeader title="LLM Config" subtitle="Gemini 2.5 Flash / Qwen 2.5:7b configuration and test console" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
        {/* Left: Config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Backend selector */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              LLM Backend
            </div>
            <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { id: 'gemini', label: 'Gemini 2.5 Flash', sub: 'Google API · max 200 tokens', color: 'var(--cyan)'   },
                { id: 'qwen',   label: 'Qwen 2.5:7b',      sub: 'Ollama local · 100 tokens',  color: 'var(--purple)' },
              ].map(({ id, label, sub, color }) => (
                <button key={id} onClick={() => setBackend(id)} style={{
                  padding: '12px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${backend === id ? color : 'var(--border)'}`,
                  background: backend === id ? color + '18' : 'transparent',
                  transition: 'all var(--t-fast)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <BrainCircuit size={13} style={{ color }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: backend === id ? color : 'var(--text-primary)' }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Parameters
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Temperature */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Temperature</label>
                  <span style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{temp.toFixed(1)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.05" value={temp} onChange={e => setTemp(+e.target.value)}
                  style={{ width: '100%', accentColor: 'var(--cyan)', background: 'transparent' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>Deterministic</span><span>Creative</span>
                </div>
              </div>

              {/* Max tokens */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {backend === 'gemini' ? 'Max Output Tokens' : 'num_predict (Qwen)'}
                  </label>
                  <span style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                    {backend === 'gemini' ? maxTokens : numPredict}
                  </span>
                </div>
                {backend === 'gemini' ? (
                  <input type="range" min="50" max="500" step="25" value={maxTokens} onChange={e => setMaxTokens(+e.target.value)}
                    style={{ width: '100%', accentColor: 'var(--cyan)', background: 'transparent' }} />
                ) : (
                  <input type="range" min="50" max="300" step="25" value={numPredict} onChange={e => setNumPredict(+e.target.value)}
                    style={{ width: '100%', accentColor: 'var(--purple)', background: 'transparent' }} />
                )}
              </div>

              {/* Qwen extra params */}
              {backend === 'qwen' && (
                <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  num_ctx: 1024 · Ollama URL: <span style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>http://localhost:11434</span>
                </div>
              )}
            </div>
          </div>

          {/* System prompt */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Base Persona (system prompt)
            </div>
            <div style={{ padding: '14px 16px' }}>
              <textarea readOnly rows={6} value={SYSTEM_PROMPT}
                style={{ width: '100%', resize: 'none', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)' }} />
            </div>
          </div>

          {/* Language rules */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Language-Specific Rules (LANGUAGE_CONFIG)
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {Object.entries(LANG_RULES).map(([code, rule]) => (
                <div key={code} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', width: 24, flexShrink: 0, paddingTop: 1 }}>{code}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{rule}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Test console */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <Zap size={12} />
              Test Console
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Language</label>
                <select value={testLang} onChange={e => setTestLang(e.target.value)} style={{ width: '100%' }}>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="ta">Tamil</option>
                  <option value="te">Telugu</option>
                  <option value="ml">Malayalam</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>User Message</label>
                <textarea value={testInput} onChange={e => setTestInput(e.target.value)} rows={3}
                  style={{ width: '100%', resize: 'none' }} />
              </div>
              <Btn variant="primary" icon={Send} onClick={runTest} loading={loading}>
                {loading ? 'Generating…' : 'Test Response'}
              </Btn>

              {testResult && (
                <div style={{ padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-cyan)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: 10, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>AI Response ({backend})</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{testResult}</div>
                </div>
              )}
            </div>
          </div>

          {/* API key status */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>API Keys</div>
            {[
              ['GEMINI_API_KEY',  backend === 'gemini' ? 'Active' : 'Standby', backend === 'gemini' ? 'var(--green)' : 'var(--text-muted)'],
              ['OLLAMA_URL',      'http://localhost:11434',                     'var(--text-muted)'],
              ['OLLAMA_ENABLED',  backend === 'qwen'   ? 'true' : 'false',     backend === 'qwen' ? 'var(--green)' : 'var(--red)'],
            ].map(([k, v, c]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{k}</span>
                <span style={{ fontSize: 11, color: c, fontFamily: 'var(--font-mono)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
