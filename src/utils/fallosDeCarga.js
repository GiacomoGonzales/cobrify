/**
 * CUANDO LA PANTALLA NO CARGA PORQUE FALTA UN ARCHIVO.
 *
 * Las páginas de Cobrify se bajan por separado, a pedido (ver App.jsx: van con
 * `lazy`, y por eso el bundle inicial es chico). Cada archivo lleva un código
 * en el nombre que cambia con cada despliegue: `Reportes-a1b2c3.js`.
 *
 * Ahí está el problema. Cobrify se despliega varias veces al día. Alguien que
 * dejó la pestaña abierta —o que la tiene guardada en el celular— está
 * corriendo el índice de HACE DOS HORAS, que pide `Reportes-a1b2c3.js`; en el
 * servidor ya solo existe `Reportes-x9y8z7.js`. La descarga falla, React se
 * queda sin nada que pintar y la persona ve una pantalla en blanco. Recarga,
 * le baja el índice nuevo y entra. Es exactamente lo que se reportó: "se
 * cuelga y tengo que actualizar un par de veces".
 *
 * No es un error de programación ni algo que se pueda prevenir del todo: es la
 * consecuencia natural de desplegar seguido. Lo que sí se puede es que la
 * recarga la haga el sistema, una sola vez y sin que nadie tenga que
 * adivinarlo.
 *
 * Este archivo es solo la DECISIÓN, sin pantalla: qué error es de descarga y
 * si conviene recargar o ya se intentó. Así se puede probar sin navegador.
 */

/**
 * Cómo se ve este fallo en cada navegador. Son mensajes distintos para la
 * misma cosa, y por eso se comparan en minúsculas y por pedazo:
 *   Chrome/Edge  "Failed to fetch dynamically imported module: https://..."
 *   Firefox      "error loading dynamically imported module"
 *   Safari       "Importing a module script failed."
 *   Vite (CSS)   "Unable to preload CSS for ..."
 */
const SENALES = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
  'chunkloaderror',
  'loading chunk',
]

/** ¿Este error es "no pude bajar el archivo de la pantalla"? */
export function esFalloDeDescarga(error) {
  if (!error) return false
  const texto = [
    typeof error === 'string' ? error : '',
    error?.message,
    error?.name,
    // Vite manda el motivo real adentro, en el evento `vite:preloadError`.
    error?.payload?.message,
    error?.reason?.message,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (!texto) return false
  return SENALES.some((s) => texto.includes(s))
}

/** Dónde se anota que ya se recargó. Va en sessionStorage: si la persona */
/** cierra la pestaña, empieza de cero. */
export const CLAVE_RECARGA = 'cobrify_recarga_por_archivo_faltante'

/** Cuánto tiene que pasar para volver a intentar una recarga automática. */
export const ESPERA_ENTRE_RECARGAS_MS = 30000

/**
 * ¿Recargar ahora, o ya lo intentamos y no sirvió?
 *
 * La guarda es lo importante. Sin ella, un servidor que responde mal deja al
 * navegador recargando en bucle para siempre, que es peor que la pantalla en
 * blanco: no se puede ni leer el error ni cerrar la pestaña con calma.
 *
 * @param {number} ahora        Date.now()
 * @param {string|null} anotado lo guardado en sessionStorage (o null)
 * @returns {{recargar: boolean, motivo: string}}
 */
export function decidirRecarga(ahora, anotado, espera = ESPERA_ENTRE_RECARGAS_MS) {
  const previo = Number(anotado)
  if (!Number.isFinite(previo) || previo <= 0) {
    return { recargar: true, motivo: 'primera vez' }
  }
  // Un reloj que se fue para atrás (cambio de hora, otro dispositivo) no puede
  // dejar la guarda inservible para siempre.
  if (previo > ahora) return { recargar: true, motivo: 'anotacion futura, se ignora' }
  if (ahora - previo >= espera) return { recargar: true, motivo: 'paso el tiempo de espera' }
  return { recargar: false, motivo: 'ya se recargo recien' }
}

/**
 * Mientras alguien está en medio de algo que no se puede cortar (emitir un
 * comprobante: el número ya se gastó y falta mandarlo), la recarga automática
 * hace más daño que el archivo que falta: se pierde la ventana y el
 * comprobante queda sin enviar (reporte de Giacomo, 15-set-2026). Quien toma
 * este turno recibe el error como cualquier otro y decide qué mostrar.
 */
let aplazadas = 0

/** Frena las recargas automáticas; devuelve con qué soltarlas (sirve de limpieza de un efecto). */
export function aplazarRecargas() {
  aplazadas += 1
  let suelto = false
  return () => {
    if (suelto) return
    suelto = true
    aplazadas = Math.max(0, aplazadas - 1)
  }
}

/** ¿Alguien pidió no recargar ahora? */
export const recargasAplazadas = () => aplazadas > 0

/** Dónde se anota que ya se intentó el reinicio duro. También en sessionStorage. */
export const CLAVE_RECARGA_DURA = 'cobrify_reinicio_duro_por_archivo_faltante'

/**
 * QUÉ INTENTAR CUANDO FALTA EL ARCHIVO, EN DOS ESCALONES.
 *
 * Una recarga normal arregla el caso típico: baja el índice nuevo y listo.
 * Pero si el service worker sigue sirviendo SU copia del índice —con
 * `skipWaiting: false` el viejo manda hasta que alguien acepte la versión
 * nueva— la recarga devuelve el mismo índice que pide el mismo archivo que ya
 * no existe. Ahí la guarda de la recarga suave frenaba y se mostraba una
 * pantalla sin salida (reporte de Giacomo, 17-set-2026: "esto sale mucho",
 * después de un día con siete despliegues).
 *
 * Por eso el segundo escalón: soltar el service worker y sus cachés, y
 * recargar. Eso sí escapa del índice viejo. Lleva su propia anotación para no
 * repetirse: borrar las cachés en bucle dejaría a la persona sin modo sin
 * conexión y sin explicación.
 *
 * @returns {{accion: 'suave'|'dura'|'ninguna', motivo: string}}
 */
export function decidirRecuperacion(ahora, anotadoSuave, anotadoDuro, espera = ESPERA_ENTRE_RECARGAS_MS) {
  const suave = decidirRecarga(ahora, anotadoSuave, espera)
  if (suave.recargar) return { accion: 'suave', motivo: suave.motivo }

  // La suave ya se gastó. ¿Se probó también la dura?
  const dura = decidirRecarga(ahora, anotadoDuro, espera)
  if (dura.recargar) return { accion: 'dura', motivo: 'la recarga no alcanzo; suelto el service worker' }

  return { accion: 'ninguna', motivo: 'ya se intentaron las dos, se muestra el error' }
}
