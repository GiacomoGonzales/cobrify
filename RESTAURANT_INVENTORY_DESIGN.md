# Sistema de Inventario y Recetas para Restaurantes

## Estructura de Datos

### 1. Ingredientes (Materia Prima)
```javascript
{
  id: "ing_001",
  name: "Arroz blanco",
  category: "granos", // granos, carnes, vegetales, lacteos, condimentos, bebidas, otros
  purchaseUnit: "kg", // kg, L, unidades, cajas
  currentStock: 45.5, // cantidad actual en la unidad de compra
  minimumStock: 10, // alerta cuando baja de esto
  averageCost: 3.20, // costo promedio por unidad de compra
  lastPurchasePrice: 3.50,
  lastPurchaseDate: timestamp,
  supplier: "Proveedor ABC",
  createdAt: timestamp,
  updatedAt: timestamp,
  businessId: "user_123"
}
```

### 2. Recetas (Composición de Platos)
```javascript
{
  id: "recipe_001",
  productId: "prod_123", // relacionado con el producto del menú
  productName: "Arroz con Pollo",
  ingredients: [
    {
      ingredientId: "ing_001",
      ingredientName: "Arroz blanco",
      quantity: 150, // cantidad necesaria
      unit: "g", // unidad de la receta
      cost: 0.48 // costo calculado
    },
    {
      ingredientId: "ing_002",
      ingredientName: "Pollo",
      quantity: 250,
      unit: "g",
      cost: 3.00
    }
  ],
  totalCost: 3.66, // costo total de ingredientes
  portions: 1, // porciones que produce esta receta
  preparationTime: 30, // minutos
  instructions: "Texto opcional con instrucciones",
  createdAt: timestamp,
  updatedAt: timestamp,
  businessId: "user_123"
}
```

### 3. Compras de Ingredientes
```javascript
{
  id: "purchase_001",
  ingredientId: "ing_001",
  ingredientName: "Arroz blanco",
  quantity: 25, // cantidad comprada
  unit: "kg",
  unitPrice: 3.20,
  totalCost: 80.00,
  supplier: "Proveedor ABC",
  invoiceNumber: "F001-123",
  purchaseDate: timestamp,
  createdAt: timestamp,
  businessId: "user_123"
}
```

### 4. Movimientos de Stock (Historial)
```javascript
{
  id: "movement_001",
  ingredientId: "ing_001",
  type: "purchase" | "sale" | "adjustment" | "waste",
  quantity: 150,
  unit: "g",
  reason: "Venta de Arroz con Pollo",
  relatedSaleId: "invoice_123", // si es por venta
  beforeStock: 25.5,
  afterStock: 25.35,
  createdAt: timestamp,
  businessId: "user_123"
}
```

## Conversión de Unidades

### Peso
- 1 kg = 1000 g
- 1 g = 0.001 kg

### Volumen
- 1 L = 1000 ml
- 1 ml = 0.001 L

### Unidades
- Sin conversión (unidades, cajas, etc.)

## Flujo de Trabajo

1. **Compra de Ingredientes**
   - Se registra la compra
   - Se actualiza el stock
   - Se calcula costo promedio

2. **Creación de Recetas**
   - Se asocian ingredientes a productos
   - Se calculan costos automáticamente
   - Se define cantidad por porción

3. **Venta de Productos**
   - Al vender un plato:
     - Se descuentan los ingredientes del stock
     - Se registra el movimiento
     - Se alerta si algún ingrediente llega a stock mínimo

4. **Reportes**
   - Ingredientes más usados
   - Platos más rentables
   - Alertas de stock bajo
   - Costo real vs precio de venta
