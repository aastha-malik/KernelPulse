import { useEffect, useState, useRef } from 'react'

const TOAST_DURATION_MS = 6000

function severity(msg) {
  if (msg.includes('🔴') || msg.includes('🚨')) return 'critical'
  if (msg.includes('💧') || msg.includes('⏱️') || msg.includes('⚠️') || msg.includes('⚡')) return 'warning'
  return 'info'
}

/**
 * NotificationToast
 *
 * Props:
 *  messages  : string[]   — alert messages to display (triggers show when non-empty)
 *  onDismiss : () => void — called after the toast hides
 */
export default function NotificationToast({ messages, onDismiss }) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (messages.length === 0) {
      setVisible(false)
      return
    }
    setVisible(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setVisible(false)
      // Wait for CSS fade-out before clearing parent state
      setTimeout(onDismiss, 350)
    }, TOAST_DURATION_MS)
    return () => clearTimeout(timerRef.current)
  }, [messages, onDismiss])

  if (!messages.length) return null

  const shown = messages.slice(0, 3)
  const extra = messages.length - shown.length

  function dismiss() {
    clearTimeout(timerRef.current)
    setVisible(false)
    setTimeout(onDismiss, 350)
  }

  return (
    <div className={`kp-toast-container ${visible ? 'kp-toast-visible' : 'kp-toast-hidden'}`}>
      <div className="kp-toast-header">
        <span className="kp-toast-title">KernelPulse Alert</span>
        <button className="kp-toast-x" onClick={dismiss} aria-label="Dismiss">✕</button>
      </div>

      {shown.map((msg, i) => (
        <div key={i} className={`kp-toast kp-toast-${severity(msg)}`}>
          <span className="kp-toast-msg">{msg}</span>
        </div>
      ))}

      {extra > 0 && (
        <div className="kp-toast kp-toast-info">
          <span className="kp-toast-msg">+{extra} more alert{extra > 1 ? 's' : ''}</span>
        </div>
      )}

      <button className="kp-toast-dismiss" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  )
}
