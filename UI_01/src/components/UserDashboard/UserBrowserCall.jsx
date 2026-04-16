import React, { useState, useEffect, useRef } from 'react';
// 🟢 FIX: Changed useParticipants to useRemoteParticipants
import { LiveKitRoom, RoomAudioRenderer, useRemoteParticipants, useDataChannel, useRoomContext } from '@livekit/components-react';
import { Phone, PhoneOff, Loader2, UserCheck } from 'lucide-react';
import { DEPARTMENTS } from '../../constants/departments.js';

// ======================== User Browser Call Orchestrator ========================
// UserBrowserCall -> Client-side terminal for browser-based support sessions.
// Manages the user lifecycle from routing initiation to live WebRTC audio streams,
// featuring automated ASR transcription and queue telemetry reception.
// ||
// ||
// ||
// Functions -> UserBrowserCall()-> Main container managing user session state:
// ||           |
// ||           |--- startCall()-> [async Action Trigger]: Executes the routing
// ||           |    handshake and token negotiation with the backend gateway.
// ||           |
// ||           |--- handleEndCall()-> [async Action Trigger]: Cleans up local state
// ||           |    and dispatches cancellation signals to the signaling server.
// ||           |
// ||           |--- QueueTTSReceiver()-> [Sub-process]: Subscribes to backend
// ||           |    audio/text data channels for queue status telemetry.
// ||           |
// ||           |--- CallerTranscriptSender()-> [Sub-process]: Captures and publishes
// ||           |    ASR data segments to the agent console.
// ||           |
// ||           └── CallStatusWatcher()-> [Sub-process]: Monitors the room for agent
// ||                entry to advance the session phase to 'active'.
// ||
// =================================================================================

// ---------------------------------------------------------------
// SECTION: ATOMIC SUB-COMPONENTS (SIGNALING & TRANSCRIPTION)
// ---------------------------------------------------------------

/**
 * Captures caller speech via Web Speech API and sends it to the agent's
 * LiveCallPanel via LiveKit data channel (topic: "transcript").
 */
function CallerTranscriptSender({ enabled }) {
    // Initialization -> CallerTranscriptSender()-> Sub-process for real-time speech-to-text publishing
    const room = useRoomContext();

    useEffect(() => {
        // Sub-process -> ASR Lifecycle: Orchestrates the Web Speech Recognition tunnel
        if (!enabled || !room) return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-IN';

        recognition.onresult = (event) => {
            // Action Trigger -> onresult: Serializes speech segments and dispatches via data channel
            const text = event.results[event.results.length - 1][0].transcript.trim();
            if (!text || !room.localParticipant) return;
            try {
                const payload = new TextEncoder().encode(JSON.stringify({ text }));
                room.localParticipant.publishData(payload, { reliable: true, topic: 'transcript' });
            } catch (e) {
                console.warn('[CallerTranscript] publish failed:', e);
            }
        };

        recognition.onend = () => {
            try { recognition.start(); } catch (_) { }
        };

        try { recognition.start(); } catch (_) { }

        return () => {
            recognition.onend = null;
            recognition.abort();
        };
    }, [enabled, room]);

    return null;
}

/**
 * Receives queue TTS announcements sent by the backend via LiveKit SendData:
 * - topic "tts_queue_audio" → WAV bytes  → decode + play via AudioContext
 * - topic "tts_queue_text"  → JSON text  → speak via Web Speech API (fallback)
 */
function QueueTTSReceiver() {
    // Initialization -> QueueTTSReceiver()-> Sub-process for receiving IVR telemetry signals

    // Audio channel: backend sends Piper-synthesised WAV bytes
    useDataChannel("tts_queue_audio", (msg) => {
        // Action Trigger -> decoding: Ingests binary WAV streams and initializes local playback
        try {
            const wavBlob = new Blob([msg.payload], { type: "audio/wav" });
            const url = URL.createObjectURL(wavBlob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            audio.play().catch(() => {
                URL.revokeObjectURL(url);
            });
        } catch (e) {
            console.warn("[QueueTTS] audio play failed:", e);
        }
    });

    // Text fallback channel: browser speaks it with Web Speech API
    useDataChannel("tts_queue_text", (msg) => {
        // Action Trigger -> synthesis: Processes text segments through the SpeechSynthesis pipeline
        try {
            const { text } = JSON.parse(new TextDecoder().decode(msg.payload));
            if (!text || !window.speechSynthesis) return;
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance(text);
            utt.rate = 0.95;
            utt.volume = 1.0;
            window.speechSynthesis.speak(utt);
        } catch (e) {
            console.warn("[QueueTTS] speech synthesis failed:", e);
        }
    });

    return null;
}

// 🟢 FIX: The Watcher Component now only looks for OTHER people in the room and uses a lock
function CallStatusWatcher({ onAgentJoined }) {
    // Initialization -> CallStatusWatcher()-> Logic Branch for monitoring agent participation
    const remoteParticipants = useRemoteParticipants();
    const hasTriggered = useRef(false);

    useEffect(() => {
        // Logic Branch -> Join Event: Validates remote node presence and locks the session transition
        if (remoteParticipants.length > 0 && !hasTriggered.current) {
            console.log("✅ Agent detected in room! Locking connection.");
            hasTriggered.current = true;
            onAgentJoined();
        }
    }, [remoteParticipants, onAgentJoined]);

    return null;
}

// ---------------------------------------------------------------
// SECTION: MAIN USER-INTERFACE COMPONENT
// ---------------------------------------------------------------

export default function UserBrowserCall({ userName = "Guest User", userEmail = "guest" }) {
    // Initialization -> Contextual state retrieval for session orchestration
    const [callState, setCallState] = useState("idle"); // idle, connecting, waiting, active
    const [connectionDetails, setConnectionDetails] = useState(null);
    const [department, setDepartment] = useState("General");
    const [activeCallId, setActiveCallId] = useState(null);

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    // Action Trigger -> startCall()-> Orchestrates the terminal WebRTC signaling sequence
    const startCall = async () => {
        setCallState("connecting");
        try {
            // 1. Trigger the Routing Engine → ring the right agent(s)
            // Internal Call -> api.post()-> Initializes routing logic on the backend
            const initRes = await fetch(`${API_BASE}/api/webrtc/calls/initiate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caller_name: userName, call_type: 'browser', department, user_email: userEmail }),
            });
            const initData = await initRes.json();
            setActiveCallId(initData.call_id);

            // 2. Fetch a LiveKit token for the User
            // Internal Call -> api.get()-> Requests signed authorization token for room ingress
            const tokenRes = await fetch(`${API_BASE}/api/webrtc/livekit/token?room=${initData.room_name}&identity=user-${Date.now()}&name=${encodeURIComponent(userName)}`);
            const tokenData = await tokenRes.json();

            // 3. Connect to the room and enter "waiting for agent" state
            setConnectionDetails({
                wsUrl: import.meta.env.VITE_LIVEKIT_URL || 'ws://127.0.0.1:7880',
                token: tokenData.token,
                room: initData.room_name,
            });
            setCallState("waiting");
        } catch (err) {
            console.error("Call failed", err);
            setCallState("idle");
            alert("Failed to connect to the call server.");
        }
    };

    // Action Trigger -> handleEndCall()-> Executes session termination and cleans up routing entries
    const handleEndCall = async () => {
        if (callState === "waiting" && activeCallId) {
            try {
                // Internal Call -> api.post()-> Dispatches cancellation signal to terminal nodes
                await fetch(`${API_BASE}/api/webrtc/calls/cancel/${activeCallId}`, { method: 'POST' });
            } catch { /* Fail-silent ensures local UI consistency */ }
        }
        setActiveCallId(null);
        setCallState("idle");
        setConnectionDetails(null);
    };

    // ---------------------------------------------------------------
    // SECTION: PRIMARY RENDER (JSX)
    // ---------------------------------------------------------------

    if ((callState === "waiting" || callState === "active") && connectionDetails) {
        return (
            <div style={{ padding: 20, borderRadius: 12, border: '1px solid #22c55e', background: '#080c10', textAlign: 'center', color: 'white', boxShadow: '0 0 15px rgba(34,197,94,0.1)' }}>
                <LiveKitRoom
                    video={false}
                    audio={true}
                    token={connectionDetails.token}
                    serverUrl={connectionDetails.wsUrl}
                    connect={true}
                    onDisconnected={handleEndCall}
                >
                    <RoomAudioRenderer />
                    <QueueTTSReceiver />
                    <CallerTranscriptSender enabled={callState === "active"} />
                    <CallStatusWatcher onAgentJoined={() => setCallState("active")} />

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>

                        {callState === "waiting" ? (
                            <>
                                <div style={{ background: '#22c55e', padding: 12, borderRadius: '50%', animation: 'pulse 2s infinite' }}>
                                    <Phone size={24} color="white" />
                                </div>
                                <h3 style={{ color: '#22c55e', margin: 0 }}>Call in Progress</h3>
                                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Waiting for an agent to accept...</p>
                            </>
                        ) : (
                            <>
                                <div style={{ background: '#3b82f6', padding: 12, borderRadius: '50%' }}>
                                    <UserCheck size={24} color="white" />
                                </div>
                                <h3 style={{ color: '#3b82f6', margin: 0 }}>Connected to Agent</h3>
                                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Speak now, they can hear you!</p>
                            </>
                        )}

                        <button
                            onClick={handleEndCall}
                            style={{ padding: '10px 20px', background: '#ef4444', color: 'white', borderRadius: 8, border: 'none', marginTop: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
                        >
                            <PhoneOff size={16} /> End Call
                        </button>
                    </div>
                </LiveKitRoom>
                <style>{`@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 70% { box-shadow: 0 0 0 10px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }`}</style>
            </div>
        );
    }

    const selectStyle = {
        width: '100%', background: '#0d1621', border: '1px solid #1e2d3d',
        borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13,
        marginBottom: 14, cursor: 'pointer', outline: 'none',
    };

    return (
        <div style={{ padding: 24, background: '#0e1419', borderRadius: 12, border: '1px solid #1e2d3d', color: 'white' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px' }}>Live Support</h3>
            <p style={{ fontSize: 13, color: '#5a7a9a', marginBottom: 18 }}>Connect instantly with our next available agent.</p>

            <label style={{ fontSize: 10, color: '#5a7a9a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                Department
            </label>
            <select
                value={department}
                onChange={e => setDepartment(e.target.value)}
                disabled={callState === 'connecting'}
                style={selectStyle}
            >
                {DEPARTMENTS.map(d => <option key={d} value={d} style={{ background: '#0d1621' }}>{d}</option>)}
            </select>

            <button
                onClick={startCall}
                disabled={callState === 'connecting'}
                style={{
                    background: callState === 'connecting' ? '#1e2d3d' : '#6366f1',
                    color: callState === 'connecting' ? '#5a7a9a' : 'white',
                    border: 'none', padding: '12px 24px', borderRadius: 8,
                    cursor: callState === 'connecting' ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
            >
                {callState === 'connecting' ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Phone size={18} />}
                {callState === 'connecting' ? 'Connecting...' : 'Call Agent Now'}
            </button>
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
    );
}