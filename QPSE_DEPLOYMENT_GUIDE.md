# 🚀 Guía de Despliegue QPse - LISTO PARA PRODUCCIÓN

## ✅ Trabajo Completado

### Frontend (Settings.jsx)
- ✅ Eliminada toda referencia a NubeFact
- ✅ Implementada sección completa de QPse con:
  - Estados para `usuario`, `password`, `environment`
  - Contador de firmas (`firmasDisponibles`, `firmasUsadas`)
  - UI con dashboard de estado
  - Validación de credenciales
  - Instrucciones de configuración
  - Información de precios (bolsa de firmas)
- ✅ Build exitoso sin errores

### Backend (Cloud Functions)
- ✅ `qpseService.js` - Servicio completo de integración con QPse API
- ✅ `emissionRouter.js` - Router actualizado con prioridad QPse
- ✅ `functions/index.js` - Manejo de respuestas QPse en Firestore
- ✅ Flujo completo: Obtener token → Firmar XML → Enviar a SUNAT
- ✅ Backend listo para modelo de credenciales globales

---

## 📋 Pasos Siguientes

### 1. Reautenticar con Firebase

```bash
firebase login --reauth
```

Esto abrirá tu navegador para que inicies sesión con tu cuenta de Google.

### 2. Desplegar Cloud Functions Actualizadas

```bash
firebase deploy --only functions
```

**Tiempo estimado:** 2-3 minutos

### 3. Configurar QPse en la Aplicación

#### Opción A: Usar la UI de Settings (Recomendado)

1. Ejecuta la aplicación:
   ```bash
   npm run dev
   ```

2. Ve a **Settings → QPse**

3. Habilita QPse y completa:
   - **Usuario:** Tu usuario de QPse (el que usas para login en qpse.pe)
   - **Password:** Tu contraseña de QPse
   - **Ambiente:** Demo (para pruebas) o Production (para facturas reales)
   - **Firmas Disponibles:** 15000 (si compraste la bolsa de 15k firmas)
   - **Firmas Usadas:** 0 (al inicio)

4. Click en **Guardar Cambios**

#### Opción B: Configurar Directamente en Firestore (Alternativa)

1. Ve a Firebase Console → Firestore
2. Busca: `businesses/{tuUserId}`
3. Agrega/actualiza el campo `qpse`:

```json
{
  "qpse": {
    "enabled": true,
    "environment": "demo",
    "usuario": "TU_USUARIO_QPSE",
    "password": "TU_PASSWORD_QPSE",
    "firmasDisponibles": 15000,
    "firmasUsadas": 0
  }
}
```

### 4. Probar Emisión

#### Paso 1: Registrar Empresa en QPse (Solo primera vez)

Tu empresa debe estar registrada en QPse. Tienes dos opciones:

**A. Automático (Primera emisión lo hace automáticamente)**

Cuando emitas tu primera factura, el sistema intentará registrar la empresa automáticamente.

**B. Manual (Usando Postman/Thunder Client)**

```http
POST https://demo-cpe.qpse.pe/api/empresa/crear
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "ruc": "TU_RUC",
  "razon_social": "TU RAZON SOCIAL"
}
```

#### Paso 2: Emitir Factura de Prueba

1. Ve a **POS**
2. Crea una factura de prueba con datos válidos
3. Click en **Enviar a SUNAT**
4. Espera la respuesta (debería ser inmediata)

#### Paso 3: Verificar Resultado

**En la aplicación:**
- Verás el estado: "Aceptado" o "Rechazado"
- Podrás descargar PDF y XML
- La factura mostrará el método usado: "qpse"

**En Firebase Console → Functions → Logs:**
Deberías ver:

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

**En Firestore:**
El documento de la factura tendrá:

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

## 🎯 Modelo de Negocio QPse

### ¿Cómo Funciona?

1. **TÚ (Giacomo) tienes UNA cuenta QPse**
   - Usuario: `tu_usuario`
   - Password: `tu_password`
   - Compras bolsas de firmas: S/130 = 15,000 firmas

2. **TODOS tus clientes usan TU cuenta QPse**
   - No necesitan contratar QPse
   - No necesitan certificado digital
   - Tú pagas las firmas, ellos pagan por usar tu sistema

3. **Cada negocio solo necesita:**
   - RUC
   - Razón Social
   - Dirección
   - Email

4. **Control de firmas:**
   - Cada vez que un negocio emite un comprobante, se incrementa `firmasUsadas`
   - Puedes ver en Settings cuántas firmas quedan
   - Cuando quedan < 500 firmas, verás una alerta
   - Recargas tu bolsa en qpse.pe cuando necesites

### Ventajas para Ti

✅ **Modelo SaaS perfecto:**
- Un solo contrato QPse
- Una sola bolsa de firmas para todos
- Sin límite de RUCs/empresas
- Firmas nunca caducan

✅ **Económico:**
- S/130 = 15,000 firmas
- ~S/0.009 por firma
- Sin pagos mensuales

✅ **Control total:**
- Ves cuántas firmas quedan
- Decides cuándo recargar
- Puede ser parte de tu modelo de pricing

---

## 🔄 Flujo de Afiliación de Nuevos Negocios

### Datos que le solicitas al cliente:

```
📋 INFORMACIÓN BÁSICA
- RUC (obligatorio)
- Razón Social (obligatorio)
- Nombre Comercial (opcional)
- Dirección Fiscal (obligatorio)
- Email (obligatorio)
- Teléfono (opcional)
- Logo (opcional)
```

### Datos que TÚ controlas (globales):

```
🔐 CREDENCIALES QPSE (Una sola vez en Settings)
- Usuario QPse
- Password QPse
- Ambiente (Demo/Production)
- Firmas Disponibles
- Firmas Usadas
```

### Proceso de Afiliación:

1. **Cliente se registra** → Crea cuenta en tu app
2. **Cliente completa perfil** → RUC, Razón Social, etc.
3. **Tú habilitas emisión** → QPse ya está configurado globalmente
4. **Cliente emite su primera factura** → Usa TUS credenciales QPse
5. **Se registra automáticamente en QPse** → Backend lo hace solo
6. **Factura se envía a SUNAT** → Firmada con TU certificado QPse

---

## 📊 Monitoreo de Firmas

### En Settings → QPse verás:

```
┌─────────────────────────────────────────┐
│ Estado de Firmas                        │
├─────────────────────────────────────────┤
│ Firmas Disponibles: 14,285              │
│ Firmas Usadas:      715                 │
│ Firmas Restantes:   ~14,285             │
│                                          │
│ ⚠️ Quedan menos de 500 firmas          │
│    Es momento de recargar               │
└─────────────────────────────────────────┘
```

### Cuándo recargar:

- **< 1000 firmas:** Considera recargar pronto
- **< 500 firmas:** Recarga urgente recomendada
- **< 100 firmas:** Crítico, recarga inmediatamente

### Cómo recargar:

1. Ve a https://qpse.pe o https://demo-cpe.qpse.pe
2. Inicia sesión con tu usuario/password
3. Ve a "Recargar Bolsa de Firmas"
4. Compra la bolsa que necesites (S/130 = 15,000 firmas)
5. Las firmas se agregan automáticamente
6. Actualiza el valor en Settings → QPse

---

## 🧪 Ambientes

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
- Comprobantes NO válidos legalmente
- Gratis / pruebas ilimitadas
- Ideal para desarrollo y testing

### Production (Facturas Reales)

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
- Comprobantes VÁLIDOS legalmente
- Consume firmas de tu bolsa
- Usa cuando estés listo para producción

---

## 🚨 Troubleshooting

### Error: "Credenciales de QPse no configuradas"

**Causa:** No se configuró usuario/password en Settings

**Solución:**
1. Ve a Settings → QPse
2. Completa Usuario y Password
3. Click en Guardar Cambios

### Error: "QPse no devolvió token de acceso"

**Causa:** Usuario o password incorrectos

**Solución:**
1. Verifica que usuario/password sean correctos
2. Verifica que el ambiente sea correcto (demo/production)
3. Intenta login manual en qpse.pe para confirmar credenciales

### Error: "Error al firmar con QPse"

**Causa:** XML inválido o empresa no registrada

**Solución:**
1. Verifica que la empresa esté registrada en QPse
2. Revisa logs de Firebase Functions para ver el XML generado
3. Verifica que los datos de la factura sean correctos

### La factura se queda en "pending"

**Causa:** Cloud Functions no desplegadas o error en backend

**Solución:**
1. Verifica que las Cloud Functions estén desplegadas
2. Revisa logs de Firebase Functions
3. Verifica que `qpse.enabled = true`

---

## ✅ Checklist Pre-Producción

Antes de emitir facturas reales:

- [ ] Firebase reautenticado (`firebase login --reauth`)
- [ ] Cloud Functions desplegadas (`firebase deploy --only functions`)
- [ ] Credenciales QPse configuradas en Settings
- [ ] Probado en ambiente **demo** exitosamente
- [ ] Al menos 3 facturas de prueba aceptadas
- [ ] Empresa registrada en QPse
- [ ] Verificados logs de Firebase Functions
- [ ] Cambiado a `environment: "production"` cuando estés listo
- [ ] Bolsa de firmas comprada y configurada
- [ ] Primera factura real emitida y aceptada

---

## 📞 Recursos

### QPse

- **Docs:** https://docs.qpse.pe/
- **Portal Demo:** https://demo-cpe.qpse.pe
- **Portal Prod:** https://cpe.qpse.pe
- **WhatsApp:** +51 973358200 / +51 947299925

### Tu Configuración

- **Frontend:** Settings.jsx con sección QPse completa
- **Backend:** qpseService.js + emissionRouter.js + functions/index.js
- **Guías:** QPSE_SETUP_GUIDE.md, QPSE_DEPLOYMENT_GUIDE.md

---

## 🎉 ¡Estás Listo!

Una vez que completes los pasos de:
1. ✅ Reautenticación Firebase
2. ✅ Deploy de Cloud Functions
3. ✅ Configuración de credenciales QPse

Ya podrás:
- ✅ Emitir facturas sin certificado digital
- ✅ Facturar para múltiples RUCs con una sola cuenta QPse
- ✅ Modelo económico: ~S/0.009 por firma
- ✅ Sin pagos mensuales
- ✅ RUCs ilimitados
- ✅ Firmas que nunca caducan

**¡Es momento de probar!** 🚀
