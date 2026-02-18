const API = ''

export async function getQuestions() {
  const r = await fetch(`${API}/api/checkin/questions`)
  if (!r.ok) throw new Error('Failed to load questions')
  return r.json()
}

export async function voiceSubmit(audioBlob, mainQuestion, fullResponseSoFar, followUpCount) {
  const form = new FormData()
  form.append('audio', audioBlob, 'recording.webm')
  form.append('main_question', mainQuestion)
  form.append('full_response_so_far', fullResponseSoFar || '')
  form.append('follow_up_count', String(followUpCount || 0))

  const r = await fetch(`${API}/api/checkin/voice-submit`, { method: 'POST', body: form })
  if (!r.ok) {
    let detail = 'Voice submission failed'
    try {
      const body = await r.json()
      detail = body.detail || detail
    } catch (_) {
      detail = await r.text() || detail
    }
    throw new Error(detail)
  }
  return r.json()
}

export async function textSubmit(mainQuestion, response, fullResponseSoFar, followUpCount) {
  const r = await fetch(`${API}/api/checkin/text-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      main_question: mainQuestion,
      response,
      full_response_so_far: fullResponseSoFar || '',
      follow_up_count: followUpCount || 0,
    }),
  })
  if (!r.ok) {
    let detail = 'Text submission failed'
    try {
      const body = await r.json()
      detail = body.detail || detail
    } catch (_) {
      detail = await r.text() || detail
    }
    throw new Error(detail)
  }
  return r.json()
}

export function playBase64Audio(base64Mp3) {
  return new Promise((resolve, reject) => {
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
