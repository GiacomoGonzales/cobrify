import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, ChefHat, AlertTriangle, Loader2, Package, MoreVertical } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { formatCurrency } from '@/lib/utils'
import { getRecipes, createRecipe, updateRecipe, deleteRecipe } from '@/services/recipeService'
import { getIngredients } from '@/services/ingredientService'
import { getProducts } from '@/services/firestoreService'

export default function Recipes() {
  const { user, getBusinessId, businessMode, isDemoMode } = useAppContext()
  const demoContext = useDemoRestaurant()
  const toast = useToast()

  // Textos condicionales según el modo de negocio
  const isRestaurantMode = businessMode === 'restaurant'
  const texts = {
    pageTitle: isRestaurantMode ? 'Recetas' : 'Composición',
    pageDescription: isRestaurantMode
      ? 'Define los ingredientes de cada plato'
      : 'Define los insumos que componen tus productos y servicios',
    newButton: isRestaurantMode ? 'Nueva Receta' : 'Nueva Composición',
    searchPlaceholder: isRestaurantMode ? 'Buscar receta...' : 'Buscar producto o servicio...',
    emptyTitle: isRestaurantMode ? 'No hay recetas registradas' : 'No hay composiciones registradas',
    emptyDescription: isRestaurantMode
      ? 'Comienza creando recetas para tus productos'
      : 'Comienza definiendo la composición de tus productos o servicios',
    createButton: isRestaurantMode ? 'Crear Receta' : 'Crear Composición',
    tableHeaderProduct: isRestaurantMode ? 'Producto' : 'Producto/Servicio',
    tableHeaderIngredients: isRestaurantMode ? 'Ingredientes' : 'Insumos Necesarios',
    modalTitleAdd: isRestaurantMode ? 'Nueva Receta' : 'Definir Composición',
    modalTitleEdit: isRestaurantMode ? 'Editar Receta' : 'Editar Composición',
    productLabel: isRestaurantMode ? 'Producto' : 'Producto o Servicio',
    productPlaceholder: isRestaurantMode ? 'Selecciona un producto' : 'Selecciona un producto o servicio',
    ingredientsLabel: isRestaurantMode ? 'Ingredientes' : 'Insumos que Consume',
    ingredientSelect: isRestaurantMode ? 'Selecciona un ingrediente' : 'Selecciona un insumo',
    addIngredientButton: isRestaurantMode ? 'Agregar Ingrediente' : 'Agregar Insumo',
    noIngredientsText: isRestaurantMode ? 'No hay ingredientes agregados' : 'No hay insumos agregados',
    instructionsLabel: isRestaurantMode ? 'Instrucciones (opcional)' : 'Instrucciones o Notas (opcional)',
    instructionsPlaceholder: isRestaurantMode
      ? 'Pasos de preparación...'
      : 'Pasos de preparación, instrucciones de uso, etc...',
    saveButton: isRestaurantMode ? 'Crear Receta' : 'Guardar',
    deleteTitle: isRestaurantMode ? 'Eliminar Receta' : 'Eliminar Composición',
    deleteQuestion: isRestaurantMode ? 'la receta de' : 'la composición de',
    loadingText: isRestaurantMode ? 'Cargando recetas...' : 'Cargando composiciones...',
  }

  const [recipes, setRecipes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: false })

  // Form data
  const [formData, setFormData] = useState({
    productId: '',
    productName: '',
    portions: 1,
    preparationTime: 0,
    instructions: '',
    ingredients: []
  })

  // Ingredient form
  const [ingredientForm, setIngredientForm] = useState({
    ingredientId: '',
    quantity: '',
    unit: 'g'
  })

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid && !demoContext && !isDemoMode) return

    setIsLoading(true)
    try {
      // En modo demo, usar datos del contexto de demo o fallback
      if (demoContext || isDemoMode) {
        // Si hay datos del contexto de demo (DemoRestaurant), usarlos
        if (demoContext?.demoData?.recipes) {
          setRecipes(demoContext.demoData.recipes)
          setIngredients(demoContext.demoData.ingredients || [])
          setProducts(demoContext.demoData.products || [])
        } else if (isRestaurantMode || demoContext) {
          // Demo Restaurant: Recetas de cocina
          const restaurantRecipes = [
            { id: 'rec1', productId: '1', productName: 'Ceviche de Pescado', portions: 1, totalCost: 14.25, preparationTime: 20, instructions: '1. Cortar el pescado en cubos\n2. Agregar limón y dejar reposar\n3. Añadir cebolla, ají y sal', ingredients: [
              { ingredientId: 'ing4', ingredientName: 'Pescado (filete)', quantity: 0.25, unit: 'kg', cost: 4.50 },
              { ingredientId: 'ing5', ingredientName: 'Limón', quantity: 0.15, unit: 'kg', cost: 0.68 },
              { ingredientId: 'ing6', ingredientName: 'Cebolla Roja', quantity: 0.1, unit: 'kg', cost: 0.32 },
            ]},
            { id: 'rec2', productId: '2', productName: 'Lomo Saltado', portions: 1, totalCost: 11.85, preparationTime: 25, instructions: '1. Cortar la carne en tiras\n2. Saltear con vegetales\n3. Servir con papas y arroz', ingredients: [
              { ingredientId: 'ing2', ingredientName: 'Pollo', quantity: 0.2, unit: 'kg', cost: 2.50 },
              { ingredientId: 'ing3', ingredientName: 'Papa', quantity: 0.15, unit: 'kg', cost: 0.38 },
              { ingredientId: 'ing6', ingredientName: 'Cebolla Roja', quantity: 0.1, unit: 'kg', cost: 0.32 },
              { ingredientId: 'ing1', ingredientName: 'Arroz', quantity: 0.1, unit: 'kg', cost: 0.38 },
            ]},
            { id: 'rec3', productId: '3', productName: 'Arroz con Pollo', portions: 1, totalCost: 9.50, preparationTime: 30, instructions: '1. Cocinar el pollo\n2. Preparar el arroz con vegetales\n3. Servir con papa a la huancaína', ingredients: [
              { ingredientId: 'ing2', ingredientName: 'Pollo', quantity: 0.25, unit: 'kg', cost: 3.13 },
              { ingredientId: 'ing1', ingredientName: 'Arroz', quantity: 0.15, unit: 'kg', cost: 0.57 },
              { ingredientId: 'ing3', ingredientName: 'Papa', quantity: 0.15, unit: 'kg', cost: 0.38 },
            ]},
          ]
          const restaurantIngredients = [
            { id: 'ing1', name: 'Arroz', category: 'granos', purchaseUnit: 'kg', currentStock: 45.5, averageCost: 3.80 },
            { id: 'ing2', name: 'Pollo', category: 'carnes', purchaseUnit: 'kg', currentStock: 22.0, averageCost: 12.50 },
            { id: 'ing3', name: 'Papa', category: 'vegetales', purchaseUnit: 'kg', currentStock: 35.0, averageCost: 2.50 },
            { id: 'ing4', name: 'Pescado (filete)', category: 'carnes', purchaseUnit: 'kg', currentStock: 8.5, averageCost: 18.00 },
            { id: 'ing5', name: 'Limón', category: 'vegetales', purchaseUnit: 'kg', currentStock: 12.0, averageCost: 4.50 },
            { id: 'ing6', name: 'Cebolla Roja', category: 'vegetales', purchaseUnit: 'kg', currentStock: 18.0, averageCost: 3.20 },
          ]
          const restaurantProducts = [
            { id: '1', name: 'Ceviche de Pescado', price: 32.00, category: 'Entradas' },
            { id: '2', name: 'Lomo Saltado', price: 28.00, category: 'Platos de Fondo' },
            { id: '3', name: 'Arroz con Pollo', price: 22.00, category: 'Platos de Fondo' },
            { id: '4', name: 'Ají de Gallina', price: 24.00, category: 'Platos de Fondo' },
          ]
          setRecipes(restaurantRecipes)
          setIngredients(restaurantIngredients)
          setProducts(restaurantProducts)
        } else {
          // Demo Retail: Composición de servicios de Spa/Salón
          const retailRecipes = [
            { id: 'rec1', productId: 'srv1', productName: 'Limpieza Facial Profunda', portions: 1, totalCost: 18.50, preparationTime: 45, instructions: '1. Aplicar loción tónica\n2. Aplicar mascarilla de arcilla por 15 min\n3. Retirar con algodón húmedo\n4. Aplicar crema hidratante', ingredients: [
              { ingredientId: 'ins1', ingredientName: 'Crema Hidratante Facial', quantity: 1, unit: 'unidades', cost: 4.50 },
              { ingredientId: 'ins3', ingredientName: 'Mascarilla de Arcilla', quantity: 1, unit: 'unidades', cost: 5.60 },
              { ingredientId: 'ins8', ingredientName: 'Loción Tónica Facial', quantity: 1, unit: 'unidades', cost: 3.20 },
              { ingredientId: 'ins7', ingredientName: 'Algodón (Bolsa 500g)', quantity: 0.1, unit: 'unidades', cost: 0.85 },
            ]},
            { id: 'rec2', productId: 'srv2', productName: 'Masaje Relajante con Aromaterapia', portions: 1, totalCost: 12.80, preparationTime: 60, instructions: '1. Preparar camilla con toallas\n2. Calentar aceite esencial\n3. Realizar masaje por 50 min\n4. Limpiar con toallas', ingredients: [
              { ingredientId: 'ins2', ingredientName: 'Aceite Esencial de Lavanda', quantity: 1, unit: 'unidades', cost: 7.00 },
              { ingredientId: 'ins4', ingredientName: 'Toallas Desechables', quantity: 0.2, unit: 'cajas', cost: 5.00 },
            ]},
            { id: 'rec3', productId: 'srv3', productName: 'Depilación con Cera', portions: 1, totalCost: 8.50, preparationTime: 30, instructions: '1. Limpiar zona con desinfectante\n2. Aplicar cera caliente\n3. Retirar con bandas\n4. Aplicar loción calmante', ingredients: [
              { ingredientId: 'ins10', ingredientName: 'Cera Depilatoria Roll-On', quantity: 1, unit: 'unidades', cost: 2.60 },
              { ingredientId: 'ins5', ingredientName: 'Guantes de Látex (Caja x100)', quantity: 0.02, unit: 'cajas', cost: 0.36 },
              { ingredientId: 'ins9', ingredientName: 'Desinfectante de Superficies', quantity: 0.1, unit: 'unidades', cost: 1.50 },
            ]},
            { id: 'rec4', productId: 'srv4', productName: 'Tratamiento Reductivo con Ultrasonido', portions: 1, totalCost: 15.20, preparationTime: 50, instructions: '1. Aplicar gel conductor\n2. Pasar equipo de ultrasonido por 30 min\n3. Masajear zona tratada\n4. Limpiar con toallas', ingredients: [
              { ingredientId: 'ins6', ingredientName: 'Gel Conductor Ultrasonido', quantity: 1, unit: 'unidades', cost: 4.80 },
              { ingredientId: 'ins4', ingredientName: 'Toallas Desechables', quantity: 0.2, unit: 'cajas', cost: 5.00 },
              { ingredientId: 'ins5', ingredientName: 'Guantes de Látex (Caja x100)', quantity: 0.02, unit: 'cajas', cost: 0.36 },
            ]},
          ]
          const retailIngredients = [
            { id: 'ins1', name: 'Crema Hidratante Facial', category: 'estetica', purchaseUnit: 'unidades', currentStock: 24, averageCost: 45.00 },
            { id: 'ins2', name: 'Aceite Esencial de Lavanda', category: 'estetica', purchaseUnit: 'unidades', currentStock: 18, averageCost: 35.00 },
            { id: 'ins3', name: 'Mascarilla de Arcilla', category: 'estetica', purchaseUnit: 'unidades', currentStock: 15, averageCost: 28.00 },
            { id: 'ins4', name: 'Toallas Desechables', category: 'otros', purchaseUnit: 'cajas', currentStock: 8, averageCost: 25.00 },
            { id: 'ins5', name: 'Guantes de Látex (Caja x100)', category: 'salud', purchaseUnit: 'cajas', currentStock: 12, averageCost: 18.00 },
            { id: 'ins6', name: 'Gel Conductor Ultrasonido', category: 'estetica', purchaseUnit: 'unidades', currentStock: 6, averageCost: 22.00 },
            { id: 'ins7', name: 'Algodón (Bolsa 500g)', category: 'salud', purchaseUnit: 'unidades', currentStock: 20, averageCost: 8.50 },
            { id: 'ins8', name: 'Loción Tónica Facial', category: 'estetica', purchaseUnit: 'unidades', currentStock: 14, averageCost: 32.00 },
            { id: 'ins9', name: 'Desinfectante de Superficies', category: 'limpieza', purchaseUnit: 'unidades', currentStock: 10, averageCost: 15.00 },
            { id: 'ins10', name: 'Cera Depilatoria Roll-On', category: 'estetica', purchaseUnit: 'unidades', currentStock: 22, averageCost: 12.00 },
          ]
          const retailProducts = [
            { id: 'srv1', name: 'Limpieza Facial Profunda', price: 80.00, category: 'Servicios Faciales' },
            { id: 'srv2', name: 'Masaje Relajante con Aromaterapia', price: 120.00, category: 'Masajes' },
            { id: 'srv3', name: 'Depilación con Cera', price: 45.00, category: 'Depilación' },
            { id: 'srv4', name: 'Tratamiento Reductivo con Ultrasonido', price: 150.00, category: 'Tratamientos Corporales' },
            { id: 'srv5', name: 'Manicure Spa', price: 35.00, category: 'Uñas' },
          ]
          setRecipes(retailRecipes)
          setIngredients(retailIngredients)
          setProducts(retailProducts)
        }
      } else {
        // En modo normal, cargar desde Firebase
        const businessId = getBusinessId()
        const [recipesResult, ingredientsResult, productsResult] = await Promise.all([
          getRecipes(businessId),
          getIngredients(businessId),
          getProducts(businessId)
        ])

        if (recipesResult.success) {
          setRecipes(recipesResult.data || [])
        }
        if (ingredientsResult.success) {
          setIngredients(ingredientsResult.data || [])
        }
        if (productsResult.success) {
          setProducts(productsResult.data || [])
        }
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddIngredientToRecipe = () => {
    if (!ingredientForm.ingredientId || !ingredientForm.quantity) {
      toast.error('Selecciona un ingrediente y cantidad')
      return
    }

    const ingredient = ingredients.find(i => i.id === ingredientForm.ingredientId)
    if (!ingredient) return

    // Verificar si ya existe
    if (formData.ingredients.some(i => i.ingredientId === ingredientForm.ingredientId)) {
      toast.error('Este ingrediente ya está en la receta')
      return
    }

    const newIngredient = {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantity: parseFloat(ingredientForm.quantity),
      unit: ingredientForm.unit,
      cost: 0 // Se calculará en el backend
    }

    setFormData({
      ...formData,
      ingredients: [...formData.ingredients, newIngredient]
    })

    // Reset form
    setIngredientForm({
      ingredientId: '',
      quantity: '',
      unit: 'g'
    })
  }

  const handleRemoveIngredient = (ingredientId) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients.filter(i => i.ingredientId !== ingredientId)
    })
  }

  // Obtener unidades compatibles basadas en el ingrediente seleccionado
  const getCompatibleUnits = () => {
    if (!ingredientForm.ingredientId) return []

    const ingredient = ingredients.find(i => i.id === ingredientForm.ingredientId)
    if (!ingredient) return []

    const purchaseUnit = ingredient.purchaseUnit?.toLowerCase()

    // Unidades de peso
    if (purchaseUnit === 'kg' || purchaseUnit === 'g') {
      return [
        { value: 'kg', label: 'kg' },
        { value: 'g', label: 'g' }
      ]
    }

    // Unidades de volumen
    if (purchaseUnit === 'l' || purchaseUnit === 'ml') {
      return [
        { value: 'L', label: 'L' },
        { value: 'ml', label: 'ml' }
      ]
    }

    // Unidades, cajas, etc.
    return [
      { value: ingredient.purchaseUnit, label: ingredient.purchaseUnit }
    ]
  }

  const handleSaveRecipe = async () => {
    // Verificar si está en modo demo
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    if (!formData.productId || formData.ingredients.length === 0) {
      toast.error('Selecciona un producto y agrega al menos un ingrediente')
      return
    }

    setIsSaving(true)
    try {
      const businessId = getBusinessId()

      const recipeData = {
        ...formData,
        portions: parseFloat(formData.portions) || 1,
        preparationTime: parseFloat(formData.preparationTime) || 0
      }

      let result
      if (selectedRecipe) {
        result = await updateRecipe(businessId, selectedRecipe.id, recipeData)
      } else {
        result = await createRecipe(businessId, recipeData)
      }

      if (result.success) {
        toast.success(`Receta ${selectedRecipe ? 'actualizada' : 'creada'} exitosamente. Costo: ${formatCurrency(result.totalCost)}`)
        setShowAddModal(false)
        setShowEditModal(false)
        resetForm()
        loadData()
      } else {
        toast.error(result.error || 'Error al guardar receta')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al guardar receta')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteRecipe = async () => {
    // Verificar si está en modo demo
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    if (!selectedRecipe) return

    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const result = await deleteRecipe(businessId, selectedRecipe.id)

      if (result.success) {
        toast.success('Receta eliminada exitosamente')
        setShowDeleteModal(false)
        setSelectedRecipe(null)
        loadData()
      } else {
        toast.error(result.error || 'Error al eliminar receta')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al eliminar receta')
    } finally {
      setIsSaving(false)
    }
  }

  const openEditModal = (recipe) => {
    setSelectedRecipe(recipe)
    setFormData({
      productId: recipe.productId,
      productName: recipe.productName,
      portions: recipe.portions,
      preparationTime: recipe.preparationTime || 0,
      instructions: recipe.instructions || '',
      ingredients: recipe.ingredients
    })
    setShowEditModal(true)
  }

  const resetForm = () => {
    setFormData({
      productId: '',
      productName: '',
      portions: 1,
      preparationTime: 0,
      instructions: '',
      ingredients: []
    })
    setIngredientForm({
      ingredientId: '',
      quantity: 0,
      unit: 'g'
    })
    setSelectedRecipe(null)
  }

  // Filtrar productos que no tienen receta
  const availableProducts = products.filter(p =>
    !recipes.some(r => r.productId === p.id) || (selectedRecipe && selectedRecipe.productId === p.id)
  )

  // Filtrar recetas
  const filteredRecipes = recipes.filter(recipe =>
    recipe.productName.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{texts.pageTitle}</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {texts.pageDescription}
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} disabled={availableProducts.length === 0}>
          <Plus className="w-4 h-4 mr-2" />
          {texts.newButton}
        </Button>
      </div>

      {/* Info Card - Solo mostrar en modo retail */}
      {!isRestaurantMode && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Package className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-900 mb-1">
                  ¿Para qué sirve esta sección?
                </h3>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Define qué insumos consume cada producto o servicio que ofreces. Por ejemplo: un plato de "Ceviche"
                  consume pescado, limón y cebolla. O un servicio de "Limpieza Facial" consume crema, algodón y mascarilla.
                  El sistema descontará automáticamente los insumos de tu inventario al vender.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
            <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              placeholder={texts.searchPlaceholder}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* Recipes Table */}
      <Card>
        {filteredRecipes.length === 0 ? (
          <CardContent className="p-12 text-center">
            <ChefHat className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron resultados' : texts.emptyTitle}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm ? 'Intenta con otro término de búsqueda' : texts.emptyDescription}
            </p>
            {!searchTerm && availableProducts.length > 0 && (
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {texts.createButton}
              </Button>
            )}
          </CardContent>
        ) : (
          <div className="overflow-hidden">
            {/* Vista móvil - Tarjetas */}
            <div className="lg:hidden divide-y divide-gray-100">
              {filteredRecipes.map(recipe => (
                <div key={recipe.id} className="px-4 py-3 hover:bg-gray-50">
                  {/* Fila 1: Nombre + acciones */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-2 flex-1">{recipe.productName}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const menuHeight = 120
                        const spaceBelow = window.innerHeight - rect.bottom
                        const openUpward = spaceBelow < menuHeight
                        setMenuPosition({
                          top: openUpward ? rect.top - 8 : rect.bottom + 8,
                          right: window.innerWidth - rect.right,
                          openUpward
                        })
                        setOpenMenuId(openMenuId === recipe.id ? null : recipe.id)
                      }}
                      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fila 2: Ingredientes */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {recipe.ingredients.slice(0, 3).map((ing, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {ing.ingredientName}
                      </Badge>
                    ))}
                    {recipe.ingredients.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{recipe.ingredients.length - 3}
                      </Badge>
                    )}
                  </div>

                  {/* Fila 3: Porciones + Tiempo + Costo */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{recipe.portions} porción{recipe.portions > 1 ? 'es' : ''}</span>
                      {recipe.preparationTime > 0 && (
                        <>
                          <span className="text-gray-300">•</span>
                          <span>{recipe.preparationTime} min</span>
                        </>
                      )}
                    </div>
                    <span className="text-sm font-bold text-green-600">
                      {formatCurrency(recipe.totalCost || 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Vista desktop - Tabla */}
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{texts.tableHeaderProduct}</TableHead>
                    <TableHead>{texts.tableHeaderIngredients}</TableHead>
                    <TableHead>Porciones</TableHead>
                    <TableHead>Costo Total</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecipes.map(recipe => (
                    <TableRow key={recipe.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{recipe.productName}</p>
                          {recipe.preparationTime > 0 && (
                            <p className="text-xs text-gray-500">{recipe.preparationTime} min</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {recipe.ingredients.slice(0, 3).map((ing, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {ing.ingredientName}
                            </Badge>
                          ))}
                          {recipe.ingredients.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{recipe.ingredients.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{recipe.portions}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-green-600">
                          {formatCurrency(recipe.totalCost || 0)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(recipe)}
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRecipe(recipe)
                              setShowDeleteModal(true)
                            }}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Menú de acciones flotante */}
            {openMenuId && (() => {
              const menuRecipe = filteredRecipes.find(r => r.id === openMenuId)
              if (!menuRecipe) return null
              return (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                  <div
                    className="fixed w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                    style={{
                      top: `${menuPosition.top}px`,
                      right: `${menuPosition.right}px`,
                      transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
                    }}
                  >
                    <button
                      onClick={() => { openEditModal(menuRecipe); setOpenMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Edit className="w-4 h-4 text-blue-600" />
                      Editar
                    </button>
                    <button
                      onClick={() => { setSelectedRecipe(menuRecipe); setShowDeleteModal(true); setOpenMenuId(null) }}
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

      {/* Add/Edit Recipe Modal */}
      <Modal
        isOpen={showAddModal || showEditModal}
        onClose={() => {
          setShowAddModal(false)
          setShowEditModal(false)
          resetForm()
        }}
        title={showEditModal ? texts.modalTitleEdit : texts.modalTitleAdd}
        size="lg"
      >
        <div className="space-y-4">
          {/* Product Selection */}
          <Select
            label={texts.productLabel}
            value={formData.productId}
            onChange={e => {
              const product = products.find(p => p.id === e.target.value)
              setFormData({
                ...formData,
                productId: e.target.value,
                productName: product?.name || ''
              })
            }}
            required
            disabled={showEditModal}
          >
            <option value="">{texts.productPlaceholder}</option>
            {availableProducts.map(product => (
              <option key={product.id} value={product.id}>
                {product.name} - {formatCurrency(product.price)}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Porciones"
              type="number"
              step="0.5"
              value={formData.portions}
              onChange={e => setFormData({ ...formData, portions: e.target.value })}
            />
            <Input
              label="Tiempo de preparación (min)"
              type="number"
              value={formData.preparationTime}
              onChange={e => setFormData({ ...formData, preparationTime: e.target.value })}
            />
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {texts.ingredientsLabel}
            </label>

            {/* Add Ingredient Form */}
            <div className="bg-gray-50 p-4 rounded-lg mb-3 space-y-3">
              <Select
                value={ingredientForm.ingredientId}
                onChange={e => {
                  const ingredientId = e.target.value
                  const ingredient = ingredients.find(i => i.id === ingredientId)

                  // Establecer la unidad por defecto basada en el tipo de ingrediente
                  let defaultUnit = 'g'
                  if (ingredient) {
                    const purchaseUnit = ingredient.purchaseUnit?.toLowerCase()
                    if (purchaseUnit === 'kg' || purchaseUnit === 'g') {
                      defaultUnit = 'g' // Unidad más pequeña para peso
                    } else if (purchaseUnit === 'l' || purchaseUnit === 'ml') {
                      defaultUnit = 'ml' // Unidad más pequeña para volumen
                    } else {
                      defaultUnit = ingredient.purchaseUnit // Misma unidad
                    }
                  }

                  setIngredientForm({
                    ...ingredientForm,
                    ingredientId,
                    unit: defaultUnit
                  })
                }}
              >
                <option value="">{texts.ingredientSelect}</option>
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name}
                  </option>
                ))}
              </Select>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ej: 150"
                  value={ingredientForm.quantity}
                  onChange={e => {
                    let value = e.target.value.replace(',', '.')
                    if (value === '' || value === '.' || value === '0.' || /^-?\d*\.?\d*$/.test(value)) {
                      setIngredientForm({ ...ingredientForm, quantity: value })
                    }
                  }}
                />
                <Select
                  value={ingredientForm.unit}
                  onChange={e => setIngredientForm({ ...ingredientForm, unit: e.target.value })}
                  disabled={!ingredientForm.ingredientId}
                >
                  {ingredientForm.ingredientId ? (
                    getCompatibleUnits().map(unit => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))
                  ) : (
                    <option value="">Primero selecciona ingrediente</option>
                  )}
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleAddIngredientToRecipe}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                {texts.addIngredientButton}
              </Button>
            </div>

            {/* Ingredients List */}
            {formData.ingredients.length > 0 ? (
              <div className="space-y-2">
                {formData.ingredients.map((ing, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{ing.ingredientName}</p>
                      <p className="text-xs text-gray-500">
                        {ing.quantity} {ing.unit}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveIngredient(ing.ingredientId)}
                      className="text-red-600 hover:bg-red-50 p-2 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                {texts.noIngredientsText}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {texts.instructionsLabel}
            </label>
            <textarea
              value={formData.instructions}
              onChange={e => setFormData({ ...formData, instructions: e.target.value })}
              placeholder={texts.instructionsPlaceholder}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Actions */}
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
            <Button onClick={handleSaveRecipe} disabled={isSaving}>
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

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setSelectedRecipe(null)
        }}
        title={texts.deleteTitle}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar {texts.deleteQuestion} <strong>{selectedRecipe?.productName}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción no se puede deshacer.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false)
                setSelectedRecipe(null)
              }}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDeleteRecipe} disabled={isSaving}>
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
    </div>
  )
}
