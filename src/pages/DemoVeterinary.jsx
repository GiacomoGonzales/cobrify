import { Navigate } from 'react-router-dom'

// El modo demo veterinaria redirige a /demoveterinary/dashboard
export default function DemoVeterinary() {
  return <Navigate to="/demoveterinary/dashboard" replace />
}
