/**
 * Un recuadro para FIRMAR con el dedo, el lápiz o el mouse.
 *
 * Devuelve la firma como PNG en base64 cada vez que termina un trazo (o null
 * al borrar). Sin librerías: son eventos de puntero sobre un canvas. Se dibuja
 * a la densidad de la pantalla para que en el celular no salga pixelada.
 */
import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

export default function FirmaCanvas({ onChange, alto = 180 }) {
  const canvasRef = useRef(null)
  const dibujando = useRef(false)
  const [hayTrazo, setHayTrazo] = useState(false)

  // El tamaño real del canvas se fija una vez, a la densidad de la pantalla.
  // Cambiarlo después borraría la firma, así que no se sigue el resize.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(canvas.clientWidth * dpr)
    canvas.height = Math.round(alto * dpr)
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [alto])

  const contexto = () => canvasRef.current?.getContext('2d')
  const punto = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const empezar = (e) => {
    e.preventDefault()
    const ctx = contexto()
    if (!ctx) return
    canvasRef.current.setPointerCapture?.(e.pointerId)
    dibujando.current = true
    const p = punto(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    // Un toque sin arrastrar también deja marca (un punto).
    ctx.lineTo(p.x + 0.1, p.y + 0.1)
    ctx.stroke()
    if (!hayTrazo) setHayTrazo(true)
  }

  const mover = (e) => {
    if (!dibujando.current) return
    e.preventDefault()
    const ctx = contexto()
    const p = punto(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const terminar = () => {
    if (!dibujando.current) return
    dibujando.current = false
    onChange?.(canvasRef.current.toDataURL('image/png'))
  }

  const borrar = () => {
    const canvas = canvasRef.current
    const ctx = contexto()
    if (!canvas || !ctx) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    setHayTrazo(false)
    onChange?.(null)
  }

  return (
    <div>
      <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden" style={{ height: alto }}>
        <canvas
          ref={canvasRef}
          className="block w-full h-full touch-none cursor-crosshair"
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
          onPointerCancel={terminar}
        />
        {!hayTrazo && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">
            Firme aquí con el dedo o el mouse
          </p>
        )}
        <div className="absolute bottom-7 left-8 right-8 border-b border-gray-300 pointer-events-none" />
      </div>
      <div className="flex justify-end mt-1">
        <button
          type="button"
          onClick={borrar}
          className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
        >
          <Eraser className="w-3.5 h-3.5" /> Borrar firma
        </button>
      </div>
    </div>
  )
}
