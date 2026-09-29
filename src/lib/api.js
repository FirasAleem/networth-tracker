// JSON mutation helper. Resolves to '' on success, or to the server's `error`
// text (400 on invalid input) so callers can show it inline or in an alert().
export async function send(method, url, body) {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    if (res.ok) return ''
    const data = await res.json().catch(() => ({}))
    return data.error || `Request failed (${res.status})`
  } catch {
    return 'Network error — please try again.'
  }
}
