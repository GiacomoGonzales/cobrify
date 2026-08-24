import { useState, useEffect, useCallback } from 'react'
import { usePublicPageChrome } from '@/hooks/usePublicPageChrome'
import { useParams } from 'react-router-dom'
import { Calendar, BedDouble, Loader2, Check, X, Phone, AlertTriangle } from 'lucide-react'

/**
 * MI RESERVA — página pública, sin cuenta y sin login.
 *
 * El cliente llega con el enlace que recibió al reservar desde el catálogo
 * (cita o habitación). El secreto es el token de la URL: quien tiene el
 * enlace es el dueño de la reserva, como un código de rastreo de encomienda.
 * Todo va contra las Cloud Functions públicas — esta página no toca Firestore
 * y solo ve lo que el propio cliente escribió, jamás datos de terceros.
 */

const FN_BASE = 'https://us-central1-cobrify-395fe.cloudfunctions.net'

const ESTADOS_CITA = {
  scheduled: { label: 'Reservada — pendiente de confirmación', tone: 'amber' },
  confirmed: { label: 'Confirmada', tone: 'green' },
  in_progress: { label: 'En atención', tone: 'blue' },
  completed: { label: 'Atendida', tone: 'gray' },
  cancelled: { label: 'Cancelada', tone: 'red' },
  no_show: { label: 'No asistida', tone: 'gray' },
}
const ESTADOS_HOTEL = {
  requested: { label: 'Solicitud enviada — el hotel la está revisando', tone: 'amber' },
  confirmed: { label: 'Reserva confirmada', tone: 'green' },
  checked_in: { label: 'Estadía en curso', tone: 'blue' },
  checked_out: { label: 'Estadía finalizada', tone: 'gray' },
  cancelled: { label: 'Cancelada', tone: 'red' },
  no_show: { label: 'No presentado', tone: 'gray' },
}
const TONOS = {
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  green: 'bg-green-50 text-green-800 border-green-200',
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
}

export default function MiReserva() {
  // Pagina publica: sin banner de instalar Cobrify (ver el hook)
  usePublicPageChrome(null)

  const { businessId, token } = useParams()
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [reserva, setReserva] = useState(null)
  const [confirmandoCancel, setConfirmandoCancel] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const r = await fetch(`${FN_BASE}/getPublicBooking?businessId=${encodeURIComponent(businessId)}&token=${encodeURIComponent(token)}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'No se pudo consultar la reserva')
      setReserva(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [businessId, token])

  useEffect(() => { cargar() }, [cargar])

  const cancelar = async () => {
    setCancelando(true)
    setError('')
    try {
      const r = await fetch(`${FN_BASE}/cancelPublicBooking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, token }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'No se pudo cancelar')
      setConfirmandoCancel(false)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setCancelando(false)
    }
  }

  const esCita = reserva?.tipo === 'cita'
  const estado = reserva
    ? ((esCita ? ESTADOS_CITA : ESTADOS_HOTEL)[reserva.status] || { label: reserva.status, tone: 'gray' })
    : null

  const fechaCorta = (ymd) => {
    if (!ymd) return ''
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

          {cargando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Consultando tu reserva...
            </div>
          ) : error && !reserva ? (
            <div className="text-center py-8 space-y-3">
              <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
              <p className="text-gray-700">{error}</p>
            </div>
          ) : reserva && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  {esCita ? <Calendar className="w-6 h-6 text-gray-600" /> : <BedDouble className="w-6 h-6 text-gray-600" />}
                </div>
                <h1 className="text-lg font-bold text-gray-900">
                  {esCita ? 'Tu cita' : 'Tu reserva'}
                  {reserva.negocio?.nombre ? ` en ${reserva.negocio.nombre}` : ''}
                </h1>
              </div>

              <div className={`border rounded-xl px-4 py-3 text-sm font-medium text-center ${TONOS[estado.tone]}`}>
                {estado.label}
              </div>

              <div className="space-y-2 text-sm">
                {esCita ? (
                  <>
                    {reserva.cuando && (
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Cuándo</span>
                        <span className="text-gray-900 font-medium text-right capitalize">{reserva.cuando}</span>
                      </div>
                    )}
                    {reserva.servicio && (
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Servicio</span>
                        <span className="text-gray-900 text-right">{reserva.servicio}</span>
                      </div>
                    )}
                    {reserva.mascota && (
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Mascota</span>
                        <span className="text-gray-900 text-right">{reserva.mascota}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Habitación</span>
                      <span className="text-gray-900 font-medium text-right">{reserva.habitacion}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Fechas</span>
                      <span className="text-gray-900 text-right">
                        {fechaCorta(reserva.checkIn)} → {fechaCorta(reserva.checkOut)} ({reserva.noches} noche{reserva.noches === 1 ? '' : 's'})
                      </span>
                    </div>
                    {reserva.total > 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Total</span>
                        <span className="text-gray-900 font-semibold text-right">S/ {Number(reserva.total).toFixed(2)}</span>
                      </div>
                    )}
                  </>
                )}
                {reserva.nombre && (
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">A nombre de</span>
                    <span className="text-gray-900 text-right">{reserva.nombre}</span>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-600 text-center">{error}</p>}

              {reserva.puedeCancelar && (
                confirmandoCancel ? (
                  <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
                    <p className="text-sm text-red-800 text-center font-medium">
                      ¿Seguro que quieres cancelar{esCita ? ' la cita' : ' la reserva'}?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmandoCancel(false)}
                        className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 bg-white"
                      >
                        No, mantener
                      </button>
                      <button
                        type="button"
                        onClick={cancelar}
                        disabled={cancelando}
                        className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        {cancelando ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        Sí, cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmandoCancel(true)}
                    className="w-full py-2.5 rounded-xl border border-gray-300 text-sm text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors"
                  >
                    Cancelar {esCita ? 'cita' : 'reserva'}
                  </button>
                )
              )}

              {!reserva.puedeCancelar && reserva.motivoNoCancelable
                && reserva.status !== 'cancelled' && reserva.status !== 'completed' && reserva.status !== 'checked_out' && (
                <p className="text-xs text-gray-400 text-center">{reserva.motivoNoCancelable}</p>
              )}

              {reserva.negocio?.telefono && (
                <a
                  href={`https://wa.me/51${String(reserva.negocio.telefono).replace(/\D/g, '').replace(/^51/, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-800"
                >
                  <Phone className="w-4 h-4" /> Contactar al negocio
                </a>
              )}

              {reserva.status === 'cancelled' && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
                  <Check className="w-3.5 h-3.5" /> Puedes volver a reservar desde el catálogo cuando quieras.
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          Guarda este enlace: es tu comprobante de reserva.
        </p>
      </div>
    </div>
  )
}
