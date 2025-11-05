# 🚀 Guía de Configuración Rápida - QPse

## ✅ Backend Completado

La integración con QPse ya está **100% lista** en el backend:

### Archivos Creados/Actualizados:
1. ✅ `functions/src/services/qpseService.js` - Servicio de integración con QPse API
2. ✅ `functions/src/services/emissionRouter.js` - Router actualizado con QPse
3. ✅ `functions/index.js` - Cloud Function actualizada

---

## 🔧 Configuración Manual en Firestore (RÁPIDO)

Mientras se implementa la UI en Settings, puedes configurar QPse directamente en Firestore:

### Paso 1: Ir a Firebase Console → Firestore

1. Abre: https://console.firebase.google.com
2. Selecciona tu proyecto
3. Click en "Firestore Database"

### Paso 2: Buscar tu documento de negocio

Navega a: `businesses/{tuUserId}`

(Donde `{tuUserId}` es el ID del usuario/negocio que deseas configurar)

### Paso 3: Agregar campo `qpse`

Click en el documento y agrega un nuevo campo con estos datos:

```json
{
  "qpse": {
    "enabled": true,
    "environment": "demo",
    "usuario": "TU_USUARIO_QPSE",
    "password": "TU_PASSWORD_QPSE"
  }
}
```

**Reemplaza:**
- `TU_USUARIO_QPSE`: Usuario que te dieron al contratar QPse
- `TU_PASSWORD_QPSE`: Contraseña/password de QPse

**Nota:** Si ya tienes token de QPse, el usuario/password es lo que usaste para obtenerlo.

### Paso 4: (Opcional) Configurar método explícito

Si quieres forzar el uso de QPse sin importar otras configuraciones:

```json
{
  "emissionMethod": "qpse"
}
```

**Si NO agregas esto**, el sistema decidirá automáticamente según prioridad:
1. QPse (si está enabled)
2. NubeFact (si está enabled)
3. SUNAT directo

---

## 🏢 Registrar Empresa en QPse

Antes de emitir comprobantes, la empresa debe estar registrada en QPse.

### Opción A: Automático (Recomendado)

La primera vez que emitas un comprobante, el sistema intentará registrar la empresa automáticamente.

### Opción B: Manual via Postman/Thunder Client

```http
POST {{url}}/api/empresa/crear
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "ruc": "20512345678",
  "razon_social": "MI EMPRESA S.A.C."
}
```

---

## 📝 Ejemplo Completo de Configuración

### Estructura completa del documento `businesses/{userId}`:

```javascript
{
  // Datos básicos del negocio
  "ruc": "20512345678",
  "businessName": "MI EMPRESA S.A.C.",
  "address": "AV. EJEMPLO 123",

  // Configuración QPse (AGREGAR ESTO)
  "qpse": {
    "enabled": true,
    "environment": "demo",  // o "production"
    "usuario": "tu_usuario",
    "password": "tu_password"
  },

  // Opcionalmente forzar método
  "emissionMethod": "qpse",

  // Otras configuraciones (pueden existir o no)
  "sunat": {
    "enabled": false,
    // ...
  },
  "nubefact": {
    "enabled": false,
    // ...
  }
}
```

---

## 🚀 Desplegar Cloud Functions

Una vez configurado en Firestore, despliega las Cloud Functions actualizadas:

```bash
cd functions
npm run deploy
```

O desde la raíz del proyecto:

```bash
firebase deploy --only functions
```

**Tiempo estimado:** 2-3 minutos

---

## 🧪 Probar Emisión

### Paso 1: Asegúrate que QPse esté configurado

1. Firestore → `businesses/{userId}`
2. Verifica que existe el campo `qpse` con `enabled: true`

### Paso 2: Emitir factura de prueba

1. Ve a tu aplicación Factuya
2. Entra al módulo POS
3. Crea una factura de prueba
4. Click "Enviar a SUNAT"

### Paso 3: Verificar en Firebase Console → Functions → Logs

Deberías ver en los logs:

```
📡 Método de emisión seleccionado: qpse
📤 Emitiendo vía QPSE...
🔨 Generando XML UBL 2.1...
📡 Obteniendo token de QPse...
✅ Token obtenido exitosamente
🔏 Firmando XML con QPse...
✅ XML firmado exitosamente
📤 Enviando XML a SUNAT vía QPse...
✅ Enviado a SUNAT exitosamente
✅ Emisión completada - Estado: ACEPTADO
```

### Paso 4: Verificar en Firestore

El documento de la factura debe tener:

```json
{
  "sunatStatus": "accepted",
  "sunatResponse": {
    "code": "0",
    "description": "La Factura ha sido aceptada",
    "method": "qpse",
    "pdfUrl": "https://...",
    "xmlUrl": "https://...",
    "cdrUrl": "https://...",
    "ticket": "..."
  }
}
```

---

## 🔧 Troubleshooting

### Error: "Credenciales de QPse no configuradas"

**Solución:** Verifica que en Firestore existe:
```json
{
  "qpse": {
    "enabled": true,
    "usuario": "...",
    "password": "..."
  }
}
```

### Error: "QPse no devolvió token de acceso"

**Solución:**
- Verifica que usuario/password son correctos
- Verifica que environment es "demo" o "production" según tu contrato
- Intenta obtener token manualmente con Postman

### Error: "Error al firmar con QPse"

**Solución:**
- Verifica que el XML se está generando correctamente
- Revisa logs completos en Firebase Console
- Verifica que la empresa esté registrada en QPse

### La factura no se envía

**Solución:**
- Verifica que Cloud Functions estén desplegadas
- Revisa logs de Firebase Functions
- Verifica que `qpse.enabled = true`

---

## 🎯 Ambiente Demo vs Producción

### Demo (Pruebas)

```json
{
  "qpse": {
    "enabled": true,
    "environment": "demo",
    "usuario": "tu_usuario_demo",
    "password": "tu_password_demo"
  }
}
```

**Características:**
- URL: `https://demo-cpe.qpse.pe`
- Los comprobantes NO son válidos legalmente
- Ideal para pruebas

### Producción (Facturas Reales)

```json
{
  "qpse": {
    "enabled": true,
    "environment": "production",
    "usuario": "tu_usuario_prod",
    "password": "tu_password_prod"
  }
}
```

**Características:**
- URL: `https://cpe.qpse.pe`
- Los comprobantes SON válidos legalmente
- Usa cuando estés listo

---

## 📊 Flujo Completo

```
1. Usuario crea factura en POS
   ↓
2. Click "Enviar a SUNAT"
   ↓
3. Frontend llama a Cloud Function: sendInvoiceToSunat
   ↓
4. Cloud Function obtiene datos de Firestore
   ↓
5. emissionRouter detecta que qpse.enabled = true
   ↓
6. Genera XML UBL 2.1
   ↓
7. Llama a qpseService.js
   ↓
8. QPse obtiene token
   ↓
9. QPse firma XML
   ↓
10. QPse envía a SUNAT
    ↓
11. QPse devuelve respuesta
    ↓
12. Se actualiza Firestore
    ↓
13. Usuario ve resultado en app
```

---

## ✅ Checklist de Configuración

Antes de emitir tu primera factura real:

- [ ] Configurado `qpse` en Firestore con credenciales correctas
- [ ] Desplegadas Cloud Functions actualizadas
- [ ] Probado en ambiente demo exitosamente
- [ ] Empresa registrada en QPse
- [ ] Verificados logs de Firebase Functions
- [ ] Cambiado `environment: "production"` cuando estés listo
- [ ] Primera factura de prueba emitida y aceptada

---

## 📞 Soporte

**Si algo no funciona:**

1. Revisa logs de Firebase Console → Functions
2. Verifica configuración en Firestore
3. Contacta a soporte de QPse:
   - WhatsApp: +51 973358200 / +51 947299925
   - Docs: https://docs.qpse.pe/

---

## 🎉 ¡Listo!

Una vez configurado en Firestore y desplegadas las functions, ya puedes:
- ✅ Emitir facturas sin certificado digital
- ✅ Delegar firma a QPse
- ✅ Facturar por solo ~S/7-12/mes por RUC
- ✅ Firmas ilimitadas

**Próximo paso:** Implementar UI en Settings para configuración visual (opcional, ya funciona con Firestore).
