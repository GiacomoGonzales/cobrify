import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
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
  List
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

// Modal de producto
function ProductModal({ product, isOpen, onClose, onAddToCart, cartQuantity }) {
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    if (isOpen) {
      setQuantity(1)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen || !product) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Imagen */}
        <div className="relative aspect-square bg-gray-100">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-24 h-24 text-gray-300" />
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          {cartQuantity > 0 && (
            <div className="absolute top-4 left-4 bg-emerald-500 text-white px-3 py-1 rounded-full text-sm font-medium">
              {cartQuantity} en carrito
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
            <div className="text-3xl font-bold text-gray-900">
              S/ {product.price?.toFixed(2)}
            </div>
            {product.stock !== undefined && product.stock > 0 && (
              <span className="text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                {product.stock} disponibles
              </span>
            )}
          </div>

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
            onClick={() => {
              onAddToCart(product, quantity)
              onClose()
            }}
            className="w-full py-4 bg-gray-900 text-white rounded-2xl font-semibold text-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-5 h-5" />
            Agregar al carrito - S/ {(product.price * quantity).toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  )
}

// Carrito lateral
function CartDrawer({ isOpen, onClose, cart, onUpdateQuantity, onRemove, business, onCheckout }) {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

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
              <h2 className="text-xl font-bold">Tu carrito</h2>
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
                <p className="text-lg">Tu carrito está vacío</p>
                <p className="text-sm mt-1">Agrega productos para comenzar</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map((item) => (
                  <div key={item.id} className="flex gap-4 bg-gray-50 rounded-2xl p-4">
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
                      <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                      <p className="text-gray-600">S/ {item.price?.toFixed(2)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => onUpdateQuantity(item.id, Math.max(0, item.quantity - 1))}
                          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onRemove(item.id)}
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
            <div className="border-t p-6 space-y-4">
              <div className="flex items-center justify-between text-lg">
                <span className="text-gray-600">Total</span>
                <span className="text-2xl font-bold">S/ {total.toFixed(2)}</span>
              </div>
              <button
                onClick={onCheckout}
                className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-semibold text-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                Hacer pedido por WhatsApp
              </button>
              <p className="text-center text-sm text-gray-500">
                Te contactaremos para confirmar tu pedido
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// Componente principal
export default function CatalogoPublico() {
  const { slug } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [business, setBusiness] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
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

        // Buscar negocio por slug
        const businessesQuery = query(
          collection(db, 'businesses'),
          where('catalogSlug', '==', slug)
        )
        const businessesSnap = await getDocs(businessesQuery)

        if (businessesSnap.empty) {
          setError('Catálogo no encontrado')
          return
        }

        const businessDoc = businessesSnap.docs[0]
        const businessData = { id: businessDoc.id, ...businessDoc.data() }

        // Verificar que el catálogo esté habilitado
        if (!businessData.catalogEnabled) {
          setError('Este catálogo no está disponible')
          return
        }

        setBusiness(businessData)

        // Cargar productos visibles en catálogo
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

        // Cargar categorías
        const categoriesRef = collection(db, 'businesses', businessDoc.id, 'categories')
        const categoriesSnap = await getDocs(categoriesRef)
        const categoriesData = categoriesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setCategories(categoriesData)

      } catch (err) {
        console.error('Error loading catalog:', err)
        setError('Error al cargar el catálogo')
      } finally {
        setLoading(false)
      }
    }

    if (slug) {
      loadCatalog()
    }
  }, [slug])

  // Filtrar productos
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = !searchQuery ||
        product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCategory = !selectedCategory || product.category === selectedCategory

      return matchesSearch && matchesCategory
    })
  }, [products, searchQuery, selectedCategory])

  // Funciones del carrito
  const addToCart = (product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id)
      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }
      return [...prev, { ...product, quantity }]
    })
  }

  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.id !== productId))
    } else {
      setCart(prev => prev.map(item =>
        item.id === productId ? { ...item, quantity } : item
      ))
    }
  }

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.id !== productId))
  }

  const getCartQuantity = (productId) => {
    const item = cart.find(i => i.id === productId)
    return item?.quantity || 0
  }

  // Checkout por WhatsApp
  const handleCheckout = () => {
    if (!business?.phone && !business?.whatsapp) {
      alert('Este negocio no tiene WhatsApp configurado')
      return
    }

    const phone = (business.whatsapp || business.phone).replace(/\D/g, '')
    const items = cart.map(item =>
      `• ${item.quantity}x ${item.name} - S/ ${(item.price * item.quantity).toFixed(2)}`
    ).join('\n')
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)

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
          <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{error}</h1>
          <p className="text-gray-600">
            El catálogo que buscas no existe o no está disponible
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
                  <Store className="w-5 h-5 md:w-6 md:h-6 text-white" />
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
              <span className="hidden md:inline font-medium">Carrito</span>
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

      {/* Categorías */}
      {categories.length > 0 && (
        <div className="bg-white border-b sticky top-16 md:top-20 z-30">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center gap-2 py-4 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  !selectedCategory
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todos
              </button>
              {categories.map(category => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
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
          </div>
        </div>
      )}

      {/* Productos */}
      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Header de resultados */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-600">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'producto' : 'productos'}
            {selectedCategory && categories.find(c => c.id === selectedCategory) && (
              <span> en <strong>{categories.find(c => c.id === selectedCategory).name}</strong></span>
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
              return (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="relative aspect-square bg-gray-100 overflow-hidden">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-12 h-12 text-gray-300" />
                      </div>
                    )}
                    {cartQty > 0 && (
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
                      <span className="text-lg font-bold text-gray-900">
                        S/ {product.price?.toFixed(2)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          addToCart(product)
                        }}
                        className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 transition-colors"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
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
              return (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow cursor-pointer flex"
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="w-32 h-32 md:w-40 md:h-40 flex-shrink-0 bg-gray-100 relative">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-10 h-10 text-gray-300" />
                      </div>
                    )}
                    {cartQty > 0 && (
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
                      <span className="text-xl font-bold text-gray-900">
                        S/ {product.price?.toFixed(2)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          addToCart(product)
                        }}
                        className="px-4 py-2 rounded-full bg-gray-900 text-white flex items-center gap-2 hover:bg-gray-800 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="hidden md:inline">Agregar</span>
                      </button>
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
              {(business?.whatsapp || business?.phone) && (
                <a
                  href={`https://wa.me/${(business.whatsapp || business.phone).replace(/\D/g, '')}`}
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
            Catálogo powered by <a href="https://cobrify.com" className="text-gray-600 hover:underline">Cobrify</a>
          </div>
        </div>
      </footer>

      {/* Floating cart button (mobile) */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-6 left-4 right-4 md:hidden z-40">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full py-4 bg-gray-900 text-white rounded-2xl font-semibold shadow-2xl flex items-center justify-center gap-3"
          >
            <ShoppingBag className="w-5 h-5" />
            Ver carrito ({cartItemsCount})
            <span className="bg-white/20 px-3 py-1 rounded-full">
              S/ {cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}
            </span>
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
      />
    </div>
  )
}
