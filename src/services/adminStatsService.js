import { db } from '@/lib/firebase'
import {
  collection,
  query,
  getDocs,
  where,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore'
import { PLANS } from './subscriptionService'

/**
 * Obtiene estadísticas generales del sistema
 */
export async function getAdminStats() {
  try {
    const subscriptionsRef = collection(db, 'subscriptions')
    const subscriptionsSnapshot = await getDocs(subscriptionsRef)

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    let totalUsers = 0
    let activeUsers = 0
    let suspendedUsers = 0
    let trialUsers = 0
    let newThisMonth = 0
    let newLastMonth = 0
    let mrr = 0
    let totalRevenue = 0
    let expiringThisWeek = 0
    const usersByPlan = {}
    const recentPayments = []
    const recentUsers = []
    const monthlyGrowth = {}

    // Inicializar usersByPlan con todos los planes
    Object.keys(PLANS).forEach(planKey => {
      usersByPlan[planKey] = 0
    })

    subscriptionsSnapshot.forEach(doc => {
      const data = doc.data()

      // Excluir sub-usuarios
      if (data.ownerId) return

      totalUsers++

      // Estado
      if (data.status === 'suspended' || data.accessBlocked) {
        suspendedUsers++
      } else if (data.plan === 'trial' || data.plan === 'free') {
        trialUsers++
      } else {
        activeUsers++
      }

      // Por plan
      const plan = data.plan || 'unknown'
      usersByPlan[plan] = (usersByPlan[plan] || 0) + 1

      // MRR (Monthly Recurring Revenue)
      if (data.status === 'active' && !data.accessBlocked && PLANS[data.plan]) {
        mrr += PLANS[data.plan].pricePerMonth || 0
      }

      // Nuevos este mes
      const createdAt = data.createdAt?.toDate?.() || data.startDate?.toDate?.()
      if (createdAt) {
        if (createdAt >= startOfMonth) {
          newThisMonth++
        } else if (createdAt >= startOfLastMonth && createdAt <= endOfLastMonth) {
          newLastMonth++
        }

        // Para gráfico de crecimiento
        const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`
        monthlyGrowth[monthKey] = (monthlyGrowth[monthKey] || 0) + 1

        // Usuarios recientes
        if (createdAt >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) {
          recentUsers.push({
            id: doc.id,
            email: data.email,
            businessName: data.businessName,
            plan: data.plan,
            createdAt
          })
        }
      }

      // Por vencer esta semana
      const periodEnd = data.currentPeriodEnd?.toDate?.()
      if (periodEnd) {
        const daysUntilExpiry = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24))
        if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) {
          expiringThisWeek++
        }
      }

      // Historial de pagos
      if (data.paymentHistory && Array.isArray(data.paymentHistory)) {
        data.paymentHistory.forEach(payment => {
          const paymentDate = payment.date?.toDate?.() || new Date(payment.date)
          totalRevenue += payment.amount || 0

          // Pagos recientes (último mes)
          if (paymentDate >= startOfMonth) {
            recentPayments.push({
              ...payment,
              userId: doc.id,
              email: data.email,
              businessName: data.businessName,
              date: paymentDate
            })
          }
        })
      }
    })

    // Ordenar usuarios recientes
    recentUsers.sort((a, b) => b.createdAt - a.createdAt)

    // Ordenar pagos recientes
    recentPayments.sort((a, b) => b.date - a.date)

    // Calcular crecimiento
    const growthRate = newLastMonth > 0
      ? ((newThisMonth - newLastMonth) / newLastMonth * 100).toFixed(1)
      : newThisMonth > 0 ? 100 : 0

    // Tasa de conversión (trial a pago)
    const conversionRate = trialUsers > 0
      ? ((activeUsers / (activeUsers + trialUsers)) * 100).toFixed(1)
      : 0

    // Preparar datos para gráfico de crecimiento mensual
    const growthChartData = prepareGrowthChartData(monthlyGrowth)

    // Preparar datos para gráfico de distribución por plan
    const planDistribution = Object.entries(usersByPlan)
      .filter(([_, count]) => count > 0)
      .map(([plan, count]) => ({
        name: PLANS[plan]?.name || plan,
        value: count,
        plan
      }))

    return {
      totalUsers,
      activeUsers,
      suspendedUsers,
      trialUsers,
      newThisMonth,
      newLastMonth,
      growthRate: parseFloat(growthRate),
      mrr,
      totalRevenue,
      expiringThisWeek,
      conversionRate: parseFloat(conversionRate),
      usersByPlan,
      planDistribution,
      recentPayments: recentPayments.slice(0, 10),
      recentUsers: recentUsers.slice(0, 10),
      growthChartData
    }
  } catch (error) {
    console.error('Error al obtener estadísticas:', error)
    throw error
  }
}

/**
 * Prepara datos para el gráfico de crecimiento mensual
 */
function prepareGrowthChartData(monthlyGrowth) {
  const months = []
  const now = new Date()

  // Últimos 12 meses
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

    months.push({
      month: monthNames[date.getMonth()],
      year: date.getFullYear(),
      key,
      nuevos: monthlyGrowth[key] || 0
    })
  }

  // Calcular acumulado
  let accumulated = 0
  months.forEach(m => {
    accumulated += m.nuevos
    m.total = accumulated
  })

  return months
}

/**
 * Obtiene todos los pagos con filtros
 */
export async function getAllPayments(filters = {}) {
  try {
    const subscriptionsRef = collection(db, 'subscriptions')
    const subscriptionsSnapshot = await getDocs(subscriptionsRef)

    const allPayments = []

    subscriptionsSnapshot.forEach(doc => {
      const data = doc.data()
      if (data.ownerId) return // Excluir sub-usuarios

      if (data.paymentHistory && Array.isArray(data.paymentHistory)) {
        data.paymentHistory.forEach((payment, index) => {
          const paymentDate = payment.date?.toDate?.() || new Date(payment.date)

          allPayments.push({
            id: `${doc.id}-${index}`,
            oderId: doc.id,
            email: data.email,
            businessName: data.businessName,
            amount: payment.amount || 0,
            method: payment.method || 'N/A',
            plan: payment.plan || data.plan,
            status: payment.status || 'completed',
            date: paymentDate,
            notes: payment.notes || ''
          })
        })
      }
    })

    // Aplicar filtros
    let filtered = allPayments

    if (filters.startDate) {
      filtered = filtered.filter(p => p.date >= new Date(filters.startDate))
    }

    if (filters.endDate) {
      filtered = filtered.filter(p => p.date <= new Date(filters.endDate))
    }

    if (filters.method && filters.method !== 'all') {
      filtered = filtered.filter(p => p.method === filters.method)
    }

    if (filters.search) {
      const search = filters.search.toLowerCase()
      filtered = filtered.filter(p =>
        p.email?.toLowerCase().includes(search) ||
        p.businessName?.toLowerCase().includes(search)
      )
    }

    // Ordenar por fecha descendente
    filtered.sort((a, b) => b.date - a.date)

    // Calcular totales
    const totalAmount = filtered.reduce((sum, p) => sum + p.amount, 0)
    const totalCount = filtered.length

    return {
      payments: filtered,
      totalAmount,
      totalCount
    }
  } catch (error) {
    console.error('Error al obtener pagos:', error)
    throw error
  }
}

/**
 * Obtiene datos para analytics
 */
export async function getAnalyticsData() {
  try {
    const subscriptionsRef = collection(db, 'subscriptions')
    const subscriptionsSnapshot = await getDocs(subscriptionsRef)

    const emissionMethods = { qpse: 0, sunat_direct: 0, nubefact: 0, none: 0 }
    const businessModes = { retail: 0, restaurant: 0, unknown: 0 }
    const documentsByUser = []
    let totalDocuments = 0

    // También obtener datos de businesses para métodos de emisión
    for (const doc of subscriptionsSnapshot.docs) {
      const data = doc.data()
      if (data.ownerId) continue

      // Uso de documentos
      const usage = data.usage?.invoicesThisMonth || 0
      totalDocuments += usage

      if (usage > 0) {
        documentsByUser.push({
          email: data.email,
          businessName: data.businessName,
          documents: usage
        })
      }

      // Intentar obtener datos del negocio
      try {
        const businessRef = collection(db, 'businesses')
        const businessQuery = query(businessRef, where('__name__', '==', doc.id))
        const businessSnapshot = await getDocs(businessQuery)

        if (!businessSnapshot.empty) {
          const businessData = businessSnapshot.docs[0].data()

          // Método de emisión
          const method = businessData.emissionMethod || 'none'
          emissionMethods[method] = (emissionMethods[method] || 0) + 1

          // Modo de negocio
          const mode = businessData.businessMode || 'unknown'
          businessModes[mode] = (businessModes[mode] || 0) + 1
        }
      } catch (e) {
        // Ignorar errores de business individual
      }
    }

    // Ordenar por documentos
    documentsByUser.sort((a, b) => b.documents - a.documents)

    return {
      emissionMethods: Object.entries(emissionMethods)
        .filter(([_, v]) => v > 0)
        .map(([name, value]) => ({ name: formatMethodName(name), value })),
      businessModes: Object.entries(businessModes)
        .filter(([_, v]) => v > 0)
        .map(([name, value]) => ({ name: formatModeName(name), value })),
      topUsers: documentsByUser.slice(0, 10),
      totalDocuments
    }
  } catch (error) {
    console.error('Error al obtener analytics:', error)
    throw error
  }
}

function formatMethodName(method) {
  const names = {
    qpse: 'QPse',
    sunat_direct: 'SUNAT Directo',
    nubefact: 'NubeFact',
    none: 'Sin configurar'
  }
  return names[method] || method
}

function formatModeName(mode) {
  const names = {
    retail: 'Retail/Comercio',
    restaurant: 'Restaurante',
    unknown: 'No definido'
  }
  return names[mode] || mode
}

/**
 * Obtiene alertas del sistema
 */
export async function getSystemAlerts() {
  try {
    const subscriptionsRef = collection(db, 'subscriptions')
    const subscriptionsSnapshot = await getDocs(subscriptionsRef)

    const alerts = []
    const now = new Date()

    subscriptionsSnapshot.forEach(doc => {
      const data = doc.data()
      if (data.ownerId) return

      const periodEnd = data.currentPeriodEnd?.toDate?.()
      if (periodEnd) {
        const daysUntilExpiry = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24))

        // Vence en 3 días o menos
        if (daysUntilExpiry > 0 && daysUntilExpiry <= 3) {
          alerts.push({
            type: 'warning',
            title: 'Suscripción por vencer',
            message: `${data.businessName || data.email} vence en ${daysUntilExpiry} día(s)`,
            userId: doc.id,
            date: periodEnd
          })
        }

        // Ya vencido
        if (daysUntilExpiry < 0 && daysUntilExpiry > -7) {
          alerts.push({
            type: 'error',
            title: 'Suscripción vencida',
            message: `${data.businessName || data.email} venció hace ${Math.abs(daysUntilExpiry)} día(s)`,
            userId: doc.id,
            date: periodEnd
          })
        }
      }

      // Usuarios en trial
      if (data.plan === 'trial' || data.plan === 'free') {
        const createdAt = data.createdAt?.toDate?.() || data.startDate?.toDate?.()
        if (createdAt) {
          const daysInTrial = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24))
          if (daysInTrial >= 1) {
            alerts.push({
              type: 'info',
              title: 'Usuario en trial',
              message: `${data.businessName || data.email} lleva ${daysInTrial} día(s) en trial`,
              userId: doc.id,
              date: createdAt
            })
          }
        }
      }
    })

    // Ordenar por prioridad (error > warning > info)
    const priority = { error: 0, warning: 1, info: 2 }
    alerts.sort((a, b) => priority[a.type] - priority[b.type])

    return alerts
  } catch (error) {
    console.error('Error al obtener alertas:', error)
    throw error
  }
}
