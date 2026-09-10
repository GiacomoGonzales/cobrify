import { Navigate, useParams, useLocation } from 'react-router-dom'
import { esRubroDemo } from '@/data/demo/rubros'

/**
 * Entrada del demo: manda al dashboard.
 *
 * Con rubro (`/demo/ferreteria`) mantiene el rubro en la ruta para que el
 * catálogo y los links del menú sigan siendo los de ese negocio. Un slug que
 * no existe cae al demo genérico en vez de dejar una URL rota circulando.
 */
export default function Demo() {
  const { rubro } = useParams()
  // La query se arrastra: `?negocio=` trae el nombre del visitante.
  const { search } = useLocation()
  const destino = rubro && esRubroDemo(rubro) ? `/demo/${rubro}/dashboard` : '/demo/dashboard'
  return <Navigate to={`${destino}${search}`} replace />
}
