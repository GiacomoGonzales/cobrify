import { useState, useEffect, useMemo } from 'react'
import { Loader2, Printer, FileText, FileSpreadsheet, ChevronDown, ChevronRight, Search, Wallet, Filter, X } from 'lucide-react'
import jsPDF from 'jspdf'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getInvoices, updateInvoice } from '@/services/firestoreService'
import { getInvoiceDate, parseLocalDateString } from '@/utils/invoiceDate'
import { downloadBlob } from '@/utils/nativeDownload'
import { useToast } from '@/contexts/ToastContext'
import {
  XLSX,
  cellStyle, centerStyle, numberStyle,
  totalLabelStyle, totalNumberStyle,
  setStyle,
  applyTitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  saveAndShareExcel,
} from '@/services/excelStyles'

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

// Fecha de vencimiento pactada del comprobante (facturas al crédito y notas de
// venta con términos activados). Con cuotas: la primera aún no vencida; si ya
// vencieron todas, la última — lo relevante es a partir de cuándo está en mora.
// Devuelve Date o null. Las fechas se guardan como 'YYYY-MM-DD' (sin hora).
const getDueDate = (inv) => {
  const parse = (s) => {
    if (!s || typeof s !== 'string') return null
    const d = new Date(s + 'T00:00:00')
    return isNaN(d) ? null : d
  }
  const cuotas = Array.isArray(inv?.paymentInstallments) ? inv.paymentInstallments : []
  if (cuotas.length > 0) {
    const dates = cuotas.map(c => parse(c?.dueDate)).filter(Boolean).sort((a, b) => a - b)
    if (dates.length > 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      return dates.find(d => d >= today) || dates[dates.length - 1]
    }
  }
  return parse(inv?.paymentDueDate)
}

// ¿La fecha de vencimiento ya pasó? (comparación por día, sin hora)
const isOverdue = (dueDate) => {
  if (!dueDate) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return dueDate < today
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

export default function PendingPaymentsReport({ isOpen, onClose, businessId, demoInvoices, canAccess, companySettings, currentUser, onPaymentsRegistered }) {
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [allInvoices, setAllInvoices] = useState([])
  const [dateFilter, setDateFilter] = useState('all') // 'all' | 'today' | 'yesterday' | '7days' | 'month' | 'custom'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [printMenuOpen, setPrintMenuOpen] = useState(false)
  // Orden de la lista (y de PDFs/Excel): alfabético por defecto — los vendedores
  // buscan por nombre; "Mayor deuda" queda como alternativa.
  const [sortBy, setSortBy] = useState('name') // 'name' | 'debt'
  // Pago grupal: ids de comprobantes seleccionados + modal de confirmación
  const [selected, setSelected] = useState(() => new Set())
  const [groupPayOpen, setGroupPayOpen] = useState(false)
  const [groupPayMethod, setGroupPayMethod] = useState('Efectivo')
  const [isPayingGroup, setIsPayingGroup] = useState(false)

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
      const rawDoc = cust.documentNumber ? String(cust.documentNumber).trim() : ''
      const name = (cust.name || '').trim() || 'Cliente sin nombre'
      // El documento genérico de "Cliente General" (todo ceros o vacío) NO
      // identifica al cliente — muchos clientes distintos lo comparten. Si el
      // doc es genérico, agrupar por NOMBRE (que es lo único que los distingue);
      // si es un documento real (DNI/RUC), agrupar por documento. Se namespacian
      // las claves (doc:/name:) para que un nombre nunca choque con un número.
      const isGenericDoc = !rawDoc || /^0+$/.test(rawDoc)
      const docNumber = isGenericDoc ? '' : rawDoc
      const key = isGenericDoc ? `name:${name.toLowerCase()}` : `doc:${rawDoc}`
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
        // Vencimiento pactado (facturas al crédito y notas de venta con términos).
        // Con cuotas se muestra la más próxima aún no vencida... o la última:
        // lo útil es saber para cuándo se comprometió a pagar.
        dueDate: getDueDate(inv),
      })
    }
    const list = [...map.values()]
    for (const g of list) g.docs.sort((a, b) => (a.date?.getTime?.() || 0) - (b.date?.getTime?.() || 0))
    // Orden elegido: alfabético (default — más fácil ubicar a un cliente) o
    // mayor deuda primero (por PEN; a igual PEN, por USD). Aplica también a
    // los PDFs, el ticket y el Excel, que iteran esta misma lista.
    if (sortBy === 'debt') {
      list.sort((a, b) => (b.totals.PEN - a.totals.PEN) || (b.totals.USD - a.totals.USD))
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    }
    return list
  }, [pendingInvoices, sortBy])

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

  // ===== Selección para pago grupal =====
  const toggleDocSelected = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Checkbox del cliente: marca/desmarca TODOS sus comprobantes
  const toggleCustomerSelected = (customer) => {
    setSelected(prev => {
      const next = new Set(prev)
      const allSelected = customer.docs.every(d => next.has(d.id))
      customer.docs.forEach(d => (allSelected ? next.delete(d.id) : next.add(d.id)))
      return next
    })
  }

  // Solo cuentan los seleccionados VISIBLES (si un filtro saca un doc de la
  // vista, no entra al pago aunque siga en el Set)
  const selectedDocs = useMemo(() => {
    const list = []
    for (const c of visibleCustomers) {
      for (const d of c.docs) {
        if (selected.has(d.id)) list.push({ ...d, customerName: c.name })
      }
    }
    return list
  }, [visibleCustomers, selected])

  const selectedTotals = useMemo(() => {
    const t = { PEN: 0, USD: 0 }
    for (const d of selectedDocs) t[d.ccy] += d.pending
    return t
  }, [selectedDocs])

  // Registrar el pago grupal: cancela el SALDO COMPLETO de cada comprobante
  // seleccionado con un solo método de pago, usando el mismo modelo que
  // "Registrar Pago" individual (paymentHistory / balance / lastPaymentDate),
  // así el cuadre de caja y la columna PAGO lo levantan igual.
  const handleGroupPayment = async () => {
    if (demoInvoices) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    if (selectedDocs.length === 0 || !businessId) return
    setIsPayingGroup(true)
    let ok = 0
    let fail = 0
    const paidIds = []
    for (const d of selectedDocs) {
      const inv = allInvoices.find(i => i.id === d.id)
      if (!inv) { fail++; continue }
      const pending = getPendingAmount(inv)
      if (pending <= 0.009) { paidIds.push(inv.id); ok++; continue }
      const paymentRecord = {
        amount: pending,
        date: new Date(),
        method: groupPayMethod,
        recordedBy: currentUser?.email || currentUser?.uid || '',
        recordedByName: currentUser?.displayName || currentUser?.email || 'Usuario',
        groupPayment: true,
      }
      try {
        const res = await updateInvoice(businessId, inv.id, {
          amountPaid: (Number(inv.amountPaid) || 0) + pending,
          balance: 0,
          paymentStatus: 'completed',
          status: 'paid',
          paymentHistory: [...(inv.paymentHistory || []), paymentRecord],
          lastPaymentDate: paymentRecord.date,
        })
        if (res.success) { paidIds.push(inv.id); ok++ } else fail++
      } catch (e) {
        console.error('Error registrando pago grupal:', inv.number, e)
        fail++
      }
    }
    // Refrescar la lista local (los pagados salen del reporte) y avisar al caller
    if (paidIds.length > 0) {
      setAllInvoices(prev => prev.map(i => paidIds.includes(i.id)
        ? { ...i, balance: 0, paymentStatus: 'completed', status: 'paid', amountPaid: Number(i.total) || i.amountPaid }
        : i))
      setSelected(new Set())
    }
    setIsPayingGroup(false)
    setGroupPayOpen(false)
    if (fail > 0) {
      toast.error(`${ok} pago(s) registrados; ${fail} fallaron. Revisa e intenta de nuevo.`)
    } else {
      toast.success(`${ok} comprobante(s) marcados como pagados (${groupPayMethod})`)
    }
    if (onPaymentsRegistered) onPaymentsRegistered()
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

  // Abre el PDF con diálogo de impresión (para el ticket 80mm, que sí es para imprimir).
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

  // DESCARGA el PDF (web) o abre COMPARTIR (móvil), sin diálogo de impresión.
  // Los A4 (resumen/detallado) son para guardar/enviar; imprimir es opcional.
  const savePdf = async (doc, filename) => {
    try {
      await downloadBlob(doc.output('blob'), filename, {
        title: 'Pagos Pendientes',
        dialogTitle: 'Guardar o compartir PDF',
      })
    } catch (e) {
      console.error('Error descargando PDF de pagos pendientes:', e)
      toast.error('No se pudo generar el PDF. Inténtalo nuevamente.')
    }
  }

  // Sufijo YYYY-MM-DD para el nombre de archivo
  const fileDate = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  // ===== PDF A4: lista por cliente con detalle de comprobantes =====
  const handleDownloadPdf = async () => {
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
        const dueTxt = d.dueDate ? `  ·  Vence ${formatDate(d.dueDate)}${isOverdue(d.dueDate) ? ' (VENCIDO)' : ''}` : ''
        doc.text(`${d.type} ${d.number}  ·  ${d.date ? formatDate(d.date) : '—'}${dueTxt}`, MX + 4, y)
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

    await savePdf(doc, `Pagos-Pendientes-Detallado_${fileDate}.pdf`)
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

  // ===== PDF A4 RESUMEN: una fila por cliente (nombre · #comp · total) =====
  const handleDownloadSummaryPdf = async () => {
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
    doc.text('PAGOS PENDIENTES — RESUMEN', W / 2, y, { align: 'center' })
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (businessName) { doc.text(businessName, W / 2, y, { align: 'center' }); y += 4.5 }
    doc.text(`Período: ${rangeLabel} · Generado: ${formatDate(new Date())}`, W / 2, y, { align: 'center' })
    y += 7

    // Encabezado de tabla
    doc.setDrawColor(0)
    doc.line(MX, y, W - MX, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Cliente', MX, y)
    doc.text('Comp.', 150, y, { align: 'right' })
    doc.text('Total que debe', W - MX, y, { align: 'right' })
    y += 2.5
    doc.setDrawColor(150)
    doc.line(MX, y, W - MX, y)
    y += 4.5

    doc.setFont('helvetica', 'normal')
    for (const c of visibleCustomers) {
      ensureSpace(6)
      doc.setFontSize(9)
      doc.text(`${c.name.slice(0, 52)}${c.docNumber ? `  (${c.docNumber})` : ''}`.slice(0, 68), MX, y)
      doc.text(String(c.count), 150, y, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.text(formatTotals(c.totals), W - MX, y, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      y += 5.2
    }

    ensureSpace(12)
    doc.setDrawColor(0)
    doc.line(MX, y, W - MX, y)
    y += 5.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(`TOTAL (${visibleCustomers.length} cliente${visibleCustomers.length === 1 ? '' : 's'}, ${grandTotals.docs} comprobante${grandTotals.docs === 1 ? '' : 's'})`, MX, y)
    doc.text(formatTotals(grandTotals), W - MX, y, { align: 'right' })

    await savePdf(doc, `Pagos-Pendientes-Resumen_${fileDate}.pdf`)
  }

  // ===== Excel: hoja Resumen (una fila por cliente) + hoja Detalle =====
  const handleDownloadExcel = async () => {
    const hasUSD = grandTotals.USD > 0.001
    const wb = XLSX.utils.book_new()

    // --- Hoja 1: Resumen ---
    {
      const headers = ['Cliente', 'Documento', 'Comprobantes', 'Deuda S/', ...(hasUSD ? ['Deuda US$'] : [])]
      const totalCols = headers.length
      const aoa = [['PAGOS PENDIENTES — RESUMEN'], []]
      const metaStart = aoa.length
      aoa.push(...buildBusinessMetadataRows(companySettings, {
        periodLabel: rangeLabel,
        totalLabel: 'Clientes con deuda',
        totalItems: visibleCustomers.length,
      }))
      const metaEnd = aoa.length - 1
      aoa.push([])
      const headerRow = aoa.length
      aoa.push(headers)
      const dataStart = aoa.length
      for (const c of visibleCustomers) {
        aoa.push([
          c.name,
          c.docNumber || '',
          c.count,
          Number(c.totals.PEN.toFixed(2)),
          ...(hasUSD ? [Number(c.totals.USD.toFixed(2))] : []),
        ])
      }
      const totalRowIdx = aoa.length
      aoa.push([
        'TOTAL', '', grandTotals.docs,
        Number(grandTotals.PEN.toFixed(2)),
        ...(hasUSD ? [Number(grandTotals.USD.toFixed(2))] : []),
      ])

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      applyColumnWidths(ws, [40, 16, 14, 14, ...(hasUSD ? [14] : [])])
      applyTitleRow(ws, 0, totalCols)
      applyMetadataRows(ws, metaStart, metaEnd)
      applyHeaderRow(ws, headerRow, totalCols)
      for (let i = 0; i < visibleCustomers.length; i++) {
        const r = dataStart + i
        setStyle(ws, r, 0, cellStyle(i))
        setStyle(ws, r, 1, centerStyle(i))
        setStyle(ws, r, 2, centerStyle(i))
        setStyle(ws, r, 3, numberStyle(i))
        if (hasUSD) setStyle(ws, r, 4, numberStyle(i))
      }
      setStyle(ws, totalRowIdx, 0, totalLabelStyle)
      setStyle(ws, totalRowIdx, 1, totalLabelStyle)
      setStyle(ws, totalRowIdx, 2, { ...totalNumberStyle, numFmt: '#,##0' })
      setStyle(ws, totalRowIdx, 3, totalNumberStyle)
      if (hasUSD) setStyle(ws, totalRowIdx, 4, totalNumberStyle)
      applyFreezeBelow(ws, headerRow)
      XLSX.utils.book_append_sheet(wb, ws, 'Resumen')
    }

    // --- Hoja 2: Detalle (una fila por comprobante) ---
    {
      const headers = ['Cliente', 'Doc. Cliente', 'Tipo', 'Número', 'Fecha', 'Moneda', 'Total', 'Pagado', 'Debe']
      const totalCols = headers.length
      const aoa = [['PAGOS PENDIENTES — DETALLE'], []]
      const metaStart = aoa.length
      aoa.push(...buildBusinessMetadataRows(companySettings, {
        periodLabel: rangeLabel,
        totalLabel: 'Comprobantes pendientes',
        totalItems: grandTotals.docs,
      }))
      const metaEnd = aoa.length - 1
      aoa.push([])
      const headerRow = aoa.length
      aoa.push(headers)
      const dataStart = aoa.length
      let rowCount = 0
      for (const c of visibleCustomers) {
        for (const d of c.docs) {
          aoa.push([
            c.name,
            c.docNumber || '',
            d.type,
            d.number,
            d.date ? formatDate(d.date) : '',
            d.ccy,
            Number(d.total.toFixed(2)),
            Number(d.paid.toFixed(2)),
            Number(d.pending.toFixed(2)),
          ])
          rowCount++
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      applyColumnWidths(ws, [34, 14, 10, 16, 12, 9, 12, 12, 12])
      applyTitleRow(ws, 0, totalCols)
      applyMetadataRows(ws, metaStart, metaEnd)
      applyHeaderRow(ws, headerRow, totalCols)
      for (let i = 0; i < rowCount; i++) {
        const r = dataStart + i
        setStyle(ws, r, 0, cellStyle(i))
        setStyle(ws, r, 1, centerStyle(i))
        setStyle(ws, r, 2, centerStyle(i))
        setStyle(ws, r, 3, centerStyle(i))
        setStyle(ws, r, 4, centerStyle(i))
        setStyle(ws, r, 5, centerStyle(i))
        setStyle(ws, r, 6, numberStyle(i))
        setStyle(ws, r, 7, numberStyle(i))
        setStyle(ws, r, 8, numberStyle(i))
      }
      applyFreezeBelow(ws, headerRow)
      XLSX.utils.book_append_sheet(wb, ws, 'Detalle')
    }

    await saveAndShareExcel(wb, buildExcelFileName('PagosPendientes'), {
      shareTitle: 'Pagos Pendientes',
      shareText: 'Reporte de pagos pendientes por cliente',
    })
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

        {/* Orden de la lista (aplica también a PDFs, ticket y Excel) */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 font-medium">Ordenar:</span>
          {[
            { value: 'name', label: 'A–Z' },
            { value: 'debt', label: 'Mayor deuda' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setSortBy(option.value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === option.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
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
                <div className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50">
                  {/* Seleccionar TODOS los comprobantes del cliente (pago grupal) */}
                  <input
                    type="checkbox"
                    checked={c.docs.every(d => selected.has(d.id))}
                    onChange={() => toggleCustomerSelected(c)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 shrink-0 cursor-pointer"
                    title="Seleccionar todos los comprobantes del cliente"
                  />
                  <button
                    onClick={() => toggleExpanded(c.key)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
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
                </div>
                {expanded.has(c.key) && (
                  <div className="pl-9 pr-3 pb-2.5 space-y-1">
                    {c.docs.map((d) => (
                      <label key={d.id} className="flex items-center text-xs text-gray-600 gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={selected.has(d.id)}
                          onChange={() => toggleDocSelected(d.id)}
                          className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 shrink-0 cursor-pointer"
                        />
                        <span className="truncate flex-1">
                          {d.type} {d.number} · {d.date ? formatDate(d.date) : '—'}
                          {d.dueDate && (
                            <span className={isOverdue(d.dueDate) ? 'text-red-600 font-medium' : 'text-gray-500'}>
                              {' · '}Vence {formatDate(d.dueDate)}{isOverdue(d.dueDate) ? ' (vencido)' : ''}
                            </span>
                          )}
                        </span>
                        <span className="whitespace-nowrap">
                          <span className="text-green-600">Pagado {formatCurrency(d.paid, d.ccy)}</span> · <span className="font-semibold text-primary-600">Debe {formatCurrency(d.pending, d.ccy)}</span>
                        </span>
                      </label>
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

        {/* Barra de pago grupal (aparece al seleccionar comprobantes) */}
        {selectedDocs.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm font-medium text-green-900">
              {selectedDocs.length} comprobante{selectedDocs.length === 1 ? '' : 's'} seleccionado{selectedDocs.length === 1 ? '' : 's'} · <span className="font-bold">{formatTotals(selectedTotals)}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                Limpiar
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setGroupPayOpen(true)}>
                <Wallet className="w-4 h-4 mr-1.5" />
                Registrar pago
              </Button>
            </div>
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
                    onClick={() => { setPrintMenuOpen(false); handleDownloadSummaryPdf() }}
                    className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                  >
                    <FileText className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">PDF Resumen</span>
                      <span className="block text-xs text-gray-500">Una línea por cliente: nombre y total que debe</span>
                    </span>
                  </button>
                  <button
                    onClick={() => { setPrintMenuOpen(false); handleDownloadPdf() }}
                    className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                  >
                    <FileText className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">PDF Detallado</span>
                      <span className="block text-xs text-gray-500">Con el detalle de cada comprobante</span>
                    </span>
                  </button>
                  <button
                    onClick={() => { setPrintMenuOpen(false); handleDownloadExcel() }}
                    className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">Excel</span>
                      <span className="block text-xs text-gray-500">Hoja resumen por cliente + hoja con el detalle</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirmación de pago grupal (overlay propio: va ENCIMA del modal) */}
      {groupPayOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!isPayingGroup) setGroupPayOpen(false) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">Registrar pago grupal</h3>
              <button
                onClick={() => { if (!isPayingGroup) setGroupPayOpen(false) }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <p className="text-sm text-gray-600">
                Se cancelará el <strong>saldo completo</strong> de {selectedDocs.length} comprobante{selectedDocs.length === 1 ? '' : 's'}.
                Para pagos parciales usa "Registrar Pago" en el comprobante individual.
              </p>

              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {selectedDocs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{d.customerName}</p>
                      <p className="text-gray-500">{d.type} {d.number}</p>
                    </div>
                    <span className="font-semibold text-primary-600 whitespace-nowrap">{formatCurrency(d.pending, d.ccy)}</span>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Método de pago (aplica a todos)</label>
                <select
                  value={groupPayMethod}
                  onChange={(e) => setGroupPayMethod(e.target.value)}
                  disabled={isPayingGroup}
                  className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Yape">Yape</option>
                  <option value="Plin">Plin</option>
                </select>
              </div>

              <div className="flex items-center justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                <span className="text-sm font-medium text-green-900">Total a registrar</span>
                <span className="text-lg font-bold text-green-700">{formatTotals(selectedTotals)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <Button variant="outline" onClick={() => setGroupPayOpen(false)} disabled={isPayingGroup}>
                Cancelar
              </Button>
              <Button onClick={handleGroupPayment} disabled={isPayingGroup || selectedDocs.length === 0} className="bg-green-600 hover:bg-green-700">
                {isPayingGroup ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4 mr-2" />
                    Confirmar pago
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
