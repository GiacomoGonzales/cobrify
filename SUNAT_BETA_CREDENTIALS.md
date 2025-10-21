# Credenciales Beta de SUNAT - Guía Completa

## 🔑 Credenciales Oficiales para Pruebas

### Ambiente Beta - Facturación Electrónica

**URL del servicio:**
```
https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl
```

**Credenciales:**
- **Usuario:** `[TU_RUC]MODDATOS`
  - Ejemplo: Si tu RUC es `20613750551`, el usuario es: `20613750551MODDATOS`
- **Contraseña:** `MODDATOS`

**Certificado Digital:**
- ❌ NO es necesario para ambiente beta
- ✅ Solo se requiere para producción

## 📝 Configuración en la App

### Paso 1: Ir a Settings > Configuración SUNAT

1. **Habilitar integración:** ☑️ Marcar checkbox
2. **Ambiente:** Seleccionar `Beta`
3. **Usuario SOL:** Ingresar solo `MODDATOS`
   - ⚠️ El sistema agregará automáticamente tu RUC al inicio
   - NO ingreses el RUC completo, solo `MODDATOS`
4. **Clave SOL:** Ingresar `MODDATOS`
5. **Certificado:** Dejar vacío (no es necesario para beta)
6. **Guardar configuración**

### Paso 2: Probar con una Factura

1. Ir al POS y crear una factura de prueba
2. Ir a Lista de Facturas
3. Click en el botón "Enviar a SUNAT" ⬆️
4. Ver resultado en el mensaje de éxito/error

## ⚙️ Cómo Funciona

El sistema construye el usuario completo automáticamente:
```javascript
// En el código (sunatClient.js)
const fullUser = `${ruc}${solUser}`

// Ejemplo:
// RUC: 20613750551
// solUser: MODDATOS
// fullUser resultante: 20613750551MODDATOS
```

## 🧪 Qué Puedes Probar en Beta

✅ **Permitido:**
- Estructuras XML de facturas electrónicas
- Estructuras XML de boletas de venta electrónicas
- Estructuras XML de notas de crédito electrónicas
- Estructuras XML de notas de débito electrónicas
- Validación de formato UBL 2.1
- Pruebas de firma digital (opcional)
- Pruebas de comunicación SOAP

❌ **NO permitido:**
- Emitir documentos legales válidos
- Documentos que afecten el sistema real de SUNAT
- Usar para declaraciones o trámites oficiales

## 🌐 Otros Servicios Beta

### Retenciones y Percepciones
```
https://e-beta.sunat.gob.pe/ol-ti-itemision-otroscpe-gem-beta/billService?wsdl
```

Credenciales: Las mismas (`[RUC]MODDATOS` / `MODDATOS`)

## 📊 Respuestas Esperadas de SUNAT Beta

### Éxito (Código 0)
```
Estado: Aceptado
Código: 0
Descripción: La Factura número [SERIE-NUMERO], ha sido aceptada
```

### Rechazo por Error en XML
```
Estado: Rechazado
Código: 2xxx (variados)
Descripción: Error en estructura XML / datos inválidos
Observaciones: Detalles del error
```

### Error de Autenticación
```
Código: faultcode
Descripción: Credenciales inválidas o formato incorrecto
```

## 🔍 Debugging

### Ver Logs del Emulador

**Terminal del emulador mostrará:**
```
📤 Iniciando envío a SUNAT - Usuario: xxx, Factura: xxx
🏢 Empresa: [Nombre] - RUC: [RUC]
⚙️ Ambiente SUNAT: beta
📝 Generando XML UBL 2.1...
✅ XML generado (xxxxx caracteres)
⚠️ Modo sin firma digital (solo para testing en ambiente beta)
📦 ZIP creado: [nombre archivo] (xxx bytes)
🌐 Endpoint SUNAT: https://e-beta.sunat.gob.pe/...
📤 Enviando documento a SUNAT...
✅ Respuesta recibida de SUNAT
✅ Respuesta SUNAT: ACEPTADO/RECHAZADO
💾 Estado actualizado en Firestore
```

### Verificar en Firebase Console

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona proyecto `cobrify-395fe`
3. Firestore Database
4. `businesses/{tu-userId}/invoices/{invoiceId}`
5. Verifica campos:
   - `sunatStatus`: 'accepted' o 'rejected'
   - `sunatResponse`: Objeto con code y description
   - `sunatSentAt`: Timestamp

## ⚠️ Problemas Comunes

### Error: "Credenciales inválidas"
**Causa:** Usuario SOL mal formateado
**Solución:** Verifica que en Settings solo pongas `MODDATOS`, no el RUC completo

### Error: "RUC inválido"
**Causa:** El RUC en tu configuración de empresa no es válido
**Solución:** Ve a Settings > Información de Empresa y verifica el RUC (11 dígitos)

### Error: "Certificado no encontrado"
**Causa:** El código está requiriendo certificado en beta
**Solución:** El certificado es opcional en beta, el código ya maneja esto

### Error: "XML inválido"
**Causa:** Faltan datos requeridos en la factura
**Solución:** Verifica que la factura tenga:
- Cliente con DNI/RUC válido
- Items con precios válidos
- Empresa con datos completos (RUC, razón social, dirección)

## 📚 Referencias Oficiales

- [SUNAT - Facturación Electrónica](https://cpe.sunat.gob.pe/)
- [Documentación UBL 2.1](http://docs.oasis-open.org/ubl/UBL-2.1.html)
- [Catálogos SUNAT](https://cpe.sunat.gob.pe/node/88)

## 🎯 Próximo Paso: Producción

Cuando todo funcione en beta, para ir a producción necesitarás:

1. **Certificado Digital:**
   - Comprar en entidad certificadora autorizada
   - Formato .pfx o .p12
   - Subirlo en Settings > SUNAT

2. **Credenciales SOL Reales:**
   - Usuario SOL real (proporcionado por SUNAT)
   - Clave SOL real
   - **NO usar `MODDATOS` en producción**

3. **Cambiar Ambiente:**
   - Settings > SUNAT > Ambiente: `Producción`
   - Endpoint cambiará automáticamente a:
     `https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService`

4. **Homologación:**
   - Completar proceso de homologación con SUNAT
   - Marcar checkbox "Homologado" en Settings

---

**Última actualización:** 20 de Octubre, 2025
**Versión:** 1.0.0
