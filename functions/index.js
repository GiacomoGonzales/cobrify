import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { generateInvoiceXML } from './src/utils/xmlGenerator.js'
import { signXML } from './src/utils/xmlSigner.js'
import { sendToSunat } from './src/utils/sunatClient.js'

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
    invoker: 'public', // Permite acceso público - la autenticación se maneja con Firebase Auth
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

      // Verificar que el usuario autenticado coincida con el userId
      if (authenticatedUserId !== userId) {
        res.status(403).json({ error: 'No autorizado para esta operación' })
        return
      }

      console.log(`📤 Iniciando envío a SUNAT - Usuario: ${userId}, Factura: ${invoiceId}`)

      // 1. Obtener datos de la factura
      const invoiceRef = db.collection('businesses').doc(userId).collection('invoices').doc(invoiceId)
      const invoiceDoc = await invoiceRef.get()

      if (!invoiceDoc.exists) {
        res.status(404).json({ error: 'Factura no encontrada' })
        return
      }

      const invoiceData = invoiceDoc.data()

      // Validar que sea factura o boleta
      if (invoiceData.documentType !== 'factura' && invoiceData.documentType !== 'boleta') {
        res.status(400).json({ error: 'Solo se pueden enviar facturas y boletas a SUNAT' })
        return
      }

      // Validar que esté en estado pendiente
      if (invoiceData.sunatStatus !== 'pending') {
        res.status(400).json({
          error: `La factura ya fue procesada. Estado actual: ${invoiceData.sunatStatus}`
        })
        return
      }

      // 2. Obtener configuración SUNAT
      const businessRef = db.collection('businesses').doc(userId)
      const businessDoc = await businessRef.get()

      if (!businessDoc.exists) {
        res.status(404).json({ error: 'Configuración de empresa no encontrada' })
        return
      }

      const businessData = businessDoc.data()
      const sunatConfig = businessData.sunat

      if (!sunatConfig || !sunatConfig.enabled) {
        res.status(400).json({
          error: 'Integración SUNAT no está habilitada. Ve a Configuración > SUNAT para habilitarla.'
        })
        return
      }

      // Validar configuración SUNAT completa
      if (!sunatConfig.solUser || !sunatConfig.solPassword) {
        res.status(400).json({
          error: 'Configuración SUNAT incompleta. Verifica credenciales SOL en Configuración.'
        })
        return
      }

      // Validar que exista certificado (si está habilitado)
      if (!sunatConfig.certificateData && sunatConfig.environment === 'production') {
        res.status(400).json({
          error: 'Certificado digital no encontrado. Sube tu certificado .pfx/.p12 en Configuración SUNAT.'
        })
        return
      }

      console.log(`🏢 Empresa: ${businessData.businessName} - RUC: ${businessData.ruc}`)
      console.log(`⚙️ Ambiente SUNAT: ${sunatConfig.environment}`)

      // 3. Generar XML UBL 2.1
      console.log('📝 Generando XML UBL 2.1...')
      const xmlData = generateInvoiceXML(invoiceData, businessData)
      console.log(`✅ XML generado (${xmlData.length} caracteres)`)

      let signedXML = xmlData

      // 4. Firmar XML con certificado digital (solo si hay certificado)
      if (sunatConfig.certificateData && sunatConfig.certificatePassword) {
        console.log('🔐 Firmando XML con certificado digital...')
        try {
          signedXML = await signXML(xmlData, {
            certificateName: sunatConfig.certificateName,
            certificatePassword: sunatConfig.certificatePassword,
            certificate: sunatConfig.certificateData,
          })
          console.log('✅ XML firmado exitosamente')
        } catch (signError) {
          console.error('❌ Error al firmar XML:', signError)
          res.status(500).json({ error: `Error al firmar XML: ${signError.message}` })
          return
        }
      } else {
        console.log('⚠️ Modo sin firma digital (solo para testing en ambiente beta)')
      }

      // 5. Enviar a SUNAT
      console.log('📨 Enviando documento a SUNAT...')
      try {
        const sunatResponse = await sendToSunat(signedXML, {
          ruc: businessData.ruc,
          solUser: sunatConfig.solUser,
          solPassword: sunatConfig.solPassword,
          environment: sunatConfig.environment || 'beta',
          documentType: invoiceData.documentType,
          series: invoiceData.series,
          number: invoiceData.correlativeNumber,
        })

        console.log(`✅ Respuesta SUNAT: ${sunatResponse.accepted ? 'ACEPTADO' : 'RECHAZADO'}`)
        console.log(`Código: ${sunatResponse.code} - ${sunatResponse.description}`)

        // 6. Actualizar estado en Firestore
        const updateData = {
          sunatStatus: sunatResponse.accepted ? 'accepted' : 'rejected',
          sunatResponse: {
            code: sunatResponse.code,
            description: sunatResponse.description,
            observations: sunatResponse.observations || [],
            cdrData: sunatResponse.cdrData || null,
          },
          sunatSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }

        await invoiceRef.update(updateData)
        console.log(`💾 Estado actualizado en Firestore`)

        res.status(200).json({
          success: true,
          status: sunatResponse.accepted ? 'accepted' : 'rejected',
          message: sunatResponse.description,
          observations: sunatResponse.observations || [],
        })

      } catch (sunatError) {
        console.error('❌ Error al enviar a SUNAT:', sunatError)

        // Actualizar factura con error
        await invoiceRef.update({
          sunatStatus: 'rejected',
          sunatResponse: {
            code: 'ERROR',
            description: sunatError.message || 'Error al comunicarse con SUNAT',
            observations: [],
            error: true,
          },
          sunatSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        res.status(500).json({ error: `Error al enviar a SUNAT: ${sunatError.message}` })
      }

    } catch (error) {
      console.error('❌ Error general:', error)
      res.status(500).json({ error: error.message || 'Error al procesar el documento' })
    }
  }
)
