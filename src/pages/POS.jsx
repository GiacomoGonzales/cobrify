import { useState, useEffect, useRef } from 'react'
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  DollarSign,
  Printer,
  User,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ShoppingCart,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Alert from '@/components/ui/Alert'
import Select from '@/components/ui/Select'
import { formatCurrency } from '@/lib/utils'
import { calculateInvoiceAmounts, ID_TYPES } from '@/utils/peruUtils'
import {
  getProducts,
  getCustomers,
  createInvoice,
  updateProduct,
  getNextDocumentNumber,
  getCompanySettings,
} from '@/services/firestoreService'
import { generateInvoicePDF } from '@/utils/pdfGenerator'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import InvoiceTicket from '@/components/InvoiceTicket'

const PAYMENT_METHODS = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  YAPE: 'Yape',
  PLIN: 'Plin',
}

export default function POS() {
  const { user } = useAuth()
  const ticketRef = useRef(null)
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [cart, setCart] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [documentType, setDocumentType] = useState('boleta')
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [message, setMessage] = useState(null)
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState('')
  const [lastInvoiceData, setLastInvoiceData] = useState(null)
  const [isLookingUp, setIsLookingUp] = useState(false)

  // Pagos múltiples - lista simple y vertical
  const [payments, setPayments] = useState([{ method: '', amount: '' }])

  // Datos del cliente para captura inline
  const [customerData, setCustomerData] = useState({
    documentType: ID_TYPES.DNI,
    documentNumber: '',
    name: '',
    businessName: '',
    address: '',
    email: '',
    phone: ''
  })

  // Cargar datos iniciales
  useEffect(() => {
    loadInitialData()
  }, [user])

  const loadInitialData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      // Cargar productos
      const productsResult = await getProducts(user.uid)
      if (productsResult.success) {
        // Mostrar todos los productos (los sin stock se mostrarán deshabilitados)
        setProducts(productsResult.data || [])
      }

      // Cargar clientes
      const customersResult = await getCustomers(user.uid)
      if (customersResult.success) {
        setCustomers(customersResult.data || [])
      }

      // Cargar configuración de empresa
      const settingsResult = await getCompanySettings(user.uid)
      if (settingsResult.success && settingsResult.data) {
        setCompanySettings(settingsResult.data)
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

  const filteredProducts = products.filter(
    p =>
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const addToCart = product => {
    // Verificar stock
    if (product.stock !== null && product.stock <= 0) {
      setMessage({
        type: 'error',
        text: 'Producto sin stock disponible',
      })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    const existingItem = cart.find(item => item.id === product.id)

    if (existingItem) {
      // Verificar si hay suficiente stock
      if (product.stock !== null && existingItem.quantity >= product.stock) {
        setMessage({
          type: 'error',
          text: 'No hay suficiente stock disponible',
        })
        setTimeout(() => setMessage(null), 3000)
        return
      }

      setCart(
        cart.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      )
    } else {
      setCart([...cart, { ...product, quantity: 1 }])
    }
  }

  const updateQuantity = (productId, change) => {
    setCart(
      cart
        .map(item => {
          if (item.id === productId) {
            const newQuantity = item.quantity + change

            // Verificar stock
            if (item.stock !== null && newQuantity > item.stock) {
              setMessage({
                type: 'error',
                text: 'No hay suficiente stock disponible',
              })
              setTimeout(() => setMessage(null), 3000)
              return item
            }

            return { ...item, quantity: newQuantity }
          }
          return item
        })
        .filter(item => item.quantity > 0)
    )
  }

  const removeFromCart = productId => {
    setCart(cart.filter(item => item.id !== productId))
  }

  const clearCart = () => {
    setCart([])
    setSelectedCustomer(null)
    setDocumentType('boleta')
    setCustomerData({
      documentType: ID_TYPES.DNI,
      documentNumber: '',
      name: '',
      businessName: '',
      address: '',
      email: '',
      phone: ''
    })
    setPayments([{ method: '', amount: '' }])
    setMessage(null)
  }

  // Buscar datos de DNI o RUC automáticamente
  const handleLookupDocument = async () => {
    const docNumber = customerData.documentNumber

    if (!docNumber) {
      setMessage({
        type: 'error',
        text: 'Ingrese un número de documento para buscar'
      })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    setIsLookingUp(true)
    setMessage(null)

    try {
      let result

      // Determinar si es DNI o RUC según la longitud
      if (docNumber.length === 8) {
        result = await consultarDNI(docNumber)
      } else if (docNumber.length === 11) {
        result = await consultarRUC(docNumber)
      } else {
        setMessage({
          type: 'error',
          text: 'El documento debe tener 8 dígitos (DNI) o 11 dígitos (RUC)'
        })
        setTimeout(() => setMessage(null), 3000)
        return
      }

      if (result.success) {
        // Autocompletar datos
        if (docNumber.length === 8) {
          // Datos de DNI
          setCustomerData(prev => ({
            ...prev,
            name: result.data.nombreCompleto || '',
          }))
          setMessage({
            type: 'success',
            text: `✓ Datos encontrados: ${result.data.nombreCompleto}`
          })
        } else {
          // Datos de RUC
          setCustomerData(prev => ({
            ...prev,
            businessName: result.data.razonSocial || '',
            name: result.data.nombreComercial || '',
            address: result.data.direccion || '',
          }))
          setMessage({
            type: 'success',
            text: `✓ Datos encontrados: ${result.data.razonSocial}`
          })
        }
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'No se encontraron datos para este documento'
        })
        setTimeout(() => setMessage(null), 5000)
      }
    } catch (error) {
      console.error('Error al buscar documento:', error)
      setMessage({
        type: 'error',
        text: 'Error al consultar el documento. Verifique su conexión.'
      })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setIsLookingUp(false)
    }
  }

  // Actualizar tipo de documento del cliente cuando cambia el tipo de comprobante
  useEffect(() => {
    setCustomerData(prev => ({
      ...prev,
      documentType: documentType === 'factura' ? ID_TYPES.RUC : ID_TYPES.DNI
    }))
  }, [documentType])

  const amounts = calculateInvoiceAmounts(
    cart.map(item => ({
      price: item.price,
      quantity: item.quantity,
    }))
  )

  // Calcular totales de pago
  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const remaining = amounts.total - totalPaid

  // Actualizar método de pago
  const handlePaymentMethodChange = (index, method) => {
    const newPayments = [...payments]
    newPayments[index].method = method

    // Auto-fill amount if it's empty and this is the first or only payment
    if (!newPayments[index].amount && payments.length === 1) {
      newPayments[index].amount = amounts.total.toString()
    } else if (!newPayments[index].amount && payments.length > 1) {
      newPayments[index].amount = remaining.toString()
    }

    setPayments(newPayments)
  }

  // Actualizar monto de pago
  const handlePaymentAmountChange = (index, amount) => {
    const newPayments = [...payments]
    newPayments[index].amount = amount
    setPayments(newPayments)
  }

  // Agregar un nuevo método de pago
  const handleAddPaymentMethod = () => {
    // Si solo hay un método con todo el monto, dividir el total entre los métodos
    if (payments.length === 1 && parseFloat(payments[0].amount) === amounts.total) {
      const halfAmount = (amounts.total / 2).toFixed(2)
      setPayments([
        { ...payments[0], amount: halfAmount },
        { method: '', amount: halfAmount }
      ])
    } else {
      // Agregar un nuevo método con el saldo restante
      setPayments([...payments, { method: '', amount: remaining > 0 ? remaining.toFixed(2) : '' }])
    }
  }

  // Eliminar un método de pago
  const handleRemovePaymentMethod = (index) => {
    if (payments.length > 1) {
      setPayments(payments.filter((_, i) => i !== index))
    }
  }

  const handleOpenPaymentModal = () => {
    // Validaciones
    if (cart.length === 0) {
      setMessage({
        type: 'error',
        text: 'El carrito está vacío',
      })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    // Si es factura, validar datos de RUC
    if (documentType === 'factura') {
      if (!customerData.documentNumber || customerData.documentNumber.length !== 11) {
        setMessage({
          type: 'error',
          text: 'Las facturas requieren un RUC válido (11 dígitos)',
        })
        setTimeout(() => setMessage(null), 3000)
        return
      }
      if (!customerData.businessName) {
        setMessage({
          type: 'error',
          text: 'La razón social es requerida para facturas',
        })
        setTimeout(() => setMessage(null), 3000)
        return
      }
    }

    // Si es boleta, validar datos mínimos (opcional, puede ser cliente general)
    if (documentType === 'boleta' && customerData.documentNumber) {
      if (customerData.documentNumber.length !== 8) {
        setMessage({
          type: 'error',
          text: 'El DNI debe tener 8 dígitos',
        })
        setTimeout(() => setMessage(null), 3000)
        return
      }
    }

    // Resetear pagos al abrir el modal
    setPayments([{ method: '', amount: '' }])
    setShowPaymentModal(true)
  }

  const handleCheckout = async () => {
    if (!user?.uid) return

    // Validar que se haya cubierto el total
    if (totalPaid < amounts.total) {
      setMessage({
        type: 'error',
        text: `Falta pagar ${formatCurrency(remaining)}. Agrega más métodos de pago.`
      })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    // Construir array de pagos - filtrar pagos válidos
    const allPayments = payments
      .filter(p => p.method && parseFloat(p.amount) > 0)
      .map(p => ({
        method: PAYMENT_METHODS[p.method],
        methodKey: p.method,
        amount: parseFloat(p.amount)
      }))

    if (allPayments.length === 0) {
      setMessage({
        type: 'error',
        text: 'Debes seleccionar al menos un método de pago'
      })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    setIsProcessing(true)
    setMessage(null)

    try {
      // 1. Obtener siguiente número de documento
      const numberResult = await getNextDocumentNumber(user.uid, documentType)
      if (!numberResult.success) {
        throw new Error('Error al generar número de comprobante')
      }

      // 2. Preparar items de la factura
      const items = cart.map(item => ({
        productId: item.id,
        code: item.code || '',
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.price * item.quantity,
      }))

      // 3. Crear factura
      const invoiceData = {
        number: numberResult.number,
        series: numberResult.series,
        correlativeNumber: numberResult.correlativeNumber,
        documentType: documentType,
        customer: customerData.documentNumber
          ? {
              documentType: customerData.documentType,
              documentNumber: customerData.documentNumber,
              name: documentType === 'factura'
                ? (customerData.businessName || customerData.name)
                : (customerData.name || 'Cliente'),
              businessName: customerData.businessName || '',
              email: customerData.email || '',
              phone: customerData.phone || '',
              address: customerData.address || '',
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
        // Guardar los métodos de pago
        payments: allPayments,
        // Guardar el primer método como principal para compatibilidad
        paymentMethod: allPayments.length > 0 ? allPayments[0].method : 'Efectivo',
        status: 'paid',
        notes: '',
        // Estado de SUNAT - solo facturas y boletas pueden enviarse a SUNAT
        sunatStatus: (documentType === 'factura' || documentType === 'boleta') ? 'pending' : 'not_applicable',
        sunatResponse: null,
        sunatSentAt: null,
      }

      const result = await createInvoice(user.uid, invoiceData)
      if (!result.success) {
        throw new Error(result.error || 'Error al crear la factura')
      }

      // 4. Actualizar stock de productos
      const stockUpdates = cart
        .filter(item => item.stock !== null) // Solo productos con control de stock
        .map(item => {
          const newStock = item.stock - item.quantity
          return updateProduct(user.uid, item.id, { stock: newStock })
        })

      await Promise.all(stockUpdates)

      // 5. Mostrar éxito
      setLastInvoiceNumber(numberResult.number)
      setLastInvoiceData(invoiceData)
      setShowPaymentModal(false)
      setShowSuccessModal(true)

      // Recargar productos para actualizar stock
      const productsResult = await getProducts(user.uid)
      if (productsResult.success) {
        const availableProducts = (productsResult.data || []).filter(
          p => p.stock === null || p.stock > 0
        )
        setProducts(availableProducts)
      }
    } catch (error) {
      console.error('Error al procesar venta:', error)
      setMessage({
        type: 'error',
        text: error.message || 'Error al procesar la venta. Inténtalo nuevamente.',
      })
      setShowPaymentModal(false)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false)
    clearCart()
  }

  const handlePrintTicket = () => {
    window.print()
  }

  const getStockBadge = product => {
    if (product.stock === null) {
      return <span className="text-xs text-gray-500">Sin control</span>
    }

    if (product.stock === 0) {
      return <span className="text-xs text-red-600 font-semibold">Sin stock</span>
    }

    if (product.stock < 10) {
      return <span className="text-xs text-yellow-600">Stock: {product.stock}</span>
    }

    return <span className="text-xs text-green-600">Stock: {product.stock}</span>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando punto de venta...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] animate-fade-in pb-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Products Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Punto de Venta</h1>
              <p className="text-sm text-gray-600 mt-1">Selecciona productos para la venta</p>
            </div>
            <Button variant="outline" onClick={clearCart} disabled={cart.length === 0}>
              <Trash2 className="w-4 h-4 mr-2" />
              Limpiar
            </Button>
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

          {/* Customer and Document Type Selection */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                {/* Tipo de Comprobante */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Comprobante
                  </label>
                  <Select
                    value={documentType}
                    onChange={e => setDocumentType(e.target.value)}
                  >
                    <option value="boleta">Boleta de Venta</option>
                    <option value="factura">Factura Electrónica</option>
                    <option value="nota_venta">Nota de Venta</option>
                  </Select>
                </div>

                {/* Campos para BOLETA */}
                {documentType === 'boleta' && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          DNI
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={8}
                            value={customerData.documentNumber}
                            onChange={e => setCustomerData({
                              ...customerData,
                              documentNumber: e.target.value.replace(/\D/g, '')
                            })}
                            placeholder="12345678 (opcional)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleLookupDocument}
                            disabled={isLookingUp || !customerData.documentNumber || customerData.documentNumber.length !== 8}
                            className="flex-shrink-0"
                          >
                            {isLookingUp ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nombre
                        </label>
                        <input
                          type="text"
                          value={customerData.name}
                          onChange={e => setCustomerData({
                            ...customerData,
                            name: e.target.value
                          })}
                          placeholder="Nombre del cliente (opcional)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email
                        </label>
                        <input
                          type="email"
                          value={customerData.email}
                          onChange={e => setCustomerData({
                            ...customerData,
                            email: e.target.value
                          })}
                          placeholder="email@ejemplo.com (opcional)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Teléfono
                        </label>
                        <input
                          type="tel"
                          value={customerData.phone}
                          onChange={e => setCustomerData({
                            ...customerData,
                            phone: e.target.value
                          })}
                          placeholder="987654321 (opcional)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Dirección
                      </label>
                      <input
                        type="text"
                        value={customerData.address}
                        onChange={e => setCustomerData({
                          ...customerData,
                          address: e.target.value
                        })}
                        placeholder="Av. Principal 123 (opcional)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </>
                )}

                {/* Campos para FACTURA */}
                {documentType === 'factura' && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          RUC <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={11}
                            value={customerData.documentNumber}
                            onChange={e => setCustomerData({
                              ...customerData,
                              documentNumber: e.target.value.replace(/\D/g, '')
                            })}
                            placeholder="20123456789"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleLookupDocument}
                            disabled={isLookingUp || !customerData.documentNumber || customerData.documentNumber.length !== 11}
                            className="flex-shrink-0"
                          >
                            {isLookingUp ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Razón Social <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={customerData.businessName}
                          onChange={e => setCustomerData({
                            ...customerData,
                            businessName: e.target.value
                          })}
                          placeholder="MI EMPRESA SAC"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre Comercial
                      </label>
                      <input
                        type="text"
                        value={customerData.name}
                        onChange={e => setCustomerData({
                          ...customerData,
                          name: e.target.value
                        })}
                        placeholder="Mi Empresa (opcional)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Dirección
                        </label>
                        <input
                          type="text"
                          value={customerData.address}
                          onChange={e => setCustomerData({
                            ...customerData,
                            address: e.target.value
                          })}
                          placeholder="Av. Principal 123, Lima"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Teléfono
                        </label>
                        <input
                          type="tel"
                          value={customerData.phone}
                          onChange={e => setCustomerData({
                            ...customerData,
                            phone: e.target.value
                          })}
                          placeholder="01-1234567"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={customerData.email}
                        onChange={e => setCustomerData({
                          ...customerData,
                          email: e.target.value
                        })}
                        placeholder="contacto@miempresa.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </>
                )}

                {/* Campos para NOTA DE VENTA */}
                {documentType === 'nota_venta' && (
                  <>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Nota de Venta:</strong> Documento interno para ventas menores. No requiere datos del cliente.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          DNI / RUC
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={11}
                            value={customerData.documentNumber}
                            onChange={e => setCustomerData({
                              ...customerData,
                              documentNumber: e.target.value.replace(/\D/g, '')
                            })}
                            placeholder="12345678 (opcional)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleLookupDocument}
                            disabled={isLookingUp || !customerData.documentNumber || (customerData.documentNumber.length !== 8 && customerData.documentNumber.length !== 11)}
                            className="flex-shrink-0"
                          >
                            {isLookingUp ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nombre / Razón Social
                        </label>
                        <input
                          type="text"
                          value={customerData.name}
                          onChange={e => setCustomerData({
                            ...customerData,
                            name: e.target.value
                          })}
                          placeholder="Cliente (opcional)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar producto por nombre o código..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-base sm:text-lg"
              autoFocus
            />
          </div>

          {/* Products Grid */}
          {filteredProducts.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? 'No se encontraron productos' : 'No hay productos disponibles'}
                </h3>
                <p className="text-gray-600">
                  {searchTerm
                    ? 'Intenta con otros términos de búsqueda'
                    : 'Agrega productos desde el módulo de Productos'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.stock === 0}
                  className={`p-3 sm:p-4 bg-white border-2 rounded-lg transition-all text-left ${
                    product.stock === 0
                      ? 'border-gray-200 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-primary-500 hover:shadow-md'
                  }`}
                >
                  <div className="flex flex-col h-full">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 mb-1 line-clamp-2 text-sm sm:text-base">
                        {product.name}
                      </p>
                      {product.code && (
                        <p className="text-xs text-gray-500 mb-2">{product.code}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-base sm:text-lg font-bold text-primary-600">
                        {formatCurrency(product.price)}
                      </p>
                      {getStockBadge(product)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart Panel */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="flex flex-col h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Carrito
                </CardTitle>
                {cart.length > 0 && (
                  <span className="bg-primary-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {cart.length}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-4 sm:p-6">
              {/* Cart Items */}
              <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar mb-4 max-h-[300px] lg:max-h-[400px]">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
                    <ShoppingCart className="w-12 h-12 mb-2" />
                    <p className="text-sm">No hay productos en el carrito</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-2">
                          <p className="font-medium text-sm text-gray-900 line-clamp-2">
                            {item.name}
                          </p>
                          <p className="text-xs text-gray-500">{formatCurrency(item.price)}</p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-red-600 hover:text-red-800 flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-7 h-7 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center font-semibold text-sm">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-7 h-7 rounded-lg bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="font-bold text-gray-900 text-sm">
                          {formatCurrency(item.price * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(amounts.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">IGV (18%):</span>
                  <span className="font-medium">{formatCurrency(amounts.igv)}</span>
                </div>
                <div className="flex justify-between text-xl sm:text-2xl font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-primary-600">{formatCurrency(amounts.total)}</span>
                </div>
              </div>

              {/* Checkout Button */}
              <Button
                onClick={handleOpenPaymentModal}
                disabled={cart.length === 0 || isProcessing}
                className="w-full mt-4 h-12 sm:h-14 text-base sm:text-lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Procesar Venta
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => !isProcessing && setShowPaymentModal(false)}
        title="Método de Pago"
        size="md"
      >
        <div className="space-y-4">
          {/* Total a pagar */}
          <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-gray-700 font-medium">Total a pagar:</span>
              <span className="text-2xl font-bold text-primary-600">{formatCurrency(amounts.total)}</span>
            </div>
          </div>

          {/* Lista de métodos de pago - vertical y simple */}
          <div className="space-y-3">
            {payments.map((payment, index) => (
              <div key={index} className="flex items-center gap-2">
                {/* Método de pago */}
                <Select
                  value={payment.method}
                  onChange={(e) => handlePaymentMethodChange(index, e.target.value)}
                  className="flex-1"
                >
                  <option value="">Seleccionar método</option>
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="YAPE">Yape</option>
                  <option value="PLIN">Plin</option>
                </Select>

                {/* Monto */}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={payment.amount}
                  onChange={(e) => handlePaymentAmountChange(index, e.target.value)}
                  placeholder="0.00"
                  disabled={!payment.method}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                />

                {/* Botón eliminar */}
                {payments.length > 1 && (
                  <button
                    onClick={() => handleRemovePaymentMethod(index)}
                    className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                    disabled={isProcessing}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))}

            {/* Botón agregar método */}
            <button
              onClick={handleAddPaymentMethod}
              disabled={isProcessing}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-500 hover:text-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span>Agregar otro método</span>
            </button>
          </div>

          {/* Resumen de pagos */}
          {totalPaid > 0 && (
            <div className="p-3 bg-gray-50 rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total pagado:</span>
                <span className="font-semibold text-gray-900">{formatCurrency(totalPaid)}</span>
              </div>
              {remaining !== 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{remaining > 0 ? 'Falta:' : 'Cambio:'}</span>
                  <span className={`font-semibold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(Math.abs(remaining))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Botón confirmar */}
          <Button
            onClick={handleCheckout}
            disabled={totalPaid < amounts.total || isProcessing}
            className="w-full h-12"
            variant="success"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                {totalPaid >= amounts.total ? 'Confirmar Venta' : 'Selecciona método de pago'}
              </>
            )}
          </Button>
        </div>
      </Modal>

      {/* Success Modal */}
      <Modal
        isOpen={showSuccessModal}
        onClose={handleCloseSuccessModal}
        title="¡Venta Exitosa!"
        size="md"
      >
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {documentType === 'factura' ? 'Factura' : documentType === 'nota_venta' ? 'Nota de Venta' : 'Boleta'} generada correctamente
            </h3>
            <p className="text-3xl font-bold text-primary-600 mb-2">{lastInvoiceNumber}</p>
            <p className="text-gray-600">
              Total: <span className="font-bold">{formatCurrency(amounts.total)}</span>
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handlePrintTicket}
                variant="success"
                className="flex-1"
              >
                <Printer className="w-4 h-4 mr-2" />
                Imprimir Ticket
              </Button>
              <Button
                onClick={() => {
                  try {
                    generateInvoicePDF(lastInvoiceData, companySettings)
                  } catch (error) {
                    console.error('Error al generar PDF:', error)
                    alert('Error al generar el PDF')
                  }
                }}
                className="flex-1"
              >
                <Printer className="w-4 h-4 mr-2" />
                Descargar PDF
              </Button>
            </div>
            <Button variant="outline" onClick={handleCloseSuccessModal} className="w-full">
              Nueva Venta
            </Button>
          </div>
        </div>
      </Modal>

      {/* Ticket Oculto para Impresión */}
      {lastInvoiceData && (
        <div className="hidden print:block">
          <InvoiceTicket
            ref={ticketRef}
            invoice={{
              ...lastInvoiceData,
              items: lastInvoiceData.items.map(item => ({
                code: item.code,
                description: item.name,
                quantity: item.quantity,
                price: item.unitPrice,
              })),
              series: lastInvoiceData.series,
              number: lastInvoiceData.correlativeNumber,
              customerDocumentNumber: lastInvoiceData.customer?.documentNumber,
              customerName: lastInvoiceData.customer?.name,
              customerBusinessName: lastInvoiceData.customer?.businessName,
              customerAddress: lastInvoiceData.customer?.address,
              subtotal: lastInvoiceData.subtotal,
              tax: lastInvoiceData.igv,
              total: lastInvoiceData.total,
              createdAt: new Date(),
            }}
            companySettings={companySettings}
          />
        </div>
      )}
    </div>
  )
}
