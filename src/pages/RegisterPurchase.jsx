import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Minus, Trash2, ShoppingCart, Save, X, Loader2, Package, Store } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { formatCurrency } from '@/lib/utils'
import { getIngredients, registerPurchase } from '@/services/ingredientService'
import { getActiveBranches } from '@/services/branchService'
import { getWarehouses } from '@/services/warehouseService'

const UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'L', label: 'L' },
  { value: 'ml', label: 'ml' },
  { value: 'unidades', label: 'unidades' },
  { value: 'cajas', label: 'cajas' }
]

export default function RegisterPurchase() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const navigate = useNavigate()
  const toast = useToast()

  const [ingredients, setIngredients] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Sucursales y almacenes
  const [branches, setBranches] = useState([])
  const [warehouses, setWarehouses] = useState([])

  // Purchase cart
  const [cart, setCart] = useState([])

  // Purchase data
  const [purchaseInfo, setPurchaseInfo] = useState({
    supplier: '',
    invoiceNumber: '',
    purchaseDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })(),
    warehouseId: ''
  })

  // Search
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const [ingredientsResult, branchesResult, warehousesResult] = await Promise.all([
        getIngredients(businessId),
        getActiveBranches(businessId),
        getWarehouses(businessId)
      ])

      if (ingredientsResult.success) {
        setIngredients(ingredientsResult.data || [])
      }

      if (branchesResult.success) {
        setBranches(branchesResult.data || [])
      }

      if (warehousesResult.success) {
        const activeWarehouses = (warehousesResult.data || []).filter(w => w.isActive !== false)
        setWarehouses(activeWarehouses)

        // Seleccionar almacén por defecto
        const defaultWarehouse = activeWarehouses.find(w => w.isDefault && !w.branchId) || activeWarehouses[0]
        if (defaultWarehouse) {
          setPurchaseInfo(prev => ({ ...prev, warehouseId: defaultWarehouse.id }))
        }
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  const addToCart = (ingredient) => {
    const existing = cart.find(item => item.id === ingredient.id)

    if (existing) {
      toast.info('Este ingrediente ya está en la lista')
      return
    }

    setCart([...cart, {
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.purchaseUnit,
      quantity: '',
      unitPrice: ingredient.lastPurchasePrice || ingredient.averageCost || ''
    }])

    toast.success(`${ingredient.name} agregado`)
  }

  const updateCartItem = (id, field, value) => {
    setCart(cart.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  // Manejar input numérico con punto decimal
  const handleNumberInput = (e, id, field) => {
    let value = e.target.value.replace(',', '.') // Convertir coma a punto

    // Permitir valores vacíos, números, puntos y valores parciales como "0.", "0.0", etc.
    // No parsear mientras se escribe para permitir "0." o ".5"
    if (value === '' || value === '.' || value === '0.' || /^-?\d*\.?\d*$/.test(value)) {
      updateCartItem(id, field, value)
    }
  }

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id))
  }

  const incrementQuantity = (id) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const current = parseFloat(item.quantity) || 0
        return { ...item, quantity: (current + 1).toString() }
      }
      return item
    }))
  }

  const decrementQuantity = (id) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const current = parseFloat(item.quantity) || 0
        const newValue = Math.max(0, current - 1)
        return { ...item, quantity: newValue.toString() }
      }
      return item
    }))
  }

  const calculateTotal = () => {
    return cart.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0
      const price = parseFloat(item.unitPrice) || 0
      return sum + (qty * price)
    }, 0)
  }

  const handleSavePurchase = async () => {
    if (cart.length === 0) {
      toast.error('Agrega al menos un ingrediente')
      return
    }

    if (!purchaseInfo.supplier) {
      toast.error('Ingresa el nombre del proveedor')
      return
    }

    // Validar que todos los items tengan cantidad y precio
    const invalidItems = cart.filter(item =>
      !item.quantity || !item.unitPrice || parseFloat(item.quantity) <= 0 || parseFloat(item.unitPrice) <= 0
    )

    if (invalidItems.length > 0) {
      toast.error('Todos los ingredientes deben tener cantidad y precio válidos')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()

      // Registrar cada compra de ingrediente
      const purchases = cart.map(item => {
        const quantity = parseFloat(item.quantity)
        const unitPrice = parseFloat(item.unitPrice)

        return registerPurchase(businessId, {
          ingredientId: item.id,
          ingredientName: item.name,
          quantity: quantity,
          unit: item.unit,
          unitPrice: unitPrice,
          totalCost: quantity * unitPrice,
          supplier: purchaseInfo.supplier,
          invoiceNumber: purchaseInfo.invoiceNumber,
          warehouseId: purchaseInfo.warehouseId || null
        })
      })

      await Promise.all(purchases)

      toast.success(`Compra registrada exitosamente: ${cart.length} ingrediente(s)`)

      // Limpiar formulario
      setCart([])
      const defaultWarehouse = warehouses.find(w => w.isDefault && !w.branchId) || warehouses[0]
      setPurchaseInfo({
        supplier: '',
        invoiceNumber: '',
        purchaseDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })(),
        warehouseId: defaultWarehouse?.id || ''
      })

      // Volver a ingredientes
      const basePath = isDemoMode ? '/demo' : '/app'
      navigate(`${basePath}/ingredientes`)

    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al registrar compra')
    } finally {
      setIsSaving(false)
    }
  }

  const filteredIngredients = ingredients.filter(ing =>
    ing.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando ingredientes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Registrar Compra</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Agrega múltiples ingredientes de una sola factura
          </p>
        </div>
        <Button variant="outline" onClick={() => {
          const basePath = isDemoMode ? '/demo' : '/app'
          navigate(`${basePath}/ingredientes`)
        }}>
          <X className="w-4 h-4 mr-2" />
          Cancelar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Ingredient List */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Buscar Ingredientes</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Buscar ingrediente..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoFocus
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              {filteredIngredients.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>No se encontraron ingredientes</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto">
                  {filteredIngredients.map(ingredient => (
                    <button
                      key={ingredient.id}
                      onClick={() => addToCart(ingredient)}
                      className="p-4 text-left border rounded-lg hover:bg-primary-50 hover:border-primary-500 transition-colors"
                    >
                      <p className="font-medium">{ingredient.name}</p>
                      <p className="text-sm text-gray-500">
                        Stock: {ingredient.currentStock} {ingredient.purchaseUnit}
                      </p>
                      {ingredient.lastPurchasePrice > 0 && (
                        <p className="text-xs text-gray-600">
                          Último precio: {formatCurrency(ingredient.lastPurchasePrice)}/{ingredient.purchaseUnit}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Purchase Cart */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Información de Compra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Proveedor"
                placeholder="Nombre del proveedor"
                value={purchaseInfo.supplier}
                onChange={e => setPurchaseInfo({ ...purchaseInfo, supplier: e.target.value })}
                required
              />
              <Input
                label="Nº Factura/Boleta"
                placeholder="F001-123"
                value={purchaseInfo.invoiceNumber}
                onChange={e => setPurchaseInfo({ ...purchaseInfo, invoiceNumber: e.target.value })}
              />
              <Input
                label="Fecha"
                type="date"
                value={purchaseInfo.purchaseDate}
                onChange={e => setPurchaseInfo({ ...purchaseInfo, purchaseDate: e.target.value })}
              />

              {/* Selector de Almacén */}
              {warehouses.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Store className="w-4 h-4 inline mr-1" />
                    Almacén de Ingreso
                  </label>
                  <select
                    value={purchaseInfo.warehouseId}
                    onChange={e => setPurchaseInfo({ ...purchaseInfo, warehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Sin almacén específico</option>
                    {/* Almacenes de Sucursal Principal */}
                    {warehouses.filter(w => !w.branchId).length > 0 && (
                      <optgroup label="Sucursal Principal">
                        {warehouses.filter(w => !w.branchId).map(warehouse => (
                          <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.name} {warehouse.isDefault ? '(Principal)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {/* Almacenes de otras sucursales */}
                    {branches.map(branch => {
                      const branchWarehouses = warehouses.filter(w => w.branchId === branch.id)
                      if (branchWarehouses.length === 0) return null
                      return (
                        <optgroup key={branch.id} label={branch.name}>
                          {branchWarehouses.map(warehouse => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.name} {warehouse.isDefault ? '(Principal)' : ''}
                            </option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    El stock ingresará a este almacén
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Carrito de Compra</CardTitle>
                <span className="text-sm text-gray-500">{cart.length} item(s)</span>
              </div>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">Sin ingredientes</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {cart.map(item => (
                    <div key={item.id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.name}</p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-red-600 hover:bg-red-50 p-1 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="text-xs text-gray-600">Cantidad ({item.unit})</label>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={() => decrementQuantity(item.id)}
                            className="p-1 border rounded hover:bg-gray-50"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.quantity}
                            onChange={e => handleNumberInput(e, item.id, 'quantity')}
                            className="flex-1 px-2 py-1 text-center border rounded text-sm"
                          />
                          <button
                            onClick={() => incrementQuantity(item.id)}
                            className="p-1 border rounded hover:bg-gray-50"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Unit Price */}
                      <div>
                        <label className="text-xs text-gray-600">Precio/{item.unit}</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.unitPrice}
                          onChange={e => handleNumberInput(e, item.id, 'unitPrice')}
                          className="w-full px-2 py-1 border rounded text-sm mt-1"
                        />
                      </div>

                      {/* Subtotal */}
                      <div className="pt-2 border-t">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-600">Subtotal:</span>
                          <span className="font-semibold text-sm">
                            {formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total */}
              {cart.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-semibold">TOTAL:</span>
                    <span className="text-xl font-bold text-primary-600">
                      {formatCurrency(calculateTotal())}
                    </span>
                  </div>

                  <Button
                    onClick={handleSavePurchase}
                    disabled={isSaving || cart.length === 0 || !purchaseInfo.supplier}
                    className="w-full"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Guardar Compra
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
