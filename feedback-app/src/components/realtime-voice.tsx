"use client";

import { useState, useEffect, useRef, useCallback } from 'react'
import { getRealtimeToken, syncVoiceTranscript } from '@/lib/api'
import { Mic, MicOff, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const REALTIME_URL = 'https://api.openai.com/v1/realtime'

interface RealtimeVoiceProps {
  sessionId: string
  questionIndex: number
  onUserTranscript: (text: string) => void
  onAITranscript: (text: string) => void
  onQuestionDone: (idx: number, summary: string) => void
  onCheckInComplete: (summaries: string[]) => void
  onDisconnect: (lastCompletedQ: number) => void
  onError: (msg: string) => void
  disabled?: boolean
}

type VoiceStatus = 'idle' | 'connecting' | 'ready' | 'user_speaking' | 'processing' | 'ai_speaking' | 'done'

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
}: RealtimeVoiceProps) {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [aiText, setAiText] = useState('')

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mountedRef = useRef(true)
  const pendingFnArgsRef = useRef<Record<string, string>>({})
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

  function sendFunctionOutput(callId: string, output: string) {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return
    dc.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output },
    }))
    dc.send(JSON.stringify({ type: 'response.create' }))
  }

  /* Stable handler — reads everything through propsRef / dcRef / refs. */
  const handleDataChannelMessage = useCallback((ev: MessageEvent) => {
    let event: any
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

      let args: any = {}
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

      pc.ontrack = (ev) => { 
        if (audioElRef.current) {
          audioElRef.current.srcObject = ev.streams[0] 
        }
      }

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

    } catch (err: any) {
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

  const statusLabel: Record<VoiceStatus, string> = {
    idle: 'Start voice conversation',
    connecting: 'Connecting...',
    ready: 'Listening — speak anytime',
    user_speaking: 'Hearing you...',
    processing: 'Processing...',
    ai_speaking: 'AI is speaking...',
    done: 'Conversation complete',
  }

  const isActive = ['ready', 'user_speaking', 'processing', 'ai_speaking'].includes(status)

  return (
    <div className={`voice-container voice-${status} ${disabled ? 'voice-disabled' : ''}`}>
      <audio ref={audioElRef} style={{ display: 'none' }} />

      {status === 'idle' && (
        <Button 
          onClick={connect} 
          disabled={disabled}
          variant="outline"
          className="gap-2 border-amber-600 text-amber-700 hover:bg-amber-50"
        >
          <Mic className="w-4 h-4" />
          <span>Start Voice Conversation</span>
        </Button>
      )}

      {status === 'connecting' && (
        <div className="flex items-center gap-2 text-sm text-stone-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Connecting to AI...</span>
        </div>
      )}

      {isActive && (
        <div className="flex flex-col items-center gap-3">
          {/* Voice visualization */}
          <div className="relative">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              status === 'user_speaking' ? 'bg-amber-500' : 
              status === 'ai_speaking' ? 'bg-blue-500' : 'bg-stone-400'
            }`}>
              {status === 'user_speaking' ? (
                <div className="flex items-center gap-0.5">
                  <span className="w-1 h-3 bg-white rounded-full animate-pulse" />
                  <span className="w-1 h-4 bg-white rounded-full animate-pulse delay-75" />
                  <span className="w-1 h-2 bg-white rounded-full animate-pulse delay-150" />
                </div>
              ) : status === 'ai_speaking' ? (
                <Mic className="w-5 h-5 text-white" />
              ) : (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              )}
            </div>
            {/* Orbiting rings */}
            <div className="absolute inset-0 rounded-full border-2 border-amber-400/30 animate-ping" />
          </div>
          
          <div className="text-sm font-medium text-stone-700">{statusLabel[status]}</div>
          
          {aiText && (
            <div className="text-xs text-stone-500 max-w-[200px] truncate">{aiText}</div>
          )}
          
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleEndVoice}
            className="gap-1 text-xs border-red-300 text-red-600 hover:bg-red-50"
          >
            <X className="w-3 h-3" />
            End Voice
          </Button>
        </div>
      )}

      {status === 'done' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <span>Voice conversation complete</span>
        </div>
      )}
    </div>
  )
}
