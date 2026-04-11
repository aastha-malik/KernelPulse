/**
 * AIInsightsCard — shows the AI anomaly detection panel on the dashboard.
 *
 * Displays:
 *  1. Per-metric status badges (NORMAL / WARNING / ANOMALY / LEARNING)
 *  2. Capacity exhaustion forecasts (e.g. "RAM full in 2h 14m")
 *  3. Actionable advice list from the ML engine
 */

const METRIC_LABEL = {
  cpu:        'CPU',
  ram:        'RAM',
  disk_read:  'Disk',
  disk_write: 'Disk Write',
  net_rx:     'Net In',
  net_tx:     'Net Out',
  temp:       'Temp',
  load_avg:   'Load Avg',
}

function statusClass(s) {
  if (s === 'ANOMALY')  return 'ai-badge-anomaly'
  if (s === 'WARNING')  return 'ai-badge-warning'
  if (s === 'LEARNING') return 'ai-badge-learning'
  return 'ai-badge-normal'
}

function adviceClass(msg) {
  if (msg.includes('🔴') || msg.includes('🚨')) return 'ai-advice-critical'
  if (msg.includes('🟡') || msg.includes('💧') || msg.includes('⏱️') ||
      msg.includes('⚠️') || msg.includes('⚡')) return 'ai-advice-warning'
  return 'ai-advice-ok'
}

export default function AIInsightsCard({ insights, alerts }) {
  const status  = insights?.status     || alerts?.status  || {}
  const advice  = insights?.advice     || alerts?.advice  || []
  const exh     = insights?.exhaustion || {}
  const hasData = Object.keys(status).length > 0 || advice.length > 0

  const overallLevel =
    Object.values(status).includes('ANOMALY') ? 'anomaly' :
    Object.values(status).includes('WARNING') ? 'warning' : 'normal'

  const overallLabel =
    overallLevel === 'anomaly' ? 'ANOMALY DETECTED' :
    overallLevel === 'warning' ? 'WARNING' : 'ALL NORMAL'

  return (
    <div className="custom-card card-ai-insights">
      <div className="card-header">
        <span className="card-label">AI INSIGHTS</span>
        <span className={`status-badge ai-overall-${overallLevel}`}>{overallLabel}</span>
      </div>

      {!hasData ? (
        <div className="ai-empty">
          <span className="ai-collecting">
            ⏳ Collecting metric samples — anomaly detection activates after 20 samples per metric.
          </span>
        </div>
      ) : (
        <div className="ai-body">

          {/* ── Metric Status Grid ───────────────────────────────── */}
          {Object.keys(status).length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label">Metric Status</span>
              <div className="ai-status-grid">
                {Object.entries(status).map(([metric, s]) => (
                  <div key={metric} className="ai-metric-item">
                    <span className="ai-metric-name">
                      {METRIC_LABEL[metric] || metric.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className={`ai-badge ${statusClass(s)}`}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Capacity Forecasts ───────────────────────────────── */}
          {Object.keys(exh).length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label">Capacity Forecast</span>
              <div className="ai-forecasts">
                {Object.entries(exh).map(([metric, data]) => (
                  <div key={metric} className="ai-forecast-item">
                    <span className="ai-metric-name">
                      {METRIC_LABEL[metric] || metric}
                    </span>
                    <span className="ai-forecast-val">Full in ~{data.hours_label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recommendations ──────────────────────────────────── */}
          {advice.length > 0 && (
            <div className="ai-section">
              <span className="ai-section-label">Recommendations</span>
              <ul className="ai-advice-list">
                {advice.map((msg, i) => (
                  <li key={i} className={`ai-advice-item ${adviceClass(msg)}`}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
