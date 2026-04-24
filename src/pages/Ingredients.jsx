import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Edit, Trash2, Package, AlertTriangle, TrendingUp, Loader2, Upload, Download, Store, MoreVertical, ArrowRight, FolderPlus, ChevronUp, ChevronDown, SortAsc, Check, X } from 'lucide-react'
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
  getIngredientStockForBranch
} from '@/services/ingredientService'
import { getActiveBranches } from '@/services/branchService'
import { getWarehouses } from '@/services/warehouseService'
import { generateIngredientsExcel } from '@/services/ingredientExportService'
import { getIngredientCategories, saveIngredientCategories } from '@/services/firestoreService'
import ImportIngredientsModal from '@/components/ImportIngredientsModal'

// Categorías por defecto cuando un negocio usa el módulo por primera vez.
// Se auto-siembra una sola vez; luego el dueño puede editarlas/eliminarlas.
const DEFAULT_CATEGORIES = [
  { id: 'granos', name: 'Granos y Cereales', order: 0 },
  { id: 'carnes', name: 'Carnes', order: 1 },
  { id: 'vegetales', name: 'Vegetales y Frutas', order: 2 },
  { id: 'lacteos', name: 'Lácteos', order: 3 },
  { id: 'condimentos', name: 'Condimentos y Especias', order: 4 },
  { id: 'bebidas', name: 'Bebidas', order: 5 },
  { id: 'estetica', name: 'Estética y Belleza', order: 6 },
  { id: 'salud', name: 'Salud y Farmacia', order: 7 },
  { id: 'limpieza', name: 'Limpieza', order: 8 },
  { id: 'otros', name: 'Otros', order: 9 },
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
  const { user, getBusinessId, isDemoMode, businessMode, hasMainBranchAccess } = useAppContext()
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

  // Sucursales y almacenes
  const [branches, setBranches] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showManageCategoriesModal, setShowManageCategoriesModal] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [selectedIngredient, setSelectedIngredient] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: false })
  const [visibleCount, setVisibleCount] = useState(20)
  const ITEMS_PER_PAGE = 20

  // Categorías dinámicas del negocio
  const [categories, setCategories] = useState([])

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    category: 'otros',
    purchaseUnit: 'kg',
    currentStock: '',
    minimumStock: '',
    averageCost: '',
    supplier: '',
    trackStock: true
  })
  const [warehouseInitialStocks, setWarehouseInitialStocks] = useState({})


  useEffect(() => {
    loadIngredients()
    loadBranchesAndWarehouses()
    loadCategories()
  }, [user])

  const loadCategories = async () => {
    if (!user?.uid) return
    if (isDemoMode) {
      setCategories(DEFAULT_CATEGORIES)
      return
    }
    try {
      const businessId = getBusinessId()
      const result = await getIngredientCategories(businessId)
      if (result.success) {
        if (!result.data || result.data.length === 0) {
          // Primera vez: sembrar con las categorías por defecto
          const seeded = [...DEFAULT_CATEGORIES]
          await saveIngredientCategories(businessId, seeded)
          setCategories(seeded)
        } else {
          setCategories(result.data)
        }
      }
    } catch (err) {
      console.error('Error cargando categorías de ingredientes:', err)
      setCategories(DEFAULT_CATEGORIES)
    }
  }

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    // Evitar duplicados (case-insensitive)
    const exists = categories.some(c => c.name.toLowerCase() === name.toLowerCase())
    if (exists) {
      toast.error('Ya existe una categoría con ese nombre')
      return
    }
    const newCat = {
      id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name,
      order: categories.length,
    }
    const updated = [...categories, newCat]
    setCategories(updated)
    setFormData(prev => ({ ...prev, category: newCat.id }))
    setNewCategoryName('')
    setShowCategoryModal(false)
    if (!isDemoMode) {
      const result = await saveIngredientCategories(getBusinessId(), updated)
      if (!result.success) {
        toast.error('No se pudo guardar la categoría')
      } else {
        toast.success(`Categoría "${name}" creada`)
      }
    }
  }

  const persistCategories = async (updated) => {
    setCategories(updated)
    if (!isDemoMode) {
      const result = await saveIngredientCategories(getBusinessId(), updated)
      if (!result.success) {
        toast.error('No se pudo guardar los cambios')
        return false
      }
    }
    return true
  }

  const handleRenameCategory = async (categoryId, newName) => {
    const name = newName.trim()
    if (!name) {
      toast.error('El nombre no puede estar vacío')
      return
    }
    const duplicate = categories.some(c => c.id !== categoryId && c.name.toLowerCase() === name.toLowerCase())
    if (duplicate) {
      toast.error('Ya existe una categoría con ese nombre')
      return
    }
    const updated = categories.map(c => c.id === categoryId ? { ...c, name } : c)
    const ok = await persistCategories(updated)
    if (ok) toast.success('Categoría renombrada')
  }

  const handleDeleteCategory = async (categoryId) => {
    const cat = categories.find(c => c.id === categoryId)
    if (!cat) return
    const inUse = ingredients.filter(i => i.category === categoryId).length
    if (inUse > 0) {
      toast.error(`No se puede eliminar: ${inUse} ingrediente(s) usan esta categoría`, 5000)
      return
    }
    if (!window.confirm(`¿Eliminar categoría "${cat.name}"?`)) return
    const updated = categories.filter(c => c.id !== categoryId)
      .map((c, i) => ({ ...c, order: i }))
    const ok = await persistCategories(updated)
    if (ok) toast.success('Categoría eliminada')
  }

  const handleMoveCategory = async (categoryId, direction) => {
    const sorted = [...categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    const idx = sorted.findIndex(c => c.id === categoryId)
    const swapIdx = idx + direction
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return
    ;[sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]]
    const updated = sorted.map((c, i) => ({ ...c, order: i }))
    await persistCategories(updated)
  }

  const handleSortCategoriesAlphabetically = async () => {
    if (!categories.length) return
    const sorted = [...categories]
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
      .map((c, i) => ({ ...c, order: i }))
    const ok = await persistCategories(sorted)
    if (ok) toast.success('Categorías ordenadas alfabéticamente')
  }

  const loadBranchesAndWarehouses = async () => {
    if (!user?.uid || isDemoMode) return

    const businessId = getBusinessId()
    try {
      const [branchesResult, warehousesResult] = await Promise.all([
        getActiveBranches(businessId),
        getWarehouses(businessId)
      ])

      if (branchesResult.success) {
        setBranches(branchesResult.data || [])
      }
      if (warehousesResult.success) {
        const activeWarehouses = (warehousesResult.data || []).filter(w => w.isActive !== false)
        setWarehouses(activeWarehouses)
      }
    } catch (error) {
      console.error('Error al cargar sucursales/almacenes:', error)
    }
  }

  const loadIngredients = async () => {
    if (!user?.uid && !isDemoMode) return

    setIsLoading(true)
    try {
      // En modo demo, usar insumos del contexto de demo o fallback
      if (isDemoMode) {
        // Si hay datos del contexto de demo restaurant, usarlos
        if (demoContext?.demoData?.ingredients) {
          setIngredients(demoContext.demoData.ingredients)
        } else if (isRestaurantMode) {
          // Demo Restaurant: Ingredientes de cocina
          const restaurantIngredients = [
            { id: 'ing1', name: 'Arroz', category: 'granos', purchaseUnit: 'kg', currentStock: 45.5, minimumStock: 10, averageCost: 3.80, lastPurchasePrice: 3.90, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 5)), createdAt: new Date(2024, 0, 15) },
            { id: 'ing2', name: 'Pollo', category: 'carnes', purchaseUnit: 'kg', currentStock: 22.0, minimumStock: 8, averageCost: 12.50, lastPurchasePrice: 12.80, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 2)), createdAt: new Date(2024, 0, 15) },
            { id: 'ing3', name: 'Papa', category: 'vegetales', purchaseUnit: 'kg', currentStock: 35.0, minimumStock: 15, averageCost: 2.50, lastPurchasePrice: 2.60, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 3)), createdAt: new Date(2024, 0, 15) },
            { id: 'ing4', name: 'Pescado (filete)', category: 'carnes', purchaseUnit: 'kg', currentStock: 8.5, minimumStock: 5, averageCost: 18.00, lastPurchasePrice: 18.50, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 1)), createdAt: new Date(2024, 0, 15) },
            { id: 'ing5', name: 'Limón', category: 'vegetales', purchaseUnit: 'kg', currentStock: 12.0, minimumStock: 3, averageCost: 4.50, lastPurchasePrice: 4.80, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 1)), createdAt: new Date(2024, 0, 15) },
            { id: 'ing6', name: 'Cebolla Roja', category: 'vegetales', purchaseUnit: 'kg', currentStock: 18.0, minimumStock: 5, averageCost: 3.20, lastPurchasePrice: 3.50, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 4)), createdAt: new Date(2024, 0, 15) },
            { id: 'ing7', name: 'Aceite Vegetal', category: 'condimentos', purchaseUnit: 'L', currentStock: 8.0, minimumStock: 3, averageCost: 12.00, lastPurchasePrice: 12.50, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 7)), createdAt: new Date(2024, 0, 15) },
            { id: 'ing8', name: 'Sal', category: 'condimentos', purchaseUnit: 'kg', currentStock: 5.0, minimumStock: 2, averageCost: 2.00, lastPurchasePrice: 2.20, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 10)), createdAt: new Date(2024, 0, 15) },
          ]
          setIngredients(restaurantIngredients)
        } else {
          // Demo Retail: Insumos de Spa/Salón de Belleza
          const retailIngredients = [
            { id: 'ins1', name: 'Crema Hidratante Facial', category: 'estetica', purchaseUnit: 'unidades', currentStock: 24, minimumStock: 10, averageCost: 45.00, lastPurchasePrice: 48.00, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 5)), createdAt: new Date(2024, 0, 15) },
            { id: 'ins2', name: 'Aceite Esencial de Lavanda', category: 'estetica', purchaseUnit: 'unidades', currentStock: 18, minimumStock: 8, averageCost: 35.00, lastPurchasePrice: 38.00, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 3)), createdAt: new Date(2024, 0, 15) },
            { id: 'ins3', name: 'Mascarilla de Arcilla', category: 'estetica', purchaseUnit: 'unidades', currentStock: 15, minimumStock: 5, averageCost: 28.00, lastPurchasePrice: 30.00, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 7)), createdAt: new Date(2024, 0, 15) },
            { id: 'ins4', name: 'Toallas Desechables', category: 'otros', purchaseUnit: 'cajas', currentStock: 8, minimumStock: 3, averageCost: 25.00, lastPurchasePrice: 26.00, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 10)), createdAt: new Date(2024, 0, 15) },
            { id: 'ins5', name: 'Guantes de Látex (Caja x100)', category: 'salud', purchaseUnit: 'cajas', currentStock: 12, minimumStock: 5, averageCost: 18.00, lastPurchasePrice: 19.50, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 4)), createdAt: new Date(2024, 0, 15) },
            { id: 'ins6', name: 'Gel Conductor Ultrasonido', category: 'estetica', purchaseUnit: 'unidades', currentStock: 6, minimumStock: 3, averageCost: 22.00, lastPurchasePrice: 24.00, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 8)), createdAt: new Date(2024, 0, 15) },
            { id: 'ins7', name: 'Algodón (Bolsa 500g)', category: 'salud', purchaseUnit: 'unidades', currentStock: 20, minimumStock: 8, averageCost: 8.50, lastPurchasePrice: 9.00, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 2)), createdAt: new Date(2024, 0, 15) },
            { id: 'ins8', name: 'Loción Tónica Facial', category: 'estetica', purchaseUnit: 'unidades', currentStock: 14, minimumStock: 6, averageCost: 32.00, lastPurchasePrice: 35.00, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 6)), createdAt: new Date(2024, 0, 15) },
            { id: 'ins9', name: 'Desinfectante de Superficies', category: 'limpieza', purchaseUnit: 'unidades', currentStock: 10, minimumStock: 4, averageCost: 15.00, lastPurchasePrice: 16.00, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 12)), createdAt: new Date(2024, 0, 15) },
            { id: 'ins10', name: 'Cera Depilatoria Roll-On', category: 'estetica', purchaseUnit: 'unidades', currentStock: 22, minimumStock: 10, averageCost: 12.00, lastPurchasePrice: 13.00, lastPurchaseDate: new Date(new Date().setDate(new Date().getDate() - 1)), createdAt: new Date(2024, 0, 15) },
          ]
          setIngredients(retailIngredients)
        }
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
    if (isDemoMode) {
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
      // Construir warehouseStocks desde los inputs por almacén
      const activeWarehouses = warehouses.filter(w => w.isActive !== false)
      let warehouseStocks = []
      let totalStock = 0

      if (activeWarehouses.length > 0 && formData.trackStock) {
        warehouseStocks = activeWarehouses
          .filter(w => parseFloat(warehouseInitialStocks[w.id]) > 0)
          .map(w => {
            const qty = parseFloat(warehouseInitialStocks[w.id]) || 0
            totalStock += qty
            return { warehouseId: w.id, stock: qty, minStock: 0 }
          })
      } else {
        totalStock = parseFloat(formData.currentStock) || 0
      }

      const dataToSave = {
        ...formData,
        currentStock: totalStock,
        minimumStock: parseFloat(formData.minimumStock) || 0,
        averageCost: parseFloat(formData.averageCost) || 0,
        ...(warehouseStocks.length > 0 && { warehouseStocks })
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
    if (isDemoMode) {
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
    if (isDemoMode) {
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

  const openEditModal = (ingredient) => {
    setSelectedIngredient(ingredient)
    setFormData({
      name: ingredient.name,
      category: ingredient.category,
      purchaseUnit: ingredient.purchaseUnit,
      currentStock: ingredient.currentStock,
      minimumStock: ingredient.minimumStock,
      averageCost: ingredient.averageCost,
      supplier: ingredient.supplier || '',
      trackStock: ingredient.trackStock !== false // Por defecto true para compatibilidad
    })
    setShowEditModal(true)
  }

  const openDeleteModal = (ingredient) => {
    setSelectedIngredient(ingredient)
    setShowDeleteModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      category: categories[0]?.id || '',
      purchaseUnit: 'kg',
      currentStock: '',
      minimumStock: '',
      averageCost: '',
      supplier: '',
      trackStock: true
    })
    setSelectedIngredient(null)
    setWarehouseInitialStocks({})
  }

  // Exportar ingredientes a Excel
  const handleExportExcel = async () => {
    try {
      const businessData = {
        name: user?.displayName || 'Mi Negocio',
        ruc: user?.ruc || 'N/A'
      }
      await generateIngredientsExcel(filteredIngredients, businessData, categories)
      toast.success('Excel exportado exitosamente')
    } catch (error) {
      console.error('Error al exportar:', error)
      toast.error('Error al exportar Excel')
    }
  }

  // Importar ingredientes desde Excel
  const handleImportIngredients = async (ingredientsToImport) => {
    const businessId = getBusinessId()
    let successCount = 0
    const errors = []

    // Resolver/auto-crear categorías nuevas del Excel
    let updatedCategories = [...categories]
    const newCategoryNames = new Set()
    for (const ing of ingredientsToImport) {
      const name = (ing.categoryName || '').trim()
      if (!name) continue
      const exists = updatedCategories.some(c => c.name.toLowerCase() === name.toLowerCase())
      if (!exists) newCategoryNames.add(name)
    }
    if (newCategoryNames.size > 0) {
      for (const name of newCategoryNames) {
        updatedCategories.push({
          id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          name,
          order: updatedCategories.length,
        })
      }
      if (!isDemoMode) {
        await saveIngredientCategories(businessId, updatedCategories)
      }
      setCategories(updatedCategories)
      toast.info(`${newCategoryNames.size} categoría(s) creada(s) desde Excel`)
    }

    for (const ingredientData of ingredientsToImport) {
      try {
        // Mapear nombre de categoría a ID (existente o recién creada)
        let categoryId = ''
        const catName = (ingredientData.categoryName || '').trim()
        if (catName) {
          const match = updatedCategories.find(c => c.name.toLowerCase() === catName.toLowerCase())
          if (match) categoryId = match.id
        }
        // Si no se especificó, usar la primera categoría disponible
        if (!categoryId && updatedCategories.length > 0) {
          categoryId = updatedCategories[0].id
        }

        const { categoryName, ...payload } = ingredientData
        payload.category = categoryId

        const result = await createIngredient(businessId, payload)
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

  // Helper para obtener stock de un ingrediente según el filtro de sucursal
  const getStockForBranch = useMemo(() => {
    return (ingredient) => {
      if (filterBranch === 'all') {
        return ingredient.currentStock || 0
      }
      return getIngredientStockForBranch(ingredient, warehouses, filterBranch)
    }
  }, [warehouses, filterBranch])

  // Filter ingredients
  const filteredIngredients = ingredients.filter(ingredient => {
    const matchesSearch = ingredient.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = filterCategory === 'all' || ingredient.category === filterCategory
    return matchesSearch && matchesCategory
  })

  const displayedIngredients = filteredIngredients.slice(0, visibleCount)
  const hasMore = filteredIngredients.length > visibleCount

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE)
  }, [searchTerm, filterCategory])

  // Stats (calculados según sucursal filtrada)
  const stats = useMemo(() => {
    return {
      total: ingredients.length,
      lowStock: ingredients.filter(i => {
        const stock = getStockForBranch(i)
        return stock <= (i.minimumStock || 0)
      }).length,
      totalValue: ingredients.reduce((sum, i) => {
        const stock = getStockForBranch(i)
        return sum + (stock * (i.averageCost || 0))
      }, 0)
    }
  }, [ingredients, getStockForBranch])

  const getCategoryLabel = (category) => {
    if (!category) return ''
    // Buscar por id primero (categorías nuevas/personalizadas)
    const byId = categories.find(c => c.id === category)
    if (byId) return byId.name
    // Retrocompat: algunos ingredientes viejos guardaron el valor hardcoded como string directo
    const byName = categories.find(c => c.name.toLowerCase() === String(category).toLowerCase())
    if (byName) return byName.name
    // Fallback: mostrar el string tal cual
    return category
  }

  const getStockStatus = (ingredient) => {
    const stock = getStockForBranch(ingredient)
    if (stock <= 0) {
      return <Badge variant="danger">Sin stock</Badge>
    }
    if (stock <= (ingredient.minimumStock || 0)) {
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
            variant="outline"
            onClick={() => setShowManageCategoriesModal(true)}
            className="w-full sm:w-auto"
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            Categorías
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const basePath = isDemoMode ? '/demo' : '/app'
              navigate(`${basePath}/inventario`)
            }}
            className="w-full sm:w-auto"
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            Ver Inventario
          </Button>
          <Button variant="primary" onClick={() => setShowAddModal(true)} className="w-full sm:w-auto">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Buscar ingrediente..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
            <Select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">Todas las categorías</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </Select>
            {/* Filtro de Sucursal */}
            {branches.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                <Store className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <select
                  value={filterBranch}
                  onChange={e => setFilterBranch(e.target.value)}
                  className="flex-1 text-sm bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
                >
                  <option value="all">Todas las sucursales</option>
                  {hasMainBranchAccess && <option value="main">Sucursal Principal</option>}
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            )}
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
          <div className="overflow-hidden">
            {/* Vista móvil - Tarjetas */}
            <div className="lg:hidden divide-y divide-gray-100">
              {displayedIngredients.map(ingredient => (
                <div key={ingredient.id} className="px-4 py-3 hover:bg-gray-50">
                  {/* Fila 1: Nombre + acciones */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-2 flex-1">{ingredient.name}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const menuHeight = 200
                        const spaceBelow = window.innerHeight - rect.bottom
                        const openUpward = spaceBelow < menuHeight
                        setMenuPosition({
                          top: openUpward ? rect.top - 8 : rect.bottom + 8,
                          right: window.innerWidth - rect.right,
                          openUpward
                        })
                        setOpenMenuId(openMenuId === ingredient.id ? null : ingredient.id)
                      }}
                      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fila 2: Categoría + Proveedor */}
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span>{getCategoryLabel(ingredient.category)}</span>
                    {ingredient.supplier && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span className="truncate">{ingredient.supplier}</span>
                      </>
                    )}
                  </div>

                  {/* Fila 3: Stock + Costo + Estado */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold">
                        {parseFloat(getStockForBranch(ingredient)).toFixed(2)} {ingredient.purchaseUnit}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatCurrency(ingredient.averageCost)}/{ingredient.purchaseUnit}
                      </span>
                    </div>
                    {getStockStatus(ingredient)}
                  </div>
                </div>
              ))}
            </div>

            {/* Vista desktop - Tabla */}
            <div className="hidden lg:block">
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
                  {displayedIngredients.map(ingredient => (
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
                          <p className="font-semibold">{parseFloat(getStockForBranch(ingredient)).toFixed(2)} {ingredient.purchaseUnit}</p>
                          <p className="text-xs text-gray-500">Mín: {parseFloat(ingredient.minimumStock || 0).toFixed(2)}</p>
                          {filterBranch !== 'all' && ingredient.currentStock !== getStockForBranch(ingredient) && (
                            <p className="text-xs text-blue-500">Total: {parseFloat(ingredient.currentStock || 0).toFixed(2)}</p>
                          )}
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
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (openMenuId === ingredient.id) {
                                setOpenMenuId(null)
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect()
                                const spaceBelow = window.innerHeight - rect.bottom
                                setMenuPosition({
                                  top: spaceBelow < 250 ? rect.top : rect.bottom,
                                  right: window.innerWidth - rect.right,
                                  openUpward: spaceBelow < 250
                                })
                                setOpenMenuId(ingredient.id)
                              }
                            }}
                            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Menú de acciones flotante */}
            {openMenuId && (() => {
              const menuIngredient = filteredIngredients.find(i => i.id === openMenuId)
              if (!menuIngredient) return null
              return (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                  <div
                    className="fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                    style={{
                      top: `${menuPosition.top}px`,
                      right: `${menuPosition.right}px`,
                      transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
                    }}
                  >
                    <button
                      onClick={() => {
                        const basePath = isDemoMode ? '/demo' : '/app'
                        navigate(`${basePath}/inventario?search=${encodeURIComponent(menuIngredient.name)}`)
                        setOpenMenuId(null)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-purple-600 hover:bg-purple-50"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Ver en Inventario
                    </button>
                    <button
                      onClick={() => { openEditModal(menuIngredient); setOpenMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Edit className="w-4 h-4 text-blue-600" />
                      Editar
                    </button>
                    <button
                      onClick={() => { openDeleteModal(menuIngredient); setOpenMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Eliminar
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </Card>

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
            className="text-sm text-gray-600 hover:text-primary-600 transition-colors py-2 px-4 hover:bg-gray-50 rounded-lg"
          >
            Ver más ({filteredIngredients.length - visibleCount} restantes)
          </button>
        </div>
      )}

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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Categoría</label>
              <button
                type="button"
                onClick={() => { setNewCategoryName(''); setShowCategoryModal(true) }}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                <Plus className="w-3 h-3" />
                Nueva categoría
              </button>
            </div>
            <Select
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
            >
              {categories.length === 0 && <option value="">Sin categoría</option>}
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </Select>
          </div>

          <Select
            label="Unidad de Compra"
            value={formData.purchaseUnit}
            onChange={e => setFormData({ ...formData, purchaseUnit: e.target.value })}
          >
            {UNITS.map(unit => (
              <option key={unit.value} value={unit.value}>{unit.label}</option>
            ))}
          </Select>

          {formData.trackStock && (
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
              {warehouses.filter(w => w.isActive !== false).length > 0 && !showEditModal ? (
                <div className="col-span-full">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stock Inicial por Almacén</label>
                  <div className="space-y-2">
                    {warehouses.filter(w => w.isActive !== false).map(w => (
                      <div key={w.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-200">
                        <span className="text-sm text-gray-700 flex-1">{w.name}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={warehouseInitialStocks[w.id] || ''}
                          onChange={e => {
                            const value = e.target.value.replace(',', '.')
                            setWarehouseInitialStocks(prev => ({ ...prev, [w.id]: value }))
                          }}
                          className="w-24 px-3 py-1.5 text-sm text-center border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                        />
                        <span className="text-xs text-gray-400 w-12">{formData.purchaseUnit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
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
              )}
            </div>
          )}

          <Input
            label="Proveedor (opcional)"
            value={formData.supplier}
            onChange={e => setFormData({ ...formData, supplier: e.target.value })}
            placeholder="Nombre del proveedor"
          />

          {/* Switch para control de stock */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">Solo para costos</p>
              <p className="text-xs text-gray-500">No maneja inventario, solo sirve para calcular costos en recetas</p>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, trackStock: !formData.trackStock })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                !formData.trackStock ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  !formData.trackStock ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

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

      {/* Modal de nueva categoría (acceso rápido desde el formulario) */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); setNewCategoryName('') }}
        title="Nueva categoría"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Nombre de la categoría"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
            placeholder="Ej: Panadería, Bebidas frías, Limpieza"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowCategoryModal(false); setNewCategoryName('') }}>
              Cancelar
            </Button>
            <Button onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>
              Crear
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de gestión de categorías (renombrar / eliminar / reordenar) */}
      <Modal
        isOpen={showManageCategoriesModal}
        onClose={() => {
          setShowManageCategoriesModal(false)
          setEditingCategoryId(null)
          setEditingCategoryName('')
          setNewCategoryName('')
        }}
        title="Gestionar categorías"
        size="lg"
      >
        <div className="space-y-4">
          {/* Crear nueva */}
          <div className="flex gap-2">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
              placeholder="Nombre de nueva categoría"
              className="flex-1"
            />
            <Button onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              Agregar
            </Button>
          </div>

          {/* Acciones sobre la lista */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {categories.length} categoría{categories.length !== 1 ? 's' : ''}
            </p>
            {categories.length > 1 && (
              <Button variant="outline" size="sm" onClick={handleSortCategoriesAlphabetically}>
                <SortAsc className="w-4 h-4 mr-1" />
                Ordenar A-Z
              </Button>
            )}
          </div>

          {/* Lista */}
          {categories.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">
              Aún no tienes categorías. Crea la primera arriba.
            </p>
          ) : (
            <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
              {[...categories]
                .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
                .map((cat, idx, arr) => {
                  const usageCount = ingredients.filter(i => i.category === cat.id).length
                  const isEditing = editingCategoryId === cat.id
                  return (
                    <div key={cat.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                      {/* Flechas reorder */}
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => handleMoveCategory(cat.id, -1)}
                          disabled={idx === 0}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Subir"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveCategory(cat.id, 1)}
                          disabled={idx === arr.length - 1}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Bajar"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Nombre (edita inline) */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <Input
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameCategory(cat.id, editingCategoryName)
                                setEditingCategoryId(null)
                                setEditingCategoryName('')
                              } else if (e.key === 'Escape') {
                                setEditingCategoryId(null)
                                setEditingCategoryName('')
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <div>
                            <div className="font-medium text-sm text-gray-900 truncate">{cat.name}</div>
                            <div className="text-xs text-gray-500">
                              {usageCount} ingrediente{usageCount !== 1 ? 's' : ''}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => {
                                handleRenameCategory(cat.id, editingCategoryName)
                                setEditingCategoryId(null)
                                setEditingCategoryName('')
                              }}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50"
                              title="Guardar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setEditingCategoryId(null); setEditingCategoryName('') }}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100"
                              title="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryName(cat.name) }}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100"
                              title="Renombrar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(cat.id)}
                              disabled={usageCount > 0}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={usageCount > 0 ? `No se puede eliminar (${usageCount} en uso)` : 'Eliminar'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowManageCategoriesModal(false)
                setEditingCategoryId(null)
                setEditingCategoryName('')
                setNewCategoryName('')
              }}
            >
              Cerrar
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
