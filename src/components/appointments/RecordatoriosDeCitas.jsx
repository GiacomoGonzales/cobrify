/**
 * RECORDATORIOS DE CITAS: las de hoy, mañana o la semana, para confirmarlas
 * por WhatsApp una por una. Es la pestaña "Citas" de Recordatorios.
 *
 * "Enviar a todos" no existe a propósito: wa.me abre un chat por mensaje, y
 * mandar sin mirar a quién es como se pierde la confianza del paciente. La
 * lista está ordenada para que revisar y enviar tome un minuto.
 *
 * El texto del mensaje sale de mensajeCita.js (el mismo que usa la Agenda),
 * con la plantilla que el negocio edita en Configuración > Punto de venta.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MessageCircle, CheckCircle2, Loader2, Calendar, User, PawPrint, ChevronRight } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import { getAppointmentsByDateRange, confirmAppointment, APPOINTMENT_STATUS } from '@/services/appointmentService'
import { filtrarPorSucursal } from '@/utils/branchScope'
import { prefijoDeRuta } from '@/utils/demoRoutes'
import { mensajeDeCita, linkWhatsApp, horaDeCita } from '@/utils/mensajeCita'

const RANGOS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'manana', label: 'Mañana' },
  { id: 'semana', label: 'Esta semana' },
]

const limitesDe = (rango) => {
  const hoy = new Date()
  const dia = (n) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n)
  const inicioDe = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
  const finDe = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
  if (rango === 'manana') return [inicioDe(dia(1)), finDe(dia(1))]
  if (rango === 'semana') return [inicioDe(hoy), finDe(dia(7))]
  return [inicioDe(hoy), finDe(hoy)]
}

const fechaCortaDe = (appt) => {
  const d = appt.scheduledDate?.toDate ? appt.scheduledDate.toDate() : new Date(appt.scheduledDate)
  return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })
}

const chipDeEstado = (status) => (status === 'confirmed' ? 'chip-ok' : 'chip-info')

export default function RecordatoriosDeCitas() {
  const { getBusinessId, isDemoMode, businessMode, businessSettings, branchScope } = useAppContext()
  const toast = useToast()
  const location = useLocation()
  const prefijo = prefijoDeRuta(location.pathname, isDemoMode)
  const esVeterinaria = businessMode === 'veterinary'

  const [rango, setRango] = useState('manana')
  const [soloSinConfirmar, setSoloSinConfirmar] = useState(true)
  const [citas, setCitas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [confirmando, setConfirmando] = useState(null)

  const cargar = async () => {
    if (isDemoMode) { setCitas([]); setCargando(false); return }
    setCargando(true)
    try {
      const [inicio, fin] = limitesDe(rango)
      const appts = await getAppointmentsByDateRange(getBusinessId(), inicio, fin)
      setCitas(filtrarPorSucursal(appts, branchScope))
    } catch (e) {
      console.error('Error al cargar las citas:', e)
      toast.error('No se pudieron cargar las citas')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango, branchScope])

  // Solo las que todavía van a pasar: programadas y confirmadas.
  const visibles = useMemo(() => citas
    .filter(c => c.status === 'scheduled' || (!soloSinConfirmar && c.status === 'confirmed'))
    .sort((a, b) => {
      const dA = a.scheduledDate?.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate)
      const dB = b.scheduledDate?.toDate ? b.scheduledDate.toDate() : new Date(b.scheduledDate)
      return dA - dB
    }), [citas, soloSinConfirmar])

  const pendientes = citas.filter(c => c.status === 'scheduled').length

  const abrirWhatsApp = (c) => {
    if (!c.phone) { toast.error('Este paciente no tiene teléfono registrado'); return }
    const mensaje = mensajeDeCita(c, {
      plantilla: businessSettings?.appointmentReminderTemplate,
      nombreNegocio: businessSettings?.businessName || '',
    })
    window.open(linkWhatsApp(c.phone, mensaje), '_blank')
  }

  const confirmar = async (c) => {
    setConfirmando(c.id)
    try {
      await confirmAppointment(getBusinessId(), c.id)
      setCitas(prev => prev.map(x => (x.id === c.id ? { ...x, status: 'confirmed' } : x)))
      toast.success('Cita confirmada')
    } catch (e) {
      toast.error('No se pudo confirmar')
    } finally {
      setConfirmando(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {RANGOS.map(r => (
            <button
              key={r.id}
              onClick={() => setRango(r.id)}
              className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                rango === r.id
                  ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 sm:ml-2">
          <input
            type="checkbox"
            checked={soloSinConfirmar}
            onChange={e => setSoloSinConfirmar(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Solo sin confirmar
        </label>
        <Link to={`${prefijo}/agenda`} className="sm:ml-auto text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-0.5">
          Ir a la Agenda <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
      ) : visibles.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {citas.length === 0 ? 'No hay citas en este período' : 'Todas confirmadas'}
            </h3>
            <p className="text-gray-600 max-w-md mx-auto text-sm">
              {citas.length === 0
                ? 'Cuando agendes citas para estos días, aparecen acá para confirmarlas por WhatsApp.'
                : 'Desmarca "Solo sin confirmar" para ver también las confirmadas.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            <p className="px-4 py-2 text-xs text-gray-500">
              {visibles.length} {visibles.length === 1 ? 'cita' : 'citas'}
              {pendientes > 0 && ` · ${pendientes} sin confirmar`}
            </p>
            {visibles.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-16 flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{horaDeCita(c)}</p>
                  {rango === 'semana' && <p className="text-[11px] text-gray-500 capitalize">{fechaCortaDe(c)}</p>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 truncate flex items-center gap-1">
                    {esVeterinaria && c.petName
                      ? <><PawPrint className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /><span className="truncate">{c.petName} · {c.customerName}</span></>
                      : <><User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /><span className="truncate">{c.customerName || 'Sin nombre'}</span></>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {c.serviceName || 'Cita'}
                    {(c.specialistName || c.staffName) && ` · ${c.specialistName || c.staffName}`}
                    {c.phone ? ` · ${c.phone}` : ' · sin teléfono'}
                  </p>
                </div>
                <span className={`${chipDeEstado(c.status)} hidden sm:inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0`}>
                  {APPOINTMENT_STATUS[c.status]?.label || c.status}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {c.phone && (
                    <button
                      onClick={() => abrirWhatsApp(c)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Enviar recordatorio por WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  )}
                  {c.status === 'scheduled' && (
                    <button
                      onClick={() => confirmar(c)}
                      disabled={confirmando === c.id}
                      className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Marcar como confirmada"
                    >
                      {confirmando === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
