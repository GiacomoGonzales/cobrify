import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Lock, Unlock, Plus, Calendar, Download, FileSpreadsheet } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
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
  getInvoices,
  getCompanySettings,
} from '@/services/firestoreService'
import { generateCashReportExcel, generateCashReportPDF } from '@/services/cashReportService'

export default function CashRegister() {
  const { user, isDemoMode, demoData, getBusinessId } = useAppContext()
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [currentSession, setCurrentSession] = useState(null)
  const [movements, setMovements] = useState([])
  const [todayInvoices, setTodayInvoices] = useState([])

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

  useEffect(() => {
    if (user?.uid) {
      loadData()
    }
  }, [user])

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

        // Filtrar facturas del día de hoy
        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

        const todayInvoicesList = (demoData.invoices || []).filter(invoice => {
          const invoiceDate = invoice.createdAt instanceof Date ? invoice.createdAt : new Date(invoice.createdAt)
          return invoiceDate >= todayStart && invoiceDate <= todayEnd
        })
        setTodayInvoices(todayInvoicesList)

        setIsLoading(false)
        return
      }

      // Obtener sesión actual
      const sessionResult = await getCashRegisterSession(getBusinessId())
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

      // Obtener facturas del día
      const invoicesResult = await getInvoices(getBusinessId())
      if (invoicesResult.success) {
        const now = new Date()
        const todayYear = now.getFullYear()
        const todayMonth = now.getMonth()
        const todayDay = now.getDate()

        const todayInvoicesList = (invoicesResult.data || []).filter(invoice => {
          const invoiceDate = invoice.createdAt?.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
          // Comparar solo año, mes y día en hora local
          return invoiceDate.getFullYear() === todayYear &&
                 invoiceDate.getMonth() === todayMonth &&
                 invoiceDate.getDate() === todayDay
        })
        setTodayInvoices(todayInvoicesList)
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar los datos')
    } finally {
      setIsLoading(false)
    }
  }

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

      const result = await openCashRegister(getBusinessId(), parseFloat(openingAmount))
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

      generateCashReportExcel(sessionData, movements, todayInvoices, businessData)
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

      generateCashReportPDF(sessionData, movements, todayInvoices, businessData)
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

  // Cálculos
  const calculateTotals = () => {
    if (!currentSession) return {
      sales: 0,
      salesCash: 0,
      salesCard: 0,
      salesTransfer: 0,
      salesYape: 0,
      salesPlin: 0,
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
      // Si la factura tiene múltiples métodos de pago (array payments)
      if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
        const invoiceTotal = parseFloat(invoice.total) || 0

        // Si hay un solo método de pago, usar el TOTAL DE LA FACTURA (no el monto pagado que puede incluir vuelto)
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
          }
        } else {
          // Múltiples métodos de pago: usar los montos reales de cada pago
          // (en pagos mixtos el usuario ingresa montos exactos, no hay vuelto por método)
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
            }
          })
        }
      } else {
        // Facturas antiguas sin array payments - usar paymentMethod y sumar el total completo
        const total = invoice.total || 0
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
        }
      }
    })

    // Total de ventas (todos los métodos)
    const sales = salesCash + salesCard + salesTransfer + salesYape + salesPlin

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
      income,
      expense,
      expected,
      difference
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

        {!currentSession ? (
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
        )}
      </div>

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
                    <p className="text-sm text-gray-600">Ventas del Día</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(totals.sales)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">{todayInvoices.length} comprobantes</p>
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
                      <span className="text-xs sm:text-sm font-medium text-gray-700">Ventas del Día:</span>
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
                <CardTitle className="text-base sm:text-lg">Movimientos del Día</CardTitle>
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
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
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
                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-0 sm:text-right ml-13 sm:ml-0">
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
            <p className="text-sm font-medium text-gray-700 mb-3">Resumen de Ventas del Día:</p>

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

      {/* Modal Agregar Movimiento */}
      <Modal
        isOpen={showMovementModal}
        onClose={() => {
          setShowMovementModal(false)
          setMovementData({
            type: 'income',
            amount: '',
            description: '',
            category: '',
          })
        }}
        title="Registrar Movimiento"
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
            <Button onClick={handleAddMovement}>
              <Plus className="w-4 h-4 mr-2" />
              Registrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
