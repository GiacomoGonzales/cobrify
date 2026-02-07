import React, { useState, useEffect } from 'react'
import {
  Cog,
  Plus,
  Minus,
  Search,
  Loader2,
  Package,
  AlertTriangle,
  CheckCircle,
  CookingPot,
  Wrench,
  Trash2,
  Store,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency } from '@/lib/utils'
import { getProducts } from '@/services/firestoreService'
import { getWarehouses } from '@/services/warehouseService'
import { getActiveBranches } from '@/services/branchService'
import { getRecipeByProductId } from '@/services/recipeService'
import { getProductions, executeRecipeProduction, executeManualProduction, checkProductionReadiness } from '@/services/productionService'

export default function Production() {
  const { user, getBusinessId, filterBranchesByAccess, allowedBranches } = useAppContext()
  const toast = useToast()

  // Estado principal
  const [productions, setProductions] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [branches, setBranches] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Sucursales
  const [selectedBranch, setSelectedBranch] = useState(null) // null = Sucursal Principal
  const [hasMainAccess, setHasMainAccess] = useState(true)

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Modal de nueva producción (multi-producto)
  const [showModal, setShowModal] = useState(false)
  const [productionItems, setProductionItems] = useState([]) // Array de { id, productId, name, code, quantity, mode, hasRecipe, recipeInfo, isCheckingRecipe }
  const [modalSearchTerm, setModalSearchTerm] = useState('')
  const [modalWarehouseId, setModalWarehouseId] = useState('')
  const [modalNotes, setModalNotes] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Paginación
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return
    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const [prodsResult, whResult, productionsResult, branchesResult] = await Promise.all([
        getProducts(businessId),
        getWarehouses(businessId),
        getProductions(businessId),
        getActiveBranches(businessId)
      ])

      if (prodsResult.success) setProducts(prodsResult.data || [])
      if (whResult.success) setWarehouses(whResult.data || [])
      if (productionsResult.success) setProductions(productionsResult.data || [])

      // Filtrar sucursales por permisos del usuario
      if (branchesResult.success && branchesResult.data.length > 0) {
        const branchList = filterBranchesByAccess ? filterBranchesByAccess(branchesResult.data) : branchesResult.data
        setBranches(branchList)
        const mainAccess = !allowedBranches || allowedBranches.length === 0 || allowedBranches.includes('main')
        setHasMainAccess(mainAccess)
        // Si no tiene acceso a la principal, auto-seleccionar primera sucursal permitida
        if (!mainAccess && branchList.length > 0) {
          setSelectedBranch(branchList[0])
        }
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  // IDs de almacenes de la sucursal seleccionada (para filtrar historial)
  const branchWarehouseIds = warehouses
    .filter(w => {
      if (!selectedBranch) return !w.branchId
      return w.branchId === selectedBranch.id
    })
    .map(w => w.id)

  // Filtrar producciones
  const filteredProductions = productions.filter(p => {
    const matchesSearch = !searchTerm ||
      p.productName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesMode = filterMode === 'all' || p.mode === filterMode

    // Filtrar por sucursal (a través de los almacenes que pertenecen a la sucursal)
    const matchesBranch = !branches.length || branchWarehouseIds.includes(p.warehouseId)

    let matchesDateFrom = true
    if (dateFrom) {
      const from = new Date(dateFrom)
      from.setHours(0, 0, 0, 0)
      const pDate = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
      matchesDateFrom = pDate >= from
    }

    let matchesDateTo = true
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      const pDate = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
      matchesDateTo = pDate <= to
    }

    return matchesSearch && matchesMode && matchesBranch && matchesDateFrom && matchesDateTo
  })

  // Paginación
  const totalPages = Math.ceil(filteredProductions.length / itemsPerPage)
  const paginatedProductions = filteredProductions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // Almacenes filtrados por sucursal seleccionada en la página
  const modalFilteredWarehouses = warehouses.filter(w => {
    if (!w.isActive) return false
    if (!selectedBranch) return !w.branchId
    return w.branchId === selectedBranch.id
  })

  // Abrir modal
  const openModal = () => {
    setShowModal(true)
    setProductionItems([])
    setModalSearchTerm('')
    setModalNotes('')
    // Auto-seleccionar almacén por defecto de la sucursal seleccionada en la página
    const branchWarehouses = warehouses.filter(w => {
      if (!w.isActive) return false
      if (!selectedBranch) return !w.branchId
      return w.branchId === selectedBranch.id
    })
    const defaultWh = branchWarehouses.find(w => w.isDefault) || branchWarehouses[0]
    setModalWarehouseId(defaultWh?.id || '')
  }

  const closeModal = () => {
    setShowModal(false)
    setProductionItems([])
    setModalSearchTerm('')
    setModalWarehouseId('')
    setModalNotes('')
  }

  // Agregar producto al carrito de producción
  const addToProduction = async (product) => {
    const existing = productionItems.find(item => item.productId === product.id)
    if (existing) {
      toast.info('Este producto ya está en la lista')
      return
    }

    const itemId = Date.now().toString()
    const newItem = {
      id: itemId,
      productId: product.id,
      name: product.name,
      code: product.code || '',
      quantity: 1,
      mode: 'manual', // default, se actualiza al detectar receta
      hasRecipe: false,
      recipeInfo: null,
      isCheckingRecipe: true,
    }

    setProductionItems(prev => [...prev, newItem])
    toast.success(`${product.name} agregado`)

    // Detectar si tiene receta (async)
    try {
      const businessId = getBusinessId()
      const recipeResult = await getRecipeByProductId(businessId, product.id)
      if (recipeResult.success && recipeResult.data) {
        // Tiene receta, verificar stock
        const readiness = await checkProductionReadiness(businessId, product.id, 1)
        setProductionItems(prev => prev.map(item =>
          item.id === itemId ? {
            ...item,
            mode: 'recipe',
            hasRecipe: true,
            recipeInfo: readiness.success && readiness.hasRecipe ? {
              recipe: readiness.recipe,
              hasStock: readiness.hasStock,
              missingIngredients: readiness.missingIngredients || [],
            } : null,
            isCheckingRecipe: false,
          } : item
        ))
      } else {
        // No tiene receta, queda manual
        setProductionItems(prev => prev.map(item =>
          item.id === itemId ? { ...item, isCheckingRecipe: false } : item
        ))
      }
    } catch (error) {
      console.error('Error al verificar receta:', error)
      setProductionItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, isCheckingRecipe: false } : item
      ))
    }
  }

  // Quitar producto del carrito
  const removeFromProduction = (itemId) => {
    setProductionItems(prev => prev.filter(item => item.id !== itemId))
  }

  // Actualizar cantidad y re-verificar stock si es recipe
  const updateItemQuantity = async (itemId, newQty) => {
    if (newQty < 1) return
    setProductionItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, quantity: newQty } : item
    ))

    const item = productionItems.find(i => i.id === itemId)
    if (item?.hasRecipe) {
      setProductionItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, isCheckingRecipe: true } : i
      ))
      try {
        const businessId = getBusinessId()
        const readiness = await checkProductionReadiness(businessId, item.productId, newQty)
        setProductionItems(prev => prev.map(i =>
          i.id === itemId ? {
            ...i,
            recipeInfo: readiness.success && readiness.hasRecipe ? {
              recipe: readiness.recipe,
              hasStock: readiness.hasStock,
              missingIngredients: readiness.missingIngredients || [],
            } : i.recipeInfo,
            isCheckingRecipe: false,
          } : i
        ))
      } catch (error) {
        console.error('Error al re-verificar stock:', error)
        setProductionItems(prev => prev.map(i =>
          i.id === itemId ? { ...i, isCheckingRecipe: false } : i
        ))
      }
    }
  }

  const incrementQty = (itemId) => {
    const item = productionItems.find(i => i.id === itemId)
    if (item) updateItemQuantity(itemId, item.quantity + 1)
  }

  const decrementQty = (itemId) => {
    const item = productionItems.find(i => i.id === itemId)
    if (item && item.quantity > 1) updateItemQuantity(itemId, item.quantity - 1)
  }

  // Ejecutar producción multi-producto
  const handleConfirmProduction = async () => {
    if (!user?.uid) return

    if (productionItems.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    if (!modalWarehouseId) {
      toast.error('Selecciona un almacén destino')
      return
    }

    // Validar cantidades
    const invalidItem = productionItems.find(item => !item.quantity || item.quantity <= 0)
    if (invalidItem) {
      toast.error(`La cantidad de "${invalidItem.name}" debe ser mayor a 0`)
      return
    }

    setIsProcessing(true)
    try {
      const businessId = getBusinessId()
      let successCount = 0
      let errorCount = 0

      for (const item of productionItems) {
        const product = products.find(p => p.id === item.productId)
        if (!product) {
          toast.error(`Producto "${item.name}" no encontrado`)
          errorCount++
          continue
        }

        const params = {
          productId: item.productId,
          productName: item.name,
          quantity: item.quantity,
          warehouseId: modalWarehouseId,
          notes: modalNotes,
          userId: user.uid,
          product
        }

        let result
        if (item.mode === 'recipe') {
          result = await executeRecipeProduction(businessId, params)
        } else {
          result = await executeManualProduction(businessId, params)
        }

        if (result.success) {
          successCount++
        } else {
          toast.error(`Error en "${item.name}": ${result.error || 'Error desconocido'}`)
          errorCount++
        }
      }

      if (successCount > 0) {
        toast.success(`Producción completada: ${successCount} producto${successCount > 1 ? 's' : ''} producido${successCount > 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} con error)` : ''}`)
        closeModal()
        loadData()
      }
    } catch (error) {
      console.error('Error en producción:', error)
      toast.error('Error inesperado al ejecutar producción')
    } finally {
      setIsProcessing(false)
    }
  }

  // Productos filtrados para el grid de búsqueda en el modal
  const availableProducts = products.filter(p => p.type !== 'service')

  const modalFilteredProducts = availableProducts.filter(p => {
    if (!modalSearchTerm) return true
    const term = modalSearchTerm.toLowerCase()
    return p.name?.toLowerCase().includes(term) || p.code?.toLowerCase().includes(term)
  })

  const formatDate = (date) => {
    if (!date) return '-'
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getModeBadge = (mode) => {
    if (mode === 'recipe') {
      return <Badge variant="info"><CookingPot className="w-3 h-3 mr-1" />Con Receta</Badge>
    }
    return <Badge variant="default"><Wrench className="w-3 h-3 mr-1" />Manual</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Cog className="w-7 h-7 text-emerald-600" />
            Producción
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Transforma insumos en productos terminados
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {(branches.length > 0 || !hasMainAccess) && (
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Store className="w-4 h-4 text-gray-500" />
              <select
                value={selectedBranch?.id || ''}
                onChange={(e) => {
                  if (e.target.value === '') {
                    setSelectedBranch(null)
                  } else {
                    const branch = branches.find(b => b.id === e.target.value)
                    setSelectedBranch(branch)
                  }
                  setCurrentPage(1)
                }}
                className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
              >
                {hasMainAccess && <option value="">Sucursal Principal</option>}
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
          )}
          <Button onClick={openModal}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Producción
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Cog className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total producciones</p>
                <p className="text-xl font-bold text-gray-900">{productions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CookingPot className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Con receta</p>
                <p className="text-xl font-bold text-gray-900">
                  {productions.filter(p => p.mode === 'recipe').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Wrench className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Manual</p>
                <p className="text-xl font-bold text-gray-900">
                  {productions.filter(p => p.mode === 'manual').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por producto..."
                className="w-full h-10 pl-10 pr-4 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
              />
            </div>
            <select
              value={filterMode}
              onChange={(e) => { setFilterMode(e.target.value); setCurrentPage(1) }}
              className="h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white flex-shrink-0 w-full sm:w-36"
            >
              <option value="all">Todos</option>
              <option value="recipe">Con receta</option>
              <option value="manual">Manual</option>
            </select>
            <input
              type="date"
              className="h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white flex-shrink-0"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1) }}
            />
            <input
              type="date"
              className="h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white flex-shrink-0"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1) }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabla de historial */}
      <Card>
        <CardContent className="p-0">
          {filteredProductions.length === 0 ? (
            <div className="text-center py-12">
              <Cog className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {productions.length === 0
                  ? 'No hay producciones registradas. Crea tu primera producción.'
                  : 'No se encontraron producciones con los filtros aplicados.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Modo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Almacén</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProductions.map((production) => {
                      const warehouseName = warehouses.find(w => w.id === production.warehouseId)?.name || '-'
                      return (
                        <TableRow key={production.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDate(production.createdAt)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {production.productName}
                          </TableCell>
                          <TableCell>
                            {getModeBadge(production.mode)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {production.quantity}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {warehouseName}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {production.totalCost ? formatCurrency(production.totalCost) : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">
                            {production.notes || '-'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-gray-500">
                    Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredProductions.length)} de {filteredProductions.length}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal de Nueva Producción */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title="Nueva Producción"
        size="xl"
      >
        <div className="space-y-4">
          {/* Selector de almacén destino (filtrado por la sucursal de la página) */}
          <Select
            label="Almacén destino"
            required
            value={modalWarehouseId}
            onChange={(e) => setModalWarehouseId(e.target.value)}
          >
            <option value="">Seleccionar almacén</option>
            {modalFilteredWarehouses.map(warehouse => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name} {warehouse.isDefault ? '(Principal)' : ''}
              </option>
            ))}
          </Select>

          {/* Barra de búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar producto por nombre o código..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              value={modalSearchTerm}
              onChange={(e) => setModalSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          {/* Grid de productos */}
          {modalSearchTerm && (
            <div>
              {modalFilteredProducts.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <Package className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No se encontraron productos</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[250px] overflow-y-auto">
                  {modalFilteredProducts.slice(0, 20).map(product => {
                    const alreadyAdded = productionItems.some(item => item.productId === product.id)
                    const totalStock = Object.values(product.warehouseStock || {}).reduce((sum, s) => sum + (s || 0), 0)
                    return (
                      <button
                        key={product.id}
                        onClick={() => addToProduction(product)}
                        disabled={alreadyAdded}
                        className={`p-3 text-left border rounded-lg transition-colors ${
                          alreadyAdded
                            ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                            : 'hover:bg-primary-50 hover:border-primary-500'
                        }`}
                      >
                        <p className="font-medium text-sm">{product.name}</p>
                        {product.code && (
                          <p className="text-xs text-gray-400">{product.code}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Stock: {totalStock} {product.unit || 'und'}
                        </p>
                        {alreadyAdded && (
                          <span className="text-xs text-primary-600">Ya agregado</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Lista de productos a producir */}
          {productionItems.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  Productos a producir ({productionItems.length})
                </h3>
                <div className="flex-1 border-t border-gray-200" />
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {productionItems.map(item => (
                  <div key={item.id} className="p-3 border rounded-lg bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{item.name}</span>
                          {item.isCheckingRecipe ? (
                            <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                          ) : item.hasRecipe ? (
                            <Badge variant="info" className="text-xs"><CookingPot className="w-3 h-3 mr-1" />Con Receta</Badge>
                          ) : (
                            <Badge variant="default" className="text-xs"><Wrench className="w-3 h-3 mr-1" />Manual</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => decrementQty(item.id)}
                          disabled={item.quantity <= 1 || isProcessing}
                          className="p-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value)
                            if (val > 0) updateItemQuantity(item.id, val)
                          }}
                          className="w-14 text-center text-sm border border-gray-300 rounded py-1 focus:ring-1 focus:ring-primary-500"
                        />
                        <button
                          onClick={() => incrementQty(item.id)}
                          disabled={isProcessing}
                          className="p-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeFromProduction(item.id)}
                          disabled={isProcessing}
                          className="p-1 rounded text-red-500 hover:bg-red-50 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {/* Estado de insumos para items con receta */}
                    {item.hasRecipe && !item.isCheckingRecipe && item.recipeInfo && (
                      <div className={`mt-2 flex items-center gap-1.5 text-xs ${
                        item.recipeInfo.hasStock ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {item.recipeInfo.hasStock ? (
                          <><CheckCircle className="w-3 h-3" /> Insumos disponibles</>
                        ) : (
                          <><AlertTriangle className="w-3 h-3" /> Stock insuficiente
                            {item.recipeInfo.missingIngredients?.length > 0 && (
                              <span className="text-gray-500 ml-1">
                                ({item.recipeInfo.missingIngredients.map(m => m.name).join(', ')})
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas (opcional)
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows={2}
              value={modalNotes}
              onChange={(e) => setModalNotes(e.target.value)}
              placeholder="Notas adicionales sobre esta producción..."
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={closeModal}
              disabled={isProcessing}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmProduction}
              disabled={
                isProcessing ||
                productionItems.length === 0 ||
                !modalWarehouseId ||
                productionItems.some(item => item.isCheckingRecipe) ||
                productionItems.some(item => item.hasRecipe && item.recipeInfo && !item.recipeInfo.hasStock)
              }
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Produciendo...
                </>
              ) : (
                <>
                  <Cog className="w-4 h-4 mr-2" />
                  Confirmar Producción ({productionItems.length})
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
