import { useState, useEffect, useRef } from 'react'
import { getAuth } from 'firebase/auth'
import {
  ArrowLeft,
  Camera,
  Clock,
  MessageSquareText,
  Plus,
  Save,
  Trash2,
  UserCircle,
  Zap,
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import {
  obtenerPerfil,
  guardarPerfil,
  RUBROS,
  suscribirAutomaticos,
  guardarAutomaticos,
  CONFIG_AUTOMATICOS_DEFAULT,
} from '@/services/whatsappChatService'

const DIAS = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']]

/**
 * Configuración del chat: el perfil que ven los clientes, las respuestas
 * automáticas y las respuestas rápidas. Vive en el panel principal de la
 * bandeja (no en otra página): se abre con el engranaje y se vuelve con la
 * flecha.
 */
export default function ConfiguracionChat({ onVolver }) {
  const [seccion, setSeccion] = useState('perfil')

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">
      <header className="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
        <button onClick={onVolver} className="p-1 -ml-1 text-gray-600 hover:text-gray-900" aria-label="Volver">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-gray-900">Configuración del chat</h2>
      </header>

      <div className="px-4 pt-3 bg-white border-b border-gray-200 flex gap-1 overflow-x-auto">
        {[
          ['perfil', UserCircle, 'Perfil del negocio'],
          ['automaticos', Zap, 'Respuestas automáticas'],
          ['rapidas', MessageSquareText, 'Respuestas rápidas'],
        ].map(([id, Icono, nombre]) => (
          <button
            key={id}
            onClick={() => setSeccion(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              seccion === id ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Icono className="w-4 h-4" />
            {nombre}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-2xl">
          {seccion === 'perfil' && <SeccionPerfil />}
          {seccion === 'automaticos' && <SeccionAutomaticos />}
          {seccion === 'rapidas' && <SeccionRapidas />}
        </div>
      </div>
    </div>
  )
}

/* ============================ PERFIL ============================ */
function SeccionPerfil() {
  const toast = useToast()
  const [perfil, setPerfil] = useState(null)
  const [numero, setNumero] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [foto, setFoto] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const selector = useRef(null)

  useEffect(() => {
    (async () => {
      try {
        const idToken = await getAuth().currentUser?.getIdToken()
        const r = await obtenerPerfil(idToken)
        setPerfil({ ...r.perfil, websites: r.perfil.websites || [] })
        setNumero(r.displayNumber || '')
      } catch (e) {
        toast.error(e.message || 'No se pudo leer el perfil')
        setPerfil({ about: '', description: '', address: '', email: '', websites: [], vertical: '', profilePictureUrl: null })
      } finally {
        setCargando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const elegirFoto = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/jpeg', 'image/png'].includes(f.type)) { toast.error('La foto debe ser JPG o PNG'); return }
    if (f.size > 5 * 1024 * 1024) { toast.error('La foto pasa de 5 MB'); return }
    setFoto(f)
    setFotoPreview(URL.createObjectURL(f))
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const idToken = await getAuth().currentUser?.getIdToken()
      const campos = {
        about: perfil.about, description: perfil.description, address: perfil.address,
        email: perfil.email, vertical: perfil.vertical,
        websites: (perfil.websites || []).map((w) => w.trim()).filter(Boolean),
      }
      const r = await guardarPerfil(campos, foto, idToken)
      setPerfil({ ...r.perfil, websites: r.perfil.websites || [] })
      setFoto(null)
      setFotoPreview(null)
      toast.success('Perfil actualizado. Los clientes lo ven al instante.')
    } catch (e) {
      toast.error(e.message || 'No se pudo guardar el perfil')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <p className="text-sm text-gray-500">Leyendo el perfil de WhatsApp...</p>
  if (!perfil) return null

  const campo = (k, v) => setPerfil((p) => ({ ...p, [k]: v }))
  const fotoActual = fotoPreview || perfil.profilePictureUrl

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Esto es lo que ven tus clientes al tocar tu nombre en WhatsApp. Los cambios
        son inmediatos. El <strong>nombre visible</strong> ("Cobrify Facturación") no se
        edita desde acá: Meta exige aprobarlo, y se cambia en WhatsApp Manager.
      </p>

      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
            {fotoActual
              ? <img src={fotoActual} alt="Foto de perfil" className="w-full h-full object-cover" />
              : <UserCircle className="w-12 h-12 text-gray-400" />}
          </div>
          <button
            onClick={() => selector.current?.click()}
            className="absolute -bottom-1 -right-1 p-2 bg-green-600 text-white rounded-full shadow hover:bg-green-700"
            title="Cambiar foto"
          >
            <Camera className="w-4 h-4" />
          </button>
          <input ref={selector} type="file" accept="image/jpeg,image/png" onChange={elegirFoto} className="hidden" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">Cobrify Facturación</p>
          {numero && <p className="text-sm text-gray-500">+{numero}</p>}
          {foto && <p className="text-xs text-amber-600 mt-1">Foto nueva elegida, falta guardar</p>}
          <p className="text-xs text-gray-400 mt-1">JPG o PNG cuadrada, hasta 5 MB. Ideal 640x640.</p>
        </div>
      </div>

      <Campo etiqueta="Frase corta (info)" ayuda="Aparece bajo el nombre. Máx. 139 caracteres.">
        <input type="text" maxLength={139} value={perfil.about} onChange={(e) => campo('about', e.target.value)} className={inputCls} placeholder="Facturación electrónica SUNAT para tu negocio" />
      </Campo>
      <Campo etiqueta="Descripción" ayuda="Qué hace tu negocio. Máx. 512 caracteres.">
        <textarea rows={3} maxLength={512} value={perfil.description} onChange={(e) => campo('description', e.target.value)} className={inputCls} />
      </Campo>
      <Campo etiqueta="Dirección">
        <input type="text" maxLength={256} value={perfil.address} onChange={(e) => campo('address', e.target.value)} className={inputCls} placeholder="Lima, Perú" />
      </Campo>
      <Campo etiqueta="Correo de contacto">
        <input type="email" maxLength={128} value={perfil.email} onChange={(e) => campo('email', e.target.value)} className={inputCls} />
      </Campo>
      <Campo etiqueta="Sitios web" ayuda="Hasta 2, con https://">
        {[0, 1].map((i) => (
          <input
            key={i}
            type="url"
            value={perfil.websites[i] || ''}
            onChange={(e) => {
              const w = [...(perfil.websites || [])]
              w[i] = e.target.value
              campo('websites', w)
            }}
            className={`${inputCls} ${i === 1 ? 'mt-2' : ''}`}
            placeholder={i === 0 ? 'https://www.cobrifyperu.com' : ''}
          />
        ))}
      </Campo>
      <Campo etiqueta="Rubro">
        <select value={perfil.vertical} onChange={(e) => campo('vertical', e.target.value)} className={`${inputCls} bg-white`}>
          {RUBROS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </Campo>

      <div className="flex justify-end">
        <button onClick={guardar} disabled={guardando} className={btnPrimario}>
          <Save className="w-4 h-4" />
          {guardando ? 'Guardando...' : 'Guardar perfil'}
        </button>
      </div>
    </div>
  )
}

/* ============================ AUTOMÁTICOS ============================ */
function SeccionAutomaticos() {
  const toast = useToast()
  const [cfg, setCfg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => suscribirAutomaticos((c) => setCfg((prev) => prev || c)), [])

  const guardar = async () => {
    setGuardando(true)
    try {
      await guardarAutomaticos({ bienvenida: cfg.bienvenida, ausencia: cfg.ausencia })
      toast.success('Respuestas automáticas guardadas')
    } catch {
      toast.error('No se pudieron guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (!cfg) return <p className="text-sm text-gray-500">Cargando...</p>
  const b = cfg.bienvenida || CONFIG_AUTOMATICOS_DEFAULT.bienvenida
  const au = cfg.ausencia || CONFIG_AUTOMATICOS_DEFAULT.ausencia
  const h = au.horario || CONFIG_AUTOMATICOS_DEFAULT.ausencia.horario
  const setB = (x) => setCfg({ ...cfg, bienvenida: { ...b, ...x } })
  const setAu = (x) => setCfg({ ...cfg, ausencia: { ...au, ...x } })
  const setH = (x) => setAu({ horario: { ...h, ...x } })

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Las escribe el sistema en tu nombre y quedan en el hilo marcadas como automáticas.
        Podés usar <code className="bg-gray-100 px-1 rounded">{'{nombre}'}</code> y se reemplaza por el nombre del contacto.
      </p>

      <Tarjeta
        titulo="Mensaje de bienvenida"
        descripcion="Se envía una sola vez, cuando un número nuevo te escribe por primera vez."
        activa={b.activa}
        onToggle={(v) => setB({ activa: v })}
      >
        <textarea rows={3} value={b.texto} onChange={(e) => setB({ texto: e.target.value })} className={inputCls} />
      </Tarjeta>

      <Tarjeta
        titulo="Mensaje de ausencia"
        descripcion="Se envía cuando te escriben fuera del horario de atención. Máximo una vez cada 12 horas por conversación, para no repetirlo en cada mensaje."
        activa={au.activa}
        onToggle={(v) => setAu({ activa: v })}
      >
        <textarea rows={3} value={au.texto} onChange={(e) => setAu({ texto: e.target.value })} className={inputCls} />
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5" /> Horario de atención (hora de Lima)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {DIAS.map(([d, letra]) => {
                const on = (h.dias || []).includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setH({ dias: on ? h.dias.filter((x) => x !== d) : [...(h.dias || []), d].sort() })}
                    className={`w-8 h-8 rounded-full text-xs font-bold ${on ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {letra}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input type="time" value={h.desde} onChange={(e) => setH({ desde: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg" />
              <span className="text-gray-400">a</span>
              <input type="time" value={h.hasta} onChange={(e) => setH({ hasta: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg" />
            </div>
          </div>
        </div>
      </Tarjeta>

      <div className="flex justify-end">
        <button onClick={guardar} disabled={guardando} className={btnPrimario}>
          <Save className="w-4 h-4" />
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

/* ============================ RÁPIDAS ============================ */
function SeccionRapidas() {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [atajo, setAtajo] = useState('')
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => suscribirAutomaticos((c) => setLista((prev) => prev || (c.respuestasRapidas || []))), [])

  const agregar = () => {
    const a = atajo.trim().toLowerCase().replace(/^\//, '').replace(/\s+/g, '-')
    if (!a || !texto.trim()) return
    if (lista.some((r) => r.atajo === a)) { toast.error(`Ya existe /${a}`); return }
    setLista([...lista, { atajo: a, texto: texto.trim() }])
    setAtajo('')
    setTexto('')
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      await guardarAutomaticos({ respuestasRapidas: lista })
      toast.success('Respuestas rápidas guardadas')
    } catch {
      toast.error('No se pudieron guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (!lista) return <p className="text-sm text-gray-500">Cargando...</p>

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Lo que escribís veinte veces, escrito una sola vez. En el cuadro de mensaje tipeá
        <code className="bg-gray-100 px-1 rounded mx-1">/</code> y elegí el atajo: el texto se pega y lo podés
        retocar antes de enviar. Acepta <code className="bg-gray-100 px-1 rounded">{'{nombre}'}</code>.
      </p>

      {lista.length === 0 && (
        <p className="text-sm text-gray-400 italic">Todavía no hay respuestas rápidas. Algunas ideas: /precios, /pago, /horario, /demo.</p>
      )}

      <div className="space-y-2">
        {lista.map((r, i) => (
          <div key={r.atajo} className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-start gap-3">
              <span className="font-mono text-sm font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded flex-none">/{r.atajo}</span>
              <textarea
                rows={2}
                value={r.texto}
                onChange={(e) => {
                  const copia = [...lista]
                  copia[i] = { ...r, texto: e.target.value }
                  setLista(copia)
                }}
                className="flex-1 text-sm bg-transparent focus:outline-none resize-none"
              />
              <button onClick={() => setLista(lista.filter((x) => x.atajo !== r.atajo))} className="p-1 text-gray-300 hover:text-red-500" title="Eliminar">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-mono text-sm">/</span>
          <input
            type="text"
            value={atajo}
            onChange={(e) => setAtajo(e.target.value)}
            placeholder="atajo (ej: precios)"
            className="flex-1 text-sm px-3 py-1.5 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Texto de la respuesta"
          className="w-full text-sm px-3 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
        />
        <div className="flex justify-end">
          <button onClick={agregar} disabled={!atajo.trim() || !texto.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50 rounded-lg disabled:opacity-40">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={guardar} disabled={guardando} className={btnPrimario}>
          <Save className="w-4 h-4" />
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

/* ============================ piezas ============================ */
const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500'
const btnPrimario = 'inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50'

function Campo({ etiqueta, ayuda, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600">{etiqueta}</label>
      <div className="mt-1">{children}</div>
      {ayuda && <p className="text-[11px] text-gray-400 mt-1">{ayuda}</p>}
    </div>
  )
}

function Tarjeta({ titulo, descripcion, activa, onToggle, children }) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${activa ? 'border-green-300' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-gray-900">{titulo}</p>
          <p className="text-xs text-gray-500 mt-0.5">{descripcion}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!activa)}
          className={`relative flex-none w-11 h-6 rounded-full transition-colors ${activa ? 'bg-green-600' : 'bg-gray-300'}`}
          aria-pressed={activa}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${activa ? 'left-5.5 left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <div className={activa ? '' : 'opacity-60'}>{children}</div>
    </div>
  )
}
