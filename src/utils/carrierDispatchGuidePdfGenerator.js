import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import { storage } from '@/lib/firebase'
import { ref, getDownloadURL, getBlob } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'

const TRANSFER_REASONS = {
  '01': 'Venta',
  '02': 'Compra',
  '04': 'Traslado entre establecimientos',
  '08': 'Importación',
  '09': 'Exportación',
  '13': 'Otros',
}

const TRANSPORT_TYPES = {
  '01': 'Público',
  '02': 'Privado',
}

/**
 * Obtiene el nombre de ubicación desde códigos de ubigeo
 */
const getLocationName = (departamento, provincia, distrito) => {
  const parts = []

  if (distrito && departamento && provincia) {
    const distList = DISTRITOS[`${departamento}${provincia}`] || []
    const dist = distList.find(d => d.code === distrito)
    if (dist) parts.push(dist.name)
  }

  if (provincia && departamento) {
    const provList = PROVINCIAS[departamento] || []
    const prov = provList.find(p => p.code === provincia)
    if (prov) parts.push(prov.name)
  }

  if (departamento) {
    const dept = DEPARTAMENTOS.find(d => d.code === departamento)
    if (dept) parts.push(dept.name)
  }

  return parts.join(', ')
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
 * Genera el código QR para la guía de remisión transportista
 */
const generateGuideQR = async (guide, companySettings) => {
  try {
    const [serie = '', numero = ''] = (guide.number || '').split('-')

    const qrData = [
      companySettings?.ruc || '',
      '31', // Tipo de documento: GRE Transportista
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
 * Genera un PDF para Guía de Remisión Transportista - Diseño Profesional
 * Basado en el estilo visual de facturas y guías remitente
 * Con soporte para paginación dinámica cuando hay muchos items
 */
export const generateCarrierDispatchGuidePDF = async (guide, companySettings, download = true) => {
  const doc = new jsPDF({
    orientation: 'portrait', // Formato vertical
    unit: 'pt',
    format: 'a4'
  })

  // Colores (mismo estilo que facturas y guías remitente)
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [100, 100, 100]
  const LIGHT_GRAY = [200, 200, 200]
  const ACCENT_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#464646')

  // Márgenes y dimensiones
  const MARGIN_LEFT = 30
  const MARGIN_RIGHT = 30
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  // Constantes para paginación
  const MARGIN_TOP = 25
  const MARGIN_BOTTOM = 40
  const FOOTER_HEIGHT = 120 // Espacio reservado para el footer con QR

  let currentY = MARGIN_TOP
  let currentPage = 1
  let totalPages = 1 // Se calculará después

  // Función helper para verificar espacio y agregar nueva página si es necesario
  const checkPageBreak = (neededHeight, reserveFooter = false) => {
    const maxY = reserveFooter ? PAGE_HEIGHT - MARGIN_BOTTOM - FOOTER_HEIGHT : PAGE_HEIGHT - MARGIN_BOTTOM
    if (currentY + neededHeight > maxY) {
      doc.addPage()
      currentPage++
      currentY = MARGIN_TOP

      // Header reducido en páginas siguientes
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...BLACK)
      doc.text(`GRE TRANSPORTISTA ELECTRÓNICA - ${guide.number || 'V001-00000001'}`, MARGIN_LEFT, currentY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...MEDIUM_GRAY)
      doc.text(`(Continuación - Página ${currentPage})`, PAGE_WIDTH - MARGIN_RIGHT, currentY, { align: 'right' })
      currentY += 20

      // Línea separadora
      doc.setDrawColor(...LIGHT_GRAY)
      doc.setLineWidth(0.5)
      doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
      currentY += 15

      return true // Indica que se creó nueva página
    }
    return false
  }

  // Extraer datos
  const shipper = guide.shipper || {}
  const recipient = guide.recipient || {}
  const driver = guide.driver || {}
  const vehicle = guide.vehicle || {}
  const origin = guide.origin || {}
  const destination = guide.destination || {}
  const items = guide.items || []
  const drivers = guide.drivers || [driver]
  const vehicles = guide.vehicles || [vehicle]
  const transportType = guide.transportType || '02'
  const transferDescription = guide.transferDescription || ''
  const observations = guide.observations || ''
  const isM1OrLVehicle = guide.isM1OrLVehicle || false

  // ========== 1. ENCABEZADO ==========
  const headerHeight = 85
  const defaultLogoWidth = 60
  const docBoxWidth = 140

  // Logo
  const logoX = MARGIN_LEFT
  const logoY = currentY
  let actualLogoWidth = defaultLogoWidth // Ancho real del logo (se actualiza dinámicamente)

  if (companySettings?.logoUrl) {
    try {
      const imgData = await Promise.race([
        loadImageAsBase64(companySettings.logoUrl),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
      ])

      let format = 'PNG'
      if (companySettings.logoUrl.toLowerCase().includes('.jpg') ||
          companySettings.logoUrl.toLowerCase().includes('.jpeg')) {
        format = 'JPEG'
      }

      const img = new Image()
      img.src = imgData
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })

      const aspectRatio = img.width / img.height
      const maxLogoHeight = headerHeight - 10
      // Ancho máximo: hasta donde empieza el recuadro del documento menos margen
      const maxAllowedWidth = CONTENT_WIDTH - docBoxWidth - 30
      let finalLogoWidth, finalLogoHeight

      if (aspectRatio >= 3) {
        // Logo EXTREMADAMENTE horizontal (3:1 o más): permitir más ancho
        finalLogoHeight = 45
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxAllowedWidth) {
          finalLogoWidth = maxAllowedWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
        if (finalLogoHeight < 35) {
          finalLogoHeight = 35
          finalLogoWidth = finalLogoHeight * aspectRatio
        }
      } else if (aspectRatio >= 2.5) {
        // Logo MUY horizontal (2.5:1 a 3:1)
        finalLogoHeight = 50
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxAllowedWidth) {
          finalLogoWidth = maxAllowedWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
        if (finalLogoHeight < 38) {
          finalLogoHeight = 38
          finalLogoWidth = finalLogoHeight * aspectRatio
        }
      } else if (aspectRatio >= 2) {
        // Logo muy horizontal (2:1 a 2.5:1)
        finalLogoHeight = maxLogoHeight * 0.7
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxAllowedWidth * 0.6) {
          finalLogoWidth = maxAllowedWidth * 0.6
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      } else if (aspectRatio >= 1.3) {
        // Logo horizontal moderado (1.3:1 a 2:1)
        finalLogoHeight = maxLogoHeight * 0.85
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxAllowedWidth * 0.5) {
          finalLogoWidth = maxAllowedWidth * 0.5
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      } else if (aspectRatio >= 1) {
        // Logo cuadrado o casi cuadrado
        finalLogoHeight = maxLogoHeight * 0.85
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > defaultLogoWidth + 10) {
          finalLogoWidth = defaultLogoWidth + 10
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      } else {
        // Logo vertical
        finalLogoHeight = maxLogoHeight
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > defaultLogoWidth) {
          finalLogoWidth = defaultLogoWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      }

      actualLogoWidth = finalLogoWidth // Guardar el ancho real para posicionar el texto
      doc.addImage(imgData, format, logoX, logoY + (headerHeight - finalLogoHeight) / 2, finalLogoWidth, finalLogoHeight, undefined, 'FAST')
    } catch (error) {
      // Placeholder de logo con color accent
      doc.setDrawColor(...ACCENT_COLOR)
      doc.setLineWidth(2)
      doc.roundedRect(logoX, logoY + 10, defaultLogoWidth, 60, 3, 3, 'S')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...ACCENT_COLOR)
      doc.text('TU', logoX + defaultLogoWidth/2, logoY + 32, { align: 'center' })
      doc.text('LOGO', logoX + defaultLogoWidth/2, logoY + 44, { align: 'center' })
      doc.text('AQUÍ', logoX + defaultLogoWidth/2, logoY + 56, { align: 'center' })
    }
  } else {
    // Placeholder de logo
    doc.setDrawColor(...ACCENT_COLOR)
    doc.setLineWidth(2)
    doc.roundedRect(logoX, logoY + 10, defaultLogoWidth, 60, 3, 3, 'S')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ACCENT_COLOR)
    doc.text('TU', logoX + defaultLogoWidth/2, logoY + 32, { align: 'center' })
    doc.text('LOGO', logoX + defaultLogoWidth/2, logoY + 44, { align: 'center' })
    doc.text('AQUÍ', logoX + defaultLogoWidth/2, logoY + 56, { align: 'center' })
  }

  // Datos de la empresa (centro) - posición dinámica basada en el logo
  const centerX = logoX + actualLogoWidth + 10
  const centerWidth = CONTENT_WIDTH - actualLogoWidth - docBoxWidth - 20
  const commercialName = (companySettings?.name || 'EMPRESA SAC').toUpperCase()
  const legalName = (companySettings?.businessName || '').toUpperCase()
  const phone = companySettings?.phone || ''
  const email = companySettings?.email || ''

  // Construir dirección completa con ubicación (igual que facturas)
  let fullAddress = companySettings?.address || ''
  if (companySettings?.district || companySettings?.province || companySettings?.department) {
    const locationParts = [companySettings?.district, companySettings?.province, companySettings?.department].filter(Boolean)
    if (locationParts.length > 0) {
      fullAddress += ' - ' + locationParts.join(', ')
    }
  }

  // Calcular altura total del texto
  let totalTextHeight = 14 // Nombre comercial
  if (legalName && legalName !== commercialName) totalTextHeight += 12
  if (fullAddress || phone) totalTextHeight += 18
  if (email) totalTextHeight += 10

  let centerY = currentY + (headerHeight - totalTextHeight) / 2 + 10

  // Nombre comercial
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(commercialName, centerX + centerWidth/2, centerY, { align: 'center' })
  centerY += 14

  // Razón social (si es diferente)
  if (legalName && legalName !== commercialName) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    doc.text(legalName, centerX + centerWidth/2, centerY, { align: 'center' })
    centerY += 12
  }

  // Dirección y teléfono (mismo formato que facturas)
  if (fullAddress || phone) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MEDIUM_GRAY)
    let addressLine = fullAddress
    if (phone) addressLine += (fullAddress ? ' - ' : '') + 'Tel: ' + phone
    const addressLines = doc.splitTextToSize(addressLine, centerWidth - 10)
    addressLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, centerX + centerWidth/2, centerY + (i * 9), { align: 'center' })
    })
    centerY += addressLines.slice(0, 2).length * 9
  }

  // Email
  if (email) {
    doc.setFontSize(7)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text(`Email: ${email}`, centerX + centerWidth/2, centerY + 2, { align: 'center' })
  }

  // Recuadro del documento (derecha)
  const docBoxX = PAGE_WIDTH - MARGIN_RIGHT - docBoxWidth
  const docBoxY = currentY

  // Altura de la sección del RUC (parte superior con fondo de color)
  const rucSectionHeight = 26

  // Fondo de color para la sección del RUC
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(docBoxX, docBoxY, docBoxWidth, rucSectionHeight, 'F')

  // Recuadro completo con borde
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(1.5)
  doc.rect(docBoxX, docBoxY, docBoxWidth, headerHeight)

  // Línea separadora después del RUC
  doc.setLineWidth(0.5)
  doc.line(docBoxX, docBoxY + rucSectionHeight, docBoxX + docBoxWidth, docBoxY + rucSectionHeight)

  // RUC (texto blanco sobre fondo de color)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(`R.U.C. ${companySettings?.ruc || ''}`, docBoxX + docBoxWidth/2, docBoxY + 17, { align: 'center' })
  doc.setTextColor(...BLACK) // Restaurar color negro

  // Título
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('GUÍA DE REMISIÓN', docBoxX + docBoxWidth/2, docBoxY + 38, { align: 'center' })
  doc.text('TRANSPORTISTA ELECTRÓNICA', docBoxX + docBoxWidth/2, docBoxY + 50, { align: 'center' })

  // Número
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`N° ${guide.number || 'V001-00000001'}`, docBoxX + docBoxWidth/2, docBoxY + 72, { align: 'center' })

  currentY += headerHeight + 15

  // ========== 2. DATOS DEL TRASLADO ==========
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  // Fila 1: Tipo transporte y Fechas
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)

  doc.text('Tipo de transporte:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(TRANSPORT_TYPES[transportType] || 'Privado', MARGIN_LEFT + 85, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Fecha traslado:', MARGIN_LEFT + 150, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(guide.transferDate), MARGIN_LEFT + 225, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Fecha emisión:', MARGIN_LEFT + 310, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(guide.createdAt || guide.transferDate), MARGIN_LEFT + 380, currentY)

  currentY += 14

  // Fila 2: Peso, Motivo y MTC
  doc.setFont('helvetica', 'bold')
  doc.text('Peso bruto total:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(`${(guide.totalWeight || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })} KGM`, MARGIN_LEFT + 75, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Motivo de traslado:', MARGIN_LEFT + 180, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(TRANSFER_REASONS[guide.transferReason] || guide.transferReason || '-', MARGIN_LEFT + 270, currentY)

  if (companySettings?.mtcRegistration) {
    doc.setFont('helvetica', 'bold')
    doc.text('MTC:', MARGIN_LEFT + 400, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(companySettings.mtcRegistration, MARGIN_LEFT + 425, currentY)
  }

  currentY += 14

  // Fila 3: M1/L si aplica
  if (isM1OrLVehicle) {
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text('(Vehículo categoría M1 o L)', MARGIN_LEFT, currentY)
    doc.setTextColor(...BLACK)
    currentY += 14
  }

  // Fila 3: Descripción del traslado (si existe)
  if (transferDescription) {
    doc.setFont('helvetica', 'bold')
    doc.text('Descripción:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'normal')
    const descLines = doc.splitTextToSize(transferDescription, CONTENT_WIDTH - 60)
    doc.text(descLines[0], MARGIN_LEFT + 55, currentY)
    currentY += 14
  }

  currentY += 4

  // ========== 3. REMITENTE Y DESTINATARIO ==========
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  const colMidX = MARGIN_LEFT + CONTENT_WIDTH * 0.5

  // Encabezados
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('REMITENTE', MARGIN_LEFT, currentY)
  doc.text('DESTINATARIO', colMidX, currentY)
  currentY += 12

  // Posiciones X consistentes para alineación vertical de valores
  const remitenteValueX = MARGIN_LEFT + 65 // Offset para valores del remitente
  const destinatarioValueX = colMidX + 50 // Offset para valores del destinatario
  const valueMaxWidth = CONTENT_WIDTH * 0.45 - 55 // Ancho máximo para valores

  // Datos Remitente - RUC
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('RUC:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(shipper.ruc || '-', remitenteValueX, currentY)

  // Datos Destinatario - RUC/DNI
  doc.setFont('helvetica', 'bold')
  doc.text('RUC/DNI:', colMidX, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(recipient.documentNumber || '-', destinatarioValueX, currentY)
  currentY += 11

  // Razón social (permitir 2 líneas si es muy larga)
  doc.setFont('helvetica', 'bold')
  doc.text('Razón Social:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  const shipperNameText = doc.splitTextToSize(shipper.businessName || '-', valueMaxWidth)
  doc.text(shipperNameText[0], remitenteValueX, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Nombre:', colMidX, currentY)
  doc.setFont('helvetica', 'normal')
  const recipientNameText = doc.splitTextToSize(recipient.name || '-', valueMaxWidth)
  doc.text(recipientNameText[0], destinatarioValueX, currentY)
  currentY += 10

  // Segunda línea de nombres si es necesario
  const hasShipperLine2 = shipperNameText.length > 1 && shipperNameText[1]
  const hasRecipientLine2 = recipientNameText.length > 1 && recipientNameText[1]
  if (hasShipperLine2 || hasRecipientLine2) {
    if (hasShipperLine2) {
      doc.text(shipperNameText[1], remitenteValueX, currentY)
    }
    if (hasRecipientLine2) {
      doc.text(recipientNameText[1], destinatarioValueX, currentY)
    }
    currentY += 10
  } else {
    currentY += 1
  }

  // Dirección
  if (shipper.address || recipient.address) {
    doc.setFont('helvetica', 'bold')
    doc.text('Dirección:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'normal')
    const shipperAddr = doc.splitTextToSize(shipper.address || '-', valueMaxWidth)
    doc.text(shipperAddr[0], remitenteValueX, currentY)

    doc.setFont('helvetica', 'bold')
    doc.text('Dirección:', colMidX, currentY)
    doc.setFont('helvetica', 'normal')
    const recipientAddr = doc.splitTextToSize(recipient.address || '-', valueMaxWidth)
    doc.text(recipientAddr[0], destinatarioValueX, currentY)
    currentY += 11
  }

  // Ciudad
  if (shipper.city || recipient.city) {
    doc.setFont('helvetica', 'bold')
    doc.text('Ciudad:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(shipper.city || '-', remitenteValueX, currentY)

    doc.setFont('helvetica', 'bold')
    doc.text('Ciudad:', colMidX, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(recipient.city || '-', destinatarioValueX, currentY)
    currentY += 11
  }

  currentY += 5

  // ========== 3.5 PAGADOR DEL FLETE ==========
  const freightPayer = guide.freightPayer || 'remitente'
  const thirdPartyPayer = guide.thirdPartyPayer || {}

  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('PAGADOR DEL FLETE', MARGIN_LEFT, currentY)
  currentY += 12

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Pagador:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')

  let payerText = ''
  if (freightPayer === 'remitente') {
    payerText = `REMITENTE - ${shipper.businessName || ''} (RUC: ${shipper.ruc || ''})`
  } else if (freightPayer === 'destinatario') {
    payerText = `DESTINATARIO - ${recipient.name || ''} (${recipient.documentNumber || ''})`
  } else if (freightPayer === 'tercero' && thirdPartyPayer.name) {
    payerText = `TERCERO - ${thirdPartyPayer.name || ''} (${thirdPartyPayer.documentNumber || ''})`
  } else {
    payerText = 'REMITENTE'
  }

  const payerLines = doc.splitTextToSize(payerText, CONTENT_WIDTH - 60)
  doc.text(payerLines[0], MARGIN_LEFT + 45, currentY)
  currentY += 14

  // ========== 4. PUNTOS DE PARTIDA Y LLEGADA ==========
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  // Encabezados
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('PUNTO DE PARTIDA', MARGIN_LEFT, currentY)
  doc.text('PUNTO DE LLEGADA', colMidX, currentY)
  currentY += 12

  // Direcciones
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')

  const originAddr = doc.splitTextToSize(origin.address || '-', CONTENT_WIDTH * 0.45)
  originAddr.slice(0, 2).forEach((line, i) => {
    doc.text(line, MARGIN_LEFT, currentY + (i * 10))
  })

  const destAddr = doc.splitTextToSize(destination.address || '-', CONTENT_WIDTH * 0.45)
  destAddr.slice(0, 2).forEach((line, i) => {
    doc.text(line, colMidX, currentY + (i * 10))
  })

  currentY += Math.max(originAddr.slice(0, 2).length, destAddr.slice(0, 2).length) * 10 + 5

  // Ubicación (Departamento/Provincia/Distrito o Ubigeo)
  const originLocation = origin.departamento
    ? getLocationName(origin.departamento, origin.provincia, origin.distrito)
    : (origin.ubigeo ? `Ubigeo: ${origin.ubigeo}` : '')
  const destLocation = destination.departamento
    ? getLocationName(destination.departamento, destination.provincia, destination.distrito)
    : (destination.ubigeo ? `Ubigeo: ${destination.ubigeo}` : '')

  if (originLocation || destLocation) {
    doc.setFontSize(7)
    doc.setTextColor(...MEDIUM_GRAY)
    if (originLocation) doc.text(originLocation, MARGIN_LEFT, currentY)
    if (destLocation) doc.text(destLocation, colMidX, currentY)
    currentY += 12
  }

  currentY += 5

  // ========== 5. TABLA DE BIENES ==========
  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('BIENES A TRANSPORTAR', MARGIN_LEFT, currentY)
  currentY += 12

  // Encabezado de tabla con columnas ajustadas para formato vertical
  const tableX = MARGIN_LEFT
  const tableWidth = CONTENT_WIDTH
  const colWidths = {
    num: 20,
    code: 50,
    sunatCode: 55,
    gtin: 60,
    desc: tableWidth - 20 - 50 - 55 - 60 - 45 - 40,
    qty: 45,
    unit: 40
  }

  // Filas de datos con altura dinámica según descripción y PAGINACIÓN
  const minRowHeight = 16
  const lineHeight = 8 // Altura por línea de texto

  // Función para calcular altura dinámica de cada item
  const calculateItemHeight = (item) => {
    doc.setFontSize(6)
    const descText = item.description || '-'
    const descLines = doc.splitTextToSize(descText, colWidths.desc - 6)
    const numLines = descLines.length
    const rowHeight = Math.max(minRowHeight, numLines * lineHeight + 8)
    return { height: rowHeight, descLines }
  }

  // Función para dibujar el encabezado de la tabla (se usa en cada página)
  const drawTableHeader = () => {
    doc.setFillColor(...ACCENT_COLOR)
    doc.rect(tableX, currentY, tableWidth, 18, 'F')
    doc.setDrawColor(...BLACK)
    doc.setLineWidth(0.5)
    doc.rect(tableX, currentY, tableWidth, 18)

    doc.setFontSize(6)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)

    let hColX = tableX
    doc.text('N°', hColX + colWidths.num/2, currentY + 12, { align: 'center' })
    doc.line(hColX + colWidths.num, currentY, hColX + colWidths.num, currentY + 18)
    hColX += colWidths.num

    doc.text('CÓDIGO', hColX + colWidths.code/2, currentY + 12, { align: 'center' })
    doc.line(hColX + colWidths.code, currentY, hColX + colWidths.code, currentY + 18)
    hColX += colWidths.code

    doc.text('COD. SUNAT', hColX + colWidths.sunatCode/2, currentY + 12, { align: 'center' })
    doc.line(hColX + colWidths.sunatCode, currentY, hColX + colWidths.sunatCode, currentY + 18)
    hColX += colWidths.sunatCode

    doc.text('GTIN', hColX + colWidths.gtin/2, currentY + 12, { align: 'center' })
    doc.line(hColX + colWidths.gtin, currentY, hColX + colWidths.gtin, currentY + 18)
    hColX += colWidths.gtin

    doc.text('DESCRIPCIÓN', hColX + colWidths.desc/2, currentY + 12, { align: 'center' })
    doc.line(hColX + colWidths.desc, currentY, hColX + colWidths.desc, currentY + 18)
    hColX += colWidths.desc

    doc.text('CANT.', hColX + colWidths.qty/2, currentY + 12, { align: 'center' })
    doc.line(hColX + colWidths.qty, currentY, hColX + colWidths.qty, currentY + 18)
    hColX += colWidths.qty

    doc.text('UNID.', hColX + colWidths.unit/2, currentY + 12, { align: 'center' })

    currentY += 18
    doc.setTextColor(...BLACK)
  }

  // Función para dibujar una fila de item
  const drawItemRow = (item, index, rowHeight, descLines) => {
    const centerYRow = currentY + rowHeight / 2 + 2

    // Dibujar rectángulo de fila
    doc.setDrawColor(...LIGHT_GRAY)
    doc.rect(tableX, currentY, tableWidth, rowHeight)

    // Dibujar líneas verticales de separación de columnas
    let itemColX = tableX
    doc.line(itemColX + colWidths.num, currentY, itemColX + colWidths.num, currentY + rowHeight)
    itemColX += colWidths.num
    doc.line(itemColX + colWidths.code, currentY, itemColX + colWidths.code, currentY + rowHeight)
    itemColX += colWidths.code
    doc.line(itemColX + colWidths.sunatCode, currentY, itemColX + colWidths.sunatCode, currentY + rowHeight)
    itemColX += colWidths.sunatCode
    doc.line(itemColX + colWidths.gtin, currentY, itemColX + colWidths.gtin, currentY + rowHeight)
    itemColX += colWidths.gtin
    doc.line(itemColX + colWidths.desc, currentY, itemColX + colWidths.desc, currentY + rowHeight)
    itemColX += colWidths.desc
    doc.line(itemColX + colWidths.qty, currentY, itemColX + colWidths.qty, currentY + rowHeight)

    // Datos - centrados verticalmente en la fila
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)

    itemColX = tableX
    doc.text(String(index + 1), itemColX + colWidths.num/2, centerYRow, { align: 'center' })
    itemColX += colWidths.num

    doc.text((item.code || '-').substring(0, 10), itemColX + colWidths.code/2, centerYRow, { align: 'center' })
    itemColX += colWidths.code

    doc.text((item.sunatCode || '-').substring(0, 12), itemColX + colWidths.sunatCode/2, centerYRow, { align: 'center' })
    itemColX += colWidths.sunatCode

    doc.text((item.gtin || '-').substring(0, 14), itemColX + colWidths.gtin/2, centerYRow, { align: 'center' })
    itemColX += colWidths.gtin

    // Descripción - múltiples líneas
    const descStartY = currentY + 8
    descLines.forEach((line, lineIdx) => {
      doc.text(line, itemColX + 3, descStartY + (lineIdx * lineHeight))
    })
    itemColX += colWidths.desc

    doc.text(String(item.quantity || 1), itemColX + colWidths.qty/2, centerYRow, { align: 'center' })
    itemColX += colWidths.qty

    doc.text(item.unit || 'NIU', itemColX + colWidths.unit/2, centerYRow, { align: 'center' })

    currentY += rowHeight
  }

  // Dibujar el encabezado de la tabla inicial
  drawTableHeader()

  // Dibujar items con paginación (SIN LÍMITE de items)
  items.forEach((item, index) => {
    const { height: rowHeight, descLines } = calculateItemHeight(item)

    // Verificar si necesitamos nueva página (reservar espacio para el resto del contenido en la última)
    const isLastItem = index === items.length - 1
    const reserveSpace = isLastItem ? FOOTER_HEIGHT + 200 : 0 // 200pt para vehículos/conductores/observaciones

    if (checkPageBreak(rowHeight + 20 + reserveSpace, isLastItem)) {
      // Nueva página - redibujar encabezado de tabla
      drawTableHeader()
    }

    drawItemRow(item, index, rowHeight, descLines)
  })

  // Si no hay items, dibujar un espacio mínimo
  if (items.length === 0) {
    doc.setDrawColor(...LIGHT_GRAY)
    doc.rect(tableX, currentY, tableWidth, 30)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text('Sin items', tableX + tableWidth/2, currentY + 18, { align: 'center' })
    currentY += 30
  }

  currentY += 15

  // ========== 6. DATOS DEL VEHÍCULO(S) ==========

  // Verificar espacio para sección de vehículos (~50pt por vehículo)
  checkPageBreak(50, false)

  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(`DATOS DEL VEHÍCULO${vehicles.length > 1 ? 'S' : ''}`, MARGIN_LEFT, currentY)
  currentY += 12

  // Mostrar todos los vehículos con etiquetas Principal/Secundario
  const validVehicles = vehicles.filter(v => v && v.plate)
  validVehicles.forEach((v, idx) => {
    // Verificar espacio para cada vehículo
    checkPageBreak(20, false)
    doc.setFontSize(7)

    // Etiqueta Principal/Secundario
    const vehicleLabel = idx === 0 ? 'PRINCIPAL' : 'SECUNDARIO'
    doc.setFont('helvetica', 'bold')
    if (idx === 0) {
      doc.setFillColor(...ACCENT_COLOR) // Color de acento para principal
    } else {
      doc.setFillColor(128, 128, 128) // Gris para secundario
    }
    doc.roundedRect(MARGIN_LEFT, currentY - 8, 55, 12, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(6)
    doc.text(vehicleLabel, MARGIN_LEFT + 27.5, currentY - 1, { align: 'center' })
    doc.setTextColor(...BLACK)
    doc.setFontSize(7)

    // Primera línea: Placa y TUCE
    doc.setFont('helvetica', 'bold')
    doc.text('Placa:', MARGIN_LEFT + 60, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(v.plate || '-', MARGIN_LEFT + 85, currentY)

    if (v.tuce) {
      doc.setFont('helvetica', 'bold')
      doc.text('TUCE:', MARGIN_LEFT + 150, currentY)
      doc.setFont('helvetica', 'normal')
      doc.text(v.tuce, MARGIN_LEFT + 175, currentY)
    }

    if (v.mtcAuthorization) {
      doc.setFont('helvetica', 'bold')
      doc.text('N° Aut.:', MARGIN_LEFT + 280, currentY)
      doc.setFont('helvetica', 'normal')
      doc.text(v.mtcAuthorization, MARGIN_LEFT + 315, currentY)
    }

    if (v.mtcEntity) {
      doc.setFont('helvetica', 'bold')
      doc.text('Entidad:', MARGIN_LEFT + 400, currentY)
      doc.setFont('helvetica', 'normal')
      doc.text((v.mtcEntity || '').substring(0, 15), MARGIN_LEFT + 435, currentY)
    }

    currentY += 14
  })

  currentY += 6

  // ========== 7. DATOS DEL CONDUCTOR(ES) ==========

  // Verificar espacio para sección de conductores (~50pt por conductor)
  checkPageBreak(50, false)

  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(`DATOS DEL CONDUCTOR${drivers.length > 1 ? 'ES' : ''}`, MARGIN_LEFT, currentY)
  currentY += 12

  // Mostrar todos los conductores con etiquetas Principal/Secundario
  const validDrivers = drivers.filter(d => d && (d.documentNumber || d.name))
  validDrivers.forEach((d, idx) => {
    // Verificar espacio para cada conductor
    checkPageBreak(20, false)
    doc.setFontSize(7)

    // Etiqueta Principal/Secundario
    const driverLabel = idx === 0 ? 'PRINCIPAL' : 'SECUNDARIO'
    doc.setFont('helvetica', 'bold')
    if (idx === 0) {
      doc.setFillColor(...ACCENT_COLOR) // Color de acento para principal
    } else {
      doc.setFillColor(128, 128, 128) // Gris para secundario
    }
    doc.roundedRect(MARGIN_LEFT, currentY - 8, 55, 12, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(6)
    doc.text(driverLabel, MARGIN_LEFT + 27.5, currentY - 1, { align: 'center' })
    doc.setTextColor(...BLACK)
    doc.setFontSize(7)

    doc.setFont('helvetica', 'bold')
    doc.text('Doc:', MARGIN_LEFT + 60, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(d.documentNumber || '-', MARGIN_LEFT + 80, currentY)

    doc.setFont('helvetica', 'bold')
    doc.text('Licencia:', MARGIN_LEFT + 160, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(d.license || '-', MARGIN_LEFT + 200, currentY)

    doc.setFont('helvetica', 'bold')
    doc.text('Nombre:', MARGIN_LEFT + 290, currentY)
    doc.setFont('helvetica', 'normal')
    const fullName = `${d.name || ''} ${d.lastName || ''}`.trim() || '-'
    doc.text(fullName.substring(0, 30), MARGIN_LEFT + 330, currentY)

    currentY += 14
  })

  currentY += 6

  // ========== 8. GRE REMITENTE RELACIONADAS ==========
  if (guide.relatedGuides && guide.relatedGuides.length > 0 && guide.relatedGuides.some(g => g.number)) {
    // Verificar espacio para documentos relacionados (~40pt)
    checkPageBreak(40, false)

    doc.setLineWidth(0.5)
    doc.setDrawColor(...BLACK)
    doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
    currentY += 12

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('DOCUMENTOS RELACIONADOS', MARGIN_LEFT, currentY)
    currentY += 12

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const relatedText = guide.relatedGuides
      .filter(g => g.number)
      .map(g => `${g.number}${g.ruc ? ` (RUC: ${g.ruc})` : ''}`)
      .join(', ')
    doc.text(relatedText || '-', MARGIN_LEFT, currentY)
    currentY += 15
  }

  // ========== 9. OBSERVACIONES ==========
  if (observations) {
    // Verificar espacio para observaciones (~60pt)
    checkPageBreak(60, false)

    doc.setLineWidth(0.5)
    doc.setDrawColor(...BLACK)
    doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
    currentY += 12

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('OBSERVACIONES', MARGIN_LEFT, currentY)
    currentY += 12

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const obsLines = doc.splitTextToSize(observations, CONTENT_WIDTH)
    obsLines.slice(0, 3).forEach((line, i) => {
      doc.text(line, MARGIN_LEFT, currentY + (i * 10))
    })
    currentY += Math.min(obsLines.length, 3) * 10 + 5
  }

  // ========== 10. FOOTER CON QR Y SELLO SUNAT ==========

  // Verificar espacio para el footer (~100pt)
  checkPageBreak(100, false)

  const qrSize = 60

  // Línea superior del footer
  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 10

  const footerY = currentY

  // QR
  try {
    const qrImage = await generateGuideQR(guide, companySettings)
    if (qrImage) {
      doc.addImage(qrImage, 'PNG', MARGIN_LEFT, footerY, qrSize, qrSize)
    }
  } catch (error) {
    console.warn('Error generando QR:', error)
    // Placeholder QR
    doc.setDrawColor(...LIGHT_GRAY)
    doc.rect(MARGIN_LEFT, footerY, qrSize, qrSize)
    doc.setFontSize(6)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text('QR', MARGIN_LEFT + qrSize/2, footerY + qrSize/2, { align: 'center' })
  }

  // Texto legal
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...MEDIUM_GRAY)

  const legalX = MARGIN_LEFT + qrSize + 15
  doc.text('Representación impresa de la Guía de Remisión Transportista Electrónica', legalX, footerY + 12)
  doc.text('Autorizado mediante Resolución de Superintendencia N° 000123-2023/SUNAT', legalX, footerY + 24)

  // OSE Info
  if (companySettings?.oseProvider || guide.oseCode) {
    doc.text(`OSE: ${companySettings?.oseProvider || 'NUBEFACT'} - ${guide.oseCode || 'Código de envío'}`, legalX, footerY + 36)
  }

  // Hash si existe
  if (guide.cdrHash || guide.hashCode) {
    doc.setFontSize(6)
    doc.text(`Hash: ${guide.cdrHash || guide.hashCode}`, legalX, footerY + 48)
  }

  // ===== SELLO DE VERIFICACIÓN SUNAT =====
  const sealX = PAGE_WIDTH - MARGIN_RIGHT - 110
  const sealY = footerY + 5
  const sealWidth = 100
  const sealHeight = 50

  // Borde del sello
  doc.setDrawColor(...ACCENT_COLOR)
  doc.setLineWidth(1.5)
  doc.roundedRect(sealX, sealY, sealWidth, sealHeight, 3, 3, 'S')

  // Texto del sello
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...ACCENT_COLOR)
  doc.text('VERIFICACIÓN SUNAT', sealX + sealWidth/2, sealY + 12, { align: 'center' })

  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK_GRAY)
  doc.text('Consulte en:', sealX + sealWidth/2, sealY + 24, { align: 'center' })
  doc.text('www.sunat.gob.pe', sealX + sealWidth/2, sealY + 34, { align: 'center' })

  // Fecha de emisión en el sello
  const emissionDate = formatDate(guide.createdAt || guide.transferDate)
  doc.setFontSize(5)
  doc.text(`Emitido: ${emissionDate}`, sealX + sealWidth/2, sealY + 44, { align: 'center' })

  // Obtener número total de páginas y agregar números de página a todas las páginas
  totalPages = doc.internal.getNumberOfPages()

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text(`Página ${i} de ${totalPages}`, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 15, { align: 'right' })
  }

  // Generar o retornar
  if (download) {
    const fileName = `GRE_Transportista_${guide.number || 'borrador'}.pdf`
    const isNativePlatform = Capacitor.isNativePlatform()

    if (isNativePlatform) {
      try {
        const pdfOutput = doc.output('datauristring')
        const base64Data = pdfOutput.split(',')[1]

        const pdfDir = 'PDFs'
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

        // Abrir el diálogo de compartir para que el usuario pueda ver/compartir el PDF
        try {
          await Share.share({
            title: fileName,
            text: `Guía de Remisión Transportista: ${fileName}`,
            url: result.uri,
            dialogTitle: 'Compartir Guía de Remisión'
          })
        } catch (shareError) {
          console.log('Compartir cancelado o no disponible:', shareError)
        }

        return { success: true, uri: result.uri, fileName, doc }
      } catch (error) {
        console.error('Error al guardar PDF en móvil:', error)
        throw error
      }
    } else {
      doc.save(fileName)
      return { success: true, fileName }
    }
  } else {
    return {
      success: true,
      blob: doc.output('blob'),
      dataUrl: doc.output('dataurlstring')
    }
  }
}

/**
 * Convierte color hex a RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [230, 126, 34]
}

/**
 * Abre el PDF de Guía de Remisión Transportista en una nueva pestaña para vista previa (o comparte en móvil)
 */
export const previewCarrierDispatchGuidePDF = async (guide, companySettings) => {
  // Generar el PDF sin descarga
  const result = await generateCarrierDispatchGuidePDF(guide, companySettings, false)

  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    try {
      // En móvil, guardar el PDF y abrirlo con Share para vista previa
      const pdfBase64 = result.dataUrl.split(',')[1]
      const fileName = `GRE_Transportista_${guide.number || 'borrador'}.pdf`

      // Guardar directamente en Documents
      const saveResult = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: Directory.Documents,
        recursive: true
      })

      console.log('PDF para vista previa guardado en:', saveResult.uri)

      // Abrir con el visor de PDF del sistema
      await Share.share({
        title: `Guía Transportista ${guide.number || ''}`,
        url: saveResult.uri,
        dialogTitle: 'Ver guía de remisión'
      })

      return saveResult.uri
    } catch (error) {
      console.error('Error al generar vista previa en móvil:', error)
      throw error
    }
  } else {
    // En web, crear blob URL y abrir en nueva pestaña
    const blobUrl = URL.createObjectURL(result.blob)
    window.open(blobUrl, '_blank')
    return blobUrl
  }
}

export default generateCarrierDispatchGuidePDF
