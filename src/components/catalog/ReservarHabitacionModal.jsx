import { useState, useEffect } from 'react'
import { X, BedDouble, ChevronLeft, Check, Loader2, Users, Moon } from 'lucide-react'
import { EnlaceReserva } from './ReservarCitaModal'

/**
 * RESERVAR HABITACIÓN desde el catálogo público (modo hotel).
 *
 * Mismo esqueleto que ReservarCitaModal y por los mismos motivos: todo pasa
 * por Cloud Functions (las reservas de hotel traen documentos de huéspedes —
 * nada de eso puede quedar legible para un anónimo) y el catálogo solo pinta.
 *
 * La diferencia importante está en el REMATE: acá no se confirma nada. Lo que
 * el huésped envía es una SOLICITUD que el hotel acepta o rechaza — una
 * habitación bloqueada por un desconocido cuesta una noche, una cita solo 30
 * minutos. El texto final lo dice sin rodeos: "solicitud enviada", no
 * "reserva confirmada". Prometer confirmación acá sería mentirle al huésped.
 */

const FN_BASE = 'https://us-central1-cobrify-395fe.cloudfunctions.net'

const TIPOS = {
  simple: 'Simple', doble: 'Doble', matrimonial: 'Matrimonial',
  suite: 'Suite', familiar: 'Familiar',
}

const aYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const fechaLegible = (ymd) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function ReservarHabitacionModal({ business, accent = '#2563eb', isOpen, onClose }) {
  const [paso, setPaso] = useState('fechas') // fechas | habitaciones | datos | listo
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [huespedes, setHuespedes] = useState(2)
  const [rooms, setRooms] = useState([])
  const [noches, setNoches] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [habitacion, setHabitacion] = useState(null)
  const [form, setForm] = useState({ nombre: '', telefono: '', nota: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [resumen, setResumen] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setPaso('fechas'); setRooms([]); setHabitacion(null)
      setError(''); setResumen(null); setEnviando(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const hoy = aYMD(new Date())

  const buscar = async () => {
    setError('')
    if (!checkIn || !checkOut) { setError('Elige las fechas de llegada y salida'); return }
    if (checkOut <= checkIn) { setError('La salida debe ser después de la llegada'); return }
    setCargando(true)
    try {
      const r = await fetch(`${FN_BASE}/getPublicHotelRooms?businessId=${encodeURIComponent(business.id)}&checkIn=${checkIn}&checkOut=${checkOut}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'No se pudo consultar la disponibilidad')
      setRooms(data.rooms || [])
      setNoches(data.noches || 0)
      setPaso('habitaciones')
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  const totalDe = (room) => {
    const extras = Math.max(0, huespedes - (room.baseGuests || 1))
    return room.rate * noches + extras * (room.extraGuestRate || 0) * noches
  }

  const solicitar = async () => {
    const nombre = form.nombre.trim()
    const telefono = form.telefono.replace(/\D/g, '')
    if (nombre.length < 3) { setError('Escribe tu nombre completo'); return }
    if (telefono.length < 9) { setError('Escribe un teléfono válido (9 dígitos)'); return }
    setEnviando(true)
    setError('')
    try {
      const r = await fetch(`${FN_BASE}/requestPublicHotelReservation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          roomId: habitacion.id,
          checkIn, checkOut,
          guests: huespedes,
          name: nombre, phone: telefono, notes: form.nota.trim(),
        }),
      })
      const data = await r.json()
      if (!r.ok) {
        // La habitación se ocupó mientras llenaba el form: volver a la lista
        // con datos frescos.
        if (r.status === 409) { setPaso('fechas'); setHabitacion(null) }
        throw new Error(data.error || 'No se pudo enviar la solicitud')
      }
      setResumen({ noches: data.noches, total: data.totalAmount, token: data.token })
      setPaso('listo')
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const disponibles = rooms.filter(r => r.available && huespedes <= r.capacity)
  const noEntran = rooms.filter(r => !r.available || huespedes > r.capacity)

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {(paso === 'habitaciones' || paso === 'datos') && (
              <button
                type="button"
                onClick={() => { setPaso(paso === 'datos' ? 'habitaciones' : 'fechas'); setError('') }}
                className="p-1 -ml-1 text-gray-400 hover:text-gray-700"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <BedDouble className="w-5 h-5" style={{ color: accent }} />
            <h2 className="font-semibold text-gray-900">Reservar habitación</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">

          {paso === 'fechas' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Llegada</label>
                  <input
                    type="date" min={hoy} value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salida</label>
                  <input
                    type="date" min={checkIn || hoy} value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Personas</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button" onClick={() => setHuespedes(h => Math.max(1, h - 1))}
                    className="w-9 h-9 rounded-lg border border-gray-300 text-gray-600 font-semibold"
                  >−</button>
                  <span className="w-8 text-center font-semibold text-gray-900">{huespedes}</span>
                  <button
                    type="button" onClick={() => setHuespedes(h => Math.min(20, h + 1))}
                    className="w-9 h-9 rounded-lg border border-gray-300 text-gray-600 font-semibold"
                  >+</button>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button" onClick={buscar} disabled={cargando}
                className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: accent }}
              >
                {cargando ? (<><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</>) : 'Ver habitaciones disponibles'}
              </button>
            </div>
          )}

          {paso === 'habitaciones' && (
            <div className="space-y-3">
              <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: `${accent}12` }}>
                <span className="font-semibold text-gray-900">{fechaLegible(checkIn)} → {fechaLegible(checkOut)}</span>
                <span className="text-gray-600"> · {noches} noche{noches === 1 ? '' : 's'} · {huespedes} persona{huespedes === 1 ? '' : 's'}</span>
              </div>

              {disponibles.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">
                  No hay habitaciones libres para esas fechas y esa cantidad de personas. Prueba con otras fechas.
                </p>
              ) : disponibles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setHabitacion(r); setPaso('datos'); setError('') }}
                  className="w-full text-left border border-gray-200 rounded-xl p-4 hover:border-gray-400 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{r.name || `Habitación ${r.number}`}</p>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                        <span>{TIPOS[r.type] || r.type}</span>
                        <span className="flex items-center gap-0.5"><Users className="w-3 h-3" /> hasta {r.capacity}</span>
                      </p>
                      {r.amenities && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{r.amenities}</p>}
                    </div>
                    <div className="text-right flex-none">
                      <p className="font-bold text-gray-900">S/ {totalDe(r).toFixed(2)}</p>
                      <p className="text-[11px] text-gray-400 flex items-center justify-end gap-0.5">
                        <Moon className="w-3 h-3" /> S/ {r.rate.toFixed(2)}/noche
                      </p>
                    </div>
                  </div>
                </button>
              ))}

              {noEntran.length > 0 && (
                <p className="text-xs text-gray-400 text-center pt-1">
                  {noEntran.length} habitación(es) más no disponible(s) para esta búsqueda.
                </p>
              )}
            </div>
          )}

          {paso === 'datos' && habitacion && (
            <div className="space-y-4">
              <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: `${accent}12` }}>
                <p className="font-semibold text-gray-900">{habitacion.name || `Habitación ${habitacion.number}`}</p>
                <p className="text-gray-600">
                  {fechaLegible(checkIn)} → {fechaLegible(checkOut)} · {noches} noche{noches === 1 ? '' : 's'} ·{' '}
                  <span className="font-semibold text-gray-900">S/ {totalDe(habitacion).toFixed(2)}</span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tu nombre *</label>
                <input
                  type="text" value={form.nombre}
                  onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="Nombre y apellido" maxLength={80}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tu teléfono *</label>
                <input
                  type="tel" value={form.telefono}
                  onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="999 999 999" maxLength={15}
                />
                <p className="text-xs text-gray-400 mt-1">El hotel te confirmará por WhatsApp.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comentario <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text" value={form.nota}
                  onChange={(e) => setForm(f => ({ ...f, nota: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="Hora aproximada de llegada, pedidos especiales..." maxLength={300}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button" onClick={solicitar} disabled={enviando}
                className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: accent }}
              >
                {enviando ? (<><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>) : 'Enviar solicitud de reserva'}
              </button>
            </div>
          )}

          {paso === 'listo' && resumen && (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
                <Check className="w-7 h-7" style={{ color: accent }} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Solicitud enviada</h3>
              <p className="text-sm text-gray-600">
                Pediste <strong>{habitacion?.name || `la habitación ${habitacion?.number}`}</strong> del{' '}
                <strong>{fechaLegible(checkIn)}</strong> al <strong>{fechaLegible(checkOut)}</strong> — S/ {Number(resumen.total).toFixed(2)}.
              </p>
              <p className="text-xs text-gray-400">
                Todavía no es una reserva confirmada: el hotel la revisará y te escribirá por WhatsApp al número que dejaste.
              </p>
              {resumen.token && (
                <EnlaceReserva
                  url={`${window.location.origin}/mi-reserva/${business.id}/${resumen.token}`}
                  accent={accent}
                />
              )}
              <button
                type="button" onClick={onClose}
                className="mt-2 px-6 py-2.5 rounded-xl text-white font-medium"
                style={{ backgroundColor: accent }}
              >
                Listo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
