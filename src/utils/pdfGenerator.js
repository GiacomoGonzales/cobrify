import jsPDF from 'jspdf'
import { formatDate } from '@/lib/utils'
import QRCode from 'qrcode'
import { storage } from '@/lib/firebase'
import { ref, getDownloadURL, getBlob } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

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
 * Sistema de caché para logos
 * Guarda el logo en localStorage para evitar descargarlo cada vez
 */
const LOGO_CACHE_KEY = 'cobrify_logo_cache'
const LOGO_CACHE_EXPIRY = 24 * 60 * 60 * 1000 // 24 horas

const getLogoFromCache = (logoUrl) => {
  try {
    const cached = localStorage.getItem(LOGO_CACHE_KEY)
    if (!cached) return null

    const { url, data, timestamp } = JSON.parse(cached)

    // Verificar si es el mismo logo y no ha expirado
    if (url === logoUrl && (Date.now() - timestamp) < LOGO_CACHE_EXPIRY) {
      console.log('✅ Logo obtenido desde caché')
      return data
    }

    // Caché expirado o logo diferente
    return null
  } catch (error) {
    console.warn('⚠️ Error leyendo caché de logo:', error)
    return null
  }
}

const saveLogoToCache = (logoUrl, base64Data) => {
  try {
    const cacheData = {
      url: logoUrl,
      data: base64Data,
      timestamp: Date.now()
    }
    localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(cacheData))
    console.log('✅ Logo guardado en caché')
  } catch (error) {
    console.warn('⚠️ Error guardando logo en caché:', error)
    // Si localStorage está lleno, intentar limpiar
    try {
      localStorage.removeItem(LOGO_CACHE_KEY)
    } catch (e) {
      // Ignorar
    }
  }
}

/**
 * Invalida el caché del logo (llamar cuando se actualiza el logo en configuración)
 */
export const invalidateLogoCache = () => {
  try {
    localStorage.removeItem(LOGO_CACHE_KEY)
    console.log('🗑️ Caché de logo invalidado')
  } catch (error) {
    console.warn('⚠️ Error invalidando caché:', error)
  }
}

/**
 * Pre-carga el logo en caché para que esté disponible instantáneamente
 * Llamar esta función cuando se carga la configuración de la empresa
 */
export const preloadLogo = async (logoUrl) => {
  if (!logoUrl) return null

  try {
    // Si ya está en caché, no hacer nada
    const cached = getLogoFromCache(logoUrl)
    if (cached) {
      console.log('✅ Logo ya está en caché')
      return cached
    }

    console.log('🔄 Pre-cargando logo en background...')
    const result = await loadImageAsBase64(logoUrl)
    console.log('✅ Logo pre-cargado exitosamente')
    return result
  } catch (error) {
    console.warn('⚠️ Error pre-cargando logo:', error)
    return null
  }
}

/**
 * Carga imagen con reintentos
 * Retorna null si falla (no lanza error para no bloquear la generación del PDF)
 */
const loadImageWithRetry = async (url, maxRetries = 2, timeout = 10000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Intento ${attempt}/${maxRetries} de cargar logo...`)

      const result = await Promise.race([
        loadImageAsBase64(url),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout después de ${timeout/1000}s`)), timeout)
        )
      ])

      if (result) {
        console.log(`✅ Logo cargado en intento ${attempt}`)
        return result
      }
    } catch (error) {
      console.warn(`⚠️ Intento ${attempt} falló:`, error.message)

      if (attempt < maxRetries) {
        // Esperar un poco antes de reintentar
        const waitTime = 1000
        console.log(`⏳ Esperando ${waitTime}ms antes de reintentar...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  // Retornar null en lugar de lanzar error - el PDF se generará sin logo
  console.warn('⚠️ No se pudo cargar el logo, continuando sin logo')
  return null
}

/**
 * Carga una imagen desde Firebase Storage y la convierte a base64
 * Utiliza caché para mejorar rendimiento
 */
const loadImageAsBase64 = async (url) => {
  try {
    // Primero intentar obtener del caché
    const cachedLogo = getLogoFromCache(url)
    if (cachedLogo) {
      return cachedLogo
    }

    console.log('🔄 Logo no está en caché, descargando...')
    const isNative = Capacitor.isNativePlatform()

    let base64Result = null

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
          base64Result = `data:${mimeType};base64,${base64Data}`
          console.log('✅ Logo cargado con CapacitorHttp')
          saveLogoToCache(url, base64Result)
          return base64Result
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
          const result = reader.result
          saveLogoToCache(url, result)
          resolve(result)
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
        const result = reader.result
        saveLogoToCache(url, result)
        resolve(result)
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
 * Convierte un color hexadecimal a RGB
 */
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [70, 70, 70] // Gris oscuro por defecto
}

/**
 * Genera un PDF profesional estilo apisunat.com
 * Diseño con pie de página fijo y espacio flexible para productos
 */
export const generateInvoicePDF = async (invoice, companySettings, download = true, branding = null, branches = []) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  // Paleta de colores
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [120, 120, 120]
  const LIGHT_GRAY = [240, 240, 240]
  const TABLE_HEADER_BG = [245, 245, 245]
  const BORDER_COLOR = [0, 0, 0]

  // Color de acento dinámico (configurado por el usuario)
  const ACCENT_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#464646')

  // Márgenes y dimensiones - A4: 595pt x 842pt
  const MARGIN_LEFT = 20
  const MARGIN_RIGHT = 20
  const MARGIN_TOP = 20
  const MARGIN_BOTTOM = 15
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  let currentY = MARGIN_TOP

  // ========== 1. ENCABEZADO - 3 COLUMNAS PERFECTAMENTE ALINEADAS ==========

  const headerHeight = 100
  const logoColumnWidth = 100  // Columna izquierda para logo
  const docColumnWidth = 145   // Columna derecha para recuadro factura
  const infoColumnWidth = CONTENT_WIDTH - logoColumnWidth - docColumnWidth - 20 // Columna central

  // Posiciones X de cada columna
  const logoX = MARGIN_LEFT
  const infoCenterX = MARGIN_LEFT + logoColumnWidth + 10 + (infoColumnWidth / 2) // Centro de la columna
  const docBoxX = PAGE_WIDTH - MARGIN_RIGHT - docColumnWidth

  // ===== COLUMNA 1: LOGO (izquierda) =====
  if (companySettings?.logoUrl) {
    try {
      const imgData = await loadImageWithRetry(companySettings.logoUrl)

      // Si no se pudo cargar el logo, continuar sin él
      if (!imgData) {
        console.warn('⚠️ Logo no disponible, continuando sin logo')
      } else {
        let format = 'PNG'
        if (companySettings.logoUrl.toLowerCase().includes('.jpg') ||
            companySettings.logoUrl.toLowerCase().includes('.jpeg')) {
          format = 'JPEG'
        }

        const img = new Image()
        img.src = imgData
        await new Promise((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = (err) => reject(err)
        })

        const aspectRatio = img.width / img.height

        // Altura máxima: proporcional al header
        const maxLogoHeight = headerHeight - 15

        let logoWidth, logoHeight

        if (aspectRatio >= 2) {
          // Logo muy horizontal (2:1 o más): permitir más ancho pero con límite
          const maxHorizontalWidth = logoColumnWidth + infoColumnWidth - 20
          logoHeight = maxLogoHeight * 0.7
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > maxHorizontalWidth) {
            logoWidth = maxHorizontalWidth
            logoHeight = logoWidth / aspectRatio
          }
        } else if (aspectRatio >= 1.3) {
          // Logo horizontal moderado (1.3:1 a 2:1): permitir más ancho
          const maxLogoWidth = logoColumnWidth + 30
          logoWidth = maxLogoWidth
          logoHeight = logoWidth / aspectRatio
          if (logoHeight > maxLogoHeight) {
            logoHeight = maxLogoHeight
            logoWidth = logoHeight * aspectRatio
          }
        } else if (aspectRatio >= 1) {
          // Logo cuadrado o casi cuadrado: limitar tamaño para no superponerse
          const maxLogoWidth = logoColumnWidth - 5
          logoHeight = maxLogoHeight * 0.75 // Reducir altura para logos cuadrados
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > maxLogoWidth) {
            logoWidth = maxLogoWidth
            logoHeight = logoWidth / aspectRatio
          }
        } else {
          // Logo vertical: priorizar altura máxima
          const maxLogoWidth = logoColumnWidth - 5
          logoHeight = maxLogoHeight
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > maxLogoWidth) {
            logoWidth = maxLogoWidth
            logoHeight = logoWidth / aspectRatio
          }
        }

        const logoYPos = currentY + (headerHeight - logoHeight) / 2 - 10
        doc.addImage(imgData, format, logoX, logoYPos, logoWidth, logoHeight, undefined, 'FAST')
      }
    } catch (error) {
      console.warn('⚠️ No se pudo cargar el logo:', error.message)
    }
  }

  // ===== ESLOGAN debajo del logo =====
  if (companySettings?.companySlogan) {
    const slogan = companySettings.companySlogan.toUpperCase()
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)

    // El eslogan ocupa el ancho del logo + área de información (centrado)
    const sloganMaxWidth = logoColumnWidth + infoColumnWidth - 10
    const sloganLines = doc.splitTextToSize(slogan, sloganMaxWidth)

    // Limitar a máximo 2 líneas
    const linesToShow = sloganLines.slice(0, 2)

    // Posición: en la parte inferior del header, más arriba que antes
    const sloganCenterX = logoX + (sloganMaxWidth / 2)
    const sloganY = currentY + headerHeight - 18
    linesToShow.forEach((line, index) => {
      doc.text(line, sloganCenterX, sloganY + (index * 10), { align: 'center' })
    })

    doc.setTextColor(...BLACK) // Restaurar color
  }

  // ===== COLUMNA 2: DATOS DE LA EMPRESA (centro) =====
  // Recopilar todos los datos disponibles
  const companyName = (companySettings?.name || companySettings?.businessName || 'EMPRESA SAC').toUpperCase()
  const businessName = companySettings?.businessName ? companySettings.businessName.toUpperCase() : ''
  const showBusinessName = businessName && businessName !== companyName

  // Preparar lista de sucursales/direcciones para mostrar
  // Si hay branches, mostrar todas. Si no, usar la dirección de la empresa
  let branchLocations = []
  const activeBranches = branches.filter(b => b.isActive !== false)

  if (activeBranches.length > 0) {
    // Agregar "Sucursal Principal" (datos de la empresa) si tiene dirección
    if (companySettings?.address) {
      let mainAddress = companySettings.address
      if (companySettings?.district || companySettings?.province || companySettings?.department) {
        const locationParts = [companySettings?.district, companySettings?.province, companySettings?.department].filter(Boolean)
        if (locationParts.length > 0) mainAddress += ' - ' + locationParts.join(', ')
      }
      branchLocations.push({
        name: 'Principal',
        address: mainAddress,
        phone: companySettings?.phone || ''
      })
    }
    // Agregar sucursales adicionales
    activeBranches.forEach(branch => {
      if (branch.address || branch.phone) {
        branchLocations.push({
          name: branch.name || 'Sucursal',
          address: branch.address || '',
          phone: branch.phone || ''
        })
      }
    })
  } else {
    // Sin sucursales, usar dirección de la empresa o del comprobante
    let fullAddress = ''
    if (invoice.branchAddress) {
      fullAddress = invoice.branchAddress
    } else if (invoice.warehouseAddress) {
      fullAddress = invoice.warehouseAddress
    } else if (companySettings?.address) {
      fullAddress = companySettings.address
      if (companySettings?.district || companySettings?.province || companySettings?.department) {
        const locationParts = [companySettings?.district, companySettings?.province, companySettings?.department].filter(Boolean)
        if (locationParts.length > 0) fullAddress += ' - ' + locationParts.join(', ')
      }
    }
    const phone = invoice.branchPhone || invoice.warehousePhone || companySettings?.phone || ''
    if (fullAddress || phone) {
      branchLocations.push({ name: '', address: fullAddress, phone })
    }
  }

  const email = companySettings?.email || ''
  const website = companySettings?.website || ''

  // Calcular contenido y altura para centrar verticalmente
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  const nameLines = doc.splitTextToSize(companyName, infoColumnWidth - 10)

  // Contar líneas totales para centrar
  let totalLines = nameLines.length
  if (showBusinessName) totalLines += 1
  // Líneas para sucursales (cada sucursal = 1 línea)
  totalLines += branchLocations.length
  if (email) totalLines += 1
  if (website) totalLines += 1

  const lineSpacing = 10
  const totalTextHeight = totalLines * lineSpacing + 15
  let infoY = currentY + (headerHeight - totalTextHeight) / 2 + 12

  // Dibujar nombre comercial (centrado)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  nameLines.forEach((line, i) => {
    doc.text(line, infoCenterX, infoY, { align: 'center' })
    infoY += 12
  })

  // Razón social si es diferente
  if (showBusinessName) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    doc.text(businessName, infoCenterX, infoY, { align: 'center' })
    infoY += 10
  }

  // Mostrar sucursales/direcciones
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  branchLocations.forEach(loc => {
    let line = ''
    if (loc.name) line += loc.name + ': '
    if (loc.address) line += loc.address
    if (loc.phone) line += (loc.address ? ' - ' : '') + 'Tel: ' + loc.phone
    if (line) {
      // Truncar si es muy largo
      const maxWidth = infoColumnWidth - 10
      const truncatedLines = doc.splitTextToSize(line, maxWidth)
      doc.text(truncatedLines[0], infoCenterX, infoY, { align: 'center' })
      infoY += 9
    }
  })

  // Email
  if (email) {
    doc.text(`Email: ${email}`, infoCenterX, infoY, { align: 'center' })
    infoY += 9
  }

  // Página web
  if (website) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK_GRAY)
    doc.text(website, infoCenterX, infoY, { align: 'center' })
  }

  // ===== COLUMNA 3: RECUADRO DEL DOCUMENTO (derecha) =====
  const docBoxY = currentY

  // Altura de la sección del RUC (parte superior con fondo de color)
  const rucSectionHeight = 26

  // Fondo de color para la sección del RUC
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(docBoxX, docBoxY, docColumnWidth, rucSectionHeight, 'F')

  // Recuadro completo con borde
  doc.setDrawColor(...BORDER_COLOR)
  doc.setLineWidth(1.5)
  doc.rect(docBoxX, docBoxY, docColumnWidth, headerHeight)

  // Línea separadora después del RUC
  const rucLineY = docBoxY + rucSectionHeight
  doc.setLineWidth(0.5)
  doc.line(docBoxX, rucLineY, docBoxX + docColumnWidth, rucLineY)

  // RUC (texto blanco sobre fondo de color)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(`R.U.C. ${companySettings?.ruc || ''}`, docBoxX + docColumnWidth / 2, docBoxY + 16, { align: 'center' })
  doc.setTextColor(...BLACK) // Restaurar color negro para el resto

  // Tipo de documento
  let documentLine1 = 'BOLETA DE VENTA'
  let documentLine2 = 'ELECTRÓNICA'
  if (invoice.documentType === 'factura') {
    documentLine1 = 'FACTURA'
    documentLine2 = 'ELECTRÓNICA'
  } else if (invoice.documentType === 'nota_venta') {
    documentLine1 = 'NOTA DE VENTA'
    documentLine2 = ''
  } else if (invoice.documentType === 'nota_credito') {
    documentLine1 = 'NOTA DE CRÉDITO'
    documentLine2 = 'ELECTRÓNICA'
  } else if (invoice.documentType === 'nota_debito') {
    documentLine1 = 'NOTA DE DÉBITO'
    documentLine2 = 'ELECTRÓNICA'
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  const titleY = rucLineY + 18
  doc.text(documentLine1, docBoxX + docColumnWidth / 2, titleY, { align: 'center' })
  if (documentLine2) {
    doc.text(documentLine2, docBoxX + docColumnWidth / 2, titleY + 12, { align: 'center' })
  }

  // Número de documento
  doc.setFontSize(12)
  const numberY = documentLine2 ? titleY + 30 : titleY + 16
  doc.text(invoice.number || 'N/A', docBoxX + docColumnWidth / 2, numberY, { align: 'center' })

  currentY += headerHeight + 15

  // ========== 2. DATOS DEL CLIENTE (DOS COLUMNAS) ==========

  doc.setFontSize(9)
  doc.setTextColor(...BLACK)

  // Configuración de dos columnas
  const colLeftX = MARGIN_LEFT
  const colRightX = MARGIN_LEFT + CONTENT_WIDTH * 0.5 + 10
  const colWidth = CONTENT_WIDTH * 0.5 - 10
  const dataLineHeight = 12

  // Calcular anchos de etiquetas para cada columna
  const leftLabels = ['RAZÓN SOCIAL:', 'RUC:', 'DIRECCIÓN:', 'VENDEDOR:']
  const rightLabels = ['EMISIÓN:', 'MONEDA:', 'FORMA DE PAGO:', 'VENCIMIENTO:', 'OPERACIÓN:']

  doc.setFont('helvetica', 'bold')
  let maxLeftLabel = 0
  leftLabels.forEach(l => { maxLeftLabel = Math.max(maxLeftLabel, doc.getTextWidth(l)) })
  let maxRightLabel = 0
  rightLabels.forEach(l => { maxRightLabel = Math.max(maxRightLabel, doc.getTextWidth(l)) })

  const leftValueX = colLeftX + maxLeftLabel + 5
  const rightValueX = colRightX + maxRightLabel + 5

  // Preparar datos - Formato dd/mm/yyyy para emisión
  const pdfDateSource = invoice.emissionDate || invoice.issueDate || invoice.createdAt
  let pdfInvoiceDate = new Date().toLocaleDateString('es-PE')
  if (pdfDateSource) {
    if (typeof pdfDateSource === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pdfDateSource)) {
      const [year, month, day] = pdfDateSource.split('-')
      pdfInvoiceDate = `${day}/${month}/${year}`
    } else if (pdfDateSource.toDate) {
      const date = pdfDateSource.toDate()
      pdfInvoiceDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
    } else if (pdfDateSource instanceof Date) {
      pdfInvoiceDate = `${String(pdfDateSource.getDate()).padStart(2, '0')}/${String(pdfDateSource.getMonth() + 1).padStart(2, '0')}/${pdfDateSource.getFullYear()}`
    }
  }

  let paymentForm = 'CONTADO'
  if (invoice.paymentType === 'credito') {
    // Calcular días de crédito basado en fecha de emisión y vencimiento
    let creditDays = 30 // Por defecto
    if (invoice.paymentDueDate) {
      const emissionDateObj = pdfDateSource
        ? (pdfDateSource.toDate ? pdfDateSource.toDate() : new Date(pdfDateSource))
        : new Date()
      const dueDateObj = new Date(invoice.paymentDueDate + 'T00:00:00')
      const diffTime = dueDateObj - emissionDateObj
      creditDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
      if (creditDays < 0) creditDays = 30
    }
    paymentForm = `CRÉDITO ${creditDays} DÍAS`
  } else if (invoice.paymentType === 'contado') {
    paymentForm = 'CONTADO'
  } else {
    const totalPaid = invoice.payments && invoice.payments.length > 0
      ? invoice.payments.reduce((sum, p) => sum + (p.amount || 0), 0)
      : 0
    paymentForm = totalPaid === 0 ? 'CRÉDITO' : 'CONTADO'
  }

  const docType = invoice.customer?.documentType === 'RUC' ? 'RUC' :
                  invoice.customer?.documentType === 'DNI' ? 'DNI' : 'DOC'
  const docNumber = invoice.customer?.documentNumber && invoice.customer.documentNumber !== '00000000'
                    ? invoice.customer.documentNumber : '-'
  const customerAddress = invoice.customer?.address || '-'

  const startY = currentY

  // ===== COLUMNA IZQUIERDA (Datos del cliente) =====
  let leftY = startY

  // Razón Social
  doc.setFont('helvetica', 'bold')
  doc.text('RAZÓN SOCIAL:', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  const customerName = invoice.customer?.name || 'CLIENTE GENERAL'
  const customerNameLines = doc.splitTextToSize(customerName, colWidth - maxLeftLabel - 10)
  doc.text(customerNameLines[0], leftValueX, leftY)
  leftY += dataLineHeight

  // RUC/DNI
  doc.setFont('helvetica', 'bold')
  doc.text(`${docType}:`, colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  doc.text(docNumber, leftValueX, leftY)
  leftY += dataLineHeight

  // Dirección
  doc.setFont('helvetica', 'bold')
  doc.text('DIRECCIÓN:', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  const addrLines = doc.splitTextToSize(customerAddress, colWidth - maxLeftLabel - 10)
  doc.text(addrLines[0], leftValueX, leftY)
  if (addrLines[1]) {
    leftY += 10
    doc.text(addrLines[1], leftValueX, leftY)
  }
  leftY += dataLineHeight

  // Teléfono del cliente (si existe)
  if (invoice.customer?.phone) {
    doc.setFont('helvetica', 'bold')
    doc.text('TELÉFONO:', colLeftX, leftY)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.customer.phone, leftValueX, leftY)
    leftY += dataLineHeight
  }

  // Vendedor (si existe)
  if (invoice.sellerName) {
    doc.setFont('helvetica', 'bold')
    doc.text('VENDEDOR:', colLeftX, leftY)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.sellerName, leftValueX, leftY)
    leftY += dataLineHeight
  }

  // ===== COLUMNA DERECHA (Datos de la factura) =====
  let rightY = startY

  // Emisión
  doc.setFont('helvetica', 'bold')
  doc.text('EMISIÓN:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text(pdfInvoiceDate, rightValueX, rightY)
  rightY += dataLineHeight

  // ===== CAMPOS ESPECÍFICOS PARA NOTA DE CRÉDITO/DÉBITO =====
  if (invoice.documentType === 'nota_credito' || invoice.documentType === 'nota_debito') {
    // Documento Afectado (OBLIGATORIO según SUNAT)
    if (invoice.referencedDocumentId) {
      doc.setFont('helvetica', 'bold')
      doc.text('DOC. AFECTADO:', colRightX, rightY)
      doc.setFont('helvetica', 'normal')
      doc.text(invoice.referencedDocumentId, rightValueX, rightY)
      rightY += dataLineHeight
    }

    // Tipo de documento afectado
    const refDocType = invoice.referencedDocumentType === '01' ? 'FACTURA' :
                       invoice.referencedDocumentType === '03' ? 'BOLETA' : 'DOCUMENTO'
    doc.setFont('helvetica', 'bold')
    doc.text('TIPO DOC. REF:', colRightX, rightY)
    doc.setFont('helvetica', 'normal')
    doc.text(refDocType, rightValueX, rightY)
    rightY += dataLineHeight

    // Motivo (OBLIGATORIO según SUNAT - Catálogo 09)
    const motivoText = invoice.discrepancyCode ?
      `${invoice.discrepancyCode} - ${invoice.discrepancyReason || ''}` :
      (invoice.discrepancyReason || 'No especificado')
    doc.setFont('helvetica', 'bold')
    doc.text('MOTIVO:', colRightX, rightY)
    rightY += 10
    doc.setFont('helvetica', 'normal')
    // El motivo puede ser largo, dividirlo en líneas que quepan en la columna
    const motivoMaxWidth = colWidth - 5
    const motivoLines = doc.splitTextToSize(motivoText, motivoMaxWidth)
    // Mostrar hasta 3 líneas del motivo
    const linesToShow = motivoLines.slice(0, 3)
    linesToShow.forEach((line, index) => {
      doc.text(line, colRightX, rightY + (index * 10))
    })
    rightY += (linesToShow.length * 10) + 2

    // Moneda
    doc.setFont('helvetica', 'bold')
    doc.text('MONEDA:', colRightX, rightY)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.currency === 'USD' ? 'DÓLARES' : 'SOLES', rightValueX, rightY)
    rightY += dataLineHeight
  } else {
    // ===== CAMPOS PARA FACTURA/BOLETA/NOTA DE VENTA =====
    // Moneda
    doc.setFont('helvetica', 'bold')
    doc.text('MONEDA:', colRightX, rightY)
    doc.setFont('helvetica', 'normal')
    doc.text('SOLES', rightValueX, rightY)
    rightY += dataLineHeight

    // Forma de pago
    doc.setFont('helvetica', 'bold')
    doc.text('FORMA DE PAGO:', colRightX, rightY)
    doc.setFont('helvetica', 'normal')
    doc.text(paymentForm, rightValueX, rightY)
    rightY += dataLineHeight

    // Fecha de vencimiento (solo si es crédito)
    if (invoice.documentType === 'factura' && invoice.paymentType === 'credito' && invoice.paymentDueDate) {
      const dueDate = new Date(invoice.paymentDueDate + 'T00:00:00')
      const dueDateStr = dueDate.toLocaleDateString('es-PE')
      doc.setFont('helvetica', 'bold')
      doc.text('VENCIMIENTO:', colRightX, rightY)
      doc.setFont('helvetica', 'normal')
      doc.text(dueDateStr, rightValueX, rightY)
      rightY += dataLineHeight
    }

    // Tipo de operación
    doc.setFont('helvetica', 'bold')
    doc.text('OPERACIÓN:', colRightX, rightY)
    doc.setFont('helvetica', 'normal')
    doc.text('VENTA INTERNA', rightValueX, rightY)
    rightY += dataLineHeight
  }

  // N° de Guía (si existe)
  if (invoice.guideNumber) {
    doc.setFont('helvetica', 'bold')
    doc.text('N° GUÍA:', colRightX, rightY)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.guideNumber, rightValueX, rightY)
    rightY += dataLineHeight
  }

  // N° de O/C (si existe)
  if (invoice.purchaseOrderNumber) {
    doc.setFont('helvetica', 'bold')
    doc.text('N° O/C:', colRightX, rightY)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.purchaseOrderNumber, rightValueX, rightY)
    rightY += dataLineHeight
  }

  // N° de Pedido (si existe)
  if (invoice.orderNumber) {
    doc.setFont('helvetica', 'bold')
    doc.text('N° PEDIDO:', colRightX, rightY)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.orderNumber, rightValueX, rightY)
    rightY += dataLineHeight
  }

  // Las cuotas se mostrarán en la sección del QR
  currentY = Math.max(leftY, rightY) + 10

  // ========== PREPARAR DATOS ==========

  // Preparar datos de cuentas bancarias
  let bankAccountsArray = []
  if (companySettings?.bankAccountsList && Array.isArray(companySettings.bankAccountsList) && companySettings.bankAccountsList.length > 0) {
    bankAccountsArray = companySettings.bankAccountsList.map(acc => ({
      bank: acc.bank || '',
      currency: acc.currency === 'USD' ? 'DÓLARES' : 'SOLES',
      accountNumber: acc.accountNumber || '',
      cci: acc.cci || ''
    }))
  } else if (companySettings?.bankAccounts) {
    if (typeof companySettings.bankAccounts === 'string' && companySettings.bankAccounts.trim()) {
      bankAccountsArray = companySettings.bankAccounts.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split(':')
          if (parts.length >= 2) {
            return { bank: parts[0].trim(), currency: 'SOLES', accountNumber: parts.slice(1).join(':').trim(), cci: '' }
          }
          return { bank: line.trim(), currency: 'SOLES', accountNumber: '', cci: '' }
        })
    }
  }

  // ========== CALCULAR POSICIONES FIJAS ==========

  // Alturas de elementos del pie (fijo en la parte inferior)
  const FOOTER_TEXT_HEIGHT = 25
  const QR_BOX_HEIGHT = 75
  const BANK_ROWS = Math.max(bankAccountsArray.length, 2) // Mínimo 2 filas para bancos
  const BANK_TABLE_HEIGHT = bankAccountsArray.length > 0 ? (14 + BANK_ROWS * 13) : 0
  const HAS_DISCOUNT = (invoice.discount || 0) > 0
  const TOTALS_SECTION_HEIGHT = HAS_DISCOUNT ? 70 : 55 // 15px extra si hay descuento
  const SON_SECTION_HEIGHT = 22

  // Posición Y donde termina el área de productos (empieza el pie fijo)
  const FOOTER_AREA_START = PAGE_HEIGHT - MARGIN_BOTTOM - FOOTER_TEXT_HEIGHT - Math.max(QR_BOX_HEIGHT, BANK_TABLE_HEIGHT) - 10 - TOTALS_SECTION_HEIGHT - SON_SECTION_HEIGHT - 15

  // ========== 3. TABLA DE PRODUCTOS ==========

  const tableY = currentY
  const headerRowHeight = 18
  const productRowHeight = 15

  // Definir columnas: CANT. | U.M. | DESCRIPCIÓN | P. UNIT. | IMPORTE
  const colWidths = {
    cant: CONTENT_WIDTH * 0.08,
    um: CONTENT_WIDTH * 0.08,
    desc: CONTENT_WIDTH * 0.49,
    pu: CONTENT_WIDTH * 0.17,
    total: CONTENT_WIDTH * 0.18
  }

  let colX = MARGIN_LEFT
  const cols = {
    cant: colX,
    um: colX += colWidths.cant,
    desc: colX += colWidths.um,
    pu: colX += colWidths.desc,
    total: colX += colWidths.pu
  }

  // Solo mostrar las filas que tienen productos (sin filas vacías)
  const items = invoice.items || []
  const totalRows = items.length

  // Altura total de la tabla (solo filas con productos)
  const tableHeight = headerRowHeight + (totalRows * productRowHeight)

  // Encabezado de tabla con fondo de color
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(MARGIN_LEFT, tableY, CONTENT_WIDTH, headerRowHeight, 'F')

  // Textos del encabezado
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)

  const headerTextY = tableY + 12
  doc.text('CANT.', cols.cant + colWidths.cant / 2, headerTextY, { align: 'center' })
  doc.text('U.M.', cols.um + colWidths.um / 2, headerTextY, { align: 'center' })
  doc.text('DESCRIPCIÓN', cols.desc + 5, headerTextY)
  doc.text('P. UNIT.', cols.pu + colWidths.pu / 2, headerTextY, { align: 'center' })
  doc.text('IMPORTE', cols.total + colWidths.total / 2, headerTextY, { align: 'center' })

  // Dibujar filas de productos (solo las que tienen datos)
  let dataRowY = tableY + headerRowHeight
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)

  const unitLabels = {
    'UNIDAD': 'UND', 'CAJA': 'CAJA', 'KG': 'KG', 'LITRO': 'LT',
    'METRO': 'MT', 'HORA': 'HR', 'SERVICIO': 'SERV'
  }

  for (let i = 0; i < items.length; i++) {
    // Fondo alternado: filas pares gris, filas impares blanco
    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 248) // Gris muy suave
      doc.rect(MARGIN_LEFT, dataRowY, CONTENT_WIDTH, productRowHeight, 'F')
    }

    const item = items[i]
    const precioConIGV = item.unitPrice || item.price || 0
    const importeConIGV = item.quantity * precioConIGV
    const textY = dataRowY + 10

    doc.setTextColor(...BLACK)

    // Cantidad (solo número)
    const quantityText = Number.isInteger(item.quantity) ? item.quantity.toString() : item.quantity.toFixed(2)
    doc.text(quantityText, cols.cant + colWidths.cant / 2, textY, { align: 'center' })

    // Unidad de medida
    const unitCode = item.unit || 'UNIDAD'
    const unitText = unitLabels[unitCode] || unitCode
    doc.text(unitText, cols.um + colWidths.um / 2, textY, { align: 'center' })

    // Descripción con código de producto
    // Solo mostrar código si es un código "real" (no vacío, no CUSTOM, no placeholder)
    const itemName = item.name || item.description || ''
    const rawCode = item.code || item.productCode || ''
    const isValidCode = rawCode && rawCode.trim() !== '' && rawCode.toUpperCase() !== 'CUSTOM'
    const itemDesc = isValidCode ? `${rawCode} - ${itemName}` : itemName
    const descLines = doc.splitTextToSize(itemDesc, colWidths.desc - 10)
    doc.setFontSize(8)
    doc.text(descLines[0], cols.desc + 4, textY)

    // Precio unitario
    doc.setFontSize(8)
    doc.text(precioConIGV.toLocaleString('es-PE', { minimumFractionDigits: 2 }), cols.pu + colWidths.pu - 5, textY, { align: 'right' })

    // Importe
    doc.text(importeConIGV.toLocaleString('es-PE', { minimumFractionDigits: 2 }), cols.total + colWidths.total - 5, textY, { align: 'right' })

    dataRowY += productRowHeight
  }

  // ========== 4. PIE DE PÁGINA FIJO ==========

  let footerY = tableY + tableHeight + 8

  // ========== SON: (MONTO EN LETRAS) ==========
  const montoEnLetras = numeroALetras(invoice.total || 0) + ' SOLES'

  // Recuadro para "SON:"
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN_LEFT, footerY, CONTENT_WIDTH, SON_SECTION_HEIGHT)

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('SON:', MARGIN_LEFT + 5, footerY + 14)
  doc.setFont('helvetica', 'normal')
  const letrasLines = doc.splitTextToSize(montoEnLetras, CONTENT_WIDTH - 35)
  doc.text(letrasLines[0], MARGIN_LEFT + 28, footerY + 14)

  footerY += SON_SECTION_HEIGHT + 5

  // ========== FILA: BANCOS (izq) + TOTALES (der) ==========

  const totalsWidth = 160
  const totalsX = MARGIN_LEFT + CONTENT_WIDTH - totalsWidth
  const bankSectionWidth = totalsX - MARGIN_LEFT - 10

  const igvExempt = companySettings?.emissionConfig?.taxConfig?.igvExempt || companySettings?.taxConfig?.igvExempt || false
  const igvRate = companySettings?.emissionConfig?.taxConfig?.igvRate ?? companySettings?.taxConfig?.igvRate ?? 18
  const labelGravada = igvExempt ? 'OP. EXONERADA' : 'OP. GRAVADA'

  // --- TOTALES (derecha) con borde ---
  const totalsRowHeight = 15
  const totalsStartY = footerY
  const totalsSectionRows = HAS_DISCOUNT ? 4 : 3

  // Borde exterior de totales
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(totalsX, totalsStartY, totalsWidth, totalsRowHeight * totalsSectionRows + 6)

  // Fila 1: OP. GRAVADA
  doc.setFillColor(250, 250, 250)
  doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight, 'F')
  doc.setDrawColor(200, 200, 200)
  doc.line(totalsX, footerY + totalsRowHeight, totalsX + totalsWidth, footerY + totalsRowHeight)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  doc.text(labelGravada, totalsX + 5, footerY + 10)
  doc.text('S/ ' + (invoice.subtotal || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 10, { align: 'right' })
  footerY += totalsRowHeight

  // Fila 2: DESCUENTO (solo si hay descuento)
  if (HAS_DISCOUNT) {
    doc.setFillColor(255, 245, 245)
    doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.line(totalsX, footerY + totalsRowHeight, totalsX + totalsWidth, footerY + totalsRowHeight)
    doc.setTextColor(180, 0, 0)
    doc.text('DESCUENTO', totalsX + 5, footerY + 10)
    doc.text('- S/ ' + (invoice.discount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 10, { align: 'right' })
    doc.setTextColor(...BLACK)
    footerY += totalsRowHeight
  }

  // Fila: IGV
  doc.setFillColor(255, 255, 255)
  doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight, 'F')
  doc.setDrawColor(200, 200, 200)
  doc.line(totalsX, footerY + totalsRowHeight, totalsX + totalsWidth, footerY + totalsRowHeight)
  doc.text(`IGV (${igvRate}%)`, totalsX + 5, footerY + 10)
  doc.text('S/ ' + (invoice.igv || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 10, { align: 'right' })
  footerY += totalsRowHeight

  // Fila: TOTAL (fondo oscuro)
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight + 6, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('TOTAL', totalsX + 5, footerY + 14)
  doc.setFontSize(11)
  doc.text('S/ ' + (invoice.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 14, { align: 'right' })

  // --- CUENTAS BANCARIAS (izquierda) con borde ---
  doc.setTextColor(...BLACK)

  if (bankAccountsArray.length > 0) {
    const bankTableX = MARGIN_LEFT
    const COL_BANCO = 60
    const COL_MONEDA = 45
    const COL_CUENTA = 90
    const COL_CCI = bankSectionWidth - COL_BANCO - COL_MONEDA - COL_CUENTA
    const bankTableWidth = bankSectionWidth

    const colStart = {
      banco: bankTableX,
      moneda: bankTableX + COL_BANCO,
      cuenta: bankTableX + COL_BANCO + COL_MONEDA,
      cci: bankTableX + COL_BANCO + COL_MONEDA + COL_CUENTA
    }

    const bankRowHeight = 12
    const bankHeaderHeight = 13
    let bankY = totalsStartY

    // Borde exterior de la tabla de bancos
    const bankTotalHeight = bankHeaderHeight + (bankAccountsArray.length * bankRowHeight)
    doc.setDrawColor(...BLACK)
    doc.setLineWidth(0.5)
    doc.rect(bankTableX, bankY, bankTableWidth, bankTotalHeight)

    // Encabezado
    doc.setFillColor(...ACCENT_COLOR)
    doc.rect(bankTableX, bankY, bankTableWidth, bankHeaderHeight, 'F')

    // Líneas verticales
    doc.setDrawColor(...BLACK)
    doc.line(colStart.moneda, bankY, colStart.moneda, bankY + bankTotalHeight)
    doc.line(colStart.cuenta, bankY, colStart.cuenta, bankY + bankTotalHeight)
    doc.line(colStart.cci, bankY, colStart.cci, bankY + bankTotalHeight)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('BANCO', colStart.banco + 3, bankY + 9)
    doc.text('MONEDA', colStart.moneda + 3, bankY + 9)
    doc.text('CTA. CTE.', colStart.cuenta + 3, bankY + 9)
    doc.text('CCI', colStart.cci + 3, bankY + 9)
    bankY += bankHeaderHeight

    // Filas de datos
    doc.setTextColor(...BLACK)
    doc.setFont('helvetica', 'normal')

    bankAccountsArray.forEach((account, index) => {
      // Línea horizontal
      if (index > 0) {
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.3)
        doc.line(bankTableX, bankY, bankTableX + bankTableWidth, bankY)
      }

      doc.setFontSize(8)
      doc.text(String(account.bank || ''), colStart.banco + 3, bankY + 8)
      doc.text(String(account.currency || ''), colStart.moneda + 3, bankY + 8)
      doc.text(String(account.accountNumber || ''), colStart.cuenta + 3, bankY + 8)
      doc.text(String(account.cci || '-'), colStart.cci + 3, bankY + 8)
      bankY += bankRowHeight
    })
  }

  // ========== QR Y VALIDACIÓN SUNAT ==========

  // Ajustar posición Y después de los totales (4 filas si hay descuento, 3 si no)
  footerY = totalsStartY + totalsRowHeight * totalsSectionRows + 15

  // Verificar si hay cuotas para mostrar
  const hasCuotas = invoice.documentType === 'factura' &&
                    invoice.paymentType === 'credito' &&
                    invoice.paymentInstallments &&
                    invoice.paymentInstallments.length > 0

  if (invoice.documentType !== 'nota_venta') {
    // Recuadro para QR y texto de validación
    const qrBoxY = footerY
    const qrSize = 55
    const qrBoxWidth = CONTENT_WIDTH
    // Aumentar altura si hay cuotas
    const qrBoxHeight = hasCuotas ? Math.max(QR_BOX_HEIGHT, 20 + invoice.paymentInstallments.length * 11) : QR_BOX_HEIGHT

    doc.setDrawColor(...BLACK)
    doc.setLineWidth(0.5)
    doc.rect(MARGIN_LEFT, qrBoxY, qrBoxWidth, qrBoxHeight)

    // QR
    const qrX = MARGIN_LEFT + 5
    const qrY = qrBoxY + (qrBoxHeight - qrSize) / 2

    try {
      const qrImage = await generateSunatQR(invoice, companySettings)
      if (qrImage) {
        doc.addImage(qrImage, 'PNG', qrX, qrY, qrSize, qrSize)
      }
    } catch (error) {
      console.error('Error generando QR:', error)
    }

    // Texto al lado del QR (columna central)
    const textX = qrX + qrSize + 10
    const textWidth = 180 // Ancho para el texto de validación
    let textY = qrBoxY + 15

    if (invoice.sunatHash) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...BLACK)
      doc.text(invoice.sunatHash, textX, textY)
      textY += 12
    }

    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    const docTypeText = invoice.documentType === 'factura' ? 'FACTURA' :
                        invoice.documentType === 'nota_credito' ? 'NOTA DE CRÉDITO' :
                        invoice.documentType === 'nota_debito' ? 'NOTA DE DÉBITO' : 'BOLETA DE VENTA'
    doc.text(`Representación Impresa de la ${docTypeText}`, textX, textY)
    textY += 9
    doc.text('ELECTRÓNICA.', textX, textY)
    textY += 9
    doc.text('Consultar validez en: sunat.gob.pe', textX, textY)

    // CUOTAS en el lado derecho del recuadro
    if (hasCuotas) {
      const cuotasX = MARGIN_LEFT + CONTENT_WIDTH - 150 // Posición X para cuotas (derecha)
      let cuotasY = qrBoxY + 12

      // Título
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...BLACK)
      doc.text('FORMA DE PAGO:', cuotasX, cuotasY)
      cuotasY += 10

      // Cada cuota
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      invoice.paymentInstallments.forEach((cuota, index) => {
        const cuotaNum = cuota.number || index + 1
        const cuotaAmount = parseFloat(cuota.amount || 0).toFixed(2)
        let cuotaDueDate = '-'
        if (cuota.dueDate) {
          const [year, month, day] = cuota.dueDate.split('-')
          cuotaDueDate = `${day}/${month}/${year}`
        }

        doc.text(`Cuota ${cuotaNum}:`, cuotasX, cuotasY)
        doc.text(`S/ ${cuotaAmount}`, cuotasX + 35, cuotasY)
        doc.text(`Vence: ${cuotaDueDate}`, cuotasX + 75, cuotasY)
        cuotasY += 10
      })
    }

    footerY = qrBoxY + qrBoxHeight + 5
  } else {
    doc.setFontSize(8)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text('DOCUMENTO NO VÁLIDO PARA EFECTOS TRIBUTARIOS', MARGIN_LEFT, footerY + 10)
    footerY += 20
  }

  // ========== FOOTER FINAL ==========

  doc.setDrawColor(...MEDIUM_GRAY)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, PAGE_HEIGHT - MARGIN_BOTTOM - 12, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - MARGIN_BOTTOM - 12)

  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  // Usar nombre del reseller si hay branding de marca blanca, sino usar Cobrify
  const footerCompanyName = branding?.companyName || 'Cobrify'
  doc.text(`Documento generado en ${footerCompanyName} - Sistema de Facturación Electrónica`, MARGIN_LEFT + CONTENT_WIDTH / 2, PAGE_HEIGHT - MARGIN_BOTTOM - 3, { align: 'center' })

  // ========== GENERAR PDF ==========

  if (download) {
    let docTypeName = 'Boleta'
    if (invoice.documentType === 'factura') {
      docTypeName = 'Factura'
    } else if (invoice.documentType === 'nota_venta') {
      docTypeName = 'Nota_de_Venta'
    } else if (invoice.documentType === 'nota_credito') {
      docTypeName = 'Nota_de_Credito'
    } else if (invoice.documentType === 'nota_debito') {
      docTypeName = 'Nota_de_Debito'
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

        try {
          await Share.share({
            title: fileName,
            text: `Comprobante: ${fileName}`,
            url: result.uri,
            dialogTitle: 'Compartir PDF'
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
export const getInvoicePDFBlob = async (invoice, companySettings, branding = null, branches = []) => {
  const doc = await generateInvoicePDF(invoice, companySettings, false, branding, branches)
  return doc.output('blob')
}

/**
 * Abre el PDF en una nueva pestaña para vista previa (o comparte en móvil)
 */
export const previewInvoicePDF = async (invoice, companySettings, branding = null, branches = []) => {
  const doc = await generateInvoicePDF(invoice, companySettings, false, branding, branches)
  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    try {
      // En móvil, guardar el PDF y abrirlo con Share para vista previa
      const pdfBase64 = doc.output('datauristring').split(',')[1]

      const fileName = `Comprobante_${invoice.number?.replace(/\//g, '-') || 'comprobante'}.pdf`

      // Guardar directamente en Documents (mejor compatibilidad con Share)
      const result = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: Directory.Documents,
        recursive: true
      })

      console.log('PDF para vista previa guardado en:', result.uri)

      // Abrir con el visor de PDF del sistema
      await Share.share({
        title: `Comprobante ${invoice.number || ''}`,
        url: result.uri,
        dialogTitle: 'Ver comprobante'
      })

      return result.uri
    } catch (error) {
      console.error('Error al generar vista previa en móvil:', error)
      throw error
    }
  } else {
    // En web, abrir en nueva pestaña
    const blobUrl = doc.output('bloburl')
    window.open(blobUrl, '_blank')
    return blobUrl
  }
}
