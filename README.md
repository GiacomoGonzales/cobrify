# 🧾 Cobrify - Sistema de Facturación Electrónica para Perú

Sistema completo de facturación electrónica diseñado específicamente para empresas peruanas, con cumplimiento de normativas SUNAT.

## ✨ Características Principales

### 📊 **Dashboard Inteligente**
- Estadísticas en tiempo real (ventas del día, mes, pendientes)
- Gráfico de ventas de los últimos 7 días
- Alertas de stock bajo
- Vista rápida de facturas recientes

### 💰 **Punto de Venta (POS)**
- Interfaz rápida e intuitiva
- Búsqueda instantánea de productos
- Control automático de stock
- Múltiples métodos de pago (Efectivo, Tarjeta, Yape, Plin, Transferencia)
- Generación automática de comprobantes
- Impresión/Descarga de PDF al instante

### 📄 **Gestión de Facturas y Boletas**
- Creación manual o desde POS
- Numeración secuencial automática (F001-00000001)
- Visualización y búsqueda avanzada
- Filtros por estado y tipo
- Actualización de estados
- Generación de PDF profesional
- Estadísticas de facturación

### 👥 **Gestión de Clientes**
- CRUD completo
- Validación de RUC (11 dígitos) y DNI (8 dígitos)
- Soporte para diferentes tipos de documento (RUC, DNI, CE, Pasaporte)
- Búsqueda en tiempo real
- Campos para facturación (razón social, dirección, email, teléfono)

### 📦 **Gestión de Productos**
- Catálogo completo con categorías
- Control de stock (opcional)
- Precios y unidades de medida
- Códigos de producto
- Alertas de stock bajo
- Cálculo automático de valor de inventario

### 🏪 **Control de Inventario**
- Vista consolidada de todos los productos
- Filtros por categoría y estado de stock
- Estadísticas de inventario
- Valor total del inventario
- Productos agotados y con stock bajo

### ⚙️ **Configuración**
- Datos de empresa (RUC, razón social, dirección)
- Series de comprobantes personalizables
- Configuración de numeración automática

## 🛠️ Tecnologías Utilizadas

- **Frontend**: React 18 + Vite
- **Routing**: React Router v6
- **Estilos**: Tailwind CSS
- **Validación**: Zod + React Hook Form
- **Base de Datos**: Firebase Firestore
- **Autenticación**: Firebase Auth
- **Estado Global**: Zustand
- **Gráficos**: Recharts
- **PDFs**: jsPDF + jsPDF-AutoTable
- **Iconos**: Lucide React

## 📋 Normativas Peruanas Implementadas

✅ **IGV**: Cálculo automático del 18%
✅ **RUC**: Validación de 11 dígitos
✅ **DNI**: Validación de 8 dígitos
✅ **Numeración Secuencial**: Formato SUNAT (Serie-Correlativo)
✅ **Tipos de Comprobante**: Facturas y Boletas
✅ **Datos del Emisor**: RUC, Razón Social, Dirección

## 🚀 Instalación

```bash
# Instalar dependencias
npm install

# Configurar Firebase
# 1. Crear proyecto en Firebase Console
# 2. Habilitar Authentication (Email/Password)
# 3. Habilitar Firestore Database
# 4. Copiar configuración en src/lib/firebase.js

# Ejecutar en desarrollo
npm run dev

# Build para producción
npm run build
```

## 📁 Estructura del Proyecto

```
src/
├── components/        # Componentes reutilizables
│   ├── ui/           # Componentes UI (Button, Card, Modal, etc.)
│   └── charts/       # Componentes de gráficos
├── contexts/         # Contextos de React (Auth)
├── layouts/          # Layouts (MainLayout)
├── lib/              # Configuraciones (Firebase)
├── pages/            # Páginas principales
│   ├── Dashboard.jsx
│   ├── POS.jsx
│   ├── InvoiceList.jsx
│   ├── CreateInvoice.jsx
│   ├── Customers.jsx
│   ├── Products.jsx
│   ├── Inventory.jsx
│   └── Settings.jsx
├── services/         # Servicios (Firestore)
├── stores/           # Estado global (Zustand)
└── utils/            # Utilidades y helpers
    ├── peruUtils.js      # Validaciones SUNAT
    ├── schemas.js        # Esquemas de validación
    └── pdfGenerator.js   # Generador de PDFs
```

## 🔐 Colecciones de Firestore

```javascript
// Estructura de datos en Firebase

users/
  {userId}/

invoices/
  {invoiceId}/
    - number: "F001-00000001"
    - documentType: "factura" | "boleta"
    - customer: {...}
    - items: [...]
    - subtotal, igv, total
    - paymentMethod, status
    - createdAt, updatedAt

customers/
  {customerId}/
    - documentType, documentNumber
    - name, businessName
    - email, phone, address
    - userId
    - createdAt, updatedAt

products/
  {productId}/
    - code, name, category
    - price, stock, unit
    - userId
    - createdAt, updatedAt

companySettings/
  {userId}/
    - ruc, businessName, tradeName
    - address, phone, email, website
    - createdAt, updatedAt

documentSeries/
  {userId}/
    - factura: { serie, lastNumber }
    - boleta: { serie, lastNumber }
    - notaCredito: { serie, lastNumber }
    - notaDebito: { serie, lastNumber }
```

## 📱 Responsive Design

El sistema está completamente optimizado para:
- 📱 **Mobile**: < 640px
- 💻 **Tablet**: 640px - 1024px
- 🖥️ **Desktop**: > 1024px

## 🎯 Funcionalidades Implementadas

- [x] Autenticación con email/contraseña
- [x] Dashboard con estadísticas reales
- [x] Punto de Venta (POS)
- [x] Gestión de Facturas/Boletas
- [x] Gestión de Clientes
- [x] Gestión de Productos
- [x] Control de Inventario
- [x] Configuración de Empresa
- [x] Generación de PDF
- [x] Numeración automática SUNAT
- [x] Cálculo automático de IGV
- [x] Validación RUC/DNI
- [x] Responsive design completo
- [ ] **Integración con SUNAT** (Próximamente)

## 🔜 Próximas Funcionalidades

### Integración con SUNAT
- Emisión electrónica de comprobantes
- Firma digital
- Envío a OSE (Operador de Servicios Electrónicos)
- Validación con webservices SUNAT
- Descarga de CDR (Constancia de Recepción)
- Notas de Crédito y Débito

## 📝 Notas de Uso

### Crear primera venta:
1. Ir a **Configuración** → Configurar datos de empresa
2. Ir a **Productos** → Agregar productos
3. (Opcional) Ir a **Clientes** → Agregar clientes
4. Ir a **Punto de Venta** → Realizar venta
5. El comprobante se genera automáticamente

### Numeración de Comprobantes:
- Los números se generan automáticamente
- Formato: `SERIE-CORRELATIVO` (ej: F001-00000001)
- Las series son configurables en **Configuración**
- Los correlativos son de 8 dígitos

### PDF de Facturas:
- Descargables desde el modal de detalles
- También desde el POS después de completar la venta
- Formato profesional con logo y datos de empresa
- Incluye todas las validaciones SUNAT

## 🏃‍♂️ Scripts Disponibles

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build para producción
npm run preview  # Vista previa del build
npm run lint     # Ejecutar ESLint
```

## 📄 Licencia

Todos los derechos reservados © 2025 Cobrify

---

**Desarrollado con ❤️ en Perú para empresas peruanas**
