import './ThankYou.css'

export default function ThankYou({ responses }) {
  return (
    <div className="glass-card ty-card">
      <div className="ty-hero">
        <div className="ty-check-ring">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <h2>Check-In Complete</h2>
        <p className="ty-sub">Thank you for sharing your experience. Your feedback will help improve future training programs.</p>
      </div>

      <div className="ty-summary">
        <h3>Your Responses</h3>
        {responses.map((r, i) => (
          <div key={i} className="ty-item">
            <span className="ty-q-num">Q{i + 1}</span>
            <div className="ty-q-content">
              <p className="ty-question">{r.question}</p>
              <p className="ty-answer">{r.fullResponse}</p>
              {r.structured && (
                <div className="ty-structured">
                  {r.structured.specificity_level && (
                    <span className={`ty-spec ty-spec-${r.structured.specificity_level}`}>
                      {r.structured.specificity_level} specificity
                    </span>
                  )}
                  {r.structured.quote && (
                    <p className="ty-quote">"{r.structured.quote}"</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
