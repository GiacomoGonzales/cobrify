import { useState, useEffect, useCallback } from 'react'
import {
  Truck, Plus, Edit, Trash2, UserCheck, DollarSign, TrendingUp,
  Loader2, Search, Package, Clock, CheckCircle, XCircle, Filter,
  CircleDot, Coffee, WifiOff, X, FileText, ArrowRight, Bike, Receipt,
} from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import {
  getMotoristas, getMotoristasStats, deleteMotorista, toggleMotoristaStatus,
  updateOperationalStatus, getDeliveries, getActiveMotoristas,
  getUnsettledDeliveriesForMotorista, settleDeliveries,
  createDeliveryRecord, updateDeliveryStatus,
} from '@/services/motoristaService'
import { getInvoices, getCompanySettings } from '@/services/firestoreService'
import { previewDeliveryPDF } from '@/utils/deliveryPdfGenerator'
import { Capacitor } from '@capacitor/core'
import { useAppContext } from '@/hooks/useAppContext'
import DeliveryTicket from '@/components/DeliveryTicket'
import { useToast } from '@/contexts/ToastContext'
import MotoristaFormModal from '@/components/restaurant/MotoristaFormModal'

const OPERATIONAL_STATUS_CONFIG = {
  available: { label: 'Disponible', color: 'success', icon: CheckCircle },
  on_delivery: { label: 'En entrega', color: 'info', icon: Package },
  break: { label: 'Descanso', color: 'warning', icon: Coffee },
  offline: { label: 'Desconectado', color: 'secondary', icon: WifiOff },
}

const VEHICLE_LABELS = {
  moto: 'Moto',
  auto: 'Auto',
  bicicleta: 'Bicicleta',
  pie: 'A pie',
}

const DELIVERY_STATUS_LABELS = {
  assigned: 'Asignado',
  in_transit: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const DELIVERY_STATUS_FLOW = {
  assigned: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  card: 'Tarjeta',
  tarjeta: 'Tarjeta',
  transfer: 'Transferencia',
  transferencia: 'Transferencia',
  yape: 'Yape',
  plin: 'Plin',
}

export default function Envios() {
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState('envios')
  const [motoristas, setMotoristas] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingMotorista, setEditingMotorista] = useState(null)

  // Tab Envíos
  const [deliveries, setDeliveries] = useState([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)
  const [deliveryFilters, setDeliveryFilters] = useState(() => {
    const peruDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    return {
      startDate: peruDate,
      endDate: peruDate,
      motoristaId: '',
      status: '',
      paymentMethod: '',
    }
  })

  // Modal Nuevo Envío
  const [isNewDeliveryModalOpen, setIsNewDeliveryModalOpen] = useState(false)

  // Company settings (for PDF generation)
  const [companySettings, setCompanySettings] = useState(null)
  const [printingTicket, setPrintingTicket] = useState(null)

  // Tab Arqueo
  const [arqueoMotoristaId, setArqueoMotoristaId] = useState('')
  const [arqueoDate, setArqueoDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }))
  const [unsettledDeliveries, setUnsettledDeliveries] = useState([])
  const [arqueoLoading, setArqueoLoading] = useState(false)
  const [actualAmount, setActualAmount] = useState('')
  const [settlingLoading, setSettlingLoading] = useState(false)

  useEffect(() => {
    loadMotoristas()
    loadCompanySettings()
  }, [isDemoMode])

  const loadCompanySettings = async () => {
    try {
      const result = await getCompanySettings(getBusinessId())
      if (result.success && result.data) setCompanySettings(result.data)
    } catch (error) {
      console.error('Error loading company settings:', error)
    }
  }

  const loadMotoristas = async () => {
    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const [motoristasResult, statsResult] = await Promise.all([
        getMotoristas(businessId),
        getMotoristasStats(businessId),
      ])

      if (motoristasResult.success) {
        setMotoristas(motoristasResult.data || [])
      } else {
        toast.error('Error al cargar motoristas: ' + motoristasResult.error)
      }

      if (statsResult.success) {
        setStats(statsResult.data)
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar datos de envíos')
    } finally {
      setIsLoading(false)
    }
  }

  // ========================
  // Tab Motoristas handlers
  // ========================
  const handleCreate = () => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    setEditingMotorista(null)
    setIsFormModalOpen(true)
  }

  const handleEdit = (m) => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    setEditingMotorista(m)
    setIsFormModalOpen(true)
  }

  const handleDelete = async (m) => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    if (!window.confirm(`¿Eliminar al motorista ${m.name}?`)) return
    try {
      const result = await deleteMotorista(getBusinessId(), m.id)
      if (result.success) {
        toast.success('Motorista eliminado')
        loadMotoristas()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al eliminar motorista')
    }
  }

  const handleToggleStatus = async (m) => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    const newStatus = m.status !== 'active'
    try {
      const result = await toggleMotoristaStatus(getBusinessId(), m.id, newStatus)
      if (result.success) {
        toast.success(`Motorista ${newStatus ? 'activado' : 'desactivado'}`)
        loadMotoristas()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al cambiar estado')
    }
  }

  const handleChangeOperationalStatus = async (m, newStatus) => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    try {
      const result = await updateOperationalStatus(getBusinessId(), m.id, newStatus)
      if (result.success) {
        toast.success(`Estado cambiado a ${OPERATIONAL_STATUS_CONFIG[newStatus]?.label}`)
        loadMotoristas()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al cambiar estado operacional')
    }
  }

  const handleFormSuccess = () => {
    setIsFormModalOpen(false)
    setEditingMotorista(null)
    loadMotoristas()
  }

  // ========================
  // Tab Envíos handlers
  // ========================
  const loadDeliveries = async () => {
    setDeliveriesLoading(true)
    try {
      const result = await getDeliveries(getBusinessId(), deliveryFilters)
      if (result.success) {
        setDeliveries(result.data || [])
      } else {
        toast.error('Error al cargar envíos: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al cargar envíos')
    } finally {
      setDeliveriesLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'envios') {
      loadDeliveries()
    }
  }, [activeTab])

  const handleStatusChange = async (delivery, newStatus) => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    try {
      const result = await updateDeliveryStatus(getBusinessId(), delivery.id, newStatus)
      if (result.success) {
        toast.success(`Estado actualizado a ${DELIVERY_STATUS_LABELS[newStatus]}`)
        loadDeliveries()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al actualizar estado')
    }
  }

  const handleNewDeliveryCreated = () => {
    setIsNewDeliveryModalOpen(false)
    loadDeliveries()
    loadMotoristas() // refresh stats
  }

  const handlePrintPDF = async (delivery) => {
    try {
      await previewDeliveryPDF(delivery, companySettings)
    } catch (error) {
      console.error('Error al generar PDF de envío:', error)
      toast.error('Error al generar la guía de envío')
    }
  }

  const handlePrintTicket = async (delivery) => {
    // En nativo, intentar impresora térmica primero
    if (Capacitor.isNativePlatform()) {
      try {
        const { getPrinterConfig, connectPrinter, printDeliveryTicket } = await import('@/services/thermalPrinterService')
        const printerConfigResult = await getPrinterConfig(getBusinessId())

        if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
          const connectResult = await connectPrinter(printerConfigResult.config.address)

          if (connectResult.success) {
            const result = await printDeliveryTicket(delivery, companySettings, printerConfigResult.config.paperWidth || 80)
            if (result.success) {
              toast.success('Guía de envío impresa en ticketera')
              return
            }
            toast.error('Error al imprimir: ' + result.error)
            toast.info('Usando impresión estándar...')
          } else {
            toast.error('No se pudo conectar a la impresora')
            toast.info('Usando impresión estándar...')
          }
        }
      } catch (error) {
        console.error('Error al imprimir en ticketera:', error)
        toast.info('Usando impresión estándar...')
      }
    }

    // Fallback web o si falla la térmica: window.print() con componente ticket
    setPrintingTicket(delivery)
    setTimeout(() => {
      window.print()
      setTimeout(() => setPrintingTicket(null), 500)
    }, 100)
  }

  // ========================
  // Tab Arqueo handlers
  // ========================
  const handleConsultArqueo = async () => {
    if (!arqueoMotoristaId) {
      toast.error('Selecciona un motorista')
      return
    }
    setArqueoLoading(true)
    try {
      const result = await getUnsettledDeliveriesForMotorista(
        getBusinessId(), arqueoMotoristaId, arqueoDate
      )
      if (result.success) {
        setUnsettledDeliveries(result.data || [])
        setActualAmount('')
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al consultar arqueo')
    } finally {
      setArqueoLoading(false)
    }
  }

  const expectedTotal = unsettledDeliveries.reduce((sum, d) => sum + (d.cashCollected || d.amount || 0), 0)

  const handleSettleDeliveries = async () => {
    if (unsettledDeliveries.length === 0) return
    if (!actualAmount && actualAmount !== 0) {
      toast.error('Ingresa el monto real entregado')
      return
    }

    setSettlingLoading(true)
    try {
      const ids = unsettledDeliveries.map(d => d.id)
      const result = await settleDeliveries(getBusinessId(), ids, actualAmount)
      if (result.success) {
        const diff = parseFloat(actualAmount) - expectedTotal
        toast.success(
          `Arqueo cerrado. ${diff === 0 ? 'Cuadra perfecto.' : diff > 0 ? `Sobrante: S/ ${diff.toFixed(2)}` : `Faltante: S/ ${Math.abs(diff).toFixed(2)}`}`
        )
        setUnsettledDeliveries([])
        setActualAmount('')
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al cerrar arqueo')
    } finally {
      setSettlingLoading(false)
    }
  }

  // ========================
  // Render
  // ========================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando envíos...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'envios', label: 'Envíos' },
    { id: 'motoristas', label: 'Motoristas' },
    { id: 'arqueo', label: 'Arqueo' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-7 h-7" />
            Envíos
          </h1>
          <p className="text-gray-600 mt-1">Gestión de envíos, repartidores y arqueo de caja</p>
        </div>
        {activeTab === 'envios' && (
          <Button onClick={() => {
            if (isDemoMode) { toast.info('No disponible en demo'); return }
            setIsNewDeliveryModalOpen(true)
          }} className="flex items-center gap-2 w-full md:w-auto">
            <Plus className="w-4 h-4" />
            Nuevo Envío
          </Button>
        )}
        {activeTab === 'motoristas' && (
          <Button onClick={handleCreate} className="flex items-center gap-2 w-full md:w-auto">
            <Plus className="w-4 h-4" />
            Nuevo Motorista
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'envios' && (
        <TabEnvios
          deliveries={deliveries}
          loading={deliveriesLoading}
          filters={deliveryFilters}
          setFilters={setDeliveryFilters}
          motoristas={motoristas}
          onSearch={loadDeliveries}
          onStatusChange={handleStatusChange}
          onPrintPDF={handlePrintPDF}
          onPrintTicket={handlePrintTicket}
          stats={stats}
        />
      )}

      {activeTab === 'motoristas' && (
        <TabMotoristas
          motoristas={motoristas}
          stats={stats}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
          onChangeOperationalStatus={handleChangeOperationalStatus}
        />
      )}

      {activeTab === 'arqueo' && (
        <TabArqueo
          motoristas={motoristas.filter(m => m.status === 'active')}
          motoristaId={arqueoMotoristaId}
          setMotoristaId={setArqueoMotoristaId}
          date={arqueoDate}
          setDate={setArqueoDate}
          unsettledDeliveries={unsettledDeliveries}
          loading={arqueoLoading}
          onConsult={handleConsultArqueo}
          expectedTotal={expectedTotal}
          actualAmount={actualAmount}
          setActualAmount={setActualAmount}
          onSettle={handleSettleDeliveries}
          settlingLoading={settlingLoading}
        />
      )}

      {/* Modal Motorista */}
      <MotoristaFormModal
        isOpen={isFormModalOpen}
        onClose={() => { setIsFormModalOpen(false); setEditingMotorista(null) }}
        motorista={editingMotorista}
        onSuccess={handleFormSuccess}
      />

      {/* Modal Nuevo Envío desde Factura */}
      <NewDeliveryModal
        isOpen={isNewDeliveryModalOpen}
        onClose={() => setIsNewDeliveryModalOpen(false)}
        motoristas={motoristas.filter(m => m.status === 'active')}
        onSuccess={handleNewDeliveryCreated}
      />

      {/* Componente de ticket para impresión web (hidden, visible solo en @media print) */}
      {printingTicket && (
        <DeliveryTicket
          delivery={printingTicket}
          companySettings={companySettings}
          paperWidth={80}
        />
      )}
    </div>
  )
}

// ============================================================
// Modal: Nuevo Envío desde Factura
// ============================================================
function NewDeliveryModal({ isOpen, onClose, motoristas, onSuccess }) {
  const { getBusinessId } = useAppContext()
  const toast = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [invoices, setInvoices] = useState([])
  const [filteredInvoices, setFilteredInvoices] = useState([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [selectedMotoristaId, setSelectedMotoristaId] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('paid') // 'paid' | 'pending'
  const [creating, setCreating] = useState(false)

  // Load invoices when modal opens
  useEffect(() => {
    if (isOpen) {
      loadInvoices()
      setSearchQuery('')
      setSelectedInvoice(null)
      setSelectedMotoristaId('')
      setDeliveryFee('')
      setDeliveryAddress('')
      setPaymentStatus('paid')
    }
  }, [isOpen])

  const loadInvoices = async () => {
    setLoadingInvoices(true)
    try {
      const result = await getInvoices(getBusinessId())
      if (result.success) {
        // Only show recent invoices (last 30 days) that are not cancelled
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const recent = (result.data || []).filter(inv => {
          if (inv.status === 'cancelled' || inv.status === 'anulado') return false
          return true
        }).slice(0, 200) // limit to 200 most recent
        setInvoices(recent)
        setFilteredInvoices(recent.slice(0, 20))
      }
    } catch (error) {
      toast.error('Error al cargar facturas')
    } finally {
      setLoadingInvoices(false)
    }
  }

  // Filter invoices by search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredInvoices(invoices.slice(0, 20))
      return
    }
    const q = searchQuery.toLowerCase()
    const filtered = invoices.filter(inv => {
      const number = (inv.serie ? `${inv.serie}-${inv.number}` : inv.number || '').toLowerCase()
      const customer = (inv.customer?.name || inv.customerName || '').toLowerCase()
      return number.includes(q) || customer.includes(q)
    })
    setFilteredInvoices(filtered.slice(0, 20))
  }, [searchQuery, invoices])

  const handleSelectInvoice = (inv) => {
    setSelectedInvoice(inv)
    setDeliveryAddress(inv.customer?.address || inv.customerAddress || '')
  }

  const handleCreateDelivery = async () => {
    if (!selectedInvoice) {
      toast.error('Selecciona una factura')
      return
    }
    if (!selectedMotoristaId) {
      toast.error('Selecciona un motorista')
      return
    }

    setCreating(true)
    try {
      const motorista = motoristas.find(m => m.id === selectedMotoristaId)
      const inv = selectedInvoice
      const result = await createDeliveryRecord(getBusinessId(), {
        motoristaId: selectedMotoristaId,
        motoristaName: motorista?.name || '',
        motoristaCode: motorista?.code || '',
        orderId: inv.id,
        orderNumber: inv.serie ? `${inv.serie}-${inv.number}` : (inv.number || ''),
        customerName: inv.customer?.name || inv.customerName || '',
        customerAddress: deliveryAddress,
        amount: inv.total || inv.amount || 0,
        deliveryFee: parseFloat(deliveryFee) || 0,
        paymentMethod: inv.paymentMethod || inv.metodoPago || 'cash',
        paymentStatus: paymentStatus,
        cashCollected: paymentStatus === 'pending' ? (inv.total || inv.amount || 0) : 0,
        status: 'assigned',
      })

      if (result.success) {
        toast.success('Envío creado exitosamente')
        onSuccess()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al crear envío')
    } finally {
      setCreating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Nuevo Envío desde Factura
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-130px)]">
          {/* Step 1: Search invoice */}
          {!selectedInvoice ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buscar factura</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por número o nombre de cliente..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    autoFocus
                  />
                </div>
              </div>

              {loadingInvoices ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : (
                <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                  {filteredInvoices.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                      <p>No se encontraron facturas</p>
                    </div>
                  ) : (
                    filteredInvoices.map(inv => (
                      <button
                        key={inv.id}
                        onClick={() => handleSelectInvoice(inv)}
                        className="w-full px-4 py-3 hover:bg-blue-50 text-left flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-sm">
                              {inv.serie ? `${inv.serie}-${inv.number}` : inv.number}
                            </span>
                            <Badge variant="default" className="text-xs">
                              {PAYMENT_METHOD_LABELS[inv.paymentMethod || inv.metodoPago] || inv.paymentMethod || 'N/A'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">
                            {inv.customer?.name || inv.customerName || 'Sin cliente'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">S/ {(inv.total || inv.amount || 0).toFixed(2)}</p>
                          <ArrowRight className="w-4 h-4 text-gray-400 ml-auto mt-1" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Step 2: Assign motorista */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Factura seleccionada</p>
                    <p className="font-mono font-semibold mt-1">
                      {selectedInvoice.serie ? `${selectedInvoice.serie}-${selectedInvoice.number}` : selectedInvoice.number}
                    </p>
                    <p className="text-sm text-gray-600">
                      {selectedInvoice.customer?.name || selectedInvoice.customerName || 'Sin cliente'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">S/ {(selectedInvoice.total || selectedInvoice.amount || 0).toFixed(2)}</p>
                    <Badge variant="default" className="mt-1">
                      {PAYMENT_METHOD_LABELS[selectedInvoice.paymentMethod || selectedInvoice.metodoPago] || 'N/A'}
                    </Badge>
                  </div>
                </div>
                {(selectedInvoice.customer?.address || selectedInvoice.customerAddress) && (
                  <p className="text-sm text-gray-500 mt-2">
                    Dirección: {selectedInvoice.customer?.address || selectedInvoice.customerAddress}
                  </p>
                )}
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="text-sm text-blue-600 hover:text-blue-800 mt-2 underline"
                >
                  Cambiar factura
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asignar Motorista</label>
                <Select value={selectedMotoristaId} onChange={(e) => setSelectedMotoristaId(e.target.value)}>
                  <option value="">Seleccionar motorista...</option>
                  {motoristas.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección de entrega</label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Dirección donde se entregará el pedido..."
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado de pago</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('paid')}
                    className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      paymentStatus === 'paid'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    ✓ Pagado
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatus('pending')}
                    className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      paymentStatus === 'pending'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    $ Por cobrar
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Costo de envío (S/)</label>
                <Input
                  type="number"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {selectedInvoice && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateDelivery}
              disabled={creating || !selectedMotoristaId}
              className="flex items-center gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
              Crear Envío
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Tab 1: Envíos (Principal)
// ============================================================
function TabEnvios({ deliveries, loading, filters, setFilters, motoristas, onSearch, onStatusChange, onPrintPDF, onPrintTicket, stats }) {
  const handleFilterChange = (e) => {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  // Compute stats from deliveries
  const todayDeliveries = stats?.todayDeliveries || 0
  const inTransit = deliveries.filter(d => d.status === 'in_transit').length
  const cashCollected = stats?.todayCashCollected || 0
  const completed = deliveries.filter(d => d.status === 'delivered').length

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Envíos Hoy</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{todayDeliveries}</p>
              </div>
              <Package className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En Tránsito</p>
                <p className="text-2xl font-bold text-yellow-600 mt-2">{inTransit}</p>
              </div>
              <Clock className="w-10 h-10 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Efectivo Cobrado</p>
                <p className="text-2xl font-bold text-green-600 mt-2">S/ {cashCollected.toFixed(2)}</p>
              </div>
              <DollarSign className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Entregas Completadas</p>
                <p className="text-2xl font-bold text-green-600 mt-2">{completed}</p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <Input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
              <Input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motorista</label>
              <Select name="motoristaId" value={filters.motoristaId} onChange={handleFilterChange}>
                <option value="">Todos</option>
                {motoristas.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <Select name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">Todos</option>
                <option value="assigned">Asignado</option>
                <option value="in_transit">En camino</option>
                <option value="delivered">Entregado</option>
                <option value="cancelled">Cancelado</option>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={onSearch} className="w-full flex items-center justify-center gap-2">
                <Search className="w-4 h-4" />
                Buscar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Envíos */}
      <Card>
        <CardHeader>
          <CardTitle>Envíos ({deliveries.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No se encontraron envíos</p>
              <p className="text-sm text-gray-500 mt-1">Crea un nuevo envío con el botón superior</p>
            </div>
          ) : (
            <>
              {/* Vista de tarjetas para móvil */}
              <div className="lg:hidden divide-y divide-gray-100">
                {deliveries.map((d) => {
                  const nextStatuses = DELIVERY_STATUS_FLOW[d.status] || []
                  return (
                    <div key={d.id} className="py-3">
                      {/* Fila 1: Factura + Monto + Imprimir */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-primary-600">{d.orderNumber || '-'}</span>
                          <Badge variant="default" className="text-xs">
                            {PAYMENT_METHOD_LABELS[d.paymentMethod] || d.paymentMethod}
                          </Badge>
                          <Badge
                            variant={d.paymentStatus === 'pending' ? 'warning' : 'success'}
                            className="text-xs"
                          >
                            {d.paymentStatus === 'pending' ? 'Por cobrar' : 'Pagado'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-semibold mr-1">S/ {(d.amount || 0).toFixed(2)}</span>
                          <button
                            onClick={() => onPrintPDF(d)}
                            className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                            title="Descargar PDF"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onPrintTicket(d)}
                            className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                            title="Imprimir ticket"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Fila 2: Cliente + Motorista */}
                      <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-600">
                        <span className="truncate flex-1">{d.customerName || 'Sin cliente'}</span>
                        <span className="flex items-center gap-1 text-blue-600 flex-shrink-0">
                          <Bike className="w-3.5 h-3.5" />
                          {d.motoristaName || '-'}
                        </span>
                      </div>

                      {/* Fila 3: Fecha + Estado */}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500">
                          {d.createdAt?.toDate
                            ? d.createdAt.toDate().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
                            : '-'}
                        </span>
                        {nextStatuses.length > 0 ? (
                          <select
                            value={d.status}
                            onChange={(e) => onStatusChange(d, e.target.value)}
                            className={`text-xs px-2 py-1 border rounded font-medium cursor-pointer ${
                              d.status === 'assigned' ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                              : d.status === 'in_transit' ? 'border-blue-300 bg-blue-50 text-blue-700'
                              : 'border-gray-300 bg-white text-gray-700'
                            }`}
                          >
                            <option value={d.status}>{DELIVERY_STATUS_LABELS[d.status]}</option>
                            {nextStatuses.map(s => (
                              <option key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        ) : (
                          <Badge
                            variant={
                              d.status === 'delivered' ? 'success'
                              : d.status === 'cancelled' ? 'destructive'
                              : 'default'
                            }
                            className="text-xs"
                          >
                            {DELIVERY_STATUS_LABELS[d.status] || d.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Tabla para desktop */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha/Hora</TableHead>
                      <TableHead>Factura #</TableHead>
                      <TableHead>Motorista</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Método Pago</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((d) => {
                      const nextStatuses = DELIVERY_STATUS_FLOW[d.status] || []
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="text-sm text-gray-600">
                            {d.createdAt?.toDate
                              ? d.createdAt.toDate().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
                              : '-'}
                          </TableCell>
                          <TableCell className="font-mono">{d.orderNumber || '-'}</TableCell>
                          <TableCell className="font-medium">{d.motoristaName || '-'}</TableCell>
                          <TableCell>{d.customerName || '-'}</TableCell>
                          <TableCell className="text-right font-semibold">
                            S/ {(d.amount || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="default" className="w-fit">
                              {PAYMENT_METHOD_LABELS[d.paymentMethod] || d.paymentMethod}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={d.paymentStatus === 'pending' ? 'warning' : 'success'}
                              className="w-fit"
                            >
                              {d.paymentStatus === 'pending' ? 'Por cobrar' : 'Pagado'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {nextStatuses.length > 0 ? (
                              <select
                                value={d.status}
                                onChange={(e) => onStatusChange(d, e.target.value)}
                                className={`text-sm px-2 py-1 border rounded font-medium cursor-pointer ${
                                  d.status === 'assigned' ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                                  : d.status === 'in_transit' ? 'border-blue-300 bg-blue-50 text-blue-700'
                                  : 'border-gray-300 bg-white text-gray-700'
                                }`}
                              >
                                <option value={d.status}>{DELIVERY_STATUS_LABELS[d.status]}</option>
                                {nextStatuses.map(s => (
                                  <option key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</option>
                                ))}
                              </select>
                            ) : (
                              <Badge
                                variant={
                                  d.status === 'delivered' ? 'success'
                                  : d.status === 'cancelled' ? 'destructive'
                                  : 'default'
                                }
                                className="w-fit"
                              >
                                {DELIVERY_STATUS_LABELS[d.status] || d.status}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => onPrintPDF(d)}
                                className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                                title="Descargar PDF"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => onPrintTicket(d)}
                                className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                                title="Imprimir ticket"
                              >
                                <Receipt className="w-4 h-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ============================================================
// Tab 2: Motoristas (CRUD)
// ============================================================
function TabMotoristas({ motoristas, stats, onEdit, onDelete, onToggleStatus, onChangeOperationalStatus }) {
  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Activos</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats?.active || 0}</p>
                <p className="text-xs text-gray-500 mt-1">de {stats?.total || 0} totales</p>
              </div>
              <UserCheck className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Entregas Hoy</p>
                <p className="text-2xl font-bold text-blue-600 mt-2">{stats?.todayDeliveries || 0}</p>
                <p className="text-xs text-gray-500 mt-1">envíos realizados</p>
              </div>
              <Package className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Efectivo Cobrado</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  S/ {(stats?.todayCashCollected || 0).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">hoy en efectivo</p>
              </div>
              <DollarSign className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ganancia Promedio</p>
                <p className="text-2xl font-bold text-purple-600 mt-2">
                  S/ {(stats?.averageEarning || 0).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">por entrega</p>
              </div>
              <TrendingUp className="w-10 h-10 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Motoristas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden md:table-cell">Vehículo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Operacional</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {motoristas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <Bike className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium">No hay motoristas registrados</p>
                      <p className="text-sm text-gray-500 mt-1">Crea tu primer motorista para comenzar</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  motoristas.map((m) => {
                    const opConfig = OPERATIONAL_STATUS_CONFIG[m.operationalStatus] || OPERATIONAL_STATUS_CONFIG.offline
                    const OpIcon = opConfig.icon
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <span className="font-mono font-medium">{m.code}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 font-semibold text-sm">
                                {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </span>
                            </div>
                            <span className="font-medium">{m.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-gray-600">{m.phone || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="default" className="w-fit">
                            {VEHICLE_LABELS[m.vehicleType] || m.vehicleType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <button onClick={() => onToggleStatus(m)} className="cursor-pointer">
                            {m.status === 'active' ? (
                              <Badge variant="success" className="flex items-center gap-1 w-fit hover:opacity-80">
                                <UserCheck className="w-3 h-3" />
                                Activo
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="flex items-center gap-1 w-fit hover:opacity-80">
                                Inactivo
                              </Badge>
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <select
                            value={m.operationalStatus || 'offline'}
                            onChange={(e) => onChangeOperationalStatus(m, e.target.value)}
                            className="text-sm px-2 py-1 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            {Object.entries(OPERATIONAL_STATUS_CONFIG).map(([key, cfg]) => (
                              <option key={key} value={key}>{cfg.label}</option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => onEdit(m)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => onDelete(m)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

// ============================================================
// Tab 3: Arqueo (Liquidación de caja)
// ============================================================
function TabArqueo({
  motoristas, motoristaId, setMotoristaId, date, setDate,
  unsettledDeliveries, loading, onConsult,
  expectedTotal, actualAmount, setActualAmount,
  onSettle, settlingLoading,
}) {
  const diff = actualAmount !== '' ? parseFloat(actualAmount) - expectedTotal : null

  return (
    <>
      {/* Consulta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Arqueo de Caja - Motorista
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motorista</label>
              <Select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
                <option value="">Seleccionar motorista</option>
                {motoristas.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={onConsult} disabled={loading} className="w-full flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Consultar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resultados del arqueo */}
      {unsettledDeliveries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Entregas en Efectivo sin Liquidar ({unsettledDeliveries.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Orden #</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Monto Cobrado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unsettledDeliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono">{d.orderNumber || '-'}</TableCell>
                      <TableCell>{d.customerName || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">
                        S/ {(d.cashCollected || d.amount || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Resumen y cierre */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Total Esperado:</p>
                  <p className="text-2xl font-bold text-gray-900">S/ {expectedTotal.toFixed(2)}</p>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto Real Entregado (S/)</label>
                  <Input
                    type="number"
                    value={actualAmount}
                    onChange={(e) => setActualAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
                {diff !== null && (
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Diferencia:</p>
                    <p className={`text-2xl font-bold ${diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {diff === 0 ? 'Cuadra' : diff > 0 ? `+S/ ${diff.toFixed(2)}` : `-S/ ${Math.abs(diff).toFixed(2)}`}
                    </p>
                  </div>
                )}
              </div>

              <Button
                onClick={onSettle}
                disabled={settlingLoading || actualAmount === ''}
                className="w-full md:w-auto flex items-center justify-center gap-2"
              >
                {settlingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Cerrar Arqueo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mensaje cuando no hay entregas */}
      {unsettledDeliveries.length === 0 && !loading && motoristaId && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No hay entregas pendientes de liquidar</p>
            <p className="text-sm text-gray-500 mt-1">Este motorista tiene todo al día para la fecha seleccionada</p>
          </CardContent>
        </Card>
      )}
    </>
  )
}
