import { Navigate } from 'react-router-dom'

// El modo demo ahora usa las rutas normales con /demo como prefijo
// Este componente redirige /demo a /demo/dashboard
export default function Demo() {
  return <Navigate to="/demo/dashboard" replace />
}
