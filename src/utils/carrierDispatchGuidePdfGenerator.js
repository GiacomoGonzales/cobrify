import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

const TRANSFER_REASONS = {
  '01': 'Venta',
  '02': 'Compra',
  '04': 'Traslado entre establecimientos',
  '08': 'Importación',
  '09': 'Exportación',
  '13': 'Otros',
}

/**
 * Formatea una fecha para mostrar en el PDF
 */
const formatDate = (dateValue) => {
  if (!dateValue) return '-'

  try {
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      const [year, month, day] = dateValue.split('-')
      return `${day}/${month}/${year}`
    }

    let date
    if (typeof dateValue === 'string') {
      date = new Date(dateValue + 'T12:00:00')
    } else if (dateValue.toDate) {
      date = dateValue.toDate()
    } else if (dateValue instanceof Date) {
      date = dateValue
    } else {
      return '-'
    }

    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  } catch {
    return '-'
  }
}

/**
 * Genera el código QR para la guía de remisión transportista
 */
const generateGuideQR = async (guide, companySettings) => {
  try {
    const [serie = '', numero = ''] = (guide.number || '').split('-')

    const qrData = [
      companySettings?.ruc || '',
      '31', // Tipo de documento: Guía de Remisión Transportista
      serie,
      numero,
      guide.transferDate || '',
      guide.destination?.address || ''
    ].join('|')

    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 1,
      errorCorrectionLevel: 'M'
    })

    return qrDataUrl
  } catch (error) {
    console.error('Error generando QR:', error)
    return null
  }
}

/**
 * Dibuja un checkbox
 */
const drawCheckbox = (doc, x, y, size, checked) => {
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.rect(x, y, size, size)

  if (checked) {
    doc.setFillColor(0, 0, 0)
    doc.rect(x + 0.8, y + 0.8, size - 1.6, size - 1.6, 'F')
  }
}

/**
 * Genera PDF de Guía de Remisión Transportista
 */
export const generateCarrierDispatchGuidePDF = async (guide, companySettings) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 10
  let y = margin

  // Colores
  const orangeColor = [234, 88, 12] // Orange-600
  const grayColor = [75, 85, 99]
  const blackColor = [0, 0, 0]

  // ========== HEADER ==========
  doc.setFillColor(...orangeColor)
  doc.rect(0, 0, pageWidth, 35, 'F')

  // Título
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('GUÍA DE REMISIÓN ELECTRÓNICA', margin, 15)

  doc.setFontSize(14)
  doc.text('TRANSPORTISTA', margin, 23)

  // Número de guía
  doc.setFontSize(12)
  doc.text(guide.number || 'V001-00000001', pageWidth - margin, 15, { align: 'right' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Código: 31', pageWidth - margin, 22, { align: 'right' })
  doc.text(`Fecha: ${formatDate(guide.transferDate)}`, pageWidth - margin, 28, { align: 'right' })

  y = 42

  // ========== DATOS DEL TRANSPORTISTA (EMISOR) ==========
  doc.setTextColor(...orangeColor)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('DATOS DEL TRANSPORTISTA (EMISOR)', margin, y)
  y += 5

  doc.setTextColor(...blackColor)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')

  doc.text(`RUC: ${companySettings?.ruc || '-'}`, margin, y)
  doc.text(`Razón Social: ${companySettings?.businessName || companySettings?.name || '-'}`, margin + 50, y)
  y += 5

  // ========== DATOS DEL REMITENTE ==========
  y += 3
  doc.setTextColor(...orangeColor)
  doc.setFont('helvetica', 'bold')
  doc.text('DATOS DEL REMITENTE', margin, y)
  y += 5

  doc.setTextColor(...blackColor)
  doc.setFont('helvetica', 'normal')

  doc.text(`RUC: ${guide.shipper?.ruc || '-'}`, margin, y)
  doc.text(`Razón Social: ${guide.shipper?.businessName || '-'}`, margin + 50, y)
  y += 7

  // ========== DATOS DEL DESTINATARIO ==========
  doc.setTextColor(...orangeColor)
  doc.setFont('helvetica', 'bold')
  doc.text('DATOS DEL DESTINATARIO', margin, y)
  y += 5

  doc.setTextColor(...blackColor)
  doc.setFont('helvetica', 'normal')

  const recipientDocType = guide.recipient?.documentType === '6' ? 'RUC' : 'DNI'
  doc.text(`${recipientDocType}: ${guide.recipient?.documentNumber || '-'}`, margin, y)
  doc.text(`Nombre: ${guide.recipient?.name || '-'}`, margin + 50, y)
  y += 7

  // ========== DATOS DEL TRASLADO ==========
  doc.setTextColor(...orangeColor)
  doc.setFont('helvetica', 'bold')
  doc.text('DATOS DEL TRASLADO', margin, y)
  y += 5

  doc.setTextColor(...blackColor)
  doc.setFont('helvetica', 'normal')

  doc.text(`Motivo: ${TRANSFER_REASONS[guide.transferReason] || guide.transferReason || '-'}`, margin, y)
  doc.text(`Peso Total: ${guide.totalWeight || 0} KG`, margin + 80, y)
  y += 7

  // ========== ORIGEN Y DESTINO ==========
  doc.setTextColor(...orangeColor)
  doc.setFont('helvetica', 'bold')
  doc.text('PUNTO DE PARTIDA', margin, y)
  y += 5

  doc.setTextColor(...blackColor)
  doc.setFont('helvetica', 'normal')
  doc.text(`Dirección: ${guide.origin?.address || '-'}`, margin, y)
  y += 4
  doc.text(`Ubigeo: ${guide.origin?.ubigeo || '-'}`, margin, y)
  y += 7

  doc.setTextColor(...orangeColor)
  doc.setFont('helvetica', 'bold')
  doc.text('PUNTO DE LLEGADA', margin, y)
  y += 5

  doc.setTextColor(...blackColor)
  doc.setFont('helvetica', 'normal')
  doc.text(`Dirección: ${guide.destination?.address || '-'}`, margin, y)
  y += 4
  doc.text(`Ubigeo: ${guide.destination?.ubigeo || '-'}`, margin, y)
  y += 7

  // ========== VEHÍCULO Y CONDUCTOR ==========
  doc.setTextColor(...orangeColor)
  doc.setFont('helvetica', 'bold')
  doc.text('VEHÍCULO Y CONDUCTOR', margin, y)
  y += 5

  doc.setTextColor(...blackColor)
  doc.setFont('helvetica', 'normal')

  doc.text(`Placa: ${guide.vehicle?.plate || '-'}`, margin, y)
  doc.text(`Autorización MTC: ${guide.vehicle?.mtcAuthorization || '-'}`, margin + 50, y)
  y += 5

  const driverFullName = [guide.driver?.name, guide.driver?.lastName].filter(Boolean).join(' ') || '-'
  doc.text(`Conductor: ${driverFullName}`, margin, y)
  doc.text(`DNI: ${guide.driver?.documentNumber || '-'}`, margin + 80, y)
  y += 5

  doc.text(`Licencia: ${guide.driver?.license || '-'}`, margin, y)
  y += 10

  // ========== BIENES A TRANSPORTAR ==========
  doc.setTextColor(...orangeColor)
  doc.setFont('helvetica', 'bold')
  doc.text('BIENES A TRANSPORTAR', margin, y)
  y += 6

  // Cabecera de tabla
  doc.setFillColor(249, 250, 251)
  doc.rect(margin, y - 1, pageWidth - 2 * margin, 7, 'F')

  doc.setTextColor(...grayColor)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('#', margin + 2, y + 4)
  doc.text('DESCRIPCIÓN', margin + 12, y + 4)
  doc.text('CANT.', pageWidth - margin - 30, y + 4)
  doc.text('UNIDAD', pageWidth - margin - 15, y + 4)
  y += 8

  // Items
  doc.setTextColor(...blackColor)
  doc.setFont('helvetica', 'normal')

  const items = guide.items || []
  items.forEach((item, index) => {
    if (y > pageHeight - 40) {
      doc.addPage()
      y = margin
    }

    doc.text(String(index + 1), margin + 2, y)
    doc.text(String(item.description || '-').substring(0, 60), margin + 12, y)
    doc.text(String(item.quantity || 0), pageWidth - margin - 30, y)
    doc.text(String(item.unit || 'NIU'), pageWidth - margin - 15, y)
    y += 5
  })

  y += 5

  // ========== GRE REMITENTE RELACIONADA ==========
  if (guide.relatedGuides && guide.relatedGuides.length > 0) {
    doc.setTextColor(...orangeColor)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('GRE REMITENTE RELACIONADA', margin, y)
    y += 5

    doc.setTextColor(...blackColor)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)

    guide.relatedGuides.forEach((related) => {
      if (related.number) {
        doc.text(`${related.number} - RUC: ${related.ruc || '-'}`, margin, y)
        y += 4
      }
    })
    y += 3
  }

  // ========== QR CODE ==========
  try {
    const qrDataUrl = await generateGuideQR(guide, companySettings)
    if (qrDataUrl) {
      const qrSize = 30
      const qrX = pageWidth - margin - qrSize
      const qrY = pageHeight - margin - qrSize - 10

      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

      doc.setTextColor(...grayColor)
      doc.setFontSize(7)
      doc.text('Escanea para verificar', qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' })
    }
  } catch (error) {
    console.error('Error agregando QR:', error)
  }

  // ========== FOOTER ==========
  doc.setTextColor(...grayColor)
  doc.setFontSize(7)
  doc.text(
    'GUÍA DE REMISIÓN ELECTRÓNICA - TRANSPORTISTA | Código 31 | Autorizado por SUNAT',
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  )

  // ========== GUARDAR PDF ==========
  const fileName = `GRE-T-${guide.number || 'V001-00000001'}.pdf`

  if (Capacitor.isNativePlatform()) {
    try {
      const pdfOutput = doc.output('datauristring')
      const base64Data = pdfOutput.split(',')[1]

      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      })

      await Share.share({
        title: `GRE Transportista ${guide.number}`,
        text: 'Guía de Remisión Electrónica Transportista',
        url: result.uri,
        dialogTitle: 'Compartir Guía de Remisión',
      })
    } catch (error) {
      console.error('Error en plataforma nativa:', error)
      doc.save(fileName)
    }
  } else {
    doc.save(fileName)
  }

  return doc
}
