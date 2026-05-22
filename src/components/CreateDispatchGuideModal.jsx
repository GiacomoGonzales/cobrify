import { useState, useEffect } from 'react'
import { X, Truck, MapPin, User, Package, Calendar, FileText, Plus, Trash2, ChevronDown, ChevronUp, Store, Search, Loader2, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/contexts/ToastContext'
import { useAppContext } from '@/hooks/useAppContext'
import { createDispatchGuide, getCompanySettings, sendDispatchGuideToSunat, getProducts, getCustomers } from '@/services/firestoreService'
import { getBranch, getActiveBranches } from '@/services/branchService'
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

export default function CreateDispatchGuideModal({ isOpen, onClose, referenceInvoice = null, selectedBranch = null, cloneData = null }) {
  const toast = useToast()
  const { getBusinessId, filterBranchesByAccess, allowedBranches, user, businessMode, businessSettings } = useAppContext()
  const isPharmacy = businessMode === 'pharmacy'
  const hasBatchControl = isPharmacy || businessSettings?.posCustomFields?.showBatchExpiryInPurchase

  // Sucursales y almacenes disponibles
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [deductStock, setDeductStock] = useState(false)

  // Verificar si el usuario tiene acceso a la sucursal principal
  const hasMainAccess = !allowedBranches || allowedBranches.length === 0 || allowedBranches.includes('main')

  // Datos básicos de la guía
  const [transferReason, setTransferReason] = useState('01')
  const [transportMode, setTransportMode] = useState('02') // 02=Privado, 01=Público
  const [issueDate, setIssueDate] = useState('')
  const [transferDate, setTransferDate] = useState('')
  const [transferDescription, setTransferDescription] = useState('')
  const [totalWeight, setTotalWeight] = useState('')
  const [weightUnit, setWeightUnit] = useState('KGM')
  const [weightManuallyEdited, setWeightManuallyEdited] = useState(false)
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

  // Vehículos secundarios (tracto + carreta, etc.) — cada uno con placa, TUCE y autorización
  const [additionalVehicles, setAdditionalVehicles] = useState([])

  // Datos del conductor principal
  const [driverDocType, setDriverDocType] = useState('1')
  const [driverDocNumber, setDriverDocNumber] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverLastName, setDriverLastName] = useState('')
  const [driverLicense, setDriverLicense] = useState('')

  // Conductores secundarios (relevo)
  const [additionalDrivers, setAdditionalDrivers] = useState([])

  // Datos de transporte público
  const [carrierRuc, setCarrierRuc] = useState('')
  const [carrierName, setCarrierName] = useState('')
  const [carrierMtcNumber, setCarrierMtcNumber] = useState('')
  // Indicador "registrar vehículos y conductores del transportista" (modo público)
  const [registerVehiclesAndDrivers, setRegisterVehiclesAndDrivers] = useState(false)
  const [isSearchingCarrier, setIsSearchingCarrier] = useState(false)
  const [isSearchingRecipient, setIsSearchingRecipient] = useState(false)

  // Items (productos)
  const [items, setItems] = useState([])

  // Más información
  const [additionalInfo, setAdditionalInfo] = useState('')

  // Otros datos adicionales (collapsible)
  const [showAdditionalData, setShowAdditionalData] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [autoSendToSunat, setAutoSendToSunat] = useState(false)

  // Mapa de productos y lista (para búsqueda y lotes en farmacia)
  const [productsMap, setProductsMap] = useState({})
  const [productsList, setProductsList] = useState([])
  const [showProductSearch, setShowProductSearch] = useState(null) // índice del item con búsqueda abierta

  // Clientes registrados (para autocompletado del destinatario)
  const [customers, setCustomers] = useState([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

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
      setWeightManuallyEdited(false)
      setDriverDocType('1')
      setDriverDocNumber('')
      setDriverName('')
      setDriverLicense('')
      setVehiclePlate('')
      setVehicleTuce('')
      setVehicleAuthEntity('')
      setVehicleAuthNumber('')
      setAdditionalVehicles([])
      setAdditionalDrivers([])
      setCarrierMtcNumber('')
      setRegisterVehiclesAndDrivers(false)
      setIsM1LVehicle(false)
    }
  }, [isOpen])

  // Inicializar fechas cuando se abre el modal (sin referenceInvoice ni cloneData)
  useEffect(() => {
    if (isOpen && !referenceInvoice && !cloneData) {
      // Inicializar fecha de emisión con la fecha actual de Perú (hoy)
      setIssueDate(getLocalDateString(0))
      // Inicializar fecha de traslado para hoy (el usuario puede cambiarla)
      setTransferDate(getLocalDateString(0))
    }
  }, [isOpen, referenceInvoice, cloneData])

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

  // Cargar almacenes disponibles
  useEffect(() => {
    const loadWarehouses = async () => {
      if (!user?.uid || !isOpen) return
      try {
        const { getWarehouses } = await import('@/services/warehouseService')
        const result = await getWarehouses(getBusinessId())
        if (result.success) {
          let whs = (result.data || []).filter(w => w.isActive !== false)
          // Filtrar por sucursal si hay una seleccionada
          if (selectedBranchId) {
            whs = whs.filter(w => w.branchId === selectedBranchId || !w.branchId)
          }
          setWarehouses(whs)
          // Auto-seleccionar primer almacén
          if (whs.length > 0 && !selectedWarehouseId) {
            setSelectedWarehouseId(whs[0].id)
          }
        }
      } catch (error) {
        console.error('Error al cargar almacenes:', error)
      }
    }
    loadWarehouses()
  }, [isOpen, user?.uid, selectedBranchId])

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

  // Inicializar sucursal seleccionada
  useEffect(() => {
    if (referenceInvoice?.branchId) {
      setSelectedBranchId(referenceInvoice.branchId)
    } else if (selectedBranch?.id) {
      setSelectedBranchId(selectedBranch.id)
    } else if (!hasMainAccess && branches.length > 0) {
      // Si no tiene acceso a main, auto-seleccionar la primera sucursal permitida
      setSelectedBranchId(branches[0].id)
    } else {
      setSelectedBranchId('')
    }
  }, [referenceInvoice?.branchId, selectedBranch?.id, isOpen, hasMainAccess, branches])

  // Pre-llenar datos si hay factura de referencia
  useEffect(() => {
    if (referenceInvoice) {
      // Si viene de una venta (no compra), desactivar descuento de stock porque ya se descontó con la factura
      if (!referenceInvoice.isPurchase) {
        setDeductStock(false)
      }
      // Cargar productos para obtener SKU actualizado
      const loadItemsWithSku = async () => {
        const businessId = getBusinessId()
        let pMap = {}

        // Buscar productos para obtener SKU actualizado
        if (businessId) {
          try {
            const result = await getProducts(businessId)
            if (result.success && result.data) {
              result.data.forEach(p => {
                pMap[p.id] = p
              })
              setProductsMap(pMap)
              setProductsList(result.data)
            }
          } catch (error) {
            console.error('Error cargando productos:', error)
          }
        }

        // Pre-llenar items usando SKU del producto original
        const invoiceItems = referenceInvoice.items?.map((item, index) => {
          // Buscar SKU del producto original
          const product = item.productId ? pMap[item.productId] : null
          const sku = product?.sku || item.sku || item.code || ''

          // En farmacia, auto-seleccionar el lote FEFO (primer vencimiento)
          let batchNumber = ''
          let batchExpiryDate = ''
          if (hasBatchControl && product?.batches && Array.isArray(product.batches)) {
            const availableBatches = product.batches
              .filter(b => b.quantity > 0 && !b.isExpired && (!selectedWarehouseId || !b.warehouseId || b.warehouseId === selectedWarehouseId))
              .sort((a, b) => {
                const dA = a.expiryDate?.toDate?.() || new Date(a.expiryDate || '2099-12-31')
                const dB = b.expiryDate?.toDate?.() || new Date(b.expiryDate || '2099-12-31')
                return dA - dB
              })
            if (availableBatches.length > 0) {
              const fefo = availableBatches[0]
              batchNumber = fefo.lotNumber || fefo.batchNumber || ''
              batchExpiryDate = fefo.expiryDate || fefo.expirationDate || ''
            }
          }

          const desc = item.description || item.name || ''
          return {
            id: index + 1,
            productId: item.productId || '',
            code: sku,
            description: desc,
            searchTerm: desc,
            quantity: item.quantity || 0,
            unit: normalizeSunatUnit(item.unit),
            sunatCode: '',
            gtin: '',
            subpCode: '',
            isNormalized: false,
            batchNumber,
            batchExpiryDate,
            marca: product?.marca || item.marca || '',
            laboratoryName: product?.laboratoryName || item.laboratoryName || '',
            trackSerials: product?.trackSerials || false,
            serials: product?.serials || [],
            serialNumber: item.serialNumber || '',
          }
        }) || []

        setItems(invoiceItems)

        // Calcular peso estimado usando el peso unitario de cada producto
        const estimatedWeight = (referenceInvoice.items || []).reduce((sum, item) => {
          const product = item.productId ? pMap[item.productId] : null
          return sum + ((item.quantity || 0) * (product?.weight || 0))
        }, 0)
        setTotalWeight(estimatedWeight.toString())
      }

      loadItemsWithSku()

      // Pre-llenar motivo de traslado si viene en la referencia
      if (referenceInvoice.transferReason) {
        setTransferReason(referenceInvoice.transferReason)
      }

      // Pre-llenar descripción del traslado si viene en la referencia
      if (referenceInvoice.transferDescription) {
        setTransferDescription(referenceInvoice.transferDescription)
      }

      // Pre-llenar fechas (usando hora de Perú)
      setIssueDate(getLocalDateString(0))  // Hoy
      setTransferDate(getLocalDateString(0))  // Hoy (el usuario puede cambiar)

      // Pre-llenar datos según si es compra o venta
      if (referenceInvoice.isPurchase) {
        // COMPRA: El proveedor es el ORIGEN, mi empresa es el DESTINATARIO
        const supplier = referenceInvoice.supplier

        if (supplier) {
          // Dirección del proveedor va al punto de partida (origen)
          setOriginAddress(supplier.address || '')
        }

        // El destinatario será mi propia empresa - se carga desde companySettings
        // Lo cargamos aquí mismo para tenerlo listo
        const loadCompanyAsRecipient = async () => {
          try {
            const businessId = getBusinessId()
            const companyResult = await getCompanySettings(businessId)
            if (companyResult.success && companyResult.data) {
              const company = companyResult.data
              setRecipientDocType('6') // RUC
              setRecipientDocNumber(company.ruc || '')
              setRecipientName(company.businessName || company.name || '')
              setRecipientAddress(company.address || '')
              // El punto de llegada (destino) también es mi empresa
              setDestinationAddress(company.address || '')
              if (company.ubigeo && company.ubigeo.length === 6) {
                setRecipientDepartment(company.ubigeo.substring(0, 2))
                setRecipientProvince(company.ubigeo.substring(2, 4))
                setRecipientDistrict(company.ubigeo.substring(4, 6))
                setDestinationDepartment(company.ubigeo.substring(0, 2))
                setDestinationProvince(company.ubigeo.substring(2, 4))
                setDestinationDistrict(company.ubigeo.substring(4, 6))
              }
            }
          } catch (error) {
            console.error('Error al cargar datos de empresa para destinatario:', error)
          }
        }
        loadCompanyAsRecipient()

      } else if (referenceInvoice.customer) {
        // VENTA: El cliente es el destinatario
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
        setRecipientAddress(customer.address || '')

        // En ventas: la dirección del cliente va al punto de llegada
        setDestinationAddress(customer.address || '')
        setRecipientDepartment(customer.department || '')
        setRecipientProvince(customer.province || '')
        setRecipientDistrict(customer.district || '')
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

      // Agregar documento como referencia relacionada
      if (referenceInvoice.isPurchase && referenceInvoice.purchaseInvoice) {
        // Para compras: agregar la factura del proveedor con sus datos
        const supplier = referenceInvoice.supplier
        setRelatedDocuments([{
          id: 1,
          type: referenceInvoice.purchaseInvoice.type || '01',
          series: referenceInvoice.purchaseInvoice.series || '',
          number: referenceInvoice.purchaseInvoice.number || '',
          // Datos del proveedor para mostrar en el PDF
          supplierRuc: supplier?.documentNumber || '',
          supplierName: supplier?.name || '',
          supplierAddress: supplier?.address || '',
        }])
      } else if (referenceInvoice.number && referenceInvoice.documentType !== 'cotizacion') {
        // Para ventas: agregar nuestra factura/boleta
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

  // Pre-llenar datos cuando se clona una guía existente
  useEffect(() => {
    if (!cloneData || !isOpen) return

    // Fechas: usar fecha actual (no la de la guía original)
    setIssueDate(getLocalDateString(0))
    setTransferDate(getLocalDateString(0))

    // Datos básicos
    setTransferReason(cloneData.transferReason || '01')
    setTransportMode(cloneData.transportMode || '02')
    setTransferDescription(cloneData.transferDescription || '')
    setTotalWeight(cloneData.totalWeight ? String(cloneData.totalWeight) : '')
    setWeightUnit(cloneData.weightUnit || 'KGM')
    // Preservar el peso clonado; el usuario puede reactivar auto-cálculo editando el campo
    if (cloneData.totalWeight) setWeightManuallyEdited(true)
    setIsM1LVehicle(cloneData.isM1LVehicle || false)
    setAdditionalInfo(cloneData.additionalInfo || '')

    // Destinatario
    const recipient = cloneData.recipient || cloneData.customer || {}
    setRecipientDocType(recipient.documentType || '6')
    setRecipientDocNumber(recipient.documentNumber || '')
    setRecipientName(recipient.name || '')
    setRecipientAddress(recipient.address || '')
    setRecipientEmail(recipient.email || '')
    if (recipient.ubigeo && recipient.ubigeo.length === 6) {
      setRecipientDepartment(recipient.ubigeo.substring(0, 2))
      setRecipientProvince(recipient.ubigeo.substring(2, 4))
      setRecipientDistrict(recipient.ubigeo.substring(4, 6))
    } else {
      setRecipientDepartment('')
      setRecipientProvince('')
      setRecipientDistrict('')
    }

    // Punto de partida
    const origin = cloneData.origin || {}
    setOriginAddress(origin.address || '')
    setOriginDepartment(origin.department || '')
    setOriginProvince(origin.province || '')
    setOriginDistrict(origin.district || '')

    // Punto de llegada
    const destination = cloneData.destination || {}
    setDestinationAddress(destination.address || '')
    setDestinationDepartment(destination.department || '')
    setDestinationProvince(destination.province || '')
    setDestinationDistrict(destination.district || '')

    // Transporte
    const transport = cloneData.transport || {}
    if (cloneData.transportMode === '02') {
      // Transporte privado
      const driver = transport.driver || cloneData.driver || {}
      setDriverDocType(driver.documentType || '1')
      setDriverDocNumber(driver.documentNumber || '')
      setDriverName(driver.name || '')
      setDriverLastName(driver.lastName || '')
      setDriverLicense(driver.license || '')
      const vehicle = transport.vehicle || cloneData.vehicle || {}
      setVehiclePlate(vehicle.plate || '')
      setVehicleAuthEntity(vehicle.authorizationEntity || '')
      setVehicleAuthNumber(vehicle.authorizationNumber || '')
    } else {
      // Transporte público
      const carrier = transport.carrier || cloneData.carrier || {}
      setCarrierRuc(carrier.ruc || '')
      setCarrierName(carrier.businessName || '')
    }

    // Items - clonar sin IDs de referencia a la guía original
    const clonedItems = (cloneData.items || []).map((item, index) => ({
      id: index + 1,
      productId: item.productId || '',
      code: item.code || '',
      description: item.description || '',
      searchTerm: item.description || '',
      quantity: item.quantity || 0,
      unit: normalizeSunatUnit(item.unit),
      sunatCode: item.sunatCode || '',
      gtin: item.gtin || '',
      subpCode: item.subpCode || '',
      isNormalized: item.isNormalized || false,
      batchNumber: item.batchNumber || '',
      batchExpiryDate: item.batchExpiryDate || '',
    }))
    setItems(clonedItems)

    // Documentos relacionados - NO copiar (la nueva guía no tiene la misma referencia)
    setRelatedDocuments([])

    // Sucursal y almacén
    if (cloneData.branchId) {
      setSelectedBranchId(cloneData.branchId)
    }
    if (cloneData.warehouseId) {
      setSelectedWarehouseId(cloneData.warehouseId)
    }

    // Forzar envío manual (no automático)
    setAutoSendToSunat(false)
  }, [cloneData, isOpen])

  // Cargar productos cuando se abre el modal sin referencia (creación manual)
  useEffect(() => {
    if (isOpen && !referenceInvoice && productsList.length === 0) {
      const loadProducts = async () => {
        const businessId = getBusinessId()
        if (!businessId) return
        try {
          const result = await getProducts(businessId)
          if (result.success && result.data) {
            const pMap = {}
            result.data.forEach(p => { pMap[p.id] = p })
            setProductsMap(pMap)
            setProductsList(result.data)
          }
        } catch (error) {
          console.error('Error cargando productos:', error)
        }
      }
      loadProducts()
    }
  }, [isOpen, referenceInvoice])

  // Auto-calcular peso total a partir de items + peso unitario del producto
  // Solo se actualiza si el usuario no editó el campo manualmente (evita pisar valores)
  useEffect(() => {
    if (weightManuallyEdited) return
    if (!items || items.length === 0) return

    const estimated = items.reduce((sum, item) => {
      const product = item.productId ? productsMap[item.productId] : null
      const unitWeight = Number(product?.weight || 0)
      const qty = Number(item.quantity || 0)
      return sum + (unitWeight * qty)
    }, 0)

    if (estimated > 0) {
      // Redondear a 2 decimales
      const rounded = Math.round(estimated * 100) / 100
      setTotalWeight(String(rounded))
    }
  }, [items, productsMap, weightManuallyEdited])

  // Cargar configuración de envío automático al abrir el modal (no aplica para clonación)
  useEffect(() => {
    const loadAutoSendConfig = async () => {
      const businessId = getBusinessId()
      if (!businessId) return

      try {
        const companyResult = await getCompanySettings(businessId)
        if (companyResult.success && companyResult.data) {
          setAutoSendToSunat(companyResult.data.autoSendToSunat === true)
        }
      } catch (error) {
        console.error('Error al cargar configuración:', error)
      }
    }

    if (isOpen && !cloneData) {
      loadAutoSendConfig()
    }
  }, [isOpen, getBusinessId, cloneData])

  // Actualizar dirección de origen/destino cuando cambia el almacén o la sucursal seleccionada.
  // En compras (isPurchase): la dirección de mi empresa va al DESTINO (punto de llegada)
  // En ventas: la dirección de mi empresa va al ORIGEN (punto de partida)
  //
  // Prioridad de la dirección:
  //   1. Almacén seleccionado (si tiene address propio) — útil para empresas con
  //      una sola sucursal y múltiples almacenes en distintas direcciones.
  //   2. Sucursal seleccionada.
  //   3. Negocio principal (configuración de empresa).
  //
  // El ubigeo se hereda de la sucursal a la que pertenece el almacén (si tiene
  // branchId), o de la sucursal seleccionada, o del negocio.
  const isPurchase = referenceInvoice?.isPurchase
  useEffect(() => {
    const loadOriginOrDestinationAddress = async () => {
      const businessId = getBusinessId()
      if (!businessId) return

      const setAddr = isPurchase ? setDestinationAddress : setOriginAddress
      const setDept = isPurchase ? setDestinationDepartment : setOriginDepartment
      const setProv = isPurchase ? setDestinationProvince : setOriginProvince
      const setDist = isPurchase ? setDestinationDistrict : setOriginDistrict

      const applyUbigeo = (ubigeo) => {
        if (ubigeo && ubigeo.length === 6) {
          setDept(ubigeo.substring(0, 2))
          setProv(ubigeo.substring(2, 4))
          setDist(ubigeo.substring(4, 6))
        } else {
          setDept('')
          setProv('')
          setDist('')
        }
      }

      // 1. Almacén con address propio
      const selectedWarehouseData = selectedWarehouseId
        ? warehouses.find(w => w.id === selectedWarehouseId)
        : null
      if (selectedWarehouseData?.address) {
        setAddr(selectedWarehouseData.address)
        // Hereda ubigeo de la sucursal a la que pertenece el almacén,
        // si no hay branchId hereda de la sucursal del modal o del negocio.
        const wsBranch = selectedWarehouseData.branchId
          ? branches.find(b => b.id === selectedWarehouseData.branchId)
          : null
        if (wsBranch?.ubigeo) {
          applyUbigeo(wsBranch.ubigeo)
          return
        }
        if (selectedBranchId) {
          const selectedBranchData = branches.find(b => b.id === selectedBranchId)
          if (selectedBranchData?.ubigeo) {
            applyUbigeo(selectedBranchData.ubigeo)
            return
          }
        }
        // Fallback: ubigeo del negocio
        try {
          const companyResult = await getCompanySettings(businessId)
          if (companyResult.success && companyResult.data?.ubigeo) {
            applyUbigeo(companyResult.data.ubigeo)
          } else {
            applyUbigeo('')
          }
        } catch {
          applyUbigeo('')
        }
        return
      }

      // 2. Sucursal seleccionada
      if (selectedBranchId && branches.length > 0) {
        const selectedBranchData = branches.find(b => b.id === selectedBranchId)
        if (selectedBranchData) {
          setAddr(selectedBranchData.address || '')
          applyUbigeo(selectedBranchData.ubigeo)
          return
        }
      }

      // 3. Negocio principal
      try {
        const companyResult = await getCompanySettings(businessId)
        if (companyResult.success && companyResult.data) {
          const businessData = companyResult.data
          setAddr(businessData.address || '')
          applyUbigeo(businessData.ubigeo)
        }
      } catch (error) {
        console.error('Error al cargar dirección del negocio:', error)
      }
    }

    if (isOpen) {
      loadOriginOrDestinationAddress()
    }
  }, [selectedWarehouseId, warehouses, selectedBranchId, branches, isOpen, getBusinessId, isPurchase])

  // Sincronizar ubigeo y dirección del destinatario con el punto correspondiente
  // En ventas: destinatario (cliente) → punto de LLEGADA
  // En compras: destinatario (proveedor) → punto de PARTIDA
  useEffect(() => {
    // Para compras, NO sincronizamos automáticamente porque:
    // - El punto de partida (proveedor) ya se setea en el useEffect inicial
    // - El punto de llegada (mi empresa) se carga de la sucursal/negocio
    // Solo sincronizamos para ventas
    if (isPurchase) return

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
  }, [recipientDepartment, recipientProvince, recipientDistrict, recipientAddress, isPurchase])

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

  // Filtrar productos según búsqueda (tokenizada y multi-campo, alineado con POS/Inventario)
  const getFilteredProducts = (searchTerm) => {
    if (!searchTerm) return productsList.slice(0, 8)
    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 0)
    return productsList
      .filter(p => {
        const code = p.code || ''
        const sku = p.sku || ''
        const text = [
          p.name || '',
          code,
          code.replace(/-/g, ''),
          sku,
          sku.replace(/-/g, ''),
          p.marca || '',
          p.laboratoryName || '',
          p.genericName || '',
          p.description || '',
        ].join(' ').toLowerCase()
        return searchWords.every(w => text.includes(w))
      })
      .slice(0, 10)
  }

  // Seleccionar producto para un item
  const selectProduct = (itemId, product) => {
    // Auto-seleccionar lote FEFO en farmacia
    let batchNumber = ''
    let batchExpiryDate = ''
    if (hasBatchControl && product.batches && Array.isArray(product.batches)) {
      const available = product.batches
        .filter(b => b.quantity > 0 && !b.isExpired && (!selectedWarehouseId || !b.warehouseId || b.warehouseId === selectedWarehouseId))
        .sort((a, b) => {
          const dA = a.expiryDate?.toDate?.() || new Date(a.expiryDate || '2099-12-31')
          const dB = b.expiryDate?.toDate?.() || new Date(b.expiryDate || '2099-12-31')
          return dA - dB
        })
      if (available.length > 0) {
        batchNumber = available[0].lotNumber || available[0].batchNumber || ''
        batchExpiryDate = available[0].expiryDate || available[0].expirationDate || ''
      }
    }

    setItems(items.map(item => {
      if (item.id !== itemId) return item
      return {
        ...item,
        productId: product.id,
        code: product.sku || product.code || '',
        description: product.name || '',
        unit: normalizeSunatUnit(product.unit),
        searchTerm: product.name || '',
        batchNumber,
        batchExpiryDate,
        marca: product.marca || '',
        laboratoryName: product.laboratoryName || '',
        trackSerials: product.trackSerials || false,
        serials: product.serials || [],
        serialNumber: '',
      }
    }))
    setShowProductSearch(null)
  }

  // Limpiar selección de producto
  const clearProductSelection = (itemId) => {
    setItems(items.map(item => {
      if (item.id !== itemId) return item
      return { ...item, productId: '', code: '', description: '', searchTerm: '', batchNumber: '', batchExpiryDate: '' }
    }))
  }

  // Helper: obtener lotes disponibles de un producto ordenados por FEFO (filtrado por almacén)
  const getAvailableBatches = (productId) => {
    const product = productsMap[productId]
    if (!product?.batches || !Array.isArray(product.batches)) return []
    return product.batches
      .filter(b => b.quantity > 0 && !b.isExpired && (!selectedWarehouseId || !b.warehouseId || b.warehouseId === selectedWarehouseId))
      .map(b => ({
        ...b,
        lotNumber: b.lotNumber || b.batchNumber || 'S/N',
        expiryDate: b.expiryDate || b.expirationDate || null,
      }))
      .sort((a, b) => {
        const dA = a.expiryDate?.toDate?.() || new Date(a.expiryDate || '2099-12-31')
        const dB = b.expiryDate?.toDate?.() || new Date(b.expiryDate || '2099-12-31')
        return dA - dB
      })
  }

  // Helper: formatear fecha de vencimiento
  const formatBatchExpiry = (date) => {
    if (!date) return ''
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Manejar cambio de lote seleccionado
  const handleBatchChange = (itemId, lotNumber) => {
    setItems(items.map(item => {
      if (item.id !== itemId) return item
      if (!lotNumber) return { ...item, batchNumber: '', batchExpiryDate: '' }
      const batches = getAvailableBatches(item.productId)
      const batch = batches.find(b => b.lotNumber === lotNumber)
      return {
        ...item,
        batchNumber: batch?.lotNumber || '',
        batchExpiryDate: batch?.expiryDate || '',
      }
    }))
  }

  // Agregar item
  const addItem = () => {
    setItems([...items, {
      id: Date.now(),
      productId: '',
      code: '',
      description: '',
      searchTerm: '',
      quantity: 1,
      unit: 'NIU',
      sunatCode: '',
      gtin: '',
      subpCode: '',
      isNormalized: false,
      batchNumber: '',
      batchExpiryDate: '',
    }])
  }

  // Eliminar item
  const removeItem = (id) => {
    setItems(items.filter(item => item.id !== id))
  }

  // Eliminar todos los items de un grupo de series
  const removeItemGroup = (ids) => {
    const idSet = new Set(ids)
    setItems(items.filter(item => !idSet.has(item.id)))
  }

  // Actualizar item. Si el item pertenece a un grupo de series (mismo producto+lote
  // con serialNumber), propaga el cambio a todos los miembros del grupo — excepto en
  // campos individuales (serialNumber, searchTerm, quantity).
  const updateItem = (id, field, value) => {
    const target = items.find(item => item.id === id)
    const isIndividualField = field === 'serialNumber' || field === 'searchTerm' || field === 'quantity'
    const isSerialGroupMember = !isIndividualField && target?.serialNumber && target?.productId

    if (!isSerialGroupMember) {
      setItems(items.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      ))
      return
    }

    setItems(items.map(item => {
      const isSibling = item.serialNumber
        && item.productId === target.productId
        && (item.batchNumber || '') === (target.batchNumber || '')
      return isSibling ? { ...item, [field]: value } : item
    }))
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

  // Buscar datos del destinatario por RUC o DNI
  const handleSearchRecipientDoc = async () => {
    const docNumber = recipientDocNumber.trim()
    if (!docNumber) return

    // Códigos SUNAT: '1'=DNI, '6'=RUC, '4'=CE, '7'=Pasaporte
    if (recipientDocType === '4' || recipientDocType === '7') {
      toast.info('La búsqueda automática solo está disponible para DNI y RUC. Completa los datos manualmente.')
      return
    }

    setIsSearchingRecipient(true)
    try {
      let result
      const isDNI = recipientDocType === '1' || (!recipientDocType && docNumber.length === 8)
      const isRUC = recipientDocType === '6' || (!recipientDocType && docNumber.length === 11)

      if (isDNI) {
        if (docNumber.length !== 8) {
          toast.error('El DNI debe tener 8 dígitos')
          return
        }
        result = await consultarDNI(docNumber)
      } else if (isRUC) {
        if (docNumber.length !== 11) {
          toast.error('El RUC debe tener 11 dígitos')
          return
        }
        result = await consultarRUC(docNumber)
      } else {
        toast.error('El documento debe tener 8 dígitos (DNI) o 11 dígitos (RUC)')
        return
      }

      if (result.success) {
        if (docNumber.length === 8) {
          setRecipientDocType('1')
          setRecipientName(result.data.nombreCompleto || '')
          toast.success(`Datos encontrados: ${result.data.nombreCompleto}`)
        } else {
          setRecipientDocType('6')
          setRecipientName(result.data.razonSocial || '')
          if (result.data.direccion) {
            setRecipientAddress(result.data.direccion)
          }
          toast.success(`Datos encontrados: ${result.data.razonSocial}`)
        }
      } else {
        toast.error(result.error || 'No se encontraron datos para este documento')
      }
    } catch (error) {
      console.error('Error al buscar documento:', error)
      toast.error('Error al consultar el documento')
    } finally {
      setIsSearchingRecipient(false)
    }
  }

  const handleSubmit = async (e, { skipSunat = false } = {}) => {
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
      // Validar formato de placa si se ingresó (6 caracteres alfanuméricos sin guiones)
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

      const dispatchGuide = {
        // Para ventas: referencia a nuestra factura/boleta
        // Para compras: no hay factura propia, la del proveedor va en relatedDocuments
        referencedInvoice: referenceInvoice && referenceInvoice.id && referenceInvoice.documentType !== 'cotizacion' && !referenceInvoice.isPurchase ? {
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
          // Datos del proveedor (si aplica - para compras)
          ...(doc.supplierRuc && {
            supplierRuc: doc.supplierRuc,
            supplierName: doc.supplierName,
            supplierAddress: doc.supplierAddress,
          }),
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
          // Si el indicador está activo, también enviar datos del vehículo y conductor del transportista
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

        // Sucursal y almacén seleccionados
        branchId: selectedBranchId || null,
        branchName: selectedBranchId ? branches.find(b => b.id === selectedBranchId)?.name || null : null,
        warehouseId: selectedWarehouseId || null,
        warehouseName: selectedWarehouseId ? warehouses.find(w => w.id === selectedWarehouseId)?.name || null : null,
        stockDeducted: false,
      }

      console.log('Creando guía de remisión:', dispatchGuide)

      const result = await createDispatchGuide(businessId, dispatchGuide)

      if (result.success) {
        // Descontar stock si el usuario lo activó. Usamos el helper compartido para
        // que la lógica de lotes/FEFO sea consistente con anulación y toggle manual.
        if (deductStock && selectedWarehouseId) {
          const { deductStockForDispatchGuide } = await import('@/services/dispatchGuideStockService')
          const deductRes = await deductStockForDispatchGuide({
            businessId,
            guide: {
              id: result.id,
              number: result.number,
              warehouseId: selectedWarehouseId,
              items: items.map((item, index) => {
                const { serials, trackSerials, ...rest } = item
                return { ...rest, lineNumber: index + 1 }
              }),
            },
            userId: user?.uid,
          })
          if (!deductRes.success) {
            toast.warning('Guía creada pero hubo un error al descontar stock')
          }
        }

        toast.success(`Guía de remisión ${result.number} ${skipSunat ? 'guardada' : 'creada'} exitosamente`)

        // Envío automático a SUNAT si está configurado y no se omitió (fire & forget).
        // Lectura FRESH para evitar stale state si el toggle fue apagado tras
        // abrir el modal.
        let shouldAutoSend = false
        try {
          const freshSettings = await getCompanySettings(businessId)
          shouldAutoSend = freshSettings?.success === true && freshSettings.data?.autoSendToSunat === true
        } catch (settingsErr) {
          console.warn('No se pudo releer companySettings:', settingsErr)
          shouldAutoSend = autoSendToSunat === true
        }
        if (!skipSunat && shouldAutoSend && result.id) {
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
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="7xl">
      {/* Header compacto */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">
            {cloneData ? 'Clonar Guía de Remisión' : 'Guía de Remisión Remitente'}
          </h2>
          {cloneData && <span className="text-xs text-gray-500">· basada en {cloneData.number}</span>}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">Emisión: <span className="font-medium text-gray-700">{issueDate || getLocalDateString()}</span></span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col max-h-[calc(92vh-4rem)]">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm [&_label]:!text-[11px] [&_label]:!font-medium [&_label]:!text-gray-600 [&_label]:!mb-0.5 [&_input]:!py-1.5 [&_input]:!text-sm [&_select]:!py-1.5 [&_select]:!text-sm [&_textarea]:!py-1.5 [&_textarea]:!text-sm">

          {/* Selector de Sucursal/Almacén */}
          {(branches.length > 0 || warehouses.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border border-gray-200 rounded-lg">
              {branches.length > 0 && (
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Sucursal de origen</label>
                    <select
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    >
                      {hasMainAccess && <option value="">Sucursal Principal</option>}
                      {branches.map(branch => (
                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {warehouses.length > 0 && (
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Almacén</label>
                    <select
                      value={selectedWarehouseId}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    >
                      {warehouses.map(wh => (
                        <option key={wh.id} value={wh.id}>{wh.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nro. de Documento <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <Input
                    placeholder={recipientDocType === '6' ? '20123456789' : '12345678'}
                    required
                    value={recipientDocNumber}
                    onChange={(e) => setRecipientDocNumber(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (recipientDocNumber.length === 8 || recipientDocNumber.length === 11) && handleSearchRecipientDoc()}
                    maxLength={recipientDocType === '6' ? 11 : 15}
                  />
                  <button
                    type="button"
                    onClick={handleSearchRecipientDoc}
                    disabled={isSearchingRecipient}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    title="Buscar datos del documento"
                  >
                    {isSearchingRecipient ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
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
                          // Detectar tipo de documento
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
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-600">TIPO DE TRANSPORTE:</span>
              <div className="flex rounded-md overflow-hidden border border-gray-300">
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
                min={getYesterdayDateString()}
                max={getTomorrowDateString()}
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
                onChange={(e) => {
                  setTotalWeight(e.target.value)
                  setWeightManuallyEdited(true)
                }}
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

          {/* Datos del vehículo (solo transporte privado) */}
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
                      onChange={(e) => setCarrierRuc(e.target.value.replace(/\D/g, ''))}
                      maxLength={11}
                      className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        carrierRuc && carrierRuc.length !== 11
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-300'
                      }`}
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
                  {carrierRuc && carrierRuc.length !== 11 && (
                    <p className="text-red-500 text-xs mt-1">
                      El RUC debe tener 11 dígitos ({carrierRuc.length}/11)
                    </p>
                  )}
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

              {/* Indicador "registrar vehículos y conductores del transportista" */}
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
                  value={vehiclePlate}
                  maxLength={6}
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
              {/* Aviso SUNAT 3452: este campo solo aplica para cargas con permiso MTC
                  especial (mercancía peligrosa, sobredimensionada, etc.). Si no aplica,
                  SUNAT rechaza la guía. Solo mostramos el aviso cuando el usuario llenó algo. */}
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

              {/* Vehículos secundarios (tracto + carreta, etc.) */}
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

              {/* Conductores secundarios (relevo) */}
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
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Agregar bienes o productos a transportar</h3>
              </div>
            </div>

            <div className="space-y-3">
              {(() => {
                // Agrupar items con serialNumber por producto+lote (igual que el POS).
                // Items sin serie o sin producto seleccionado se renderizan individualmente.
                const groups = []
                const seen = new Map()
                items.forEach(it => {
                  if (it.serialNumber && it.productId) {
                    const key = `g|${it.productId}|${it.batchNumber || ''}`
                    const existing = seen.get(key)
                    if (existing) {
                      existing.members.push(it)
                    } else {
                      const g = { key, members: [it] }
                      seen.set(key, g)
                      groups.push(g)
                    }
                  } else {
                    groups.push({ key: `s|${it.id}`, members: [it] })
                  }
                })
                return groups.map((group, index) => {
                  const item = group.members[0]
                  const memberIds = group.members.map(m => m.id)
                  const isGroup = group.members.length > 1
                  return (
                <div key={group.key} className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500">ITEM {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => isGroup ? removeItemGroup(memberIds) : removeItem(item.id)}
                      className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                      title={isGroup ? 'Quitar grupo completo' : 'Quitar'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Búsqueda de producto */}
                  <div className="relative mb-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={item.productId ? item.description : (item.searchTerm || '')}
                        onChange={e => {
                          if (item.productId) {
                            updateItem(item.id, 'description', e.target.value)
                          } else {
                            setItems(items.map(it =>
                              it.id === item.id ? { ...it, searchTerm: e.target.value, description: e.target.value } : it
                            ))
                            setShowProductSearch(item.id)
                          }
                        }}
                        onFocus={() => !item.productId && setShowProductSearch(item.id)}
                        placeholder="Buscar producto o escribir descripción..."
                        className={`w-full pl-8 pr-8 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                          item.productId ? 'border-green-500 bg-green-50' : 'border-gray-300'
                        }`}
                      />
                      {item.productId && (
                        <button
                          type="button"
                          onClick={() => clearProductSelection(item.id)}
                          className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {/* Dropdown de resultados */}
                    {showProductSearch === item.id && !item.productId && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowProductSearch(null)}
                        />
                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {getFilteredProducts(item.searchTerm).length > 0 ? (
                            getFilteredProducts(item.searchTerm).map(product => (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => selectProduct(item.id, product)}
                                className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{product.name}</p>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    {product.sku && <span>SKU: {product.sku}</span>}
                                    {product.code && <span>Cód: {product.code}</span>}
                                    {isPharmacy && product.laboratoryName && (
                                      <span className="text-blue-600">Lab: {product.laboratoryName}</span>
                                    )}
                                  </div>
                                </div>
                                {(() => {
                                  let whStock = product.stock
                                  if (selectedWarehouseId && product.warehouseStocks) {
                                    if (Array.isArray(product.warehouseStocks)) {
                                      const ws = product.warehouseStocks.find(ws => ws.warehouseId === selectedWarehouseId)
                                      whStock = ws ? ws.stock : 0
                                    } else {
                                      whStock = product.warehouseStocks[selectedWarehouseId] ?? product.stock
                                    }
                                  }
                                  return whStock != null ? (
                                    <span className={`text-xs ml-2 flex-shrink-0 ${whStock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                      Stock: {whStock}
                                    </span>
                                  ) : null
                                })()}
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-sm text-gray-500 text-center">
                              No se encontraron productos
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Campos del item en grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Código</label>
                      <input
                        type="text"
                        value={item.code}
                        onChange={(e) => updateItem(item.id, 'code', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50"
                        placeholder="Código"
                        readOnly={!!item.productId}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Cantidad</label>
                      <input
                        type="number"
                        value={isGroup ? group.members.length : item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        className={`w-full px-2 py-1 border border-gray-300 rounded text-sm ${isGroup ? 'bg-gray-100' : ''}`}
                        min="0.01"
                        step="0.01"
                        readOnly={isGroup}
                        title={isGroup ? 'Cantidad determinada por las series' : ''}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Unidad</label>
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        {UNIT_CODES.map(unit => (
                          <option key={unit.value} value={unit.value}>
                            {unit.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Cod. SUNAT</label>
                      <input
                        type="text"
                        value={item.sunatCode}
                        onChange={(e) => updateItem(item.id, 'sunatCode', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="Opcional"
                      />
                    </div>

                    {/* Selección de lote */}
                    {hasBatchControl && (
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">Lote / Vencimiento</label>
                        {(() => {
                          const batches = getAvailableBatches(item.productId)
                          if (!item.productId) {
                            return <span className="text-xs text-gray-400 py-1 block">Seleccione un producto</span>
                          }
                          if (batches.length === 0) {
                            return <span className="text-xs text-gray-400 py-1 block">Sin lotes disponibles</span>
                          }
                          return (
                            <div className="flex items-center gap-2">
                              <select
                                value={item.batchNumber || ''}
                                onChange={(e) => handleBatchChange(item.id, e.target.value)}
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                              >
                                <option value="">Seleccionar lote</option>
                                {batches.map(b => (
                                  <option key={b.lotNumber} value={b.lotNumber}>
                                    {b.lotNumber} (Stock: {b.quantity}) {b.expiryDate ? `- Venc: ${formatBatchExpiry(b.expiryDate)}` : ''}
                                  </option>
                                ))}
                              </select>
                              {item.batchExpiryDate && (
                                <span className="text-xs text-orange-600 whitespace-nowrap">
                                  Vence: {formatBatchExpiry(item.batchExpiryDate)}
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* Selección de número de serie */}
                    {item.trackSerials && item.productId && (() => {
                      // Si es un grupo de series (mismo producto+lote con varias series), mostrar chips
                      if (isGroup) {
                        return (
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-0.5">
                              Números de Serie ({group.members.length})
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {group.members.map(m => (
                                <span
                                  key={m.id}
                                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-green-50 text-green-700 text-xs rounded-full border border-green-300"
                                >
                                  <span className="font-medium">{m.serialNumber}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(m.id)}
                                    className="hover:bg-green-200 rounded-full p-0.5 transition-colors"
                                    title="Quitar esta serie"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      }
                      // Si ya viene un serialNumber pre-llenado (desde factura/boleta), mostrarlo como texto fijo
                      if (item.serialNumber && referenceInvoice) {
                        return (
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-0.5">N° de Serie</label>
                            <span className="text-xs text-green-700 font-medium bg-green-50 border border-green-300 rounded px-2 py-1 block">
                              S/N: {item.serialNumber}
                            </span>
                          </div>
                        )
                      }

                      const availableSerials = (item.serials || []).filter(s =>
                        s.status === 'available' && (!s.warehouseId || !selectedWarehouseId || s.warehouseId === selectedWarehouseId)
                      )
                      // Excluir series ya seleccionadas en otros items
                      const usedSerials = items.filter(i => i.id !== item.id && i.serialNumber).map(i => i.serialNumber)
                      const filteredSerials = availableSerials.filter(s => !usedSerials.includes(s.serialNumber))

                      if (filteredSerials.length === 0) return (
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-0.5">N° de Serie</label>
                          <span className="text-xs text-gray-400 py-1 block">Sin series disponibles</span>
                        </div>
                      )
                      return (
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-0.5">N° de Serie</label>
                          <select
                            value={item.serialNumber || ''}
                            onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, serialNumber: e.target.value, quantity: e.target.value ? 1 : item.quantity } : i))}
                            className={`w-full px-2 py-1 border rounded text-xs ${!item.serialNumber ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}
                          >
                            <option value="">Seleccionar serie...</option>
                            {filteredSerials.map(s => (
                              <option key={s.id} value={s.serialNumber}>
                                {s.serialNumber}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })()}

                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">GTIN</label>
                      <input
                        type="text"
                        value={item.gtin}
                        onChange={(e) => updateItem(item.id, 'gtin', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="Opcional"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 py-1">
                        <input
                          type="checkbox"
                          checked={item.isNormalized}
                          onChange={(e) => updateItem(item.id, 'isNormalized', e.target.checked)}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                        />
                        Bien normalizado
                      </label>
                    </div>
                  </div>
                </div>
                  )
                })
              })()}
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

        {/* Footer compacto: check de stock + botones en la misma fila */}
        <div className="border-t border-gray-200 px-5 py-3 bg-gray-50 rounded-b-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              {/* Check de descontar stock — solo si hay almacén y no viene de factura/boleta */}
              {selectedWarehouseId && !referenceInvoice?.id && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deductStock}
                    onChange={(e) => setDeductStock(e.target.checked)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-xs text-gray-700">Descontar stock del almacén</span>
                </label>
              )}
              {/* Aviso si el stock ya fue descontado por la factura */}
              {selectedWarehouseId && referenceInvoice?.id && !referenceInvoice?.isPurchase && (
                <p className="text-xs text-gray-500 italic">El stock ya fue descontado al generar la factura/boleta.</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 w-full sm:flex sm:w-auto sm:items-center [&>button]:w-full sm:[&>button]:w-auto">
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
                type="button"
                variant="primary"
                size="sm"
                disabled={isSaving}
                onClick={(e) => handleSubmit(e, { skipSunat: true })}
              >
                Guardar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                    Emitiendo...
                  </>
                ) : (
                  'Emitir Guía'
                )}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5 text-right">
            Campos obligatorios (*) — Formato PDF de guías de remisión es horizontal (**)
          </p>
        </div>
      </form>
    </Modal>
  )
}
