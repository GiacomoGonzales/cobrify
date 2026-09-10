/**
 * VISTA "POR JORNADA" de Asistencia > Marcaciones (pedido de Mandil Taquería,
 * 10-set-2026): una fila por persona y por día, con la hora que CUENTA de
 * entrada y de salida, el break contra el programado y las horas del día.
 *
 * El cálculo vive en utils/jornadaAsistencia, el mismo que usa la tarjeta del
 * trabajador: lo que el administrador aprueba acá es lo que el trabajador ve
 * en su app.
 */
import { useState } from 'react'
import { Calendar, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useToast } from '@/contexts/ToastContext'
import { createManualAttendance, guardarAjusteDeHora } from '@/services/attendanceService'
import { MARCA_SALIDA } from '@/utils/attendanceMarks'
import {
  horaCorta, duracionCorta, aMinutos, detalleDelBreak, nombreDeLaReferencia,
  ETIQUETA_DEL_BREAK, DECISION_HORA_MARCADA, DECISION_HORARIO, DECISION_AJUSTADA,
} from '@/utils/jornadaAsistencia'

const fechaCorta = (d) => (d ? d.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '')

// 'el cierre' -> 'del cierre'; 'la apertura' -> 'de la apertura'
const deLa = (nombre) => (nombre.startsWith('el ') ? `del ${nombre.slice(3)}` : `de ${nombre}`)

const mayuscula = (texto) => (texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '')
const unir = (...partes) => mayuscula(partes.filter(Boolean).join(' · '))

// Forma de las etiquetas; el color sale de las .chip-* de index.css.
const CHIP = 'text-[11px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap'

const CHIP_DE_HORA = {
  'por-revisar': ['Por revisar', 'chip-aviso'],
  [DECISION_HORA_MARCADA]: ['Hora marcada', 'chip-ok'],
  [DECISION_HORARIO]: ['Horario', 'chip-neutro'],
  [DECISION_AJUSTADA]: ['Ajustada', 'chip-info'],
  automatica: ['Al cierre', 'chip-neutro'],
  'auto-cerrada': ['Auto-cerrado', 'chip-neutro'],
}

const TONO_DEL_BREAK = {
  completo: 'chip-ok',
  corto: 'chip-aviso',
  excedido: 'chip-error',
  'no-marcado': 'chip-neutro',
  abierto: 'chip-aviso',
  'sin-programa': 'chip-neutro',
  'en-curso': 'chip-aviso',
}

/** Qué pasó con esa hora, en una línea. Le habla al administrador. */
const notaDeHora = (lado) => {
  if (!lado) return ''
  const marco = lado.real ? `marcó ${horaCorta(lado.real)}` : ''
  const por = lado.ajuste?.porNombre ? ` por ${lado.ajuste.porNombre}` : ''
  switch (lado.estado) {
    case 'por-revisar':
      return unir(`${marco}, ${lado.tipo === 'entrada' ? 'antes' : 'después'} ${deLa(nombreDeLaReferencia(lado))} (${horaCorta(lado.referencia)})`)
    case DECISION_HORA_MARCADA:
      return unir(`aprobada${por}`)
    case DECISION_HORARIO:
      return unir(marco, `se dejó ${nombreDeLaReferencia(lado)}${por}`)
    case DECISION_AJUSTADA:
      return unir(marco, `ajustada${por}`)
    case 'automatica':
      return lado.marca ? 'No marcó salida (la cerró el sistema)' : 'No marcó salida'
    case 'auto-cerrada':
      return 'No marcó salida: la cerró el sistema'
    case 'sin-salida':
      return 'No marcó salida'
    default:
      return lado.marca?.approvalStatus === 'manual' ? 'Cargada a mano' : ''
  }
}

const accionDeHora = (lado) => {
  if (!lado || lado.estado === 'en-curso') return null
  if (lado.estado === 'por-revisar') return 'Revisar'
  if (lado.tipo === 'salida' && !lado.real) return 'Poner hora de salida'
  return 'Cambiar'
}

function CeldaDeHora({ lado, onAccion }) {
  if (!lado) return <span className="text-gray-300">—</span>
  const hora = lado.cuenta ? horaCorta(lado.cuenta) : null
  const chip = CHIP_DE_HORA[lado.estado]
  const nota = notaDeHora(lado)
  const accion = accionDeHora(lado)
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`tabular-nums ${hora ? 'font-semibold text-gray-900' : 'italic text-gray-400'}`}>
          {hora || (lado.estado === 'en-curso' ? 'En curso' : 'Sin salida')}
        </span>
        {chip && <span className={`${CHIP} ${chip[1]}`}>{chip[0]}</span>}
        {lado.marca?.approvalStatus === 'pending' && <span className={`${CHIP} chip-aviso`}>Ubicación por aprobar</span>}
      </div>
      {nota && <p className="text-[11px] text-gray-500 leading-snug">{nota}</p>}
      {accion && (
        <button
          type="button"
          onClick={onAccion}
          className={`text-[11px] font-medium hover:underline ${lado.estado === 'por-revisar' ? 'text-primary-700' : 'text-gray-500'}`}
        >
          {accion}
        </button>
      )}
    </div>
  )
}

function CeldaDeBreak({ b, breaksActivos }) {
  if (!b) return <span className="text-gray-300">—</span>
  // Sin breaks activados nadie puede marcarlo: solo se informa lo programado.
  if (!breaksActivos) {
    return b.programadoMin > 0
      ? <span className="text-gray-700 tabular-nums">Programado: {b.programadoMin} min</span>
      : <span className="text-gray-300">—</span>
  }
  const detalle = detalleDelBreak(b)
  if (!detalle && !b.estado) return <span className="text-gray-300">—</span>
  return (
    <div className="space-y-0.5">
      {detalle && <p className="tabular-nums text-gray-800">{detalle}</p>}
      {b.estado && <span className={`${CHIP} ${TONO_DEL_BREAK[b.estado] || 'chip-neutro'}`}>{ETIQUETA_DEL_BREAK[b.estado]}</span>}
    </div>
  )
}

function CeldaDeHoras({ j }) {
  if (j.trabajadoMs == null) return <span className="text-gray-400">—</span>
  const descontado = j.break.descontadoMs
  return (
    <div>
      <p className="font-semibold text-gray-900 tabular-nums">{duracionCorta(j.trabajadoMs)}</p>
      {descontado > 0 && (
        <p className="text-[11px] text-gray-500 whitespace-nowrap">
          −{duracionCorta(descontado)} de break {j.break.fuente === 'programado' ? 'programado' : 'marcado'}
        </p>
      )}
    </div>
  )
}

const opcionInicial = (lado) => {
  if (!lado.real) return DECISION_AJUSTADA
  if (lado.ajuste) return lado.ajuste.decision
  if (lado.estado === 'por-revisar') return DECISION_HORARIO
  return DECISION_HORA_MARCADA
}

/** Qué hora cuenta de una entrada o una salida: la marcada, la del local u otra. */
function ModalDeHora({ revision, guardando, onCerrar, onGuardar }) {
  const j = revision?.jornada
  const lado = j ? j[revision.lado] : null
  const [opcion, setOpcion] = useState(() => (lado ? opcionInicial(lado) : DECISION_HORA_MARCADA))
  const [hora, setHora] = useState(() => horaCorta(lado?.cuenta || lado?.referencia || new Date()))

  if (!lado) return <Modal isOpen={false} onClose={onCerrar}><div /></Modal>

  const esEntrada = lado.tipo === 'entrada'
  const desdeHasta = esEntrada ? 'Desde' : 'Hasta'
  const opciones = []
  if (lado.real) {
    opciones.push({ valor: DECISION_HORA_MARCADA, texto: `${desdeHasta} la hora que marcó (${horaCorta(lado.real)})` })
    if (lado.referencia && (lado.fueraDeHorario || lado.ajuste?.decision === DECISION_HORARIO)) {
      opciones.push({ valor: DECISION_HORARIO, texto: `${desdeHasta} ${nombreDeLaReferencia(lado)} (${horaCorta(lado.referencia)})` })
    }
    opciones.push({ valor: DECISION_AJUSTADA, texto: `${desdeHasta} otra hora` })
  }

  let intro
  if (esEntrada) {
    intro = `Marcó su entrada a las ${horaCorta(lado.real)}.`
    if (lado.fueraDeHorario) {
      intro += lado.porTurno
        ? ` Su turno empieza a las ${horaCorta(lado.referencia)}.`
        : ` El local abre a las ${horaCorta(lado.referencia)}.`
    }
  } else if (lado.real) {
    intro = `Marcó su salida a las ${horaCorta(lado.real)}.`
    if (lado.fueraDeHorario) {
      intro += lado.porTurno
        ? ` Su turno termina a las ${horaCorta(lado.referencia)}.`
        : ` El local cierra a las ${horaCorta(lado.referencia)}.`
    }
  } else {
    intro = lado.referencia
      ? `No marcó su salida. Por ahora cuenta ${nombreDeLaReferencia(lado)} (${horaCorta(lado.referencia)}).`
      : 'No marcó su salida.'
  }

  return (
    <Modal isOpen onClose={onCerrar} maxWidth="md">
      <div className="p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {esEntrada ? 'Entrada' : 'Salida'} de {j.userName || 'la persona'}
            </h3>
            <p className="text-sm text-gray-500 capitalize">{fechaCorta(j.fecha)}</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-700 mb-4">{intro}</p>

        {opciones.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-gray-600 uppercase mb-1">¿{esEntrada ? 'Desde' : 'Hasta'} qué hora cuenta?</legend>
            {opciones.map((o) => (
              <label key={o.valor} className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="hora-que-cuenta"
                  value={o.valor}
                  checked={opcion === o.valor}
                  onChange={() => setOpcion(o.valor)}
                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                {o.texto}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="text-xs font-medium text-gray-600 uppercase mb-1">¿A qué hora salió?</p>
        )}

        {opcion === DECISION_AJUSTADA && (
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            aria-label="Hora"
            className="mt-2 px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
          />
        )}

        {!lado.marca && (
          <p className="text-xs text-gray-500 mt-3">
            Se guarda como una marcación manual de salida. Regístrala solo cuando la persona ya se haya ido.
          </p>
        )}
        {lado.marca && (
          <p className="text-xs text-gray-500 mt-3">
            La marca queda como se hizo; lo que cambia es la hora que cuenta, y es la que ve la persona en su app.
          </p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={() => onGuardar({ opcion, hora })} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** En la lista de marcaciones: la hora que cuenta de esta marca, cuando no es la marcada. */
export function ChipDeHoraQueCuenta({ lado }) {
  if (!lado || !lado.cuenta) return null
  const forma = 'text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase whitespace-nowrap'
  const hora = horaCorta(lado.cuenta)
  switch (lado.estado) {
    case 'por-revisar': return <span className={`${forma} chip-aviso`}>Fuera de horario · cuenta {hora}</span>
    case DECISION_HORARIO: return <span className={`${forma} chip-neutro`}>Cuenta {hora}</span>
    case DECISION_AJUSTADA: return <span className={`${forma} chip-info`}>Ajustada · cuenta {hora}</span>
    case DECISION_HORA_MARCADA: return lado.fueraDeHorario ? <span className={`${forma} chip-ok`}>Hora marcada aprobada</span> : null
    case 'automatica': return <span className={`${forma} chip-neutro`}>Cuenta {hora}</span>
    default: return null
  }
}

export default function JornadasAsistencia({ jornadas = [], breaksActivos = false, businessId, user, isDemoMode = false, onCambio }) {
  const toast = useToast()
  const [soloPorRevisar, setSoloPorRevisar] = useState(false)
  const [revision, setRevision] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const porRevisar = jornadas.filter((j) => j.porRevisar).length
  const visibles = soloPorRevisar ? jornadas.filter((j) => j.porRevisar) : jornadas
  const abrir = (jornada, lado) => setRevision({ jornada, lado })

  const guardar = async ({ opcion, hora }) => {
    if (!revision) return
    const { jornada } = revision
    const lado = jornada[revision.lado]
    let fechaHora = null
    if (opcion === DECISION_AJUSTADA) {
      const minutos = aMinutos(hora)
      if (minutos == null) {
        toast.error('Escribe la hora')
        return
      }
      const f = jornada.fecha
      fechaHora = new Date(f.getFullYear(), f.getMonth(), f.getDate(), Math.floor(minutos / 60), minutos % 60, 0, 0)
      if (lado.tipo === 'entrada' && jornada.salida?.cuenta && fechaHora >= jornada.salida.cuenta) {
        toast.error(`La entrada tiene que ser antes de la salida (${horaCorta(jornada.salida.cuenta)}).`)
        return
      }
      if (lado.tipo === 'salida' && jornada.entrada?.cuenta && fechaHora <= jornada.entrada.cuenta) {
        toast.error(`La salida tiene que ser después de la entrada (${horaCorta(jornada.entrada.cuenta)}).`)
        return
      }
      if (!lado.marca && fechaHora > new Date()) {
        toast.error('Esa hora todavía no llega. Registra la salida cuando la persona ya se haya ido.')
        return
      }
    }
    if (isDemoMode) {
      toast.info?.('Esta función no está disponible en modo demo')
      return
    }
    const porNombre = user?.displayName || user?.email || ''
    setGuardando(true)
    try {
      let res
      if (lado.marca) {
        res = await guardarAjusteDeHora(businessId, lado.marca.id, { decision: opcion, hora: fechaHora, porId: user?.uid, porNombre })
      } else {
        // No hay ninguna marca de salida: se crea una, manual, con la hora que
        // dijo el administrador.
        const deEntrada = jornada.entrada?.marca || {}
        res = await createManualAttendance(businessId, {
          userId: jornada.userId,
          userName: jornada.userName,
          userEmail: jornada.userEmail,
          branchId: deEntrada.branchId || null,
          branchName: deEntrada.branchName || '',
          type: MARCA_SALIDA,
          timestamp: fechaHora,
          notes: `Salida registrada al revisar la jornada${porNombre ? ` (${porNombre})` : ''}`,
          createdBy: user?.uid || null,
        })
      }
      if (!res?.success) {
        toast.error(res?.error || 'No se pudo guardar')
        return
      }
      toast.success('Listo: la jornada se actualizó')
      setRevision(null)
      if (onCambio) await onCambio()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{jornadas.length}</span> {jornadas.length === 1 ? 'jornada' : 'jornadas'}
          {porRevisar > 0 && (
            <> · <span className="font-semibold text-amber-700">{porRevisar} por revisar</span></>
          )}
        </p>
        {porRevisar > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={soloPorRevisar}
              onChange={(e) => setSoloPorRevisar(e.target.checked)}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            Solo las que están por revisar
          </label>
        )}
      </div>

      {visibles.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">
          <Calendar className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          {jornadas.length === 0 ? 'Sin jornadas para los filtros seleccionados.' : 'No queda nada por revisar.'}
        </div>
      ) : (
        <>
          {/* Tabla desde tablet; en el celular, tarjetas */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Fecha</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Empleado</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Entrada</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Salida</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Break</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs uppercase">Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.map((j) => (
                  <tr key={j.clave} className="align-top hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap capitalize">{fechaCorta(j.fecha)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-900">{j.userName || '—'}</div>
                      <div className="text-xs text-gray-500">
                        {[j.branchName, j.turno ? `Turno ${j.turno.start}–${j.turno.end}` : null].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><CeldaDeHora lado={j.entrada} onAccion={() => abrir(j, 'entrada')} /></td>
                    <td className="px-3 py-2.5"><CeldaDeHora lado={j.salida} onAccion={() => abrir(j, 'salida')} /></td>
                    <td className="px-3 py-2.5"><CeldaDeBreak b={j.break} breaksActivos={breaksActivos} /></td>
                    <td className="px-3 py-2.5 text-right"><CeldaDeHoras j={j} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-gray-100">
            {visibles.map((j) => (
              <div key={j.clave} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{j.userName || '—'}</p>
                    <p className="text-xs text-gray-500 capitalize">{[fechaCorta(j.fecha), j.branchName].filter(Boolean).join(' · ')}</p>
                    {j.turno && <p className="text-xs text-gray-500">Turno {j.turno.start}–{j.turno.end}</p>}
                  </div>
                  <div className="text-right shrink-0"><CeldaDeHoras j={j} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Entrada</p>
                    <CeldaDeHora lado={j.entrada} onAccion={() => abrir(j, 'entrada')} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Salida</p>
                    <CeldaDeHora lado={j.salida} onAccion={() => abrir(j, 'salida')} />
                  </div>
                </div>
                {(breaksActivos || j.break.programadoMin > 0) && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">Break</span>
                    <CeldaDeBreak b={j.break} breaksActivos={breaksActivos} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <ModalDeHora
        key={revision ? `${revision.jornada.clave}|${revision.lado}` : 'cerrado'}
        revision={revision}
        guardando={guardando}
        onCerrar={() => setRevision(null)}
        onGuardar={guardar}
      />
    </div>
  )
}
