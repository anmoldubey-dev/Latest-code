// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | request()                 |
// | * atomic fetch wrapper    |
// +---------------------------+
//     |
//     |----> fetch()
//     |        * execute network request
//     |
//     v
// +---------------------------+
// | checkAllHealth()          |
// | * system-wide health poll |
// +---------------------------+
//     |
//     |----> backendApi.health()
//     |        * check core backend
//     |
//     |----> ttsGlobalApi.health()
//     |        * check global tts
//     |
//     |----> translatorApi.health()
//     |        * check translation
//     |
//     v
// [ END ]
// ================================================================
// API Client — Base fetch helpers with timeout + error handling
// ================================================================

const SERVICES = {
  backend:      '/api/backend',
  ttsGlobal:    '/api/tts-global',
  ttsIndic:     '/api/tts-indic',
  diarization:  '/api/diarization',
  translator:   '/api/translator',
  voiceCloner:  '/api/voice-cloner',
  haupRag:      '/api/haup-rag',
}

async function request(base, path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 8000)
  try {
    const res = await fetch(`${base}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    clearTimeout(timer)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw Object.assign(new Error(text || res.statusText), { status: res.status })
    }
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) return res.json()
    return res
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Request timed out')
    throw err
  }
}

// ── Backend :8000 ───────────────────────────────────────────────
export const backendApi = {
  voices:           () => request(SERVICES.backend, '/api/voices'),
  livenessHealth:   () => request(SERVICES.backend, '/livekit/health'),
  routingRules:     () => request(SERVICES.backend, '/routing/rules'),
  reloadRules:      () => request(SERVICES.backend, '/routing/rules/reload', { method: 'POST' }),
  testRoute:        (body) => request(SERVICES.backend, '/routing/decision', { method: 'POST', body: JSON.stringify(body) }),
  ivrStatus:        () => request(SERVICES.backend, '/ivr/status'),
  listAssets:       () => request(SERVICES.backend, '/list-assets'),
  health:           () => request(SERVICES.backend, '/livekit/health', { timeout: 8000 }),
  getCapacity:      () => request(SERVICES.backend, '/api/config/capacity'),
  setCapacity:      (max_calls) => request(SERVICES.backend, `/api/config/capacity?max_calls=${max_calls}`, { method: 'POST' }),
  queueStats:       () => request(SERVICES.backend, '/ivr/queue-stats'),
  summarizePersona: (body) => request(SERVICES.backend, '/api/avatar/summarize-persona', {
    method: 'POST', body: JSON.stringify(body), timeout: 1200000,
  }),
  configureAvatar: (body) => request(SERVICES.backend, '/api/avatar/configure', {
    method: 'POST', body: JSON.stringify(body), timeout: 1200000,
  }),
}

// ── TTS Global :8003 ────────────────────────────────────────────
export const ttsGlobalApi = {
  health:     () => request(SERVICES.ttsGlobal, '/health', { timeout: 3000 }),
  voices:     () => request(SERVICES.ttsGlobal, '/voices'),
  languages:  () => request(SERVICES.ttsGlobal, '/languages'),
  recordings: () => request(SERVICES.ttsGlobal, '/recordings'),
  deleteAll:  () => request(SERVICES.ttsGlobal, '/recordings', { method: 'DELETE' }),
  generate:   (body) => request(SERVICES.ttsGlobal, '/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    timeout: 300000,
  }),
  audioUrl:   (filename) => `${SERVICES.ttsGlobal}/audio/${filename}`,
}

// ── TTS Indic :8004 ─────────────────────────────────────────────
export const ttsIndicApi = {
  health:     () => request(SERVICES.ttsIndic, '/health', { timeout: 3000 }),
  voices:     () => request(SERVICES.ttsIndic, '/voices'),
  languages:  () => request(SERVICES.ttsIndic, '/languages'),
  recordings: () => request(SERVICES.ttsIndic, '/recordings'),
  deleteAll:  () => request(SERVICES.ttsIndic, '/recordings', { method: 'DELETE' }),
  generate:   (body) => request(SERVICES.ttsIndic, '/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    timeout: 300000,
  }),
  audioUrl:   (filename) => `${SERVICES.ttsIndic}/audio/${filename}`,
}

// ── Diarization :8001 ───────────────────────────────────────────
export const diarizationApi = {
  health: () => request(SERVICES.diarization, '/health', { timeout: 3000 }).catch(() => ({ status: 'offline' })),
}

// ── Translator :8002 ────────────────────────────────────────────
export const translatorApi = {
  health:    () => request(SERVICES.translator, '/health', { timeout: 3000 }),
  languages: () => request(SERVICES.translator, '/languages'),
  translate: (body) => request(SERVICES.translator, '/translate', {
    method: 'POST',
    body: JSON.stringify(body),
    timeout: 30000,
  }),
}

// ── Voice Cloner :8005 ──────────────────────────────────────────
export const voiceClonerApi = {
  health:   () => request(SERVICES.voiceCloner, '/health', { timeout: 3000 }),
  generate: (formData) => fetch(`${SERVICES.voiceCloner}/generate`, { method: 'POST', body: formData }),
}

// ── HAUP RAG :8080 ──────────────────────────────────────────────
export const haupRagApi = {
  health:   () => request(SERVICES.haupRag, '/health', { timeout: 3000 }).catch(() => ({ status: 'offline' })),
  sessions: () => request(SERVICES.haupRag, '/sessions', { timeout: 5000 }).catch(() => ({ sessions: [] })),
}

// ── Multi-service health check ──────────────────────────────────
export async function checkAllHealth() {
  const checks = await Promise.allSettled([
    backendApi.health().then(d     => ({ name: 'Backend',       port: 8000, ...d, ok: true })),
    diarizationApi.health().then(d => ({ name: 'Diarization',   port: 8001, ...d, ok: true })),
    translatorApi.health().then(d  => ({ name: 'Translator',    port: 8002, ...d, ok: true })),
    ttsGlobalApi.health().then(d   => ({ name: 'TTS Global',    port: 8003, ...d, ok: true })),
    ttsIndicApi.health().then(d    => ({ name: 'TTS Indic',     port: 8004, ...d, ok: true })),
    voiceClonerApi.health().then(d => ({ name: 'Voice Cloner',  port: 8005, ...d, ok: true })),
    haupRagApi.health().then(d     => ({ name: 'HAUP RAG',      port: 8080, ...d, ok: d?.status === 'ok' })),
  ])
  const names = ['Backend', 'Diarization', 'Translator', 'TTS Global', 'TTS Indic', 'Voice Cloner', 'HAUP RAG']
  const ports = [8000, 8001, 8002, 8003, 8004, 8005, 8080]
  return checks.map((c, i) => {
    if (c.status === 'fulfilled') return c.value
    return { name: names[i], port: ports[i], status: 'offline', ok: false, error: c.reason?.message }
  })
}
