/**
 * NR-TTC: Noise-Robust Turn-Taking Controller
 *
 * Reliable frame-by-frame speech detection using Web Audio API.
 * Primary signal: RMS energy with adaptive noise floor.
 * Secondary: crest factor (click rejection), ZCR (voicing boost).
 * State machine: SILENCE → IN_SPEECH → HANGOVER → SILENCE.
 */

export const STATE = {
  SILENCE: 'SILENCE',
  IN_SPEECH: 'IN_SPEECH',
  HANGOVER: 'HANGOVER',
}

const DEFAULTS = {
  T_start: 0.40,
  T_keep: 0.12,
  T_done: 0.06,
  hangoverMs: 1400,
  minSpeechMs: 500,
  noiseAdapt: 0.97,
  smoothing: 0.72,
  startFrames: 3,
  dropFrames: 8,
  intervalMs: 30,
  calibMs: 500,
}

export class NoiseTurnController {
  constructor(stream, options = {}) {
    this.opts = { ...DEFAULTS, ...options }
    this.state = STATE.SILENCE
    this.gateOpen = false
    this.paused = false

    this.onSpeechStart = options.onSpeechStart || (() => {})
    this.onSpeechEnd = options.onSpeechEnd || (() => {})
    this.onStateChange = options.onStateChange || (() => {})
    this.onLevel = options.onLevel || (() => {})

    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    this.source = this.audioCtx.createMediaStreamSource(stream)

    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.3
    this.source.connect(this.analyser)

    this.timeBuf = new Float32Array(this.analyser.fftSize)

    this.noiseFloor = 0
    this.pSmooth = 0
    this.aboveCount = 0
    this.belowCount = 0
    this.hangTimer = null
    this.speechStart = 0

    this._calibSamples = []
    this._calibrating = true
    this._running = false
    this._iv = null
  }

  async start() {
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume()
    }
    this._running = true
    this.state = STATE.SILENCE
    this.gateOpen = false
    this._calibrating = true
    this._calibSamples = []
    this.pSmooth = 0

    this._iv = setInterval(() => this._tick(), this.opts.intervalMs)

    setTimeout(() => {
      if (this._calibSamples.length > 0) {
        const avg = this._calibSamples.reduce((a, b) => a + b, 0) / this._calibSamples.length
        this.noiseFloor = Math.max(avg, 0.002)
      } else {
        this.noiseFloor = 0.005
      }
      this._calibrating = false
    }, this.opts.calibMs)
  }

  pause()  { this.paused = true }
  resume() { this.paused = false }

  stop() {
    this._running = false
    if (this._iv) { clearInterval(this._iv); this._iv = null }
    this._clearHang()
  }

  destroy() {
    this.stop()
    try { this.source.disconnect() } catch (_) {}
    if (this.audioCtx.state !== 'closed') this.audioCtx.close().catch(() => {})
  }

  _tick() {
    if (!this._running || this.paused) return
    this.analyser.getFloatTimeDomainData(this.timeBuf)

    let sumSq = 0, maxAbs = 0
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = this.timeBuf[i]
      sumSq += v * v
      const a = v < 0 ? -v : v
      if (a > maxAbs) maxAbs = a
    }
    const rms = Math.sqrt(sumSq / this.timeBuf.length)

    if (this._calibrating) {
      this._calibSamples.push(rms)
      this.onLevel(0, this.state)
      return
    }

    // Click rejection: high crest factor = transient spike, not speech
    const crest = maxAbs / (rms + 1e-10)
    const isClick = crest > 12

    // Adapt noise floor during silence
    if (this.state === STATE.SILENCE) {
      this.noiseFloor = this.opts.noiseAdapt * this.noiseFloor
                      + (1 - this.opts.noiseAdapt) * rms
    }

    // Energy ratio above noise floor
    const ratio = rms / (this.noiseFloor + 1e-10)
    let p = Math.min(1, Math.max(0, (ratio - 1.8) / 5))

    // Voicing boost from ZCR (speech has moderate ZCR, noise is high)
    let zcr = 0
    for (let i = 1; i < this.timeBuf.length; i++) {
      if ((this.timeBuf[i] >= 0) !== (this.timeBuf[i - 1] >= 0)) zcr++
    }
    zcr /= (this.timeBuf.length - 1)
    if (zcr < 0.12 && p > 0.05) p = Math.min(1, p + 0.15)

    // Penalize clicks heavily
    if (isClick) p *= 0.2

    // Smooth
    this.pSmooth = this.opts.smoothing * this.pSmooth + (1 - this.opts.smoothing) * p
    this.onLevel(this.pSmooth, this.state)
    this._fsm()
  }

  _fsm() {
    const p = this.pSmooth

    switch (this.state) {
      case STATE.SILENCE:
        if (p > this.opts.T_start) {
          if (++this.aboveCount >= this.opts.startFrames) {
            this._to(STATE.IN_SPEECH)
            this.speechStart = Date.now()
            this.gateOpen = true
            this.onSpeechStart()
          }
        } else {
          this.aboveCount = 0
        }
        break

      case STATE.IN_SPEECH:
        this.aboveCount = 0
        if (p < this.opts.T_keep) {
          if (++this.belowCount >= this.opts.dropFrames) {
            this._to(STATE.HANGOVER)
            this._startHang()
          }
        } else {
          this.belowCount = 0
        }
        break

      case STATE.HANGOVER:
        if (p > this.opts.T_start) {
          this._to(STATE.IN_SPEECH)
          this._clearHang()
          this.belowCount = 0
        }
        break
    }
  }

  _to(s) { this.state = s; this.onStateChange(s) }

  _startHang() {
    this._clearHang()
    let ms = this.opts.hangoverMs
    this.hangTimer = setTimeout(() => {
      if (this.state !== STATE.HANGOVER) return
      if (this.pSmooth < this.opts.T_done) {
        const dur = Date.now() - this.speechStart
        this.gateOpen = false
        this._to(STATE.SILENCE)
        if (dur >= this.opts.minSpeechMs) this.onSpeechEnd()
      } else {
        this._to(STATE.IN_SPEECH)
      }
    }, ms)
  }

  _clearHang() {
    if (this.hangTimer) { clearTimeout(this.hangTimer); this.hangTimer = null }
  }
}
