import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Check, Loader2 } from 'lucide-react'
import { EnlaceReserva, FN_BASE, DIAS_CORTOS, MESES_CORTOS, aYMD, sinScrollbar } from './ReservarCitaModal'

/**
 * RESERVAR CITA como SECCIÓN de la tienda (no un modal).
 *
 * Es un bloque de ancho completo, tipo widget: servicios, calendario, horas y
 * formulario están TODOS a la vista al mismo tiempo — el cliente ve de un
 * golpe qué puede reservar y cuándo, sin abrir nada ni avanzar por pasos.
 * En escritorio son tres columnas (qué / cuándo / quién) y en móvil se apilan
 * en ese mismo orden, que es el orden en que uno decide.
 *
 * La lógica de red es la misma del modal y por los mismos motivos: todo pasa
 * por las Cloud Functions públicas (getPublicAgenda / bookPublicAppointment),
 * nunca por Firestore directo — las citas traen datos personales de otros
 * clientes y las reglas no filtran campos, así que la disponibilidad llega ya
 * desinfectada (solo horas libres). La creación corre en el servidor con un
 * candado por hueco: dos personas eligiendo las 10:00 a la vez no terminan
 * las dos con cita. Y el servicio viaja como ID: nombre y precio los pone el
 * servidor desde la configuración, así nadie reserva un "Baño a S/ 1"
 * editando el request.
 */
export default function ReservarCitaSection({ business, accent = '#2563eb', themeClasses = {} }) {
  const config = business?.appointmentsBooking || {}
  const days = Array.isArray(config.days) && config.days.length ? config.days : [1, 2, 3, 4, 5, 6]
  const startHour = Number(config.startHour) || 9
  const endHour = Number(config.endHour) || 19
  const step = Number(config.stepMinutes) || 30
  const esVeterinaria = business?.businessMode === 'veterinary'
  const servicios = Array.isArray(config.services) ? config.services.filter(s => s && s.id && s.name) : []

  const [servicio, setServicio] = useState(null)
  const [fecha, setFecha] = useState(null)
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

  // Se precarga el primer día disponible: la sección aparece con horas reales
  // a la vista, no con un hueco esperando un clic.
  useEffect(() => {
    if (!fecha && diasDisponibles.length > 0) setFecha(aYMD(diasDisponibles[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (fecha) cargarHoras(fecha)
  }, [fecha, cargarHoras])

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

  const fechaLegible = (ymd) => {
    if (!ymd) return ''
    const [y, m, d] = ymd.split('-').map(Number)
    const dd = new Date(y, m - 1, d)
    return `${DIAS_CORTOS[dd.getDay()]} ${d} de ${MESES_CORTOS[m - 1]}`
  }

  const faltaServicio = servicios.length > 0 && !servicio
  const listoParaReservar = !faltaServicio && !!fecha && !!hora

  const reservar = async () => {
    if (faltaServicio) { setError('Elige el servicio que necesitas'); return }
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
          name: nombre,
          phone: telefono,
          petName: esVeterinaria ? form.mascota.trim() : '',
          notes: form.nota.trim(),
        }),
      })
      const data = await r.json()
      if (!r.ok) {
        // La hora se ocupó mientras llenaba el formulario: se refresca la
        // lista para que no reintente contra un hueco muerto.
        if (r.status === 409) { setHora(null); cargarHoras(fecha) }
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
            te esperamos el <strong className={tText}>{fechaLegible(confirmada.fecha)}</strong> a las <strong className={tText}>{confirmada.hora}</strong>.
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

  const inputCls = `w-full px-3 py-2.5 border rounded-lg text-sm bg-transparent ${tBorde} ${tText}`

  return (
    <section className="max-w-7xl mx-auto px-4 mt-8">
      <div className={`${tCard} ${tBorde} border rounded-2xl overflow-hidden`}>
        {/* Cabecera del widget */}
        <div className={`px-5 py-4 border-b ${tBorde} flex items-center gap-2.5`}>
          <CalendarDays className="w-5 h-5 flex-shrink-0" style={{ color: accent }} />
          <div>
            <h2 className={`font-semibold ${tText}`}>Reserva tu cita</h2>
            <p className={`text-xs ${tMuted}`}>Elige el servicio, el día y la hora. Te confirmamos por WhatsApp.</p>
          </div>
        </div>

        {/* Tres zonas a la vista: qué / cuándo / quién */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5">

          {/* 1. Servicios */}
          {servicios.length > 0 && (
            <div className="space-y-2">
              <p className={`text-sm font-medium ${tText}`}>1. ¿Qué necesitas?</p>
              <div className="space-y-2 lg:max-h-80 lg:overflow-y-auto catalog-scrollbar">
                {servicios.map((svc) => {
                  const activo = servicio?.id === svc.id
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => { setServicio(svc); setError('') }}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${activo ? '' : `${tBorde} hover:opacity-80`}`}
                      style={activo ? { borderColor: accent, backgroundColor: `${accent}10` } : undefined}
                    >
                      <span className={`font-medium truncate ${activo ? '' : tText}`} style={activo ? { color: accent } : undefined}>
                        {svc.name}
                      </span>
                      {Number(svc.price) > 0 && (
                        <span className="flex-none text-sm font-semibold" style={{ color: accent }}>
                          S/ {Number(svc.price).toFixed(2)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 2. Día y hora */}
          <div className="space-y-4">
            <p className={`text-sm font-medium ${tText}`}>{servicios.length > 0 ? '2.' : '1.'} ¿Cuándo?</p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={sinScrollbar}>
              {diasDisponibles.map((d) => {
                const ymd = aYMD(d)
                const activo = fecha === ymd
                return (
                  <button
                    key={ymd}
                    type="button"
                    onClick={() => { setFecha(ymd); setHora(null); setError('') }}
                    className={`flex-none w-[3.75rem] py-2.5 rounded-2xl text-center transition-all ${activo ? 'text-white shadow-sm' : `${themeClasses.catInactive || 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}`}
                    style={activo ? { backgroundColor: accent } : {}}
                  >
                    <span className={`block text-[10px] uppercase tracking-wide ${activo ? 'text-white/80' : 'opacity-60'}`}>
                      {DIAS_CORTOS[d.getDay()]}
                    </span>
                    <span className="block text-lg font-bold leading-tight">{d.getDate()}</span>
                    <span className={`block text-[10px] ${activo ? 'text-white/80' : 'opacity-60'}`}>
                      {MESES_CORTOS[d.getMonth()]}
                    </span>
                  </button>
                )
              })}
            </div>

            {cargandoHoras ? (
              <div className={`flex items-center gap-2 text-sm py-6 justify-center ${tMuted}`}>
                <Loader2 className="w-4 h-4 animate-spin" /> Consultando horarios...
              </div>
            ) : huecosLibres.length === 0 ? (
              <p className={`text-sm py-6 text-center ${tMuted}`}>
                No quedan horas libres este día. Prueba con otro.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2 lg:max-h-56 lg:overflow-y-auto catalog-scrollbar">
                {huecosLibres.map((t) => {
                  const activo = hora === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setHora(t); setError('') }}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${activo ? 'text-white' : (themeClasses.catInactive || 'bg-gray-50 text-gray-800 hover:bg-gray-100')}`}
                      style={activo ? { backgroundColor: accent } : {}}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 3. Datos */}
          <div className="space-y-3">
            <p className={`text-sm font-medium ${tText}`}>{servicios.length > 0 ? '3.' : '2.'} ¿Quién eres?</p>
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

            {/* Resumen de lo elegido: siempre a la vista junto al botón */}
            {(servicio || (fecha && hora)) && (
              <div className="rounded-xl px-3 py-2.5 text-sm" style={{ backgroundColor: `${accent}0d` }}>
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
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button" onClick={reservar} disabled={enviando}
              className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {enviando
                ? (<><Loader2 className="w-4 h-4 animate-spin" /> Reservando...</>)
                : 'Confirmar reserva'}
            </button>
            {!listoParaReservar && (
              <p className={`text-xs text-center ${tMuted}`}>
                {faltaServicio ? 'Elige un servicio para continuar' : 'Elige el día y la hora'}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
