import { Navigate } from 'react-router-dom'

// El modo demo restaurante redirige a /demorestaurant/mesas
export default function DemoRestaurant() {
  return <Navigate to="/demorestaurant/mesas" replace />
}
