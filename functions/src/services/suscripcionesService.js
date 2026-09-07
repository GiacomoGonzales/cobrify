/**
 * La suscripción con la que nace una cuenta.
 *
 * Estaba a punto de escribirse por tercera vez —una en el navegador
 * (`subscriptionService.createSubscription`), otra dentro de `completarAlta`—
 * así que vive aquí y la usan los dos caminos del servidor.
 *
 * Lo vendido entra por parámetro y NO se consulta de ningún catálogo: el plan,
 * los meses, el precio y los límites se congelan en el momento del alta. Lo
 * que se cobró es lo que se cobró, aunque mañana cambie la lista de precios.
 */

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {Object} p
 * @param {string} p.uid
 * @param {string} p.email
 * @param {string} p.businessName
 * @param {string} p.plan            id del plan vendido
 * @param {number} p.meses           cuánto dura
 * @param {number|null} p.precio     lo que pagó, congelado como precio de renovación
 * @param {Object|null} p.limites    los límites del plan
 * @param {string} p.metodo          cómo pagó
 * @param {Object} p.FieldValue
 * @param {Object} p.Timestamp
 */
export async function crearSuscripcion(db, {
  uid, email, businessName, plan, meses = 1, precio = null,
  limites = null, metodo = 'manual', FieldValue, Timestamp,
}) {
  const desde = new Date()
  const hasta = new Date()
  hasta.setMonth(desde.getMonth() + Number(meses || 1))

  const pago = precio != null
    ? [{ amount: Number(precio), method: metodo, date: Timestamp.fromDate(desde), plan, note: 'Pago inicial (alta)' }]
    : []

  await db.collection('subscriptions').doc(uid).set({
    userId: uid,
    email,
    businessName,
    plan,
    status: 'active',
    startDate: Timestamp.fromDate(desde),
    currentPeriodStart: Timestamp.fromDate(desde),
    currentPeriodEnd: Timestamp.fromDate(hasta),
    trialEndsAt: null,
    lastPaymentDate: precio != null ? Timestamp.fromDate(desde) : null,
    nextPaymentDate: Timestamp.fromDate(hasta),
    paymentMethod: precio != null ? metodo : null,
    monthlyPrice: precio != null && meses ? Number(precio) / Number(meses) : 0,
    /** Precio pactado congelado: renovar cobra esto, no el catálogo. */
    renewalPrice: precio != null ? Number(precio) : null,
    pricingFrozenAt: precio != null ? FieldValue.serverTimestamp() : null,
    accessBlocked: false,
    blockReason: null,
    blockedAt: null,
    limits: limites || {},
    usage: { invoicesThisMonth: 0, totalCustomers: 0, totalProducts: 0 },
    features: { productImages: false },
    paymentHistory: pago,
    notes: '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { hasta }
}

/**
 * Deshace una cuenta a medio crear.
 *
 * Se usa SOLO sobre el uid que se acaba de crear en la misma llamada, cuando
 * algo falló después: sin esto queda un acceso sin cuenta, que es el estado
 * que no se ve en ningún lado y que hay que ir a limpiar a mano meses después.
 *
 * Borra lo que pudo haberse escrito y el propio acceso. Cada paso va aparte:
 * si uno falla, los demás igual se intentan.
 */
export async function deshacerCuenta(db, auth, uid) {
  const fallos = []
  const negocio = db.collection('businesses').doc(uid)

  for (const sub of ['branches', 'warehouses']) {
    try {
      const snap = await negocio.collection(sub).get()
      await Promise.all(snap.docs.map((d) => d.ref.delete()))
    } catch (e) { fallos.push(`${sub}: ${e.message}`) }
  }
  for (const ref of [negocio, db.collection('users').doc(uid), db.collection('subscriptions').doc(uid)]) {
    try { await ref.delete() } catch (e) { fallos.push(`${ref.path}: ${e.message}`) }
  }
  try { await auth.deleteUser(uid) } catch (e) { fallos.push(`auth: ${e.message}`) }

  if (fallos.length) console.error(`Al deshacer la cuenta ${uid} quedaron restos:`, fallos.join(' | '))
  return { limpio: fallos.length === 0, fallos }
}
