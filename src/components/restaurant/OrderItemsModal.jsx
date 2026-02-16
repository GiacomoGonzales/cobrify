import { useState, useEffect } from 'react'
import { ShoppingCart, Plus, Minus, Search, Loader2, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { getProducts, getProductCategories } from '@/services/firestoreService'
import { addOrderItems } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'
import ModifierSelectorModal from '@/components/restaurant/ModifierSelectorModal'

export default function OrderItemsModal({
  isOpen,
  onClose,
  table,
  order,
  onSuccess,
  isNewOrder = false,
  newOrderData = null,
  onSaveNewOrder = null
}) {
  const { getBusinessId, businessSettings } = useAppContext()
  const demoContext = useDemoRestaurant()
  const toast = useToast()

  // Detectar si estamos en modo demo restaurant
  const isDemoMode = !!demoContext?.demoData
  const demoData = demoContext?.demoData

  const [products, setProducts] = useState([])
  const [filteredProducts, setFilteredProducts] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Todos')
  const [categories, setCategories] = useState(['Todos'])
  const [categoryMap, setCategoryMap] = useState({}) // Mapeo de ID a nombre de categoría
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [cart, setCart] = useState([])

  // Modifier selector state
  const [isModifierModalOpen, setIsModifierModalOpen] = useState(false)
  const [productForModifiers, setProductForModifiers] = useState(null)

  // Price selection state (multiple prices)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [productForPriceSelection, setProductForPriceSelection] = useState(null)

  // Cargar productos
  useEffect(() => {
    if (isOpen) {
      loadProducts()
    }
  }, [isOpen])

  // Helper para obtener el nombre de la categoría
  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'Sin categoría'
    return categoryMap[categoryId] || categoryId
  }

  // Filtrar productos por búsqueda y categoría
  useEffect(() => {
    let filtered = products

    // Filtrar por categoría
    if (selectedCategory !== 'Todos') {
      filtered = filtered.filter((p) => {
        const categoryName = getCategoryName(p.category)
        return categoryName === selectedCategory
      })
    }

    // Filtrar por búsqueda
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.code?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    setFilteredProducts(filtered)
  }, [searchTerm, selectedCategory, products, categoryMap])

  const loadProducts = async () => {
    setIsLoading(true)
    try {
      const businessId = getBusinessId()

      // Cargar categorías primero (en modo normal)
      let categoriesData = []
      let catMap = {}

      if (!isDemoMode && !demoContext) {
        const categoriesResult = await getProductCategories(businessId)
        if (categoriesResult.success) {
          categoriesData = categoriesResult.data || []
          // Crear mapeo de ID a nombre
          categoriesData.forEach(cat => {
            catMap[cat.id] = cat.name
          })
          setCategoryMap(catMap)
        }
      }

      // En modo demo, usar productos del contexto de demo
      if (isDemoMode && demoData?.products) {
        const allProducts = demoData.products || []
        setProducts(allProducts)
        setFilteredProducts(allProducts)

        // Extraer categorías únicas con nombres reales usando el mapa de categorías
        const categoryNames = allProducts
          .map(p => p.category ? (catMap[p.category] || p.category) : null)
          .filter(Boolean)
        const uniqueCategoryNames = ['Todos', ...new Set(categoryNames)]
        setCategories(uniqueCategoryNames)
      } else if (demoContext) {
        // Si está en el layout de demo pero no hay productos, mostrar productos de ejemplo
        const demoProducts = demoContext.demoData?.products || []
        if (demoProducts.length > 0) {
          setProducts(demoProducts)
          setFilteredProducts(demoProducts)

          // Extraer categorías únicas con nombres reales usando el mapa de categorías
          const categoryNames = demoProducts
            .map(p => p.category ? (catMap[p.category] || p.category) : null)
            .filter(Boolean)
          const uniqueCategoryNames = ['Todos', ...new Set(categoryNames)]
          setCategories(uniqueCategoryNames)
        } else {
          // Fallback: productos hardcodeados para demo
          const fallbackProducts = [
            { id: '1', code: 'PLT001', name: 'Ceviche de Pescado', price: 32.00, category: 'Entradas', unit: 'PLATO' },
            { id: '2', code: 'PLT002', name: 'Lomo Saltado', price: 28.00, category: 'Platos de Fondo', unit: 'PLATO' },
            { id: '3', code: 'PLT003', name: 'Arroz con Pollo', price: 22.00, category: 'Platos de Fondo', unit: 'PLATO' },
            { id: '4', code: 'PLT004', name: 'Ají de Gallina', price: 24.00, category: 'Platos de Fondo', unit: 'PLATO' },
            { id: '5', code: 'BEB001', name: 'Chicha Morada', price: 12.00, category: 'Bebidas', unit: 'JARRA' },
            { id: '6', code: 'BEB002', name: 'Inca Kola', price: 5.00, category: 'Bebidas', unit: 'UNIDAD' },
          ]
          setProducts(fallbackProducts)
          setFilteredProducts(fallbackProducts)

          // Extraer categorías únicas
          const uniqueCategories = ['Todos', 'Entradas', 'Platos de Fondo', 'Bebidas']
          setCategories(uniqueCategories)
        }
      } else {
        // En modo normal, cargar desde Firebase
        const result = await getProducts(businessId)
        if (result.success) {
          const allProducts = result.data || []
          setProducts(allProducts)
          setFilteredProducts(allProducts)

          // Extraer categorías únicas con nombres reales usando el mapa de categorías
          const categoryNames = allProducts
            .map(p => p.category ? (catMap[p.category] || p.category) : null)
            .filter(Boolean)
          const uniqueCategoryNames = ['Todos', ...new Set(categoryNames)]
          setCategories(uniqueCategoryNames)
        } else {
          console.error('Error al cargar productos:', result.error)
          toast.error('Error al cargar productos: ' + result.error)
        }
      }
    } catch (error) {
      console.error('Error al cargar productos:', error)
      toast.error('Error al cargar productos')
    } finally {
      setIsLoading(false)
    }
  }

  const addToCart = (product, selectedPrice = null) => {
    // Si el producto tiene modificadores, abrir modal de selección
    if (product.modifiers && product.modifiers.length > 0) {
      setProductForModifiers(product)
      setIsModifierModalOpen(true)
      return
    }

    // Verificar si tiene múltiples precios y no viene con precio ya seleccionado
    const hasMultiplePrices = businessSettings?.multiplePricesEnabled && (product.price2 || product.price3 || product.price4)
    if (hasMultiplePrices && selectedPrice === null) {
      setProductForPriceSelection(product)
      setShowPriceModal(true)
      return
    }

    const price = selectedPrice ?? product.price ?? 0

    // Si no tiene modificadores, agregar directamente al carrito
    const existingItem = cart.find((item) => item.productId === product.id && !item.modifiers && item.price === price)

    if (existingItem) {
      // Incrementar cantidad
      setCart(
        cart.map((item) =>
          item.productId === product.id && !item.modifiers && item.price === price
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
            : item
        )
      )
    } else {
      // Agregar nuevo item
      setCart([
        ...cart,
        {
          productId: product.id,
          name: product.name,
          code: product.code,
          price: price,
          quantity: 1,
          total: price,
          notes: '',
          category: getCategoryName(product.category),
        },
      ])
    }
  }

  // Manejar selección de precio desde el modal
  const handlePriceSelection = (priceLevel) => {
    if (!productForPriceSelection) return

    const product = productForPriceSelection
    let selected = product.price

    if (priceLevel === 'price2' && product.price2) {
      selected = product.price2
    } else if (priceLevel === 'price3' && product.price3) {
      selected = product.price3
    } else if (priceLevel === 'price4' && product.price4) {
      selected = product.price4
    }

    addToCart(product, selected)
    setShowPriceModal(false)
    setProductForPriceSelection(null)
  }

  // Agregar al carrito con modificadores seleccionados
  const addToCartWithModifiers = (data) => {
    const { selectedModifiers, totalPrice } = data

    // Crear un identificador único basado en los modificadores seleccionados
    const modifierKey = selectedModifiers
      .map(m => `${m.modifierId}:${m.options.map(o => o.optionId).join(',')}`)
      .join('|')

    // Buscar si ya existe un item idéntico (mismo producto + mismos modificadores)
    const existingItem = cart.find(
      item =>
        item.productId === productForModifiers.id &&
        item.modifierKey === modifierKey
    )

    if (existingItem) {
      // Incrementar cantidad del item existente
      setCart(
        cart.map((item) =>
          item.productId === productForModifiers.id && item.modifierKey === modifierKey
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * totalPrice }
            : item
        )
      )
    } else {
      // Agregar nuevo item con modificadores
      setCart([
        ...cart,
        {
          productId: productForModifiers.id,
          name: productForModifiers.name,
          code: productForModifiers.code,
          price: totalPrice, // Precio con modificadores incluidos
          basePrice: productForModifiers.price, // Precio base sin modificadores
          quantity: 1,
          total: totalPrice,
          notes: '',
          modifiers: selectedModifiers, // Guardar modificadores seleccionados
          modifierKey: modifierKey, // Para identificar items únicos
          category: getCategoryName(productForModifiers.category), // Categoría para filtrado por estación
        },
      ])
    }

    // Cerrar modal y limpiar
    setIsModifierModalOpen(false)
    setProductForModifiers(null)
    toast.success('Producto agregado con personalizaciones')
  }

  const removeFromCart = (productId, modifierKey = null) => {
    setCart(cart.filter((item) => {
      if (modifierKey) {
        return !(item.productId === productId && item.modifierKey === modifierKey)
      }
      return !(item.productId === productId && !item.modifierKey)
    }))
  }

  const updateQuantity = (productId, newQuantity, modifierKey = null) => {
    if (newQuantity <= 0) {
      removeFromCart(productId, modifierKey)
    } else {
      setCart(
        cart.map((item) => {
          const matches = modifierKey
            ? item.productId === productId && item.modifierKey === modifierKey
            : item.productId === productId && !item.modifierKey

          return matches
            ? { ...item, quantity: newQuantity, total: newQuantity * item.price }
            : item
        })
      )
    }
  }

  const updateNotes = (productId, notes, modifierKey = null) => {
    setCart(
      cart.map((item) => {
        const matches = modifierKey
          ? item.productId === productId && item.modifierKey === modifierKey
          : item.productId === productId && !item.modifierKey

        return matches ? { ...item, notes: notes } : item
      })
    )
  }

  const handleSave = async () => {
    if (cart.length === 0) {
      toast.warning('Agrega al menos un producto')
      return
    }

    setIsSaving(true)
    try {
      // Si es una nueva orden (desde Orders.jsx), usar el callback especial
      if (isNewOrder && onSaveNewOrder) {
        await onSaveNewOrder(cart)
        setCart([])
        onClose()
      }
      // En modo demo, mostrar mensaje amigable
      else if (isDemoMode || demoContext) {
        toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
        setCart([])
        onClose()
      } else {
        // En modo normal, agregar items a orden existente
        const result = await addOrderItems(getBusinessId(), order.id, cart)
        if (result.success) {
          toast.success(`${cart.length} items agregados a la orden`)
          setCart([])
          if (onSuccess) onSuccess()
          onClose()
        } else {
          toast.error('Error al agregar items: ' + result.error)
        }
      }
    } catch (error) {
      console.error('Error al agregar items:', error)
      toast.error('Error al agregar items')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    setCart([])
    setSearchTerm('')
    setSelectedCategory('Todos')
    onClose()
  }

  // Solo validar si NO es una nueva orden
  if (!isNewOrder && (!table || !order)) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          <div>
            <div className="text-lg font-bold">
              {isNewOrder
                ? `Agregar Items - ${table?.number || 'Nueva Orden'}`
                : `Agregar Items - Mesa ${table?.number}`}
            </div>
            {!isNewOrder && (
              <div className="text-sm font-normal text-gray-600">
                Mozo: {table?.waiter} | Orden: {order?.orderNumber || '#' + order?.id.slice(-6)}
              </div>
            )}
          </div>
        </div>
      }
      size="xl"
      fullScreenMobile={true}
    >
      <div className="flex flex-col h-full lg:h-[600px]">
        {/* Contenedor con scroll único */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Buscador */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder="Buscar productos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Filtros de categorías */}
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    selectedCategory === category
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4">
            {/* Lista de productos */}
            <div className="flex-1 border rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Productos Disponibles</h3>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {searchTerm ? 'No se encontraron productos' : 'No hay productos disponibles'}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{product.name}</div>
                        <div className="text-sm text-gray-500">
                          {product.code && <span className="mr-2">Código: {product.code}</span>}
                          <span className="font-semibold text-primary-600">
                            S/ {(product.price || 0).toFixed(2)}
                          </span>
                          {businessSettings?.multiplePricesEnabled && product.price2 && (
                            <span className="ml-2 font-semibold text-green-600">
                              / S/ {product.price2.toFixed(2)}
                            </span>
                          )}
                        </div>
                        {product.stock !== undefined && (
                          <div className="text-xs text-gray-500">Stock: {product.stock}</div>
                        )}
                      </div>
                      <Button
                        onClick={() => addToCart(product)}
                        size="sm"
                        className="ml-3"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Carrito */}
            <div className="w-full lg:w-80 border rounded-lg p-4 flex flex-col">
              <h3 className="font-semibold text-gray-900 mb-3">
                Carrito ({cart.length} items)
              </h3>

              {cart.length === 0 ? (
                <div className="flex items-center justify-center text-gray-500 text-sm py-8">
                  Agrega productos al carrito
                </div>
              ) : (
                <>
                  <div className="space-y-2 mb-4">
                  {cart.map((item) => (
                    <div key={`${item.productId}-${item.modifierKey || 'no-mod'}`} className="border rounded-lg p-3 bg-white">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-500">
                            S/ {item.price.toFixed(2)} c/u
                          </div>

                          {/* Mostrar modificadores si existen */}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="mt-1 space-y-1">
                              {item.modifiers.map((modifier) => (
                                <div key={modifier.modifierId} className="bg-primary-50 border border-primary-200 rounded px-2 py-1">
                                  <div className="text-xs font-semibold text-primary-900">
                                    {modifier.modifierName}:
                                  </div>
                                  <div className="text-xs text-primary-700">
                                    {modifier.options.map((opt, idx) => (
                                      <span key={opt.optionId}>
                                        {opt.optionName}
                                        {opt.priceAdjustment > 0 && ` (+S/ ${opt.priceAdjustment.toFixed(2)})`}
                                        {idx < modifier.options.length - 1 && ', '}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromCart(item.productId, item.modifierKey)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.productId, item.quantity - 1, item.modifierKey)}
                            className="w-8 h-8 p-0"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.productId, item.quantity + 1, item.modifierKey)}
                            className="w-8 h-8 p-0"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="font-bold text-gray-900">
                          S/ {item.total.toFixed(2)}
                        </div>
                      </div>

                      {/* Campo de notas/especificaciones */}
                      <div className="mt-2">
                        <textarea
                          value={item.notes || ''}
                          onChange={(e) => updateNotes(item.productId, e.target.value, item.modifierKey)}
                          placeholder="Especificaciones: sin lechuga, extra crema, etc..."
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500 resize-none"
                          rows={2}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                  {/* Total simple (sin desglose de IGV) */}
                  <div className="border-t pt-3">
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total:</span>
                      <span className="text-primary-600">
                        S/ {cart.reduce((sum, item) => sum + item.total, 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 text-center mt-2">
                      Los montos detallados aparecerán en la precuenta
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-4 border-t flex-shrink-0 sticky bottom-0 bg-white -mx-6 px-6 -mb-6 pb-6">
          <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || cart.length === 0}
            className="flex-1 bg-primary-600 hover:bg-primary-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              `Agregar ${cart.length} items`
            )}
          </Button>
        </div>
      </div>

      {/* Modal de selección de modificadores */}
      <ModifierSelectorModal
        isOpen={isModifierModalOpen}
        onClose={() => {
          setIsModifierModalOpen(false)
          setProductForModifiers(null)
        }}
        product={productForModifiers}
        onConfirm={addToCartWithModifiers}
      />

      {/* Modal de selección de precio */}
      <Modal
        isOpen={showPriceModal}
        onClose={() => {
          setShowPriceModal(false)
          setProductForPriceSelection(null)
        }}
        title={`Seleccionar precio - ${productForPriceSelection?.name || ''}`}
        size="sm"
      >
        {productForPriceSelection && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <p className="text-sm text-gray-600">
              Este producto tiene múltiples precios. Selecciona el precio a aplicar:
            </p>

            <div className="space-y-3">
              <button
                onClick={() => handlePriceSelection('price1')}
                className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {businessSettings?.priceLabels?.price1 || 'Precio 1'}
                    </p>
                    <p className="text-xs text-gray-500">Precio principal</p>
                  </div>
                  <p className="text-xl font-bold text-primary-600">
                    S/ {(productForPriceSelection.price || 0).toFixed(2)}
                  </p>
                </div>
              </button>

              {productForPriceSelection.price2 && (
                <button
                  onClick={() => handlePriceSelection('price2')}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {businessSettings?.priceLabels?.price2 || 'Precio 2'}
                      </p>
                      <p className="text-xs text-gray-500">Precio alternativo</p>
                    </div>
                    <p className="text-xl font-bold text-green-600">
                      S/ {productForPriceSelection.price2.toFixed(2)}
                    </p>
                  </div>
                </button>
              )}

              {productForPriceSelection.price3 && (
                <button
                  onClick={() => handlePriceSelection('price3')}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {businessSettings?.priceLabels?.price3 || 'Precio 3'}
                      </p>
                      <p className="text-xs text-gray-500">Precio especial</p>
                    </div>
                    <p className="text-xl font-bold text-amber-600">
                      S/ {productForPriceSelection.price3.toFixed(2)}
                    </p>
                  </div>
                </button>
              )}

              {productForPriceSelection.price4 && (
                <button
                  onClick={() => handlePriceSelection('price4')}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-primary-500 hover:bg-primary-50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {businessSettings?.priceLabels?.price4 || 'Precio 4'}
                      </p>
                      <p className="text-xs text-gray-500">Precio personalizado</p>
                    </div>
                    <p className="text-xl font-bold text-purple-600">
                      S/ {productForPriceSelection.price4.toFixed(2)}
                    </p>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Modal>
  )
}
