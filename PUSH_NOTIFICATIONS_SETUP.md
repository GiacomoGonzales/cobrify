# Configuración de Notificaciones Push - Guía Completa

## ✅ Ya completado:
1. Plugin instalado: `@capacitor/push-notifications`
2. Servicio creado: `src/services/notificationService.js`
3. Funciones de FCM agregadas al servicio

---

## 📱 PASO 1: Configurar Permisos en Android

### 1.1 Editar AndroidManifest.xml

Agrega estos permisos antes del tag `</manifest>`:

```xml
<!-- Permisos para notificaciones push -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="com.google.android.c2dm.permission.RECEIVE" />
```

---

## 🔧 PASO 2: Integrar en el Login

### 2.1 Modificar AuthContext

En `src/contexts/AuthContext.jsx`, importa el servicio:

```javascript
import { initializePushNotifications, cleanupPushNotifications } from '@/services/notificationService'
```

En la función `login`, después de un login exitoso, inicializa push notifications:

```javascript
const login = async (email, password) => {
  try {
    // ... código existente de login ...

    // Inicializar notificaciones push en móvil
    if (user?.uid) {
      await initializePushNotifications(user.uid)
    }

    return { success: true }
  } catch (error) {
    // ... manejo de errores ...
  }
}
```

En la función `logout`, limpia los listeners:

```javascript
const logout = async () => {
  try {
    await cleanupPushNotifications()
    await signOut(auth)
    // ... resto del código ...
  } catch (error) {
    // ... manejo de errores ...
  }
}
```

---

## 🔥 PASO 3: Crear Cloud Functions (Backend)

### 3.1 Estructura del proyecto Firebase Functions

```
functions/
├── index.js
├── package.json
└── notifications/
    ├── sendPushNotification.js
    ├── onNewSale.js
    └── onStockLow.js
```

### 3.2 Crear `functions/notifications/sendPushNotification.js`

```javascript
const admin = require('firebase-admin')

/**
 * Enviar notificación push a un usuario
 */
async function sendPushNotification(userId, title, body, data = {}) {
  try {
    // Obtener todos los tokens FCM del usuario
    const tokensSnapshot = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('fcmTokens')
      .get()

    if (tokensSnapshot.empty) {
      console.log(`No FCM tokens found for user ${userId}`)
      return { success: false, error: 'No tokens' }
    }

    const tokens = tokensSnapshot.docs.map(doc => doc.data().token)

    // Construir el mensaje
    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      tokens // Enviar a todos los dispositivos del usuario
    }

    // Enviar la notificación
    const response = await admin.messaging().sendMulticast(message)

    console.log(`Successfully sent notification to user ${userId}:`, response.successCount, 'successful')

    // Limpiar tokens inválidos
    if (response.failureCount > 0) {
      const failedTokens = []
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx])
        }
      })

      // Eliminar tokens que fallaron
      for (const token of failedTokens) {
        await admin.firestore()
          .collection('users')
          .doc(userId)
          .collection('fcmTokens')
          .doc(token)
          .delete()
      }
    }

    return { success: true, successCount: response.successCount }
  } catch (error) {
    console.error('Error sending push notification:', error)
    return { success: false, error: error.message }
  }
}

module.exports = { sendPushNotification }
```

### 3.3 Crear `functions/notifications/onNewSale.js`

```javascript
const functions = require('firebase-functions')
const { sendPushNotification } = require('./sendPushNotification')

/**
 * Trigger cuando se crea una nueva venta
 */
exports.onNewSale = functions.firestore
  .document('businesses/{businessId}/invoices/{invoiceId}')
  .onCreate(async (snap, context) => {
    const invoice = snap.data()
    const businessId = context.params.businessId

    try {
      // Obtener información del negocio para saber quién es el dueño
      const businessDoc = await snap.ref.firestore
        .collection('businesses')
        .doc(businessId)
        .get()

      if (!businessDoc.exists) return

      const business = businessDoc.data()
      const ownerId = business.ownerId

      // Enviar notificación push al dueño
      await sendPushNotification(
        ownerId,
        '💰 Nueva Venta Realizada',
        `Se registró una venta de S/ ${invoice.total.toFixed(2)} en ${business.name}`,
        {
          type: 'new_sale',
          invoiceId: snap.id,
          businessId,
          amount: invoice.total.toString()
        }
      )

      console.log(`Push notification sent for new sale: ${snap.id}`)
    } catch (error) {
      console.error('Error in onNewSale trigger:', error)
    }
  })
```

### 3.4 Crear `functions/notifications/onStockLow.js`

```javascript
const functions = require('firebase-functions')
const { sendPushNotification } = require('./sendPushNotification')

/**
 * Trigger cuando un producto se queda sin stock o con stock bajo
 */
exports.onProductStockChange = functions.firestore
  .document('businesses/{businessId}/products/{productId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data()
    const after = change.after.data()
    const businessId = context.params.businessId

    // Solo notificar si el stock cambió
    if (before.stock === after.stock) return

    try {
      // Obtener información del negocio
      const businessDoc = await change.after.ref.firestore
        .collection('businesses')
        .doc(businessId)
        .get()

      if (!businessDoc.exists) return

      const business = businessDoc.data()
      const ownerId = business.ownerId

      // Sin stock (stock = 0)
      if (after.stock === 0 && before.stock > 0) {
        await sendPushNotification(
          ownerId,
          '⚠️ Producto Sin Stock',
          `El producto "${after.name}" se ha quedado sin stock en ${business.name}`,
          {
            type: 'out_of_stock',
            productId: context.params.productId,
            businessId,
            productName: after.name
          }
        )
      }
      // Stock bajo (stock <= 5 y antes era > 5)
      else if (after.stock <= 5 && after.stock > 0 && before.stock > 5) {
        await sendPushNotification(
          ownerId,
          '📦 Stock Bajo',
          `El producto "${after.name}" tiene solo ${after.stock} unidades en ${business.name}`,
          {
            type: 'low_stock',
            productId: context.params.productId,
            businessId,
            productName: after.name,
            currentStock: after.stock.toString()
          }
        )
      }

      console.log(`Push notification sent for stock change: ${context.params.productId}`)
    } catch (error) {
      console.error('Error in onProductStockChange trigger:', error)
    }
  })
```

### 3.5 Crear `functions/index.js`

```javascript
const admin = require('firebase-admin')
admin.initializeApp()

// Importar todas las funciones de notificaciones
const { onNewSale } = require('./notifications/onNewSale')
const { onProductStockChange } = require('./notifications/onStockLow')

// Exportar las funciones
exports.onNewSale = onNewSale
exports.onProductStockChange = onProductStockChange
```

### 3.6 Actualizar `functions/package.json`

Asegúrate de tener estas dependencias:

```json
{
  "name": "functions",
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  }
}
```

---

## 🚀 PASO 4: Deploy de Cloud Functions

```bash
# En la carpeta del proyecto
cd functions
npm install
cd ..

# Deploy de las funciones
firebase deploy --only functions
```

---

## 🧪 PASO 5: Probar las Notificaciones

### 5.1 Probar Notificación Manual desde Firebase Console

1. Ve a **Firebase Console** → **Cloud Messaging**
2. Click en **Send test message**
3. Pega el token FCM de tu dispositivo (lo verás en los logs de la app)
4. Envía y verifica que llegue

### 5.2 Probar Triggers Automáticos

**Para probar notificación de venta:**
1. Abre la app en tu teléfono
2. Registra una venta desde el POS
3. Deberías recibir una notificación push

**Para probar notificación de stock bajo:**
1. Edita un producto
2. Cambia el stock a 3 unidades
3. Deberías recibir una notificación push

---

## 📋 Checklist Final

- [ ] Permisos agregados en AndroidManifest.xml
- [ ] AuthContext modificado para inicializar push
- [ ] Cloud Functions creadas en carpeta `functions/`
- [ ] `npm install` ejecutado en `functions/`
- [ ] `firebase deploy --only functions` ejecutado
- [ ] App reinstalada en el dispositivo
- [ ] Notificaciones probadas y funcionando

---

## 🐛 Troubleshooting

### No recibo notificaciones

1. **Verifica permisos**: Configuración → Apps → Cobrify → Notificaciones → Activadas
2. **Verifica token guardado**: Revisa Firestore → users → {userId} → fcmTokens
3. **Verifica Cloud Messaging habilitado**: Firebase Console → Cloud Messaging API
4. **Revisa logs**: `firebase functions:log` para ver errores

### Token no se guarda

1. Verifica que `google-services.json` esté actualizado
2. Verifica que la app esté en modo nativo (no web)
3. Reinstala la app completamente

---

## 📚 Recursos

- [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)

