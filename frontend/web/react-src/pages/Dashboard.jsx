import { useState, useEffect, useRef, useCallback } from 'react'
import { useServer } from '../hooks/useServer'
import { useAI } from '../hooks/useAI'
import AIInsightsCard from '../components/AIInsightsCard'
import NotificationToast from '../components/NotificationToast'

function mbToGb(mb) {
  return (mb / 1024).toFixed(1)
}

export default function Dashboard() {
  const { get } = useServer()
  const { insights, alerts, newAlerts, clearNewAlerts, ingest } = useAI()

  const [cpuPercent, setCpuPercent]       = useState(0)
  const [cpuStatus, setCpuStatus]         = useState('STABLE')
  const [memUsed, setMemUsed]             = useState(0)
  const [memTotal, setMemTotal]           = useState(0)
  const [memPercentage, setMemPercentage] = useState(0)
  const [diskPercent, setDiskPercent]     = useState(0)
  const [diskUsedDisplay, setDiskUsedDisplay] = useState('')
  const [netDownload, setNetDownload]     = useState('0 KB')
  const [netUpload, setNetUpload]         = useState('0 KB')
  const [sysHostname, setSysHostname]     = useState('')
  const [sysOs, setSysOs]                 = useState('')
  const [temp, setTemp]                   = useState('--')
  const [tempStatus, setTempStatus]       = useState('OPTIMAL')
  const [loadAvg, setLoadAvg]             = useState(0)
  const [processes, setProcesses]         = useState(0)

  const canvasRef   = useRef(null)
  const cpuHistory  = useRef([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

  // Canvas sparkline
  const drawSparkline = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const vals = cpuHistory.current
    if (vals.length < 2) return

    const step = w / (vals.length - 1)
    ctx.beginPath()

    let x = 0
    let y = h - (vals[0] / 100 * h)
    ctx.moveTo(x, y)

    for (let i = 1; i < vals.length; i++) {
      x += step
      y = h - (vals[i] / 100 * h)
      const prevX = x - step
      const prevY = h - (vals[i - 1] / 100 * h)
      const cpX = prevX + step / 2
      ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y)
    }

    ctx.lineWidth = 3
    ctx.strokeStyle = '#2dd4bf'
    ctx.stroke()

    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.fillStyle = 'rgba(45, 212, 191, 0.1)'
    ctx.fill()
  }, [])

  // Data fetchers — each calls ingest() after processing so the ML backend
  // receives a live value on every poll cycle
  const getCpuData = useCallback(() => {
    get('cpu_utilization', (resp) => {
      const pct = parseInt(resp) || 0
      setCpuPercent(pct)
      setCpuStatus(pct < 50 ? 'STABLE' : pct < 80 ? 'MODERATE' : 'HIGH')
      cpuHistory.current.push(pct)
      if (cpuHistory.current.length > 20) cpuHistory.current.shift()
      drawSparkline()
      ingest('cpu', pct)
    })
  }, [get, drawSparkline, ingest])

  const getMemoryData = useCallback(() => {
    get('current_ram', (resp) => {
      if (!resp) return
      const used = parseFloat(mbToGb(resp.used || 0))
      const total = parseFloat(mbToGb(resp.total || 1))
      const pct = (resp.used / resp.total) * 100 || 0
      setMemUsed(used)
      setMemTotal(total)
      setMemPercentage(pct)
      ingest('ram', pct)
    })
  }, [get, ingest])

  const getDiskData = useCallback(() => {
    get('disk_space', (resp) => {
      if (!Array.isArray(resp) || resp.length === 0) return
      let primary = resp[0]
      for (const partition of resp) {
        const mp = partition.mounted_on || partition.mounted || ''
        if (mp === '/') { primary = partition; break }
      }
      if (primary) {
        const pctStr = primary['used%'] || primary.use_percentage || '0%'
        const pct = parseInt(pctStr) || 0
        setDiskPercent(pct)
        const usedStr  = String(primary.used  || '').replace('G', 'GB').replace('M', 'MB')
        const totalStr = String(primary.size  || '').replace('G', 'GB').replace('M', 'MB')
        setDiskUsedDisplay(`${usedStr} of ${totalStr}`)
        ingest('disk_read', pct)
      }
    })
  }, [get, ingest])

  const getNetworkData = useCallback(() => {
    get('bandwidth', (resp) => {
      if (!Array.isArray(resp)) return
      let totalTx = 0, totalRx = 0
      resp.forEach(iface => {
        const name = (iface.interface || '').replace(':', '')
        if (name !== 'lo') {
          totalTx += iface.tx || 0
          totalRx += iface.rx || 0
        }
      })
      setNetUpload(`${(totalTx / 1024).toFixed(0)} KB`)
      setNetDownload(`${(totalRx / 1024).toFixed(0)} KB`)
      ingest('net_rx', totalRx / 1024)
      ingest('net_tx', totalTx / 1024)
    })
  }, [get, ingest])

  const getIdentityData = useCallback(() => {
    get('general_info', (resp) => {
      if (!resp) return
      setSysHostname(resp.hostname || '')
      setSysOs(resp.os_distribution || resp.os || '')
    })
    get('issue', (resp) => {
      if (resp && typeof resp === 'string') setSysOs(resp)
    })
  }, [get])

  const getBottomMetrics = useCallback(() => {
    get('cpu_temp', (resp) => {
      if (resp && resp !== 'null') {
        const t = parseInt(resp)
        setTemp(`${t}°C`)
        setTempStatus(t < 60 ? 'OPTIMAL' : 'WARM')
        ingest('temp', t)
      }
    })
    get('load_avg', (resp) => {
      if (!resp) return
      let val = 0
      if (typeof resp === 'object' && !Array.isArray(resp)) {
        val = resp['15_min_avg'] ?? resp['5_min_avg'] ?? resp['1_min_avg'] ?? 0
      } else if (Array.isArray(resp)) {
        val = resp[2]?.[0] ?? resp[0]?.[0] ?? resp[2] ?? resp[0] ?? 0
      } else if (typeof resp === 'string') {
        const parts = resp.split(' ')
        val = parts.length > 2 ? parts[2] : parts[0]
      }
      setLoadAvg(val)
      ingest('load_avg', parseFloat(val) || 0)
    })
    get('process_count', (resp) => {
      const count = parseInt(resp)
      if (!isNaN(count) && count > 0) {
        setProcesses(count)
      }
    })
  }, [get, ingest])

  // Mount: first fetch + intervals
  useEffect(() => {
    getCpuData()
    getMemoryData()
    getDiskData()
    getNetworkData()
    getBottomMetrics()
    getIdentityData()

    const fastInterval = setInterval(() => {
      getCpuData()
      getMemoryData()
      getNetworkData()
      getBottomMetrics()
    }, 1500)

    const slowInterval = setInterval(getDiskData, 10000)

    return () => {
      clearInterval(fastInterval)
      clearInterval(slowInterval)
    }
  }, [getCpuData, getMemoryData, getDiskData, getNetworkData, getBottomMetrics, getIdentityData])

  // Redraw sparkline on resize
  useEffect(() => {
    window.addEventListener('resize', drawSparkline)
    return () => window.removeEventListener('resize', drawSparkline)
  }, [drawSparkline])

  return (
    <>
      {/* Floating alert toasts — triggered by new ML alerts */}
      <NotificationToast messages={newAlerts} onDismiss={clearNewAlerts} />

      <div className="custom-dashboard-wrapper">
        <div className="dashboard-header">
          <div className="header-titles">
            <h1>System Overview</h1>
            <p>NODE: {sysHostname.toUpperCase()}</p>
          </div>
          <div className="header-actions" />
        </div>

        <div className="dashboard-grid">
          {/* CPU Card */}
          <div className="custom-card card-cpu">
            <div className="card-header">
              <span className="card-label">CPU LOAD</span>
              <span className={`status-badge ${cpuStatus.toLowerCase()}`}>{cpuStatus}</span>
            </div>
            <div className="card-value-large">
              {cpuPercent}<span className="unit">%</span>
            </div>
            <div className="chart-container">
              <canvas ref={canvasRef} width={600} height={200} />
            </div>
          </div>

          {/* Memory Card */}
          <div className="custom-card card-memory">
            <div className="card-header">
              <span className="card-label">MEMORY</span>
              <span className="icon-violet" />
            </div>
            <div className="card-value">
              {memUsed} <span className="unit-sm">GB</span>
              <span className="card-subtitle"> / {memTotal}GB</span>
            </div>
            <div className="progress-bar-container">
              <div
                className="progress-bar violet-bar"
                style={{ width: `${Math.min(memPercentage, 100)}%` }}
              />
            </div>
          </div>

          {/* Network Card */}
          <div className="custom-card card-network">
            <div className="card-header">
              <span className="card-label">NETWORK ACTIVITY</span>
            </div>
            <div className="net-stats">
              <div className="net-stat">
                <span className="icon-box green">📥</span>
                <div>
                  <span className="net-label">DOWNLOAD</span>
                  <div className="net-val">{netDownload} <span className="unit-sm">MB/s</span></div>
                </div>
              </div>
              <div className="net-stat">
                <span className="icon-box violet">📤</span>
                <div>
                  <span className="net-label">UPLOAD</span>
                  <div className="net-val">{netUpload} <span className="unit-sm">MB/s</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* System Identity */}
          <div className="custom-card card-system">
            <div className="card-header">
              <span className="card-label">SYSTEM IDENTITY</span>
            </div>
            <div className="sys-list">
              <div className="sys-item">
                <span className="sys-key">Hostname</span>
                <span className="sys-val">{sysHostname}</span>
              </div>
              <div className="sys-item">
                <span className="sys-key">OS Distribution</span>
                <span className="sys-val">{sysOs}</span>
              </div>
              <div className="sys-item">
                <span className="sys-key">Kernel Version</span>
                <span className="sys-val teal-text">Detecting...</span>
              </div>
            </div>
          </div>

          {/* Disk Card */}
          <div className="custom-card card-disk">
            <div className="card-header">
              <span className="card-label">DISK (NVME)</span>
              <span className="icon-teal" />
            </div>
            <div className="card-value">
              {diskPercent}<span className="unit">%</span>
            </div>
            <div className="card-subtitle right-align">{diskUsedDisplay}</div>
            <div className="progress-bar-container">
              <div
                className="progress-bar teal-bar"
                style={{ width: `${Math.min(diskPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Temp Card */}
          <div className="custom-card card-small">
            <div className="icon-box red-light">🌡️</div>
            <div className="small-card-content">
              <span className="card-label">PACKAGE TEMP</span>
              <div className="card-value-med">{temp}</div>
            </div>
            <span className={`status-badge ${tempStatus.toLowerCase()}`}>{tempStatus}</span>
          </div>

          {/* Processes Card */}
          <div className="custom-card card-small">
            <div className="icon-box teal-light">🧾</div>
            <div className="small-card-content">
              <span className="card-label">ACTIVE PROCESSES</span>
              <div className="card-value-med">{processes}</div>
            </div>
          </div>

          {/* Load Avg Card */}
          <div className="custom-card card-small">
            <div className="icon-box violet-light">📈</div>
            <div className="small-card-content">
              <span className="card-label">LOAD AVG (15M)</span>
              <div className="card-value-med">{loadAvg}</div>
            </div>
          </div>

          {/* AI Insights Card — full width, below all metric cards */}
          <AIInsightsCard insights={insights} alerts={alerts} />
        </div>
      </div>
    </>
  )
}
