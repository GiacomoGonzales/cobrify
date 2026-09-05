/**
 * FRANJA DE CLÍNICA del Dashboard: las citas de hoy y lo que falta cobrar.
 *
 * Va entre las tarjetas de ventas y los gráficos. Es lo que la dueña mira al
 * abrir el sistema: cuántas citas hay, quién sigue, y cuánto le deben. No
 * repite lo de la Agenda ni lo de Pagos Pendientes: los resume y manda ahí.
 *
 * Las citas llegan por suscripción (la misma que usa la Agenda), así la
 * franja se entera sola cuando alguien agenda desde el mostrador o desde el
 * catálogo. Lo por cobrar se lee una vez al abrir.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Wallet, ChevronRight, User, Loader2 } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import { subscribeAppointmentsByDateRange, APPOINTMENT_STATUS } from '@/services/appointmentService'
import { getInvoicesPorCobrar, totalPorCobrarPorMoneda } from '@/services/receivablesService'
import { filtrarPorSucursal } from '@/utils/branchScope'
import { formatCurrency } from '@/lib/utils'

const ACTIVAS = ['scheduled', 'confirmed', 'in_progress']

const horaDe = (appt) => {
  const d = appt.scheduledDate?.toDate ? appt.scheduledDate.toDate() : new Date(appt.scheduledDate)
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const chipDeEstado = (status) => ({
  scheduled: 'chip-info',
  confirmed: 'chip-ok',
  in_progress: 'chip-aviso',
  completed: 'chip-neutro',
}[status] || 'chip-neutro')

export default function FranjaClinica({ businessId, branchScope, routePrefix, canAccess, canSeeSale, verTotales }) {
  const [citas, setCitas] = useState([])
  const [cargandoCitas, setCargandoCitas] = useState(true)
  const [porCobrar, setPorCobrar] = useState(null) // { cuantos, PEN, USD }

  useEffect(() => {
    if (!businessId) return
    setCargandoCitas(true)
    const hoy = new Date()
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0)
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59)
    const cortar = subscribeAppointmentsByDateRange(
      businessId, inicio, fin,
      (appts) => { setCitas(filtrarPorSucursal(appts, branchScope)); setCargandoCitas(false) },
      () => setCargandoCitas(false),
    )
    return () => cortar()
  }, [businessId, branchScope])

  useEffect(() => {
    if (!businessId || !verTotales) { setPorCobrar(null); return }
    let vivo = true
    getInvoicesPorCobrar(businessId)
      .then(lista => {
        if (!vivo) return
        const visibles = lista.filter(canAccess).filter(canSeeSale)
        setPorCobrar({ cuantos: visibles.length, ...totalPorCobrarPorMoneda(visibles) })
      })
      .catch(e => { console.error('Error al leer lo por cobrar:', e); if (vivo) setPorCobrar({ cuantos: 0, PEN: 0, USD: 0 }) })
    return () => { vivo = false }
    // canAccess/canSeeSale son estables por render del Dashboard; el disparador real es el negocio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, verTotales])

  const resumen = useMemo(() => {
    const cuenta = (estado) => citas.filter(c => c.status === estado).length
    return {
      total: citas.filter(c => c.status !== 'cancelled' && c.status !== 'no_show').length,
      porConfirmar: cuenta('scheduled'),
      confirmadas: cuenta('confirmed'),
      enAtencion: cuenta('in_progress'),
      completadas: cuenta('completed'),
    }
  }, [citas])

  // Las que siguen: activas, por hora. Cinco alcanzan; el resto está en la Agenda.
  const siguientes = useMemo(() => citas
    .filter(c => ACTIVAS.includes(c.status))
    .sort((a, b) => {
      const dA = a.scheduledDate?.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate)
      const dB = b.scheduledDate?.toDate ? b.scheduledDate.toDate() : new Date(b.scheduledDate)
      return dA - dB
    })
    .slice(0, 5), [citas])

  return (
    <div className={`grid grid-cols-1 ${verTotales ? 'lg:grid-cols-3' : ''} gap-4 sm:gap-6`}>
      <Card className={verTotales ? 'lg:col-span-2' : ''}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary-600" />
              <h2 className="text-base font-semibold text-gray-900">Hoy en la clínica</h2>
            </div>
            <Link to={`${routePrefix}/agenda`} className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-0.5">
              Ir a la Agenda <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {cargandoCitas ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="chip-neutro px-3 py-1 rounded-full text-xs font-medium">
                  {resumen.total} {resumen.total === 1 ? 'cita' : 'citas'} hoy
                </span>
                {resumen.porConfirmar > 0 && (
                  <span className="chip-info px-3 py-1 rounded-full text-xs font-medium">{resumen.porConfirmar} por confirmar</span>
                )}
                {resumen.confirmadas > 0 && (
                  <span className="chip-ok px-3 py-1 rounded-full text-xs font-medium">{resumen.confirmadas} confirmadas</span>
                )}
                {resumen.enAtencion > 0 && (
                  <span className="chip-aviso px-3 py-1 rounded-full text-xs font-medium">{resumen.enAtencion} en atención</span>
                )}
                {resumen.completadas > 0 && (
                  <span className="chip-neutro px-3 py-1 rounded-full text-xs font-medium">{resumen.completadas} completadas</span>
                )}
              </div>

              {siguientes.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">
                  {resumen.total === 0 ? 'No hay citas agendadas para hoy.' : 'Todas las citas de hoy ya se atendieron.'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {siguientes.map(c => (
                    <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="font-semibold text-gray-900 w-12 flex-shrink-0">{horaDe(c)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-900 truncate flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{c.customerName || 'Sin nombre'}</span>
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {c.serviceName || 'Cita'}
                          {(c.specialistName || c.staffName) && ` · ${c.specialistName || c.staffName}`}
                        </p>
                      </div>
                      <span className={`${chipDeEstado(c.status)} px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0`}>
                        {APPOINTMENT_STATUS[c.status]?.label || c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {verTotales && (
        <Card>
          <CardContent className="p-4 sm:p-5 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-5 h-5 text-primary-600" />
              <h2 className="text-base font-semibold text-gray-900">Por cobrar</h2>
            </div>
            {porCobrar === null ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
            ) : (
              <>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(porCobrar.PEN)}</p>
                {porCobrar.USD > 0 && (
                  <p className="text-sm font-medium text-emerald-700 mt-0.5">+ US$ {porCobrar.USD.toFixed(2)}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {porCobrar.cuantos === 0
                    ? 'Nadie te debe. Todo cobrado.'
                    : `${porCobrar.cuantos} ${porCobrar.cuantos === 1 ? 'comprobante con saldo' : 'comprobantes con saldo'}`}
                </p>
                {porCobrar.cuantos > 0 && (
                  <Link to={`${routePrefix}/facturas`} className="mt-auto pt-3 text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-0.5">
                    Ver en Ventas <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
