import { useState, useEffect } from 'react'
import { ArrowUpFromLine, Plus, Search, Loader2, Trash2, Package, Calendar, User, MapPin, ScanBarcode, ChevronDown, ChevronUp, HardHat } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getWarehouseExits, createWarehouseExit } from '@/services/warehouseExitService'
import { getProjects } from '@/services/projectService'
import { getProducts } from '@/services/firestoreService'
import { getWarehouses } from '@/services/warehouseService'

export default function WarehouseExits() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [exits, setExits] = useState([])
  const [projects, setProjects] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  // Estado del formulario
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [notes, setNotes] = useState('')
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
      const [exitsResult, projectsResult, productsResult, warehousesResult] = await Promise.all([
        getWarehouseExits(businessId),
        getProjects(businessId),
        getProducts(businessId),
        getWarehouses(businessId),
      ])
      if (exitsResult.success) setExits(exitsResult.data || [])
      if (projectsResult.success) setProjects(projectsResult.data || [])
      if (productsResult.success) setProducts(productsResult.data || [])
      if (warehousesResult.success) setWarehouses(warehousesResult.data || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const activeProjects = projects.filter(p => p.status === 'active')

  const openCreateModal = () => {
    setSelectedProject('')
    setSelectedWarehouse(warehouses.find(w => w.isDefault)?.id || warehouses[0]?.id || '')
    setNotes('')
    setItems([])
    setProductSearch('')
    setIsModalOpen(true)
  }

  const addProduct = (product) => {
    if (items.find(i => i.productId === product.id)) {
      // Ya existe, incrementar cantidad
      setItems(items.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setItems([...items, {
        productId: product.id,
        productName: product.name,
        productCode: product.code || product.barcode || '',
        quantity: 1,
        unit: product.unit || 'und',
        availableStock: getProductStock(product),
      }])
    }
    setProductSearch('')
  }

  const getProductStock = (product) => {
    if (!selectedWarehouse) return product.stock || 0
    const ws = product.warehouseStocks?.find(w => w.warehouseId === selectedWarehouse)
    return ws ? ws.stock : (product.stock || 0)
  }

  const updateItemQuantity = (productId, value) => {
    const raw = value === '' ? '' : parseInt(value) || ''
    setItems(items.map(i => i.productId === productId ? { ...i, quantity: raw } : i))
  }

  const finalizeItemQuantity = (productId) => {
    setItems(items.map(i => i.productId === productId ? { ...i, quantity: Math.max(1, parseInt(i.quantity) || 1) } : i))
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
        const found = products.find(p => p.code === code || p.barcode === code || p.sku === code)
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

      const result = await createWarehouseExit(getBusinessId(), {
        projectId: selectedProject,
        projectName: project?.name || '',
        projectCode: project?.code || '',
        warehouseId: selectedWarehouse,
        warehouseName: warehouse?.name || '',
        items: items.map(({ productId, productName, productCode, quantity, unit, variantSku }) => ({
          productId, productName, productCode, quantity, unit, variantSku: variantSku || null,
        })),
        notes,
        userId: user.uid,
        userName: user.displayName || user.email || '',
      })

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
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return e.projectName?.toLowerCase().includes(term) ||
      e.warehouseName?.toLowerCase().includes(term) ||
      e.userName?.toLowerCase().includes(term) ||
      e.items?.some(i => i.productName?.toLowerCase().includes(term))
  })

  // Filtrar productos en el buscador del modal
  const filteredProducts = productSearch.length >= 1
    ? products.filter(p => {
      const term = productSearch.toLowerCase()
      return p.name?.toLowerCase().includes(term) ||
        p.code?.toLowerCase().includes(term) ||
        p.barcode?.toLowerCase().includes(term)
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
          <p className="text-gray-600 mt-1">Registra salidas de materiales y herramientas hacia obras</p>
        </div>
        <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Nueva Salida
        </Button>
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
              {exits.length === 0 ? 'Registra tu primera salida de materiales hacia una obra.' : 'Intenta con otros filtros.'}
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
                      <div className="flex items-center gap-2 mb-1">
                        <HardHat className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span className="font-semibold text-gray-900 truncate">{exit.projectName}</span>
                        {exit.projectCode && <span className="text-xs text-indigo-600 font-mono">({exit.projectCode})</span>}
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
                    {exit.notes && <p className="text-sm text-gray-600 mt-3 mb-2 italic">Nota: {exit.notes}</p>}
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
        title="Nueva Salida de Almacén"
        size="xl"
      >
        <div className="space-y-4">
          {/* Proyecto y Almacén */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  {items.map(item => (
                    <tr key={item.productId} className="border-t border-gray-100">
                      <td className="py-2 px-3">
                        <div className="font-medium text-gray-900">{item.productName}</div>
                        {item.productCode && <div className="text-xs text-gray-500 font-mono">{item.productCode}</div>}
                      </td>
                      <td className="py-2 px-3 text-center text-xs text-gray-500">{item.availableStock}</td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateItemQuantity(item.productId, e.target.value)}
                          onBlur={() => finalizeItemQuantity(item.productId)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-indigo-500"
                        />
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
    </div>
  )
}
