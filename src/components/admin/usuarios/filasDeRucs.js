import { PLANS } from '@/services/subscriptionService'
import { estadoDelRuc } from '@/utils/cobroPorRuc'
import { buildSearchHaystack } from '@/lib/utils'

// Las filas de la pestaña "RUC adicionales" de Usuarios. Van aparte del
// componente porque Usuarios tambien las cuenta, para el numero rojo de la
// pestaña.

export const ESTADOS = {
  sin_pagar: { etiqueta: 'Sin pago registrado', tono: 'rojo', orden: 0 },
  vencido: { etiqueta: 'Vencido', tono: 'rojo', orden: 1 },
  por_vencer: { etiqueta: 'Por vencer', tono: 'neutro', orden: 2 },
  al_dia: { etiqueta: 'Al día', tono: 'neutro', orden: 3 },
  incluido: { etiqueta: 'Incluido en el plan', tono: 'punteado', orden: 4 },
}
const POR_COBRAR = ['sin_pagar', 'vencido', 'por_vencer']

const aFecha = v => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)

/** Una fila por cada RUC adicional de cada cuenta, ya con su situacion. */
export function filasDeRucs(cuentas) {
  const filas = []
  cuentas.forEach(c => {
    (c.emisores || []).forEach(e => {
      const cobro = c.cobroPorRuc ? c.rucsCobrados?.[e.id] || null : null
      const { clave, dias } = c.cobroPorRuc ? estadoDelRuc(cobro) : { clave: 'incluido', dias: null }
      filas.push({
        id: `${c.id}:${e.id}`,
        cuenta: c,
        emisor: e,
        ruc: e.ruc,
        empresa: e.businessName || 'Sin nombre',
        activo: e.activo,
        cobro,
        clave,
        dias,
        // Un RUC apagado no emite: no hay nada que cobrarle.
        porCobrar: e.activo !== false && POR_COBRAR.includes(clave),
        // El cupo es del RUC: el tope de SU plan y SU contador del mes.
        usados: c.usoPorRuc?.[e.id] || 0,
        tope: cobro ? PLANS[cobro.plan]?.limits?.maxInvoicesPerMonth : undefined,
        // Lo que aporta al mes: un plan de 3 meses aporta su tercera parte.
        alMes: cobro && clave !== 'vencido' ? (Number(cobro.precio) || 0) / (Number(cobro.meses) || 1) : 0,
        buscable: buildSearchHaystack(
          e.ruc, String(e.ruc || '').replace(/\D/g, ''), e.businessName,
          c.businessName, c.email, c.ruc, c.codigoCliente,
        ),
      })
    })
  })
  // Primero lo que hay que cobrar, y dentro de cada grupo lo mas urgente. Los
  // RUC apagados, al final.
  return filas.sort((a, b) =>
    (a.activo === false) - (b.activo === false)
    || ESTADOS[a.clave].orden - ESTADOS[b.clave].orden
    || (aFecha(a.cobro?.vence)?.getTime() || 0) - (aFecha(b.cobro?.vence)?.getTime() || 0)
    || a.empresa.localeCompare(b.empresa)
  )
}

/**
 * El numero rojo de la pestaña: los RUC activos que salen en rojo en la tabla
 * (sin pago registrado o vencidos). Los que vencen en 5 dias no: el rojo del
 * admin es solo para lo malo, y esos todavia estan al dia.
 */
export const rucsEnRojo = cuentas => filasDeRucs(cuentas)
  .filter(f => f.activo !== false && ESTADOS[f.clave].tono === 'rojo').length
