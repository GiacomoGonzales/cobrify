import jsPDF from 'jspdf'
import { formatDate } from '@/lib/utils'
import QRCode from 'qrcode'
import { storage } from '@/lib/firebase'
import { ref, getDownloadURL, getBlob } from 'firebase/storage'

/**
 * Convierte un número a texto en español (para montos)
 */
const numeroALetras = (num) => {
  const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
  const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

  const convertirGrupo = (n) => {
    if (n === 0) return ''
    if (n === 100) return 'CIEN'

    const c = Math.floor(n / 100)
    const d = Math.floor((n % 100) / 10)
    const u = n % 10

    let resultado = ''

    if (c > 0) resultado += centenas[c]

    if (d === 1) {
      resultado += (resultado ? ' ' : '') + especiales[u]
    } else {
      if (d > 0) resultado += (resultado ? ' ' : '') + decenas[d]
      if (u > 0) {
        if (d > 2) resultado += ' Y '
        else if (resultado) resultado += ' '
        resultado += unidades[u]
      }
    }

    return resultado
  }

  const entero = Math.floor(num)
  const decimales = Math.round((num - entero) * 100)

  if (entero === 0) return `CERO CON ${decimales.toString().padStart(2, '0')}/100`

  const miles = Math.floor(entero / 1000)
  const restoMiles = entero % 1000

  let resultado = ''

  if (miles > 0) {
    if (miles === 1) {
      resultado = 'MIL'
    } else {
      resultado = convertirGrupo(miles) + ' MIL'
    }
  }

  if (restoMiles > 0) {
    if (resultado) resultado += ' '
    resultado += convertirGrupo(restoMiles)
  }

  return `${resultado} CON ${decimales.toString().padStart(2, '0')}/100`
}

/**
 * Convierte URL de Firebase Storage a URL pública compatible con CORS
 * Firebase Storage requiere ?alt=media para acceso público
 */
const getPublicFirebaseStorageUrl = (url) => {
  try {
    // Si ya tiene alt=media, está lista para usar
    if (url.includes('?alt=media')) {
      console.log('✅ URL ya tiene alt=media, usando directamente')
      return url
    }

    // Si es una URL de firebasestorage.googleapis.com, asegurar que tenga alt=media
    if (url.includes('firebasestorage.googleapis.com')) {
      // Si ya tiene algún query param pero no alt=media
      if (url.includes('?')) {
        return `${url}&alt=media`
      } else {
        return `${url}?alt=media`
      }
    }

    return url
  } catch (error) {
    console.error('Error converting URL:', error)
    return url
  }
}

/**
 * Extrae el path de Firebase Storage desde una URL
 */
const getStoragePathFromUrl = (url) => {
  try {
    // Extraer path de URL de Firebase Storage
    // Formato: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?...
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
 * Usa el SDK de Firebase para evitar problemas de CORS
 */
const loadImageAsBase64 = async (url) => {
  try {
    console.log('🔄 Cargando imagen desde Firebase Storage usando SDK')

    // Extraer el path del storage desde la URL
    const storagePath = getStoragePathFromUrl(url)

    if (storagePath) {
      console.log('📁 Path extraído:', storagePath)

      // Usar Firebase SDK para obtener el blob
      const storageRef = ref(storage, storagePath)
      const blob = await getBlob(storageRef)

      // Convertir blob a base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          console.log('✅ Imagen cargada correctamente usando Firebase SDK')
          resolve(reader.result)
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }

    // Fallback: intentar con fetch directo si no es una URL de Firebase Storage
    console.log('🔄 Fallback: Intentando fetch directo')
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'default'
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`)
    }

    const blob = await response.blob()

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        console.log('✅ Imagen cargada con fetch directo')
        resolve(reader.result)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

  } catch (error) {
    console.error('❌ Error cargando imagen:', error)
    throw error
  }
}

/**
 * Genera el código QR para SUNAT
 */
const generateSunatQR = async (invoice, companySettings) => {
  try {
    const docTypeCode = invoice.documentType === 'factura' ? '01' : '03'
    const [serie = '', numero = ''] = (invoice.number || '').split('-')
    const clientDocType = invoice.customer?.documentType === 'RUC' ? '6' :
                         invoice.customer?.documentType === 'DNI' ? '1' : '0'
    const clientDocNumber = invoice.customer?.documentNumber || '-'

    let invoiceDate = new Date().toLocaleDateString('es-PE')
    if (invoice.createdAt) {
      if (invoice.createdAt.toDate) {
        const date = invoice.createdAt.toDate()
        invoiceDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
      } else if (invoice.createdAt instanceof Date) {
        invoiceDate = `${String(invoice.createdAt.getDate()).padStart(2, '0')}/${String(invoice.createdAt.getMonth() + 1).padStart(2, '0')}/${invoice.createdAt.getFullYear()}`
      }
    }

    const qrData = [
      companySettings?.ruc || '',
      docTypeCode,
      serie,
      numero,
      (invoice.igv || 0).toFixed(2),
      (invoice.total || 0).toFixed(2),
      invoiceDate,
      clientDocType,
      clientDocNumber,
      ''
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
 * Genera un PDF profesional para factura o boleta según formato SUNAT oficial
 * Diseño moderno y limpio con mejor tipografía y espaciado
 */
export const generateInvoicePDF = async (invoice, companySettings, download = true) => {
  // Crear documento A4 en orientación vertical (portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  // Paleta de colores neutros - solo negros y grises
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [51, 51, 51]      // Gris muy oscuro para títulos
  const MEDIUM_GRAY = [102, 102, 102] // Gris medio para texto secundario
  const LIGHT_GRAY = [224, 224, 224]  // Gris claro para fondos
  const BORDER_GRAY = [189, 189, 189] // Gris para bordes

  // Márgenes y dimensiones - A4 portrait: 595pt x 842pt
  const MARGIN_LEFT = 40
  const MARGIN_RIGHT = 40
  const MARGIN_TOP = 40
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  // Coordenada Y actual
  let currentY = MARGIN_TOP

  // ========== 1. ENCABEZADO PRINCIPAL ==========

  // Barra superior negra elegante
  doc.setFillColor(...BLACK)
  doc.rect(0, 0, PAGE_WIDTH, 5, 'F')

  currentY += 8

  const headerY = currentY

  // Columna izquierda - Información de la empresa (60%)
  const leftColumnWidth = CONTENT_WIDTH * 0.60
  const leftColumnX = MARGIN_LEFT

  // Logo de la empresa si existe - ARRIBA A LA IZQUIERDA
  let logoHeight = 0
  let textY = headerY

  if (companySettings?.logoUrl) {
    try {
      console.log('📸 Intentando cargar logo desde:', companySettings.logoUrl)

      // Agregar un timeout para no bloquear la generación del PDF
      const imgData = await Promise.race([
        loadImageAsBase64(companySettings.logoUrl),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout loading logo')), 5000)
        )
      ])

      // Determinar el formato de la imagen
      let format = 'PNG'
      if (companySettings.logoUrl.toLowerCase().includes('.jpg') ||
          companySettings.logoUrl.toLowerCase().includes('.jpeg')) {
        format = 'JPEG'
      }

      // Crear una imagen temporal para obtener dimensiones originales
      const img = new Image()
      img.src = imgData

      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })

      // Calcular dimensiones manteniendo la proporción
      const originalWidth = img.width
      const originalHeight = img.height
      const aspectRatio = originalWidth / originalHeight

      // Altura máxima del logo
      const maxLogoHeight = 45
      const maxLogoWidth = 120 // Ancho máximo para logos horizontales

      let logoWidth, calculatedLogoHeight

      if (aspectRatio > 1) {
        // Logo horizontal (más ancho que alto)
        logoWidth = Math.min(maxLogoWidth, leftColumnWidth - 10)
        calculatedLogoHeight = logoWidth / aspectRatio

        // Si la altura calculada excede el máximo, ajustar
        if (calculatedLogoHeight > maxLogoHeight) {
          calculatedLogoHeight = maxLogoHeight
          logoWidth = calculatedLogoHeight * aspectRatio
        }
      } else {
        // Logo vertical o cuadrado (más alto que ancho o igual)
        calculatedLogoHeight = maxLogoHeight
        logoWidth = calculatedLogoHeight * aspectRatio
      }

      logoHeight = calculatedLogoHeight

      // Logo en la esquina superior izquierda
      doc.addImage(imgData, format, leftColumnX, headerY, logoWidth, logoHeight, undefined, 'FAST')
      textY = headerY + logoHeight + 12 // Texto debajo del logo con más separación
      console.log('✅ Logo cargado correctamente (dimensiones:', logoWidth, 'x', logoHeight, ')')
    } catch (error) {
      console.warn('⚠️ No se pudo cargar el logo, continuando sin él:', error.message)
      textY = headerY + 5
      // Continuar sin el logo - el PDF se generará de todas formas
    }
  } else {
    textY = headerY + 5
  }

  // Primero calcular altura del header (fija en 85pt)
  const headerHeight = 85

  // Columna derecha - Recuadro del comprobante (35%)
  const rightColumnWidth = CONTENT_WIDTH * 0.40
  const rightColumnX = MARGIN_LEFT + leftColumnWidth

  // Recuadro con borde negro
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(2)
  doc.roundedRect(rightColumnX, headerY, rightColumnWidth, headerHeight, 5, 5)

  // Información de la empresa DEBAJO del logo - alineada con la parte inferior del recuadro
  // Calcular la posición Y final donde debe terminar el texto (parte inferior del recuadro)
  const bottomY = headerY + headerHeight - 5 // 5pt de margen inferior

  // Contar cuántas líneas de información tenemos
  let lineCount = 1 // Nombre de empresa (siempre)
  if (companySettings?.ruc) lineCount++
  if (companySettings?.address) lineCount++ // Asumiendo 1 línea
  if (companySettings?.phone) lineCount++
  if (companySettings?.email) lineCount++

  // Calcular espaciado entre líneas
  const lineHeight = 11
  const totalTextHeight = lineCount * lineHeight

  // Posicionar el texto para que termine en bottomY
  textY = bottomY - totalTextHeight + lineHeight

  // Nombre de la empresa
  doc.setFontSize(14)
  doc.setTextColor(...DARK_GRAY)
  doc.setFont('helvetica', 'bold')

  const companyName = companySettings?.businessName || 'EMPRESA SAC'
  doc.text(companyName, leftColumnX, textY)
  textY += lineHeight

  // RUC de la empresa
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  const ruc = companySettings?.ruc || ''
  if (ruc) {
    doc.text(`RUC: ${ruc}`, leftColumnX, textY)
    textY += lineHeight
  }

  // Dirección
  doc.setFontSize(9)
  if (companySettings?.address) {
    const addressLines = doc.splitTextToSize(companySettings.address, leftColumnWidth - 10)
    doc.text(addressLines[0], leftColumnX, textY) // Solo primera línea
    textY += lineHeight
  }

  // Teléfono
  if (companySettings?.phone) {
    doc.setFontSize(9)
    doc.text(`Tel: ${companySettings.phone}`, leftColumnX, textY)
    textY += lineHeight
  }

  // Email
  if (companySettings?.email) {
    doc.setFontSize(9)
    doc.text(`Email: ${companySettings.email}`, leftColumnX, textY)
  }

  // Contenido del recuadro - bien centrado
  const boxCenterX = rightColumnX + (rightColumnWidth / 2)
  let boxTextY = headerY + 22

  // Tipo de documento en negro
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  let documentTitle = 'BOLETA DE VENTA ELECTRÓNICA'
  if (invoice.documentType === 'factura') {
    documentTitle = 'FACTURA ELECTRÓNICA'
  } else if (invoice.documentType === 'nota_venta') {
    documentTitle = 'NOTA DE VENTA'
  }
  const titleLines = doc.splitTextToSize(documentTitle, rightColumnWidth - 20)
  titleLines.forEach(line => {
    doc.text(line, boxCenterX, boxTextY, { align: 'center' })
    boxTextY += 13
  })

  boxTextY += 6

  // Número de comprobante centrado
  doc.setFontSize(15)
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'bold')
  doc.text(invoice.number || 'N/A', boxCenterX, boxTextY, { align: 'center' })

  currentY = headerY + headerHeight + 20

  // Línea separadora
  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(1)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)

  currentY += 20

  // ========== 2. INFORMACIÓN DEL CLIENTE Y FECHA ==========

  const infoBoxY = currentY
  const infoBoxHeight = 65 // Aumentado de 55 a 65 para incluir dirección

  // Fondo suave para la sección
  doc.setFillColor(...LIGHT_GRAY)
  doc.roundedRect(MARGIN_LEFT, infoBoxY, CONTENT_WIDTH, infoBoxHeight, 3, 3, 'F')

  // Cliente - Columna izquierda (65%)
  let clientX = MARGIN_LEFT + 15
  let clientY = infoBoxY + 14

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('CLIENTE', clientX, clientY)
  clientY += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK_GRAY)

  const customerName = invoice.customer?.name || 'CLIENTE GENERAL'
  doc.text(customerName, clientX, clientY)
  clientY += 11

  const docType = invoice.customer?.documentType === 'RUC' ? 'RUC' :
                  invoice.customer?.documentType === 'DNI' ? 'DNI' : 'DOC'
  const docNumber = invoice.customer?.documentNumber && invoice.customer.documentNumber !== '00000000'
                    ? invoice.customer.documentNumber
                    : 'No especificado'

  doc.setFontSize(8)
  doc.setTextColor(...MEDIUM_GRAY)
  doc.text(`${docType}: ${docNumber}`, clientX, clientY)
  clientY += 10

  // Dirección del cliente
  if (invoice.customer?.address) {
    const maxAddressWidth = leftColumnWidth - 30
    const addressLines = doc.splitTextToSize(invoice.customer.address, maxAddressWidth)
    doc.setFontSize(8)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text(addressLines, clientX, clientY)
  }

  // Fecha y moneda - Columna derecha (35%)
  const dateX = MARGIN_LEFT + leftColumnWidth + 15
  let dateY = infoBoxY + 14

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.setFontSize(8)
  doc.text('FECHA DE EMISIÓN', dateX, dateY)
  dateY += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK_GRAY)

  let invoiceDate = new Date().toLocaleDateString('es-PE')
  if (invoice.createdAt) {
    if (invoice.createdAt.toDate) {
      const date = invoice.createdAt.toDate()
      invoiceDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
    } else if (invoice.createdAt instanceof Date) {
      const date = invoice.createdAt
      invoiceDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
    }
  }

  doc.text(invoiceDate, dateX, dateY)
  dateY += 11

  doc.setFontSize(8)
  doc.setTextColor(...MEDIUM_GRAY)
  doc.text('Moneda: Soles (PEN)', dateX, dateY)

  currentY = infoBoxY + infoBoxHeight + 20

  // ========== 3. TABLA DE PRODUCTOS ==========

  const tableY = currentY
  const rowHeight = 18 // Más espacio entre filas

  // Definir anchos de columnas (simplificado)
  const colWidths = {
    cant: CONTENT_WIDTH * 0.07,
    cod: CONTENT_WIDTH * 0.11,
    desc: CONTENT_WIDTH * 0.52,
    pu: CONTENT_WIDTH * 0.13,
    importe: CONTENT_WIDTH * 0.17
  }

  // Posiciones X de columnas
  let colX = MARGIN_LEFT
  const cols = {
    cant: colX,
    cod: colX += colWidths.cant,
    desc: colX += colWidths.cod,
    pu: colX += colWidths.desc,
    importe: colX += colWidths.pu
  }

  // Encabezado de tabla con fondo negro
  doc.setFillColor(...BLACK)
  doc.rect(MARGIN_LEFT, tableY, CONTENT_WIDTH, rowHeight, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255) // Blanco para contraste sobre negro

  const headerRowY = tableY + 11

  doc.text('CANT.', cols.cant + colWidths.cant / 2, headerRowY, { align: 'center' })
  doc.text('CÓDIGO', cols.cod + colWidths.cod / 2, headerRowY, { align: 'center' })
  doc.text('DESCRIPCIÓN', cols.desc + 8, headerRowY)
  doc.text('P. UNIT.', cols.pu + colWidths.pu / 2, headerRowY, { align: 'center' })
  doc.text('IMPORTE', cols.importe + colWidths.importe / 2, headerRowY, { align: 'center' })

  // Calcular valores
  const igvRate = companySettings?.taxConfig?.igvRate || 18
  const igvMultiplier = igvRate / 100

  // Filas de datos
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK_GRAY)

  let dataRowY = tableY + rowHeight + 12

  const items = invoice.items || []
  const minRows = 6
  const totalRows = Math.max(items.length, minRows)

  for (let i = 0; i < totalRows; i++) {
    // Fondo alternado
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(MARGIN_LEFT, dataRowY - 9, CONTENT_WIDTH, rowHeight, 'F')
    }

    if (i < items.length) {
      const item = items[i]
      // Todo con IGV incluido para que sea más claro para el cliente
      const precioConIGV = item.unitPrice
      const importeConIGV = item.quantity * precioConIGV

      doc.setTextColor(...DARK_GRAY)
      doc.setFont('helvetica', 'bold')
      doc.text(item.quantity.toFixed(0), cols.cant + colWidths.cant / 2, dataRowY, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...MEDIUM_GRAY)
      doc.text(item.code || '-', cols.cod + colWidths.cod / 2, dataRowY, { align: 'center' })

      doc.setFontSize(9)
      doc.setTextColor(...DARK_GRAY)
      const descLines = doc.splitTextToSize(item.name, colWidths.desc - 16)
      doc.text(descLines[0], cols.desc + 8, dataRowY)

      doc.text(`S/ ${precioConIGV.toFixed(2)}`, cols.pu + colWidths.pu / 2, dataRowY, { align: 'center' })

      doc.setFont('helvetica', 'bold')
      doc.text(`S/ ${importeConIGV.toFixed(2)}`, cols.importe + colWidths.importe / 2, dataRowY, { align: 'center' })
    }

    dataRowY += rowHeight
  }

  // Línea final de la tabla
  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, dataRowY - 9, MARGIN_LEFT + CONTENT_WIDTH, dataRowY - 9)

  currentY = dataRowY

  // ========== 4. TOTALES ==========

  currentY += 10

  const totalsBoxWidth = 200
  const totalsX = MARGIN_LEFT + CONTENT_WIDTH - totalsBoxWidth
  let totalsY = currentY

  const igvExempt = companySettings?.taxConfig?.igvExempt || false
  const labelGravada = igvExempt ? 'EXONERADA' : 'GRAVADA'

  // Subtotal antes de descuento (si hay descuento)
  if (invoice.discount && invoice.discount > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    doc.text(`SUBTOTAL:`, totalsX, totalsY)
    doc.setFont('helvetica', 'bold')
    const subtotalBeforeDiscount = (invoice.subtotalBeforeDiscount || invoice.subtotal || 0)
    doc.text(`S/ ${subtotalBeforeDiscount.toFixed(2)}`, totalsX + totalsBoxWidth, totalsY, { align: 'right' })
    totalsY += 14

    // Descuento
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text(`DESCUENTO:`, totalsX, totalsY)
    doc.setFont('helvetica', 'bold')
    doc.text(`- S/ ${(invoice.discount || 0).toFixed(2)}`, totalsX + totalsBoxWidth, totalsY, { align: 'right' })
    totalsY += 14
  }

  // Subtotal (después de descuento = base imponible)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK_GRAY)
  doc.text(`OP. ${labelGravada}:`, totalsX, totalsY)
  doc.setFont('helvetica', 'bold')
  doc.text(`S/ ${(invoice.subtotal || 0).toFixed(2)}`, totalsX + totalsBoxWidth, totalsY, { align: 'right' })
  totalsY += 14

  // IGV
  doc.setFont('helvetica', 'normal')
  doc.text(`IGV (${igvRate.toFixed(0)}%):`, totalsX, totalsY)
  doc.setFont('helvetica', 'bold')
  doc.text(`S/ ${(invoice.igv || 0).toFixed(2)}`, totalsX + totalsBoxWidth, totalsY, { align: 'right' })
  totalsY += 18

  // Total - destacado con fondo negro - bien centrado verticalmente
  const totalBoxHeight = 24
  const totalBoxY = totalsY - 12
  doc.setFillColor(...BLACK)
  doc.roundedRect(totalsX - 10, totalBoxY, totalsBoxWidth + 10, totalBoxHeight, 3, 3, 'F')

  // Centrar verticalmente el texto dentro del recuadro
  const totalTextY = totalBoxY + (totalBoxHeight / 2) + 3.5 // Centrado vertical perfecto

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255) // Blanco sobre negro
  doc.text('TOTAL:', totalsX, totalTextY)
  doc.setFontSize(14)
  doc.text(`S/ ${(invoice.total || 0).toFixed(2)}`, totalsX + totalsBoxWidth, totalTextY, { align: 'right' })

  currentY = totalsY + 20

  // ========== 5. IMPORTE EN LETRAS ==========

  doc.setFillColor(...LIGHT_GRAY)
  doc.roundedRect(MARGIN_LEFT, currentY, CONTENT_WIDTH, 20, 3, 3, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK_GRAY)

  const totalEnLetras = numeroALetras(invoice.total || 0)
  doc.text('SON:', MARGIN_LEFT + 10, currentY + 12)
  doc.setFont('helvetica', 'normal')
  doc.text(`${totalEnLetras} SOLES`, MARGIN_LEFT + 30, currentY + 12)

  currentY += 30

  // ========== 6. PIE DE PÁGINA Y QR ==========

  const footerY = currentY
  const qrSize = 70
  const qrBoxWidth = qrSize + 20
  const textBoxWidth = CONTENT_WIDTH - qrBoxWidth - 10

  // Sección de texto legal
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)

  let footerTextY = footerY + 8

  let docTypeText = 'BOLETA DE VENTA'
  if (invoice.documentType === 'factura') {
    docTypeText = 'FACTURA'
  } else if (invoice.documentType === 'nota_venta') {
    docTypeText = 'NOTA DE VENTA'
  }

  // Texto específico según el tipo de documento
  if (invoice.documentType === 'nota_venta') {
    // Para NOTA DE VENTA: no es un comprobante válido
    doc.text(docTypeText, MARGIN_LEFT, footerTextY)
    footerTextY += 10

    doc.setFontSize(6)
    doc.text('DOCUMENTO NO VÁLIDO PARA EFECTOS TRIBUTARIOS', MARGIN_LEFT, footerTextY)
    footerTextY += 8
  } else {
    // Para FACTURA y BOLETA: comprobantes electrónicos válidos
    const electronicText = ' ELECTRÓNICA'
    doc.text(`Representación impresa de la ${docTypeText}${electronicText}`, MARGIN_LEFT, footerTextY)
    footerTextY += 10

    doc.setFontSize(6)
    doc.text('Autorizado mediante Resolución de Intendencia No 034-005-0005315', MARGIN_LEFT, footerTextY)
    footerTextY += 8
  }

  // Hash y QR solo para facturas y boletas (no para notas de venta)
  if (invoice.documentType !== 'nota_venta') {
    if (invoice.sunatHash) {
      doc.setFont('helvetica', 'bold')
      doc.text('Hash: ', MARGIN_LEFT, footerTextY)
      doc.setFont('helvetica', 'normal')
      const hashText = doc.splitTextToSize(invoice.sunatHash, textBoxWidth - 20)
      doc.text(hashText[0], MARGIN_LEFT + 18, footerTextY)
    }

    // Código QR con borde - centrado
    try {
      const qrImage = await generateSunatQR(invoice, companySettings)
      if (qrImage) {
        const qrX = MARGIN_LEFT + textBoxWidth + 10
        const qrY = footerY
        const qrBoxWidth = qrSize + 10
        const qrBoxHeight = qrSize + 10

        // Borde del QR en gris
        doc.setDrawColor(...BORDER_GRAY)
        doc.setLineWidth(1)
        doc.roundedRect(qrX - 5, qrY - 5, qrBoxWidth, qrBoxHeight, 3, 3)

        // QR centrado en el recuadro
        doc.addImage(qrImage, 'PNG', qrX, qrY, qrSize, qrSize)

        // Etiqueta del QR centrada
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...MEDIUM_GRAY)
        const qrCenterX = qrX + qrSize / 2
        doc.text('Código QR SUNAT', qrCenterX, qrY + qrSize + 14, { align: 'center' })
      }
    } catch (error) {
      console.error('Error agregando QR al PDF:', error)
    }
  }

  // Guía de remisión si aplica
  if (invoice.dispatchGuideNumber) {
    currentY = footerY + qrSize + 20
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK_GRAY)
    doc.text(`Guía de Remisión: ${invoice.dispatchGuideNumber}`, MARGIN_LEFT, currentY)
  }

  // ========== GENERAR PDF ==========

  if (download) {
    let docTypeName = 'Boleta'
    if (invoice.documentType === 'factura') {
      docTypeName = 'Factura'
    } else if (invoice.documentType === 'nota_venta') {
      docTypeName = 'Nota_de_Venta'
    }
    const fileName = `${docTypeName}_${invoice.number.replace(/\//g, '-')}.pdf`
    doc.save(fileName)
  }

  return doc
}

/**
 * Genera un PDF simple para vista previa
 */
export const generateSimpleInvoicePDF = async (invoice) => {
  const companySettings = {
    businessName: 'MI EMPRESA',
    ruc: '20123456789',
    address: 'Dirección de la empresa',
    email: 'contacto@empresa.com',
    phone: '01-2345678'
  }

  return await generateInvoicePDF(invoice, companySettings)
}

/**
 * Exporta el PDF como blob para enviar por WhatsApp u otros usos
 */
export const getInvoicePDFBlob = async (invoice, companySettings) => {
  const doc = await generateInvoicePDF(invoice, companySettings, false)
  return doc.output('blob')
}
