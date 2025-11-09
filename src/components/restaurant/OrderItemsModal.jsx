import { useState, useEffect } from 'react'
import { ShoppingCart, Plus, Minus, Search, Loader2, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { getProducts } from '@/services/firestoreService'
import { addOrderItems } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'

export default function OrderItemsModal({ isOpen, onClose, table, order, onSuccess }) {
  const { getBusinessId } = useAppContext()
  const toast = useToast()

  const [products, setProducts] = useState([])
  const [filteredProducts, setFilteredProducts] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [cart, setCart] = useState([])

  // Cargar productos
  useEffect(() => {
    if (isOpen) {
      loadProducts()
    }
  }, [isOpen])

  // Filtrar productos por búsqueda
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredProducts(products)
    } else {
      const filtered = products.filter(
        (p) =>
          p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.code?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredProducts(filtered)
    }
  }, [searchTerm, products])

  const loadProducts = async () => {
    setIsLoading(true)
    try {
      const result = await getProducts(getBusinessId())
      if (result.success) {
        // Mostrar todos los productos por ahora (sin filtro restrictivo)
        const allProducts = result.data || []
        setProducts(allProducts)
        setFilteredProducts(allProducts)
      } else {
        console.error('Error al cargar productos:', result.error)
        toast.error('Error al cargar productos: ' + result.error)
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

  const calculateTotals = () => {
    // El precio del producto YA incluye IGV
    const total = cart.reduce((sum, item) => sum + item.total, 0)
    const subtotal = total / 1.18 // Precio sin IGV
    const igv = total - subtotal // IGV = Total - Subtotal

    return {
      subtotal: subtotal,
      igv: igv,
      total: total
    }
  }

  const handleSave = async () => {
    if (cart.length === 0) {
      toast.warning('Agrega al menos un producto')
      return
    }

    setIsSaving(true)
    try {
      const result = await addOrderItems(getBusinessId(), order.id, cart)
      if (result.success) {
        toast.success(`${cart.length} items agregados a la orden`)
        setCart([])
        onSuccess()
        onClose()
      } else {
        toast.error('Error al agregar items: ' + result.error)
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

  if (!table || !order) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          <div>
            <div className="text-lg font-bold">Agregar Items - Mesa {table.number}</div>
            <div className="text-sm font-normal text-gray-600">
              Mozo: {table.waiter} | Orden: {order.orderNumber || '#' + order.id.slice(-6)}
            </div>
          </div>
        </div>
      }
      size="xl"
    >
      <div className="flex flex-col h-[600px] lg:h-[600px]">
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

        <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden">
          {/* Lista de productos */}
          <div className="flex-1 overflow-y-auto border rounded-lg p-4 max-h-[250px] lg:max-h-none">
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
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                Agrega productos al carrito
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                  {cart.map((item) => (
                    <div key={item.productId} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-500">
                            S/ {item.price.toFixed(2)} c/u
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="w-8 h-8 p-0"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            className="w-8 h-8 p-0"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="font-bold text-gray-900">
                          S/ {item.total.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">S/ {calculateTotals().subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">IGV (18%):</span>
                    <span className="font-medium">S/ {calculateTotals().igv.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span className="text-primary-600">
                      S/ {calculateTotals().total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3 mt-4 pt-4 border-t">
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
    </Modal>
  )
}
