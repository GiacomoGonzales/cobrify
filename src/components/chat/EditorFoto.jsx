import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, Highlighter, Pencil, Send, Trash2, Undo2, X } from 'lucide-react'

/**
 * Pintar sobre una foto antes de mandarla, como WhatsApp.
 *
 * Todo pasa en el navegador: la foto se dibuja en un canvas del TAMAÑO REAL
 * (con tope de 2048 px, que es lo que acepta WhatsApp) y los trazos se
 * guardan en coordenadas de ese canvas, no de la pantalla. Así lo pintado
 * cae donde se ve, sin importar de qué tamaño se esté mostrando.
 *
 * El borrador quita el trazo entero que tocas —no borra píxeles—, igual que
 * en la app del iPhone: en una foto es lo que uno espera.
 */
const COLORES = ['#F0332C', '#FFFFFF', '#000000', '#FFC400', '#22C55E', '#2D7FF9', '#A855F7']
const GROSORES = [6, 12, 22]
const TOPE = 2048

export default function EditorFoto({ media, onCerrar, onEnviar }) {
  const canvas = useRef(null)
  const base = useRef(null)          // la foto ya cargada
  const trazos = useRef([])          // [{color, ancho, marcador, puntos:[{x,y}]}]
  const pintando = useRef(false)

  const [herramienta, setHerramienta] = useState('lapiz')
  const [color, setColor] = useState(COLORES[0])
  const [grosor, setGrosor] = useState(1)
  const [hayTrazos, setHayTrazos] = useState(false)
  const [pie, setPie] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState(null)

  const redibujar = useCallback(() => {
    const c = canvas.current
    const img = base.current
    if (!c || !img) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    for (const t of trazos.current) {
      ctx.save()
      ctx.globalAlpha = t.marcador ? 0.5 : 1
      ctx.strokeStyle = t.color
      ctx.lineWidth = t.ancho
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      t.puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      // Un toque suelto tiene que dejar un punto, no nada.
      if (t.puntos.length === 1) ctx.lineTo(t.puntos[0].x + 0.1, t.puntos[0].y)
      ctx.stroke()
      ctx.restore()
    }
  }, [])

  // La foto, una sola vez. `crossOrigin` para poder exportarla despues: sin
  // esto el canvas queda "manchado" y toBlob falla.
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const escala = Math.min(1, TOPE / Math.max(img.naturalWidth, img.naturalHeight))
      const c = canvas.current
      if (!c) return
      c.width = Math.round(img.naturalWidth * escala)
      c.height = Math.round(img.naturalHeight * escala)
      base.current = img
      redibujar()
      setListo(true)
    }
    img.onerror = () => setError('No se pudo abrir la foto para editarla.')
    img.src = media.url
  }, [media.url, redibujar])

  /** De la pantalla a las coordenadas del canvas. */
  const punto = (e) => {
    const c = canvas.current
    const caja = c.getBoundingClientRect()
    return {
      x: ((e.clientX - caja.left) / caja.width) * c.width,
      y: ((e.clientY - caja.top) / caja.height) * c.height,
    }
  }

  /** El trazo mas cercano al punto, para el borrador. */
  const trazoEn = (p) => {
    const margen = Math.max(14, canvas.current.width * 0.02)
    for (let i = trazos.current.length - 1; i >= 0; i -= 1) {
      const t = trazos.current[i]
      if (t.puntos.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= margen + t.ancho / 2)) return i
    }
    return -1
  }

  const empezar = (e) => {
    if (!listo) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = punto(e)
    if (herramienta === 'borrador') {
      const i = trazoEn(p)
      if (i >= 0) {
        trazos.current.splice(i, 1)
        setHayTrazos(trazos.current.length > 0)
        redibujar()
      }
      return
    }
    pintando.current = true
    trazos.current.push({
      color,
      ancho: GROSORES[grosor] * (herramienta === 'marcador' ? 2.2 : 1),
      marcador: herramienta === 'marcador',
      puntos: [p],
    })
    setHayTrazos(true)
    redibujar()
  }

  const mover = (e) => {
    if (!pintando.current) return
    trazos.current[trazos.current.length - 1].puntos.push(punto(e))
    redibujar()
  }

  const soltar = () => { pintando.current = false }

  const deshacer = () => {
    trazos.current.pop()
    setHayTrazos(trazos.current.length > 0)
    redibujar()
  }

  const limpiar = () => {
    trazos.current = []
    setHayTrazos(false)
    redibujar()
  }

  const enviar = () => {
    if (enviando) return
    setEnviando(true)
    canvas.current.toBlob(async (blob) => {
      if (!blob) { setError('No se pudo preparar la foto.'); setEnviando(false); return }
      const archivo = new File([blob], 'foto.jpg', { type: 'image/jpeg' })
      try {
        await onEnviar(archivo, pie.trim())
      } catch (e) {
        setError(e.message || 'No se pudo enviar la foto.')
        setEnviando(false)
      }
    }, 'image/jpeg', 0.85)
  }

  useEffect(() => {
    const teclas = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', teclas)
    return () => window.removeEventListener('keydown', teclas)
  }, [onCerrar])

  const botonHerramienta = (id, Icono, titulo) => (
    <button
      type="button"
      onClick={() => setHerramienta(id)}
      title={titulo}
      className={`p-2 rounded-lg ${herramienta === id ? 'bg-white/25 text-white' : 'text-white/70 hover:bg-white/10'}`}
    >
      <Icono className="w-5 h-5" />
    </button>
  )

  return (
    <div className="fixed inset-0 z-[70] bg-neutral-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <button type="button" onClick={onCerrar} className="text-white/80 hover:text-white text-[14px] px-2 py-1">
          Cancelar
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={deshacer}
            disabled={!hayTrazos}
            title="Deshacer"
            className="p-2 rounded-lg text-white/80 hover:bg-white/10 disabled:opacity-30"
          >
            <Undo2 className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={limpiar}
            disabled={!hayTrazos}
            title="Borrar todo"
            className="p-2 rounded-lg text-white/80 hover:bg-white/10 disabled:opacity-30"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-3">
        <canvas
          ref={canvas}
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerLeave={soltar}
          className="max-h-full max-w-full touch-none cursor-crosshair rounded-lg"
        />
      </div>

      {error && <p className="text-center text-red-300 text-[13px] py-1">{error}</p>}

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-1">
          {botonHerramienta('lapiz', Pencil, 'Lápiz')}
          {botonHerramienta('marcador', Highlighter, 'Marcador')}
          {botonHerramienta('borrador', Eraser, 'Borrador')}
          <span className="mx-2 w-px h-6 bg-white/15" />
          {GROSORES.map((g, i) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrosor(i)}
              title={`Grosor ${i + 1}`}
              className={`w-8 h-8 grid place-items-center rounded-full ${grosor === i ? 'bg-white/25' : 'hover:bg-white/10'}`}
            >
              <span className="rounded-full bg-white block" style={{ width: 5 + i * 5, height: 5 + i * 5 }} />
            </button>
          ))}
          <span className="flex-1" />
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setColor(c); if (herramienta === 'borrador') setHerramienta('lapiz') }}
              title="Color"
              className="w-7 h-7 rounded-full mx-0.5"
              style={{ background: c, boxShadow: color === c ? '0 0 0 2.5px white' : '0 0 0 1px rgba(255,255,255,.35)' }}
            />
          ))}
        </div>

        <div className="flex items-end gap-2">
          <input
            value={pie}
            onChange={(e) => setPie(e.target.value)}
            placeholder="Añade un comentario"
            className="flex-1 bg-white/10 text-white placeholder:text-white/40 rounded-full px-4 py-2 text-[14px] outline-none"
          />
          <button
            type="button"
            onClick={enviar}
            disabled={!listo || enviando}
            className="w-10 h-10 grid place-items-center rounded-full bg-primary-600 text-white disabled:opacity-50"
            title="Enviar"
          >
            {enviando ? <X className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
