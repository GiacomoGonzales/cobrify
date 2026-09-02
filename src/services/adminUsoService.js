import { collection, query, where, getAggregateFromServer, count, sum } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Uso de un negocio con AGREGACIONES: Firestore cuenta y suma en el servidor
// y cobra una lectura por cada 1000 documentos mirados. Antes se descargaban
// todos los comprobantes, clientes y productos de la cuenta para contarlos
// (miles de lecturas por abrir una ficha).

const TIPOS = ['factura', 'boleta', 'nota_venta', 'nota_credito', 'nota_debito']
const RECHAZADOS = ['rejected', 'failed_permanent']
const PENDIENTES = ['pending', 'sending', 'signed', 'SIGNED']

const contar = async q => (await getAggregateFromServer(q, { n: count() })).data().n

export async function resumenDeUso(businessId) {
  const comprobantes = collection(db, 'businesses', businessId, 'invoices')
  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)

  const [todo, mes, aceptados, rechazados, pendientes, clientes, productos, ...porTipo] = await Promise.all([
    getAggregateFromServer(comprobantes, { n: count(), monto: sum('total') }),
    getAggregateFromServer(query(comprobantes, where('createdAt', '>=', inicioMes)), { n: count(), monto: sum('total') }),
    contar(query(comprobantes, where('sunatStatus', '==', 'accepted'))),
    contar(query(comprobantes, where('sunatStatus', 'in', RECHAZADOS))),
    contar(query(comprobantes, where('sunatStatus', 'in', PENDIENTES))),
    contar(collection(db, 'businesses', businessId, 'customers')),
    contar(collection(db, 'businesses', businessId, 'products')),
    ...TIPOS.map(t => contar(query(comprobantes, where('documentType', '==', t)))),
  ])

  const total = todo.data().n
  return {
    invoices: {
      total,
      thisMonth: mes.data().n,
      byType: Object.fromEntries(TIPOS.map((t, i) => [t, porTipo[i]])),
      bySunatStatus: {
        accepted: aceptados,
        rejected: rechazados,
        pending: pendientes,
        // Lo que no esta en ninguno de los tres: nunca se envio
        not_sent: Math.max(0, total - aceptados - rechazados - pendientes),
      },
      totalAmount: todo.data().monto || 0,
      totalAmountThisMonth: mes.data().monto || 0,
    },
    customers: { total: clientes },
    products: { total: productos },
  }
}
