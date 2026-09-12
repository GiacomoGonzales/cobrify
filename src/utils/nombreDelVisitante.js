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

// El parámetro solo viene en el enlace de entrada: el primer clic en el menú
// ya abre una ruta sin él, y el nombre desaparecía al primer paso. Se recuerda
// por la pestaña (sessionStorage): sobrevive a la navegación y a recargar, y
// no se le pega a otro demo que se abra otro día con otro enlace.
const CLAVE = 'cobrify:demo:negocio'

// Esto se va a pintar en pantalla y en los comprobantes del demo, así que no
// entra cualquier cosa: fuera los caracteres que podrían romper algo y un tope
// de largo, que un nombre de sesenta letras ya no es un nombre.
const limpiar = (v) => String(v || '').replace(/[<>{}$`\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)

/** Lo que venga en `?negocio=` (o lo que vino al entrar), limpio. `null` si no hay nada. */
export function nombreDelVisitante() {
  if (typeof window === 'undefined') return null
  try {
    const enLaUrl = limpiar(new URLSearchParams(window.location.search).get('negocio'))
    if (enLaUrl) {
      try { sessionStorage.setItem(CLAVE, enLaUrl) } catch { /* sin almacenamiento: vale solo la URL */ }
      return enLaUrl
    }
    let recordado = null
    try { recordado = sessionStorage.getItem(CLAVE) } catch { /* sin almacenamiento */ }
    return limpiar(recordado) || null
  } catch {
    return null
  }
}

/**
 * Devuelve los datos del demo con el nombre del visitante encima.
 *
 * Si no hay nombre devuelve EXACTAMENTE lo que recibió —el mismo objeto, no
 * una copia— para no disparar renders de más en los seis demos.
 */
export function conNombreDelVisitante(datos, nombre = nombreDelVisitante()) {
  if (!nombre || !datos?.business) return datos
  return { ...datos, business: { ...datos.business, businessName: nombre, name: nombre } }
}
