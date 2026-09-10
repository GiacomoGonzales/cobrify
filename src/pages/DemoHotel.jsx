import { Navigate, useLocation } from 'react-router-dom'

// El modo demo hotel redirige a /demohotel/habitaciones
export default function DemoHotel() {
  // La query se arrastra: `?negocio=` trae el nombre del visitante y un
  // redirect que la tira deja el demo diciendo "EMPRESA DEMO SAC".
  const { search } = useLocation()
  return <Navigate to={`/demohotel/habitaciones${search}`} replace />
}
