import jsPDF from 'jspdf'
import { formatDate } from '@/lib/utils'
import QRCode from 'qrcode'
import { storage } from '@/lib/firebase'
import { ref, getDownloadURL, getBlob } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'

/**
 * Convierte un número a texto en español (para montos en facturas peruanas)
 * Soporta hasta 999,999,999 (millones)
 */
const numeroALetras = (num) => {
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
  const unidadesFem = ['', 'UNA', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
  const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const veintis = ['VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
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
      // 10-19
      resultado += (resultado ? ' ' : '') + especiales[u]
    } else if (d === 2) {
      // 20-29: VEINTE, VEINTIUNO, VEINTIDOS...
      resultado += (resultado ? ' ' : '') + veintis[u]
    } else {
      // 30-99
      if (d > 0) resultado += (resultado ? ' ' : '') + decenas[d]
      if (u > 0) {
        if (d > 0) resultado += ' Y '
        else if (resultado) resultado += ' '
        resultado += unidades[u]
      }
    }

    return resultado
  }

  const entero = Math.floor(num)
  const decimales = Math.round((num - entero) * 100)

  if (entero === 0) return `CERO CON ${decimales.toString().padStart(2, '0')}/100`

  const millones = Math.floor(entero / 1000000)
  const restoMillones = entero % 1000000
  const miles = Math.floor(restoMillones / 1000)
  const unidadesFinales = restoMillones % 1000

  let resultado = ''

  // Millones
  if (millones > 0) {
    if (millones === 1) {
      resultado = 'UN MILLON'
    } else {
      resultado = convertirGrupo(millones) + ' MILLONES'
    }
  }

  // Miles
  if (miles > 0) {
    if (resultado) resultado += ' '
    if (miles === 1) {
      resultado += 'MIL'
    } else {
      resultado += convertirGrupo(miles) + ' MIL'
    }
  }

  // Unidades
  if (unidadesFinales > 0) {
    if (resultado) resultado += ' '
    resultado += convertirGrupo(unidadesFinales)
  }

  return `${resultado} CON ${decimales.toString().padStart(2, '0')}/100`
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
    console.log('🔄 Cargando imagen, isNative:', isNative)

    // En plataformas nativas, usar CapacitorHttp que es más confiable
    if (isNative) {
      console.log('📱 Usando CapacitorHttp para cargar logo')
      try {
        // Primero obtener la URL de descarga directa
        const storagePath = getStoragePathFromUrl(url)
        let downloadUrl = url

        if (storagePath) {
          const storageRef = ref(storage, storagePath)
          downloadUrl = await getDownloadURL(storageRef)
          console.log('🔗 URL de descarga obtenida')
        }

        // Usar CapacitorHttp para descargar la imagen
        const response = await CapacitorHttp.get({
          url: downloadUrl,
          responseType: 'blob'
        })

        if (response.status === 200 && response.data) {
          // response.data ya viene como base64 cuando responseType es 'blob'
          const base64Data = response.data
          const mimeType = url.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg'
          console.log('✅ Logo cargado con CapacitorHttp')
          return `data:${mimeType};base64,${base64Data}`
        }
        throw new Error('No se pudo descargar la imagen')
      } catch (nativeError) {
        console.warn('⚠️ CapacitorHttp falló, intentando Firebase SDK:', nativeError.message)
      }
    }

    // Método estándar: Firebase SDK
    console.log('🔄 Cargando imagen desde Firebase Storage usando SDK')
    const storagePath = getStoragePathFromUrl(url)

    if (storagePath) {
      console.log('📁 Path extraído:', storagePath)
      const storageRef = ref(storage, storagePath)
      const blob = await getBlob(storageRef)

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

    // Fallback: intentar con fetch directo
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

    const dateSource = invoice.emissionDate || invoice.issueDate || invoice.createdAt
    let invoiceDate = new Date().toLocaleDateString('es-PE')
    if (dateSource) {
      if (typeof dateSource === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateSource)) {
        const [year, month, day] = dateSource.split('-')
        invoiceDate = `${day}/${month}/${year}`
      } else if (dateSource.toDate) {
        const date = dateSource.toDate()
        invoiceDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
      } else if (dateSource instanceof Date) {
        invoiceDate = `${String(dateSource.getDate()).padStart(2, '0')}/${String(dateSource.getMonth() + 1).padStart(2, '0')}/${dateSource.getFullYear()}`
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
 * Genera un PDF profesional estilo apisunat.com
 * Diseño limpio con colores neutros (negro/gris)
 */
export const generateInvoicePDF = async (invoice, companySettings, download = true) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  // Paleta de colores - Solo negro y grises
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [120, 120, 120]
  const LIGHT_GRAY = [240, 240, 240]
  const TABLE_HEADER_BG = [245, 245, 245]
  const BORDER_COLOR = [0, 0, 0]

  // Márgenes y dimensiones - A4: 595pt x 842pt
  const MARGIN_LEFT = 40
  const MARGIN_RIGHT = 40
  const MARGIN_TOP = 35
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  let currentY = MARGIN_TOP

  // ========== 1. ENCABEZADO - 3 COLUMNAS ==========

  const headerHeight = 95
  const logoMaxWidth = 90 // Ancho máximo del logo
  const docColumnWidth = 160
  let actualLogoWidth = 0 // Ancho real del logo después de cargarlo

  // COLUMNA 1: Logo (izquierda)
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
      let logoHeight = headerHeight - 10
      let logoWidth = logoHeight * aspectRatio

      if (logoWidth > logoMaxWidth) {
        logoWidth = logoMaxWidth
        logoHeight = logoWidth / aspectRatio
      }

      actualLogoWidth = logoWidth // Guardar el ancho real
      const logoX = MARGIN_LEFT
      const logoY = currentY + (headerHeight - logoHeight) / 2
      doc.addImage(imgData, format, logoX, logoY, logoWidth, logoHeight, undefined, 'FAST')
    } catch (error) {
      console.warn('⚠️ No se pudo cargar el logo:', error.message)
    }
  }

  // COLUMNA 2: Información de la empresa - justo al lado del logo con pequeño padding
  const logoPadding = 8 // Pequeño espacio entre logo y texto
  const infoX = MARGIN_LEFT + (actualLogoWidth > 0 ? actualLogoWidth : 0) + logoPadding
  const infoColumnWidth = CONTENT_WIDTH - (actualLogoWidth > 0 ? actualLogoWidth : 0) - logoPadding - docColumnWidth - 10

  // Obtener nombre comercial y razón social (en MAYÚSCULAS)
  // name = Nombre Comercial, businessName = Razón Social
  const commercialName = (companySettings?.name || companySettings?.businessName || 'EMPRESA SAC').toUpperCase()
  const legalName = (companySettings?.businessName || '').toUpperCase()
  const hasLegalName = legalName && legalName !== commercialName

  // Calcular altura total del contenido de empresa para centrar
  doc.setFontSize(13)
  const commercialNameLines = doc.splitTextToSize(commercialName, infoColumnWidth)
  const commercialNameHeight = commercialNameLines.length * 14
  const legalNameHeight = hasLegalName ? 12 : 0
  const addressHeight = companySettings?.address ? 20 : 0
  const totalInfoHeight = commercialNameHeight + legalNameHeight + addressHeight

  // Centrar verticalmente
  let infoY = currentY + (headerHeight - totalInfoHeight) / 2 + 10

  // Nombre comercial - GRANDE y en negrita (MAYÚSCULAS)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  commercialNameLines.forEach((line, i) => {
    doc.text(line, infoX, infoY + (i * 14))
  })
  infoY += commercialNameLines.length * 14 + 2

  // Razón social - más pequeña (MAYÚSCULAS)
  if (hasLegalName) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    const legalNameLines = doc.splitTextToSize(legalName, infoColumnWidth)
    doc.text(legalNameLines[0], infoX, infoY)
    infoY += 11
  }

  // Dirección - más pequeña (MAYÚSCULAS)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  if (companySettings?.address) {
    const addressText = companySettings.address.toUpperCase()
    const addressLines = doc.splitTextToSize(addressText, infoColumnWidth)
    addressLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, infoX, infoY + (i * 10))
    })
  }

  // COLUMNA 3: Recuadro del documento (derecha)
  const docBoxX = PAGE_WIDTH - MARGIN_RIGHT - docColumnWidth
  const docBoxY = currentY

  // Recuadro con borde negro
  doc.setDrawColor(...BORDER_COLOR)
  doc.setLineWidth(1.5)
  doc.rect(docBoxX, docBoxY, docColumnWidth, headerHeight)

  // Línea separadora después del RUC
  const rucLineY = docBoxY + 28
  doc.setLineWidth(0.5)
  doc.line(docBoxX, rucLineY, docBoxX + docColumnWidth, rucLineY)

  // RUC
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(`R.U.C. N° ${companySettings?.ruc || ''}`, docBoxX + docColumnWidth / 2, docBoxY + 18, { align: 'center' })

  // Tipo de documento (en dos líneas para que quepa en el recuadro)
  let documentLine1 = 'BOLETA DE VENTA'
  let documentLine2 = 'ELECTRÓNICA'
  if (invoice.documentType === 'factura') {
    documentLine1 = 'FACTURA'
    documentLine2 = 'ELECTRÓNICA'
  } else if (invoice.documentType === 'nota_venta') {
    documentLine1 = 'NOTA DE VENTA'
    documentLine2 = ''
  }

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  const titleY = rucLineY + 20
  doc.text(documentLine1, docBoxX + docColumnWidth / 2, titleY, { align: 'center' })
  if (documentLine2) {
    doc.text(documentLine2, docBoxX + docColumnWidth / 2, titleY + 13, { align: 'center' })
  }

  // Número de documento
  doc.setFontSize(13)
  const numberY = documentLine2 ? titleY + 30 : titleY + 18
  doc.text(invoice.number || 'N/A', docBoxX + docColumnWidth / 2, numberY, { align: 'center' })

  currentY += headerHeight + 20

  // ========== 2. DATOS DEL CLIENTE ==========

  // Calcular ancho de etiquetas para alinear valores
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')

  const labels = ['RAZÓN SOCIAL:', 'RUC:', 'DIRECCIÓN:', 'EMISIÓN:', 'MONEDA:', 'FORMA DE PAGO:', 'TIPO DE OPERACIÓN:']
  let maxLabelWidth = 0
  labels.forEach(label => {
    const width = doc.getTextWidth(label)
    if (width > maxLabelWidth) maxLabelWidth = width
  })
  maxLabelWidth += 5 // Padding

  const labelValueGap = 5 // Espacio entre etiqueta y valor
  const valueX = MARGIN_LEFT + maxLabelWidth + labelValueGap

  // Razón Social
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('RAZÓN SOCIAL:', MARGIN_LEFT + maxLabelWidth - doc.getTextWidth('RAZÓN SOCIAL:'), currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(invoice.customer?.name || 'CLIENTE GENERAL', valueX, currentY)
  currentY += 13

  // RUC/DNI
  const docType = invoice.customer?.documentType === 'RUC' ? 'RUC' :
                  invoice.customer?.documentType === 'DNI' ? 'DNI' : 'DOC'
  doc.setFont('helvetica', 'bold')
  doc.text(`${docType}:`, MARGIN_LEFT + maxLabelWidth - doc.getTextWidth(`${docType}:`), currentY)
  doc.setFont('helvetica', 'normal')
  const docNumber = invoice.customer?.documentNumber && invoice.customer.documentNumber !== '00000000'
                    ? invoice.customer.documentNumber : '-'
  doc.text(docNumber, valueX, currentY)
  currentY += 13

  // Dirección
  doc.setFont('helvetica', 'bold')
  doc.text('DIRECCIÓN:', MARGIN_LEFT + maxLabelWidth - doc.getTextWidth('DIRECCIÓN:'), currentY)
  doc.setFont('helvetica', 'normal')
  const customerAddress = invoice.customer?.address || '-'
  const addrLines = doc.splitTextToSize(customerAddress, CONTENT_WIDTH - maxLabelWidth)
  doc.text(addrLines[0], valueX, currentY)
  currentY += 15

  // Fecha de emisión
  const pdfDateSource = invoice.emissionDate || invoice.issueDate || invoice.createdAt
  let pdfInvoiceDate = new Date().toLocaleDateString('es-PE')
  let pdfInvoiceTime = ''
  if (pdfDateSource) {
    if (typeof pdfDateSource === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pdfDateSource)) {
      const [year, month, day] = pdfDateSource.split('-')
      pdfInvoiceDate = `${year}-${month}-${day}`
    } else if (pdfDateSource.toDate) {
      const date = pdfDateSource.toDate()
      pdfInvoiceDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      pdfInvoiceTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
    } else if (pdfDateSource instanceof Date) {
      pdfInvoiceDate = `${pdfDateSource.getFullYear()}-${String(pdfDateSource.getMonth() + 1).padStart(2, '0')}-${String(pdfDateSource.getDate()).padStart(2, '0')}`
      pdfInvoiceTime = `${String(pdfDateSource.getHours()).padStart(2, '0')}:${String(pdfDateSource.getMinutes()).padStart(2, '0')}:${String(pdfDateSource.getSeconds()).padStart(2, '0')}`
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.text('EMISIÓN:', MARGIN_LEFT + maxLabelWidth - doc.getTextWidth('EMISIÓN:'), currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(`${pdfInvoiceDate}${pdfInvoiceTime ? ' - ' + pdfInvoiceTime : ''}`, valueX, currentY)
  currentY += 13

  // Moneda
  doc.setFont('helvetica', 'bold')
  doc.text('MONEDA:', MARGIN_LEFT + maxLabelWidth - doc.getTextWidth('MONEDA:'), currentY)
  doc.setFont('helvetica', 'normal')
  doc.text('SOL (PEN)', valueX, currentY)
  currentY += 13

  // Forma de pago
  const totalPaid = invoice.payments && invoice.payments.length > 0
    ? invoice.payments.reduce((sum, p) => sum + (p.amount || 0), 0)
    : 0
  const isCreditSale = totalPaid === 0
  const paymentForm = isCreditSale ? 'CRÉDITO' : 'CONTADO'

  doc.setFont('helvetica', 'bold')
  doc.text('FORMA DE PAGO:', MARGIN_LEFT + maxLabelWidth - doc.getTextWidth('FORMA DE PAGO:'), currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(paymentForm, valueX, currentY)
  currentY += 13

  // Tipo de operación
  doc.setFont('helvetica', 'bold')
  doc.text('TIPO DE OPERACIÓN:', MARGIN_LEFT + maxLabelWidth - doc.getTextWidth('TIPO DE OPERACIÓN:'), currentY)
  doc.setFont('helvetica', 'normal')
  doc.text('VENTA INTERNA', valueX, currentY)
  currentY += 18

  // ========== 3. TABLA DE PRODUCTOS ==========

  const tableY = currentY
  const headerRowHeight = 22
  const dataRowHeight = 20

  // Definir columnas como en el ejemplo
  const colWidths = {
    cant: CONTENT_WIDTH * 0.15,
    desc: CONTENT_WIDTH * 0.45,
    pu: CONTENT_WIDTH * 0.20,
    total: CONTENT_WIDTH * 0.20
  }

  let colX = MARGIN_LEFT
  const cols = {
    cant: colX,
    desc: colX += colWidths.cant,
    pu: colX += colWidths.desc,
    total: colX += colWidths.pu
  }

  // Encabezado de tabla con fondo gris oscuro y texto blanco
  doc.setFillColor(70, 70, 70) // Gris oscuro en lugar de negro
  doc.rect(MARGIN_LEFT, tableY, CONTENT_WIDTH, headerRowHeight, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal') // Letra más delgada (normal en vez de bold)
  doc.setTextColor(255, 255, 255) // Texto blanco

  const headerRowY = tableY + 14

  doc.text('CANTIDAD', cols.cant + colWidths.cant / 2, headerRowY, { align: 'center' })
  doc.text('CÓDIGO y DESCRIPCIÓN', cols.desc + 10, headerRowY)
  doc.text('PRECIO UNITARIO', cols.pu + colWidths.pu / 2, headerRowY, { align: 'center' })
  doc.text('PRECIO TOTAL', cols.total + colWidths.total / 2, headerRowY, { align: 'center' })

  // Filas de datos
  let dataRowY = tableY + headerRowHeight
  const items = invoice.items || []
  const lineHeight = 11 // Altura de cada línea de texto
  const minRowHeight = 20 // Altura mínima de fila
  const rowPadding = 6 // Padding vertical

  // Mapeo de códigos de unidad a texto legible
  const unitLabels = {
    'UNIDAD': 'UNIDAD',
    'CAJA': 'CAJA',
    'KG': 'KG',
    'LITRO': 'LITRO',
    'METRO': 'METRO',
    'HORA': 'HORA',
    'SERVICIO': 'SERVICIO'
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...BLACK)

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const precioConIGV = item.unitPrice || item.price || 0
    const importeConIGV = item.quantity * precioConIGV

    // Descripción (calcular líneas primero para saber altura de fila)
    const itemDesc = item.name || item.description || ''
    const descLines = doc.splitTextToSize(itemDesc, colWidths.desc - 15)

    // Calcular altura dinámica de la fila según líneas de descripción
    const descHeight = descLines.length * lineHeight
    const currentRowHeight = Math.max(minRowHeight, descHeight + rowPadding)

    // Solo línea inferior sutil (sin bordes verticales como en el ejemplo)
    doc.setDrawColor(200, 200, 200) // Gris claro
    doc.setLineWidth(0.5)
    doc.line(MARGIN_LEFT, dataRowY + currentRowHeight, MARGIN_LEFT + CONTENT_WIDTH, dataRowY + currentRowHeight)

    const firstLineY = dataRowY + 14

    // Cantidad con unidad (usar el código de unidad del producto)
    const quantityText = Number.isInteger(item.quantity)
      ? item.quantity.toString()
      : item.quantity.toFixed(3).replace(/\.?0+$/, '')
    const unitCode = item.unit || 'UNIDAD'
    const unitText = unitLabels[unitCode] || unitCode
    doc.text(`${quantityText} ${unitText}`, cols.cant + colWidths.cant / 2, firstLineY, { align: 'center' })

    // Descripción - todas las líneas
    descLines.forEach((line, lineIndex) => {
      doc.text(line, cols.desc + 8, firstLineY + (lineIndex * lineHeight))
    })

    // Precio unitario con formato (alineado a la derecha)
    const puFormatted = precioConIGV.toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    doc.text(puFormatted, cols.pu + colWidths.pu - 10, firstLineY, { align: 'right' })

    // Precio total (alineado a la derecha)
    const totalFormatted = importeConIGV.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    doc.text(totalFormatted, cols.total + colWidths.total - 10, firstLineY, { align: 'right' })

    dataRowY += currentRowHeight
  }

  currentY = dataRowY + 8

  // ========== 4. TOTALES (estilo tabla con filas grises intercaladas) ==========

  const totalsWidth = 220
  const totalsRowHeight = 18
  const totalsX = MARGIN_LEFT + CONTENT_WIDTH - totalsWidth
  const totalsStartY = currentY // Guardar posición inicial para el recuadro de monto en letras

  // OP. GRAVADA - Fondo gris claro
  const igvExempt = companySettings?.taxConfig?.igvExempt || false
  const labelGravada = igvExempt ? 'OP. EXONERADA' : 'OP. GRAVADA'

  doc.setFillColor(245, 245, 245) // Gris muy claro
  doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'F')
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.5)
  doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'S')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  doc.text(labelGravada, totalsX + totalsWidth - 90, currentY + 12, { align: 'right' })
  doc.text((invoice.subtotal || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 8, currentY + 12, { align: 'right' })
  currentY += totalsRowHeight

  // IGV - Sin fondo (blanco)
  doc.setDrawColor(200, 200, 200)
  doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'S')

  doc.text('IGV', totalsX + totalsWidth - 90, currentY + 12, { align: 'right' })
  doc.text((invoice.igv || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 8, currentY + 12, { align: 'right' })
  currentY += totalsRowHeight

  // IMPORTE TOTAL - Fondo gris claro, texto más grande
  doc.setFillColor(245, 245, 245)
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(1)
  doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight + 6, 'FD')

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('IMPORTE TOTAL (S/)', totalsX + 8, currentY + 15)
  doc.setFontSize(14)
  doc.text((invoice.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 8, currentY + 15, { align: 'right' })

  // ========== MONTO EN LETRAS (a la izquierda de los totales) ==========
  const letrasBoxWidth = totalsX - MARGIN_LEFT - 10 // Ancho del recuadro de letras
  const letrasBoxHeight = currentY + totalsRowHeight + 6 - totalsStartY // Misma altura que los totales
  const montoEnLetras = numeroALetras(invoice.total || 0) + ' SOLES'

  // Dibujar recuadro
  doc.setDrawColor(...BORDER_COLOR)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN_LEFT, totalsStartY, letrasBoxWidth, letrasBoxHeight, 'S')

  // Texto "SON:" y monto en letras
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('SON:', MARGIN_LEFT + 5, totalsStartY + 12)

  doc.setFont('helvetica', 'normal')
  // Dividir el texto en líneas si es muy largo
  const letrasLines = doc.splitTextToSize(montoEnLetras, letrasBoxWidth - 40)
  doc.text(letrasLines, MARGIN_LEFT + 28, totalsStartY + 12)

  currentY += totalsRowHeight + 14

  // ========== 5. CUENTAS BANCARIAS (si existen) ==========

  if (companySettings?.bankAccounts && companySettings.bankAccounts.length > 0) {
    // Título con fondo gris
    doc.setFillColor(...TABLE_HEADER_BG)
    doc.setDrawColor(...BORDER_COLOR)
    doc.setLineWidth(0.5)
    doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, 18, 'FD')

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('CUENTAS BANCARIAS', MARGIN_LEFT + CONTENT_WIDTH / 2, currentY + 12, { align: 'center' })
    currentY += 18

    // Contenido
    const accountsStartY = currentY
    currentY += 10

    companySettings.bankAccounts.forEach((account) => {
      doc.setFont('helvetica', 'bold')
      doc.text(account.bankName || 'Banco', MARGIN_LEFT + 10, currentY)
      doc.text(account.accountNumber || '', MARGIN_LEFT + CONTENT_WIDTH - 10, currentY, { align: 'right' })
      currentY += 12

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MEDIUM_GRAY)
      doc.text(`${account.currency || 'PEN'} (S/)`, MARGIN_LEFT + 10, currentY)
      if (account.cci) {
        doc.text(`CCI: ${account.cci}`, MARGIN_LEFT + CONTENT_WIDTH - 10, currentY, { align: 'right' })
      }
      doc.setTextColor(...BLACK)
      currentY += 15
    })

    // Borde del contenido
    doc.setDrawColor(...BORDER_COLOR)
    doc.rect(MARGIN_LEFT, accountsStartY, CONTENT_WIDTH, currentY - accountsStartY + 5)
    currentY += 15
  }

  // ========== 6. QR Y HASH (encerrado en recuadro) ==========

  currentY += 5
  const qrSize = 70
  const qrBoxHeight = 85
  const qrBoxPadding = 8

  if (invoice.documentType !== 'nota_venta') {
    // Dibujar recuadro que encierra QR y texto
    doc.setDrawColor(...BORDER_COLOR)
    doc.setLineWidth(1)
    doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, qrBoxHeight)

    // QR dentro del recuadro
    const qrX = MARGIN_LEFT + qrBoxPadding
    const qrY = currentY + (qrBoxHeight - qrSize) / 2

    try {
      const qrImage = await generateSunatQR(invoice, companySettings)
      if (qrImage) {
        doc.addImage(qrImage, 'PNG', qrX, qrY, qrSize, qrSize)
      }
    } catch (error) {
      console.error('Error generando QR:', error)
    }

    // Hash y texto de validación (al lado del QR)
    const textX = qrX + qrSize + 15
    let textY = currentY + 25

    if (invoice.sunatHash) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...BLACK)
      doc.text(invoice.sunatHash, textX, textY)
      textY += 16
    }

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)

    let docTypeText = 'BOLETA DE VENTA'
    if (invoice.documentType === 'factura') {
      docTypeText = 'FACTURA'
    }

    doc.text(`Representación Impresa de la ${docTypeText} ELECTRÓNICA.`, textX, textY)
    textY += 11
    doc.text('Consultar validez en ', textX, textY)
    doc.setFont('helvetica', 'bold')
    doc.text('sunat.gob.pe', textX + doc.getTextWidth('Consultar validez en '), textY)

    currentY += qrBoxHeight + 10

  } else {
    // Nota de venta - sin recuadro
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text('DOCUMENTO NO VÁLIDO PARA EFECTOS TRIBUTARIOS', MARGIN_LEFT, currentY + 15)
    currentY += 25
  }

  // ========== 7. PIE DE PÁGINA ==========

  // Línea separadora
  doc.setDrawColor(...MEDIUM_GRAY)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, PAGE_HEIGHT - 35, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 35)

  // Texto del footer
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  doc.text('Documento generado en Cobrify - Sistema de Facturación Electrónica', MARGIN_LEFT + CONTENT_WIDTH / 2, PAGE_HEIGHT - 22, { align: 'center' })
  doc.text('Página 1 de 1', PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 22, { align: 'right' })

  // ========== GENERAR PDF ==========

  if (download) {
    let docTypeName = 'Boleta'
    if (invoice.documentType === 'factura') {
      docTypeName = 'Factura'
    } else if (invoice.documentType === 'nota_venta') {
      docTypeName = 'Nota_de_Venta'
    }
    const fileName = `${docTypeName}_${invoice.number.replace(/\//g, '-')}.pdf`

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
        return { success: true, uri: result.uri, fileName, doc }
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
