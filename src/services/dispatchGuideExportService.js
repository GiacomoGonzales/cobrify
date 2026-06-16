/**
 * Servicio de exportación a Excel para la página de Guías de Remisión (GRE).
 * Genera dos hojas:
 *   1) Listado de guías emitidas (fecha, número, destinatario, motivo, estado, etc.)
 *   2) Resumen "Mes × Estado": cuántas guías hay en cada mes por cada estado
 *      (lo que el usuario necesita para reportar al contador / SUNAT).
 *
 * Toda la presentación (estilos, layout, descarga) está delegada a excelStyles.
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

// Catálogos SUNAT (mismos códigos que DispatchGuides.jsx).
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

// Estados posibles de una guía (derivados igual que el badge de la pantalla,
// que se basa en sunatStatus). El orden define las columnas del resumen.
const STATUS_ORDER = ['Pendiente', 'Aceptada', 'Rechazada', 'Anulada']

/** Estado legible de una guía — espeja getStatusBadge() de DispatchGuides.jsx. */
const getGuideStatusLabel = (guide) => {
  switch (guide?.sunatStatus) {
    case 'voided': return 'Anulada'
    case 'accepted': return 'Aceptada'
    case 'rejected': return 'Rechazada'
    default: return 'Pendiente'
  }
}

/** Fecha de emisión de la guía (createdAt) como Date, o null si no es válida. */
const getEmissionDate = (guide) => {
  const raw = guide?.createdAt
  if (!raw) return null
  const d = raw.toDate ? raw.toDate() : new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

/** Fecha de traslado en dd/MM/yyyy (soporta YYYY-MM-DD sin desfase de zona horaria). */
const formatTransferDate = (dateString) => {
  if (!dateString) return '-'
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-')
    return `${day}/${month}/${year}`
  }
  const date = new Date(dateString + 'T12:00:00')
  return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('es-PE')
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

/**
 * Generar reporte de guías de remisión en Excel con estilos.
 * @param {Array}  guides       Guías a exportar (ya filtradas por la pantalla).
 * @param {Object} businessData { name, ruc }.
 * @param {string} branchLabel  Etiqueta de sucursal aplicada (o 'Todas').
 */
export const generateDispatchGuidesExcel = async (guides, businessData, branchLabel = null) => {
  const workbook = XLSX.utils.book_new()

  // ============== HOJA 1: GUÍAS EMITIDAS ==============
  const headers1 = [
    'Fecha Emisión', 'Fecha Traslado', 'Número', 'Destinatario', 'RUC/DNI',
    'Motivo de Traslado', 'Transporte', 'Peso (KG)', 'N° Items', 'Estado',
  ]
  const totalCols1 = headers1.length

  const aoa1 = []
  aoa1.push(['REPORTE DE GUÍAS DE REMISIÓN (GRE)'])
  aoa1.push([])

  const metaStart = aoa1.length
  const metadataRows = buildBusinessMetadataRows(businessData, {
    branchLabel: branchLabel || 'Todas',
    totalLabel: 'Total de guías',
    totalItems: guides.length,
  })
  aoa1.push(...metadataRows)
  const metaEndRow = aoa1.length - 1
  aoa1.push([])

  const subtitleRow = aoa1.length
  aoa1.push(['LISTADO DE GUÍAS'])
  aoa1.push([])

  const header1Row = aoa1.length
  aoa1.push(headers1)

  // Ordenar por fecha de emisión ascendente (igual que el contador espera leerlas).
  const sorted = [...guides].sort((a, b) => {
    const da = getEmissionDate(a)?.getTime() || 0
    const db = getEmissionDate(b)?.getTime() || 0
    return da - db
  })

  const dataStart1 = aoa1.length
  let totalWeight = 0
  let totalItems = 0
  sorted.forEach(guide => {
    const emission = getEmissionDate(guide)
    const weight = parseFloat(guide.totalWeight) || 0
    const itemsCount = guide.items?.length || 0
    totalWeight += weight
    totalItems += itemsCount

    aoa1.push([
      emission ? format(emission, 'dd/MM/yyyy', { locale: es }) : '-',
      formatTransferDate(guide.transferDate),
      guide.number || '-',
      getRecipientName(guide),
      getRecipientDoc(guide),
      TRANSFER_REASONS[guide.transferReason] || guide.transferReason || '-',
      TRANSPORT_MODES[guide.transportMode] || guide.transportMode || '-',
      Number(weight.toFixed(2)),
      itemsCount,
      getGuideStatusLabel(guide),
    ])
  })

  aoa1.push([])
  const totalRow1 = aoa1.length
  aoa1.push([
    '', '', '', '', '', '', 'TOTALES:',
    Number(totalWeight.toFixed(2)), totalItems, '',
  ])

  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
  applyColumnWidths(ws1, [14, 14, 16, 32, 14, 28, 18, 11, 9, 14])
  applyTitleRow(ws1, 0, totalCols1)
  applyMetadataRows(ws1, metaStart, metaEndRow)
  applySubtitleRow(ws1, subtitleRow, totalCols1)
  applyHeaderRow(ws1, header1Row, totalCols1)

  for (let i = 0; i < sorted.length; i++) {
    const r = dataStart1 + i
    setStyle(ws1, r, 0, centerStyle(i))       // Fecha Emisión
    setStyle(ws1, r, 1, centerStyle(i))       // Fecha Traslado
    setStyle(ws1, r, 2, centerStyle(i))       // Número
    setStyle(ws1, r, 3, cellStyle(i))         // Destinatario
    setStyle(ws1, r, 4, centerStyle(i))       // RUC/DNI
    setStyle(ws1, r, 5, cellStyle(i))         // Motivo
    setStyle(ws1, r, 6, cellStyle(i))         // Transporte
    setStyle(ws1, r, 7, { ...intStyle(i), numFmt: '#,##0.00' }) // Peso
    setStyle(ws1, r, 8, intStyle(i))          // N° Items
    setStyle(ws1, r, 9, statusStyle(i, aoa1[r][9])) // Estado (coloreado)
  }

  for (let c = 0; c < totalCols1; c++) {
    if (c === 6) setStyle(ws1, totalRow1, c, totalLabelStyle)
    else if (c === 7) setStyle(ws1, totalRow1, c, totalNumberStyle)
    else if (c === 8) setStyle(ws1, totalRow1, c, { ...totalNumberStyle, numFmt: '#,##0' })
    else setStyle(ws1, totalRow1, c, { ...totalLabelStyle, fill: totalLabelStyle.fill })
  }

  applyFreezeBelow(ws1, header1Row)
  XLSX.utils.book_append_sheet(workbook, ws1, 'Guías')

  // ============== HOJA 2: RESUMEN MES × ESTADO ==============
  // Pivot: una fila por mes, una columna por estado + total. Esto es lo que el
  // usuario necesita ("guías emitidas en cada mes por cada estado").
  const headers2 = ['Mes', ...STATUS_ORDER, 'Total']
  const totalCols2 = headers2.length

  // Agrupar por mes (clave YYYY-MM para ordenar) → conteo por estado.
  const byMonth = new Map() // key -> { label, counts: {estado: n}, total }
  let undated = null        // guías sin fecha de emisión válida
  for (const guide of guides) {
    const status = getGuideStatusLabel(guide)
    const emission = getEmissionDate(guide)
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
  aoa2.push(...buildBusinessMetadataRows(businessData, {
    branchLabel: branchLabel || 'Todas',
    totalLabel: 'Total de guías',
    totalItems: guides.length,
  }))
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
    STATUS_ORDER.forEach(st => {
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
    ...STATUS_ORDER.map(st => columnTotals[st] || 0),
    grandTotal,
  ])

  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  applyColumnWidths(ws2, [20, 14, 12, 13, 12, 10])
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
  const fileName = buildExcelFileName('Guias_Remision')
  await saveAndShareExcel(workbook, fileName, {
    shareTitle: fileName,
    shareText: `Reporte de guías de remisión: ${fileName}`,
    subDirectory: 'Guias',
  })
}
