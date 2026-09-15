/**
 * DÓNDE VA LA ESPERA CON MARCA.
 *
 * Solo en la app y su login: `/app/...` y `/login`. En la landing, los
 * catálogos, los menús, las demos y las demás páginas públicas la marca es de
 * otro (o no hay marca que mostrar), y ahí la espera sigue siendo un spinner
 * neutro.
 *
 * ⚠️ Espejado en index.html (el script del "puente de carga", que corre antes
 * de que exista React): si cambias esto, cambia aquello.
 */
export function esRutaDeLaApp(pathname) {
  const ruta = String(pathname || '').replace(/\/+$/, '') || '/'
  return ruta === '/app' || ruta.startsWith('/app/') || ruta === '/login'
}
