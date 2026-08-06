/**
 * Shared fetch helpers.
 *
 * Every call is same-origin and relative: nginx (production) and the Vite dev
 * server (development) both proxy /api/* to the backend services.
 */

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parse(response) {
  const text = await response.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { detail: text }
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, body?.detail || body?.message)
  }
  return body
}

/**
 * GET that returns null instead of throwing. Polling panels call this every two
 * seconds; a transient failure should blank one panel, not the dashboard.
 */
export async function apiGet(path) {
  try {
    return await parse(await fetch(path))
  } catch (error) {
    console.error(`GET ${path} failed:`, error)
    return null
  }
}

/** POST that throws ApiError on failure, so callers can surface it. */
export async function apiPost(path, body = {}) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parse(response)
}
