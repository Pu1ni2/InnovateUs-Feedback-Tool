import { useState, useEffect, useCallback, useRef } from 'react'
import {
  createSession, textSubmit, checkCovered, playBase64Audio,
} from './api'
import RealtimeVoice from './RealtimeVoice'
import './QuestionFlow.css'

const MAX_FOLLOWUPS = 2

export default function QuestionFlow({ onComplete }) {
  const [sessionId, setSessionId] = useState('')
  const [questions, setQuestions] = useState([])
  const [qIndex, setQIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [followUpCount, setFollowUpCount] = useState(0)
  const [textInput, setTextInput] = useState('')
  const [results, setResults] = useState([])
  const [conversation, setConversation] = useState([])
  const [completedQs, setCompletedQs] = useState(new Set())
  const [voiceActive, setVoiceActive] = useState(false)

  const chatEndRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conversation])

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await createSession()
        if (cancelled) return
        setSessionId(data.session_id)
        setQuestions(data.questions)
        const firstIntro = (data.spoken_intros && data.spoken_intros[0]) || data.questions[0]
        setConversation([{ role: 'ai', text: firstIntro }])
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const progress = questions.length
    ? (Math.max(completedQs.size, qIndex) / questions.length) * 100
    : 0

  const questionsRef = useRef(questions)
  useEffect(() => { questionsRef.current = questions }, [questions])

  /* ── Voice callbacks ─────────────────────────────────── */
  const onUserTranscript = useCallback((text) => {
    setConversation(prev => [...prev, { role: 'user', text }])
  }, [])

  const detectQuestionIndex = useCallback((transcript) => {
    const lower = transcript.toLowerCase()
    const qs = questionsRef.current
    if (!qs.length) return -1
    const markers = [
      ['new approach', 'technique', 'actually tried'],
      ['what happened', 'outcome', 'team responded'],
      ['difficult', 'got in the way', 'competing priorities'],
    ]
    for (let i = markers.length - 1; i >= 0; i--) {
      if (i < qs.length && markers[i].some(m => lower.includes(m))) return i
    }
    return -1
  }, [])

  const onAITranscript = useCallback((text) => {
    setConversation(prev => [...prev, { role: 'ai', text }])
    const detected = detectQuestionIndex(text)
    if (detected >= 0) {
      setQIndex(prev => Math.max(prev, detected))
    }
  }, [detectQuestionIndex])

  const onQuestionDone = useCallback((idx, summary) => {
    setCompletedQs(prev => {
      const next = new Set(prev)
      next.add(idx)
      return next
    })
    setResults(prev => {
      const updated = [...prev]
      const exists = updated.find(r => r.questionIndex === idx)
      if (!exists) {
        updated.push({
          questionIndex: idx,
          question: questionsRef.current[idx] || `Question ${idx + 1}`,
          summary,
        })
      }
      return updated
    })
    setQIndex(idx + 1)
    setFollowUpCount(0)
  }, [])

  const onCheckInComplete = useCallback((summaries) => {
    const qs = questionsRef.current
    const finalResults = (summaries || []).map((s, i) => ({
      questionIndex: i,
      question: qs[i] || `Question ${i + 1}`,
      summary: s,
    }))
    setVoiceActive(false)
    setTimeout(() => onComplete(finalResults.length ? finalResults : results), 1500)
  }, [results, onComplete])

  const onVoiceDisconnect = useCallback((lastCompletedQ) => {
    if (lastCompletedQ >= 0) {
      const maxQ = questionsRef.current.length - 1
      setQIndex(prev => {
        const nextQ = Math.min(lastCompletedQ + 1, maxQ)
        return nextQ > prev ? nextQ : prev
      })
    }
  }, [])

  const onVoiceError = useCallback((msg) => {
    setError(msg)
    setTimeout(() => { if (mountedRef.current) setError(null) }, 5000)
  }, [])

  /* ── Text advance/finish ─────────────────────────────── */
  const advanceOrFinish = useCallback(async (newResults, coveredFuture = []) => {
    setFollowUpCount(0)
    setTextInput('')

    let nextIdx = qIndex + 1
    while (nextIdx < questions.length) {
      const isCovered = coveredFuture.includes(nextIdx) || await checkCovered(sessionId, nextIdx)
      if (!isCovered) break
      setConversation(prev => [...prev, {
        role: 'ai',
        text: `It sounds like you already covered question ${nextIdx + 1}. Skipping ahead.`,
        isSkip: true,
      }])
      setCompletedQs(prev => { const n = new Set(prev); n.add(nextIdx); return n })
      nextIdx++
    }

    if (nextIdx >= questions.length) {
      onComplete(newResults)
      return
    }

    setQIndex(nextIdx)
    setConversation(prev => [...prev, {
      role: 'ai',
      text: questions[nextIdx],
    }])
  }, [qIndex, questions, sessionId, onComplete])

  /* ── Process text analysis ───────────────────────────── */
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
        try { await playBase64Audio(follow_up_audio) } catch (_) {}
      }
      return
    }

    if (transition_text) {
      setConversation(prev => [...prev, { role: 'ai', text: transition_text, isTransition: true }])
    }
    if (transition_audio) {
      try { await playBase64Audio(transition_audio) } catch (_) {}
    }

    setCompletedQs(prev => { const n = new Set(prev); n.add(qIndex); return n })
    const newResults = [...results, {
      questionIndex: qIndex,
      question: questions[qIndex],
      summary: summary || transcript,
      structured,
    }]
    setResults(newResults)
    setProcessing(false)
    await advanceOrFinish(newResults, covered_future_indices || [])
  }, [results, questions, qIndex, advanceOrFinish])

  /* ── Text submit ─────────────────────────────────────── */
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

  /* ── Render ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="qf-shell">
        <div className="qf-loading">
          <div className="qf-spinner" />
          <span>Setting up your check-in…</span>
        </div>
      </div>
    )
  }

  if (error && !questions.length) {
    return (
      <div className="qf-shell">
        <div className="qf-loading qf-error-state">{error}</div>
      </div>
    )
  }

  return (
    <div className="qf-shell">
      {/* ── Top bar ── */}
      <header className="qf-topbar">
        <div className="qf-topbar-left">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="url(#lg)" />
            <path d="M10 16l4 4 8-8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <defs><linearGradient id="lg" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#638cff"/><stop offset="1" stopColor="#a78bfa"/></linearGradient></defs>
          </svg>
          <span className="qf-brand">InnovateUS</span>
        </div>

        <div className="qf-steps">
          {questions.map((_, i) => (
            <div key={i} className={`qf-step ${completedQs.has(i) ? 'done' : i === qIndex ? 'active' : ''}`}>
              <div className="qf-step-dot">
                {completedQs.has(i) ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              {i < questions.length - 1 && <div className="qf-step-line" />}
            </div>
          ))}
        </div>

        <span className="qf-topbar-right">
          {completedQs.size >= questions.length
            ? 'Complete'
            : `${Math.min(qIndex + 1, questions.length)} / ${questions.length}`}
        </span>
      </header>

      {/* ── Progress bar ── */}
      <div className="qf-progress-track">
        <div className="qf-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* ── Chat area ── */}
      <div className="qf-chat">
        {conversation.map((msg, i) => (
          <div key={i} className={`qf-msg ${msg.role} ${msg.isFollowUp ? 'followup' : ''} ${msg.isSkip || msg.isTransition ? 'transition' : ''}`}>
            {msg.role === 'ai' && (
              <div className="qf-avatar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8V4H8"/><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="6" y="14" width="12" height="8" rx="2"/><path d="M12 10v4"/><path d="M2 10h20"/>
                </svg>
              </div>
            )}
            <div className="qf-bubble">
              {msg.isFollowUp && <span className="qf-tag tag-followup">Follow-up</span>}
              {(msg.isSkip || msg.isTransition) && <span className="qf-tag tag-skip">Skipped</span>}
              <p>{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* ── Error toast ── */}
      {error && <div className="qf-toast">{error}</div>}

      {/* ── Bottom input bar ── */}
      <footer className="qf-bottom">
        <div className="qf-bottom-inner">
          <div className="qf-voice-col">
            <RealtimeVoice
              sessionId={sessionId}
              questionIndex={qIndex}
              onUserTranscript={onUserTranscript}
              onAITranscript={onAITranscript}
              onQuestionDone={onQuestionDone}
              onCheckInComplete={onCheckInComplete}
              onDisconnect={onVoiceDisconnect}
              onError={onVoiceError}
              disabled={processing}
            />
          </div>

          <div className="qf-sep" />

          <div className="qf-text-col">
            <textarea
              className="qf-textarea"
              placeholder="Type your response…"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit() } }}
              rows={1}
              disabled={processing}
            />
            <button
              className="qf-send"
              onClick={handleTextSubmit}
              disabled={!textInput.trim() || processing}
              title="Send"
            >
              {processing ? (
                <div className="qf-send-spinner" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
