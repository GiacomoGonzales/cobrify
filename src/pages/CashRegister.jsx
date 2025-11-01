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
  const { user, isDemoMode, demoData } = useAppContext()
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
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayInvoicesList = (demoData.invoices || []).filter(invoice => {
          const invoiceDate = invoice.createdAt instanceof Date ? invoice.createdAt : new Date(invoice.createdAt)
          invoiceDate.setHours(0, 0, 0, 0)
          return invoiceDate.getTime() === today.getTime()
        })
        setTodayInvoices(todayInvoicesList)

        setIsLoading(false)
        return
      }

      // Obtener sesión actual
      const sessionResult = await getCashRegisterSession(user.uid)
      if (sessionResult.success && sessionResult.data) {
        setCurrentSession(sessionResult.data)

        // Obtener movimientos de la sesión
        const movementsResult = await getCashMovements(user.uid, sessionResult.data.id)
        if (movementsResult.success) {
          setMovements(movementsResult.data || [])
        }
      } else {
        setCurrentSession(null)
        setMovements([])
      }

      // Obtener facturas del día
      const invoicesResult = await getInvoices(user.uid)
      if (invoicesResult.success) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayInvoicesList = (invoicesResult.data || []).filter(invoice => {
          const invoiceDate = invoice.createdAt?.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
          invoiceDate.setHours(0, 0, 0, 0)
          return invoiceDate.getTime() === today.getTime()
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

      const result = await openCashRegister(user.uid, parseFloat(openingAmount))
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
      // MODO DEMO: Simular cierre sin guardar en Firebase
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Cerrando caja simulada...')
        await new Promise(resolve => setTimeout(resolve, 500)) // Simular delay

        toast.success('Caja cerrada correctamente (DEMO - No se guardó)', { duration: 5000 })
        setShowCloseModal(false)
        setClosingCounts({ cash: '', card: '', transfer: '' })

        // Actualizar el estado local
        setCurrentSession(null)
        setMovements([])
        return
      }

      const result = await closeCashRegister(user.uid, currentSession.id, {
        cash,
        card,
        transfer,
      })
      if (result.success) {
        toast.success('Caja cerrada correctamente')
        setShowCloseModal(false)
        setClosingCounts({ cash: '', card: '', transfer: '' })

        // Actualizar el estado local inmediatamente para evitar problemas de caché
        setCurrentSession(null)
        setMovements([])

        // Recargar datos después de un breve delay para asegurar que Firestore se actualizó
        setTimeout(() => {
          loadData()
        }, 500)
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
      const businessResult = await getCompanySettings(user.uid)
      const businessData = businessResult.success ? businessResult.data : null

      // Calcular los valores de cierre si están disponibles en closingCounts
      const cash = parseFloat(closingCounts.cash) || currentSession.closingCash || 0
      const card = parseFloat(closingCounts.card) || currentSession.closingCard || 0
      const transfer = parseFloat(closingCounts.transfer) || currentSession.closingTransfer || 0
      const totalCounted = cash + card + transfer

      // Preparar datos de la sesión con los totales
      const sessionDataWithTotals = {
        ...currentSession,
        totalSales: totals.sales,
        totalIncome: totals.income,
        totalExpense: totals.expense,
        expectedAmount: totals.expected,
        closingCash: cash,
        closingCard: card,
        closingTransfer: transfer,
        closingAmount: totalCounted,
      }

      generateCashReportExcel(sessionDataWithTotals, movements, todayInvoices, businessData)
      toast.success('Reporte Excel descargado correctamente')
    } catch (error) {
      console.error('Error al generar Excel:', error)
      toast.error('Error al generar el reporte Excel')
    }
  }

  const handleDownloadPDF = async () => {
    try {
      // Obtener datos del negocio
      const businessResult = await getCompanySettings(user.uid)
      const businessData = businessResult.success ? businessResult.data : null

      // Calcular los valores de cierre si están disponibles en closingCounts
      const cash = parseFloat(closingCounts.cash) || currentSession.closingCash || 0
      const card = parseFloat(closingCounts.card) || currentSession.closingCard || 0
      const transfer = parseFloat(closingCounts.transfer) || currentSession.closingTransfer || 0
      const totalCounted = cash + card + transfer

      // Preparar datos de la sesión con los totales
      const sessionDataWithTotals = {
        ...currentSession,
        totalSales: totals.sales,
        totalIncome: totals.income,
        totalExpense: totals.expense,
        expectedAmount: totals.expected,
        closingCash: cash,
        closingCard: card,
        closingTransfer: transfer,
        closingAmount: totalCounted,
      }

      generateCashReportPDF(sessionDataWithTotals, movements, todayInvoices, businessData)
      toast.success('Reporte PDF descargado correctamente')
    } catch (error) {
      console.error('Error al generar PDF:', error)
      toast.error('Error al generar el reporte PDF')
    }
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

      const result = await addCashMovement(user.uid, currentSession.id, {
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
    if (!currentSession) return { sales: 0, income: 0, expense: 0, expected: 0, difference: 0 }

    // Total de ventas (facturas del día)
    const sales = todayInvoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0)

    // Ingresos adicionales (movimientos tipo income)
    const income = movements
      .filter(m => m.type === 'income')
      .reduce((sum, m) => sum + (m.amount || 0), 0)

    // Egresos (movimientos tipo expense)
    const expense = movements
      .filter(m => m.type === 'expense')
      .reduce((sum, m) => sum + (m.amount || 0), 0)

    // Dinero esperado en caja
    const expected = currentSession.openingAmount + sales + income - expense

    // Diferencia (si hay cierre)
    let difference = 0
    if (currentSession.closingAmount !== undefined) {
      difference = currentSession.closingAmount - expected
    }

    return { sales, income, expense, expected, difference }
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
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-xs sm:text-sm text-green-600">+ Ventas:</span>
                    <span className="text-sm sm:text-base font-semibold text-green-600">{formatCurrency(totals.sales)}</span>
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
          setShowCloseModal(false)
          setClosingCounts({ cash: '', card: '', transfer: '' })
        }}
        title="Cerrar Caja"
        size="lg"
      >
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Arqueo de Caja:</strong> Cuenta el dinero físico y registra los montos por método de pago
            </p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">Efectivo Esperado:</p>
            <p className="text-2xl font-bold text-primary-600">{formatCurrency(totals.expected)}</p>
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
            {/* Download Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-3 border-b border-gray-200">
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
