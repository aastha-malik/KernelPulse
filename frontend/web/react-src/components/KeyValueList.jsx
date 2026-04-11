import { useState, useEffect, useCallback } from 'react'
import { useServer } from '../hooks/useServer'
import Plugin from './Plugin'

/**
 * KeyValueList — displays a key-value object as a two-column list.
 * Mirrors key-value-list.directive.js + key-value-list.html.
 *
 * Props:
 *   heading    {string}
 *   moduleName {string}
 *   info       {string}  Optional subtitle
 */
export default function KeyValueList({ heading, moduleName, info }) {
  const { get } = useServer()
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    get(moduleName, (resp) => {
      // Response may be an object or a flat string — normalise to object
      if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
        setData(resp)
      } else if (typeof resp === 'string') {
        setData({ value: resp })
      } else {
        setData({})
      }
      setLoading(false)
    })
  }, [moduleName])

  useEffect(() => { fetchData() }, [fetchData])

  const entries = Object.entries(data)

  return (
    <Plugin heading={heading} info={info} loading={loading} onRefresh={fetchData}>
      {entries.length > 0 ? (
        <table className="table">
          <tbody>
            {entries.map(([key, val]) => (
              <tr key={key}>
                <td className="key-col">{key}</td>
                <td>{String(val ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="no-data">No data available.</p>
      )}
    </Plugin>
  )
}
