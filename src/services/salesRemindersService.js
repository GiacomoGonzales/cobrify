/**
 * Recordatorios a partir de las VENTAS.
 *
 * La fuente de verdad es lo que se cobró en el Punto de Venta: si una boleta,
 * factura o nota de venta salió con un cliente identificado, cada cosa que se
 * llevó vuelve a hacer falta pasado un plazo — el baño al mes, el alimento
 * cuando se acaba, la desparasitación cada tres meses.
 *
 * Antes esto vivía en `customers/{id}/recurringServices`: un documento aparte
 * que había que crear al vender y que solo existía si el producto tenía el
 * plazo configurado a mano. Traía tres problemas que este camino no tiene:
 *
 *  - **Lentitud**: para armar la pantalla había que abrir la ficha de TODOS
 *    los clientes, una por una, y mirar adentro. Acá es UNA consulta a las
 *    ventas del período, con el índice que ya existe.
 *  - **No servía para lo ya vendido**: los recordatorios nacían al cobrar, así
 *    que el historial anterior no aparecía nunca. Las ventas, en cambio, ya
 *    están todas.
 *  - **Había que configurar producto por producto** para que apareciera algo.
 *
 * Lo que el negocio marca a mano (vacunas, controles del historial clínico)
 * sigue viviendo donde está: son otra cosa, con su propia fecha.
 */
import { collection, doc, getDocs, setDoc, deleteDoc, serverTimestamp, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getInvoicesPage } from './firestoreService'
import { diasDeRecordatorio, diasPorDefectoDelNegocio } from '@/utils/vetReminders'

/** Ventas que no cuentan: anuladas o en proceso de anulación. */
function estaAnulada(v) {
  return v.status === 'cancelled' || v.status === 'voided' ||
    v.sunatStatus === 'voiding' || v.sunatStatus === 'voided'
}

/**
 * ¿La venta salió con un cliente al que se le pueda recordar algo?
 *
 * Basta con que tenga NOMBRE: boleta, factura o nota de venta, da igual. Lo
 * único que se descarta es la venta de mostrador — sin nombre o a "Cliente
 * General" — porque ahí no hay a quién volver a llamar.
 *
 * No se exige teléfono: el recordatorio sirve igual para verlo en la lista, y
 * el botón de WhatsApp ya se oculta solo cuando no hay a dónde escribir.
 */
function clienteDeLaVenta(v) {
  const c = v.customer || v.customerData || {}
  const nombre = (c.name || c.businessName || '').trim()
  if (!nombre) return null
  if (/^cliente\s+general$/i.test(nombre)) return null

  const documento = (c.documentNumber || '').trim()
  const telefono = (c.phone || '').trim()

  return {
    customerId: c.id || v.customerId || '',
    customerName: nombre,
    phone: telefono,
    documento,
    petName: (c.petName || '').trim(),
    petSpecies: (c.petSpecies || '').trim(),
  }
}

function fechaDeVenta(v) {
  const bruto = v.createdAt || v.issueDate || v.emissionDate
  if (!bruto) return null
  const d = bruto.toDate ? bruto.toDate() : new Date(bruto)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Cuántos días de ventas hay que traer para no perder ningún recordatorio.
 * El plazo más largo que alguien haya configurado manda: con una vacuna a 365
 * días, una venta de hace un año todavía tiene que aparecer.
 */
export function ventanaDeVentas(products, businessSettings, daysAhead) {
  const plazos = (products || [])
    .map(p => Number(p?.reminderDays))
    .filter(n => Number.isFinite(n) && n > 0)
  const mayor = Math.max(diasPorDefectoDelNegocio(businessSettings), ...plazos, 0)
  // Un mes de margen para que lo recién vencido siga a la vista.
  return mayor + daysAhead + 30
}

/**
 * @param {object} p
 * @param {string} p.businessId
 * @param {Array|Promise} p.products    catálogo (para el plazo de cada producto).
 *   Se admite una PROMESA a propósito: no hace falta hasta después de tener
 *   las ventas, así que la pantalla lo pide en paralelo en vez de esperarlo
 *   antes de arrancar.
 * @param {object} p.businessSettings  ajustes del negocio (plazo por defecto)
 * @param {number} p.daysAhead         cuántos días hacia adelante mirar
 * @param {Set|Promise} p.descartados   claves ya marcadas como atendidas (igual
 *   que `products`: se puede pasar la promesa).
 * @param {Date}   [p.desde]           desde cuándo leer ventas. Sin esto se
 *   calcula del catálogo, que es leer SIEMPRE el plazo más largo que alguien
 *   haya configurado — con una vacuna a 365 días, 425 días de ventas en cada
 *   apertura. La pantalla lo pasa según el rango que eligió el usuario.
 * @param {Function} p.onProgress
 * @returns {Promise<{overdue: Array, pending: Array}>}
 */
export async function getRemindersFromSales({
  businessId,
  products = [],
  businessSettings = {},
  daysAhead = 30,
  descartados = new Set(),
  desde: desdeElegido = null,
  onProgress = null,
}) {
  if (!businessId) return { overdue: [], pending: [] }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const hasta = new Date(hoy)
  hasta.setDate(hasta.getDate() + daysAhead)
  hasta.setHours(23, 59, 59, 999)

  // La ventana la manda quien llama. Sin indicación hay que mirar el catálogo,
  // y ahí sí toca esperarlo antes de pedir nada.
  let desde = desdeElegido
  if (!desde) {
    desde = new Date(hoy)
    desde.setDate(desde.getDate() - ventanaDeVentas(await products, businessSettings, daysAhead))
  }

  // Traer las ventas del período, paginadas. Es UNA consulta por página sobre
  // un índice que ya existe, no una por cliente.
  const ventas = []
  let cursor = null
  let vuelta = 0
  do {
    const r = await getInvoicesPage(businessId, { pageSize: 1000, startAfterDoc: cursor, sinceDate: desde })
    if (!r.success) break
    ventas.push(...r.data)
    cursor = r.hasMore ? r.lastDoc : null
    vuelta++
    if (onProgress) onProgress({ revisados: ventas.length, total: null })
    // Tope de seguridad: 15.000 ventas en el período ya es muchísimo, y sin
    // esto un negocio enorme dejaría la pantalla girando.
  } while (cursor && vuelta < 15)

  // Acá sí hacen falta. Si vinieron como promesa, ya se resolvieron mientras
  // se leían las ventas.
  const catalogo = await products
  const yaAtendidos = await descartados
  const plazoPorProducto = new Map()
  for (const p of catalogo) plazoPorProducto.set(p.id, p)

  // Un cliente que vuelve a comprar lo mismo RENUEVA su recordatorio: solo
  // interesa la última vez que se llevó cada cosa. Sin esto, doce baños del
  // año pasado son doce avisos del mismo perro.
  const ultimaCompra = new Map()

  for (const venta of ventas) {
    if (estaAnulada(venta)) continue
    const cliente = clienteDeLaVenta(venta)
    if (!cliente) continue
    const fecha = fechaDeVenta(venta)
    if (!fecha) continue

    for (const item of venta.items || []) {
      const productId = item.productId || item.id || ''
      const nombre = item.name || item.description || ''
      if (!nombre) continue

      const dias = diasDeRecordatorio(plazoPorProducto.get(productId), businessSettings)
      if (dias <= 0) continue

      const clave = `${cliente.customerId || cliente.documento || cliente.customerName}|${productId || nombre}`
      const previo = ultimaCompra.get(clave)
      if (previo && previo.fecha >= fecha) continue

      const vence = new Date(fecha)
      vence.setDate(vence.getDate() + dias)
      vence.setHours(0, 0, 0, 0)

      ultimaCompra.set(clave, {
        clave,
        fecha,
        vence,
        dias,
        id: `${venta.id}:${productId || nombre}`,
        type: 'sale',
        title: nombre,
        invoiceId: venta.id,
        invoiceNumber: venta.number || venta.fullNumber || '',
        productId,
        ...cliente,
        petName: cliente.petName || venta.customer?.petName || '',
      })
    }
  }

  const overdue = []
  const pending = []
  for (const r of ultimaCompra.values()) {
    if (yaAtendidos.has(r.clave)) continue
    const alerta = {
      ...r,
      dueDate: r.vence,
      description: `Última vez: ${r.fecha.toLocaleDateString('es-PE')} · cada ${r.dias} días`,
    }
    if (r.vence < hoy) overdue.push({ ...alerta, overdue: true })
    else if (r.vence <= hasta) pending.push(alerta)
  }

  // Lo que vence antes, primero. Pero los VENCIDOS al revés: el que se pasó
  // ayer se recupera con una llamada; el de hace cinco meses ya es historia.
  // Ordenarlos de más viejo a más nuevo dejaba lo accionable en la última
  // página.
  const masProximo = (a, b) => a.dueDate - b.dueDate
  const masReciente = (a, b) => b.dueDate - a.dueDate
  return { overdue: overdue.sort(masReciente), pending: pending.sort(masProximo), ventasLeidas: ventas.length }
}

// ---------------------------------------------------------------- descartes
/**
 * Marcar un recordatorio como atendido.
 *
 * Como el recordatorio se CALCULA a partir de la venta, no hay un documento
 * que tachar: lo que se guarda es el descarte. Cuando el cliente vuelva a
 * comprar lo mismo, la venta nueva genera una clave con otra fecha y el aviso
 * reaparece solo, que es lo que se espera.
 */
// Firestore no admite '/' ni '.' sueltos en un id de documento, y el nombre de
// un producto puede traerlos ("Baño s/ turno").
const idDeClave = (clave) => String(clave).replace(/[^A-Za-z0-9|_-]/g, '_').slice(0, 400)

export async function descartarRecordatorio(businessId, clave) {
  if (!businessId || !clave) return { success: false }
  try {
    await setDoc(doc(db, 'businesses', businessId, 'reminderDismissals', idDeClave(clave)), {
      clave: String(clave),
      descartadoEn: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al descartar el recordatorio:', error)
    return { success: false, error: error.message }
  }
}

export async function reactivarRecordatorio(businessId, clave) {
  if (!businessId || !clave) return { success: false }
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'reminderDismissals', idDeClave(clave)))
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/** Las claves ya atendidas, para no volver a mostrarlas. */
export async function getDescartados(businessId) {
  if (!businessId) return new Set()
  try {
    const snap = await getDocs(collection(db, 'businesses', businessId, 'reminderDismissals'))
    return new Set(snap.docs.map(d => d.data()?.clave).filter(Boolean))
  } catch (error) {
    console.error('Error al leer los recordatorios atendidos:', error)
    return new Set()
  }
}

/**
 * Avisa cuando entra una venta nueva o cambia una reciente.
 *
 * La pantalla no tiene botón de actualizar: se entera sola. Se escuchan solo
 * las últimas ventas, no todo el período —serían miles de documentos abiertos
 * para detectar algo que casi siempre está en las últimas filas— y el aviso se
 * usa para recalcular, no para pintar: el cálculo necesita el período completo.
 *
 * El primer disparo del snapshot es el estado actual, no un cambio, así que se
 * ignora. Sin eso, la pantalla se recargaría dos veces cada vez que se abre.
 */
export function escucharVentasNuevas(businessId, alCambiar) {
  if (!businessId) return () => {}
  const q = query(
    collection(db, 'businesses', businessId, 'invoices'),
    orderBy('createdAt', 'desc'),
    limit(30),
  )
  let primera = true
  return onSnapshot(
    q,
    (snap) => {
      if (primera) { primera = false; return }
      // Los cambios que este servicio ya escribió (nada) o los que no tocan
      // ventas no llegan acá; cualquier cosa que sí llegue afecta la lista.
      if (snap.docChanges().length > 0) alCambiar()
    },
    (error) => console.error('Error escuchando ventas para los recordatorios:', error),
  )
}
