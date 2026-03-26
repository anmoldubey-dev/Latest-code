import { useState, useCallback } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Edit2, Check, X,
  GitBranch, Hash, ArrowRight, Phone, Voicemail,
  RefreshCw, PhoneOff, CornerDownRight,
} from 'lucide-react';
import GreetingManager from '../GreetingManager/GreetingManager';
import { useCall } from '../../context/CallContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTION_TYPES = [
  { value: 'department', label: 'Route to Department', icon: <Phone size={13} /> },
  { value: 'agent',      label: 'Route to Agent',      icon: <Phone size={13} /> },
  { value: 'voicemail',  label: 'Send to Voicemail',   icon: <Voicemail size={13} /> },
  { value: 'redirect',   label: 'Redirect to IVR',     icon: <CornerDownRight size={13} /> },
  { value: 'repeat',     label: 'Repeat Menu',         icon: <RefreshCw size={13} /> },
  { value: 'disconnect', label: 'Disconnect',           icon: <PhoneOff size={13} /> },
];

const ACTION_TARGETS = {
  department: ['Sales', 'Support', 'Billing', 'Operations', 'HR'],
  agent:      ['Agent 1', 'Agent 2', 'Agent 3', 'Agent 4'],
  voicemail:  [],
  redirect:   [],   // populated from menu list
  repeat:     [],
  disconnect: [],
};

const DTMF_KEYS = ['1','2','3','4','5','6','7','8','9','*','0','#'];

let _uid = 1;
const uid = () => `${Date.now()}_${_uid++}`;

function makeMenu(name = 'New Menu') {
  return {
    id:       uid(),
    name,
    greeting: { text: '', language: 'English', model_path: '' },
    options:  [],
  };
}

function makeOption() {
  return {
    id:      uid(),
    dtmfKey: '',
    label:   '',
    action:  'department',
    target:  '',
  };
}

// ── Option row ────────────────────────────────────────────────────────────────

function OptionRow({ option, index, total, menus, onChange, onRemove, onMoveUp, onMoveDown }) {
  const [editing, setEditing] = useState(!option.label);

  const update = (patch) => onChange({ ...option, ...patch });

  const availableTargets = option.action === 'redirect'
    ? menus.filter(m => m.id !== option.menuId).map(m => m.name)
    : ACTION_TARGETS[option.action] ?? [];

  const ActionIcon = ACTION_TYPES.find(a => a.value === option.action)?.icon;

  if (editing) {
    return (
      <div
        className="ivr-option-row flex-col items-stretch gap-3"
        style={{ borderColor: 'rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.04)' }}
      >
        {/* Top row: DTMF + label */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 w-16 flex-shrink-0">
            <label className="text-xs text-gray-500">Key</label>
            <select
              value={option.dtmfKey}
              onChange={(e) => update({ dtmfKey: e.target.value })}
              className="input-field text-sm py-2 text-center"
            >
              <option value="" style={{ background: '#0f172a' }}>–</option>
              {DTMF_KEYS.map(k => (
                <option key={k} value={k} style={{ background: '#0f172a' }}>{k}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-gray-500">Label</label>
            <input
              type="text"
              className="input-field text-sm py-2"
              placeholder="e.g. Press 1 for Sales"
              value={option.label}
              onChange={(e) => update({ label: e.target.value })}
              maxLength={60}
            />
          </div>
        </div>

        {/* Action + Target */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-gray-500">Action</label>
            <select
              value={option.action}
              onChange={(e) => update({ action: e.target.value, target: '' })}
              className="input-field text-sm py-2"
            >
              {ACTION_TYPES.map(a => (
                <option key={a.value} value={a.value} style={{ background: '#0f172a' }}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {availableTargets.length > 0 && (
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-500">Target</label>
              <select
                value={option.target}
                onChange={(e) => update({ target: e.target.value })}
                className="input-field text-sm py-2"
              >
                <option value="" style={{ background: '#0f172a' }}>Select…</option>
                {availableTargets.map(t => (
                  <option key={t} value={t} style={{ background: '#0f172a' }}>{t}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Save / Delete */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
            style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
          >
            <X size={12} /> Delete
          </button>
          <button
            type="button"
            disabled={!option.dtmfKey || !option.label}
            onClick={() => setEditing(false)}
            className="btn-primary text-xs gap-1.5 py-1.5 px-3"
          >
            <Check size={12} />
            Done
          </button>
        </div>
      </div>
    );
  }

  // Collapsed view
  return (
    <div className="ivr-option-row">
      {/* DTMF key badge */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
      >
        {option.dtmfKey || '–'}
      </div>

      {/* Label + action */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {option.label || <span className="text-gray-500">Unnamed option</span>}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
          {ActionIcon}
          <span>{ACTION_TYPES.find(a => a.value === option.action)?.label ?? option.action}</span>
          {option.target && (
            <>
              <ArrowRight size={10} />
              <span className="text-gray-400">{option.target}</span>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          disabled={index === 0}
          onClick={onMoveUp}
          className="w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150"
          style={{ color: 'rgba(255,255,255,0.25)', background: 'transparent' }}
          title="Move up"
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={onMoveDown}
          className="w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150"
          style={{ color: 'rgba(255,255,255,0.25)', background: 'transparent' }}
          title="Move down"
        >
          <ChevronDown size={13} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150"
          style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.04)' }}
          title="Edit"
        >
          <Edit2 size={11} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150"
          style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)' }}
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Menu card ─────────────────────────────────────────────────────────────────

function MenuCard({ menu, menus, onChange, onRemove, index, total, onMoveUp, onMoveDown }) {
  const [expanded, setExpanded] = useState(index === 0);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput]     = useState(menu.name);

  const updateGreeting = useCallback(
    (greeting) => onChange({ ...menu, greeting }),
    [menu, onChange],
  );

  const addOption = () => {
    onChange({ ...menu, options: [...menu.options, makeOption()] });
  };

  const updateOption = (id, updated) => {
    onChange({ ...menu, options: menu.options.map(o => o.id === id ? updated : o) });
  };

  const removeOption = (id) => {
    onChange({ ...menu, options: menu.options.filter(o => o.id !== id) });
  };

  const moveOption = (fromIdx, toIdx) => {
    const opts = [...menu.options];
    const [item] = opts.splice(fromIdx, 1);
    opts.splice(toIdx, 0, item);
    onChange({ ...menu, options: opts });
  };

  const saveName = () => {
    if (nameInput.trim()) {
      onChange({ ...menu, name: nameInput.trim() });
    } else {
      setNameInput(menu.name);
    }
    setEditingName(false);
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Menu header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150"
        style={{ background: 'rgba(255,255,255,0.03)' }}
        onClick={() => !editingName && setExpanded(e => !e)}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
        >
          {index + 1}
        </div>

        {editingName ? (
          <input
            className="input-field text-sm py-1.5 flex-1"
            value={nameInput}
            autoFocus
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameInput(menu.name); } }}
            onClick={(e) => e.stopPropagation()}
            maxLength={50}
          />
        ) : (
          <span className="flex-1 text-sm font-semibold text-white">{menu.name}</span>
        )}

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-gray-600 mr-1">{menu.options.length} opts</span>
          <button
            type="button"
            onClick={() => { setEditingName(true); setNameInput(menu.name); }}
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.04)' }}
          >
            <Edit2 size={11} />
          </button>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ color: index === 0 ? 'rgba(255,255,255,0.1)' : '#94a3b8' }}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ color: index === total - 1 ? 'rgba(255,255,255,0.1)' : '#94a3b8' }}
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)' }}
          >
            <Trash2 size={11} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ color: '#94a3b8' }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-4" style={{ background: 'rgba(0,0,0,0.15)' }}>

          {/* Greeting */}
          <div className="glass-card rounded-xl p-4">
            <GreetingManager
              greeting={menu.greeting}
              onChange={updateGreeting}
              label="Menu Greeting"
            />
          </div>

          {/* Options */}
          <div>
            <div className="section-header mb-3">
              <div>
                <div className="section-title">Menu Options</div>
                <div className="section-sub">DTMF keypress routing rules</div>
              </div>
              <button
                type="button"
                onClick={addOption}
                className="btn-secondary text-xs gap-1.5 py-1.5 px-3"
              >
                <Plus size={12} />
                Add Option
              </button>
            </div>

            {menu.options.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 py-6 rounded-xl text-center"
                style={{ border: '1px dashed rgba(255,255,255,0.08)' }}
              >
                <Hash size={20} className="text-gray-700" />
                <p className="text-sm text-gray-600">No options yet. Add the first option.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {menu.options.map((opt, i) => (
                  <OptionRow
                    key={opt.id}
                    option={opt}
                    index={i}
                    total={menu.options.length}
                    menus={menus}
                    onChange={(updated) => updateOption(opt.id, updated)}
                    onRemove={() => removeOption(opt.id)}
                    onMoveUp={() => moveOption(i, i - 1)}
                    onMoveDown={() => moveOption(i, i + 1)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── IVR Builder ───────────────────────────────────────────────────────────────

export default function IVRBuilder() {
  const { isActive } = useCall();
  const [menus, setMenus] = useState([makeMenu('Main Menu')]);

  const addMenu = () => {
    setMenus(prev => [...prev, makeMenu(`Menu ${prev.length + 1}`)]);
  };

  const updateMenu = useCallback((id, updated) => {
    setMenus(prev => prev.map(m => m.id === id ? updated : m));
  }, []);

  const removeMenu = (id) => {
    setMenus(prev => prev.length > 1 ? prev.filter(m => m.id !== id) : prev);
  };

  const moveMenu = (fromIdx, toIdx) => {
    setMenus(prev => {
      const arr = [...prev];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
  };

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-white">IVR Builder</h2>
          <p className="text-xs text-gray-500 mt-0.5">Configure menus, greetings, and routing</p>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="badge-connected">Live Preview Active</span>
          )}
          <button type="button" onClick={addMenu} className="btn-primary text-xs gap-1.5 py-2 px-4">
            <Plus size={13} />
            Add Menu
          </button>
        </div>
      </div>

      {/* Preview disabled notice */}
      {!isActive && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl mb-4 text-sm text-gray-400"
          style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.12)' }}
        >
          <GitBranch size={14} className="text-yellow-500 flex-shrink-0" />
          <span>
            IVR simulation is available when a call is connected. You can still build and preview greetings now.
          </span>
        </div>
      )}

      {/* Menus */}
      <div className="flex flex-col gap-3 overflow-y-auto flex-1">
        {menus.map((menu, i) => (
          <MenuCard
            key={menu.id}
            menu={menu}
            menus={menus}
            index={i}
            total={menus.length}
            onChange={(updated) => updateMenu(menu.id, updated)}
            onRemove={() => removeMenu(menu.id)}
            onMoveUp={() => moveMenu(i, i - 1)}
            onMoveDown={() => moveMenu(i, i + 1)}
          />
        ))}

        {/* Add menu CTA */}
        <button
          type="button"
          onClick={addMenu}
          className="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm text-gray-600 transition-all duration-150 mt-1"
          style={{ border: '1px dashed rgba(255,255,255,0.07)' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.color = '#818cf8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#4b5563'; }}
        >
          <Plus size={15} />
          Add Another Menu
        </button>
      </div>
    </div>
  );
}
