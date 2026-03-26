// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | MemoryCard()              |
// | * expandable memory entry |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | MemoryExplorer()          |
// | * FAISS index browser     |
// +---------------------------+
//     |
//     |----> handleDelete()
//     |        * removes entry from state
//     |
//     |----> clearAll()
//     |        * wipes all memories
//     |
//     |----> MemoryCard()
//     |        * renders each memory turn
//     |
//     v
// [ END ]
//
// ================================================================

import React, { useState } from 'react'
import { Search, Database, Trash2, MessageSquare, Clock } from 'lucide-react'
import Btn from '../components/ui/Btn.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'

// FAISS memory explorer — calls backend /api/memory endpoints when available
// Displays conversation history stored in the FAISS vector index

const MOCK_MEMORIES = [
  { id: 1, user: 'My internet is not working since morning', ai: "I'm sorry to hear that. Let me check your account status. Can you confirm your account number?", lang: 'en', ts: '2026-03-21T09:15:32' },
  { id: 2, user: 'वेबसाइट खुल नहीं रही है', ai: 'मुझे खेद है। कृपया अपना account number बताएं, मैं जांच करती हूँ।', lang: 'hi', ts: '2026-03-21T09:18:44' },
  { id: 3, user: 'Password reset nahi ho raha', ai: 'Aapko ek reset link bhejti hoon registered email par. Kya email ID sahi hai?', lang: 'hi', ts: '2026-03-21T09:22:10' },
  { id: 4, user: 'billing issue regarding last month invoice', ai: "I can see a discrepancy in your invoice. I'll raise a ticket and our billing team will contact you within 24 hours.", lang: 'en', ts: '2026-03-21T09:45:00' },
  { id: 5, user: 'app download nahi hota mobile pe', ai: 'Play Store pe Voice AI app available hai. Apna Android version check karein — 8.0+ chahiye.', lang: 'hi', ts: '2026-03-21T10:05:20' },
]

const LANG_NAMES = { en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu' }

function MemoryCard({ item, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const date = new Date(item.ts)
  const timeStr = date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      transition: 'border-color var(--t-fast)',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'var(--cyan-dim)', border: '1px solid var(--border-cyan)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MessageSquare size={13} style={{ color: 'var(--cyan)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }} className="truncate">
            {item.user}
          </div>
          {!expanded && (
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }} className="truncate">
              AI: {item.ai}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} />{timeStr}
          </span>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-elevated)', color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
            {LANG_NAMES[item.lang] ?? item.lang}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 14px 60px', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>User</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{item.user}</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>AI Response</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item.ai}</div>
          </div>
          <Btn variant="danger" size="sm" icon={Trash2} onClick={() => onDelete(item.id)}>Remove from index</Btn>
        </div>
      )}
    </div>
  )
}

export default function MemoryExplorer() {
  const [memories, setMemories] = useState(MOCK_MEMORIES)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const filtered = query
    ? memories.filter(m =>
        m.user.toLowerCase().includes(query.toLowerCase()) ||
        m.ai.toLowerCase().includes(query.toLowerCase())
      )
    : memories

  function handleDelete(id) {
    setMemories(m => m.filter(x => x.id !== id))
  }

  function clearAll() {
    if (confirm('Clear entire FAISS conversation memory index?')) {
      setMemories([])
    }
  }

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Memory Explorer"
        subtitle="FAISS vector index — conversation history (all-MiniLM-L6-v2 embeddings)"
        action={<Btn variant="danger" icon={Trash2} onClick={clearAll}>Clear Index</Btn>}
      />

      {/* Index stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Stored Turns',    value: memories.length,  color: 'var(--cyan)'   },
          { label: 'Index Path',      value: 'faiss_index/',   color: 'var(--purple)' },
          { label: 'Embedding Dim',   value: '384',            color: 'var(--green)'  },
          { label: 'Search k',        value: '2',              color: 'var(--yellow)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={13} style={{ color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Semantic search through conversation history…"
          style={{ width: '100%', paddingLeft: 32, borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {/* Info note */}
      <div style={{ marginBottom: 14, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 11.5, color: 'var(--text-secondary)' }}>
        FAISS index persists at <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>backend/faiss_index/</code>.
        Connect <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>GET /api/memory/search</code> to enable live semantic search.
        Showing mock data — {memories.length} entries.
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 12 }}>
          {query ? 'No matches found' : 'Memory index is empty'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(m => (
            <MemoryCard key={m.id} item={m} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
