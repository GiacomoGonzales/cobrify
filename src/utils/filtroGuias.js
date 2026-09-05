/**
 * Filtros del listado de guías de remisión.
 *
 * Es UN criterio para las dos páginas (GRE Remitente y GRE Transportista):
 * el rango de fechas, el estado y el motivo se deciden acá. El chip de estado
 * (`ChipEstadoGuia`) usa el mismo `estadoDeGuia` que el filtro, así lo que
 * dice el chip y lo que trae el desplegable nunca se contradicen.
 */

export const PRESETS_DE_FECHA = [
  { value: 'all', label: 'Todo' },
  { value: 'today', label: 'Hoy' },
  { value: '7days', label: '7 días' },
  { value: '30days', label: '30 días' },
  { value: 'month', label: 'Este mes' },
  { value: 'custom', label: 'Personalizado' },
]

export const ESTADOS_DE_GUIA = [
  { value: 'accepted', label: 'Aceptadas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'voided', label: 'Anuladas' },
  { value: 'draft', label: 'Borradores' },
]

export const FILTROS_INICIALES = Object.freeze({
  fecha: 'all',
  desde: '',
  hasta: '',
  estado: 'all',
  motivo: 'all',
})

const dosDigitos = (n) => String(n).padStart(2, '0')

/** Date → 'YYYY-MM-DD' en hora LOCAL (la del usuario, no la de UTC). */
export const aYMD = (d) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`

/** Cualquier fecha guardada ('YYYY-MM-DD', ISO, Timestamp, Date, ms) → 'YYYY-MM-DD' local; null si no es fecha. */
export function fechaComoYMD(valor) {
  if (!valor) return null
  if (typeof valor === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor
    const d = new Date(valor)
    return isNaN(d) ? null : aYMD(d)
  }
  if (typeof valor.toDate === 'function') return aYMD(valor.toDate())
  if (valor instanceof Date) return isNaN(valor) ? null : aYMD(valor)
  if (typeof valor.seconds === 'number') return aYMD(new Date(valor.seconds * 1000))
  if (typeof valor === 'number') return aYMD(new Date(valor))
  return null
}

/**
 * Fecha de la guía como 'YYYY-MM-DD': la de traslado (la columna que se ve en
 * la lista); si no tiene, la de emisión; si tampoco, la de creación.
 *
 * Acepta lo que hay guardado en la práctica: 'YYYY-MM-DD' (formulario), ISO con
 * hora (demo y cargas viejas), Timestamp de Firestore y Date. Un ISO con hora
 * se pasa a hora local ANTES de cortar el día: quedarse con los primeros diez
 * caracteres daría el día de UTC, que en Perú de noche ya es mañana.
 */
export function fechaDeGuia(guide) {
  for (const valor of [guide?.transferDate, guide?.issueDate, guide?.createdAt]) {
    const ymd = fechaComoYMD(valor)
    if (ymd) return ymd
  }
  return null
}

/**
 * Rango [desde, hasta] en 'YYYY-MM-DD' que pide el filtro. null = sin tope.
 *
 * "7 días" y "30 días" no tienen tope superior a propósito: una guía se puede
 * emitir hoy para un traslado de mañana, y si el rango cerrara en hoy esa guía
 * desaparecería de la lista sin que el usuario entienda por qué. "Este mes" es
 * el mes calendario completo por la misma razón.
 */
export function rangoDeFechas(filtros, hoy = new Date()) {
  const hoyYMD = aYMD(hoy)
  const hace = (dias) => aYMD(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias))
  switch (filtros?.fecha) {
    case 'today':
      return { desde: hoyYMD, hasta: hoyYMD }
    case '7days':
      return { desde: hace(6), hasta: null }
    case '30days':
      return { desde: hace(29), hasta: null }
    case 'month': {
      const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
      return { desde: `${hoyYMD.slice(0, 7)}-01`, hasta: aYMD(ultimoDia) }
    }
    case 'custom':
      return { desde: filtros.desde || null, hasta: filtros.hasta || null }
    default:
      return { desde: null, hasta: null }
  }
}

/**
 * Estado unificado de una guía, en el mismo orden de prioridad que muestra el
 * chip: borrador > anulada > aceptada > rechazada > pendiente.
 */
export function estadoDeGuia(guide) {
  if (guide?.status === 'draft') return 'draft'
  const sunat = guide?.sunatStatus
  if (sunat === 'voided') return 'voided'
  if (sunat === 'accepted') return 'accepted'
  if (sunat === 'rejected') return 'rejected'
  return 'pending'
}

/** true si la guía pasa TODOS los filtros (fecha, estado y motivo). */
export function cumpleFiltros(guide, filtros, hoy = new Date()) {
  if (!filtros) return true
  if (filtros.estado && filtros.estado !== 'all' && estadoDeGuia(guide) !== filtros.estado) return false
  if (filtros.motivo && filtros.motivo !== 'all' && String(guide?.transferReason || '') !== String(filtros.motivo)) return false
  const { desde, hasta } = rangoDeFechas(filtros, hoy)
  if (desde || hasta) {
    const fecha = fechaDeGuia(guide)
    if (!fecha) return false
    if (desde && fecha < desde) return false
    if (hasta && fecha > hasta) return false
  }
  return true
}

export function hayFiltrosActivos(filtros) {
  return !!filtros && (filtros.fecha !== 'all' || filtros.estado !== 'all' || filtros.motivo !== 'all')
}

/**
 * Nombre del ZIP con el rango adentro, para que en la carpeta se distinga
 * "guias-de-remision-2026-08-01-a-2026-08-31.zip" del que se bajó otro día.
 */
export function nombreDeZip(prefijo, filtros, hoy = new Date()) {
  const { desde, hasta } = rangoDeFechas(filtros, hoy)
  let tramo
  if (desde && hasta && desde === hasta) tramo = desde
  else if (desde && hasta) tramo = `${desde}-a-${hasta}`
  else if (desde) tramo = `desde-${desde}`
  else if (hasta) tramo = `hasta-${hasta}`
  else tramo = aYMD(hoy)
  return `${prefijo}-${tramo}.zip`
}

const legible = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

/**
 * Cómo se lee el filtro de fecha en un reporte (la fila "Período" del Excel):
 * 'Todas las fechas', '05/09/2026', 'Del 01/09/2026 al 30/09/2026', 'Desde 30/08/2026'.
 */
export function etiquetaDeFiltroFecha(filtros, hoy = new Date()) {
  const { desde, hasta } = rangoDeFechas(filtros, hoy)
  if (desde && hasta && desde === hasta) return legible(desde)
  if (desde && hasta) return `Del ${legible(desde)} al ${legible(hasta)}`
  if (desde) return `Desde ${legible(desde)}`
  if (hasta) return `Hasta ${legible(hasta)}`
  return 'Todas las fechas'
}
