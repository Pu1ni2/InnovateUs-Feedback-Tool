import './ConsentScreen.css'

export default function ConsentScreen({ onAccept }) {
  return (
    <div className="glass-card consent-card">
      <div className="consent-icon-wrap">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="24" fill="rgba(59,130,246,0.12)" />
          <path d="M16 24l5 5 11-11" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h2>Welcome to your Check-In</h2>
      <p className="consent-intro">
        This AI-powered check-in measures how training has influenced your behavior.
        It takes about <strong>3–5 minutes</strong>.
      </p>
      <div className="consent-items">
        <div className="consent-item">
          <span className="ci-icon">🔒</span>
          <span>Your responses are <strong>confidential</strong> and aggregated with others.</span>
        </div>
        <div className="consent-item">
          <span className="ci-icon">⏭️</span>
          <span>You can <strong>skip any question</strong> or stop at any time.</span>
        </div>
        <div className="consent-item">
          <span className="ci-icon">🤖</span>
          <span>AI may ask <strong>follow-up questions</strong> to better understand your experience.</span>
        </div>
      </div>
      <button className="btn-primary" onClick={onAccept}>
        I agree — Start Check-In
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  )
}
