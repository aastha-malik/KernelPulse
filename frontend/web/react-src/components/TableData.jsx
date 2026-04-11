import { useState, useEffect, useCallback } from 'react'
import { useServer } from '../hooks/useServer'
import Plugin from './Plugin'

/**
 * TableData — sortable, filterable data table.
 * Mirrors table-data.directive.js + table-data.html.
 *
 * Props:
 *   heading    {string}
 *   moduleName {string}  Backend module to fetch
 *   info       {string}  Optional subtitle
 */
export default function TableData({ heading, moduleName, info }) {
  const { get } = useServer()
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortReverse, setSortReverse] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    get(moduleName, (data) => {
      const arr = Array.isArray(data) ? data : (data ? [data] : [])
      if (arr.length > 0) setHeaders(Object.keys(arr[0]))
      setRows(arr)
      setLoading(false)
    })
  }, [moduleName])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSort = (col) => {
    if (col === sortCol) {
      setSortReverse(r => !r)
    } else {
      setSortCol(col)
      setSortReverse(false)
    }
  }

  const filteredRows = rows.filter(row =>
    Object.values(row).some(v =>
      String(v).toLowerCase().includes(filter.toLowerCase())
    )
  )

  const sortedRows = sortCol
    ? [...filteredRows].sort((a, b) => {
        const va = a[sortCol], vb = b[sortCol]
        const cmp = va < vb ? -1 : va > vb ? 1 : 0
        return sortReverse ? -cmp : cmp
      })
    : filteredRows

  return (
    <Plugin heading={heading} info={info} loading={loading} onRefresh={fetchData}>
      {rows.length > 0 ? (
        <>
          <input
            className="filter-box"
            type="text"
            placeholder="filter..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <table className="table">
            <thead>
              <tr>
                {headers.map(h => (
                  <th
                    key={h}
                    onClick={() => handleSort(h)}
                    className={sortCol === h ? (sortReverse ? 'sort-desc' : 'sort-asc') : ''}
                    style={{ cursor: 'pointer' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr key={i}>
                  {headers.map(h => (
                    <td key={h}>{String(row[h] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="no-data">No data available.</p>
      )}
    </Plugin>
  )
}
