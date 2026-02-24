"use client";

import { useState, useEffect, useRef, useCallback } from 'react'
import { getRealtimeToken, syncVoiceTranscript } from '@/lib/api'
import { Mic, Square, Volume2, Activity, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'

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
  isFullscreen?: boolean
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
  isFullscreen,
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
      // When voice starts, AI should speak the current question
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

      const sdpUrl = `${REALTIME_URL}?model=${encodeURIComponent(model || 'gpt-4o-mini-realtime-preview')}`
      const sdpRequest: RequestInit = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      }

      let sdpResp: Response
      try {
        sdpResp = await fetch(sdpUrl, sdpRequest)
      } catch {
        // One retry helps with transient browser/network handshake failures.
        await new Promise(resolve => setTimeout(resolve, 400))
        sdpResp = await fetch(sdpUrl, sdpRequest)
      }

      if (!sdpResp.ok) throw new Error(`SDP exchange failed: ${sdpResp.status}`)

      const answerSdp = await sdpResp.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    } catch (err: any) {
      console.error('Realtime connect error:', err)
      const msg = err?.message || 'Failed to connect voice'
      if (p.onError) {
        if (msg === 'Failed to fetch') {
          p.onError('Voice connection failed. Check internet/backend, then try Start Voice again.')
        } else {
          p.onError(msg)
        }
      }
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
    <div className={`w-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <audio ref={audioElRef} style={{ display: 'none' }} />

      <AnimatePresence mode="wait">
        {status === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex justify-center"
          >
            <Button 
              onClick={connect} 
              disabled={disabled}
              className="gap-2 py-2.5 px-5 rounded-full shadow-sm transition-all duration-300 border-0"
              style={{ backgroundColor: '#B85C14' }}
            >
              <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
                <Mic className="w-3 h-3 text-white" />
              </div>
              <span className="text-white font-medium text-sm tracking-wide">Start Voice Conversation</span>
            </Button>
          </motion.div>
        )}

        {status === 'connecting' && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center justify-center gap-2 py-4"
          >
            <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
            <span className="text-sm font-medium text-stone-600">Connecting...</span>
          </motion.div>
        )}

        {isActive && (
          <motion.div
            key="active"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center gap-4 py-4"
          >
            {/* Waveform Visualization - like the reference image */}
            <div className="flex items-center justify-center h-16 gap-[2px]">
              {status === 'user_speaking' ? (
                // Animated waveform when user is speaking
                <>
                  {[...Array(40)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-[3px] bg-amber-600 rounded-full"
                      animate={{
                        height: [8, Math.random() * 40 + 15, 8],
                      }}
                      transition={{
                        duration: 0.4 + Math.random() * 0.3,
                        repeat: Infinity,
                        delay: i * 0.02,
                      }}
                    />
                  ))}
                </>
              ) : status === 'ai_speaking' ? (
                // Gentler animation when AI is speaking
                <>
                  {[...Array(40)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-[3px] bg-amber-500 rounded-full"
                      animate={{
                        height: [8, Math.random() * 30 + 10, 8],
                      }}
                      transition={{
                        duration: 0.5 + Math.random() * 0.3,
                        repeat: Infinity,
                        delay: i * 0.03,
                      }}
                    />
                  ))}
                </>
              ) : (
                // Static bars when processing
                <>
                  {[...Array(40)].map((_, i) => (
                    <div
                      key={i}
                      className="w-[3px] bg-stone-300 rounded-full"
                      style={{ height: `${8 + Math.sin(i * 0.3) * 6 + 6}px` }}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Status text */}
            <p className="text-sm text-stone-600 font-medium">
              {status === 'user_speaking' ? 'Listening...' :
               status === 'ai_speaking' ? 'AI is speaking' :
               'Processing...'}
            </p>
            
            {/* Red Stop Button - matching reference image */}
            <Button 
              onClick={handleEndVoice}
              className="w-full max-w-sm gap-3 py-3 px-5 rounded-full shadow-sm transition-all border-0 hover:opacity-90"
              style={{ backgroundColor: '#D32F2F' }}
            >
              <div className="w-5 h-5 rounded bg-white flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#D32F2F' }} />
              </div>
              <span className="text-white font-medium text-base tracking-wide">Stop Voice Recording</span>
            </Button>

            {/* Privacy notice */}
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <Lock className="w-3 h-3" />
              <span>Your voice is private</span>
            </div>
            
            {/* Live Transcript */}
            <AnimatePresence>
              {aiText && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="w-full max-w-md"
                >
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-200">
                    <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">AI Response</p>
                    <p className="text-stone-700 text-sm leading-relaxed">{aiText}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {status === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-2 py-4 text-green-600"
          >
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <span className="font-medium">Voice conversation complete</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
