import React, { useState, useMemo, useRef } from 'react'
import {
  X, Search, Loader2, AlertTriangle, Trash2, ArrowRight, FileText, Package, Plus
} from 'lucide-react'
import { createPortal } from 'react-dom'
import Button from '@/components/ui/Button'
import { createMassTransfer } from '@/services/massTransferService'
import { downloadLogisticsMovementPDF } from '@/utils/logisticsPdfGenerator'

export default function MassTransferModal({
  isOpen,
  onClose,
  products,
  ingredients = [],
  warehouses,
  allWarehouses,
  branches,
  businessId,
  userId,
  userName,
  companySettings,
  onTransferCompleted,
}) {
  const [fromWarehouse, setFromWarehouse] = useState('')
  const [toWarehouse, setToWarehouse] = useState('')
  const [items, setItems] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [notes, setNotes] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [lastTransfer, setLastTransfer] = useState(null)
  const searchRef = useRef(null)

  const warehouseList = allWarehouses || warehouses || []

  // Agrupar almacenes por sucursal
  const groupedWarehouses = useMemo(() => {
    const groups = {}
    warehouseList.forEach(w => {
      const branchName = w.branchId
        ? (branches || []).find(b => b.id === w.branchId)?.name || 'Otra Sucursal'
        : 'Sucursal Principal'
      if (!groups[branchName]) groups[branchName] = []
      groups[branchName].push(w)
    })
    return groups
  }, [warehouseList, branches])

  // Productos e ingredientes con stock en almacén origen (incluye variantes)
  const availableProducts = useMemo(() => {
    if (!fromWarehouse) return []

    // Filtrar productos
    const filteredProducts = products.filter(p => {
      if (p.trackStock === false) return false
      // Productos con variantes: verificar si alguna variante tiene stock en este almacén
      if (p.hasVariants && p.variants?.length > 0) {
        return p.variants.some(v => {
          const ws = (v.warehouseStocks || []).find(s => s.warehouseId === fromWarehouse)
          return ws && ws.stock > 0
        })
      }
      const ws = p.warehouseStocks?.find(s => s.warehouseId === fromWarehouse)
      return ws && ws.stock > 0
    })

    // Filtrar ingredientes con stock en el almacén
    const filteredIngredients = (ingredients || []).filter(ing => {
      const ws = (ing.warehouseStocks || []).find(s => s.warehouseId === fromWarehouse)
      return ws && ws.stock > 0
    }).map(ing => ({
      ...ing,
      isIngredient: true,
      // Normalizar campos para compatibilidad
      code: ing.code || '',
      barcode: '',
    }))

    return [...filteredProducts, ...filteredIngredients]
  }, [products, ingredients, fromWarehouse])

  // Filtrar por búsqueda
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return []
    const terms = searchTerm.toLowerCase().split(' ').filter(Boolean)
    return availableProducts.filter(p => {
      const text = `${p.name} ${p.code || ''} ${p.barcode || ''}`.toLowerCase()
      return terms.every(t => text.includes(t))
    }).slice(0, 10)
  }, [availableProducts, searchTerm])

  if (!isOpen) return null

  const getWarehouseStock = (product) => {
    if (product.hasVariants && product.variants?.length > 0) {
      return product.variants.reduce((sum, v) => {
        const ws = (v.warehouseStocks || []).find(s => s.warehouseId === fromWarehouse)
        return sum + (ws?.stock || 0)
      }, 0)
    }
    const ws = product.warehouseStocks?.find(s => s.warehouseId === fromWarehouse)
    return ws?.stock || 0
  }

  const getIngredientWarehouseStock = (ingredient) => {
    const ws = (ingredient.warehouseStocks || []).find(s => s.warehouseId === fromWarehouse)
    return ws?.stock || 0
  }

  const addProduct = (product) => {
    // Si es ingrediente, agregar directamente (sin variantes ni lotes)
    if (product.isIngredient) {
      const existing = items.find(i => i.productId === product.id && i.isIngredient)
      if (existing) {
        const stock = getIngredientWarehouseStock(product)
        setItems(items.map(i =>
          i.productId === product.id && i.isIngredient
            ? { ...i, quantity: Math.min(i.quantity + 1, stock) }
            : i
        ))
      } else {
        const stock = getIngredientWarehouseStock(product)
        setItems([...items, {
          productId: product.id,
          productName: product.name,
          productCode: product.code || '',
          unit: product.purchaseUnit || 'und',
          quantity: 1,
          availableStock: stock,
          isIngredient: true,
          batchNumber: '',
          batchExpiration: null,
          batchData: null,
          batches: [],
          hasBatches: false,
          serials: [],
          hasSerials: false,
          selectedSerials: [],
        }])
      }
      setSearchTerm('')
      setShowDropdown(false)
      searchRef.current?.focus()
      return
    }

    // Productos con variantes: agregar una fila por cada variante con stock
    if (product.hasVariants && product.variants?.length > 0) {
      const variantRows = product.variants
        .filter(v => {
          const ws = (v.warehouseStocks || []).find(s => s.warehouseId === fromWarehouse)
          return ws && ws.stock > 0
        })
        .filter(v => !items.some(i => i.productId === product.id && i.variantSku === v.sku))
        .map(v => {
          const ws = (v.warehouseStocks || []).find(s => s.warehouseId === fromWarehouse)
          const variantLabel = Object.values(v.attributes || {}).join(' / ')
          return {
            productId: product.id,
            productName: product.name,
            productCode: product.code || '',
            unit: product.unit || 'und',
            quantity: 1,
            availableStock: ws?.stock || 0,
            variantSku: v.sku,
            variantLabel,
            isVariant: true,
            batchNumber: '',
            batchExpiration: null,
            batchData: null,
            batches: [],
            hasBatches: false,
            serials: (product.serials || []).filter(s => s.status === 'available' && s.variantSku === v.sku && (!s.warehouseId || s.warehouseId === fromWarehouse)),
            hasSerials: product.trackSerials && (product.serials || []).filter(s => s.status === 'available' && s.variantSku === v.sku && (!s.warehouseId || s.warehouseId === fromWarehouse)).length > 0,
            selectedSerials: [],
          }
        })

      if (variantRows.length > 0) {
        setItems([...items, ...variantRows])
      }
      setSearchTerm('')
      setShowDropdown(false)
      searchRef.current?.focus()
      return
    }

    const existing = items.find(i => i.productId === product.id && !i.batchNumber && !i.variantSku)
    if (existing && !(product.batches?.length > 0)) {
      setItems(items.map(i =>
        i.productId === product.id && !i.batchNumber && !i.variantSku
          ? { ...i, quantity: Math.min(i.quantity + 1, getWarehouseStock(product)) }
          : i
      ))
    } else {
      const stock = getWarehouseStock(product)
      const warehouseBatches = (product.batches || []).filter(b => b.quantity > 0 && (!b.warehouseId || b.warehouseId === fromWarehouse))
      const batchesTotal = warehouseBatches.reduce((sum, b) => sum + (b.quantity || 0), 0)
      const stockWithoutLot = Math.max(0, stock - batchesTotal)
      setItems([...items, {
        productId: product.id,
        productName: product.name,
        productCode: product.code || '',
        unit: product.unit || 'und',
        quantity: 1,
        availableStock: stock,
        stockWithoutLot,
        batchNumber: '',
        batchExpiration: null,
        batchData: null,
        batches: product.batches || [],
        hasBatches: warehouseBatches.length > 0,
        serials: (product.serials || []).filter(s => s.status === 'available' && (!s.warehouseId || s.warehouseId === fromWarehouse)),
        hasSerials: product.trackSerials && (product.serials || []).filter(s => s.status === 'available' && (!s.warehouseId || s.warehouseId === fromWarehouse)).length > 0,
        selectedSerials: [],
      }])
    }
    setSearchTerm('')
    setShowDropdown(false)
    searchRef.current?.focus()
  }

  const updateItemQuantity = (index, value, isIngredient = false) => {
    const qty = isIngredient ? (parseFloat(value) || 0) : (parseInt(value) || 0)
    setItems(items.map((item, i) => {
      if (i !== index) return item
      const maxStock = item.batchData ? item.batchData.quantity : item.availableStock
      return { ...item, quantity: Math.max(0, Math.min(qty, maxStock)) }
    }))
  }

  const updateItemBatch = (index, batchId) => {
    setItems(items.map((item, i) => {
      if (i !== index) return item
      // Si se selecciona "Sin lote"
      if (batchId === '__NO_LOT__') {
        return {
          ...item,
          batchNumber: '__NO_LOT__',
          batchData: { isNoLot: true, quantity: item.stockWithoutLot || 0 },
          batchExpiration: null,
          quantity: Math.min(item.quantity || 1, item.stockWithoutLot || 0),
        }
      }
      const batch = item.batches.find(b => (b.lotNumber || b.batchNumber || b.id) === batchId)
      return {
        ...item,
        batchNumber: batchId,
        batchData: batch || null,
        batchExpiration: batch ? (batch.expirationDate || batch.expiryDate) : null,
        quantity: batch ? Math.min(item.quantity || 1, batch.quantity) : item.quantity,
      }
    }))
  }

  const toggleSerial = (itemIndex, serialNumber) => {
    setItems(items.map((item, i) => {
      if (i !== itemIndex) return item
      const current = item.selectedSerials || []
      const isSelected = current.includes(serialNumber)
      const newSelected = isSelected
        ? current.filter(sn => sn !== serialNumber)
        : [...current, serialNumber]
      return {
        ...item,
        selectedSerials: newSelected,
        quantity: newSelected.length || 1,
      }
    }))
  }

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const resetForm = () => {
    setFromWarehouse('')
    setToWarehouse('')
    setItems([])
    setSearchTerm('')
    setNotes('')
    setShowConfirm(false)
    setLastTransfer(null)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const canTransfer = fromWarehouse && toWarehouse && fromWarehouse !== toWarehouse && items.length > 0 &&
    items.every(i => i.quantity > 0 && (!i.hasBatches || i.batchNumber) && (!i.hasSerials || i.selectedSerials?.length > 0))

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)

  const handleTransfer = async () => {
    setIsTransferring(true)
    try {
      const fromWh = warehouseList.find(w => w.id === fromWarehouse)
      const toWh = warehouseList.find(w => w.id === toWarehouse)

      const result = await createMassTransfer(businessId, {
        fromWarehouseId: fromWarehouse,
        fromWarehouseName: fromWh?.name || '',
        toWarehouseId: toWarehouse,
        toWarehouseName: toWh?.name || '',
        items: items.map(i => ({
          productId: i.productId,
          productName: i.productName,
          productCode: i.productCode,
          quantity: i.quantity,
          unit: i.unit,
          batchNumber: i.batchNumber || null,
          batchExpiration: i.batchExpiration || null,
          batchData: i.batchData || null,
          batches: i.batches || [],
          variantSku: i.variantSku || null,
          variantLabel: i.variantLabel || null,
          serialNumbers: i.selectedSerials || [],
          serials: i.hasSerials ? products.find(p => p.id === i.productId)?.serials || [] : [],
          isIngredient: i.isIngredient || false,
        })),
        notes,
        userId,
        userName,
      })

      if (result.success) {
        setLastTransfer({
          number: result.number,
          fromWarehouseName: fromWh?.name,
          toWarehouseName: toWh?.name,
          items: items.map(i => ({
            productId: i.productId,
            productName: i.productName,
            productCode: i.productCode,
            quantity: i.quantity,
            unit: i.unit,
            batchNumber: i.batchNumber || null,
            batchExpiration: i.batchExpiration || null,
            variantSku: i.variantSku || null,
            variantLabel: i.variantLabel || null,
            selectedSerials: i.selectedSerials || [],
          })),
          totalItems,
          totalProducts: items.length,
          notes,
          userName,
          createdAt: new Date(),
        })
        setShowConfirm(false)
      } else {
        alert('Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error al realizar la transferencia')
    } finally {
      setIsTransferring(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!lastTransfer) return
    await downloadLogisticsMovementPDF(lastTransfer, companySettings || {}, 'transfer')
  }

  const handleFinish = () => {
    onTransferCompleted?.()
    handleClose()
  }

  const formatBatchDate = (date) => {
    if (!date) return ''
    if (date.toDate) return date.toDate().toLocaleDateString('es-PE')
    if (date.seconds) return new Date(date.seconds * 1000).toLocaleDateString('es-PE')
    return new Date(date).toLocaleDateString('es-PE')
  }

  // ===== PANTALLA DE ÉXITO =====
  if (lastTransfer) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Transferencia Completada</h2>
          <p className="text-2xl font-bold text-primary-600 mb-2">{lastTransfer.number}</p>
          <p className="text-sm text-gray-600 mb-1">
            {lastTransfer.fromWarehouseName} → {lastTransfer.toWarehouseName}
          </p>
          <p className="text-sm text-gray-600 mb-6">
            {lastTransfer.totalProducts} producto{lastTransfer.totalProducts !== 1 ? 's' : ''} - {lastTransfer.totalItems} unidades
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={handleDownloadPDF} className="w-full">
              <FileText className="w-4 h-4 mr-2" />
              Descargar PDF
            </Button>
            <Button variant="outline" onClick={handleFinish} className="w-full">
              Cerrar
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // ===== MODAL DE CONFIRMACIÓN =====
  if (showConfirm) {
    const fromWh = warehouseList.find(w => w.id === fromWarehouse)
    const toWh = warehouseList.find(w => w.id === toWarehouse)
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            <h2 className="text-lg font-bold">Confirmar Transferencia</h2>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
            <p><strong>Origen:</strong> {fromWh?.name}</p>
            <p><strong>Destino:</strong> {toWh?.name}</p>
            <p><strong>Productos:</strong> {items.length} - <strong>Total:</strong> {totalItems} unidades</p>
          </div>
          <div className="border rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2">Producto</th>
                  <th className="text-center p-2 w-16">Cant.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{item.productName}</div>
                      {item.variantSku && <div className="text-xs text-purple-600">{item.variantSku} — {item.variantLabel}</div>}
                      {item.batchNumber && <div className="text-xs text-gray-500">Lote: {item.batchNumber}</div>}
                    </td>
                    <td className="text-center p-2 font-bold">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowConfirm(false)} className="flex-1" disabled={isTransferring}>
              Cancelar
            </Button>
            <Button onClick={handleTransfer} className="flex-1" disabled={isTransferring}>
              {isTransferring ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Transfiriendo...</> : 'Confirmar'}
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // ===== MODAL PRINCIPAL =====
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] lg:h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Transferencia Masiva</h2>
              <p className="text-sm text-gray-500">Transfiere múltiples productos entre almacenes</p>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Selección de almacenes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Almacén Origen *</label>
                <select
                  value={fromWarehouse}
                  onChange={e => {
                    setFromWarehouse(e.target.value)
                    setItems([])
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Seleccionar...</option>
                  {Object.entries(groupedWarehouses).map(([group, whs]) => (
                    <optgroup key={group} label={group}>
                      {whs.filter(w => w.id !== toWarehouse).map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Almacén Destino *</label>
                <select
                  value={toWarehouse}
                  onChange={e => setToWarehouse(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Seleccionar...</option>
                  {Object.entries(groupedWarehouses).map(([group, whs]) => (
                    <optgroup key={group} label={group}>
                      {whs.filter(w => w.id !== fromWarehouse).map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            {fromWarehouse && toWarehouse && fromWarehouse !== toWarehouse && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 text-sm text-blue-800">
                <ArrowRight className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>{warehouseList.find(w => w.id === fromWarehouse)?.name}</strong>
                  {' → '}
                  <strong>{warehouseList.find(w => w.id === toWarehouse)?.name}</strong>
                  {' | '}
                  {availableProducts.length} items con stock (productos e ingredientes)
                </span>
              </div>
            )}

            {/* Buscador de productos */}
            {fromWarehouse && toWarehouse && fromWarehouse !== toWarehouse && (
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Agregar Productos</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchTerm}
                    onChange={e => {
                      setSearchTerm(e.target.value)
                      setShowDropdown(e.target.value.length > 0)
                    }}
                    onFocus={() => searchTerm && setShowDropdown(true)}
                    placeholder="Buscar por nombre, código..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                {showDropdown && filteredProducts.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[40vh] overflow-y-auto">
                    {filteredProducts.map(p => {
                      const stock = p.isIngredient ? getIngredientWarehouseStock(p) : getWarehouseStock(p)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => addProduct(p)}
                          className={`w-full text-left px-3 py-2 hover:bg-primary-50 flex items-center justify-between text-sm border-b last:border-b-0 ${p.isIngredient ? 'bg-orange-50/50' : ''}`}
                        >
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {p.name}
                              {p.isIngredient && (
                                <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded">
                                  Ingrediente
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">{p.code || (p.isIngredient ? p.purchaseUnit : 'Sin código')}</div>
                          </div>
                          <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                            Stock: {stock}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {showDropdown && searchTerm && filteredProducts.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-500 text-center">
                    No se encontraron productos ni ingredientes con stock
                  </div>
                )}
              </div>
            )}

            {/* Tabla de items */}
            {items.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                {/* Desktop */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 pl-3">Producto</th>
                        <th className="text-left p-2">Lote</th>
                        <th className="text-center p-2 w-20">Stock</th>
                        <th className="text-center p-2 w-24">Cantidad</th>
                        <th className="text-center p-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <React.Fragment key={idx}>
                        <tr className={`border-t hover:bg-gray-50 ${item.isVariant ? 'bg-purple-50/30' : ''} ${item.isIngredient ? 'bg-orange-50/30' : ''}`}>
                          <td className="p-2 pl-3">
                            <div className="font-medium flex items-center gap-2">
                              {item.productName}
                              {item.isIngredient && (
                                <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded">
                                  Ing.
                                </span>
                              )}
                            </div>
                            {item.isVariant && (
                              <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                                {item.variantSku} — {item.variantLabel}
                              </span>
                            )}
                            {!item.isVariant && !item.isIngredient && <div className="text-xs text-gray-400">{item.productCode || ''}</div>}
                            {item.isIngredient && <div className="text-xs text-gray-400">{item.unit}</div>}
                          </td>
                          <td className="p-2">
                            {item.hasBatches ? (
                              <select
                                value={item.batchNumber}
                                onChange={e => updateItemBatch(idx, e.target.value)}
                                className={`w-full px-2 py-1 border rounded text-xs ${!item.batchNumber ? 'border-red-300 bg-red-50' : item.batchNumber === '__NO_LOT__' ? 'border-amber-300 bg-amber-50' : 'border-gray-300'}`}
                              >
                                <option value="">Seleccionar lote...</option>
                                {item.stockWithoutLot > 0 && (
                                  <option value="__NO_LOT__">Sin lote (stock inicial) - {item.stockWithoutLot} uds</option>
                                )}
                                {item.batches.filter(b => b.quantity > 0 && (!b.warehouseId || b.warehouseId === fromWarehouse)).map((b, bi) => {
                                  const bId = b.lotNumber || b.batchNumber || b.id
                                  const expDate = formatBatchDate(b.expirationDate || b.expiryDate)
                                  return (
                                    <option key={bi} value={bId}>
                                      {bId} {expDate ? `(${expDate})` : ''} - {b.quantity} uds
                                    </option>
                                  )
                                })}
                              </select>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="text-center p-2 text-xs font-semibold text-gray-600">
                            {item.batchData ? item.batchData.quantity : item.availableStock}
                          </td>
                          <td className="text-center p-2">
                            <input
                              type="number"
                              min={item.isIngredient ? "0.01" : "1"}
                              step={item.isIngredient ? "0.01" : "1"}
                              max={item.batchData ? item.batchData.quantity : item.availableStock}
                              value={item.quantity}
                              onChange={e => updateItemQuantity(idx, e.target.value, item.isIngredient)}
                              disabled={item.hasSerials}
                              className={`w-20 px-2 py-1 border border-gray-300 rounded text-center text-sm focus:ring-2 focus:ring-primary-500 ${item.hasSerials ? 'bg-gray-100' : ''}`}
                            />
                          </td>
                          <td className="text-center p-2">
                            <button onClick={() => removeItem(idx)} className="p-1 hover:bg-red-50 rounded text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        {item.hasSerials && (
                          <tr className="bg-amber-50/50 border-t border-amber-200">
                            <td colSpan={5} className="px-3 py-2">
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-medium text-amber-700 mt-0.5 whitespace-nowrap">Series:</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {item.serials.map((s) => {
                                    const isSelected = (item.selectedSerials || []).includes(s.serialNumber)
                                    return (
                                      <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => toggleSerial(idx, s.serialNumber)}
                                        className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                                          isSelected
                                            ? 'bg-amber-600 text-white border-amber-600'
                                            : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400'
                                        }`}
                                      >
                                        {s.serialNumber}
                                      </button>
                                    )
                                  })}
                                </div>
                                {(item.selectedSerials || []).length > 0 && (
                                  <span className="text-xs text-amber-600 whitespace-nowrap">({item.selectedSerials.length} sel.)</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile */}
                <div className="sm:hidden divide-y">
                  {items.map((item, idx) => (
                    <div key={idx} className={`p-3 space-y-2 ${item.isIngredient ? 'bg-orange-50/30' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-sm flex items-center gap-2">
                            {item.productName}
                            {item.isIngredient && (
                              <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded">
                                Ing.
                              </span>
                            )}
                          </div>
                          {item.isVariant && (
                            <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                              {item.variantSku} — {item.variantLabel}
                            </span>
                          )}
                          <div className="text-xs text-gray-400">
                            {item.isIngredient ? item.unit : item.productCode} | Stock: {item.batchData ? item.batchData.quantity : item.availableStock}
                          </div>
                        </div>
                        <button onClick={() => removeItem(idx)} className="p-1 hover:bg-red-50 rounded text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {item.hasBatches && (
                        <select
                          value={item.batchNumber}
                          onChange={e => updateItemBatch(idx, e.target.value)}
                          className={`w-full px-2 py-1.5 border rounded text-xs ${!item.batchNumber ? 'border-red-300 bg-red-50' : item.batchNumber === '__NO_LOT__' ? 'border-amber-300 bg-amber-50' : 'border-gray-300'}`}
                        >
                          <option value="">Seleccionar lote...</option>
                          {item.stockWithoutLot > 0 && (
                            <option value="__NO_LOT__">Sin lote (stock inicial) - {item.stockWithoutLot} uds</option>
                          )}
                          {item.batches.filter(b => b.quantity > 0 && (!b.warehouseId || b.warehouseId === fromWarehouse)).map((b, bi) => {
                            const bId = b.lotNumber || b.batchNumber || b.id
                            const expDate = formatBatchDate(b.expirationDate || b.expiryDate)
                            return (
                              <option key={bi} value={bId}>
                                {bId} {expDate ? `(${expDate})` : ''} - {b.quantity} uds
                              </option>
                            )
                          })}
                        </select>
                      )}
                      {item.hasSerials && (
                        <div>
                          <span className="text-xs font-medium text-amber-700 mb-1 block">Series a transferir:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.serials.map((s) => {
                              const isSelected = (item.selectedSerials || []).includes(s.serialNumber)
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => toggleSerial(idx, s.serialNumber)}
                                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                                    isSelected
                                      ? 'bg-amber-600 text-white border-amber-600'
                                      : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400'
                                  }`}
                                >
                                  {s.serialNumber}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Cantidad:</span>
                        <input
                          type="number"
                          min={item.isIngredient ? "0.01" : "1"}
                          step={item.isIngredient ? "0.01" : "1"}
                          max={item.batchData ? item.batchData.quantity : item.availableStock}
                          value={item.quantity}
                          onChange={e => updateItemQuantity(idx, e.target.value, item.isIngredient)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                          disabled={item.hasSerials}
                        />
                        {item.isIngredient && <span className="text-xs text-gray-500">{item.unit}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Footer resumen */}
                <div className="bg-gray-50 px-3 py-2 border-t flex justify-between text-sm font-medium">
                  <span>{items.length} producto{items.length !== 1 ? 's' : ''}</span>
                  <span>{totalItems} unidades</span>
                </div>
              </div>
            )}

            {/* Notas */}
            {items.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Observaciones sobre la transferencia..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-4 border-t flex-shrink-0">
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button onClick={() => setShowConfirm(true)} disabled={!canTransfer}>
              <ArrowRight className="w-4 h-4 mr-2" />
              Transferir ({items.length} producto{items.length !== 1 ? 's' : ''})
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
