/**
 * EL BLOQUE "DATOS DEL CLIENTE" DE UN COMPROBANTE — una sola regla.
 *
 * Estaba escrito seis veces (tres tickets, PDF A4, PDF de cotización, BLE),
 * cada uno con la suya, y ninguna era del todo correcta (8-set-2026):
 *   - en boleta y nota de venta la etiqueta decía "DNI:" aunque el número
 *     fuera un RUC de 11 dígitos, y la razón social no salía nunca;
 *   - en factura el POS guardaba la razón social como `name`, así que el
 *     nombre comercial se perdía y la razón social salía dos veces;
 *   - el PDF ponía "RAZÓN SOCIAL:" y debajo imprimía `name` — que con las
 *     sedes es el nombre comercial: "RAZÓN SOCIAL: BAMBU PICOTA".
 *
 * La regla decide por el DOCUMENTO DEL CLIENTE, no por el tipo de comprobante:
 * una empresa (RUC) lleva RUC, Razón Social y, solo si existe y es distinta,
 * Nombre Comercial — igual en factura, boleta o nota de venta. Una persona
 * (DNI, CE, pasaporte) lleva su etiqueta y "Nombre". La mayoría de las
 * empresas no usa nombre comercial y en su ticket no sale nada de más.
 *
 * Las etiquetas llevan tilde; cada impresora las pasa por su conversión.
 */
import { documentLabel, esRuc } from '@/utils/documentType'

const limpio = (v) => String(v ?? '').trim()
const normal = (v) => limpio(v).toUpperCase().replace(/\s+/g, ' ')

/**
 * El cliente de un comprobante, juntando `customer` con los campos sueltos
 * que usaban los comprobantes viejos (`customerName`, `customerDocument`...).
 */
export function clienteDelComprobante(comprobante) {
  const c = comprobante?.customer || {}
  const d = comprobante || {}
  return {
    documentType: c.documentType || d.customerDocumentType || '',
    documentNumber: limpio(c.documentNumber || d.customerDocument || d.customerDocumentNumber || d.customerRuc || d.customerDni),
    name: limpio(c.name || d.customerName),
    businessName: limpio(c.businessName || d.customerBusinessName),
    address: limpio(c.address || d.customerAddress),
    phone: limpio(c.phone || d.customerPhone),
  }
}

export const esEmpresa = (cliente) => esRuc(cliente?.documentType, cliente?.documentNumber)

/** La razón social de una empresa, o el nombre de una persona: lo que encabeza el bloque. */
export function nombrePrincipal(cliente) {
  const c = cliente || {}
  if (esEmpresa(c)) return limpio(c.businessName) || limpio(c.name) || '-'
  return limpio(c.name) || limpio(c.businessName) || 'Cliente'
}

/**
 * El nombre comercial de una empresa cuando aporta algo: existe, no es el
 * genérico "VARIOS" y no es la misma razón social escrita otra vez.
 * @returns {string} el nombre, o '' si no va
 */
export function nombreComercialAparte(cliente) {
  const c = cliente || {}
  if (!esEmpresa(c)) return ''
  const comercial = limpio(c.name)
  if (!comercial) return ''
  const n = normal(comercial)
  if (n === 'VARIOS' || n === normal(nombrePrincipal(c))) return ''
  return comercial
}

/** "RUC" para empresas; DNI, CE o Pasaporte para personas (DNI si no se sabe). */
export function etiquetaDelDocumento(cliente) {
  const c = cliente || {}
  const etiqueta = documentLabel(c.documentType, c.documentNumber)
  return etiqueta === 'Doc.' ? 'DNI' : etiqueta
}

/**
 * Las líneas del bloque, en orden, listas para imprimir como "etiqueta: valor".
 *
 * @param {Object} cliente  (ver clienteDelComprobante)
 * @param {{ conContacto?: boolean }} [opciones]  dirección y teléfono al final
 * @returns {Array<{ etiqueta: string, valor: string }>}
 */
export function lineasDelCliente(cliente, { conContacto = true } = {}) {
  const c = cliente || {}
  const numero = limpio(c.documentNumber)
  const numeroMostrado = numero && numero !== '00000000' ? numero : '-'
  const lineas = []

  if (esEmpresa(c)) {
    lineas.push({ etiqueta: 'RUC', valor: numeroMostrado })
    lineas.push({ etiqueta: 'Razón Social', valor: nombrePrincipal(c) })
    const comercial = nombreComercialAparte(c)
    if (comercial) lineas.push({ etiqueta: 'Nombre Comercial', valor: comercial })
  } else {
    lineas.push({ etiqueta: etiquetaDelDocumento(c), valor: numeroMostrado })
    lineas.push({ etiqueta: 'Nombre', valor: nombrePrincipal(c) })
  }

  if (conContacto) {
    if (limpio(c.address)) lineas.push({ etiqueta: 'Dirección', valor: limpio(c.address) })
    if (limpio(c.phone)) lineas.push({ etiqueta: 'Teléfono', valor: limpio(c.phone) })
  }
  return lineas
}
