import { useState, useEffect, useMemo, Fragment } from 'react'
import { ArrowUpFromLine, Plus, Search, Loader2, Trash2, Package, Calendar, User, MapPin, ScanBarcode, ChevronDown, ChevronUp, HardHat, Download, FileText, PackageMinus, BarChart3, FileSpreadsheet } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useBranding } from '@/contexts/BrandingContext'
import { getWarehouseExits, createWarehouseExit } from '@/services/warehouseExitService'
import { getProjects } from '@/services/projectService'
import { getProducts } from '@/services/firestoreService'
import { getWarehouses } from '@/services/warehouseService'
import { downloadLogisticsMovementPDF } from '@/utils/logisticsPdfGenerator'
import { getCompanySettings, saveCompanySettings } from '@/services/firestoreService'
import { getExitReasons, getCustomExitReasons, isCustomExitReason, buildCustomExitReason } from '@/utils/warehouseExitReasons'
import { groupExitsByProject } from '@/utils/exitCosting'
import { generateExitReportExcel } from '@/services/exitReportExportService'
import CreateDispatchGuideModal from '@/components/CreateDispatchGuideModal'
import { useLocationAccess } from '@/utils/locationAccess'
import { matchesSearchQuery, formatCurrency } from '@/lib/utils'

export default function WarehouseExits() {
  const { user, getBusinessId, isDemoMode, demoData, filterWarehousesByAccess, allowedBranches, allowedWarehouses } = useAppContext()
  // Seguridad: el usuario secundario solo ve salidas de sus almacenes habilitados
  const canAccess = useLocationAccess()
  const toast = useToast()
  const { branding } = useBranding()

  const [exits, setExits] = useState([])
  const [projects, setProjects] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [businessInfo, setBusinessInfo] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'project' | 'simple'
  const [expandedId, setExpandedId] = useState(null)
  const [guideReference, setGuideReference] = useState(null)

  // Estado del formulario
  const [exitType, setExitType] = useState('project') // 'project' | 'simple'
  const [selectedProject, setSelectedProject] = useState('')
  const [simpleReason, setSimpleReason] = useState('office_use')
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([])
  const [productSearch, setProductSearch] = useState('')

  // Motivos para salida simple (sin proyecto): los de siempre + los del negocio.
  const SIMPLE_REASONS = getExitReasons(businessInfo)

  // Alta de un motivo propio, desde el mismo modal.
  const [isAddingReason, setIsAddingReason] = useState(false)
  const [newReasonLabel, setNewReasonLabel] = useState('')
  const [isSavingReason, setIsSavingReason] = useState(false)

  // Reporte de consumo por obra
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [isExportingReport, setIsExportingReport] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState(null)
  const [reportFilters, setReportFilters] = useState({
    startDate: '',
    endDate: '',
    warehouseId: 'all',
    includeSimple: true,
  })

  useEffect(() => {
    loadData()
  }, [user, allowedBranches, allowedWarehouses])

  const loadData = async () => {
    if (!user?.uid) return
    setIsLoading(true)
    try {
      if (isDemoMode) {
        setExits((demoData?.warehouseExits || []).filter(canAccess))
        setProjects(demoData?.projects || [])
        setProducts(demoData?.products || [])
        setWarehouses(filterWarehousesByAccess ? filterWarehousesByAccess(demoData?.warehouses || []) : (demoData?.warehouses || []))
        setBusinessInfo(demoData?.business || {})
        setIsLoading(false)
        return
      }
      const businessId = getBusinessId()
      const [exitsResult, projectsResult, productsResult, warehousesResult, settingsResult] = await Promise.all([
        getWarehouseExits(businessId),
        getProjects(businessId),
        getProducts(businessId),
        getWarehouses(businessId),
        getCompanySettings(businessId),
      ])
      if (exitsResult.success) setExits((exitsResult.data || []).filter(canAccess))
      if (projectsResult.success) setProjects(projectsResult.data || [])
      if (productsResult.success) setProducts(productsResult.data || [])
      if (warehousesResult.success) setWarehouses(filterWarehousesByAccess ? filterWarehousesByAccess(warehousesResult.data || []) : (warehousesResult.data || []))
      if (settingsResult?.success) setBusinessInfo(settingsResult.data || {})
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const activeProjects = projects.filter(p => p.status === 'active')

  const openCreateModal = (initialType = 'project') => {
    setExitType(initialType)
    setSelectedProject('')
    setSimpleReason('office_use')
    setIsAddingReason(false)
    setNewReasonLabel('')
    setSelectedWarehouse(warehouses.find(w => w.isDefault)?.id || warehouses[0]?.id || '')
    setNotes('')
    setItems([])
    setProductSearch('')
    setIsModalOpen(true)
  }

  /**
   * Guarda un motivo propio y lo deja seleccionado.
   *
   * Se persiste en la configuración del negocio (`customExitReasons`), no en la
   * salida: el punto es que la próxima vez ya esté en la lista.
   */
  const handleAddReason = async () => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    const built = buildCustomExitReason(newReasonLabel, businessInfo)
    if (!built.ok) {
      toast.error(built.error)
      return
    }
    setIsSavingReason(true)
    try {
      const nuevos = [...(businessInfo?.customExitReasons || []), built.reason]
      const result = await saveCompanySettings(getBusinessId(), { customExitReasons: nuevos })
      if (!result?.success) throw new Error(result?.error || 'No se pudo guardar')

      // Estado local al día sin recargar toda la página: el modal está abierto y
      // recargar lo cerraría con el carrito de items a medio armar.
      setBusinessInfo(prev => ({ ...prev, customExitReasons: nuevos }))
      setSimpleReason(built.reason.value)
      setNewReasonLabel('')
      setIsAddingReason(false)
      toast.success(`Motivo "${built.reason.label}" agregado`)
    } catch (error) {
      console.error('Error al agregar motivo:', error)
      toast.error('No se pudo agregar el motivo. Inténtalo nuevamente.')
    } finally {
      setIsSavingReason(false)
    }
  }

  /**
   * Quita un motivo propio de la lista. Las salidas ya registradas con él no se
   * tocan: guardan su `reasonLabel`, así que siguen mostrando lo que decían.
   */
  const handleDeleteReason = async (value) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    const actual = getCustomExitReasons(businessInfo).find(r => r.value === value)
    if (!actual) return
    if (!window.confirm(`¿Quitar el motivo "${actual.label}"?\n\nLas salidas ya registradas con este motivo no cambian.`)) return

    try {
      const nuevos = (businessInfo?.customExitReasons || []).filter(r => {
        const v = String(r.value || '').trim() || `custom_${r.id || ''}`
        return v !== value
      })
      const result = await saveCompanySettings(getBusinessId(), { customExitReasons: nuevos })
      if (!result?.success) throw new Error(result?.error || 'No se pudo guardar')

      setBusinessInfo(prev => ({ ...prev, customExitReasons: nuevos }))
      if (simpleReason === value) setSimpleReason('office_use')
      toast.success('Motivo eliminado')
    } catch (error) {
      console.error('Error al eliminar motivo:', error)
      toast.error('No se pudo eliminar el motivo.')
    }
  }

  // === Reporte de consumo por obra ===

  /** Fecha de una salida como Date, o null. */
  const exitDate = (exit) => {
    const raw = exit?.createdAt
    if (!raw) return null
    const d = raw.toDate ? raw.toDate() : new Date(raw)
    return isNaN(d.getTime()) ? null : d
  }

  const openReportModal = () => {
    // Arranca en el MES EN CURSO: el caso que pidió el usuario es cerrar el mes
    // y ver cuánto se consumió en cada obra.
    const hoy = new Date()
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const toInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setReportFilters({
      startDate: toInput(primero),
      endDate: toInput(hoy),
      warehouseId: 'all',
      includeSimple: true,
    })
    setExpandedGroup(null)
    setIsReportOpen(true)
  }

  /** Salidas que entran al reporte. Parte de las que el usuario puede ver. */
  const reportExits = useMemo(() => {
    let rows = exits.filter(canAccess)

    if (!reportFilters.includeSimple) {
      rows = rows.filter(e => e.exitType !== 'simple' && e.projectId)
    }
    if (reportFilters.warehouseId !== 'all') {
      rows = rows.filter(e => e.warehouseId === reportFilters.warehouseId)
    }
    if (reportFilters.startDate) {
      const [y, m, d] = reportFilters.startDate.split('-').map(Number)
      const desde = new Date(y, m - 1, d, 0, 0, 0, 0)
      rows = rows.filter(e => { const f = exitDate(e); return f && f >= desde })
    }
    if (reportFilters.endDate) {
      const [y, m, d] = reportFilters.endDate.split('-').map(Number)
      const hasta = new Date(y, m - 1, d, 23, 59, 59, 999)
      rows = rows.filter(e => { const f = exitDate(e); return f && f <= hasta })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exits, reportFilters])

  const reportData = useMemo(
    () => groupExitsByProject(reportExits, products),
    [reportExits, products]
  )

  /** Etiqueta del período, para el encabezado del Excel. */
  const reportPeriodLabel = () => {
    const fmt = (s) => {
      if (!s) return ''
      const [y, m, d] = s.split('-')
      return `${d}/${m}/${y}`
    }
    if (reportFilters.startDate && reportFilters.endDate) return `${fmt(reportFilters.startDate)} - ${fmt(reportFilters.endDate)}`
    if (reportFilters.startDate) return `Desde ${fmt(reportFilters.startDate)}`
    if (reportFilters.endDate) return `Hasta ${fmt(reportFilters.endDate)}`
    return 'Todas las fechas'
  }

  const handleExportReport = async () => {
    if (reportExits.length === 0) {
      toast.error('No hay salidas en el período seleccionado')
      return
    }
    setIsExportingReport(true)
    try {
      await generateExitReportExcel(reportExits, products, businessInfo, {
        periodLabel: reportPeriodLabel(),
        warehouseLabel: reportFilters.warehouseId === 'all'
          ? 'Todos'
          : (warehouses.find(w => w.id === reportFilters.warehouseId)?.name || 'Todos'),
      })
      toast.success('Reporte exportado exitosamente')
    } catch (error) {
      console.error('Error al exportar el reporte:', error)
      toast.error('Error al generar el archivo Excel')
    } finally {
      setIsExportingReport(false)
    }
  }

  const addProduct = (product) => {
    // Producto con variantes: agregar una fila por cada variante con stock > 0
    if (product.hasVariants && product.variants?.length > 0) {
      const variantRows = product.variants
        .filter(v => {
          const ws = (v.warehouseStocks || []).find(s => s.warehouseId === selectedWarehouse)
          return ws && ws.stock > 0
        })
        .filter(v => !items.some(i => i.productId === product.id && i.variantSku === v.sku))
        .map(v => {
          const ws = (v.warehouseStocks || []).find(s => s.warehouseId === selectedWarehouse)
          const variantLabel = Object.values(v.attributes || {}).join(' / ')
          return {
            productId: product.id,
            productName: product.name,
            productCode: product.code || product.barcode || '',
            quantity: 1,
            unit: product.unit || 'und',
            availableStock: ws?.stock || 0,
            variantSku: v.sku,
            variantLabel,
            isVariant: true,
            allowDecimalQuantity: product.allowDecimalQuantity === true,
            // Costo CONGELADO al momento de la salida. Sin esto, el valor de lo
            // consumido por una obra cambiaría cada vez que se recalcula el costo
            // del producto, y un reporte de mes cerrado dejaría de cuadrar.
            unitCost: Number(v.cost) || Number(product.cost) || 0,
          }
        })

      if (variantRows.length === 0) {
        const anyVariantHasStock = product.variants.some(v =>
          (v.warehouseStocks || []).some(s => s.warehouseId === selectedWarehouse && s.stock > 0)
        )
        if (!anyVariantHasStock) {
          toast.error(`"${product.name}" no tiene variantes con stock en este almacén`)
        } else {
          toast.info(`Todas las variantes con stock de "${product.name}" ya están agregadas`)
        }
        setProductSearch('')
        return
      }
      setItems([...items, ...variantRows])
      setProductSearch('')
      return
    }

    // Producto sin variantes: flujo normal
    const stock = getProductStock(product)
    if (stock <= 0) {
      toast.error(`"${product.name}" no tiene stock disponible en este almacén`)
      return
    }
    const existing = items.find(i => i.productId === product.id && !i.variantSku)
    if (existing) {
      if (existing.hasSerials) {
        toast.info(`"${product.name}" ya está agregado: selecciona las series abajo`)
        setProductSearch('')
        return
      }
      // Ya existe, incrementar cantidad (con tope por stock)
      if ((parseFloat(existing.quantity) || 0) >= stock) {
        toast.error(`Ya agregaste el máximo disponible de "${product.name}" (${stock})`)
        return
      }
      setItems(items.map(i => i.productId === product.id && !i.variantSku
        ? { ...i, quantity: (parseFloat(i.quantity) || 0) + 1 }
        : i))
    } else {
      const availableSerials = product.trackSerials
        ? (product.serials || []).filter(s => s.status === 'available' && (!s.warehouseId || s.warehouseId === selectedWarehouse))
        : []
      setItems([...items, {
        productId: product.id,
        productName: product.name,
        productCode: product.code || product.barcode || '',
        quantity: 1,
        unit: product.unit || 'und',
        availableStock: stock,
        serials: availableSerials,
        hasSerials: product.trackSerials && availableSerials.length > 0,
        selectedSerials: [],
        allowDecimalQuantity: product.allowDecimalQuantity === true,
        // Costo CONGELADO al momento de la salida (ver nota en las variantes).
        unitCost: Number(product.cost) || 0,
      }])
    }
    setProductSearch('')
  }

  const toggleExitSerial = (productId, serialNumber) => {
    setItems(items.map(i => {
      if (i.productId !== productId || i.variantSku) return i
      const current = i.selectedSerials || []
      const newSelected = current.includes(serialNumber)
        ? current.filter(sn => sn !== serialNumber)
        : [...current, serialNumber]
      return { ...i, selectedSerials: newSelected, quantity: newSelected.length || 1 }
    }))
  }

  const getProductStock = (product) => {
    // Producto con variantes: sumar stock de todas las variantes en el almacén seleccionado
    if (product.hasVariants && product.variants?.length > 0) {
      if (!selectedWarehouse) {
        return product.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
      }
      return product.variants.reduce((sum, v) => {
        const ws = (v.warehouseStocks || []).find(s => s.warehouseId === selectedWarehouse)
        return sum + (ws?.stock || 0)
      }, 0)
    }

    // Producto sin variantes
    if (!selectedWarehouse) return product.stock || 0
    const ws = product.warehouseStocks?.find(w => w.warehouseId === selectedWarehouse)
    return ws ? ws.stock : (product.stock || 0)
  }

  // Matchear una fila por productId + variantSku (soporte para productos con variantes)
  const rowMatches = (i, productId, variantSku) =>
    i.productId === productId && (i.variantSku || null) === (variantSku || null)

  const updateItemQuantity = (productId, variantSku, value) => {
    setItems(items.map(i => {
      if (!rowMatches(i, productId, variantSku)) return i
      // Productos con decimales (peso/volumen): guardar el texto crudo mientras se
      // escribe (permite teclear "1.5", "0.25", "1.") y parsear en el blur. Resto:
      // entero como antes.
      const raw = value === '' ? '' : (i.allowDecimalQuantity ? value : (parseInt(value) || ''))
      const num = parseFloat(raw)
      const exceeds = !isNaN(num) && num > (i.availableStock || 0)
      return { ...i, quantity: raw, exceedsStock: exceeds }
    }))
  }

  const finalizeItemQuantity = (productId, variantSku) => {
    setItems(items.map(i => {
      if (!rowMatches(i, productId, variantSku)) return i
      const maxStock = i.availableStock || 0
      let parsed = i.allowDecimalQuantity ? parseFloat(i.quantity) : parseInt(i.quantity)
      if (!parsed || isNaN(parsed) || parsed <= 0) parsed = 1
      if (i.allowDecimalQuantity) parsed = Math.round(parsed * 1000) / 1000 // hasta 3 decimales
      // Tope por stock. El mínimo es el propio valor (>0): no forzar a 1, así 0.5 es válido.
      const clamped = maxStock > 0 ? Math.min(parsed, maxStock) : parsed
      if (parsed > maxStock && maxStock > 0) {
        const who = i.variantLabel ? `${i.productName} (${i.variantLabel})` : i.productName
        toast.error(`Stock máximo de "${who}" es ${maxStock}. Se ajustó la cantidad.`)
      }
      return { ...i, quantity: clamped, exceedsStock: false }
    }))
  }

  const removeItem = (productId, variantSku) => {
    setItems(items.filter(i => !rowMatches(i, productId, variantSku)))
  }

  const handleScanBarcode = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast.info('El escáner solo está disponible en la app móvil')
      return
    }
    try {
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
      if (Capacitor.getPlatform() === 'android') {
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
        if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule()
      }
      const { camera } = await BarcodeScanner.checkPermissions()
      if (camera !== 'granted') await BarcodeScanner.requestPermissions()

      const { barcodes } = await BarcodeScanner.scan()
      await BarcodeScanner.stopScan().catch(() => {})

      if (barcodes?.length > 0) {
        const code = barcodes[0].rawValue
        const found = products.find(p =>
          p.code === code ||
          p.barcode === code ||
          p.sku === code ||
          (Array.isArray(p.barcodes) && p.barcodes.includes(code))
        )
        if (found) {
          addProduct(found)
          toast.success(`${found.name} agregado`)
        } else {
          toast.error(`Producto no encontrado: ${code}`)
        }
      }
    } catch (error) {
      console.error('Error scanner:', error)
      toast.error('Error al escanear')
    }
  }

  const handleSubmit = async () => {
    // Validaciones según tipo de salida
    if (exitType === 'project' && !selectedProject) { toast.error('Selecciona un proyecto'); return }
    if (exitType === 'simple' && !simpleReason) { toast.error('Selecciona un motivo'); return }
    if (!selectedWarehouse) { toast.error('Selecciona un almacén'); return }
    if (items.length === 0) { toast.error('Agrega al menos un producto'); return }
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }

    // Validar que ningún item exceda el stock disponible
    const overStock = items.find(i => (parseFloat(i.quantity) || 0) > (i.availableStock || 0))
    if (overStock) {
      toast.error(`Cantidad inválida: "${overStock.productName}" solicita ${overStock.quantity} pero hay ${overStock.availableStock} en stock.`)
      return
    }
    // Validar que ningún item tenga cantidad <= 0 (parseFloat: acepta decimales como 0.5)
    const invalidQty = items.find(i => !(parseFloat(i.quantity) > 0))
    if (invalidQty) {
      toast.error(`Ingresa una cantidad válida para "${invalidQty.productName}"`)
      return
    }
    // Validar series seleccionadas para productos serializados
    const missingSerials = items.find(i => i.hasSerials && (!i.selectedSerials || i.selectedSerials.length === 0))
    if (missingSerials) {
      toast.error(`Selecciona las series a enviar de "${missingSerials.productName}"`)
      return
    }

    setIsSaving(true)
    try {
      const warehouse = warehouses.find(w => w.id === selectedWarehouse)

      // Construir el payload según el tipo
      const basePayload = {
        exitType,
        warehouseId: selectedWarehouse,
        warehouseName: warehouse?.name || '',
        items: items.map(({ productId, productName, productCode, quantity, unit, variantSku, variantLabel, selectedSerials, unitCost }) => {
          // Normalizar a número (hasta 3 decimales) por si quedó como texto sin blur
          const qty = Math.round((parseFloat(quantity) || 0) * 1000) / 1000
          const costo = Number(unitCost) || 0
          return {
            productId, productName, productCode,
            quantity: qty,
            unit, variantSku: variantSku || null,
            variantLabel: variantLabel || null,
            selectedSerials: selectedSerials || [],
            // Costo unitario CONGELADO + total de la línea, para el reporte de
            // valor consumido por obra.
            unitCost: costo,
            totalCost: Math.round(qty * costo * 100) / 100,
          }
        }),
        // Valor total de la salida, precalculado: los reportes suman esto en vez
        // de recorrer los items de cada salida.
        totalCost: Math.round(
          items.reduce((s, i) => {
            const qty = Math.round((parseFloat(i.quantity) || 0) * 1000) / 1000
            return s + qty * (Number(i.unitCost) || 0)
          }, 0) * 100
        ) / 100,
        notes,
        userId: user.uid,
        userName: user.displayName || user.email || '',
      }

      let payload
      if (exitType === 'project') {
        const project = projects.find(p => p.id === selectedProject)
        payload = {
          ...basePayload,
          projectId: selectedProject,
          projectName: project?.name || '',
          projectCode: project?.code || '',
        }
      } else {
        const reasonObj = SIMPLE_REASONS.find(r => r.value === simpleReason)
        payload = {
          ...basePayload,
          projectId: null,
          projectName: '',
          projectCode: '',
          reason: simpleReason,
          reasonLabel: reasonObj?.label || 'Uso interno',
        }
      }

      const result = await createWarehouseExit(getBusinessId(), payload)

      if (result.success) {
        toast.success('Salida registrada exitosamente')
        setIsModalOpen(false)
        loadData()
      } else {
        toast.error(result.error || 'Error al registrar salida')
      }
    } catch (error) {
      toast.error('Error inesperado')
    } finally {
      setIsSaving(false)
    }
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return '-'
    if (timestamp.toDate) return timestamp.toDate().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    return '-'
  }

  // Filtrar salidas
  const filtered = exits.filter(e => {
    // Seguridad: respetar almacén permitido (además del saneo en la carga)
    if (!canAccess(e)) return false
    // Filtro por tipo (default legacy: sin exitType = 'project')
    const itemType = e.exitType || 'project'
    if (typeFilter !== 'all' && itemType !== typeFilter) return false

    return matchesSearchQuery(
      searchTerm,
      e.projectName,
      e.warehouseName,
      e.userName,
      e.reasonLabel,
      ...((e.items || []).map(i => i.productName))
    )
  })

  // Filtrar productos en el buscador del modal
  const filteredProducts = productSearch.length >= 1
    ? products.filter(p => {
      const words = productSearch.toLowerCase().split(/\s+/).filter(Boolean)
      const extraCodes = Array.isArray(p.barcodes) ? p.barcodes.join(' ') : ''
      const searchable = `${p.name || ''} ${p.code || ''} ${p.barcode || ''} ${extraCodes}`.toLowerCase()
      return words.every(w => searchable.includes(w))
    }).slice(0, 10)
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowUpFromLine className="w-7 h-7 text-indigo-600" />
            Salidas de Almacén
          </h1>
          <p className="text-gray-600 mt-1">Salidas hacia obras/proyectos o salidas simples para uso interno</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openReportModal} variant="outline">
            <BarChart3 className="w-4 h-4 mr-2" />
            Reporte por Obra
          </Button>
          <Button onClick={() => openCreateModal('simple')} variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50">
            <PackageMinus className="w-4 h-4 mr-2" />
            Salida Simple
          </Button>
          <Button onClick={() => openCreateModal('project')} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <HardHat className="w-4 h-4 mr-2" />
            Salida a Obra
          </Button>
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por proyecto, motivo, almacén, producto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">Todos los tipos</option>
          <option value="project">Solo a obras</option>
          <option value="simple">Solo simples</option>
        </select>
      </div>

      {/* Lista de salidas */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ArrowUpFromLine className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {exits.length === 0 ? 'Sin salidas registradas' : 'Sin resultados'}
            </h3>
            <p className="text-gray-500 mb-4">
              {exits.length === 0 ? 'Registra tu primera salida a una obra o una salida simple para uso interno.' : 'Intenta con otros filtros.'}
            </p>
            {exits.length === 0 && (
              <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Registrar Salida
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(exit => (
            <Card key={exit.id} className="overflow-hidden">
              <CardContent className="p-0">
                {/* Cabecera de la salida */}
                <button
                  onClick={() => setExpandedId(expandedId === exit.id ? null : exit.id)}
                  className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {(exit.exitType || 'project') === 'simple' ? (
                          <PackageMinus className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        ) : (
                          <HardHat className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        )}
                        {exit.number && (
                          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                            (exit.exitType || 'project') === 'simple'
                              ? 'text-blue-600 bg-blue-50'
                              : 'text-indigo-600 bg-indigo-50'
                          }`}>{exit.number}</span>
                        )}
                        <span className="font-semibold text-gray-900 truncate">
                          {(exit.exitType || 'project') === 'simple'
                            ? (exit.reasonLabel || 'Salida simple')
                            : exit.projectName}
                        </span>
                        {(exit.exitType || 'project') === 'simple' && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                            Simple
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {exit.items?.length || 0} productos · {exit.totalItems || 0} unidades
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {exit.warehouseName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(exit.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {exit.userName}
                        </span>
                      </div>
                    </div>
                    {expandedId === exit.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </button>

                {/* Detalle expandido */}
                {expandedId === exit.id && (
                  <div className="border-t border-gray-100 px-4 pb-4">
                    <div className="flex items-center justify-between mt-3 mb-2">
                      {exit.notes && <p className="text-sm text-gray-600 italic flex-1">Nota: {exit.notes}</p>}
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadLogisticsMovementPDF(exit, businessInfo, 'exit', branding) }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setGuideReference({
                              items: exit.items?.map(i => ({
                                productId: i.productId,
                                name: i.productName,
                                description: i.productName,
                                code: i.productCode,
                                quantity: i.quantity,
                                unit: i.unit || 'NIU',
                              })),
                              transferReason: '13',
                              transferDescription: (exit.exitType || 'project') === 'simple'
                                ? `Salida de almacén ${exit.number || ''} - ${exit.reasonLabel || 'Uso interno'}`
                                : `Salida de almacén ${exit.number || ''} - Proyecto: ${exit.projectName}`,
                            })
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Guía de Remisión
                        </button>
                      </div>
                    </div>
                    <table className="w-full text-sm mt-2">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b">
                          <th className="text-left py-2">Producto</th>
                          <th className="text-left py-2">Código</th>
                          <th className="text-right py-2">Cantidad</th>
                          <th className="text-center py-2">Unidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exit.items?.map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-50">
                            <td className="py-2 font-medium text-gray-900">{item.productName}</td>
                            <td className="py-2 text-gray-500 font-mono text-xs">{item.productCode || '-'}</td>
                            <td className="py-2 text-right font-semibold">{item.quantity}</td>
                            <td className="py-2 text-center text-gray-500">{item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Nueva Salida */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={exitType === 'simple' ? 'Nueva Salida Simple' : 'Nueva Salida a Obra'}
        size="xl"
      >
        <div className="space-y-4">
          {/* Selector de tipo de salida */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de salida</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExitType('project')}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                  exitType === 'project'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <HardHat className="w-4 h-4" />
                Salida a Obra
              </button>
              <button
                type="button"
                onClick={() => setExitType('simple')}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                  exitType === 'simple'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <PackageMinus className="w-4 h-4" />
                Salida Simple
              </button>
            </div>
          </div>

          {/* Proyecto (solo si exitType=project) o Motivo (si exitType=simple) + Almacén */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {exitType === 'project' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto / Obra *</label>
                <select
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Seleccionar proyecto...</option>
                  {activeProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
                  ))}
                </select>
                {activeProjects.length === 0 && <p className="text-xs text-amber-600 mt-1">No hay proyectos activos. Crea uno primero.</p>}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Motivo *</label>
                  {!isAddingReason && !isDemoMode && (
                    <button
                      type="button"
                      onClick={() => { setIsAddingReason(true); setNewReasonLabel('') }}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar motivo
                    </button>
                  )}
                </div>

                {isAddingReason ? (
                  <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-3 space-y-2">
                    <input
                      type="text"
                      value={newReasonLabel}
                      onChange={e => setNewReasonLabel(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleAddReason() }
                        if (e.key === 'Escape') { setIsAddingReason(false); setNewReasonLabel('') }
                      }}
                      maxLength={40}
                      autoFocus
                      placeholder="Ej: Devolución a proveedor, Merma, Préstamo..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="text-xs text-gray-600">
                      Queda guardado para las próximas salidas de este negocio.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddReason}
                        disabled={isSavingReason || !newReasonLabel.trim()}
                      >
                        {isSavingReason ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar motivo'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { setIsAddingReason(false); setNewReasonLabel('') }}
                        disabled={isSavingReason}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <select
                        value={simpleReason}
                        onChange={e => setSimpleReason(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {SIMPLE_REASONS.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      {/* Solo los propios se pueden quitar; los de siempre no. */}
                      {isCustomExitReason(simpleReason) && !isDemoMode && (
                        <button
                          type="button"
                          onClick={() => handleDeleteReason(simpleReason)}
                          title="Quitar este motivo"
                          className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Salida sin proyecto: para uso interno, oficina, consumo, etc.</p>
                  </>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Almacén de origen *</label>
              <select
                value={selectedWarehouse}
                onChange={e => { setSelectedWarehouse(e.target.value); setItems([]) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Seleccionar almacén...</option>
                {warehouses.filter(w => w.isActive !== false).map(w => (
                  <option key={w.id} value={w.id}>{w.name}{w.isDefault ? ' (Principal)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Agregar productos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agregar productos</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, código o código de barras..."
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                {/* Dropdown de resultados */}
                {filteredProducts.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm flex items-center justify-between"
                      >
                        <div>
                          <span className="font-medium">{p.name}</span>
                          {p.code && <span className="text-gray-500 ml-2 text-xs font-mono">{p.code}</span>}
                        </div>
                        <span className="text-xs text-gray-400">Stock: {getProductStock(p)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button type="button" onClick={handleScanBarcode} variant="outline" className="flex-shrink-0">
                <ScanBarcode className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Tabla de items */}
          {items.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="text-left py-2 px-3">Producto</th>
                    <th className="text-center py-2 px-3 w-20">Stock</th>
                    <th className="text-center py-2 px-3 w-24">Cantidad</th>
                    <th className="text-center py-2 px-3 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <Fragment key={`${item.productId}-${item.variantSku || 'nv'}-${idx}`}>
                    <tr className="border-t border-gray-100">
                      <td className="py-2 px-3">
                        <div className="font-medium text-gray-900">
                          {item.productName}
                          {item.variantLabel && (
                            <span className="ml-1.5 text-xs font-normal text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                              {item.variantLabel}
                            </span>
                          )}
                        </div>
                        {item.productCode && <div className="text-xs text-gray-500 font-mono">{item.productCode}{item.variantSku ? ` · SKU ${item.variantSku}` : ''}</div>}
                      </td>
                      <td className="py-2 px-3 text-center text-xs text-gray-500">{item.availableStock}</td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          min={item.allowDecimalQuantity ? '0.001' : '1'}
                          step={item.allowDecimalQuantity ? '0.001' : '1'}
                          max={item.availableStock}
                          value={item.hasSerials ? (item.selectedSerials?.length || 0) : item.quantity}
                          disabled={item.hasSerials}
                          onChange={e => updateItemQuantity(item.productId, item.variantSku, e.target.value)}
                          onBlur={() => finalizeItemQuantity(item.productId, item.variantSku)}
                          className={`w-20 px-2 py-1 border rounded text-sm text-center focus:ring-2 ${
                            item.hasSerials
                              ? 'border-gray-200 bg-gray-100 text-gray-500'
                              : item.exceedsStock
                              ? 'border-red-500 bg-red-50 text-red-700 focus:ring-red-500'
                              : 'border-gray-300 focus:ring-indigo-500'
                          }`}
                        />
                        {item.exceedsStock && !item.hasSerials && (
                          <div className="text-[10px] text-red-600 mt-0.5">Max: {item.availableStock}</div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button onClick={() => removeItem(item.productId, item.variantSku)} className="text-red-400 hover:text-red-600 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {item.hasSerials && (
                      <tr className="bg-amber-50/50 border-t border-amber-100">
                        <td colSpan={4} className="px-3 py-2">
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-medium text-amber-700 mt-0.5 whitespace-nowrap">Series a enviar:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {item.serials.map((s) => {
                                const isSelected = (item.selectedSerials || []).includes(s.serialNumber)
                                return (
                                  <button
                                    key={s.serialNumber}
                                    type="button"
                                    onClick={() => toggleExitSerial(item.productId, s.serialNumber)}
                                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                                      isSelected
                                        ? 'bg-amber-600 text-white border-amber-600'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400'
                                    }`}
                                  >
                                    {s.serialNumber}
                                  </button>
                                )
                              })}
                            </div>
                            {(item.selectedSerials || []).length > 0 && (
                              <span className="text-xs text-amber-600 whitespace-nowrap">({item.selectedSerials.length} sel.)</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <div className="bg-gray-50 px-3 py-2 text-sm text-gray-600 font-medium border-t">
                Total: {Math.round(items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0) * 1000) / 1000} unidades en {items.length} productos
              </div>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Observaciones de la salida..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="outline">Cancelar</Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || items.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowUpFromLine className="w-4 h-4 mr-2" />}
              Registrar Salida
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Guía de Remisión */}
      <CreateDispatchGuideModal
        isOpen={!!guideReference}
        onClose={() => setGuideReference(null)}
        referenceInvoice={guideReference}
      />

      {/* Modal Reporte de consumo por obra */}
      <Modal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        title="Consumo por Obra"
        size="4xl"
      >
        <div className="space-y-5">
          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
              <input
                type="date"
                value={reportFilters.startDate}
                onChange={e => setReportFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <input
                type="date"
                value={reportFilters.endDate}
                onChange={e => setReportFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Almacén</label>
              <select
                value={reportFilters.warehouseId}
                onChange={e => setReportFilters(prev => ({ ...prev, warehouseId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">Todos</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reportFilters.includeSimple}
                  onChange={e => setReportFilters(prev => ({ ...prev, includeSimple: e.target.checked }))}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Incluir salidas simples</span>
              </label>
            </div>
          </div>

          {/* Totales del período */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
              <p className="text-xs text-indigo-700">Valor consumido</p>
              <p className="text-xl font-bold text-indigo-900">{formatCurrency(reportData.totals.total)}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs text-gray-600">Obras</p>
              <p className="text-xl font-bold text-gray-900">{reportData.totals.projectCount}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs text-gray-600">Salidas</p>
              <p className="text-xl font-bold text-gray-900">{reportData.totals.exitCount}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs text-gray-600">Unidades</p>
              <p className="text-xl font-bold text-gray-900">{reportData.totals.unitCount.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Aviso de costos estimados: sin esto, el usuario leería como exacto un
              número que se apoya en el costo actual del producto. */}
          {reportData.totals.estimatedLines > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800">
              <strong>{reportData.totals.estimatedLines} línea(s)</strong> se valorizaron con el
              costo actual del producto, porque son salidas anteriores a que el sistema
              empezara a guardar el costo del momento. Las salidas nuevas quedan congeladas
              con su costo y ya no cambian.
            </div>
          )}

          {/* Listado por obra */}
          {reportData.groups.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              No hay salidas en el período seleccionado.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-200 max-h-[45vh] overflow-y-auto">
              {reportData.groups.map(g => {
                const pct = reportData.totals.total > 0 ? (g.total / reportData.totals.total) * 100 : 0
                const abierto = expandedGroup === g.key
                return (
                  <div key={g.key}>
                    <button
                      type="button"
                      onClick={() => setExpandedGroup(abierto ? null : g.key)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {g.isProject
                            ? <HardHat className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                            : <PackageMinus className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                          <span className="font-medium text-gray-900 truncate">{g.name}</span>
                          {g.code && <span className="text-xs text-gray-500 flex-shrink-0">({g.code})</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {g.exitCount} salida(s) · {g.products.length} producto(s) · {pct.toFixed(1)}% del total
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-semibold text-gray-900">{formatCurrency(g.total)}</span>
                        {abierto ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>

                    {abierto && (
                      <div className="px-4 pb-3 bg-gray-50">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b border-gray-200">
                              <th className="text-left py-2 font-medium">Producto</th>
                              <th className="text-right py-2 font-medium">Cantidad</th>
                              <th className="text-right py-2 font-medium">Costo unit.</th>
                              <th className="text-right py-2 font-medium">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.products.map((p, idx) => (
                              <tr key={idx} className="border-b border-gray-100 last:border-0">
                                <td className="py-2 pr-2">
                                  <span className="text-gray-900">{p.name}</span>
                                  {p.variantLabel && <span className="text-gray-500"> · {p.variantLabel}</span>}
                                  {p.estimated && <span className="text-amber-600" title="Costo estimado con el precio actual"> *</span>}
                                </td>
                                <td className="py-2 text-right text-gray-700">{p.quantity.toLocaleString('es-PE', { maximumFractionDigits: 3 })} {p.unit}</td>
                                <td className="py-2 text-right text-gray-700">{formatCurrency(p.unitCost || 0)}</td>
                                <td className="py-2 text-right font-medium text-gray-900">{formatCurrency(p.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-gray-200">
            <Button variant="outline" onClick={() => setIsReportOpen(false)} className="w-full sm:w-auto">
              Cerrar
            </Button>
            <Button
              onClick={handleExportReport}
              disabled={isExportingReport || reportExits.length === 0}
              className="w-full sm:w-auto"
            >
              {isExportingReport
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <FileSpreadsheet className="w-4 h-4 mr-2" />}
              Exportar a Excel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
