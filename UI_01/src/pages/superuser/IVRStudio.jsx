import { useNavigate } from "react-router-dom";

export default function IVRStudio() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl">🚧</div>
      <div className="text-center">
        <h1 className="text-2xl font-black text-white mb-2">IVR Studio</h1>
        <p className="text-slate-400 text-sm">This page is under construction. Coming soon.</p>
      </div>
      <button onClick={() => navigate("/superuser/dashboard")} className="px-6 py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30 rounded-xl text-sm font-bold transition-all">
        ← Back to Dashboard
      </button>
    </div>
  );
}