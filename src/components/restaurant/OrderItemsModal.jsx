import { useState, useEffect } from 'react'
import { ShoppingCart, Plus, Minus, Search, Loader2, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { getProducts } from '@/services/firestoreService'
import { addOrderItems } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'

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
  const { getBusinessId } = useAppContext()
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
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [cart, setCart] = useState([])
  const [isCartExpanded, setIsCartExpanded] = useState(false)

  // Cargar productos
  useEffect(() => {
    if (isOpen) {
      loadProducts()
    }
  }, [isOpen])

  // Extraer categorías únicas de los productos
  useEffect(() => {
    if (products.length > 0) {
      const productCategories = products
        .map(p => p.category)
        .filter(cat => cat && cat.trim() !== '') // Filtrar vacíos y null
      const uniqueCategories = ['Todos', ...new Set(productCategories)]
      setCategories(uniqueCategories)
      console.log('📦 Categorías encontradas:', uniqueCategories)
    }
  }, [products])

  // Filtrar productos por búsqueda y categoría
  useEffect(() => {
    let filtered = products

    // Filtrar por categoría
    if (selectedCategory !== 'Todos') {
      filtered = filtered.filter(p => p.category === selectedCategory)
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
  }, [searchTerm, selectedCategory, products])

  const loadProducts = async () => {
    setIsLoading(true)
    try {
      // En modo demo, usar productos del contexto de demo
      if (isDemoMode && demoData?.products) {
        const allProducts = demoData.products || []
        setProducts(allProducts)
        setFilteredProducts(allProducts)
      } else if (demoContext) {
        // Si está en el layout de demo pero no hay productos, mostrar productos de ejemplo
        const demoProducts = demoContext.demoData?.products || []
        if (demoProducts.length > 0) {
          setProducts(demoProducts)
          setFilteredProducts(demoProducts)
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
        }
      } else {
        // En modo normal, cargar desde Firebase
        const result = await getProducts(getBusinessId())
        if (result.success) {
          const allProducts = result.data || []
          setProducts(allProducts)
          setFilteredProducts(allProducts)
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

  const addToCart = (product) => {
    const existingItem = cart.find((item) => item.productId === product.id)

    if (existingItem) {
      // Incrementar cantidad
      setCart(
        cart.map((item) =>
          item.productId === product.id
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
          price: product.price || 0,
          quantity: 1,
          total: product.price || 0,
          notes: '', // Inicializar campo de notas vacío
        },
      ])
    }
  }

  const removeFromCart = (productId) => {
    setCart(cart.filter((item) => item.productId !== productId))
  }

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId)
    } else {
      setCart(
        cart.map((item) =>
          item.productId === productId
            ? { ...item, quantity: newQuantity, total: newQuantity * item.price }
            : item
        )
      )
    }
  }

  const updateNotes = (productId, notes) => {
    setCart(
      cart.map((item) =>
        item.productId === productId
          ? { ...item, notes: notes }
          : item
      )
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
    onClose()
  }

  // Solo validar si NO es una nueva orden
  if (!isNewOrder && (!table || !order)) return null

  // Calcular total del carrito
  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0)
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

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
      fullscreenOnMobile={true}
    >
      <div className="flex flex-col h-full max-h-[85vh]">
        {/* Filtros de Categoría */}
        <div className="mb-3 flex-shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  selectedCategory === category
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                {category || 'Sin categoría'}
              </button>
            ))}
          </div>
        </div>

        {/* Buscador */}
        <div className="mb-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-3 overflow-hidden min-h-0">
          {/* Lista de productos */}
          <div className="flex-1 overflow-y-auto border rounded-lg p-3 min-h-0">
            <h3 className="font-semibold text-sm text-gray-900 mb-2">
              Productos {selectedCategory !== 'Todos' && `- ${selectedCategory}`} ({filteredProducts.length})
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                {searchTerm ? 'No se encontraron productos' : 'No hay productos disponibles'}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">{product.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        {product.code && <span className="truncate">#{product.code}</span>}
                        <span className="font-semibold text-primary-600">
                          S/ {(product.price || 0).toFixed(2)}
                        </span>
                        {product.stock !== undefined && (
                          <span className="text-gray-400">Stock: {product.stock}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => addToCart(product)}
                      size="sm"
                      className="ml-2 h-8 w-8 p-0 flex-shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Carrito - Hidden en móvil si está vacío, visible en desktop */}
          <div className={`w-full lg:w-80 border rounded-lg flex flex-col ${cart.length === 0 ? 'hidden lg:flex p-4' : 'p-2 lg:p-3'}`}>
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="font-semibold text-sm text-gray-900">
                Carrito ({cartCount})
              </h3>
              {cart.length > 0 && (
                <button
                  onClick={() => setIsCartExpanded(!isCartExpanded)}
                  className="lg:hidden text-xs text-primary-600 font-medium"
                >
                  {isCartExpanded ? 'Ocultar' : 'Ver todo'}
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-xs py-8">
                Agrega productos
              </div>
            ) : (
              <>
                {/* Vista compacta en móvil / expandida */}
                <div className={`flex-1 overflow-y-auto space-y-1.5 mb-2 min-h-0 ${isCartExpanded ? '' : 'hidden lg:block'}`}>
                  {cart.map((item) => (
                    <div key={item.productId} className="border rounded p-2 bg-white">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs text-gray-900 truncate">{item.name}</div>
                          <div className="text-xs text-gray-500">
                            S/ {item.price.toFixed(2)} c/u
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="text-red-500 hover:text-red-700 flex-shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="w-6 h-6 p-0"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            className="w-6 h-6 p-0"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="font-bold text-xs text-gray-900">
                          S/ {item.total.toFixed(2)}
                        </div>
                      </div>

                      {/* Campo de notas - colapsable */}
                      <div className="mt-1">
                        <textarea
                          value={item.notes || ''}
                          onChange={(e) => updateNotes(item.productId, e.target.value)}
                          placeholder="Especificaciones..."
                          className="w-full text-xs px-1.5 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500 resize-none"
                          rows={1}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Resumen compacto - visible cuando está colapsado en móvil */}
                {!isCartExpanded && (
                  <div className="lg:hidden space-y-1 mb-2">
                    {cart.slice(0, 2).map((item) => (
                      <div key={item.productId} className="flex items-center justify-between text-xs py-1 border-b">
                        <span className="truncate flex-1">{item.quantity}x {item.name}</span>
                        <span className="font-medium ml-2">S/ {item.total.toFixed(2)}</span>
                      </div>
                    ))}
                    {cart.length > 2 && (
                      <div className="text-xs text-gray-500 text-center py-1">
                        +{cart.length - 2} más...
                      </div>
                    )}
                  </div>
                )}

                {/* Total */}
                <div className="border-t pt-2 flex-shrink-0">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Total:</span>
                    <span className="text-primary-600">
                      S/ {cartTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Botones - Sticky footer en móvil */}
        <div className="flex gap-2 mt-3 pt-3 border-t flex-shrink-0 sticky bottom-0 bg-white -mx-6 px-6 pb-3 md:static md:mx-0 md:px-0 md:pb-0">
          <Button type="button" variant="outline" onClick={handleClose} className="flex-1 text-sm py-2">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || cart.length === 0}
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-sm py-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Guardando...
              </>
            ) : (
              `Agregar ${cart.length} items`
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
