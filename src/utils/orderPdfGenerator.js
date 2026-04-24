import jsPDF from 'jspdf'
import { preloadLogo } from '@/utils/pdfGenerator'
import { Capacitor } from '@capacitor/core'

/**
 * Genera un PDF de nota de pedido (tienda virtual retail).
 * Formato A5 (148 x 210 mm) con toda la info del pedido.
 *
 * @param {Object} order - Pedido desde Firestore
 * @param {Object} companySettings - Datos del negocio (name, ruc, address, phone, logoUrl)
 * @param {Object} [opts] - Opciones
 * @param {boolean} [opts.download=true] - Si true, descarga en web / comparte en nativo
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generateOrderPDF(order, companySettings = {}, opts = {}) {
  const { download = true } = opts

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5', // 148 × 210
  })

  const PAGE_W = 148
  const MARGIN = 10
  let y = MARGIN

  const businessName = companySettings.businessName || companySettings.name || 'Tienda'
  const ruc = companySettings.ruc || ''
  const address = companySettings.address || ''
  const phone = companySettings.phone || ''
  const email = companySettings.email || ''
  const logoUrl = companySettings.logoUrl || ''

  // ========== HEADER ==========
  // Logo
  let logoData = null
  if (logoUrl) {
    try {
      logoData = await preloadLogo(logoUrl)
    } catch { /* sin logo */ }
  }

  const headerLeft = MARGIN
  const headerRight = PAGE_W - MARGIN

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', headerLeft, y, 22, 22)
    } catch { /* ignore */ }
  }

  const textX = logoData ? headerLeft + 25 : headerLeft
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(businessName, textX, y + 5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let headerLine = y + 10
  if (ruc) { doc.text(`RUC: ${ruc}`, textX, headerLine); headerLine += 4 }
  if (address) { doc.text(address, textX, headerLine, { maxWidth: PAGE_W - textX - MARGIN }); headerLine += 4 }
  if (phone) { doc.text(`Tel: ${phone}`, textX, headerLine); headerLine += 4 }
  if (email) { doc.text(email, textX, headerLine); headerLine += 4 }

  y = Math.max(y + 24, headerLine) + 2

  // Línea separadora
  doc.setDrawColor(100)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 6

  // ========== TÍTULO + NÚMERO ==========
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('NOTA DE PEDIDO', PAGE_W / 2, y, { align: 'center' })
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text('PEDIDO ONLINE', PAGE_W / 2, y, { align: 'center' })
  y += 5

  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(`#${order.orderNumber || ''}`, PAGE_W / 2, y + 4, { align: 'center' })
  y += 12

  // Fecha
  const createdAt = order.createdAt?.toDate ? order.createdAt.toDate() : (order.createdAt ? new Date(order.createdAt) : new Date())
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Fecha: ${createdAt.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}`, PAGE_W / 2, y, { align: 'center' })
  y += 5

  const statusLabels = {
    pending: 'Nuevo',
    contacted: 'Contactado',
    completed: 'Completado',
    cancelled: 'Cancelado',
  }
  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text(`Estado: ${statusLabels[order.status] || order.status || 'Nuevo'}`, PAGE_W / 2, y, { align: 'center' })
  doc.setTextColor(0)
  y += 6

  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 5

  // ========== CLIENTE ==========
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('CLIENTE', MARGIN, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const addClientLine = (label, value) => {
    if (!value) return
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    const labelWidth = doc.getTextWidth(`${label}: `)
    const maxWidth = PAGE_W - MARGIN * 2 - labelWidth
    const lines = doc.splitTextToSize(String(value), maxWidth)
    lines.forEach((line, i) => {
      doc.text(line, MARGIN + labelWidth, y + i * 4)
    })
    y += lines.length * 4 + 1
  }

  addClientLine('Nombre', order.customerName)
  addClientLine('Teléfono', order.customerPhone)
  addClientLine('Email', order.customerEmail)
  addClientLine('Dirección', order.customerAddress)

  if (order.customerCoords) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(50, 100, 200)
    doc.text(`Ubicación: https://maps.google.com/?q=${order.customerCoords.lat},${order.customerCoords.lng}`, MARGIN, y)
    doc.setTextColor(0)
    y += 4
  }

  y += 3
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 5

  // ========== ITEMS ==========
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('PRODUCTOS', MARGIN, y)
  y += 5

  // Headers de tabla
  doc.setFontSize(8)
  doc.setFillColor(240, 240, 240)
  doc.rect(MARGIN, y - 3, PAGE_W - MARGIN * 2, 5, 'F')
  doc.text('Cant.', MARGIN + 1, y)
  doc.text('Producto', MARGIN + 14, y)
  doc.text('P. Unit.', PAGE_W - MARGIN - 28, y, { align: 'left' })
  doc.text('Total', headerRight - 1, y, { align: 'right' })
  y += 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const items = order.items || []
  for (const item of items) {
    const qty = item.quantity || 1
    const price = item.price || 0
    const itemTotal = item.total || (price * qty)

    // Check if we need a new page
    if (y > 185) {
      doc.addPage()
      y = MARGIN
    }

    doc.text(String(qty), MARGIN + 1, y)
    const nameLines = doc.splitTextToSize(item.name || '', 60)
    nameLines.forEach((line, i) => {
      doc.text(line, MARGIN + 14, y + i * 4)
    })
    doc.text(`S/ ${price.toFixed(2)}`, PAGE_W - MARGIN - 28, y, { align: 'left' })
    doc.text(`S/ ${itemTotal.toFixed(2)}`, headerRight - 1, y, { align: 'right' })

    let extra = nameLines.length * 4
    // Variantes
    if (item.isVariant && item.variantAttributes) {
      const variantText = Object.entries(item.variantAttributes).map(([k, v]) => `${k}: ${v}`).join(', ')
      doc.setFontSize(8)
      doc.setTextColor(100)
      doc.text(`  ${variantText}`, MARGIN + 14, y + extra)
      doc.setTextColor(0)
      doc.setFontSize(9)
      extra += 3.5
    }
    // Nota por item
    if (item.notes) {
      doc.setFontSize(8)
      doc.setTextColor(100)
      const noteLines = doc.splitTextToSize(`  Nota: ${item.notes}`, 70)
      noteLines.forEach((line, i) => {
        doc.text(line, MARGIN + 14, y + extra + i * 3.5)
      })
      doc.setTextColor(0)
      doc.setFontSize(9)
      extra += noteLines.length * 3.5
    }

    y += Math.max(extra, 4) + 1
  }

  y += 2
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 5

  // ========== TOTALES ==========
  const subtotal = order.subtotal ?? 0
  const tax = order.tax ?? 0
  const total = order.total ?? items.reduce((s, i) => s + (i.total || i.price * i.quantity || 0), 0)

  if (y > 195) { doc.addPage(); y = MARGIN }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  if (subtotal > 0 && Math.abs(subtotal - total) > 0.01) {
    doc.text('Subtotal:', headerRight - 28, y, { align: 'right' })
    doc.text(`S/ ${subtotal.toFixed(2)}`, headerRight - 1, y, { align: 'right' })
    y += 4
  }
  if (tax > 0) {
    doc.text('IGV:', headerRight - 28, y, { align: 'right' })
    doc.text(`S/ ${tax.toFixed(2)}`, headerRight - 1, y, { align: 'right' })
    y += 4
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('TOTAL:', headerRight - 28, y + 2, { align: 'right' })
  doc.text(`S/ ${Number(total).toFixed(2)}`, headerRight - 1, y + 2, { align: 'right' })
  y += 10

  // ========== NOTAS ==========
  if (order.notes) {
    if (y > 185) { doc.addPage(); y = MARGIN }
    doc.setDrawColor(200)
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 0) // placeholder
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Notas:', MARGIN, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    const noteLines = doc.splitTextToSize(order.notes, PAGE_W - MARGIN * 2)
    noteLines.forEach((line, i) => {
      doc.text(line, MARGIN, y + i * 4)
    })
    y += noteLines.length * 4 + 2
  }

  // ========== FOOTER ==========
  y = Math.max(y, 195)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text('¡Gracias por tu pedido!', PAGE_W / 2, y, { align: 'center' })
  doc.setTextColor(0)

  // ========== SALIDA ==========
  const filename = `pedido-${order.orderNumber || order.id.slice(0, 6)}.pdf`

  if (!download) {
    return { blob: doc.output('blob'), filename }
  }

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const base64Data = doc.output('datauristring').split(',')[1]
    const saved = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    })
    await Share.share({
      title: filename,
      url: saved.uri,
      dialogTitle: 'Guardar o compartir pedido',
    })
  } else {
    doc.save(filename)
  }

  return { blob: doc.output('blob'), filename }
}
