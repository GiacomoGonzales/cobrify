import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, BarChart3, Copy, Save, ChevronDown, ChevronRight, FileSpreadsheet, HelpCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getInvoices, getProducts, getProductCategories } from '@/services/firestoreService'
import Modal from '@/components/ui/Modal'
import { getInvoiceDate, parseLocalDateString } from '@/utils/invoiceDate'
import {
  getModifierTemplates, saveModifierTemplates, aplicarPlantillaAProductos,
} from '@/services/modifierTemplateService'
import {
  modificadoresEnUso, resumenDeModificadores, plantillaDesdeVersion, nombreComparable,
  grupoEsDeLaPlantilla, planDeAplicacion, planDeSincronizacion,
} from '@/utils/modificadoresEnUso'
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
  const [expandedUso, setExpandedUso] = useState(() => new Set())

  // ===== Aplicar una plantilla a los productos =====
  const [categories, setCategories] = useState([])
  const [aplicando, setAplicando] = useState(null) // la plantilla elegida
  const [incluirLosQueLaUsan, setIncluirLosQueLaUsan] = useState(true)
  const [categoriasElegidas, setCategoriasElegidas] = useState(() => new Set())
  const [isApplying, setIsApplying] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    if (isDemoMode) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const businessId = getBusinessId()
        const [invRes, prodRes, tplRes, catRes] = await Promise.all([
          getInvoices(businessId),
          getProducts(businessId),
          getModifierTemplates(businessId),
          getProductCategories(businessId),
        ])
        if (cancelled) return
        if (invRes.success) setInvoices(invRes.data || [])
        if (prodRes.success) setProducts(prodRes.data || [])
        if (tplRes.success) setTemplates(tplRes.data || [])
        if (catRes.success) setCategories(catRes.data || [])
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
  // Lo que el negocio YA tiene escrito dentro de sus productos, agrupado por
  // nombre. Las plantillas llegaron después: en un negocio que viene de antes
  // están vacías, así que esta pestaña no mostraba nada de lo que realmente usa.
  const enUso = useMemo(() => modificadoresEnUso(products), [products])
  const resumenUso = useMemo(() => resumenDeModificadores(enUso), [enUso])

  // Nombres que ya están como plantilla, para no ofrecer crearla dos veces.
  const clavesDePlantillas = useMemo(
    () => new Set(templates.map((t) => nombreComparable(t?.name))),
    [templates],
  )

  const toggleUso = (clave) => {
    setExpandedUso((prev) => {
      const next = new Set(prev)
      if (next.has(clave)) next.delete(clave)
      else next.add(clave)
      return next
    })
  }

  // Crear la plantilla NO toca los productos: es solo dejar el grupo escrito
  // una vez para que el próximo producto lo tome de ahí en vez de tipearlo.
  // Los productos que ya lo tienen siguen exactamente igual.
  const handleUsarComoPlantilla = (version, nombre) => {
    setTemplates((prev) => [...prev, plantillaDesdeVersion(version, nombre)])
    setTemplatesDirty(true)
    toast.success(`"${nombre}" agregado abajo. Falta guardar.`)
  }

  // ── Aplicar una plantilla a los productos ─────────────────────────────────
  //
  // Es lo que de verdad quita el trabajo repetido: sin esto, cambiarle el
  // precio al Ají significa entrar a los sesenta productos que lo tienen.
  //
  // Sigue siendo una COPIA por producto —el POS y el catálogo leen lo que el
  // producto tiene, igual que siempre—; lo único que cambia es que la copia se
  // rehace desde un solo lugar, cuando el dueño lo pide y viendo antes a
  // cuántos productos alcanza.

  // Las categorías que TIENEN productos, con su conteo. Se cuenta contra los
  // productos reales y no contra el catálogo de categorías: una categoría
  // vacía en la lista solo sería ruido para elegir.
  const categoriasConProductos = useMemo(() => {
    const conteo = new Map()
    for (const p of products) {
      if (p?.category) conteo.set(p.category, (conteo.get(p.category) || 0) + 1)
    }
    return categories
      .filter((c) => conteo.get(c?.id))
      .map((c) => ({ id: c.id, nombre: c.name, productos: conteo.get(c.id) }))
      .sort((a, b) => b.productos - a.productos)
  }, [products, categories])

  // A qué productos alcanza lo elegido: los que ya lo tienen, más los de las
  // categorías marcadas. Un producto que está en las dos cuenta una vez.
  const idsDestino = useMemo(() => {
    if (!aplicando) return new Set()
    const ids = new Set()
    for (const p of products) {
      const yaLoTiene = (p?.modifiers || []).some((g) => grupoEsDeLaPlantilla(g, aplicando))
      if (incluirLosQueLaUsan && yaLoTiene) ids.add(p.id)
      if (p?.category && categoriasElegidas.has(p.category)) ids.add(p.id)
    }
    return ids
  }, [aplicando, products, incluirLosQueLaUsan, categoriasElegidas])

  const plan = useMemo(
    () => (aplicando ? planDeAplicacion(products, aplicando, idsDestino) : null),
    [aplicando, products, idsDestino],
  )

  const cuantosLaUsan = (tpl) =>
    products.filter((p) => (p?.modifiers || []).some((g) => grupoEsDeLaPlantilla(g, tpl))).length

  // Los productos que quedaron con una versión vieja de la plantilla que usan.
  //
  // Editar la plantilla NO los cambia solo: cada producto guarda su copia, que
  // es lo que el POS lee al vender. Antes eso obligaba a ir plato por plato
  // —quitar el modificador viejo y volver a insertarlo—, que es justo lo que no
  // sirve. Acá se detecta y se arregla de una vez.
  //
  // Se calcula sobre las plantillas GUARDADAS: mientras hay cambios sin
  // guardar, actualizar dejaría los productos con algo que ni siquiera está en
  // el negocio todavía.
  const sincronizacion = useMemo(
    () => (templatesDirty ? { porPlantilla: [], cambios: [] } : planDeSincronizacion(products, templates)),
    [products, templates, templatesDirty],
  )

  const handleSincronizar = async () => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    if (!sincronizacion.cambios.length) return
    setIsSyncing(true)
    try {
      const res = await aplicarPlantillaAProductos(getBusinessId(), sincronizacion.cambios)
      if (!res.success) throw new Error(res.error)
      const porId = new Map(sincronizacion.cambios.map((c) => [c.producto.id, c.modifiers]))
      setProducts((prev) => prev.map((p) => (porId.has(p.id) ? { ...p, modifiers: porId.get(p.id) } : p)))
      toast.success(`${res.escritos} producto${res.escritos === 1 ? '' : 's'} actualizado${res.escritos === 1 ? '' : 's'}`)
    } catch (e) {
      console.error('Error sincronizando plantillas:', e)
      toast.error('No se pudieron actualizar los productos')
    } finally {
      setIsSyncing(false)
    }
  }

  const abrirAplicar = (tpl) => {
    setAplicando(tpl)
    setIncluirLosQueLaUsan(true)
    setCategoriasElegidas(new Set())
  }

  const toggleCategoria = (id) => {
    setCategoriasElegidas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAplicar = async () => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    if (!plan?.cambios.length) return
    setIsApplying(true)
    try {
      const res = await aplicarPlantillaAProductos(getBusinessId(), plan.cambios)
      if (!res.success) throw new Error(res.error)

      // Se refleja en memoria lo que se acaba de escribir, para que la lista de
      // "Modificadores en uso" quede al día sin recargar la página.
      const porId = new Map(plan.cambios.map((c) => [c.producto.id, c.modifiers]))
      setProducts((prev) => prev.map((p) => (porId.has(p.id) ? { ...p, modifiers: porId.get(p.id) } : p)))

      toast.success(`Aplicado en ${res.escritos} producto${res.escritos === 1 ? '' : 's'}`)
      setAplicando(null)
    } catch (e) {
      console.error('Error aplicando la plantilla:', e)
      toast.error('No se pudo aplicar la plantilla')
    } finally {
      setIsApplying(false)
    }
  }

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
        // El plan se calcula acá y no se lee del memo: `setTemplatesDirty` no
        // cambia las variables de esta función, así que el memo todavía trae el
        // valor del render anterior (vacío, porque estaba "sucio").
        const pendiente = planDeSincronizacion(products, templates)
        if (pendiente.cambios.length > 0) {
          toast.success(
            `Plantillas guardadas. ${pendiente.cambios.length} producto${pendiente.cambios.length === 1 ? '' : 's'} ` +
            `${pendiente.cambios.length === 1 ? 'sigue' : 'siguen'} con la versión anterior: actualízalos abajo.`,
            7000,
          )
        } else {
          toast.success('Plantillas guardadas')
        }
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
      {/* Sub-pestañas. La guía se enlaza acá y no con GuideLink porque esta
          pantalla es una PESTAÑA de Insumos: el panel lateral resuelve la guía
          por ruta y en /app/ingredientes abriría la de Insumos. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        <Link
          to="/app/manual/modificadores"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
        >
          <HelpCircle className="w-4 h-4" />
          ¿Cómo funciona esta página?
        </Link>
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
        <div className="space-y-6">
          {/* ── Lo que el negocio YA tiene escrito en sus productos ───────── */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Modificadores en uso</h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">
              Todo lo que está escrito dentro de tus productos, agrupado por nombre. Si el mismo
              modificador se tipeó en muchos productos, acá aparece una sola vez.
            </p>

            {enUso.length === 0 ? (
              <p className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg p-4 text-center">
                Ningún producto tiene modificadores todavía.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-600 mb-2">
                  <strong>{resumenUso.escritos}</strong> escritos en los productos,{' '}
                  <strong>{resumenUso.distintos}</strong> distintos
                  {resumenUso.divergentes > 0 && (
                    <> · <strong>{resumenUso.divergentes}</strong> con versiones que no coinciden</>
                  )}
                </p>

                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {enUso.map((m) => {
                    const abierto = expandedUso.has(m.clave)
                    const yaEsPlantilla = clavesDePlantillas.has(m.clave)
                    return (
                      <div key={m.clave}>
                        <button
                          type="button"
                          onClick={() => toggleUso(m.clave)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                        >
                          {abierto
                            ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                          <span className="text-sm font-medium text-gray-900 flex-1 truncate">{m.nombre}</span>
                          {!m.esIgualEnTodos && (
                            <span className="chip-aviso px-2 py-0.5 rounded-full text-xs flex-shrink-0">
                              {m.versiones.length} versiones
                            </span>
                          )}
                          {yaEsPlantilla && (
                            <span className="chip-neutro px-2 py-0.5 rounded-full text-xs flex-shrink-0">
                              Ya es plantilla
                            </span>
                          )}
                          <span className="text-xs text-gray-500 flex-shrink-0">
                            {m.productos} producto{m.productos === 1 ? '' : 's'}
                          </span>
                        </button>

                        {abierto && (
                          <div className="px-3 pb-3 pl-9 space-y-3">
                            {!m.esIgualEnTodos && (
                              <p className="text-xs text-amber-700">
                                Se llaman igual pero no dicen lo mismo. Elige cuál dejar como plantilla;
                                los productos no se tocan.
                              </p>
                            )}
                            {m.versiones.map((v, i) => (
                              <div key={v.firma} className="bg-gray-50 rounded-lg p-3 space-y-2">
                                {!m.esIgualEnTodos && (
                                  <p className="text-xs font-medium text-gray-700">
                                    Versión {i + 1} · {v.productos.length} producto{v.productos.length === 1 ? '' : 's'}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-1.5">
                                  {(v.grupo?.options || []).length === 0 ? (
                                    <span className="text-xs text-gray-500">Sin opciones</span>
                                  ) : (
                                    (v.grupo.options || []).map((o, oi) => (
                                      <span
                                        key={o?.id || oi}
                                        className="chip-neutro px-2 py-0.5 rounded-full text-xs"
                                      >
                                        {o?.name || 'Sin nombre'}
                                        {Number(o?.priceAdjustment) ? ` +${formatCurrency(Number(o.priceAdjustment))}` : ''}
                                      </span>
                                    ))
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">
                                  En: {v.productos.slice(0, 6).map((x) => x.nombre).join(', ')}
                                  {v.productos.length > 6 && ` y ${v.productos.length - 6} más`}
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUsarComoPlantilla(v, m.nombre)}
                                >
                                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                                  Crear plantilla con esta
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Plantillas reutilizables ──────────────────────────────────── */}
          <div className="space-y-4 pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-500 pt-3">
              Las plantillas son los grupos que quedan disponibles en el editor de cada producto con el
              botón <strong>"Desde plantilla"</strong>, para no volver a escribirlos. Al insertarlas se
              copian: editar una plantilla después NO cambia los productos que ya la usan.
            </p>

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

            {/* Lo que quedó con la versión vieja de su plantilla. Aparece solo
                cuando hay algo que hacer, y ahí mismo se arregla: sin esto
                había que ir plato por plato, quitando el modificador viejo y
                volviendo a insertarlo. */}
            {sincronizacion.cambios.length > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                <p className="text-sm text-amber-900">
                  <strong>{sincronizacion.cambios.length}</strong> producto{sincronizacion.cambios.length === 1 ? '' : 's'}
                  {sincronizacion.cambios.length === 1 ? ' quedó' : ' quedaron'} con la versión anterior de{' '}
                  {sincronizacion.porPlantilla.filter((x) => x.desactualizados > 0).length === 1
                    ? `la plantilla "${sincronizacion.porPlantilla.find((x) => x.desactualizados > 0)?.plantilla.name}"`
                    : 'sus plantillas'}.
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  {sincronizacion.cambios.slice(0, 8).map((c) => c.producto.nombre).join(', ')}
                  {sincronizacion.cambios.length > 8 && ` y ${sincronizacion.cambios.length - 8} más`}
                </p>
                <Button size="sm" className="mt-2" onClick={handleSincronizar} disabled={isSyncing}>
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    `Actualizar ${sincronizacion.cambios.length} producto${sincronizacion.cambios.length === 1 ? '' : 's'}`
                  )}
                </Button>
              </div>
            )}

            {/* ── Llevar una plantilla a los productos ──────────────────── */}
            {templates.length > 0 && (
              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">Aplicar a los productos</h3>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">
                  Escribe la plantilla en los productos que ya la usan, o en categorías enteras. Sirve
                  para cambiar un precio en un solo lugar en vez de producto por producto.
                </p>

                {templatesDirty ? (
                  <p className="text-xs text-amber-700 border border-amber-200 bg-amber-50 rounded-lg p-3">
                    Guarda las plantillas primero: se aplica la versión guardada.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {templates.map((tpl) => {
                      const usan = cuantosLaUsan(tpl)
                      return (
                        <div key={tpl.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{tpl.name || 'Sin nombre'}</p>
                            <p className="text-xs text-gray-500">
                              {(tpl.options || []).length} opción{(tpl.options || []).length === 1 ? '' : 'es'}
                              {' · '}
                              {usan === 0 ? 'ningún producto la usa' : `${usan} producto${usan === 1 ? '' : 's'} la usan`}
                            </p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => abrirAplicar(tpl)}>
                            Aplicar
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aplicar una plantilla: se elige a quién y se ven los números antes */}
      <Modal
        isOpen={!!aplicando}
        onClose={() => !isApplying && setAplicando(null)}
        title={`Aplicar "${aplicando?.name || ''}"`}
        size="lg"
      >
        {aplicando && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">¿A qué productos?</p>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incluirLosQueLaUsan}
                  onChange={(e) => setIncluirLosQueLaUsan(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">
                  Los que ya lo tienen
                  <span className="text-gray-500"> · {cuantosLaUsan(aplicando)} producto{cuantosLaUsan(aplicando) === 1 ? '' : 's'}</span>
                </span>
              </label>

              {categoriasConProductos.length > 0 && (
                <>
                  <p className="text-xs text-gray-500 mt-3 mb-1.5 px-2.5">
                    Y además, categorías enteras (lo reciben aunque hoy no lo tengan):
                  </p>
                  <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {categoriasConProductos.map((c) => (
                      <label key={c.id} className="flex items-center gap-2.5 px-2.5 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={categoriasElegidas.has(c.id)}
                          onChange={() => toggleCategoria(c.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700 flex-1 truncate">{c.nombre}</span>
                        <span className="text-xs text-gray-500">{c.productos}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Los números, antes de confirmar */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              {plan?.totales.alcanzados === 0 ? (
                <p className="text-sm text-gray-500">No has elegido ningún producto.</p>
              ) : (
                <>
                  <p className="text-sm text-gray-900">
                    Alcanza a <strong>{plan.totales.alcanzados}</strong> producto{plan.totales.alcanzados === 1 ? '' : 's'}.
                  </p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    {plan.totales.agregan > 0 && (
                      <li><strong>{plan.totales.agregan}</strong> lo reciben por primera vez.</li>
                    )}
                    {plan.totales.reemplazan > 0 && (
                      <li className="text-amber-700">
                        <strong>{plan.totales.reemplazan}</strong> tienen otra cosa y les cambia lo que se cobra.
                      </li>
                    )}
                    {plan.totales.iguales > 0 && (
                      <li><strong>{plan.totales.iguales}</strong> ya lo tienen igual y no se tocan.</li>
                    )}
                  </ul>
                </>
              )}
            </div>

            {plan?.totales.reemplazan > 0 && (
              <div className="text-xs text-gray-600">
                <p className="font-medium text-gray-700 mb-1">Cambian:</p>
                <p>
                  {plan.cambios.filter((c) => c.tipo === 'reemplaza').slice(0, 10).map((c) => c.producto.nombre).join(', ')}
                  {plan.totales.reemplazan > 10 && ` y ${plan.totales.reemplazan - 10} más`}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200">
              <Button variant="outline" onClick={() => setAplicando(null)} disabled={isApplying}>
                Cancelar
              </Button>
              <Button onClick={handleAplicar} disabled={isApplying || !plan?.cambios.length}>
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Aplicando...
                  </>
                ) : (
                  `Aplicar en ${plan?.cambios.length || 0} producto${plan?.cambios.length === 1 ? '' : 's'}`
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
