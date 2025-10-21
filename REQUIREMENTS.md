# 📋 Requisitos para Factuya - Sistema de Facturación Electrónica

## 🎯 Resumen Ejecutivo

Este documento detalla todos los requisitos necesarios para usar Factuya, divididos en dos niveles:

1. **Nivel Básico**: Sistema funcionando localmente sin SUNAT (facturas/boletas sin valor tributario)
2. **Nivel Completo**: Sistema con integración SUNAT (comprobantes electrónicos válidos)

---

## 📦 NIVEL BÁSICO - Sistema Local Funcional

### ✅ Requisitos Obligatorios

#### 1. Cuenta de Firebase (GRATUITA)

**¿Qué es?** Base de datos en la nube para almacenar facturas, clientes y productos.

**¿Cómo obtenerla?**
1. Ve a https://console.firebase.google.com/
2. Crea un nuevo proyecto (ejemplo: "factuya-miempresa")
3. Habilita los siguientes servicios:
   - **Authentication** > Sign-in method > Email/Password
   - **Firestore Database** > Create database > Start in production mode
   - **Storage** > Get started

**¿Qué datos necesitas?**
Crea un archivo `.env.local` con estas variables:
```env
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto-id
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

**Dónde encontrar estos datos:**
- Project Settings (⚙️) > General > Your apps > SDK setup and configuration

**Costo:** GRATIS (hasta 50,000 lecturas/día)

---

#### 2. Datos de tu Empresa

Configura estos datos desde **Configuración** dentro del sistema:

| Campo | Requerido | Ejemplo | Notas |
|-------|-----------|---------|-------|
| RUC | ✅ Sí | 20123456789 | 11 dígitos |
| Razón Social | ✅ Sí | MI EMPRESA S.A.C. | Nombre legal |
| Dirección | ✅ Sí | Av. Principal 123, Lima | Dirección fiscal |
| Email | ✅ Sí | contacto@miempresa.com | Email principal |
| Teléfono | ⚠️ Opcional | 01-2345678 | Teléfono de contacto |
| Sitio Web | ⚠️ Opcional | https://miempresa.com | Página web |
| Nombre Comercial | ⚠️ Opcional | Mi Empresa | Nombre de fantasía |

---

#### 3. Series de Comprobantes

Configura desde **Configuración > Series de Comprobantes**:

| Tipo | Serie por defecto | Formato |
|------|-------------------|---------|
| Facturas | F001 | F001-00000001 |
| Boletas | B001 | B001-00000001 |

**Puedes personalizar** las series según tus necesidades (ejemplo: F002, B003, etc.)

---

### ✅ Con esto puedes:
- ✅ Crear clientes, productos y servicios
- ✅ Emitir facturas y boletas
- ✅ Generar PDFs de los comprobantes
- ✅ Llevar control de inventario
- ✅ Gestionar ventas desde POS
- ❌ **NO** enviar comprobantes a SUNAT (sin validez tributaria)

---

## 🏛️ NIVEL COMPLETO - Integración con SUNAT

### ✅ Requisitos Adicionales (OBLIGATORIOS)

#### 4. Credenciales SUNAT - Clave SOL

**¿Qué es?** Sistema de autenticación de SUNAT para servicios en línea.

**¿Cómo obtenerla?**

1. **Si ya tienes Clave SOL:**
   - Solo necesitas recordar tu usuario y contraseña

2. **Si NO tienes Clave SOL:**
   - Ve a www.sunat.gob.pe
   - Menú: "SOL" > "Afíliese al Sistema"
   - Necesitarás:
     - RUC de tu empresa
     - Código de Usuario (proporcionado en Carta Inductiva)
     - DNI del representante legal

**¿Qué datos necesitas?**
```env
VITE_SUNAT_RUC=20123456789
VITE_SUNAT_SOL_USER=MODDATOS
VITE_SUNAT_SOL_PASSWORD=tu_clave_sol
```

**Costo:** GRATIS

---

#### 5. Certificado Digital (REQUERIDO PARA FIRMAR COMPROBANTES)

**¿Qué es?** Archivo digital (.pfx o .p12) que contiene tu firma electrónica para validar los comprobantes.

**¿Quién lo proporciona?**

Proveedores autorizados por SUNAT:

| Proveedor | Web | Costo Aprox. |
|-----------|-----|--------------|
| RENIEC | https://www.reniec.gob.pe/ | S/. 150 - 200/año |
| eCert Perú | https://ecert.pe/ | S/. 200 - 300/año |
| Llama Sign | https://llamasign.pe/ | S/. 180 - 250/año |

**Proceso de obtención:**

1. **Contactar al proveedor** (web o presencial)
2. **Presentar documentos:**
   - DNI del representante legal
   - RUC de la empresa
   - Copia de poder (si no eres el titular)
   - Formulario del proveedor
3. **Pago del servicio** (S/. 150 - 300)
4. **Recibir el certificado** (archivo .pfx + contraseña)
5. **Renovar anualmente**

**¿Qué datos necesitas?**
```env
VITE_SUNAT_CERTIFICATE_PATH=/path/to/tu-certificado.pfx
VITE_SUNAT_CERTIFICATE_PASSWORD=contraseña_del_certificado
```

**Costo:** S/. 150 - 300 por año

**⚠️ IMPORTANTE:**
- El certificado debe estar **vigente** (renovar antes de vencer)
- Guarda el archivo .pfx en un lugar **seguro**
- **NUNCA** compartas la contraseña del certificado
- Si se vence, tus comprobantes serán rechazados por SUNAT

---

#### 6. Configuración de Ambiente

**SUNAT tiene dos ambientes:**

| Ambiente | Propósito | Uso |
|----------|-----------|-----|
| **BETA** | Pruebas | Desarrollo y testing |
| **PRODUCCIÓN** | Comprobantes reales | Emisión formal |

**Configura:**
```env
# Para empezar siempre usa BETA
VITE_SUNAT_ENVIRONMENT=beta

# Una vez homologado, cambia a producción
# VITE_SUNAT_ENVIRONMENT=produccion
```

---

### 🔄 Proceso de Homologación con SUNAT

Para pasar de BETA a PRODUCCIÓN, debes:

#### Paso 1: Pruebas en BETA (2-4 semanas)
1. Configurar sistema en ambiente BETA
2. Emitir comprobantes de prueba
3. Verificar que se envían correctamente
4. Corregir errores si los hay

#### Paso 2: Solicitar Homologación (1-2 semanas)
1. Ingresar a SUNAT Operaciones en Línea
2. Menú: "Comprobantes de Pago Electrónicos" > "Homologación"
3. Completar formulario
4. Adjuntar comprobantes de prueba
5. Esperar aprobación de SUNAT

#### Paso 3: Activar PRODUCCIÓN (1 día)
1. Recibir notificación de aprobación
2. Cambiar `VITE_SUNAT_ENVIRONMENT=produccion`
3. ¡Listo para emitir comprobantes válidos!

---

## 🔧 Opción Alternativa: OSE (Operador de Servicios Electrónicos)

### ¿Qué es un OSE?

Es un intermediario autorizado por SUNAT que:
- ✅ Simplifica la integración técnica
- ✅ Gestiona el envío a SUNAT por ti
- ✅ Proporciona soporte técnico
- ❌ Tiene costo mensual

### Proveedores OSE populares:

| OSE | Web | Costo Aprox. |
|-----|-----|--------------|
| Nubefact | https://nubefact.com/ | S/. 30 - 50/mes |
| FacturaPeru | https://facturaperu.com/ | S/. 40 - 60/mes |
| BillPocket | https://billpocket.com/ | S/. 35 - 55/mes |

### Variables de entorno:
```env
VITE_USE_OSE=true
VITE_OSE_URL=https://ose-provider.com/api
VITE_OSE_TOKEN=tu_token_ose
```

### ¿Cuándo usar un OSE?

- ✅ Si quieres **simplificar** el proceso técnico
- ✅ Si necesitas **soporte** constante
- ✅ Si emites **muchos** comprobantes (> 100/día)
- ❌ Si quieres **control total** sobre el envío
- ❌ Si quieres **evitar costos** mensuales

---

## 📊 Tabla Comparativa de Costos

| Concepto | Costo | Frecuencia | Obligatorio |
|----------|-------|------------|-------------|
| Firebase | Gratis (hasta límite) | - | ✅ Sí |
| Certificado Digital | S/. 150 - 300 | Anual | ✅ Sí (para SUNAT) |
| Clave SOL | Gratis | - | ✅ Sí (para SUNAT) |
| OSE (opcional) | S/. 30 - 60 | Mensual | ⚠️ Opcional |
| **TOTAL SIN OSE** | **S/. 150 - 300** | **Anual** | - |
| **TOTAL CON OSE** | **S/. 510 - 1,020** | **Anual** | - |

---

## 🚀 Checklist de Implementación

### Fase 1: Sistema Básico (1-2 horas)
- [ ] Crear proyecto Firebase
- [ ] Copiar credenciales a `.env.local`
- [ ] Configurar Firestore rules y indexes
- [ ] Registrar primer usuario
- [ ] Configurar datos de empresa
- [ ] Configurar series de comprobantes
- [ ] Emitir primera boleta de prueba

### Fase 2: Integración SUNAT (2-4 semanas)
- [ ] Verificar que tienes Clave SOL
- [ ] Adquirir certificado digital
- [ ] Configurar variables SUNAT en `.env.local`
- [ ] Configurar ambiente BETA
- [ ] Emitir comprobantes de prueba
- [ ] Solicitar homologación a SUNAT
- [ ] Esperar aprobación
- [ ] Cambiar a ambiente PRODUCCIÓN
- [ ] Emitir primer comprobante válido

---

## 📞 Contactos Útiles

### SUNAT
- **Web:** www.sunat.gob.pe
- **Central:** (01) 315-0730
- **Orientación:** 0-801-12-100 (gratuito desde teléfono fijo)

### Proveedores Certificado Digital
- **RENIEC:** (01) 315-2700
- **eCert:** (01) 441-3333

### Soporte Factuya
- **GitHub:** https://github.com/tuusuario/factuya
- **Email:** soporte@factuya.com

---

## ❓ Preguntas Frecuentes

### ¿Puedo usar el sistema sin SUNAT?
✅ Sí, puedes emitir facturas y boletas, pero **NO tendrán validez tributaria**.

### ¿Cuánto demora el proceso completo?
⏱️ Básico: 1-2 horas | Con SUNAT: 2-4 semanas (incluye homologación)

### ¿El certificado digital es obligatorio?
✅ SÍ, para SUNAT es **obligatorio** firmar los comprobantes.

### ¿Puedo usar un certificado gratuito?
❌ NO, debe ser de un proveedor **autorizado por SUNAT**.

### ¿Qué pasa si mi certificado vence?
⚠️ Los comprobantes serán **rechazados** por SUNAT. Debes renovar antes.

### ¿Necesito contratar un OSE?
⚠️ **Opcional**. Puedes enviar directo a SUNAT o usar OSE.

---

## 📝 Notas Finales

1. **Seguridad:** NUNCA subas `.env.local` a Git o repositorios públicos
2. **Respaldo:** Guarda una copia del certificado digital en lugar seguro
3. **Renovación:** Configura recordatorios para renovar el certificado
4. **Testing:** Siempre prueba en BETA antes de PRODUCCIÓN
5. **Documentación:** Consulta la documentación oficial de SUNAT: https://cpe.sunat.gob.pe/

---

**Versión:** 1.0
**Última actualización:** Octubre 2025
**Sistema:** Factuya v1.0.0
