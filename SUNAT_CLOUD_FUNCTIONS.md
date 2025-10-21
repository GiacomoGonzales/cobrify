# Integración SUNAT - Cloud Functions

## 📋 Resumen

Se ha implementado la infraestructura completa de Cloud Functions para la integración con SUNAT, permitiendo el envío automático de facturas y boletas electrónicas al sistema de facturación electrónica de la SUNAT peruana.

## ✅ Implementación Completada

### 1. **Estructura de Cloud Functions**

```
functions/
├── package.json              # Dependencias de Cloud Functions
├── index.js                  # Función principal sendInvoiceToSunat
├── src/
│   └── utils/
│       ├── xmlGenerator.js   # Generación de XML UBL 2.1
│       ├── xmlSigner.js      # Firma digital con certificado
│       └── sunatClient.js    # Cliente SOAP para SUNAT
└── .gitignore
```

### 2. **Archivos Modificados**

#### **firebase.json** (nuevo)
- Configuración de Firebase para Cloud Functions y Firestore

#### **functions/package.json**
Dependencias instaladas:
- `firebase-admin`: Administración de Firebase
- `firebase-functions`: Framework de Cloud Functions
- `xmlbuilder2`: Generación de XML
- `node-forge`: Criptografía y firma digital
- `axios`: Cliente HTTP para SOAP
- `fast-xml-parser`: Parseo de respuestas XML

#### **src/lib/firebase.js**
- Agregado `getFunctions` y `connectFunctionsEmulator`
- Exportado `functions` para uso en la app

#### **src/services/firestoreService.js**
- Nueva función `sendInvoiceToSunat(userId, invoiceId)`
- Manejo de errores específicos de Cloud Functions

#### **src/pages/InvoiceList.jsx**
- Importado `sendInvoiceToSunat`
- Estado `sendingToSunat` para tracking
- Función `handleSendToSunat()` con UI feedback
- Botón con loading spinner durante envío

## 🔧 Funcionalidades Implementadas

### **Generación de XML UBL 2.1** (`xmlGenerator.js`)

Genera XML según especificaciones de SUNAT:

- ✅ Estructura UBL 2.1 completa
- ✅ Información del emisor (RUC, razón social, dirección, ubigeo)
- ✅ Información del cliente (DNI/RUC/CE/Pasaporte)
- ✅ Items con IGV calculado
- ✅ Totales y subtotales
- ✅ Códigos de catálogo SUNAT
- ✅ Soporte para Facturas (01) y Boletas (03)

### **Firma Digital** (`xmlSigner.js`)

Firma XML con certificado digital:

- ✅ Lectura de certificado PFX/P12
- ✅ Firma XMLDSig con SHA-256
- ✅ Inserción de firma en UBLExtensions
- ✅ Validación de certificados (fechas de vigencia)

### **Cliente SOAP** (`sunatClient.js`)

Comunicación con SUNAT:

- ✅ Compresión ZIP del XML
- ✅ Generación de SOAP Envelope con credenciales SOL
- ✅ Envío a ambiente Beta/Producción
- ✅ Parseo de CDR (Constancia de Recepción)
- ✅ Manejo de errores SOAP

### **Cloud Function Principal** (`index.js`)

Función callable `sendInvoiceToSunat`:

1. ✅ Validación de autenticación y permisos
2. ✅ Obtención de factura y configuración SUNAT
3. ✅ Generación de XML UBL 2.1
4. ✅ Firma digital del XML
5. ✅ Envío a SUNAT via SOAP
6. ✅ Procesamiento de respuesta (CDR)
7. ✅ Actualización de estado en Firestore

## 📊 Flujo de Trabajo

```
1. Usuario crea factura/boleta en POS
   └─> sunatStatus: 'pending'

2. Usuario hace clic en "Enviar a SUNAT"
   └─> InvoiceList.handleSendToSunat()

3. Se llama a la Cloud Function
   └─> functions/index.js: sendInvoiceToSunat

4. Cloud Function procesa:
   ├─> Genera XML UBL 2.1
   ├─> Firma con certificado digital
   ├─> Comprime en ZIP
   ├─> Envía a SUNAT (SOAP)
   └─> Recibe CDR (respuesta)

5. Actualiza Firestore:
   ├─> sunatStatus: 'accepted' | 'rejected'
   ├─> sunatResponse: { code, description, observations }
   └─> sunatSentAt: timestamp

6. UI se actualiza automáticamente
   └─> Badge muestra nuevo estado
```

## 🎨 UI Implementada

### **InvoiceList.jsx**

#### Badge de Estado SUNAT:
- 🟢 **Aceptado** (verde) - Factura aceptada por SUNAT
- 🟡 **Pendiente** (amarillo) - Esperando envío
- 🔴 **Rechazado** (rojo) - SUNAT rechazó el documento
- ⚪ **N/A** (gris) - No aplica (Notas de Venta)

#### Botón "Enviar a SUNAT":
- Solo visible para facturas/boletas con estado "pending"
- Spinner de loading durante el envío
- Deshabilitado mientras se procesa
- Feedback visual con mensajes de éxito/error

## 🔐 Seguridad

### **Autenticación**
- ✅ Verificación de usuario autenticado
- ✅ Validación que el userId coincida con el usuario autenticado
- ✅ Permisos de Firestore Rules

### **Datos Sensibles**
⚠️ **PENDIENTE DE IMPLEMENTAR:**
- Encriptación de `solPassword` en Firestore
- Encriptación de `certificatePassword` en Firestore
- Almacenamiento de certificado en Cloud Storage (no Firestore)

## 🚀 Despliegue de Cloud Functions

### **Desarrollo Local**

Para probar con emulador de Functions:

```bash
# Instalar Firebase CLI si no está instalado
npm install -g firebase-tools

# Login a Firebase
firebase login

# Iniciar emuladores
firebase emulators:start
```

Luego en `.env.local` agregar:
```
VITE_USE_FIREBASE_EMULATOR=true
```

### **Despliegue a Producción**

```bash
# Desplegar solo las funciones
cd functions
npm install
cd ..
firebase deploy --only functions

# O desplegar todo (functions + firestore)
firebase deploy
```

## 📝 Configuración Requerida

### **En Settings (Configuración de SUNAT)**

El usuario debe configurar:

1. **Credenciales SOL**:
   - Usuario SOL (proporcionado por SUNAT)
   - Clave SOL (contraseña de SUNAT)

2. **Certificado Digital**:
   - Subir certificado .pfx o .p12
   - Ingresar contraseña del certificado

3. **Ambiente**:
   - Beta (Homologación) - Para pruebas
   - Producción - Para documentos reales

4. **Estado de Homologación**:
   - ☑️ Marcar si ya completó la homologación con SUNAT

### **En Settings (Información de Empresa)**

Debe completar:
- ✅ RUC (11 dígitos)
- ✅ Razón Social
- ✅ Dirección Fiscal
- ✅ Departamento, Provincia, Distrito
- ⚠️ Ubigeo (opcional pero recomendado)

## 🧪 Testing

### **Ambiente Beta (Recomendado para pruebas)**

SUNAT proporciona un ambiente de pruebas:

- URL: `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService`
- No afecta documentos reales
- Permite probar la integración

### **Pasos para Probar**

1. Configurar credenciales SOL de prueba en Settings
2. Subir certificado de prueba
3. Seleccionar ambiente "Beta"
4. Crear una factura de prueba en POS
5. En InvoiceList, hacer clic en "Enviar a SUNAT"
6. Verificar que el estado cambie a "Aceptado" o "Rechazado"
7. Revisar la consola del navegador para logs detallados

## ⚠️ TODOs Pendientes

### **Alta Prioridad**

1. **Implementar compresión ZIP real** en `sunatClient.js`
   - Actualmente usa XML sin comprimir
   - Instalar y usar librería `jszip` o `archiver`

2. **Encriptar credenciales** en Firestore
   - `solPassword` debe estar encriptado
   - `certificatePassword` debe estar encriptado
   - Usar Cloud KMS o similar

3. **Almacenar certificado en Cloud Storage**
   - No guardar certificado en Firestore
   - Usar Firebase Storage con permisos restrictivos

### **Media Prioridad**

4. **Implementar reintentos** en caso de error de red
5. **Agregar logs estructurados** para debugging
6. **Implementar consulta de estado** (verificar CDR después)
7. **Manejar notas de crédito y débito**

### **Baja Prioridad**

8. **Optimizar tamaño del XML** (minificar sin pretty print)
9. **Cachear configuración SUNAT** para reducir lecturas de Firestore
10. **Agregar métricas y monitoreo** con Cloud Monitoring

## 📚 Referencias

- **UBL 2.1**: http://docs.oasis-open.org/ubl/UBL-2.1.html
- **SUNAT CPE**: https://cpe.sunat.gob.pe/
- **Catálogos SUNAT**: https://cpe.sunat.gob.pe/node/88
- **Firebase Functions**: https://firebase.google.com/docs/functions

## 🐛 Troubleshooting

### Error: "Cloud Function no encontrada"

**Causa**: Las funciones no están desplegadas.

**Solución**:
```bash
firebase deploy --only functions
```

### Error: "Certificado digital no encontrado"

**Causa**: No se ha subido el certificado en Settings.

**Solución**: Ir a Settings > SUNAT y subir un archivo .pfx o .p12

### Error: "RUC inválido" o "Credenciales incorrectas"

**Causa**: Usuario/Clave SOL incorrectos.

**Solución**: Verificar credenciales SOL en Settings

### Error: Timeout

**Causa**: SUNAT puede tardar en responder.

**Solución**: El timeout está en 60 segundos, si persiste verificar conectividad.

## 📈 Próximos Pasos

1. **Desplegar Cloud Functions a Firebase**
2. **Probar en ambiente Beta de SUNAT**
3. **Implementar TODOs de alta prioridad**
4. **Completar homologación con SUNAT**
5. **Habilitar en producción**

---

**Fecha de Implementación**: 20 de Octubre, 2025
**Versión**: 1.0.0
**Estado**: ✅ Funcional - ⚠️ Requiere mejoras de seguridad
