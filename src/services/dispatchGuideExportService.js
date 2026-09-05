/**
 * Exportación a Excel de las páginas de guías de remisión: GRE Remitente y
 * GRE Transportista.
 *
 * Las dos generan el mismo libro:
 *   1) Listado de guías (una fila por guía; las columnas cambian según el tipo)
 *   2) Resumen "Mes × Estado": cuántas guías hay en cada mes por cada estado
 *      (lo que el usuario necesita para reportar al contador / SUNAT).
 *
 * El estado y las fechas salen de utils/filtroGuias.js, el mismo criterio que
 * usan el chip y los filtros de la pantalla: lo que se ve es lo que se exporta,
 * con los mismos nombres. Toda la presentación (estilos, layout, descarga) está
 * delegada a excelStyles.
 */
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  XLSX,
  cellStyle, centerStyle, intStyle,
  statusStyle, totalLabelStyle, totalNumberStyle,
  setStyle,
  applyTitleRow, applySubtitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  saveAndShareExcel,
} from './excelStyles'
import { estadoDeGuia, fechaComoYMD } from '@/utils/filtroGuias'
import { etiquetaMotivo } from '@/utils/carrierTransferReasons'

// Catálogos SUNAT de la guía del remitente (mismos códigos que DispatchGuides.jsx).
const TRANSFER_REASONS = {
  '01': 'Venta',
  '02': 'Compra',
  '04': 'Traslado entre establecimientos',
  '05': 'Consignación',
  '08': 'Importación',
  '09': 'Exportación',
  '13': 'Otros',
}

const TRANSPORT_MODES = {
  '01': 'Transporte Público',
  '02': 'Transporte Privado',
}

// Cómo se llama cada estado en el Excel: espeja el chip de la pantalla.
const ETIQUETA_ESTADO = {
  draft: 'Borrador',
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  voided: 'Anulada',
}
const etiquetaEstado = (guide) => ETIQUETA_ESTADO[estadoDeGuia(guide)]

/**
 * Fecha de emisión como Date: la declarada (`issueDate`, 'YYYY-MM-DD') si la
 * guía la tiene; si no, la de creación. Una guía cargada con fecha atrasada
 * tiene createdAt en otro mes, y el resumen la pondría en el mes equivocado.
 */
const fechaDeEmision = (guide) => {
  const ymd = typeof guide?.issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(guide.issueDate) ? guide.issueDate : null
  if (ymd) {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const raw = guide?.createdAt
  if (!raw) return null
  const d = raw.toDate ? raw.toDate() : new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

const fechaLegible = (d) => (d ? format(d, 'dd/MM/yyyy', { locale: es }) : '-')

/** 'YYYY-MM-DD' → 'dd/MM/yyyy' sin pasar por Date (sin desfase de zona horaria). */
const ymdLegible = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '-')

/** Peso bruto en kilos: las guías declaradas en toneladas se convierten para poder sumarlas. */
const pesoEnKg = (guide) => {
  const n = parseFloat(guide?.totalWeight)
  if (!Number.isFinite(n)) return 0
  return guide?.weightUnit === 'TNE' ? n * 1000 : n
}

/** Nombre del destinatario (recipient/customer) con varios fallbacks. */
const getRecipientName = (guide) => {
  const r = guide?.recipient || guide?.customer || {}
  return r.name || r.businessName || guide?.destination?.name || guide?.destination?.address || '-'
}

/** Documento (RUC/DNI) del destinatario. */
const getRecipientDoc = (guide) => {
  const r = guide?.recipient || guide?.customer || {}
  return r.documentNumber || guide?.destination?.documentNumber || '-'
}

// Columnas del listado. `estilo`: texto | centro | entero | peso | estado.
// `suma` marca las columnas que se totalizan; `totalEtiqueta` es la celda
// donde va "TOTALES:" (la columna anterior a los números).
const COLUMNAS_COMUNES_INICIO = [
  { titulo: 'Fecha Emisión', ancho: 14, estilo: 'centro', valor: g => fechaLegible(fechaDeEmision(g)) },
  { titulo: 'Fecha Traslado', ancho: 14, estilo: 'centro', valor: g => ymdLegible(fechaComoYMD(g.transferDate)) },
  { titulo: 'Número', ancho: 16, estilo: 'centro', valor: g => g.number || '-' },
]
const COLUMNAS_COMUNES_FIN = [
  { titulo: 'Peso (KG)', ancho: 11, estilo: 'peso', valor: g => Number(pesoEnKg(g).toFixed(2)), suma: true },
  { titulo: 'N° Items', ancho: 9, estilo: 'entero', valor: g => g.items?.length || 0, suma: true },
  { titulo: 'Estado', ancho: 14, estilo: 'estado', valor: etiquetaEstado },
]

const COLUMNAS_REMITENTE = [
  ...COLUMNAS_COMUNES_INICIO,
  { titulo: 'Destinatario', ancho: 32, estilo: 'texto', valor: getRecipientName },
  { titulo: 'RUC/DNI', ancho: 14, estilo: 'centro', valor: getRecipientDoc },
  { titulo: 'Motivo de Traslado', ancho: 28, estilo: 'texto', valor: g => TRANSFER_REASONS[g.transferReason] || g.transferReason || '-' },
  { titulo: 'Transporte', ancho: 18, estilo: 'texto', valor: g => TRANSPORT_MODES[g.transportMode] || g.transportMode || '-', totalEtiqueta: true },
  ...COLUMNAS_COMUNES_FIN,
]

const COLUMNAS_TRANSPORTISTA = [
  ...COLUMNAS_COMUNES_INICIO,
  { titulo: 'Remitente', ancho: 32, estilo: 'texto', valor: g => g.shipper?.businessName || '-' },
  { titulo: 'RUC Remitente', ancho: 14, estilo: 'centro', valor: g => g.shipper?.ruc || '-' },
  { titulo: 'Destinatario', ancho: 32, estilo: 'texto', valor: g => g.recipient?.name || g.recipient?.businessName || '-' },
  { titulo: 'RUC/DNI Destinatario', ancho: 14, estilo: 'centro', valor: g => g.recipient?.documentNumber || '-' },
  { titulo: 'Placa', ancho: 10, estilo: 'centro', valor: g => g.vehicle?.plate || '-' },
  { titulo: 'Conductor', ancho: 26, estilo: 'texto', valor: g => [g.driver?.name, g.driver?.lastName].filter(Boolean).join(' ') || '-' },
  { titulo: 'DNI Conductor', ancho: 13, estilo: 'centro', valor: g => g.driver?.documentNumber || '-' },
  { titulo: 'Licencia', ancho: 12, estilo: 'centro', valor: g => g.driver?.license || '-' },
  { titulo: 'Motivo', ancho: 24, estilo: 'texto', valor: g => etiquetaMotivo(g.transferReason) || g.transferReason || '-' },
  { titulo: 'Punto de partida', ancho: 34, estilo: 'texto', valor: g => g.origin?.address || '-' },
  { titulo: 'Punto de llegada', ancho: 34, estilo: 'texto', valor: g => g.destination?.address || '-', totalEtiqueta: true },
  ...COLUMNAS_COMUNES_FIN,
]

const estiloDeCelda = (tipo, i, valor) => {
  switch (tipo) {
    case 'centro': return centerStyle(i)
    case 'entero': return intStyle(i)
    case 'peso': return { ...intStyle(i), numFmt: '#,##0.00' }
    case 'estado': return statusStyle(i, valor)
    default: return cellStyle(i)
  }
}

/**
 * Arma y descarga el libro: hoja de listado con las `columnas` dadas + hoja de
 * resumen Mes × Estado con las columnas de `estadosResumen`.
 */
async function exportarGuias(guides, businessData, {
  titulo, columnas, estadosResumen, prefijoArchivo, shareText, periodLabel, branchLabel,
}) {
  const workbook = XLSX.utils.book_new()
  const meta = {
    periodLabel: periodLabel || undefined,
    branchLabel: branchLabel || undefined,
    totalLabel: 'Total de guías',
    totalItems: guides.length,
  }

  // ============== HOJA 1: LISTADO ==============
  const headers1 = columnas.map(c => c.titulo)
  const totalCols1 = headers1.length

  const aoa1 = []
  aoa1.push([titulo])
  aoa1.push([])

  const metaStart = aoa1.length
  aoa1.push(...buildBusinessMetadataRows(businessData, meta))
  const metaEndRow = aoa1.length - 1
  aoa1.push([])

  const subtitleRow = aoa1.length
  aoa1.push(['LISTADO DE GUÍAS'])
  aoa1.push([])

  const header1Row = aoa1.length
  aoa1.push(headers1)

  // Ordenar por fecha de emisión ascendente (igual que el contador espera leerlas).
  const sorted = [...guides].sort((a, b) => {
    const da = fechaDeEmision(a)?.getTime() || 0
    const db = fechaDeEmision(b)?.getTime() || 0
    return da - db
  })

  const dataStart1 = aoa1.length
  const sumas = columnas.map(() => 0)
  sorted.forEach(guide => {
    aoa1.push(columnas.map((c, i) => {
      const v = c.valor(guide)
      if (c.suma) sumas[i] += Number(v) || 0
      return v
    }))
  })

  aoa1.push([])
  const totalRow1 = aoa1.length
  aoa1.push(columnas.map((c, i) => {
    if (c.totalEtiqueta) return 'TOTALES:'
    if (c.suma) return c.estilo === 'peso' ? Number(sumas[i].toFixed(2)) : sumas[i]
    return ''
  }))

  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
  applyColumnWidths(ws1, columnas.map(c => c.ancho))
  applyTitleRow(ws1, 0, totalCols1)
  applyMetadataRows(ws1, metaStart, metaEndRow)
  applySubtitleRow(ws1, subtitleRow, totalCols1)
  applyHeaderRow(ws1, header1Row, totalCols1)

  for (let i = 0; i < sorted.length; i++) {
    const r = dataStart1 + i
    columnas.forEach((c, col) => setStyle(ws1, r, col, estiloDeCelda(c.estilo, i, aoa1[r][col])))
  }

  columnas.forEach((c, col) => {
    if (c.totalEtiqueta) setStyle(ws1, totalRow1, col, totalLabelStyle)
    else if (c.suma) setStyle(ws1, totalRow1, col, { ...totalNumberStyle, numFmt: c.estilo === 'peso' ? '#,##0.00' : '#,##0' })
    else setStyle(ws1, totalRow1, col, { ...totalLabelStyle, fill: totalLabelStyle.fill })
  })

  applyFreezeBelow(ws1, header1Row)
  XLSX.utils.book_append_sheet(workbook, ws1, 'Guías')

  // ============== HOJA 2: RESUMEN MES × ESTADO ==============
  // Pivot: una fila por mes, una columna por estado + total. Esto es lo que el
  // usuario necesita ("guías emitidas en cada mes por cada estado").
  const headers2 = ['Mes', ...estadosResumen, 'Total']
  const totalCols2 = headers2.length

  // Agrupar por mes (clave YYYY-MM para ordenar) → conteo por estado.
  const byMonth = new Map() // key -> { label, counts: {estado: n}, total }
  let undated = null        // guías sin fecha de emisión válida
  for (const guide of guides) {
    const status = etiquetaEstado(guide)
    const emission = fechaDeEmision(guide)
    let bucket
    if (!emission) {
      undated = undated || { label: 'Sin fecha', counts: {}, total: 0 }
      bucket = undated
    } else {
      const key = format(emission, 'yyyy-MM')
      if (!byMonth.has(key)) {
        byMonth.set(key, { label: format(emission, 'MMMM yyyy', { locale: es }), counts: {}, total: 0 })
      }
      bucket = byMonth.get(key)
    }
    bucket.counts[status] = (bucket.counts[status] || 0) + 1
    bucket.total += 1
  }

  // Filas ordenadas por mes ascendente; "Sin fecha" al final si existe.
  const monthRows = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1])
  if (undated) monthRows.push(undated)

  const aoa2 = []
  aoa2.push(['RESUMEN DE GUÍAS POR MES Y ESTADO'])
  aoa2.push([])

  const meta2Start = aoa2.length
  aoa2.push(...buildBusinessMetadataRows(businessData, meta))
  const meta2End = aoa2.length - 1
  aoa2.push([])

  const header2Row = aoa2.length
  aoa2.push(headers2)

  const dataStart2 = aoa2.length
  const columnTotals = {} // estado -> n
  let grandTotal = 0
  monthRows.forEach(row => {
    const cap = row.label.charAt(0).toUpperCase() + row.label.slice(1) // "enero 2026" → "Enero 2026"
    const rowData = [cap]
    estadosResumen.forEach(st => {
      const n = row.counts[st] || 0
      rowData.push(n)
      columnTotals[st] = (columnTotals[st] || 0) + n
    })
    rowData.push(row.total)
    grandTotal += row.total
    aoa2.push(rowData)
  })

  // Fila de totales por columna (estado).
  const totalRow2 = aoa2.length
  aoa2.push([
    'TOTAL',
    ...estadosResumen.map(st => columnTotals[st] || 0),
    grandTotal,
  ])

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  applyColumnWidths(ws2, [20, ...estadosResumen.map(() => 13), 10])
  applyTitleRow(ws2, 0, totalCols2)
  applyMetadataRows(ws2, meta2Start, meta2End)
  applyHeaderRow(ws2, header2Row, totalCols2)

  for (let i = 0; i < monthRows.length; i++) {
    const r = dataStart2 + i
    setStyle(ws2, r, 0, cellStyle(i))                 // Mes
    for (let c = 1; c < totalCols2; c++) setStyle(ws2, r, c, intStyle(i)) // conteos
  }

  // Fila de totales
  setStyle(ws2, totalRow2, 0, totalLabelStyle)
  for (let c = 1; c < totalCols2; c++) {
    setStyle(ws2, totalRow2, c, { ...totalNumberStyle, numFmt: '#,##0' })
  }

  applyFreezeBelow(ws2, header2Row)
  XLSX.utils.book_append_sheet(workbook, ws2, 'Resumen Mes x Estado')

  // ============== DESCARGA ==============
  const fileName = buildExcelFileName(prefijoArchivo)
  await saveAndShareExcel(workbook, fileName, {
    shareTitle: fileName,
    shareText: `${shareText}: ${fileName}`,
    subDirectory: 'Guias',
  })
}

/**
 * Excel de las guías del REMITENTE (página GRE Remitente).
 * @param {Array}  guides       Guías a exportar (ya filtradas por la pantalla).
 * @param {Object} businessData { name, ruc }.
 * @param {string} branchLabel  Etiqueta de sucursal aplicada (o 'Todas').
 * @param {string} periodLabel  Cómo se lee el filtro de fecha de la pantalla.
 */
export const generateDispatchGuidesExcel = async (guides, businessData, branchLabel = null, periodLabel = null) =>
  exportarGuias(guides, businessData, {
    titulo: 'REPORTE DE GUÍAS DE REMISIÓN (GRE REMITENTE)',
    columnas: COLUMNAS_REMITENTE,
    estadosResumen: ['Pendiente', 'Aceptada', 'Rechazada', 'Anulada'],
    prefijoArchivo: 'Guias_Remision',
    shareText: 'Reporte de guías de remisión',
    periodLabel,
    branchLabel: branchLabel || 'Todas',
  })

/**
 * Excel de las guías del TRANSPORTISTA (página GRE Transportista): mismo libro,
 * con remitente, destinatario, vehículo y conductor en las columnas.
 */
export const generateCarrierDispatchGuidesExcel = async (guides, businessData, periodLabel = null) =>
  exportarGuias(guides, businessData, {
    titulo: 'REPORTE DE GUÍAS DE REMISIÓN (GRE TRANSPORTISTA)',
    columnas: COLUMNAS_TRANSPORTISTA,
    estadosResumen: ['Borrador', 'Pendiente', 'Aceptada', 'Rechazada'],
    prefijoArchivo: 'Guias_Transportista',
    shareText: 'Reporte de guías de remisión transportista',
    periodLabel,
  })
