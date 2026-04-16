import React from 'react'

export const Btn = ({ children, onClick, variant = 'primary', style = {}, disabled = false }) => {
  const base = {
    border: 'none', borderRadius: 10,
    fontFamily: "'Syne',sans-serif", fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 7,
    transition: 'all 0.2s', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
  }
  const v = {
    primary:   { background: 'linear-gradient(135deg,var(--pur),var(--acc))', color: '#fff', padding: '12px 24px', fontSize: 14, boxShadow: '0 4px 16px rgba(124,92,255,0.35)' },
    secondary: { background: 'transparent', color: 'var(--txt)', border: '1px solid var(--bdr2)', padding: '11px 20px', fontSize: 13.5 },
    ghost:     { background: 'transparent', color: 'var(--txt2)', padding: '9px 14px', fontSize: 13 },
  }
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...v[variant], ...style }}
      onMouseEnter={(e) => {
        if (!disabled) {
          if (variant === 'primary')   { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 26px var(--purgl)' }
          if (variant === 'secondary')   e.currentTarget.style.background = 'var(--purl)'
          if (variant === 'ghost')     { e.currentTarget.style.color = 'var(--txt)'; e.currentTarget.style.background = 'var(--purl)' }
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ''
        if (variant === 'primary')   e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,92,255,0.35)'
        if (variant === 'secondary') e.currentTarget.style.background = 'transparent'
        if (variant === 'ghost')   { e.currentTarget.style.color = 'var(--txt2)'; e.currentTarget.style.background = 'transparent' }
      }}
    >{children}</button>
  )
}

export const FCard = ({ children, style = {} }) => {
  const [h, setH] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ background: 'var(--card)', border: '1px solid var(--bdr)', borderRadius: 16, padding: 24, boxShadow: h ? '0 12px 40px rgba(124,92,255,0.2)' : 'none', transition: 'box-shadow 0.3s', ...style }}
    >{children}</div>
  )
}

export const Lbl = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--lbl)', marginBottom: 8 }}>{children}</div>
)

export const SecTitle = ({ children, style = {} }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--lbl)', display: 'flex', alignItems: 'center', gap: 7, ...style }}>{children}</div>
)

export const TabBar = ({ tabs, active, onChange, style = {} }) => (
  <div style={{ display: 'flex', gap: 3, background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 10, padding: 3, ...style }}>
    {tabs.map((t) => (
      <button key={t} onClick={() => onChange(t)} style={{
        flex: 1, padding: '10px 16px', border: 'none', borderRadius: 7,
        background: active === t ? 'var(--pur)' : 'transparent',
        color: active === t ? '#fff' : 'var(--txt2)',
        fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer',
        boxShadow: active === t ? '0 4px 12px var(--purgl)' : 'none', transition: 'all 0.2s',
      }}>{t}</button>
    ))}
  </div>
)

export const Field = ({ placeholder, value, onChange, style = {}, type = 'text' }) => (
  <input type={type} className="field-input" placeholder={placeholder} value={value} onChange={onChange} style={style} />
)

export const Textarea = ({ placeholder, value, onChange, rows = 7 }) => (
  <textarea className="field-input" placeholder={placeholder} value={value} onChange={onChange} rows={rows} style={{ resize: 'vertical', minHeight: 140 }} />
)

export const SelectField = ({ value, onChange, options }) => (
  <select className="field-input" value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => <option key={o}>{o}</option>)}
  </select>
)

export const EmptyState = ({ icon, text, action, onAction }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '52px 20px', textAlign: 'center' }}>
    <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16, color: 'var(--org)' }}>{icon}</div>
    <p style={{ fontSize: 14, color: 'var(--txt2)', maxWidth: 300, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{text}</p>
    {action && <Btn onClick={onAction} style={{ marginTop: 18, fontSize: 13, padding: '10px 22px' }}>{action}</Btn>}
  </div>
)

export const Toggle = ({ checked, onChange }) => (
  <label className="toggle-wrap">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="toggle-track" />
  </label>
)

export const FlatTabs = ({ tabs, active, onChange }) => (
  <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--bdr)', marginBottom: 24 }}>
    {tabs.map((t) => (
      <button key={t} onClick={() => onChange(t)} style={{
        background: 'none', border: 'none',
        borderBottom: `2px solid ${active === t ? 'var(--pur)' : 'transparent'}`,
        color: active === t ? 'var(--txt)' : 'var(--muted)',
        fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 700,
        letterSpacing: '1.2px', padding: '11px 22px', cursor: 'pointer',
        marginBottom: -1, transition: 'all 0.18s', textTransform: 'uppercase',
      }}>{t}</button>
    ))}
  </div>
)