import { useState, useRef, useEffect, useCallback } from 'react'
import './VoiceRecorder.css'

const INACTIVITY_WARN = 12000
const INACTIVITY_STOP = 18000

function getMime() {
  for (const t of ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'])
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  return ''
}

export default function VoiceRecorder({ onAudioReady, isProcessing, isSpeaking }) {
  const [phase, setPhase] = useState('idle')
  const [seconds, setSeconds] = useState(0)
  const [warn, setWarn] = useState(false)
  const [error, setError] = useState('')
  const [levels, setLevels] = useState(() => new Array(32).fill(4))

  const streamRef = useRef(null)
  const recRef = useRef(null)
  const chunksRef = useRef([])
  const secRef = useRef(null)
  const warnRef = useRef(null)
  const stopRef = useRef(null)
  const analyserRef = useRef(null)
  const animRef = useRef(null)
  const ctxRef = useRef(null)
  const onAudioRef = useRef(onAudioReady)
  onAudioRef.current = onAudioReady
  const prevSpeaking = useRef(isSpeaking)

  const cleanup = useCallback(() => {
    clearInterval(secRef.current)
    clearTimeout(warnRef.current)
    clearTimeout(stopRef.current)
    cancelAnimationFrame(animRef.current)
    if (recRef.current && recRef.current.state !== 'inactive') {
      try { recRef.current.stop() } catch (_) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => {})
      ctxRef.current = null
    }
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  // Auto-start recording after AI finishes speaking
  useEffect(() => {
    if (prevSpeaking.current && !isSpeaking && !isProcessing && phase === 'idle') {
      startRecording()
    }
    prevSpeaking.current = isSpeaking
  }, [isSpeaking, isProcessing, phase])

  // Live waveform visualization
  const animateWave = useCallback(() => {
    if (!analyserRef.current) return
    const buf = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(buf)

    const bars = 32
    const step = Math.floor(buf.length / bars)
    const next = []
    for (let i = 0; i < bars; i++) {
      let sum = 0
      for (let j = 0; j < step; j++) sum += buf[i * step + j]
      const avg = sum / step
      next.push(Math.max(4, (avg / 255) * 48))
    }
    setLevels(next)
    animRef.current = requestAnimationFrame(animateWave)
  }, [])

  const startRecording = async () => {
    setError('')
    setWarn(false)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      // AnalyserNode for visuals only
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') await ctx.resume()
      ctxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.6
      src.connect(analyser)
      analyserRef.current = analyser

      const mime = getMime()
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {})
      recRef.current = rec

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        clearInterval(secRef.current)
        clearTimeout(warnRef.current)
        clearTimeout(stopRef.current)
        cancelAnimationFrame(animRef.current)
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
        chunksRef.current = []
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        if (ctxRef.current && ctxRef.current.state !== 'closed') {
          ctxRef.current.close().catch(() => {})
          ctxRef.current = null
        }
        analyserRef.current = null
        setPhase('idle')
        setSeconds(0)
        setWarn(false)
        setLevels(new Array(32).fill(4))
        if (blob.size > 500) onAudioRef.current(blob)
      }

      rec.start(500)
      setPhase('recording')
      setSeconds(0)
      secRef.current = setInterval(() => setSeconds(s => s + 1), 1000)

      // Inactivity timers
      warnRef.current = setTimeout(() => setWarn(true), INACTIVITY_WARN)
      stopRef.current = setTimeout(() => {
        if (recRef.current && recRef.current.state === 'recording') recRef.current.stop()
      }, INACTIVITY_STOP)

      // Start waveform animation
      animRef.current = requestAnimationFrame(animateWave)

    } catch (e) {
      console.error('Mic error:', e)
      setError('Microphone access denied. Please allow microphone or use text mode.')
    }
  }

  const stopRecording = () => {
    setWarn(false)
    clearTimeout(warnRef.current)
    clearTimeout(stopRef.current)
    if (recRef.current && recRef.current.state === 'recording') {
      setPhase('stopping')
      recRef.current.stop()
    }
  }

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="vr">
      {error && <div className="vr-error">{error}</div>}

      {/* AI Speaking */}
      {isSpeaking && (
        <div className="vr-ai-speaking">
          <div className="vr-ai-wave">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="vr-ai-bar" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
          <span>AI is speaking…</span>
        </div>
      )}

      {/* Processing */}
      {isProcessing && !isSpeaking && (
        <div className="vr-processing">
          <div className="vr-spinner" />
          <span>Processing your response…</span>
        </div>
      )}

      {/* Idle — tap to record */}
      {phase === 'idle' && !isProcessing && !isSpeaking && (
        <button className="vr-activate" onClick={startRecording}>
          <div className="vr-mic-orb">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
          </div>
          <span className="vr-activate-label">Tap to start speaking</span>
          <span className="vr-activate-hint">Tap the button, speak, then tap Done when finished</span>
        </button>
      )}

      {/* Recording */}
      {(phase === 'recording' || phase === 'stopping') && !isProcessing && !isSpeaking && (
        <div className="vr-recording">
          <div className="vr-rec-header">
            <span className="vr-rec-dot" />
            <span className="vr-rec-text">Recording</span>
            <span className="vr-rec-time">{fmt(seconds)}</span>
          </div>

          <div className="vr-waveform">
            {levels.map((h, i) => (
              <div key={i} className="vr-bar" style={{ height: `${h}px` }} />
            ))}
          </div>

          {warn && (
            <p className="vr-warn">Still listening… auto-stopping in a few seconds</p>
          )}

          <button className="vr-done-btn" onClick={stopRecording} disabled={phase === 'stopping'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            {phase === 'stopping' ? 'Finishing…' : 'Done speaking'}
          </button>
        </div>
      )}
    </div>
  )
}
