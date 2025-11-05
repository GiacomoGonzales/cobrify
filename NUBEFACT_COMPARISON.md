# 🔍 NubeFact: OSE SOAP vs API JSON - Comparativa Detallada

## ⚠️ IMPORTANTE: Dos Métodos Completamente Diferentes

NubeFact ofrece **DOS métodos distintos** de integración. NO son compatibles entre sí:

---

## 📊 Comparativa Lado a Lado

| Característica | **OSE SOAP** (Tu cuenta actual) | **API JSON** (Lo implementado) |
|---|---|---|
| **Tipo de Cuenta** | OSE Normal | Reseller / Integrador |
| **¿Requiere Certificado Digital?** | ✅ **SÍ** (por empresa) | ❌ **NO** |
| **¿Requiere Clave SOL?** | ✅ **SÍ** (por empresa) | ❌ **NO** |
| **¿Quién genera el XML?** | 🔴 Tú (tu sistema) | 🟢 NubeFact |
| **¿Quién firma el XML?** | 🔴 Tú (con certificado) | 🟢 NubeFact |
| **Formato de integración** | SOAP (XML complicado) | REST JSON (simple) |
| **Endpoint Demo** | https://demo-ose.nubefact.com/ol-ti-itcpe/billService?wsdl | https://api.nubefact.com/api/v1/{ruta} |
| **Endpoint Producción** | https://ose.nubefact.com/ol-ti-itcpe/billService?wsdl | https://api.nubefact.com/api/v1/{ruta} |
| **Credenciales** | Usuario + Contraseña (diferente demo/prod) | Token único |
| **Debe subir certificado a SUNAT** | ✅ Sí, con Clave SOL | ❌ No |
| **Dar de alta NubeFact como OSE en SUNAT** | ✅ Sí (esperar 24h) | ❌ No |
| **Complejidad de Implementación** | 🔴 Alta | 🟢 Baja |
| **Ideal para** | Empresas grandes con certificado | **SaaS multi-empresa sin certificados** |

---

## 🤔 ¿Por qué OSE SOAP NO tiene sentido para tu caso?

### Tu Situación:
- Estás construyendo un **SaaS (Cobrify)** para múltiples empresas
- Quieres que empresas **sin certificado digital** puedan facturar
- Quieres evitar que cada cliente tenga que:
  - ❌ Comprar certificado digital (~S/200-500/año)
  - ❌ Configurar Clave SOL
  - ❌ Subir certificado a SUNAT
  - ❌ Dar de alta OSE en SUNAT

### Con OSE SOAP:
```
Empresa A → Necesita certificado → Firma XML → Envía a NubeFact OSE → SUNAT
Empresa B → Necesita certificado → Firma XML → Envía a NubeFact OSE → SUNAT
Empresa C → Necesita certificado → Firma XML → Envía a NubeFact OSE → SUNAT
```
❌ **Cada empresa NECESITA certificado igual** = No resuelve tu problema

### Con API JSON:
```
Empresa A → Envía JSON simple → NubeFact firma → SUNAT ✅
Empresa B → Envía JSON simple → NubeFact firma → SUNAT ✅
Empresa C → Envía JSON simple → NubeFact firma → SUNAT ✅
```
✅ **Ninguna empresa necesita certificado** = SOLUCIONA tu problema

---

## 💡 Entonces, ¿cuándo SÍ usar OSE SOAP?

OSE SOAP tiene sentido SOLO en estos casos:

1. **Ya tienes certificado digital** y quieres delegar el envío a SUNAT (pero seguir firmando tú)
2. **Integración legacy** - sistema viejo que ya genera XMLs firmados
3. **Control total** - quieres firmar tú los XMLs por seguridad/auditoría

❌ **NO tiene sentido si**:
- Quieres evitar certificados (tu caso)
- Es un SaaS multi-empresa
- Buscas simplicidad

---

## 📋 Confirmación del FAQ que enviaste

Del FAQ de NubeFact OSE SOAP:

### 1️⃣ "¿SE DEBE COMUNICAR EL CERTIFICADO DIGITAL A NUBEFACT?"
> NO, el certificado digital que vas a usar **lo debes subir a la SUNAT con tu CLAVE SOL**. **Debes usar ese certificado para firmar los XML** que enviarás a NUBEFACT.

**Traducción**:
- Cada empresa debe tener su propio certificado
- Cada empresa debe subirlo a SUNAT con su Clave SOL
- Tu sistema debe firmar los XMLs con ese certificado
- = **Requiere certificado por empresa** ❌

### 2️⃣ "¿NECESITO QUE NUBEFACT PASE A PRODUCCIÓN A MI(S) EMPRESA(S)?"
> NO, si estás autorizado tu mismo puedes hacerlo... Busca la opción 'Pasar a producción'.

**Traducción**:
- OSE SOAP es para OSE Normal (empresas individuales)
- Cada empresa se pasa a producción por separado
- = **No es modelo multi-empresa** ❌

### 3️⃣ "¿CUÁNTO TIEMPO ESPERAR DESDE QUE DOY DE ALTA A NUBEFACT COMO OSE EN LA SUNAT?"
> 24 horas desde que nos das de ALTA como OSE...

**Traducción**:
- Cada empresa debe dar de alta a NubeFact en portal SUNAT
- Requiere Clave SOL de la empresa
- = **Proceso manual por empresa** ❌

---

## ✅ Lo que YA está implementado en tu código

Tu sistema tiene implementado **API JSON** (el método bueno para SaaS):

### Backend:
- ✅ `nubefactService.js` - Cliente REST para API JSON
- ✅ `invoiceToNubefactJSON.js` - Convierte a JSON simple
- ✅ `emissionRouter.js` - Router dual SUNAT/NubeFact
- ✅ `functions/index.js` - Endpoint listo

### Frontend:
- ✅ Tab "NubeFact OSE" en Settings
- ✅ Campos: Ruta, Token, Environment
- ✅ Validación y guardado

### Lo que necesitas:
- ❌ Credenciales API JSON (no las tienes aún)

---

## 🚀 Opciones Concretas para Avanzar

### Opción 1: Obtener Cuenta Reseller de NubeFact ⭐ RECOMENDADO

**Pasos**:
1. Ir a: https://www.nubefact.com/reseller
2. Registrarte como Integrador/Reseller
3. Esperar aprobación
4. Obtendrás: Ruta API + Token
5. Configurar en Settings → NubeFact OSE
6. ✅ Listo para facturar sin certificados

**Ventajas**:
- ✅ No requiere certificados
- ✅ Tu código ya está listo
- ✅ Solo pegar credenciales
- ✅ Ideal para SaaS

**Desventajas**:
- Puede tardar días en aprobar cuenta
- Puede tener costos por comprobante

---

### Opción 2: Buscar PSE Alternativo con API JSON

Otros PSEs en Perú con API similar:
- **Facturador.pe** - API REST JSON
- **Sunat.cloud** - API REST
- **Facturama** (México pero tiene Perú)

**Ventajas**:
- Algunos dan acceso inmediato
- Similar a NubeFact API JSON

**Desventajas**:
- Requiere adaptar código (pero similar)

---

### Opción 3: Usar SUNAT Directo Mientras Tanto

**Realidad**:
- Tu integración SUNAT directo funciona perfecto
- Solo para empresas con certificado
- Es lo que tienes operativo HOY

**Ventajas**:
- Ya funciona
- No dependes de terceros
- Gratis (solo costo de certificado)

**Desventajas**:
- Cada empresa necesita certificado
- No es tan "SaaS-friendly"

---

### Opción 4: Implementar OSE SOAP También ⚠️ NO RECOMENDADO

Podría implementar OSE SOAP, PERO:
- ❌ Requiere certificado (igual que SUNAT directo)
- ❌ No resuelve tu problema principal
- ❌ Más complejo que API JSON
- ❌ No es útil para modelo SaaS

**Solo tiene sentido si**:
- Cliente ya tiene certificado
- Quiere usar NubeFact como OSE (en vez de SUNAT directo)
- Por alguna razón prefiere NubeFact sobre SUNAT

---

## 📝 Resumen Ejecutivo

### Lo que tienes AHORA:
1. ✅ SUNAT Directo funcionando (requiere certificado)
2. ✅ API JSON de NubeFact implementado (sin certificado)
3. ❌ No tienes credenciales API JSON
4. ✅ Tienes credenciales OSE SOAP (pero requiere certificado = no útil)

### Decisión Recomendada:

**Para SaaS multi-empresa sin certificados:**
→ Obtener cuenta **Reseller NubeFact** con **API JSON**

**Mientras tanto:**
→ Usar **SUNAT Directo** para clientes que ya tienen certificado

---

## 🎯 Próximo Paso Sugerido

Voy a crear un documento de registro para NubeFact Reseller con todo lo que necesitas para aplicar correctamente.

¿Te preparo el documento de registro para Reseller?
