import { useState, useEffect, useMemo } from 'react'
import { Loader2, Printer, FileText, ChevronDown, ChevronRight, Search, Wallet, Filter } from 'lucide-react'
import jsPDF from 'jspdf'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getInvoices } from '@/services/firestoreService'
import { getInvoiceDate, parseLocalDateString } from '@/utils/invoiceDate'

/**
 * Reporte de Pagos Pendientes (cuentas por cobrar) — agrupado POR CLIENTE.
 *
 * Muestra, por cada cliente con deuda, cuántos comprobantes tiene pendientes y
 * cuánto debe en total (ventas al crédito `paymentStatus: 'pending'` y pagos
 * parciales `'partial'`; el pendiente por comprobante es `balance`). Aplica a
 * notas de venta y facturas — el mismo modelo que usa "Registrar Pago" en Ventas.
 *
 * - Filtro por rango de fecha de emisión + búsqueda por cliente.
 * - Vista en pantalla (filas expandibles con el detalle de comprobantes).
 * - Impresión como ticket 80mm o PDF A4, ambos generados con jsPDF (un PDF no
 *   lleva los encabezados/pies del navegador: sin fecha, "about:blank" ni 1/1).
 * - Multi-divisa: los montos se agrupan por moneda (PEN / USD), nunca se suman
 *   soles con dólares.
 *
 * Carga TODOS los comprobantes al abrir (independiente del filtro de fecha de la
 * página de Ventas: las deudas viejas son justo las que importan). El caller pasa
 * `canAccess` ya combinado (ubicación + vendedor asignado) para respetar los
 * permisos del usuario secundario.
 */

// Pendiente de un comprobante: `balance` si existe; si es venta al crédito sin
// balance guardado (datos legacy), el total completo.
const getPendingAmount = (inv) => {
  const bal = Number(inv?.balance)
  if (Number.isFinite(bal)) return bal
  if (inv?.paymentStatus === 'pending') return Number(inv?.total) || 0
  return 0
}

const isPendingInvoice = (inv) =>
  (inv.documentType === 'nota_venta' || inv.documentType === 'factura') &&
  inv.status !== 'cancelled' &&
  inv.status !== 'voided' &&
  inv.archived !== true &&
  !inv.convertedTo &&
  (inv.paymentStatus === 'pending' || inv.paymentStatus === 'partial') &&
  getPendingAmount(inv) > 0.01

const DOC_TYPE_LABEL = { nota_venta: 'N. Venta', factura: 'Factura' }

// "S/ 120.00" o "S/ 120.00 + US$ 30.00" según las monedas presentes
const formatTotals = (totals) => {
  const parts = []
  if (totals.PEN > 0.001) parts.push(formatCurrency(totals.PEN, 'PEN'))
  if (totals.USD > 0.001) parts.push(formatCurrency(totals.USD, 'USD'))
  return parts.join(' + ') || formatCurrency(0, 'PEN')
}

export default function PendingPaymentsReport({ isOpen, onClose, businessId, demoInvoices, canAccess, companySettings }) {
  const [isLoading, setIsLoading] = useState(false)
  const [allInvoices, setAllInvoices] = useState([])
  const [dateFilter, setDateFilter] = useState('all') // 'all' | 'today' | 'yesterday' | '7days' | 'month' | 'custom'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [printMenuOpen, setPrintMenuOpen] = useState(false)

  // Cargar comprobantes al abrir (todos: las deudas antiguas son las que importan)
  useEffect(() => {
    if (!isOpen) {
      setPrintMenuOpen(false)
      return
    }
    let cancelled = false
    const load = async () => {
      if (demoInvoices) {
        setAllInvoices(demoInvoices)
        return
      }
      if (!businessId) return
      setIsLoading(true)
      try {
        const result = await getInvoices(businessId)
        if (!cancelled && result.success) setAllInvoices(result.data || [])
      } catch (e) {
        console.error('Error cargando pagos pendientes:', e)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isOpen, businessId, demoInvoices])

  // Comprobantes pendientes visibles (permisos + rango de fecha)
  const pendingInvoices = useMemo(() => {
    // Rango efectivo según el preset elegido (mismos chips que la página de Ventas)
    let start = null
    let end = null
    const now = new Date()
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (dateFilter === 'today') {
      start = startOfDay(now)
    } else if (dateFilter === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      start = startOfDay(y)
      end = new Date(start)
      end.setHours(23, 59, 59, 999)
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
    return allInvoices
      .filter(inv => (canAccess ? canAccess(inv) : true))
      .filter(isPendingInvoice)
      .filter(inv => {
        if (!start && !end) return true
        const d = getInvoiceDate(inv)
        if (!d) return false
        if (start && d < start) return false
        if (end && d > end) return false
        return true
      })
  }, [allInvoices, canAccess, dateFilter, startDate, endDate])

  // Agrupar por cliente
  const customers = useMemo(() => {
    const map = new Map()
    for (const inv of pendingInvoices) {
      const cust = inv.customer || {}
      const docNumber = cust.documentNumber ? String(cust.documentNumber).trim() : ''
      const name = (cust.name || '').trim() || 'Cliente sin nombre'
      const key = docNumber || name.toUpperCase()
      if (!map.has(key)) map.set(key, { key, name, docNumber, count: 0, totals: { PEN: 0, USD: 0 }, docs: [] })
      const g = map.get(key)
      const ccy = inv.currency === 'USD' ? 'USD' : 'PEN'
      const pending = getPendingAmount(inv)
      g.count++
      g.totals[ccy] += pending
      g.docs.push({
        id: inv.id,
        number: inv.number || '—',
        type: DOC_TYPE_LABEL[inv.documentType] || inv.documentType,
        date: getInvoiceDate(inv),
        total: Number(inv.total) || 0,
        paid: Number(inv.amountPaid) || 0,
        pending,
        ccy,
      })
    }
    const list = [...map.values()]
    for (const g of list) g.docs.sort((a, b) => (a.date?.getTime?.() || 0) - (b.date?.getTime?.() || 0))
    // Mayor deuda primero (por PEN; a igual PEN, por USD)
    list.sort((a, b) => (b.totals.PEN - a.totals.PEN) || (b.totals.USD - a.totals.USD))
    return list
  }, [pendingInvoices])

  // Búsqueda por cliente (nombre o documento)
  const visibleCustomers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(c => c.name.toLowerCase().includes(q) || c.docNumber.toLowerCase().includes(q))
  }, [customers, searchTerm])

  const grandTotals = useMemo(() => {
    const t = { PEN: 0, USD: 0, docs: 0 }
    for (const c of visibleCustomers) {
      t.PEN += c.totals.PEN
      t.USD += c.totals.USD
      t.docs += c.count
    }
    return t
  }, [visibleCustomers])

  const toggleExpanded = (key) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const businessName = companySettings?.tradeName || companySettings?.businessName || ''
  const rangeLabel = (() => {
    if (dateFilter === 'today') return 'Hoy'
    if (dateFilter === 'yesterday') return 'Ayer'
    if (dateFilter === '7days') return 'Últimos 7 días'
    if (dateFilter === 'month') return 'Este mes'
    if (dateFilter === 'custom' && (startDate || endDate)) {
      return `${startDate ? formatDate(parseLocalDateString(startDate)) : 'Inicio'} — ${endDate ? formatDate(parseLocalDateString(endDate)) : 'Hoy'}`
    }
    return 'Todas las fechas'
  })()

  const openPdf = (doc) => {
    try {
      doc.autoPrint()
      const url = doc.output('bloburl')
      const win = window.open(url, '_blank')
      if (!win) return false
      return true
    } catch (e) {
      console.error('Error generando PDF de pagos pendientes:', e)
      return false
    }
  }

  // ===== PDF A4: lista por cliente con detalle de comprobantes =====
  const handleDownloadPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const W = 210, MX = 14
    let y = 16

    const ensureSpace = (needed) => {
      if (y + needed > 283) {
        doc.addPage()
        y = 16
      }
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('PAGOS PENDIENTES', W / 2, y, { align: 'center' })
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (businessName) { doc.text(businessName, W / 2, y, { align: 'center' }); y += 4.5 }
    doc.text(`Período: ${rangeLabel} · Generado: ${formatDate(new Date())}`, W / 2, y, { align: 'center' })
    y += 7

    doc.setDrawColor(0)
    doc.line(MX, y, W - MX, y)
    y += 5

    for (const c of visibleCustomers) {
      ensureSpace(14)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(c.name.slice(0, 60), MX, y)
      doc.text(formatTotals(c.totals), W - MX, y, { align: 'right' })
      y += 4.5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(90, 90, 90)
      doc.text(`${c.docNumber ? c.docNumber + ' · ' : ''}${c.count} comprobante${c.count === 1 ? '' : 's'} pendiente${c.count === 1 ? '' : 's'}`, MX, y)
      doc.setTextColor(0, 0, 0)
      y += 4.5
      for (const d of c.docs) {
        ensureSpace(5)
        doc.setFontSize(8)
        doc.text(`${d.type} ${d.number}  ·  ${d.date ? formatDate(d.date) : '—'}`, MX + 4, y)
        doc.text(
          `Total ${formatCurrency(d.total, d.ccy)}  ·  Pagado ${formatCurrency(d.paid, d.ccy)}  ·  Debe ${formatCurrency(d.pending, d.ccy)}`,
          W - MX, y, { align: 'right' }
        )
        y += 4
      }
      y += 2
      doc.setDrawColor(200)
      doc.line(MX, y, W - MX, y)
      y += 4
    }

    ensureSpace(12)
    doc.setDrawColor(0)
    doc.line(MX, y, W - MX, y)
    y += 5.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(`TOTAL (${visibleCustomers.length} cliente${visibleCustomers.length === 1 ? '' : 's'}, ${grandTotals.docs} comprobante${grandTotals.docs === 1 ? '' : 's'})`, MX, y)
    doc.text(formatTotals(grandTotals), W - MX, y, { align: 'right' })

    openPdf(doc)
  }

  // ===== Ticket 80mm: resumen compacto por cliente, alto dinámico =====
  const handlePrintTicket = () => {
    const W = 80, MX = 4
    // Pre-cálculo del alto: header + (2 líneas + extra USD) por cliente + total
    let height = 30
    for (const c of visibleCustomers) {
      height += 9
      if (c.totals.PEN > 0.001 && c.totals.USD > 0.001) height += 4
    }
    height += 22
    const doc = new jsPDF({ unit: 'mm', format: [W, Math.max(height, 60)] })
    let y = 8

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('PAGOS PENDIENTES', W / 2, y, { align: 'center' })
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    if (businessName) { doc.text(businessName.slice(0, 40), W / 2, y, { align: 'center' }); y += 4 }
    doc.text(rangeLabel, W / 2, y, { align: 'center' })
    y += 3
    doc.setLineDashPattern([1, 1], 0)
    doc.line(MX, y, W - MX, y)
    doc.setLineDashPattern([], 0)
    y += 5

    for (const c of visibleCustomers) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.text(c.name.slice(0, 38), MX, y)
      y += 4
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(`${c.count} comp.`, MX, y)
      if (c.totals.PEN > 0.001 && c.totals.USD > 0.001) {
        doc.setFont('helvetica', 'bold')
        doc.text(formatCurrency(c.totals.PEN, 'PEN'), W - MX, y, { align: 'right' })
        y += 4
        doc.text(formatCurrency(c.totals.USD, 'USD'), W - MX, y, { align: 'right' })
      } else {
        doc.setFont('helvetica', 'bold')
        doc.text(formatTotals(c.totals), W - MX, y, { align: 'right' })
      }
      y += 5
    }

    doc.setLineDashPattern([1, 1], 0)
    doc.line(MX, y, W - MX, y)
    doc.setLineDashPattern([], 0)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(`TOTAL (${grandTotals.docs} comp.)`, MX, y)
    if (grandTotals.PEN > 0.001 && grandTotals.USD > 0.001) {
      doc.text(formatCurrency(grandTotals.PEN, 'PEN'), W - MX, y, { align: 'right' })
      y += 4.5
      doc.text(formatCurrency(grandTotals.USD, 'USD'), W - MX, y, { align: 'right' })
    } else {
      doc.text(formatTotals(grandTotals), W - MX, y, { align: 'right' })
    }
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(`Generado: ${formatDate(new Date())}`, W / 2, y, { align: 'center' })

    openPdf(doc)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pagos pendientes por cliente" size="3xl">
      <div className="space-y-4">
        {/* Filtro de período (mismos chips que la página de Ventas) */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600 font-medium">Período:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'all', label: 'Todo' },
              { value: 'today', label: 'Hoy' },
              { value: 'yesterday', label: 'Ayer' },
              { value: '7days', label: '7 días' },
              { value: 'month', label: 'Este mes' },
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
        </div>

        {/* Fechas personalizadas (solo con "Personalizado") + buscador */}
        <div className={`grid grid-cols-2 gap-3 items-end ${dateFilter === 'custom' ? 'sm:grid-cols-[150px_150px_1fr]' : 'sm:grid-cols-1'}`}>
          {dateFilter === 'custom' && (
            <>
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
            </>
          )}
          <div className="col-span-2 sm:col-span-1">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por nombre o documento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            <span className="ml-2 text-sm text-gray-600">Cargando comprobantes...</span>
          </div>
        ) : visibleCustomers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Wallet className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No hay pagos pendientes{(dateFilter !== 'all' || searchTerm) ? ' con los filtros aplicados' : ''}.</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
            {visibleCustomers.map((c) => (
              <div key={c.key}>
                <button
                  onClick={() => toggleExpanded(c.key)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-left"
                >
                  {expanded.has(c.key)
                    ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-500">
                      {c.docNumber ? `${c.docNumber} · ` : ''}{c.count} comprobante{c.count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-primary-600 whitespace-nowrap">{formatTotals(c.totals)}</span>
                </button>
                {expanded.has(c.key) && (
                  <div className="px-9 pb-2.5 space-y-1">
                    {c.docs.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-xs text-gray-600 gap-2">
                        <span className="truncate">{d.type} {d.number} · {d.date ? formatDate(d.date) : '—'}</span>
                        <span className="whitespace-nowrap">
                          <span className="text-green-600">Pagado {formatCurrency(d.paid, d.ccy)}</span> · <span className="font-semibold text-primary-600">Debe {formatCurrency(d.pending, d.ccy)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Total general */}
        {!isLoading && visibleCustomers.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-primary-50 border border-primary-100 rounded-xl">
            <p className="text-sm font-medium text-primary-900">
              {visibleCustomers.length} cliente{visibleCustomers.length === 1 ? '' : 's'} · {grandTotals.docs} comprobante{grandTotals.docs === 1 ? '' : 's'}
            </p>
            <p className="text-lg font-bold text-primary-700">{formatTotals(grandTotals)}</p>
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <div className="relative">
            <Button
              onClick={() => setPrintMenuOpen((o) => !o)}
              disabled={isLoading || visibleCustomers.length === 0}
              className="w-full sm:w-auto"
            >
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
              <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${printMenuOpen ? 'rotate-180' : ''}`} />
            </Button>
            {printMenuOpen && (
              <>
                {/* Backdrop invisible para cerrar al hacer click fuera */}
                <div className="fixed inset-0 z-10" onClick={() => setPrintMenuOpen(false)} />
                <div className="absolute right-0 bottom-full mb-2 z-20 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1">
                  <button
                    onClick={() => { setPrintMenuOpen(false); handlePrintTicket() }}
                    className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                  >
                    <Printer className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">Ticket 80mm</span>
                      <span className="block text-xs text-gray-500">Resumen compacto para impresora térmica</span>
                    </span>
                  </button>
                  <button
                    onClick={() => { setPrintMenuOpen(false); handleDownloadPdf() }}
                    className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                  >
                    <FileText className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">PDF A4</span>
                      <span className="block text-xs text-gray-500">Con el detalle de cada comprobante</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
