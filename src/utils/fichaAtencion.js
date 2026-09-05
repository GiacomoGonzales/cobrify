/**
 * LA FICHA DE ATENCIÓN: el historial de visitas que consultorios, clínicas y
 * salones llevan dentro de la ficha del cliente (procedimiento, tratamiento,
 * recomendaciones, especialista, próximo control), más lo que hay que ver
 * antes de tocar al paciente (alergias, antecedentes).
 *
 * Vive aparte porque la escriben DOS pantallas: Clientes, donde se edita a
 * mano, y la Agenda, que registra la atención al terminar la cita. Antes todo
 * esto era código local de Clientes; con una segunda pantalla escribiendo el
 * mismo array, la forma de cada entrada tiene que salir de un solo lugar o la
 * Agenda guarda una atención que Clientes no sabe leer.
 *
 * Todo es puro: nada de Firestore acá (eso está en attentionService.js).
 */
import { cleanText } from '@/lib/utils'

const idDeAtencion = () => `at_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

/**
 * Hoy como 'YYYY-MM-DD' en hora LOCAL. `toISOString()` da el día de UTC: a
 * las 8 de la noche en Lima ya es mañana en UTC, y la atención quedaba
 * fechada un día después.
 */
export const hoyYMD = (hoy = new Date()) =>
  `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`

/** Una atención vacía, lista para editar. `parcial` pisa lo que se quiera. */
export const nuevaAtencion = (parcial = {}) => ({
  id: idDeAtencion(),
  date: hoyYMD(),
  service: '',
  treatment: '',
  recommendations: '',
  specialist: '',
  // Próximo control: fecha y hora de la siguiente visita. Al guardar se
  // agenda solo en la Agenda de Citas (pedido de Podología Vital: sin esto
  // tenía que buscar los controles "uno por uno" en el calendario).
  nextControlDate: '',
  nextControlTime: '',
  nextControlAppointmentId: null,
  ...parcial,
})

/**
 * Historial de atenciones de un cliente, listo para editar.
 *
 * Un paciente que ya tenía la ficha de atención vieja (cuatro campos con la
 * ÚLTIMA atención) estrena su historial con esa entrada: es justo el dato
 * que la podóloga venía cargando y no se puede perder.
 */
export const normalizarAtenciones = (customer) => {
  const lista = Array.isArray(customer?.attentions) ? customer.attentions : []
  if (lista.length > 0) return lista.map(a => ({ ...a }))
  // Sin historial pero con ficha vieja: se convierte en la primera entrada.
  if (customer?.lastService || customer?.lastServiceDate || customer?.treatment) {
    return [{
      id: idDeAtencion(),
      date: customer.lastServiceDate || '',
      service: customer.lastService || '',
      treatment: customer.treatment || '',
      recommendations: '',
    }]
  }
  return []
}

/** ¿Tiene algo escrito? Una fila con solo la fecha no es una atención. */
const tieneContenido = (a) =>
  (a.service || '').trim() || (a.treatment || '').trim() || (a.recommendations || '').trim()
  || (a.specialist || '').trim() || (a.nextControlDate || '').trim()

/**
 * Deja el historial listo para guardar: sin filas vacías, con el texto limpio
 * y la más reciente primero, que es como se lee una historia clínica.
 *
 * `appointmentId` es la cita desde la que se registró la atención (Agenda).
 * Se conserva para que registrar dos veces la misma cita REEMPLACE la entrada
 * en vez de duplicarla.
 */
export const limpiarAtenciones = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .filter(tieneContenido)
    .map(a => ({
      id: a.id || idDeAtencion(),
      date: a.date || '',
      service: cleanText(a.service || ''),
      treatment: cleanText(a.treatment || ''),
      recommendations: cleanText(a.recommendations || ''),
      specialist: cleanText(a.specialist || ''),
      nextControlDate: a.nextControlDate || '',
      nextControlTime: a.nextControlTime || '',
      // Conserva el vínculo con la cita ya creada: es lo que evita agendar
      // una cita nueva en cada guardado.
      nextControlAppointmentId: a.nextControlAppointmentId || null,
      ...(a.appointmentId ? { appointmentId: a.appointmentId } : {}),
    }))
    .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')))

/**
 * Los cuatro campos de la ficha vieja siguen guardando la atención MÁS
 * RECIENTE. No son un duplicado por descuido: lo que ya los lee (la
 * importación masiva, los datos migrados de 794 fichas) sigue andando sin
 * enterarse de que ahora hay historial.
 *
 * @returns {object} campos a mezclar en el cliente; vacío si no hay atenciones
 */
export const camposLegadoDeFicha = (atencionesLimpias) => {
  const ultima = Array.isArray(atencionesLimpias) ? atencionesLimpias[0] : null
  if (!ultima) return {}
  return { lastService: ultima.service, lastServiceDate: ultima.date, treatment: ultima.treatment }
}

/** Fecha ('YYYY-MM-DD') de la última atención registrada, o '' si no hay. */
export const ultimaAtencion = (customer) => {
  const fechas = normalizarAtenciones(customer).map(a => a.date || '').filter(Boolean).sort()
  return fechas.length ? fechas[fechas.length - 1] : ''
}

/** Edad en años cumplidos a partir de 'YYYY-MM-DD', o null si no se puede saber. */
export const edadDesde = (birthDate, hoy = new Date()) => {
  const m = String(birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [y, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let edad = hoy.getFullYear() - y
  const mesHoy = hoy.getMonth() + 1
  if (mesHoy < mes || (mesHoy === mes && hoy.getDate() < dia)) edad -= 1
  return edad >= 0 && edad < 130 ? edad : null
}

/**
 * 'YYYY-MM-DD' → 'DD/MM/YYYY' sin pasar por Date: `new Date('2026-06-10')` es
 * medianoche de UTC, que en Lima todavía es el 9.
 */
export const fechaCorta = (ymd) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
