import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Chat de WhatsApp — lectura en vivo y envío.
 *
 * Los mensajes los escribe el servidor (el webhook), así que acá solo se
 * ESCUCHA. Firestore empuja los cambios solo: cuando entra un mensaje aparece
 * en pantalla sin refrescar ni consultar cada tantos segundos.
 */

const SEND_URL = import.meta.env.VITE_WHATSAPP_SEND_URL
  || 'https://us-central1-cobrify-395fe.cloudfunctions.net/sendWhatsappMessage'

/** Milisegundos que dura la ventana de servicio de WhatsApp. */
export const VENTANA_24H_MS = 24 * 60 * 60 * 1000

/**
 * Escucha la lista de conversaciones, la más reciente primero.
 * @returns {function} para dejar de escuchar
 */
export const suscribirConversaciones = (onChange, onError) => {
  const q = query(
    collection(db, 'whatsappConversations'),
    orderBy('ultimoMensajeAt', 'desc'),
    limit(200),
  )
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.error('Error al escuchar las conversaciones:', error)
      onError?.(error)
    },
  )
}

/**
 * Escucha los mensajes de una conversación, del más viejo al más nuevo (que es
 * el orden en que se leen).
 */
export const suscribirMensajes = (conversationId, onChange, onError) => {
  const q = query(
    collection(db, 'whatsappConversations', conversationId, 'messages'),
    orderBy('timestamp', 'asc'),
    limit(500),
  )
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.error('Error al escuchar los mensajes:', error)
      onError?.(error)
    },
  )
}

/**
 * Envía un mensaje. El texto NO se guarda acá: lo guarda la Cloud Function con
 * el id que devuelve WhatsApp, y la pantalla lo ve llegar por la suscripción.
 * Así no hay dos versiones del mismo mensaje.
 */
export const enviarMensaje = async (conversationId, texto, idToken) => {
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ conversationId, texto }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error || 'No se pudo enviar el mensaje')
    error.ventanaCerrada = data.ventanaCerrada === true
    throw error
  }
  return data
}

/**
 * Marca la conversación como leída.
 *
 * OJO: las reglas de Firestore tienen la escritura CERRADA a propósito, así que
 * esto falla en silencio hasta que se abra el campo puntual. Se deja porque el
 * contador igual se limpia solo al responder (lo hace el servidor), y no vale
 * la pena abrir permisos de escritura antes de necesitarlos de verdad.
 */
export const marcarComoLeida = async (conversationId) => {
  try {
    await updateDoc(doc(db, 'whatsappConversations', conversationId), { sinLeer: 0 })
  } catch {
    // Silencio deliberado: ver el comentario de arriba.
  }
}

/** Milisegundos que le quedan a la ventana de 24 h (0 = cerrada). */
export const msRestantesDeVentana = (conversacion) => {
  const vence = conversacion?.ventanaVenceAt?.toMillis?.()
  if (!vence) return 0
  return Math.max(0, vence - Date.now())
}

/** "3 h 20 min" — cuánto queda para responder gratis. */
export const formatearRestante = (ms) => {
  if (ms <= 0) return 'cerrada'
  const horas = Math.floor(ms / 3600000)
  const minutos = Math.floor((ms % 3600000) / 60000)
  if (horas > 0) return `${horas} h ${minutos} min`
  return `${minutos} min`
}

/** El número tal como se lee en Perú: 51955778215 -> +51 955 778 215 */
export const formatearNumero = (waId) => {
  if (!waId) return ''
  const n = String(waId)
  if (n.startsWith('51') && n.length === 11) {
    return `+51 ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8)}`
  }
  return `+${n}`
}

/** Hora de un mensaje: hoy solo la hora, antes también el día. */
export const formatearHora = (timestamp) => {
  const d = timestamp?.toDate?.()
  if (!d) return ''
  const hoy = new Date()
  const mismoDia = d.toDateString() === hoy.toDateString()
  return mismoDia
    ? d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })
      + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}
