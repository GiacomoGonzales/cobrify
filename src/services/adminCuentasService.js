import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PLANS, nuncaVence } from '@/services/subscriptionService'
import { nombreRubro } from '@/data/rubros'

// Una cuenta del admin sale de tres documentos con el mismo id: subscriptions
// (plan, estado, pagos), businesses (datos del negocio) y users (contacto).
// Aqui se arma UNA sola vez, para la lista (cargarCuentas) y para la ficha
// (cargarCuenta), asi las dos muestran exactamente lo mismo.

const nombreDeReseller = (data, id) => data?.branding?.companyName || data?.companyName || data?.email || id

const armarSubUsuario = (id, data) => ({
  id,
  email: data.email,
  displayName: data.displayName,
  isActive: data.isActive,
  allowedPages: data.allowedPages || [],
  createdAt: data.createdAt?.toDate?.() || null,
})

// Prioridad: qpse/sunat en la raiz > emissionConfig.method > emissionConfig.qpse/sunat > emissionMethod
export function metodoDeEmision(business = {}) {
  if (business.qpse?.enabled || business.qpse?.usuario) return 'qpse'
  if (business.sunat?.enabled || business.sunat?.solUser) return 'sunat_direct'
  if (business.emissionConfig?.method) return business.emissionConfig.method
  if (business.emissionConfig?.qpse?.enabled || business.emissionConfig?.qpse?.usuario) return 'qpse'
  if (business.emissionConfig?.sunat?.enabled || business.emissionConfig?.sunat?.solUser) return 'sunat_direct'
  return business.emissionMethod || 'none'
}

// Nombre de contacto: users.displayName, si no el del negocio, si no se
// deduce del correo ("juan.perez@" → "Juan Perez").
const nombreDeContacto = (userDoc, business, email) =>
  userDoc?.displayName ||
  business.contactName ||
  business.ownerName ||
  (email ? email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null)

export function armarCuenta(id, data, business = {}, userDoc = null, { resellersMap = {}, subUsers = [], customPlans = {} } = {}) {
  const ahora = new Date()
  const createdAt = data.createdAt?.toDate?.() || data.startDate?.toDate?.() || null
  const periodEnd = data.currentPeriodEnd?.toDate?.() || null

  let status = 'active'
  if (data.status === 'suspended' || data.accessBlocked) status = 'suspended'
  else if (data.plan === 'trial' || data.plan === 'free') status = 'trial'
  else if (periodEnd && periodEnd < ahora) status = 'expired'

  const plan = PLANS[data.plan] || customPlans[data.plan]
  const limiteDelPlan = plan?.limits?.maxInvoicesPerMonth || 0
  const rubroEfectivo = business.rubro || business.rubroSugerido || null

  return {
    id,
    userId: id, // alias que usa UserDetailsModal
    // Codigo de cliente (1000001…): lo entrega el servidor al nacer la cuenta.
    codigoCliente: business.codigoCliente || null,
    codigoClienteAsignadoEn: business.codigoClienteAsignadoEn?.toDate?.() || null,
    // Rubro confirmado a mano y el que propuso la herramienta: se pintan
    // distinto a proposito, una sugerencia no es una decision.
    rubro: business.rubro || null,
    rubroSugerido: business.rubroSugerido || null,
    rubroConfirmadoEn: business.rubroConfirmadoEn?.toDate?.() || null,
    rubroEfectivo,
    rubroNombre: rubroEfectivo ? nombreRubro(rubroEfectivo) : '',
    email: data.email || 'N/A',
    businessName: business.razonSocial || business.businessName || data.businessName || 'Sin nombre',
    tradeName: business.tradeName || business.nombreComercial || null,
    ruc: business.ruc || data.ruc || null,
    // `phone` se imprime en el ticket; `contactPhone` es el WhatsApp del dueno (uso interno)
    phone: business.phone || null,
    contactPhone: business.contactPhone || null,
    address: business.address || null,
    department: business.department || null,
    province: business.province || null,
    district: business.district || null,
    contactName: nombreDeContacto(userDoc, business, data.email),
    emissionMethod: metodoDeEmision(business),
    allowInvoicingWithoutSunat: business.allowInvoicingWithoutSunat === true,
    businessMode: business.businessMode || 'retail',
    // Nombre de la Sucursal Principal (se guarda en businesses y users)
    mainBranchName: business.mainBranchName || userDoc?.mainBranchName || null,
    igvRate: business.emissionConfig?.taxConfig?.igvRate ?? 18,
    taxType: business.emissionConfig?.taxConfig?.taxType || 'standard',
    plan: data.plan || 'unknown',
    nuncaVence: nuncaVence(data),
    planName: data.planName || null,
    status,
    createdAt,
    periodEnd,
    currentPeriodEnd: data.currentPeriodEnd,
    currentPeriodStart: data.currentPeriodStart,
    lastCounterReset: data.lastCounterReset,
    monthlyPrice: plan?.pricePerMonth || 0,
    // Precio pactado (congelado en la suscripcion); la renovacion lo respeta.
    renewalPrice: data.renewalPrice ?? null,
    limits: data.limits || plan?.limits || {},
    usage: data.usage || { invoicesThisMonth: 0 },
    paymentHistory: data.paymentHistory || [],
    blockReason: data.blockReason || null,
    planLimit: limiteDelPlan,
    bonusInvoices: data.bonusInvoices || 0,
    // Limite real: el guardado en la suscripcion; si no, plan + bonus.
    limit:
      data.limits?.maxInvoicesPerMonth !== undefined && data.limits?.maxInvoicesPerMonth !== null
        ? data.limits.maxInvoicesPerMonth
        : limiteDelPlan === -1
          ? -1
          : limiteDelPlan + (data.bonusInvoices || 0),
    accessBlocked: data.accessBlocked || false,
    lastPayment: data.paymentHistory?.slice(-1)[0]?.date?.toDate?.() || null,
    subUsersCount: subUsers.length,
    subUsers,
    features: data.features || { productImages: false },
    createdByReseller: data.createdByReseller || false,
    resellerId: data.resellerId || null,
    resellerName: data.resellerId ? resellersMap[data.resellerId] || data.resellerId : null,
    vendedorId: data.vendedorId || null,
    catalogEnabled: business.catalogEnabled === true,
    catalogSlug: business.catalogSlug || null,
    customDomain: business.customDomain || null,
    // Archivada = fuera de vencimientos y de las tasas de renovacion
    archived: data.archived === true,
    archivedAt: data.archivedAt?.toDate?.() || null,
    notasAdmin: data.notasAdmin || '',
    updatedAt: data.updatedAt?.toDate?.() || null,
  }
}

// Toda la lista. Devuelve tambien las suscripciones huerfanas (sin usuario ni
// negocio: sub-usuarios mal creados) y los resellers para el filtro.
export async function cargarCuentas({ customPlans = {} } = {}) {
  const [subsSnap, bizSnap, usersSnap, resellersSnap] = await Promise.all([
    getDocs(collection(db, 'subscriptions')),
    getDocs(collection(db, 'businesses')),
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'resellers')),
  ])

  const resellersMap = {}
  const resellers = []
  resellersSnap.forEach(d => {
    const name = nombreDeReseller(d.data(), d.id)
    resellersMap[d.id] = name
    resellers.push({ id: d.id, name })
  })
  resellers.sort((a, b) => a.name.localeCompare(b.name))

  const negocios = {}
  bizSnap.forEach(d => { negocios[d.id] = d.data() })

  const usuarios = {}
  const subUsersByOwner = {}
  usersSnap.forEach(d => {
    const u = d.data()
    usuarios[d.id] = u
    if (u.ownerId) {
      if (!subUsersByOwner[u.ownerId]) subUsersByOwner[u.ownerId] = []
      subUsersByOwner[u.ownerId].push(armarSubUsuario(d.id, u))
    }
  })

  const cuentas = []
  const huerfanas = []
  subsSnap.forEach(d => {
    const data = d.data()
    // Sub-usuarios: la suscripcion vive en el dueno
    if (data.ownerId) return
    if (usuarios[d.id]?.ownerId) return
    const huerfana = razon => huerfanas.push({
      id: d.id,
      email: data.email || usuarios[d.id]?.email || '',
      displayName: usuarios[d.id]?.displayName || data.businessName || '',
      plan: data.plan || '',
      status: data.status || '',
      createdAt: data.createdAt?.toDate?.() || data.startDate?.toDate?.() || null,
      reason: razon,
    })
    if (usuarios[d.id] && !usuarios[d.id]?.isBusinessOwner && !negocios[d.id]) {
      huerfana('Tiene user doc sin isBusinessOwner y sin negocio')
      return
    }
    if (!usuarios[d.id] && !negocios[d.id]) {
      huerfana('Sin doc en users y sin negocio')
      return
    }
    cuentas.push(armarCuenta(d.id, data, negocios[d.id] || {}, usuarios[d.id] || null, {
      resellersMap,
      subUsers: subUsersByOwner[d.id] || [],
      customPlans,
    }))
  })

  return { cuentas, huerfanas, resellers }
}

// Una sola cuenta, para la ficha. null si no existe la suscripcion.
export async function cargarCuenta(id, { customPlans = {} } = {}) {
  const [subSnap, bizSnap, userSnap, subUsersSnap] = await Promise.all([
    getDoc(doc(db, 'subscriptions', id)),
    getDoc(doc(db, 'businesses', id)),
    getDoc(doc(db, 'users', id)),
    getDocs(query(collection(db, 'users'), where('ownerId', '==', id))),
  ])
  if (!subSnap.exists()) return null
  const data = subSnap.data()

  const resellersMap = {}
  if (data.resellerId) {
    const r = await getDoc(doc(db, 'resellers', data.resellerId)).catch(() => null)
    if (r?.exists()) resellersMap[data.resellerId] = nombreDeReseller(r.data(), data.resellerId)
  }

  return armarCuenta(id, data, bizSnap.exists() ? bizSnap.data() : {}, userSnap.exists() ? userSnap.data() : null, {
    resellersMap,
    subUsers: subUsersSnap.docs.map(d => armarSubUsuario(d.id, d.data())),
    customPlans,
  })
}

// Dias que faltan para el vencimiento (negativo si ya paso); null sin fecha.
// null tambien cuando la cuenta NO vence (Enterprise): no es que falte la fecha,
// es que no aplica. Quien lo pinta debe distinguirlo con `nuncaVence`.
export const diasParaVencer = cuenta =>
  (!cuenta.nuncaVence && cuenta.periodEnd)
    ? Math.ceil((cuenta.periodEnd.getTime() - Date.now()) / 86400000)
    : null

// Telefono guardado en el negocio → formato wa.me (solo digitos, con el 51 de Peru).
export function numeroWhatsappPeru(rawPhone) {
  if (!rawPhone) return null
  let digits = String(rawPhone).replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (!digits) return null
  if (digits.startsWith('51') && digits.length >= 11) return digits
  return '51' + digits
}

// Mensaje de recordatorio de renovacion por WhatsApp (abre wa.me en otra pestana).
export function enlaceRecordatorioWhatsapp(cuenta) {
  const numero = numeroWhatsappPeru(cuenta.contactPhone || cuenta.phone)
  if (!numero) return null
  const d = diasParaVencer(cuenta)
  const vencida = (d !== null && d < 0) || cuenta.status === 'suspended'
  const detalle = cuenta.email && cuenta.email !== 'N/A' ? ` (${cuenta.email})` : ''
  const mensaje = encodeURIComponent(
    `Hola ${cuenta.businessName || ''}, te escribimos de Cobrify. Tu suscripción${detalle} ${vencida ? 'venció' : 'está por vencer'}. ¿Deseas renovar?`
  )
  return `https://wa.me/${numero}?text=${mensaje}`
}
