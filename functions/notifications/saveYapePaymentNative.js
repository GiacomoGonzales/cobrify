import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { createHash } from 'crypto'

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

      // Re-parsear el NOMBRE, por el mismo motivo que el monto: el app arma
      // "titulo + texto" y busca "de NOMBRE", pero Yape titula la notificacion
      // "Confirmación de Pago". Ese "de Pago" enganchaba el patron y se llevaba
      // media frase: el nombre quedaba como "Pago Victor D. Valle C. te envió
      // un pago por S" (caso real, Agrovet Sahual 21-ago).
      //
      // Se mira el TEXTO solo, nunca titulo+texto: el nombre siempre va antes
      // de "te envió".
      const reparseYapeSender = (txt, soloEnvio = false) => {
        if (!txt) return null
        const limpio = String(txt).replace(/^\s*¡?\s*Yape!?\s*/i, '')
        const porEnvio = limpio.match(/^(.+?)\s+te\s+envi[óo]/i)
        if (porEnvio) return porEnvio[1].trim()
        // El patron "de NOMBRE" solo se acepta sobre el TEXTO. Sobre el
        // titulo daria "Pago" (de "Confirmación de Pago"), que es peor que
        // decir "Desconocido" porque parece un nombre.
        if (soloEnvio) return null
        // Formato viejo: "Recibiste S/ 50.00 de Juan Pérez"
        const porDe = limpio.match(/\bde\s+([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ\s.]*)/i)
        if (porDe) return porDe[1].trim()
        return null
      }
      const nombreDelApp = (senderName || '').trim()
      // Un nombre que contiene la propia frase de la notificacion es basura del
      // patron viejo: mejor "Desconocido" que una frase a medias.
      const nombreDelAppSirve = nombreDelApp
        && nombreDelApp !== 'Desconocido'
        && !/te\s+envi[óo]/i.test(nombreDelApp)
      const finalSenderName =
        reparseYapeSender(originalText)
        || reparseYapeSender(originalTitle, true)
        || (nombreDelAppSirve ? nombreDelApp : 'Desconocido')

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
        senderName: finalSenderName,
        originalText: originalText || '',
        originalTitle: originalTitle || '',
        source: 'native_notification', // Indica que viene del servicio nativo
        detectedBy: userId || null,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        notificationTimestamp: timestamp ? new Date(parseInt(timestamp)) : new Date()
      }

      console.log('💾 Saving Yape payment:', paymentData)

      const pagosRef = db
        .collection('businesses')
        .doc(businessId)
        .collection('yapePayments')

      // ==================== ANTI-DUPLICADOS ====================
      // Android llama a onNotificationPosted MAS DE UNA VEZ por la misma
      // notificacion: Yape la publica y enseguida la actualiza. El servicio
      // nativo no distingue una cosa de la otra y manda dos veces, asi que se
      // guardaban dos pagos y sonaban dos campanitas por un solo yape (caso
      // Agrovet Sahual 21-ago: 5 de 7 pagos duplicados, siempre con ~1s de
      // diferencia).
      //
      // La clave esta en que `timestamp` (sbn.getPostTime) es IDENTICO en las
      // dos llamadas, y el texto trae el codigo de seguridad, que es distinto
      // en cada pago real. Con eso el id del documento se vuelve determinista:
      // el segundo intento choca contra el primero y no entra.
      //
      // Se usa create() y no set(): create() falla si el documento ya existe,
      // y esa falla es atomica — dos llamadas simultaneas no pueden ganar las
      // dos. Con set() la segunda pisaria a la primera sin que nadie se entere.
      const claveNatural = [timestamp || '', finalAmount, originalText || originalTitle || ''].join('|')
      const sePuedeDeduplicar = !!(timestamp || originalText)

      let docRef
      if (sePuedeDeduplicar) {
        const idDeterminista = createHash('sha1').update(claveNatural).digest('hex').slice(0, 24)
        docRef = pagosRef.doc(idDeterminista)
        try {
          await docRef.create(paymentData)
        } catch (err) {
          // 6 = ALREADY_EXISTS. Es el caso esperado, no un error: la misma
          // notificacion llegando por segunda vez.
          const yaExistia = err?.code === 6 || /ALREADY_EXISTS/i.test(err?.message || '')
          if (!yaExistia) throw err
          console.log(`🔁 Pago de Yape duplicado ignorado (${idDeterminista}) — misma notificacion reenviada por Android`)
          res.status(200).json({
            success: true,
            paymentId: idDeterminista,
            duplicate: true,
            message: 'Yape payment already registered'
          })
          return
        }
      } else {
        // Sin timestamp ni texto no hay con que identificarlo. Antes que
        // perder el pago, se guarda con id aleatorio (comportamiento viejo).
        docRef = await pagosRef.add(paymentData)
      }

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
