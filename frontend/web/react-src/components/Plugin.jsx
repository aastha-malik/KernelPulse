import Loader from './Loader'

/**
 * Plugin — clean panel wrapper. No controls, just heading + data.
 */
export default function Plugin({ heading, info, loading, children }) {
  return (
    <div className="plugin">
      <div className="top-bar">
        <h4 className="plugin-title">{heading}</h4>
        {info && <p className="plugin-info">{info}</p>}
      </div>
      <div className="plugin-body">
        {loading ? <Loader /> : children}
      </div>
    </div>
  )
}
