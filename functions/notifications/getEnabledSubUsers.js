/**
 * Helper para obtener los sub-usuarios de un dueño que tienen habilitada una
 * notificación específica.
 *
 * Los sub-usuarios viven en `users` con campo `ownerId === ownerId`. Cada uno
 * tiene un objeto `notificationPreferences` con flags por tipo:
 *   { yape_payment: true, new_order: false, new_sale: false, low_stock: false }
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} ownerId - UID del dueño del negocio
 * @param {string} notifType - Tipo de notificación (yape_payment, new_order, ...)
 * @param {boolean} defaultEnabled - Default cuando un sub-usuario no tiene el
 *   campo explícito (sub-usuarios viejos sin notificationPreferences).
 *   Yape default true, el resto default false.
 * @returns {Promise<string[]>} IDs de sub-usuarios con la notificación activa
 */
export async function getEnabledSubUsers(db, ownerId, notifType, defaultEnabled = false) {
  try {
    const snap = await db
      .collection('users')
      .where('ownerId', '==', ownerId)
      .get()

    const enabled = snap.docs
      .filter(d => {
        // Solo sub-usuarios activos
        if (d.data().isActive === false) return false
        const prefs = d.data().notificationPreferences || {}
        if (prefs[notifType] === undefined) return defaultEnabled
        return prefs[notifType] === true
      })
      .map(d => d.id)

    console.log(`👥 Sub-usuarios con ${notifType} habilitado: ${enabled.length}/${snap.size}`)
    return enabled
  } catch (err) {
    console.error(`❌ Error obteniendo sub-usuarios para ${notifType}:`, err)
    return []
  }
}
