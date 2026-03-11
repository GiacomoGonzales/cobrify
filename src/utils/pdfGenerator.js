import jsPDF from 'jspdf'
import { formatDate } from '@/lib/utils'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
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
 * Valida si una URL es válida para hacer peticiones HTTP
 */
const isValidHttpUrl = (string) => {
  if (!string || typeof string !== 'string' || string.trim() === '') return false
  try {
    const url = new URL(string)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Pre-carga el logo en caché para que esté disponible instantáneamente
 * Llamar esta función cuando se carga la configuración de la empresa
 */
export const preloadLogo = async (logoUrl) => {
  if (!logoUrl || !isValidHttpUrl(logoUrl)) return null

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

        // Validar URL antes de llamar a CapacitorHttp (evita crash en iOS)
        if (!isValidHttpUrl(downloadUrl)) {
          console.warn('⚠️ URL inválida para CapacitorHttp:', downloadUrl)
          throw new Error('URL inválida')
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
    const rawClientDocType = invoice.customer?.documentType
    const clientDocType = (rawClientDocType === 'RUC' || rawClientDocType === '6') ? '6' :
                         (rawClientDocType === 'DNI' || rawClientDocType === '1') ? '1' : '0'
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
  const WHITE = [255, 255, 255]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [120, 120, 120]
  const LIGHT_GRAY = [240, 240, 240]
  const TABLE_HEADER_BG = [245, 245, 245]
  const BORDER_COLOR = [0, 0, 0]

  // Color de acento dinámico (configurado por el usuario)
  const ACCENT_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#464646')

  // Modo espaciado amplio (configurado por el usuario en Preferencias)
  const spacious = companySettings?.pdfSpacious === true

  // Márgenes y dimensiones - A4: 595pt x 842pt
  const MARGIN_LEFT = 20
  const MARGIN_RIGHT = 20
  const MARGIN_TOP = 20
  const MARGIN_BOTTOM = 15
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  let currentY = MARGIN_TOP

  // ========== 1. ENCABEZADO - 3 COLUMNAS CON LOGO DINÁMICO ==========

  const headerHeight = 100
  const defaultLogoWidth = 100  // Ancho por defecto para logo
  const docColumnWidth = 145   // Columna derecha para recuadro factura

  // Posiciones X
  const logoX = MARGIN_LEFT
  const docBoxX = PAGE_WIDTH - MARGIN_RIGHT - docColumnWidth
  let actualLogoWidth = defaultLogoWidth // Ancho real del logo (se actualiza dinámicamente)

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
        const maxLogoHeight = headerHeight - 15
        // Ancho máximo: hasta donde empieza el recuadro del documento menos margen
        const maxAllowedWidth = CONTENT_WIDTH - docColumnWidth - 30

        let logoWidth, logoHeight

        if (aspectRatio >= 3) {
          // Logo EXTREMADAMENTE horizontal (3:1 o más): permitir más ancho
          logoHeight = 50
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > maxAllowedWidth) {
            logoWidth = maxAllowedWidth
            logoHeight = logoWidth / aspectRatio
          }
          if (logoHeight < 40) {
            logoHeight = 40
            logoWidth = logoHeight * aspectRatio
          }
        } else if (aspectRatio >= 2.5) {
          // Logo MUY horizontal (2.5:1 a 3:1)
          logoHeight = 55
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > maxAllowedWidth) {
            logoWidth = maxAllowedWidth
            logoHeight = logoWidth / aspectRatio
          }
          if (logoHeight < 45) {
            logoHeight = 45
            logoWidth = logoHeight * aspectRatio
          }
        } else if (aspectRatio >= 2) {
          // Logo muy horizontal (2:1 a 2.5:1)
          logoHeight = maxLogoHeight * 0.75
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > maxAllowedWidth * 0.6) {
            logoWidth = maxAllowedWidth * 0.6
            logoHeight = logoWidth / aspectRatio
          }
        } else if (aspectRatio >= 1.3) {
          // Logo horizontal moderado (1.3:1 a 2:1)
          logoHeight = maxLogoHeight * 0.85
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > maxAllowedWidth * 0.5) {
            logoWidth = maxAllowedWidth * 0.5
            logoHeight = logoWidth / aspectRatio
          }
        } else if (aspectRatio >= 1) {
          // Logo cuadrado o casi cuadrado (20% más grande)
          logoHeight = maxLogoHeight
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > defaultLogoWidth + 32) {
            logoWidth = defaultLogoWidth + 32
            logoHeight = logoWidth / aspectRatio
          }
        } else {
          // Logo vertical: priorizar altura máxima
          logoHeight = maxLogoHeight
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > defaultLogoWidth) {
            logoWidth = defaultLogoWidth
            logoHeight = logoWidth / aspectRatio
          }
        }

        actualLogoWidth = logoWidth // Guardar el ancho real para posicionar el texto
        const logoYPos = currentY + (headerHeight - logoHeight) / 2 - 10
        doc.addImage(imgData, format, logoX, logoYPos, logoWidth, logoHeight, undefined, 'FAST')
      }
    } catch (error) {
      console.warn('⚠️ No se pudo cargar el logo:', error.message)
    }
  }

  // Calcular columna de info dinámicamente basada en el logo real
  const infoColumnWidth = CONTENT_WIDTH - actualLogoWidth - docColumnWidth - 20
  const infoCenterX = MARGIN_LEFT + actualLogoWidth + 10 + (infoColumnWidth / 2)

  // ===== COLUMNA 2: DATOS DE LA EMPRESA (centro) =====
  // Recopilar todos los datos disponibles
  const companyName = (companySettings?.name || companySettings?.businessName || 'EMPRESA SAC').toUpperCase()
  const businessName = companySettings?.businessName ? companySettings.businessName.toUpperCase() : ''
  const showBusinessName = businessName && businessName !== companyName

  // Preparar lista de sucursales/direcciones para mostrar
  // Cada entrada tiene address y phone por separado (se muestran en líneas independientes)
  let branchLocations = []
  const activeBranches = branches.filter(b => b.isActive !== false)

  if (activeBranches.length > 0) {
    // Agregar dirección principal (datos de la empresa)
    if (companySettings?.address) {
      let mainAddress = companySettings.address
      if (companySettings?.district || companySettings?.province || companySettings?.department) {
        const locationParts = [companySettings?.district, companySettings?.province, companySettings?.department].filter(Boolean)
        if (locationParts.length > 0) mainAddress += ' - ' + locationParts.join(', ')
      }
      branchLocations.push({
        address: mainAddress.toUpperCase(),
        phone: companySettings?.phone || ''
      })
    }
    // Agregar sucursales adicionales
    activeBranches.forEach(branch => {
      if (branch.address || branch.phone) {
        let branchAddress = branch.address || ''
        if (branch.department || branch.province || branch.district) {
          const deptName = DEPARTAMENTOS.find(d => d.code === branch.department)?.name || branch.department || ''
          const provName = (PROVINCIAS[branch.department] || []).find(p => p.code === branch.province)?.name || branch.province || ''
          const distName = (DISTRITOS[`${branch.department}${branch.province}`] || []).find(d => d.code === branch.district)?.name || branch.district || ''
          const locationParts = [distName, provName, deptName].filter(Boolean)
          if (locationParts.length > 0) branchAddress += ' - ' + locationParts.join(', ')
        }
        branchLocations.push({
          address: branchAddress.toUpperCase(),
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
      branchLocations.push({ address: fullAddress.toUpperCase(), phone })
    }
  }

  const email = companySettings?.email || ''
  const website = companySettings?.website || ''

  // Calcular contenido y altura para centrar verticalmente
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  const nameLines = doc.splitTextToSize(companyName, infoColumnWidth - 10)

  // Contar líneas totales para centrar (pre-calcular splits de direcciones)
  const maxWidth = infoColumnWidth - 10
  let totalLines = nameLines.length
  if (showBusinessName) totalLines += 1
  // Líneas para sucursales: primero todas las direcciones, luego todos los teléfonos
  branchLocations.forEach(loc => {
    if (loc.address) {
      const addrLine = 'DIRECCIÓN: ' + loc.address
      const addrLines = doc.splitTextToSize(addrLine, maxWidth)
      totalLines += Math.min(addrLines.length, 3)
    }
  })
  branchLocations.forEach(loc => {
    if (loc.phone) totalLines += 1
  })
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

  // Razón social si es diferente (permitir múltiples líneas si es muy larga)
  if (showBusinessName) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    const businessNameLines = doc.splitTextToSize(businessName, infoColumnWidth - 10)
    const businessLinesToShow = businessNameLines.slice(0, 2) // Máximo 2 líneas
    businessLinesToShow.forEach((line, index) => {
      doc.text(line, infoCenterX, infoY + (index * 9), { align: 'center' })
    })
    infoY += businessLinesToShow.length * 9 + 1
  }

  // Mostrar primero TODAS las direcciones, luego TODOS los teléfonos (todo mayúscula)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  branchLocations.forEach(loc => {
    if (loc.address) {
      const addrLine = 'DIRECCIÓN: ' + loc.address
      const addressLines = doc.splitTextToSize(addrLine, maxWidth)
      const linesToShow = addressLines.slice(0, 3)
      linesToShow.forEach((line) => {
        doc.text(line, infoCenterX, infoY, { align: 'center' })
        infoY += 9
      })
    }
  })
  branchLocations.forEach(loc => {
    if (loc.phone) {
      doc.text('TELF: ' + loc.phone.toUpperCase(), infoCenterX, infoY, { align: 'center' })
      infoY += 9
    }
  })

  // Email
  if (email) {
    doc.text(`EMAIL: ${email.toUpperCase()}`, infoCenterX, infoY, { align: 'center' })
    infoY += 9
  }

  // Página web
  if (website) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK_GRAY)
    doc.text(website.toUpperCase(), infoCenterX, infoY, { align: 'center' })
    infoY += 9
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

  // Detectar si debe ocultar RUC e IGV en notas de venta
  const isNotaVenta = invoice.documentType === 'nota_venta'
  const hideRucIgvInNotaVenta = companySettings?.hideRucIgvInNotaVenta === true
  const hideOnlyIgvInNotaVenta = companySettings?.hideOnlyIgvInNotaVenta === true
  const shouldHideRuc = isNotaVenta && hideRucIgvInNotaVenta
  const shouldHideIgv = isNotaVenta && (hideRucIgvInNotaVenta || hideOnlyIgvInNotaVenta)

  // RUC (texto blanco sobre fondo de color) - Ocultar en notas de venta si está configurado
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  if (!shouldHideRuc) {
    doc.text(`R.U.C. ${companySettings?.ruc || ''}`, docBoxX + docColumnWidth / 2, docBoxY + 16, { align: 'center' })
  }
  doc.setTextColor(...BLACK) // Restaurar color negro para el resto

  // Tipo de documento
  let documentLine1 = 'BOLETA DE VENTA'
  let documentLine2 = 'ELECTRÓNICA'
  if (invoice.documentType === 'factura') {
    documentLine1 = 'FACTURA'
    documentLine2 = 'ELECTRÓNICA'
  } else if (isNotaVenta) {
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

  currentY += headerHeight + 5

  // ========== ESLOGAN (centrado debajo del encabezado) ==========
  if (companySettings?.companySlogan) {
    const slogan = companySettings.companySlogan.toUpperCase()
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    const sloganMaxWidth = CONTENT_WIDTH - 20
    const sloganLines = doc.splitTextToSize(slogan, sloganMaxWidth)
    const sloganLinesToShow = sloganLines.slice(0, 2)
    const sloganCenterX = MARGIN_LEFT + CONTENT_WIDTH / 2
    // Si alguna línea del slogan es tan ancha que chocaría con el recuadro del comprobante,
    // empujar el slogan debajo del recuadro completo
    const spaceLeftOfBox = docBoxX - MARGIN_LEFT - 10
    const sloganCollidesWithBox = sloganLinesToShow.some(line => doc.getTextWidth(line) > spaceLeftOfBox)
    if (sloganCollidesWithBox) {
      const boxBottomY = MARGIN_TOP + headerHeight + 13
      if (currentY < boxBottomY) currentY = boxBottomY
    }
    sloganLinesToShow.forEach((line) => {
      doc.text(line, sloganCenterX, currentY, { align: 'center' })
      currentY += 14
    })
    currentY += 5
  } else {
    currentY += (spacious ? 20 : 10)
  }

  // ========== 2. DATOS DEL CLIENTE (DOS COLUMNAS) ==========

  doc.setFontSize(spacious ? 10 : 9)
  doc.setTextColor(...BLACK)

  // Configuración de dos columnas
  const colLeftX = MARGIN_LEFT
  const colRightX = MARGIN_LEFT + CONTENT_WIDTH * 0.5 + 10
  const colWidth = CONTENT_WIDTH * 0.5 - 10
  const dataLineHeight = spacious ? 15 : 12

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

  const rawDocType = invoice.customer?.documentType
  const docType = (rawDocType === 'RUC' || rawDocType === '6') ? 'RUC' :
                  (rawDocType === 'DNI' || rawDocType === '1') ? 'DNI' : 'DOC'
  const docNumber = invoice.customer?.documentNumber && invoice.customer.documentNumber !== '00000000'
                    ? invoice.customer.documentNumber : '-'
  const customerAddress = invoice.customer?.address || '-'

  const startY = currentY

  // ===== COLUMNA IZQUIERDA (Datos del cliente) =====
  let leftY = startY

  // Razón Social (permitir hasta 2 líneas si es muy larga)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('RAZÓN SOCIAL:', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const customerName = invoice.customer?.name || 'CLIENTE GENERAL'
  // Ancho máximo: desde donde termina la etiqueta hasta donde empieza la columna derecha
  const customerNameMaxWidth = colRightX - leftValueX - 15
  const customerNameLines = doc.splitTextToSize(customerName, customerNameMaxWidth)

  // Mostrar hasta 2 líneas de la razón social
  doc.text(customerNameLines[0], leftValueX, leftY)
  leftY += 10
  if (customerNameLines.length > 1 && customerNameLines[1]) {
    // Segunda línea debajo, alineada con el valor
    doc.text(customerNameLines[1], leftValueX, leftY)
    leftY += dataLineHeight - 2
  } else {
    leftY += 2
  }

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

  // Alumno y Horario (solo si está habilitado en configuración)
  if (companySettings?.posCustomFields?.showStudentField) {
    if (invoice.customer?.studentName) {
      doc.setFont('helvetica', 'bold')
      doc.text('ALUMNO:', colLeftX, leftY)
      doc.setFont('helvetica', 'normal')
      doc.text(invoice.customer.studentName, leftValueX, leftY)
      leftY += dataLineHeight
    }

    if (invoice.customer?.studentSchedule) {
      doc.setFont('helvetica', 'bold')
      doc.text('HORARIO:', colLeftX, leftY)
      doc.setFont('helvetica', 'normal')
      doc.text(invoice.customer.studentSchedule, leftValueX, leftY)
      leftY += dataLineHeight
    }
  }

  // Placa de Vehículo (solo si está habilitado en configuración)
  if (companySettings?.posCustomFields?.showVehiclePlateField && invoice.customer?.vehiclePlate) {
    doc.setFont('helvetica', 'bold')
    doc.text('PLACA:', colLeftX, leftY)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.customer.vehiclePlate.toUpperCase(), leftValueX, leftY)
    leftY += dataLineHeight
  }

  // Modelo de Vehículo
  if (companySettings?.posCustomFields?.showVehicleModelField && invoice.customer?.vehicleModel) {
    doc.setFont('helvetica', 'bold')
    doc.text('MODELO:', colLeftX, leftY)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.customer.vehicleModel, leftValueX, leftY)
    leftY += dataLineHeight
  }

  // Año de Vehículo
  if (companySettings?.posCustomFields?.showVehicleYearField && invoice.customer?.vehicleYear) {
    doc.setFont('helvetica', 'bold')
    doc.text('AÑO:', colLeftX, leftY)
    doc.setFont('helvetica', 'normal')
    doc.text(invoice.customer.vehicleYear, leftValueX, leftY)
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
  currentY = Math.max(leftY, rightY) + (spacious ? 20 : 10)

  // ========== PREPARAR DATOS ==========

  // Preparar datos de cuentas bancarias
  let bankAccountsArray = []
  if (companySettings?.bankAccountsList && Array.isArray(companySettings.bankAccountsList) && companySettings.bankAccountsList.length > 0) {
    bankAccountsArray = companySettings.bankAccountsList.map(acc => ({
      bank: acc.bank || '',
      accountType: acc.accountType || 'corriente',
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
  const HAS_DISCOUNT = (invoice.discount || 0) > 0
  const HAS_RECARGO_CONSUMO = (invoice.recargoConsumo || 0) > 0
  const HAS_DETRACTION = invoice.hasDetraction && invoice.detractionAmount > 0
  // Altura de la sección de información de detracción (leyenda SPOT + datos)
  const DETRACTION_INFO_HEIGHT = HAS_DETRACTION ? 70 : 0 // 22 (SPOT) + 4 filas * 12
  const BANK_TABLE_HEIGHT = bankAccountsArray.length > 0 ? (14 + BANK_ROWS * 13) + DETRACTION_INFO_HEIGHT : DETRACTION_INFO_HEIGHT
  // Altura base 55, +15 si hay descuento, +15 si hay recargo consumo, +36 si hay detracción (2 filas: detracción + neto a pagar)
  const TOTALS_SECTION_HEIGHT = 55 + (HAS_DISCOUNT ? 15 : 0) + (HAS_RECARGO_CONSUMO ? 15 : 0) + (HAS_DETRACTION ? 36 : 0)
  const SON_SECTION_HEIGHT = spacious ? 28 : 22

  // Posición Y donde termina el área de productos (empieza el pie fijo)
  const FOOTER_AREA_START = PAGE_HEIGHT - MARGIN_BOTTOM - FOOTER_TEXT_HEIGHT - Math.max(QR_BOX_HEIGHT, BANK_TABLE_HEIGHT) - 10 - TOTALS_SECTION_HEIGHT - SON_SECTION_HEIGHT - (spacious ? 22 : 15)

  // ========== 3. TABLA DE PRODUCTOS ==========

  const tableY = currentY
  const headerRowHeight = spacious ? 22 : 18
  const minProductRowHeight = spacious ? 22 : 15
  const lineHeight = spacious ? 10 : 9 // Altura por línea de texto

  // Solo mostrar las filas que tienen productos (sin filas vacías)
  const items = invoice.items || []

  // Verificar si algún item tiene descuento para mostrar la columna DCTO
  const hasAnyItemDiscount = items.some(item => (item.itemDiscount || 0) > 0)

  // Detectar modo farmacia para mostrar columna LABORATORIO
  const isPharmacy = companySettings?.businessMode === 'pharmacy'

  // Definir columnas dinámicamente según si hay descuentos y modo farmacia
  // Farmacia con descuento: CANT(7%) | U.M.(6%) | DESCRIPCIÓN(22%) | LAB(12%) | MARCA(10%) | P.UNIT.(12%) | DCTO(12%) | IMPORTE(19%)
  // Farmacia sin descuento: CANT(7%) | U.M.(6%) | DESCRIPCIÓN(27%) | LAB(14%) | MARCA(11%) | P.UNIT.(16%) | IMPORTE(19%)
  // Normal con descuento: CANT. | U.M. | DESCRIPCIÓN | P. UNIT. | DCTO. | IMPORTE
  // Normal sin descuento: CANT. | U.M. | DESCRIPCIÓN | P. UNIT. | IMPORTE
  const colWidths = hasAnyItemDiscount ? {
    cant: CONTENT_WIDTH * 0.07,
    um: CONTENT_WIDTH * 0.06,
    desc: isPharmacy ? CONTENT_WIDTH * 0.22 : CONTENT_WIDTH * 0.40,
    lab: isPharmacy ? CONTENT_WIDTH * 0.12 : 0,
    marca: isPharmacy ? CONTENT_WIDTH * 0.10 : 0,
    pu: isPharmacy ? CONTENT_WIDTH * 0.12 : CONTENT_WIDTH * 0.15,
    dcto: CONTENT_WIDTH * 0.12,
    total: CONTENT_WIDTH * 0.19
  } : {
    cant: CONTENT_WIDTH * 0.07,
    um: CONTENT_WIDTH * 0.06,
    desc: isPharmacy ? CONTENT_WIDTH * 0.27 : CONTENT_WIDTH * 0.49,
    lab: isPharmacy ? CONTENT_WIDTH * 0.14 : 0,
    marca: isPharmacy ? CONTENT_WIDTH * 0.11 : 0,
    pu: isPharmacy ? CONTENT_WIDTH * 0.16 : CONTENT_WIDTH * 0.17,
    dcto: 0,
    total: CONTENT_WIDTH * 0.19
  }

  let colX = MARGIN_LEFT
  const cols = hasAnyItemDiscount ? {
    cant: colX,
    um: colX += colWidths.cant,
    desc: colX += colWidths.um,
    lab: colX += colWidths.desc,
    marca: colX += colWidths.lab,
    pu: colX += colWidths.marca,
    dcto: colX += colWidths.pu,
    total: colX += colWidths.dcto
  } : {
    cant: colX,
    um: colX += colWidths.cant,
    desc: colX += colWidths.um,
    lab: colX += colWidths.desc,
    marca: colX += colWidths.lab,
    pu: colX += colWidths.marca,
    dcto: 0,
    total: colX += colWidths.pu
  }

  // Función para calcular altura dinámica de cada item
  const calculateItemHeight = (item) => {
    // Usar 'name' como nombre principal, o 'description' si 'name' no existe (compatibilidad con datos antiguos)
    const itemName = item.name || item.description || ''
    const rawCode = item.code || item.productCode || ''
    const isValidCode = rawCode && rawCode.trim() !== '' && rawCode.toUpperCase() !== 'CUSTOM'
    let itemDesc = isValidCode ? `${rawCode} - ${itemName}` : itemName
    // Concatenar atributos de variante si existen (talla, color, etc.)
    if (item.isVariant && item.variantAttributes) {
      const attrs = Object.entries(item.variantAttributes)
        .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
        .join(', ')
      if (attrs) itemDesc += ` (${attrs})`
    }
    // Concatenar observaciones adicionales si existen (IMEI, placa, serie, etc.)
    if (item.observations) {
      itemDesc += ` - ${item.observations}`
    }
    doc.setFontSize(8)
    // Usar el ancho de descripción correcto según si hay descuentos
    const descWidth = hasAnyItemDiscount ? colWidths.desc - 6 : colWidths.desc - 10
    const descLines = doc.splitTextToSize(itemDesc, descWidth)

    // Líneas de detalle farmacéutico (solo farmacia)
    let pharmaLines = []
    if (isPharmacy) {
      const parts = []
      if (item.presentation) parts.push(`Pres: ${item.presentation}`)
      if (item.concentration) parts.push(`Conc: ${item.concentration}`)
      if (item.genericName) parts.push(`DCI: ${item.genericName}`)
      if (item.activeIngredient) parts.push(`P.A: ${item.activeIngredient}`)
      if (item.batchNumber) {
        let batchStr = `Lote: ${item.batchNumber}`
        if (item.batchExpiryDate) {
          const d = item.batchExpiryDate.toDate ? item.batchExpiryDate.toDate() : new Date(item.batchExpiryDate)
          if (!isNaN(d.getTime())) {
            batchStr += ` (Venc: ${d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })})`
          }
        }
        parts.push(batchStr)
      }
      if (item.sanitaryRegistry) parts.push(`R.S: ${item.sanitaryRegistry}`)
      if (parts.length > 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        pharmaLines = doc.splitTextToSize(parts.join('  |  '), descWidth)
      }
    }

    const totalLines = descLines.length + pharmaLines.length
    const baseHeight = totalLines * lineHeight + (spacious ? 10 : 6)
    const calculatedHeight = Math.max(minProductRowHeight, baseHeight)
    return { height: calculatedHeight, descLines, pharmaLines }
  }

  // Calcular alturas de todos los items
  const itemHeights = items.map(item => calculateItemHeight(item))
  const totalItemsHeight = itemHeights.reduce((sum, ih) => sum + ih.height, 0)

  // Altura total de la tabla (dinámica según contenido)
  const tableHeight = headerRowHeight + totalItemsHeight

  // Encabezado de tabla con fondo de color
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(MARGIN_LEFT, tableY, CONTENT_WIDTH, headerRowHeight, 'F')

  // Textos del encabezado
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)

  const headerTextY = tableY + (spacious ? 15 : 12)
  doc.text('CANT.', cols.cant + colWidths.cant / 2, headerTextY, { align: 'center' })
  doc.text('U.M.', cols.um + colWidths.um / 2, headerTextY, { align: 'center' })
  doc.text('DESCRIPCIÓN', cols.desc + 5, headerTextY)
  if (isPharmacy) {
    doc.text('LABORATORIO', cols.lab + colWidths.lab / 2, headerTextY, { align: 'center' })
    doc.text('MARCA', cols.marca + colWidths.marca / 2, headerTextY, { align: 'center' })
  }
  doc.text('P. UNIT.', cols.pu + colWidths.pu / 2, headerTextY, { align: 'center' })
  if (hasAnyItemDiscount) {
    doc.text('DCTO.', cols.dcto + colWidths.dcto / 2, headerTextY, { align: 'center' })
  }
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
    const { height: rowHeight, descLines, pharmaLines } = itemHeights[i]

    // Fondo alternado: filas pares gris, filas impares blanco
    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 248) // Gris muy suave
      doc.rect(MARGIN_LEFT, dataRowY, CONTENT_WIDTH, rowHeight, 'F')
    }

    const item = items[i]
    const precioConIGV = item.unitPrice || item.price || 0
    const importeConIGV = item.quantity * precioConIGV
    const itemDiscount = item.itemDiscount || 0
    const importeFinal = importeConIGV - itemDiscount
    const centerY = dataRowY + rowHeight / 2 + 3 // Centro vertical de la fila

    doc.setTextColor(...BLACK)

    // Cantidad (solo número) - centrado verticalmente
    doc.setFontSize(7)
    const quantityText = Number.isInteger(item.quantity) ? item.quantity.toString() : item.quantity.toFixed(2)
    doc.text(quantityText, cols.cant + colWidths.cant / 2, centerY, { align: 'center' })

    // Unidad de medida - centrada verticalmente
    const unitCode = item.unit || 'UNIDAD'
    const unitText = unitLabels[unitCode] || unitCode
    doc.text(unitText, cols.um + colWidths.um / 2, centerY, { align: 'center' })

    // Descripción - múltiples líneas desde arriba
    doc.setFontSize(8)
    const descStartY = dataRowY + (spacious ? 13 : 10)
    descLines.forEach((line, lineIdx) => {
      doc.text(line, cols.desc + 4, descStartY + (lineIdx * lineHeight))
    })

    // Líneas farmacéuticas debajo de la descripción
    if (pharmaLines && pharmaLines.length > 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(6.5)
      doc.setTextColor(80, 100, 120) // Azul-gris
      const pharmaStartY = descStartY + (descLines.length * lineHeight)
      pharmaLines.forEach((line, lineIdx) => {
        doc.text(line, cols.desc + 4, pharmaStartY + (lineIdx * lineHeight))
      })
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...BLACK)
    }

    // Laboratorio (solo modo farmacia) - centrado verticalmente
    if (isPharmacy) {
      doc.setFontSize(7)
      const labText = item.laboratoryName || ''
      if (labText) {
        const labLines = doc.splitTextToSize(labText, colWidths.lab - 6)
        doc.text(labLines[0], cols.lab + colWidths.lab / 2, centerY, { align: 'center' })
      }

      // Marca
      const marcaText = item.marca || ''
      if (marcaText) {
        const marcaLines = doc.splitTextToSize(marcaText, colWidths.marca - 6)
        doc.text(marcaLines[0], cols.marca + colWidths.marca / 2, centerY, { align: 'center' })
      }
    }

    // Precio unitario - centrado verticalmente
    doc.setFontSize(8)
    doc.text(precioConIGV.toLocaleString('es-PE', { minimumFractionDigits: 2 }), cols.pu + colWidths.pu - 5, centerY, { align: 'right' })

    // Columna DCTO (solo si hay descuentos en algún item)
    if (hasAnyItemDiscount) {
      doc.setFontSize(8)
      doc.setTextColor(...BLACK)
      if (itemDiscount > 0) {
        doc.text(`-${itemDiscount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, cols.dcto + colWidths.dcto - 5, centerY, { align: 'right' })
      } else {
        doc.text('-', cols.dcto + colWidths.dcto / 2, centerY, { align: 'center' })
      }
    }

    // Importe - centrado verticalmente (siempre muestra el importe final)
    doc.setFontSize(8)
    doc.text(importeFinal.toLocaleString('es-PE', { minimumFractionDigits: 2 }), cols.total + colWidths.total - 5, centerY, { align: 'right' })

    dataRowY += rowHeight
  }

  // ========== 4. PIE DE PÁGINA FIJO ==========

  let footerY = tableY + tableHeight + (spacious ? 15 : 8)

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

  footerY += SON_SECTION_HEIGHT + (spacious ? 12 : 5)

  // ========== FILA: BANCOS (izq) + TOTALES (der) ==========

  const totalsWidth = 160
  const totalsX = MARGIN_LEFT + CONTENT_WIDTH - totalsWidth
  const bankSectionWidth = totalsX - MARGIN_LEFT - 10

  const igvExempt = companySettings?.emissionConfig?.taxConfig?.igvExempt || companySettings?.taxConfig?.igvExempt || false
  const rawIgvRate = companySettings?.emissionConfig?.taxConfig?.igvRate ?? companySettings?.taxConfig?.igvRate ?? 18
  const igvRate = rawIgvRate === 10 ? 10.5 : rawIgvRate
  const labelGravada = igvExempt ? 'OP. EXONERADA' : 'OP. GRAVADA'

  // Determinar si hay tasas mixtas de IGV
  // Migrar claves "10" → "10.5" (IGV 10% ya no existe)
  const rawIgvByRate = invoice.igvByRate || {}
  const igvByRate = {}
  for (const key in rawIgvByRate) {
    const newKey = key === '10' ? '10.5' : key
    igvByRate[newKey] = rawIgvByRate[key]
  }
  const igvRateKeys = Object.keys(igvByRate).sort((a, b) => Number(b) - Number(a))
  const hasMultipleIgvRates = igvRateKeys.length > 1
  const extraIgvRows = hasMultipleIgvRates ? igvRateKeys.length - 1 : 0

  // --- TOTALES (derecha) con borde ---
  const totalsRowHeight = 15
  const totalsStartY = footerY

  // Calcular filas de totales (usado para posicionar elementos después)
  // Si oculta IGV: solo 1 fila (total), sino: 3 base + extras
  const totalsSectionRows = shouldHideIgv
    ? 1
    : (3 + extraIgvRows + (HAS_DISCOUNT ? 1 : 0) + (HAS_RECARGO_CONSUMO ? 1 : 0) + (HAS_DETRACTION ? 2 : 0))

  // Si es nota de venta con ocultar IGV, solo mostrar TOTAL
  if (shouldHideIgv) {
    // Solo mostrar el TOTAL sin desglose
    const totalRowHeight = totalsRowHeight + 6
    doc.setDrawColor(...BLACK)
    doc.setLineWidth(0.5)
    doc.rect(totalsX, totalsStartY, totalsWidth, totalRowHeight)
    doc.setFillColor(...ACCENT_COLOR)
    doc.rect(totalsX, footerY, totalsWidth, totalRowHeight, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('TOTAL', totalsX + 5, footerY + 14)
    doc.setFontSize(11)
    doc.text('S/ ' + (invoice.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 14, { align: 'right' })
    footerY += totalRowHeight
  } else {
    // Mostrar desglose completo: gravada, descuento, IGV, recargo, total, detracción
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

    // Fila(s): IGV - desagregado si hay tasas mixtas
    if (hasMultipleIgvRates) {
      igvRateKeys.forEach(rate => {
        doc.setFillColor(255, 255, 255)
        doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight, 'F')
        doc.setDrawColor(200, 200, 200)
        doc.line(totalsX, footerY + totalsRowHeight, totalsX + totalsWidth, footerY + totalsRowHeight)
        doc.text(`IGV (${rate}%)`, totalsX + 5, footerY + 10)
        doc.text('S/ ' + (igvByRate[rate].igv || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 10, { align: 'right' })
        footerY += totalsRowHeight
      })
    } else {
      doc.setFillColor(255, 255, 255)
      doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight, 'F')
      doc.setDrawColor(200, 200, 200)
      doc.line(totalsX, footerY + totalsRowHeight, totalsX + totalsWidth, footerY + totalsRowHeight)
      doc.text(`IGV (${igvRateKeys[0] || igvRate}%)`, totalsX + 5, footerY + 10)
      doc.text('S/ ' + (invoice.igv || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 10, { align: 'right' })
      footerY += totalsRowHeight
    }

    // Fila: RECARGO AL CONSUMO (solo si aplica)
    if (invoice.recargoConsumo && invoice.recargoConsumo > 0) {
      doc.setFillColor(255, 255, 255) // Blanco como las otras filas
      doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight, 'F')
      doc.setDrawColor(200, 200, 200)
      doc.line(totalsX, footerY + totalsRowHeight, totalsX + totalsWidth, footerY + totalsRowHeight)
      doc.setTextColor(...BLACK)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`REC. CONSUMO (${invoice.recargoConsumoRate || 10}%)`, totalsX + 5, footerY + 10)
      doc.text('S/ ' + (invoice.recargoConsumo || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 10, { align: 'right' })
      footerY += totalsRowHeight
    }

    // Fila: TOTAL (fondo oscuro) - Si hay detracción, no es la última fila
    const totalRowHeight = HAS_DETRACTION ? totalsRowHeight : totalsRowHeight + 6
    doc.setFillColor(...ACCENT_COLOR)
    doc.rect(totalsX, footerY, totalsWidth, totalRowHeight, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('TOTAL', totalsX + 5, footerY + (HAS_DETRACTION ? 10 : 14))
    doc.setFontSize(11)
    doc.text('S/ ' + (invoice.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + (HAS_DETRACTION ? 10 : 14), { align: 'right' })
    footerY += totalRowHeight
  }

  // Filas de DETRACCIÓN (si aplica) - Solo si no se oculta el IGV
  if (HAS_DETRACTION && !shouldHideIgv) {
    // Fila: DETRACCIÓN (estilo neutro como las otras filas)
    doc.setFillColor(250, 250, 250) // Gris claro neutro
    doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.line(totalsX, footerY + totalsRowHeight, totalsX + totalsWidth, footerY + totalsRowHeight)
    doc.setTextColor(...DARK_GRAY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`DETRACCIÓN (${invoice.detractionRate || 0}%)`, totalsX + 5, footerY + 10)
    doc.text('- S/ ' + (invoice.detractionAmount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 10, { align: 'right' })
    footerY += totalsRowHeight

    // Fila: NETO A PAGAR (mismo estilo que TOTAL - color de acento de la empresa)
    doc.setFillColor(...ACCENT_COLOR)
    doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight + 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('NETO A PAGAR', totalsX + 5, footerY + 14)
    doc.setFontSize(11)
    doc.text('S/ ' + (invoice.netPayable || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 14, { align: 'right' })
    footerY += totalsRowHeight + 6
  }

  // --- CUENTAS BANCARIAS (izquierda) con borde ---
  doc.setTextColor(...BLACK)

  // Calcular si hay datos de transporte para mostrar el cuadro debajo de bancos
  const hasTransportData = (
    (companySettings?.posCustomFields?.showOriginAddressField && invoice.customer?.originAddress) ||
    (companySettings?.posCustomFields?.showDestinationAddressField && invoice.customer?.destinationAddress) ||
    (companySettings?.posCustomFields?.showTripDetailField && invoice.customer?.tripDetail) ||
    (companySettings?.posCustomFields?.showServiceReferenceValueField && invoice.customer?.serviceReferenceValue) ||
    (companySettings?.posCustomFields?.showEffectiveLoadValueField && invoice.customer?.effectiveLoadValue) ||
    (companySettings?.posCustomFields?.showUsefulLoadValueField && invoice.customer?.usefulLoadValue) ||
    (companySettings?.posCustomFields?.showDetractionField && (invoice.customer?.detractionPercentage || invoice.customer?.detractionAmount)) ||
    (companySettings?.posCustomFields?.showGoodsServiceCodeField && invoice.customer?.goodsServiceCode)
  )

  // --- SECCIÓN DE DETRACCIÓN (si aplica) ---
  // Se muestra debajo de la tabla de bancos o en su lugar
  let detractionSectionEndY = totalsStartY // Para saber dónde terminó la sección

  // Mostrar tabla de bancos siempre que haya cuentas configuradas
  if (bankAccountsArray.length > 0) {
    const bankTableX = MARGIN_LEFT
    const bankTableWidth = bankSectionWidth

    // Función helper para truncar texto que exceda el ancho de columna
    const truncateText = (text, maxWidth, fontSize) => {
      doc.setFontSize(fontSize)
      let truncated = String(text || '')
      while (doc.getTextWidth(truncated) > maxWidth - 6 && truncated.length > 0) {
        truncated = truncated.slice(0, -1)
      }
      if (truncated.length < String(text || '').length && truncated.length > 0) {
        truncated = truncated.slice(0, -2) + '..'
      }
      return truncated
    }

    // Anchos de columna proporcionales al contenido
    const COL_BANCO = Math.floor(bankTableWidth * 0.28)  // ~28% para banco + tipo
    const COL_MONEDA = Math.floor(bankTableWidth * 0.15) // ~15% para moneda
    const COL_CUENTA = Math.floor(bankTableWidth * 0.30) // ~30% para número de cuenta
    const COL_CCI = bankTableWidth - COL_BANCO - COL_MONEDA - COL_CUENTA // resto para CCI

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

    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('BANCO', colStart.banco + 2, bankY + 9)
    doc.text('MONEDA', colStart.moneda + 2, bankY + 9)
    doc.text('Nº CUENTA', colStart.cuenta + 2, bankY + 9)
    doc.text('CCI', colStart.cci + 2, bankY + 9)
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

      // Mostrar banco con tipo de cuenta
      const accountTypeLabel = account.accountType === 'detracciones' ? ' (Detr.)'
        : account.accountType === 'ahorros' ? ' (Ah.)'
        : ''
      const bankLabel = `${account.bank || ''}${accountTypeLabel}`

      doc.setFontSize(7)
      doc.text(truncateText(bankLabel, COL_BANCO, 7), colStart.banco + 2, bankY + 8)
      doc.text(truncateText(account.currency || '', COL_MONEDA, 7), colStart.moneda + 2, bankY + 8)
      doc.text(truncateText(account.accountNumber || '', COL_CUENTA, 7), colStart.cuenta + 2, bankY + 8)
      doc.text(truncateText(account.cci || '-', COL_CCI, 7), colStart.cci + 2, bankY + 8)
      bankY += bankRowHeight
    })
    detractionSectionEndY = bankY
  }

  // --- SECCIÓN INFORMACIÓN DE DETRACCIÓN (si aplica) ---
  if (HAS_DETRACTION) {
    const detractionInfoX = MARGIN_LEFT
    const detractionInfoWidth = bankSectionWidth
    let detractionInfoY = detractionSectionEndY + (bankAccountsArray.length > 0 ? 5 : 0)

    // Si no hay bancos, empezar desde totalsStartY
    if (bankAccountsArray.length === 0) {
      detractionInfoY = totalsStartY
    }

    const detractionRowHeight = 12
    const spotLegendHeight = 22
    const detractionDataRows = 4 // código, cuenta, porcentaje, monto
    const detractionTotalHeight = spotLegendHeight + (detractionDataRows * detractionRowHeight)

    // Recuadro exterior
    doc.setDrawColor(...BLACK)
    doc.setLineWidth(0.5)
    doc.rect(detractionInfoX, detractionInfoY, detractionInfoWidth, detractionTotalHeight)

    // Fondo verde para leyenda SPOT (como en el ejemplo)
    doc.setFillColor(200, 230, 200) // Verde claro
    doc.rect(detractionInfoX, detractionInfoY, detractionInfoWidth, spotLegendHeight, 'F')

    // Leyenda SPOT
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 80, 0) // Verde oscuro
    doc.text('Operación sujeta al Sistema de Pago de Obligaciones', detractionInfoX + 5, detractionInfoY + 9)
    doc.text('Tributarias - SPOT', detractionInfoX + 5, detractionInfoY + 17)

    // Línea después de SPOT
    doc.setDrawColor(180, 180, 180)
    doc.line(detractionInfoX, detractionInfoY + spotLegendHeight, detractionInfoX + detractionInfoWidth, detractionInfoY + spotLegendHeight)

    let dataY = detractionInfoY + spotLegendHeight + 10
    doc.setTextColor(...BLACK)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)

    // Código bien o servicio
    doc.text('Código bien o servicio:', detractionInfoX + 5, dataY)
    doc.setFont('helvetica', 'bold')
    doc.text(invoice.detractionType || '-', detractionInfoX + 95, dataY)
    dataY += detractionRowHeight

    // N° cuenta Banco de la Nación
    doc.setFont('helvetica', 'normal')
    doc.text('N° cuenta Banco de la Nación:', detractionInfoX + 5, dataY)
    doc.setFont('helvetica', 'bold')
    doc.text(invoice.detractionBankAccount || '-', detractionInfoX + 115, dataY)
    dataY += detractionRowHeight

    // Porcentaje de detracción
    doc.setFont('helvetica', 'normal')
    doc.text('Porcentaje de detracción:', detractionInfoX + 5, dataY)
    doc.setFont('helvetica', 'bold')
    doc.text(`${invoice.detractionRate || 0}%`, detractionInfoX + 95, dataY)
    dataY += detractionRowHeight

    // Monto de detracción
    doc.setFont('helvetica', 'normal')
    doc.text('Monto de detracción:', detractionInfoX + 5, dataY)
    doc.setFont('helvetica', 'bold')
    doc.text(`S/ ${(invoice.detractionAmount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, detractionInfoX + 95, dataY)

    // Guardar donde termina la sección de detracción
    detractionSectionEndY = detractionInfoY + detractionTotalHeight + 5
  }

  // ========== QR Y VALIDACIÓN SUNAT ==========

  // Calcular posición Y: usar el máximo entre totales (derecha) y sección izquierda (bancos + detracción)
  const totalsEndY = totalsStartY + totalsRowHeight * totalsSectionRows + 15
  footerY = Math.max(totalsEndY, detractionSectionEndY + 5)

  // ===== SECCIÓN DE DATOS DE TRANSPORTE (CUADRO) - Al lado izquierdo =====
  // (hasTransportData ya fue calculado arriba, antes de la tabla de bancos)
  let transportSectionEndY = footerY

  if (hasTransportData) {
    // El cuadro de transporte va en el lado izquierdo, DEBAJO de las cuentas bancarias
    const transportBoxX = MARGIN_LEFT
    const transportBoxWidth = bankSectionWidth
    let transportY = detractionSectionEndY + 5 // Empieza debajo de bancos/detracción
    const transportRowHeight = 18
    const transportLabelHeight = 9
    const halfWidth = transportBoxWidth / 2

    doc.setDrawColor(...BORDER_COLOR)
    doc.setLineWidth(0.5)

    // Fila 1: Dirección de Origen (ancho completo)
    if (companySettings?.posCustomFields?.showOriginAddressField && invoice.customer?.originAddress) {
      doc.setFillColor(245, 245, 245)
      doc.rect(transportBoxX, transportY, transportBoxWidth, transportLabelHeight, 'F')
      doc.rect(transportBoxX, transportY, transportBoxWidth, transportRowHeight)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK_GRAY)
      doc.text('Dirección detallada del origen:', transportBoxX + 2, transportY + 6)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...BLACK)
      const originText = doc.splitTextToSize(invoice.customer.originAddress, transportBoxWidth - 4)
      doc.text(originText[0] || '', transportBoxX + 2, transportY + 14)
      transportY += transportRowHeight
    }

    // Fila 2: Dirección de Destino (ancho completo)
    if (companySettings?.posCustomFields?.showDestinationAddressField && invoice.customer?.destinationAddress) {
      doc.setFillColor(245, 245, 245)
      doc.rect(transportBoxX, transportY, transportBoxWidth, transportLabelHeight, 'F')
      doc.rect(transportBoxX, transportY, transportBoxWidth, transportRowHeight)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK_GRAY)
      doc.text('Dirección detallada del destino:', transportBoxX + 2, transportY + 6)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...BLACK)
      const destText = doc.splitTextToSize(invoice.customer.destinationAddress, transportBoxWidth - 4)
      doc.text(destText[0] || '', transportBoxX + 2, transportY + 14)
      transportY += transportRowHeight
    }

    // Fila 3: Detalle del Viaje | Valor Referencial del Servicio (dos columnas)
    const showTripDetail = companySettings?.posCustomFields?.showTripDetailField && invoice.customer?.tripDetail
    const showServiceValue = companySettings?.posCustomFields?.showServiceReferenceValueField && invoice.customer?.serviceReferenceValue
    if (showTripDetail || showServiceValue) {
      doc.setFillColor(245, 245, 245)
      doc.rect(transportBoxX, transportY, halfWidth, transportLabelHeight, 'F')
      doc.rect(transportBoxX + halfWidth, transportY, halfWidth, transportLabelHeight, 'F')
      doc.rect(transportBoxX, transportY, halfWidth, transportRowHeight)
      doc.rect(transportBoxX + halfWidth, transportY, halfWidth, transportRowHeight)

      // Columna izquierda: Detalle del Viaje
      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK_GRAY)
      doc.text('Detalle del Viaje:', transportBoxX + 2, transportY + 6)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...BLACK)
      const tripText = doc.splitTextToSize(invoice.customer?.tripDetail || '', halfWidth - 4)
      doc.text(tripText[0] || '', transportBoxX + 2, transportY + 14)

      // Columna derecha: Valor Referencial del Servicio
      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK_GRAY)
      doc.text('Valor Referencial del servicio de', transportBoxX + halfWidth + 2, transportY + 6)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...BLACK)
      const serviceVal = invoice.customer?.serviceReferenceValue ? `PEN ${parseFloat(invoice.customer.serviceReferenceValue).toFixed(2)}` : ''
      doc.text(serviceVal, transportBoxX + halfWidth + 2, transportY + 14)
      transportY += transportRowHeight
    }

    // Fila 4: Valor Carga Efectiva | Valor Carga Útil (dos columnas)
    const showEffectiveLoad = companySettings?.posCustomFields?.showEffectiveLoadValueField && invoice.customer?.effectiveLoadValue
    const showUsefulLoad = companySettings?.posCustomFields?.showUsefulLoadValueField && invoice.customer?.usefulLoadValue
    if (showEffectiveLoad || showUsefulLoad) {
      doc.setFillColor(245, 245, 245)
      doc.rect(transportBoxX, transportY, halfWidth, transportLabelHeight, 'F')
      doc.rect(transportBoxX + halfWidth, transportY, halfWidth, transportLabelHeight, 'F')
      doc.rect(transportBoxX, transportY, halfWidth, transportRowHeight)
      doc.rect(transportBoxX + halfWidth, transportY, halfWidth, transportRowHeight)

      // Columna izquierda: Valor Ref. Carga Efectiva
      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK_GRAY)
      doc.text('Valor Referencial sobre la carga efectiva:', transportBoxX + 2, transportY + 6)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...BLACK)
      const effectiveVal = invoice.customer?.effectiveLoadValue ? `PEN ${parseFloat(invoice.customer.effectiveLoadValue).toFixed(2)}` : ''
      doc.text(effectiveVal, transportBoxX + 2, transportY + 14)

      // Columna derecha: Valor Ref. Carga Útil
      doc.setFontSize(6)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK_GRAY)
      doc.text('Valor Referencial sobre la carga útil', transportBoxX + halfWidth + 2, transportY + 6)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...BLACK)
      const usefulVal = invoice.customer?.usefulLoadValue ? `PEN ${parseFloat(invoice.customer.usefulLoadValue).toFixed(2)}` : ''
      doc.text(usefulVal, transportBoxX + halfWidth + 2, transportY + 14)
      transportY += transportRowHeight
    }

    // Fila 5: Sección con Detracción, Bien o Servicio, Neto a Pagar
    // (Cta. Banco ya se muestra en la tabla de cuentas bancarias)
    const showDetraction = companySettings?.posCustomFields?.showDetractionField && (invoice.customer?.detractionPercentage || invoice.customer?.detractionAmount)
    const showGoodsService = companySettings?.posCustomFields?.showGoodsServiceCodeField && invoice.customer?.goodsServiceCode
    if (showDetraction || showGoodsService) {
      // Contar cuántas filas hay para calcular altura dinámica
      let rowCount = 0
      if (showDetraction) rowCount++
      if (showGoodsService) rowCount++
      // Agregar fila para Neto a Pagar si hay detracción
      if (showDetraction && invoice.customer?.detractionAmount) rowCount++
      const infoRowHeight = 6 + (rowCount * 10)

      doc.setDrawColor(...BORDER_COLOR)
      doc.rect(transportBoxX, transportY, transportBoxWidth, infoRowHeight)

      doc.setFontSize(7)
      let infoY = transportY + 8
      const labelX = transportBoxX + 3
      const valueX = transportBoxX + 75

      if (showDetraction) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...DARK_GRAY)
        const detractionLabel = invoice.customer.detractionPercentage ? `Detracción (${invoice.customer.detractionPercentage}%)` : 'Detracción'
        doc.text(detractionLabel, labelX, infoY)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...BLACK)
        const detractionVal = invoice.customer.detractionAmount ? `S/ ${parseFloat(invoice.customer.detractionAmount).toFixed(2)}` : ''
        doc.text(detractionVal, valueX, infoY)
        infoY += 10
      }

      if (showGoodsService) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...DARK_GRAY)
        doc.text('Bien o Servicio', labelX, infoY)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...BLACK)
        doc.text(invoice.customer.goodsServiceCode, valueX, infoY)
        infoY += 10
      }

      // Neto a Pagar (Total - Detracción)
      if (showDetraction && invoice.customer?.detractionAmount) {
        const netoAPagar = invoice.total - parseFloat(invoice.customer.detractionAmount || 0)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...DARK_GRAY)
        doc.text('Neto a Pagar', labelX, infoY)
        doc.setTextColor(...BLACK)
        doc.text(`S/ ${netoAPagar.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, valueX, infoY)
      }

      transportY += infoRowHeight
    }

    transportSectionEndY = transportY + 5
  }

  // Usar el máximo entre totales y sección de transporte para el footerY
  footerY = Math.max(footerY, transportSectionEndY)

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
    // Para notas de venta: mostrar estado de pago si hay pagos parciales
    if (invoice.paymentStatus && invoice.paymentHistory && invoice.paymentHistory.length > 0) {
      const paymentBoxY = footerY
      const paymentBoxWidth = CONTENT_WIDTH
      const paymentRowHeight = 12

      // Calcular altura del recuadro según contenido
      let paymentBoxHeight = 32 // Header + padding
      if (invoice.paymentStatus === 'partial') {
        paymentBoxHeight += 24 // Monto pagado + Saldo pendiente
      }
      paymentBoxHeight += 18 + (invoice.paymentHistory.length * 12) // Historial de pagos

      // Recuadro para estado de pago
      doc.setDrawColor(...BLACK)
      doc.setLineWidth(0.5)
      doc.rect(MARGIN_LEFT, paymentBoxY, paymentBoxWidth, paymentBoxHeight)

      // Header con color de acento
      doc.setFillColor(...ACCENT_COLOR)
      doc.rect(MARGIN_LEFT, paymentBoxY, paymentBoxWidth, 18, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...WHITE)
      const paymentTitle = invoice.paymentStatus === 'partial' ? 'ESTADO DE PAGO' : 'DETALLE DE PAGOS'
      doc.text(paymentTitle, MARGIN_LEFT + 5, paymentBoxY + 12)

      let paymentY = paymentBoxY + 32 // Más espacio después del header
      const valueX = MARGIN_LEFT + 70 // Posición X fija para los valores (después de "Saldo Pendiente:")

      // Si es pago parcial, mostrar monto pagado y saldo pendiente
      if (invoice.paymentStatus === 'partial') {
        doc.setFontSize(8)

        // Monto pagado
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...DARK_GRAY)
        doc.text('Monto Pagado:', MARGIN_LEFT + 5, paymentY)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...BLACK)
        doc.text('S/ ' + (invoice.amountPaid || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), valueX, paymentY)
        paymentY += 12

        // Saldo pendiente
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...DARK_GRAY)
        doc.text('Saldo Pendiente:', MARGIN_LEFT + 5, paymentY)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(220, 38, 38) // Rojo para el saldo pendiente
        doc.text('S/ ' + (invoice.balance || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), valueX, paymentY)
        paymentY += 12
      }

      // Historial de pagos
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...BLACK)
      doc.text('HISTORIAL DE PAGOS:', MARGIN_LEFT + 5, paymentY)
      paymentY += 10

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...DARK_GRAY)

      for (const payment of invoice.paymentHistory) {
        const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date)
        const dateStr = paymentDate.toLocaleDateString('es-PE')
        const amountStr = 'S/ ' + (payment.amount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })
        doc.text(`• ${dateStr} - ${amountStr} (${payment.method || 'Efectivo'})`, MARGIN_LEFT + 8, paymentY)
        paymentY += 10
      }

      footerY = paymentBoxY + paymentBoxHeight + 10
    }

    doc.setFontSize(8)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text('DOCUMENTO NO VÁLIDO PARA EFECTOS TRIBUTARIOS', MARGIN_LEFT, footerY + 10)
    footerY += 20
  }

  // ========== OBSERVACIONES GENERALES ==========
  if (invoice.notes && invoice.notes.trim()) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('OBSERVACIONES:', MARGIN_LEFT, footerY + 5)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    const notesLines = doc.splitTextToSize(invoice.notes, CONTENT_WIDTH - 10)
    const maxLines = Math.min(notesLines.length, 4) // Máximo 4 líneas
    for (let i = 0; i < maxLines; i++) {
      doc.text(notesLines[i], MARGIN_LEFT + 5, footerY + 14 + (i * 8))
    }
    footerY += 15 + (maxLines * 8)
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

/**
 * Generar Nota de Salida (A4) - Sin precios, solo cantidades
 * Para el encargado de almacén
 */
export const generateExitNotePDF = async (invoice, companySettings) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [120, 120, 120]
  const LIGHT_GRAY = [240, 240, 240]

  const MARGIN_LEFT = 30
  const MARGIN_RIGHT = 30
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  let currentY = 30

  // ========== ENCABEZADO ==========

  // Logo (si existe)
  if (companySettings?.logoUrl) {
    try {
      const imgData = await loadImageWithRetry(companySettings.logoUrl)
      if (imgData) {
        let format = 'PNG'
        if (companySettings.logoUrl.toLowerCase().includes('.jpg') ||
            companySettings.logoUrl.toLowerCase().includes('.jpeg')) {
          format = 'JPEG'
        }
        const img = new Image()
        img.src = imgData
        await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve })
        const aspectRatio = img.width / img.height
        const logoHeight = 50
        const logoWidth = Math.min(logoHeight * aspectRatio, 150)
        doc.addImage(imgData, format, MARGIN_LEFT, currentY, logoWidth, logoHeight)
      }
    } catch (e) { /* Continuar sin logo */ }
  }

  // Título "NOTA DE SALIDA" a la derecha
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('NOTA DE SALIDA', PAGE_WIDTH - MARGIN_RIGHT, currentY + 20, { align: 'right' })

  // Nombre de la empresa
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  const companyName = companySettings?.businessName || companySettings?.name || ''
  if (companyName) {
    doc.text(companyName.toUpperCase(), PAGE_WIDTH - MARGIN_RIGHT, currentY + 35, { align: 'right' })
  }

  currentY += 65

  // Línea separadora
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(1)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 15

  // ========== DATOS DEL DOCUMENTO ==========

  doc.setFontSize(9)
  const labelX = MARGIN_LEFT
  const valueX = MARGIN_LEFT + 120
  const rightLabelX = PAGE_WIDTH / 2 + 20
  const rightValueX = PAGE_WIDTH / 2 + 140

  // Fila 1: Referencia + Fecha
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK_GRAY)
  doc.text('Comprobante Ref.:', labelX, currentY)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  const docTypeLabels = {
    'factura': 'Factura',
    'boleta': 'Boleta',
    'nota_venta': 'Nota de Venta'
  }
  const docLabel = docTypeLabels[invoice.documentType] || invoice.documentType || ''
  doc.text(`${docLabel} ${invoice.number || ''}`, valueX, currentY)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK_GRAY)
  doc.text('Fecha:', rightLabelX, currentY)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  const emissionDate = invoice.emissionDate?.toDate
    ? formatDate(invoice.emissionDate.toDate())
    : invoice.emissionDate
      ? formatDate(new Date(invoice.emissionDate))
      : formatDate(new Date())
  doc.text(emissionDate, rightValueX, currentY)

  currentY += 16

  // Fila 2: Cliente
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK_GRAY)
  doc.text('Cliente:', labelX, currentY)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  const clientName = invoice.clientName || invoice.customer?.name || 'Cliente General'
  const maxClientWidth = CONTENT_WIDTH - 120
  const clientLines = doc.splitTextToSize(clientName, maxClientWidth)
  doc.text(clientLines[0], valueX, currentY)

  currentY += 16

  // Fila 3: RUC/DNI del cliente
  const clientDoc = invoice.clientDocument || invoice.customer?.document || ''
  if (clientDoc) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK_GRAY)
    doc.text('RUC/DNI:', labelX, currentY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    doc.text(clientDoc, valueX, currentY)
    currentY += 16
  }

  currentY += 10

  // ========== TABLA DE PRODUCTOS (SIN PRECIOS) ==========

  const items = invoice.items || []

  // Columnas: #, CANTIDAD, U.M., DESCRIPCIÓN
  const colWidths = {
    num: CONTENT_WIDTH * 0.06,
    cant: CONTENT_WIDTH * 0.12,
    um: CONTENT_WIDTH * 0.12,
    desc: CONTENT_WIDTH * 0.70
  }

  const cols = {
    num: MARGIN_LEFT,
    cant: MARGIN_LEFT + colWidths.num,
    um: MARGIN_LEFT + colWidths.num + colWidths.cant,
    desc: MARGIN_LEFT + colWidths.num + colWidths.cant + colWidths.um
  }

  // Header de la tabla
  doc.setFillColor(...LIGHT_GRAY)
  doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, 20, 'F')
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, 20, 'S')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)

  const headerY = currentY + 14
  doc.text('#', cols.num + colWidths.num / 2, headerY, { align: 'center' })
  doc.text('CANTIDAD', cols.cant + colWidths.cant / 2, headerY, { align: 'center' })
  doc.text('U.M.', cols.um + colWidths.um / 2, headerY, { align: 'center' })
  doc.text('DESCRIPCIÓN', cols.desc + 5, headerY)

  currentY += 20

  // Filas de productos
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  items.forEach((item, index) => {
    const itemName = item.name || item.description || ''
    const quantityText = Number.isInteger(item.quantity) ? item.quantity.toString() : item.quantity.toFixed(2)
    const unitLabels = {
      'UNIDAD': 'UND',
      'CAJA': 'CJA',
      'KG': 'KG',
      'LITRO': 'LT',
      'METRO': 'MT',
      'HORA': 'HR',
      'SERVICIO': 'SRV'
    }
    const unitCode = unitLabels[item.unit] || item.unit || 'UND'

    // Calcular alto de la fila según el texto de descripción
    const descLines = doc.splitTextToSize(itemName, colWidths.desc - 10)
    const rowHeight = Math.max(18, descLines.length * 10 + 8)

    // Check page break
    if (currentY + rowHeight > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      currentY = 30
    }

    // Fondo alternado
    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, rowHeight, 'F')
    }

    // Borde de la fila
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, rowHeight, 'S')

    const textY = currentY + rowHeight / 2 + 3

    doc.setTextColor(...DARK_GRAY)
    doc.text((index + 1).toString(), cols.num + colWidths.num / 2, textY, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text(quantityText, cols.cant + colWidths.cant / 2, textY, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    doc.text(unitCode, cols.um + colWidths.um / 2, textY, { align: 'center' })

    doc.setTextColor(...BLACK)
    if (descLines.length === 1) {
      doc.text(descLines[0], cols.desc + 5, textY)
    } else {
      const startTextY = currentY + 12
      descLines.forEach((line, i) => {
        doc.text(line, cols.desc + 5, startTextY + (i * 10))
      })
    }

    currentY += rowHeight
  })

  // Línea final de la tabla
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)

  // Total de items
  currentY += 15
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK_GRAY)
  const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0)
  const totalText = Number.isInteger(totalItems) ? totalItems.toString() : totalItems.toFixed(2)
  doc.text(`Total de artículos: ${totalText}`, MARGIN_LEFT, currentY)

  // Notas / observaciones
  if (invoice.notes || invoice.observations) {
    currentY += 20
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Observaciones:', MARGIN_LEFT, currentY)
    currentY += 12
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...BLACK)
    const notesText = invoice.notes || invoice.observations || ''
    const notesLines = doc.splitTextToSize(notesText, CONTENT_WIDTH)
    notesLines.slice(0, 4).forEach(line => {
      doc.text(line, MARGIN_LEFT, currentY)
      currentY += 10
    })
  }

  // Espacio para firma
  currentY += 40
  const signWidth = 180
  const sign1X = MARGIN_LEFT + 40
  const sign2X = PAGE_WIDTH - MARGIN_RIGHT - signWidth - 40

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.line(sign1X, currentY, sign1X + signWidth, currentY)
  doc.line(sign2X, currentY, sign2X + signWidth, currentY)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  doc.text('Despachado por', sign1X + signWidth / 2, currentY + 12, { align: 'center' })
  doc.text('Recibido por', sign2X + signWidth / 2, currentY + 12, { align: 'center' })

  // Pie de página
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFontSize(7)
  doc.setTextColor(...MEDIUM_GRAY)
  doc.text('Documento interno - No tiene valor tributario', PAGE_WIDTH / 2, pageHeight - 15, { align: 'center' })

  // Descargar o compartir
  const fileName = `Nota_Salida_${invoice.number?.replace(/\//g, '-') || 'sin_numero'}.pdf`

  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    try {
      const pdfBase64 = doc.output('datauristring').split(',')[1]
      const result = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: Directory.Documents,
        recursive: true
      })
      await Share.share({
        title: `Nota de Salida - ${invoice.number || ''}`,
        url: result.uri,
        dialogTitle: 'Compartir Nota de Salida'
      })
      return result.uri
    } catch (error) {
      console.error('Error al generar nota de salida en móvil:', error)
      throw error
    }
  } else {
    const blobUrl = doc.output('bloburl')
    window.open(blobUrl, '_blank')
    return blobUrl
  }
}
