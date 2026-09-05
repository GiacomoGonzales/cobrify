/**
 * Los comprobantes de UN cliente.
 *
 * Lo leen dos pantallas —el historial de pedidos de Clientes y la ficha del
 * paciente— y las dos tienen que encontrar lo mismo: por id de cliente y, si
 * la venta salió sin vincular (el cajero escribió el DNI suelto), por número
 * de documento. Antes esta consulta vivía dentro del modal de pedidos.
 */
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/** Fecha del comprobante: createdAt, y si no, la fecha de emisión. */
export const fechaDeComprobante = (inv) => {
  const ms = inv?.createdAt?.toDate?.()?.getTime?.()
    || inv?.issueDate?.toDate?.()?.getTime?.()
    || (inv?.emissionDate ? new Date(`${inv.emissionDate}T12:00:00`).getTime() : 0)
  return ms ? new Date(ms) : null
}

/** Comprobantes del cliente, el más reciente primero. */
export const getInvoicesDeCliente = async (businessId, customer) => {
  if (!businessId || !customer?.id) return []
  const invoicesRef = collection(db, 'businesses', businessId, 'invoices')
  const aDocs = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }))

  let docs = aDocs(await getDocs(query(invoicesRef, where('customerId', '==', customer.id))))

  const docNumber = customer.documentNumber
  if (docs.length === 0 && docNumber && docNumber !== '00000000') {
    docs = aDocs(await getDocs(query(invoicesRef, where('customer.documentNumber', '==', docNumber))))
  }

  const ms = (inv) => fechaDeComprobante(inv)?.getTime() || 0
  return docs.sort((a, b) => ms(b) - ms(a))
}
