/**
 * useAI — polls the KernelPulse ML backend for anomaly insights and alerts.
 *
 * Exposes:
 *  - insights   : full /api/anomaly payload (status, advice, exhaustion, leaks, etc.)
 *  - alerts     : lightweight /api/alerts payload (advice + status map)
 *  - newAlerts  : advice messages that appeared since the last poll (triggers toasts)
 *  - clearNewAlerts : call after the toast has been shown
 *  - ingest(metric, value) : POST to /api/ingest to feed a live metric value
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export function useAI() {
  const [insights,   setInsights]   = useState(null)
  const [alerts,     setAlerts]     = useState({ advice: [], status: {} })
  const [newAlerts,  setNewAlerts]  = useState([])
  const prevAdviceRef               = useRef([])

  // POST metric values to the AI backend for ingestion
  const ingest = useCallback((metric, value) => {
    const v = Number(value)
    if (isNaN(v)) return
    fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric, value: v }),
    }).catch(() => {})
  }, [])

  const clearNewAlerts = useCallback(() => setNewAlerts([]), [])

  useEffect(() => {
    let cancelled = false

    const pollAlerts = async () => {
      try {
        const r = await fetch('/api/alerts')
        if (!r.ok || cancelled) return
        const data = await r.json()
        if (data.error) return

        const curr = data.advice || []
        const prev = prevAdviceRef.current

        // Surface messages that are genuinely new AND are actionable (not "all clear")
        const added = curr.filter(
          a => !prev.includes(a) && !a.startsWith('✅') && !a.startsWith('🟢')
        )
        if (added.length > 0) setNewAlerts(added)
        prevAdviceRef.current = curr

        if (!cancelled) setAlerts(data)
      } catch { /* server not up yet */ }
    }

    const pollInsights = async () => {
      try {
        const r = await fetch('/api/anomaly')
        if (!r.ok || cancelled) return
        const data = await r.json()
        if (data.error || cancelled) return
        setInsights(data)
      } catch { /* server not up yet */ }
    }

    pollAlerts()
    pollInsights()

    const alertTimer   = setInterval(pollAlerts,   5000)
    const insightTimer = setInterval(pollInsights, 15000)

    return () => {
      cancelled = true
      clearInterval(alertTimer)
      clearInterval(insightTimer)
    }
  }, [])

  return { insights, alerts, newAlerts, clearNewAlerts, ingest }
}
