import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { emitirComprobante, emitirNotaCredito } from './src/services/emissionRouter.js'

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
          if (data.sunatStatus === 'sending') {
            throw new Error('ALREADY_SENDING')
          }

          // Validar estado: permitir reenvío si está pendiente, rechazada o firmada (no enviada)
          const allowedStatuses = ['pending', 'rejected', 'signed', 'SIGNED']
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
        // Actualizar factura con error
        await invoiceRef.update({
          sunatStatus: 'rejected',
          sunatResponse: {
            code: 'ERROR',
            description: emissionResult.error || 'Error al emitir comprobante',
            observations: [],
            error: true,
            method: emissionResult.method
          },
          sunatSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        res.status(500).json({
          error: emissionResult.error || 'Error al emitir comprobante',
          method: emissionResult.method
        })
        return
      }

      // 4. Actualizar estado en Firestore
      // Si es PENDING_MANUAL (firmado pero no enviado), guardamos como "signed"
      const isPendingManual = emissionResult.pendingManual === true
      const finalStatus = isPendingManual ? 'signed' : (emissionResult.accepted ? 'accepted' : 'rejected')

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

      await invoiceRef.update(updateData)
      console.log(`💾 Estado actualizado en Firestore`)

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
          if (data.sunatStatus === 'sending') {
            throw new Error('ALREADY_SENDING')
          }

          // Validar estado: permitir envío si está pendiente, rechazada o firmada
          const allowedStatuses = ['pending', 'rejected', 'signed', 'SIGNED']
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
// PUSH NOTIFICATIONS - Cloud Functions
// ========================================

// Import and re-export notification functions
export { onNewSale } from './notifications/onNewSale.js'
export { onProductStockChange } from './notifications/onStockLow.js'

// Import and re-export migration function
export { migratePurchasesHTTP } from './migratePurchases.js'
