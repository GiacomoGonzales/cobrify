import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Grabar una nota de voz en el navegador.
 *
 * El detalle que manda acá es el FORMATO. `MediaRecorder` graba en lo que el
 * navegador quiera, y WhatsApp solo acepta unos pocos tipos: mp4 (que sale como
 * .m4a), ogg con opus y mp3. Chrome tambien ofrece webm — que no sirve — asi
 * que se pide explicitamente uno de los buenos y, si ninguno esta disponible,
 * se apaga el microfono en vez de grabar algo que Meta va a rechazar despues.
 *
 * El tope de WhatsApp para audio es 16 MB. A la calidad de una nota de voz eso
 * son mas de veinte minutos, asi que no hace falta cortar por tamaño; igual se
 * corta a 5 minutos, que es lo que dura una nota de voz razonable.
 */

const TOPE_SEGUNDOS = 5 * 60

/** En orden de preferencia. El primero que el navegador sepa grabar, gana. */
const FORMATOS = [
  { mime: 'audio/mp4', ext: 'm4a' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
  { mime: 'audio/ogg', ext: 'ogg' },
  { mime: 'audio/mpeg', ext: 'mp3' },
]

/** El primer formato grabable que WhatsApp acepta, o null si no hay ninguno. */
export const formatoDeGrabacion = () => {
  if (typeof MediaRecorder === 'undefined') return null
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f.mime)) || null
}

/** "0:07" — lo que se lee mientras se graba. */
export const relojDeGrabacion = (segundos) => {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function useGrabadora() {
  const [grabando, setGrabando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const grabador = useRef(null)
  const pedazos = useRef([])
  const pista = useRef(null)
  const reloj = useRef(null)
  // El micrófono se apaga en cuanto la pantalla se desmonta: dejar la luz del
  // micrófono prendida después de salir del chat sería alarmante.
  const soltarMicrofono = useCallback(() => {
    pista.current?.getTracks().forEach((t) => t.stop())
    pista.current = null
    clearInterval(reloj.current)
    reloj.current = null
  }, [])

  useEffect(() => soltarMicrofono, [soltarMicrofono])

  const formato = formatoDeGrabacion()

  /**
   * Pide el micrófono y arranca. Devuelve null si el usuario no da permiso —
   * quien llama decide qué decirle, porque el aviso depende de dónde esté.
   */
  const empezar = useCallback(async () => {
    if (!formato) return { ok: false, motivo: 'Este navegador no puede grabar audio para WhatsApp' }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      pista.current = stream
      pedazos.current = []
      const mr = new MediaRecorder(stream, { mimeType: formato.mime })
      mr.ondataavailable = (e) => { if (e.data.size) pedazos.current.push(e.data) }
      grabador.current = mr
      mr.start()
      setSegundos(0)
      setGrabando(true)
      reloj.current = setInterval(() => {
        setSegundos((s) => {
          if (s + 1 >= TOPE_SEGUNDOS) mr.stop()
          return s + 1
        })
      }, 1000)
      return { ok: true }
    } catch (e) {
      soltarMicrofono()
      const negado = e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
      return {
        ok: false,
        motivo: negado
          ? 'El navegador no dio permiso para usar el micrófono'
          : 'No se pudo abrir el micrófono',
      }
    }
  }, [formato, soltarMicrofono])

  /** Termina y entrega el archivo listo para enviar. */
  const terminar = useCallback(() => new Promise((resolve) => {
    const mr = grabador.current
    if (!mr || mr.state === 'inactive') { resolve(null); return }
    mr.onstop = () => {
      const blob = new Blob(pedazos.current, { type: formato.mime })
      soltarMicrofono()
      setGrabando(false)
      setSegundos(0)
      // Un blob vacío pasa si se suelta el botón al instante: no es un error,
      // simplemente no hay nota que mandar.
      if (!blob.size) { resolve(null); return }
      // El tipo va SIN los parámetros del códec: el servidor busca el mime en
      // una tabla exacta y "audio/ogg;codecs=opus" no está en ella.
      const limpio = formato.mime.split(';')[0]
      resolve(new File([blob], `nota-${Date.now()}.${formato.ext}`, { type: limpio }))
    }
    mr.stop()
  }), [formato, soltarMicrofono])

  const cancelar = useCallback(() => {
    const mr = grabador.current
    if (mr && mr.state !== 'inactive') { mr.onstop = null; mr.stop() }
    pedazos.current = []
    soltarMicrofono()
    setGrabando(false)
    setSegundos(0)
  }, [soltarMicrofono])

  return { puedeGrabar: Boolean(formato), grabando, segundos, empezar, terminar, cancelar }
}
