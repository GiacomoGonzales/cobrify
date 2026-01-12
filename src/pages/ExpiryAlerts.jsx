import { useState, useEffect } from 'react'
import { AlertTriangle, Calendar, Package, Clock, CheckCircle, XCircle, Filter, Download, Search, ChevronDown, ChevronUp, Pill, FlaskConical } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatCurrency } from '@/lib/utils'

function ExpiryAlerts() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('all') // all, expired, 30days, 60days, 90days
  const [sortBy, setSortBy] = useState('expiration') // expiration, name, stock
  const [sortDirection, setSortDirection] = useState('asc')

  const businessId = getBusinessId()

  useEffect(() => {
    if (isDemoMode) {
      loadDemoProducts()
    } else if (businessId) {
      loadProducts()
    }
  }, [businessId, isDemoMode])

  // Cargar productos del demo
  const loadDemoProducts = () => {
    setLoading(true)
    try {
      const productsData = demoData?.products || []
      const allItems = []

      productsData.forEach(product => {
        // Si tiene múltiples lotes, crear una entrada por cada lote con stock
        if (product.batches && product.batches.length > 0) {
          product.batches.forEach(batch => {
            if (batch.quantity > 0 && (batch.expiryDate || batch.expirationDate)) {
              allItems.push({
                ...product,
                batchId: batch.id,
                batchNumber: batch.lotNumber || batch.batchNumber,
                expirationDate: batch.expiryDate || batch.expirationDate,
                batchQuantity: batch.quantity,
                batchCost: batch.costPrice,
                isBatch: true,
                stock: batch.quantity
              })
            }
          })
        }
      })

      setProducts(allItems)
    } catch (error) {
      console.error('Error al cargar productos demo:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadProducts = async () => {
    if (!businessId) return

    try {
      setLoading(true)
      const productsRef = collection(db, 'businesses', businessId, 'products')
      const snapshot = await getDocs(productsRef)

      // Procesar productos y expandir lotes individuales
      const allItems = []

      snapshot.docs.forEach(doc => {
        const product = { id: doc.id, ...doc.data() }

        // Si tiene múltiples lotes, crear una entrada por cada lote con stock
        if (product.batches && product.batches.length > 0) {
          product.batches.forEach(batch => {
            if (batch.quantity > 0 && batch.expirationDate) {
              allItems.push({
                ...product,
                // Sobrescribir con datos del lote específico
                batchId: batch.id,
                batchNumber: batch.batchNumber,
                expirationDate: batch.expirationDate,
                batchQuantity: batch.quantity,
                batchCost: batch.costPrice,
                isBatch: true, // Marcador para identificar que es un lote
                stock: batch.quantity // Usar stock del lote
              })
            }
          })
        } else if (product.trackExpiration && product.expirationDate) {
          // Producto sin sistema de lotes múltiples (legacy)
          allItems.push({
            ...product,
            isBatch: false
          })
        }
      })

      setProducts(allItems)
    } catch (error) {
      console.error('Error al cargar productos:', error)
      toast.error('Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  // Calcular estado de vencimiento
  const getExpirationStatus = (expirationDate) => {
    if (!expirationDate) return null

    const expDate = expirationDate.toDate ? expirationDate.toDate() : new Date(expirationDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    expDate.setHours(0, 0, 0, 0)

    const diffTime = expDate - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return { status: 'expired', days: Math.abs(diffDays), label: 'Vencido', color: 'red' }
    } else if (diffDays <= 30) {
      return { status: '30days', days: diffDays, label: `${diffDays} días`, color: 'red' }
    } else if (diffDays <= 60) {
      return { status: '60days', days: diffDays, label: `${diffDays} días`, color: 'orange' }
    } else if (diffDays <= 90) {
      return { status: '90days', days: diffDays, label: `${diffDays} días`, color: 'yellow' }
    } else {
      return { status: 'ok', days: diffDays, label: `${diffDays} días`, color: 'green' }
    }
  }

  // Formatear fecha
  const formatDate = (date) => {
    if (!date) return '-'
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Filtrar y ordenar productos
  const filteredProducts = products
    .map(p => ({
      ...p,
      expirationInfo: getExpirationStatus(p.expirationDate)
    }))
    .filter(p => {
      // Filtro de búsqueda
      const matchesSearch =
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.genericName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.batchNumber?.toLowerCase().includes(searchTerm.toLowerCase())

      if (!matchesSearch) return false

      // Filtro de estado
      if (selectedFilter === 'all') return true
      if (selectedFilter === 'expired') return p.expirationInfo?.status === 'expired'
      if (selectedFilter === '30days') return p.expirationInfo?.status === '30days' || p.expirationInfo?.status === 'expired'
      if (selectedFilter === '60days') return ['expired', '30days', '60days'].includes(p.expirationInfo?.status)
      if (selectedFilter === '90days') return ['expired', '30days', '60days', '90days'].includes(p.expirationInfo?.status)

      return true
    })
    .sort((a, b) => {
      let comparison = 0

      if (sortBy === 'expiration') {
        comparison = (a.expirationInfo?.days || 9999) - (b.expirationInfo?.days || 9999)
      } else if (sortBy === 'name') {
        comparison = (a.name || '').localeCompare(b.name || '')
      } else if (sortBy === 'stock') {
        comparison = (a.stock || 0) - (b.stock || 0)
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

  // Estadísticas
  const stats = {
    expired: products.filter(p => getExpirationStatus(p.expirationDate)?.status === 'expired').length,
    in30days: products.filter(p => getExpirationStatus(p.expirationDate)?.status === '30days').length,
    in60days: products.filter(p => getExpirationStatus(p.expirationDate)?.status === '60days').length,
    in90days: products.filter(p => getExpirationStatus(p.expirationDate)?.status === '90days').length,
    ok: products.filter(p => getExpirationStatus(p.expirationDate)?.status === 'ok').length,
  }

  // Calcular valor en riesgo (productos por vencer en 90 días)
  const valueAtRisk = products
    .filter(p => {
      const status = getExpirationStatus(p.expirationDate)?.status
      return ['expired', '30days', '60days', '90days'].includes(status)
    })
    .reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0)

  // Exportar a CSV
  const exportToCSV = () => {
    const headers = ['Código', 'Nombre', 'Nombre Genérico', 'Lote', 'Vencimiento', 'Días Restantes', 'Stock', 'Precio', 'Valor']
    const rows = filteredProducts.map(p => [
      p.code || '',
      p.name || '',
      p.genericName || '',
      p.batchNumber || '',
      formatDate(p.expirationDate),
      p.expirationInfo?.days || 0,
      p.stock || 0,
      p.price || 0,
      (p.price || 0) * (p.stock || 0)
    ])

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `alertas-vencimiento-${new Date().toISOString().split('T')[0]}.csv`
    link.click()

    toast.success('Archivo exportado correctamente')
  }

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDirection('asc')
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
            Alertas de Vencimiento
          </h1>
          <p className="text-gray-600 mt-1">
            Control de productos próximos a vencer o vencidos
          </p>
        </div>
        <button
          onClick={exportToCSV}
          disabled={filteredProducts.length === 0}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-5 h-5" />
          Exportar CSV
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <button
          onClick={() => setSelectedFilter('expired')}
          className={`p-4 rounded-lg border-2 transition-all text-left ${
            selectedFilter === 'expired' ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:border-red-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm text-gray-600">Vencidos</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
        </button>

        <button
          onClick={() => setSelectedFilter('30days')}
          className={`p-4 rounded-lg border-2 transition-all text-left ${
            selectedFilter === '30days' ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:border-red-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-5 h-5 text-red-500" />
            <span className="text-sm text-gray-600">30 días</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{stats.in30days}</p>
        </button>

        <button
          onClick={() => setSelectedFilter('60days')}
          className={`p-4 rounded-lg border-2 transition-all text-left ${
            selectedFilter === '60days' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-5 h-5 text-orange-500" />
            <span className="text-sm text-gray-600">60 días</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{stats.in60days}</p>
        </button>

        <button
          onClick={() => setSelectedFilter('90days')}
          className={`p-4 rounded-lg border-2 transition-all text-left ${
            selectedFilter === '90days' ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200 bg-white hover:border-yellow-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-5 h-5 text-yellow-500" />
            <span className="text-sm text-gray-600">90 días</span>
          </div>
          <p className="text-2xl font-bold text-yellow-600">{stats.in90days}</p>
        </button>

        <button
          onClick={() => setSelectedFilter('all')}
          className={`p-4 rounded-lg border-2 transition-all text-left ${
            selectedFilter === 'all' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm text-gray-600">Todos</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{products.length}</p>
        </button>
      </div>

      {/* Valor en riesgo */}
      {valueAtRisk > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">Valor en riesgo (próximos 90 días)</p>
              <p className="text-2xl font-bold text-amber-900">{formatCurrency(valueAtRisk)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Búsqueda */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, código, genérico o lote..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>
      </div>

      {/* Lista de productos */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando productos...</p>
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay productos con control de vencimiento
            </h3>
            <p className="text-gray-600">
              Activa el control de vencimiento en los productos para ver alertas aquí
            </p>
          </CardContent>
        </Card>
      ) : filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay productos en esta categoría
            </h3>
            <p className="text-gray-600">
              {selectedFilter === 'expired' && 'No tienes productos vencidos'}
              {selectedFilter === '30days' && 'No tienes productos por vencer en los próximos 30 días'}
              {selectedFilter === '60days' && 'No tienes productos por vencer en los próximos 60 días'}
              {selectedFilter === '90days' && 'No tienes productos por vencer en los próximos 90 días'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Header de tabla */}
          <div className="hidden md:grid md:grid-cols-12 gap-4 p-4 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
            <div className="col-span-4">
              <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-gray-900">
                Producto
                {sortBy === 'name' && (sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
              </button>
            </div>
            <div className="col-span-2">Lote</div>
            <div className="col-span-2">
              <button onClick={() => toggleSort('expiration')} className="flex items-center gap-1 hover:text-gray-900">
                Vencimiento
                {sortBy === 'expiration' && (sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
              </button>
            </div>
            <div className="col-span-1">
              <button onClick={() => toggleSort('stock')} className="flex items-center gap-1 hover:text-gray-900">
                Stock
                {sortBy === 'stock' && (sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
              </button>
            </div>
            <div className="col-span-2">Valor</div>
            <div className="col-span-1">Estado</div>
          </div>

          {/* Filas */}
          <div className="divide-y divide-gray-100">
            {filteredProducts.map(product => (
              <div
                key={product.id}
                className={`p-4 hover:bg-gray-50 ${
                  product.expirationInfo?.status === 'expired' ? 'bg-red-50/50' : ''
                }`}
              >
                {/* Vista móvil */}
                <div className="md:hidden space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        product.expirationInfo?.status === 'expired' ? 'bg-red-100' :
                        product.expirationInfo?.status === '30days' ? 'bg-red-100' :
                        product.expirationInfo?.status === '60days' ? 'bg-orange-100' :
                        product.expirationInfo?.status === '90days' ? 'bg-yellow-100' : 'bg-green-100'
                      }`}>
                        <Pill className={`w-5 h-5 ${
                          product.expirationInfo?.status === 'expired' ? 'text-red-600' :
                          product.expirationInfo?.status === '30days' ? 'text-red-600' :
                          product.expirationInfo?.status === '60days' ? 'text-orange-600' :
                          product.expirationInfo?.status === '90days' ? 'text-yellow-600' : 'text-green-600'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{product.name}</p>
                        {product.genericName && (
                          <p className="text-xs text-gray-500">{product.genericName} {product.concentration}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={
                      product.expirationInfo?.status === 'expired' ? 'danger' :
                      product.expirationInfo?.status === '30days' ? 'danger' :
                      product.expirationInfo?.status === '60days' ? 'warning' :
                      product.expirationInfo?.status === '90days' ? 'warning' : 'success'
                    }>
                      {product.expirationInfo?.status === 'expired' ? 'VENCIDO' : product.expirationInfo?.label}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Lote: {product.batchNumber || '-'}</span>
                    <span className="text-gray-500">Vence: {formatDate(product.expirationDate)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Stock: {product.stock || 0}</span>
                    <span className="font-medium">{formatCurrency((product.price || 0) * (product.stock || 0))}</span>
                  </div>
                </div>

                {/* Vista desktop */}
                <div className="hidden md:grid md:grid-cols-12 gap-4 items-center">
                  <div className="col-span-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      product.expirationInfo?.status === 'expired' ? 'bg-red-100' :
                      product.expirationInfo?.status === '30days' ? 'bg-red-100' :
                      product.expirationInfo?.status === '60days' ? 'bg-orange-100' :
                      product.expirationInfo?.status === '90days' ? 'bg-yellow-100' : 'bg-green-100'
                    }`}>
                      <Pill className={`w-5 h-5 ${
                        product.expirationInfo?.status === 'expired' ? 'text-red-600' :
                        product.expirationInfo?.status === '30days' ? 'text-red-600' :
                        product.expirationInfo?.status === '60days' ? 'text-orange-600' :
                        product.expirationInfo?.status === '90days' ? 'text-yellow-600' : 'text-green-600'
                      }`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{product.name}</p>
                      {product.genericName && (
                        <p className="text-xs text-gray-500 truncate">{product.genericName} {product.concentration}</p>
                      )}
                      {product.code && (
                        <p className="text-xs text-gray-400">Código: {product.code}</p>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 text-sm text-gray-600">
                    {product.batchNumber || '-'}
                  </div>
                  <div className="col-span-2 text-sm">
                    <p className={`font-medium ${
                      product.expirationInfo?.status === 'expired' ? 'text-red-600' :
                      product.expirationInfo?.status === '30days' ? 'text-red-600' :
                      product.expirationInfo?.status === '60days' ? 'text-orange-600' :
                      product.expirationInfo?.status === '90days' ? 'text-yellow-600' : 'text-gray-900'
                    }`}>
                      {formatDate(product.expirationDate)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {product.expirationInfo?.status === 'expired'
                        ? `Hace ${product.expirationInfo.days} días`
                        : `En ${product.expirationInfo?.days} días`}
                    </p>
                  </div>
                  <div className="col-span-1 text-sm text-gray-900">
                    {product.stock || 0}
                  </div>
                  <div className="col-span-2 text-sm font-medium text-gray-900">
                    {formatCurrency((product.price || 0) * (product.stock || 0))}
                  </div>
                  <div className="col-span-1">
                    <Badge variant={
                      product.expirationInfo?.status === 'expired' ? 'danger' :
                      product.expirationInfo?.status === '30days' ? 'danger' :
                      product.expirationInfo?.status === '60days' ? 'warning' :
                      product.expirationInfo?.status === '90days' ? 'warning' : 'success'
                    } className="text-xs">
                      {product.expirationInfo?.status === 'expired' ? 'VENCIDO' :
                       product.expirationInfo?.status === 'ok' ? 'OK' :
                       `${product.expirationInfo?.days}d`}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ExpiryAlerts
