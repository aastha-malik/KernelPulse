import MultiLineChart from '../components/MultiLineChart'
import TableData from '../components/TableData'

// Mirrors routes.js /network template
export default function Network() {
  return (
    <>
      <MultiLineChart
        heading="Upload Transfer Rate"
        moduleName="upload_transfer_rate"
        refreshRate={1000}
        maxValue={1024}
        minValue={0}
        series={[
          {
            label: 'Upload KB/s',
            color: '0,196,255',
            getValue: (data) => {
              if (Array.isArray(data)) return data.reduce((s, d) => s + (d.tx || d.upload || 0), 0)
              if (typeof data === 'number') return data
              return 0
            }
          }
        ]}
      />
      <MultiLineChart
        heading="Download Transfer Rate"
        moduleName="download_transfer_rate"
        refreshRate={1000}
        maxValue={1024}
        minValue={0}
        series={[
          {
            label: 'Download KB/s',
            color: '0,255,128',
            getValue: (data) => {
              if (Array.isArray(data)) return data.reduce((s, d) => s + (d.rx || d.download || 0), 0)
              if (typeof data === 'number') return data
              return 0
            }
          }
        ]}
      />
      <TableData heading="IP Addresses"       moduleName="ip_addresses"       info="IPs assigned to this server" />
      <TableData heading="Network Connections" moduleName="network_connections" />
      <TableData heading="ARP Cache Table"     moduleName="arp_cache" />
      <TableData heading="Ping Speeds"         moduleName="ping"               info="Ping speed in milliseconds." />
      <TableData heading="Bandwidth"           moduleName="bandwidth" />
    </>
  )
}
