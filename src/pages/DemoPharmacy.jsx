import { Navigate } from 'react-router-dom'

// El modo demo farmacia redirige a /demopharmacy/dashboard
export default function DemoPharmacy() {
  return <Navigate to="/demopharmacy/dashboard" replace />
}
