/**
 * EL FILTRO "RUC" de Ventas, Contabilidad, Reportes y el cierre de caja
 * (Varios RUC, fase 4).
 *
 * Una cuenta que vende con dos RUC tiene que poder separar lo de cada uno: el
 * contador de cada RUC declara SUS ventas. Si cada pantalla filtrara a su
 * manera, el total por RUC de Reportes no cuadraría con el Registro de Ventas
 * que se le entrega al contador. El criterio es el de emisorDelComprobante: un
 * documento sin `emisorId` es del principal.
 */
import {
  EMISOR_PRINCIPAL,
  emisorIdDe,
  esDelEmisor,
  empresaDelComprobante,
} from '../../functions/src/utils/emisorDelComprobante.js'

/** "Todos los RUC": el valor del filtro que no filtra. */
export const TODOS_LOS_RUC = 'all'

/** ¿Entra este documento con el filtro? Vacío o 'all' = todos. */
export function pasaFiltroDeRuc(documento, filtro) {
  return !filtro || filtro === TODOS_LOS_RUC || esDelEmisor(documento, filtro)
}

/**
 * Las opciones del filtro: el principal primero y después cada emisor. Van
 * también los desactivados: dejaron de vender, pero su historia sigue ahí.
 *
 * @returns {Array<{value: string, ruc: string, razonSocial: string}>}
 */
export function opcionesDeRuc(negocio, emisores = []) {
  return [
    {
      value: EMISOR_PRINCIPAL,
      ruc: negocio?.ruc || '',
      razonSocial: negocio?.businessName || negocio?.name || 'RUC principal',
    },
    ...(emisores || []).map((e) => ({
      value: e.id,
      ruc: e.ruc || '',
      razonSocial: e.businessName || e.tradeName || e.ruc || '',
    })),
  ]
}

/** "RAZÓN SOCIAL · 20XXXXXXXXX", para un desplegable. */
export function etiquetaDeRuc(opcion) {
  return `${opcion?.razonSocial || ''}${opcion?.ruc ? ` · ${opcion.ruc}` : ''}`
}

/**
 * La empresa que va en la cabecera de un reporte filtrado por un RUC: el
 * negocio con ese emisor encima. Sin filtro, el negocio tal cual.
 */
export function empresaDelFiltro(negocio, emisores, filtro) {
  if (!filtro || filtro === TODOS_LOS_RUC) return negocio
  return empresaDelComprobante({ emisorId: filtro }, negocio, emisores)
}

/**
 * Suma montos por RUC. Se le da cada monto con el documento al que pertenece:
 * el cierre de caja suma PAGOS, no totales (una venta al crédito cobrada en
 * este turno cuenta en el RUC de su comprobante), así que las líneas por RUC
 * cuadran con el "Total Ventas" del cierre.
 *
 * `filas()` devuelve solo los RUC con movimiento, el principal primero:
 * [{ emisorId, ruc, razonSocial, cantidad, total, totalUSD }]
 */
export function acumuladorPorRuc(negocio, emisores = []) {
  const opciones = opcionesDeRuc(negocio, emisores)
  const porRuc = new Map()
  const redondear = (n) => Math.round(n * 100) / 100
  return {
    sumar(documento, monto, moneda = 'PEN') {
      const id = emisorIdDe(documento)
      if (!porRuc.has(id)) {
        const opcion = opciones.find((o) => o.value === id)
        porRuc.set(id, {
          emisorId: id,
          ruc: opcion?.ruc || documento?.emisor?.ruc || '',
          razonSocial: opcion?.razonSocial || documento?.emisor?.razonSocial || '',
          cantidad: 0,
          total: 0,
          totalUSD: 0,
        })
      }
      const fila = porRuc.get(id)
      fila.cantidad += 1
      if (moneda === 'USD') fila.totalUSD = redondear(fila.totalUSD + (Number(monto) || 0))
      else fila.total = redondear(fila.total + (Number(monto) || 0))
    },
    filas() {
      const orden = new Map(opciones.map((o, i) => [o.value, i]))
      return [...porRuc.values()].sort((a, b) => (orden.get(a.emisorId) ?? 99) - (orden.get(b.emisorId) ?? 99))
    },
  }
}

/**
 * Cuánto suman los documentos de cada RUC (por defecto, su total). Solo los RUC
 * con movimiento; el principal primero.
 *
 * @returns {Array<{emisorId: string, ruc: string, razonSocial: string, cantidad: number, total: number, totalUSD: number}>}
 */
export function totalesPorRuc(documentos, negocio, emisores = [], montoDe = (d) => Number(d?.total) || 0) {
  const acumulador = acumuladorPorRuc(negocio, emisores)
  for (const documento of documentos || []) acumulador.sumar(documento, montoDe(documento))
  return acumulador.filas()
}

/**
 * Las líneas "Ventas por RUC" de un cierre de caja, las mismas en la pantalla,
 * el ticket web y la ticketera. Vacías con un solo RUC: no hay nada que separar.
 *
 * `etiqueta` es para la pantalla (razón social y RUC); `etiquetaCorta` para los
 * tickets de 58/80 mm, donde la razón social no entra en una línea.
 *
 * @param {Array<object>} filas  lo que guardó el cierre (`salesByRuc`)
 * @returns {Array<{etiqueta: string, etiquetaCorta: string, total: number, totalUSD: number}>}
 */
export function lineasDeVentasPorRuc(filas) {
  if (!Array.isArray(filas) || filas.length < 2) return []
  return filas.map((f) => ({
    etiqueta: `${f.razonSocial || 'RUC'}${f.ruc ? ` (${f.ruc})` : ''}`,
    etiquetaCorta: f.ruc ? `RUC ${f.ruc}` : (f.razonSocial || 'RUC'),
    total: Number(f.total) || 0,
    totalUSD: Number(f.totalUSD) || 0,
  }))
}
