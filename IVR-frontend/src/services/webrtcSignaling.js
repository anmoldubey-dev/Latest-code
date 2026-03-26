/**
 * webrtcSignaling.js
 * ─────────────────────────────────────────────────────────────────────────────
 * DEPRECATED — no longer used by the application.
 *
 * This file was the WebSocket signaling wrapper for the old aiortc-based
 * WebRTC layer (ws://localhost:8000/webrtc/ws/signal).
 *
 * It has been replaced by the LiveKit SDK in useWebRTCCall.js:
 *   • Signaling (SDP/ICE) → handled automatically by livekit-client Room
 *   • Control messages     → LiveKit DataChannel (publishData)
 *   • Token endpoint       → GET /livekit/token  (backend/livekit/ai_worker.py)
 *
 * Kept as reference. Do not import this file in new code.
 */

export const SIGNALING_URL = 'ws://localhost:8000/webrtc/ws/signal';

export class WebRTCSignaling {
  /**
   * @param {string} url  Override the default signaling URL (useful for testing)
   */
  constructor(url = SIGNALING_URL) {
    this._url      = url;
    this._ws       = null;
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
    this._closed   = false;
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  /**
   * Open the WebSocket and wait for the connection to be established.
   * @returns {Promise<void>}  Resolves on open, rejects on error.
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this._closed) {
        reject(new Error('WebRTCSignaling instance has been closed'));
        return;
      }

      const ws = new WebSocket(this._url);
      this._ws = ws;

      ws.onopen = () => resolve();

      ws.onerror = (evt) => {
        reject(new Error(`Signaling WebSocket error: ${evt.type}`));
      };

      ws.onclose = (evt) => {
        this._emit('close', { code: evt.code, reason: evt.reason });
      };

      ws.onmessage = ({ data }) => {
        let msg;
        try {
          msg = JSON.parse(data);
        } catch {
          console.warn('[WebRTCSignaling] non-JSON message ignored:', data);
          return;
        }
        // Dispatch to type-specific handlers AND the wildcard '*' handler
        this._emit(msg.type, msg);
        this._emit('*', msg);
      };
    });
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  /**
   * Send a JSON message to the signaling server.
   * Silently drops the message if the socket is not open.
   * @param {object} msg
   */
  send(msg) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(msg));
    } else {
      console.warn('[WebRTCSignaling] send() called on non-open socket — dropped:', msg.type);
    }
  }

  // ── Event subscription ─────────────────────────────────────────────────────

  /**
   * Register a handler for a message type.
   * Use '*' to receive every message regardless of type.
   * @param {string}   type     Message type (e.g. 'ready', 'answer', '*')
   * @param {Function} handler  Called with the parsed message object
   * @returns {Function}        Unsubscribe function — call to remove the handler
   */
  on(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, new Set());
    }
    this._handlers.get(type).add(handler);

    // Return an unsubscribe function
    return () => {
      this._handlers.get(type)?.delete(handler);
    };
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  /**
   * Close the WebSocket connection and clear all handlers.
   * The instance cannot be reused after this call.
   */
  close() {
    this._closed = true;
    if (this._ws) {
      // Remove callbacks first so the onclose does not double-emit
      this._ws.onclose   = null;
      this._ws.onerror   = null;
      this._ws.onmessage = null;
      if (this._ws.readyState === WebSocket.OPEN ||
          this._ws.readyState === WebSocket.CONNECTING) {
        this._ws.close(1000, 'Client closed');
      }
      this._ws = null;
    }
    this._handlers.clear();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  _emit(type, data) {
    this._handlers.get(type)?.forEach(h => {
      try { h(data); } catch (err) {
        console.error(`[WebRTCSignaling] handler error for type="${type}":`, err);
      }
    });
  }
}
