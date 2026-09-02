/**
 * Guardar los recordatorios ya calculados para que la pantalla abra al
 * instante la segunda vez.
 *
 * El piso de esta pantalla es el peso de las ventas: 857 comprobantes son
 * varios megas y no hay forma de pedir menos campos desde el navegador
 * (Firestore no proyecta campos en el SDK cliente). Con conexión lenta eso son
 * siete segundos mirando un spinner, todos los días, para ver una lista que
 * casi siempre es la misma que ayer.
 *
 * Así que se guarda lo CALCULADO —no las ventas— y al abrir se muestra de
 * entrada mientras por detrás se vuelve a leer. Cuando llega lo fresco,
 * reemplaza. Es el patrón de siempre: mostrar lo último que se supo y
 * corregirlo enseguida.
 *
 * Tres cuidados:
 *  - **Vence.** Pasado un día no se usa: una lista de la semana pasada manda a
 *    llamar a quien ya vino.
 *  - **Se limita.** Solo los campos que la tabla dibuja, y con tope de filas.
 *    localStorage son unos pocos megas para TODO el navegador; llenarlo con
 *    esto rompería otras cosas del sistema, que es peor que ir lento.
 *  - **Nunca tira.** Si el almacenamiento está lleno, en modo incógnito o
 *    bloqueado, se sigue sin caché.
 */

const PREFIJO = 'recordatorios:v1:'
const VENCE_EN_MS = 24 * 60 * 60 * 1000
const TOPE_FILAS = 600

/** Lo único que la tabla dibuja. El resto del recordatorio no se guarda. */
const CAMPOS = [
  'id', 'clave', 'type', 'title', 'description', 'overdue',
  'customerId', 'customerName', 'petName', 'petSpecies', 'phone',
  'productId', 'invoiceId',
]

const laClave = (businessId, rango, desdeManual = '') =>
  `${PREFIJO}${businessId}:${rango}:${rango === 'personalizado' ? desdeManual : ''}`

const aGuardable = (a) => {
  const out = {}
  for (const c of CAMPOS) if (a?.[c] !== undefined) out[c] = a[c]
  // La fecha viaja como número: JSON no tiene Date y el string ISO ocupa más.
  out.d = a?.dueDate instanceof Date ? a.dueDate.getTime() : Number(a?.dueDate) || 0
  return out
}

const aRecordatorio = (r) => ({ ...r, dueDate: new Date(r.d) })

/**
 * @returns {{pending: Array, overdue: Array, guardadoEn: number}|null}
 */
export function leerCache(businessId, rango, desdeManual) {
  if (!businessId) return null
  try {
    const crudo = localStorage.getItem(laClave(businessId, rango, desdeManual))
    if (!crudo) return null
    const datos = JSON.parse(crudo)
    if (!datos || typeof datos.guardadoEn !== 'number') return null
    if (Date.now() - datos.guardadoEn > VENCE_EN_MS) return null
    return {
      guardadoEn: datos.guardadoEn,
      ventasLeidas: datos.ventasLeidas ?? null,
      pending: (datos.pending || []).map(aRecordatorio),
      overdue: (datos.overdue || []).map(aRecordatorio),
    }
  } catch {
    // Incógnito, almacenamiento bloqueado o un JSON de una versión vieja.
    return null
  }
}

export function guardarCache(businessId, rango, desdeManual, { pending, overdue, ventasLeidas }) {
  if (!businessId) return false
  try {
    const datos = {
      guardadoEn: Date.now(),
      ventasLeidas: ventasLeidas ?? null,
      pending: (pending || []).slice(0, TOPE_FILAS).map(aGuardable),
      overdue: (overdue || []).slice(0, TOPE_FILAS).map(aGuardable),
    }
    localStorage.setItem(laClave(businessId, rango, desdeManual), JSON.stringify(datos))
    return true
  } catch {
    // Sin espacio: no es un error que valga la pena mostrar, solo se pierde la
    // ventaja de la próxima apertura.
    return false
  }
}

/** Al cambiar de negocio o cerrar sesión no debe quedar nada de otro. */
export function limpiarCache(businessId) {
  try {
    const aBorrar = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(PREFIJO)) continue
      if (!businessId || k.startsWith(`${PREFIJO}${businessId}:`)) aBorrar.push(k)
    }
    aBorrar.forEach(k => localStorage.removeItem(k))
    return aBorrar.length
  } catch {
    return 0
  }
}

export const _internos = { laClave, aGuardable, aRecordatorio, VENCE_EN_MS, TOPE_FILAS }
