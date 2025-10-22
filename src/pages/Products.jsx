import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Search, Edit, Trash2, Package, Loader2, AlertTriangle, DollarSign, Folder, FolderPlus, Tag } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { productSchema } from '@/utils/schemas'
import { formatCurrency } from '@/lib/utils'
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductCategories,
  saveProductCategories,
} from '@/services/firestoreService'

// Unidades de medida
const UNITS = [
  { value: 'UNIDAD', label: 'Unidad' },
  { value: 'CAJA', label: 'Caja' },
  { value: 'KG', label: 'Kilogramo' },
  { value: 'LITRO', label: 'Litro' },
  { value: 'METRO', label: 'Metro' },
  { value: 'HORA', label: 'Hora' },
  { value: 'SERVICIO', label: 'Servicio' },
]

// Helper functions for category hierarchy
const migrateLegacyCategories = (cats) => {
  if (!cats || cats.length === 0) return []
  // Si ya son objetos con id, devolverlos tal cual
  if (typeof cats[0] === 'object' && cats[0].id) return cats
  // Migrar strings antiguos a nuevo formato
  return cats.map((name) => ({
    id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name,
    parentId: null,
  }))
}

const getRootCategories = (categories) => {
  return categories.filter(cat => cat.parentId === null)
}

const getSubcategories = (categories, parentId) => {
  return categories.filter(cat => cat.parentId === parentId)
}

const getCategoryPath = (categories, categoryId) => {
  const category = categories.find(cat => cat.id === categoryId)
  if (!category) return ''

  if (category.parentId === null) {
    return category.name
  }

  const parent = getCategoryPath(categories, category.parentId)
  return parent ? `${parent} > ${category.name}` : category.name
}

const getCategoryById = (categories, id) => {
  return categories.find(cat => cat.id === id)
}

export default function Products() {
  const { user } = useAuth()
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [deletingProduct, setDeletingProduct] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [noStock, setNoStock] = useState(false)

  // Category management state
  const [categories, setCategories] = useState([])
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [parentCategoryId, setParentCategoryId] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      price: '',
      unit: 'UNIDAD',
      category: '',
      stock: '',
      noStock: false,
    },
  })

  // Cargar productos
  useEffect(() => {
    loadProducts()
  }, [user])

  const loadProducts = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [productsResult, categoriesResult] = await Promise.all([
        getProducts(user.uid),
        getProductCategories(user.uid)
      ])

      if (productsResult.success) {
        setProducts(productsResult.data || [])
      } else {
        console.error('Error al cargar productos:', productsResult.error)
      }

      if (categoriesResult.success) {
        const migratedCategories = migrateLegacyCategories(categoriesResult.data || [])
        setCategories(migratedCategories)
      } else {
        console.error('Error al cargar categorías:', categoriesResult.error)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingProduct(null)
    setNoStock(false)
    reset({
      code: '',
      name: '',
      description: '',
      price: '',
      unit: 'UNIDAD',
      category: '',
      stock: '',
      noStock: false,
    })
    setIsModalOpen(true)
  }

  const openEditModal = product => {
    setEditingProduct(product)
    const hasNoStock = product.stock === null || product.stock === undefined
    setNoStock(hasNoStock)
    reset({
      code: product.code,
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      unit: product.unit || 'UNIDAD',
      category: product.category || '',
      stock: hasNoStock ? '' : product.stock.toString(),
      noStock: hasNoStock,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingProduct(null)
    reset()
  }

  const onSubmit = async data => {
    if (!user?.uid) return

    setIsSaving(true)

    try {
      // Convertir precio y stock a números
      const productData = {
        code: data.code,
        name: data.name,
        description: data.description || '',
        price: parseFloat(data.price),
        unit: data.unit,
        category: data.category || '',
        stock: noStock || data.stock === '' ? null : parseInt(data.stock),
      }

      let result

      if (editingProduct) {
        // Actualizar
        result = await updateProduct(user.uid, editingProduct.id, productData)
      } else {
        // Crear
        result = await createProduct(user.uid, productData)
      }

      if (result.success) {
        toast.success(
          editingProduct
            ? 'Producto actualizado exitosamente'
            : 'Producto creado exitosamente'
        )
        closeModal()
        loadProducts()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al guardar producto:', error)
      toast.error('Error al guardar el producto. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingProduct || !user?.uid) return

    setIsSaving(true)
    try {
      const result = await deleteProduct(user.uid, deletingProduct.id)

      if (result.success) {
        toast.success('Producto eliminado exitosamente')
        setDeletingProduct(null)
        loadProducts()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar producto:', error)
      toast.error('Error al eliminar el producto. Inténtalo nuevamente.')
    } finally {
      setIsSaving(false)
    }
  }

  // Category management functions
  const openCategoryModal = () => {
    setNewCategoryName('')
    setParentCategoryId(null)
    setEditingCategory(null)
    setIsCategoryModalOpen(true)
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !user?.uid) return

    try {
      const newCategory = {
        id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: newCategoryName.trim(),
        parentId: parentCategoryId,
      }

      const updatedCategories = [...categories, newCategory]
      setCategories(updatedCategories)

      const result = await saveProductCategories(user.uid, updatedCategories)
      if (result.success) {
        toast.success(parentCategoryId ? 'Subcategoría creada exitosamente' : 'Categoría creada exitosamente')
        setNewCategoryName('')
        setParentCategoryId(null)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al crear categoría:', error)
      toast.error('Error al crear la categoría')
    }
  }

  const handleEditCategory = (category) => {
    setEditingCategory(category)
    setNewCategoryName(category.name)
    setParentCategoryId(category.parentId)
  }

  const handleUpdateCategory = async () => {
    if (!newCategoryName.trim() || !editingCategory || !user?.uid) return

    try {
      const updatedCategories = categories.map(cat =>
        cat.id === editingCategory.id
          ? { ...cat, name: newCategoryName.trim(), parentId: parentCategoryId }
          : cat
      )
      setCategories(updatedCategories)

      const result = await saveProductCategories(user.uid, updatedCategories)
      if (result.success) {
        toast.success('Categoría actualizada exitosamente')
        setEditingCategory(null)
        setNewCategoryName('')
        setParentCategoryId(null)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al actualizar categoría:', error)
      toast.error('Error al actualizar la categoría')
    }
  }

  const handleDeleteCategory = async (categoryId) => {
    if (!user?.uid) return

    const categoryToDelete = getCategoryById(categories, categoryId)
    if (!categoryToDelete) return

    // Verificar si tiene productos asignados (comparando por ID o nombre para compatibilidad)
    const hasProducts = products.some(p => p.category === categoryId || p.category === categoryToDelete.name)

    // Verificar si tiene subcategorías
    const hasSubcategories = getSubcategories(categories, categoryId).length > 0

    if (hasProducts) {
      toast.error('No puedes eliminar una categoría que tiene productos asignados', 5000)
      return
    }

    if (hasSubcategories) {
      toast.error('No puedes eliminar una categoría que tiene subcategorías', 5000)
      return
    }

    try {
      const updatedCategories = categories.filter(cat => cat.id !== categoryId)
      setCategories(updatedCategories)

      const result = await saveProductCategories(user.uid, updatedCategories)
      if (result.success) {
        toast.success('Categoría eliminada exitosamente')
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar categoría:', error)
      toast.error('Error al eliminar la categoría')
    }
  }

  // Filtrar productos por búsqueda y categoría
  const filteredProducts = products.filter(product => {
    const search = searchTerm.toLowerCase()

    // Get category name for search (backward compatible)
    const categoryName = product.category
      ? (getCategoryById(categories, product.category)?.name || product.category)
      : ''

    const matchesSearch =
      product.code?.toLowerCase().includes(search) ||
      product.name?.toLowerCase().includes(search) ||
      categoryName.toLowerCase().includes(search) ||
      product.description?.toLowerCase().includes(search)

    // Check category filter (backward compatible with old string-based categories)
    const matchesCategory =
      selectedCategoryFilter === 'all' ||
      (selectedCategoryFilter === 'sin-categoria' && !product.category) ||
      product.category === selectedCategoryFilter

    return matchesSearch && matchesCategory
  })

  // Calcular estadísticas
  const totalValue = products.reduce((sum, product) => {
    if (product.stock && product.price) {
      return sum + product.stock * product.price
    }
    return sum
  }, 0)

  const lowStockCount = products.filter(product => product.stock !== null && product.stock < 10).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando productos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Productos y Servicios</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tu catálogo de productos y servicios
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={openCategoryModal}
            className="flex-1 sm:flex-initial"
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            Categorías
          </Button>
          <Button onClick={openCreateModal} className="flex-1 sm:flex-initial">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Search and Category Filter */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por código, nombre, categoría..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Category Filter Chips */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Tag className="w-3 h-3 inline mr-1" />
                Todas
              </button>
              {/* Render root categories and their subcategories */}
              {getRootCategories(categories).map((category) => {
                const subcats = getSubcategories(categories, category.id)
                return (
                  <React.Fragment key={category.id}>
                    <button
                      onClick={() => setSelectedCategoryFilter(category.id)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        selectedCategoryFilter === category.id
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Folder className="w-3 h-3 inline mr-1" />
                      {category.name}
                    </button>
                    {/* Render subcategories with visual indicator */}
                    {subcats.map((subcat) => (
                      <button
                        key={subcat.id}
                        onClick={() => setSelectedCategoryFilter(subcat.id)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          selectedCategoryFilter === subcat.id
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <Folder className="w-3 h-3 inline mr-1" />
                        └─ {subcat.name}
                      </button>
                    ))}
                  </React.Fragment>
                )
              })}
              <button
                onClick={() => setSelectedCategoryFilter('sin-categoria')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedCategoryFilter === 'sin-categoria'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Sin categoría
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Productos</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{products.length}</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-lg">
                <Package className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Valor Inventario</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(totalValue)}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Stock Bajo</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{lowStockCount}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        {filteredProducts.length === 0 ? (
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron productos' : 'No hay productos registrados'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza agregando tu primer producto o servicio'}
            </p>
            {!searchTerm && (
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Primer Producto
              </Button>
            )}
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden lg:table-cell">Descripción</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead className="hidden md:table-cell">Categoría</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(product => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <span className="font-mono text-sm font-medium text-primary-600">
                        {product.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{product.name}</p>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-sm text-gray-600 max-w-xs truncate">
                        {product.description || '-'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{formatCurrency(product.price)}</span>
                      <p className="text-xs text-gray-500">{product.unit}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {product.category ? (
                        <Badge variant="default">
                          {getCategoryPath(categories, product.category) || product.category}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {product.stock !== null && product.stock !== undefined ? (
                        <span
                          className={`font-medium ${
                            product.stock > 10
                              ? 'text-green-600'
                              : product.stock > 0
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }`}
                        >
                          {product.stock}
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => openEditModal(product)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingProduct(product)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
          </div>
        )}
      </Card>

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Código"
              required
              placeholder="PROD001"
              error={errors.code?.message}
              {...register('code')}
            />

            <Select
              label="Unidad de Medida"
              required
              error={errors.unit?.message}
              {...register('unit')}
            >
              {UNITS.map(unit => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Nombre"
            required
            placeholder="Nombre del producto o servicio"
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Precio"
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              error={errors.price?.message}
              {...register('price')}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría (Opcional)
              </label>
              <select
                {...register('category')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Sin categoría</option>
                {/* Render root categories and their subcategories */}
                {getRootCategories(categories).map(cat => (
                  <React.Fragment key={cat.id}>
                    <option value={cat.id}>
                      {cat.name}
                    </option>
                    {getSubcategories(categories, cat.id).map(subcat => (
                      <option key={subcat.id} value={subcat.id}>
                        └─ {subcat.name}
                      </option>
                    ))}
                  </React.Fragment>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-sm text-red-600">{errors.category.message}</p>
              )}
              {categories.length === 0 && (
                <p className="mt-1 text-sm text-gray-500">
                  Crea categorías desde el botón "Categorías" para organizarlos mejor
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Control de Stock
            </label>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="noStock"
                  checked={noStock}
                  onChange={e => {
                    const checked = e.target.checked
                    setNoStock(checked)
                    if (checked) {
                      setValue('stock', '')
                    }
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="noStock" className="ml-2 text-sm text-gray-700">
                  No manejar stock (servicios o productos sin control)
                </label>
              </div>

              {!noStock && (
                <Input
                  label="Stock Inicial"
                  type="number"
                  placeholder="Ingresa la cantidad inicial"
                  error={errors.stock?.message}
                  {...register('stock')}
                  helperText="Ingresa la cantidad de unidades disponibles"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              {...register('description')}
              rows={3}
              placeholder="Descripción del producto o servicio"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>{editingProduct ? 'Actualizar' : 'Crear'} Producto</>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        title="Eliminar Producto"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar el producto{' '}
                <strong>{deletingProduct?.name}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción no se puede deshacer.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingProduct(null)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>Eliminar</>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Gestionar Categorías */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false)
          setEditingCategory(null)
          setNewCategoryName('')
          setParentCategoryId(null)
        }}
        title="Gestionar Categorías"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              Las categorías te permiten organizar tus productos de forma más eficiente.
              Por ejemplo: Hamburguesas, Bebidas, Postres, etc.
            </p>
          </div>

          {/* Add/Edit Category Form */}
          <div className="space-y-3">
            <Input
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="Nombre de la categoría"
              onKeyPress={e => {
                if (e.key === 'Enter') {
                  if (editingCategory) {
                    handleUpdateCategory()
                  } else {
                    handleAddCategory()
                  }
                }
              }}
            />

            {/* Parent Category Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría Padre (Opcional)
              </label>
              <select
                value={parentCategoryId || ''}
                onChange={e => setParentCategoryId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={editingCategory && getSubcategories(categories, editingCategory.id).length > 0}
              >
                <option value="">Sin categoría padre (Raíz)</option>
                {getRootCategories(categories)
                  .filter(cat => !editingCategory || cat.id !== editingCategory.id)
                  .map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
              {editingCategory && getSubcategories(categories, editingCategory.id).length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  No puedes cambiar a subcategoría si ya tiene subcategorías propias
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={editingCategory ? handleUpdateCategory : handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="flex-1"
              >
                {editingCategory ? (
                  <>
                    <Edit className="w-4 h-4 mr-2" />
                    Actualizar
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar
                  </>
                )}
              </Button>
              {editingCategory && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingCategory(null)
                    setNewCategoryName('')
                    setParentCategoryId(null)
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </div>

          {/* Categories List */}
          {categories.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {/* Render Root Categories */}
              {getRootCategories(categories).map((category) => {
                // Count products for this category (compare by ID or name for backward compatibility)
                const productCount = products.filter(p => p.category === category.id || p.category === category.name).length
                const subcategories = getSubcategories(categories, category.id)

                return (
                  <div key={category.id}>
                    {/* Root Category */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2">
                        <Folder className="w-5 h-5 text-primary-600" />
                        <div>
                          <p className="font-medium text-gray-900">{category.name}</p>
                          <p className="text-xs text-gray-500">
                            {productCount} {productCount === 1 ? 'producto' : 'productos'}
                            {subcategories.length > 0 && ` • ${subcategories.length} subcategoría${subcategories.length === 1 ? '' : 's'}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditCategory(category)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                          disabled={productCount > 0 || subcategories.length > 0}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Subcategories */}
                    {subcategories.length > 0 && (
                      <div className="ml-8 mt-2 space-y-2">
                        {subcategories.map((subcategory) => {
                          const subProductCount = products.filter(p => p.category === subcategory.id || p.category === subcategory.name).length
                          return (
                            <div
                              key={subcategory.id}
                              className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200"
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-5 flex items-center justify-center">
                                  <div className="w-3 h-3 border-l-2 border-b-2 border-gray-300"></div>
                                </div>
                                <Folder className="w-4 h-4 text-gray-500" />
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{subcategory.name}</p>
                                  <p className="text-xs text-gray-500">
                                    {subProductCount} {subProductCount === 1 ? 'producto' : 'productos'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditCategory(subcategory)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Editar"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(subcategory.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Eliminar"
                                  disabled={subProductCount > 0}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderPlus className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No hay categorías creadas</p>
              <p className="text-sm text-gray-500 mt-1">
                Crea tu primera categoría para organizar tus productos
              </p>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsCategoryModalOpen(false)
                setEditingCategory(null)
                setNewCategoryName('')
                setParentCategoryId(null)
              }}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
