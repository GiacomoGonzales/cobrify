/**
 * REGISTRO DE HUÉSPEDES de una reserva de hotel.
 *
 * Pedido de San Ignacio Bamboo Lodge (14 y 15-set-2026): mandaban a cada
 * huésped un formulario de Google por cabaña y las respuestas caían en un Excel
 * de su Drive, sin relación con la reserva. Ahora cada reserva tiene su enlace
 * (el mismo token de "Mi reserva"): el huésped ve su cabaña, sus fechas y la
 * tarifa ya puestas y solo llena lo suyo. Lo que envía queda en la reserva
 * (`registroHuespedes`) y sale en el Excel del registro por fechas.
 *
 * Los campos son los de su formulario, más correo y fecha de nacimiento, que
 * pidieron al revisarlo. La validación está ESPEJADA en
 * functions/booking/publicRegistro.js: las funciones no importan del front.
 */
import { ocupaFechas } from './reprogramacionHotel.js'

export const MAX_HUESPEDES = 4
export const MOTIVOS_DE_VIAJE = ['Vacaciones', 'Trabajo', 'Otro']
export const TIPOS_DE_DOCUMENTO = ['DNI', 'CE', 'Pasaporte']
export const SEXOS = [
  { valor: 'F', etiqueta: 'Femenino' },
  { valor: 'M', etiqueta: 'Masculino' },
]

const texto = (v, max = 80) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
const mayusculas = (v, max) => texto(v, max).toLocaleUpperCase('es-PE')
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))
const esHora = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''))
const hoyEnLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

/** "2026-09-20" → "20/09/2026" */
export const fechaCorta = (ymd) => (esFecha(ymd) ? ymd.split('-').reverse().join('/') : '')

export const huespedVacio = () => ({
  nombres: '', apellidos: '', tipoDocumento: 'DNI', documento: '', sexo: '',
  fechaNacimiento: '', pais: '', ciudad: '', celular: '', correo: '',
})

/** El registro que muestra el formulario: el guardado, o uno vacío con tantos huéspedes como la reserva. */
export function registroParaFormulario(guardado, cantidad = 1) {
  const guardados = Array.isArray(guardado?.huespedes) ? guardado.huespedes.slice(0, MAX_HUESPEDES) : []
  const huespedes = guardados.length > 0
    ? guardados.map((h) => ({ ...huespedVacio(), ...h }))
    : Array.from({ length: Math.max(1, Math.min(MAX_HUESPEDES, Number(cantidad) || 1)) }, huespedVacio)
  return {
    horaLlegada: esHora(guardado?.horaLlegada) ? guardado.horaLlegada : '',
    motivoViaje: MOTIVOS_DE_VIAJE.includes(guardado?.motivoViaje) ? guardado.motivoViaje : '',
    menores: Math.max(0, Math.min(MAX_HUESPEDES - 1, Number(guardado?.menores) || 0)),
    huespedes,
  }
}

const DOCUMENTO_VALIDO = {
  DNI: (n) => /^\d{8}$/.test(n),
  CE: (n) => /^[A-Z0-9]{6,12}$/.test(n),
  Pasaporte: (n) => /^[A-Z0-9]{5,15}$/.test(n),
}

/**
 * Valida y limpia el registro que llega del formulario. Nombres, país y ciudad
 * se guardan en mayúsculas, como pedía su formulario de Google.
 * @returns {{ problema: string, registro: object|null }}
 */
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
    // Un acompañante que se dejó en blanco no es un error: no vino.
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

/** ¿La reserva ya tiene su registro de huéspedes? */
export const tieneRegistro = (reserva) =>
  Array.isArray(reserva?.registroHuespedes?.huespedes) && reserva.registroHuespedes.huespedes.length > 0

/** La dirección pública: la de la barra en la web; cobrifyperu.com en local o en la app. */
export function origenPublico(origen) {
  const o = String(origen || '')
  return /^https:\/\//.test(o) && !/localhost|127\.0\.0\.1/.test(o) ? o : 'https://cobrifyperu.com'
}

export const enlaceDeRegistro = (origen, businessId, token) =>
  `${origenPublico(origen)}/registro-huespedes/${businessId}/${token}`

/** Token aleatorio de 24 caracteres, como los que genera el catálogo al reservar. */
export function tokenNuevo() {
  const bytes = new Uint8Array(18)
  globalThis.crypto.getRandomValues(bytes)
  let binario = ''
  bytes.forEach((b) => { binario += String.fromCharCode(b) })
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** El número para wa.me: un celular peruano de 9 dígitos gana el 51; si no hay número, vacío. */
export function telefonoParaWhatsApp(telefono) {
  const d = String(telefono || '').replace(/\D/g, '')
  if (/^9\d{8}$/.test(d)) return `51${d}`
  return d.length >= 10 ? d : ''
}

/** El mensaje con el enlace, para mandarlo por WhatsApp desde la reserva. */
export function mensajeDeRegistro({ negocio, reserva, enlace }) {
  const cabana = reserva?.roomName || reserva?.roomNumber || ''
  const ingreso = fechaCorta(reserva?.checkInDate || reserva?.checkIn)
  const salida = fechaCorta(reserva?.checkOutDate || reserva?.checkOut)
  const cuando = ingreso ? ` del ${ingreso}${salida ? ` al ${salida}` : ''}` : ''
  return `Hola, gracias por reservar en ${negocio || 'nuestro hospedaje'}. Para completar su reserva${cabana ? ` de ${cabana}` : ''}${cuando}, registre a los huéspedes en este enlace: ${enlace}`
}

/** Años cumplidos a una fecha (la de ingreso), o '' si falta alguna. */
export function edadEn(fechaNacimiento, fecha) {
  if (!esFecha(fechaNacimiento) || !esFecha(fecha)) return ''
  const [ay, am, ad] = fechaNacimiento.split('-').map(Number)
  const [by, bm, bd] = fecha.split('-').map(Number)
  return by - ay - (bm < am || (bm === am && bd < ad) ? 1 : 0)
}

export const COLUMNAS_DEL_REGISTRO = [
  'Ingreso', 'Salida', 'Noches', 'Cabaña', 'Registro', 'Hora de llegada', 'Motivo', 'Menores',
  'Huésped', 'Nombres', 'Apellidos', 'Tipo de documento', 'Documento', 'Sexo',
  'Fecha de nacimiento', 'Edad', 'País', 'Ciudad', 'Celular', 'Correo',
]

const ETIQUETA_SEXO = { F: 'Femenino', M: 'Masculino' }

/**
 * Filas del Excel del registro: una por huésped de cada estadía que toca
 * [desde, hasta]. La reserva sin registro sale con su titular y "Pendiente".
 * Canceladas, no show y reprogramadas no entran: no hubo estadía.
 */
export function filasDelRegistro(reservas, { desde, hasta }) {
  const tocaElRango = (r) => {
    const ingreso = r.checkInDate || r.checkIn
    const salida = r.checkOutDate || r.checkOut || ingreso
    if (!esFecha(ingreso)) return false
    return ingreso <= hasta && (salida > desde || (salida === ingreso && ingreso >= desde))
  }
  const lista = (reservas || [])
    .filter((r) => ocupaFechas(r) && tocaElRango(r))
    .sort((a, b) => {
      const fa = a.checkInDate || a.checkIn || ''
      const fb = b.checkInDate || b.checkIn || ''
      if (fa !== fb) return fa < fb ? -1 : 1
      return String(a.roomName || a.roomNumber || '').localeCompare(String(b.roomName || b.roomNumber || ''), 'es', { numeric: true })
    })

  const filas = []
  for (const r of lista) {
    const ingreso = r.checkInDate || r.checkIn
    const salida = r.checkOutDate || r.checkOut || ''
    const reg = tieneRegistro(r) ? r.registroHuespedes : null
    const base = [
      fechaCorta(ingreso), fechaCorta(salida), Number(r.nights) || '', r.roomName || r.roomNumber || '',
      reg ? 'Completo' : 'Pendiente', reg?.horaLlegada || '', reg?.motivoViaje || '', reg ? Number(reg.menores) || 0 : '',
    ]
    if (reg) {
      reg.huespedes.forEach((h, i) => filas.push([
        ...base, i === 0 ? 'Titular' : `Acompañante ${i}`, h.nombres || '', h.apellidos || '',
        h.tipoDocumento || '', h.documento || '', ETIQUETA_SEXO[h.sexo] || '', fechaCorta(h.fechaNacimiento),
        edadEn(h.fechaNacimiento, ingreso), h.pais || '', h.ciudad || '', h.celular || '', h.correo || '',
      ]))
    } else {
      filas.push([
        ...base, 'Titular', r.guestName || '', '', r.documentType || r.guestDocumentType || '',
        r.documentNumber || r.guestDocument || '', '', '', '', '', '', r.phone || r.guestPhone || '', r.email || r.guestEmail || '',
      ])
    }
  }
  return filas
}
