/**
 * COBRAR CADA RUC ADICIONAL POR SEPARADO — lo que se calcula sin Firestore.
 *
 * Con "Cobrar cada RUC aparte" prendido, cada RUC adicional de una cuenta es
 * un sistema propio: paga su mensualidad y vence por su cuenta. Lo que se
 * guarda está en adminCuentasService (`registrarPagoDeRuc`); acá solo viven
 * las cuentas, para poder probarlas solas.
 */

const aFecha = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)

/**
 * Hasta cuándo queda al día un RUC después de pagar.
 *
 * Igual que una renovación normal: si ya venció (o nunca pagó), los meses
 * cuentan desde HOY —que es el día en que se cobra y se habilita el RUC—; si
 * todavía está al día, se suman a su vencimiento para no regalar ni quitar
 * días.
 */
export function venceDelRucTrasPagar(venceActual, meses, hoy = new Date()) {
  const actual = aFecha(venceActual)
  const base = actual && actual > hoy ? new Date(actual) : new Date(hoy)
  base.setMonth(base.getMonth() + (Number(meses) || 1))
  return base
}

/**
 * Lo que suman al mes los RUC cobrados aparte que están al día: entra al MRR.
 * Un RUC vencido deja de sumar, igual que una cuenta suspendida.
 */
export function mensualidadDeRucs(suscripcion, hoy = new Date()) {
  if (suscripcion?.cobroPorRuc !== true) return 0
  return Object.values(suscripcion?.rucsCobrados || {}).reduce((suma, cobro) => {
    if (!cobro || estadoDelRuc(cobro, hoy).clave === 'vencido') return suma
    return suma + (Number(cobro.precio) || 0) / (Number(cobro.meses) || 1)
  }, 0)
}

/**
 * En qué anda un RUC cobrado aparte.
 * @returns {{ clave: 'sin_pagar'|'vencido'|'por_vencer'|'al_dia', dias: number|null }}
 */
export function estadoDelRuc(cobro, hoy = new Date()) {
  const vence = aFecha(cobro?.vence)
  if (!vence) return { clave: 'sin_pagar', dias: null }
  const dias = Math.ceil((vence - hoy) / 86400000)
  if (dias < 0) return { clave: 'vencido', dias }
  if (dias <= 5) return { clave: 'por_vencer', dias }
  return { clave: 'al_dia', dias }
}

const fecha = (v) => aFecha(v)?.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) || '—'

/**
 * En una línea, cómo va la mensualidad de un RUC: para el desplegable de
 * "Registrar pago", que sale en la ficha y en Usuarios › RUC adicionales.
 */
export function textoDelCobro(cobro, hoy = new Date()) {
  const { clave } = estadoDelRuc(cobro, hoy)
  if (clave === 'sin_pagar') return { texto: 'Sin pago registrado', rojo: true }
  if (clave === 'vencido') return { texto: `Venció el ${fecha(cobro.vence)}`, rojo: true }
  return { texto: `Al día hasta el ${fecha(cobro.vence)}`, rojo: false }
}
