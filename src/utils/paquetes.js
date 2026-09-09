/**
 * Reglas puras de un paquete de sesiones. Lo que puede decidirse sin tocar la
 * base vive acá, así se prueba solo y `packageService` solo lee y escribe.
 */

/** Estado a partir de lo usado y lo incluido. Un cancelado no revive solo. */
export function estadoDePaquete(paquete, usadas, total) {
  if (paquete?.status === 'cancelled') return 'cancelled'
  return (Number(usadas) || 0) >= (Number(total) || 0) ? 'finished' : 'active'
}

/**
 * Corregir cuántas sesiones incluye un paquete ya creado.
 *
 * El caso (Adara, 9-set-2026): la clínica arma paquetes de 5 o 10, pero el
 * formulario prellenaba las sesiones con las del tratamiento (3) y pisaba lo
 * escrito, y una vez creado el paquete no había forma de corregirlo. Nunca
 * baja de las sesiones ya usadas: eso sería borrar visitas que sí pasaron.
 *
 * @returns {{ sessionsTotal: number, status: string }}
 * @throws {Error} con el texto que se le muestra a quien corrige
 */
export function corregirTotal(paquete, nuevoTotal) {
  const total = parseInt(nuevoTotal)
  const usadas = Number(paquete?.sessionsUsed) || 0
  if (!(total > 0)) throw new Error('Indica cuántas sesiones incluye')
  if (total < usadas) {
    throw new Error(`Ya se usaron ${usadas} ${usadas === 1 ? 'sesión' : 'sesiones'}: el total no puede ser menor`)
  }
  return { sessionsTotal: total, status: estadoDePaquete(paquete, usadas, total) }
}
