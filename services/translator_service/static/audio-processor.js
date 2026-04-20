/**
 * audio-processor.js — AudioWorklet processor
 * ─────────────────────────────────────────────
 * Runs on a dedicated audio-rendering thread (not the main thread).
 *
 * Responsibilities
 * ────────────────
 * 1. Receive raw PCM samples from the microphone at the browser's native
 *    sample rate (typically 48 000 Hz or 44 100 Hz).
 * 2. Downsample to 16 000 Hz (Whisper's expected rate) via nearest-neighbour.
 * 3. Accumulate samples into 500 ms chunks (8 000 samples @ 16 kHz).
 * 4. Post each chunk as a Float32Array back to the main thread, which
 *    forwards it to the backend WebSocket as a binary frame.
 *
 * This file is loaded via:
 *   await audioCtx.audioWorklet.addModule('/static/audio-processor.js')
 */

class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const opts = (options && options.processorOptions) || {};

    // Native sample rate reported by the AudioContext
    this._inputRate  = opts.sampleRate || sampleRate || 48000;
    this._targetRate = 16000;

    // Downsampling ratio (e.g. 48000/16000 = 3.0)
    this._ratio = this._inputRate / this._targetRate;

    // Internal accumulation buffer (downsampled samples)
    this._buf = [];

    // Emit one chunk every 500 ms of 16 kHz audio
    this._chunkSize = Math.floor(this._targetRate * 0.5); // 8 000 samples
  }

  /**
   * Called by the audio engine for every 128-sample render quantum.
   * Must return `true` to stay alive.
   */
  process(inputs /*, outputs, parameters */) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) return true;

    // Nearest-neighbour downsampling
    const step = this._ratio;
    for (let i = 0; i < channel.length; i += step) {
      this._buf.push(channel[Math.round(i)]);
    }

    // Emit complete chunks to the main thread
    while (this._buf.length >= this._chunkSize) {
      const chunk = this._buf.splice(0, this._chunkSize);
      this.port.postMessage(new Float32Array(chunk));
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
