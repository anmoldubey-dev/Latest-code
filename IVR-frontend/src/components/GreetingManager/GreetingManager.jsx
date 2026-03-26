import { useState, useEffect, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import LanguageSelector from '../LanguageSelector/LanguageSelector';
import AudioPreviewButton from '../AudioPreviewButton/AudioPreviewButton';

/**
 * GreetingManager — manages greeting text, language, speaker, and audio preview
 * for a single IVR menu or option greeting.
 *
 * Fetches the full voice registry from backend (:8000 /api/voices) so every
 * language shows all available speaker models (e.g. Hindi may have 3 voices).
 *
 * Props:
 *   greeting   {{ text, language, model_path }}
 *   onChange   (updatedGreeting) => void
 *   label      {string}
 *   disabled   {boolean}
 */

// Language display name → lang code used in the voice registry
const LANG_CODE = {
  English: 'en', Spanish: 'es', French: 'fr',
  Hindi: 'hi', Marathi: 'mr', Nepali: 'ne',
  Telugu: 'te', Malayalam: 'ml',
  Russian: 'ru', Arabic: 'ar', Chinese: 'zh',
};

// "en_US-lessac-medium" → "Lessac (US)"
function prettyVoiceName(stem) {
  const m = stem.match(/^[a-z]+_([A-Z]+)-([^-]+)/);
  if (!m) return stem;
  const region = m[1];
  const name   = m[2].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `${name} (${region})`;
}

async function fetchVoiceRegistry() {
  try {
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const res = await fetch(`${base}/api/voices`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

export default function GreetingManager({
  greeting,
  onChange,
  label = 'Greeting',
  disabled = false,
}) {
  const [registry,   setRegistry]   = useState({});   // { langCode: [{name, model_path}] }
  const [voiceList,  setVoiceList]  = useState([]);   // voices for current language

  // Fetch voice registry once on mount
  useEffect(() => {
    fetchVoiceRegistry().then(reg => setRegistry(reg));
  }, []);

  // When language or registry changes, update available voice list
  // and auto-select first voice if the current model_path doesn't belong to this language
  useEffect(() => {
    const lang    = greeting?.language ?? 'English';
    const code    = LANG_CODE[lang] || 'en';
    const voices  = registry[code] || [];
    setVoiceList(voices);

    if (voices.length > 0) {
      const currentPath   = greeting?.model_path ?? '';
      const stillValid    = voices.some(v => v.model_path === currentPath);
      if (!stillValid) {
        // Auto-select first voice for this language
        onChange?.({ ...greeting, language: lang, model_path: voices[0].model_path });
      }
    }
  }, [greeting?.language, registry]); // eslint-disable-line

  const update = useCallback(
    (patch) => onChange?.({ ...greeting, ...patch }),
    [greeting, onChange],
  );

  const selectedModelPath = greeting?.model_path || voiceList[0]?.model_path || '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare size={14} className="text-indigo-400" />
        <span className="text-sm font-medium text-gray-300">{label}</span>
      </div>

      {/* Text area */}
      <textarea
        rows={3}
        disabled={disabled}
        placeholder="Type the greeting text that will be spoken…"
        value={greeting?.text ?? ''}
        onChange={(e) => update({ text: e.target.value })}
        className="input-field resize-none text-sm leading-relaxed"
        style={{ minHeight: '80px' }}
      />

      {/* Controls row */}
      <div className="flex items-end gap-3 flex-wrap">

        {/* Language */}
        <div className="flex-1 min-w-[140px]">
          <LanguageSelector
            value={greeting?.language ?? 'English'}
            onChange={(lang) => update({ language: lang, model_path: '' })}
            disabled={disabled}
            showVoice={false}
          />
        </div>

        {/* Speaker — only shown when ≥1 voice available */}
        {voiceList.length > 0 && (
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-gray-500 mb-1 block">Speaker</label>
            <div className="relative">
              <select
                value={selectedModelPath}
                onChange={(e) => update({ model_path: e.target.value })}
                disabled={disabled || voiceList.length === 1}
                className="input-field appearance-none cursor-pointer text-sm"
                style={{ paddingRight: '2.25rem' }}
              >
                {voiceList.map(v => (
                  <option key={v.name} value={v.model_path} style={{ background: '#0f172a' }}>
                    {prettyVoiceName(v.name)}
                  </option>
                ))}
              </select>
              {/* no chevron import needed — inline SVG */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        )}

        {/* Preview button */}
        <AudioPreviewButton
          text={greeting?.text ?? ''}
          language={greeting?.language ?? 'English'}
          modelPath={selectedModelPath || null}
          disabled={disabled}
          size="md"
        />
      </div>
    </div>
  );
}
