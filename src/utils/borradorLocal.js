/**
 * BORRADORES: lo que se estaba llenando no se pierde al salir de la pantalla.
 *
 * El POS lo hace desde hace tiempo con su propia copia de esta lógica. Cuando
 * alguien pidió lo mismo para Compras —salir por error de una compra de treinta
 * líneas y volver a empezar— la opción era copiarla otra vez. Está acá para que
 * la tercera pantalla que lo necesite no vuelva a escribirla.
 *
 * ── Por qué localStorage y no Firestore ─────────────────────────────────────
 * Un borrador es de ESTE navegador y de ESTE momento. Mandarlo al servidor
 * costaría una escritura por tecla y traería el problema de dos pestañas
 * peleándose por el mismo documento a medio llenar.
 *
 * ── Por qué caduca ───────────────────────────────────────────────────────────
 * Un borrador de la semana pasada ya no es un borrador: es basura que aparece
 * cuando el usuario quería empezar de cero, y peor todavía si trae precios o un
 * proveedor que ya cambiaron. A las 24 horas se descarta solo.
 *
 * NOTA: el POS todavía usa su propia copia. Tiene condiciones que no son de
 * ningún otro lado (no restaurar si venís de una mesa, de una orden, de un
 * folio de hotel o a editar un comprobante), así que se deja como está hasta
 * que haya que tocarlo por otra razón.
 */

/** Cuánto vive un borrador antes de considerarse basura. */
const HORAS_DE_VIDA = 24

/**
 * El borrador guardado, o null.
 *
 * Devuelve null —y limpia— cuando está vencido o ilegible. Un borrador roto
 * nunca debe impedir que la pantalla abra: es una comodidad, no un dato.
 *
 * @param {string} clave
 * @param {object} [opciones]
 * @param {number} [opciones.horas=24]
 */
export function leerBorrador(clave, { horas = HORAS_DE_VIDA } = {}) {
  if (!clave) return null
  try {
    const crudo = localStorage.getItem(clave)
    if (!crudo) return null

    const guardado = JSON.parse(crudo)
    const edad = Date.now() - (guardado?.timestamp || 0)
    if (edad > horas * 60 * 60 * 1000) {
      localStorage.removeItem(clave)
      return null
    }
    return guardado?.datos ?? null
  } catch {
    // Guardado a medias, storage bloqueado o JSON corrupto: se descarta.
    try { localStorage.removeItem(clave) } catch { /* nada que hacer */ }
    return null
  }
}

/**
 * Guarda el borrador con su marca de tiempo.
 *
 * Nunca tira: si el navegador no deja escribir —modo privado, cuota llena— la
 * pantalla tiene que seguir funcionando igual, solo que sin red de seguridad.
 */
export function guardarBorrador(clave, datos) {
  if (!clave) return false
  try {
    localStorage.setItem(clave, JSON.stringify({ timestamp: Date.now(), datos }))
    return true
  } catch {
    return false
  }
}

/** Lo borra. Se llama al guardar de verdad, o al vaciar el formulario. */
export function borrarBorrador(clave) {
  if (!clave) return
  try {
    localStorage.removeItem(clave)
  } catch { /* nada que hacer */ }
}
