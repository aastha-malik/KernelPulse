/**
 * useServer — WebSocket / HTTP data service
 * Mirrors server.service.js from the AngularJS version.
 *
 * A module-level singleton keeps one shared WebSocket connection
 * regardless of how many components call useServer().
 */

const ws = {
  connection: null,
  handlers: {}
}

let initialized = false

export async function initServer() {
  if (initialized) return
  initialized = true

  if (!window.WebSocket) return

  try {
    const resp = await fetch('/websocket')
    const data = await resp.json()
    if (data && data.websocket_support) {
      connectWebSocket()
    }
  } catch {
    // Server doesn't support WebSocket — fall back to HTTP silently
  }
}

function connectWebSocket() {
  if (ws.connection) return

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${location.hostname}:${location.port}`

  ws.connection = new WebSocket(url)

  ws.connection.onopen = () => {
    console.info('KernelPulse: WebSocket connected')
  }

  ws.connection.onmessage = (event) => {
    try {
      const response = JSON.parse(event.data)
      const handler = ws.handlers[response.moduleName]
      if (handler) handler(parseJson(response.output))
    } catch (e) {
      console.error('KernelPulse: WebSocket parse error', e)
    }
  }

  ws.connection.onclose = () => {
    console.info('KernelPulse: WebSocket closed')
    ws.connection = null
  }
}

/**
 * Some shell modules emit invalid JSON with leading/double/trailing commas,
 * e.g.  {,"key":"val",,}  or  [,{"a":1},,]
 * Apply cleanup in the correct order: collapse multiples first, then
 * strip dangling commas adjacent to braces/brackets.
 */
function parseJson(text) {
  if (typeof text !== 'string') return text
  try {
    return JSON.parse(text)
  } catch {
    try {
      const clean = text
        .replace(/,(\s*,)+/g, ',')   // 1. collapse  ,,  →  ,
        .replace(/\{,/g, '{')        // 2. strip  {,
        .replace(/,\}/g, '}')        // 3. strip  ,}
        .replace(/\[,/g, '[')        // 4. strip  [,
        .replace(/,\]/g, ']')        // 5. strip  ,]
      return JSON.parse(clean)
    } catch {
      console.warn('KernelPulse: unparseable response:', text.slice(0, 80))
      return null
    }
  }
}

export function useServer() {
  const get = (moduleName, callback) => {
    const conn = ws.connection
    if (conn && conn.readyState === WebSocket.OPEN) {
      ws.handlers[moduleName] = callback
      conn.send(moduleName)
    } else {
      fetch(`server/?module=${moduleName}`)
        .then(r => r.text())
        .then(text => {
          const data = parseJson(text)
          if (data !== null && data !== undefined) callback(data)
        })
        .catch(err => console.error(`KernelPulse: HTTP error for "${moduleName}"`, err))
    }
  }

  return { get }
}
