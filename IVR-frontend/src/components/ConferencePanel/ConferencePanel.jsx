import { useState } from 'react';
import { Users, Plus, Mic, MicOff, PhoneOff, X } from 'lucide-react';
import { useCall } from '../../context/CallContext';

/**
 * ConferencePanel — displayed when callState === 'conference'.
 * Simulates a multi-party conference bridge UI.
 */
export default function ConferencePanel() {
  const { callState, CALL_STATES, endCall, endConference } = useCall();

  const [participants, setParticipants] = useState([
    { id: 'agent',    name: 'You (Agent)',  muted: false, active: true  },
    { id: 'caller',   name: 'Caller',       muted: false, active: true  },
  ]);
  const [addInput, setAddInput]     = useState('');
  const [isAdding,  setIsAdding]    = useState(false);

  if (callState !== CALL_STATES.CONFERENCE) return null;

  const toggleMute = (id) => {
    setParticipants(prev =>
      prev.map(p => p.id === id ? { ...p, muted: !p.muted } : p)
    );
  };

  const removeParticipant = (id) => {
    if (id === 'agent' || id === 'caller') return; // cannot remove primary parties
    setParticipants(prev => prev.filter(p => p.id !== id));
  };

  const addParticipant = () => {
    const num = addInput.trim();
    if (!num) return;
    setParticipants(prev => [
      ...prev,
      { id: `p_${Date.now()}`, name: num, muted: false, active: true },
    ]);
    setAddInput('');
    setIsAdding(false);
  };

  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-sky-400" />
          <span className="text-sm font-semibold text-white">Conference Bridge</span>
        </div>
        <span className="badge-conference">{participants.length} Parties</span>
      </div>

      {/* Participant list */}
      <div className="flex flex-col gap-2">
        {participants.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'rgba(14,165,233,0.2)', color: '#38bdf8' }}
            >
              {p.name[0].toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{p.name}</div>
              <div className="text-xs text-gray-500">{p.muted ? 'Muted' : 'Active'}</div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleMute(p.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150"
                style={{
                  background: p.muted ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                  color: p.muted ? '#f87171' : '#94a3b8',
                }}
                title={p.muted ? 'Unmute' : 'Mute'}
              >
                {p.muted ? <MicOff size={12} /> : <Mic size={12} />}
              </button>

              {p.id !== 'agent' && p.id !== 'caller' && (
                <button
                  type="button"
                  onClick={() => removeParticipant(p.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}
                  title="Remove from conference"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add participant */}
      {isAdding ? (
        <div className="flex gap-2">
          <input
            type="text"
            className="input-field text-sm flex-1"
            placeholder="Extension or phone number…"
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
            autoFocus
            maxLength={20}
          />
          <button type="button" onClick={addParticipant} className="btn-primary px-3 py-2 text-xs">
            Add
          </button>
          <button type="button" onClick={() => { setIsAdding(false); setAddInput(''); }} className="btn-ghost px-3 py-2 text-xs">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="btn-secondary text-xs gap-2 py-2"
        >
          <Plus size={13} />
          Add Participant
        </button>
      )}

      <div className="divider" />

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={endConference}
          className="btn-ghost flex-1 text-xs gap-2"
        >
          <PhoneOff size={13} />
          Leave Conference
        </button>
        <button
          type="button"
          onClick={endCall}
          className="btn-danger flex-1 text-xs gap-2"
        >
          <PhoneOff size={13} />
          End All
        </button>
      </div>
    </div>
  );
}
