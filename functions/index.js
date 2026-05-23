import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { getStorage } from 'firebase-admin/storage'
import JSZip from 'jszip'
import axios from 'axios'
import { randomUUID } from 'crypto'
import { emitirComprobante, emitirNotaCredito, emitirNotaDebito, emitirGuiaRemision, emitirGuiaRemisionTransportista } from './src/services/emissionRouter.js'
import { generateVoidedDocumentsXML, generateVoidedDocumentId, getDocumentTypeCode as getVoidDocTypeCode, canVoidDocument } from './src/utils/voidedDocumentsXmlGenerator.js'
import { generateSummaryDocumentsXML, generateSummaryDocumentId, canVoidBoleta, CONDITION_CODES, getIdentityTypeCode } from './src/utils/summaryDocumentsXmlGenerator.js'
import { signXML } from './src/utils/xmlSigner.js'
import { sendSummary, getStatus, getStatusCdr } from './src/utils/sunatClient.js'
import { voidBoletaViaQPse, voidInvoiceViaQPse, obtenerToken, consultarEstado } from './src/services/qpseService.js'
import { sendPushNotification } from './notifications/sendPushNotification.js'
import { loginRappi, getStoreOrders, getOrdersV2 } from './src/services/rappiApi.js'
import {
  isCloudinaryUrl,
  isAlreadyOptimized,
  parseCloudinaryUrl,
  migrateOneUrl,
  deleteResource,
  deleteResources,
  listResources,
} from './src/services/cloudinaryAdmin.js'

// Initialize Firebase Admin
initializeApp()
const db = getFirestore()
const auth = getAuth()
const storage = getStorage()
const messaging = getMessaging()

/**
 * Guarda un archivo XML/CDR en Firebase Storage
 * @param {string} businessId - ID del negocio
 * @param {string} invoiceId - ID del comprobante
 * @param {string} fileName - Nombre del archivo (ej: 'comprobante.xml', 'cdr.xml')
 * @param {string} content - Contenido del archivo
 * @returns {Promise<string>} URL de descarga del archivo
 */
async function saveToStorage(businessId, invoiceId, fileName, content) {
  try {
    const bucket = storage.bucket()
    const filePath = `comprobantes/${businessId}/${invoiceId}/${fileName}`
    const file = bucket.file(filePath)

    // Generar un token único para acceso
    const downloadToken = randomUUID()

    await file.save(content, {
      contentType: 'application/xml',
      metadata: {
        cacheControl: 'public, max-age=31536000',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken
        }
      }
    })

    // Construir URL de descarga con token (formato Firebase Storage)
    const bucketName = bucket.name
    const encodedPath = encodeURIComponent(filePath)
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`

    console.log(`📁 Archivo guardado en Storage: ${filePath}`)
    return downloadUrl
  } catch (error) {
    console.error(`❌ Error guardando archivo en Storage: ${error.message}`)
    // No fallar la emisión si falla el guardado en Storage
    return null
  }
}

/**
 * Descarga contenido desde una URL externa
 * @param {string} url - URL del archivo a descargar
 * @returns {Promise<string|null>} Contenido del archivo o null si falla
 */
async function downloadFromUrl(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.text()
  } catch (error) {
    console.error(`❌ Error descargando desde URL: ${error.message}`)
    return null
  }
}

/**
 * Intenta recuperar CDR desde SUNAT usando getStatusCdr
 * Solo funciona para facturas (01), notas de crédito (07) y notas de débito (08).
 * NO funciona para boletas (03).
 *
 * @param {Object} params
 * @param {Object} params.businessData - Datos del negocio (con sunat config)
 * @param {string} params.ruc - RUC del emisor
 * @param {string} params.docTypeCode - Código de tipo: '01', '07', '08'
 * @param {string} params.series - Serie del documento
 * @param {string|number} params.number - Número correlativo
 * @param {string} params.businessId - ID del negocio (para Storage)
 * @param {string} params.documentId - ID del documento en Firestore
 * @param {string} params.documentNumber - Número completo (ej: 'F001-00000001')
 * @returns {Object} { cdrData, cdrStorageUrl } o { cdrData: null, cdrStorageUrl: null }
 */
async function tryRecoverCdr({ businessData, ruc, docTypeCode, series, number, businessId, documentId, documentNumber }) {
  try {
    // Solo funciona para facturas, NC y ND
    if (!['01', '07', '08'].includes(docTypeCode)) {
      console.log(`📋 getStatusCdr no aplica para tipo ${docTypeCode} - omitiendo`)
      return { cdrData: null, cdrStorageUrl: null }
    }

    // Solo para sunat_direct (necesitamos credenciales SOL)
    if (!businessData.sunat?.enabled) {
      return { cdrData: null, cdrStorageUrl: null }
    }

    console.log(`🔍 Intentando recuperar CDR via getStatusCdr para ${ruc}-${docTypeCode}-${series}-${number}...`)

    const cdrResult = await getStatusCdr({
      ruc,
      solUser: businessData.sunat.solUser,
      solPassword: businessData.sunat.solPassword,
      environment: businessData.sunat.environment || 'beta',
      documentType: docTypeCode,
      series,
      number: String(number)
    })

    if (cdrResult.success && cdrResult.cdrData) {
      console.log(`✅ CDR recuperado exitosamente via getStatusCdr`)

      // Guardar CDR en Storage
      let cdrStorageUrl = null
      try {
        cdrStorageUrl = await saveToStorage(businessId, documentId, `${documentNumber}-CDR.xml`, cdrResult.cdrData)
      } catch (storageErr) {
        console.error('⚠️ Error guardando CDR recuperado en Storage:', storageErr.message)
      }

      return { cdrData: cdrResult.cdrData, cdrStorageUrl }
    }

    console.log(`⚠️ No se pudo recuperar CDR via getStatusCdr: ${cdrResult.error || 'sin CDR en respuesta'}`)
    return { cdrData: null, cdrStorageUrl: null }
  } catch (err) {
    console.error('⚠️ Error en tryRecoverCdr (no bloquea flujo):', err.message)
    return { cdrData: null, cdrStorageUrl: null }
  }
}

/**
 * Maneja CORS manualmente
 */
function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.set('Access-Control-Max-Age', '3600')
}

/**
 * Filtra valores undefined de un objeto (Firestore no acepta undefined)
 */
function removeUndefined(obj) {
  const cleaned = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = value
    }
  }
  return cleaned
}

/**
 * Serializa un valor para que sea compatible con Firestore
 * Convierte objetos complejos a JSON strings
 */
function sanitizeForFirestore(value, maxDepth = 2, currentDepth = 0) {
  // Si llegamos al máximo de profundidad, convertir a string
  if (currentDepth >= maxDepth) {
    return typeof value === 'object' ? JSON.stringify(value) : value
  }

  // Valores primitivos
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value

  // Arrays
  if (Array.isArray(value)) {
    return value.map(item => sanitizeForFirestore(item, maxDepth, currentDepth + 1))
  }

  // Objetos
  const sanitized = {}
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) {
      sanitized[key] = sanitizeForFirestore(val, maxDepth, currentDepth + 1)
    }
  }
  return sanitized
}

/**
 * Lista de errores temporales de SUNAT que permiten reintento automático
 * Estos errores NO son rechazos reales del documento, sino problemas de conectividad
 */
const TRANSIENT_SUNAT_ERRORS = [
  // Errores de sistema SUNAT (según catálogo oficial)
  '0100',                    // El sistema no puede responder su solicitud
  '0109',                    // Servicio de autenticación no disponible
  '0110',                    // No se pudo obtener información del tipo de usuario
  '0111',                    // No tiene el perfil (SUNAT a veces lo devuelve por error cuando está caído)
  '0130',                    // No se pudo obtener el ticket de proceso
  '0131',                    // No se pudo grabar el archivo
  '0132',                    // Error al escribir en archivo ZIP
  '0133',                    // No se pudo grabar entrada del log
  '0134',                    // No se pudo grabar en storage
  '0135',                    // No se pudo encolar el pedido
  '0136',                    // No se pudo recibir respuesta del batch
  '0137',                    // Se obtuvo una respuesta nula
  '0138',                    // Error en Base de Datos
  '0200',                    // Ocurrió error en el batch

  // Variantes de código 0109
  'soap-env:Client.0109',
  'Client.0109',

  // Errores de timeout/conexión
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNRESET',
  'ESOCKETTIMEDOUT',
  'timeout',
  'socket hang up',
  'network error',
  'error de conexión',

  // Errores de servicio
  'service unavailable',
  'servicio no disponible',
  'no está disponible',
  'temporarily unavailable',
  'try again later',
  'intente más tarde',
  'intente nuevamente',

  // Errores de QPse cuando SUNAT está caído
  'PENDING_MANUAL',
  'envío automático a SUNAT falló',

  // Errores de política/autenticación que SUNAT devuelve incorrectamente cuando está caído
  'rejected by policy',
  'no tiene el perfil',

  // Errores de documento en proceso (SUNAT lo está procesando)
  'documento igual en proceso',
  'vuelva intentarlo',
  'en proceso',

  // Errores HTTP
  '500', '502', '503', '504', // Server Error, Bad Gateway, Service Unavailable, Gateway Timeout
]

/**
 * Verifica si un error de SUNAT es temporal (permite reintento)
 * @param {string} responseCode - Código de respuesta
 * @param {string} description - Descripción del error
 * @returns {boolean} true si es error temporal
 */
function isTransientSunatError(responseCode, description) {
  const code = String(responseCode || '').toLowerCase()
  const desc = String(description || '').toLowerCase()

  return TRANSIENT_SUNAT_ERRORS.some(err => {
    const errLower = err.toLowerCase()
    return code.includes(errLower) || desc.includes(errLower)
  })
}

/**
 * Cloud Function: Enviar factura/boleta a SUNAT
 *
 * Esta función:
 * 1. Obtiene los datos de la factura de Firestore
 * 2. Obtiene la configuración SUNAT del usuario
 * 3. Genera el XML en formato UBL 2.1
 * 4. Firma el XML con el certificado digital
 * 5. Envía el XML firmado a SUNAT vía SOAP
 * 6. Procesa la respuesta (CDR)
 * 7. Actualiza el estado de la factura en Firestore
 */
export const sendInvoiceToSunat = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
    // Removed invoker: 'public' - la autenticación se maneja con Firebase Auth
  },
  async (req, res) => {
    // Manejar preflight OPTIONS request
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    // Solo aceptar POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Obtener y verificar token de autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado - Token no proporcionado' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      let decodedToken

      try {
        decodedToken = await auth.verifyIdToken(idToken)
      } catch (authError) {
        console.error('❌ Error al verificar token:', authError)
        res.status(401).json({ error: 'Token inválido o expirado' })
        return
      }

      const authenticatedUserId = decodedToken.uid

      // Obtener datos del body
      const { userId, invoiceId } = req.body

      // Validar parámetros
      if (!userId || !invoiceId) {
        res.status(400).json({ error: 'userId e invoiceId son requeridos' })
        return
      }

      // Verificar autorización: debe ser el owner, un usuario secundario del owner, O un admin
      if (authenticatedUserId !== userId) {
        // Primero verificar si es ADMIN (tiene documento en colección 'admins')
        let isAdmin = false
        try {
          const adminDoc = await db.collection('admins').doc(authenticatedUserId).get()
          isAdmin = adminDoc.exists && adminDoc.data()?.isAdmin === true
        } catch (adminError) {
          console.error('Error al verificar admin:', adminError)
        }

        if (isAdmin) {
          console.log(`✅ Admin autorizado: ${authenticatedUserId} operando en nombre de: ${userId}`)
        } else {
          // Si no es admin, verificar si es un sub-usuario del owner
          try {
            const userDoc = await db.collection('users').doc(authenticatedUserId).get()

            if (!userDoc.exists) {
              res.status(403).json({ error: 'Usuario no encontrado' })
              return
            }

            const userData = userDoc.data()

            // Verificar si es un sub-usuario del owner (ownerId coincide con userId)
            if (userData.ownerId !== userId) {
              res.status(403).json({
                error: 'No autorizado para esta operación. Usuario no pertenece a este negocio.'
              })
              return
            }

            // Verificar que el sub-usuario esté activo
            if (!userData.isActive) {
              res.status(403).json({ error: 'Usuario inactivo' })
              return
            }

            console.log(`✅ Sub-usuario autorizado: ${authenticatedUserId} del owner: ${userId}`)
          } catch (error) {
            console.error('Error al verificar sub-usuario:', error)
            res.status(403).json({ error: 'No autorizado para esta operación' })
            return
          }
        }
      }

      console.log(`📤 Iniciando envío a SUNAT - Usuario: ${userId}, Factura: ${invoiceId}`)

      // Verificar flag global de pausa para restaurantes con IGV reducido (solo facturas, boletas se envían normalmente)
      try {
        const invoiceSnap = await db.collection('businesses').doc(userId).collection('invoices').doc(invoiceId).get()
        const docType = invoiceSnap.exists ? invoiceSnap.data()?.documentType : null
        if (docType === 'factura') {
          const adminSettingsDoc = await db.collection('config').doc('adminSettings').get()
          if (adminSettingsDoc.exists) {
            const adminData = adminSettingsDoc.data()
            const pauseSunat = adminData?.system?.pauseSunatRestaurants === true
            const exceptions = adminData?.system?.pauseSunatExceptions || []
            if (pauseSunat && !exceptions.includes(userId)) {
              const businessDoc = await db.collection('businesses').doc(userId).get()
              if (businessDoc.exists) {
                const taxConfig = businessDoc.data()?.emissionConfig?.taxConfig
                const isReducedIgv = taxConfig?.taxType === 'reduced' || taxConfig?.igvRate === 10.5
                if (isReducedIgv) {
                  console.log(`⏸️ Envío de factura pausado por admin para negocio ${userId} (IGV reducido)`)
                  res.status(200).json({
                    success: false,
                    paused: true,
                    message: 'Envío de facturas a SUNAT pausado temporalmente por el administrador para negocios con IGV reducido. El comprobante queda pendiente.'
                  })
                  return
                }
              }
            }
          }
        }
      } catch (pauseCheckError) {
        console.warn('⚠️ Error verificando pausa admin:', pauseCheckError.message)
      }

      // 1. Obtener datos de la factura usando una transacción para prevenir envíos duplicados
      const invoiceRef = db.collection('businesses').doc(userId).collection('invoices').doc(invoiceId)

      // Usar transacción para verificar y marcar como "sending" atómicamente
      // Esto previene condiciones de carrera donde dos envíos concurrentes pasen la validación
      let invoiceData
      try {
        invoiceData = await db.runTransaction(async (transaction) => {
          const invoiceDoc = await transaction.get(invoiceRef)

          if (!invoiceDoc.exists) {
            throw new Error('NOT_FOUND')
          }

          const data = invoiceDoc.data()

          // Validar que sea factura o boleta
          if (data.documentType !== 'factura' && data.documentType !== 'boleta') {
            throw new Error('INVALID_TYPE')
          }

          // Validar estado: rechazar si ya está en proceso de envío
          // Pero permitir reintento si lleva más de 2 minutos (timeout)
          if (data.sunatStatus === 'sending') {
            const sendingStartedAt = data.sunatSendingStartedAt?.toDate?.() || data.sunatSendingStartedAt
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)

            if (sendingStartedAt && sendingStartedAt > twoMinutesAgo) {
              throw new Error('ALREADY_SENDING')
            }
            // Si lleva más de 2 minutos, permitir reintento (el anterior probablemente falló)
            console.log('⚠️ Documento estaba en "sending" por más de 2 min, permitiendo reintento')
          }

          // Validar estado: permitir reenvío si está pendiente, rechazada, firmada o sending (con timeout)
          // 'not_sent' permite el envío manual cuando autoSendToSunat estaba apagado al crear el documento.
          const allowedStatuses = ['pending', 'not_sent', 'rejected', 'signed', 'SIGNED', 'sending']
          if (!allowedStatuses.includes(data.sunatStatus)) {
            throw new Error(`INVALID_STATUS:${data.sunatStatus}`)
          }

          // Marcar como "sending" para prevenir envíos duplicados
          transaction.update(invoiceRef, {
            sunatStatus: 'sending',
            sunatSendingStartedAt: FieldValue.serverTimestamp()
          })

          return data
        })
      } catch (transactionError) {
        if (transactionError.message === 'NOT_FOUND') {
          res.status(404).json({ error: 'Factura no encontrada' })
          return
        }
        if (transactionError.message === 'INVALID_TYPE') {
          res.status(400).json({ error: 'Solo se pueden enviar facturas y boletas a SUNAT' })
          return
        }
        if (transactionError.message === 'ALREADY_SENDING') {
          res.status(409).json({
            error: 'El documento ya está siendo enviado a SUNAT. Por favor espera unos segundos.'
          })
          return
        }
        if (transactionError.message.startsWith('INVALID_STATUS:')) {
          const currentStatus = transactionError.message.split(':')[1]
          res.status(400).json({
            error: `La factura ya fue aceptada por SUNAT. Estado actual: ${currentStatus}`
          })
          return
        }
        throw transactionError
      }

      // Log si es un reenvío
      if (invoiceData.sunatStatus === 'rejected') {
        console.log(`🔄 Reenviando factura rechazada - Intento de corrección`)
      } else if (invoiceData.sunatStatus === 'signed' || invoiceData.sunatStatus === 'SIGNED') {
        console.log(`🔄 Reenviando documento firmado que no llegó a SUNAT`)
      }

      // 2. Obtener configuración SUNAT
      const businessRef = db.collection('businesses').doc(userId)
      const businessDoc = await businessRef.get()

      if (!businessDoc.exists) {
        res.status(404).json({ error: 'Configuración de empresa no encontrada' })
        return
      }

      const businessData = businessDoc.data()

      // Mapear emissionConfig (configurado por super admin) al formato esperado
      if (businessData.emissionConfig) {
        console.log('📋 Usando configuración de emisión del admin')
        const config = businessData.emissionConfig

        if (config.method === 'qpse') {
          businessData.qpse = {
            enabled: config.qpse.enabled !== false,
            usuario: config.qpse.usuario,
            password: config.qpse.password,
            environment: config.qpse.environment || 'demo',
            firmasDisponibles: config.qpse.firmasDisponibles || 0,
            firmasUsadas: config.qpse.firmasUsadas || 0
          }
          businessData.sunat = { enabled: false }
          businessData.nubefact = { enabled: false }
        } else if (config.method === 'sunat_direct') {
          businessData.sunat = {
            enabled: config.sunat.enabled !== false,
            environment: config.sunat.environment || 'beta',
            solUser: config.sunat.solUser,
            solPassword: config.sunat.solPassword,
            certificateName: config.sunat.certificateName,
            certificatePassword: config.sunat.certificatePassword,
            certificateData: config.sunat.certificateData,
            homologated: config.sunat.homologated || false
          }
          businessData.qpse = { enabled: false }
          businessData.nubefact = { enabled: false }
        }
      }

      // Validar que al menos un método esté habilitado (SUNAT directo, QPse o NubeFact)
      const sunatEnabled = businessData.sunat?.enabled === true
      const qpseEnabled = businessData.qpse?.enabled === true
      const nubefactEnabled = businessData.nubefact?.enabled === true

      if (!sunatEnabled && !qpseEnabled && !nubefactEnabled) {
        res.status(400).json({
          error: 'Ningún método de emisión está habilitado. Configura SUNAT directo, QPse o NubeFact en Configuración.'
        })
        return
      }

      console.log(`🏢 Empresa: ${businessData.businessName} - RUC: ${businessData.ruc}`)

      // 2.5. Verificar límite de documentos del plan (solo si no es reenvío)
      if (invoiceData.sunatStatus === 'pending') {
        try {
          const subscriptionRef = db.collection('subscriptions').doc(userId)
          const subscriptionDoc = await subscriptionRef.get()

          if (subscriptionDoc.exists) {
            const subscription = subscriptionDoc.data()
            const currentUsage = subscription.usage?.invoicesThisMonth || 0
            const planLimit = subscription.limits?.maxInvoicesPerMonth || -1
            const bonusInvoices = subscription.bonusInvoices || 0
            // Sumar el bono al límite del plan (si no es ilimitado)
            const maxInvoices = planLimit === -1 ? -1 : planLimit + bonusInvoices

            // Si hay límite (no es -1 = ilimitado) y ya lo alcanzó
            if (maxInvoices !== -1 && currentUsage >= maxInvoices) {
              console.log(`🚫 Límite de documentos alcanzado: ${currentUsage}/${maxInvoices}`)

              await invoiceRef.update({
                sunatStatus: 'rejected',
                sunatResponse: {
                  code: 'LIMIT_EXCEEDED',
                  description: `Límite de ${maxInvoices} comprobantes por mes alcanzado. Actual: ${currentUsage}`,
                  observations: ['Actualiza tu plan para emitir más comprobantes'],
                  error: true,
                  method: 'validation'
                },
                updatedAt: FieldValue.serverTimestamp(),
              })

              res.status(400).json({
                error: `Límite de ${maxInvoices} comprobantes por mes alcanzado`,
                currentUsage,
                maxInvoices,
                message: 'Actualiza tu plan para emitir más comprobantes'
              })
              return
            }

            console.log(`✅ Límite OK: ${currentUsage}/${maxInvoices === -1 ? '∞' : maxInvoices}`)
          }
        } catch (limitError) {
          console.error('⚠️ Error al verificar límite (continuando):', limitError)
          // Continuar con la emisión si falla la verificación del límite
        }
      }

      // 3. Emitir comprobante usando el router (decide automáticamente SUNAT, QPse o NubeFact)
      console.log('📨 Emitiendo comprobante electrónico...')

      const emissionResult = await emitirComprobante(invoiceData, businessData)

      console.log(`✅ Resultado: ${emissionResult.success ? 'ÉXITO' : 'FALLO'}`)
      console.log(`📡 Método usado: ${emissionResult.method}`)

      if (!emissionResult.success) {
        // IMPORTANTE: Verificar si es un error temporal ANTES de marcar como rejected
        const errorMessage = emissionResult.error || emissionResult.description || 'Error al emitir comprobante'
        const errorCode = emissionResult.responseCode || 'ERROR'

        // Verificar si SUNAT dice que el documento ya fue registrado o aceptado (puede venir como SOAP Fault)
        // Esto pasa en reintentos cuando el primer envío sí llegó a SUNAT
        // El código puede venir como "1033" o "soap-env:Client.1033"
        const errorMsgLower = (errorMessage || '').toLowerCase()
        // "con otros datos" también indica que SUNAT ya tiene el documento (reintento con diferencias menores)
        const isAlreadyRegisteredError = (
          errorCode === '1033' || errorCode.includes('1033') ||
          errorMsgLower.includes('registrado previamente') ||
          errorMsgLower.includes('ha sido aceptada') ||
          errorMsgLower.includes('ha sido aceptado'))

        if (isAlreadyRegisteredError) {
          console.log('📋 Documento ya registrado en SUNAT (detectado en error path) - tratando como ACEPTADO')
          console.log(`   Código: ${errorCode}, Mensaje: ${errorMessage}`)

          // Intentar guardar XML y CDR en Storage si están disponibles
          let errXmlStorageUrl = null
          let errCdrStorageUrl = null
          const documentNumber = `${invoiceData.series}-${invoiceData.correlativeNumber}`
          try {
            if (emissionResult.xml) {
              errXmlStorageUrl = await saveToStorage(userId, invoiceId, `${documentNumber}.xml`, emissionResult.xml)
            }
            if (emissionResult.cdrData) {
              errCdrStorageUrl = await saveToStorage(userId, invoiceId, `${documentNumber}-CDR.xml`, emissionResult.cdrData)
            }
          } catch (storageErr) {
            console.error('⚠️ Error guardando archivos en Storage (error path):', storageErr.message)
          }

          // Si no tenemos CDR, intentar recuperarlo via getStatusCdr (solo factura, no boleta)
          if (!emissionResult.cdrData && !errCdrStorageUrl) {
            const docTypeCode = invoiceData.documentType === 'factura' ? '01' : '03'
            if (docTypeCode !== '03') {
              const recovered = await tryRecoverCdr({
                businessData, ruc: businessData.ruc, docTypeCode,
                series: invoiceData.series, number: invoiceData.correlativeNumber,
                businessId: userId, documentId: invoiceId, documentNumber
              })
              if (recovered.cdrData) {
                emissionResult.cdrData = recovered.cdrData
                errCdrStorageUrl = recovered.cdrStorageUrl
              }
            }
          }

          const updateObj = {
            sunatStatus: 'accepted',
            sunatResponse: sanitizeForFirestore(removeUndefined({
              code: errorCode,
              description: errorMessage,
              observations: ['Documento ya existía en SUNAT - aceptado en reintento'],
              method: emissionResult.method,
              cdrData: emissionResult.cdrData,
              xmlStorageUrl: errXmlStorageUrl,
              cdrStorageUrl: errCdrStorageUrl,
            })),
            sunatSendingStartedAt: null,
            sunatSentAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }

          await invoiceRef.update(updateObj)

          res.status(200).json({
            success: true,
            message: 'El documento ya fue aceptado por SUNAT previamente',
            method: emissionResult.method,
            alreadyRegistered: true
          })
          return
        }

        // Verificar si es error temporal (SUNAT caído, timeout, etc.)
        const isTransientError = isTransientSunatError(errorCode, errorMessage)

        if (isTransientError) {
          // Error temporal → mantener como 'pending' para reintento automático
          console.log(`⏳ Error temporal detectado en emisión fallida - manteniendo como 'pending'`)
          console.log(`   Error: ${errorMessage}`)

          await invoiceRef.update({
            sunatStatus: 'pending',
            sunatResponse: {
              code: errorCode,
              description: errorMessage,
              observations: [],
              error: true,
              method: emissionResult.method,
              isTransient: true
            },
            lastRetryError: {
              code: errorCode,
              description: errorMessage,
              timestamp: new Date().toISOString(),
              isTransient: true
            },
            retryCount: FieldValue.increment(1),
            sunatSendingStartedAt: null,
            sunatSentAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })

          res.status(503).json({
            error: errorMessage,
            method: emissionResult.method,
            isTransient: true,
            message: 'Error temporal de SUNAT. El documento se reintentará automáticamente.'
          })
          return
        }

        // Error permanente → marcar como rejected
        await invoiceRef.update({
          sunatStatus: 'rejected',
          sunatResponse: {
            code: errorCode,
            description: errorMessage,
            observations: [],
            error: true,
            method: emissionResult.method
          },
          sunatSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        res.status(500).json({
          error: errorMessage,
          method: emissionResult.method
        })
        return
      }

      // 4. Actualizar estado en Firestore
      // Código 1033 = "El comprobante fue registrado previamente" o "ha sido aceptada"
      // Si SUNAT dice que el documento ya existe, significa que ya fue aceptado antes
      // Esto puede pasar en reintentos o cuando SUNAT tuvo problemas temporales
      const descLower = (emissionResult.description || '').toLowerCase()
      // "con otros datos" también indica que SUNAT ya tiene el documento
      const isAlreadyRegistered = (
        emissionResult.responseCode === '1033' ||
        (emissionResult.responseCode || '').includes('1033') ||
        descLower.includes('registrado previamente') ||
        descLower.includes('ha sido aceptada') ||
        descLower.includes('ha sido aceptado'))

      if (isAlreadyRegistered) {
        // Verificar si este documento tiene historial de envío desde nuestro sistema
        // sunatSentAt existe si alguna vez se intentó enviar (incluyendo reintentos)
        // sunatResponse existe si hubo alguna respuesta previa
        const hasBeenSentBefore = !!(invoiceData.sunatSentAt || invoiceData.sunatResponse || invoiceData.retryCount > 0)

        if (hasBeenSentBefore) {
          // Es un reintento de un documento nuestro → Tratar como aceptado
          console.log('📋 Código 1033: Documento ya registrado en SUNAT - tratando como ACEPTADO')
          console.log('   (El documento ya existe en SUNAT, posiblemente de un envío anterior)')
          emissionResult.accepted = true
        } else {
          // Documento nuevo que nunca enviamos pero ya existe en SUNAT
          // Podría ser numeración duplicada de otro sistema
          console.log('⚠️ Código 1033: Documento nuevo pero ya existe en SUNAT')
          console.log('   Tratando como ACEPTADO (el documento está en SUNAT)')
          // Cambio: También tratar como aceptado porque está en SUNAT
          emissionResult.accepted = true
          emissionResult.notes = emissionResult.notes || []
          if (Array.isArray(emissionResult.notes)) {
            emissionResult.notes.push('Documento ya existía en SUNAT (código 1033)')
          }
        }
      }

      // Determinar el estado final basado en el resultado
      // IMPORTANTE: Los errores temporales de SUNAT NO deben quedar como 'rejected' ni 'signed'
      // sino como 'pending' para permitir reintento automático
      const isPendingManual = emissionResult.pendingManual === true
      const isTransientError = isTransientSunatError(emissionResult.responseCode, emissionResult.description)

      // Validar que existe prueba del CDR antes de marcar como aceptado
      const hasCDRProof = !!(
        emissionResult.cdrData ||           // SUNAT Directo - CDR en respuesta
        emissionResult.cdrUrl ||            // QPSE/NubeFact - URL al CDR
        emissionResult.nubefactResponse?.enlace_del_cdr ||  // NubeFact alternativo
        emissionResult.qpseResponse?.cdrUrl                 // QPse alternativo
      )

      let finalStatus
      if (emissionResult.accepted) {
        // Si no hay CDR, intentar recuperarlo via getStatusCdr (solo factura, no boleta)
        if (!hasCDRProof && emissionResult.method === 'sunat_direct') {
          const docTypeCode = invoiceData.documentType === 'factura' ? '01' : '03'
          if (docTypeCode !== '03') {
            const documentNumber = `${invoiceData.series}-${invoiceData.correlativeNumber}`
            console.log('🔍 Documento aceptado sin CDR - intentando recuperar via getStatusCdr...')
            const recovered = await tryRecoverCdr({
              businessData, ruc: businessData.ruc, docTypeCode,
              series: invoiceData.series, number: invoiceData.correlativeNumber,
              businessId: userId, documentId: invoiceId, documentNumber
            })
            if (recovered.cdrData) {
              emissionResult.cdrData = recovered.cdrData
            }
          }
        }

        // Re-evaluar si ahora tenemos CDR
        const hasCDRProofNow = !!(
          emissionResult.cdrData || emissionResult.cdrUrl ||
          emissionResult.nubefactResponse?.enlace_del_cdr ||
          emissionResult.qpseResponse?.cdrUrl
        )
        if (!hasCDRProofNow) {
          console.warn('⚠️ ALERTA: Documento marcado como aceptado pero SIN CDR')
          console.warn('   Esto podría indicar un problema con el proveedor de facturación')
        }
        finalStatus = 'accepted'
      } else if (isTransientError || isPendingManual) {
        // Error temporal o firmado pero no enviado → mantener como pending para reintento
        finalStatus = 'pending'
        console.log(`⏳ Error temporal detectado - manteniendo como 'pending' para reintento automático`)
        console.log(`   Código: ${emissionResult.responseCode}, Descripción: ${emissionResult.description}`)
      } else {
        // Error permanente de SUNAT (rechazo real)
        finalStatus = 'rejected'
      }

      // Construir sunatResponse sin valores undefined (Firestore no los acepta)
      // Normalizar observations (notes) - puede venir como array, string, o array de objetos
      let observations = []
      if (Array.isArray(emissionResult.notes)) {
        observations = emissionResult.notes.map(note =>
          typeof note === 'string' ? note : JSON.stringify(note)
        )
      } else if (emissionResult.notes) {
        observations = [String(emissionResult.notes)]
      }

      const sunatResponseBase = {
        code: emissionResult.responseCode || '',
        description: emissionResult.description || '',
        observations: observations,
        method: emissionResult.method,
        pendingManual: isPendingManual,
        hasCDRProof: hasCDRProof  // Indica si tenemos prueba del CDR de SUNAT
      }

      // ========== GUARDAR XML Y CDR EN FIREBASE STORAGE ==========
      // Solo guardar si el documento fue aceptado o está pendiente de reintento
      let xmlStorageUrl = null
      let cdrStorageUrl = null

      if (emissionResult.accepted || isPendingManual) {
        const documentNumber = `${invoiceData.series}-${invoiceData.correlativeNumber}`
        console.log(`📁 Guardando XML y CDR para ${documentNumber}...`)

        try {
          // SUNAT DIRECTO: Guardar XML firmado y CDR
          if (emissionResult.method === 'sunat_direct') {
            // Guardar XML firmado
            if (emissionResult.xml) {
              xmlStorageUrl = await saveToStorage(
                userId,
                invoiceId,
                `${documentNumber}.xml`,
                emissionResult.xml
              )
            }
            // Guardar CDR
            if (emissionResult.cdrData) {
              cdrStorageUrl = await saveToStorage(
                userId,
                invoiceId,
                `${documentNumber}-CDR.xml`,
                emissionResult.cdrData
              )
            }
          }

          // QPSE: Descargar XML y CDR desde URLs externas y guardar localmente
          if (emissionResult.method === 'qpse') {
            // DEBUG: Ver qué campos tenemos disponibles
            console.log('🔍 DEBUG QPse - Campos disponibles:', {
              hasXmlUrl: !!emissionResult.xmlUrl,
              hasXmlFirmado: !!emissionResult.xmlFirmado,
              xmlFirmadoLength: emissionResult.xmlFirmado?.length || 0,
              xmlFirmadoPreview: emissionResult.xmlFirmado?.substring(0, 50) || 'N/A'
            })

            // Descargar y guardar XML
            // Prioridad: 1) XML firmado directo (base64) - SIEMPRE disponible, 2) URL externa
            let xmlContent = null

            // PRIMERO intentar usar el XML firmado directo (más confiable)
            if (emissionResult.xmlFirmado) {
              console.log('📄 Usando XML firmado directo de QPse')
              // El XML firmado viene en base64, decodificarlo
              try {
                xmlContent = Buffer.from(emissionResult.xmlFirmado, 'base64').toString('utf-8')
                console.log('✅ XML firmado decodificado de base64 exitosamente, longitud:', xmlContent.length)
              } catch (decodeError) {
                // Si no es base64, podría ser XML directo
                xmlContent = emissionResult.xmlFirmado
                console.log('📄 XML firmado usado directamente (no era base64)')
              }
            }

            // Solo si no tenemos xmlFirmado, intentar descargar de URL
            if (!xmlContent && emissionResult.xmlUrl) {
              console.log('📄 Intentando descargar XML desde URL:', emissionResult.xmlUrl)
              xmlContent = await downloadFromUrl(emissionResult.xmlUrl)
            }

            if (xmlContent) {
              console.log('💾 Guardando XML en Storage...')
              xmlStorageUrl = await saveToStorage(
                userId,
                invoiceId,
                `${documentNumber}.xml`,
                xmlContent
              )
              console.log('✅ XML guardado en Storage:', xmlStorageUrl ? 'OK' : 'FALLÓ')
            } else {
              console.error('❌ No se pudo obtener XML de ninguna fuente')
            }
            // CDR puede venir como URL o como contenido directo (base64/XML)
            if (emissionResult.cdrUrl) {
              const cdrContent = await downloadFromUrl(emissionResult.cdrUrl)
              if (cdrContent) {
                cdrStorageUrl = await saveToStorage(
                  userId,
                  invoiceId,
                  `${documentNumber}-CDR.xml`,
                  cdrContent
                )
              }
            } else if (emissionResult.cdrData) {
              // Si el CDR viene como contenido directo (no URL) - QPse devuelve "cdr" en base64
              console.log('📄 CDR recibido como contenido directo, guardando...')
              cdrStorageUrl = await saveToStorage(userId, invoiceId, `${documentNumber}-CDR.xml`, emissionResult.cdrData)
            }
          }

          // NUBEFACT: Descargar XML y CDR desde URLs externas y guardar localmente
          if (emissionResult.method === 'nubefact') {
            // Descargar y guardar XML
            if (emissionResult.xmlUrl) {
              const xmlContent = await downloadFromUrl(emissionResult.xmlUrl)
              if (xmlContent) {
                xmlStorageUrl = await saveToStorage(
                  userId,
                  invoiceId,
                  `${documentNumber}.xml`,
                  xmlContent
                )
              }
            }
            // Descargar y guardar CDR
            if (emissionResult.cdrUrl) {
              const cdrContent = await downloadFromUrl(emissionResult.cdrUrl)
              if (cdrContent) {
                cdrStorageUrl = await saveToStorage(
                  userId,
                  invoiceId,
                  `${documentNumber}-CDR.xml`,
                  cdrContent
                )
              }
            }
          }

          console.log(`✅ Archivos guardados - XML: ${xmlStorageUrl ? 'OK' : 'NO'}, CDR: ${cdrStorageUrl ? 'OK' : 'NO'}`)
        } catch (storageError) {
          console.error('⚠️ Error guardando archivos en Storage (no crítico):', storageError)
          // Continuar sin fallar la emisión
        }
      }

      // Agregar datos específicos según el método, filtrando undefined y sanitizando
      let methodSpecificData = {}
      if (emissionResult.method === 'nubefact') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          cdrUrl: emissionResult.cdrUrl,
          xmlStorageUrl: xmlStorageUrl,  // URL en Firebase Storage
          cdrStorageUrl: cdrStorageUrl,  // URL en Firebase Storage
          qrCode: emissionResult.qrCode,
          hash: emissionResult.hash,
          enlace: emissionResult.enlace
        }))
      } else if (emissionResult.method === 'qpse') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          cdrUrl: emissionResult.cdrUrl,
          cdrData: emissionResult.cdrData, // CDR como contenido directo (si no hay URL)
          xmlStorageUrl: xmlStorageUrl,  // URL en Firebase Storage
          cdrStorageUrl: cdrStorageUrl,  // URL en Firebase Storage
          ticket: emissionResult.ticket,
          hash: emissionResult.hash,
          nombreArchivo: emissionResult.nombreArchivo
        }))
      } else if (emissionResult.method === 'sunat_direct') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          cdrData: emissionResult.cdrData,
          xmlStorageUrl: xmlStorageUrl,  // URL en Firebase Storage
          cdrStorageUrl: cdrStorageUrl   // URL en Firebase Storage
        }))
      }

      const updateData = {
        sunatStatus: finalStatus,
        sunatResponse: sanitizeForFirestore({
          ...sunatResponseBase,
          ...methodSpecificData
        }),
        sunatSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      // Si es error temporal, agregar información de reintento
      if (isTransientError || isPendingManual) {
        updateData.lastRetryError = sanitizeForFirestore({
          code: emissionResult.responseCode || '',
          description: emissionResult.description || '',
          timestamp: new Date().toISOString(),
          isTransient: true
        })
        updateData.retryCount = FieldValue.increment(1)
        updateData.sunatSendingStartedAt = null // Limpiar para permitir reintento
      }

      await invoiceRef.update(updateData)
      console.log(`💾 Estado actualizado en Firestore: ${finalStatus}`)

      // 5. Incrementar contador de documentos emitidos SOLO si fue ACEPTADO por SUNAT
      if (emissionResult.accepted === true) {
        try {
          const subscriptionRef = db.collection('subscriptions').doc(userId)
          const subscriptionDoc = await subscriptionRef.get()

          if (subscriptionDoc.exists) {
            const subscriptionData = subscriptionDoc.data()

            // Si no tiene el campo usage, inicializarlo primero
            if (!subscriptionData.usage) {
              await subscriptionRef.update({
                usage: {
                  invoicesThisMonth: 1,
                  totalCustomers: 0,
                  totalProducts: 0
                }
              })
              console.log(`📊 Campo usage inicializado y contador en 1 - Usuario: ${userId}`)
            } else {
              // Si ya tiene usage, incrementar normalmente
              await subscriptionRef.update({
                'usage.invoicesThisMonth': FieldValue.increment(1)
              })
              console.log(`📊 Contador de documentos incrementado - Usuario: ${userId}`)
            }
          } else {
            console.warn(`⚠️ No existe suscripción para usuario: ${userId}`)
          }
        } catch (counterError) {
          console.error('⚠️ Error al incrementar contador (no crítico):', counterError)
          // No fallar la operación si el contador falla
        }
      } else {
        console.log(`⏭️ Documento rechazado - No se incrementa el contador`)
      }

      res.status(200).json({
        success: emissionResult.accepted === true || isPendingManual,
        status: finalStatus,
        message: emissionResult.description,
        method: emissionResult.method,
        ...(emissionResult.method === 'nubefact' && {
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          enlace: emissionResult.enlace
        }),
        ...(emissionResult.method === 'qpse' && {
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          cdrUrl: emissionResult.cdrUrl
        })
      })

    } catch (error) {
      console.error('❌ Error general:', error)

      // Intentar revertir el estado "sending" si ocurrió un error inesperado
      try {
        const invoiceRef = db.collection('businesses').doc(req.body.userId).collection('invoices').doc(req.body.invoiceId)
        const currentDoc = await invoiceRef.get()
        if (currentDoc.exists && currentDoc.data().sunatStatus === 'sending') {
          await invoiceRef.update({
            sunatStatus: 'pending', // Revertir a pending para permitir reintento
            sunatResponse: {
              code: 'ERROR',
              description: error.message || 'Error inesperado al procesar el documento',
              observations: ['El envío falló. Puede reintentar.'],
              error: true
            },
            updatedAt: FieldValue.serverTimestamp()
          })
          console.log('🔄 Estado revertido a pending tras error inesperado')
        }
      } catch (revertError) {
        console.error('⚠️ Error al revertir estado:', revertError)
      }

      res.status(500).json({ error: error.message || 'Error al procesar el documento' })
    }
  }
)

// ========================================
// NOTA DE CRÉDITO - Cloud Function independiente
// ========================================

/**
 * Cloud Function: Enviar Nota de Crédito a SUNAT
 *
 * Función INDEPENDIENTE de sendInvoiceToSunat para no afectar
 * el flujo existente de facturas y boletas.
 *
 * Esta función:
 * 1. Obtiene los datos de la nota de crédito de Firestore
 * 2. Obtiene la configuración del usuario (QPse o SUNAT directo)
 * 3. Genera el XML específico para Nota de Crédito (UBL 2.1)
 * 4. Firma y envía a SUNAT
 * 5. Actualiza el estado en Firestore
 */
export const sendCreditNoteToSunat = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (req, res) => {
    // Manejar preflight OPTIONS request
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    // Solo aceptar POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Obtener y verificar token de autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado - Token no proporcionado' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      let decodedToken

      try {
        decodedToken = await auth.verifyIdToken(idToken)
      } catch (authError) {
        console.error('❌ Error al verificar token:', authError)
        res.status(401).json({ error: 'Token inválido o expirado' })
        return
      }

      const authenticatedUserId = decodedToken.uid

      // Obtener datos del body
      const { userId, creditNoteId } = req.body

      // Validar parámetros
      if (!userId || !creditNoteId) {
        res.status(400).json({ error: 'userId y creditNoteId son requeridos' })
        return
      }

      // Verificar autorización: debe ser el owner O un usuario secundario del owner
      if (authenticatedUserId !== userId) {
        try {
          const userDoc = await db.collection('users').doc(authenticatedUserId).get()

          if (!userDoc.exists) {
            res.status(403).json({ error: 'Usuario no encontrado' })
            return
          }

          const userData = userDoc.data()

          if (userData.ownerId !== userId) {
            res.status(403).json({
              error: 'No autorizado para esta operación. Usuario no pertenece a este negocio.'
            })
            return
          }

          if (!userData.isActive) {
            res.status(403).json({ error: 'Usuario inactivo' })
            return
          }

          console.log(`✅ Sub-usuario autorizado: ${authenticatedUserId} del owner: ${userId}`)
        } catch (error) {
          console.error('Error al verificar sub-usuario:', error)
          res.status(403).json({ error: 'No autorizado para esta operación' })
          return
        }
      }

      console.log(`📤 Iniciando envío de NOTA DE CRÉDITO a SUNAT - Usuario: ${userId}, NC: ${creditNoteId}`)

      // Verificar flag global de pausa para restaurantes con IGV reducido (solo NC de facturas, NC de boletas se envían normalmente)
      try {
        const ncSnap = await db.collection('businesses').doc(userId).collection('invoices').doc(creditNoteId).get()
        const refDocType = ncSnap.exists ? ncSnap.data()?.referencedDocumentType : null
        if (refDocType === '01') { // 01=Factura
          const adminSettingsDoc = await db.collection('config').doc('adminSettings').get()
          if (adminSettingsDoc.exists) {
            const adminData = adminSettingsDoc.data()
            const pauseSunat = adminData?.system?.pauseSunatRestaurants === true
            const exceptions = adminData?.system?.pauseSunatExceptions || []
            if (pauseSunat && !exceptions.includes(userId)) {
              const businessDoc = await db.collection('businesses').doc(userId).get()
              if (businessDoc.exists) {
                const taxConfig = businessDoc.data()?.emissionConfig?.taxConfig
                const isReducedIgv = taxConfig?.taxType === 'reduced' || taxConfig?.igvRate === 10.5
                if (isReducedIgv) {
                  console.log(`⏸️ Envío NC de factura pausado por admin para negocio ${userId} (IGV reducido)`)
                  res.status(200).json({ success: false, paused: true, message: 'Envío de notas de crédito de facturas a SUNAT pausado temporalmente por el administrador.' })
                  return
                }
              }
            }
          }
        }
      } catch (pauseCheckError) {
        console.warn('⚠️ Error verificando pausa admin:', pauseCheckError.message)
      }

      // 1. Obtener datos de la nota de crédito usando una transacción para prevenir envíos duplicados
      const creditNoteRef = db.collection('businesses').doc(userId).collection('invoices').doc(creditNoteId)

      // Usar transacción para verificar y marcar como "sending" atómicamente
      let creditNoteData
      try {
        creditNoteData = await db.runTransaction(async (transaction) => {
          const creditNoteDoc = await transaction.get(creditNoteRef)

          if (!creditNoteDoc.exists) {
            throw new Error('NOT_FOUND')
          }

          const data = creditNoteDoc.data()

          // Validar que sea nota de crédito
          if (data.documentType !== 'nota_credito') {
            throw new Error('INVALID_TYPE')
          }

          // Validar estado: rechazar si ya está en proceso de envío
          // Pero permitir reintento si lleva más de 2 minutos (timeout)
          if (data.sunatStatus === 'sending') {
            const sendingStartedAt = data.sunatSendingStartedAt?.toDate?.() || data.sunatSendingStartedAt
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)

            if (sendingStartedAt && sendingStartedAt > twoMinutesAgo) {
              throw new Error('ALREADY_SENDING')
            }
            console.log('⚠️ Documento estaba en "sending" por más de 2 min, permitiendo reintento')
          }

          // Validar estado: permitir envío si está pendiente, rechazada, firmada o sending (con timeout)
          // 'not_sent' permite el envío manual cuando autoSendToSunat estaba apagado al crear el documento.
          const allowedStatuses = ['pending', 'not_sent', 'rejected', 'signed', 'SIGNED', 'sending']
          if (!allowedStatuses.includes(data.sunatStatus)) {
            throw new Error(`INVALID_STATUS:${data.sunatStatus}`)
          }

          // Marcar como "sending" para prevenir envíos duplicados
          transaction.update(creditNoteRef, {
            sunatStatus: 'sending',
            sunatSendingStartedAt: FieldValue.serverTimestamp()
          })

          return data
        })
      } catch (transactionError) {
        if (transactionError.message === 'NOT_FOUND') {
          res.status(404).json({ error: 'Nota de crédito no encontrada' })
          return
        }
        if (transactionError.message === 'INVALID_TYPE') {
          res.status(400).json({ error: 'El documento no es una nota de crédito' })
          return
        }
        if (transactionError.message === 'ALREADY_SENDING') {
          res.status(409).json({
            error: 'La nota de crédito ya está siendo enviada a SUNAT. Por favor espera unos segundos.'
          })
          return
        }
        if (transactionError.message.startsWith('INVALID_STATUS:')) {
          const currentStatus = transactionError.message.split(':')[1]
          res.status(400).json({
            error: `La nota de crédito ya fue aceptada por SUNAT. Estado actual: ${currentStatus}`
          })
          return
        }
        throw transactionError
      }

      // Log si es un reenvío
      if (creditNoteData.sunatStatus === 'rejected') {
        console.log(`🔄 Reenviando nota de crédito rechazada`)
      } else if (creditNoteData.sunatStatus === 'signed' || creditNoteData.sunatStatus === 'SIGNED') {
        console.log(`🔄 Reenviando NC firmada que no llegó a SUNAT`)
      }

      // 2. Obtener configuración del negocio
      const businessRef = db.collection('businesses').doc(userId)
      const businessDoc = await businessRef.get()

      if (!businessDoc.exists) {
        res.status(404).json({ error: 'Configuración de empresa no encontrada' })
        return
      }

      const businessData = businessDoc.data()

      // Mapear emissionConfig (configurado por super admin) al formato esperado
      if (businessData.emissionConfig) {
        console.log('📋 Usando configuración de emisión del admin')
        const config = businessData.emissionConfig

        if (config.method === 'qpse') {
          businessData.qpse = {
            enabled: config.qpse.enabled !== false,
            usuario: config.qpse.usuario,
            password: config.qpse.password,
            environment: config.qpse.environment || 'demo',
            firmasDisponibles: config.qpse.firmasDisponibles || 0,
            firmasUsadas: config.qpse.firmasUsadas || 0
          }
          businessData.sunat = { enabled: false }
          businessData.nubefact = { enabled: false }
        } else if (config.method === 'sunat_direct') {
          businessData.sunat = {
            enabled: config.sunat.enabled !== false,
            environment: config.sunat.environment || 'beta',
            solUser: config.sunat.solUser,
            solPassword: config.sunat.solPassword,
            certificateName: config.sunat.certificateName,
            certificatePassword: config.sunat.certificatePassword,
            certificateData: config.sunat.certificateData,
            homologated: config.sunat.homologated || false
          }
          businessData.qpse = { enabled: false }
          businessData.nubefact = { enabled: false }
        }
      }

      // Validar que al menos un método esté habilitado
      const sunatEnabled = businessData.sunat?.enabled === true
      const qpseEnabled = businessData.qpse?.enabled === true

      if (!sunatEnabled && !qpseEnabled) {
        res.status(400).json({
          error: 'Ningún método de emisión está habilitado. Configura SUNAT directo o QPse.'
        })
        return
      }

      console.log(`🏢 Empresa: ${businessData.businessName} - RUC: ${businessData.ruc}`)

      // 3. Verificar límite de documentos del plan (solo si no es reenvío)
      if (creditNoteData.sunatStatus === 'pending') {
        try {
          const subscriptionRef = db.collection('subscriptions').doc(userId)
          const subscriptionDoc = await subscriptionRef.get()

          if (subscriptionDoc.exists) {
            const subscription = subscriptionDoc.data()
            const currentUsage = subscription.usage?.invoicesThisMonth || 0
            const maxInvoices = subscription.limits?.maxInvoicesPerMonth || -1

            if (maxInvoices !== -1 && currentUsage >= maxInvoices) {
              console.log(`🚫 Límite de documentos alcanzado: ${currentUsage}/${maxInvoices}`)

              await creditNoteRef.update({
                sunatStatus: 'rejected',
                sunatResponse: {
                  code: 'LIMIT_EXCEEDED',
                  description: `Límite de ${maxInvoices} comprobantes por mes alcanzado. Actual: ${currentUsage}`,
                  observations: ['Actualiza tu plan para emitir más comprobantes'],
                  error: true,
                  method: 'validation'
                },
                updatedAt: FieldValue.serverTimestamp(),
              })

              res.status(400).json({
                error: `Límite de ${maxInvoices} comprobantes por mes alcanzado`,
                currentUsage,
                maxInvoices,
                message: 'Actualiza tu plan para emitir más comprobantes'
              })
              return
            }

            console.log(`✅ Límite OK: ${currentUsage}/${maxInvoices === -1 ? '∞' : maxInvoices}`)
          }
        } catch (limitError) {
          console.error('⚠️ Error al verificar límite (continuando):', limitError)
        }
      }

      // 4. Emitir nota de crédito usando la función específica
      console.log('📨 Emitiendo Nota de Crédito electrónica...')

      const emissionResult = await emitirNotaCredito(creditNoteData, businessData)

      console.log(`✅ Resultado: ${emissionResult.success ? 'ÉXITO' : 'FALLO'}`)
      console.log(`📡 Método usado: ${emissionResult.method}`)

      if (!emissionResult.success) {
        const ncErrorMessage = emissionResult.error || emissionResult.description || 'Error al emitir nota de crédito'
        const ncErrorCode = emissionResult.responseCode || 'ERROR'

        // Verificar si SUNAT dice que ya fue registrada o aceptada (puede venir como SOAP Fault en reintentos)
        // IMPORTANTE: "con otros datos" = conflicto de datos, NO es aceptación
        const ncMsgLower = (ncErrorMessage || '').toLowerCase()
        // "con otros datos" también indica que SUNAT ya tiene el documento
        const ncAlreadyRegistered = (
          ncErrorCode === '1033' || (ncErrorCode || '').includes('1033') ||
          ncMsgLower.includes('registrado previamente') ||
          ncMsgLower.includes('ha sido aceptada') ||
          ncMsgLower.includes('ha sido aceptado'))

        if (ncAlreadyRegistered) {
          console.log('📋 NC ya registrada en SUNAT (detectado en error path) - tratando como ACEPTADA')

          // Intentar guardar XML y CDR en Storage si están disponibles
          let errXmlStorageUrl = null
          let errCdrStorageUrl = null
          const documentNumber = `${creditNoteData.series}-${creditNoteData.correlativeNumber}`
          try {
            if (emissionResult.xml) {
              errXmlStorageUrl = await saveToStorage(userId, creditNoteId, `${documentNumber}.xml`, emissionResult.xml)
            }
            if (emissionResult.cdrData) {
              errCdrStorageUrl = await saveToStorage(userId, creditNoteId, `${documentNumber}-CDR.xml`, emissionResult.cdrData)
            }
          } catch (storageErr) {
            console.error('⚠️ Error guardando archivos NC en Storage (error path):', storageErr.message)
          }

          // Si no tenemos CDR, intentar recuperarlo via getStatusCdr (NC = tipo 07)
          if (!emissionResult.cdrData && !errCdrStorageUrl) {
            const recovered = await tryRecoverCdr({
              businessData, ruc: businessData.ruc, docTypeCode: '07',
              series: creditNoteData.series, number: creditNoteData.correlativeNumber,
              businessId: userId, documentId: creditNoteId, documentNumber
            })
            if (recovered.cdrData) {
              emissionResult.cdrData = recovered.cdrData
              errCdrStorageUrl = recovered.cdrStorageUrl
            }
          }

          await creditNoteRef.update({
            sunatStatus: 'accepted',
            sunatResponse: sanitizeForFirestore(removeUndefined({
              code: ncErrorCode,
              description: ncErrorMessage,
              observations: ['Documento ya existía en SUNAT - aceptado en reintento'],
              method: emissionResult.method,
              cdrData: emissionResult.cdrData,
              xmlStorageUrl: errXmlStorageUrl,
              cdrStorageUrl: errCdrStorageUrl,
            })),
            sunatSendingStartedAt: null,
            sunatSentAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })

          res.status(200).json({
            success: true,
            message: 'La nota de crédito ya fue aceptada por SUNAT previamente',
            method: emissionResult.method,
            alreadyRegistered: true
          })
          return
        }

        // Actualizar NC con error
        await creditNoteRef.update({
          sunatStatus: 'rejected',
          sunatResponse: {
            code: ncErrorCode,
            description: ncErrorMessage,
            observations: [],
            error: true,
            method: emissionResult.method
          },
          sunatSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        res.status(500).json({
          error: ncErrorMessage,
          method: emissionResult.method
        })
        return
      }

      // 5. Actualizar estado en Firestore
      // Código 1033 = "El comprobante fue registrado previamente" o "ha sido aceptada"
      // IMPORTANTE: "con otros datos" = conflicto de datos, NO es aceptación
      const ncDescLower = (emissionResult.description || '').toLowerCase()
      // "con otros datos" también indica que SUNAT ya tiene el documento
      const isAlreadyRegistered = (
        emissionResult.responseCode === '1033' ||
        (emissionResult.responseCode || '').includes('1033') ||
        ncDescLower.includes('registrado previamente') ||
        ncDescLower.includes('ha sido aceptada') ||
        ncDescLower.includes('ha sido aceptado'))

      if (isAlreadyRegistered) {
        // Si el documento está en estado pending, signed, rejected o sending,
        // significa que lo estamos reenviando desde nuestra app
        const allowedStatuses = ['pending', 'not_sent', 'signed', 'rejected', 'sending']
        const isOurDocument = allowedStatuses.includes(creditNoteData.sunatStatus)

        if (isOurDocument) {
          // Es un reintento de un documento nuestro → Tratar como aceptado
          console.log('📋 Código 1033: NC ya registrada en SUNAT - tratando como aceptada')
          emissionResult.accepted = true
          emissionResult.description = 'Nota de Crédito aceptada por SUNAT (registrada previamente)'
        } else {
          // El documento ya estaba aceptado, no debería llegar aquí
          console.log('⚠️ Código 1033: Documento ya estaba en estado:', creditNoteData.sunatStatus)
          emissionResult.accepted = true
        }
      }

      const isPendingManual = emissionResult.pendingManual === true
      const finalStatus = isPendingManual ? 'signed' : (emissionResult.accepted ? 'accepted' : 'rejected')

      // Normalizar observations
      let observations = []
      if (Array.isArray(emissionResult.notes)) {
        observations = emissionResult.notes.map(note =>
          typeof note === 'string' ? note : JSON.stringify(note)
        )
      } else if (emissionResult.notes) {
        observations = [String(emissionResult.notes)]
      }

      const sunatResponseBase = {
        code: emissionResult.responseCode || '',
        description: emissionResult.description || '',
        observations: observations,
        method: emissionResult.method,
        pendingManual: isPendingManual
      }

      // ========== GUARDAR XML Y CDR EN FIREBASE STORAGE (NOTAS DE CRÉDITO) ==========
      let xmlStorageUrl = null
      let cdrStorageUrl = null

      if (emissionResult.accepted || isPendingManual) {
        const documentNumber = `${creditNoteData.series}-${creditNoteData.correlativeNumber}`
        console.log(`📁 Guardando XML y CDR de NC para ${documentNumber}...`)

        try {
          if (emissionResult.method === 'sunat_direct') {
            if (emissionResult.xml) {
              xmlStorageUrl = await saveToStorage(
                userId,
                creditNoteId,
                `${documentNumber}.xml`,
                emissionResult.xml
              )
            }
            if (emissionResult.cdrData) {
              cdrStorageUrl = await saveToStorage(
                userId,
                creditNoteId,
                `${documentNumber}-CDR.xml`,
                emissionResult.cdrData
              )
            }
            // Si no hay CDR, intentar recuperarlo via getStatusCdr (NC = tipo 07)
            if (!emissionResult.cdrData && !cdrStorageUrl && emissionResult.accepted) {
              const recovered = await tryRecoverCdr({
                businessData, ruc: businessData.ruc, docTypeCode: '07',
                series: creditNoteData.series, number: creditNoteData.correlativeNumber,
                businessId: userId, documentId: creditNoteId, documentNumber
              })
              if (recovered.cdrData) {
                emissionResult.cdrData = recovered.cdrData
                cdrStorageUrl = recovered.cdrStorageUrl
              }
            }
          }

          if (emissionResult.method === 'qpse') {
            if (emissionResult.xmlUrl) {
              const xmlContent = await downloadFromUrl(emissionResult.xmlUrl)
              if (xmlContent) {
                xmlStorageUrl = await saveToStorage(userId, creditNoteId, `${documentNumber}.xml`, xmlContent)
              }
            }
            // CDR puede venir como URL o como contenido directo (base64/XML)
            if (emissionResult.cdrUrl) {
              const cdrContent = await downloadFromUrl(emissionResult.cdrUrl)
              if (cdrContent) {
                cdrStorageUrl = await saveToStorage(userId, creditNoteId, `${documentNumber}-CDR.xml`, cdrContent)
              }
            } else if (emissionResult.cdrData) {
              // Si el CDR viene como contenido directo (no URL)
              console.log('📄 CDR recibido como contenido directo, guardando...')
              cdrStorageUrl = await saveToStorage(userId, creditNoteId, `${documentNumber}-CDR.xml`, emissionResult.cdrData)
            }
          }

          console.log(`✅ Archivos NC guardados - XML: ${xmlStorageUrl ? 'OK' : 'NO'}, CDR: ${cdrStorageUrl ? 'OK' : 'NO'}`)
        } catch (storageError) {
          console.error('⚠️ Error guardando archivos NC en Storage:', storageError)
        }
      }

      // Agregar datos específicos según el método
      let methodSpecificData = {}
      if (emissionResult.method === 'qpse') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          cdrUrl: emissionResult.cdrUrl,
          cdrData: emissionResult.cdrData, // CDR como contenido directo (si no hay URL)
          xmlStorageUrl: xmlStorageUrl,
          cdrStorageUrl: cdrStorageUrl,
          ticket: emissionResult.ticket,
          hash: emissionResult.hash,
          nombreArchivo: emissionResult.nombreArchivo
        }))
      } else if (emissionResult.method === 'sunat_direct') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          cdrData: emissionResult.cdrData,
          xmlStorageUrl: xmlStorageUrl,
          cdrStorageUrl: cdrStorageUrl
        }))
      }

      const updateData = {
        sunatStatus: finalStatus,
        sunatResponse: sanitizeForFirestore({
          ...sunatResponseBase,
          ...methodSpecificData
        }),
        sunatSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      // Si fue aceptada, cambiar status a 'applied' (no 'pending')
      if (emissionResult.accepted === true) {
        updateData.status = 'applied'
      }

      await creditNoteRef.update(updateData)
      console.log(`💾 Estado de NC actualizado en Firestore`)

      // 6. Incrementar contador de documentos emitidos SOLO si fue ACEPTADO
      if (emissionResult.accepted === true) {
        try {
          const subscriptionRef = db.collection('subscriptions').doc(userId)
          const subscriptionDoc = await subscriptionRef.get()

          if (subscriptionDoc.exists) {
            const subscriptionData = subscriptionDoc.data()

            // Si no tiene el campo usage, inicializarlo primero
            if (!subscriptionData.usage) {
              await subscriptionRef.update({
                usage: {
                  invoicesThisMonth: 1,
                  totalCustomers: 0,
                  totalProducts: 0
                }
              })
              console.log(`📊 Campo usage inicializado y contador en 1 - Usuario: ${userId}`)
            } else {
              // Si ya tiene usage, incrementar normalmente
              await subscriptionRef.update({
                'usage.invoicesThisMonth': FieldValue.increment(1)
              })
              console.log(`📊 Contador de documentos incrementado - Usuario: ${userId}`)
            }
          } else {
            console.warn(`⚠️ No existe suscripción para usuario: ${userId}`)
          }
        } catch (counterError) {
          console.error('⚠️ Error al incrementar contador (no crítico):', counterError)
        }

        // 7. Actualizar el documento original (boleta/factura) como anulado o con devolución parcial
        try {
          // Buscar el documento original por su número (referencedDocumentId)
          const referencedDocId = creditNoteData.referencedDocumentId // Ej: "B001-00000001"
          const referencedFirestoreId = creditNoteData.referencedInvoiceFirestoreId // ID de Firestore

          if (referencedFirestoreId) {
            const originalDocRef = db.collection('businesses').doc(userId).collection('invoices').doc(referencedFirestoreId)
            const originalDoc = await originalDocRef.get()

            if (originalDoc.exists) {
              const originalData = originalDoc.data()
              const originalTotal = originalData.total || 0
              const ncTotal = creditNoteData.total || 0

              // Determinar si es anulación total o parcial
              // Tolerancia de 0.01 para errores de redondeo
              const isFullCancellation = Math.abs(originalTotal - ncTotal) < 0.01

              const newStatus = isFullCancellation ? 'cancelled' : 'partial_refund'

              await originalDocRef.update({
                status: newStatus,
                creditNoteId: creditNoteId,
                creditNoteNumber: creditNoteData.number,
                creditNoteTotal: ncTotal,
                updatedAt: FieldValue.serverTimestamp()
              })

              console.log(`📝 Documento original ${referencedDocId} actualizado a '${newStatus}'`)
            } else {
              console.log(`⚠️ No se encontró el documento original con ID: ${referencedFirestoreId}`)
            }
          } else {
            console.log(`⚠️ No hay referencedInvoiceFirestoreId en la NC`)
          }
        } catch (updateOriginalError) {
          console.error('⚠️ Error al actualizar documento original (no crítico):', updateOriginalError)
          // No fallar la operación si esto falla
        }
      } else {
        console.log(`⏭️ NC rechazada - No se incrementa el contador`)
      }

      res.status(200).json({
        success: emissionResult.accepted === true || isPendingManual,
        status: finalStatus,
        message: emissionResult.description,
        method: emissionResult.method,
        ...(emissionResult.method === 'qpse' && {
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          cdrUrl: emissionResult.cdrUrl
        })
      })

    } catch (error) {
      console.error('❌ Error general:', error)

      // Intentar revertir el estado "sending" si ocurrió un error inesperado
      try {
        const creditNoteRef = db.collection('businesses').doc(req.body.userId).collection('invoices').doc(req.body.creditNoteId)
        const currentDoc = await creditNoteRef.get()
        if (currentDoc.exists && currentDoc.data().sunatStatus === 'sending') {
          await creditNoteRef.update({
            sunatStatus: 'pending', // Revertir a pending para permitir reintento
            sunatResponse: {
              code: 'ERROR',
              description: error.message || 'Error inesperado al procesar la nota de crédito',
              observations: ['El envío falló. Puede reintentar.'],
              error: true
            },
            updatedAt: FieldValue.serverTimestamp()
          })
          console.log('🔄 Estado de NC revertido a pending tras error inesperado')
        }
      } catch (revertError) {
        console.error('⚠️ Error al revertir estado de NC:', revertError)
      }

      res.status(500).json({ error: error.message || 'Error al procesar la nota de crédito' })
    }
  }
)

/**
 * Cloud Function: Enviar Nota de Débito a SUNAT
 *
 * Función INDEPENDIENTE para emitir Notas de Débito electrónicas.
 *
 * Esta función:
 * 1. Obtiene los datos de la nota de débito de Firestore
 * 2. Obtiene la configuración del usuario (QPse o SUNAT directo)
 * 3. Genera el XML específico para Nota de Débito (UBL 2.1)
 * 4. Firma y envía a SUNAT
 * 5. Actualiza el estado en Firestore
 */
export const sendDebitNoteToSunat = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
    // Removed invoker: 'public' - autenticación se maneja con Firebase Auth token
  },
  async (req, res) => {
    // Manejar preflight OPTIONS request
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    // Solo aceptar POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Obtener y verificar token de autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado - Token no proporcionado' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      let decodedToken

      try {
        decodedToken = await auth.verifyIdToken(idToken)
      } catch (authError) {
        console.error('❌ Error al verificar token:', authError)
        res.status(401).json({ error: 'Token inválido o expirado' })
        return
      }

      const authenticatedUserId = decodedToken.uid

      // Obtener datos del body
      const { userId, debitNoteId } = req.body

      // Validar parámetros
      if (!userId || !debitNoteId) {
        res.status(400).json({ error: 'userId y debitNoteId son requeridos' })
        return
      }

      // Verificar autorización: debe ser el owner O un usuario secundario del owner
      if (authenticatedUserId !== userId) {
        try {
          const userDoc = await db.collection('users').doc(authenticatedUserId).get()

          if (!userDoc.exists) {
            res.status(403).json({ error: 'Usuario no encontrado' })
            return
          }

          const userData = userDoc.data()

          if (userData.ownerId !== userId) {
            res.status(403).json({
              error: 'No autorizado para esta operación. Usuario no pertenece a este negocio.'
            })
            return
          }

          if (!userData.isActive) {
            res.status(403).json({ error: 'Usuario inactivo' })
            return
          }

          console.log(`✅ Sub-usuario autorizado: ${authenticatedUserId} del owner: ${userId}`)
        } catch (error) {
          console.error('Error al verificar sub-usuario:', error)
          res.status(403).json({ error: 'No autorizado para esta operación' })
          return
        }
      }

      console.log(`📤 Iniciando envío de NOTA DE DÉBITO a SUNAT - Usuario: ${userId}, ND: ${debitNoteId}`)

      // Verificar flag global de pausa para restaurantes con IGV reducido (solo ND de facturas, ND de boletas se envían normalmente)
      try {
        const ndSnap = await db.collection('businesses').doc(userId).collection('invoices').doc(debitNoteId).get()
        const refDocType = ndSnap.exists ? ndSnap.data()?.referencedDocumentType : null
        if (refDocType === '01') { // 01=Factura
          const adminSettingsDoc = await db.collection('config').doc('adminSettings').get()
          if (adminSettingsDoc.exists) {
            const adminData = adminSettingsDoc.data()
            const pauseSunat = adminData?.system?.pauseSunatRestaurants === true
            const exceptions = adminData?.system?.pauseSunatExceptions || []
            if (pauseSunat && !exceptions.includes(userId)) {
              const businessDoc = await db.collection('businesses').doc(userId).get()
              if (businessDoc.exists) {
                const taxConfig = businessDoc.data()?.emissionConfig?.taxConfig
                const isReducedIgv = taxConfig?.taxType === 'reduced' || taxConfig?.igvRate === 10.5
                if (isReducedIgv) {
                  console.log(`⏸️ Envío ND de factura pausado por admin para negocio ${userId} (IGV reducido)`)
                  res.status(200).json({ success: false, paused: true, message: 'Envío de notas de débito de facturas a SUNAT pausado temporalmente por el administrador.' })
                  return
                }
              }
            }
          }
        }
      } catch (pauseCheckError) {
        console.warn('⚠️ Error verificando pausa admin:', pauseCheckError.message)
      }

      // 1. Obtener datos de la nota de débito usando una transacción para prevenir envíos duplicados
      const debitNoteRef = db.collection('businesses').doc(userId).collection('invoices').doc(debitNoteId)

      // Usar transacción para verificar y marcar como "sending" atómicamente
      let debitNoteData
      try {
        debitNoteData = await db.runTransaction(async (transaction) => {
          const debitNoteDoc = await transaction.get(debitNoteRef)

          if (!debitNoteDoc.exists) {
            throw new Error('NOT_FOUND')
          }

          const data = debitNoteDoc.data()

          // Validar que sea nota de débito
          if (data.documentType !== 'nota_debito') {
            throw new Error('INVALID_TYPE')
          }

          // Validar estado: rechazar si ya está en proceso de envío
          // Pero permitir reintento si lleva más de 2 minutos (timeout)
          if (data.sunatStatus === 'sending') {
            const sendingStartedAt = data.sunatSendingStartedAt?.toDate?.() || data.sunatSendingStartedAt
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)

            if (sendingStartedAt && sendingStartedAt > twoMinutesAgo) {
              throw new Error('ALREADY_SENDING')
            }
            console.log('⚠️ Documento estaba en "sending" por más de 2 min, permitiendo reintento')
          }

          // Validar estado: permitir envío si está pendiente, rechazada, firmada o sending (con timeout)
          // 'not_sent' permite el envío manual cuando autoSendToSunat estaba apagado al crear el documento.
          const allowedStatuses = ['pending', 'not_sent', 'rejected', 'signed', 'SIGNED', 'sending']
          if (!allowedStatuses.includes(data.sunatStatus)) {
            throw new Error(`INVALID_STATUS:${data.sunatStatus}`)
          }

          // Marcar como "sending" para prevenir envíos duplicados
          transaction.update(debitNoteRef, {
            sunatStatus: 'sending',
            sunatSendingStartedAt: FieldValue.serverTimestamp()
          })

          return data
        })
      } catch (transactionError) {
        if (transactionError.message === 'NOT_FOUND') {
          res.status(404).json({ error: 'Nota de débito no encontrada' })
          return
        }
        if (transactionError.message === 'INVALID_TYPE') {
          res.status(400).json({ error: 'El documento no es una nota de débito' })
          return
        }
        if (transactionError.message === 'ALREADY_SENDING') {
          res.status(409).json({
            error: 'La nota de débito ya está siendo enviada a SUNAT. Por favor espera unos segundos.'
          })
          return
        }
        if (transactionError.message.startsWith('INVALID_STATUS:')) {
          const currentStatus = transactionError.message.split(':')[1]
          res.status(400).json({
            error: `La nota de débito ya fue procesada por SUNAT. Estado actual: ${currentStatus}`
          })
          return
        }
        throw transactionError
      }

      // Log si es un reenvío
      if (debitNoteData.sunatStatus === 'rejected') {
        console.log(`🔄 Reenviando nota de débito rechazada`)
      } else if (debitNoteData.sunatStatus === 'signed' || debitNoteData.sunatStatus === 'SIGNED') {
        console.log(`🔄 Reenviando ND firmada que no llegó a SUNAT`)
      }

      // 2. Obtener configuración del negocio
      const businessRef = db.collection('businesses').doc(userId)
      const businessDoc = await businessRef.get()

      if (!businessDoc.exists) {
        res.status(404).json({ error: 'Configuración de empresa no encontrada' })
        return
      }

      const businessData = businessDoc.data()

      // Mapear emissionConfig (configurado por super admin) al formato esperado
      if (businessData.emissionConfig) {
        console.log('📋 Usando configuración de emisión del admin')
        const config = businessData.emissionConfig

        if (config.method === 'qpse') {
          businessData.qpse = {
            enabled: config.qpse.enabled !== false,
            usuario: config.qpse.usuario,
            password: config.qpse.password,
            environment: config.qpse.environment || 'demo',
            firmasDisponibles: config.qpse.firmasDisponibles || 0,
            firmasUsadas: config.qpse.firmasUsadas || 0
          }
          businessData.sunat = { enabled: false }
          businessData.nubefact = { enabled: false }
        } else if (config.method === 'sunat_direct') {
          businessData.sunat = {
            enabled: config.sunat.enabled !== false,
            environment: config.sunat.environment || 'beta',
            solUser: config.sunat.solUser,
            solPassword: config.sunat.solPassword,
            certificateName: config.sunat.certificateName,
            certificatePassword: config.sunat.certificatePassword,
            certificateData: config.sunat.certificateData,
            homologated: config.sunat.homologated || false
          }
          businessData.qpse = { enabled: false }
          businessData.nubefact = { enabled: false }
        }
      }

      // Validar que al menos un método esté habilitado
      const sunatEnabled = businessData.sunat?.enabled === true
      const qpseEnabled = businessData.qpse?.enabled === true

      if (!sunatEnabled && !qpseEnabled) {
        res.status(400).json({
          error: 'Ningún método de emisión está habilitado. Configura SUNAT directo o QPse.'
        })
        return
      }

      console.log(`🏢 Empresa: ${businessData.businessName} - RUC: ${businessData.ruc}`)

      // 3. Verificar límite de documentos del plan (solo si no es reenvío)
      if (debitNoteData.sunatStatus === 'pending') {
        try {
          const subscriptionRef = db.collection('subscriptions').doc(userId)
          const subscriptionDoc = await subscriptionRef.get()

          if (subscriptionDoc.exists) {
            const subscription = subscriptionDoc.data()
            const currentUsage = subscription.usage?.invoicesThisMonth || 0
            const maxInvoices = subscription.limits?.maxInvoicesPerMonth || -1

            if (maxInvoices !== -1 && currentUsage >= maxInvoices) {
              console.log(`🚫 Límite de documentos alcanzado: ${currentUsage}/${maxInvoices}`)

              await debitNoteRef.update({
                sunatStatus: 'rejected',
                sunatResponse: {
                  code: 'LIMIT_EXCEEDED',
                  description: `Límite de ${maxInvoices} comprobantes por mes alcanzado. Actual: ${currentUsage}`,
                  observations: ['Actualiza tu plan para emitir más comprobantes'],
                  error: true,
                  method: 'validation'
                },
                updatedAt: FieldValue.serverTimestamp(),
              })

              res.status(400).json({
                error: `Límite de ${maxInvoices} comprobantes por mes alcanzado`,
                currentUsage,
                maxInvoices,
                message: 'Actualiza tu plan para emitir más comprobantes'
              })
              return
            }

            console.log(`✅ Límite OK: ${currentUsage}/${maxInvoices === -1 ? '∞' : maxInvoices}`)
          }
        } catch (limitError) {
          console.error('⚠️ Error al verificar límite (continuando):', limitError)
        }
      }

      // 4. Emitir nota de débito usando la función específica
      console.log('📨 Emitiendo Nota de Débito electrónica...')

      const emissionResult = await emitirNotaDebito(debitNoteData, businessData)

      console.log(`✅ Resultado: ${emissionResult.success ? 'ÉXITO' : 'FALLO'}`)
      console.log(`📡 Método usado: ${emissionResult.method}`)

      if (!emissionResult.success) {
        const ndErrorMessage = emissionResult.error || emissionResult.description || 'Error al emitir nota de débito'
        const ndErrorCode = emissionResult.responseCode || 'ERROR'

        // Verificar si SUNAT dice que ya fue registrada o aceptada (puede venir como SOAP Fault en reintentos)
        // IMPORTANTE: "con otros datos" = conflicto de datos, NO es aceptación
        const ndMsgLower = (ndErrorMessage || '').toLowerCase()
        // "con otros datos" también indica que SUNAT ya tiene el documento
        const ndAlreadyRegistered = (
          ndErrorCode === '1033' || (ndErrorCode || '').includes('1033') ||
          ndMsgLower.includes('registrado previamente') ||
          ndMsgLower.includes('ha sido aceptada') ||
          ndMsgLower.includes('ha sido aceptado'))

        if (ndAlreadyRegistered) {
          console.log('📋 ND ya registrada en SUNAT (detectado en error path) - tratando como ACEPTADA')

          // Intentar guardar XML y CDR en Storage si están disponibles
          let errXmlStorageUrl = null
          let errCdrStorageUrl = null
          const documentNumber = `${debitNoteData.series}-${debitNoteData.correlativeNumber}`
          try {
            if (emissionResult.xml) {
              errXmlStorageUrl = await saveToStorage(userId, debitNoteId, `${documentNumber}.xml`, emissionResult.xml)
            }
            if (emissionResult.cdrData) {
              errCdrStorageUrl = await saveToStorage(userId, debitNoteId, `${documentNumber}-CDR.xml`, emissionResult.cdrData)
            }
          } catch (storageErr) {
            console.error('⚠️ Error guardando archivos ND en Storage (error path):', storageErr.message)
          }

          // Si no tenemos CDR, intentar recuperarlo via getStatusCdr (ND = tipo 08)
          if (!emissionResult.cdrData && !errCdrStorageUrl) {
            const recovered = await tryRecoverCdr({
              businessData, ruc: businessData.ruc, docTypeCode: '08',
              series: debitNoteData.series, number: debitNoteData.correlativeNumber,
              businessId: userId, documentId: debitNoteId, documentNumber
            })
            if (recovered.cdrData) {
              emissionResult.cdrData = recovered.cdrData
              errCdrStorageUrl = recovered.cdrStorageUrl
            }
          }

          await debitNoteRef.update({
            sunatStatus: 'accepted',
            sunatResponse: sanitizeForFirestore(removeUndefined({
              code: ndErrorCode,
              description: ndErrorMessage,
              observations: ['Documento ya existía en SUNAT - aceptado en reintento'],
              method: emissionResult.method,
              cdrData: emissionResult.cdrData,
              xmlStorageUrl: errXmlStorageUrl,
              cdrStorageUrl: errCdrStorageUrl,
            })),
            sunatSendingStartedAt: null,
            sunatSentAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })

          res.status(200).json({
            success: true,
            message: 'La nota de débito ya fue aceptada por SUNAT previamente',
            method: emissionResult.method,
            alreadyRegistered: true
          })
          return
        }

        // Actualizar ND con error
        await debitNoteRef.update({
          sunatStatus: 'rejected',
          sunatResponse: {
            code: ndErrorCode,
            description: ndErrorMessage,
            observations: [],
            error: true,
            method: emissionResult.method
          },
          sunatSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        res.status(500).json({
          error: ndErrorMessage,
          method: emissionResult.method
        })
        return
      }

      // 5. Actualizar estado en Firestore
      // Código 1033 = "El comprobante fue registrado previamente" o "ha sido aceptada"
      // IMPORTANTE: "con otros datos" = conflicto de datos, NO es aceptación
      const ndDescLower = (emissionResult.description || '').toLowerCase()
      // "con otros datos" también indica que SUNAT ya tiene el documento
      const isAlreadyRegistered = (
        emissionResult.responseCode === '1033' ||
        (emissionResult.responseCode || '').includes('1033') ||
        ndDescLower.includes('registrado previamente') ||
        ndDescLower.includes('ha sido aceptada') ||
        ndDescLower.includes('ha sido aceptado'))

      if (isAlreadyRegistered) {
        const allowedStatuses = ['pending', 'not_sent', 'signed', 'rejected', 'sending']
        const isOurDocument = allowedStatuses.includes(debitNoteData.sunatStatus)

        if (isOurDocument) {
          console.log('📋 Código 1033: ND ya registrada en SUNAT - tratando como aceptada')
          emissionResult.accepted = true
          emissionResult.description = 'Nota de Débito aceptada por SUNAT (registrada previamente)'
        } else {
          console.log('⚠️ Código 1033: Documento ya estaba en estado:', debitNoteData.sunatStatus)
          emissionResult.accepted = true
        }
      }

      const isPendingManual = emissionResult.pendingManual === true
      const finalStatus = isPendingManual ? 'signed' : (emissionResult.accepted ? 'accepted' : 'rejected')

      // Normalizar observations
      let observations = []
      if (Array.isArray(emissionResult.notes)) {
        observations = emissionResult.notes.map(note =>
          typeof note === 'string' ? note : JSON.stringify(note)
        )
      } else if (emissionResult.notes) {
        observations = [String(emissionResult.notes)]
      }

      const sunatResponseBase = {
        code: emissionResult.responseCode || '',
        description: emissionResult.description || '',
        observations: observations,
        method: emissionResult.method,
        pendingManual: isPendingManual
      }

      // ========== GUARDAR XML Y CDR EN FIREBASE STORAGE (NOTAS DE DÉBITO) ==========
      let xmlStorageUrl = null
      let cdrStorageUrl = null

      if (emissionResult.accepted || isPendingManual) {
        const documentNumber = `${debitNoteData.series}-${debitNoteData.correlativeNumber}`
        console.log(`📁 Guardando XML y CDR de ND para ${documentNumber}...`)

        try {
          if (emissionResult.method === 'sunat_direct') {
            if (emissionResult.xml) {
              xmlStorageUrl = await saveToStorage(
                userId,
                debitNoteId,
                `${documentNumber}.xml`,
                emissionResult.xml
              )
            }
            if (emissionResult.cdrData) {
              cdrStorageUrl = await saveToStorage(
                userId,
                debitNoteId,
                `${documentNumber}-CDR.xml`,
                emissionResult.cdrData
              )
            }
            // Si no hay CDR, intentar recuperarlo via getStatusCdr (ND = tipo 08)
            if (!emissionResult.cdrData && !cdrStorageUrl && emissionResult.accepted) {
              const recovered = await tryRecoverCdr({
                businessData, ruc: businessData.ruc, docTypeCode: '08',
                series: debitNoteData.series, number: debitNoteData.correlativeNumber,
                businessId: userId, documentId: debitNoteId, documentNumber
              })
              if (recovered.cdrData) {
                emissionResult.cdrData = recovered.cdrData
                cdrStorageUrl = recovered.cdrStorageUrl
              }
            }
          }

          if (emissionResult.method === 'qpse') {
            if (emissionResult.xmlUrl) {
              const xmlContent = await downloadFromUrl(emissionResult.xmlUrl)
              if (xmlContent) {
                xmlStorageUrl = await saveToStorage(userId, debitNoteId, `${documentNumber}.xml`, xmlContent)
              }
            }
            // CDR puede venir como URL o como contenido directo (base64/XML)
            if (emissionResult.cdrUrl) {
              const cdrContent = await downloadFromUrl(emissionResult.cdrUrl)
              if (cdrContent) {
                cdrStorageUrl = await saveToStorage(userId, debitNoteId, `${documentNumber}-CDR.xml`, cdrContent)
              }
            } else if (emissionResult.cdrData) {
              // Si el CDR viene como contenido directo (no URL)
              console.log('📄 CDR recibido como contenido directo, guardando...')
              cdrStorageUrl = await saveToStorage(userId, debitNoteId, `${documentNumber}-CDR.xml`, emissionResult.cdrData)
            }
          }

          console.log(`✅ Archivos ND guardados - XML: ${xmlStorageUrl ? 'OK' : 'NO'}, CDR: ${cdrStorageUrl ? 'OK' : 'NO'}`)
        } catch (storageError) {
          console.error('⚠️ Error guardando archivos ND en Storage:', storageError)
        }
      }

      // Agregar datos específicos según el método
      let methodSpecificData = {}
      if (emissionResult.method === 'qpse') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          cdrUrl: emissionResult.cdrUrl,
          cdrData: emissionResult.cdrData,
          xmlStorageUrl: xmlStorageUrl,
          cdrStorageUrl: cdrStorageUrl,
          ticket: emissionResult.ticket,
          hash: emissionResult.hash,
          nombreArchivo: emissionResult.nombreArchivo
        }))
      } else if (emissionResult.method === 'sunat_direct') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          cdrData: emissionResult.cdrData,
          xmlStorageUrl: xmlStorageUrl,
          cdrStorageUrl: cdrStorageUrl
        }))
      }

      const updateData = {
        sunatStatus: finalStatus,
        sunatResponse: sanitizeForFirestore({
          ...sunatResponseBase,
          ...methodSpecificData
        }),
        sunatSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      // Si fue aceptada, cambiar status a 'applied'
      if (emissionResult.accepted === true) {
        updateData.status = 'applied'
      }

      await debitNoteRef.update(updateData)
      console.log(`💾 Estado de ND actualizado en Firestore`)

      // 6. Incrementar contador de documentos emitidos SOLO si fue ACEPTADO
      if (emissionResult.accepted === true) {
        try {
          const subscriptionRef = db.collection('subscriptions').doc(userId)
          const subscriptionDoc = await subscriptionRef.get()

          if (subscriptionDoc.exists) {
            const subscriptionData = subscriptionDoc.data()

            if (!subscriptionData.usage) {
              await subscriptionRef.update({
                usage: {
                  invoicesThisMonth: 1,
                  totalCustomers: 0,
                  totalProducts: 0
                }
              })
              console.log(`📊 Campo usage inicializado y contador en 1 - Usuario: ${userId}`)
            } else {
              await subscriptionRef.update({
                'usage.invoicesThisMonth': FieldValue.increment(1)
              })
              console.log(`📊 Contador de documentos incrementado - Usuario: ${userId}`)
            }
          } else {
            console.warn(`⚠️ No existe suscripción para usuario: ${userId}`)
          }
        } catch (counterError) {
          console.error('⚠️ Error al incrementar contador (no crítico):', counterError)
        }

        // 7. Actualizar el documento original (boleta/factura) para reflejar el cargo adicional
        try {
          const referencedFirestoreId = debitNoteData.referencedInvoiceFirestoreId

          if (referencedFirestoreId) {
            const originalDocRef = db.collection('businesses').doc(userId).collection('invoices').doc(referencedFirestoreId)
            const originalDoc = await originalDocRef.get()

            if (originalDoc.exists) {
              await originalDocRef.update({
                hasDebitNote: true,
                debitNoteId: debitNoteId,
                debitNoteNumber: debitNoteData.number,
                debitNoteTotal: debitNoteData.total || 0,
                updatedAt: FieldValue.serverTimestamp()
              })

              console.log(`📝 Documento original actualizado con referencia a ND`)
            } else {
              console.log(`⚠️ No se encontró el documento original con ID: ${referencedFirestoreId}`)
            }
          } else {
            console.log(`⚠️ No hay referencedInvoiceFirestoreId en la ND`)
          }
        } catch (updateOriginalError) {
          console.error('⚠️ Error al actualizar documento original (no crítico):', updateOriginalError)
        }
      } else {
        console.log(`⏭️ ND rechazada - No se incrementa el contador`)
      }

      res.status(200).json({
        success: emissionResult.accepted === true || isPendingManual,
        status: finalStatus,
        message: emissionResult.description,
        method: emissionResult.method,
        ...(emissionResult.method === 'qpse' && {
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          cdrUrl: emissionResult.cdrUrl
        })
      })

    } catch (error) {
      console.error('❌ Error general:', error)

      // Intentar revertir el estado "sending" si ocurrió un error inesperado
      try {
        const debitNoteRef = db.collection('businesses').doc(req.body.userId).collection('invoices').doc(req.body.debitNoteId)
        const currentDoc = await debitNoteRef.get()
        if (currentDoc.exists && currentDoc.data().sunatStatus === 'sending') {
          await debitNoteRef.update({
            sunatStatus: 'pending',
            sunatResponse: {
              code: 'ERROR',
              description: error.message || 'Error inesperado al procesar la nota de débito',
              observations: ['El envío falló. Puede reintentar.'],
              error: true
            },
            updatedAt: FieldValue.serverTimestamp()
          })
          console.log('🔄 Estado de ND revertido a pending tras error inesperado')
        }
      } catch (revertError) {
        console.error('⚠️ Error al revertir estado de ND:', revertError)
      }

      res.status(500).json({ error: error.message || 'Error al procesar la nota de débito' })
    }
  }
)

// ========================================
// SCHEDULED FUNCTIONS - Tareas Programadas
// ========================================

/**
 * Cloud Function programada: Resetear contadores mensuales
 *
 * Se ejecuta DIARIAMENTE a las 00:00 (medianoche) hora de Perú (America/Lima)
 * Resetea el contador de documentos (usage.invoicesThisMonth) solo para usuarios
 * cuyo período mensual está iniciando HOY.
 *
 * Ejemplo: Si un usuario contrató el 10 de octubre, su contador se resetea
 * el 10 de cada mes (10 de noviembre, 10 de diciembre, etc.)
 */
export const resetMonthlyCounters = onSchedule(
  {
    schedule: '0 0 * * *', // Todos los días a las 00:00
    timeZone: 'America/Lima', // Zona horaria de Perú
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    try {
      console.log('🔄 Iniciando reseteo de contadores mensuales...')

      const today = new Date()
      const dayOfMonth = today.getDate() // Día del mes (1-31)

      console.log(`📅 Hoy es día ${dayOfMonth} del mes`)

      // Obtener todas las suscripciones activas
      const subscriptionsSnapshot = await db.collection('subscriptions').get()

      let resetCount = 0
      let skippedCount = 0

      // Procesar cada suscripción
      const batch = db.batch()

      for (const docSnapshot of subscriptionsSnapshot.docs) {
        const subscription = docSnapshot.data()
        const userId = docSnapshot.id

        // Solo procesar suscripciones activas
        if (subscription.status !== 'active') {
          continue
        }

        // Obtener la fecha de inicio del período actual
        const currentPeriodStart = subscription.currentPeriodStart?.toDate?.() || subscription.currentPeriodStart

        if (!currentPeriodStart) {
          console.log(`⏭️ Usuario ${userId}: Sin fecha de inicio de período`)
          skippedCount++
          continue
        }

        // Obtener el día del mes en que inició el período
        const periodStartDay = currentPeriodStart.getDate()

        // Si el día de inicio del período coincide con el día de hoy, resetear
        if (periodStartDay === dayOfMonth) {
          console.log(`✅ Usuario ${userId}: Reseteando contador (día ${dayOfMonth})`)

          batch.update(docSnapshot.ref, {
            'usage.invoicesThisMonth': 0,
            lastCounterReset: FieldValue.serverTimestamp()
          })

          resetCount++
        } else {
          skippedCount++
        }
      }

      // Ejecutar todas las actualizaciones en batch
      if (resetCount > 0) {
        await batch.commit()
        console.log(`✅ Reseteo completado: ${resetCount} contadores reseteados, ${skippedCount} omitidos`)
      } else {
        console.log(`ℹ️ No hay contadores para resetear hoy. Total revisados: ${skippedCount}`)
      }

      return {
        success: true,
        resetCount,
        skippedCount,
        date: today.toISOString()
      }

    } catch (error) {
      console.error('❌ Error al resetear contadores:', error)
      throw error
    }
  }
)

// ========================================
// UTILITY FUNCTIONS - Funciones de utilidad (temporal)
// ========================================

/**
 * Cloud Function HTTP: Inicializar contadores de uso
 *
 * Esta función es temporal y se puede ejecutar manualmente para inicializar
 * el campo usage en todas las suscripciones que no lo tengan.
 *
 * Ejecutar con: curl https://[tu-url]/initializeUsageCounters
 * O desde el navegador visitando la URL
 */
export const initializeUsageCounters = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCorsHeaders(res)

    try {
      console.log('🔧 Inicializando contadores de uso...')

      const subscriptionsSnapshot = await db.collection('subscriptions').get()

      let updated = 0
      let skipped = 0
      const results = []

      for (const docSnapshot of subscriptionsSnapshot.docs) {
        const subscription = docSnapshot.data()
        const userId = docSnapshot.id

        // Si ya tiene usage, saltar
        if (subscription.usage) {
          results.push({
            userId,
            email: subscription.email || 'sin email',
            status: 'skipped',
            reason: 'Ya tiene contador'
          })
          skipped++
          continue
        }

        // Inicializar contador
        await docSnapshot.ref.update({
          usage: {
            invoicesThisMonth: 0,
            totalCustomers: 0,
            totalProducts: 0
          }
        })

        results.push({
          userId,
          email: subscription.email || 'sin email',
          status: 'updated',
          reason: 'Contador inicializado'
        })
        updated++
      }

      console.log(`✅ Proceso completado: ${updated} actualizados, ${skipped} omitidos`)

      res.status(200).json({
        success: true,
        message: 'Contadores inicializados',
        stats: {
          updated,
          skipped,
          total: updated + skipped
        },
        details: results
      })

    } catch (error) {
      console.error('❌ Error al inicializar contadores:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

/**
 * Cloud Function HTTP: Sincronizar contadores de uso con comprobantes reales
 *
 * Esta función cuenta los comprobantes SUNAT aceptados de cada usuario
 * en el período actual y actualiza el contador usage.invoicesThisMonth
 *
 * Ejecutar con: curl https://[tu-url]/syncUsageCounters
 */
export const syncUsageCounters = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 540, // 9 minutos para procesar muchos usuarios
    memory: '512MiB',
  },
  async (req, res) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    try {
      console.log('🔄 Sincronizando contadores de uso con comprobantes reales...')

      const subscriptionsSnapshot = await db.collection('subscriptions').get()

      let updated = 0
      let errors = 0
      const results = []

      for (const subDoc of subscriptionsSnapshot.docs) {
        const subscription = subDoc.data()
        const userId = subDoc.id

        // Saltar usuarios secundarios (tienen ownerId)
        if (subscription.ownerId) {
          continue
        }

        try {
          // Helper para convertir cualquier formato de fecha a Date
          const toDate = (val) => {
            if (!val) return null
            if (val.toDate) return val.toDate() // Firestore Timestamp
            if (val._seconds) return new Date(val._seconds * 1000)
            if (typeof val === 'string') return new Date(val)
            if (val instanceof Date) return val
            return null
          }

          // Obtener fecha de inicio del período actual
          const periodStart = toDate(subscription.currentPeriodStart) ||
                             new Date(new Date().setDate(1)) // Primer día del mes si no hay fecha

          // Contar facturas/boletas aceptadas en el período
          const invoicesRef = db.collection('businesses').doc(userId).collection('invoices')
          const invoicesQuery = await invoicesRef
            .where('sunatStatus', 'in', ['accepted', 'ACEPTADO'])
            .get()

          // Filtrar por fecha de emisión >= periodStart
          let invoiceCount = 0
          for (const invDoc of invoicesQuery.docs) {
            const invData = invDoc.data()
            const issueDate = toDate(invData.issueDate) || toDate(invData.createdAt) || null

            if (issueDate && issueDate >= periodStart) {
              // Contar facturas, boletas y notas de débito (no notas de venta)
              const docType = invData.documentType?.toLowerCase() || ''
              if (docType === 'factura' || docType === 'boleta' || docType === 'nota_debito' ||
                  invData.series?.startsWith('F') || invData.series?.startsWith('B')) {
                invoiceCount++
              }
            }
          }

          // Contar notas de crédito aceptadas en el período
          const creditNotesRef = db.collection('businesses').doc(userId).collection('creditNotes')
          const creditNotesQuery = await creditNotesRef
            .where('sunatStatus', 'in', ['accepted', 'ACEPTADO'])
            .get()

          let creditNoteCount = 0
          for (const cnDoc of creditNotesQuery.docs) {
            const cnData = cnDoc.data()
            const issueDate = toDate(cnData.issueDate) || toDate(cnData.createdAt) || null

            if (issueDate && issueDate >= periodStart) {
              creditNoteCount++
            }
          }

          // Nota: las notas de débito se guardan en la colección 'invoices' con documentType 'nota_debito'
          // ya están contadas arriba en invoiceCount

          const totalCount = invoiceCount + creditNoteCount
          const currentCount = subscription.usage?.invoicesThisMonth || 0

          // Actualizar solo si hay diferencia
          if (totalCount !== currentCount) {
            await subDoc.ref.update({
              usage: {
                invoicesThisMonth: totalCount,
                totalCustomers: subscription.usage?.totalCustomers || 0,
                totalProducts: subscription.usage?.totalProducts || 0
              }
            })

            results.push({
              userId,
              email: subscription.email || 'N/A',
              previousCount: currentCount,
              newCount: totalCount,
              invoices: invoiceCount,
              creditNotes: creditNoteCount,
              status: 'updated'
            })
            updated++

            console.log(`✅ ${subscription.email}: ${currentCount} → ${totalCount} (${invoiceCount} fact/bol/ND + ${creditNoteCount} NC)`)
          } else {
            results.push({
              userId,
              email: subscription.email || 'N/A',
              count: totalCount,
              status: 'unchanged'
            })
          }

        } catch (userError) {
          console.error(`❌ Error procesando usuario ${userId}:`, userError.message)
          results.push({
            userId,
            email: subscription.email || 'N/A',
            status: 'error',
            error: userError.message
          })
          errors++
        }
      }

      console.log(`✅ Sincronización completada: ${updated} actualizados, ${errors} errores`)

      res.status(200).json({
        success: true,
        message: 'Contadores sincronizados con comprobantes reales',
        stats: {
          updated,
          errors,
          total: subscriptionsSnapshot.size
        },
        details: results.filter(r => r.status === 'updated' || r.status === 'error')
      })

    } catch (error) {
      console.error('❌ Error al sincronizar contadores:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

// ========================================
// ADMIN - Funciones administrativas
// ========================================

/**
 * Cloud Function HTTP: Obtener UID de usuario por email
 * Solo para admins - usado al crear resellers
 */
/**
 * Cloud Function — Tipo de cambio SUNAT/SBS (USD/PEN).
 *
 * Proxy server-side para evitar CORS desde el navegador. Cachea el resultado
 * por día en Firestore (`exchangeRates/{YYYY-MM-DD}`) para reducir llamadas
 * a la API externa.
 *
 * Endpoint primario: apis.net.pe v1 (gratis, sin token).
 * Si falla, devuelve el último valor cacheado si existe.
 *
 * GET /getExchangeRate?date=YYYY-MM-DD  (date opcional, default hoy)
 *
 * Respuesta:
 *   { success: true, buy: 3.74, sell: 3.76, date: "2026-05-12", source: "sbs"|"cache" }
 *   { success: false, error: string }
 */
export const getExchangeRate = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 15,
    memory: '256MiB',
    invoker: 'public',
    cors: true,
  },
  async (req, res) => {
    // CORS para GET
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    res.set('Access-Control-Max-Age', '3600')

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    try {
      // Validar/parsear fecha
      const today = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const isoToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
      const dateParam = (req.query?.date || isoToday).toString().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        res.status(400).json({ success: false, error: 'Formato de fecha inválido (YYYY-MM-DD)' })
        return
      }

      // 1) Cache global en Firestore
      const cacheRef = db.collection('exchangeRates').doc(dateParam)
      const cacheSnap = await cacheRef.get()
      if (cacheSnap.exists) {
        const cached = cacheSnap.data()
        if (Number.isFinite(cached?.sell) && cached.sell > 0) {
          res.status(200).json({
            success: true,
            buy: cached.buy || cached.sell,
            sell: cached.sell,
            date: dateParam,
            source: 'cache',
          })
          return
        }
      }

      // 2) Fetch a apis.net.pe v1 (sin token)
      const url = `https://api.apis.net.pe/v1/tipo-cambio-sunat?date=${dateParam}`
      let buy = null
      let sell = null
      try {
        const r = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        })
        if (r.ok) {
          const json = await r.json()
          buy = parseFloat(json.compra ?? json.precioCompra)
          sell = parseFloat(json.venta ?? json.precioVenta)
        }
      } catch (err) {
        console.warn('[getExchangeRate] apis.net.pe v1 falló:', err?.message || err)
      }

      if (!Number.isFinite(sell) || sell <= 0) {
        res.status(502).json({
          success: false,
          error: 'No se pudo obtener el TC de la SBS. Ingresa el valor manualmente.',
        })
        return
      }

      // 3) Guardar en cache
      const rateData = {
        buy: Number.isFinite(buy) && buy > 0 ? buy : sell,
        sell,
        source: 'sbs',
        date: dateParam,
        fetchedAt: FieldValue.serverTimestamp(),
      }
      try { await cacheRef.set(rateData, { merge: true }) } catch (e) {
        console.warn('[getExchangeRate] no se pudo guardar cache:', e?.message)
      }

      res.status(200).json({
        success: true,
        buy: rateData.buy,
        sell,
        date: dateParam,
        source: 'sbs',
      })
    } catch (error) {
      console.error('[getExchangeRate] Error:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  }
)

export const getUserByEmail = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
    cors: true,
  },
  async (req, res) => {
    setCorsHeaders(res)

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    try {
      const { email, adminUid } = req.body

      if (!email) {
        res.status(400).json({ success: false, error: 'Email es requerido' })
        return
      }

      // Verificar que quien llama es admin
      if (adminUid) {
        const adminDoc = await db.collection('admins').doc(adminUid).get()
        if (!adminDoc.exists) {
          res.status(403).json({ success: false, error: 'No autorizado' })
          return
        }
      }

      // Buscar usuario por email
      const userRecord = await auth.getUserByEmail(email)

      // Verificar si tiene suscripción activa
      const subscriptionDoc = await db.collection('subscriptions').doc(userRecord.uid).get()
      let subscription = null
      if (subscriptionDoc.exists) {
        const subData = subscriptionDoc.data()
        subscription = {
          status: subData.status,
          plan: subData.plan,
          businessName: subData.businessName,
          accessBlocked: subData.accessBlocked || false
        }
      }

      // Verificar si ya es reseller
      const resellerDoc = await db.collection('resellers').doc(userRecord.uid).get()
      const isAlreadyReseller = resellerDoc.exists

      res.status(200).json({
        success: true,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName || null,
          createdAt: userRecord.metadata.creationTime
        },
        subscription,
        isAlreadyReseller
      })

    } catch (error) {
      console.error('Error getting user by email:', error)

      if (error.code === 'auth/user-not-found') {
        res.status(404).json({
          success: false,
          error: 'Usuario no encontrado con ese email'
        })
        return
      }

      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

/**
 * Cloud Function HTTP: Crear o actualizar reseller
 * Crea el documento con el UID correcto
 */
export const createReseller = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
    cors: true,
  },
  async (req, res) => {
    setCorsHeaders(res)

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    try {
      const { adminUid, resellerData } = req.body

      if (!resellerData || !resellerData.uid) {
        res.status(400).json({ success: false, error: 'Datos del reseller incompletos' })
        return
      }

      // Verificar que quien llama es admin
      if (adminUid) {
        const adminDoc = await db.collection('admins').doc(adminUid).get()
        if (!adminDoc.exists) {
          res.status(403).json({ success: false, error: 'No autorizado' })
          return
        }
      }

      const { uid, ...data } = resellerData

      // Verificar si ya existe
      const existingDoc = await db.collection('resellers').doc(uid).get()
      const isNew = !existingDoc.exists

      // Crear/actualizar documento con el UID como ID
      await db.collection('resellers').doc(uid).set({
        ...data,
        createdAt: isNew ? FieldValue.serverTimestamp() : existingDoc.data().createdAt,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true })

      // También actualizar el rol en la suscripción si existe
      const subscriptionRef = db.collection('subscriptions').doc(uid)
      const subscriptionDoc = await subscriptionRef.get()
      if (subscriptionDoc.exists) {
        await subscriptionRef.update({
          isReseller: true,
          resellerSince: isNew ? FieldValue.serverTimestamp() : subscriptionDoc.data().resellerSince || FieldValue.serverTimestamp()
        })
      }

      res.status(200).json({
        success: true,
        message: isNew ? 'Reseller creado exitosamente' : 'Reseller actualizado exitosamente',
        resellerId: uid
      })

    } catch (error) {
      console.error('Error creating reseller:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

// ========================================
// ELIMINAR USUARIO - Admin Only
// ========================================

/**
 * Cloud Function: Eliminar usuario completamente
 * Solo puede ser llamada por administradores
 * Elimina: Auth, documento de usuario, y subcollecciones
 */
export const deleteUser = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
    cors: true,
  },
  async (req, res) => {
    setCorsHeaders(res)

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' })
      return
    }

    try {
      const { adminUid, userIdToDelete, deleteData } = req.body

      if (!adminUid || !userIdToDelete) {
        res.status(400).json({ success: false, error: 'Faltan parámetros requeridos' })
        return
      }

      // Verificar que quien llama es admin
      const adminDoc = await db.collection('admins').doc(adminUid).get()
      if (!adminDoc.exists) {
        res.status(403).json({ success: false, error: 'No autorizado - Solo administradores' })
        return
      }

      // No permitir que un admin se elimine a sí mismo
      if (adminUid === userIdToDelete) {
        res.status(400).json({ success: false, error: 'No puedes eliminarte a ti mismo' })
        return
      }

      console.log(`🗑️ Admin ${adminUid} eliminando usuario ${userIdToDelete}`)

      const deletedItems = []

      // 1. Eliminar de Firebase Authentication
      try {
        await auth.deleteUser(userIdToDelete)
        deletedItems.push('Firebase Auth')
        console.log(`✅ Usuario eliminado de Firebase Auth`)
      } catch (authError) {
        // Si el usuario no existe en Auth, continuar
        if (authError.code !== 'auth/user-not-found') {
          console.error(`⚠️ Error eliminando de Auth: ${authError.message}`)
        } else {
          console.log(`ℹ️ Usuario no encontrado en Firebase Auth (ya eliminado o nunca existió)`)
        }
      }

      // 2. Eliminar documento del usuario
      const userRef = db.collection('users').doc(userIdToDelete)
      const userDoc = await userRef.get()

      if (userDoc.exists) {
        // Si deleteData es true, eliminar también subcollecciones
        if (deleteData) {
          const subcollections = ['invoices', 'products', 'customers', 'warehouses', 'branches', 'expenses', 'purchases', 'quotations', 'dispatchGuides', 'cashMovements']

          for (const subcollection of subcollections) {
            try {
              const subRef = userRef.collection(subcollection)
              const subDocs = await subRef.limit(500).get()

              if (!subDocs.empty) {
                const batch = db.batch()
                subDocs.docs.forEach(doc => batch.delete(doc.ref))
                await batch.commit()
                deletedItems.push(`${subcollection} (${subDocs.size} docs)`)
                console.log(`✅ Eliminados ${subDocs.size} documentos de ${subcollection}`)
              }
            } catch (subError) {
              console.error(`⚠️ Error eliminando ${subcollection}: ${subError.message}`)
            }
          }
        }

        // Eliminar el documento principal del usuario
        await userRef.delete()
        deletedItems.push('Documento de usuario')
        console.log(`✅ Documento de usuario eliminado`)
      }

      // 3. Eliminar suscripción si existe
      try {
        const subscriptionRef = db.collection('subscriptions').doc(userIdToDelete)
        const subscriptionDoc = await subscriptionRef.get()
        if (subscriptionDoc.exists) {
          await subscriptionRef.delete()
          deletedItems.push('Suscripción')
          console.log(`✅ Suscripción eliminada`)
        }
      } catch (subError) {
        console.error(`⚠️ Error eliminando suscripción: ${subError.message}`)
      }

      // 4. Eliminar de resellers si existe
      try {
        const resellerRef = db.collection('resellers').doc(userIdToDelete)
        const resellerDoc = await resellerRef.get()
        if (resellerDoc.exists) {
          await resellerRef.delete()
          deletedItems.push('Reseller')
          console.log(`✅ Reseller eliminado`)
        }
      } catch (resellerError) {
        console.error(`⚠️ Error eliminando reseller: ${resellerError.message}`)
      }

      res.status(200).json({
        success: true,
        message: `Usuario eliminado exitosamente`,
        deletedItems
      })

    } catch (error) {
      console.error('❌ Error eliminando usuario:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

// ========================================
// GUÍAS DE REMISIÓN - Cloud Functions
// ========================================

/**
 * Cloud Function: Enviar Guía de Remisión a SUNAT
 *
 * Esta función es INDEPENDIENTE de sendInvoiceToSunat para no afectar
 * el flujo existente de facturas y boletas.
 *
 * IMPORTANTE: Las GRE usan endpoints DIFERENTES a las facturas/boletas:
 * - Producción: https://e-guiaremision.sunat.gob.pe/ol-ti-itemision-guia-gem/billService
 * - Beta: https://e-beta.sunat.gob.pe/ol-ti-itemision-guia-gem-beta/billService
 *
 * Pasos:
 * 1. Obtiene los datos de la guía de Firestore
 * 2. Obtiene la configuración SUNAT del usuario
 * 3. Genera el XML en formato UBL 2.1 DespatchAdvice
 * 4. Firma el XML con el certificado digital
 * 5. Envía el XML firmado a SUNAT vía SOAP (endpoint GRE)
 * 6. Procesa la respuesta (CDR)
 * 7. Actualiza el estado de la guía en Firestore
 */
export const sendDispatchGuideToSunatFn = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (req, res) => {
    // Manejar preflight OPTIONS request
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    // Solo aceptar POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Obtener y verificar token de autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Token de autorización requerido' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      let decodedToken

      try {
        decodedToken = await auth.verifyIdToken(idToken)
      } catch (tokenError) {
        console.error('Error verificando token:', tokenError)
        res.status(401).json({ error: 'Token inválido o expirado' })
        return
      }

      const userId = decodedToken.uid
      console.log(`🚛 [GRE] Usuario autenticado: ${userId}`)

      // Obtener datos del body
      const { businessId, guideId } = req.body

      if (!businessId || !guideId) {
        res.status(400).json({ error: 'businessId y guideId son requeridos' })
        return
      }

      console.log(`🚛 [GRE] Procesando guía ${guideId} del negocio ${businessId}`)

      // 1. Obtener datos del negocio
      const businessRef = db.collection('businesses').doc(businessId)
      const businessDoc = await businessRef.get()

      if (!businessDoc.exists) {
        res.status(404).json({ error: 'Negocio no encontrado' })
        return
      }

      const businessData = businessDoc.data()
      console.log(`🏢 [GRE] Negocio: ${businessData.businessName} (RUC: ${businessData.ruc})`)

      // Mapear emissionConfig (configurado por super admin) al formato esperado
      // Esto es necesario porque emissionConfig.qpse contiene las credenciales anidadas
      if (businessData.emissionConfig) {
        console.log('📋 [GRE] Usando configuración de emisión del admin')
        const config = businessData.emissionConfig

        if (config.method === 'qpse') {
          businessData.qpse = {
            enabled: config.qpse?.enabled !== false,
            usuario: config.qpse?.usuario,
            password: config.qpse?.password,
            environment: config.qpse?.environment || 'demo',
            firmasDisponibles: config.qpse?.firmasDisponibles || 0,
            firmasUsadas: config.qpse?.firmasUsadas || 0
          }
          businessData.sunat = { enabled: false }
          businessData.nubefact = { enabled: false }
          console.log('✅ [GRE] QPse configurado desde emissionConfig:', JSON.stringify(businessData.qpse))
        } else if (config.method === 'sunat_direct') {
          businessData.sunat = {
            enabled: config.sunat?.enabled !== false,
            environment: config.sunat?.environment || 'beta',
            solUser: config.sunat?.solUser,
            solPassword: config.sunat?.solPassword,
            clientId: config.sunat?.clientId,
            clientSecret: config.sunat?.clientSecret,
            certificateName: config.sunat?.certificateName,
            certificatePassword: config.sunat?.certificatePassword,
            certificateData: config.sunat?.certificateData,
            homologated: config.sunat?.homologated || false
          }
          businessData.qpse = { enabled: false }
          businessData.nubefact = { enabled: false }
          console.log('✅ [GRE] SUNAT configurado desde emissionConfig')
          console.log('🔑 [GRE] Client ID presente:', !!config.sunat?.clientId)
        }
      }

      // Validar que al menos un método esté habilitado
      const sunatEnabled = businessData.sunat?.enabled === true
      const qpseEnabled = businessData.qpse?.enabled === true
      const nubefactEnabled = businessData.nubefact?.enabled === true

      if (!sunatEnabled && !qpseEnabled && !nubefactEnabled) {
        console.log('❌ [GRE] Ningún método de emisión habilitado')
        res.status(400).json({
          error: 'Ningún método de emisión está habilitado. Configura SUNAT directo, QPse o NubeFact en Configuración.'
        })
        return
      }

      // 2. Obtener datos de la guía de remisión
      const guideRef = db.collection('businesses').doc(businessId)
        .collection('dispatchGuides').doc(guideId)
      const guideDoc = await guideRef.get()

      if (!guideDoc.exists) {
        res.status(404).json({ error: 'Guía de remisión no encontrada' })
        return
      }

      const guideData = guideDoc.data()
      console.log(`📄 [GRE] Guía: ${guideData.number}`)

      // Verificar si ya fue enviada y aceptada
      if (guideData.sunatStatus === 'accepted') {
        res.status(400).json({
          error: 'Esta guía ya fue aceptada por SUNAT',
          sunatStatus: guideData.sunatStatus
        })
        return
      }

      // 3. Preparar datos para emisión
      const guideForEmission = {
        ...guideData,
        series: guideData.series,
        correlative: guideData.correlative,
      }

      // 4. Emitir la guía de remisión
      console.log('🚀 [GRE] Iniciando emisión de guía de remisión...')
      const result = await emitirGuiaRemision(guideForEmission, businessData)

      console.log('📋 [GRE] Resultado de emisión:', JSON.stringify(result, null, 2))

      // ========== VERIFICAR SI ES "DOCUMENTO YA REGISTRADO" ==========
      // Código 1033 = "El comprobante fue registrado previamente"
      // Código 4000 = "El documento ya existe" (variante para GRE)
      // Si SUNAT dice que el documento ya existe, significa que ya fue aceptado antes
      // IMPORTANTE: "con otros datos" = conflicto de datos, NO es aceptación
      const greDescLower = (result.description || '').toLowerCase()
      // "con otros datos" también indica que SUNAT ya tiene el documento
      const isAlreadyRegistered = (
        result.responseCode === '1033' ||
        result.responseCode === '4000' ||
        (result.description && (
          greDescLower.includes('registrado previamente') ||
          greDescLower.includes('ya ha sido registrado') ||
          greDescLower.includes('documento ya existe') ||
          greDescLower.includes('already registered')
        )))

      if (isAlreadyRegistered && !result.accepted) {
        console.log('📋 [GRE] Documento ya registrado en SUNAT - tratando como ACEPTADO')
        console.log(`   Código: ${result.responseCode}`)
        console.log(`   Descripción: ${result.description}`)
        result.accepted = true
        result.description = (result.description || '') + ' (Documento ya existía en SUNAT)'
      }

      // ========== GUARDAR XML Y CDR EN FIREBASE STORAGE (GRE REMITENTE) ==========
      let xmlStorageUrl = null
      let cdrStorageUrl = null

      if (result.accepted) {
        const documentNumber = guideData.number
        console.log(`📁 [GRE] Guardando archivos para ${documentNumber}...`)

        try {
          if (result.method === 'sunat_direct') {
            // Guardar XML firmado (si está disponible)
            if (result.xml) {
              xmlStorageUrl = await saveToStorage(
                businessId,
                guideId,
                `${documentNumber}.xml`,
                result.xml
              )
              console.log(`✅ [GRE] XML guardado: ${xmlStorageUrl ? 'OK' : 'NO'}`)
            }
            // Guardar CDR
            if (result.cdrData) {
              cdrStorageUrl = await saveToStorage(
                businessId,
                guideId,
                `${documentNumber}-CDR.xml`,
                result.cdrData
              )
              console.log(`✅ [GRE] CDR guardado: ${cdrStorageUrl ? 'OK' : 'NO'}`)
            }
          } else if (result.method === 'qpse') {
            // XML: priorizar xmlFirmado (base64) que SIEMPRE viene cuando QPse
            // firmó el documento. Fallback a xmlUrl si está. Igual flujo que
            // facturas (ver sendInvoiceToSunat línea ~920).
            let xmlContent = null
            if (result.xmlFirmado) {
              try {
                xmlContent = Buffer.from(result.xmlFirmado, 'base64').toString('utf-8')
              } catch {
                xmlContent = result.xmlFirmado
              }
            }
            if (!xmlContent && result.xmlUrl) {
              xmlContent = await downloadFromUrl(result.xmlUrl)
            }
            if (xmlContent) {
              xmlStorageUrl = await saveToStorage(
                businessId,
                guideId,
                `${documentNumber}.xml`,
                xmlContent
              )
              console.log(`✅ [GRE] XML guardado: ${xmlStorageUrl ? 'OK' : 'NO'}`)
            }

            // CDR: priorizar contenido directo (que ya viene decodificado del
            // ZIP por decodeQPseCdr en qpseService) sobre URL externa.
            if (result.cdrData) {
              cdrStorageUrl = await saveToStorage(
                businessId,
                guideId,
                `${documentNumber}-CDR.xml`,
                result.cdrData
              )
              console.log(`✅ [GRE] CDR guardado desde contenido directo: ${cdrStorageUrl ? 'OK' : 'NO'}`)
            } else if (result.cdrUrl) {
              const cdrContent = await downloadFromUrl(result.cdrUrl)
              if (cdrContent) {
                cdrStorageUrl = await saveToStorage(
                  businessId,
                  guideId,
                  `${documentNumber}-CDR.xml`,
                  cdrContent
                )
                console.log(`✅ [GRE] CDR guardado desde URL: ${cdrStorageUrl ? 'OK' : 'NO'}`)
              }
            }
          }

          console.log(`✅ [GRE] Archivos guardados - XML: ${xmlStorageUrl ? 'OK' : 'NO'}, CDR: ${cdrStorageUrl ? 'OK' : 'NO'}`)
        } catch (storageError) {
          console.error('⚠️ [GRE] Error guardando archivos en Storage (no crítico):', storageError)
          // Continuar sin fallar la emisión
        }
      }

      // 5. Actualizar el estado de la guía en Firestore
      const updateData = {
        sunatStatus: result.accepted ? 'accepted' : (result.error ? 'error' : 'rejected'),
        sunatResponseCode: result.responseCode || null,
        sunatDescription: result.description || result.error || null,
        sunatMethod: result.method || 'sunat_direct',
        updatedAt: FieldValue.serverTimestamp(),
      }

      // Agregar datos específicos según el método
      if (result.method === 'sunat_direct') {
        if (result.cdrData) updateData.cdrData = result.cdrData
        if (result.xml) updateData.xmlData = result.xml // Guardar XML firmado como fallback
        if (xmlStorageUrl) updateData.xmlStorageUrl = xmlStorageUrl
        if (cdrStorageUrl) updateData.cdrStorageUrl = cdrStorageUrl
      } else if (result.method === 'qpse') {
        if (result.cdrUrl) updateData.cdrUrl = result.cdrUrl
        if (result.xmlUrl) updateData.xmlUrl = result.xmlUrl
        if (result.pdfUrl) updateData.pdfUrl = result.pdfUrl
        if (result.hash) updateData.hash = result.hash
        if (result.cdrData) updateData.cdrData = result.cdrData // Guardar CDR como fallback
        if (result.xmlFirmado) updateData.xmlData = result.xmlFirmado // Guardar XML firmado como fallback
        if (xmlStorageUrl) updateData.xmlStorageUrl = xmlStorageUrl
        if (cdrStorageUrl) updateData.cdrStorageUrl = cdrStorageUrl
      }

      await guideRef.update(removeUndefined(updateData))

      console.log(`✅ [GRE] Guía actualizada con estado: ${updateData.sunatStatus}`)

      // 6. Responder al cliente
      res.status(200).json({
        success: result.success,
        accepted: result.accepted,
        method: result.method,
        responseCode: result.responseCode,
        description: result.description,
        error: result.error,
        guideNumber: guideData.number,
        sunatStatus: updateData.sunatStatus
      })

    } catch (error) {
      console.error('❌ [GRE] Error en sendDispatchGuideToSunat:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Error interno del servidor'
      })
    }
  }
)

// ========================================
// GUÍA DE REMISIÓN TRANSPORTISTA (GRE-T)
// ========================================

/**
 * Cloud Function para enviar Guía de Remisión Transportista a SUNAT
 *
 * Tipo de documento: 31 (Guía de Remisión Transportista)
 * Serie: V001-Vxxx
 *
 * Esta función maneja la emisión de GRE por parte de transportistas
 * que prestan servicio de transporte de carga.
 */
export const sendCarrierDispatchGuideToSunatFn = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (req, res) => {
    // Manejar preflight OPTIONS request
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    // Solo aceptar POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Obtener y verificar token de autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Token de autorización requerido' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      let decodedToken

      try {
        decodedToken = await auth.verifyIdToken(idToken)
      } catch (tokenError) {
        console.error('Error verificando token:', tokenError)
        res.status(401).json({ error: 'Token inválido o expirado' })
        return
      }

      const userId = decodedToken.uid
      console.log(`🚛 [GRE-T] Usuario autenticado: ${userId}`)

      // Obtener datos del body
      const { businessId, guideId } = req.body

      if (!businessId || !guideId) {
        res.status(400).json({ error: 'businessId y guideId son requeridos' })
        return
      }

      console.log(`🚛 [GRE-T] Procesando guía transportista ${guideId} del negocio ${businessId}`)

      // 1. Obtener datos del negocio
      const businessRef = db.collection('businesses').doc(businessId)
      const businessDoc = await businessRef.get()

      if (!businessDoc.exists) {
        res.status(404).json({ error: 'Negocio no encontrado' })
        return
      }

      const businessData = businessDoc.data()
      console.log(`🏢 [GRE-T] Negocio: ${businessData.businessName} (RUC: ${businessData.ruc})`)

      // Mapear emissionConfig (configurado por super admin) al formato esperado
      if (businessData.emissionConfig) {
        console.log('📋 [GRE-T] Usando configuración de emisión del admin')
        const config = businessData.emissionConfig

        if (config.method === 'qpse') {
          businessData.qpse = {
            enabled: config.qpse?.enabled !== false,
            usuario: config.qpse?.usuario,
            password: config.qpse?.password,
            environment: config.qpse?.environment || 'demo',
            firmasDisponibles: config.qpse?.firmasDisponibles || 0,
            firmasUsadas: config.qpse?.firmasUsadas || 0
          }
          businessData.sunat = { enabled: false }
          businessData.nubefact = { enabled: false }
          console.log('✅ [GRE-T] QPse configurado desde emissionConfig:', JSON.stringify(businessData.qpse))
        } else if (config.method === 'sunat_direct') {
          businessData.sunat = {
            enabled: config.sunat?.enabled !== false,
            environment: config.sunat?.environment || 'beta',
            solUser: config.sunat?.solUser,
            solPassword: config.sunat?.solPassword,
            clientId: config.sunat?.clientId,
            clientSecret: config.sunat?.clientSecret,
            certificateName: config.sunat?.certificateName,
            certificatePassword: config.sunat?.certificatePassword,
            certificateData: config.sunat?.certificateData,
            homologated: config.sunat?.homologated || false
          }
          businessData.qpse = { enabled: false }
          businessData.nubefact = { enabled: false }
          console.log('✅ [GRE-T] SUNAT configurado desde emissionConfig')
          console.log('🔑 [GRE-T] Client ID presente:', !!config.sunat?.clientId)
        }
      }

      // Validar que al menos un método esté habilitado
      const sunatEnabled = businessData.sunat?.enabled === true
      const qpseEnabled = businessData.qpse?.enabled === true
      const nubefactEnabled = businessData.nubefact?.enabled === true

      if (!sunatEnabled && !qpseEnabled && !nubefactEnabled) {
        console.log('❌ [GRE-T] Ningún método de emisión habilitado')
        res.status(400).json({
          error: 'Ningún método de emisión está habilitado. Configura SUNAT directo, QPse o NubeFact en Configuración.'
        })
        return
      }

      // 2. Obtener datos de la guía de remisión transportista
      const guideRef = db.collection('businesses').doc(businessId)
        .collection('carrierDispatchGuides').doc(guideId)
      const guideDoc = await guideRef.get()

      if (!guideDoc.exists) {
        res.status(404).json({ error: 'Guía de remisión transportista no encontrada' })
        return
      }

      let guideData = guideDoc.data()
      console.log(`📄 [GRE-T] Guía: ${guideData.number || 'SIN NÚMERO (borrador)'}`)

      // Verificar si ya fue enviada y aceptada
      if (guideData.sunatStatus === 'accepted') {
        res.status(400).json({
          error: 'Esta guía ya fue aceptada por SUNAT',
          sunatStatus: guideData.sunatStatus
        })
        return
      }

      // Si es un borrador sin número, asignar series y correlativo
      if (!guideData.number || !guideData.series || !guideData.correlative) {
        console.log('📝 [GRE-T] Borrador detectado - asignando número de serie...')

        // Obtener la serie actual y el siguiente número correlativo
        const series = businessData.series?.guia_transportista || { serie: 'V001', lastNumber: 0 }
        const newCorrelative = (series.lastNumber || 0) + 1
        const guideNumber = `${series.serie}-${String(newCorrelative).padStart(8, '0')}`

        console.log(`📝 [GRE-T] Asignando número: ${guideNumber}`)

        // Actualizar la guía con el número asignado
        await guideRef.update({
          series: series.serie,
          correlative: newCorrelative,
          number: guideNumber,
          status: 'pending',
          updatedAt: FieldValue.serverTimestamp(),
        })

        // Actualizar el contador de series en el negocio
        await businessRef.update({
          'series.guia_transportista.lastNumber': newCorrelative,
          'series.guia_transportista.serie': series.serie,
          updatedAt: FieldValue.serverTimestamp(),
        })

        // Actualizar guideData con los nuevos valores
        guideData = {
          ...guideData,
          series: series.serie,
          correlative: newCorrelative,
          number: guideNumber,
          status: 'pending',
        }

        console.log(`✅ [GRE-T] Número asignado: ${guideNumber}`)
      }

      // 3. Preparar datos para emisión
      const guideForEmission = {
        ...guideData,
        series: guideData.series,
        correlative: guideData.correlative,
      }

      // 4. Emitir la guía de remisión transportista
      console.log('🚀 [GRE-T] Iniciando emisión de guía de remisión transportista...')
      const result = await emitirGuiaRemisionTransportista(guideForEmission, businessData)

      console.log('📋 [GRE-T] Resultado de emisión:', JSON.stringify(result, null, 2))

      // ========== VERIFICAR SI ES "DOCUMENTO YA REGISTRADO" ==========
      // Código 1033 = "El comprobante fue registrado previamente"
      // Código 4000 = "El documento ya existe" (variante para GRE)
      // Si SUNAT dice que el documento ya existe, significa que ya fue aceptado antes
      // IMPORTANTE: "con otros datos" = conflicto de datos, NO es aceptación
      const greTDescLower = (result.description || '').toLowerCase()
      // "con otros datos" también indica que SUNAT ya tiene el documento
      const isAlreadyRegistered = (
        result.responseCode === '1033' ||
        result.responseCode === '4000' ||
        (result.description && (
          greTDescLower.includes('registrado previamente') ||
          greTDescLower.includes('ya ha sido registrado') ||
          greTDescLower.includes('documento ya existe') ||
          greTDescLower.includes('already registered')
        )))

      if (isAlreadyRegistered && !result.accepted) {
        console.log('📋 [GRE-T] Documento ya registrado en SUNAT - tratando como ACEPTADO')
        console.log(`   Código: ${result.responseCode}`)
        console.log(`   Descripción: ${result.description}`)
        result.accepted = true
        result.description = (result.description || '') + ' (Documento ya existía en SUNAT)'
      }

      // ========== GUARDAR XML Y CDR EN FIREBASE STORAGE (GRE TRANSPORTISTA) ==========
      let xmlStorageUrl = null
      let cdrStorageUrl = null

      if (result.accepted) {
        const documentNumber = guideData.number
        console.log(`📁 [GRE-T] Guardando archivos para ${documentNumber}...`)

        try {
          if (result.method === 'sunat_direct') {
            // Guardar XML firmado (si está disponible)
            if (result.xml) {
              xmlStorageUrl = await saveToStorage(
                businessId,
                guideId,
                `${documentNumber}.xml`,
                result.xml
              )
              console.log(`✅ [GRE-T] XML guardado: ${xmlStorageUrl ? 'OK' : 'NO'}`)
            }
            // Guardar CDR
            if (result.cdrData) {
              cdrStorageUrl = await saveToStorage(
                businessId,
                guideId,
                `${documentNumber}-CDR.xml`,
                result.cdrData
              )
              console.log(`✅ [GRE-T] CDR guardado: ${cdrStorageUrl ? 'OK' : 'NO'}`)
            }
          } else if (result.method === 'qpse') {
            // Para QPse, descargar desde las URLs proporcionadas
            if (result.xmlUrl) {
              const xmlContent = await downloadFromUrl(result.xmlUrl)
              if (xmlContent) {
                xmlStorageUrl = await saveToStorage(
                  businessId,
                  guideId,
                  `${documentNumber}.xml`,
                  xmlContent
                )
              }
            }
            // CDR puede venir como URL o como contenido directo
            if (result.cdrUrl) {
              const cdrContent = await downloadFromUrl(result.cdrUrl)
              if (cdrContent) {
                cdrStorageUrl = await saveToStorage(
                  businessId,
                  guideId,
                  `${documentNumber}-CDR.xml`,
                  cdrContent
                )
              }
            } else if (result.cdrData) {
              console.log('📄 [GRE-T] CDR recibido como contenido directo, guardando...')
              cdrStorageUrl = await saveToStorage(
                businessId,
                guideId,
                `${documentNumber}-CDR.xml`,
                result.cdrData
              )
            }
          }

          console.log(`✅ [GRE-T] Archivos guardados - XML: ${xmlStorageUrl ? 'OK' : 'NO'}, CDR: ${cdrStorageUrl ? 'OK' : 'NO'}`)
        } catch (storageError) {
          console.error('⚠️ [GRE-T] Error guardando archivos en Storage (no crítico):', storageError)
          // Continuar sin fallar la emisión
        }
      }

      // 5. Actualizar el estado de la guía en Firestore
      const updateData = {
        sunatStatus: result.accepted ? 'accepted' : (result.error ? 'error' : 'rejected'),
        sunatResponseCode: result.responseCode || null,
        sunatDescription: result.description || result.error || null,
        sunatMethod: result.method || 'sunat_direct',
        updatedAt: FieldValue.serverTimestamp(),
      }

      // Agregar datos específicos según el método
      if (result.method === 'sunat_direct') {
        if (result.cdrData) updateData.cdrData = result.cdrData
        if (result.xml) updateData.xmlData = result.xml // Guardar XML firmado como fallback
        if (xmlStorageUrl) updateData.xmlStorageUrl = xmlStorageUrl
        if (cdrStorageUrl) updateData.cdrStorageUrl = cdrStorageUrl
      } else if (result.method === 'qpse') {
        if (result.cdrUrl) updateData.cdrUrl = result.cdrUrl
        if (result.xmlUrl) updateData.xmlUrl = result.xmlUrl
        if (result.pdfUrl) updateData.pdfUrl = result.pdfUrl
        if (result.hash) updateData.hash = result.hash
        if (result.cdrData) updateData.cdrData = result.cdrData // Guardar CDR como fallback
        if (result.xmlFirmado) updateData.xmlData = result.xmlFirmado // Guardar XML firmado como fallback
        if (xmlStorageUrl) updateData.xmlStorageUrl = xmlStorageUrl
        if (cdrStorageUrl) updateData.cdrStorageUrl = cdrStorageUrl
      }

      await guideRef.update(removeUndefined(updateData))

      console.log(`✅ [GRE-T] Guía actualizada con estado: ${updateData.sunatStatus}`)

      // 6. Responder al cliente
      res.status(200).json({
        success: result.success,
        accepted: result.accepted,
        method: result.method,
        responseCode: result.responseCode,
        description: result.description,
        error: result.error,
        guideNumber: guideData.number,
        sunatStatus: updateData.sunatStatus
      })

    } catch (error) {
      console.error('❌ [GRE-T] Error en sendCarrierDispatchGuideToSunat:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Error interno del servidor'
      })
    }
  }
)

// ========================================
// REENVÍO AUTOMÁTICO DE DOCUMENTOS PENDIENTES
// ========================================

/**
 * Cron Job: Reenviar documentos pendientes a SUNAT
 *
 * Se ejecuta cada 2 horas y busca:
 * - Facturas/Boletas con sunatStatus = 'pending'
 * - Que tengan más de 5 minutos de creadas (para no interferir con envíos en curso)
 * - Que no hayan excedido el máximo de reintentos (50)
 *
 * Con 50 reintentos cada 2 horas = 100 horas (4+ días) de cobertura
 * Esto es más que suficiente para caídas prolongadas de SUNAT
 *
 * Esto soluciona el problema de cuando SUNAT se cae por horas:
 * - Los documentos quedan como 'pending'
 * - Este job los reenvía automáticamente cuando SUNAT vuelve
 * - El usuario no tiene que hacer nada manualmente
 */
export const retryPendingInvoices = onSchedule(
  {
    schedule: 'every 30 minutes',
    timeZone: 'America/Lima',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 1800, // 30 minutos máximo para scheduled functions
  },
  async (event) => {
    console.log('🔄 [RETRY] Iniciando reenvío automático de documentos pendientes...')

    const MAX_RETRIES = 50 // 50 reintentos x 2 horas = 100 horas de cobertura
    const MIN_AGE_MINUTES = 5 // No procesar documentos muy recientes
    const BATCH_SIZE = 100 // Procesar máximo 100 por ejecución

    try {
      // Verificar flag global de pausa para restaurantes
      let pauseSunatRestaurants = false
      let pauseSunatExceptions = []
      try {
        const adminSettingsDoc = await db.collection('config').doc('adminSettings').get()
        if (adminSettingsDoc.exists) {
          const adminData = adminSettingsDoc.data()
          pauseSunatRestaurants = adminData?.system?.pauseSunatRestaurants === true
          pauseSunatExceptions = adminData?.system?.pauseSunatExceptions || []
        }
      } catch (adminErr) {
        console.warn('⚠️ [RETRY] No se pudo leer adminSettings:', adminErr.message)
      }

      if (pauseSunatRestaurants) {
        console.log('⏸️ [RETRY] Pausa activa para restaurantes con IGV reducido')
        if (pauseSunatExceptions.length > 0) {
          console.log(`✅ [RETRY] Excepciones: ${pauseSunatExceptions.join(', ')}`)
        }
      }

      // Obtener todos los negocios
      const businessesSnapshot = await db.collection('businesses').get()

      let totalProcessed = 0
      let totalSuccess = 0
      let totalFailed = 0
      let totalSkipped = 0

      for (const businessDoc of businessesSnapshot.docs) {
        const businessId = businessDoc.id
        const businessData = businessDoc.data()

        // Verificar que el negocio tenga configuración de emisión
        if (!businessData.emissionConfig && !businessData.sunat?.enabled && !businessData.qpse?.enabled) {
          continue // Saltar negocios sin configuración SUNAT
        }

        // Respetar configuración de envío automático: solo reenviar si está EXPLÍCITAMENTE activado.
        // Usar !== true (no === false) para que negocios con el campo undefined caigan al default OFF,
        // consistente con el frontend (POS.jsx) y con cómo el toggle se muestra apagado en Settings.jsx.
        if (businessData.autoSendToSunat !== true) {
          continue
        }

        // Determinar si este negocio con IGV reducido tiene pausa activa (solo aplica a facturas)
        let skipFacturas = false
        if (pauseSunatRestaurants && !pauseSunatExceptions.includes(businessId)) {
          const taxConfig = businessData.emissionConfig?.taxConfig
          const isReducedIgv = taxConfig?.taxType === 'reduced' || taxConfig?.igvRate === 10.5
          if (isReducedIgv) {
            skipFacturas = true
            console.log(`⏸️ [RETRY] Negocio ${businessId}: Pausa activa para facturas (IGV reducido), boletas se procesan normalmente`)
          }
        }

        // Buscar facturas/boletas pendientes de este negocio
        const invoicesRef = db.collection('businesses').doc(businessId).collection('invoices')

        const pendingInvoices = await invoicesRef
          .where('sunatStatus', '==', 'pending')
          .where('documentType', 'in', skipFacturas ? ['boleta'] : ['factura', 'boleta'])
          .limit(BATCH_SIZE)
          .get()

        if (pendingInvoices.empty) {
          continue
        }

        console.log(`📋 [RETRY] Negocio ${businessId}: ${pendingInvoices.size} documentos pendientes${skipFacturas ? ' (solo boletas)' : ''}`)

        // Mapear emissionConfig al formato esperado (igual que en sendInvoiceToSunat)
        const businessDataForEmission = { ...businessData }
        if (businessData.emissionConfig) {
          const config = businessData.emissionConfig
          if (config.method === 'qpse') {
            businessDataForEmission.qpse = {
              enabled: config.qpse.enabled !== false,
              usuario: config.qpse.usuario,
              password: config.qpse.password,
              environment: config.qpse.environment || 'demo',
            }
            businessDataForEmission.sunat = { enabled: false }
          } else if (config.method === 'sunat_direct') {
            businessDataForEmission.sunat = {
              enabled: config.sunat.enabled !== false,
              environment: config.sunat.environment || 'beta',
              solUser: config.sunat.solUser,
              solPassword: config.sunat.solPassword,
              certificateName: config.sunat.certificateName,
              certificatePassword: config.sunat.certificatePassword,
              certificateData: config.sunat.certificateData,
            }
            businessDataForEmission.qpse = { enabled: false }
          }
        }

        for (const invoiceDoc of pendingInvoices.docs) {
          const invoiceData = invoiceDoc.data()
          const invoiceId = invoiceDoc.id

          // Verificar antigüedad (no procesar documentos muy recientes)
          const createdAt = invoiceData.createdAt?.toDate?.() || new Date(invoiceData.createdAt)
          const ageMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60)

          if (ageMinutes < MIN_AGE_MINUTES) {
            console.log(`⏳ [RETRY] ${invoiceData.series}-${invoiceData.correlativeNumber}: Muy reciente (${ageMinutes.toFixed(1)} min), saltando`)
            totalSkipped++
            continue
          }

          // Verificar máximo de reintentos
          const retryCount = invoiceData.retryCount || 0
          if (retryCount >= MAX_RETRIES) {
            console.log(`❌ [RETRY] ${invoiceData.series}-${invoiceData.correlativeNumber}: Máximo de reintentos alcanzado (${retryCount})`)

            // Marcar como failed_permanent
            await invoicesRef.doc(invoiceId).update({
              sunatStatus: 'failed_permanent',
              sunatDescription: `Falló después de ${retryCount} intentos automáticos`,
              updatedAt: FieldValue.serverTimestamp()
            })

            totalFailed++
            continue
          }

          try {
            const docNumber = `${invoiceData.series}-${invoiceData.correlativeNumber}`
            console.log(`🚀 [RETRY] Procesando ${docNumber} (intento ${retryCount + 1})...`)

            // ── PRE-VERIFICACIÓN: Consultar si SUNAT ya tiene el documento ──
            // Solo para SUNAT directo + facturas (getStatusCdr no soporta boletas ni QPse)
            const isSunatDirect = !!(businessDataForEmission.sunat?.enabled)
            const isFactura = invoiceData.documentType?.toLowerCase() === 'factura'

            if (isSunatDirect && isFactura) {
              try {
                console.log(`🔍 [RETRY] Verificando si SUNAT ya tiene ${docNumber}...`)
                const statusCheck = await getStatusCdr({
                  ruc: businessData.ruc,
                  solUser: businessDataForEmission.sunat.solUser,
                  solPassword: businessDataForEmission.sunat.solPassword,
                  environment: businessDataForEmission.sunat.environment || 'beta',
                  documentType: '01',
                  series: invoiceData.series,
                  number: String(invoiceData.correlativeNumber)
                })

                if (statusCheck.success && statusCheck.accepted) {
                  console.log(`✅ [RETRY] SUNAT ya tiene ${docNumber} - marcando como aceptado SIN reenviar`)

                  // Guardar CDR si está disponible
                  let cdrStorageUrl = null
                  if (statusCheck.cdrData) {
                    try {
                      cdrStorageUrl = await saveToStorage(businessId, invoiceId, `${docNumber}-CDR.xml`, statusCheck.cdrData)
                    } catch (storageErr) {
                      console.error('⚠️ Error guardando CDR:', storageErr.message)
                    }
                  }

                  await invoicesRef.doc(invoiceId).update({
                    sunatStatus: 'accepted',
                    sunatResponse: sanitizeForFirestore({
                      code: statusCheck.code || '0',
                      description: 'Documento verificado en SUNAT via getStatusCdr - ya estaba aceptado',
                      method: 'getStatusCdr_recovery',
                      autoRetry: true,
                      ...(cdrStorageUrl && { cdrUrl: cdrStorageUrl })
                    }),
                    sunatSendingStartedAt: null,
                    updatedAt: FieldValue.serverTimestamp()
                  })

                  totalSuccess++
                  totalProcessed++
                  console.log(`✅ [RETRY] ${docNumber}: accepted (verificado sin reenvío)`)
                  continue // No reenviar
                }
              } catch (checkErr) {
                console.log(`⚠️ [RETRY] No se pudo verificar estado en SUNAT: ${checkErr.message} - procediendo con reenvío`)
              }
            }

            // ── REENVÍO: Emitir comprobante ──
            const invoiceForEmission = {
              ...invoiceData,
              correlativeNumber: invoiceData.correlativeNumber,
            }

            const result = await emitirComprobante(invoiceForEmission, businessDataForEmission)

            // ── MANEJO DE 1033: Documento ya registrado en SUNAT ──
            const resultCode = String(result.responseCode || '')
            const resultDesc = (result.description || result.error || '').toLowerCase()
            const is1033 = resultCode === '1033' || resultCode.includes('1033') ||
              resultDesc.includes('registrado previamente') ||
              resultDesc.includes('ha sido aceptada') ||
              resultDesc.includes('ha sido aceptado') ||
              resultDesc.includes('fue informado anteriormente')

            if (is1033 && !result.accepted) {
              console.log(`📋 [RETRY] ${docNumber}: SUNAT dice que ya existe (1033) - tratando como aceptado`)
              result.accepted = true
            }

            // Determinar estado final
            const isTransient = isTransientSunatError(result.responseCode, result.description)

            let finalStatus
            if (result.accepted) {
              finalStatus = 'accepted'
              totalSuccess++
            } else if (isTransient) {
              finalStatus = 'pending' // Mantener para próximo reintento
              totalSkipped++
            } else {
              finalStatus = 'rejected'
              totalFailed++
            }

            // Actualizar documento
            const updateData = {
              sunatStatus: finalStatus,
              sunatResponse: sanitizeForFirestore({
                code: result.responseCode || '',
                description: result.description || '',
                method: result.method,
                autoRetry: true
              }),
              sunatSendingStartedAt: null,
              updatedAt: FieldValue.serverTimestamp()
            }

            if (isTransient && !result.accepted) {
              updateData.retryCount = FieldValue.increment(1)
              updateData.lastRetryError = sanitizeForFirestore({
                code: result.responseCode || '',
                description: result.description || '',
                timestamp: new Date().toISOString()
              })
            }

            await invoicesRef.doc(invoiceId).update(updateData)

            console.log(`✅ [RETRY] ${docNumber}: ${finalStatus}`)
            totalProcessed++

          } catch (invoiceError) {
            console.error(`❌ [RETRY] Error procesando ${invoiceData.series}-${invoiceData.correlativeNumber}:`, invoiceError.message)

            // Incrementar contador de reintentos
            await invoicesRef.doc(invoiceId).update({
              retryCount: FieldValue.increment(1),
              lastRetryError: {
                message: invoiceError.message,
                timestamp: new Date().toISOString()
              },
              updatedAt: FieldValue.serverTimestamp()
            })

            totalFailed++
          }

          // Pequeña pausa entre documentos para no sobrecargar SUNAT
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      console.log('═══════════════════════════════════════════════════════')
      console.log(`📊 [RETRY] Resumen:`)
      console.log(`   - Procesados: ${totalProcessed}`)
      console.log(`   - Exitosos: ${totalSuccess}`)
      console.log(`   - Fallidos: ${totalFailed}`)
      console.log(`   - Saltados: ${totalSkipped}`)
      console.log('═══════════════════════════════════════════════════════')

    } catch (error) {
      console.error('❌ [RETRY] Error en cron job:', error)
    }
  }
)

/**
 * Función simple para reenviar TODAS las boletas pendientes a SUNAT
 *
 * Busca boletas con sunatStatus = 'pending' o 'sending' (atascadas)
 * Sin límite de reintentos - diseñada para resolver boletas acumuladas
 * Solo procesa boletas (facturas siguen pausadas si aplica)
 *
 * Uso: POST /resendPendingBoletas
 * Body opcional: { "businessId": "xxx" } para procesar solo un negocio
 */
export const resendPendingBoletas = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 3600,
    memory: '512MiB',
    cors: true,
  },
  async (req, res) => {
    console.log('🔄 [RESEND-BOLETAS] Iniciando reenvío de boletas pendientes...')

    const filterBusinessId = req.body?.businessId || req.query?.businessId
    const BATCH_SIZE = 200

    try {
      const businessesSnapshot = filterBusinessId
        ? await db.collection('businesses').doc(filterBusinessId).get()
        : await db.collection('businesses').get()

      const businessDocs = filterBusinessId
        ? (businessesSnapshot.exists ? [businessesSnapshot] : [])
        : businessesSnapshot.docs

      let totalFound = 0
      let totalSuccess = 0
      let totalFailed = 0
      const details = []

      for (const businessDoc of businessDocs) {
        const businessId = businessDoc.id
        const businessData = businessDoc.data()

        // Verificar que tenga configuración de emisión
        if (!businessData.emissionConfig && !businessData.sunat?.enabled && !businessData.qpse?.enabled) {
          continue
        }

        // Respetar configuración de envío automático: solo reenviar si está EXPLÍCITAMENTE activado.
        // Usar !== true (no === false) para que negocios con el campo undefined caigan al default OFF,
        // consistente con el frontend (POS.jsx) y con cómo el toggle se muestra apagado en Settings.jsx.
        if (businessData.autoSendToSunat !== true) {
          continue
        }

        const invoicesRef = db.collection('businesses').doc(businessId).collection('invoices')

        // Buscar boletas pendientes (pending o sending atascadas)
        const pendingBoletas = await invoicesRef
          .where('sunatStatus', 'in', ['pending', 'sending'])
          .where('documentType', '==', 'boleta')
          .limit(BATCH_SIZE)
          .get()

        if (pendingBoletas.empty) {
          continue
        }

        console.log(`📋 [RESEND-BOLETAS] Negocio ${businessId}: ${pendingBoletas.size} boletas pendientes`)
        details.push({ businessId, boletasCount: pendingBoletas.size })
        totalFound += pendingBoletas.size

        // Mapear emissionConfig al formato esperado
        const businessDataForEmission = { ...businessData }
        if (businessData.emissionConfig) {
          const config = businessData.emissionConfig
          if (config.method === 'qpse') {
            businessDataForEmission.qpse = {
              enabled: config.qpse.enabled !== false,
              usuario: config.qpse.usuario,
              password: config.qpse.password,
              environment: config.qpse.environment || 'demo',
            }
            businessDataForEmission.sunat = { enabled: false }
          } else if (config.method === 'sunat_direct') {
            businessDataForEmission.sunat = {
              enabled: config.sunat.enabled !== false,
              environment: config.sunat.environment || 'beta',
              solUser: config.sunat.solUser,
              solPassword: config.sunat.solPassword,
              certificateName: config.sunat.certificateName,
              certificatePassword: config.sunat.certificatePassword,
              certificateData: config.sunat.certificateData,
            }
            businessDataForEmission.qpse = { enabled: false }
          }
        }

        for (const invoiceDoc of pendingBoletas.docs) {
          const invoiceData = invoiceDoc.data()
          const invoiceId = invoiceDoc.id

          // Si está en 'sending', verificar que lleve más de 2 minutos atascada
          if (invoiceData.sunatStatus === 'sending') {
            const sendingStartedAt = invoiceData.sunatSendingStartedAt?.toDate?.() || invoiceData.sunatSendingStartedAt
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
            if (sendingStartedAt && sendingStartedAt > twoMinutesAgo) {
              console.log(`⏳ [RESEND-BOLETAS] ${invoiceData.series}-${invoiceData.correlativeNumber}: En proceso de envío reciente, saltando`)
              continue
            }
          }

          try {
            console.log(`🚀 [RESEND-BOLETAS] Enviando ${invoiceData.series}-${invoiceData.correlativeNumber} (status: ${invoiceData.sunatStatus}, retryCount: ${invoiceData.retryCount || 0})...`)

            const invoiceForEmission = {
              ...invoiceData,
              correlativeNumber: invoiceData.correlativeNumber,
            }

            const result = await emitirComprobante(invoiceForEmission, businessDataForEmission)

            // Manejo de 1033: Documento ya registrado en SUNAT
            const resCode = String(result.responseCode || '')
            const resDesc = (result.description || result.error || '').toLowerCase()
            const is1033 = resCode === '1033' || resCode.includes('1033') ||
              resDesc.includes('registrado previamente') ||
              resDesc.includes('ha sido aceptada') ||
              resDesc.includes('fue informado anteriormente')

            if (is1033 && !result.accepted) {
              console.log(`📋 [RESEND-BOLETAS] ${invoiceData.series}-${invoiceData.correlativeNumber}: SUNAT ya lo tiene (1033) - aceptado`)
              result.accepted = true
            }

            const isTransient = isTransientSunatError(result.responseCode, result.description)

            let finalStatus
            if (result.accepted) {
              finalStatus = 'accepted'
              totalSuccess++
            } else if (isTransient) {
              finalStatus = 'pending'
            } else {
              finalStatus = 'rejected'
              totalFailed++
            }

            await invoicesRef.doc(invoiceId).update({
              sunatStatus: finalStatus,
              sunatResponse: sanitizeForFirestore({
                code: result.responseCode || '',
                description: result.description || '',
                method: result.method,
                autoRetry: true,
                resendBoletas: true
              }),
              retryCount: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp()
            })

            console.log(`${result.accepted ? '✅' : '❌'} [RESEND-BOLETAS] ${invoiceData.series}-${invoiceData.correlativeNumber}: ${finalStatus}`)

          } catch (invoiceError) {
            console.error(`❌ [RESEND-BOLETAS] Error ${invoiceData.series}-${invoiceData.correlativeNumber}:`, invoiceError.message)
            totalFailed++
          }

          // Pausa entre documentos
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      const summary = { totalFound, totalSuccess, totalFailed }
      console.log('📊 [RESEND-BOLETAS] Resumen:', JSON.stringify(summary))

      res.status(200).json({
        success: true,
        message: 'Reenvío de boletas completado',
        summary,
        details,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('❌ [RESEND-BOLETAS] Error:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  }
)

/**
 * HTTP Endpoint para probar/ejecutar el reintento manual de documentos pendientes
 *
 * Uso: POST /testRetryPendingInvoices
 * Body opcional: { "businessId": "xxx" } para procesar solo un negocio
 *
 * IMPORTANTE: Esta función es para testing, se recomienda eliminar en producción
 * o proteger con autenticación
 */
export const testRetryPendingInvoices = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 3600,
    memory: '512MiB',
    cors: true,
  },
  async (req, res) => {
    console.log('🔄 [RETRY-TEST] Iniciando reenvío MANUAL de documentos pendientes...')

    const MAX_RETRIES = 50
    const MIN_AGE_MINUTES = 5
    const BATCH_SIZE = 100

    // Permitir filtrar por businessId específico
    const filterBusinessId = req.body?.businessId || req.query?.businessId

    try {
      // Verificar flag global de pausa para restaurantes
      let pauseSunatRestaurants = false
      let pauseSunatExceptions = []
      try {
        const adminSettingsDoc = await db.collection('config').doc('adminSettings').get()
        if (adminSettingsDoc.exists) {
          const adminData = adminSettingsDoc.data()
          pauseSunatRestaurants = adminData?.system?.pauseSunatRestaurants === true
          pauseSunatExceptions = adminData?.system?.pauseSunatExceptions || []
        }
      } catch (adminErr) {
        console.warn('⚠️ [RETRY-TEST] No se pudo leer adminSettings:', adminErr.message)
      }

      let businessQuery = db.collection('businesses')

      if (filterBusinessId) {
        console.log(`📋 [RETRY-TEST] Filtrando por negocio: ${filterBusinessId}`)
      }

      const businessesSnapshot = filterBusinessId
        ? await db.collection('businesses').doc(filterBusinessId).get()
        : await businessQuery.get()

      let totalProcessed = 0
      let totalSuccess = 0
      let totalFailed = 0
      let totalSkipped = 0
      const details = []

      const businessDocs = filterBusinessId
        ? (businessesSnapshot.exists ? [businessesSnapshot] : [])
        : businessesSnapshot.docs

      for (const businessDoc of businessDocs) {
        const businessId = businessDoc.id
        const businessData = businessDoc.data()

        if (!businessData.emissionConfig && !businessData.sunat?.enabled && !businessData.qpse?.enabled) {
          continue
        }

        // Respetar configuración de envío automático: solo reenviar si está EXPLÍCITAMENTE activado.
        // Usar !== true (no === false) para que negocios con el campo undefined caigan al default OFF,
        // consistente con el frontend (POS.jsx) y con cómo el toggle se muestra apagado en Settings.jsx.
        if (businessData.autoSendToSunat !== true) {
          continue
        }

        // Determinar si este negocio con IGV reducido tiene pausa activa (solo aplica a facturas)
        let skipFacturas = false
        if (pauseSunatRestaurants && !pauseSunatExceptions.includes(businessId)) {
          const taxConfig = businessData.emissionConfig?.taxConfig
          const isReducedIgv = taxConfig?.taxType === 'reduced' || taxConfig?.igvRate === 10.5
          if (isReducedIgv) {
            skipFacturas = true
            console.log(`⏸️ [RETRY-TEST] Negocio ${businessId}: Pausa activa para facturas (IGV reducido), boletas se procesan normalmente`)
          }
        }

        const invoicesRef = db.collection('businesses').doc(businessId).collection('invoices')

        const pendingInvoices = await invoicesRef
          .where('sunatStatus', '==', 'pending')
          .where('documentType', 'in', skipFacturas ? ['boleta'] : ['factura', 'boleta'])
          .limit(BATCH_SIZE)
          .get()

        if (pendingInvoices.empty) {
          continue
        }

        console.log(`📋 [RETRY-TEST] Negocio ${businessId}: ${pendingInvoices.size} documentos pendientes`)
        details.push({ businessId, pendingCount: pendingInvoices.size })

        // Mapear emissionConfig
        const businessDataForEmission = { ...businessData }
        if (businessData.emissionConfig) {
          const config = businessData.emissionConfig
          if (config.method === 'qpse') {
            businessDataForEmission.qpse = {
              enabled: config.qpse.enabled !== false,
              usuario: config.qpse.usuario,
              password: config.qpse.password,
              environment: config.qpse.environment || 'demo',
            }
            businessDataForEmission.sunat = { enabled: false }
          } else if (config.method === 'sunat_direct') {
            businessDataForEmission.sunat = {
              enabled: config.sunat.enabled !== false,
              environment: config.sunat.environment || 'beta',
              solUser: config.sunat.solUser,
              solPassword: config.sunat.solPassword,
              certificateName: config.sunat.certificateName,
              certificatePassword: config.sunat.certificatePassword,
              certificateData: config.sunat.certificateData,
            }
            businessDataForEmission.qpse = { enabled: false }
          }
        }

        for (const invoiceDoc of pendingInvoices.docs) {
          const invoiceData = invoiceDoc.data()
          const invoiceId = invoiceDoc.id

          const createdAt = invoiceData.createdAt?.toDate?.() || new Date(invoiceData.createdAt)
          const ageMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60)

          if (ageMinutes < MIN_AGE_MINUTES) {
            console.log(`⏳ [RETRY-TEST] ${invoiceData.series}-${invoiceData.correlativeNumber}: Muy reciente (${ageMinutes.toFixed(1)} min), saltando`)
            totalSkipped++
            continue
          }

          const retryCount = invoiceData.retryCount || 0
          if (retryCount >= MAX_RETRIES) {
            console.log(`❌ [RETRY-TEST] ${invoiceData.series}-${invoiceData.correlativeNumber}: Máximo de reintentos alcanzado (${retryCount})`)
            await invoicesRef.doc(invoiceId).update({
              sunatStatus: 'failed_permanent',
              sunatDescription: `Falló después de ${retryCount} intentos automáticos`,
              updatedAt: FieldValue.serverTimestamp()
            })
            totalFailed++
            continue
          }

          try {
            console.log(`🚀 [RETRY-TEST] Reenviando ${invoiceData.series}-${invoiceData.correlativeNumber} (intento ${retryCount + 1})...`)

            const invoiceForEmission = {
              ...invoiceData,
              correlativeNumber: invoiceData.correlativeNumber,
            }

            const result = await emitirComprobante(invoiceForEmission, businessDataForEmission)

            // Manejo de 1033: Documento ya registrado en SUNAT
            const testResCode = String(result.responseCode || '')
            const testResDesc = (result.description || result.error || '').toLowerCase()
            const testIs1033 = testResCode === '1033' || testResCode.includes('1033') ||
              testResDesc.includes('registrado previamente') ||
              testResDesc.includes('ha sido aceptada') ||
              testResDesc.includes('fue informado anteriormente')

            if (testIs1033 && !result.accepted) {
              console.log(`📋 [RETRY-TEST] ${invoiceData.series}-${invoiceData.correlativeNumber}: SUNAT ya lo tiene (1033) - aceptado`)
              result.accepted = true
            }

            const isTransient = isTransientSunatError(result.responseCode, result.description)

            let finalStatus
            if (result.accepted) {
              finalStatus = 'accepted'
              totalSuccess++
            } else if (isTransient) {
              finalStatus = 'pending'
              totalSkipped++
            } else {
              finalStatus = 'rejected'
              totalFailed++
            }

            const updateData = {
              sunatStatus: finalStatus,
              sunatResponse: sanitizeForFirestore({
                code: result.responseCode || '',
                description: result.description || '',
                method: result.method,
                autoRetry: true,
                testMode: true
              }),
              updatedAt: FieldValue.serverTimestamp()
            }

            if (isTransient && !result.accepted) {
              updateData.retryCount = FieldValue.increment(1)
              updateData.lastRetryError = sanitizeForFirestore({
                code: result.responseCode || '',
                description: result.description || '',
                timestamp: new Date().toISOString()
              })
            }

            await invoicesRef.doc(invoiceId).update(updateData)
            console.log(`✅ [RETRY-TEST] ${invoiceData.series}-${invoiceData.correlativeNumber}: ${finalStatus}`)
            totalProcessed++

          } catch (invoiceError) {
            console.error(`❌ [RETRY-TEST] Error procesando ${invoiceData.series}-${invoiceData.correlativeNumber}:`, invoiceError.message)
            await invoicesRef.doc(invoiceId).update({
              retryCount: FieldValue.increment(1),
              lastRetryError: {
                message: invoiceError.message,
                timestamp: new Date().toISOString()
              },
              updatedAt: FieldValue.serverTimestamp()
            })
            totalFailed++
          }

          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      const summary = {
        success: true,
        message: 'Reintento manual completado',
        summary: {
          totalProcessed,
          totalSuccess,
          totalFailed,
          totalSkipped
        },
        details,
        timestamp: new Date().toISOString()
      }

      console.log('═══════════════════════════════════════════════════════')
      console.log(`📊 [RETRY-TEST] Resumen:`)
      console.log(`   - Procesados: ${totalProcessed}`)
      console.log(`   - Exitosos: ${totalSuccess}`)
      console.log(`   - Fallidos: ${totalFailed}`)
      console.log(`   - Saltados: ${totalSkipped}`)
      console.log('═══════════════════════════════════════════════════════')

      res.json(summary)

    } catch (error) {
      console.error('❌ [RETRY-TEST] Error:', error)
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * Anula una factura mediante Comunicación de Baja a SUNAT
 *
 * Solo para facturas y notas (no boletas) que:
 * - Tienen CDR aceptado
 * - No han sido entregadas al cliente
 * - Están dentro del plazo de 7 días
 */
export const voidInvoice = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
    cors: true,
  },
  async (req, res) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Verificar autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado - Token no proporcionado' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      let decodedToken

      try {
        decodedToken = await auth.verifyIdToken(idToken)
      } catch (authError) {
        console.error('❌ Error al verificar token:', authError)
        res.status(401).json({ error: 'Token inválido o expirado' })
        return
      }

      const authenticatedUserId = decodedToken.uid

      // Obtener datos del body
      const { userId, invoiceId, reason } = req.body

      if (!userId || !invoiceId) {
        res.status(400).json({ error: 'userId e invoiceId son requeridos' })
        return
      }

      // Verificar autorización
      if (authenticatedUserId !== userId) {
        const userDoc = await db.collection('users').doc(authenticatedUserId).get()
        if (!userDoc.exists || userDoc.data().ownerId !== userId) {
          res.status(403).json({ error: 'No autorizado para esta operación' })
          return
        }
      }

      console.log(`🗑️ Iniciando anulación - Usuario: ${userId}, Factura: ${invoiceId}`)

      // 1. Obtener datos de la factura
      const invoiceRef = db.collection('businesses').doc(userId).collection('invoices').doc(invoiceId)
      const invoiceDoc = await invoiceRef.get()

      if (!invoiceDoc.exists) {
        res.status(404).json({ error: 'Factura no encontrada' })
        return
      }

      const invoiceData = invoiceDoc.data()

      // 2. Validar que se puede anular
      // Priorizar emissionDate (fecha del POS) sobre issueDate
      const validationResult = canVoidDocument({
        sunatStatus: invoiceData.sunatStatus,
        delivered: invoiceData.delivered || false,
        issueDate: invoiceData.emissionDate || invoiceData.issueDate,
        documentType: invoiceData.documentType
      })

      if (!validationResult.canVoid) {
        res.status(400).json({
          error: validationResult.reason,
          canVoid: false
        })
        return
      }

      // 3. Obtener datos del negocio
      const businessDoc = await db.collection('businesses').doc(userId).get()
      if (!businessDoc.exists) {
        res.status(404).json({ error: 'Negocio no encontrado' })
        return
      }

      const businessData = businessDoc.data()

      // Obtener configuración de emisión (puede estar en emissionConfig o sunat)
      const emissionConfig = businessData.emissionConfig || {}
      const sunatConfig = emissionConfig.sunat || businessData.sunat || {}

      // Verificar credenciales SUNAT
      if (!sunatConfig.solUser || !sunatConfig.solPassword) {
        res.status(400).json({ error: 'Faltan credenciales SOL de SUNAT' })
        return
      }

      // Obtener certificado (puede estar en certificateData o certificate)
      const certificate = sunatConfig.certificateData || sunatConfig.certificate
      if (!certificate) {
        res.status(400).json({ error: 'Falta certificado digital para firmar' })
        return
      }

      // Guardar en businessData para uso posterior
      businessData.sunatCredentials = {
        solUser: sunatConfig.solUser,
        solPassword: sunatConfig.solPassword,
        certificate: certificate,
        certificatePassword: sunatConfig.certificatePassword || '',
        environment: sunatConfig.environment || 'beta'
      }

      // 4. Generar correlativo para la comunicación de baja
      // IMPORTANTE: Usar zona horaria de Perú (UTC-5) para evitar errores de SUNAT
      // "La fecha del IssueDate no debe ser mayor a la fecha de recepción"
      const nowUTC = new Date()
      const peruOffset = -5 * 60 // UTC-5 en minutos
      const today = new Date(nowUTC.getTime() + (peruOffset - nowUTC.getTimezoneOffset()) * 60000)
      console.log('📅 Fecha actual en Perú:', today.toISOString())

      const voidedDocsRef = db.collection('businesses').doc(userId).collection('voidedDocuments')

      // Buscar el último correlativo del día usando transaction para evitar race conditions
      const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`

      // Usar un documento contador para el día
      const counterDocRef = voidedDocsRef.doc(`counter_${todayStr}`)

      let correlativo = 1
      const counterDoc = await counterDocRef.get()
      if (counterDoc.exists) {
        correlativo = (counterDoc.data().lastCorrelativo || 0) + 1
      }

      // Actualizar contador
      await counterDocRef.set({
        dateStr: todayStr,
        lastCorrelativo: correlativo,
        updatedAt: FieldValue.serverTimestamp()
      })

      const voidedDocId = generateVoidedDocumentId(today, correlativo)

      console.log(`📄 Generando comunicación de baja: ${voidedDocId}`)

      // 5. Generar XML de baja
      // Priorizar emissionDate (fecha elegida por usuario en POS) sobre issueDate y createdAt
      const dateSource = invoiceData.emissionDate || invoiceData.issueDate
      let referenceDateStr
      console.log('📅 emissionDate:', invoiceData.emissionDate, 'issueDate:', invoiceData.issueDate)

      if (typeof dateSource === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateSource)) {
        // String YYYY-MM-DD directo (formato guardado por el POS) - usar tal cual
        referenceDateStr = dateSource
        console.log('📅 Usando fecha de emisión directa (string):', referenceDateStr)
      } else if (dateSource?.toDate) {
        // Firestore Timestamp
        const d = dateSource.toDate()
        const dPeru = new Date(d.getTime() + (peruOffset - d.getTimezoneOffset()) * 60000)
        referenceDateStr = `${dPeru.getFullYear()}-${String(dPeru.getMonth() + 1).padStart(2, '0')}-${String(dPeru.getDate()).padStart(2, '0')}`
        console.log('📅 Usando fecha de emisión (Timestamp):', referenceDateStr)
      } else if (dateSource?._seconds) {
        // Firestore Timestamp serializado
        const d = new Date(dateSource._seconds * 1000)
        const dPeru = new Date(d.getTime() + (peruOffset - d.getTimezoneOffset()) * 60000)
        referenceDateStr = `${dPeru.getFullYear()}-${String(dPeru.getMonth() + 1).padStart(2, '0')}-${String(dPeru.getDate()).padStart(2, '0')}`
        console.log('📅 Usando fecha de emisión (Timestamp serializado):', referenceDateStr)
      } else if (invoiceData.createdAt?.toDate) {
        // Fallback a createdAt
        console.log('⚠️ Usando createdAt como fecha de emisión')
        const d = invoiceData.createdAt.toDate()
        const dPeru = new Date(d.getTime() + (peruOffset - d.getTimezoneOffset()) * 60000)
        referenceDateStr = `${dPeru.getFullYear()}-${String(dPeru.getMonth() + 1).padStart(2, '0')}-${String(dPeru.getDate()).padStart(2, '0')}`
      } else {
        // Último fallback: fecha actual en Perú
        console.log('⚠️ No se encontró fecha de emisión, usando fecha actual')
        referenceDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      }

      console.log('📅 referenceDate final:', referenceDateStr)
      const issueDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      console.log('📅 Fechas generadas - referenceDate (doc):', referenceDateStr, 'issueDate (comunicación):', issueDateStr)

      const voidedXmlData = {
        id: voidedDocId,
        referenceDate: referenceDateStr,
        issueDate: issueDateStr,
        supplier: {
          ruc: businessData.ruc,
          name: businessData.businessName || businessData.name
        },
        documents: [{
          lineId: 1,
          documentType: getVoidDocTypeCode(invoiceData.documentType),
          series: invoiceData.series,
          number: invoiceData.correlativeNumber,
          reason: reason || 'ANULACION DE OPERACION'
        }]
      }

      const voidedXml = generateVoidedDocumentsXML(voidedXmlData)

      console.log('✅ XML de baja generado')

      // 6. Firmar XML
      const signedXml = await signXML(voidedXml, {
        certificate: businessData.sunatCredentials.certificate,
        certificatePassword: businessData.sunatCredentials.certificatePassword
      })

      console.log('✅ XML firmado')

      // 7. Enviar a SUNAT
      const environment = businessData.sunatCredentials.environment

      const sendResult = await sendSummary(signedXml, {
        ruc: businessData.ruc,
        solUser: businessData.sunatCredentials.solUser,
        solPassword: businessData.sunatCredentials.solPassword,
        environment,
        fileName: voidedDocId
      })

      if (!sendResult.success) {
        console.error('❌ Error al enviar a SUNAT:', sendResult.error)
        if (sendResult.rawResponse) {
          console.error('📄 Respuesta raw:', sendResult.rawResponse)
        }

        // Guardar intento fallido
        await voidedDocsRef.add({
          voidedDocId,
          dateStr: todayStr,
          correlativo,
          invoiceId,
          invoiceSeries: invoiceData.series,
          invoiceNumber: invoiceData.correlativeNumber,
          documentType: invoiceData.documentType,
          reason: reason || 'ANULACION DE OPERACION',
          status: 'failed',
          error: sendResult.error,
          rawResponse: sendResult.rawResponse || null,
          createdAt: FieldValue.serverTimestamp()
        })

        res.status(500).json({
          error: sendResult.error || 'Error al enviar comunicación de baja a SUNAT',
          rawResponse: sendResult.rawResponse || null
        })
        return
      }

      console.log(`🎫 Ticket recibido: ${sendResult.ticket}`)

      // 8. Guardar documento de baja con ticket
      const voidedDocRef = await voidedDocsRef.add({
        voidedDocId,
        dateStr: todayStr,
        correlativo,
        invoiceId,
        invoiceSeries: invoiceData.series,
        invoiceNumber: invoiceData.correlativeNumber,
        documentType: invoiceData.documentType,
        reason: reason || 'ANULACION DE OPERACION',
        status: 'pending',
        ticket: sendResult.ticket,
        xmlSent: voidedXml,
        createdAt: FieldValue.serverTimestamp()
      })

      // 9. Marcar factura como "anulando"
      await invoiceRef.update({
        sunatStatus: 'voiding',
        voidingTicket: sendResult.ticket,
        voidedDocumentId: voidedDocRef.id,
        voidReason: reason || 'ANULACION DE OPERACION',
        updatedAt: FieldValue.serverTimestamp()
      })

      // 10. Consultar estado del ticket con reintentos automáticos
      // SUNAT procesa las comunicaciones de baja de forma asíncrona
      // Reintentamos cada 10 segundos hasta obtener respuesta final o timeout
      const MAX_RETRIES = 12 // Máximo 12 intentos (~2 minutos total)
      const RETRY_INTERVAL = 10000 // 10 segundos entre intentos
      let statusResult = null
      let retryCount = 0

      console.log('⏳ Consultando estado del ticket con reintentos automáticos...')

      while (retryCount < MAX_RETRIES) {
        // Esperar antes de consultar (primera vez 5s, luego 10s)
        const waitTime = retryCount === 0 ? 5000 : RETRY_INTERVAL
        console.log(`⏳ Esperando ${waitTime / 1000}s antes de consultar (intento ${retryCount + 1}/${MAX_RETRIES})...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))

        statusResult = await getStatus(sendResult.ticket, {
          ruc: businessData.ruc,
          solUser: businessData.sunatCredentials.solUser,
          solPassword: businessData.sunatCredentials.solPassword,
          environment
        })

        console.log(`📋 Resultado intento ${retryCount + 1}:`, JSON.stringify(statusResult))

        // Si ya no está pendiente (sea aceptado o rechazado), salimos del loop
        if (!statusResult.pending) {
          console.log('✅ SUNAT respondió con resultado final')
          break
        }

        retryCount++
        console.log(`⏳ Aún en proceso (código 98), reintentando...`)
      }

      // Si después de todos los reintentos sigue pendiente
      if (statusResult.pending) {
        console.log('⚠️ Timeout: SUNAT no respondió después de 60 segundos')
        // Aún en proceso, el usuario deberá consultar después
        res.status(202).json({
          success: true,
          status: 'pending',
          ticket: sendResult.ticket,
          voidedDocumentId: voidedDocRef.id,
          message: 'La comunicación de baja está siendo procesada por SUNAT. El proceso puede tomar unos minutos. Consulte el estado más tarde.'
        })
        return
      }

      if (statusResult.success && statusResult.accepted) {
        // Baja aceptada - guardar XML y CDR en Storage
        let voidXmlStorageUrl = null
        let voidCdrStorageUrl = null

        try {
          // Guardar XML firmado de la comunicación de baja
          voidXmlStorageUrl = await saveToStorage(userId, invoiceId, `${voidedDocId}-BAJA.xml`, signedXml)
          console.log(`📁 XML de baja guardado en Storage: ${voidXmlStorageUrl ? 'OK' : 'NO'}`)

          // Guardar CDR de la baja
          if (statusResult.cdrData) {
            voidCdrStorageUrl = await saveToStorage(userId, invoiceId, `${voidedDocId}-CDR-BAJA.xml`, statusResult.cdrData)
            console.log(`📁 CDR de baja guardado en Storage: ${voidCdrStorageUrl ? 'OK' : 'NO'}`)
          }
        } catch (storageError) {
          console.error('⚠️ Error guardando archivos de baja en Storage:', storageError.message)
        }

        await voidedDocsRef.doc(voidedDocRef.id).update({
          status: 'accepted',
          cdrData: statusResult.cdrData || null,
          responseCode: statusResult.code || null,
          responseDescription: statusResult.description || null,
          voidXmlStorageUrl: voidXmlStorageUrl || null,
          voidCdrStorageUrl: voidCdrStorageUrl || null,
          processedAt: FieldValue.serverTimestamp()
        })

        // Actualizar factura: estado SUNAT y estado de pago
        await invoiceRef.update({
          sunatStatus: 'voided',
          status: 'voided',
          voidedAt: FieldValue.serverTimestamp(),
          voidCdrData: statusResult.cdrData || null,
          voidXmlStorageUrl: voidXmlStorageUrl || null,
          voidCdrStorageUrl: voidCdrStorageUrl || null,
        })

        // Si es una Nota de Crédito, restaurar la factura/boleta original
        if (invoiceData.documentType === 'nota_credito' && invoiceData.referencedDocumentId) {
          console.log(`🔄 Restaurando documento original: ${invoiceData.referencedDocumentId}`)
          try {
            // Buscar la factura/boleta original por su número
            const invoicesRef = db.collection('businesses').doc(userId).collection('invoices')
            const originalQuery = await invoicesRef
              .where('number', '==', invoiceData.referencedDocumentId)
              .limit(1)
              .get()

            if (!originalQuery.empty) {
              const originalDoc = originalQuery.docs[0]
              const originalData = originalDoc.data()

              // Determinar el nuevo estado de la factura original
              // Si tenía un estado de pago antes de la NC, restaurarlo
              let newStatus = 'paid' // Por defecto, asumimos que estaba pagada
              if (originalData.previousStatus) {
                newStatus = originalData.previousStatus
              } else if (originalData.paymentStatus === 'pending' || originalData.status === 'pending') {
                newStatus = 'pending'
              }

              // Restaurar la factura original
              await originalDoc.ref.update({
                status: newStatus,
                pendingCreditNoteId: FieldValue.delete(),
                pendingCreditNoteNumber: FieldValue.delete(),
                pendingCreditNoteTotal: FieldValue.delete(),
                creditNoteVoidedAt: FieldValue.serverTimestamp(),
                creditNoteVoidedId: invoiceId,
                creditNoteVoidedNumber: invoiceData.number,
                updatedAt: FieldValue.serverTimestamp()
              })

              console.log(`✅ Factura ${invoiceData.referencedDocumentId} restaurada a estado: ${newStatus}`)

              // Descontar stock (reversar la devolución que hizo la NC)
              if (invoiceData.items && invoiceData.items.length > 0) {
                console.log('📦 Revirtiendo devolución de stock de la NC...')
                for (const item of invoiceData.items) {
                  if (item.productId && !item.productId.startsWith('custom-')) {
                    try {
                      const productRef = db.collection('businesses').doc(userId).collection('products').doc(item.productId)
                      const productDoc = await productRef.get()
                      if (productDoc.exists) {
                        const currentStock = productDoc.data().stock || 0
                        const newStock = Math.max(0, currentStock - (item.quantity || 0))
                        await productRef.update({
                          stock: newStock,
                          updatedAt: FieldValue.serverTimestamp()
                        })
                        console.log(`  ✅ Stock descontado (reversión NC): ${item.name} -${item.quantity}`)
                      }
                    } catch (stockError) {
                      console.error(`  ❌ Error descontando stock de ${item.name}:`, stockError.message)
                    }
                  }
                }
              }
            } else {
              console.log(`⚠️ No se encontró el documento original: ${invoiceData.referencedDocumentId}`)
            }
          } catch (restoreError) {
            console.error('❌ Error al restaurar documento original:', restoreError.message)
          }
        } else {
          // NOTA: La devolución de stock se maneja en el frontend
          // usando updateProductStockTransaction (transacción atómica) + createStockMovement.
          // No devolver stock aquí para evitar doble devolución.
          console.log('📦 Stock será devuelto por el frontend (evitando doble devolución)')
        }

        // Actualizar estadísticas del cliente (si existe)
        if (invoiceData.customer?.documentNumber) {
          try {
            const customersRef = db.collection('businesses').doc(userId).collection('customers')
            const customerQuery = await customersRef
              .where('documentNumber', '==', invoiceData.customer.documentNumber)
              .limit(1)
              .get()

            if (!customerQuery.empty) {
              const customerDoc = customerQuery.docs[0]
              const customerData = customerDoc.data()
              const newOrdersCount = Math.max(0, (customerData.ordersCount || 1) - 1)
              const newTotalSpent = Math.max(0, (customerData.totalSpent || invoiceData.total) - (invoiceData.total || 0))

              await customerDoc.ref.update({
                ordersCount: newOrdersCount,
                totalSpent: newTotalSpent,
                updatedAt: FieldValue.serverTimestamp()
              })
              console.log(`👤 Estadísticas de cliente actualizadas: ${invoiceData.customer.documentNumber}`)
            }
          } catch (customerError) {
            console.error('❌ Error actualizando estadísticas del cliente:', customerError.message)
          }
        }

        console.log(`✅ Factura ${invoiceData.series}-${invoiceData.correlativeNumber} anulada exitosamente`)

        res.status(200).json({
          success: true,
          status: 'voided',
          message: 'Factura anulada exitosamente en SUNAT',
          voidedDocumentId: voidedDocRef.id
        })
        return
      }

      // Error en la baja
      const errorMsg = statusResult.error || statusResult.description || 'SUNAT rechazó la comunicación de baja'
      const errorCode = String(statusResult.code || '')

      // Verificar si SUNAT dice que la baja ya fue procesada (reintento)
      const voidErrLower = errorMsg.toLowerCase()
      const isVoidAlreadyProcessed = (
        errorCode === '1033' || errorCode.includes('1033') ||
        voidErrLower.includes('ya fue comunicad') ||
        voidErrLower.includes('ya existe') ||
        voidErrLower.includes('registrad') && voidErrLower.includes('baja')
      )

      if (isVoidAlreadyProcessed) {
        console.log(`📋 La baja ya fue procesada por SUNAT - tratando como ANULADO`)
        await voidedDocsRef.doc(voidedDocRef.id).update({
          status: 'accepted',
          responseCode: errorCode,
          processedAt: FieldValue.serverTimestamp()
        })
        await invoiceRef.update({
          sunatStatus: 'voided',
          status: 'voided',
          voidedAt: FieldValue.serverTimestamp(),
          voidedDocumentId: voidedDocRef.id,
        })
        res.status(200).json({
          success: true,
          status: 'voided',
          message: 'La baja ya fue procesada por SUNAT previamente',
          voidedDocumentId: voidedDocRef.id
        })
        return
      }

      console.error(`❌ Baja rechazada por SUNAT: code=${errorCode}, msg=${errorMsg}`)

      await voidedDocsRef.doc(voidedDocRef.id).update({
        status: 'rejected',
        error: errorMsg,
        responseCode: errorCode,
        processedAt: FieldValue.serverTimestamp()
      })

      await invoiceRef.update({
        sunatStatus: 'accepted', // Volver al estado anterior
        voidingTicket: null,
        voidError: errorMsg,
        updatedAt: FieldValue.serverTimestamp()
      })

      res.status(400).json({
        success: false,
        error: `SUNAT rechazó la anulación (código ${errorCode}): ${errorMsg}`
      })

    } catch (error) {
      console.error('❌ Error al anular factura:', error)
      res.status(500).json({ error: error.message || 'Error interno del servidor' })
    }
  }
)

/**
 * Consulta el estado de una comunicación de baja pendiente
 */
export const checkVoidStatus = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true,
  },
  async (req, res) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Verificar autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      await auth.verifyIdToken(idToken)

      const { userId, voidedDocumentId } = req.body

      if (!userId || !voidedDocumentId) {
        res.status(400).json({ error: 'userId y voidedDocumentId son requeridos' })
        return
      }

      // Obtener documento de baja
      const voidedDocRef = db.collection('businesses').doc(userId).collection('voidedDocuments').doc(voidedDocumentId)
      const voidedDoc = await voidedDocRef.get()

      if (!voidedDoc.exists) {
        res.status(404).json({ error: 'Documento de baja no encontrado' })
        return
      }

      const voidedData = voidedDoc.data()

      // Si ya está procesado, retornar estado
      if (voidedData.status !== 'pending') {
        res.status(200).json({
          status: voidedData.status,
          responseCode: voidedData.responseCode,
          responseDescription: voidedData.responseDescription,
          error: voidedData.error
        })
        return
      }

      // Consultar estado en SUNAT
      const businessDoc = await db.collection('businesses').doc(userId).get()
      const businessData = businessDoc.data()
      const invoiceRef = db.collection('businesses').doc(userId).collection('invoices').doc(voidedData.invoiceId)

      // Detectar si fue enviado por QPSe o SUNAT directo
      const isQPse = voidedData.method === 'qpse'

      if (isQPse) {
        // Consultar estado vía QPSe
        const emissionConfig = businessData.emissionConfig || {}
        let qpseConfig = null
        if (emissionConfig.method === 'qpse' && emissionConfig.qpse) {
          qpseConfig = emissionConfig.qpse
        } else if (businessData.qpse?.enabled) {
          qpseConfig = businessData.qpse
        }

        if (!qpseConfig?.usuario || !qpseConfig?.password) {
          res.status(400).json({ error: 'QPSe no está configurado' })
          return
        }

        const token = await obtenerToken(qpseConfig.usuario, qpseConfig.password, qpseConfig.environment || 'demo')
        const nombreArchivo = `${businessData.ruc}-${voidedData.voidedDocId}`
        const estadoQPse = await consultarEstado(nombreArchivo, token, qpseConfig.environment || 'demo')

        const codigo = estadoQPse?.codigo || estadoQPse?.code || estadoQPse?.estado || ''
        const accepted = codigo === '0' || codigo === '0000' || estadoQPse?.sunat_success === true

        if (accepted) {
          await voidedDocRef.update({
            status: 'accepted',
            responseCode: codigo,
            responseDescription: estadoQPse?.descripcion || 'Anulación aceptada',
            cdrUrl: estadoQPse?.url_cdr || null,
            processedAt: FieldValue.serverTimestamp()
          })
          await invoiceRef.update({
            sunatStatus: 'voided',
            status: 'voided',
            voidedAt: FieldValue.serverTimestamp()
          })
          res.status(200).json({ status: 'voided', message: 'Documento anulado exitosamente' })
        } else if (codigo === '98' || codigo === '99' || codigo === 'PROCESANDO') {
          res.status(200).json({ status: 'pending', message: 'Aún en proceso en SUNAT' })
        } else {
          const errorMsg = estadoQPse?.descripcion || estadoQPse?.errores?.join(' | ') || 'Error desconocido'
          await voidedDocRef.update({
            status: 'rejected',
            error: errorMsg,
            processedAt: FieldValue.serverTimestamp()
          })
          await invoiceRef.update({
            sunatStatus: 'accepted',
            voidingTicket: null,
            voidError: errorMsg
          })
          res.status(200).json({ status: 'rejected', error: errorMsg })
        }
      } else {
        // SUNAT directo: consultar con ticket
        const emissionConfig = businessData.emissionConfig || {}
        const sunatConfig = emissionConfig.sunat || businessData.sunat || {}

        const statusResult = await getStatus(voidedData.ticket, {
          ruc: businessData.ruc,
          solUser: sunatConfig.solUser,
          solPassword: sunatConfig.solPassword,
          environment: sunatConfig.environment || 'beta'
        })

        if (statusResult.pending) {
          res.status(200).json({
            status: 'pending',
            message: 'Aún en proceso'
          })
          return
        }

        if (statusResult.success && statusResult.accepted) {
          await voidedDocRef.update({
            status: 'accepted',
            cdrData: statusResult.cdrData || null,
            responseCode: statusResult.code,
            responseDescription: statusResult.description,
            processedAt: FieldValue.serverTimestamp()
          })

          await invoiceRef.update({
            sunatStatus: 'voided',
            voidedAt: FieldValue.serverTimestamp()
          })

          res.status(200).json({
            status: 'voided',
            message: 'Factura anulada exitosamente'
          })
        } else {
          await voidedDocRef.update({
            status: 'rejected',
            error: statusResult.error,
            processedAt: FieldValue.serverTimestamp()
          })

          await invoiceRef.update({
            sunatStatus: 'accepted',
            voidingTicket: null,
            voidError: statusResult.error
          })

          res.status(200).json({
            status: 'rejected',
            error: statusResult.error
          })
        }
      }

    } catch (error) {
      console.error('❌ Error al consultar estado:', error)
      res.status(500).json({ error: error.message })
    }
  }
)

/**
 * Anula una boleta de venta mediante Resumen Diario con ConditionCode 3
 *
 * Las boletas se anulan con SummaryDocuments (Resumen Diario), NO con VoidedDocuments.
 * Esto es diferente a las facturas que usan Comunicación de Baja.
 *
 * Requisitos:
 * - La boleta debe estar aceptada por SUNAT
 * - No debe haber sido entregada al cliente
 * - Debe estar dentro del plazo de 7 días
 */
export const voidBoleta = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
    cors: true,
  },
  async (req, res) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Verificar autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado - Token no proporcionado' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      let decodedToken

      try {
        decodedToken = await auth.verifyIdToken(idToken)
      } catch (authError) {
        console.error('❌ Error al verificar token:', authError)
        res.status(401).json({ error: 'Token inválido o expirado' })
        return
      }

      const authenticatedUserId = decodedToken.uid

      // Obtener datos del body
      const { userId, invoiceId, reason } = req.body

      if (!userId || !invoiceId) {
        res.status(400).json({ error: 'userId e invoiceId son requeridos' })
        return
      }

      // Verificar autorización
      if (authenticatedUserId !== userId) {
        const userDoc = await db.collection('users').doc(authenticatedUserId).get()
        if (!userDoc.exists || userDoc.data().ownerId !== userId) {
          res.status(403).json({ error: 'No autorizado para esta operación' })
          return
        }
      }

      console.log(`🗑️ Iniciando anulación de boleta - Usuario: ${userId}, Boleta: ${invoiceId}`)

      // 1. Obtener datos de la boleta
      const boletaRef = db.collection('businesses').doc(userId).collection('invoices').doc(invoiceId)
      const boletaDoc = await boletaRef.get()

      if (!boletaDoc.exists) {
        res.status(404).json({ error: 'Boleta no encontrada' })
        return
      }

      const boletaData = boletaDoc.data()

      // 2. Validar que sea una boleta (serie empieza con B)
      const series = boletaData.series || boletaData.number?.split('-')[0] || ''
      if (!series.toUpperCase().startsWith('B')) {
        res.status(400).json({
          error: 'Este documento no es una boleta. Use la función voidInvoice para facturas.',
          documentType: boletaData.documentType,
          series: series
        })
        return
      }

      // 3. Validar que se puede anular
      const validationResult = canVoidBoleta({
        sunatStatus: boletaData.sunatStatus,
        delivered: boletaData.delivered || false,
        issueDate: boletaData.issueDate,
        documentType: boletaData.documentType,
        series: series
      })

      if (!validationResult.canVoid) {
        res.status(400).json({
          error: validationResult.reason,
          canVoid: false
        })
        return
      }

      // 4. Obtener datos del negocio
      const businessDoc = await db.collection('businesses').doc(userId).get()
      if (!businessDoc.exists) {
        res.status(404).json({ error: 'Negocio no encontrado' })
        return
      }

      const businessData = businessDoc.data()

      // Obtener configuración de emisión
      const emissionConfig = businessData.emissionConfig || {}
      const sunatConfig = emissionConfig.sunat || businessData.sunat || {}

      // Verificar credenciales SUNAT
      if (!sunatConfig.solUser || !sunatConfig.solPassword) {
        res.status(400).json({ error: 'Faltan credenciales SOL de SUNAT' })
        return
      }

      // Obtener certificado
      const certificate = sunatConfig.certificateData || sunatConfig.certificate
      if (!certificate) {
        res.status(400).json({ error: 'Falta certificado digital para firmar' })
        return
      }

      // Guardar credenciales para uso posterior
      businessData.sunatCredentials = {
        solUser: sunatConfig.solUser,
        solPassword: sunatConfig.solPassword,
        certificate: certificate,
        certificatePassword: sunatConfig.certificatePassword || '',
        environment: sunatConfig.environment || 'beta'
      }

      // 5. Generar correlativo para el resumen diario
      // Usar zona horaria de Perú (UTC-5)
      const nowUTC = new Date()
      const peruOffset = -5 * 60
      const today = new Date(nowUTC.getTime() + (peruOffset - nowUTC.getTimezoneOffset()) * 60000)
      console.log('📅 Fecha actual en Perú:', today.toISOString())

      const summaryDocsRef = db.collection('businesses').doc(userId).collection('summaryDocuments')

      const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`

      // Usar documento contador para el día
      const counterDocRef = summaryDocsRef.doc(`counter_${todayStr}`)

      let correlativo = 1
      const counterDoc = await counterDocRef.get()
      if (counterDoc.exists) {
        correlativo = (counterDoc.data().lastCorrelativo || 0) + 1
      }

      // Actualizar contador
      await counterDocRef.set({
        dateStr: todayStr,
        lastCorrelativo: correlativo,
        updatedAt: FieldValue.serverTimestamp()
      })

      const summaryDocId = generateSummaryDocumentId(today, correlativo)

      console.log(`📄 Generando resumen diario de baja: ${summaryDocId}`)

      // 6. Preparar fecha de referencia (fecha de emisión de la boleta)
      let issueDateUTC
      console.log('📅 boletaData.issueDate:', boletaData.issueDate, 'tipo:', typeof boletaData.issueDate)

      if (boletaData.issueDate?.toDate) {
        issueDateUTC = boletaData.issueDate.toDate()
      } else if (boletaData.issueDate?._seconds) {
        issueDateUTC = new Date(boletaData.issueDate._seconds * 1000)
      } else if (typeof boletaData.issueDate === 'string') {
        issueDateUTC = new Date(boletaData.issueDate)
      } else if (boletaData.issueDate instanceof Date) {
        issueDateUTC = boletaData.issueDate
      } else if (boletaData.createdAt?.toDate) {
        console.log('⚠️ Usando createdAt como fecha de emisión')
        issueDateUTC = boletaData.createdAt.toDate()
      } else {
        console.log('⚠️ No se encontró fecha de emisión, usando fecha actual')
        issueDateUTC = new Date()
      }

      if (isNaN(issueDateUTC.getTime())) {
        console.error('❌ Fecha inválida:', boletaData.issueDate)
        res.status(400).json({ error: 'Fecha de emisión de la boleta inválida' })
        return
      }

      // Convertir fecha de emisión de la boleta a hora de Perú (UTC-5)
      const issueDate = new Date(issueDateUTC.getTime() + (peruOffset - issueDateUTC.getTimezoneOffset()) * 60000)
      console.log('📅 Fecha emisión boleta UTC:', issueDateUTC.toISOString(), '-> Perú:', issueDate.toISOString())

      const referenceDateStr = `${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, '0')}-${String(issueDate.getDate()).padStart(2, '0')}`
      const issueDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      console.log('📅 Fechas generadas - referenceDate:', referenceDateStr, 'issueDate (resumen):', issueDateStr)

      // 7. Preparar datos del cliente
      const customerIdentityType = getIdentityTypeCode(boletaData.customer?.documentType || boletaData.customer?.identityType || '1')
      const customerIdentityNumber = boletaData.customer?.documentNumber || boletaData.customer?.identityNumber || '00000000'

      // 8. Calcular montos (soporta productos gravados, exonerados e inafectos)
      const total = boletaData.total || 0
      const igv = boletaData.igv || 0

      // Calcular montos por tipo de afectación
      let taxableAmount = 0  // Gravado (base imponible)
      let exemptAmount = 0   // Exonerado
      let freeAmount = 0     // Inafecto

      if (boletaData.opGravadas !== undefined || boletaData.opExoneradas !== undefined || boletaData.opInafectas !== undefined) {
        // Nuevas ventas con desglose por tipo
        const opGravadas = boletaData.opGravadas || 0
        taxableAmount = opGravadas > 0 ? (opGravadas / 1.18) : 0
        exemptAmount = boletaData.opExoneradas || 0
        freeAmount = boletaData.opInafectas || 0
        console.log(`📊 Montos desglosados - Gravado: ${taxableAmount}, Exonerado: ${exemptAmount}, Inafecto: ${freeAmount}, IGV: ${igv}`)
      } else {
        // Ventas anteriores - calcular desde total e igv
        if (igv > 0) {
          taxableAmount = boletaData.subtotal || (total / 1.18)
        } else {
          exemptAmount = total
        }
        console.log(`📊 Montos calculados (legacy) - Gravado: ${taxableAmount}, Exonerado: ${exemptAmount}, IGV: ${igv}`)
      }

      // 9. Generar XML de Resumen Diario con ConditionCode 3 (Anular)
      const documentId = `${boletaData.series}-${boletaData.correlativeNumber}`

      const summaryXmlData = {
        id: summaryDocId,
        referenceDate: referenceDateStr,
        issueDate: issueDateStr,
        supplier: {
          ruc: businessData.ruc,
          name: businessData.businessName || businessData.name
        },
        documents: [{
          lineId: 1,
          documentType: '03', // Boleta
          documentId: documentId,
          conditionCode: CONDITION_CODES.VOID, // Código 3 = Anular
          customer: {
            identityType: customerIdentityType,
            identityNumber: customerIdentityNumber
          },
          currency: boletaData.currency || 'PEN',
          total: total,
          taxableAmount: taxableAmount,
          exemptAmount: exemptAmount,
          freeAmount: freeAmount,
          igv: igv
        }]
      }

      const summaryXml = generateSummaryDocumentsXML(summaryXmlData)

      console.log('✅ XML de resumen diario generado')
      console.log('📄 XML preview:', summaryXml.substring(0, 500))

      // 10. Firmar XML
      const signedXml = await signXML(summaryXml, {
        certificate: businessData.sunatCredentials.certificate,
        certificatePassword: businessData.sunatCredentials.certificatePassword
      })

      console.log('✅ XML firmado')

      // 11. Enviar a SUNAT
      const environment = businessData.sunatCredentials.environment

      const sendResult = await sendSummary(signedXml, {
        ruc: businessData.ruc,
        solUser: businessData.sunatCredentials.solUser,
        solPassword: businessData.sunatCredentials.solPassword,
        environment,
        fileName: summaryDocId
      })

      if (!sendResult.success) {
        console.error('❌ Error al enviar a SUNAT:', sendResult.error)
        if (sendResult.rawResponse) {
          console.error('📄 Respuesta raw:', sendResult.rawResponse)
        }

        // Guardar intento fallido
        await summaryDocsRef.add({
          summaryDocId,
          dateStr: todayStr,
          correlativo,
          invoiceId,
          invoiceSeries: boletaData.series,
          invoiceNumber: boletaData.correlativeNumber,
          documentType: 'boleta',
          action: 'void',
          reason: reason || 'ANULACION DE OPERACION',
          status: 'failed',
          error: sendResult.error,
          rawResponse: sendResult.rawResponse || null,
          createdAt: FieldValue.serverTimestamp()
        })

        res.status(500).json({
          error: sendResult.error || 'Error al enviar resumen diario a SUNAT',
          rawResponse: sendResult.rawResponse || null
        })
        return
      }

      console.log(`🎫 Ticket recibido: ${sendResult.ticket}`)

      // 12. Guardar documento de resumen con ticket
      const summaryDocRef = await summaryDocsRef.add({
        summaryDocId,
        dateStr: todayStr,
        correlativo,
        invoiceId,
        invoiceSeries: boletaData.series,
        invoiceNumber: boletaData.correlativeNumber,
        documentType: 'boleta',
        action: 'void',
        reason: reason || 'ANULACION DE OPERACION',
        status: 'pending',
        ticket: sendResult.ticket,
        xmlSent: summaryXml,
        createdAt: FieldValue.serverTimestamp()
      })

      // 13. Marcar boleta como "anulando"
      await boletaRef.update({
        sunatStatus: 'voiding',
        voidingTicket: sendResult.ticket,
        summaryDocumentId: summaryDocRef.id,
        voidReason: reason || 'ANULACION DE OPERACION',
        updatedAt: FieldValue.serverTimestamp()
      })

      // 14. Consultar estado del ticket con reintentos automáticos
      const MAX_RETRIES = 12
      const RETRY_INTERVAL = 10000
      let statusResult = null
      let retryCount = 0

      console.log('⏳ Consultando estado del ticket con reintentos automáticos...')

      while (retryCount < MAX_RETRIES) {
        const waitTime = retryCount === 0 ? 5000 : RETRY_INTERVAL
        console.log(`⏳ Esperando ${waitTime / 1000}s antes de consultar (intento ${retryCount + 1}/${MAX_RETRIES})...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))

        statusResult = await getStatus(sendResult.ticket, {
          ruc: businessData.ruc,
          solUser: businessData.sunatCredentials.solUser,
          solPassword: businessData.sunatCredentials.solPassword,
          environment
        })

        console.log(`📋 Resultado intento ${retryCount + 1}:`, JSON.stringify(statusResult))

        if (!statusResult.pending) {
          console.log('✅ SUNAT respondió con resultado final')
          break
        }

        retryCount++
        console.log(`⏳ Aún en proceso (código 98), reintentando...`)
      }

      // Si después de todos los reintentos sigue pendiente
      if (statusResult.pending) {
        console.log('⚠️ Timeout: SUNAT no respondió después de 60 segundos')
        res.status(202).json({
          success: true,
          status: 'pending',
          ticket: sendResult.ticket,
          summaryDocumentId: summaryDocRef.id,
          message: 'El resumen diario está siendo procesado por SUNAT. Consulte el estado más tarde.'
        })
        return
      }

      if (statusResult.success && statusResult.accepted) {
        // Anulación aceptada
        await summaryDocsRef.doc(summaryDocRef.id).update({
          status: 'accepted',
          cdrData: statusResult.cdrData || null,
          responseCode: statusResult.code || null,
          responseDescription: statusResult.description || null,
          processedAt: FieldValue.serverTimestamp()
        })

        // Actualizar boleta
        await boletaRef.update({
          sunatStatus: 'voided',
          status: 'voided',
          voidedAt: FieldValue.serverTimestamp(),
          voidCdrData: statusResult.cdrData || null
        })

        // NOTA: La devolución de stock se maneja en el frontend (InvoiceList.jsx)
        // usando updateProductStockTransaction (transacción atómica) + createStockMovement.
        // No devolver stock aquí para evitar doble devolución.

        // Actualizar estadísticas del cliente
        if (boletaData.customer?.documentNumber) {
          try {
            const customersRef = db.collection('businesses').doc(userId).collection('customers')
            const customerQuery = await customersRef
              .where('documentNumber', '==', boletaData.customer.documentNumber)
              .limit(1)
              .get()

            if (!customerQuery.empty) {
              const customerDoc = customerQuery.docs[0]
              const customerData = customerDoc.data()
              const newOrdersCount = Math.max(0, (customerData.ordersCount || 1) - 1)
              const newTotalSpent = Math.max(0, (customerData.totalSpent || boletaData.total) - (boletaData.total || 0))

              await customerDoc.ref.update({
                ordersCount: newOrdersCount,
                totalSpent: newTotalSpent,
                updatedAt: FieldValue.serverTimestamp()
              })
              console.log(`👤 Estadísticas de cliente actualizadas: ${boletaData.customer.documentNumber}`)
            }
          } catch (customerError) {
            console.error('❌ Error actualizando estadísticas del cliente:', customerError.message)
          }
        }

        console.log(`✅ Boleta ${boletaData.series}-${boletaData.correlativeNumber} anulada exitosamente`)

        res.status(200).json({
          success: true,
          status: 'voided',
          message: 'Boleta anulada exitosamente en SUNAT',
          summaryDocumentId: summaryDocRef.id
        })
        return
      }

      // Verificar si SUNAT dice que la baja ya fue procesada (reintento)
      const boletaErrMsg = statusResult.error || 'SUNAT rechazó el resumen diario'
      const boletaErrCode = String(statusResult.code || '')
      const boletaErrLower = boletaErrMsg.toLowerCase()
      const isBoletaVoidDone = (
        boletaErrCode === '1033' || boletaErrCode.includes('1033') ||
        boletaErrLower.includes('ya fue comunicad') ||
        boletaErrLower.includes('ya existe') ||
        boletaErrLower.includes('registrad') && boletaErrLower.includes('baja')
      )

      if (isBoletaVoidDone) {
        console.log(`📋 La baja de boleta ya fue procesada por SUNAT - tratando como ANULADO`)
        await summaryDocsRef.doc(summaryDocRef.id).update({ status: 'accepted', processedAt: FieldValue.serverTimestamp() })
        await boletaRef.update({
          sunatStatus: 'voided',
          status: 'voided',
          voidedAt: FieldValue.serverTimestamp(),
          summaryDocumentId: summaryDocRef.id,
        })
        res.status(200).json({
          success: true,
          status: 'voided',
          message: 'La baja ya fue procesada por SUNAT previamente',
          summaryDocumentId: summaryDocRef.id
        })
        return
      }

      // Error en la anulación
      await summaryDocsRef.doc(summaryDocRef.id).update({
        status: 'rejected',
        error: boletaErrMsg,
        responseCode: statusResult.code || null,
        processedAt: FieldValue.serverTimestamp()
      })

      await boletaRef.update({
        sunatStatus: 'accepted',
        voidingTicket: null,
        voidError: boletaErrMsg,
        updatedAt: FieldValue.serverTimestamp()
      })

      res.status(400).json({
        success: false,
        error: boletaErrMsg
      })

    } catch (error) {
      console.error('❌ Error al anular boleta:', error)
      res.status(500).json({ error: error.message || 'Error interno del servidor' })
    }
  }
)

// ========================================
// VOID BOLETA VIA QPSE
// ========================================

/**
 * Anula una boleta en SUNAT usando QPse como proveedor de firma
 *
 * Las boletas deben anularse mediante Resumen Diario (SummaryDocuments) con ConditionCode 3.
 * QPse se encarga de firmar y enviar el documento a SUNAT.
 *
 * Requisitos:
 * - La boleta debe estar aceptada por SUNAT
 * - No debe haber sido entregada al cliente
 * - Debe estar dentro del plazo de 7 días
 * - El negocio debe tener QPse configurado
 */
export const voidBoletaQPse = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
    cors: true,
  },
  async (req, res) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Verificar autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado - Token no proporcionado' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      let decodedToken

      try {
        decodedToken = await auth.verifyIdToken(idToken)
      } catch (authError) {
        console.error('❌ Error al verificar token:', authError)
        res.status(401).json({ error: 'Token inválido o expirado' })
        return
      }

      const authenticatedUserId = decodedToken.uid

      // Obtener datos del body
      const { userId, invoiceId, reason } = req.body

      if (!userId || !invoiceId) {
        res.status(400).json({ error: 'userId e invoiceId son requeridos' })
        return
      }

      // Verificar autorización
      if (authenticatedUserId !== userId) {
        const userDoc = await db.collection('users').doc(authenticatedUserId).get()
        if (!userDoc.exists || userDoc.data().ownerId !== userId) {
          res.status(403).json({ error: 'No autorizado para esta operación' })
          return
        }
      }

      console.log(`🗑️ [QPse] Iniciando anulación de boleta - Usuario: ${userId}, Boleta: ${invoiceId}`)

      // 1. Obtener datos de la boleta
      const boletaRef = db.collection('businesses').doc(userId).collection('invoices').doc(invoiceId)
      const boletaDoc = await boletaRef.get()

      if (!boletaDoc.exists) {
        res.status(404).json({ error: 'Boleta no encontrada' })
        return
      }

      const boletaData = boletaDoc.data()

      // 2. Validar que sea una boleta (serie empieza con B)
      const series = boletaData.series || boletaData.number?.split('-')[0] || ''
      if (!series.toUpperCase().startsWith('B')) {
        res.status(400).json({
          error: 'Este documento no es una boleta. Use la función voidInvoice para facturas.',
          documentType: boletaData.documentType,
          series: series
        })
        return
      }

      // 3. Validar que se puede anular
      const validationResult = canVoidBoleta({
        sunatStatus: boletaData.sunatStatus,
        delivered: boletaData.delivered || false,
        issueDate: boletaData.issueDate,
        documentType: boletaData.documentType,
        series: series
      })

      if (!validationResult.canVoid) {
        res.status(400).json({
          error: validationResult.reason,
          canVoid: false
        })
        return
      }

      // 4. Obtener datos del negocio
      const businessDoc = await db.collection('businesses').doc(userId).get()
      if (!businessDoc.exists) {
        res.status(404).json({ error: 'Negocio no encontrado' })
        return
      }

      const businessData = businessDoc.data()

      // Obtener configuración de QPse
      const emissionConfig = businessData.emissionConfig || {}
      let qpseConfig = null

      if (emissionConfig.method === 'qpse' && emissionConfig.qpse) {
        qpseConfig = {
          usuario: emissionConfig.qpse.usuario,
          password: emissionConfig.qpse.password,
          environment: emissionConfig.qpse.environment || 'demo'
        }
      } else if (businessData.qpse?.enabled) {
        qpseConfig = {
          usuario: businessData.qpse.usuario,
          password: businessData.qpse.password,
          environment: businessData.qpse.environment || 'demo'
        }
      }

      if (!qpseConfig || !qpseConfig.usuario || !qpseConfig.password) {
        res.status(400).json({ error: 'QPse no está configurado para este negocio' })
        return
      }

      console.log(`✅ [QPse] Configuración encontrada - Usuario: ${qpseConfig.usuario}, Ambiente: ${qpseConfig.environment}`)

      // 5. Generar correlativo para el resumen diario
      // Usar zona horaria de Perú (UTC-5)
      const nowUTC = new Date()
      const peruOffset = -5 * 60
      const today = new Date(nowUTC.getTime() + (peruOffset - nowUTC.getTimezoneOffset()) * 60000)
      console.log('📅 Fecha actual en Perú:', today.toISOString())

      const summaryDocsRef = db.collection('businesses').doc(userId).collection('summaryDocuments')

      const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`

      // Usar documento contador para el día
      const counterDocRef = summaryDocsRef.doc(`counter_${todayStr}`)

      let correlativo = 1
      const counterDoc = await counterDocRef.get()
      if (counterDoc.exists) {
        correlativo = (counterDoc.data().lastCorrelativo || 0) + 1
      }

      // Actualizar contador
      await counterDocRef.set({
        dateStr: todayStr,
        lastCorrelativo: correlativo,
        updatedAt: FieldValue.serverTimestamp()
      })

      const summaryDocId = generateSummaryDocumentId(today, correlativo)

      console.log(`📄 [QPse] Generando resumen diario de baja: ${summaryDocId}`)

      // 6. Preparar fecha de referencia (fecha de emisión de la boleta)
      let issueDateUTC
      console.log('📅 boletaData.issueDate:', boletaData.issueDate, 'tipo:', typeof boletaData.issueDate)

      if (boletaData.issueDate?.toDate) {
        issueDateUTC = boletaData.issueDate.toDate()
      } else if (boletaData.issueDate?._seconds) {
        issueDateUTC = new Date(boletaData.issueDate._seconds * 1000)
      } else if (typeof boletaData.issueDate === 'string') {
        issueDateUTC = new Date(boletaData.issueDate)
      } else if (boletaData.issueDate instanceof Date) {
        issueDateUTC = boletaData.issueDate
      } else if (boletaData.createdAt?.toDate) {
        console.log('⚠️ Usando createdAt como fecha de emisión')
        issueDateUTC = boletaData.createdAt.toDate()
      } else {
        console.log('⚠️ No se encontró fecha de emisión, usando fecha actual')
        issueDateUTC = new Date()
      }

      if (isNaN(issueDateUTC.getTime())) {
        console.error('❌ Fecha inválida:', boletaData.issueDate)
        res.status(400).json({ error: 'Fecha de emisión de la boleta inválida' })
        return
      }

      // Convertir fecha de emisión de la boleta a hora de Perú (UTC-5)
      const issueDate = new Date(issueDateUTC.getTime() + (peruOffset - issueDateUTC.getTimezoneOffset()) * 60000)
      console.log('📅 Fecha emisión boleta UTC:', issueDateUTC.toISOString(), '-> Perú:', issueDate.toISOString())

      const referenceDateStr = `${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, '0')}-${String(issueDate.getDate()).padStart(2, '0')}`
      const issueDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      console.log('📅 Fechas generadas - referenceDate:', referenceDateStr, 'issueDate (resumen):', issueDateStr)

      // 7. Preparar datos del cliente
      const customerIdentityType = getIdentityTypeCode(boletaData.customer?.documentType || boletaData.customer?.identityType || '1')
      const customerIdentityNumber = boletaData.customer?.documentNumber || boletaData.customer?.identityNumber || '00000000'

      // 8. Calcular montos (soporta productos gravados, exonerados e inafectos)
      const total = boletaData.total || 0
      const igv = boletaData.igv || 0

      // Calcular montos por tipo de afectación
      let taxableAmount = 0  // Gravado (base imponible)
      let exemptAmount = 0   // Exonerado
      let freeAmount = 0     // Inafecto

      if (boletaData.opGravadas !== undefined || boletaData.opExoneradas !== undefined || boletaData.opInafectas !== undefined) {
        // Nuevas ventas con desglose por tipo
        const opGravadas = boletaData.opGravadas || 0
        taxableAmount = opGravadas > 0 ? (opGravadas / 1.18) : 0
        exemptAmount = boletaData.opExoneradas || 0
        freeAmount = boletaData.opInafectas || 0
        console.log(`📊 [QPse] Montos desglosados - Gravado: ${taxableAmount}, Exonerado: ${exemptAmount}, Inafecto: ${freeAmount}, IGV: ${igv}`)
      } else {
        // Ventas anteriores - calcular desde total e igv
        if (igv > 0) {
          taxableAmount = boletaData.subtotal || (total / 1.18)
        } else {
          exemptAmount = total
        }
        console.log(`📊 [QPse] Montos calculados (legacy) - Gravado: ${taxableAmount}, Exonerado: ${exemptAmount}, IGV: ${igv}`)
      }

      // 9. Generar XML de Resumen Diario con ConditionCode 3 (Anular)
      const documentId = `${boletaData.series}-${boletaData.correlativeNumber}`

      const summaryXmlData = {
        id: summaryDocId,
        referenceDate: referenceDateStr,
        issueDate: issueDateStr,
        supplier: {
          ruc: businessData.ruc,
          name: businessData.businessName || businessData.name
        },
        documents: [{
          lineId: 1,
          documentType: '03', // Boleta
          documentId: documentId,
          conditionCode: CONDITION_CODES.VOID, // Código 3 = Anular
          customer: {
            identityType: customerIdentityType,
            identityNumber: customerIdentityNumber
          },
          currency: boletaData.currency || 'PEN',
          total: total,
          taxableAmount: taxableAmount,
          exemptAmount: exemptAmount,
          freeAmount: freeAmount,
          igv: igv
        }]
      }

      const summaryXml = generateSummaryDocumentsXML(summaryXmlData)

      console.log('✅ [QPse] XML de resumen diario generado')
      console.log('📄 XML completo:')
      console.log(summaryXml)
      console.log('📊 Datos usados para generar XML:', JSON.stringify(summaryXmlData, null, 2))

      // 10. Marcar boleta como "anulando" antes de enviar
      await boletaRef.update({
        sunatStatus: 'voiding',
        voidMethod: 'qpse',
        voidReason: reason || 'ANULACION DE OPERACION',
        updatedAt: FieldValue.serverTimestamp()
      })

      // 11. Enviar a QPse para firma y envío a SUNAT
      console.log('📤 [QPse] Enviando a QPse para firma y envío a SUNAT...')

      const qpseResult = await voidBoletaViaQPse(
        summaryXml,
        businessData.ruc,
        summaryDocId,
        qpseConfig
      )

      console.log('📋 [QPse] Resultado:', JSON.stringify(qpseResult, null, 2))

      // 12. Guardar documento de resumen
      const summaryDocRef = await summaryDocsRef.add({
        summaryDocId,
        dateStr: todayStr,
        correlativo,
        invoiceId,
        invoiceSeries: boletaData.series,
        invoiceNumber: boletaData.correlativeNumber,
        documentType: 'boleta',
        action: 'void',
        method: 'qpse',
        reason: reason || 'ANULACION DE OPERACION',
        status: qpseResult.accepted ? 'accepted' : (qpseResult.responseCode === '98' ? 'pending' : 'failed'),
        ticket: qpseResult.ticket || null,
        responseCode: qpseResult.responseCode || null,
        responseDescription: qpseResult.description || null,
        notes: qpseResult.notes || null,
        cdrUrl: qpseResult.cdrUrl || null,
        createdAt: FieldValue.serverTimestamp()
      })

      // 13. Actualizar boleta según resultado
      if (qpseResult.accepted) {
        // Anulación aceptada
        await boletaRef.update({
          sunatStatus: 'voided',
          status: 'voided',
          voidedAt: FieldValue.serverTimestamp(),
          summaryDocumentId: summaryDocRef.id
        })

        // NOTA: La devolución de stock se maneja en el frontend (InvoiceList.jsx)
        // usando updateProductStockTransaction (transacción atómica) + createStockMovement.
        // No devolver stock aquí para evitar doble devolución.

        // Actualizar estadísticas del cliente
        if (boletaData.customer?.documentNumber) {
          try {
            const customersRef = db.collection('businesses').doc(userId).collection('customers')
            const customerQuery = await customersRef
              .where('documentNumber', '==', boletaData.customer.documentNumber)
              .limit(1)
              .get()

            if (!customerQuery.empty) {
              const customerDoc = customerQuery.docs[0]
              const customerData = customerDoc.data()
              const newOrdersCount = Math.max(0, (customerData.ordersCount || 1) - 1)
              const newTotalSpent = Math.max(0, (customerData.totalSpent || boletaData.total) - (boletaData.total || 0))

              await customerDoc.ref.update({
                ordersCount: newOrdersCount,
                totalSpent: newTotalSpent,
                updatedAt: FieldValue.serverTimestamp()
              })
              console.log(`👤 Estadísticas de cliente actualizadas: ${boletaData.customer.documentNumber}`)
            }
          } catch (customerError) {
            console.error('❌ Error actualizando estadísticas del cliente:', customerError.message)
          }
        }

        console.log(`✅ [QPse] Boleta ${boletaData.series}-${boletaData.correlativeNumber} anulada exitosamente`)

        res.status(200).json({
          success: true,
          status: 'voided',
          message: 'Boleta anulada exitosamente en SUNAT vía QPse',
          summaryDocumentId: summaryDocRef.id
        })
        return
      }

      // Si está pendiente (código 98 o 99 - SUNAT aún procesando)
      if (qpseResult.responseCode === '98' || qpseResult.responseCode === '99' || qpseResult.responseCode === 'PROCESANDO') {
        await boletaRef.update({
          sunatStatus: 'voiding',
          voidingTicket: qpseResult.ticket || null,
          summaryDocumentId: summaryDocRef.id,
          updatedAt: FieldValue.serverTimestamp()
        })

        res.status(202).json({
          success: true,
          status: 'pending',
          ticket: qpseResult.ticket,
          summaryDocumentId: summaryDocRef.id,
          message: 'El resumen diario está siendo procesado por SUNAT. Consulte el estado más tarde.'
        })
        return
      }

      // Verificar si SUNAT dice que la baja ya fue procesada (reintento)
      const boletaVoidDesc = (qpseResult.description || qpseResult.notes || '').toLowerCase()
      const boletaVoidCode = String(qpseResult.responseCode || '')
      const isBoletaAlreadyVoided = (
        boletaVoidCode === '1033' || boletaVoidCode.includes('1033') ||
        boletaVoidDesc.includes('ya fue comunicad') ||
        boletaVoidDesc.includes('ya existe') ||
        boletaVoidDesc.includes('already') ||
        boletaVoidDesc.includes('registrad') && boletaVoidDesc.includes('baja')
      )

      if (isBoletaAlreadyVoided) {
        console.log(`📋 [QPse] La baja de boleta ya fue procesada por SUNAT - tratando como ANULADO`)
        await boletaRef.update({
          sunatStatus: 'voided',
          status: 'voided',
          voidedAt: FieldValue.serverTimestamp(),
          summaryDocumentId: summaryDocRef.id,
        })
        await summaryDocsRef.doc(summaryDocRef.id).update({ status: 'accepted' })

        res.status(200).json({
          success: true,
          status: 'voided',
          message: 'La baja ya fue procesada por SUNAT previamente',
          summaryDocumentId: summaryDocRef.id
        })
        return
      }

      // Error en la anulación
      await boletaRef.update({
        sunatStatus: 'accepted', // Volver al estado anterior
        voidError: qpseResult.description || qpseResult.notes || 'Error al anular',
        updatedAt: FieldValue.serverTimestamp()
      })

      res.status(400).json({
        success: false,
        error: qpseResult.description || qpseResult.notes || 'Error al anular la boleta',
        responseCode: qpseResult.responseCode
      })

    } catch (error) {
      console.error('❌ [QPse] Error al anular boleta:', error)
      res.status(500).json({ error: error.message || 'Error interno del servidor' })
    }
  }
)

// ========================================
// VOID INVOICE VIA QPSE (Comunicación de Baja)
// ========================================

/**
 * Anula una factura en SUNAT usando QPse como proveedor de firma
 *
 * Las facturas deben anularse mediante Comunicación de Baja (VoidedDocuments).
 * QPse se encarga de firmar y enviar el documento a SUNAT.
 *
 * Requisitos:
 * - La factura debe estar aceptada por SUNAT
 * - No debe haber sido entregada al cliente
 * - Debe estar dentro del plazo de 7 días
 * - El negocio debe tener QPse configurado
 */
export const voidInvoiceQPse = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
    cors: true,
  },
  async (req, res) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      // Verificar autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado - Token no proporcionado' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      let decodedToken

      try {
        decodedToken = await auth.verifyIdToken(idToken)
      } catch (authError) {
        console.error('❌ Error al verificar token:', authError)
        res.status(401).json({ error: 'Token inválido o expirado' })
        return
      }

      const authenticatedUserId = decodedToken.uid

      // Obtener datos del body
      const { userId, invoiceId, reason } = req.body

      if (!userId || !invoiceId) {
        res.status(400).json({ error: 'userId e invoiceId son requeridos' })
        return
      }

      // Verificar autorización
      if (authenticatedUserId !== userId) {
        const userDoc = await db.collection('users').doc(authenticatedUserId).get()
        if (!userDoc.exists || userDoc.data().ownerId !== userId) {
          res.status(403).json({ error: 'No autorizado para esta operación' })
          return
        }
      }

      console.log(`🗑️ [QPse] Iniciando anulación de factura - Usuario: ${userId}, Factura: ${invoiceId}`)

      // 1. Obtener datos de la factura
      const invoiceRef = db.collection('businesses').doc(userId).collection('invoices').doc(invoiceId)
      const invoiceDoc = await invoiceRef.get()

      if (!invoiceDoc.exists) {
        res.status(404).json({ error: 'Factura no encontrada' })
        return
      }

      const invoiceData = invoiceDoc.data()

      // 2. Validar que sea una factura (serie empieza con F)
      const series = invoiceData.series || invoiceData.number?.split('-')[0] || ''
      if (!series.toUpperCase().startsWith('F')) {
        res.status(400).json({
          error: 'Este documento no es una factura. Use voidBoletaQPse para boletas.',
          documentType: invoiceData.documentType,
          series: series
        })
        return
      }

      // 3. Validar que se puede anular
      // Priorizar emissionDate (fecha del POS) sobre issueDate
      const validationResult = canVoidDocument({
        sunatStatus: invoiceData.sunatStatus,
        delivered: invoiceData.delivered || false,
        issueDate: invoiceData.emissionDate || invoiceData.issueDate,
        documentType: invoiceData.documentType || 'factura'
      })

      if (!validationResult.canVoid) {
        res.status(400).json({
          error: validationResult.reason,
          canVoid: false
        })
        return
      }

      // 4. Obtener datos del negocio
      const businessDoc = await db.collection('businesses').doc(userId).get()
      if (!businessDoc.exists) {
        res.status(404).json({ error: 'Negocio no encontrado' })
        return
      }

      const businessData = businessDoc.data()

      // Obtener configuración de QPse
      const emissionConfig = businessData.emissionConfig || {}
      let qpseConfig = null

      if (emissionConfig.method === 'qpse' && emissionConfig.qpse) {
        qpseConfig = {
          usuario: emissionConfig.qpse.usuario,
          password: emissionConfig.qpse.password,
          environment: emissionConfig.qpse.environment || 'demo'
        }
      } else if (businessData.qpse?.enabled) {
        qpseConfig = {
          usuario: businessData.qpse.usuario,
          password: businessData.qpse.password,
          environment: businessData.qpse.environment || 'demo'
        }
      }

      if (!qpseConfig || !qpseConfig.usuario || !qpseConfig.password) {
        res.status(400).json({ error: 'QPse no está configurado para este negocio' })
        return
      }

      console.log(`✅ [QPse] Configuración encontrada - Usuario: ${qpseConfig.usuario}, Ambiente: ${qpseConfig.environment}`)

      // 5. Generar correlativo para la comunicación de baja
      // Usar zona horaria de Perú (UTC-5)
      const nowUTC = new Date()
      const peruOffset = -5 * 60
      const today = new Date(nowUTC.getTime() + (peruOffset - nowUTC.getTimezoneOffset()) * 60000)
      console.log('📅 Fecha actual en Perú:', today.toISOString())

      const voidedDocsRef = db.collection('businesses').doc(userId).collection('voidedDocuments')

      const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`

      // Usar documento contador para el día
      const counterDocRef = voidedDocsRef.doc(`counter_${todayStr}`)

      let correlativo = 1
      const counterDoc = await counterDocRef.get()
      if (counterDoc.exists) {
        correlativo = (counterDoc.data().lastCorrelativo || 0) + 1
      }

      // Actualizar contador
      await counterDocRef.set({
        dateStr: todayStr,
        lastCorrelativo: correlativo,
        updatedAt: FieldValue.serverTimestamp()
      })

      const voidedDocId = generateVoidedDocumentId(today, correlativo)

      console.log(`📄 [QPse] Generando comunicación de baja: ${voidedDocId}`)

      // 6. Preparar fecha de referencia (fecha de emisión de la factura)
      // Priorizar emissionDate (fecha elegida por usuario en POS) sobre issueDate y createdAt
      const dateSource = invoiceData.emissionDate || invoiceData.issueDate
      let referenceDateStr
      console.log('📅 emissionDate:', invoiceData.emissionDate, 'issueDate:', invoiceData.issueDate)

      if (typeof dateSource === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateSource)) {
        // String YYYY-MM-DD directo (formato guardado por el POS) - usar tal cual
        referenceDateStr = dateSource
        console.log('📅 Usando fecha de emisión directa (string):', referenceDateStr)
      } else if (dateSource?.toDate) {
        const d = dateSource.toDate()
        const dPeru = new Date(d.getTime() + (peruOffset - d.getTimezoneOffset()) * 60000)
        referenceDateStr = `${dPeru.getFullYear()}-${String(dPeru.getMonth() + 1).padStart(2, '0')}-${String(dPeru.getDate()).padStart(2, '0')}`
        console.log('📅 Usando fecha de emisión (Timestamp):', referenceDateStr)
      } else if (dateSource?._seconds) {
        const d = new Date(dateSource._seconds * 1000)
        const dPeru = new Date(d.getTime() + (peruOffset - d.getTimezoneOffset()) * 60000)
        referenceDateStr = `${dPeru.getFullYear()}-${String(dPeru.getMonth() + 1).padStart(2, '0')}-${String(dPeru.getDate()).padStart(2, '0')}`
        console.log('📅 Usando fecha de emisión (Timestamp serializado):', referenceDateStr)
      } else if (invoiceData.createdAt?.toDate) {
        console.log('⚠️ Usando createdAt como fecha de emisión')
        const d = invoiceData.createdAt.toDate()
        const dPeru = new Date(d.getTime() + (peruOffset - d.getTimezoneOffset()) * 60000)
        referenceDateStr = `${dPeru.getFullYear()}-${String(dPeru.getMonth() + 1).padStart(2, '0')}-${String(dPeru.getDate()).padStart(2, '0')}`
      } else {
        console.log('⚠️ No se encontró fecha de emisión, usando fecha actual')
        referenceDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      }

      console.log('📅 referenceDate final:', referenceDateStr)
      const issueDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      console.log('📅 Fechas generadas - referenceDate:', referenceDateStr, 'issueDate (comunicación):', issueDateStr)

      // 7. Generar XML de Comunicación de Baja
      const voidedXmlData = {
        id: voidedDocId,
        referenceDate: referenceDateStr,
        issueDate: issueDateStr,
        supplier: {
          ruc: businessData.ruc,
          name: businessData.businessName || businessData.name
        },
        documents: [{
          lineId: 1,
          documentType: getVoidDocTypeCode(invoiceData.documentType || 'factura'),
          series: invoiceData.series,
          number: invoiceData.correlativeNumber,
          reason: reason || 'ANULACION DE OPERACION'
        }]
      }

      const voidedXml = generateVoidedDocumentsXML(voidedXmlData)

      console.log('✅ [QPse] XML de comunicación de baja generado')
      console.log('📄 XML preview:', voidedXml.substring(0, 500))

      // 8. Marcar factura como "anulando" antes de enviar
      await invoiceRef.update({
        sunatStatus: 'voiding',
        voidMethod: 'qpse',
        voidReason: reason || 'ANULACION DE OPERACION',
        updatedAt: FieldValue.serverTimestamp()
      })

      // 9. Enviar a QPse para firma y envío a SUNAT
      console.log('📤 [QPse] Enviando a QPse para firma y envío a SUNAT...')

      const qpseResult = await voidInvoiceViaQPse(
        voidedXml,
        businessData.ruc,
        voidedDocId,
        qpseConfig
      )

      console.log('📋 [QPse] Resultado:', JSON.stringify(qpseResult, null, 2))

      // 10. Guardar documento de comunicación de baja
      const voidedDocRef = await voidedDocsRef.add({
        voidedDocId,
        dateStr: todayStr,
        correlativo,
        invoiceId,
        invoiceSeries: invoiceData.series,
        invoiceNumber: invoiceData.correlativeNumber,
        documentType: 'factura',
        action: 'void',
        method: 'qpse',
        reason: reason || 'ANULACION DE OPERACION',
        status: qpseResult.accepted ? 'accepted' : (qpseResult.responseCode === '98' ? 'pending' : 'failed'),
        ticket: qpseResult.ticket || null,
        responseCode: qpseResult.responseCode || null,
        responseDescription: qpseResult.description || null,
        notes: qpseResult.notes || null,
        cdrUrl: qpseResult.cdrUrl || null,
        createdAt: FieldValue.serverTimestamp()
      })

      // 11. Actualizar factura según resultado
      if (qpseResult.accepted) {
        // Anulación aceptada - guardar XML y CDR en Storage
        let voidXmlStorageUrl = null
        let voidCdrStorageUrl = null

        try {
          // Guardar XML de la comunicación de baja
          voidXmlStorageUrl = await saveToStorage(userId, invoiceId, `${voidedDocId}-BAJA.xml`, voidedXml)
          console.log(`📁 [QPse] XML de baja guardado en Storage: ${voidXmlStorageUrl ? 'OK' : 'NO'}`)

          // Guardar CDR de la baja (desde cdrData o descargando desde cdrUrl)
          if (qpseResult.cdrData) {
            voidCdrStorageUrl = await saveToStorage(userId, invoiceId, `${voidedDocId}-CDR-BAJA.xml`, qpseResult.cdrData)
            console.log(`📁 [QPse] CDR de baja guardado en Storage: ${voidCdrStorageUrl ? 'OK' : 'NO'}`)
          } else if (qpseResult.cdrUrl) {
            try {
              const cdrContent = await downloadFromUrl(qpseResult.cdrUrl)
              if (cdrContent) {
                voidCdrStorageUrl = await saveToStorage(userId, invoiceId, `${voidedDocId}-CDR-BAJA.xml`, cdrContent)
                console.log(`📁 [QPse] CDR de baja descargado y guardado en Storage: ${voidCdrStorageUrl ? 'OK' : 'NO'}`)
              }
            } catch (dlErr) {
              console.error('⚠️ [QPse] Error descargando CDR desde URL:', dlErr.message)
            }
          }
        } catch (storageError) {
          console.error('⚠️ [QPse] Error guardando archivos de baja en Storage:', storageError.message)
        }

        // Actualizar documento de baja con URLs
        await voidedDocsRef.doc(voidedDocRef.id).update({
          voidXmlStorageUrl: voidXmlStorageUrl || null,
          voidCdrStorageUrl: voidCdrStorageUrl || null,
        })

        // Anulación aceptada
        await invoiceRef.update({
          sunatStatus: 'voided',
          status: 'voided',
          voidedAt: FieldValue.serverTimestamp(),
          voidedDocumentId: voidedDocRef.id,
          voidXmlStorageUrl: voidXmlStorageUrl || null,
          voidCdrStorageUrl: voidCdrStorageUrl || null,
        })

        // Si es una Nota de Crédito, restaurar la factura/boleta original
        if (invoiceData.documentType === 'nota_credito' && invoiceData.referencedDocumentId) {
          console.log(`🔄 [QPse] Restaurando documento original: ${invoiceData.referencedDocumentId}`)
          try {
            // Buscar la factura/boleta original por su número
            const invoicesRef = db.collection('businesses').doc(userId).collection('invoices')
            const originalQuery = await invoicesRef
              .where('number', '==', invoiceData.referencedDocumentId)
              .limit(1)
              .get()

            if (!originalQuery.empty) {
              const originalDoc = originalQuery.docs[0]
              const originalData = originalDoc.data()

              // Determinar el nuevo estado de la factura original
              let newStatus = 'paid'
              if (originalData.previousStatus) {
                newStatus = originalData.previousStatus
              } else if (originalData.paymentStatus === 'pending' || originalData.status === 'pending') {
                newStatus = 'pending'
              }

              // Restaurar la factura original
              await originalDoc.ref.update({
                status: newStatus,
                pendingCreditNoteId: FieldValue.delete(),
                pendingCreditNoteNumber: FieldValue.delete(),
                pendingCreditNoteTotal: FieldValue.delete(),
                creditNoteVoidedAt: FieldValue.serverTimestamp(),
                creditNoteVoidedId: invoiceId,
                creditNoteVoidedNumber: invoiceData.number,
                updatedAt: FieldValue.serverTimestamp()
              })

              console.log(`✅ [QPse] Factura ${invoiceData.referencedDocumentId} restaurada a estado: ${newStatus}`)

              // Descontar stock (reversar la devolución que hizo la NC)
              if (invoiceData.items && invoiceData.items.length > 0) {
                console.log('📦 [QPse] Revirtiendo devolución de stock de la NC...')
                for (const item of invoiceData.items) {
                  if (item.productId && !item.productId.startsWith('custom-')) {
                    try {
                      const productRef = db.collection('businesses').doc(userId).collection('products').doc(item.productId)
                      const productDoc = await productRef.get()
                      if (productDoc.exists) {
                        const currentStock = productDoc.data().stock || 0
                        const newStock = Math.max(0, currentStock - (item.quantity || 0))
                        await productRef.update({
                          stock: newStock,
                          updatedAt: FieldValue.serverTimestamp()
                        })
                        console.log(`  ✅ Stock descontado (reversión NC): ${item.name} -${item.quantity}`)
                      }
                    } catch (stockError) {
                      console.error(`  ❌ Error descontando stock de ${item.name}:`, stockError.message)
                    }
                  }
                }
              }
            } else {
              console.log(`⚠️ [QPse] No se encontró el documento original: ${invoiceData.referencedDocumentId}`)
            }
          } catch (restoreError) {
            console.error('❌ [QPse] Error al restaurar documento original:', restoreError.message)
          }
        } else {
          // NOTA: La devolución de stock se maneja en el frontend
          // usando updateProductStockTransaction (transacción atómica) + createStockMovement.
          // No devolver stock aquí para evitar doble devolución.
          console.log('📦 Stock será devuelto por el frontend (evitando doble devolución)')
        }

        // Actualizar estadísticas del cliente
        if (invoiceData.customer?.documentNumber) {
          try {
            const customersRef = db.collection('businesses').doc(userId).collection('customers')
            const customerQuery = await customersRef
              .where('documentNumber', '==', invoiceData.customer.documentNumber)
              .limit(1)
              .get()

            if (!customerQuery.empty) {
              const customerDoc = customerQuery.docs[0]
              const customerData = customerDoc.data()
              const newOrdersCount = Math.max(0, (customerData.ordersCount || 1) - 1)
              const newTotalSpent = Math.max(0, (customerData.totalSpent || invoiceData.total) - (invoiceData.total || 0))

              await customerDoc.ref.update({
                ordersCount: newOrdersCount,
                totalSpent: newTotalSpent,
                updatedAt: FieldValue.serverTimestamp()
              })
              console.log(`👤 Estadísticas de cliente actualizadas: ${invoiceData.customer.documentNumber}`)
            }
          } catch (customerError) {
            console.error('❌ Error actualizando estadísticas del cliente:', customerError.message)
          }
        }

        console.log(`✅ [QPse] Factura ${invoiceData.series}-${invoiceData.correlativeNumber} anulada exitosamente`)

        res.status(200).json({
          success: true,
          status: 'voided',
          message: 'Factura anulada exitosamente en SUNAT vía QPse',
          voidedDocumentId: voidedDocRef.id
        })
        return
      }

      // Si está pendiente (código 98 o 99 - SUNAT aún procesando)
      if (qpseResult.responseCode === '98' || qpseResult.responseCode === '99' || qpseResult.responseCode === 'PROCESANDO') {
        await invoiceRef.update({
          sunatStatus: 'voiding',
          voidingTicket: qpseResult.ticket || null,
          voidedDocumentId: voidedDocRef.id,
          updatedAt: FieldValue.serverTimestamp()
        })

        res.status(202).json({
          success: true,
          status: 'pending',
          ticket: qpseResult.ticket,
          voidedDocumentId: voidedDocRef.id,
          message: 'La comunicación de baja está siendo procesada por SUNAT. Consulte el estado más tarde.'
        })
        return
      }

      // Verificar si SUNAT dice que la baja ya fue procesada (reintento de anulación)
      const voidDesc = (qpseResult.description || qpseResult.notes || '').toLowerCase()
      const voidCode = String(qpseResult.responseCode || '')
      const isAlreadyVoided = (
        voidCode === '1033' || voidCode.includes('1033') ||
        voidDesc.includes('ya fue comunicad') ||
        voidDesc.includes('comunicación de baja') && voidDesc.includes('existe') ||
        voidDesc.includes('already') ||
        voidDesc.includes('registrad') && voidDesc.includes('baja')
      )

      if (isAlreadyVoided) {
        console.log(`📋 [QPse] La baja ya fue procesada por SUNAT - tratando como ANULADO`)
        await invoiceRef.update({
          sunatStatus: 'voided',
          status: 'voided',
          voidedAt: FieldValue.serverTimestamp(),
          voidedDocumentId: voidedDocRef.id,
        })
        await voidedDocsRef.doc(voidedDocRef.id).update({ status: 'accepted' })

        res.status(200).json({
          success: true,
          status: 'voided',
          message: 'La baja ya fue procesada por SUNAT previamente',
          voidedDocumentId: voidedDocRef.id
        })
        return
      }

      // Error en la anulación
      await invoiceRef.update({
        sunatStatus: 'accepted', // Volver al estado anterior
        voidError: qpseResult.description || qpseResult.notes || 'Error al anular',
        updatedAt: FieldValue.serverTimestamp()
      })

      res.status(400).json({
        success: false,
        error: qpseResult.description || qpseResult.notes || 'Error al anular la factura',
        responseCode: qpseResult.responseCode
      })

    } catch (error) {
      console.error('❌ [QPse] Error al anular factura:', error)
      res.status(500).json({ error: error.message || 'Error interno del servidor' })
    }
  }
)

// ========================================
// PUSH NOTIFICATIONS - Cloud Functions
// ========================================

// Import and re-export notification functions
export { onNewSale } from './notifications/onNewSale.js'
export { onNewOrder } from './notifications/onNewOrder.js'
export { onProductStockChange } from './notifications/onStockLow.js'
export { onYapePayment } from './notifications/onYapePayment.js'
export { saveYapePaymentNative } from './notifications/saveYapePaymentNative.js'
export { onPaymentNotification } from './notifications/onPaymentNotification.js'

// Import and re-export migration function
export { migratePurchasesHTTP } from './migratePurchases.js'

// ========================================
// RAPPI SELF-ONBOARDING
// ========================================
export {
  rappiOAuthStart,
  rappiOAuthCallback,
  rappiWebhook,
  rappiRegisterWebhook,
  rappiListWebhooks,
  rappiProvisionStore,
  rappiGetStoreStatus,
  rappiDeprovisionStore,
} from './rappi/selfOnboarding.js'

// ========================================
// DYNAMIC META TAGS FOR SOCIAL MEDIA
// ========================================

/**
 * User agents de bots de redes sociales
 */
const SOCIAL_BOT_USER_AGENTS = [
  'facebookexternalhit',
  'Facebot',
  'LinkedInBot',
  'Twitterbot',
  'WhatsApp',
  'TelegramBot',
  'Slackbot',
  'Discordbot',
  'Pinterest',
  'Googlebot',
  'bingbot',
  'Applebot'
]

/**
 * Detecta si el request viene de un bot de redes sociales
 */
function isSocialBot(userAgent) {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  return SOCIAL_BOT_USER_AGENTS.some(bot => ua.includes(bot.toLowerCase()))
}

/**
 * Genera HTML con meta tags dinámicas para un reseller
 */
function generateMetaTagsHTML(reseller, domain) {
  // Los datos de branding están en reseller.branding
  const branding = reseller.branding || {}
  const brandName = branding.companyName || reseller.companyName || 'Sistema de Facturación'
  const description = branding.description || `${brandName} - Sistema de facturación electrónica SUNAT para negocios en Perú`
  const logoUrl = branding.logoUrl || 'https://cobrifyperu.com/logo.png'
  const socialImageUrl = branding.socialImageUrl || branding.logoUrl || 'https://cobrifyperu.com/socialmedia.jpg'
  const themeColor = branding.primaryColor || '#2563eb'
  const url = `https://${domain}`

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary Meta Tags -->
  <title>${brandName} - Sistema de Facturación Electrónica</title>
  <meta name="title" content="${brandName} - Sistema de Facturación Electrónica" />
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="${themeColor}" />

  <!-- Favicon -->
  <link rel="icon" type="image/png" href="${logoUrl}" />
  <link rel="apple-touch-icon" href="${logoUrl}" />

  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="${brandName}" />
  <meta property="og:title" content="${brandName} - Sistema de Facturación Electrónica" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${socialImageUrl}" />
  <meta property="og:image:url" content="${socialImageUrl}" />
  <meta property="og:image:secure_url" content="${socialImageUrl}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${brandName}" />
  <meta property="og:locale" content="es_PE" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${url}" />
  <meta name="twitter:title" content="${brandName} - Sistema de Facturación Electrónica" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${socialImageUrl}" />
  <meta name="twitter:image:alt" content="${brandName}" />
</head>
<body>
  <script>window.location.href = "${url}";</script>
  <noscript>
    <meta http-equiv="refresh" content="0;url=${url}">
    <p>Redirigiendo a <a href="${url}">${brandName}</a>...</p>
  </noscript>
</body>
</html>`
}

/**
 * Cloud Function que sirve meta tags dinámicas para dominios de resellers
 * Solo responde a bots de redes sociales, usuarios normales reciben redirect
 */
export const socialMetaTags = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 10,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      const userAgent = req.headers['user-agent'] || ''
      const host = req.headers['x-forwarded-host'] || req.headers.host || ''
      const domain = host.toLowerCase().replace(/:\d+$/, '') // Remover puerto si existe

      console.log(`📱 [SocialMeta] Request from domain: ${domain}, UA: ${userAgent.substring(0, 50)}...`)

      // Dominios que NO deben ser tratados como reseller
      const ignoredDomains = [
        'localhost',
        'vercel.app',
        'firebaseapp.com',
        'web.app',
        'cobrifyperu.com',
        'cobrify.com',
        'cloudfunctions.net'
      ]

      const isIgnoredDomain = ignoredDomains.some(d => domain.includes(d))

      if (isIgnoredDomain) {
        // Para dominios de Cobrify, servir archivo estático normal
        console.log(`📱 [SocialMeta] Ignored domain, redirecting to app`)
        res.redirect(302, '/')
        return
      }

      // Buscar reseller por customDomain
      const resellersSnapshot = await db.collection('resellers')
        .where('customDomain', '==', domain)
        .limit(1)
        .get()

      if (resellersSnapshot.empty) {
        console.log(`📱 [SocialMeta] No reseller found for domain: ${domain}`)
        // Si no hay reseller, redirigir al index normal
        res.redirect(302, '/')
        return
      }

      const resellerDoc = resellersSnapshot.docs[0]
      const reseller = resellerDoc.data()

      console.log(`📱 [SocialMeta] Found reseller: ${reseller.brandName || reseller.businessName}`)

      // Solo servir meta tags a bots de redes sociales
      if (isSocialBot(userAgent)) {
        console.log(`📱 [SocialMeta] Social bot detected, serving meta tags`)
        const html = generateMetaTagsHTML(reseller, domain)
        res.set('Content-Type', 'text/html; charset=utf-8')
        res.set('Cache-Control', 'public, max-age=300') // Cache por 5 minutos
        res.status(200).send(html)
        return
      }

      // Usuarios normales: dejar que Firebase Hosting sirva la app
      console.log(`📱 [SocialMeta] Normal user, redirecting to app`)
      res.redirect(302, '/')

    } catch (error) {
      console.error('❌ [SocialMeta] Error:', error)
      res.redirect(302, '/')
    }
  }
)

// ==================== META TAGS DINÁMICOS PARA MENÚ DIGITAL (RESTAURANTE) ====================

/**
 * Genera HTML con meta tags dinámicos para un menú digital de restaurante
 */
function generateMenuMetaTagsHTML(business, slug) {
  const businessName = business.name || business.businessName || 'Restaurante'
  const slogan = business.companySlogan || ''
  const tagline = slogan || `¡Haz tu pedido en ${businessName}!`
  const description = `${tagline} — Menú digital de ${businessName}. Mira nuestra carta y pide desde tu mesa.`
  const logoUrl = business.logoUrl || 'https://cobrifyperu.com/logo.png'
  const themeColor = business.catalogColor || '#10B981'
  const url = `https://cobrifyperu.com/menu/${slug}`

  // Usar logo del negocio como imagen OG
  const socialImageUrl = business.catalogSocialImage || business.logoUrl || 'https://cobrifyperu.com/socialmedia.jpg'

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary Meta Tags -->
  <title>${businessName} - Menú Digital</title>
  <meta name="title" content="${businessName} - Menú Digital" />
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="${themeColor}" />

  <!-- Favicon -->
  <link rel="icon" type="image/png" href="${logoUrl}" />
  <link rel="apple-touch-icon" href="${logoUrl}" />

  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${businessName}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${businessName} — Menú Digital 🍽️" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${socialImageUrl}" />
  <meta property="og:image:url" content="${socialImageUrl}" />
  <meta property="og:image:secure_url" content="${socialImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Menú digital de ${businessName}" />
  <meta property="og:locale" content="es_PE" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${url}" />
  <meta name="twitter:title" content="${businessName} — Menú Digital 🍽️" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${socialImageUrl}" />
  <meta name="twitter:image:alt" content="Menú digital de ${businessName}" />
</head>
<body>
  <script>window.location.href = "${url}";</script>
  <noscript>
    <meta http-equiv="refresh" content="0;url=${url}">
    <p>Redirigiendo a <a href="${url}">${businessName} - Menú Digital</a>...</p>
  </noscript>
</body>
</html>`
}

/**
 * Cloud Function para servir meta tags dinámicos para menús digitales de restaurantes
 * Permite que cada menú tenga su propia preview en WhatsApp/Facebook con logo y nombre del negocio
 */
export const menuMetaTags = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 10,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      const userAgent = req.headers['user-agent'] || ''
      // Firebase Hosting 2nd gen: el path original llega en x-forwarded-url header
      // o podemos extraerlo de req.originalUrl. Probar todas las fuentes.
      const forwardedUrl = req.headers['x-forwarded-url'] || ''
      const originalUrl = req.originalUrl || ''
      const path = req.path || req.url || ''

      console.log(`🍽️ [MenuMeta] path=${path}, originalUrl=${originalUrl}, x-forwarded-url=${forwardedUrl}, headers=${JSON.stringify(Object.keys(req.headers))}, UA: ${userAgent.substring(0, 80)}`)

      // Extraer el slug de todas las fuentes posibles
      let slug = null
      for (const p of [forwardedUrl, originalUrl, path]) {
        if (!p) continue
        const parts = p.split('/').filter(Boolean)
        if (parts[0] === 'menu' && parts[1]) {
          slug = parts[1].split('?')[0]
          break
        }
      }

      // Si no encontramos slug con /menu/X, intentar el primer segmento
      // (Firebase puede enviar solo /lafilomena sin /menu/)
      if (!slug) {
        for (const p of [forwardedUrl, originalUrl, path]) {
          if (!p) continue
          const parts = p.split('/').filter(Boolean)
          if (parts[0] && parts[0] !== 'menu' && parts[0] !== 'index.html') {
            slug = parts[0].split('?')[0]
            break
          }
        }
      }

      if (!slug) {
        console.log(`🍽️ [MenuMeta] No slug found, fallback to index`)
        res.redirect(302, '/')
        return
      }

      console.log(`🍽️ [MenuMeta] slug=${slug}, isSocialBot=${isSocialBot(userAgent)}`)

      // Solo servir meta tags a bots de redes sociales
      // Usuarios normales: proxy del index.html de Firebase Hosting para que la SPA cargue
      if (!isSocialBot(userAgent)) {
        console.log(`🍽️ [MenuMeta] Normal user, proxying index.html`)
        try {
          // Fetch index.html desde Firebase Hosting CDN (usa .web.app para evitar loop)
          const indexResponse = await axios.get('https://cobrify-395fe.web.app/index.html', {
            timeout: 5000,
            headers: { 'Accept': 'text/html' }
          })
          res.set('Content-Type', 'text/html; charset=utf-8')
          res.set('Cache-Control', 'no-cache')
          res.status(200).send(indexResponse.data)
        } catch (proxyErr) {
          console.error('⚠️ [MenuMeta] Error proxying index.html:', proxyErr.message)
          res.redirect(302, '/')
        }
        return
      }

      // Bot de redes sociales: buscar negocio y servir meta tags dinámicos
      const businessesSnapshot = await db.collection('businesses')
        .where('catalogSlug', '==', slug)
        .where('catalogEnabled', '==', true)
        .limit(1)
        .get()

      if (businessesSnapshot.empty) {
        console.log(`🍽️ [MenuMeta] No menu found for slug: ${slug}`)
        res.redirect(302, `/menu/${slug}`)
        return
      }

      const businessDoc = businessesSnapshot.docs[0]
      const business = businessDoc.data()

      console.log(`🍽️ [MenuMeta] Found: ${business.name || business.businessName}, serving meta tags`)
      const html = generateMenuMetaTagsHTML(business, slug)
      res.set('Content-Type', 'text/html; charset=utf-8')
      res.set('Cache-Control', 'public, max-age=300')
      res.status(200).send(html)

    } catch (error) {
      console.error('❌ [MenuMeta] Error:', error)
      res.redirect(302, '/')
    }
  }
)

// ==================== META TAGS DINÁMICOS PARA CATÁLOGO PÚBLICO ====================

/**
 * Genera HTML con meta tags dinámicos para un catálogo público
 */
function generateCatalogMetaTagsHTML(business, slug) {
  const businessName = business.name || business.businessName || 'Catálogo'
  const tagline = business.catalogTagline || `Catálogo de productos de ${businessName}`
  const description = business.catalogWelcome || tagline
  const logoUrl = business.logoUrl || 'https://cobrifyperu.com/logo.png'
  const themeColor = business.catalogColor || '#10B981'
  const url = `https://cobrifyperu.com/catalogo/${slug}`

  // Usar logo del negocio como imagen OG, o una imagen por defecto
  // Idealmente el negocio debería tener una imagen específica para redes sociales
  const socialImageUrl = business.catalogSocialImage || business.logoUrl || 'https://cobrifyperu.com/socialmedia.jpg'

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary Meta Tags -->
  <title>${businessName} - Catálogo de Productos</title>
  <meta name="title" content="${businessName} - Catálogo de Productos" />
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="${themeColor}" />

  <!-- Favicon -->
  <link rel="icon" type="image/png" href="${logoUrl}" />
  <link rel="apple-touch-icon" href="${logoUrl}" />

  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${businessName}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${businessName} - Catálogo de Productos" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${socialImageUrl}" />
  <meta property="og:image:url" content="${socialImageUrl}" />
  <meta property="og:image:secure_url" content="${socialImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Catálogo de ${businessName}" />
  <meta property="og:locale" content="es_PE" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${url}" />
  <meta name="twitter:title" content="${businessName} - Catálogo de Productos" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${socialImageUrl}" />
  <meta name="twitter:image:alt" content="Catálogo de ${businessName}" />
</head>
<body>
  <script>window.location.href = "${url}";</script>
  <noscript>
    <meta http-equiv="refresh" content="0;url=${url}">
    <p>Redirigiendo a <a href="${url}">${businessName}</a>...</p>
  </noscript>
</body>
</html>`
}

/**
 * Cloud Function para servir meta tags dinámicos para catálogos públicos
 * Permite que cada catálogo tenga su propia preview en WhatsApp/Facebook
 */
export const catalogMetaTags = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 10,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      const userAgent = req.headers['user-agent'] || ''
      const path = req.path || req.url || ''

      console.log(`🛍️ [CatalogMeta] Request path: ${path}, UA: ${userAgent.substring(0, 50)}...`)

      // Extraer el slug del path
      // El path puede ser /catalogo/mi-tienda o /mi-tienda
      const pathParts = path.split('/').filter(Boolean)
      let slug = null

      if (pathParts[0] === 'catalogo' && pathParts[1]) {
        slug = pathParts[1]
      } else if (pathParts[0] && pathParts[0] !== 'catalogo') {
        slug = pathParts[0]
      }

      if (!slug) {
        console.log(`🛍️ [CatalogMeta] No slug found in path: ${path}`)
        res.redirect(302, '/catalogo/' + (pathParts[1] || ''))
        return
      }

      console.log(`🛍️ [CatalogMeta] Looking for catalog with slug: ${slug}`)

      // Buscar el negocio por catalogSlug
      const businessesSnapshot = await db.collection('businesses')
        .where('catalogSlug', '==', slug)
        .where('catalogEnabled', '==', true)
        .limit(1)
        .get()

      if (businessesSnapshot.empty) {
        console.log(`🛍️ [CatalogMeta] No catalog found for slug: ${slug}`)
        res.redirect(302, `/catalogo/${slug}`)
        return
      }

      const businessDoc = businessesSnapshot.docs[0]
      const business = businessDoc.data()

      console.log(`🛍️ [CatalogMeta] Found business: ${business.name || business.businessName}`)

      // Solo servir meta tags a bots de redes sociales
      if (isSocialBot(userAgent)) {
        console.log(`🛍️ [CatalogMeta] Social bot detected, serving meta tags`)
        const html = generateCatalogMetaTagsHTML(business, slug)
        res.set('Content-Type', 'text/html; charset=utf-8')
        res.set('Cache-Control', 'public, max-age=300') // Cache por 5 minutos
        res.status(200).send(html)
        return
      }

      // Usuarios normales: redirigir a la app React
      console.log(`🛍️ [CatalogMeta] Normal user, redirecting to app`)
      res.redirect(302, `/catalogo/${slug}`)

    } catch (error) {
      console.error('❌ [CatalogMeta] Error:', error)
      res.redirect(302, '/')
    }
  }
)

// ==================== EXPORTACIÓN MASIVA PARA AUDITORÍA ====================

/**
 * Exporta todos los comprobantes electrónicos de un rango de fechas
 * Genera un ZIP con XMLs y CDRs para auditoría SUNAT
 *
 * POST /exportInvoicesForAudit
 * Body: { startDate, endDate } (formato: YYYY-MM-DD)
 * Headers: Authorization: Bearer <token>
 *
 * Retorna: ZIP con estructura:
 *   - facturas/
 *     - F001-123.xml
 *     - F001-123-CDR.xml
 *   - boletas/
 *     - B001-456.xml
 *     - B001-456-CDR.xml
 *   - notas_credito/
 *   - notas_debito/
 *   - resumen.json (lista de todos los documentos)
 */
export const exportInvoicesForAudit = onRequest(
  { cors: true, timeoutSeconds: 300, memory: '1GiB' },
  async (req, res) => {
    console.log('📦 [ExportAudit] Iniciando exportación para auditoría')

    // Solo permitir POST
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Método no permitido' })
      return
    }

    try {
      // Verificar autenticación
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Token no proporcionado' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]
      let decodedToken
      try {
        decodedToken = await auth.verifyIdToken(idToken)
      } catch (authError) {
        console.error('❌ Error de autenticación:', authError)
        res.status(401).json({ error: 'Token inválido' })
        return
      }

      const userId = decodedToken.uid
      const { startDate, endDate } = req.body

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Debe proporcionar startDate y endDate (formato: YYYY-MM-DD)' })
        return
      }

      console.log(`📅 Rango de fechas: ${startDate} - ${endDate}`)
      console.log(`👤 Usuario: ${userId}`)

      // Convertir fechas
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      // Crear ZIP
      const zip = new JSZip()
      const resumen = {
        exportDate: new Date().toISOString(),
        dateRange: { startDate, endDate },
        documents: []
      }

      // Obtener facturas y boletas
      const invoicesRef = db.collection('businesses').doc(userId).collection('invoices')
      const invoicesSnapshot = await invoicesRef
        .where('createdAt', '>=', start)
        .where('createdAt', '<=', end)
        .where('sunatStatus', '==', 'accepted')
        .orderBy('createdAt', 'asc')
        .get()

      console.log(`📋 Encontrados ${invoicesSnapshot.size} documentos aceptados`)

      const bucket = storage.bucket()

      for (const doc of invoicesSnapshot.docs) {
        const invoice = doc.data()
        const docNumber = `${invoice.series}-${invoice.correlativeNumber}`

        // Determinar carpeta según tipo de documento
        let folder = 'otros'
        if (invoice.documentType === 'factura') folder = 'facturas'
        else if (invoice.documentType === 'boleta') folder = 'boletas'
        else if (invoice.documentType === 'nota_credito') folder = 'notas_credito'
        else if (invoice.documentType === 'nota_debito') folder = 'notas_debito'

        const docInfo = {
          id: doc.id,
          number: docNumber,
          type: invoice.documentType,
          customer: invoice.customer?.name || 'Sin nombre',
          customerDocument: invoice.customer?.documentNumber || '-',
          total: invoice.total,
          date: invoice.createdAt?.toDate?.()?.toISOString() || invoice.createdAt,
          sunatCode: invoice.sunatResponse?.code || '-',
          hasCDRProof: invoice.sunatResponse?.hasCDRProof || false,
          xmlFile: null,
          cdrFile: null
        }

        // Intentar obtener XML desde Storage
        if (invoice.sunatResponse?.xmlStorageUrl) {
          try {
            const xmlPath = `comprobantes/${userId}/${doc.id}/${docNumber}.xml`
            const [xmlExists] = await bucket.file(xmlPath).exists()
            if (xmlExists) {
              const [xmlContent] = await bucket.file(xmlPath).download()
              const xmlFileName = `${folder}/${docNumber}.xml`
              zip.file(xmlFileName, xmlContent)
              docInfo.xmlFile = xmlFileName
            }
          } catch (e) {
            console.warn(`⚠️ No se pudo obtener XML de ${docNumber}:`, e.message)
          }
        }

        // Intentar obtener CDR desde Storage
        if (invoice.sunatResponse?.cdrStorageUrl) {
          try {
            const cdrPath = `comprobantes/${userId}/${doc.id}/${docNumber}-CDR.xml`
            const [cdrExists] = await bucket.file(cdrPath).exists()
            if (cdrExists) {
              const [cdrContent] = await bucket.file(cdrPath).download()
              const cdrFileName = `${folder}/${docNumber}-CDR.xml`
              zip.file(cdrFileName, cdrContent)
              docInfo.cdrFile = cdrFileName
            }
          } catch (e) {
            console.warn(`⚠️ No se pudo obtener CDR de ${docNumber}:`, e.message)
          }
        } else if (invoice.sunatResponse?.cdrData) {
          // CDR guardado directamente en Firestore (SUNAT Directo antiguo)
          const cdrFileName = `${folder}/${docNumber}-CDR.xml`
          zip.file(cdrFileName, invoice.sunatResponse.cdrData)
          docInfo.cdrFile = cdrFileName
        }

        resumen.documents.push(docInfo)
      }

      // Agregar resumen al ZIP
      zip.file('resumen.json', JSON.stringify(resumen, null, 2))

      // Generar estadísticas
      const stats = {
        total: resumen.documents.length,
        facturas: resumen.documents.filter(d => d.type === 'factura').length,
        boletas: resumen.documents.filter(d => d.type === 'boleta').length,
        notasCredito: resumen.documents.filter(d => d.type === 'nota_credito').length,
        notasDebito: resumen.documents.filter(d => d.type === 'nota_debito').length,
        conXML: resumen.documents.filter(d => d.xmlFile).length,
        conCDR: resumen.documents.filter(d => d.cdrFile).length,
        montoTotal: resumen.documents.reduce((sum, d) => sum + (d.total || 0), 0)
      }

      console.log('📊 Estadísticas:', stats)

      // Generar ZIP
      const zipContent = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      })

      // Enviar respuesta
      const fileName = `comprobantes_${startDate}_${endDate}.zip`
      res.set('Content-Type', 'application/zip')
      res.set('Content-Disposition', `attachment; filename="${fileName}"`)
      res.set('X-Export-Stats', JSON.stringify(stats))
      res.status(200).send(zipContent)

      console.log(`✅ Exportación completada: ${stats.total} documentos`)

    } catch (error) {
      console.error('❌ Error en exportación:', error)
      res.status(500).json({ error: 'Error al exportar comprobantes', details: error.message })
    }
  }
)

/**
 * Cloud Function para corregir boletas rechazadas por error 2638 (Ley de la Selva)
 *
 * Esta función:
 * 1. Busca boletas con sunatStatus = "rejected" o "pending" que tengan error 2638
 * 2. Agrega los campos faltantes (opGravadas, opExoneradas, opInafectas, taxConfig)
 * 3. Cambia el status a "pending" para permitir reenvío
 *
 * Uso: curl -X POST https://us-central1-cobrify-395fe.cloudfunctions.net/fixRejectedInvoices \
 *      -H "Content-Type: application/json" \
 *      -d '{"businessId": "xxx", "secretKey": "fix-ley-selva-2024"}'
 */
export const fixRejectedInvoices = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      const { businessId, secretKey } = req.body

      // Validar clave secreta simple (para evitar uso no autorizado)
      if (secretKey !== 'fix-ley-selva-2024') {
        res.status(403).json({ error: 'Clave secreta inválida' })
        return
      }

      if (!businessId) {
        res.status(400).json({ error: 'businessId es requerido' })
        return
      }

      console.log(`🔍 Buscando boletas rechazadas para negocio: ${businessId}`)

      // Buscar boletas con status rejected o pending
      const invoicesRef = db.collection('businesses').doc(businessId).collection('invoices')

      const rejectedSnapshot = await invoicesRef
        .where('documentType', '==', 'boleta')
        .where('sunatStatus', 'in', ['rejected', 'pending'])
        .get()

      if (rejectedSnapshot.empty) {
        res.status(200).json({
          success: true,
          message: 'No se encontraron boletas rechazadas o pendientes',
          fixed: 0
        })
        return
      }

      console.log(`📋 Encontradas ${rejectedSnapshot.size} boletas para revisar`)

      let fixed = 0
      let skipped = 0
      const results = []

      for (const doc of rejectedSnapshot.docs) {
        const data = doc.data()
        const invoiceNumber = data.number || `${data.series}-${String(data.correlativeNumber).padStart(8, '0')}`

        // Verificar si necesita corrección
        const needsFix = !data.opGravadas && !data.opExoneradas && !data.opInafectas
        const hasError2638 = data.sunatResponse?.code === '2638' ||
                            data.sunatResponse?.description?.includes('2638')
        const hasPendingManual = data.sunatResponse?.responseCode === 'PENDING_MANUAL' ||
                                 data.sunatResponse?.pendingManual === true

        if (!needsFix && !hasError2638 && !hasPendingManual) {
          console.log(`⏭️ ${invoiceNumber} - Ya tiene los campos correctos`)
          skipped++
          continue
        }

        console.log(`📄 Procesando: ${invoiceNumber}`)

        // Calcular totales desde los items
        const items = data.items || []
        let totalExoneradas = 0

        items.forEach(item => {
          const subtotal = (item.quantity || 0) * (item.unitPrice || 0)
          totalExoneradas += subtotal
        })

        // Preparar actualización
        const updateData = {
          opGravadas: 0,
          opExoneradas: totalExoneradas,
          opInafectas: 0,
          igv: 0,
          taxConfig: {
            igvRate: 0,
            igvExempt: true,
            exemptionReason: 'Ley de la Selva',
            exemptionCode: '17'
          },
          sunatStatus: 'pending',
          updatedAt: FieldValue.serverTimestamp()
        }

        await doc.ref.update(updateData)

        console.log(`✅ ${invoiceNumber} corregido`)
        fixed++
        results.push({
          number: invoiceNumber,
          opExoneradas: totalExoneradas,
          status: 'fixed'
        })
      }

      console.log(`📊 Resumen: ${fixed} corregidas, ${skipped} saltadas`)

      res.status(200).json({
        success: true,
        message: `${fixed} boletas corregidas, ${skipped} saltadas`,
        fixed,
        skipped,
        total: rejectedSnapshot.size,
        results
      })

    } catch (error) {
      console.error('❌ Error:', error)
      res.status(500).json({ error: error.message })
    }
  }
)

// ==========================================
// URL SHORTENER FUNCTIONS (cbrfy.link)
// ==========================================

/**
 * Genera un código corto aleatorio
 * @param {number} length - Longitud del código (default: 6)
 * @returns {string} Código aleatorio alfanumérico
 */
function generateShortCode(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * Crea una URL corta para un enlace largo
 * POST /createShortUrl
 * Body: { url: string, businessId?: string, invoiceId?: string }
 * Returns: { shortUrl: string, code: string }
 */
export const createShortUrl = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 10,
    invoker: 'public'
  },
  async (req, res) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      const { url, businessId, invoiceId } = req.body

      if (!url) {
        res.status(400).json({ error: 'URL is required' })
        return
      }

      // Validar que sea una URL válida
      try {
        new URL(url)
      } catch {
        res.status(400).json({ error: 'Invalid URL format' })
        return
      }

      // Verificar si ya existe una URL corta para este enlace
      const existingSnapshot = await db.collection('shortUrls')
        .where('originalUrl', '==', url)
        .limit(1)
        .get()

      if (!existingSnapshot.empty) {
        const existingDoc = existingSnapshot.docs[0]
        const code = existingDoc.id
        console.log(`🔗 URL ya existente, retornando código: ${code}`)
        res.status(200).json({
          shortUrl: `https://cbrfy.link/${code}`,
          code,
          existing: true
        })
        return
      }

      // Generar código único
      let code = generateShortCode()
      let attempts = 0
      const maxAttempts = 10

      // Asegurar que el código sea único
      while (attempts < maxAttempts) {
        const docRef = db.collection('shortUrls').doc(code)
        const doc = await docRef.get()
        if (!doc.exists) break
        code = generateShortCode()
        attempts++
      }

      if (attempts >= maxAttempts) {
        console.error('❌ No se pudo generar código único después de varios intentos')
        res.status(500).json({ error: 'Could not generate unique code' })
        return
      }

      // Guardar en Firestore
      await db.collection('shortUrls').doc(code).set({
        originalUrl: url,
        businessId: businessId || null,
        invoiceId: invoiceId || null,
        createdAt: FieldValue.serverTimestamp(),
        hits: 0
      })

      console.log(`✅ URL corta creada: cbrfy.link/${code} -> ${url.substring(0, 50)}...`)

      res.status(200).json({
        shortUrl: `https://cbrfy.link/${code}`,
        code,
        existing: false
      })

    } catch (error) {
      console.error('❌ Error creando URL corta:', error)
      res.status(500).json({ error: error.message })
    }
  }
)

/**
 * Redirige desde URL corta a URL original
 * Esta función maneja las peticiones a cbrfy.link/{code}
 */
export const redirectShortUrl = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 50,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      // Extraer el código de la URL
      const path = req.path || ''
      const code = path.replace(/^\//, '').split('/')[0]

      console.log(`🔗 [Redirect] Código solicitado: ${code}`)

      if (!code) {
        // Si no hay código, redirigir a la página principal de Cobrify
        res.redirect(302, 'https://cobrifyperu.com')
        return
      }

      // Buscar el código en Firestore
      const docRef = db.collection('shortUrls').doc(code)
      const doc = await docRef.get()

      if (!doc.exists) {
        console.log(`⚠️ [Redirect] Código no encontrado: ${code}`)
        // Redirigir a página de error o página principal
        res.redirect(302, 'https://cobrifyperu.com?error=link_not_found')
        return
      }

      const data = doc.data()
      const originalUrl = data.originalUrl

      console.log(`✅ [Redirect] Redirigiendo ${code} -> ${originalUrl.substring(0, 50)}...`)

      // Incrementar contador de hits (sin esperar)
      docRef.update({
        hits: FieldValue.increment(1),
        lastAccessedAt: FieldValue.serverTimestamp()
      }).catch(err => console.error('Error actualizando hits:', err))

      // Redirigir al URL original
      res.redirect(302, originalUrl)

    } catch (error) {
      console.error('❌ [Redirect] Error:', error)
      res.redirect(302, 'https://cobrifyperu.com?error=server_error')
    }
  }
)

/**
 * Cloud Function: Calcula y cachea estadísticas globales de facturación
 * Esto evita que el dashboard tenga que consultar TODAS las facturas de TODOS los negocios
 * cada vez que se carga.
 *
 * Se ejecuta automáticamente cada hora y también puede ser llamada manualmente.
 */
export const calculateGlobalBillingStats = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 540, // 9 minutos máximo
    memory: '1GiB',
  },
  async (request) => {
    // Verificar que el usuario está autenticado
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debe estar autenticado para ejecutar esta función')
    }

    // Verificar que es un admin (buscar en colección 'admins')
    const adminDoc = await db.collection('admins').doc(request.auth.uid).get()
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Solo los administradores pueden ejecutar esta función')
    }

    try {
      console.log('📊 [BillingStats] Iniciando cálculo de estadísticas globales...')
      const startTime = Date.now()

      // Obtener todas las suscripciones (negocios principales)
      const subscriptionsSnapshot = await db.collection('subscriptions').get()
      const mainBusinesses = subscriptionsSnapshot.docs.filter(doc => !doc.data().ownerId)

      console.log(`📊 [BillingStats] Procesando ${mainBusinesses.length} negocios...`)

      // Procesar en lotes para evitar timeout
      const BATCH_SIZE = 20
      let totalDocuments = 0
      let totalAmount = 0
      const byDocType = { '01': 0, '03': 0, '07': 0, '08': 0, '09': 0 }
      const byDocTypeAmount = { '01': 0, '03': 0, '07': 0, '08': 0, '09': 0 }
      const topBusinesses = []

      for (let i = 0; i < mainBusinesses.length; i += BATCH_SIZE) {
        const batch = mainBusinesses.slice(i, i + BATCH_SIZE)

        const batchPromises = batch.map(async (subscriptionDoc) => {
          const subscriptionData = subscriptionDoc.data()
          const businessId = subscriptionDoc.id

          try {
            const invoicesRef = db.collection('businesses').doc(businessId).collection('invoices')
            const invoicesSnapshot = await invoicesRef.get()

            let businessTotal = 0
            let businessCount = 0
            const docTypeCounts = { '01': 0, '03': 0, '07': 0, '08': 0, '09': 0 }
            const docTypeAmounts = { '01': 0, '03': 0, '07': 0, '08': 0, '09': 0 }

            invoicesSnapshot.forEach(invoiceDoc => {
              const invoice = invoiceDoc.data()

              if (invoice.status !== 'anulado' && invoice.status !== 'cancelled' && invoice.status !== 'voided') {
                businessCount++

                const amount = parseFloat(invoice.total) ||
                              parseFloat(invoice.totals?.total) ||
                              parseFloat(invoice.importeTotal) ||
                              parseFloat(invoice.mtoImpVenta) ||
                              0
                businessTotal += amount

                const docType = invoice.tipoDocumento || invoice.docType || invoice.tipoComprobante || '03'
                if (docTypeCounts[docType] !== undefined) {
                  docTypeCounts[docType]++
                  docTypeAmounts[docType] += amount
                }
              }
            })

            return {
              businessId,
              businessName: subscriptionData.businessName || subscriptionData.email || 'Sin nombre',
              email: subscriptionData.email,
              documentCount: businessCount,
              totalAmount: businessTotal,
              docTypeCounts,
              docTypeAmounts
            }
          } catch (e) {
            console.error(`❌ Error procesando ${businessId}:`, e.message)
            return null
          }
        })

        const batchResults = await Promise.all(batchPromises)

        // Agregar resultados del lote
        batchResults.forEach(result => {
          if (!result || result.documentCount === 0) return

          totalDocuments += result.documentCount
          totalAmount += result.totalAmount

          Object.keys(byDocType).forEach(key => {
            byDocType[key] += result.docTypeCounts[key] || 0
            byDocTypeAmount[key] += result.docTypeAmounts[key] || 0
          })

          if (result.documentCount > 0) {
            topBusinesses.push({
              businessId: result.businessId,
              businessName: result.businessName,
              email: result.email,
              documentCount: result.documentCount,
              totalAmount: result.totalAmount
            })
          }
        })

        console.log(`📊 [BillingStats] Procesados ${Math.min(i + BATCH_SIZE, mainBusinesses.length)}/${mainBusinesses.length} negocios...`)
      }

      // Ordenar y tomar top 10
      topBusinesses.sort((a, b) => b.totalAmount - a.totalAmount)
      const top10Businesses = topBusinesses.slice(0, 10)

      // Formatear tipos de documento
      const documentTypes = [
        { type: '01', name: 'Facturas', count: byDocType['01'], amount: byDocTypeAmount['01'] },
        { type: '03', name: 'Boletas', count: byDocType['03'], amount: byDocTypeAmount['03'] },
        { type: '07', name: 'Notas de Crédito', count: byDocType['07'], amount: byDocTypeAmount['07'] },
        { type: '08', name: 'Notas de Débito', count: byDocType['08'], amount: byDocTypeAmount['08'] },
        { type: '09', name: 'Guías de Remisión', count: byDocType['09'], amount: byDocTypeAmount['09'] }
      ].filter(d => d.count > 0)

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2)

      // Guardar en documento de caché
      const statsData = {
        totalDocuments,
        totalAmount,
        documentTypes,
        topBusinesses: top10Businesses,
        calculatedAt: FieldValue.serverTimestamp(),
        calculationTimeSeconds: parseFloat(elapsedTime),
        businessesProcessed: mainBusinesses.length
      }

      await db.collection('adminStats').doc('globalBilling').set(statsData)

      console.log(`✅ [BillingStats] Completado en ${elapsedTime}s - ${totalDocuments} docs, S/ ${totalAmount.toFixed(2)}`)

      return {
        success: true,
        message: 'Estadísticas calculadas y cacheadas exitosamente',
        stats: {
          totalDocuments,
          totalAmount,
          documentTypes,
          topBusinesses: top10Businesses,
          calculationTimeSeconds: parseFloat(elapsedTime),
          businessesProcessed: mainBusinesses.length
        }
      }

    } catch (error) {
      console.error('❌ [BillingStats] Error:', error)
      throw new HttpsError('internal', error.message)
    }
  }
)


/**
 * Cloud Function: Reporte completo para presentación a inversores.
 *
 * Calcula y cachea en `adminStats/investorReport` un set amplio de métricas:
 * negocios, suscripciones (MRR/ARR/distribución), volumen transaccional,
 * engagement (productos/clientes/empleados), y top empresas.
 *
 * Diseñada para correrse on-demand desde el panel admin (botón). El cálculo
 * es pesado (recorre TODAS las suscripciones, businesses, e invoices) por eso
 * se cachea agresivamente — la UI sólo lee el cache hasta que se invoca de nuevo.
 */
export const calculateInvestorReport = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debe estar autenticado')
    }
    const adminDoc = await db.collection('admins').doc(request.auth.uid).get()
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Solo administradores')
    }

    try {
      console.log('📊 [InvestorReport] Iniciando cálculo...')
      const startTime = Date.now()
      const now = new Date()
      const day30 = new Date(now.getTime() - 30 * 86400000)
      const day90 = new Date(now.getTime() - 90 * 86400000)

      // ---- 0) Catálogo de planes (estándar + custom) ----
      // El front guarda PLANS hardcodeado en subscriptionService.js. Lo replicamos
      // acá con sólo months + pricePerMonth (los únicos campos que necesitamos
      // para MRR/clasificación). Es duplicación, pero precios cambian poco.
      const STANDARD_PLANS = {
        trial: { months: 1, pricePerMonth: 0 },
        free: { months: 1, pricePerMonth: 0 },
        qpse_basico_1_month: { months: 1, pricePerMonth: 19.90 },
        qpse_1_month: { months: 1, pricePerMonth: 19.90 },
        qpse_1_month_2025: { months: 1, pricePerMonth: 29.90 },
        qpse_1_month_2_branches: { months: 1, pricePerMonth: 39.80 },
        qpse_1_month_3_branches: { months: 1, pricePerMonth: 29.90 },
        qpse_1_month_1000: { months: 1, pricePerMonth: 29.90 },
        addon_500_comprobantes: { months: 1, pricePerMonth: 10.00 },
        qpse_6_months: { months: 6, pricePerMonth: 16.65 },
        qpse_12_months: { months: 12, pricePerMonth: 12.49 },
        sunat_direct_1_month: { months: 1, pricePerMonth: 19.90 },
        sunat_direct_6_months: { months: 6, pricePerMonth: 16.65 },
        sunat_direct_12_months: { months: 12, pricePerMonth: 12.49 },
        qpse_1_month_2024: { months: 1, pricePerMonth: 29.90 },
        qpse_6_months_2024: { months: 6, pricePerMonth: 16.65 },
        qpse_12_months_2024: { months: 12, pricePerMonth: 12.49 },
        sunat_direct_1_month_2024: { months: 1, pricePerMonth: 29.90 },
        sunat_direct_6_months_2024: { months: 6, pricePerMonth: 16.65 },
        sunat_direct_12_months_2024: { months: 12, pricePerMonth: 12.49 },
        enterprise: { months: 1, pricePerMonth: 99 },
      }

      // Cargar planes custom desde Firestore (los que el admin creó)
      let customPlans = {}
      try {
        const customDoc = await db.collection('settings').doc('customPlans').get()
        if (customDoc.exists) customPlans = customDoc.data().plans || {}
      } catch (e) { /* sin customs */ }

      const ALL_PLANS = { ...STANDARD_PLANS }
      Object.entries(customPlans).forEach(([key, plan]) => {
        const months = plan.months || 1
        const pricePerMonth = plan.pricePerMonth != null
          ? Number(plan.pricePerMonth)
          : (plan.totalPrice ? Number(plan.totalPrice) / months : 0)
        ALL_PLANS[key] = { months, pricePerMonth }
      })

      // Helper: inferir info del plan desde el nombre si no está en el catálogo
      const inferPlanInfo = (planKey) => {
        if (!planKey) return null
        if (ALL_PLANS[planKey]) return ALL_PLANS[planKey]
        // Fallback: detectar months desde el nombre
        if (/12[_-]?months?/i.test(planKey)) return { months: 12, pricePerMonth: 0 }
        if (/6[_-]?months?/i.test(planKey)) return { months: 6, pricePerMonth: 0 }
        if (/1[_-]?month/i.test(planKey)) return { months: 1, pricePerMonth: 0 }
        if (/annual|anual|year/i.test(planKey)) return { months: 12, pricePerMonth: 0 }
        return null
      }

      // ---- 1) Suscripciones (la fuente de verdad sobre planes/billing) ----
      const subsSnap = await db.collection('subscriptions').get()
      const mainSubs = subsSnap.docs.filter((d) => !d.data().ownerId)

      const businesses = {
        total: 0,
        active: 0,
        suspended: 0,
        trial: 0,
        free: 0,
        archived: 0,    // suspendidos marcados como "no contar" desde admin
        newLast30: 0,
        newLast90: 0,
      }
      const subs = {
        monthly: 0,         // months === 1
        semester: 0,        // months === 6
        annual: 0,          // months === 12
        otherPeriod: 0,     // months !== 1/6/12 o sin info
        byPlan: {},
        byBillingPeriod: {},
        mrr: 0,
        arr: 0,
      }
      const businessIds = []

      // Tasa de retención (foto del estado actual) — análoga a AdminUsers
      const retention = {
        totalWithPayments: 0,    // todos los que pagaron al menos 1 vez
        active: 0,                // con suscripción vigente
        churned: 0,               // venció y no renovó
        inFirstPeriod: 0,         // exactamente 1 pago y vigente
        totalRevenue: 0,          // suma histórica de pagos
        // Tasa histórica por oportunidades
        totalOpportunities: 0,
        totalRenewals: 0,
      }
      const nowDate = new Date()

      mainSubs.forEach((d) => {
        const s = d.data()
        businesses.total++

        // Archivados: el admin los marcó como "no contar" desde /admin/expirations.
        // Se cuentan aparte y no entran en suspended/MRR/tasa de renovación.
        if (s.archived === true) {
          businesses.archived++
          businessIds.push(d.id)
          return
        }

        const isBlocked = s.accessBlocked === true || s.status === 'suspended'
        const isFree = s.plan === 'free'
        const isTrial = s.plan === 'trial' || s.status === 'trialing'

        if (isBlocked) businesses.suspended++
        else if (isFree) businesses.free++
        else if (isTrial) businesses.trial++
        else businesses.active++

        // Crecimiento
        const created = s.createdAt?.toDate?.() || (s.createdAt ? new Date(s.createdAt) : null)
        if (created) {
          if (created >= day30) businesses.newLast30++
          if (created >= day90) businesses.newLast90++
        }

        // Por plan
        const plan = s.plan || 'unknown'
        subs.byPlan[plan] = (subs.byPlan[plan] || 0) + 1

        // Período + MRR: inferir del catálogo o del nombre del plan
        if (!isFree && !isTrial && !isBlocked) {
          const info = inferPlanInfo(plan)
          const months = info?.months || 1
          let periodKey
          if (months === 1) { periodKey = 'monthly'; subs.monthly++ }
          else if (months === 6) { periodKey = 'semester'; subs.semester++ }
          else if (months === 12) { periodKey = 'annual'; subs.annual++ }
          else { periodKey = 'other'; subs.otherPeriod++ }
          subs.byBillingPeriod[periodKey] = (subs.byBillingPeriod[periodKey] || 0) + 1

          // MRR: si la sub tiene pricePerMonth/totalPrice persistido, lo prefiero
          // (representa lo que el usuario realmente paga). Fallback al catálogo.
          let perMonth = parseFloat(s.pricePerMonth)
          if (!perMonth || isNaN(perMonth)) {
            const total = parseFloat(s.totalPrice)
            if (total && months) perMonth = total / months
          }
          if (!perMonth || isNaN(perMonth)) {
            perMonth = info?.pricePerMonth || 0
          }
          subs.mrr += perMonth
        }

        // Métricas de retención: misma lógica que AdminUsers
        // (también excluye archivados — ya se hizo return arriba si archived)
        const payments = Array.isArray(s.paymentHistory) ? s.paymentHistory : []
        if (payments.length > 0) {
          retention.totalWithPayments++
          for (const p of payments) {
            retention.totalRevenue += parseFloat(p.amount) || 0
          }
          const pEnd = s.currentPeriodEnd?.toDate?.() || (s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null)
          const isVigente = pEnd && pEnd > nowDate
          if (isVigente) {
            retention.active++
            if (payments.length === 1) retention.inFirstPeriod++
          } else {
            retention.churned++
          }
          // Tasa histórica por oportunidades
          const renewalsFromUser = Math.max(0, payments.length - 1)
          const opportunitiesFromUser = renewalsFromUser + (isVigente ? 0 : 1)
          retention.totalRenewals += renewalsFromUser
          retention.totalOpportunities += opportunitiesFromUser
        }

        businessIds.push(d.id)
      })
      subs.arr = subs.mrr * 12

      // Calcular tasas finales
      const candidates = retention.totalWithPayments - retention.inFirstPeriod
      const renewed = retention.active - retention.inFirstPeriod
      retention.currentRate = candidates > 0 ? Math.round((renewed / candidates) * 100) : null
      retention.lifetimeRate = retention.totalOpportunities > 0
        ? Math.round((retention.totalRenewals / retention.totalOpportunities) * 100)
        : null
      retention.candidates = candidates
      retention.renewed = renewed

      // ---- 2) Datos del negocio (businesses doc) — flags de configuración ----
      const businessFlags = {
        withCatalog: 0,
        withComplaintsBook: 0,
        withDispatchGuides: 0,
        withAttendance: 0,
        withMultipleBranches: 0,
        withProductImages: 0,
        byMode: {},
      }
      let totalBranchesAcrossBusinesses = 0
      const businessNamesById = {}
      const businessModeById = {}

      const BATCH_SIZE = 30
      for (let i = 0; i < businessIds.length; i += BATCH_SIZE) {
        const batch = businessIds.slice(i, i + BATCH_SIZE)
        await Promise.all(batch.map(async (bid) => {
          try {
            const bizDoc = await db.collection('businesses').doc(bid).get()
            if (!bizDoc.exists) return
            const b = bizDoc.data()
            businessNamesById[bid] = b.businessName || b.name || b.email || bid

            const mode = b.businessMode || 'retail'
            businessModeById[bid] = mode
            businessFlags.byMode[mode] = (businessFlags.byMode[mode] || 0) + 1
            if (b.catalogEnabled === true) businessFlags.withCatalog++
            if (b.complaintsBookEnabled === true) businessFlags.withComplaintsBook++
            if (b.dispatchGuidesEnabled === true) businessFlags.withDispatchGuides++
            if (b.enableProductImages === true) businessFlags.withProductImages++
            if (b.attendance?.enabled === true) businessFlags.withAttendance++

            // Sucursales: contar si hay docs en branches/
            try {
              const branchesSnap = await db.collection('businesses').doc(bid).collection('branches').get()
              const c = branchesSnap.size
              if (c > 1) businessFlags.withMultipleBranches++
              totalBranchesAcrossBusinesses += c
            } catch (e) { /* sin branches */ }
          } catch (e) { /* ignore */ }
        }))
      }

      // ---- 3) Volumen transaccional + engagement (invoices, products, customers, sub-users) ----
      const invoicing = {
        totalAmount: 0,
        totalDocuments: 0,
        byDocType: { factura: 0, boleta: 0, nota_venta: 0, nota_credito: 0, nota_debito: 0, other: 0 },
      }
      const engagement = {
        totalProducts: 0,
        totalCustomers: 0,
        totalEmployees: 0,
        totalCategories: 0,
      }
      const topBusinessesByRevenue = []

      for (let i = 0; i < businessIds.length; i += BATCH_SIZE) {
        const batch = businessIds.slice(i, i + BATCH_SIZE)
        await Promise.all(batch.map(async (bid) => {
          try {
            const [invSnap, prodSnap, custSnap] = await Promise.all([
              db.collection('businesses').doc(bid).collection('invoices').get(),
              db.collection('businesses').doc(bid).collection('products').get(),
              db.collection('businesses').doc(bid).collection('customers').get(),
            ])

            let bizTotal = 0
            let bizDocs = 0
            invSnap.forEach((iDoc) => {
              const inv = iDoc.data()
              if (inv.status === 'cancelled' || inv.status === 'voided' || inv.status === 'anulado') return
              if (inv.documentType === 'nota_credito') return // no es venta
              bizDocs++
              const amount = parseFloat(inv.total) || parseFloat(inv.totals?.total) || 0
              bizTotal += amount
              const dt = inv.documentType || 'other'
              if (invoicing.byDocType[dt] !== undefined) {
                invoicing.byDocType[dt]++
              } else {
                invoicing.byDocType.other++
              }
            })
            invoicing.totalAmount += bizTotal
            invoicing.totalDocuments += bizDocs
            engagement.totalProducts += prodSnap.size
            engagement.totalCustomers += custSnap.size

            if (bizTotal > 0) {
              topBusinessesByRevenue.push({
                businessId: bid,
                businessName: businessNamesById[bid] || bid,
                businessMode: businessModeById[bid] || 'retail',
                totalAmount: bizTotal,
                documentCount: bizDocs,
              })
            }
          } catch (e) { /* ignore */ }
        }))
      }

      // Sub-usuarios (empleados de los negocios) — query global a `users`
      try {
        const allUsersSnap = await db.collection('users').get()
        engagement.totalEmployees = allUsersSnap.docs.filter((d) => !!d.data().ownerId).length
      } catch (e) { /* ignore */ }

      // Top 10
      topBusinessesByRevenue.sort((a, b) => b.totalAmount - a.totalAmount)
      const top10 = topBusinessesByRevenue.slice(0, 10)

      // Promedios (con guardas para no dividir por 0)
      const avgRevenuePerBusiness = businesses.total > 0 ? invoicing.totalAmount / businesses.total : 0
      const avgDocsPerBusiness = businesses.total > 0 ? invoicing.totalDocuments / businesses.total : 0
      const avgProductsPerBusiness = businesses.total > 0 ? engagement.totalProducts / businesses.total : 0
      const avgEmployeesPerBusiness = businesses.total > 0 ? engagement.totalEmployees / businesses.total : 0

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)

      const report = {
        businesses,
        subscriptions: subs,
        retention,
        businessFlags,
        invoicing,
        engagement,
        averages: {
          revenuePerBusiness: avgRevenuePerBusiness,
          docsPerBusiness: avgDocsPerBusiness,
          productsPerBusiness: avgProductsPerBusiness,
          employeesPerBusiness: avgEmployeesPerBusiness,
        },
        topBusinessesByRevenue: top10,
        totalBranchesAcrossBusinesses,
        calculatedAt: FieldValue.serverTimestamp(),
        calculationTimeSeconds: parseFloat(elapsed),
        businessesProcessed: businessIds.length,
      }

      await db.collection('adminStats').doc('investorReport').set(report)
      console.log(`✅ [InvestorReport] Listo en ${elapsed}s — ${businesses.total} negocios · S/ ${invoicing.totalAmount.toFixed(2)} facturado`)

      return { success: true, stats: { ...report, calculatedAt: null } }
    } catch (error) {
      console.error('❌ [InvestorReport] Error:', error)
      throw new HttpsError('internal', error.message)
    }
  }
)


/**
 * Cloud Function Callable: Renovación segura de cliente por reseller
 * Valida pertenencia, calcula precio con tier, verifica saldo, y ejecuta atómicamente
 */
export const resellerRenewClient = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    // Verificar autenticación
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión')
    }

    const { clientId, plan } = request.data
    if (!clientId || !plan) {
      throw new HttpsError('invalid-argument', 'clientId y plan son requeridos')
    }

    // Meses por plan
    const PLAN_MONTHS = {
      qpse_1_month: 1,
      qpse_6_months: 6,
      qpse_12_months: 12,
      sunat_direct_1_month: 1,
      sunat_direct_6_months: 6,
      sunat_direct_12_months: 12,
    }

    // Precios base para resellers
    const BASE_PRICES = {
      qpse_1_month: 20,
      qpse_6_months: 100,
      qpse_12_months: 150,
      sunat_direct_1_month: 20,
      sunat_direct_6_months: 100,
      sunat_direct_12_months: 150,
    }

    const months = PLAN_MONTHS[plan]
    if (!months) {
      throw new HttpsError('invalid-argument', 'Plan no válido para renovación')
    }

    const callerUid = request.auth.uid
    const callerEmail = request.auth.token.email

    try {
      // Ejecutar en transacción para atomicidad
      const result = await db.runTransaction(async (transaction) => {
        // 1. Verificar que el caller es un reseller activo
        let resellerRef = db.collection('resellers').doc(callerUid)
        let resellerDoc = await transaction.get(resellerRef)

        // Si no existe por UID, buscar por email
        if (!resellerDoc.exists) {
          const resellersQuery = await db.collection('resellers')
            .where('email', '==', callerEmail)
            .limit(1)
            .get()

          if (resellersQuery.empty) {
            throw new HttpsError('permission-denied', 'No eres un reseller registrado')
          }

          resellerRef = resellersQuery.docs[0].ref
          resellerDoc = await transaction.get(resellerRef)
        }

        const resellerData = resellerDoc.data()
        if (resellerData.isActive === false) {
          throw new HttpsError('permission-denied', 'Tu cuenta de reseller está inactiva')
        }

        const resellerId = resellerDoc.id

        // 2. Verificar que el cliente pertenece al reseller
        const clientRef = db.collection('subscriptions').doc(clientId)
        const clientDoc = await transaction.get(clientRef)

        if (!clientDoc.exists) {
          throw new HttpsError('not-found', 'Cliente no encontrado')
        }

        const clientData = clientDoc.data()
        if (clientData.resellerId !== resellerId) {
          throw new HttpsError('permission-denied', 'Este cliente no pertenece a tu red')
        }

        // 3. Calcular precio según tier del reseller
        const discount = resellerData.discountOverride !== null && resellerData.discountOverride !== undefined
          ? resellerData.discountOverride
          : 20 // Default bronze tier

        // Si hay tier dinámico, contamos clientes activos
        if (resellerData.discountOverride === null || resellerData.discountOverride === undefined) {
          // Obtener tier info (simplificado - usar defaults si no hay config)
          const tiersDoc = await transaction.get(db.collection('settings').doc('resellerTiers'))
          let tiers = [
            { minClients: 0, discount: 20 },
            { minClients: 10, discount: 30 },
            { minClients: 100, discount: 40 }
          ]
          if (tiersDoc.exists && tiersDoc.data().tiers) {
            tiers = tiersDoc.data().tiers
          }

          // Nota: no podemos hacer queries en transacciones, usar el descuento del override o default
        }

        const basePrice = BASE_PRICES[plan] || 0
        const finalPrice = Math.round(basePrice * (1 - discount / 100))

        // 4. Verificar saldo suficiente
        const currentBalance = resellerData.balance || 0
        if (currentBalance < finalPrice) {
          throw new HttpsError('failed-precondition',
            `Saldo insuficiente. Necesitas S/ ${finalPrice} pero tienes S/ ${currentBalance.toFixed(2)}`)
        }

        // 5. Calcular nueva fecha de vencimiento
        const now = new Date()
        const currentEnd = clientData.currentPeriodEnd?.toDate?.()
        const startFrom = currentEnd && currentEnd > now ? currentEnd : now
        const newPeriodEnd = new Date(startFrom)
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + months)

        const isSunatDirect = plan.startsWith('sunat_direct')

        // 6. Actualizar suscripción del cliente
        transaction.update(clientRef, {
          plan: plan,
          currentPeriodEnd: newPeriodEnd,
          status: 'active',
          accessBlocked: false,
          blockReason: null,
          blockedAt: null,
          'limits.maxInvoicesPerMonth': isSunatDirect ? -1 : 500,
          updatedAt: FieldValue.serverTimestamp(),
          lastRenewalAt: FieldValue.serverTimestamp(),
          lastRenewalBy: resellerId,
        })

        // 7. Deducir saldo del reseller
        const newBalance = currentBalance - finalPrice
        transaction.update(resellerRef, {
          balance: newBalance,
          totalSpent: (resellerData.totalSpent || 0) + finalPrice,
          updatedAt: FieldValue.serverTimestamp(),
        })

        // 8. Registrar transacción
        const transactionRef = db.collection('resellerTransactions').doc()
        transaction.set(transactionRef, {
          resellerId: resellerId,
          type: 'renewal',
          amount: -finalPrice,
          description: `Renovación ${plan} - ${clientData.businessName || clientData.email}`,
          clientId: clientId,
          clientEmail: clientData.email,
          plan: plan,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          createdAt: FieldValue.serverTimestamp(),
        })

        return {
          success: true,
          newPeriodEnd: newPeriodEnd.toISOString(),
          amountCharged: finalPrice,
          newBalance: newBalance,
        }
      })

      console.log(`✅ [ResellerRenew] Reseller ${callerUid} renovó cliente ${clientId} con plan ${plan}`)
      return result

    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('❌ [ResellerRenew] Error:', error)
      throw new HttpsError('internal', 'Error al procesar la renovación')
    }
  }
)

/**
 * Cloud Function: Reseller compra +500 comprobantes para un cliente
 * Precio fijo: S/ 10 (sin descuento de tier)
 * Incrementa limits.maxInvoicesPerMonth del cliente
 */
export const resellerAddInvoices = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión')
    }

    const { clientId } = request.data
    if (!clientId) {
      throw new HttpsError('invalid-argument', 'clientId es requerido')
    }

    const ADDON_PRICE = 10
    const ADDON_AMOUNT = 500
    const callerUid = request.auth.uid
    const callerEmail = request.auth.token.email

    try {
      const result = await db.runTransaction(async (transaction) => {
        // 1. Verificar que el caller es un reseller activo
        let resellerRef = db.collection('resellers').doc(callerUid)
        let resellerDoc = await transaction.get(resellerRef)

        if (!resellerDoc.exists) {
          const resellersQuery = await db.collection('resellers')
            .where('email', '==', callerEmail)
            .limit(1)
            .get()

          if (resellersQuery.empty) {
            throw new HttpsError('permission-denied', 'No eres un reseller registrado')
          }

          resellerRef = resellersQuery.docs[0].ref
          resellerDoc = await transaction.get(resellerRef)
        }

        const resellerData = resellerDoc.data()
        if (resellerData.isActive === false) {
          throw new HttpsError('permission-denied', 'Tu cuenta de reseller está inactiva')
        }

        const resellerId = resellerDoc.id

        // 2. Verificar que el cliente pertenece al reseller
        const clientRef = db.collection('subscriptions').doc(clientId)
        const clientDoc = await transaction.get(clientRef)

        if (!clientDoc.exists) {
          throw new HttpsError('not-found', 'Cliente no encontrado')
        }

        const clientData = clientDoc.data()
        if (clientData.resellerId !== resellerId) {
          throw new HttpsError('permission-denied', 'Este cliente no pertenece a tu red')
        }

        // 3. Verificar que el cliente tiene un plan QPse (no SUNAT directo que ya es ilimitado)
        const currentLimit = clientData.limits?.maxInvoicesPerMonth
        if (currentLimit === -1) {
          throw new HttpsError('failed-precondition',
            'Este cliente ya tiene comprobantes ilimitados (plan SUNAT Directo)')
        }

        // 4. Verificar saldo suficiente
        const currentBalance = resellerData.balance || 0
        if (currentBalance < ADDON_PRICE) {
          throw new HttpsError('failed-precondition',
            `Saldo insuficiente. Necesitas S/ ${ADDON_PRICE} pero tienes S/ ${currentBalance.toFixed(2)}`)
        }

        // 5. Aumentar límite de comprobantes del cliente
        const newLimit = (currentLimit || 200) + ADDON_AMOUNT

        transaction.update(clientRef, {
          'limits.maxInvoicesPerMonth': newLimit,
          updatedAt: FieldValue.serverTimestamp(),
        })

        // 6. Deducir saldo del reseller
        const newBalance = currentBalance - ADDON_PRICE
        transaction.update(resellerRef, {
          balance: newBalance,
          totalSpent: (resellerData.totalSpent || 0) + ADDON_PRICE,
          updatedAt: FieldValue.serverTimestamp(),
        })

        // 7. Registrar transacción
        const transactionRef = db.collection('resellerTransactions').doc()
        transaction.set(transactionRef, {
          resellerId: resellerId,
          type: 'addon',
          amount: -ADDON_PRICE,
          description: `+${ADDON_AMOUNT} comprobantes - ${clientData.businessName || clientData.email}`,
          clientId: clientId,
          clientEmail: clientData.email,
          addonType: 'invoices',
          addonAmount: ADDON_AMOUNT,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          createdAt: FieldValue.serverTimestamp(),
        })

        return {
          success: true,
          newLimit,
          amountCharged: ADDON_PRICE,
          newBalance,
        }
      })

      console.log(`✅ [ResellerAddon] Reseller ${callerUid} agregó ${ADDON_AMOUNT} comprobantes a cliente ${clientId}`)
      return result

    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('❌ [ResellerAddon] Error:', error)
      throw new HttpsError('internal', 'Error al procesar la compra de comprobantes')
    }
  }
)

/**
 * Scheduled Function: Verifica vencimientos de suscripciones diariamente
 * - 7 días antes: notificación de advertencia
 * - 3 días antes: notificación de urgencia
 * - 1 día antes: notificación final
 * - Día del vencimiento: marcar como "en gracia"
 * - 1 día después: suspender automáticamente
 * - Salta usuarios enterprise y super admins
 * - Salta sub-usuarios (usan suscripción del owner)
 */
export const checkSubscriptionExpirations = onSchedule(
  {
    schedule: '0 1 * * *', // 01:00 AM Lima
    timeZone: 'America/Lima',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    console.log('🔔 [CheckExpirations] Iniciando verificación de vencimientos...')

    try {
      const now = new Date()

      // 1. Obtener todos los admins para excluirlos
      const adminsSnapshot = await db.collection('admins').get()
      const adminIds = new Set(adminsSnapshot.docs.map(d => d.id))

      // 2. Obtener sub-usuarios para excluirlos
      const usersSnapshot = await db.collection('users').where('ownerId', '!=', '').get()
      const subUserIds = new Set()
      usersSnapshot.docs.forEach(d => {
        if (d.data().ownerId) subUserIds.add(d.id)
      })

      // 3. Obtener suscripciones activas
      const activeSnapshot = await db.collection('subscriptions')
        .where('status', '==', 'active')
        .where('accessBlocked', '==', false)
        .get()

      let notificationsCreated = 0
      let suspendedCount = 0

      for (const docSnap of activeSnapshot.docs) {
        try {
        const sub = docSnap.data()
        const userId = docSnap.id

        // Saltar admins, sub-usuarios, y enterprise
        if (adminIds.has(userId)) continue
        if (subUserIds.has(userId)) continue
        if (sub.plan === 'enterprise') continue

        const periodEnd = sub.currentPeriodEnd?.toDate?.()
        if (!periodEnd) continue

        const diffMs = periodEnd.getTime() - now.getTime()
        const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

        // Cuentas de reseller: suspender inmediatamente al vencer (sin período de gracia)
        const isResellerAccount = !!sub.resellerId
        const suspendThreshold = isResellerAccount ? 0 : -1

        // Suspender cuando corresponda según tipo de cuenta
        if (daysUntilExpiry <= suspendThreshold) {
          await db.collection('subscriptions').doc(userId).update({
            status: 'suspended',
            accessBlocked: true,
            blockReason: 'Suscripción vencida',
            blockedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })
          suspendedCount++
          console.log(`🔒 Suspendido: ${sub.email || userId} (reseller: ${isResellerAccount}, días: ${daysUntilExpiry})`)

          // Crear notificación de suspensión
          try {
            const suspTitle = 'Cuenta Suspendida'
            const suspMessage = `Tu suscripción ha vencido y tu cuenta ha sido suspendida. Renueva tu plan para seguir usando Cobrify.`
            await db.collection('notifications').add({
              userId,
              type: 'subscription_expired',
              title: suspTitle,
              message: suspMessage,
              metadata: { periodEnd: periodEnd.toISOString(), autoSuspended: true },
              read: false,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            })
            // Enviar push notification
            await sendPushNotification(userId, suspTitle, suspMessage, { type: 'subscription_expired' })
            notificationsCreated++
          } catch (notifErr) {
            console.error(`⚠️ Error notificación suspensión ${userId}:`, notifErr.message)
          }
          continue
        }

        // Notificaciones por proximidad de vencimiento
        let notifTitle = null
        let notifMessage = null
        let notifType = 'subscription_expiring_soon'

        if (daysUntilExpiry === 7) {
          notifTitle = 'Tu suscripción vence en 7 días'
          notifMessage = `Tu plan ${sub.plan} vence el ${periodEnd.toLocaleDateString('es-PE')}. Renueva para no perder acceso.`
        } else if (daysUntilExpiry === 3) {
          notifTitle = 'Tu suscripción vence en 3 días'
          notifMessage = `¡Atención! Tu plan vence el ${periodEnd.toLocaleDateString('es-PE')}. Renueva ahora para evitar la suspensión.`
        } else if (daysUntilExpiry === 1) {
          notifTitle = 'Tu suscripción vence mañana'
          notifMessage = `¡Último día! Tu plan vence mañana ${periodEnd.toLocaleDateString('es-PE')}. Renueva hoy para no perder acceso.`
        } else if (daysUntilExpiry === 0 && !isResellerAccount) {
          notifTitle = 'Tu suscripción vence hoy'
          notifMessage = `Tu plan vence hoy. Tienes 24 horas de gracia para renovar antes de que tu cuenta sea suspendida.`
          notifType = 'subscription_expired'
        }

        if (notifTitle) {
          try {
            // Crear notificación directamente (sin verificar duplicados para evitar error de índice)
            await db.collection('notifications').add({
              userId,
              type: notifType,
              title: notifTitle,
              message: notifMessage,
              metadata: { periodEnd: periodEnd.toISOString(), daysUntilExpiry },
              read: false,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            })
            // Enviar push notification
            await sendPushNotification(userId, notifTitle, notifMessage, { type: notifType })
            notificationsCreated++
          } catch (notifError) {
            console.error(`⚠️ Error creando notificación para ${userId}:`, notifError.message)
          }
        }
        } catch (userError) {
          console.error(`⚠️ Error procesando usuario ${docSnap.id}:`, userError.message)
        }
      }

      console.log(`✅ [CheckExpirations] Completado: ${notificationsCreated} notificaciones, ${suspendedCount} suspendidos`)

    } catch (error) {
      console.error('❌ [CheckExpirations] Error:', error)
    }
  }
)

/**
 * Migrar productos de IGV 10% a 10.5% para negocios con IGV reducido
 * Elimina el campo igvRate de productos que tienen igvRate=10 para que usen el global (10.5%)
 */
export const migrateProductsIgvRate = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (req, res) => {
    setCorsHeaders(res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

    try {
      // Verificar autenticación admin
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No autorizado' }); return
      }
      const idToken = authHeader.split('Bearer ')[1]
      const decodedToken = await auth.verifyIdToken(idToken)
      const adminDoc = await db.collection('admins').doc(decodedToken.uid).get()
      if (!adminDoc.exists || !adminDoc.data()?.isAdmin) {
        res.status(403).json({ error: 'Solo administradores' }); return
      }

      const dryRun = req.body?.dryRun === true
      console.log(`🔄 [MIGRATE-IGV] ${dryRun ? 'PREVIEW' : 'EJECUTANDO'} migración de productos IGV 10% → 10.5%...`)

      // Buscar negocios con IGV reducido
      const businessesSnapshot = await db.collection('businesses').get()
      let totalBusinesses = 0
      let totalProducts = 0
      const details = []

      for (const businessDoc of businessesSnapshot.docs) {
        const businessData = businessDoc.data()
        const taxConfig = businessData.emissionConfig?.taxConfig
        const isReducedIgv = taxConfig?.taxType === 'reduced' || taxConfig?.igvRate === 10.5
        if (!isReducedIgv) continue

        totalBusinesses++
        const businessId = businessDoc.id
        const businessName = businessData.razonSocial || businessData.businessName || businessId

        // Buscar productos con igvRate = 10
        const productsRef = db.collection('businesses').doc(businessId).collection('products')
        const productsSnapshot = await productsRef.where('igvRate', '==', 10).get()

        const count = productsSnapshot.size
        const products = productsSnapshot.docs.map(d => ({ id: d.id, name: d.data().name }))

        if (count === 0) continue

        if (!dryRun) {
          // Batch update: eliminar igvRate para que use el global
          const batch = db.batch()
          for (const productDoc of productsSnapshot.docs) {
            batch.update(productDoc.ref, { igvRate: FieldValue.delete() })
          }
          await batch.commit()
          console.log(`✅ [MIGRATE-IGV] ${businessName}: ${count} productos actualizados`)
        }

        totalProducts += count
        details.push({ businessId, businessName, count, products })
      }

      console.log(`📊 [MIGRATE-IGV] Resumen: ${totalBusinesses} negocios, ${totalProducts} productos ${dryRun ? 'detectados' : 'migrados'}`)

      res.status(200).json({
        success: true,
        dryRun,
        totalBusinesses,
        totalProducts,
        details
      })
    } catch (error) {
      console.error('❌ [MIGRATE-IGV] Error:', error)
      res.status(500).json({ error: error.message })
    }
  }
)

// ============================================
// BULK PUSH NOTIFICATIONS (Admin)
// ============================================
export const sendBulkPushNotifications = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    // Verificar autenticación
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debe estar autenticado para ejecutar esta función')
    }

    // Verificar que es admin
    const adminDoc = await db.collection('admins').doc(request.auth.uid).get()
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Solo los administradores pueden ejecutar esta función')
    }

    const { campaignId } = request.data
    if (!campaignId) {
      throw new HttpsError('invalid-argument', 'Se requiere campaignId')
    }

    try {
      console.log(`📢 [BulkPush] Iniciando campaña ${campaignId}`)

      // 1. Leer campaña y verificar status
      const campaignRef = db.collection('pushCampaigns').doc(campaignId)
      const campaignDoc = await campaignRef.get()

      if (!campaignDoc.exists) {
        throw new HttpsError('not-found', 'Campaña no encontrada')
      }

      const campaign = campaignDoc.data()
      if (campaign.status !== 'draft') {
        throw new HttpsError('failed-precondition', `La campaña tiene estado "${campaign.status}", se esperaba "draft"`)
      }

      // 2. Marcar como enviando
      await campaignRef.update({
        status: 'sending',
        sentAt: FieldValue.serverTimestamp()
      })

      // 3. Resolver usuarios destino
      let targetUserIds = []

      if (campaign.targetMode === 'manual') {
        targetUserIds = campaign.manualUserIds || []
      } else {
        // Obtener todos los usuarios o filtrados
        const usersSnapshot = await db.collection('users').get()

        for (const userDoc of usersSnapshot.docs) {
          const userData = userDoc.data()

          if (campaign.targetMode === 'filter') {
            const filters = campaign.filters || {}

            // Filtrar por plan
            if (filters.plans && filters.plans.length > 0) {
              const userPlan = userData.subscription?.plan || userData.plan || 'free'
              if (!filters.plans.includes(userPlan)) continue
            }

            // Filtrar por status de suscripción
            if (filters.statuses && filters.statuses.length > 0) {
              const userStatus = userData.subscription?.status || userData.subscriptionStatus || 'active'
              if (!filters.statuses.includes(userStatus)) continue
            }

            // Filtrar por modo de negocio
            if (filters.businessModes && filters.businessModes.length > 0) {
              const userMode = userData.businessMode || 'retail'
              if (!filters.businessModes.includes(userMode)) continue
            }
          }

          // Verificar que tiene tokens FCM
          const tokensSnap = await db.collection('users').doc(userDoc.id).collection('fcmTokens').limit(1).get()
          if (!tokensSnap.empty) {
            targetUserIds.push(userDoc.id)
          }
        }
      }

      console.log(`📢 [BulkPush] Usuarios destino: ${targetUserIds.length}`)

      if (targetUserIds.length === 0) {
        await campaignRef.update({
          status: 'sent',
          totalRecipients: 0,
          totalTokens: 0,
          successCount: 0,
          failureCount: 0,
          completedAt: FieldValue.serverTimestamp()
        })
        return { success: true, totalRecipients: 0, successCount: 0 }
      }

      // 4. Recopilar todos los tokens
      const allTokens = []
      const tokenUserMap = {} // token -> userId

      for (const userId of targetUserIds) {
        const tokensSnap = await db.collection('users').doc(userId).collection('fcmTokens').get()
        for (const tokenDoc of tokensSnap.docs) {
          const token = tokenDoc.data().token
          if (token) {
            allTokens.push(token)
            tokenUserMap[token] = userId
          }
        }
      }

      console.log(`📢 [BulkPush] Total tokens: ${allTokens.length}`)

      let totalSuccess = 0
      let totalFailure = 0
      const invalidTokens = []

      // 5. Enviar en lotes de 500
      const BATCH_SIZE = 500
      for (let i = 0; i < allTokens.length; i += BATCH_SIZE) {
        const batchTokens = allTokens.slice(i, i + BATCH_SIZE)

        const message = {
          notification: {
            title: campaign.title,
            body: campaign.message
          },
          data: {
            type: 'admin_broadcast',
            campaignId: campaignId,
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
          },
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'default'
            }
          },
          apns: {
            headers: { 'apns-priority': '10' },
            payload: {
              aps: {
                alert: { title: campaign.title, body: campaign.message },
                badge: 1,
                sound: 'default'
              }
            }
          },
          tokens: batchTokens
        }

        try {
          const response = await messaging.sendEachForMulticast(message)
          totalSuccess += response.successCount
          totalFailure += response.failureCount

          // Identificar tokens inválidos
          if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                if (resp.error?.code === 'messaging/invalid-registration-token' ||
                    resp.error?.code === 'messaging/registration-token-not-registered') {
                  invalidTokens.push(batchTokens[idx])
                }
              }
            })
          }
        } catch (batchError) {
          console.error(`📢 [BulkPush] Error en lote ${i / BATCH_SIZE + 1}:`, batchError.message)
          totalFailure += batchTokens.length
        }
      }

      // 6. Crear notificaciones in-app para cada usuario
      const uniqueUserIds = [...new Set(targetUserIds)]
      let notifBatch = db.batch()
      let batchCount = 0

      for (const userId of uniqueUserIds) {
        const notifRef = db.collection('notifications').doc()
        notifBatch.set(notifRef, {
          userId,
          type: 'admin_broadcast',
          title: campaign.title,
          message: campaign.message,
          read: false,
          campaignId,
          createdAt: FieldValue.serverTimestamp()
        })
        batchCount++

        // Firestore batch limit is 500
        if (batchCount >= 490) {
          await notifBatch.commit()
          notifBatch = db.batch()
          batchCount = 0
        }
      }

      if (batchCount > 0) {
        await notifBatch.commit()
      }

      // 7. Limpiar tokens inválidos
      if (invalidTokens.length > 0) {
        console.log(`📢 [BulkPush] Limpiando ${invalidTokens.length} tokens inválidos`)
        for (const token of invalidTokens) {
          const userId = tokenUserMap[token]
          if (userId) {
            try {
              const tokenQuery = await db.collection('users').doc(userId).collection('fcmTokens')
                .where('token', '==', token).get()
              for (const tokenDoc of tokenQuery.docs) {
                await tokenDoc.ref.delete()
              }
            } catch (e) {
              console.error(`📢 [BulkPush] Error limpiando token:`, e.message)
            }
          }
        }
      }

      // 8. Actualizar campaña con stats
      const finalStatus = totalSuccess > 0
        ? (totalFailure > 0 ? 'partial' : 'sent')
        : 'failed'

      await campaignRef.update({
        status: finalStatus,
        totalRecipients: uniqueUserIds.length,
        totalTokens: allTokens.length,
        successCount: totalSuccess,
        failureCount: totalFailure,
        completedAt: FieldValue.serverTimestamp()
      })

      console.log(`📢 [BulkPush] Campaña ${campaignId} completada: ${finalStatus} (${totalSuccess}/${allTokens.length})`)

      return {
        success: true,
        status: finalStatus,
        totalRecipients: uniqueUserIds.length,
        totalTokens: allTokens.length,
        successCount: totalSuccess,
        failureCount: totalFailure
      }
    } catch (error) {
      console.error('📢 [BulkPush] Error:', error)

      // Intentar marcar campaña como failed
      try {
        await db.collection('pushCampaigns').doc(campaignId).update({
          status: 'failed',
          completedAt: FieldValue.serverTimestamp()
        })
      } catch (_) {}

      throw new HttpsError('internal', error.message)
    }
  }
)

/**
 * Prueba la conexión con Rappi usando las credenciales guardadas en
 * `businesses/{businessId}.rappiConfig`.
 *
 * Devuelve:
 *   { ok: true, ordersCount, sample } si todo bien
 *   { ok: false, step, message, status, data } si algo falla
 *
 * `step` indica dónde se rompió: 'config' | 'login' | 'orders' | 'unknown'
 */
export const testRappiConnection = onCall(
  { region: 'us-central1', cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes estar autenticado')
    }

    const businessId = request.data?.businessId
    const env = request.data?.env === 'production_pe' ? 'production_pe' : 'sandbox'
    if (!businessId) {
      throw new HttpsError('invalid-argument', 'businessId requerido')
    }

    try {
      const businessDoc = await db.collection('businesses').doc(businessId).get()
      if (!businessDoc.exists) {
        return { ok: false, step: 'config', message: 'Business no existe' }
      }
      const businessData = businessDoc.data()
      // El businessId es el uid del owner. Si el caller es ese uid, es el dueño.
      // Si no, debe ser un sub-usuario con users/{uid}.ownerId === businessId.
      const isOwner = request.auth.uid === businessId
      let isSubuser = false
      if (!isOwner) {
        const userDoc = await db.collection('users').doc(request.auth.uid).get()
        if (userDoc.exists && userDoc.data()?.ownerId === businessId) {
          isSubuser = true
        }
      }
      if (!isOwner && !isSubuser) {
        throw new HttpsError('permission-denied', 'Sin acceso a este negocio')
      }

      const cfg = businessData.rappiConfig
      if (!cfg?.clientId || !cfg?.clientSecret || !cfg?.storeId) {
        return {
          ok: false,
          step: 'config',
          message: 'Faltan credenciales en la configuración (Client ID, Secret o Store ID).',
        }
      }

      let token
      try {
        token = await loginRappi({
          clientId: cfg.clientId,
          clientSecret: cfg.clientSecret,
          env,
        })
      } catch (err) {
        return {
          ok: false,
          step: 'login',
          message: err.message || 'Error de autenticación con Rappi',
          status: err.response?.status,
          data: err.response?.data,
        }
      }

      // Probar ambas versiones de la API en paralelo
      const [v1Result, v2Result] = await Promise.all([
        getStoreOrders({ token, storeId: cfg.storeId, env })
          .then(orders => ({ ok: true, count: orders.length, sample: orders.slice(0, 2) }))
          .catch(err => ({
            ok: false,
            status: err.response?.status,
            message: err.message,
            data: err.response?.data,
          })),
        getOrdersV2({ token, env })
          .then(orders => ({ ok: true, count: orders.length, sample: orders.slice(0, 2) }))
          .catch(err => ({
            ok: false,
            status: err.response?.status,
            message: err.message,
            data: err.response?.data,
          })),
      ])

      return {
        ok: true,
        env,
        storeId: cfg.storeId,
        v1: v1Result,
        v2: v2Result,
        // Compat: el campo viejo
        ordersCount: v1Result.ok ? v1Result.count : (v2Result.ok ? v2Result.count : 0),
        sample: v1Result.ok && v1Result.sample?.length ? v1Result.sample : (v2Result.sample || []),
      }
    } catch (err) {
      if (err instanceof HttpsError) throw err
      console.error('testRappiConnection error:', err)
      return { ok: false, step: 'unknown', message: err.message || String(err) }
    }
  }
)

/**
 * Migración masiva de imágenes ya almacenadas en Cloudinary a WebP optimizado.
 *
 * Recorre todos los businesses y sus productos buscando URLs de Cloudinary que
 * NO estén en formato webp/avif. Para cada candidate:
 *   1. Re-uploadea desde la URL original (Cloudinary aplica la incoming
 *      transformation del preset cobrify_unsigned: q_auto:eco,f_auto,c_limit,w_1600).
 *   2. Borra el asset original (libera storage).
 *   3. Actualiza la URL en Firestore.
 *
 * Soporta dryRun y resumeFrom para no timeoutear con catálogos grandes.
 *
 * Solo admin (giiacomo@gmail.com en colección 'admins') puede ejecutarla.
 */
export const migrateCloudinaryImages = onCall(
  {
    region: 'us-central1',
    cors: true,
    timeoutSeconds: 540,
    memory: '512MiB',
    secrets: ['CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debe estar autenticado')
    }
    const adminDoc = await db.collection('admins').doc(request.auth.uid).get()
    if (!adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Solo administradores')
    }

    const dryRun = request.data?.dryRun !== false // default true por seguridad
    const resumeFrom = request.data?.resumeFrom || null
    const onlyBusinessId = request.data?.businessId || null

    // Diagnóstico: verificar que los secrets de Cloudinary están cargados
    // (sin loggear el secret completo, solo confirmamos presencia y prefijo)
    const debugApiKey = process.env.CLOUDINARY_API_KEY || ''
    const debugApiSecret = process.env.CLOUDINARY_API_SECRET || ''
    console.log(
      `[migrate] auth check — apiKey: ${debugApiKey ? debugApiKey.slice(0, 4) + '...(' + debugApiKey.length + ' chars)' : 'MISSING'},`,
      `apiSecret: ${debugApiSecret ? '***(' + debugApiSecret.length + ' chars)' : 'MISSING'},`,
      `dryRun: ${dryRun}`
    )

    const startMs = Date.now()
    const TIME_BUDGET_MS = 8 * 60 * 1000 // 8 min, margen vs timeout de 9

    const stats = {
      dryRun,
      scanned: 0,
      candidates: 0,
      migrated: 0,
      errors: 0,
      freedBytes: 0,
      sampleCandidates: [], // primeras URLs candidate (debug)
      lastProcessed: null,
      resumeFrom: null,
      doneAt: null,
    }

    const BUSINESS_FIELDS = [
      'catalogLogoUrl',
      'catalogLogoLandscape',
      'catalogCoverImage',
      'catalogCoverImageMobile',
    ]

    const timeUp = () => Date.now() - startMs > TIME_BUDGET_MS

    // Cache de migraciones DENTRO de este run (oldUrl → newUrl).
    // Si una misma URL aparece en varios docs, solo se re-uploadea UNA vez.
    //
    // IMPORTANTE: esta función solo crea las versiones WebP y actualiza
    // Firestore. NUNCA borra el asset original. La limpieza de assets
    // huérfanos (asset que ya no está referenciado por ningún doc) la
    // hace cleanupOrphanedCloudinaryAssets en una pasada separada,
    // después de que la migración terminó al 100%.
    //
    // Esto significa que durante la migración hay storage "doble"
    // (original + nueva versión optimizada). El storage real se libera
    // cuando se ejecuta el cleanup.
    //
    // El motivo del split: garantiza que NINGUNA imagen se rompe, ni
    // siquiera en escenarios edge (timeout a la mitad, errores parciales,
    // refs en docs aún no procesados).
    const urlMap = new Map()

    // Si Cloudinary devuelve 420 (rate limit), marcamos el flag y detenemos
    // todas las migraciones del run. Cloudinary tiene un límite por hora
    // (típicamente 2000 ops/h en planes free/básicos). El reset llega a
    // tope de hora UTC. El cliente debe esperar y reintentar.
    let rateLimitHit = false
    let rateLimitMessage = null

    async function reuploadOnce(oldUrl) {
      if (rateLimitHit) return null
      if (urlMap.has(oldUrl)) return urlMap.get(oldUrl)
      try {
        const result = await migrateOneUrl(oldUrl, { dryRun: false })
        urlMap.set(oldUrl, result.newUrl)
        stats.migrated++
        return result.newUrl
      } catch (err) {
        // Detectar rate limit: HTTP 420 o mensaje específico de Cloudinary.
        const status = err.http_code || err.response?.status
        const msg = err.response?.data?.error?.message || err.message || ''
        if (status === 420 || /rate limit/i.test(msg)) {
          rateLimitHit = true
          rateLimitMessage = msg || 'Rate limit excedido en Cloudinary'
          console.warn(`[migrate] Rate limit alcanzado, deteniendo run: ${msg}`)
        }
        stats.errors++
        // Solo loguear el primer error de rate limit en detalle (sino el log se inunda)
        if (!rateLimitHit || stats.errors <= 1) {
          console.error(
            `Re-upload falló para ${oldUrl}: ${err.message}`,
            status ? `[HTTP ${status}]` : '',
            err.response?.data ? JSON.stringify(err.response.data) : ''
          )
        }
        urlMap.set(oldUrl, null)
        return null
      }
    }

    // Procesa una URL en un campo de un doc.
    async function processField({ docRef, fieldName, indexInArray, currentUrl }) {
      stats.scanned++
      if (!isCloudinaryUrl(currentUrl)) return
      if (isAlreadyOptimized(currentUrl)) return

      stats.candidates++
      if (stats.sampleCandidates.length < 10) {
        stats.sampleCandidates.push(currentUrl)
      }
      if (dryRun) return

      const newUrl = await reuploadOnce(currentUrl)
      if (!newUrl) return

      // Actualizar Firestore con la nueva URL.
      try {
        if (indexInArray == null) {
          await docRef.update({ [fieldName]: newUrl })
        } else {
          const fresh = await docRef.get()
          const arr = Array.isArray(fresh.data()?.[fieldName])
            ? [...fresh.data()[fieldName]]
            : []
          if (arr[indexInArray] === currentUrl) {
            arr[indexInArray] = newUrl
            await docRef.update({ [fieldName]: arr })
          }
        }
      } catch (err) {
        stats.errors++
        console.error(`Firestore update failed (${docRef.path}.${fieldName}):`, err.message)
      }
    }

    // Procesa todos los campos de un producto (en paralelo dentro del producto).
    async function processProduct(prodDoc) {
      const pdata = prodDoc.data()
      const tasks = []
      if (pdata.imageUrl) {
        tasks.push(processField({
          docRef: prodDoc.ref, fieldName: 'imageUrl', indexInArray: null, currentUrl: pdata.imageUrl,
        }))
      }
      if (Array.isArray(pdata.imageUrls)) {
        for (let i = 0; i < pdata.imageUrls.length; i++) {
          if (pdata.imageUrls[i]) {
            tasks.push(processField({
              docRef: prodDoc.ref, fieldName: 'imageUrls', indexInArray: i, currentUrl: pdata.imageUrls[i],
            }))
          }
        }
      }
      await Promise.all(tasks)
    }

    // Concurrency pool: ejecuta `worker(item)` con `limit` paralelas.
    async function pool(items, limit, worker) {
      let idx = 0
      const runners = Array.from({ length: limit }, async () => {
        while (idx < items.length) {
          const myIdx = idx++
          if (timeUp()) return
          await worker(items[myIdx])
        }
      })
      await Promise.all(runners)
    }

    try {
      // Listar businesses (filtrar si onlyBusinessId)
      let businessIds = []
      if (onlyBusinessId) {
        businessIds = [onlyBusinessId]
      } else {
        const snap = await db.collection('businesses').orderBy('__name__').get()
        businessIds = snap.docs.map(d => d.id)
      }

      // Si hay resumeFrom, saltar businesses ya procesados
      if (resumeFrom?.businessId) {
        const idx = businessIds.indexOf(resumeFrom.businessId)
        if (idx >= 0) businessIds = businessIds.slice(idx)
      }

      for (const bId of businessIds) {
        if (timeUp()) {
          stats.resumeFrom = { businessId: bId }
          break
        }

        const businessRef = db.collection('businesses').doc(bId)

        // Fase 1: campos del business mismo (logos/portadas) — solo si no
        // estamos retomando dentro de los products del mismo business.
        const skipBusinessFields = resumeFrom?.businessId === bId && resumeFrom?.productId
        if (!skipBusinessFields) {
          const businessSnap = await businessRef.get()
          if (businessSnap.exists) {
            const data = businessSnap.data()
            for (const field of BUSINESS_FIELDS) {
              if (timeUp()) {
                stats.resumeFrom = { businessId: bId }
                break
              }
              if (data[field]) {
                await processField({
                  docRef: businessRef,
                  fieldName: field,
                  indexInArray: null,
                  currentUrl: data[field],
                })
              }
            }
          }
        }
        if (stats.resumeFrom) break

        // Fase 2: productos. Usamos startAt (no startAfter) para no perder
        // docs parcialmente procesados; las URLs ya migradas pasan el chequeo
        // isAlreadyOptimized y se skippan.
        let productsQuery = businessRef.collection('products').orderBy('__name__')
        if (resumeFrom?.businessId === bId && resumeFrom?.productId) {
          productsQuery = productsQuery.startAt(resumeFrom.productId)
        }
        const productsSnap = await productsQuery.get()

        // Procesar productos en paralelo con concurrencia 4
        await pool(productsSnap.docs, 4, async (prodDoc) => {
          if (timeUp()) return
          await processProduct(prodDoc)
          stats.lastProcessed = { businessId: bId, productId: prodDoc.id }
        })

        // Si quedaron productos sin procesar (timeUp o rate limit), guardar el último visto
        if (timeUp() || rateLimitHit) {
          stats.resumeFrom = {
            businessId: bId,
            productId: stats.lastProcessed?.productId || null,
          }
          break
        }
      }

      // Si paró por rate limit, exponer el motivo al cliente para que muestre
      // mensaje claro y espere antes de reintentar.
      if (rateLimitHit) {
        stats.rateLimited = true
        stats.rateLimitMessage = rateLimitMessage
      }

      stats.doneAt = stats.resumeFrom ? null : new Date().toISOString()
      return stats
    } catch (err) {
      console.error('migrateCloudinaryImages error:', err)
      stats.errors++
      throw new HttpsError('internal', err.message || String(err))
    }
  }
)

/**
 * Cleanup de assets huérfanos en Cloudinary.
 *
 * Se corre DESPUÉS de migrateCloudinaryImages haya terminado al 100%
 * (stats.doneAt no-null). Recorre los assets en el folder cobrify/ y borra
 * los que NO estén referenciados por ningún doc de Firestore.
 *
 * Esto es lo que libera el storage real, separadamente de la migración,
 * para garantizar que no se rompe ninguna URL viva.
 *
 * Soporta dryRun (recomendado siempre la primera vez).
 */
export const cleanupOrphanedCloudinaryAssets = onCall(
  {
    region: 'us-central1',
    cors: true,
    timeoutSeconds: 540,
    memory: '512MiB',
    secrets: ['CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado')
    const adminDoc = await db.collection('admins').doc(request.auth.uid).get()
    if (!adminDoc.exists) throw new HttpsError('permission-denied', 'Solo administradores')

    const dryRun = request.data?.dryRun !== false // default true por seguridad
    const startMs = Date.now()
    const TIME_BUDGET_MS = 8 * 60 * 1000

    const stats = {
      dryRun,
      liveUrlsCollected: 0,
      cloudinaryAssetsScanned: 0,
      orphansFound: 0,
      orphansDeleted: 0,
      bytesFreed: 0,
      errors: 0,
      sampleOrphans: [],
      doneAt: null,
    }

    try {
      // 1. Construir el set de public_ids vivos (referenciados desde Firestore)
      const livePublicIds = new Set()

      const collectFromUrl = (url) => {
        if (!url || !isCloudinaryUrl(url)) return
        const parsed = parseCloudinaryUrl(url)
        if (parsed?.publicId) {
          livePublicIds.add(parsed.publicId)
          stats.liveUrlsCollected++
        }
      }

      const businessesSnap = await db.collection('businesses').orderBy('__name__').get()
      for (const bDoc of businessesSnap.docs) {
        const bdata = bDoc.data()
        collectFromUrl(bdata.catalogLogoUrl)
        collectFromUrl(bdata.catalogLogoLandscape)
        collectFromUrl(bdata.catalogCoverImage)
        collectFromUrl(bdata.catalogCoverImageMobile)

        const productsSnap = await bDoc.ref.collection('products').get()
        for (const pDoc of productsSnap.docs) {
          const pdata = pDoc.data()
          collectFromUrl(pdata.imageUrl)
          if (Array.isArray(pdata.imageUrls)) {
            pdata.imageUrls.forEach(collectFromUrl)
          }
        }
      }

      console.log(`[cleanup] live public_ids referenciados: ${livePublicIds.size}`)

      // 2. Listar assets de Cloudinary y comparar
      let nextCursor = null
      const orphansToDelete = []

      do {
        if (Date.now() - startMs > TIME_BUDGET_MS) {
          console.warn('[cleanup] timeout durante listado, retornar parcial')
          break
        }
        const page = await listResources({
          prefix: 'cobrify/',
          maxResults: 500,
          nextCursor,
        })
        for (const r of page.resources || []) {
          stats.cloudinaryAssetsScanned++
          if (!livePublicIds.has(r.public_id)) {
            stats.orphansFound++
            stats.bytesFreed += r.bytes || 0
            orphansToDelete.push({ publicId: r.public_id, bytes: r.bytes || 0 })
            if (stats.sampleOrphans.length < 10) {
              stats.sampleOrphans.push({
                publicId: r.public_id,
                format: r.format,
                bytes: r.bytes,
              })
            }
          }
        }
        nextCursor = page.next_cursor
      } while (nextCursor)

      // 3. Borrar (si no es dryRun) en lotes de 100
      if (!dryRun && orphansToDelete.length > 0) {
        for (let i = 0; i < orphansToDelete.length; i += 100) {
          if (Date.now() - startMs > TIME_BUDGET_MS) {
            console.warn('[cleanup] timeout durante delete; ', stats.orphansDeleted, 'borrados')
            break
          }
          const batch = orphansToDelete.slice(i, i + 100)
          try {
            await deleteResources(batch.map(o => o.publicId))
            stats.orphansDeleted += batch.length
          } catch (err) {
            stats.errors++
            console.error('[cleanup] error borrando batch:', err.message)
          }
        }
      }

      stats.doneAt = new Date().toISOString()
      return stats
    } catch (err) {
      console.error('cleanupOrphanedCloudinaryAssets error:', err)
      stats.errors++
      throw new HttpsError('internal', err.message || String(err))
    }
  }
)

// =====================================================
// SHOPIFREE — Integración con tienda online externa
// =====================================================
//
// Shopifree (https://shopifree.app) expone una REST API v1 con auth Bearer.
// El merchant genera un API key en su dashboard de Shopifree y lo pega en
// Cobrify. Esta función valida que el key sea válido (haciendo GET /store).
// El front decide después si guarda el key + datos del store en Firestore.
//
// Fase siguiente: trigger Firestore para push de productos + cron para
// polling de pedidos nuevos.

const SHOPIFREE_API_BASE = 'https://shopifree.app/api/v1'

/**
 * Valida un API key de Shopifree haciendo GET /store. No persiste nada.
 *
 * Input: { apiKey: string, businessId: string }
 * Output: { ok: boolean, store?: {...}, error?: string, status?: number }
 *
 * Permisos: el caller debe ser el owner del business o un sub-usuario del
 * mismo (mismo patrón que testRappiConnection).
 */
export const validateShopifreeConnection = onCall(
  { region: 'us-central1', cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes estar autenticado')
    }
    const { apiKey, businessId } = request.data || {}
    if (!apiKey || typeof apiKey !== 'string') {
      throw new HttpsError('invalid-argument', 'apiKey requerido')
    }
    if (!businessId) {
      throw new HttpsError('invalid-argument', 'businessId requerido')
    }

    // Validar permiso: owner o sub-usuario
    const isOwner = request.auth.uid === businessId
    let isSubuser = false
    if (!isOwner) {
      const userDoc = await db.collection('users').doc(request.auth.uid).get()
      if (userDoc.exists && userDoc.data()?.ownerId === businessId) {
        isSubuser = true
      }
    }
    if (!isOwner && !isSubuser) {
      throw new HttpsError('permission-denied', 'Sin acceso a este negocio')
    }

    try {
      const response = await axios.get(`${SHOPIFREE_API_BASE}/store`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15000,
      })
      const store = response.data?.store
      if (!store) {
        return { ok: false, error: 'Respuesta inesperada de Shopifree' }
      }
      return { ok: true, store }
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        return { ok: false, error: 'API key inválido o expirado', status }
      }
      const apiError = err.response?.data?.error
      return {
        ok: false,
        error: apiError || err.message || 'Error desconocido al validar',
        status: status || null,
      }
    }
  }
)

// -----------------------------------------------------
// SHOPIFREE Fase 1: Push automático de productos
// -----------------------------------------------------

import {
  postProductsBulk as shopifreePostProducts,
  deleteProductByExternalId as shopifreeDeleteProduct,
  mapCobrifyProductToShopifree,
  hasRelevantProductChange,
} from './src/services/shopifreeApi.js'

const SHOPIFREE_API_BASE_LOG = 'https://shopifree.app/api/v1'

/**
 * Resuelve el mapa { categoryId → categoryName } desde el doc del business.
 * Lo necesitamos para mandar `categoryName` (Shopifree hace find-or-create por nombre).
 */
const getCategoryMap = async (businessId) => {
  try {
    const snap = await db.collection('businesses').doc(businessId).get()
    const cats = snap.data()?.productCategories
    if (!Array.isArray(cats)) return new Map()
    const map = new Map()
    for (const c of cats) {
      if (c?.id && c?.name) map.set(c.id, c.name)
    }
    return map
  } catch (err) {
    console.warn('[shopifree] no se pudo cargar categorías:', err.message)
    return new Map()
  }
}

/**
 * Loguea un evento de sincronización en businesses/{bid}/integrationLogs.
 * Se usa para debugging y para la UI de monitoreo de Fase 3.
 *
 * Mantenemos solo los últimos N logs por negocio para no inflar Firestore;
 * la limpieza se hace en un cron aparte (Fase 3) o cuando se accedan.
 */
const logIntegrationEvent = async (businessId, eventData) => {
  try {
    await db.collection('businesses').doc(businessId)
      .collection('integrationLogs').add({
        integration: 'shopifree',
        createdAt: FieldValue.serverTimestamp(),
        ...eventData,
      })
  } catch (err) {
    console.error('[shopifree] error guardando log:', err.message)
  }
}

/**
 * Trigger Firestore: cada vez que se crea/edita/borra un producto, sincroniza
 * con Shopifree si el negocio tiene conexión activa.
 *
 * - create: POST /products (insert)
 * - update: POST /products (upsert; se reenvía completo, no patch)
 * - delete: DELETE /products?externalId=...
 *
 * Optimizaciones:
 * - Salta si el negocio NO tiene shopifreeConfig.apiKey.
 * - En updates, solo dispara si cambió algún campo relevante (no en cada
 *   updatedAt o cambios de stock por movimientos internos no observables).
 */
export const onShopifreeProductSync = onDocumentWritten(
  'businesses/{businessId}/products/{productId}',
  async (event) => {
    const { businessId, productId } = event.params
    const before = event.data.before?.exists ? event.data.before.data() : null
    const after = event.data.after?.exists ? event.data.after.data() : null

    // Cargar config del business (apiKey)
    let businessData
    try {
      const businessDoc = await db.collection('businesses').doc(businessId).get()
      if (!businessDoc.exists) return
      businessData = businessDoc.data()
    } catch (err) {
      console.error('[shopifree] error leyendo business:', err.message)
      return
    }

    const apiKey = businessData?.shopifreeConfig?.apiKey
    if (!apiKey) return // negocio no conectado a Shopifree

    // Si el toggle global está OFF, no hacer nada (permite "pausar" la sync).
    if (businessData.shopifreeEnabled === false) return

    const isDelete = !after
    const isCreate = !before && !!after
    const isUpdate = !!before && !!after

    // Filtrar updates irrelevantes (evita loops si solo cambió updatedAt)
    if (isUpdate && !hasRelevantProductChange(before, after)) return

    try {
      if (isDelete) {
        const result = await shopifreeDeleteProduct(apiKey, productId)
        await logIntegrationEvent(businessId, {
          action: 'product_delete',
          ok: true,
          externalId: productId,
          productName: before?.name || null,
          result,
        })
      } else {
        const categoryMap = await getCategoryMap(businessId)
        const mapped = mapCobrifyProductToShopifree(productId, after, { categoryMap })
        if (!mapped) return
        const result = await shopifreePostProducts(apiKey, [mapped])
        await logIntegrationEvent(businessId, {
          action: isCreate ? 'product_create' : 'product_update',
          ok: (result?.errors?.length || 0) === 0,
          externalId: productId,
          productName: after?.name || null,
          result,
        })
      }
    } catch (err) {
      const status = err.response?.status
      const apiError = err.response?.data?.error
      console.error(`[shopifree] sync error product=${productId}:`, err.message, apiError)
      await logIntegrationEvent(businessId, {
        action: isDelete ? 'product_delete' : (isCreate ? 'product_create' : 'product_update'),
        ok: false,
        externalId: productId,
        productName: after?.name || before?.name || null,
        error: apiError || err.message || 'Error desconocido',
        status: status || null,
      })
    }
  }
)

/**
 * Callable manual: sincroniza TODOS los productos del negocio con Shopifree.
 * Útil para primera carga después de conectar, o para reparar inconsistencias.
 *
 * Procesa en chunks de 100 productos (mitad del límite Shopifree de 200 para
 * dejar margen) con delay entre chunks para no saturar.
 *
 * Input: { businessId: string }
 * Output: { ok, totalChecked, totalPushed, errors[] }
 */
export const resyncShopifreeProducts = onCall(
  { region: 'us-central1', cors: true, timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes estar autenticado')
    }
    const { businessId } = request.data || {}
    if (!businessId) {
      throw new HttpsError('invalid-argument', 'businessId requerido')
    }

    // Permisos
    const isOwner = request.auth.uid === businessId
    let isSubuser = false
    if (!isOwner) {
      const userDoc = await db.collection('users').doc(request.auth.uid).get()
      if (userDoc.exists && userDoc.data()?.ownerId === businessId) {
        isSubuser = true
      }
    }
    if (!isOwner && !isSubuser) {
      throw new HttpsError('permission-denied', 'Sin acceso a este negocio')
    }

    const businessDoc = await db.collection('businesses').doc(businessId).get()
    if (!businessDoc.exists) {
      throw new HttpsError('not-found', 'Negocio no existe')
    }
    const businessData = businessDoc.data()
    const apiKey = businessData?.shopifreeConfig?.apiKey
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Shopifree no está conectado')
    }

    // Cargar categorías y todos los productos
    const categoryMap = await getCategoryMap(businessId)
    const productsSnap = await db.collection('businesses').doc(businessId)
      .collection('products').get()

    const allMapped = []
    productsSnap.forEach(docSnap => {
      const mapped = mapCobrifyProductToShopifree(docSnap.id, docSnap.data(), { categoryMap })
      if (mapped) allMapped.push(mapped)
    })

    const CHUNK_SIZE = 100
    const CHUNK_DELAY_MS = 800
    let totalPushed = 0
    let totalCreated = 0
    let totalUpdated = 0
    const errors = []

    for (let i = 0; i < allMapped.length; i += CHUNK_SIZE) {
      const chunk = allMapped.slice(i, i + CHUNK_SIZE)
      try {
        const result = await shopifreePostProducts(apiKey, chunk)
        totalPushed += chunk.length
        totalCreated += result?.created || 0
        totalUpdated += result?.updated || 0
        if (Array.isArray(result?.errors) && result.errors.length > 0) {
          errors.push(...result.errors)
        }
      } catch (err) {
        const apiError = err.response?.data?.error
        errors.push({
          chunkStart: i,
          chunkSize: chunk.length,
          error: apiError || err.message || 'Error desconocido',
        })
      }
      if (i + CHUNK_SIZE < allMapped.length) {
        await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS))
      }
    }

    // Log de la operación
    await logIntegrationEvent(businessId, {
      action: 'products_resync_all',
      ok: errors.length === 0,
      totalChecked: allMapped.length,
      totalPushed,
      totalCreated,
      totalUpdated,
      errorCount: errors.length,
    })

    // Actualizar lastResyncAt en la config
    await db.collection('businesses').doc(businessId).set({
      shopifreeConfig: {
        lastProductsResyncAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return {
      ok: errors.length === 0,
      totalChecked: allMapped.length,
      totalPushed,
      totalCreated,
      totalUpdated,
      errors: errors.slice(0, 20), // limitar payload de respuesta
      errorCount: errors.length,
    }
  }
)
