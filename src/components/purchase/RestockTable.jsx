import { useState, useMemo, useEffect } from 'react'
import {
  X, Package, CheckSquare, Square, AlertTriangle, TrendingDown, Search,
  FileText, ShoppingCart, Loader2,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/utils'
import { createPurchaseOrder, getNextPurchaseOrderNumber } from '@/services/purchaseOrderService'
import { getWarehouses } from '@/services/warehouseService'
import { useToast } from '@/contexts/ToastContext'

/**
 * Inputs editables DEFINIDOS A NIVEL MÓDULO (no dentro del componente) para
 * que React los identifique como el mismo type entre renders y el <input> no
 * pierda el focus en cada tecla (mismo patrón que PriceUpdateTable).
 */
function QtyCell({ value, dirty, onChange }) {
  return (
    <input
      type="number" step="any" min="0" inputMode="decimal"
      value={value === '' || value === null || value === undefined ? '' : value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-20 text-center px-2 py-1.5 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 ${
        dirty ? 'border-amber-400 focus:ring-amber-400 bg-white' : 'border-gray-300 focus:ring-primary-500'
      }`}
    />
  )
}

function CostCell({ value, dirty, onChange, currency }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <span className="text-xs text-gray-400">{currency}</span>
      <input
        type="number" step="0.01" min="0" inputMode="decimal"
        value={value === '' || value === null || value === undefined ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-24 text-right px-2 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
          dirty ? 'border-amber-400 focus:ring-amber-400 bg-white font-semibold' : 'border-gray-300 focus:ring-primary-500'
        }`}
      />
    </div>
  )
}

/**
 * Lista de reabastecimiento — vista enfocada del módulo Órdenes de Compra.
 *
 * Reemplaza el proceso manual del usuario ("filtro los agotados y stock bajo
 * y anoto en una hoja para pedir al proveedor"): detecta los productos
 * AGOTADOS y con STOCK BAJO (misma lógica que Inventario: stock real vs
 * minStock, default 3), los pre-selecciona con una cantidad sugerida para
 * volver al mínimo, y deja editar cantidad y costo con la dinámica de
 * "Actualizar precios" (tabla editable en lote, celdas dirty en ámbar).
 *
 * Parte 1: la lista editable con totales. Parte 2 agrega: crear orden de
 * compra en borrador + PDF directo (de ahí el ciclo existente: enviar,
 * recibir y convertir en compra).
 */

// Stock real del producto: variantes > warehouseStocks > stock general.
// null = sin control de stock (no aplica reabastecimiento).
// warehouseId: si se indica, solo cuenta el stock de ESE almacén (los
// productos sin desglose por almacén caen al stock general).
const getRealStock = (item, warehouseId = null) => {
  const sumWs = (list) => {
    const arr = list || []
    if (arr.length === 0) return null
    const filtered = warehouseId ? arr.filter(ws => ws.warehouseId === warehouseId) : arr
    return filtered.reduce((sum, ws) => sum + (ws.stock || 0), 0)
  }
  if (item.hasVariants && item.variants?.length > 0) {
    return item.variants.reduce((sum, v) => {
      const ws = sumWs(v.warehouseStocks)
      return sum + (ws !== null ? ws : (v.stock || 0))
    }, 0)
  }
  const ws = sumWs(item.warehouseStocks)
  if (ws !== null) return ws
  if (item.stock === null || item.stock === undefined) return null
  return item.stock || 0
}

const getMinStock = (product) => {
  const n = Number(product?.minStock)
  return Number.isFinite(n) && n >= 0 ? n : 3
}

// Normalización simple para búsqueda sin tildes
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export default function RestockTable({
  products = [],
  suppliers = [],
  businessId,
  businessName = '',
  baseCurrency = 'PEN',
  onClose,
  onCreated,
}) {
  const toast = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | out | low
  const [selected, setSelected] = useState(null) // null = aún no inicializado (pre-seleccionar todo)
  const [edits, setEdits] = useState({}) // { [productId]: { qty?: string, cost?: string } }
  const [supplierId, setSupplierId] = useState('')
  const [onlySupplierProducts, setOnlySupplierProducts] = useState(false)
  const [warehouseId, setWarehouseId] = useState('') // '' = todos los almacenes
  const [warehouses, setWarehouses] = useState([])
  const [visibleCount, setVisibleCount] = useState(50)
  const [isCreating, setIsCreating] = useState(false)

  // Almacenes (para evaluar el reabastecimiento por sede). Silencioso si falla.
  useEffect(() => {
    if (!businessId) return
    getWarehouses(businessId)
      .then(res => { if (res.success) setWarehouses(res.data || []) })
      .catch(() => {})
  }, [businessId])

  // Productos que necesitan reabastecimiento (agotados o bajo el mínimo),
  // con cantidad sugerida = lo que falta para volver al mínimo (mínimo 1).
  // Precio sugerido: ÚLTIMO precio de compra real (lastPurchasePrice, lo
  // sella cada compra) y si no existe, el costo promedio del producto.
  const rows = useMemo(() => {
    const list = []
    for (const p of products) {
      if (p.isActive === false) continue
      const stock = getRealStock(p, warehouseId || null)
      if (stock === null) continue // sin control de stock
      const minStock = getMinStock(p)
      if (stock > minStock) continue
      const lastPrice = Number(p.lastPurchasePrice)
      const cost = lastPrice > 0
        ? Math.round(lastPrice * 100) / 100
        : (Number(p.cost) > 0 ? Math.round(Number(p.cost) * 100) / 100 : '')
      list.push({
        id: p.id,
        name: p.name,
        sku: p.sku || p.code || '',
        unit: p.unit || 'NIU',
        stock,
        minStock,
        isOut: stock === 0,
        suggestedQty: Math.max(minStock - stock, 1),
        cost,
        lastSupplierName: p.lastSupplier?.businessName || '',
        lastSupplierId: p.lastSupplier?.id || '',
        product: p,
      })
    }
    // Agotados primero, luego por menor cobertura relativa
    list.sort((a, b) => (a.isOut === b.isOut ? a.stock / (a.minStock || 1) - b.stock / (b.minStock || 1) : a.isOut ? -1 : 1))
    return list
  }, [products, warehouseId])

  // Pre-selección inicial: TODOS los que necesitan reabastecimiento
  const selectedSet = selected ?? new Set(rows.map(r => r.id))

  const filteredRows = useMemo(() => {
    const q = norm(searchTerm.trim())
    return rows.filter(r => {
      if (statusFilter === 'out' && !r.isOut) return false
      if (statusFilter === 'low' && r.isOut) return false
      if (onlySupplierProducts && supplierId && r.lastSupplierId !== supplierId) return false
      if (q && !norm(`${r.name} ${r.sku}`).includes(q)) return false
      return true
    })
  }, [rows, searchTerm, statusFilter, onlySupplierProducts, supplierId])

  const visibleRows = filteredRows.slice(0, visibleCount)

  const getQty = (row) => {
    const e = edits[row.id]
    if (e && e.qty !== undefined) return e.qty
    return row.suggestedQty
  }
  const getCost = (row) => {
    const e = edits[row.id]
    if (e && e.cost !== undefined) return e.cost
    return row.cost
  }

  const setEdit = (id, field, value) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const toggleRow = (id) => {
    const next = new Set(selectedSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every(r => selectedSet.has(r.id))
  const toggleAllFiltered = () => {
    const next = new Set(selectedSet)
    if (allFilteredSelected) filteredRows.forEach(r => next.delete(r.id))
    else filteredRows.forEach(r => next.add(r.id))
    setSelected(next)
  }

  // Totales de lo seleccionado
  const totals = useMemo(() => {
    let count = 0
    let total = 0
    for (const r of rows) {
      if (!selectedSet.has(r.id)) continue
      const qty = parseFloat(getQty(r))
      const cost = parseFloat(getCost(r))
      if (!Number.isFinite(qty) || qty <= 0) continue
      count++
      if (Number.isFinite(cost) && cost > 0) total += qty * cost
    }
    return { count, total }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selectedSet, edits])

  const outCount = rows.filter(r => r.isOut).length
  const lowCount = rows.length - outCount

  // Items seleccionados con cantidad válida (base para orden y PDF)
  const buildSelectedItems = () => {
    const items = []
    for (const r of rows) {
      if (!selectedSet.has(r.id)) continue
      const qty = parseFloat(getQty(r))
      if (!Number.isFinite(qty) || qty <= 0) continue
      const cost = parseFloat(getCost(r))
      items.push({
        row: r,
        quantity: qty,
        unitPrice: Number.isFinite(cost) && cost >= 0 ? cost : 0,
      })
    }
    return items
  }

  // Afectación del producto → igvType de la orden (mismo esquema que el modal)
  const igvTypeOf = (product) => {
    const aff = String(product?.taxAffectation || '')
    if (aff === '20' || product?.igvType === 'exonerado') return 'exonerado'
    if (aff === '30' || product?.igvType === 'inafecto') return 'inafecto'
    return 'gravado'
  }

  // ===== Crear ORDEN DE COMPRA en borrador con lo seleccionado =====
  // Mismo shape y fórmulas que CreatePurchaseOrderModal (costos CON IGV,
  // pricesIncludeIgv: true — el costo del producto en la app incluye IGV).
  const handleCreateOrder = async () => {
    const supplier = suppliers.find(s => s.id === supplierId)
    if (!supplier || !(supplier.businessName || supplier.name)) {
      toast.error('Elige el proveedor al que se le pedirá esta lista')
      return
    }
    const selectedItems = buildSelectedItems()
    if (selectedItems.length === 0) {
      toast.error('No hay productos seleccionados con cantidad mayor a 0')
      return
    }

    setIsCreating(true)
    try {
      const orderItems = selectedItems.map(({ row, quantity, unitPrice }, index) => ({
        lineNumber: index + 1,
        productId: row.id,
        code: row.product.code || '',
        sku: row.product.sku || '',
        name: row.name,
        quantity,
        unitPrice,
        unit: row.unit,
        igvType: igvTypeOf(row.product),
        subtotal: quantity * unitPrice,
        laboratoryName: row.product.laboratoryName || '',
        marca: row.product.marca || '',
        presentation: row.product.presentation || '',
        concentration: row.product.concentration || '',
      }))

      const itemsTotal = orderItems.reduce((s, it) => s + it.subtotal, 0)
      const gravadoTotal = orderItems.filter(it => it.igvType === 'gravado').reduce((s, it) => s + it.subtotal, 0)
      const exoneradoTotal = itemsTotal - gravadoTotal
      const gravadoSubtotal = gravadoTotal / 1.18
      const subtotal = gravadoSubtotal + exoneradoTotal
      const igv = gravadoTotal - gravadoSubtotal
      const total = itemsTotal

      const numberResult = await getNextPurchaseOrderNumber(businessId)
      if (!numberResult.success) throw new Error('Error al generar número de orden de compra')

      const orderData = {
        number: numberResult.number,
        supplier: {
          id: supplier.id || '',
          ruc: supplier.ruc || supplier.documentNumber || '',
          businessName: supplier.businessName || supplier.name || '',
          address: supplier.address || '',
          phone: supplier.phone || '',
          email: supplier.email || '',
          contactName: supplier.contactName || '',
        },
        items: orderItems,
        subtotal,
        igv,
        total,
        currency: 'PEN',
        exchangeRate: 1,
        pricesIncludeIgv: true,
        deliveryDate: '',
        paymentCondition: '',
        notes: `Generada desde la Lista de Reabastecimiento${warehouseId ? ` — Almacén: ${warehouses.find(w => w.id === warehouseId)?.name || ''}` : ''}`,
        status: 'draft',
        sentVia: [],
      }

      const result = await createPurchaseOrder(businessId, orderData)
      if (!result.success) throw new Error(result.error || 'Error al crear la orden de compra')

      toast.success(`Orden ${numberResult.number} creada con ${orderItems.length} producto(s). Desde ahí puedes descargar el PDF, enviarla y convertirla en compra.`)
      if (onCreated) onCreated()
    } catch (error) {
      console.error('Error al crear orden desde reabastecimiento:', error)
      toast.error(error.message || 'Error al crear la orden de compra')
    } finally {
      setIsCreating(false)
    }
  }

  // ===== PDF directo de la lista (sin crear orden) =====
  const handleDownloadPdf = async () => {
    const selectedItems = buildSelectedItems()
    if (selectedItems.length === 0) {
      toast.error('No hay productos seleccionados con cantidad mayor a 0')
      return
    }
    try {
      const { default: jsPDF } = await import('jspdf')
      const { downloadBlob } = await import('@/utils/nativeDownload')
      const supplier = suppliers.find(s => s.id === supplierId)
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = 210, MX = 14
      let y = 16
      const ensureSpace = (needed) => {
        if (y + needed > 283) { doc.addPage(); y = 16 }
      }
      const fmtQty = (n) => Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('LISTA DE REABASTECIMIENTO', W / 2, y, { align: 'center' })
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      if (businessName) { doc.text(businessName, W / 2, y, { align: 'center' }); y += 4.5 }
      const d = new Date()
      doc.text(`Generada: ${d.toLocaleDateString('es-PE')} ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`, W / 2, y, { align: 'center' })
      y += 4.5
      if (supplier) {
        doc.setFont('helvetica', 'bold')
        doc.text(`Proveedor: ${supplier.businessName || supplier.name}`, W / 2, y, { align: 'center' })
        y += 4.5
      }
      if (warehouseId) {
        const wName = warehouses.find(w => w.id === warehouseId)?.name
        if (wName) {
          doc.setFont('helvetica', 'normal')
          doc.text(`Almacén: ${wName}`, W / 2, y, { align: 'center' })
          y += 4.5
        }
      }
      y += 2
      doc.setDrawColor(0)
      doc.line(MX, y, W - MX, y)
      y += 5

      // Cabecera de columnas
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('PRODUCTO', MX, y)
      doc.text('STOCK', 118, y, { align: 'right' })
      doc.text('MIN.', 132, y, { align: 'right' })
      doc.text('PEDIR', 148, y, { align: 'right' })
      doc.text('COSTO', 168, y, { align: 'right' })
      doc.text('SUBTOTAL', W - MX, y, { align: 'right' })
      y += 2
      doc.setDrawColor(180)
      doc.line(MX, y, W - MX, y)
      y += 4

      doc.setFont('helvetica', 'normal')
      let grandTotal = 0
      for (const { row, quantity, unitPrice } of selectedItems) {
        ensureSpace(6)
        const sub = quantity * unitPrice
        grandTotal += sub
        doc.setFontSize(8)
        const label = row.sku ? `${row.name} (${row.sku})` : row.name
        doc.text(label.slice(0, 52), MX, y)
        doc.text(fmtQty(row.stock), 118, y, { align: 'right' })
        doc.text(String(row.minStock), 132, y, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text(fmtQty(quantity), 148, y, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        doc.text(unitPrice > 0 ? unitPrice.toFixed(2) : '—', 168, y, { align: 'right' })
        doc.text(sub > 0 ? sub.toFixed(2) : '—', W - MX, y, { align: 'right' })
        y += 4.5
      }

      ensureSpace(12)
      y += 1
      doc.setDrawColor(0)
      doc.line(MX, y, W - MX, y)
      y += 5.5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(`TOTAL (${selectedItems.length} producto${selectedItems.length === 1 ? '' : 's'})`, MX, y)
      doc.text(formatCurrency(grandTotal, baseCurrency), W - MX, y, { align: 'right' })

      const fileDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      await downloadBlob(doc.output('blob'), `Reabastecimiento_${fileDate}.pdf`, {
        title: 'Lista de Reabastecimiento',
        dialogTitle: 'Guardar o compartir PDF',
      })
    } catch (error) {
      console.error('Error generando PDF de reabastecimiento:', error)
      toast.error('No se pudo generar el PDF')
    }
  }

  const statusBadge = (row) => row.isOut
    ? <Badge variant="danger" className="text-[10px]">Agotado</Badge>
    : <Badge variant="warning" className="text-[10px]">Bajo</Badge>

  return (
    <div className="space-y-4 pb-24">
      {/* Header de la vista */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lista de Reabastecimiento</h1>
          <p className="text-gray-600 text-sm mt-1">
            Productos agotados o bajo su stock mínimo, con la cantidad sugerida para reponer
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>
          <X className="w-4 h-4 mr-2" />
          Cerrar
        </Button>
      </div>

      {/* Resumen + filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === 'all' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            Todos ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('out')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === 'out' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-300 hover:border-red-400'
            }`}
          >
            <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />
            Agotados ({outCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('low')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === 'low' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-600 border-amber-300 hover:border-amber-400'
            }`}
          >
            <TrendingDown className="w-3 h-3 inline mr-1 -mt-0.5" />
            Stock bajo ({lowCount})
          </button>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar producto o código..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setVisibleCount(50) }}
              className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Proveedor + almacén (a nivel de lista) */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-sm font-medium text-gray-700 flex-shrink-0">Proveedor:</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 max-w-xs"
            >
              <option value="">— Sin proveedor (requerido para crear la orden) —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.businessName || s.name}</option>
              ))}
            </select>
            {supplierId && (
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlySupplierProducts}
                  onChange={(e) => setOnlySupplierProducts(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Solo productos comprados a este proveedor
              </label>
            )}
          </div>
          {warehouses.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 flex-shrink-0">Almacén:</label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 max-w-[200px]"
              >
                <option value="">Todos (stock total)</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-900 font-medium">Todo el inventario está por encima del mínimo</p>
          <p className="text-sm text-gray-500 mt-1">
            No hay productos agotados ni con stock bajo. El stock mínimo se configura en cada producto.
          </p>
        </div>
      ) : (
        <>
          {/* Tabla (desktop) */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                  <th className="px-3 py-2.5 w-10">
                    <button type="button" onClick={toggleAllFiltered} title={allFilteredSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}>
                      {allFilteredSelected
                        ? <CheckSquare className="w-4 h-4 text-primary-600" />
                        : <Square className="w-4 h-4 text-gray-400" />}
                    </button>
                  </th>
                  <th className="px-3 py-2.5">Producto</th>
                  <th className="px-3 py-2.5 text-center">Estado</th>
                  <th className="px-3 py-2.5 text-center">Stock</th>
                  <th className="px-3 py-2.5 text-center">Mínimo</th>
                  <th className="px-3 py-2.5 text-center">Cantidad a pedir</th>
                  <th className="px-3 py-2.5 text-right">Costo unit.</th>
                  <th className="px-3 py-2.5 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map(row => {
                  const isSelected = selectedSet.has(row.id)
                  const qty = getQty(row)
                  const cost = getCost(row)
                  const qtyNum = parseFloat(qty)
                  const costNum = parseFloat(cost)
                  const subtotal = Number.isFinite(qtyNum) && Number.isFinite(costNum) ? qtyNum * costNum : 0
                  const e = edits[row.id] || {}
                  return (
                    <tr key={row.id} className={isSelected ? '' : 'opacity-45'}>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => toggleRow(row.id)}>
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-primary-600" />
                            : <Square className="w-4 h-4 text-gray-400" />}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900 leading-tight">{row.name}</p>
                        <p className="text-xs text-gray-400">
                          {row.sku}
                          {row.sku && row.lastSupplierName ? ' · ' : ''}
                          {row.lastSupplierName && <span className="text-gray-500">Últ. prov: {row.lastSupplierName}</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-center">{statusBadge(row)}</td>
                      <td className={`px-3 py-2 text-center font-semibold ${row.isOut ? 'text-red-600' : 'text-amber-600'}`}>
                        {row.stock}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-500">{row.minStock}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-center">
                          <QtyCell
                            value={qty}
                            dirty={e.qty !== undefined && String(e.qty) !== String(row.suggestedQty)}
                            onChange={(v) => setEdit(row.id, 'qty', v)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <CostCell
                          value={cost}
                          dirty={e.cost !== undefined && String(e.cost) !== String(row.cost)}
                          onChange={(v) => setEdit(row.id, 'cost', v)}
                          currency={baseCurrency === 'USD' ? '$' : 'S/'}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">
                        {subtotal > 0 ? formatCurrency(subtotal, baseCurrency) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Tarjetas (móvil) */}
          <div className="md:hidden space-y-2">
            {visibleRows.map(row => {
              const isSelected = selectedSet.has(row.id)
              const qty = getQty(row)
              const cost = getCost(row)
              const qtyNum = parseFloat(qty)
              const costNum = parseFloat(cost)
              const subtotal = Number.isFinite(qtyNum) && Number.isFinite(costNum) ? qtyNum * costNum : 0
              const e = edits[row.id] || {}
              return (
                <div key={row.id} className={`bg-white rounded-xl border p-3 ${isSelected ? 'border-gray-200' : 'border-gray-100 opacity-45'}`}>
                  <div className="flex items-start gap-2">
                    <button type="button" onClick={() => toggleRow(row.id)} className="mt-0.5 flex-shrink-0">
                      {isSelected
                        ? <CheckSquare className="w-5 h-5 text-primary-600" />
                        : <Square className="w-5 h-5 text-gray-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 text-sm leading-tight truncate">{row.name}</p>
                        {statusBadge(row)}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Stock: <span className={`font-semibold ${row.isOut ? 'text-red-600' : 'text-amber-600'}`}>{row.stock}</span>
                        {' · '}Mínimo: {row.minStock}
                        {row.sku ? ` · ${row.sku}` : ''}
                      </p>
                      {row.lastSupplierName && (
                        <p className="text-xs text-gray-400 mt-0.5">Últ. prov: {row.lastSupplierName}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500">Pedir</span>
                          <QtyCell
                            value={qty}
                            dirty={e.qty !== undefined && String(e.qty) !== String(row.suggestedQty)}
                            onChange={(v) => setEdit(row.id, 'qty', v)}
                          />
                        </div>
                        <CostCell
                          value={cost}
                          dirty={e.cost !== undefined && String(e.cost) !== String(row.cost)}
                          onChange={(v) => setEdit(row.id, 'cost', v)}
                          currency={baseCurrency === 'USD' ? '$' : 'S/'}
                        />
                      </div>
                      {subtotal > 0 && (
                        <p className="text-right text-sm font-semibold text-gray-900 mt-1.5">
                          {formatCurrency(subtotal, baseCurrency)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {filteredRows.length > visibleCount && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setVisibleCount(c => c + 50)}>
                Ver más ({filteredRows.length - visibleCount} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      {/* Barra fija inferior: resumen + acciones */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 px-4 py-3 z-20">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 max-w-5xl mx-auto">
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{totals.count}</span> producto{totals.count !== 1 ? 's' : ''} a pedir
            </p>
            <p className="text-base font-bold text-gray-900">
              {formatCurrency(totals.total, baseCurrency)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={totals.count === 0}
              className="flex-1 sm:flex-initial"
            >
              <FileText className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button
              onClick={handleCreateOrder}
              disabled={isCreating || totals.count === 0}
              className="flex-1 sm:flex-initial"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ShoppingCart className="w-4 h-4 mr-2" />
              )}
              Crear Orden de Compra
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
