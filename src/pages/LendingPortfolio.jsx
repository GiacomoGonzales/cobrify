/**
 * CARTERA DE PRÉSTAMOS (modo Préstamos, 15-ago-2026).
 *
 * La página central del modo: tarjetas por préstamo (calcadas de la referencia
 * que mandó el usuario que pidió el modo), crear préstamo con cronograma y
 * registrar pagos con desglose mora → interés → capital + ticket simple.
 *
 * El ticket se imprime con printHtmlIframe (regla del proyecto: NUNCA
 * window.print() dentro del HTML). El pago registra ingreso en la caja diaria
 * si hay una sesión abierta, igual que hace el POS.
 */
import { useState, useEffect, useMemo } from 'react'
import {
  HandCoins, Plus, Search, Loader2, Calendar, Percent, Wallet,
  AlertTriangle, CheckCircle, MoreVertical, Printer, XCircle, User,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getCustomers, getCashRegisterSession, addCashMovement, getCompanySettings } from '@/services/firestoreService'
import {
  LENDING_MODALITIES, AMORTIZATION_TYPES,
  createLendingLoan, getLendingLoans, registerLendingPayment, cancelLendingLoan,
  computeMora, loanBalance, periodInterest, buildFixedSchedule,
} from '@/services/lendingService'
import { printHtmlIframe } from '@/utils/printHtmlIframe'

const toJsDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null)

// Fecha local YYYY-MM-DD sin sorpresas de zona horaria (mismo criterio que
// CreatePurchase: nunca usar toISOString, que corre el día en Lima).
const getLocalDateString = (date = new Date()) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const parseLocalDate = (str) => {
  const [y, m, d] = String(str).split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

export default function LendingPortfolio() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [loans, setLoans] = useState([])
  const [customers, setCustomers] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [openMenuId, setOpenMenuId] = useState(null)

  // Crear préstamo
  const [showCreate, setShowCreate] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({
    customerSearch: '', customerId: null, customerName: '', customerDocument: '', customerPhone: '',
    capital: '', interestRate: '', modality: 'monthly', amortizationType: 'fixed',
    installmentsCount: '4', startDate: getLocalDateString(),
    moraType: 'none', moraValue: '',
  })
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Pago
  const [payingLoan, setPayingLoan] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Efectivo')
  const [isPaying, setIsPaying] = useState(false)

  // Detalle / cronograma
  const [viewingLoan, setViewingLoan] = useState(null)

  const loadAll = async () => {
    const businessId = getBusinessId()
    if (!businessId) return
    setIsLoading(true)
    try {
      const [loansRes, customersRes, settingsRes] = await Promise.all([
        getLendingLoans(businessId),
        getCustomers(businessId),
        getCompanySettings(businessId),
      ])
      if (loansRes.success) setLoans(loansRes.data)
      if (customersRes.success) setCustomers(customersRes.data || [])
      if (settingsRes.success) setCompanySettings(settingsRes.data)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isDemoMode) { setIsLoading(false); return }
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // ===== Stats de cabecera: el "dashboard" del modo =====
  const stats = useMemo(() => {
    const activos = loans.filter(l => l.status === 'active')
    const capitalEnCalle = activos.reduce((s, l) => s + (l.capitalBalance || 0), 0)
    const now = new Date()
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
    const interesesMes = loans.reduce((s, l) =>
      s + (l.payments || []).filter(p => {
        const d = toJsDate(p.date)
        return d && d >= inicioMes
      }).reduce((ss, p) => ss + (p.interestPart || 0) + (p.moraPart || 0), 0), 0)
    const vencidos = activos.filter(l => {
      const due = toJsDate(l.nextDueDate)
      return due && due < now
    }).length
    return { capitalEnCalle, interesesMes, vencidos, activos: activos.length }
  }, [loans])

  const filteredLoans = useMemo(() => {
    let rows = loans
    if (statusFilter !== 'all') rows = rows.filter(l => l.status === statusFilter)
    const q = searchTerm.trim().toLowerCase()
    if (q) rows = rows.filter(l =>
      (l.customerName || '').toLowerCase().includes(q) ||
      (l.customerDocument || '').includes(q)
    )
    return rows
  }, [loans, statusFilter, searchTerm])

  // ===== Crear préstamo =====
  const filteredCustomers = useMemo(() => {
    const q = form.customerSearch.trim().toLowerCase()
    if (!q) return []
    return customers.filter(c =>
      (c.name || c.businessName || '').toLowerCase().includes(q) ||
      (c.documentNumber || '').includes(q)
    ).slice(0, 8)
  }, [customers, form.customerSearch])

  const previewSchedule = useMemo(() => {
    const capital = parseFloat(form.capital)
    const rate = parseFloat(form.interestRate)
    if (!(capital > 0) || !(rate >= 0)) return null
    if (form.amortizationType === 'fixed') {
      return buildFixedSchedule({
        capital, interestRate: rate,
        installmentsCount: parseInt(form.installmentsCount) || 1,
        startDate: parseLocalDate(form.startDate), modality: form.modality,
      })
    }
    return { interesPorPeriodo: Math.round(capital * rate) / 100 }
  }, [form.capital, form.interestRate, form.amortizationType, form.installmentsCount, form.startDate, form.modality])

  const handleCreate = async () => {
    if (isDemoMode) { toast.info('No disponible en modo demo'); return }
    const capital = parseFloat(form.capital)
    const rate = parseFloat(form.interestRate)
    if (!form.customerName.trim()) { toast.error('Indica el cliente'); return }
    if (!(capital > 0)) { toast.error('El capital debe ser mayor a cero'); return }
    if (!(rate >= 0)) { toast.error('Indica la tasa de interés'); return }
    if (form.moraType !== 'none' && !(parseFloat(form.moraValue) > 0)) {
      toast.error('Indica el valor de la mora (o elige Sin mora)'); return
    }
    setIsSaving(true)
    try {
      const res = await createLendingLoan(getBusinessId(), {
        customerId: form.customerId,
        customerName: form.customerName.trim(),
        customerDocument: form.customerDocument.trim(),
        customerPhone: form.customerPhone.trim(),
        capital,
        interestRate: rate,
        modality: form.modality,
        amortizationType: form.amortizationType,
        installmentsCount: parseInt(form.installmentsCount) || 1,
        startDate: parseLocalDate(form.startDate),
        mora: form.moraType === 'none' ? null : { type: form.moraType, value: parseFloat(form.moraValue) },
      })
      if (res.success) {
        toast.success('Préstamo registrado')
        setShowCreate(false)
        setForm({
          customerSearch: '', customerId: null, customerName: '', customerDocument: '', customerPhone: '',
          capital: '', interestRate: '', modality: 'monthly', amortizationType: 'fixed',
          installmentsCount: '4', startDate: getLocalDateString(), moraType: 'none', moraValue: '',
        })
        loadAll()
      } else {
        toast.error(res.error || 'No se pudo registrar el préstamo')
      }
    } finally {
      setIsSaving(false)
    }
  }

  // ===== Pago + ticket =====
  const buildReceiptHtml = (loan, breakdown, after) => {
    const biz = companySettings?.tradeName || companySettings?.name || companySettings?.businessName || 'MI NEGOCIO'
    const fila = (label, val) => `<tr><td style="padding:2px 0">${label}</td><td style="text-align:right;font-weight:bold">${val}</td></tr>`
    const partes = []
    if (breakdown.moraPart > 0) partes.push(fila('Mora', formatCurrency(breakdown.moraPart)))
    if (breakdown.interestPart > 0) partes.push(fila('Interés', formatCurrency(breakdown.interestPart)))
    if (breakdown.capitalPart > 0) partes.push(fila('Amortización capital', formatCurrency(breakdown.capitalPart)))
    if (breakdown.surplus > 0) partes.push(fila('A favor (no aplicado)', formatCurrency(breakdown.surplus)))
    return `
      <div style="font-family: 'Courier New', monospace; font-size: 12px; width: 260px; margin: 0 auto; color: #000">
        <div style="text-align:center; font-weight:bold; font-size: 13px">${biz}</div>
        <div style="text-align:center; margin-bottom:6px">CONSTANCIA DE PAGO - PRÉSTAMO</div>
        <div style="border-top:1px dashed #000; margin:6px 0"></div>
        <div>Cliente: <b>${loan.customerName}</b></div>
        ${loan.customerDocument ? `<div>Doc: ${loan.customerDocument}</div>` : ''}
        <div>Fecha: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</div>
        <div>Método: ${breakdown.method || payMethod}</div>
        <div style="border-top:1px dashed #000; margin:6px 0"></div>
        <table style="width:100%; font-size:12px">${partes.join('')}
          <tr><td colspan="2" style="border-top:1px dashed #000; padding-top:4px"></td></tr>
          ${fila('TOTAL PAGADO', formatCurrency(breakdown.amount))}
        </table>
        <div style="border-top:1px dashed #000; margin:6px 0"></div>
        ${fila('Capital pendiente', formatCurrency(after.capitalBalance ?? loan.capitalBalance))}
        ${after.status === 'paid'
          ? '<div style="text-align:center; font-weight:bold; margin-top:6px">PRÉSTAMO CANCELADO ✔</div>'
          : (after.nextDueDate ? `<div>Próximo pago: ${formatDate(after.nextDueDate)}</div>` : '')}
        <div style="text-align:center; margin-top:8px; font-size:10px">Documento interno sin valor tributario</div>
      </div>`
  }

  const handleRegisterPayment = async () => {
    if (isDemoMode) { toast.info('No disponible en modo demo'); return }
    const amount = parseFloat(payAmount)
    if (!(amount > 0)) { toast.error('Ingresa el monto del pago'); return }
    setIsPaying(true)
    try {
      const businessId = getBusinessId()
      const res = await registerLendingPayment(businessId, payingLoan.id, {
        amount, method: payMethod,
        userName: user?.displayName || user?.email || '',
      })
      if (!res.success) { toast.error(res.error || 'No se pudo registrar el pago'); return }

      // Ingreso a caja diaria si hay sesión abierta (mismo patrón que el POS)
      if (payMethod === 'Efectivo') {
        try {
          const sesion = await getCashRegisterSession(businessId, null, user.uid)
          if (sesion.success && sesion.data?.id) {
            await addCashMovement(businessId, sesion.data.id, {
              type: 'income', amount,
              reason: `Pago préstamo - ${payingLoan.customerName}`,
              userId: user.uid, userName: user.displayName || user.email || '',
            })
          }
        } catch (e) { /* la caja es secundaria: el pago ya quedó registrado */ }
      }

      toast.success('Pago registrado')
      printHtmlIframe(buildReceiptHtml(payingLoan, { ...res.breakdown, method: payMethod }, res.loanAfter))
      setPayingLoan(null)
      setPayAmount('')
      loadAll()
    } finally {
      setIsPaying(false)
    }
  }

  const handleCancel = async (loan) => {
    if (isDemoMode) { toast.info('No disponible en modo demo'); return }
    if (!window.confirm(`¿Anular el préstamo de ${loan.customerName}? Esta acción no registra devoluciones.`)) return
    const res = await cancelLendingLoan(getBusinessId(), loan.id)
    if (res.success) { toast.success('Préstamo anulado'); loadAll() }
    else toast.error(res.error || 'No se pudo anular')
  }

  // ===== UI =====
  const statusBadge = (loan) => {
    if (loan.status === 'paid') return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">Cancelado</span>
    if (loan.status === 'cancelled') return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-600">Anulado</span>
    const due = toJsDate(loan.nextDueDate)
    if (due && due < new Date()) return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">Vencido</span>
    return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">Pendiente</span>
  }

  const dato = (valor, etiqueta) => (
    <div>
      <p className="text-base font-bold text-gray-900">{valor}</p>
      <p className="text-xs text-gray-500">{etiqueta}</p>
    </div>
  )

  return (
    <div className="p-2 sm:p-4 max-w-7xl mx-auto">
      {/* Cabecera + stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Préstamos</h1>
          <p className="text-sm text-gray-500">Tu cartera de préstamos a clientes</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo Préstamo
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-primary-700"><Wallet className="w-4 h-4" /><span className="text-xs font-medium">Capital en la calle</span></div>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(stats.capitalEnCalle)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-emerald-700"><Percent className="w-4 h-4" /><span className="text-xs font-medium">Intereses del mes</span></div>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(stats.interesesMes)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-blue-700"><HandCoins className="w-4 h-4" /><span className="text-xs font-medium">Activos</span></div>
          <p className="text-xl font-bold text-gray-900 mt-1">{stats.activos}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-red-700"><AlertTriangle className="w-4 h-4" /><span className="text-xs font-medium">Vencidos</span></div>
          <p className="text-xl font-bold text-gray-900 mt-1">{stats.vencidos}</p>
        </CardContent></Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o documento..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="active">Activos</option>
          <option value="paid">Cancelados</option>
          <option value="cancelled">Anulados</option>
          <option value="all">Todos</option>
        </select>
      </div>

      {/* Tarjetas */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 text-gray-500 py-16"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div>
      ) : filteredLoans.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-500">
          <HandCoins className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          {loans.length === 0 ? 'Registra tu primer préstamo con "Nuevo Préstamo".' : 'Nada que mostrar con estos filtros.'}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredLoans.map(loan => {
            const mora = computeMora(loan)
            const cuotasPagadas = loan.amortizationType === 'fixed'
              ? `${(loan.installments || []).filter(c => c.status === 'paid').length}/${loan.installmentsCount}`
              : '—'
            return (
              <Card key={loan.id} className="overflow-hidden">
                <div className="bg-primary-600 text-white px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-bold truncate uppercase">{loan.customerName}</p>
                    <div className="mt-0.5">{statusBadge(loan)}</div>
                  </div>
                  <div className="relative flex-shrink-0">
                    <button onClick={() => setOpenMenuId(openMenuId === loan.id ? null : loan.id)} className="p-1.5 rounded hover:bg-white/10">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {openMenuId === loan.id && (
                      <div className="absolute right-0 mt-1 w-44 bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 z-20 py-1">
                        <button onClick={() => { setViewingLoan(loan); setOpenMenuId(null) }} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-500" /> Ver detalle
                        </button>
                        {loan.status === 'active' && (
                          <button onClick={() => { handleCancel(loan); setOpenMenuId(null) }} className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2">
                            <XCircle className="w-4 h-4" /> Anular préstamo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 gap-x-2 gap-y-3">
                    {dato(formatCurrency(loan.capitalBalance || 0), 'Capital actual')}
                    {dato(cuotasPagadas, 'Cuotas pagadas')}
                    {dato(AMORTIZATION_TYPES[loan.amortizationType] || '—', 'Amortización')}
                    {dato(loan.nextDueDate ? formatDate(toJsDate(loan.nextDueDate)) : '—', 'Próximo pago')}
                    {dato(`${loan.interestRate}%`, 'Interés')}
                    {dato(formatCurrency(loan.capital || 0), 'Capital inicial')}
                    {dato(formatCurrency(loanBalance(loan)), 'Balance pendiente')}
                    {dato(LENDING_MODALITIES[loan.modality]?.label || '—', 'Modalidad')}
                    {dato(mora > 0 ? formatCurrency(mora) : '—', 'Mora')}
                  </div>
                  {loan.status === 'active' && (
                    <Button
                      className="w-full mt-4"
                      onClick={() => {
                        setPayingLoan(loan)
                        // Sugerir el pago del período: cuota vigente o interés del período + mora
                        const sugerido = loan.amortizationType === 'fixed'
                          ? (loan.installments || []).find(c => c.status === 'pending')
                          : null
                        const base = sugerido ? (sugerido.amount - (sugerido.paidAmount || 0)) : periodInterest(loan)
                        setPayAmount(String(Math.round((base + mora) * 100) / 100))
                      }}
                    >
                      Agregar Pago
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ===== Modal: Nuevo Préstamo ===== */}
      <Modal isOpen={showCreate} onClose={() => !isSaving && setShowCreate(false)} title="Nuevo Préstamo" size="lg">
        <div className="space-y-4">
          {/* Cliente */}
          <div className="relative">
            <Input
              label="Cliente"
              placeholder="Buscar por nombre o documento…"
              value={form.customerName || form.customerSearch}
              onChange={e => {
                setForm(f => ({ ...f, customerSearch: e.target.value, customerName: e.target.value, customerId: null }))
                setShowCustomerDropdown(true)
              }}
            />
            {showCustomerDropdown && filteredCustomers.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {filteredCustomers.map(c => (
                  <button
                    key={c.id}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => {
                      setForm(f => ({
                        ...f, customerId: c.id,
                        customerName: c.name || c.businessName || '',
                        customerDocument: c.documentNumber || '',
                        customerPhone: c.phone || '',
                        customerSearch: '',
                      }))
                      setShowCustomerDropdown(false)
                    }}
                  >
                    <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{c.name || c.businessName}</span>
                    {c.documentNumber && <span className="text-xs text-gray-400 flex-shrink-0">{c.documentNumber}</span>}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Escribe para buscar en tus clientes, o deja el nombre tal cual para uno nuevo.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Documento (opcional)" value={form.customerDocument} onChange={e => setForm(f => ({ ...f, customerDocument: e.target.value }))} />
            <Input label="Teléfono (opcional)" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input label="Capital (S/)" type="number" min="0" step="0.01" value={form.capital} onChange={e => setForm(f => ({ ...f, capital: e.target.value }))} />
            <Input label="Interés % por período" type="number" min="0" step="0.1" value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} />
            <Select label="Modalidad" value={form.modality} onChange={e => setForm(f => ({ ...f, modality: e.target.value }))}>
              {Object.entries(LENDING_MODALITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Input label="Inicio" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
          </div>

          {/* Amortización */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de amortización</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, amortizationType: 'fixed' }))}
                className={`p-3 rounded-lg border-2 text-left ${form.amortizationType === 'fixed' ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
                <p className="font-semibold text-sm">Cuota Fija</p>
                <p className="text-xs text-gray-500 mt-0.5">Capital + interés repartidos en cuotas iguales con cronograma.</p>
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, amortizationType: 'interest_only' }))}
                className={`p-3 rounded-lg border-2 text-left ${form.amortizationType === 'interest_only' ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
                <p className="font-semibold text-sm">Solo Interés</p>
                <p className="text-xs text-gray-500 mt-0.5">Cada período paga el interés; el capital se abona cuando pueda.</p>
              </button>
            </div>
          </div>

          {form.amortizationType === 'fixed' && (
            <div className="max-w-[180px]">
              <Input label="Número de cuotas" type="number" min="1" max="120" value={form.installmentsCount} onChange={e => setForm(f => ({ ...f, installmentsCount: e.target.value }))} />
            </div>
          )}

          {/* Mora */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Select label="Mora por atraso" value={form.moraType} onChange={e => setForm(f => ({ ...f, moraType: e.target.value }))}>
              <option value="none">Sin mora</option>
              <option value="percent">% sobre lo vencido</option>
              <option value="fixed">Monto fijo por período</option>
            </Select>
            {form.moraType !== 'none' && (
              <Input label={form.moraType === 'percent' ? 'Mora %' : 'Mora S/'} type="number" min="0" step="0.1" value={form.moraValue} onChange={e => setForm(f => ({ ...f, moraValue: e.target.value }))} />
            )}
          </div>

          {/* Vista previa */}
          {previewSchedule && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
              {form.amortizationType === 'fixed' ? (
                <>
                  <p><b>Total a pagar:</b> {formatCurrency(previewSchedule.total)} (interés {formatCurrency(previewSchedule.totalInterest)})</p>
                  <p><b>{previewSchedule.installments.length} cuotas</b> de ~{formatCurrency(previewSchedule.installments[0].amount)} — primera vence {formatDate(previewSchedule.installments[0].dueDate)}</p>
                </>
              ) : (
                <p><b>Interés por período:</b> {formatCurrency(previewSchedule.interesPorPeriodo)} mientras el capital siga en {formatCurrency(parseFloat(form.capital) || 0)}. Baja al amortizar.</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando…</> : 'Registrar Préstamo'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ===== Modal: Agregar Pago ===== */}
      <Modal isOpen={!!payingLoan} onClose={() => !isPaying && setPayingLoan(null)} title={`Pago de ${payingLoan?.customerName || ''}`}>
        {payingLoan && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Capital pendiente</span><b>{formatCurrency(payingLoan.capitalBalance || 0)}</b></div>
              {payingLoan.amortizationType === 'interest_only' && (
                <div className="flex justify-between"><span>Interés del período</span><b>{formatCurrency(periodInterest(payingLoan))}</b></div>
              )}
              {computeMora(payingLoan) > 0 && (
                <div className="flex justify-between text-red-600"><span>Mora acumulada</span><b>{formatCurrency(computeMora(payingLoan))}</b></div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-1"><span>Balance total</span><b>{formatCurrency(loanBalance(payingLoan))}</b></div>
            </div>
            <Input label="Monto del pago" type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
            <Select label="Método" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
              <option>Efectivo</option>
              <option>Yape</option>
              <option>Plin</option>
              <option>Transferencia</option>
              <option>Tarjeta</option>
            </Select>
            <p className="text-xs text-gray-500">El pago se aplica en orden: mora → interés → capital. Al registrar se imprime la constancia.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayingLoan(null)} disabled={isPaying}>Cancelar</Button>
              <Button onClick={handleRegisterPayment} disabled={isPaying}>
                {isPaying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Registrando…</> : <><Printer className="w-4 h-4 mr-2" /> Registrar e imprimir</>}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===== Modal: Detalle ===== */}
      <Modal isOpen={!!viewingLoan} onClose={() => setViewingLoan(null)} title={`Préstamo de ${viewingLoan?.customerName || ''}`} size="lg">
        {viewingLoan && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {dato(formatCurrency(viewingLoan.capital), 'Capital inicial')}
              {dato(`${viewingLoan.interestRate}% ${LENDING_MODALITIES[viewingLoan.modality]?.label?.toLowerCase() || ''}`, 'Interés')}
              {dato(formatCurrency(viewingLoan.interestPaid || 0), 'Interés cobrado')}
              {dato(formatCurrency(viewingLoan.capitalBalance || 0), 'Capital pendiente')}
            </div>

            {viewingLoan.amortizationType === 'fixed' && (
              <div>
                <p className="font-semibold text-gray-900 mb-2">Cronograma</p>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {(viewingLoan.installments || []).map((c, i) => {
                    const due = toJsDate(c.dueDate)
                    const vencida = c.status === 'pending' && due && due < new Date()
                    return (
                      <div key={i} className={`flex items-center justify-between px-3 py-2 ${c.status === 'paid' ? 'bg-green-50' : vencida ? 'bg-red-50' : ''}`}>
                        <span className="text-gray-600">Cuota {c.number} · {due ? formatDate(due) : '—'}</span>
                        <span className="flex items-center gap-2">
                          {formatCurrency(c.amount)}
                          {c.status === 'paid'
                            ? <CheckCircle className="w-4 h-4 text-green-600" />
                            : vencida ? <AlertTriangle className="w-4 h-4 text-red-500" /> : null}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="font-semibold text-gray-900 mb-2">Pagos registrados</p>
              {(viewingLoan.payments || []).length === 0 ? (
                <p className="text-gray-500">Aún no hay pagos.</p>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {viewingLoan.payments.map((p, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between">
                      <span className="text-gray-600">
                        {toJsDate(p.date) ? formatDate(toJsDate(p.date)) : '—'} · {p.method}
                        <span className="text-xs text-gray-400 ml-2">
                          {p.moraPart > 0 ? `mora ${formatCurrency(p.moraPart)} · ` : ''}
                          int. {formatCurrency(p.interestPart || 0)} · cap. {formatCurrency(p.capitalPart || 0)}
                        </span>
                      </span>
                      <b>{formatCurrency(p.amount)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
