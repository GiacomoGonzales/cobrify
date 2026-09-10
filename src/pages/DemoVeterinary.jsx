import { Navigate, useLocation } from 'react-router-dom'

// El modo demo veterinaria redirige a /demoveterinary/dashboard
export default function DemoVeterinary() {
  // La query se arrastra: `?negocio=` trae el nombre del visitante y un
  // redirect que la tira deja el demo diciendo "EMPRESA DEMO SAC".
  const { search } = useLocation()
  return <Navigate to={`/demoveterinary/dashboard${search}`} replace />
}
