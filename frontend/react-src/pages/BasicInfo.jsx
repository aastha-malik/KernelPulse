import KeyValueList from '../components/KeyValueList'
import TableData from '../components/TableData'

// Mirrors routes.js /basic-info template
export default function BasicInfo() {
  return (
    <>
      <KeyValueList heading="General Info."     moduleName="general_info"    info="System Information" />
      <KeyValueList heading="Memory Info"       moduleName="memory_info"     info="/proc/meminfo read-out." />
      <KeyValueList heading="CPU Info"          moduleName="cpu_info"        info="/usr/bin/lscpu read-out." />
      <TableData    heading="Scheduled Cron Jobs" moduleName="scheduled_crons" info="Crons for all users on the server." />
      <TableData    heading="Cron Job History"  moduleName="cron_history"    info="Crons which have run recently." />
      <TableData    heading="IO Stats"          moduleName="io_stats"        info="/proc/diskstats read-out." />
    </>
  )
}
