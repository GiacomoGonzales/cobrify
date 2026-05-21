import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore'

/**
 * Parsea una fecha string YYYY-MM-DD a Date en hora LOCAL (no UTC)
 * Esto evita el problema de timezone donde "2024-01-12" se interpreta como
 * medianoche UTC y en Perú (UTC-5) se muestra como 2024-01-11
 */
function parseLocalDate(dateValue) {
  if (dateValue instanceof Date) {
    return dateValue
  }
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const [year, month, day] = dateValue.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0) // Mediodía para evitar problemas
  }
  // Fallback para otros formatos
  return new Date(dateValue)
}

/**
 * Categorías de gastos por defecto.
 * Cada negocio puede personalizarlas en Settings → Categorías de Gastos.
 * Las defaults se usan como semilla cuando un negocio aún no tiene `expenseCategories`
 * en su doc de Firestore.
 *
 * Modelo: { id, name, description, icon, color, archived? }
 *   - id: string único. Para custom se genera UUID.
 *   - icon: nombre del componente lucide-react (ver CATEGORY_ICONS en Expenses.jsx)
 *   - color: hex para badges y gráficos
 *   - archived: si true, no aparece en selects pero conserva el historial
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'servicios', name: 'Servicios Básicos', description: 'Luz, agua, internet, teléfono', icon: 'Zap', color: '#F59E0B' },
  { id: 'alquiler', name: 'Alquiler de Local', description: 'Renta del local comercial', icon: 'Building', color: '#6366F1' },
  { id: 'proveedores', name: 'Proveedores / Mercadería', description: 'Compras de inventario', icon: 'Package', color: '#0EA5E9' },
  { id: 'gastos_ventas', name: 'Gastos de Ventas', description: 'Comisiones, empaques, delivery', icon: 'ShoppingBag', color: '#10B981' },
  { id: 'transporte', name: 'Transporte / Combustible', description: 'Delivery, gasolina', icon: 'Truck', color: '#8B5CF6' },
  { id: 'personal', name: 'Sueldos / Personal', description: 'Pagos a empleados', icon: 'Users', color: '#EC4899' },
  { id: 'impuestos', name: 'Impuestos', description: 'SUNAT, municipalidad', icon: 'FileText', color: '#EF4444' },
  { id: 'mantenimiento', name: 'Mantenimiento', description: 'Reparaciones, limpieza', icon: 'Wrench', color: '#14B8A6' },
  { id: 'marketing', name: 'Marketing / Publicidad', description: 'Redes sociales, volantes', icon: 'Megaphone', color: '#F97316' },
  { id: 'bancarios', name: 'Gastos Bancarios', description: 'Comisiones, ITF', icon: 'CreditCard', color: '#06B6D4' },
  { id: 'otros', name: 'Otros', description: 'Gastos varios', icon: 'MoreHorizontal', color: '#64748B' }
]

// Alias retrocompatible — no romper imports antiguos mientras se migran las páginas.
export const EXPENSE_CATEGORIES = DEFAULT_EXPENSE_CATEGORIES

/**
 * Obtener las categorías de gastos del negocio.
 * Si el negocio nunca personalizó, devuelve las defaults.
 * Retorna también las archived para preservar lookups de gastos históricos.
 */
export async function getExpenseCategories(userId) {
  try {
    const businessRef = doc(db, 'businesses', userId)
    const snap = await getDoc(businessRef)
    if (snap.exists()) {
      const data = snap.data()
      const custom = Array.isArray(data.expenseCategories) ? data.expenseCategories : null
      if (custom && custom.length > 0) {
        return { success: true, data: custom }
      }
    }
    return { success: true, data: DEFAULT_EXPENSE_CATEGORIES }
  } catch (error) {
    console.error('Error al obtener categorías de gastos:', error)
    return { success: false, error: error.message, data: DEFAULT_EXPENSE_CATEGORIES }
  }
}

/**
 * Guardar las categorías de gastos del negocio.
 * Sobrescribe la lista completa.
 */
export async function saveExpenseCategories(userId, categories) {
  try {
    const businessRef = doc(db, 'businesses', userId)
    await updateDoc(businessRef, {
      expenseCategories: categories,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al guardar categorías de gastos:', error)
    return { success: false, error: error.message }
  }
}

// Métodos de pago para gastos
export const EXPENSE_PAYMENT_METHODS = [
  { id: 'efectivo', name: 'Efectivo' },
  { id: 'transferencia', name: 'Transferencia' },
  { id: 'tarjeta', name: 'Tarjeta' },
  { id: 'yape', name: 'Yape' },
  { id: 'plin', name: 'Plin' }
]

/**
 * Obtener todos los gastos de un negocio
 */
export async function getExpenses(userId, filters = {}) {
  try {
    const expensesRef = collection(db, 'businesses', userId, 'expenses')
    let q = query(expensesRef, orderBy('date', 'desc'))

    const snapshot = await getDocs(q)
    let expenses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate?.() || new Date(doc.data().date),
      createdAt: doc.data().createdAt?.toDate?.() || new Date()
    }))

    // Filtrar por rango de fechas si se especifica
    // Usar parseLocalDate para evitar problemas de timezone con fechas YYYY-MM-DD
    if (filters.startDate) {
      const start = parseLocalDate(filters.startDate)
      start.setHours(0, 0, 0, 0)
      expenses = expenses.filter(e => e.date >= start)
    }

    if (filters.endDate) {
      const end = parseLocalDate(filters.endDate)
      end.setHours(23, 59, 59, 999)
      expenses = expenses.filter(e => e.date <= end)
    }

    // Filtrar por categoría
    if (filters.category && filters.category !== 'all') {
      expenses = expenses.filter(e => e.category === filters.category)
    }

    // Filtrar por método de pago
    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      expenses = expenses.filter(e => e.paymentMethod === filters.paymentMethod)
    }

    return expenses
  } catch (error) {
    console.error('Error al obtener gastos:', error)
    throw error
  }
}

/**
 * Crear un nuevo gasto.
 *
 * Si se pasa `clientRequestId` en expenseData, se usa como ID del documento
 * (idempotencia: múltiples llamadas con el mismo id sobrescriben en lugar de duplicar).
 * Esto es crítico para el caso offline donde el usuario puede hacer click varias veces
 * y la SDK de Firestore encola cada write hasta que vuelva la conexión.
 *
 * Si no se pasa, cae al comportamiento legacy con addDoc (ID auto-generado por Firestore).
 */
export async function createExpense(userId, expenseData) {
  try {
    const expensesRef = collection(db, 'businesses', userId, 'expenses')

    const amount = parseFloat(expenseData.amount)
    const newExpense = {
      amount,
      description: expenseData.description?.trim() || '',
      category: expenseData.category,
      // Usar parseLocalDate para evitar problemas de timezone con fechas YYYY-MM-DD
      date: Timestamp.fromDate(parseLocalDate(expenseData.date)),
      paymentMethod: expenseData.paymentMethod || 'efectivo',
      reference: expenseData.reference?.trim() || '',
      supplier: expenseData.supplier?.trim() || '',
      notes: expenseData.notes?.trim() || '',
      createdAt: Timestamp.now(),
      createdBy: expenseData.createdBy || 'unknown'
    }

    // Multi-divisa: solo se guarda currency/exchangeRate cuando el gasto
    // es en USD. Los gastos PEN-only (99% de casos) quedan sin estos
    // campos para mantener docs legacy idénticos.
    if (expenseData.currency === 'USD') {
      const rate = Number(expenseData.exchangeRate) || 1
      newExpense.currency = 'USD'
      newExpense.exchangeRate = rate
      newExpense.amountInBase = Number((amount * rate).toFixed(2))
    }

    let docId
    if (expenseData.clientRequestId) {
      docId = expenseData.clientRequestId
      const expenseRef = doc(expensesRef, docId)
      await setDoc(expenseRef, newExpense)
    } else {
      const docRef = await addDoc(expensesRef, newExpense)
      docId = docRef.id
    }

    return {
      id: docId,
      ...newExpense,
      date: newExpense.date.toDate(),
      createdAt: newExpense.createdAt.toDate()
    }
  } catch (error) {
    console.error('Error al crear gasto:', error)
    throw error
  }
}

/**
 * Actualizar un gasto existente
 */
export async function updateExpense(userId, expenseId, expenseData) {
  try {
    const expenseRef = doc(db, 'businesses', userId, 'expenses', expenseId)

    const amount = parseFloat(expenseData.amount)
    const updateData = {
      amount,
      description: expenseData.description?.trim() || '',
      category: expenseData.category,
      // Usar parseLocalDate para evitar problemas de timezone con fechas YYYY-MM-DD
      date: Timestamp.fromDate(parseLocalDate(expenseData.date)),
      paymentMethod: expenseData.paymentMethod || 'efectivo',
      reference: expenseData.reference?.trim() || '',
      supplier: expenseData.supplier?.trim() || '',
      notes: expenseData.notes?.trim() || '',
      updatedAt: Timestamp.now()
    }

    // Multi-divisa: si viene como USD, persistir; si viene como PEN o sin
    // currency, limpiar los campos USD por si el gasto se editó desde
    // USD a PEN.
    if (expenseData.currency === 'USD') {
      const rate = Number(expenseData.exchangeRate) || 1
      updateData.currency = 'USD'
      updateData.exchangeRate = rate
      updateData.amountInBase = Number((amount * rate).toFixed(2))
    } else {
      const { deleteField } = await import('firebase/firestore')
      updateData.currency = deleteField()
      updateData.exchangeRate = deleteField()
      updateData.amountInBase = deleteField()
    }

    await updateDoc(expenseRef, updateData)

    return {
      id: expenseId,
      ...updateData,
      date: updateData.date.toDate(),
      updatedAt: updateData.updatedAt.toDate()
    }
  } catch (error) {
    console.error('Error al actualizar gasto:', error)
    throw error
  }
}

/**
 * Eliminar un gasto
 */
export async function deleteExpense(userId, expenseId) {
  try {
    const expenseRef = doc(db, 'businesses', userId, 'expenses', expenseId)
    await deleteDoc(expenseRef)
    return true
  } catch (error) {
    console.error('Error al eliminar gasto:', error)
    throw error
  }
}

/**
 * Obtener resumen de gastos por categoría
 */
export async function getExpensesSummary(userId, startDate, endDate) {
  try {
    const expenses = await getExpenses(userId, { startDate, endDate })

    // Agrupar por categoría
    const byCategory = expenses.reduce((acc, expense) => {
      const cat = expense.category || 'otros'
      if (!acc[cat]) {
        acc[cat] = { total: 0, count: 0 }
      }
      acc[cat].total += expense.amount
      acc[cat].count += 1
      return acc
    }, {})

    // Agrupar por método de pago
    const byPaymentMethod = expenses.reduce((acc, expense) => {
      const method = expense.paymentMethod || 'efectivo'
      if (!acc[method]) {
        acc[method] = { total: 0, count: 0 }
      }
      acc[method].total += expense.amount
      acc[method].count += 1
      return acc
    }, {})

    // Total general
    const total = expenses.reduce((sum, e) => sum + e.amount, 0)

    return {
      total,
      count: expenses.length,
      byCategory,
      byPaymentMethod,
      expenses
    }
  } catch (error) {
    console.error('Error al obtener resumen de gastos:', error)
    throw error
  }
}
