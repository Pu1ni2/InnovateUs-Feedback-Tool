import { useState, useRef, useEffect, useCallback } from 'react'
import './VoiceRecorder.css'

const INACTIVITY_MS = 15000

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

export default function VoiceRecorder({ onAudioReady, disabled, isProcessing }) {
  const [state, setState] = useState('idle') // idle | recording | stopping
  const [seconds, setSeconds] = useState(0)
  const [showStillListening, setShowStillListening] = useState(false)
  const [error, setError] = useState('')
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const inactivityRef = useRef(null)
  const secondsRef = useRef(null)

  const cleanup = useCallback(() => {
    clearTimeout(inactivityRef.current)
    clearInterval(secondsRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch (_) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    recorderRef.current = null
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const startRecording = async () => {
    setError('')
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        clearInterval(secondsRef.current)
        clearTimeout(inactivityRef.current)
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        chunksRef.current = []
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setState('idle')
        setSeconds(0)
        setShowStillListening(false)
        if (blob.size > 500) {
          onAudioReady(blob)
        }
      }

      recorder.start(500)
      setState('recording')
      setSeconds(0)

      secondsRef.current = setInterval(() => setSeconds(s => s + 1), 1000)

      inactivityRef.current = setTimeout(() => {
        setShowStillListening(true)
        inactivityRef.current = setTimeout(() => {
          if (recorderRef.current && recorderRef.current.state === 'recording') {
            recorderRef.current.stop()
          }
        }, 5000)
      }, INACTIVITY_MS - 5000)

    } catch (err) {
      setError('Microphone access denied. Please allow microphone access or switch to text mode.')
      setState('idle')
    }
  }

  const stopRecording = () => {
    setShowStillListening(false)
    clearTimeout(inactivityRef.current)
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      setState('stopping')
      recorderRef.current.stop()
    }
  }

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const isActive = state === 'recording'
  const isBusy = disabled || isProcessing || state === 'stopping'

  return (
    <div className="vr-container">
      {error && <div className="vr-error">{error}</div>}

      {state === 'idle' && !isProcessing && (
        <button className="vr-start-btn" onClick={startRecording} disabled={isBusy}>
          <div className="vr-mic-circle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
          </div>
          <span>Tap to start recording</span>
        </button>
      )}

      {isProcessing && (
        <div className="vr-processing">
          <div className="vr-spinner" />
          <span>AI is processing your response…</span>
        </div>
      )}

      {isActive && (
        <div className="vr-active">
          <div className="vr-wave-container">
            <div className="vr-recording-indicator">
              <span className="vr-rec-dot" />
              <span className="vr-rec-label">Recording</span>
              <span className="vr-rec-time">{formatTime(seconds)}</span>
            </div>
            <div className="vr-waveform">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="vr-bar" style={{ animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
          </div>

          {showStillListening && (
            <p className="vr-still-listening">Still listening… auto-stopping in 5s</p>
          )}

          <button className="vr-done-btn" onClick={stopRecording} disabled={state === 'stopping'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            Done speaking
          </button>
        </div>
      )}
    </div>
  )
}
