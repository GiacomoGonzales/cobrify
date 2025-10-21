import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { generateInvoiceXML } from './src/utils/xmlGenerator.js'
import { signXML } from './src/utils/xmlSigner.js'
import { sendToSunat } from './src/utils/sunatClient.js'

// Initialize Firebase Admin
initializeApp()
const db = getFirestore()

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
export const sendInvoiceToSunat = onCall(
  {
    cors: true, // Permite todos los orígenes - Firebase maneja la autenticación
    region: 'us-central1',
  },
  async (request) => {
    try {
      const { userId, invoiceId } = request.data

      // Validar parámetros
      if (!userId || !invoiceId) {
        throw new HttpsError('invalid-argument', 'userId e invoiceId son requeridos')
      }

      // Verificar autenticación
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuario no autenticado')
      }

      // Verificar que el usuario autenticado coincida con el userId
      if (request.auth.uid !== userId) {
        throw new HttpsError('permission-denied', 'No autorizado para esta operación')
      }

      console.log(`📤 Iniciando envío a SUNAT - Usuario: ${userId}, Factura: ${invoiceId}`)

      // 1. Obtener datos de la factura
      const invoiceRef = db.collection('businesses').doc(userId).collection('invoices').doc(invoiceId)
      const invoiceDoc = await invoiceRef.get()

      if (!invoiceDoc.exists) {
        throw new HttpsError('not-found', 'Factura no encontrada')
      }

      const invoiceData = invoiceDoc.data()

      // Validar que sea factura o boleta
      if (invoiceData.documentType !== 'factura' && invoiceData.documentType !== 'boleta') {
        throw new HttpsError('invalid-argument', 'Solo se pueden enviar facturas y boletas a SUNAT')
      }

      // Validar que esté en estado pendiente
      if (invoiceData.sunatStatus !== 'pending') {
        throw new HttpsError('failed-precondition', `La factura ya fue procesada. Estado actual: ${invoiceData.sunatStatus}`)
      }

      // 2. Obtener configuración SUNAT
      const businessRef = db.collection('businesses').doc(userId)
      const businessDoc = await businessRef.get()

      if (!businessDoc.exists) {
        throw new HttpsError('not-found', 'Configuración de empresa no encontrada')
      }

      const businessData = businessDoc.data()
      const sunatConfig = businessData.sunat

      if (!sunatConfig || !sunatConfig.enabled) {
        throw new HttpsError('failed-precondition', 'Integración SUNAT no está habilitada. Ve a Configuración > SUNAT para habilitarla.')
      }

      // Validar configuración SUNAT completa
      if (!sunatConfig.solUser || !sunatConfig.solPassword) {
        throw new HttpsError('failed-precondition', 'Configuración SUNAT incompleta. Verifica credenciales SOL en Configuración.')
      }

      // Validar que exista certificado (si está habilitado)
      if (!sunatConfig.certificateData && sunatConfig.environment === 'production') {
        throw new HttpsError('failed-precondition', 'Certificado digital no encontrado. Sube tu certificado .pfx/.p12 en Configuración SUNAT.')
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
          throw new HttpsError('internal', `Error al firmar XML: ${signError.message}`)
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

        return {
          success: true,
          status: sunatResponse.accepted ? 'accepted' : 'rejected',
          message: sunatResponse.description,
          observations: sunatResponse.observations || [],
        }

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

        throw new HttpsError('internal', `Error al enviar a SUNAT: ${sunatError.message}`)
      }

    } catch (error) {
      console.error('❌ Error general:', error)

      // Si es un HttpsError, dejar que se propague
      if (error instanceof HttpsError) {
        throw error
      }

      // Para otros errores, envolver en HttpsError
      throw new HttpsError('internal', error.message || 'Error al procesar el documento')
    }
  }
)
