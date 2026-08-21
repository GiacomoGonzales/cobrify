import { useMemo, useState } from 'react'
import { FileText, Film, Music, X } from 'lucide-react'
import { formatearHora } from '@/services/whatsappChatService'

/**
 * Todos los archivos de una conversación, como la carpeta de multimedia de
 * WhatsApp. Se arma con los mensajes que ya están cargados: no consulta nada
 * ni descarga de más — las imágenes usan la misma miniatura que la burbuja,
 * así que abrir el panel es instantáneo.
 */
const PESTANAS = [
  ['media', 'Fotos y videos'],
  ['document', 'Documentos'],
  ['audio', 'Audios'],
]

export default function PanelMultimedia({ mensajes, onCerrar, onAbrirImagen, onIrAlMensaje }) {
  const [pestana, setPestana] = useState('media')

  const porTipo = useMemo(() => {
    const g = { media: [], document: [], audio: [] }
    for (const m of mensajes) {
      if (!m.media?.url) continue
      if (m.tipo === 'image' || m.tipo === 'sticker' || m.tipo === 'video') g.media.push(m)
      else if (m.tipo === 'document') g.document.push(m)
      else if (m.tipo === 'audio') g.audio.push(m)
    }
    // Lo más nuevo primero, que es lo que uno suele buscar.
    for (const k of Object.keys(g)) g[k].reverse()
    return g
  }, [mensajes])

  const lista = porTipo[pestana]

  return (
    <aside className="w-full sm:w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-sm">Archivos</h3>
        <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        {PESTANAS.map(([id, nombre]) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            className={`flex-1 px-2 py-2 text-xs font-semibold border-b-2 transition-colors ${
              pestana === id ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {nombre}
            {porTipo[id].length > 0 && <span className="ml-1 text-gray-400">{porTipo[id].length}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {lista.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            No hay {pestana === 'media' ? 'fotos ni videos' : pestana === 'document' ? 'documentos' : 'audios'} en esta conversación.
          </p>
        )}

        {pestana === 'media' && lista.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {lista.map((m) => (
              <button
                key={m.id}
                onClick={() => (m.tipo === 'video' ? onIrAlMensaje(m.id) : onAbrirImagen(m))}
                className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group"
                title={formatearHora(m.timestamp)}
              >
                {m.tipo === 'video' ? (
                  <>
                    <video src={m.media.url} preload="metadata" className="w-full h-full object-cover bg-black" muted />
                    <Film className="absolute inset-0 m-auto w-6 h-6 text-white drop-shadow" />
                  </>
                ) : (
                  <img
                    src={m.media.thumbUrl || m.media.url}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:opacity-90"
                  />
                )}
              </button>
            ))}
          </div>
        )}

        {pestana !== 'media' && lista.length > 0 && (
          <div className="space-y-1.5">
            {lista.map((m) => (
              <button
                key={m.id}
                onClick={() => onIrAlMensaje(m.id)}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-none">
                  {pestana === 'audio'
                    ? <Music className="w-4.5 h-4.5 w-5 h-5 text-gray-400" />
                    : <FileText className="w-5 h-5 text-red-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">
                    {m.media.filename || (pestana === 'audio' ? 'Audio' : 'Documento')}
                  </p>
                  <p className="text-[11px] text-gray-400">{formatearHora(m.timestamp)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
