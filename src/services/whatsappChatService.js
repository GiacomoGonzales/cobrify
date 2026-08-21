import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  setDoc,
  startAt,
  endAt,
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

/** Tipos que se pueden adjuntar desde la bandeja. */
export const ADJUNTOS_ACEPTADOS = 'image/jpeg,image/png,image/webp,application/pdf'
export const ADJUNTO_MAX_BYTES = 10 * 1024 * 1024

const SEND_MEDIA_URL = import.meta.env.VITE_WHATSAPP_SEND_MEDIA_URL
  || 'https://us-central1-cobrify-395fe.cloudfunctions.net/sendWhatsappMediaMessage'

/**
 * Envía una imagen o un PDF. El archivo viaja en base64; el servidor lo
 * guarda en nuestro almacenamiento y se lo manda a Meta por URL — la misma
 * ruta que siguen los archivos recibidos, así el historial vive en un lugar.
 */
export const enviarArchivo = async (conversationId, file, caption, idToken) => {
  if (file.size > ADJUNTO_MAX_BYTES) {
    throw new Error('El archivo pasa de 10 MB')
  }
  const base64 = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = () => reject(new Error('No se pudo leer el archivo'))
    r.readAsDataURL(file)
  })
  const res = await fetch(SEND_MEDIA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      conversationId,
      base64,
      mimeType: file.type,
      filename: file.name,
      caption: caption || '',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error || 'No se pudo enviar el archivo')
    error.ventanaCerrada = data.ventanaCerrada === true
    throw error
  }
  return data
}

/** Marca la conversación como leída. */
export const marcarComoLeida = async (conversationId) => {
  try {
    await updateDoc(doc(db, 'whatsappConversations', conversationId), { sinLeer: 0 })
  } catch (error) {
    // No vale la pena molestar por esto: el contador también se limpia al responder.
    console.warn('No se pudo marcar como leída:', error)
  }
}

// =================== ORGANIZACIÓN (Fase 1) ===================
// Las reglas de Firestore solo permiten tocar estado, etiquetas, nota y
// sinLeer. Los mensajes siguen siendo territorio exclusivo del servidor.

/** Estados posibles de una conversación. Sin el campo se asume 'abierta'. */
export const ESTADOS = [
  { id: 'abierta', nombre: 'Abiertas' },
  { id: 'pendiente', nombre: 'Pendientes' },
  { id: 'completada', nombre: 'Completadas' },
]

export const estadoDe = (conversacion) => conversacion?.estado || 'abierta'

export const cambiarEstado = (conversationId, estado) =>
  updateDoc(doc(db, 'whatsappConversations', conversationId), {
    estado,
    updatedAt: serverTimestamp(),
  })

export const alternarEtiqueta = (conversationId, tagId, tiene) =>
  updateDoc(doc(db, 'whatsappConversations', conversationId), {
    etiquetas: tiene ? arrayRemove(tagId) : arrayUnion(tagId),
    updatedAt: serverTimestamp(),
  })

export const guardarNota = (conversationId, nota) =>
  updateDoc(doc(db, 'whatsappConversations', conversationId), {
    nota: nota || null,
    updatedAt: serverTimestamp(),
  })

// ---------- Catálogo de etiquetas ----------
// Un solo documento con la lista completa: son pocas y se editan juntas.

/** Las de fábrica. Se siembran la primera vez y después el admin las gobierna. */
export const ETIQUETAS_DE_FABRICA = [
  { id: 'lead', nombre: 'Lead', color: '#1B6E4A' },
  { id: 'reporte-error', nombre: 'Reporte de error', color: '#A3352C' },
  { id: 'capacitacion', nombre: 'Capacitación', color: '#26456E' },
  { id: 'por-renovar', nombre: 'Por renovar', color: '#96690F' },
  { id: 'no-respondio', nombre: 'No respondió', color: '#6B7280' },
  { id: 'facturacion', nombre: 'Facturación SUNAT', color: '#7C3AED' },
]

const etiquetasRef = () => doc(db, 'whatsappSettings', 'etiquetas')

export const suscribirEtiquetas = (onChange) =>
  onSnapshot(etiquetasRef(), (snap) => {
    if (snap.exists()) {
      onChange(snap.data().lista || [])
    } else {
      // Primera vez: sembrar las de fábrica para que existan de verdad y el
      // admin pueda editarlas, en vez de vivir solo en el código.
      setDoc(etiquetasRef(), { lista: ETIQUETAS_DE_FABRICA, updatedAt: serverTimestamp() })
        .catch((e) => console.error('No se pudo sembrar el catálogo de etiquetas:', e))
      onChange(ETIQUETAS_DE_FABRICA)
    }
  }, (error) => console.error('Error al leer las etiquetas:', error))

export const guardarEtiquetas = (lista) =>
  setDoc(etiquetasRef(), { lista, updatedAt: serverTimestamp() })

// =================== VINCULACION CON CLIENTES (Fase 2) ===================
// El webhook vincula solo por telefono; esto cubre la ficha, la correccion
// manual y la renovacion desde el chat.

/**
 * Ficha del cliente vinculado: suscripcion + datos del negocio, juntos.
 * Devuelve null si el negocio ya no existe.
 */
export const obtenerFichaCliente = async (businessId) => {
  const [subSnap, bizSnap] = await Promise.all([
    getDoc(doc(db, 'subscriptions', businessId)),
    getDoc(doc(db, 'businesses', businessId)),
  ])
  if (!subSnap.exists() && !bizSnap.exists()) return null
  const sub = subSnap.exists() ? subSnap.data() : {}
  const biz = bizSnap.exists() ? bizSnap.data() : {}
  const vence = sub.currentPeriodEnd?.toDate?.() || null
  const diasParaVencer = vence
    ? Math.ceil((vence.getTime() - Date.now()) / 86400000)
    : null
  return {
    businessId,
    nombre: biz.businessName || sub.businessName || null,
    ruc: biz.ruc || null,
    email: sub.email || biz.email || null,
    plan: sub.plan || null,
    planName: sub.planName || sub.plan || null,
    vence,
    diasParaVencer,
    renewalPrice: sub.renewalPrice ?? null,
    accessBlocked: sub.accessBlocked === true,
    // Los ultimos pagos, del mas reciente al mas viejo.
    pagos: [...(sub.paymentHistory || [])].reverse().slice(0, 3),
  }
}

/**
 * Buscar negocios por nombre (prefijo), para la vinculacion manual.
 * El que escribe desde otro numero sigue siendo cliente: el cruce por telefono
 * no lo ve, el admin si.
 */
export const buscarNegocios = async (texto) => {
  const t = texto.trim()
  if (t.length < 2) return []
  // La busqueda por prefijo de Firestore distingue mayusculas y los nombres
  // estan como cada negocio los escribio ("WATON CHIFA", "Kathya Castro").
  // Se prueba con las tres formas tipicas y se unen los resultados.
  const variantes = [...new Set([
    t,
    t.toUpperCase(),
    t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(),
  ])]
  const resultados = new Map()
  await Promise.all(variantes.map(async (v) => {
    const q = query(
      collection(db, 'businesses'),
      orderBy('businessName'),
      startAt(v),
      endAt(v + '\uf8ff'),
      limit(8),
    )
    const snap = await getDocs(q)
    for (const d of snap.docs) {
      resultados.set(d.id, {
        businessId: d.id,
        nombre: d.data().businessName || '(sin nombre)',
        ruc: d.data().ruc || null,
      })
    }
  }))
  return [...resultados.values()].slice(0, 10)
}

export const vincularConversacion = (conversationId, businessId, businessName) =>
  updateDoc(doc(db, 'whatsappConversations', conversationId), {
    linkedBusinessId: businessId,
    linkedBusinessName: businessName || null,
    linkedBy: 'manual',
    linkAttempted: true,
    updatedAt: serverTimestamp(),
  })

export const desvincularConversacion = (conversationId) =>
  updateDoc(doc(db, 'whatsappConversations', conversationId), {
    linkedBusinessId: null,
    linkedBusinessName: null,
    linkedBy: null,
    updatedAt: serverTimestamp(),
  })

/** Id legible a partir del nombre: "Cliente VIP" -> "cliente-vip" */
export const idParaEtiqueta = (nombre) =>
  nombre.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || `etiqueta-${Date.now()}`

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
