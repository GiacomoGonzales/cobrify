import { useState, useMemo } from 'react'
import {
  X, Save, Loader2, Calculator, Package, Edit, CheckSquare, Square,
  AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  RotateCcw, Tag,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { formatCurrency, applyMarginToCost } from '@/lib/utils'
import { updateProduct } from '@/services/firestoreService'
import { useToast } from '@/contexts/ToastContext'

/**
 * Vista enfocada para revisar y actualizar masivamente los precios de venta.
 *
 * Muestra, por producto: Costo (referencia) · Precio de venta (editable) ·
 * Margen en vivo (S/ y %). Los cambios se acumulan localmente (no se guardan
 * hasta pulsar "Guardar"), las filas modificadas se resaltan y hay una barra
 * fija con el total de cambios pendientes.
 *
 * Productos con variantes tienen varios precios → no se editan inline; se
 * muestra un botón "Editar" que abre el modal completo (onEditProduct).
 *
 * Props:
 * - products: lista YA filtrada/ordenada de productos (filteredProducts del padre)
 * - businessId: id del negocio para guardar
 * - hidePrivateData: si true, oculta costo y margen (usuario secundario restringido)
 * - marginFormula: 'markup' | 'margin' (businessSettings.marginFormula) para "margen objetivo"
 * - baseCurrency: moneda por defecto para formatear (fallback al currency del producto)
 * - onClose: salir del modo actualización
 * - onEditProduct: (product) => void  abre el modal completo (variantes / otros precios)
 * - onSaved: () => void  recarga la lista de productos tras guardar
 */
export default function PriceUpdateTable({
  products = [],
  businessId,
  hidePrivateData = false,
  marginFormula = 'markup',
  baseCurrency = 'PEN',
  onClose,
  onEditProduct,
  onSaved,
}) {
  const { toast } = useToast()

  // { [productId]: stringDelInput } — solo precios editados (no guardados aún)
  const [edits, setEdits] = useState({})
  const [selected, setSelected] = useState(new Set())
  const [isSaving, setIsSaving] = useState(false)

  // Paginación interna (independiente de la tabla normal)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // Ajuste masivo
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkMode, setBulkMode] = useState('up') // 'up' | 'down' | 'margin' | 'round'
  const [bulkPct, setBulkPct] = useState('')
  const [bulkEnding, setBulkEnding] = useState('0.90')

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

  const isEditable = (p) => !p.hasVariants
  const hasExtras = (p) =>
    (Array.isArray(p.presentations) && p.presentations.length > 0) ||
    p.price2 != null || p.price3 != null || p.price4 != null

  // Precio "vigente" (editado si lo hay, si no el guardado)
  const currentPrice = (p) => {
    const e = edits[p.id]
    if (e !== undefined) return e === '' ? '' : Number(e)
    return p.price
  }

  const isDirty = (p) => {
    const e = edits[p.id]
    if (e === undefined) return false
    const n = Number(e)
    if (!Number.isFinite(n)) return true // inválido también cuenta como cambio (para avisar)
    return round2(n) !== round2(p.price || 0)
  }

  const isInvalid = (p) => {
    const e = edits[p.id]
    if (e === undefined) return false
    const n = Number(e)
    return e === '' || !Number.isFinite(n) || n < 0
  }

  const dirtyProducts = useMemo(
    () => products.filter((p) => isEditable(p) && isDirty(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, edits],
  )
  const invalidCount = useMemo(
    () => dirtyProducts.filter((p) => isInvalid(p)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dirtyProducts, edits],
  )

  const editableProducts = useMemo(() => products.filter(isEditable), [products])

  // ----- Paginación -----
  const totalPages = Math.max(1, Math.ceil(products.length / perPage))
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * perPage
  const pageProducts = products.slice(startIndex, startIndex + perPage)

  // ----- Selección -----
  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allEditableSelected =
    editableProducts.length > 0 && editableProducts.every((p) => selected.has(p.id))
  const toggleSelectAll = () => {
    if (allEditableSelected) setSelected(new Set())
    else setSelected(new Set(editableProducts.map((p) => p.id)))
  }

  const setPrice = (id, value) => {
    setEdits((prev) => ({ ...prev, [id]: value }))
  }
  const resetRow = (p) => {
    setEdits((prev) => {
      const next = { ...prev }
      delete next[p.id]
      return next
    })
  }
  const discardAll = () => {
    setEdits({})
  }

  // ----- Ajuste masivo -----
  const bulkScope = useMemo(() => {
    // Si hay selección, se aplica a los seleccionados; si no, a todos los editables filtrados.
    const base = selected.size > 0
      ? editableProducts.filter((p) => selected.has(p.id))
      : editableProducts
    return base
  }, [selected, editableProducts])

  const applyBulk = () => {
    const pct = Number(bulkPct)
    const needsPct = bulkMode === 'up' || bulkMode === 'down' || bulkMode === 'margin'
    if (needsPct && (!Number.isFinite(pct) || pct <= 0)) {
      toast.error('Ingresa un porcentaje válido')
      return
    }

    const ending = Number(bulkEnding) // 0, 0.5, 0.9, 0.99
    const newEdits = { ...edits }
    let affected = 0
    let skippedNoCost = 0

    for (const p of bulkScope) {
      const base = Number(currentPrice(p)) || 0
      let next = base
      if (bulkMode === 'up') next = base * (1 + pct / 100)
      else if (bulkMode === 'down') next = base * (1 - pct / 100)
      else if (bulkMode === 'margin') {
        const cost = Number(p.cost) || 0
        if (cost <= 0) { skippedNoCost++; continue }
        next = applyMarginToCost(cost, pct, marginFormula)
      } else if (bulkMode === 'round') {
        // Redondear hacia arriba a la terminación elegida (ej. .90)
        const intPart = Math.floor(base + 1e-9)
        let candidate = intPart + ending
        if (candidate < base - 1e-9) candidate += 1
        next = candidate
      }
      next = round2(next)
      if (next < 0) next = 0
      newEdits[p.id] = String(next)
      affected++
    }

    setEdits(newEdits)
    setBulkOpen(false)
    if (affected > 0) {
      let msg = `${affected} precio(s) ajustado(s). Revisa y pulsa Guardar.`
      if (skippedNoCost > 0) msg += ` (${skippedNoCost} sin costo se omitieron)`
      toast.success(msg)
    } else if (skippedNoCost > 0) {
      toast.error('Ningún producto tenía costo para calcular el margen')
    }
  }

  // ----- Guardar -----
  const handleSave = async () => {
    if (dirtyProducts.length === 0) return
    if (invalidCount > 0) {
      toast.error('Hay precios inválidos. Corrígelos antes de guardar.')
      return
    }
    setIsSaving(true)
    let ok = 0
    let err = 0
    try {
      for (const p of dirtyProducts) {
        const newPrice = round2(Number(edits[p.id]))
        try {
          const res = await updateProduct(businessId, p.id, { price: newPrice })
          if (res?.success) ok++
          else err++
        } catch (e) {
          console.error('Error al actualizar precio de', p.id, e)
          err++
        }
      }
      if (ok > 0) toast.success(`${ok} precio(s) actualizado(s)`)
      if (err > 0) toast.error(`${err} no se pudieron actualizar`)
      setEdits({})
      setSelected(new Set())
      onSaved?.()
    } finally {
      setIsSaving(false)
    }
  }

  const fmt = (n, p) => formatCurrency(n, p?.currency || baseCurrency)

  return (
    <div className="space-y-4">
      {/* Encabezado del modo */}
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary-600 p-2 text-white shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Actualizar precios</h2>
              <p className="text-sm text-gray-600">
                Edita el precio de venta de cada producto y mira el margen en vivo.
                Usa la búsqueda y los filtros de arriba para acotar la lista.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkOpen(true)}
              title="Ajustar varios precios a la vez"
            >
              <Calculator className="w-4 h-4 mr-2" />
              Ajuste masivo
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No hay productos que coincidan con los filtros.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  <th className="px-3 py-3 w-10">
                    <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-100 rounded" title="Seleccionar todos">
                      {allEditableSelected ? (
                        <CheckSquare className="w-5 h-5 text-primary-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-3 w-12"></th>
                  <th className="px-3 py-3 min-w-[200px]">Producto</th>
                  {!hidePrivateData && <th className="px-3 py-3 text-right whitespace-nowrap">Costo</th>}
                  <th className="px-3 py-3 text-right min-w-[140px]">Precio de venta</th>
                  {!hidePrivateData && <th className="px-3 py-3 text-right whitespace-nowrap">Margen</th>}
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageProducts.map((p) => {
                  const editable = isEditable(p)
                  const dirty = editable && isDirty(p)
                  const invalid = editable && isInvalid(p)
                  const price = currentPrice(p)
                  const priceNum = Number(price) || 0
                  const cost = Number(p.cost) || 0
                  const hasCost = p.cost != null && cost > 0
                  const marginAmt = priceNum - cost
                  const marginPct = priceNum > 0 ? (marginAmt / priceNum) * 100 : 0
                  const belowCost = hasCost && marginAmt < 0

                  return (
                    <tr
                      key={p.id}
                      className={
                        invalid ? 'bg-red-50'
                        : dirty ? 'bg-amber-50'
                        : 'hover:bg-gray-50'
                      }
                    >
                      <td className="px-3 py-2 align-middle">
                        {editable ? (
                          <button onClick={() => toggleRow(p.id)} className="p-1 hover:bg-gray-100 rounded">
                            {selected.has(p.id) ? (
                              <CheckSquare className="w-5 h-5 text-primary-600" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {p.imageUrl ? (
                          <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-100">
                            <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                            <Package className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="font-medium text-gray-900 truncate max-w-[260px]" title={p.name}>
                          {p.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {p.sku && (
                            <span className="font-mono text-[11px] text-primary-700">{p.sku}</span>
                          )}
                          {hasExtras(p) && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700"
                              title="Tiene presentaciones u otros precios — edítalos en el editor completo"
                            >
                              + otros precios
                            </span>
                          )}
                        </div>
                      </td>

                      {!hidePrivateData && (
                        <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
                          {hasCost ? (
                            <span className="text-gray-700">{fmt(cost, p)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )}

                      <td className="px-3 py-2 align-middle text-right">
                        {editable ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-gray-400">
                              {(p.currency || baseCurrency) === 'USD' ? '$' : 'S/'}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              inputMode="decimal"
                              value={edits[p.id] !== undefined ? edits[p.id] : (p.price ?? '')}
                              onChange={(e) => setPrice(p.id, e.target.value)}
                              className={`w-24 text-right px-2 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                                invalid
                                  ? 'border-red-400 focus:ring-red-400 bg-white'
                                  : dirty
                                  ? 'border-amber-400 focus:ring-amber-400 bg-white font-semibold'
                                  : 'border-gray-300 focus:ring-primary-500'
                              }`}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-gray-500 text-xs" title="Producto con variantes: precios por variante">
                              {p.variants?.length || 0} variantes
                            </span>
                            <Button variant="outline" size="sm" onClick={() => onEditProduct?.(p)} className="!py-1 !px-2">
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>

                      {!hidePrivateData && (
                        <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
                          {editable && hasCost ? (
                            <div className={belowCost ? 'text-red-600' : 'text-green-600'}>
                              <div className="font-semibold leading-tight">{fmt(marginAmt, p)}</div>
                              <div className="text-[11px] leading-tight">
                                {marginPct.toFixed(0)}%
                                {belowCost && (
                                  <AlertTriangle className="w-3 h-3 inline ml-1 -mt-0.5" />
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )}

                      <td className="px-3 py-2 align-middle">
                        {dirty && (
                          <button
                            onClick={() => resetRow(p)}
                            className="p-1 text-gray-400 hover:text-gray-700 rounded"
                            title="Deshacer cambio de esta fila"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-600">
              <span className="font-medium">{startIndex + 1}</span>–
              <span className="font-medium">{Math.min(startIndex + perPage, products.length)}</span>
              <span className="hidden sm:inline"> de <span className="font-medium">{products.length}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
                className="px-2 py-1 border border-gray-300 rounded-lg text-sm mr-2"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
              <button onClick={() => setPage(1)} disabled={safePage === 1}
                className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(safePage - 1)} disabled={safePage === 1}
                className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-sm text-gray-600">{safePage} / {totalPages}</span>
              <button onClick={() => setPage(safePage + 1)} disabled={safePage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra fija de guardado */}
      {dirtyProducts.length > 0 && (
        <div className="sticky bottom-4 z-30">
          <div className="rounded-xl border border-gray-200 bg-white shadow-lg p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">
                {dirtyProducts.length} cambio{dirtyProducts.length !== 1 ? 's' : ''} sin guardar
              </span>
              {invalidCount > 0 && (
                <span className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {invalidCount} inválido{invalidCount !== 1 ? 's' : ''}
                </span>
              )}
              <button onClick={discardAll} className="text-sm text-gray-500 hover:text-gray-700">
                Descartar
              </button>
            </div>
            <Button onClick={handleSave} disabled={isSaving || invalidCount > 0} className="w-full sm:w-auto">
              {isSaving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando…</>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Guardar {dirtyProducts.length} cambio{dirtyProducts.length !== 1 ? 's' : ''}</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Modal de ajuste masivo */}
      <Modal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} title="Ajuste masivo de precios" size="lg">
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
            Se aplicará a{' '}
            <span className="font-semibold">
              {bulkScope.length} producto{bulkScope.length !== 1 ? 's' : ''}
            </span>{' '}
            {selected.size > 0 ? '(los seleccionados)' : '(todos los del filtro actual)'}.
            Los cambios quedan listos para revisar; no se guardan hasta pulsar “Guardar”.
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { key: 'up', label: 'Subir %' },
              { key: 'down', label: 'Bajar %' },
              { key: 'margin', label: 'Margen objetivo' },
              { key: 'round', label: 'Redondear' },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setBulkMode(opt.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  bulkMode === opt.key
                    ? 'bg-primary-600 text-white border-primary-700'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {(bulkMode === 'up' || bulkMode === 'down') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Porcentaje a {bulkMode === 'up' ? 'subir' : 'bajar'}
              </label>
              <div className="relative w-40">
                <input
                  type="number" step="0.1" min="0" value={bulkPct}
                  onChange={(e) => setBulkPct(e.target.value)}
                  placeholder="Ej: 10"
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
              </div>
            </div>
          )}

          {bulkMode === 'margin' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Margen objetivo</label>
              <div className="relative w-40">
                <input
                  type="number" step="0.1" min="0" value={bulkPct}
                  onChange={(e) => setBulkPct(e.target.value)}
                  placeholder="Ej: 30"
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Calcula el precio desde el costo ({marginFormula === 'margin' ? 'margen sobre la venta' : 'recargo sobre el costo'}).
                Los productos sin costo se omiten.
              </p>
            </div>
          )}

          {bulkMode === 'round' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Terminación (redondea hacia arriba)</label>
              <select
                value={bulkEnding}
                onChange={(e) => setBulkEnding(e.target.value)}
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="0">.00 (entero)</option>
                <option value="0.50">.50</option>
                <option value="0.90">.90</option>
                <option value="0.99">.99</option>
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancelar</Button>
            <Button onClick={applyBulk}>
              <Calculator className="w-4 h-4 mr-2" />
              Aplicar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
