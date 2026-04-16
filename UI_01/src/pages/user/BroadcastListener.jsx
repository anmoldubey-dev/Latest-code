import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { LiveKitRoom, RoomAudioRenderer, useRemoteParticipants, useRoomContext } from '@livekit/components-react';
import { Radio, Loader2, PlayCircle, LogOut } from 'lucide-react';

// ======================== Broadcast Ingress Node Orchestrator ========================
// BroadcastListener -> Terminal node for consuming live WebRTC media streams. 
// It manages the lifecycle of listener authentication, room signaling via LiveKit, 
// and automated session termination based on host presence telemetry.
// ||
// ||
// ||
// Functions -> BroadcastListener()-> Main functional entry point for the listener UI:
// ||           |
// ||           |--- fetchToken()-> [async Sub-process]: GET /livekit/token -> 
// ||           |    Synchronizes listener identity with the signaling gateway.
// ||           |
// ||           |--- setHasJoined()-> [Action Trigger]: Initiates the WebRTC 
// ||           |    connection sequence and media renderer.
// ||           |
// ||           └── BroadcastRoomWatcher()-> [Sub-module]: Temporal observer node:
// ||                └── useEffect()-> Logic Branch: Tracks host exit events to 
// ||                     trigger automated room disconnection.
// ||
// =====================================================================================

// ---------------------------------------------------------------
// SECTION: ATOMIC MONITORING COMPONENTS
// ---------------------------------------------------------------

/** Detects when the agent joins the LiveKit room. */
function BroadcastRoomWatcher({ onBroadcastEnded }) {
    // Initialization -> BroadcastRoomWatcher()-> Sub-process for monitoring host participation
    const participants = useRemoteParticipants();
    const room = useRoomContext();
    const [speakerSeen, setSpeakerSeen] = useState(false);

    useEffect(() => {
        // Logic Branch -> State Monitoring: Detects host presence and triggers disconnect on exit
        if (participants.length > 0) {
            setSpeakerSeen(true);
        } else if (speakerSeen && participants.length === 0) {
            room.disconnect();
            onBroadcastEnded();
        }
    }, [participants, speakerSeen, room, onBroadcastEnded]);

    return null;
}

// ---------------------------------------------------------------
// SECTION: CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'ws://127.0.0.1:7880';

// ---------------------------------------------------------------
// SECTION: MAIN LISTENER COMPONENT
// ---------------------------------------------------------------

export default function BroadcastListener() {
    // Initialization -> Contextual state retrieval and signaling buffers
    const { id } = useParams();
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [hasJoined, setHasJoined] = useState(false);

    // ---------------------------------------------------------------
    // SECTION: SIGNALING LIFECYCLE
    // ---------------------------------------------------------------

    // Sub-process -> fetchToken()-> Negotiates authorization for the listener node
    useEffect(() => {
        const fetchToken = async () => {
            try {
                const identity = `listener-${Date.now()}`;
                // Internal Call -> api.get(): Requests signed token for the specific broadcast ID
                const res = await fetch(`${API_BASE}/api/webrtc/livekit/token?room=${id}&identity=${identity}&name=Listener`);
                if (!res.ok) throw new Error("Broadcast not found or ended.");
                const data = await res.json();
                setToken(data.token);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchToken();
    }, [id]);

    // ---------------------------------------------------------------
    // SECTION: PRIMARY RENDER (JSX)
    // ---------------------------------------------------------------

    if (loading) {
        return (
            <div style={{ display: 'flex', height: '100vh', background: '#080c10', color: 'white', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
                <Loader2 size={32} className="animate-spin" color="#f97316" />
                <p>Connecting to broadcast...</p>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } .animate-spin { animation: spin 1s linear infinite; }`}</style>
            </div>
        );
    }

    if (error) {
        const isEnded = error.toLowerCase().includes('ended');
        const isLeft = error.toLowerCase().includes('left');
        const isClosed = isEnded || isLeft;
        return (
            <div style={{ display: 'flex', height: '100vh', background: '#080c10', color: 'white', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
                <Radio size={48} color={isClosed ? "#5a7a9a" : "#f87171"} opacity={isClosed ? 0.3 : 0.5} />
                <h2 style={{ margin: 0 }}>{isLeft ? "Disconnected" : isEnded ? "Broadcast Ended" : "Connection Failed"}</h2>
                <p style={{ color: '#5a7a9a', maxWidth: '300px', textAlign: 'center' }}>{isLeft ? "You have securely left the broadcast session." : isEnded ? "The host has ended this broadcast session." : error}</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#080c10', color: 'white', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ width: '400px', background: '#0e1419', border: '1px solid #1e2d3d', borderRadius: '16px', padding: '32px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(249,115,22,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
                    <Radio size={32} color="#f97316" />
                </div>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 8px 0' }}>Live Broadcast</h2>
                <p style={{ color: '#5a7a9a', fontSize: '13px', margin: '0 0 24px 0' }}>You are listening to an active broadcast.</p>

                {!hasJoined ? (
                    <button
                        onClick={() => setHasJoined(true)}
                        style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', color: 'white', border: 'none', padding: '14px 24px', borderRadius: '8px', fontWeight: 'bold', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                        <PlayCircle size={18} /> Join Broadcast
                    </button>
                ) : (
                    <div style={{ padding: '16px', background: 'rgba(34,197,94,0.1)', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#22c55e', fontWeight: 'bold' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
                            Listening Live
                        </div>

                        <LiveKitRoom
                            video={false}
                            audio={false}
                            token={token}
                            serverUrl={LIVEKIT_URL}
                            connect={true}
                            onDisconnected={() => setError("The broadcast has ended.")}
                        >
                            <RoomAudioRenderer />
                            <BroadcastRoomWatcher onBroadcastEnded={() => setError("The broadcast has ended.")} />
                        </LiveKitRoom>

                        <div style={{ marginTop: '20px' }}>
                            <button
                                onClick={() => { setHasJoined(false); setError("You have voluntarily left the broadcast."); }}
                                style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                <LogOut size={16} /> Leave Broadcast
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        </div>
    );
}