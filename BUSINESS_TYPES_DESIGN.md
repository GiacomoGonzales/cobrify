# 🏢 Sistema de Tipos de Negocio / Rubros

## 📊 Concepto

Permitir que cada negocio tenga un "tipo" o "rubro" que determina qué módulos/páginas están disponibles:

- **GENERAL** → Todos los módulos (completo)
- **PEQUEÑO NEGOCIO** → Módulos básicos (POS, Productos, Reportes)
- **DISTRIBUIDOR** → Módulos + Guías de Remisión + Compras/Proveedores
- **RESTAURANTE** → POS + Mesas + Comandas
- **SERVICIO TÉCNICO** → Órdenes de trabajo + Inventario repuestos
- **CUSTOM** → Personalizado por negocio

---

## 🏗️ Arquitectura Propuesta

### 1. Estructura en Firestore

```javascript
// Colección: businessTypes (plantillas de rubros)
businessTypes/
  └── general/
      ├── id: "general"
      ├── name: "General - Completo"
      ├── description: "Acceso a todos los módulos"
      ├── enabledModules: [
      │     "dashboard",
      │     "pos",
      │     "cash-register",
      │     "invoices",
      │     "quotations",
      │     "customers",
      │     "products",
      │     "inventory",
      │     "suppliers",
      │     "purchases",
      │     "reports",
      │     "settings"
      │   ]
      └── isDefault: true

  └── small-business/
      ├── id: "small-business"
      ├── name: "Pequeño Negocio"
      ├── description: "Lo esencial para empezar"
      ├── enabledModules: [
      │     "dashboard",
      │     "pos",
      │     "products",
      │     "customers",
      │     "reports",
      │     "settings"
      │   ]
      └── isDefault: false

  └── distributor/
      ├── id: "distributor"
      ├── name: "Negocio Distribuidor"
      ├── description: "Con guías de remisión y gestión de compras"
      ├── enabledModules: [
      │     "dashboard",
      │     "pos",
      │     "invoices",
      │     "delivery-guides",  // ⭐ Nuevo módulo
      │     "customers",
      │     "products",
      │     "inventory",
      │     "suppliers",
      │     "purchases",
      │     "reports",
      │     "settings"
      │   ]
      └── isDefault: false

// Colección: users (agregar campo businessType)
users/
  └── {userId}/
      ├── uid: "..."
      ├── email: "..."
      ├── isBusinessOwner: true
      ├── businessType: "small-business"  // ⭐ Nuevo campo
      ├── customModules: null  // o array para override
      ├── businessName: "Mi Negocio"
      └── ...
```

### 2. Lógica de Módulos Habilitados

**Prioridad de configuración:**

1. **customModules** (si existe) → Personalización individual
2. **businessType** → Plantilla del rubro
3. **isBusinessOwner/isAdmin** → Acceso completo (fallback)

```javascript
// Ejemplo de función
function getEnabledModules(user, businessTypes) {
  // Si es super admin, acceso total
  if (user.isAdmin) return ALL_MODULES

  // Si tiene módulos personalizados, usar esos
  if (user.customModules && user.customModules.length > 0) {
    return user.customModules
  }

  // Si tiene un businessType, usar la plantilla
  if (user.businessType && businessTypes[user.businessType]) {
    return businessTypes[user.businessType].enabledModules
  }

  // Si es business owner sin tipo, dar acceso completo (legacy)
  if (user.isBusinessOwner) return ALL_MODULES

  // Si es sub-usuario, usar allowedPages
  return user.allowedPages || []
}
```

---

## 🎨 UI/UX Propuesto

### 1. Al Registrarse (Nuevo Usuario)

```
┌─────────────────────────────────────────┐
│  ¡Bienvenido a Cobrify!                 │
│                                          │
│  ¿Qué tipo de negocio tienes?           │
│                                          │
│  ○ General - Completo                   │
│    Acceso a todos los módulos           │
│                                          │
│  ○ Pequeño Negocio                      │
│    Lo esencial para empezar             │
│    (POS, Productos, Reportes)           │
│                                          │
│  ○ Negocio Distribuidor                 │
│    Con guías de remisión                │
│                                          │
│  ○ Restaurante                          │
│    Mesas, comandas, POS                 │
│                                          │
│  [Continuar]                            │
└─────────────────────────────────────────┘
```

### 2. En Configuración (Cambiar Tipo)

**Settings > Tipo de Negocio**

```
Tipo de negocio actual: Pequeño Negocio
Módulos habilitados: POS, Productos, Reportes

[Cambiar tipo de negocio]
[Personalizar módulos] → Abre modal con checkboxes
```

### 3. Personalización Individual (Admin)

Para casos especiales donde un negocio necesita algo único:

```
┌─────────────────────────────────────────┐
│  Personalizar Módulos                   │
│                                          │
│  ☑ Dashboard                            │
│  ☑ Punto de Venta                       │
│  ☑ Control de Caja                      │
│  ☑ Facturas                             │
│  ☐ Cotizaciones                         │
│  ☑ Clientes                             │
│  ☑ Productos                            │
│  ☐ Inventario                           │
│  ☐ Guías de Remisión ⭐ NUEVO           │
│  ☐ Proveedores                          │
│  ☐ Compras                              │
│  ☑ Reportes                             │
│  ☑ Configuración                        │
│                                          │
│  ⚠️ Esto sobrescribirá la configuración │
│     del tipo de negocio                 │
│                                          │
│  [Cancelar]  [Guardar cambios]          │
└─────────────────────────────────────────┘
```

---

## 🔧 Implementación Técnica

### Paso 1: Crear colección businessTypes

```javascript
// Script: setup-business-types.js
const businessTypes = [
  {
    id: 'general',
    name: 'General - Completo',
    description: 'Acceso a todos los módulos del sistema',
    enabledModules: [
      'dashboard', 'pos', 'cash-register', 'invoices',
      'quotations', 'customers', 'products', 'inventory',
      'suppliers', 'purchases', 'reports', 'settings'
    ],
    icon: 'Building',
    isDefault: true
  },
  {
    id: 'small-business',
    name: 'Pequeño Negocio',
    description: 'Lo esencial para empezar a vender',
    enabledModules: [
      'dashboard', 'pos', 'products', 'customers',
      'reports', 'settings'
    ],
    icon: 'Store',
    isDefault: false
  },
  {
    id: 'distributor',
    name: 'Negocio Distribuidor',
    description: 'Con guías de remisión y gestión de compras completa',
    enabledModules: [
      'dashboard', 'pos', 'invoices', 'delivery-guides',
      'customers', 'products', 'inventory', 'suppliers',
      'purchases', 'reports', 'settings'
    ],
    icon: 'Truck',
    isDefault: false
  }
]
```

### Paso 2: Actualizar AuthContext

```javascript
// src/contexts/AuthContext.jsx
const [businessType, setBusinessType] = useState(null)
const [enabledModules, setEnabledModules] = useState([])

// Cargar businessType y módulos habilitados
useEffect(() => {
  if (user && isBusinessOwner) {
    // Obtener businessType del usuario
    // Obtener configuración de businessTypes
    // Calcular enabledModules
  }
}, [user, isBusinessOwner])

// Nueva función helper
const hasModuleAccess = (moduleId) => {
  if (isAdmin) return true
  if (isBusinessOwner) return enabledModules.includes(moduleId)
  return allowedPages.includes(moduleId) // sub-usuarios
}
```

### Paso 3: Actualizar Sidebar

```javascript
// src/components/Sidebar.jsx
const filteredMenuItems = menuItems.filter((item) => {
  if (isDemoMode) return true
  if (isAdmin) return true

  // ⭐ Nuevo: filtrar por businessType/módulos habilitados
  return hasModuleAccess(item.pageId)
})
```

---

## 📦 Nuevos Módulos a Implementar

### Guías de Remisión (para DISTRIBUIDOR)

```javascript
// src/pages/DeliveryGuides.jsx
// Ruta: /guias-remision

Campos:
- Número de guía
- Cliente (destinatario)
- Dirección de partida
- Dirección de llegada
- Transportista
- Productos/items
- Motivo de traslado (venta, compra, traslado entre almacenes)
- Vehículo (placa)
```

---

## 🎯 Beneficios

1. **Para el negocio:**
   - ✅ UI más limpia (solo ven lo que usan)
   - ✅ Menos confusión
   - ✅ Onboarding más rápido

2. **Para ti (admin):**
   - ✅ Puedes personalizar por negocio sin afectar otros
   - ✅ Fácil agregar nuevos rubros
   - ✅ Escalable para casos especiales

3. **Para el futuro:**
   - ✅ Pricing tiers (pequeño = gratis, completo = premium)
   - ✅ Marketplace de módulos
   - ✅ Plugins específicos por industria

---

## 🚀 Plan de Implementación

### Fase 1: Infraestructura (1-2 días)
- [ ] Crear colección `businessTypes` en Firestore
- [ ] Agregar campo `businessType` a users
- [ ] Actualizar `AuthContext` con lógica de módulos
- [ ] Crear función `hasModuleAccess()`

### Fase 2: UI Básico (1 día)
- [ ] Actualizar `Sidebar` para filtrar por módulos
- [ ] Crear página Settings > Tipo de Negocio
- [ ] Agregar selector en registro (opcional)

### Fase 3: Personalización (1 día)
- [ ] Modal de personalización de módulos
- [ ] Guardar `customModules` en Firestore
- [ ] UI para admin (cambiar tipo de otros negocios)

### Fase 4: Nuevos Módulos (según necesidad)
- [ ] Guías de Remisión (DISTRIBUIDOR)
- [ ] Mesas/Comandas (RESTAURANTE)
- [ ] Órdenes de Trabajo (SERVICIO TÉCNICO)

---

## ❓ Preguntas para Definir

1. **¿Al registrarse, el usuario elige su tipo o se lo asignas tú?**
   - Opción A: Selector en registro
   - Opción B: Todos empiezan con "GENERAL" y pueden cambiar después
   - Opción C: Tú lo asignas manualmente desde admin

2. **¿Los business owners pueden cambiar su propio tipo o solo tú?**

3. **¿Quieres que los tipos tengan restricciones de funcionalidad o solo ocultar módulos?**
   - Ejemplo: PEQUEÑO NEGOCIO tiene límite de 100 productos

4. **¿Tipos de negocio que ya tienes en mente?**
   - GENERAL ✅
   - PEQUEÑO NEGOCIO ✅
   - DISTRIBUIDOR ✅
   - ¿RESTAURANTE?
   - ¿SERVICIO TÉCNICO?
   - ¿OTROS?

---

## 💡 Próximos Pasos

¿Te gusta esta arquitectura? ¿Quieres que empecemos a implementar?

1. Primero responde las preguntas de arriba
2. Luego comenzamos con Fase 1: Infraestructura
