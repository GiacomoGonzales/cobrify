import React, { useState, useEffect, useMemo } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getInvoices, getPurchases, getLoans, getAllCashMovements, getFinancialMovements, createFinancialMovement, deleteFinancialMovement } from '@/services/firestoreService'
import { getExpenses, EXPENSE_CATEGORIES } from '@/services/expenseService'
import { getActiveBranches } from '@/services/branchService'
import { getWarehouses } from '@/services/warehouseService'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  RefreshCw,
  Download,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  AlertCircle,
  DollarSign,
  ShoppingCart,
  FileText,
  Users,
  Truck,
  Zap,
  Building,
  Package,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Loader2,
  Landmark,
  Plus,
  X,
  Banknote,
  CreditCard,
  Smartphone,
  PiggyBank,
  LogOut,
  Home,
  Trash2,
  Store
} from 'lucide-react'
import * as XLSX from 'xlsx'

// Datos demo
const DEMO_DATA = {
  invoices: [
    { id: '1', total: 1500, paymentStatus: 'paid', createdAt: { seconds: Date.now() / 1000 - 86400 }, customer: { name: 'Juan Pérez' }, paymentHistory: [{ amount: 1500, date: new Date() }] },
    { id: '2', total: 2300, paymentStatus: 'paid', createdAt: { seconds: Date.now() / 1000 - 86400 * 2 }, customer: { name: 'María García' }, paymentHistory: [{ amount: 2300, date: new Date() }] },
    { id: '3', total: 800, paymentStatus: 'pending', createdAt: { seconds: Date.now() / 1000 - 86400 * 3 }, customer: { name: 'Carlos López' }, paymentHistory: [] },
    { id: '4', total: 3500, paymentStatus: 'partial', createdAt: { seconds: Date.now() / 1000 - 86400 * 4 }, customer: { name: 'Ana Rodríguez' }, paymentHistory: [{ amount: 2000, date: new Date() }] },
    { id: '5', total: 1200, paymentStatus: 'paid', createdAt: { seconds: Date.now() / 1000 - 86400 * 5 }, customer: { name: 'Pedro Sánchez' }, paymentHistory: [{ amount: 1200, date: new Date() }] },
  ],
  expenses: [
    { id: '1', amount: 350, description: 'Pago de luz', category: 'servicios', date: new Date(Date.now() - 86400000 * 2) },
    { id: '2', amount: 180, description: 'Servicio de agua', category: 'servicios', date: new Date(Date.now() - 86400000 * 3) },
    { id: '3', amount: 1500, description: 'Alquiler del local', category: 'otros', date: new Date(Date.now() - 86400000 * 5) },
    { id: '4', amount: 2500, description: 'Sueldos personal', category: 'personal', date: new Date(Date.now() - 86400000 * 7) },
    { id: '5', amount: 450, description: 'Mantenimiento equipos', category: 'mantenimiento', date: new Date(Date.now() - 86400000 * 10) },
  ],
  purchases: [
    { id: '1', total: 3500, paymentStatus: 'paid', paymentType: 'contado', createdAt: { seconds: Date.now() / 1000 - 86400 * 3 }, supplier: { name: 'Distribuidora ABC' } },
    { id: '2', total: 2800, paymentStatus: 'pending', paymentType: 'credito', paidAmount: 0, dueDate: new Date(Date.now() + 86400000 * 15), createdAt: { seconds: Date.now() / 1000 - 86400 * 5 }, supplier: { name: 'Proveedor XYZ' } },
    { id: '3', total: 1200, paymentStatus: 'paid', paymentType: 'contado', createdAt: { seconds: Date.now() / 1000 - 86400 * 8 }, supplier: { name: 'Comercial Lima' } },
  ],
  cashMovements: [
    { id: '1', type: 'income', amount: 500, description: 'Préstamo recibido', category: 'Préstamo', createdAt: { seconds: Date.now() / 1000 - 86400 * 2 } },
    { id: '2', type: 'income', amount: 300, description: 'Cobro de deuda antigua', category: 'Cobro a Cliente', createdAt: { seconds: Date.now() / 1000 - 86400 * 4 } },
    { id: '3', type: 'expense', amount: 200, description: 'Pago de préstamo', category: 'Pago de Deuda', createdAt: { seconds: Date.now() / 1000 - 86400 * 6 } },
  ],
  loans: [
    {
      id: '1',
      type: 'bank',
      lenderName: 'Banco de Crédito',
      amount: 10000,
      status: 'active',
      createdAt: { seconds: Date.now() / 1000 - 86400 * 30 },
      installments: [
        { number: 1, amount: 2000, status: 'paid', paidAt: new Date(Date.now() - 86400000 * 25).toISOString(), paidAmount: 2000 },
        { number: 2, amount: 2000, status: 'paid', paidAt: new Date(Date.now() - 86400000 * 15).toISOString(), paidAmount: 2000 },
        { number: 3, amount: 2000, status: 'pending', dueDate: new Date(Date.now() + 86400000 * 15).toISOString() },
        { number: 4, amount: 2000, status: 'pending', dueDate: new Date(Date.now() + 86400000 * 45).toISOString() },
        { number: 5, amount: 2000, status: 'pending', dueDate: new Date(Date.now() + 86400000 * 75).toISOString() },
      ]
    },
    {
      id: '2',
      type: 'third_party',
      lenderName: 'Juan Pérez',
      amount: 5000,
      status: 'active',
      createdAt: { seconds: Date.now() / 1000 - 86400 * 20 },
      installments: [
        { number: 1, amount: 1000, status: 'paid', paidAt: new Date(Date.now() - 86400000 * 10).toISOString(), paidAmount: 1000 },
        { number: 2, amount: 1000, status: 'pending', dueDate: new Date(Date.now() + 86400000 * 20).toISOString() },
        { number: 3, amount: 1000, status: 'pending', dueDate: new Date(Date.now() + 86400000 * 50).toISOString() },
        { number: 4, amount: 1000, status: 'pending', dueDate: new Date(Date.now() + 86400000 * 80).toISOString() },
        { number: 5, amount: 1000, status: 'pending', dueDate: new Date(Date.now() + 86400000 * 110).toISOString() },
      ]
    }
  ]
}

// Obtener fecha local en formato YYYY-MM-DD
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Parsear fecha YYYY-MM-DD a Date en hora LOCAL (evita problema de timezone)
// "2024-01-12" con new Date() se interpreta como UTC, causando día incorrecto en Perú (UTC-5)
const parseLocalDate = (dateValue) => {
  if (dateValue instanceof Date) return dateValue
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const [year, month, day] = dateValue.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0) // Mediodía para evitar problemas
  }
  return new Date(dateValue)
}

// Convertir Timestamp de Firestore a Date
const toDate = (timestamp) => {
  if (!timestamp) return null
  if (timestamp instanceof Date) return timestamp
  if (timestamp.toDate) return timestamp.toDate()
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000)
  return new Date(timestamp)
}

// Verificar si una fecha está en el rango
const isInDateRange = (date, startDate, endDate) => {
  if (!date) return false
  const d = toDate(date)
  if (!d) return false
  // Usar parseLocalDate para evitar problemas de timezone con fechas YYYY-MM-DD
  const start = parseLocalDate(startDate)
  start.setHours(0, 0, 0, 0)
  const end = parseLocalDate(endDate)
  end.setHours(23, 59, 59, 999)
  return d >= start && d <= end
}

// Verificar si un movimiento financiero está en el rango (usa dateString para evitar problemas de zona horaria)
const isFinancialMovementInRange = (movement, startDate, endDate) => {
  // Si tiene dateString, comparar directamente (más confiable)
  if (movement.dateString) {
    return movement.dateString >= startDate && movement.dateString <= endDate
  }
  // Fallback a comparación de fechas
  return isInDateRange(movement.date || movement.createdAt, startDate, endDate)
}

// Iconos por categoría de egreso
const CATEGORY_ICONS = {
  servicios: Zap,
  proveedores: Package,
  transporte: Truck,
  personal: Users,
  impuestos: FileText,
  mantenimiento: Building,
  marketing: TrendingUp,
  bancarios: Building,
  otros: MoreHorizontal,
  compras: ShoppingCart
}

// Categorías de movimientos financieros (Flujo de Caja)
const FINANCIAL_CATEGORIES = {
  income: [
    { id: 'aporte_capital', name: 'Aporte de Capital', icon: PiggyBank },
    { id: 'venta_activo', name: 'Venta de Activo', icon: Home },
    { id: 'dividendos_recibidos', name: 'Dividendos Recibidos', icon: TrendingUp },
    { id: 'otros_ingresos', name: 'Otros Ingresos', icon: DollarSign },
  ],
  expense: [
    { id: 'retiro_dueno', name: 'Retiro del Dueño', icon: LogOut },
    { id: 'compra_activo', name: 'Compra de Activo', icon: Home },
    { id: 'dividendos_pagados', name: 'Dividendos Pagados', icon: TrendingDown },
    { id: 'otros_egresos', name: 'Otros Egresos', icon: DollarSign },
  ]
}

// Métodos de pago
const PAYMENT_METHODS = [
  { id: 'efectivo', name: 'Efectivo', icon: Banknote },
  { id: 'transferencia', name: 'Transferencia', icon: CreditCard },
  { id: 'yape', name: 'Yape', icon: Smartphone },
  { id: 'plin', name: 'Plin', icon: Smartphone },
]

export default function CashFlow() {
  const { user, isDemoMode } = useAppContext()
  const toast = useToast()

  // Estados
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState([])
  const [expenses, setExpenses] = useState([])
  const [purchases, setPurchases] = useState([])
  const [cashMovements, setCashMovements] = useState([])
  const [loans, setLoans] = useState([])
  const [financialMovements, setFinancialMovements] = useState([])

  // Sucursales
  const [branches, setBranches] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [branchFilter, setBranchFilter] = useState('all') // 'all', 'main', or branch.id

  // Modal de nuevo movimiento
  const [showModal, setShowModal] = useState(false)
  const [savingMovement, setSavingMovement] = useState(false)
  const [newMovement, setNewMovement] = useState({
    type: 'income',
    category: '',
    amount: '',
    description: '',
    paymentMethod: 'efectivo',
    date: getLocalDateString(),
    branchId: ''
  })

  const [selectedPeriod, setSelectedPeriod] = useState('monthly')
  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    endDate: getLocalDateString()
  })

  // Calcular fechas según período seleccionado
  function setPeriod(period) {
    setSelectedPeriod(period)
    const today = new Date()
    let startDate, endDate

    switch (period) {
      case 'daily':
        startDate = getLocalDateString(today)
        endDate = getLocalDateString(today)
        break
      case 'weekly':
        const dayOfWeek = today.getDay()
        const monday = new Date(today)
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
        startDate = getLocalDateString(monday)
        endDate = getLocalDateString(today)
        break
      case 'monthly':
        startDate = getLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1))
        endDate = getLocalDateString(today)
        break
      case 'yearly':
        startDate = getLocalDateString(new Date(today.getFullYear(), 0, 1))
        endDate = getLocalDateString(today)
        break
      case 'custom':
        // No cambiar fechas, dejar que el usuario las seleccione
        return
      default:
        return
    }

    setDateRange({ startDate, endDate })
  }

  const [expandedSection, setExpandedSection] = useState({
    ingresos: true,
    egresos: true,
    proyecciones: true
  })

  // Cargar datos
  useEffect(() => {
    if (user?.uid) {
      loadData()
    }
  }, [user?.uid, dateRange])

  async function loadData() {
    setLoading(true)
    try {
      if (isDemoMode) {
        await new Promise(resolve => setTimeout(resolve, 500))
        setInvoices(DEMO_DATA.invoices)
        setExpenses(DEMO_DATA.expenses)
        setPurchases(DEMO_DATA.purchases)
        setCashMovements(DEMO_DATA.cashMovements)
        setLoans(DEMO_DATA.loans)
        setLoading(false)
        return
      }

      const [invoicesRes, expensesData, purchasesRes, loansRes, cashMovementsRes, financialRes, branchesRes, warehousesRes] = await Promise.all([
        getInvoices(user.uid),
        getExpenses(user.uid, { startDate: dateRange.startDate, endDate: dateRange.endDate }),
        getPurchases(user.uid),
        getLoans(user.uid),
        getAllCashMovements(user.uid),
        getFinancialMovements(user.uid),
        getActiveBranches(user.uid),
        getWarehouses(user.uid)
      ])

      if (invoicesRes.success) {
        console.log('Facturas cargadas:', invoicesRes.data?.length || 0)
        setInvoices(invoicesRes.data || [])
      }
      setExpenses(expensesData || [])
      if (purchasesRes.success) {
        console.log('Compras cargadas:', purchasesRes.data?.length || 0)
        setPurchases(purchasesRes.data || [])
      }
      if (loansRes.success) {
        console.log('Préstamos cargados:', loansRes.data?.length || 0)
        setLoans(loansRes.data || [])
      }
      if (cashMovementsRes.success) {
        console.log('Movimientos de caja cargados:', cashMovementsRes.data?.length || 0)
        setCashMovements(cashMovementsRes.data || [])
      }
      if (financialRes.success) {
        console.log('Movimientos financieros cargados:', financialRes.data?.length || 0)
        setFinancialMovements(financialRes.data || [])
      }

      if (branchesRes.success) {
        setBranches(branchesRes.data || [])
      }

      if (warehousesRes.success) {
        const activeWarehouses = (warehousesRes.data || []).filter(w => w.isActive !== false)
        setWarehouses(activeWarehouses)
      }

    } catch (error) {
      console.error('Error cargando datos:', error)
      toast.error('Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  // Helper: Obtener IDs de almacenes para una sucursal
  const getWarehouseIdsForBranch = useMemo(() => {
    if (branchFilter === 'all') return null // No filtrar
    if (branchFilter === 'main') {
      return warehouses.filter(w => !w.branchId).map(w => w.id)
    }
    return warehouses.filter(w => w.branchId === branchFilter).map(w => w.id)
  }, [warehouses, branchFilter])

  // Helper: Filtrar por sucursal según el tipo de documento
  const filterByBranch = (item, type) => {
    if (branchFilter === 'all') return true

    switch (type) {
      case 'invoice':
        // Facturas: filtrar por branchId
        if (branchFilter === 'main') {
          return !item.branchId || item.branchId === 'main'
        }
        return item.branchId === branchFilter

      case 'expense':
        // Gastos: filtrar por branchId
        if (branchFilter === 'main') {
          return !item.branchId || item.branchId === '' || item.branchId === 'main'
        }
        return item.branchId === branchFilter

      case 'purchase':
        // Compras: filtrar por warehouseId
        const purchaseWarehouseId = item.warehouseId || item.items?.[0]?.warehouseId
        if (!purchaseWarehouseId) {
          return branchFilter === 'main'
        }
        return getWarehouseIdsForBranch?.includes(purchaseWarehouseId)

      case 'cashMovement':
      case 'financialMovement':
        // Movimientos: filtrar por branchId
        if (branchFilter === 'main') {
          return !item.branchId || item.branchId === '' || item.branchId === 'main'
        }
        return item.branchId === branchFilter

      case 'loan':
        // Préstamos: filtrar por branchId
        if (branchFilter === 'main') {
          return !item.branchId || item.branchId === '' || item.branchId === 'main'
        }
        return item.branchId === branchFilter

      default:
        return true
    }
  }

  // Calcular flujo de caja
  const cashFlowData = useMemo(() => {
    // INGRESOS
    // 1. Ventas pagadas (filtradas por fecha y sucursal)
    // Las facturas usan 'status' para el estado general: 'paid', 'pending', etc.
    // Y 'paymentStatus' para notas de venta a crédito: 'paid', 'partial', 'pending'
    const paidInvoices = invoices.filter(inv => {
      const inRange = isInDateRange(inv.createdAt, dateRange.startDate, dateRange.endDate)
      if (!inRange) return false

      // Filtrar por sucursal
      if (!filterByBranch(inv, 'invoice')) return false

      // Una factura se considera como ingreso si:
      // 1. Su status es 'paid' (factura/boleta normal pagada)
      // 2. O tiene paymentHistory con pagos (notas de venta con pagos parciales)
      const isPaid = inv.status === 'paid'
      const hasPayments = (inv.paymentHistory || []).length > 0

      return isPaid || hasPayments
    })

    const salesIncome = paidInvoices.reduce((sum, inv) => {
      // Si tiene paymentHistory, sumar solo los pagos realizados
      if (inv.paymentHistory && inv.paymentHistory.length > 0) {
        const paid = inv.paymentHistory.reduce((s, p) => s + (p.amount || 0), 0)
        return sum + paid
      }
      // Si status es 'paid' y no tiene paymentHistory, es una venta al contado
      if (inv.status === 'paid') {
        return sum + (inv.total || 0)
      }
      return sum
    }, 0)

    // 2. Otros ingresos (movimientos de caja tipo income)
    // IMPORTANTE: Excluir movimientos con sessionId (son del Control de Caja diario, no del Flujo de Caja)
    const otherIncome = cashMovements
      .filter(m => m.type === 'income' && !m.sessionId && isInDateRange(m.createdAt, dateRange.startDate, dateRange.endDate) && filterByBranch(m, 'cashMovement'))
      .reduce((sum, m) => sum + (m.amount || 0), 0)

    // 3. Préstamos recibidos (monto del préstamo cuando se recibió en el período)
    const loansReceived = loans.filter(loan =>
      isInDateRange(loan.createdAt || loan.issueDate, dateRange.startDate, dateRange.endDate) && filterByBranch(loan, 'loan')
    )
    const loansIncome = loansReceived.reduce((sum, loan) => sum + (loan.amount || 0), 0)

    // 4. Movimientos financieros tipo ingreso (Aporte Capital, Venta Activo, etc.)
    const financialIncomeMovements = financialMovements.filter(m =>
      m.type === 'income' && isFinancialMovementInRange(m, dateRange.startDate, dateRange.endDate) && filterByBranch(m, 'financialMovement')
    )
    const financialIncome = financialIncomeMovements.reduce((sum, m) => sum + (m.amount || 0), 0)

    const totalIncome = salesIncome + otherIncome + loansIncome + financialIncome

    // EGRESOS
    // 1. Gastos operativos (filtrados por fecha y sucursal)
    const filteredExpenses = expenses.filter(e => isInDateRange(e.date, dateRange.startDate, dateRange.endDate) && filterByBranch(e, 'expense'))
    const expensesTotal = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)

    // Agrupar gastos por categoría
    const expensesByCategory = filteredExpenses.reduce((acc, e) => {
      const cat = e.category || 'otros'
      if (!acc[cat]) acc[cat] = { amount: 0, items: [] }
      acc[cat].amount += e.amount || 0
      acc[cat].items.push(e)
      return acc
    }, {})

    // 2. Compras pagadas (filtradas por sucursal)
    // Usar invoiceDate (fecha de factura) en lugar de createdAt (fecha de registro)
    const paidPurchases = purchases.filter(p => {
      const purchaseDate = p.invoiceDate || p.createdAt
      const inRange = isInDateRange(purchaseDate, dateRange.startDate, dateRange.endDate)
      return inRange && p.paymentStatus === 'paid' && filterByBranch(p, 'purchase')
    })
    const purchasesTotal = paidPurchases.reduce((sum, p) => sum + (p.total || 0), 0)

    // 3. Otros egresos (movimientos de caja tipo expense)
    // IMPORTANTE: Excluir movimientos con sessionId (son del Control de Caja diario, no del Flujo de Caja)
    const otherExpenses = cashMovements
      .filter(m => m.type === 'expense' && !m.sessionId && isInDateRange(m.createdAt, dateRange.startDate, dateRange.endDate) && filterByBranch(m, 'cashMovement'))
      .reduce((sum, m) => sum + (m.amount || 0), 0)

    // 4. Cuotas de préstamos pagadas (filtradas por sucursal)
    const paidLoanInstallments = []
    loans.filter(loan => filterByBranch(loan, 'loan')).forEach(loan => {
      (loan.installments || []).forEach(inst => {
        if (inst.status === 'paid' && inst.paidAt && isInDateRange(inst.paidAt, dateRange.startDate, dateRange.endDate)) {
          paidLoanInstallments.push({
            ...inst,
            loanId: loan.id,
            lenderName: loan.lenderName,
            loanType: loan.type
          })
        }
      })
    })
    const loanInstallmentsTotal = paidLoanInstallments.reduce((sum, inst) => sum + (inst.paidAmount || inst.amount || 0), 0)

    // 5. Movimientos financieros tipo egreso (Retiro Dueño, Compra Activo, etc.)
    const financialExpenseMovements = financialMovements.filter(m =>
      m.type === 'expense' && isFinancialMovementInRange(m, dateRange.startDate, dateRange.endDate) && filterByBranch(m, 'financialMovement')
    )
    const financialExpenses = financialExpenseMovements.reduce((sum, m) => sum + (m.amount || 0), 0)

    const totalExpenses = expensesTotal + purchasesTotal + otherExpenses + loanInstallmentsTotal + financialExpenses

    // BALANCE
    const balance = totalIncome - totalExpenses

    // PROYECCIONES
    // Cuentas por cobrar (facturas pendientes de pago, filtradas por sucursal)
    // Incluye: status='pending' (facturas normales) o notas de venta con paymentStatus='pending'/'partial'
    const pendingInvoices = invoices.filter(inv => {
      // Filtrar por sucursal primero
      if (!filterByBranch(inv, 'invoice')) return false

      // Facturas/boletas con status pending
      if (inv.status === 'pending') return true
      // Notas de venta con pagos pendientes
      if (inv.documentType === 'nota_venta' &&
          (inv.paymentStatus === 'pending' || inv.paymentStatus === 'partial')) {
        return true
      }
      return false
    })
    const accountsReceivable = pendingInvoices.reduce((sum, inv) => {
      const paid = (inv.paymentHistory || []).reduce((s, p) => s + (p.amount || 0), 0)
      return sum + ((inv.total || 0) - paid)
    }, 0)

    // Cuentas por pagar (compras a crédito pendientes, filtradas por sucursal)
    const pendingPurchases = purchases.filter(p =>
      p.paymentType === 'credito' && p.paymentStatus === 'pending' && filterByBranch(p, 'purchase')
    )
    const purchasesPayable = pendingPurchases.reduce((sum, p) => {
      const paid = p.paidAmount || 0
      return sum + ((p.total || 0) - paid)
    }, 0)

    // Cuotas de préstamos pendientes (filtradas por sucursal)
    const pendingLoanInstallments = []
    loans.filter(loan => filterByBranch(loan, 'loan')).forEach(loan => {
      if (loan.status !== 'paid') {
        (loan.installments || []).forEach(inst => {
          if (inst.status === 'pending') {
            pendingLoanInstallments.push({
              ...inst,
              loanId: loan.id,
              lenderName: loan.lenderName,
              loanType: loan.type
            })
          }
        })
      }
    })
    const loansPayable = pendingLoanInstallments.reduce((sum, inst) => sum + (inst.amount || 0), 0)

    const accountsPayable = purchasesPayable + loansPayable

    const projectedBalance = balance + accountsReceivable - accountsPayable

    return {
      // Ingresos
      salesIncome,
      otherIncome,
      loansIncome,
      loansReceived,
      financialIncome,
      financialIncomeMovements,
      totalIncome,
      paidInvoices,

      // Egresos
      expensesTotal,
      purchasesTotal,
      otherExpenses,
      loanInstallmentsTotal,
      paidLoanInstallments,
      financialExpenses,
      financialExpenseMovements,
      totalExpenses,
      expensesByCategory,
      paidPurchases,
      filteredExpenses,

      // Balance
      balance,

      // Proyecciones
      accountsReceivable,
      accountsPayable,
      purchasesPayable,
      loansPayable,
      pendingInvoices,
      pendingPurchases,
      pendingLoanInstallments,
      projectedBalance
    }
  }, [invoices, expenses, purchases, cashMovements, loans, financialMovements, dateRange, branchFilter, getWarehouseIdsForBranch])

  // Formatear moneda
  function formatCurrency(amount) {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount || 0)
  }

  // Formatear fecha
  function formatDate(date) {
    if (!date) return '-'
    const d = toDate(date)
    if (!d) return '-'
    return d.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  // Toggle sección
  function toggleSection(section) {
    setExpandedSection(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  // Abrir modal para nuevo movimiento
  function openNewMovementModal(type = 'income') {
    setNewMovement({
      type,
      category: '',
      amount: '',
      description: '',
      paymentMethod: 'efectivo',
      date: getLocalDateString(),
      branchId: ''
    })
    setShowModal(true)
  }

  // Guardar movimiento financiero
  async function handleSaveMovement() {
    if (!newMovement.category || !newMovement.amount) {
      toast.error('Completa los campos requeridos')
      return
    }

    if (isDemoMode) {
      toast.info('En modo demo no se guardan los datos')
      setShowModal(false)
      return
    }

    setSavingMovement(true)
    try {
      const movementData = {
        type: newMovement.type,
        category: newMovement.category,
        amount: parseFloat(newMovement.amount),
        description: newMovement.description,
        paymentMethod: newMovement.paymentMethod,
        date: parseLocalDate(newMovement.date), // Usar parseLocalDate para evitar problema de timezone
        dateString: newMovement.date, // YYYY-MM-DD para filtros sin problema de zona horaria
        branchId: newMovement.branchId || '',
      }

      const result = await createFinancialMovement(user.uid, movementData)
      if (result.success) {
        toast.success('Movimiento registrado')
        setShowModal(false)
        loadData()
      } else {
        toast.error('Error al guardar: ' + result.error)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al guardar el movimiento')
    } finally {
      setSavingMovement(false)
    }
  }

  // Eliminar movimiento financiero
  async function handleDeleteMovement(movementId) {
    if (isDemoMode) {
      toast.info('En modo demo no se eliminan los datos')
      return
    }

    if (!confirm('¿Eliminar este movimiento?')) return

    try {
      const result = await deleteFinancialMovement(user.uid, movementId)
      if (result.success) {
        toast.success('Movimiento eliminado')
        loadData()
      } else {
        toast.error('Error al eliminar')
      }
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  // Exportar a Excel
  function exportToExcel() {
    const wb = XLSX.utils.book_new()

    // Hoja de Resumen
    const summaryData = [
      ['FLUJO DE CAJA', '', ''],
      ['Período', `${dateRange.startDate} al ${dateRange.endDate}`, ''],
      ['', '', ''],
      ['RESUMEN', '', ''],
      ['Total Ingresos', cashFlowData.totalIncome, ''],
      ['Total Egresos', cashFlowData.totalExpenses, ''],
      ['Balance', cashFlowData.balance, ''],
      ['', '', ''],
      ['PROYECCIONES', '', ''],
      ['Por Cobrar', cashFlowData.accountsReceivable, ''],
      ['Por Pagar', cashFlowData.accountsPayable, ''],
      ['Balance Proyectado', cashFlowData.projectedBalance, ''],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen')

    // Hoja de Ingresos
    const incomeData = [
      ['INGRESOS', '', ''],
      ['Tipo', 'Detalle', 'Monto'],
      ['Ventas', 'Facturas pagadas', cashFlowData.salesIncome],
      ['Préstamos Recibidos', `${cashFlowData.loansReceived.length} préstamo(s)`, cashFlowData.loansIncome],
      ['Otros', 'Ingresos adicionales', cashFlowData.otherIncome],
      ['TOTAL', '', cashFlowData.totalIncome],
    ]
    const wsIncome = XLSX.utils.aoa_to_sheet(incomeData)
    XLSX.utils.book_append_sheet(wb, wsIncome, 'Ingresos')

    // Hoja de Egresos
    const expenseData = [
      ['EGRESOS', '', ''],
      ['Categoría', 'Monto', ''],
      ...Object.entries(cashFlowData.expensesByCategory).map(([cat, data]) => [
        EXPENSE_CATEGORIES.find(c => c.id === cat)?.name || cat,
        data.amount,
        ''
      ]),
      ['Compras', cashFlowData.purchasesTotal, ''],
      ['Pago de Préstamos', cashFlowData.loanInstallmentsTotal, ''],
      ['Otros Egresos', cashFlowData.otherExpenses, ''],
      ['TOTAL', cashFlowData.totalExpenses, ''],
    ]
    const wsExpenses = XLSX.utils.aoa_to_sheet(expenseData)
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Egresos')

    const fileName = `flujo_caja_${dateRange.startDate}_${dateRange.endDate}.xlsx`
    XLSX.writeFile(wb, fileName)
    toast.success('Reporte exportado')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Flujo de Caja</h1>
            <p className="text-sm text-gray-500 hidden sm:block">Liquidez total del negocio</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => openNewMovementModal('income')}
              className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Movimiento</span>
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Recargar"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filtros de fecha y sucursal */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col gap-4">
          {/* Filtro de sucursal */}
          {branches.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 pb-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600 font-medium">Sucursal:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: 'Todas' },
                  { value: 'main', label: 'Principal' },
                  ...branches.map(b => ({ value: b.id, label: b.name }))
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setBranchFilter(option.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      branchFilter === option.value
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Botones de período - Grid en móvil, flex en desktop */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <button
              onClick={() => setPeriod('daily')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === 'daily'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => setPeriod('weekly')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === 'weekly'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Semanal
            </button>
            <button
              onClick={() => setPeriod('monthly')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === 'monthly'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setPeriod('yearly')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === 'yearly'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Anual
            </button>
            <button
              onClick={() => setSelectedPeriod('custom')}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors col-span-2 sm:col-span-1 ${
                selectedPeriod === 'custom'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Personalizado
            </button>
          </div>

          {/* Fechas personalizadas - Siempre lado a lado */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-500 hidden sm:block" />
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={e => {
                    setSelectedPeriod('custom')
                    setDateRange({ ...dateRange, startDate: e.target.value })
                  }}
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <span className="text-gray-400 px-1">—</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={e => {
                    setSelectedPeriod('custom')
                    setDateRange({ ...dateRange, endDate: e.target.value })
                  }}
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
            </div>
            <div className="text-xs sm:text-sm text-gray-500 text-center sm:text-right">
              {invoices.length} fact. | {expenses.length} gast. | {purchases.length} comp.
            </div>
          </div>
        </div>
      </div>

      {/* Cards de Resumen */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Ingresos */}
            <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <ArrowUpCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                </div>
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 hidden sm:block" />
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">Ingresos</p>
              <p className="text-lg sm:text-2xl font-bold text-green-600">{formatCurrency(cashFlowData.totalIncome)}</p>
            </div>

            {/* Total Egresos */}
            <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <ArrowDownCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
                </div>
                <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 hidden sm:block" />
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">Egresos</p>
              <p className="text-lg sm:text-2xl font-bold text-red-600">{formatCurrency(cashFlowData.totalExpenses)}</p>
            </div>

            {/* Balance */}
            <div className={`bg-white rounded-xl p-3 sm:p-5 shadow-sm border ${cashFlowData.balance >= 0 ? 'border-green-200' : 'border-red-200'}`}>
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 ${cashFlowData.balance >= 0 ? 'bg-green-100' : 'bg-red-100'} rounded-xl flex items-center justify-center`}>
                  <Wallet className={`w-5 h-5 sm:w-6 sm:h-6 ${cashFlowData.balance >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <DollarSign className={`w-4 h-4 sm:w-5 sm:h-5 ${cashFlowData.balance >= 0 ? 'text-green-500' : 'text-red-500'} hidden sm:block`} />
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">Balance</p>
              <p className={`text-lg sm:text-2xl font-bold ${cashFlowData.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(cashFlowData.balance)}
              </p>
            </div>

            {/* Proyección */}
            <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                </div>
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 hidden sm:block" />
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">Proyectado</p>
              <p className={`text-lg sm:text-2xl font-bold ${cashFlowData.projectedBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(cashFlowData.projectedBalance)}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1 hidden sm:block">Incluye cuentas por cobrar/pagar</p>
            </div>
          </div>

          {/* Sección de Ingresos */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <button
              onClick={() => toggleSection('ingresos')}
              className="w-full px-6 py-4 flex items-center justify-between bg-green-50 hover:bg-green-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ArrowUpCircle className="w-6 h-6 text-green-600" />
                <h2 className="text-lg font-semibold text-gray-900">Ingresos</h2>
                <span className="text-green-600 font-bold">{formatCurrency(cashFlowData.totalIncome)}</span>
              </div>
              {expandedSection.ingresos ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
            </button>

            {expandedSection.ingresos && (
              <div className="p-3 sm:p-6">
                {/* Vista móvil: Cards */}
                <div className="sm:hidden space-y-3">
                  {/* Ventas */}
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <ShoppingCart className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Ventas</p>
                        <p className="text-xs text-gray-500">{cashFlowData.paidInvoices.length} facturas</p>
                      </div>
                    </div>
                    <span className="font-semibold text-green-600">{formatCurrency(cashFlowData.salesIncome)}</span>
                  </div>

                  {cashFlowData.loansIncome > 0 && (
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <Landmark className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Préstamos</p>
                          <p className="text-xs text-gray-500">{cashFlowData.loansReceived.length} recibido(s)</p>
                        </div>
                      </div>
                      <span className="font-semibold text-green-600">{formatCurrency(cashFlowData.loansIncome)}</span>
                    </div>
                  )}

                  {cashFlowData.otherIncome > 0 && (
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <DollarSign className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Otros Ingresos</p>
                          <p className="text-xs text-gray-500">Movimientos de caja</p>
                        </div>
                      </div>
                      <span className="font-semibold text-green-600">{formatCurrency(cashFlowData.otherIncome)}</span>
                    </div>
                  )}

                  {/* Movimientos financieros móvil */}
                  {cashFlowData.financialIncomeMovements.map(mov => {
                    const cat = FINANCIAL_CATEGORIES.income.find(c => c.id === mov.category)
                    const Icon = cat?.icon || DollarSign
                    return (
                      <div key={mov.id} className="flex items-center justify-between py-3 border-b border-gray-100 bg-green-50/30 -mx-3 px-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                            <Icon className="w-4 h-4 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{cat?.name || mov.category}</p>
                            <p className="text-xs text-gray-500 truncate max-w-[150px]">{mov.description || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-green-600">{formatCurrency(mov.amount)}</span>
                          <button onClick={() => handleDeleteMovement(mov.id)} className="p-1 text-gray-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Total móvil */}
                  <div className="flex items-center justify-between py-3 bg-green-50 -mx-3 px-3 rounded-lg mt-3">
                    <span className="font-semibold text-gray-900">TOTAL</span>
                    <span className="font-bold text-green-600 text-lg">{formatCurrency(cashFlowData.totalIncome)}</span>
                  </div>
                </div>

                {/* Vista desktop: Tabla */}
                <table className="w-full hidden sm:table">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Tipo</th>
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Detalle</th>
                      <th className="text-right py-2 text-sm font-medium text-gray-500">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4 text-green-600" />
                          <span className="font-medium">Ventas</span>
                        </div>
                      </td>
                      <td className="py-3 text-gray-600">
                        {cashFlowData.paidInvoices.length} facturas en período
                        <span className="text-xs text-gray-400 ml-1">({invoices.length} total)</span>
                      </td>
                      <td className="py-3 text-right font-semibold text-green-600">{formatCurrency(cashFlowData.salesIncome)}</td>
                    </tr>
                    {cashFlowData.loansIncome > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Landmark className="w-4 h-4 text-green-600" />
                            <span className="font-medium">Préstamos Recibidos</span>
                          </div>
                        </td>
                        <td className="py-3 text-gray-600">{cashFlowData.loansReceived.length} préstamo(s) en período</td>
                        <td className="py-3 text-right font-semibold text-green-600">{formatCurrency(cashFlowData.loansIncome)}</td>
                      </tr>
                    )}
                    {cashFlowData.otherIncome > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-green-600" />
                            <span className="font-medium">Otros Ingresos</span>
                          </div>
                        </td>
                        <td className="py-3 text-gray-600">Movimientos de caja</td>
                        <td className="py-3 text-right font-semibold text-green-600">{formatCurrency(cashFlowData.otherIncome)}</td>
                      </tr>
                    )}
                    {/* Movimientos financieros de ingreso */}
                    {cashFlowData.financialIncomeMovements.map(mov => {
                      const cat = FINANCIAL_CATEGORIES.income.find(c => c.id === mov.category)
                      const Icon = cat?.icon || DollarSign
                      return (
                        <tr key={mov.id} className="border-b border-gray-100 bg-green-50/30">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-green-600" />
                              <span className="font-medium">{cat?.name || mov.category}</span>
                            </div>
                          </td>
                          <td className="py-3 text-gray-600">
                            {mov.description || '-'}
                            <span className="text-xs text-gray-400 ml-2">
                              ({PAYMENT_METHODS.find(m => m.id === mov.paymentMethod)?.name || mov.paymentMethod})
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-semibold text-green-600">{formatCurrency(mov.amount)}</span>
                              <button
                                onClick={() => handleDeleteMovement(mov.id)}
                                className="p-1 text-gray-400 hover:text-red-500"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-green-50">
                      <td colSpan={2} className="py-3 px-2 font-semibold">TOTAL INGRESOS</td>
                      <td className="py-3 px-2 text-right font-bold text-green-600 text-lg">{formatCurrency(cashFlowData.totalIncome)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Sección de Egresos */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <button
              onClick={() => toggleSection('egresos')}
              className="w-full px-6 py-4 flex items-center justify-between bg-red-50 hover:bg-red-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ArrowDownCircle className="w-6 h-6 text-red-600" />
                <h2 className="text-lg font-semibold text-gray-900">Egresos</h2>
                <span className="text-red-600 font-bold">{formatCurrency(cashFlowData.totalExpenses)}</span>
              </div>
              {expandedSection.egresos ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
            </button>

            {expandedSection.egresos && (
              <div className="p-3 sm:p-6">
                {/* Vista móvil: Cards */}
                <div className="sm:hidden space-y-3">
                  {/* Gastos por categoría */}
                  {Object.entries(cashFlowData.expensesByCategory).map(([category, data]) => {
                    const CategoryIcon = CATEGORY_ICONS[category] || MoreHorizontal
                    const categoryName = EXPENSE_CATEGORIES.find(c => c.id === category)?.name || category
                    return (
                      <div key={category} className="flex items-center justify-between py-3 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                            <CategoryIcon className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{categoryName}</p>
                            <p className="text-xs text-gray-500">{data.items.length} registros</p>
                          </div>
                        </div>
                        <span className="font-semibold text-red-600">{formatCurrency(data.amount)}</span>
                      </div>
                    )
                  })}

                  {/* Compras */}
                  {cashFlowData.purchasesTotal > 0 && (
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                          <Package className="w-4 h-4 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Compras</p>
                          <p className="text-xs text-gray-500">{cashFlowData.paidPurchases.length} pagadas</p>
                        </div>
                      </div>
                      <span className="font-semibold text-red-600">{formatCurrency(cashFlowData.purchasesTotal)}</span>
                    </div>
                  )}

                  {/* Cuotas de préstamos */}
                  {cashFlowData.loanInstallmentsTotal > 0 && (
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                          <Landmark className="w-4 h-4 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Préstamos</p>
                          <p className="text-xs text-gray-500">{cashFlowData.paidLoanInstallments.length} cuota(s)</p>
                        </div>
                      </div>
                      <span className="font-semibold text-red-600">{formatCurrency(cashFlowData.loanInstallmentsTotal)}</span>
                    </div>
                  )}

                  {/* Otros egresos */}
                  {cashFlowData.otherExpenses > 0 && (
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                          <MoreHorizontal className="w-4 h-4 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Otros Egresos</p>
                          <p className="text-xs text-gray-500">Movimientos de caja</p>
                        </div>
                      </div>
                      <span className="font-semibold text-red-600">{formatCurrency(cashFlowData.otherExpenses)}</span>
                    </div>
                  )}

                  {/* Movimientos financieros móvil */}
                  {cashFlowData.financialExpenseMovements.map(mov => {
                    const cat = FINANCIAL_CATEGORIES.expense.find(c => c.id === mov.category)
                    const Icon = cat?.icon || DollarSign
                    return (
                      <div key={mov.id} className="flex items-center justify-between py-3 border-b border-gray-100 bg-red-50/30 -mx-3 px-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                            <Icon className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{cat?.name || mov.category}</p>
                            <p className="text-xs text-gray-500 truncate max-w-[150px]">{mov.description || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-red-600">{formatCurrency(mov.amount)}</span>
                          <button onClick={() => handleDeleteMovement(mov.id)} className="p-1 text-gray-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Total móvil */}
                  <div className="flex items-center justify-between py-3 bg-red-50 -mx-3 px-3 rounded-lg mt-3">
                    <span className="font-semibold text-gray-900">TOTAL</span>
                    <span className="font-bold text-red-600 text-lg">{formatCurrency(cashFlowData.totalExpenses)}</span>
                  </div>
                </div>

                {/* Vista desktop: Tabla */}
                <table className="w-full hidden sm:table">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Categoría</th>
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Detalle</th>
                      <th className="text-right py-2 text-sm font-medium text-gray-500">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Gastos por categoría */}
                    {Object.entries(cashFlowData.expensesByCategory).map(([category, data]) => {
                      const CategoryIcon = CATEGORY_ICONS[category] || MoreHorizontal
                      const categoryName = EXPENSE_CATEGORIES.find(c => c.id === category)?.name || category
                      return (
                        <tr key={category} className="border-b border-gray-100">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <CategoryIcon className="w-4 h-4 text-red-600" />
                              <span className="font-medium">{categoryName}</span>
                            </div>
                          </td>
                          <td className="py-3 text-gray-600">{data.items.length} registros</td>
                          <td className="py-3 text-right font-semibold text-red-600">{formatCurrency(data.amount)}</td>
                        </tr>
                      )
                    })}

                    {/* Compras */}
                    {cashFlowData.purchasesTotal > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-red-600" />
                            <span className="font-medium">Compras</span>
                          </div>
                        </td>
                        <td className="py-3 text-gray-600">{cashFlowData.paidPurchases.length} compras pagadas</td>
                        <td className="py-3 text-right font-semibold text-red-600">{formatCurrency(cashFlowData.purchasesTotal)}</td>
                      </tr>
                    )}

                    {/* Cuotas de préstamos */}
                    {cashFlowData.loanInstallmentsTotal > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Landmark className="w-4 h-4 text-red-600" />
                            <span className="font-medium">Pago de Préstamos</span>
                          </div>
                        </td>
                        <td className="py-3 text-gray-600">{cashFlowData.paidLoanInstallments.length} cuota(s) pagada(s)</td>
                        <td className="py-3 text-right font-semibold text-red-600">{formatCurrency(cashFlowData.loanInstallmentsTotal)}</td>
                      </tr>
                    )}

                    {/* Otros egresos */}
                    {cashFlowData.otherExpenses > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <MoreHorizontal className="w-4 h-4 text-red-600" />
                            <span className="font-medium">Otros Egresos</span>
                          </div>
                        </td>
                        <td className="py-3 text-gray-600">Movimientos de caja</td>
                        <td className="py-3 text-right font-semibold text-red-600">{formatCurrency(cashFlowData.otherExpenses)}</td>
                      </tr>
                    )}
                    {/* Movimientos financieros de egreso */}
                    {cashFlowData.financialExpenseMovements.map(mov => {
                      const cat = FINANCIAL_CATEGORIES.expense.find(c => c.id === mov.category)
                      const Icon = cat?.icon || DollarSign
                      return (
                        <tr key={mov.id} className="border-b border-gray-100 bg-red-50/30">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-red-600" />
                              <span className="font-medium">{cat?.name || mov.category}</span>
                            </div>
                          </td>
                          <td className="py-3 text-gray-600">
                            {mov.description || '-'}
                            <span className="text-xs text-gray-400 ml-2">
                              ({PAYMENT_METHODS.find(m => m.id === mov.paymentMethod)?.name || mov.paymentMethod})
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-semibold text-red-600">{formatCurrency(mov.amount)}</span>
                              <button
                                onClick={() => handleDeleteMovement(mov.id)}
                                className="p-1 text-gray-400 hover:text-red-500"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-red-50">
                      <td colSpan={2} className="py-3 px-2 font-semibold">TOTAL EGRESOS</td>
                      <td className="py-3 px-2 text-right font-bold text-red-600 text-lg">{formatCurrency(cashFlowData.totalExpenses)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Sección de Proyecciones */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <button
              onClick={() => toggleSection('proyecciones')}
              className="w-full px-6 py-4 flex items-center justify-between bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Proyecciones</h2>
              </div>
              {expandedSection.proyecciones ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
            </button>

            {expandedSection.proyecciones && (
              <div className="p-3 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {/* Por Cobrar */}
                  <div className="border border-green-200 rounded-xl p-4 bg-green-50/50">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowUpCircle className="w-5 h-5 text-green-600" />
                      <h3 className="font-semibold text-gray-900">Por Cobrar</h3>
                    </div>
                    <p className="text-2xl font-bold text-green-600 mb-2">{formatCurrency(cashFlowData.accountsReceivable)}</p>
                    <p className="text-sm text-gray-600">{cashFlowData.pendingInvoices.length} facturas pendientes</p>

                    {cashFlowData.pendingInvoices.length > 0 && (
                      <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
                        {cashFlowData.pendingInvoices.slice(0, 5).map(inv => {
                          const pending = inv.paymentStatus === 'pending'
                            ? inv.total
                            : inv.total - (inv.paymentHistory || []).reduce((s, p) => s + (p.amount || 0), 0)
                          return (
                            <div key={inv.id} className="flex justify-between text-sm py-1 border-b border-green-200">
                              <span className="text-gray-600">{inv.customer?.name || 'Cliente'}</span>
                              <span className="font-medium text-green-700">{formatCurrency(pending)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Por Pagar */}
                  <div className="border border-red-200 rounded-xl p-4 bg-red-50/50">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowDownCircle className="w-5 h-5 text-red-600" />
                      <h3 className="font-semibold text-gray-900">Por Pagar</h3>
                    </div>
                    <p className="text-2xl font-bold text-red-600 mb-2">{formatCurrency(cashFlowData.accountsPayable)}</p>
                    <p className="text-sm text-gray-600">
                      {cashFlowData.pendingPurchases.length} compras | {cashFlowData.pendingLoanInstallments.length} cuotas préstamo
                    </p>

                    {(cashFlowData.pendingPurchases.length > 0 || cashFlowData.pendingLoanInstallments.length > 0) && (
                      <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
                        {/* Compras pendientes */}
                        {cashFlowData.purchasesPayable > 0 && (
                          <div className="flex justify-between text-sm py-1 border-b border-red-200">
                            <span className="text-gray-600 flex items-center gap-1">
                              <Package className="w-3 h-3" /> Compras a crédito
                            </span>
                            <span className="font-medium text-red-700">{formatCurrency(cashFlowData.purchasesPayable)}</span>
                          </div>
                        )}
                        {/* Cuotas de préstamos pendientes */}
                        {cashFlowData.loansPayable > 0 && (
                          <div className="flex justify-between text-sm py-1 border-b border-red-200">
                            <span className="text-gray-600 flex items-center gap-1">
                              <Landmark className="w-3 h-3" /> Cuotas préstamos
                            </span>
                            <span className="font-medium text-red-700">{formatCurrency(cashFlowData.loansPayable)}</span>
                          </div>
                        )}
                        {/* Detalle de cuotas próximas */}
                        {cashFlowData.pendingLoanInstallments.slice(0, 3).map((inst, idx) => (
                          <div key={`loan-inst-${idx}`} className="flex justify-between text-xs py-1 border-b border-red-100 pl-4">
                            <span className="text-gray-500">{inst.lenderName} - Cuota {inst.number}</span>
                            <span className="font-medium text-red-600">{formatCurrency(inst.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Balance Proyectado */}
                <div className={`mt-6 p-4 rounded-xl ${cashFlowData.projectedBalance >= 0 ? 'bg-green-100 border border-green-200' : 'bg-red-100 border border-red-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Balance Proyectado</p>
                      <p className="text-xs text-gray-500">Balance actual + Por Cobrar - Por Pagar</p>
                    </div>
                    <p className={`text-2xl font-bold ${cashFlowData.projectedBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(cashFlowData.projectedBalance)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal para nuevo movimiento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Nuevo Movimiento</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tipo: Ingreso / Egreso */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewMovement({ ...newMovement, type: 'income', category: '' })}
                    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                      newMovement.type === 'income'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <ArrowUpCircle className="w-5 h-5 mx-auto mb-1" />
                    <span className="text-sm">Ingreso</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMovement({ ...newMovement, type: 'expense', category: '' })}
                    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                      newMovement.type === 'expense'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <ArrowDownCircle className="w-5 h-5 mx-auto mb-1" />
                    <span className="text-sm">Egreso</span>
                  </button>
                </div>
              </div>

              {/* Categoría */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Categoría *</label>
                <div className="grid grid-cols-2 gap-2">
                  {FINANCIAL_CATEGORIES[newMovement.type].map(cat => {
                    const Icon = cat.icon
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setNewMovement({ ...newMovement, category: cat.id })}
                        className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-colors text-left ${
                          newMovement.category === cat.id
                            ? newMovement.type === 'income'
                              ? 'border-green-500 bg-green-50'
                              : 'border-red-500 bg-red-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-sm">{cat.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Monto */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Monto *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">S/</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newMovement.amount}
                    onChange={e => setNewMovement({ ...newMovement, amount: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Método de pago */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Método de Pago</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(method => {
                    const Icon = method.icon
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setNewMovement({ ...newMovement, paymentMethod: method.id })}
                        className={`flex items-center gap-2 p-2 rounded-lg border-2 transition-colors ${
                          newMovement.paymentMethod === method.id
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-sm">{method.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Fecha */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Fecha</label>
                <input
                  type="date"
                  value={newMovement.date}
                  onChange={e => setNewMovement({ ...newMovement, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Sucursal */}
              {branches.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Store className="w-4 h-4 inline mr-1" />
                    Sucursal
                  </label>
                  <select
                    value={newMovement.branchId}
                    onChange={e => setNewMovement({ ...newMovement, branchId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Sucursal Principal</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Descripción */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Descripción (opcional)</label>
                <input
                  type="text"
                  value={newMovement.description}
                  onChange={e => setNewMovement({ ...newMovement, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Ej: Aporte para capital de trabajo"
                />
              </div>

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveMovement}
                  disabled={savingMovement || !newMovement.category || !newMovement.amount}
                  className={`flex-1 py-2 px-4 rounded-lg text-white ${
                    newMovement.type === 'income'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  } disabled:opacity-50`}
                >
                  {savingMovement ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
