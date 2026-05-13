import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Lock, Unlock, Plus, Calendar, Download, FileSpreadsheet, History, Eye, ChevronRight, Edit2, Trash2, Store, Clock, Printer, Loader2, User, FileText, AlertTriangle } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getActiveBranches } from '@/services/branchService'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { isMultiCurrencyEnabled, normalizeCurrency } from '@/utils/currency'
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
  getOpenCashSessions,
  getClosedWithoutReceipt,
  getOrderModificationsAfterPrecuenta,
} from '@/services/firestoreService'
import { getManagedUsers } from '@/services/userManagementService'
import { generateCashReportExcel, generateCashReportPDF } from '@/services/cashReportService'
import CashClosureTicket from '@/components/CashClosureTicket'
import { Capacitor } from '@capacitor/core'

export default function CashRegister() {
  const { user, isDemoMode, demoData, getBusinessId, filterBranchesByAccess, allowedBranches, userPermissions, independentCashRegister, isAdmin, isBusinessOwner, businessSettings } = useAppContext()
  // Si está activado el toggle "ocultar efectivo esperado a cajeros" y el usuario actual
  // no es dueño/admin, escondemos el monto esperado y la diferencia para que el cajero
  // no lo vea — solo cuente y reporte. El dueño podrá comparar después.
  const hideExpectedForCashier = !isAdmin && !isBusinessOwner && !!businessSettings?.hideCashExpectedFromCashier
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [currentSession, setCurrentSession] = useState(null)
  const [movements, setMovements] = useState([])
  const [todayInvoices, setTodayInvoices] = useState([])

  // Sucursales
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null) // null = Sucursal Principal
  const [hasMainAccess, setHasMainAccess] = useState(true) // Acceso a Sucursal Principal

  // Selector de usuario (owner ve cajas de sub-usuarios)
  const [subUsers, setSubUsers] = useState([])
  const [selectedCashUser, setSelectedCashUser] = useState(null) // null = mi caja, 'all' = todos, o uid del sub-usuario
  const [openSessions, setOpenSessions] = useState([]) // sesiones abiertas en la sucursal

  // Filtro por usuario que realizó cada venta (aplica a tabla de comprobantes)
  const [invoiceUserFilter, setInvoiceUserFilter] = useState('all') // 'all' o uid del usuario
  const [historyInvoiceUserFilter, setHistoryInvoiceUserFilter] = useState('all')

  // Tab state: 'current' o 'history'
  const [activeTab, setActiveTab] = useState('current')
  const [historyData, setHistoryData] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [selectedHistorySession, setSelectedHistorySession] = useState(null)
  const [historyMovements, setHistoryMovements] = useState([])
  const [historyInvoices, setHistoryInvoices] = useState([])
  const [historyClosedWithoutReceipt, setHistoryClosedWithoutReceipt] = useState([])
  const [historyOrderModifications, setHistoryOrderModifications] = useState([])

  // TEMPORAL: Estados para edición de historial
  const [isEditingHistory, setIsEditingHistory] = useState(false)
  const [editValues, setEditValues] = useState({
    openingAmount: 0,
    closingCash: 0,
    closingCard: 0,
    closingTransfer: 0,
    closingYape: 0,
    closingPlin: 0,
    closingRappi: 0,
    closingPedidosYa: 0,
    closingDiDiFood: 0,
  })
  const [editMovementValues, setEditMovementValues] = useState({ description: '', amount: 0 })

  // Helper para convertir fechas (Firestore Timestamp o Date)
  const getDateFromTimestamp = (timestamp) => {
    if (!timestamp) return null
    return timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  }

  // Devuelve lista única de usuarios que realizaron ventas en el conjunto de comprobantes
  const getInvoiceUserOptions = (invoices) => {
    const map = new Map()
    invoices.forEach(inv => {
      const uid = inv.createdBy || 'unknown'
      const name = inv.createdByName || inv.createdByEmail || 'Sin identificar'
      if (!map.has(uid)) map.set(uid, name)
    })
    return Array.from(map.entries()).map(([uid, name]) => ({ uid, name }))
  }

  // Modal states
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [closedSuccessfully, setClosedSuccessfully] = useState(false)
  const [closedSessionData, setClosedSessionData] = useState(null)
  const [isClosing, setIsClosing] = useState(false)
  const [isOpening, setIsOpening] = useState(false)
  const [showHistoryDetailModal, setShowHistoryDetailModal] = useState(false)

  // Form states
  const [openingAmount, setOpeningAmount] = useState('')
  const [closingCounts, setClosingCounts] = useState({
    cash: '',
    card: '',
    transfer: '',
    yape: '',
    plin: '',
    rappi: '',
    pedidosYa: '',
    diDiFood: '',
  })
  // Multi-divisa: paralelo en USD. Solo se usan/muestran cuando el negocio
  // activó la flag multiCurrencyEnabled en Configuración → Ventas.
  const cashMultiCurrencyOn = isMultiCurrencyEnabled(businessSettings)
  const [openingAmountUSD, setOpeningAmountUSD] = useState('')
  const [closingCountsUSD, setClosingCountsUSD] = useState({
    cash: '',
    card: '',
    transfer: '',
    yape: '',
    plin: '',
    rappi: '',
    pedidosYa: '',
    diDiFood: '',
  })
  const [movementData, setMovementData] = useState({
    type: 'income',
    amount: '',
    description: '',
    category: '',
    currency: 'PEN', // Multi-divisa: solo aplica si cashMultiCurrencyOn
  })

  // Estados para editar/eliminar movimientos
  const [editingMovement, setEditingMovement] = useState(null)
  const [showDeleteMovementConfirm, setShowDeleteMovementConfirm] = useState(null)

  // Estado para datos del negocio (para impresión de ticket)
  const [companySettings, setCompanySettings] = useState(null)
  // Estado para la sesión que se va a imprimir (puede ser cierre actual o historial)
  const [printSessionData, setPrintSessionData] = useState(null)
  const [printMovements, setPrintMovements] = useState([])

  // Estado para impresión térmica (Bluetooth/WiFi)
  const [isPrinterConnected, setIsPrinterConnected] = useState(false)
  const [printerConfig, setPrinterConfig] = useState(null)
  const [isPrintingThermal, setIsPrintingThermal] = useState(false)
  const isNative = Capacitor.isNativePlatform()

  // Es owner (no sub-usuario)
  const isOwner = !userPermissions?.ownerId

  useEffect(() => {
    if (user?.uid) {
      loadBranches()
    }
  }, [user])

  // Recargar datos cuando cambia la sucursal seleccionada o el usuario seleccionado
  useEffect(() => {
    if (user?.uid) {
      loadData()
    }
  }, [user, selectedBranch, selectedCashUser, subUsers])

  // Función para cargar sesiones abiertas (para el selector de usuario)
  const refreshOpenSessions = async () => {
    if (!user?.uid || isDemoMode || !isOwner || subUsers.length === 0) return
    try {
      const branchId = selectedBranch?.id || null
      const result = await getOpenCashSessions(getBusinessId(), branchId)
      if (result.success) {
        setOpenSessions(result.data || [])
      }
    } catch (error) {
      console.error('Error al cargar sesiones abiertas:', error)
    }
  }

  // Cargar sesiones abiertas cuando cambia la sucursal (para el selector de usuario)
  useEffect(() => {
    refreshOpenSessions()
  }, [user, selectedBranch, subUsers, isDemoMode])

  // Cargar configuración de impresora térmica (para impresión Bluetooth/WiFi)
  useEffect(() => {
    const loadPrinterConfig = async () => {
      if (!user?.uid || !isNative) return
      try {
        const { getPrinterConfig, connectPrinter } = await import('@/services/thermalPrinterService')
        const printerConfigResult = await getPrinterConfig(getBusinessId())
        if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
          setPrinterConfig(printerConfigResult.config)
          // Intentar conectar a la impresora
          const connectResult = await connectPrinter(printerConfigResult.config.address)
          setIsPrinterConnected(connectResult.success)
        }
      } catch (error) {
        console.warn('No se pudo cargar config de impresora:', error)
      }
    }
    loadPrinterConfig()
  }, [user, isNative])

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

      // Cargar sub-usuarios si es owner
      if (isOwner) {
        const usersResult = await getManagedUsers(getBusinessId())
        if (usersResult.success && usersResult.data.length > 0) {
          setSubUsers(usersResult.data)
        }
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

      // Sub-usuario sin caja independiente: comparte la caja del owner
      const isSubUser = userPermissions && userPermissions.ownerId
      const isSharedCashUser = isSubUser && !independentCashRegister

      // Determinar el usuario objetivo para la sesión de caja
      // Owner y sub-usuarios compartidos usan la misma caja global (userUid = null)
      // Solo sub-usuarios con caja independiente tienen su propia sesión
      let targetUserUid
      if (isSharedCashUser || (!isSubUser && (!selectedCashUser || selectedCashUser === 'all'))) {
        // Owner "Mi Caja" o sub-usuario compartido: caja global
        targetUserUid = null
      } else if (selectedCashUser && selectedCashUser !== 'all') {
        // Owner viendo caja de sub-usuario independiente
        targetUserUid = selectedCashUser
      } else {
        // Sub-usuario con caja independiente
        targetUserUid = user.uid
      }
      const isViewingAll = selectedCashUser === 'all'

      // Construir set de UIDs cuyas ventas se suman a esta caja
      // Owner "Mi Caja": incluir su UID + UIDs de sub-usuarios sin caja independiente
      // Sub-usuario compartido: no filtrar (ver todas las ventas de la sesión)
      let allowedCreatedByUids = null // null = no filtrar por createdBy
      if (!isSharedCashUser && !isViewingAll) {
        if (isOwner && !selectedCashUser) {
          // Owner viendo "Mi Caja": incluir ventas propias + sub-usuarios compartidos
          const sharedSubUserUids = subUsers
            .filter(u => !u.independentCashRegister)
            .map(u => u.uid || u.id)
          allowedCreatedByUids = new Set([user.uid, ...sharedSubUserUids])
        } else if (selectedCashUser && selectedCashUser !== 'all') {
          // Owner viendo caja de un sub-usuario específico (con caja independiente)
          allowedCreatedByUids = new Set([selectedCashUser])
        } else if (!isOwner && !isSharedCashUser) {
          // Sub-usuario con caja independiente: solo sus propias ventas
          allowedCreatedByUids = new Set([user.uid])
        }
      }

      // Obtener sesión actual para la sucursal seleccionada y el usuario objetivo
      const branchId = selectedBranch?.id || null

      if (isViewingAll) {
        // Modo "Todos": no mostrar sesión individual, solo se usa en historial
        setCurrentSession(null)
        setMovements([])
        setTodayInvoices([])
      } else {
        const sessionResult = await getCashRegisterSession(getBusinessId(), branchId, targetUserUid)
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
        // Pasar fecha de apertura a Firestore para no traer todas las facturas
        if (sessionResult.success && sessionResult.data) {
          const sessionOpenedAt = sessionResult.data.openedAt?.toDate
            ? sessionResult.data.openedAt.toDate()
            : new Date(sessionResult.data.openedAt)

          const invoicesResult = await getInvoicesByBranch(getBusinessId(), branchId, sessionOpenedAt)
          if (invoicesResult.success) {
            // Filtrar por usuario que creó la factura
            const sessionInvoicesList = (invoicesResult.data || []).filter(invoice => {
              if (allowedCreatedByUids) {
                if (invoice.createdBy && !allowedCreatedByUids.has(invoice.createdBy)) return false
              }
              return true
            })
            setTodayInvoices(sessionInvoicesList)
          }
        } else {
          setTodayInvoices([])
        }
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
      // Determinar filtro de usuario para historial
      // Owner y sub-usuarios compartidos usan la misma caja global
      const isSubUser = userPermissions && userPermissions.ownerId
      const isSharedCashUser = isSubUser && !independentCashRegister
      let historyUserUid = null
      if (isSubUser && !isSharedCashUser) {
        // Sub-usuario con caja independiente: ve solo sus propias sesiones
        historyUserUid = user.uid
      } else if (isSharedCashUser) {
        // Sub-usuario con caja compartida: ve las sesiones globales
        historyUserUid = 'global'
      } else if (selectedCashUser && selectedCashUser !== 'all') {
        // Owner viendo caja de un sub-usuario independiente específico
        historyUserUid = selectedCashUser
      } else if (!selectedCashUser) {
        // Owner "Mi Caja": ve sesiones globales (las que comparte con sub-usuarios)
        historyUserUid = 'global'
      }
      // Si selectedCashUser es 'all', historyUserUid queda null -> muestra todas
      const result = await getCashRegisterHistory(getBusinessId(), { branchId, userUid: historyUserUid })
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
        closingYape: editValues.closingYape,
        closingPlin: editValues.closingPlin,
        closingRappi: editValues.closingRappi,
        closingPedidosYa: editValues.closingPedidosYa,
        closingDiDiFood: editValues.closingDiDiFood,
        totalSales: selectedHistorySession.totalSales || 0,
        salesCash: selectedHistorySession.salesCash || 0,
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
      closingYape: selectedHistorySession.closingYape || 0,
      closingPlin: selectedHistorySession.closingPlin || 0,
      closingRappi: selectedHistorySession.closingRappi || 0,
      closingPedidosYa: selectedHistorySession.closingPedidosYa || 0,
      closingDiDiFood: selectedHistorySession.closingDiDiFood || 0,
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
    setHistoryInvoices([])
    setHistoryClosedWithoutReceipt([])
    setHistoryOrderModifications([])
    setHistoryInvoiceUserFilter('all')

    // Cargar movimientos, facturas y cierres sin comprobante de esa sesión
    if (!isDemoMode) {
      try {
        const movementsResult = await getCashMovements(getBusinessId(), session.id)
        if (movementsResult.success) {
          setHistoryMovements(movementsResult.data || [])
        }

        // Cargar facturas de la sesión
        const sessionOpenedAt = session.openedAt?.toDate
          ? session.openedAt.toDate()
          : new Date(session.openedAt)
        const sessionClosedAt = session.closedAt?.toDate
          ? session.closedAt.toDate()
          : session.closedAt ? new Date(session.closedAt) : new Date()
        const branchId = session.branchId || selectedBranch?.id || null
        const invoicesResult = await getInvoicesByBranch(getBusinessId(), branchId, sessionOpenedAt)
        if (invoicesResult.success) {
          // Pertenecen a la sesión:
          //   1. Comprobantes creados dentro de la ventana (open..close), O
          //   2. Comprobantes anteriores que recibieron al menos un pago en la ventana.
          // El query trae ambos casos (createdAt + lastPaymentDate). Acá filtramos
          // los falsos positivos (lastPaymentDate fuera del cierre de esta sesión,
          // por ejemplo un pago hecho en una sesión posterior).
          const isInWindow = (d) => d && d >= sessionOpenedAt && d <= sessionClosedAt
          const inSession = (invoicesResult.data || []).filter(inv => {
            const created = inv.createdAt?.toDate?.() || (inv.createdAt ? new Date(inv.createdAt) : null)
            if (isInWindow(created)) return true
            if (Array.isArray(inv.paymentHistory)) {
              return inv.paymentHistory.some(p => {
                const pd = p.date?.toDate?.() || (p.date ? new Date(p.date) : null)
                return isInWindow(pd)
              })
            }
            return false
          })
          setHistoryInvoices(inSession)
        }
        const closedResult = await getClosedWithoutReceipt(getBusinessId(), sessionOpenedAt, sessionClosedAt)
        if (closedResult.success) {
          setHistoryClosedWithoutReceipt(closedResult.data || [])
        }

        // Cargar modificaciones de órdenes después de precuenta
        const modsResult = await getOrderModificationsAfterPrecuenta(getBusinessId(), sessionOpenedAt, sessionClosedAt)
        if (modsResult.success) {
          setHistoryOrderModifications(modsResult.data || [])
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

  // Cargar historial cuando se cambia a esa pestaña o cuando cambia la sucursal/usuario
  useEffect(() => {
    if (activeTab === 'history' && user?.uid) {
      loadHistory()
    }
  }, [activeTab, user?.uid, selectedBranch, selectedCashUser])

  const handleOpenCashRegister = async () => {
    if (isOpening) return
    if (!openingAmount || parseFloat(openingAmount) < 0) {
      toast.error('Ingresa un monto inicial válido')
      return
    }

    setIsOpening(true)
    try {
      // MODO DEMO: Simular apertura sin guardar en Firebase
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Abriendo caja simulada...')
        await new Promise(resolve => setTimeout(resolve, 500)) // Simular delay

        const demoSession = {
          id: `demo-session-${Date.now()}`,
          openingAmount: parseFloat(openingAmount),
          ...(cashMultiCurrencyOn && parseFloat(openingAmountUSD) > 0 && {
            openingAmountUSD: parseFloat(openingAmountUSD),
          }),
          openedAt: new Date(),
          openedBy: user.displayName,
          status: 'open'
        }

        setCurrentSession(demoSession)
        toast.success('Caja abierta correctamente (DEMO - No se guardó)', { duration: 5000 })
        setShowOpenModal(false)
        setOpeningAmount('')
        setOpeningAmountUSD('')
        return
      }

      const branchId = selectedBranch?.id || null
      // Owner y sub-usuarios compartidos abren la caja global (sin userUid)
      // Solo sub-usuarios con caja independiente abren su propia caja
      const isSubUser = userPermissions && userPermissions.ownerId
      const isSharedCashUser = isSubUser && !independentCashRegister
      const isIndependentSubUser = isSubUser && independentCashRegister
      const openUserUid = isIndependentSubUser ? user.uid : null
      const openUserName = user.displayName || user.email || 'Usuario'
      // Multi-divisa: si la flag está activa y el cajero declaró un saldo
      // inicial en USD > 0, lo enviamos al servicio. Si no, parámetro 0.
      const openUSD = cashMultiCurrencyOn ? (parseFloat(openingAmountUSD) || 0) : 0
      const result = await openCashRegister(getBusinessId(), parseFloat(openingAmount), branchId, openUserUid, openUserName, openUSD)
      if (result.success) {
        toast.success('Caja abierta correctamente')
        setShowOpenModal(false)
        setOpeningAmount('')
        setOpeningAmountUSD('')
        loadData()
        refreshOpenSessions()
      } else {
        toast.error(result.error || 'Error al abrir la caja')
      }
    } catch (error) {
      console.error('Error al abrir caja:', error)
      toast.error('Error al abrir la caja')
    } finally {
      setIsOpening(false)
    }
  }

  const handleCloseCashRegister = async () => {
    if (isClosing) return
    const cash = parseFloat(closingCounts.cash) || 0
    const card = parseFloat(closingCounts.card) || 0
    const transfer = parseFloat(closingCounts.transfer) || 0
    const yape = parseFloat(closingCounts.yape) || 0
    const plin = parseFloat(closingCounts.plin) || 0
    const rappi = parseFloat(closingCounts.rappi) || 0
    const pedidosYa = parseFloat(closingCounts.pedidosYa) || 0
    const diDiFood = parseFloat(closingCounts.diDiFood) || 0

    // Multi-divisa: arqueo USD (solo si hay actividad USD detectada)
    const cashUSD = parseFloat(closingCountsUSD.cash) || 0
    const cardUSD = parseFloat(closingCountsUSD.card) || 0
    const transferUSD = parseFloat(closingCountsUSD.transfer) || 0
    const yapeUSD = parseFloat(closingCountsUSD.yape) || 0
    const plinUSD = parseFloat(closingCountsUSD.plin) || 0
    const rappiUSD = parseFloat(closingCountsUSD.rappi) || 0
    const pedidosYaUSD = parseFloat(closingCountsUSD.pedidosYa) || 0
    const diDiFoodUSD = parseFloat(closingCountsUSD.diDiFood) || 0

    setIsClosing(true)
    try {
      // Cargar datos del negocio para la impresión del ticket
      const businessResult = await getCompanySettings(getBusinessId())
      if (businessResult.success) {
        setCompanySettings(businessResult.data)
      }
      // Cantidad de comprobantes creados en esta sesión (excluye notas previas
      // que entraron por haber recibido pagos hoy — esas van como deferredPayments).
      const sessionOnlyInvoicesCount = (() => {
        const openedAt = toDate(currentSession?.openedAt)
        if (!openedAt) return todayInvoices.length
        return todayInvoices.filter(inv => {
          const c = toDate(inv.createdAt)
          return !c || c >= openedAt
        }).length
      })()

      // Multi-divisa: armar bloque USD si la sesión tuvo actividad USD.
      const usdBlock = totals.usd ? {
        openingAmount: currentSession.openingAmountUSD || 0,
        cash: cashUSD,
        card: cardUSD,
        transfer: transferUSD,
        yape: yapeUSD,
        plin: plinUSD,
        rappi: rappiUSD,
        pedidosYa: pedidosYaUSD,
        diDiFood: diDiFoodUSD,
        totalSales: totals.usd.sales,
        salesCash: totals.usd.salesCash,
        salesCard: totals.usd.salesCard,
        salesTransfer: totals.usd.salesTransfer,
        salesYape: totals.usd.salesYape,
        salesPlin: totals.usd.salesPlin,
        salesRappi: totals.usd.salesRappi,
        salesPedidosYa: totals.usd.salesPedidosYa,
        salesDiDiFood: totals.usd.salesDiDiFood,
        totalIncome: totals.usd.income,
        totalExpense: totals.usd.expense,
        expectedAmount: totals.usd.expected,
        difference: cashUSD - (totals.usd.expected || 0),
      } : null

      // Guardar datos de la sesión cerrada con hora de cierre
      const closedData = {
        ...currentSession,
        ...(usdBlock && { usd: usdBlock }),
        closingCash: cash,
        closingCard: card,
        closingTransfer: transfer,
        closingYape: yape,
        closingPlin: plin,
        closingRappi: rappi,
        closingPedidosYa: pedidosYa,
        closingDiDiFood: diDiFood,
        closingAmount: cash + card + transfer + yape + plin + rappi + pedidosYa + diDiFood,
        closedAt: new Date(), // Hora de cierre
        totalSales: totals.sales,
        salesCash: totals.salesCash,
        salesCard: totals.salesCard,
        salesTransfer: totals.salesTransfer,
        salesYape: totals.salesYape,
        salesPlin: totals.salesPlin,
        salesRappi: totals.salesRappi,
        salesPedidosYa: totals.salesPedidosYa,
        salesDiDiFood: totals.salesDiDiFood,
        totalIncome: totals.income,
        totalExpense: totals.expense,
        expectedAmount: totals.expected,
        difference: cash - totals.expected,
        invoiceCount: sessionOnlyInvoicesCount,
        deferredPayments: totals.deferredPayments || [],
        deferredTotal: totals.deferredTotal || 0,
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
        yape,
        plin,
        rappi,
        pedidosYa,
        diDiFood,
        totalSales: totals.sales,
        salesCash: totals.salesCash,
        salesCard: totals.salesCard,
        salesTransfer: totals.salesTransfer,
        salesYape: totals.salesYape,
        salesPlin: totals.salesPlin,
        salesRappi: totals.salesRappi,
        salesPedidosYa: totals.salesPedidosYa,
        salesDiDiFood: totals.salesDiDiFood,
        totalIncome: totals.income,
        totalExpense: totals.expense,
        expectedAmount: totals.expected,
        difference: cash - totals.expected,
        invoiceCount: sessionOnlyInvoicesCount,
        deferredPayments: totals.deferredPayments || [],
        deferredTotal: totals.deferredTotal || 0,
        // Multi-divisa: bloque USD si hubo actividad
        ...(usdBlock && { usd: usdBlock }),
      }, user.uid, user.displayName || user.email || 'Usuario')
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
    } finally {
      setIsClosing(false)
    }
  }

  // Filtra de todayInvoices las notas creadas antes de la apertura
  // (entran al array por haber recibido un pago hoy — su detalle va en deferredPayments).
  const getSessionOnlyInvoices = (session) => {
    const openedAt = session?.openedAt?.toDate
      ? session.openedAt.toDate()
      : session?.openedAt ? new Date(session.openedAt) : null
    if (!openedAt) return todayInvoices
    return todayInvoices.filter(inv => {
      const c = inv.createdAt?.toDate?.() || (inv.createdAt ? new Date(inv.createdAt) : null)
      return !c || c >= openedAt
    })
  }

  // Para el historial: calcula deferredPayments y filtra invoices de la sesión.
  // Prioriza deferredPayments guardados en la sesión cerrada; si no existen
  // (sesiones cerradas antes del fix), los reconstruye desde paymentHistory.
  const getHistoryDerived = (session, invoices) => {
    const openedAt = session?.openedAt?.toDate ? session.openedAt.toDate() : (session?.openedAt ? new Date(session.openedAt) : null)
    const closedAt = session?.closedAt?.toDate ? session.closedAt.toDate() : (session?.closedAt ? new Date(session.closedAt) : new Date())
    const isInWindow = (d) => d && openedAt && d >= openedAt && d <= closedAt

    let deferred = []
    if (Array.isArray(session?.deferredPayments) && session.deferredPayments.length > 0) {
      deferred = session.deferredPayments.map(p => ({
        ...p,
        date: p.date?.toDate?.() || (p.date ? new Date(p.date) : null),
      }))
    } else {
      for (const inv of invoices || []) {
        const created = inv.createdAt?.toDate?.() || (inv.createdAt ? new Date(inv.createdAt) : null)
        if (!openedAt || (created && created >= openedAt)) continue
        if (!Array.isArray(inv.paymentHistory)) continue
        for (const pay of inv.paymentHistory) {
          const pd = pay.date?.toDate?.() || (pay.date ? new Date(pay.date) : null)
          if (!isInWindow(pd)) continue
          deferred.push({
            invoiceId: inv.id,
            invoiceNumber: inv.number || '-',
            documentType: inv.documentType,
            customerName: inv.customer?.name || inv.customer?.businessName || inv.customerName || 'Cliente General',
            amount: parseFloat(pay.amount) || 0,
            method: pay.method,
            date: pd,
          })
        }
      }
    }

    const sessionInvoices = (invoices || []).filter(inv => {
      const c = inv.createdAt?.toDate?.() || (inv.createdAt ? new Date(inv.createdAt) : null)
      return !openedAt || !c || c >= openedAt
    })

    return { deferred, sessionInvoices }
  }

  const handleDownloadExcel = async () => {
    try {
      // Obtener datos del negocio
      const businessResult = await getCompanySettings(getBusinessId())
      const businessData = businessResult.success ? businessResult.data : null

      // Usar datos de la sesión cerrada si está disponible, sino usar currentSession
      const sessionData = closedSessionData || currentSession

      const sessionInvoices = getSessionOnlyInvoices(sessionData)
      await generateCashReportExcel(sessionData, movements, sessionInvoices, businessData, totals.deferredPayments || [])
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

      // Cargar mesas cerradas sin comprobante de la sesión actual
      const sessionOpenedAt = sessionData.openedAt?.toDate
        ? sessionData.openedAt.toDate()
        : sessionData.openedAt ? new Date(sessionData.openedAt) : new Date()
      const sessionClosedAt = sessionData.closedAt?.toDate
        ? sessionData.closedAt.toDate()
        : sessionData.closedAt ? new Date(sessionData.closedAt) : new Date()
      const closedResult = await getClosedWithoutReceipt(getBusinessId(), sessionOpenedAt, sessionClosedAt)
      const closedWithoutReceiptData = closedResult.success ? closedResult.data : []

      const modsResult = await getOrderModificationsAfterPrecuenta(getBusinessId(), sessionOpenedAt, sessionClosedAt)
      const orderModificationsData = modsResult.success ? modsResult.data : []

      const sessionInvoices = getSessionOnlyInvoices(sessionData)
      await generateCashReportPDF(sessionData, movements, sessionInvoices, businessData, closedWithoutReceiptData, orderModificationsData, totals.deferredPayments || [])
      toast.success('Reporte PDF descargado correctamente')
    } catch (error) {
      console.error('Error al generar PDF:', error)
      toast.error('Error al generar el reporte PDF')
    }
  }

  const handlePrintTicket = () => {
    // En app nativa (Android/iOS), window.print() no hace nada útil en el WebView.
    // Delegamos al flujo de impresora térmica, que si no hay impresora muestra un
    // toast claro ("No hay impresora conectada. Configúrala en Ajustes.").
    if (isNative) {
      handlePrintThermal()
      return
    }
    // Configurar datos para impresión del cierre actual
    setPrintSessionData(closedSessionData)
    setPrintMovements(movements)
    // Esperar a que se actualice el estado y luego imprimir
    setTimeout(() => {
      window.print()
    }, 100)
  }

  const handlePrintHistoryTicket = async () => {
    // En nativo, delegar al flujo de impresora térmica (ver comentario en handlePrintTicket)
    if (isNative) {
      handlePrintThermalHistory()
      return
    }
    try {
      // Cargar datos del negocio si no están cargados
      if (!companySettings) {
        const businessResult = await getCompanySettings(getBusinessId())
        if (businessResult.success) {
          setCompanySettings(businessResult.data)
        }
      }
      // Configurar datos para impresión del historial.
      // Si la sesión es vieja y no tiene deferredPayments persistidos, los
      // reconstruimos al vuelo desde historyInvoices para que aparezcan en el ticket.
      const { deferred } = getHistoryDerived(selectedHistorySession, historyInvoices)
      setPrintSessionData({ ...selectedHistorySession, deferredPayments: deferred })
      setPrintMovements(historyMovements)
      // Esperar a que se actualice el estado y luego imprimir
      setTimeout(() => {
        window.print()
      }, 100)
    } catch (error) {
      console.error('Error al imprimir ticket:', error)
      toast.error('Error al imprimir el ticket')
    }
  }

  // Imprimir por impresora térmica (Bluetooth/WiFi) - Cierre actual
  const handlePrintThermal = async () => {
    if (!isPrinterConnected || !printerConfig) {
      toast.error('No hay impresora conectada. Configúrala en Ajustes.')
      return
    }

    setIsPrintingThermal(true)
    try {
      const { printCashClosureTicket, connectPrinter } = await import('@/services/thermalPrinterService')

      // Reconectar a la impresora
      const connectResult = await connectPrinter(printerConfig.address)
      if (!connectResult.success) {
        toast.error('No se pudo conectar a la impresora')
        setIsPrintingThermal(false)
        return
      }

      // Obtener nombre de sucursal si aplica
      const branchName = selectedBranch ? branches.find(b => b.id === selectedBranch)?.name : null

      // Imprimir
      const result = await printCashClosureTicket(
        closedSessionData,
        movements,
        companySettings,
        printerConfig.paperWidth || 58,
        branchName,
        closedSessionData?.deferredPayments || totals.deferredPayments || []
      )

      if (result.success) {
        toast.success('Ticket impreso correctamente')
      } else {
        toast.error(result.error || 'Error al imprimir')
      }
    } catch (error) {
      console.error('Error al imprimir ticket térmico:', error)
      toast.error('Error al imprimir el ticket')
    } finally {
      setIsPrintingThermal(false)
    }
  }

  // Imprimir por impresora térmica (Bluetooth/WiFi) - Historial
  const handlePrintThermalHistory = async () => {
    if (!isPrinterConnected || !printerConfig) {
      toast.error('No hay impresora conectada. Configúrala en Ajustes.')
      return
    }

    setIsPrintingThermal(true)
    try {
      const { printCashClosureTicket, connectPrinter } = await import('@/services/thermalPrinterService')

      // Cargar datos del negocio si no están cargados
      let businessData = companySettings
      if (!businessData) {
        const businessResult = await getCompanySettings(getBusinessId())
        if (businessResult.success) {
          businessData = businessResult.data
          setCompanySettings(businessData)
        }
      }

      // Reconectar a la impresora
      const connectResult = await connectPrinter(printerConfig.address)
      if (!connectResult.success) {
        toast.error('No se pudo conectar a la impresora')
        setIsPrintingThermal(false)
        return
      }

      // Obtener nombre de sucursal si aplica
      const branchName = selectedBranch ? branches.find(b => b.id === selectedBranch)?.name : null

      // Imprimir (incluye deferredPayments — guardados o reconstruidos)
      const { deferred } = getHistoryDerived(selectedHistorySession, historyInvoices)
      const result = await printCashClosureTicket(
        selectedHistorySession,
        historyMovements,
        businessData,
        printerConfig.paperWidth || 58,
        branchName,
        deferred
      )

      if (result.success) {
        toast.success('Ticket impreso correctamente')
      } else {
        toast.error(result.error || 'Error al imprimir')
      }
    } catch (error) {
      console.error('Error al imprimir ticket térmico:', error)
      toast.error('Error al imprimir el ticket')
    } finally {
      setIsPrintingThermal(false)
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
      refreshOpenSessions()
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
        // Multi-divisa: pasa la moneda solo si la flag está activa
        currency: cashMultiCurrencyOn ? (movementData.currency || 'PEN') : 'PEN',
      })

      if (result.success) {
        toast.success('Movimiento registrado correctamente')
        setShowMovementModal(false)
        setMovementData({
          type: 'income',
          amount: '',
          description: '',
          category: '',
          currency: 'PEN',
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

  // Helper: convierte timestamp/date/string a Date
  const toDate = (v) => {
    if (!v) return null
    if (v.toDate && typeof v.toDate === 'function') return v.toDate()
    if (v instanceof Date) return v
    return new Date(v)
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
      salesPedidosYa: 0,
      salesDiDiFood: 0,
      income: 0,
      expense: 0,
      expected: 0,
      difference: 0,
      pendingTotal: 0,
      pendingCount: 0,
      deferredPayments: [],
      deferredTotal: 0,
      usd: null,
    }

    const sessionOpenedAt = toDate(currentSession.openedAt)

    // Inicializar totales por método de pago (PEN — campos legacy)
    let salesCash = 0
    let salesCard = 0
    let salesTransfer = 0
    let salesYape = 0
    let salesPlin = 0
    let salesRappi = 0
    let salesPedidosYa = 0
    let salesDiDiFood = 0

    // Multi-divisa: acumuladores paralelos en USD.
    let salesCashUSD = 0
    let salesCardUSD = 0
    let salesTransferUSD = 0
    let salesYapeUSD = 0
    let salesPlinUSD = 0
    let salesRappiUSD = 0
    let salesPedidosYaUSD = 0
    let salesDiDiFoodUSD = 0
    let pendingTotalUSD = 0
    let pendingCountUSD = 0

    // Devuelve la moneda de un invoice (default PEN para legacy).
    const invoiceCurrency = (inv) => normalizeCurrency(inv?.currency)

    // Filtrar facturas:
    // - Excluir notas de crédito (son devoluciones/anulaciones)
    // - Incluir notas de débito pagadas (son cobros adicionales)
    // - Excluir notas de venta ya convertidas a boleta/factura (para no duplicar)
    // - Excluir documentos anulados (notas de venta, boletas, facturas)
    const validInvoices = todayInvoices.filter(invoice => {
      // Excluir notas de crédito (no son ventas, son devoluciones)
      if (invoice.documentType === 'nota_credito') {
        return false
      }
      // Notas de débito: solo incluir si están pagadas/aplicadas
      if (invoice.documentType === 'nota_debito') {
        return invoice.status === 'paid' || invoice.status === 'applied'
      }
      // Si es una nota de venta que ya fue convertida a boleta/factura, no contar
      // (se cuenta la boleta/factura resultante en su lugar)
      if (invoice.documentType === 'nota_venta' && invoice.convertedTo) {
        return false
      }
      // Si el documento está anulado o pendiente de anulación por NC, no contar
      if (invoice.status === 'cancelled' || invoice.status === 'voided' ||
          invoice.status === 'pending_cancellation' || invoice.status === 'partial_refund_pending') {
        return false
      }
      return true
    })

    // Pagos diferidos: pagos cobrados en esta sesión sobre comprobantes
    // creados en sesiones anteriores. Se llenan recorriendo paymentHistory.
    const deferredPayments = []

    // Helper: suma un pago a su método correspondiente. Distribuye a los
    // acumuladores PEN o USD según la moneda del invoice padre.
    const addToMethod = (method, amount, currencyCode = 'PEN') => {
      if (currencyCode === 'USD') {
        switch (method) {
          case 'Efectivo': salesCashUSD += amount; break
          case 'Tarjeta': salesCardUSD += amount; break
          case 'Transferencia': salesTransferUSD += amount; break
          case 'Yape': salesYapeUSD += amount; break
          case 'Plin': salesPlinUSD += amount; break
          case 'Rappi': salesRappiUSD += amount; break
          case 'PedidosYa': salesPedidosYaUSD += amount; break
          case 'DiDiFood': salesDiDiFoodUSD += amount; break
        }
        return
      }
      switch (method) {
        case 'Efectivo': salesCash += amount; break
        case 'Tarjeta': salesCard += amount; break
        case 'Transferencia': salesTransfer += amount; break
        case 'Yape': salesYape += amount; break
        case 'Plin': salesPlin += amount; break
        case 'Rappi': salesRappi += amount; break
        case 'PedidosYa': salesPedidosYa += amount; break
        case 'DiDiFood': salesDiDiFood += amount; break
      }
    }

    // Recorrer cada factura válida y sumar por método de pago.
    // Multi-divisa: cada pago se enruta al bucket PEN o USD según la moneda
    // del invoice padre. invoiceCurrency() devuelve 'PEN' para legacy.
    validInvoices.forEach(invoice => {
      // Si es venta al crédito pendiente de pago, no sumar nada al control de caja
      if (invoice.paymentStatus === 'pending') {
        return // No contar ventas al crédito sin pagar
      }
      const invCcy = invoiceCurrency(invoice)

      // Verificar si tiene historial de pagos (ventas al crédito o parciales que fueron pagadas)
      // Si tiene paymentHistory, usar eso para obtener los métodos de pago reales
      const hasPaymentHistory = invoice.paymentHistory && Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0

      if (hasPaymentHistory) {
        // Filtrar pagos por fecha: solo los que ocurrieron en esta sesión.
        // Esto evita re-contar pagos viejos cuando una nota de venta antigua aparece
        // por haber recibido un pago nuevo (lastPaymentDate) en este turno.
        const invoiceCreatedAt = toDate(invoice.createdAt)
        const isOldInvoice = sessionOpenedAt && invoiceCreatedAt && invoiceCreatedAt < sessionOpenedAt

        invoice.paymentHistory.forEach(payment => {
          const amount = parseFloat(payment.amount) || 0
          // Fallback al createdAt de la factura para entradas legacy sin date
          const paymentDate = toDate(payment.date) || invoiceCreatedAt
          const inSession = !sessionOpenedAt || (paymentDate && paymentDate >= sessionOpenedAt)
          if (!inSession) return
          addToMethod(payment.method, amount, invCcy)
          if (isOldInvoice) {
            deferredPayments.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.number || '-',
              documentType: invoice.documentType,
              customerName: invoice.customer?.name || invoice.customer?.businessName || invoice.customerName || 'Cliente General',
              amount,
              method: payment.method,
              date: paymentDate,
              recordedByName: payment.recordedByName,
              currency: invCcy,
            })
          }
        })
      } else if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
        // Ventas normales sin historial de pagos - usar array payments
        const invoiceTotal = parseFloat(invoice.total) || 0

        // Si hay un solo método de pago, usar el TOTAL DE LA FACTURA
        if (invoice.payments.length === 1) {
          addToMethod(invoice.payments[0].method, invoiceTotal, invCcy)
        } else {
          // Múltiples métodos de pago: usar los montos reales de cada pago
          invoice.payments.forEach(payment => {
            const amount = parseFloat(payment.amount) || 0
            addToMethod(payment.method, amount, invCcy)
          })
        }
      } else {
        // Facturas antiguas sin array payments - usar paymentMethod y sumar el total completo
        // Para pagos parciales, solo sumar amountPaid
        const isPartialPayment = invoice.paymentStatus === 'partial'
        const total = isPartialPayment ? (parseFloat(invoice.amountPaid) || 0) : (invoice.total || 0)
        addToMethod(invoice.paymentMethod, total, invCcy)
      }
    })

    // Calcular ventas pendientes de cobro (crédito y pagos parciales).
    // Multi-divisa: PEN y USD por separado.
    let pendingTotal = 0
    let pendingCount = 0
    todayInvoices.forEach(invoice => {
      // Excluir notas de crédito y notas convertidas y anuladas
      if (invoice.documentType === 'nota_credito') return
      // Notas de débito pagadas ya se contaron arriba, excluir pendientes
      if (invoice.documentType === 'nota_debito') return
      if (invoice.documentType === 'nota_venta' && invoice.convertedTo) return
      if (invoice.status === 'cancelled' || invoice.status === 'voided' ||
          invoice.status === 'pending_cancellation' || invoice.status === 'partial_refund_pending') return

      const invCcy = invoiceCurrency(invoice)
      let pendingAmount = 0
      if (invoice.paymentStatus === 'pending') {
        pendingAmount = parseFloat(invoice.total) || 0
      } else if (invoice.paymentStatus === 'partial') {
        pendingAmount = parseFloat(invoice.balance) || 0
      } else {
        return
      }
      if (invCcy === 'USD') {
        pendingTotalUSD += pendingAmount
        pendingCountUSD++
      } else {
        pendingTotal += pendingAmount
        pendingCount++
      }
    })

    // Ingresos / Egresos manuales. Multi-divisa: separar por movement.currency
    // (default PEN cuando no viene). Movimientos legacy todos PEN.
    let income = 0, expense = 0, incomeUSD = 0, expenseUSD = 0
    movements.forEach(m => {
      const amt = Number(m.amount) || 0
      const isUSD = m.currency === 'USD'
      if (m.type === 'income') {
        if (isUSD) incomeUSD += amt
        else income += amt
      } else if (m.type === 'expense') {
        if (isUSD) expenseUSD += amt
        else expense += amt
      }
    })

    // Total de ventas (todos los métodos) — PEN y USD por separado
    const sales = salesCash + salesCard + salesTransfer + salesYape + salesPlin + salesRappi + salesPedidosYa + salesDiDiFood
    const salesUSD = salesCashUSD + salesCardUSD + salesTransferUSD + salesYapeUSD + salesPlinUSD + salesRappiUSD + salesPedidosYaUSD + salesDiDiFoodUSD

    // Dinero esperado en caja (SOLO efectivo + ingresos - egresos)
    const expected = (currentSession.openingAmount || 0) + salesCash + income - expense
    const expectedUSD = (currentSession.openingAmountUSD || 0) + salesCashUSD + incomeUSD - expenseUSD

    // Diferencia (si hay cierre)
    let difference = 0
    if (currentSession.closingAmount !== undefined) {
      difference = currentSession.closingAmount - expected
    }
    let differenceUSD = 0
    if (currentSession.usd?.closingAmount !== undefined) {
      differenceUSD = (currentSession.usd.closingCash || 0) - expectedUSD
    }

    const deferredTotal = deferredPayments
      .filter(p => p.currency !== 'USD')
      .reduce((s, p) => s + (p.amount || 0), 0)
    const deferredTotalUSD = deferredPayments
      .filter(p => p.currency === 'USD')
      .reduce((s, p) => s + (p.amount || 0), 0)

    // Bloque USD: solo se incluye si hay actividad USD para evitar ruido.
    const hasUsdActivity = salesUSD > 0 || incomeUSD > 0 || expenseUSD > 0
      || (currentSession.openingAmountUSD || 0) > 0 || pendingCountUSD > 0
      || deferredTotalUSD > 0
    const usdBlock = hasUsdActivity ? {
      sales: salesUSD,
      salesCash: salesCashUSD,
      salesCard: salesCardUSD,
      salesTransfer: salesTransferUSD,
      salesYape: salesYapeUSD,
      salesPlin: salesPlinUSD,
      salesRappi: salesRappiUSD,
      salesPedidosYa: salesPedidosYaUSD,
      salesDiDiFood: salesDiDiFoodUSD,
      income: incomeUSD,
      expense: expenseUSD,
      expected: expectedUSD,
      difference: differenceUSD,
      pendingTotal: pendingTotalUSD,
      pendingCount: pendingCountUSD,
      deferredTotal: deferredTotalUSD,
      openingAmount: currentSession.openingAmountUSD || 0,
    } : null

    return {
      sales,
      salesCash,
      salesCard,
      salesTransfer,
      salesYape,
      salesPlin,
      salesRappi,
      salesPedidosYa,
      salesDiDiFood,
      income,
      expense,
      expected,
      difference,
      pendingTotal,
      pendingCount,
      deferredPayments,
      deferredTotal,
      usd: usdBlock,
    }
  }

  const totals = calculateTotals()

  // Modo solo-lectura: cuando el owner ve la caja de otro usuario
  const isViewingOtherUser = selectedCashUser && selectedCashUser !== 'all' && selectedCashUser !== user.uid
  const isViewingAll = selectedCashUser === 'all'
  const viewingUserName = isViewingOtherUser
    ? subUsers.find(u => u.uid === selectedCashUser || u.id === selectedCashUser)?.displayName || 'Usuario'
    : null

  // Sub-usuarios con caja independiente, filtrados por sucursal seleccionada
  const independentSubUsers = subUsers.filter(u => {
    if (!u.independentCashRegister) return false
    // Filtrar por sucursal: si hay sucursal seleccionada, solo mostrar usuarios asignados a ella
    if (selectedBranch) {
      const userBranches = u.allowedBranches || []
      // Si el usuario no tiene restricción de sucursales, tiene acceso a todas
      if (userBranches.length === 0) return true
      return userBranches.includes(selectedBranch.id)
    }
    // Sucursal principal: mostrar usuarios sin restricción o con acceso a 'main'
    const userBranches = u.allowedBranches || []
    if (userBranches.length === 0) return true
    return userBranches.includes('main')
  })

  // Mostrar selector solo si es owner y tiene sub-usuarios con caja independiente
  const showUserSelector = isOwner && independentSubUsers.length > 0 && !isDemoMode

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

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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

          {/* Selector de Usuario - Solo visible para owner con sub-usuarios */}
          {showUserSelector && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              <select
                value={selectedCashUser || ''}
                onChange={e => {
                  const val = e.target.value
                  setSelectedCashUser(val === '' ? null : val)
                }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Mi Caja</option>
                {independentSubUsers.map(su => {
                  const suUid = su.uid || su.id
                  const hasOpen = openSessions.some(s => s.openedByUserId === suUid)
                  return (
                    <option key={suUid} value={suUid}>
                      {su.displayName || su.email}{hasOpen ? ' (Caja abierta)' : ''}
                    </option>
                  )
                })}
                <option value="all">Todos</option>
              </select>
            </div>
          )}
        </div>

        {/* Badge cuando se ve caja ajena */}
        {isViewingOtherUser && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <Eye className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700 font-medium">Viendo caja de {viewingUserName}</span>
          </div>
        )}
        {isViewingAll && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
            <Eye className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-700 font-medium">Viendo todas las cajas</span>
          </div>
        )}

        {activeTab === 'current' && !isViewingOtherUser && !isViewingAll && (
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
                      {totals.salesPedidosYa > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>• PedidosYa:</span>
                          <span className="font-medium">{formatCurrency(totals.salesPedidosYa)}</span>
                        </div>
                      )}
                      {totals.salesDiDiFood > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>• DiDiFood:</span>
                          <span className="font-medium">{formatCurrency(totals.salesDiDiFood)}</span>
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
                  {!hideExpectedForCashier && (
                    <>
                      <div className="flex justify-between items-center py-3 bg-primary-50 px-3 rounded-lg mt-3">
                        <span className="text-sm sm:text-base font-semibold text-primary-900">Efectivo Esperado:</span>
                        <span className="text-lg sm:text-xl font-bold text-primary-600">
                          {formatCurrency(totals.expected)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        <span className="font-medium">Fórmula:</span> Inicial ({formatCurrency(currentSession.openingAmount)}) + Ventas Efectivo ({formatCurrency(totals.salesCash)}) + Ingresos ({formatCurrency(totals.income)}) - Egresos ({formatCurrency(totals.expense)})
                      </div>
                    </>
                  )}
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
                          {/* Botones de editar/eliminar (ocultos en modo lectura) */}
                          {!isViewingOtherUser && (
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
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Pagos de comprobantes anteriores cobrados en esta sesión */}
          {totals.deferredPayments && totals.deferredPayments.length > 0 && (
            <Card className="mt-6 border-amber-200 bg-amber-50/40">
              <CardContent>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-1">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                  Pagos de comprobantes anteriores
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Cobros registrados hoy sobre notas de venta o créditos emitidos en sesiones previas.
                  Ya están sumados a las ventas del día por método de pago.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-amber-200 text-left text-xs text-gray-600 uppercase">
                        <th className="pb-2 pr-3">Comprobante</th>
                        <th className="pb-2 pr-3">Cliente</th>
                        <th className="pb-2 pr-3">Método</th>
                        <th className="pb-2 pr-3 text-right">Monto</th>
                        <th className="pb-2 text-right">Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {totals.deferredPayments
                        .slice()
                        .sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0))
                        .map((p, i) => {
                          const docTypeLabels = { factura: 'Factura', boleta: 'Boleta', nota_venta: 'Nota de Venta', nota_credito: 'N. Crédito', nota_debito: 'N. Débito' }
                          const timeStr = p.date
                            ? p.date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
                            : '-'
                          return (
                            <tr key={`${p.invoiceId}-${i}`} className="border-b border-amber-100">
                              <td className="py-2 pr-3">
                                <div className="font-medium text-primary-600">{p.invoiceNumber}</div>
                                <div className="text-xs text-gray-500">{docTypeLabels[p.documentType] || p.documentType || '-'}</div>
                              </td>
                              <td className="py-2 pr-3 truncate max-w-[180px]">{p.customerName}</td>
                              <td className="py-2 pr-3 text-gray-700">{p.method}</td>
                              <td className="py-2 pr-3 text-right font-semibold text-emerald-700">
                                +{formatCurrency(p.amount)}
                              </td>
                              <td className="py-2 text-right text-gray-500">{timeStr}</td>
                            </tr>
                          )
                        })}
                      <tr className="bg-amber-100/60">
                        <td colSpan={3} className="py-2 pr-3 font-semibold text-gray-900 text-right">Total cobrado:</td>
                        <td className="py-2 pr-3 text-right font-bold text-emerald-700">
                          +{formatCurrency(totals.deferredTotal || 0)}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista de Comprobantes de la Sesión */}
          <Card className="mt-6">
            <CardContent>
              {(() => {
                // Excluir comprobantes creados antes de la apertura de la sesión —
                // pueden estar en todayInvoices porque recibieron un pago hoy
                // (lastPaymentDate). Esos cobros ya se muestran en la sección
                // "Pagos de comprobantes anteriores" para no confundir totales.
                const sessionOpenedAt = toDate(currentSession?.openedAt)
                const sessionInvoicesOnly = todayInvoices.filter(inv => {
                  const c = toDate(inv.createdAt)
                  return !sessionOpenedAt || !c || c >= sessionOpenedAt
                })
                const userOptions = getInvoiceUserOptions(sessionInvoicesOnly)
                const filteredInvoices = invoiceUserFilter === 'all'
                  ? sessionInvoicesOnly
                  : sessionInvoicesOnly.filter(inv => (inv.createdBy || 'unknown') === invoiceUserFilter)
                const showUserFilter = isOwner && userOptions.length > 1

                return (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Comprobantes de esta sesión ({filteredInvoices.length}{invoiceUserFilter !== 'all' ? ` de ${sessionInvoicesOnly.length}` : ''})
                      </h3>
                      {showUserFilter && (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-500" />
                          <select
                            value={invoiceUserFilter}
                            onChange={e => setInvoiceUserFilter(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="all">Todos los usuarios</option>
                            {userOptions.map(u => (
                              <option key={u.uid} value={u.uid}>{u.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    {filteredInvoices.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p className="text-sm">
                          {sessionInvoicesOnly.length === 0
                            ? 'No hay comprobantes en esta sesión'
                            : 'Ningún comprobante coincide con el filtro'}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                              <th className="pb-2 pr-3">Número</th>
                              <th className="pb-2 pr-3">Tipo</th>
                              <th className="pb-2 pr-3">Cliente</th>
                              <th className="pb-2 pr-3">Usuario</th>
                              <th className="pb-2 pr-3">Método</th>
                              <th className="pb-2 pr-3 text-right">Total</th>
                              <th className="pb-2 pr-3">Estado</th>
                              <th className="pb-2 text-right">Hora</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredInvoices
                              .sort((a, b) => {
                                const dA = a.createdAt?.toDate?.() || new Date(0)
                                const dB = b.createdAt?.toDate?.() || new Date(0)
                                return dB - dA
                              })
                              .map(inv => {
                                const docTypeLabels = { factura: 'Factura', boleta: 'Boleta', nota_venta: 'Nota de Venta', nota_credito: 'N. Crédito', nota_debito: 'N. Débito' }
                                const payMethod = inv.payments?.length > 0
                                  ? inv.payments.map(p => p.method).join(', ')
                                  : inv.paymentMethod || '-'
                                const isVoided = inv.status === 'cancelled' || inv.status === 'voided' || inv.sunatStatus === 'voided'
                                const isNC = inv.documentType === 'nota_credito'
                                const isND = inv.documentType === 'nota_debito'
                                const isConverted = inv.documentType === 'nota_venta' && inv.convertedTo
                                const isPending = inv.paymentStatus === 'pending'
                                const isPartial = inv.paymentStatus === 'partial'
                                const createdAt = inv.createdAt?.toDate?.() || (inv.createdAt ? new Date(inv.createdAt) : null)
                                const timeStr = createdAt ? createdAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '-'
                                const userLabel = inv.createdByName || inv.createdByEmail || 'Sin identificar'

                                let statusBadge
                                if (isVoided) {
                                  statusBadge = <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Anulado</span>
                                } else if (isNC) {
                                  statusBadge = <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Devolución</span>
                                } else if (isConverted) {
                                  statusBadge = <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Convertida</span>
                                } else if (isPending) {
                                  statusBadge = <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Crédito</span>
                                } else if (isPartial) {
                                  statusBadge = <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Parcial</span>
                                } else {
                                  statusBadge = <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Pagado</span>
                                }

                                const rowClass = (isVoided || isNC || isConverted) ? 'opacity-50' : ''

                                return (
                                  <tr key={inv.id} className={`border-b border-gray-100 hover:bg-gray-50 ${rowClass}`}>
                                    <td className="py-2 pr-3 font-medium text-primary-600">{inv.number || '-'}</td>
                                    <td className="py-2 pr-3">{docTypeLabels[inv.documentType] || inv.documentType}</td>
                                    <td className="py-2 pr-3 truncate max-w-[150px]">{inv.customer?.name || inv.customer?.businessName || 'Cliente General'}</td>
                                    <td className="py-2 pr-3 truncate max-w-[140px] text-gray-700" title={userLabel}>{userLabel}</td>
                                    <td className="py-2 pr-3 text-gray-600">{payMethod}</td>
                                    <td className={`py-2 pr-3 text-right font-medium ${isNC ? 'text-red-600' : ''}`}>
                                      {isNC ? '-' : ''}{formatCurrency(inv.total || 0)}
                                    </td>
                                    <td className="py-2 pr-3">{statusBadge}</td>
                                    <td className="py-2 text-right text-gray-500">{timeStr}</td>
                                  </tr>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )
              })()}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-gray-400" />
              </div>
              {isViewingOtherUser ? (
                <>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No hay caja abierta</h3>
                  <p className="text-gray-600">
                    {viewingUserName} no tiene una caja abierta en esta sucursal
                  </p>
                </>
              ) : isViewingAll ? (
                <>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Vista General</h3>
                  <p className="text-gray-600">
                    Selecciona la pestaña "Historial" para ver todas las sesiones de caja
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Caja Cerrada</h3>
                  <p className="text-gray-600 mb-6">
                    Para comenzar a registrar ventas y movimientos, abre la caja con el monto inicial
                  </p>
                  <Button onClick={() => setShowOpenModal(true)}>
                    <Unlock className="w-4 h-4 mr-2" />
                    Abrir Caja
                  </Button>
                </>
              )}
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
                              {session.openedByName && (
                                <p className="text-xs text-gray-400">{session.openedByName}</p>
                              )}
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
          setHistoryInvoices([])
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
                {(selectedHistorySession.closingYape > 0 || selectedHistorySession.salesYape > 0 || (isEditingHistory && editValues.closingYape > 0)) && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Yape:</span>
                    {isEditingHistory ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.closingYape}
                        onChange={e => setEditValues({ ...editValues, closingYape: parseFloat(e.target.value) || 0 })}
                        className="w-32 text-right font-semibold bg-white border border-gray-300 rounded px-2 py-1"
                      />
                    ) : (
                      <span className="font-semibold">{formatCurrency(selectedHistorySession.closingYape || 0)}</span>
                    )}
                  </div>
                )}
                {(selectedHistorySession.closingPlin > 0 || selectedHistorySession.salesPlin > 0 || (isEditingHistory && editValues.closingPlin > 0)) && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Plin:</span>
                    {isEditingHistory ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.closingPlin}
                        onChange={e => setEditValues({ ...editValues, closingPlin: parseFloat(e.target.value) || 0 })}
                        className="w-32 text-right font-semibold bg-white border border-gray-300 rounded px-2 py-1"
                      />
                    ) : (
                      <span className="font-semibold">{formatCurrency(selectedHistorySession.closingPlin || 0)}</span>
                    )}
                  </div>
                )}
                {(selectedHistorySession.closingRappi > 0 || selectedHistorySession.salesRappi > 0 || (isEditingHistory && editValues.closingRappi > 0)) && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Rappi:</span>
                    {isEditingHistory ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.closingRappi}
                        onChange={e => setEditValues({ ...editValues, closingRappi: parseFloat(e.target.value) || 0 })}
                        className="w-32 text-right font-semibold bg-white border border-gray-300 rounded px-2 py-1"
                      />
                    ) : (
                      <span className="font-semibold">{formatCurrency(selectedHistorySession.closingRappi || 0)}</span>
                    )}
                  </div>
                )}
                {(selectedHistorySession.closingPedidosYa > 0 || selectedHistorySession.salesPedidosYa > 0 || (isEditingHistory && editValues.closingPedidosYa > 0)) && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">PedidosYa:</span>
                    {isEditingHistory ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.closingPedidosYa}
                        onChange={e => setEditValues({ ...editValues, closingPedidosYa: parseFloat(e.target.value) || 0 })}
                        className="w-32 text-right font-semibold bg-white border border-gray-300 rounded px-2 py-1"
                      />
                    ) : (
                      <span className="font-semibold">{formatCurrency(selectedHistorySession.closingPedidosYa || 0)}</span>
                    )}
                  </div>
                )}
                {(selectedHistorySession.closingDiDiFood > 0 || selectedHistorySession.salesDiDiFood > 0 || (isEditingHistory && editValues.closingDiDiFood > 0)) && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">DiDiFood:</span>
                    {isEditingHistory ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.closingDiDiFood}
                        onChange={e => setEditValues({ ...editValues, closingDiDiFood: parseFloat(e.target.value) || 0 })}
                        className="w-32 text-right font-semibold bg-white border border-gray-300 rounded px-2 py-1"
                      />
                    ) : (
                      <span className="font-semibold">{formatCurrency(selectedHistorySession.closingDiDiFood || 0)}</span>
                    )}
                  </div>
                )}
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

            {/* Mesas cerradas sin comprobante (alerta) */}
            {historyClosedWithoutReceipt.length > 0 && (
              <div className="border-t border-red-200 pt-4">
                <h4 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Mesas cerradas sin comprobante ({historyClosedWithoutReceipt.length})
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {historyClosedWithoutReceipt.map(record => {
                    const ts = record.createdAt?.toDate?.() || (record.createdAt ? new Date(record.createdAt) : null)
                    const timeStr = ts ? ts.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '-'
                    return (
                      <div key={record.id} className="p-2 bg-red-50 border border-red-100 rounded text-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-semibold text-red-800">Mesa {record.tableNumber}</span>
                            <span className="text-red-600 ml-2">{formatCurrency(record.amount)}</span>
                          </div>
                          <span className="text-red-400">{timeStr}</span>
                        </div>
                        <div className="text-red-600 mt-1">
                          <span className="font-medium">Motivo:</span> {record.reason}
                        </div>
                        <div className="text-red-400 mt-0.5">
                          Por: {record.closedByName || 'Desconocido'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Órdenes modificadas después de precuenta (alerta) */}
            {historyOrderModifications.length > 0 && (
              <div className="border-t border-orange-200 pt-4">
                <h4 className="font-semibold text-orange-700 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Órdenes modificadas después de precuenta ({historyOrderModifications.length})
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {historyOrderModifications.map(record => {
                    const ts = record.createdAt?.toDate?.() || (record.createdAt ? new Date(record.createdAt) : null)
                    const timeStr = ts ? ts.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '-'
                    return (
                      <div key={record.id} className="p-2 bg-orange-50 border border-orange-100 rounded text-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-semibold text-orange-800">Mesa {record.tableNumber}</span>
                            <span className="text-orange-600 ml-2">
                              {record.changeType === 'remove_item' ? 'Item eliminado' : 'Cantidad reducida'}
                            </span>
                          </div>
                          <span className="text-orange-400">{timeStr}</span>
                        </div>
                        <div className="text-orange-700 mt-1">
                          <span className="font-medium">{record.itemName}</span>
                          {record.changeType === 'remove_item'
                            ? ` (x${record.previousQuantity})`
                            : ` (${record.previousQuantity} → ${record.newQuantity})`
                          }
                          <span className="ml-2 font-semibold text-red-600">-{formatCurrency(record.amountDifference)}</span>
                        </div>
                        <div className="text-orange-500 mt-0.5 flex justify-between">
                          <span>Mozo: {record.waiterName || '-'} | Editó: {record.modifiedByName || 'Desconocido'}</span>
                          <span>Precuenta: {formatCurrency(record.precuentaTotal)} → {formatCurrency(record.newTotal)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pagos de comprobantes anteriores (cobros diferidos) */}
            {(() => {
              const { deferred } = getHistoryDerived(selectedHistorySession, historyInvoices)
              if (deferred.length === 0) return null

              const total = deferred.reduce((s, p) => s + (p.amount || 0), 0)
              const docTypeLabels = { factura: 'Factura', boleta: 'Boleta', nota_venta: 'Nota de Venta', nota_credito: 'N. Crédito', nota_debito: 'N. Débito' }

              return (
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                    Pagos de Comprobantes Anteriores ({deferred.length})
                  </h4>
                  <p className="text-xs text-gray-600 mb-3">
                    Cobros recibidos en esta sesión sobre comprobantes emitidos en sesiones previas.
                  </p>
                  <div className="overflow-x-auto bg-amber-50/40 rounded-lg border border-amber-200 p-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-amber-200 text-left text-xs text-gray-600 uppercase">
                          <th className="pb-2 pr-2">Comprobante</th>
                          <th className="pb-2 pr-2">Cliente</th>
                          <th className="pb-2 pr-2">Método</th>
                          <th className="pb-2 pr-2 text-right">Monto</th>
                          <th className="pb-2 text-right">Hora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deferred
                          .slice()
                          .sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0))
                          .map((p, i) => {
                            const timeStr = p.date
                              ? p.date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
                              : '-'
                            return (
                              <tr key={`${p.invoiceId}-${i}`} className="border-b border-amber-100">
                                <td className="py-1.5 pr-2 text-xs">
                                  <div className="font-medium text-primary-600">{p.invoiceNumber}</div>
                                  <div className="text-[10px] text-gray-500">{docTypeLabels[p.documentType] || p.documentType || '-'}</div>
                                </td>
                                <td className="py-1.5 pr-2 text-xs truncate max-w-[140px]">{p.customerName}</td>
                                <td className="py-1.5 pr-2 text-xs text-gray-700">{p.method}</td>
                                <td className="py-1.5 pr-2 text-right text-xs font-semibold text-emerald-700">
                                  +{formatCurrency(p.amount)}
                                </td>
                                <td className="py-1.5 text-right text-xs text-gray-500">{timeStr}</td>
                              </tr>
                            )
                          })}
                        <tr className="bg-amber-100/60">
                          <td colSpan={3} className="py-1.5 pr-2 text-xs font-semibold text-gray-900 text-right">Total cobrado:</td>
                          <td className="py-1.5 pr-2 text-right text-xs font-bold text-emerald-700">
                            +{formatCurrency(total)}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            {/* Comprobantes de la Sesión */}
            {historyInvoices.length > 0 && (() => {
              const sessionOpenedAtForList = getDateFromTimestamp(selectedHistorySession.openedAt)
              // Mostrar solo los comprobantes creados en la sesión. Las notas previas
              // se ven arriba en "Pagos de Comprobantes Anteriores".
              const sessionInvoicesOnly = historyInvoices.filter(inv => {
                const c = getDateFromTimestamp(inv.createdAt)
                return !sessionOpenedAtForList || !c || c >= sessionOpenedAtForList
              })
              if (sessionInvoicesOnly.length === 0) return null
              const userOptions = getInvoiceUserOptions(sessionInvoicesOnly)
              const filteredHistoryInvoices = historyInvoiceUserFilter === 'all'
                ? sessionInvoicesOnly
                : sessionInvoicesOnly.filter(inv => (inv.createdBy || 'unknown') === historyInvoiceUserFilter)
              const showUserFilter = isOwner && userOptions.length > 1

              return (
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Comprobantes de la Sesión ({filteredHistoryInvoices.length}{historyInvoiceUserFilter !== 'all' ? ` de ${sessionInvoicesOnly.length}` : ''})
                    </h4>
                    {showUserFilter && (
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-gray-500" />
                        <select
                          value={historyInvoiceUserFilter}
                          onChange={e => setHistoryInvoiceUserFilter(e.target.value)}
                          className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="all">Todos los usuarios</option>
                          {userOptions.map(u => (
                            <option key={u.uid} value={u.uid}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                          <th className="pb-2 pr-2">Número</th>
                          <th className="pb-2 pr-2">Tipo</th>
                          <th className="pb-2 pr-2">Cliente</th>
                          <th className="pb-2 pr-2">Usuario</th>
                          <th className="pb-2 pr-2">Método</th>
                          <th className="pb-2 pr-2 text-right">Total</th>
                          <th className="pb-2">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistoryInvoices
                          .sort((a, b) => {
                            const dA = a.createdAt?.toDate?.() || new Date(0)
                            const dB = b.createdAt?.toDate?.() || new Date(0)
                            return dB - dA
                          })
                          .map(inv => {
                            const docTypeLabels = { factura: 'Factura', boleta: 'Boleta', nota_venta: 'N. Venta', nota_credito: 'N. Crédito', nota_debito: 'N. Débito' }
                            const payMethod = inv.payments?.length > 0
                              ? inv.payments.map(p => p.method).join(', ')
                              : inv.paymentMethod || '-'
                            const isVoided = inv.status === 'cancelled' || inv.status === 'voided' || inv.sunatStatus === 'voided'
                            const isNC = inv.documentType === 'nota_credito'
                            const isND = inv.documentType === 'nota_debito'
                            const isConverted = inv.documentType === 'nota_venta' && inv.convertedTo
                            const isPending = inv.paymentStatus === 'pending'
                            const isPartial = inv.paymentStatus === 'partial'
                            const userLabel = inv.createdByName || inv.createdByEmail || 'Sin identificar'

                            let statusBadge
                            if (isVoided) {
                              statusBadge = <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Anulado</span>
                            } else if (isNC) {
                              statusBadge = <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Devolución</span>
                            } else if (isConverted) {
                              statusBadge = <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Convertida</span>
                            } else if (isPending) {
                              statusBadge = <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Crédito</span>
                            } else if (isPartial) {
                              statusBadge = <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Parcial</span>
                            } else {
                              statusBadge = <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Pagado</span>
                            }

                            const rowClass = (isVoided || isNC || isConverted) ? 'opacity-50' : ''

                            return (
                              <tr key={inv.id} className={`border-b border-gray-100 ${rowClass}`}>
                                <td className="py-1.5 pr-2 font-medium text-primary-600 text-xs">{inv.number || '-'}</td>
                                <td className="py-1.5 pr-2 text-xs">{docTypeLabels[inv.documentType] || inv.documentType}</td>
                                <td className="py-1.5 pr-2 text-xs truncate max-w-[100px]">{inv.customer?.name || inv.customer?.businessName || 'Cliente General'}</td>
                                <td className="py-1.5 pr-2 text-xs text-gray-700 truncate max-w-[110px]" title={userLabel}>{userLabel}</td>
                                <td className="py-1.5 pr-2 text-xs text-gray-600">{payMethod}</td>
                                <td className={`py-1.5 pr-2 text-right text-xs font-medium ${isNC ? 'text-red-600' : ''}`}>
                                  {isNC ? '-' : ''}{formatCurrency(inv.total || 0)}
                                </td>
                                <td className="py-1.5">{statusBadge}</td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            {/* Botones */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const businessResult = await getCompanySettings(getBusinessId())
                    const businessData = businessResult.success ? businessResult.data : null
                    const { deferred, sessionInvoices } = getHistoryDerived(selectedHistorySession, historyInvoices)
                    await generateCashReportPDF(selectedHistorySession, historyMovements, sessionInvoices, businessData, historyClosedWithoutReceipt, historyOrderModifications, deferred)
                    toast.success('PDF descargado')
                  } catch (error) {
                    toast.error('Error al generar PDF')
                  }
                }}
                className="flex-1 min-w-[80px]"
                size="sm"
              >
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const businessResult = await getCompanySettings(getBusinessId())
                    const businessData = businessResult.success ? businessResult.data : null
                    const { deferred, sessionInvoices } = getHistoryDerived(selectedHistorySession, historyInvoices)
                    await generateCashReportExcel(selectedHistorySession, historyMovements, sessionInvoices, businessData, deferred)
                    toast.success('Excel descargado')
                  } catch (error) {
                    toast.error('Error al generar Excel')
                  }
                }}
                className="flex-1 min-w-[80px]"
                size="sm"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1" />
                Excel
              </Button>
              <Button
                variant="outline"
                onClick={handlePrintHistoryTicket}
                className="flex-1 min-w-[80px]"
                size="sm"
              >
                <Printer className="w-4 h-4 mr-1" />
                Ticket
              </Button>
              {/* Botón de impresión térmica (solo en app móvil) */}
              {isNative && isPrinterConnected && (
                <Button
                  variant="outline"
                  onClick={handlePrintThermalHistory}
                  disabled={isPrintingThermal}
                  className="flex-1 min-w-[80px]"
                  size="sm"
                >
                  <Printer className="w-4 h-4 mr-1" />
                  {isPrintingThermal ? '...' : 'Impresora'}
                </Button>
              )}
              <Button
                onClick={() => {
                  setShowHistoryDetailModal(false)
                  setSelectedHistorySession(null)
                  setHistoryMovements([])
                }}
                className="flex-1 min-w-[80px]"
                size="sm"
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
          setOpeningAmountUSD('')
        }}
        title="Abrir Caja"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Ingresa el monto inicial en efectivo con el que comienza el día
          </p>
          <Input
            label={cashMultiCurrencyOn ? 'Monto Inicial en Soles (S/)' : 'Monto Inicial'}
            type="number"
            step="0.01"
            placeholder="0.00"
            value={openingAmount}
            onChange={(e) => setOpeningAmount(e.target.value)}
            required
          />
          {cashMultiCurrencyOn && (
            <div>
              <Input
                label="Monto Inicial en Dólares ($) — opcional"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={openingAmountUSD}
                onChange={(e) => setOpeningAmountUSD(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Solo si tienes efectivo en dólares en la caja al abrir. Déjalo vacío si no.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowOpenModal(false)
                setOpeningAmount('')
                setOpeningAmountUSD('')
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleOpenCashRegister} disabled={isOpening}>
              {isOpening ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Abriendo...
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 mr-2" />
                  Abrir Caja
                </>
              )}
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
            setClosingCounts({ cash: '', card: '', transfer: '', yape: '', plin: '', rappi: '', pedidosYa: '', diDiFood: '' })
            setClosingCountsUSD({ cash: '', card: '', transfer: '', yape: '', plin: '', rappi: '', pedidosYa: '', diDiFood: '' })
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
            {totals.salesPedidosYa > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">• Ventas en PedidosYa:</span>
                <span className="font-semibold text-gray-700">{formatCurrency(totals.salesPedidosYa)}</span>
              </div>
            )}
            {totals.salesDiDiFood > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">• Ventas en DiDiFood:</span>
                <span className="font-semibold text-gray-700">{formatCurrency(totals.salesDiDiFood)}</span>
              </div>
            )}

            {!hideExpectedForCashier && (
              <div className="border-t border-gray-300 pt-2 mt-3">
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-gray-700">Efectivo Esperado:</span>
                  <span className="text-xl font-bold text-primary-600">{formatCurrency(totals.expected)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Inicial ({formatCurrency(currentSession?.openingAmount || 0)}) + Ventas Efectivo + Ingresos - Egresos
                </p>
              </div>
            )}
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

          {totals.salesYape > 0 && (
            <Input
              label="Total en Yape"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={closingCounts.yape}
              onChange={(e) => setClosingCounts({ ...closingCounts, yape: e.target.value })}
              helperText="Suma de pagos recibidos por Yape"
            />
          )}

          {totals.salesPlin > 0 && (
            <Input
              label="Total en Plin"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={closingCounts.plin}
              onChange={(e) => setClosingCounts({ ...closingCounts, plin: e.target.value })}
              helperText="Suma de pagos recibidos por Plin"
            />
          )}

          {totals.salesRappi > 0 && (
            <Input
              label="Total en Rappi"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={closingCounts.rappi}
              onChange={(e) => setClosingCounts({ ...closingCounts, rappi: e.target.value })}
              helperText="Monto total de ventas por Rappi"
            />
          )}

          {totals.salesPedidosYa > 0 && (
            <Input
              label="Total en PedidosYa"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={closingCounts.pedidosYa}
              onChange={(e) => setClosingCounts({ ...closingCounts, pedidosYa: e.target.value })}
              helperText="Monto total de ventas por PedidosYa"
            />
          )}

          {totals.salesDiDiFood > 0 && (
            <Input
              label="Total en DiDiFood"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={closingCounts.diDiFood}
              onChange={(e) => setClosingCounts({ ...closingCounts, diDiFood: e.target.value })}
              helperText="Monto total de ventas por DiDiFood"
            />
          )}

          {closingCounts.cash && !hideExpectedForCashier && (
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

          {/* ========== ARQUEO EN DÓLARES (opt-in) ========== */}
          {/* Solo se muestra cuando hay actividad USD en la sesión.    */}
          {cashMultiCurrencyOn && totals.usd && (
            <div className="border-t-2 border-emerald-200 pt-4 mt-4 space-y-3">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded p-3">
                <DollarSign className="w-4 h-4 text-emerald-700" />
                <p className="text-sm font-semibold text-emerald-900">Arqueo en Dólares (USD)</p>
              </div>

              {/* Resumen ventas USD */}
              <div className="bg-emerald-50/40 p-3 rounded space-y-1.5 text-sm">
                {totals.usd.salesCash > 0 && (
                  <div className="flex justify-between"><span className="text-gray-600">• Efectivo:</span><span className="font-semibold text-green-700">{formatCurrency(totals.usd.salesCash, 'USD')}</span></div>
                )}
                {totals.usd.salesCard > 0 && (
                  <div className="flex justify-between"><span className="text-gray-600">• Tarjeta:</span><span className="font-semibold">{formatCurrency(totals.usd.salesCard, 'USD')}</span></div>
                )}
                {totals.usd.salesTransfer > 0 && (
                  <div className="flex justify-between"><span className="text-gray-600">• Transferencia:</span><span className="font-semibold">{formatCurrency(totals.usd.salesTransfer, 'USD')}</span></div>
                )}
                {totals.usd.salesYape > 0 && (
                  <div className="flex justify-between"><span className="text-gray-600">• Yape:</span><span className="font-semibold">{formatCurrency(totals.usd.salesYape, 'USD')}</span></div>
                )}
                {totals.usd.salesPlin > 0 && (
                  <div className="flex justify-between"><span className="text-gray-600">• Plin:</span><span className="font-semibold">{formatCurrency(totals.usd.salesPlin, 'USD')}</span></div>
                )}
                {!hideExpectedForCashier && (
                  <div className="border-t border-emerald-200 pt-2 mt-2 flex justify-between">
                    <span className="text-sm font-semibold text-gray-700">Efectivo USD Esperado:</span>
                    <span className="text-lg font-bold text-emerald-700">{formatCurrency(totals.usd.expected, 'USD')}</span>
                  </div>
                )}
                <p className="text-[11px] text-gray-500">
                  Apertura USD ({formatCurrency(currentSession?.openingAmountUSD || 0, 'USD')}) + Ventas Efectivo USD + Ingresos USD - Egresos USD
                </p>
              </div>

              <Input
                label="Efectivo USD Contado"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={closingCountsUSD.cash}
                onChange={(e) => setClosingCountsUSD({ ...closingCountsUSD, cash: e.target.value })}
                helperText="Cuenta los dólares en efectivo de la caja"
              />
              {totals.usd.salesCard > 0 && (
                <Input label="Total USD en Tarjetas" type="number" step="0.01" placeholder="0.00" value={closingCountsUSD.card} onChange={(e) => setClosingCountsUSD({ ...closingCountsUSD, card: e.target.value })} />
              )}
              {totals.usd.salesTransfer > 0 && (
                <Input label="Total USD en Transferencias" type="number" step="0.01" placeholder="0.00" value={closingCountsUSD.transfer} onChange={(e) => setClosingCountsUSD({ ...closingCountsUSD, transfer: e.target.value })} />
              )}
              {totals.usd.salesYape > 0 && (
                <Input label="Total USD en Yape" type="number" step="0.01" placeholder="0.00" value={closingCountsUSD.yape} onChange={(e) => setClosingCountsUSD({ ...closingCountsUSD, yape: e.target.value })} />
              )}
              {totals.usd.salesPlin > 0 && (
                <Input label="Total USD en Plin" type="number" step="0.01" placeholder="0.00" value={closingCountsUSD.plin} onChange={(e) => setClosingCountsUSD({ ...closingCountsUSD, plin: e.target.value })} />
              )}

              {closingCountsUSD.cash && !hideExpectedForCashier && (
                <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded">
                  <p className="text-xs font-medium text-gray-700 mb-1">Diferencia USD:</p>
                  <p className={`text-lg font-bold ${
                    parseFloat(closingCountsUSD.cash) - totals.usd.expected >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(parseFloat(closingCountsUSD.cash || 0) - totals.usd.expected, 'USD')}
                  </p>
                  {parseFloat(closingCountsUSD.cash) - totals.usd.expected !== 0 && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      {parseFloat(closingCountsUSD.cash) - totals.usd.expected > 0 ? 'Sobrante' : 'Faltante'}
                    </p>
                  )}
                </div>
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
                  setClosingCounts({ cash: '', card: '', transfer: '', yape: '', plin: '', rappi: '', pedidosYa: '', diDiFood: '' })
                  setClosingCountsUSD({ cash: '', card: '', transfer: '', yape: '', plin: '', rappi: '', pedidosYa: '', diDiFood: '' })
                }}
                className="w-full"
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={handleCloseCashRegister}
                className="w-full"
                disabled={isClosing}
              >
                {isClosing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cerrando...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Cerrar Caja
                  </>
                )}
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

            {/* Botones de descarga e impresión */}
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">Descarga o imprime el reporte de cierre:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  onClick={handleDownloadExcel}
                  className="w-full"
                  size="sm"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadPDF}
                  className="w-full"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-1" />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePrintTicket}
                  className="w-full"
                  size="sm"
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Ticket
                </Button>
                {/* Botón de impresión térmica (solo en app móvil) */}
                {isNative && isPrinterConnected && (
                  <Button
                    variant="outline"
                    onClick={handlePrintThermal}
                    disabled={isPrintingThermal}
                    className="w-full"
                    size="sm"
                  >
                    <Printer className="w-4 h-4 mr-1" />
                    {isPrintingThermal ? 'Imprimiendo...' : 'Impresora'}
                  </Button>
                )}
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

          {/* Multi-divisa: selector de moneda del movimiento (solo si flag on) */}
          {cashMultiCurrencyOn && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
              <div className="flex gap-2">
                {['PEN', 'USD'].map(ccy => (
                  <button
                    key={ccy}
                    type="button"
                    onClick={() => setMovementData({ ...movementData, currency: ccy })}
                    className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      (movementData.currency || 'PEN') === ccy
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {ccy === 'PEN' ? 'S/ Soles' : '$ Dólares'}
                  </button>
                ))}
              </div>
            </div>
          )}

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

      {/* Ticket Oculto para Impresión */}
      {printSessionData && companySettings && (
        <div className="hidden print:block">
          <CashClosureTicket
            sessionData={printSessionData}
            movements={printMovements}
            invoices={printSessionData === closedSessionData ? todayInvoices : []}
            deferredPayments={printSessionData?.deferredPayments || (printSessionData === closedSessionData ? (totals.deferredPayments || []) : [])}
            companySettings={companySettings}
            paperWidth={printerConfig?.paperWidth || 80}
            branchName={selectedBranch?.name || null}
            printMargins={printerConfig?.printMargins ?? 8}
            simplePrint={printerConfig?.simplePrint || false}
          />
        </div>
      )}
    </div>
  )
}
