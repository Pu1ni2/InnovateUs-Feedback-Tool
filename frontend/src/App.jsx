import { useState, useCallback } from 'react'
import { ContainerScroll } from '@/components/ui/container-scroll-animation'
import ConsentScreen from './ConsentScreen'
import QuestionFlow from './QuestionFlow'
import ThankYou from './ThankYou'
import './App.css'

const STEPS = { consent: 0, questions: 1, done: 2 }

export default function App() {
  const [step, setStep] = useState(STEPS.consent)
  const [responses, setResponses] = useState([])

  const onConsent = useCallback(() => setStep(STEPS.questions), [])
  const onComplete = useCallback((r) => { setResponses(r); setStep(STEPS.done) }, [])
  const onRestart = useCallback(() => { setResponses([]); setStep(STEPS.consent) }, [])

  return (
    <div className="app-root app-scroll">
      <ContainerScroll
        titleComponent={
          <>
            <h1 className="text-4xl font-semibold text-black dark:text-black">
              InnovateUS
              <br />
              <span className="text-4xl md:text-[6rem] font-bold mt-1 leading-none bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
                Impact Check-In
              </span>
            </h1>
            <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
              AI-powered voice & text feedback for behavior change measurement
            </p>
          </>
        }
      >
        <div className="form-screen-container">
          {step === STEPS.consent && (
            <ConsentScreen onAccept={onConsent} />
          )}
          {step === STEPS.questions && (
            <QuestionFlow onComplete={onComplete} />
          )}
          {step === STEPS.done && (
            <ThankYou responses={responses} onRestart={onRestart} />
          )}
        </div>
      </ContainerScroll>
    </div>
  )
}
