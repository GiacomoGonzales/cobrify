/**
 * Panel de horas de un día: las citas ocupadas en su horario (con sus
 * acciones) y los huecos libres como botones para agendar. Es el corazón del
 * patrón "clic en el día → veo sus horas → toco una hora libre" (estilo
 * Calendly/Fresha). Reemplaza a la antigua lista de citas de abajo: TODO el
 * día se ve y se opera acá, el scroll es solo interno.
 *
 * Vive como componente APARTE de la página a propósito: la fase siguiente es
 * mostrarlo en el catálogo online para que el cliente final reserve solo.
 * Por eso los render props son opcionales — el negocio pasa renderStatus y
 * renderActions para operar sus citas; el público no pasa nada y con
 * showDetails=false verá solo "Ocupado", sin datos de otros clientes.
 */
import { ChevronLeft, ChevronRight, Clock, Plus, PawPrint, User } from 'lucide-react'

const aHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const horaDe = (appt) => {
  const d = appt.scheduledDate?.toDate ? appt.scheduledDate.toDate() : new Date(appt.scheduledDate)
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + (m || 0)
}

export default function DaySlotPicker({
  date,
  appointments = [],
  onPickSlot,
  onPrevDay,
  onNextDay,
  showDetails = true,
  renderStatus,
  renderActions,
  startHour = 8,
  endHour = 20,
  stepMinutes = 30,
}) {
  const hoy = new Date()
  const esPasado = date < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  // Activas van al horario; canceladas y no asistidas no bloquean la hora y
  // se listan aparte al final (siguen necesitando su acción de eliminar).
  const activas = appointments.filter(a => a.status !== 'cancelled' && a.status !== 'no_show')
  const inactivas = appointments.filter(a => a.status === 'cancelled' || a.status === 'no_show')

  // Cada cita cae en el hueco donde ARRANCA (10:15 se muestra dentro del
  // hueco de las 10:00, con su hora real visible). Varias citas pueden
  // compartir hueco: se listan todas. Una cita fuera del rango horario
  // (7:00, 21:30) no se pierde: se cuelga del primer o último hueco.
  const porHueco = {}
  const ponerEnHueco = (hueco, a) => {
    if (!porHueco[hueco]) porHueco[hueco] = []
    porHueco[hueco].push(a)
  }
  activas.forEach(a => {
    const min = aMinutos(horaDe(a))
    let hueco = min - (min % stepMinutes)
    hueco = Math.min(Math.max(hueco, startHour * 60), endHour * 60 - stepMinutes)
    ponerEnHueco(hueco, a)
  })

  // Una cita con DURACIÓN (la suma de lo que dura cada servicio, según la
  // ficha del producto) sigue ocupando los huecos siguientes. Se muestran
  // ocupados pero siguen pudiendo elegirse: la agenda avisa, no bloquea.
  const continuaDe = {}
  activas.forEach(a => {
    const dur = Number(a.duration) || 0
    if (dur <= stepMinutes) return
    const inicio = aMinutos(horaDe(a))
    const fin = inicio + dur
    for (let s = inicio - (inicio % stepMinutes) + stepMinutes; s < fin; s += stepMinutes) {
      if (!continuaDe[s]) continuaDe[s] = []
      continuaDe[s].push({ a, hasta: aHHMM(fin) })
    }
  })

  const huecos = []
  for (let m = startHour * 60; m < endHour * 60; m += stepMinutes) huecos.push(m)

  const titulo = date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })

  const TarjetaCita = ({ a }) => (
    <div className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 mb-1.5">
      <div className="flex items-center gap-2 text-sm">
        {a.petName
          ? <PawPrint className="w-4 h-4 text-primary-500 flex-shrink-0" />
          : <User className="w-4 h-4 text-primary-500 flex-shrink-0" />}
        <span className="font-semibold text-gray-900 flex-shrink-0">{horaDe(a)}</span>
        {Number(a.duration) > 0 && (
          <span className="text-xs text-gray-400 flex-shrink-0">{a.duration} min</span>
        )}
        {showDetails ? (
          <span className="text-gray-700 truncate min-w-0">
            {a.serviceName || 'Cita'}
          </span>
        ) : (
          <span className="text-gray-500">Ocupado</span>
        )}
        {showDetails && renderStatus && <span className="ml-auto flex-shrink-0">{renderStatus(a)}</span>}
      </div>
      {showDetails && (
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 truncate min-w-0">
            <User className="w-3 h-3 flex-shrink-0" />
            {[a.petName, a.customerName].filter(Boolean).join(' · ') || 'Sin datos'}
          </span>
          {renderActions && <span className="flex items-center gap-0.5 flex-shrink-0">{renderActions(a)}</span>}
        </div>
      )}
    </div>
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 h-full flex flex-col lg:min-h-0">
      {/* Cabecera con navegación entre días sin volver al calendario */}
      <div className="flex items-center gap-1 mb-2 flex-shrink-0">
        <button
          type="button"
          onClick={onPrevDay}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
          title="Día anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 text-center min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 capitalize truncate">{titulo}</h3>
          <p className="text-xs text-gray-500">
            {activas.length === 0 ? (esPasado ? 'Sin citas' : 'Día libre') : `${activas.length} ${activas.length === 1 ? 'cita' : 'citas'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onNextDay}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
          title="Día siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* El scroll vive SOLO acá adentro: la página no crece con el día */}
      <div className="flex-1 min-h-0 overflow-y-auto max-h-[420px] lg:max-h-none pr-1 -mr-1">
        {esPasado ? (
          // Un día pasado no ofrece horas libres, pero sus citas sí se ven
          // y se operan (cobrar una olvidada, eliminar una cancelada).
          activas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Este día ya pasó y no tuvo citas.</p>
          ) : (
            activas.map(a => <TarjetaCita key={a.id} a={a} />)
          )
        ) : (
          huecos.map(m => {
            const esManana = m < 13 * 60
            const primeroManana = m === startHour * 60
            const primeroTarde = m === 13 * 60
            const citas = porHueco[m] || []
            return (
              <div key={m}>
                {(primeroManana || primeroTarde) && (
                  <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase mt-2 mb-1.5 first:mt-0">
                    {esManana ? 'Mañana' : 'Tarde'}
                  </p>
                )}
                {citas.length > 0 ? (
                  citas.map(a => <TarjetaCita key={a.id} a={a} />)
                ) : (continuaDe[m] || []).length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onPickSlot?.(aHHMM(m))}
                    className="group flex items-center gap-2 w-full border border-gray-200 bg-gray-50 hover:border-primary-400 rounded-lg px-3 py-1.5 mb-1.5 text-sm text-gray-400 transition-colors"
                    title="Hora ocupada por una cita en curso; puedes agendar igual"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{aHHMM(m)}</span>
                    <span className="ml-auto text-xs text-gray-400 truncate min-w-0">
                      {showDetails
                        ? `${continuaDe[m][0].a.serviceName || 'Cita'} hasta ${continuaDe[m][0].hasta}`
                        : `Ocupado hasta ${continuaDe[m][0].hasta}`}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPickSlot?.(aHHMM(m))}
                    className="group flex items-center gap-2 w-full border border-dashed border-gray-300 hover:border-primary-500 hover:bg-primary-50 rounded-lg px-3 py-1.5 mb-1.5 text-sm text-gray-400 hover:text-primary-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{aHHMM(m)}</span>
                    <span className="ml-auto text-xs text-gray-300 group-hover:text-primary-500 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> libre
                    </span>
                  </button>
                )}
              </div>
            )
          })
        )}

        {showDetails && inactivas.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100">
            <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase mb-1.5">
              Canceladas / no asistieron
            </p>
            {inactivas.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-lg bg-gray-50 text-sm text-gray-400">
                <span className="line-through">{horaDe(a)} {a.serviceName || 'Cita'}{a.petName ? ` — ${a.petName}` : ''}</span>
                {renderStatus && <span className="ml-auto flex-shrink-0">{renderStatus(a)}</span>}
                {renderActions && <span className="flex items-center gap-0.5 flex-shrink-0">{renderActions(a)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
