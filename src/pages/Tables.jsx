import { useState, useEffect, useRef } from 'react'
import { Grid3x3, Plus, Users, Clock, CheckCircle, XCircle, Edit, Trash2, Loader2, Receipt, Wine } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
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
import SplitTableModal from '@/components/restaurant/SplitTableModal'
import PreBillPreviewModal from '@/components/restaurant/PreBillPreviewModal'
import IndividualPaymentModal from '@/components/restaurant/IndividualPaymentModal'
import CloseTableModal from '@/components/restaurant/CloseTableModal'
import KitchenTicket from '@/components/KitchenTicket'
import { useReactToPrint } from 'react-to-print'
import { printPreBill, printAllSplitPreBills } from '@/utils/printPreBill'
import { Capacitor } from '@capacitor/core'
import { printPreBill as printPreBillThermal, connectPrinter, getPrinterConfig, printKitchenOrder, printToAllStations } from '@/services/thermalPrinterService'
import {
  getTables,
  getTablesStats,
  createTable,
  createBarTab,
  updateTable,
  deleteTable,
  occupyTable,
  releaseTable,
  reserveTable,
  cancelReservation,
  transferTable,
  moveOrderToTable,
  splitTableItems,
  mergeTables,
  unmergeTable,
  markPreBillPrinted,
} from '@/services/tableService'
import { getWaiters } from '@/services/waiterService'
import { getOrder, updateOrder, updateItemStatus } from '@/services/orderService'
import { getCompanySettings, getProductCategories, savePrecuentaSnapshot } from '@/services/firestoreService'
import { getActiveBranches } from '@/services/branchService'
import { useLocationAccess } from '@/utils/locationAccess'
import { collection, onSnapshot, query, orderBy, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export default function Tables() {
  const { user, getBusinessId, isDemoMode, demoData, userPermissions, filterBranchesByAccess, allowedBranches, hasMainBranchAccess } = useAppContext()
  // Filtro de seguridad por sede (respeta las sucursales habilitadas del usuario secundario)
  const canAccessTable = useLocationAccess()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [tables, setTables] = useState([])
  // Sucursales (sedes): para filtrar y crear mesas por sede
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState(null) // null = Sucursal Principal
  const [branchesLoaded, setBranchesLoaded] = useState(false)
  // El spinner de carga sólo debe verse en la PRIMERA carga. El listener se
  // re-suscribe cuando branchesLoaded pasa a true o cambia la sede; sin este
  // ref, cada re-suscripción reseteaba isLoading=true y la página "parpadeaba".
  const hasLoadedOnceRef = useRef(false)
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
  const [isSplitTableModalOpen, setIsSplitTableModalOpen] = useState(false)
  const [isIndividualPaymentModalOpen, setIsIndividualPaymentModalOpen] = useState(false)
  const [isPreBillPreviewOpen, setIsPreBillPreviewOpen] = useState(false)
  // Contexto del preview de precuenta: a qué modal volver al cerrar
  const [preBillPreviewReturnTo, setPreBillPreviewReturnTo] = useState(null) // 'action' | 'split' | null
  const [selectedOrder, setSelectedOrder] = useState(null)

  // Estado para división de cuenta por items
  const [splitData, setSplitData] = useState(null)
  const [isPrintSplitModalOpen, setIsPrintSplitModalOpen] = useState(false)

  // Tax configuration
  const [taxConfig, setTaxConfig] = useState({ igvRate: 18, igvExempt: false })

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, tableId: null, tableNumber: '' })
  const [deleteInput, setDeleteInput] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const isOwner = !userPermissions?.ownerId

  // Estado para impresión de comanda web
  const [companySettings, setCompanySettings] = useState(null)
  const [orderToPrint, setOrderToPrint] = useState(null)
  const [webPrintLegible, setWebPrintLegible] = useState(false)
  const [ticketFontSize, setTicketFontSize] = useState('small')
  const [compactPrint, setCompactPrint] = useState(false)
  const [ultraCompactKitchen, setUltraCompactKitchen] = useState(false)
  const [simplePrint, setSimplePrint] = useState(false)
  const [a4SheetPrint, setA4SheetPrint] = useState(false)
  const kitchenTicketRef = useRef()
  // Bandera: la auto-impresión de comanda al agregar items está en curso. Evita que el
  // botón manual "Imprimir Comanda" mande la MISMA comanda otra vez (ticket duplicado).
  const kitchenAutoPrintInProgressRef = useRef(false)
  const [kitchenStations, setKitchenStations] = useState([])
  const [enableKitchenStations, setEnableKitchenStations] = useState(false)
  // Al imprimir comanda desde PC/navegador: imprimir todo junto (no separar por estación).
  const [combineStationsOnWebPrint, setCombineStationsOnWebPrint] = useState(false)
  // Config restaurante para usuarios secundarios (solo aplican si !isOwner)
  const [skipWaiterForSecondary, setSkipWaiterForSecondary] = useState(false)
  const [requireReceiptForSecondary, setRequireReceiptForSecondary] = useState(false)
  const [categoryMap, setCategoryMap] = useState({})

  // Form state
  const [formData, setFormData] = useState({
    number: '',
    capacity: '4',
    zone: 'Salón Principal',
    branchId: null,
  })

  // 'Barra' agrupa las cuentas de barra (creadas al vuelo, no son mesas fijas);
  // no se ofrece al crear una mesa normal.
  const zones = ['Salón Principal', 'Terraza', 'Salón VIP', 'Bar', 'Exterior']
  const zonesWithBar = [...zones, 'Barra']

  // Cuenta de barra: se crea con el nombre del cliente y se abre al toque
  const [showBarTabModal, setShowBarTabModal] = useState(false)
  const [barTabName, setBarTabName] = useState('')
  const [isCreatingBarTab, setIsCreatingBarTab] = useState(false)

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
          setTicketFontSize(printerConfigResult.config.ticketFontSize || (printerConfigResult.config.webPrintLegible ? 'medium' : 'small'))
          setCompactPrint(printerConfigResult.config.compactPrint || false)
          setUltraCompactKitchen(printerConfigResult.config.ultraCompactKitchen || false)
          setSimplePrint(printerConfigResult.config.simplePrint || false)
          setA4SheetPrint(printerConfigResult.config.a4SheetPrint || false)
        }
      } catch (error) {
        console.error('Error loading printer config:', error)
      }
    }
    loadPrinterConfig()
  }, [user])

  // Cargar configuración de estaciones de cocina
  useEffect(() => {
    if (!user?.uid || isDemoMode) return

    const businessRef = doc(db, 'businesses', getBusinessId())
    const unsubscribe = onSnapshot(
      businessRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const config = docSnap.data().restaurantConfig || {}
          setKitchenStations(config.kitchenStations || [])
          setEnableKitchenStations(config.enableKitchenStations || false)
          setCombineStationsOnWebPrint(config.combineStationsOnWebPrint || false)
          setSkipWaiterForSecondary(config.skipWaiterForSecondary || false)
          setRequireReceiptForSecondary(config.requireReceiptForSecondary || false)
        }
      },
      (error) => {
        console.error('Error al cargar estaciones de cocina:', error)
      }
    )

    return () => unsubscribe()
    // Nota: getBusinessId NO va en deps — useAppContext la devuelve nueva en cada
    // render y eso hacia que el listener se resuscribiera en loop (parpadeo visible).
    // El uid sale de `user`, que sí es estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isDemoMode])

  // Cargar categorías para mapeo ID → nombre (necesario para matching de estaciones)
  useEffect(() => {
    if (!user?.uid || isDemoMode) return
    const loadCategories = async () => {
      try {
        const result = await getProductCategories(getBusinessId())
        if (result.success && result.data) {
          const catMap = {}
          result.data.forEach(cat => { catMap[cat.id] = cat.name })
          setCategoryMap(catMap)
        }
      } catch (error) {
        console.error('Error al cargar categorías:', error)
      }
    }
    loadCategories()
    // Nota: getBusinessId NO va en deps — useAppContext la devuelve nueva en cada
    // render y eso hacia que el listener se resuscribiera en loop (parpadeo visible).
    // El uid sale de `user`, que sí es estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isDemoMode])

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
    // Ver nota arriba sobre getBusinessId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Configurar react-to-print para comanda web
  const handlePrintWeb = useReactToPrint({
    contentRef: kitchenTicketRef,
    onAfterPrint: () => {
      toast.success('Comanda enviada a impresora')
      setOrderToPrint(null)
    },
  })

  // Cargar sucursales (sedes) habilitadas para el usuario y fijar la sede por defecto
  useEffect(() => {
    if (!user?.uid) return
    if (isDemoMode) { setBranchesLoaded(true); return }
    const loadBranches = async () => {
      try {
        const result = await getActiveBranches(getBusinessId())
        if (result.success) {
          const list = filterBranchesByAccess ? filterBranchesByAccess(result.data || []) : (result.data || [])
          setBranches(list)
          // Por defecto: Sucursal Principal si el usuario tiene acceso; si está
          // restringido a sucursales, fijar la primera permitida (no podrá ver otras).
          if (!hasMainBranchAccess && list.length > 0) {
            setSelectedBranchId(list[0].id)
          }
        }
      } catch (error) {
        console.error('Error al cargar sucursales:', error)
      } finally {
        setBranchesLoaded(true)
      }
    }
    loadBranches()
  }, [user, isDemoMode, allowedBranches])

  // Listener en tiempo real para mesas
  useEffect(() => {
    if (!user?.uid) return

    // Sólo mostrar el spinner la primera vez. En re-suscripciones (branchesLoaded
    // o cambio de sede) se conservan los datos actuales y se actualizan en silencio.
    if (!hasLoadedOnceRef.current) setIsLoading(true)

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
      hasLoadedOnceRef.current = true
      return
    }

    // Solo los usuarios restringidos a sucursales esperan a que carguen las sedes (para no
    // mostrar un instante mesas de otra sede). La mayoría (con acceso a la Principal, incluidos
    // los negocios sin sucursales) carga sin esperar; canAccessTable es la red de seguridad.
    if (!hasMainBranchAccess && !branchesLoaded) return

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
          const t = { id: doc.id, ...doc.data() }
          // Filtrar por la sede seleccionada (sin branchId = Sucursal Principal)
          if ((t.branchId || null) !== (selectedBranchId || null)) return
          // Seguridad: respetar las sedes habilitadas del usuario secundario
          if (!canAccessTable(t)) return
          tablesData.push(t)
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
        hasLoadedOnceRef.current = true
      },
      (error) => {
        console.error('Error en listener de mesas:', error)
        toast.error('Error al cargar mesas en tiempo real')
        setIsLoading(false)
        hasLoadedOnceRef.current = true
      }
    )

    // Cleanup: desuscribirse cuando el componente se desmonte
    return () => unsubscribe()
  }, [user, isDemoMode, demoData, selectedBranchId, branchesLoaded, allowedBranches])

  // La ocupación de mesas desde carta digital se maneja directamente en CatalogoPublico.jsx
  // al momento de crear la orden. No se necesita listener adicional aquí.

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
      branchId: selectedBranchId, // crear en la sede actualmente seleccionada
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
      branchId: table.branchId || null,
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
        branchId: formData.branchId ?? null, // sede a la que pertenece la mesa (null = Principal)
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

  const handleDeleteRequest = (table) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setDeleteConfirm({ isOpen: true, tableId: table.id, tableNumber: String(table.number) })
    setDeleteInput('')
  }

  const handleDeleteConfirm = async () => {
    if (deleteInput !== deleteConfirm.tableNumber) return

    setIsDeleting(true)
    try {
      const result = await deleteTable(getBusinessId(), deleteConfirm.tableId)
      if (result.success) {
        toast.success('Mesa eliminada exitosamente')
        loadTables()
      } else {
        toast.error(result.error || 'Error al eliminar mesa')
      }
    } catch (error) {
      console.error('Error al eliminar mesa:', error)
      toast.error('Error al eliminar mesa')
    } finally {
      setIsDeleting(false)
      setDeleteConfirm({ isOpen: false, tableId: null, tableNumber: '' })
      setDeleteInput('')
    }
  }

  // Crear una cuenta de barra y abrirla de una: el cliente ya está pidiendo.
  const handleCreateBarTab = async () => {
    const name = barTabName.trim()
    if (!name) {
      toast.error('Ingresa el nombre del cliente')
      return
    }
    if (isDemoMode) {
      toast.info('Función no disponible en modo demo')
      return
    }
    setIsCreatingBarTab(true)
    try {
      const result = await createBarTab(getBusinessId(), {
        name,
        branchId: selectedBranchId || null,
      })
      if (!result.success) {
        toast.error(result.error || 'No se pudo crear la cuenta de barra')
        return
      }
      setShowBarTabModal(false)
      setBarTabName('')
      await loadTables()
      // Abrir directo el modal de productos para tomar el pedido
      handleTableClick(result.table)
    } catch (error) {
      console.error('Error al crear cuenta de barra:', error)
      toast.error('No se pudo crear la cuenta de barra')
    } finally {
      setIsCreatingBarTab(false)
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

  // Abre la vista previa de la precuenta. El descuento se aplica desde aquí.
  // returnTo indica a qué modal regresar al cerrar el preview ('action' o 'split').
  const openPreBillPreview = (returnTo = 'action') => {
    if (!selectedOrder) {
      toast.error('No hay orden activa para imprimir precuenta')
      return
    }
    if (returnTo === 'action') setIsActionModalOpen(false)
    if (returnTo === 'split') setIsPrintSplitModalOpen(false)
    setPreBillPreviewReturnTo(returnTo)
    setIsPreBillPreviewOpen(true)
  }

  const closePreBillPreview = () => {
    const returnTo = preBillPreviewReturnTo
    setIsPreBillPreviewOpen(false)
    setPreBillPreviewReturnTo(null)
    if (returnTo === 'action') setIsActionModalOpen(true)
    if (returnTo === 'split') setIsPrintSplitModalOpen(true)
  }

  // Confirmar impresión desde el preview: cierra el preview y dispara la impresión real.
  // El descuento ya fue persistido por el modal antes de llamar a esta función.
  // handlePrintPreBill lee la orden fresca de Firestore, así que captura el descuento recién aplicado.
  const handleConfirmPreBillPrint = async () => {
    closePreBillPreview()
    await handlePrintPreBill()
  }

  // Marcar/desmarcar un ítem como servido al cliente
  const handleToggleItemServed = async (itemId, currentlyServed) => {
    if (!selectedOrder?.id || !itemId) return
    const newStatus = currentlyServed ? 'ready' : 'delivered'
    try {
      const result = await updateItemStatus(getBusinessId(), selectedOrder.id, itemId, newStatus)
      if (!result.success) {
        toast.error(result.error || 'No se pudo actualizar el ítem')
      }
      // No hace falta refrescar manualmente: el onSnapshot de la orden actualiza el estado
    } catch (err) {
      console.error('Error toggling served:', err)
      toast.error('Error al marcar como servido')
    }
  }

  // Marcar TODOS los ítems pendientes como servidos
  const handleMarkAllServed = async () => {
    if (!selectedOrder?.id || !selectedOrder.items?.length) return
    const pending = selectedOrder.items.filter(i => i.status !== 'delivered')
    if (pending.length === 0) return
    try {
      await Promise.all(
        pending.map(item =>
          updateItemStatus(getBusinessId(), selectedOrder.id, item.itemId, 'delivered')
        )
      )
      toast.success(`${pending.length} ítem(s) marcado(s) como servidos`)
    } catch (err) {
      console.error('Error marking all served:', err)
      toast.error('Error al marcar todos como servidos')
    }
  }

  const handleSplitBill = () => {
    setIsSplitBillModalOpen(true)
  }

  const handleConfirmSplit = async (splitDataResult) => {
    console.log('Split data:', splitDataResult)

    if (splitDataResult.method === 'items') {
      // División por items: ya viene con persons y sus items asignados
      setSplitData(splitDataResult)
    } else if (splitDataResult.method === 'equal') {
      // División igual: cada persona ve todos los items pero paga su parte
      const amountPerPerson = splitDataResult.total / splitDataResult.numberOfPeople
      const persons = Array.from({ length: splitDataResult.numberOfPeople }, (_, i) => ({
        personNumber: i + 1,
        items: selectedOrder?.items || [],
        total: amountPerPerson
      }))
      setSplitData({ ...splitDataResult, persons })
    } else if (splitDataResult.method === 'custom') {
      // División personalizada: cada persona ve todos los items pero paga su monto
      const persons = splitDataResult.amounts.map((amount, i) => ({
        personNumber: i + 1,
        items: selectedOrder?.items || [],
        total: amount
      }))
      setSplitData({ ...splitDataResult, persons })
    }

    setIsSplitBillModalOpen(false)
    setIsPrintSplitModalOpen(true)
    toast.success(`Cuenta dividida entre ${splitDataResult.numberOfPeople} personas. Selecciona qué precuenta imprimir.`)
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

  const handleSplitTable = () => {
    setIsActionModalOpen(false)
    setIsSplitTableModalOpen(true)
  }

  const handleMergeTables = async (primaryTableId, sourceTableIds, waiterData = null) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      setIsActionModalOpen(false)
      return
    }

    try {
      const options = waiterData ? { waiterData } : {}
      const result = await mergeTables(getBusinessId(), primaryTableId, sourceTableIds, options)
      if (result.success) {
        const total = result.data?.totalTables || (sourceTableIds.length + 1)
        toast.success(`Grupo creado con ${total} mesas`)
        loadTables()
        setIsActionModalOpen(false)
        setSelectedTable(null)
        setSelectedOrder(null)
      } else {
        toast.error('Error al fusionar mesas: ' + result.error)
      }
    } catch (error) {
      console.error('Error al fusionar mesas:', error)
      toast.error('Error al fusionar mesas')
    }
  }

  const handleOpenPrimary = async (groupId) => {
    // groupId es el id de la mesa principal del grupo
    const primary = tables.find(t => t.id === groupId)
    if (!primary) {
      toast.error('No se encontró la mesa principal del grupo')
      return
    }
    // Reutilizamos handleTableClick para que cargue la orden y actualice el modal
    await handleTableClick(primary)
  }

  const handleUnmergeTable = async (tableId) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      setIsActionModalOpen(false)
      return
    }

    try {
      const result = await unmergeTable(getBusinessId(), tableId)
      if (result.success) {
        toast.success(result.data?.dissolved ? 'Grupo disuelto' : 'Mesa separada del grupo')
        loadTables()
        setIsActionModalOpen(false)
        setSelectedTable(null)
        setSelectedOrder(null)
      } else {
        toast.error('Error al separar mesa: ' + result.error)
      }
    } catch (error) {
      console.error('Error al separar mesa:', error)
      toast.error('Error al separar mesa')
    }
  }

  const handleConfirmSplitTable = async (sourceTableId, destTableId, splitItems, destTable) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    try {
      const result = await splitTableItems(getBusinessId(), sourceTableId, destTableId, splitItems)
      if (result.success) {
        const destStatus = destTable?.status === 'occupied' ? 'agregados a' : 'movidos a'
        toast.success(`Items ${destStatus} Mesa ${destTable?.number}`)
        setIsSplitTableModalOpen(false)
        setSelectedTable(null)
        setSelectedOrder(null)
      } else {
        toast.error('Error al dividir mesa: ' + result.error)
      }
    } catch (error) {
      console.error('Error al dividir mesa:', error)
      toast.error('Error al dividir mesa')
    }
  }

  const handleIndividualPayment = () => {
    setIsCloseTableModalOpen(false)
    setIsIndividualPaymentModalOpen(true)
  }

  const handleConfirmIndividualPayment = (selectedItems, remainingItems) => {
    // Detectar ruta correcta del POS según modo demo
    const isDemoRestaurant = location.pathname.startsWith('/demorestaurant')
    const isDemo = location.pathname.startsWith('/demo')
    let posPath = '/app/pos'
    if (isDemoRestaurant) {
      posPath = '/demorestaurant/pos'
    } else if (isDemo) {
      posPath = '/demo/pos'
    }

    // Pasamos los items seleccionados incluyendo cortesías: el POS las jala como
    // bonificación (precio 0, inafecto). No se cobran, pero quedan en el comprobante.

    navigate(posPath, {
      state: {
        fromTable: true,
        partialClose: true,
        tableId: selectedTable.id,
        tableNumber: selectedTable.number,
        orderId: selectedOrder.id,
        orderNumber: selectedOrder.orderNumber,
        items: selectedItems || [],
        remainingItems: remainingItems,
        waiterId: selectedTable.waiterId || selectedOrder.waiterId || null,
        waiterName: selectedTable.waiter || selectedOrder.waiterName || null,
        // Sede de la mesa: el POS fija sucursal+almacén (comprobante/serie/caja/stock correctos)
        branchId: selectedTable.branchId ?? selectedOrder.branchId ?? null,
      }
    })
    setIsIndividualPaymentModalOpen(false)
  }

  const handlePrintPreBill = async (itemFilter = null, personLabel = null, overrideTotal = null) => {
    if (!selectedTable) {
      toast.error('No se puede imprimir: datos incompletos')
      return
    }

    try {
      // Leer la orden fresca de Firestore para evitar datos stale en el estado
      const businessId = getBusinessId()
      let freshOrder = selectedOrder

      if (selectedTable.currentOrder && !itemFilter && !overrideTotal) {
        const orderResult = await getOrder(businessId, selectedTable.currentOrder)
        if (orderResult.success) {
          freshOrder = orderResult.data
        }
      }

      if (!freshOrder) {
        toast.error('No se puede imprimir: orden no encontrada')
        return
      }

      // Guardar snapshot de precuenta para auditoría (solo precuenta completa, no dividida)
      if (!itemFilter && !overrideTotal) {
        savePrecuentaSnapshot(businessId, {
          orderId: freshOrder.id,
          tableNumber: selectedTable.number,
          items: (freshOrder.items || []).map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
          total: freshOrder.total || 0,
          subtotal: freshOrder.subtotal || 0,
          tax: freshOrder.tax || 0,
          printedBy: user.uid,
          printedByName: user.displayName || user.email || 'Usuario',
        }).catch(err => console.error('Error al guardar snapshot de precuenta:', err))

        // Marcar la mesa como "precuenta impresa" para que la grilla muestre
        // un indicador sutil al mozo (ícono pulsante + tooltip). Se limpia
        // automáticamente al liberar la mesa. Solo aplica a precuentas
        // completas (no a divididas por persona/ítem).
        if (selectedTable.id) {
          markPreBillPrinted(businessId, selectedTable.id).catch(err =>
            console.error('Error al marcar precuenta impresa:', err)
          )
        }
      }

      // Obtener información del negocio desde Firestore
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
      // No usar térmica para precuentas divididas (itemFilter o overrideTotal)
      if (isNative && !itemFilter && !overrideTotal) {
        try {
          // Obtener configuración de impresora
          const printerConfigResult = await getPrinterConfig(businessId)
          const webPrintLegible = printerConfigResult.config?.webPrintLegible || false

          if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
            // Reconectar a la impresora
            await connectPrinter(printerConfigResult.config.address)

            // Imprimir en impresora térmica
            const result = await printPreBillThermal(freshOrder, selectedTable, businessInfo, taxConfig, printerConfigResult.config?.paperWidth || 58, recargoConsumoConfig)

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
      const ticketFontSizeCfg = printerConfigResult.config?.ticketFontSize || (printerConfigResult.config?.webPrintLegible ? 'medium' : 'small')
      console.log('🖨️ Tables - webPrintLegible:', webPrintLegible)
      const paperWidth = printerConfigResult.config?.paperWidth || 80
      const compactPrintValue = printerConfigResult.config?.compactPrint || false
      printPreBill(selectedTable, freshOrder, businessInfo, taxConfig, paperWidth, webPrintLegible, itemFilter, personLabel, recargoConsumoConfig, compactPrintValue, overrideTotal, ticketFontSizeCfg)
      toast.success('Imprimiendo precuenta...')
    } catch (error) {
      console.error('Error al imprimir precuenta:', error)
      toast.error('Error al imprimir precuenta')
    }
  }

  // Imprimir precuenta de una persona específica (división por items, igual o custom)
  const handlePrintPersonPreBill = async (personData, totalPersons) => {
    const isNative = Capacitor.isNativePlatform()

    // En móvil: usar impresora térmica
    if (isNative && splitData) {
      try {
        const businessId = getBusinessId()
        const businessResult = await getCompanySettings(businessId)
        const businessInfo = businessResult.success ? {
          tradeName: businessResult.data?.tradeName || businessResult.data?.name || 'RESTAURANTE',
          address: businessResult.data?.address || '',
          phone: businessResult.data?.phone || '',
        } : { tradeName: 'RESTAURANTE' }
        const taxConfig = {
          igvRate: businessResult.data?.emissionConfig?.taxConfig?.igvRate ?? 18,
          igvExempt: businessResult.data?.emissionConfig?.taxConfig?.igvExempt ?? false,
        }
        const recargoConsumoConfig = {
          enabled: businessResult.data?.restaurantConfig?.recargoConsumoEnabled ?? false,
          rate: businessResult.data?.restaurantConfig?.recargoConsumoRate ?? 10,
        }
        const printerConfigResult = await getPrinterConfig(businessId)
        const paperWidth = printerConfigResult.config?.paperWidth || 58

        if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
          await connectPrinter(printerConfigResult.config.address)
          const personIndex = splitData.persons.findIndex(p => p.personNumber === personData.personNumber)
          const { printSplitPreBillThermal } = await import('@/services/thermalPrinterService')
          const result = await printSplitPreBillThermal(selectedOrder, selectedTable, businessInfo, taxConfig, paperWidth, recargoConsumoConfig, splitData, personIndex)
          if (result.success) {
            toast.success(`Precuenta Persona ${personData.personNumber} impresa`)
            return
          }
        }
      } catch (error) {
        console.error('Error al imprimir precuenta dividida en térmica:', error)
        toast.info('Usando impresión estándar...')
      }
    }

    // Fallback: impresión HTML
    const personLabel = `Persona ${personData.personNumber} de ${totalPersons}`
    if (splitData?.method === 'items') {
      await handlePrintPreBill(personData.items, personLabel)
    } else {
      await handlePrintPreBill(null, personLabel, personData.total)
    }
  }

  // Imprimir todas las precuentas divididas en un solo documento
  const handlePrintAllSplitPreBills = async () => {
    if (!selectedTable || !selectedOrder || !splitData) return
    try {
      const businessId = getBusinessId()

      // Guardar snapshot de precuenta para auditoría
      savePrecuentaSnapshot(businessId, {
        orderId: selectedOrder.id,
        tableNumber: selectedTable.number,
        items: (selectedOrder.items || []).map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        total: selectedOrder.total || 0,
        subtotal: selectedOrder.subtotal || 0,
        tax: selectedOrder.tax || 0,
        printedBy: user.uid,
        printedByName: user.displayName || user.email || 'Usuario',
      }).catch(err => console.error('Error al guardar snapshot de precuenta:', err))
      const businessResult = await getCompanySettings(businessId)
      const businessInfo = businessResult.success ? {
        name: businessResult.data?.name || '',
        tradeName: businessResult.data?.tradeName || businessResult.data?.name || '',
        ruc: businessResult.data?.ruc || '',
        address: businessResult.data?.address || '',
        phone: businessResult.data?.phone || '',
        logoUrl: businessResult.data?.logoUrl || '',
      } : {}
      const taxConfig = {
        igvRate: businessResult.data?.emissionConfig?.taxConfig?.igvRate ?? 18,
        igvExempt: businessResult.data?.emissionConfig?.taxConfig?.igvExempt ?? false,
      }
      const recargoConsumoConfig = {
        enabled: businessResult.data?.restaurantConfig?.recargoConsumoEnabled ?? false,
        rate: businessResult.data?.restaurantConfig?.recargoConsumoRate ?? 10,
      }
      const printerConfigResult = await getPrinterConfig(businessId)
      const paperWidth = printerConfigResult.config?.paperWidth || 80

      const isNative = Capacitor.isNativePlatform()

      // En móvil: usar impresora térmica
      if (isNative && printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
        try {
          await connectPrinter(printerConfigResult.config.address)
          const { printSplitPreBillThermal } = await import('@/services/thermalPrinterService')
          const result = await printSplitPreBillThermal(selectedOrder, selectedTable, businessInfo, taxConfig, paperWidth, recargoConsumoConfig, splitData)
          if (result.success) {
            toast.success('Precuentas divididas impresas en ticketera')
            return
          }
        } catch (error) {
          console.error('Error al imprimir en térmica:', error)
          toast.info('Usando impresión estándar...')
        }
      }

      // Fallback: impresión HTML
      const webPrintLegible = printerConfigResult.config?.webPrintLegible || false
      const ticketFontSizeCfg = printerConfigResult.config?.ticketFontSize || (printerConfigResult.config?.webPrintLegible ? 'medium' : 'small')
      const compactPrintValue = printerConfigResult.config?.compactPrint || false
      printAllSplitPreBills(selectedTable, selectedOrder, splitData, businessInfo, taxConfig, paperWidth, webPrintLegible, recargoConsumoConfig, compactPrintValue, ticketFontSizeCfg)
      toast.success('Imprimiendo precuentas divididas...')
    } catch (error) {
      console.error('Error al imprimir precuentas divididas:', error)
      toast.error('Error al imprimir precuentas divididas')
    }
  }

  // Marcar items como impresos en Firestore
  const markItemsAsPrinted = async (order) => {
    try {
      const businessId = getBusinessId()
      const updatedItems = order.items.map(item => ({
        ...item,
        printedToKitchen: true,
      }))
      await updateOrder(businessId, order.id, { items: updatedItems })
      // Actualizar estado local
      setSelectedOrder(prev => prev ? { ...prev, items: updatedItems } : prev)
    } catch (error) {
      console.error('Error al marcar items como impresos:', error)
    }
  }

  const handlePrintKitchenTicket = async (printAll = false) => {
    if (!selectedTable || !selectedOrder) {
      toast.error('No se puede imprimir: datos incompletos')
      return
    }

    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    // Filtrar items no impresos (solo si no se fuerza reimprimir todo)
    const unprintedItems = (selectedOrder.items || []).filter(item => !item.printedToKitchen)
    const hasUnprintedItems = unprintedItems.length > 0

    // Evitar comanda DUPLICADA: la auto-impresión al agregar items ya manda la comanda
    // a cocina. Si está en curso, no mandar otra vez (esa era la causa del doble ticket).
    if (kitchenAutoPrintInProgressRef.current) {
      toast.info('La comanda se está enviando a cocina automáticamente')
      return
    }

    const itemsToPrint = (!printAll && hasUnprintedItems) ? unprintedItems : (selectedOrder.items || [])
    const isPartialPrint = !printAll && hasUnprintedItems
    // Es copia cuando NO hay items nuevos sin imprimir (todo ya se envió): un reimpreso
    // deliberado sale marcado "COPIA" en vez de duplicar silenciosamente la comanda.
    const isCopy = !hasUnprintedItems
    const orderToPrintData = { ...selectedOrder, items: itemsToPrint, _isCopy: isCopy, _ultraCompact: ultraCompactKitchen }

    const isNative = Capacitor.isNativePlatform()

    // Si es móvil, intentar imprimir en impresora térmica
    if (isNative) {
      try {
        const businessId = getBusinessId()
        // Obtener configuración de impresora
        const printerConfigResult = await getPrinterConfig(businessId)

        if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
          // Si hay estaciones con impresoras, imprimir separado por estación
          const stationsWithPrinter = enableKitchenStations && kitchenStations.filter(s => s.printerIp)
          if (stationsWithPrinter && stationsWithPrinter.length > 0) {
            const results = await printToAllStations(orderToPrintData, kitchenStations, printerConfigResult.config.paperWidth || 58)
            const allOk = results.every(r => r.success)
            if (allOk) {
              await markItemsAsPrinted(selectedOrder)
              toast.success(isPartialPrint ? 'Nuevos items impresos por estación' : 'Comandas impresas por estación')
            } else {
              const failed = results.filter(r => !r.success).map(r => r.station).join(', ')
              toast.error('Error en estaciones: ' + failed)
            }
            return
          }

          // Reconectar a la impresora
          const connectResult = await connectPrinter(printerConfigResult.config.address)

          if (!connectResult.success) {
            toast.error('No se pudo conectar a la impresora: ' + connectResult.error)
            toast.info('Usando impresión estándar...')
          } else {
            const pw = printerConfigResult.config.paperWidth || 58

            // Si hay estaciones habilitadas, imprimir separado en la misma ticketera
            if (enableKitchenStations && kitchenStations.length > 0) {
              const itemMatchesStation = (itemCategory, stationCategories) => {
                if (!itemCategory || !stationCategories || stationCategories.length === 0) return false
                if (stationCategories.includes(itemCategory)) return true
                const itemCatName = categoryMap[itemCategory]
                if (itemCatName && stationCategories.includes(itemCatName)) return true
                for (const sc of stationCategories) {
                  if (categoryMap[sc] === itemCategory) return true
                }
                return false
              }

              let anyPrinted = false
              for (const station of kitchenStations) {
                let stationItems
                if (station.isPase) {
                  stationItems = orderToPrintData.items || []
                } else if (station.categories?.length > 0) {
                  stationItems = (orderToPrintData.items || []).filter(item =>
                    itemMatchesStation(item.category || item.categoryId || '', station.categories)
                  )
                } else {
                  continue
                }
                if (stationItems.length > 0) {
                  if (anyPrinted) {
                    await new Promise(resolve => setTimeout(resolve, 1500))
                  }
                  const stationOrder = { ...selectedOrder, items: stationItems }
                  await printKitchenOrder(stationOrder, selectedTable, pw, station.name)
                  anyPrinted = true
                }
              }
              if (anyPrinted) {
                await markItemsAsPrinted(selectedOrder)
                toast.success(isPartialPrint ? 'Nuevos items impresos por estación' : 'Comandas impresas por estación')
                return
              }
            }

            // Sin estaciones: imprimir todo junto
            const result = await printKitchenOrder(
              orderToPrintData,
              selectedTable,
              pw
            )

            if (result.success) {
              await markItemsAsPrinted(selectedOrder)
              toast.success(isPartialPrint ? 'Comanda de nuevos items impresa' : 'Comanda impresa en ticketera')
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
    setOrderToPrint(orderToPrintData)
    // Marcar items como impresos
    await markItemsAsPrinted(selectedOrder)
    // Esperar a que se renderice el ticket antes de imprimir
    setTimeout(() => {
      handlePrintWeb()
    }, 300)
  }

  // Auto-impresion de comanda al AGREGAR items a una mesa.
  // - Solo en la app (impresion termica nativa) y si hay impresora configurada.
  // - Imprime SOLO los items recien agregados (no toda la orden).
  // - Cubre estaciones con impresora WiFi (IP) y, si no hay, la impresora del
  //   dispositivo (bluetooth/iMin), separando por estacion si estan habilitadas.
  // - Es SILENCIOSA: si no hay impresora o falla, no interrumpe el flujo (a diferencia
  //   del boton manual, NO cae al dialogo de impresion web).
  const autoPrintKitchenOnAdd = async (addedItems) => {
    try {
      if (isDemoMode) return
      if (!Capacitor.isNativePlatform()) return
      if (!selectedOrder || !selectedTable) return
      const items = (addedItems || []).filter(Boolean)
      if (items.length === 0) return

      const businessId = getBusinessId()
      const printerConfigResult = await getPrinterConfig(businessId)
      if (!printerConfigResult.success || !printerConfigResult.config?.enabled || !printerConfigResult.config?.address) return

      const pw = printerConfigResult.config.paperWidth || 58
      // Marcar la auto-impresión en curso para que el botón manual no duplique la comanda.
      kitchenAutoPrintInProgressRef.current = true
      const orderToPrintData = { ...selectedOrder, items, _ultraCompact: ultraCompactKitchen }
      let printed = false

      // 1) Estaciones con impresora WiFi (IP) propia
      const stationsWithWifi = enableKitchenStations && Array.isArray(kitchenStations)
        ? kitchenStations.filter(s => s.printerIp)
        : []
      if (stationsWithWifi.length > 0) {
        const results = await printToAllStations(orderToPrintData, kitchenStations, pw)
        printed = Array.isArray(results) && results.some(r => r.success)
      } else {
        // 2) Impresora del dispositivo (bluetooth/iMin)
        await connectPrinter(printerConfigResult.config.address)
        if (enableKitchenStations && Array.isArray(kitchenStations) && kitchenStations.length > 0) {
          // Separar por estacion en la misma ticketera
          const itemMatchesStation = (itemCategory, stationCategories) => {
            if (!itemCategory || !stationCategories || stationCategories.length === 0) return false
            if (stationCategories.includes(itemCategory)) return true
            const itemCatName = categoryMap[itemCategory]
            if (itemCatName && stationCategories.includes(itemCatName)) return true
            for (const sc of stationCategories) {
              if (categoryMap[sc] === itemCategory) return true
            }
            return false
          }
          let anyPrinted = false
          for (const station of kitchenStations) {
            let stationItems
            if (station.isPase) stationItems = items
            else if (station.categories?.length > 0) stationItems = items.filter(it => itemMatchesStation(it.category || it.categoryId || '', station.categories))
            else continue
            if (stationItems.length > 0) {
              if (anyPrinted) await new Promise(resolve => setTimeout(resolve, 1500))
              const r = await printKitchenOrder({ ...selectedOrder, items: stationItems }, selectedTable, pw, station.name)
              if (r?.success) anyPrinted = true
            }
          }
          printed = anyPrinted
        } else {
          // 3) Sin estaciones: una sola comanda
          const r = await printKitchenOrder(orderToPrintData, selectedTable, pw)
          printed = !!r?.success
        }
      }

      if (printed) {
        // Marcar la orden como impresa (leyendo la orden fresca de Firestore, que ya
        // incluye los items recien agregados) para que el boton manual no los reimprima.
        try {
          const fresh = await getOrder(businessId, selectedOrder.id)
          if (fresh.success && fresh.data) await markItemsAsPrinted(fresh.data)
        } catch (e) { void e }
        toast.success('Comanda enviada a cocina')
      }
    } catch (error) {
      console.error('Error en auto-impresion de comanda al agregar items:', error)
      // Silencioso: el agregado de items ya fue exitoso
    } finally {
      kitchenAutoPrintInProgressRef.current = false
    }
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

        // Actualizar selectedTable con el nuevo estado y abrir modal de agregar items
        const updatedTable = {
          ...selectedTable,
          status: 'occupied',
          currentOrder: result.orderId,
          waiter: occupyData.waiterName,
          waiterId: occupyData.waiterId,
          amount: 0,
        }
        setSelectedTable(updatedTable)
        // Sembrar el objeto con los datos reales de la mesa/orden (número, mesa, tipo).
        // Si se imprime una comanda ANTES de que el listener de Firestore traiga el doc
        // completo, así sale "Mesa N / #NNN" y NO el ticket fantasma "PARA LLEVAR / <id>".
        setSelectedOrder({
          id: result.orderId,
          items: [],
          tableNumber: selectedTable.number,
          orderNumber: result.orderNumber,
          orderType: 'dine_in',
        })
        setIsActionModalOpen(false)
        setIsOrderItemsModalOpen(true)
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
    const tableNumber = selectedTable.number
    const closedOrder = selectedOrder

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

    // Si fue cierre sin comprobante, registrar en auditoría
    if (closeData?.generateReceipt === 'none' && closeData?.reason) {
      addDoc(collection(db, 'businesses', getBusinessId(), 'tableCloseWithoutReceipt'), {
        tableId: tableIdToClose,
        tableNumber,
        orderId: closedOrder?.id || null,
        amount: closeData.amount || 0,
        items: (closeData.items || []).map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        reason: closeData.reason,
        closedBy: user.uid,
        closedByName: user.displayName || user.email || 'Usuario',
        createdAt: serverTimestamp(),
      }).catch(err => console.error('Error al registrar cierre sin comprobante:', err))
    }

    // Ejecutar la operación en Firestore en background
    releaseTable(getBusinessId(), tableIdToClose).catch(error => {
      console.error('Error al cerrar mesa en Firestore:', error)
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

  // Tooltip humano para "precuenta impresa hace X". Devuelve string vacío
  // si el timestamp no es válido. Usado en el indicador sutil de la mesa.
  const formatPreBillElapsed = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    const ms = Date.now() - date.getTime()
    if (ms < 0) return 'Precuenta impresa'
    const minutes = Math.floor(ms / 60000)
    if (minutes < 1) return 'Precuenta impresa hace unos segundos'
    if (minutes === 1) return 'Precuenta impresa hace 1 minuto'
    if (minutes < 60) return `Precuenta impresa hace ${minutes} minutos`
    const hours = Math.floor(minutes / 60)
    const remMin = minutes % 60
    if (hours === 1 && remMin === 0) return 'Precuenta impresa hace 1 hora'
    if (remMin === 0) return `Precuenta impresa hace ${hours} horas`
    return `Precuenta impresa hace ${hours}h ${remMin}min`
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
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          {branches.length > 0 && (
            <Select
              value={selectedBranchId || ''}
              onChange={(e) => setSelectedBranchId(e.target.value || null)}
              className="w-full md:w-56"
            >
              {hasMainBranchAccess && <option value="">{companySettings?.mainBranchName || 'Sucursal Principal'}</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          )}
          <Button
            variant="outline"
            onClick={() => { setBarTabName(''); setShowBarTabModal(true) }}
            className="flex items-center gap-2 w-full md:w-auto"
          >
            <Wine className="w-4 h-4" />
            Nueva cuenta de barra
          </Button>
          <Button onClick={openCreateModal} className="flex items-center gap-2 w-full md:w-auto">
            <Plus className="w-4 h-4" />
            Nueva Mesa
          </Button>
        </div>
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
          {zonesWithBar.map((zone) => {
            const zoneTables = tables.filter((t) => t.zone === zone)
            if (zoneTables.length === 0) return null
            const isBarZone = zone === 'Barra'

            return (
              <Card key={zone}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {isBarZone && <Wine className="w-5 h-5 text-amber-600" />}
                      {zone}
                    </CardTitle>
                    <span className="text-sm text-gray-500">
                      {isBarZone
                        ? `${zoneTables.length} ${zoneTables.length === 1 ? 'cuenta' : 'cuentas'}`
                        : `${zoneTables.length} ${zoneTables.length === 1 ? 'mesa' : 'mesas'}`}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {zoneTables.map((table) => {
                      const isGrouped = !!table.groupId
                      const isPrimary = isGrouped && table.isGroupPrimary
                      const isLinked = isGrouped && !table.isGroupPrimary
                      const groupNumbers = table.groupTableNumbers || []
                      const primaryNumber = groupNumbers[0]
                      const groupLabel = groupNumbers.length > 0
                        ? `${groupNumbers.join('+')}`
                        : ''
                      // Indicador "precuenta impresa": borde ámbar latente +
                      // ícono pulsante. Solo en mesas ocupadas no vinculadas
                      // que tengan preBillPrintedAt. Se limpia al liberar.
                      const hasPreBill = !isLinked && table.status === 'occupied' && !!table.preBillPrintedAt
                      return (
                      <div key={table.id} className="relative group">
                        <div
                          onClick={() => handleTableClick(table)}
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all min-h-[180px] flex flex-col ${
                            isPrimary
                              ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-300 hover:ring-indigo-400'
                              : isLinked
                              ? 'bg-gray-100 border-gray-300 border-dashed hover:border-gray-400 opacity-80'
                              : table.status === 'occupied' && table.allItemsServed
                              ? 'bg-blue-100 border-blue-400 hover:border-blue-500'
                              : getStatusColor(table.status)
                          } ${hasPreBill ? 'animate-pulse-border-amber' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-2xl font-bold ${isLinked ? 'text-gray-500' : 'text-gray-900'}`}>
                                {table.number}
                              </span>
                              {!isLinked && getStatusIcon(table.status)}
                            </div>
                            <div className={`flex items-center gap-2 text-sm ${isLinked ? 'text-gray-400' : 'text-gray-600'}`}>
                              {/* Indicador de precuenta impresa: ícono Receipt + label en ámbar
                                  con pulse suave. Inline solo desde sm (móvil → banner abajo
                                  porque el texto no cabe en tarjetas angostas de 2 columnas). */}
                              {hasPreBill && (
                                <span
                                  className="hidden sm:inline-flex items-center gap-1 text-amber-700 animate-pulse"
                                  title={formatPreBillElapsed(table.preBillPrintedAt)}
                                  aria-label="Precuenta impresa"
                                >
                                  <Receipt className="w-4 h-4 flex-shrink-0" />
                                  <span className="text-xs font-semibold whitespace-nowrap">Precuenta impresa</span>
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                <span>{table.capacity}</span>
                              </span>
                            </div>
                          </div>

                          {/* Banner de precuenta impresa (solo móvil) — en sm+ se muestra inline arriba */}
                          {hasPreBill && (
                            <div
                              className="sm:hidden mb-2 px-2 py-1 rounded-md text-center text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-300 animate-pulse flex items-center justify-center gap-1"
                              title={formatPreBillElapsed(table.preBillPrintedAt)}
                            >
                              <Receipt className="w-3.5 h-3.5 flex-shrink-0" />
                              Precuenta impresa
                            </div>
                          )}

                          {/* Indicador de grupo (fusión) */}
                          {isPrimary && (
                            <div className="mb-2 px-2 py-1 rounded-md text-center text-xs font-semibold bg-indigo-600 text-white">
                              ★ Principal · Grupo {groupLabel}
                            </div>
                          )}
                          {isLinked && (
                            <div className="mb-2 px-2 py-1 rounded-md text-center text-xs font-semibold bg-gray-200 text-gray-600 border border-gray-300">
                              ↳ Vinculada a Mesa {primaryNumber}
                            </div>
                          )}

                          {!isLinked && (
                            <Badge
                              variant={
                                table.status === 'available'
                                  ? 'success'
                                  : table.status === 'occupied' && table.allItemsServed
                                  ? 'info'
                                  : table.status === 'occupied'
                                  ? 'danger'
                                  : 'warning'
                              }
                              className="mb-2 w-full justify-center"
                            >
                              {table.status === 'occupied' && table.allItemsServed
                                ? '✓ Todo servido'
                                : getStatusText(table.status)}
                            </Badge>
                          )}

                          {/* Mozo: visible en ocupadas y en la principal del grupo. En vinculadas se omite (la cuenta es de la principal).
                              Estilo "glass" neutro: se adapta a cualquier color
                              de fondo del card (rojo/ámbar/azul) sin chocar. */}
                          {table.status === 'occupied' && table.waiter && !isLinked && (
                            <div className="bg-white/60 text-gray-700 px-2 py-1 rounded-md text-center mb-2 border border-gray-200/70 backdrop-blur-sm">
                              <span className="text-xs font-semibold">👤 {table.waiter}</span>
                            </div>
                          )}

                          {/* Vinculadas: solo info simple, sin consumo */}
                          {isLinked && (
                            <div className="text-xs text-gray-500 text-center mt-2 pt-2 border-t border-gray-300">
                              <p>Sin cuenta propia</p>
                              <p className="mt-1 italic">Toca para ver Mesa {primaryNumber}</p>
                            </div>
                          )}

                          {/* Ocupadas no vinculadas: mostrar inicio y consumo */}
                          {table.status === 'occupied' && !isLinked && (
                            <div className="space-y-1 text-xs text-gray-700 mt-2 pt-2 border-t border-gray-300">
                              {table.startTime && (
                                <div className="flex justify-between">
                                  <span>Inicio:</span>
                                  <span className="font-medium">{formatTime(table.startTime)}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span>{isPrimary ? 'Cuenta del grupo:' : 'Consumo:'}</span>
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

                        {/* Botones de edición/eliminación - solo owner puede eliminar */}
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
                            {isOwner && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteRequest(table)
                                }}
                                className="bg-white shadow-md text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Nueva cuenta de barra: solo pide el nombre del cliente */}
      <Modal
        isOpen={showBarTabModal}
        onClose={() => setShowBarTabModal(false)}
        title="Nueva cuenta de barra"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); handleCreateBarTab() }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del cliente *
            </label>
            <input
              type="text"
              value={barTabName}
              onChange={(e) => setBarTabName(e.target.value)}
              placeholder="Ej: Juan, Barra 1, Señor de la gorra"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              La cuenta acumula el consumo como una mesa. Al cobrarla se cierra y desaparece de la barra.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBarTabModal(false)}
              className="flex-1"
              disabled={isCreatingBarTab}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isCreatingBarTab} className="flex-1">
              {isCreatingBarTab ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creando...</>
              ) : (
                'Crear y tomar pedido'
              )}
            </Button>
          </div>
        </form>
      </Modal>

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

          {branches.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sede *
              </label>
              <Select
                value={formData.branchId || ''}
                onChange={(e) => setFormData({ ...formData, branchId: e.target.value || null })}
              >
                {hasMainBranchAccess && <option value="">{companySettings?.mainBranchName || 'Sucursal Principal'}</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
              <p className="text-xs text-gray-500 mt-1">La mesa solo aparecerá en esta sede.</p>
            </div>
          )}

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
        order={selectedOrder}
        waiters={waiters.filter(w => (w.branchId || null) === (selectedBranchId || null) && canAccessTable(w))}
        defaultWaiterId={userPermissions?.defaultWaiterId || null}
        skipWaiter={skipWaiterForSecondary && !isOwner}
        availableTables={tables.filter(t => t.status === 'available')}
        occupiedTables={tables.filter(t => t.status === 'occupied')}
        onOccupy={handleOccupyTable}
        onRelease={handleReleaseTable}
        onReserve={handleReserveTable}
        onCancelReservation={handleCancelReservation}
        onAddItems={handleAddItems}
        onEditOrder={handleEditOrder}
        onSplitBill={handleSplitBill}
        onTransferTable={handleTransferTable}
        onMoveTable={handleMoveTable}
        onSplitTable={handleSplitTable}
        onMergeTables={handleMergeTables}
        onUnmergeTable={handleUnmergeTable}
        onOpenPrimary={handleOpenPrimary}
        onPrintPreBill={() => openPreBillPreview('action')}
        onPrintKitchenTicket={handlePrintKitchenTicket}
        onToggleItemServed={handleToggleItemServed}
        onMarkAllServed={handleMarkAllServed}
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
        onAfterAddItems={autoPrintKitchenOnAdd}
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
        onAfterAddItems={autoPrintKitchenOnAdd}
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

      {/* Modal para dividir mesa (mover items a otra mesa) */}
      <SplitTableModal
        isOpen={isSplitTableModalOpen}
        onClose={() => {
          setIsSplitTableModalOpen(false)
          setIsActionModalOpen(true)
        }}
        table={selectedTable}
        order={selectedOrder}
        tables={tables}
        onConfirm={handleConfirmSplitTable}
      />

      {/* Vista previa de precuenta con descuento opcional al comensal */}
      <PreBillPreviewModal
        isOpen={isPreBillPreviewOpen}
        onClose={closePreBillPreview}
        table={selectedTable}
        order={selectedOrder}
        onConfirmPrint={handleConfirmPreBillPrint}
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
        onIndividualPayment={handleIndividualPayment}
        taxConfig={taxConfig}
        requireReceipt={requireReceiptForSecondary && !isOwner}
      />

      {/* Modal para cobro individual (parcial) */}
      <IndividualPaymentModal
        isOpen={isIndividualPaymentModalOpen}
        onClose={() => {
          setIsIndividualPaymentModalOpen(false)
          setIsActionModalOpen(true)
        }}
        table={selectedTable}
        order={selectedOrder}
        onConfirm={handleConfirmIndividualPayment}
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

          <div className="border-t pt-4 mt-4 space-y-3">
            <button
              onClick={handlePrintAllSplitPreBills}
              className="w-full p-3 border-2 border-primary-500 bg-primary-50 rounded-lg hover:border-primary-600 hover:bg-primary-100 transition-colors text-center"
            >
              <span className="text-primary-700 font-medium">
                Imprimir Todas las Precuentas Divididas
              </span>
            </button>
            <button
              onClick={() => openPreBillPreview('split')}
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

      {/* Modal de confirmación de eliminación de mesa */}
      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={() => {
          setDeleteConfirm({ isOpen: false, tableId: null, tableNumber: '' })
          setDeleteInput('')
        }}
        title="Eliminar Mesa"
        size="sm"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium">
              Esta acción eliminará permanentemente la Mesa {deleteConfirm.tableNumber}.
            </p>
            <p className="text-sm text-red-700 mt-1">
              Para confirmar, escribe el número de la mesa:
            </p>
          </div>
          <Input
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            placeholder={`Escribe "${deleteConfirm.tableNumber}" para confirmar`}
            autoFocus
          />
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirm({ isOpen: false, tableId: null, tableNumber: '' })
                setDeleteInput('')
              }}
              className="flex-1"
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              disabled={deleteInput !== deleteConfirm.tableNumber || isDeleting}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar Mesa'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Comanda para imprimir (oculta, fuera de pantalla para react-to-print) */}
      {orderToPrint && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={kitchenTicketRef} className={enableKitchenStations && kitchenStations.length > 0 && !combineStationsOnWebPrint ? 'kitchen-multi-ticket' : undefined}>
            {enableKitchenStations && kitchenStations.length > 0 && !combineStationsOnWebPrint ? (() => {
              // Helper: matchear categoría de item con categorías de estación
              const itemMatchesStation = (itemCategory, stationCategories) => {
                if (!itemCategory || !stationCategories || stationCategories.length === 0) return false
                if (stationCategories.includes(itemCategory)) return true
                const itemCatName = categoryMap[itemCategory]
                if (itemCatName && stationCategories.includes(itemCatName)) return true
                for (const stationCat of stationCategories) {
                  if (categoryMap[stationCat] === itemCategory) return true
                }
                return false
              }

              const allItems = orderToPrint.items || []
              const assignedCategories = new Set()
              const stationTickets = []

              kitchenStations.forEach(station => {
                let stationItems
                if (station.isPase) {
                  stationItems = allItems
                } else if (station.categories && station.categories.length > 0) {
                  stationItems = allItems.filter(item =>
                    itemMatchesStation(item.category || item.categoryId || '', station.categories)
                  )
                  station.categories.forEach(cat => {
                    assignedCategories.add(cat)
                    if (categoryMap[cat]) assignedCategories.add(categoryMap[cat])
                  })
                } else {
                  stationItems = []
                }
                if (stationItems.length > 0) {
                  stationTickets.push({ name: station.name, items: stationItems })
                }
              })

              const hasPase = kitchenStations.some(s => s.isPase)
              if (!hasPase) {
                const orphanItems = allItems.filter(item => {
                  const itemCat = item.category || item.categoryId || ''
                  const itemCatName = categoryMap[itemCat] || itemCat
                  return !assignedCategories.has(itemCat) && !assignedCategories.has(itemCatName)
                })
                if (orphanItems.length > 0) {
                  stationTickets.push({ name: 'General', items: orphanItems })
                }
              }

              return stationTickets.map((ticket, idx) => (
                <div key={idx} style={{ pageBreakAfter: idx < stationTickets.length - 1 ? 'always' : 'auto' }}>
                  <KitchenTicket
                    order={{ ...orderToPrint, items: ticket.items }}
                    companySettings={companySettings}
                    webPrintLegible={webPrintLegible}
                    ticketFontSize={ticketFontSize}
                    compactPrint={compactPrint}
                    ultraCompactKitchen={ultraCompactKitchen}
                    simplePrint={simplePrint}
                    a4SheetPrint={a4SheetPrint}
                    stationName={ticket.name}
                  />
                </div>
              ))
            })() : (
              <KitchenTicket
                order={orderToPrint}
                companySettings={companySettings}
                webPrintLegible={webPrintLegible}
                ticketFontSize={ticketFontSize}
                compactPrint={compactPrint}
                ultraCompactKitchen={ultraCompactKitchen}
                simplePrint={simplePrint}
                a4SheetPrint={a4SheetPrint}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
