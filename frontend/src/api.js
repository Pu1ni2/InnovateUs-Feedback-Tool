const API = ''

export async function createSession() {
  const r = await fetch(`${API}/api/checkin/session`, { method: 'POST' })
  if (!r.ok) throw new Error('Failed to create session')
  return r.json()
}

export async function textSubmit(sessionId, questionIndex, response, followUpCount) {
  const r = await fetch(`${API}/api/checkin/text-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      question_index: questionIndex,
      response,
      follow_up_count: followUpCount || 0,
    }),
  })
  if (!r.ok) {
    let detail = 'Text submission failed'
    try { const body = await r.json(); detail = body.detail || detail }
    catch (_) { detail = await r.text() || detail }
    throw new Error(detail)
  }
  return r.json()
}

export async function checkCovered(sessionId, questionIndex) {
  try {
    const r = await fetch(`${API}/api/checkin/check-covered/${sessionId}/${questionIndex}`)
    if (!r.ok) return false
    const data = await r.json()
    return data.covered === true
  } catch (_) {
    return false
  }
}

export async function getRealtimeToken(sessionId, questionIndex) {
  const r = await fetch(`${API}/api/realtime/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question_index: questionIndex }),
  })
  if (!r.ok) {
    let detail = 'Failed to get realtime token'
    try { const body = await r.json(); detail = body.detail || detail }
    catch (_) { detail = await r.text() || detail }
    throw new Error(detail)
  }
  return r.json()
}

export async function syncVoiceTranscript(sessionId, questionIndex, userText, aiText) {
  try {
    await fetch(`${API}/api/realtime/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        question_index: questionIndex,
        user_text: userText || '',
        ai_text: aiText || '',
      }),
    })
  } catch (_) {
    /* non-critical */
  }
}

export function playBase64Audio(base64Mp3) {
  return new Promise((resolve) => {
    if (!base64Mp3) return resolve()
    try {
      const audio = new Audio(`data:audio/mp3;base64,${base64Mp3}`)
      audio.onended = resolve
      audio.onerror = () => resolve()
      audio.play().catch(() => resolve())
    } catch (_) {
      resolve()
    }
  })
}
