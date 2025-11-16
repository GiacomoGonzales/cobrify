import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Loader2, ArrowLeft, UserPlus, X, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { calculateInvoiceAmounts, ID_TYPES } from '@/utils/peruUtils'
import { formatCurrency } from '@/lib/utils'
import { getCustomers, getProducts, createCustomer } from '@/services/firestoreService'
import { createQuotation, getNextQuotationNumber } from '@/services/quotationService'

const UNITS = [
  { value: 'UNIDAD', label: 'Unidad' },
  { value: 'SERVICIO', label: 'Servicio' },
  { value: 'CAJA', label: 'Caja' },
  { value: 'KG', label: 'Kilogramo' },
  { value: 'METRO', label: 'Metro' },
  { value: 'HORA', label: 'Hora' },
]

export default function CreateQuotation() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Cliente
  const [customerMode, setCustomerMode] = useState('select') // 'select' o 'manual'
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [manualCustomer, setManualCustomer] = useState({
    documentType: 'DNI',
    documentNumber: '',
    name: '',
    email: '',
    phone: '',
    address: '',
  })
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)

  // Cotización
  const [validityDays, setValidityDays] = useState(30)
  const [discount, setDiscount] = useState(0)
  const [discountType, setDiscountType] = useState('fixed')
  const [terms, setTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [hideIgv, setHideIgv] = useState(false) // Nuevo: ocultar IGV
  const [quotationItems, setQuotationItems] = useState([
    { productId: '', name: '', quantity: 1, unitPrice: 0, unit: 'UNIDAD', searchTerm: '' },
  ])

  // Buscador de productos
  const [showProductSearch, setShowProductSearch] = useState(null) // índice del item activo

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [customersResult, productsResult] = await Promise.all([
        getCustomers(user.uid),
        getProducts(user.uid),
      ])

      if (customersResult.success) {
        setCustomers(customersResult.data || [])
      }

      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar los datos. Por favor, recarga la página.')
    } finally {
      setIsLoading(false)
    }
  }

  const addItem = () => {
    setQuotationItems([
      ...quotationItems,
      { productId: '', name: '', description: '', quantity: 1, unitPrice: 0, unit: 'UNIDAD', searchTerm: '' },
    ])
  }

  const removeItem = index => {
    if (quotationItems.length > 1) {
      setQuotationItems(quotationItems.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index, field, value) => {
    const newItems = [...quotationItems]
    newItems[index][field] = value
    setQuotationItems(newItems)
  }

  const selectProduct = (index, product) => {
    const newItems = [...quotationItems]
    newItems[index].productId = product.id
    newItems[index].name = product.name
    newItems[index].description = product.description || ''
    newItems[index].unitPrice = product.price
    newItems[index].unit = product.unit || 'UNIDAD'
    newItems[index].searchTerm = product.name
    setQuotationItems(newItems)
    setShowProductSearch(null)
  }

  const clearProductSelection = (index) => {
    const newItems = [...quotationItems]
    newItems[index].productId = ''
    newItems[index].searchTerm = ''
    setQuotationItems(newItems)
  }

  // Filtrar productos según búsqueda
  const getFilteredProducts = (searchTerm) => {
    if (!searchTerm) return products.slice(0, 5) // Mostrar primeros 5 si no hay búsqueda

    const term = searchTerm.toLowerCase()
    return products
      .filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.code?.toLowerCase().includes(term)
      )
      .slice(0, 10) // Máximo 10 resultados
  }

  const calculateItemTotal = item => {
    return (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }

  // Calcular subtotal base
  const baseAmounts = calculateInvoiceAmounts(
    quotationItems.map(item => ({
      price: parseFloat(item.unitPrice) || 0,
      quantity: parseFloat(item.quantity) || 0,
    }))
  )

  // Calcular descuento
  const discountAmount =
    discountType === 'percentage'
      ? (baseAmounts.subtotal * (parseFloat(discount) || 0)) / 100
      : parseFloat(discount) || 0

  const discountedSubtotal = baseAmounts.subtotal - discountAmount

  // Calcular IGV y total con descuento aplicado
  const finalIgv = discountedSubtotal * 0.18
  const finalTotal = discountedSubtotal + finalIgv

  const handleCustomerChange = customerId => {
    const customer = customers.find(c => c.id === customerId)
    setSelectedCustomer(customer || null)
  }

  const handleCreateCustomer = async () => {
    // Validaciones
    if (!manualCustomer.documentNumber || !manualCustomer.name) {
      toast.error('El número de documento y el nombre son obligatorios')
      return
    }

    // Validar longitud del documento
    if (manualCustomer.documentType === 'DNI' && manualCustomer.documentNumber.length !== 8) {
      toast.error('El DNI debe tener 8 dígitos')
      return
    }

    if (manualCustomer.documentType === 'RUC' && manualCustomer.documentNumber.length !== 11) {
      toast.error('El RUC debe tener 11 dígitos')
      return
    }

    setIsCreatingCustomer(true)

    try {
      const result = await createCustomer(user.uid, manualCustomer)

      if (result.success) {
        toast.success('Cliente creado exitosamente')

        // Recargar clientes
        const customersResult = await getCustomers(user.uid)
        if (customersResult.success) {
          setCustomers(customersResult.data || [])

          // Seleccionar el cliente recién creado
          const newCustomer = customersResult.data.find(c => c.id === result.id)
          if (newCustomer) {
            setSelectedCustomer(newCustomer)
            setCustomerMode('select')
          }
        }

        setShowNewCustomerModal(false)
        setManualCustomer({
          documentType: 'DNI',
          documentNumber: '',
          name: '',
          email: '',
          phone: '',
          address: '',
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al crear cliente:', error)
      toast.error(error.message || 'Error al crear el cliente')
    } finally {
      setIsCreatingCustomer(false)
    }
  }

  const getCustomerData = () => {
    if (customerMode === 'select' && selectedCustomer) {
      return {
        id: selectedCustomer.id,
        documentType: selectedCustomer.documentType,
        documentNumber: selectedCustomer.documentNumber,
        name: selectedCustomer.name,
        businessName: selectedCustomer.businessName || '',
        email: selectedCustomer.email || '',
        phone: selectedCustomer.phone || '',
        address: selectedCustomer.address || '',
      }
    } else if (customerMode === 'manual') {
      return {
        documentType: manualCustomer.documentType,
        documentNumber: manualCustomer.documentNumber,
        name: manualCustomer.name,
        businessName: '',
        email: manualCustomer.email || '',
        phone: manualCustomer.phone || '',
        address: manualCustomer.address || '',
      }
    }
    return null
  }

  const validateForm = () => {
    // Validar que haya datos de cliente
    const customerData = getCustomerData()
    if (!customerData || !customerData.documentNumber || !customerData.name) {
      toast.error('Debe seleccionar o ingresar los datos del cliente')
      return false
    }

    // Validar que haya al menos un item
    if (quotationItems.length === 0) {
      toast.error('Debe agregar al menos un item')
      return false
    }

    // Validar que todos los items tengan datos válidos
    for (let i = 0; i < quotationItems.length; i++) {
      const item = quotationItems[i]
      if (!item.name || !item.quantity || !item.unitPrice) {
        toast.error(`Item ${i + 1}: Todos los campos son obligatorios`)
        return false
      }
      if (parseFloat(item.quantity) <= 0 || parseFloat(item.unitPrice) <= 0) {
        toast.error(`Item ${i + 1}: Cantidad y precio deben ser mayores a 0`)
        return false
      }
    }

    // Validar días de validez
    if (!validityDays || parseFloat(validityDays) <= 0) {
      toast.error('Los días de validez deben ser mayor a 0')
      return false
    }

    return true
  }

  const onSubmit = async () => {
    if (!user?.uid) return

    if (!validateForm()) {
      return
    }

    setIsSaving(true)

    try {
      // 1. Obtener siguiente número de cotización
      const numberResult = await getNextQuotationNumber(user.uid)
      if (!numberResult.success) {
        throw new Error('Error al generar número de cotización')
      }

      // 2. Preparar items de la cotización
      const items = quotationItems.map(item => ({
        productId: item.productId || '',
        code: products.find(p => p.id === item.productId)?.code || '',
        name: item.name,
        description: item.description || '',
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        unit: item.unit,
        subtotal: calculateItemTotal(item),
      }))

      // 3. Calcular fecha de expiración
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + parseInt(validityDays))

      // 4. Obtener datos del cliente
      const customerData = getCustomerData()

      // 5. Crear cotización
      const quotationData = {
        number: numberResult.number,
        customer: customerData,
        items: items,
        subtotal: baseAmounts.subtotal,
        discount: parseFloat(discount) || 0,
        discountType: discountType,
        discountedSubtotal: discountedSubtotal,
        igv: finalIgv,
        total: finalTotal,
        hideIgv: hideIgv, // Agregar opción de ocultar IGV
        validityDays: parseInt(validityDays),
        expiryDate: expiryDate,
        status: 'draft',
        terms: terms,
        notes: notes,
        sentVia: [],
      }

      const result = await createQuotation(user.uid, quotationData)
      if (!result.success) {
        throw new Error(result.error || 'Error al crear la cotización')
      }

      // 6. Mostrar éxito y redirigir
      toast.success(`Cotización ${numberResult.number} creada exitosamente`)

      setTimeout(() => {
        navigate('/app/cotizaciones')
      }, 1500)
    } catch (error) {
      console.error('Error al crear cotización:', error)
      toast.error(error.message || 'Error al crear la cotización. Inténtalo nuevamente.')
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => navigate('/app/cotizaciones')}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Nueva Cotización</h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600">
            Crea una nueva cotización para enviar a tus clientes
          </p>
        </div>
      </div>

      {/* Main Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Form Fields */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cliente */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Información del Cliente</CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNewCustomerModal(true)}
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Nuevo Cliente
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Tabs para seleccionar modo */}
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCustomerMode('select')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      customerMode === 'select'
                        ? 'bg-white text-primary-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Cliente Registrado
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode('manual')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      customerMode === 'manual'
                        ? 'bg-white text-primary-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Datos Manuales
                  </button>
                </div>

                {/* Modo: Seleccionar cliente */}
                {customerMode === 'select' && (
                  <>
                    <Select
                      label="Cliente *"
                      value={selectedCustomer?.id || ''}
                      onChange={e => handleCustomerChange(e.target.value)}
                    >
                      <option value="">Seleccionar cliente...</option>
                      {customers.map(customer => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name} - {customer.documentNumber}
                        </option>
                      ))}
                    </Select>

                    {selectedCustomer && (
                      <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-600">Nombre:</span>
                            <span className="ml-2 font-medium">{selectedCustomer.name}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Documento:</span>
                            <span className="ml-2 font-medium">
                              {selectedCustomer.documentType} {selectedCustomer.documentNumber}
                            </span>
                          </div>
                          {selectedCustomer.email && (
                            <div>
                              <span className="text-gray-600">Email:</span>
                              <span className="ml-2 font-medium">{selectedCustomer.email}</span>
                            </div>
                          )}
                          {selectedCustomer.phone && (
                            <div>
                              <span className="text-gray-600">Teléfono:</span>
                              <span className="ml-2 font-medium">{selectedCustomer.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Modo: Datos manuales */}
                {customerMode === 'manual' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select
                      label="Tipo de Documento *"
                      value={manualCustomer.documentType}
                      onChange={e =>
                        setManualCustomer({ ...manualCustomer, documentType: e.target.value })
                      }
                    >
                      <option value="DNI">DNI</option>
                      <option value="RUC">RUC</option>
                      <option value="CE">Carnet de Extranjería</option>
                      <option value="PASSPORT">Pasaporte</option>
                    </Select>

                    <Input
                      label="Número de Documento *"
                      value={manualCustomer.documentNumber}
                      onChange={e =>
                        setManualCustomer({ ...manualCustomer, documentNumber: e.target.value })
                      }
                      placeholder={
                        manualCustomer.documentType === 'DNI'
                          ? '12345678'
                          : manualCustomer.documentType === 'RUC'
                          ? '20123456789'
                          : 'Número'
                      }
                    />

                    <div className="sm:col-span-2">
                      <Input
                        label="Nombre / Razón Social *"
                        value={manualCustomer.name}
                        onChange={e =>
                          setManualCustomer({ ...manualCustomer, name: e.target.value })
                        }
                        placeholder="Nombre completo o razón social"
                      />
                    </div>

                    <Input
                      type="email"
                      label="Email"
                      value={manualCustomer.email}
                      onChange={e =>
                        setManualCustomer({ ...manualCustomer, email: e.target.value })
                      }
                      placeholder="cliente@email.com"
                    />

                    <Input
                      type="tel"
                      label="Teléfono"
                      value={manualCustomer.phone}
                      onChange={e =>
                        setManualCustomer({ ...manualCustomer, phone: e.target.value })
                      }
                      placeholder="987654321"
                    />

                    <div className="sm:col-span-2">
                      <Input
                        label="Dirección"
                        value={manualCustomer.address}
                        onChange={e =>
                          setManualCustomer({ ...manualCustomer, address: e.target.value })
                        }
                        placeholder="Dirección completa"
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Productos / Servicios</CardTitle>
                <Button type="button" size="sm" onClick={addItem}>
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {quotationItems.map((item, index) => (
                  <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-700">Item {index + 1}</h4>
                      {quotationItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Buscador de Productos */}
                      <div className="sm:col-span-2 relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Buscar Producto
                        </label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            value={item.searchTerm}
                            onChange={e => {
                              updateItem(index, 'searchTerm', e.target.value)
                              setShowProductSearch(index)
                            }}
                            onFocus={() => setShowProductSearch(index)}
                            placeholder="Buscar por nombre o código..."
                            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          {item.productId && (
                            <button
                              type="button"
                              onClick={() => clearProductSelection(index)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Dropdown de resultados */}
                        {showProductSearch === index && !item.productId && (
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
                                    onClick={() => selectProduct(index, product)}
                                    className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                                  >
                                    <div>
                                      <p className="font-medium text-sm">{product.name}</p>
                                      {product.code && (
                                        <p className="text-xs text-gray-500">Código: {product.code}</p>
                                      )}
                                    </div>
                                    <span className="text-sm font-semibold text-primary-600">
                                      {formatCurrency(product.price)}
                                    </span>
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
                          label="Nombre del Producto/Servicio *"
                          value={item.name}
                          onChange={e => updateItem(index, 'name', e.target.value)}
                          placeholder="Nombre del producto o servicio"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Input
                          label="Descripción (opcional)"
                          value={item.description || ''}
                          onChange={e => updateItem(index, 'description', e.target.value)}
                          placeholder="Descripción detallada del producto o servicio"
                        />
                      </div>

                      <Input
                        type="number"
                        label="Cantidad *"
                        value={item.quantity}
                        onChange={e => updateItem(index, 'quantity', e.target.value)}
                        min="0.01"
                        step="0.01"
                      />

                      <Select
                        label="Unidad *"
                        value={item.unit}
                        onChange={e => updateItem(index, 'unit', e.target.value)}
                      >
                        {UNITS.map(unit => (
                          <option key={unit.value} value={unit.value}>
                            {unit.label}
                          </option>
                        ))}
                      </Select>

                      <Input
                        type="number"
                        label="Precio Unitario *"
                        value={item.unitPrice}
                        onChange={e => updateItem(index, 'unitPrice', e.target.value)}
                        min="0"
                        step="0.01"
                      />

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Subtotal
                        </label>
                        <div className="h-10 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg flex items-center">
                          <span className="font-semibold text-gray-900">
                            {formatCurrency(calculateItemTotal(item))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Configuración Adicional */}
          <Card>
            <CardHeader>
              <CardTitle>Configuración Adicional</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    type="number"
                    label="Validez (días) *"
                    value={validityDays}
                    onChange={e => setValidityDays(e.target.value)}
                    min="1"
                    help="Días de validez de la cotización"
                  />

                  <Select
                    label="Tipo de Descuento"
                    value={discountType}
                    onChange={e => setDiscountType(e.target.value)}
                  >
                    <option value="fixed">Monto Fijo (S/)</option>
                    <option value="percentage">Porcentaje (%)</option>
                  </Select>

                  <Input
                    type="number"
                    label={`Descuento ${discountType === 'percentage' ? '(%)' : '(S/)'}`}
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="hideIgv"
                    checked={hideIgv}
                    onChange={e => setHideIgv(e.target.checked)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="hideIgv" className="ml-2 text-sm font-medium text-gray-700">
                    Ocultar IGV (mostrar solo total)
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Términos y Condiciones
                  </label>
                  <textarea
                    value={terms}
                    onChange={e => setTerms(e.target.value)}
                    rows="3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Ejemplo: Precios sujetos a cambio sin previo aviso. Válido solo para pedidos confirmados..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observaciones
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows="3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Observaciones adicionales..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Summary */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2 text-sm">
                  {!hideIgv && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="font-medium">{formatCurrency(baseAmounts.subtotal)}</span>
                      </div>

                      {discount > 0 && (
                        <>
                          <div className="flex justify-between text-red-600">
                            <span>
                              Descuento {discountType === 'percentage' ? `(${discount}%)` : ''}:
                            </span>
                            <span className="font-medium">- {formatCurrency(discountAmount)}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t">
                            <span className="text-gray-600">Subtotal con descuento:</span>
                            <span className="font-medium">{formatCurrency(discountedSubtotal)}</span>
                          </div>
                        </>
                      )}

                      <div className="flex justify-between">
                        <span className="text-gray-600">IGV (18%):</span>
                        <span className="font-medium">{formatCurrency(finalIgv)}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-900">Total:</span>
                    <span className="text-2xl font-bold text-primary-600">
                      {formatCurrency(finalTotal)}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-2 text-sm text-gray-600">
                  <p>
                    <strong>Items:</strong> {quotationItems.length}
                  </p>
                  <p>
                    <strong>Validez:</strong> {validityDays} días
                  </p>
                  {customerMode === 'select' && selectedCustomer && (
                    <p>
                      <strong>Cliente:</strong> {selectedCustomer.name}
                    </p>
                  )}
                  {customerMode === 'manual' && manualCustomer.name && (
                    <p>
                      <strong>Cliente:</strong> {manualCustomer.name}
                    </p>
                  )}
                </div>

                <div className="pt-4">
                  <Button onClick={onSubmit} disabled={isSaving} className="w-full">
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Crear Cotización
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal: Nuevo Cliente */}
      <Modal
        isOpen={showNewCustomerModal}
        onClose={() => !isCreatingCustomer && setShowNewCustomerModal(false)}
        title="Crear Nuevo Cliente"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Tipo de Documento *"
              value={manualCustomer.documentType}
              onChange={e =>
                setManualCustomer({ ...manualCustomer, documentType: e.target.value })
              }
            >
              <option value="DNI">DNI</option>
              <option value="RUC">RUC</option>
              <option value="CE">Carnet de Extranjería</option>
              <option value="PASSPORT">Pasaporte</option>
            </Select>

            <Input
              label="Número de Documento *"
              value={manualCustomer.documentNumber}
              onChange={e =>
                setManualCustomer({ ...manualCustomer, documentNumber: e.target.value })
              }
              placeholder={
                manualCustomer.documentType === 'DNI'
                  ? '12345678'
                  : manualCustomer.documentType === 'RUC'
                  ? '20123456789'
                  : 'Número'
              }
            />

            <div className="sm:col-span-2">
              <Input
                label="Nombre / Razón Social *"
                value={manualCustomer.name}
                onChange={e => setManualCustomer({ ...manualCustomer, name: e.target.value })}
                placeholder="Nombre completo o razón social"
              />
            </div>

            <Input
              type="email"
              label="Email"
              value={manualCustomer.email}
              onChange={e => setManualCustomer({ ...manualCustomer, email: e.target.value })}
              placeholder="cliente@email.com"
            />

            <Input
              type="tel"
              label="Teléfono"
              value={manualCustomer.phone}
              onChange={e => setManualCustomer({ ...manualCustomer, phone: e.target.value })}
              placeholder="987654321"
            />

            <div className="sm:col-span-2">
              <Input
                label="Dirección"
                value={manualCustomer.address}
                onChange={e => setManualCustomer({ ...manualCustomer, address: e.target.value })}
                placeholder="Dirección completa"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowNewCustomerModal(false)}
              disabled={isCreatingCustomer}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateCustomer} disabled={isCreatingCustomer}>
              {isCreatingCustomer ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Crear y Usar
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
