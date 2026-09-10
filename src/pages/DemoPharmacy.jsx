import { Navigate, useLocation } from 'react-router-dom'

// El modo demo farmacia redirige a /demopharmacy/dashboard
export default function DemoPharmacy() {
  // La query se arrastra: `?negocio=` trae el nombre del visitante y un
  // redirect que la tira deja el demo diciendo "EMPRESA DEMO SAC".
  const { search } = useLocation()
  return <Navigate to={`/demopharmacy/dashboard${search}`} replace />
}
