import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Save, ArrowLeft, Loader2, Search, X, PackagePlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import Modal from '@/components/ui/Modal'
import { formatCurrency } from '@/lib/utils'
import { productSchema } from '@/utils/schemas'
import {
  getSuppliers,
  getProducts,
  createPurchase,
  updateProduct,
  createProduct,
  getProductCategories,
} from '@/services/firestoreService'
import { getWarehouses, updateWarehouseStock } from '@/services/warehouseService'

// Unidades de medida
const UNITS = [
  { value: 'UNIDAD', label: 'Unidad' },
  { value: 'CAJA', label: 'Caja' },
  { value: 'KG', label: 'Kilogramo' },
  { value: 'LITRO', label: 'Litro' },
  { value: 'METRO', label: 'Metro' },
  { value: 'HORA', label: 'Hora' },
  { value: 'SERVICIO', label: 'Servicio' },
]

// Helper functions for category hierarchy
const migrateLegacyCategories = (cats) => {
  if (!cats || cats.length === 0) return []
  if (typeof cats[0] === 'object' && cats[0].id) return cats
  return cats.map((cat, index) => ({
    id: `cat-${index}`,
    name: cat,
    parentId: null
  }))
}

const getRootCategories = (cats) => {
  const migratedCats = migrateLegacyCategories(cats)
  return migratedCats.filter(cat => !cat.parentId)
}

const getSubcategories = (cats, parentId) => {
  const migratedCats = migrateLegacyCategories(cats)
  return migratedCats.filter(cat => cat.parentId === parentId)
}

export default function CreatePurchase() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [purchaseItems, setPurchaseItems] = useState([
    { productId: '', productName: '', quantity: 1, unitPrice: 0, cost: 0, costWithoutIGV: 0 },
  ])

  // Warehouses
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouse, setSelectedWarehouse] = useState(null)

  // Estados para el autocompletado de proveedor
  const [supplierSearch, setSupplierSearch] = useState('')
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const supplierInputRef = useRef(null)

  // Estados para el autocompletado de productos
  const [productSearches, setProductSearches] = useState({})
  const [showProductDropdowns, setShowProductDropdowns] = useState({})
  const productInputRefs = useRef({})

  // Estados para el modal de crear producto
  const [showCreateProductModal, setShowCreateProductModal] = useState(false)
  const [currentItemIndex, setCurrentItemIndex] = useState(null)
  const [noStock, setNoStock] = useState(false)

  // React Hook Form para el modal de producto
  const {
    register: registerProduct,
    handleSubmit: handleSubmitProduct,
    formState: { errors: errorsProduct },
    reset: resetProduct,
    setValue: setValueProduct,
    watch: watchProduct,
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: '',
      name: '',
      price: '',
      cost: '',
      unit: 'UNIDAD',
      category: '',
      stock: '',
      description: '',
    },
  })

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [suppliersResult, productsResult, categoriesResult, warehousesResult] = await Promise.all([
        getSuppliers(user.uid),
        getProducts(user.uid),
        getProductCategories(user.uid),
        getWarehouses(user.uid),
      ])

      if (suppliersResult.success) {
        setSuppliers(suppliersResult.data || [])
      }

      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }

      if (categoriesResult.success) {
        setCategories(categoriesResult.data || [])
      }

      if (warehousesResult.success) {
        const warehouseList = warehousesResult.data || []
        setWarehouses(warehouseList)

        // Seleccionar almacén por defecto
        const defaultWarehouse = warehouseList.find(w => w.isDefault) || warehouseList[0] || null
        setSelectedWarehouse(defaultWarehouse)
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      setMessage({
        type: 'error',
        text: 'Error al cargar los datos. Por favor, recarga la página.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const addItem = () => {
    setPurchaseItems([
      ...purchaseItems,
      { productId: '', productName: '', quantity: 1, unitPrice: 0, cost: 0, costWithoutIGV: 0 },
    ])
  }

  const removeItem = index => {
    if (purchaseItems.length > 1) {
      setPurchaseItems(purchaseItems.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index, field, value) => {
    const newItems = [...purchaseItems]
    newItems[index][field] = value
    setPurchaseItems(newItems)
  }

  // Actualizar costo con IGV y calcular sin IGV
  const updateCostWithIGV = (index, value) => {
    const newItems = [...purchaseItems]
    const costWithIGV = parseFloat(value) || 0
    newItems[index].cost = costWithIGV
    // Calcular costo sin IGV: costo con IGV / 1.18 (redondeado a 2 decimales)
    newItems[index].costWithoutIGV = costWithIGV > 0 ? Math.round((costWithIGV / 1.18) * 100) / 100 : 0
    setPurchaseItems(newItems)
  }

  // Actualizar costo sin IGV y calcular con IGV
  const updateCostWithoutIGV = (index, value) => {
    const newItems = [...purchaseItems]
    const costWithoutIGV = parseFloat(value) || 0
    newItems[index].costWithoutIGV = costWithoutIGV
    // Calcular costo con IGV: costo sin IGV * 1.18 (redondeado a 2 decimales)
    newItems[index].cost = costWithoutIGV > 0 ? Math.round((costWithoutIGV * 1.18) * 100) / 100 : 0
    setPurchaseItems(newItems)
  }

  // Filtrar proveedores según búsqueda
  const filteredSuppliers = suppliers.filter(supplier => {
    const search = supplierSearch.toLowerCase()
    return (
      supplier.businessName?.toLowerCase().includes(search) ||
      supplier.documentNumber?.includes(search) ||
      supplier.contactName?.toLowerCase().includes(search)
    )
  })

  // Seleccionar proveedor
  const selectSupplier = supplier => {
    setSelectedSupplier(supplier)
    setSupplierSearch(supplier.businessName)
    setShowSupplierDropdown(false)
  }

  // Limpiar selección de proveedor
  const clearSupplier = () => {
    setSelectedSupplier(null)
    setSupplierSearch('')
    setShowSupplierDropdown(false)
  }

  // Filtrar productos según búsqueda
  const getFilteredProducts = (index) => {
    const search = (productSearches[index] || '').toLowerCase()
    return products.filter(product => {
      return (
        product.name?.toLowerCase().includes(search) ||
        product.code?.toLowerCase().includes(search) ||
        product.category?.toLowerCase().includes(search)
      )
    })
  }

  // Seleccionar producto
  const selectProduct = (index, product) => {
    const newItems = [...purchaseItems]
    newItems[index].productId = product.id
    newItems[index].productName = product.name
    setPurchaseItems(newItems)

    const newSearches = { ...productSearches }
    newSearches[index] = product.name
    setProductSearches(newSearches)

    const newDropdowns = { ...showProductDropdowns }
    newDropdowns[index] = false
    setShowProductDropdowns(newDropdowns)
  }

  // Actualizar búsqueda de producto
  const updateProductSearch = (index, value) => {
    const newSearches = { ...productSearches }
    newSearches[index] = value
    setProductSearches(newSearches)

    const newDropdowns = { ...showProductDropdowns }
    newDropdowns[index] = true
    setShowProductDropdowns(newDropdowns)

    // Si borra la búsqueda, limpiar el producto seleccionado
    if (!value) {
      const newItems = [...purchaseItems]
      newItems[index].productId = ''
      newItems[index].productName = ''
      setPurchaseItems(newItems)
    }
  }

  // Click fuera para cerrar dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (supplierInputRef.current && !supplierInputRef.current.contains(event.target)) {
        setShowSupplierDropdown(false)
      }

      Object.keys(productInputRefs.current).forEach(index => {
        const ref = productInputRefs.current[index]
        if (ref && !ref.contains(event.target)) {
          const newDropdowns = { ...showProductDropdowns }
          newDropdowns[index] = false
          setShowProductDropdowns(newDropdowns)
        }
      })
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showProductDropdowns])

  const calculateAmounts = () => {
    const total = purchaseItems.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.cost) || 0)
    }, 0)

    // Los costos ya incluyen IGV, calculamos el IGV del total
    // Total = Subtotal + IGV
    // Total = Subtotal + (Subtotal * 0.18)
    // Total = Subtotal * 1.18
    // Subtotal = Total / 1.18
    const subtotal = total / 1.18
    const igv = total - subtotal

    return {
      subtotal,
      igv,
      total
    }
  }

  const openCreateProductModal = (itemIndex) => {
    setCurrentItemIndex(itemIndex)
    // Pre-llenar el nombre del producto con lo que el usuario estaba buscando
    const searchTerm = productSearches[itemIndex] || ''
    resetProduct({
      code: '',
      name: searchTerm,
      price: '',
      cost: '',
      unit: 'UNIDAD',
      category: '',
      stock: '',
      description: '',
    })
    setNoStock(false)
    setShowCreateProductModal(true)
  }

  const handleCreateProduct = async (data) => {
    try {
      const productData = {
        code: data.code,
        name: data.name,
        price: parseFloat(data.price),
        cost: data.cost ? parseFloat(data.cost) : 0,
        unit: data.unit,
        category: data.category || '',
        description: data.description || '',
        stock: noStock ? null : 0, // Stock actual en 0, se actualizará al guardar la compra
        initialStock: noStock ? null : 0, // Productos creados desde compras inician con stock inicial 0
      }

      const result = await createProduct(user.uid, productData)
      if (result.success) {
        toast.success('Producto creado exitosamente')

        // Recargar la lista de productos
        const productsResult = await getProducts(user.uid)
        if (productsResult.success) {
          setProducts(productsResult.data || [])
        }

        // Seleccionar automáticamente el producto recién creado en el item actual
        if (currentItemIndex !== null) {
          const createdProduct = { id: result.id, ...productData }
          selectProduct(currentItemIndex, createdProduct)

          // Auto-llenar cantidad, costo y precio de venta en el formulario de compra
          const newItems = [...purchaseItems]
          const costValue = productData.cost || 0

          newItems[currentItemIndex].quantity = data.stock ? parseFloat(data.stock) : 1
          newItems[currentItemIndex].cost = costValue
          newItems[currentItemIndex].unitPrice = productData.price || 0
          // Calcular costo sin IGV automáticamente
          newItems[currentItemIndex].costWithoutIGV = costValue > 0 ? Math.round((costValue / 1.18) * 100) / 100 : 0

          setPurchaseItems(newItems)
        }

        // Cerrar modal y resetear
        closeCreateProductModal()
      } else {
        toast.error(result.error || 'Error al crear el producto')
      }
    } catch (error) {
      console.error('Error al crear producto:', error)
      toast.error('Error al crear el producto')
    }
  }

  const closeCreateProductModal = () => {
    setShowCreateProductModal(false)
    resetProduct()
    setNoStock(false)
    setCurrentItemIndex(null)
  }

  const validateForm = () => {
    if (!selectedSupplier) {
      setMessage({
        type: 'error',
        text: 'Debe seleccionar un proveedor',
      })
      return false
    }

    if (!invoiceNumber.trim()) {
      setMessage({
        type: 'error',
        text: 'Debe ingresar el número de factura',
      })
      return false
    }

    if (purchaseItems.length === 0) {
      setMessage({
        type: 'error',
        text: 'Debe agregar al menos un producto',
      })
      return false
    }

    for (let i = 0; i < purchaseItems.length; i++) {
      const item = purchaseItems[i]
      if (!item.productId || !item.productName || !item.quantity || !item.cost) {
        setMessage({
          type: 'error',
          text: `Complete todos los campos del producto ${i + 1}`,
        })
        return false
      }

      if (parseFloat(item.quantity) <= 0) {
        setMessage({
          type: 'error',
          text: `La cantidad del producto ${i + 1} debe ser mayor a 0`,
        })
        return false
      }

      if (parseFloat(item.cost) <= 0) {
        setMessage({
          type: 'error',
          text: `El costo unitario del producto ${i + 1} debe ser mayor a 0`,
        })
        return false
      }
    }

    return true
  }

  const handleSave = async () => {
    if (!user?.uid) return

    // Asegurar que todos los items tengan costWithoutIGV calculado
    const itemsWithCostWithoutIGV = purchaseItems.map(item => ({
      ...item,
      costWithoutIGV: item.costWithoutIGV || (item.cost > 0 ? Math.round((item.cost / 1.18) * 100) / 100 : 0)
    }))
    setPurchaseItems(itemsWithCostWithoutIGV)

    if (!validateForm()) return

    setIsSaving(true)
    setMessage(null)

    try {
      const amounts = calculateAmounts()

      // 1. Crear datos de la compra
      const purchaseData = {
        supplier: {
          id: selectedSupplier.id,
          documentType: selectedSupplier.documentType,
          documentNumber: selectedSupplier.documentNumber,
          businessName: selectedSupplier.businessName,
          contactName: selectedSupplier.contactName || '',
          email: selectedSupplier.email || '',
          phone: selectedSupplier.phone || '',
        },
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: new Date(invoiceDate),
        items: purchaseItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.cost), // Precio unitario de compra (costo)
        })),
        subtotal: amounts.subtotal,
        igv: amounts.igv,
        total: amounts.total,
        notes: notes.trim(),
      }

      // 2. Guardar la compra
      const result = await createPurchase(user.uid, purchaseData)
      if (!result.success) {
        throw new Error(result.error || 'Error al crear la compra')
      }

      // 3. Actualizar stock y costo promedio de productos
      const productUpdates = purchaseItems.map(async item => {
        const product = products.find(p => p.id === item.productId)
        if (product) {
          const newQuantity = parseFloat(item.quantity)
          const newCost = parseFloat(item.cost)

          // Actualizar stock usando el helper de almacén
          const updatedProduct = updateWarehouseStock(
            product,
            selectedWarehouse?.id || '',
            newQuantity // Positivo porque es una entrada
          )

          // Calcular costo promedio ponderado
          const currentStock = product.stock || 0
          const currentCost = product.cost || 0
          const totalStock = currentStock + newQuantity

          let averageCost = newCost
          if (currentStock > 0 && currentCost > 0) {
            // Costo promedio ponderado = (Stock actual * Costo actual + Compra nueva * Costo nuevo) / Stock total
            averageCost = ((currentStock * currentCost) + (newQuantity * newCost)) / totalStock
          }

          const updates = {
            stock: updatedProduct.stock,
            warehouseStocks: updatedProduct.warehouseStocks,
            cost: averageCost // Actualizar con costo promedio ponderado
          }

          return updateProduct(user.uid, item.productId, updates)
        }
      })

      await Promise.all(productUpdates)

      // 4. Mostrar éxito y redirigir
      toast.success('Compra registrada exitosamente. Stock y costos actualizados')
      setTimeout(() => {
        navigate('/app/compras')
      }, 1500)
    } catch (error) {
      console.error('Error al crear compra:', error)
      setMessage({
        type: 'error',
        text: error.message || 'Error al crear la compra. Inténtalo nuevamente.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="outline"
            onClick={() => navigate('/app/compras')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Nueva Compra</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Registra la factura del proveedor y actualiza el inventario
          </p>
        </div>
      </div>

      {message && (
        <Alert type={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Información del Proveedor */}
      <Card>
        <CardHeader>
          <CardTitle>Información del Proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Buscador de Proveedor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Proveedor <span className="text-red-500">*</span>
              </label>
              <div className="relative" ref={supplierInputRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar proveedor por nombre o RUC..."
                    value={supplierSearch}
                    onChange={e => {
                      setSupplierSearch(e.target.value)
                      setShowSupplierDropdown(true)
                      if (!e.target.value) setSelectedSupplier(null)
                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    className={`w-full pl-10 ${selectedSupplier ? 'pr-10' : 'pr-4'} py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      selectedSupplier ? 'border-green-500 bg-green-50' : 'border-gray-300'
                    }`}
                  />
                  {selectedSupplier && (
                    <button
                      onClick={clearSupplier}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown de proveedores */}
                {showSupplierDropdown && supplierSearch && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredSuppliers.length > 0 ? (
                      filteredSuppliers.map(supplier => (
                        <button
                          key={supplier.id}
                          onClick={() => selectSupplier(supplier)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                        >
                          <div className="font-medium text-gray-900">{supplier.businessName}</div>
                          <div className="text-sm text-gray-500">
                            {supplier.documentNumber}
                            {supplier.contactName && ` • ${supplier.contactName}`}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-500">
                        No se encontraron proveedores
                      </div>
                    )}
                  </div>
                )}

                {selectedSupplier && (
                  <div className="mt-2 text-sm text-green-600">
                    ✓ {selectedSupplier.businessName} seleccionado
                  </div>
                )}
              </div>
            </div>

            <Input
              label="Número de Factura"
              required
              placeholder="001-123"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
            />

            <Input
              label="Fecha de Factura"
              type="date"
              required
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
            />

            {/* Selector de Almacén */}
            {warehouses.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Almacén de Ingreso <span className="text-red-500">*</span>
                </label>
                <Select
                  value={selectedWarehouse?.id || ''}
                  onChange={e => {
                    const warehouse = warehouses.find(w => w.id === e.target.value)
                    setSelectedWarehouse(warehouse)
                  }}
                >
                  {warehouses.filter(w => w.isActive).map(warehouse => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} {warehouse.isDefault ? '(Principal)' : ''}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  El stock ingresará a este almacén
                </p>
              </div>
            )}
          </div>

          {suppliers.length === 0 && (
            <Alert type="warning" className="mt-4">
              No tienes proveedores registrados.{' '}
              <button
                onClick={() => navigate('/app/proveedores')}
                className="underline font-medium"
              >
                Crear proveedor
              </button>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Productos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Productos</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Los precios unitarios deben incluir IGV (18%)
              </p>
            </div>
            <Button onClick={addItem} variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Agregar Producto
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {purchaseItems.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">Producto #{index + 1}</span>
                  <button
                    onClick={() => removeItem(index)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    disabled={purchaseItems.length === 1}
                    title="Eliminar producto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Buscador de Producto */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Producto <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1" ref={el => productInputRefs.current[index] = el}>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Buscar producto por nombre o código..."
                          value={productSearches[index] || item.productName || ''}
                          onChange={e => {
                            updateProductSearch(index, e.target.value)
                            updateItem(index, 'productName', e.target.value)
                          }}
                          onFocus={() => {
                            const newDropdowns = { ...showProductDropdowns }
                            newDropdowns[index] = true
                            setShowProductDropdowns(newDropdowns)
                          }}
                          className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                            item.productId ? 'border-green-500 bg-green-50' : 'border-gray-300'
                          }`}
                        />
                      </div>

                      {/* Dropdown de productos */}
                      {showProductDropdowns[index] && productSearches[index] && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {/* Lista de productos encontrados */}
                          {getFilteredProducts(index).length > 0 ? (
                            getFilteredProducts(index).map(product => (
                              <button
                                key={product.id}
                                onClick={() => selectProduct(index, product)}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                              >
                                <div className="font-medium text-sm text-gray-900">{product.name}</div>
                                {product.code && (
                                  <div className="text-xs text-gray-500">Código: {product.code}</div>
                                )}
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-gray-500">
                              No se encontraron productos con ese nombre
                            </div>
                          )}
                        </div>
                      )}

                      {item.productId && (
                        <div className="mt-2 text-sm text-green-600">
                          ✓ Producto seleccionado
                        </div>
                      )}
                    </div>

                    {/* Botón crear producto nuevo - siempre visible */}
                    <button
                      type="button"
                      onClick={() => openCreateProductModal(index)}
                      className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                      title="Crear producto nuevo"
                    >
                      <PackagePlus className="w-4 h-4" />
                      <span className="hidden sm:inline">Nuevo</span>
                    </button>
                  </div>
                </div>

                {/* Cantidad */}
                <div>
                  <Input
                    label="Cantidad"
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="Ej: 10"
                    value={item.quantity}
                    onChange={e => updateItem(index, 'quantity', e.target.value)}
                  />
                </div>

                {/* Costos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Costo Sin IGV */}
                  <div>
                    <Input
                      label="Costo Sin IGV"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ej: 2.54"
                      value={item.costWithoutIGV || ''}
                      onChange={e => updateCostWithoutIGV(index, e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Costo base sin impuesto
                    </p>
                  </div>

                  {/* Costo Con IGV */}
                  <div>
                    <Input
                      label="Costo Con IGV"
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="Ej: 3.00"
                      value={item.cost || ''}
                      onChange={e => updateCostWithIGV(index, e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Costo final con impuesto (18%)
                    </p>
                  </div>
                </div>

                {/* Subtotal de la línea */}
                <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">Subtotal de compra:</span>
                  <div className="text-right">
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(
                        (parseFloat(item.quantity) || 0) * (parseFloat(item.cost) || 0)
                      )}
                    </span>
                    <span className="block text-xs text-gray-500">Costo total</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {products.length === 0 && (
            <Alert type="warning" className="mt-4">
              No tienes productos registrados.{' '}
              <button
                onClick={() => navigate('/app/productos')}
                className="underline font-medium"
              >
                Crear producto
              </button>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Notas y Total */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <Input
              label="Notas (opcional)"
              placeholder="Observaciones adicionales..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />

            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between items-center text-gray-600">
                <span className="text-sm">Subtotal:</span>
                <span className="font-medium">{formatCurrency(calculateAmounts().subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span className="text-sm">IGV (18%):</span>
                <span className="font-medium">{formatCurrency(calculateAmounts().igv)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-700">Total:</span>
                <span className="text-3xl font-bold text-primary-600">
                  {formatCurrency(calculateAmounts().total)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/app/compras')}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
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
          </div>
        </CardContent>
      </Card>

      {/* Modal para crear producto nuevo */}
      <Modal
        isOpen={showCreateProductModal}
        onClose={closeCreateProductModal}
        title="Nuevo Producto"
        size="lg"
      >
        <form onSubmit={handleSubmitProduct(handleCreateProduct)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Código"
              required
              placeholder="PROD001"
              error={errorsProduct.code?.message}
              {...registerProduct('code')}
            />

            <Select
              label="Unidad de Medida"
              required
              error={errorsProduct.unit?.message}
              {...registerProduct('unit')}
            >
              {UNITS.map(unit => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Nombre"
            required
            placeholder="Nombre del producto o servicio"
            error={errorsProduct.name?.message}
            {...registerProduct('name')}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Costo"
              type="number"
              step="0.01"
              placeholder="0.00"
              error={errorsProduct.cost?.message}
              {...registerProduct('cost')}
            />

            <Input
              label="Precio de Venta"
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              error={errorsProduct.price?.message}
              {...registerProduct('price')}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría (Opcional)
              </label>
              <select
                {...registerProduct('category')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Sin categoría</option>
                {/* Render root categories and their subcategories */}
                {getRootCategories(categories).map(cat => (
                  <React.Fragment key={cat.id}>
                    <option value={cat.id}>
                      {cat.name}
                    </option>
                    {getSubcategories(categories, cat.id).map(subcat => (
                      <option key={subcat.id} value={subcat.id}>
                        └─ {subcat.name}
                      </option>
                    ))}
                  </React.Fragment>
                ))}
              </select>
              {errorsProduct.category && (
                <p className="mt-1 text-sm text-red-600">{errorsProduct.category.message}</p>
              )}
              {categories.length === 0 && (
                <p className="mt-1 text-sm text-gray-500">
                  Crea categorías desde la página de Productos para organizarlos mejor
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Control de Stock
            </label>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="noStock"
                  checked={noStock}
                  onChange={e => {
                    const checked = e.target.checked
                    setNoStock(checked)
                    if (checked) {
                      setValueProduct('stock', '')
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="noStock" className="ml-2 text-sm text-gray-700">
                  No manejar stock (servicios o productos sin control)
                </label>
              </div>

              {!noStock && (
                <Input
                  label="Cantidad de Compra"
                  type="number"
                  placeholder="Ej: 40"
                  error={errorsProduct.stock?.message}
                  {...registerProduct('stock')}
                  helperText="Cantidad que estás comprando ahora"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              {...registerProduct('description')}
              rows={3}
              placeholder="Descripción del producto o servicio"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {errorsProduct.description && (
              <p className="mt-1 text-sm text-red-600">{errorsProduct.description.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={closeCreateProductModal}>
              Cancelar
            </Button>
            <Button type="submit">
              <PackagePlus className="w-4 h-4 mr-2" />
              Crear Producto
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
