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

import { mesesDeRegalo, MESES_PARA_QUIEN_REFIERE } from '../data/referidos.js'

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
  limites = null, metodo = 'manual', referidoPor = null, FieldValue, Timestamp,
}) {
  // Los meses de regalo del programa de referidos van DE ENTRADA, sumados al
  // vencimiento. Para el cliente da igual que al final —14 meses son 14 meses—
  // pero ponerlos al final obliga a que alguien se acuerde un año después de
  // extenderle la cuenta, y eso es lo que se olvida.
  const regalo = referidoPor ? mesesDeRegalo(plan) : 0

  const desde = new Date()
  const hasta = new Date()
  hasta.setMonth(desde.getMonth() + Number(meses || 1) + regalo)

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
    // Quién lo trajo y qué se le regaló. Queda escrito en la suscripción para
    // poder responder meses después "¿por qué esta cuenta vence más tarde de lo
    // que pagó?" sin tener que reconstruirlo.
    ...(referidoPor ? { referidoPor, mesesDeRegalo: regalo } : {}),
    notes: '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { hasta, mesesDeRegalo: regalo }
}

/**
 * Le regala un mes a quien trajo un cliente, cuando ese cliente PAGA.
 *
 * Es el momento que sostiene el programa: premiar al registrarse invita a
 * referirse a uno mismo con otro correo y otro RUC; premiando al pagar, para
 * ganarte un mes tendrías que pagarme uno.
 *
 * Nunca revienta hacia arriba. Si algo falla —el código no existe, el que
 * refirió ya no tiene cuenta— se anota y se sigue: un problema con el premio
 * jamás debe costar el alta del cliente nuevo, que es lo que sí se cobró.
 *
 * @param {string} codigo  el `codigoCliente` de quien refirió
 * @param {string} referidoUid  la cuenta nueva; también es la LLAVE que impide
 *                              premiar dos veces por el mismo referido
 */
export async function premiarAQuienRefiere(db, { codigo, referidoUid, FieldValue, Timestamp }) {
  const registro = db.collection('referidos').doc(referidoUid)
  try {
    if ((await registro.get()).exists) return { premiado: false, motivo: 'ya se premió por este referido' }

    const negocios = await db.collection('businesses').where('codigoCliente', '==', Number(codigo)).limit(2).get()
    if (negocios.empty) return { premiado: false, motivo: `no existe el cliente ${codigo}` }
    // Dos cuentas con el mismo código es un problema de datos, no un referido:
    // premiar a ciegas le daría el mes a la equivocada.
    if (negocios.size > 1) return { premiado: false, motivo: `el código ${codigo} está repetido` }

    const referidor = negocios.docs[0]
    if (referidor.id === referidoUid) return { premiado: false, motivo: 'se refirió a sí mismo' }

    const subRef = db.collection('subscriptions').doc(referidor.id)
    const sub = await subRef.get()
    if (!sub.exists) return { premiado: false, motivo: 'quien refirió no tiene suscripción' }

    // Se estira desde su vencimiento, o desde hoy si ya venció: sumarle un mes
    // a una fecha pasada es regalarle algo que no puede usar.
    const vence = sub.data().currentPeriodEnd?.toDate?.()
    const base = vence && vence > new Date() ? vence : new Date()
    const nuevo = new Date(base)
    nuevo.setMonth(nuevo.getMonth() + MESES_PARA_QUIEN_REFIERE)

    await subRef.update({
      currentPeriodEnd: Timestamp.fromDate(nuevo),
      nextPaymentDate: Timestamp.fromDate(nuevo),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await registro.set({
      referidorUid: referidor.id,
      referidorCodigo: Number(codigo),
      referidorNombre: referidor.data().businessName || null,
      referidoUid,
      mesesRegalados: MESES_PARA_QUIEN_REFIERE,
      venceAntes: vence ? Timestamp.fromDate(vence) : null,
      venceAhora: Timestamp.fromDate(nuevo),
      creadoAt: FieldValue.serverTimestamp(),
    })
    console.log(`🎁 Referido: ${codigo} gana ${MESES_PARA_QUIEN_REFIERE} mes por traer a ${referidoUid}`)
    return { premiado: true, referidorUid: referidor.id }
  } catch (e) {
    console.error('No se pudo premiar a quien refirió:', e.message)
    return { premiado: false, motivo: e.message }
  }
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
