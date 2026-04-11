import { useEffect, useRef, useCallback } from 'react'
import { SmoothieChart, TimeSeries } from 'smoothie'
import { useServer } from '../hooks/useServer'
import Plugin from './Plugin'

/**
 * LineChart — real-time single-series smoothie chart.
 * Mirrors line-chart-plugin.directive.js.
 *
 * Props:
 *   heading          {string}
 *   moduleName       {string}
 *   refreshRate      {number}  ms between polls (default 1000)
 *   maxValue         {number}
 *   minValue         {number}
 *   getDisplayValue  {fn}      (serverData) => number to plot
 *   metrics          {Array}   [{ label, generate: (data) => string }]
 *   color            {string}  RGB tuple e.g. "0,255,0"
 */
export default function LineChart({
  heading,
  moduleName,
  refreshRate = 1000,
  maxValue,
  minValue = 0,
  getDisplayValue,
  metrics = [],
  color = '0,255,0'
}) {
  const { get } = useServer()
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const intervalRef = useRef(null)
  const metricDataRef = useRef(metrics.map(() => ''))

  const initChart = useCallback(() => {
    if (!canvasRef.current || chartRef.current) return

    const chart = new SmoothieChart({
      borderVisible: false,
      sharpLines: true,
      grid: {
        fillStyle: '#ffffff',
        strokeStyle: 'rgba(232,230,230,0.93)',
        sharpLines: true,
        millisPerLine: 3000,
        borderVisible: false
      },
      labels: { fontSize: 11, precision: 0, fillStyle: '#0f0e0e' },
      maxValue: parseInt(maxValue),
      minValue: parseInt(minValue),
      horizontalLines: [{ value: 5, color: '#eff', lineWidth: 1 }]
    })

    const series = new TimeSeries()
    chart.addTimeSeries(series, {
      strokeStyle: `rgba(${color}, 1)`,
      fillStyle: `rgba(${color}, 0.2)`,
      lineWidth: 2
    })
    chart.streamTo(canvasRef.current, 1000)

    chartRef.current = chart
    seriesRef.current = series
  }, [maxValue, minValue, color])

  const poll = useCallback(() => {
    get(moduleName, (data) => {
      if (!seriesRef.current || !chartRef.current) return
      const val = getDisplayValue(data)
      const now = Date.now()
      const max = parseInt(maxValue)

      // Dynamic colour — mirrors line-chart-plugin.directive.js
      const ss = chartRef.current.seriesSet[0]
      if (max / 4 * 3 < val) {
        ss.options.strokeStyle = 'rgba(255,89,0,1)'
        ss.options.fillStyle  = 'rgba(255,89,0,0.2)'
      } else if (max / 3 < val) {
        ss.options.strokeStyle = 'rgba(255,238,0,1)'
        ss.options.fillStyle  = 'rgba(255,238,0,0.2)'
      } else {
        ss.options.strokeStyle = `rgba(${color},1)`
        ss.options.fillStyle  = `rgba(${color},0.2)`
      }

      seriesRef.current.append(now, val)
    })
  }, [moduleName, getDisplayValue, maxValue, color])

  useEffect(() => {
    initChart()
    intervalRef.current = setInterval(poll, refreshRate)
    return () => {
      clearInterval(intervalRef.current)
      if (chartRef.current) chartRef.current.stop()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [initChart, poll, refreshRate])

  return (
    <Plugin heading={heading}>
      <canvas ref={canvasRef} width={400} height={100} style={{ width: '100%' }} />
      {metrics.length > 0 && (
        <table className="metrics-table">
          <tbody>
            {metrics.map((m, i) => (
              <tr key={i}>
                <td>{m.label}</td>
                <td>{metricDataRef.current[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Plugin>
  )
}
