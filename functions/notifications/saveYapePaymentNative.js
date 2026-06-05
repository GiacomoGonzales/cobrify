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

      // Re-parsear el monto desde el texto original (robusto: punto O coma, 1 o 2 decimales).
      // Asi el monto queda correcto AUNQUE el app haya enviado un valor truncado: apps viejas
      // cuyo regex solo aceptaba punto + exactamente 2 decimales leian "10,50"->10 y "1,5"->1.
      // Si no se puede reparsear del texto, se usa el amount que envio el app.
      const reparseYapeAmount = (txt) => {
        if (!txt) return null
        const m = String(txt).match(/S\/\s*(\d+(?:[.,]\d{1,2})?)/i)
        if (!m) return null
        const v = parseFloat(m[1].replace(',', '.'))
        return Number.isFinite(v) && v > 0 ? v : null
      }
      const reparsedAmount = reparseYapeAmount(originalText) ?? reparseYapeAmount(originalTitle)
      const finalAmount = reparsedAmount != null ? reparsedAmount : parseFloat(amount)

      // Validar datos requeridos
      if (!businessId) {
        console.log('❌ Missing businessId')
        res.status(400).json({ error: 'businessId is required' })
        return
      }

      if (!finalAmount || isNaN(finalAmount)) {
        console.log('❌ Invalid amount. body:', amount, '| reparsed:', reparsedAmount, '| text:', originalText)
        res.status(400).json({ error: 'Valid amount is required' })
        return
      }
      if (reparsedAmount != null && reparsedAmount !== parseFloat(amount)) {
        console.log(`🔧 Monto corregido por reparseo: app=${amount} -> ${reparsedAmount} (texto: "${originalText}")`)
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
        amount: finalAmount,
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
