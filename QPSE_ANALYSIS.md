# 🔍 Análisis Técnico: QPse API

## 📋 Información General

**Proveedor:** QPse
**Tipo:** PSE (Proveedor de Servicios Electrónicos) / OSE
**API:** REST (JSON con XML Base64)
**URLs:**
- Demo: `https://demo-cpe.qpse.pe`
- Producción: `https://cpe.qpse.pe`

---

## 🔧 Endpoints Disponibles

### 1. Autenticación
```
POST /api/auth/cpe/token
Body: {
  "usuario": "RXV80SE9",
  "contraseña": "MJCN5DEQ"
}
```
**Retorna:** Bearer token para endpoints protegidos

### 2. Crear Empresa
```
POST /api/empresa/crear
Headers: Authorization: Bearer {token}
Body: {
  "ruc": "10411929821",
  "razon_social": "NOMBRE DE LA EMPRESA"
}
```
**Función:** Registrar múltiples empresas bajo tu cuenta

### 3. Firmar Documento (Factura/Boleta)
```
POST /api/cpe/generar
Headers: Authorization: Bearer {token}
Body: {
  "tipo_integracion": 0,
  "nombre_archivo": "10417844398-01-F001-17",
  "contenido_archivo": "<XML_EN_BASE64>"
}
```
**Función:** QPse firma el XML que le envías

### 4. Enviar a SUNAT
```
POST /api/cpe/enviar
Headers: Authorization: Bearer {token}
Body: {
  "nombre_xml_firmado": "10417844398-01-F001-17",
  "contenido_xml_firmado": "<XML_FIRMADO_EN_BASE64>"
}
```
**Función:** QPse envía XML firmado a SUNAT

### 5. Consultar Estado
```
GET /api/cpe/consultar/{nombre_archivo}
Headers: Authorization: Bearer {token}
```
**Función:** Consultar respuesta de SUNAT (CDR)

---

## ⚠️ DESCUBRIMIENTO IMPORTANTE

### QPse NO es API JSON como NubeFact

Decodificando el `contenido_archivo` del ejemplo:

```xml
<?xml version="1.0" encoding="utf-8" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ...>
  <ext:UBLExtensions>...</ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>F001-17</cbc:ID>
  <cbc:IssueDate>2024-04-21</cbc:IssueDate>
  <!-- XML UBL 2.1 COMPLETO -->
</Invoice>
```

**Conclusión:** QPse requiere que **TÚ generes el XML UBL 2.1 completo**.

---

## 📊 Comparativa: SUNAT Directo vs QPse vs NubeFact

| Característica | SUNAT Directo | QPse | NubeFact API JSON |
|---|---|---|---|
| **¿Requiere certificado?** | ✅ Sí | ⚠️ **Probablemente SÍ** | ❌ NO |
| **¿Quién genera XML?** | 🔴 Tú | 🔴 Tú | 🟢 NubeFact |
| **¿Quién firma XML?** | 🔴 Tú | 🟢 QPse | 🟢 NubeFact |
| **¿Quién envía a SUNAT?** | 🔴 Tú | 🟢 QPse | 🟢 NubeFact |
| **Formato de entrada** | XML | XML (Base64) | JSON simple |
| **Complejidad implementación** | 🔴 Alta | 🟡 Media | 🟢 Baja |
| **API** | SOAP | REST | REST |
| **Multiempresa** | Manual | ✅ Fácil | ✅ Fácil |

---

## 🤔 Preguntas Críticas Sin Responder

### 1. ¿QPse requiere certificado digital? 🚨

**Análisis:**
- QPse **firma el XML** por ti (`/api/cpe/generar`)
- Para firmar necesitan certificado digital
- **¿De quién es el certificado?**
  - Opción A: QPse tiene su propio certificado (bueno - no necesitas certificado)
  - Opción B: Debes darles tu certificado (malo - requieres certificado)

**NECESITAS PREGUNTAR:** ¿Debo proporcionar certificado digital por empresa?

---

### 2. ¿Cuánto cobra QPse? 💰

**No hay información de precios en la documentación.**

Comparación con NubeFact:
- NubeFact: S/1,000 inicial + S/40/empresa/mes
- QPse: ¿?

**NECESITAS PREGUNTAR:** Modelo de precios (inicial + mensual + por comprobante)

---

## ✅ Ventajas de QPse

1. **API REST moderna** (vs SOAP de SUNAT)
2. **Multiempresa fácil** (endpoint crear empresa)
3. **2 pasos claros**: Firmar → Enviar
4. **Ambiente demo disponible**
5. **Consulta de estado** integrada
6. **Maneja firma y envío** (tú solo generas XML)

---

## ❌ Desventajas de QPse

1. **Aún requieres generar XML UBL 2.1** (complejo)
2. **Probablemente requiere certificado** (no confirmado)
3. **Sin información de precios** pública
4. **2 llamadas por factura** (firmar + enviar)
5. **NO simplifica tanto** como NubeFact API JSON

---

## 🎯 ¿Para Quién Es QPse?

### ✅ SÍ sirve si:
- Ya generas XML (tienes `xmlGenerator.js` ✅)
- Quieres delegar firma y envío
- API REST es más fácil que SOAP directo a SUNAT
- Es MÁS BARATO que NubeFact

### ❌ NO sirve si:
- Buscas NO generar XML (usa NubeFact JSON)
- Buscas evitar certificados (depende si QPse los requiere)
- Quieres máxima simplicidad

---

## 🔧 Implementación en Tu Código

### Esfuerzo de Implementación: **MEDIO** 🟡

**Lo que YA tienes:**
- ✅ Generación de XML (`xmlGenerator.js`)
- ✅ Convertir a Base64 (trivial en JavaScript)
- ✅ Cliente HTTP (axios en Cloud Functions)

**Lo que necesitas agregar:**

```javascript
// functions/src/services/qpseService.js

import axios from 'axios'

const QPSE_BASE_URL = {
  demo: 'https://demo-cpe.qpse.pe',
  production: 'https://cpe.qpse.pe'
}

/**
 * 1. Obtener token de acceso
 */
async function getQPseToken(usuario, contraseña, environment = 'demo') {
  const response = await axios.post(
    `${QPSE_BASE_URL[environment]}/api/auth/cpe/token`,
    { usuario, contraseña }
  )
  return response.data.token // o el campo correcto
}

/**
 * 2. Firmar XML
 */
async function firmarXML(nombreArchivo, xmlContent, token, environment = 'demo') {
  const xmlBase64 = Buffer.from(xmlContent).toString('base64')

  const response = await axios.post(
    `${QPSE_BASE_URL[environment]}/api/cpe/generar`,
    {
      tipo_integracion: 0,
      nombre_archivo: nombreArchivo,
      contenido_archivo: xmlBase64
    },
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  )

  return response.data // XML firmado en Base64
}

/**
 * 3. Enviar a SUNAT
 */
async function enviarASunat(nombreArchivo, xmlFirmadoBase64, token, environment = 'demo') {
  const response = await axios.post(
    `${QPSE_BASE_URL[environment]}/api/cpe/enviar`,
    {
      nombre_xml_firmado: nombreArchivo,
      contenido_xml_firmado: xmlFirmadoBase64
    },
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  )

  return response.data
}

/**
 * 4. Flujo completo
 */
export async function emitirViaQPse(invoiceData, businessData) {
  // 1. Generar XML (ya lo haces)
  const xml = generateInvoiceXML(invoiceData, businessData)

  // 2. Obtener token
  const token = await getQPseToken(
    businessData.qpse.usuario,
    businessData.qpse.contraseña,
    businessData.qpse.environment
  )

  // 3. Firmar XML
  const nombreArchivo = `${businessData.ruc}-01-${invoiceData.series}-${invoiceData.correlativeNumber}`
  const firmado = await firmarXML(nombreArchivo, xml, token, businessData.qpse.environment)

  // 4. Enviar a SUNAT
  const resultado = await enviarASunat(nombreArchivo, firmado.xml_firmado, token, businessData.qpse.environment)

  return {
    success: resultado.success,
    method: 'qpse',
    accepted: resultado.accepted,
    // parsear respuesta...
  }
}
```

**Esfuerzo:** ~2-3 horas de código + pruebas

---

## 📋 Comparación de Esfuerzo de Implementación

| Método | Esfuerzo | Ya lo tienes |
|---|---|---|
| **SUNAT Directo** | 🔴 Alto | ✅ 100% listo |
| **QPse** | 🟡 Medio | 🟡 70% listo (falta integrar API) |
| **NubeFact JSON** | 🟢 Bajo | ✅ 100% listo |

---

## 💰 Decisión: Depende del Precio

### Si QPse cobra:

**< S/20/empresa/mes:**
- ✅ **ÚSALO** - Es más barato que NubeFact
- ✅ Implementación razonable (2-3 horas)
- ✅ Ya generas XML

**S/20-40/empresa/mes:**
- 🤔 **EVALUAR** - Compara con NubeFact
- Considera: ¿Generación de XML es ventaja o carga?

**> S/40/empresa/mes:**
- ❌ **NO** - NubeFact es mejor (no generas XML)

---

## 🎯 Preguntas URGENTES para QPse

Antes de decidir, contacta a QPse y pregunta:

### 1. **¿Requieren certificado digital por empresa?** 🚨
```
Si respuesta = SÍ → Similar a SUNAT directo (no gran ventaja)
Si respuesta = NO → ¡Excelente! Delegas firma
```

### 2. **¿Cuánto cuesta?**
```
- ¿Pago inicial?
- ¿Costo por empresa registrada?
- ¿Costo por comprobante?
- ¿Modelo prepago o postpago?
```

### 3. **¿Cómo manejan certificados?**
```
- ¿Ellos firman con su certificado?
- ¿O debo subir mi certificado por empresa?
```

### 4. **¿Límites o restricciones?**
```
- ¿Límite de comprobantes por mes?
- ¿Límite de empresas?
- ¿SLA de disponibilidad?
```

---

## ✅ Recomendación

**ANTES de implementar:**

1. ✉️ **Contacta a QPse** con las 4 preguntas críticas
2. 💰 **Compara precios** con NubeFact
3. 📊 **Decide según:**
   - Si requiere certificado: NO vale la pena (mejor SUNAT directo)
   - Si NO requiere certificado + es barato: ✅ Vale la pena
   - Si es caro: NubeFact JSON es mejor (menos código)

**Información de contacto QPse:**
- Buscar en su sitio web: https://qpse.pe (probablemente)
- O buscar en Google: "QPse Perú facturación electrónica contacto"

---

## 🎯 Resumen Ejecutivo

### QPse es:
- ✅ API REST (mejor que SOAP)
- ✅ Multiempresa fácil
- ⚠️ **Requiere generar XML** (ya lo haces)
- ❓ **Certificado?** (PREGUNTAR)
- ❓ **Precio?** (PREGUNTAR)

### Úsalo si:
- Es barato (< S/20/mes)
- NO requiere certificado
- Quieres API REST sin generar tu propio JSON

### NO lo uses si:
- Requiere certificado (mejor SUNAT directo - gratis)
- Es caro (mejor NubeFact - sin XML)

---

**Próximo paso:** Obtener información de precios y requisitos de certificado de QPse.
