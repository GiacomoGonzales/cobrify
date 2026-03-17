import { Navigate } from 'react-router-dom'

// El modo demo hotel redirige a /demohotel/habitaciones
export default function DemoHotel() {
  return <Navigate to="/demohotel/habitaciones" replace />
}
