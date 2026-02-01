import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Search, ShoppingCart, Loader2, Building2, Package, Calendar, FileText } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { getSuppliers, getProducts, createSupplier } from '@/services/firestoreService'
import { createPurchaseOrder, getNextPurchaseOrderNumber } from '@/services/purchaseOrderService'
import { formatCurrency } from '@/lib/utils'
import { consultarRUC } from '@/services/documentLookupService'

// Unidades de medida comunes
const UNITS = [
  { value: 'NIU', label: 'Unidad' },
  { value: 'KGM', label: 'Kilogramo' },
  { value: 'LTR', label: 'Litro' },
  { value: 'MTR', label: 'Metro' },
  { value: 'BX', label: 'Caja' },
  { value: 'PK', label: 'Paquete' },
  { value: 'DZN', label: 'Docena' },
  { value: 'MIL', label: 'Millar' },
  { value: 'ZZ', label: 'Servicio' },
]

// Condiciones de pago
const PAYMENT_CONDITIONS = [
  { value: 'contado', label: 'Contado' },
  { value: 'credito_7', label: 'Crédito 7 días' },
  { value: 'credito_15', label: 'Crédito 15 días' },
  { value: 'credito_30', label: 'Crédito 30 días' },
  { value: 'credito_45', label: 'Crédito 45 días' },
  { value: 'credito_60', label: 'Crédito 60 días' },
]

// Obtener fecha local en formato YYYY-MM-DD
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function CreatePurchaseOrderModal({ isOpen, onClose, onSuccess }) {
  const { user } = useAuth()
  const toast = useToast()

  // Estados
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])

  // Datos del proveedor
  const [supplierMode, setSupplierMode] = useState('select') // 'select' o 'manual'
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [manualSupplier, setManualSupplier] = useState({
    ruc: '',
    businessName: '',
    address: '',
    phone: '',
    email: '',
    contactName: '',
  })
  const [isLookingUpRuc, setIsLookingUpRuc] = useState(false)
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false)
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false)

  // Datos de la orden
  const [deliveryDate, setDeliveryDate] = useState('')
  const [paymentCondition, setPaymentCondition] = useState('contado')
  const [currency, setCurrency] = useState('PEN')
  const [notes, setNotes] = useState('')

  // Items
  const [items, setItems] = useState([
    { id: Date.now(), productId: '', name: '', quantity: 1, unitPrice: 0, unit: 'NIU', searchTerm: '' }
  ])
  const [showProductSearch, setShowProductSearch] = useState(null)

  // IGV
  const [pricesIncludeIgv, setPricesIncludeIgv] = useState(true) // Por defecto, los precios ya incluyen IGV

  useEffect(() => {
    if (isOpen) {
      loadData()
      // Establecer fecha de entrega por defecto (7 días desde hoy)
      const defaultDelivery = new Date()
      defaultDelivery.setDate(defaultDelivery.getDate() + 7)
      setDeliveryDate(getLocalDateString(defaultDelivery))
    }
  }, [isOpen, user])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [suppliersResult, productsResult] = await Promise.all([
        getSuppliers(user.uid),
        getProducts(user.uid),
      ])

      if (suppliersResult.success) {
        setSuppliers(suppliersResult.data || [])
      }

      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar los datos')
    } finally {
      setIsLoading(false)
    }
  }

  // Buscar RUC
  const handleLookupRuc = async () => {
    const ruc = manualSupplier.ruc

    if (!ruc || ruc.length !== 11) {
      toast.error('Ingrese un RUC válido de 11 dígitos')
      return
    }

    setIsLookingUpRuc(true)

    try {
      const result = await consultarRUC(ruc)

      if (result.success) {
        setManualSupplier(prev => ({
          ...prev,
          businessName: result.data.razonSocial || '',
          address: result.data.direccion || '',
        }))
        toast.success(`Datos encontrados: ${result.data.razonSocial}`)
      } else {
        toast.error(result.error || 'No se encontraron datos para este RUC')
      }
    } catch (error) {
      console.error('Error al buscar RUC:', error)
      toast.error('Error al consultar el RUC')
    } finally {
      setIsLookingUpRuc(false)
    }
  }

  // Crear nuevo proveedor
  const handleCreateSupplier = async () => {
    if (!manualSupplier.ruc || !manualSupplier.businessName) {
      toast.error('El RUC y razón social son obligatorios')
      return
    }

    if (manualSupplier.ruc.length !== 11) {
      toast.error('El RUC debe tener 11 dígitos')
      return
    }

    setIsCreatingSupplier(true)

    try {
      const result = await createSupplier(user.uid, {
        ruc: manualSupplier.ruc,
        businessName: manualSupplier.businessName,
        address: manualSupplier.address || '',
        phone: manualSupplier.phone || '',
        email: manualSupplier.email || '',
        contactName: manualSupplier.contactName || '',
      })

      if (result.success) {
        toast.success('Proveedor creado exitosamente')

        // Recargar proveedores
        const suppliersResult = await getSuppliers(user.uid)
        if (suppliersResult.success) {
          setSuppliers(suppliersResult.data || [])

          // Seleccionar el proveedor recién creado
          const newSupplier = suppliersResult.data.find(s => s.id === result.id)
          if (newSupplier) {
            setSelectedSupplier(newSupplier)
            setSupplierMode('select')
          }
        }

        setShowNewSupplierModal(false)
        setManualSupplier({
          ruc: '',
          businessName: '',
          address: '',
          phone: '',
          email: '',
          contactName: '',
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al crear proveedor:', error)
      toast.error(error.message || 'Error al crear el proveedor')
    } finally {
      setIsCreatingSupplier(false)
    }
  }

  // Manejo de items
  const addItem = () => {
    setItems([
      ...items,
      { id: Date.now(), productId: '', name: '', quantity: 1, unitPrice: 0, unit: 'NIU', searchTerm: '' }
    ])
  }

  const removeItem = (id) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id))
    }
  }

  const updateItem = (id, field, value) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  const selectProduct = (itemId, product) => {
    // Usar el costo del producto si existe, sino el precio
    const unitPrice = product.cost || product.price || 0

    setItems(items.map(item =>
      item.id === itemId ? {
        ...item,
        productId: product.id,
        name: product.name,
        unitPrice: unitPrice,
        unit: product.unit || 'NIU',
        searchTerm: product.name,
        laboratoryName: product.laboratoryName || '',
        marca: product.marca || '',
      } : item
    ))
    setShowProductSearch(null)
  }

  const clearProductSelection = (itemId) => {
    setItems(items.map(item =>
      item.id === itemId ? {
        ...item,
        productId: '',
        searchTerm: '',
      } : item
    ))
  }

  // Filtrar productos según búsqueda
  const getFilteredProducts = (searchTerm) => {
    if (!searchTerm) return products.slice(0, 5)

    const term = searchTerm.toLowerCase()
    return products
      .filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.code?.toLowerCase().includes(term)
      )
      .slice(0, 10)
  }

  // Cálculos
  const calculateItemTotal = (item) => {
    return (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }

  const itemsTotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0)

  // Si los precios incluyen IGV, extraemos el IGV del total
  // Si no incluyen IGV, calculamos el IGV sobre el subtotal
  const subtotal = pricesIncludeIgv ? itemsTotal / 1.18 : itemsTotal
  const igv = pricesIncludeIgv ? itemsTotal - subtotal : itemsTotal * 0.18
  const total = pricesIncludeIgv ? itemsTotal : itemsTotal + igv

  // Obtener datos del proveedor
  const getSupplierData = () => {
    if (supplierMode === 'select' && selectedSupplier) {
      return {
        id: selectedSupplier.id || '',
        // Soportar ambos campos: ruc (nuevo) y documentNumber (legacy)
        ruc: selectedSupplier.ruc || selectedSupplier.documentNumber || '',
        businessName: selectedSupplier.businessName || '',
        address: selectedSupplier.address || '',
        phone: selectedSupplier.phone || '',
        email: selectedSupplier.email || '',
        contactName: selectedSupplier.contactName || '',
      }
    } else if (supplierMode === 'manual') {
      return {
        ruc: manualSupplier.ruc || '',
        businessName: manualSupplier.businessName || '',
        address: manualSupplier.address || '',
        phone: manualSupplier.phone || '',
        email: manualSupplier.email || '',
        contactName: manualSupplier.contactName || '',
      }
    }
    return null
  }

  // Validar formulario
  const validateForm = () => {
    const supplierData = getSupplierData()
    // Solo requerir razón social del proveedor (RUC es opcional para órdenes de compra)
    if (!supplierData || !supplierData.businessName) {
      toast.error('Debe ingresar al menos el nombre/razón social del proveedor')
      return false
    }

    if (items.length === 0) {
      toast.error('Debe agregar al menos un producto')
      return false
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      // Solo requerir nombre y cantidad > 0 (precio puede ser 0 para bonificaciones o por definir)
      if (!item.name) {
        toast.error(`Item ${i + 1}: Debe ingresar el nombre/descripción del producto`)
        return false
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        toast.error(`Item ${i + 1}: La cantidad debe ser mayor a 0`)
        return false
      }
      // Precio puede ser 0 (bonificación o precio por definir)
      if (item.unitPrice === '' || item.unitPrice === null || parseFloat(item.unitPrice) < 0) {
        toast.error(`Item ${i + 1}: El precio no puede ser negativo`)
        return false
      }
    }

    // Fecha de entrega es opcional (se puede definir después)
    // if (!deliveryDate) {
    //   toast.error('Debe ingresar la fecha de entrega esperada')
    //   return false
    // }

    return true
  }

  // Guardar orden
  const handleSubmit = async () => {
    if (!user?.uid) return

    if (!validateForm()) return

    setIsSaving(true)

    try {
      // Obtener número de orden
      const numberResult = await getNextPurchaseOrderNumber(user.uid)
      if (!numberResult.success) {
        throw new Error('Error al generar número de orden de compra')
      }

      const supplierData = getSupplierData()

      const orderData = {
        number: numberResult.number,
        supplier: supplierData,
        items: items.map((item, index) => ({
          lineNumber: index + 1,
          productId: item.productId || '',
          code: products.find(p => p.id === item.productId)?.code || '',
          name: item.name,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          unit: item.unit,
          subtotal: calculateItemTotal(item),
        })),
        subtotal: subtotal,
        igv: igv,
        total: total,
        currency: currency,
        pricesIncludeIgv: pricesIncludeIgv,
        deliveryDate: deliveryDate,
        paymentCondition: paymentCondition,
        notes: notes,
        status: 'draft',
        sentVia: [],
      }

      const result = await createPurchaseOrder(user.uid, orderData)

      if (!result.success) {
        throw new Error(result.error || 'Error al crear la orden de compra')
      }

      toast.success(`Orden de compra ${numberResult.number} creada exitosamente`)

      // Limpiar formulario
      resetForm()
      onClose()
      if (onSuccess) onSuccess()

    } catch (error) {
      console.error('Error al crear orden de compra:', error)
      toast.error(error.message || 'Error al crear la orden de compra')
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setSupplierMode('select')
    setSelectedSupplier(null)
    setManualSupplier({
      ruc: '',
      businessName: '',
      address: '',
      phone: '',
      email: '',
      contactName: '',
    })
    setItems([
      { id: Date.now(), productId: '', name: '', quantity: 1, unitPrice: 0, unit: 'NIU', searchTerm: '' }
    ])
    setDeliveryDate('')
    setPaymentCondition('contado')
    setCurrency('PEN')
    setPricesIncludeIgv(true)
    setNotes('')
  }

  if (isLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} maxWidth="4xl">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      </Modal>
    )
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} maxWidth="4xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Nueva Orden de Compra</h2>
              <p className="text-sm text-gray-600">Pedido a proveedor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col max-h-[calc(90vh-8rem)]">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

            {/* Proveedor */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-800">Datos del Proveedor</h3>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNewSupplierModal(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nuevo Proveedor
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSupplierMode('select')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    supplierMode === 'select'
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Proveedor Registrado
                </button>
                <button
                  type="button"
                  onClick={() => setSupplierMode('manual')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    supplierMode === 'manual'
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Datos Manuales
                </button>
              </div>

              {/* Seleccionar proveedor */}
              {supplierMode === 'select' && (
                <>
                  <Select
                    label="Proveedor *"
                    value={selectedSupplier?.id || ''}
                    onChange={(e) => {
                      const supplier = suppliers.find(s => s.id === e.target.value)
                      setSelectedSupplier(supplier || null)
                    }}
                  >
                    <option value="">Seleccionar proveedor...</option>
                    {suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.businessName} - {supplier.ruc || supplier.documentNumber || 'Sin RUC'}
                      </option>
                    ))}
                  </Select>

                  {selectedSupplier && (
                    <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600">Razón Social:</span>
                          <span className="ml-2 font-medium">{selectedSupplier.businessName}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">RUC:</span>
                          <span className="ml-2 font-medium">{selectedSupplier.ruc || selectedSupplier.documentNumber}</span>
                        </div>
                        {selectedSupplier.address && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Dirección:</span>
                            <span className="ml-2 font-medium">{selectedSupplier.address}</span>
                          </div>
                        )}
                        {selectedSupplier.phone && (
                          <div>
                            <span className="text-gray-600">Teléfono:</span>
                            <span className="ml-2 font-medium">{selectedSupplier.phone}</span>
                          </div>
                        )}
                        {selectedSupplier.email && (
                          <div>
                            <span className="text-gray-600">Email:</span>
                            <span className="ml-2 font-medium">{selectedSupplier.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Datos manuales */}
              {supplierMode === 'manual' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      RUC <span className="text-gray-400 text-xs">(opcional)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualSupplier.ruc}
                        onChange={(e) => setManualSupplier({ ...manualSupplier, ruc: e.target.value })}
                        placeholder="20123456789"
                        maxLength={11}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={handleLookupRuc}
                        disabled={isLookingUpRuc}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                        title="Buscar datos del RUC"
                      >
                        {isLookingUpRuc ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Input
                    label="Razón Social / Nombre *"
                    value={manualSupplier.businessName}
                    onChange={(e) => setManualSupplier({ ...manualSupplier, businessName: e.target.value })}
                    placeholder="Nombre de la empresa o proveedor"
                  />

                  <div className="sm:col-span-2">
                    <Input
                      label="Dirección"
                      value={manualSupplier.address}
                      onChange={(e) => setManualSupplier({ ...manualSupplier, address: e.target.value })}
                      placeholder="Dirección del proveedor"
                    />
                  </div>

                  <Input
                    label="Teléfono"
                    value={manualSupplier.phone}
                    onChange={(e) => setManualSupplier({ ...manualSupplier, phone: e.target.value })}
                    placeholder="987654321"
                  />

                  <Input
                    type="email"
                    label="Email"
                    value={manualSupplier.email}
                    onChange={(e) => setManualSupplier({ ...manualSupplier, email: e.target.value })}
                    placeholder="proveedor@email.com"
                  />
                </div>
              )}
            </div>

            {/* Configuración de la orden */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <Calendar className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-800">Configuración de la Orden</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  type="date"
                  label="Fecha de entrega esperada"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  min={getLocalDateString()}
                />

                <Select
                  label="Condición de pago"
                  value={paymentCondition}
                  onChange={(e) => setPaymentCondition(e.target.value)}
                >
                  {PAYMENT_CONDITIONS.map(cond => (
                    <option key={cond.value} value={cond.value}>
                      {cond.label}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Moneda"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="PEN">Soles (S/)</option>
                  <option value="USD">Dólares ($)</option>
                </Select>
              </div>

              {/* Checkbox IGV */}
              <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <input
                  type="checkbox"
                  id="pricesIncludeIgv"
                  checked={pricesIncludeIgv}
                  onChange={(e) => setPricesIncludeIgv(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="pricesIncludeIgv" className="text-sm text-gray-700 cursor-pointer">
                  <span className="font-medium">Los precios incluyen IGV</span>
                  <span className="text-gray-500 ml-1 text-xs">
                    (desmarcar si los precios son sin IGV)
                  </span>
                </label>
              </div>
            </div>

            {/* Productos */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-800">Productos a Solicitar</h3>
                </div>
                <Button type="button" size="sm" onClick={addItem}>
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar Producto
                </Button>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={item.id} className="p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-700">Item {index + 1}</h4>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Buscador de productos */}
                      <div className="sm:col-span-2 relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Buscar Producto
                        </label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            value={item.searchTerm}
                            onChange={(e) => {
                              updateItem(item.id, 'searchTerm', e.target.value)
                              setShowProductSearch(item.id)
                            }}
                            onFocus={() => setShowProductSearch(item.id)}
                            placeholder="Buscar por nombre o código..."
                            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          {item.productId && (
                            <button
                              type="button"
                              onClick={() => clearProductSelection(item.id)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Dropdown de resultados */}
                        {showProductSearch === item.id && !item.productId && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setShowProductSearch(null)}
                            />
                            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                              {getFilteredProducts(item.searchTerm).length > 0 ? (
                                getFilteredProducts(item.searchTerm).map(product => (
                                  <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => selectProduct(item.id, product)}
                                    className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                                  >
                                    <div>
                                      <p className="font-medium text-sm">{product.name}</p>
                                      {product.code && (
                                        <p className="text-xs text-gray-500">Código: {product.code}</p>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      {product.cost && (
                                        <p className="text-xs text-gray-500">
                                          Costo: {formatCurrency(product.cost, currency)}
                                        </p>
                                      )}
                                      <p className="text-sm font-semibold text-primary-600">
                                        {formatCurrency(product.price, currency)}
                                      </p>
                                    </div>
                                  </button>
                                ))
                              ) : (
                                <div className="px-4 py-3 text-sm text-gray-500 text-center">
                                  No se encontraron productos
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <Input
                          label="Descripción del producto *"
                          value={item.name}
                          onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                          placeholder="Nombre o descripción del producto"
                        />
                      </div>

                      <Input
                        type="number"
                        label="Cantidad *"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                        min="0.01"
                        step="0.01"
                      />

                      <Select
                        label="Unidad"
                        value={item.unit}
                        onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                      >
                        {UNITS.map(unit => (
                          <option key={unit.value} value={unit.value}>
                            {unit.label}
                          </option>
                        ))}
                      </Select>

                      <Input
                        type="number"
                        label="Precio Unitario"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                        min="0"
                        step="0.01"
                      />

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Subtotal
                        </label>
                        <div className="h-10 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg flex items-center">
                          <span className="font-semibold text-gray-900">
                            {formatCurrency(calculateItemTotal(item), currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-600" />
                <label className="block text-sm font-medium text-gray-700">
                  Observaciones / Notas
                </label>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Instrucciones especiales, notas para el proveedor..."
              />
            </div>

            {/* Resumen */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">IGV (18%):</span>
                <span className="font-medium">{formatCurrency(igv, currency)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="text-lg font-semibold text-gray-900">Total:</span>
                <span className="text-xl font-bold text-primary-600">
                  {formatCurrency(total, currency)}
                </span>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-lg">
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Crear Orden de Compra
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Nuevo Proveedor */}
      <Modal
        isOpen={showNewSupplierModal}
        onClose={() => !isCreatingSupplier && setShowNewSupplierModal(false)}
        title="Crear Nuevo Proveedor"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                RUC <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualSupplier.ruc}
                  onChange={(e) => setManualSupplier({ ...manualSupplier, ruc: e.target.value })}
                  placeholder="20123456789"
                  maxLength={11}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="button"
                  onClick={handleLookupRuc}
                  disabled={isLookingUpRuc}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {isLookingUpRuc ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Input
              label="Razón Social *"
              value={manualSupplier.businessName}
              onChange={(e) => setManualSupplier({ ...manualSupplier, businessName: e.target.value })}
              placeholder="Nombre de la empresa"
            />

            <div className="sm:col-span-2">
              <Input
                label="Dirección"
                value={manualSupplier.address}
                onChange={(e) => setManualSupplier({ ...manualSupplier, address: e.target.value })}
                placeholder="Dirección del proveedor"
              />
            </div>

            <Input
              label="Teléfono"
              value={manualSupplier.phone}
              onChange={(e) => setManualSupplier({ ...manualSupplier, phone: e.target.value })}
              placeholder="987654321"
            />

            <Input
              type="email"
              label="Email"
              value={manualSupplier.email}
              onChange={(e) => setManualSupplier({ ...manualSupplier, email: e.target.value })}
              placeholder="proveedor@email.com"
            />

            <div className="sm:col-span-2">
              <Input
                label="Nombre de contacto"
                value={manualSupplier.contactName}
                onChange={(e) => setManualSupplier({ ...manualSupplier, contactName: e.target.value })}
                placeholder="Persona de contacto"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowNewSupplierModal(false)}
              disabled={isCreatingSupplier}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateSupplier} disabled={isCreatingSupplier}>
              {isCreatingSupplier ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Proveedor
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
