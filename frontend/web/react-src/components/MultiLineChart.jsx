import { useEffect, useRef, useCallback } from 'react'
import { SmoothieChart, TimeSeries } from 'smoothie'
import { useServer } from '../hooks/useServer'
import Plugin from './Plugin'

/**
 * MultiLineChart — real-time multi-series smoothie chart.
 * Mirrors multi-line-chart-plugin.directive.js.
 *
 * Props:
 *   heading      {string}
 *   moduleName   {string}
 *   refreshRate  {number}   ms between polls (default 1000)
 *   maxValue     {number}
 *   minValue     {number}
 *   series       {Array}    [{ label, color: 'R,G,B', getValue: (data) => number }]
 */
export default function MultiLineChart({
  heading,
  moduleName,
  refreshRate = 1000,
  maxValue,
  minValue = 0,
  series: seriesDef = []
}) {
  const { get } = useServer()
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRefs = useRef([])
  const intervalRef = useRef(null)

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
      minValue: parseInt(minValue)
    })

    seriesRefs.current = seriesDef.map(def => {
      const ts = new TimeSeries()
      chart.addTimeSeries(ts, {
        strokeStyle: `rgba(${def.color}, 1)`,
        fillStyle: `rgba(${def.color}, 0.2)`,
        lineWidth: 2
      })
      return ts
    })

    chart.streamTo(canvasRef.current, 1000)
    chartRef.current = chart
  }, [maxValue, minValue, seriesDef])

  const poll = useCallback(() => {
    get(moduleName, (data) => {
      const now = Date.now()
      seriesDef.forEach((def, i) => {
        const val = def.getValue(data)
        if (seriesRefs.current[i]) seriesRefs.current[i].append(now, val)
      })
    })
  }, [moduleName, seriesDef])

  useEffect(() => {
    initChart()
    intervalRef.current = setInterval(poll, refreshRate)
    return () => {
      clearInterval(intervalRef.current)
      if (chartRef.current) chartRef.current.stop()
      chartRef.current = null
      seriesRefs.current = []
    }
  }, [initChart, poll, refreshRate])

  return (
    <Plugin heading={heading}>
      <canvas ref={canvasRef} width={400} height={100} style={{ width: '100%' }} />
      {seriesDef.length > 0 && (
        <div className="chart-legend">
          {seriesDef.map((def, i) => (
            <span key={i} className="legend-item">
              <span
                className="legend-dot"
                style={{ background: `rgb(${def.color})` }}
              />
              {def.label}
            </span>
          ))}
        </div>
      )}
    </Plugin>
  )
}
