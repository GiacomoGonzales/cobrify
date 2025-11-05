# 📝 Guía para Registrarse como Reseller en NubeFact

## 🎯 Objetivo

Obtener credenciales **API JSON** de NubeFact para integrar facturación electrónica SIN necesidad de certificados digitales.

---

## 🔑 Diferencia Importante

| Tu cuenta actual | Lo que necesitas |
|---|---|
| OSE Normal | **Reseller / Integrador** |
| OSE SOAP (requiere certificado) | **API JSON** (sin certificado) |
| Para empresas individuales | Para SaaS multi-empresa |

---

## 📋 Requisitos Previos

Antes de aplicar, ten lista esta información:

### 1. Información de tu Empresa (Cobrify/Factuya)
- ✅ RUC de tu empresa
- ✅ Razón social completa
- ✅ Dirección fiscal
- ✅ Teléfono de contacto
- ✅ Email corporativo

### 2. Información Técnica
- ✅ URL de tu aplicación: `https://[tu-dominio].com`
- ✅ Descripción: "Sistema SaaS de facturación electrónica para PYMEs peruanas"
- ✅ Tecnología: Firebase + React + Cloud Functions
- ✅ Tipo de integración: REST API JSON

### 3. Plan de Negocio (pueden preguntar)
- ✅ Modelo SaaS por suscripción
- ✅ Número estimado de empresas a integrar
- ✅ Volumen mensual estimado de comprobantes
- ✅ Público objetivo: PYMEs sin certificado digital

---

## 🚀 Pasos para Registrarse

### Paso 1: Acceder al Portal de Resellers

**URL:** https://www.nubefact.com/reseller

O contactar a NubeFact directamente:
- **Email comercial:** ventas@nubefact.com
- **Teléfono:** (01) 707-0535 (Lima, Perú)
- **WhatsApp:** Disponible en su sitio web

### Paso 2: Completar Solicitud

Al contactar, menciona:

```
Asunto: Solicitud de Cuenta Reseller API JSON

Hola, equipo de NubeFact:

Soy [tu nombre], representante de [Cobrify/Factuya].

Estamos desarrollando un sistema SaaS de facturación electrónica
y necesitamos integrar su API JSON para emitir comprobantes
electrónicos sin que nuestros clientes requieran certificados digitales.

Datos de nuestra empresa:
- RUC: [tu RUC]
- Razón Social: [tu razón social]
- Web: [tu URL]
- Email: [tu email]
- Teléfono: [tu teléfono]

Necesitamos:
✅ Acceso a API JSON (NO OSE SOAP)
✅ Credenciales: Ruta API + Token
✅ Ambiente DEMO para pruebas
✅ Documentación técnica de integración

¿Cuáles son los siguientes pasos y condiciones comerciales?

Gracias,
[Tu nombre]
```

### Paso 3: Documentación que pueden solicitar

Prepara estos documentos (pueden pedirlos):

- 📄 Ficha RUC
- 📄 DNI del representante legal
- 📄 Vigencia de poder (si aplica)
- 📄 Constancia de no adeudo SUNAT (opcional)

### Paso 4: Revisión Comercial

NubeFact evaluará:
- ✅ Viabilidad del proyecto
- ✅ Volumen esperado
- ✅ Modelo de negocio

**Tiempo estimado:** 3-7 días hábiles

### Paso 5: Aprobación y Credenciales

Si aprueban, recibirás:

```
CREDENCIALES DEMO:
- Ruta: https://api.nubefact.com/api/v1/xxxxxx
- Token: xxxxxxxxxxxxxxxxxxxxxxxx

CREDENCIALES PRODUCCIÓN:
- Ruta: https://api.nubefact.com/api/v1/yyyyyy
- Token: yyyyyyyyyyyyyyyyyyyyyyyy
```

---

## 💰 Modelo de Precios (Aproximado)

NubeFact Reseller generalmente cobra por comprobante emitido:

### Precios Referenciales:
- Facturas/Boletas: ~S/0.10 - S/0.30 por comprobante
- Notas de Crédito/Débito: ~S/0.10 - S/0.30
- Volumen alto: Descuentos por escala

**Nota:** Los precios exactos se negocian según volumen esperado.

### Cómo Funciona el Cobro:
1. Prepago: Compras paquetes de comprobantes
2. Postpago: Pagas mensualmente según uso
3. Mixto: Saldo base + cobro adicional

---

## 🧪 Configuración en Factuya (Una vez que tengas credenciales)

### Opción A: Via UI

1. Abrir tu app → Settings
2. Click en tab "NubeFact OSE"
3. Habilitar NubeFact
4. Ambiente: Demo
5. Pegar **Ruta** y **Token**
6. Guardar

### Opción B: Directo en Firestore

```json
{
  "nubefact": {
    "enabled": true,
    "environment": "demo",
    "ruta": "https://api.nubefact.com/api/v1/TU-RUTA-AQUI",
    "token": "TU-TOKEN-AQUI"
  }
}
```

### Paso Final: Probar

1. Ir a POS
2. Crear factura de prueba
3. Click "Enviar a SUNAT"
4. Verificar en Firebase Console → Functions → Logs:
   ```
   📡 Método de emisión seleccionado: nubefact
   📤 Emitiendo vía NUBEFACT API JSON...
   ✅ Respuesta de NubeFact recibida
   ```

---

## ❓ Preguntas Frecuentes

### ¿Cuánto tarda la aprobación?
Entre 3-7 días hábiles después de enviar toda la documentación.

### ¿Necesito tener clientes ya?
No necesariamente, pero ayuda demostrar que tienes un plan de negocio sólido.

### ¿Puedo probar antes de aprobar?
Algunos proveedores dan acceso DEMO limitado. Pregunta al contactar.

### ¿Qué pasa si no aprueban mi cuenta?
Alternativas:
- Facturador.pe (Similar a NubeFact)
- Sunat.cloud
- Seguir con SUNAT directo (requiere certificados)

### ¿Cuándo paso a producción?
Después de:
1. Probar exhaustivamente en DEMO
2. Tener al menos 1 cliente real
3. Cargar saldo / firmar contrato con NubeFact

---

## 🔄 Alternativas a NubeFact

Si NubeFact no funciona, considera:

### 1. Facturador.pe
- **URL:** https://www.facturador.pe
- **API:** REST JSON (similar a NubeFact)
- **Ventaja:** Más fácil de obtener cuenta
- **Precio:** Similar

### 2. Sunat.cloud
- **URL:** https://sunat.cloud
- **API:** REST moderna
- **Ventaja:** Interface más moderna

### 3. FacturaPorTi
- **URL:** https://www.facturaporti.com.pe
- **API:** SOAP y REST
- **Ventaja:** Servicio completo

---

## 📞 Contactos Útiles

### NubeFact
- **Web:** https://www.nubefact.com
- **Email Ventas:** ventas@nubefact.com
- **Email Soporte:** soporte-ose@nubefact.com
- **Teléfono:** (01) 707-0535
- **Dirección:** Lima, Perú

### Soporte Técnico (una vez registrado)
- **Tickets:** https://ayuda.nubefact.com
- **Documentación:** Panel de usuario → API Integración
- **Horario:** Lunes a Viernes 9am-6pm

---

## ✅ Checklist de Registro

Antes de contactar, verifica:

- [ ] Tienes RUC de tu empresa
- [ ] Tienes dominio/URL de tu aplicación
- [ ] Conoces tu volumen estimado mensual
- [ ] Tienes email corporativo
- [ ] Preparaste descripción de tu proyecto
- [ ] Leíste `NUBEFACT_COMPARISON.md`
- [ ] Entiendes diferencia API JSON vs OSE SOAP
- [ ] Tienes documentos legales listos

---

## 🎯 Siguiente Paso Recomendado

1. **Contacta a NubeFact** usando el template de email arriba
2. **Mientras esperas respuesta**: Usa tu integración SUNAT directo actual
3. **Cuando obtengas credenciales**: Solo pégalas en Settings → NubeFact OSE
4. **Tu código ya está 100% listo** para usar NubeFact API JSON

---

## 📚 Documentos Relacionados

- `NUBEFACT_COMPARISON.md` - Diferencias OSE SOAP vs API JSON
- `NUBEFACT_IMPLEMENTATION_GUIDE.md` - Implementación técnica
- `README.md` - Documentación general del proyecto

---

**¿Listo para registrarte?** 🚀

Copia el template de email, personalízalo con tus datos y envíalo a ventas@nubefact.com.
