import { useState, useEffect } from 'react'
import { X, ShoppingBag, Bike, Smartphone, User, Phone, AlertTriangle, Clock, Tag, MapPin, Wallet, Search, Loader2, CreditCard } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { useToast } from '@/contexts/ToastContext'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'

const ORDER_SOURCES = [
  { value: 'counter', label: 'Mostrador' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'rappi', label: 'Rappi' },
  { value: 'pedidosya', label: 'PedidosYa' },
  { value: 'uber_eats', label: 'Uber Eats' },
  { value: 'glovo', label: 'Glovo' },
  { value: 'web', label: 'Página Web' },
  { value: 'other', label: 'Otro' },
]

export default function CreateOrderModal({ isOpen, onClose, onConfirm, brands = [] }) {
  const toast = useToast()
  const [orderType, setOrderType] = useState('takeaway') // 'takeaway' or 'delivery'
  const [source, setSource] = useState('counter')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('') // dirección de entrega (delivery)
  // Documento para el comprobante (opcional). Se arrastra al POS al cobrar, así
  // no se re-teclea. Con lupita RENIEC/SUNAT (mismo servicio que el POS).
  const [documentType, setDocumentType] = useState('DNI') // 'DNI' | 'RUC'
  const [documentNumber, setDocumentNumber] = useState('')
  const [fiscalAddress, setFiscalAddress] = useState('') // dirección fiscal (RUC/SUNAT) para factura
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [priority, setPriority] = useState('normal') // 'normal' or 'urgent'
  const [brandId, setBrandId] = useState('') // Brand selection
  // Estado de pago del pedido: false = por cobrar (el repartidor/cajero cobra), true = pagado
  const [paid, setPaid] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('efectivo')

  // Auto-select brand if there's only one
  useEffect(() => {
    if (brands.length === 1) {
      setBrandId(brands[0].id)
    }
  }, [brands])

  // Lupita RENIEC/SUNAT: autocompleta nombre/razón social (y dirección fiscal en RUC).
  const handleLookupDocument = async () => {
    const doc = documentNumber.trim()
    if (documentType === 'DNI' && doc.length !== 8) { toast.error('El DNI debe tener 8 dígitos'); return }
    if (documentType === 'RUC' && doc.length !== 11) { toast.error('El RUC debe tener 11 dígitos'); return }
    setIsLookingUp(true)
    try {
      if (documentType === 'DNI') {
        const res = await consultarDNI(doc)
        if (res.success) {
          setCustomerName(res.data.nombreCompleto || customerName)
          toast.success('Datos encontrados en RENIEC')
        } else {
          toast.error(res.error || 'No se encontró el DNI')
        }
      } else {
        const res = await consultarRUC(doc)
        if (res.success) {
          setCustomerName(res.data.razonSocial || customerName)
          if (res.data.direccion) setFiscalAddress(res.data.direccion)
          toast.success('Datos encontrados en SUNAT')
        } else {
          toast.error(res.error || 'No se encontró el RUC')
        }
      }
    } catch (e) {
      console.error('Error consultando documento:', e)
      toast.error('Error al consultar el documento')
    } finally {
      setIsLookingUp(false)
    }
  }

  const handleConfirm = () => {
    const selectedBrand = brands.find(b => b.id === brandId)
    const docNum = documentNumber.trim()
    const orderData = {
      orderType,
      source: ORDER_SOURCES.find(s => s.value === source)?.label || source,
      customerName: customerName.trim() || null,
      customerPhone: customerPhone.trim() || null,
      // La dirección solo aplica a delivery
      customerAddress: orderType === 'delivery' ? (customerAddress.trim() || null) : null,
      // Documento para el comprobante (se arrastra al POS). businessName = razón
      // social cuando es RUC; fiscalAddress = dirección SUNAT (para factura).
      documentType,
      documentNumber: docNum || null,
      businessName: (documentType === 'RUC' && docNum) ? (customerName.trim() || null) : null,
      fiscalAddress: (documentType === 'RUC' && docNum) ? (fiscalAddress.trim() || null) : null,
      priority,
      brandId: brandId || null,
      brandName: selectedBrand?.name || null,
      brandColor: selectedBrand?.color || null,
      // Estado de pago: para que la comanda y la nota de envío sepan si hay que cobrar
      paid,
      paymentMethod,
    }

    onConfirm(orderData)

    // Reset form
    setOrderType('takeaway')
    setSource('counter')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setDocumentType('DNI')
    setDocumentNumber('')
    setFiscalAddress('')
    setPriority('normal')
    setBrandId(brands.length === 1 ? brands[0].id : '')
    setPaid(false)
    setPaymentMethod('efectivo')
  }

  const handleClose = () => {
    setOrderType('takeaway')
    setSource('counter')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setDocumentType('DNI')
    setDocumentNumber('')
    setFiscalAddress('')
    setPriority('normal')
    setBrandId(brands.length === 1 ? brands[0].id : '')
    setPaid(false)
    setPaymentMethod('efectivo')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} maxWidth="lg">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Nueva Orden</h2>
          <p className="text-sm text-gray-600 mt-1">Configura los detalles de la orden</p>
        </div>
        <button
          onClick={handleClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Tipo de Orden */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Tipo de Orden
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setOrderType('takeaway')}
              className={`p-4 rounded-xl border-2 transition-all ${
                orderType === 'takeaway'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <ShoppingBag className={`w-8 h-8 mx-auto mb-2 ${
                orderType === 'takeaway' ? 'text-green-600' : 'text-gray-400'
              }`} />
              <p className={`font-semibold ${
                orderType === 'takeaway' ? 'text-green-700' : 'text-gray-700'
              }`}>
                Para Llevar
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Cliente recoge en el local
              </p>
            </button>

            <button
              onClick={() => setOrderType('delivery')}
              className={`p-4 rounded-xl border-2 transition-all ${
                orderType === 'delivery'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Bike className={`w-8 h-8 mx-auto mb-2 ${
                orderType === 'delivery' ? 'text-blue-600' : 'text-gray-400'
              }`} />
              <p className={`font-semibold ${
                orderType === 'delivery' ? 'text-blue-700' : 'text-gray-700'
              }`}>
                Delivery
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Entrega a domicilio
              </p>
            </button>
          </div>
        </div>

        {/* Fuente del Pedido */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Fuente del Pedido
            </div>
          </label>
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full"
          >
            {ORDER_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Esta información se usará para reportes
          </p>
        </div>

        {/* Selector de Marca (solo si hay marcas configuradas) */}
        {brands.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Marca
              </div>
            </label>
            {brands.length === 1 ? (
              <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: brands[0].color || '#8B5CF6' }}
                />
                <span className="font-medium text-purple-900">{brands[0].name}</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {brands.map((brand) => (
                  <button
                    key={brand.id}
                    type="button"
                    onClick={() => setBrandId(brand.id)}
                    className={`p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${
                      brandId === brand.id
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: brand.color || '#8B5CF6' }}
                    />
                    <span className={`text-sm font-medium ${
                      brandId === brand.id ? 'text-purple-900' : 'text-gray-700'
                    }`}>
                      {brand.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Datos del Cliente (Opcional) */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            Datos del cliente <span className="font-normal text-gray-400">(opcional)</span>
          </h3>

          {/* Documento (para el comprobante) + lupita RENIEC/SUNAT */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <CreditCard className="w-4 h-4 text-gray-400" />
              Documento (para el comprobante)
            </label>
            <div className="flex items-stretch gap-2">
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-24 shrink-0 px-3 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              >
                <option value="DNI">DNI</option>
                <option value="RUC">RUC</option>
              </select>
              <input
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLookupDocument() } }}
                placeholder={documentType === 'RUC' ? '11 dígitos' : '8 dígitos'}
                inputMode="numeric"
                maxLength={documentType === 'RUC' ? 11 : 8}
                className="flex-1 min-w-0 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
              <button
                type="button"
                onClick={handleLookupDocument}
                disabled={isLookingUp || (documentType === 'DNI' ? documentNumber.trim().length !== 8 : documentNumber.trim().length !== 11)}
                title="Buscar en RENIEC/SUNAT"
                className="shrink-0 w-11 flex items-center justify-center bg-white border border-gray-300 rounded-lg text-gray-500 hover:bg-primary-50 hover:text-primary-600 hover:border-primary-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-500 disabled:hover:border-gray-300 transition-colors"
              >
                {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">Opcional. Se usará al emitir el comprobante; la lupita autocompleta el nombre.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {documentType === 'RUC' ? 'Razón social' : 'Nombre'}
            </label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={documentType === 'RUC' ? 'Ej: Comercial Los Andes S.A.C.' : 'Ej: Juan Pérez'}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <Phone className="w-4 h-4 text-gray-400" />
              Teléfono
            </label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Ej: 987 654 321"
              type="tel"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
          </div>

          {/* Dirección de entrega (solo delivery) */}
          {orderType === 'delivery' && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                <MapPin className="w-4 h-4 text-gray-400" />
                Dirección de entrega
              </label>
              <input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Ej: Av. Las Viñas 123, Ref. frente al parque"
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Pago: para que la comanda diga si el repartidor debe cobrar o ya está pagado */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Estado de pago
            </div>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaid(false)}
              className={`p-4 rounded-xl border-2 transition-all ${
                !paid ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className={`font-semibold ${!paid ? 'text-amber-700' : 'text-gray-700'}`}>
                Por cobrar
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {orderType === 'delivery' ? 'El repartidor cobra al entregar' : 'Cobrar al recoger'}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setPaid(true)}
              className={`p-4 rounded-xl border-2 transition-all ${
                paid ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className={`font-semibold ${paid ? 'text-green-700' : 'text-gray-700'}`}>
                Pagado
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Ya pagó (no cobrar)
              </p>
            </button>
          </div>

          {/* Método de pago */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Método de pago
            </label>
            <Select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full"
            >
              <option value="efectivo">Efectivo</option>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </Select>
          </div>
        </div>

        {/* Prioridad */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Prioridad
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPriority('normal')}
              className={`p-3 rounded-lg border-2 transition-all ${
                priority === 'normal'
                  ? 'border-gray-500 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Clock className={`w-6 h-6 mx-auto mb-1 ${
                priority === 'normal' ? 'text-gray-600' : 'text-gray-400'
              }`} />
              <p className={`font-semibold text-sm ${
                priority === 'normal' ? 'text-gray-700' : 'text-gray-600'
              }`}>
                Normal
              </p>
            </button>

            <button
              onClick={() => setPriority('urgent')}
              className={`p-3 rounded-lg border-2 transition-all ${
                priority === 'urgent'
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <AlertTriangle className={`w-6 h-6 mx-auto mb-1 ${
                priority === 'urgent' ? 'text-red-600' : 'text-gray-400'
              }`} />
              <p className={`font-semibold text-sm ${
                priority === 'urgent' ? 'text-red-700' : 'text-gray-600'
              }`}>
                Urgente
              </p>
            </button>
          </div>
        </div>

        {/* Resumen */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
          <h4 className="font-semibold text-primary-900 mb-2">Resumen</h4>
          <ul className="text-sm text-primary-800 space-y-1">
            <li>
              • <span className="font-medium">Tipo:</span>{' '}
              {orderType === 'takeaway' ? 'Para Llevar' : 'Delivery'}
            </li>
            <li>
              • <span className="font-medium">Fuente:</span>{' '}
              {ORDER_SOURCES.find(s => s.value === source)?.label}
            </li>
            <li>
              • <span className="font-medium">Prioridad:</span>{' '}
              <span className={priority === 'urgent' ? 'text-red-600 font-semibold' : ''}>
                {priority === 'urgent' ? '🔴 Urgente' : 'Normal'}
              </span>
            </li>
            <li>
              • <span className="font-medium">Pago:</span>{' '}
              <span className={paid ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'}>
                {paid ? 'Pagado' : 'Por cobrar'}
              </span>
              {' '}({paymentMethod})
            </li>
            {brandId && brands.find(b => b.id === brandId) && (
              <li className="flex items-center gap-1">
                • <span className="font-medium">Marca:</span>{' '}
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-medium"
                  style={{ backgroundColor: brands.find(b => b.id === brandId)?.color || '#8B5CF6' }}
                >
                  {brands.find(b => b.id === brandId)?.name}
                </span>
              </li>
            )}
            {customerName && (
              <li>
                • <span className="font-medium">Cliente:</span> {customerName}
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1"
          >
            Continuar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
