import { Navigate, useLocation } from 'react-router-dom'

/**
 * EL DEMO DE RESTAURANTE SE MUDÓ a /demo/restaurante.
 *
 * El viejo (/demorestaurant) tenía datos fijos: se podía tocar todo, pero nada
 * quedaba. Se agregaba un plato, decía "agregado" y al cerrar la ventana ya no
 * estaba. El demo por rubro sí guarda lo que el visitante hace.
 *
 * Los enlaces viejos siguen circulando (WhatsApp, respuestas rápidas, la web):
 * llegan a la misma página del demo nuevo y con la misma query, que `?negocio=`
 * trae el nombre del visitante. /demorestaurant a secas abre el salón, como
 * abría el viejo.
 */
export default function DemoRestaurant() {
  const { pathname, search } = useLocation()
  const pagina = pathname.replace(/^\/demorestaurant\/?/, '').replace(/\/+$/, '') || 'mesas'
  return <Navigate to={`/demo/restaurante/${pagina}${search}`} replace />
}
