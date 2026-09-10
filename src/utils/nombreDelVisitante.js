/**
 * EL NOMBRE DEL NEGOCIO DE QUIEN MIRA EL DEMO (`?negocio=`).
 *
 * Un demo que dice "EMPRESA DEMO SAC" se ve como una plantilla. El mismo demo
 * con el nombre de SU restaurante arriba se ve como su sistema, y eso es lo
 * que hace que alguien se quede probando en vez de cerrar la pestaña. El
 * asistente de ventas manda el enlace ya con el nombre puesto.
 *
 * Se hace con un parámetro y NO creando una cuenta a propósito: no hay correo
 * que pedir, ni RUC de un desconocido, ni cuenta que limpiar después, y el
 * visitante entra de un clic en vez de ir a buscar un correo.
 *
 * Vive acá y no dentro de un contexto porque hay SEIS demos, cada uno con su
 * propio contexto y su propio nombre de fábrica. Escrito seis veces, se
 * arreglaría cinco.
 */

/** Lo que venga en `?negocio=`, limpio y recortado. `null` si no hay nada. */
export function nombreDelVisitante() {
  if (typeof window === 'undefined') return null
  try {
    const v = new URLSearchParams(window.location.search).get('negocio')
    if (!v) return null
    // Esto se va a pintar en pantalla y en los comprobantes del demo, así que
    // no entra cualquier cosa: fuera los caracteres que podrían romper algo y
    // un tope de largo, que un nombre de sesenta letras ya no es un nombre.
    const limpio = v.replace(/[<>{}$`\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
    return limpio || null
  } catch {
    return null
  }
}

/**
 * Devuelve los datos del demo con el nombre del visitante encima.
 *
 * Si no viene nombre en la URL devuelve EXACTAMENTE lo que recibió —el mismo
 * objeto, no una copia— para no disparar renders de más en los seis demos.
 */
export function conNombreDelVisitante(datos) {
  const nombre = nombreDelVisitante()
  if (!nombre || !datos?.business) return datos
  return { ...datos, business: { ...datos.business, businessName: nombre, name: nombre } }
}
