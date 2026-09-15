// "Registro de huéspedes": el huésped llena el registro de su estadía desde un
// enlace, sin cuenta y sin login. Pedido de San Ignacio Bamboo Lodge
// (15-set-2026), que lo hacía con un formulario de Google por cabaña.
//
// El secreto es el TOKEN de la reserva (publicToken), el mismo de "Mi reserva":
// las reservas del catálogo ya lo traen y Reservas lo genera para las que crea
// el hotel al mandar el enlace. Se devuelve y se guarda SOLO lo de esa reserva.
//
// La validación está ESPEJADA en src/utils/registroDeHuespedes.js (las
// funciones no importan del front); una prueba compara las dos.

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { sendPushNotification } from '../notifications/sendPushNotification.js'

const conCors = (res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
}

// Mientras el huésped no se fue, puede llenar o corregir su registro.
const ESTADOS_EDITABLES = ['requested', 'confirmed', 'checked_in', 'rescheduled']

// ===== Espejo de src/utils/registroDeHuespedes.js =====
const MAX_HUESPEDES = 4
const MOTIVOS_DE_VIAJE = ['Vacaciones', 'Trabajo', 'Otro']
const TIPOS_DE_DOCUMENTO = ['DNI', 'CE', 'Pasaporte']
const texto = (v, max = 80) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
const mayusculas = (v, max) => texto(v, max).toLocaleUpperCase('es-PE')
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))
const esHora = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''))
const hoyEnLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const DOCUMENTO_VALIDO = {
  DNI: (n) => /^\d{8}$/.test(n),
  CE: (n) => /^[A-Z0-9]{6,12}$/.test(n),
  Pasaporte: (n) => /^[A-Z0-9]{5,15}$/.test(n),
}

export function normalizarRegistro(entrada = {}, { hoy = hoyEnLima() } = {}) {
  const falla = (problema) => ({ problema, registro: null })
  const horaLlegada = String(entrada?.horaLlegada || '')
  if (!esHora(horaLlegada)) return falla('Indica la hora de llegada')
  const motivoViaje = String(entrada?.motivoViaje || '')
  if (!MOTIVOS_DE_VIAJE.includes(motivoViaje)) return falla('Elige el motivo del viaje')
  const menores = Math.floor(Number(entrada?.menores) || 0)
  if (menores < 0 || menores > MAX_HUESPEDES - 1) return falla('Revisa cuántos menores de edad vienen')

  const lista = Array.isArray(entrada?.huespedes) ? entrada.huespedes.slice(0, MAX_HUESPEDES) : []
  const huespedes = []
  for (let i = 0; i < lista.length; i++) {
    const h = lista[i] || {}
    const titular = i === 0
    const de = titular ? 'del titular' : `del huésped ${i + 1}`
    const limpio = {
      nombres: mayusculas(h.nombres, 60),
      apellidos: mayusculas(h.apellidos, 60),
      tipoDocumento: TIPOS_DE_DOCUMENTO.includes(h.tipoDocumento) ? h.tipoDocumento : 'DNI',
      documento: texto(h.documento, 20).replace(/[\s.-]/g, '').toUpperCase(),
      sexo: h.sexo === 'F' || h.sexo === 'M' ? h.sexo : '',
      fechaNacimiento: esFecha(h.fechaNacimiento) ? h.fechaNacimiento : '',
      pais: mayusculas(h.pais, 40),
      ciudad: mayusculas(h.ciudad, 60),
      celular: titular ? texto(h.celular, 20).replace(/[^\d+]/g, '') : '',
      correo: titular ? texto(h.correo, 80).toLowerCase() : '',
    }
    if (!titular && !limpio.nombres && !limpio.apellidos && !limpio.documento) continue
    if (!limpio.nombres || !limpio.apellidos) return falla(`Escribe los nombres y apellidos ${de}`)
    if (!limpio.documento) return falla(`Escribe el documento ${de}`)
    if (!DOCUMENTO_VALIDO[limpio.tipoDocumento](limpio.documento)) {
      return falla(limpio.tipoDocumento === 'DNI' ? `El DNI ${de} tiene 8 dígitos` : `Revisa el documento ${de}`)
    }
    if (!limpio.fechaNacimiento) return falla(`Indica la fecha de nacimiento ${de}`)
    if (limpio.fechaNacimiento > hoy || limpio.fechaNacimiento < '1900-01-01') return falla(`Revisa la fecha de nacimiento ${de}`)
    if (titular) {
      if (!limpio.sexo) return falla('Indica el sexo del titular')
      if (!limpio.pais || !limpio.ciudad) return falla('Indica el país y la ciudad del titular')
      if (limpio.celular && limpio.celular.replace(/\D/g, '').length < 6) return falla('Revisa el celular del titular')
      if (limpio.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio.correo)) return falla('Revisa el correo del titular')
    }
    huespedes.push(limpio)
  }
  if (huespedes.length === 0) return falla('Registra al menos al titular de la reserva')
  return { problema: '', registro: { horaLlegada, motivoViaje, menores, huespedes } }
}
// ===== Fin del espejo =====

const enlaceValido = (businessId, token) =>
  !!businessId && businessId.length <= 60 && token.length >= 16 && token.length <= 64

const buscarReserva = async (db, businessId, token) => {
  const snap = await db.collection(`businesses/${businessId}/hotelReservations`)
    .where('publicToken', '==', token).limit(1).get()
  return snap.empty ? null : { ref: snap.docs[0].ref, data: snap.docs[0].data() }
}

const registroParaDevolver = (registro) => {
  if (!registro || !Array.isArray(registro.huespedes)) return null
  const { registradoAt, ...resto } = registro
  return { ...resto, registradoAt: registradoAt?.toDate ? registradoAt.toDate().toISOString() : null }
}

/** La reserva y su registro, para la página pública. */
export const getPublicGuestRegistry = onRequest(
  { cors: true, region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    conCors(res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    try {
      const businessId = String(req.query.businessId || '')
      const token = String(req.query.token || '')
      if (!enlaceValido(businessId, token)) { res.status(400).json({ error: 'Enlace inválido' }); return }
      const db = getFirestore()
      const hit = await buscarReserva(db, businessId, token)
      if (!hit) { res.status(404).json({ error: 'No encontramos esta reserva. Revisa el enlace.' }); return }

      const bizSnap = await db.collection('businesses').doc(businessId).get()
      const biz = bizSnap.exists ? bizSnap.data() : {}
      const logo = String(biz.logoUrl || '')
      const d = hit.data
      res.status(200).json({
        negocio: {
          nombre: biz.name || biz.businessName || '',
          telefono: biz.phone || biz.catalogWhatsapp || '',
          logo: logo.startsWith('data:') ? '' : logo,
        },
        reserva: {
          status: d.status,
          habitacion: d.roomName || d.roomNumber || '',
          checkIn: d.checkInDate || d.checkIn || '',
          checkOut: d.checkOutDate || d.checkOut || '',
          noches: Number(d.nights) || 0,
          huespedes: Number(d.guests) || 1,
          tarifaPorNoche: Number(d.ratePerNight) || 0,
          titular: d.guestName || '',
        },
        registro: registroParaDevolver(d.registroHuespedes),
        puedeEditar: ESTADOS_EDITABLES.includes(d.status),
      })
    } catch (error) {
      console.error('getPublicGuestRegistry:', error)
      res.status(500).json({ error: 'Error al consultar la reserva' })
    }
  }
)

/** Guarda el registro que envía el huésped. Avisa al hotel la primera vez. */
export const savePublicGuestRegistry = onRequest(
  { cors: true, region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    conCors(res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return }
    try {
      const b = req.body || {}
      const businessId = String(b.businessId || '')
      const token = String(b.token || '')
      if (!enlaceValido(businessId, token)) { res.status(400).json({ error: 'Enlace inválido' }); return }
      if (JSON.stringify(b.registro || {}).length > 20000) { res.status(413).json({ error: 'El registro es demasiado grande' }); return }

      const db = getFirestore()
      const hit = await buscarReserva(db, businessId, token)
      if (!hit) { res.status(404).json({ error: 'No encontramos esta reserva.' }); return }
      if (!ESTADOS_EDITABLES.includes(hit.data.status)) {
        res.status(409).json({ error: 'Esta reserva ya no admite cambios en el registro. Escríbele al hospedaje.' }); return
      }

      const { problema, registro } = normalizarRegistro(b.registro)
      if (problema) { res.status(400).json({ error: problema }); return }

      const primeraVez = !(hit.data.registroHuespedes?.huespedes?.length > 0)
      await hit.ref.update({
        registroHuespedes: { ...registro, registradoPor: 'huesped', registradoAt: Timestamp.now() },
        updatedAt: Timestamp.now(),
      })

      if (primeraVez) {
        try {
          const bizSnap = await db.collection('businesses').doc(businessId).get()
          const ownerId = bizSnap.exists ? (bizSnap.data().ownerId || businessId) : businessId
          const t = registro.huespedes[0]
          const d = hit.data
          const cabana = d.roomName || d.roomNumber || 'su habitación'
          const title = 'Registro de huéspedes completado'
          const body = `${t.nombres} ${t.apellidos} registró ${registro.huespedes.length} huésped${registro.huespedes.length === 1 ? '' : 'es'} de ${cabana} (${d.checkInDate || d.checkIn} al ${d.checkOutDate || d.checkOut}).`
          await sendPushNotification(ownerId, title, body, { type: 'guest_registry', businessId })
          await db.collection('notifications').add({
            userId: ownerId,
            type: 'guest_registry',
            title,
            message: body,
            metadata: { businessId },
            read: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        } catch (err) {
          // El aviso es cortesía: el registro ya quedó guardado.
          console.error('savePublicGuestRegistry: aviso fallido:', err)
        }
      }

      console.log(`🧾 Registro de huéspedes: ${businessId} (${registro.huespedes.length})`)
      res.status(200).json({ success: true })
    } catch (error) {
      console.error('savePublicGuestRegistry:', error)
      res.status(500).json({ error: 'No se pudo guardar el registro' })
    }
  }
)
