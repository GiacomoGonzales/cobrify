import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Edit, Trash2, Package, AlertTriangle, ShoppingCart, TrendingUp, TrendingDown, Loader2, Receipt, History, Upload, Download } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { formatCurrency } from '@/lib/utils'
import {
  getIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  registerPurchase,
  getPurchases
} from '@/services/ingredientService'
import { generateIngredientsExcel } from '@/services/ingredientExportService'
import ImportIngredientsModal from '@/components/ImportIngredientsModal'

const CATEGORIES = [
  { value: 'granos', label: 'Granos y Cereales' },
  { value: 'carnes', label: 'Carnes' },
  { value: 'vegetales', label: 'Vegetales y Frutas' },
  { value: 'lacteos', label: 'Lácteos' },
  { value: 'condimentos', label: 'Condimentos y Especias' },
  { value: 'bebidas', label: 'Bebidas' },
  { value: 'estetica', label: 'Estética y Belleza' },
  { value: 'salud', label: 'Salud y Farmacia' },
  { value: 'limpieza', label: 'Limpieza' },
  { value: 'otros', label: 'Otros' }
]

const UNITS = [
  { value: 'kg', label: 'Kilogramos (kg)' },
  { value: 'g', label: 'Gramos (g)' },
  { value: 'L', label: 'Litros (L)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'unidades', label: 'Unidades' },
  { value: 'cajas', label: 'Cajas' },
  { value: 'sobres', label: 'Sobres' },
  { value: 'piezas', label: 'Piezas' }
]

export default function Ingredients() {
  const { user, getBusinessId, isDemoMode, businessMode } = useAppContext()
  const demoContext = useDemoRestaurant()
  const navigate = useNavigate()
  const toast = useToast()

  // Textos condicionales según el modo de negocio
  const isRestaurantMode = businessMode === 'restaurant'
  const texts = {
    pageTitle: isRestaurantMode ? 'Ingredientes' : 'Insumos',
    pageDescription: isRestaurantMode
      ? 'Gestiona tu inventario de materia prima'
      : 'Gestiona el stock de insumos de tu negocio',
    tableHeader: isRestaurantMode ? 'Ingrediente' : 'Insumo',
    emptyTitle: isRestaurantMode ? 'No hay ingredientes registrados' : 'No hay insumos registrados',
    emptyDescription: isRestaurantMode
      ? 'Comienza agregando tu primer ingrediente'
      : 'Comienza agregando los insumos que usa tu negocio',
    addButton: isRestaurantMode ? 'Agregar Ingrediente' : 'Agregar Insumo',
    newButton: isRestaurantMode ? 'Nuevo Ingrediente' : 'Nuevo Insumo',
    modalTitleAdd: isRestaurantMode ? 'Nuevo Ingrediente' : 'Nuevo Insumo',
    modalTitleEdit: isRestaurantMode ? 'Editar Ingrediente' : 'Editar Insumo',
    nameLabel: isRestaurantMode ? 'Nombre del Ingrediente' : 'Nombre del Insumo',
    namePlaceholder: isRestaurantMode
      ? 'Ej: Arroz blanco'
      : 'Ej: Crema limpiadora, Arroz, Algodón, etc.',
    saveButton: isRestaurantMode ? 'Agregar Ingrediente' : 'Agregar Insumo',
    deleteTitle: isRestaurantMode ? 'Eliminar Ingrediente' : 'Eliminar Insumo',
    deleteQuestion: isRestaurantMode ? 'ingrediente' : 'insumo',
    loadingText: isRestaurantMode ? 'Cargando ingredientes...' : 'Cargando insumos...',
    emptySearchTitle: isRestaurantMode ? 'No se encontraron ingredientes' : 'No se encontraron insumos',
  }

  const [ingredients, setIngredients] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [selectedIngredient, setSelectedIngredient] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    category: 'otros',
    purchaseUnit: 'kg',
    currentStock: '',
    minimumStock: '',
    averageCost: '',
    supplier: ''
  })

  const [purchaseData, setPurchaseData] = useState({
    quantity: '',
    unitPrice: '',
    supplier: '',
    invoiceNumber: ''
  })

  useEffect(() => {
    loadIngredients()
  }, [user])

  const loadIngredients = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      // En modo demo, usar insumos del contexto de demo o fallback
      if (demoContext) {
        const demoIngredients = demoContext.demoData?.ingredients || [
          {
            id: 'ing1',
            name: 'Arroz',
            category: 'granos',
            purchaseUnit: 'kg',
            currentStock: 45.5,
            minimumStock: 10,
            averageCost: 3.80,
            lastPurchasePrice: 3.90,
            lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 5)),
            createdAt: new Date(2024, 0, 15),
          },
          {
            id: 'ing2',
            name: 'Pollo',
            category: 'carnes',
            purchaseUnit: 'kg',
            currentStock: 22.0,
            minimumStock: 8,
            averageCost: 12.50,
            lastPurchasePrice: 12.80,
            lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 2)),
            createdAt: new Date(2024, 0, 15),
          },
          {
            id: 'ing3',
            name: 'Papa',
            category: 'vegetales',
            purchaseUnit: 'kg',
            currentStock: 35.0,
            minimumStock: 15,
            averageCost: 2.50,
            lastPurchasePrice: 2.60,
            lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 3)),
            createdAt: new Date(2024, 0, 15),
          },
          {
            id: 'ing4',
            name: 'Pescado (filete)',
            category: 'carnes',
            purchaseUnit: 'kg',
            currentStock: 8.5,
            minimumStock: 5,
            averageCost: 18.00,
            lastPurchasePrice: 18.50,
            lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 1)),
            createdAt: new Date(2024, 0, 15),
          },
          {
            id: 'ing5',
            name: 'Limón',
            category: 'vegetales',
            purchaseUnit: 'kg',
            currentStock: 12.0,
            minimumStock: 3,
            averageCost: 4.50,
            lastPurchasePrice: 4.80,
            lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 1)),
            createdAt: new Date(2024, 0, 15),
          },
          {
            id: 'ing6',
            name: 'Cebolla Roja',
            category: 'vegetales',
            purchaseUnit: 'kg',
            currentStock: 18.0,
            minimumStock: 5,
            averageCost: 3.20,
            lastPurchasePrice: 3.50,
            lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 4)),
            createdAt: new Date(2024, 0, 15),
          },
          {
            id: 'ing7',
            name: 'Tomate',
            category: 'vegetales',
            purchaseUnit: 'kg',
            currentStock: 15.5,
            minimumStock: 5,
            averageCost: 3.80,
            lastPurchasePrice: 4.00,
            lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 2)),
            createdAt: new Date(2024, 0, 15),
          },
          {
            id: 'ing8',
            name: 'Aceite Vegetal',
            category: 'condimentos',
            purchaseUnit: 'litros',
            currentStock: 8.0,
            minimumStock: 3,
            averageCost: 12.00,
            lastPurchasePrice: 12.50,
            lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 7)),
            createdAt: new Date(2024, 0, 15),
          },
          {
            id: 'ing9',
            name: 'Sal',
            category: 'condimentos',
            purchaseUnit: 'kg',
            currentStock: 5.0,
            minimumStock: 2,
            averageCost: 2.00,
            lastPurchasePrice: 2.20,
            lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 10)),
            createdAt: new Date(2024, 0, 15),
          },
          {
            id: 'ing10',
            name: 'Ají Amarillo',
            category: 'condimentos',
            purchaseUnit: 'kg',
            currentStock: 3.5,
            minimumStock: 1,
            averageCost: 8.50,
            lastPurchasePrice: 9.00,
            lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 3)),
            createdAt: new Date(2024, 0, 15),
          },
        ]
        setIngredients(demoIngredients)
      } else {
        // En modo normal, cargar desde Firebase
        const businessId = getBusinessId()
        const result = await getIngredients(businessId)

        if (result.success) {
          setIngredients(result.data || [])
        } else {
          toast.error('Error al cargar ingredientes')
        }
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar ingredientes')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddIngredient = async () => {
    // Verificar si está en modo demo
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    if (!formData.name) {
      toast.error('El nombre del ingrediente es requerido')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()

      // Convertir strings vacíos a 0
      const dataToSave = {
        ...formData,
        currentStock: parseFloat(formData.currentStock) || 0,
        minimumStock: parseFloat(formData.minimumStock) || 0,
        averageCost: parseFloat(formData.averageCost) || 0
      }

      const result = await createIngredient(businessId, dataToSave)

      if (result.success) {
        toast.success('Ingrediente agregado exitosamente')
        setShowAddModal(false)
        resetForm()
        loadIngredients()
      } else {
        toast.error(result.error || 'Error al agregar ingrediente')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al agregar ingrediente')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditIngredient = async () => {
    // Verificar si está en modo demo
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    if (!selectedIngredient) return

    setIsSaving(true)
    try {
      const businessId = getBusinessId()

      // Convertir strings vacíos a 0
      const dataToSave = {
        ...formData,
        currentStock: parseFloat(formData.currentStock) || 0,
        minimumStock: parseFloat(formData.minimumStock) || 0,
        averageCost: parseFloat(formData.averageCost) || 0
      }

      const result = await updateIngredient(businessId, selectedIngredient.id, dataToSave)

      if (result.success) {
        toast.success('Ingrediente actualizado exitosamente')
        setShowEditModal(false)
        resetForm()
        loadIngredients()
      } else {
        toast.error(result.error || 'Error al actualizar ingrediente')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al actualizar ingrediente')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteIngredient = async () => {
    // Verificar si está en modo demo
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    if (!selectedIngredient) return

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const result = await deleteIngredient(businessId, selectedIngredient.id)

      if (result.success) {
        toast.success('Ingrediente eliminado exitosamente')
        setShowDeleteModal(false)
        setSelectedIngredient(null)
        loadIngredients()
      } else {
        toast.error(result.error || 'Error al eliminar ingrediente')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al eliminar ingrediente')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRegisterPurchase = async () => {
    if (!selectedIngredient) {
      toast.error('Selecciona un ingrediente')
      return
    }

    const quantity = parseFloat(purchaseData.quantity)
    const unitPrice = parseFloat(purchaseData.unitPrice)

    if (!quantity || quantity <= 0) {
      toast.error('Ingresa una cantidad válida')
      return
    }

    if (!unitPrice || unitPrice <= 0) {
      toast.error('Ingresa un precio válido')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const result = await registerPurchase(businessId, {
        ingredientId: selectedIngredient.id,
        ingredientName: selectedIngredient.name,
        quantity: quantity,
        unit: selectedIngredient.purchaseUnit,
        unitPrice: unitPrice,
        totalCost: quantity * unitPrice,
        supplier: purchaseData.supplier || 'Sin proveedor',
        invoiceNumber: purchaseData.invoiceNumber
      })

      if (result.success) {
        toast.success('Compra registrada exitosamente')
        setShowPurchaseModal(false)
        resetPurchaseForm()
        loadIngredients()
      } else {
        toast.error(result.error || 'Error al registrar compra')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al registrar compra')
    } finally {
      setIsSaving(false)
    }
  }

  const openEditModal = (ingredient) => {
    setSelectedIngredient(ingredient)
    setFormData({
      name: ingredient.name,
      category: ingredient.category,
      purchaseUnit: ingredient.purchaseUnit,
      currentStock: ingredient.currentStock,
      minimumStock: ingredient.minimumStock,
      averageCost: ingredient.averageCost,
      supplier: ingredient.supplier || ''
    })
    setShowEditModal(true)
  }

  const openPurchaseModal = (ingredient) => {
    setSelectedIngredient(ingredient)
    setPurchaseData({
      quantity: 0,
      unitPrice: ingredient.lastPurchasePrice || ingredient.averageCost || 0,
      supplier: ingredient.supplier || '',
      invoiceNumber: ''
    })
    setShowPurchaseModal(true)
  }

  const openDeleteModal = (ingredient) => {
    setSelectedIngredient(ingredient)
    setShowDeleteModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'otros',
      purchaseUnit: 'kg',
      currentStock: '',
      minimumStock: '',
      averageCost: '',
      supplier: ''
    })
    setSelectedIngredient(null)
  }

  const resetPurchaseForm = () => {
    setPurchaseData({
      quantity: '',
      unitPrice: '',
      supplier: '',
      invoiceNumber: ''
    })
    setSelectedIngredient(null)
  }

  // Exportar ingredientes a Excel
  const handleExportExcel = () => {
    const businessData = {
      name: user?.displayName || 'Mi Negocio',
      ruc: user?.ruc || 'N/A'
    }
    generateIngredientsExcel(filteredIngredients, businessData)
    toast.success('Excel descargado exitosamente')
  }

  // Importar ingredientes desde Excel
  const handleImportIngredients = async (ingredientsToImport) => {
    const businessId = getBusinessId()
    let successCount = 0
    const errors = []

    for (const ingredientData of ingredientsToImport) {
      try {
        const result = await createIngredient(businessId, ingredientData)
        if (result.success) {
          successCount++
        } else {
          errors.push(`${ingredientData.name}: ${result.error}`)
        }
      } catch (error) {
        errors.push(`${ingredientData.name}: Error al importar`)
      }
    }

    await loadIngredients()

    return {
      success: successCount,
      errors
    }
  }

  // Filter ingredients
  const filteredIngredients = ingredients.filter(ingredient => {
    const matchesSearch = ingredient.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = filterCategory === 'all' || ingredient.category === filterCategory
    return matchesSearch && matchesCategory
  })

  // Stats
  const stats = {
    total: ingredients.length,
    lowStock: ingredients.filter(i => i.currentStock <= i.minimumStock).length,
    totalValue: ingredients.reduce((sum, i) => sum + (i.currentStock * i.averageCost), 0)
  }

  const getCategoryLabel = (category) => {
    const cat = CATEGORIES.find(c => c.value === category)
    return cat ? cat.label : category
  }

  const getStockStatus = (ingredient) => {
    if (ingredient.currentStock <= 0) {
      return <Badge variant="danger">Sin stock</Badge>
    }
    if (ingredient.currentStock <= ingredient.minimumStock) {
      return <Badge variant="warning">Stock bajo</Badge>
    }
    return <Badge variant="success">Stock OK</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">{texts.loadingText}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{texts.pageTitle}</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {texts.pageDescription}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="w-full sm:w-auto"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportModal(true)}
            className="w-full sm:w-auto"
          >
            <Upload className="w-4 h-4 mr-2" />
            Importar Excel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const basePath = isDemoMode ? '/demo' : '/app'
              navigate(`${basePath}/ingredientes/compra`)
            }}
            className="w-full sm:w-auto"
          >
            <Receipt className="w-4 h-4 mr-2" />
            Registrar Compra
          </Button>
          <Button variant="outline" onClick={() => setShowAddModal(true)} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            {texts.newButton}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Ingredientes</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
              </div>
              <Package className="w-8 h-8 text-primary-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Stock Bajo</p>
                <p className="text-2xl font-bold text-yellow-600 mt-2">{stats.lowStock}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Valor Total</p>
                <p className="text-2xl font-bold text-green-600 mt-2">{formatCurrency(stats.totalValue)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar ingrediente..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <Select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">Todas las categorías</option>
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Ingredients Table */}
      <Card>
        {filteredIngredients.length === 0 ? (
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterCategory !== 'all'
                ? texts.emptySearchTitle
                : texts.emptyTitle}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterCategory !== 'all'
                ? 'Intenta con otros filtros de búsqueda'
                : texts.emptyDescription}
            </p>
            {!searchTerm && filterCategory === 'all' && (
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {texts.addButton}
              </Button>
            )}
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{texts.tableHeader}</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Stock Actual</TableHead>
                <TableHead>Costo Promedio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIngredients.map(ingredient => (
                <TableRow key={ingredient.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{ingredient.name}</p>
                      {ingredient.supplier && (
                        <p className="text-xs text-gray-500">{ingredient.supplier}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{getCategoryLabel(ingredient.category)}</span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-semibold">{parseFloat(ingredient.currentStock || 0).toFixed(2)} {ingredient.purchaseUnit}</p>
                      <p className="text-xs text-gray-500">Mín: {parseFloat(ingredient.minimumStock || 0).toFixed(2)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{formatCurrency(ingredient.averageCost)}</span>
                    <span className="text-xs text-gray-500">/{ingredient.purchaseUnit}</span>
                  </TableCell>
                  <TableCell>
                    {getStockStatus(ingredient)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openPurchaseModal(ingredient)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="Registrar compra"
                      >
                        <ShoppingCart className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          const basePath = isDemoMode ? '/demo' : '/app'
                          navigate(`${basePath}/ingredientes/historial?ingredientId=${ingredient.id}`)
                        }}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                        title="Ver historial"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(ingredient)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openDeleteModal(ingredient)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add/Edit Ingredient Modal */}
      <Modal
        isOpen={showAddModal || showEditModal}
        onClose={() => {
          setShowAddModal(false)
          setShowEditModal(false)
          resetForm()
        }}
        title={showEditModal ? texts.modalTitleEdit : texts.modalTitleAdd}
      >
        <div className="space-y-4">
          <Input
            label={texts.nameLabel}
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder={texts.namePlaceholder}
            required
          />

          <Select
            label="Categoría"
            value={formData.category}
            onChange={e => setFormData({ ...formData, category: e.target.value })}
          >
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </Select>

          <Select
            label="Unidad de Compra"
            value={formData.purchaseUnit}
            onChange={e => setFormData({ ...formData, purchaseUnit: e.target.value })}
          >
            {UNITS.map(unit => (
              <option key={unit.value} value={unit.value}>{unit.label}</option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Stock Mínimo"
              type="text"
              inputMode="decimal"
              placeholder="Ej: 10"
              value={formData.minimumStock}
              onChange={e => {
                const value = e.target.value.replace(',', '.')
                setFormData({ ...formData, minimumStock: value })
              }}
            />
            <Input
              label="Stock Inicial"
              type="text"
              inputMode="decimal"
              placeholder="Ej: 50"
              value={formData.currentStock}
              onChange={e => {
                const value = e.target.value.replace(',', '.')
                setFormData({ ...formData, currentStock: value })
              }}
            />
          </div>

          <Input
            label="Proveedor (opcional)"
            value={formData.supplier}
            onChange={e => setFormData({ ...formData, supplier: e.target.value })}
            placeholder="Nombre del proveedor"
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false)
                setShowEditModal(false)
                resetForm()
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={showEditModal ? handleEditIngredient : handleAddIngredient}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                showEditModal ? 'Guardar Cambios' : texts.saveButton
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Register Purchase Modal */}
      <Modal
        isOpen={showPurchaseModal}
        onClose={() => {
          setShowPurchaseModal(false)
          resetPurchaseForm()
        }}
        title={`Registrar Compra: ${selectedIngredient?.name}`}
      >
        <div className="space-y-4">
          <Input
            label={`Cantidad (${selectedIngredient?.purchaseUnit})`}
            type="text"
            inputMode="decimal"
            value={purchaseData.quantity}
            onChange={e => {
              const value = e.target.value.replace(',', '.')
              setPurchaseData({ ...purchaseData, quantity: value })
            }}
            placeholder="Ej: 50"
            required
          />

          <Input
            label={`Precio Unitario (por ${selectedIngredient?.purchaseUnit})`}
            type="text"
            inputMode="decimal"
            value={purchaseData.unitPrice}
            onChange={e => {
              const value = e.target.value.replace(',', '.')
              setPurchaseData({ ...purchaseData, unitPrice: value })
            }}
            placeholder="Ej: 0.08"
            required
          />

          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Costo Total:</p>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency((parseFloat(purchaseData.quantity) || 0) * (parseFloat(purchaseData.unitPrice) || 0))}
            </p>
          </div>

          <Input
            label="Proveedor"
            value={purchaseData.supplier}
            onChange={e => setPurchaseData({ ...purchaseData, supplier: e.target.value })}
            placeholder="Nombre del proveedor"
          />

          <Input
            label="Nº Factura/Boleta (opcional)"
            value={purchaseData.invoiceNumber}
            onChange={e => setPurchaseData({ ...purchaseData, invoiceNumber: e.target.value })}
            placeholder="F001-123"
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowPurchaseModal(false)
                resetPurchaseForm()
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleRegisterPurchase} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                'Registrar Compra'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setSelectedIngredient(null)
        }}
        title={texts.deleteTitle}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar <strong>{selectedIngredient?.name}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción no se puede deshacer y se perderá el historial de este {texts.deleteQuestion}.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false)
                setSelectedIngredient(null)
              }}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDeleteIngredient} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import Ingredients Modal */}
      <ImportIngredientsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImportIngredients}
      />
    </div>
  )
}
