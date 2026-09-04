/**
 * La versión de Cobrify que está corriendo ahora mismo en este navegador.
 *
 * Los tres valores los escribe vite.config.js al compilar, así que cambian con
 * cada push sin que nadie tenga que acordarse de subir un número a mano.
 *
 * Para qué sirve: cuando un cliente reporta algo raro, lo primero es saber qué
 * versión tiene abierta. Un navegador puede quedarse pegado a una compilación
 * vieja en caché, y entonces el problema no está en el sistema sino en su
 * copia. El commit desempata dos despliegues del mismo día.
 */

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
export const COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : ''
export const FECHA_BUILD = typeof __APP_BUILD_DATE__ !== 'undefined' ? __APP_BUILD_DATE__ : ''

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

const fecha = () => {
  if (!FECHA_BUILD) return null
  const d = new Date(FECHA_BUILD)
  return isNaN(d) ? null : d
}

/** Lo que se muestra: "v4.7.0 · 3 set". Corto, para un pie de menú. */
export function versionCorta() {
  const d = fecha()
  return d ? `v${VERSION} · ${d.getDate()} ${MESES[d.getMonth()]}` : `v${VERSION}`
}

/** Lo que sale al pasar el mouse, para soporte: fecha completa y commit. */
export function versionDetallada() {
  const d = fecha()
  const cuando = d
    ? `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : null
  return [`Cobrify v${VERSION}`, cuando && `Actualizado el ${cuando}`, COMMIT && `Build ${COMMIT}`]
    .filter(Boolean)
    .join('\n')
}
