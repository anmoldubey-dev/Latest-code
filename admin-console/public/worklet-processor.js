// AudioWorklet processor — captures PCM float32 from microphone
// Used by STT Diagnostics page to stream audio to backend WebSocket

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buf = []
    this._samplesPerChunk = 1600 // 100ms @ 16kHz
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const ch = input[0]
    this._buf.push(...ch)

    while (this._buf.length >= this._samplesPerChunk) {
      const chunk = new Float32Array(this._buf.splice(0, this._samplesPerChunk))
      this.port.postMessage(chunk, [chunk.buffer])
    }

    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
