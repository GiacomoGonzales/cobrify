import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Descuentos programados (Promociones, fase 3): reglas tipo "20% en bebidas
 * de 17:00 a 19:00, martes y jueves". El POS las evalúa AL AGREGAR el
 * producto al carrito, con la hora local de la caja, y aplica el descuento
 * por ítem (monto en soles, el riel que SUNAT ya emite validado). Si el
 * cajero edita el descuento a mano, su número manda y la promo se suelta.
 *
 * Alcance de una regla: todos los productos, una categoría, o una lista de
 * productos específicos. Días de semana + rango horario + vigencia opcional.
 *
 * CANALES: una promo puede valer en el local, en el catálogo online, o en los
 * dos. Hay ofertas que son solo para quien viene a la tienda y otras que son
 * gancho para vender online, así que el negocio lo elige por promoción.
 */

export const CANAL_POS = 'pos'
export const CANAL_CATALOGO = 'catalog'

/**
 * En qué canales corre una promo.
 *
 * Las promos creadas antes de que existieran los canales no tienen el campo.
 * Para esas se responde SOLO local, que es exactamente lo que hacían hasta
 * ahora: nadie se despierta con descuentos nuevos en su catálogo online.
 */
export const canalesDePromo = (promo) => {
  const guardados = Array.isArray(promo?.channels) ? promo.channels.filter(Boolean) : []
  return guardados.length > 0 ? guardados : [CANAL_POS]
}

export const promoAplicaEnCanal = (promo, canal) => canalesDePromo(promo).includes(canal)

/**
 * Día de la semana y hora, SIEMPRE en hora de Perú.
 *
 * Antes se usaba el reloj del equipo. En la caja eso es Perú y funcionaba, pero
 * el catálogo lo abre el cliente desde su propio celular: uno en España vería
 * la promo de las 6pm a la 1pm. El negocio es peruano y su horario también, así
 * que la hora de Lima es la única verdad.
 */
const HORA_PERU = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Lima',
  hour12: false,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const DIA_POR_NOMBRE = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export const momentoEnPeru = (fecha = new Date()) => {
  const partes = HORA_PERU.formatToParts(fecha)
  const trozo = (tipo) => partes.find((p) => p.type === tipo)?.value || ''
  // Algunos motores devuelven '24' para la medianoche.
  const hora = trozo('hour') === '24' ? '00' : trozo('hour')
  return { dia: DIA_POR_NOMBRE[trozo('weekday')] ?? fecha.getDay(), hhmm: `${hora}:${trozo('minute')}` }
}

const ref = (businessId) => collection(db, 'businesses', businessId, 'scheduledDiscounts')

export const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] // getDay(): 0 = domingo

export const getScheduledDiscounts = async (businessId) => {
  try {
    const snap = await getDocs(query(ref(businessId), orderBy('createdAt', 'desc'), limit(100)))
    return { success: true, data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al cargar descuentos programados:', error)
    return { success: false, error: error.message }
  }
}

export const createScheduledDiscount = async (businessId, {
  name, percent, scope, category = '', categories = [], excludedCategories = [],
  productIds = [], days, startTime, endTime, endsAt = null,
  channels = [CANAL_POS, CANAL_CATALOGO],
}) => {
  try {
    const pct = Number(percent)
    // `categories` (varias) es el formato de ahora; `category` (una sola) el de
    // antes. Se aceptan los dos al crear para no romper ninguna llamada, pero lo
    // que se GUARDA es siempre el arreglo: un solo formato en la base.
    const cats = (categories?.length ? categories : (category ? [category] : [])).filter(Boolean)
    const excluidas = (excludedCategories || []).filter(Boolean)
    if (!String(name || '').trim()) return { success: false, error: 'Ponle un nombre a la promoción' }
    if (!(pct > 0 && pct < 100)) return { success: false, error: 'El descuento debe estar entre 1% y 99%' }
    if (scope === 'category' && !cats.length) return { success: false, error: 'Elige al menos una categoría' }
    if (scope === 'products' && !productIds.length) return { success: false, error: 'Agrega al menos un producto' }
    if (!days?.length) return { success: false, error: 'Elige al menos un día' }
    const canales = (channels || []).filter((c) => c === CANAL_POS || c === CANAL_CATALOGO)
    if (!canales.length) return { success: false, error: 'Elige dónde aplica: en el local, en el catálogo o en los dos' }

    const docRef = await addDoc(ref(businessId), {
      name: String(name).trim(),
      percent: pct,
      scope, // 'all' | 'category' | 'products'
      categories: scope === 'category' ? cats : [],
      // Excluir NO cuelga del alcance: vale para cualquiera. El caso que lo pidió
      // es "todo el catálogo menos una categoría" (Carlos Porras, VAPORES), que
      // con scope 'all' no se podía expresar de ninguna forma.
      excludedCategories: excluidas,
      productIds: scope === 'products' ? productIds : [],
      days, // [0..6], 0 = domingo
      startTime: startTime || '00:00',
      endTime: endTime || '23:59',
      channels: canales,
      endsAt: endsAt ? Timestamp.fromDate(endsAt) : null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear descuento programado:', error)
    return { success: false, error: error.message }
  }
}

export const setScheduledDiscountActive = async (businessId, id, active) => {
  try {
    await updateDoc(doc(ref(businessId), id), { active, updatedAt: serverTimestamp() })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export const deleteScheduledDiscount = async (businessId, id) => {
  try {
    await deleteDoc(doc(ref(businessId), id))
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/** ¿La regla está corriendo AHORA (día + horario + vigencia + activa), hora de Perú? */
export const promoVigente = (promo, ahora = new Date()) => {
  if (!promo?.active) return false
  if (promo.endsAt && (promo.endsAt.toDate ? promo.endsAt.toDate() : promo.endsAt) < ahora) return false
  const { dia, hhmm } = momentoEnPeru(ahora)
  if (!promo.days?.includes(dia)) return false
  return hhmm >= (promo.startTime || '00:00') && hhmm <= (promo.endTime || '23:59')
}

/**
 * Las categorías de una promo, en un solo formato.
 *
 * `categories` es el de ahora (varias). Las promos creadas ANTES solo tienen
 * `category` (una), y se sigue leyendo tal cual: es exactamente lo que hacían,
 * así que nadie se despierta con una promo alcanzando de más. Mismo criterio
 * que `canalesDePromo` con las promos sin `channels`.
 */
export const categoriasDePromo = (promo) => {
  if (promo?.categories?.length) return promo.categories
  return promo?.category ? [promo.category] : []
}

/** ¿La regla alcanza a este producto? */
export const promoAlcanzaProducto = (promo, product) => {
  const cat = product.category || ''
  // Excluir GANA sobre el alcance y vale para los tres: el caso que lo motivó es
  // "todo el catálogo menos una categoría", que con scope 'all' no había forma
  // de expresar. Una promo vieja no tiene el campo y esto no la toca.
  if (cat && promo.excludedCategories?.includes(cat)) return false
  if (promo.scope === 'all') return true
  // ⚠️ La comparación es PLANA: elegir la categoría padre NO alcanza a sus
  // subcategorías. Era así con una categoría y se mantiene con varias; cambiarlo
  // le ampliaría el alcance a promos que ya están corriendo.
  if (promo.scope === 'category') return categoriasDePromo(promo).includes(cat)
  if (promo.scope === 'products') return promo.productIds?.includes(product.id || product.productId)
  return false
}

/**
 * La mejor promo vigente para un producto (mayor %), o null. Las promos no
 * se suman entre sí: gana una sola — la más generosa.
 *
 * @param {string} canal CANAL_POS o CANAL_CATALOGO. Una promo marcada solo para
 *   el local no debe verse online, y al revés.
 */
export const promoParaProducto = (product, promos, ahora = new Date(), canal = CANAL_POS) => {
  let mejor = null
  for (const p of promos || []) {
    if (!promoAplicaEnCanal(p, canal)) continue
    if (!promoVigente(p, ahora)) continue
    if (!promoAlcanzaProducto(p, product)) continue
    if (!mejor || p.percent > mejor.percent) mejor = p
  }
  return mejor
}

/** El precio ya con la promo aplicada. Redondeado a céntimos. */
export const precioConPromo = (precio, promo) => {
  const base = Number(precio) || 0
  if (!promo?.percent) return base
  return Math.round(base * (1 - promo.percent / 100) * 100) / 100
}
