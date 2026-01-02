import { useState, useEffect } from 'react'
import { X, Truck, MapPin, User, Package, Calendar, FileText, Building2, Car, CreditCard, Plus, Trash2, Search, Loader2, Save } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/contexts/ToastContext'
import { useAppContext } from '@/hooks/useAppContext'
import { createCarrierDispatchGuide, saveCarrierDispatchGuideDraft, getCompanySettings } from '@/services/firestoreService'
import { consultarRUC, consultarDNI } from '@/services/documentLookupService'

const TRANSFER_REASONS = [
  { value: '01', label: '01 - Venta' },
  { value: '02', label: '02 - Compra' },
  { value: '04', label: '04 - Traslado entre establecimientos' },
  { value: '08', label: '08 - Importación' },
  { value: '09', label: '09 - Exportación' },
  { value: '13', label: '13 - Otros' },
]

const DOCUMENT_TYPES = [
  { value: '1', label: 'DNI' },
  { value: '4', label: 'Carnet de Extranjería' },
  { value: '7', label: 'Pasaporte' },
]

// Obtener fecha local en formato YYYY-MM-DD
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function CreateCarrierDispatchGuideModal({ isOpen, onClose }) {
  const toast = useToast()
  const { getBusinessId } = useAppContext()

  // Datos del transportista (emisor) - se cargan automáticamente
  const [carrierRuc, setCarrierRuc] = useState('')
  const [carrierName, setCarrierName] = useState('')
  const [mtcRegistration, setMtcRegistration] = useState('')

  // GRE Remitente relacionada(s)
  const [relatedGuides, setRelatedGuides] = useState([{ number: '', ruc: '' }])

  // Datos del remitente (quien envía la mercancía)
  const [shipperRuc, setShipperRuc] = useState('')
  const [shipperName, setShipperName] = useState('')

  // Datos del destinatario
  const [recipientDocType, setRecipientDocType] = useState('6')
  const [recipientDocNumber, setRecipientDocNumber] = useState('')
  const [recipientName, setRecipientName] = useState('')

  // Datos básicos del traslado
  const [transferReason, setTransferReason] = useState('01')
  const [transferDate, setTransferDate] = useState('')
  const [totalWeight, setTotalWeight] = useState('')

  // Origen
  const [originAddress, setOriginAddress] = useState('')
  const [originUbigeo, setOriginUbigeo] = useState('')

  // Destino
  const [destinationAddress, setDestinationAddress] = useState('')
  const [destinationUbigeo, setDestinationUbigeo] = useState('')

  // Vehículo
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [vehicleMtcAuth, setVehicleMtcAuth] = useState('')

  // Conductor
  const [driverDocType, setDriverDocType] = useState('1')
  const [driverDocNumber, setDriverDocNumber] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverLastName, setDriverLastName] = useState('')
  const [driverLicense, setDriverLicense] = useState('')

  // Items
  const [items, setItems] = useState([{ description: '', quantity: 1, unit: 'NIU' }])

  const [isSaving, setIsSaving] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isLookingUpShipper, setIsLookingUpShipper] = useState(false)
  const [isLookingUpRecipient, setIsLookingUpRecipient] = useState(false)

  // Cargar datos de la empresa transportista
  useEffect(() => {
    const loadCarrierData = async () => {
      try {
        const businessId = getBusinessId()
        const result = await getCompanySettings(businessId)
        if (result.success && result.data) {
          setCarrierRuc(result.data.ruc || '')
          setCarrierName(result.data.businessName || result.data.name || '')
          setMtcRegistration(result.data.mtcRegistration || '')
        }
      } catch (error) {
        console.error('Error al cargar datos del transportista:', error)
      }
    }
    if (isOpen) {
      loadCarrierData()
      // Establecer fecha de traslado por defecto (mañana)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setTransferDate(getLocalDateString(tomorrow))
    }
  }, [isOpen, getBusinessId])

  // Buscar datos del remitente por RUC
  const handleLookupShipper = async () => {
    if (!shipperRuc || shipperRuc.length !== 11) {
      toast.error('Ingrese un RUC válido de 11 dígitos')
      return
    }

    setIsLookingUpShipper(true)
    try {
      const result = await consultarRUC(shipperRuc)
      if (result.success) {
        setShipperName(result.data.razonSocial || '')
        toast.success('Datos del remitente obtenidos correctamente')
      } else {
        toast.error(result.error || 'No se encontraron datos para este RUC')
      }
    } catch (error) {
      console.error('Error al buscar RUC:', error)
      toast.error('Error al consultar el RUC')
    } finally {
      setIsLookingUpShipper(false)
    }
  }

  // Buscar datos del destinatario por RUC o DNI
  const handleLookupRecipient = async () => {
    if (!recipientDocNumber) {
      toast.error('Ingrese un número de documento')
      return
    }

    setIsLookingUpRecipient(true)
    try {
      let result

      if (recipientDocType === '6') {
        // RUC
        if (recipientDocNumber.length !== 11) {
          toast.error('El RUC debe tener 11 dígitos')
          setIsLookingUpRecipient(false)
          return
        }
        result = await consultarRUC(recipientDocNumber)
        if (result.success) {
          setRecipientName(result.data.razonSocial || '')
          toast.success('Datos del destinatario obtenidos correctamente')
        }
      } else if (recipientDocType === '1') {
        // DNI
        if (recipientDocNumber.length !== 8) {
          toast.error('El DNI debe tener 8 dígitos')
          setIsLookingUpRecipient(false)
          return
        }
        result = await consultarDNI(recipientDocNumber)
        if (result.success) {
          setRecipientName(result.data.nombreCompleto || '')
          toast.success('Datos del destinatario obtenidos correctamente')
        }
      } else {
        toast.info('La búsqueda automática solo está disponible para RUC y DNI')
        setIsLookingUpRecipient(false)
        return
      }

      if (!result.success) {
        toast.error(result.error || 'No se encontraron datos para este documento')
      }
    } catch (error) {
      console.error('Error al buscar documento:', error)
      toast.error('Error al consultar el documento')
    } finally {
      setIsLookingUpRecipient(false)
    }
  }

  // Agregar GRE Remitente relacionada
  const addRelatedGuide = () => {
    setRelatedGuides([...relatedGuides, { number: '', ruc: '' }])
  }

  // Eliminar GRE Remitente relacionada
  const removeRelatedGuide = (index) => {
    if (relatedGuides.length > 1) {
      setRelatedGuides(relatedGuides.filter((_, i) => i !== index))
    }
  }

  // Actualizar GRE Remitente relacionada
  const updateRelatedGuide = (index, field, value) => {
    const updated = [...relatedGuides]
    updated[index][field] = value
    setRelatedGuides(updated)
  }

  // Agregar item
  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unit: 'NIU' }])
  }

  // Eliminar item
  const removeItem = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index))
    }
  }

  // Actualizar item
  const updateItem = (index, field, value) => {
    const updated = [...items]
    updated[index][field] = value
    setItems(updated)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validaciones
    if (!transferDate) {
      toast.error('Debe ingresar la fecha de inicio del traslado')
      return
    }

    if (!shipperRuc || !shipperName) {
      toast.error('Debe completar los datos del remitente')
      return
    }

    if (!recipientDocNumber || !recipientName) {
      toast.error('Debe completar los datos del destinatario')
      return
    }

    if (!originAddress) {
      toast.error('Debe completar la dirección de origen')
      return
    }

    if (!destinationAddress) {
      toast.error('Debe completar la dirección de destino')
      return
    }

    if (!totalWeight || parseFloat(totalWeight) <= 0) {
      toast.error('Debe ingresar el peso total de la mercancía')
      return
    }

    if (!vehiclePlate) {
      toast.error('Debe ingresar la placa del vehículo')
      return
    }

    if (!driverDocNumber || !driverName || !driverLastName || !driverLicense) {
      toast.error('Debe completar todos los datos del conductor')
      return
    }

    const validItems = items.filter(item => item.description.trim())
    if (validItems.length === 0) {
      toast.error('Debe agregar al menos un producto a transportar')
      return
    }

    setIsSaving(true)

    try {
      const businessId = getBusinessId()

      const carrierDispatchGuide = {
        // Tipo de documento: 31 = GRE Transportista
        documentType: '31',

        // GRE Remitente relacionadas
        relatedGuides: relatedGuides.filter(g => g.number.trim()),

        // Datos del remitente
        shipper: {
          ruc: shipperRuc,
          businessName: shipperName,
        },

        // Datos del destinatario
        recipient: {
          documentType: recipientDocType,
          documentNumber: recipientDocNumber,
          name: recipientName,
        },

        // Datos básicos
        transferReason,
        transferDate,
        totalWeight: parseFloat(totalWeight),

        // Origen y destino
        origin: {
          address: originAddress,
          ubigeo: originUbigeo,
        },
        destination: {
          address: destinationAddress,
          ubigeo: destinationUbigeo,
        },

        // Vehículo
        vehicle: {
          plate: vehiclePlate.toUpperCase(),
          mtcAuthorization: vehicleMtcAuth,
        },

        // Conductor
        driver: {
          documentType: driverDocType,
          documentNumber: driverDocNumber,
          name: driverName,
          lastName: driverLastName,
          license: driverLicense,
        },

        // Items
        items: validItems,
      }

      console.log('🚚 Creando guía de remisión transportista:', carrierDispatchGuide)

      const result = await createCarrierDispatchGuide(businessId, carrierDispatchGuide)

      if (result.success) {
        toast.success(`GRE Transportista ${result.number} creada exitosamente`)
        onClose()
      } else {
        throw new Error(result.error || 'Error al crear la guía')
      }

    } catch (error) {
      console.error('Error al crear GRE transportista:', error)
      toast.error(error.message || 'Error al crear la guía de remisión transportista')
    } finally {
      setIsSaving(false)
    }
  }

  // Guardar borrador sin validaciones estrictas
  const handleSaveDraft = async () => {
    setIsSavingDraft(true)
    try {
      const businessId = getBusinessId()

      // Preparar items (sin validación estricta)
      const validItems = items
        .filter(item => item.description?.trim())
        .map(item => ({
          description: item.description.trim(),
          quantity: parseFloat(item.quantity) || 1,
          unit: item.unit || 'NIU',
        }))

      const carrierDispatchGuide = {
        documentType: '31',
        relatedGuides: relatedGuides.filter(g => g.number.trim()),
        shipper: {
          ruc: shipperRuc,
          businessName: shipperName,
        },
        recipient: {
          documentType: recipientDocType,
          documentNumber: recipientDocNumber,
          name: recipientName,
        },
        transferReason,
        transferDate,
        totalWeight: parseFloat(totalWeight) || 0,
        origin: {
          address: originAddress,
          ubigeo: originUbigeo,
        },
        destination: {
          address: destinationAddress,
          ubigeo: destinationUbigeo,
        },
        vehicle: {
          plate: vehiclePlate.toUpperCase(),
          mtcAuthorization: vehicleMtcAuth,
        },
        driver: {
          documentType: driverDocType,
          documentNumber: driverDocNumber,
          name: driverName,
          lastName: driverLastName,
          license: driverLicense,
        },
        items: validItems,
      }

      const result = await saveCarrierDispatchGuideDraft(businessId, carrierDispatchGuide)

      if (result.success) {
        toast.success('Borrador guardado exitosamente')
        onClose()
      } else {
        throw new Error(result.error || 'Error al guardar el borrador')
      }
    } catch (error) {
      console.error('Error al guardar borrador:', error)
      toast.error(error.message || 'Error al guardar el borrador')
    } finally {
      setIsSavingDraft(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="6xl">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Truck className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Nueva GRE Transportista
            </h2>
            <p className="text-sm text-gray-600">
              Serie V001 - Guía de Remisión Electrónica del Transportista
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[calc(90vh-8rem)]">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

          {/* Info Banner */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Truck className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-orange-800">
                <p className="font-medium">Guía de Remisión Transportista (Código 31)</p>
                <p className="mt-1">
                  Emitida por la empresa de transporte para sustentar el servicio de traslado de bienes.
                  Requiere datos del vehículo, conductor y referencia a la GRE del remitente.
                </p>
              </div>
            </div>
          </div>

          {/* Datos del Transportista (Emisor) */}
          <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Building2 className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-orange-900 text-sm">Datos del Transportista (Emisor)</h3>
                <p className="text-xs text-orange-800 mt-1">Datos de tu empresa de transporte</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="RUC del Transportista"
              value={carrierRuc}
              onChange={(e) => setCarrierRuc(e.target.value)}
              disabled
              helperText="Cargado desde configuración"
            />
            <Input
              label="Razón Social"
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              disabled
            />
            <Input
              label="N° Registro MTC"
              placeholder="MTC-12345"
              value={mtcRegistration}
              onChange={(e) => setMtcRegistration(e.target.value)}
              helperText="Requerido si vehículo > 2 TM"
            />
          </div>

          {/* GRE Remitente Relacionada */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-blue-900 text-sm">GRE Remitente Relacionada (Opcional)</h3>
                <p className="text-xs text-blue-800 mt-1">
                  Referencia a la(s) guía(s) de remisión del remitente
                </p>
              </div>
            </div>
          </div>

          {relatedGuides.map((guide, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <Input
                label={index === 0 ? "Número de GRE Remitente" : ""}
                placeholder="T001-00000001"
                value={guide.number}
                onChange={(e) => updateRelatedGuide(index, 'number', e.target.value)}
              />
              <Input
                label={index === 0 ? "RUC del Remitente" : ""}
                placeholder="20123456789"
                value={guide.ruc}
                onChange={(e) => updateRelatedGuide(index, 'ruc', e.target.value)}
                maxLength={11}
              />
              <div className="flex gap-2">
                {relatedGuides.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeRelatedGuide(index)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                {index === relatedGuides.length - 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRelatedGuide}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Agregar
                  </Button>
                )}
              </div>
            </div>
          ))}

          {/* Datos del Remitente */}
          <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Building2 className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-indigo-900 text-sm">Datos del Remitente</h3>
                <p className="text-xs text-indigo-800 mt-1">Empresa o persona que envía la mercancía</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                RUC del Remitente <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="20123456789"
                  value={shipperRuc}
                  onChange={(e) => setShipperRuc(e.target.value.replace(/\D/g, ''))}
                  maxLength={11}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLookupShipper}
                  disabled={isLookingUpShipper || shipperRuc.length !== 11}
                  className="px-3"
                  title="Buscar datos en SUNAT"
                >
                  {isLookingUpShipper ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            <Input
              label="Razón Social del Remitente"
              placeholder="EMPRESA REMITENTE SAC"
              required
              value={shipperName}
              onChange={(e) => setShipperName(e.target.value)}
            />
          </div>

          {/* Datos del Destinatario */}
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <User className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-green-900 text-sm">Datos del Destinatario</h3>
                <p className="text-xs text-green-800 mt-1">Persona o empresa que recibirá la mercancía</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Tipo de Documento"
              required
              value={recipientDocType}
              onChange={(e) => {
                setRecipientDocType(e.target.value)
                setRecipientDocNumber('')
                setRecipientName('')
              }}
            >
              <option value="6">RUC</option>
              <option value="1">DNI</option>
              <option value="4">Carnet de Extranjería</option>
            </Select>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número de Documento <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={recipientDocType === '6' ? '20123456789' : '12345678'}
                  value={recipientDocNumber}
                  onChange={(e) => setRecipientDocNumber(e.target.value.replace(/\D/g, ''))}
                  maxLength={recipientDocType === '6' ? 11 : 15}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLookupRecipient}
                  disabled={
                    isLookingUpRecipient ||
                    (recipientDocType === '6' && recipientDocNumber.length !== 11) ||
                    (recipientDocType === '1' && recipientDocNumber.length !== 8) ||
                    (recipientDocType === '4')
                  }
                  className="px-3"
                  title={recipientDocType === '4' ? 'Búsqueda no disponible para CE' : 'Buscar datos'}
                >
                  {isLookingUpRecipient ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            <Input
              label="Nombre / Razón Social"
              placeholder="Nombre del destinatario"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </div>

          {/* Datos Básicos del Traslado */}
          <div className="bg-gray-50 border-l-4 border-gray-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Calendar className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Datos del Traslado</h3>
                <p className="text-xs text-gray-700 mt-1">Información básica del transporte</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Motivo de Traslado"
              required
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
            >
              {TRANSFER_REASONS.map(reason => (
                <option key={reason.value} value={reason.value}>{reason.label}</option>
              ))}
            </Select>
            <Input
              type="date"
              label="Fecha de Inicio del Traslado"
              required
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              min={getLocalDateString()}
            />
            <Input
              type="number"
              label="Peso Total (kg)"
              placeholder="Ej: 500"
              required
              value={totalWeight}
              onChange={(e) => setTotalWeight(e.target.value)}
              step="0.01"
              min="0.01"
            />
          </div>

          {/* Origen */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <MapPin className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-900 text-sm">Punto de Partida</h3>
                <p className="text-xs text-amber-800 mt-1">Dirección donde se recoge la mercancía</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Dirección de Origen"
              placeholder="Av. Principal 123, Lima"
              required
              value={originAddress}
              onChange={(e) => setOriginAddress(e.target.value)}
            />
            <Input
              label="Ubigeo de Origen"
              placeholder="150101"
              value={originUbigeo}
              onChange={(e) => setOriginUbigeo(e.target.value)}
              maxLength={6}
              helperText="6 dígitos (opcional)"
            />
          </div>

          {/* Destino */}
          <div className="bg-teal-50 border-l-4 border-teal-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <MapPin className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-teal-900 text-sm">Punto de Llegada</h3>
                <p className="text-xs text-teal-800 mt-1">Dirección donde se entrega la mercancía</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Dirección de Destino"
              placeholder="Jr. Comercio 456, Callao"
              required
              value={destinationAddress}
              onChange={(e) => setDestinationAddress(e.target.value)}
            />
            <Input
              label="Ubigeo de Destino"
              placeholder="070101"
              value={destinationUbigeo}
              onChange={(e) => setDestinationUbigeo(e.target.value)}
              maxLength={6}
              helperText="6 dígitos (opcional)"
            />
          </div>

          {/* Vehículo */}
          <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Car className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-purple-900 text-sm">Datos del Vehículo</h3>
                <p className="text-xs text-purple-800 mt-1">Unidad de transporte asignada</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Placa del Vehículo"
              placeholder="ABC-123"
              required
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
            />
            <Input
              label="N° Autorización MTC"
              placeholder="Certificado de Habilitación"
              value={vehicleMtcAuth}
              onChange={(e) => setVehicleMtcAuth(e.target.value)}
              helperText="Tarjeta de Circulación o Habilitación"
            />
          </div>

          {/* Conductor */}
          <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <User className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-rose-900 text-sm">Datos del Conductor</h3>
                <p className="text-xs text-rose-800 mt-1">Conductor principal del vehículo</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Tipo de Documento"
              required
              value={driverDocType}
              onChange={(e) => setDriverDocType(e.target.value)}
            >
              {DOCUMENT_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </Select>
            <Input
              label="Número de Documento"
              placeholder="12345678"
              required
              value={driverDocNumber}
              onChange={(e) => setDriverDocNumber(e.target.value)}
            />
            <Input
              label="Licencia de Conducir"
              placeholder="Q12345678"
              required
              value={driverLicense}
              onChange={(e) => setDriverLicense(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nombres del Conductor"
              placeholder="Juan Carlos"
              required
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
            <Input
              label="Apellidos del Conductor"
              placeholder="Pérez García"
              required
              value={driverLastName}
              onChange={(e) => setDriverLastName(e.target.value)}
            />
          </div>

          {/* Bienes */}
          <div className="bg-cyan-50 border-l-4 border-cyan-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Package className="w-5 h-5 text-cyan-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-cyan-900 text-sm">Bienes a Transportar</h3>
                <p className="text-xs text-cyan-800 mt-1">Detalle de los productos que se transportan</p>
              </div>
            </div>
          </div>

          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-6 md:col-span-7">
                <Input
                  label={index === 0 ? "Descripción" : ""}
                  placeholder="Descripción del producto"
                  required
                  value={item.description}
                  onChange={(e) => updateItem(index, 'description', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Input
                  type="number"
                  label={index === 0 ? "Cantidad" : ""}
                  placeholder="1"
                  required
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                  min="0.01"
                  step="0.01"
                />
              </div>
              <div className="col-span-2">
                <Select
                  label={index === 0 ? "Unidad" : ""}
                  value={item.unit}
                  onChange={(e) => updateItem(index, 'unit', e.target.value)}
                >
                  <option value="NIU">Unidad</option>
                  <option value="KGM">Kilogramo</option>
                  <option value="LTR">Litro</option>
                  <option value="MTR">Metro</option>
                  <option value="BX">Caja</option>
                </Select>
              </div>
              <div className="col-span-2 md:col-span-1 flex gap-1">
                {items.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeItem(index)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                {index === items.length - 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addItem}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}

        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-lg">
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving || isSavingDraft}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isSaving || isSavingDraft}
                className="w-full sm:w-auto"
              >
                {isSavingDraft ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Guardar Borrador
                  </>
                )}
              </Button>
              <Button
                type="submit"
                disabled={isSaving || isSavingDraft}
                className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700"
                size="lg"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Generando GRE...
                  </>
                ) : (
                  <>
                    <Truck className="w-5 h-5 mr-2" />
                    Generar GRE Transportista
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}
