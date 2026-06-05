import { useState, useEffect } from 'react'
import { ShoppingCart, Plus, Minus, Search, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { getProducts, getProductCategories } from '@/services/firestoreService'
import { addOrderItems } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'
import ModifierSelectorModal from '@/components/restaurant/ModifierSelectorModal'
import { cn } from '@/lib/utils'

export default function OrderItemsModal({
  isOpen,
  onClose,
  table,
  order,
  onSuccess,
  isNewOrder = false,
  newOrderData = null,
  onSaveNewOrder = null,
  onAfterAddItems = null
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

  // Colapso de la seccion de categorias (como en el POS). Persiste en localStorage.
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(() => {
    try {
      return localStorage.getItem('mesa_order_categories_collapsed') === 'true'
    } catch (e) { void e; return false }
  })
  const toggleCategoriesCollapsed = () => {
    setCategoriesCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('mesa_order_categories_collapsed', String(next)) } catch (e) { void e }
      return next
    })
  }

  // En movil el carrito se abre como overlay (en desktop esta fijo a la derecha)
  const [showMobileCart, setShowMobileCart] = useState(false)

  // Cargar productos
  useEffect(() => {
    if (isOpen) {
      // Siempre abrir mostrando la lista de productos, no el carrito. Sin esto, si el
      // usuario cierra el modal con el carrito abierto (via "Agregar items"), al reabrir
      // veria el carrito primero porque el componente no se desmonta.
      setShowMobileCart(false)
      loadProducts()
    }
  }, [isOpen])

  // Helper para obtener el nombre de la categoría
  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'Sin categoría'
    return categoryMap[categoryId] || categoryId
  }

  // Devuelve los nombres únicos de categorías en el orden en que aparecen en
  // "Productos y Servicios" (DFS por árbol parent-child, ordenado por `order`
  // dentro de cada nivel). Solo incluye nombres que tengan al menos un producto.
  // Dedupe por nombre para que parent + subcategoría con mismo nombre se agrupen.
  const buildOrderedCategoryNames = (categoriesData, productList) => {
    // Set de nombres que aparecen en al menos un producto
    const namesInProducts = new Set()
    productList.forEach((p) => {
      if (!p.category) return
      const cat = (categoriesData || []).find((c) => c.id === p.category)
      const name = cat?.name || p.category
      namesInProducts.add(name)
    })

    if (!Array.isArray(categoriesData) || categoriesData.length === 0) {
      // Sin tabla de categorías: dedupe simple por nombre, en orden de aparición de productos
      const fallback = []
      const seen = new Set()
      productList.forEach((p) => {
        if (!p.category) return
        const name = p.category
        if (!seen.has(name)) {
          seen.add(name)
          fallback.push(name)
        }
      })
      return fallback
    }

    const result = []
    const seen = new Set()
    const sortByOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999)

    const visit = (cat) => {
      if (namesInProducts.has(cat.name) && !seen.has(cat.name)) {
        result.push(cat.name)
        seen.add(cat.name)
      }
      // Visitar subcategorías
      const children = categoriesData
        .filter((c) => c.parentId === cat.id)
        .sort(sortByOrder)
      children.forEach(visit)
    }

    const roots = categoriesData
      .filter((c) => !c.parentId)
      .sort(sortByOrder)
    roots.forEach(visit)

    // Categorías "huérfanas" (su parentId apunta a algo que no existe): agrégalas al final
    categoriesData.forEach((cat) => {
      if (cat.parentId && !categoriesData.some((c) => c.id === cat.parentId)) {
        if (namesInProducts.has(cat.name) && !seen.has(cat.name)) {
          result.push(cat.name)
          seen.add(cat.name)
        }
      }
    })

    return result
  }

  // Filtrar productos por búsqueda y categoría
  useEffect(() => {
    // Excluir productos desactivados (isActive === false) en cualquier origen (incl. demo).
    let filtered = products.filter((p) => p.isActive !== false)

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

        // Categorías ordenadas según la jerarquía de "Productos y Servicios"
        const orderedNames = buildOrderedCategoryNames(categoriesData, allProducts)
        setCategories(['Todos', ...orderedNames])
      } else if (demoContext) {
        // Si está en el layout de demo pero no hay productos, mostrar productos de ejemplo
        const demoProducts = demoContext.demoData?.products || []
        if (demoProducts.length > 0) {
          setProducts(demoProducts)
          setFilteredProducts(demoProducts)

          const orderedNames = buildOrderedCategoryNames(categoriesData, demoProducts)
          setCategories(['Todos', ...orderedNames])
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
          // Excluir productos desactivados (isActive === false), igual que el POS, para que
          // los mozos no puedan agregar a la mesa productos que estan ocultos del catalogo.
          const allProducts = (result.data || []).filter((p) => p.isActive !== false)
          setProducts(allProducts)
          setFilteredProducts(allProducts)

          const orderedNames = buildOrderedCategoryNames(categoriesData, allProducts)
          setCategories(['Todos', ...orderedNames])
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
    // Si tiene múltiples precios y no se ha seleccionado uno, mostrar selector primero
    if (isNewOrder && !selectedPrice && (product.price2 || product.price3 || product.price4)) {
      setProductForPriceSelection(product)
      setShowPriceModal(true)
      return
    }

    // Si el producto tiene modificadores, abrir modal de selección
    if (product.modifiers && product.modifiers.length > 0) {
      setProductForModifiers({ ...product, _selectedPrice: selectedPrice ?? product.price })
      setIsModifierModalOpen(true)
      return
    }

    // En mesas siempre usar precio principal (precio 1), no mostrar selector de precios
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

    setShowPriceModal(false)
    setProductForPriceSelection(null)
    addToCart(product, selected)
  }

  // Agregar al carrito con modificadores seleccionados
  const addToCartWithModifiers = (data) => {
    const { selectedModifiers, totalPrice } = data
    const basePrice = productForModifiers._selectedPrice ?? productForModifiers.price

    // Crear un identificador único basado en los modificadores seleccionados + precio base
    const modifierKey = selectedModifiers
      .map(m => `${m.modifierId}:${m.options.map(o => o.optionId).join(',')}`)
      .join('|') + `|p:${basePrice}`

    // El totalPrice del ModifierSelectorModal ya incluye el precio base seleccionado + ajustes
    const finalPrice = totalPrice

    // Buscar si ya existe un item idéntico (mismo producto + mismos modificadores + mismo precio)
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
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * finalPrice }
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
          price: finalPrice, // Precio base seleccionado + modificadores
          basePrice: basePrice, // Precio base seleccionado (puede ser price2, price3, etc.)
          quantity: 1,
          total: finalPrice,
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
        const addedItems = cart.map(i => ({ ...i }))
        const result = await addOrderItems(getBusinessId(), order.id, cart)
        if (result.success) {
          toast.success(`${cart.length} items agregados a la orden`)
          setCart([])
          if (onSuccess) onSuccess()
          // Auto-imprimir la comanda de los items recien agregados (solo app + impresora configurada)
          if (onAfterAddItems) onAfterAddItems(addedItems)
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
    setShowMobileCart(false)
    onClose()
  }

  // Solo validar si NO es una nueva orden
  if (!isNewOrder && (!table || !order)) return null

  const cartTotal = cart.reduce((sum, item) => sum + (item.total || 0), 0)

  // Bloque reutilizable: item del carrito en modo lista compacto.
  // Fila 1: nombre + total + quitar. Fila 2: cantidad + nota (una sola linea).
  const renderCartItem = (item) => (
    <div key={`${item.productId}-${item.modifierKey || 'no-mod'}`} className="border rounded-lg px-2.5 py-2 bg-white">
      {/* Fila 1: nombre + total + quitar */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-900 truncate">{item.name}</div>
          <div className="text-[11px] text-gray-500">S/ {item.price.toFixed(2)} c/u</div>
        </div>
        <div className="font-bold text-sm text-gray-900 whitespace-nowrap">S/ {item.total.toFixed(2)}</div>
        <button
          type="button"
          onClick={() => removeFromCart(item.productId, item.modifierKey)}
          className="text-red-400 hover:text-red-600 flex-shrink-0"
          title="Quitar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Modificadores (compacto, una linea) */}
      {item.modifiers && item.modifiers.length > 0 && (
        <div className="text-[11px] text-primary-700 truncate mt-0.5">
          {item.modifiers.map((m) => (m.options || []).map((o) => o.optionName).join(', ')).join(' · ')}
        </div>
      )}

      {/* Fila 2: cantidad + nota en una sola linea */}
      <div className="flex items-center gap-2 mt-1.5">
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => updateQuantity(item.productId, item.quantity - 1, item.modifierKey)}
            className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
          <button
            type="button"
            onClick={() => updateQuantity(item.productId, item.quantity + 1, item.modifierKey)}
            className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <input
          type="text"
          value={item.notes || ''}
          onChange={(e) => updateNotes(item.productId, e.target.value, item.modifierKey)}
          placeholder="Nota..."
          className="flex-1 min-w-0 text-xs px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>
    </div>
  )

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
      fullScreen={true}
    >
      <div className="relative flex flex-col lg:flex-row h-full min-h-0">
        {/* ===== IZQUIERDA: buscar + categorias + productos ===== */}
        <div className="flex-1 flex flex-col min-h-0 lg:border-r border-gray-200">
          {/* MOVIL: acceso al carrito arriba (en celulares pequenos el carrito lateral no cabe).
              Muestra cuanto vas sumando; al tocarlo se abre el carrito a pantalla completa. */}
          <button
            type="button"
            onClick={() => setShowMobileCart(true)}
            className="lg:hidden flex-shrink-0 mx-3 mt-3 flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-primary-600 text-white shadow-sm active:bg-primary-700"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="w-4 h-4" />
              {cart.length} {cart.length === 1 ? 'item' : 'items'} en el carrito
            </span>
            <span className="flex items-center gap-1 font-bold text-sm">
              S/ {cartTotal.toFixed(2)}
              <ChevronRight className="w-4 h-4" />
            </span>
          </button>
          {/* Buscador */}
          <div className="p-4 pb-2 flex-shrink-0">
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

          {/* Categorias colapsables (como en el POS) */}
          <div className="px-4 flex-shrink-0">
            <button
              onClick={toggleCategoriesCollapsed}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
              title={categoriesCollapsed ? 'Mostrar categorias' : 'Ocultar categorias'}
            >
              {categoriesCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Categorias
              {categoriesCollapsed && selectedCategory !== 'Todos' && (
                <span className="ml-1 normal-case px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium">
                  {selectedCategory}
                </span>
              )}
            </button>
            {!categoriesCollapsed && (
              <div className="flex flex-wrap gap-2 pb-3">
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
            )}
          </div>

          {/* Lista de productos (scroll propio) */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {searchTerm ? 'No se encontraron productos' : 'No hay productos disponibles'}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                {filteredProducts.map((product) => {
                  const qtyInCart = cart.reduce((s, i) => s + (i.productId === product.id ? i.quantity : 0), 0)
                  return (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="relative flex flex-col text-left p-2.5 border rounded-lg hover:border-primary-500 hover:shadow-md hover:bg-primary-50/40 transition-all"
                    >
                      {qtyInCart > 0 && (
                        <div className="absolute top-1 left-1 w-5 h-5 bg-primary-600 text-white rounded-full flex items-center justify-center text-[11px] font-bold shadow z-10">
                          {qtyInCart}
                        </div>
                      )}
                      <p className="font-semibold text-xs sm:text-sm leading-tight line-clamp-2 text-gray-900 min-h-[2.2em]">
                        {product.name}
                      </p>
                      {product.code && (
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">Cód: {product.code}</p>
                      )}
                      <div className="mt-auto pt-1.5">
                        <p className="text-sm font-bold text-primary-600">
                          S/ {(product.price || 0).toFixed(2)}
                          {isNewOrder && (product.price2 || product.price3 || product.price4) && (
                            <span className="text-[10px] font-normal text-gray-400 ml-1">
                              - S/ {(product.price2 || product.price3 || product.price4 || 0).toFixed(2)}
                            </span>
                          )}
                        </p>
                        {product.stock !== undefined && (
                          <p className="text-[10px] text-gray-400">Stock: {product.stock}</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

        </div>

        {/* ===== DERECHA: carrito (desktop fijo / movil overlay) ===== */}
        <div
          className={cn(
            'flex-col min-h-0 bg-white lg:w-96',
            showMobileCart ? 'flex absolute inset-0 z-20 lg:static lg:z-auto' : 'hidden lg:flex'
          )}
        >
          {/* Header del carrito */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
            <h3 className="font-semibold text-gray-900">
              Carrito ({cart.length} items)
            </h3>
            <button
              onClick={() => setShowMobileCart(false)}
              className="lg:hidden text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Items del carrito (scroll propio) */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {cart.length === 0 ? (
              <div className="flex items-center justify-center text-gray-500 text-sm py-8">
                Agrega productos al carrito
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map(renderCartItem)}
              </div>
            )}
          </div>

          {/* Total + acciones (fijo abajo) */}
          <div
            className="border-t border-gray-200 p-4 flex-shrink-0 space-y-3"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex justify-between text-lg font-bold">
              <span>Total:</span>
              <span className="text-primary-600">S/ {cartTotal.toFixed(2)}</span>
            </div>
            <div className="text-xs text-gray-500 text-center">
              Los montos detallados aparecerán en la precuenta
            </div>
            <div className="flex gap-3">
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
