/**
 * ttsService.js — Piper TTS integration via ivr_backend (:8001)
 *
 * All 11 supported languages, matching ivr_backend/services/voice_mapper.py.
 */

const TTS_BASE_URL = 'http://localhost:8001';

// ── Language groups (mirrors voice_mapper.py) ─────────────────────────────────
export const LANGUAGE_GROUPS = [
  { label: 'Latin Script', languages: ['English', 'Spanish', 'French'] },
  { label: 'Devanagari',   languages: ['Hindi', 'Marathi', 'Nepali'] },
  { label: 'Dravidian',    languages: ['Telugu', 'Malayalam'] },
  { label: 'Global',       languages: ['Russian', 'Arabic', 'Chinese'] },
];

export const SUPPORTED_LANGUAGES = LANGUAGE_GROUPS.flatMap(g => g.languages);

// Legacy exports kept for backward compat
export const ENGLISH_GROUP = LANGUAGE_GROUPS[0].languages;
export const HINDI_GROUP   = LANGUAGE_GROUPS[1].languages;

// ── Language → voice display name ─────────────────────────────────────────────
const VOICE_DISPLAY = {
  English:   'Lessac (US)',
  Spanish:   'Claude (MX)',
  French:    'Siwis (FR)',
  Hindi:     'Priyamvada (IN)',
  Marathi:   'Priyamvada (IN)',
  Nepali:    'Chitwan (NP)',
  Telugu:    'Padmavathi (IN)',
  Malayalam: 'Meera (IN)',
  Russian:   'Irina (RU)',
  Arabic:    'Kareem (JO)',
  Chinese:   'Huayan (CN)',
};

/** Returns the display voice label for a language. */
export function getVoiceForLanguage(language) {
  return VOICE_DISPLAY[language] ?? 'Lessac (US)';
}

/**
 * Generates speech for the given text and language via ivr_backend (:8001).
 *
 * @param {string} text
 * @param {string} language   — display name e.g. "Hindi"
 * @param {string|null} modelPath — full ONNX path; if set, overrides language lookup
 *                                   (enables multi-speaker selection in IVR Builder)
 * @returns {Promise<string>} Object URL — caller must revoke when audio ends.
 */
export async function generateSpeech(text, language = 'English', modelPath = null) {
  if (!text?.trim()) throw new Error('Text is required to generate speech.');

  const body = { text: text.trim(), language };
  if (modelPath) body.model_path = modelPath;

  const response = await fetch(`${TTS_BASE_URL}/tts/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try { detail = (await response.json()).detail ?? detail; } catch (_) {}
    throw new Error(`TTS service error: ${detail}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
