import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, Save, Eye, Loader2, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import { invoiceSchema } from '@/utils/schemas'
import { calculateInvoiceAmounts, ID_TYPES } from '@/utils/peruUtils'
import { formatCurrency } from '@/lib/utils'
import {
  getCustomers,
  getProducts,
  createInvoice,
  getNextDocumentNumber,
  updateProduct,
} from '@/services/firestoreService'

const UNITS = [
  { value: 'UNIDAD', label: 'Unidad' },
  { value: 'SERVICIO', label: 'Servicio' },
  { value: 'CAJA', label: 'Caja' },
  { value: 'KG', label: 'Kilogramo' },
  { value: 'METRO', label: 'Metro' },
  { value: 'HORA', label: 'Hora' },
]

export default function CreateInvoice() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [documentType, setDocumentType] = useState('boleta')
  const [invoiceItems, setInvoiceItems] = useState([
    { productId: '', name: '', quantity: 1, unitPrice: 0, unit: 'UNIDAD' },
  ])

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
      setMessage({
        type: 'error',
        text: 'Error al cargar los datos. Por favor, recarga la página.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const addItem = () => {
    setInvoiceItems([
      ...invoiceItems,
      { productId: '', name: '', quantity: 1, unitPrice: 0, unit: 'UNIDAD' },
    ])
  }

  const removeItem = index => {
    if (invoiceItems.length > 1) {
      setInvoiceItems(invoiceItems.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index, field, value) => {
    const newItems = [...invoiceItems]
    newItems[index][field] = value

    // Si selecciona un producto, auto-completar datos
    if (field === 'productId' && value) {
      const product = products.find(p => p.id === value)
      if (product) {
        newItems[index].name = product.name
        newItems[index].unitPrice = product.price
        newItems[index].unit = product.unit || 'UNIDAD'
      }
    }

    setInvoiceItems(newItems)
  }

  const calculateItemTotal = item => {
    return (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }

  const amounts = calculateInvoiceAmounts(
    invoiceItems.map(item => ({
      price: parseFloat(item.unitPrice) || 0,
      quantity: parseFloat(item.quantity) || 0,
    }))
  )

  const handleCustomerChange = customerId => {
    const customer = customers.find(c => c.id === customerId)
    setSelectedCustomer(customer || null)
    // Si selecciona cliente con RUC, cambiar a factura
    if (customer?.documentType === ID_TYPES.RUC) {
      setDocumentType('factura')
    }
  }

  const validateForm = () => {
    // Validar que haya un cliente seleccionado para facturas
    if (documentType === 'factura' && (!selectedCustomer || selectedCustomer.documentType !== ID_TYPES.RUC)) {
      setMessage({
        type: 'error',
        text: 'Las facturas requieren un cliente con RUC',
      })
      return false
    }

    // Validar que haya al menos un item
    if (invoiceItems.length === 0) {
      setMessage({
        type: 'error',
        text: 'Debe agregar al menos un item',
      })
      return false
    }

    // Validar que todos los items tengan datos válidos
    for (let i = 0; i < invoiceItems.length; i++) {
      const item = invoiceItems[i]
      if (!item.name || !item.quantity || !item.unitPrice) {
        setMessage({
          type: 'error',
          text: `Item ${i + 1}: Todos los campos son obligatorios`,
        })
        return false
      }
      if (parseFloat(item.quantity) <= 0 || parseFloat(item.unitPrice) <= 0) {
        setMessage({
          type: 'error',
          text: `Item ${i + 1}: Cantidad y precio deben ser mayores a 0`,
        })
        return false
      }
    }

    return true
  }

  const onSubmit = async () => {
    if (!user?.uid) return

    if (!validateForm()) {
      setTimeout(() => setMessage(null), 3000)
      return
    }

    setIsSaving(true)
    setMessage(null)

    try {
      // 1. Obtener siguiente número de documento
      const numberResult = await getNextDocumentNumber(user.uid, documentType)
      if (!numberResult.success) {
        throw new Error('Error al generar número de comprobante')
      }

      // 2. Preparar items de la factura
      const items = invoiceItems.map(item => ({
        productId: item.productId || '',
        code: products.find(p => p.id === item.productId)?.code || '',
        name: item.name,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        unit: item.unit,
        subtotal: calculateItemTotal(item),
      }))

      // 3. Crear factura
      const invoiceData = {
        number: numberResult.number,
        documentType: documentType,
        customer: selectedCustomer
          ? {
              id: selectedCustomer.id,
              documentType: selectedCustomer.documentType,
              documentNumber: selectedCustomer.documentNumber,
              name: selectedCustomer.name,
              businessName: selectedCustomer.businessName || '',
              email: selectedCustomer.email || '',
              phone: selectedCustomer.phone || '',
              address: selectedCustomer.address || '',
            }
          : {
              documentType: ID_TYPES.DNI,
              documentNumber: '00000000',
              name: 'Cliente General',
              businessName: '',
              email: '',
              phone: '',
              address: '',
            },
        items: items,
        subtotal: amounts.subtotal,
        igv: amounts.igv,
        total: amounts.total,
        paymentMethod: 'Manual',
        status: 'pending',
        notes: '',
      }

      const result = await createInvoice(user.uid, invoiceData)
      if (!result.success) {
        throw new Error(result.error || 'Error al crear la factura')
      }

      // 4. Actualizar stock de productos (solo los que tienen productId y stock)
      const stockUpdates = invoiceItems
        .filter(item => item.productId) // Solo items de productos existentes
        .map(async item => {
          const product = products.find(p => p.id === item.productId)
          if (!product) return

          // Solo actualizar si el producto maneja stock (trackStock !== false)
          // Si trackStock es undefined o true, sí actualizar
          // Si trackStock es false, NO actualizar
          if (product.trackStock === false) return

          if (product.stock !== null) {
            const newStock = product.stock - parseFloat(item.quantity)
            return updateProduct(item.productId, { stock: newStock })
          }
        })

      await Promise.all(stockUpdates)

      // 5. Mostrar éxito y redirigir
      setMessage({
        type: 'success',
        text: `✓ ${documentType === 'factura' ? 'Factura' : 'Boleta'} ${numberResult.number} creada exitosamente`,
      })

      setTimeout(() => {
        navigate('/facturas')
      }, 1500)
    } catch (error) {
      console.error('Error al crear factura:', error)
      setMessage({
        type: 'error',
        text: error.message || 'Error al crear la factura. Inténtalo nuevamente.',
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => navigate('/facturas')}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Nueva Factura</h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600">
            Crea una nueva factura o boleta manualmente
          </p>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <Alert
          variant={message.type === 'success' ? 'success' : 'danger'}
          title={message.type === 'success' ? 'Éxito' : 'Error'}
        >
          {message.text}
        </Alert>
      )}

      <div className="space-y-6">
        {/* Document Type & Customer */}
        <Card>
          <CardHeader>
            <CardTitle>Información del Comprobante</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Comprobante *
                </label>
                <Select
                  value={documentType}
                  onChange={e => setDocumentType(e.target.value)}
                  disabled={selectedCustomer?.documentType === ID_TYPES.RUC}
                >
                  <option value="boleta">Boleta de Venta</option>
                  <option value="factura">Factura Electrónica</option>
                </Select>
                {selectedCustomer?.documentType === ID_TYPES.RUC && (
                  <p className="text-xs text-gray-500 mt-1">
                    Los clientes con RUC requieren factura
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cliente {documentType === 'factura' && '*'}
                </label>
                <Select
                  value={selectedCustomer?.id || ''}
                  onChange={e => handleCustomerChange(e.target.value)}
                >
                  <option value="">Cliente General</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} - {customer.documentNumber}
                    </option>
                  ))}
                </Select>
                {customers.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No hay clientes. Agrega clientes desde el menú Clientes.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Items</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {invoiceItems.map((item, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    {/* Producto (opcional) */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Producto (Opcional)
                      </label>
                      <Select
                        value={item.productId}
                        onChange={e => updateItem(index, 'productId', e.target.value)}
                      >
                        <option value="">-- Manual --</option>
                        {products.map(product => (
                          <option key={product.id} value={product.id}>
                            {product.name} - {formatCurrency(product.price)}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {/* Descripción */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Descripción *
                      </label>
                      <Input
                        placeholder="Descripción del producto/servicio"
                        value={item.name}
                        onChange={e => updateItem(index, 'name', e.target.value)}
                        disabled={!!item.productId}
                      />
                    </div>

                    {/* Unidad */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unidad
                      </label>
                      <Select
                        value={item.unit}
                        onChange={e => updateItem(index, 'unit', e.target.value)}
                        disabled={!!item.productId}
                      >
                        {UNITS.map(unit => (
                          <option key={unit.value} value={unit.value}>
                            {unit.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {/* Botón eliminar */}
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="w-full p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={invoiceItems.length === 1}
                        title="Eliminar item"
                      >
                        <Trash2 className="w-4 h-4 mx-auto" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Cantidad */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cantidad *
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="1"
                        value={item.quantity}
                        onChange={e => updateItem(index, 'quantity', e.target.value)}
                      />
                    </div>

                    {/* Precio Unitario */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Precio Unit. *
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={item.unitPrice}
                        onChange={e => updateItem(index, 'unitPrice', e.target.value)}
                        disabled={!!item.productId}
                      />
                    </div>

                    {/* Total */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Subtotal
                      </label>
                      <Input
                        value={formatCurrency(calculateItemTotal(item))}
                        disabled
                        className="bg-gray-100 font-semibold"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-6 border-t pt-6">
              <div className="flex justify-end">
                <div className="w-full md:w-1/2 space-y-2">
                  <div className="flex justify-between text-sm text-gray-700">
                    <span>Subtotal:</span>
                    <span className="font-medium">{formatCurrency(amounts.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-700">
                    <span>IGV (18%):</span>
                    <span className="font-medium">{formatCurrency(amounts.igv)}</span>
                  </div>
                  <div className="flex justify-between text-2xl font-bold text-gray-900 border-t pt-2">
                    <span>Total:</span>
                    <span className="text-primary-600">{formatCurrency(amounts.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/facturas')}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar Factura
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
