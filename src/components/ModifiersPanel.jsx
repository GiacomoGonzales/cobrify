import { useState, useEffect, useMemo } from 'react'
import { Loader2, BarChart3, Copy, Save, ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getInvoices, getProducts } from '@/services/firestoreService'
import { getInvoiceDate, parseLocalDateString } from '@/utils/invoiceDate'
import { getModifierTemplates, saveModifierTemplates } from '@/services/modifierTemplateService'
import ProductModifiersSection from '@/components/ProductModifiersSection'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  XLSX,
  cellStyle, centerStyle, numberStyle,
  setStyle,
  applyTitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  saveAndShareExcel,
} from '@/services/excelStyles'

/**
 * Pestaña "Modificadores" de la página Insumos (modo restaurante).
 *
 * - Reporte: cuánto se pidió cada opción de modificador (toppings, cremas,
 *   extras...) en un rango de fechas, con el ingreso de los agregados de pago.
 *   Los datos salen de los comprobantes emitidos (items[].modifiers ya guardados
 *   en cada venta) → funciona retroactivo. El filtro "Solo con control" usa el
 *   flag trackUsage del modificador en la definición ACTUAL del producto.
 * - Plantillas: grupos de modificadores reutilizables que se insertan en los
 *   productos desde el editor ("Desde plantilla"). Al insertar se copian.
 */

const norm = (s) => String(s || '').trim().toLowerCase()

export default function ModifiersPanel({ companySettings }) {
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [subTab, setSubTab] = useState('report') // 'report' | 'templates'

  // ===== Reporte =====
  const [isLoading, setIsLoading] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [products, setProducts] = useState([])
  const [dateFilter, setDateFilter] = useState('month') // 'all' | 'today' | '7days' | 'month' | 'custom'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [scope, setScope] = useState('all') // 'all' | 'tracked'
  const [expandedGroups, setExpandedGroups] = useState(() => new Set())

  // ===== Plantillas =====
  const [templates, setTemplates] = useState([])
  const [templatesDirty, setTemplatesDirty] = useState(false)
  const [isSavingTemplates, setIsSavingTemplates] = useState(false)

  useEffect(() => {
    if (isDemoMode) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const businessId = getBusinessId()
        const [invRes, prodRes, tplRes] = await Promise.all([
          getInvoices(businessId),
          getProducts(businessId),
          getModifierTemplates(businessId),
        ])
        if (cancelled) return
        if (invRes.success) setInvoices(invRes.data || [])
        if (prodRes.success) setProducts(prodRes.data || [])
        if (tplRes.success) setTemplates(tplRes.data || [])
      } catch (e) {
        console.error('Error cargando datos de modificadores:', e)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode])

  // ¿El grupo del modificador está marcado "Llevar control" en la definición
  // actual del producto? (por id del modificador, con fallback por nombre)
  const productMap = useMemo(() => {
    const map = new Map()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  const isTracked = (productId, mod) => {
    const product = productMap.get(productId)
    if (!product?.modifiers?.length) return false
    const def = product.modifiers.find(m => m.id === mod.modifierId)
      || product.modifiers.find(m => norm(m.name) === norm(mod.modifierName))
    return def?.trackUsage === true
  }

  // Agregación: grupo (por nombre normalizado, unifica entre productos) → opciones
  const report = useMemo(() => {
    let start = null
    let end = null
    const now = new Date()
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (dateFilter === 'today') {
      start = startOfDay(now)
    } else if (dateFilter === '7days') {
      const s = new Date(now)
      s.setDate(s.getDate() - 6)
      start = startOfDay(s)
    } else if (dateFilter === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (dateFilter === 'custom') {
      start = startDate ? parseLocalDateString(startDate) : null
      end = endDate ? parseLocalDateString(endDate) : null
      if (end) end.setHours(23, 59, 59, 999)
    }

    const groups = new Map()
    let salesWithModifiers = 0

    for (const inv of invoices) {
      // Solo ventas reales: sin anuladas, sin NC/ND, sin notas ya convertidas
      if (inv.documentType !== 'nota_venta' && inv.documentType !== 'boleta' && inv.documentType !== 'factura') continue
      if (inv.status === 'cancelled' || inv.status === 'voided' || inv.archived === true || inv.convertedTo) continue
      if (start || end) {
        const d = getInvoiceDate(inv)
        if (!d) continue
        if (start && d < start) continue
        if (end && d > end) continue
      }

      let invoiceHasMods = false
      for (const item of inv.items || []) {
        if (!Array.isArray(item.modifiers) || item.modifiers.length === 0) continue
        invoiceHasMods = true
        const itemQty = Number(item.quantity) || 1
        for (const mod of item.modifiers) {
          const tracked = isTracked(item.productId, mod)
          if (scope === 'tracked' && !tracked) continue
          const gKey = norm(mod.modifierName) || '(sin nombre)'
          if (!groups.has(gKey)) {
            groups.set(gKey, { key: gKey, name: mod.modifierName || '(sin nombre)', tracked: false, units: 0, revenue: 0, options: new Map() })
          }
          const g = groups.get(gKey)
          if (tracked) g.tracked = true
          for (const opt of mod.options || []) {
            const units = (Number(opt.quantity) || 1) * itemQty
            const revenue = (Number(opt.priceAdjustment) || 0) * units
            const oKey = norm(opt.optionName) || '(sin nombre)'
            if (!g.options.has(oKey)) {
              g.options.set(oKey, { key: oKey, name: opt.optionName || '(sin nombre)', units: 0, revenue: 0 })
            }
            const o = g.options.get(oKey)
            o.units += units
            o.revenue += revenue
            g.units += units
            g.revenue += revenue
          }
        }
      }
      if (invoiceHasMods) salesWithModifiers++
    }

    const list = [...groups.values()].map(g => ({
      ...g,
      options: [...g.options.values()].sort((a, b) => b.units - a.units),
    }))
    list.sort((a, b) => b.units - a.units)

    const totals = list.reduce(
      (t, g) => ({ units: t.units + g.units, revenue: t.revenue + g.revenue }),
      { units: 0, revenue: 0 }
    )
    return { groups: list, totals, salesWithModifiers }
  }, [invoices, scope, dateFilter, startDate, endDate, productMap])

  const rangeLabel = (() => {
    if (dateFilter === 'today') return 'Hoy'
    if (dateFilter === '7days') return 'Últimos 7 días'
    if (dateFilter === 'month') return 'Este mes'
    if (dateFilter === 'custom' && (startDate || endDate)) {
      return `${startDate ? formatDate(parseLocalDateString(startDate)) : 'Inicio'} — ${endDate ? formatDate(parseLocalDateString(endDate)) : 'Hoy'}`
    }
    return 'Todas las fechas'
  })()

  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ===== Export Excel =====
  const handleDownloadExcel = async () => {
    const headers = ['Grupo', 'Opción', 'Veces pedida', 'Ingreso adicional S/']
    const totalCols = headers.length
    const aoa = [['REPORTE DE MODIFICADORES'], []]
    const metaStart = aoa.length
    aoa.push(...buildBusinessMetadataRows(companySettings, {
      periodLabel: rangeLabel,
      totalLabel: 'Grupos de modificadores',
      totalItems: report.groups.length,
      extra: [['Filtro:', scope === 'tracked' ? 'Solo con control' : 'Todos los modificadores']],
    }))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(headers)
    const dataStart = aoa.length
    let rowCount = 0
    for (const g of report.groups) {
      for (const o of g.options) {
        aoa.push([g.name, o.name, Number(o.units), Number(o.revenue.toFixed(2))])
        rowCount++
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, [30, 30, 14, 18])
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < rowCount; i++) {
      const r = dataStart + i
      setStyle(ws, r, 0, cellStyle(i))
      setStyle(ws, r, 1, cellStyle(i))
      setStyle(ws, r, 2, centerStyle(i))
      setStyle(ws, r, 3, numberStyle(i))
    }
    applyFreezeBelow(ws, headerRow)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Modificadores')
    await saveAndShareExcel(wb, buildExcelFileName('Modificadores'), {
      shareTitle: 'Reporte de Modificadores',
      shareText: 'Reporte de modificadores vendidos',
    })
  }

  // ===== Plantillas =====
  const handleTemplatesChange = (next) => {
    setTemplates(next)
    setTemplatesDirty(true)
  }

  const handleSaveTemplates = async () => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setIsSavingTemplates(true)
    try {
      const res = await saveModifierTemplates(getBusinessId(), templates)
      if (res.success) {
        setTemplatesDirty(false)
        toast.success('Plantillas guardadas')
      } else {
        throw new Error(res.error)
      }
    } catch (e) {
      console.error('Error guardando plantillas:', e)
      toast.error('No se pudieron guardar las plantillas')
    } finally {
      setIsSavingTemplates(false)
    }
  }

  if (isDemoMode) {
    return (
      <div className="text-center py-12 text-gray-500">
        <BarChart3 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">El reporte de modificadores no está disponible en modo demo.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sub-pestañas */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-full sm:w-auto sm:inline-flex">
        <button
          type="button"
          onClick={() => setSubTab('report')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            subTab === 'report' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Reporte
        </button>
        <button
          type="button"
          onClick={() => setSubTab('templates')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            subTab === 'templates' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Copy className="w-4 h-4" />
          Plantillas
        </button>
      </div>

      {subTab === 'report' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'today', label: 'Hoy' },
                { value: '7days', label: '7 días' },
                { value: 'month', label: 'Este mes' },
                { value: 'all', label: 'Todo' },
                { value: 'custom', label: 'Personalizado' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDateFilter(option.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    dateFilter === option.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              {[
                { value: 'all', label: 'Todos' },
                { value: 'tracked', label: 'Solo con control' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setScope(option.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    scope === option.value
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {dateFilter === 'custom' && (
            <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          )}

          {/* Lista */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              <span className="ml-2 text-sm text-gray-600">Cargando ventas...</span>
            </div>
          ) : report.groups.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">
                {scope === 'tracked'
                  ? 'No hay ventas de modificadores con "Llevar control" en este período. Marca "Llevar control" en los modificadores del producto (Productos > editar > Modificadores), o cambia el filtro a "Todos".'
                  : 'No hay ventas con modificadores en este período.'}
              </p>
            </div>
          ) : (
            <>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {report.groups.map((g) => (
                  <div key={g.key}>
                    <button
                      onClick={() => toggleGroup(g.key)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-left"
                    >
                      {expandedGroups.has(g.key)
                        ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {g.name}
                          {g.tracked && (
                            <span className="ml-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Control</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{g.options.length} opción{g.options.length === 1 ? '' : 'es'}</p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <p className="text-sm font-bold text-gray-900">{g.units} pedida{g.units === 1 ? '' : 's'}</p>
                        {g.revenue > 0.001 && (
                          <p className="text-xs font-medium text-green-600">+{formatCurrency(g.revenue)}</p>
                        )}
                      </div>
                    </button>
                    {expandedGroups.has(g.key) && (
                      <div className="pl-9 pr-3 pb-2.5 space-y-1">
                        {g.options.map((o) => (
                          <div key={o.key} className="flex items-center justify-between text-xs text-gray-600 gap-2">
                            <span className="truncate flex-1">{o.name}</span>
                            <span className="whitespace-nowrap">
                              <span className="font-semibold text-gray-900">{o.units}</span>
                              {o.revenue > 0.001 && (
                                <span className="text-green-600 ml-2">+{formatCurrency(o.revenue)}</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Totales + export */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-primary-50 border border-primary-100 rounded-xl">
                <p className="text-sm font-medium text-primary-900">
                  {report.groups.length} grupo{report.groups.length === 1 ? '' : 's'} · {report.totals.units} opciones pedidas · Ingreso por agregados: <strong>{formatCurrency(report.totals.revenue)}</strong>
                </p>
                <Button size="sm" variant="outline" onClick={handleDownloadExcel}>
                  <FileSpreadsheet className="w-4 h-4 mr-1.5 text-green-600" />
                  Excel
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {subTab === 'templates' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              Define acá grupos de modificadores reutilizables (ej. "Cremas", "Término de la carne").
              Luego, en el editor de cada producto, usa <strong>"Desde plantilla"</strong> para insertarlos
              sin volver a escribirlos. Al insertar se copia: editar la plantilla después NO cambia los
              productos que ya la usan.
            </p>
          </div>

          <ProductModifiersSection
            modifiers={templates}
            onChange={handleTemplatesChange}
            enableTemplates={false}
            title="Plantillas de modificadores"
            description="Estos grupos estarán disponibles en el editor de productos con el botón 'Desde plantilla'."
          />

          <div className="flex items-center justify-end gap-3">
            {templatesDirty && (
              <span className="text-xs text-amber-600 font-medium">Hay cambios sin guardar</span>
            )}
            <Button onClick={handleSaveTemplates} disabled={isSavingTemplates || !templatesDirty}>
              {isSavingTemplates ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar plantillas
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
