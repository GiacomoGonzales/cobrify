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
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

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
