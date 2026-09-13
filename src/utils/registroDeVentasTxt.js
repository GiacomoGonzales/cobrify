/**
 * REGISTRO DE VENTAS EN TXT, PARA EL SISTEMA DEL CONTADOR.
 *
 * Pedido de SUPER LINK (13-set-2026): su contadora importa las ventas desde un
 * archivo de texto y mandó el modelo (VENTAS FRUGAL AGOSTO.txt). Es el Registro
 * de Ventas físico de SUNAT (formato 14.1) en ese orden, sin el correlativo y
 * con el emisor al final. Una línea por comprobante, 28 campos separados por
 * tabulador:
 *
 *    1 fecha de emisión        2 fecha de vencimiento    3 tipo (01, 03, 07, 08)
 *    4 serie                   5 número, o el rango de las boletas del día
 *    6 tipo de documento del cliente (catálogo 06)       7 su número
 *    8 nombre o razón social   9 exportación            10 base gravada
 *   11 exonerada              12 inafecta               13 ISC
 *   14 IGV                    15 otros tributos         16 total
 *   17 tipo de cambio (0 en soles)
 *   18-21 comprobante que modifica: fecha, tipo, serie y número
 *   22 1 si es factura (o nota de una factura), 0 si es boleta
 *   23-24 vacíos              25 RUC del emisor         26 razón social del emisor
 *   27 moneda ("Soles")       28 0
 *
 * Como el modelo: sin encabezado, fin de línea de Windows, fechas
 * "d/MM/aaaa 00:00:00" e importes con 5 decimales ("0" cuando es cero).
 *
 * - Las boletas de un mismo día y serie van en UNA línea "VENTAS DEL DIA" con
 *   el rango de números. Si falta un número en el medio (una anulada), el rango
 *   se corta y cada tramo es una línea.
 * - Los montos salen de `montosContables`, los mismos del Excel de esta página:
 *   la nota de crédito resta y lleva el comprobante que modifica.
 * - La anulada va sola, con importes en 0 y "ANULADO", para que la numeración
 *   no tenga huecos. La rechazada por SUNAT no va: no es un comprobante.
 * - En dólares los importes van en soles con el tipo de cambio del documento,
 *   igual que el 14.1 del Excel de Ventas.
 */
import { montosContables, getInvoiceDate, getSunatStatus, toReportDate } from '@/utils/contabilidad'
import { serieYCorrelativo, correlativoComoNumero } from '@/utils/numeroDeComprobante'
import { toSunatCode } from '@/utils/documentType'
import { getDocumentRate, normalizeCurrency } from '@/utils/currency'
import { rucDeEmpresa } from '@/utils/rucDeEmpresa'

const TIPO_SUNAT = {
  factura: '01', boleta: '03',
  nota_credito: '07', 'nota-credito': '07',
  nota_debito: '08', 'nota-debito': '08',
}

export const NOMBRE_DEL_RESUMEN = 'VENTAS DEL DIA'

/** "6/08/2026 00:00:00": el día sin cero adelante y el mes con cero, como el modelo. */
export function fechaTxt(fecha) {
  if (!(fecha instanceof Date) || isNaN(fecha.getTime())) return ''
  return `${fecha.getDate()}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()} 00:00:00`
}

/** 275.42 → "275.42000"; cero → "0". */
export function importeTxt(monto) {
  const n = Math.round((Number(monto) || 0) * 100) / 100
  return n === 0 ? '0' : n.toFixed(5)
}

const tipoDeCambioTxt = (tc) => (Math.round(Number(tc) * 1000) / 1000).toFixed(5)

// Un tabulador o un salto dentro del nombre partiría la línea en el sistema del contador.
const sinSaltos = (texto) => String(texto ?? '').replace(/[\t\r\n]+/g, ' ').trim()

const documentoDelCliente = (cliente) => {
  const numero = sinSaltos(cliente?.documentNumber)
  const codigo = toSunatCode(cliente?.documentType)
  if (codigo) return { tipo: codigo, numero }
  if (/^\d{11}$/.test(numero)) return { tipo: '6', numero }
  if (/^\d{8}$/.test(numero)) return { tipo: '1', numero }
  return { tipo: '0', numero }
}

const separarNumero = (texto) => {
  const t = String(texto || '').trim()
  const guion = t.indexOf('-')
  return guion > 0 ? { serie: t.slice(0, guion), numero: t.slice(guion + 1) } : { serie: '', numero: t }
}

/**
 * Los comprobantes como filas del registro, antes de juntar las boletas.
 *
 * @param {Array} comprobantes los del período, los mismos del Excel
 * @param {object} empresa la del RUC elegido (empresaDelFiltro): pone el emisor
 * @param {Array} [todos] todo lo cargado, para la fecha del comprobante que modifica una nota
 */
export function filasDelRegistroTxt(comprobantes, empresa = null, todos = comprobantes) {
  const emisorRuc = rucDeEmpresa(empresa)
  const emisorNombre = sinSaltos(empresa?.businessName || empresa?.name)
  const porId = new Map((todos || []).map((d) => [d.id, d]))
  const porNumero = new Map((todos || []).filter((d) => d.number).map((d) => [d.number, d]))

  const filas = []
  for (const doc of comprobantes || []) {
    const tipo = TIPO_SUNAT[doc.documentType]
    if (!tipo) continue // una nota de venta no va al registro
    const estado = getSunatStatus(doc)
    if (estado === 'rejected') continue
    const anulado = estado === 'voided'

    const { serie, correlativo } = serieYCorrelativo(doc)
    const fecha = getInvoiceDate(doc)
    const enDolares = normalizeCurrency(doc.currency) === 'USD'
    const tc = getDocumentRate(doc)
    const m = montosContables(doc, empresa)
    const cliente = documentoDelCliente(doc.customer)

    let ref = null
    if (tipo === '07' || tipo === '08') {
      const referido = separarNumero(doc.referencedDocumentId || doc.referenceNumber)
      const original = porId.get(doc.referencedInvoiceFirestoreId)
        || porNumero.get(String(doc.referencedDocumentId || doc.referenceNumber || '').trim())
        || null
      const tipoRef = String(doc.referencedDocumentType || doc.referenceDocumentType || '')
      ref = {
        fecha: original ? getInvoiceDate(original) : null,
        tipo: TIPO_SUNAT[tipoRef] || (/^0[13]$/.test(tipoRef) ? tipoRef : '') || (original ? TIPO_SUNAT[original.documentType] || '' : ''),
        serie: referido.serie,
        numero: referido.numero,
      }
    }

    filas.push({
      fecha,
      vencimiento: toReportDate(doc.paymentDueDate || doc.dueDate) || fecha,
      tipo,
      serie,
      correlativo,
      numero: correlativoComoNumero(correlativo),
      docTipo: anulado ? '0' : cliente.tipo,
      docNumero: anulado ? '' : cliente.numero,
      nombre: anulado ? 'ANULADO' : (sinSaltos(doc.customer?.businessName || doc.customer?.name) || 'CLIENTES VARIOS'),
      gravada: anulado ? 0 : m.gravada * tc,
      exonerada: anulado ? 0 : m.exonerada * tc,
      inafecta: anulado ? 0 : m.inafecta * tc,
      igv: anulado ? 0 : m.igv * tc,
      total: anulado ? 0 : m.total * tc,
      tipoCambio: enDolares ? tc : 0,
      moneda: enDolares ? 'Dólares' : 'Soles',
      ref,
      anulado,
      enDolares,
      esFactura: tipo === '01' || ref?.tipo === '01' || (!ref && String(serie).toUpperCase().startsWith('F')),
      emisorRuc,
      emisorNombre,
    })
  }
  return filas
}

// Un tramo de boletas seguidas del mismo día y serie, en una sola fila.
function resumirTramo(tramo) {
  const primera = tramo[0]
  const ultima = tramo[tramo.length - 1]
  const ancho = Math.max(8, String(primera.correlativo).length)
  const numero = (f) => String(f.numero).padStart(ancho, '0')
  const suma = (campo) => tramo.reduce((total, f) => total + f[campo], 0)
  return {
    ...primera,
    correlativo: tramo.length > 1 ? `${numero(primera)}-${numero(ultima)}` : numero(primera),
    docTipo: '1',
    docNumero: '',
    nombre: NOMBRE_DEL_RESUMEN,
    gravada: suma('gravada'),
    exonerada: suma('exonerada'),
    inafecta: suma('inafecta'),
    igv: suma('igv'),
    total: suma('total'),
  }
}

function juntarBoletas(filas) {
  const sueltas = []
  const porDia = new Map()
  for (const f of filas) {
    // La anulada va sola; la de dólares también (cada una con su tipo de cambio).
    if (f.tipo !== '03' || f.anulado || f.enDolares || f.numero === null) {
      sueltas.push(f)
      continue
    }
    const clave = `${fechaTxt(f.fecha)}|${f.serie}`
    if (!porDia.has(clave)) porDia.set(clave, [])
    porDia.get(clave).push(f)
  }
  const resumidas = []
  for (const boletas of porDia.values()) {
    boletas.sort((a, b) => a.numero - b.numero)
    let tramo = []
    for (const f of boletas) {
      if (tramo.length && f.numero !== tramo[tramo.length - 1].numero + 1) {
        resumidas.push(resumirTramo(tramo))
        tramo = []
      }
      tramo.push(f)
    }
    if (tramo.length) resumidas.push(resumirTramo(tramo))
  }
  return [...sueltas, ...resumidas]
}

function lineaTxt(f) {
  const ref = f.ref || {}
  return [
    fechaTxt(f.fecha),
    fechaTxt(f.vencimiento || f.fecha),
    f.tipo,
    f.serie,
    f.correlativo,
    f.docTipo,
    f.docNumero,
    f.nombre,
    '0',
    importeTxt(f.gravada),
    importeTxt(f.exonerada),
    importeTxt(f.inafecta),
    '0',
    importeTxt(f.igv),
    '0',
    importeTxt(f.total),
    f.tipoCambio ? tipoDeCambioTxt(f.tipoCambio) : '0',
    ref.fecha ? fechaTxt(ref.fecha) : '',
    ref.tipo || '',
    ref.serie || '',
    ref.numero || '',
    f.esFactura ? '1' : '0',
    '',
    '',
    f.emisorRuc,
    f.emisorNombre,
    f.moneda,
    '0',
  ].join('\t')
}

/** El archivo entero: boletas juntadas, ordenado por serie y número, fin de línea de Windows. */
export function textoDelRegistroTxt(filas) {
  const lineas = juntarBoletas(filas || [])
    .sort((a, b) => String(a.serie).localeCompare(String(b.serie))
      || (a.numero ?? 0) - (b.numero ?? 0)
      || (a.fecha?.getTime?.() || 0) - (b.fecha?.getTime?.() || 0))
    .map(lineaTxt)
  return lineas.length ? `${lineas.join('\r\n')}\r\n` : ''
}

/**
 * El texto en ANSI (Windows-1252), lo que leen los sistemas contables de
 * escritorio. En UTF-8, la Ñ de un "PEÑA" les llegaría como dos letras raras.
 * Lo que no entra en ANSI sale como "?".
 */
export function bytesAnsi(texto) {
  const bytes = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    bytes[i] = c < 256 ? c : 63
  }
  return bytes
}

/** "Ventas_20445429351_Agosto_2026.txt": el RUC en el nombre, como los demás archivos de Contabilidad. */
export function nombreDelTxt(empresa, periodo) {
  const ruc = rucDeEmpresa(empresa)
  const parte = String(periodo || '').trim().replace(/\s+/g, '_')
  return `Ventas${ruc ? `_${ruc}` : ''}${parte ? `_${parte}` : ''}.txt`
}
