# Guía de Solución de Problemas - Integración SUNAT

## 📋 Resumen del Estado Actual

### ✅ Problemas Resueltos
1. **Credenciales SUNAT duplicadas** - El RUC se duplicaba en el usuario SOL
2. **Configuración de ambiente** - Se configuró correctamente el ambiente Beta
3. **Logging de errores** - Se mejoró el sistema de logs para mostrar errores detallados de SUNAT

### ⚠️ Problemas Pendientes
1. **Datos inválidos en facturas** - Las facturas actuales tienen datos que SUNAT rechaza
2. **Validaciones faltantes** - No hay validaciones previas al envío

---

## 🔴 Error Actual: SUNAT devuelve HTTP 500

### Síntomas
```
POST http://localhost:5001/.../sendInvoiceToSunat 500 (Internal Server Error)
Error al enviar a SUNAT: Error al parsear respuesta de error de SUNAT
```

### Causa Raíz
SUNAT está rechazando las facturas por **datos inválidos**, específicamente:

#### 1. Cliente con DNI inválido ❌
```xml
<cbc:ID>00000000</cbc:ID>
<cbc:RegistrationName>Cliente General</cbc:RegistrationName>
```
**Problema:** El DNI `00000000` no es válido para SUNAT.

#### 2. Items sin descripción ❌
```xml
<cbc:Description/>
```
**Problema:** El campo descripción está vacío, pero es obligatorio según UBL 2.1.

#### 3. Fecha de emisión faltante ⚠️
```
⚠️ No hay fecha de emisión, usando fecha actual
```
**Problema:** La factura en Firestore no tiene el campo `issueDate`.

---

## ✅ Soluciones

### Solución 1: Crear factura con datos válidos

#### Opción A: Desde el POS
1. Ve al **POS** en la aplicación
2. Crea una nueva venta con:
   - **Cliente válido:**
     - DNI: 8 dígitos (ej: `12345678`)
     - O RUC: 11 dígitos válido
     - Nombre completo del cliente
   - **Items:**
     - Asegúrate que todos los items tengan descripción
     - No dejar campos vacíos
3. Genera la boleta/factura
4. Ve a **Lista de Facturas**
5. Click en **Enviar a SUNAT** ⬆️

#### Opción B: Editar factura existente en Firestore
1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Proyecto: `cobrify-395fe`
3. Firestore Database
4. Navega a: `businesses/{userId}/invoices/XU05LK9f4UvlnaoCoslq`
5. Edita los siguientes campos:
   ```javascript
   {
     customer: {
       documentNumber: "12345678",  // Cambiar de "00000000"
       documentType: "DNI",
       name: "Juan Pérez García"
     },
     items: [
       {
         description: "Producto de prueba",  // Asegurarse que no esté vacío
         quantity: 1,
         unitPrice: 10.00,
         ...
       }
     ],
     issueDate: Timestamp.now()  // Agregar fecha actual
   }
   ```
6. Guardar cambios
7. Intenta enviar nuevamente a SUNAT

---

### Solución 2: Agregar Validaciones (Recomendado)

Para prevenir estos errores en el futuro, se deben agregar validaciones antes de enviar a SUNAT:

#### En `functions/index.js` - Validar antes de generar XML
```javascript
// Validar datos del cliente
if (!invoiceData.customer?.documentNumber ||
    invoiceData.customer.documentNumber === '00000000') {
  throw new HttpsError('invalid-argument',
    'Cliente con documento inválido. Por favor verifica el DNI/RUC del cliente.')
}

// Validar items
if (!invoiceData.items || invoiceData.items.length === 0) {
  throw new HttpsError('invalid-argument', 'La factura debe tener al menos un item')
}

invoiceData.items.forEach((item, index) => {
  if (!item.description || item.description.trim() === '') {
    throw new HttpsError('invalid-argument',
      `Item ${index + 1} no tiene descripción. Todos los items deben tener descripción.`)
  }
})

// Validar fecha de emisión
if (!invoiceData.issueDate) {
  throw new HttpsError('invalid-argument',
    'La factura debe tener fecha de emisión')
}
```

#### En el Frontend - Validar al crear/editar facturas
Agregar validaciones en el formulario de clientes y POS para:
- DNI: Exactamente 8 dígitos numéricos
- RUC: Exactamente 11 dígitos numéricos
- Items: Descripción obligatoria
- Fecha de emisión: Automática al crear factura

---

## 📊 Logs Mejorados

Con la última actualización, ahora el emulador mostrará el XML completo de error de SUNAT:

```
❌ Error al comunicarse con SUNAT: ...
📄 Respuesta XML de SUNAT (error):
<?xml version="1.0"?>
<soap:Envelope>
  <soap:Body>
    <soap:Fault>
      <faultcode>XXX</faultcode>
      <faultstring>Descripción del error</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>
```

Esto permitirá ver exactamente qué campo está rechazando SUNAT.

---

## 🧪 Prueba de Validación

Para probar que la integración funciona correctamente:

### Datos de Prueba Válidos para SUNAT Beta

```javascript
{
  documentType: "boleta",
  series: "B001",
  correlativeNumber: 1,
  currency: "PEN",
  issueDate: new Date(),
  customer: {
    documentType: "DNI",
    documentNumber: "12345678",  // ✅ DNI válido para pruebas
    name: "Cliente de Prueba"
  },
  items: [
    {
      description: "Producto de Prueba",  // ✅ Con descripción
      quantity: 1,
      unitPrice: 10.00,
      unit: "NIU"
    }
  ],
  subtotal: 10.00,
  igv: 1.80,
  total: 11.80,
  sunatStatus: "pending"
}
```

---

## 📞 Próximos Pasos

1. **Inmediato:** Crea una nueva factura con datos válidos o edita la existente
2. **Corto plazo:** Implementa validaciones en el código
3. **Mediano plazo:** Agrega validación de RUC real usando API de SUNAT
4. **Largo plazo:** Preparar certificado digital para producción

---

## 🔗 Referencias

- [Catálogo de Errores SUNAT](https://cpe.sunat.gob.pe/node/88)
- [Especificaciones UBL 2.1](http://docs.oasis-open.org/ubl/UBL-2.1.html)
- [Guía de Facturación Electrónica](https://cpe.sunat.gob.pe/)

---

**Última actualización:** 21 de Octubre, 2025
**Estado:** Debugging en progreso
