import { useState, useEffect } from 'react'
import { X, Truck, MapPin, User, Package, Calendar, FileText, Building2, Car, Plus, Trash2, Search, Loader2, Save, Info } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/contexts/ToastContext'
import { useAppContext } from '@/hooks/useAppContext'
import { createCarrierDispatchGuide, saveCarrierDispatchGuideDraft, getCompanySettings } from '@/services/firestoreService'
import { consultarRUC, consultarDNI } from '@/services/documentLookupService'
import { DEPARTAMENTOS, getProvincias, getDistritos, buildUbigeo } from '@/data/peruUbigeos'

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

const UNIT_TYPES = [
  { value: 'NIU', label: 'Unidad (NIU)' },
  { value: 'KGM', label: 'Kilogramo (KGM)' },
  { value: 'LTR', label: 'Litro (LTR)' },
  { value: 'MTR', label: 'Metro (MTR)' },
  { value: 'BX', label: 'Caja (BX)' },
  { value: 'PK', label: 'Paquete (PK)' },
  { value: 'BG', label: 'Bolsa (BG)' },
  { value: 'TNE', label: 'Tonelada (TNE)' },
]

// Obtener fecha local en formato YYYY-MM-DD
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Obtener fecha de ayer en formato YYYY-MM-DD
const getYesterdayDateString = () => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return getLocalDateString(yesterday)
}

export default function CreateCarrierDispatchGuideModal({ isOpen, onClose }) {
  const toast = useToast()
  const { getBusinessId } = useAppContext()

  // Datos del transportista (emisor) - se cargan automáticamente
  const [carrierRuc, setCarrierRuc] = useState('')
  const [carrierName, setCarrierName] = useState('')
  const [mtcRegistration, setMtcRegistration] = useState('')

  // GRE Remitente relacionada(s)
  const [relatedGuides, setRelatedGuides] = useState([{ number: '', ruc: '', error: '' }])

  // Datos del remitente (quien envía la mercancía)
  const [shipperRuc, setShipperRuc] = useState('')
  const [shipperName, setShipperName] = useState('')
  const [shipperAddress, setShipperAddress] = useState('')
  const [shipperCity, setShipperCity] = useState('')

  // Datos del destinatario
  const [recipientDocType, setRecipientDocType] = useState('6')
  const [recipientDocNumber, setRecipientDocNumber] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [recipientCity, setRecipientCity] = useState('')

  // Pagador del flete
  const [freightPayer, setFreightPayer] = useState('remitente') // remitente, destinatario, tercero
  const [thirdPartyPayer, setThirdPartyPayer] = useState({
    documentType: '6',
    documentNumber: '',
    name: ''
  })

  // Datos básicos del traslado
  const [transferReason, setTransferReason] = useState('01')
  const [issueDate, setIssueDate] = useState('') // Fecha de emisión del documento
  const [transferDate, setTransferDate] = useState('')
  const [totalWeight, setTotalWeight] = useState('')
  const [transferDescription, setTransferDescription] = useState('')
  const [observations, setObservations] = useState('')

  // Tipo de transporte
  const [transportType, setTransportType] = useState('02') // 02 = Privado, 01 = Público
  const [isM1OrLVehicle, setIsM1OrLVehicle] = useState(false) // Vehículos categoría M1 o L

  // Origen - Ubigeo con dropdowns
  const [originAddress, setOriginAddress] = useState('')
  const [originDepartamento, setOriginDepartamento] = useState('')
  const [originProvincia, setOriginProvincia] = useState('')
  const [originDistrito, setOriginDistrito] = useState('')

  // Destino - Ubigeo con dropdowns
  const [destinationAddress, setDestinationAddress] = useState('')
  const [destinationDepartamento, setDestinationDepartamento] = useState('')
  const [destinationProvincia, setDestinationProvincia] = useState('')
  const [destinationDistrito, setDestinationDistrito] = useState('')

  // Vehículos (soporte para múltiples)
  const [vehicles, setVehicles] = useState([{
    plate: '',
    mtcAuthorization: '',
    mtcEntity: '',
    tuce: '' // Tarjeta Única de Circulación Electrónica
  }])

  // Conductores (soporte para múltiples)
  const [drivers, setDrivers] = useState([{
    documentType: '1',
    documentNumber: '',
    name: '',
    lastName: '',
    license: ''
  }])

  // Items
  const [items, setItems] = useState([{
    description: '',
    quantity: 1,
    unit: 'NIU',
    code: '', // Código interno
    sunatCode: '', // Código de producto SUNAT
    gtin: '' // Código de barras GTIN/EAN
  }])

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
      // Establecer fechas por defecto (hoy)
      setIssueDate(getLocalDateString())
      setTransferDate(getLocalDateString())
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
        setShipperAddress(result.data.direccion || '')
        // Construir ciudad desde departamento/provincia/distrito si existe
        const cityParts = []
        if (result.data.distrito) cityParts.push(result.data.distrito)
        if (result.data.provincia) cityParts.push(result.data.provincia)
        if (result.data.departamento) cityParts.push(result.data.departamento)
        setShipperCity(cityParts.join(', ') || '')
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
        if (recipientDocNumber.length !== 11) {
          toast.error('El RUC debe tener 11 dígitos')
          setIsLookingUpRecipient(false)
          return
        }
        result = await consultarRUC(recipientDocNumber)
        if (result.success) {
          setRecipientName(result.data.razonSocial || '')
          setRecipientAddress(result.data.direccion || '')
          // Construir ciudad desde departamento/provincia/distrito
          const cityParts = []
          if (result.data.distrito) cityParts.push(result.data.distrito)
          if (result.data.provincia) cityParts.push(result.data.provincia)
          if (result.data.departamento) cityParts.push(result.data.departamento)
          setRecipientCity(cityParts.join(', ') || '')
          toast.success('Datos del destinatario obtenidos correctamente')
        }
      } else if (recipientDocType === '1') {
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

  // Validar formato de número de guía (T001-00000001, EG07-00000001, etc.)
  const validateGuideNumber = (value) => {
    if (!value) return ''

    // Verificar espacios al inicio o final
    if (value !== value.trim()) {
      return 'El número tiene espacios al inicio o final'
    }

    // Formato esperado: LETRA(s)+NÚMEROS-NÚMEROS (ej: T001-00000001, EG07-00000001)
    const guidePattern = /^[A-Z]{1,4}\d{2,4}-\d{1,8}$/i
    if (!guidePattern.test(value)) {
      return 'Formato inválido. Ej: T001-00000001 o EG07-00000001'
    }

    return ''
  }

  // Agregar GRE Remitente relacionada
  const addRelatedGuide = () => {
    setRelatedGuides([...relatedGuides, { number: '', ruc: '', error: '' }])
  }

  const removeRelatedGuide = (index) => {
    if (relatedGuides.length > 1) {
      setRelatedGuides(relatedGuides.filter((_, i) => i !== index))
    }
  }

  const updateRelatedGuide = (index, field, value) => {
    const updated = [...relatedGuides]
    updated[index][field] = value

    // Validar número de guía
    if (field === 'number') {
      updated[index].error = validateGuideNumber(value)
    }

    // Validar RUC (11 dígitos numéricos)
    if (field === 'ruc' && value && !/^\d{11}$/.test(value)) {
      updated[index].rucError = 'RUC debe tener 11 dígitos'
    } else if (field === 'ruc') {
      updated[index].rucError = ''
    }

    setRelatedGuides(updated)
  }

  // Funciones para vehículos
  const addVehicle = () => {
    setVehicles([...vehicles, { plate: '', mtcAuthorization: '', mtcEntity: '', tuce: '' }])
  }

  const removeVehicle = (index) => {
    if (vehicles.length > 1) {
      setVehicles(vehicles.filter((_, i) => i !== index))
    }
  }

  const updateVehicle = (index, field, value) => {
    const updated = [...vehicles]
    updated[index][field] = value
    setVehicles(updated)
  }

  // Funciones para conductores
  const addDriver = () => {
    setDrivers([...drivers, { documentType: '1', documentNumber: '', name: '', lastName: '', license: '' }])
  }

  const removeDriver = (index) => {
    if (drivers.length > 1) {
      setDrivers(drivers.filter((_, i) => i !== index))
    }
  }

  const updateDriver = (index, field, value) => {
    const updated = [...drivers]
    updated[index][field] = value
    setDrivers(updated)
  }

  // Funciones para items
  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unit: 'NIU', code: '', sunatCode: '', gtin: '' }])
  }

  const removeItem = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index, field, value) => {
    const updated = [...items]
    updated[index][field] = value
    setItems(updated)
  }

  // Construir ubigeos
  const getOriginUbigeo = () => {
    if (originDepartamento && originProvincia && originDistrito) {
      return buildUbigeo(originDepartamento, originProvincia, originDistrito)
    }
    return ''
  }

  const getDestinationUbigeo = () => {
    if (destinationDepartamento && destinationProvincia && destinationDistrito) {
      return buildUbigeo(destinationDepartamento, destinationProvincia, destinationDistrito)
    }
    return ''
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

    // Validar al menos un vehículo con placa
    const validVehicles = vehicles.filter(v => v.plate.trim())
    if (validVehicles.length === 0) {
      toast.error('Debe ingresar al menos un vehículo con placa')
      return
    }

    // Validar al menos un conductor completo
    const validDrivers = drivers.filter(d => d.documentNumber && d.name && d.lastName && d.license)
    if (validDrivers.length === 0) {
      toast.error('Debe completar los datos de al menos un conductor')
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
        documentType: '31',
        issueDate, // Fecha de emisión seleccionada por el usuario
        transportType,
        isM1OrLVehicle,
        relatedGuides: relatedGuides.filter(g => g.number.trim()),
        shipper: {
          ruc: shipperRuc,
          businessName: shipperName,
          address: shipperAddress,
          city: shipperCity,
        },
        recipient: {
          documentType: recipientDocType,
          documentNumber: recipientDocNumber,
          name: recipientName,
          address: recipientAddress,
          city: recipientCity,
        },
        freightPayer,
        thirdPartyPayer: freightPayer === 'tercero' ? thirdPartyPayer : null,
        transferReason,
        transferDate,
        transferDescription,
        totalWeight: parseFloat(totalWeight),
        observations,
        origin: {
          address: originAddress,
          ubigeo: getOriginUbigeo(),
          departamento: originDepartamento,
          provincia: originProvincia,
          distrito: originDistrito,
        },
        destination: {
          address: destinationAddress,
          ubigeo: getDestinationUbigeo(),
          departamento: destinationDepartamento,
          provincia: destinationProvincia,
          distrito: destinationDistrito,
        },
        vehicles: validVehicles.map((v, idx) => ({
          plate: v.plate.toUpperCase(),
          mtcAuthorization: v.mtcAuthorization,
          mtcEntity: v.mtcEntity,
          tuce: v.tuce,
          isPrincipal: idx === 0, // El primero es principal
        })),
        // Para compatibilidad, también guardamos el primer vehículo como "vehicle"
        vehicle: {
          plate: validVehicles[0]?.plate.toUpperCase() || '',
          mtcAuthorization: validVehicles[0]?.mtcAuthorization || '',
          tuce: validVehicles[0]?.tuce || '',
        },
        drivers: validDrivers.map((d, idx) => ({
          ...d,
          isPrincipal: idx === 0, // El primero es principal
        })),
        // Para compatibilidad, también guardamos el primer conductor como "driver"
        driver: validDrivers[0] || {},
        items: validItems.map(item => ({
          ...item,
          quantity: parseFloat(item.quantity) || 1,
          sunatCode: item.sunatCode || '',
          gtin: item.gtin || '',
        })),
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

      const validItems = items
        .filter(item => item.description?.trim())
        .map(item => ({
          description: item.description.trim(),
          quantity: parseFloat(item.quantity) || 1,
          unit: item.unit || 'NIU',
          code: item.code || '',
        }))

      const validVehicles = vehicles.filter(v => v.plate?.trim())
      const validDrivers = drivers.filter(d => d.documentNumber || d.name)

      const carrierDispatchGuide = {
        documentType: '31',
        issueDate, // Fecha de emisión seleccionada
        transportType,
        isM1OrLVehicle,
        relatedGuides: relatedGuides.filter(g => g.number.trim()),
        shipper: {
          ruc: shipperRuc,
          businessName: shipperName,
          address: shipperAddress,
          city: shipperCity,
        },
        recipient: {
          documentType: recipientDocType,
          documentNumber: recipientDocNumber,
          name: recipientName,
          address: recipientAddress,
          city: recipientCity,
        },
        freightPayer,
        thirdPartyPayer: freightPayer === 'tercero' ? thirdPartyPayer : null,
        transferReason,
        transferDate,
        transferDescription,
        totalWeight: parseFloat(totalWeight) || 0,
        observations,
        origin: {
          address: originAddress,
          ubigeo: getOriginUbigeo(),
          departamento: originDepartamento,
          provincia: originProvincia,
          distrito: originDistrito,
        },
        destination: {
          address: destinationAddress,
          ubigeo: getDestinationUbigeo(),
          departamento: destinationDepartamento,
          provincia: destinationProvincia,
          distrito: destinationDistrito,
        },
        vehicles: validVehicles.map((v, idx) => ({
          plate: v.plate?.toUpperCase() || '',
          mtcAuthorization: v.mtcAuthorization || '',
          mtcEntity: v.mtcEntity || '',
          tuce: v.tuce || '',
          isPrincipal: idx === 0,
        })),
        vehicle: {
          plate: validVehicles[0]?.plate?.toUpperCase() || '',
          mtcAuthorization: validVehicles[0]?.mtcAuthorization || '',
          tuce: validVehicles[0]?.tuce || '',
        },
        drivers: validDrivers.map((d, idx) => ({
          ...d,
          isPrincipal: idx === 0,
        })),
        driver: validDrivers[0] || {},
        items: validItems.map(item => ({
          ...item,
          sunatCode: item.sunatCode || '',
          gtin: item.gtin || '',
        })),
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
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[calc(90vh-8rem)] overflow-y-auto">
        <div className="flex-1 px-6 py-4 space-y-6">

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
                <h3 className="font-semibold text-blue-900 text-sm">Documentos Relacionados (Opcional)</h3>
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
                placeholder="EG07-00000001"
                value={guide.number}
                onChange={(e) => updateRelatedGuide(index, 'number', e.target.value)}
                error={guide.error}
              />
              <Input
                label={index === 0 ? "RUC del Remitente" : ""}
                placeholder="20123456789"
                value={guide.ruc}
                onChange={(e) => updateRelatedGuide(index, 'ruc', e.target.value)}
                maxLength={11}
                error={guide.rucError}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Dirección del Remitente"
              placeholder="Av. Principal 123, Urb. Centro"
              value={shipperAddress}
              onChange={(e) => setShipperAddress(e.target.value)}
            />
            <Input
              label="Ciudad del Remitente"
              placeholder="Lima, Lima, Lima"
              value={shipperCity}
              onChange={(e) => setShipperCity(e.target.value)}
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
                setRecipientAddress('')
                setRecipientCity('')
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Dirección del Destinatario"
              placeholder="Jr. Comercio 456, Centro"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
            />
            <Input
              label="Ciudad del Destinatario"
              placeholder="Arequipa, Arequipa, Arequipa"
              value={recipientCity}
              onChange={(e) => setRecipientCity(e.target.value)}
            />
          </div>

          {/* Pagador del Flete */}
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Building2 className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-yellow-900 text-sm">Pagador del Flete</h3>
                <p className="text-xs text-yellow-800 mt-1">¿Quién paga el servicio de transporte?</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFreightPayer('remitente')}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 font-medium text-sm transition-all ${
                  freightPayer === 'remitente'
                    ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                Remitente
              </button>
              <button
                type="button"
                onClick={() => setFreightPayer('destinatario')}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 font-medium text-sm transition-all ${
                  freightPayer === 'destinatario'
                    ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                Destinatario
              </button>
              <button
                type="button"
                onClick={() => setFreightPayer('tercero')}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 font-medium text-sm transition-all ${
                  freightPayer === 'tercero'
                    ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                Tercero
              </button>
            </div>

            {freightPayer === 'tercero' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-yellow-50 rounded-lg">
                <Select
                  label="Tipo de Documento"
                  value={thirdPartyPayer.documentType}
                  onChange={(e) => setThirdPartyPayer({ ...thirdPartyPayer, documentType: e.target.value })}
                >
                  <option value="6">RUC</option>
                  <option value="1">DNI</option>
                </Select>
                <Input
                  label="N° Documento"
                  placeholder={thirdPartyPayer.documentType === '6' ? '20123456789' : '12345678'}
                  value={thirdPartyPayer.documentNumber}
                  onChange={(e) => setThirdPartyPayer({ ...thirdPartyPayer, documentNumber: e.target.value.replace(/\D/g, '') })}
                  maxLength={thirdPartyPayer.documentType === '6' ? 11 : 8}
                />
                <Input
                  label="Nombre / Razón Social"
                  placeholder="Nombre del pagador"
                  value={thirdPartyPayer.name}
                  onChange={(e) => setThirdPartyPayer({ ...thirdPartyPayer, name: e.target.value })}
                />
              </div>
            )}
          </div>

          {/* Datos de Envío */}
          <div className="bg-gray-50 border-l-4 border-gray-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Calendar className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Datos de Envío</h3>
                <p className="text-xs text-gray-700 mt-1">Información del traslado</p>
              </div>
            </div>
          </div>

          {/* Tipo de Transporte */}
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
              Tipo de Transporte
              <Info className="w-3.5 h-3.5 text-gray-400" />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTransportType('02')}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 font-medium text-sm transition-all ${
                  transportType === '02'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                Privado
              </button>
              <button
                type="button"
                onClick={() => setTransportType('01')}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 font-medium text-sm transition-all ${
                  transportType === '01'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                Público
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Input
              type="date"
              label="Fecha de emisión"
              required
              value={issueDate}
              onChange={(e) => {
                setIssueDate(e.target.value)
                // Si la fecha de traslado es anterior a la nueva fecha de emisión, ajustarla
                if (transferDate && e.target.value > transferDate) {
                  setTransferDate(e.target.value)
                }
              }}
              min={getYesterdayDateString()}
              max={getLocalDateString()}
              helperText="Permite ayer"
            />
            <Input
              type="date"
              label="Fecha de traslado"
              required
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              min={issueDate || getYesterdayDateString()}
            />
            <Input
              label="Descripción del traslado"
              placeholder="Ej: Mercadería variada"
              value={transferDescription}
              onChange={(e) => setTransferDescription(e.target.value)}
            />
            <Select
              label="Unid. del peso bruto"
              value="KGM"
              disabled
            >
              <option value="KGM">KGM</option>
            </Select>
            <Input
              type="number"
              label="Peso bruto total"
              placeholder="Ej: 500"
              required
              value={totalWeight}
              onChange={(e) => setTotalWeight(e.target.value)}
              step="0.01"
              min="0.01"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 w-full">
                <input
                  type="checkbox"
                  checked={isM1OrLVehicle}
                  onChange={(e) => setIsM1OrLVehicle(e.target.checked)}
                  className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">
                  Traslado en vehículos de categoría M1 o L
                </span>
                <Info className="w-3.5 h-3.5 text-gray-400 ml-auto" />
              </label>
            </div>
          </div>

          {/* Vehículos */}
          <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Car className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-purple-900 text-sm">Datos del Vehículo</h3>
                <p className="text-xs text-purple-800 mt-1">Unidad(es) de transporte asignada(s)</p>
              </div>
            </div>
          </div>

          {vehicles.map((vehicle, index) => (
            <div key={index} className="space-y-3 p-4 bg-purple-50/50 rounded-lg">
              {/* Etiqueta Principal/Secundario */}
              <div className="flex justify-between items-center">
                <span className={`text-xs font-semibold px-2 py-1 rounded ${
                  index === 0
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-400 text-white'
                }`}>
                  {index === 0 ? 'PRINCIPAL' : 'SECUNDARIO'}
                </span>
                {vehicles.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeVehicle(index)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Input
                  label="Placa *"
                  placeholder="ABC-123"
                  required={index === 0}
                  value={vehicle.plate}
                  onChange={(e) => updateVehicle(index, 'plate', e.target.value.toUpperCase())}
                />
                <Input
                  label="TUCE"
                  placeholder="Código TUCE"
                  value={vehicle.tuce}
                  onChange={(e) => updateVehicle(index, 'tuce', e.target.value)}
                  helperText="Tarjeta Única de Circulación"
                />
                <Select
                  label="Entidad MTC"
                  value={vehicle.mtcEntity}
                  onChange={(e) => updateVehicle(index, 'mtcEntity', e.target.value)}
                >
                  <option value="">Seleccione</option>
                  <option value="MTC">MTC</option>
                  <option value="SUTRAN">SUTRAN</option>
                </Select>
                <Input
                  label="N° Autorización"
                  placeholder="Certificado"
                  value={vehicle.mtcAuthorization}
                  onChange={(e) => updateVehicle(index, 'mtcAuthorization', e.target.value)}
                />
                <div className="flex items-end">
                  {index === vehicles.length - 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addVehicle}
                      className="text-purple-600 hover:bg-purple-50 w-full"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Agregar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Conductores */}
          <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <User className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-rose-900 text-sm">Datos del Conductor</h3>
                <p className="text-xs text-rose-800 mt-1">Conductor(es) del vehículo</p>
              </div>
            </div>
          </div>

          {drivers.map((driver, index) => (
            <div key={index} className="space-y-4 p-4 bg-rose-50/50 rounded-lg">
              {/* Etiqueta Principal/Secundario */}
              <div className="flex justify-between items-center">
                <span className={`text-xs font-semibold px-2 py-1 rounded ${
                  index === 0
                    ? 'bg-rose-600 text-white'
                    : 'bg-gray-400 text-white'
                }`}>
                  {index === 0 ? 'PRINCIPAL' : 'SECUNDARIO'}
                </span>
                {drivers.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeDriver(index)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select
                  label="Tipo de documento *"
                  required={index === 0}
                  value={driver.documentType}
                  onChange={(e) => updateDriver(index, 'documentType', e.target.value)}
                >
                  {DOCUMENT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </Select>
                <Input
                  label="N° Doc. de identidad *"
                  placeholder="12345678"
                  required={index === 0}
                  value={driver.documentNumber}
                  onChange={(e) => updateDriver(index, 'documentNumber', e.target.value)}
                />
                <Input
                  label="N° de licencia *"
                  placeholder="Q12345678"
                  required={index === 0}
                  value={driver.license}
                  onChange={(e) => updateDriver(index, 'license', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Nombre del conductor *"
                  placeholder="Juan Carlos"
                  required={index === 0}
                  value={driver.name}
                  onChange={(e) => updateDriver(index, 'name', e.target.value)}
                />
                <Input
                  label="Apellido del conductor *"
                  placeholder="Pérez García"
                  required={index === 0}
                  value={driver.lastName}
                  onChange={(e) => updateDriver(index, 'lastName', e.target.value)}
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addDriver}
            className="text-rose-600 hover:bg-rose-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Agregar conductor
          </Button>

          {/* Punto de Partida */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <MapPin className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-900 text-sm">Punto de Partida</h3>
                <p className="text-xs text-amber-800 mt-1">Dirección donde se recoge la mercancía</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Dirección *"
              placeholder="Av. Principal 123"
              required
              value={originAddress}
              onChange={(e) => setOriginAddress(e.target.value)}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Departamento"
                value={originDepartamento}
                onChange={(e) => {
                  setOriginDepartamento(e.target.value)
                  setOriginProvincia('')
                  setOriginDistrito('')
                }}
              >
                <option value="">Seleccione</option>
                {DEPARTAMENTOS.map(dept => (
                  <option key={dept.code} value={dept.code}>{dept.name}</option>
                ))}
              </Select>
              <Select
                label="Provincia"
                value={originProvincia}
                onChange={(e) => {
                  setOriginProvincia(e.target.value)
                  setOriginDistrito('')
                }}
                disabled={!originDepartamento}
              >
                <option value="">Seleccione</option>
                {getProvincias(originDepartamento).map(prov => (
                  <option key={prov.code} value={prov.code}>{prov.name}</option>
                ))}
              </Select>
              <Select
                label="Distrito"
                value={originDistrito}
                onChange={(e) => setOriginDistrito(e.target.value)}
                disabled={!originProvincia}
              >
                <option value="">Seleccione</option>
                {getDistritos(originDepartamento, originProvincia).map(dist => (
                  <option key={dist.code} value={dist.code}>{dist.name}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Punto de Llegada */}
          <div className="bg-teal-50 border-l-4 border-teal-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <MapPin className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-teal-900 text-sm">Punto de Llegada</h3>
                <p className="text-xs text-teal-800 mt-1">Dirección donde se entrega la mercancía</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Dirección *"
              placeholder="Jr. Comercio 456"
              required
              value={destinationAddress}
              onChange={(e) => setDestinationAddress(e.target.value)}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Departamento"
                value={destinationDepartamento}
                onChange={(e) => {
                  setDestinationDepartamento(e.target.value)
                  setDestinationProvincia('')
                  setDestinationDistrito('')
                }}
              >
                <option value="">Seleccione</option>
                {DEPARTAMENTOS.map(dept => (
                  <option key={dept.code} value={dept.code}>{dept.name}</option>
                ))}
              </Select>
              <Select
                label="Provincia"
                value={destinationProvincia}
                onChange={(e) => {
                  setDestinationProvincia(e.target.value)
                  setDestinationDistrito('')
                }}
                disabled={!destinationDepartamento}
              >
                <option value="">Seleccione</option>
                {getProvincias(destinationDepartamento).map(prov => (
                  <option key={prov.code} value={prov.code}>{prov.name}</option>
                ))}
              </Select>
              <Select
                label="Distrito"
                value={destinationDistrito}
                onChange={(e) => setDestinationDistrito(e.target.value)}
                disabled={!destinationProvincia}
              >
                <option value="">Seleccione</option>
                {getDistritos(destinationDepartamento, destinationProvincia).map(dist => (
                  <option key={dist.code} value={dist.code}>{dist.name}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Bienes */}
          <div className="bg-cyan-50 border-l-4 border-cyan-500 p-4 rounded-r-lg">
            <div className="flex items-start gap-2">
              <Package className="w-5 h-5 text-cyan-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-cyan-900 text-sm">Agregar bienes o productos a transportar</h3>
                <p className="text-xs text-cyan-800 mt-1">Detalle de los productos que se transportan</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 text-gray-600 font-medium">Item</th>
                  <th className="text-left py-2 px-2 text-gray-600 font-medium">Cantidad *</th>
                  <th className="text-left py-2 px-2 text-gray-600 font-medium">Unidad *</th>
                  <th className="text-left py-2 px-2 text-gray-600 font-medium">Código</th>
                  <th className="text-left py-2 px-2 text-gray-600 font-medium">Cód. SUNAT</th>
                  <th className="text-left py-2 px-2 text-gray-600 font-medium">GTIN</th>
                  <th className="text-left py-2 px-2 text-gray-600 font-medium">Descripción *</th>
                  <th className="text-left py-2 px-2 text-gray-600 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-500">{index + 1}</td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        min="0.01"
                        step="0.01"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(index, 'unit', e.target.value)}
                        className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      >
                        {UNIT_TYPES.map(unit => (
                          <option key={unit.value} value={unit.value}>{unit.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        placeholder="Interno"
                        value={item.code}
                        onChange={(e) => updateItem(index, 'code', e.target.value)}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        placeholder="SUNAT"
                        value={item.sunatCode}
                        onChange={(e) => updateItem(index, 'sunatCode', e.target.value)}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        title="Código de producto SUNAT"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        placeholder="EAN/GTIN"
                        value={item.gtin}
                        onChange={(e) => updateItem(index, 'gtin', e.target.value)}
                        className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        title="Código de barras GTIN/EAN"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        placeholder="Descripción del producto"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        className="w-full min-w-40 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        required
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {index === items.length - 1 && (
                          <button
                            type="button"
                            onClick={addItem}
                            className="p-1.5 text-cyan-600 hover:bg-cyan-50 rounded"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Más Información */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Más Información (Observaciones)
            </label>
            <textarea
              placeholder="Información adicional sobre el traslado..."
              value={observations}
              onChange={(e) => setObservations(e.target.value.slice(0, 250))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm resize-none"
            />
            <p className="text-xs text-gray-500 text-right">
              {observations.length}/250 caracteres
            </p>
          </div>

          {/* Footer - Dentro del scroll */}
          <div className="border-t border-gray-200 py-4 mt-6 bg-gray-50 -mx-6 px-6">
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
                      Guardar
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
                      Emitir Guía
                    </>
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-gray-500 text-right mt-2">
              Campos obligatorios (*)
            </p>
          </div>

        </div>
      </form>
    </Modal>
  )
}
