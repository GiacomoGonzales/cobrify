import jsPDF from 'jspdf'
import { formatCurrency } from '@/lib/utils'

/**
 * Genera un PDF con el reporte de recuento de inventario
 * @param {Array} countedItems - Items contados con sus diferencias
 * @param {Object} stats - Estadísticas del recuento
 * @param {Object} companySettings - Configuración de la empresa
 * @param {Array} categories - Categorías de productos
 */
export const generateInventoryCountPdf = (countedItems, stats, companySettings, categories) => {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth() // 210mm
  const pageHeight = doc.internal.pageSize.getHeight() // 297mm
  const margin = 10
  const contentWidth = pageWidth - margin * 2 // 190mm
  let y = margin

  // Colores
  const primaryColor = [59, 130, 246] // Azul
  const redColor = [220, 38, 38]
  const greenColor = [22, 163, 74]
  const grayColor = [107, 114, 128]

  // Helper para obtener nombre de categoría
  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'Sin cat.'
    const category = categories?.find(c => c.id === categoryId)
    return category?.name || categoryId
  }

  // Helper para truncar texto
  const truncate = (text, maxLen) => {
    if (!text) return '-'
    return text.length > maxLen ? text.substring(0, maxLen - 2) + '..' : text
  }

  // Helper para agregar nueva página si es necesario
  const checkNewPage = (neededHeight = 15) => {
    if (y + neededHeight > pageHeight - 20) {
      doc.addPage()
      y = margin
      return true
    }
    return false
  }

  // ========== ENCABEZADO ==========
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, pageWidth, 28, 'F')

  // Título
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('REPORTE DE RECUENTO DE INVENTARIO', pageWidth / 2, 12, { align: 'center' })

  // Nombre de la empresa y fecha
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const companyName = companySettings?.companyName || companySettings?.businessName || 'Mi Empresa'
  const now = new Date()
  const dateStr = now.toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  doc.text(`${companyName} | ${dateStr} - ${timeStr}`, pageWidth / 2, 22, { align: 'center' })

  y = 35

  // ========== RESUMEN COMPACTO ==========
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumen', margin, y)
  y += 6

  // Una sola fila con 4 cajas
  const boxWidth = (contentWidth - 9) / 4
  const boxHeight = 18

  // Caja 1: Contados
  doc.setFillColor(240, 249, 255)
  doc.roundedRect(margin, y, boxWidth, boxHeight, 2, 2, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grayColor)
  doc.text('Contados', margin + boxWidth / 2, y + 5, { align: 'center' })
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryColor)
  doc.text(`${stats.countedProducts}/${stats.totalProducts}`, margin + boxWidth / 2, y + 13, { align: 'center' })

  // Caja 2: Con Diferencia
  const x2 = margin + boxWidth + 3
  doc.setFillColor(255, 251, 235)
  doc.roundedRect(x2, y, boxWidth, boxHeight, 2, 2, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grayColor)
  doc.text('Con Diferencia', x2 + boxWidth / 2, y + 5, { align: 'center' })
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(217, 119, 6)
  doc.text(`${stats.productsWithDifference}`, x2 + boxWidth / 2, y + 13, { align: 'center' })

  // Caja 3: Faltantes
  const x3 = margin + (boxWidth + 3) * 2
  doc.setFillColor(254, 242, 242)
  doc.roundedRect(x3, y, boxWidth, boxHeight, 2, 2, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grayColor)
  doc.text('Faltantes', x3 + boxWidth / 2, y + 5, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...redColor)
  doc.text(`-${stats.totalMissing}`, x3 + boxWidth / 2, y + 12, { align: 'center' })
  doc.setFontSize(7)
  doc.text(formatCurrency(stats.totalMissingValue), x3 + boxWidth / 2, y + 16, { align: 'center' })

  // Caja 4: Sobrantes
  const x4 = margin + (boxWidth + 3) * 3
  doc.setFillColor(240, 253, 244)
  doc.roundedRect(x4, y, boxWidth, boxHeight, 2, 2, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grayColor)
  doc.text('Sobrantes', x4 + boxWidth / 2, y + 5, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...greenColor)
  doc.text(`+${stats.totalSurplus}`, x4 + boxWidth / 2, y + 12, { align: 'center' })
  doc.setFontSize(7)
  doc.text(formatCurrency(stats.totalSurplusValue), x4 + boxWidth / 2, y + 16, { align: 'center' })

  y += boxHeight + 8

  // ========== TABLA DE PRODUCTOS ==========
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Detalle del Recuento', margin, y)
  y += 6

  // Anchos de columna ajustados para caber en 190mm
  // Total: 18 + 70 + 38 + 18 + 18 + 14 + 20 = 196 -> ajustar
  const colWidths = {
    code: 18,
    product: 62,
    category: 32,
    system: 18,
    count: 18,
    diff: 16,
    value: 22,
  }
  // Total: 18 + 62 + 32 + 18 + 18 + 16 + 22 = 186mm (cabe en 190mm)

  // Encabezados de tabla
  const headerHeight = 8
  doc.setFillColor(243, 244, 246)
  doc.rect(margin, y, contentWidth, headerHeight, 'F')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(75, 85, 99)

  let x = margin + 1
  doc.text('CÓD.', x, y + 5.5)
  x += colWidths.code
  doc.text('PRODUCTO', x, y + 5.5)
  x += colWidths.product
  doc.text('CATEGORÍA', x, y + 5.5)
  x += colWidths.category
  doc.text('SIST.', x + colWidths.system / 2, y + 5.5, { align: 'center' })
  x += colWidths.system
  doc.text('CONT.', x + colWidths.count / 2, y + 5.5, { align: 'center' })
  x += colWidths.count
  doc.text('DIF.', x + colWidths.diff / 2, y + 5.5, { align: 'center' })
  x += colWidths.diff
  doc.text('VALOR', x + colWidths.value / 2, y + 5.5, { align: 'center' })

  y += headerHeight + 2 // Espacio extra después del encabezado

  // Ordenar: primero faltantes, luego sobrantes, luego iguales
  const sortedItems = [...countedItems].sort((a, b) => {
    const diffA = parseFloat(a.physicalCount) - a.systemStock
    const diffB = parseFloat(b.physicalCount) - b.systemStock
    if (diffA < 0 && diffB >= 0) return -1
    if (diffA >= 0 && diffB < 0) return 1
    if (diffA < 0 && diffB < 0) return diffA - diffB
    if (diffA > 0 && diffB > 0) return diffB - diffA
    return 0
  })

  // Filas de productos
  doc.setFontSize(7)
  const rowHeight = 5

  sortedItems.forEach((item, index) => {
    checkNewPage(rowHeight + 1)

    const diff = parseFloat(item.physicalCount) - item.systemStock
    const value = diff * item.price

    // Alternar color de fondo
    if (index % 2 === 0) {
      doc.setFillColor(249, 250, 251)
      doc.rect(margin, y - 3, contentWidth, rowHeight, 'F')
    }

    x = margin + 1

    // Código
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(75, 85, 99)
    doc.text(truncate(item.productCode, 8), x, y)
    x += colWidths.code

    // Producto
    doc.setTextColor(0, 0, 0)
    doc.text(truncate(item.productName, 28), x, y)
    x += colWidths.product

    // Categoría
    doc.setTextColor(107, 114, 128)
    doc.text(truncate(getCategoryName(item.category), 14), x, y)
    x += colWidths.category

    // Stock sistema
    doc.setTextColor(0, 0, 0)
    doc.text(item.systemStock.toString(), x + colWidths.system / 2, y, { align: 'center' })
    x += colWidths.system

    // Conteo físico
    doc.setFont('helvetica', 'bold')
    doc.text(item.physicalCount.toString(), x + colWidths.count / 2, y, { align: 'center' })
    x += colWidths.count

    // Diferencia
    if (diff < 0) {
      doc.setTextColor(...redColor)
    } else if (diff > 0) {
      doc.setTextColor(...greenColor)
    } else {
      doc.setTextColor(0, 0, 0)
    }
    doc.text((diff > 0 ? '+' : '') + diff.toString(), x + colWidths.diff / 2, y, { align: 'center' })
    x += colWidths.diff

    // Valor diferencia
    doc.setFont('helvetica', 'normal')
    if (diff !== 0) {
      doc.text(formatCurrency(Math.abs(value)), x + colWidths.value - 1, y, { align: 'right' })
    } else {
      doc.setTextColor(156, 163, 175)
      doc.text('-', x + colWidths.value / 2, y, { align: 'center' })
    }

    y += rowHeight
  })

  // ========== PIE DE PÁGINA ==========
  y += 6
  checkNewPage(25)

  // Línea separadora
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // Diferencia neta
  const totalDiff = stats.totalSurplus - stats.totalMissing
  const totalValueDiff = stats.totalSurplusValue - stats.totalMissingValue

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('DIFERENCIA NETA:', margin, y)

  if (totalDiff < 0) {
    doc.setTextColor(...redColor)
  } else if (totalDiff > 0) {
    doc.setTextColor(...greenColor)
  }
  doc.text(`${totalDiff > 0 ? '+' : ''}${totalDiff} uds (${formatCurrency(Math.abs(totalValueDiff))})`, margin + 38, y)

  y += 12

  // Firmas
  doc.setTextColor(156, 163, 175)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('_________________________', margin, y)
  doc.text('_________________________', pageWidth - margin - 45, y)
  y += 4
  doc.text('Responsable del Conteo', margin, y)
  doc.text('Supervisor / Aprobación', pageWidth - margin - 45, y)

  // Número de página en el footer
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(156, 163, 175)
    doc.text(`Pág. ${i}/${totalPages} | ${dateStr} ${timeStr}`, pageWidth / 2, pageHeight - 5, { align: 'center' })
  }

  // Descargar el PDF
  const fileName = `recuento_inventario_${now.toISOString().split('T')[0]}.pdf`
  doc.save(fileName)

  return fileName
}
