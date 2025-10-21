# 🏛️ Integración con SUNAT - Guía Completa

## 📊 Estado Actual de la Integración

### ✅ Completado

1. **Generación de XML UBL 2.1**
   - ✅ Servicio completo de generación de XML según estándar SUNAT
   - ✅ Soporte para Facturas (01) y Boletas (03)
   - ✅ Inclusión de todos los campos requeridos por SUNAT
   - ✅ Validación de datos antes de generar XML
   - ✅ Descarga de XML comprimido en ZIP

2. **Variables de Entorno**
   - ✅ Archivo `.env.local` configurado con placeholders
   - ✅ Variables para credenciales SUNAT (RUC, Usuario SOL, Clave SOL)
   - ✅ Variables para certificado digital (ruta y contraseña)
   - ✅ Configuración de ambiente (beta/producción)

3. **Interfaz de Usuario**
   - ✅ Botón "XML SUNAT" en vista de detalles de factura/boleta
   - ✅ Descarga automática del XML comprimido en ZIP
   - ✅ Mensajes de éxito y error

### ⚠️ Pendiente

1. **Firma Digital del XML**
   - ❌ Implementar firma digital con certificado .pfx/.p12
   - ❌ Requiere backend (Firebase Functions o Node.js)

2. **Envío a SUNAT**
   - ❌ Implementar llamada SOAP a servicios de SUNAT
   - ❌ Manejo de respuesta CDR (Constancia de Recepción)
   - ❌ Almacenamiento del CDR en Firebase

3. **Consulta de Estado**
   - ❌ Implementar consulta de estado de comprobantes
   - ❌ Actualización automática de estados

---

## 🎯 ¿Qué puedes hacer ahora?

### Con el sistema actual:

1. **Generar XML UBL 2.1** ✅
   - Ir a **Facturas y Boletas**
   - Hacer clic en el ícono del ojo (Ver detalles)
   - Hacer clic en **XML SUNAT**
   - Se descargará un archivo `.zip` con el XML

2. **Verificar el XML generado** ✅
   - Descomprimir el archivo `.zip`
   - Abrir el archivo `.xml` con un editor de texto
   - Verificar que contenga todos los datos correctos

3. **Usar herramientas de SUNAT para validar** ✅
   - Ir a: https://www.sunat.gob.pe/ol-ti-itconsvalicpe/consulta
   - Subir el XML para validar su estructura
   - Corregir errores si los hay

### Lo que NO puedes hacer todavía:

1. ❌ Firmar digitalmente el XML (requiere backend)
2. ❌ Enviar directamente a SUNAT (requiere firma)
3. ❌ Recibir CDR automáticamente

---

## 🔧 Cómo completar la integración

Para tener la integración 100% funcional con SUNAT, necesitas:

### Opción 1: Backend Propio (Node.js)

**Ventajas:** Control total, sin costos adicionales de servicios
**Desventajas:** Requiere servidor, mantenimiento

**Pasos:**

1. Crear un backend en Node.js/Express
2. Instalar dependencias:
   ```bash
   npm install node-forge xmlbuilder2 soap
   ```
3. Implementar endpoint de firma:
   ```javascript
   POST /api/sunat/sign
   Body: { xml, certificatePath, certificatePassword }
   Response: { signedXML }
   ```
4. Implementar endpoint de envío:
   ```javascript
   POST /api/sunat/send
   Body: { signedXML, ruc, user, password }
   Response: { cdr, success, errors }
   ```
5. Actualizar `src/services/sunatService.js` para llamar a estos endpoints

### Opción 2: Firebase Functions (Recomendado)

**Ventajas:** Serverless, escalable, integrado con Firebase
**Desventajas:** Requiere plan Blaze (pago por uso)

**Pasos:**

1. **Inicializar Firebase Functions:**
   ```bash
   firebase init functions
   ```

2. **Instalar dependencias en `functions/`:**
   ```bash
   cd functions
   npm install node-forge axios jszip
   ```

3. **Crear función de firma** (`functions/index.js`):
   ```javascript
   const functions = require('firebase-functions')
   const admin = require('firebase-admin')
   const forge = require('node-forge')

   exports.signXML = functions.https.onCall(async (data, context) => {
     // Verificar autenticación
     if (!context.auth) {
       throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado')
     }

     const { xml, certificatePath, certificatePassword } = data

     try {
       // Leer certificado desde Firebase Storage
       const bucket = admin.storage().bucket()
       const certFile = bucket.file(certificatePath)
       const [certData] = await certFile.download()

       // Cargar certificado .pfx
       const p12Der = forge.util.decode64(certData.toString('base64'))
       const p12Asn1 = forge.asn1.fromDer(p12Der)
       const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certificatePassword)

       // Obtener llave privada y certificado
       const keyData = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag][0]
       const certData = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0]

       const privateKey = keyData.key
       const certificate = certData.cert

       // Firmar XML
       const md = forge.md.sha1.create()
       md.update(xml, 'utf8')
       const signature = privateKey.sign(md)

       // Insertar firma en XML
       const signedXML = xml.replace(
         '<!-- Firma digital se insertará aquí -->',
         `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
           <ds:SignedInfo>
             <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
             <ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
             <ds:Reference URI="">
               <ds:Transforms>
                 <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
               </ds:Transforms>
               <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
               <ds:DigestValue>${forge.util.encode64(md.digest().bytes())}</ds:DigestValue>
             </ds:Reference>
           </ds:SignedInfo>
           <ds:SignatureValue>${forge.util.encode64(signature)}</ds:SignatureValue>
           <ds:KeyInfo>
             <ds:X509Data>
               <ds:X509Certificate>${forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes())}</ds:X509Certificate>
             </ds:X509Data>
           </ds:KeyInfo>
         </ds:Signature>`
       )

       return { success: true, signedXML }
     } catch (error) {
       console.error('Error al firmar XML:', error)
       throw new functions.https.HttpsError('internal', error.message)
     }
   })

   exports.sendToSunat = functions.https.onCall(async (data, context) => {
     // Verificar autenticación
     if (!context.auth) {
       throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado')
     }

     const { signedXML, fileName, ruc, user, password, environment } = data

     try {
       // Comprimir XML en ZIP
       const JSZip = require('jszip')
       const zip = new JSZip()
       zip.file(fileName, signedXML)
       const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

       // Configurar endpoint según ambiente
       const endpoint = environment === 'beta'
         ? 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService'
         : 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService'

       // Enviar a SUNAT vía SOAP
       const axios = require('axios')
       const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
         <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe">
           <soapenv:Header/>
           <soapenv:Body>
             <ser:sendBill>
               <fileName>${fileName.replace('.xml', '.zip')}</fileName>
               <contentFile>${zipBuffer.toString('base64')}</contentFile>
             </ser:sendBill>
           </soapenv:Body>
         </soapenv:Envelope>`

       const response = await axios.post(endpoint, soapEnvelope, {
         headers: {
           'Content-Type': 'text/xml;charset=UTF-8',
           'SOAPAction': 'urn:sendBill',
         },
         auth: {
           username: `${ruc}${user}`,
           password: password,
         },
       })

       // Procesar respuesta CDR
       const cdrMatch = response.data.match(/<applicationResponse>(.*?)<\/applicationResponse>/)
       if (cdrMatch) {
         const cdr = Buffer.from(cdrMatch[1], 'base64')
         return {
           success: true,
           cdr: cdr.toString('base64'),
           message: 'Comprobante enviado exitosamente a SUNAT',
         }
       } else {
         throw new Error('No se recibió CDR de SUNAT')
       }
     } catch (error) {
       console.error('Error al enviar a SUNAT:', error)
       return {
         success: false,
         error: error.message,
       }
     }
   })
   ```

4. **Desplegar Functions:**
   ```bash
   firebase deploy --only functions
   ```

5. **Actualizar Frontend** (`src/services/sunatService.js`):
   ```javascript
   import { getFunctions, httpsCallable } from 'firebase/functions'

   export const sendInvoiceToSunat = async (invoiceData, companySettings) => {
     try {
       // Generar XML
       const { xml, fileName } = await prepareInvoiceXML(invoiceData, companySettings)

       // Firmar XML
       const functions = getFunctions()
       const signXML = httpsCallable(functions, 'signXML')
       const signResult = await signXML({
         xml,
         certificatePath: import.meta.env.VITE_SUNAT_CERTIFICATE_PATH,
         certificatePassword: import.meta.env.VITE_SUNAT_CERTIFICATE_PASSWORD,
       })

       if (!signResult.data.success) {
         throw new Error('Error al firmar XML')
       }

       // Enviar a SUNAT
       const sendToSunat = httpsCallable(functions, 'sendToSunat')
       const sendResult = await sendToSunat({
         signedXML: signResult.data.signedXML,
         fileName,
         ruc: import.meta.env.VITE_SUNAT_RUC,
         user: import.meta.env.VITE_SUNAT_SOL_USER,
         password: import.meta.env.VITE_SUNAT_SOL_PASSWORD,
         environment: import.meta.env.VITE_SUNAT_ENVIRONMENT,
       })

       return sendResult.data
     } catch (error) {
       return {
         success: false,
         error: error.message,
       }
     }
   }
   ```

### Opción 3: Usar un OSE (Más Fácil)

**Proveedores recomendados:**
- [Nubefact](https://nubefact.com/) - S/. 30-50/mes
- [FacturaPeru](https://facturaperu.com/) - S/. 40-60/mes
- [BillPocket](https://billpocket.com/) - S/. 35-55/mes

**Ventajas:** Sin configuración técnica compleja
**Desventajas:** Costo mensual

**Pasos:**

1. Contratar servicio OSE
2. Obtener credenciales API
3. Actualizar `.env.local`:
   ```env
   VITE_USE_OSE=true
   VITE_OSE_URL=https://api.nubefact.com/v1
   VITE_OSE_TOKEN=tu_token_ose
   ```
4. Implementar en `src/services/sunatService.js`:
   ```javascript
   export const sendInvoiceToSunat = async (invoiceData, companySettings) => {
     const { xml, fileName } = await prepareInvoiceXML(invoiceData, companySettings)

     const response = await axios.post(
       import.meta.env.VITE_OSE_URL + '/invoices',
       {
         xml,
         fileName,
       },
       {
         headers: {
           Authorization: `Bearer ${import.meta.env.VITE_OSE_TOKEN}`,
         },
       }
     )

     return response.data
   }
   ```

---

## 📝 Configuración Completa de Variables de Entorno

Una vez que tengas todos los requisitos, completa `.env.local`:

```env
# ========================================
# FIREBASE
# ========================================
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu_proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu_proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456:web:abc123
VITE_FIREBASE_MEASUREMENT_ID=G-ABC123

# ========================================
# SUNAT
# ========================================
VITE_SUNAT_RUC=20123456789
VITE_SUNAT_SOL_USER=MODDATOS
VITE_SUNAT_SOL_PASSWORD=tu_clave_sol

# ========================================
# CERTIFICADO DIGITAL
# ========================================
# Para Firebase Functions: ruta en Storage
VITE_SUNAT_CERTIFICATE_PATH=certificates/tu_certificado.pfx

# Para backend propio: ruta local
# VITE_SUNAT_CERTIFICATE_PATH=C:/Users/tu_usuario/certificado.pfx

VITE_SUNAT_CERTIFICATE_PASSWORD=password_certificado

# ========================================
# AMBIENTE
# ========================================
VITE_SUNAT_ENVIRONMENT=beta  # Cambiar a 'produccion' cuando estés listo
```

---

## 🧪 Proceso de Testing

### 1. Ambiente BETA (Pruebas)

1. Configurar `VITE_SUNAT_ENVIRONMENT=beta`
2. Emitir comprobantes de prueba
3. Verificar que se envíen correctamente
4. Revisar errores en consola de SUNAT
5. Corregir hasta que funcione al 100%

### 2. Homologación

1. Ir a SUNAT Operaciones en Línea
2. Solicitar homologación con comprobantes de prueba
3. Esperar aprobación (1-2 semanas)

### 3. Ambiente PRODUCCIÓN

1. Recibir notificación de aprobación
2. Cambiar `VITE_SUNAT_ENVIRONMENT=produccion`
3. Emitir primer comprobante válido
4. ¡Listo! 🎉

---

## 🔍 Validación Manual (Mientras tanto)

Mientras implementas el backend, puedes validar manualmente:

1. **Generar XML** desde el sistema
2. **Descargar el ZIP**
3. **Descomprimir** y obtener el XML
4. **Firmar manualmente** con herramientas de tu proveedor de certificado
5. **Subir a SUNAT** manualmente desde SOL

Herramientas útiles:
- [SUNAT - Validador de comprobantes](https://www.sunat.gob.pe/ol-ti-itconsvalicpe/consulta)
- [Validador XML UBL](https://ubl-validator.com/)

---

## 📚 Referencias

- [Documentación oficial SUNAT](https://cpe.sunat.gob.pe/)
- [Especificación UBL 2.1](https://www.oasis-open.org/committees/ubl/)
- [Catálogos SUNAT](https://cpe.sunat.gob.pe/sites/default/files/inline-files/Catalogo%202020.xlsx)
- [Guía de Implementación](https://cpe.sunat.gob.pe/sites/default/files/inline-files/Guia%20de%20Implementacion%20CPE%202.1%20v3.1.pdf)

---

## ❓ Preguntas Frecuentes

### ¿Puedo usar el sistema sin SUNAT?
✅ Sí, puedes emitir facturas y boletas, pero NO tendrán validez tributaria.

### ¿Cuánto cuesta la integración completa?
- **Certificado digital:** S/. 150-300/año
- **Backend propio:** Gratis (si tienes servidor)
- **Firebase Functions:** ~S/. 10-50/mes (según uso)
- **OSE:** S/. 30-60/mes

### ¿Cuánto tiempo toma la integración?
- **Con OSE:** 1-2 días
- **Con Firebase Functions:** 1-2 semanas
- **Con backend propio:** 2-4 semanas

### ¿Necesito ser programador?
- Para OSE: No, solo configurar credenciales
- Para Firebase/Backend: Sí, se requiere conocimientos técnicos

---

**Versión:** 1.0
**Última actualización:** Octubre 2025
**Sistema:** Factuya v1.0.0
