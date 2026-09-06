import { useEffect, useState } from 'react'
import { Play, X } from 'lucide-react'

/**
 * Fotos y videos mandados de una vez, juntos en una cuadricula — como
 * WhatsApp. Cinco fotos ya no son cinco burbujas que llenan la pantalla.
 *
 * A diferencia del iPhone, en la web la cuadricula va DENTRO de la burbuja:
 * es el estilo que ya tiene la bandeja y no hay razon para cambiarlo aca.
 *
 * Las medidas son fijas y calcadas de la app para que las dos pantallas se
 * vean igual: 2 fotos = dos cuadrados; 3 = una grande y dos apiladas;
 * 4 o mas = 2x2 con "+N" encima de la cuarta.
 */
const ANCHO = 260
const HUECO = 2
const MITAD = (ANCHO - HUECO) / 2
const GRANDE = Math.round(ANCHO * 0.66)
const CHICO = ANCHO - GRANDE - HUECO
const CHICO_ALTO = (GRANDE - HUECO) / 2

/** La duracion en 1:14. */
const duracionCorta = (segundos) => {
  const s = Math.round(segundos || 0)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * La vista previa de un video: el cuadro del segundo 0,5 (el 0 casi siempre
 * sale negro), el boton de play y cuanto dura.
 *
 * El fotograma lo pinta el propio navegador con `#t=0.5` y
 * `preload="metadata"`: baja solo la cabecera y ese pedacito, no el video
 * entero. Sin `controls` a proposito — se abre en grande al hacer clic.
 */
export function VistaVideo({ media, compacta = false, onAbrir }) {
  const [duracion, setDuracion] = useState(0)
  const [proporcion, setProporcion] = useState(null)

  const alCargar = (e) => {
    const v = e.currentTarget
    if (v.duration && Number.isFinite(v.duration)) setDuracion(v.duration)
    if (v.videoWidth && v.videoHeight) setProporcion(v.videoWidth / v.videoHeight)
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`relative block overflow-hidden bg-black/5 ${compacta ? 'w-full h-full' : 'w-fit max-w-full rounded-lg'}`}
      style={compacta ? undefined : { width: ANCHO }}
      title="Ver el video"
    >
      <video
        src={`${media.url}#t=0.5`}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={alCargar}
        className={compacta ? 'w-full h-full object-cover' : 'w-full h-auto block'}
        style={compacta ? undefined : { aspectRatio: proporcion || 4 / 3, objectFit: 'cover' }}
      />
      <span className="absolute inset-0 grid place-items-center">
        <span
          className={`grid place-items-center rounded-full bg-white/90 shadow ${
            compacta ? 'w-8 h-8' : 'w-12 h-12'
          }`}
        >
          <Play className={`${compacta ? 'w-3.5 h-3.5' : 'w-5 h-5'} text-gray-900 translate-x-[1px]`} fill="currentColor" />
        </span>
      </span>
      {!compacta && duracion > 0 && (
        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-black/50 text-white text-[11px] font-medium">
          {duracionCorta(duracion)}
        </span>
      )}
    </button>
  )
}

/** El video a pantalla completa. Escape cierra. */
export function VisorVideo({ url, onCerrar }) {
  useEffect(() => {
    const teclas = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', teclas)
    return () => window.removeEventListener('keydown', teclas)
  }, [onCerrar])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onCerrar}
    >
      <button
        type="button"
        onClick={onCerrar}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Cerrar"
      >
        <X className="w-5 h-5" />
      </button>
      <video
        src={url}
        controls
        autoPlay
        playsInline
        onClick={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[88vh] rounded-lg"
      />
    </div>
  )
}

/** Una celda de la cuadricula: foto o video. */
function Celda({ m, ancho, alto, mas, onAbrirFoto, onAbrirVideo }) {
  const esVideo = m.tipo === 'video'
  return (
    <div className="relative overflow-hidden bg-black/5" style={{ width: ancho, height: alto }}>
      {esVideo ? (
        <VistaVideo media={m.media} compacta onAbrir={() => onAbrirVideo(m)} />
      ) : (
        <button
          type="button"
          onClick={() => onAbrirFoto(m)}
          className="block w-full h-full"
          title="Ver la foto"
        >
          <img
            src={m.media.thumbUrl || m.media.url}
            alt={m.texto || 'Foto'}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </button>
      )}
      {mas > 0 && (
        <span className="absolute inset-0 grid place-items-center bg-black/45 text-white text-2xl font-semibold pointer-events-none">
          +{mas}
        </span>
      )}
    </div>
  )
}

/**
 * La cuadricula. `mensajes` son las fotos y videos de una misma tanda, en
 * orden.
 */
export default function AlbumMedia({ mensajes, onAbrirFoto, onAbrirVideo }) {
  const props = { onAbrirFoto, onAbrirVideo }
  const n = mensajes.length

  if (n === 2) {
    return (
      <div className="flex rounded-lg overflow-hidden" style={{ gap: HUECO, width: ANCHO }}>
        <Celda m={mensajes[0]} ancho={MITAD} alto={MITAD} mas={0} {...props} />
        <Celda m={mensajes[1]} ancho={MITAD} alto={MITAD} mas={0} {...props} />
      </div>
    )
  }

  if (n === 3) {
    return (
      <div className="flex rounded-lg overflow-hidden" style={{ gap: HUECO, width: ANCHO }}>
        <Celda m={mensajes[0]} ancho={GRANDE} alto={GRANDE} mas={0} {...props} />
        <div className="flex flex-col" style={{ gap: HUECO }}>
          <Celda m={mensajes[1]} ancho={CHICO} alto={CHICO_ALTO} mas={0} {...props} />
          <Celda m={mensajes[2]} ancho={CHICO} alto={CHICO_ALTO} mas={0} {...props} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-lg overflow-hidden" style={{ gap: HUECO, width: ANCHO }}>
      <div className="flex" style={{ gap: HUECO }}>
        <Celda m={mensajes[0]} ancho={MITAD} alto={MITAD} mas={0} {...props} />
        <Celda m={mensajes[1]} ancho={MITAD} alto={MITAD} mas={0} {...props} />
      </div>
      <div className="flex" style={{ gap: HUECO }}>
        <Celda m={mensajes[2]} ancho={MITAD} alto={MITAD} mas={0} {...props} />
        <Celda m={mensajes[3]} ancho={MITAD} alto={MITAD} mas={n - 4} {...props} />
      </div>
    </div>
  )
}
