/**
 * EMISIÓN MASIVA — completar el cliente a partir de su RUC o DNI.
 *
 * Pedido de JMC (18-set-2026): en el Excel alcanza con escribir el RUC; la
 * razón social y la dirección se completan solas al subir el archivo, igual
 * que cuando se busca un RUC en el Punto de Venta.
 *
 * El parser decide QUÉ falta, y solo pregunta por celdas vacías: lo que el
 * usuario escribió nunca se pisa. Acá se decide DE DÓNDE sale:
 *   - RUC: SUNAT (razón social y domicilio fiscal), la misma consulta del POS.
 *   - DNI: RENIEC, solo para el nombre. RENIEC no da dirección, así que la de
 *     un DNI solo puede salir de la ficha del cliente.
 *   - Si la consulta no lo trae, la ficha del cliente con ese documento.
 *
 * Cada consulta gasta un crédito de apiperu (un RUC 10, dos: ver
 * consultarDomicilioFiscal). Por eso el parser junta los documentos repetidos
 * del archivo y este buscador recuerda lo que SUNAT y RENIEC ya respondieron:
 * corregir el Excel y volver a subirlo no vuelve a pagar los mismos RUC.
 */
import { consultarRUC, consultarDNI } from './documentLookupService'
import { getCustomerByDocumentNumber } from './firestoreService'
import { ORIGEN } from '@/utils/clienteCompletado'

const NADA = { name: '', address: '', origenNombre: null, origenDireccion: null }

/**
 * Arma el buscador que recibe el parser (`ctx.buscarCliente`).
 *
 * @param {string} businessId - dueño de la lista de clientes (el respaldo)
 * @param {Map}    [memoria]  - respuestas de SUNAT/RENIEC mientras la pantalla siga abierta
 * @returns {(pedido: {tipo: 'RUC'|'DNI', numero: string, necesitaNombre: boolean, necesitaDireccion: boolean})
 *   => Promise<{name: string, address: string, origenNombre: string|null, origenDireccion: string|null}|null>}
 */
export function crearBuscadorDeClientes(businessId, memoria = new Map()) {
  const consultar = async (tipo, numero, necesitaNombre) => {
    const clave = `${tipo}:${numero}`
    if (memoria.has(clave)) return memoria.get(clave)

    let respuesta = NADA
    if (tipo === 'RUC') {
      const r = await consultarRUC(numero)
      if (r.success && r.data?.razonSocial) {
        respuesta = {
          name: r.data.razonSocial,
          address: r.data.direccion || '',
          origenNombre: ORIGEN.SUNAT,
          origenDireccion: r.data.direccion ? ORIGEN.SUNAT : null,
        }
      }
    } else if (tipo === 'DNI' && necesitaNombre) {
      // Con el nombre escrito no se consulta: RENIEC no tiene nada más que dar.
      const r = await consultarDNI(numero)
      if (r.success && r.data?.nombreCompleto) {
        respuesta = { ...NADA, name: r.data.nombreCompleto, origenNombre: ORIGEN.RENIEC }
      }
    }
    // Lo que falló no se recuerda: se vuelve a intentar en la próxima subida.
    if (respuesta.origenNombre) memoria.set(clave, respuesta)
    return respuesta
  }

  return async ({ tipo, numero, necesitaNombre, necesitaDireccion }) => {
    let { name, address, origenNombre, origenDireccion } = await consultar(tipo, numero, necesitaNombre)

    // Respaldo: la ficha del cliente. Para el nombre, solo si la consulta no
    // lo trajo; para la dirección, también cuando la consulta vino sin ella
    // (la de un DNI, siempre).
    if ((necesitaNombre && !name) || (necesitaDireccion && !address)) {
      const ficha = await getCustomerByDocumentNumber(businessId, numero)
        .then((r) => (r.success ? r.data : null))
        .catch(() => null)
      if (ficha) {
        // En un RUC, `businessName` es la razón social y `name` puede ser el
        // nombre comercial: el comprobante va con la razón social.
        const nombreDeFicha = String(ficha.businessName || ficha.name || '').trim()
        if (!name && nombreDeFicha) {
          name = nombreDeFicha
          origenNombre = ORIGEN.CLIENTES
        }
        const direccionDeFicha = String(ficha.address || '').trim()
        if (!address && direccionDeFicha) {
          address = direccionDeFicha
          origenDireccion = ORIGEN.CLIENTES
        }
      }
    }

    return name || address ? { name, address, origenNombre, origenDireccion } : null
  }
}
