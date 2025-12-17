import JSZip from 'jszip'

/**
 * Servicio para exportar XML y CDR de forma masiva para auditoría SUNAT
 */

/**
 * Descarga un archivo desde una URL y lo retorna como blob
 */
const fetchFileAsBlob = async (url) => {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return await response.blob()
  } catch (error) {
    console.error('Error descargando archivo:', error)
    return null
  }
}

/**
 * Genera el nombre del archivo según el formato SUNAT
 * Formato: RUC-TIPO-SERIE-NUMERO
 */
const generateFileName = (invoice, companyRuc, type) => {
  const docTypeCode = invoice.documentType === 'factura' ? '01' :
                      invoice.documentType === 'boleta' ? '03' :
                      invoice.documentType === 'nota_credito_factura' ? '07' :
                      invoice.documentType === 'nota_credito_boleta' ? '07' :
                      invoice.documentType === 'nota_debito_factura' ? '08' :
                      invoice.documentType === 'nota_debito_boleta' ? '08' : '03'

  const [serie, numero] = (invoice.number || '').split('-')
  const extension = type === 'xml' ? '.xml' : '-CDR.xml'

  return `${companyRuc}-${docTypeCode}-${serie}-${numero}${extension}`
}

/**
 * Exporta XML y CDR de múltiples facturas en un archivo ZIP
 * @param {Array} invoices - Lista de facturas a exportar
 * @param {string} companyRuc - RUC de la empresa
 * @param {Object} options - Opciones de exportación
 * @param {boolean} options.includeXML - Incluir archivos XML
 * @param {boolean} options.includeCDR - Incluir archivos CDR
 * @param {Function} onProgress - Callback para progreso (0-100)
 */
export const exportXMLandCDR = async (invoices, companyRuc, options = {}, onProgress = () => {}) => {
  const { includeXML = true, includeCDR = true } = options

  // Filtrar solo facturas aceptadas por SUNAT que tienen XML/CDR
  const validInvoices = invoices.filter(inv =>
    inv.sunatStatus === 'accepted' &&
    inv.sunatResponse &&
    (inv.sunatResponse.xmlStorageUrl || inv.sunatResponse.cdrStorageUrl || inv.sunatResponse.cdrData)
  )

  if (validInvoices.length === 0) {
    throw new Error('No hay comprobantes aceptados por SUNAT para exportar')
  }

  const zip = new JSZip()
  const xmlFolder = zip.folder('XML')
  const cdrFolder = zip.folder('CDR')

  let processed = 0
  const total = validInvoices.length * (includeXML && includeCDR ? 2 : 1)

  const results = {
    success: 0,
    failed: 0,
    xmlCount: 0,
    cdrCount: 0,
    errors: []
  }

  for (const invoice of validInvoices) {
    const fileName = generateFileName(invoice, companyRuc, 'xml')
    const cdrFileName = generateFileName(invoice, companyRuc, 'cdr')

    // Descargar XML
    if (includeXML && invoice.sunatResponse?.xmlStorageUrl) {
      try {
        const xmlBlob = await fetchFileAsBlob(invoice.sunatResponse.xmlStorageUrl)
        if (xmlBlob) {
          xmlFolder.file(fileName, xmlBlob)
          results.xmlCount++
          results.success++
        } else {
          results.errors.push(`XML no disponible: ${invoice.number}`)
          results.failed++
        }
      } catch (error) {
        results.errors.push(`Error XML ${invoice.number}: ${error.message}`)
        results.failed++
      }
      processed++
      onProgress(Math.round((processed / total) * 100))
    }

    // Descargar CDR
    if (includeCDR) {
      try {
        let cdrBlob = null

        if (invoice.sunatResponse?.cdrStorageUrl) {
          cdrBlob = await fetchFileAsBlob(invoice.sunatResponse.cdrStorageUrl)
        } else if (invoice.sunatResponse?.cdrUrl) {
          cdrBlob = await fetchFileAsBlob(invoice.sunatResponse.cdrUrl)
        } else if (invoice.sunatResponse?.cdrData) {
          // CDR almacenado como base64 o texto
          const cdrContent = invoice.sunatResponse.cdrData
          cdrBlob = new Blob([cdrContent], { type: 'application/xml' })
        }

        if (cdrBlob) {
          cdrFolder.file(cdrFileName, cdrBlob)
          results.cdrCount++
          results.success++
        } else {
          results.errors.push(`CDR no disponible: ${invoice.number}`)
          results.failed++
        }
      } catch (error) {
        results.errors.push(`Error CDR ${invoice.number}: ${error.message}`)
        results.failed++
      }
      processed++
      onProgress(Math.round((processed / total) * 100))
    }
  }

  // Generar el ZIP
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })

  return {
    blob: zipBlob,
    results
  }
}

/**
 * Descarga el archivo ZIP generado
 */
export const downloadZip = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Genera nombre para el archivo ZIP de exportación
 */
export const generateZipFileName = (companyRuc, month, year) => {
  const monthStr = month.toString().padStart(2, '0')
  return `SUNAT_${companyRuc}_${year}${monthStr}_XML_CDR.zip`
}
