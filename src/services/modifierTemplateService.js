/**
 * Plantillas de modificadores (modo restaurante).
 *
 * Grupos de modificadores reutilizables (ej. "Cremas", "Término de la carne")
 * que se definen UNA vez y se insertan en cualquier producto desde el editor.
 * Al insertar se COPIAN al producto (guardando templateId de referencia):
 * editar la plantilla después NO modifica los productos que ya la usan.
 *
 * Se guardan como campo `modifierTemplates` en el DOC del negocio
 * (businesses/{id}), igual que el resto de settings (hiddenMenuItems,
 * posCustomFields, etc.). Antes se usaba la subcolección config/, que no tiene
 * regla de seguridad y Firestore rechazaba la escritura.
 */
import { doc, getDoc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Firestore acepta hasta 500 operaciones por lote. Se deja margen porque cada
// producto es una escritura y no queremos quedar al filo del límite.
const POR_LOTE = 400

export const getModifierTemplates = async (businessId) => {
  try {
    const ref = doc(db, 'businesses', businessId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return { success: true, data: [] }
    return { success: true, data: snap.data().modifierTemplates || [] }
  } catch (error) {
    console.error('Error al obtener plantillas de modificadores:', error)
    return { success: false, error: error.message }
  }
}

export const saveModifierTemplates = async (businessId, templates) => {
  try {
    const ref = doc(db, 'businesses', businessId)
    await setDoc(ref, { modifierTemplates: templates || [], updatedAt: serverTimestamp() }, { merge: true })
    return { success: true }
  } catch (error) {
    console.error('Error al guardar plantillas de modificadores:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Escribe en los productos el resultado de aplicar una plantilla.
 *
 * Recibe los cambios YA CALCULADOS por `planDeAplicacion` (cada uno con el
 * array `modifiers` completo del producto): el criterio de qué cambia vive en
 * `src/utils/modificadoresEnUso.js`, para que la pantalla pueda mostrar los
 * números antes de confirmar y acá no se vuelva a decidir nada.
 *
 * Solo se toca el campo `modifiers`. Va por lotes: o entra el lote entero o no
 * entra ninguno de sus productos, así no queda media catálogo aplicado.
 *
 * @param {string} businessId
 * @param {Array} cambios `[{ producto: { id }, modifiers: [...] }]`
 * @returns {{success: boolean, escritos?: number, error?: string}}
 */
export const aplicarPlantillaAProductos = async (businessId, cambios) => {
  const lista = (cambios || []).filter((c) => c?.producto?.id && Array.isArray(c.modifiers))
  if (lista.length === 0) return { success: true, escritos: 0 }

  try {
    let escritos = 0
    for (let i = 0; i < lista.length; i += POR_LOTE) {
      const lote = writeBatch(db)
      for (const cambio of lista.slice(i, i + POR_LOTE)) {
        const ref = doc(db, 'businesses', businessId, 'products', cambio.producto.id)
        lote.update(ref, { modifiers: cambio.modifiers, updatedAt: serverTimestamp() })
      }
      await lote.commit()
      escritos += Math.min(POR_LOTE, lista.length - i)
    }
    return { success: true, escritos }
  } catch (error) {
    console.error('Error al aplicar la plantilla a los productos:', error)
    return { success: false, error: error.message }
  }
}
