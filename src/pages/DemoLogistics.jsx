import { Navigate } from 'react-router-dom'

// El modo demo logística redirige a /demologistics/dashboard
export default function DemoLogistics() {
  return <Navigate to="/demologistics/dashboard" replace />
}
