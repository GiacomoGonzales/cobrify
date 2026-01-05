import jsPDF from 'jspdf'
import { formatDate } from '@/lib/utils'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { storage } from '@/lib/firebase'
import { ref, getDownloadURL, getBlob } from 'firebase/storage'

// Colores base
const DARK_GRAY = [55, 65, 81]
const LIGHT_GRAY = [120, 120, 120]
const BLACK = [0, 0, 0]
const WHITE = [255, 255, 255]
const RED = [220, 38, 38]

/**
 * Convierte un color hexadecimal a RGB
 */
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [30, 64, 175] // blue-800 por defecto
}

/**
 * Extrae el path de Firebase Storage desde una URL
 */
const getStoragePathFromUrl = (url) => {
  try {
    const match = url.match(/\/o\/(.+?)\?/)
    if (match) {
      const encodedPath = match[1]
      return decodeURIComponent(encodedPath)
    }
    return null
  } catch (error) {
    console.error('Error extrayendo path:', error)
    return null
  }
}

/**
 * Carga una imagen desde Firebase Storage y la convierte a base64
 */
const loadImageAsBase64 = async (url) => {
  try {
    const isNative = Capacitor.isNativePlatform()

    // En plataformas nativas, usar CapacitorHttp
    if (isNative) {
      try {
        const storagePath = getStoragePathFromUrl(url)
        let downloadUrl = url

        if (storagePath) {
          const storageRef = ref(storage, storagePath)
          downloadUrl = await getDownloadURL(storageRef)
        }

        const response = await CapacitorHttp.get({
          url: downloadUrl,
          responseType: 'blob'
        })

        if (response.status === 200 && response.data) {
          const base64Data = response.data
          const mimeType = url.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg'
          return `data:${mimeType};base64,${base64Data}`
        }
        throw new Error('No se pudo descargar la imagen')
      } catch (nativeError) {
        console.warn('CapacitorHttp falló, intentando Firebase SDK:', nativeError.message)
      }
    }

    // Método estándar: Firebase SDK
    const storagePath = getStoragePathFromUrl(url)

    if (storagePath) {
      const storageRef = ref(storage, storagePath)
      const blob = await getBlob(storageRef)

      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }

    // Fallback: cargar directamente
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = reject
      img.src = url
    })
  } catch (error) {
    console.error('Error cargando imagen:', error)
    return null
  }
}

/**
 * Carga imagen con reintentos
 */
const loadImageWithRetry = async (url, maxRetries = 2, timeout = 8000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        loadImageAsBase64(url),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeout)
        )
      ])

      if (result) return result
    } catch (error) {
      console.warn(`Intento ${attempt} falló:`, error.message)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  }
  return null
}

/**
 * Formatea fecha en español: "12 de Julio del 2025"
 */
const formatDateSpanish = (date) => {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]
  const d = new Date(date)
  return `${d.getDate()} de ${months[d.getMonth()]} del ${d.getFullYear()}`
}

/**
 * Formatea mes y año: "ENERO - 2026"
 */
const formatMonthYear = (date) => {
  const months = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ]
  const d = new Date(date)
  return `${months[d.getMonth()]} - ${d.getFullYear()}`
}

/**
 * Genera PDF de Certificado de Capacitación
 * Diseño limpio y compacto - Una sola página
 */
export const generateTrainingCertificatePDF = async (certificate, companySettings = {}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  // Color dinámico basado en la configuración
  const PRIMARY_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#c41e3a')
  // Color más claro para detalles secundarios
  const LIGHT_PRIMARY = [
    Math.min(255, PRIMARY_COLOR[0] + 40),
    Math.min(255, PRIMARY_COLOR[1] + 40),
    Math.min(255, PRIMARY_COLOR[2] + 40)
  ]

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentWidth = pageWidth - 2 * margin

  const companyName = companySettings?.businessName || 'EMPRESA DE EXTINTORES'
  const city = companySettings?.city || 'Lima'

  // ===== DECORACIÓN SUPERIOR =====
  // Barra principal de color
  doc.setFillColor(...PRIMARY_COLOR)
  doc.rect(0, 0, pageWidth, 8, 'F')

  // Franja secundaria más delgada
  doc.setFillColor(...LIGHT_PRIMARY)
  doc.rect(0, 8, pageWidth, 2, 'F')

  // Pequeños triángulos decorativos en las esquinas
  doc.setFillColor(...PRIMARY_COLOR)
  // Esquina superior izquierda
  doc.triangle(0, 10, 15, 10, 0, 25, 'F')
  // Esquina superior derecha
  doc.triangle(pageWidth, 10, pageWidth - 15, 10, pageWidth, 25, 'F')

  // ===== DECORACIÓN INFERIOR =====
  // Barra principal de color
  doc.setFillColor(...PRIMARY_COLOR)
  doc.rect(0, pageHeight - 8, pageWidth, 8, 'F')

  // Franja secundaria
  doc.setFillColor(...LIGHT_PRIMARY)
  doc.rect(0, pageHeight - 10, pageWidth, 2, 'F')

  // Pequeños triángulos decorativos en las esquinas inferiores
  doc.setFillColor(...PRIMARY_COLOR)
  // Esquina inferior izquierda
  doc.triangle(0, pageHeight - 10, 15, pageHeight - 10, 0, pageHeight - 25, 'F')
  // Esquina inferior derecha
  doc.triangle(pageWidth, pageHeight - 10, pageWidth - 15, pageHeight - 10, pageWidth, pageHeight - 25, 'F')

  // Línea decorativa vertical izquierda (sutil)
  doc.setDrawColor(...LIGHT_PRIMARY)
  doc.setLineWidth(0.5)
  doc.line(5, 30, 5, pageHeight - 30)

  // Línea decorativa vertical derecha (sutil)
  doc.line(pageWidth - 5, 30, pageWidth - 5, pageHeight - 30)

  let y = 18

  // ===== ENCABEZADO: 3 columnas - LOGO | DATOS EMPRESA | FECHA =====
  const headerY = y
  const colWidth = contentWidth / 3
  const leftColX = margin
  const centerColX = margin + colWidth
  const rightColX = margin + colWidth * 2

  // ===== COLUMNA IZQUIERDA: Logo (50% más grande) =====
  let logoHeight = 33 // 22 * 1.5 = 33 (50% más grande)
  if (companySettings?.logoUrl) {
    try {
      const imgData = await loadImageWithRetry(companySettings.logoUrl)
      if (imgData) {
        const img = new Image()
        img.src = imgData
        await new Promise((resolve) => {
          img.onload = resolve
          img.onerror = resolve
        })

        const maxLogoHeight = 33 // 50% más grande
        const maxLogoWidth = 55 // 50% más grande
        let logoWidth = img.width
        let currentLogoHeight = img.height

        if (currentLogoHeight > maxLogoHeight) {
          const ratio = maxLogoHeight / currentLogoHeight
          currentLogoHeight = maxLogoHeight
          logoWidth = logoWidth * ratio
        }
        if (logoWidth > maxLogoWidth) {
          const ratio = maxLogoWidth / logoWidth
          logoWidth = maxLogoWidth
          currentLogoHeight = currentLogoHeight * ratio
        }

        logoHeight = currentLogoHeight

        const format = companySettings.logoUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG'
        doc.addImage(imgData, format, leftColX, headerY, logoWidth, currentLogoHeight)
      }
    } catch (error) {
      console.warn('Error cargando logo:', error)
    }
  }

  // ===== COLUMNA CENTRAL: Datos de la empresa certificadora =====
  let infoY = headerY + 5

  // Nombre de la empresa certificadora (centrado)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY_COLOR)
  const companyNameLines = doc.splitTextToSize(companyName.toUpperCase(), colWidth - 5)
  companyNameLines.forEach(line => {
    doc.text(line, centerColX + colWidth / 2, infoY, { align: 'center' })
    infoY += 5
  })

  // RUC
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  if (companySettings?.ruc) {
    doc.text(`RUC: ${companySettings.ruc}`, centerColX + colWidth / 2, infoY, { align: 'center' })
    infoY += 4
  }

  // Dirección (compacta, centrada)
  if (companySettings?.address) {
    const addressLines = doc.splitTextToSize(companySettings.address, colWidth - 5)
    doc.text(addressLines[0], centerColX + colWidth / 2, infoY, { align: 'center' })
    infoY += 4
  }

  // Teléfono
  if (companySettings?.phone) {
    doc.text(`Tel: ${companySettings.phone}`, centerColX + colWidth / 2, infoY, { align: 'center' })
  }

  // ===== COLUMNA DERECHA: Fecha y N° certificado =====
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK_GRAY)

  // Ciudad y fecha
  doc.text(city, rightColX + colWidth - 5, headerY + 8, { align: 'right' })
  doc.text(formatDateSpanish(certificate.date), rightColX + colWidth - 5, headerY + 13, { align: 'right' })

  // Número de certificado
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text(`N° ${certificate.certificateNumber || ''}`, rightColX + colWidth - 5, headerY + 20, { align: 'right' })

  y = headerY + Math.max(logoHeight, 28) + 5

  // ===== TÍTULO "CERTIFICADO" =====
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text('CERTIFICADO', pageWidth / 2, y, { align: 'center' })

  // Línea debajo del título
  y += 3
  doc.setDrawColor(...PRIMARY_COLOR)
  doc.setLineWidth(0.8)
  const titleWidth = doc.getTextWidth('CERTIFICADO')
  doc.line((pageWidth - titleWidth) / 2 - 5, y, (pageWidth + titleWidth) / 2 + 5, y)

  // ===== TEXTO INTRODUCTORIO =====
  y += 12
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)

  // Primera línea con empresa destacada
  const introStart = 'Se otorga el siguiente certificado a la empresa: '
  doc.text(introStart, margin, y)

  const introStartWidth = doc.getTextWidth(introStart)
  doc.setFont('helvetica', 'bold')
  doc.text(certificate.customerName || '', margin + introStartWidth, y)

  y += 5
  doc.setFont('helvetica', 'normal')
  const rucText = `Con RUC: ${certificate.customerRuc || ''} con domicilio en ${certificate.customerAddress || ''}.`
  const rucLines = doc.splitTextToSize(rucText, contentWidth)
  doc.text(rucLines, margin, y)
  y += rucLines.length * 4.5

  // ===== TEXTO DE PARTICIPANTES =====
  y += 6
  doc.text('Por la participación de los siguientes colaboradores:', margin, y)

  // ===== TABLA DE PARTICIPANTES =====
  y += 6

  const participants = certificate.participants || []
  const colWidths = [12, 95, 40] // N°, APELLIDOS Y NOMBRES, DNI
  const tableWidth = colWidths.reduce((a, b) => a + b, 0)
  const tableX = (pageWidth - tableWidth) / 2
  const rowHeight = 6

  // Encabezado de tabla
  doc.setFillColor(...PRIMARY_COLOR)
  doc.rect(tableX, y, tableWidth, rowHeight + 1, 'F')

  doc.setTextColor(...WHITE)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')

  let colX = tableX + 2
  doc.text('N°', colX + colWidths[0] / 2 - 2, y + 4.5, { align: 'center' })
  colX += colWidths[0]
  doc.text('APELLIDOS Y NOMBRES', colX + colWidths[1] / 2, y + 4.5, { align: 'center' })
  colX += colWidths[1]
  doc.text('DNI', colX + colWidths[2] / 2, y + 4.5, { align: 'center' })

  y += rowHeight + 1

  // Filas de participantes
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  // Calcular altura máxima para que quepa en una página
  const maxParticipants = Math.min(participants.length, 15) // Máximo 15 para que quepa

  for (let i = 0; i < maxParticipants; i++) {
    const p = participants[i]

    // Alternar color de fondo
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(tableX, y, tableWidth, rowHeight, 'F')
    }

    // Bordes
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.2)
    doc.rect(tableX, y, tableWidth, rowHeight)

    // Datos
    colX = tableX + 2
    doc.text(String(i + 1), colX + colWidths[0] / 2 - 2, y + 4, { align: 'center' })
    colX += colWidths[0]
    doc.text(p.name || '', colX + 2, y + 4)
    colX += colWidths[1]
    doc.text(p.dni || '', colX + colWidths[2] / 2, y + 4, { align: 'center' })

    y += rowHeight
  }

  // Borde exterior de la tabla
  doc.setDrawColor(...PRIMARY_COLOR)
  doc.setLineWidth(0.5)
  const tableStartY = y - (maxParticipants * rowHeight)
  doc.rect(tableX, tableStartY - rowHeight - 1, tableWidth, (maxParticipants + 1) * rowHeight + 1)

  // ===== TEMAS CUBIERTOS =====
  const topics = certificate.topics || []
  if (topics.length > 0) {
    y += 8
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('Temas tratados:', margin, y)

    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)

    // Mostrar temas en formato compacto (separados por comas o en lista corta)
    const topicsText = topics.join(' • ')
    const topicsLines = doc.splitTextToSize(topicsText, contentWidth)

    // Limitar a 2 líneas máximo para que quepa
    const maxTopicLines = Math.min(topicsLines.length, 2)
    for (let i = 0; i < maxTopicLines; i++) {
      doc.text(topicsLines[i], margin, y)
      y += 3.5
    }
  }

  // ===== TEXTO DE CAPACITACIÓN =====
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)

  // Título de la capacitación (dinámico o por defecto)
  const trainingTitle = certificate.trainingTitle || 'USO Y MANEJO CORRECTO DEL EXTINTOR'

  const capacitacionText = `En la capacitación: `
  doc.text(capacitacionText, margin, y)

  doc.setFont('helvetica', 'bold')
  const capWidth = doc.getTextWidth(capacitacionText)

  // Si el título es muy largo, usar múltiples líneas
  const remainingWidth = contentWidth - capWidth
  const titleLines = doc.splitTextToSize(trainingTitle, remainingWidth - 10)

  if (titleLines.length === 1) {
    doc.text(trainingTitle, margin + capWidth, y)
    doc.setFont('helvetica', 'normal')
    const capTitleWidth = doc.getTextWidth(trainingTitle)
    doc.text(` realizado el ${formatDateSpanish(certificate.date)}.`, margin + capWidth + capTitleWidth, y)
  } else {
    // Título en múltiples líneas
    doc.text(titleLines[0], margin + capWidth, y)
    y += 4
    for (let i = 1; i < titleLines.length; i++) {
      doc.text(titleLines[i], margin, y)
      y += 4
    }
    doc.setFont('helvetica', 'normal')
    doc.text(`realizado el ${formatDateSpanish(certificate.date)}.`, margin, y)
  }

  y += 8
  doc.text('Se expide el siguiente certificado para los fines que estime convenientes.', margin, y)

  // ===== FIRMA =====
  y += 15
  doc.setFont('helvetica', 'italic')
  doc.text('Atentamente,', margin, y)

  // Área de firma (más abajo)
  y += 25
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.3)
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y)

  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(certificate.instructor || companyName, pageWidth / 2, y, { align: 'center' })

  // ===== PIE DE PÁGINA (arriba de la barra decorativa) =====
  const footerY = pageHeight - 18

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK_GRAY)

  // Info de contacto
  const phone = companySettings?.phone || ''
  const email = companySettings?.email || ''
  const address = companySettings?.address || ''
  const web = companySettings?.website || ''

  let footerText = ''
  if (phone) footerText += `Tel: ${phone}  `
  if (email) footerText += `Email: ${email}  `
  if (web) footerText += `Web: ${web}`

  if (footerText) {
    doc.text(footerText.trim(), pageWidth / 2, footerY - 3, { align: 'center' })
  }
  if (address) {
    doc.text(address, pageWidth / 2, footerY + 1, { align: 'center' })
  }

  // Guardar o descargar
  const fileName = `Certificado_Capacitacion_${certificate.certificateNumber}.pdf`
  await savePDF(doc, fileName)

  return doc
}

/**
 * Genera PDF de Certificado de Capacitación - VERSIÓN ANTERIOR (backup)
 * Con temas e instrucciones de uso
 */
export const generateTrainingCertificatePDFDetailed = async (certificate, companySettings = {}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const PRIMARY_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#1e40af')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin
  const companyName = companySettings?.businessName || 'EXTINTORES'

  let y = 25

  // Borde decorativo
  doc.setDrawColor(...PRIMARY_COLOR)
  doc.setLineWidth(1.5)
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20)

  // Logo centrado
  if (companySettings?.logoUrl) {
    try {
      const imgData = await loadImageWithRetry(companySettings.logoUrl)
      if (imgData) {
        const img = new Image()
        img.src = imgData
        await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve })

        let logoWidth = Math.min(img.width * 0.15, 40)
        let logoHeight = img.height * (logoWidth / img.width)
        if (logoHeight > 20) {
          logoHeight = 20
          logoWidth = img.width * (logoHeight / img.height)
        }

        const format = companySettings.logoUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG'
        doc.addImage(imgData, format, (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight)
        y += logoHeight + 5
      }
    } catch (error) {
      console.warn('Error cargando logo:', error)
    }
  }

  // Nombre empresa
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text(companyName, pageWidth / 2, y, { align: 'center' })
  y += 15

  // Título
  doc.setFontSize(20)
  doc.text('CERTIFICADO DE CAPACITACIÓN', pageWidth / 2, y, { align: 'center' })
  y += 15

  // Texto intro
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  doc.text(`Otorgado a: ${certificate.customerName || ''}`, pageWidth / 2, y, { align: 'center' })
  y += 12

  // Temas
  doc.setFont('helvetica', 'bold')
  doc.text('TEMAS:', margin + 5, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const topics = ['Química del fuego', 'Clasificación del fuego', 'Tipos de extintores', 'Uso correcto del extintor', 'Prevención de incendios']
  topics.forEach(t => {
    doc.text(`• ${t}`, margin + 10, y)
    y += 4
  })

  // Participantes
  if (certificate.participants?.length > 0) {
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('PARTICIPANTES:', margin + 5, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    certificate.participants.forEach((p, i) => {
      doc.text(`${i + 1}. ${p.name} - DNI: ${p.dni}`, margin + 10, y)
      y += 4
    })
  }

  // Firma
  y = pageHeight - 40
  doc.setDrawColor(...BLACK)
  doc.line(pageWidth / 2 - 25, y, pageWidth / 2 + 25, y)
  y += 4
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(certificate.instructor || 'INSTRUCTOR', pageWidth / 2, y, { align: 'center' })
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.text(formatDateSpanish(certificate.date), pageWidth / 2, y, { align: 'center' })

  const fileName = `Certificado_Capacitacion_Detallado_${certificate.certificateNumber}.pdf`
  await savePDF(doc, fileName)
  return doc
}

/**
 * Genera PDF de Protocolo de Garantía y Operatividad
 * Basado en el modelo: PROTOCOLO DE GARANTIA Y OPERATIVIDAD
 */
export const generateOperabilityCertificatePDF = async (certificate, companySettings = {}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  // Color dinámico basado en la configuración
  const PRIMARY_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#1e40af')
  const LIGHT_PRIMARY = [
    Math.min(255, PRIMARY_COLOR[0] + 40),
    Math.min(255, PRIMARY_COLOR[1] + 40),
    Math.min(255, PRIMARY_COLOR[2] + 40)
  ]

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin

  // Datos de la empresa certificadora
  const companyName = companySettings?.businessName || 'EMPRESA DE EXTINTORES'
  const companyRuc = companySettings?.ruc || ''

  // ===== DECORACIÓN SUPERIOR =====
  doc.setFillColor(...PRIMARY_COLOR)
  doc.rect(0, 0, pageWidth, 8, 'F')
  doc.setFillColor(...LIGHT_PRIMARY)
  doc.rect(0, 8, pageWidth, 2, 'F')
  // Triángulos decorativos
  doc.setFillColor(...PRIMARY_COLOR)
  doc.triangle(0, 10, 15, 10, 0, 25, 'F')
  doc.triangle(pageWidth, 10, pageWidth - 15, 10, pageWidth, 25, 'F')

  // ===== DECORACIÓN INFERIOR =====
  doc.setFillColor(...PRIMARY_COLOR)
  doc.rect(0, pageHeight - 8, pageWidth, 8, 'F')
  doc.setFillColor(...LIGHT_PRIMARY)
  doc.rect(0, pageHeight - 10, pageWidth, 2, 'F')
  doc.setFillColor(...PRIMARY_COLOR)
  doc.triangle(0, pageHeight - 10, 15, pageHeight - 10, 0, pageHeight - 25, 'F')
  doc.triangle(pageWidth, pageHeight - 10, pageWidth - 15, pageHeight - 10, pageWidth, pageHeight - 25, 'F')

  // Líneas decorativas verticales
  doc.setDrawColor(...LIGHT_PRIMARY)
  doc.setLineWidth(0.5)
  doc.line(5, 30, 5, pageHeight - 30)
  doc.line(pageWidth - 5, 30, pageWidth - 5, pageHeight - 30)

  let y = 18

  // ===== ENCABEZADO: 3 columnas - LOGO | DATOS EMPRESA | FECHA =====
  const headerY = y
  const colWidth = contentWidth / 3
  const leftColX = margin
  const centerColX = margin + colWidth
  const rightColX = margin + colWidth * 2

  // ===== COLUMNA IZQUIERDA: Logo =====
  let logoHeight = 30
  if (companySettings?.logoUrl) {
    try {
      const imgData = await loadImageWithRetry(companySettings.logoUrl)
      if (imgData) {
        const img = new Image()
        img.src = imgData
        await new Promise((resolve) => {
          img.onload = resolve
          img.onerror = resolve
        })

        const maxLogoHeight = 30
        const maxLogoWidth = 50
        let logoWidth = img.width
        let currentLogoHeight = img.height

        if (currentLogoHeight > maxLogoHeight) {
          const ratio = maxLogoHeight / currentLogoHeight
          currentLogoHeight = maxLogoHeight
          logoWidth = logoWidth * ratio
        }
        if (logoWidth > maxLogoWidth) {
          const ratio = maxLogoWidth / logoWidth
          logoWidth = maxLogoWidth
          currentLogoHeight = currentLogoHeight * ratio
        }

        logoHeight = currentLogoHeight

        const format = companySettings.logoUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG'
        doc.addImage(imgData, format, leftColX, headerY, logoWidth, currentLogoHeight)
      }
    } catch (error) {
      console.warn('Error cargando logo:', error)
    }
  }

  // ===== COLUMNA CENTRAL: Datos de la empresa certificadora =====
  let infoY = headerY + 5

  // Nombre de la empresa (centrado)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY_COLOR)
  const companyNameLines = doc.splitTextToSize(companyName.toUpperCase(), colWidth - 5)
  companyNameLines.forEach(line => {
    doc.text(line, centerColX + colWidth / 2, infoY, { align: 'center' })
    infoY += 5
  })

  // RUC
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  if (companySettings?.ruc) {
    doc.text(`RUC: ${companySettings.ruc}`, centerColX + colWidth / 2, infoY, { align: 'center' })
    infoY += 4
  }

  // Dirección
  if (companySettings?.address) {
    const addressLines = doc.splitTextToSize(companySettings.address, colWidth - 5)
    doc.text(addressLines[0], centerColX + colWidth / 2, infoY, { align: 'center' })
    infoY += 4
  }

  // Teléfono
  if (companySettings?.phone) {
    doc.text(`Tel: ${companySettings.phone}`, centerColX + colWidth / 2, infoY, { align: 'center' })
  }

  // ===== COLUMNA DERECHA: Fecha del servicio =====
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK_GRAY)
  doc.text(formatMonthYear(certificate.serviceDate), rightColX + colWidth - 5, headerY + 10, { align: 'right' })

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text(`N° ${certificate.certificateNumber}`, rightColX + colWidth - 5, headerY + 16, { align: 'right' })

  // ===== TÍTULO PRINCIPAL =====
  y = headerY + Math.max(logoHeight, 28) + 10

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text('PROTOCOLO DE GARANTIA Y OPERATIVIDAD', pageWidth / 2, y, { align: 'center' })

  y += 6
  doc.setFontSize(11)
  doc.text('SERVICIO DE RECARGA Y MANTENIMIENTO COMPLETO', pageWidth / 2, y, { align: 'center' })

  // Línea decorativa
  y += 6
  doc.setDrawColor(...PRIMARY_COLOR)
  doc.setLineWidth(1)
  doc.line(margin, y, pageWidth - margin, y)

  // Datos del cliente - valores alineados
  y += 10
  doc.setFontSize(10)
  doc.setTextColor(...BLACK)
  const labelX = margin
  const valueX = margin + 28 // Posición fija para todos los valores

  doc.setFont('helvetica', 'bold')
  doc.text('PARA:', labelX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(certificate.customerName || '', valueX, y)

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('RUC:', labelX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(certificate.customerRuc || '', valueX, y)

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('DIRECCIÓN:', labelX, y)
  doc.setFont('helvetica', 'normal')
  const addressLines = doc.splitTextToSize(certificate.customerAddress || '', contentWidth - 30)
  doc.text(addressLines, valueX, y)
  y += addressLines.length * 5

  // Fecha de revisión
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('REVISADO:', labelX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(formatMonthYear(certificate.expirationDate), valueX, y)

  // Línea separadora
  y += 8
  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)

  // Texto de garantía
  y += 8
  doc.setFontSize(9)
  doc.setTextColor(...BLACK)

  const guaranteeText = `La Empresa, ${companyName}, con RUC ${companyRuc || 'N/A'}, garantiza el estado óptimo de los extintores contra incendios descritos a continuación (Adjunto Cuadro), los cuales se encuentran a la fecha cargada y operativa según la Norma Técnica Peruana INDECOPI 350.043-1/2011 de la misma forma garantizamos que cuenten con la Prueba Hidrostática vigente.`

  const guaranteeLines = doc.splitTextToSize(guaranteeText, contentWidth)
  doc.text(guaranteeLines, margin, y)
  y += guaranteeLines.length * 4 + 5

  // Sección IMPORTANTE
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...RED)
  doc.text('IMPORTANTE:', margin, y)

  y += 6
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)

  const importantNotes = [
    'Los extintores de Polvo Químico Seco (PQS) contienen agente ABC al 75% de concentración de Fosfato Mono Amónico.',
    'Como mínimo realizar un mantenimiento completo del extintor una vez al año marcado según FECHA VENCIMIENTO.',
    'El precinto de seguridad cuenta con la marca MT en BAJO RELIEVE para garantizar la autenticidad de nuestro servicio.',
    'La vida útil de un extintor es como máximo 20 años desde su fabricación.',
    'Cada extintor se someterá a una Prueba Hidrostática cada 5 años o en lapsos menores si es sugerido mediante la inspección.',
    'De acuerdo a Norma vigente la inspección visual es responsabilidad del propietario como mínimo una vez al mes.',
    'El propietario velara por la correcta instalación del extintor en altura, visibilidad, accesibilidad y protección ante la intemperie.',
    'El incumplimiento de estas recomendaciones exime de toda responsabilidad a la empresa del mantenimiento.',
    'Borrones o enmendaduras anulan el presente documento.'
  ]

  importantNotes.forEach((note) => {
    const noteLines = doc.splitTextToSize(`• ${note}`, contentWidth - 5)
    doc.text(noteLines, margin + 2, y)
    y += noteLines.length * 3.5 + 1
  })

  // Tabla de extintores
  y += 5

  // Encabezados de tabla - anchos que suman exactamente contentWidth (180mm)
  const tableX = margin
  const tableWidth = contentWidth
  // Distribución: N°(8) + CAP(16) + SERIE(22) + TIPO(22) + F.FAB(28) + P.HIDRO(42) + RECARGA(42) = 180
  const colWidths = [8, 16, 22, 22, 28, 42, 42]
  const headers = ['N°', 'CAP.', 'SERIE', 'TIPO', 'F. FABRIC.', 'PROX. P. HIDROST.', 'PROX. RECARGA']
  const rowHeight = 7

  // Fondo del encabezado
  doc.setFillColor(...PRIMARY_COLOR)
  doc.rect(tableX, y, tableWidth, rowHeight, 'F')

  // Texto del encabezado
  doc.setTextColor(...WHITE)
  doc.setFontSize(6)
  doc.setFont('helvetica', 'bold')

  let colX = tableX
  headers.forEach((header, i) => {
    const cellCenter = colX + colWidths[i] / 2
    doc.text(header, cellCenter, y + 4.5, { align: 'center' })
    colX += colWidths[i]
  })

  y += rowHeight

  // Filas de datos
  const extinguishers = certificate.extinguishers || []
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)

  extinguishers.forEach((ext, index) => {
    // Alternar color de fondo
    if (index % 2 === 0) {
      doc.setFillColor(245, 247, 250)
      doc.rect(tableX, y, tableWidth, rowHeight, 'F')
    }

    // Calcular fechas - formato más corto
    const fabricDate = ext.fabricationDate ? formatMonthYear(ext.fabricationDate) : '-'
    const nextHydroTest = ext.nextHydrostaticTest ? formatMonthYear(ext.nextHydrostaticTest) : '-'
    const nextRecharge = certificate.expirationDate ? formatMonthYear(certificate.expirationDate) : '-'

    colX = tableX
    const rowData = [
      String(index + 1),
      ext.capacity || '',
      ext.serial || '',
      ext.type || 'PQS',
      fabricDate,
      nextHydroTest,
      nextRecharge
    ]

    // Límites de caracteres por columna
    const maxChars = [3, 8, 12, 8, 15, 18, 18]

    rowData.forEach((value, i) => {
      const cellCenter = colX + colWidths[i] / 2
      const text = value.length > maxChars[i] ? value.substring(0, maxChars[i] - 1) + '.' : value
      doc.text(text, cellCenter, y + 4.5, { align: 'center' })
      colX += colWidths[i]
    })

    y += rowHeight

    // Verificar si necesitamos nueva página
    if (y > pageHeight - 50 && index < extinguishers.length - 1) {
      doc.addPage()
      y = 20
    }
  })

  // Bordes de la tabla
  doc.setDrawColor(...DARK_GRAY)
  doc.setLineWidth(0.3)

  // Borde exterior
  const tableStartY = y - (extinguishers.length + 1) * rowHeight
  doc.rect(tableX, tableStartY, tableWidth, (extinguishers.length + 1) * rowHeight)

  // Líneas verticales
  colX = tableX
  colWidths.forEach((width, i) => {
    if (i > 0) {
      doc.line(colX, tableStartY, colX, y)
    }
    colX += width
  })

  // Firma y datos de la empresa
  y = pageHeight - 35

  // Línea de firma
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.3)
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y)

  y += 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(certificate.technician || 'TÉCNICO RESPONSABLE', pageWidth / 2, y, { align: 'center' })

  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(companyName, pageWidth / 2, y, { align: 'center' })

  // Pie de página
  y = pageHeight - 15
  doc.setFontSize(7)
  doc.setTextColor(...LIGHT_GRAY)
  const companyAddress = companySettings?.address || ''
  const companyPhone = companySettings?.phone ? `CEL. ${companySettings.phone}` : ''
  if (companyAddress || companyPhone) {
    doc.text(`${companyAddress} ${companyPhone}`.trim(), pageWidth / 2, y, { align: 'center' })
  }

  // Guardar o descargar
  const fileName = `Protocolo_Operatividad_${certificate.certificateNumber}.pdf`
  await savePDF(doc, fileName)

  return doc
}

/**
 * Guarda el PDF (descarga en web, comparte en móvil)
 */
const savePDF = async (doc, fileName) => {
  const isNative = Capacitor.isNativePlatform()

  if (isNative) {
    try {
      const pdfOutput = doc.output('datauristring')
      const base64Data = pdfOutput.split(',')[1]

      const pdfDir = 'Certificados'

      // Crear directorio si no existe
      try {
        await Filesystem.mkdir({
          path: pdfDir,
          directory: Directory.Documents,
          recursive: true
        })
      } catch (mkdirError) {
        console.log('Directorio ya existe:', mkdirError)
      }

      const result = await Filesystem.writeFile({
        path: `${pdfDir}/${fileName}`,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true
      })

      console.log('PDF guardado en:', result.uri)

      try {
        await Share.share({
          title: fileName,
          text: `Certificado: ${fileName}`,
          url: result.uri,
          dialogTitle: 'Compartir Certificado'
        })
      } catch (shareError) {
        console.log('Compartir cancelado o no disponible:', shareError)
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
