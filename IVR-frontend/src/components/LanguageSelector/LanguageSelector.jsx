import { ChevronDown, Globe } from 'lucide-react';
import { LANGUAGE_GROUPS, getVoiceForLanguage } from '../../services/ttsService';

/**
 * LanguageSelector — grouped dropdown covering all 11 supported languages.
 *
 * Groups (from ttsService.LANGUAGE_GROUPS):
 *   Latin Script  — English, Spanish, French
 *   Devanagari    — Hindi, Marathi, Nepali
 *   Dravidian     — Telugu, Malayalam
 *   Global        — Russian, Arabic, Chinese
 *
 * Props:
 *   value     {string}   — selected language
 *   onChange  {Function} — (language) => void
 *   disabled  {boolean}
 *   showVoice {boolean}  — show resolved voice name below dropdown (default true)
 */
export default function LanguageSelector({
  value = 'English',
  onChange,
  disabled = false,
  showVoice = true,
}) {
  const voiceName = getVoiceForLanguage(value);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <Globe size={12} />
        <span>Language / Voice</span>
      </div>

      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className="input-field appearance-none cursor-pointer text-sm"
          style={{ paddingRight: '2.25rem' }}
        >
          {LANGUAGE_GROUPS.map((group) => (
            <optgroup
              key={group.label}
              label={group.label}
              style={{ background: '#0f172a', color: '#818cf8' }}
            >
              {group.languages.map((lang) => (
                <option key={lang} value={lang} style={{ background: '#0f172a' }}>
                  {lang}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
        />
      </div>

      {showVoice && (
        <p className="text-xs pl-1 mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Voice:{' '}
          <span className="font-medium" style={{ color: '#818cf8' }}>
            {voiceName}
          </span>
        </p>
      )}
    </div>
  );
}
