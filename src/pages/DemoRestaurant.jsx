import { Navigate, useLocation } from 'react-router-dom'

// El modo demo restaurante redirige a /demorestaurant/mesas
export default function DemoRestaurant() {
  // La query se arrastra: `?negocio=` trae el nombre del visitante y un
  // redirect que la tira deja el demo diciendo "EMPRESA DEMO SAC".
  const { search } = useLocation()
  return <Navigate to={`/demorestaurant/mesas${search}`} replace />
}
