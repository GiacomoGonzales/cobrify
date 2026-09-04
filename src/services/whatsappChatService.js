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
  limitToLast,
  serverTimestamp,
  setDoc,
  startAt,
  endAt,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { metodoDeEmision } from '@/services/adminCuentasService'
import { nombreRubro } from '@/data/rubros'
import { nombreModo } from '@/utils/businessModes'

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

/** Cuantos mensajes se traen de una conversacion al abrirla. */
export const VENTANA_MENSAJES = 150

/**
 * Escucha los mensajes de una conversación, del más viejo al más nuevo (que es
 * el orden en que se leen).
 *
 * `limitToLast` y no `limit`: con el orden ascendente, `limit` se queda con los
 * mensajes MAS VIEJOS. Mientras un chat era corto no se notaba, pero pasados
 * los 500 mensajes la pantalla dejaba de mostrar los nuevos y se quedaba
 * clavada en historia vieja. Se pide el ULTIMO tramo, que es lo que uno abre a
 * leer, y ademas corto: 500 burbujas de golpe eran lo que hacia lenta la
 * primera apertura.
 */
export const suscribirMensajes = (conversationId, onChange, onError) => {
  const q = query(
    collection(db, 'whatsappConversations', conversationId, 'messages'),
    orderBy('timestamp', 'asc'),
    limitToLast(VENTANA_MENSAJES),
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
export const enviarMensaje = async (conversationId, texto, idToken, respondeA = null) => {
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    // `respondeA` es el id de WhatsApp del mensaje citado. El servidor se lo
    // pasa a Meta como contexto y ademas lo guarda, que es lo que permite
    // pintar el bloque de cita al recargar.
    body: JSON.stringify({ conversationId, texto, ...(respondeA ? { respondeA } : {}) }),
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
 * Tipos que se pueden adjuntar, con el tope de CADA UNO: WhatsApp usa límites
 * distintos (5 MB imagen, 16 MB video y audio, 100 MB documento). Saberlos acá
 * permite avisar antes de subir en vez de después.
 */
export const TIPOS_MEDIA = {
  'image/jpeg': { tipo: 'image', max: 5 * 1024 * 1024 },
  'image/png': { tipo: 'image', max: 5 * 1024 * 1024 },
  'image/webp': { tipo: 'image', max: 5 * 1024 * 1024 },
  'video/mp4': { tipo: 'video', max: 16 * 1024 * 1024 },
  'video/3gpp': { tipo: 'video', max: 16 * 1024 * 1024 },
  'audio/mpeg': { tipo: 'audio', max: 16 * 1024 * 1024 },
  'audio/ogg': { tipo: 'audio', max: 16 * 1024 * 1024 },
  'audio/mp4': { tipo: 'audio', max: 16 * 1024 * 1024 },
  'application/pdf': { tipo: 'document', max: 100 * 1024 * 1024 },
}
export const ADJUNTOS_ACEPTADOS = Object.keys(TIPOS_MEDIA).join(',')
export const NOMBRE_TIPO = { image: 'Imagen', video: 'Video', audio: 'Audio', document: 'Documento' }

/** null si el archivo sirve; si no, el motivo en castellano. */
export const validarArchivo = (file) => {
  const t = TIPOS_MEDIA[file.type]
  if (!t) return 'WhatsApp no admite ese tipo de archivo'
  if (file.size > t.max) {
    return `${NOMBRE_TIPO[t.tipo]}: el límite de WhatsApp es ${Math.round(t.max / 1024 / 1024)} MB`
  }
  return null
}

const aBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1])
  r.onerror = () => reject(new Error('No se pudo leer el archivo'))
  r.readAsDataURL(file)
})

const SEND_MEDIA_URL = import.meta.env.VITE_WHATSAPP_SEND_MEDIA_URL
  || 'https://us-central1-cobrify-395fe.cloudfunctions.net/sendWhatsappMediaMessage'

/**
 * Envía una imagen o un PDF. El archivo viaja en base64; el servidor lo
 * guarda en nuestro almacenamiento y se lo manda a Meta por URL — la misma
 * ruta que siguen los archivos recibidos, así el historial vive en un lugar.
 */
export const enviarArchivo = async (conversationId, file, caption, idToken, respondeA = null) => {
  const problema = validarArchivo(file)
  if (problema) throw new Error(problema)
  const base64 = await aBase64(file)
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
      ...(respondeA ? { respondeA } : {}),
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

/**
 * Envía un archivo que YA está guardado (el de una respuesta rápida): viaja
 * solo su dirección, no el archivo. Por eso mandar un video de 15 MB con un
 * atajo es instantáneo.
 */
export const enviarArchivoGuardado = async (conversationId, media, caption, idToken, respondeA = null) => {
  const res = await fetch(SEND_MEDIA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      conversationId,
      mediaUrl: media.url,
      mimeType: media.mimeType,
      filename: media.filename || null,
      caption: caption || '',
      ...(respondeA ? { respondeA } : {}),
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

/** Guarda un archivo en la biblioteca (una vez) y devuelve sus datos. */
export const subirArchivoBiblioteca = async (file, idToken) => {
  const problema = validarArchivo(file)
  if (problema) throw new Error(problema)
  const base64 = await aBase64(file)
  const r = await postConToken(FN('uploadWhatsappLibraryMedia'), {
    base64, mimeType: file.type, filename: file.name,
  }, idToken)
  return r.media
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
/** El nombre del rubro, o nada si la cuenta no tiene ninguno. */
const nombreDeRubro = (id) => (id ? nombreRubro(id) : null)

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
  const tope = sub.limits?.maxInvoicesPerMonth
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
    motivoBloqueo: sub.blockReason || null,
    bloqueadoEl: sub.blockedAt?.toDate?.() || null,
    // Comprobantes del mes: -1 (o sin tope) es ilimitado.
    emitidosEsteMes: sub.usage?.invoicesThisMonth ?? 0,
    topeComprobantes: tope === undefined || tope === null ? null : tope,
    // TODOS los pagos, del mas reciente al mas viejo. La pantalla decide
    // cuantos muestra: antes se cortaban en tres aca y no habia forma de ver
    // el resto sin salir al panel.
    pagos: [...(sub.paymentHistory || [])].reverse(),

    // ── Lo principal de la ficha del admin ──
    // No se copia todo: en 320 px de ancho, y con un cliente esperando del
    // otro lado, lo que sirve es saber quien es, a que se dedica, si puede
    // facturar y de quien es la cuenta. El resto se ve en el panel.
    codigoCliente: biz.codigoCliente || null,
    // El rubro CONFIRMADO manda; si no hay, vale la sugerencia.
    rubro: nombreDeRubro(biz.rubro || biz.rubroSugerido),
    rubroEsSugerido: !biz.rubro && !!biz.rubroSugerido,
    modo: nombreModo(biz.businessMode || 'retail'),
    ubicacion: [biz.department, biz.province].filter(Boolean).join(' · ') || null,
    telefono: biz.contactPhone || biz.phone || null,
    // Es LA pregunta de soporte: "no puedo facturar". Con esto se sabe si la
    // cuenta siquiera esta configurada para emitir, y por que via.
    emision: metodoDeEmision(biz),
    // De quien es la cuenta: reseller manda sobre vendedor, igual que en el panel.
    origen: sub.resellerId ? 'reseller' : (sub.vendedorId ? 'vendedor' : 'directo'),
    origenNombre: sub.resellerName || sub.vendedorName || null,
    alta: sub.createdAt?.toDate?.() || sub.startDate?.toDate?.() || null,
    // Lo que el equipo dejo escrito de esta cuenta.
    notasAdmin: sub.notasAdmin || '',
  }
}

/**
 * Suma 500 comprobantes al tope del mes. Es el complemento que se vende cuando
 * un cliente se queda corto sin querer cambiar de plan.
 *
 * Queda anotado como un pago mas, con `addonType`, para que el historial
 * muestre por que entro plata sin que haya cambiado el vencimiento.
 */
export const agregarComprobantes = async (businessId, monto, metodo, cuantos = 500) => {
  const ref = doc(db, 'subscriptions', businessId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('La suscripción no existe')
  const tope = snap.data().limits?.maxInvoicesPerMonth
  if (tope === undefined || tope === null || tope < 0) {
    throw new Error('Este plan ya tiene comprobantes ilimitados')
  }
  await updateDoc(ref, {
    'limits.maxInvoicesPerMonth': tope + cuantos,
    lastPaymentDate: serverTimestamp(),
    paymentHistory: arrayUnion({
      date: new Date().toISOString(),
      amount: Number(monto) || 0,
      method: metodo,
      plan: 'addon_500_comprobantes',
      planName: `+${cuantos} Comprobantes`,
      months: 0,
      addonType: 'invoices',
      addonAmount: cuantos,
      status: 'completed',
      registeredBy: 'admin',
    }),
    updatedAt: serverTimestamp(),
  })
  return tope + cuantos
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

// =================== PLANTILLAS Y CAMPAÑAS (Fase 4) ===================
// Fuera de la ventana de 24 horas solo se puede escribir con una plantilla
// aprobada por Meta. El catálogo vive en whatsappSettings/plantillas y lo
// actualiza el servidor (sincronizarPlantillas); acá solo se lee y se envía.

const FN = (nombre) => `https://us-central1-cobrify-395fe.cloudfunctions.net/${nombre}`

const postConToken = async (url, cuerpo, idToken) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(cuerpo),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'La operación falló')
  return data
}

// =================== REACCIONAR Y AVISAR QUE SE LEYO ===================
// Las dos funciones existen en el servidor desde que se hizo la app de iPhone.
// La web no las usaba: reaccionaba el cliente y aca no se veia nada, y el
// cliente nunca veia sus palomitas azules aunque uno hubiera leido el mensaje.

/** Los cuatro de siempre, los que entran en una fila sin apretarse. */
export const EMOJIS_REACCION = ['❤️', '👍', '😂', '🙏']

/**
 * Reacciona a un mensaje. Un emoji vacio QUITA la reaccion, que es como lo
 * entiende Meta: no hay una llamada aparte para borrarla.
 */
export const reaccionar = (conversationId, waMessageId, emoji, idToken) =>
  postConToken(FN('sendWhatsappReactionFn'), { conversationId, waMessageId, emoji }, idToken)

/**
 * Le avisa a WhatsApp que leiste el mensaje: es lo que le pinta al cliente las
 * dos palomitas azules.
 *
 * Falla en silencio a proposito. Que el aviso no salga es molesto; que reviente
 * la pantalla por eso seria peor, y no hay nada que el usuario pueda hacer.
 */
export const avisarLeido = async (conversationId, waMessageId, idToken) => {
  try {
    await postConToken(FN('markWhatsappRead'), { conversationId, waMessageId }, idToken)
  } catch (e) {
    console.warn('No se pudo avisar que se leyo:', e.message)
  }
}

export const suscribirPlantillas = (onChange) =>
  onSnapshot(doc(db, 'whatsappSettings', 'plantillas'), (snap) => {
    onChange(snap.exists() ? (snap.data().lista || []) : [], snap.data()?.syncedAt?.toDate?.() || null)
  }, (e) => console.error('Error leyendo plantillas:', e))

export const sincronizarPlantillas = (idToken) =>
  postConToken(FN('syncWhatsappTemplates'), {}, idToken)

export const enviarPlantilla = (conversationId, plantilla, valores, idToken) =>
  postConToken(FN('sendWhatsappTemplateMessage'), {
    conversationId,
    templateName: plantilla.name,
    language: plantilla.language,
    bodyValues: valores.body || [],
    headerText: valores.headerText || null,
    headerImageUrl: valores.headerImageUrl || null,
  }, idToken)

export const enviarCampana = (conversationIds, plantilla, valores, titulo, idToken) =>
  postConToken(FN('sendWhatsappCampaign'), {
    conversationIds,
    templateName: plantilla.name,
    language: plantilla.language,
    bodyValues: valores.body || [],
    headerText: valores.headerText || null,
    headerImageUrl: valores.headerImageUrl || null,
    titulo,
  }, idToken)

export const suscribirCampana = (campaignId, onChange) =>
  onSnapshot(doc(db, 'whatsappCampaigns', campaignId), (snap) => {
    if (snap.exists()) onChange({ id: snap.id, ...snap.data() })
  })

/** Revertir una baja voluntaria marcada por error. */
export const revertirBaja = (conversationId) =>
  updateDoc(doc(db, 'whatsappConversations', conversationId), {
    optOut: false,
    updatedAt: serverTimestamp(),
  })

/** Cuántos {{n}} pide el cuerpo de una plantilla. */
export const variablesDelCuerpo = (plantilla) => {
  const body = (plantilla?.components || []).find((c) => c.type === 'BODY')
  const nums = [...String(body?.text || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
  return nums.length ? Math.max(...nums) : 0
}

/** Qué cabecera tiene la plantilla: null, 'TEXT' (con o sin variable) o 'IMAGE'. */
export const cabeceraDe = (plantilla) => {
  const h = (plantilla?.components || []).find((c) => c.type === 'HEADER')
  if (!h) return null
  return { formato: h.format, conVariable: h.format === 'TEXT' && /\{\{1\}\}/.test(h.text || ''), texto: h.text || null }
}

/** Texto final con los valores puestos, para la vista previa. */
export const previsualizarPlantilla = (plantilla, valores) => {
  const partes = []
  for (const c of plantilla?.components || []) {
    if (c.type === 'HEADER' && c.format === 'TEXT' && c.text) {
      partes.push(valores.headerText ? c.text.replace('{{1}}', valores.headerText) : c.text)
    } else if (c.type === 'BODY' && c.text) {
      let t = c.text
      ;(valores.body || []).forEach((v, i) => { t = t.split(`{{${i + 1}}}`).join(v || `{{${i + 1}}}`) })
      partes.push(t)
    } else if (c.type === 'FOOTER' && c.text) {
      partes.push(c.text)
    }
  }
  return partes.join('\n\n')
}

// =================== CONFIGURACIÓN: perfil, automáticos, respuestas rápidas (Fase 5) ===================

export const obtenerPerfil = (idToken) => postConToken(FN('getWhatsappProfile'), {}, idToken)

/** campos: {about, description, address, email, websites[], vertical}; foto opcional (File JPG/PNG). */
export const guardarPerfil = async (campos, foto, idToken) => {
  let fotoBase64 = null
  let fotoMime = null
  if (foto) {
    fotoMime = foto.type
    fotoBase64 = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1])
      r.onerror = () => reject(new Error('No se pudo leer la foto'))
      r.readAsDataURL(foto)
    })
  }
  return postConToken(FN('updateWhatsappProfile'), { campos, fotoBase64, fotoMime }, idToken)
}

/** Rubros que acepta Meta para el perfil. */
export const RUBROS = [
  ['', 'Sin especificar'], ['PROF_SERVICES', 'Servicios profesionales'], ['RETAIL', 'Comercio minorista'],
  ['RESTAURANT', 'Restaurante'], ['OTHER', 'Otro'], ['AUTO', 'Automotriz'], ['BEAUTY', 'Belleza y cuidado'],
  ['APPAREL', 'Ropa y accesorios'], ['EDU', 'Educación'], ['ENTERTAIN', 'Entretenimiento'],
  ['EVENT_PLAN', 'Eventos'], ['FINANCE', 'Finanzas'], ['GROCERY', 'Abarrotes'], ['GOVT', 'Gobierno'],
  ['HOTEL', 'Hotelería'], ['HEALTH', 'Salud'], ['NONPROFIT', 'Sin fines de lucro'], ['TRAVEL', 'Viajes'],
  ['NOT_A_BIZ', 'No es un negocio'],
]

/** Configuración de automáticos y respuestas rápidas: un solo documento. */
const automaticosRef = () => doc(db, 'whatsappSettings', 'automaticos')

export const CONFIG_AUTOMATICOS_DEFAULT = {
  bienvenida: {
    activa: false,
    texto: 'Hola {nombre}, gracias por escribir a Cobrify. En breve te atendemos.',
  },
  ausencia: {
    activa: false,
    texto: 'Hola, gracias por tu mensaje. Nuestro horario de atención es de lunes a viernes de 9:00 a 18:00. Te respondemos apenas estemos de vuelta.',
    horario: { dias: [1, 2, 3, 4, 5], desde: '09:00', hasta: '18:00' },
  },
  respuestasRapidas: [],
}

export const suscribirAutomaticos = (onChange) =>
  onSnapshot(automaticosRef(), (snap) => {
    onChange(snap.exists() ? { ...CONFIG_AUTOMATICOS_DEFAULT, ...snap.data() } : CONFIG_AUTOMATICOS_DEFAULT)
  }, (e) => console.error('Error leyendo automáticos:', e))

export const guardarAutomaticos = (cfg) =>
  setDoc(automaticosRef(), { ...cfg, updatedAt: serverTimestamp() }, { merge: true })

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

/** "Hoy", "Ayer" o "jueves 28 de agosto" — el rotulo que separa los dias. */
export const formatearDia = (timestamp) => {
  const d = timestamp?.toDate?.()
  if (!d) return ''
  const hoy = new Date()
  const ayer = new Date(hoy)
  ayer.setDate(ayer.getDate() - 1)
  if (d.toDateString() === hoy.toDateString()) return 'Hoy'
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  const texto = d.toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(d.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}),
  })
  // El locale mete una coma tras el dia de la semana ("Jueves, 27 de agosto");
  // en un separador de chat sobra.
  const limpio = texto.replace(',', '')
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/** Clave de dia, para saber donde cortar sin comparar textos. */
export const claveDeDia = (timestamp) => {
  const d = timestamp?.toDate?.()
  if (!d) return ''
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
