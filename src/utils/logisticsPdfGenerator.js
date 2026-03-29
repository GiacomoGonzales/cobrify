import jsPDF from 'jspdf'

const BLACK = [0, 0, 0]
const GRAY = [120, 120, 120]
const LIGHT_GRAY = [230, 230, 230]
const WHITE = [255, 255, 255]

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [79, 70, 229]
}

const loadLogo = async (logoUrl) => {
  if (!logoUrl) return null
  try {
    // Intentar cache
    const cached = localStorage.getItem('logistics_pdf_logo')
    if (cached) {
      const { url, data, timestamp } = JSON.parse(cached)
      if (url === logoUrl && Date.now() - timestamp < 24 * 60 * 60 * 1000) return data
    }
    // Descargar
    const response = await fetch(logoUrl)
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result
        try { localStorage.setItem('logistics_pdf_logo', JSON.stringify({ url: logoUrl, data: base64, timestamp: Date.now() })) } catch (e) { /* storage full */ }
        resolve(base64)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * Genera PDF A4 para Salida o Retorno de Almacén
 */
export const generateLogisticsMovementPDF = async (movement, business = {}, type = 'exit') => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const isExit = type === 'exit'
  const title = isExit ? 'SALIDA DE ALMACÉN' : 'RETORNO A ALMACÉN'
  const ACCENT = hexToRgb(business.pdfAccentColor || '#4F46E5')
  const ACCENT_LIGHT = ACCENT.map(c => Math.min(255, c + 180))

  // ===== LOGO =====
  const logoData = await loadLogo(business.logoUrl)
  let logoEndX = margin

  if (logoData) {
    try {
      const img = new Image()
      img.src = logoData
      await new Promise(r => { img.onload = r; img.onerror = r })
      const ratio = img.width / img.height
      const maxH = 50
      const maxW = 120
      let w = maxW, h = maxW / ratio
      if (h > maxH) { h = maxH; w = h * ratio }
      doc.addImage(logoData, 'AUTO', margin, y, w, h, undefined, 'FAST')
      logoEndX = margin + w + 15
    } catch { /* skip logo */ }
  }

  // ===== HEADER: Info del negocio =====
  const infoX = logoEndX
  let infoY = y + 2

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(business.tradeName || business.name || 'EMPRESA', infoX, infoY + 12)
  infoY += 16

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  if (business.address) { doc.text(business.address, infoX, infoY + 10); infoY += 11 }
  if (business.phone) { doc.text(`Tel: ${business.phone}`, infoX, infoY + 10); infoY += 11 }
  if (business.ruc || business.documentNumber) { doc.text(`RUC: ${business.ruc || business.documentNumber}`, infoX, infoY + 10); infoY += 11 }

  // ===== HEADER: Cuadro del documento (derecha) =====
  const boxW = 170
  const boxH = 60
  const boxX = pageWidth - margin - boxW
  const boxY = y

  // Marco con color acento
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(2)
  doc.rect(boxX, boxY, boxW, boxH)

  // Barra de color arriba
  doc.setFillColor(...ACCENT)
  doc.rect(boxX, boxY, boxW, 20, 'F')

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(title, boxX + boxW / 2, boxY + 14, { align: 'center' })

  // Número
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...ACCENT)
  doc.text(movement.number || '-', boxX + boxW / 2, boxY + 38, { align: 'center' })

  // Fecha debajo del número
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  doc.text(formatTimestamp(movement.createdAt), boxX + boxW / 2, boxY + 52, { align: 'center' })

  y = Math.max(infoY, boxY + boxH) + 20

  // ===== LÍNEA SEPARADORA =====
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(1.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 18

  // ===== DATOS DEL MOVIMIENTO =====
  const drawField = (label, value, x, width) => {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ACCENT)
    doc.text(label.toUpperCase(), x, y)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    const lines = doc.splitTextToSize(value || '-', width - 5)
    doc.text(lines[0], x, y + 12)
  }

  const halfW = contentWidth / 2

  drawField('Proyecto / Obra', `${movement.projectName || '-'}${movement.projectCode ? ` (${movement.projectCode})` : ''}`, margin, halfW)
  drawField(isExit ? 'Almacén Origen' : 'Almacén Destino', movement.warehouseName || '-', margin + halfW, halfW)
  y += 28

  drawField('Registrado por', movement.userName || '-', margin, halfW)
  if (!isExit && movement.receivedBy) {
    drawField('Recibido por', movement.receivedBy, margin + halfW, halfW)
  }
  y += 28

  if (movement.notes) {
    drawField('Observaciones', movement.notes, margin, contentWidth)
    y += 28
  }

  y += 5

  // ===== TABLA DE ITEMS =====
  const items = movement.items || []
  const rowH = 20

  // Definir columnas
  let cols
  if (isExit) {
    cols = [
      { label: '#', w: 25, align: 'center' },
      { label: 'CÓDIGO', w: 80, align: 'left' },
      { label: 'DESCRIPCIÓN', w: contentWidth - 25 - 80 - 65 - 50, align: 'left' },
      { label: 'CANTIDAD', w: 65, align: 'center' },
      { label: 'UNIDAD', w: 50, align: 'center' },
    ]
  } else {
    cols = [
      { label: '#', w: 22, align: 'center' },
      { label: 'CÓDIGO', w: 65, align: 'left' },
      { label: 'DESCRIPCIÓN', w: contentWidth - 22 - 65 - 50 - 45 - 80 - 95, align: 'left' },
      { label: 'CANT.', w: 50, align: 'center' },
      { label: 'UND.', w: 45, align: 'center' },
      { label: 'ESTADO', w: 80, align: 'center' },
      { label: 'OBSERVACIÓN', w: 95, align: 'left' },
    ]
  }

  // Header de tabla
  doc.setFillColor(...ACCENT)
  doc.rect(margin, y, contentWidth, rowH, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)

  let colX = margin
  cols.forEach(col => {
    const tx = col.align === 'center' ? colX + col.w / 2 : colX + 4
    doc.text(col.label, tx, y + 13, { align: col.align === 'center' ? 'center' : 'left' })
    colX += col.w
  })
  y += rowH

  // Filas
  doc.setFontSize(8)
  items.forEach((item, idx) => {
    if (y > pageHeight - 150) {
      doc.addPage()
      y = margin
    }

    if (idx % 2 === 0) {
      doc.setFillColor(...ACCENT_LIGHT)
      doc.rect(margin, y, contentWidth, rowH, 'F')
    }

    // Bordes horizontales
    doc.setDrawColor(...LIGHT_GRAY)
    doc.setLineWidth(0.3)
    doc.line(margin, y + rowH, pageWidth - margin, y + rowH)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)

    const condLabel = item.condition === 'good' ? 'Buen estado' : item.condition === 'damaged' ? 'Dañado' : 'Perdido'
    const rowData = isExit
      ? [String(idx + 1), item.productCode || '-', item.productName || '-', String(item.quantity), item.unit || 'und']
      : [String(idx + 1), item.productCode || '-', item.productName || '-', String(item.quantity), item.unit || 'und', condLabel, item.conditionNotes || '']

    colX = margin
    cols.forEach((col, ci) => {
      const tx = col.align === 'center' ? colX + col.w / 2 : colX + 4
      let text = rowData[ci] || ''
      // Truncar
      const maxChars = Math.floor(col.w / 4.5)
      if (text.length > maxChars) text = text.substring(0, maxChars - 1) + '…'
      doc.text(text, tx, y + 13, { align: col.align === 'center' ? 'center' : 'left' })
      colX += col.w
    })

    y += rowH
  })

  // Borde exterior de la tabla
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.8)
  doc.rect(margin, y - items.length * rowH - rowH, contentWidth, (items.length + 1) * rowH)

  // Bordes verticales de columnas
  colX = margin
  cols.forEach((col, ci) => {
    if (ci > 0) {
      doc.setDrawColor(...LIGHT_GRAY)
      doc.setLineWidth(0.3)
      doc.line(colX, y - items.length * rowH - rowH, colX, y)
    }
    colX += col.w
  })

  y += 15

  // ===== RESUMEN =====
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  const totalQty = movement.totalItems || items.reduce((s, i) => s + i.quantity, 0)
  doc.text(`Total: ${totalQty} unidades en ${items.length} producto${items.length !== 1 ? 's' : ''}`, margin, y)
  y += 16

  if (!isExit) {
    const good = movement.goodItems || 0
    const damaged = movement.damagedItems || 0
    const lost = movement.lostItems || 0
    doc.setFontSize(8)

    doc.setFillColor(220, 252, 231)
    doc.roundedRect(margin, y - 4, 90, 16, 3, 3, 'F')
    doc.setTextColor(22, 163, 74)
    doc.text(`  Buen estado: ${good}`, margin + 2, y + 7)

    doc.setFillColor(254, 249, 195)
    doc.roundedRect(margin + 95, y - 4, 80, 16, 3, 3, 'F')
    doc.setTextColor(161, 98, 7)
    doc.text(`  Dañados: ${damaged}`, margin + 97, y + 7)

    doc.setFillColor(254, 226, 226)
    doc.roundedRect(margin + 180, y - 4, 80, 16, 3, 3, 'F')
    doc.setTextColor(185, 28, 28)
    doc.text(`  Perdidos: ${lost}`, margin + 182, y + 7)

    y += 20
  }

  // ===== FIRMAS =====
  const signatureY = Math.min(Math.max(y + 80, pageHeight - 130), pageHeight - 60)
  const needNewPage = signatureY > pageHeight - 60
  if (needNewPage) doc.addPage()
  const finalSignY = needNewPage ? 120 : signatureY

  const signWidth = 160
  const sign1X = margin + 40
  const sign2X = pageWidth - margin - signWidth - 40

  // Línea firma izquierda
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.line(sign1X, finalSignY, sign1X + signWidth, finalSignY)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  doc.text(isExit ? 'Entregado por (Almacén)' : 'Entregado por (Obra)', sign1X + signWidth / 2, finalSignY + 14, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(movement.userName || '', sign1X + signWidth / 2, finalSignY + 26, { align: 'center' })

  // Línea firma derecha
  doc.line(sign2X, finalSignY, sign2X + signWidth, finalSignY)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  doc.text(isExit ? 'Recibido por (Obra)' : 'Recibido por (Almacén)', sign2X + signWidth / 2, finalSignY + 14, { align: 'center' })
  if (!isExit && movement.receivedBy) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text(movement.receivedBy, sign2X + signWidth / 2, finalSignY + 26, { align: 'center' })
  }

  // Sello "Firma y Sello"
  doc.setFontSize(6)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...GRAY)
  doc.text('Firma y Sello', sign1X + signWidth / 2, finalSignY + 38, { align: 'center' })
  doc.text('Firma y Sello', sign2X + signWidth / 2, finalSignY + 38, { align: 'center' })

  // ===== PIE DE PÁGINA =====
  doc.setFontSize(7)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...GRAY)
  doc.text('Documento generado por Cobrify', pageWidth / 2, pageHeight - 20, { align: 'center' })

  return doc
}

/**
 * Descargar PDF
 */
export const downloadLogisticsMovementPDF = async (movement, business, type = 'exit') => {
  const doc = await generateLogisticsMovementPDF(movement, business, type)
  const prefix = type === 'exit' ? 'Salida' : 'Retorno'
  const num = movement.number || formatTimestampShort(movement.createdAt)
  const fileName = `${prefix}_${num}.pdf`
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
