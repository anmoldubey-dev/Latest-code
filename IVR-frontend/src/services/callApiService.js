/**
 * callApiService.js — REST client for ivr_backend (:8001)
 * No authentication — all endpoints are open.
 */

const IVR_API = 'http://localhost:8001';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function request(method, path, body) {
  const res = await fetch(`${IVR_API}${path}`, {
    method,
    headers: JSON_HEADERS,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// ── Call lifecycle ────────────────────────────────────────────────────────────

export const startCall = (callerNumber, department = 'General') =>
  request('POST', '/calls/start', { caller_number: callerNumber, department });

export const endCall = (callId) =>
  request('POST', `/calls/${callId}/end`);

export const getActiveCalls = () =>
  request('GET', '/calls/active');

export const getCallHistory = (page = 1, limit = 20) =>
  request('GET', `/calls/history?page=${page}&limit=${limit}`);

export const transferCall = (callId, toDepartment, toAgentId) =>
  request('POST', `/calls/${callId}/transfer`, {
    to_department: toDepartment,
    to_agent_id: toAgentId,
    action_type: 'transfer',
  });

// ── Transcripts ───────────────────────────────────────────────────────────────

export const addTranscript = (callId, speaker, text) =>
  request('POST', `/calls/${callId}/transcript`, { speaker, text });

export const getTranscripts = (callId) =>
  request('GET', `/calls/${callId}/transcripts`);

// ── TTS via ivr_backend ───────────────────────────────────────────────────────

export async function generateSpeechFromIVR(text, language = 'English') {
  const res = await fetch(`${IVR_API}/tts/generate`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) throw new Error(`TTS error: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
