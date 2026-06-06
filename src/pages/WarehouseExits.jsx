import { useState, useEffect, Fragment } from 'react'
import { ArrowUpFromLine, Plus, Search, Loader2, Trash2, Package, Calendar, User, MapPin, ScanBarcode, ChevronDown, ChevronUp, HardHat, Download, FileText, PackageMinus } from 'lucide-react'
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
import { getCompanySettings } from '@/services/firestoreService'
import CreateDispatchGuideModal from '@/components/CreateDispatchGuideModal'

export default function WarehouseExits() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
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

  // Motivos para salida simple (sin proyecto)
  const SIMPLE_REASONS = [
    { value: 'office_use', label: 'Uso en oficina' },
    { value: 'employee_delivery', label: 'Entrega a trabajador' },
    { value: 'internal_consumption', label: 'Consumo interno' },
    { value: 'other', label: 'Otro' },
  ]

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return
    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const [exitsResult, projectsResult, productsResult, warehousesResult, settingsResult] = await Promise.all([
        getWarehouseExits(businessId),
        getProjects(businessId),
        getProducts(businessId),
        getWarehouses(businessId),
        getCompanySettings(businessId),
      ])
      if (exitsResult.success) setExits(exitsResult.data || [])
      if (projectsResult.success) setProjects(projectsResult.data || [])
      if (productsResult.success) setProducts(productsResult.data || [])
      if (warehousesResult.success) setWarehouses(warehousesResult.data || [])
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
    setSelectedWarehouse(warehouses.find(w => w.isDefault)?.id || warehouses[0]?.id || '')
    setNotes('')
    setItems([])
    setProductSearch('')
    setIsModalOpen(true)
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
      if (existing.quantity >= stock) {
        toast.error(`Ya agregaste el máximo disponible de "${product.name}" (${stock})`)
        return
      }
      setItems(items.map(i => i.productId === product.id && !i.variantSku
        ? { ...i, quantity: i.quantity + 1 }
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
    const raw = value === '' ? '' : parseInt(value) || ''
    setItems(items.map(i => {
      if (!rowMatches(i, productId, variantSku)) return i
      if (typeof raw === 'number' && raw > (i.availableStock || 0)) {
        return { ...i, quantity: raw, exceedsStock: true }
      }
      return { ...i, quantity: raw, exceedsStock: false }
    }))
  }

  const finalizeItemQuantity = (productId, variantSku) => {
    setItems(items.map(i => {
      if (!rowMatches(i, productId, variantSku)) return i
      const parsed = parseInt(i.quantity) || 1
      const maxStock = i.availableStock || 0
      const clamped = Math.max(1, Math.min(parsed, maxStock || parsed))
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
    const overStock = items.find(i => (parseInt(i.quantity) || 0) > (i.availableStock || 0))
    if (overStock) {
      toast.error(`Cantidad inválida: "${overStock.productName}" solicita ${overStock.quantity} pero hay ${overStock.availableStock} en stock.`)
      return
    }
    // Validar que ningún item tenga cantidad < 1
    const invalidQty = items.find(i => !i.quantity || parseInt(i.quantity) < 1)
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
        items: items.map(({ productId, productName, productCode, quantity, unit, variantSku, selectedSerials }) => ({
          productId, productName, productCode, quantity, unit, variantSku: variantSku || null,
          selectedSerials: selectedSerials || [],
        })),
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
    // Filtro por tipo (default legacy: sin exitType = 'project')
    const itemType = e.exitType || 'project'
    if (typeFilter !== 'all' && itemType !== typeFilter) return false

    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return e.projectName?.toLowerCase().includes(term) ||
      e.warehouseName?.toLowerCase().includes(term) ||
      e.userName?.toLowerCase().includes(term) ||
      e.reasonLabel?.toLowerCase().includes(term) ||
      e.items?.some(i => i.productName?.toLowerCase().includes(term))
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
                <select
                  value={simpleReason}
                  onChange={e => setSimpleReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {SIMPLE_REASONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Salida sin proyecto: para uso interno, oficina, consumo, etc.</p>
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
                          min="1"
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
                Total: {items.reduce((s, i) => s + i.quantity, 0)} unidades en {items.length} productos
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
    </div>
  )
}
