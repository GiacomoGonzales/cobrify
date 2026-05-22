import { useState, useEffect } from 'react'
import { ArrowDownToLine, Plus, Search, Loader2, Trash2, Package, Calendar, User, MapPin, ScanBarcode, ChevronDown, ChevronUp, HardHat, CheckCircle, AlertTriangle, XCircle, Download, FileText } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useBranding } from '@/contexts/BrandingContext'
import { getWarehouseReturns, createWarehouseReturn } from '@/services/warehouseReturnService'
import { getProjects } from '@/services/projectService'
import { getProducts } from '@/services/firestoreService'
import { getWarehouses } from '@/services/warehouseService'
import { downloadLogisticsMovementPDF } from '@/utils/logisticsPdfGenerator'
import { getCompanySettings } from '@/services/firestoreService'
import CreateDispatchGuideModal from '@/components/CreateDispatchGuideModal'

const CONDITION_CONFIG = {
  good: { label: 'Buen estado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  damaged: { label: 'Dañado', color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle },
  lost: { label: 'Perdido', color: 'bg-red-100 text-red-700', icon: XCircle },
}

export default function WarehouseReturns() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()
  const { branding } = useBranding()

  const [returns, setReturns] = useState([])
  const [projects, setProjects] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [businessInfo, setBusinessInfo] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [guideReference, setGuideReference] = useState(null)

  // Estado del formulario
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [notes, setNotes] = useState('')
  const [receivedBy, setReceivedBy] = useState('')
  const [items, setItems] = useState([])
  const [productSearch, setProductSearch] = useState('')

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return
    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const [returnsResult, projectsResult, productsResult, warehousesResult, settingsResult] = await Promise.all([
        getWarehouseReturns(businessId),
        getProjects(businessId),
        getProducts(businessId),
        getWarehouses(businessId),
        getCompanySettings(businessId),
      ])
      if (returnsResult.success) setReturns(returnsResult.data || [])
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

  const openCreateModal = () => {
    setSelectedProject('')
    setSelectedWarehouse(warehouses.find(w => w.isDefault)?.id || warehouses[0]?.id || '')
    setNotes('')
    setReceivedBy('')
    setItems([])
    setProductSearch('')
    setIsModalOpen(true)
  }

  const addProduct = (product) => {
    if (items.find(i => i.productId === product.id)) {
      setItems(items.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setItems([...items, {
        productId: product.id,
        productName: product.name,
        productCode: product.code || product.barcode || '',
        quantity: 1,
        unit: product.unit || 'und',
        condition: 'good',
        conditionNotes: '',
      }])
    }
    setProductSearch('')
  }

  const updateItemQuantity = (productId, value) => {
    const raw = value === '' ? '' : parseInt(value) || ''
    setItems(items.map(i => i.productId === productId ? { ...i, quantity: raw } : i))
  }

  const finalizeItemQuantity = (productId) => {
    setItems(items.map(i => i.productId === productId ? { ...i, quantity: Math.max(1, parseInt(i.quantity) || 1) } : i))
  }

  const updateItemCondition = (productId, condition) => {
    setItems(items.map(i => i.productId === productId ? { ...i, condition } : i))
  }

  const updateItemConditionNotes = (productId, conditionNotes) => {
    setItems(items.map(i => i.productId === productId ? { ...i, conditionNotes } : i))
  }

  const removeItem = (productId) => {
    setItems(items.filter(i => i.productId !== productId))
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
    if (!selectedProject) { toast.error('Selecciona un proyecto'); return }
    if (!selectedWarehouse) { toast.error('Selecciona un almacén'); return }
    if (items.length === 0) { toast.error('Agrega al menos un producto'); return }
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }

    setIsSaving(true)
    try {
      const project = projects.find(p => p.id === selectedProject)
      const warehouse = warehouses.find(w => w.id === selectedWarehouse)

      const result = await createWarehouseReturn(getBusinessId(), {
        projectId: selectedProject,
        projectName: project?.name || '',
        projectCode: project?.code || '',
        warehouseId: selectedWarehouse,
        warehouseName: warehouse?.name || '',
        receivedBy: receivedBy || '',
        items: items.map(({ productId, productName, productCode, quantity, unit, condition, conditionNotes, variantSku }) => ({
          productId, productName, productCode, quantity, unit, condition, conditionNotes: conditionNotes || '', variantSku: variantSku || null,
        })),
        notes,
        userId: user.uid,
        userName: user.displayName || user.email || '',
      })

      if (result.success) {
        toast.success('Retorno registrado exitosamente')
        setIsModalOpen(false)
        loadData()
      } else {
        toast.error(result.error || 'Error al registrar retorno')
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

  const filtered = returns.filter(r => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return r.projectName?.toLowerCase().includes(term) ||
      r.warehouseName?.toLowerCase().includes(term) ||
      r.userName?.toLowerCase().includes(term) ||
      r.items?.some(i => i.productName?.toLowerCase().includes(term))
  })

  const filteredProducts = productSearch.length >= 1
    ? products.filter(p => {
      const words = productSearch.toLowerCase().split(/\s+/).filter(Boolean)
      const extraCodes = Array.isArray(p.barcodes) ? p.barcodes.join(' ') : ''
      const searchable = `${p.name || ''} ${p.code || ''} ${p.barcode || ''} ${extraCodes}`.toLowerCase()
      return words.every(w => searchable.includes(w))
    }).slice(0, 10)
    : []

  // Stats
  const stats = {
    total: returns.length,
    goodItems: returns.reduce((s, r) => s + (r.goodItems || 0), 0),
    damagedItems: returns.reduce((s, r) => s + (r.damagedItems || 0), 0),
    lostItems: returns.reduce((s, r) => s + (r.lostItems || 0), 0),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowDownToLine className="w-7 h-7 text-indigo-600" />
            Retornos a Almacén
          </h1>
          <p className="text-gray-600 mt-1">Registra retornos de materiales y herramientas desde obras</p>
        </div>
        <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Retorno
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Retornos</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.goodItems}</p>
          <p className="text-xs text-gray-500">Buen estado</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600">{stats.damagedItems}</p>
          <p className="text-xs text-gray-500">Dañados</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{stats.lostItems}</p>
          <p className="text-xs text-gray-500">Perdidos</p>
        </CardContent></Card>
      </div>

      {/* Búsqueda */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por proyecto, almacén, producto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Lista de retornos */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ArrowDownToLine className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {returns.length === 0 ? 'Sin retornos registrados' : 'Sin resultados'}
            </h3>
            <p className="text-gray-500 mb-4">
              {returns.length === 0 ? 'Registra tu primer retorno de materiales desde una obra.' : 'Intenta con otros filtros.'}
            </p>
            {returns.length === 0 && (
              <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Registrar Retorno
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(ret => (
            <Card key={ret.id} className="overflow-hidden">
              <CardContent className="p-0">
                <button
                  onClick={() => setExpandedId(expandedId === ret.id ? null : ret.id)}
                  className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <HardHat className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        {ret.number && <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{ret.number}</span>}
                        <span className="font-semibold text-gray-900 truncate">{ret.projectName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {ret.items?.length || 0} productos · {ret.totalItems || 0} und
                        </span>
                        {ret.goodItems > 0 && <span className="text-green-600 font-medium">{ret.goodItems} ok</span>}
                        {ret.damagedItems > 0 && <span className="text-yellow-600 font-medium">{ret.damagedItems} dañados</span>}
                        {ret.lostItems > 0 && <span className="text-red-600 font-medium">{ret.lostItems} perdidos</span>}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(ret.createdAt)}
                        </span>
                      </div>
                    </div>
                    {expandedId === ret.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </button>

                {expandedId === ret.id && (
                  <div className="border-t border-gray-100 px-4 pb-4">
                    <div className="flex items-center justify-between mt-3">
                      <div>
                        {ret.receivedBy && <p className="text-sm text-gray-600">Recibido por: <strong>{ret.receivedBy}</strong></p>}
                        {ret.notes && <p className="text-sm text-gray-600 italic">Nota: {ret.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadLogisticsMovementPDF(ret, businessInfo, 'return', branding) }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setGuideReference({
                              items: ret.items?.map(i => ({
                                productId: i.productId,
                                name: i.productName,
                                description: i.productName,
                                code: i.productCode,
                                quantity: i.quantity,
                                unit: i.unit || 'NIU',
                              })),
                              transferReason: '13',
                              transferDescription: `Retorno a almacén ${ret.number || ''} - Proyecto: ${ret.projectName}`,
                            })
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Guía de Remisión
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm mt-2">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b">
                            <th className="text-left py-2">Producto</th>
                            <th className="text-right py-2">Cant.</th>
                            <th className="text-center py-2">Estado</th>
                            <th className="text-left py-2">Observación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ret.items?.map((item, idx) => {
                            const cond = CONDITION_CONFIG[item.condition] || CONDITION_CONFIG.good
                            const CondIcon = cond.icon
                            return (
                              <tr key={idx} className="border-b border-gray-50">
                                <td className="py-2 font-medium text-gray-900">{item.productName}</td>
                                <td className="py-2 text-right font-semibold">{item.quantity}</td>
                                <td className="py-2 text-center">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cond.color}`}>
                                    <CondIcon className="w-3 h-3" />
                                    {cond.label}
                                  </span>
                                </td>
                                <td className="py-2 text-gray-500 text-xs">{item.conditionNotes || '-'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Nuevo Retorno */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nuevo Retorno a Almacén"
        size="xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto / Obra de origen *</label>
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Seleccionar proyecto...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Almacén destino *</label>
              <select
                value={selectedWarehouse}
                onChange={e => setSelectedWarehouse(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Seleccionar almacén...</option>
                {warehouses.filter(w => w.isActive !== false).map(w => (
                  <option key={w.id} value={w.id}>{w.name}{w.isDefault ? ' (Principal)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recibido por (almacenero)</label>
            <input
              type="text"
              value={receivedBy}
              onChange={e => setReceivedBy(e.target.value)}
              placeholder="Nombre de quien recibe en almacén"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
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

          {/* Tabla de items con estado */}
          {items.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="text-left py-2 px-3">Producto</th>
                      <th className="text-center py-2 px-3 w-20">Cant.</th>
                      <th className="text-center py-2 px-3 w-36">Estado</th>
                      <th className="text-left py-2 px-3">Observación</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.productId} className="border-t border-gray-100">
                        <td className="py-2 px-3">
                          <div className="font-medium text-gray-900 text-sm">{item.productName}</div>
                          {item.productCode && <div className="text-xs text-gray-500 font-mono">{item.productCode}</div>}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => updateItemQuantity(item.productId, e.target.value)}
                            onBlur={() => finalizeItemQuantity(item.productId)}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <select
                            value={item.condition}
                            onChange={e => updateItemCondition(item.productId, e.target.value)}
                            className={`text-xs px-2 py-1 rounded-lg border font-medium ${
                              item.condition === 'good' ? 'border-green-300 bg-green-50 text-green-700' :
                              item.condition === 'damaged' ? 'border-yellow-300 bg-yellow-50 text-yellow-700' :
                              'border-red-300 bg-red-50 text-red-700'
                            }`}
                          >
                            <option value="good">Buen estado</option>
                            <option value="damaged">Dañado</option>
                            <option value="lost">Perdido</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          {(item.condition === 'damaged' || item.condition === 'lost') && (
                            <input
                              type="text"
                              value={item.conditionNotes}
                              onChange={e => updateItemConditionNotes(item.productId, e.target.value)}
                              placeholder="Detalle..."
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button onClick={() => removeItem(item.productId)} className="text-red-400 hover:text-red-600 p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 px-3 py-2 text-xs text-gray-600 border-t flex flex-wrap gap-3">
                <span className="font-medium">Total: {items.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0)} und</span>
                <span className="text-green-600">{items.filter(i => i.condition === 'good').reduce((s, i) => s + (parseInt(i.quantity) || 0), 0)} ok</span>
                <span className="text-yellow-600">{items.filter(i => i.condition === 'damaged').reduce((s, i) => s + (parseInt(i.quantity) || 0), 0)} dañados</span>
                <span className="text-red-600">{items.filter(i => i.condition === 'lost').reduce((s, i) => s + (parseInt(i.quantity) || 0), 0)} perdidos</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Observaciones del retorno..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="outline">Cancelar</Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || items.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowDownToLine className="w-4 h-4 mr-2" />}
              Registrar Retorno
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
