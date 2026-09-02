/**
 * Pasar una ficha de cliente a los campos del formulario del POS.
 *
 * Existe porque el POS armaba ese mapeo A MANO en cada lugar donde se elige un
 * cliente, con una lista literal de campos, y las listas no coincidían. El
 * desplegable de búsqueda copiaba diez campos y se olvidaba de los demás: el
 * cliente tenía su N° de licencia y su tarjeta de propiedad guardados, los
 * elegías por nombre, y esos dos campos salían vacíos. Había que teclearlos en
 * cada venta (reporte de TODOTIRO, 02-sep-2026).
 *
 * El síntoma delata la causa: dirección, correo y teléfono SÍ llegaban. No es
 * que el cliente no se encontrara — es que el mapeo tenía menos campos que la
 * ficha.
 *
 * Un solo criterio para todos los caminos: al agregar un campo del cliente al
 * POS se agrega ACÁ, y los cinco lugares que eligen cliente se enteran solos.
 */
import { ID_TYPES } from '@/utils/peruUtils'
import { getPrimaryPet } from '@/utils/petUtils'

/** Tipo de documento inferido del largo del número cuando la ficha no lo trae. */
export const tipoDeDocumento = (docType, docNumber) => {
  if (docType && docType !== '') return docType
  if (docNumber && docNumber.length === 11) return ID_TYPES.RUC
  if (docNumber && docNumber.length === 8) return ID_TYPES.DNI
  return ID_TYPES.DNI
}

/**
 * Los campos que el POS lee de la ficha del cliente, además de los básicos.
 *
 * Cada uno tiene su interruptor en Configuración > Ventas > Campos del cliente,
 * pero acá se copian SIEMPRE: si el negocio apaga el campo, el dato sigue en la
 * ficha y no hay razón para perderlo del formulario. Lo que decide el
 * interruptor es si se muestra, no si existe.
 */
export const CAMPOS_EXTRA = [
  'studentName',
  'studentSchedule',
  'vehiclePlate',
  'vehicleModel',
  'vehicleYear',
  'licenseNumber',
  'propertyCard',
  'originAddress',
  'destinationAddress',
  'tripDetail',
  'serviceReferenceValue',
  'effectiveLoadValue',
  'usefulLoadValue',
  'bankAccount',
  'detractionPercentage',
  'detractionAmount',
  'goodsServiceCode',
]

/**
 * Códigos del cliente que van SIEMPRE en mayúscula.
 *
 * Una licencia o una resolución son un código, no un nombre: "pe25-0317796" y
 * "PE25-0317796" son el mismo, y mostrarlos distinto según la pantalla obliga a
 * mirar dos veces para confirmar que es el mismo dato.
 */
export const CAMPOS_EN_MAYUSCULA = ['licenseNumber', 'propertyCard']

export const enMayuscula = (v) => String(v ?? '').toUpperCase()

/**
 * Pasa a mayúscula los códigos de un objeto de cliente, sin tocar lo demás.
 *
 * Se aplica también al LEER, no solo al guardar: las fichas cargadas antes de
 * esto tienen el valor en minúscula y nadie va a editarlas una por una.
 */
export const conCodigosEnMayuscula = (obj) => {
  if (!obj) return obj
  const out = { ...obj }
  for (const campo of CAMPOS_EN_MAYUSCULA) {
    if (out[campo]) out[campo] = enMayuscula(out[campo])
  }
  return out
}

/** Solo los extra, listos para mezclar con `...` sobre lo que ya haya. */
export const camposExtraDe = (customer) => {
  const out = {}
  for (const campo of CAMPOS_EXTRA) out[campo] = customer?.[campo] || ''
  return conCodigosEnMayuscula(out)
}

/**
 * Los extra cuando ya hay algo tecleado en el formulario.
 *
 * La consulta por documento (la lupa) mezcla lo que responde RENIEC o SUNAT con
 * lo que el negocio tenga guardado del cliente. Manda la ficha; si la ficha no
 * lo tiene, decide `conservar`: mantiene lo tecleado, salvo que lo tecleado
 * fuera de OTRO cliente, en cuyo caso lo borra.
 *
 * @param {object} customer   la ficha encontrada
 * @param {object} previo     el formulario tal como está
 * @param {Function} conservar (valorPrevio) => string
 */
export const camposExtraConRespaldo = (customer, previo, conservar) => {
  const out = {}
  for (const campo of CAMPOS_EXTRA) {
    out[campo] = customer?.[campo] || conservar(previo?.[campo])
  }
  return conCodigosEnMayuscula(out)
}

/**
 * El formulario completo a partir de la ficha.
 *
 * @param {object} customer  ficha del cliente (documento de Firestore)
 * @returns {object} el `customerData` del POS
 */
export function datosDeCliente(customer) {
  const c = customer || {}
  return {
    documentType: tipoDeDocumento(c.documentType, c.documentNumber),
    documentNumber: c.documentNumber || '',
    name: c.name || '',
    businessName: c.businessName || '',
    address: c.address || '',
    email: c.email || '',
    phone: c.phone || '',
    // La mascota sale del array `pets` y cae al campo legacy si no lo tiene.
    petName: getPrimaryPet(c)?.name || c.petName || '',
    ...camposExtraDe(c),
  }
}
