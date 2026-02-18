import { useState, useEffect, useCallback, useRef } from 'react'
import { getQuestions, voiceSubmit, textSubmit, playBase64Audio } from './api'
import VoiceRecorder from './VoiceRecorder'
import './QuestionFlow.css'

const MAX_FOLLOWUPS = 2

export default function QuestionFlow({ mode, onComplete }) {
  const [questions, setQuestions] = useState([])
  const [qIndex, setQIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  // Per-question state
  const [followUpCount, setFollowUpCount] = useState(0)
  const [followUpText, setFollowUpText] = useState('')
  const [fullResponse, setFullResponse] = useState('')
  const [transcript, setTranscript] = useState('')
  const [textInput, setTextInput] = useState('')
  const [results, setResults] = useState([])

  // Conversation log for display
  const [conversation, setConversation] = useState([])

  const chatEndRef = useRef(null)

  useEffect(() => {
    getQuestions()
      .then((q) => { setQuestions(q); setConversation([{ role: 'ai', text: q[0] }]) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  const mainQ = questions[qIndex]
  const isLast = qIndex >= questions.length - 1
  const progress = questions.length ? ((qIndex + (followUpCount > 0 ? 0.5 : 0)) / questions.length) * 100 : 0

  const advanceOrFinish = useCallback((newResults) => {
    setFollowUpCount(0)
    setFollowUpText('')
    setFullResponse('')
    setTranscript('')
    setTextInput('')

    if (isLast) {
      onComplete(newResults)
    } else {
      const nextQ = questions[qIndex + 1]
      setQIndex(i => i + 1)
      setConversation(prev => [...prev, { role: 'ai', text: nextQ }])
    }
  }, [isLast, questions, qIndex, onComplete])

  const handleVoiceBlob = useCallback(async (blob) => {
    if (!mainQ) return
    setProcessing(true)
    setError(null)

    try {
      const result = await voiceSubmit(blob, mainQ, fullResponse, followUpCount)

      if (!result.transcript && !result.done) {
        setError('Could not understand audio. Please speak clearly and try again.')
        setProcessing(false)
        return
      }

      if (result.transcript) {
        setTranscript(result.transcript)
        setConversation(prev => [...prev, { role: 'user', text: result.transcript }])
      }

      const combined = result.combined_response || fullResponse
      setFullResponse(combined)

      if (!result.done && result.is_vague && result.follow_up) {
        setFollowUpText(result.follow_up)
        setFollowUpCount(c => c + 1)
        setConversation(prev => [...prev, { role: 'ai', text: result.follow_up, isFollowUp: true }])

        if (result.follow_up_audio) {
          try { await playBase64Audio(result.follow_up_audio) } catch (_) {}
        }
      } else {
        const newResults = [...results, { question: mainQ, fullResponse: combined, structured: result.structured }]
        setResults(newResults)
        advanceOrFinish(newResults)
      }
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
    } finally {
      setProcessing(false)
    }
  }, [mainQ, fullResponse, followUpCount, results, advanceOrFinish])

  const handleTextSubmit = useCallback(async () => {
    const text = textInput.trim()
    if (!text || !mainQ) return
    setProcessing(true)
    setError(null)
    setConversation(prev => [...prev, { role: 'user', text }])
    setTextInput('')

    try {
      const result = await textSubmit(mainQ, text, fullResponse, followUpCount)
      const combined = result.combined_response || fullResponse
      setFullResponse(combined)

      if (!result.done && result.is_vague && result.follow_up) {
        setFollowUpText(result.follow_up)
        setFollowUpCount(c => c + 1)
        setConversation(prev => [...prev, { role: 'ai', text: result.follow_up, isFollowUp: true }])
      } else {
        const newResults = [...results, { question: mainQ, fullResponse: combined, structured: result.structured }]
        setResults(newResults)
        advanceOrFinish(newResults)
      }
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
    } finally {
      setProcessing(false)
    }
  }, [textInput, mainQ, fullResponse, followUpCount, results, advanceOrFinish])

  if (loading) {
    return (
      <div className="glass-card qf-loading">
        <div className="qf-spinner" />
        <span>Loading your check-in…</span>
      </div>
    )
  }

  if (error && !mainQ) {
    return <div className="glass-card qf-error-card">{error}</div>
  }

  return (
    <div className="glass-card qf-card">
      {/* Progress header */}
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

      {/* Conversation */}
      <div className="qf-conversation">
        {conversation.map((msg, i) => (
          <div key={i} className={`qf-msg qf-msg-${msg.role} ${msg.isFollowUp ? 'qf-msg-followup' : ''}`}>
            {msg.role === 'ai' && (
              <div className="qf-msg-avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8V4H8"/><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="6" y="14" width="12" height="8" rx="2"/><path d="M12 10v4"/><path d="M2 10h20"/>
                </svg>
              </div>
            )}
            <div className="qf-msg-bubble">
              {msg.isFollowUp && <span className="qf-fu-tag">AI Follow-up</span>}
              <p>{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Error */}
      {error && <div className="qf-error">{error}</div>}

      {/* Input area */}
      <div className="qf-input-area">
        {mode === 'voice' ? (
          <VoiceRecorder
            key={`v-${qIndex}-${followUpCount}`}
            onAudioReady={handleVoiceBlob}
            isProcessing={processing}
            disabled={processing}
          />
        ) : (
          <div className="qf-text-input">
            <textarea
              className="qf-textarea"
              placeholder={followUpText ? 'Type your follow-up response…' : 'Type your response…'}
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
