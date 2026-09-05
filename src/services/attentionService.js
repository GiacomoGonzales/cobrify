/**
 * La ficha de atención contra Firestore: agendar los próximos controles que
 * se escriben en la ficha. La FORMA de cada atención sale de
 * src/utils/fichaAtencion.js; acá solo hay lecturas y escrituras.
 */
import { updateCustomer } from './firestoreService'
import { createAppointment, updateAppointment } from './appointmentService'
import { sucursalParaGuardar } from '@/utils/branchScope'

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
