import './ModeSelect.css'

export default function ModeSelect({ onSelect }) {
  return (
    <div className="glass-card mode-card">
      <h2>Choose your input mode</h2>
      <p className="mode-desc">How would you like to share your feedback?</p>

      <div className="mode-options">
        <button className="mode-option" onClick={() => onSelect('voice')}>
          <div className="mo-icon-wrap mo-voice">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </div>
          <div className="mo-text">
            <span className="mo-title">Voice</span>
            <span className="mo-hint">Speak your answers. AI responds with voice too.</span>
          </div>
          <span className="mo-badge">Recommended</span>
          <svg className="mo-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>

        <button className="mode-option" onClick={() => onSelect('text')}>
          <div className="mo-icon-wrap mo-text-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </div>
          <div className="mo-text">
            <span className="mo-title">Text</span>
            <span className="mo-hint">Type your answers in a text box.</span>
          </div>
          <svg className="mo-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>
  )
}
