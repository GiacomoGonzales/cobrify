import { db } from '@/lib/firebase'
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'

/**
 * HISTORIAL DE PRECIOS — quién cambió cuánto y cuándo.
 *
 * El precio es el dato que más discusiones genera ("¿quién le bajó el precio a
 * esto?") y hasta ahora el sistema no guardaba nada: el valor viejo se pisaba y
 * no quedaba rastro.
 *
 * Vive al lado de `stockMovements`, con el mismo criterio: una colección propia
 * del negocio, no un array dentro del producto. Un array crece sin techo dentro
 * del documento que más se lee del sistema — el catálogo del POS —, así que
 * cada cambio de precio haría más lenta cada venta.
 *
 * Solo se anota lo que CAMBIÓ. Guardar el resto sería ruido que hace ilegible
 * justamente la pantalla que uno abre para encontrar un cambio.
 */

/** Campos que se vigilan, con el nombre que ve el usuario. */
export const CAMPOS_DE_PRECIO = {
  price: 'Precio de venta',
  cost: 'Costo',
  price2: 'Precio 2',
  price3: 'Precio 3',
  price4: 'Precio 4',
  priceUSD: 'Precio en dólares',
  costUSD: 'Costo en dólares',
}

const coleccion = (businessId) => collection(db, 'businesses', businessId, 'priceChanges')

/** Compara como números: "10.00" y 10 son el mismo precio, no un cambio. */
const cambio = (antes, despues) => {
  const a = Number(antes)
  const b = Number(despues)
  const aVacio = antes === null || antes === undefined || antes === ''
  const bVacio = despues === null || despues === undefined || despues === ''
  if (aVacio && bVacio) return false
  if (aVacio !== bVacio) return true
  if (Number.isNaN(a) || Number.isNaN(b)) return String(antes) !== String(despues)
  // Dos centavos de diferencia son un cambio; una milésima de redondeo no.
  return Math.abs(a - b) >= 0.005
}

/**
 * Anota los precios que cambiaron entre el producto viejo y el nuevo.
 *
 * No corta la operación si falla: perder la anotación es molesto, perder el
 * cambio de precio del usuario porque la anotación falló sería peor.
 *
 * @param {string} businessId
 * @param {Object} params
 * @param {string} params.productId
 * @param {string} params.productName
 * @param {Object} params.antes      producto como estaba
 * @param {Object} params.despues    campos que se guardaron
 * @param {Object} params.usuario    { uid, nombre }
 * @param {string} params.origen     'manual' | 'masivo' | 'importacion' | 'compra'
 * @param {string} [params.variantSku]
 * @param {string} [params.nota]
 * @returns {Promise<{anotados: number}>}
 */
export const registrarCambiosDePrecio = async (businessId, params) => {
  const { productId, productName, antes, despues, usuario, origen, variantSku, nota } = params || {}
  if (!businessId || !productId || !antes || !despues) return { anotados: 0 }

  const pendientes = []
  for (const campo of Object.keys(CAMPOS_DE_PRECIO)) {
    // Solo los campos que vinieron en la actualización: si `despues` no lo
    // trae, nadie lo tocó.
    if (!(campo in despues)) continue
    if (!cambio(antes[campo], despues[campo])) continue
    pendientes.push({
      campo,
      campoNombre: CAMPOS_DE_PRECIO[campo],
      valorAnterior: antes[campo] ?? null,
      valorNuevo: despues[campo] ?? null,
    })
  }

  if (pendientes.length === 0) return { anotados: 0 }

  try {
    await Promise.all(pendientes.map((c) => addDoc(coleccion(businessId), {
      productId,
      productName: productName || '',
      ...(variantSku ? { variantSku } : {}),
      ...c,
      userId: usuario?.uid || null,
      userName: usuario?.nombre || '',
      origen: origen || 'manual',
      ...(nota ? { nota } : {}),
      createdAt: serverTimestamp(),
    })))
    return { anotados: pendientes.length }
  } catch (error) {
    console.warn('No se pudo anotar el cambio de precio:', error)
    return { anotados: 0 }
  }
}

/**
 * Historial de precios de un producto, del más reciente al más viejo.
 *
 * Sin `orderBy` en la consulta a propósito: obligaría a un índice compuesto con
 * `productId` y el historial fallaría en silencio hasta crearlo a mano. Son
 * pocos documentos por producto, así que se ordenan acá.
 */
export const getPriceHistory = async (businessId, productId) => {
  if (!businessId || !productId) return { success: true, data: [] }
  try {
    const snap = await getDocs(query(coleccion(businessId), where('productId', '==', productId)))
    const filas = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    filas.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    return { success: true, data: filas }
  } catch (error) {
    console.error('Error al obtener el historial de precios:', error)
    return { success: false, error: error.message, data: [] }
  }
}
