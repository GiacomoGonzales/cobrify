import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  Eye,
  Edit2,
  Trash2,
  Loader2,
  ShoppingBag,
  AlertTriangle,
  Package,
  DollarSign,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  CheckCircle,
  CreditCard,
  Clock,
  List,
  Store,
  MoreVertical,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getActiveBranches } from '@/services/branchService'
import { getWarehouses, updateWarehouseStock, createStockMovement } from '@/services/warehouseService'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getPurchases, deletePurchase, updatePurchase, getProducts, updateProduct } from '@/services/firestoreService'
import { getPurchases as getIngredientPurchases, deleteIngredientPurchase } from '@/services/ingredientService'

/**
 * Parsea fecha YYYY-MM-DD a Date en hora LOCAL (evita problema de timezone)
 * "2024-01-12" con new Date() se interpreta como UTC, causando día incorrecto en Perú
 */
const parseLocalDate = (dateValue) => {
  if (dateValue instanceof Date) return dateValue
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const [year, month, day] = dateValue.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0)
  }
  return new Date(dateValue)
}

export default function Purchases() {
  const { user, isDemoMode, demoData, getBusinessId } = useAppContext()
  const toast = useToast()
  const navigate = useNavigate()
  const [purchases, setPurchases] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewingPurchase, setViewingPurchase] = useState(null)
  const [deletingPurchase, setDeletingPurchase] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Estado para marcar como pagado
  const [markingAsPaid, setMarkingAsPaid] = useState(null)
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)

  // Estado para ver/pagar cuotas (legacy - compras antiguas con cuotas fijas)
  const [viewingInstallments, setViewingInstallments] = useState(null)
  const [payingInstallment, setPayingInstallment] = useState(null) // {purchaseId, installmentIndex}
  const [isPayingInstallment, setIsPayingInstallment] = useState(false)

  // Estado para registrar pagos parciales (abonos) - nuevo sistema
  const [registeringPayment, setRegisteringPayment] = useState(null) // La compra a la que se registra el pago
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })())
  const [paymentNotes, setPaymentNotes] = useState('')
  const [isRegisteringPayment, setIsRegisteringPayment] = useState(false)
  const [viewingPayments, setViewingPayments] = useState(null) // Para ver historial de pagos
  const [editingPaymentDate, setEditingPaymentDate] = useState(null) // { purchaseId, paymentIndex, date }
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: false })

  // Ordenamiento
  const [sortField, setSortField] = useState('date') // 'date', 'amount', 'supplier'
  const [sortDirection, setSortDirection] = useState('desc') // 'asc', 'desc'

  // Filtro de fechas
  const [dateFilter, setDateFilter] = useState('all') // 'all', 'today', '3days', '7days', '30days', 'custom'
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Filtro de tipo de pago
  const [paymentFilter, setPaymentFilter] = useState('all') // 'all', 'contado', 'credito', 'pending'

  // Filtro de sucursal
  const [branches, setBranches] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [filterBranch, setFilterBranch] = useState('all') // 'all', 'main', or branch.id

  useEffect(() => {
    loadPurchases()
    loadBranches()
    loadWarehouses()
  }, [user])

  const loadBranches = async () => {
    if (!user?.uid || isDemoMode) return
    const result = await getActiveBranches(getBusinessId())
    if (result.success) {
      setBranches(result.data || [])
    }
  }

  const loadWarehouses = async () => {
    if (!user?.uid || isDemoMode) return
    const result = await getWarehouses(getBusinessId())
    if (result.success) {
      // Solo almacenes activos
      const activeWarehouses = (result.data || []).filter(w => w.isActive !== false)
      setWarehouses(activeWarehouses)
    }
  }

  const loadPurchases = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      // MODO DEMO: Usar datos de ejemplo
      if (isDemoMode && demoData) {
        setPurchases(demoData.purchases || [])
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      const [result, ingResult] = await Promise.all([
        getPurchases(businessId),
        getIngredientPurchases(businessId)
      ])

      let allPurchases = []

      if (result.success) {
        allPurchases = result.data || []
      } else {
        console.error('Error al cargar compras:', result.error)
      }

      // Agrupar compras de ingredientes por proveedor + factura + mismo día
      // Solo mostrar las que NO ya están representadas en una compra principal (purchases)
      if (ingResult.success && ingResult.data?.length > 0) {
        // Construir sets de claves de compras principales que ya tienen ingredientes
        // Usamos dos estrategias: por factura (sin fecha) y por día (sin factura)
        const mainPurchaseKeysByInvoice = new Set() // proveedor + factura (cuando hay N° factura)
        const mainPurchaseKeysByDay = new Set() // proveedor + día (cuando no hay N° factura)
        allPurchases.forEach(p => {
          const hasIngredients = p.items?.some(item => item.itemType === 'ingredient')
          if (hasIngredients) {
            const supplierName = p.supplier?.businessName || ''
            if (p.invoiceNumber) {
              // Con factura: match por proveedor + factura (sin importar día)
              mainPurchaseKeysByInvoice.add(`${supplierName}_${p.invoiceNumber}`)
            } else {
              // Sin factura: match por proveedor + día (usando tanto invoiceDate como createdAt)
              // Esto cubre el caso donde invoiceDate y createdAt caen en días diferentes
              const invoiceDate = p.invoiceDate?.toDate ? p.invoiceDate.toDate() : (p.invoiceDate ? new Date(p.invoiceDate) : null)
              const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : (p.createdAt ? new Date(p.createdAt) : null)
              if (invoiceDate) {
                const dayKey = `${invoiceDate.getFullYear()}-${invoiceDate.getMonth()}-${invoiceDate.getDate()}`
                mainPurchaseKeysByDay.add(`${supplierName}_${dayKey}`)
              }
              if (createdAt) {
                const dayKey = `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}`
                mainPurchaseKeysByDay.add(`${supplierName}_${dayKey}`)
              }
            }
          }
        })

        const groups = {}
        ingResult.data.forEach(p => {
          const date = p.purchaseDate?.toDate ? p.purchaseDate.toDate() : (p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.purchaseDate || p.createdAt))
          const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

          // Saltar si ya existe una compra principal con los mismos datos
          if (p.invoiceNumber && mainPurchaseKeysByInvoice.has(`${p.supplier || ''}_${p.invoiceNumber}`)) return
          if (!p.invoiceNumber && mainPurchaseKeysByDay.has(`${p.supplier || ''}_${dayKey}`)) return

          const key = `${p.supplier || ''}_${p.invoiceNumber || ''}_${dayKey}`

          if (!groups[key]) {
            groups[key] = {
              ids: [],
              supplier: p.supplier || 'Sin proveedor',
              invoiceNumber: p.invoiceNumber || '',
              date: p.purchaseDate || p.createdAt,
              items: [],
              total: 0,
            }
          }
          groups[key].ids.push(p.id)
          groups[key].items.push({
            productId: p.ingredientId,
            productName: p.ingredientName,
            itemType: 'ingredient',
            quantity: p.quantity,
            unit: p.unit,
            unitPrice: p.unitPrice,
          })
          groups[key].total += p.totalCost || (p.quantity * p.unitPrice)
        })

        const groupedPurchases = Object.values(groups).map(g => ({
          id: `ing-${g.ids.join('-')}`,
          _isIngredientPurchase: true,
          _ingredientPurchaseIds: g.ids,
          invoiceNumber: g.invoiceNumber,
          supplier: { businessName: g.supplier, documentNumber: '' },
          invoiceDate: g.date,
          createdAt: g.date,
          items: g.items,
          total: g.total,
          paymentType: 'contado',
          paymentStatus: 'paid',
        }))
        allPurchases = [...allPurchases, ...groupedPurchases]
      }

      setPurchases(allPurchases)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingPurchase || !user?.uid) return

    // MODO DEMO: No permitir eliminaciones
    if (isDemoMode) {
      toast.error('No se pueden eliminar compras en modo demo')
      setDeletingPurchase(null)
      return
    }

    setIsDeleting(true)
    const businessId = getBusinessId()

    try {
      // Compras de ingredientes (desde ingredientPurchases)
      if (deletingPurchase._isIngredientPurchase) {
        const ids = deletingPurchase._ingredientPurchaseIds || []
        for (const purchaseId of ids) {
          const result = await deleteIngredientPurchase(businessId, purchaseId)
          if (!result.success) {
            console.warn(`Error eliminando compra de ingrediente ${purchaseId}:`, result.error)
          }
        }
        toast.success('Compra de ingredientes eliminada y stock revertido')
        setDeletingPurchase(null)
        loadPurchases()
        return
      }

      // Compras normales (desde purchases)
      // 1. Revertir el stock de los productos antes de eliminar
      if (deletingPurchase.items && deletingPurchase.items.length > 0) {
        // Obtener productos actuales
        const productsResult = await getProducts(businessId)
        const products = productsResult.success ? productsResult.data : []

        // Obtener warehouseId de la compra
        const warehouseId = deletingPurchase.warehouseId || ''

        for (const item of deletingPurchase.items) {
          // Solo procesar productos (no ingredientes)
          if (item.itemType === 'ingredient') continue
          if (!item.productId) continue

          try {
            // Buscar el producto actual
            const productData = products.find(p => p.id === item.productId)
            if (!productData) {
              console.warn(`Producto ${item.productId} no encontrado, omitiendo...`)
              continue
            }

            // Si el producto no controla stock, omitir
            if (productData.trackStock === false || productData.stock === null) {
              console.log(`Producto ${item.productName} no controla stock, omitiendo...`)
              continue
            }

            const quantityToDeduct = parseFloat(item.quantity) || 0
            if (quantityToDeduct <= 0) continue

            // Descontar stock usando el helper de almacén (cantidad negativa = salida)
            const updatedProduct = updateWarehouseStock(
              productData,
              warehouseId,
              -quantityToDeduct
            )

            // Guardar en Firestore
            await updateProduct(businessId, item.productId, {
              stock: updatedProduct.stock,
              warehouseStocks: updatedProduct.warehouseStocks
            })

            // Registrar movimiento de stock
            await createStockMovement(businessId, {
              productId: item.productId,
              warehouseId: warehouseId,
              type: 'purchase_void',
              quantity: -quantityToDeduct,
              reason: 'Anulación de compra',
              referenceType: 'purchase_void',
              referenceId: deletingPurchase.id,
              referenceNumber: deletingPurchase.invoiceNumber || 'S/N',
              userId: user.uid,
              notes: `Stock revertido por anulación de compra ${deletingPurchase.invoiceNumber || 'S/N'}`
            })

            console.log(`✅ Stock revertido para ${item.productName}: -${quantityToDeduct}`)
          } catch (stockError) {
            console.warn(`No se pudo revertir stock para producto ${item.productId}:`, stockError)
          }
        }
      }

      // 2. Eliminar la compra
      const result = await deletePurchase(businessId, deletingPurchase.id)

      if (result.success) {
        toast.success('Compra eliminada y stock revertido exitosamente')
        setDeletingPurchase(null)
        loadPurchases()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar compra:', error)
      toast.error('Error al eliminar la compra. Inténtalo nuevamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Marcar compra como pagada
  const handleMarkAsPaid = async () => {
    if (!markingAsPaid || !user?.uid) return

    if (isDemoMode) {
      toast.error('No se pueden modificar compras en modo demo')
      setMarkingAsPaid(null)
      return
    }

    setIsMarkingPaid(true)
    try {
      const result = await updatePurchase(getBusinessId(), markingAsPaid.id, {
        paymentStatus: 'paid',
        paidAmount: markingAsPaid.total,
        paidAt: new Date(),
      })

      if (result.success) {
        toast.success('Compra marcada como pagada')
        setMarkingAsPaid(null)
        loadPurchases()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al marcar como pagada:', error)
      toast.error('Error al actualizar la compra')
    } finally {
      setIsMarkingPaid(false)
    }
  }

  // Pagar una cuota individual
  const handlePayInstallment = async (purchase, installmentIndex) => {
    if (!purchase || !user?.uid) return

    if (isDemoMode) {
      toast.error('No se pueden modificar compras en modo demo')
      return
    }

    setIsPayingInstallment(true)
    try {
      const updatedInstallments = [...purchase.installments]
      updatedInstallments[installmentIndex] = {
        ...updatedInstallments[installmentIndex],
        status: 'paid',
        paidAt: new Date(),
        paidAmount: updatedInstallments[installmentIndex].amount
      }

      const paidInstallments = updatedInstallments.filter(i => i.status === 'paid').length
      const totalPaid = updatedInstallments.reduce((sum, i) => sum + (i.paidAmount || 0), 0)
      const allPaid = paidInstallments === updatedInstallments.length

      const result = await updatePurchase(getBusinessId(), purchase.id, {
        installments: updatedInstallments,
        paidInstallments: paidInstallments,
        paidAmount: totalPaid,
        paymentStatus: allPaid ? 'paid' : 'pending',
        ...(allPaid && { paidAt: new Date() }),
      })

      if (result.success) {
        toast.success(`Cuota ${installmentIndex + 1} pagada exitosamente`)
        loadPurchases()
        // Actualizar el modal
        const updatedPurchase = { ...purchase, installments: updatedInstallments }
        setViewingInstallments(updatedPurchase)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al pagar cuota:', error)
      toast.error('Error al registrar el pago de la cuota')
    } finally {
      setIsPayingInstallment(false)
    }
  }

  // Registrar un pago parcial (abono) - nuevo sistema
  const handleRegisterPayment = async () => {
    if (!registeringPayment || !user?.uid) return

    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) {
      toast.error('Ingrese un monto válido mayor a 0')
      return
    }

    // Redondear a 2 decimales para evitar errores de precisión con decimales en JavaScript
    const remaining = Math.round(((registeringPayment.total || 0) - (registeringPayment.paidAmount || 0)) * 100) / 100
    const roundedAmount = Math.round(amount * 100) / 100
    if (roundedAmount > remaining + 0.001) {
      toast.error(`El monto no puede exceder el saldo pendiente (${formatCurrency(remaining)})`)
      return
    }

    if (isDemoMode) {
      toast.error('No se pueden registrar pagos en modo demo')
      return
    }

    setIsRegisteringPayment(true)
    try {
      // Crear el nuevo pago
      // Convertir fecha seleccionada a Date (mediodía para evitar problemas de zona horaria)
      const [year, month, day] = paymentDate.split('-').map(Number)
      const selectedDate = new Date(year, month - 1, day, 12, 0, 0)

      const newPayment = {
        id: `payment-${Date.now()}`,
        amount: amount,
        date: selectedDate,
        notes: paymentNotes.trim() || '',
        registeredBy: user.uid
      }

      // Obtener pagos existentes o inicializar array vacío
      const existingPayments = registeringPayment.payments || []
      const updatedPayments = [...existingPayments, newPayment]

      // Calcular nuevo monto pagado total
      const newPaidAmount = (registeringPayment.paidAmount || 0) + amount
      const isPaidInFull = newPaidAmount >= registeringPayment.total

      const result = await updatePurchase(getBusinessId(), registeringPayment.id, {
        payments: updatedPayments,
        paidAmount: newPaidAmount,
        paymentStatus: isPaidInFull ? 'paid' : 'pending',
        ...(isPaidInFull && { paidAt: new Date() }),
      })

      if (result.success) {
        toast.success(isPaidInFull
          ? 'Pago registrado. ¡Compra cancelada completamente!'
          : `Abono de ${formatCurrency(amount)} registrado exitosamente`
        )
        // Limpiar y cerrar modal
        setRegisteringPayment(null)
        setPaymentAmount('')
        setPaymentNotes('')
        loadPurchases()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al registrar pago:', error)
      toast.error('Error al registrar el pago')
    } finally {
      setIsRegisteringPayment(false)
    }
  }

  // Abrir modal de registro de pago con monto sugerido
  const openPaymentModal = (purchase) => {
    const remaining = (purchase.total || 0) - (purchase.paidAmount || 0)
    setRegisteringPayment(purchase)
    setPaymentAmount(remaining.toFixed(2)) // Sugerir el saldo pendiente
    setPaymentDate((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()) // Fecha de hoy por defecto
    setPaymentNotes('')
  }

  // Guardar fecha editada de un pago existente
  const handleSavePaymentDate = async (purchase, paymentIndex, newDateStr) => {
    try {
      const [year, month, day] = newDateStr.split('-').map(Number)
      const newDate = new Date(year, month - 1, day, 12, 0, 0)

      const updatedPayments = [...(purchase.payments || [])]
      updatedPayments[paymentIndex] = {
        ...updatedPayments[paymentIndex],
        date: newDate
      }

      const result = await updatePurchase(getBusinessId(), purchase.id, {
        payments: updatedPayments
      })

      if (result.success) {
        toast.success('Fecha de pago actualizada')
        setEditingPaymentDate(null)
        // Actualizar el estado local para reflejar el cambio
        setViewingPayments(prev => prev ? { ...prev, payments: updatedPayments } : null)
        loadPurchases()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al actualizar fecha de pago:', error)
      toast.error('Error al actualizar la fecha')
    }
  }

  // Función para cambiar ordenamiento
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Icono de ordenamiento
  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4 text-primary-600" />
      : <ArrowDown className="w-4 h-4 text-primary-600" />
  }

  // Obtener rango de fechas basado en el filtro
  const getDateRange = () => {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    switch (dateFilter) {
      case 'today':
        return { start: startOfDay, end: endOfDay }
      case '3days':
        const threeDaysAgo = new Date(startOfDay)
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 2)
        return { start: threeDaysAgo, end: endOfDay }
      case '7days':
        const sevenDaysAgo = new Date(startOfDay)
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
        return { start: sevenDaysAgo, end: endOfDay }
      case '30days':
        const thirtyDaysAgo = new Date(startOfDay)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
        return { start: thirtyDaysAgo, end: endOfDay }
      case 'custom':
        if (customStartDate && customEndDate) {
          // Usar parseLocalDate para evitar problemas de timezone con fechas YYYY-MM-DD
          const start = parseLocalDate(customStartDate)
          start.setHours(0, 0, 0, 0)
          const end = parseLocalDate(customEndDate)
          end.setHours(23, 59, 59, 999)
          return { start, end }
        }
        return null
      default:
        return null
    }
  }

  // Filtrar por fecha
  const filterByDate = (purchase) => {
    const dateRange = getDateRange()
    if (!dateRange) return true // 'all' o custom sin fechas

    // Usar invoiceDate (fecha de factura) en lugar de createdAt (fecha de registro)
    const dateField = purchase.invoiceDate || purchase.createdAt
    const purchaseDate = dateField?.toDate
      ? dateField.toDate()
      : new Date(dateField || 0)

    return purchaseDate >= dateRange.start && purchaseDate <= dateRange.end
  }

  // Filtrar por tipo de pago
  const filterByPayment = (purchase) => {
    if (paymentFilter === 'all') return true
    if (paymentFilter === 'contado') return purchase.paymentType === 'contado'
    if (paymentFilter === 'credito') return purchase.paymentType === 'credito'
    if (paymentFilter === 'pending') return purchase.paymentType === 'credito' && purchase.paymentStatus === 'pending'
    return true
  }

  // Obtener IDs de almacenes por sucursal
  const getWarehouseIdsForBranch = useMemo(() => {
    if (filterBranch === 'all') return null // No filtrar
    if (filterBranch === 'main') {
      return warehouses.filter(w => !w.branchId).map(w => w.id)
    }
    return warehouses.filter(w => w.branchId === filterBranch).map(w => w.id)
  }, [warehouses, filterBranch])

  // Filtrar por sucursal
  const filterByBranch = (purchase) => {
    if (filterBranch === 'all') return true
    if (!getWarehouseIdsForBranch || getWarehouseIdsForBranch.length === 0) return false

    // Verificar si el warehouseId de la compra está en los almacenes de la sucursal
    const purchaseWarehouseId = purchase.warehouseId || purchase.items?.[0]?.warehouseId
    if (!purchaseWarehouseId) return filterBranch === 'main' // Si no tiene almacén, asumimos sucursal principal
    return getWarehouseIdsForBranch.includes(purchaseWarehouseId)
  }

  // Obtener nombre de sucursal para una compra
  const getBranchName = (purchase) => {
    const purchaseWarehouseId = purchase.warehouseId || purchase.items?.[0]?.warehouseId
    if (!purchaseWarehouseId) return 'Sucursal Principal'

    const warehouse = warehouses.find(w => w.id === purchaseWarehouseId)
    if (!warehouse) return 'Sucursal Principal'
    if (!warehouse.branchId) return 'Sucursal Principal'

    const branch = branches.find(b => b.id === warehouse.branchId)
    return branch?.name || 'Sucursal Principal'
  }

  const filteredPurchases = purchases
    .filter(filterByDate) // Filtrar por fecha
    .filter(filterByPayment) // Filtrar por tipo de pago
    .filter(filterByBranch) // Filtrar por sucursal
    .filter(purchase => {
      // Si no hay término de búsqueda, mostrar todas las compras
      if (!searchTerm || searchTerm.trim() === '') return true

      const search = searchTerm.toLowerCase()
      return (
        purchase.invoiceNumber?.toLowerCase().includes(search) ||
        purchase.supplier?.businessName?.toLowerCase().includes(search) ||
        purchase.supplier?.documentNumber?.includes(search)
      )
    })
    .sort((a, b) => {
      let comparison = 0

      if (sortField === 'date') {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
        comparison = dateA - dateB
      } else if (sortField === 'amount') {
        comparison = (a.total || 0) - (b.total || 0)
      } else if (sortField === 'supplier') {
        const supplierA = a.supplier?.businessName?.toLowerCase() || ''
        const supplierB = b.supplier?.businessName?.toLowerCase() || ''
        comparison = supplierA.localeCompare(supplierB)
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

  // Compras filtradas por fecha y sucursal (para las estadísticas, sin búsqueda de texto)
  const dateFilteredPurchases = useMemo(() => {
    return purchases.filter(filterByDate).filter(filterByBranch)
  }, [purchases, dateFilter, customStartDate, customEndDate, filterBranch, getWarehouseIdsForBranch])

  // Estadísticas
  const stats = useMemo(() => {
    const filtered = dateFilteredPurchases
    const pendingPurchases = filtered.filter(p => p.paymentType === 'credito' && p.paymentStatus === 'pending')
    const pendingAmount = pendingPurchases.reduce((sum, p) => {
      const remaining = (p.total || 0) - (p.paidAmount || 0)
      return sum + remaining
    }, 0)

    return {
      total: filtered.length,
      totalAmount: filtered.reduce((sum, p) => sum + (p.total || 0), 0),
      totalAll: purchases.length,
      pendingCount: pendingPurchases.length,
      pendingAmount: pendingAmount,
    }
  }, [dateFilteredPurchases, purchases])

  // Etiqueta del filtro actual
  const getFilterLabel = () => {
    switch (dateFilter) {
      case 'today': return 'Hoy'
      case '3days': return 'Últimos 3 días'
      case '7days': return 'Últimos 7 días'
      case '30days': return 'Últimos 30 días'
      case 'custom':
        if (customStartDate && customEndDate) {
          return `${customStartDate} - ${customEndDate}`
        }
        return 'Personalizado'
      default: return 'Todo el tiempo'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando compras...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Compras</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tus órdenes de compra y entrada de mercadería
          </p>
        </div>
        <Link to="/app/compras/nueva" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Compra
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Búsqueda */}
          <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
            <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar por número de factura, proveedor..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
            />
          </div>

          {/* Filtro de fechas */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 font-medium">Período:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'Todo' },
                { value: 'today', label: 'Hoy' },
                { value: '3days', label: '3 días' },
                { value: '7days', label: '7 días' },
                { value: '30days', label: '30 días' },
                { value: 'custom', label: 'Personalizado' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDateFilter(option.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors shadow-sm ${
                    dateFilter === option.value
                      ? 'bg-primary-600 text-white border border-primary-700'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fechas personalizadas */}
          {dateFilter === 'custom' && (
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Desde:</label>
                <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-1.5 shadow-sm">
                  <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Hasta:</label>
                <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-1.5 shadow-sm">
                  <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Filtro de tipo de pago */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 font-medium">Pago:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'Todos' },
                { value: 'contado', label: 'Contado' },
                { value: 'credito', label: 'Crédito' },
                { value: 'pending', label: 'Pendientes' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPaymentFilter(option.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors shadow-sm ${
                    paymentFilter === option.value
                      ? option.value === 'pending'
                        ? 'bg-red-600 text-white border border-red-700'
                        : 'bg-blue-600 text-white border border-blue-700'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  {option.label}
                  {option.value === 'pending' && stats.pendingCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                      {stats.pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Filtro de sucursal */}
          {branches.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600 font-medium">Sucursal:</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                  <Store className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <select
                    value={filterBranch}
                    onChange={(e) => setFilterBranch(e.target.value)}
                    className="flex-1 text-sm bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
                  >
                    <option value="all">Todas las sucursales</option>
                    <option value="main">Sucursal Principal</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Compras</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stats.total}</p>
              </div>
              <div className="p-2 bg-primary-100 rounded-lg">
                <ShoppingBag className="w-5 h-5 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Monto Total</p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {formatCurrency(stats.totalAmount)}
                </p>
              </div>
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.pendingCount > 0 ? 'ring-2 ring-red-200' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Por Pagar</p>
                <p className="text-lg font-bold text-red-600 mt-1">
                  {formatCurrency(stats.pendingAmount)}
                </p>
                {stats.pendingCount > 0 && (
                  <p className="text-xs text-red-500">{stats.pendingCount} pendientes</p>
                )}
              </div>
              <div className="p-2 bg-red-100 rounded-lg">
                <Clock className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Período</p>
                <p className="text-sm font-bold text-gray-900 mt-1">{getFilterLabel()}</p>
              </div>
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Purchases Table */}
      <Card>
        {filteredPurchases.length === 0 ? (
          <CardContent className="p-12 text-center">
            <ShoppingBag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron compras' : 'No hay compras registradas'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza registrando tu primera compra'}
            </p>
            {!searchTerm && (
              <Link to="/app/compras/nueva">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Primera Compra
                </Button>
              </Link>
            )}
          </CardContent>
        ) : (
          <div className="overflow-hidden">
            {/* Vista móvil - Tarjetas */}
            <div className="lg:hidden divide-y divide-gray-100">
              {filteredPurchases.map(purchase => (
                <div key={purchase.id} className="px-4 py-3 hover:bg-gray-50">
                  {/* Fila 1: Proveedor + acciones */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-1 flex-1">
                      {purchase.supplier?.businessName || 'N/A'}
                    </p>
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
                        setOpenMenuId(openMenuId === purchase.id ? null : purchase.id)
                      }}
                      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fila 2: Factura + Fecha */}
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span>{purchase.invoiceNumber || 'S/N'}</span>
                    <span className="text-gray-300">•</span>
                    <span>
                      {(purchase.invoiceDate || purchase.createdAt)
                        ? formatDate(
                            (purchase.invoiceDate || purchase.createdAt).toDate
                              ? (purchase.invoiceDate || purchase.createdAt).toDate()
                              : (purchase.invoiceDate || purchase.createdAt)
                          )
                        : '-'}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span>{purchase.items?.length || 0} items</span>
                  </div>

                  {/* Fila 3: Monto + Estado */}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-gray-900">
                      {formatCurrency(purchase.total)}
                    </span>
                    <div>
                      {purchase.paymentType === 'credito' ? (
                        purchase.paymentStatus === 'paid' ? (
                          <Badge variant="success" className="text-xs">Pagado</Badge>
                        ) : (
                          <Badge variant="warning" className="text-xs">
                            {Math.round(((purchase.paidAmount || 0) / purchase.total) * 100)}% pagado
                          </Badge>
                        )
                      ) : (
                        <Badge variant="default" className="text-xs bg-gray-100 text-gray-700">Contado</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Vista desktop - Tabla */}
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Factura</TableHead>
                    <TableHead>
                      <button
                        onClick={() => handleSort('supplier')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                      >
                        Proveedor
                        {getSortIcon('supplier')}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        onClick={() => handleSort('date')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                      >
                        Fecha
                        {getSortIcon('date')}
                      </button>
                    </TableHead>
                    <TableHead className="text-center">Productos</TableHead>
                    <TableHead className="text-right">
                      <button
                        onClick={() => handleSort('amount')}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors ml-auto"
                      >
                        Monto
                        {getSortIcon('amount')}
                      </button>
                    </TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.map(purchase => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-medium">{purchase.invoiceNumber || '-'}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{purchase.supplier?.businessName || 'N/A'}</p>
                          <p className="text-xs text-gray-500">
                            {purchase.supplier?.documentNumber || ''}
                          </p>
                          {branches.length > 0 && (
                            <p className="text-xs text-blue-600 mt-0.5">
                              <Store className="w-3 h-3 inline mr-1" />
                              {getBranchName(purchase)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(purchase.invoiceDate || purchase.createdAt)
                          ? formatDate(
                              (purchase.invoiceDate || purchase.createdAt).toDate
                                ? (purchase.invoiceDate || purchase.createdAt).toDate()
                                : (purchase.invoiceDate || purchase.createdAt)
                            )
                          : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge>{purchase.items?.length || 0} items</Badge>
                          {purchase.items?.some(i => i.itemType === 'ingredient') && (
                            <span className="text-[10px] text-green-600">
                              {purchase.items.filter(i => i.itemType === 'ingredient').length} ing.
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(purchase.total)}
                      </TableCell>
                      <TableCell className="text-center">
                        {purchase.paymentType === 'credito' ? (
                          purchase.creditType === 'cuotas' ? (
                            <div className="flex flex-col items-center">
                              {purchase.paymentStatus === 'paid' ? (
                                <Badge variant="success" className="text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Pagado
                                </Badge>
                              ) : (
                                <Badge variant="warning" className="text-xs">
                                  <List className="w-3 h-3 mr-1" />
                                  {purchase.paidInstallments || 0}/{purchase.totalInstallments} cuotas
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center">
                              {purchase.paymentStatus === 'paid' ? (
                                <Badge variant="success" className="text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Pagado
                                </Badge>
                              ) : (
                                <>
                                  <Badge variant="warning" className="text-xs">
                                    <DollarSign className="w-3 h-3 mr-1" />
                                    {Math.round(((purchase.paidAmount || 0) / purchase.total) * 100)}%
                                  </Badge>
                                  <span className="text-xs text-gray-500 mt-0.5">
                                    {formatCurrency(purchase.paidAmount || 0)} / {formatCurrency(purchase.total)}
                                  </span>
                                </>
                              )}
                            </div>
                          )
                        ) : (
                          <Badge variant="default" className="text-xs bg-gray-100 text-gray-700">
                            Contado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end space-x-1">
                          {purchase.creditType === 'cuotas' && purchase.installments?.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingInstallments(purchase)}
                              className="text-purple-600 hover:bg-purple-50"
                              title="Ver cuotas"
                            >
                              <List className="w-4 h-4" />
                            </Button>
                          )}
                          {purchase.paymentType === 'credito' &&
                           purchase.paymentStatus === 'pending' &&
                           purchase.creditType !== 'cuotas' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPaymentModal(purchase)}
                              className="text-green-600 hover:bg-green-50"
                              title="Registrar abono"
                            >
                              <DollarSign className="w-4 h-4" />
                            </Button>
                          )}
                          {purchase.paymentType === 'credito' &&
                           purchase.creditType !== 'cuotas' &&
                           (purchase.payments?.length > 0 || purchase.paidAmount > 0) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingPayments(purchase)}
                              className="text-blue-600 hover:bg-blue-50"
                              title="Ver historial de pagos"
                            >
                              <List className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingPurchase(purchase)}
                            title="Ver detalles"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {!purchase._isIngredientPurchase && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/app/compras/editar/${purchase.id}`)}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingPurchase(purchase)}
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
              const menuPurchase = filteredPurchases.find(p => p.id === openMenuId)
              if (!menuPurchase) return null
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
                      onClick={() => { setViewingPurchase(menuPurchase); setOpenMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Eye className="w-4 h-4 text-gray-500" />
                      Ver detalles
                    </button>
                    {menuPurchase.paymentType === 'credito' &&
                     menuPurchase.paymentStatus === 'pending' &&
                     menuPurchase.creditType !== 'cuotas' && (
                      <button
                        onClick={() => { openPaymentModal(menuPurchase); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-green-600 hover:bg-green-50"
                      >
                        <DollarSign className="w-4 h-4" />
                        Registrar abono
                      </button>
                    )}
                    {menuPurchase.paymentType === 'credito' &&
                     menuPurchase.creditType !== 'cuotas' &&
                     (menuPurchase.payments?.length > 0 || menuPurchase.paidAmount > 0) && (
                      <button
                        onClick={() => { setViewingPayments(menuPurchase); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50"
                      >
                        <List className="w-4 h-4" />
                        Ver pagos
                      </button>
                    )}
                    {!menuPurchase._isIngredientPurchase && (
                      <button
                        onClick={() => { navigate(`/app/compras/editar/${menuPurchase.id}`); setOpenMenuId(null) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50"
                      >
                        <Edit2 className="w-4 h-4" />
                        Editar
                      </button>
                    )}
                    <button
                      onClick={() => { setDeletingPurchase(menuPurchase); setOpenMenuId(null) }}
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

      {/* Modal Ver Detalles */}
      <Modal
        isOpen={!!viewingPurchase}
        onClose={() => setViewingPurchase(null)}
        title="Detalles de Compra"
        size="lg"
      >
        {viewingPurchase && (
          <div className="space-y-6">
            {/* Información del proveedor */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Proveedor</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium">{viewingPurchase.supplier?.businessName}</p>
                <p className="text-sm text-gray-600">
                  {viewingPurchase.supplier?.documentNumber}
                </p>
              </div>
            </div>

            {/* Información de la factura */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Factura</h3>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Número:</span>
                  <span className="text-sm font-medium">{viewingPurchase.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Fecha:</span>
                  <span className="text-sm font-medium">
                    {(viewingPurchase.invoiceDate || viewingPurchase.createdAt)
                      ? formatDate(
                          (viewingPurchase.invoiceDate || viewingPurchase.createdAt).toDate
                            ? (viewingPurchase.invoiceDate || viewingPurchase.createdAt).toDate()
                            : (viewingPurchase.invoiceDate || viewingPurchase.createdAt)
                        )
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Hora de registro:</span>
                  <span className="text-sm font-medium">
                    {viewingPurchase.createdAt
                      ? (viewingPurchase.createdAt.toDate
                          ? viewingPurchase.createdAt.toDate()
                          : new Date(viewingPurchase.createdAt)
                        ).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })
                      : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Items de la compra */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Items</h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-center">Tipo</TableHead>
                      <TableHead className="text-center">Cantidad</TableHead>
                      <TableHead className="text-right">Precio Unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingPurchase.items?.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={item.itemType === 'ingredient' ? 'success' : 'default'} className="text-xs">
                            {item.itemType === 'ingredient' ? 'Ingrediente' : 'Producto'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Totales */}
            <div className="border-t pt-4 space-y-2">
              {viewingPurchase.subtotal && (
                <>
                  <div className="flex justify-between items-center text-gray-600">
                    <span className="text-sm">Subtotal:</span>
                    <span className="font-medium">{formatCurrency(viewingPurchase.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-600">
                    <span className="text-sm">IGV (18%):</span>
                    <span className="font-medium">{formatCurrency(viewingPurchase.igv)}</span>
                  </div>
                </>
              )}
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-700">Total:</span>
                <span className="text-2xl font-bold text-primary-600">
                  {formatCurrency(viewingPurchase.total)}
                </span>
              </div>
            </div>

            {viewingPurchase.notes && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Notas</h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                  {viewingPurchase.notes}
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setViewingPurchase(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deletingPurchase}
        onClose={() => setDeletingPurchase(null)}
        title="Eliminar Compra"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar la compra{' '}
                <strong>{deletingPurchase?.invoiceNumber}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción eliminará la compra y <strong>revertirá el stock</strong> de los productos incluidos.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingPurchase(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>Eliminar y Revertir Stock</>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmar Marcar como Pagado */}
      <Modal
        isOpen={!!markingAsPaid}
        onClose={() => setMarkingAsPaid(null)}
        title="Marcar como Pagado"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Confirmas que la compra{' '}
                <strong>{markingAsPaid?.invoiceNumber || 'sin número'}</strong> de{' '}
                <strong>{markingAsPaid?.supplier?.businessName || 'proveedor'}</strong>{' '}
                ha sido pagada?
              </p>
              <p className="text-lg font-bold text-gray-900 mt-2">
                Monto: {formatCurrency(markingAsPaid?.total || 0)}
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMarkingAsPaid(null)}
              disabled={isMarkingPaid}
            >
              Cancelar
            </Button>
            <Button onClick={handleMarkAsPaid} disabled={isMarkingPaid}>
              {isMarkingPaid ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirmar Pago
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Ver/Pagar Cuotas */}
      <Modal
        isOpen={!!viewingInstallments}
        onClose={() => setViewingInstallments(null)}
        title="Cronograma de Cuotas"
        size="lg"
      >
        {viewingInstallments && (
          <div className="space-y-4">
            {/* Resumen */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Proveedor</p>
                  <p className="font-medium">{viewingInstallments.supplier?.businessName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total de la Compra</p>
                  <p className="font-bold text-lg">{formatCurrency(viewingInstallments.total)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pagado</p>
                  <p className="font-medium text-green-600">{formatCurrency(viewingInstallments.paidAmount || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pendiente</p>
                  <p className="font-medium text-red-600">
                    {formatCurrency((viewingInstallments.total || 0) - (viewingInstallments.paidAmount || 0))}
                  </p>
                </div>
              </div>
            </div>

            {/* Lista de cuotas */}
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Detalle de Cuotas</h4>
              {viewingInstallments.installments?.map((inst, idx) => {
                const dueDate = inst.dueDate?.toDate ? inst.dueDate.toDate() : new Date(inst.dueDate)
                const isOverdue = inst.status === 'pending' && dueDate < new Date()

                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      inst.status === 'paid'
                        ? 'bg-green-50 border-green-200'
                        : isOverdue
                        ? 'bg-red-50 border-red-200'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        inst.status === 'paid' ? 'bg-green-500' : isOverdue ? 'bg-red-500' : 'bg-gray-300'
                      }`}>
                        {inst.status === 'paid' ? (
                          <CheckCircle className="w-4 h-4 text-white" />
                        ) : (
                          <span className="text-white text-sm font-medium">{inst.number}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">Cuota {inst.number}</p>
                        <p className={`text-sm ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
                          Vence: {formatDate(dueDate)}
                          {isOverdue && ' (Vencida)'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{formatCurrency(inst.amount)}</span>
                      {inst.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => handlePayInstallment(viewingInstallments, idx)}
                          disabled={isPayingInstallment}
                        >
                          {isPayingInstallment ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Pagar'
                          )}
                        </Button>
                      )}
                      {inst.status === 'paid' && (
                        <Badge variant="success" className="text-xs">Pagado</Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setViewingInstallments(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Registrar Abono (Pago Parcial) */}
      <Modal
        isOpen={!!registeringPayment}
        onClose={() => {
          setRegisteringPayment(null)
          setPaymentAmount('')
          setPaymentNotes('')
        }}
        title="Registrar Abono"
        size="sm"
      >
        {registeringPayment && (
          <div className="space-y-4">
            {/* Resumen de la compra */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Proveedor:</span>
                <span className="text-sm font-medium">{registeringPayment.supplier?.businessName || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total de la compra:</span>
                <span className="text-sm font-bold">{formatCurrency(registeringPayment.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Ya pagado:</span>
                <span className="text-sm font-medium text-green-600">{formatCurrency(registeringPayment.paidAmount || 0)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-sm text-gray-700 font-medium">Saldo pendiente:</span>
                <span className="text-lg font-bold text-red-600">
                  {formatCurrency((registeringPayment.total || 0) - (registeringPayment.paidAmount || 0))}
                </span>
              </div>
            </div>

            {/* Formulario de pago */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto del abono *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">S/</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(registeringPayment.total || 0) - (registeringPayment.paidAmount || 0)}
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de pago
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Selecciona la fecha en que se realizó el pago
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ej: Transferencia, efectivo, cheque..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRegisteringPayment(null)
                  setPaymentAmount('')
                  setPaymentDate((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })())
                  setPaymentNotes('')
                }}
                disabled={isRegisteringPayment}
              >
                Cancelar
              </Button>
              <Button onClick={handleRegisterPayment} disabled={isRegisteringPayment}>
                {isRegisteringPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <DollarSign className="w-4 h-4 mr-2" />
                    Registrar Abono
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Ver Historial de Pagos */}
      <Modal
        isOpen={!!viewingPayments}
        onClose={() => setViewingPayments(null)}
        title="Historial de Pagos"
        size="lg"
      >
        {viewingPayments && (
          <div className="space-y-4">
            {/* Resumen */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Proveedor</p>
                  <p className="font-medium">{viewingPayments.supplier?.businessName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total de la Compra</p>
                  <p className="font-bold text-lg">{formatCurrency(viewingPayments.total)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Pagado</p>
                  <p className="font-medium text-green-600">{formatCurrency(viewingPayments.paidAmount || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Saldo Pendiente</p>
                  <p className="font-medium text-red-600">
                    {formatCurrency((viewingPayments.total || 0) - (viewingPayments.paidAmount || 0))}
                  </p>
                </div>
              </div>
              {/* Barra de progreso */}
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Progreso de pago</span>
                  <span className="font-medium">
                    {Math.round(((viewingPayments.paidAmount || 0) / viewingPayments.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-green-500 h-2.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((viewingPayments.paidAmount || 0) / viewingPayments.total) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Lista de pagos */}
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Detalle de Abonos</h4>
              {(!viewingPayments.payments || viewingPayments.payments.length === 0) ? (
                <div className="text-center py-6 text-gray-500">
                  <DollarSign className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p>No hay pagos registrados</p>
                  {viewingPayments.paidAmount > 0 && (
                    <p className="text-sm mt-1">
                      (Pago registrado antes de la implementación del historial)
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {viewingPayments.payments.map((payment, idx) => {
                    const paymentDate = payment.date?.toDate
                      ? payment.date.toDate()
                      : new Date(payment.date)

                    const isEditing = editingPaymentDate?.paymentIndex === idx

                    return (
                      <div
                        key={payment.id || idx}
                        className="p-3 rounded-lg border bg-white border-gray-200 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                              <CheckCircle className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="font-medium">Abono #{idx + 1}</p>
                              <p className="text-sm text-gray-500">
                                {formatDate(paymentDate)}
                              </p>
                              {payment.notes && (
                                <p className="text-xs text-gray-400 mt-0.5">{payment.notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-green-600">+{formatCurrency(payment.amount)}</span>
                            <button
                              onClick={() => {
                                const pd = paymentDate instanceof Date ? paymentDate : new Date(paymentDate)
                                const dateStr = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`
                                setEditingPaymentDate({ paymentIndex: idx, date: dateStr })
                              }}
                              className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                              title="Editar fecha"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {isEditing && (
                          <div className="flex items-center gap-2 pl-11">
                            <input
                              type="date"
                              value={editingPaymentDate.date}
                              onChange={e => setEditingPaymentDate(prev => ({ ...prev, date: e.target.value }))}
                              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                            <button
                              onClick={() => handleSavePaymentDate(viewingPayments, idx, editingPaymentDate.date)}
                              className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => setEditingPaymentDate(null)}
                              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Botón para agregar pago si aún hay saldo pendiente */}
            {viewingPayments.paymentStatus === 'pending' && (
              <div className="flex justify-center pt-2">
                <Button
                  onClick={() => {
                    setViewingPayments(null)
                    openPaymentModal(viewingPayments)
                  }}
                  className="w-full"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Registrar Nuevo Abono
                </Button>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setViewingPayments(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
