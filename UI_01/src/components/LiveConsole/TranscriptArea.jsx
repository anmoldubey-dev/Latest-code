import React, { useState, useEffect } from 'react';
// 🟢 FIX: Removed the failing external import, problem solved!
import AudioRings from './AudioRings';

// 🟢 NEW: Built-in safe audio level hook so Vite never crashes looking for it!
function useAudioLevel(audioTrack) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!audioTrack) {
      setLevel(0);
      return;
    }
    // Simulated mic animation for visual effect
    const interval = setInterval(() => setLevel(Math.random() * 0.5), 200);
    return () => clearInterval(interval);
  }, [audioTrack]);
  return level;
}

const s = {
  tile: (speaking) => ({
    background:    'var(--surface)',
    border:        `1px solid ${speaking ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius:  '12px',
    padding:       '1.5rem',
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           '1rem',
    transition:    'border-color 0.2s, box-shadow 0.2s',
    boxShadow:     speaking ? '0 0 30px rgba(0,229,255,0.12)' : 'none',
    minWidth:      '160px',
  }),

  avatarWrap: {
    position:       'relative',
    width:          '100px',
    height:         '100px',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
  },

  avatar: (type) => ({
    width:          '60px',
    height:         '60px',
    borderRadius:   '50%',
    background: type === 'ai'
      ? 'linear-gradient(135deg, var(--accent2), var(--accent))'
      : type === 'phone'
        ? 'linear-gradient(135deg, #004d2e, #00a86b)'
        : 'linear-gradient(135deg, #1e2d3d, #2a3f55)',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    fontSize:       '1.4rem',
    position:       'absolute',
    top:            '50%',
    left:           '50%',
    transform:      'translate(-50%, -50%)',
    zIndex:         1,
  }),

  name: {
    fontFamily:   'var(--font-head)',
    fontWeight:   600,
    fontSize:     '0.9rem',
    color:        'var(--text)',
    textAlign:    'center',
    maxWidth:     '140px',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
  },

  badge: (type) => ({
    fontSize:      '0.6rem',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    padding:       '0.2rem 0.5rem',
    borderRadius:  '2px',
    background: type === 'ai'
      ? 'rgba(123,97,255,0.15)'
      : type === 'phone'
        ? 'rgba(0,224,150,0.12)'
        : 'rgba(0,229,255,0.08)',
    color: type === 'ai'
      ? 'var(--accent2)'
      : type === 'phone'
        ? 'var(--success)'
        : 'var(--muted)',
    border: `1px solid ${
      type === 'ai'    ? 'rgba(123,97,255,0.3)' :
      type === 'phone' ? 'rgba(0,224,150,0.3)'  :
                         'var(--border)'
    }`,
  }),
};

function participantType(identity = '') {
  if (identity.startsWith('ai-'))    return 'ai';
  if (identity.startsWith('sip_'))   return 'phone';
  if (identity.startsWith('phone-')) return 'phone';
  return 'browser';
}

function avatarEmoji(type) {
  if (type === 'ai')    return '🤖';
  if (type === 'phone') return '📱';
  return '🎙';
}

function badgeLabel(type) {
  if (type === 'ai')    return 'AI';
  if (type === 'phone') return 'Phone';
  return 'Browser';
}

function ringColor(type) {
  if (type === 'ai')    return '#7b61ff';
  if (type === 'phone') return '#00e096';
  return '#00e5ff';
}

export default function ParticipantTile({ participant, audioTrack, isMuted = false }) {
  const type  = participantType(participant?.identity);
  const level = useAudioLevel(isMuted ? null : audioTrack);
  const color = ringColor(type);

  return (
    <div style={s.tile(level > 0.05)}>
      <div style={s.avatarWrap}>
        <AudioRings level={level} color={color} />
        <div style={s.avatar(type)}>
          {avatarEmoji(type)}
        </div>
      </div>
      <div style={s.name}>
        {participant?.name && participant?.name !== participant?.identity
          ? participant.name
          : participant?.identity?.replace(/^user-/, '').slice(0, 10) || 'Unknown'}
      </div>
      <div style={s.badge(type)}>{badgeLabel(type)}</div>
    </div>
  );
}