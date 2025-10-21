# Solución Error CORS - Cloud Functions

## 🔴 Problema Actual

Al intentar llamar a la Cloud Function desde el frontend, se recibe error:
```
Access to fetch at 'https://us-central1-cobrify-395fe.cloudfunctions.net/sendInvoiceToSunat'
from origin 'http://localhost:3006' has been blocked by CORS policy
```

## ✅ Soluciones

### Opción 1: Redesplegar la Función (Recomendado pero requiere permisos)

**Problema**: Error al intentar redesplegar:
```
Could not authenticate 'service-685843504415@gcf-admin-robot.iam.gserviceaccount.com'
```

**Causa**: Faltan permisos de IAM en Google Cloud Platform

**Solución**:
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Selecciona el proyecto `cobrify-395fe`
3. Ve a **IAM & Admin** > **IAM**
4. Busca la cuenta de servicio `gcf-admin-robot@`
5. Asegúrate que tenga el rol `Cloud Functions Admin`

O más fácil, desde la terminal:
```bash
# Habilitar App Engine (requerido para Functions v2)
gcloud app create --project=cobrify-395fe --region=us-central

# Luego redesplegar
firebase deploy --only functions
```

### Opción 2: Usar Emulador de Functions (Para desarrollo local)

Mientras se resuelve el deploy, puedes probar localmente:

1. **Agregar a `.env.local`**:
```
VITE_USE_FIREBASE_EMULATOR=true
```

2. **Iniciar emuladores**:
```bash
firebase emulators:start --only functions
```

3. **El código ya está preparado** - `src/lib/firebase.js` detectará automáticamente el modo desarrollo y usará el emulador en `localhost:5001`

### Opción 3: Permitir CORS Manualmente (No recomendado)

Si la opción 1 y 2 no funcionan, puedes configurar CORS manualmente en Google Cloud Console:

1. Ve a [Cloud Functions Console](https://console.cloud.google.com/functions/list?project=cobrify-395fe)
2. Encuentra la función `sendInvoiceToSunat`
3. Click en los 3 puntos > **Editar**
4. En **Variables de entorno, configuración de red y temas avanzados**
5. Agrega variable de entorno:
   - `CORS_ORIGIN`: `*` (o específicamente `http://localhost:3006`)

## 📝 Código Actualizado

El código en `functions/index.js` ya fue actualizado con:

```javascript
export const sendInvoiceToSunat = onCall(
  {
    cors: true, // ✅ CORS habilitado
    region: 'us-central1',
  },
  async (request) => {
    // ... código de la función
  }
)
```

## 🧪 Versión Actual de la Función

La función actual en `functions/index.js` es una **versión simplificada (MOCK)** que:

✅ Valida autenticación y permisos
✅ Obtiene la factura de Firestore
✅ Valida configuración SUNAT
✅ Actualiza el estado de la factura
⚠️ **NO genera XML real**
⚠️ **NO firma digitalmente**
⚠️ **NO envía a SUNAT**
✅ Retorna respuesta simulada

Esta versión sirve para:
- Probar el flujo completo de UI
- Verificar que CORS funciona
- Validar autenticación y permisos
- Ver el update de estado en Firestore

## 🔜 Próximos Pasos

1. **Resolver permisos de deploy** (Opción 1 arriba)
2. **Redesplegar la función** con CORS habilitado
3. **Probar desde la UI** - el error CORS debería desaparecer
4. **Agregar implementación real** - reintegrar:
   - `src/utils/xmlGenerator.js`
   - `src/utils/xmlSigner.js`
   - `src/utils/sunatClient.js`

## 🐛 Debugging

### Verificar que la función está desplegada:
```bash
firebase functions:list
```

### Ver logs de la función:
```bash
firebase functions:log --only sendInvoiceToSunat
```

### Probar la función desde CLI:
```bash
firebase functions:shell
# Luego: sendInvoiceToSunat({userId: 'test', invoiceId: 'test'})
```

## 📞 Si Todo Falla

Si ninguna opción funciona, considera:

1. **Cambiar a Cloud Functions v1** (más simple pero deprecated)
2. **Usar Firebase Extensions** si hay una extensión para SUNAT
3. **Crear un servidor Express separado** en Cloud Run
4. **Pedir ayuda en Firebase Discord/StackOverflow**

---

**Última actualización**: 20 de Octubre, 2025
