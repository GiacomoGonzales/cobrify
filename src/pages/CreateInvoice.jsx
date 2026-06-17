import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, Save, Eye, Loader2, ArrowLeft, DollarSign, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import { invoiceSchema } from '@/utils/schemas'
import { calculateMixedInvoiceAmounts, ID_TYPES } from '@/utils/peruUtils'
import { formatCurrency } from '@/lib/utils'
import {
  isMultiCurrencyEnabled,
  getDefaultCurrency,
  convertToBase,
  convertFromBase,
  normalizeCurrency,
  SUPPORTED_CURRENCIES,
  BASE_CURRENCY,
} from '@/utils/currency'
import { getRateForDate } from '@/services/exchangeRateService'
import {
  getCustomers,
  getProducts,
  createInvoiceWithNumber,
  updateProduct,
} from '@/services/firestoreService'

// Unidades de medida SUNAT (Catálogo N° 03 - UN/ECE Rec 20)
const UNITS = [
  { value: 'NIU', label: 'Unidad' },
  { value: 'ZZ', label: 'Servicio' },
  { value: 'KGM', label: 'Kilogramo' },
  { value: 'GRM', label: 'Gramo' },
  { value: 'LTR', label: 'Litro' },
  { value: 'MTR', label: 'Metro' },
  { value: 'MTK', label: 'Metro cuadrado' },
  { value: 'MTQ', label: 'Metro cúbico' },
  { value: 'BX', label: 'Caja' },
  { value: 'DISPLAY', label: 'Display' },
  { value: 'PK', label: 'Paquete' },
  { value: 'SET', label: 'Juego' },
  { value: 'HUR', label: 'Hora' },
  { value: 'DZN', label: 'Docena' },
  { value: 'PR', label: 'Par' },
  { value: 'MIL', label: 'Millar' },
  { value: 'TNE', label: 'Tonelada' },
  { value: 'BJ', label: 'Balde' },
  { value: 'BLL', label: 'Barril' },
  { value: 'BG', label: 'Bolsa' },
  { value: 'BO', label: 'Botella' },
  { value: 'CT', label: 'Cartón' },
  { value: 'CMK', label: 'Centímetro cuadrado' },
  { value: 'CMQ', label: 'Centímetro cúbico' },
  { value: 'CMT', label: 'Centímetro' },
  { value: 'CEN', label: 'Ciento de unidades' },
  { value: 'CY', label: 'Cilindro' },
  { value: 'BE', label: 'Fardo' },
  { value: 'GLL', label: 'Galón' },
  { value: 'GLI', label: 'Galón inglés' },
  { value: 'LEF', label: 'Hoja' },
  { value: 'KTM', label: 'Kilómetro' },
  { value: 'KWH', label: 'Kilovatio hora' },
  { value: 'KT', label: 'Kit' },
  { value: 'CA', label: 'Lata' },
  { value: 'LBR', label: 'Libra' },
  { value: 'MWH', label: 'Megavatio hora' },
  { value: 'MGM', label: 'Miligramo' },
  { value: 'MLT', label: 'Mililitro' },
  { value: 'MMT', label: 'Milímetro' },
  { value: 'MMK', label: 'Milímetro cuadrado' },
  { value: 'MMQ', label: 'Milímetro cúbico' },
  { value: 'UM', label: 'Millón de unidades' },
  { value: 'ONZ', label: 'Onza' },
  { value: 'PF', label: 'Paleta' },
  { value: 'FOT', label: 'Pie' },
  { value: 'FTK', label: 'Pie cuadrado' },
  { value: 'FTQ', label: 'Pie cúbico' },
  { value: 'C62', label: 'Pieza' },
  { value: 'PG', label: 'Placa' },
  { value: 'ST', label: 'Pliego' },
  { value: 'INH', label: 'Pulgada' },
  { value: 'TU', label: 'Tubo' },
  { value: 'YRD', label: 'Yarda' },
  { value: 'QD', label: 'Cuarto de docena' },
  { value: 'HD', label: 'Media docena' },
  { value: 'JG', label: 'Jarra' },
  { value: 'JR', label: 'Frasco' },
  { value: 'CH', label: 'Envase' },
  { value: 'AV', label: 'Cápsula' },
  { value: 'SA', label: 'Saco' },
  { value: 'BT', label: 'Tornillo' },
  { value: 'U2', label: 'Tableta/Blister' },
  { value: 'DZP', label: 'Docena de paquetes' },
  { value: 'HT', label: 'Media hora' },
  { value: 'RL', label: 'Carrete' },
  { value: 'SEC', label: 'Segundo' },
  { value: 'RD', label: 'Varilla' },
]

export default function CreateInvoice() {
  const { user } = useAuth()
  const { businessSettings } = useAppContext()
  const toast = useToast()
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

  // Multi-divisa (USD) — solo se renderiza UI si el negocio activó la flag
  // en Configuración → Ventas. Por default todo en PEN.
  const multiCurrencyOn = useMemo(
    () => isMultiCurrencyEnabled(businessSettings),
    [businessSettings]
  )
  const initialCurrency = useMemo(
    () => (multiCurrencyOn ? getDefaultCurrency(businessSettings) : BASE_CURRENCY),
    [multiCurrencyOn, businessSettings]
  )
  const [currency, setCurrency] = useState(initialCurrency)
  const [exchangeRate, setExchangeRate] = useState(1)
  const [exchangeRateSource, setExchangeRateSource] = useState(null) // 'sbs'|'cache'|'manual'
  const [loadingRate, setLoadingRate] = useState(false)

  useEffect(() => {
    loadData()
  }, [user])

  // Trae el TC del día desde SBS (vía Cloud Function). Si el usuario ya
  // editó el TC a mano, no lo sobrescribe.
  const fetchExchangeRate = async (forceForToday = false) => {
    if (loadingRate) return
    setLoadingRate(true)
    try {
      const result = await getRateForDate(forceForToday ? new Date() : new Date())
      if (result && Number.isFinite(result.sell) && result.sell > 0) {
        setExchangeRate(Number(result.sell.toFixed(4)))
        setExchangeRateSource(result.source)
        if (result.source === 'sbs') {
          toast.success(`Tipo de cambio del día: S/ ${result.sell.toFixed(4)} (SBS)`)
        }
      } else {
        setExchangeRateSource(null)
        toast.error('No se pudo obtener el TC SBS. Ingresa el valor manualmente.')
      }
    } catch (err) {
      console.error('Error obteniendo TC:', err)
      toast.error('No se pudo obtener el TC. Ingresa el valor manualmente.')
    } finally {
      setLoadingRate(false)
    }
  }

  // Al cambiar a USD, si todavía no hay TC válido (=1), traemos uno.
  useEffect(() => {
    if (currency === 'USD' && exchangeRate <= 1) {
      fetchExchangeRate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency])

  // SUNAT: las BOLETAS DE VENTA no admiten USD por norma. Si el usuario
  // selecciona boleta con USD activo, forzamos a PEN con aviso.
  useEffect(() => {
    if (documentType === 'boleta' && currency === 'USD') {
      setCurrency('PEN')
      setExchangeRate(1)
      setExchangeRateSource(null)
      toast.info('Las boletas siempre se emiten en Soles (SUNAT).')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentType])

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
        // Multi-divisa: el precio del producto está en PEN (moneda base).
        // Si la factura es USD, convertimos al momento de cargar el item
        // usando el TC actual. El usuario puede editar el precio luego.
        const priceInBase = product.hasVariants ? (product.basePrice || 0) : (product.price || 0)
        newItems[index].unitPrice = currency === 'USD' && exchangeRate > 0
          ? Number(convertFromBase(priceInBase, 'USD', exchangeRate).toFixed(2))
          : priceInBase
        newItems[index].unit = product.unit || 'UNIDAD'
        newItems[index].taxAffectation = product.taxAffectation || '10'
      }
    }

    setInvoiceItems(newItems)
  }

  const calculateItemTotal = item => {
    return (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }

  const amounts = calculateMixedInvoiceAmounts(
    invoiceItems.map(item => ({
      price: parseFloat(item.unitPrice) || 0,
      quantity: parseFloat(item.quantity) || 0,
      taxAffectation: item.taxAffectation || '10',
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
      // 1. Preparar items de la factura
      const items = invoiceItems.map(item => ({
        productId: item.productId || '',
        code: products.find(p => p.id === item.productId)?.code || '',
        name: item.name,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        unit: item.unit,
        subtotal: calculateItemTotal(item),
        taxAffectation: item.taxAffectation || '10',
      }))

      // 2. Preparar datos de la factura (SIN número - se genera atómicamente)
      const invoiceData = {
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
              studentName: selectedCustomer.studentName || '',
              studentSchedule: selectedCustomer.studentSchedule || '',
            }
          : {
              documentType: ID_TYPES.DNI,
              documentNumber: '00000000',
              name: 'Cliente General',
              businessName: '',
              email: '',
              phone: '',
              address: '',
              studentName: '',
              studentSchedule: '',
            },
        items: items,
        subtotal: amounts.subtotal,
        igv: amounts.igv,
        total: amounts.total,
        // Multi-divisa: moneda y TC CONGELADO. PEN=1, USD=el TC del día al
        // momento de emitir. *InBase pre-calculados para reportes globales.
        currency: normalizeCurrency(currency),
        exchangeRate: currency === 'USD' ? (Number(exchangeRate) || 1) : 1,
        subtotalInBase: convertToBase(amounts.subtotal, currency, exchangeRate),
        igvInBase: convertToBase(amounts.igv, currency, exchangeRate),
        totalInBase: convertToBase(amounts.total, currency, exchangeRate),
        paymentMethod: 'Manual',
        status: 'pending',
        notes: '',
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Usuario',
        createdByEmail: user.email || '',
      }

      // 3. Crear factura con número atómico (garantiza que no se pierdan números)
      const result = await createInvoiceWithNumber(user.uid, invoiceData, documentType)
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
        text: `✓ ${documentType === 'factura' ? 'Factura' : 'Boleta'} ${result.number} creada exitosamente`,
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

            {/* === Multi-divisa: solo si el negocio activó la flag ====== */}
            {multiCurrencyOn && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <label className="text-sm font-medium text-gray-700">
                    Moneda
                  </label>
                  {documentType === 'boleta' && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                      Boleta → solo PEN
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {SUPPORTED_CURRENCIES.map((ccy) => {
                    const disabled = documentType === 'boleta' && ccy === 'USD'
                    const active = currency === ccy
                    return (
                      <button
                        key={ccy}
                        type="button"
                        disabled={disabled}
                        onClick={() => setCurrency(ccy)}
                        className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                          active
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {ccy === 'PEN' ? 'S/  Soles' : '$  Dólares'}
                      </button>
                    )
                  })}
                </div>

                {currency === 'USD' && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-700">
                        Tipo de cambio (PEN por USD)
                      </label>
                      {exchangeRateSource === 'sbs' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 font-medium">SBS</span>
                      )}
                      {exchangeRateSource === 'cache' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 font-medium">Cache</span>
                      )}
                      {exchangeRateSource === 'manual' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">Manual</span>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={exchangeRate}
                        onChange={(e) => {
                          setExchangeRate(parseFloat(e.target.value) || 0)
                          setExchangeRateSource('manual')
                        }}
                        className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => fetchExchangeRate(true)}
                        disabled={loadingRate}
                        className="h-9 px-3 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
                        title="Obtener TC del día desde SBS"
                      >
                        {loadingRate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        SBS
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      El TC se congela al guardar. Los reportes en PEN
                      usarán este TC para esta factura, sin recalcular.
                    </p>
                  </div>
                )}
              </div>
            )}
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
                        {products.map(product => {
                          // El precio del producto vive en PEN; lo mostramos en
                          // el dropdown en la moneda actual de la factura para
                          // que el usuario vea cómo quedará al cargar el item.
                          const priceInBase = product.hasVariants ? (product.basePrice || 0) : (product.price || 0)
                          const displayPrice = currency === 'USD' && exchangeRate > 0
                            ? convertFromBase(priceInBase, 'USD', exchangeRate)
                            : priceInBase
                          return (
                            <option key={product.id} value={product.id}>
                              {product.name} - {formatCurrency(displayPrice, currency)}
                            </option>
                          )
                        })}
                      </Select>
                    </div>

                    {/* Descripción */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Descripción *
                        <span className="text-xs font-normal text-gray-500 ml-1">(puedes presionar ENTER para saltar de línea)</span>
                      </label>
                      <textarea
                        placeholder="Descripción del producto/servicio"
                        value={item.name}
                        onChange={e => updateItem(index, 'name', e.target.value)}
                        disabled={!!item.productId}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-500 resize-y"
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
                        value={formatCurrency(calculateItemTotal(item), currency)}
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
                    <span className="font-medium">{formatCurrency(amounts.subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-700">
                    <span>IGV (18%):</span>
                    <span className="font-medium">{formatCurrency(amounts.igv, currency)}</span>
                  </div>
                  <div className="flex justify-between text-2xl font-bold text-gray-900 border-t pt-2">
                    <span>Total:</span>
                    <span className="text-primary-600">{formatCurrency(amounts.total, currency)}</span>
                  </div>
                  {currency === 'USD' && exchangeRate > 0 && (
                    <div className="text-right text-xs text-gray-500 pt-1">
                      ≈ {formatCurrency(convertToBase(amounts.total, 'USD', exchangeRate), 'PEN')} (TC {exchangeRate})
                    </div>
                  )}
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
