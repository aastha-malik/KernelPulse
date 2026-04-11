import TableData from '../components/TableData'

// Mirrors routes.js /accounts template
export default function Accounts() {
  return (
    <>
      <TableData heading="Accounts"           moduleName="user_accounts"        info="User accounts on this server." />
      <TableData heading="Logged In Accounts" moduleName="logged_in_users"      info="Users currently logged in." />
      <TableData heading="Recent Logins"      moduleName="recent_account_logins" info="Recent user sessions." />
    </>
  )
}
