import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  Search,
  ShoppingBag,
  X,
  Plus,
  Minus,
  Trash2,
  MessageCircle,
  Phone,
  MapPin,
  Clock,
  ChevronDown,
  Package,
  Loader2,
  Store,
  Filter,
  Grid3X3,
  List,
  UtensilsCrossed,
  ShoppingCart,
  Bike,
  User,
  Hash,
  CheckCircle2,
  AlertCircle,
  Info
} from 'lucide-react'

// Componente de skeleton para carga
function ProductSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden animate-pulse">
      <div className="aspect-square bg-gray-200" />
      <div className="p-4">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
        <div className="h-6 bg-gray-200 rounded w-1/3" />
      </div>
    </div>
  )
}

// Helper: determinar si un producto está agotado
const isProductOutOfStock = (product) => {
  if (!product) return false
  // Productos sin control de stock siempre disponibles
  if (product.trackStock === false || product.stock === null || product.stock === undefined) return false
  // Producto con variantes: agotado solo si TODAS las variantes están agotadas
  if (product.hasVariants && product.variants?.length > 0) {
    return product.variants.every(v => v.stock !== null && v.stock !== undefined && v.stock <= 0)
  }
  return product.stock <= 0
}

// Helper: obtener precios disponibles de un producto (mayorista, VIP, etc.)
const getProductPrices = (product, business) => {
  if (!business?.multiplePricesEnabled) return []
  const keys = [
    { priceField: 'price', labelKey: 'price1' },
    { priceField: 'price2', labelKey: 'price2' },
    { priceField: 'price3', labelKey: 'price3' },
    { priceField: 'price4', labelKey: 'price4' },
  ]
  const defaultLabels = { price1: 'Público', price2: 'Mayorista', price3: 'VIP', price4: 'Especial' }
  const prices = []
  keys.forEach(({ priceField, labelKey }) => {
    const value = product[priceField]
    if (value && value > 0) {
      prices.push({
        key: labelKey,
        value,
        label: business.priceLabels?.[labelKey] || defaultLabels[labelKey]
      })
    }
  })
  return prices
}

// Helper: obtener rango de precios min~max (solo para productos sin variantes con múltiples precios)
const getProductPriceRange = (product, business) => {
  if (product.hasVariants && product.variants?.length > 0) return null
  const prices = getProductPrices(product, business)
  if (prices.length <= 1) return null
  const values = prices.map(p => p.value)
  return { min: Math.min(...values), max: Math.max(...values) }
}

// Modal de producto con soporte para modificadores
function ProductModal({ product, isOpen, onClose, onAddToCart, cartQuantity, showPrices = true, business }) {
  const [quantity, setQuantity] = useState(1)
  const [selectedModifiers, setSelectedModifiers] = useState({})
  const [modifierErrors, setModifierErrors] = useState({})
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [variantError, setVariantError] = useState(false)
  const [selectedPriceLevel, setSelectedPriceLevel] = useState('price1')

  // Inicializar modificadores cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setQuantity(1)
      setSelectedVariant(null)
      setVariantError(false)
      setSelectedPriceLevel('price1')
      document.body.style.overflow = 'hidden'
      // Inicializar estado de modificadores
      if (product?.modifiers?.length > 0) {
        const initial = {}
        product.modifiers.forEach(mod => {
          initial[mod.id] = []
        })
        setSelectedModifiers(initial)
      } else {
        setSelectedModifiers({})
      }
      setModifierErrors({})
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, product])

  if (!isOpen || !product) return null

  const outOfStock = isProductOutOfStock(product)
  const hasModifiers = product.modifiers?.length > 0

  // Manejar selección de opción de modificador
  const handleOptionToggle = (modifierId, optionId) => {
    const modifier = product.modifiers.find(m => m.id === modifierId)
    if (!modifier) return

    setSelectedModifiers(prev => {
      const current = prev[modifierId] || []
      const isSelected = current.includes(optionId)

      let updated
      if (isSelected) {
        updated = current.filter(id => id !== optionId)
      } else {
        if (modifier.maxSelection === 1) {
          updated = [optionId]
        } else if (current.length < (modifier.maxSelection || 99)) {
          updated = [...current, optionId]
        } else {
          return prev
        }
      }

      return { ...prev, [modifierId]: updated }
    })

    // Limpiar error
    if (modifierErrors[modifierId]) {
      setModifierErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[modifierId]
        return newErrors
      })
    }
  }

  const hasVariants = product.hasVariants && product.variants?.length > 0

  // Precios disponibles (mayorista, VIP, etc.)
  const availablePrices = getProductPrices(product, business)
  const hasMultiplePrices = availablePrices.length > 1 && !hasVariants

  // Calcular precio total con modificadores y variante
  const calculateTotalPrice = () => {
    let total
    if (hasVariants) {
      total = selectedVariant?.price || product.basePrice || 0
    } else if (hasMultiplePrices && selectedPriceLevel) {
      const selected = availablePrices.find(p => p.key === selectedPriceLevel)
      total = selected?.value || product.price || 0
    } else {
      total = product.price || 0
    }
    if (hasModifiers) {
      Object.keys(selectedModifiers).forEach(modifierId => {
        const modifier = product.modifiers.find(m => m.id === modifierId)
        if (modifier) {
          selectedModifiers[modifierId].forEach(optionId => {
            const option = modifier.options?.find(o => o.id === optionId)
            if (option?.priceAdjustment) {
              total += option.priceAdjustment
            }
          })
        }
      })
    }
    return total
  }

  // Validar y agregar al carrito
  const handleAddToCart = () => {
    // Validar selección de variante
    if (hasVariants && !selectedVariant) {
      setVariantError(true)
      return
    }

    // Validar modificadores obligatorios
    if (hasModifiers) {
      const errors = {}
      product.modifiers.forEach(mod => {
        if (mod.required) {
          const selected = selectedModifiers[mod.id] || []
          if (selected.length === 0) {
            errors[mod.id] = `Selecciona una opción`
          }
        }
      })
      if (Object.keys(errors).length > 0) {
        setModifierErrors(errors)
        return
      }
    }

    // Preparar datos de modificadores para el carrito
    let modifiersData = []
    if (hasModifiers) {
      modifiersData = product.modifiers
        .map(mod => {
          const selectedOptions = selectedModifiers[mod.id] || []
          if (selectedOptions.length === 0) return null
          return {
            modifierId: mod.id,
            modifierName: mod.name,
            options: selectedOptions.map(optId => {
              const opt = mod.options?.find(o => o.id === optId)
              return {
                optionId: optId,
                optionName: opt?.name || '',
                priceAdjustment: opt?.priceAdjustment || 0
              }
            })
          }
        })
        .filter(Boolean)
    }

    const totalPrice = calculateTotalPrice()
    const priceLevelLabel = hasMultiplePrices
      ? availablePrices.find(p => p.key === selectedPriceLevel)?.label || null
      : null
    // Si tiene variante, pasar producto con datos de variante
    if (hasVariants && selectedVariant) {
      const variantProduct = {
        ...product,
        variantSku: selectedVariant.sku,
        variantAttributes: selectedVariant.attributes,
        isVariant: true,
      }
      onAddToCart(variantProduct, quantity, modifiersData, totalPrice, priceLevelLabel)
    } else {
      onAddToCart(product, quantity, modifiersData, totalPrice, priceLevelLabel)
    }
    onClose()
  }

  const unitPrice = calculateTotalPrice()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Botón cerrar flotante */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        {cartQuantity > 0 && (
          <div className="absolute top-4 left-4 z-10 bg-emerald-500 text-white px-3 py-1 rounded-full text-sm font-medium">
            {cartQuantity} en carrito
          </div>
        )}

        {/* Imagen cuadrada 1:1 */}
        <div className="relative bg-gray-100 aspect-square">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className={`w-full h-full object-cover ${outOfStock ? 'opacity-50 grayscale' : ''}`}
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${outOfStock ? 'opacity-50' : ''}`}>
              <Package className="w-24 h-24 text-gray-300" />
            </div>
          )}
          {outOfStock && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg tracking-wide">
                AGOTADO
              </span>
            </div>
          )}
        </div>

        {/* Contenido */}
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{product.name}</h2>
            {product.description && (
              <p className="text-gray-600">{product.description}</p>
            )}
          </div>

          <div className="flex items-center justify-between mb-6">
            {showPrices ? (
              <div className="text-3xl font-bold text-gray-900">
                {hasVariants && !selectedVariant
                  ? `Desde S/ ${Math.min(...product.variants.map(v => v.price)).toFixed(2)}`
                  : `S/ ${unitPrice.toFixed(2)}`
                }
              </div>
            ) : (
              <div className="text-lg text-gray-500">Consultar precio</div>
            )}
            {!hasVariants && product.stock !== undefined && product.stock !== null && product.trackStock !== false && product.stock <= 0 && (
              <span className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded-full font-medium">
                Agotado
              </span>
            )}
          </div>

          {/* Tabla de precios por mayor */}
          {hasMultiplePrices && showPrices && (
            <div className="mb-6">
              <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-200">
                {availablePrices.map((priceItem) => {
                  const isSelected = selectedPriceLevel === priceItem.key
                  return (
                    <button
                      key={priceItem.key}
                      onClick={() => setSelectedPriceLevel(priceItem.key)}
                      className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                        isSelected
                          ? 'bg-emerald-50'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <span className={`font-medium ${isSelected ? 'text-emerald-700' : 'text-gray-700'}`}>
                          {priceItem.label}
                        </span>
                      </div>
                      <span className={`font-bold ${isSelected ? 'text-emerald-700' : 'text-gray-900'}`}>
                        S/ {priceItem.value.toFixed(2)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Variantes */}
          {hasVariants && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">
                  {product.variantAttributes?.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(' / ')}
                </h3>
                {variantError && (
                  <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
                    Selecciona una opción
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {product.variants.map((variant, index) => {
                  const isSelected = selectedVariant?.sku === variant.sku
                  const outOfStock = variant.stock !== null && variant.stock <= 0
                  const attrsLabel = Object.values(variant.attributes).join(' / ')
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        if (!outOfStock) {
                          setSelectedVariant(variant)
                          setVariantError(false)
                        }
                      }}
                      disabled={outOfStock}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                        outOfStock
                          ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className={isSelected ? 'text-emerald-700 font-medium' : 'text-gray-700'}>
                        {attrsLabel}
                        {outOfStock && <span className="ml-2 text-xs text-gray-400">(Agotado)</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        {showPrices && (
                          <span className="text-sm font-medium text-gray-600">S/ {variant.price.toFixed(2)}</span>
                        )}
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Modificadores */}
          {hasModifiers && (
            <div className="mb-6 space-y-4">
              {product.modifiers.map(modifier => (
                <div key={modifier.id} className="border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{modifier.name}</h3>
                      <p className="text-sm text-gray-500">
                        {modifier.required ? 'Obligatorio' : 'Opcional'}
                        {modifier.maxSelection > 1 && ` - Máx. ${modifier.maxSelection}`}
                      </p>
                    </div>
                    {modifierErrors[modifier.id] && (
                      <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
                        {modifierErrors[modifier.id]}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {modifier.options?.map(option => {
                      const isSelected = selectedModifiers[modifier.id]?.includes(option.id)
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleOptionToggle(modifier.id, option.id)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className={isSelected ? 'text-emerald-700 font-medium' : 'text-gray-700'}>
                            {option.name}
                          </span>
                          <div className="flex items-center gap-2">
                            {showPrices && option.priceAdjustment > 0 && (
                              <span className="text-sm text-gray-500">+S/ {option.priceAdjustment.toFixed(2)}</span>
                            )}
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                            }`}>
                              {isSelected && (
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selector de cantidad */}
          <div className="flex items-center gap-4 mb-6">
            <span className="text-gray-600">Cantidad:</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-gray-300 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-12 text-center text-xl font-semibold">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-gray-300 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Botón agregar */}
          <button
            onClick={handleAddToCart}
            disabled={outOfStock}
            className={`w-full py-4 rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 transition-colors ${
              outOfStock
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {outOfStock ? (
              <>
                <AlertCircle className="w-5 h-5" />
                Producto agotado
              </>
            ) : (
              <>
                <ShoppingBag className="w-5 h-5" />
                {showPrices ? `Agregar al carrito - S/ ${(unitPrice * quantity).toFixed(2)}` : 'Agregar al carrito'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Tipos de orden para restaurante
const ORDER_TYPES = [
  { id: 'dine_in', label: 'Para mesa', icon: UtensilsCrossed, color: 'emerald' },
  { id: 'takeaway', label: 'Para llevar', icon: ShoppingCart, color: 'blue' },
  { id: 'delivery', label: 'Delivery', icon: Bike, color: 'orange' },
]

// Carrito lateral
function CartDrawer({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemove,
  business,
  onCheckout,
  showPrices = true,
  isRestaurantMenu = false,
  tableNumber: initialTableNumber = ''
}) {
  const total = cart.reduce((sum, item) => sum + ((item.unitPrice || item.price) * item.quantity), 0)

  // Estados para modo restaurante
  const [orderType, setOrderType] = useState(initialTableNumber ? 'dine_in' : 'takeaway')
  const [tableNumber, setTableNumber] = useState(initialTableNumber)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')
  const [orderError, setOrderError] = useState('')

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

  // Resetear formulario cuando se cierra
  useEffect(() => {
    if (!isOpen && orderSuccess) {
      setTimeout(() => {
        setOrderSuccess(false)
        setOrderNumber('')
        setOrderType(initialTableNumber ? 'dine_in' : 'takeaway')
        setTableNumber(initialTableNumber)
        setCustomerName('')
        setCustomerPhone('')
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

    setSubmitting(true)
    setOrderError('')

    try {
      // En modo demo, simular envío de pedido
      if (business.id === 'demo-restaurant' || business.id === 'demo') {
        await new Promise(resolve => setTimeout(resolve, 1500)) // Simular delay
        setOrderNumber('#DEMO')
        setOrderSuccess(true)
        cart.forEach(item => onRemove(item.cartItemId || item.id))
        return
      }

      const ordersRef = collection(db, 'businesses', business.id, 'orders')
      const orderNum = await getDailyOrderNumber(business.id)

      // Preparar items de la orden
      const items = cart.map(item => ({
        itemId: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        productId: item.id,
        name: item.name,
        price: item.unitPrice || item.price,
        quantity: item.quantity,
        total: (item.unitPrice || item.price) * item.quantity,
        modifiers: item.selectedModifiers || [],
        ...(item.isVariant && { isVariant: true, variantSku: item.variantSku, variantAttributes: item.variantAttributes }),
        notes: item.notes || '',
        status: 'pending',
        firedAt: new Date(),
        readyAt: null,
        deliveredAt: null,
      }))

      // Calcular totales
      const orderTotal = items.reduce((sum, item) => sum + item.total, 0)
      const igvRate = business.taxConfig?.igvRate || 18
      const igvExempt = business.taxConfig?.igvExempt || false
      let subtotal, tax

      if (igvExempt) {
        subtotal = orderTotal
        tax = 0
      } else {
        subtotal = orderTotal / (1 + igvRate / 100)
        tax = orderTotal - subtotal
      }

      const newOrder = {
        orderNumber: orderNum,
        orderType: orderType,
        source: 'menu_digital', // Identificar que viene de la carta digital

        // Mesa (solo si aplica)
        ...(orderType === 'dine_in' && tableNumber && { tableNumber: tableNumber.trim() }),

        // Info del cliente
        ...(customerName && { customerName: customerName.trim() }),
        ...(customerPhone && { customerPhone: customerPhone.trim() }),

        // Items
        items,

        // Totales
        subtotal,
        tax,
        total: orderTotal,

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

      await addDoc(ordersRef, newOrder)

      setOrderNumber(orderNum)
      setOrderSuccess(true)

      // Limpiar carrito
      cart.forEach(item => onRemove(item.cartItemId || item.id))

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
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Pedido enviado!</h2>
            <p className="text-gray-600 mb-4">Tu pedido ha sido recibido</p>
            <div className="text-4xl font-bold text-emerald-600 mb-6">{orderNumber}</div>
            <p className="text-sm text-gray-500 mb-8">
              {orderType === 'dine_in'
                ? `Mesa ${tableNumber} - Te llevaremos tu pedido pronto`
                : orderType === 'takeaway'
                ? 'Te avisaremos cuando esté listo para recoger'
                : 'Te contactaremos para confirmar la entrega'}
            </p>
            <button
              onClick={onClose}
              className="w-full py-4 bg-gray-900 text-white rounded-2xl font-semibold hover:bg-gray-800 transition-colors"
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
          <div className="flex-1 overflow-y-auto p-6">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <ShoppingBag className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">{isRestaurantMenu ? 'Tu pedido está vacío' : 'Tu carrito está vacío'}</p>
                <p className="text-sm mt-1">Agrega productos para comenzar</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map((item) => (
                  <div key={item.cartItemId || item.id} className="flex gap-4 bg-gray-50 rounded-2xl p-4">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
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
                              {mod.modifierName}: {mod.options.map(o => o.optionName).join(', ')}
                            </p>
                          ))}
                        </div>
                      )}
                      {showPrices && <p className="text-gray-600 mt-1">S/ {(item.unitPrice || item.price)?.toFixed(2)}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => onUpdateQuantity(item.cartItemId || item.id, Math.max(0, item.quantity - 1))}
                          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(item.cartItemId || item.id, item.quantity + 1)}
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {cart.length > 0 && (
            <div className="border-t p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {showPrices && (
                <div className="flex items-center justify-between text-lg">
                  <span className="text-gray-600">Total</span>
                  <span className="text-2xl font-bold">S/ {total.toFixed(2)}</span>
                </div>
              )}

              {/* Opciones de restaurante */}
              {isRestaurantMenu && (
                <div className="space-y-4 pt-2">
                  {/* Tipo de orden */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de pedido
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {ORDER_TYPES.map((type) => {
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

                  {/* Mesa (solo para dine_in) */}
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
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                  )}

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
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {/* Teléfono (para delivery) */}
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
                        placeholder="Para coordinar entrega"
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
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
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
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

              {/* Botón de checkout */}
              {isRestaurantMenu ? (
                <button
                  onClick={handleRestaurantOrder}
                  disabled={submitting}
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-semibold text-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <UtensilsCrossed className="w-5 h-5" />
                      Enviar pedido
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={onCheckout}
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-semibold text-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  Hacer pedido por WhatsApp
                </button>
              )}

              <p className="text-center text-sm text-gray-500">
                {isRestaurantMenu
                  ? 'Tu pedido llegará directamente a cocina'
                  : 'Te contactaremos para confirmar tu pedido'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// Datos demo para el catálogo
const DEMO_CATALOG_DATA = {
  business: {
    id: 'demo',
    businessName: 'EMPRESA DEMO SAC',
    name: 'EMPRESA DEMO SAC',
    ruc: '20123456789',
    address: 'Av. Larco 1234, Miraflores',
    phone: '01-2345678',
    email: 'ventas@empresademo.com',
    website: 'www.empresademo.com',
    logoUrl: '/demologo.png',
    catalogEnabled: true,
    catalogSlug: 'demo',
    catalogTagline: 'Tu tienda de tecnología y belleza',
    catalogWelcome: 'Bienvenido a nuestra tienda demo. Explora nuestros productos de electrónica y belleza.',
    catalogColor: '#10B981',
    catalogWhatsapp: '51987654321',
    catalogShowPrices: true,
    catalogAllowOrders: true,
    catalogObservations: 'Pagos: BCP Cta. Ahorros 123-456789-0-12\nYape / Plin: 987 654 321\nWhatsApp ventas: 987 654 321',
  },
  products: [
    { id: '1', code: 'PROD001', name: 'Laptop HP 15"', description: 'Laptop HP 15 pulgadas, Intel Core i5, 8GB RAM', price: 2500.00, stock: 15, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '2', code: 'PROD002', name: 'Mouse Inalámbrico', description: 'Mouse inalámbrico Logitech', price: 45.00, stock: 50, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '3', code: 'PROD003', name: 'Teclado Mecánico', description: 'Teclado mecánico RGB', price: 180.00, stock: 25, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '4', code: 'PROD004', name: 'Monitor 24"', description: 'Monitor LED 24 pulgadas Full HD', price: 650.00, stock: 12, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '5', code: 'PROD005', name: 'Crema Hidratante Facial', description: 'Crema hidratante profesional para tratamientos faciales', price: 85.00, stock: 24, category: 'cat-belleza', imageUrl: 'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '6', code: 'PROD006', name: 'Aceite Esencial Lavanda', description: 'Aceite esencial puro para aromaterapia', price: 65.00, stock: 18, category: 'cat-belleza', imageUrl: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '7', code: 'PROD007', name: 'Audífonos Bluetooth', description: 'Audífonos inalámbricos con cancelación de ruido', price: 250.00, stock: 35, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '8', code: 'PROD008', name: 'Webcam HD 1080p', description: 'Cámara web Full HD con micrófono integrado', price: 180.00, stock: 28, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1587826080692-f439cd0b70da?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '9', code: 'PROD009', name: 'Hub USB 7 puertos', description: 'Hub USB 3.0 de 7 puertos con alimentación', price: 85.00, stock: 42, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1625723044792-44de16ccb4e9?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '10', code: 'PROD010', name: 'Mascarilla Facial', description: 'Mascarilla hidratante de colágeno', price: 35.00, stock: 60, category: 'cat-belleza', imageUrl: 'https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '11', code: 'PROD011', name: 'Sérum Vitamina C', description: 'Sérum antioxidante con vitamina C pura', price: 95.00, stock: 32, category: 'cat-belleza', imageUrl: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '12', code: 'PROD012', name: 'Kit Manicure Profesional', description: 'Set completo de herramientas para manicure', price: 120.00, stock: 20, category: 'cat-belleza', imageUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=400&fit=crop', catalogVisible: true },
  ],
  categories: [
    { id: 'cat-electronica', name: 'Electrónica' },
    { id: 'cat-belleza', name: 'Belleza' },
  ]
}

// Datos demo para el menú de restaurante
const DEMO_RESTAURANT_DATA = {
  business: {
    id: 'demo-restaurant',
    businessName: 'RESTAURANTE DEMO',
    name: 'La Buena Mesa',
    ruc: '20123456789',
    address: 'Av. Gastronómica 456, Lima',
    phone: '01-9876543',
    email: 'reservas@labuenamesa.com',
    logoUrl: null,
    catalogEnabled: true,
    menuEnabled: true,
    catalogSlug: 'demo',
    menuSlug: 'demo',
    catalogTagline: 'Sabores que enamoran',
    catalogWelcome: '¡Bienvenido! Descubre nuestra carta y haz tu pedido.',
    catalogColor: '#F97316',
    catalogShowPrices: true,
    catalogObservations: 'Horario: Lun-Sáb 12:00 - 22:00 | Dom 12:00 - 18:00\nReservas: 01-9876543 / WhatsApp 987 654 321',
    taxConfig: { igvRate: 18, igvExempt: false }
  },
  products: [
    // Entradas
    { id: 'r1', code: 'ENT001', name: 'Ceviche Clásico', description: 'Pescado fresco marinado en limón con cebolla, camote y choclo', price: 38.00, category: 'cat-entradas', imageUrl: 'https://images.unsplash.com/photo-1535399831218-d5bd36d1a6b3?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r2', code: 'ENT002', name: 'Causa Limeña', description: 'Capas de papa amarilla con pollo, palta y mayonesa', price: 28.00, category: 'cat-entradas', imageUrl: 'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r3', code: 'ENT003', name: 'Tequeños de Queso', description: '6 unidades con salsa huancaína', price: 18.00, category: 'cat-entradas', imageUrl: 'https://images.unsplash.com/photo-1541014741259-de529411b96a?w=400&h=400&fit=crop', catalogVisible: true },
    // Platos de fondo
    { id: 'r4', code: 'PLT001', name: 'Lomo Saltado', description: 'Lomo fino salteado con cebolla, tomate, papas fritas y arroz', price: 42.00, category: 'cat-platos', imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r5', code: 'PLT002', name: 'Arroz con Mariscos', description: 'Arroz con camarones, pulpo, calamar y conchas', price: 48.00, category: 'cat-platos', imageUrl: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r6', code: 'PLT003', name: 'Pollo a la Brasa', description: '1/4 de pollo con papas fritas, ensalada y cremas', price: 28.00, category: 'cat-platos', imageUrl: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r7', code: 'PLT004', name: 'Ají de Gallina', description: 'Pechuga deshilachada en crema de ají amarillo con arroz y papa', price: 32.00, category: 'cat-platos', imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=400&fit=crop', catalogVisible: true },
    // Bebidas
    { id: 'r8', code: 'BEB001', name: 'Chicha Morada', description: 'Refresco tradicional de maíz morado (1 litro)', price: 12.00, category: 'cat-bebidas', imageUrl: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r9', code: 'BEB002', name: 'Pisco Sour', description: 'Cóctel clásico peruano con pisco, limón y clara de huevo', price: 22.00, category: 'cat-bebidas', imageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r10', code: 'BEB003', name: 'Limonada Frozen', description: 'Limonada helada refrescante', price: 10.00, category: 'cat-bebidas', imageUrl: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400&h=400&fit=crop', catalogVisible: true },
    // Postres
    { id: 'r11', code: 'POS001', name: 'Suspiro a la Limeña', description: 'Dulce de leche con merengue de oporto', price: 15.00, category: 'cat-postres', imageUrl: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r12', code: 'POS002', name: 'Picarones', description: '6 picarones con miel de chancaca', price: 18.00, category: 'cat-postres', imageUrl: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=400&fit=crop', catalogVisible: true },
  ],
  categories: [
    { id: 'cat-entradas', name: 'Entradas' },
    { id: 'cat-platos', name: 'Platos de Fondo' },
    { id: 'cat-bebidas', name: 'Bebidas' },
    { id: 'cat-postres', name: 'Postres' },
  ]
}

// Componente principal
export default function CatalogoPublico({ isDemo = false, isRestaurantMenu = false }) {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const tableFromUrl = searchParams.get('mesa') || searchParams.get('table') || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [business, setBusiness] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'

  // Cargar datos del negocio y productos
  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true)
        setError(null)

        // Si es modo demo, usar datos estáticos
        if (isDemo) {
          const demoData = isRestaurantMenu ? DEMO_RESTAURANT_DATA : DEMO_CATALOG_DATA
          setBusiness(demoData.business)
          setProducts(demoData.products)
          setCategories(demoData.categories)
          setLoading(false)
          return
        }

        // Buscar negocio por catalogSlug (tanto para catálogo como para menú digital)
        // El menú digital usa la misma configuración del catálogo, solo cambia la interfaz
        const businessesQuery = query(
          collection(db, 'businesses'),
          where('catalogSlug', '==', slug),
          where('catalogEnabled', '==', true)
        )
        const businessesSnap = await getDocs(businessesQuery)

        if (businessesSnap.empty) {
          setError(isRestaurantMenu ? 'Menú no encontrado' : 'Catálogo no encontrado')
          return
        }

        const businessDoc = businessesSnap.docs[0]
        const businessData = { id: businessDoc.id, ...businessDoc.data() }
        setBusiness(businessData)

        // Cargar productos visibles en catálogo/menú
        const productsQuery = query(
          collection(db, 'businesses', businessDoc.id, 'products'),
          where('catalogVisible', '==', true)
        )
        const productsSnap = await getDocs(productsQuery)
        const productsData = productsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setProducts(productsData)

        // Cargar categorías desde el campo productCategories del negocio
        const categoriesData = businessData.productCategories || []
        setCategories(categoriesData)

      } catch (err) {
        console.error('Error loading catalog:', err)
        setError(isRestaurantMenu ? 'Error al cargar el menú' : 'Error al cargar el catálogo')
      } finally {
        setLoading(false)
      }
    }

    if (slug || isDemo) {
      loadCatalog()
    }
  }, [slug, isDemo, isRestaurantMenu])

  // Obtener categorías raíz (sin parentId) para mostrar en el catálogo
  const rootCategories = useMemo(() => {
    return categories.filter(cat => !cat.parentId && cat.showInCatalog !== false)
  }, [categories])

  // Obtener subcategorías visibles de la categoría raíz seleccionada
  const activeSubcategories = useMemo(() => {
    if (!selectedCategory) return []
    return categories.filter(cat => cat.parentId === selectedCategory && cat.showInCatalog !== false)
  }, [categories, selectedCategory])

  // Función para obtener todos los IDs de subcategorías de una categoría
  const getAllDescendantCategoryIds = (parentId) => {
    const descendants = []
    const findChildren = (id) => {
      categories.forEach(cat => {
        if (cat.parentId === id) {
          descendants.push(cat.id)
          findChildren(cat.id) // Recursivo para subcategorías anidadas
        }
      })
    }
    findChildren(parentId)
    return descendants
  }

  // Filtrar productos
  // IDs de categorías ocultas en el catálogo
  const hiddenCategoryIds = useMemo(() => {
    const hidden = new Set()
    categories.forEach(cat => {
      if (cat.showInCatalog === false) {
        hidden.add(cat.id)
      }
    })
    return hidden
  }, [categories])

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = !searchQuery ||
        product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase())

      // Excluir productos de categorías ocultas
      if (product.category && hiddenCategoryIds.has(product.category)) {
        return false
      }

      // Incluir productos de la categoría/subcategoría seleccionada
      let matchesCategory = !selectedCategory
      if (selectedSubcategory) {
        // Si hay subcategoría seleccionada, filtrar solo por esa subcategoría y sus descendientes
        const descendantIds = getAllDescendantCategoryIds(selectedSubcategory)
        const allCategoryIds = [selectedSubcategory, ...descendantIds]
        matchesCategory = allCategoryIds.includes(product.category)
      } else if (selectedCategory) {
        // Si solo hay categoría raíz, incluir todos sus descendientes
        const descendantIds = getAllDescendantCategoryIds(selectedCategory)
        const allCategoryIds = [selectedCategory, ...descendantIds]
        matchesCategory = allCategoryIds.includes(product.category)
      }

      return matchesSearch && matchesCategory
    })
  }, [products, searchQuery, selectedCategory, selectedSubcategory, categories, hiddenCategoryIds])

  // Configuración de visibilidad de precios
  const showPrices = business?.catalogShowPrices !== false

  // Funciones del carrito
  const addToCart = (product, quantity = 1, selectedModifiers = [], unitPrice = null, priceLevelLabel = null) => {
    // No permitir agregar productos agotados
    if (isProductOutOfStock(product)) return
    setCart(prev => {
      // Generar un ID único para el item del carrito basado en producto + variante + modificadores + nivel de precio
      const variantKey = product.isVariant ? product.variantSku : ''
      const modifiersKey = selectedModifiers.length > 0
        ? JSON.stringify(selectedModifiers.map(m => ({ id: m.modifierId, opts: m.options.map(o => o.optionId).sort() })))
        : ''
      const priceLevelKey = priceLevelLabel || ''
      const cartItemId = `${product.id}-${variantKey}-${modifiersKey}-${priceLevelKey}`

      const existing = prev.find(item => item.cartItemId === cartItemId)
      if (existing) {
        return prev.map(item =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }
      return [...prev, {
        ...product,
        cartItemId,
        quantity,
        selectedModifiers,
        unitPrice: unitPrice || product.price,
        priceLevelLabel
      }]
    })
  }

  const updateCartQuantity = (cartItemId, quantity) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => (item.cartItemId || item.id) !== cartItemId))
    } else {
      setCart(prev => prev.map(item =>
        (item.cartItemId || item.id) === cartItemId ? { ...item, quantity } : item
      ))
    }
  }

  const removeFromCart = (cartItemId) => {
    setCart(prev => prev.filter(item => (item.cartItemId || item.id) !== cartItemId))
  }

  const getCartQuantity = (productId) => {
    // Sumar cantidad de todos los items de este producto (con diferentes modificadores)
    return cart.filter(i => i.id === productId).reduce((sum, item) => sum + item.quantity, 0)
  }

  // Checkout por WhatsApp
  const handleCheckout = () => {
    if (!business?.catalogWhatsapp && !business?.whatsapp && !business?.phone) {
      alert('Este negocio no tiene WhatsApp configurado')
      return
    }

    const phone = (business.catalogWhatsapp || business.whatsapp || business.phone).replace(/\D/g, '')
    const items = cart.map(item => {
      const price = item.unitPrice || item.price
      let itemText = `• ${item.quantity}x ${item.name}`
      // Agregar nivel de precio si no es el default
      if (item.priceLevelLabel) {
        itemText += ` (${item.priceLevelLabel})`
      }
      // Agregar variante si existe
      if (item.isVariant && item.variantAttributes) {
        const attrs = Object.entries(item.variantAttributes).map(([k, v]) => `${k}: ${v}`).join(', ')
        itemText += ` (${attrs})`
      }
      // Agregar modificadores si existen
      if (item.selectedModifiers?.length > 0) {
        const modsText = item.selectedModifiers
          .map(mod => `  - ${mod.modifierName}: ${mod.options.map(o => o.optionName).join(', ')}`)
          .join('\n')
        itemText += `\n${modsText}`
      }
      itemText += ` - S/ ${(price * item.quantity).toFixed(2)}`
      return itemText
    }).join('\n')
    const total = cart.reduce((sum, item) => sum + ((item.unitPrice || item.price) * item.quantity), 0)

    const message = encodeURIComponent(
      `¡Hola! Me gustaría hacer un pedido:\n\n${items}\n\n*Total: S/ ${total.toFixed(2)}*\n\nGracias!`
    )

    window.open(`https://wa.me/${phone}?text=${message}`, '_blank')
  }

  // Total items en carrito
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-48 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-32" />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {[...Array(8)].map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          {isRestaurantMenu ? (
            <UtensilsCrossed className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          ) : (
            <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          )}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{error}</h1>
          <p className="text-gray-600">
            {isRestaurantMenu
              ? 'El menú que buscas no existe o no está disponible'
              : 'El catálogo que buscas no existe o no está disponible'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner de mesa (si viene de QR con número de mesa) */}
      {isRestaurantMenu && tableFromUrl && (
        <div className="bg-emerald-600 text-white py-2 px-4 text-center text-sm font-medium">
          <UtensilsCrossed className="w-4 h-4 inline mr-2" />
          Mesa {tableFromUrl} - Haz tu pedido desde tu celular
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo y nombre */}
            <div className="flex items-center gap-3">
              {business?.logoUrl ? (
                <img
                  src={business.logoUrl}
                  alt={business.name}
                  className="w-10 h-10 md:w-12 md:h-12 rounded-xl object-cover"
                />
              ) : (
                <div
                  className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: business?.catalogColor || '#10B981' }}
                >
                  {isRestaurantMenu ? (
                    <UtensilsCrossed className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  ) : (
                    <Store className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  )}
                </div>
              )}
              <div>
                <h1 className="font-bold text-gray-900 text-lg md:text-xl">
                  {business?.name || business?.businessName}
                </h1>
                {business?.catalogTagline && (
                  <p className="text-sm text-gray-500 hidden md:block">{business.catalogTagline}</p>
                )}
              </div>
            </div>

            {/* Carrito */}
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors"
            >
              <ShoppingBag className="w-5 h-5" />
              <span className="hidden md:inline font-medium">{isRestaurantMenu ? 'Pedido' : 'Carrito'}</span>
              {cartItemsCount > 0 && (
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-sm font-bold">
                  {cartItemsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero / Búsqueda */}
      <div
        className="bg-gradient-to-br from-gray-900 to-gray-800 text-white"
        style={business?.catalogColor ? {
          background: `linear-gradient(135deg, ${business.catalogColor} 0%, ${business.catalogColor}dd 100%)`
        } : {}}
      >
        <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          {business?.catalogWelcome && (
            <p className="text-white/80 mb-4 text-center md:text-left">
              {business.catalogWelcome}
            </p>
          )}

          {/* Barra de búsqueda */}
          <div className="relative max-w-2xl mx-auto md:mx-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white text-gray-900 placeholder-gray-400 shadow-lg focus:outline-none focus:ring-4 focus:ring-white/30"
            />
          </div>
        </div>
      </div>

      {/* Observaciones del catálogo */}
      {business?.catalogObservations && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div
            className="rounded-xl p-4 flex items-start gap-3"
            style={{ backgroundColor: `${business.catalogColor || '#10B981'}10`, borderLeft: `4px solid ${business.catalogColor || '#10B981'}` }}
          >
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: business.catalogColor || '#10B981' }} />
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{business.catalogObservations}</p>
          </div>
        </div>
      )}

      {/* Categorías */}
      {rootCategories.length > 0 && (
        <div className="bg-white border-b sticky top-16 md:top-20 z-30">
          <div className="max-w-7xl mx-auto px-4">
            {/* Categorías raíz */}
            <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null) }}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  !selectedCategory
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todos
              </button>
              {rootCategories.map(category => (
                <button
                  key={category.id}
                  onClick={() => { setSelectedCategory(category.id); setSelectedSubcategory(null) }}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === category.id
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
            {/* Subcategorías de la categoría seleccionada */}
            {activeSubcategories.length > 0 && (
              <div className="flex items-center gap-2 pb-3 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setSelectedSubcategory(null)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    !selectedSubcategory
                      ? 'bg-primary-600 text-white'
                      : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                  }`}
                >
                  Todas
                </button>
                {activeSubcategories.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setSelectedSubcategory(sub.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedSubcategory === sub.id
                        ? 'bg-primary-600 text-white'
                        : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Productos */}
      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Header de resultados */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-600">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'producto' : 'productos'}
            {selectedCategory && rootCategories.find(c => c.id === selectedCategory) && (
              <span> en <strong>
                {rootCategories.find(c => c.id === selectedCategory).name}
                {selectedSubcategory && activeSubcategories.find(c => c.id === selectedSubcategory) && (
                  <> &rsaquo; {activeSubcategories.find(c => c.id === selectedSubcategory).name}</>
                )}
              </strong></span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            >
              <Grid3X3 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron productos</h3>
            <p className="text-gray-600">Intenta con otra búsqueda o categoría</p>
          </div>
        ) : viewMode === 'grid' ? (
          // Vista Grid
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filteredProducts.map(product => {
              const cartQty = getCartQuantity(product.id)
              const outOfStock = isProductOutOfStock(product)
              const priceRange = getProductPriceRange(product, business)
              return (
                <div
                  key={product.id}
                  className={`bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group ${outOfStock ? 'opacity-75' : ''}`}
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="relative aspect-square bg-gray-100 overflow-hidden">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${outOfStock ? 'grayscale opacity-60' : ''}`}
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${outOfStock ? 'opacity-50' : ''}`}>
                        <Package className="w-12 h-12 text-gray-300" />
                      </div>
                    )}
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-red-600 text-white px-3 py-1 rounded-md text-xs font-bold shadow-lg tracking-wide">
                          AGOTADO
                        </span>
                      </div>
                    )}
                    {cartQty > 0 && !outOfStock && (
                      <div className="absolute top-3 right-3 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg">
                        {cartQty}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{product.name}</h3>
                    {product.description && (
                      <p className="text-sm text-gray-500 mb-2 line-clamp-1">{product.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      {showPrices ? (
                        <span className={`text-lg font-bold ${outOfStock ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {product.hasVariants && product.variants?.length > 0
                            ? `Desde S/ ${Math.min(...product.variants.map(v => v.price)).toFixed(2)}`
                            : priceRange
                              ? `S/ ${priceRange.min.toFixed(2)} ~ S/ ${priceRange.max.toFixed(2)}`
                              : `S/ ${product.price?.toFixed(2)}`
                          }
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">Consultar</span>
                      )}
                      {outOfStock ? (
                        <span className="text-xs font-semibold text-red-500">Sin stock</span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (product.hasVariants || product.modifiers?.length > 0 || priceRange) {
                              setSelectedProduct(product)
                            } else {
                              addToCart(product)
                            }
                          }}
                          className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 transition-colors"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // Vista Lista
          <div className="space-y-4">
            {filteredProducts.map(product => {
              const cartQty = getCartQuantity(product.id)
              const outOfStock = isProductOutOfStock(product)
              const priceRange = getProductPriceRange(product, business)
              return (
                <div
                  key={product.id}
                  className={`bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow cursor-pointer flex ${outOfStock ? 'opacity-75' : ''}`}
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="w-32 h-32 md:w-40 md:h-40 flex-shrink-0 bg-gray-100 relative">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className={`w-full h-full object-cover ${outOfStock ? 'grayscale opacity-60' : ''}`}
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${outOfStock ? 'opacity-50' : ''}`}>
                        <Package className="w-10 h-10 text-gray-300" />
                      </div>
                    )}
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-red-600 text-white px-2 py-1 rounded-md text-xs font-bold shadow-lg tracking-wide">
                          AGOTADO
                        </span>
                      </div>
                    )}
                    {cartQty > 0 && !outOfStock && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {cartQty}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">{product.name}</h3>
                      {product.description && (
                        <p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      {showPrices ? (
                        <span className={`text-xl font-bold ${outOfStock ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {product.hasVariants && product.variants?.length > 0
                            ? `Desde S/ ${Math.min(...product.variants.map(v => v.price)).toFixed(2)}`
                            : priceRange
                              ? `S/ ${priceRange.min.toFixed(2)} ~ S/ ${priceRange.max.toFixed(2)}`
                              : `S/ ${product.price?.toFixed(2)}`
                          }
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">Consultar precio</span>
                      )}
                      {outOfStock ? (
                        <span className="px-4 py-2 rounded-full bg-red-50 text-red-500 text-sm font-semibold">
                          Agotado
                        </span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (product.hasVariants || product.modifiers?.length > 0 || priceRange) {
                              setSelectedProduct(product)
                            } else {
                              addToCart(product)
                            }
                          }}
                          className="px-4 py-2 rounded-full bg-gray-900 text-white flex items-center gap-2 hover:bg-gray-800 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="hidden md:inline">Agregar</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Footer con info del negocio */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              {business?.logoUrl ? (
                <img
                  src={business.logoUrl}
                  alt={business.name}
                  className="w-12 h-12 rounded-xl object-cover"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: business?.catalogColor || '#10B981' }}
                >
                  <Store className="w-6 h-6 text-white" />
                </div>
              )}
              <div>
                <h2 className="font-bold text-gray-900">
                  {business?.name || business?.businessName}
                </h2>
                {business?.address && (
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {business.address}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {(business?.catalogWhatsapp || business?.whatsapp || business?.phone) && (
                <a
                  href={`https://wa.me/${(business.catalogWhatsapp || business.whatsapp || business.phone).replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  WhatsApp
                </a>
              )}
              {business?.phone && (
                <a
                  href={`tel:${business.phone}`}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                >
                  <Phone className="w-5 h-5" />
                  Llamar
                </a>
              )}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t text-center text-sm text-gray-400">
            Catálogo powered by <a href="https://cobrifyperu.com" className="text-gray-600 hover:underline">Cobrify</a>
          </div>
        </div>
      </footer>

      {/* Floating cart button (mobile) */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-6 left-4 right-4 md:hidden z-40">
          <button
            onClick={() => setCartOpen(true)}
            className={`w-full py-4 text-white rounded-2xl font-semibold shadow-2xl flex items-center justify-center gap-3 ${
              isRestaurantMenu ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-900'
            }`}
          >
            {isRestaurantMenu ? <UtensilsCrossed className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
            {isRestaurantMenu ? `Ver pedido (${cartItemsCount})` : `Ver carrito (${cartItemsCount})`}
            {showPrices && (
              <span className="bg-white/20 px-3 py-1 rounded-full">
                S/ {cart.reduce((sum, item) => sum + ((item.unitPrice || item.price) * item.quantity), 0).toFixed(2)}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Product Modal */}
      <ProductModal
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={addToCart}
        cartQuantity={selectedProduct ? getCartQuantity(selectedProduct.id) : 0}
        showPrices={showPrices}
        business={business}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onUpdateQuantity={updateCartQuantity}
        onRemove={removeFromCart}
        business={business}
        onCheckout={handleCheckout}
        showPrices={showPrices}
        isRestaurantMenu={isRestaurantMenu}
        tableNumber={tableFromUrl}
      />
    </div>
  )
}
