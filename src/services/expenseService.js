import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore'

// Categorías de gastos predefinidas
export const EXPENSE_CATEGORIES = [
  { id: 'servicios', name: 'Servicios Básicos', description: 'Luz, agua, internet, teléfono', icon: 'Zap' },
  { id: 'alquiler', name: 'Alquiler de Local', description: 'Renta del local comercial', icon: 'Building' },
  { id: 'proveedores', name: 'Proveedores / Mercadería', description: 'Compras de inventario', icon: 'Package' },
  { id: 'gastos_ventas', name: 'Gastos de Ventas', description: 'Comisiones, empaques, delivery', icon: 'ShoppingBag' },
  { id: 'transporte', name: 'Transporte / Combustible', description: 'Delivery, gasolina', icon: 'Truck' },
  { id: 'personal', name: 'Sueldos / Personal', description: 'Pagos a empleados', icon: 'Users' },
  { id: 'impuestos', name: 'Impuestos', description: 'SUNAT, municipalidad', icon: 'FileText' },
  { id: 'mantenimiento', name: 'Mantenimiento', description: 'Reparaciones, limpieza', icon: 'Wrench' },
  { id: 'marketing', name: 'Marketing / Publicidad', description: 'Redes sociales, volantes', icon: 'Megaphone' },
  { id: 'bancarios', name: 'Gastos Bancarios', description: 'Comisiones, ITF', icon: 'CreditCard' },
  { id: 'otros', name: 'Otros', description: 'Gastos varios', icon: 'MoreHorizontal' }
]

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
    if (filters.startDate) {
      const start = new Date(filters.startDate)
      start.setHours(0, 0, 0, 0)
      expenses = expenses.filter(e => e.date >= start)
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate)
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
 * Crear un nuevo gasto
 */
export async function createExpense(userId, expenseData) {
  try {
    const expensesRef = collection(db, 'businesses', userId, 'expenses')

    const newExpense = {
      amount: parseFloat(expenseData.amount),
      description: expenseData.description?.trim() || '',
      category: expenseData.category,
      date: expenseData.date instanceof Date
        ? Timestamp.fromDate(expenseData.date)
        : Timestamp.fromDate(new Date(expenseData.date)),
      paymentMethod: expenseData.paymentMethod || 'efectivo',
      reference: expenseData.reference?.trim() || '',
      supplier: expenseData.supplier?.trim() || '',
      notes: expenseData.notes?.trim() || '',
      createdAt: Timestamp.now(),
      createdBy: expenseData.createdBy || 'unknown'
    }

    const docRef = await addDoc(expensesRef, newExpense)

    return {
      id: docRef.id,
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

    const updateData = {
      amount: parseFloat(expenseData.amount),
      description: expenseData.description?.trim() || '',
      category: expenseData.category,
      date: expenseData.date instanceof Date
        ? Timestamp.fromDate(expenseData.date)
        : Timestamp.fromDate(new Date(expenseData.date)),
      paymentMethod: expenseData.paymentMethod || 'efectivo',
      reference: expenseData.reference?.trim() || '',
      supplier: expenseData.supplier?.trim() || '',
      notes: expenseData.notes?.trim() || '',
      updatedAt: Timestamp.now()
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
