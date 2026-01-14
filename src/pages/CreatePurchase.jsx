import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Save, ArrowLeft, Loader2, Search, X, PackagePlus, Package, Beaker, Store } from 'lucide-react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import { formatCurrency } from '@/lib/utils'
import ProductFormModal, { getRootCategories, getSubcategories } from '@/components/product/ProductFormModal'
import {
  getSuppliers,
  getProducts,
  createPurchase,
  updatePurchase,
  getPurchase,
  updateProduct,
  createProduct,
  getProductCategories,
} from '@/services/firestoreService'
import { getWarehouses, updateWarehouseStock, createStockMovement } from '@/services/warehouseService'
import { getActiveBranches } from '@/services/branchService'
import { getIngredients, registerPurchase as registerIngredientPurchase } from '@/services/ingredientService'

// Helper function for legacy categories (used in ingredient logic)
const migrateLegacyCategories = (cats) => {
  if (!cats || cats.length === 0) return []
  if (typeof cats[0] === 'object' && cats[0].id) return cats
  return cats.map((cat, index) => ({
    id: `cat-${index}`,
    name: cat,
    parentId: null
  }))
}

const getSubcategoriesLocal = (cats, parentId) => {
  const migratedCats = migrateLegacyCategories(cats)
  return migratedCats.filter(cat => cat.parentId === parentId)
}

export default function CreatePurchase() {
  const { user } = useAuth()
  const { getBusinessId, businessMode } = useAppContext()
  const navigate = useNavigate()
  const location = useLocation()
  const { purchaseId } = useParams() // Para modo edición
  const toast = useToast()

  // Datos de orden de compra (si viene desde PurchaseOrders)
  const fromPurchaseOrder = location.state?.fromPurchaseOrder || null

  // Modo edición
  const isEditMode = !!purchaseId
  const [originalPurchase, setOriginalPurchase] = useState(null) // Datos originales para revertir stock

  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [categories, setCategories] = useState([])
  // Modo de items: 'products', 'ingredients', o 'all'
  const [itemMode, setItemMode] = useState('products')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  // Obtener fecha local en formato YYYY-MM-DD (sin usar toISOString que convierte a UTC)
  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Parsear fecha YYYY-MM-DD a Date en hora LOCAL (evita problema de timezone)
  // "2024-01-12" con new Date() se interpreta como UTC, causando día incorrecto en Perú
  const parseLocalDate = (dateValue) => {
    if (dateValue instanceof Date) return dateValue
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      const [year, month, day] = dateValue.split('-').map(Number)
      return new Date(year, month - 1, day, 12, 0, 0) // Mediodía para evitar problemas
    }
    return new Date(dateValue)
  }

  const [invoiceDate, setInvoiceDate] = useState(getLocalDateString())
  const [notes, setNotes] = useState('')

  // Tipo de pago
  const [paymentType, setPaymentType] = useState('contado') // 'contado' o 'credito'
  const [creditType, setCreditType] = useState('unico') // 'unico' o 'cuotas'
  const [dueDate, setDueDate] = useState('') // Fecha de vencimiento para pago único
  const [numInstallments, setNumInstallments] = useState(2) // Número de cuotas
  const [installments, setInstallments] = useState([]) // Array de cuotas generadas
  const [firstDueDate, setFirstDueDate] = useState('') // Fecha de primera cuota
  const [installmentFrequency, setInstallmentFrequency] = useState(30) // Días entre cuotas
  const [purchaseItems, setPurchaseItems] = useState([
    { productId: '', productName: '', quantity: 1, unitPrice: 0, cost: 0, costWithoutIGV: 0, batchNumber: '', expirationDate: '', itemType: 'product', unit: 'NIU' },
  ])

  // Warehouses y Branches
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouse, setSelectedWarehouse] = useState(null)
  const [branches, setBranches] = useState([])

  // Estados para el autocompletado de proveedor
  const [supplierSearch, setSupplierSearch] = useState('')
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const supplierInputRef = useRef(null)

  // Estados para el autocompletado de productos
  const [productSearches, setProductSearches] = useState({})
  const [showProductDropdowns, setShowProductDropdowns] = useState({})
  const productInputRefs = useRef({})

  // Estados para el modal de crear producto
  const [showCreateProductModal, setShowCreateProductModal] = useState(false)
  const [currentItemIndex, setCurrentItemIndex] = useState(null)
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)
  const [newProductName, setNewProductName] = useState('')

  useEffect(() => {
    loadData()
  }, [user, purchaseId])

  // Pre-llenar datos si viene de una orden de compra
  useEffect(() => {
    if (fromPurchaseOrder && suppliers.length > 0 && !isEditMode) {
      // Buscar el proveedor en la lista o usar los datos de la orden
      const orderSupplier = fromPurchaseOrder.supplier
      if (orderSupplier) {
        // Buscar por ID o por RUC
        const existingSupplier = suppliers.find(s =>
          s.id === orderSupplier.id || s.ruc === orderSupplier.ruc
        )

        if (existingSupplier) {
          setSelectedSupplier(existingSupplier)
          setSupplierSearch(existingSupplier.businessName || '')
        } else {
          // Usar los datos de la orden directamente
          setSelectedSupplier({
            ruc: orderSupplier.ruc,
            businessName: orderSupplier.businessName,
            address: orderSupplier.address || '',
            phone: orderSupplier.phone || '',
            email: orderSupplier.email || '',
          })
          setSupplierSearch(orderSupplier.businessName || '')
        }
      }

      // Pre-llenar items
      if (fromPurchaseOrder.items && fromPurchaseOrder.items.length > 0) {
        const newItems = fromPurchaseOrder.items.map(item => {
          // Buscar producto por ID o por nombre
          const existingProduct = products.find(p =>
            p.id === item.productId || p.name === item.name
          )

          return {
            productId: existingProduct?.id || item.productId || '',
            productName: item.name || '',
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            cost: item.unitPrice || 0,
            costWithoutIGV: (item.unitPrice || 0) / 1.18,
            batchNumber: '',
            expirationDate: '',
            itemType: 'product',
            unit: item.unit || 'NIU',
          }
        })
        setPurchaseItems(newItems)

        // Pre-llenar búsquedas de productos
        const searches = {}
        newItems.forEach((item, index) => {
          searches[index] = item.productName
        })
        setProductSearches(searches)
      }

      // Notas de la orden
      if (fromPurchaseOrder.notes) {
        setNotes(`Desde OC ${fromPurchaseOrder.number}: ${fromPurchaseOrder.notes}`)
      } else if (fromPurchaseOrder.number) {
        setNotes(`Desde Orden de Compra: ${fromPurchaseOrder.number}`)
      }

      toast.info(`Datos pre-llenados desde OC ${fromPurchaseOrder.number}`)
    }
  }, [fromPurchaseOrder, suppliers, products, isEditMode])

  const loadData = async () => {
    const businessId = getBusinessId()
    if (!businessId) return

    setIsLoading(true)
    try {
      const [suppliersResult, productsResult, categoriesResult, warehousesResult, ingredientsResult, branchesResult] = await Promise.all([
        getSuppliers(businessId),
        getProducts(businessId),
        getProductCategories(businessId),
        getWarehouses(businessId),
        getIngredients(businessId),
        getActiveBranches(businessId),
      ])

      if (suppliersResult.success) {
        setSuppliers(suppliersResult.data || [])
      }

      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }

      if (categoriesResult.success) {
        setCategories(categoriesResult.data || [])
      }

      let activeWarehouses = []
      if (warehousesResult.success) {
        // Solo almacenes activos
        activeWarehouses = (warehousesResult.data || []).filter(w => w.isActive !== false)
        setWarehouses(activeWarehouses)

        // Solo seleccionar almacén por defecto si NO estamos en modo edición
        if (!isEditMode) {
          const mainBranchWarehouses = activeWarehouses.filter(w => !w.branchId)
          const defaultWarehouse = mainBranchWarehouses.find(w => w.isDefault) || mainBranchWarehouses[0] || activeWarehouses[0] || null
          setSelectedWarehouse(defaultWarehouse)
        }
      }

      if (ingredientsResult.success) {
        setIngredients(ingredientsResult.data || [])
      }

      if (branchesResult.success) {
        setBranches(branchesResult.data || [])
      }

      // Si estamos en modo edición, cargar los datos de la compra
      if (isEditMode && purchaseId) {
        const purchaseResult = await getPurchase(businessId, purchaseId)
        if (purchaseResult.success && purchaseResult.data) {
          const purchase = purchaseResult.data
          setOriginalPurchase(purchase) // Guardar para revertir stock

          // Cargar datos del proveedor
          if (purchase.supplier) {
            setSelectedSupplier(purchase.supplier)
            setSupplierSearch(purchase.supplier.businessName || '')
          }

          // Cargar datos básicos
          setInvoiceNumber(purchase.invoiceNumber || '')
          if (purchase.invoiceDate) {
            const invoiceDateObj = purchase.invoiceDate.toDate ? purchase.invoiceDate.toDate() : new Date(purchase.invoiceDate)
            setInvoiceDate(getLocalDateString(invoiceDateObj))
          }
          setNotes(purchase.notes || '')

          // Cargar tipo de pago
          setPaymentType(purchase.paymentType || 'contado')
          if (purchase.paymentType === 'credito') {
            setCreditType(purchase.creditType || 'unico')
            if (purchase.dueDate) {
              const dueDateObj = purchase.dueDate.toDate ? purchase.dueDate.toDate() : new Date(purchase.dueDate)
              setDueDate(getLocalDateString(dueDateObj))
            }
            if (purchase.installments) {
              setInstallments(purchase.installments.map(inst => ({
                ...inst,
                dueDate: inst.dueDate?.toDate ? getLocalDateString(inst.dueDate.toDate()) : inst.dueDate
              })))
              setNumInstallments(purchase.installments.length)
              if (purchase.installments[0]?.dueDate) {
                const firstDate = purchase.installments[0].dueDate.toDate
                  ? purchase.installments[0].dueDate.toDate()
                  : new Date(purchase.installments[0].dueDate)
                setFirstDueDate(getLocalDateString(firstDate))
              }
            }
          }

          // Cargar almacén
          if (purchase.warehouseId && activeWarehouses.length > 0) {
            const warehouse = activeWarehouses.find(w => w.id === purchase.warehouseId)
            if (warehouse) {
              setSelectedWarehouse(warehouse)
            }
          }

          // Cargar items
          if (purchase.items && purchase.items.length > 0) {
            const loadedItems = purchase.items.map(item => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              cost: item.unitPrice, // El costo es el precio unitario de compra
              costWithoutIGV: item.unitPrice > 0 ? Math.round((item.unitPrice / 1.18) * 100) / 100 : 0,
              batchNumber: item.batchNumber || '',
              expirationDate: item.expirationDate
                ? (item.expirationDate.toDate ? getLocalDateString(item.expirationDate.toDate()) : getLocalDateString(new Date(item.expirationDate)))
                : '',
              itemType: item.itemType || 'product',
              unit: item.unit || 'NIU'
            }))
            setPurchaseItems(loadedItems)

            // También cargar las búsquedas de productos
            const searches = {}
            loadedItems.forEach((item, idx) => {
              searches[idx] = item.productName
            })
            setProductSearches(searches)
          }
        } else {
          toast.error('No se pudo cargar la compra')
          navigate('/app/compras')
        }
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      setMessage({
        type: 'error',
        text: 'Error al cargar los datos. Por favor, recarga la página.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const addItem = () => {
    setPurchaseItems([
      ...purchaseItems,
      { productId: '', productName: '', quantity: 1, unitPrice: 0, cost: 0, costWithoutIGV: 0, batchNumber: '', expirationDate: '', itemType: 'product', unit: 'NIU' },
    ])
  }

  const removeItem = index => {
    if (purchaseItems.length > 1) {
      setPurchaseItems(purchaseItems.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index, field, value) => {
    const newItems = [...purchaseItems]
    newItems[index][field] = value
    setPurchaseItems(newItems)
  }

  // Actualizar costo con IGV y calcular sin IGV
  const updateCostWithIGV = (index, value) => {
    const newItems = [...purchaseItems]
    const costWithIGV = parseFloat(value) || 0
    newItems[index].cost = costWithIGV
    // Calcular costo sin IGV: costo con IGV / 1.18 (redondeado a 2 decimales)
    newItems[index].costWithoutIGV = costWithIGV > 0 ? Math.round((costWithIGV / 1.18) * 100) / 100 : 0
    setPurchaseItems(newItems)
  }

  // Actualizar costo sin IGV y calcular con IGV
  const updateCostWithoutIGV = (index, value) => {
    const newItems = [...purchaseItems]
    const costWithoutIGV = parseFloat(value) || 0
    newItems[index].costWithoutIGV = costWithoutIGV
    // Calcular costo con IGV: costo sin IGV * 1.18 (redondeado a 2 decimales)
    newItems[index].cost = costWithoutIGV > 0 ? Math.round((costWithoutIGV * 1.18) * 100) / 100 : 0
    setPurchaseItems(newItems)
  }

  // Filtrar proveedores según búsqueda
  const filteredSuppliers = suppliers.filter(supplier => {
    const search = supplierSearch.toLowerCase()
    return (
      supplier.businessName?.toLowerCase().includes(search) ||
      supplier.documentNumber?.includes(search) ||
      supplier.contactName?.toLowerCase().includes(search)
    )
  })

  // Seleccionar proveedor
  const selectSupplier = supplier => {
    setSelectedSupplier(supplier)
    setSupplierSearch(supplier.businessName)
    setShowSupplierDropdown(false)
  }

  // Limpiar selección de proveedor
  const clearSupplier = () => {
    setSelectedSupplier(null)
    setSupplierSearch('')
    setShowSupplierDropdown(false)
  }

  // Filtrar productos e ingredientes según búsqueda y modo
  const getFilteredItems = (index) => {
    const search = (productSearches[index] || '').toLowerCase()

    let items = []

    // Agregar productos si el modo lo permite
    if (itemMode === 'products' || itemMode === 'all') {
      const filteredProducts = products.filter(product => {
        return (
          product.name?.toLowerCase().includes(search) ||
          product.code?.toLowerCase().includes(search) ||
          product.category?.toLowerCase().includes(search)
        )
      }).map(p => ({ ...p, itemType: 'product' }))
      items = [...items, ...filteredProducts]
    }

    // Agregar ingredientes si el modo lo permite
    if (itemMode === 'ingredients' || itemMode === 'all') {
      const filteredIngredients = ingredients.filter(ing => {
        return ing.name?.toLowerCase().includes(search)
      }).map(i => ({ ...i, itemType: 'ingredient' }))
      items = [...items, ...filteredIngredients]
    }

    return items
  }

  // Mantener compatibilidad con nombre anterior
  const getFilteredProducts = getFilteredItems

  // Seleccionar producto o ingrediente
  const selectProduct = (index, item) => {
    const newItems = [...purchaseItems]
    newItems[index].productId = item.id
    newItems[index].productName = item.name
    newItems[index].itemType = item.itemType || 'product'

    if (item.itemType === 'ingredient') {
      // Para ingredientes
      newItems[index].unit = item.purchaseUnit || 'NIU'
      // Usar último precio de compra o costo promedio
      const costValue = item.lastPurchasePrice || item.averageCost || 0
      if (costValue > 0) {
        newItems[index].cost = costValue
        newItems[index].costWithoutIGV = Math.round((costValue / 1.18) * 100) / 100
      }
    } else {
      // Para productos
      newItems[index].unit = item.unit || 'NIU'
      // Hidratar el costo con el costo actual del producto (si existe)
      if (item.cost && item.cost > 0) {
        const costValue = item.cost
        newItems[index].cost = costValue
        // Calcular costo sin IGV automáticamente
        newItems[index].costWithoutIGV = Math.round((costValue / 1.18) * 100) / 100
      }
    }

    setPurchaseItems(newItems)

    const newSearches = { ...productSearches }
    newSearches[index] = item.name
    setProductSearches(newSearches)

    const newDropdowns = { ...showProductDropdowns }
    newDropdowns[index] = false
    setShowProductDropdowns(newDropdowns)
  }

  // Actualizar búsqueda de producto
  const updateProductSearch = (index, value) => {
    const newSearches = { ...productSearches }
    newSearches[index] = value
    setProductSearches(newSearches)

    const newDropdowns = { ...showProductDropdowns }
    newDropdowns[index] = true
    setShowProductDropdowns(newDropdowns)

    // Si borra la búsqueda, limpiar el producto seleccionado
    if (!value) {
      const newItems = [...purchaseItems]
      newItems[index].productId = ''
      newItems[index].productName = ''
      setPurchaseItems(newItems)
    }
  }

  // Click fuera para cerrar dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      // No cerrar si el evento viene del teclado virtual o de un input activo
      const activeElement = document.activeElement
      if (event.target.tagName === 'INPUT' || activeElement?.tagName === 'INPUT') {
        // Verificar si el input activo está dentro de algún contenedor de producto
        const isActiveInProductContainer = Object.keys(productInputRefs.current).some(key => {
          const ref = productInputRefs.current[key]
          return ref && ref.contains(activeElement)
        })
        if (isActiveInProductContainer) return
      }

      if (supplierInputRef.current && !supplierInputRef.current.contains(event.target)) {
        setShowSupplierDropdown(false)
      }

      // Verificar si el click fue dentro de algún dropdown de productos
      const clickedInsideAnyProductDropdown = Object.keys(productInputRefs.current).some(key => {
        const ref = productInputRefs.current[key]
        return ref && ref.contains(event.target)
      })

      // Si el click fue fuera de todos los dropdowns, cerrar todos
      if (!clickedInsideAnyProductDropdown) {
        setShowProductDropdowns({})
      }
    }

    // Agregar ambos eventos para desktop y móvil
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  const calculateAmounts = () => {
    const total = purchaseItems.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.cost) || 0)
    }, 0)

    // Los costos ya incluyen IGV, calculamos el IGV del total
    // Total = Subtotal + IGV
    // Total = Subtotal + (Subtotal * 0.18)
    // Total = Subtotal * 1.18
    // Subtotal = Total / 1.18
    const subtotal = total / 1.18
    const igv = total - subtotal

    return {
      subtotal,
      igv,
      total
    }
  }

  // Generar cuotas automáticamente cuando cambian los parámetros
  useEffect(() => {
    if (paymentType !== 'credito' || creditType !== 'cuotas') {
      return
    }

    const amounts = calculateAmounts()
    if (amounts.total <= 0 || !firstDueDate || numInstallments < 2) {
      setInstallments([])
      return
    }

    const installmentAmount = Math.floor((amounts.total / numInstallments) * 100) / 100
    const lastInstallmentAmount = Math.round((amounts.total - (installmentAmount * (numInstallments - 1))) * 100) / 100

    const newInstallments = []
    let currentDate = new Date(firstDueDate)

    for (let i = 0; i < numInstallments; i++) {
      newInstallments.push({
        number: i + 1,
        amount: i === numInstallments - 1 ? lastInstallmentAmount : installmentAmount,
        dueDate: getLocalDateString(currentDate),
        status: 'pending',
        paidAt: null,
        paidAmount: 0
      })
      currentDate = new Date(currentDate)
      currentDate.setDate(currentDate.getDate() + installmentFrequency)
    }

    setInstallments(newInstallments)
  }, [paymentType, creditType, numInstallments, firstDueDate, installmentFrequency, purchaseItems])

  // Actualizar monto de una cuota manualmente
  const updateInstallmentAmount = (index, newAmount) => {
    const newInstallments = [...installments]
    newInstallments[index].amount = parseFloat(newAmount) || 0
    setInstallments(newInstallments)
  }

  const openCreateProductModal = (itemIndex) => {
    setCurrentItemIndex(itemIndex)
    // Pre-llenar el nombre del producto con lo que el usuario estaba buscando
    const searchTerm = productSearches[itemIndex] || ''
    setNewProductName(searchTerm)
    setShowCreateProductModal(true)
  }

  const handleCreateProduct = async (data) => {
    // Prevenir múltiples clicks
    if (isCreatingProduct) return
    setIsCreatingProduct(true)

    const businessId = getBusinessId()
    if (!businessId) {
      toast.error('Error: No se pudo identificar el negocio')
      setIsCreatingProduct(false)
      return
    }

    try {
      const productData = {
        code: data.code || '',
        sku: data.sku || '',
        name: data.name,
        price: parseFloat(data.price) || 0,
        price2: data.price2 ? parseFloat(data.price2) : null,
        price3: data.price3 ? parseFloat(data.price3) : null,
        price4: data.price4 ? parseFloat(data.price4) : null,
        cost: data.cost ? parseFloat(data.cost) : 0,
        unit: data.unit || 'NIU',
        category: data.category || '',
        description: data.description || '',
        stock: data.noStock ? null : 0, // Stock actual en 0, se actualizará al guardar la compra
        initialStock: data.noStock ? null : 0, // Productos creados desde compras inician con stock inicial 0
        noStock: data.noStock || false,
        taxAffectation: data.taxAffectation || '10',
        allowDecimalQuantity: data.allowDecimalQuantity || false,
        trackExpiration: data.trackExpiration || false,
        catalogVisible: data.catalogVisible || false,
        presentations: data.presentations || [],
        imageUrl: data.imageUrl || null,
      }

      const result = await createProduct(businessId, productData)
      if (result.success) {
        toast.success('Producto creado exitosamente')

        // Recargar la lista de productos
        const productsResult = await getProducts(businessId)
        if (productsResult.success) {
          setProducts(productsResult.data || [])
        }

        // Seleccionar automáticamente el producto recién creado en el item actual
        if (currentItemIndex !== null) {
          const createdProduct = { id: result.id, ...productData }
          selectProduct(currentItemIndex, createdProduct)

          // Auto-llenar cantidad, costo y precio de venta en el formulario de compra
          const newItems = [...purchaseItems]
          const costValue = productData.cost || 0

          newItems[currentItemIndex].quantity = data.stock ? parseFloat(data.stock) : 1
          newItems[currentItemIndex].cost = costValue
          newItems[currentItemIndex].unitPrice = productData.price || 0
          // Calcular costo sin IGV automáticamente
          newItems[currentItemIndex].costWithoutIGV = costValue > 0 ? Math.round((costValue / 1.18) * 100) / 100 : 0

          setPurchaseItems(newItems)
        }

        // Cerrar modal y resetear
        closeCreateProductModal()
      } else {
        toast.error(result.error || 'Error al crear el producto')
        setIsCreatingProduct(false)
      }
    } catch (error) {
      console.error('Error al crear producto:', error)
      toast.error('Error al crear el producto')
      setIsCreatingProduct(false)
    }
  }

  const closeCreateProductModal = () => {
    setShowCreateProductModal(false)
    setNewProductName('')
    setCurrentItemIndex(null)
    setIsCreatingProduct(false)
  }

  const validateForm = () => {
    // Validar crédito con pago único
    if (paymentType === 'credito' && creditType === 'unico' && !dueDate) {
      setMessage({
        type: 'error',
        text: 'Debe seleccionar una fecha de vencimiento para compras al crédito',
      })
      return false
    }

    // Validar crédito con cuotas
    if (paymentType === 'credito' && creditType === 'cuotas') {
      if (installments.length === 0) {
        setMessage({
          type: 'error',
          text: 'Debe generar las cuotas antes de guardar',
        })
        return false
      }

      const totalCuotas = installments.reduce((sum, c) => sum + c.amount, 0)
      const totalCompra = calculateAmounts().total
      if (Math.abs(totalCuotas - totalCompra) > 0.01) {
        setMessage({
          type: 'error',
          text: `La suma de las cuotas (${formatCurrency(totalCuotas)}) no coincide con el total (${formatCurrency(totalCompra)})`,
        })
        return false
      }
    }

    if (purchaseItems.length === 0) {
      setMessage({
        type: 'error',
        text: 'Debe agregar al menos un producto',
      })
      return false
    }

    for (let i = 0; i < purchaseItems.length; i++) {
      const item = purchaseItems[i]
      if (!item.productId || !item.productName || !item.quantity || !item.cost) {
        setMessage({
          type: 'error',
          text: `Complete todos los campos del producto ${i + 1}`,
        })
        return false
      }

      if (parseFloat(item.quantity) <= 0) {
        setMessage({
          type: 'error',
          text: `La cantidad del producto ${i + 1} debe ser mayor a 0`,
        })
        return false
      }

      if (parseFloat(item.cost) <= 0) {
        setMessage({
          type: 'error',
          text: `El costo unitario del producto ${i + 1} debe ser mayor a 0`,
        })
        return false
      }
    }

    return true
  }

  const handleSave = async () => {
    const businessId = getBusinessId()
    if (!businessId) {
      setMessage({
        type: 'error',
        text: 'Error: No se pudo identificar el negocio',
      })
      return
    }

    // Asegurar que todos los items tengan costWithoutIGV calculado
    const itemsWithCostWithoutIGV = purchaseItems.map(item => ({
      ...item,
      costWithoutIGV: item.costWithoutIGV || (item.cost > 0 ? Math.round((item.cost / 1.18) * 100) / 100 : 0)
    }))
    setPurchaseItems(itemsWithCostWithoutIGV)

    if (!validateForm()) return

    setIsSaving(true)
    setMessage(null)

    try {
      const amounts = calculateAmounts()

      // 1. Crear datos de la compra
      const purchaseData = {
        supplier: selectedSupplier ? {
          id: selectedSupplier.id,
          documentType: selectedSupplier.documentType,
          documentNumber: selectedSupplier.documentNumber,
          businessName: selectedSupplier.businessName,
          contactName: selectedSupplier.contactName || '',
          email: selectedSupplier.email || '',
          phone: selectedSupplier.phone || '',
        } : null,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: parseLocalDate(invoiceDate), // Usar parseLocalDate para evitar problema de timezone
        // Almacén donde ingresa la mercadería
        warehouseId: selectedWarehouse?.id || null,
        warehouseName: selectedWarehouse?.name || null,
        items: purchaseItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          itemType: item.itemType || 'product', // 'product' o 'ingredient'
          unit: item.unit || 'NIU',
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.cost), // Precio unitario de compra (costo)
          // Campos de farmacia (lote y vencimiento)
          ...(item.batchNumber && { batchNumber: item.batchNumber }),
          ...(item.expirationDate && { expirationDate: parseLocalDate(item.expirationDate) }),
        })),
        subtotal: amounts.subtotal,
        igv: amounts.igv,
        total: amounts.total,
        notes: notes.trim(),
        // Tipo de pago y estado
        paymentType: paymentType, // 'contado' o 'credito'
        paymentStatus: paymentType === 'contado' ? 'paid' : 'pending', // 'paid' o 'pending'
        paidAmount: paymentType === 'contado' ? amounts.total : 0, // Monto pagado
        // Campos para crédito
        ...(paymentType === 'credito' && {
          creditType: creditType, // 'unico' o 'cuotas'
          ...(creditType === 'unico' && dueDate && { dueDate: parseLocalDate(dueDate) }),
          ...(creditType === 'cuotas' && {
            installments: installments.map(inst => ({
              ...inst,
              dueDate: parseLocalDate(inst.dueDate)
            })),
            totalInstallments: installments.length,
            paidInstallments: 0,
          }),
        }),
      }

      // Separar items por tipo
      const productItems = purchaseItems.filter(item => item.itemType !== 'ingredient')
      const ingredientItems = purchaseItems.filter(item => item.itemType === 'ingredient')

      let resultId = purchaseId // Para modo edición

      // En modo edición, primero revertir el stock de los items originales
      if (isEditMode && originalPurchase && originalPurchase.items) {
        const originalProductItems = originalPurchase.items.filter(item => item.itemType !== 'ingredient')
        const originalWarehouseId = originalPurchase.warehouseId || ''

        // Revertir stock de productos originales (restar lo que se había sumado)
        for (const origItem of originalProductItems) {
          const product = products.find(p => p.id === origItem.productId)
          if (product && product.trackStock !== false) {
            const quantityToRevert = parseFloat(origItem.quantity)

            // Restar stock usando el helper de almacén (cantidad negativa)
            const updatedProduct = updateWarehouseStock(
              product,
              originalWarehouseId,
              -quantityToRevert // Negativo porque estamos revirtiendo
            )

            await updateProduct(businessId, origItem.productId, {
              stock: updatedProduct.stock,
              warehouseStocks: updatedProduct.warehouseStocks
            })

            // Actualizar el producto en memoria para cálculos posteriores
            const idx = products.findIndex(p => p.id === origItem.productId)
            if (idx >= 0) {
              products[idx] = { ...products[idx], ...updatedProduct }
            }
          }
        }

        // Registrar movimientos de reversión
        for (const origItem of originalProductItems) {
          const product = products.find(p => p.id === origItem.productId)
          if (product && product.trackStock !== false) {
            await createStockMovement(businessId, {
              productId: origItem.productId,
              warehouseId: originalWarehouseId,
              type: 'exit',
              quantity: parseFloat(origItem.quantity),
              reason: 'Edición de compra (reversión)',
              referenceType: 'purchase_edit',
              referenceId: purchaseId,
              userId: user?.uid,
              notes: `Reversión por edición de compra`
            }).catch(err => console.error('Error movimiento reversión:', err))
          }
        }
      }

      // 2. Guardar o actualizar la compra
      let result
      if (isEditMode) {
        // En modo edición, mantener los campos de pago si ya fueron pagados
        if (originalPurchase?.paymentStatus === 'paid') {
          purchaseData.paymentStatus = 'paid'
          purchaseData.paidAmount = originalPurchase.paidAmount
        }
        result = await updatePurchase(businessId, purchaseId, purchaseData)
        if (!result.success) {
          throw new Error(result.error || 'Error al actualizar la compra')
        }
        resultId = purchaseId
      } else {
        result = await createPurchase(businessId, purchaseData)
        if (!result.success) {
          throw new Error(result.error || 'Error al crear la compra')
        }
        resultId = result.id
      }

      // 3. Actualizar stock y costo promedio de PRODUCTOS
      const productUpdates = productItems.map(async item => {
        const product = products.find(p => p.id === item.productId)
        if (product) {
          // Solo actualizar si el producto maneja stock (trackStock !== false)
          if (product.trackStock === false) return

          const newQuantity = parseFloat(item.quantity)
          const newCost = parseFloat(item.cost)

          // Actualizar stock usando el helper de almacén
          const updatedProduct = updateWarehouseStock(
            product,
            selectedWarehouse?.id || '',
            newQuantity // Positivo porque es una entrada
          )

          // Calcular costo promedio ponderado
          const currentStock = product.stock || 0
          const currentCost = product.cost || 0
          const totalStock = currentStock + newQuantity

          let averageCost = newCost
          if (currentStock > 0 && currentCost > 0) {
            averageCost = ((currentStock * currentCost) + (newQuantity * newCost)) / totalStock
          }

          const updates = {
            stock: updatedProduct.stock,
            warehouseStocks: updatedProduct.warehouseStocks,
            cost: averageCost,
            ...(selectedSupplier && {
              lastSupplier: {
                id: selectedSupplier.id,
                documentNumber: selectedSupplier.documentNumber,
                businessName: selectedSupplier.businessName
              }
            })
          }

          // Sistema de múltiples lotes para farmacia
          if (item.batchNumber || item.expirationDate) {
            const currentBatches = product.batches || []

            const newBatch = {
              id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              batchNumber: item.batchNumber || '',
              quantity: newQuantity,
              expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
              purchaseId: resultId || null,
              purchaseDate: new Date(invoiceDate),
              costPrice: newCost,
              createdAt: new Date()
            }

            const updatedBatches = [...currentBatches, newBatch]
            updates.batches = updatedBatches
            updates.trackExpiration = true

            const activeBatches = updatedBatches.filter(b => b.quantity > 0 && b.expirationDate)
            if (activeBatches.length > 0) {
              activeBatches.sort((a, b) => {
                const dateA = a.expirationDate.toDate ? a.expirationDate.toDate() : new Date(a.expirationDate)
                const dateB = b.expirationDate.toDate ? b.expirationDate.toDate() : new Date(b.expirationDate)
                return dateA - dateB
              })
              const nearestBatch = activeBatches[0]
              updates.expirationDate = nearestBatch.expirationDate
              updates.batchNumber = nearestBatch.batchNumber
            }
          }

          return updateProduct(businessId, item.productId, updates)
        }
      })

      await Promise.all(productUpdates)

      // 3.5. Registrar movimientos de stock para historial de PRODUCTOS
      const stockMovementPromises = productItems.map(async item => {
        const product = products.find(p => p.id === item.productId)
        if (!product) return
        if (product.trackStock === false) return

        return createStockMovement(businessId, {
          productId: item.productId,
          warehouseId: selectedWarehouse?.id || '',
          type: 'entry',
          quantity: parseFloat(item.quantity),
          reason: isEditMode ? 'Compra (editada)' : 'Compra',
          referenceType: 'purchase',
          referenceId: resultId || '',
          userId: user?.uid,
          notes: `${isEditMode ? 'Compra editada' : 'Compra'} - ${selectedSupplier?.businessName || 'Proveedor'} - ${invoiceNumber || 'S/N'}`
        })
      })

      Promise.all(stockMovementPromises).catch(err => {
        console.error('Error al registrar movimientos de stock:', err)
      })

      // 4. Actualizar stock de INGREDIENTES (solo en creación, no en edición por complejidad)
      if (!isEditMode) {
        const ingredientUpdates = ingredientItems.map(async item => {
          return registerIngredientPurchase(businessId, {
            ingredientId: item.productId,
            ingredientName: item.productName,
            quantity: parseFloat(item.quantity),
            unit: item.unit || 'NIU',
            unitPrice: parseFloat(item.cost),
            totalCost: parseFloat(item.quantity) * parseFloat(item.cost),
            supplier: selectedSupplier?.businessName || '',
            invoiceNumber: invoiceNumber.trim() || ''
          })
        })

        await Promise.all(ingredientUpdates)
      }

      // 5. Mostrar éxito y redirigir
      toast.success(isEditMode ? 'Compra actualizada exitosamente' : 'Compra registrada exitosamente. Stock y costos actualizados')
      setTimeout(() => {
        navigate('/app/compras')
      }, 1500)
    } catch (error) {
      console.error('Error al guardar compra:', error)
      setMessage({
        type: 'error',
        text: error.message || (isEditMode ? 'Error al actualizar la compra.' : 'Error al crear la compra. Inténtalo nuevamente.'),
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="outline"
            onClick={() => navigate('/app/compras')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {isEditMode ? 'Editar Compra' : 'Nueva Compra'}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {isEditMode
              ? 'Modifica los datos de la compra y el stock se actualizará automáticamente'
              : 'Registra la factura del proveedor y actualiza el inventario'}
          </p>
        </div>
      </div>

      {message && (
        <Alert type={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Información del Proveedor */}
      <Card>
        <CardHeader>
          <CardTitle>Información del Proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Buscador de Proveedor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Proveedor
              </label>
              <div className="relative" ref={supplierInputRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar proveedor por nombre o RUC..."
                    value={supplierSearch}
                    onChange={e => {
                      setSupplierSearch(e.target.value)
                      setShowSupplierDropdown(true)
                      if (!e.target.value) setSelectedSupplier(null)
                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    className={`w-full pl-10 ${selectedSupplier ? 'pr-10' : 'pr-4'} py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      selectedSupplier ? 'border-green-500 bg-green-50' : 'border-gray-300'
                    }`}
                  />
                  {selectedSupplier && (
                    <button
                      onClick={clearSupplier}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown de proveedores */}
                {showSupplierDropdown && supplierSearch && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredSuppliers.length > 0 ? (
                      filteredSuppliers.map(supplier => (
                        <button
                          key={supplier.id}
                          onClick={() => selectSupplier(supplier)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                        >
                          <div className="font-medium text-gray-900">{supplier.businessName}</div>
                          <div className="text-sm text-gray-500">
                            {supplier.documentNumber}
                            {supplier.contactName && ` • ${supplier.contactName}`}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-500">
                        No se encontraron proveedores
                      </div>
                    )}
                  </div>
                )}

                {selectedSupplier && (
                  <div className="mt-2 text-sm text-green-600">
                    ✓ {selectedSupplier.businessName} seleccionado
                  </div>
                )}
              </div>
            </div>

            <Input
              label="Número de Factura"
              placeholder="001-123"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
            />

            <Input
              label="Fecha de Factura"
              type="date"
              required
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
            />

            {/* Selector de Almacén */}
            {warehouses.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Store className="w-4 h-4 inline mr-1" />
                  Almacén de Ingreso <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedWarehouse?.id || ''}
                  onChange={e => {
                    const warehouse = warehouses.find(w => w.id === e.target.value)
                    setSelectedWarehouse(warehouse)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {/* Almacenes de Sucursal Principal */}
                  {warehouses.filter(w => !w.branchId).length > 0 && (
                    <optgroup label="Sucursal Principal">
                      {warehouses.filter(w => !w.branchId).map(warehouse => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name} {warehouse.isDefault ? '(Principal)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {/* Almacenes de otras sucursales */}
                  {branches.map(branch => {
                    const branchWarehouses = warehouses.filter(w => w.branchId === branch.id)
                    if (branchWarehouses.length === 0) return null
                    return (
                      <optgroup key={branch.id} label={branch.name}>
                        {branchWarehouses.map(warehouse => (
                          <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.name} {warehouse.isDefault ? '(Principal)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  El stock ingresará a este almacén
                </p>
              </div>
            )}
          </div>

          {/* Tipo de Pago */}
          <div className="mt-4 pt-4 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Pago <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="paymentType"
                  value="contado"
                  checked={paymentType === 'contado'}
                  onChange={e => {
                    setPaymentType(e.target.value)
                    setDueDate('')
                    setInstallments([])
                  }}
                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Al Contado</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="paymentType"
                  value="credito"
                  checked={paymentType === 'credito'}
                  onChange={e => setPaymentType(e.target.value)}
                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Al Crédito</span>
              </label>
            </div>

            {paymentType === 'credito' && (
              <div className="mt-4 space-y-4">
                {/* Tipo de crédito */}
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="creditType"
                      value="unico"
                      checked={creditType === 'unico'}
                      onChange={e => {
                        setCreditType(e.target.value)
                        setInstallments([])
                      }}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Pago Único</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="creditType"
                      value="cuotas"
                      checked={creditType === 'cuotas'}
                      onChange={e => {
                        setCreditType(e.target.value)
                        setDueDate('')
                      }}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">En Cuotas</span>
                  </label>
                </div>

                {/* Pago único */}
                {creditType === 'unico' && (
                  <div className="max-w-xs">
                    <Input
                      label="Fecha de Vencimiento"
                      type="date"
                      required
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      min={getLocalDateString()}
                    />
                  </div>
                )}

                {/* Pago en cuotas */}
                {creditType === 'cuotas' && (
                  <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          N° de Cuotas
                        </label>
                        <input
                          type="number"
                          min="2"
                          max="36"
                          value={numInstallments}
                          onChange={e => setNumInstallments(parseInt(e.target.value) || 2)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Primera Cuota
                        </label>
                        <input
                          type="date"
                          value={firstDueDate}
                          onChange={e => setFirstDueDate(e.target.value)}
                          min={getLocalDateString()}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Frecuencia (días)
                        </label>
                        <select
                          value={installmentFrequency}
                          onChange={e => setInstallmentFrequency(parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value={7}>Semanal (7 días)</option>
                          <option value={15}>Quincenal (15 días)</option>
                          <option value={30}>Mensual (30 días)</option>
                          <option value={60}>Bimestral (60 días)</option>
                          <option value={90}>Trimestral (90 días)</option>
                          <option value={120}>Cuatrimestral (120 días)</option>
                        </select>
                      </div>
                    </div>

                    {/* Mensaje si falta fecha */}
                    {!firstDueDate && (
                      <p className="text-sm text-amber-600 mt-2">
                        Selecciona la fecha de la primera cuota para generar el cronograma
                      </p>
                    )}

                    {/* Lista de cuotas generadas */}
                    {installments.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Cronograma de Cuotas</h4>
                        <div className="space-y-2">
                          {installments.map((inst, idx) => (
                            <div key={idx} className="flex items-center gap-3 bg-white p-2 rounded border">
                              <span className="text-sm font-medium text-gray-600 w-20">
                                Cuota {inst.number}
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                value={inst.amount}
                                onChange={e => updateInstallmentAmount(idx, e.target.value)}
                                className="w-28 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                              />
                              <span className="text-sm text-gray-500">
                                Vence: {inst.dueDate}
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between items-center pt-2 border-t">
                            <span className="text-sm font-medium text-gray-700">Total Cuotas:</span>
                            <span className="text-lg font-bold text-primary-600">
                              {formatCurrency(installments.reduce((sum, c) => sum + c.amount, 0))}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {suppliers.length === 0 && (
            <Alert type="warning" className="mt-4">
              No tienes proveedores registrados.{' '}
              <button
                onClick={() => navigate('/app/proveedores')}
                className="underline font-medium"
              >
                Crear proveedor
              </button>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Productos e Ingredientes */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Items de Compra</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Los precios unitarios deben incluir IGV (18%)
                </p>
              </div>
              <Button onClick={addItem} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Agregar Item
              </Button>
            </div>
            {/* Tabs para seleccionar tipo de items */}
            {ingredients.length > 0 && (
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
                <button
                  onClick={() => setItemMode('products')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    itemMode === 'products'
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  Productos
                </button>
                <button
                  onClick={() => setItemMode('ingredients')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    itemMode === 'ingredients'
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Beaker className="w-4 h-4" />
                  Ingredientes
                </button>
                <button
                  onClick={() => setItemMode('all')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    itemMode === 'all'
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Todos
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 overflow-visible">
          {/* Vista de tabla para desktop */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className={`text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 ${businessMode === 'pharmacy' ? 'w-[25%]' : 'w-[35%]'}`}>Producto</th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[8%]">Cant.</th>
                  {businessMode === 'pharmacy' && (
                    <>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[12%]">Lote</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[12%]">Vence</th>
                    </>
                  )}
                  <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[12%]">Costo s/IGV</th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[12%]">Costo c/IGV</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3 w-[12%]">Subtotal</th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase px-2 py-3 w-[5%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchaseItems.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    {/* Producto */}
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <div className="relative flex-1" ref={el => productInputRefs.current[index] = el}>
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                              type="text"
                              placeholder={itemMode === 'ingredients' ? 'Buscar ingrediente...' : itemMode === 'all' ? 'Buscar producto o ingrediente...' : 'Buscar producto...'}
                              value={productSearches[index] || item.productName || ''}
                              onChange={e => {
                                updateProductSearch(index, e.target.value)
                                updateItem(index, 'productName', e.target.value)
                              }}
                              onFocus={() => {
                                const newDropdowns = { ...showProductDropdowns }
                                newDropdowns[index] = true
                                setShowProductDropdowns(newDropdowns)
                              }}
                              className={`w-full pl-7 pr-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                item.productId
                                  ? item.itemType === 'ingredient'
                                    ? 'border-amber-500 bg-amber-50'
                                    : 'border-green-500 bg-green-50'
                                  : 'border-gray-300'
                              }`}
                            />
                          </div>
                          {/* Dropdown de productos e ingredientes */}
                          {showProductDropdowns[index] && productSearches[index] && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {getFilteredItems(index).length > 0 ? (
                                getFilteredItems(index).map(searchItem => (
                                  <div
                                    key={`${searchItem.itemType}-${searchItem.id}`}
                                    role="button"
                                    tabIndex={0}
                                    onMouseDown={e => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      selectProduct(index, searchItem)
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-b-0 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2">
                                      {searchItem.itemType === 'ingredient' ? (
                                        <Beaker className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                      ) : (
                                        <Package className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                                      )}
                                      <span className="font-medium text-sm text-gray-900">{searchItem.name}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 ml-5.5 pl-0.5">
                                      {searchItem.itemType === 'ingredient' ? (
                                        <>Stock: {searchItem.currentStock} {searchItem.purchaseUnit}</>
                                      ) : (
                                        searchItem.code || `Stock: ${searchItem.stock || 0}`
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-sm text-gray-500">No encontrado</div>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => openCreateProductModal(index)}
                          className="p-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
                          title="Crear producto nuevo"
                        >
                          <PackagePlus className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    {/* Cantidad */}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0"
                        value={item.quantity}
                        onChange={e => updateItem(index, 'quantity', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </td>
                    {/* Lote y Vencimiento - Solo en modo farmacia */}
                    {businessMode === 'pharmacy' && (
                      <>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            placeholder="Lote"
                            value={item.batchNumber || ''}
                            onChange={e => updateItem(index, 'batchNumber', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={item.expirationDate || ''}
                            onChange={e => updateItem(index, 'expirationDate', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                      </>
                    )}
                    {/* Costo Sin IGV */}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={item.costWithoutIGV || ''}
                        onChange={e => updateCostWithoutIGV(index, e.target.value)}
                        className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </td>
                    {/* Costo Con IGV */}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={item.cost ? parseFloat(item.cost.toFixed(2)) : ''}
                        onChange={e => updateCostWithIGV(index, e.target.value)}
                        className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </td>
                    {/* Subtotal */}
                    <td className="px-4 py-2 text-right">
                      <span className="font-semibold text-gray-900">
                        {formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.cost) || 0))}
                      </span>
                    </td>
                    {/* Eliminar */}
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => removeItem(index)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        disabled={purchaseItems.length === 1}
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vista de lista compacta para móvil */}
          <div className="md:hidden divide-y divide-gray-200">
            {purchaseItems.map((item, index) => (
              <div key={index} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">#{index + 1}</span>
                  <button
                    onClick={() => removeItem(index)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    disabled={purchaseItems.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Producto o Ingrediente */}
                <div className="flex gap-2">
                  <div className="relative flex-1" ref={el => productInputRefs.current[`mobile-${index}`] = el}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder={itemMode === 'ingredients' ? 'Buscar ingrediente...' : itemMode === 'all' ? 'Buscar...' : 'Buscar producto...'}
                        value={productSearches[index] || item.productName || ''}
                        onChange={e => {
                          updateProductSearch(index, e.target.value)
                          updateItem(index, 'productName', e.target.value)
                        }}
                        onFocus={() => {
                          const newDropdowns = { ...showProductDropdowns }
                          newDropdowns[index] = true
                          setShowProductDropdowns(newDropdowns)
                        }}
                        className={`w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                          item.productId
                            ? item.itemType === 'ingredient'
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-green-500 bg-green-50'
                            : 'border-gray-300'
                        }`}
                      />
                    </div>
                    {showProductDropdowns[index] && productSearches[index] && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {getFilteredItems(index).length > 0 ? (
                          getFilteredItems(index).map(searchItem => (
                            <div
                              key={`${searchItem.itemType}-${searchItem.id}`}
                              role="button"
                              tabIndex={0}
                              onMouseDown={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                selectProduct(index, searchItem)
                              }}
                              onTouchStart={e => {
                                e.stopPropagation()
                              }}
                              onTouchEnd={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                selectProduct(index, searchItem)
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-b-0 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                {searchItem.itemType === 'ingredient' ? (
                                  <Beaker className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                ) : (
                                  <Package className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                                )}
                                <span className="font-medium text-sm">{searchItem.name}</span>
                              </div>
                              <div className="text-xs text-gray-500 ml-5.5 pl-0.5">
                                {searchItem.itemType === 'ingredient' ? (
                                  <>Stock: {searchItem.currentStock} {searchItem.purchaseUnit}</>
                                ) : (
                                  searchItem.code || `Stock: ${searchItem.stock || 0}`
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-gray-500">No encontrado</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openCreateProductModal(index)}
                    className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    title="Nuevo"
                  >
                    <PackagePlus className="w-4 h-4" />
                  </button>
                </div>

                {/* Lote y Vencimiento - Solo en modo farmacia */}
                {businessMode === 'pharmacy' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">N° Lote</label>
                      <input
                        type="text"
                        placeholder="Ej: LOT-001"
                        value={item.batchNumber || ''}
                        onChange={e => updateItem(index, 'batchNumber', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">F. Vencimiento</label>
                      <input
                        type="date"
                        value={item.expirationDate || ''}
                        onChange={e => updateItem(index, 'expirationDate', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                )}

                {/* Cantidad y Costos en una fila */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantity}
                      onChange={e => updateItem(index, 'quantity', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">s/IGV</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.costWithoutIGV || ''}
                      onChange={e => updateCostWithoutIGV(index, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">c/IGV</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.cost ? parseFloat(item.cost.toFixed(2)) : ''}
                      onChange={e => updateCostWithIGV(index, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Subtotal */}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Subtotal:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.cost) || 0))}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {products.length === 0 && ingredients.length === 0 && (
            <Alert type="warning" className="mt-4">
              No tienes productos ni ingredientes registrados.{' '}
              <button
                onClick={() => navigate('/app/productos')}
                className="underline font-medium"
              >
                Crear producto
              </button>
              {' o '}
              <button
                onClick={() => navigate('/app/ingredientes')}
                className="underline font-medium"
              >
                Crear ingrediente
              </button>
            </Alert>
          )}
          {products.length === 0 && ingredients.length > 0 && itemMode === 'products' && (
            <Alert type="info" className="mt-4">
              No tienes productos registrados. Cambia a "Ingredientes" para ver tus ingredientes o{' '}
              <button
                onClick={() => navigate('/app/productos')}
                className="underline font-medium"
              >
                crea un producto
              </button>
            </Alert>
          )}
          {ingredients.length === 0 && products.length > 0 && itemMode === 'ingredients' && (
            <Alert type="info" className="mt-4">
              No tienes ingredientes registrados. Cambia a "Productos" para ver tus productos o{' '}
              <button
                onClick={() => navigate('/app/ingredientes')}
                className="underline font-medium"
              >
                crea un ingrediente
              </button>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Notas y Total */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <Input
              label="Notas (opcional)"
              placeholder="Observaciones adicionales..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />

            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between items-center text-gray-600">
                <span className="text-sm">Subtotal:</span>
                <span className="font-medium">{formatCurrency(calculateAmounts().subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span className="text-sm">IGV (18%):</span>
                <span className="font-medium">{formatCurrency(calculateAmounts().igv)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-700">Total:</span>
                <span className="text-3xl font-bold text-primary-600">
                  {formatCurrency(calculateAmounts().total)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/app/compras')}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isEditMode ? 'Actualizando...' : 'Guardando...'}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {isEditMode ? 'Actualizar Compra' : 'Guardar Compra'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal para crear producto nuevo */}
      <ProductFormModal
        isOpen={showCreateProductModal}
        onClose={closeCreateProductModal}
        onSubmit={handleCreateProduct}
        initialData={newProductName ? { name: newProductName } : null}
        categories={categories}
        title="Nuevo Producto"
        submitLabel="Crear Producto"
        isSubmitting={isCreatingProduct}
        options={{
          showImages: true,
          showSku: true,
          showMultiplePrices: true,
          showIgvAffectation: true,
          showPresentations: true,
          showExpiration: true,
          showDecimalQuantity: true,
          showCatalogVisibility: true,
        }}
        hideStockField={true} // En compras, el stock se maneja con la cantidad del item, no aquí
      />
    </div>
  )
}
