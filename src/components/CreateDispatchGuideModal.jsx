import { useState, useEffect } from 'react'
import { X, Truck, MapPin, User, Package, Calendar, FileText, Plus, Trash2, ChevronDown, ChevronUp, Store, Search, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/contexts/ToastContext'
import { useAppContext } from '@/hooks/useAppContext'
import { createDispatchGuide, getCompanySettings, sendDispatchGuideToSunat } from '@/services/firestoreService'
import { getBranch, getActiveBranches } from '@/services/branchService'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
import { consultarRUC } from '@/services/documentLookupService'

const TRANSFER_REASONS = [
  { value: '01', label: 'Venta' },
  { value: '02', label: 'Compra' },
  { value: '04', label: 'Traslado entre establecimientos de la misma empresa' },
  { value: '08', label: 'Importación' },
  { value: '09', label: 'Exportación' },
  { value: '13', label: 'Otros' },
  { value: '14', label: 'Venta sujeta a confirmación del comprador' },
  { value: '17', label: 'Traslado de bienes para transformación' },
  { value: '18', label: 'Traslado emisor itinerante CP' },
  { value: '19', label: 'Traslado a zona primaria' },
]

const DOCUMENT_TYPES = [
  { value: '1', label: 'DNI' },
  { value: '4', label: 'Carnet de Extranjería' },
  { value: '6', label: 'RUC' },
  { value: '7', label: 'Pasaporte' },
]

const RECIPIENT_DOCUMENT_TYPES = [
  { value: '6', label: 'RUC' },
  { value: '1', label: 'DNI' },
  { value: '4', label: 'Carnet de Extranjería' },
  { value: '7', label: 'Pasaporte' },
  { value: '0', label: 'Sin documento' },
]

const UNIT_CODES = [
  { value: 'NIU', label: 'NIU - Unidad' },
  { value: 'KGM', label: 'KGM - Kilogramo' },
  { value: 'LTR', label: 'LTR - Litro' },
  { value: 'MTR', label: 'MTR - Metro' },
  { value: 'GLL', label: 'GLL - Galón' },
  { value: 'BOX', label: 'BOX - Caja' },
  { value: 'PK', label: 'PK - Paquete' },
  { value: 'DZN', label: 'DZN - Docena' },
]

const RELATED_DOC_TYPES = [
  { value: '01', label: 'Factura' },
  { value: '03', label: 'Boleta de Venta' },
  { value: '09', label: 'Guía de Remisión Remitente' },
  { value: '31', label: 'Guía de Remisión Transportista' },
  { value: '49', label: 'Orden de Compra' },
  { value: '52', label: 'Liquidación de Compra' },
]

// Obtener fecha actual en Perú como objeto Date
const getPeruDate = () => {
  // Crear fecha en zona horaria de Perú
  const now = new Date()
  const peruTimeString = now.toLocaleString('en-US', { timeZone: 'America/Lima' })
  return new Date(peruTimeString)
}

// Obtener fecha local en formato YYYY-MM-DD (zona horaria Perú UTC-5)
const getLocalDateString = (daysOffset = 0) => {
  const peruDate = getPeruDate()
  if (daysOffset !== 0) {
    peruDate.setDate(peruDate.getDate() + daysOffset)
  }
  const year = peruDate.getFullYear()
  const month = String(peruDate.getMonth() + 1).padStart(2, '0')
  const day = String(peruDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Obtener fecha de ayer (zona horaria Perú UTC-5)
const getYesterdayDateString = () => {
  return getLocalDateString(-1)
}

// Obtener fecha de mañana (zona horaria Perú UTC-5)
const getTomorrowDateString = () => {
  return getLocalDateString(1)
}

export default function CreateDispatchGuideModal({ isOpen, onClose, referenceInvoice = null, selectedBranch = null }) {
  const toast = useToast()
  const { getBusinessId, filterBranchesByAccess, user } = useAppContext()

  // Sucursales disponibles
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')

  // Datos básicos de la guía
  const [transferReason, setTransferReason] = useState('01')
  const [transportMode, setTransportMode] = useState('02') // 02=Privado, 01=Público
  const [issueDate, setIssueDate] = useState('')
  const [transferDate, setTransferDate] = useState('')
  const [transferDescription, setTransferDescription] = useState('')
  const [totalWeight, setTotalWeight] = useState('')
  const [weightUnit, setWeightUnit] = useState('KGM')
  const [isM1LVehicle, setIsM1LVehicle] = useState(false)

  // Datos del destinatario
  const [recipientDocType, setRecipientDocType] = useState('6')
  const [recipientDocNumber, setRecipientDocNumber] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [recipientDepartment, setRecipientDepartment] = useState('')
  const [recipientProvince, setRecipientProvince] = useState('')
  const [recipientDistrict, setRecipientDistrict] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')

  // Documentos relacionados
  const [relatedDocuments, setRelatedDocuments] = useState([])

  // Punto de partida
  const [originAddress, setOriginAddress] = useState('')
  const [originDepartment, setOriginDepartment] = useState('')
  const [originProvince, setOriginProvince] = useState('')
  const [originDistrict, setOriginDistrict] = useState('')

  // Punto de llegada
  const [destinationAddress, setDestinationAddress] = useState('')
  const [destinationDepartment, setDestinationDepartment] = useState('')
  const [destinationProvince, setDestinationProvince] = useState('')
  const [destinationDistrict, setDestinationDistrict] = useState('')

  // Tab activo para puntos
  const [activeLocationTab, setActiveLocationTab] = useState('origin')

  // Datos del vehículo (transporte privado)
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [vehicleAuthEntity, setVehicleAuthEntity] = useState('')
  const [vehicleAuthNumber, setVehicleAuthNumber] = useState('')

  // Datos del conductor (transporte privado)
  const [driverDocType, setDriverDocType] = useState('1')
  const [driverDocNumber, setDriverDocNumber] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverLastName, setDriverLastName] = useState('')
  const [driverLicense, setDriverLicense] = useState('')

  // Datos de transporte público
  const [carrierRuc, setCarrierRuc] = useState('')
  const [carrierName, setCarrierName] = useState('')
  const [isSearchingCarrier, setIsSearchingCarrier] = useState(false)

  // Items (productos)
  const [items, setItems] = useState([])

  // Más información
  const [additionalInfo, setAdditionalInfo] = useState('')

  // Otros datos adicionales (collapsible)
  const [showAdditionalData, setShowAdditionalData] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [autoSendToSunat, setAutoSendToSunat] = useState(false)

  // Resetear campos cuando se cierra el modal
  useEffect(() => {
    if (!isOpen) {
      // Limpiar campos del destinatario
      setRecipientDocType('6')
      setRecipientDocNumber('')
      setRecipientName('')
      setRecipientAddress('')
      setRecipientDepartment('')
      setRecipientProvince('')
      setRecipientDistrict('')
      setRecipientEmail('')

      // Limpiar punto de llegada
      setDestinationAddress('')
      setDestinationDepartment('')
      setDestinationProvince('')
      setDestinationDistrict('')

      // Limpiar otros campos
      setItems([])
      setRelatedDocuments([])
      setTransferDescription('')
      setTotalWeight('')
      setDriverDocType('1')
      setDriverDocNumber('')
      setDriverName('')
      setDriverLicense('')
      setVehiclePlate('')
      setIsM1LVehicle(false)
    }
  }, [isOpen])

  // Inicializar fechas cuando se abre el modal (sin referenceInvoice)
  useEffect(() => {
    if (isOpen && !referenceInvoice) {
      // Inicializar fecha de emisión con la fecha actual de Perú (hoy)
      setIssueDate(getLocalDateString(0))
      // Inicializar fecha de traslado para mañana (+1 día)
      setTransferDate(getTomorrowDateString())
    }
  }, [isOpen, referenceInvoice])

  // Cargar sucursales disponibles
  useEffect(() => {
    const loadBranches = async () => {
      if (!user?.uid || !isOpen) return
      try {
        const businessId = getBusinessId()
        const result = await getActiveBranches(businessId)
        if (result.success) {
          const branchList = filterBranchesByAccess ? filterBranchesByAccess(result.data || []) : (result.data || [])
          setBranches(branchList)
        }
      } catch (error) {
        console.error('Error al cargar sucursales:', error)
      }
    }
    loadBranches()
  }, [isOpen, user?.uid, getBusinessId, filterBranchesByAccess])

  // Inicializar sucursal seleccionada
  useEffect(() => {
    if (referenceInvoice?.branchId) {
      setSelectedBranchId(referenceInvoice.branchId)
    } else if (selectedBranch?.id) {
      setSelectedBranchId(selectedBranch.id)
    } else {
      setSelectedBranchId('')
    }
  }, [referenceInvoice?.branchId, selectedBranch?.id, isOpen])

  // Pre-llenar datos si hay factura de referencia
  useEffect(() => {
    if (referenceInvoice) {
      // Pre-llenar items desde la factura
      const invoiceItems = referenceInvoice.items?.map((item, index) => ({
        id: index + 1,
        code: item.code || item.productId || '',
        description: item.description || item.name || '',
        quantity: item.quantity || 0,
        unit: item.unit || 'NIU',
        sunatCode: '',
        gtin: '',
        subpCode: '',
        isNormalized: false,
      })) || []

      setItems(invoiceItems)

      // Calcular peso estimado
      const estimatedWeight = invoiceItems.reduce((sum, item) => sum + (item.quantity * 1), 0)
      setTotalWeight(estimatedWeight.toString())

      // Pre-llenar fechas (usando hora de Perú)
      setIssueDate(getLocalDateString(0))  // Hoy
      setTransferDate(getTomorrowDateString())  // Mañana

      // Pre-llenar datos del destinatario desde el cliente de la factura
      if (referenceInvoice.customer) {
        const customer = referenceInvoice.customer

        let docType = '6'
        if (customer.documentType === 'RUC' || customer.documentType === '6') {
          docType = '6'
        } else if (customer.documentType === 'DNI' || customer.documentType === '1') {
          docType = '1'
        } else if (customer.documentType === 'CE' || customer.documentType === '4') {
          docType = '4'
        } else if (customer.documentNumber?.length === 11) {
          docType = '6'
        } else if (customer.documentNumber?.length === 8) {
          docType = '1'
        }

        setRecipientDocType(docType)
        setRecipientDocNumber(customer.documentNumber || '')
        setRecipientName(customer.name || '')

        // Limpiar y setear dirección del destinatario
        setRecipientAddress(customer.address || '')
        setDestinationAddress(customer.address || '')

        // Limpiar campos de ubicación del destinatario (departamento, provincia, distrito)
        // para evitar que queden datos del cliente anterior
        setRecipientDepartment(customer.department || '')
        setRecipientProvince(customer.province || '')
        setRecipientDistrict(customer.district || '')

        // Limpiar campos de punto de llegada
        setDestinationDepartment(customer.department || '')
        setDestinationProvince(customer.province || '')
        setDestinationDistrict(customer.district || '')
      } else {
        // Si no hay cliente, limpiar todos los campos del destinatario
        setRecipientDocType('6')
        setRecipientDocNumber('')
        setRecipientName('')
        setRecipientAddress('')
        setRecipientDepartment('')
        setRecipientProvince('')
        setRecipientDistrict('')
        setDestinationAddress('')
        setDestinationDepartment('')
        setDestinationProvince('')
        setDestinationDistrict('')
      }

      // Agregar factura como documento relacionado
      if (referenceInvoice.number) {
        const docType = referenceInvoice.documentType === 'factura' ? '01' : '03'
        setRelatedDocuments([{
          id: 1,
          type: docType,
          series: referenceInvoice.number.split('-')[0] || '',
          number: referenceInvoice.number.split('-')[1] || '',
        }])
      }
    }
  }, [referenceInvoice])

  // Cargar dirección de origen desde el negocio (solo una vez al abrir)
  useEffect(() => {
    const loadBusinessAddress = async () => {
      const businessId = getBusinessId()
      if (!businessId) return

      try {
        const companyResult = await getCompanySettings(businessId)
        if (!companyResult.success || !companyResult.data) return

        const businessData = companyResult.data

        // Cargar configuración de envío automático a SUNAT
        setAutoSendToSunat(businessData.autoSendToSunat === true)

        // Si no hay sucursal seleccionada, usar dirección del negocio principal
        if (!selectedBranchId) {
          if (businessData.address) {
            setOriginAddress(businessData.address)
          }
          if (businessData.ubigeo && businessData.ubigeo.length === 6) {
            setOriginDepartment(businessData.ubigeo.substring(0, 2))
            setOriginProvince(businessData.ubigeo.substring(2, 4))
            setOriginDistrict(businessData.ubigeo.substring(4, 6))
          }
        }
      } catch (error) {
        console.error('Error al cargar dirección del negocio:', error)
      }
    }

    if (isOpen) {
      loadBusinessAddress()
    }
  }, [isOpen, getBusinessId])

  // Actualizar dirección de origen cuando cambia la sucursal seleccionada
  useEffect(() => {
    if (selectedBranchId && branches.length > 0) {
      const selectedBranchData = branches.find(b => b.id === selectedBranchId)
      if (selectedBranchData) {
        // Usar dirección de la sucursal
        if (selectedBranchData.address) {
          setOriginAddress(selectedBranchData.address)
        }
        // Usar ubigeo de la sucursal si existe
        if (selectedBranchData.ubigeo && selectedBranchData.ubigeo.length === 6) {
          setOriginDepartment(selectedBranchData.ubigeo.substring(0, 2))
          setOriginProvince(selectedBranchData.ubigeo.substring(2, 4))
          setOriginDistrict(selectedBranchData.ubigeo.substring(4, 6))
        }
      }
    }
  }, [selectedBranchId, branches])

  // Sincronizar ubigeo y dirección del destinatario con el punto de llegada
  // (generalmente el punto de llegada es la dirección del destinatario)
  useEffect(() => {
    // Sincronizar departamento
    if (recipientDepartment) {
      setDestinationDepartment(recipientDepartment)
    }
    // Sincronizar provincia
    if (recipientProvince) {
      setDestinationProvince(recipientProvince)
    }
    // Sincronizar distrito
    if (recipientDistrict) {
      setDestinationDistrict(recipientDistrict)
    }
    // Sincronizar dirección
    if (recipientAddress) {
      setDestinationAddress(recipientAddress)
    }
  }, [recipientDepartment, recipientProvince, recipientDistrict, recipientAddress])

  // Obtener ubigeo completo
  const getUbigeo = (dept, prov, dist) => {
    if (dept && prov && dist) {
      return `${dept}${prov}${dist}`
    }
    return ''
  }

  // Agregar documento relacionado
  const addRelatedDocument = () => {
    setRelatedDocuments([...relatedDocuments, {
      id: Date.now(),
      type: '01',
      series: '',
      number: '',
    }])
  }

  // Eliminar documento relacionado
  const removeRelatedDocument = (id) => {
    setRelatedDocuments(relatedDocuments.filter(doc => doc.id !== id))
  }

  // Actualizar documento relacionado
  const updateRelatedDocument = (id, field, value) => {
    setRelatedDocuments(relatedDocuments.map(doc =>
      doc.id === id ? { ...doc, [field]: value } : doc
    ))
  }

  // Agregar item
  const addItem = () => {
    setItems([...items, {
      id: Date.now(),
      code: '',
      description: '',
      quantity: 1,
      unit: 'NIU',
      sunatCode: '',
      gtin: '',
      subpCode: '',
      isNormalized: false,
    }])
  }

  // Eliminar item
  const removeItem = (id) => {
    setItems(items.filter(item => item.id !== id))
  }

  // Actualizar item
  const updateItem = (id, field, value) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  // Buscar datos del transportista por RUC
  const handleSearchCarrierRuc = async () => {
    if (!carrierRuc || carrierRuc.length !== 11) {
      toast.error('Ingrese un RUC válido de 11 dígitos')
      return
    }

    setIsSearchingCarrier(true)
    try {
      const result = await consultarRUC(carrierRuc)
      if (result.success) {
        setCarrierName(result.data.razonSocial || '')
        toast.success('Datos del transportista encontrados')
      } else {
        toast.error(result.error || 'No se encontraron datos para este RUC')
      }
    } catch (error) {
      console.error('Error al buscar RUC:', error)
      toast.error('Error al consultar el RUC')
    } finally {
      setIsSearchingCarrier(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validaciones
    if (!transferDate) {
      toast.error('Debe ingresar la fecha de inicio del traslado')
      return
    }

    const originUbigeo = getUbigeo(originDepartment, originProvince, originDistrict)
    const destinationUbigeo = getUbigeo(destinationDepartment, destinationProvince, destinationDistrict)

    if (!originAddress || !originUbigeo) {
      toast.error('Debe completar la dirección de origen')
      return
    }

    if (!destinationAddress || !destinationUbigeo) {
      toast.error('Debe completar la dirección de destino')
      return
    }

    if (!totalWeight || parseFloat(totalWeight) <= 0) {
      toast.error('Debe ingresar el peso total de la mercancía')
      return
    }

    if (transportMode === '02') {
      // Si es vehículo M1 o L, los datos del conductor y placa son opcionales
      if (!isM1LVehicle) {
        if (!driverDocNumber || !driverName || !driverLastName || !driverLicense || !vehiclePlate) {
          toast.error('Debe completar todos los datos del conductor y vehículo para transporte privado')
          return
        }
      }
      // Validar formato de placa si se ingresó
      if (vehiclePlate) {
        const plateRegex = /^[A-Z0-9]{3}-?[A-Z0-9]{3}$/i
        if (!plateRegex.test(vehiclePlate.trim())) {
          toast.error(`Formato de placa inválido: ${vehiclePlate}. Use formato ABC123 o ABC-123`)
          return
        }
      }
    } else {
      if (!carrierRuc || !carrierName) {
        toast.error('Debe completar los datos del transportista para transporte público')
        return
      }
    }

    if (items.length === 0) {
      toast.error('Debe agregar al menos un producto a transportar')
      return
    }

    if (!recipientDocNumber || !recipientName) {
      toast.error('Debe completar los datos del destinatario')
      return
    }

    setIsSaving(true)

    try {
      const businessId = getBusinessId()

      const dispatchGuide = {
        referencedInvoice: referenceInvoice ? {
          id: referenceInvoice.id,
          documentType: referenceInvoice.documentType === 'factura' ? '01' : '03',
          series: referenceInvoice.number?.split('-')[0] || '',
          number: referenceInvoice.number?.split('-')[1] || '',
          fullNumber: referenceInvoice.number,
        } : null,

        relatedDocuments: relatedDocuments.filter(doc => doc.series && doc.number).map(doc => ({
          type: doc.type,
          series: doc.series,
          number: doc.number,
          fullNumber: `${doc.series}-${doc.number}`,
        })),

        recipient: {
          documentType: recipientDocType,
          documentNumber: recipientDocNumber,
          name: recipientName,
          address: recipientAddress,
          email: recipientEmail,
          ubigeo: getUbigeo(recipientDepartment, recipientProvince, recipientDistrict),
        },

        issueDate,
        transferReason,
        transportMode,
        transferDate,
        transferDescription,
        totalWeight: parseFloat(totalWeight),
        weightUnit,
        isM1LVehicle,

        origin: {
          address: originAddress,
          ubigeo: originUbigeo,
          department: originDepartment,
          province: originProvince,
          district: originDistrict,
        },
        destination: {
          address: destinationAddress,
          ubigeo: destinationUbigeo,
          department: destinationDepartment,
          province: destinationProvince,
          district: destinationDistrict,
        },

        transport: transportMode === '02' ? {
          driver: {
            documentType: driverDocType,
            documentNumber: driverDocNumber,
            name: driverName,
            lastName: driverLastName,
            license: driverLicense,
          },
          vehicle: {
            plate: vehiclePlate,
            authorizationEntity: vehicleAuthEntity || null,
            authorizationNumber: vehicleAuthNumber || null,
          },
        } : {
          carrier: {
            ruc: carrierRuc,
            businessName: carrierName,
          },
        },

        items: items.map((item, index) => ({
          ...item,
          lineNumber: index + 1,
        })),

        additionalInfo,

        // Sucursal seleccionada
        branchId: selectedBranchId || null,
        branchName: selectedBranchId ? branches.find(b => b.id === selectedBranchId)?.name || null : null,
      }

      console.log('Creando guía de remisión:', dispatchGuide)

      const result = await createDispatchGuide(businessId, dispatchGuide)

      if (result.success) {
        toast.success(`Guía de remisión ${result.number} creada exitosamente`)

        // Envío automático a SUNAT si está configurado (fire & forget)
        if (autoSendToSunat && result.id) {
          console.log('🚀 Enviando guía de remisión automáticamente a SUNAT...')
          toast.info('Enviando a SUNAT en segundo plano...', 3000)

          // Fire & forget - no esperamos el resultado
          sendDispatchGuideToSunat(businessId, result.id)
            .then((sunatResult) => {
              if (sunatResult.success && sunatResult.accepted) {
                toast.success(`Guía ${result.number} aceptada por SUNAT`)
              } else if (sunatResult.success && !sunatResult.accepted) {
                toast.warning(`Guía ${result.number}: ${sunatResult.message || 'Pendiente de validación SUNAT'}`)
              } else {
                toast.error(`Error al enviar guía a SUNAT: ${sunatResult.error || 'Error desconocido'}`)
              }
            })
            .catch((err) => {
              console.error('Error en envío automático a SUNAT:', err)
              toast.error(`Error al enviar guía a SUNAT: ${err.message}`)
            })
        }

        onClose()
      } else {
        throw new Error(result.error || 'Error al crear la guía')
      }

    } catch (error) {
      console.error('Error al crear guía de remisión:', error)
      toast.error(error.message || 'Error al crear la guía de remisión')
    } finally {
      setIsSaving(false)
    }
  }

  // Obtener provincias según departamento
  const getProvincias = (deptCode) => {
    return PROVINCIAS[deptCode] || []
  }

  // Obtener distritos según departamento y provincia
  const getDistritos = (deptCode, provCode) => {
    const key = `${deptCode}${provCode}`
    return DISTRITOS[key] || []
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="6xl">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Truck className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Guía de Remisión Electrónica
            </h2>
            <p className="text-sm text-gray-600">Guía Remitente</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Fecha de emisión</p>
          <p className="font-medium">{issueDate || getLocalDateString()}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col max-h-[calc(90vh-8rem)]">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

          {/* Selector de Sucursal (solo si hay múltiples sucursales) */}
          {branches.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Store className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div className="flex-1">
                  <label className="block text-sm font-medium text-blue-800 mb-1">
                    Sucursal de origen
                  </label>
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="w-full md:w-auto min-w-[250px] px-3 py-2 border border-blue-300 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">Sucursal Principal</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-blue-600 mt-1">
                    Selecciona desde qué sucursal se genera esta guía de remisión
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sección: Destinatario */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
              <User className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-800">Datos del Destinatario</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Motivo de traslado"
                required
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
              >
                {TRANSFER_REASONS.map(reason => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </Select>

              <Input
                type="date"
                label="Fecha de emisión"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                min={getYesterdayDateString()}
                max={getLocalDateString()}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Tipo de Documento"
                required
                value={recipientDocType}
                onChange={(e) => setRecipientDocType(e.target.value)}
              >
                {RECIPIENT_DOCUMENT_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>

              <Input
                label="Nro. de Documento"
                placeholder={recipientDocType === '6' ? '20123456789' : '12345678'}
                required
                value={recipientDocNumber}
                onChange={(e) => setRecipientDocNumber(e.target.value)}
                maxLength={recipientDocType === '6' ? 11 : 15}
              />

              <Input
                label="Razón Social"
                placeholder="Nombre o razón social del destinatario"
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
            </div>

            <Input
              label="Dirección"
              placeholder="Dirección del destinatario"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
            />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select
                label="Departamento"
                value={recipientDepartment}
                onChange={(e) => {
                  setRecipientDepartment(e.target.value)
                  setRecipientProvince('')
                  setRecipientDistrict('')
                }}
              >
                <option value="">Seleccione</option>
                {DEPARTAMENTOS.map(dept => (
                  <option key={dept.code} value={dept.code}>
                    {dept.name}
                  </option>
                ))}
              </Select>

              <Select
                label="Provincia"
                value={recipientProvince}
                onChange={(e) => {
                  setRecipientProvince(e.target.value)
                  setRecipientDistrict('')
                }}
                disabled={!recipientDepartment}
              >
                <option value="">Seleccione</option>
                {getProvincias(recipientDepartment).map(prov => (
                  <option key={prov.code} value={prov.code}>
                    {prov.name}
                  </option>
                ))}
              </Select>

              <Select
                label="Distrito"
                value={recipientDistrict}
                onChange={(e) => setRecipientDistrict(e.target.value)}
                disabled={!recipientProvince}
              >
                <option value="">Seleccione</option>
                {getDistritos(recipientDepartment, recipientProvince).map(dist => (
                  <option key={dist.code} value={dist.code}>
                    {dist.name}
                  </option>
                ))}
              </Select>

              <Input
                label="Email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Documentos Relacionados */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-800">Documentos Relacionados</h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRelatedDocument}
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar
              </Button>
            </div>

            {relatedDocuments.length > 0 && (
              <div className="space-y-2">
                {relatedDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <Select
                      value={doc.type}
                      onChange={(e) => updateRelatedDocument(doc.id, 'type', e.target.value)}
                      className="w-40"
                    >
                      {RELATED_DOC_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      placeholder="Serie"
                      value={doc.series}
                      onChange={(e) => updateRelatedDocument(doc.id, 'series', e.target.value.toUpperCase())}
                      className="w-24"
                      maxLength={4}
                    />
                    <span className="text-gray-400">-</span>
                    <Input
                      placeholder="Número"
                      value={doc.number}
                      onChange={(e) => updateRelatedDocument(doc.id, 'number', e.target.value)}
                      className="w-32"
                      maxLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => removeRelatedDocument(doc.id)}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sección: Datos de envío */}
          <div className="space-y-4 bg-pink-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 pb-2 border-b border-pink-200">
              <Truck className="w-5 h-5 text-pink-600" />
              <h3 className="font-semibold text-pink-800">Datos de envío</h3>
            </div>

            {/* Toggle Tipo de Transporte */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">TIPO DE TRANSPORTE:</span>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button
                  type="button"
                  onClick={() => setTransportMode('02')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    transportMode === '02'
                      ? 'bg-pink-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Privado
                </button>
                <button
                  type="button"
                  onClick={() => setTransportMode('01')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    transportMode === '01'
                      ? 'bg-gray-700 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Público
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                type="date"
                label="Fecha de inicio de traslado"
                required
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                min={issueDate || getLocalDateString()}
              />

              <Input
                label="Descripción del traslado"
                placeholder="Descripción opcional"
                value={transferDescription}
                onChange={(e) => setTransferDescription(e.target.value)}
              />

              <Select
                label="Und. del peso bruto"
                value={weightUnit}
                onChange={(e) => setWeightUnit(e.target.value)}
              >
                <option value="KGM">KGM</option>
                <option value="TNE">TNE</option>
              </Select>

              <Input
                type="number"
                label="Peso bruto total"
                placeholder="Ej: 25.5"
                required
                value={totalWeight}
                onChange={(e) => setTotalWeight(e.target.value)}
                step="0.01"
                min="0.01"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isM1LVehicle}
                onChange={(e) => setIsM1LVehicle(e.target.checked)}
                className="w-4 h-4 text-pink-600 border-gray-300 rounded focus:ring-pink-500"
              />
              <div>
                <span className="text-sm text-gray-700">
                  Traslado en vehículos de categoría M1 o L
                </span>
                <p className="text-xs text-gray-500">
                  (Motos, mototaxis, autos, taxis - hasta 8 asientos)
                </p>
              </div>
            </label>

            {isM1LVehicle && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">
                  <strong>Simplificado:</strong> Para vehículos M1 o L, los datos del conductor y placa son opcionales según normativa SUNAT.
                </p>
              </div>
            )}
          </div>

          {/* Datos del vehículo (solo transporte privado) */}
          {transportMode === '02' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <Truck className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-800">
                  Datos del vehículo
                  {isM1LVehicle && <span className="text-sm font-normal text-green-600 ml-2">(Opcional)</span>}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label={isM1LVehicle ? "Placa Principal (opcional)" : "Placa Principal"}
                  placeholder={isM1LVehicle ? "Ej: ABC-123 o dejar vacío" : "ABC-123"}
                  required={!isM1LVehicle}
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                />

                <Select
                  label="Entidad emisora autorización (opcional)"
                  value={vehicleAuthEntity}
                  onChange={(e) => setVehicleAuthEntity(e.target.value)}
                >
                  <option value="">Seleccione</option>
                  <option value="MTC">MTC</option>
                  <option value="SUTRAN">SUTRAN</option>
                </Select>

                <Input
                  label="N° de autorización vehicular (opcional)"
                  placeholder="Número de autorización"
                  value={vehicleAuthNumber}
                  onChange={(e) => setVehicleAuthNumber(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Datos del conductor (solo transporte privado) */}
          {transportMode === '02' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <User className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-800">
                  Datos del conductor
                  {isM1LVehicle && <span className="text-sm font-normal text-green-600 ml-2">(Opcional)</span>}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select
                  label={isM1LVehicle ? "Tipo de documento (opcional)" : "Tipo de documento"}
                  required={!isM1LVehicle}
                  value={driverDocType}
                  onChange={(e) => setDriverDocType(e.target.value)}
                >
                  {DOCUMENT_TYPES.filter(t => t.value !== '6').map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>

                <Input
                  label={isM1LVehicle ? "N° Doc. de identidad (opcional)" : "N° Doc. de identidad"}
                  placeholder="12345678"
                  required={!isM1LVehicle}
                  value={driverDocNumber}
                  onChange={(e) => setDriverDocNumber(e.target.value)}
                />

                <Input
                  label={isM1LVehicle ? "N° de licencia (opcional)" : "N° de licencia o brevete"}
                  placeholder="Q12345678"
                  required={!isM1LVehicle}
                  value={driverLicense}
                  onChange={(e) => setDriverLicense(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={isM1LVehicle ? "Nombre del conductor (opcional)" : "Nombre del conductor"}
                  placeholder="Juan"
                  required={!isM1LVehicle}
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                />

                <Input
                  label={isM1LVehicle ? "Apellido del conductor (opcional)" : "Apellido del conductor"}
                  placeholder="Pérez García"
                  required={!isM1LVehicle}
                  value={driverLastName}
                  onChange={(e) => setDriverLastName(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Datos del transportista (solo transporte público) */}
          {transportMode === '01' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <Truck className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-800">Datos del transportista</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RUC del Transportista <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="20123456789"
                      value={carrierRuc}
                      onChange={(e) => setCarrierRuc(e.target.value.replace(/\D/g, ''))}
                      maxLength={11}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <button
                      type="button"
                      onClick={handleSearchCarrierRuc}
                      disabled={isSearchingCarrier || carrierRuc.length !== 11}
                      className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[44px]"
                      title="Buscar datos del RUC"
                    >
                      {isSearchingCarrier ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Search className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <Input
                  label="Razón Social del Transportista"
                  placeholder="TRANSPORTES SAC"
                  required
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Otros datos adicionales (collapsible) */}
          <div className="border border-gray-200 rounded-lg">
            <button
              type="button"
              onClick={() => setShowAdditionalData(!showAdditionalData)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-primary-600">
                Otros datos adicionales
              </span>
              {showAdditionalData ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>

            {showAdditionalData && (
              <div className="p-4 border-t border-gray-200 space-y-4">
                <p className="text-sm text-gray-600">
                  Información adicional opcional para casos especiales
                </p>
              </div>
            )}
          </div>

          {/* Punto de partida / Punto de llegada (Tabs) */}
          <div className="space-y-4">
            <div className="flex border-b border-gray-200">
              <button
                type="button"
                onClick={() => setActiveLocationTab('origin')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeLocationTab === 'origin'
                    ? 'border-pink-500 text-pink-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Punto de partida
              </button>
              <button
                type="button"
                onClick={() => setActiveLocationTab('destination')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeLocationTab === 'destination'
                    ? 'border-cyan-500 text-cyan-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Punto de llegada
              </button>
            </div>

            {activeLocationTab === 'origin' && (
              <div className="space-y-4 p-4 bg-pink-50 rounded-lg">
                <Input
                  label="Dirección"
                  placeholder="Av. Principal 123"
                  required
                  value={originAddress}
                  onChange={(e) => setOriginAddress(e.target.value)}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Select
                    label="Departamento"
                    required
                    value={originDepartment}
                    onChange={(e) => {
                      setOriginDepartment(e.target.value)
                      setOriginProvince('')
                      setOriginDistrict('')
                    }}
                  >
                    <option value="">Seleccione</option>
                    {DEPARTAMENTOS.map(dept => (
                      <option key={dept.code} value={dept.code}>
                        {dept.name}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Provincia"
                    required
                    value={originProvince}
                    onChange={(e) => {
                      setOriginProvince(e.target.value)
                      setOriginDistrict('')
                    }}
                    disabled={!originDepartment}
                  >
                    <option value="">Seleccione</option>
                    {getProvincias(originDepartment).map(prov => (
                      <option key={prov.code} value={prov.code}>
                        {prov.name}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Distrito"
                    required
                    value={originDistrict}
                    onChange={(e) => setOriginDistrict(e.target.value)}
                    disabled={!originProvince}
                  >
                    <option value="">Seleccione</option>
                    {getDistritos(originDepartment, originProvince).map(dist => (
                      <option key={dist.code} value={dist.code}>
                        {dist.name}
                      </option>
                    ))}
                  </Select>
                </div>

                {originDepartment && originProvince && originDistrict && (
                  <p className="text-sm text-gray-600">
                    Ubigeo: {getUbigeo(originDepartment, originProvince, originDistrict)}
                  </p>
                )}
              </div>
            )}

            {activeLocationTab === 'destination' && (
              <div className="space-y-4 p-4 bg-cyan-50 rounded-lg">
                <Input
                  label="Dirección"
                  placeholder="Jr. Comercio 456"
                  required
                  value={destinationAddress}
                  onChange={(e) => setDestinationAddress(e.target.value)}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Select
                    label="Departamento"
                    required
                    value={destinationDepartment}
                    onChange={(e) => {
                      setDestinationDepartment(e.target.value)
                      setDestinationProvince('')
                      setDestinationDistrict('')
                    }}
                  >
                    <option value="">Seleccione</option>
                    {DEPARTAMENTOS.map(dept => (
                      <option key={dept.code} value={dept.code}>
                        {dept.name}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Provincia"
                    required
                    value={destinationProvince}
                    onChange={(e) => {
                      setDestinationProvince(e.target.value)
                      setDestinationDistrict('')
                    }}
                    disabled={!destinationDepartment}
                  >
                    <option value="">Seleccione</option>
                    {getProvincias(destinationDepartment).map(prov => (
                      <option key={prov.code} value={prov.code}>
                        {prov.name}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Distrito"
                    required
                    value={destinationDistrict}
                    onChange={(e) => setDestinationDistrict(e.target.value)}
                    disabled={!destinationProvince}
                  >
                    <option value="">Seleccione</option>
                    {getDistritos(destinationDepartment, destinationProvince).map(dist => (
                      <option key={dist.code} value={dist.code}>
                        {dist.name}
                      </option>
                    ))}
                  </Select>
                </div>

                {destinationDepartment && destinationProvince && destinationDistrict && (
                  <p className="text-sm text-gray-600">
                    Ubigeo: {getUbigeo(destinationDepartment, destinationProvince, destinationDistrict)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Bienes a transportar */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-800">Agregar bienes o productos a transportar</h3>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidad</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cod. SUNAT</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">GTIN</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bien norm.</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {items.map((item, index) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-sm text-gray-900">{index + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                            min="0.01"
                            step="0.01"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={item.unit}
                            onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            {UNIT_CODES.map(unit => (
                              <option key={unit.value} value={unit.value}>
                                {unit.value}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.code}
                            onChange={(e) => updateItem(item.id, 'code', e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Código"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                            className="w-40 px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Descripción"
                            required
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.sunatCode}
                            onChange={(e) => updateItem(item.id, 'sunatCode', e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Opcional"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.gtin}
                            onChange={(e) => updateItem(item.id, 'gtin', e.target.value)}
                            className="w-28 px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Opcional"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <label className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={item.isNormalized}
                              onChange={(e) => updateItem(item.id, 'isNormalized', e.target.checked)}
                              className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                            />
                          </label>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
            >
              <Plus className="w-4 h-4 mr-1" />
              Agregar lista de items
            </Button>
          </div>

          {/* Más información */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Más información
            </label>
            <textarea
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value.slice(0, 250))}
              placeholder="Información adicional (máximo 250 caracteres)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              rows={3}
              maxLength={250}
            />
            <p className="text-xs text-gray-500">
              ({additionalInfo.length}/250 caracteres) No se permita tecla enter en este casillero. Recomendamos no copiar y pegar información que tenga saltos de línea
            </p>
          </div>

        </div>

        {/* Footer con botones */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-lg">
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={isSaving}
                onClick={() => {
                  // Guardar como borrador (sin enviar a SUNAT)
                  toast.info('Función de guardar borrador próximamente')
                }}
              >
                Guardar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancelar
              </Button>
            </div>
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
              size="lg"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Emitiendo Guía...
                </>
              ) : (
                'Emitir Guía'
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-right">
            Campos obligatorios (*) - El formato PDF de guías de remisión es horizontal (**)
          </p>
        </div>
      </form>
    </Modal>
  )
}
