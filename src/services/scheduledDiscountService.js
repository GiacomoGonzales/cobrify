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
 */

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
  name, percent, scope, category = '', productIds = [], days, startTime, endTime, endsAt = null,
}) => {
  try {
    const pct = Number(percent)
    if (!String(name || '').trim()) return { success: false, error: 'Ponle un nombre a la promoción' }
    if (!(pct > 0 && pct < 100)) return { success: false, error: 'El descuento debe estar entre 1% y 99%' }
    if (scope === 'category' && !category) return { success: false, error: 'Elige la categoría' }
    if (scope === 'products' && !productIds.length) return { success: false, error: 'Agrega al menos un producto' }
    if (!days?.length) return { success: false, error: 'Elige al menos un día' }

    const docRef = await addDoc(ref(businessId), {
      name: String(name).trim(),
      percent: pct,
      scope, // 'all' | 'category' | 'products'
      category: scope === 'category' ? category : '',
      productIds: scope === 'products' ? productIds : [],
      days, // [0..6], 0 = domingo
      startTime: startTime || '00:00',
      endTime: endTime || '23:59',
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

/** ¿La regla está corriendo AHORA (día + horario + vigencia + activa)? */
export const promoVigente = (promo, ahora = new Date()) => {
  if (!promo?.active) return false
  if (promo.endsAt && (promo.endsAt.toDate ? promo.endsAt.toDate() : promo.endsAt) < ahora) return false
  if (!promo.days?.includes(ahora.getDay())) return false
  const hhmm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
  return hhmm >= (promo.startTime || '00:00') && hhmm <= (promo.endTime || '23:59')
}

/** ¿La regla alcanza a este producto? */
export const promoAlcanzaProducto = (promo, product) => {
  if (promo.scope === 'all') return true
  if (promo.scope === 'category') return (product.category || '') === promo.category
  if (promo.scope === 'products') return promo.productIds?.includes(product.id || product.productId)
  return false
}

/**
 * La mejor promo vigente para un producto (mayor %), o null. Las promos no
 * se suman entre sí: gana una sola — la más generosa.
 */
export const promoParaProducto = (product, promos, ahora = new Date()) => {
  let mejor = null
  for (const p of promos || []) {
    if (!promoVigente(p, ahora)) continue
    if (!promoAlcanzaProducto(p, product)) continue
    if (!mejor || p.percent > mejor.percent) mejor = p
  }
  return mejor
}
