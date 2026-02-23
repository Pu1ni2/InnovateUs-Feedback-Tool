import './ConsentScreen.css'

export default function ConsentScreen({ onAccept }) {
  return (
    <div className="consent-wrapper">
      <div className="consent-header">
        <div className="consent-icon">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="rgba(99,102,241,0.12)" />
            <path d="M16 24l5 5 11-11" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2>Welcome</h2>
        <p className="consent-subtitle">AI-powered check-in for behavior change</p>
      </div>

      <div className="consent-features">
        <div className="consent-feature">
          <span className="cf-icon">🔒</span>
          <span className="cf-text"><strong>Confidential</strong> responses</span>
        </div>
        <div className="consent-feature">
          <span className="cf-icon">⏭️</span>
          <span className="cf-text"><strong>Skip</strong> any question</span>
        </div>
        <div className="consent-feature">
          <span className="cf-icon">🤖</span>
          <span className="cf-text"><strong>AI follow-ups</strong> for clarity</span>
        </div>
      </div>

      <button className="consent-btn" onClick={onAccept}>
        Start Check-In
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>

      <p className="consent-time">Takes about 3–5 minutes</p>
    </div>
  )
}
