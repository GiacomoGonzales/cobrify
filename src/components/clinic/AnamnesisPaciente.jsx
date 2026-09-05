/**
 * LA ANAMNESIS del paciente, para llenar y corregir dentro de su ficha.
 *
 * Es un formulario con secciones fijas (motivo, enfermedades, alergias,
 * medicación, hábitos, tratamientos previos) más las preguntas propias que
 * el negocio arma en Configuración > Punto de venta. Guarda directo en el
 * cliente; los catálogos y lo que se escribe salen de utils/anamnesis.js.
 */
import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Button from '@/components/ui/Button'
import { updateCustomer } from '@/services/firestoreService'
import {
  ENFERMEDADES, ALERGIAS_COMUNES, HABITOS, GRUPOS_SANGUINEOS,
  normalizarAnamnesis, normalizarPreguntas, camposParaGuardar,
} from '@/utils/anamnesis'
import { hoyYMD, fechaCorta } from '@/utils/fichaAtencion'

const CAMPO = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500'
const AREA = `${CAMPO} resize-y`

const Seccion = ({ titulo, children }) => (
  <div className="border border-gray-200 rounded-lg overflow-hidden">
    <p className="px-4 py-2 text-sm font-semibold text-gray-800 bg-gray-50 border-b border-gray-200">{titulo}</p>
    <div className="p-4 space-y-3">{children}</div>
  </div>
)

const Casillas = ({ catalogo, marcadas, onChange, columnas = 'sm:grid-cols-2' }) => (
  <div className={`grid grid-cols-1 ${columnas} gap-x-4 gap-y-1.5`}>
    {catalogo.map(item => {
      const marcada = marcadas.includes(item.id)
      return (
        <label key={item.id} className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
          <input
            type="checkbox"
            checked={marcada}
            onChange={() => onChange(marcada ? marcadas.filter(x => x !== item.id) : [...marcadas, item.id])}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          {item.nombre}
        </label>
      )
    })}
  </div>
)

export default function AnamnesisPaciente({ customer, preguntas = [], onSaved }) {
  const { getBusinessId } = useAppContext()
  const toast = useToast()
  const [a, setA] = useState(() => normalizarAnamnesis(customer))
  const [guardando, setGuardando] = useState(false)

  // Otro paciente, otra anamnesis.
  useEffect(() => { setA(normalizarAnamnesis(customer)) }, [customer?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const propias = normalizarPreguntas(preguntas)
  const poner = (campo, valor) => setA(prev => ({ ...prev, [campo]: valor }))
  const responder = (id, valor) => setA(prev => ({ ...prev, respuestas: { ...prev.respuestas, [id]: valor } }))

  const guardar = async () => {
    if (!customer?.id) return
    setGuardando(true)
    try {
      const r = await updateCustomer(getBusinessId(), customer.id, camposParaGuardar(a, hoyYMD()))
      if (!r?.success) throw new Error(r?.error || 'No se pudo guardar')
      toast.success('Anamnesis guardada')
      onSaved?.()
    } catch (e) {
      console.error('Error al guardar la anamnesis:', e)
      toast.error('No se pudo guardar la anamnesis')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      <Seccion titulo="1. Motivo de consulta">
        <textarea
          rows={2}
          value={a.motivo}
          onChange={e => poner('motivo', e.target.value)}
          placeholder="Qué busca el paciente: manchas, líneas de expresión, evaluación general..."
          className={AREA}
        />
      </Seccion>

      <Seccion titulo="2. Antecedentes médicos">
        <p className="text-[11px] font-medium tracking-wide text-gray-500 uppercase">Enfermedades</p>
        <Casillas catalogo={ENFERMEDADES} marcadas={a.enfermedades} onChange={v => poner('enfermedades', v)} columnas="sm:grid-cols-2 lg:grid-cols-3" />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Otras enfermedades</label>
          <textarea rows={2} value={a.otrasEnfermedades} onChange={e => poner('otrasEnfermedades', e.target.value)} placeholder="Especifique..." className={AREA} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cirugías previas</label>
            <textarea rows={2} value={a.cirugias} onChange={e => poner('cirugias', e.target.value)} placeholder="Descripción..." className={AREA} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Grupo sanguíneo</label>
            <select value={a.grupoSanguineo} onChange={e => poner('grupoSanguineo', e.target.value)} className={CAMPO}>
              <option value="">No sabe</option>
              {GRUPOS_SANGUINEOS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="3. Alergias">
        <Casillas catalogo={ALERGIAS_COMUNES} marcadas={a.alergias} onChange={v => poner('alergias', v)} columnas="sm:grid-cols-2 lg:grid-cols-4" />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Otras alergias</label>
          <input type="text" value={a.otrasAlergias} onChange={e => poner('otrasAlergias', e.target.value)} placeholder="Especifique..." className={CAMPO} />
        </div>
        <p className="text-xs text-gray-500">Lo que marques acá sale en rojo junto al nombre, en la lista y en la ficha.</p>
      </Seccion>

      <Seccion titulo="4. Medicamentos actuales">
        <textarea
          rows={2}
          value={a.medicamentos}
          onChange={e => poner('medicamentos', e.target.value)}
          placeholder="Anticoagulantes, isotretinoína, anticonceptivos, corticoides..."
          className={AREA}
        />
      </Seccion>

      <Seccion titulo="5. Hábitos y estado general">
        <Casillas catalogo={HABITOS} marcadas={a.habitos} onChange={v => poner('habitos', v)} columnas="sm:grid-cols-2 lg:grid-cols-3" />
        <p className="text-xs text-gray-500">Embarazo y lactancia salen como aviso en la ficha: cambian qué se puede hacer.</p>
      </Seccion>

      <Seccion titulo="6. Tratamientos previos">
        <textarea
          rows={2}
          value={a.tratamientosPrevios}
          onChange={e => poner('tratamientosPrevios', e.target.value)}
          placeholder="Botox, rellenos, láser, peelings, cirugías estéticas, tratamientos dentales..."
          className={AREA}
        />
      </Seccion>

      <Seccion titulo={`7. Preguntas del consultorio${propias.length ? ` (${propias.length})` : ''}`}>
        {propias.length === 0 ? (
          <p className="text-sm text-gray-500">
            Sin preguntas propias. Se arman en <strong>Configuración &gt; Punto de venta</strong>, en "Preguntas propias de la anamnesis".
          </p>
        ) : propias.map(p => {
          const v = a.respuestas?.[p.id]
          return (
            <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
              <p className="text-sm text-gray-800 flex-1">{p.texto}</p>
              {p.tipo === 'si_no' ? (
                <div className="flex gap-1">
                  {[[true, 'Sí'], [false, 'No']].map(([valor, etiqueta]) => (
                    <button
                      key={etiqueta}
                      type="button"
                      onClick={() => responder(p.id, v === valor ? null : valor)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        v === valor ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="text"
                  value={v ?? ''}
                  onChange={e => responder(p.id, e.target.value)}
                  placeholder="Respuesta"
                  className={`${CAMPO} sm:w-64`}
                />
              )}
            </div>
          )
        })}
      </Seccion>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500">
          {a.updatedAt ? `Última actualización: ${fechaCorta(a.updatedAt)}` : 'Todavía no se guardó la anamnesis.'}
        </p>
        <Button onClick={guardar} disabled={guardando} className="gap-1">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar anamnesis
        </Button>
      </div>
    </div>
  )
}
