import { useState } from 'react';
import { PhoneForwarded, X, Check, AlertCircle } from 'lucide-react';
import { useCall } from '../../context/CallContext';

const TRANSFER_TARGETS = [
  { id: 'sales',    label: 'Sales',      ext: '101' },
  { id: 'support',  label: 'Support',    ext: '102' },
  { id: 'billing',  label: 'Billing',    ext: '103' },
  { id: 'manager',  label: 'Manager',    ext: '200' },
  { id: 'voicemail',label: 'Voicemail',  ext: 'VM'  },
];

/**
 * TransferPanel — warm/blind transfer UI, visible when callState === 'transferring'.
 */
export default function TransferPanel() {
  const {
    callState,
    CALL_STATES,
    transferTarget,
    setTransferTarget,
    completeTransfer,
    cancelTransfer,
  } = useCall();

  const [customExt, setCustomExt] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);

  if (callState !== CALL_STATES.TRANSFERRING) return null;

  const selectedPreset = TRANSFER_TARGETS.find(t => t.id === transferTarget);
  const finalTarget    = selectedPreset
    ? `${selectedPreset.label} (Ext. ${selectedPreset.ext})`
    : customExt.trim() || null;

  const handleConfirm = () => {
    if (!finalTarget) return;
    setConfirmStep(true);
  };

  const handleComplete = () => {
    completeTransfer();
    setConfirmStep(false);
    setCustomExt('');
  };

  const handleCancel = () => {
    cancelTransfer();
    setConfirmStep(false);
    setCustomExt('');
    setTransferTarget('');
  };

  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PhoneForwarded size={16} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Transfer Call</span>
        </div>
        <span className="badge-transferring">Transferring</span>
      </div>

      {!confirmStep ? (
        <>
          {/* Preset targets */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Quick Targets</p>
            <div className="grid grid-cols-2 gap-2">
              {TRANSFER_TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTransferTarget(t.id); setCustomExt(''); }}
                  className="text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-150"
                  style={{
                    background: transferTarget === t.id
                      ? 'rgba(139,92,246,0.2)'
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${transferTarget === t.id ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    color: transferTarget === t.id ? '#a78bfa' : '#94a3b8',
                  }}
                >
                  <div className="font-medium text-inherit">{t.label}</div>
                  <div className="text-xs opacity-60">Ext. {t.ext}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom extension */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Custom Extension / Number</p>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="Enter extension or number…"
              value={customExt}
              onChange={(e) => { setCustomExt(e.target.value); setTransferTarget(''); }}
              maxLength={20}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              className="btn-ghost flex-1 gap-2"
            >
              <X size={14} />
              Cancel
            </button>
            <button
              type="button"
              disabled={!finalTarget}
              onClick={handleConfirm}
              className="btn-primary flex-1 gap-2"
            >
              <PhoneForwarded size={14} />
              Transfer
            </button>
          </div>
        </>
      ) : (
        /* Confirm step */
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.15)' }}>
            <AlertCircle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-gray-300">
              Transferring call to <span className="font-semibold text-white">{finalTarget}</span>.
              The caller will be connected and you will be disconnected.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmStep(false)}
              className="btn-ghost flex-1"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleComplete}
              className="btn-success flex-1 gap-2"
            >
              <Check size={14} />
              Confirm Transfer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
