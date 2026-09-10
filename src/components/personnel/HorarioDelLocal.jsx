/**
 * EL HORARIO DEL LOCAL de una sucursal, para la asistencia (pedido de Mandil
 * Taquería, 10-set-2026): desde qué hora cuenta una entrada y hasta qué hora
 * una salida. Qué hace con las marcas lo decide utils/jornadaAsistencia.
 *
 * Mismo formato que el horario del catálogo ({ enabled, days: {0..6} }), pero
 * guardado aparte, en la asistencia de cada sucursal: el horario en que se
 * atiende al público no tiene por qué ser el del personal.
 */
import { useEffect, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import Button from '@/components/ui/Button'
import { DIAS_DEL_HORARIO, normalizarHorario, errorDelHorario } from '@/utils/jornadaAsistencia'

export default function HorarioDelLocal({ horario, onGuardar }) {
  // La firma evita que el borrador se reinicie cada vez que la tarjeta se
  // vuelve a pintar: solo cuando el horario guardado cambia de verdad.
  const firma = JSON.stringify(normalizarHorario(horario))
  const guardado = useMemo(() => JSON.parse(firma), [firma])
  const [borrador, setBorrador] = useState(guardado)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setBorrador(guardado)
    setError(null)
  }, [guardado])

  const cambiado = JSON.stringify(borrador) !== firma

  const cambiarDia = (key, cambios) => setBorrador((b) => ({
    ...b,
    days: { ...b.days, [key]: { ...b.days[key], ...cambios } },
  }))

  const copiarLunes = () => setBorrador((b) => ({
    ...b,
    days: Object.fromEntries(DIAS_DEL_HORARIO.map(({ key }) => [key, { ...b.days[1] }])),
  }))

  const guardar = async () => {
    const problema = errorDelHorario(borrador)
    if (problema) {
      setError(problema)
      return
    }
    setError(null)
    setGuardando(true)
    try {
      await onGuardar(borrador)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-600 uppercase mb-2 flex items-center gap-1">
        <Clock className="w-3.5 h-3.5" /> Horario del local
      </p>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={borrador.enabled}
          onChange={(e) => setBorrador((b) => ({ ...b, enabled: e.target.checked }))}
          className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
        />
        <span className="text-sm text-gray-800">Contar las horas según el horario del local</span>
      </label>

      {borrador.enabled && (
        <div className="mt-3 space-y-2 bg-gray-50 rounded-lg p-3">
          {DIAS_DEL_HORARIO.map(({ key, nombre }) => {
            const dia = borrador.days[key]
            return (
              <div key={key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <label className="flex items-center gap-2 w-28 flex-shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dia.open}
                    onChange={(e) => cambiarDia(key, { open: e.target.checked })}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className={`text-sm ${dia.open ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{nombre}</span>
                </label>
                {dia.open ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="time"
                      aria-label={`Apertura del ${nombre.toLowerCase()}`}
                      value={dia.from}
                      onChange={(e) => cambiarDia(key, { from: e.target.value })}
                      className="px-2 py-1 border border-gray-300 rounded text-sm tabular-nums"
                    />
                    <span className="text-gray-400 text-sm">a</span>
                    <input
                      type="time"
                      aria-label={`Cierre del ${nombre.toLowerCase()}`}
                      value={dia.to}
                      onChange={(e) => cambiarDia(key, { to: e.target.value })}
                      className="px-2 py-1 border border-gray-300 rounded text-sm tabular-nums"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">Cerrado: ese día cuenta la hora marcada</span>
                )}
              </div>
            )
          })}
          <button
            type="button"
            onClick={copiarLunes}
            className="text-xs font-medium text-primary-700 hover:underline"
          >
            Copiar el horario del lunes a todos los días
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <div className="mt-3">
        <Button size="sm" onClick={guardar} disabled={guardando || !cambiado}>
          {guardando ? 'Guardando...' : 'Guardar horario'}
        </Button>
      </div>
      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
        Quien marca antes de la apertura entra a la hora de apertura, y quien marca después del cierre, o no marca
        su salida, sale a la hora del cierre. Tú decides en Marcaciones, vista Por jornada, si cuenta la hora que
        marcó u otra. Si el turno de alguien empieza antes de la apertura o termina después del cierre, para esa
        persona cuenta su turno.
      </p>
    </div>
  )
}
