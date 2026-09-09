/**
 * Qué se le completa a la ficha de un cliente con lo que trajo una venta.
 *
 * La regla es rellenar vacíos, nunca pisar: lo que el negocio escribió a mano
 * en la ficha vale más que lo que se tipeó al cobrar.
 *
 * El caso que faltaba era el documento. En Clínica (Adara, 9-set-2026) se
 * agendaba la cita con un DNI inventado ("1", o nada) porque la Agenda lo
 * exigía, y el DNI real se escribía recién al cobrar. La venta buscaba a la
 * paciente por ESE documento, no la encontraba, y creaba otra ficha: quedaban
 * dos pacientes y había que borrar una. Ahora, si la ficha no tiene un
 * documento que identifique a nadie y la venta trae uno que sí, se completa.
 *
 * Lo lee `upsertCustomerFromSale`, en sus dos caminos: cuando la venta viene
 * con el id del cliente (elegido de la lista o cargado desde una cita) y
 * cuando solo trae el documento.
 */
import { identificaAUnCliente } from './clienteDuplicado'

const CAMPOS_QUE_SE_COMPLETAN = ['name', 'businessName', 'email', 'phone', 'address']

/**
 * @param {object} existente  la ficha que ya está guardada
 * @param {object} venta      los datos del cliente tal como salieron del POS
 * @returns {object}          solo los campos a escribir; vacío si no hay nada
 */
export function cambiosDesdeVenta(existente, venta) {
  const e = existente || {}
  const v = venta || {}
  const cambios = {}

  for (const campo of CAMPOS_QUE_SE_COMPLETAN) {
    if (v[campo] && !e[campo]) cambios[campo] = v[campo]
  }

  if (!identificaAUnCliente(e.documentNumber) && identificaAUnCliente(v.documentNumber)) {
    cambios.documentNumber = String(v.documentNumber).trim()
    if (v.documentType) cambios.documentType = v.documentType
  }

  return cambios
}
