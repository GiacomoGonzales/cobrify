import React, { useState, useEffect } from 'react'
import { X, Truck, MapPin, User, Package, Calendar, FileText, Plus, Trash2, ChevronDown, ChevronUp, Store, AlertTriangle, Search, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/contexts/ToastContext'
import { useAppContext } from '@/hooks/useAppContext'
import { updateDispatchGuide, getCompanySettings, getCustomers, getProducts } from '@/services/firestoreService'
import { getActiveBranches } from '@/services/branchService'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
import SUNAT_UNITS, { normalizeSunatUnit } from '@/data/sunatUnits'
import { consultarRUC, consultarDNI } from '@/services/documentLookupService'

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

const UNIT_CODES = SUNAT_UNITS

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

// Extraer departamento, provincia, distrito de un ubigeo
const parseUbigeo = (ubigeo) => {
  if (!ubigeo || ubigeo.length !== 6) return { dept: '', prov: '', dist: '' }
  return {
    dept: ubigeo.substring(0, 2),
    prov: ubigeo.substring(2, 4),
    dist: ubigeo.substring(4, 6)
  }
}

export default function EditDispatchGuideModal({ isOpen, onClose, guide, onUpdated }) {
  const toast = useToast()
  const { getBusinessId, filterBranchesByAccess, user } = useAppContext()

  // Sucursales disponibles
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')

  // Datos básicos de la guía
  const [transferReason, setTransferReason] = useState('01')
  const [transportMode, setTransportMode] = useState('02')
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

  // Datos del vehículo (principal)
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [vehicleTuce, setVehicleTuce] = useState('')
  const [vehicleAuthEntity, setVehicleAuthEntity] = useState('')
  const [vehicleAuthNumber, setVehicleAuthNumber] = useState('')

  // Vehículos secundarios
  const [additionalVehicles, setAdditionalVehicles] = useState([])

  // Datos del conductor principal
  const [driverDocType, setDriverDocType] = useState('1')
  const [driverDocNumber, setDriverDocNumber] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverLastName, setDriverLastName] = useState('')
  const [driverLicense, setDriverLicense] = useState('')

  // Conductores secundarios
  const [additionalDrivers, setAdditionalDrivers] = useState([])

  // Datos de transporte público
  const [carrierRuc, setCarrierRuc] = useState('')
  const [carrierName, setCarrierName] = useState('')
  const [carrierMtcNumber, setCarrierMtcNumber] = useState('')
  const [registerVehiclesAndDrivers, setRegisterVehiclesAndDrivers] = useState(false)
  const [isSearchingCarrier, setIsSearchingCarrier] = useState(false)

  // Estado para búsqueda de destinatario
  const [isSearchingRecipient, setIsSearchingRecipient] = useState(false)

  // Items (productos)
  const [items, setItems] = useState([])
  const [products, setProducts] = useState([])

  // Más información
  const [additionalInfo, setAdditionalInfo] = useState('')

  // Otros datos adicionales (collapsible)
  const [showAdditionalData, setShowAdditionalData] = useState(false)

  const [isSaving, setIsSaving] = useState(false)

  // Clientes registrados (para autocompletado del destinatario)
  const [customers, setCustomers] = useState([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Verificar si la guía ya fue enviada a SUNAT
  const isAlreadySent = guide?.sunatStatus === 'accepted' || guide?.sunatStatus === 'rejected'

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

  // Cargar clientes registrados
  useEffect(() => {
    const loadCustomers = async () => {
      if (!user?.uid || !isOpen) return
      try {
        const businessId = getBusinessId()
        const result = await getCustomers(businessId)
        if (result.success) {
          setCustomers(result.data || [])
        }
      } catch (error) {
        console.error('Error al cargar clientes:', error)
      }
    }
    loadCustomers()
  }, [isOpen, user?.uid, getBusinessId])

  // Cargar productos para obtener datos de series
  useEffect(() => {
    const loadProducts = async () => {
      if (!user?.uid || !isOpen) return
      try {
        const result = await getProducts(getBusinessId())
        if (result.success) setProducts(result.data || [])
      } catch (error) {
        console.error('Error al cargar productos:', error)
      }
    }
    loadProducts()
  }, [isOpen, user?.uid, getBusinessId])

  // Filtrar clientes según lo que escribe el usuario en Razón Social
  const filteredCustomers = recipientName.length >= 2
    ? customers.filter(c => {
        const searchLower = recipientName.toLowerCase()
        return (
          c.name?.toLowerCase().includes(searchLower) ||
          c.businessName?.toLowerCase().includes(searchLower) ||
          c.documentNumber?.includes(recipientName)
        )
      }).slice(0, 5)
    : []

  // Cargar datos de la guía cuando se abre el modal
  useEffect(() => {
    if (!isOpen || !guide) return

    console.log('📝 Cargando datos de guía para edición:', guide)

    // Sucursal
    setSelectedBranchId(guide.branchId || '')

    // Datos básicos
    setTransferReason(guide.transferReason || '01')
    setTransportMode(guide.transportMode || '02')
    setTransferDescription(guide.transferDescription || '')
    setTotalWeight(guide.totalWeight?.toString() || '')
    setWeightUnit(guide.weightUnit || 'KGM')
    setIsM1LVehicle(guide.isM1LVehicle || false)
    setAdditionalInfo(guide.additionalInfo || '')

    // Helper para convertir fecha a YYYY-MM-DD sin perder día por timezone
    const toLocalDateStr = (val) => {
      if (!val) return ''
      if (typeof val === 'string') return val.split('T')[0]
      const d = val.toDate ? val.toDate() : (val instanceof Date ? val : new Date(val))
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    // Fecha de emisión
    if (guide.issueDate) {
      setIssueDate(toLocalDateStr(guide.issueDate))
    }

    // Fecha de traslado
    if (guide.transferDate) {
      setTransferDate(toLocalDateStr(guide.transferDate))
    }

    // Destinatario
    const recipient = guide.recipient || guide.customer || {}
    let docType = recipient.documentType || '6'
    if (docType === 'RUC') docType = '6'
    else if (docType === 'DNI') docType = '1'
    setRecipientDocType(docType)
    setRecipientDocNumber(recipient.documentNumber || '')
    setRecipientName(recipient.name || recipient.businessName || '')
    setRecipientAddress(recipient.address || '')
    setRecipientEmail(recipient.email || '')

    // Ubigeo del destinatario
    const recipientUbigeo = parseUbigeo(recipient.ubigeo)
    setRecipientDepartment(recipientUbigeo.dept)
    setRecipientProvince(recipientUbigeo.prov)
    setRecipientDistrict(recipientUbigeo.dist)

    // Documentos relacionados
    if (guide.relatedDocuments && guide.relatedDocuments.length > 0) {
      setRelatedDocuments(guide.relatedDocuments.map((doc, idx) => ({
        id: idx + 1,
        type: doc.type || '01',
        series: doc.series || '',
        number: doc.number || '',
      })))
    } else {
      setRelatedDocuments([])
    }

    // Origen
    setOriginAddress(guide.origin?.address || '')
    const originUbigeo = parseUbigeo(guide.origin?.ubigeo)
    setOriginDepartment(guide.origin?.department || originUbigeo.dept)
    setOriginProvince(guide.origin?.province || originUbigeo.prov)
    setOriginDistrict(guide.origin?.district || originUbigeo.dist)

    // Destino
    setDestinationAddress(guide.destination?.address || '')
    const destUbigeo = parseUbigeo(guide.destination?.ubigeo)
    setDestinationDepartment(guide.destination?.department || destUbigeo.dept)
    setDestinationProvince(guide.destination?.province || destUbigeo.prov)
    setDestinationDistrict(guide.destination?.district || destUbigeo.dist)

    // Transporte privado
    const driver = guide.transport?.driver || guide.driver || {}
    let driverDocT = driver.documentType || '1'
    if (driverDocT === 'DNI') driverDocT = '1'
    setDriverDocType(driverDocT)
    setDriverDocNumber(driver.documentNumber || '')
    setDriverName(driver.name || driver.names || '')
    setDriverLastName(driver.lastName || driver.lastNames || '')
    setDriverLicense((driver.license || '').toUpperCase())

    // Vehículo
    const vehicle = guide.transport?.vehicle || guide.vehicle || {}
    setVehiclePlate((vehicle.plate || '').replace(/[-\s]/g, '').toUpperCase())
    setVehicleTuce(vehicle.tuce || '')
    setVehicleAuthEntity(vehicle.authorizationEntity || '')
    setVehicleAuthNumber(vehicle.authorizationNumber || '')

    // Vehículos secundarios
    setAdditionalVehicles(Array.isArray(guide.transport?.additionalVehicles) ? guide.transport.additionalVehicles : [])

    // Conductores secundarios
    setAdditionalDrivers(Array.isArray(guide.transport?.additionalDrivers) ? guide.transport.additionalDrivers : [])

    // Transporte público
    const carrier = guide.transport?.carrier || guide.carrier || {}
    setCarrierRuc(carrier.ruc || '')
    setCarrierName(carrier.businessName || carrier.name || '')
    setCarrierMtcNumber(carrier.mtcNumber || '')
    setRegisterVehiclesAndDrivers(carrier.registerVehiclesAndDrivers === true)

    // Items
    if (guide.items && guide.items.length > 0) {
      setItems(guide.items.map((item, idx) => ({
        id: item.id || idx + 1,
        productId: item.productId || '',
        code: item.sku || item.code || '',
        description: item.description || item.name || '',
        quantity: item.quantity || 0,
        unit: normalizeSunatUnit(item.unit),
        sunatCode: item.sunatCode || '',
        gtin: item.gtin || '',
        subpCode: item.subpCode || '',
        isNormalized: item.isNormalized || false,
        batchNumber: item.batchNumber || '',
        batchExpiryDate: item.batchExpiryDate || '',
        marca: item.marca || '',
        laboratoryName: item.laboratoryName || '',
        serialNumber: item.serialNumber || '',
        trackSerials: false,
        serials: [],
      })))
      // Hidratar datos de series desde productos cargados
      if (products.length > 0) {
        setItems(prev => prev.map(item => {
          if (!item.productId) return item
          const product = products.find(p => p.id === item.productId)
          if (!product) return item
          return {
            ...item,
            trackSerials: product.trackSerials || false,
            serials: product.serials || [],
          }
        }))
      }
    } else {
      setItems([])
    }

  }, [guide, isOpen, products])

  // Obtener ubigeo completo
  const getUbigeo = (dept, prov, dist) => {
    if (dept && prov && dist) {
      return `${dept}${prov}${dist}`
    }
    return ''
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

  // Buscar datos del destinatario por RUC o DNI
  const handleSearchRecipient = async () => {
    const docNumber = recipientDocNumber.trim()

    if (recipientDocType === '6') {
      // RUC
      if (docNumber.length !== 11) {
        toast.error('Ingrese un RUC válido de 11 dígitos')
        return
      }
      setIsSearchingRecipient(true)
      try {
        const result = await consultarRUC(docNumber)
        if (result.success) {
          setRecipientName(result.data.razonSocial || '')
          if (result.data.direccion) setRecipientAddress(result.data.direccion)
          toast.success('Datos encontrados')
        } else {
          toast.error(result.error || 'No se encontraron datos')
        }
      } catch (error) {
        console.error('Error al buscar RUC:', error)
        toast.error('Error al consultar')
      } finally {
        setIsSearchingRecipient(false)
      }
    } else if (recipientDocType === '1') {
      // DNI
      if (docNumber.length !== 8) {
        toast.error('Ingrese un DNI válido de 8 dígitos')
        return
      }
      setIsSearchingRecipient(true)
      try {
        const result = await consultarDNI(docNumber)
        if (result.success) {
          const fullName = [result.data.nombres, result.data.apellidoPaterno, result.data.apellidoMaterno]
            .filter(Boolean).join(' ')
          setRecipientName(fullName || result.data.nombreCompleto || '')
          toast.success('Datos encontrados')
        } else {
          toast.error(result.error || 'No se encontraron datos')
        }
      } catch (error) {
        console.error('Error al buscar DNI:', error)
        toast.error('Error al consultar')
      } finally {
        setIsSearchingRecipient(false)
      }
    } else {
      toast.error('La búsqueda solo está disponible para RUC y DNI')
    }
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
      if (!isM1LVehicle) {
        if (!driverDocNumber || !driverName || !driverLastName || !driverLicense || !vehiclePlate) {
          toast.error('Debe completar todos los datos del conductor y vehículo para transporte privado')
          return
        }
      }
      // Validar formato de placa (6 caracteres alfanuméricos sin guiones)
      if (vehiclePlate) {
        const plateRegex = /^[A-Z0-9]{6}$/
        if (!plateRegex.test(vehiclePlate.trim())) {
          toast.error(`Formato de placa inválido: ${vehiclePlate}. Use 6 caracteres sin guiones, ej: ABC123`)
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

      const updates = {
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
            tuce: vehicleTuce || null,
            authorizationEntity: vehicleAuthEntity || null,
            authorizationNumber: vehicleAuthNumber || null,
          },
          additionalVehicles: additionalVehicles.filter(v => v.plate?.trim()),
          additionalDrivers: additionalDrivers.filter(d => d.documentNumber?.trim()),
        } : {
          carrier: {
            ruc: carrierRuc,
            businessName: carrierName,
            mtcNumber: carrierMtcNumber || null,
            registerVehiclesAndDrivers,
          },
          ...(registerVehiclesAndDrivers ? {
            vehicle: {
              plate: vehiclePlate,
              tuce: vehicleTuce || null,
              authorizationEntity: vehicleAuthEntity || null,
              authorizationNumber: vehicleAuthNumber || null,
            },
            driver: {
              documentType: driverDocType,
              documentNumber: driverDocNumber,
              name: driverName,
              lastName: driverLastName,
              license: driverLicense,
            },
            additionalVehicles: additionalVehicles.filter(v => v.plate?.trim()),
            additionalDrivers: additionalDrivers.filter(d => d.documentNumber?.trim()),
          } : {}),
        },

        items: items.map((item, index) => {
          const { serials, trackSerials, ...rest } = item
          return { ...rest, lineNumber: index + 1 }
        }),

        additionalInfo,
        branchId: selectedBranchId || null,
        branchName: selectedBranchId ? branches.find(b => b.id === selectedBranchId)?.name || null : null,
      }

      console.log('Actualizando guía de remisión:', updates)

      const result = await updateDispatchGuide(businessId, guide.id, updates)

      if (result.success) {
        toast.success('Guía de remisión actualizada correctamente')
        onUpdated?.()
        onClose()
      } else {
        throw new Error(result.error || 'Error al actualizar la guía')
      }

    } catch (error) {
      console.error('Error al actualizar guía de remisión:', error)
      toast.error(error.message || 'Error al actualizar la guía de remisión')
    } finally {
      setIsSaving(false)
    }
  }

  if (!guide) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="7xl">
      {/* Header compacto */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Editar Guía de Remisión</h2>
          <span className="text-xs text-gray-500">· {guide.number}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">Emisión: <span className="font-medium text-gray-700">{issueDate || '-'}</span></span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Alerta si ya fue enviada */}
      {isAlreadySent && (
        <div className="mx-5 mt-3 p-2.5 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-yellow-800">Guía ya procesada por SUNAT</p>
              <p className="text-yellow-700 mt-0.5">
                Esta guía ya fue enviada a SUNAT. Los cambios que realice solo se guardarán localmente para referencia.
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col max-h-[calc(92vh-4rem)]">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm [&_label]:!text-[11px] [&_label]:!font-medium [&_label]:!text-gray-600 [&_label]:!mb-0.5 [&_input]:!py-1.5 [&_input]:!text-sm [&_select]:!py-1.5 [&_select]:!text-sm [&_textarea]:!py-1.5 [&_textarea]:!text-sm">

          {/* Selector de Sucursal */}
          {branches.length > 0 && (
            <div className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg">
              <Store className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 max-w-xs">
                <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Sucursal de origen</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm"
                >
                  <option value="">Sucursal Principal</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Sección: Destinatario */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1.5 border-b border-gray-200">
              <User className="w-4 h-4 text-gray-400" />
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nro. de Documento <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={recipientDocType === '6' ? '20123456789' : '12345678'}
                    required
                    value={recipientDocNumber}
                    onChange={(e) => setRecipientDocNumber(e.target.value)}
                    maxLength={recipientDocType === '6' ? 11 : 15}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <button
                    type="button"
                    onClick={handleSearchRecipient}
                    disabled={isSearchingRecipient || (recipientDocType === '6' ? recipientDocNumber.length !== 11 : recipientDocNumber.length !== 8)}
                    className="px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    title="Buscar datos"
                  >
                    {isSearchingRecipient ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Search className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="relative">
                <Input
                  label="Razón Social"
                  placeholder="Nombre o razón social del destinatario"
                  required
                  value={recipientName}
                  onChange={(e) => {
                    setRecipientName(e.target.value)
                    setShowCustomerDropdown(true)
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                />
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredCustomers.map(customer => (
                      <button
                        key={customer.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setRecipientName(customer.name || customer.businessName || '')
                          setRecipientDocNumber(customer.documentNumber || '')
                          if (customer.documentType === 'RUC' || customer.documentType === '6' || customer.documentNumber?.length === 11) {
                            setRecipientDocType('6')
                          } else if (customer.documentType === 'DNI' || customer.documentType === '1' || customer.documentNumber?.length === 8) {
                            setRecipientDocType('1')
                          } else if (customer.documentType === 'CE' || customer.documentType === '4') {
                            setRecipientDocType('4')
                          }
                          if (customer.address) setRecipientAddress(customer.address)
                          if (customer.email) setRecipientEmail(customer.email)
                          setShowCustomerDropdown(false)
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <p className="font-medium text-gray-900 truncate">{customer.name || customer.businessName}</p>
                        <p className="text-xs text-gray-500">{customer.documentNumber}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                <FileText className="w-4 h-4 text-gray-400" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Documentos Relacionados</h3>
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
                  <div key={doc.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 bg-gray-50 rounded-md">
                    <Select
                      value={doc.type}
                      onChange={(e) => updateRelatedDocument(doc.id, 'type', e.target.value)}
                      className="w-full sm:w-40"
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
                      className="flex-1 sm:w-24 sm:flex-none min-w-0"
                      maxLength={4}
                    />
                    <span className="hidden sm:inline text-gray-400">-</span>
                    <Input
                      placeholder="Número"
                      value={doc.number}
                      onChange={(e) => updateRelatedDocument(doc.id, 'number', e.target.value)}
                      className="flex-1 sm:w-32 sm:flex-none min-w-0"
                      maxLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => removeRelatedDocument(doc.id)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sección: Datos de envío */}
          <div className="space-y-3 p-3 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2 pb-1.5 border-b border-gray-200">
              <Truck className="w-4 h-4 text-gray-400" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Datos de envío</h3>
            </div>

            {/* Toggle Tipo de Transporte */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">TIPO DE TRANSPORTE:</span>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button
                  type="button"
                  onClick={() => setTransportMode('02')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    transportMode === '02'
                      ? 'bg-gray-700 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Privado
                </button>
                <button
                  type="button"
                  onClick={() => setTransportMode('01')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
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
              <p className="text-xs text-gray-500 italic">
                Para vehículos M1 o L, los datos del conductor y placa son opcionales según normativa SUNAT.
              </p>
            )}
          </div>

          {/* Datos del transportista (solo transporte público) */}
          {transportMode === '01' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1.5 border-b border-gray-200">
                <Truck className="w-4 h-4 text-gray-400" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Datos del transportista</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RUC del Transportista <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="20123456789"
                      value={carrierRuc}
                      onChange={(e) => setCarrierRuc(e.target.value)}
                      maxLength={11}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    />
                    <button
                      type="button"
                      onClick={handleSearchCarrierRuc}
                      disabled={isSearchingCarrier || carrierRuc.length !== 11}
                      className="px-3 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      title="Buscar RUC"
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

                <Input
                  label="N° Registro MTC (opcional)"
                  placeholder="Ej: 0413189CNG"
                  value={carrierMtcNumber}
                  onChange={(e) => setCarrierMtcNumber(e.target.value.toUpperCase())}
                />
              </div>

              <label className="flex items-start gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-md cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={registerVehiclesAndDrivers}
                  onChange={(e) => setRegisterVehiclesAndDrivers(e.target.checked)}
                />
                <div>
                  <p className="text-xs font-medium text-gray-700">Registrar vehículos y conductores del transportista</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Si lo activas, podrás registrar aquí los datos del vehículo y conductor del transportista (útil
                    cuando el tercero no emite su propia Guía de Remisión Transportista).
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Datos del vehículo (privado o público con indicador activo) */}
          {(transportMode === '02' || (transportMode === '01' && registerVehiclesAndDrivers)) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1.5 border-b border-gray-200">
                <Truck className="w-4 h-4 text-gray-400" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Datos del vehículo principal
                  {isM1LVehicle && <span className="text-sm font-normal text-green-600 ml-2">(Opcional)</span>}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={isM1LVehicle ? "Placa Principal (opcional)" : "Placa Principal"}
                  placeholder={isM1LVehicle ? "Ej: ABC123 o dejar vacío" : "ABC123"}
                  required={!isM1LVehicle}
                  maxLength={6}
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.replace(/[-\s]/g, '').toUpperCase())}
                />

                <Input
                  label="TUCE / Certificado de Habilitación Vehicular (opcional)"
                  placeholder="Número de tarjeta/certificado"
                  value={vehicleTuce}
                  onChange={(e) => setVehicleTuce(e.target.value.toUpperCase())}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              {/* Aviso SUNAT 3452 — ver comentario homólogo en CreateDispatchGuideModal */}
              {vehicleAuthNumber.trim() && (isM1LVehicle || (transportMode === '01' && !registerVehiclesAndDrivers)) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Este número de autorización será omitido al enviar a SUNAT</p>
                    <p className="mt-0.5">
                      {isM1LVehicle
                        ? 'No aplica para vehículos categoría M1/L.'
                        : 'En transporte público solo aplica si activas "registrar vehículos del transportista".'}
                      {' '}La autorización especial es solo para permisos MTC de carga peligrosa, sobredimensionada o similar (regla SUNAT 3452).
                    </p>
                  </div>
                </div>
              )}

              {/* Vehículos secundarios */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">Vehículos secundarios</h4>
                  <button
                    type="button"
                    onClick={() => setAdditionalVehicles(prev => [...prev, { plate: '', tuce: '', authEntity: '', authorizationNumber: '' }])}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar vehículo
                  </button>
                </div>
                {additionalVehicles.length === 0 && (
                  <p className="text-xs text-gray-500">Sin vehículos secundarios. Agrega uno si llevas tracto + carreta, etc.</p>
                )}
                {additionalVehicles.map((v, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">Vehículo secundario #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => setAdditionalVehicles(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-700"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input
                        label="Placa"
                        placeholder="ABC123"
                        maxLength={6}
                        value={v.plate || ''}
                        onChange={(e) => setAdditionalVehicles(prev => prev.map((x, i) => i === idx ? { ...x, plate: e.target.value.replace(/[-\s]/g, '').toUpperCase() } : x))}
                      />
                      <Input
                        label="TUCE / Certificado (opcional)"
                        placeholder="Número de tarjeta/certificado"
                        value={v.tuce || ''}
                        onChange={(e) => setAdditionalVehicles(prev => prev.map((x, i) => i === idx ? { ...x, tuce: e.target.value.toUpperCase() } : x))}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Select
                        label="Entidad emisora (opcional)"
                        value={v.authEntity || ''}
                        onChange={(e) => setAdditionalVehicles(prev => prev.map((x, i) => i === idx ? { ...x, authEntity: e.target.value } : x))}
                      >
                        <option value="">Seleccione</option>
                        <option value="MTC">MTC</option>
                        <option value="SUTRAN">SUTRAN</option>
                      </Select>
                      <Input
                        label="N° autorización (opcional)"
                        placeholder="Número de autorización"
                        value={v.authorizationNumber || ''}
                        onChange={(e) => setAdditionalVehicles(prev => prev.map((x, i) => i === idx ? { ...x, authorizationNumber: e.target.value } : x))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Datos del conductor (privado o público con indicador activo) */}
          {(transportMode === '02' || (transportMode === '01' && registerVehiclesAndDrivers)) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1.5 border-b border-gray-200">
                <User className="w-4 h-4 text-gray-400" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Datos del conductor principal
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
                  placeholder={
                    driverDocType === '1' ? '12345678'
                    : driverDocType === '4' ? '001234567'
                    : 'ABC123456'
                  }
                  maxLength={driverDocType === '1' ? 8 : 12}
                  required={!isM1LVehicle}
                  value={driverDocNumber}
                  onChange={(e) => setDriverDocNumber(e.target.value)}
                />

                <Input
                  label={isM1LVehicle ? "N° de licencia (opcional)" : "N° de licencia o brevete"}
                  placeholder="Q12345678"
                  maxLength={10}
                  required={!isM1LVehicle}
                  value={driverLicense}
                  onChange={(e) => setDriverLicense(e.target.value.toUpperCase())}
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

              {/* Conductores secundarios */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">Conductores secundarios (relevo)</h4>
                  <button
                    type="button"
                    onClick={() => setAdditionalDrivers(prev => [...prev, { documentType: '1', documentNumber: '', name: '', lastName: '', license: '' }])}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar conductor
                  </button>
                </div>
                {additionalDrivers.length === 0 && (
                  <p className="text-xs text-gray-500">Sin conductores adicionales.</p>
                )}
                {additionalDrivers.map((d, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">Conductor secundario #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => setAdditionalDrivers(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-700"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Select
                        label="Tipo documento"
                        value={d.documentType || '1'}
                        onChange={(e) => setAdditionalDrivers(prev => prev.map((x, i) => i === idx ? { ...x, documentType: e.target.value } : x))}
                      >
                        {DOCUMENT_TYPES.filter(t => t.value !== '6').map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </Select>
                      <Input
                        label="N° documento"
                        value={d.documentNumber || ''}
                        onChange={(e) => setAdditionalDrivers(prev => prev.map((x, i) => i === idx ? { ...x, documentNumber: e.target.value } : x))}
                      />
                      <Input
                        label="N° licencia"
                        value={d.license || ''}
                        onChange={(e) => setAdditionalDrivers(prev => prev.map((x, i) => i === idx ? { ...x, license: e.target.value.toUpperCase() } : x))}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input
                        label="Nombres"
                        value={d.name || ''}
                        onChange={(e) => setAdditionalDrivers(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                      />
                      <Input
                        label="Apellidos"
                        value={d.lastName || ''}
                        onChange={(e) => setAdditionalDrivers(prev => prev.map((x, i) => i === idx ? { ...x, lastName: e.target.value } : x))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              <div className="space-y-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
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
              <div className="space-y-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
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
                <Package className="w-4 h-4 text-gray-400" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Bienes a transportar ({items.length})</h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar item
              </Button>
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
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {items.map((item, index) => (
                      <React.Fragment key={item.id}>
                      <tr>
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
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {item.trackSerials && item.productId && (() => {
                        const warehouseId = guide?.warehouseId || ''
                        const availableSerials = (item.serials || []).filter(s =>
                          (s.status === 'available' || s.serialNumber === item.serialNumber) && (!s.warehouseId || !warehouseId || s.warehouseId === warehouseId)
                        )
                        const usedSerials = items.filter(i => i.id !== item.id && i.serialNumber).map(i => i.serialNumber)
                        const filteredSerials = availableSerials.filter(s => !usedSerials.includes(s.serialNumber) || s.serialNumber === item.serialNumber)
                        if (filteredSerials.length === 0) return null
                        return (
                          <tr className="bg-amber-50/50">
                            <td colSpan={6} className="px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-amber-700">S/N:</span>
                                <select
                                  value={item.serialNumber || ''}
                                  onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, serialNumber: e.target.value, quantity: e.target.value ? 1 : i.quantity } : i))}
                                  className={`px-2 py-1 border rounded text-xs ${!item.serialNumber ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}
                                >
                                  <option value="">Seleccionar serie...</option>
                                  {filteredSerials.map(s => (
                                    <option key={s.id} value={s.serialNumber}>{s.serialNumber}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          </tr>
                        )
                      })()}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
              ({additionalInfo.length}/250 caracteres)
            </p>
          </div>

        </div>

        {/* Footer compacto */}
        <div className="border-t border-gray-200 px-5 py-3 bg-gray-50 rounded-b-lg">
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:justify-end sm:items-center [&>button]:w-full sm:[&>button]:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                  Guardando...
                </>
              ) : (
                <>
                  <Truck className="w-3.5 h-3.5 mr-1.5" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
