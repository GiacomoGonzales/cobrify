// Carrito lateral + checkout del catálogo público, modal de cuenta de mesa y
// tipos de orden (mesa/llevar/delivery). Crea pedidos REALES en
// businesses/{id}/orders (source 'menu_digital') y arma el mensaje de WhatsApp.
// Extraído de CatalogoPublico.jsx (F1.3 del plan de rediseño) SIN cambios de
// lógica; solo se hicieron explícitos los imports.
import { useState, useEffect } from 'react'
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getCatalogAccent } from '@/themes/catalogThemes'
import { optimizeImageUrl } from '@/utils/cloudinary'
import { formatCurrency } from '@/lib/utils'
import { convertFromBase, normalizeCurrency } from '@/utils/currency'
import {
  getShortUnitLabel,
  formatQty,
  isBusinessOpen,
} from '@/components/catalog/catalogHelpers'
import {
  X,
  Plus,
  Minus,
  Trash2,
  MessageCircle,
  Phone,
  MapPin,
  Package,
  Loader2,
  UtensilsCrossed,
  ShoppingCart,
  ShoppingBag,
  Bike,
  Navigation,
  User,
  Hash,
  CheckCircle2,
  AlertCircle,
  Info,
  Mail,
} from 'lucide-react'

// Tipos de orden para restaurante
export const ORDER_TYPES = [
  { id: 'dine_in', label: 'Para mesa', icon: UtensilsCrossed, color: 'emerald' },
  { id: 'takeaway', label: 'Para llevar', icon: ShoppingCart, color: 'blue' },
  { id: 'delivery', label: 'Delivery', icon: Bike, color: 'orange' },
]

// Modal de cuenta activa de la mesa
export function TableAccountModal({ isOpen, onClose, activeTableOrder, business, onAddMore }) {
  if (!isOpen || !activeTableOrder) return null

  const color = getCatalogAccent(business)

  // Multi-divisa: la orden ya tiene items[].total y total en su propia moneda
  // (PEN o USD). Solo formatear; no convertir.
  const orderCurrency = normalizeCurrency(activeTableOrder.currency || 'PEN')
  const fmtOrder = (v) => formatCurrency(v, orderCurrency)

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300"
        onClick={onClose}
      />
      <div className="fixed inset-x-4 top-[10%] bottom-[10%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md bg-white z-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 text-white rounded-t-2xl" style={{ backgroundColor: color }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5" />
              <h2 className="text-lg font-bold">Tu cuenta</h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center justify-between text-sm opacity-90">
            <span>Mesa {activeTableOrder.items?.[0]?.tableNumber || ''} • Orden {activeTableOrder.orderNumber}</span>
            {activeTableOrder.waiter && <span>Mozo: {activeTableOrder.waiter}</span>}
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">Productos ordenados</p>
          <div className="space-y-3">
            {activeTableOrder.items.map((item, idx) => (
              <div key={item.itemId || idx} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-gray-600">{formatQty(item.quantity)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm">{item.name}</span>
                    {item.source === 'menu_digital' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">QR</span>
                    )}
                  </div>
                  {item.modifiers?.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.modifiers.map(m => m.options?.map(o => o.quantity > 1 ? `${o.quantity}x ${o.optionName}` : o.optionName).join(', ')).join(' • ')}
                    </p>
                  )}
                  {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
                </div>
                <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                  {fmtOrder(item.total)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer con total y botón */}
        <div className="p-5 border-t bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <span className="text-base font-bold text-gray-900">Total</span>
            <span className="text-xl font-bold" style={{ color }}>{fmtOrder(activeTableOrder.total)}</span>
          </div>
          <button
            onClick={() => { onClose(); onAddMore() }}
            className="w-full py-3.5 text-white rounded-xl font-semibold transition-opacity hover:opacity-80 flex items-center justify-center gap-2"
            style={{ backgroundColor: color }}
          >
            <Plus className="w-5 h-5" />
            Agregar más productos
          </button>
        </div>
      </div>
    </>
  )
}

// Carrito lateral
export default function CartDrawer({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemove,
  business,
  onCheckout,
  showPrices = true,
  isRestaurantMenu = false,
  tableNumber: initialTableNumber = '',
  activeTableOrder = null,
  onOrderAdded = null,
  catalogCurrency = 'PEN',
  catalogExchangeRate = 1,
}) {
  // Helpers de moneda del catálogo. Los precios en `cart` están en PEN
  // del catálogo (source of truth). Convertimos y formateamos para display.

  // Multi-divisa: precio unitario del item en la moneda del catálogo.
  // Si el item tiene fixedPriceUSD (producto con priceUSD definido) y
  // el catálogo es USD, devolvemos ese precio directamente sin TC.
  // En otro caso, convertimos el unitPrice (PEN) con TC.
  const itemUnitInCatalogCcy = (item) => {
    const fixedUSD = Number(item.fixedPriceUSD)
    if (catalogCurrency === 'USD' && Number.isFinite(fixedUSD) && fixedUSD > 0) {
      return fixedUSD
    }
    const penPrice = Number(item.unitPrice || item.price) || 0
    if (catalogCurrency === 'PEN') return penPrice
    return Number(convertFromBase(penPrice, 'USD', catalogExchangeRate || 1).toFixed(2))
  }
  // Línea formateada en la moneda del catálogo (price * quantity).
  const fmtCartLine = (item) => formatCurrency(itemUnitInCatalogCcy(item) * item.quantity, catalogCurrency)
  // Precio unitario formateado en la moneda del catálogo.
  const fmtCartUnit = (item) => formatCurrency(itemUnitInCatalogCcy(item), catalogCurrency)

  // Total en moneda del catálogo: suma cada línea ya convertida (USD si
  // catálogo es USD, sumando fixedPriceUSD * qty para items con priceUSD).
  const totalInCatalogCcy = cart.reduce(
    (sum, item) => sum + itemUnitInCatalogCcy(item) * item.quantity,
    0
  )
  // Estados para modo restaurante / tienda virtual retail
  // Retail: siempre 'delivery' (siempre pide dirección, no hay toggle)
  const defaultOrderType = isRestaurantMenu
    ? (initialTableNumber ? 'dine_in'
      : (business?.catalogAllowTakeaway !== false ? 'takeaway' : business?.catalogAllowDelivery !== false ? 'delivery' : 'takeaway'))
    : 'delivery'
  const [orderType, setOrderType] = useState(defaultOrderType)
  const [tableNumber, setTableNumber] = useState(initialTableNumber)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerCoords, setCustomerCoords] = useState(null)
  const [customerEmail, setCustomerEmail] = useState('')
  const [gettingLocation, setGettingLocation] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')
  const [orderError, setOrderError] = useState('')
  const [orderConfirmItems, setOrderConfirmItems] = useState([])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      // Reset success state when opening
      if (!orderSuccess) {
        setOrderError('')
      }
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, orderSuccess])

  // Precargar info del cliente guardada en este dispositivo (por negocio)
  // — evita que tenga que escribir nombre/tel/dirección en cada pedido.
  useEffect(() => {
    if (!isOpen || !business?.id) return
    try {
      const saved = localStorage.getItem(`catalog_customer_${business.id}`)
      if (!saved) return
      const data = JSON.parse(saved)
      if (!customerName && data.customerName) setCustomerName(data.customerName)
      if (!customerPhone && data.customerPhone) setCustomerPhone(data.customerPhone)
      if (!customerEmail && data.customerEmail) setCustomerEmail(data.customerEmail)
      if (!customerAddress && data.customerAddress) setCustomerAddress(data.customerAddress)
      if (!customerCoords && data.customerCoords) setCustomerCoords(data.customerCoords)
    } catch (e) {
      console.warn('No se pudo cargar info guardada del cliente:', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, business?.id])

  // Resetear formulario cuando se cierra
  useEffect(() => {
    if (!isOpen && orderSuccess) {
      setTimeout(() => {
        setOrderSuccess(false)
        setOrderNumber('')
        setOrderConfirmItems([])
        setOrderType(defaultOrderType)
        setTableNumber(initialTableNumber)
        setCustomerName('')
        setCustomerPhone('')
        setCustomerAddress('')
        setCustomerCoords(null)
        setCustomerEmail('')
        setNotes('')
      }, 300)
    }
  }, [isOpen, orderSuccess, initialTableNumber])

  // Obtener siguiente número de orden
  const getDailyOrderNumber = async (businessId) => {
    try {
      const today = new Date()
      const dateKey = today.toISOString().split('T')[0]
      const counterRef = doc(db, 'businesses', businessId, 'counters', `orders-${dateKey}`)
      const counterSnap = await getDoc(counterRef)

      let orderNum = 1
      if (counterSnap.exists()) {
        orderNum = (counterSnap.data().lastNumber || 0) + 1
      }
      if (orderNum > 999) orderNum = 1

      await setDoc(counterRef, {
        lastNumber: orderNum,
        date: dateKey,
        updatedAt: serverTimestamp()
      }, { merge: true })

      return `#${String(orderNum).padStart(3, '0')}`
    } catch (error) {
      console.error('Error getting order number:', error)
      return `#${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`
    }
  }

  // Enviar pedido al sistema de restaurante
  const handleRestaurantOrder = async () => {
    if (cart.length === 0) return

    // Verificar horario de atención
    const hoursStatus = isBusinessOpen(business?.businessHours)
    if (!hoursStatus.open) {
      setOrderError(`🕐 ${hoursStatus.message}. No se pueden realizar pedidos fuera del horario de atención.`)
      return
    }

    // Validaciones
    if (orderType === 'dine_in' && !tableNumber.trim()) {
      setOrderError('Ingresa el número de mesa')
      return
    }
    if ((orderType === 'delivery' || orderType === 'takeaway') && !customerName.trim()) {
      setOrderError('Ingresa tu nombre')
      return
    }
    if (orderType === 'delivery' && !customerPhone.trim()) {
      setOrderError('Ingresa tu teléfono para delivery')
      return
    }
    if (orderType === 'delivery' && !customerAddress.trim()) {
      setOrderError('Ingresa tu dirección para delivery')
      return
    }

    setSubmitting(true)
    setOrderError('')

    try {
      // En modo demo, simular envío de pedido
      if (business.id === 'demo-restaurant' || business.id === 'demo') {
        await new Promise(resolve => setTimeout(resolve, 1500)) // Simular delay
        setOrderNumber('#DEMO')
        setOrderConfirmItems([...cart])
        setOrderSuccess(true)
        cart.forEach(item => onRemove(item.cartItemId || item.id))
        return
      }

      const ordersRef = collection(db, 'businesses', business.id, 'orders')
      const orderNum = await getDailyOrderNumber(business.id)

      // Multi-divisa: si el catálogo está en USD, los totales/items se
      // convierten al guardar el order. Se persiste currency + TC para
      // que el POS pueda heredarlos al convertir el pedido en factura.
      // El carrito guarda PEN como source-of-truth (basePrice), así que
      // convertimos UNA sola vez al momento de persistir.
      const isCatalogUSD = catalogCurrency === 'USD'
      const orderCurrency = isCatalogUSD ? 'USD' : 'PEN'
      const orderRate = isCatalogUSD ? (catalogExchangeRate || 1) : 1
      const convertToOrderCcy = (penAmount) => {
        if (!isCatalogUSD) return penAmount
        return Number(convertFromBase(penAmount, 'USD', orderRate).toFixed(2))
      }

      // Preparar items de la orden.
      // En USD: price/total se guardan ya convertidos a USD (con TC del catálogo)
      // o, si el producto tiene priceUSD, ese precio se usa directamente.
      // basePrice y totalInBase mantienen el equivalente en PEN para auditoría
      // y para reportes globales. Para items con fixedPriceUSD, totalInBase
      // se calcula como priceUSD * TC * qty (PEN equivalente de lo cobrado).
      const items = cart.map(item => {
        const pricePen = item.unitPrice || item.price
        const fixedUSD = Number(item.fixedPriceUSD)
        const hasFixedUSD = isCatalogUSD && Number.isFinite(fixedUSD) && fixedUSD > 0
        // Display price: priceUSD fijo, o conversión por TC.
        const priceDisplay = hasFixedUSD ? fixedUSD : convertToOrderCcy(pricePen)
        const totalDisplay = priceDisplay * item.quantity
        // totalInBase: PEN equivalente de lo cobrado.
        //  - Sin priceUSD: pricePen * qty (precio PEN original definido)
        //  - Con priceUSD: priceUSD * TC * qty (equivalente PEN del USD cobrado)
        const totalInBase = hasFixedUSD
          ? Number((fixedUSD * orderRate * item.quantity).toFixed(2))
          : pricePen * item.quantity
        return {
          itemId: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          productId: item.id,
          name: item.name,
          price: priceDisplay,
          quantity: item.quantity,
          total: totalDisplay,
          modifiers: item.selectedModifiers || [],
          ...(item.isVariant && { isVariant: true, variantSku: item.variantSku, variantAttributes: item.variantAttributes }),
          notes: item.notes || '',
          status: 'pending',
          firedAt: new Date(),
          readyAt: null,
          deliveredAt: null,
          // Multi-divisa: basePrice/totalInBase siempre en PEN para round-trip.
          ...(isCatalogUSD && {
            basePrice: pricePen,
            totalInBase,
            ...(hasFixedUSD && { fixedPriceUSD: fixedUSD }),
          }),
        }
      })

      // Calcular totales del pedido.
      // En USD: orderTotalDisplay = suma de items.total (display ccy).
      //   orderTotalInBase = suma de items.totalInBase (PEN equivalente).
      // En PEN: ambos son iguales (suma de unitPrice * quantity).
      // IMPORTANTE: la configuración fiscal vive en business.emissionConfig.taxConfig.
      const orderTotalDisplay = items.reduce((sum, it) => sum + it.total, 0)
      const orderTotalInBase = isCatalogUSD
        ? items.reduce((sum, it) => sum + (it.totalInBase || 0), 0)
        : orderTotalDisplay
      const taxCfg = business.emissionConfig?.taxConfig || business.taxConfig || {}
      const igvRate = taxCfg.igvRate || 18
      const igvExempt = taxCfg.igvExempt === true
      // Subtotal/tax en moneda display (sobre orderTotalDisplay).
      let subtotalDisplay, taxDisplay
      if (igvExempt) {
        subtotalDisplay = orderTotalDisplay
        taxDisplay = 0
      } else {
        subtotalDisplay = orderTotalDisplay / (1 + igvRate / 100)
        taxDisplay = orderTotalDisplay - subtotalDisplay
      }
      // Subtotal/tax en PEN base (sobre orderTotalInBase).
      let subtotalInBase, taxInBase
      if (igvExempt) {
        subtotalInBase = orderTotalInBase
        taxInBase = 0
      } else {
        subtotalInBase = orderTotalInBase / (1 + igvRate / 100)
        taxInBase = orderTotalInBase - subtotalInBase
      }
      // Compatibilidad con código legacy en este archivo (usa `orderTotal`
      // para actualizar amount de mesa en branches activeTableOrder).
      // Apuntamos al valor en PEN base.
      const orderTotal = orderTotalInBase

      const newOrder = {
        orderNumber: orderNum,
        orderType: orderType,
        source: 'menu_digital', // Identificar que viene de la carta digital

        // Mesa (solo si aplica)
        ...(orderType === 'dine_in' && tableNumber && { tableNumber: tableNumber.trim() }),

        // Info del cliente
        ...(customerName && { customerName: customerName.trim() }),
        ...(customerPhone && { customerPhone: customerPhone.trim() }),
        ...(customerAddress && { customerAddress: customerAddress.trim() }),
        ...(customerCoords && { customerCoords }),
        ...(customerEmail && { customerEmail: customerEmail.trim() }),

        // Items
        items,

        // Totales (en moneda del catálogo si es USD, sino PEN).
        // Display ya respeta priceUSD: subtotalDisplay/taxDisplay/totalDisplay
        // se calcularon desde items[].total (que para items con priceUSD usa
        // ese precio directamente sin TC).
        subtotal: Number(subtotalDisplay.toFixed(2)),
        tax: Number(taxDisplay.toFixed(2)),
        total: Number(orderTotalDisplay.toFixed(2)),
        // Multi-divisa: moneda + TC congelados
        currency: orderCurrency,
        exchangeRate: orderRate,
        // Equivalentes en PEN base (para reportes globales)
        subtotalInBase: Number(subtotalInBase.toFixed(2)),
        taxInBase: Number(taxInBase.toFixed(2)),
        totalInBase: Number(orderTotalInBase.toFixed(2)),

        // Estado
        status: 'pending',
        overallStatus: 'active',
        paid: false,
        priority: 'normal',

        // Notas
        ...(notes && { notes: notes.trim() }),

        // Timestamps
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        statusHistory: [{
          status: 'pending',
          timestamp: new Date(),
          note: 'Pedido desde carta digital'
        }]
      }

      // Si hay orden activa en la mesa, agregar items a esa orden
      if (activeTableOrder && orderType === 'dine_in') {
        const orderRef = doc(db, 'businesses', business.id, 'orders', activeTableOrder.orderId)
        const orderSnap = await getDoc(orderRef)

        if (orderSnap.exists()) {
          const existingData = orderSnap.data()
          const existingItems = existingData.items || []

          // Marcar items nuevos como provenientes del menú digital
          const newItemsWithSource = items.map(item => ({
            ...item,
            source: 'menu_digital',
          }))

          const updatedItems = [...existingItems, ...newItemsWithSource]
          const newTotal = updatedItems.reduce((sum, item) => sum + item.total, 0)

          // Recalcular totales
          let newSubtotal, newTax
          if (igvExempt) {
            newSubtotal = newTotal
            newTax = 0
          } else {
            newSubtotal = newTotal / (1 + igvRate / 100)
            newTax = newTotal - newSubtotal
          }

          await updateDoc(orderRef, {
            items: updatedItems,
            subtotal: newSubtotal,
            tax: newTax,
            total: newTotal,
            updatedAt: serverTimestamp(),
          })

          // Actualizar monto de la mesa
          if (activeTableOrder.tableId) {
            const tableRef = doc(db, 'businesses', business.id, 'tables', activeTableOrder.tableId)
            await updateDoc(tableRef, {
              amount: newTotal,
              updatedAt: serverTimestamp(),
            })
          }

          setOrderNumber(activeTableOrder.orderNumber || orderNum)
          setOrderConfirmItems([...cart])
          setOrderSuccess(true)

          // Limpiar carrito y recargar orden
          cart.forEach(item => onRemove(item.cartItemId || item.id))
          if (onOrderAdded) onOrderAdded()
          return
        }
      }

      // Si no hay orden activa, crear nueva orden
      const orderDoc = await addDoc(ordersRef, newOrder)

      // Si es pedido para mesa, ocupar la mesa automáticamente
      if (orderType === 'dine_in' && tableNumber.trim()) {
        try {
          const tablesRef = collection(db, 'businesses', business.id, 'tables')
          const allTablesSnap = await getDocs(tablesRef)
          const trimmedNumber = tableNumber.trim()

          // Buscar mesa por número (comparar como string para evitar mismatch de tipos)
          const matchedTableDoc = allTablesSnap.docs.find(d => {
            const num = d.data().number
            return String(num) === trimmedNumber
          })

          if (matchedTableDoc) {
            const tableData = matchedTableDoc.data()
            const tableRef = doc(db, 'businesses', business.id, 'tables', matchedTableDoc.id)

            // Heredar la sede (branchId) de la mesa en la orden, para separar órdenes/comandas por sucursal
            await updateDoc(doc(db, 'businesses', business.id, 'orders', orderDoc.id), {
              branchId: tableData.branchId || null,
            })

            if (tableData.status === 'available' || tableData.status === 'reserved') {
              // Mesa libre o reservada: ocuparla con esta orden
              await updateDoc(tableRef, {
                status: 'occupied',
                currentOrder: orderDoc.id,
                startTime: serverTimestamp(),
                amount: orderTotal,
                updatedAt: serverTimestamp(),
              })
              // Vincular tableId en la orden
              await updateDoc(doc(db, 'businesses', business.id, 'orders', orderDoc.id), {
                tableId: matchedTableDoc.id,
              })
            } else if (tableData.status === 'occupied' && tableData.currentOrder) {
              // Mesa ya ocupada: solo actualizar monto
              await updateDoc(tableRef, {
                amount: (tableData.amount || 0) + orderTotal,
                updatedAt: serverTimestamp(),
              })
            }
          }
        } catch (tableError) {
          console.warn('No se pudo ocupar la mesa automáticamente:', tableError)
          // No fallar el pedido si no se pudo ocupar la mesa
        }
      }

      // Guardar info del cliente localmente para pre-rellenar en próximos pedidos
      try {
        if (business?.id && (customerName || customerPhone || customerEmail || customerAddress)) {
          localStorage.setItem(`catalog_customer_${business.id}`, JSON.stringify({
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            customerEmail: customerEmail.trim(),
            customerAddress: customerAddress.trim(),
            customerCoords: customerCoords || null,
            savedAt: Date.now(),
          }))
        }
      } catch (e) {
        console.warn('No se pudo guardar info del cliente:', e)
      }

      setOrderNumber(orderNum)
      setOrderConfirmItems([...cart])
      setOrderSuccess(true)

      // Limpiar carrito y recargar orden activa
      cart.forEach(item => onRemove(item.cartItemId || item.id))
      if (onOrderAdded) onOrderAdded()

    } catch (error) {
      console.error('Error creating order:', error)
      // Mostrar error específico para diagnóstico
      if (error.code === 'permission-denied') {
        setOrderError('Sin permisos para crear pedido. Contacta al restaurante.')
      } else {
        setOrderError(`Error: ${error.message || 'Error al enviar el pedido'}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Pantalla de éxito
  if (orderSuccess) {
    return (
      <>
        <div
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300 ${
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onClose}
        />
        <div className={`fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}>
          <div className="flex flex-col h-full items-center justify-center p-8 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: `${getCatalogAccent(business)}20` }}>
              <CheckCircle2 className="w-10 h-10" style={{ color: getCatalogAccent(business) }} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {activeTableOrder && orderType === 'dine_in' ? '¡Agregado a tu orden!' : '¡Pedido enviado!'}
            </h2>
            <p className="text-gray-600 mb-4">
              {activeTableOrder && orderType === 'dine_in' ? 'Los productos se agregaron a la orden de tu mesa' : 'Tu pedido ha sido recibido'}
            </p>
            <div className="text-4xl font-bold mb-6" style={{ color: getCatalogAccent(business) }}>{orderNumber}</div>
            <p className="text-sm text-gray-500 mb-8">
              {orderType === 'dine_in'
                ? `Mesa ${tableNumber} - Te llevaremos tu pedido pronto`
                : orderType === 'takeaway'
                ? 'Te avisaremos cuando esté listo para recoger'
                : 'Te contactaremos para confirmar la entrega'}
            </p>

            {/* Botón WhatsApp para delivery/takeaway */}
            {(orderType === 'delivery' || orderType === 'takeaway') && (business?.catalogWhatsapp || business?.whatsapp || business?.phone) && (
              <a
                href={(() => {
                  const waPhone = (business.catalogWhatsapp || business.whatsapp || business.phone).replace(/\D/g, '')
                  // Respetar "Precio a consultar":
                  // - showPrices=false globalmente → toda la lista sin precios
                  // - item.catalogHidePrice=true → esa línea dice "(A consultar)"
                  // - si hay al menos un item oculto o el global está off → el total también es "A consultar"
                  const orderItems = (orderConfirmItems || []).map(item => {
                    // Para productos por peso (kg, L, etc.) mostramos "1.5 kg" en vez de "1.5x"
                    const qtyDisplay = item.allowDecimalQuantity
                      ? `${formatQty(item.quantity)} ${getShortUnitLabel(item.unit)}`
                      : `${formatQty(item.quantity)}x`
                    let line = `• ${qtyDisplay} ${item.name}`
                    if (item.modifiers?.length > 0) {
                      line += ` (${item.modifiers.map(m => m.options?.map(o => o.quantity > 1 ? `${o.quantity}x ${o.optionName}` : o.optionName).join(', ')).join(', ')})`
                    }
                    if (showPrices && !item.catalogHidePrice) {
                      // Multi-divisa: respeta fixedPriceUSD si aplica.
                      line += ` - ${fmtCartLine(item)}`
                    } else {
                      line += ' - (A consultar)'
                    }
                    return line
                  }).join('\n')
                  const hasHidden = (orderConfirmItems || []).some(i => i.catalogHidePrice)
                  const showTotal = showPrices && !hasHidden
                  // Total en moneda del catálogo (PEN o USD), respeta priceUSD.
                  const totalDisplay = (orderConfirmItems || []).reduce(
                    (sum, item) => sum + itemUnitInCatalogCcy(item) * item.quantity,
                    0
                  )
                  let msg = `🛒 *¡Hola! He hecho un pedido ${orderType === 'delivery' ? 'DELIVERY' : 'PARA RECOGER'}*\n\n`
                  msg += `📋 *Pedido ${orderNumber}*\n${orderItems}\n\n`
                  if (showTotal) {
                    msg += `💰 *Total: ${formatCurrency(totalDisplay, catalogCurrency)}*\n\n`
                  } else {
                    msg += `💰 *Total: A consultar*\n\n`
                  }
                  if (customerName) msg += `👤 *Nombre:* ${customerName}\n`
                  if (customerPhone) msg += `📱 *Teléfono:* ${customerPhone}\n`
                  if (customerAddress) msg += `📍 *Dirección:* ${customerAddress}\n`
                  if (customerCoords) msg += `🗺️ *Ubicación:* https://www.google.com/maps?q=${customerCoords.lat},${customerCoords.lng}\n`
                  if (notes) msg += `📝 *Notas:* ${notes}\n`
                  return `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`
                })()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 bg-green-500 text-white rounded-2xl font-semibold transition-opacity hover:opacity-80 flex items-center justify-center gap-2 mb-3"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Confirmar por WhatsApp
              </a>
            )}

            <button
              onClick={onClose}
              className="w-full py-4 text-white rounded-2xl font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: getCatalogAccent(business) }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl transform transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-6 h-6" />
              <h2 className="text-xl font-bold">{isRestaurantMenu ? 'Tu pedido' : 'Tu carrito'}</h2>
              <span className="bg-gray-100 px-2 py-0.5 rounded-full text-sm">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto catalog-scrollbar p-6">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <ShoppingBag className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">{isRestaurantMenu ? (activeTableOrder ? '¿Deseas agregar algo más?' : 'Tu pedido está vacío') : 'Tu carrito está vacío'}</p>
                <p className="text-sm mt-1">{activeTableOrder ? 'Selecciona productos del menú' : 'Agrega productos para comenzar'}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map((item) => (
                  <div key={item.cartItemId || item.id} className="flex gap-4 bg-gray-50 rounded-2xl p-4">
                    {item.imageUrl ? (
                      <img
                        src={optimizeImageUrl(item.imageUrl, 'thumbnail')}
                        alt={item.name}
                        className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <Package className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {item.name}
                        {item.priceLevelLabel && (
                          <span className="text-xs font-normal text-gray-500 ml-1">({item.priceLevelLabel})</span>
                        )}
                      </h3>
                      {/* Mostrar variante seleccionada */}
                      {item.isVariant && item.variantAttributes && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {Object.entries(item.variantAttributes).map(([key, value]) => (
                            <span key={key} className="mr-2">{key.charAt(0).toUpperCase() + key.slice(1)}: {value}</span>
                          ))}
                        </p>
                      )}
                      {/* Mostrar modificadores seleccionados */}
                      {item.selectedModifiers?.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {item.selectedModifiers.map((mod, idx) => (
                            <p key={idx} className="text-xs text-gray-500">
                              {mod.modifierName}: {mod.options.map(o => o.quantity > 1 ? `${o.quantity}x ${o.optionName}` : o.optionName).join(', ')}
                            </p>
                          ))}
                        </div>
                      )}
                      {showPrices && <p className="text-gray-600 mt-1">{fmtCartUnit(item)}</p>}
                      {(() => {
                        // Productos por peso (allowDecimalQuantity): saltos de 0.5, mínimo 0.5.
                        // Resto: comportamiento entero clásico.
                        const itemAllowsDecimals = !!item.allowDecimalQuantity
                        const itemStep = itemAllowsDecimals ? 0.5 : 1
                        const itemMin = itemAllowsDecimals ? 0.5 : 0
                        const itemUnitLabel = getShortUnitLabel(item.unit)
                        const newQtyMinus = Math.max(itemMin, Number((item.quantity - itemStep).toFixed(3)))
                        const newQtyPlus = Number((item.quantity + itemStep).toFixed(3))
                        return (
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => onUpdateQuantity(item.cartItemId || item.id, newQtyMinus)}
                              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="min-w-[2rem] text-center font-medium">
                              {formatQty(item.quantity)}
                              {itemAllowsDecimals && itemUnitLabel && (
                                <span className="text-xs text-gray-500 ml-0.5">{itemUnitLabel}</span>
                              )}
                            </span>
                            <button
                              onClick={() => onUpdateQuantity(item.cartItemId || item.id, newQtyPlus)}
                              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => onRemove(item.cartItemId || item.id)}
                              className="ml-auto w-8 h-8 rounded-full text-red-500 hover:bg-red-50 flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {cart.length > 0 && (
            <div className="border-t flex flex-col max-h-[60vh]">
            <div className="flex-1 overflow-y-auto catalog-scrollbar p-6 pb-2 space-y-4">
              {showPrices && (
                <div className="flex items-center justify-between text-lg">
                  <span className="text-gray-600">Total</span>
                  <span className="text-2xl font-bold">{formatCurrency(totalInCatalogCcy, catalogCurrency)}</span>
                </div>
              )}

              {/* Opciones de pedido (restaurante o tienda virtual retail) */}
              {(isRestaurantMenu || business?.catalogOnlineOrders !== false) && (
                <div className="space-y-4 pt-2">
                  {/* Si viene de QR con mesa, mostrar indicador fijo (solo restaurante) */}
                  {isRestaurantMenu && initialTableNumber ? (
                    <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: `${getCatalogAccent(business)}15`, border: `1px solid ${getCatalogAccent(business)}40` }}>
                      <Hash className="w-5 h-5" style={{ color: getCatalogAccent(business) }} />
                      <span className="text-sm font-medium" style={{ color: getCatalogAccent(business) }}>Mesa {initialTableNumber} — Pedido para tu mesa</span>
                    </div>
                  ) : isRestaurantMenu ? (
                    <>
                      {/* Tipo de orden (solo restaurante, solo mostrar si hay más de una opción) */}
                      {(business?.catalogAllowTakeaway !== false && business?.catalogAllowDelivery !== false) && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Tipo de pedido
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {ORDER_TYPES.filter(t => {
                              if (t.id === 'dine_in') return false
                              if (t.id === 'takeaway' && business?.catalogAllowTakeaway === false) return false
                              if (t.id === 'delivery' && business?.catalogAllowDelivery === false) return false
                              return true
                            }).map((type) => {
                              const Icon = type.icon
                              const isSelected = orderType === type.id
                              return (
                                <button
                                  key={type.id}
                                  onClick={() => setOrderType(type.id)}
                                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                                    isSelected
                                      ? `border-${type.color}-500 bg-${type.color}-50 text-${type.color}-700`
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                  style={isSelected ? {
                                    borderColor: type.color === 'emerald' ? '#10B981' : type.color === 'blue' ? '#3B82F6' : '#F97316',
                                    backgroundColor: type.color === 'emerald' ? '#ECFDF5' : type.color === 'blue' ? '#EFF6FF' : '#FFF7ED'
                                  } : {}}
                                >
                                  <Icon className="w-5 h-5" />
                                  <span className="text-xs font-medium">{type.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Mesa (solo para dine_in sin QR) */}
                      {orderType === 'dine_in' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Hash className="w-4 h-4 inline mr-1" />
                            Número de mesa
                          </label>
                          <input
                            type="text"
                            value={tableNumber}
                            onChange={(e) => setTableNumber(e.target.value)}
                            placeholder="Ej: 5"
                            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
                          />
                        </div>
                      )}
                    </>
                  ) : null}

                  {/* Nombre (para takeaway y delivery) */}
                  {(orderType === 'takeaway' || orderType === 'delivery') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <User className="w-4 h-4 inline mr-1" />
                        Tu nombre
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Nombre para el pedido"
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
                      />
                    </div>
                  )}

                  {/* Teléfono (para delivery / retail) */}
                  {orderType === 'delivery' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Phone className="w-4 h-4 inline mr-1" />
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder={isRestaurantMenu ? 'Para coordinar entrega' : 'Para contactarte'}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
                      />
                    </div>
                  )}

                  {/* Email opcional (solo retail / tienda virtual) */}
                  {!isRestaurantMenu && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Mail className="w-4 h-4 inline mr-1" />
                        Email <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="tu@email.com"
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
                      />
                    </div>
                  )}

                  {/* Dirección (para delivery / retail) */}
                  {orderType === 'delivery' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <MapPin className="w-4 h-4 inline mr-1" />
                        {isRestaurantMenu ? 'Dirección de entrega' : 'Dirección'}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customerAddress}
                          onChange={(e) => { setCustomerAddress(e.target.value); setCustomerCoords(null) }}
                          placeholder="Av. ejemplo 123, distrito"
                          className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
                        />
                        <button
                          type="button"
                          disabled={gettingLocation}
                          onClick={async () => {
                            if (!navigator.geolocation) {
                              setOrderError('Tu navegador no soporta geolocalización')
                              return
                            }
                            setGettingLocation(true)
                            setOrderError('')
                            navigator.geolocation.getCurrentPosition(
                              async (position) => {
                                const { latitude, longitude } = position.coords
                                setCustomerCoords({ lat: latitude, lng: longitude })
                                try {
                                  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=es`)
                                  const data = await res.json()
                                  if (data.display_name) {
                                    // Limpiar dirección: quitar país y código postal largo
                                    const parts = data.display_name.split(', ')
                                    const clean = parts.slice(0, Math.min(parts.length - 1, 5)).join(', ')
                                    setCustomerAddress(clean)
                                  }
                                } catch {
                                  setCustomerAddress(`Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`)
                                }
                                setGettingLocation(false)
                              },
                              (error) => {
                                setGettingLocation(false)
                                if (error.code === 1) {
                                  setOrderError('Permiso de ubicación denegado. Actívalo en la configuración de tu navegador.')
                                } else {
                                  setOrderError('No se pudo obtener tu ubicación. Ingresa la dirección manualmente.')
                                }
                              },
                              { enableHighAccuracy: true, timeout: 10000 }
                            )
                          }}
                          className="px-3 py-3 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors flex items-center justify-center disabled:opacity-50"
                          title="Usar mi ubicación"
                        >
                          {gettingLocation
                            ? <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                            : <Navigation className="w-5 h-5 text-blue-600" />
                          }
                        </button>
                      </div>
                      {customerCoords && (
                        <a
                          href={`https://www.google.com/maps?q=${customerCoords.lat},${customerCoords.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 mt-1.5 hover:underline"
                        >
                          <MapPin className="w-3 h-3" />
                          Ver en Google Maps
                        </a>
                      )}
                    </div>
                  )}

                  {/* Notas */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notas adicionales (opcional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Sin cebolla, extra salsa, etc."
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-gray-400 focus:border-gray-400 resize-none"
                    />
                  </div>

                  {/* Error */}
                  {orderError && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-xl">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <span className="text-sm">{orderError}</span>
                    </div>
                  )}
                </div>
              )}

            </div>

              {/* Botón de checkout - fijo abajo */}
              <div className="px-6 pb-6 pt-3 space-y-3 flex-shrink-0">
              {(isRestaurantMenu || business?.catalogOnlineOrders !== false) ? (
                <button
                  onClick={handleRestaurantOrder}
                  disabled={submitting}
                  className="w-full py-4 text-white rounded-2xl font-semibold text-lg transition-opacity hover:opacity-80 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: getCatalogAccent(business) }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {activeTableOrder && orderType === 'dine_in' ? 'Agregando...' : 'Enviando...'}
                    </>
                  ) : (
                    <>
                      {isRestaurantMenu ? <UtensilsCrossed className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
                      {activeTableOrder && orderType === 'dine_in' ? 'Agregar a la orden' : 'Enviar pedido'}
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={onCheckout}
                  className="w-full py-4 text-white rounded-2xl font-semibold text-lg transition-opacity hover:opacity-80 flex items-center justify-center gap-2"
                  style={{ backgroundColor: getCatalogAccent(business) }}
                >
                  <MessageCircle className="w-5 h-5" />
                  Hacer pedido por WhatsApp
                </button>
              )}

              <p className="text-center text-sm text-gray-500">
                {isRestaurantMenu
                  ? 'Tu pedido llegará directamente a cocina'
                  : 'Tu pedido llegará a la tienda. Te contactaremos para confirmar.'}
              </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
