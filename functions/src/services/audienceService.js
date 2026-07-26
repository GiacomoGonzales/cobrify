/**
 * Motor de segmentación para las campañas de notificaciones push.
 *
 * Por qué existe: los filtros viejos leían `plan`, `subscriptionStatus` y
 * `businessMode` del documento de `users`, pero esos campos NO están ahí (se
 * verificó sobre 300 documentos: cero los tenían). El plan y el estado viven en
 * `subscriptions/{uid}` y el modo/ciudad en `businesses/{uid}`. Resultado: filtrar
 * por plan devolvía siempre cero destinatarios y el de estado no filtraba nada.
 *
 * Este módulo arma la audiencia cruzando cada dato con su fuente real:
 *   fcmTokens (collection group) → quién puede recibir y en qué plataforma
 *   users                        → sub-cuenta (ownerId) o cuenta principal
 *   subscriptions                → plan, estado, vencimiento, antigüedad, uso
 *   businesses                   → modo de negocio y ubicación
 *
 * Los sub-usuarios no tienen suscripción propia: heredan la de su dueño
 * (ownerId), así que al filtrar por plan/estado se evalúa la del titular.
 */

/** Convierte fechas de Firestore (Timestamp, string o Date) a Date. */
function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function daysUntil(date) {
  if (!date) return null
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function monthsSince(date) {
  if (!date) return null
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

/** ¿El filtro de lista está activo? (vacío o ausente = no filtra) */
const active = (arr) => Array.isArray(arr) && arr.length > 0

/**
 * Resuelve la audiencia de una campaña.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {Object} campaign - { targetMode, filters, manualUserIds }
 * @returns {Promise<{userIds: string[], tokensByUser: Map, total: number, breakdown: Object}>}
 */
export async function resolveAudience(db, campaign) {
  const targetMode = campaign.targetMode || 'all'
  const f = campaign.filters || {}

  // ── 1. Tokens: la base de todo (quien no tiene token no recibe nada) ──
  // collectionGroup encuentra los tokens aunque el doc padre de `users` no exista.
  const tokensSnap = await db.collectionGroup('fcmTokens').get()
  const tokensByUser = new Map() // uid -> [{ token, platform }]
  for (const doc of tokensSnap.docs) {
    const uid = doc.ref.parent.parent?.id
    if (!uid) continue
    const data = doc.data()
    if (!data.token) continue
    if (!tokensByUser.has(uid)) tokensByUser.set(uid, [])
    tokensByUser.get(uid).push({ token: data.token, platform: data.platform || 'desconocida' })
  }

  // Modo manual: la lista la eligió el admin a mano, no se filtra nada más.
  if (targetMode === 'manual') {
    const ids = (campaign.manualUserIds || []).filter(uid => tokensByUser.has(uid))
    return buildResult(ids, tokensByUser)
  }

  let candidates = [...tokensByUser.keys()]

  // ── 2. users: distinguir cuenta principal de sub-cuenta ──
  const usersSnap = await db.collection('users').get()
  const ownerIdByUser = new Map() // uid -> ownerId (null si es principal)
  for (const doc of usersSnap.docs) {
    ownerIdByUser.set(doc.id, doc.data().ownerId || null)
  }

  const isSubUser = (uid) => !!ownerIdByUser.get(uid)
  // Para heredar plan/estado: la suscripción de un sub-usuario es la de su dueño
  const subscriptionOwnerOf = (uid) => ownerIdByUser.get(uid) || uid

  if (f.accountType === 'owners') {
    candidates = candidates.filter(uid => !isSubUser(uid))
  } else if (f.accountType === 'subusers') {
    candidates = candidates.filter(uid => isSubUser(uid))
  }

  // ── 3. Plataforma (android / ios / web) — para campañas de calificación ──
  if (active(f.platforms)) {
    candidates = candidates.filter(uid =>
      (tokensByUser.get(uid) || []).some(t => f.platforms.includes(t.platform))
    )
  }

  // ── 4. subscriptions: plan, estado, vencimiento, antigüedad, comprobantes ──
  const needsSubscription = active(f.plans) || active(f.statuses) ||
    f.expiringInDays != null || f.minAgeMonths != null ||
    f.invoicesMin != null || f.invoicesMax != null

  if (needsSubscription) {
    const subsSnap = await db.collection('subscriptions').get()
    const subById = new Map()
    for (const doc of subsSnap.docs) subById.set(doc.id, doc.data())

    candidates = candidates.filter(uid => {
      const sub = subById.get(subscriptionOwnerOf(uid))
      if (!sub) return false // sin suscripción no entra en filtros de suscripción

      if (active(f.plans) && !f.plans.includes(sub.plan)) return false

      if (active(f.statuses)) {
        // `accessBlocked` manda: una cuenta bloqueada está suspendida aunque el
        // status diga otra cosa (así lo interpreta el resto del sistema).
        const status = sub.accessBlocked ? 'suspended' : (sub.status || 'unknown')
        if (!f.statuses.includes(status)) return false
      }

      if (f.expiringInDays != null) {
        const d = daysUntil(toDate(sub.currentPeriodEnd))
        // Incluye vencidas (d < 0) y las que vencen dentro del rango
        if (d === null || d > Number(f.expiringInDays)) return false
      }

      if (f.minAgeMonths != null) {
        const m = monthsSince(toDate(sub.startDate || sub.createdAt))
        if (m === null || m < Number(f.minAgeMonths)) return false
      }

      if (f.invoicesMin != null || f.invoicesMax != null) {
        const emitted = Number(sub.usage?.invoicesThisMonth) || 0
        if (f.invoicesMin != null && emitted < Number(f.invoicesMin)) return false
        if (f.invoicesMax != null && emitted > Number(f.invoicesMax)) return false
      }

      return true
    })
  }

  // ── 5. businesses: modo de negocio y ubicación ──
  // Se leen SOLO si hacen falta: son documentos pesados (config de restaurante,
  // catálogo, branding...) y traerlos todos sin necesidad es caro.
  const needsBusiness = active(f.businessModes) || active(f.departments) || active(f.provinces)

  if (needsBusiness) {
    const bizSnap = await db.collection('businesses').get()
    const bizById = new Map()
    for (const doc of bizSnap.docs) bizById.set(doc.id, doc.data())

    candidates = candidates.filter(uid => {
      // El negocio es el del dueño (un sub-usuario opera el negocio de su titular)
      const biz = bizById.get(subscriptionOwnerOf(uid))
      if (!biz) return false

      if (active(f.businessModes) && !f.businessModes.includes(biz.businessMode || 'retail')) return false
      if (active(f.departments) && !f.departments.includes(biz.department)) return false
      if (active(f.provinces) && !f.provinces.includes(biz.province)) return false
      return true
    })
  }

  return buildResult(candidates, tokensByUser, f.platforms)
}

/**
 * Arma el resultado final. Si se filtró por plataforma, se envían SOLO los tokens
 * de esas plataformas (si no, un usuario con Android y iPhone recibiría en ambos
 * aunque la campaña fuera "califica la app en Play Store").
 */
function buildResult(userIds, tokensByUser, platforms = null) {
  const tokens = []
  const tokenUserMap = {} // token -> uid, para poder limpiar los tokens inválidos
  const byPlatform = {}
  for (const uid of userIds) {
    for (const t of tokensByUser.get(uid) || []) {
      if (active(platforms) && !platforms.includes(t.platform)) continue
      tokens.push(t.token)
      tokenUserMap[t.token] = uid
      byPlatform[t.platform] = (byPlatform[t.platform] || 0) + 1
    }
  }
  return {
    userIds,
    tokens,
    tokenUserMap,
    total: userIds.length,
    breakdown: { usuarios: userIds.length, tokens: tokens.length, porPlataforma: byPlatform },
  }
}
