// Reservas de citas desde el catálogo público — Fase 0 del plan.
//
// El catálogo NO toca Firestore para esto, ni leyendo ni escribiendo. Las dos
// razones están en las citas mismas:
//
//  - PRIVACIDAD. Para pintar libre/ocupado hay que saber qué horas están
//    tomadas, pero las citas traen nombres, teléfonos y mascotas, y las reglas
//    de Firestore no filtran campos: abrir lectura pública regalaría la
//    cartera de clientes del negocio. Acá el Admin SDK lee todo y devuelve
//    SOLO horas.
//
//  - DOBLE RESERVA. Dos desconocidos eligiendo el mismo hueco a la vez es
//    cuestión de tiempo. La creación corre en una transacción contra un
//    documento-candado por hueco (publicAgendaSlots/{fecha_hora}): el segundo
//    choca y recibe "esa hora ya se ocupó". Una consulta con query no sirve de
//    candado — Firestore no detecta el conflicto de dos transacciones que
//    leyeron la misma query vacía y escribieron docs NUEVOS (fantasmas).
//
// El negocio, en cambio, sigue pudiendo sobre-agendar a mano: su agenda avisa
// pero no bloquea, y esa es una decisión del dueño. El candado aplica solo a
// los desconocidos del catálogo.
//
// Zona horaria: las funciones corren en UTC y el negocio vive en Lima. Todas
// las fechas se construyen con el offset explícito -05:00 (Perú no tiene
// horario de verano). Sin esto, una cita de las 09:00 se guardaría a las
// 04:00 del día anterior.

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'

const LIMA = '-05:00'
const ESTADOS_ACTIVOS = ['scheduled', 'confirmed', 'in_progress']

/** 'HH:MM' en hora de Lima de un Timestamp/Date. */
const horaLima = (ts) => {
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('es-PE', {
    timeZone: 'America/Lima', hour12: false, hour: '2-digit', minute: '2-digit',
  })
}

/** Configuración pública de la agenda, con defaults seguros. */
const configDe = (business) => {
  const c = business.appointmentsBooking || {}
  return {
    enabled: c.enabled === true,
    days: Array.isArray(c.days) && c.days.length ? c.days : [1, 2, 3, 4, 5, 6],
    startHour: Number.isFinite(Number(c.startHour)) ? Number(c.startHour) : 9,
    endHour: Number.isFinite(Number(c.endHour)) ? Number(c.endHour) : 19,
    stepMinutes: [15, 20, 30, 60].includes(Number(c.stepMinutes)) ? Number(c.stepMinutes) : 30,
  }
}

/** ¿Este negocio puede recibir reservas públicas? Devuelve {ok, business, config} o {error}. */
const validarNegocio = async (db, businessId) => {
  if (!businessId || typeof businessId !== 'string' || businessId.length > 60) {
    return { error: { code: 400, msg: 'businessId inválido' } }
  }
  const snap = await db.collection('businesses').doc(businessId).get()
  if (!snap.exists) return { error: { code: 404, msg: 'Negocio no encontrado' } }
  const business = snap.data()
  const config = configDe(business)
  // El modo se re-valida en el servidor aunque la UI ya lo filtre: el front
  // nunca es la fuente de verdad de quién puede recibir reservas.
  // Mismo criterio que atiendeConCita() en src/utils/businessModes.js: la
  // function no puede importarlo, asi que si cambia alla, cambia aca.
  const modoConAgenda = business.businessMode === 'veterinary'
    || business.businessMode === 'clinic'
    || (business.businessMode === 'retail' && business.appointmentsEnabled === true)
  if (!config.enabled || !modoConAgenda) {
    return { error: { code: 403, msg: 'Este negocio no recibe reservas por el catálogo' } }
  }
  return { ok: true, business, config }
}

/** Citas activas de un día (hora Lima), leídas con Admin SDK. */
const citasDelDia = async (db, businessId, date) => {
  const ini = Timestamp.fromDate(new Date(`${date}T00:00:00${LIMA}`))
  const fin = Timestamp.fromDate(new Date(`${date}T23:59:59${LIMA}`))
  const snap = await db.collection(`businesses/${businessId}/appointments`)
    .where('scheduledDate', '>=', ini)
    .where('scheduledDate', '<=', fin)
    .get()
  return snap.docs
    .map((d) => d.data())
    .filter((a) => ESTADOS_ACTIVOS.includes(a.status))
}

const conCors = (res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
}

/**
 * Disponibilidad de un día: configuración del horario + horas ocupadas.
 * Devuelve SOLO horas — ni un dato personal sale de acá.
 */
export const getPublicAgenda = onRequest(
  { cors: true, region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    conCors(res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    try {
      const businessId = String(req.query.businessId || req.body?.businessId || '')
      const date = String(req.query.date || req.body?.date || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: 'Fecha inválida' }); return
      }
      const db = getFirestore()
      const v = await validarNegocio(db, businessId)
      if (v.error) { res.status(v.error.code).json({ error: v.error.msg }); return }

      // Profesional (opcional): si el negocio publica varios, la agenda es
      // POR PROFESIONAL — con dos doctores, las 10:00 pueden estar libres con
      // uno y ocupadas con el otro. Sin profesional pedido, ocupa cualquier
      // cita del negocio (comportamiento de siempre).
      const staffId = String(req.query.staffId || req.body?.staffId || '').slice(0, 60)
      const catalogoStaff = Array.isArray(v.business.appointmentsBooking?.staff)
        ? v.business.appointmentsBooking.staff
        : []
      const staffValido = staffId && catalogoStaff.some((x) => x && x.id === staffId)

      const citas = await citasDelDia(db, businessId, date)
      const delProfesional = staffValido
        ? citas.filter((a) => (a.staffId || '') === staffId)
        : citas
      // Set para no repetir: dos citas del negocio a la misma hora son UNA
      // hora ocupada para el público. Una cita con duración (la suma de lo
      // que duran sus servicios) ocupa también los huecos siguientes.
      const paso = v.config.stepMinutes
      const aHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
      const ocupadas = new Set()
      for (const a of delProfesional) {
        const inicio = horaLima(a.scheduledDate)
        ocupadas.add(inicio)
        const dur = Number(a.duration) || 0
        if (dur <= paso) continue
        const [h, m] = inicio.split(':').map(Number)
        const desde = h * 60 + m
        for (let s = desde - (desde % paso) + paso; s < desde + dur; s += paso) ocupadas.add(aHHMM(s))
      }
      const busy = [...ocupadas].sort()

      res.status(200).json({ date, config: v.config, busy })
    } catch (error) {
      console.error('getPublicAgenda:', error)
      res.status(500).json({ error: 'Error al consultar la disponibilidad' })
    }
  }
)

/**
 * Crear la cita. Valida horario, candadea el hueco y limita por teléfono.
 */
export const bookPublicAppointment = onRequest(
  { cors: true, region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    conCors(res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return }
    try {
      const b = req.body || {}
      const businessId = String(b.businessId || '')
      const date = String(b.date || '')
      const time = String(b.time || '')
      const nombre = String(b.name || '').trim().slice(0, 80)
      const telefono = String(b.phone || '').replace(/\D/g, '').slice(0, 15)
      const mascota = String(b.petName || '').trim().slice(0, 60)
      const serviceId = String(b.serviceId || '').slice(0, 60)
      const staffId = String(b.staffId || '').slice(0, 60)
      const servicioLibre = String(b.serviceName || '').trim().slice(0, 120)
      const nota = String(b.notes || '').trim().slice(0, 300)

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        res.status(400).json({ error: 'Fecha u hora inválida' }); return
      }
      if (nombre.length < 3) { res.status(400).json({ error: 'Escribe tu nombre completo' }); return }
      if (telefono.length < 7) { res.status(400).json({ error: 'Escribe un teléfono válido' }); return }

      const db = getFirestore()
      const v = await validarNegocio(db, businessId)
      if (v.error) { res.status(v.error.code).json({ error: v.error.msg }); return }
      const { config } = v

      // El servicio se resuelve contra la CONFIGURACION del negocio, no contra
      // lo que mande el cliente: el nombre y el precio que quedan en la cita
      // son los que el negocio publico, asi nadie reserva un "Baño a S/1".
      // Si el negocio no configuro servicios, se acepta texto libre (sin
      // precio) como antes.
      const catalogoServicios = Array.isArray(v.business.appointmentsBooking?.services)
        ? v.business.appointmentsBooking.services
        : []
      let servicioElegido = null
      if (catalogoServicios.length > 0) {
        servicioElegido = catalogoServicios.find((x) => x && x.id === serviceId) || null
        if (!servicioElegido) {
          res.status(400).json({ error: 'Elige uno de los servicios disponibles' }); return
        }
      }

      // Duración del servicio (ficha del producto): la cita ocupa sus huecos
      // en la agenda del negocio. Sin ficha o sin duración, un solo turno.
      let duracion = null
      if (servicioElegido?.id) {
        try {
          const prod = await db.doc(`businesses/${businessId}/products/${servicioElegido.id}`).get()
          const d = Number(prod.exists ? prod.data().duration : 0)
          if (d > 0) duracion = d
        } catch (e) { /* sin duración: un turno */ }
      }

      // El hueco tiene que ser uno que el negocio ofrece: día abierto, dentro
      // del horario y alineado al paso. Sin esto, un curl reservaría a las
      // 03:17 de un domingo.
      const slot = new Date(`${date}T${time}:00${LIMA}`)
      const [hh, mm] = time.split(':').map(Number)
      // El día de semana sale de la FECHA CALENDARIO, no del instante: una
      // cita de las 20:00 Lima ya es el día UTC siguiente, y getUTCDay() del
      // slot diría martes cuando el cliente eligió lunes. Mediodía UTC de esa
      // fecha da siempre el día correcto.
      const diaLima = new Date(`${date}T12:00:00Z`).getUTCDay()
      const minutos = hh * 60 + mm
      if (!config.days.includes(diaLima)
        || minutos < config.startHour * 60
        || minutos >= config.endHour * 60
        || minutos % config.stepMinutes !== 0) {
        res.status(400).json({ error: 'Esa hora no está disponible para reservas' }); return
      }
      // Con media hora de anticipación como mínimo: una reserva "para ahora
      // mismo" le llega al negocio cuando el cliente ya está en la puerta.
      if (slot.getTime() < Date.now() + 30 * 60 * 1000) {
        res.status(400).json({ error: 'Elige una hora con más anticipación' }); return
      }

      // Tope por teléfono: 3 citas futuras sin atender. Frena al que llenaría
      // la agenda por deporte sin molestar a un cliente real. La query es por
      // un solo campo a propósito — sumar el rango de fecha exigiría un índice
      // compuesto y esto se filtra igual de bien en memoria (son pocas).
      const previas = await db.collection(`businesses/${businessId}/appointments`)
        .where('phone', '==', telefono).limit(40).get()
      const pendientes = previas.docs.map((d) => d.data()).filter((a) =>
        a.source === 'catalog'
        && ESTADOS_ACTIVOS.includes(a.status)
        && a.scheduledDate?.toDate?.() > new Date()
      )
      if (pendientes.length >= 3) {
        res.status(429).json({ error: 'Ya tienes varias citas pendientes con este teléfono. Contáctanos para agendar otra.' }); return
      }

      // ¿El negocio ya tiene una cita propia a esa hora? Las suyas no usan
      // candado (puede sobre-agendarse a propósito), así que se miran aparte.
      // Igualdad por un solo campo: sin índice compuesto.
      const mismas = await db.collection(`businesses/${businessId}/appointments`)
        .where('scheduledDate', '==', Timestamp.fromDate(slot)).get()
      // Con profesionales, solo choca lo de ESE profesional; sin ellos,
      // cualquier cita del negocio a esa hora.
      const chocan = mismas.docs.filter((d) => {
        if (!ESTADOS_ACTIVOS.includes(d.data().status)) return false
        if (!staffId) return true
        return (d.data().staffId || '') === staffId
      })
      if (chocan.length > 0) {
        res.status(409).json({ error: 'Esa hora acaba de ocuparse. Elige otra.' }); return
      }

      // Candado + cita, atómicos. El candado es un doc con id determinista por
      // hueco: el segundo create del mismo hueco entra a la transacción, ve el
      // candado vivo y sale. Si la cita del candado fue cancelada, el hueco se
      // puede volver a tomar (el candado se pisa, no se borra al cancelar).
      // Token del enlace "mi reserva": es el secreto con el que el cliente
      // consulta y cancela su cita sin cuenta. URL-safe, 24 chars.
      const publicToken = randomBytes(18).toString('base64url')

      // Profesional: el nombre lo pone el SERVIDOR desde la configuracion,
      // igual que el servicio. Si el negocio publica profesionales, elegir uno
      // es obligatorio; si no publica ninguno, el campo se ignora.
      const catalogoStaff = Array.isArray(v.business.appointmentsBooking?.staff)
        ? v.business.appointmentsBooking.staff.filter((x) => x && x.id && x.name)
        : []
      let profesional = null
      if (catalogoStaff.length > 0) {
        profesional = catalogoStaff.find((x) => x.id === staffId) || null
        if (!profesional) {
          res.status(400).json({ error: 'Elige con quién quieres tu cita' }); return
        }
      }

      // El candado es por hueco Y profesional: con dos doctores, dos clientes
      // pueden tomar las 10:00 con cada uno sin pisarse.
      const lockId = profesional
        ? `${date}_${time.replace(':', '-')}_${profesional.id}`
        : `${date}_${time.replace(':', '-')}`
      const lockRef = db.doc(`businesses/${businessId}/publicAgendaSlots/${lockId}`)
      const apptRef = db.collection(`businesses/${businessId}/appointments`).doc()

      const nuevaCita = {
        customerId: null,
        customerName: nombre,
        phone: telefono,
        petName: mascota,
        petSpecies: '',
        serviceName: servicioElegido
          ? String(servicioElegido.name || '').slice(0, 120)
          : (servicioLibre || 'Reserva desde el catálogo'),
        servicePrice: servicioElegido ? (Number(servicioElegido.price) || 0) : 0,
        // Mismo formato services[] que el walk-in de la agenda: el POS consume
        // ese array al Finalizar y Cobrar (un item de carrito por servicio).
        services: servicioElegido
          ? [{ name: String(servicioElegido.name || '').slice(0, 120), price: Number(servicioElegido.price) || 0 }]
          : [],
        staffId: profesional ? profesional.id : '',
        staffName: profesional ? String(profesional.name || '').slice(0, 80) : '',
        ...(duracion ? { duration: duracion } : {}),
        scheduledDate: Timestamp.fromDate(slot),
        scheduledTime: time,
        status: 'scheduled',
        // El catálogo público no pregunta por local (no tiene dónde: los
        // horarios y servicios de reserva son uno solo por negocio), así que
        // la reserva cae en la Principal, igual que cualquier cita sin
        // sucursal. Ver src/utils/branchScope.js.
        branchId: '',
        source: 'catalog',
        publicToken,
        notes: nota,
        createdAt: Timestamp.now(),
      }

      await db.runTransaction(async (t) => {
        const lock = await t.get(lockRef)
        if (lock.exists) {
          const prev = await t.get(db.doc(`businesses/${businessId}/appointments/${lock.data().appointmentId}`))
          if (prev.exists && ESTADOS_ACTIVOS.includes(prev.data().status)) {
            const e = new Error('SLOT_TAKEN'); e.slotTaken = true; throw e
          }
        }
        t.set(apptRef, nuevaCita)
        t.set(lockRef, { appointmentId: apptRef.id, date, time, staffId: profesional ? profesional.id : '', createdAt: FieldValue.serverTimestamp() })
      })

      console.log(`📅 Reserva pública creada: ${businessId} ${date} ${time} (${nombre})`)
      res.status(200).json({ success: true, appointmentId: apptRef.id, date, time, token: publicToken })
    } catch (error) {
      if (error?.slotTaken) {
        res.status(409).json({ error: 'Esa hora acaba de ocuparse. Elige otra.' }); return
      }
      console.error('bookPublicAppointment:', error)
      res.status(500).json({ error: 'No se pudo crear la reserva' })
    }
  }
)
