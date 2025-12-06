import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { emitirComprobante, emitirNotaCredito, emitirGuiaRemision } from './src/services/emissionRouter.js'

// Initialize Firebase Admin
initializeApp()
const db = getFirestore()
const auth = getAuth()

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

      // Verificar autorización: debe ser el owner O un usuario secundario del owner
      if (authenticatedUserId !== userId) {
        // Verificar si el usuario autenticado es un sub-usuario del owner
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

      console.log(`📤 Iniciando envío a SUNAT - Usuario: ${userId}, Factura: ${invoiceId}`)

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
          const allowedStatuses = ['pending', 'rejected', 'signed', 'SIGNED', 'sending']
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
            const maxInvoices = subscription.limits?.maxInvoicesPerMonth || -1

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
      // Código 1033 = "El comprobante fue registrado previamente"
      // IMPORTANTE: Solo tratar como aceptado si el documento ya fue enviado antes desde ESTE sistema
      // Si es numeración duplicada de OTRO sistema, NO debe aceptarse automáticamente
      const isAlreadyRegistered = emissionResult.responseCode === '1033' ||
        (emissionResult.description && emissionResult.description.includes('registrado previamente'))

      if (isAlreadyRegistered) {
        // Verificar si este documento ya fue enviado antes desde nuestro sistema
        const previouslySent = invoiceData.sunatSentAt && invoiceData.sunatStatus !== 'pending'
        const hadPreviousTicket = invoiceData.sunatResponse?.ticket || invoiceData.sunatResponse?.cdrUrl

        if (previouslySent || hadPreviousTicket) {
          // Es un reintento de un documento que ya enviamos → Tratar como aceptado
          console.log('📋 Código 1033: Documento ya enviado antes desde este sistema - tratando como aceptado')
          emissionResult.accepted = true
        } else {
          // Es numeración duplicada de OTRO sistema → Mantener como rechazado
          console.log('⚠️ Código 1033: Numeración duplicada de otro sistema - mantener como rechazado')
          emissionResult.description = 'El número de documento ya existe en SUNAT (posible numeración duplicada de otro sistema). Debe usar una serie/número diferente.'
        }
      }

      // Determinar el estado final basado en el resultado
      // IMPORTANTE: Los errores temporales de SUNAT NO deben quedar como 'rejected' ni 'signed'
      // sino como 'pending' para permitir reintento automático
      const isPendingManual = emissionResult.pendingManual === true
      const isTransientError = isTransientSunatError(emissionResult.responseCode, emissionResult.description)

      let finalStatus
      if (emissionResult.accepted) {
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
        pendingManual: isPendingManual
      }

      // Agregar datos específicos según el método, filtrando undefined y sanitizando
      let methodSpecificData = {}
      if (emissionResult.method === 'nubefact') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          cdrUrl: emissionResult.cdrUrl,
          qrCode: emissionResult.qrCode,
          hash: emissionResult.hash,
          enlace: emissionResult.enlace
        }))
      } else if (emissionResult.method === 'qpse') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          cdrUrl: emissionResult.cdrUrl,
          ticket: emissionResult.ticket,
          hash: emissionResult.hash,
          nombreArchivo: emissionResult.nombreArchivo
        }))
      } else if (emissionResult.method === 'sunat_direct') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          cdrData: emissionResult.cdrData
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
          await subscriptionRef.update({
            'usage.invoicesThisMonth': FieldValue.increment(1)
          })
          console.log(`📊 Contador de documentos incrementado - Usuario: ${userId}`)
        } catch (counterError) {
          console.error('⚠️ Error al incrementar contador (no crítico):', counterError)
          // No fallar la operación si el contador falla
        }
      } else {
        console.log(`⏭️ Documento rechazado - No se incrementa el contador`)
      }

      res.status(200).json({
        success: true,
        status: emissionResult.accepted ? 'accepted' : 'rejected',
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
          const allowedStatuses = ['pending', 'rejected', 'signed', 'SIGNED', 'sending']
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
        // Actualizar NC con error
        await creditNoteRef.update({
          sunatStatus: 'rejected',
          sunatResponse: {
            code: 'ERROR',
            description: emissionResult.error || 'Error al emitir nota de crédito',
            observations: [],
            error: true,
            method: emissionResult.method
          },
          sunatSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        res.status(500).json({
          error: emissionResult.error || 'Error al emitir nota de crédito',
          method: emissionResult.method
        })
        return
      }

      // 5. Actualizar estado en Firestore
      // Código 1033 = "El comprobante fue registrado previamente"
      // IMPORTANTE: Solo tratar como aceptado si el documento ya fue enviado antes desde ESTE sistema
      const isAlreadyRegistered = emissionResult.responseCode === '1033' ||
        (emissionResult.description && emissionResult.description.includes('registrado previamente'))

      if (isAlreadyRegistered) {
        // Verificar si este documento ya fue enviado antes desde nuestro sistema
        const previouslySent = creditNoteData.sunatSentAt && creditNoteData.sunatStatus !== 'pending'
        const hadPreviousTicket = creditNoteData.sunatResponse?.ticket || creditNoteData.sunatResponse?.cdrUrl

        if (previouslySent || hadPreviousTicket) {
          // Es un reintento de un documento que ya enviamos → Tratar como aceptado
          console.log('📋 Código 1033: NC ya enviada antes desde este sistema - tratando como aceptada')
          emissionResult.accepted = true
        } else {
          // Es numeración duplicada de OTRO sistema → Mantener como rechazado
          console.log('⚠️ Código 1033: Numeración duplicada de otro sistema - mantener como rechazado')
          emissionResult.description = 'El número de NC ya existe en SUNAT (posible numeración duplicada de otro sistema). Debe usar una serie/número diferente.'
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

      // Agregar datos específicos según el método
      let methodSpecificData = {}
      if (emissionResult.method === 'qpse') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          pdfUrl: emissionResult.pdfUrl,
          xmlUrl: emissionResult.xmlUrl,
          cdrUrl: emissionResult.cdrUrl,
          ticket: emissionResult.ticket,
          hash: emissionResult.hash,
          nombreArchivo: emissionResult.nombreArchivo
        }))
      } else if (emissionResult.method === 'sunat_direct') {
        methodSpecificData = sanitizeForFirestore(removeUndefined({
          cdrData: emissionResult.cdrData
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
          await subscriptionRef.update({
            'usage.invoicesThisMonth': FieldValue.increment(1)
          })
          console.log(`📊 Contador de documentos incrementado - Usuario: ${userId}`)
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
        success: true,
        status: emissionResult.accepted ? 'accepted' : 'rejected',
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

// ========================================
// ADMIN - Funciones administrativas
// ========================================

/**
 * Cloud Function HTTP: Obtener UID de usuario por email
 * Solo para admins - usado al crear resellers
 */
export const getUserByEmail = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
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
        if (result.cdrData) {
          updateData.cdrData = result.cdrData
        }
      } else if (result.method === 'qpse') {
        if (result.cdrUrl) updateData.cdrUrl = result.cdrUrl
        if (result.xmlUrl) updateData.xmlUrl = result.xmlUrl
        if (result.pdfUrl) updateData.pdfUrl = result.pdfUrl
        if (result.hash) updateData.hash = result.hash
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
    schedule: 'every 2 hours',
    timeZone: 'America/Lima',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540, // 9 minutos máximo
  },
  async (event) => {
    console.log('🔄 [RETRY] Iniciando reenvío automático de documentos pendientes...')

    const MAX_RETRIES = 50 // 50 reintentos x 2 horas = 100 horas de cobertura
    const MIN_AGE_MINUTES = 5 // No procesar documentos muy recientes
    const BATCH_SIZE = 20 // Procesar máximo 20 por ejecución

    try {
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

        // Buscar facturas/boletas pendientes de este negocio
        const invoicesRef = db.collection('businesses').doc(businessId).collection('invoices')

        const pendingInvoices = await invoicesRef
          .where('sunatStatus', '==', 'pending')
          .where('documentType', 'in', ['factura', 'boleta'])
          .limit(BATCH_SIZE)
          .get()

        if (pendingInvoices.empty) {
          continue
        }

        console.log(`📋 [RETRY] Negocio ${businessId}: ${pendingInvoices.size} documentos pendientes`)

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
            console.log(`🚀 [RETRY] Reenviando ${invoiceData.series}-${invoiceData.correlativeNumber} (intento ${retryCount + 1})...`)

            // Preparar datos para emisión
            const invoiceForEmission = {
              ...invoiceData,
              correlativeNumber: invoiceData.correlativeNumber,
            }

            // Emitir comprobante
            const result = await emitirComprobante(invoiceForEmission, businessDataForEmission)

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

            console.log(`✅ [RETRY] ${invoiceData.series}-${invoiceData.correlativeNumber}: ${finalStatus}`)
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
          await new Promise(resolve => setTimeout(resolve, 2000))
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

// ========================================
// PUSH NOTIFICATIONS - Cloud Functions
// ========================================

// Import and re-export notification functions
export { onNewSale } from './notifications/onNewSale.js'
export { onProductStockChange } from './notifications/onStockLow.js'

// Import and re-export migration function
export { migratePurchasesHTTP } from './migratePurchases.js'
