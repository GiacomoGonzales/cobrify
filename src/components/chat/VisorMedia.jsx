import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Download, Forward, PencilLine, X } from 'lucide-react'
import { descargarArchivo, nombreDeArchivo } from '@/utils/descargarArchivo'

/**
 * Visor de imágenes a pantalla completa, liviano.
 *
 * Abre mostrando la MINIATURA que ya está en pantalla (se ve al instante,
 * porque el navegador la tiene en caché) y encima carga el original. Así el
 * visor nunca aparece en blanco esperando la descarga.
 *
 * Navega entre todas las imágenes de la conversación con las flechas o el
 * teclado, y cierra con Escape.
 *
 * Arriba: editar (pintar encima), reenviar y descargar — lo mismo que ofrece
 * WhatsApp al abrir una foto. `onEditar` y `onReenviar` son opcionales: sin
 * ellos el visor se comporta como antes.
 */
export default function VisorMedia({ imagenes, indiceInicial = 0, onCerrar, onEditar, onReenviar }) {
  const [i, setI] = useState(indiceInicial)
  const [originalListo, setOriginalListo] = useState(false)
  const [bajando, setBajando] = useState(false)

  const actual = imagenes[i]

  const mover = useCallback((paso) => {
    setOriginalListo(false)
    setI((prev) => (prev + paso + imagenes.length) % imagenes.length)
  }, [imagenes.length])

  useEffect(() => {
    const teclas = (e) => {
      if (e.key === 'Escape') onCerrar()
      else if (e.key === 'ArrowRight' && imagenes.length > 1) mover(1)
      else if (e.key === 'ArrowLeft' && imagenes.length > 1) mover(-1)
    }
    window.addEventListener('keydown', teclas)
    return () => window.removeEventListener('keydown', teclas)
  }, [onCerrar, mover, imagenes.length])

  // Precarga del original: cuando termina, reemplaza a la miniatura ampliada.
  useEffect(() => {
    if (!actual?.url) return undefined
    let vivo = true
    const img = new Image()
    img.onload = () => { if (vivo) setOriginalListo(true) }
    img.src = actual.url
    return () => { vivo = false }
  }, [actual?.url])

  if (!actual) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/90 flex flex-col"
      onClick={onCerrar}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white/80" onClick={(e) => e.stopPropagation()}>
        <span className="text-[13px]">
          {imagenes.length > 1 ? `${i + 1} de ${imagenes.length}` : ''}
        </span>
        <div className="flex items-center gap-1">
          {onEditar && (
            <button
              onClick={() => onEditar(actual)}
              className="p-2 hover:text-white rounded-lg hover:bg-white/10"
              title="Editar y enviar"
            >
              <PencilLine className="w-5 h-5" />
            </button>
          )}
          {onReenviar && (
            <button
              onClick={() => onReenviar(actual)}
              className="p-2 hover:text-white rounded-lg hover:bg-white/10"
              title="Reenviar"
            >
              <Forward className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={async () => {
              setBajando(true)
              await descargarArchivo(actual.url, nombreDeArchivo(actual))
              setBajando(false)
            }}
            disabled={bajando}
            className="p-2 hover:text-white rounded-lg hover:bg-white/10 disabled:opacity-50"
            title="Descargar"
          >
            <Download className="w-5 h-5" />
          </button>
          <button onClick={onCerrar} className="p-2 hover:text-white rounded-lg hover:bg-white/10" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-2 pb-4 min-h-0">
        {imagenes.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); mover(-1) }}
            className="p-2 text-white/60 hover:text-white flex-none"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}

        <img
          key={actual.url}
          src={originalListo ? actual.url : (actual.thumbUrl || actual.url)}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className={`max-h-full max-w-full object-contain transition-[filter] duration-200 ${
            originalListo ? '' : 'blur-[1px]'
          }`}
        />

        {imagenes.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); mover(1) }}
            className="p-2 text-white/60 hover:text-white flex-none"
            aria-label="Siguiente"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        )}
      </div>
    </div>
  )
}
