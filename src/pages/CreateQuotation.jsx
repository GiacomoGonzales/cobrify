import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Loader2, ArrowLeft, UserPlus, X, Search, Tag, Package, Hash, User, FileText, Store } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { calculateInvoiceAmounts, ID_TYPES } from '@/utils/peruUtils'
import { formatCurrency } from '@/lib/utils'
import { getCustomers, getProducts, createCustomer } from '@/services/firestoreService'
import { createQuotation, getNextQuotationNumber, getQuotation, updateQuotation } from '@/services/quotationService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { getActiveBranches } from '@/services/branchService'

// Unidades de medida SUNAT (Catálogo N° 03 - UN/ECE Rec 20)
// Reordenadas: las más comunes primero (UNIDAD, HORA, SERVICIO)
const UNITS = [
  { value: 'NIU', label: 'Unidad' },
  { value: 'HUR', label: 'Hora' },
  { value: 'ZZ', label: 'Servicio' },
  { value: 'KGM', label: 'Kilogramo' },
  { value: 'GRM', label: 'Gramo' },
  { value: 'LTR', label: 'Litro' },
  { value: 'MTR', label: 'Metro' },
  { value: 'MTK', label: 'Metro cuadrado' },
  { value: 'MTQ', label: 'Metro cúbico' },
  { value: 'BX', label: 'Caja' },
  { value: 'PK', label: 'Paquete' },
  { value: 'SET', label: 'Juego' },
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

export default function CreateQuotation() {
  const { user } = useAuth()
  const { businessSettings } = useAppContext()
  const navigate = useNavigate()
  const { id: quotationId } = useParams() // Si hay ID, es modo edición
  const toast = useToast()
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingQuotationNumber, setEditingQuotationNumber] = useState('')

  // Estados para selección de precio múltiple y presentaciones
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [showPresentationModal, setShowPresentationModal] = useState(false)
  const [pendingProductSelection, setPendingProductSelection] = useState(null) // { index, product }
  const [selectedPriceLevel, setSelectedPriceLevel] = useState(null)

  // Cliente
  const [customerMode, setCustomerMode] = useState('select') // 'select' o 'manual'
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [manualCustomer, setManualCustomer] = useState({
    documentType: 'DNI',
    documentNumber: '',
    name: '',
    email: '',
    phone: '',
    address: '',
  })
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [isLookingUpDocument, setIsLookingUpDocument] = useState(false)

  // Cotización
  const [validityDays, setValidityDays] = useState(30)
  const [discount, setDiscount] = useState(0)
  const [discountType, setDiscountType] = useState('fixed')
  const [terms, setTerms] = useState('')
  const [notes, setNotes] = useState('')
  const isIgvExempt = businessSettings?.emissionConfig?.taxConfig?.igvExempt === true
  const [hideIgv, setHideIgv] = useState(isIgvExempt)

  // Serie y número personalizado
  const [customSeries, setCustomSeries] = useState('')
  const [customNumber, setCustomNumber] = useState('')
  const [useCustomNumber, setUseCustomNumber] = useState(false)

  // Destinatario (persona a quien va dirigida la cotización)
  const [recipientName, setRecipientName] = useState('')
  const [recipientPosition, setRecipientPosition] = useState('')

  // Sucursales
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [quotationItems, setQuotationItems] = useState([
    { productId: '', name: '', quantity: 1, unitPrice: 0, unit: 'UNIDAD', searchTerm: '' },
  ])

  // Buscador de productos
  const [showProductSearch, setShowProductSearch] = useState(null) // índice del item activo

  // Auto-set hideIgv when businessSettings loads (only for new quotations)
  useEffect(() => {
    if (!quotationId && isIgvExempt) {
      setHideIgv(true)
    }
  }, [isIgvExempt, quotationId])

  useEffect(() => {
    loadData()
  }, [user, quotationId])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [customersResult, productsResult, branchesResult] = await Promise.all([
        getCustomers(user.uid),
        getProducts(user.uid),
        getActiveBranches(user.uid),
      ])

      if (customersResult.success) {
        setCustomers(customersResult.data || [])
      }

      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }

      if (branchesResult.success) {
        setBranches(branchesResult.data || [])
      }

      // Si hay quotationId, cargar la cotización para edición
      if (quotationId) {
        const quotationResult = await getQuotation(user.uid, quotationId)
        if (quotationResult.success) {
          const q = quotationResult.data
          setIsEditing(true)
          setEditingQuotationNumber(q.number)

          // Cargar datos del cliente
          if (q.customer) {
            // Verificar si el cliente existe en la lista
            const existingCustomer = customersResult.data?.find(c => c.id === q.customer.id)
            if (existingCustomer) {
              setCustomerMode('select')
              setSelectedCustomer(existingCustomer)
            } else {
              setCustomerMode('manual')
              setManualCustomer({
                documentType: q.customer.documentType || 'DNI',
                documentNumber: q.customer.documentNumber || '',
                name: q.customer.name || '',
                email: q.customer.email || '',
                phone: q.customer.phone || '',
                address: q.customer.address || '',
              })
            }
          }

          // Cargar items
          if (q.items && q.items.length > 0) {
            setQuotationItems(q.items.map(item => ({
              productId: item.productId || '',
              name: item.name || '',
              description: item.description || '',
              quantity: item.quantity || 1,
              unitPrice: item.unitPrice || 0,
              unit: item.unit || 'NIU',
              searchTerm: item.name || '',
            })))
          }

          // Cargar configuración
          setValidityDays(q.validityDays || 30)
          setDiscount(q.discount || 0)
          setDiscountType(q.discountType || 'fixed')
          setTerms(q.terms || '')
          setNotes(q.notes || '')
          setHideIgv(q.hideIgv || false)

          // Cargar destinatario
          setRecipientName(q.recipientName || '')
          setRecipientPosition(q.recipientPosition || '')

          // Cargar sucursal si existe
          if (q.branchId && branchesResult.data) {
            const branch = branchesResult.data.find(b => b.id === q.branchId)
            if (branch) {
              setSelectedBranch(branch)
            }
          }

          // Cargar serie/número personalizado si existe
          if (q.customSeries || q.customNumber) {
            setUseCustomNumber(true)
            setCustomSeries(q.customSeries || '')
            setCustomNumber(q.customNumber || '')
          }
        } else {
          toast.error('No se encontró la cotización')
          navigate('/app/cotizaciones')
        }
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar los datos. Por favor, recarga la página.')
    } finally {
      setIsLoading(false)
    }
  }

  const addItem = () => {
    setQuotationItems([
      ...quotationItems,
      { productId: '', name: '', description: '', quantity: 1, unitPrice: 0, unit: 'UNIDAD', searchTerm: '' },
    ])
  }

  const removeItem = index => {
    if (quotationItems.length > 1) {
      setQuotationItems(quotationItems.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index, field, value) => {
    const newItems = [...quotationItems]
    newItems[index][field] = value
    setQuotationItems(newItems)
  }

  const selectProduct = (index, product, selectedPrice = null, selectedPresentation = null) => {
    // Verificar si tiene presentaciones habilitadas
    const hasPresentations = businessSettings?.presentationsEnabled &&
                             product.presentations &&
                             product.presentations.length > 0

    // Verificar si tiene múltiples precios habilitados
    const hasMultiplePrices = businessSettings?.multiplePricesEnabled &&
                              (product.price2 || product.price3 || product.price4)

    // Si tiene presentaciones y no se ha seleccionado una, mostrar modal
    if (hasPresentations && !selectedPresentation) {
      setPendingProductSelection({ index, product })
      setShowPresentationModal(true)
      setShowProductSearch(null)
      return
    }

    // Si tiene múltiples precios y no se ha seleccionado uno, mostrar modal
    if (hasMultiplePrices && !selectedPrice && !selectedPresentation) {
      // Verificar si el cliente tiene nivel de precio asignado
      const customer = selectedCustomer || (customerMode === 'manual' ? manualCustomer : null)
      if (customer?.priceLevel) {
        // Auto-seleccionar precio según nivel del cliente
        const priceKey = customer.priceLevel
        selectedPrice = priceKey === 'price1' ? product.price : (product[priceKey] || product.price)
      } else {
        // Mostrar modal para seleccionar precio
        setPendingProductSelection({ index, product })
        setShowPriceModal(true)
        setShowProductSearch(null)
        return
      }
    }

    // Determinar el precio final
    let finalPrice = selectedPrice || product.price
    let finalName = product.name
    let finalUnit = product.unit || 'UNIDAD'
    let presentationInfo = ''

    // Si se seleccionó una presentación
    if (selectedPresentation) {
      finalPrice = selectedPresentation.price
      finalName = `${product.name} (${selectedPresentation.name})`
      presentationInfo = selectedPresentation.name
    }

    const newItems = [...quotationItems]
    newItems[index].productId = product.id
    newItems[index].name = finalName
    newItems[index].description = product.description || ''
    newItems[index].unitPrice = finalPrice
    newItems[index].unit = finalUnit
    newItems[index].searchTerm = finalName
    newItems[index].presentationName = presentationInfo
    newItems[index].presentationFactor = selectedPresentation?.factor || 1
    newItems[index].laboratoryName = product.laboratoryName || ''
    newItems[index].marca = product.marca || ''
    setQuotationItems(newItems)
    setShowProductSearch(null)
    setPendingProductSelection(null)
  }

  // Manejar selección de precio desde el modal
  const handlePriceSelection = (priceLevel) => {
    if (!pendingProductSelection) return

    const { index, product } = pendingProductSelection
    let selectedPrice = product.price

    if (priceLevel === 'price2' && product.price2) {
      selectedPrice = product.price2
    } else if (priceLevel === 'price3' && product.price3) {
      selectedPrice = product.price3
    } else if (priceLevel === 'price4' && product.price4) {
      selectedPrice = product.price4
    }

    setShowPriceModal(false)
    selectProduct(index, product, selectedPrice, null)
  }

  // Manejar selección de presentación desde el modal
  const handlePresentationSelection = (presentation) => {
    if (!pendingProductSelection) return

    const { index, product } = pendingProductSelection
    setShowPresentationModal(false)
    selectProduct(index, product, null, presentation)
  }

  // Cancelar selección pendiente
  const cancelPendingSelection = () => {
    setShowPriceModal(false)
    setShowPresentationModal(false)
    setPendingProductSelection(null)
  }

  const clearProductSelection = (index) => {
    const newItems = [...quotationItems]
    newItems[index].productId = ''
    newItems[index].searchTerm = ''
    setQuotationItems(newItems)
  }

  // Filtrar productos según búsqueda
  const getFilteredProducts = (searchTerm) => {
    if (!searchTerm) return products.slice(0, 5) // Mostrar primeros 5 si no hay búsqueda

    const term = searchTerm.toLowerCase()
    return products
      .filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.code?.toLowerCase().includes(term)
      )
      .slice(0, 10) // Máximo 10 resultados
  }

  const calculateItemTotal = item => {
    return (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }

  // Calcular total directo (suma de precio * cantidad)
  const directTotal = quotationItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
  }, 0)

  // Calcular subtotal base (asumiendo que precios incluyen IGV)
  const baseAmounts = calculateInvoiceAmounts(
    quotationItems.map(item => ({
      price: parseFloat(item.unitPrice) || 0,
      quantity: parseFloat(item.quantity) || 0,
    }))
  )

  // Calcular descuento
  const discountAmount =
    discountType === 'percentage'
      ? (hideIgv ? directTotal : baseAmounts.subtotal) * (parseFloat(discount) || 0) / 100
      : parseFloat(discount) || 0

  const discountedSubtotal = baseAmounts.subtotal - discountAmount

  // Calcular IGV y total con descuento aplicado
  // Si hideIgv está activo, usar el total directo sin desglose de IGV
  const finalIgv = hideIgv ? 0 : discountedSubtotal * 0.18
  const finalTotal = hideIgv
    ? Number((directTotal - discountAmount).toFixed(2))
    : Number((discountedSubtotal + finalIgv).toFixed(2))

  const handleCustomerChange = customerId => {
    const customer = customers.find(c => c.id === customerId)
    setSelectedCustomer(customer || null)
  }

  // Buscar datos de DNI o RUC automáticamente
  const handleLookupDocument = async () => {
    const docNumber = manualCustomer.documentNumber

    if (!docNumber) {
      toast.error('Ingrese un número de documento para buscar')
      return
    }

    setIsLookingUpDocument(true)

    try {
      let result

      // Determinar si es DNI o RUC según la longitud
      if (docNumber.length === 8) {
        result = await consultarDNI(docNumber)
      } else if (docNumber.length === 11) {
        result = await consultarRUC(docNumber)
      } else {
        toast.error('El documento debe tener 8 dígitos (DNI) o 11 dígitos (RUC)')
        return
      }

      if (result.success) {
        // Autocompletar datos
        if (docNumber.length === 8) {
          // Datos de DNI
          setManualCustomer(prev => ({
            ...prev,
            name: result.data.nombreCompleto || '',
          }))
          toast.success(`Datos encontrados: ${result.data.nombreCompleto}`)
        } else {
          // Datos de RUC
          setManualCustomer(prev => ({
            ...prev,
            name: result.data.razonSocial || '',
            address: result.data.direccion || '',
          }))
          toast.success(`Datos encontrados: ${result.data.razonSocial}`)
        }
      } else {
        toast.error(result.error || 'No se encontraron datos para este documento', 5000)
      }
    } catch (error) {
      console.error('Error al buscar documento:', error)
      toast.error('Error al consultar el documento. Verifique su conexión.', 5000)
    } finally {
      setIsLookingUpDocument(false)
    }
  }

  const handleCreateCustomer = async () => {
    // Validaciones
    if (!manualCustomer.documentNumber || !manualCustomer.name) {
      toast.error('El número de documento y el nombre son obligatorios')
      return
    }

    // Validar longitud del documento
    if (manualCustomer.documentType === 'DNI' && manualCustomer.documentNumber.length !== 8) {
      toast.error('El DNI debe tener 8 dígitos')
      return
    }

    if (manualCustomer.documentType === 'RUC' && manualCustomer.documentNumber.length !== 11) {
      toast.error('El RUC debe tener 11 dígitos')
      return
    }

    setIsCreatingCustomer(true)

    try {
      const result = await createCustomer(user.uid, manualCustomer)

      if (result.success) {
        toast.success('Cliente creado exitosamente')

        // Recargar clientes
        const customersResult = await getCustomers(user.uid)
        if (customersResult.success) {
          setCustomers(customersResult.data || [])

          // Seleccionar el cliente recién creado
          const newCustomer = customersResult.data.find(c => c.id === result.id)
          if (newCustomer) {
            setSelectedCustomer(newCustomer)
            setCustomerMode('select')
          }
        }

        setShowNewCustomerModal(false)
        setManualCustomer({
          documentType: 'DNI',
          documentNumber: '',
          name: '',
          email: '',
          phone: '',
          address: '',
        })
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al crear cliente:', error)
      toast.error(error.message || 'Error al crear el cliente')
    } finally {
      setIsCreatingCustomer(false)
    }
  }

  const getCustomerData = () => {
    if (customerMode === 'select' && selectedCustomer) {
      return {
        id: selectedCustomer.id,
        documentType: selectedCustomer.documentType,
        documentNumber: selectedCustomer.documentNumber,
        name: selectedCustomer.name,
        businessName: selectedCustomer.businessName || '',
        email: selectedCustomer.email || '',
        phone: selectedCustomer.phone || '',
        address: selectedCustomer.address || '',
      }
    } else if (customerMode === 'manual') {
      return {
        documentType: manualCustomer.documentType,
        documentNumber: manualCustomer.documentNumber,
        name: manualCustomer.name,
        businessName: '',
        email: manualCustomer.email || '',
        phone: manualCustomer.phone || '',
        address: manualCustomer.address || '',
      }
    }
    return null
  }

  const validateForm = () => {
    // Validar que haya datos de cliente
    const customerData = getCustomerData()
    if (!customerData || !customerData.documentNumber || !customerData.name) {
      toast.error('Debe seleccionar o ingresar los datos del cliente')
      return false
    }

    // Validar que haya al menos un item
    if (quotationItems.length === 0) {
      toast.error('Debe agregar al menos un item')
      return false
    }

    // Validar que todos los items tengan datos válidos
    for (let i = 0; i < quotationItems.length; i++) {
      const item = quotationItems[i]
      if (!item.name || !item.quantity || !item.unitPrice) {
        toast.error(`Item ${i + 1}: Todos los campos son obligatorios`)
        return false
      }
      if (parseFloat(item.quantity) <= 0 || parseFloat(item.unitPrice) <= 0) {
        toast.error(`Item ${i + 1}: Cantidad y precio deben ser mayores a 0`)
        return false
      }
    }

    // Validar días de validez
    if (!validityDays || parseFloat(validityDays) <= 0) {
      toast.error('Los días de validez deben ser mayor a 0')
      return false
    }

    return true
  }

  const onSubmit = async () => {
    if (!user?.uid) return

    if (!validateForm()) {
      return
    }

    setIsSaving(true)

    try {
      // Preparar items de la cotización
      const items = quotationItems.map(item => ({
        productId: item.productId || '',
        code: products.find(p => p.id === item.productId)?.code || '',
        name: item.name,
        description: item.description || '',
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        unit: item.unit,
        subtotal: calculateItemTotal(item),
      }))

      // Calcular fecha de expiración
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + parseInt(validityDays))

      // Obtener datos del cliente
      const customerData = getCustomerData()

      if (isEditing) {
        // MODO EDICIÓN: Actualizar cotización existente
        const quotationData = {
          customer: customerData,
          items: items,
          subtotal: baseAmounts.subtotal,
          discount: parseFloat(discount) || 0,
          discountType: discountType,
          discountedSubtotal: discountedSubtotal,
          igv: finalIgv,
          total: finalTotal,
          hideIgv: hideIgv,
          validityDays: parseInt(validityDays),
          expiryDate: expiryDate,
          terms: terms,
          notes: notes,
          recipientName: recipientName,
          recipientPosition: recipientPosition,
          branchId: selectedBranch?.id || null,
          branchName: selectedBranch?.name || null,
          branchAddress: selectedBranch?.address || null,
        }

        const result = await updateQuotation(user.uid, quotationId, quotationData)
        if (!result.success) {
          throw new Error(result.error || 'Error al actualizar la cotización')
        }

        toast.success(`Cotización ${editingQuotationNumber} actualizada exitosamente`)
      } else {
        // MODO CREACIÓN: Crear nueva cotización
        let finalNumber

        if (useCustomNumber && customSeries && customNumber) {
          // Usar serie y número personalizado
          finalNumber = `${customSeries}-${customNumber.padStart(8, '0')}`
        } else {
          // Usar número automático
          const numberResult = await getNextQuotationNumber(user.uid)
          if (!numberResult.success) {
            throw new Error('Error al generar número de cotización')
          }
          finalNumber = numberResult.number
        }

        const quotationData = {
          number: finalNumber,
          customer: customerData,
          items: items,
          subtotal: baseAmounts.subtotal,
          discount: parseFloat(discount) || 0,
          discountType: discountType,
          discountedSubtotal: discountedSubtotal,
          igv: finalIgv,
          total: finalTotal,
          hideIgv: hideIgv,
          validityDays: parseInt(validityDays),
          expiryDate: expiryDate,
          status: 'draft',
          terms: terms,
          notes: notes,
          recipientName: recipientName,
          recipientPosition: recipientPosition,
          customSeries: useCustomNumber ? customSeries : '',
          customNumber: useCustomNumber ? customNumber : '',
          sentVia: [],
          branchId: selectedBranch?.id || null,
          branchName: selectedBranch?.name || null,
          branchAddress: selectedBranch?.address || null,
        }

        const result = await createQuotation(user.uid, quotationData)
        if (!result.success) {
          throw new Error(result.error || 'Error al crear la cotización')
        }

        toast.success(`Cotización ${finalNumber} creada exitosamente`)
      }

      setTimeout(() => {
        navigate('/app/cotizaciones')
      }, 1500)
    } catch (error) {
      console.error('Error al guardar cotización:', error)
      toast.error(error.message || 'Error al guardar la cotización. Inténtalo nuevamente.')
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
              onClick={() => navigate('/app/cotizaciones')}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {isEditing ? `Editar Cotización ${editingQuotationNumber}` : 'Nueva Cotización'}
            </h1>
          </div>
          <p className="text-sm sm:text-base text-gray-600">
            {isEditing ? 'Modifica los datos de la cotización' : 'Crea una nueva cotización para enviar a tus clientes'}
          </p>
        </div>
      </div>

      {/* Main Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Form Fields */}
        <div className="lg:col-span-2 space-y-6">
          {/* Serie y Número (solo en modo creación) */}
          {!isEditing && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="w-5 h-5" />
                  Serie y Numeración
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="useCustomNumber"
                      checked={useCustomNumber}
                      onChange={e => setUseCustomNumber(e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <label htmlFor="useCustomNumber" className="text-sm font-medium text-gray-700">
                      Usar serie y número personalizado
                    </label>
                  </div>

                  {useCustomNumber && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                      <Input
                        label="Serie"
                        value={customSeries}
                        onChange={e => setCustomSeries(e.target.value.toUpperCase())}
                        placeholder="COT"
                        maxLength={4}
                      />
                      <Input
                        label="Número"
                        type="number"
                        value={customNumber}
                        onChange={e => setCustomNumber(e.target.value)}
                        placeholder="1"
                        min="1"
                      />
                      <div className="col-span-2 text-sm text-gray-500">
                        Vista previa: <strong>{customSeries || 'COT'}-{(customNumber || '1').padStart(8, '0')}</strong>
                      </div>
                    </div>
                  )}

                  {!useCustomNumber && (
                    <p className="text-sm text-gray-500">
                      Se generará automáticamente el siguiente número disponible según la configuración de series.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sucursal (solo si hay sucursales configuradas) */}
          {branches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="w-5 h-5" />
                  Sucursal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Selecciona la sucursal desde donde se emite esta cotización. La dirección de la sucursal aparecerá en el documento.
                  </p>
                  <select
                    value={selectedBranch?.id || ''}
                    onChange={(e) => {
                      const branch = branches.find(b => b.id === e.target.value)
                      setSelectedBranch(branch || null)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Sucursal Principal (por defecto)</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name} {branch.address ? `- ${branch.address}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedBranch && (
                    <div className="p-3 bg-gray-50 rounded-lg text-sm">
                      <p className="font-medium text-gray-700">{selectedBranch.name}</p>
                      {selectedBranch.address && (
                        <p className="text-gray-600">{selectedBranch.address}</p>
                      )}
                      {(selectedBranch.district || selectedBranch.province || selectedBranch.department) && (
                        <p className="text-gray-500">
                          {[selectedBranch.district, selectedBranch.province, selectedBranch.department].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cliente */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Información del Cliente</CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNewCustomerModal(true)}
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Nuevo Cliente
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Tabs para seleccionar modo */}
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCustomerMode('select')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      customerMode === 'select'
                        ? 'bg-white text-primary-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Cliente Registrado
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode('manual')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      customerMode === 'manual'
                        ? 'bg-white text-primary-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Datos Manuales
                  </button>
                </div>

                {/* Modo: Seleccionar cliente */}
                {customerMode === 'select' && (
                  <>
                    <Select
                      label="Cliente *"
                      value={selectedCustomer?.id || ''}
                      onChange={e => handleCustomerChange(e.target.value)}
                    >
                      <option value="">Seleccionar cliente...</option>
                      {customers.map(customer => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name} - {customer.documentNumber}
                        </option>
                      ))}
                    </Select>

                    {selectedCustomer && (
                      <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-600">Nombre:</span>
                            <span className="ml-2 font-medium">{selectedCustomer.name}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Documento:</span>
                            <span className="ml-2 font-medium">
                              {selectedCustomer.documentType} {selectedCustomer.documentNumber}
                            </span>
                          </div>
                          {selectedCustomer.email && (
                            <div>
                              <span className="text-gray-600">Email:</span>
                              <span className="ml-2 font-medium">{selectedCustomer.email}</span>
                            </div>
                          )}
                          {selectedCustomer.phone && (
                            <div>
                              <span className="text-gray-600">Teléfono:</span>
                              <span className="ml-2 font-medium">{selectedCustomer.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Modo: Datos manuales */}
                {customerMode === 'manual' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select
                      label="Tipo de Documento *"
                      value={manualCustomer.documentType}
                      onChange={e =>
                        setManualCustomer({ ...manualCustomer, documentType: e.target.value })
                      }
                    >
                      <option value="DNI">DNI</option>
                      <option value="RUC">RUC</option>
                      <option value="CE">Carnet de Extranjería</option>
                      <option value="PASSPORT">Pasaporte</option>
                    </Select>

                    {/* Campo Número de Documento con botón de búsqueda */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Número de Documento <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={manualCustomer.documentNumber}
                          onChange={e =>
                            setManualCustomer({ ...manualCustomer, documentNumber: e.target.value })
                          }
                          placeholder={
                            manualCustomer.documentType === 'DNI'
                              ? '12345678'
                              : manualCustomer.documentType === 'RUC'
                              ? '20123456789'
                              : 'Número'
                          }
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={handleLookupDocument}
                          disabled={isLookingUpDocument}
                          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                          title="Buscar datos del documento"
                        >
                          {isLookingUpDocument ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Ingrese DNI (8 dígitos) o RUC (11 dígitos) y haga clic en buscar
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <Input
                        label="Nombre / Razón Social *"
                        value={manualCustomer.name}
                        onChange={e =>
                          setManualCustomer({ ...manualCustomer, name: e.target.value })
                        }
                        placeholder="Nombre completo o razón social"
                      />
                    </div>

                    <Input
                      type="email"
                      label="Email"
                      value={manualCustomer.email}
                      onChange={e =>
                        setManualCustomer({ ...manualCustomer, email: e.target.value })
                      }
                      placeholder="cliente@email.com"
                    />

                    <Input
                      type="tel"
                      label="Teléfono"
                      value={manualCustomer.phone}
                      onChange={e =>
                        setManualCustomer({ ...manualCustomer, phone: e.target.value })
                      }
                      placeholder="987654321"
                    />

                    <div className="sm:col-span-2">
                      <Input
                        label="Dirección"
                        value={manualCustomer.address}
                        onChange={e =>
                          setManualCustomer({ ...manualCustomer, address: e.target.value })
                        }
                        placeholder="Dirección completa"
                      />
                    </div>
                  </div>
                )}

                {/* Destinatario (dentro del card de cliente) */}
                <div className="pt-4 mt-4 border-t border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Dirigido a (opcional)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Nombre del contacto"
                      value={recipientName}
                      onChange={e => setRecipientName(e.target.value)}
                      placeholder="Ej: Juan Pérez"
                    />
                    <Input
                      label="Cargo"
                      value={recipientPosition}
                      onChange={e => setRecipientPosition(e.target.value)}
                      placeholder="Ej: Gerente de Compras"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Productos / Servicios</CardTitle>
                <Button type="button" size="sm" onClick={addItem}>
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Desktop: Tabla compacta */}
              <div className="hidden lg:block">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 w-[35%]">Producto</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[8%]">Cant.</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[18%]">Unidad</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[14%]">P. Unit.</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3 w-[14%]">Subtotal</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[5%]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {quotationItems.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        {/* Producto - búsqueda inline */}
                        <td className="px-4 py-2">
                          <div className="relative">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="text"
                                value={item.productId ? item.name : item.searchTerm}
                                onChange={e => {
                                  if (item.productId) {
                                    updateItem(index, 'name', e.target.value)
                                  } else {
                                    updateItem(index, 'searchTerm', e.target.value)
                                    setShowProductSearch(index)
                                  }
                                }}
                                onFocus={() => !item.productId && setShowProductSearch(index)}
                                placeholder="Buscar producto o escribir nombre..."
                                className={`w-full pl-7 pr-7 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                  item.productId ? 'border-green-500 bg-green-50' : 'border-gray-300'
                                }`}
                              />
                              {item.productId && (
                                <button
                                  type="button"
                                  onClick={() => clearProductSelection(index)}
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            {/* Dropdown de resultados */}
                            {showProductSearch === index && !item.productId && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setShowProductSearch(null)}
                                />
                                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                  {getFilteredProducts(item.searchTerm).length > 0 ? (
                                    getFilteredProducts(item.searchTerm).map(product => {
                                      const hasPresentations = businessSettings?.presentationsEnabled &&
                                                               product.presentations?.length > 0
                                      const hasMultiplePrices = businessSettings?.multiplePricesEnabled &&
                                                                (product.price2 || product.price3 || product.price4)
                                      return (
                                        <button
                                          key={product.id}
                                          type="button"
                                          onClick={() => selectProduct(index, product)}
                                          className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              <p className="font-medium text-sm truncate">{product.name}</p>
                                              {hasMultiplePrices && (
                                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 flex-shrink-0">
                                                  <Tag className="w-2.5 h-2.5 mr-0.5" />
                                                  Precios
                                                </span>
                                              )}
                                              {hasPresentations && (
                                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 flex-shrink-0">
                                                  <Package className="w-2.5 h-2.5 mr-0.5" />
                                                  Pres.
                                                </span>
                                              )}
                                            </div>
                                            {product.code && (
                                              <p className="text-xs text-gray-500">{product.code}</p>
                                            )}
                                          </div>
                                          <span className="text-sm font-semibold text-primary-600 ml-2 flex-shrink-0">
                                            {formatCurrency(product.price)}
                                          </span>
                                        </button>
                                      )
                                    })
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                      No se encontraron productos
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        {/* Cantidad */}
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity}
                            onChange={e => updateItem(index, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                        {/* Unidad */}
                        <td className="px-2 py-2">
                          <select
                            value={item.unit}
                            onChange={e => updateItem(index, 'unit', e.target.value)}
                            className="w-full px-1 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                          >
                            {UNITS.map(unit => (
                              <option key={unit.value} value={unit.value}>
                                {unit.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* Precio Unitario */}
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={e => updateItem(index, 'unitPrice', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                        {/* Subtotal */}
                        <td className="px-4 py-2 text-right">
                          <span className="font-semibold text-sm text-gray-900">
                            {formatCurrency(calculateItemTotal(item))}
                          </span>
                        </td>
                        {/* Eliminar */}
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            disabled={quotationItems.length === 1}
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Móvil: Lista compacta */}
              <div className="lg:hidden divide-y divide-gray-200">
                {quotationItems.map((item, index) => (
                  <div key={index} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500">#{index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        disabled={quotationItems.length === 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Búsqueda de producto */}
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={item.productId ? item.name : item.searchTerm}
                          onChange={e => {
                            if (item.productId) {
                              updateItem(index, 'name', e.target.value)
                            } else {
                              updateItem(index, 'searchTerm', e.target.value)
                              setShowProductSearch(index)
                            }
                          }}
                          onFocus={() => !item.productId && setShowProductSearch(index)}
                          placeholder="Buscar producto o escribir nombre..."
                          className={`w-full pl-8 pr-8 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                            item.productId ? 'border-green-500 bg-green-50' : 'border-gray-300'
                          }`}
                        />
                        {item.productId && (
                          <button
                            type="button"
                            onClick={() => clearProductSelection(index)}
                            className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {/* Dropdown de resultados */}
                      {showProductSearch === index && !item.productId && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowProductSearch(null)}
                          />
                          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {getFilteredProducts(item.searchTerm).length > 0 ? (
                              getFilteredProducts(item.searchTerm).map(product => {
                                const hasPresentations = businessSettings?.presentationsEnabled &&
                                                         product.presentations?.length > 0
                                const hasMultiplePrices = businessSettings?.multiplePricesEnabled &&
                                                          (product.price2 || product.price3 || product.price4)
                                return (
                                  <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => selectProduct(index, product)}
                                    className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p className="font-medium text-sm truncate">{product.name}</p>
                                        {hasMultiplePrices && (
                                          <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 flex-shrink-0">
                                            <Tag className="w-2.5 h-2.5 mr-0.5" />
                                            Precios
                                          </span>
                                        )}
                                        {hasPresentations && (
                                          <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 flex-shrink-0">
                                            <Package className="w-2.5 h-2.5 mr-0.5" />
                                            Pres.
                                          </span>
                                        )}
                                      </div>
                                      {product.code && (
                                        <p className="text-xs text-gray-500">{product.code}</p>
                                      )}
                                    </div>
                                    <span className="text-sm font-semibold text-primary-600 ml-2 flex-shrink-0">
                                      {formatCurrency(product.price)}
                                    </span>
                                  </button>
                                )
                              })
                            ) : (
                              <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                No se encontraron productos
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Unidad */}
                    <select
                      value={item.unit}
                      onChange={e => updateItem(index, 'unit', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                    >
                      {UNITS.map(unit => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>

                    {/* Cant | P.Unit | Subtotal */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Cant.</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantity}
                          onChange={e => updateItem(index, 'quantity', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">P. Unit.</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={e => updateItem(index, 'unitPrice', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Subtotal</label>
                        <div className="h-[34px] flex items-center justify-center bg-gray-50 border border-gray-200 rounded">
                          <span className="font-semibold text-sm text-gray-900">
                            {formatCurrency(calculateItemTotal(item))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Configuración Adicional */}
          <Card>
            <CardHeader>
              <CardTitle>Configuración Adicional</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    type="number"
                    label="Validez (días) *"
                    value={validityDays}
                    onChange={e => setValidityDays(e.target.value)}
                    min="1"
                    help="Días de validez de la cotización"
                  />

                  <Select
                    label="Tipo de Descuento"
                    value={discountType}
                    onChange={e => setDiscountType(e.target.value)}
                  >
                    <option value="fixed">Monto Fijo (S/)</option>
                    <option value="percentage">Porcentaje (%)</option>
                  </Select>

                  <Input
                    type="number"
                    label={`Descuento ${discountType === 'percentage' ? '(%)' : '(S/)'}`}
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="hideIgv"
                    checked={hideIgv}
                    onChange={e => setHideIgv(e.target.checked)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="hideIgv" className="ml-2 text-sm font-medium text-gray-700">
                    Ocultar IGV (mostrar solo total)
                  </label>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Términos y Condiciones
                    </label>
                    {businessSettings?.termsTemplates?.length > 0 && (
                      <select
                        onChange={e => {
                          const template = businessSettings.termsTemplates.find(t => t.id === e.target.value)
                          if (template) {
                            setTerms(template.content)
                          }
                        }}
                        className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        defaultValue=""
                      >
                        <option value="" disabled>Usar plantilla...</option>
                        {businessSettings.termsTemplates.map(template => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <textarea
                    value={terms}
                    onChange={e => setTerms(e.target.value)}
                    rows="6"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Ejemplo: Precios sujetos a cambio sin previo aviso. Válido solo para pedidos confirmados..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observaciones
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows="4"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Observaciones adicionales..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Summary */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2 text-sm">
                  {discount > 0 && (
                    <>
                      {!hideIgv && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Subtotal:</span>
                          <span className="font-medium">{formatCurrency(baseAmounts.subtotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-red-600">
                        <span>
                          Descuento {discountType === 'percentage' ? `(${discount}%)` : ''}:
                        </span>
                        <span className="font-medium">- {formatCurrency(discountAmount)}</span>
                      </div>
                    </>
                  )}
                  {!hideIgv && (
                    <>
                      {discount > 0 && (
                        <div className="flex justify-between pt-2 border-t">
                          <span className="text-gray-600">Subtotal con descuento:</span>
                          <span className="font-medium">{formatCurrency(discountedSubtotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">{isIgvExempt ? 'OP. EXONERADA:' : 'IGV (18%):'}</span>
                        <span className="font-medium">{formatCurrency(finalIgv)}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-900">Total:</span>
                    <span className="text-2xl font-bold text-primary-600">
                      {formatCurrency(finalTotal)}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-2 text-sm text-gray-600">
                  <p>
                    <strong>Items:</strong> {quotationItems.length}
                  </p>
                  <p>
                    <strong>Validez:</strong> {validityDays} días
                  </p>
                  {customerMode === 'select' && selectedCustomer && (
                    <p>
                      <strong>Cliente:</strong> {selectedCustomer.name}
                    </p>
                  )}
                  {customerMode === 'manual' && manualCustomer.name && (
                    <p>
                      <strong>Cliente:</strong> {manualCustomer.name}
                    </p>
                  )}
                </div>

                <div className="pt-4">
                  <Button onClick={onSubmit} disabled={isSaving} className="w-full">
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {isEditing ? 'Actualizando...' : 'Guardando...'}
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {isEditing ? 'Guardar Cambios' : 'Crear Cotización'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal: Nuevo Cliente */}
      <Modal
        isOpen={showNewCustomerModal}
        onClose={() => !isCreatingCustomer && setShowNewCustomerModal(false)}
        title="Crear Nuevo Cliente"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Tipo de Documento *"
              value={manualCustomer.documentType}
              onChange={e =>
                setManualCustomer({ ...manualCustomer, documentType: e.target.value })
              }
            >
              <option value="DNI">DNI</option>
              <option value="RUC">RUC</option>
              <option value="CE">Carnet de Extranjería</option>
              <option value="PASSPORT">Pasaporte</option>
            </Select>

            <Input
              label="Número de Documento *"
              value={manualCustomer.documentNumber}
              onChange={e =>
                setManualCustomer({ ...manualCustomer, documentNumber: e.target.value })
              }
              placeholder={
                manualCustomer.documentType === 'DNI'
                  ? '12345678'
                  : manualCustomer.documentType === 'RUC'
                  ? '20123456789'
                  : 'Número'
              }
            />

            <div className="sm:col-span-2">
              <Input
                label="Nombre / Razón Social *"
                value={manualCustomer.name}
                onChange={e => setManualCustomer({ ...manualCustomer, name: e.target.value })}
                placeholder="Nombre completo o razón social"
              />
            </div>

            <Input
              type="email"
              label="Email"
              value={manualCustomer.email}
              onChange={e => setManualCustomer({ ...manualCustomer, email: e.target.value })}
              placeholder="cliente@email.com"
            />

            <Input
              type="tel"
              label="Teléfono"
              value={manualCustomer.phone}
              onChange={e => setManualCustomer({ ...manualCustomer, phone: e.target.value })}
              placeholder="987654321"
            />

            <div className="sm:col-span-2">
              <Input
                label="Dirección"
                value={manualCustomer.address}
                onChange={e => setManualCustomer({ ...manualCustomer, address: e.target.value })}
                placeholder="Dirección completa"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowNewCustomerModal(false)}
              disabled={isCreatingCustomer}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateCustomer} disabled={isCreatingCustomer}>
              {isCreatingCustomer ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Crear y Usar
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Selección de Precio */}
      <Modal
        isOpen={showPriceModal}
        onClose={cancelPendingSelection}
        title="Seleccionar Precio"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Este producto tiene múltiples precios. Seleccione el precio que desea usar para la cotización:
          </p>
          <p className="font-medium text-gray-900">
            {pendingProductSelection?.product?.name}
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Precio 1 */}
            <button
              type="button"
              onClick={() => handlePriceSelection('price1')}
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2 mb-1">
                <Tag className="w-4 h-4 text-primary-600" />
                <span className="text-sm font-medium text-gray-700">
                  {businessSettings?.priceLabels?.price1 || 'Precio 1'}
                </span>
              </div>
              <p className="text-lg font-bold text-primary-600">
                {formatCurrency(pendingProductSelection?.product?.price || 0)}
              </p>
            </button>

            {/* Precio 2 */}
            {pendingProductSelection?.product?.price2 && (
              <button
                type="button"
                onClick={() => handlePriceSelection('price2')}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {businessSettings?.priceLabels?.price2 || 'Precio 2'}
                  </span>
                </div>
                <p className="text-lg font-bold text-green-600">
                  {formatCurrency(pendingProductSelection?.product?.price2)}
                </p>
              </button>
            )}

            {/* Precio 3 */}
            {pendingProductSelection?.product?.price3 && (
              <button
                type="button"
                onClick={() => handlePriceSelection('price3')}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {businessSettings?.priceLabels?.price3 || 'Precio 3'}
                  </span>
                </div>
                <p className="text-lg font-bold text-blue-600">
                  {formatCurrency(pendingProductSelection?.product?.price3)}
                </p>
              </button>
            )}

            {/* Precio 4 */}
            {pendingProductSelection?.product?.price4 && (
              <button
                type="button"
                onClick={() => handlePriceSelection('price4')}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {businessSettings?.priceLabels?.price4 || 'Precio 4'}
                  </span>
                </div>
                <p className="text-lg font-bold text-purple-600">
                  {formatCurrency(pendingProductSelection?.product?.price4)}
                </p>
              </button>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={cancelPendingSelection}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Selección de Presentación */}
      <Modal
        isOpen={showPresentationModal}
        onClose={cancelPendingSelection}
        title="Seleccionar Presentación"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Este producto tiene diferentes presentaciones. Seleccione la presentación que desea cotizar:
          </p>
          <p className="font-medium text-gray-900">
            {pendingProductSelection?.product?.name}
          </p>

          <div className="space-y-2">
            {/* Unidad base */}
            <button
              type="button"
              onClick={() => selectProduct(
                pendingProductSelection?.index,
                pendingProductSelection?.product,
                pendingProductSelection?.product?.price,
                null
              )}
              className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="font-medium">Unidad</p>
                  <p className="text-xs text-gray-500">Presentación base</p>
                </div>
              </div>
              <p className="text-lg font-bold text-primary-600">
                {formatCurrency(pendingProductSelection?.product?.price || 0)}
              </p>
            </button>

            {/* Presentaciones disponibles */}
            {pendingProductSelection?.product?.presentations?.map((presentation, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handlePresentationSelection(presentation)}
                className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-primary-500" />
                  <div>
                    <p className="font-medium">{presentation.name}</p>
                    <p className="text-xs text-gray-500">
                      {presentation.factor} unidades
                    </p>
                  </div>
                </div>
                <p className="text-lg font-bold text-primary-600">
                  {formatCurrency(presentation.price)}
                </p>
              </button>
            ))}
          </div>

          {/* Info de stock por presentación */}
          {pendingProductSelection?.product?.stock != null && (
            <div className="p-3 bg-gray-50 rounded-lg space-y-1">
              <p className="text-xs font-medium text-gray-700">Stock disponible:</p>
              <p className="text-sm text-gray-600">
                <span className="font-semibold">{pendingProductSelection.product.stock}</span> unidades
              </p>
              {pendingProductSelection.product.presentations?.map((pres, idx) => {
                const equivalentQty = Math.floor(pendingProductSelection.product.stock / pres.factor)
                return (
                  <p key={idx} className="text-sm text-gray-600">
                    <span className="font-semibold">{equivalentQty}</span> {pres.name} <span className="text-gray-400">(x{pres.factor} unid.)</span>
                  </p>
                )
              })}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={cancelPendingSelection}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
