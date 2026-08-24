import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Check, Loader2, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { EnlaceReserva, FN_BASE, DIAS_CORTOS, MESES_CORTOS, aYMD } from './ReservarCitaModal'

/**
 * RESERVAR CITA como SECCIÓN de la tienda (no un modal).
 *
 * Bloque de ancho completo, tipo widget: servicio, calendario, hora y datos
 * están TODOS a la vista al mismo tiempo — el cliente ve de un golpe qué
 * puede reservar y cuándo, sin abrir nada ni avanzar por pasos. En escritorio
 * son tres columnas (qué / cuándo / quién) y en móvil se apilan en ese mismo
 * orden, que es el orden en que uno decide.
 *
 * El calendario es de MES (no una fila de días): con una fila de 14 días el
 * cliente no puede ver "el sábado de la otra semana" sin desplazarse a ciegas.
 * Las horas van en un desplegable: una grilla de 20 botones ganaba la pantalla
 * completa en móvil y competía con el resto del formulario.
 *
 * La lógica de red es la misma del modal y por los mismos motivos: todo pasa
 * por las Cloud Functions públicas (getPublicAgenda / bookPublicAppointment),
 * nunca por Firestore directo — las citas traen datos personales de otros
 * clientes y las reglas no filtran campos, así que la disponibilidad llega ya
 * desinfectada (solo horas libres). La creación corre en el servidor con un
 * candado por hueco. El servicio y el profesional viajan como ID: nombre y
 * precio los pone el SERVIDOR desde la configuración del negocio.
 */

const DIAS_INICIAL = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export default function ReservarCitaSection({ business, accent = '#2563eb', themeClasses = {} }) {
  const config = business?.appointmentsBooking || {}
  const days = Array.isArray(config.days) && config.days.length ? config.days : [1, 2, 3, 4, 5, 6]
  const startHour = Number(config.startHour) || 9
  const endHour = Number(config.endHour) || 19
  const step = Number(config.stepMinutes) || 30
  const esVeterinaria = business?.businessMode === 'veterinary'
  const servicios = Array.isArray(config.services) ? config.services.filter(s => s && s.id && s.name) : []
  // Profesionales (opcional): si el negocio no configuró ninguno, el bloque
  // entero no existe — la mayoría de negocios no lo necesita.
  const staff = Array.isArray(config.staff) ? config.staff.filter(x => x && x.id && x.name) : []
  const staffLabel = (config.staffLabel || '').trim() || 'Profesional'

  // Contraida por defecto: la reserva es para quien la busca; a los demas
  // no les come la pantalla antes de ver los productos.
  const [abierto, setAbierto] = useState(false)
  const [servicio, setServicio] = useState(null)
  const [profesional, setProfesional] = useState(null)
  const [mesVista, setMesVista] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [fecha, setFecha] = useState(null)
  const [busy, setBusy] = useState([])
  const [cargandoHoras, setCargandoHoras] = useState(false)
  const [hora, setHora] = useState(null)
  const [form, setForm] = useState({ nombre: '', telefono: '', mascota: '', nota: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [confirmada, setConfirmada] = useState(null)

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  // Se puede reservar hasta 60 días adelante: más allá el negocio ni sabe si
  // seguirá con ese horario.
  const limite = new Date(hoy)
  limite.setDate(limite.getDate() + 60)

  const diaReservable = (d) => d >= hoy && d <= limite && days.includes(d.getDay())

  const cargarHoras = useCallback(async (ymd, staffId) => {
    setCargandoHoras(true)
    setError('')
    try {
      const qs = new URLSearchParams({ businessId: business.id, date: ymd })
      if (staffId) qs.set('staffId', staffId)
      const r = await fetch(`${FN_BASE}/getPublicAgenda?${qs.toString()}`)
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

  // Primer día atendible preseleccionado: la sección aparece con horas reales
  // a la vista, no con un hueco esperando un clic.
  useEffect(() => {
    if (fecha) return
    for (let i = 0; i < 60; i++) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() + i)
      if (diaReservable(d)) { setFecha(aYMD(d)); setMesVista({ y: d.getFullYear(), m: d.getMonth() }); return }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // La agenda depende del profesional: con dos doctores, las 10:00 pueden
  // estar libres con uno y ocupadas con el otro.
  useEffect(() => {
    // Cerrada no se consulta nada: seria una llamada al servidor por cada
    // visita del catalogo, para un panel que nadie abrio.
    if (abierto && fecha) cargarHoras(fecha, profesional?.id)
  }, [abierto, fecha, profesional, cargarHoras])

  const huecosLibres = []
  if (fecha) {
    const esHoy = fecha === aYMD(new Date())
    const corte = Date.now() + 30 * 60 * 1000
    for (let min = startHour * 60; min < endHour * 60; min += step) {
      const hh = String(Math.floor(min / 60)).padStart(2, '0')
      const mm = String(min % 60).padStart(2, '0')
      const t = `${hh}:${mm}`
      if (busy.includes(t)) continue
      if (esHoy) {
        const [y, m, d] = fecha.split('-').map(Number)
        if (new Date(y, m - 1, d, Number(hh), Number(mm)).getTime() < corte) continue
      }
      huecosLibres.push(t)
    }
  }

  const fechaLegible = (ymd) => {
    if (!ymd) return ''
    const [y, m, d] = ymd.split('-').map(Number)
    const dd = new Date(y, m - 1, d)
    return `${DIAS_CORTOS[dd.getDay()]} ${d} de ${MESES_CORTOS[m - 1]}`
  }

  const faltaServicio = servicios.length > 0 && !servicio
  const faltaProfesional = staff.length > 0 && !profesional
  const listo = !faltaServicio && !faltaProfesional && !!fecha && !!hora

  const reservar = async () => {
    if (faltaServicio) { setError('Elige el servicio que necesitas'); return }
    if (faltaProfesional) { setError(`Elige con quién quieres tu cita`); return }
    if (!fecha || !hora) { setError('Elige el día y la hora de tu cita'); return }
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
          staffId: profesional?.id || '',
          name: nombre,
          phone: telefono,
          petName: esVeterinaria ? form.mascota.trim() : '',
          notes: form.nota.trim(),
        }),
      })
      const data = await r.json()
      if (!r.ok) {
        if (r.status === 409) { setHora(null); cargarHoras(fecha, profesional?.id) }
        throw new Error(data.error || 'No se pudo crear la reserva')
      }
      setConfirmada({ fecha, hora, token: data.token })
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const tCard = themeClasses.card || 'bg-white'
  const tBorde = themeClasses.borderColor || 'border-gray-200'
  const tText = themeClasses.text || 'text-gray-900'
  const tMuted = themeClasses.textMuted || 'text-gray-500'
  const tSuave = themeClasses.catInactive || 'bg-gray-50 text-gray-700 hover:bg-gray-100'

  // ---- confirmada: la sección se convierte en el comprobante ----
  if (confirmada) {
    return (
      <section className="max-w-7xl mx-auto px-4 mt-8">
        <div className={`${tCard} ${tBorde} border rounded-2xl px-5 py-8 text-center space-y-3`}>
          <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
            <Check className="w-7 h-7" style={{ color: accent }} />
          </div>
          <h3 className={`text-lg font-semibold ${tText}`}>Cita reservada</h3>
          <p className={`text-sm ${tMuted}`}>
            {servicio ? <><strong className={tText}>{servicio.name}</strong> — </> : null}
            te esperamos el <strong className={tText}>{fechaLegible(confirmada.fecha)}</strong> a las <strong className={tText}>{confirmada.hora}</strong>
            {profesional ? <> con <strong className={tText}>{profesional.name}</strong></> : null}.
          </p>
          <p className={`text-xs ${tMuted}`}>El negocio te confirmará por WhatsApp al número que dejaste.</p>
          {confirmada.token && (
            <div className="max-w-md mx-auto">
              <EnlaceReserva
                url={`${window.location.origin}/mi-reserva/${business.id}/${confirmada.token}`}
                accent={accent}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => { setConfirmada(null); setHora(null); setForm({ nombre: '', telefono: '', mascota: '', nota: '' }) }}
            className={`mt-1 text-sm font-medium ${tMuted} hover:underline`}
          >
            Reservar otra cita
          </button>
        </div>
      </section>
    )
  }

  // ---- calendario del mes ----
  const primerDia = new Date(mesVista.y, mesVista.m, 1)
  const diasEnMes = new Date(mesVista.y, mesVista.m + 1, 0).getDate()
  const celdas = []
  for (let i = 0; i < primerDia.getDay(); i++) celdas.push(null)
  for (let d = 1; d <= diasEnMes; d++) celdas.push(new Date(mesVista.y, mesVista.m, d))
  const mesAnteriorPosible = new Date(mesVista.y, mesVista.m, 1) > new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const mesSiguientePosible = new Date(mesVista.y, mesVista.m + 1, 1) <= limite
  const moverMes = (delta) => setMesVista(({ y, m }) => {
    const d = new Date(y, m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const inputCls = `w-full px-3 py-2.5 border rounded-lg text-sm bg-transparent ${tBorde} ${tText}`
  // Numeracion de los pasos calculada de la lista real de bloques visibles:
  // un contador que se incrementa dentro del JSX se desincroniza (React puede
  // evaluar mas veces de las que se ven) y salta numeros.
  const pasos = []
  if (servicios.length > 0) pasos.push('servicio')
  if (staff.length > 0) pasos.push('staff')
  pasos.push('fecha', 'datos')
  const nPaso = (id) => pasos.indexOf(id) + 1

  return (
    <section className="max-w-7xl mx-auto px-4 mt-8 mb-10">
      <div className={`${tCard} ${tBorde} border rounded-2xl overflow-hidden`}>
        <button
          type="button"
          onClick={() => setAbierto(v => !v)}
          className={`w-full px-5 py-4 flex items-center gap-2.5 text-left transition-colors ${abierto ? `border-b ${tBorde}` : ''}`}
          aria-expanded={abierto}
        >
          <CalendarDays className="w-5 h-5 flex-shrink-0" style={{ color: accent }} />
          <div className="flex-1 min-w-0">
            <h2 className={`font-semibold ${tText}`}>Reserva tu cita</h2>
            <p className={`text-xs ${tMuted}`}>Elige el servicio, el día y la hora. Te confirmamos por WhatsApp.</p>
          </div>
          <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${tMuted} ${abierto ? 'rotate-180' : ''}`} />
        </button>

        {abierto && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-6 p-5">

          {/* ---- 1. Servicio (+ profesional, si el negocio lo usa) ---- */}
          {(servicios.length > 0 || staff.length > 0) && (
            <div className="space-y-5">
              {servicios.length > 0 && (
                  <div className="space-y-2.5">
                    <p className={`text-sm font-semibold ${tText}`}>{nPaso('servicio')}. Servicio</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 lg:max-h-72 lg:overflow-y-auto catalog-scrollbar lg:pr-1">
                      {servicios.map((svc) => {
                        const activo = servicio?.id === svc.id
                        return (
                          <button
                            key={svc.id}
                            type="button"
                            onClick={() => { setServicio(svc); setError('') }}
                            className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${activo ? 'shadow-sm' : `${tBorde} hover:opacity-80`}`}
                            style={activo ? { borderColor: accent, backgroundColor: `${accent}0f` } : undefined}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className={`font-medium truncate ${activo ? '' : tText}`} style={activo ? { color: accent } : undefined}>
                                {svc.name}
                              </span>
                              {Number(svc.price) > 0 && (
                                <span className="flex-none text-sm font-semibold" style={{ color: accent }}>
                                  S/ {Number(svc.price).toFixed(2)}
                                </span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
              )}

              {staff.length > 0 && (
                  <div className="space-y-2.5">
                    <p className={`text-sm font-semibold ${tText}`}>{nPaso('staff')}. {staffLabel}</p>
                    <div className="flex flex-wrap gap-2">
                      {staff.map((s) => {
                        const activo = profesional?.id === s.id
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => { setProfesional(s); setHora(null); setError('') }}
                            className={`px-3.5 py-2 rounded-full text-sm font-medium transition-all ${activo ? 'text-white shadow-sm' : tSuave}`}
                            style={activo ? { backgroundColor: accent } : undefined}
                          >
                            {s.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
              )}
            </div>
          )}

          {/* ---- 2. Fecha (calendario del mes) + hora (desplegable) ---- */}
          <div className="space-y-3">
            <p className={`text-sm font-semibold ${tText}`}>{nPaso('fecha')}. Fecha y hora</p>

            <div className={`border ${tBorde} rounded-xl p-3`}>
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button" onClick={() => moverMes(-1)} disabled={!mesAnteriorPosible}
                  className={`p-1 rounded-lg disabled:opacity-30 ${tMuted}`}
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className={`text-sm font-medium capitalize ${tText}`}>
                  {MESES_LARGOS[mesVista.m]} {mesVista.y}
                </span>
                <button
                  type="button" onClick={() => moverMes(1)} disabled={!mesSiguientePosible}
                  className={`p-1 rounded-lg disabled:opacity-30 ${tMuted}`}
                  aria-label="Mes siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className={`grid grid-cols-7 gap-1 text-center text-[11px] mb-1 ${tMuted}`}>
                {DIAS_INICIAL.map((d, i) => <span key={i}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {celdas.map((d, i) => {
                  if (!d) return <span key={`v-${i}`} />
                  const ymd = aYMD(d)
                  const habilitado = diaReservable(d)
                  const activo = fecha === ymd
                  return (
                    <button
                      key={ymd}
                      type="button"
                      disabled={!habilitado}
                      onClick={() => { setFecha(ymd); setHora(null); setError('') }}
                      className={`aspect-square rounded-lg text-sm font-medium transition-colors ${
                        activo ? 'text-white' : habilitado ? tSuave : `${tMuted} opacity-30 cursor-not-allowed`
                      }`}
                      style={activo ? { backgroundColor: accent } : undefined}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>

          </div>

          {/* ---- 3. Tus datos (la hora vive aca: el calendario queda solo en
               su columna y las tres quedan parejas) ---- */}
          <div className="space-y-3">
            <p className={`text-sm font-semibold ${tText}`}>{nPaso('datos')}. Tus datos</p>
            <div>
              <label className={`block text-xs mb-1.5 ${tMuted}`}>Hora disponible</label>
              {cargandoHoras ? (
                <div className={`flex items-center gap-2 text-sm py-3 ${tMuted}`}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Consultando horarios...
                </div>
              ) : !fecha ? (
                <p className={`text-sm py-3 ${tMuted}`}>Elige primero un día del calendario.</p>
              ) : huecosLibres.length === 0 ? (
                <p className={`text-sm py-3 ${tMuted}`}>No quedan horas libres este día. Prueba con otro.</p>
              ) : (
                <select
                  value={hora || ''}
                  onChange={(e) => { setHora(e.target.value || null); setError('') }}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">Elige una hora</option>
                  {huecosLibres.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
            <input
              type="text" value={form.nombre}
              onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
              className={inputCls} placeholder="Nombre y apellido" maxLength={80}
            />
            <input
              type="tel" value={form.telefono}
              onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))}
              className={inputCls} placeholder="Teléfono (999 999 999)" maxLength={15}
            />
            {esVeterinaria && (
              <input
                type="text" value={form.mascota}
                onChange={(e) => setForm(f => ({ ...f, mascota: e.target.value }))}
                className={inputCls} placeholder="Nombre de tu mascota" maxLength={60}
              />
            )}
            <input
              type="text" value={form.nota}
              onChange={(e) => setForm(f => ({ ...f, nota: e.target.value }))}
              className={inputCls} placeholder="Comentario (opcional)" maxLength={300}
            />

            {(servicio || profesional || (fecha && hora)) && (
              <div className="rounded-xl px-3 py-2.5 text-sm space-y-0.5" style={{ backgroundColor: `${accent}0d` }}>
                {servicio && (
                  <p className={tText}>
                    <span className="font-semibold">{servicio.name}</span>
                    {Number(servicio.price) > 0 && <span className={tMuted}> · S/ {Number(servicio.price).toFixed(2)}</span>}
                  </p>
                )}
                {fecha && hora && (
                  <p className={tMuted}>
                    <span className={`font-medium ${tText}`}>{fechaLegible(fecha)}</span> a las <span className={`font-medium ${tText}`}>{hora}</span>
                  </p>
                )}
                {profesional && <p className={tMuted}>Con {profesional.name}</p>}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button" onClick={reservar} disabled={enviando}
              className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {enviando ? (<><Loader2 className="w-4 h-4 animate-spin" /> Reservando...</>) : 'Confirmar reserva'}
            </button>
            {!listo && (
              <p className={`text-xs text-center ${tMuted}`}>
                {faltaServicio ? 'Elige un servicio para continuar'
                  : faltaProfesional ? `Elige ${staffLabel.toLowerCase()} para continuar`
                  : 'Elige el día y la hora'}
              </p>
            )}
          </div>
        </div>
        )}
      </div>
    </section>
  )
}
