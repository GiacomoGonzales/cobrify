import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllPayments, updatePayment, deletePayment } from '@/services/adminStatsService'
import { PLANS } from '@/services/subscriptionService'
import { matchesPrebuilt } from '@/lib/utils'
import { buildAccountHaystack } from '@/utils/adminSearch'
import { useToast } from '@/contexts/ToastContext'
import {
  Pagina, Seccion, Tabla, Th, Td, Fila, FilaVacia, Filtros, FiltroSelect, Buscador, Estado, Boton, Modal,
  Campo, Entrada, Selector, AreaTexto,
} from '@/components/admin/ui'

// Historial de pagos de todas las cuentas: un pago por cada renovacion.
// Los totales y el CSV se calculan sobre TODOS los filtrados, no sobre la
// pagina visible.

const METODOS = { yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia', efectivo: 'Efectivo', tarjeta: 'Tarjeta', otro: 'Otro' }
const ESTADOS = { completed: 'Completado', pending: 'Pendiente', failed: 'Fallido' }
const PAGE_SIZE = 50

const moneda = v => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v) || 0)
const fechaHora = d => (d ? d.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const aFechaInput = d => {
  const x = d?.toDate ? d.toDate() : d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export default function AdminPayments() {
  const toast = useToast()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [methodFilter, setMethodFilter] = useState('all')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [sortField, setSortField] = useState('date')
  const [sortDirection, setSortDirection] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [eliminando, setEliminando] = useState(null)

  useEffect(() => {
    loadPayments()
  }, [])

  async function loadPayments() {
    setLoading(true)
    try {
      const result = await getAllPayments()
      setPayments(result.payments)
      setTotalAmount(result.totalAmount)
      setTotalCount(result.totalCount)
    } catch (error) {
      console.error('Error cargando pagos:', error)
      toast.error('No se pudieron cargar los pagos')
    } finally {
      setLoading(false)
    }
  }

  const filteredPayments = useMemo(() => {
    let result = [...payments]
    // Mismo buscador que Usuarios: palabras sueltas, en cualquier orden, sin tildes
    if (searchTerm) result = result.filter(p => matchesPrebuilt(searchTerm, buildAccountHaystack(p)))
    if (methodFilter !== 'all') result = result.filter(p => p.method === methodFilter)
    if (dateRange.start) result = result.filter(p => p.date >= new Date(dateRange.start))
    if (dateRange.end) {
      const fin = new Date(dateRange.end)
      fin.setHours(23, 59, 59)
      result = result.filter(p => p.date <= fin)
    }
    result.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      if (aVal instanceof Date) aVal = aVal.getTime()
      if (bVal instanceof Date) bVal = bVal.getTime()
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return result
  }, [payments, searchTerm, methodFilter, dateRange, sortField, sortDirection])

  const pageCount = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE))
  const displayedPayments = useMemo(
    () => filteredPayments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredPayments, currentPage]
  )
  useEffect(() => { setCurrentPage(1) }, [searchTerm, methodFilter, dateRange, sortField, sortDirection])
  useEffect(() => { if (currentPage > pageCount) setCurrentPage(1) }, [pageCount, currentPage])

  const filteredStats = useMemo(() => {
    const total = filteredPayments.reduce((sum, p) => sum + p.amount, 0)
    const byMethod = {}
    filteredPayments.forEach(p => {
      const m = p.method || 'otro'
      byMethod[m] = (byMethod[m] || 0) + p.amount
    })
    return { total, count: filteredPayments.length, byMethod }
  }, [filteredPayments])

  function handleSort(field) {
    if (sortField === field) setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  function exportToCSV() {
    const headers = ['Fecha', 'Email', 'Negocio', 'Monto', 'Método', 'Plan', 'Estado', 'Notas']
    const rows = filteredPayments.map(p => [
      p.date?.toLocaleDateString() || 'N/A',
      p.email,
      p.businessName,
      p.amount,
      METODOS[p.method] || p.method,
      p.planName || PLANS[p.plan]?.name || p.plan,
      p.status,
      p.notes || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `pagos_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  function abrirEdicion(payment) {
    setEditando(payment)
    setForm({ amount: payment.amount, method: payment.method, status: payment.status, notes: payment.notes || '', date: aFechaInput(payment.date) })
  }

  async function guardarEdicion() {
    setGuardando(true)
    try {
      await updatePayment(editando.subscriptionId, editando.paymentIndex, {
        amount: parseFloat(form.amount),
        method: form.method,
        status: form.status,
        notes: form.notes,
        date: new Date(form.date),
      })
      toast.success('Pago actualizado')
      setEditando(null)
      loadPayments()
    } catch (error) {
      console.error('Error actualizando el pago:', error)
      toast.error(error.message || 'No se pudo actualizar el pago')
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarEliminar() {
    setGuardando(true)
    try {
      await deletePayment(eliminando.subscriptionId, eliminando.paymentIndex)
      toast.success('Pago eliminado')
      setEliminando(null)
      loadPayments()
    } catch (error) {
      console.error('Error eliminando el pago:', error)
      toast.error(error.message || 'No se pudo eliminar el pago')
    } finally {
      setGuardando(false)
    }
  }

  const hayFiltros = Boolean(searchTerm) || methodFilter !== 'all' || Boolean(dateRange.start) || Boolean(dateRange.end)
  const orden = { campo: sortField, direccion: sortDirection }
  const desglose = Object.entries(filteredStats.byMethod).sort((a, b) => b[1] - a[1])
  const resumen = loading
    ? 'Cargando pagos…'
    : hayFiltros
      ? `${filteredStats.count} de ${totalCount} pagos · ${moneda(filteredStats.total)} filtrados · promedio ${moneda(filteredStats.count ? filteredStats.total / filteredStats.count : 0)}`
      : `${totalCount} pagos · ${moneda(totalAmount)} en total · promedio ${moneda(totalCount ? totalAmount / totalCount : 0)}`

  return (
    <Pagina
      resumen={resumen}
      acciones={
        <>
          <Boton tamano="sm" onClick={loadPayments} disabled={loading}>{loading ? 'Cargando…' : 'Recargar'}</Boton>
          <Boton tamano="sm" onClick={exportToCSV}>Exportar CSV</Boton>
        </>
      }
    >
      <Filtros>
        <Buscador ancho="w-full sm:w-80" placeholder="Negocio, correo, RUC…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <FiltroSelect value={methodFilter} onChange={e => setMethodFilter(e.target.value)}>
          <option value="all">Método</option>
          {Object.entries(METODOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </FiltroSelect>
        <Entrada type="date" value={dateRange.start} onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))} className="w-40" aria-label="Desde" />
        <span className="text-gray-400">–</span>
        <Entrada type="date" value={dateRange.end} onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))} className="w-40" aria-label="Hasta" />
        {hayFiltros && (
          <button type="button" onClick={() => { setSearchTerm(''); setMethodFilter('all'); setDateRange({ start: '', end: '' }) }} className="h-8 px-2 text-[12.5px] text-gray-500 hover:text-gray-900">
            Limpiar
          </button>
        )}
      </Filtros>

      {desglose.length > 1 && (
        <p className="text-[12.5px] text-gray-500">
          Por método: {desglose.map(([m, monto]) => `${METODOS[m] || m} ${moneda(monto)}`).join(' · ')}
        </p>
      )}

      <Seccion sinRelleno className="overflow-hidden">
        <Tabla alto="lg:max-h-[calc(100vh-12rem)]">
          <thead>
            <tr>
              <Th campo="date" orden={orden} onOrdenar={handleSort} ancho={150}>Fecha</Th>
              <Th campo="businessName" orden={orden} onOrdenar={handleSort}>Cuenta</Th>
              <Th campo="amount" orden={orden} onOrdenar={handleSort} alinear="der">Monto</Th>
              <Th>Método</Th>
              <Th>Plan</Th>
              <Th>Estado</Th>
              <Th>Notas</Th>
              <Th ancho={150}><span className="sr-only">Acciones</span></Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <FilaVacia colSpan={8}>Cargando pagos…</FilaVacia>
            ) : filteredPayments.length === 0 ? (
              <FilaVacia colSpan={8}>Ningún pago coincide con los filtros</FilaVacia>
            ) : (
              displayedPayments.map(p => (
                <Fila key={p.id}>
                  <Td apagado>{fechaHora(p.date)}</Td>
                  <Td className="max-w-[280px]">
                    <Link to={`/app/admin/users/${p.subscriptionId}`} className="block truncate font-medium hover:underline">{p.businessName}</Link>
                    <div className="truncate text-[11.5px] text-gray-500">{p.email}</div>
                  </Td>
                  <Td numero className="font-medium">{moneda(p.amount)}</Td>
                  <Td apagado>{METODOS[p.method] || p.method}</Td>
                  <Td apagado>{p.planName || PLANS[p.plan]?.name || p.plan}</Td>
                  <Td><Estado valor={p.status} etiqueta={ESTADOS[p.status] || p.status} /></Td>
                  <Td apagado className="max-w-[240px] truncate" title={p.notes || undefined}>{p.notes || '—'}</Td>
                  <Td alinear="der">
                    <div className="flex justify-end gap-1">
                      <Boton tamano="sm" onClick={() => abrirEdicion(p)}>Editar</Boton>
                      <Boton tamano="sm" variante="peligro" onClick={() => setEliminando(p)}>Eliminar</Boton>
                    </div>
                  </Td>
                </Fila>
              ))
            )}
          </tbody>
        </Tabla>
        {!loading && filteredPayments.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-gray-200 text-[12.5px] text-gray-500">
            <span>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredPayments.length)} de {filteredPayments.length}</span>
            <div className="flex items-center gap-2">
              <Boton tamano="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>Anterior</Boton>
              <span>Página {currentPage} de {pageCount}</span>
              <Boton tamano="sm" onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount}>Siguiente</Boton>
            </div>
          </div>
        )}
      </Seccion>

      {editando && (
        <Modal
          titulo="Editar pago"
          subtitulo={`${editando.businessName} · ${editando.email}`}
          onClose={() => setEditando(null)}
          ancho="sm"
          pie={
            <>
              <Boton onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Boton>
              <Boton variante="primario" onClick={guardarEdicion} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
            </>
          }
        >
          <div className="space-y-3">
            <Campo etiqueta="Monto (S/)">
              <Entrada type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </Campo>
            <Campo etiqueta="Método">
              <Selector value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
                {Object.entries(METODOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Fecha">
              <Entrada type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </Campo>
            <Campo etiqueta="Estado">
              <Selector value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.entries(ESTADOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Notas">
              <AreaTexto rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </Campo>
          </div>
        </Modal>
      )}

      {eliminando && (
        <Modal
          titulo="Eliminar pago"
          subtitulo="No se puede deshacer"
          onClose={() => setEliminando(null)}
          ancho="sm"
          pie={
            <>
              <Boton onClick={() => setEliminando(null)} disabled={guardando}>Cancelar</Boton>
              <Boton variante="peligro" onClick={confirmarEliminar} disabled={guardando}>{guardando ? 'Eliminando…' : 'Eliminar'}</Boton>
            </>
          }
        >
          <p className="text-gray-700">
            {eliminando.businessName} · {moneda(eliminando.amount)} · {fechaHora(eliminando.date)}
          </p>
        </Modal>
      )}
    </Pagina>
  )
}
