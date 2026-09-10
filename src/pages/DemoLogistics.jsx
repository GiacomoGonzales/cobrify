import { Navigate, useLocation } from 'react-router-dom'

// El modo demo logística redirige a /demologistics/dashboard
export default function DemoLogistics() {
  // La query se arrastra: `?negocio=` trae el nombre del visitante y un
  // redirect que la tira deja el demo diciendo "EMPRESA DEMO SAC".
  const { search } = useLocation()
  return <Navigate to={`/demologistics/dashboard${search}`} replace />
}
