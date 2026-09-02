/**
 * Filtros de la pantalla de Recordatorios, y —lo importante— cuántas ventas
 * hay que leer para armarla.
 *
 * ─── Por qué tardaba ───────────────────────────────────────────────────────
 *
 * La ventana de lectura salía del plazo MÁS LARGO configurado en todo el
 * catálogo: con una sola vacuna a 365 días, la pantalla leía 425 días de
 * ventas SIEMPRE, aunque el veterinario solo quisiera ver quién se llevó un
 * baño el mes pasado. En una veterinaria con movimiento eso son miles de
 * comprobantes en cada apertura.
 *
 * Ahora la ventana la elige el usuario ("Ventas desde: último mes") y es lo
 * único que decide el costo de la consulta. El filtro de servicios recorta en
 * memoria, así que cambiarlo es instantáneo y no vuelve a leer nada.
 *
 * El precio de esto es honesto y hay que decirlo en pantalla: con la ventana
 * en un mes, la vacuna anual comprada hace diez meses NO aparece. Para verla
 * se amplía el rango. Antes aparecía siempre, y por eso la pantalla tardaba
 * siempre.
 */

/** Días hacia adelante que se consideran "próximo". */
export const DIAS_ADELANTE = 30

/**
 * Rangos ofrecidos. `dias` es cuánto se lee hacia atrás; null = sin límite
 * (la ventana la calcula el catálogo, que es el comportamiento viejo).
 */
export const RANGOS = [
  { id: 'mes', label: 'Último mes', dias: 30 },
  { id: 'tres', label: 'Últimos 3 meses', dias: 90 },
  { id: 'seis', label: 'Últimos 6 meses', dias: 180 },
  { id: 'ano', label: 'Último año', dias: 365 },
  { id: 'todo', label: 'Todo el historial', dias: null },
]

/** El que abre la pantalla. Cubre el baño mensual y lo recién vencido. */
export const RANGO_POR_DEFECTO = 'tres'

export const rangoPorId = (id) => RANGOS.find(r => r.id === id) || RANGOS[1]

const alInicioDelDia = (fecha) => {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Desde qué fecha leer las ventas.
 *
 * @param {string} rangoId       id de RANGOS, o 'personalizado'
 * @param {string} desdeManual   'YYYY-MM-DD' cuando el rango es personalizado
 * @param {number} topeDelCatalogo  días que exigiría el catálogo (para 'todo')
 * @param {Date}   [hoy]         inyectable para poder probarlo
 * @returns {Date|null}          null = sin límite (leer todo)
 */
export function desdeDeLectura(rangoId, desdeManual, topeDelCatalogo, hoy = new Date()) {
  if (rangoId === 'personalizado') {
    const d = new Date(`${desdeManual}T00:00:00`)
    // Una fecha a medio teclear ('2026-0') no debe convertirse en un rango
    // absurdo: hasta que sea válida se mantiene el default.
    if (!desdeManual || isNaN(d.getTime())) return restar(hoy, rangoPorId(RANGO_POR_DEFECTO).dias)
    return alInicioDelDia(d)
  }

  const rango = rangoPorId(rangoId)
  if (rango.dias === null) {
    // "Todo el historial" sigue acotado por lo que el catálogo puede llegar a
    // necesitar: leer más que eso no agrega ni un recordatorio.
    const tope = Number(topeDelCatalogo)
    return Number.isFinite(tope) && tope > 0 ? restar(hoy, tope) : null
  }
  return restar(hoy, rango.dias)
}

function restar(hoy, dias) {
  const d = alInicioDelDia(hoy)
  d.setDate(d.getDate() - dias)
  return d
}

/**
 * ¿El recordatorio es de alguno de los servicios elegidos?
 *
 * La selección vacía significa TODOS, no ninguno: una pantalla que abre sin
 * mostrar nada hasta que elijas algo se lee como rota.
 *
 * Los recordatorios de venta traen `productId`; los de la ficha del paciente
 * (vacunas, controles cargados a mano) no tienen producto, así que se comparan
 * por título. Sin eso, filtrar por un servicio escondía las vacunas siempre.
 */
export function coincideServicio(alerta, seleccion) {
  if (!seleccion || seleccion.size === 0) return true
  if (alerta?.productId && seleccion.has(alerta.productId)) return true
  return seleccion.has(`titulo:${normalizar(alerta?.title)}`)
}

const normalizar = (t) => String(t || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()

/** Coincidencia por cliente, paciente o teléfono. */
export function coincideCliente(alerta, texto) {
  const q = normalizar(texto)
  if (!q) return true
  const heno = normalizar(
    [alerta?.customerName, alerta?.petName, alerta?.phone, alerta?.documento].filter(Boolean).join(' ')
  )
  return q.split(/\s+/).every(palabra => heno.includes(palabra))
}

/** Los dos filtros juntos. */
export function aplicarFiltros(lista = [], { servicios, cliente } = {}) {
  if ((!servicios || servicios.size === 0) && !String(cliente || '').trim()) return lista
  return lista.filter(a => coincideServicio(a, servicios) && coincideCliente(a, cliente))
}

/**
 * Las opciones del selector de servicios, sacadas de los recordatorios que
 * HAY, no del catálogo entero.
 *
 * Un catálogo de veterinaria tiene cientos de productos y la mayoría nunca
 * genera un recordatorio; ofrecerlos todos convierte el selector en otra lista
 * imposible de recorrer. Acá aparece lo que realmente se puede filtrar, con
 * cuántos hay de cada uno.
 */
export function serviciosDisponibles(listas = []) {
  const cuenta = new Map()
  for (const lista of listas) {
    for (const a of lista || []) {
      const id = a?.productId || `titulo:${normalizar(a?.title)}`
      const previo = cuenta.get(id)
      if (previo) previo.total++
      else cuenta.set(id, { id, label: a?.title || '(sin nombre)', total: 1 })
    }
  }
  return [...cuenta.values()].sort((a, b) =>
    b.total - a.total || a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })
  )
}
