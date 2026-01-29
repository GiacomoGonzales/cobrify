import { useState, useEffect, useRef } from 'react'
import { Grid3x3, Plus, Users, Clock, CheckCircle, XCircle, Edit, Trash2, Loader2 } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import TableActionModal from '@/components/restaurant/TableActionModal'
import OrderItemsModal from '@/components/restaurant/OrderItemsModal'
import EditOrderItemsModal from '@/components/restaurant/EditOrderItemsModal'
import SplitBillModal from '@/components/restaurant/SplitBillModal'
import CloseTableModal from '@/components/restaurant/CloseTableModal'
import KitchenTicket from '@/components/KitchenTicket'
import { useReactToPrint } from 'react-to-print'
import { printPreBill } from '@/utils/printPreBill'
import { Capacitor } from '@capacitor/core'
import { printPreBill as printPreBillThermal, connectPrinter, getPrinterConfig, printKitchenOrder } from '@/services/thermalPrinterService'
import {
  getTables,
  getTablesStats,
  createTable,
  updateTable,
  deleteTable,
  occupyTable,
  releaseTable,
  reserveTable,
  cancelReservation,
  transferTable,
  moveOrderToTable,
} from '@/services/tableService'
import { getWaiters } from '@/services/waiterService'
import { getOrder } from '@/services/orderService'
import { getCompanySettings } from '@/services/firestoreService'
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export default function Tables() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()

  const [tables, setTables] = useState([])
  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    occupied: 0,
    reserved: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTable, setEditingTable] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Table action modal
  const [isActionModalOpen, setIsActionModalOpen] = useState(false)
  const [selectedTable, setSelectedTable] = useState(null)
  const [waiters, setWaiters] = useState([])

  // Order items modal
  const [isOrderItemsModalOpen, setIsOrderItemsModalOpen] = useState(false)
  const [isEditOrderModalOpen, setIsEditOrderModalOpen] = useState(false)
  const [isSplitBillModalOpen, setIsSplitBillModalOpen] = useState(false)
  const [isCloseTableModalOpen, setIsCloseTableModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)

  // Estado para división de cuenta por items
  const [splitData, setSplitData] = useState(null)
  const [isPrintSplitModalOpen, setIsPrintSplitModalOpen] = useState(false)

  // Tax configuration
  const [taxConfig, setTaxConfig] = useState({ igvRate: 18, igvExempt: false })

  // Estado para impresión de comanda web
  const [companySettings, setCompanySettings] = useState(null)
  const [orderToPrint, setOrderToPrint] = useState(null)
  const [webPrintLegible, setWebPrintLegible] = useState(false)
  const [compactPrint, setCompactPrint] = useState(false)
  const kitchenTicketRef = useRef()

  // Form state
  const [formData, setFormData] = useState({
    number: '',
    capacity: '4',
    zone: 'Salón Principal',
  })

  const zones = ['Salón Principal', 'Terraza', 'Salón VIP', 'Bar', 'Exterior']

  // Cargar configuración de impuestos al inicio
  useEffect(() => {
    const loadTaxConfig = async () => {
      if (!user?.uid || isDemoMode) return

      try {
        const businessId = getBusinessId()
        const businessRef = doc(db, 'businesses', businessId)
        const businessSnap = await getDoc(businessRef)

        if (businessSnap.exists()) {
          const businessData = businessSnap.data()
          // El taxConfig está dentro de emissionConfig
          if (businessData.emissionConfig?.taxConfig) {
            setTaxConfig({
              igvRate: businessData.emissionConfig.taxConfig.igvRate ?? 18,
              igvExempt: businessData.emissionConfig.taxConfig.igvExempt ?? false
            })
          }
        }
      } catch (error) {
        console.error('Error al cargar configuración de impuestos:', error)
      }
    }

    loadTaxConfig()
  }, [user, isDemoMode])

  // Cargar configuración de impresora para webPrintLegible
  useEffect(() => {
    const loadPrinterConfig = async () => {
      if (!user?.uid) return
      try {
        const printerConfigResult = await getPrinterConfig(getBusinessId())
        if (printerConfigResult.success && printerConfigResult.config) {
          setWebPrintLegible(printerConfigResult.config.webPrintLegible || false)
          setCompactPrint(printerConfigResult.config.compactPrint || false)
        }
      } catch (error) {
        console.error('Error loading printer config:', error)
      }
    }
    loadPrinterConfig()
  }, [user])

  // Cargar configuración de la empresa para comanda
  useEffect(() => {
    const loadCompanySettings = async () => {
      if (!user?.uid) return

      try {
        const result = await getCompanySettings(getBusinessId())
        if (result.success) {
          setCompanySettings(result.data)
        }
      } catch (error) {
        console.error('Error al cargar configuración:', error)
      }
    }

    loadCompanySettings()
  }, [user, getBusinessId])

  // Configurar react-to-print para comanda web
  const handlePrintWeb = useReactToPrint({
    contentRef: kitchenTicketRef,
    onAfterPrint: () => {
      toast.success('Comanda enviada a impresora')
      setOrderToPrint(null)
    },
  })

  // Listener en tiempo real para mesas
  useEffect(() => {
    if (!user?.uid) return

    setIsLoading(true)

    // Si estamos en modo demo, usar datos de demo
    if (isDemoMode && demoData?.tables) {
      const tablesData = demoData.tables
      setTables(tablesData)

      // Calcular estadísticas
      const newStats = {
        total: tablesData.length,
        available: tablesData.filter(t => t.status === 'available').length,
        occupied: tablesData.filter(t => t.status === 'occupied').length,
        reserved: tablesData.filter(t => t.status === 'reserved').length,
        maintenance: tablesData.filter(t => t.status === 'maintenance').length,
        totalCapacity: tablesData.reduce((sum, t) => sum + (t.capacity || 0), 0),
        totalAmount: tablesData
          .filter(t => t.status === 'occupied')
          .reduce((sum, t) => sum + (t.amount || 0), 0),
      }
      setStats(newStats)
      setIsLoading(false)
      return
    }

    // Modo normal - usar Firestore
    const businessId = getBusinessId()
    const tablesRef = collection(db, 'businesses', businessId, 'tables')
    const q = query(tablesRef, orderBy('number', 'asc'))

    // Listener en tiempo real - se ejecuta cada vez que hay cambios
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const tablesData = []
        snapshot.forEach((doc) => {
          tablesData.push({ id: doc.id, ...doc.data() })
        })

        setTables(tablesData)

        // Calcular estadísticas en tiempo real
        const newStats = {
          total: tablesData.length,
          available: tablesData.filter(t => t.status === 'available').length,
          occupied: tablesData.filter(t => t.status === 'occupied').length,
          reserved: tablesData.filter(t => t.status === 'reserved').length,
          maintenance: tablesData.filter(t => t.status === 'maintenance').length,
          totalCapacity: tablesData.reduce((sum, t) => sum + (t.capacity || 0), 0),
          totalAmount: tablesData
            .filter(t => t.status === 'occupied')
            .reduce((sum, t) => sum + (t.amount || 0), 0),
        }
        setStats(newStats)

        setIsLoading(false)
      },
      (error) => {
        console.error('Error en listener de mesas:', error)
        toast.error('Error al cargar mesas en tiempo real')
        setIsLoading(false)
      }
    )

    // Cleanup: desuscribirse cuando el componente se desmonte
    return () => unsubscribe()
  }, [user, isDemoMode, demoData])

  // Cargar mozos al inicio
  useEffect(() => {
    const loadWaiters = async () => {
      if (!user?.uid) return

      // Si estamos en modo demo, usar datos de demo
      if (isDemoMode && demoData?.waiters) {
        setWaiters(demoData.waiters)
        return
      }

      try {
        const result = await getWaiters(getBusinessId())
        if (result.success) {
          setWaiters(result.data || [])
        }
      } catch (error) {
        console.error('Error al cargar mozos:', error)
      }
    }

    loadWaiters()
  }, [user, isDemoMode, demoData])

  // Función auxiliar para recargar mesas manualmente si es necesario
  const loadTables = async () => {
    // Esta función ya no es necesaria con listeners en tiempo real
    // pero la mantenemos para compatibilidad con código existente
    // Los datos se actualizan automáticamente vía onSnapshot
  }

  // Listener en tiempo real para la orden seleccionada
  useEffect(() => {
    if (!user?.uid || !selectedTable?.currentOrder) return

    // Si estamos en modo demo, buscar la orden en los datos de demo
    if (isDemoMode && demoData?.orders) {
      const order = demoData.orders.find(o => o.id === selectedTable.currentOrder)
      if (order) {
        setSelectedOrder(order)
      }
      return
    }

    const businessId = getBusinessId()
    const orderRef = doc(db, 'businesses', businessId, 'orders', selectedTable.currentOrder)

    // Listener en tiempo real para la orden - se actualiza automáticamente cuando cambia
    const unsubscribe = onSnapshot(
      orderRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setSelectedOrder({ id: docSnapshot.id, ...docSnapshot.data() })
        }
      },
      (error) => {
        console.error('Error en listener de orden:', error)
      }
    )

    // Cleanup: desuscribirse cuando cambie la mesa o se desmonte
    return () => unsubscribe()
  }, [user, selectedTable?.currentOrder, isDemoMode, demoData])

  // Mantener selectedTable sincronizado con el array tables (en tiempo real)
  // Esto evita tener un listener separado que pueda causar conflictos
  useEffect(() => {
    if (!selectedTable?.id) return

    // Buscar la mesa actualizada en el array tables
    const updatedTable = tables.find(t => t.id === selectedTable.id)

    if (updatedTable) {
      // Solo actualizar si hay diferencias relevantes
      if (updatedTable.status !== selectedTable.status ||
          updatedTable.amount !== selectedTable.amount ||
          updatedTable.currentOrder !== selectedTable.currentOrder) {
        setSelectedTable(updatedTable)
      }
    }
  }, [tables, selectedTable?.id])

  // Función para recargar la mesa y orden seleccionadas (ya no necesaria, pero mantenida para compatibilidad)
  const reloadSelectedTableAndOrder = async () => {
    // Los datos se actualizan automáticamente vía listeners en tiempo real
    // Esta función se mantiene vacía para compatibilidad con código existente
  }

  const openCreateModal = () => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    setEditingTable(null)
    setFormData({
      number: '',
      capacity: '4',
      zone: 'Salón Principal',
    })
    setIsModalOpen(true)
  }

  const openEditModal = (table) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    setEditingTable(table)
    setFormData({
      number: String(table.number),
      capacity: table.capacity.toString(),
      zone: table.zone,
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.number || formData.number.trim() === '') {
      toast.error('Ingresa un nombre o número de mesa')
      return
    }

    setIsSaving(true)
    try {
      const tableData = {
        number: formData.number.trim(),
        capacity: parseInt(formData.capacity),
        zone: formData.zone,
      }

      let result
      if (editingTable) {
        result = await updateTable(getBusinessId(), editingTable.id, tableData)
      } else {
        result = await createTable(getBusinessId(), tableData)
      }

      if (result.success) {
        toast.success(
          editingTable ? 'Mesa actualizada exitosamente' : 'Mesa creada exitosamente'
        )
        setIsModalOpen(false)
        loadTables()
      } else {
        toast.error(result.error || 'Error al guardar mesa')
      }
    } catch (error) {
      console.error('Error al guardar mesa:', error)
      toast.error('Error al guardar mesa')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (tableId) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    if (!window.confirm('¿Estás seguro de eliminar esta mesa?')) return

    try {
      const result = await deleteTable(getBusinessId(), tableId)
      if (result.success) {
        toast.success('Mesa eliminada exitosamente')
        loadTables()
      } else {
        toast.error(result.error || 'Error al eliminar mesa')
      }
    } catch (error) {
      console.error('Error al eliminar mesa:', error)
      toast.error('Error al eliminar mesa')
    }
  }

  const handleTableClick = async (table) => {
    // Limpiar estado anterior primero
    setSelectedOrder(null)
    setSelectedTable(table)

    // Si la mesa está ocupada, cargar la orden y abrir modal de acciones
    if (table.status === 'occupied' && table.currentOrder) {
      try {
        // En modo demo, buscar la orden en los datos de demo
        if (isDemoMode && demoData?.orders) {
          const order = demoData.orders.find(o => o.id === table.currentOrder)
          if (order) {
            setSelectedOrder(order)
          } else {
            console.warn('Orden no encontrada en datos de demo:', table.currentOrder)
          }
        } else if (!isDemoMode) {
          // En modo normal, cargar desde Firebase
          const orderResult = await getOrder(getBusinessId(), table.currentOrder)
          if (orderResult.success) {
            setSelectedOrder(orderResult.data)
          } else {
            console.warn('Error al cargar orden:', orderResult.error)
          }
        }
      } catch (error) {
        console.error('Error al cargar orden:', error)
      }
    }

    // Abrir modal de acciones para todas las mesas
    setIsActionModalOpen(true)
  }

  const handleAddItems = () => {
    setIsOrderItemsModalOpen(true)
  }

  const handleEditOrder = () => {
    setIsEditOrderModalOpen(true)
  }

  const handleSplitBill = () => {
    setIsSplitBillModalOpen(true)
  }

  const handleConfirmSplit = async (splitDataResult) => {
    console.log('Split data:', splitDataResult)

    if (splitDataResult.method === 'items') {
      // Para división por items, guardar datos y mostrar opciones de impresión
      setSplitData(splitDataResult)
      setIsSplitBillModalOpen(false)
      setIsPrintSplitModalOpen(true)
      toast.success(`Cuenta dividida entre ${splitDataResult.numberOfPeople} personas. Selecciona qué precuenta imprimir.`)
    } else {
      // Para otros métodos, solo mostrar mensaje
      toast.success(`Cuenta dividida entre ${splitDataResult.numberOfPeople} personas`)
    }
  }

  const handleTransferTable = async (tableId, transferData) => {
    // Verificar si está en modo demo
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      setIsActionModalOpen(false)
      return
    }

    try {
      const result = await transferTable(getBusinessId(), tableId, transferData)
      if (result.success) {
        toast.success(`Mesa transferida a ${transferData.waiterName}`)
        loadTables()
        setIsActionModalOpen(false)
      } else {
        toast.error('Error al transferir mesa: ' + result.error)
      }
    } catch (error) {
      console.error('Error al transferir mesa:', error)
      toast.error('Error al transferir mesa')
    }
  }

  const handleMoveTable = async (sourceTableId, destinationTableId, destinationTableNumber) => {
    // Verificar si está en modo demo
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      setIsActionModalOpen(false)
      return
    }

    try {
      const result = await moveOrderToTable(getBusinessId(), sourceTableId, destinationTableId)
      if (result.success) {
        toast.success(`Orden movida a Mesa ${destinationTableNumber}`)
        loadTables()
        setIsActionModalOpen(false)
        setSelectedTable(null)
        setSelectedOrder(null)
      } else {
        toast.error('Error al mover orden: ' + result.error)
      }
    } catch (error) {
      console.error('Error al mover orden:', error)
      toast.error('Error al mover orden')
    }
  }

  const handlePrintPreBill = async (itemFilter = null, personLabel = null) => {
    if (!selectedTable || !selectedOrder) {
      toast.error('No se puede imprimir: datos incompletos')
      return
    }

    try {
      // Obtener información del negocio desde Firestore
      const businessId = getBusinessId()
      const businessRef = doc(db, 'businesses', businessId)
      const businessSnap = await getDoc(businessRef)

      let businessInfo = {
        tradeName: 'RESTAURANTE',
        address: '',
        phone: '',
        logoUrl: ''
      }

      let taxConfig = {
        igvRate: 18,
        igvExempt: false
      }
      let recargoConsumoConfig = {
        enabled: false,
        rate: 10
      }

      if (businessSnap.exists()) {
        const businessData = businessSnap.data()
        businessInfo = {
          tradeName: businessData.tradeName || businessData.name || 'RESTAURANTE',
          address: businessData.address || '',
          phone: businessData.phone || '',
          logoUrl: businessData.logoUrl || ''
        }

        // Obtener configuración de impuestos
        // El taxConfig está dentro de emissionConfig
        if (businessData.emissionConfig?.taxConfig) {
          taxConfig = {
            igvRate: businessData.emissionConfig.taxConfig.igvRate ?? 18,
            igvExempt: businessData.emissionConfig.taxConfig.igvExempt ?? false
          }
        }

        // Obtener configuración de Recargo al Consumo
        if (businessData.restaurantConfig) {
          recargoConsumoConfig = {
            enabled: businessData.restaurantConfig.recargoConsumoEnabled ?? false,
            rate: businessData.restaurantConfig.recargoConsumoRate ?? 10
          }
        }

        console.log('📄 Datos del negocio para precuenta:', businessInfo)
        console.log('💰 Configuración de impuestos:', taxConfig)
        console.log('💵 Configuración de RC:', recargoConsumoConfig)
      }

      const isNative = Capacitor.isNativePlatform()

      // Si es móvil, intentar imprimir en impresora térmica
      // Nota: La impresión térmica parcial no está implementada aún
      if (isNative && !itemFilter) {
        try {
          // Obtener configuración de impresora
          const printerConfigResult = await getPrinterConfig(businessId)
          const webPrintLegible = printerConfigResult.config?.webPrintLegible || false

          if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
            // Reconectar a la impresora
            await connectPrinter(printerConfigResult.config.address)

            // Imprimir en impresora térmica
            const result = await printPreBillThermal(selectedOrder, selectedTable, businessInfo, taxConfig, printerConfigResult.config?.paperWidth || 58, recargoConsumoConfig)

            if (result.success) {
              toast.success('Precuenta impresa en ticketera')
              return
            } else {
              toast.error('Error al imprimir en ticketera: ' + result.error)
              toast.info('Usando impresión estándar...')
            }
          }
        } catch (error) {
          console.error('Error al imprimir en ticketera:', error)
          toast.info('Usando impresión estándar...')
        }
      }

      // Fallback: impresión estándar (web o si falla la térmica)
      const printerConfigResult = await getPrinterConfig(businessId)
      console.log('🖨️ Tables - Configuración de impresora:', printerConfigResult)
      const webPrintLegible = printerConfigResult.config?.webPrintLegible || false
      console.log('🖨️ Tables - webPrintLegible:', webPrintLegible)
      const paperWidth = printerConfigResult.config?.paperWidth || 80
      const compactPrintValue = printerConfigResult.config?.compactPrint || false
      printPreBill(selectedTable, selectedOrder, businessInfo, taxConfig, paperWidth, webPrintLegible, itemFilter, personLabel, recargoConsumoConfig, compactPrintValue)
      toast.success('Imprimiendo precuenta...')
    } catch (error) {
      console.error('Error al imprimir precuenta:', error)
      toast.error('Error al imprimir precuenta')
    }
  }

  // Imprimir precuenta de una persona específica (división por items)
  const handlePrintPersonPreBill = async (personData, totalPersons) => {
    const personLabel = `Persona ${personData.personNumber} de ${totalPersons}`
    await handlePrintPreBill(personData.items, personLabel)
  }

  const handlePrintKitchenTicket = async () => {
    if (!selectedTable || !selectedOrder) {
      toast.error('No se puede imprimir: datos incompletos')
      return
    }

    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    const isNative = Capacitor.isNativePlatform()

    // Si es móvil, intentar imprimir en impresora térmica
    if (isNative) {
      try {
        const businessId = getBusinessId()
        // Obtener configuración de impresora
        const printerConfigResult = await getPrinterConfig(businessId)

        if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
          // Reconectar a la impresora
          const connectResult = await connectPrinter(printerConfigResult.config.address)

          if (!connectResult.success) {
            toast.error('No se pudo conectar a la impresora: ' + connectResult.error)
            toast.info('Usando impresión estándar...')
          } else {
            // Imprimir comanda en impresora térmica
            const result = await printKitchenOrder(
              selectedOrder,
              selectedTable,
              printerConfigResult.config.paperWidth || 58
            )

            if (result.success) {
              toast.success('Comanda impresa en ticketera')
              return
            } else {
              toast.error('Error al imprimir en ticketera: ' + result.error)
              toast.info('Usando impresión estándar...')
            }
          }
        }
      } catch (error) {
        console.error('Error al imprimir comanda:', error)
        toast.info('Usando impresión estándar...')
      }
    }

    // Fallback: impresión estándar (web o si falla la térmica)
    setOrderToPrint(selectedOrder)
    // Esperar a que se renderice el ticket antes de imprimir
    setTimeout(() => {
      handlePrintWeb()
    }, 300)
  }

  const handleOccupyTable = async (tableId, occupyData) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      const result = await occupyTable(getBusinessId(), tableId, occupyData)
      if (result.success) {
        toast.success('Mesa ocupada exitosamente')
        loadTables()
      } else {
        toast.error(result.error || 'Error al ocupar mesa')
      }
    } catch (error) {
      console.error('Error al ocupar mesa:', error)
      toast.error('Error al ocupar mesa')
    }
  }

  const handleReleaseTable = async (tableId) => {
    // Cerrar modal de acciones y abrir modal de cierre con comprobante
    setIsActionModalOpen(false)
    setIsCloseTableModalOpen(true)
  }

  const handleConfirmCloseTable = async (closeData) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    const tableIdToClose = selectedTable.id

    // Cerrar modales y limpiar selección PRIMERO
    setIsCloseTableModalOpen(false)
    setIsActionModalOpen(false)
    setSelectedTable(null)
    setSelectedOrder(null)

    // ACTUALIZACIÓN OPTIMISTA: Actualizar la UI inmediatamente sin esperar a Firestore
    setTables(prevTables => prevTables.map(t =>
      t.id === tableIdToClose
        ? { ...t, status: 'available', currentOrder: null, waiter: null, waiterId: null, amount: 0 }
        : t
    ))

    // Actualizar stats inmediatamente
    setStats(prevStats => ({
      ...prevStats,
      available: prevStats.available + 1,
      occupied: prevStats.occupied - 1,
    }))

    toast.success('Mesa cerrada exitosamente')

    // Ejecutar la operación en Firestore en background
    releaseTable(getBusinessId(), tableIdToClose).catch(error => {
      console.error('Error al cerrar mesa en Firestore:', error)
      // Si falla, el listener de Firestore corregirá el estado
    })
  }

  const handleReserveTable = async (tableId, reservationData) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      const result = await reserveTable(getBusinessId(), tableId, reservationData)
      if (result.success) {
        toast.success('Mesa reservada exitosamente')
        loadTables()
      } else {
        toast.error(result.error || 'Error al reservar mesa')
      }
    } catch (error) {
      console.error('Error al reservar mesa:', error)
      toast.error('Error al reservar mesa')
    }
  }

  const handleCancelReservation = async (tableId) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      const result = await cancelReservation(getBusinessId(), tableId)
      if (result.success) {
        toast.success('Reserva cancelada exitosamente')
        loadTables()
      } else {
        toast.error(result.error || 'Error al cancelar reserva')
      }
    } catch (error) {
      console.error('Error al cancelar reserva:', error)
      toast.error('Error al cancelar reserva')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 border-green-300 hover:border-green-400'
      case 'occupied':
        return 'bg-red-100 border-red-300 hover:border-red-400'
      case 'reserved':
        return 'bg-yellow-100 border-yellow-300 hover:border-yellow-400'
      case 'maintenance':
        return 'bg-gray-100 border-gray-300 hover:border-gray-400'
      default:
        return 'bg-gray-100 border-gray-300'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'available':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'occupied':
        return <XCircle className="w-5 h-5 text-red-600" />
      case 'reserved':
        return <Clock className="w-5 h-5 text-yellow-600" />
      default:
        return null
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'available':
        return 'Disponible'
      case 'occupied':
        return 'Ocupada'
      case 'reserved':
        return 'Reservada'
      case 'maintenance':
        return 'Mantenimiento'
      default:
        return status
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Grid3x3 className="w-7 h-7" />
            Gestión de Mesas
          </h1>
          <p className="text-gray-600 mt-1">Administra las mesas de tu restaurante</p>
        </div>
        <Button onClick={openCreateModal} className="flex items-center gap-2 w-full md:w-auto">
          <Plus className="w-4 h-4" />
          Nueva Mesa
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Mesas</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
              </div>
              <Grid3x3 className="w-10 h-10 text-gray-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Disponibles</p>
                <p className="text-2xl font-bold text-green-600 mt-2">{stats.available}</p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ocupadas</p>
                <p className="text-2xl font-bold text-red-600 mt-2">{stats.occupied}</p>
              </div>
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Reservadas</p>
                <p className="text-2xl font-bold text-yellow-600 mt-2">{stats.reserved}</p>
              </div>
              <Clock className="w-10 h-10 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vista de Mesas por Zona */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : tables.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Grid3x3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay mesas registradas
              </h3>
              <p className="text-gray-600 mb-4">
                Crea tu primera mesa para comenzar a gestionar tu restaurante
              </p>
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Primera Mesa
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {zones.map((zone) => {
            const zoneTables = tables.filter((t) => t.zone === zone)
            if (zoneTables.length === 0) return null

            return (
              <Card key={zone}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{zone}</CardTitle>
                    <span className="text-sm text-gray-500">
                      {zoneTables.length} {zoneTables.length === 1 ? 'mesa' : 'mesas'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {zoneTables.map((table) => (
                      <div key={table.id} className="relative group">
                        <div
                          onClick={() => handleTableClick(table)}
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all min-h-[180px] flex flex-col ${getStatusColor(
                            table.status
                          )}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl font-bold text-gray-900">
                                {table.number}
                              </span>
                              {getStatusIcon(table.status)}
                            </div>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Users className="w-4 h-4" />
                              <span>{table.capacity}</span>
                            </div>
                          </div>

                          <Badge
                            variant={
                              table.status === 'available'
                                ? 'success'
                                : table.status === 'occupied'
                                ? 'danger'
                                : 'warning'
                            }
                            className="mb-2 w-full justify-center"
                          >
                            {getStatusText(table.status)}
                          </Badge>

                          {/* Mostrar nombre del mozo de forma prominente cuando la mesa está ocupada */}
                          {table.status === 'occupied' && table.waiter && (
                            <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-center mb-2">
                              <span className="text-xs font-semibold">👤 {table.waiter}</span>
                            </div>
                          )}

                          {table.status === 'occupied' && (
                            <div className="space-y-1 text-xs text-gray-700 mt-2 pt-2 border-t border-gray-300">
                              {table.startTime && (
                                <div className="flex justify-between">
                                  <span>Inicio:</span>
                                  <span className="font-medium">{formatTime(table.startTime)}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span>Consumo:</span>
                                <span className="font-bold text-gray-900">
                                  S/ {(table.amount || 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}

                          {table.status === 'reserved' && table.reservedFor && (
                            <div className="text-xs text-gray-700 mt-2 pt-2 border-t border-gray-300">
                              <div className="flex justify-between">
                                <span>Reserva:</span>
                                <span className="font-medium">{table.reservedFor}</span>
                              </div>
                              {table.reservedBy && (
                                <div className="flex justify-between mt-1">
                                  <span>Cliente:</span>
                                  <span className="font-medium">{table.reservedBy}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Spacer for available tables to maintain consistent height */}
                          {table.status === 'available' && (
                            <div className="mt-2 pt-2 border-t border-transparent">
                              <div className="h-[60px]"></div>
                            </div>
                          )}
                        </div>

                        {/* Botones de edición/eliminación */}
                        {table.status === 'available' && (
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation()
                                openEditModal(table)
                              }}
                              className="bg-white shadow-md"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(table.id)
                              }}
                              className="bg-white shadow-md text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTable ? 'Editar Mesa' : 'Nueva Mesa'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre o Número de Mesa *
            </label>
            <Input
              type="text"
              value={formData.number}
              onChange={(e) => setFormData({ ...formData, number: e.target.value })}
              placeholder="Ej: 1, Mesa VIP, Terraza A"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Capacidad *
            </label>
            <Input
              type="number"
              min="1"
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
              placeholder="Ej: 4"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zona *
            </label>
            <Select
              value={formData.zone}
              onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
              required
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>{editingTable ? 'Actualizar' : 'Crear'} Mesa</>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de Acciones de Mesa */}
      <TableActionModal
        isOpen={isActionModalOpen}
        onClose={() => {
          setIsActionModalOpen(false)
          setSelectedTable(null)
        }}
        table={selectedTable}
        waiters={waiters}
        availableTables={tables.filter(t => t.status === 'available')}
        onOccupy={handleOccupyTable}
        onRelease={handleReleaseTable}
        onReserve={handleReserveTable}
        onCancelReservation={handleCancelReservation}
        onAddItems={handleAddItems}
        onEditOrder={handleEditOrder}
        onSplitBill={handleSplitBill}
        onTransferTable={handleTransferTable}
        onMoveTable={handleMoveTable}
        onPrintPreBill={handlePrintPreBill}
        onPrintKitchenTicket={handlePrintKitchenTicket}
      />

      {/* Modal para agregar items a la orden */}
      <OrderItemsModal
        isOpen={isOrderItemsModalOpen}
        onClose={() => {
          setIsOrderItemsModalOpen(false)
          // Reabrir el modal de acciones después de cerrar
          setIsActionModalOpen(true)
        }}
        table={selectedTable}
        order={selectedOrder}
        onSuccess={reloadSelectedTableAndOrder}
      />

      {/* Modal para editar items de la orden */}
      <EditOrderItemsModal
        isOpen={isEditOrderModalOpen}
        onClose={() => {
          setIsEditOrderModalOpen(false)
          // Reabrir el modal de acciones después de cerrar
          setIsActionModalOpen(true)
        }}
        table={selectedTable}
        order={selectedOrder}
        onSuccess={reloadSelectedTableAndOrder}
      />

      {/* Modal para dividir la cuenta */}
      <SplitBillModal
        isOpen={isSplitBillModalOpen}
        onClose={() => {
          setIsSplitBillModalOpen(false)
          // Reabrir el modal de acciones después de cerrar
          setIsActionModalOpen(true)
        }}
        table={selectedTable}
        order={selectedOrder}
        onConfirm={handleConfirmSplit}
      />

      {/* Modal para cerrar mesa y generar comprobante */}
      <CloseTableModal
        isOpen={isCloseTableModalOpen}
        onClose={() => {
          setIsCloseTableModalOpen(false)
        }}
        table={selectedTable}
        order={selectedOrder}
        onConfirm={handleConfirmCloseTable}
        taxConfig={taxConfig}
      />

      {/* Modal para imprimir precuenta dividida por items */}
      <Modal
        isOpen={isPrintSplitModalOpen}
        onClose={() => {
          setIsPrintSplitModalOpen(false)
          setSplitData(null)
          setIsActionModalOpen(true)
        }}
        title={
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span>Imprimir Precuentas - Mesa {selectedTable?.number}</span>
          </div>
        }
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Selecciona qué precuenta deseas imprimir:
          </p>

          {splitData?.persons?.map((person) => (
            <button
              key={person.personNumber}
              onClick={() => handlePrintPersonPreBill(person, splitData.numberOfPeople)}
              className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold text-lg">
                    {person.personNumber}
                  </span>
                  <div>
                    <div className="font-medium text-gray-900">
                      Persona {person.personNumber}
                    </div>
                    <div className="text-sm text-gray-500">
                      {person.items.length} {person.items.length === 1 ? 'item' : 'items'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">
                    S/ {person.total.toFixed(2)}
                  </div>
                </div>
              </div>
            </button>
          ))}

          <div className="border-t pt-4 mt-4">
            <button
              onClick={() => handlePrintPreBill()}
              className="w-full p-3 border-2 border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors text-center"
            >
              <span className="text-gray-700 font-medium">
                Imprimir Precuenta Completa (S/ {splitData?.total?.toFixed(2)})
              </span>
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsPrintSplitModalOpen(false)
                setSplitData(null)
                setIsActionModalOpen(true)
              }}
              className="flex-1"
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Comanda para imprimir (oculta) */}
      {orderToPrint && (
        <div style={{ display: 'none' }}>
          <KitchenTicket
            ref={kitchenTicketRef}
            order={orderToPrint}
            companySettings={companySettings}
            webPrintLegible={webPrintLegible}
            compactPrint={compactPrint}
          />
        </div>
      )}
    </div>
  )
}
