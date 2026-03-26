import { useState, useRef, useCallback } from 'react';
import { Volume2, Square, Loader } from 'lucide-react';
import { generateSpeech } from '../../services/ttsService';

/**
 * AudioPreviewButton — plays Piper TTS preview for a given text + language.
 *
 * FIX: Object URL is only revoked AFTER audio fully ends (or is stopped),
 * never while the audio element still needs it. This prevents "Playback failed".
 *
 * Props:
 *   text       {string}
 *   language   {string}
 *   modelPath  {string|null} — full ONNX path; if set, overrides language voice
 *   disabled   {boolean}
 *   size       {'sm'|'md'}
 */
export default function AudioPreviewButton({
  text = '',
  language = 'English',
  modelPath = null,
  disabled = false,
  size = 'md',
}) {
  const [status, setStatus]     = useState('idle'); // idle | loading | playing | error
  const [errorMsg, setErrorMsg] = useState('');

  const audioRef = useRef(null);   // HTMLAudioElement
  const urlRef   = useRef(null);   // Object URL — revoked only after audio ends

  const isDisabled = disabled || !text?.trim();

  // ── Revoke URL safely (delayed to avoid premature revocation) ────────────────
  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      // Small delay ensures the browser has finished reading the blob stream
      const url = urlRef.current;
      urlRef.current = null;
      setTimeout(() => URL.revokeObjectURL(url), 500);
    }
  }, []);

  // ── Stop / cleanup ────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onplay  = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    }
    revokeUrl();
    setStatus('idle');
  }, [revokeUrl]);

  // ── Play ──────────────────────────────────────────────────────────────────────
  const handleClick = useCallback(async () => {
    if (isDisabled) return;

    // If already playing → stop
    if (status === 'playing') {
      stopAudio();
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const objectUrl  = await generateSpeech(text, language, modelPath);
      urlRef.current   = objectUrl;

      const audio      = new Audio();
      audioRef.current = audio;

      // Attach handlers BEFORE setting src (avoid race on some browsers)
      audio.onplay  = () => setStatus('playing');
      audio.onended = () => {
        audioRef.current = null;
        revokeUrl();       // URL revoked only after playback fully completes
        setStatus('idle');
      };
      audio.onerror = () => {
        audioRef.current = null;
        revokeUrl();
        setErrorMsg('Playback failed — check backend connection.');
        setStatus('error');
        setTimeout(() => setStatus('idle'), 5000);
      };

      audio.src = objectUrl;
      await audio.play();
    } catch (err) {
      revokeUrl();
      audioRef.current = null;
      setErrorMsg(err?.message ?? 'TTS generation failed.');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 5000);
    }
  }, [isDisabled, status, text, language, modelPath, stopAudio, revokeUrl]);

  // ── Styles ────────────────────────────────────────────────────────────────────
  const iconSz = size === 'sm' ? 13 : 15;
  const cls    = size === 'sm'
    ? 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150'
    : 'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150';

  let btnStyle;
  let icon  = <Volume2 size={iconSz} />;
  let label = 'Preview';

  if (status === 'loading') {
    icon     = <Loader size={iconSz} className="spin" />;
    label    = 'Generating…';
    btnStyle = { background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)', cursor: 'not-allowed' };
  } else if (status === 'playing') {
    icon     = <Square size={iconSz} />;
    label    = 'Stop';
    btnStyle = { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' };
  } else if (status === 'error') {
    icon     = <Volume2 size={iconSz} />;
    label    = 'Preview';
    btnStyle = { background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' };
  } else {
    btnStyle = isDisabled
      ? { background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'not-allowed' }
      : { background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' };
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={isDisabled && status === 'idle'}
        onClick={handleClick}
        className={cls}
        style={btnStyle}
        title={isDisabled ? 'Enter text to preview' : `Preview in ${language} (${status === 'playing' ? 'click to stop' : 'click to play'})`}
      >
        {icon}
        <span>{label}</span>
      </button>
      {status === 'error' && errorMsg && (
        <p className="text-xs text-red-400 pl-1 leading-snug">{errorMsg}</p>
      )}
    </div>
  );
}
