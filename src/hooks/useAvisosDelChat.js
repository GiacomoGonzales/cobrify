import { useEffect, useRef } from 'react'
import { MARCA_CHAT } from '@/utils/dominioChat'
import { formatearNumero } from '@/services/whatsappChatService'

/**
 * Los avisos de la bandeja, como los de WhatsApp Web:
 *
 *  - el título de la pestaña dice cuántas conversaciones tienen algo sin leer;
 *  - entra un mensaje y salta una notificación del sistema, con el nombre de
 *    quien escribe y lo que dijo; al tocarla se abre esa conversación.
 *
 * NO hace falta la llave de notificaciones push (VAPID) ni nada del servidor:
 * esto vale mientras la pestaña esté abierta, aunque esté de fondo o
 * minimizada, que es el caso de todo el día. Los avisos con el navegador
 * CERRADO sí necesitan push, y eso sigue pendiente.
 *
 * @param {object[]} conversaciones  las de la bandeja, tal como llegan
 * @param {string|null} activaId     la que está abierta
 * @param {(id: string) => void} onAbrir  qué hacer al tocar una notificación
 */
export function useAvisosDelChat(conversaciones, activaId, onAbrir) {
  // Lo último que ya se avisó de cada conversación. Se guarda para no repetir
  // el aviso en cada repintado, y para no disparar treinta notificaciones la
  // primera vez que se cargan las conversaciones.
  const ultimoAvisado = useRef(null)
  const abrir = useRef(onAbrir)
  abrir.current = onAbrir

  // El permiso se pide DESPUÉS del primer clic: varios navegadores ignoran (y
  // Chrome penaliza) al que lo pide apenas carga la página, sin que el usuario
  // haya hecho nada.
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return undefined
    const pedir = () => { Notification.requestPermission().catch(() => {}) }
    window.addEventListener('pointerdown', pedir, { once: true })
    return () => window.removeEventListener('pointerdown', pedir)
  }, [])

  // El contador del título: CONVERSACIONES con algo sin leer, no mensajes. Es
  // lo que uno quiere saber de un vistazo — cuántas puertas hay que atender.
  //
  // BrandingContext también escribe el título, y como está por encima corre
  // después en el primer pintado. No hay pelea: ahí todavía no llegó ninguna
  // conversación, y en cuanto llegan este efecto vuelve a escribirlo.
  const sinLeer = conversaciones.filter((c) => (c.sinLeer || 0) > 0).length
  useEffect(() => {
    document.title = sinLeer > 0 ? `(${sinLeer}) ${MARCA_CHAT.nombre}` : MARCA_CHAT.nombre
  }, [sinLeer])

  useEffect(() => {
    // Primera vuelta: se anota lo que ya había sin avisar de nada. Sin esto,
    // abrir la bandeja soltaría una notificación por cada conversación con
    // mensajes viejos.
    const ahora = new Map(
      conversaciones.map((c) => [c.id, c.ultimoMensajeAt?.toMillis?.() || 0]),
    )
    if (ultimoAvisado.current === null) {
      ultimoAvisado.current = ahora
      return
    }
    const antes = ultimoAvisado.current
    ultimoAvisado.current = ahora

    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    // Solo con la ventana de lado: si el usuario está mirando la bandeja, la
    // conversación que sube sola en la lista ya se lo dice.
    if (!document.hidden && document.hasFocus()) return

    for (const c of conversaciones) {
      if (c.ultimaDireccion !== 'entrante') continue
      const cuando = c.ultimoMensajeAt?.toMillis?.() || 0
      if (!cuando || cuando <= (antes.get(c.id) || 0)) continue
      if (c.id === activaId && !document.hidden) continue

      try {
        const aviso = new Notification(c.nombre || formatearNumero(c.waId), {
          body: c.ultimoMensaje || 'Mensaje nuevo',
          icon: MARCA_CHAT.icono,
          // Una notificación POR CONVERSACIÓN: el mensaje siguiente del mismo
          // contacto reemplaza al anterior en vez de apilar diez.
          tag: `chat-${c.id}`,
          renotify: true,
        })
        aviso.onclick = () => {
          window.focus()
          abrir.current?.(c.id)
          aviso.close()
        }
      } catch { /* el navegador puede negarse; no es motivo para romper nada */ }
    }
  }, [conversaciones, activaId])
}
