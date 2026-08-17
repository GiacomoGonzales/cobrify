/**
 * CERTIFICADOS DE REGALO — 16-ago-2026.
 *
 * LA DECISIÓN TRIBUTARIA (de Giacomo) QUE ORDENA TODO EL DISEÑO:
 * el comprobante se emite AL CANJE, no al vender el certificado.
 *
 *  - VENDER un certificado NO es una venta: entra dinero (efectivo, Yape o
 *    Plin) y queda una deuda del negocio con el portador. Por eso acá se
 *    registra un INGRESO DE CAJA (el arqueo del día cuadra) y ningún
 *    comprobante.
 *  - CANJEAR es la venta de verdad: en el POS se emite la boleta o factura
 *    normal, pagada (total o parcialmente) con el método "Certificado de
 *    regalo" — que NO ingresa dinero, porque el dinero entró el día que se
 *    vendió el certificado. Mismo tratamiento de caja que el saldo a favor.
 *
 * El certificado es AL PORTADOR: la llave es su código (GC + 6 caracteres,
 * impredecible), no un cliente. Quien tiene el código, tiene el saldo — igual
 * que un certificado físico de toda la vida.
 */
import { db } from '@/lib/firebase'
import {
  collection, doc, getDoc, getDocs, setDoc, runTransaction,
  query, orderBy, limit, serverTimestamp, Timestamp, arrayUnion,
} from 'firebase/firestore'
import { addCashMovement } from './firestoreService'

const certsRef = (businessId) => collection(db, 'businesses', businessId, 'giftCertificates')

export const normalizeCertCode = (code) =>
  String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)

/**
 * Código nuevo: GC + 6 caracteres sin ambiguos (sin 0/O ni 1/I/L), para que
 * se pueda dictar por teléfono sin drama.
 */
const generarCodigo = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `GC${s}`
}

export const getGiftCertificates = async (businessId) => {
  try {
    const snap = await getDocs(query(certsRef(businessId), orderBy('createdAt', 'desc'), limit(200)))
    return { success: true, data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al cargar certificados:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Vende un certificado: crea el doc Y registra el ingreso de caja en la
 * sesión abierta. Sin sesión de caja no se vende — el dinero que entra sin
 * arqueo es exactamente el descuadre que este diseño evita.
 *
 * @param {Object} datos
 * @param {number} datos.amount           valor del certificado
 * @param {string} [datos.beneficiary]    para quién es (informativo)
 * @param {Date}   [datos.expiresAt]      vencimiento opcional
 * @param {'cash'|'yape'|'plin'} datos.paymentMethod  con qué pagaron
 * @param {string} datos.sessionId        sesión de caja ABIERTA
 * @param {string} [datos.soldBy]         quién lo vendió
 */
export const createGiftCertificate = async (businessId, datos) => {
  try {
    const amount = Math.round(Number(datos.amount) * 100) / 100
    if (!(amount > 0)) return { success: false, error: 'El monto debe ser mayor a 0' }
    if (!datos.sessionId) return { success: false, error: 'Abre tu caja para vender un certificado: el dinero debe entrar al arqueo' }

    // Reintentar si el código sorteado ya existe (prácticamente imposible,
    // pero un certificado pisado sería dinero de un cliente encima de otro).
    let code = generarCodigo()
    for (let i = 0; i < 5 && (await getDoc(doc(certsRef(businessId), code))).exists(); i++) {
      code = generarCodigo()
    }

    await setDoc(doc(certsRef(businessId), code), {
      amount,
      balance: amount,
      beneficiary: (datos.beneficiary || '').trim(),
      status: 'active',
      expiresAt: datos.expiresAt ? Timestamp.fromDate(datos.expiresAt) : null,
      soldPaymentMethod: datos.paymentMethod || 'cash',
      sessionId: datos.sessionId,
      soldBy: datos.soldBy || '',
      redemptions: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    // El ingreso de caja: la plata entró HOY por este medio, sin comprobante
    // (el comprobante saldrá el día del canje). La descripción lleva el código
    // para poder rastrearlo desde el historial de la sesión.
    const mov = await addCashMovement(businessId, datos.sessionId, {
      type: 'income',
      amount,
      description: `Venta de certificado de regalo ${code}`,
      category: 'Certificado de regalo',
      method: datos.paymentMethod || 'cash',
    })
    if (!mov.success) {
      // El certificado ya existe pero el movimiento falló: avisar fuerte, el
      // arqueo del día va a salir con sobrante si no lo registran a mano.
      return { success: true, code, warning: 'El certificado se creó pero NO se pudo registrar el ingreso en caja. Regístralo manualmente.' }
    }

    return { success: true, code }
  } catch (error) {
    console.error('Error al crear certificado:', error)
    return { success: false, error: error.message }
  }
}

/**
 * ¿Este código sirve para pagar? Devuelve el certificado con su saldo si está
 * activo, con saldo y sin vencer.
 */
export const validateGiftCertificate = async (businessId, code) => {
  try {
    const id = normalizeCertCode(code)
    if (id.length < 4) return { success: false, error: 'Código inválido' }
    const snap = await getDoc(doc(certsRef(businessId), id))
    if (!snap.exists()) return { success: false, error: 'El certificado no existe' }
    const cert = snap.data()
    if (cert.status === 'cancelled') return { success: false, error: 'Este certificado fue anulado' }
    if (!(cert.balance > 0)) return { success: false, error: 'Este certificado ya no tiene saldo' }
    if (cert.expiresAt && cert.expiresAt.toDate() < new Date()) {
      return { success: false, error: `Este certificado venció el ${cert.expiresAt.toDate().toLocaleDateString('es-PE')}` }
    }
    return { success: true, data: { id, balance: cert.balance, amount: cert.amount, beneficiary: cert.beneficiary || '' } }
  } catch (error) {
    console.error('Error al validar certificado:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Descuenta el canje del saldo, en TRANSACCIÓN: dos cajeros canjeando el
 * mismo certificado a la vez no pueden gastar el mismo sol dos veces. Se
 * llama DESPUÉS de guardar la venta, con el id del comprobante emitido.
 */
export const redeemGiftCertificate = async (businessId, code, amount, invoiceId = null) => {
  try {
    const id = normalizeCertCode(code)
    const ref = doc(certsRef(businessId), id)
    const monto = Math.round(Number(amount) * 100) / 100
    if (!(monto > 0)) return { success: false, error: 'Monto inválido' }

    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error('El certificado no existe')
      const cert = snap.data()
      if (cert.status === 'cancelled') throw new Error('Certificado anulado')
      if (cert.balance + 0.005 < monto) throw new Error(`Saldo insuficiente: quedan S/ ${Number(cert.balance).toFixed(2)}`)

      const balance = Math.round((cert.balance - monto) * 100) / 100
      tx.update(ref, {
        balance,
        status: balance <= 0 ? 'exhausted' : 'active',
        // serverTimestamp no se admite dentro de arrayUnion: va Timestamp.now().
        redemptions: arrayUnion({ invoiceId: invoiceId || null, amount: monto, date: Timestamp.now() }),
        updatedAt: serverTimestamp(),
      })
      return { balance }
    })
    return { success: true, balance: result.balance }
  } catch (error) {
    console.error('Error al canjear certificado:', error)
    return { success: false, error: error.message }
  }
}

/** Anular un certificado (se equivocaron al venderlo, o devolución del dinero). */
export const cancelGiftCertificate = async (businessId, code) => {
  try {
    await setDoc(doc(certsRef(businessId), normalizeCertCode(code)), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    }, { merge: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
