import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { ListOrdered, Clock, CheckCircle, XCircle, AlertCircle, AlertTriangle, Users, DollarSign, Loader2, ChevronRight, ChevronDown, Plus, Receipt, Bike, ShoppingBag, Smartphone, User, Printer, X, ShoppingCart, Truck, PackageCheck, Edit2, MoreVertical, FileText, Split, UserMinus } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { getActiveOrders, getOrdersStats, updateOrderStatus, createOrder, completeOrder, markOrderAsPaid, updateOrder, getOrder } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, query, where, onSnapshot, orderBy as firestoreOrderBy, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getCompanySettings, getProductCategories, savePrecuentaSnapshot } from '@/services/firestoreService'
import CreateOrderModal from '@/components/restaurant/CreateOrderModal'
import OrderItemsModal from '@/components/restaurant/OrderItemsModal'
import EditOrderItemsModal from '@/components/restaurant/EditOrderItemsModal'
import SplitBillModal from '@/components/restaurant/SplitBillModal'
import IndividualPaymentModal from '@/components/restaurant/IndividualPaymentModal'
import KitchenTicket from '@/components/KitchenTicket'
import { useReactToPrint } from 'react-to-print'
import { Capacitor } from '@capacitor/core'
import { printKitchenOrder, connectPrinter, getPrinterConfig, printToAllStations, printPreBill as printPreBillThermal } from '@/services/thermalPrinterService'
import { printPreBill, printAllSplitPreBills } from '@/utils/printPreBill'
import { getActiveMotoristas, createDeliveryRecord, updateOperationalStatus } from '@/services/motoristaService'

export default function Orders() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()
  const navigate = useNavigate()
  const appNavigate = useAppNavigate()

  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [updatingOrderId, setUpdatingOrderId] = useState(null)
  const [itemStatusTracking, setItemStatusTracking] = useState(false) // Config para modo de seguimiento
  const [requirePaymentBeforeKitchen, setRequirePaymentBeforeKitchen] = useState(false) // Config para pago obligatorio
  const [deliveryPersons, setDeliveryPersons] = useState([]) // Lista de repartidores
  const [brands, setBrands] = useState([]) // Lista de marcas
  const [kitchenStations, setKitchenStations] = useState([]) // Estaciones de cocina
  const [enableKitchenStations, setEnableKitchenStations] = useState(false) // Multi-estación habilitada
  const [categoryMap, setCategoryMap] = useState({}) // Mapeo ID → nombre de categoría
  const [autoPrintByStation, setAutoPrintByStation] = useState(false) // Impresión automática

  // Modales para nueva orden
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false)
  const [showOrderItemsModal, setShowOrderItemsModal] = useState(false)
  const [newOrderData, setNewOrderData] = useState(null)

  // Estado para impresión de comanda
  const [companySettings, setCompanySettings] = useState(null)
  const [orderToPrint, setOrderToPrint] = useState(null)
  const kitchenTicketRef = useRef()

  // Estado para configuración de impresión web legible y compacta
  const [webPrintLegible, setWebPrintLegible] = useState(false)
  const [compactPrint, setCompactPrint] = useState(false)
  const [ultraCompactKitchen, setUltraCompactKitchen] = useState(false)
  const [simplePrint, setSimplePrint] = useState(false)

  // Filtro por marca
  const [selectedBrandFilter, setSelectedBrandFilter] = useState('all')

  // Estado para modal de editar orden
  const [showEditOrderModal, setShowEditOrderModal] = useState(false)
  const [orderToEdit, setOrderToEdit] = useState(null)

  // Estado para modal de cierre de orden
  const [showCloseOrderModal, setShowCloseOrderModal] = useState(false)
  const [orderToClose, setOrderToClose] = useState(null)
  const [isClosingOrder, setIsClosingOrder] = useState(false)
  const [showCloseWithoutReceipt, setShowCloseWithoutReceipt] = useState(false)
  const [closeReason, setCloseReason] = useState('')
  const [isIndividualPaymentModalOpen, setIsIndividualPaymentModalOpen] = useState(false)

  // Menú de acciones (ID de la orden con menú abierto)
  const [openMenuOrderId, setOpenMenuOrderId] = useState(null)

  // Dividir cuenta
  const [isSplitBillModalOpen, setIsSplitBillModalOpen] = useState(false)
  const [isPrintSplitModalOpen, setIsPrintSplitModalOpen] = useState(false)
  const [splitData, setSplitData] = useState(null)
  const [selectedOrderForAction, setSelectedOrderForAction] = useState(null)

  // Cargar configuración de impresora para webPrintLegible y compactPrint
  useEffect(() => {
    const loadPrinterConfig = async () => {
      if (!user?.uid) return
      try {
        const printerConfigResult = await getPrinterConfig(getBusinessId())
        if (printerConfigResult.success && printerConfigResult.config) {
          setWebPrintLegible(printerConfigResult.config.webPrintLegible || false)
          setCompactPrint(printerConfigResult.config.compactPrint || false)
          setUltraCompactKitchen(printerConfigResult.config.ultraCompactKitchen || false)
          setSimplePrint(printerConfigResult.config.simplePrint || false)
        }
      } catch (error) {
        console.error('Error loading printer config:', error)
      }
    }
    loadPrinterConfig()
  }, [user])

  // Listener para la configuración del negocio
  useEffect(() => {
    if (!user?.uid || isDemoMode) return

    const businessRef = doc(db, 'businesses', getBusinessId())
    const unsubscribe = onSnapshot(
      businessRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const businessData = docSnap.data()
          const config = businessData.restaurantConfig || {}
          setItemStatusTracking(config.itemStatusTracking || false)
          setRequirePaymentBeforeKitchen(config.requirePaymentBeforeKitchen || false)
          // Cargar motoristas desde la colección de motoristas
          getActiveMotoristas(getBusinessId()).then(result => {
            if (result.success) {
              setDeliveryPersons(result.data)
            }
          })
          setBrands((config.brands || []).filter(b => b.active !== false))
          setKitchenStations(config.kitchenStations || [])
          setEnableKitchenStations(config.enableKitchenStations || false)
          setAutoPrintByStation(config.autoPrintByStation || false)
        }
      },
      (error) => {
        console.error('Error al cargar configuración del negocio:', error)
      }
    )

    return () => unsubscribe()
  }, [user, isDemoMode, getBusinessId])

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
  }, [user, isDemoMode, getBusinessId])

  // Cargar configuración de la empresa
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

  // Configurar react-to-print con la nueva API
  const handlePrint = useReactToPrint({
    contentRef: kitchenTicketRef,
    onAfterPrint: () => {
      toast.success('Comanda enviada a impresora')
      setOrderToPrint(null)
    },
  })

  // Función para imprimir comanda
  const handlePrintKitchenTicket = async (order) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    const isNative = Capacitor.isNativePlatform()

    // Si es móvil, intentar imprimir en impresora térmica
    if (isNative) {
      try {
        // Obtener configuración de impresora
        const printerConfigResult = await getPrinterConfig(getBusinessId())

        if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
          // Si hay estaciones con impresoras, imprimir separado por estación
          const stationsWithPrinter = enableKitchenStations && kitchenStations.filter(s => s.printerIp)
          if (stationsWithPrinter && stationsWithPrinter.length > 0) {
            const results = await printToAllStations(order, kitchenStations, printerConfigResult.config.paperWidth || 58)
            const allOk = results.every(r => r.success)
            if (allOk) {
              toast.success('Comandas impresas por estación')
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
                  stationItems = order.items || []
                } else if (station.categories?.length > 0) {
                  stationItems = (order.items || []).filter(item =>
                    itemMatchesStation(item.category || item.categoryId || '', station.categories)
                  )
                } else {
                  continue
                }
                if (stationItems.length > 0) {
                  if (anyPrinted) {
                    await new Promise(resolve => setTimeout(resolve, 1500))
                  }
                  const stationOrder = { ...order, items: stationItems }
                  await printKitchenOrder(stationOrder, null, pw, station.name)
                  anyPrinted = true
                }
              }
              if (anyPrinted) {
                toast.success('Comandas impresas por estación')
                return
              }
            }

            // Sin estaciones: imprimir todo junto
            const result = await printKitchenOrder(order, null, pw)

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
        console.error('Error al imprimir en ticketera:', error)
        toast.info('Usando impresión estándar...')
      }
    }

    // Fallback: impresión estándar (web o si falla la térmica)
    setOrderToPrint(order)
    // Esperar a que se renderice el ticket antes de imprimir
    setTimeout(() => {
      handlePrint()
    }, 300)
  }

  // Listener en tiempo real para órdenes activas
  useEffect(() => {
    if (!user?.uid) return

    setIsLoading(true)

    // Si estamos en modo demo, usar datos de demo
    if (isDemoMode && demoData?.orders) {
      // Solo mostrar órdenes activas (excluir delivered y cancelled)
      const ordersData = demoData.orders.filter(o =>
        ['pending', 'preparing', 'ready', 'dispatched'].includes(o.status)
      )

      // Ordenar por fecha de creación (más recientes primero)
      ordersData.sort((a, b) => {
        const dateA = a.createdAt || new Date(0)
        const dateB = b.createdAt || new Date(0)
        return dateB - dateA
      })

      setOrders(ordersData)

      // Calcular estadísticas
      const newStats = {
        total: ordersData.length,
        pending: ordersData.filter(o => o.status === 'pending').length,
        preparing: ordersData.filter(o => o.status === 'preparing').length,
        ready: ordersData.filter(o => o.status === 'ready').length,
        dispatched: ordersData.filter(o => o.status === 'dispatched').length,
        totalRevenue: ordersData.reduce((sum, o) => sum + (o.total || 0), 0),
      }
      setStats(newStats)
      setIsLoading(false)
      return
    }

    // Modo normal - usar Firestore
    const businessId = getBusinessId()
    const ordersRef = collection(db, 'businesses', businessId, 'orders')

    // Solo consultar órdenes activas (excluir delivered y cancelled)
    // Ordenaremos los datos en el cliente después de recibirlos
    const q = query(
      ordersRef,
      where('status', 'in', ['pending', 'preparing', 'ready', 'dispatched'])
    )

    // Listener en tiempo real - se ejecuta cada vez que hay cambios
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ordersData = []
        snapshot.forEach((doc) => {
          ordersData.push({ id: doc.id, ...doc.data() })
        })

        // Ordenar por fecha de creación en el cliente (más recientes primero)
        ordersData.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0)
          const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0)
          return dateB - dateA // Descendente
        })

        setOrders(ordersData)

        // Calcular estadísticas en tiempo real
        const newStats = {
          total: ordersData.length,
          pending: ordersData.filter(o => o.status === 'pending').length,
          preparing: ordersData.filter(o => o.status === 'preparing').length,
          ready: ordersData.filter(o => o.status === 'ready').length,
          dispatched: ordersData.filter(o => o.status === 'dispatched').length,
          totalRevenue: ordersData.reduce((sum, o) => sum + (o.total || 0), 0),
        }
        setStats(newStats)

        setIsLoading(false)
      },
      (error) => {
        console.error('Error en listener de órdenes:', error)
        toast.error('Error al cargar órdenes en tiempo real')
        setIsLoading(false)
      }
    )

    // Cleanup: desuscribirse cuando el componente se desmonte
    return () => unsubscribe()
  }, [user, isDemoMode, demoData])

  const loadOrders = async () => {
    // Esta función ya no es necesaria con listeners en tiempo real
    // Los datos se actualizan automáticamente vía onSnapshot
  }

  const handleCreateOrderClick = () => {
    setShowCreateOrderModal(true)
  }

  const handleOrderTypeSelected = (orderData) => {
    // Guardar datos de la orden (tipo, fuente, cliente)
    setNewOrderData(orderData)
    setShowCreateOrderModal(false)
    // Abrir modal de items
    setShowOrderItemsModal(true)
  }

  const handleOrderItemsAdded = async (items) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      // Calcular total
      const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)

      // Crear la orden
      const orderPayload = {
        ...newOrderData,
        items: items.map(item => ({
          ...item,
          total: item.price * item.quantity
        })),
        total,
        status: 'pending',
        tableId: null,
        tableNumber: null,
      }

      const result = await createOrder(getBusinessId(), orderPayload)

      if (result.success) {
        toast.success('Orden creada exitosamente')
        setShowOrderItemsModal(false)
        setNewOrderData(null)
      } else {
        toast.error('Error al crear orden: ' + result.error)
      }
    } catch (error) {
      console.error('Error al crear orden:', error)
      toast.error('Error al crear la orden')
    }
  }

  const handleCloseOrder = (order) => {
    // Abrir modal para elegir: con comprobante o sin comprobante
    setOrderToClose(order)
    setShowCloseOrderModal(true)
  }

  const handleCloseWithReceipt = () => {
    if (!orderToClose) return

    // Navegar al POS con los items de la orden precargados
    appNavigate('pos', {
      state: {
        fromOrder: true,
        orderId: orderToClose.id,
        orderNumber: orderToClose.orderNumber,
        items: orderToClose.items,
        orderType: orderToClose.orderType,
        markAsPaidOnComplete: true,
      }
    })
    setShowCloseOrderModal(false)
    setOrderToClose(null)
  }

  const handleCloseWithoutReceipt = async () => {
    if (!orderToClose) return

    // Si no está pagada, exigir motivo
    if (!orderToClose.paid && !closeReason.trim()) {
      toast.error('Debes ingresar el motivo de cierre sin comprobante')
      return
    }

    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      setShowCloseOrderModal(false)
      setOrderToClose(null)
      setShowCloseWithoutReceipt(false)
      setCloseReason('')
      return
    }

    setIsClosingOrder(true)
    try {
      const businessId = getBusinessId()
      const result = await completeOrder(businessId, orderToClose.id)
      if (result.success) {
        // Registrar auditoría si fue cierre sin comprobante con motivo
        if (!orderToClose.paid && closeReason.trim()) {
          addDoc(collection(db, 'businesses', businessId, 'tableCloseWithoutReceipt'), {
            tableId: orderToClose.tableId || null,
            tableNumber: orderToClose.tableNumber || null,
            orderId: orderToClose.id,
            orderNumber: orderToClose.orderNumber || null,
            amount: orderToClose.total || 0,
            items: (orderToClose.items || []).map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
            reason: closeReason.trim(),
            closedBy: user.uid,
            closedByName: user.displayName || user.email || 'Usuario',
            createdAt: serverTimestamp(),
          }).catch(err => console.error('Error al registrar cierre sin comprobante:', err))
        }
        toast.success(`Orden #${orderToClose.orderNumber} cerrada exitosamente`)
      } else {
        toast.error('Error al cerrar la orden: ' + result.error)
      }
    } catch (error) {
      console.error('Error al cerrar orden sin comprobante:', error)
      toast.error('Error al cerrar la orden')
    } finally {
      setIsClosingOrder(false)
      setShowCloseOrderModal(false)
      setOrderToClose(null)
      setShowCloseWithoutReceipt(false)
      setCloseReason('')
    }
  }

  // Cobro Individual: abre modal para seleccionar items a cobrar
  const handleIndividualPayment = () => {
    setShowCloseOrderModal(false)
    setIsIndividualPaymentModalOpen(true)
  }

  const handleConfirmIndividualPayment = (selectedItems, remainingItems) => {
    if (!orderToClose) return
    appNavigate('pos', {
      state: {
        fromOrder: true,
        partialClose: true,
        orderId: orderToClose.id,
        orderNumber: orderToClose.orderNumber,
        orderType: orderToClose.orderType,
        tableId: orderToClose.tableId || null,
        tableNumber: orderToClose.tableNumber || null,
        items: selectedItems,
        remainingItems,
        waiterId: orderToClose.waiterId || null,
        waiterName: orderToClose.waiterName || null,
        markAsPaidOnComplete: true,
      },
    })
    setIsIndividualPaymentModalOpen(false)
  }

  // Construir objeto tipo "mesa" a partir de una orden (para reutilizar utilidades de precuenta)
  const getPseudoTable = (order) => {
    if (order.tableNumber) {
      return {
        id: order.tableId || null,
        number: order.tableNumber,
        waiter: order.waiterName || 'N/A',
      }
    }
    const typeLabel = order.orderType === 'delivery' ? 'DELIVERY' : 'PARA LLEVAR'
    return {
      id: null,
      number: typeLabel,
      waiter: order.waiterName || order.customerName || order.source || 'N/A',
    }
  }

  // Obtener información del negocio y configuración de impuestos/recargo
  const loadBusinessInfoForPreBill = async () => {
    const businessId = getBusinessId()
    const businessRef = doc(db, 'businesses', businessId)
    const businessSnap = await getDoc(businessRef)

    let businessInfo = { tradeName: 'RESTAURANTE', address: '', phone: '', logoUrl: '' }
    let taxConfig = { igvRate: 18, igvExempt: false }
    let recargoConsumoConfig = { enabled: false, rate: 10 }

    if (businessSnap.exists()) {
      const businessData = businessSnap.data()
      businessInfo = {
        tradeName: businessData.tradeName || businessData.name || 'RESTAURANTE',
        address: businessData.address || '',
        phone: businessData.phone || '',
        logoUrl: businessData.logoUrl || '',
      }
      if (businessData.emissionConfig?.taxConfig) {
        taxConfig = {
          igvRate: businessData.emissionConfig.taxConfig.igvRate ?? 18,
          igvExempt: businessData.emissionConfig.taxConfig.igvExempt ?? false,
        }
      }
      if (businessData.restaurantConfig) {
        recargoConsumoConfig = {
          enabled: businessData.restaurantConfig.recargoConsumoEnabled ?? false,
          rate: businessData.restaurantConfig.recargoConsumoRate ?? 10,
        }
      }
    }
    return { businessInfo, taxConfig, recargoConsumoConfig }
  }

  // Imprimir precuenta (completa o filtrada por items/override)
  const handlePrintPreBill = async (order, itemFilter = null, personLabel = null, overrideTotal = null) => {
    if (!order) {
      toast.error('No se puede imprimir: orden no encontrada')
      return
    }
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      const businessId = getBusinessId()

      // Leer orden fresca de Firestore cuando es precuenta completa
      let freshOrder = order
      if (!itemFilter && !overrideTotal) {
        const orderResult = await getOrder(businessId, order.id)
        if (orderResult.success) freshOrder = orderResult.data
      }

      const pseudoTable = getPseudoTable(freshOrder)

      // Snapshot de auditoría solo para precuenta completa
      if (!itemFilter && !overrideTotal) {
        savePrecuentaSnapshot(businessId, {
          orderId: freshOrder.id,
          tableNumber: pseudoTable.number,
          items: (freshOrder.items || []).map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
          total: freshOrder.total || 0,
          subtotal: freshOrder.subtotal || 0,
          tax: freshOrder.tax || 0,
          printedBy: user.uid,
          printedByName: user.displayName || user.email || 'Usuario',
        }).catch(err => console.error('Error al guardar snapshot de precuenta:', err))
      }

      const { businessInfo, taxConfig, recargoConsumoConfig } = await loadBusinessInfoForPreBill()
      const isNative = Capacitor.isNativePlatform()

      // Térmica solo para precuenta completa
      if (isNative && !itemFilter && !overrideTotal) {
        try {
          const printerConfigResult = await getPrinterConfig(businessId)
          if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
            await connectPrinter(printerConfigResult.config.address)
            const result = await printPreBillThermal(freshOrder, pseudoTable, businessInfo, taxConfig, printerConfigResult.config?.paperWidth || 58, recargoConsumoConfig)
            if (result.success) {
              toast.success('Precuenta impresa en ticketera')
              return
            }
            toast.info('Usando impresión estándar...')
          }
        } catch (error) {
          console.error('Error al imprimir en ticketera:', error)
          toast.info('Usando impresión estándar...')
        }
      }

      // Fallback HTML
      const printerConfigResult = await getPrinterConfig(businessId)
      const webPrintLegibleCfg = printerConfigResult.config?.webPrintLegible || false
      const paperWidth = printerConfigResult.config?.paperWidth || 80
      const compactPrintValue = printerConfigResult.config?.compactPrint || false
      printPreBill(pseudoTable, freshOrder, businessInfo, taxConfig, paperWidth, webPrintLegibleCfg, itemFilter, personLabel, recargoConsumoConfig, compactPrintValue, overrideTotal)
      toast.success('Imprimiendo precuenta...')
    } catch (error) {
      console.error('Error al imprimir precuenta:', error)
      toast.error('Error al imprimir precuenta')
    }
  }

  // Abrir modal para dividir cuenta
  const handleSplitBill = (order) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setSelectedOrderForAction(order)
    setIsSplitBillModalOpen(true)
  }

  // Confirmar división de cuenta (recibido desde SplitBillModal)
  const handleConfirmSplit = (splitDataResult) => {
    if (!selectedOrderForAction) return

    if (splitDataResult.method === 'items') {
      setSplitData(splitDataResult)
    } else if (splitDataResult.method === 'equal') {
      const amountPerPerson = splitDataResult.total / splitDataResult.numberOfPeople
      const persons = Array.from({ length: splitDataResult.numberOfPeople }, (_, i) => ({
        personNumber: i + 1,
        items: selectedOrderForAction?.items || [],
        total: amountPerPerson,
      }))
      setSplitData({ ...splitDataResult, persons })
    } else if (splitDataResult.method === 'custom') {
      const persons = splitDataResult.amounts.map((amount, i) => ({
        personNumber: i + 1,
        items: selectedOrderForAction?.items || [],
        total: amount,
      }))
      setSplitData({ ...splitDataResult, persons })
    }

    setIsSplitBillModalOpen(false)
    setIsPrintSplitModalOpen(true)
    toast.success(`Cuenta dividida entre ${splitDataResult.numberOfPeople} personas. Selecciona qué precuenta imprimir.`)
  }

  // Imprimir precuenta de una persona específica
  const handlePrintPersonPreBill = async (personData, totalPersons) => {
    if (!selectedOrderForAction || !splitData) return
    const isNative = Capacitor.isNativePlatform()
    const pseudoTable = getPseudoTable(selectedOrderForAction)

    if (isNative) {
      try {
        const businessId = getBusinessId()
        const { businessInfo, taxConfig, recargoConsumoConfig } = await loadBusinessInfoForPreBill()
        const printerConfigResult = await getPrinterConfig(businessId)
        const paperWidth = printerConfigResult.config?.paperWidth || 58

        if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
          await connectPrinter(printerConfigResult.config.address)
          const personIndex = splitData.persons.findIndex(p => p.personNumber === personData.personNumber)
          const { printSplitPreBillThermal } = await import('@/services/thermalPrinterService')
          const result = await printSplitPreBillThermal(selectedOrderForAction, pseudoTable, businessInfo, taxConfig, paperWidth, recargoConsumoConfig, splitData, personIndex)
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

    const personLabel = `Persona ${personData.personNumber} de ${totalPersons}`
    if (splitData?.method === 'items') {
      await handlePrintPreBill(selectedOrderForAction, personData.items, personLabel)
    } else {
      await handlePrintPreBill(selectedOrderForAction, null, personLabel, personData.total)
    }
  }

  // Imprimir todas las precuentas divididas
  const handlePrintAllSplitPreBills = async () => {
    if (!selectedOrderForAction || !splitData) return
    try {
      const businessId = getBusinessId()
      const pseudoTable = getPseudoTable(selectedOrderForAction)

      savePrecuentaSnapshot(businessId, {
        orderId: selectedOrderForAction.id,
        tableNumber: pseudoTable.number,
        items: (selectedOrderForAction.items || []).map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        total: selectedOrderForAction.total || 0,
        subtotal: selectedOrderForAction.subtotal || 0,
        tax: selectedOrderForAction.tax || 0,
        printedBy: user.uid,
        printedByName: user.displayName || user.email || 'Usuario',
      }).catch(err => console.error('Error al guardar snapshot de precuenta:', err))

      const { businessInfo, taxConfig, recargoConsumoConfig } = await loadBusinessInfoForPreBill()
      const printerConfigResult = await getPrinterConfig(businessId)
      const paperWidth = printerConfigResult.config?.paperWidth || 80
      const isNative = Capacitor.isNativePlatform()

      if (isNative && printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
        try {
          await connectPrinter(printerConfigResult.config.address)
          const { printSplitPreBillThermal } = await import('@/services/thermalPrinterService')
          const result = await printSplitPreBillThermal(selectedOrderForAction, pseudoTable, businessInfo, taxConfig, paperWidth, recargoConsumoConfig, splitData)
          if (result.success) {
            toast.success('Precuentas divididas impresas en ticketera')
            return
          }
        } catch (error) {
          console.error('Error al imprimir en térmica:', error)
          toast.info('Usando impresión estándar...')
        }
      }

      const webPrintLegibleCfg = printerConfigResult.config?.webPrintLegible || false
      const compactPrintValue = printerConfigResult.config?.compactPrint || false
      printAllSplitPreBills(pseudoTable, selectedOrderForAction, splitData, businessInfo, taxConfig, paperWidth, webPrintLegibleCfg, recargoConsumoConfig, compactPrintValue)
      toast.success('Imprimiendo precuentas divididas...')
    } catch (error) {
      console.error('Error al imprimir precuentas divididas:', error)
      toast.error('Error al imprimir precuentas divididas')
    }
  }

  const handleStatusChange = async (orderId, currentStatus, order) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    // Definir el siguiente estado
    const statusFlow = {
      pending: 'preparing',
      preparing: 'ready',
      ready: 'dispatched',
      dispatched: 'delivered',
    }

    const nextStatus = statusFlow[currentStatus]
    if (!nextStatus) return

    // Validar pago antes de enviar a cocina si está configurado
    if (currentStatus === 'pending' && nextStatus === 'preparing' && requirePaymentBeforeKitchen) {
      if (!order?.paid) {
        toast.error('Esta orden debe estar pagada antes de enviarla a cocina')
        return
      }
    }

    setUpdatingOrderId(orderId)
    try {
      const result = await updateOrderStatus(getBusinessId(), orderId, nextStatus)
      if (result.success) {
        toast.success(`Orden actualizada a ${getStatusConfig(nextStatus).label}`)

        // Auto-imprimir a estaciones cuando se envía a cocina
        if (currentStatus === 'pending' && nextStatus === 'preparing' && autoPrintByStation && kitchenStations.length > 0) {
          const stationsWithPrinter = kitchenStations.filter(s => s.printerIp)
          if (stationsWithPrinter.length > 0) {
            toast.info('Imprimiendo comandas en estaciones...')
            try {
              const printResults = await printToAllStations(order, kitchenStations)
              const successCount = printResults.filter(r => r.success).length
              if (successCount > 0) {
                toast.success(`Comandas impresas en ${successCount} estación(es)`)
              }
              const failedStations = printResults.filter(r => !r.success)
              if (failedStations.length > 0) {
                console.warn('Estaciones con error de impresión:', failedStations)
              }
            } catch (printError) {
              console.error('Error al imprimir a estaciones:', printError)
              // No mostrar error al usuario ya que la orden se actualizó correctamente
            }
          }
        }
      } else {
        toast.error('Error al actualizar orden: ' + result.error)
      }
    } catch (error) {
      console.error('Error al actualizar orden:', error)
      toast.error('Error al actualizar orden')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  const handleMarkAsPaid = async (orderId) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      const result = await markOrderAsPaid(getBusinessId(), orderId)
      if (result.success) {
        toast.success('Orden marcada como pagada')
      } else {
        toast.error('Error al marcar orden como pagada: ' + result.error)
      }
    } catch (error) {
      console.error('Error al marcar orden como pagada:', error)
      toast.error('Error al marcar orden como pagada')
    }
  }

  const handleAssignDeliveryPerson = async (orderId, deliveryPersonId) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    const deliveryPerson = deliveryPersons.find(p => p.id === deliveryPersonId)
    const order = orders.find(o => o.id === orderId)

    try {
      const businessId = getBusinessId()
      const result = await updateOrder(businessId, orderId, {
        deliveryPersonId: deliveryPersonId || null,
        deliveryPersonName: deliveryPerson?.name || null,
        deliveryPersonPhone: deliveryPerson?.phone || null,
      })
      if (result.success) {
        toast.success(deliveryPerson ? `Repartidor ${deliveryPerson.name} asignado` : 'Repartidor removido')

        // Crear delivery record y actualizar estado operacional si se asignó un motorista
        if (deliveryPerson && order) {
          createDeliveryRecord(businessId, {
            motoristaId: deliveryPerson.id,
            motoristaName: deliveryPerson.name,
            orderId: orderId,
            orderNumber: order.orderNumber || '',
            customerName: order.customerName || '',
            customerAddress: order.customerAddress || '',
            amount: order.total || 0,
            deliveryFee: order.deliveryFee || 0,
            paymentMethod: order.paymentMethod || 'cash',
            cashCollected: order.paymentMethod === 'cash' || order.paymentMethod === 'efectivo' ? (order.total || 0) : 0,
            status: 'assigned',
          }).catch(err => console.error('Error creando delivery record:', err))

          updateOperationalStatus(businessId, deliveryPerson.id, 'on_delivery')
            .catch(err => console.error('Error actualizando estado operacional:', err))
        }
      } else {
        toast.error('Error al asignar repartidor: ' + result.error)
      }
    } catch (error) {
      console.error('Error al asignar repartidor:', error)
      toast.error('Error al asignar repartidor')
    }
  }

  // Ir al POS para cobrar una orden
  const handleGoToPayment = (order) => {
    appNavigate('pos', {
      state: {
        fromOrder: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        items: order.items,
        orderType: order.orderType,
        markAsPaidOnComplete: true, // Flag para marcar como pagada al completar
        // Si la orden está asociada a una mesa, pasar info para que se libere automáticamente
        // al completar el pago (restaura comportamiento previo: Cobrar libera la mesa).
        tableId: order.tableId || null,
        tableNumber: order.tableNumber || null,
        waiterId: order.waiterId || null,
        waiterName: order.waiterName || null,
      }
    })
  }

  // Marcar orden como entregada (quita de la lista activa).
  // Si la orden no está cobrada, NO se permite marcar como entregada directamente: se obliga
  // a pasar por CloseOrderModal (con comprobante / sin comprobante con razón auditable),
  // igual que en la página de mesas. Evita que se cierren órdenes sin cobrar.
  const handleMarkAsDelivered = async (order) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    if (!order?.paid) {
      handleCloseOrder(order)
      return
    }

    try {
      const result = await updateOrderStatus(getBusinessId(), order.id, 'delivered')
      if (result.success) {
        toast.success('Orden marcada como entregada')
      } else {
        toast.error('Error al actualizar orden: ' + result.error)
      }
    } catch (error) {
      console.error('Error al marcar orden como entregada:', error)
      toast.error('Error al actualizar orden')
    }
  }

  const calculateElapsedTime = (createdAt) => {
    if (!createdAt) return '0 min'

    const orderDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt)
    const now = new Date()
    const diffMs = now - orderDate
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 60) {
      return `${diffMins} min`
    } else {
      const hours = Math.floor(diffMins / 60)
      const mins = diffMins % 60
      return `${hours}h ${mins}min`
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return '--:--'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  }

  const getStatusConfig = (status) => {
    switch (status) {
      case 'pending':
        return {
          label: 'Pendiente',
          variant: 'warning',
          icon: Clock,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50 border-yellow-200',
        }
      case 'preparing':
        return {
          label: 'En Preparación',
          variant: 'default',
          icon: AlertCircle,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50 border-blue-200',
        }
      case 'ready':
        return {
          label: 'Lista',
          variant: 'success',
          icon: CheckCircle,
          color: 'text-green-600',
          bgColor: 'bg-green-50 border-green-200',
        }
      case 'dispatched':
        return {
          label: 'Despachada',
          variant: 'info',
          icon: Truck,
          color: 'text-purple-600',
          bgColor: 'bg-purple-50 border-purple-200',
        }
      case 'delivered':
        return {
          label: 'Entregada',
          variant: 'secondary',
          icon: CheckCircle,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50 border-gray-200',
        }
      default:
        return {
          label: status,
          variant: 'default',
          icon: AlertCircle,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50 border-gray-200',
        }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando órdenes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" style={{ transform: 'scale(0.7)', transformOrigin: 'top left', width: '142.86%' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ListOrdered className="w-7 h-7" />
            Órdenes Activas
          </h1>
          <p className="text-gray-600 mt-1">Monitorea las órdenes en tiempo real</p>
        </div>
        <Button onClick={handleCreateOrderClick} size="lg" className="w-full md:w-auto">
          <Plus className="w-5 h-5 mr-2" />
          Nueva Orden
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Órdenes Activas</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{orders.length}</p>
              </div>
              <ListOrdered className="w-10 h-10 text-gray-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-600 mt-2">
                  {stats?.pending || 0}
                </p>
              </div>
              <Clock className="w-10 h-10 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En Preparación</p>
                <p className="text-2xl font-bold text-blue-600 mt-2">
                  {stats?.preparing || 0}
                </p>
              </div>
              <AlertCircle className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ventas Hoy</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  S/ {(stats?.totalSalesToday || 0).toFixed(2)}
                </p>
              </div>
              <DollarSign className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtro por marca */}
      {brands.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedBrandFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              selectedBrandFilter === 'all'
                ? 'bg-gray-800 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todas ({orders.length})
          </button>
          {brands.map((brand) => {
            const count = orders.filter(o => o.brandId === brand.id).length
            return (
              <button
                key={brand.id}
                onClick={() => setSelectedBrandFilter(brand.id)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                  selectedBrandFilter === brand.id
                    ? 'text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={selectedBrandFilter === brand.id ? { backgroundColor: brand.color || '#8B5CF6' } : {}}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: brand.color || '#8B5CF6' }}
                />
                {brand.name} ({count})
              </button>
            )
          })}
          <button
            onClick={() => setSelectedBrandFilter('none')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              selectedBrandFilter === 'none'
                ? 'bg-gray-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Sin marca ({orders.filter(o => !o.brandId).length})
          </button>
        </div>
      )}

      {/* Lista de Órdenes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {orders.length === 0 ? (
          <div className="col-span-full">
            <Card>
              <CardContent className="py-12 text-center">
                <ListOrdered className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay órdenes activas</h3>
                <p className="text-gray-600">
                  Las órdenes aparecerán aquí cuando se ocupen las mesas
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          orders
          .filter(order => {
            if (selectedBrandFilter === 'all') return true
            if (selectedBrandFilter === 'none') return !order.brandId
            return order.brandId === selectedBrandFilter
          })
          .map((order) => {
            const statusConfig = getStatusConfig(order.status)
            const StatusIcon = statusConfig.icon
            const elapsed = calculateElapsedTime(order.createdAt)
            const isUpdating = updatingOrderId === order.id
            const isUrgent = order.priority === 'urgent'

            return (
              <Card key={order.id} className={`border-2 ${isUrgent ? 'border-red-500 bg-red-50' : statusConfig.bgColor}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-lg">{order.orderNumber || '#' + order.id.slice(-6)}</span>
                      {isUrgent && (
                        <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
                          URGENTE
                        </span>
                      )}
                      {requirePaymentBeforeKitchen && (
                        order.paid ? (
                          <span className="px-2 py-0.5 bg-green-600 text-white text-xs font-bold rounded-full flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            PAGADO
                          </span>
                        ) : order.status === 'pending' ? (
                          <span className="px-2 py-0.5 bg-yellow-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            PAGO PENDIENTE
                          </span>
                        ) : null
                      )}
                      {order.brandName && (
                        <span
                          className="px-2 py-0.5 text-white text-xs font-bold rounded-full"
                          style={{ backgroundColor: order.brandColor || '#8B5CF6' }}
                        >
                          {order.brandName}
                        </span>
                      )}
                      <Badge variant={statusConfig.variant} className="flex items-center gap-1">
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${statusConfig.color}`}>
                        {elapsed}
                      </span>
                      {order.status !== 'delivered' && !order.tableNumber && (
                        <Button
                          onClick={() => {
                            setOrderToEdit(order)
                            setShowEditOrderModal(true)
                          }}
                          variant="outline"
                          size="sm"
                          className="p-1.5"
                          title="Editar orden"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        onClick={() => handlePrintKitchenTicket(order)}
                        variant="outline"
                        size="sm"
                        className="p-1.5"
                        title="Imprimir Comanda"
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Info de Mesa/Tipo y Mozo/Fuente */}
                  <div className="flex items-center justify-between text-sm pb-3 border-b border-gray-200">
                    {order.tableNumber ? (
                      <div className="flex items-center gap-2">
                        <div className="bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center font-bold text-gray-700">
                          {order.tableNumber}
                        </div>
                        <span className="text-gray-600">Mesa {order.tableNumber}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {order.orderType === 'delivery' ? (
                          <Bike className="w-4 h-4 text-blue-600" />
                        ) : (
                          <ShoppingBag className="w-4 h-4 text-green-600" />
                        )}
                        <span className="text-gray-600">
                          {order.orderType === 'delivery' ? 'Delivery' : 'Para Llevar'}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-gray-600">
                      {order.waiterName ? (
                        <>
                          <Users className="w-4 h-4" />
                          <span>{order.waiterName}</span>
                        </>
                      ) : order.source ? (
                        <>
                          <Smartphone className="w-4 h-4" />
                          <span>{order.source}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Nombre del cliente si existe */}
                  {order.customerName && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 pb-2">
                      <User className="w-4 h-4" />
                      <span>{order.customerName}</span>
                      {order.customerPhone && (
                        <span className="text-gray-400">• {order.customerPhone}</span>
                      )}
                    </div>
                  )}

                  {/* Selector de repartidor para delivery */}
                  {order.orderType === 'delivery' && deliveryPersons.length > 0 && (
                    <div className="flex items-center gap-2 text-sm pb-2 border-b border-gray-200 mb-2">
                      <Bike className="w-4 h-4 text-blue-600" />
                      <span className="text-gray-600">Repartidor:</span>
                      <select
                        value={order.deliveryPersonId || ''}
                        onChange={(e) => handleAssignDeliveryPerson(order.id, e.target.value)}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Sin asignar</option>
                        {deliveryPersons.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}{person.operationalStatus ? ` (${person.operationalStatus === 'available' ? '✓' : person.operationalStatus === 'on_delivery' ? '🚗' : person.operationalStatus === 'break' ? '☕' : '⭘'})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Mostrar repartidor asignado cuando hay pocos repartidores */}
                  {order.orderType === 'delivery' && order.deliveryPersonName && deliveryPersons.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 pb-2">
                      <Bike className="w-4 h-4" />
                      <span>Repartidor: {order.deliveryPersonName}</span>
                    </div>
                  )}

                  {/* Items */}
                  <div className="space-y-2">
                    {(order.items || []).map((item, idx) => {
                      const itemStatus = item.status || 'pending'
                      return (
                        <div key={item.itemId || idx} className="space-y-1">
                          <div className="flex justify-between text-sm items-start">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-gray-700">
                                {item.quantity}x {item.name}
                              </span>
                              {/* Badge de estado del item - Solo si itemStatusTracking está habilitado */}
                              {itemStatusTracking && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white ${
                                  itemStatus === 'delivered' ? 'bg-gray-600' :
                                  itemStatus === 'ready' ? 'bg-green-600' :
                                  itemStatus === 'preparing' ? 'bg-blue-600' :
                                  'bg-yellow-600'
                                }`}>
                                  {itemStatus === 'delivered' ? '✓ Entregado' :
                                   itemStatus === 'ready' ? '● Listo' :
                                   itemStatus === 'preparing' ? '⚡ Preparando' :
                                   '○ Pendiente'}
                                </span>
                              )}
                            </div>
                            <span className="font-medium text-gray-900">
                              S/ {(item.total || 0).toFixed(2)}
                            </span>
                          </div>

                        {/* Mostrar modificadores si existen */}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="ml-6 bg-primary-50 border border-primary-200 rounded px-2 py-1.5 space-y-1">
                            <div className="text-xs font-semibold text-primary-900 uppercase">
                              Modificadores:
                            </div>
                            {item.modifiers.map((modifier, modIdx) => (
                              <div key={modIdx} className="text-xs text-primary-800">
                                <span className="font-medium">• {modifier.modifierName}:</span>
                                <span className="ml-1">
                                  {modifier.options.map((opt, optIdx) => (
                                    <span key={optIdx}>
                                      {opt.optionName}
                                      {opt.priceAdjustment > 0 && ` (+S/ ${opt.priceAdjustment.toFixed(2)})`}
                                      {optIdx < modifier.options.length - 1 && ', '}
                                    </span>
                                  ))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {item.notes && (
                          <div className="flex items-start gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded ml-6">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            <span>{item.notes}</span>
                          </div>
                        )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Total */}
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">TOTAL</span>
                    <span className="text-lg font-bold text-gray-900">
                      S/ {(order.total || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Hora de inicio */}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>Iniciada a las {formatTime(order.createdAt)}</span>
                  </div>

                  {/* Mostrar hora de despacho si existe */}
                  {order.dispatchedAt && (
                    <div className="flex items-center gap-2 text-xs text-purple-600 mt-2">
                      <Truck className="w-3 h-3" />
                      <span>Despachada a las {formatTime(order.dispatchedAt)}</span>
                    </div>
                  )}

                  {/* Botones de acción: primario + Cobrar + menú "+" */}
                  <div className="mt-3 flex gap-2 items-stretch">
                    {/* Botón primario según estado */}
                    {order.status === 'pending' && (
                      <Button
                        onClick={() => handleStatusChange(order.id, 'pending', order)}
                        disabled={isUpdating || (requirePaymentBeforeKitchen && !order.paid)}
                        size="sm"
                        className="flex-1"
                      >
                        {isUpdating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <ChevronRight className="w-4 h-4 mr-1" />
                            En Preparación
                          </>
                        )}
                      </Button>
                    )}
                    {order.status === 'preparing' && (
                      <Button
                        onClick={() => handleStatusChange(order.id, 'preparing', order)}
                        disabled={isUpdating}
                        size="sm"
                        className="flex-1"
                      >
                        {isUpdating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Marcar Lista
                          </>
                        )}
                      </Button>
                    )}
                    {order.status === 'ready' && order.tableNumber && (
                      <Button
                        onClick={() => handleCloseOrder(order)}
                        variant="success"
                        size="sm"
                        className="flex-1"
                      >
                        <Receipt className="w-4 h-4 mr-1" />
                        Cerrar Cuenta
                      </Button>
                    )}
                    {order.status === 'ready' && !order.tableNumber && (
                      <Button
                        onClick={() => handleStatusChange(order.id, 'ready', order)}
                        disabled={isUpdating}
                        size="sm"
                        variant="outline"
                        className="flex-1 border-purple-500 text-purple-600 hover:bg-purple-50"
                      >
                        {isUpdating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <PackageCheck className="w-4 h-4 mr-1" />
                            Despachar
                          </>
                        )}
                      </Button>
                    )}
                    {order.status === 'dispatched' && (
                      <Button
                        onClick={() => handleMarkAsDelivered(order)}
                        variant="success"
                        size="sm"
                        className="flex-1"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Marcar Entregada
                      </Button>
                    )}

                    {/* Cobrar (si no pagada) */}
                    {!order.paid && order.status !== 'delivered' && (
                      <Button
                        onClick={() => handleGoToPayment(order)}
                        variant="outline"
                        size="sm"
                        className="flex-1 border-green-500 text-green-600 hover:bg-green-50"
                      >
                        <DollarSign className="w-4 h-4 mr-1" />
                        Cobrar
                      </Button>
                    )}

                    {/* Menú "+" con acciones secundarias */}
                    <div className="relative">
                      <Button
                        onClick={() => setOpenMenuOrderId(openMenuOrderId === order.id ? null : order.id)}
                        variant="outline"
                        size="sm"
                        className="px-3"
                        title="Más acciones"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>

                      {openMenuOrderId === order.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuOrderId(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 overflow-hidden min-w-[200px]">
                            <button
                              onClick={() => {
                                setOpenMenuOrderId(null)
                                handlePrintPreBill(order)
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3"
                            >
                              <FileText className="w-4 h-4 text-gray-600" />
                              <span className="font-medium text-gray-900">Imprimir Precuenta</span>
                            </button>
                            <button
                              onClick={() => {
                                setOpenMenuOrderId(null)
                                handleSplitBill(order)
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3"
                            >
                              <Split className="w-4 h-4 text-gray-600" />
                              <span className="font-medium text-gray-900">Dividir Cuenta</span>
                            </button>
                            {/* Cerrar Cuenta secundario: en ready sin mesa (delivery/takeout), por si se necesita cerrar sin despachar */}
                            {order.status === 'ready' && !order.tableNumber && (
                              <button
                                onClick={() => {
                                  setOpenMenuOrderId(null)
                                  handleCloseOrder(order)
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 flex items-center gap-3 border-t border-gray-100"
                              >
                                <Receipt className="w-4 h-4 text-green-600" />
                                <span className="font-medium text-gray-900">Cerrar Cuenta</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Modal para crear nueva orden */}
      <CreateOrderModal
        isOpen={showCreateOrderModal}
        onClose={() => setShowCreateOrderModal(false)}
        onConfirm={handleOrderTypeSelected}
        brands={brands}
      />

      {/* Modal para agregar items a la orden */}
      {showOrderItemsModal && newOrderData && (
        <OrderItemsModal
          isOpen={showOrderItemsModal}
          onClose={() => {
            setShowOrderItemsModal(false)
            setNewOrderData(null)
          }}
          table={{ number: newOrderData.orderType === 'delivery' ? 'Delivery' : 'Para Llevar' }}
          order={{ id: 'temp', items: [] }}
          onSuccess={() => {
            // Este callback se ejecutará después de que OrderItemsModal llame a addOrderItems
            // Pero nosotros lo interceptaremos
          }}
          isNewOrder={true}
          newOrderData={newOrderData}
          onSaveNewOrder={handleOrderItemsAdded}
        />
      )}

      {/* Modal para editar items de una orden */}
      <EditOrderItemsModal
        isOpen={showEditOrderModal}
        onClose={() => {
          setShowEditOrderModal(false)
          setOrderToEdit(null)
        }}
        table={orderToEdit?.tableNumber ? { number: orderToEdit.tableNumber } : { number: orderToEdit?.orderType === 'delivery' ? 'Delivery' : 'Para Llevar' }}
        order={orderToEdit}
        onSuccess={() => {
          setShowEditOrderModal(false)
          setOrderToEdit(null)
        }}
      />

      {/* Comanda para imprimir (oculta, fuera de pantalla para react-to-print) */}
      {orderToPrint && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={kitchenTicketRef} className={enableKitchenStations && kitchenStations.length > 0 ? 'kitchen-multi-ticket' : undefined}>
            {enableKitchenStations && kitchenStations.length > 0 ? (() => {
              // Helper: matchear categoría de item con categorías de estación
              // Soporta nombres e IDs en ambos lados (igual que Kitchen.jsx)
              const itemMatchesStation = (itemCategory, stationCategories) => {
                if (!itemCategory || !stationCategories || stationCategories.length === 0) return false
                if (stationCategories.includes(itemCategory)) return true
                // item.category es un ID → buscar su nombre y comparar
                const itemCatName = categoryMap[itemCategory]
                if (itemCatName && stationCategories.includes(itemCatName)) return true
                // station.categories tiene IDs → buscar sus nombres y comparar
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

              // Items huérfanos (categoría no asignada a ninguna estación)
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
                    compactPrint={compactPrint}
                    ultraCompactKitchen={ultraCompactKitchen}
                    simplePrint={simplePrint}
                    stationName={ticket.name}
                  />
                </div>
              ))
            })() : (
              <KitchenTicket
                order={orderToPrint}
                companySettings={companySettings}
                webPrintLegible={webPrintLegible}
                compactPrint={compactPrint}
                ultraCompactKitchen={ultraCompactKitchen}
                simplePrint={simplePrint}
              />
            )}
          </div>
        </div>
      )}

      {/* Modal para cerrar orden */}
      <Modal
        isOpen={showCloseOrderModal}
        onClose={() => {
          setShowCloseOrderModal(false)
          setOrderToClose(null)
          setShowCloseWithoutReceipt(false)
          setCloseReason('')
        }}
        title={`Cerrar Cuenta - Orden #${orderToClose?.orderNumber || ''}`}
        size="lg"
      >
        {orderToClose && (
          <div className="space-y-6">
            {/* Resumen de la cuenta */}
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-700 font-medium">Total a Cobrar:</span>
                <span className="text-3xl font-bold text-primary-600">
                  S/ {(orderToClose.total || 0).toFixed(2)}
                </span>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Tipo de orden:</span>
                  <span className="capitalize">{orderToClose.orderType === 'delivery' ? 'Delivery' : orderToClose.orderType === 'takeout' ? 'Para llevar' : orderToClose.orderType}</span>
                </div>
                <div className="flex justify-between">
                  <span>Items:</span>
                  <span>{orderToClose.items?.length || 0} producto(s)</span>
                </div>
              </div>
            </div>

            {/* Opciones de cierre */}
            {orderToClose.paid ? (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800">Esta orden ya fue cobrada</p>
                      <p className="text-sm text-green-700">El comprobante ya fue generado desde la opción Cobrar.</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCloseOrderModal(false)
                      setOrderToClose(null)
                    }}
                    className="flex-1"
                    disabled={isClosingOrder}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCloseWithoutReceipt}
                    disabled={isClosingOrder}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {isClosingOrder ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cerrando...
                      </>
                    ) : (
                      'Cerrar Orden'
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    ¿Cómo desea cerrar la cuenta?
                  </label>
                  <div className="space-y-2">
                    <button
                      onClick={handleCloseWithReceipt}
                      className="w-full flex items-center gap-3 p-3 border-2 border-primary-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
                    >
                      <ShoppingCart className="w-8 h-8 flex-shrink-0 text-primary-600" />
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">Crear Comprobante</div>
                        <div className="text-xs text-gray-500">Ir al POS para generar Boleta, Factura o Nota de Venta</div>
                      </div>
                    </button>
                    <button
                      onClick={handleIndividualPayment}
                      className="w-full flex items-center gap-3 p-3 border-2 border-orange-200 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-colors text-left"
                    >
                      <UserMinus className="w-8 h-8 flex-shrink-0 text-orange-600" />
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">Cobro Individual</div>
                        <div className="text-xs text-gray-500">Cobrar items parciales, orden sigue abierta</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Confirmación de cerrar sin comprobante */}
                {showCloseWithoutReceipt && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-800">Cerrar sin comprobante</p>
                        <p className="text-xs text-red-600 mt-0.5">Esta acción quedará registrada. Ingrese el motivo:</p>
                      </div>
                    </div>
                    <Input
                      placeholder="Ej: Cortesía, error en pedido, cliente se fue..."
                      value={closeReason}
                      onChange={e => setCloseReason(e.target.value)}
                      required
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setShowCloseWithoutReceipt(false); setCloseReason('') }}
                        className="flex-1"
                        disabled={isClosingOrder}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCloseWithoutReceipt}
                        disabled={isClosingOrder || !closeReason.trim()}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                      >
                        {isClosingOrder ? 'Cerrando...' : 'Confirmar'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Footer: Cancelar + link sutil */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setShowCloseWithoutReceipt(!showCloseWithoutReceipt)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    disabled={isClosingOrder}
                  >
                    Cerrar sin comprobante
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCloseOrderModal(false)
                      setOrderToClose(null)
                      setShowCloseWithoutReceipt(false)
                      setCloseReason('')
                    }}
                    size="sm"
                    disabled={isClosingOrder}
                  >
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Modal para cobro individual (parcial) */}
      <IndividualPaymentModal
        isOpen={isIndividualPaymentModalOpen}
        onClose={() => {
          setIsIndividualPaymentModalOpen(false)
          setShowCloseOrderModal(true)
        }}
        table={orderToClose ? getPseudoTable(orderToClose) : null}
        order={orderToClose}
        onConfirm={handleConfirmIndividualPayment}
      />

      {/* Modal para dividir la cuenta */}
      <SplitBillModal
        isOpen={isSplitBillModalOpen}
        onClose={() => {
          setIsSplitBillModalOpen(false)
          // No reseteamos selectedOrderForAction: el PrintSplitModal lo necesita tras confirmar.
          // El reset ocurre al cerrar el PrintSplitModal.
        }}
        table={selectedOrderForAction ? getPseudoTable(selectedOrderForAction) : null}
        order={selectedOrderForAction}
        onConfirm={handleConfirmSplit}
      />

      {/* Modal para imprimir precuenta dividida */}
      <Modal
        isOpen={isPrintSplitModalOpen}
        onClose={() => {
          setIsPrintSplitModalOpen(false)
          setSplitData(null)
          setSelectedOrderForAction(null)
        }}
        title={
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span>Imprimir Precuentas - Orden #{selectedOrderForAction?.orderNumber || ''}</span>
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
              onClick={() => handlePrintPreBill(selectedOrderForAction)}
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
                setSelectedOrderForAction(null)
              }}
              className="flex-1"
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
