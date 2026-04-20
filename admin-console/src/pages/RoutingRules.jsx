// ================================================================
// RoutingRules.jsx — View + test AI call routing rules
// Fetches from GET /routing/rules (backend/routing/routing_rules.json)
// Allows hot-reload and dry-run testing
// ================================================================

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Zap, CheckCircle, XCircle, Route } from 'lucide-react'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { backendApi } from '../api/client.js'

const LANG_NAMES = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu',
  bn: 'Bengali', gu: 'Gujarati', ml: 'Malayalam', pa: 'Punjabi',
  'en-in': 'English (IN)', ar: 'Arabic', es: 'Spanish', fr: 'French', de: 'German',
}

function RuleCard({ rule }) {
  const ac = rule.enabled ? 'var(--green)' : 'var(--text-muted)'
  const ai = rule.target?.ai_config ?? {}
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: `1px solid ${rule.enabled ? 'var(--border)' : 'var(--border)'}`,
      borderRadius: 10, padding: '12px 16px', opacity: rule.enabled ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {rule.enabled
            ? <CheckCircle size={13} style={{ color: 'var(--green)' }} />
            : <XCircle    size={13} style={{ color: 'var(--text-muted)' }} />
          }
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {rule.name}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '1px 6px', borderRadius: 4 }}>
            priority {rule.priority}
          </span>
        </div>
        <span style={{ fontSize: 10, color: rule.enabled ? 'var(--green)' : 'var(--text-muted)', fontWeight: 700 }}>
          {rule.enabled ? 'ACTIVE' : 'DISABLED'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11.5 }}>
        <div>
          <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Conditions</div>
          {rule.conditions?.lang && (
            <div><span style={{ color: 'var(--gold)' }}>lang:</span> {rule.conditions.lang.map(l => LANG_NAMES[l] ?? l).join(', ')}</div>
          )}
          {rule.conditions?.source && (
            <div><span style={{ color: 'var(--gold)' }}>source:</span> {rule.conditions.source.join(', ')}</div>
          )}
          {rule.conditions?.time_of_day_utc_between && (
            <div><span style={{ color: 'var(--gold)' }}>time window:</span> {rule.conditions.time_of_day_utc_between.join(' → ')} UTC</div>
          )}
          {rule.conditions?.time_of_day_utc_outside && (
            <div><span style={{ color: 'var(--gold)' }}>after hours:</span> outside {rule.conditions.time_of_day_utc_outside.join(' – ')} UTC</div>
          )}
          {!rule.conditions?.lang && !rule.conditions?.source && !rule.conditions?.time_of_day_utc_between && (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>match all</div>
          )}
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Routes to AI</div>
          {ai.voice && <div><span style={{ color: 'var(--purple)' }}>voice:</span> {ai.voice}</div>}
          {ai.llm   && <div><span style={{ color: 'var(--purple)' }}>llm:</span> {ai.llm}</div>}
          {ai.lang  && <div><span style={{ color: 'var(--purple)' }}>lang:</span> {LANG_NAMES[ai.lang] ?? ai.lang}</div>}
          <div><span style={{ color: 'var(--purple)' }}>queue:</span> {rule.target?.queue_name}</div>
          <div><span style={{ color: 'var(--purple)' }}>fallback:</span> {rule.target?.fallback_action}</div>
        </div>
      </div>
    </div>
  )
}

export default function RoutingRules() {
  const [rules,   setRules]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [reloading, setReloading] = useState(false)

  // Test routing
  const [testLang,    setTestLang]    = useState('hi')
  const [testSource,  setTestSource]  = useState('browser')
  const [testResult,  setTestResult]  = useState(null)
  const [testing,     setTesting]     = useState(false)

  // IVR status
  const [ivrStatus, setIvrStatus] = useState(null)

  const loadRules = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await backendApi.routingRules()
      setRules(data.rules ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRules()
    backendApi.ivrStatus().then(setIvrStatus).catch(() => {})
  }, [loadRules])

  const reloadRules = async () => {
    setReloading(true)
    try {
      const data = await backendApi.reloadRules()
      await loadRules()
    } catch (e) {
      setError(`Reload failed: ${e.message}`)
    } finally {
      setReloading(false)
    }
  }

  const testRoute = async () => {
    setTesting(true); setTestResult(null)
    try {
      const r = await backendApi.testRoute({ lang: testLang, source: testSource })
      setTestResult(r)
    } catch (e) {
      setTestResult({ error: e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Routing Rules"
        subtitle="AI call routing — lang/source/time → voice + LLM assignment"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={reloadRules}
              disabled={reloading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(155,114,232,0.15)', border: '1px solid rgba(155,114,232,0.3)',
                borderRadius: 7, padding: '6px 12px', fontSize: 12,
                color: 'var(--purple)', cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} style={{ animation: reloading ? 'spin 1s linear infinite' : 'none' }} />
              Hot-reload
            </button>
          </div>
        }
      />

      {error && (
        <div style={{ background: 'rgba(240,80,60,0.1)', border: '1px solid rgba(240,80,60,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#f0503c' }}>
          {error}
        </div>
      )}

      {/* IVR Status */}
      {ivrStatus && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>IVR Status</div>
          <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
            <span>
              <span style={{ color: 'var(--text-muted)' }}>Gemini: </span>
              <span style={{ color: ivrStatus.gemini_configured ? 'var(--green)' : 'var(--red)' }}>
                {ivrStatus.gemini_configured ? 'configured' : 'not configured'}
              </span>
            </span>
            <span>
              <span style={{ color: 'var(--text-muted)' }}>Departments: </span>
              <span style={{ color: 'var(--text-primary)' }}>{ivrStatus.departments?.length ?? 0}</span>
            </span>
          </div>
        </div>
      )}

      {/* Test routing */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          Test Routing (dry-run)
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Language</div>
            <select
              value={testLang}
              onChange={e => setTestLang(e.target.value)}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--text-primary)' }}
            >
              {Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Source</div>
            <select
              value={testSource}
              onChange={e => setTestSource(e.target.value)}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--text-primary)' }}
            >
              <option value="browser">browser</option>
              <option value="sip">sip</option>
              <option value="phone">phone</option>
            </select>
          </div>
          <button
            onClick={testRoute}
            disabled={testing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(212,168,83,0.15)', border: '1px solid rgba(212,168,83,0.3)',
              borderRadius: 7, padding: '6px 14px', fontSize: 12,
              color: 'var(--gold)', cursor: 'pointer',
            }}
          >
            <Zap size={12} />
            {testing ? 'Testing…' : 'Test Route'}
          </button>
        </div>

        {testResult && !testResult.error && (
          <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ color: testResult.matched ? 'var(--green)' : 'var(--gold)' }}>
              {testResult.matched ? '✅ Rule matched' : '⚠️ Default fallback'}
            </span>
            <span><span style={{ color: 'var(--text-muted)' }}>Rule: </span><strong>{testResult.rule_name}</strong></span>
            <span><span style={{ color: 'var(--text-muted)' }}>Voice: </span><strong>{testResult.voice || '(by lang)'}</strong></span>
            <span><span style={{ color: 'var(--text-muted)' }}>LLM: </span><strong>{testResult.llm}</strong></span>
            <span><span style={{ color: 'var(--text-muted)' }}>Queue: </span><strong>{testResult.queue_name}</strong></span>
          </div>
        )}
        {testResult?.error && (
          <div style={{ marginTop: 8, color: '#f0503c', fontSize: 12 }}>{testResult.error}</div>
        )}
      </div>

      {/* Rules list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          {loading ? 'Loading…' : `${rules.length} rules · evaluated top-down, first-match wins`}
        </div>
        {rules.map((rule, i) => <RuleCard key={i} rule={rule} />)}
        {!loading && rules.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12.5, padding: 16 }}>
            No rules loaded. Check backend/routing/routing_rules.json
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 8 }}>
        Rules file: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>backend/routing/routing_rules.json</code> ·
        Edit the file and click Hot-reload to apply changes without restart
      </div>
    </div>
  )
}
