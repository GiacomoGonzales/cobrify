/**
 * Servicio de exportación para la página de Contabilidad.
 * Incluye desglose tributario (Op. Gravada/Exonerada/Inafecta, IGV, Descuento)
 * además de los campos fiscales/SUNAT (XML, CDR, Hash).
 *
 * Multi-divisa: si hay facturas USD, agrega columna "Moneda" y separa los
 * totales por moneda (una fila por PEN y otra por USD).
 *
 * Toda la presentación se delega a excelStyles para mantener el look unificado.
 */
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { normalizeCurrency } from '@/utils/currency'
import {
  XLSX,
  cellStyle, centerStyle, numberStyleCcy, numberStyle,
  docTypeBadgeStyle, statusStyle, checkStyle, currencyTagStyle,
  totalLabelStyle, totalNumberStyle, totalNumberStyleCcy,
  COLORS,
  setStyle,
  applyTitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  saveAndShareExcel,
} from './excelStyles'

// =================== HELPERS LOCALES ===================

const formatDateAccounting = (d) => {
  if (!d) return '-'
  const date = d.toDate ? d.toDate() : new Date(d)
  if (isNaN(date.getTime())) return '-'
  return format(date, 'dd/MM/yyyy', { locale: es })
}

const getInvoiceDate = (inv) => inv.issueDate || inv.createdAt || inv.date

const getSunatStatus = (inv) => {
  const s = inv.sunatStatus
  if (s === 'accepted' || s === 'ACEPTADO') return 'accepted'
  if (s === 'rejected' || s === 'RECHAZADO') return 'rejected'
  if (s === 'voided' || s === 'ANULADO') return 'voided'
  return 'pending'
}

const hasCdr = (inv) => !!(
  inv.cdrUrl || inv.cdrStorageUrl ||
  inv.sunatResponse?.cdrStorageUrl || inv.sunatResponse?.cdrUrl ||
  inv.cdrData || inv.sunatResponse?.cdrData
)

// XML disponible: URL guardada o, si SUNAT dio CDR, se puede regenerar on-the-fly
const hasXml = (inv) => {
  if (inv.xmlUrl || inv.xmlStorageUrl || inv.sunatResponse?.xmlStorageUrl ||
      inv.sunatResponse?.xmlUrl || inv.xmlData) return true
  return hasCdr(inv)
}

/**
 * Construye el workbook con estilos. Retorna el workbook listo para escribir.
 */
function buildAccountingWorkbook(filtered, businessData = null, periodLabel = null) {
  // Multi-divisa: detectar si hay facturas USD. Si las hay, agregamos
  // columna "Moneda" y totales separados por moneda.
  const hasUsdInvoices = filtered.some(inv => normalizeCurrency(inv.currency) === 'USD')

  const headers = [
    'Número', 'Tipo', 'Cliente', 'RUC/DNI', 'Fecha Emisión',
    'Op. Gravada', 'Op. Exonerada', 'Op. Inafecta',
    'Subtotal', 'Descuento', 'IGV', 'Total',
    ...(hasUsdInvoices ? ['Moneda'] : []),
    'Estado SUNAT', 'XML', 'CDR', 'Hash SUNAT',
  ]
  const totalCols = headers.length

  // Índices de columnas específicas (Moneda mueve un slot al resto)
  const ccyCol = hasUsdInvoices ? 12 : -1
  const sunatCol = hasUsdInvoices ? 13 : 12
  const xmlCol = hasUsdInvoices ? 14 : 13
  const cdrCol = hasUsdInvoices ? 15 : 14
  const hashCol = hasUsdInvoices ? 16 : 15

  const aoa = [['REPORTE CONTABLE'], []]
  const metaStart = aoa.length
  aoa.push(...buildBusinessMetadataRows(businessData, {
    periodLabel: periodLabel || 'Todos',
    totalLabel: 'Total de documentos',
    totalItems: filtered.length,
  }))
  const metaEnd = aoa.length - 1
  aoa.push([])

  const headerRow = aoa.length
  aoa.push(headers)

  const docTypes = []
  const invoiceCurrencies = []

  const dataStart = aoa.length
  filtered.forEach(inv => {
    const docType = inv.documentType || 'factura'
    const invCcy = normalizeCurrency(inv.currency)
    docTypes.push(docType)
    invoiceCurrencies.push(invCcy)

    // Desglose tributario (a partir de items)
    let opGravada = 0, opExonerada = 0, opInafecta = 0
    if (inv.items && Array.isArray(inv.items)) {
      inv.items.forEach(item => {
        const itemTotal = (item.quantity || 1) * (item.price || item.unitPrice || 0)
        if (item.taxAffectation === '20') opExonerada += itemTotal
        else if (item.taxAffectation === '30') opInafecta += itemTotal
        else opGravada += itemTotal
      })
    }

    const typeNames = {
      factura: 'Factura', boleta: 'Boleta',
      nota_credito: 'Nota Crédito', 'nota-credito': 'Nota Crédito',
      nota_debito: 'Nota Débito', 'nota-debito': 'Nota Débito',
    }

    const sunatLabel = getSunatStatus(inv) === 'accepted' ? 'Aceptado'
      : getSunatStatus(inv) === 'rejected' ? 'Rechazado'
      : getSunatStatus(inv) === 'voided' ? 'Anulado'
      : 'Pendiente'

    aoa.push([
      inv.number || '-',
      typeNames[docType] || 'Factura',
      inv.customer?.businessName || inv.customer?.name || '-',
      inv.customer?.documentNumber || '-',
      formatDateAccounting(getInvoiceDate(inv)),
      Number(opGravada.toFixed(2)),
      Number(opExonerada.toFixed(2)),
      Number(opInafecta.toFixed(2)),
      Number((inv.subtotal || 0).toFixed(2)),
      Number((inv.discount || 0).toFixed(2)),
      Number((inv.igv || inv.tax || 0).toFixed(2)),
      Number((inv.total || 0).toFixed(2)),
      ...(hasUsdInvoices ? [invCcy] : []),
      sunatLabel,
      hasXml(inv) ? 'Sí' : 'No',
      hasCdr(inv) ? 'Sí' : 'No',
      inv.sunatResponse?.hash || inv.sunatHash || '-',
    ])
  })

  // Totales agrupados por moneda (1 fila si solo PEN, 2 si también USD)
  const totalsByCurrency = filtered.reduce((acc, inv) => {
    const ccy = normalizeCurrency(inv.currency)
    if (!acc[ccy]) acc[ccy] = { gravada: 0, exonerada: 0, inafecta: 0, subtotal: 0, descuento: 0, igv: 0, total: 0 }
    let g = 0, e = 0, ia = 0
    inv.items?.forEach(item => {
      const t = (item.quantity || 1) * (item.price || item.unitPrice || 0)
      if (item.taxAffectation === '20') e += t
      else if (item.taxAffectation === '30') ia += t
      else g += t
    })
    acc[ccy].gravada += g
    acc[ccy].exonerada += e
    acc[ccy].inafecta += ia
    acc[ccy].subtotal += (inv.subtotal || 0)
    acc[ccy].descuento += (inv.discount || 0)
    acc[ccy].igv += (inv.igv || inv.tax || 0)
    acc[ccy].total += (inv.total || 0)
    return acc
  }, {})

  aoa.push([])
  const totalRows = []
  const totalsOrder = ['PEN', 'USD'].filter(c => totalsByCurrency[c])
  totalsOrder.forEach(ccy => {
    const t = totalsByCurrency[ccy]
    const label = totalsOrder.length === 1 ? 'TOTALES:' : `TOTAL ${ccy}:`
    const baseRow = [
      '', '', '', '', label,
      Number(t.gravada.toFixed(2)),
      Number(t.exonerada.toFixed(2)),
      Number(t.inafecta.toFixed(2)),
      Number(t.subtotal.toFixed(2)),
      Number(t.descuento.toFixed(2)),
      Number(t.igv.toFixed(2)),
      Number(t.total.toFixed(2)),
    ]
    if (hasUsdInvoices) baseRow.push(ccy)
    baseRow.push('', '', '', '')
    totalRows.push({ row: aoa.length, ccy })
    aoa.push(baseRow)
  })

  // Crear sheet con estilos
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, [
    16, 14, 32, 14, 13,
    13, 14, 13, 12, 12, 11, 13,
    ...(hasUsdInvoices ? [10] : []),
    14, 8, 8, 40,
  ])
  applyTitleRow(ws, 0, totalCols)
  applyMetadataRows(ws, metaStart, metaEnd)
  applyHeaderRow(ws, headerRow, totalCols)

  // Filas de datos
  for (let i = 0; i < filtered.length; i++) {
    const r = dataStart + i
    const docType = docTypes[i]
    const invCcy = invoiceCurrencies[i]
    setStyle(ws, r, 0, centerStyle(i))                  // Número
    setStyle(ws, r, 1, docTypeBadgeStyle(docType))      // Tipo (badge)
    setStyle(ws, r, 2, cellStyle(i))                    // Cliente
    setStyle(ws, r, 3, centerStyle(i))                  // RUC/DNI
    setStyle(ws, r, 4, centerStyle(i))                  // Fecha
    // Columnas numéricas (Op. Gravada..Total) — usan formato moneda nativa si hay USD
    for (let c = 5; c <= 11; c++) {
      setStyle(ws, r, c, hasUsdInvoices ? numberStyleCcy(i, invCcy) : numberStyle(i))
    }
    if (hasUsdInvoices) {
      setStyle(ws, r, ccyCol, currencyTagStyle(i, invCcy))
    }
    setStyle(ws, r, sunatCol, statusStyle(i, aoa[r][sunatCol]))
    setStyle(ws, r, xmlCol, checkStyle(i, aoa[r][xmlCol]))
    setStyle(ws, r, cdrCol, checkStyle(i, aoa[r][cdrCol]))
    setStyle(ws, r, hashCol, { ...cellStyle(i), font: { ...cellStyle(i).font, sz: 9, color: { rgb: COLORS.textMuted } } })
  }

  // Filas de totales (una por moneda activa)
  totalRows.forEach(({ row, ccy }) => {
    for (let c = 0; c < totalCols; c++) {
      if (c === 4) {
        setStyle(ws, row, c, totalLabelStyle)
      } else if (c >= 5 && c <= 11) {
        setStyle(ws, row, c, hasUsdInvoices ? totalNumberStyleCcy(ccy) : totalNumberStyle)
      } else if (c === ccyCol && hasUsdInvoices) {
        const base = currencyTagStyle(0, ccy)
        setStyle(ws, row, c, { ...base, font: { ...base.font, bold: true } })
      } else {
        setStyle(ws, row, c, { ...totalNumberStyle, alignment: { horizontal: 'left', vertical: 'center' } })
      }
    }
  })

  applyFreezeBelow(ws, headerRow)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contabilidad')
  return wb
}

// =================== APIs PÚBLICAS ===================

/**
 * Genera y descarga el Excel contable (para el botón "Exportar Excel").
 */
export const generateAccountingExcel = async (filtered, businessData = null, periodLabel = null) => {
  if (!filtered || filtered.length === 0) {
    throw new Error('No hay datos para exportar')
  }
  const wb = buildAccountingWorkbook(filtered, businessData, periodLabel)
  const fileName = `Contabilidad_${periodLabel ? periodLabel.replace(/\s+/g, '_') + '_' : ''}${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`
  await saveAndShareExcel(wb, fileName, {
    shareTitle: fileName,
    shareText: 'Reporte contable',
    subDirectory: 'Contabilidad',
  })
}

/**
 * Genera el buffer Excel para incrustarlo dentro del ZIP de auditoría SUNAT.
 */
export const generateAccountingExcelBuffer = (filtered, businessData = null, periodLabel = null) => {
  const wb = buildAccountingWorkbook(filtered, businessData, periodLabel)
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}
