import jsPDF from 'jspdf'

const BLACK = [0, 0, 0]
const GRAY = [100, 100, 100]
const LIGHT_GRAY = [220, 220, 220]
const WHITE = [255, 255, 255]
const INDIGO = [79, 70, 229]

/**
 * Genera PDF A4 para Salida de Almacén o Retorno a Almacén
 * @param {Object} movement - datos de la salida o retorno
 * @param {Object} business - datos del negocio
 * @param {string} type - 'exit' | 'return'
 */
export const generateLogisticsMovementPDF = (movement, business = {}, type = 'exit') => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const isExit = type === 'exit'
  const title = isExit ? 'SALIDA DE ALMACÉN' : 'RETORNO A ALMACÉN'

  // ===== HEADER =====
  // Nombre del negocio
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(business.tradeName || business.name || 'EMPRESA', margin, y)
  y += 16

  if (business.address) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(business.address, margin, y)
    y += 11
  }
  if (business.phone) {
    doc.text(`Tel: ${business.phone}`, margin, y)
    y += 11
  }
  if (business.ruc || business.documentNumber) {
    doc.text(`RUC: ${business.ruc || business.documentNumber}`, margin, y)
    y += 11
  }

  // Título del documento (derecha)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INDIGO)
  doc.text(title, pageWidth - margin, margin, { align: 'right' })

  // Fecha
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  const dateStr = formatTimestamp(movement.createdAt)
  doc.text(`Fecha: ${dateStr}`, pageWidth - margin, margin + 16, { align: 'right' })

  y = Math.max(y, margin + 40) + 10

  // ===== LÍNEA SEPARADORA =====
  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(1)
  doc.line(margin, y, pageWidth - margin, y)
  y += 15

  // ===== DATOS DEL MOVIMIENTO =====
  const labelX = margin
  const valueX = margin + 120

  const addField = (label, value) => {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRAY)
    doc.text(label, labelX, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    doc.text(value || '-', valueX, y)
    y += 15
  }

  addField('Proyecto / Obra:', `${movement.projectName || '-'}${movement.projectCode ? ` (${movement.projectCode})` : ''}`)
  addField(isExit ? 'Almacén origen:' : 'Almacén destino:', movement.warehouseName || '-')
  addField('Registrado por:', movement.userName || '-')
  if (!isExit && movement.receivedBy) {
    addField('Recibido por:', movement.receivedBy)
  }
  if (movement.notes) {
    addField('Observaciones:', movement.notes)
  }

  y += 5

  // ===== TABLA DE ITEMS =====
  const items = movement.items || []

  // Columnas
  const cols = isExit
    ? [
      { label: '#', width: 25, align: 'center' },
      { label: 'Código', width: 80, align: 'left' },
      { label: 'Descripción', width: contentWidth - 25 - 80 - 60 - 50, align: 'left' },
      { label: 'Cantidad', width: 60, align: 'center' },
      { label: 'Unidad', width: 50, align: 'center' },
    ]
    : [
      { label: '#', width: 25, align: 'center' },
      { label: 'Código', width: 70, align: 'left' },
      { label: 'Descripción', width: contentWidth - 25 - 70 - 55 - 45 - 90 - 100, align: 'left' },
      { label: 'Cant.', width: 55, align: 'center' },
      { label: 'Und.', width: 45, align: 'center' },
      { label: 'Estado', width: 90, align: 'center' },
      { label: 'Observación', width: 100, align: 'left' },
    ]

  // Header de tabla
  doc.setFillColor(...INDIGO)
  doc.rect(margin, y, contentWidth, 20, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)

  let colX = margin
  cols.forEach(col => {
    const textX = col.align === 'center' ? colX + col.width / 2 : colX + 4
    doc.text(col.label, textX, y + 13, { align: col.align === 'center' ? 'center' : 'left' })
    colX += col.width
  })
  y += 20

  // Filas de datos
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')

  items.forEach((item, idx) => {
    // Verificar si necesita nueva página
    if (y > doc.internal.pageSize.getHeight() - 150) {
      doc.addPage()
      y = margin
    }

    const rowH = 18
    // Fila alternada
    if (idx % 2 === 0) {
      doc.setFillColor(245, 245, 250)
      doc.rect(margin, y, contentWidth, rowH, 'F')
    }

    doc.setTextColor(...BLACK)
    colX = margin
    const rowData = isExit
      ? [String(idx + 1), item.productCode || '-', item.productName || '-', String(item.quantity), item.unit || 'und']
      : [
        String(idx + 1),
        item.productCode || '-',
        item.productName || '-',
        String(item.quantity),
        item.unit || 'und',
        item.condition === 'good' ? 'Buen estado' : item.condition === 'damaged' ? 'Dañado' : 'Perdido',
        item.conditionNotes || '-',
      ]

    cols.forEach((col, ci) => {
      const textX = col.align === 'center' ? colX + col.width / 2 : colX + 4
      const text = (rowData[ci] || '').substring(0, col.width / 4) // truncar si es muy largo
      doc.text(text, textX, y + 12, { align: col.align === 'center' ? 'center' : 'left' })
      colX += col.width
    })

    y += rowH
  })

  // Borde de tabla
  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(0.5)
  doc.rect(margin, y - items.length * 18 - 20, contentWidth, items.length * 18 + 20)

  y += 10

  // ===== RESUMEN =====
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(`Total: ${movement.totalItems || items.reduce((s, i) => s + i.quantity, 0)} unidades en ${items.length} productos`, margin, y)
  y += 14

  if (!isExit) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const good = movement.goodItems || items.filter(i => i.condition === 'good').reduce((s, i) => s + i.quantity, 0)
    const damaged = movement.damagedItems || items.filter(i => i.condition === 'damaged').reduce((s, i) => s + i.quantity, 0)
    const lost = movement.lostItems || items.filter(i => i.condition === 'lost').reduce((s, i) => s + i.quantity, 0)
    doc.setTextColor(22, 163, 74)
    doc.text(`Buen estado: ${good}`, margin, y)
    doc.setTextColor(202, 138, 4)
    doc.text(`Dañados: ${damaged}`, margin + 100, y)
    doc.setTextColor(220, 38, 38)
    doc.text(`Perdidos: ${lost}`, margin + 190, y)
    y += 14
  }

  // ===== FIRMAS =====
  const signatureY = Math.max(y + 60, doc.internal.pageSize.getHeight() - 120)

  // Verificar si cabe en la página
  if (signatureY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage()
  }
  const finalSignY = signatureY > doc.internal.pageSize.getHeight() - 40 ? margin + 60 : signatureY

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)

  // Firma izquierda - quien entrega
  const sign1X = margin + 30
  const sign2X = pageWidth - margin - 170
  const signWidth = 140

  doc.line(sign1X, finalSignY, sign1X + signWidth, finalSignY)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  doc.text(isExit ? 'Entregado por' : 'Entregado por (obra)', sign1X + signWidth / 2, finalSignY + 12, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(movement.userName || '', sign1X + signWidth / 2, finalSignY + 24, { align: 'center' })

  // Firma derecha - quien recibe
  doc.setDrawColor(...BLACK)
  doc.line(sign2X, finalSignY, sign2X + signWidth, finalSignY)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  doc.text(isExit ? 'Recibido por (obra)' : 'Recibido por (almacén)', sign2X + signWidth / 2, finalSignY + 12, { align: 'center' })
  if (!isExit && movement.receivedBy) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text(movement.receivedBy, sign2X + signWidth / 2, finalSignY + 24, { align: 'center' })
  }

  // Pie de página
  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...GRAY)
  doc.text('Documento generado por Cobrify', pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: 'center' })

  return doc
}

/**
 * Descargar PDF de movimiento logístico
 */
export const downloadLogisticsMovementPDF = (movement, business, type = 'exit') => {
  const doc = generateLogisticsMovementPDF(movement, business, type)
  const prefix = type === 'exit' ? 'Salida' : 'Retorno'
  const projectName = (movement.projectName || 'obra').replace(/[^a-zA-Z0-9]/g, '_')
  const fileName = `${prefix}_${projectName}_${formatTimestampShort(movement.createdAt)}.pdf`
  doc.save(fileName)
}

function formatTimestamp(ts) {
  if (!ts) return new Date().toLocaleString('es-PE')
  if (ts.toDate) return ts.toDate().toLocaleString('es-PE')
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString('es-PE')
  return String(ts)
}

function formatTimestampShort(ts) {
  if (!ts) return new Date().toISOString().slice(0, 10)
  if (ts.toDate) return ts.toDate().toISOString().slice(0, 10)
  if (ts.seconds) return new Date(ts.seconds * 1000).toISOString().slice(0, 10)
  return ''
}
