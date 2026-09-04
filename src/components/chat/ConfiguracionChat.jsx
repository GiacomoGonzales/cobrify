import { useState, useEffect, useRef } from 'react'
import { getAuth } from 'firebase/auth'
import {
  ArrowLeft,
  Camera,
  Clock,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  Paperclip,
  Plus,
  Trash2,
  UserCircle,
  X,
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { Seccion, Campo, Entrada, Selector, AreaTexto, Boton } from '@/components/admin/ui'
import {
  obtenerPerfil,
  guardarPerfil,
  RUBROS,
  suscribirAutomaticos,
  guardarAutomaticos,
  CONFIG_AUTOMATICOS_DEFAULT,
  subirArchivoBiblioteca,
  validarArchivo,
  ADJUNTOS_ACEPTADOS,
  NOMBRE_TIPO,
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

      {/* Pestañas al estilo del admin: sin iconos, que aquí solo decoraban. */}
      <div className="flex items-center gap-1 px-2 bg-white border-b border-gray-200 overflow-x-auto">
        {[
          ['perfil', 'Perfil del negocio'],
          ['automaticos', 'Respuestas automáticas'],
          ['rapidas', 'Respuestas rápidas'],
        ].map(([id, nombre]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSeccion(id)}
            className={`px-3 py-2.5 text-[13px] border-b-2 -mb-px whitespace-nowrap ${
              seccion === id ? 'border-gray-900 text-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
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

  if (cargando) return <p className="text-[13px] text-gray-500">Leyendo el perfil de WhatsApp...</p>
  if (!perfil) return null

  const campo = (k, v) => setPerfil((p) => ({ ...p, [k]: v }))
  const fotoActual = fotoPreview || perfil.profilePictureUrl

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-gray-600">
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
            className="absolute -bottom-1 -right-1 p-2 bg-primary-600 text-white rounded-full shadow hover:bg-primary-700"
            title="Cambiar foto"
          >
            <Camera className="w-4 h-4" />
          </button>
          <input ref={selector} type="file" accept="image/jpeg,image/png" onChange={elegirFoto} className="hidden" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">Cobrify Facturación</p>
          {numero && <p className="text-[13px] text-gray-500">+{numero}</p>}
          {foto && <p className="text-[11.5px] text-amber-600 mt-1">Foto nueva elegida, falta guardar</p>}
          <p className="text-[11.5px] text-gray-400 mt-1">JPG o PNG cuadrada, hasta 5 MB. Ideal 640x640.</p>
        </div>
      </div>

      <Campo etiqueta="Frase corta (info)" ayuda="Aparece bajo el nombre. Máx. 139 caracteres.">
        <Entrada type="text" maxLength={139} value={perfil.about} onChange={(e) => campo('about', e.target.value)} placeholder="Facturación electrónica SUNAT para tu negocio" />
      </Campo>
      <Campo etiqueta="Descripción" ayuda="Qué hace tu negocio. Máx. 512 caracteres.">
        <AreaTexto rows={3} maxLength={512} value={perfil.description} onChange={(e) => campo('description', e.target.value)} />
      </Campo>
      <Campo etiqueta="Dirección">
        <Entrada type="text" maxLength={256} value={perfil.address} onChange={(e) => campo('address', e.target.value)} placeholder="Lima, Perú" />
      </Campo>
      <Campo etiqueta="Correo de contacto">
        <Entrada type="email" maxLength={128} value={perfil.email} onChange={(e) => campo('email', e.target.value)} />
      </Campo>
      <Campo etiqueta="Sitios web" ayuda="Hasta 2, con https://">
        {[0, 1].map((i) => (
          <Entrada
            key={i}
            type="url"
            value={perfil.websites[i] || ''}
            onChange={(e) => {
              const w = [...(perfil.websites || [])]
              w[i] = e.target.value
              campo('websites', w)
            }}
            className={i === 1 ? 'mt-2' : ''}
            placeholder={i === 0 ? 'https://www.cobrifyperu.com' : ''}
          />
        ))}
      </Campo>
      <Campo etiqueta="Rubro">
        <Selector value={perfil.vertical} onChange={(e) => campo('vertical', e.target.value)} className="bg-white">
          {RUBROS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </Selector>
      </Campo>

      <div className="flex justify-end">
        <Boton variante="primario" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar perfil'}
        </Boton>
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

  if (!cfg) return <p className="text-[13px] text-gray-500">Cargando...</p>
  const b = cfg.bienvenida || CONFIG_AUTOMATICOS_DEFAULT.bienvenida
  const au = cfg.ausencia || CONFIG_AUTOMATICOS_DEFAULT.ausencia
  const h = au.horario || CONFIG_AUTOMATICOS_DEFAULT.ausencia.horario
  const setB = (x) => setCfg({ ...cfg, bienvenida: { ...b, ...x } })
  const setAu = (x) => setCfg({ ...cfg, ausencia: { ...au, ...x } })
  const setH = (x) => setAu({ horario: { ...h, ...x } })

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-gray-600">
        Las escribe el sistema en tu nombre y quedan en el hilo marcadas como automáticas.
        Podés usar <code className="bg-gray-100 px-1 rounded">{'{nombre}'}</code> y se reemplaza por el nombre del contacto.
      </p>

      <Tarjeta
        titulo="Mensaje de bienvenida"
        descripcion="Se envía una sola vez, cuando un número nuevo te escribe por primera vez."
        activa={b.activa}
        onToggle={(v) => setB({ activa: v })}
      >
        <AreaTexto rows={3} value={b.texto} onChange={(e) => setB({ texto: e.target.value })} />
      </Tarjeta>

      <Tarjeta
        titulo="Mensaje de ausencia"
        descripcion="Se envía cuando te escriben fuera del horario de atención. Máximo una vez cada 12 horas por conversación, para no repetirlo en cada mensaje."
        activa={au.activa}
        onToggle={(v) => setAu({ activa: v })}
      >
        <AreaTexto rows={3} value={au.texto} onChange={(e) => setAu({ texto: e.target.value })} />
        <div className="mt-3">
          <p className="text-[11.5px] font-semibold text-gray-600 flex items-center gap-1.5 mb-2">
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
                    className={`w-8 h-8 rounded-full text-[11.5px] font-bold ${on ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {letra}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <input type="time" value={h.desde} onChange={(e) => setH({ desde: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg" />
              <span className="text-gray-400">a</span>
              <input type="time" value={h.hasta} onChange={(e) => setH({ hasta: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg" />
            </div>
          </div>
        </div>
      </Tarjeta>

      <div className="flex justify-end">
        <Boton variante="primario" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Boton>
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
  // Indice de la respuesta cuyo archivo se esta subiendo (null = ninguna).
  const [subiendo, setSubiendo] = useState(null)
  const selectorRef = useRef(null)
  const destinoRef = useRef(null)

  useEffect(() => suscribirAutomaticos((c) => setLista((prev) => prev || (c.respuestasRapidas || []))), [])

  const agregar = () => {
    const a = atajo.trim().toLowerCase().replace(/^\//, '').replace(/\s+/g, '-')
    if (!a || !texto.trim()) return
    if (lista.some((r) => r.atajo === a)) { toast.error(`Ya existe /${a}`); return }
    setLista([...lista, { atajo: a, texto: texto.trim() }])
    setAtajo('')
    setTexto('')
  }

  const pedirArchivo = (indice) => {
    destinoRef.current = indice
    selectorRef.current?.click()
  }

  const recibirArchivo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const i = destinoRef.current
    if (!file || i === null || i === undefined) return

    const problema = validarArchivo(file)
    if (problema) { toast.error(problema); return }

    setSubiendo(i)
    try {
      // Se guarda UNA vez; despues cada envio manda solo la direccion.
      const idToken = await getAuth().currentUser?.getIdToken()
      const media = await subirArchivoBiblioteca(file, idToken)
      setLista((prev) => {
        const copia = [...prev]
        copia[i] = { ...copia[i], media }
        return copia
      })
      toast.success('Archivo listo. Acordate de guardar.')
    } catch (err) {
      toast.error(err.message || 'No se pudo subir el archivo')
    } finally {
      setSubiendo(null)
    }
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

  if (!lista) return <p className="text-[13px] text-gray-500">Cargando...</p>

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-gray-600">
        Lo que escribís veinte veces, escrito una sola vez. En el cuadro de mensaje tipeá
        <code className="bg-gray-100 px-1 rounded mx-1">/</code> y elegí el atajo: el texto se pega y lo podés
        retocar antes de enviar. Acepta <code className="bg-gray-100 px-1 rounded">{'{nombre}'}</code>.
      </p>
      <p className="text-[13px] text-gray-600">
        Cada una puede llevar <strong>una imagen, un video, un audio o un PDF</strong>. El archivo se
        guarda una sola vez: mandarlo después es instantáneo, no importa cuánto pese.
      </p>

      <input
        ref={selectorRef}
        type="file"
        accept={ADJUNTOS_ACEPTADOS}
        onChange={recibirArchivo}
        className="hidden"
      />

      {lista.length === 0 && (
        <p className="text-[13px] text-gray-400 italic">Todavía no hay respuestas rápidas. Algunas ideas: /precios, /pago, /horario, /demo.</p>
      )}

      <div className="space-y-2">
        {lista.map((r, i) => (
          <div key={r.atajo} className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-start gap-3">
              <span className="font-mono text-[13px] font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded flex-none">/{r.atajo}</span>
              <textarea
                rows={2}
                value={r.texto}
                onChange={(e) => {
                  const copia = [...lista]
                  copia[i] = { ...r, texto: e.target.value }
                  setLista(copia)
                }}
                className="flex-1 text-[13px] bg-transparent focus:outline-none resize-none"
              />
              <button
                onClick={() => pedirArchivo(i)}
                disabled={subiendo !== null}
                className={`p-1 disabled:opacity-40 ${r.media ? 'text-primary-600' : 'text-gray-300 hover:text-gray-600'}`}
                title={r.media ? 'Cambiar archivo' : 'Adjuntar archivo'}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button onClick={() => setLista(lista.filter((x) => x.atajo !== r.atajo))} className="p-1 text-gray-300 hover:text-red-500" title="Eliminar">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {subiendo === i && (
              <p className="text-[11.5px] text-gray-500 mt-2 pl-1">Subiendo el archivo...</p>
            )}

            {r.media && subiendo !== i && (
              <VistaAdjunto
                media={r.media}
                onQuitar={() => {
                  const copia = [...lista]
                  // Se reconstruye sin `media` en vez de ponerlo en null:
                  // Firestore guardaría el null y la respuesta parecería tener
                  // adjunto vacío.
                  copia[i] = { atajo: copia[i].atajo, texto: copia[i].texto }
                  setLista(copia)
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="bg-white border border-dashed border-gray-300 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-mono text-[13px]">/</span>
          <input
            type="text"
            value={atajo}
            onChange={(e) => setAtajo(e.target.value)}
            placeholder="atajo (ej: precios)"
            className="flex-1 text-[13px] px-3 py-1.5 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Texto de la respuesta"
          className="w-full text-[13px] px-3 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
        />
        <div className="flex justify-end">
          <button onClick={agregar} disabled={!atajo.trim() || !texto.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-primary-700 hover:bg-primary-50 rounded-lg disabled:opacity-40">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <Boton variante="primario" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Boton>
      </div>
    </div>
  )
}

/* ============================ piezas ============================ */

/** Vista compacta del archivo de una respuesta rápida, con opción de quitarlo. */
const ICONO_TIPO = { image: ImageIcon, video: Film, audio: Music, document: FileText }

function VistaAdjunto({ media, onQuitar }) {
  const Icono = ICONO_TIPO[media.tipo] || FileText
  return (
    <div className="mt-2 flex items-center gap-3 bg-gray-50 rounded-lg p-2">
      {media.tipo === 'image' ? (
        <img src={media.url} alt="" className="w-14 h-14 rounded object-cover flex-none" />
      ) : media.tipo === 'video' ? (
        <video src={media.url} className="w-14 h-14 rounded object-cover flex-none bg-black" muted />
      ) : (
        <div className="w-14 h-14 rounded bg-white border border-gray-200 flex items-center justify-center flex-none">
          <Icono className="w-6 h-6 text-gray-400" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-medium text-gray-800 truncate">{media.filename || NOMBRE_TIPO[media.tipo]}</p>
        <p className="text-[11px] text-gray-400">
          {NOMBRE_TIPO[media.tipo]}
          {media.bytes ? ` · ${(media.bytes / 1024 / 1024).toFixed(1)} MB` : ''}
        </p>
      </div>
      <button onClick={onQuitar} className="p-1 text-gray-300 hover:text-red-500 flex-none" title="Quitar archivo">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

/** Una Seccion del kit con su interruptor de encendido en la cabecera. */
function Tarjeta({ titulo, descripcion, activa, onToggle, children }) {
  return (
    <Seccion
      titulo={titulo}
      descripcion={descripcion}
      acciones={
        <button
          type="button"
          onClick={() => onToggle(!activa)}
          className={`relative flex-none w-9 h-5 rounded-full transition-colors ${activa ? 'bg-primary-600' : 'bg-gray-300'}`}
          aria-pressed={activa}
          aria-label={activa ? 'Desactivar' : 'Activar'}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${activa ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      }
    >
      <div className={activa ? '' : 'opacity-60'}>{children}</div>
    </Seccion>
  )
}
