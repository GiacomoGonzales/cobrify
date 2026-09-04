import { useState, useEffect, useMemo } from 'react'
import { getAuth } from 'firebase/auth'
import { RefreshCw, X, Send, Image as ImageIcon } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import {
  suscribirPlantillas,
  sincronizarPlantillas,
  variablesDelCuerpo,
  cabeceraDe,
  previsualizarPlantilla,
} from '@/services/whatsappChatService'

const CATEGORIAS = { MARKETING: 'Marketing', UTILITY: 'Utilidad', AUTHENTICATION: 'Autenticación' }

/**
 * Elegir una plantilla aprobada, completar sus variables y enviarla.
 *
 * Sirve para dos cosas con el mismo formulario: reabrir UNA conversación con
 * la ventana cerrada, o mandar una campaña a muchas (modo campaña). En campaña
 * los valores pueden llevar {nombre} y {negocio}, que el servidor reemplaza
 * por contacto.
 *
 * Solo muestra las APROBADAS: las pendientes o rechazadas se listan aparte,
 * apagadas, para que se sepa que existen y por qué no se pueden usar.
 */
export default function SelectorPlantilla({ titulo, destinatarios, onEnviar, onCerrar, modoCampana = false }) {
  const toast = useToast()
  const [plantillas, setPlantillas] = useState([])
  const [sincronizadoEl, setSincronizadoEl] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [elegida, setElegida] = useState(null)
  const [body, setBody] = useState([])
  const [headerText, setHeaderText] = useState('')
  const [headerImageUrl, setHeaderImageUrl] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => suscribirPlantillas((lista, fecha) => {
    setPlantillas(lista)
    setSincronizadoEl(fecha)
  }), [])

  // Sin catálogo todavía: traerlo solo la primera vez que se abre.
  useEffect(() => {
    if (plantillas.length === 0 && sincronizadoEl === null && !sincronizando) {
      const t = setTimeout(() => sincronizar(true), 600)
      return () => clearTimeout(t)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillas.length, sincronizadoEl])

  const sincronizar = async (silencioso = false) => {
    setSincronizando(true)
    try {
      const idToken = await getAuth().currentUser?.getIdToken()
      const r = await sincronizarPlantillas(idToken)
      if (!silencioso) toast.success(`${r.total} plantilla${r.total === 1 ? '' : 's'} en la cuenta`)
    } catch (e) {
      toast.error(e.message || 'No se pudieron traer las plantillas')
    } finally {
      setSincronizando(false)
    }
  }

  const aprobadas = useMemo(() => plantillas.filter((p) => p.status === 'APPROVED'), [plantillas])
  const otras = useMemo(() => plantillas.filter((p) => p.status !== 'APPROVED'), [plantillas])

  const nVars = elegida ? variablesDelCuerpo(elegida) : 0
  const cab = elegida ? cabeceraDe(elegida) : null

  useEffect(() => {
    setBody(Array.from({ length: nVars }, () => ''))
    setHeaderText('')
    setHeaderImageUrl('')
  }, [elegida, nVars])

  const valores = { body, headerText: headerText || null, headerImageUrl: headerImageUrl || null }
  const faltan = body.some((v) => !v.trim())
    || (cab?.conVariable && !headerText.trim())
    || (cab?.formato === 'IMAGE' && !/^https?:\/\//.test(headerImageUrl))

  const enviar = async () => {
    if (!elegida || faltan || enviando) return
    setEnviando(true)
    try {
      await onEnviar(elegida, valores)
    } catch (e) {
      toast.error(e.message || 'No se pudo enviar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">{titulo || 'Enviar plantilla'}</h3>
            <p className="text-[11.5px] text-gray-500 mt-0.5">
              {modoCampana
                ? `${destinatarios} destinatario${destinatarios === 1 ? '' : 's'} · se cobra por conversación iniciada`
                : 'Fuera de las 24 horas solo se puede escribir con una plantilla aprobada por Meta'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => sincronizar(false)}
              disabled={sincronizando}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              title={sincronizadoEl ? `Actualizado ${sincronizadoEl.toLocaleString('es-PE')}` : 'Traer plantillas de Meta'}
            >
              <RefreshCw className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onCerrar} className="p-2 text-gray-400 hover:text-gray-600" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden grid grid-cols-1 sm:grid-cols-5">
          {/* Lista */}
          <div className="sm:col-span-2 border-b sm:border-b-0 sm:border-r border-gray-200 overflow-y-auto max-h-48 sm:max-h-none">
            {aprobadas.length === 0 && !sincronizando && (
              <div className="p-4 text-[13px] text-gray-500">
                No hay plantillas aprobadas todavía. Se crean y aprueban en el panel de Meta
                (WhatsApp Manager → Plantillas de mensajes) y después aparecen acá.
              </div>
            )}
            {sincronizando && aprobadas.length === 0 && (
              <p className="p-4 text-[13px] text-gray-500">Trayendo plantillas de Meta...</p>
            )}
            {aprobadas.map((p) => (
              <button
                key={p.id}
                onClick={() => setElegida(p)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${
                  elegida?.id === p.id ? 'bg-green-50' : ''
                }`}
              >
                <p className="text-[13px] font-semibold text-gray-900 truncate">{p.name}</p>
                <p className="text-[11px] text-gray-500">
                  {CATEGORIAS[p.category] || p.category} · {p.language}
                </p>
              </button>
            ))}
            {otras.length > 0 && (
              <div className="px-4 py-2 text-[11px] text-gray-400 uppercase tracking-wide">No disponibles</div>
            )}
            {otras.map((p) => (
              <div key={p.id} className="px-4 py-2 opacity-50" title={p.rejectedReason || p.status}>
                <p className="text-[13px] text-gray-700 truncate">{p.name}</p>
                <p className="text-[11px] text-gray-500">
                  {p.status === 'PENDING' ? 'En revisión' : p.status === 'REJECTED' ? 'Rechazada' : p.status}
                </p>
              </div>
            ))}
          </div>

          {/* Formulario + vista previa */}
          <div className="sm:col-span-3 overflow-y-auto p-5">
            {!elegida ? (
              <p className="text-[13px] text-gray-500">Elige una plantilla de la lista.</p>
            ) : (
              <div className="space-y-4">
                {cab?.formato === 'IMAGE' && (
                  <div>
                    <label className="text-[11.5px] font-semibold text-gray-600 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" /> Imagen de cabecera (URL pública)
                    </label>
                    <input
                      type="url"
                      value={headerImageUrl}
                      onChange={(e) => setHeaderImageUrl(e.target.value)}
                      placeholder="https://www.cobrifyperu.com/socialmedia.jpeg"
                      className="w-full mt-1 px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                )}
                {cab?.conVariable && (
                  <div>
                    <label className="text-[11.5px] font-semibold text-gray-600">Cabecera: {'{{1}}'}</label>
                    <input
                      type="text"
                      value={headerText}
                      onChange={(e) => setHeaderText(e.target.value)}
                      className="w-full mt-1 px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                )}
                {body.map((v, i) => (
                  <div key={i}>
                    <label className="text-[11.5px] font-semibold text-gray-600">
                      Variable {'{{'}{i + 1}{'}}'}
                      {modoCampana && i === 0 && (
                        <span className="font-normal text-gray-400"> — podés usar {'{nombre}'} o {'{negocio}'}</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={v}
                      onChange={(e) => {
                        const copia = [...body]
                        copia[i] = e.target.value
                        setBody(copia)
                      }}
                      placeholder={modoCampana && i === 0 ? '{nombre}' : ''}
                      className="w-full mt-1 px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                ))}

                <div>
                  <p className="text-[11.5px] font-semibold text-gray-600 mb-1.5">Así lo va a ver el cliente</p>
                  <div className="bg-[#e7f7ec] rounded-2xl rounded-br-sm px-3.5 py-2.5 max-w-sm">
                    {cab?.formato === 'IMAGE' && headerImageUrl && (
                      <img src={headerImageUrl} alt="" className="rounded-lg mb-2 max-h-40 w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    )}
                    <p className="text-[13px] text-gray-900 whitespace-pre-wrap">{previsualizarPlantilla(elegida, valores)}</p>
                  </div>
                  {(elegida.components || []).some((c) => c.type === 'BUTTONS') && (
                    <p className="text-[11px] text-gray-400 mt-1">Esta plantilla incluye botones; se muestran en el WhatsApp del cliente.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onCerrar} disabled={enviando} className="px-4 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={!elegida || faltan || enviando}
            className="px-4 py-2 text-[13px] font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {enviando ? 'Enviando...' : modoCampana ? `Enviar a ${destinatarios}` : 'Enviar plantilla'}
          </button>
        </div>
      </div>
    </div>
  )
}
