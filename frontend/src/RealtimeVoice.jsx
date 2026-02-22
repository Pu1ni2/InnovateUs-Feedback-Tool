import { useState, useEffect, useRef, useCallback } from 'react'
import { getRealtimeToken, syncVoiceTranscript } from './api'
import './RealtimeVoice.css'

const REALTIME_URL = 'https://api.openai.com/v1/realtime'

export default function RealtimeVoice({
  sessionId,
  questionIndex,
  onUserTranscript,
  onAITranscript,
  onQuestionDone,
  onCheckInComplete,
  onDisconnect,
  onError,
  disabled,
}) {
  const [status, setStatus] = useState('idle')
  const [aiText, setAiText] = useState('')

  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const audioElRef = useRef(null)
  const streamRef = useRef(null)
  const mountedRef = useRef(true)
  const pendingFnArgsRef = useRef({})
  const highestCompletedQRef = useRef(-1)
  const greetingSentRef = useRef(false)

  /* Keep a ref that always points to the latest props/callbacks so the
     data-channel handler (set once) never goes stale. */
  const propsRef = useRef({
    sessionId, questionIndex, onUserTranscript, onAITranscript,
    onQuestionDone, onCheckInComplete, onDisconnect, onError,
  })
  useEffect(() => {
    propsRef.current = {
      sessionId, questionIndex, onUserTranscript, onAITranscript,
      onQuestionDone, onCheckInComplete, onDisconnect, onError,
    }
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      disconnectNow()
    }
  }, [])

  function disconnectNow() {
    if (dcRef.current) {
      try { dcRef.current.close() } catch (_) {}
      dcRef.current = null
    }
    if (pcRef.current) {
      try { pcRef.current.close() } catch (_) {}
      pcRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioElRef.current) {
      audioElRef.current.srcObject = null
    }
  }

  function sendFunctionOutput(callId, output) {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return
    dc.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output },
    }))
    dc.send(JSON.stringify({ type: 'response.create' }))
  }

  /* Stable handler — reads everything through propsRef / dcRef / refs. */
  const handleDataChannelMessage = useCallback((ev) => {
    let event
    try { event = JSON.parse(ev.data) } catch { return }

    const type = event.type
    const p = propsRef.current

    if (type === 'session.created' || type === 'session.updated') {
      if (mountedRef.current) setStatus('ready')
      if (!greetingSentRef.current) {
        greetingSentRef.current = true
        const dc = dcRef.current
        if (dc && dc.readyState === 'open') {
          dc.send(JSON.stringify({ type: 'response.create' }))
        }
      }
      return
    }

    if (type === 'input_audio_buffer.speech_started') {
      if (mountedRef.current) setStatus('user_speaking')
      return
    }

    if (type === 'input_audio_buffer.speech_stopped') {
      if (mountedRef.current) setStatus('processing')
      return
    }

    if (type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = event.transcript || ''
      if (transcript && p.onUserTranscript) {
        p.onUserTranscript(transcript)
        syncVoiceTranscript(p.sessionId, p.questionIndex, transcript, '')
      }
      return
    }

    if (type === 'response.audio_transcript.delta') {
      if (mountedRef.current) {
        setStatus('ai_speaking')
        setAiText(prev => prev + (event.delta || ''))
      }
      return
    }

    if (type === 'response.audio_transcript.done') {
      const fullText = event.transcript || ''
      if (mountedRef.current) setAiText('')
      if (fullText && p.onAITranscript) {
        p.onAITranscript(fullText)
        syncVoiceTranscript(p.sessionId, p.questionIndex, '', fullText)
      }
      return
    }

    if (type === 'response.function_call_arguments.delta') {
      const callId = event.call_id || ''
      if (callId) {
        pendingFnArgsRef.current[callId] =
          (pendingFnArgsRef.current[callId] || '') + (event.delta || '')
      }
      return
    }

    if (type === 'response.function_call_arguments.done') {
      const callId = event.call_id || ''
      const fnName = event.name || ''
      const raw = event.arguments || pendingFnArgsRef.current[callId] || '{}'
      delete pendingFnArgsRef.current[callId]

      let args = {}
      try { args = JSON.parse(raw) } catch { args = {} }

      if (fnName === 'update_progress') {
        const qi = args.question_index ?? -1
        if (qi > highestCompletedQRef.current) highestCompletedQRef.current = qi
        if (p.onQuestionDone) p.onQuestionDone(qi, args.summary || '')
        sendFunctionOutput(callId, JSON.stringify({ ok: true }))
        return
      }

      if (fnName === 'complete_checkin') {
        sendFunctionOutput(callId, JSON.stringify({ ok: true }))
        if (p.onCheckInComplete) p.onCheckInComplete(args.summaries || [])
        setTimeout(() => {
          if (mountedRef.current) {
            setStatus('done')
            disconnectNow()
          }
        }, 3000)
        return
      }

      sendFunctionOutput(callId, JSON.stringify({ ok: true }))
      return
    }

    if (type === 'response.done') {
      if (mountedRef.current) setStatus('ready')
      return
    }

    if (type === 'error') {
      console.error('Realtime API error:', event.error)
      if (p.onError) p.onError(event.error?.message || 'Realtime API error')
    }
  }, [])

  const connect = useCallback(async () => {
    if (status === 'connecting' || status === 'ready' ||
        status === 'user_speaking' || status === 'ai_speaking') return
    setStatus('connecting')
    setAiText('')
    greetingSentRef.current = false

    const p = propsRef.current

    try {
      const { token, model } = await getRealtimeToken(p.sessionId, p.questionIndex)

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      const audioEl = audioElRef.current || document.createElement('audio')
      audioEl.autoplay = true
      audioElRef.current = audioEl

      pc.ontrack = (ev) => { audioEl.srcObject = ev.streams[0] }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      pc.addTrack(stream.getTracks()[0])

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onopen = () => {
        if (mountedRef.current) setStatus('ready')
      }
      dc.onmessage = handleDataChannelMessage

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpResp = await fetch(
        `${REALTIME_URL}?model=${encodeURIComponent(model || 'gpt-4o-mini-realtime-preview')}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        },
      )

      if (!sdpResp.ok) throw new Error(`SDP exchange failed: ${sdpResp.status}`)

      const answerSdp = await sdpResp.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    } catch (err) {
      console.error('Realtime connect error:', err)
      if (p.onError) p.onError(err.message || 'Failed to connect voice')
      disconnectNow()
      if (mountedRef.current) setStatus('idle')
    }
  }, [status, handleDataChannelMessage])

  const handleEndVoice = useCallback(() => {
    const lastQ = highestCompletedQRef.current
    disconnectNow()
    setStatus('idle')
    const p = propsRef.current
    if (p.onDisconnect) p.onDisconnect(lastQ)
  }, [])

  const statusLabel = {
    idle: 'Start voice conversation',
    connecting: 'Connecting…',
    ready: 'Listening — speak anytime',
    user_speaking: 'Hearing you…',
    processing: 'Processing…',
    ai_speaking: 'AI is speaking…',
    done: 'Conversation complete',
  }

  const isActive = ['ready', 'user_speaking', 'processing', 'ai_speaking'].includes(status)

  return (
    <div className={`rv-container rv-${status} ${disabled ? 'rv-disabled' : ''}`}>
      <audio ref={audioElRef} style={{ display: 'none' }} />

      {status === 'idle' && (
        <button className="rv-connect-btn" onClick={connect} disabled={disabled}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          <span>Start Voice Conversation</span>
        </button>
      )}

      {status === 'connecting' && (
        <div className="rv-status-row">
          <div className="rv-spinner" />
          <span>Connecting to AI…</span>
        </div>
      )}

      {isActive && (
        <div className="rv-active-area">
          <div className="rv-viz">
            <div className="rv-orb">
              <div className="rv-orb-core" />
              <div className="rv-orb-ring rv-ring-1" />
              <div className="rv-orb-ring rv-ring-2" />
            </div>
          </div>
          <div className="rv-status-text">{statusLabel[status]}</div>
          {aiText && (
            <div className="rv-live-transcript">{aiText}</div>
          )}
          <button className="rv-end-btn" onClick={handleEndVoice}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            End Voice
          </button>
        </div>
      )}

      {status === 'done' && (
        <div className="rv-status-row rv-done-row">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <span>Voice conversation complete</span>
        </div>
      )}
    </div>
  )
}
