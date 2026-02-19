const API = ''

export async function createSession() {
  const r = await fetch(`${API}/api/checkin/session`, { method: 'POST' })
  if (!r.ok) throw new Error('Failed to create session')
  return r.json()
}

export async function voiceSubmit(audioBlob, sessionId, questionIndex, followUpCount) {
  const form = new FormData()
  form.append('audio', audioBlob, 'recording.webm')
  form.append('session_id', sessionId)
  form.append('question_index', String(questionIndex))
  form.append('follow_up_count', String(followUpCount || 0))

  const r = await fetch(`${API}/api/checkin/voice-submit`, { method: 'POST', body: form })
  if (!r.ok) {
    let detail = 'Voice submission failed'
    try { const body = await r.json(); detail = body.detail || detail }
    catch (_) { detail = await r.text() || detail }
    throw new Error(detail)
  }
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

export async function speakText(text) {
  try {
    const r = await fetch(`${API}/api/checkin/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!r.ok) return null
    const data = await r.json()
    return data.audio || null
  } catch (_) {
    return null
  }
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
