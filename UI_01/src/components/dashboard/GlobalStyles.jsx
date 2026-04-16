import { useEffect } from 'react'

const DASHBOARD_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500&display=swap');

  :root {
    --bg:#080a1a; --bg2:#0c0f22; --card:#11142a; --card-h:#151930; --elev:#181d3a;
    --bdr:rgba(110,85,230,0.14); --bdr2:rgba(110,85,230,0.32);
    --pur:#7c5cff; --pur2:#9d7dff; --purgl:rgba(124,92,255,0.25); --purl:rgba(124,92,255,0.1);
    --acc:#c084fc; --org:#ff6b35; --grn:#00d4a0; --grnl:rgba(0,212,160,0.12); --red:#ff4757;
    --txt:#e6e1ff; --txt2:#8e8ab0; --muted:#53506e; --lbl:#6c699a;
  }

  body { font-family:'Inter',system-ui,sans-serif; background:var(--bg); color:var(--txt); }

  ::-webkit-scrollbar{width:5px;}
  ::-webkit-scrollbar-track{background:var(--bg2);}
  ::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:3px;}

  @keyframes pulse   {0%,100%{opacity:1}50%{opacity:0.3}}
  @keyframes spin    {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes fadeIn  {from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  @keyframes modalIn {from{opacity:0;transform:scale(0.93)}to{opacity:1;transform:scale(1)}}
  @keyframes orb-spin{to{transform:rotate(360deg)}}
  @keyframes float-orb{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
  @keyframes blink-dot{0%,100%{opacity:1}50%{opacity:0.2}}
  @keyframes pop-scale{0%{transform:scale(0.7)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
  @keyframes slide-in{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
  @keyframes ripple-av{0%{transform:scale(1);opacity:0.8}100%{transform:scale(1.7);opacity:0}}

  .live-dot{width:8px;height:8px;border-radius:50%;background:var(--grn);box-shadow:0 0 8px var(--grn);display:inline-block;animation:pulse 2s infinite;}
  .spin-anim{display:inline-block;animation:spin 2s linear infinite;}
  .glow{background:linear-gradient(135deg,var(--pur2),var(--acc));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
  .mono{font-family:'JetBrains Mono',monospace;}
  .fade-in{animation:fadeIn 0.22s ease;}

  .field-input{background:var(--elev);border:1px solid var(--bdr);border-radius:10px;color:var(--txt);font-family:'Inter',system-ui,sans-serif;font-size:14px;padding:12px 16px;outline:none;transition:border-color 0.2s,box-shadow 0.2s;width:100%;}
  .field-input:focus{border-color:var(--pur);box-shadow:0 0 0 3px var(--purl);}
  .field-input::placeholder{color:var(--muted);}

  input[type=range]{-webkit-appearance:none;width:100%;height:4px;border-radius:2px;background:linear-gradient(90deg,var(--pur),var(--acc));outline:none;border:none;cursor:pointer;}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid var(--pur);cursor:pointer;margin-top:-7px;}

  .toggle-wrap{position:relative;display:inline-block;width:50px;height:27px;flex-shrink:0;}
  .toggle-wrap input{opacity:0;width:0;height:0;position:absolute;}
  .toggle-track{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--elev);border:1px solid var(--bdr2);border-radius:27px;transition:0.3s;}
  .toggle-track:before{position:absolute;content:"";height:19px;width:19px;left:3px;bottom:3px;background:var(--muted);border-radius:50%;transition:0.3s;}
  .toggle-wrap input:checked+.toggle-track{background:var(--pur);border-color:var(--pur);}
  .toggle-wrap input:checked+.toggle-track:before{transform:translateX(23px);background:#fff;}

  .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(5px);z-index:2000;display:flex;align-items:center;justify-content:center;}
  .modal-card{background:#fff;border-radius:18px;padding:34px;max-width:500px;width:92%;animation:modalIn 0.24s ease;max-height:90vh;overflow-y:auto;}

  .chart-bar{display:flex;align-items:flex-end;gap:2px;height:200px;padding:0 2px;}
  .chart-bar-item{flex:1;background:linear-gradient(180deg,var(--pur),var(--pur2));border-radius:3px 3px 0 0;min-height:2px;transition:opacity 0.2s;}
  .chart-bar-item:hover{opacity:0.7;}
`

export default function GlobalStyles() {
  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = DASHBOARD_CSS
    document.head.appendChild(s)
    return () => document.head.removeChild(s)
  }, [])
  return null
}