import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, ChefHat, AlertTriangle, Loader2, Package } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
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
  const { user, getBusinessId } = useAppContext()
  const toast = useToast()

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
    if (!user?.uid) return

    setIsLoading(true)
    try {
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
          <p className="text-gray-600">Cargando recetas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Recetas</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Define los ingredientes de cada plato
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} disabled={availableProducts.length === 0}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Receta
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar receta..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              {searchTerm ? 'No se encontraron recetas' : 'No hay recetas registradas'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm ? 'Intenta con otro término de búsqueda' : 'Comienza creando recetas para tus productos'}
            </p>
            {!searchTerm && availableProducts.length > 0 && (
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Receta
              </Button>
            )}
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Ingredientes</TableHead>
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
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditModal(recipe)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedRecipe(recipe)
                          setShowDeleteModal(true)
                        }}
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

      {/* Add/Edit Recipe Modal */}
      <Modal
        isOpen={showAddModal || showEditModal}
        onClose={() => {
          setShowAddModal(false)
          setShowEditModal(false)
          resetForm()
        }}
        title={showEditModal ? 'Editar Receta' : 'Nueva Receta'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Product Selection */}
          <Select
            label="Producto"
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
            <option value="">Selecciona un producto</option>
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
              Ingredientes
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
                <option value="">Selecciona un ingrediente</option>
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
                Agregar Ingrediente
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
                No hay ingredientes agregados
              </div>
            )}
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Instrucciones (opcional)
            </label>
            <textarea
              value={formData.instructions}
              onChange={e => setFormData({ ...formData, instructions: e.target.value })}
              placeholder="Pasos de preparación..."
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
                showEditModal ? 'Guardar Cambios' : 'Crear Receta'
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
        title="Eliminar Receta"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar la receta de <strong>{selectedRecipe?.productName}</strong>?
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
