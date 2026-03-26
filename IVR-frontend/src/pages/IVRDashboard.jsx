import { useState } from 'react';
import {
  Phone, GitBranch, PhoneCall, Settings, ChevronRight,
} from 'lucide-react';
import Dialer from '../components/Dialer/Dialer';
import IVRBuilder from '../components/IVR/IVRBuilder';
import TransferPanel from '../components/TransferPanel/TransferPanel';
import ConferencePanel from '../components/ConferencePanel/ConferencePanel';
import ActiveCallsPage from './ActiveCallsPage';
import { useCall } from '../context/CallContext';
import { useSession } from '../context/SessionContext';

// ── Sidebar items ─────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dialer',    label: 'Dialer',       icon: Phone        },
  { id: 'ivr',       label: 'IVR Builder',  icon: GitBranch    },
  { id: 'calls',     label: 'Active Calls', icon: PhoneCall    },
  { id: 'settings',  label: 'Settings',     icon: Settings     },
];

// ── Active Calls placeholder ──────────────────────────────────────────────────
function ActiveCalls() {
  const { callState, dialNumber, callDuration, CALL_STATES } = useCall();
  const isActive = callState !== CALL_STATES.IDLE && callState !== CALL_STATES.ENDED;

  const formatDur = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-white">Active Calls</h2>
        <p className="text-xs text-gray-500 mt-0.5">Real-time call monitoring</p>
      </div>

      {!isActive ? (
        <div
          className="flex flex-col items-center gap-3 py-12 rounded-2xl text-center"
          style={{ border: '1px dashed rgba(255,255,255,0.06)' }}
        >
          <Activity size={28} className="text-gray-700" />
          <div>
            <p className="text-sm text-gray-500">No active calls</p>
            <p className="text-xs text-gray-700 mt-1">Use the Dialer to place a call</p>
          </div>
        </div>
      ) : (
        <div
          className="flex items-center gap-4 px-4 py-4 rounded-2xl"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(34,197,94,0.15)' }}
          >
            <Phone size={18} className="text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">
              {dialNumber || 'Unknown'}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`badge-${callState} text-xs`}>{callState.replace('_', ' ')}</span>
              {callState === CALL_STATES.CONNECTED && (
                <span className="text-xs font-mono text-gray-500">{formatDur(callDuration)}</span>
              )}
            </div>
          </div>
          <ChevronRight size={15} className="text-gray-600 flex-shrink-0" />
        </div>
      )}
    </div>
  );
}

// ── Settings placeholder ──────────────────────────────────────────────────────
function SettingsPanel() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-white">Settings</h2>
        <p className="text-xs text-gray-500 mt-0.5">System configuration</p>
      </div>

      <div className="flex flex-col gap-3">
        {[
          { label: 'Backend URL',    value: 'http://localhost:8000',   hint: 'Piper TTS + API endpoint' },
          { label: 'Default Language', value: 'English',              hint: 'IVR greeting language' },
          { label: 'Noise Threshold',  value: '0.667',                hint: 'Piper noise scale' },
        ].map(({ label, value, hint }) => (
          <div key={label} className="glass-card rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">{label}</div>
                <div className="text-xs text-gray-600 mt-0.5">{hint}</div>
              </div>
              <div
                className="text-xs font-mono px-2.5 py-1 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}
              >
                {value}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="text-xs text-gray-600 px-1 mt-2"
        style={{ lineHeight: '1.6' }}
      >
        Settings persistence and WebRTC configuration will be available in a future release.
        Voice models are managed by the Piper TTS backend.
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function IVRDashboard() {
  const [activeNav, setActiveNav] = useState('dialer');
  const { callState, CALL_STATES } = useCall();
  const agent = useSession();

  const isTransferring = callState === CALL_STATES.TRANSFERRING;
  const isConference   = callState === CALL_STATES.CONFERENCE;

  const renderMain = () => {
    // Transfer / conference overlay takes priority
    if (isTransferring) return <TransferPanel />;
    if (isConference)   return <ConferencePanel />;

    switch (activeNav) {
      case 'dialer':   return <Dialer />;
      case 'ivr':      return <IVRBuilder />;
      case 'calls':    return <ActiveCallsPage />;
      case 'settings': return <SettingsPanel />;
      default:         return <Dialer />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className="flex flex-col w-56 flex-shrink-0 border-r"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.25)' }}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
            >
              <Phone size={15} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight">SR Comsoft</div>
              <div className="text-xs text-gray-600 leading-tight">Call Center</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveNav(id)}
              className={`sidebar-item ${activeNav === id ? 'active' : ''}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        {/* Footer — agent info */}
        <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="text-xs font-medium text-gray-300 truncate">{agent.name}</div>
          <div className="text-xs text-gray-700 capitalize">{agent.role}</div>
        </div>
      </aside>

      {/* ── Main panel ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.1)' }}
        >
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="text-gray-600">Dashboard</span>
            <ChevronRight size={13} className="text-gray-700" />
            <span className="text-white font-medium capitalize">
              {isTransferring ? 'Transfer' : isConference ? 'Conference' : NAV_ITEMS.find(n => n.id === activeNav)?.label ?? ''}
            </span>
          </div>

          {/* System status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#22c55e', boxShadow: '0 0 4px rgba(34,197,94,0.6)' }}
              />
              Backend ready
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#6366F1', boxShadow: '0 0 4px rgba(99,102,241,0.6)' }}
              />
              Piper TTS
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div
            className="glass-card rounded-2xl p-5 min-h-full"
            style={{ maxWidth: '680px', margin: '0 auto' }}
          >
            {renderMain()}
          </div>
        </div>
      </main>
    </div>
  );
}
