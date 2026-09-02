/**
 * MOTOR DE FIDELIZACIÓN — tarjeta de sellos (Fase 1, 15-ago-2026).
 *
 * "Compra N veces y el siguiente va gratis", que es como lo maneja el comercio
 * local peruano. La tarjeta de Google/Apple Wallet (fase posterior) será solo la
 * CARA de esto: el saldo real vive acá.
 *
 * DOS DECISIONES DE DISEÑO QUE SOSTIENEN TODO:
 *
 * 1. La llave es el TELÉFONO NORMALIZADO, y es el ID del documento. El mismo
 *    cliente compra en el mostrador (POS), online con cuenta y online como
 *    invitado; si cada camino creara su propia tarjeta, terminaría con los
 *    sellos partidos en tres y reclamando con razón. El teléfono es el único
 *    dato que ya viaja en los tres caminos.
 *
 * 2. Cada movimiento se guarda con el ID de la VENTA que lo originó
 *    (`invoice_<id>` / `order_<id>`). Como el ID del documento es la referencia,
 *    Firestore rechaza el duplicado solo: reprocesar una venta NO vuelve a
 *    sellar. Es la misma clase de error que el botón de "Sincronizar
 *    movimientos", que descontaba stock de nuevo en cada clic.
 */
import { db } from '@/lib/firebase'
import {
  collection, doc, getDoc, getDocs, setDoc, runTransaction,
  query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore'
import { resolveTheme } from '@/data/walletThemes'

/**
 * Interruptor del envío de tarjetas Wallet. Estuvo en true mientras la cuenta
 * de emisor de Google esperaba la aprobación de publicación (con la cuenta en
 * "modo demo", un Android normal no podía añadir la tarjeta). Google APROBÓ el
 * 17-ago-2026 — queda en false y el envío está abierto para todos. Se conserva
 * por si Google alguna vez suspende la cuenta: volver a true re-bloquea el
 * envío en toda la app sin tocar nada más.
 */
export const WALLET_EN_APROBACION = false

/** Config por defecto: el programa nace APAGADO. */
export const DEFAULT_LOYALTY_CONFIG = {
  enabled: false,
  goal: 10,            // sellos para ganar el premio

  // ── El premio (F1: estructurado, 17-ago-2026) ──────────────────────────
  // `reward` sigue siendo la ETIQUETA visible (tarjeta, badge del POS, nota
  // del canje) y se genera sola desde el tipo — así el backend y las
  // pantallas viejas no cambian. `rewardType` decide qué hace el POS al
  // canjear: inyectar el producto gratis, agregarlo a precio especial,
  // llenar el descuento global, o nada (texto libre = canje manual).
  reward: '',                 // etiqueta: "1 pizza mediana gratis"
  rewardType: 'text',         // 'text' | 'product' | 'product_discount' | 'discount'
  rewardProductId: null,      // product / product_discount
  rewardProductName: '',      // copia del nombre (por si el producto se borra)
  rewardSpecialPrice: 0,      // product_discount: precio de canje (S/)
  rewardDiscountType: 'percent', // discount: 'percent' | 'amount'
  rewardDiscountValue: 0,     // discount: valor del descuento

  // ── Cómo se ganan los sellos (F2: por monto, 17-ago-2026) ──────────────
  // 'visit' = 1 sello por venta (premia la frecuencia; cafetería, barbería).
  // 'amount' = 1 sello por cada S/ amountPerStamp de compra (premia el
  // ticket; botica, ferretería). Sin arrastre de vuelto entre compras a
  // propósito: S/210 con paso de S/20 son 10 sellos y los S/10 se pierden —
  // arrastrar residuos convierte esto en un sistema de puntos, otro producto.
  earnMode: 'visit',          // 'visit' | 'amount'
  amountPerStamp: 20,         // S/ por sello en modo 'amount'
  maxStampsPerSale: 0,        // tope de sellos por venta (0 = sin tope)

  minAmount: 0,        // compra mínima para sellar (0 = cualquier compra; solo modo 'visit')

  // ── Vigencia del programa (18-ago-2026) ────────────────────────────────
  // Fecha 'YYYY-MM-DD' hasta la que vale el programa; '' = sin vencimiento
  // (comportamiento de siempre). Pasada la fecha NO se suman sellos ni se
  // canjean premios. Existe para que nadie aparezca a los cinco años con una
  // tarjeta llena a reclamar algo gratis: es una promoción, no una deuda
  // eterna. La fecha viaja a la tarjeta de Wallet ("Válido hasta ..."), que
  // es lo que hace la regla defendible ante el cliente final.
  programEndDate: '',

  // ── Caducidad POR ANTIGÜEDAD del sello (18-ago-2026) ───────────────────
  // 0 = los sellos no vencen (comportamiento de siempre). Con 12, un sello
  // muere a los 12 meses de ganado. Es la caducidad "rodante" que usan las
  // cadenas: convive con programEndDate (fecha única para todos) y es más
  // justa — al cliente nuevo no le caduca nada por una fecha que ya venía
  // corriendo. Y de paso empuja a volver: los sellos tienen reloj.
  //
  // El saldo deja de ser un contador ciego: la tarjeta guarda LOTES
  // (`stampLots`), igual que un producto guarda lotes de stock, y las
  // redenciones consumen del más viejo primero (FIFO).
  stampExpiryMonths: 0,

  // ── Formulario público de registro (18-ago-2026) ───────────────────────
  // El QR de mesa: /registro/{negocio}. El gancho es a libertad del negocio
  // y AMBOS son opcionales e independientes: sellos que regala el registro
  // (0 = ninguno) y/o un texto libre ("un postre gratis en tu primera
  // visita") que la pantalla de éxito muestra como regalo a reclamar.
  welcomeStamps: 0,
  registerIncentiveText: '',
  stampOnlineOrders: true, // sellar también los pedidos del catálogo online
  // Diseño de la tarjeta de Google Wallet. Se guarda RESUELTO (ver
  // src/data/walletThemes.js): el backend lee estos valores, no la tabla.
  walletTheme: resolveTheme(),
  // Mensaje libre que sale como fila en la tarjeta ("Gracias por tu
  // preferencia..."). Vacío = sin fila.
  walletMessage: '',
  // Que la tarjeta aparezca sola en la pantalla de bloqueo al pasar cerca del
  // local. Requiere que la dirección del negocio se pueda ubicar con precisión.
  walletNearby: true,
}

export const getLoyaltyConfig = (companySettings) => ({
  ...DEFAULT_LOYALTY_CONFIG,
  ...(companySettings?.loyaltyConfig || {}),
})

/**
 * Etiqueta visible del premio a partir del tipo estructurado. Es lo que se
 * guarda en `reward` al configurar, lo que ve el cajero en el badge y lo que
 * queda como nota del canje. Para 'text' manda lo que escribió el negocio.
 */
export const rewardLabel = (cfg) => {
  const c = { ...DEFAULT_LOYALTY_CONFIG, ...(cfg || {}) }
  switch (c.rewardType) {
    case 'product':
      return c.rewardProductName ? `${c.rewardProductName} GRATIS` : ''
    case 'product_discount':
      return c.rewardProductName
        ? `${c.rewardProductName} a S/ ${Number(c.rewardSpecialPrice || 0).toFixed(2)}`
        : ''
    case 'discount':
      return c.rewardDiscountType === 'amount'
        ? `S/ ${Number(c.rewardDiscountValue || 0).toFixed(2)} de descuento`
        : `${Number(c.rewardDiscountValue || 0)}% de descuento`
    default:
      return (c.reward || '').trim()
  }
}

/**
 * ¿El programa sigue vigente? Sin fecha configurada, siempre sí.
 *
 * Se compara por DÍA CALENDARIO de Lima y de forma INCLUSIVA: con vigencia
 * "hasta el 31/12", el 31 a las 11 de la noche todavía se puede sellar y
 * canjear. Comparar instantes exactos haría que el último día valiera medio
 * día, que no es lo que nadie entiende por "hasta el 31".
 */
export const programaVigente = (cfg, ahora = new Date()) => {
  const hasta = (cfg?.programEndDate || '').trim()
  if (!hasta) return true
  // 'YYYY-MM-DD' de hoy en Lima, comparable como texto (ISO ordena bien).
  const hoyLima = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
  return hoyLima <= hasta
}

/** La fecha de vigencia en formato peruano, para mostrarla. */
export const vigenciaLegible = (cfg) => {
  const hasta = (cfg?.programEndDate || '').trim()
  if (!hasta) return ''
  const [a, m, d] = hasta.split('-')
  return `${d}/${m}/${a}`
}

/** Fecha JS a partir de lo que devuelve Firestore (Timestamp | Date | ISO). */
const aFecha = (v) => {
  if (!v) return null
  if (typeof v.toDate === 'function') return v.toDate()
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Los LOTES de sellos que siguen vivos, del más viejo al más nuevo.
 *
 * Cada lote es `{ date, quantity }`: los sellos que entraron en una venta.
 * Es el mismo modelo que los lotes de stock de un producto, y por la misma
 * razón — para saber qué vence primero hay que saber cuándo entró cada cosa.
 *
 * Tarjeta vieja sin `stampLots` (todas las de antes de esta función): se
 * reconstruye UN lote con el saldo actual fechado en su última actividad. Es
 * una aproximación deliberadamente generosa: nadie pierde sellos por una
 * migración, y a la siguiente compra el registro ya queda fino.
 */
export const lotesVigentes = (card, cfg, ahora = new Date()) => {
  const meses = Number(cfg?.stampExpiryMonths) || 0
  const crudos = Array.isArray(card?.stampLots) && card.stampLots.length > 0
    ? card.stampLots
    : ((card?.stamps || 0) > 0
        ? [{ date: card.lastActivityAt || card.createdAt || ahora, quantity: card.stamps }]
        : [])
  const lotes = crudos
    .map(l => ({ fecha: aFecha(l.date) || ahora, cantidad: Number(l.quantity) || 0 }))
    .filter(l => l.cantidad > 0)
    .sort((a, b) => a.fecha - b.fecha)
  if (meses <= 0) return lotes
  const limite = new Date(ahora)
  limite.setMonth(limite.getMonth() - meses)
  return lotes.filter(l => l.fecha > limite)
}

/** Saldo REAL de sellos: los de los lotes que no han vencido. */
export const sellosVigentes = (card, cfg, ahora = new Date()) =>
  lotesVigentes(card, cfg, ahora).reduce((s, l) => s + l.cantidad, 0)

/**
 * Cuándo vence el lote MÁS VIEJO del cliente. Es la fecha que vale la pena
 * decirle ("tus sellos vencen el 5 de marzo"): la que lo hace volver.
 * Devuelve null si no hay caducidad configurada o no tiene sellos.
 */
export const vencimientoProximo = (card, cfg, ahora = new Date()) => {
  const meses = Number(cfg?.stampExpiryMonths) || 0
  if (meses <= 0) return null
  const lotes = lotesVigentes(card, cfg, ahora)
  if (lotes.length === 0) return null
  const vence = new Date(lotes[0].fecha)
  vence.setMonth(vence.getMonth() + meses)
  return vence
}

/** Los lotes en el formato que se guarda en Firestore. */
const aLotesGuardables = (lotes) => lotes.map(l => ({ date: l.fecha, quantity: l.cantidad }))

/**
 * Teléfono → llave de tarjeta. Se queda con los dígitos y descarta el código de
 * país peruano para que "+51 987654321", "51987654321" y "987654321" sean la
 * MISMA tarjeta. Devuelve null si no hay teléfono usable (no se puede fidelizar
 * a quien no se puede identificar).
 */
export const phoneKey = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  const local = digits.length > 9 && digits.startsWith('51') ? digits.slice(2) : digits
  return local.length >= 6 ? local : null
}

const cardsRef = (businessId) => collection(db, 'businesses', businessId, 'loyaltyCards')

export const getLoyaltyCard = async (businessId, phone, config = null) => {
  const key = phoneKey(phone)
  if (!key) return { success: false, error: 'Sin teléfono válido' }
  try {
    const snap = await getDoc(doc(cardsRef(businessId), key))
    if (!snap.exists()) return { success: true, data: null }
    const card = { id: snap.id, ...snap.data() }
    // El saldo se calcula al LEER, no se confía en el contador guardado: si
    // pasaron meses sin comprar, sus sellos ya vencieron aunque nadie haya
    // tocado la tarjeta. Sale gratis — los lotes viven en el mismo documento.
    const cfg = { ...DEFAULT_LOYALTY_CONFIG, ...(config || {}) }
    return { success: true, data: cfg.stampExpiryMonths > 0
      ? { ...card, stamps: sellosVigentes(card, cfg), stampsGuardados: card.stamps || 0 }
      : card }
  } catch (error) {
    console.error('Error al leer tarjeta de fidelidad:', error)
    return { success: false, error: error.message }
  }
}

export const getLoyaltyCards = async (businessId) => {
  try {
    const snap = await getDocs(query(cardsRef(businessId), orderBy('updatedAt', 'desc'), limit(500)))
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al cargar tarjetas de fidelidad:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Sumar sello(s) por una venta. IDEMPOTENTE: si esa venta ya selló, no hace
 * nada y lo reporta.
 *
 * @param {string} refId  ID único de la venta que origina el sello
 *                        (`invoice_<id>` o `order_<id>`).
 * @param {string} [localId]  Negocio que SELLÓ, cuando no es el mismo que
 *                        guarda la tarjeta. Dos empresas de un mismo grupo
 *                        comparten las tarjetas (ver src/utils/businessGroup.js)
 *                        y sin esto no habría forma de saber quién dio el
 *                        sello ni quién entregó el premio — que es lo que
 *                        después les permite liquidar entre ellas.
 * @returns {{success, alreadyStamped?, card?, rewardReady?}}
 */
export const earnStamp = async (businessId, {
  phone, customerName = '', customerId = null,
  refId, source = 'pos', amount = 0, config, localId = null,
}) => {
  const key = phoneKey(phone)
  if (!key) return { success: false, error: 'El cliente no tiene teléfono' }
  if (!refId) return { success: false, error: 'Falta la referencia de la venta' }

  const cfg = { ...DEFAULT_LOYALTY_CONFIG, ...(config || {}) }
  if (!cfg.enabled) return { success: false, error: 'Programa desactivado' }
  if (!programaVigente(cfg)) {
    return { success: false, expirado: true, error: `El programa de sellos venció el ${vigenciaLegible(cfg)}` }
  }

  // ¿Cuántos sellos gana ESTA venta? Modo 'visit': siempre 1 (con ticket
  // mínimo opcional). Modo 'amount': 1 por cada S/ amountPerStamp, sin
  // arrastre de residuo, con tope opcional por venta para que una compra
  // grande no llene la tarjeta entera de golpe.
  let sellosGanados = 1
  if (cfg.earnMode === 'amount') {
    const paso = Number(cfg.amountPerStamp) || 0
    if (paso <= 0) return { success: false, error: 'Falta configurar el monto por sello' }
    sellosGanados = Math.floor((Number(amount) || 0) / paso)
    const tope = Number(cfg.maxStampsPerSale) || 0
    if (tope > 0) sellosGanados = Math.min(sellosGanados, tope)
    if (sellosGanados <= 0) {
      return { success: false, belowMinimum: true, error: `La compra no llega a S/ ${paso} (1 sello por cada S/ ${paso})` }
    }
  } else if (cfg.minAmount > 0 && Number(amount) < cfg.minAmount) {
    return { success: false, belowMinimum: true, error: `La compra no llega al mínimo de ${cfg.minAmount}` }
  }

  try {
    const cardDoc = doc(cardsRef(businessId), key)
    const movDoc = doc(collection(cardDoc, 'movements'), refId)

    const result = await runTransaction(db, async (tx) => {
      const movSnap = await tx.get(movDoc)
      // El movimiento YA existe: esta venta ya selló. No se toca nada.
      if (movSnap.exists()) return { alreadyStamped: true }

      const cardSnap = await tx.get(cardDoc)
      const prev = cardSnap.exists() ? cardSnap.data() : null

      // Con caducidad activa el saldo se REARMA desde los lotes vivos: los
      // vencidos se caen solos en esta misma escritura, sin proceso aparte.
      const ahora = new Date()
      const conCaducidad = cfg.stampExpiryMonths > 0
      const lotesPrevios = conCaducidad ? lotesVigentes(prev, cfg, ahora) : []
      const lotesNuevos = conCaducidad
        ? [...lotesPrevios, { fecha: ahora, cantidad: sellosGanados }]
        : []
      const stamps = conCaducidad
        ? lotesNuevos.reduce((acc, l) => acc + l.cantidad, 0)
        : (prev?.stamps || 0) + sellosGanados
      const totalStamps = (prev?.totalStamps || 0) + sellosGanados

      const card = {
        phone: key,
        customerName: customerName || prev?.customerName || '',
        ...(customerId ? { customerId } : {}),
        stamps,
        totalStamps,
        ...(conCaducidad ? { stampLots: aLotesGuardables(lotesNuevos) } : {}),
        goal: cfg.goal,
        rewardsRedeemed: prev?.rewardsRedeemed || 0,
        lastActivityAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(cardSnap.exists() ? {} : { createdAt: serverTimestamp() }),
      }
      tx.set(cardDoc, card, { merge: true })
      tx.set(movDoc, {
        type: 'earn',
        stamps: sellosGanados,
        source,          // 'pos' | 'online'
        amount: Number(amount) || 0,
        // Solo cuando la tarjeta vive en OTRO negocio del grupo: si no,
        // el local es el dueño de la tarjeta y el dato sobra.
        ...(localId && localId !== businessId ? { localId } : {}),
        date: serverTimestamp(),
      })
      return { alreadyStamped: false, stamps, goal: cfg.goal }
    })

    if (result.alreadyStamped) return { success: true, alreadyStamped: true }
    return {
      success: true,
      alreadyStamped: false,
      stamps: result.stamps,
      goal: result.goal,
      rewardReady: result.stamps >= result.goal,
    }
  } catch (error) {
    console.error('Error al sellar tarjeta de fidelidad:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Canjear el premio: descuenta la meta de sellos (no reinicia a cero — si tenía
 * 12 con meta 10, le quedan 2, que es lo justo) y deja el movimiento.
 */
export const redeemReward = async (businessId, phone, { userName = '', note = '', config = null, localId = null } = {}) => {
  const key = phoneKey(phone)
  if (!key) return { success: false, error: 'Sin teléfono válido' }
  // La vigencia se valida también acá y no solo en la pantalla: el canje es
  // el momento en que se entrega algo gratis.
  if (config && !programaVigente({ ...DEFAULT_LOYALTY_CONFIG, ...config })) {
    return { success: false, expirado: true, error: `El programa venció el ${vigenciaLegible(config)} y ya no admite canjes` }
  }
  try {
    const cardDoc = doc(cardsRef(businessId), key)
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(cardDoc)
      if (!snap.exists()) throw new Error('Este cliente no tiene tarjeta')
      const card = snap.data()
      const goal = card.goal || DEFAULT_LOYALTY_CONFIG.goal
      const cfg = { ...DEFAULT_LOYALTY_CONFIG, ...(config || {}) }
      const conCaducidad = cfg.stampExpiryMonths > 0
      const ahora = new Date()

      // Con caducidad, el saldo que cuenta es el de los lotes VIVOS: unos
      // sellos vencidos no pueden pagar un premio.
      const lotes = conCaducidad ? lotesVigentes(card, cfg, ahora) : []
      const disponibles = conCaducidad
        ? lotes.reduce((acc, l) => acc + l.cantidad, 0)
        : (card.stamps || 0)
      if (disponibles < goal) throw new Error('Todavía no llega a la meta de sellos')

      // FIFO: el canje se come los sellos MÁS VIEJOS, que son los que están
      // por vencer. Cobrarle los nuevos sería regalarle la caducidad.
      let porConsumir = goal
      const restantes = []
      for (const lote of lotes) {
        if (porConsumir <= 0) { restantes.push(lote); continue }
        const usa = Math.min(lote.cantidad, porConsumir)
        porConsumir -= usa
        if (lote.cantidad - usa > 0) restantes.push({ ...lote, cantidad: lote.cantidad - usa })
      }

      const stamps = conCaducidad
        ? restantes.reduce((acc, l) => acc + l.cantidad, 0)
        : card.stamps - goal
      tx.set(cardDoc, {
        stamps,
        ...(conCaducidad ? { stampLots: aLotesGuardables(restantes) } : {}),
        rewardsRedeemed: (card.rewardsRedeemed || 0) + 1,
        lastActivityAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
      // El canje NO se puede identificar por una venta, así que su ID lleva la
      // marca de tiempo: dos canjes legítimos del mismo cliente son distintos.
      tx.set(doc(collection(cardDoc, 'movements'), `redeem_${Date.now()}`), {
        type: 'redeem',
        stamps: -goal,
        note,
        redeemedBy: userName,
        // Qué local entregó el premio (ver earnStamp).
        ...(localId && localId !== businessId ? { localId } : {}),
        date: serverTimestamp(),
      })
      return { stamps }
    })
    return { success: true, stamps: result.stamps }
  } catch (error) {
    console.error('Error al canjear premio:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Link "Agregar a Google Wallet" de la tarjeta de un cliente.
 *
 * El servidor se asegura de que la tarjeta exista en Wallet antes de firmar el
 * link (si el objeto no existe, Google muestra un error al abrirlo). Devuelve
 * una URL normal: se puede mandar por WhatsApp.
 */
export const getWalletPassLink = async (businessId, phone, idToken) => {
  try {
    const res = await fetch('https://us-central1-cobrify-395fe.cloudfunctions.net/getWalletPassLink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ businessId, phone: phoneKey(phone) }),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error || 'No se pudo generar la tarjeta' }
    return { success: true, ...data }
  } catch (error) {
    return { success: false, error: error.message || 'Error de red' }
  }
}

export const getCardMovements = async (businessId, phone) => {
  const key = phoneKey(phone)
  if (!key) return { success: false, error: 'Sin teléfono válido' }
  try {
    const snap = await getDocs(query(
      collection(doc(cardsRef(businessId), key), 'movements'),
      orderBy('date', 'desc'), limit(50)
    ))
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
