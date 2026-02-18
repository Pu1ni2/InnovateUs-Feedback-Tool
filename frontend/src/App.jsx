import { useState, useCallback } from 'react'
import ConsentScreen from './ConsentScreen'
import ModeSelect from './ModeSelect'
import QuestionFlow from './QuestionFlow'
import ThankYou from './ThankYou'
import './App.css'

const STEPS = { consent: 0, mode: 1, questions: 2, done: 3 }

export default function App() {
  const [step, setStep] = useState(STEPS.consent)
  const [mode, setMode] = useState(null)
  const [responses, setResponses] = useState([])

  const onConsent = useCallback(() => setStep(STEPS.mode), [])
  const onModeSelect = useCallback((m) => { setMode(m); setStep(STEPS.questions) }, [])
  const onComplete = useCallback((r) => { setResponses(r); setStep(STEPS.done) }, [])

  return (
    <div className="app-shell">
      {/* Background effects */}
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />
      <div className="bg-grid" />

      <header className="app-header">
        <div className="logo-mark">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="url(#g)" />
            <path d="M10 16l4 4 8-8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#3b82f6"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs>
          </svg>
        </div>
        <h1>InnovateUS <span>Impact Check-In</span></h1>
        <p className="subtitle">Measuring behavior change through AI-powered feedback</p>
      </header>

      <main className="app-content">
        <div className="card-container">
          {step === STEPS.consent && <ConsentScreen onAccept={onConsent} />}
          {step === STEPS.mode && <ModeSelect onSelect={onModeSelect} />}
          {step === STEPS.questions && <QuestionFlow mode={mode} onComplete={onComplete} />}
          {step === STEPS.done && <ThankYou responses={responses} />}
        </div>
      </main>

      <footer className="app-footer">
        <p>Powered by OpenAI &middot; Built for impact measurement</p>
      </footer>
    </div>
  )
}
