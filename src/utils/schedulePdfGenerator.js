import jsPDF from 'jspdf'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { DAY_KEYS, DAY_LABELS } from '@/services/scheduleService'

/**
 * Genera un PDF horizontal con el horario semanal del equipo.
 *
 * @param {Object}   options
 * @param {Array}    options.employees       - Array de empleados ({ id, displayName, jobTitle, email })
 * @param {Object}   options.schedules       - { [userId]: { days: {mon:{},tue:{},...}, totalHours, publishedAt } }
 * @param {Date[]}   options.weekDates       - Array de 7 Date (lunes..domingo)
 * @param {number}   options.isoYear
 * @param {number}   options.isoWeek
 * @param {Object}   [options.businessInfo]  - { businessName, address, logoUrl }
 * @param {boolean}  [options.download=true] - true descarga / false retorna el doc
 */
export const generateSchedulePDF = async ({
  employees = [],
  schedules = {},
  weekDates = [],
  isoYear,
  isoWeek,
  businessInfo = {},
  download = true,
}) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()   // 297 mm
  const pageHeight = doc.internal.pageSize.getHeight() // 210 mm
  const margin = 8
  const contentWidth = pageWidth - 2 * margin

  let y = margin

  // ============= ENCABEZADO =============
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(31, 41, 55)
  doc.text('HORARIO SEMANAL DEL PERSONAL', pageWidth / 2, y + 4, { align: 'center' })

  y += 8
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(75, 85, 99)
  if (businessInfo?.businessName) {
    doc.text(businessInfo.businessName, pageWidth / 2, y + 4, { align: 'center' })
    y += 5
  }

  // Rango de fechas
  const monday = weekDates[0]
  const sunday = weekDates[6]
  const fmtDate = (d) =>
    d
      ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
      : ''
  const rangeText = monday && sunday
    ? `Semana ${isoWeek} · ${isoYear}    (${fmtDate(monday)} – ${fmtDate(sunday)})`
    : `Semana ${isoWeek} · ${isoYear}`
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  doc.text(rangeText, pageWidth / 2, y + 4, { align: 'center' })
  y += 9

  // Línea separadora
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 4

  // ============= TABLA =============
  // Distribución de columnas (Empleado + 7 días + Total)
  const employeeColWidth = 50
  const totalColWidth = 18
  const dayColWidth = (contentWidth - employeeColWidth - totalColWidth) / 7

  const headerHeight = 10
  const rowHeight = 13

  const drawTableHeader = (startY) => {
    // Fondo header
    doc.setFillColor(55, 65, 81) // gray-700
    doc.rect(margin, startY, contentWidth, headerHeight, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')

    // Columna empleado
    doc.text('EMPLEADO', margin + 3, startY + 6.5)

    // Columnas por día
    let x = margin + employeeColWidth
    DAY_KEYS.forEach((dk, idx) => {
      const date = weekDates[idx]
      const dayLabel = DAY_LABELS[dk] || dk
      const dateLabel = date
        ? date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })
        : ''
      doc.setFontSize(9)
      doc.text(dayLabel.toUpperCase(), x + dayColWidth / 2, startY + 4.5, { align: 'center' })
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(dateLabel, x + dayColWidth / 2, startY + 8.5, { align: 'center' })
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      x += dayColWidth
    })

    // Columna total
    doc.text('TOTAL', x + totalColWidth / 2, startY + 6.5, { align: 'center' })
  }

  drawTableHeader(y)
  y += headerHeight

  // Filas
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(31, 41, 55)
  doc.setFontSize(9)

  const renderCell = (cell, x, rowY) => {
    const cellW = dayColWidth - 1.5
    const cellH = rowHeight - 1.5
    const cellX = x + 0.75
    const cellY = rowY + 0.75

    if (!cell) {
      // celda vacía
      doc.setDrawColor(229, 231, 235)
      doc.setLineWidth(0.2)
      doc.setLineDashPattern([0.6, 0.6], 0)
      doc.roundedRect(cellX, cellY, cellW, cellH, 1, 1, 'S')
      doc.setLineDashPattern([], 0)
      doc.setTextColor(209, 213, 219)
      doc.setFontSize(11)
      doc.text('—', x + dayColWidth / 2, rowY + rowHeight / 2 + 1.5, { align: 'center' })
      doc.setFontSize(9)
      doc.setTextColor(31, 41, 55)
      return
    }

    if (cell.rest) {
      doc.setFillColor(243, 244, 246) // gray-100
      doc.roundedRect(cellX, cellY, cellW, cellH, 1, 1, 'F')
      doc.setTextColor(107, 114, 128)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('DESCANSO', x + dayColWidth / 2, rowY + rowHeight / 2 + 1, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(31, 41, 55)
      return
    }

    // Turno con horario
    const color = parseHex(cell.color || '#fbbf24')
    doc.setFillColor(color.r, color.g, color.b)
    // Fondo suave (mezcla 80% blanco + 20% color)
    const bg = mixWithWhite(color, 0.18)
    doc.setFillColor(bg.r, bg.g, bg.b)
    doc.setDrawColor(color.r, color.g, color.b)
    doc.setLineWidth(0.3)
    doc.roundedRect(cellX, cellY, cellW, cellH, 1, 1, 'FD')

    doc.setTextColor(31, 41, 55)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const timeText = `${cell.start || ''} - ${cell.end || ''}`
    doc.text(timeText, x + dayColWidth / 2, rowY + rowHeight / 2 + 0.5, { align: 'center' })

    if (cell.breakMinutes > 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(107, 114, 128)
      doc.text(`break ${cell.breakMinutes}m`, x + dayColWidth / 2, rowY + rowHeight - 2, { align: 'center' })
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(31, 41, 55)
  }

  let zebra = false
  employees.forEach((emp) => {
    // Salto de página si no entra la fila siguiente
    if (y + rowHeight > pageHeight - 12) {
      // Pie con número de página
      drawFooter(doc, pageWidth, pageHeight, margin)
      doc.addPage('a4', 'landscape')
      y = margin
      // Reusar header de tabla en cada página
      drawTableHeader(y)
      y += headerHeight
    }

    // Zebra
    if (zebra) {
      doc.setFillColor(249, 250, 251)
      doc.rect(margin, y, contentWidth, rowHeight, 'F')
    }
    zebra = !zebra

    // Border bottom suave
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.2)
    doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight)

    const sch = schedules[emp.id] || { days: {}, totalHours: 0 }

    // Nombre + cargo
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(31, 41, 55)
    const name = truncate(emp.displayName || emp.email || 'Sin nombre', 32)
    doc.text(name, margin + 3, y + 5.5)
    if (emp.jobTitle) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(107, 114, 128)
      doc.text(truncate(emp.jobTitle, 36), margin + 3, y + 9.5)
    }

    // Celdas por día
    let x = margin + employeeColWidth
    DAY_KEYS.forEach((dk) => {
      const cell = sch.days?.[dk]
      renderCell(cell, x, y)
      x += dayColWidth
    })

    // Total horas
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor((sch.totalHours > 0) ? 31 : 156, (sch.totalHours > 0) ? 41 : 163, (sch.totalHours > 0) ? 55 : 175)
    doc.text(`${Number(sch.totalHours || 0).toFixed(1)}h`, x + totalColWidth - 3, y + rowHeight / 2 + 1, { align: 'right' })
    doc.setTextColor(31, 41, 55)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    y += rowHeight
  })

  // Si no hay empleados
  if (employees.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(107, 114, 128)
    doc.text('No hay empleados asignados.', pageWidth / 2, y + 12, { align: 'center' })
  }

  // ============= LEYENDA =============
  y += 6
  if (y > pageHeight - 20) {
    drawFooter(doc, pageWidth, pageHeight, margin)
    doc.addPage('a4', 'landscape')
    y = margin
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(75, 85, 99)
  doc.text('Leyenda:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text('— = sin turno asignado    |    DESCANSO = día libre    |    HH:MM - HH:MM = horario del turno', margin + 14, y)

  drawFooter(doc, pageWidth, pageHeight, margin)

  // ============= SALIDA =============
  if (download) {
    const fileName = `Horario_S${isoWeek}_${isoYear}.pdf`
    const isNative = Capacitor.isNativePlatform()

    if (isNative) {
      try {
        const pdfOutput = doc.output('datauristring')
        const base64Data = pdfOutput.split(',')[1]

        const pdfDir = 'PDFs'
        try {
          await Filesystem.mkdir({
            path: pdfDir,
            directory: Directory.Documents,
            recursive: true,
          })
        } catch (e) {
          /* dir ya existe */
        }

        const result = await Filesystem.writeFile({
          path: `${pdfDir}/${fileName}`,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true,
        })

        try {
          await Share.share({
            title: fileName,
            text: `Horario semana ${isoWeek}/${isoYear}`,
            url: result.uri,
            dialogTitle: 'Compartir horario',
          })
        } catch (e) {
          /* compartir cancelado */
        }

        return { success: true, uri: result.uri, fileName }
      } catch (error) {
        console.error('Error al guardar PDF en móvil:', error)
        throw error
      }
    } else {
      doc.save(fileName)
    }
  }

  return doc
}

// =========================
// Helpers
// =========================

function drawFooter(doc, pageWidth, pageHeight, margin) {
  const totalPages = doc.internal.getNumberOfPages()
  const current = doc.internal.getCurrentPageInfo().pageNumber
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(156, 163, 175)
  const generatedAt = new Date().toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  doc.text(`Generado: ${generatedAt}`, margin, pageHeight - 5)
  doc.text(`Página ${current} de ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' })
}

function parseHex(hex) {
  const cleaned = (hex || '#fbbf24').replace('#', '')
  const bigint = parseInt(cleaned, 16)
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  }
}

function mixWithWhite({ r, g, b }, alpha = 0.2) {
  // alpha = porcentaje del color (resto se cubre con blanco)
  return {
    r: Math.round(r * alpha + 255 * (1 - alpha)),
    g: Math.round(g * alpha + 255 * (1 - alpha)),
    b: Math.round(b * alpha + 255 * (1 - alpha)),
  }
}

function truncate(str, n) {
  const s = String(str || '')
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
