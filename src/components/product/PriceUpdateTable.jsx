import { Fragment, useState, useMemo } from 'react'
import {
  X, Save, Loader2, Calculator, Package, Edit, CheckSquare, Square,
  AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  RotateCcw, Tag, ChevronDown, Filter,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { formatCurrency, applyMarginToCost } from '@/lib/utils'
import { updateProduct } from '@/services/firestoreService'
import { useToast } from '@/contexts/ToastContext'

/**
 * Input de precio editable. DEFINIDO A NIVEL MÓDULO (no dentro del componente)
 * para que React lo identifique como el mismo type entre renders y no desmonte
 * el <input> en cada keypress — si se desmontara, el input perdería el focus
 * después de cada tecla (que era el bug que reportó el usuario en móvil).
 */
function PriceCell({ value, dirty, invalid, onChange, currency }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <span className="text-xs text-gray-400">{currency}</span>
      <input
        type="number" step="0.01" min="0" inputMode="decimal"
        value={value === '' || value === null || value === undefined ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-24 text-right px-2 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
          invalid ? 'border-red-400 focus:ring-red-400 bg-white'
          : dirty ? 'border-amber-400 focus:ring-amber-400 bg-white font-semibold'
          : 'border-gray-300 focus:ring-primary-500'
        }`}
      />
    </div>
  )
}

/**
 * Margen formateado (bloque con dos líneas: S/X arriba, % abajo).
 * También extraído a nivel módulo por consistencia y estabilidad de tree.
 */
function MarginCell({ cost, price, fmt, hidePrivateData }) {
  if (!hidePrivateData && cost > 0 && price > 0) {
    const m = price - cost
    const pct = (m / price) * 100
    const below = m < 0
    return (
      <div className={below ? 'text-red-600' : 'text-green-600'}>
        <div className="font-semibold leading-tight text-sm">{fmt(m)}</div>
        <div className="text-[11px] leading-tight">
          {pct.toFixed(0)}%{below && <AlertTriangle className="w-3 h-3 inline ml-1 -mt-0.5" />}
        </div>
      </div>
    )
  }
  return <span className="text-gray-300">—</span>
}

/** Margen en una sola línea (para cards de móvil). */
function MarginInline({ cost, price, fmt, hidePrivateData }) {
  if (hidePrivateData || !(cost > 0) || !(price > 0)) return <span className="text-gray-400">—</span>
  const m = price - cost
  const pct = (m / price) * 100
  const below = m < 0
  return (
    <span className={`font-medium ${below ? 'text-red-600' : 'text-green-600'}`}>
      {fmt(m)} ({pct.toFixed(0)}%)
    </span>
  )
}

/**
 * Vista enfocada para revisar y actualizar masivamente los precios de venta.
 *
 * Soporta:
 *  - Producto simple con un único precio (edición inline en la fila).
 *  - Múltiples precios (price/price2/price3/price4) con labels personalizables
 *    (businessSettings.priceLabels) — se editan en la zona expandible.
 *  - Presentaciones (Caja x24, Pack x6…) — cada una tiene su precio editable.
 *  - Variantes (color/talla) — sub-tabla con un input por variante (y por nivel
 *    de precio si multiplePricesEnabled).
 *
 * Estado de cambios pendientes (`edits`):
 *   { [productId]: {
 *       price?: string, price2?: string, price3?: string, price4?: string,
 *       presentations?: { [idx]: string },             // precio por presentación
 *       variants?: { [sku]: { price?: string, price2?, price3?, price4? } }
 *     }
 *   }
 *
 * Productos con variantes congelan el `basePrice` al promediar `variants[].price`
 * (igual que el modal completo). Se recalcula automáticamente al guardar.
 */
export default function PriceUpdateTable({
  products = [],
  businessId,
  hidePrivateData = false,
  marginFormula = 'markup',
  baseCurrency = 'PEN',
  businessSettings = {},
  onClose,
  onEditProduct,
  onSaved,
}) {
  // useToast() devuelve el objeto toast directamente (Provider value={toast}),
  // NO envuelto en { toast }. Destructurar daría undefined → toast.success crashea.
  const toast = useToast()

  const multiPricesOn = !!businessSettings?.multiplePricesEnabled
  const presentationsOn = !!businessSettings?.presentationsEnabled
  const priceLabels = businessSettings?.priceLabels || {}
  const labelOf = (key) =>
    priceLabels?.[key] ||
    ({ price1: 'Precio 1', price2: 'Precio 2', price3: 'Precio 3', price4: 'Precio 4' }[key])

  // Niveles de precio extra (solo si multi-precios está ON)
  const EXTRA_LEVELS = multiPricesOn ? ['price2', 'price3', 'price4'] : []

  const [edits, setEdits] = useState({})
  const [selected, setSelected] = useState(new Set())
  const [expanded, setExpanded] = useState(new Set()) // productIds expandidos
  const [isSaving, setIsSaving] = useState(false)

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  const [typeFilter, setTypeFilter] = useState('all')

  // Ajuste masivo
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkMode, setBulkMode] = useState('up') // 'up' | 'down' | 'margin' | 'round'
  const [bulkPct, setBulkPct] = useState('')
  const [bulkEnding, setBulkEnding] = useState('0.90')
  const [bulkApplyTo, setBulkApplyTo] = useState('price') // qué precio(s) afectar

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

  // ----- Helpers de detección -----
  const hasVariants = (p) => !!p.hasVariants && Array.isArray(p.variants) && p.variants.length > 0
  const hasPresentations = (p) => Array.isArray(p.presentations) && p.presentations.length > 0
  const hasMultiPrices = (p) =>
    multiPricesOn && !hasVariants(p) && (p.price2 != null || p.price3 != null || p.price4 != null)
  const hasExtras = (p) => hasVariants(p) || hasPresentations(p) || hasMultiPrices(p)

  // ----- Lectura de valores (editado > guardado) -----
  const getPatch = (p) => edits[p.id] || {}

  const currentField = (p, field) => {
    const patch = getPatch(p)
    const v = patch[field]
    if (v !== undefined) return v === '' ? '' : Number(v)
    return p[field] ?? null
  }
  const currentPresentationPrice = (p, idx) => {
    const v = getPatch(p)?.presentations?.[idx]
    if (v !== undefined) return v === '' ? '' : Number(v)
    return p.presentations?.[idx]?.price ?? null
  }
  const currentVariantField = (p, sku, field) => {
    const v = getPatch(p)?.variants?.[sku]?.[field]
    if (v !== undefined) return v === '' ? '' : Number(v)
    return p.variants?.find(x => x.sku === sku)?.[field] ?? null
  }

  // ----- Dirty / inválido -----
  const isFieldDirty = (saved, raw) => {
    if (raw === undefined) return false
    if (raw === '') return true
    const n = Number(raw)
    if (!Number.isFinite(n)) return true
    return round2(n) !== round2(saved || 0)
  }
  const isFieldInvalid = (raw) => {
    if (raw === undefined) return false
    if (raw === '') return true
    const n = Number(raw)
    return !Number.isFinite(n) || n < 0
  }

  const productDirty = (p) => {
    const patch = getPatch(p)
    if (!patch) return false
    if (!hasVariants(p)) {
      if (isFieldDirty(p.price, patch.price)) return true
      for (const lvl of EXTRA_LEVELS) {
        if (isFieldDirty(p[lvl], patch[lvl])) return true
      }
    }
    if (hasPresentations(p) && patch.presentations) {
      for (const idx of Object.keys(patch.presentations)) {
        const saved = p.presentations?.[idx]?.price
        if (isFieldDirty(saved, patch.presentations[idx])) return true
      }
    }
    if (hasVariants(p) && patch.variants) {
      for (const sku of Object.keys(patch.variants)) {
        const v = p.variants.find(x => x.sku === sku)
        const vp = patch.variants[sku]
        if (isFieldDirty(v?.price, vp.price)) return true
        for (const lvl of EXTRA_LEVELS) {
          if (isFieldDirty(v?.[lvl], vp[lvl])) return true
        }
      }
    }
    return false
  }
  const productInvalid = (p) => {
    const patch = getPatch(p)
    if (!patch) return false
    if (isFieldInvalid(patch.price)) return true
    for (const lvl of EXTRA_LEVELS) if (isFieldInvalid(patch[lvl])) return true
    if (patch.presentations) {
      for (const idx of Object.keys(patch.presentations)) {
        if (isFieldInvalid(patch.presentations[idx])) return true
      }
    }
    if (patch.variants) {
      for (const sku of Object.keys(patch.variants)) {
        const vp = patch.variants[sku]
        if (isFieldInvalid(vp.price)) return true
        for (const lvl of EXTRA_LEVELS) if (isFieldInvalid(vp[lvl])) return true
      }
    }
    return false
  }

  // ----- Filtros -----
  const filteredProducts = useMemo(() => {
    if (typeFilter === 'all') return products
    return products.filter(p => {
      if (typeFilter === 'variants') return hasVariants(p)
      if (typeFilter === 'presentations') return hasPresentations(p)
      if (typeFilter === 'multi') return hasMultiPrices(p)
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, typeFilter, multiPricesOn])

  const dirtyProducts = useMemo(
    () => filteredProducts.filter(productDirty),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredProducts, edits],
  )
  const invalidCount = useMemo(
    () => dirtyProducts.filter(productInvalid).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dirtyProducts, edits],
  )

  // Selección masiva opera sobre filteredProducts
  const editableProducts = filteredProducts

  // ----- Paginación -----
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / perPage))
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * perPage
  const pageProducts = filteredProducts.slice(startIndex, startIndex + perPage)

  // ----- Selección -----
  const toggleRow = (id) => {
    setSelected(prev => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
    })
  }
  const allEditableSelected =
    editableProducts.length > 0 && editableProducts.every(p => selected.has(p.id))
  const toggleSelectAll = () => {
    if (allEditableSelected) setSelected(new Set())
    else setSelected(new Set(editableProducts.map(p => p.id)))
  }

  const toggleExpanded = (id) => {
    setExpanded(prev => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
    })
  }

  // ----- Setters de edits -----
  const setProductPatch = (productId, mutator) => {
    setEdits(prev => {
      const cur = prev[productId] || {}
      const next = mutator({ ...cur }) ?? cur
      return { ...prev, [productId]: next }
    })
  }
  const setProductField = (productId, field, value) => {
    setProductPatch(productId, patch => { patch[field] = value; return patch })
  }
  const setPresentationPrice = (productId, idx, value) => {
    setProductPatch(productId, patch => {
      patch.presentations = { ...(patch.presentations || {}), [idx]: value }
      return patch
    })
  }
  const setVariantField = (productId, sku, field, value) => {
    setProductPatch(productId, patch => {
      patch.variants = { ...(patch.variants || {}) }
      patch.variants[sku] = { ...(patch.variants[sku] || {}), [field]: value }
      return patch
    })
  }

  const resetRow = (p) => {
    setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n })
  }
  const discardAll = () => setEdits({})

  // ----- Ajuste masivo -----
  const bulkScope = useMemo(() => {
    const base = selected.size > 0
      ? editableProducts.filter(p => selected.has(p.id))
      : editableProducts
    return base
  }, [selected, editableProducts])

  const adjustValue = (base, mode, pct, ending) => {
    let next = base
    if (mode === 'up') next = base * (1 + pct / 100)
    else if (mode === 'down') next = base * (1 - pct / 100)
    else if (mode === 'round') {
      const intPart = Math.floor(base + 1e-9)
      let candidate = intPart + ending
      if (candidate < base - 1e-9) candidate += 1
      next = candidate
    }
    next = round2(next)
    return next < 0 ? 0 : next
  }

  const applyBulk = () => {
    const pct = Number(bulkPct)
    const needsPct = bulkMode === 'up' || bulkMode === 'down' || bulkMode === 'margin'
    if (needsPct && (!Number.isFinite(pct) || pct <= 0)) {
      toast.error('Ingresa un porcentaje válido')
      return
    }
    const ending = Number(bulkEnding)
    const newEdits = { ...edits }
    let affected = 0
    let skippedNoCost = 0

    const applyToScalar = (p, field, base) => {
      if (bulkMode === 'margin') {
        const cost = Number(p.cost) || 0
        if (cost <= 0) { skippedNoCost++; return null }
        return round2(applyMarginToCost(cost, pct, marginFormula))
      }
      return adjustValue(Number(base) || 0, bulkMode, pct, ending)
    }

    for (const p of bulkScope) {
      const cur = newEdits[p.id] ? { ...newEdits[p.id] } : {}
      let touched = false

      // Levels = qué campos atacar
      const scalarLevels = []
      if (bulkApplyTo === 'price' || bulkApplyTo === 'allPrices') scalarLevels.push('price')
      if (bulkApplyTo === 'price2' || bulkApplyTo === 'allPrices') scalarLevels.push('price2')
      if (bulkApplyTo === 'price3' || bulkApplyTo === 'allPrices') scalarLevels.push('price3')
      if (bulkApplyTo === 'price4' || bulkApplyTo === 'allPrices') scalarLevels.push('price4')

      // Sobre el precio principal (y multi-precios) de producto simple
      if (!hasVariants(p) && scalarLevels.length > 0) {
        for (const lvl of scalarLevels) {
          if (lvl !== 'price' && !multiPricesOn) continue
          const baseVal = cur[lvl] !== undefined ? Number(cur[lvl]) : (p[lvl] ?? null)
          if (baseVal == null && bulkMode !== 'margin') continue
          const next = applyToScalar(p, lvl, baseVal)
          if (next != null) { cur[lvl] = String(next); touched = true }
        }
      }

      // Sobre TODAS las variantes (mismo nivel/es)
      if (hasVariants(p) && (bulkApplyTo === 'variants' || scalarLevels.length > 0)) {
        const variantLevels = bulkApplyTo === 'variants' ? ['price'] : scalarLevels
        cur.variants = { ...(cur.variants || {}) }
        for (const v of p.variants) {
          cur.variants[v.sku] = { ...(cur.variants[v.sku] || {}) }
          for (const lvl of variantLevels) {
            if (lvl !== 'price' && !multiPricesOn) continue
            const baseVal = cur.variants[v.sku][lvl] !== undefined
              ? Number(cur.variants[v.sku][lvl])
              : (v[lvl] ?? null)
            if (baseVal == null && bulkMode !== 'margin') continue
            const next = applyToScalar(p, lvl, baseVal)
            if (next != null) { cur.variants[v.sku][lvl] = String(next); touched = true }
          }
        }
      }

      // Sobre TODAS las presentaciones
      if (hasPresentations(p) && bulkApplyTo === 'presentations') {
        cur.presentations = { ...(cur.presentations || {}) }
        p.presentations.forEach((pres, idx) => {
          const baseVal = cur.presentations[idx] !== undefined
            ? Number(cur.presentations[idx])
            : (pres.price ?? 0)
          const next = adjustValue(Number(baseVal) || 0, bulkMode, pct, ending)
          cur.presentations[idx] = String(next); touched = true
        })
      }

      if (touched) { newEdits[p.id] = cur; affected++ }
    }

    setEdits(newEdits)
    setBulkOpen(false)
    if (affected > 0) {
      let msg = `${affected} producto(s) ajustado(s). Revisa y pulsa Guardar.`
      if (skippedNoCost > 0) msg += ` (${skippedNoCost} sin costo se omitieron)`
      toast.success(msg)
    } else if (skippedNoCost > 0) {
      toast.error('Ningún producto tenía costo para calcular el margen')
    } else {
      toast.error('No hay nada que ajustar con esa selección')
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
    let ok = 0, err = 0
    try {
      for (const p of dirtyProducts) {
        const patch = getPatch(p)
        const update = {}
        // Precios planos
        if (!hasVariants(p)) {
          if (isFieldDirty(p.price, patch.price)) update.price = round2(Number(patch.price))
          for (const lvl of EXTRA_LEVELS) {
            if (isFieldDirty(p[lvl], patch[lvl])) update[lvl] = round2(Number(patch[lvl]))
          }
        }
        // Presentaciones: reescribir el array completo (Firestore no permite update parcial de array)
        if (hasPresentations(p) && patch.presentations) {
          const anyDirty = Object.keys(patch.presentations).some(idx =>
            isFieldDirty(p.presentations?.[idx]?.price, patch.presentations[idx]))
          if (anyDirty) {
            update.presentations = p.presentations.map((pres, idx) => {
              const raw = patch.presentations[idx]
              if (raw === undefined) return pres
              return { ...pres, price: round2(Number(raw)) }
            })
          }
        }
        // Variantes: reescribir el array y recalcular basePrice
        if (hasVariants(p) && patch.variants) {
          const anyDirty = Object.keys(patch.variants).some(sku => {
            const v = p.variants.find(x => x.sku === sku)
            const vp = patch.variants[sku]
            if (isFieldDirty(v?.price, vp.price)) return true
            for (const lvl of EXTRA_LEVELS) if (isFieldDirty(v?.[lvl], vp[lvl])) return true
            return false
          })
          if (anyDirty) {
            const newVariants = p.variants.map(v => {
              const vp = patch.variants[v.sku] || {}
              const out = { ...v }
              if (vp.price !== undefined && vp.price !== '') out.price = round2(Number(vp.price))
              for (const lvl of EXTRA_LEVELS) {
                if (vp[lvl] !== undefined && vp[lvl] !== '') out[lvl] = round2(Number(vp[lvl]))
              }
              return out
            })
            update.variants = newVariants
            const validPrices = newVariants.map(v => Number(v.price)).filter(n => Number.isFinite(n))
            if (validPrices.length > 0) {
              update.basePrice = round2(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)
            }
          }
        }

        if (Object.keys(update).length === 0) continue
        try {
          const res = await updateProduct(businessId, p.id, update)
          if (res?.success) ok++; else err++
        } catch (e) {
          console.error('Error al actualizar', p.id, e)
          err++
        }
      }
      if (ok > 0) toast.success(`${ok} producto(s) actualizado(s)`)
      if (err > 0) toast.error(`${err} no se pudieron actualizar`)
      setEdits({})
      setSelected(new Set())
      onSaved?.()
    } finally {
      setIsSaving(false)
    }
  }

  const fmt = (n, p) => formatCurrency(n, p?.currency || baseCurrency)
  const currencySymbol = (p) => ((p?.currency || baseCurrency) === 'USD' ? '$' : 'S/')
  // Helpers que pasan el fmt/hidePrivateData a los componentes de margen estables.
  const renderMargin = (cost, price, p) => <MarginCell cost={cost} price={price} fmt={(n) => fmt(n, p)} hidePrivateData={hidePrivateData} />
  const renderMarginInline = (cost, price, p) => <MarginInline cost={cost} price={price} fmt={(n) => fmt(n, p)} hidePrivateData={hidePrivateData} />

  // Renderiza la sub-zona de extras (Otros precios + Presentaciones + Variantes).
  // Se reusa en la fila expandida de la tabla (desktop) y en la card del móvil.
  // En móvil las VARIANTES van en stack de tarjetas en vez de tabla.
  const renderExtras = (p, { isMobile = false } = {}) => {
    const cost = Number(p.cost) || 0
    const hasCost = p.cost != null && cost > 0
    return (
      <div className="space-y-4">
        {/* Múltiples precios para producto SIMPLE */}
        {!hasVariants(p) && multiPricesOn && (
          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase mb-1.5">Otros precios</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-2xl">
              {EXTRA_LEVELS.map(lvl => (
                <div key={lvl} className="flex flex-col gap-1 bg-white border border-gray-200 rounded-lg px-2.5 py-2">
                  <span className="text-xs text-gray-600 leading-tight" title={labelOf(lvl)}>{labelOf(lvl)}</span>
                  <PriceCell
                    currency={currencySymbol(p)}
                    value={getPatch(p)[lvl] !== undefined ? getPatch(p)[lvl] : (p[lvl] ?? '')}
                    dirty={isFieldDirty(p[lvl], getPatch(p)[lvl])}
                    invalid={isFieldInvalid(getPatch(p)[lvl])}
                    onChange={(v) => setProductField(p.id, lvl, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Presentaciones */}
        {hasPresentations(p) && (
          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase mb-1.5">Presentaciones</div>
            <div className="space-y-1.5">
              {p.presentations.map((pres, idx) => {
                const factor = Number(pres.factor) || 1
                const rawPatch = getPatch(p)?.presentations?.[idx]
                const dirtyP = isFieldDirty(pres.price, rawPatch)
                const invP = isFieldInvalid(rawPatch)
                const presPrice = currentPresentationPrice(p, idx)
                const numericPrice = typeof presPrice === 'number' ? presPrice : 0
                const presCost = hasCost ? cost * factor : 0
                return (
                  <div key={idx} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-wrap">
                    <div className="min-w-0 flex-1 basis-32">
                      <div className="text-sm text-gray-900 truncate">{pres.name || `Presentación ${idx + 1}`}</div>
                      <div className="text-[11px] text-gray-500">
                        factor {factor}
                        {hasCost && <> · costo eq. {fmt(presCost, p)}</>}
                      </div>
                    </div>
                    <PriceCell
                      currency={currencySymbol(p)}
                      value={rawPatch !== undefined ? rawPatch : (pres.price ?? '')}
                      dirty={dirtyP} invalid={invP}
                      onChange={(v) => setPresentationPrice(p.id, idx, v)}
                    />
                    {!hidePrivateData && hasCost && (
                      <div className="text-right basis-full sm:basis-auto sm:w-20">
                        {renderMarginInline(presCost, numericPrice, p)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Variantes */}
        {hasVariants(p) && (
          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase mb-1.5">Variantes</div>

            {isMobile ? (
              /* MÓVIL: cada variante en una mini-card */
              <div className="space-y-2">
                {p.variants.map((v) => {
                  const vPrice = currentVariantField(p, v.sku, 'price')
                  const vPriceNum = typeof vPrice === 'number' ? vPrice : 0
                  const attrs = v.attributes ? Object.values(v.attributes).join(' · ') : v.sku
                  return (
                    <div key={v.sku} className="bg-white border border-gray-200 rounded-lg p-2.5">
                      <div className="text-sm text-gray-900 leading-tight">{attrs}</div>
                      <div className="font-mono text-[10px] text-gray-400 mb-2">{v.sku}</div>
                      {/* Grid de precios: 1 col en móvil, 2 si entran */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-gray-500">{multiPricesOn ? labelOf('price1') : 'Precio'}</span>
                          <PriceCell
                            currency={currencySymbol(p)}
                            value={(() => { const r = getPatch(p)?.variants?.[v.sku]?.price; return r !== undefined ? r : (v.price ?? '') })()}
                            dirty={isFieldDirty(v.price, getPatch(p)?.variants?.[v.sku]?.price)}
                            invalid={isFieldInvalid(getPatch(p)?.variants?.[v.sku]?.price)}
                            onChange={(val) => setVariantField(p.id, v.sku, 'price', val)}
                          />
                        </div>
                        {EXTRA_LEVELS.map(lvl => (
                          <div key={lvl} className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-gray-500 truncate" title={labelOf(lvl)}>{labelOf(lvl)}</span>
                            <PriceCell
                              currency={currencySymbol(p)}
                              value={(() => { const r = getPatch(p)?.variants?.[v.sku]?.[lvl]; return r !== undefined ? r : (v[lvl] ?? '') })()}
                              dirty={isFieldDirty(v[lvl], getPatch(p)?.variants?.[v.sku]?.[lvl])}
                              invalid={isFieldInvalid(getPatch(p)?.variants?.[v.sku]?.[lvl])}
                              onChange={(val) => setVariantField(p.id, v.sku, lvl, val)}
                            />
                          </div>
                        ))}
                      </div>
                      {!hidePrivateData && hasCost && (
                        <div className="mt-1.5 text-right text-[11px]">
                          Margen: {renderMarginInline(cost, vPriceNum, p)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* DESKTOP: tabla compacta */
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="px-2 py-1">Variante</th>
                      <th className="px-2 py-1 text-right">{multiPricesOn ? labelOf('price1') : 'Precio'}</th>
                      {EXTRA_LEVELS.map(lvl => (
                        <th key={lvl} className="px-2 py-1 text-right">{labelOf(lvl)}</th>
                      ))}
                      {!hidePrivateData && <th className="px-2 py-1 text-right">Margen</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {p.variants.map((v) => {
                      const vPrice = currentVariantField(p, v.sku, 'price')
                      const vPriceNum = typeof vPrice === 'number' ? vPrice : 0
                      const attrs = v.attributes ? Object.values(v.attributes).join(' · ') : v.sku
                      return (
                        <tr key={v.sku} className="border-t border-gray-100 align-middle">
                          <td className="px-2 py-1.5">
                            <div className="text-gray-900">{attrs}</div>
                            <div className="font-mono text-[10px] text-gray-400">{v.sku}</div>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <PriceCell
                              currency={currencySymbol(p)}
                              value={(() => { const r = getPatch(p)?.variants?.[v.sku]?.price; return r !== undefined ? r : (v.price ?? '') })()}
                              dirty={isFieldDirty(v.price, getPatch(p)?.variants?.[v.sku]?.price)}
                              invalid={isFieldInvalid(getPatch(p)?.variants?.[v.sku]?.price)}
                              onChange={(val) => setVariantField(p.id, v.sku, 'price', val)}
                            />
                          </td>
                          {EXTRA_LEVELS.map(lvl => (
                            <td key={lvl} className="px-2 py-1.5 text-right">
                              <PriceCell
                                currency={currencySymbol(p)}
                                value={(() => { const r = getPatch(p)?.variants?.[v.sku]?.[lvl]; return r !== undefined ? r : (v[lvl] ?? '') })()}
                                dirty={isFieldDirty(v[lvl], getPatch(p)?.variants?.[v.sku]?.[lvl])}
                                invalid={isFieldInvalid(getPatch(p)?.variants?.[v.sku]?.[lvl])}
                                onChange={(val) => setVariantField(p.id, v.sku, lvl, val)}
                              />
                            </td>
                          ))}
                          {!hidePrivateData && (
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">
                              {renderMargin(cost, vPriceNum, p)}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

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
                Edita precios de venta (incluye variantes, presentaciones y múltiples precios).
                Expande cada producto con el ▸ para ver sus precios extra.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} title="Ajustar varios precios a la vez">
              <Calculator className="w-4 h-4 mr-2" />
              Ajuste masivo
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>

        {/* Filtros de tipo */}
        {(multiPricesOn || presentationsOn || products.some(hasVariants)) && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-500" />
            {[
              { v: 'all', label: 'Todos' },
              { v: 'multi', label: 'Con múltiples precios', show: multiPricesOn },
              { v: 'presentations', label: 'Con presentaciones', show: presentationsOn },
              { v: 'variants', label: 'Con variantes', show: products.some(hasVariants) },
            ].filter(o => o.show !== false).map(opt => (
              <button
                key={opt.v}
                onClick={() => setTypeFilter(opt.v)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  typeFilter === opt.v
                    ? 'bg-primary-600 text-white border-primary-700'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {filteredProducts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No hay productos que coincidan con los filtros.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {/* ===== Vista MÓVIL: tarjetas apiladas (sin scroll horizontal) ===== */}
          <div className="lg:hidden p-3 space-y-3 bg-gray-50">
            {pageProducts.map((p) => {
              const dirty = productDirty(p)
              const invalid = productInvalid(p)
              const cost = Number(p.cost) || 0
              const hasCost = p.cost != null && cost > 0
              const isExpanded = expanded.has(p.id)
              const expandable = hasExtras(p)
              const simplePrice = !hasVariants(p) ? Number(currentField(p, 'price')) || 0 : null
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border shadow-sm overflow-hidden ${
                    invalid ? 'bg-red-50 border-red-200'
                    : dirty ? 'bg-amber-50 border-amber-300'
                    : 'bg-white border-gray-200'
                  }`}
                >
                  {/* Encabezado: select + imagen + nombre */}
                  <div className="flex items-start gap-2.5 p-3">
                    <button onClick={() => toggleRow(p.id)} className="p-1 hover:bg-gray-100 rounded shrink-0 mt-0.5">
                      {selected.has(p.id) ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5 text-gray-400" />}
                    </button>
                    {p.imageUrl ? (
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2" title={p.name}>{p.name}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {p.sku && <span className="font-mono text-[11px] text-primary-700">{p.sku}</span>}
                        {hasVariants(p) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700">
                            {p.variants.length} variantes
                          </span>
                        )}
                        {hasPresentations(p) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                            {p.presentations.length} presentaciones
                          </span>
                        )}
                        {hasMultiPrices(p) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">multi-precio</span>
                        )}
                      </div>
                    </div>
                    {dirty && (
                      <button onClick={() => resetRow(p)} className="p-1 text-gray-400 hover:text-gray-700 rounded shrink-0" title="Deshacer cambios">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Línea de precio principal */}
                  <div className="px-3 pb-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                    <div className="text-xs text-gray-500 leading-tight">
                      {!hidePrivateData && (
                        <>
                          <div>Costo: <span className="text-gray-700 font-medium">{hasCost ? fmt(cost, p) : '—'}</span></div>
                          {!hasVariants(p) && (
                            <div className="mt-0.5">Margen: {renderMarginInline(cost, simplePrice || 0, p)}</div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-gray-500 mb-0.5">{multiPricesOn ? labelOf('price1') : 'Precio'}</div>
                      {hasVariants(p) ? (
                        <Button variant="outline" size="sm" onClick={() => onEditProduct?.(p)} className="!py-1 !px-2" title="Abrir editor completo">
                          <Edit className="w-3.5 h-3.5 mr-1" /> Editor
                        </Button>
                      ) : (
                        <PriceCell
                          currency={currencySymbol(p)}
                          value={getPatch(p).price !== undefined ? getPatch(p).price : (p.price ?? '')}
                          dirty={isFieldDirty(p.price, getPatch(p).price)}
                          invalid={isFieldInvalid(getPatch(p).price)}
                          onChange={(v) => setProductField(p.id, 'price', v)}
                        />
                      )}
                    </div>
                  </div>

                  {/* Botón expandir + sub-zona */}
                  {expandable && (
                    <>
                      <button
                        onClick={() => toggleExpanded(p.id)}
                        className="w-full px-3 py-2 border-t border-gray-100 text-xs text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        {isExpanded ? 'Ocultar precios extra' : 'Ver precios extra'}
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-2 bg-gray-50/60 border-t border-gray-100">
                          {renderExtras(p, { isMobile: true })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* ===== Vista DESKTOP: tabla ===== */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  <th className="px-3 py-3 w-10">
                    <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-100 rounded" title="Seleccionar todos">
                      {allEditableSelected ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5 text-gray-400" />}
                    </button>
                  </th>
                  <th className="px-3 py-3 w-6"></th>
                  <th className="px-3 py-3 w-12"></th>
                  <th className="px-3 py-3 min-w-[200px]">Producto</th>
                  {!hidePrivateData && <th className="px-3 py-3 text-right whitespace-nowrap">Costo</th>}
                  <th className="px-3 py-3 text-right min-w-[140px]">
                    {multiPricesOn ? labelOf('price1') : 'Precio de venta'}
                  </th>
                  {!hidePrivateData && <th className="px-3 py-3 text-right whitespace-nowrap">Margen</th>}
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageProducts.map((p) => {
                  const dirty = productDirty(p)
                  const invalid = productInvalid(p)
                  const cost = Number(p.cost) || 0
                  const hasCost = p.cost != null && cost > 0
                  const isExpanded = expanded.has(p.id)
                  const expandable = hasExtras(p)
                  const simplePrice = !hasVariants(p) ? Number(currentField(p, 'price')) || 0 : null

                  return (
                    <Fragment key={p.id}>
                    <tr className={invalid ? 'bg-red-50' : dirty ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 align-middle">
                        <button onClick={() => toggleRow(p.id)} className="p-1 hover:bg-gray-100 rounded">
                          {selected.has(p.id) ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5 text-gray-400" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {expandable && (
                          <button onClick={() => toggleExpanded(p.id)} className="p-1 hover:bg-gray-100 rounded" title={isExpanded ? 'Contraer' : 'Expandir'}>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
                          </button>
                        )}
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
                        <div className="font-medium text-gray-900 truncate max-w-[280px]" title={p.name}>{p.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {p.sku && <span className="font-mono text-[11px] text-primary-700">{p.sku}</span>}
                          {hasVariants(p) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700">
                              {p.variants.length} variantes
                            </span>
                          )}
                          {hasPresentations(p) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                              {p.presentations.length} presentaciones
                            </span>
                          )}
                          {hasMultiPrices(p) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                              multi-precio
                            </span>
                          )}
                        </div>
                      </td>

                      {!hidePrivateData && (
                        <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
                          {hasCost ? <span className="text-gray-700">{fmt(cost, p)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                      )}

                      <td className="px-3 py-2 align-middle text-right">
                        {hasVariants(p) ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-gray-500 text-xs">expande para editar</span>
                            <Button variant="outline" size="sm" onClick={() => onEditProduct?.(p)} className="!py-1 !px-2" title="Abrir editor completo">
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <PriceCell
                            currency={currencySymbol(p)}
                            value={getPatch(p).price !== undefined ? getPatch(p).price : (p.price ?? '')}
                            dirty={isFieldDirty(p.price, getPatch(p).price)}
                            invalid={isFieldInvalid(getPatch(p).price)}
                            onChange={(v) => setProductField(p.id, 'price', v)}
                          />
                        )}
                      </td>

                      {!hidePrivateData && (
                        <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
                          {hasVariants(p) ? <span className="text-gray-300">—</span> : renderMargin(cost, simplePrice || 0, p)}
                        </td>
                      )}

                      <td className="px-3 py-2 align-middle">
                        {dirty && (
                          <button onClick={() => resetRow(p)} className="p-1 text-gray-400 hover:text-gray-700 rounded" title="Deshacer cambios">
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Fila expandida: extras (reusa el helper renderExtras) */}
                    {expandable && isExpanded && (
                      <tr className="bg-gray-50/50">
                        <td colSpan={hidePrivateData ? 6 : 8} className="px-3 py-3">
                          {renderExtras(p, { isMobile: false })}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-600">
              <span className="font-medium">{startIndex + 1}</span>–
              <span className="font-medium">{Math.min(startIndex + perPage, filteredProducts.length)}</span>
              <span className="hidden sm:inline"> de <span className="font-medium">{filteredProducts.length}</span></span>
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
              <button onClick={() => setPage(1)} disabled={safePage === 1} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(safePage - 1)} disabled={safePage === 1} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-sm text-gray-600">{safePage} / {totalPages}</span>
              <button onClick={() => setPage(safePage + 1)} disabled={safePage === totalPages} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
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
                {dirtyProducts.length} producto{dirtyProducts.length !== 1 ? 's' : ''} con cambios
              </span>
              {invalidCount > 0 && (
                <span className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {invalidCount} inválido{invalidCount !== 1 ? 's' : ''}
                </span>
              )}
              <button onClick={discardAll} className="text-sm text-gray-500 hover:text-gray-700">Descartar</button>
            </div>
            <Button onClick={handleSave} disabled={isSaving || invalidCount > 0} className="w-full sm:w-auto">
              {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando…</>
                       : <><Save className="w-4 h-4 mr-2" /> Guardar {dirtyProducts.length} producto{dirtyProducts.length !== 1 ? 's' : ''}</>}
            </Button>
          </div>
        </div>
      )}

      {/* Modal de ajuste masivo */}
      <Modal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} title="Ajuste masivo de precios" size="lg">
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
            Se aplicará a <span className="font-semibold">{bulkScope.length} producto{bulkScope.length !== 1 ? 's' : ''}</span>{' '}
            {selected.size > 0 ? '(los seleccionados)' : '(todos los del filtro actual)'}.
            Los cambios quedan listos para revisar; no se guardan hasta pulsar “Guardar”.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aplicar a</label>
            <select
              value={bulkApplyTo}
              onChange={(e) => setBulkApplyTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="price">{multiPricesOn ? labelOf('price1') : 'Precio principal'}</option>
              {multiPricesOn && <option value="price2">{labelOf('price2')}</option>}
              {multiPricesOn && <option value="price3">{labelOf('price3')}</option>}
              {multiPricesOn && <option value="price4">{labelOf('price4')}</option>}
              {multiPricesOn && <option value="allPrices">Todos los precios (1–4)</option>}
              {presentationsOn && <option value="presentations">Todas las presentaciones</option>}
              <option value="variants">Todas las variantes (precio principal)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              El cambio se aplica al campo elegido en cada producto del alcance.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { key: 'up', label: 'Subir %' },
              { key: 'down', label: 'Bajar %' },
              { key: 'margin', label: 'Margen objetivo' },
              { key: 'round', label: 'Redondear' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setBulkMode(opt.key)}
                disabled={opt.key === 'margin' && (bulkApplyTo === 'presentations' || bulkApplyTo === 'variants' || bulkApplyTo === 'allPrices')}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  bulkMode === opt.key ? 'bg-primary-600 text-white border-primary-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                title={opt.key === 'margin' ? 'Margen objetivo solo aplica a un nivel de precio del producto (no presentaciones/variantes)' : ''}
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
                Calcula el precio desde el costo ({marginFormula === 'margin' ? 'margen sobre la venta' : 'recargo sobre el costo'}). Los productos sin costo se omiten.
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
