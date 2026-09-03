import { collection, query, where, orderBy, limit, getDocs, getAggregateFromServer, count } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { origenDeCuenta } from '@/utils/subscriptionOwnership'
import { PLANS, classifyPlan } from '@/services/subscriptionService'
import { getCustomPlans } from '@/services/customPlanService'
import { metodoDeEmision } from '@/services/adminCuentasService'

// El Resumen del admin en dos velocidades.
//
// resumenRapido: cifras contadas EN EL SERVIDOR con agregaciones (cada
// cuenta cuesta una lectura por cada mil documentos): unas 16 lecturas en
// total. Es lo que se ve al abrir la pagina.
//
// resumenCompleto: lee las suscripciones, los negocios y los usuarios UNA sola
// vez y saca de ahi todo lo demas (graficos, alertas, planes, departamentos,
// uso, adquisicion, retencion). Antes esto mismo se hacia con cuatro
// funciones que leian las suscripciones tres veces y los negocios dos.

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const contar = async q => (await getAggregateFromServer(q, { n: count() })).data().n
const inicioDeMes = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
const finDeMes = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}
const sumarDias = (d, n) => new Date(d.getTime() + n * 86400000)
const claveMes = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const titulo = s => String(s || '').trim().toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())

// ── Rapido ──────────────────────────────────────────────────────────────────

export async function resumenRapido() {
  const subs = collection(db, 'subscriptions')
  const ahora = new Date()
  // Planes con precio: el MRR sale de cuantas cuentas activas hay en cada uno
  const planes = Object.entries(PLANS).filter(([, p]) => (p.pricePerMonth || 0) > 0)

  const [total, subUsuarios, activas, suspendidas, trial, nuevasMes, vencen7, vencidas7, renuevanMes, ...activasPorPlan] = await Promise.all([
    contar(subs),
    // Los sub-usuarios viejos tienen su propia suscripcion (con ownerId); se descuentan
    contar(query(subs, where('ownerId', '!=', null))),
    contar(query(subs, where('status', '==', 'active'))),
    contar(query(subs, where('status', '==', 'suspended'))),
    contar(query(subs, where('plan', 'in', ['trial', 'free']))),
    contar(query(subs, where('createdAt', '>=', inicioDeMes()))),
    contar(query(subs, where('status', '==', 'active'), where('currentPeriodEnd', '>', ahora), where('currentPeriodEnd', '<=', sumarDias(ahora, 7)))),
    contar(query(subs, where('status', '==', 'active'), where('currentPeriodEnd', '>=', sumarDias(ahora, -7)), where('currentPeriodEnd', '<', ahora))),
    contar(query(subs, where('status', '==', 'active'), where('currentPeriodEnd', '>=', inicioDeMes()), where('currentPeriodEnd', '<=', finDeMes()))),
    ...planes.map(([id]) => contar(query(subs, where('status', '==', 'active'), where('plan', '==', id)))),
  ])

  let mrr = 0
  planes.forEach(([, p], i) => { mrr += (activasPorPlan[i] || 0) * (p.pricePerMonth || 0) })

  return {
    total: Math.max(0, total - subUsuarios),
    activas,
    suspendidas,
    trial,
    nuevasMes,
    vencen7,
    vencidas7,
    renuevanMes,
    mrr: Math.round(mrr * 100) / 100,
    lecturas: 9 + planes.length,
    calculadoEn: new Date(),
  }
}

// ── Completo ────────────────────────────────────────────────────────────────

function calcularStats(subsSnap, customPlans) {
  const now = new Date()
  const startOfMonth = inicioDeMes()
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  const endOfMonth = finDeMes()
  const haceUnaSemana = sumarDias(now, -7)

  let totalUsers = 0, activeUsers = 0, suspendedUsers = 0, trialUsers = 0
  let newThisMonth = 0, newLastMonth = 0, mrr = 0, collectableThisMonth = 0, collectableCount = 0
  let totalRevenue = 0, expiringThisWeek = 0
  const usersByPlan = {}
  const recentPayments = []
  const recentUsers = []
  const monthlyGrowth = {}
  const monthlyRevenue = {}
  Object.keys(PLANS).forEach(k => { usersByPlan[k] = 0 })

  subsSnap.forEach(d => {
    const data = d.data()
    if (data.ownerId) return
    totalUsers++
    if (data.status === 'suspended' || data.accessBlocked) suspendedUsers++
    else if (data.plan === 'trial' || data.plan === 'free') trialUsers++
    else activeUsers++

    const plan = data.plan || 'unknown'
    usersByPlan[plan] = (usersByPlan[plan] || 0) + 1

    const periodEnd = data.currentPeriodEnd?.toDate?.()
    if (data.status === 'active' && !data.accessBlocked && PLANS[data.plan]) {
      mrr += PLANS[data.plan].pricePerMonth || 0
      if (periodEnd && periodEnd >= startOfMonth && periodEnd <= endOfMonth) {
        collectableThisMonth += PLANS[data.plan].pricePerMonth || 0
        collectableCount++
      }
    }

    const createdAt = data.createdAt?.toDate?.() || data.startDate?.toDate?.()
    if (createdAt) {
      if (createdAt >= startOfMonth) newThisMonth++
      else if (createdAt >= startOfLastMonth && createdAt <= endOfLastMonth) newLastMonth++
      const k = claveMes(createdAt)
      monthlyGrowth[k] = (monthlyGrowth[k] || 0) + 1
      if (createdAt >= haceUnaSemana) {
        recentUsers.push({ id: d.id, email: data.email, businessName: data.businessName, plan: data.plan, planName: data.planName, createdAt })
      }
    }

    if (periodEnd) {
      const dias = Math.ceil((periodEnd - now) / 86400000)
      if (dias > 0 && dias <= 7) expiringThisWeek++
    }

    for (const p of data.paymentHistory || []) {
      const fecha = p.date?.toDate?.() || new Date(p.date)
      totalRevenue += p.amount || 0
      if (fecha instanceof Date && !isNaN(fecha)) {
        const k = claveMes(fecha)
        monthlyRevenue[k] = (monthlyRevenue[k] || 0) + (p.amount || 0)
        if (fecha >= startOfMonth) {
          recentPayments.push({ ...p, userId: d.id, email: data.email, businessName: data.businessName, date: fecha })
        }
      }
    }
  })

  recentUsers.sort((a, b) => b.createdAt - a.createdAt)
  recentPayments.sort((a, b) => b.date - a.date)

  const growthRate = newLastMonth > 0 ? Number(((newThisMonth - newLastMonth) / newLastMonth * 100).toFixed(1)) : newThisMonth > 0 ? 100 : 0
  const conversionRate = trialUsers > 0 ? Number(((activeUsers / (activeUsers + trialUsers)) * 100).toFixed(1)) : 0

  // Ultimos 12 meses, para los dos graficos
  const growthChartData = []
  const revenueChartData = []
  let acumulado = 0
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = claveMes(date)
    acumulado += monthlyGrowth[key] || 0
    growthChartData.push({ month: MESES[date.getMonth()], year: date.getFullYear(), key, nuevos: monthlyGrowth[key] || 0, total: acumulado })
    revenueChartData.push({ month: MESES[date.getMonth()], year: date.getFullYear(), key, monto: Math.round((monthlyRevenue[key] || 0) * 100) / 100 })
  }

  const allPlans = { ...PLANS, ...customPlans }
  const planDistribution = Object.entries(usersByPlan)
    .filter(([, n]) => n > 0)
    .map(([plan, value]) => ({ name: allPlans[plan]?.name || plan, value, plan }))

  return {
    totalUsers, activeUsers, suspendedUsers, trialUsers, newThisMonth, newLastMonth, growthRate,
    mrr, collectableThisMonth, collectableCount, totalRevenue, expiringThisWeek, conversionRate,
    usersByPlan, planDistribution,
    recentPayments: recentPayments.slice(0, 10),
    recentUsers: recentUsers.slice(0, 10),
    growthChartData, revenueChartData,
  }
}

function calcularAlertas(subsSnap) {
  const now = new Date()
  const alertas = []
  subsSnap.forEach(d => {
    const data = d.data()
    if (data.ownerId) return
    const nombre = data.businessName || data.email
    const periodEnd = data.currentPeriodEnd?.toDate?.()
    if (periodEnd) {
      const dias = Math.ceil((periodEnd - now) / 86400000)
      if (dias > 0 && dias <= 3) alertas.push({ type: 'warning', title: 'Suscripción por vencer', message: `${nombre} vence en ${dias} día(s)`, userId: d.id, date: periodEnd })
      if (dias < 0 && dias > -7) alertas.push({ type: 'error', title: 'Suscripción vencida', message: `${nombre} venció hace ${Math.abs(dias)} día(s)`, userId: d.id, date: periodEnd })
    }
    if (data.plan === 'trial' || data.plan === 'free') {
      const createdAt = data.createdAt?.toDate?.() || data.startDate?.toDate?.()
      if (createdAt) {
        const dias = Math.floor((now - createdAt) / 86400000)
        if (dias >= 1) alertas.push({ type: 'info', title: 'Cuenta en trial', message: `${nombre} lleva ${dias} día(s) en trial`, userId: d.id, date: createdAt })
      }
    }
  })
  const prioridad = { error: 0, warning: 1, info: 2 }
  alertas.sort((a, b) => prioridad[a.type] - prioridad[b.type])
  return alertas
}

const NOMBRE_METODO = { qpse: 'QPse', sunat_direct: 'SUNAT directo', none: 'Sin configurar' }
const NOMBRE_MODO = { retail: 'Retail', restaurant: 'Restaurante', pharmacy: 'Farmacia', real_estate: 'Inmobiliaria', transport: 'Transporte', hotel: 'Hotel', veterinary: 'Veterinaria', logistics: 'Logística', lending: 'Préstamos', unknown: 'No definido' }

function calcularAnalytics(subsSnap, negocios) {
  const emissionMethods = {}
  const businessModes = {}
  const documentsByUser = []
  let totalDocuments = 0
  subsSnap.forEach(d => {
    const data = d.data()
    if (data.ownerId) return
    const usage = data.usage?.invoicesThisMonth || 0
    totalDocuments += usage
    if (usage > 0) documentsByUser.push({ email: data.email, businessName: data.businessName, documents: usage })
    const negocio = negocios[d.id]
    if (negocio) {
      const metodo = metodoDeEmision(negocio)
      const clave = metodo && metodo !== 'none' ? metodo : 'none'
      emissionMethods[clave] = (emissionMethods[clave] || 0) + 1
      const modo = negocio.businessMode || 'unknown'
      businessModes[modo] = (businessModes[modo] || 0) + 1
    }
  })
  documentsByUser.sort((a, b) => b.documents - a.documents)
  const aLista = (obj, nombres) => Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, value]) => ({ name: nombres[k] || k, value }))
  return {
    emissionMethods: aLista(emissionMethods, NOMBRE_METODO),
    businessModes: aLista(businessModes, NOMBRE_MODO),
    topUsers: documentsByUser.slice(0, 10),
    totalDocuments,
  }
}

function calcularAdquisicion(landingSnap, bizSnap, days = 30) {
  const since = sumarDias(new Date(), -days)
  const sinceStr = since.toISOString().slice(0, 10)
  const visitsBySource = {}
  const visitsByMedium = {}
  const daily = []
  let totalVisits = 0
  landingSnap.forEach(d => {
    const data = d.data()
    if (data.date < sinceStr) return
    totalVisits += data.total || 0
    daily.push({ date: data.date, total: data.total || 0 })
    for (const [k, v] of Object.entries(data.bySource || {})) visitsBySource[k] = (visitsBySource[k] || 0) + v
    for (const [k, v] of Object.entries(data.byMedium || {})) visitsByMedium[k] = (visitsByMedium[k] || 0) + v
  })
  daily.sort((a, b) => a.date.localeCompare(b.date))

  const signupsBySource = {}
  let attributedSignups = 0, unmeasuredSignups = 0, signupsInRange = 0
  bizSnap.forEach(d => {
    const data = d.data()
    const created = data.createdAt?.toDate?.()
    if (!created || created < since) return
    signupsInRange++
    const src = data.acquisition?.source
    if (src) {
      signupsBySource[src] = (signupsBySource[src] || 0) + 1
      attributedSignups++
    } else unmeasuredSignups++
  })
  const aLista = obj => Object.entries(obj).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  return {
    totalVisits, daily,
    visitsBySource: aLista(visitsBySource),
    visitsByMedium: aLista(visitsByMedium),
    signupsBySource: aLista(signupsBySource),
    signupsInRange, attributedSignups, unmeasuredSignups,
    conversionRate: totalVisits > 0 ? (attributedSignups / totalVisits) * 100 : null,
    hasData: totalVisits > 0 || attributedSignups > 0,
    days,
  }
}

// Por plan (con origen y clase), por departamento y retencion. Excluye
// sub-usuarios (tienen ownerId) igual que la lista de Usuarios.
function calcularDetalle(subsSnap, negocios, usuarios) {
  const ahora = new Date()
  const porPlan = {}
  const porDepartamento = {}
  const totales = { total: 0, activos: 0, trial: 0, vencidos: 0, suspendidos: 0, archivados: 0, directo: 0, reseller: 0, vendedor: 0, legacy: 0 }
  let conPagos = 0, vigentes = 0, sinRenovar = 0, enPrimerPeriodo = 0, ingresos = 0, oportunidades = 0, renovaciones = 0

  subsSnap.forEach(d => {
    const data = d.data()
    if (data.ownerId || usuarios[d.id]?.ownerId) return
    const negocio = negocios[d.id] || {}
    const fin = data.currentPeriodEnd?.toDate?.() || null
    const archivado = data.archived === true
    // Mismo criterio que usa "Mi Suscripcion" para decidir de quien es la
    // cuenta. Mirando solo `resellerId` quedaban como DIRECTAS las que traen
    // `createdByReseller` sin el.
    const origen = origenDeCuenta(data)

    let estado = 'activos'
    if (data.status === 'suspended' || data.accessBlocked) estado = 'suspendidos'
    else if (data.plan === 'trial' || data.plan === 'free') estado = 'trial'
    else if (fin && fin < ahora) estado = 'vencidos'

    const planId = data.plan || 'desconocido'
    if (!porPlan[planId]) porPlan[planId] = { planId, total: 0, activos: 0, directo: 0, reseller: 0, vendedor: 0 }
    porPlan[planId].total++
    porPlan[planId][origen]++
    if (estado === 'activos') porPlan[planId].activos++

    if (archivado) {
      totales.archivados++
      return
    }
    totales.total++
    totales[estado]++
    totales[origen]++
    if (classifyPlan(planId) === 'legacy') totales.legacy++

    const dep = titulo(negocio.department) || 'Sin departamento'
    if (!porDepartamento[dep]) porDepartamento[dep] = { departamento: dep, total: 0, activos: 0, trial: 0, vencidos: 0, suspendidos: 0 }
    porDepartamento[dep].total++
    porDepartamento[dep][estado]++

    // Retencion: cada vencimiento es una oportunidad de renovar
    const pagos = data.paymentHistory || []
    if (pagos.length) {
      conPagos++
      for (const p of pagos) ingresos += p.amount || 0
      const vigente = fin && fin > ahora
      if (vigente) {
        vigentes++
        if (pagos.length === 1) enPrimerPeriodo++
      } else sinRenovar++
      const renovo = Math.max(0, pagos.length - 1)
      renovaciones += renovo
      oportunidades += renovo + (vigente ? 0 : 1)
    }
  })

  const candidatos = conPagos - enPrimerPeriodo
  const renovados = vigentes - enPrimerPeriodo
  return {
    planes: Object.values(porPlan)
      .map(r => ({ ...r, nombre: PLANS[r.planId]?.name || (r.planId === 'desconocido' ? '(sin plan)' : r.planId), precio: PLANS[r.planId]?.totalPrice, clase: classifyPlan(r.planId) }))
      .sort((a, b) => b.total - a.total),
    departamentos: Object.values(porDepartamento).sort((a, b) => b.total - a.total),
    retencion: {
      conPagos, vigentes, sinRenovar, enPrimerPeriodo, ingresos, candidatos, renovados, oportunidades, renovaciones,
      tasa: candidatos > 0 ? Math.round((renovados / candidatos) * 100) : null,
      tasaHistorica: oportunidades > 0 ? Math.round((renovaciones / oportunidades) * 100) : null,
    },
    totales,
  }
}

export async function resumenCompleto() {
  const [subsSnap, bizSnap, usersSnap, landingSnap, customPlans] = await Promise.all([
    getDocs(collection(db, 'subscriptions')),
    getDocs(collection(db, 'businesses')),
    getDocs(collection(db, 'users')),
    getDocs(query(collection(db, 'landingStats'), orderBy('date', 'desc'), limit(30))).catch(() => ({ forEach: () => {} })),
    getCustomPlans().catch(() => ({})),
  ])
  const negocios = {}
  bizSnap.forEach(d => { negocios[d.id] = d.data() })
  const usuarios = {}
  usersSnap.forEach(d => { usuarios[d.id] = d.data() })

  return {
    stats: calcularStats(subsSnap, customPlans),
    alertas: calcularAlertas(subsSnap),
    analytics: calcularAnalytics(subsSnap, negocios),
    adquisicion: calcularAdquisicion(landingSnap, bizSnap, 30),
    detalle: calcularDetalle(subsSnap, negocios, usuarios),
    lecturas: subsSnap.size + bizSnap.size + usersSnap.size + 30,
    calculadoEn: new Date(),
  }
}
