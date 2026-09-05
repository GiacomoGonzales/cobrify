/**
 * La ficha de atención contra Firestore: agendar los próximos controles que
 * se escriben en la ficha. La FORMA de cada atención sale de
 * src/utils/fichaAtencion.js; acá solo hay lecturas y escrituras.
 */
import { doc, getDoc, collection, query, where, limit, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { updateCustomer, createCustomer } from './firestoreService'
import { createAppointment, updateAppointment } from './appointmentService'
import { sucursalParaGuardar } from '@/utils/branchScope'
import {
  nuevaAtencion, normalizarAtenciones, limpiarAtenciones, camposLegadoDeFicha, hoyYMD,
} from '@/utils/fichaAtencion'

/**
 * Una cita sin paciente registrado (las reservas del catálogo público nacen
 * así: el cliente deja nombre y teléfono, nada más) se vincula recién cuando
 * hace falta escribir en su ficha. Se busca por teléfono y, si no existe, se
 * crea con lo que trajo la reserva. El id queda guardado en la cita para la
 * próxima vez.
 *
 * @returns {Promise<string>} customerId
 */
const vincularPaciente = async (businessId, appointment) => {
  if (!appointment?.id) throw new Error('La cita no está vinculada a un paciente registrado')
  const telefono = String(appointment.phone || '').replace(/\D/g, '')
  let customerId = null
  if (telefono) {
    const q = query(collection(db, 'businesses', businessId, 'customers'), where('phone', '==', appointment.phone), limit(1))
    const snap = await getDocs(q)
    if (!snap.empty) customerId = snap.docs[0].id
  }
  if (!customerId) {
    const nombre = String(appointment.customerName || '').trim()
    if (!nombre) throw new Error('La cita no tiene nombre ni paciente registrado')
    const r = await createCustomer(businessId, {
      documentType: 'DNI',
      documentNumber: '',
      name: nombre,
      phone: appointment.phone || '',
    })
    if (!r?.success) throw new Error(r?.error || 'No se pudo crear la ficha del paciente')
    customerId = r.id
  }
  await updateAppointment(businessId, appointment.id, { customerId })
  return customerId
}

/**
 * Registrar en la ficha del paciente la atención de una cita, desde la Agenda.
 *
 * Es el mismo historial que se edita en Clientes: acá solo se le agrega la
 * entrada de HOY con lo que trae la cita (procedimiento, quién atendió) y lo
 * que escribe el profesional al terminar (tratamiento, recomendaciones,
 * próximo control). Si la misma cita se registra dos veces, la entrada se
 * REEMPLAZA en vez de duplicarse: la ficha no puede decir que hubo dos
 * atenciones cuando hubo una.
 *
 * El próximo control se agenda igual que desde Clientes (una sola cita, con
 * su id guardado en la atención).
 *
 * @param {string} businessId
 * @param {object} appointment la cita (id, customerId, serviceName, specialistName)
 * @param {{ service?: string, treatment?: string, recommendations?: string,
 *           specialist?: string, nextControlDate?: string, nextControlTime?: string }} campos
 * @param {string|null} branchScope sucursal activa, para el control agendado
 * @returns {Promise<{ controlesAgendados: number }>}
 */
export const registrarAtencionDesdeCita = async (businessId, appointment, campos, branchScope) => {
  const customerId = appointment?.customerId || await vincularPaciente(businessId, appointment)

  const ref = doc(db, 'businesses', businessId, 'customers', customerId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('No se encontró la ficha del paciente')
  const cliente = { id: snap.id, ...snap.data() }

  const previas = normalizarAtenciones(cliente)
  // Si esta cita ya dejó su atención, se conserva su id (y la cita del
  // control que ya hubiera agendado) y se pisa el contenido.
  const anterior = previas.find(a => a.appointmentId === appointment.id) || null
  const entrada = nuevaAtencion({
    ...(anterior || {}),
    date: anterior?.date || hoyYMD(),
    service: campos.service ?? appointment.serviceName ?? '',
    treatment: campos.treatment ?? '',
    recommendations: campos.recommendations ?? '',
    // La reserva pública guarda staffName; la agenda, specialistName.
    specialist: campos.specialist ?? appointment.specialistName ?? appointment.staffName ?? '',
    nextControlDate: campos.nextControlDate ?? '',
    nextControlTime: campos.nextControlTime ?? '',
    appointmentId: appointment.id,
  })
  const atenciones = limpiarAtenciones([entrada, ...previas.filter(a => a !== anterior)])

  const r = await updateCustomer(businessId, customerId, {
    attentions: atenciones,
    ...camposLegadoDeFicha(atenciones),
  })
  if (!r?.success) throw new Error(r?.error || 'No se pudo guardar la ficha')

  const controlesAgendados = await sincronizarProximosControles(
    businessId, customerId, { name: cliente.name, phone: cliente.phone }, atenciones, branchScope,
  )

  // La marca en la cita es lo que deja ver, en la Agenda, que esta atención
  // ya quedó en la ficha.
  await updateAppointment(businessId, appointment.id, { attentionRegisteredAt: Timestamp.now() })

  return { controlesAgendados }
}

/**
 * Agenda en la Agenda de Citas los próximos controles de la ficha.
 *
 * Devuelve cuántas citas NUEVAS se crearon. Reglas:
 *  - Atención con fecha de control y sin cita vinculada → se crea la cita y
 *    su id se guarda en la atención (por eso el updateCustomer del final).
 *  - Con cita ya vinculada → se le actualiza fecha/hora (mover el control
 *    desde la ficha mueve la cita, no crea otra).
 *  - Sin fecha de control → no se toca nada. Si borró la fecha, la cita
 *    sigue en la agenda y se cancela desde allá, donde se ve el contexto.
 *
 * @param {string} businessId
 * @param {string} customerId
 * @param {{ name?: string, phone?: string }} datos del cliente, para la cita
 * @param {Array} atenciones YA limpias (ver limpiarAtenciones); se MUTAN para
 *   guardarles el id de la cita creada
 * @param {string|null} branchScope sucursal activa en el header: la cita queda
 *   en el local donde se está atendiendo
 */
export const sincronizarProximosControles = async (businessId, customerId, datos, atenciones, branchScope) => {
  const conControl = (atenciones || []).filter(a => a.nextControlDate)
  if (conControl.length === 0 || !customerId) return 0

  let creadas = 0
  let huboVinculosNuevos = false

  for (const at of atenciones) {
    if (!at.nextControlDate) continue
    const hora = at.nextControlTime || '09:00'
    if (at.nextControlAppointmentId) {
      try {
        await updateAppointment(businessId, at.nextControlAppointmentId, {
          scheduledDate: at.nextControlDate,
          scheduledTime: hora,
        })
      } catch (e) {
        // La cita pudo borrarse desde la agenda: se repone.
        console.warn('Cita del control no encontrada, se crea de nuevo:', e)
        at.nextControlAppointmentId = null
      }
    }
    if (!at.nextControlAppointmentId) {
      at.nextControlAppointmentId = await createAppointment(businessId, {
        customerId,
        customerName: datos?.name || '',
        phone: datos?.phone || '',
        serviceName: at.service ? `Control — ${at.service}` : 'Control',
        servicePrice: 0,
        services: [],
        scheduledDate: at.nextControlDate,
        scheduledTime: hora,
        // El control se agenda en el local donde se está atendiendo: si la
        // cita no llevara sucursal, aparecería en la agenda de los dos.
        branchId: sucursalParaGuardar(branchScope),
        notes: 'Agendado desde la ficha de atención',
      })
      creadas++
      huboVinculosNuevos = true
    }
  }

  // Persistir los ids de las citas en la ficha: es la marca que evita
  // duplicar la cita en el siguiente guardado.
  if (huboVinculosNuevos) {
    await updateCustomer(businessId, customerId, { attentions: atenciones })
  }
  return creadas
}
