/**
 * Plantillas de modificadores (modo restaurante).
 *
 * Grupos de modificadores reutilizables (ej. "Cremas", "Término de la carne")
 * que se definen UNA vez y se insertan en cualquier producto desde el editor.
 * Al insertar se COPIAN al producto (guardando templateId de referencia):
 * editar la plantilla después NO modifica los productos que ya la usan.
 *
 * Se guardan en un solo doc: businesses/{id}/config/modifierTemplates
 * { templates: [{ id, name, required, maxSelection, allowRepeat, trackUsage, options: [...] }] }
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const getModifierTemplates = async (businessId) => {
  try {
    const ref = doc(db, 'businesses', businessId, 'config', 'modifierTemplates')
    const snap = await getDoc(ref)
    if (!snap.exists()) return { success: true, data: [] }
    return { success: true, data: snap.data().templates || [] }
  } catch (error) {
    console.error('Error al obtener plantillas de modificadores:', error)
    return { success: false, error: error.message }
  }
}

export const saveModifierTemplates = async (businessId, templates) => {
  try {
    const ref = doc(db, 'businesses', businessId, 'config', 'modifierTemplates')
    await setDoc(ref, { templates: templates || [], updatedAt: serverTimestamp() }, { merge: true })
    return { success: true }
  } catch (error) {
    console.error('Error al guardar plantillas de modificadores:', error)
    return { success: false, error: error.message }
  }
}
