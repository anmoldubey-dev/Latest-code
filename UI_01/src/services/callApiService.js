import api from "./api"; 

// 1. Browser Call API (WebRTC Connection)
export const startCall = async (customerName, department, roomName) => {
  try {
    // 🟢 FIX 1: Exact backend path matching main.py
    // Agar api instance mein already '/api' laga hai toh hum safe side check kar lenge
    const endpoint = api.defaults?.baseURL?.endsWith('/api') 
      ? "/webrtc/token" 
      : "/api/webrtc/token";

    // 🟢 FIX 2: LiveKit backend usually needs participant_name
    const response = await api.post(endpoint, {
      participant_name: customerName || "Agent",
      room_name: roomName,
      department: department
    });
    
    return response.data;
  } catch (error) {
    console.error("WebRTC Token Fetch Error:", error);
    throw error;
  }
};

// 2. Phone Call API (PSTN/Telephony - Future Use)
export const initiatePhoneCall = async (payload) => {
  try {
    const endpoint = api.defaults?.baseURL?.endsWith('/api') ? "/calls/" : "/api/calls/";
    const response = await api.post(endpoint, payload);
    return response.data;
  } catch (error) {
    console.error("Phone Call API Error:", error);
    throw error;
  }
};

// 3. End Call API
export const endCall = async (callId) => {
  try {
    if(!callId) return;
    const endpoint = api.defaults?.baseURL?.endsWith('/api') ? `/calls/${callId}/` : `/api/calls/${callId}/`;
    const response = await api.put(endpoint, {
      status: "completed"
    });
    return response.data;
  } catch (error) {
    console.error("Error ending call:", error);
  }
};