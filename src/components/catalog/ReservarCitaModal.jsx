import { useState, useEffect, useCallback } from 'react'
import { X, Calendar, ChevronLeft, Check, Loader2 } from 'lucide-react'

/**
 * RESERVAR CITA desde el catálogo público.
 *
 * Todo pasa por las Cloud Functions públicas (getPublicAgenda /
 * bookPublicAppointment), nunca por Firestore directo. No es un capricho:
 * las citas traen datos personales de otros clientes y las reglas de
 * Firestore no filtran campos, así que la disponibilidad llega ya
 * desinfectada — solo horas. Y la creación corre en el servidor con un
 * candado por hueco, para que dos personas eligiendo las 10:00 a la vez no
 * terminen las dos con cita.
 *
 * El flujo es servicio → día y hora → datos: primero QUÉ necesita (si el
 * negocio publicó servicios), después CUÁNDO puede, y recién al final quién
 * es. El servicio que se envía es un ID: el nombre y el precio los pone el
 * SERVIDOR desde la configuración del negocio, así nadie reserva un "Baño a
 * S/ 1" editando el request.
 *
 * Al desconocido se le muestran SOLO horas libres: cuántas citas tiene el
 * negocio no es asunto suyo.
 */

const FN_BASE = 'https://us-central1-cobrify-395fe.cloudfunctions.net'

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const aYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// El scrollbar nativo bajo la fila de días se veía como un error de layout:
// se oculta igual que en las filas del catálogo.
const sinScrollbar = { scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }

/**
 * Enlace "mi reserva" con boton de copiar. El enlace ES el comprobante: sin
 * cuentas ni login, quien lo tiene puede ver el estado y cancelar. Por eso se
 * insiste en que lo guarde.
 */
export function EnlaceReserva({ url, accent }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin clipboard (http viejo): el input queda seleccionable a mano.
    }
  }
  return (
    <div className="text-left bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
      <p className="text-xs font-medium text-gray-600">
        Guarda este enlace — con él ves el estado o cancelas:
      </p>
      <div className="flex gap-2">
        <input
          type="text" readOnly value={url}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600"
        />
        <button
          type="button" onClick={copiar}
          className="flex-none px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
          style={{ backgroundColor: accent }}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

export default function ReservarCitaModal({ business, accent = '#2563eb', isOpen, onClose }) {
  const config = business?.appointmentsBooking || {}
  const days = Array.isArray(config.days) && config.days.length ? config.days : [1, 2, 3, 4, 5, 6]
  const startHour = Number(config.startHour) || 9
  const endHour = Number(config.endHour) || 19
  const step = Number(config.stepMinutes) || 30
  const esVeterinaria = business?.businessMode === 'veterinary'
  const servicios = Array.isArray(config.services) ? config.services.filter(s => s && s.id && s.name) : []
  const pasoInicial = servicios.length > 0 ? 'servicio' : 'dia'

  const [paso, setPaso] = useState(pasoInicial) // servicio | dia | datos | listo
  const [servicio, setServicio] = useState(null)
  const [fecha, setFecha] = useState(null) // 'YYYY-MM-DD'
  const [busy, setBusy] = useState([])
  const [cargandoHoras, setCargandoHoras] = useState(false)
  const [hora, setHora] = useState(null)
  const [form, setForm] = useState({ nombre: '', telefono: '', mascota: '', nota: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [confirmada, setConfirmada] = useState(null)

  // Los próximos 14 días que el negocio atiende. Se calculan en el navegador
  // del cliente (que está en Perú, como el negocio); el servidor re-valida
  // igual cada reserva, así que un reloj raro no puede colar nada.
  const diasDisponibles = []
  for (let i = 0; i < 14; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    if (days.includes(d.getDay())) diasDisponibles.push(d)
  }

  const cargarHoras = useCallback(async (ymd) => {
    setCargandoHoras(true)
    setError('')
    try {
      const r = await fetch(`${FN_BASE}/getPublicAgenda?businessId=${encodeURIComponent(business.id)}&date=${ymd}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'No se pudo consultar la disponibilidad')
      setBusy(data.busy || [])
    } catch (e) {
      setError(e.message)
      setBusy([])
    } finally {
      setCargandoHoras(false)
    }
  }, [business?.id])

  useEffect(() => {
    if (isOpen && fecha) cargarHoras(fecha)
  }, [isOpen, fecha, cargarHoras])

  // Reset al cerrar, para que la próxima apertura arranque limpia.
  useEffect(() => {
    if (!isOpen) {
      setPaso(pasoInicial); setServicio(null); setFecha(null); setHora(null)
      setError(''); setConfirmada(null); setEnviando(false)
    }
  }, [isOpen, pasoInicial])

  if (!isOpen) return null

  // Huecos libres del día elegido: la grilla completa menos los ocupados y,
  // si es hoy, menos los que ya pasaron (con la misma media hora de
  // anticipación que exige el servidor — así no se ofrece un botón que va a
  // rebotar).
  const huecosLibres = []
  if (fecha) {
    const esHoy = fecha === aYMD(new Date())
    const limite = Date.now() + 30 * 60 * 1000
    for (let min = startHour * 60; min < endHour * 60; min += step) {
      const hh = String(Math.floor(min / 60)).padStart(2, '0')
      const mm = String(min % 60).padStart(2, '0')
      const t = `${hh}:${mm}`
      if (busy.includes(t)) continue
      if (esHoy) {
        const [y, m, d] = fecha.split('-').map(Number)
        if (new Date(y, m - 1, d, Number(hh), Number(mm)).getTime() < limite) continue
      }
      huecosLibres.push(t)
    }
  }

  const reservar = async () => {
    const nombre = form.nombre.trim()
    const telefono = form.telefono.replace(/\D/g, '')
    if (nombre.length < 3) { setError('Escribe tu nombre completo'); return }
    if (telefono.length < 9) { setError('Escribe un teléfono válido (9 dígitos)'); return }
    setEnviando(true)
    setError('')
    try {
      const r = await fetch(`${FN_BASE}/bookPublicAppointment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          date: fecha,
          time: hora,
          serviceId: servicio?.id || '',
          name: nombre,
          phone: telefono,
          petName: esVeterinaria ? form.mascota.trim() : '',
          notes: form.nota.trim(),
        }),
      })
      const data = await r.json()
      if (!r.ok) {
        // La hora se ocupó mientras llenaba el formulario: volver a las horas
        // con la lista fresca, no dejarlo reintentar contra un hueco muerto.
        if (r.status === 409) {
          setPaso('dia'); setHora(null); cargarHoras(fecha)
        }
        throw new Error(data.error || 'No se pudo crear la reserva')
      }
      setConfirmada({ fecha, hora, token: data.token })
      setPaso('listo')
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const fechaLegible = (ymd) => {
    if (!ymd) return ''
    const [y, m, d] = ymd.split('-').map(Number)
    const dd = new Date(y, m - 1, d)
    return `${DIAS_CORTOS[dd.getDay()]} ${d} de ${MESES_CORTOS[m - 1]}`
  }

  const volver = () => {
    setError('')
    if (paso === 'datos') { setPaso('dia'); return }
    if (paso === 'dia' && servicios.length > 0) { setPaso('servicio'); setFecha(null); setHora(null) }
  }

  // Resumen de lo elegido hasta ahora: acompaña los pasos de día y de datos
  // para que el cliente nunca pierda de vista qué está reservando.
  const Resumen = () => (
    <div className="rounded-xl px-4 py-3 text-sm space-y-0.5" style={{ backgroundColor: `${accent}0d` }}>
      {servicio && (
        <p>
          <span className="font-semibold text-gray-900">{servicio.name}</span>
          {Number(servicio.price) > 0 && (
            <span className="text-gray-500"> · S/ {Number(servicio.price).toFixed(2)}</span>
          )}
        </p>
      )}
      {fecha && hora && (
        <p className="text-gray-600">
          <span className="font-medium text-gray-900">{fechaLegible(fecha)}</span> a las{' '}
          <span className="font-medium text-gray-900">{hora}</span>
        </p>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col">

        {/* Encabezado */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {(paso === 'datos' || (paso === 'dia' && servicios.length > 0)) && (
              <button type="button" onClick={volver} className="p-1 -ml-1 text-gray-400 hover:text-gray-700">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <Calendar className="w-5 h-5" style={{ color: accent }} />
            <h2 className="font-semibold text-gray-900">Reservar cita</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">

          {paso === 'servicio' && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-3">¿Qué servicio necesitas?</p>
              {servicios.map((svc) => (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => { setServicio(svc); setPaso('dia'); setError('') }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="font-medium text-gray-900 truncate">{svc.name}</span>
                  {Number(svc.price) > 0 && (
                    <span className="flex-none text-sm font-semibold" style={{ color: accent }}>
                      S/ {Number(svc.price).toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {paso === 'dia' && (
            <div className="space-y-5">
              {servicio && <Resumen />}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2.5">Elige el día</p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={sinScrollbar}>
                  {diasDisponibles.map((d) => {
                    const ymd = aYMD(d)
                    const activo = fecha === ymd
                    return (
                      <button
                        key={ymd}
                        type="button"
                        onClick={() => { setFecha(ymd); setHora(null) }}
                        className={`flex-none w-[3.75rem] py-2.5 rounded-2xl text-center transition-all ${
                          activo ? 'text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                        }`}
                        style={activo ? { backgroundColor: accent } : {}}
                      >
                        <span className={`block text-[10px] uppercase tracking-wide ${activo ? 'text-white/80' : 'text-gray-400'}`}>
                          {DIAS_CORTOS[d.getDay()]}
                        </span>
                        <span className="block text-lg font-bold leading-tight">{d.getDate()}</span>
                        <span className={`block text-[10px] ${activo ? 'text-white/80' : 'text-gray-400'}`}>
                          {MESES_CORTOS[d.getMonth()]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {fecha && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2.5">Elige la hora</p>
                  {cargandoHoras ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" /> Consultando horarios...
                    </div>
                  ) : huecosLibres.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      No quedan horas libres este día. Prueba con otro.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {huecosLibres.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setHora(t); setPaso('datos'); setError('') }}
                          className="py-2.5 rounded-xl bg-gray-50 text-sm font-medium text-gray-800 hover:bg-gray-100 transition-colors"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          {paso === 'datos' && (
            <div className="space-y-4">
              <Resumen />
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
                <p className="text-xs text-gray-400 mt-1">Te confirmaremos la cita por WhatsApp.</p>
              </div>
              {esVeterinaria && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tu mascota</label>
                  <input
                    type="text" value={form.mascota}
                    onChange={(e) => setForm(f => ({ ...f, mascota: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                    placeholder="Nombre de tu mascota" maxLength={60}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comentario <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text" value={form.nota}
                  onChange={(e) => setForm(f => ({ ...f, nota: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="Algo que debamos saber"
                  maxLength={300}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button" onClick={reservar} disabled={enviando}
                className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: accent }}
              >
                {enviando ? (<><Loader2 className="w-4 h-4 animate-spin" /> Reservando...</>) : 'Confirmar reserva'}
              </button>
            </div>
          )}

          {paso === 'listo' && confirmada && (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
                <Check className="w-7 h-7" style={{ color: accent }} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Cita reservada</h3>
              <p className="text-sm text-gray-600">
                {servicio ? <><strong>{servicio.name}</strong> — </> : null}
                te esperamos el <strong>{fechaLegible(confirmada.fecha)}</strong> a las <strong>{confirmada.hora}</strong>.
              </p>
              <p className="text-xs text-gray-400">
                El negocio te confirmará por WhatsApp al número que dejaste.
              </p>
              {confirmada.token && (
                <EnlaceReserva
                  url={`${window.location.origin}/mi-reserva/${business.id}/${confirmada.token}`}
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
