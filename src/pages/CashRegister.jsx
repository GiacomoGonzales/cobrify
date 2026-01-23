import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Lock, Unlock, Plus, Calendar, Download, FileSpreadsheet, History, Eye, ChevronRight, Edit2, Trash2, Store, Clock } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getActiveBranches } from '@/services/branchService'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  getCashRegisterSession,
  openCashRegister,
  closeCashRegister,
  addCashMovement,
  getCashMovements,
  updateCashMovement,
  deleteCashMovement,
  getInvoicesByBranch,
  getCompanySettings,
  getCashRegisterHistory,
  updateCashSession, // TEMPORAL: Para editar historial
} from '@/services/firestoreService'
import { generateCashReportExcel, generateCashReportPDF } from '@/services/cashReportService'

export default function CashRegister() {
  const { user, isDemoMode, demoData, getBusinessId, filterBranchesByAccess, allowedBranches } = useAppContext()
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [currentSession, setCurrentSession] = useState(null)
  const [movements, setMovements] = useState([])
  const [todayInvoices, setTodayInvoices] = useState([])

  // Sucursales
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null) // null = Sucursal Principal
  const [hasMainAccess, setHasMainAccess] = useState(true) // Acceso a Sucursal Principal

  // Tab state: 'current' o 'history'
  const [activeTab, setActiveTab] = useState('current')
  const [historyData, setHistoryData] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [selectedHistorySession, setSelectedHistorySession] = useState(null)
  const [historyMovements, setHistoryMovements] = useState([])

  // TEMPORAL: Estados para edición de historial
  const [isEditingHistory, setIsEditingHistory] = useState(false)
  const [editValues, setEditValues] = useState({
    openingAmount: 0,
    closingCash: 0,
    closingCard: 0,
    closingTransfer: 0,
  })
  const [editMovementValues, setEditMovementValues] = useState({ description: '', amount: 0 })

  // Helper para convertir fechas (Firestore Timestamp o Date)
  const getDateFromTimestamp = (timestamp) => {
    if (!timestamp) return null
    return timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  }

  // Modal states
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [closedSuccessfully, setClosedSuccessfully] = useState(false)
  const [closedSessionData, setClosedSessionData] = useState(null)
  const [showHistoryDetailModal, setShowHistoryDetailModal] = useState(false)

  // Form states
  const [openingAmount, setOpeningAmount] = useState('')
  const [closingCounts, setClosingCounts] = useState({
    cash: '',
    card: '',
    transfer: '',
  })
  const [movementData, setMovementData] = useState({
    type: 'income',
    amount: '',
    description: '',
    category: '',
  })

  // Estados para editar/eliminar movimientos
  const [editingMovement, setEditingMovement] = useState(null)
  const [showDeleteMovementConfirm, setShowDeleteMovementConfirm] = useState(null)

  useEffect(() => {
    if (user?.uid) {
      loadBranches()
    }
  }, [user])

  // Recargar datos cuando cambia la sucursal seleccionada
  useEffect(() => {
    if (user?.uid) {
      loadData()
    }
  }, [user, selectedBranch])

  // Cargar sucursales
  const loadBranches = async () => {
    // En modo demo, no hay sucursales adicionales
    if (isDemoMode) {
      setBranches([])
      setHasMainAccess(true)
      return
    }

    try {
      const result = await getActiveBranches(getBusinessId())
      if (result.success && result.data.length > 0) {
        const branchList = filterBranchesByAccess ? filterBranchesByAccess(result.data) : result.data
        setBranches(branchList)

        // Verificar si el usuario tiene acceso a la Sucursal Principal
        // Si allowedBranches tiene valores y NO incluye 'main', NO tiene acceso a la principal
        const mainAccess = !allowedBranches || allowedBranches.length === 0 || allowedBranches.includes('main')
        setHasMainAccess(mainAccess)

        // Si no tiene acceso a la principal, auto-seleccionar la primera sucursal permitida
        if (!mainAccess && branchList.length > 0) {
          setSelectedBranch(branchList[0])
        }
      } else {
        // Verificar acceso a principal aunque no haya sucursales adicionales
        const mainAccess = !allowedBranches || allowedBranches.length === 0 || allowedBranches.includes('main')
        setHasMainAccess(mainAccess)
      }
    } catch (error) {
      console.error('Error al cargar sucursales:', error)
    }
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      if (isDemoMode && demoData) {
        // Simular sesión de caja abierta con datos demo
        const demoSession = {
          id: 'demo-session-1',
          openingAmount: 500,
          openedAt: new Date(new Date().setHours(8, 0, 0, 0)),
          openedBy: demoData.user.displayName,
          status: 'open'
        }
        setCurrentSession(demoSession)

        // Movimientos demo
        const demoMovements = [
          {
            id: '1',
            type: 'income',
            amount: 50,
            description: 'Venta de productos',
            category: 'Ventas',
            createdAt: new Date(new Date().setHours(10, 30, 0, 0))
          },
          {
            id: '2',
            type: 'expense',
            amount: 20,
            description: 'Compra de suministros',
            category: 'Suministros',
            createdAt: new Date(new Date().setHours(12, 15, 0, 0))
          }
        ]
        setMovements(demoMovements)

        // Filtrar facturas de la sesión demo (desde apertura hasta ahora)
        const sessionOpenedAt = demoSession.openedAt
        const now = new Date()

        const sessionInvoicesList = (demoData.invoices || []).filter(invoice => {
          const invoiceDate = invoice.createdAt instanceof Date ? invoice.createdAt : new Date(invoice.createdAt)
          return invoiceDate >= sessionOpenedAt && invoiceDate <= now
        })
        setTodayInvoices(sessionInvoicesList)

        setIsLoading(false)
        return
      }

      // Obtener sesión actual para la sucursal seleccionada
      const branchId = selectedBranch?.id || null
      const sessionResult = await getCashRegisterSession(getBusinessId(), branchId)
      if (sessionResult.success && sessionResult.data) {
        setCurrentSession(sessionResult.data)

        // Obtener movimientos de la sesión
        const movementsResult = await getCashMovements(getBusinessId(), sessionResult.data.id)
        if (movementsResult.success) {
          setMovements(movementsResult.data || [])
        }
      } else {
        setCurrentSession(null)
        setMovements([])
      }

      // Obtener facturas de la sesión actual (desde apertura hasta ahora)
      // Filtrar por sucursal directamente desde el servicio
      const invoicesResult = await getInvoicesByBranch(getBusinessId(), branchId)
      if (invoicesResult.success && sessionResult.success && sessionResult.data) {
        const sessionOpenedAt = sessionResult.data.openedAt?.toDate
          ? sessionResult.data.openedAt.toDate()
          : new Date(sessionResult.data.openedAt)
        const now = new Date()

        // Solo filtrar por período de sesión (el filtro de sucursal ya viene aplicado)
        const sessionInvoicesList = (invoicesResult.data || []).filter(invoice => {
          const invoiceDate = invoice.createdAt?.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
          return invoiceDate >= sessionOpenedAt && invoiceDate <= now
        })
        setTodayInvoices(sessionInvoicesList)
      } else if (invoicesResult.success) {
        // Si no hay sesión abierta, no mostrar facturas
        setTodayInvoices([])
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar los datos')
    } finally {
      setIsLoading(false)
    }
  }

  const loadHistory = async () => {
    setIsLoadingHistory(true)
    try {
      if (isDemoMode) {
        // Datos demo de historial
        const demoHistory = [
          {
            id: 'demo-hist-1',
            openingAmount: 500,
            closingAmount: 1850,
            closingCash: 1350,
            closingCard: 300,
            closingTransfer: 200,
            openedAt: new Date(Date.now() - 86400000), // Ayer
            closedAt: new Date(Date.now() - 86400000 + 36000000),
            status: 'closed',
            totalSales: 1500,
            totalIncome: 100,
            totalExpense: 50,
            expectedAmount: 1550,
            difference: -200,
          },
          {
            id: 'demo-hist-2',
            openingAmount: 300,
            closingAmount: 980,
            closingCash: 780,
            closingCard: 150,
            closingTransfer: 50,
            openedAt: new Date(Date.now() - 86400000 * 2),
            closedAt: new Date(Date.now() - 86400000 * 2 + 36000000),
            status: 'closed',
            totalSales: 850,
            totalIncome: 50,
            totalExpense: 20,
            expectedAmount: 780,
            difference: 0,
          },
          {
            id: 'demo-hist-3',
            openingAmount: 400,
            closingAmount: 1200,
            closingCash: 900,
            closingCard: 200,
            closingTransfer: 100,
            openedAt: new Date(Date.now() - 86400000 * 3),
            closedAt: new Date(Date.now() - 86400000 * 3 + 36000000),
            status: 'closed',
            totalSales: 1100,
            totalIncome: 0,
            totalExpense: 100,
            expectedAmount: 900,
            difference: 0,
          },
        ]
        setHistoryData(demoHistory)
        setIsLoadingHistory(false)
        return
      }

      const branchId = selectedBranch?.id || null
      const result = await getCashRegisterHistory(getBusinessId(), { branchId })
      if (result.success) {
        setHistoryData(result.data || [])
      } else {
        toast.error('Error al cargar historial')
      }
    } catch (error) {
      console.error('Error al cargar historial:', error)
      toast.error('Error al cargar historial')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // TEMPORAL: Función para guardar edición del historial
  const handleSaveHistoryEdit = async () => {
    if (!selectedHistorySession) return

    try {
      const result = await updateCashSession(getBusinessId(), selectedHistorySession.id, {
        openingAmount: editValues.openingAmount,
        closingCash: editValues.closingCash,
        closingCard: editValues.closingCard,
        closingTransfer: editValues.closingTransfer,
        totalSales: selectedHistorySession.totalSales || 0,
        totalIncome: selectedHistorySession.totalIncome || 0,
        totalExpense: selectedHistorySession.totalExpense || 0,
      })

      if (result.success) {
        toast.success('Sesión actualizada correctamente')
        setIsEditingHistory(false)
        // Recargar historial para ver cambios
        loadHistory()
        setSelectedHistorySession(null)
        setShowHistoryDetailModal(false)
      } else {
        toast.error('Error al actualizar')
      }
    } catch (error) {
      console.error('Error al guardar:', error)
      toast.error('Error al guardar cambios')
    }
  }

  // TEMPORAL: Iniciar edición de historial
  const startEditingHistory = () => {
    setEditValues({
      openingAmount: selectedHistorySession.openingAmount || 0,
      closingCash: selectedHistorySession.closingCash || 0,
      closingCard: selectedHistorySession.closingCard || 0,
      closingTransfer: selectedHistorySession.closingTransfer || 0,
    })
    setIsEditingHistory(true)
  }

  // TEMPORAL: Editar movimiento del historial
  const handleEditHistoryMovement = (movement) => {
    setEditingMovement(movement)
    setEditMovementValues({
      description: movement.description || '',
      amount: movement.amount || 0,
    })
  }

  // TEMPORAL: Guardar edición de movimiento
  const handleSaveMovementEdit = async () => {
    if (!editingMovement) return
    try {
      const result = await updateCashMovement(getBusinessId(), editingMovement.id, {
        description: editMovementValues.description,
        amount: parseFloat(editMovementValues.amount) || 0,
      })
      if (result.success) {
        toast.success('Movimiento actualizado')
        // Actualizar lista local
        setHistoryMovements(prev => prev.map(m =>
          m.id === editingMovement.id
            ? { ...m, description: editMovementValues.description, amount: parseFloat(editMovementValues.amount) || 0 }
            : m
        ))
        setEditingMovement(null)
      } else {
        toast.error('Error al actualizar')
      }
    } catch (error) {
      toast.error('Error al guardar')
    }
  }

  // TEMPORAL: Eliminar movimiento del historial
  const handleDeleteHistoryMovement = async (movement) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    try {
      const result = await deleteCashMovement(getBusinessId(), movement.id)
      if (result.success) {
        toast.success('Movimiento eliminado')
        setHistoryMovements(prev => prev.filter(m => m.id !== movement.id))
      } else {
        toast.error('Error al eliminar')
      }
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  const handleViewHistoryDetail = async (session) => {
    setSelectedHistorySession(session)
    setShowHistoryDetailModal(true)

    // Cargar movimientos de esa sesión
    if (!isDemoMode) {
      try {
        const movementsResult = await getCashMovements(getBusinessId(), session.id)
        if (movementsResult.success) {
          setHistoryMovements(movementsResult.data || [])
        }
      } catch (error) {
        console.error('Error al cargar movimientos:', error)
      }
    } else {
      // Movimientos demo
      setHistoryMovements([
        { id: '1', type: 'income', amount: 50, description: 'Cobro cliente', category: 'Cobro a Cliente', createdAt: new Date() },
        { id: '2', type: 'expense', amount: 30, description: 'Taxi', category: 'Transporte', createdAt: new Date() },
      ])
    }
  }

  // Cargar historial cuando se cambia a esa pestaña o cuando cambia la sucursal
  useEffect(() => {
    if (activeTab === 'history' && user?.uid) {
      loadHistory()
    }
  }, [activeTab, user?.uid, selectedBranch])

  const handleOpenCashRegister = async () => {
    if (!openingAmount || parseFloat(openingAmount) < 0) {
      toast.error('Ingresa un monto inicial válido')
      return
    }

    try {
      // MODO DEMO: Simular apertura sin guardar en Firebase
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Abriendo caja simulada...')
        await new Promise(resolve => setTimeout(resolve, 500)) // Simular delay

        const demoSession = {
          id: `demo-session-${Date.now()}`,
          openingAmount: parseFloat(openingAmount),
          openedAt: new Date(),
          openedBy: user.displayName,
          status: 'open'
        }

        setCurrentSession(demoSession)
        toast.success('Caja abierta correctamente (DEMO - No se guardó)', { duration: 5000 })
        setShowOpenModal(false)
        setOpeningAmount('')
        return
      }

      const branchId = selectedBranch?.id || null
      const result = await openCashRegister(getBusinessId(), parseFloat(openingAmount), branchId)
      if (result.success) {
        toast.success('Caja abierta correctamente')
        setShowOpenModal(false)
        setOpeningAmount('')
        loadData()
      } else {
        toast.error(result.error || 'Error al abrir la caja')
      }
    } catch (error) {
      console.error('Error al abrir caja:', error)
      toast.error('Error al abrir la caja')
    }
  }

  const handleCloseCashRegister = async () => {
    const cash = parseFloat(closingCounts.cash) || 0
    const card = parseFloat(closingCounts.card) || 0
    const transfer = parseFloat(closingCounts.transfer) || 0

    try {
      // Guardar datos de la sesión cerrada con hora de cierre
      const closedData = {
        ...currentSession,
        closingCash: cash,
        closingCard: card,
        closingTransfer: transfer,
        closingAmount: cash + card + transfer,
        closedAt: new Date(), // Hora de cierre
        totalSales: totals.sales,
        salesCash: totals.salesCash,
        salesCard: totals.salesCard,
        salesTransfer: totals.salesTransfer,
        salesYape: totals.salesYape,
        salesPlin: totals.salesPlin,
        salesRappi: totals.salesRappi,
        totalIncome: totals.income,
        totalExpense: totals.expense,
        expectedAmount: totals.expected,
        difference: cash - totals.expected,
      }

      // MODO DEMO: Simular cierre sin guardar en Firebase
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Cerrando caja simulada...')
        await new Promise(resolve => setTimeout(resolve, 500)) // Simular delay

        setClosedSessionData(closedData)
        setClosedSuccessfully(true)
        toast.success('Caja cerrada correctamente (DEMO - No se guardó)', { duration: 5000 })
        return
      }

      const result = await closeCashRegister(getBusinessId(), currentSession.id, {
        cash,
        card,
        transfer,
        totalSales: totals.sales,
        salesCash: totals.salesCash,
        salesCard: totals.salesCard,
        salesTransfer: totals.salesTransfer,
        salesYape: totals.salesYape,
        salesPlin: totals.salesPlin,
        salesRappi: totals.salesRappi,
        totalIncome: totals.income,
        totalExpense: totals.expense,
        expectedAmount: totals.expected,
        difference: cash - totals.expected,
      })
      if (result.success) {
        // Guardar datos y mostrar pantalla de éxito
        setClosedSessionData(closedData)
        setClosedSuccessfully(true)
        toast.success('Caja cerrada correctamente')
      } else {
        toast.error(result.error || 'Error al cerrar la caja')
      }
    } catch (error) {
      console.error('Error al cerrar caja:', error)
      toast.error('Error al cerrar la caja')
    }
  }

  const handleDownloadExcel = async () => {
    try {
      // Obtener datos del negocio
      const businessResult = await getCompanySettings(getBusinessId())
      const businessData = businessResult.success ? businessResult.data : null

      // Usar datos de la sesión cerrada si está disponible, sino usar currentSession
      const sessionData = closedSessionData || currentSession

      await generateCashReportExcel(sessionData, movements, todayInvoices, businessData)
      toast.success('Reporte Excel descargado correctamente')
    } catch (error) {
      console.error('Error al generar Excel:', error)
      toast.error('Error al generar el reporte Excel')
    }
  }

  const handleDownloadPDF = async () => {
    try {
      // Obtener datos del negocio
      const businessResult = await getCompanySettings(getBusinessId())
      const businessData = businessResult.success ? businessResult.data : null

      // Usar datos de la sesión cerrada si está disponible, sino usar currentSession
      const sessionData = closedSessionData || currentSession

      await generateCashReportPDF(sessionData, movements, todayInvoices, businessData)
      toast.success('Reporte PDF descargado correctamente')
    } catch (error) {
      console.error('Error al generar PDF:', error)
      toast.error('Error al generar el reporte PDF')
    }
  }

  const handleFinishClosing = () => {
    // Cerrar modal y limpiar estados
    setShowCloseModal(false)
    setClosedSuccessfully(false)
    setClosedSessionData(null)
    setClosingCounts({ cash: '', card: '', transfer: '' })

    // Actualizar el estado local
    setCurrentSession(null)
    setMovements([])

    // Recargar datos
    setTimeout(() => {
      loadData()
    }, 500)
  }

  const handleAddMovement = async () => {
    if (!movementData.amount || parseFloat(movementData.amount) <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    if (!movementData.category) {
      toast.error('Selecciona una categoría')
      return
    }

    if (!movementData.description.trim()) {
      toast.error('Ingresa una descripción')
      return
    }

    try {
      // MODO DEMO: Simular movimiento sin guardar en Firebase
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Agregando movimiento simulado...')
        await new Promise(resolve => setTimeout(resolve, 500)) // Simular delay

        const newMovement = {
          id: `demo-movement-${Date.now()}`,
          type: movementData.type,
          amount: parseFloat(movementData.amount),
          description: movementData.description,
          category: movementData.category,
          createdAt: new Date(),
        }

        // Agregar el movimiento a la lista local
        setMovements(prev => [...prev, newMovement])

        toast.success('Movimiento registrado correctamente (DEMO - No se guardó)', { duration: 5000 })
        setShowMovementModal(false)
        setMovementData({
          type: 'income',
          amount: '',
          description: '',
          category: '',
        })
        return
      }

      const result = await addCashMovement(getBusinessId(), currentSession.id, {
        type: movementData.type,
        amount: parseFloat(movementData.amount),
        description: movementData.description,
        category: movementData.category,
      })

      if (result.success) {
        toast.success('Movimiento registrado correctamente')
        setShowMovementModal(false)
        setMovementData({
          type: 'income',
          amount: '',
          description: '',
          category: '',
        })
        loadData()
      } else {
        toast.error(result.error || 'Error al registrar el movimiento')
      }
    } catch (error) {
      console.error('Error al agregar movimiento:', error)
      toast.error('Error al registrar el movimiento')
    }
  }

  const handleEditMovement = (movement) => {
    setEditingMovement(movement)
    setMovementData({
      type: movement.type,
      amount: movement.amount.toString(),
      description: movement.description,
      category: movement.category,
    })
    setShowMovementModal(true)
  }

  const handleUpdateMovement = async () => {
    if (!movementData.amount || parseFloat(movementData.amount) <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    if (!movementData.category) {
      toast.error('Selecciona una categoría')
      return
    }

    if (!movementData.description.trim()) {
      toast.error('Ingresa una descripción')
      return
    }

    try {
      if (isDemoMode) {
        // Actualizar en la lista local para demo
        setMovements(prev => prev.map(m =>
          m.id === editingMovement.id
            ? { ...m, ...movementData, amount: parseFloat(movementData.amount) }
            : m
        ))
        toast.success('Movimiento actualizado (DEMO)', { duration: 5000 })
        setShowMovementModal(false)
        setEditingMovement(null)
        setMovementData({ type: 'income', amount: '', description: '', category: '' })
        return
      }

      const result = await updateCashMovement(getBusinessId(), editingMovement.id, {
        type: movementData.type,
        amount: parseFloat(movementData.amount),
        description: movementData.description,
        category: movementData.category,
      })

      if (result.success) {
        toast.success('Movimiento actualizado correctamente')
        setShowMovementModal(false)
        setEditingMovement(null)
        setMovementData({ type: 'income', amount: '', description: '', category: '' })
        loadData()
      } else {
        toast.error(result.error || 'Error al actualizar el movimiento')
      }
    } catch (error) {
      console.error('Error al actualizar movimiento:', error)
      toast.error('Error al actualizar el movimiento')
    }
  }

  const handleDeleteMovement = async (movementId) => {
    try {
      if (isDemoMode) {
        setMovements(prev => prev.filter(m => m.id !== movementId))
        toast.success('Movimiento eliminado (DEMO)', { duration: 5000 })
        setShowDeleteMovementConfirm(null)
        return
      }

      const result = await deleteCashMovement(getBusinessId(), movementId)

      if (result.success) {
        toast.success('Movimiento eliminado correctamente')
        setShowDeleteMovementConfirm(null)
        loadData()
      } else {
        toast.error(result.error || 'Error al eliminar el movimiento')
      }
    } catch (error) {
      console.error('Error al eliminar movimiento:', error)
      toast.error('Error al eliminar el movimiento')
    }
  }

  // Cálculos
  const calculateTotals = () => {
    if (!currentSession) return {
      sales: 0,
      salesCash: 0,
      salesCard: 0,
      salesTransfer: 0,
      salesYape: 0,
      salesPlin: 0,
      salesRappi: 0,
      income: 0,
      expense: 0,
      expected: 0,
      difference: 0
    }

    // Inicializar totales por método de pago
    let salesCash = 0
    let salesCard = 0
    let salesTransfer = 0
    let salesYape = 0
    let salesPlin = 0
    let salesRappi = 0

    // Filtrar facturas:
    // - Excluir notas de crédito y débito (no son ventas, son ajustes)
    // - Excluir boletas/facturas convertidas desde notas de venta (para no duplicar)
    // - Excluir documentos anulados (notas de venta, boletas, facturas)
    const validInvoices = todayInvoices.filter(invoice => {
      // Excluir notas de crédito y débito (no son ventas)
      if (invoice.documentType === 'nota_credito' || invoice.documentType === 'nota_debito') {
        return false
      }
      // Si es una boleta convertida desde nota de venta, no contar (ya se contó en la nota)
      if (invoice.convertedFrom) {
        return false
      }
      // Si el documento está anulado o pendiente de anulación por NC, no contar
      if (invoice.status === 'cancelled' || invoice.status === 'voided' ||
          invoice.status === 'pending_cancellation' || invoice.status === 'partial_refund_pending') {
        return false
      }
      return true
    })

    // Recorrer cada factura válida y sumar por método de pago
    validInvoices.forEach(invoice => {
      // Si es venta al crédito pendiente de pago, no sumar nada al control de caja
      if (invoice.paymentStatus === 'pending') {
        return // No contar ventas al crédito sin pagar
      }

      // Verificar si tiene historial de pagos (ventas al crédito o parciales que fueron pagadas)
      // Si tiene paymentHistory, usar eso para obtener los métodos de pago reales
      const hasPaymentHistory = invoice.paymentHistory && Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0

      if (hasPaymentHistory) {
        // Usar el historial de pagos para sumar por método correcto
        // Esto aplica a ventas al crédito pagadas y pagos parciales
        const isPartialPayment = invoice.paymentStatus === 'partial'

        invoice.paymentHistory.forEach(payment => {
          const amount = parseFloat(payment.amount) || 0
          switch (payment.method) {
            case 'Efectivo':
              salesCash += amount
              break
            case 'Tarjeta':
              salesCard += amount
              break
            case 'Transferencia':
              salesTransfer += amount
              break
            case 'Yape':
              salesYape += amount
              break
            case 'Plin':
              salesPlin += amount
              break
            case 'Rappi':
              salesRappi += amount
              break
          }
        })
      } else if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
        // Ventas normales sin historial de pagos - usar array payments
        const invoiceTotal = parseFloat(invoice.total) || 0

        // Si hay un solo método de pago, usar el TOTAL DE LA FACTURA
        if (invoice.payments.length === 1) {
          const method = invoice.payments[0].method
          switch (method) {
            case 'Efectivo':
              salesCash += invoiceTotal
              break
            case 'Tarjeta':
              salesCard += invoiceTotal
              break
            case 'Transferencia':
              salesTransfer += invoiceTotal
              break
            case 'Yape':
              salesYape += invoiceTotal
              break
            case 'Plin':
              salesPlin += invoiceTotal
              break
            case 'Rappi':
              salesRappi += invoiceTotal
              break
          }
        } else {
          // Múltiples métodos de pago: usar los montos reales de cada pago
          invoice.payments.forEach(payment => {
            const amount = parseFloat(payment.amount) || 0
            switch (payment.method) {
              case 'Efectivo':
                salesCash += amount
                break
              case 'Tarjeta':
                salesCard += amount
                break
              case 'Transferencia':
                salesTransfer += amount
                break
              case 'Yape':
                salesYape += amount
                break
              case 'Plin':
                salesPlin += amount
                break
              case 'Rappi':
                salesRappi += amount
                break
            }
          })
        }
      } else {
        // Facturas antiguas sin array payments - usar paymentMethod y sumar el total completo
        // Para pagos parciales, solo sumar amountPaid
        const isPartialPayment = invoice.paymentStatus === 'partial'
        const total = isPartialPayment ? (parseFloat(invoice.amountPaid) || 0) : (invoice.total || 0)

        switch (invoice.paymentMethod) {
          case 'Efectivo':
            salesCash += total
            break
          case 'Tarjeta':
            salesCard += total
            break
          case 'Transferencia':
            salesTransfer += total
            break
          case 'Yape':
            salesYape += total
            break
          case 'Plin':
            salesPlin += total
            break
          case 'Rappi':
            salesRappi += total
            break
        }
      }
    })

    // Total de ventas (todos los métodos)
    const sales = salesCash + salesCard + salesTransfer + salesYape + salesPlin + salesRappi

    // Calcular ventas pendientes de cobro (crédito y pagos parciales)
    let pendingTotal = 0
    let pendingCount = 0
    todayInvoices.forEach(invoice => {
      // Excluir notas de crédito, débito, convertidas y anuladas
      if (invoice.documentType === 'nota_credito' || invoice.documentType === 'nota_debito') return
      if (invoice.convertedFrom) return
      if (invoice.status === 'cancelled' || invoice.status === 'voided' ||
          invoice.status === 'pending_cancellation' || invoice.status === 'partial_refund_pending') return

      // Ventas al crédito (pendientes de cobro total)
      if (invoice.paymentStatus === 'pending') {
        pendingTotal += parseFloat(invoice.total) || 0
        pendingCount++
      }
      // Pagos parciales (saldo pendiente)
      else if (invoice.paymentStatus === 'partial') {
        pendingTotal += parseFloat(invoice.balance) || 0
        pendingCount++
      }
    })

    // Ingresos adicionales (movimientos tipo income)
    const income = movements
      .filter(m => m.type === 'income')
      .reduce((sum, m) => sum + (m.amount || 0), 0)

    // Egresos (movimientos tipo expense)
    const expense = movements
      .filter(m => m.type === 'expense')
      .reduce((sum, m) => sum + (m.amount || 0), 0)

    // Dinero esperado en caja (SOLO efectivo + ingresos - egresos)
    const expected = currentSession.openingAmount + salesCash + income - expense

    // Diferencia (si hay cierre)
    let difference = 0
    if (currentSession.closingAmount !== undefined) {
      difference = currentSession.closingAmount - expected
    }

    return {
      sales,
      salesCash,
      salesCard,
      salesTransfer,
      salesYape,
      salesPlin,
      salesRappi,
      income,
      expense,
      expected,
      difference,
      pendingTotal,
      pendingCount
    }
  }

  const totals = calculateTotals()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Control de Caja</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Gestiona los movimientos de efectivo del día</p>
        </div>

        {/* Selector de Sucursal - Solo mostrar si hay más de una opción */}
        {(branches.length > 0 || !hasMainAccess) && (
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-gray-500" />
            <select
              value={selectedBranch?.id || ''}
              onChange={e => {
                if (e.target.value === '') {
                  setSelectedBranch(null)
                } else {
                  const branch = branches.find(b => b.id === e.target.value)
                  setSelectedBranch(branch)
                }
                // El useEffect recargará datos automáticamente al cambiar selectedBranch
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {/* Solo mostrar Sucursal Principal si el usuario tiene acceso */}
              {hasMainAccess && <option value="">Sucursal Principal</option>}
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {activeTab === 'current' && (
          !currentSession ? (
            <Button onClick={() => setShowOpenModal(true)} className="w-full sm:w-auto">
              <Unlock className="w-4 h-4 mr-2" />
              Abrir Caja
            </Button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setShowMovementModal(true)} className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                Movimiento
              </Button>
              <Button variant="danger" onClick={() => setShowCloseModal(true)} className="w-full sm:w-auto">
                <Lock className="w-4 h-4 mr-2" />
                Cerrar Caja
              </Button>
            </div>
          )
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 sm:space-x-8">
          <button
            onClick={() => setActiveTab('current')}
            className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeTab === 'current'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <DollarSign className="w-4 h-4 inline mr-2" />
            Caja Actual
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeTab === 'history'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <History className="w-4 h-4 inline mr-2" />
            Historial
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'current' ? (
        <>
          {/* Estado de la caja */}
          {currentSession ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Monto Inicial</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(currentSession.openingAmount)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Ventas de la Sesión</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(totals.sales)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">{todayInvoices.length} comprobantes en esta caja</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Otros Ingresos</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {formatCurrency(totals.income)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Egresos</p>
                    <p className="text-2xl font-bold text-red-600">
                      {formatCurrency(totals.expense)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <TrendingDown className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {totals.pendingCount > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Pendiente de Cobro</p>
                      <p className="text-2xl font-bold text-orange-600">
                        {formatCurrency(totals.pendingTotal)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                      <Clock className="w-6 h-6 text-orange-600" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{totals.pendingCount} venta{totals.pendingCount !== 1 ? 's' : ''} sin cobrar</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Resumen y Movimientos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Resumen */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Resumen de Caja</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-xs sm:text-sm text-gray-600">Monto Inicial:</span>
                    <span className="text-sm sm:text-base font-semibold">{formatCurrency(currentSession.openingAmount)}</span>
                  </div>

                  {/* Desglose de ventas por método */}
                  <div className="py-2 border-b">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs sm:text-sm font-medium text-gray-700">Ventas de la Sesión:</span>
                      <span className="text-sm sm:text-base font-bold text-green-600">{formatCurrency(totals.sales)}</span>
                    </div>
                    <div className="pl-3 space-y-1 text-xs">
                      {totals.salesCash > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>• Efectivo:</span>
                          <span className="font-medium text-green-600">{formatCurrency(totals.salesCash)}</span>
                        </div>
                      )}
                      {totals.salesCard > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>• Tarjeta:</span>
                          <span className="font-medium">{formatCurrency(totals.salesCard)}</span>
                        </div>
                      )}
                      {totals.salesTransfer > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>• Transferencia:</span>
                          <span className="font-medium">{formatCurrency(totals.salesTransfer)}</span>
                        </div>
                      )}
                      {totals.salesYape > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>• Yape:</span>
                          <span className="font-medium">{formatCurrency(totals.salesYape)}</span>
                        </div>
                      )}
                      {totals.salesPlin > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>• Plin:</span>
                          <span className="font-medium">{formatCurrency(totals.salesPlin)}</span>
                        </div>
                      )}
                      {totals.salesRappi > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>• Rappi:</span>
                          <span className="font-medium">{formatCurrency(totals.salesRappi)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-xs sm:text-sm text-blue-600">+ Otros Ingresos:</span>
                    <span className="text-sm sm:text-base font-semibold text-blue-600">{formatCurrency(totals.income)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-xs sm:text-sm text-red-600">- Egresos:</span>
                    <span className="text-sm sm:text-base font-semibold text-red-600">{formatCurrency(totals.expense)}</span>
                  </div>
                  {totals.pendingCount > 0 && (
                    <div className="flex justify-between items-center py-2 border-b bg-orange-50 px-2 rounded">
                      <span className="text-xs sm:text-sm text-orange-600">
                        <Clock className="w-3 h-3 inline mr-1" />
                        Pendiente ({totals.pendingCount}):
                      </span>
                      <span className="text-sm sm:text-base font-semibold text-orange-600">{formatCurrency(totals.pendingTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-3 bg-primary-50 px-3 rounded-lg mt-3">
                    <span className="text-sm sm:text-base font-semibold text-primary-900">Efectivo Esperado:</span>
                    <span className="text-lg sm:text-xl font-bold text-primary-600">
                      {formatCurrency(totals.expected)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    <span className="font-medium">Fórmula:</span> Inicial ({formatCurrency(currentSession.openingAmount)}) + Ventas Efectivo ({formatCurrency(totals.salesCash)}) + Ingresos ({formatCurrency(totals.income)}) - Egresos ({formatCurrency(totals.expense)})
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    Abierto: {getDateFromTimestamp(currentSession.openedAt) ? formatDate(getDateFromTimestamp(currentSession.openedAt)) : 'Hoy'}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Movimientos */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Movimientos de la Sesión</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 mb-4">
                  <p className="text-xs sm:text-sm text-blue-800">
                    <strong>Nota:</strong> Las ventas del POS se registran automáticamente.
                    Aquí se muestran solo los movimientos adicionales (pagos, cobros, gastos, etc.)
                    que registres con el botón "Movimiento".
                  </p>
                </div>
                {movements.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm sm:text-base">No hay movimientos adicionales registrados</p>
                    <p className="text-xs sm:text-sm mt-1">Haz clic en "Movimiento" para registrar ingresos o egresos</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {movements.map((movement) => (
                      <div
                        key={movement.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 group"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center ${
                              movement.type === 'income'
                                ? 'bg-green-100'
                                : 'bg-red-100'
                            }`}
                          >
                            {movement.type === 'income' ? (
                              <TrendingUp className="w-5 h-5 text-green-600" />
                            ) : (
                              <TrendingDown className="w-5 h-5 text-red-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm sm:text-base font-medium text-gray-900 truncate">{movement.description}</p>
                            <p className="text-xs text-gray-500">{movement.category}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-0 sm:text-right">
                            <p
                              className={`text-base sm:text-lg font-bold ${
                                movement.type === 'income' ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {movement.type === 'income' ? '+' : '-'} {formatCurrency(movement.amount)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {getDateFromTimestamp(movement.createdAt) ? formatDate(getDateFromTimestamp(movement.createdAt)) : 'Hoy'}
                            </p>
                          </div>
                          {/* Botones de editar/eliminar */}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity sm:ml-2">
                            <button
                              onClick={() => handleEditMovement(movement)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowDeleteMovementConfirm(movement.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Caja Cerrada</h3>
              <p className="text-gray-600 mb-6">
                Para comenzar a registrar ventas y movimientos, abre la caja con el monto inicial
              </p>
              <Button onClick={() => setShowOpenModal(true)}>
                <Unlock className="w-4 h-4 mr-2" />
                Abrir Caja
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
        </>
      ) : (
        /* Historial de Cajas */
        <div className="space-y-4">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : historyData.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <History className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Sin Historial</h3>
                  <p className="text-gray-600">
                    No hay sesiones de caja cerradas anteriormente
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Resumen del historial */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Total Sesiones</p>
                        <p className="text-2xl font-bold text-gray-900">{historyData.length}</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <History className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Total Ventas (Historial)</p>
                        <p className="text-2xl font-bold text-green-600">
                          {formatCurrency(historyData.reduce((sum, s) => sum + (s.totalSales || 0), 0))}
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Diferencia Acumulada</p>
                        {(() => {
                          const totalDiff = historyData.reduce((sum, s) => sum + (s.difference || 0), 0)
                          return (
                            <p className={`text-2xl font-bold ${totalDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(totalDiff)}
                            </p>
                          )
                        })()}
                      </div>
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                        <DollarSign className="w-6 h-6 text-gray-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Lista de sesiones */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Sesiones Anteriores
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {historyData.map((session) => {
                      const openedAt = getDateFromTimestamp(session.openedAt)
                      const closedAt = getDateFromTimestamp(session.closedAt)
                      const difference = session.difference || 0

                      return (
                        <div
                          key={session.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer"
                          onClick={() => handleViewHistoryDetail(session)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <Calendar className="w-6 h-6 text-primary-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">
                                {openedAt ? openedAt.toLocaleDateString('es-PE', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                }) : 'Fecha desconocida'}
                              </p>
                              <p className="text-sm text-gray-500">
                                {openedAt ? openedAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : ''} - {closedAt ? closedAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 sm:gap-6">
                            <div className="text-center">
                              <p className="text-xs text-gray-500">Ventas</p>
                              <p className="font-semibold text-green-600">{formatCurrency(session.totalSales || 0)}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-500">Cierre</p>
                              <p className="font-semibold text-gray-900">{formatCurrency(session.closingCash || 0)}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-500">Diferencia</p>
                              <p className={`font-semibold ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 hidden sm:block" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Modal Detalle de Historial */}
      <Modal
        isOpen={showHistoryDetailModal}
        onClose={() => {
          setShowHistoryDetailModal(false)
          setSelectedHistorySession(null)
          setHistoryMovements([])
          setIsEditingHistory(false) // TEMPORAL: Resetear estado de edición
        }}
        title="Detalle de Sesión"
        size="lg"
      >
        {selectedHistorySession && (
          <div className="space-y-6">
            {/* Fecha y hora + Botón Editar */}
            <div className="text-center py-4 bg-gray-50 rounded-lg relative">
              {/* TEMPORAL: Botón de editar */}
              {!isEditingHistory && (
                <button
                  onClick={startEditingHistory}
                  className="absolute top-2 right-2 p-2 text-gray-500 hover:text-primary-600 hover:bg-white rounded-lg transition-colors"
                  title="Editar sesión"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              <p className="text-lg font-semibold text-gray-900">
                {getDateFromTimestamp(selectedHistorySession.openedAt)?.toLocaleDateString('es-PE', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Apertura: {getDateFromTimestamp(selectedHistorySession.openedAt)?.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} |
                Cierre: {getDateFromTimestamp(selectedHistorySession.closedAt)?.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-xs text-blue-600 font-medium">Monto Inicial</p>
                {isEditingHistory ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editValues.openingAmount}
                    onChange={e => setEditValues({ ...editValues, openingAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xl font-bold text-blue-700 bg-white border border-blue-300 rounded px-2 py-1"
                  />
                ) : (
                  <p className="text-xl font-bold text-blue-700">{formatCurrency(selectedHistorySession.openingAmount || 0)}</p>
                )}
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-xs text-green-600 font-medium">Ventas del Día</p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(selectedHistorySession.totalSales || 0)}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-xs text-purple-600 font-medium">Otros Ingresos</p>
                <p className="text-xl font-bold text-purple-700">{formatCurrency(selectedHistorySession.totalIncome || 0)}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-xs text-red-600 font-medium">Egresos</p>
                <p className="text-xl font-bold text-red-700">{formatCurrency(selectedHistorySession.totalExpense || 0)}</p>
              </div>
            </div>

            {/* Cierre */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="font-semibold text-gray-900 mb-3">Arqueo de Cierre</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Efectivo Contado:</span>
                  {isEditingHistory ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editValues.closingCash}
                      onChange={e => setEditValues({ ...editValues, closingCash: parseFloat(e.target.value) || 0 })}
                      className="w-32 text-right font-semibold bg-white border border-gray-300 rounded px-2 py-1"
                    />
                  ) : (
                    <span className="font-semibold">{formatCurrency(selectedHistorySession.closingCash || 0)}</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Tarjetas:</span>
                  {isEditingHistory ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editValues.closingCard}
                      onChange={e => setEditValues({ ...editValues, closingCard: parseFloat(e.target.value) || 0 })}
                      className="w-32 text-right font-semibold bg-white border border-gray-300 rounded px-2 py-1"
                    />
                  ) : (
                    <span className="font-semibold">{formatCurrency(selectedHistorySession.closingCard || 0)}</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Transferencias:</span>
                  {isEditingHistory ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editValues.closingTransfer}
                      onChange={e => setEditValues({ ...editValues, closingTransfer: parseFloat(e.target.value) || 0 })}
                      className="w-32 text-right font-semibold bg-white border border-gray-300 rounded px-2 py-1"
                    />
                  ) : (
                    <span className="font-semibold">{formatCurrency(selectedHistorySession.closingTransfer || 0)}</span>
                  )}
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                  <span className="text-gray-600">Efectivo Esperado:</span>
                  <span className="font-semibold">{formatCurrency(selectedHistorySession.expectedAmount || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-700">Diferencia:</span>
                  <span className={`font-bold ${(selectedHistorySession.difference || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(selectedHistorySession.difference || 0) > 0 ? '+' : ''}{formatCurrency(selectedHistorySession.difference || 0)}
                    {(selectedHistorySession.difference || 0) !== 0 && (
                      <span className="text-xs ml-1">
                        ({(selectedHistorySession.difference || 0) > 0 ? 'Sobrante' : 'Faltante'})
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* TEMPORAL: Botones de guardar/cancelar edición */}
            {isEditingHistory && (
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={() => setIsEditingHistory(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveHistoryEdit}
                  className="flex-1"
                >
                  Guardar Cambios
                </Button>
              </div>
            )}

            {/* Movimientos */}
            {historyMovements.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Movimientos Adicionales</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {historyMovements.map((movement) => (
                    <div key={movement.id} className="p-2 bg-gray-50 rounded">
                      {editingMovement?.id === movement.id ? (
                        /* TEMPORAL: Formulario de edición inline */
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editMovementValues.description}
                            onChange={e => setEditMovementValues({ ...editMovementValues, description: e.target.value })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            placeholder="Descripción"
                          />
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.01"
                              value={editMovementValues.amount}
                              onChange={e => setEditMovementValues({ ...editMovementValues, amount: e.target.value })}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                              placeholder="Monto"
                            />
                            <button
                              onClick={handleSaveMovementEdit}
                              className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => setEditingMovement(null)}
                              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Vista normal con botones de editar/eliminar */
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {movement.type === 'income' ? (
                              <TrendingUp className="w-4 h-4 text-green-600" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-600" />
                            )}
                            <span className="text-sm text-gray-700">{movement.description}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${movement.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                              {movement.type === 'income' ? '+' : '-'}{formatCurrency(movement.amount)}
                            </span>
                            {/* TEMPORAL: Botones editar/eliminar */}
                            <button
                              onClick={() => handleEditHistoryMovement(movement)}
                              className="p-1 text-gray-400 hover:text-primary-600"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteHistoryMovement(movement)}
                              className="p-1 text-gray-400 hover:text-red-600"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const businessResult = await getCompanySettings(getBusinessId())
                    const businessData = businessResult.success ? businessResult.data : null
                    await generateCashReportPDF(selectedHistorySession, historyMovements, [], businessData)
                    toast.success('PDF descargado')
                  } catch (error) {
                    toast.error('Error al generar PDF')
                  }
                }}
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const businessResult = await getCompanySettings(getBusinessId())
                    const businessData = businessResult.success ? businessResult.data : null
                    await generateCashReportExcel(selectedHistorySession, historyMovements, [], businessData)
                    toast.success('Excel descargado')
                  } catch (error) {
                    toast.error('Error al generar Excel')
                  }
                }}
                className="flex-1"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button
                onClick={() => {
                  setShowHistoryDetailModal(false)
                  setSelectedHistorySession(null)
                  setHistoryMovements([])
                }}
                className="flex-1"
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Abrir Caja */}
      <Modal
        isOpen={showOpenModal}
        onClose={() => {
          setShowOpenModal(false)
          setOpeningAmount('')
        }}
        title="Abrir Caja"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Ingresa el monto inicial en efectivo con el que comienza el día
          </p>
          <Input
            label="Monto Inicial"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={openingAmount}
            onChange={(e) => setOpeningAmount(e.target.value)}
            required
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowOpenModal(false)
                setOpeningAmount('')
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleOpenCashRegister}>
              <Unlock className="w-4 h-4 mr-2" />
              Abrir Caja
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Cerrar Caja */}
      <Modal
        isOpen={showCloseModal}
        onClose={() => {
          if (!closedSuccessfully) {
            setShowCloseModal(false)
            setClosingCounts({ cash: '', card: '', transfer: '' })
          }
        }}
        title={closedSuccessfully ? "Caja Cerrada Exitosamente" : "Cerrar Caja"}
        size="lg"
      >
        {!closedSuccessfully ? (
          // Formulario de cierre
          <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Arqueo de Caja:</strong> Cuenta el dinero físico y registra los montos por método de pago
            </p>
          </div>

          {/* Desglose de ventas esperadas */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium text-gray-700 mb-3">Resumen de Ventas de la Sesión:</p>

            {totals.salesCash > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">• Ventas en Efectivo:</span>
                <span className="font-semibold text-green-600">{formatCurrency(totals.salesCash)}</span>
              </div>
            )}

            {totals.salesCard > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">• Ventas en Tarjeta:</span>
                <span className="font-semibold text-gray-700">{formatCurrency(totals.salesCard)}</span>
              </div>
            )}

            {totals.salesTransfer > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">• Ventas en Transferencia:</span>
                <span className="font-semibold text-gray-700">{formatCurrency(totals.salesTransfer)}</span>
              </div>
            )}

            {totals.salesYape > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">• Ventas en Yape:</span>
                <span className="font-semibold text-gray-700">{formatCurrency(totals.salesYape)}</span>
              </div>
            )}

            {totals.salesPlin > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">• Ventas en Plin:</span>
                <span className="font-semibold text-gray-700">{formatCurrency(totals.salesPlin)}</span>
              </div>
            )}

            {totals.salesRappi > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">• Ventas en Rappi:</span>
                <span className="font-semibold text-gray-700">{formatCurrency(totals.salesRappi)}</span>
              </div>
            )}

            <div className="border-t border-gray-300 pt-2 mt-3">
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-gray-700">Efectivo Esperado:</span>
                <span className="text-xl font-bold text-primary-600">{formatCurrency(totals.expected)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Inicial ({formatCurrency(currentSession?.openingAmount || 0)}) + Ventas Efectivo + Ingresos - Egresos
              </p>
            </div>
          </div>

          <Input
            label="Efectivo Contado"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={closingCounts.cash}
            onChange={(e) => setClosingCounts({ ...closingCounts, cash: e.target.value })}
            helperText="Cuenta el dinero en efectivo de la caja"
            required
          />

          <Input
            label="Total en Tarjetas"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={closingCounts.card}
            onChange={(e) => setClosingCounts({ ...closingCounts, card: e.target.value })}
            helperText="Suma de vouchers o reportes de tarjetas"
          />

          <Input
            label="Total en Transferencias"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={closingCounts.transfer}
            onChange={(e) => setClosingCounts({ ...closingCounts, transfer: e.target.value })}
            helperText="Suma de transferencias recibidas"
          />

          {closingCounts.cash && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-1">Diferencia:</p>
              <p
                className={`text-xl font-bold ${
                  parseFloat(closingCounts.cash) - totals.expected >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {formatCurrency(parseFloat(closingCounts.cash || 0) - totals.expected)}
              </p>
              {parseFloat(closingCounts.cash) - totals.expected !== 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {parseFloat(closingCounts.cash) - totals.expected > 0 ? 'Sobrante' : 'Faltante'}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 pt-4">
            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCloseModal(false)
                  setClosingCounts({ cash: '', card: '', transfer: '' })
                }}
                className="w-full"
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={handleCloseCashRegister}
                className="w-full"
              >
                <Lock className="w-4 h-4 mr-2" />
                Cerrar Caja
              </Button>
            </div>
          </div>
        </div>
        ) : (
          // Pantalla de éxito
          <div className="space-y-6">
            {/* Mensaje de éxito */}
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Caja Cerrada Exitosamente</h3>
              <p className="text-gray-600">
                Hora de cierre: {closedSessionData?.closedAt ? formatDate(closedSessionData.closedAt) : ''}
              </p>
            </div>

            {/* Resumen de cierre */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Efectivo Esperado:</span>
                <span className="font-semibold">{formatCurrency(closedSessionData?.expectedAmount || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Efectivo Contado:</span>
                <span className="font-semibold">{formatCurrency(closedSessionData?.closingCash || 0)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-300 pt-2">
                <span className="text-gray-700 font-medium">Diferencia:</span>
                <span className={`font-bold ${
                  (closedSessionData?.difference || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatCurrency(closedSessionData?.difference || 0)}
                  <span className="text-xs ml-1">
                    {(closedSessionData?.difference || 0) > 0 ? '(Sobrante)' : (closedSessionData?.difference || 0) < 0 ? '(Faltante)' : ''}
                  </span>
                </span>
              </div>
            </div>

            {/* Botones de descarga */}
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">Descarga el reporte de cierre de caja:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={handleDownloadExcel}
                  className="w-full"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Descargar Excel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadPDF}
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar PDF
                </Button>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="pt-4 border-t border-gray-200">
              <Button
                onClick={handleFinishClosing}
                className="w-full"
              >
                Finalizar Cierre
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Agregar/Editar Movimiento */}
      <Modal
        isOpen={showMovementModal}
        onClose={() => {
          setShowMovementModal(false)
          setEditingMovement(null)
          setMovementData({
            type: 'income',
            amount: '',
            description: '',
            category: '',
          })
        }}
        title={editingMovement ? 'Editar Movimiento' : 'Registrar Movimiento'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Movimiento
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMovementData({ ...movementData, type: 'income' })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  movementData.type === 'income'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <TrendingUp className="w-5 h-5 mx-auto mb-1" />
                <span className="text-sm font-medium">Ingreso</span>
              </button>
              <button
                type="button"
                onClick={() => setMovementData({ ...movementData, type: 'expense' })}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  movementData.type === 'expense'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <TrendingDown className="w-5 h-5 mx-auto mb-1" />
                <span className="text-sm font-medium">Egreso</span>
              </button>
            </div>
          </div>

          <Input
            label="Monto"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={movementData.amount}
            onChange={(e) => setMovementData({ ...movementData, amount: e.target.value })}
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoría
            </label>
            <select
              value={movementData.category}
              onChange={(e) => setMovementData({ ...movementData, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Selecciona una categoría</option>
              {movementData.type === 'income' ? (
                <>
                  <option value="Venta Directa">Venta Directa (sin factura)</option>
                  <option value="Cobro a Cliente">Cobro a Cliente</option>
                  <option value="Préstamo">Préstamo</option>
                  <option value="Otros Ingresos">Otros Ingresos</option>
                </>
              ) : (
                <>
                  <option value="Pago a Proveedor">Pago a Proveedor</option>
                  <option value="Servicios">Servicios (luz, agua, internet)</option>
                  <option value="Transporte">Transporte</option>
                  <option value="Sueldos">Sueldos y Salarios</option>
                  <option value="Gastos Operativos">Gastos Operativos</option>
                  <option value="Otros Gastos">Otros Gastos</option>
                </>
              )}
            </select>
          </div>

          <Input
            label="Descripción"
            placeholder="Describe el motivo del movimiento"
            value={movementData.description}
            onChange={(e) => setMovementData({ ...movementData, description: e.target.value })}
            required
            helperText="Ej: Pago de luz del mes, cobro factura #001-123"
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowMovementModal(false)
                setEditingMovement(null)
                setMovementData({
                  type: 'income',
                  amount: '',
                  description: '',
                  category: '',
                })
              }}
            >
              Cancelar
            </Button>
            <Button onClick={editingMovement ? handleUpdateMovement : handleAddMovement}>
              {editingMovement ? (
                <>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Actualizar
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmar Eliminación de Movimiento */}
      <Modal
        isOpen={!!showDeleteMovementConfirm}
        onClose={() => setShowDeleteMovementConfirm(null)}
        title="Eliminar Movimiento"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <Trash2 className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <p className="text-center text-gray-600">
            ¿Estás seguro de eliminar este movimiento? Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowDeleteMovementConfirm(null)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDeleteMovement(showDeleteMovementConfirm)}
              className="flex-1"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
