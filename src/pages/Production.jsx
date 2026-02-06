import React, { useState, useEffect } from 'react'
import {
  Cog,
  Plus,
  Search,
  Loader2,
  Calendar,
  Package,
  AlertTriangle,
  CheckCircle,
  CookingPot,
  Wrench,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency } from '@/lib/utils'
import { getProducts } from '@/services/firestoreService'
import { getWarehouses } from '@/services/warehouseService'
import { getRecipeByProductId, checkRecipeStock, calculateRecipeCost } from '@/services/recipeService'
import { getProductions, executeRecipeProduction, executeManualProduction, checkProductionReadiness } from '@/services/productionService'

export default function Production() {
  const { user, getBusinessId } = useAppContext()
  const toast = useToast()

  // Estado principal
  const [productions, setProductions] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Modal de nueva producción
  const [showModal, setShowModal] = useState(false)
  const [productionMode, setProductionMode] = useState(null) // 'recipe' | 'manual'
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [productionQuantity, setProductionQuantity] = useState('')
  const [productionNotes, setProductionNotes] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Estado de receta/verificación
  const [recipeInfo, setRecipeInfo] = useState(null) // { recipe, hasStock, missingIngredients }
  const [isCheckingRecipe, setIsCheckingRecipe] = useState(false)

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
      const [prodsResult, whResult, productionsResult] = await Promise.all([
        getProducts(businessId),
        getWarehouses(businessId),
        getProductions(businessId)
      ])

      if (prodsResult.success) setProducts(prodsResult.data || [])
      if (whResult.success) setWarehouses(whResult.data || [])
      if (productionsResult.success) setProductions(productionsResult.data || [])
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  // Filtrar producciones
  const filteredProductions = productions.filter(p => {
    const matchesSearch = !searchTerm ||
      p.productName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesMode = filterMode === 'all' || p.mode === filterMode

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

    return matchesSearch && matchesMode && matchesDateFrom && matchesDateTo
  })

  // Paginación
  const totalPages = Math.ceil(filteredProductions.length / itemsPerPage)
  const paginatedProductions = filteredProductions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // Abrir modal
  const openModal = () => {
    setShowModal(true)
    setProductionMode(null)
    setSelectedProductId('')
    setSelectedWarehouseId('')
    setProductionQuantity('')
    setProductionNotes('')
    setRecipeInfo(null)
    // Auto-seleccionar almacén si solo hay uno
    const activeWarehouses = warehouses.filter(w => w.isActive)
    if (activeWarehouses.length === 1) {
      setSelectedWarehouseId(activeWarehouses[0].id)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setProductionMode(null)
    setSelectedProductId('')
    setSelectedWarehouseId('')
    setProductionQuantity('')
    setProductionNotes('')
    setRecipeInfo(null)
  }

  // Cuando se selecciona un producto en modo receta, verificar receta y stock
  const handleProductSelect = async (productId) => {
    setSelectedProductId(productId)
    setRecipeInfo(null)

    if (!productId || productionMode !== 'recipe') return

    setIsCheckingRecipe(true)
    try {
      const businessId = getBusinessId()
      const qty = parseFloat(productionQuantity) || 1
      const readiness = await checkProductionReadiness(businessId, productId, qty)

      if (readiness.success && readiness.hasRecipe) {
        // Calcular costo
        let totalCost = 0
        if (readiness.recipe?.ingredients) {
          totalCost = await calculateRecipeCost(businessId, readiness.recipe.ingredients) * qty
        }
        setRecipeInfo({
          recipe: readiness.recipe,
          hasStock: readiness.hasStock,
          missingIngredients: readiness.missingIngredients || [],
          totalCost
        })
      } else {
        setRecipeInfo(null)
        if (!readiness.hasRecipe) {
          toast.error('Este producto no tiene composición/receta')
          setSelectedProductId('')
        }
      }
    } catch (error) {
      console.error('Error al verificar receta:', error)
    } finally {
      setIsCheckingRecipe(false)
    }
  }

  // Re-verificar cuando cambia la cantidad
  const handleQuantityChange = async (value) => {
    setProductionQuantity(value)
    if (productionMode === 'recipe' && selectedProductId && value) {
      const qty = parseFloat(value)
      if (qty > 0) {
        setIsCheckingRecipe(true)
        try {
          const businessId = getBusinessId()
          const readiness = await checkProductionReadiness(businessId, selectedProductId, qty)
          if (readiness.success && readiness.hasRecipe) {
            let totalCost = 0
            if (readiness.recipe?.ingredients) {
              totalCost = await calculateRecipeCost(businessId, readiness.recipe.ingredients) * qty
            }
            setRecipeInfo({
              recipe: readiness.recipe,
              hasStock: readiness.hasStock,
              missingIngredients: readiness.missingIngredients || [],
              totalCost
            })
          }
        } catch (error) {
          console.error('Error al re-verificar stock:', error)
        } finally {
          setIsCheckingRecipe(false)
        }
      }
    }
  }

  // Ejecutar producción
  const handleProduction = async () => {
    if (!user?.uid) return

    const quantity = parseFloat(productionQuantity)
    if (!selectedProductId) {
      toast.error('Selecciona un producto')
      return
    }
    if (!selectedWarehouseId) {
      toast.error('Selecciona un almacén destino')
      return
    }
    if (!quantity || quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    const product = products.find(p => p.id === selectedProductId)
    if (!product) {
      toast.error('Producto no encontrado')
      return
    }

    setIsProcessing(true)
    try {
      const businessId = getBusinessId()
      const params = {
        productId: selectedProductId,
        productName: product.name,
        quantity,
        warehouseId: selectedWarehouseId,
        notes: productionNotes,
        userId: user.uid,
        product
      }

      let result
      if (productionMode === 'recipe') {
        result = await executeRecipeProduction(businessId, params)
      } else {
        result = await executeManualProduction(businessId, params)
      }

      if (result.success) {
        const modeLabel = productionMode === 'recipe' ? 'con receta' : 'manual'
        toast.success(`Producción ${modeLabel} completada: ${quantity} unidades de ${product.name}`)
        closeModal()
        loadData() // Recargar datos
      } else {
        toast.error(result.error || 'Error al ejecutar producción')
      }
    } catch (error) {
      console.error('Error en producción:', error)
      toast.error('Error inesperado al ejecutar producción')
    } finally {
      setIsProcessing(false)
    }
  }

  // Productos filtrados para el selector según modo
  const availableProducts = products.filter(p => p.type !== 'service')

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Cog className="w-7 h-7 text-emerald-600" />
            Producción
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Transforma insumos en productos terminados
          </p>
        </div>
        <Button onClick={openModal}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Producción
        </Button>
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
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por producto..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
              />
            </div>
            <Select
              value={filterMode}
              onChange={(e) => { setFilterMode(e.target.value); setCurrentPage(1) }}
            >
              <option value="all">Todos los modos</option>
              <option value="recipe">Con receta</option>
              <option value="manual">Manual</option>
            </Select>
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <input
                type="date"
                className="text-sm border-none focus:ring-0 p-0 bg-transparent"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1) }}
              />
            </div>
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <input
                type="date"
                className="text-sm border-none focus:ring-0 p-0 bg-transparent"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1) }}
              />
            </div>
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
        size="lg"
      >
        <div className="space-y-5">
          {/* Paso 1: Selección de modo */}
          {!productionMode && (
            <div>
              <p className="text-sm text-gray-600 mb-3">Selecciona el modo de producción:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setProductionMode('recipe')}
                  className="p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                      <CookingPot className="w-5 h-5 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Con Composición</h3>
                  </div>
                  <p className="text-sm text-gray-500">
                    Descuenta insumos automáticamente según la receta y aumenta el stock del producto.
                  </p>
                </button>
                <button
                  onClick={() => setProductionMode('manual')}
                  className="p-4 border-2 border-gray-200 rounded-xl hover:border-gray-500 hover:bg-gray-50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-gray-200 transition-colors">
                      <Wrench className="w-5 h-5 text-gray-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Manual</h3>
                  </div>
                  <p className="text-sm text-gray-500">
                    Solo aumenta el stock del producto sin descontar insumos.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Paso 2: Formulario de producción */}
          {productionMode && (
            <>
              {/* Indicador de modo */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {productionMode === 'recipe' ? (
                    <Badge variant="info"><CookingPot className="w-3 h-3 mr-1" />Modo: Con Composición</Badge>
                  ) : (
                    <Badge variant="default"><Wrench className="w-3 h-3 mr-1" />Modo: Manual</Badge>
                  )}
                </div>
                <button
                  onClick={() => {
                    setProductionMode(null)
                    setSelectedProductId('')
                    setRecipeInfo(null)
                    setProductionQuantity('')
                  }}
                  className="text-sm text-primary-600 hover:underline"
                >
                  Cambiar modo
                </button>
              </div>

              {/* Selector de producto */}
              <Select
                label="Producto"
                required
                value={selectedProductId}
                onChange={(e) => handleProductSelect(e.target.value)}
              >
                <option value="">Seleccionar producto</option>
                {availableProducts.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name} {product.code ? `(${product.code})` : ''}
                  </option>
                ))}
              </Select>

              {/* Selector de almacén destino */}
              <Select
                label="Almacén destino"
                required
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
              >
                <option value="">Seleccionar almacén</option>
                {warehouses.filter(w => w.isActive).map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </Select>

              {/* Campo cantidad */}
              <Input
                label="Cantidad a producir"
                type="number"
                min="1"
                step="1"
                required
                value={productionQuantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                placeholder="Ej: 10"
              />

              {/* Vista previa de receta (solo modo recipe) */}
              {productionMode === 'recipe' && selectedProductId && (
                <div>
                  {isCheckingRecipe ? (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                      <span className="text-sm text-gray-500">Verificando receta e insumos...</span>
                    </div>
                  ) : recipeInfo ? (
                    <div className={`p-4 rounded-lg border ${recipeInfo.hasStock ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex items-center gap-2 mb-3">
                        {recipeInfo.hasStock ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        )}
                        <span className={`text-sm font-medium ${recipeInfo.hasStock ? 'text-green-700' : 'text-red-700'}`}>
                          {recipeInfo.hasStock ? 'Stock de insumos disponible' : 'Stock insuficiente'}
                        </span>
                      </div>

                      {/* Lista de ingredientes */}
                      {recipeInfo.recipe?.ingredients && (
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500 font-medium mb-1">Insumos requeridos:</p>
                          {recipeInfo.recipe.ingredients.map((ing, idx) => {
                            const needed = ing.quantity * (parseFloat(productionQuantity) || 1)
                            const missing = recipeInfo.missingIngredients?.find(
                              m => m.name === ing.ingredientName
                            )
                            return (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className={missing ? 'text-red-600' : 'text-gray-700'}>
                                  {ing.ingredientName}
                                </span>
                                <span className={missing ? 'text-red-600 font-medium' : 'text-gray-500'}>
                                  {needed.toFixed(2)} {ing.unit}
                                  {missing && ` (disponible: ${missing.available.toFixed(2)})`}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Costo estimado */}
                      {recipeInfo.totalCost > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="flex justify-between text-sm font-medium">
                            <span className="text-gray-600">Costo estimado:</span>
                            <span className="text-gray-900">{formatCurrency(recipeInfo.totalCost)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
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
                  value={productionNotes}
                  onChange={(e) => setProductionNotes(e.target.value)}
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
                  onClick={handleProduction}
                  disabled={
                    isProcessing ||
                    !selectedProductId ||
                    !selectedWarehouseId ||
                    !productionQuantity ||
                    (productionMode === 'recipe' && recipeInfo && !recipeInfo.hasStock) ||
                    (productionMode === 'recipe' && isCheckingRecipe)
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
                      Confirmar Producción
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
