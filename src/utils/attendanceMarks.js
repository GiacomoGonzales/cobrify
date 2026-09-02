/**
 * LAS MARCAS DE ASISTENCIA y el resumen del día.
 *
 * Vive acá y no dentro de la página porque el mismo cálculo lo usan la tarjeta
 * "Hoy" del trabajador, la lista de marcaciones del administrador y la
 * exportación. Cuando estaba adentro de Attendance.jsx no había forma de
 * probarlo ni de reusarlo.
 *
 * EL BREAK (opcional, se prende en Asistencia > Configuración). Un trabajador
 * marca entrada a las 9, break a las 14, vuelve 45 minutos después y marca
 * break otra vez para seguir trabajando. Son dos marcas más —`break_start` y
 * `break_end`— con la misma forma que las de siempre, así que la lista, la
 * aprobación y la exportación no se enteran: solo necesitan la etiqueta.
 *
 * El tiempo del break se DESCUENTA del total trabajado, que es para lo que se
 * mide. En un negocio que no usa breaks la resta es cero y el número queda
 * igual que siempre.
 */

export const MARCA_ENTRADA = 'in'
export const MARCA_SALIDA = 'out'
export const MARCA_BREAK_INICIO = 'break_start'
export const MARCA_BREAK_FIN = 'break_end'

const ETIQUETAS = {
  [MARCA_ENTRADA]: 'Entrada',
  [MARCA_SALIDA]: 'Salida',
  [MARCA_BREAK_INICIO]: 'Inicio de break',
  [MARCA_BREAK_FIN]: 'Fin de break',
}

/** El nombre de una marca, para mostrar. */
export const etiquetaDeMarca = (type) => ETIQUETAS[type] || 'Marcación'

/** ¿Esta marca es de break? */
export const esMarcaDeBreak = (type) => type === MARCA_BREAK_INICIO || type === MARCA_BREAK_FIN

/**
 * Qué marca corresponde ahora, según la última que hizo el trabajador.
 *
 * @param {string|null} ultimaHoy  tipo de la última marca de HOY (null si no fichó)
 * @param {boolean} quiereBreak    pulsó el botón de break en vez del principal
 * @returns {string} el tipo a registrar
 */
export const siguienteMarca = (ultimaHoy, quiereBreak = false) => {
  // En break, cualquier marca lo termina. No se puede irse a la casa sin
  // volver del almuerzo: dejaría un break abierto que nadie puede medir.
  if (ultimaHoy === MARCA_BREAK_INICIO) return MARCA_BREAK_FIN
  // Sin fichar o ya salió: lo único posible es entrar.
  if (!ultimaHoy || ultimaHoy === MARCA_SALIDA) return MARCA_ENTRADA
  // Trabajando (entró, o volvió del break): sale, o se va de break.
  return quiereBreak ? MARCA_BREAK_INICIO : MARCA_SALIDA
}

/** En qué anda el trabajador ahora mismo. */
export const estadoDelDia = (marcas = []) => {
  const ultima = [...(marcas || [])].sort((a, b) => a._ts - b._ts).pop()
  if (!ultima) return 'idle'
  if (ultima.type === MARCA_BREAK_INICIO) return 'break'
  if (ultima.type === MARCA_SALIDA) return 'done'
  return 'in'
}

/**
 * Resumen de un día: primera entrada, última salida, break acumulado y total
 * trabajado NETO.
 *
 * @param {{marks: Array}} grupo  las marcas del día, cada una con `_ts` (Date)
 */
export const resumenDelDia = (grupo) => {
  const vacio = { inMark: null, outMark: null, totalMs: null, breakMs: 0, breakAbierto: false, marks: [] }
  if (!grupo) return vacio
  const marks = [...(grupo.marks || [])].sort((a, b) => a._ts - b._ts)
  if (marks.length === 0) return { ...vacio, marks }

  const inMark = marks.find((m) => m.type === MARCA_ENTRADA) || null
  const outMark = [...marks].reverse().find((m) => m.type === MARCA_SALIDA) || null

  // Breaks: cada inicio con su fin. Un inicio sin fin NO se cuenta —no se sabe
  // cuánto duró— pero se avisa, porque descontarlo mal sería peor que no
  // descontarlo.
  let breakMs = 0
  let abierto = null
  for (const m of marks) {
    if (m.type === MARCA_BREAK_INICIO) { abierto = m; continue }
    if (m.type === MARCA_BREAK_FIN && abierto) {
      const dur = m._ts - abierto._ts
      if (dur > 0) breakMs += dur
      abierto = null
    }
  }

  let totalMs = null
  if (inMark && outMark && outMark._ts > inMark._ts) {
    totalMs = Math.max(0, (outMark._ts - inMark._ts) - breakMs)
  }

  return { inMark, outMark, totalMs, breakMs, breakAbierto: !!abierto, marks }
}
