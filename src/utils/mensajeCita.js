/**
 * EL MENSAJE DE RECORDATORIO DE UNA CITA, en un solo lugar.
 *
 * Lo abren dos pantallas por WhatsApp: la Agenda (el botón verde de cada
 * cita) y Recordatorios > Citas (las de mañana y la semana). Antes el texto
 * vivía escrito dentro de la Agenda; con una segunda pantalla mandando el
 * mismo mensaje, tiene que salir de acá o un día dicen cosas distintas.
 *
 * El negocio puede escribir su propia plantilla en Configuración > Punto de
 * venta ("Mensaje de recordatorio de cita") con estas variables:
 *   {nombre} {mascota} {servicio} {fecha} {hora} {especialista} {negocio}
 * Vacía, se usa la de siempre.
 */

export const VARIABLES_DE_PLANTILLA = ['nombre', 'mascota', 'servicio', 'fecha', 'hora', 'especialista', 'negocio']

export const PLANTILLA_POR_DEFECTO =
  'Hola {nombre}! Le recordamos su cita: {servicio} programada para el {fecha} a las {hora}. ¿Confirma su asistencia?'

/** Para veterinaria: la cita es de la mascota, no de la persona. */
const PLANTILLA_CON_MASCOTA =
  'Hola! Le recordamos su cita para {mascota}: {servicio} programada para el {fecha} a las {hora}. ¿Confirma su asistencia?'

const fechaDe = (appointment) =>
  appointment?.scheduledDate?.toDate ? appointment.scheduledDate.toDate() : new Date(appointment?.scheduledDate)

/** 'lunes, 7 de septiembre' */
export const fechaLargaDeCita = (appointment) => {
  const d = fechaDe(appointment)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** '09:30' */
export const horaDeCita = (appointment) => {
  if (appointment?.scheduledTime) return String(appointment.scheduledTime)
  const d = fechaDe(appointment)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * @param {object} appointment la cita
 * @param {{ plantilla?: string, nombreNegocio?: string }} [opciones]
 * @returns {string}
 */
export const mensajeDeCita = (appointment, { plantilla = '', nombreNegocio = '' } = {}) => {
  const valores = {
    nombre: String(appointment?.customerName || '').trim(),
    mascota: String(appointment?.petName || '').trim(),
    servicio: String(appointment?.serviceName || 'su cita').trim(),
    fecha: fechaLargaDeCita(appointment),
    hora: horaDeCita(appointment),
    especialista: String(appointment?.specialistName || appointment?.staffName || '').trim(),
    negocio: String(nombreNegocio || '').trim(),
  }
  const base = String(plantilla || '').trim()
    || (valores.mascota ? PLANTILLA_CON_MASCOTA : PLANTILLA_POR_DEFECTO)
  return base
    .replace(/\{(\w+)\}/g, (todo, clave) => (clave in valores ? valores[clave] : todo))
    // Una variable vacía deja dos espacios o un "Hola !" con hueco.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([!?,.;:])/g, '$1')
    .trim()
}

/**
 * Enlace de WhatsApp a un teléfono peruano. Sin el 51 delante, WhatsApp
 * abre un chat vacío con un número que no existe.
 */
export const linkWhatsApp = (phone, message) => {
  const digitos = String(phone || '').replace(/\D/g, '')
  const numero = digitos.startsWith('51') ? digitos : `51${digitos}`
  return `https://wa.me/${numero}?text=${encodeURIComponent(message || '')}`
}
