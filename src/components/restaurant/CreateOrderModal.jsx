import { useState, useEffect } from 'react'
import { X, ShoppingBag, Bike, Smartphone, User, Phone, AlertTriangle, Clock, Tag, MapPin, Wallet, Search, Loader2, CreditCard, UtensilsCrossed } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import { getCustomers } from '@/services/firestoreService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { getVisibleOrderSources } from '@/utils/orderSources'
import { montoDeEnvio } from '@/utils/deliveryFee'

export default function CreateOrderModal({ isOpen, onClose, onConfirm, brands = [] }) {
  const toast = useToast()
  const { getBusinessId, businessSettings } = useAuth()
  // El estado de pago es dato PARA EL REPARTIDOR: le dice si tiene que cobrar
  // al entregar. Solo tiene sentido si ese dato viaja impreso en la comanda, y
  // eso lo decide la misma opción de Configuración. Con la opción apagada el
  // negocio cobra después por el POS (el flujo normal), así que preguntarlo
  // acá era pedir un dato que no se usa en ningún lado.
  const cobroEnComanda = businessSettings?.showCustomerDataOnKitchenTicket === true
  // Las fuentes las decide el negocio en Configuracion > Restaurante. La orden
  // guarda la ETIQUETA, asi que ocultar o borrar una no altera las ya creadas.
  const ORDER_SOURCES = getVisibleOrderSources(
    businessSettings?.hiddenOrderSources,
    businessSettings?.customOrderSources
  )
  const [orderType, setOrderType] = useState('takeaway') // 'takeaway' | 'delivery' | 'counter'
  const [source, setSource] = useState('counter')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('') // dirección de entrega (delivery)
  /**
   * Costo del envío. Se decide acá y viaja con el pedido: al cobrar, el POS lo
   * agrega como una línea más. Así se puede cobrar un envío variable sin
   * abrirle la edición de precios a todos los cajeros —que es justo lo que
   * estos negocios no quieren—.
   */
  const [deliveryFee, setDeliveryFee] = useState('')
  // Documento para el comprobante (opcional). Se arrastra al POS al cobrar, así
  // no se re-teclea. Con lupita RENIEC/SUNAT (mismo servicio que el POS).
  const [documentType, setDocumentType] = useState('DNI') // 'DNI' | 'RUC'
  const [documentNumber, setDocumentNumber] = useState('')
  const [fiscalAddress, setFiscalAddress] = useState('') // dirección fiscal (RUC/SUNAT) para factura
  const [isLookingUp, setIsLookingUp] = useState(false)
  // Clientes ya registrados: buscador para no re-teclear los datos de un cliente
  // frecuente (delivery que siempre pide). Se cargan al abrir el modal.
  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [priority, setPriority] = useState('normal') // 'normal' or 'urgent'
  const [brandId, setBrandId] = useState('') // Brand selection
  // Estado de pago del pedido: false = por cobrar (el repartidor/cajero cobra), true = pagado
  const [paid, setPaid] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('efectivo')

  // El monto que casi siempre cobran, precargado desde Configuración. Se puede
  // pisar en cada pedido: es un punto de partida, no una tarifa fija.
  const envioPorDefecto = montoDeEnvio(businessSettings?.defaultDeliveryFee)
  useEffect(() => {
    if (!isOpen) return
    setDeliveryFee(envioPorDefecto > 0 ? String(envioPorDefecto) : '')
  }, [isOpen, envioPorDefecto])

  // Auto-select brand if there's only one
  useEffect(() => {
    if (brands.length === 1) {
      setBrandId(brands[0].id)
    }
  }, [brands])

  // Cargar clientes al abrir (no al montar) para no pegarle a Firestore de más
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    getCustomers(getBusinessId())
      .then(res => { if (!cancelled && res?.success) setCustomers(res.data || []) })
      .catch(() => { /* si falla, el modal sigue usable escribiendo a mano */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return false
    return (
      c.name?.toLowerCase().includes(q) ||
      c.businessName?.toLowerCase().includes(q) ||
      c.documentNumber?.includes(customerSearch.trim()) ||
      c.phone?.includes(customerSearch.trim())
    )
  })

  // Al elegir un cliente guardado se rellenan todos sus datos. La dirección del
  // cliente sirve para el delivery; si es RUC, además es la dirección fiscal.
  const handleSelectCustomer = (c) => {
    const isRuc = c.documentNumber?.length === 11
    setSelectedCustomerId(c.id)
    setDocumentType(isRuc ? 'RUC' : 'DNI')
    setDocumentNumber(c.documentNumber || '')
    setCustomerName(isRuc ? (c.businessName || c.name || '') : (c.name || c.businessName || ''))
    setCustomerPhone(c.phone || '')
    if (c.address) {
      setCustomerAddress(c.address)
      if (isRuc) setFiscalAddress(c.address)
    }
    setCustomerSearch('')
    setShowCustomerDropdown(false)
    toast.success('Datos del cliente cargados')
  }

  const clearSelectedCustomer = () => {
    setSelectedCustomerId(null)
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setDocumentNumber('')
    setFiscalAddress('')
  }

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
      // Solo los delivery cobran envío. En los otros tipos la casilla ni se
      // muestra, pero igual se limpia por si se cambió de tipo con el monto ya
      // escrito.
      deliveryFee: orderType === 'delivery' ? montoDeEnvio(deliveryFee) : 0,
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
      // Estado de pago: para que la comanda y la nota de envío sepan si hay que
      // cobrar. Sin el cobro en comanda el pedido sale SIEMPRE por cobrar, que
      // es el flujo normal: se cobra después en el POS.
      paid: cobroEnComanda ? paid : false,
      paymentMethod: cobroEnComanda ? paymentMethod : 'efectivo',
    }

    onConfirm(orderData)

    // Reset form
    setOrderType('takeaway')
    setSource('counter')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setDeliveryFee(envioPorDefecto > 0 ? String(envioPorDefecto) : '')
    setDocumentType('DNI')
    setDocumentNumber('')
    setFiscalAddress('')
    setPriority('normal')
    setBrandId(brands.length === 1 ? brands[0].id : '')
    setPaid(false)
    setPaymentMethod('efectivo')
    setSelectedCustomerId(null)
    setCustomerSearch('')
  }

  const handleClose = () => {
    setOrderType('takeaway')
    setSource('counter')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setDeliveryFee(envioPorDefecto > 0 ? String(envioPorDefecto) : '')
    setDocumentType('DNI')
    setDocumentNumber('')
    setFiscalAddress('')
    setPriority('normal')
    setBrandId(brands.length === 1 ? brands[0].id : '')
    setPaid(false)
    setPaymentMethod('efectivo')
    setSelectedCustomerId(null)
    setCustomerSearch('')
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
          {/*
            Los tres en una sola fila, del mismo tamaño.
            Antes eran dos arriba y el tercero cruzado a lo ancho: comían media
            pantalla del modal y daban a entender que "En Local" era otra cosa,
            de otra jerarquía. Son tres opciones equivalentes.
            La aclaración de cada una aparece desde tablet; en el celular no
            entra y el nombre alcanza.
          */}
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                valor: 'takeaway',
                Icono: ShoppingBag,
                titulo: 'Para Llevar',
                detalle: 'Recoge en el local',
                borde: 'border-green-500 bg-green-50',
                icono: 'text-green-600',
                texto: 'text-green-700',
              },
              {
                valor: 'delivery',
                Icono: Bike,
                titulo: 'Delivery',
                detalle: 'Entrega a domicilio',
                borde: 'border-blue-500 bg-blue-50',
                icono: 'text-blue-600',
                texto: 'text-blue-700',
              },
              {
                // Come ahí pero SIN mesa (patio de comidas, barra de mostrador).
                // No es Para Llevar: no lleva táper ni envío.
                valor: 'counter',
                Icono: UtensilsCrossed,
                titulo: 'En Local',
                detalle: 'Sin mesa (mostrador)',
                borde: 'border-amber-500 bg-amber-50',
                icono: 'text-amber-600',
                texto: 'text-amber-700',
              },
            ].map(({ valor, Icono, titulo, detalle, borde, icono, texto }) => {
              const activo = orderType === valor
              return (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setOrderType(valor)}
                  className={`px-2 py-3 rounded-lg border-2 text-center transition-all ${
                    activo ? borde : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icono className={`w-5 h-5 mx-auto mb-1.5 ${activo ? icono : 'text-gray-400'}`} />
                  <p className={`text-xs sm:text-sm font-semibold leading-tight ${activo ? texto : 'text-gray-700'}`}>
                    {titulo}
                  </p>
                  <p className="hidden sm:block text-[11px] text-gray-500 mt-0.5 leading-tight">
                    {detalle}
                  </p>
                </button>
              )
            })}
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

          {/* Buscar un cliente ya registrado y traer sus datos */}
          <div className="relative">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <User className="w-4 h-4 text-gray-400" />
              Buscar cliente registrado
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={customerSearch}
                onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true) }}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                placeholder="Nombre, documento o teléfono"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
            {showCustomerDropdown && customerSearch.trim() && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-gray-500">Sin resultados. Puedes escribir los datos abajo.</p>
                ) : (
                  filteredCustomers.slice(0, 6).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectCustomer(c)}
                      className="w-full text-left px-3 py-2 hover:bg-primary-50 border-b border-gray-100 last:border-b-0"
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.businessName || c.name || 'Sin nombre'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {c.documentNumber || 'Sin documento'}
                        {c.phone ? ` • ${c.phone}` : ''}
                        {c.address ? ` • ${c.address}` : ''}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedCustomerId && (
              <div className="mt-1.5 flex items-center justify-between gap-2 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span className="text-green-800 truncate">Cliente cargado: <span className="font-medium">{customerName}</span></span>
                <button type="button" onClick={clearSelectedCustomer} className="text-green-700 hover:underline shrink-0">
                  Quitar
                </button>
              </div>
            )}
          </div>

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

          {/* Costo del envío (solo delivery) */}
          {orderType === 'delivery' && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                <Bike className="w-4 h-4 text-gray-400" />
                Costo del envío
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">S/</span>
                <input
                  type="number"
                  min="0"
                  step="0.10"
                  inputMode="decimal"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Se agrega solo al cobrar, como una línea más. Déjalo en blanco si no cobras envío.
              </p>
            </div>
          )}
        </div>

        {/* Pago: solo cuando la comanda lleva el cobro impreso (ver arriba) */}
        {cobroEnComanda && (
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
                {orderType === 'delivery' ? 'El repartidor cobra al entregar' : orderType === 'counter' ? 'Cobrar en el mostrador' : 'Cobrar al recoger'}
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
        )}

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
              {orderType === 'takeaway' ? 'Para Llevar' : orderType === 'counter' ? 'En Local' : 'Delivery'}
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
            {cobroEnComanda && (
              <li>
                • <span className="font-medium">Pago:</span>{' '}
                <span className={paid ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'}>
                  {paid ? 'Pagado' : 'Por cobrar'}
                </span>
                {' '}({paymentMethod})
              </li>
            )}
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
