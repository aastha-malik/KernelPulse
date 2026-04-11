import TableData from '../components/TableData'
import KeyValueList from '../components/KeyValueList'

// Mirrors routes.js /apps template
export default function Apps() {
  return (
    <>
      <TableData    heading="Common Applications" moduleName="common_applications" info="List of commonly installed applications." />
      <KeyValueList heading="Memcached"           moduleName="memcached" />
      <KeyValueList heading="Redis"               moduleName="redis" />
      <TableData    heading="PM2"                 moduleName="pm2_stats"           info="Process Manager 2 (PM2) Node Module stats" />
    </>
  )
}
