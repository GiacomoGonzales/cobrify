# Plan: Modo Farmacia

## Principio: No romper nada existente
- Todo será **condicional**: `businessMode === 'pharmacy'`
- Los campos nuevos son **opcionales** en Firestore
- Retail y Restaurant seguirán funcionando exactamente igual

---

## Fase 1: Infraestructura Base

### 1.1 Agregar opción "Farmacia" en Settings.jsx
- Nuevo radio button junto a Retail y Restaurant
- Icono: `Pill` de lucide-react
- Color: verde (`green-500`)
- Descripción: "Para farmacias, boticas y droguerías. Incluye: control de lotes, fechas de vencimiento, alertas de caducidad, código DIGEMID."

### 1.2 Actualizar AuthContext.jsx
- El `businessMode` ya soporta cualquier string, solo necesitamos que Sidebar lo reconozca

### 1.3 Actualizar Sidebar.jsx
- Crear `pharmacyMenuItems` similar a `retailMenuItems` y `restaurantMenuItems`
- Menú sugerido:
  - Dashboard
  - Punto de Venta
  - Productos (con campos de farmacia)
  - Inventario (con vista de lotes/vencimientos)
  - Vencimientos (página nueva - alertas)
  - Clientes
  - Comprobantes
  - Compras
  - Proveedores
  - Reportes
  - Configuración

---

## Fase 2: Campos de Productos para Farmacia

### 2.1 Actualizar Products.jsx
Agregar campos condicionales cuando `businessMode === 'pharmacy'`:

```javascript
// Campos nuevos (opcionales)
{
  codigoDIGEMID: string,      // Código registro sanitario
  principioActivo: string,    // Ej: "Paracetamol"
  concentracion: string,      // Ej: "500mg"
  presentacion: string,       // Ej: "Caja x 100 tabletas"
  laboratorio: string,        // Ej: "Bayer"
  requiereReceta: boolean,    // Si necesita receta médica
  controlado: boolean,        // Medicamento controlado
  temperaturaAlmacenamiento: string, // "Ambiente" | "Refrigerado"

  // Control de lotes (array)
  lotes: [
    {
      numeroLote: string,
      fechaVencimiento: Date,
      cantidad: number,
      fechaIngreso: Date
    }
  ]
}
```

### 2.2 UI en formulario de productos
- Sección "Información Farmacéutica" (solo visible en modo farmacia)
- Checkboxes para "Requiere Receta" y "Medicamento Controlado"
- Campo de lotes con fecha de vencimiento

---

## Fase 3: Control de Lotes y Vencimientos

### 3.1 Nueva página: Vencimientos.jsx
- Dashboard de productos próximos a vencer
- Filtros: 30, 60, 90 días
- Alertas visuales (rojo: vencido, amarillo: próximo, verde: ok)
- Exportar reporte a Excel

### 3.2 Actualizar Inventario para Farmacia
- Vista por lotes
- Columna de fecha de vencimiento
- Ordenar por fecha de vencimiento (más próximos primero)
- Badge de estado (vencido/próximo/ok)

---

## Fase 4: POS Adaptado para Farmacia

### 4.1 Búsqueda extendida
- Buscar por nombre comercial O principio activo
- Mostrar badge "Receta" en productos que la requieren

### 4.2 Validaciones en venta
- Si producto `requiereReceta === true`, mostrar modal para registrar:
  - Número de receta
  - Nombre del médico
  - Número de colegiatura
  - (Opcional, puede ser solo una confirmación)

### 4.3 Selección de lote
- Si el producto tiene múltiples lotes, sugerir el más próximo a vencer (FEFO: First Expire, First Out)
- Mostrar fecha de vencimiento en el item del carrito

---

## Fase 5: Reportes Específicos

### 5.1 Agregar a Reports.jsx (modo farmacia)
- Reporte de productos por vencer
- Reporte de ventas con receta
- Reporte de movimiento por lote
- Reporte formato DIGEMID (si aplica)

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Settings.jsx` | Agregar opción Farmacia |
| `src/components/Sidebar.jsx` | Agregar `pharmacyMenuItems` |
| `src/pages/Products.jsx` | Campos farmacéuticos condicionales |
| `src/pages/POS.jsx` | Búsqueda por principio activo, validación receta |
| `src/pages/Inventory.jsx` | Vista de lotes/vencimientos |
| `src/pages/Reports.jsx` | Reportes de farmacia |

## Archivos Nuevos

| Archivo | Descripción |
|---------|-------------|
| `src/pages/Expirations.jsx` | Dashboard de vencimientos |

---

## Orden de Implementación Sugerido

1. **Settings.jsx** - Agregar opción Farmacia (5 min)
2. **Sidebar.jsx** - Menú de farmacia (10 min)
3. **Products.jsx** - Campos básicos: DIGEMID, principio activo, requiere receta (30 min)
4. **Inventory.jsx** - Mostrar columna vencimiento (15 min)
5. **Expirations.jsx** - Página de alertas de vencimiento (45 min)
6. **POS.jsx** - Búsqueda por principio activo + badge receta (20 min)
7. **Reports.jsx** - Reportes de farmacia (30 min)

---

## Notas Importantes

- **No se modifica la estructura base de datos** - Solo se agregan campos opcionales
- **Retrocompatibilidad total** - Productos existentes no se ven afectados
- **El lote puede ser opcional** - No todas las farmacias manejan lotes, puede ser un campo simple de fecha de vencimiento por producto
