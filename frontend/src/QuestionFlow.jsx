import { useState, useEffect, useCallback, useRef } from 'react'
import {
  createSession, voiceSubmit, textSubmit, speakText,
  playBase64Audio, checkCovered,
} from './api'
import VoiceRecorder from './VoiceRecorder'
import './QuestionFlow.css'

const MAX_FOLLOWUPS = 2

export default function QuestionFlow({ mode, onComplete }) {
  const [sessionId, setSessionId] = useState('')
  const [questions, setQuestions] = useState([])
  const [intros, setIntros] = useState([])
  const [qIndex, setQIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState(null)

  const [followUpCount, setFollowUpCount] = useState(0)
  const [textInput, setTextInput] = useState('')
  const [results, setResults] = useState([])
  const [conversation, setConversation] = useState([])

  const chatEndRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conversation])

  /* ── Speak helper (non-blocking TTS) ──────────────── */
  const speak = useCallback(async (text) => {
    if (!mountedRef.current || mode !== 'voice') return
    setSpeaking(true)
    try {
      const audio = await speakText(text)
      if (audio && mountedRef.current) await playBase64Audio(audio)
    } catch (_) {}
    if (mountedRef.current) setSpeaking(false)
  }, [mode])

  /* ── Initialize session ───────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await createSession()
        if (cancelled) return
        setSessionId(data.session_id)
        setQuestions(data.questions)
        setIntros(data.spoken_intros || [])

        const firstIntro = (data.spoken_intros && data.spoken_intros[0]) || data.questions[0]
        setConversation([{ role: 'ai', text: firstIntro }])

        // Text appears immediately; TTS plays in parallel (not blocking)
        if (mode === 'voice') speak(firstIntro)
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const progress = questions.length
    ? ((qIndex + (followUpCount > 0 ? 0.5 : 0)) / questions.length) * 100
    : 0

  /* ── Advance to next question ─────────────────────── */
  const advanceOrFinish = useCallback(async (newResults, coveredFuture = []) => {
    setFollowUpCount(0)
    setTextInput('')

    let nextIdx = qIndex + 1

    // Skip questions marked as covered by the AI
    while (nextIdx < questions.length) {
      const isCovered = coveredFuture.includes(nextIdx) || await checkCovered(sessionId, nextIdx)
      if (!isCovered) break
      setConversation(prev => [...prev, {
        role: 'ai',
        text: `It sounds like you already covered question ${nextIdx + 1}. Skipping ahead.`,
        isSkip: true,
      }])
      nextIdx++
    }

    if (nextIdx >= questions.length) {
      onComplete(newResults)
      return
    }

    const intro = intros[nextIdx] || questions[nextIdx]
    setQIndex(nextIdx)
    setConversation(prev => [...prev, { role: 'ai', text: intro }])
    if (mode === 'voice') speak(intro)
  }, [qIndex, questions, intros, sessionId, onComplete, mode, speak])

  /* ── Process analysis result (shared by voice & text) */
  const handleAnalysis = useCallback(async (result, transcript) => {
    const { status, follow_up, follow_up_audio, transition_text, transition_audio,
            summary, covered_future_indices, structured } = result

    if (transcript) {
      setConversation(prev => [...prev, { role: 'user', text: transcript }])
    }

    if (status === 'needs_follow_up' && follow_up) {
      setFollowUpCount(c => c + 1)
      setConversation(prev => [...prev, { role: 'ai', text: follow_up, isFollowUp: true }])
      setProcessing(false)

      if (follow_up_audio) {
        setSpeaking(true)
        try { await playBase64Audio(follow_up_audio) } catch (_) {}
        if (mountedRef.current) setSpeaking(false)
      } else if (mode === 'voice') {
        await speak(follow_up)
      }
      return
    }

    // done / move_on / already_covered → show transition, extract, advance
    if (transition_text) {
      setConversation(prev => [...prev, { role: 'ai', text: transition_text, isTransition: true }])
    }
    if (transition_audio) {
      setSpeaking(true)
      try { await playBase64Audio(transition_audio) } catch (_) {}
      if (mountedRef.current) setSpeaking(false)
    }

    const newResults = [...results, {
      question: questions[qIndex],
      summary: summary || transcript,
      structured: structured,
    }]
    setResults(newResults)
    setProcessing(false)
    await advanceOrFinish(newResults, covered_future_indices || [])
  }, [results, questions, qIndex, advanceOrFinish, mode, speak])

  /* ── Voice blob handler ───────────────────────────── */
  const handleVoiceBlob = useCallback(async (blob) => {
    setProcessing(true)
    setError(null)
    try {
      const result = await voiceSubmit(blob, sessionId, qIndex, followUpCount)
      if (!result.transcript) {
        setError('Could not understand audio. Please speak clearly and try again.')
        setProcessing(false)
        return
      }
      await handleAnalysis(result, result.transcript)
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      setProcessing(false)
    }
  }, [sessionId, qIndex, followUpCount, handleAnalysis])

  /* ── Text submit handler ──────────────────────────── */
  const handleTextSubmit = useCallback(async () => {
    const text = textInput.trim()
    if (!text) return
    setProcessing(true)
    setError(null)
    setConversation(prev => [...prev, { role: 'user', text }])
    setTextInput('')

    try {
      const result = await textSubmit(sessionId, qIndex, text, followUpCount)
      await handleAnalysis(result, null)
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      setProcessing(false)
    }
  }, [textInput, sessionId, qIndex, followUpCount, handleAnalysis])

  /* ── Render ───────────────────────────────────────── */
  if (loading) {
    return (
      <div className="glass-card qf-loading">
        <div className="qf-spinner" />
        <span>Loading your check-in…</span>
      </div>
    )
  }

  if (error && !questions.length) {
    return <div className="glass-card qf-error-card">{error}</div>
  }

  return (
    <div className="glass-card qf-card">
      <div className="qf-header">
        <div className="qf-progress-row">
          <span className="qf-step-label">Question {qIndex + 1} of {questions.length}</span>
          {followUpCount > 0 && (
            <span className="qf-followup-badge">Follow-up {followUpCount}/{MAX_FOLLOWUPS}</span>
          )}
        </div>
        <div className="qf-progress-track">
          <div className="qf-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="qf-conversation">
        {conversation.map((msg, i) => (
          <div key={i} className={`qf-msg qf-msg-${msg.role} ${msg.isFollowUp ? 'qf-msg-followup' : ''} ${msg.isSkip || msg.isTransition ? 'qf-msg-transition' : ''}`}>
            {msg.role === 'ai' && (
              <div className="qf-msg-avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8V4H8"/><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="6" y="14" width="12" height="8" rx="2"/><path d="M12 10v4"/><path d="M2 10h20"/>
                </svg>
              </div>
            )}
            <div className="qf-msg-bubble">
              {msg.isFollowUp && <span className="qf-fu-tag">Follow-up</span>}
              {(msg.isSkip || msg.isTransition) && <span className="qf-skip-tag">Transition</span>}
              <p>{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {error && <div className="qf-error">{error}</div>}

      <div className="qf-input-area">
        {mode === 'voice' ? (
          <VoiceRecorder
            onAudioReady={handleVoiceBlob}
            isProcessing={processing}
            isSpeaking={speaking}
          />
        ) : (
          <div className="qf-text-input">
            <textarea
              className="qf-textarea"
              placeholder="Type your response…"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit() } }}
              rows={3}
              disabled={processing}
            />
            <button
              className="qf-send-btn"
              onClick={handleTextSubmit}
              disabled={!textInput.trim() || processing}
              title="Send"
            >
              {processing ? (
                <div className="qf-send-spinner" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
