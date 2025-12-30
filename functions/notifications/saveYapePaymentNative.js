import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

/**
 * Cloud Function HTTP para recibir pagos de Yape desde el servicio nativo de Android.
 * Esto permite que las notificaciones de Yape se procesen incluso cuando la app está en background.
 *
 * El flujo es:
 * 1. NotificationService (Java) detecta notificación de Yape
 * 2. NotificationService llama a esta función HTTP con los datos parseados
 * 3. Esta función guarda en Firestore
 * 4. El trigger onYapePayment detecta el nuevo documento y envía push
 */
export const saveYapePaymentNative = onRequest(
  {
    cors: true,
    region: 'us-central1',
    invoker: 'public' // Permite invocación pública desde Android
  },
  async (req, res) => {
    console.log('💜 saveYapePaymentNative - Request received')
    console.log('Method:', req.method)
    console.log('Body:', JSON.stringify(req.body))

    // Solo permitir POST
    if (req.method !== 'POST') {
      console.log('❌ Method not allowed:', req.method)
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    try {
      const { businessId, userId, amount, senderName, originalText, originalTitle, timestamp } = req.body

      // Validar datos requeridos
      if (!businessId) {
        console.log('❌ Missing businessId')
        res.status(400).json({ error: 'businessId is required' })
        return
      }

      if (!amount || isNaN(parseFloat(amount))) {
        console.log('❌ Invalid amount:', amount)
        res.status(400).json({ error: 'Valid amount is required' })
        return
      }

      const db = getFirestore()

      // Verificar que el negocio existe
      const businessDoc = await db.collection('businesses').doc(businessId).get()
      if (!businessDoc.exists) {
        console.log('❌ Business not found:', businessId)
        res.status(404).json({ error: 'Business not found' })
        return
      }

      // Crear el documento del pago
      const paymentData = {
        amount: parseFloat(amount),
        senderName: senderName || 'Desconocido',
        originalText: originalText || '',
        originalTitle: originalTitle || '',
        source: 'native_notification', // Indica que viene del servicio nativo
        detectedBy: userId || null,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        notificationTimestamp: timestamp ? new Date(parseInt(timestamp)) : new Date()
      }

      console.log('💾 Saving Yape payment:', paymentData)

      // Guardar en Firestore (esto disparará el trigger onYapePayment)
      const docRef = await db
        .collection('businesses')
        .doc(businessId)
        .collection('yapePayments')
        .add(paymentData)

      console.log('✅ Yape payment saved with ID:', docRef.id)
      console.log('📤 Trigger onYapePayment should now send push notification')

      res.status(200).json({
        success: true,
        paymentId: docRef.id,
        message: 'Yape payment saved successfully'
      })

    } catch (error) {
      console.error('❌ Error saving Yape payment:', error)
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      })
    }
  }
)
