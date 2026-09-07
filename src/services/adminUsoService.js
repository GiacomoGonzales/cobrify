import { collection, query, where, getAggregateFromServer, count, sum } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Uso de un negocio con AGREGACIONES: Firestore cuenta y suma en el servidor
// y cobra una lectura por cada 1000 documentos mirados. Antes se descargaban
// todos los comprobantes, clientes y productos de la cuenta para contarlos
// (miles de lecturas por abrir una ficha).

const TIPOS = ['factura', 'boleta', 'nota_venta', 'nota_credito', 'nota_debito']
const RECHAZADOS = ['rejected', 'failed_permanent']
const PENDIENTES = ['pending', 'sending', 'signed', 'SIGNED']

// Lo que QPse firma NO vive todo en `invoices`. Las guías y las bajas tienen
// colección propia, y sin contarlas la ficha mostraba de menos justo en los
// negocios que más emiten; a la vez contaba las notas de venta, que son
// internas y no viajan a SUNAT ni consumen firma (KIRLAN: 10.820 de sus 13.536
// comprobantes son notas de venta).
const OTRAS_FUENTES = [
  { clave: 'guia_remision', coleccion: 'dispatchGuides' },
  { clave: 'guia_transportista', coleccion: 'carrierDispatchGuides' },
  { clave: 'comunicacion_baja', coleccion: 'voidedDocuments' },
]

// Los tipos de `invoices` que SÍ viajan a SUNAT. La nota de venta queda fuera
// a propósito: es el comprobante interno del POS.
const TIPOS_QUE_FIRMAN = ['factura', 'boleta', 'nota_credito', 'nota_debito']

const contar = async q => (await getAggregateFromServer(q, { n: count() })).data().n

// `summaryDocuments` guarda los resúmenes diarios Y un contador por día
// (`counter_YYYYMMDD`), que no es un documento emitido. Los counters no tienen
// `status`, así que filtrar por él deja solo los resúmenes de verdad.
const ESTADOS_DE_RESUMEN = ['accepted', 'pending', 'failed', 'rejected']

export async function resumenDeUso(businessId) {
  const comprobantes = collection(db, 'businesses', businessId, 'invoices')
  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)

  const resumenes = collection(db, 'businesses', businessId, 'summaryDocuments')

  const [todo, mes, aceptados, rechazados, pendientes, sinEnviar, clientes, productos,
    ...resto] = await Promise.all([
    getAggregateFromServer(comprobantes, { n: count(), monto: sum('total') }),
    getAggregateFromServer(query(comprobantes, where('createdAt', '>=', inicioMes)), { n: count(), monto: sum('total') }),
    contar(query(comprobantes, where('sunatStatus', '==', 'accepted'))),
    contar(query(comprobantes, where('sunatStatus', 'in', RECHAZADOS))),
    contar(query(comprobantes, where('sunatStatus', 'in', PENDIENTES))),
    contar(query(comprobantes, where('sunatStatus', '==', 'not_sent'))),
    contar(collection(db, 'businesses', businessId, 'customers')),
    contar(collection(db, 'businesses', businessId, 'products')),
    ...TIPOS.map(t => contar(query(comprobantes, where('documentType', '==', t)))),
    ...OTRAS_FUENTES.map(f => contar(collection(db, 'businesses', businessId, f.coleccion))),
    contar(query(resumenes, where('status', 'in', ESTADOS_DE_RESUMEN))),
  ])

  const porTipo = resto.slice(0, TIPOS.length)
  const porFuente = resto.slice(TIPOS.length, TIPOS.length + OTRAS_FUENTES.length)
  const resumenesDiarios = resto[TIPOS.length + OTRAS_FUENTES.length]

  const total = todo.data().n

  // Cada documento que viaja a SUNAT consume una firma de QPse: los cuatro
  // tipos de `invoices` que se declaran, las dos guías, el resumen diario y la
  // comunicación de baja.
  const byType = Object.fromEntries(TIPOS.map((t, i) => [t, porTipo[i]]))
  const porDocumento = {
    ...Object.fromEntries(TIPOS_QUE_FIRMAN.map(t => [t, byType[t] || 0])),
    ...Object.fromEntries(OTRAS_FUENTES.map((f, i) => [f.clave, porFuente[i] || 0])),
    resumen_diario: resumenesDiarios || 0,
  }
  const firmas = Object.values(porDocumento).reduce((a, b) => a + b, 0)

  return {
    invoices: {
      total,
      thisMonth: mes.data().n,
      byType,
      // Lo que de verdad se le factura al negocio, por documento y en total.
      firmas: { total: firmas, porDocumento },
      bySunatStatus: {
        accepted: aceptados,
        rejected: rechazados,
        pending: pendientes,
        // Se cuenta el estado, NO lo que sobra de una resta. Restando, las
        // notas de venta (que son 'not_applicable' porque no viajan a SUNAT)
        // caían todas acá: KIRLAN mostraba 12.528 "sin enviar" y 10.835 de
        // esos eran notas de venta.
        not_sent: sinEnviar,
      },
      totalAmount: todo.data().monto || 0,
      totalAmountThisMonth: mes.data().monto || 0,
    },
    customers: { total: clientes },
    products: { total: productos },
  }
}
