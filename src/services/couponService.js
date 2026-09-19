import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp, increment, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Cupones de descuento (Promociones, fase 2).
 *
 * Un cupón es un código (VERANO10) que el cajero escribe en el POS y se
 * aplica como DESCUENTO GLOBAL de la venta — el mismo riel que ya emite
 * SUNAT sin observaciones (AllowanceCharge código 02), así que aquí no hay
 * matemática tributaria nueva: el cupón solo decide CUÁNTO descuento va.
 *
 * El ID del documento ES el código normalizado: eso hace la búsqueda del
 * POS un get directo y vuelve imposible duplicar códigos.
 */

const couponsRef = (businessId) => collection(db, 'businesses', businessId, 'coupons')

/** "  verano 10 " -> "VERANO10". Solo letras y números, para teclearlo fácil. */
export const normalizeCouponCode = (code) =>
  String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)

export const getCoupons = async (businessId) => {
  try {
    const snap = await getDocs(query(couponsRef(businessId), orderBy('createdAt', 'desc'), limit(200)))
    return { success: true, data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al cargar cupones:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crea un cupón. type: 'percent' | 'amount'. expiresAt: Date|null.
 * maxUses: number|null (null = sin límite).
 */
export const createCoupon = async (businessId, {
  code, type, value, expiresAt = null, maxUses = null,
  categories = [], ownerBusinessId = null,
}) => {
  try {
    const id = normalizeCouponCode(code)
    if (id.length < 3) return { success: false, error: 'El código necesita al menos 3 letras o números' }
    const val = Number(value)
    if (!(val > 0)) return { success: false, error: 'El valor del descuento debe ser mayor a 0' }
    if (type === 'percent' && val > 100) return { success: false, error: 'Un porcentaje no puede pasar de 100' }
    const cats = (categories || []).filter(Boolean)

    const ref = doc(couponsRef(businessId), id)
    if ((await getDoc(ref)).exists()) return { success: false, error: `El código ${id} ya existe` }

    await setDoc(ref, {
      type,
      value: val,
      expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
      maxUses: maxUses ? Number(maxUses) : null,
      // Alcance por categoría, opcional. Sin esto el cupón descuenta sobre TODA
      // la venta, que es como funcionaron siempre: los cupones ya creados no
      // tienen el campo y se comportan exactamente igual que antes.
      categories: cats,
      // ⚠️ POR QUÉ UN CUPÓN CON CATEGORÍAS TIENE DUEÑO.
      // Los cupones viven en el GRUPO de fidelización, no en el negocio
      // (utils/businessGroup.js): el mismo código vale en las dos empresas. Eso
      // se decidió PRECISAMENTE porque "solo tienen código, valor y tope de
      // usos, ningún producto". Las categorías sí son de una empresa, y el
      // mismo archivo ya rechazó compartir las promociones por horario por esto:
      // "apuntaría a productos que del otro lado no existen". Un cupón con
      // categorías usado en la otra empresa no encontraría ninguna y descontaría
      // CERO sin avisar. Se guarda el dueño para poder decirlo en pantalla.
      ownerBusinessId: cats.length ? (ownerBusinessId || businessId) : null,
      uses: 0,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id }
  } catch (error) {
    console.error('Error al crear cupón:', error)
    return { success: false, error: error.message }
  }
}

export const setCouponActive = async (businessId, code, active) => {
  try {
    await updateDoc(doc(couponsRef(businessId), code), { active, updatedAt: serverTimestamp() })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export const deleteCoupon = async (businessId, code) => {
  try {
    await deleteDoc(doc(couponsRef(businessId), code))
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Valida un código para el POS. Devuelve el cupón si se puede usar, o el
 * motivo en lenguaje de cajero si no. La validación es de mejor esfuerzo
 * (dos cajas podrían colarse en el último uso); el conteo real lo hace
 * redeemCoupon al emitir.
 */
export const validateCoupon = async (businessId, code, { database, negocioQueOpera = null } = {}) => {
  try {
    const id = normalizeCouponCode(code)
    if (!id) return { success: false, error: 'Escribe el código del cupón' }
    // El catálogo público valida con catalogDb (sin sesión); el POS con la
    // instancia normal. Mismo criterio en ambos mundos.
    const snap = await getDoc(doc(database || db, 'businesses', businessId, 'coupons', id))
    if (!snap.exists()) return { success: false, error: 'Ese cupón no existe' }
    const c = snap.data()
    if (!c.active) return { success: false, error: 'Ese cupón está desactivado' }
    if (c.expiresAt && c.expiresAt.toDate() < new Date()) return { success: false, error: 'Ese cupón ya venció' }
    if (c.maxUses && (c.uses || 0) >= c.maxUses) return { success: false, error: 'Ese cupón agotó sus usos' }
    // Un cupón limitado por categorías solo vale en la empresa dueña de esas
    // categorías. Es preferible decirlo a descontar cero en silencio, que es lo
    // que pasaría: del otro lado del grupo esos IDs no existen. Ver el comentario
    // largo en createCoupon y utils/businessGroup.js.
    const cats = c.categories || []
    if (cats.length && c.ownerBusinessId && negocioQueOpera && c.ownerBusinessId !== negocioQueOpera) {
      return { success: false, error: 'Ese cupón es solo para los productos de la otra empresa del grupo' }
    }
    return { success: true, coupon: { id, type: c.type, value: c.value, categories: cats } }
  } catch (error) {
    console.error('Error al validar cupón:', error)
    return { success: false, error: 'No se pudo validar el cupón' }
  }
}

// Qué líneas alcanza un cupón y cuánto descuenta viven en utils/descuentoDelCupon
// (sin Firebase, para probarlas en Node). Se reexporta para quien ya lo importaba
// de acá: el catálogo online y el POS.
export { lineasQueCalifican } from '@/utils/descuentoDelCupon'

/**
 * Cuenta un uso tras emitir la venta. Fire-and-forget desde el POS: si
 * falla, la venta ya está cobrada y el comprobante emitido — un contador
 * desfasado no puede frenar una caja.
 */
/**
 * Link corto de la TARJETA del cupón (Google Wallet / Apple Wallet según el
 * celular que lo abra). El servidor crea el pase y devuelve un cbrfy.link
 * estable por cupón — se puede mandar por WhatsApp o poner en un afiche.
 */
export const getCouponPassLink = async (businessId, couponId, idToken) => {
  try {
    const res = await fetch('https://us-central1-cobrify-395fe.cloudfunctions.net/getCouponPassLink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ businessId, couponId }),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error || 'No se pudo generar la tarjeta' }
    return { success: true, ...data }
  } catch (error) {
    return { success: false, error: error.message || 'Error de red' }
  }
}

export const redeemCoupon = async (businessId, code, invoiceId = null) => {
  try {
    await updateDoc(doc(couponsRef(businessId), normalizeCouponCode(code)), {
      uses: increment(1),
      lastUsedAt: serverTimestamp(),
      ...(invoiceId ? { lastInvoiceId: invoiceId } : {}),
    })
    return { success: true }
  } catch (error) {
    console.error('No se pudo contar el uso del cupón:', error)
    return { success: false, error: error.message }
  }
}
