import './ThankYou.css'

export default function ThankYou({ responses, onRestart }) {
  return (
    <div className="ty-wrapper">
      <div className="ty-hero">
        <div className="ty-check-ring">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <h2>Thank You!</h2>
        <p className="ty-sub">Your feedback helps improve training programs.</p>
      </div>

      <div className="ty-summary">
        <h3>Summary</h3>
        <div className="ty-items">
          {responses.slice(0, 3).map((r, i) => (
            <div key={i} className="ty-item">
              <span className="ty-q-num">{i + 1}</span>
              <div className="ty-q-content">
                <p className="ty-answer">{r.summary || r.fullResponse || 'Response recorded'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button className="ty-restart-btn" onClick={onRestart}>
        Start New Check-In
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
          <path d="M8 16H3v5"/>
        </svg>
      </button>
    </div>
  )
}
