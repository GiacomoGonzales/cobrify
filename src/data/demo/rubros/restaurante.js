/**
 * Demo de RESTAURANTE.
 *
 * Es el rubro con más piezas propias: mesas con su mapa, mozos, órdenes
 * abiertas, comandas a cocina y recetas que descuentan insumos. El motor arma
 * el salón a partir de `salon` (zonas y mozos) y le abre orden a cada mesa
 * ocupada — una mesa ocupada sin orden ni monto deja el mapa en cero.
 */
export default {
  slug: 'restaurante',
  nombre: 'Restaurante',
  businessMode: 'restaurant',

  negocio: {
    businessName: 'RESTAURANTE EL SABOR NORTEÑO SAC',
    ruc: '20523456789',
    address: 'Av. La Marina 1820, San Miguel',
    phone: '01-5642233',
    email: 'reservas@elsabornorteno.pe',
    website: 'www.elsabornorteno.pe',
    companySlogan: 'COMIDA CRIOLLA Y MARINA — MENÚ DIARIO Y CARTA',
    catalogTagline: 'Nuestra carta, a un clic',
    catalogWelcome: 'Pide por WhatsApp o desde la carta digital. Delivery en San Miguel y alrededores.',
    catalogColor: '#B91C1C',
    catalogWhatsapp: '51987654321',
  },

  /**
   * Se quedan mesas, cocina, órdenes, recetas e insumos: son el rubro. Fuera
   * las citas, los lotes de farmacia y las guías de remisión — un restaurante
   * no despacha mercadería con guía.
   */
  menusOcultos: [
    'vet-agenda', 'expiry-alerts', 'batch-control', 'student-payments',
    'loans', 'meta-ads', 'certificates', 'carrier-dispatch-guides',
    'dispatch-guides', 'quotations', 'sellers',
  ],

  salon: {
    mozos: ['Carlos Rodríguez', 'María López', 'Jorge Aliaga'],
    zonas: [
      { nombre: 'Salón Principal', mesas: 8, capacidad: 4 },
      { nombre: 'Terraza', mesas: 4, capacidad: 6 },
      { nombre: 'Barra', mesas: 3, capacidad: 2 },
    ],
  },

  /** Delivery de la carta en la zona. */
  reparto: ['Brayan Mendoza', 'Kelly Ramos'],

  almacenes: [
    { name: 'Cocina', location: 'Av. La Marina 1820, San Miguel' },
    { name: 'Almacén y cámara', location: 'Av. La Marina 1820, San Miguel' },
  ],

  categorias: [
    { id: 'cat-entradas', name: 'Entradas', parentId: null },
    { id: 'cat-criollos', name: 'Platos criollos', parentId: null },
    { id: 'cat-marinos', name: 'Platos marinos', parentId: null },
    { id: 'cat-menu', name: 'Menú del día', parentId: null },
    { id: 'cat-bebidas', name: 'Bebidas', parentId: null },
    { id: 'cat-postres', name: 'Postres', parentId: null },
  ],

  productos: [
    // — Entradas —
    { id: 'r1', code: 'ENT-PAP-HUA', name: 'Papa a la huancaína', price: 16.00, cost: 5.20, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-entradas', ventaTipica: 2 },
    { id: 'r2', code: 'ENT-CAU-LIM', imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=400&fit=crop', name: 'Causa limeña de pollo', price: 19.00, cost: 6.40, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-entradas', ventaTipica: 2 },
    { id: 'r3', code: 'ENT-ANT-COR', name: 'Anticuchos de corazón', price: 24.00, cost: 9.80, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-entradas', ventaTipica: 2 },

    // — Marinos (los que más pesan en la carta) —
    { id: 'r4', code: 'MAR-CEV-PES', imageUrl: 'https://images.unsplash.com/photo-1535399831218-d5bd36d1a6b3?w=400&h=400&fit=crop', name: 'Ceviche de pescado', description: 'Pescado del día, camote y choclo', price: 38.00, cost: 15.50, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-marinos', ventaTipica: 2 },
    { id: 'r5', code: 'MAR-CEV-MIX', imageUrl: 'https://images.unsplash.com/photo-1535399831218-d5bd36d1a6b3?w=400&h=400&fit=crop', name: 'Ceviche mixto', price: 45.00, cost: 19.00, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-marinos', ventaTipica: 2 },
    { id: 'r6', code: 'MAR-ARR-MAR', name: 'Arroz con mariscos', price: 42.00, cost: 17.80, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-marinos', ventaTipica: 2 },
    { id: 'r7', code: 'MAR-JAL-MIX', name: 'Jalea mixta', price: 52.00, cost: 22.00, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-marinos', ventaTipica: 1 },
    { id: 'r8', code: 'MAR-CHI-PES', name: 'Chicharrón de pescado', price: 36.00, cost: 14.50, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-marinos', ventaTipica: 2 },

    // — Criollos —
    { id: 'r9', code: 'CRI-LOM-SAL', imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop', name: 'Lomo saltado', price: 39.00, cost: 16.20, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-criollos', ventaTipica: 2 },
    { id: 'r10', code: 'CRI-AJI-GAL', imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=400&fit=crop', name: 'Ají de gallina', price: 28.00, cost: 10.40, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-criollos', ventaTipica: 2 },
    { id: 'r11', code: 'CRI-ARR-POL', imageUrl: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=400&fit=crop', name: 'Arroz con pollo', price: 26.00, cost: 9.60, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-criollos', ventaTipica: 2 },
    { id: 'r12', code: 'CRI-SEC-CAB', name: 'Seco de cabrito con frejoles', price: 44.00, cost: 18.50, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-criollos', ventaTipica: 1 },
    { id: 'r13', code: 'CRI-TAL-VER', name: 'Tallarín verde con bistec', price: 32.00, cost: 12.80, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-criollos', ventaTipica: 2 },

    // — Menú del día (el volumen de un restaurante de barrio) —
    { id: 'r14', code: 'MEN-DIA-COM', name: 'Menú del día completo', description: 'Entrada, segundo y refresco', price: 15.00, cost: 5.80, stock: null, trackStock: false, unit: 'MENU', category: 'cat-menu', ventaTipica: 4 },
    { id: 'r15', code: 'MEN-DIA-SEG', name: 'Segundo solo', price: 12.00, cost: 4.90, stock: null, trackStock: false, unit: 'PLATO', category: 'cat-menu', ventaTipica: 3 },

    // — Bebidas (SÍ llevan stock: son botellas) —
    { id: 'r16', code: 'BEB-INC-500', imageUrl: 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?w=400&h=400&fit=crop', sku: 'BEB-INC-500', barcode: '7754001000165', name: 'Inca Kola 500ml', price: 6.00, cost: 2.60, stock: 180, unit: 'UNIDAD', category: 'cat-bebidas', ventaTipica: 4, minStock: 48 },
    { id: 'r17', code: 'BEB-CHI-JAR', imageUrl: 'https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=400&h=400&fit=crop', name: 'Chicha morada jarra 1L', price: 14.00, cost: 4.20, stock: null, trackStock: false, unit: 'JARRA', category: 'cat-bebidas', ventaTipica: 2 },
    { id: 'r18', code: 'BEB-CER-PIL', sku: 'BEB-CER-PIL', barcode: '7754001000189', name: 'Cerveza Pilsen 620ml', price: 12.00, cost: 6.40, stock: 120, unit: 'UNIDAD', category: 'cat-bebidas', ventaTipica: 3, minStock: 36 },
    { id: 'r19', code: 'BEB-AGU-625', sku: 'BEB-AGU-625', barcode: '7754001000196', name: 'Agua mineral 625ml', price: 4.00, cost: 1.20, stock: 150, unit: 'UNIDAD', category: 'cat-bebidas', ventaTipica: 3, minStock: 40 },

    // — Postres —
    { id: 'r20', code: 'POS-SUS-LIM', imageUrl: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop', name: 'Suspiro a la limeña', price: 12.00, cost: 4.10, stock: null, trackStock: false, unit: 'PORCION', category: 'cat-postres', ventaTipica: 2 },
    { id: 'r21', code: 'POS-ARR-ZAM', name: 'Arroz zambito', price: 10.00, cost: 3.20, stock: null, trackStock: false, unit: 'PORCION', category: 'cat-postres', ventaTipica: 2 },
  ],

  /** Los insumos que consumen las recetas de la cocina. */
  insumos: [
    { id: 'ing1', name: 'Arroz', category: 'granos', purchaseUnit: 'kg', currentStock: 85, minimumStock: 25, averageCost: 3.80 },
    { id: 'ing2', name: 'Pescado (filete)', category: 'carnes', purchaseUnit: 'kg', currentStock: 24, minimumStock: 10, averageCost: 22.00 },
    { id: 'ing3', name: 'Mariscos surtidos', category: 'carnes', purchaseUnit: 'kg', currentStock: 16, minimumStock: 8, averageCost: 28.50 },
    { id: 'ing4', name: 'Pollo', category: 'carnes', purchaseUnit: 'kg', currentStock: 40, minimumStock: 15, averageCost: 9.20 },
    { id: 'ing5', name: 'Carne de res', category: 'carnes', purchaseUnit: 'kg', currentStock: 28, minimumStock: 12, averageCost: 24.00 },
    { id: 'ing6', name: 'Papa amarilla', category: 'verduras', purchaseUnit: 'kg', currentStock: 60, minimumStock: 20, averageCost: 3.40 },
    { id: 'ing7', name: 'Cebolla roja', category: 'verduras', purchaseUnit: 'kg', currentStock: 45, minimumStock: 15, averageCost: 2.80 },
    { id: 'ing8', name: 'Limón', category: 'verduras', purchaseUnit: 'kg', currentStock: 32, minimumStock: 12, averageCost: 4.50 },
    { id: 'ing9', name: 'Ají amarillo', category: 'verduras', purchaseUnit: 'kg', currentStock: 14, minimumStock: 5, averageCost: 8.00 },
    { id: 'ing10', name: 'Aceite vegetal', category: 'abarrotes', purchaseUnit: 'litro', currentStock: 38, minimumStock: 12, averageCost: 8.90 },
    { id: 'ing11', name: 'Camote', category: 'verduras', purchaseUnit: 'kg', currentStock: 26, minimumStock: 10, averageCost: 2.60 },
    { id: 'ing12', name: 'Choclo desgranado', category: 'verduras', purchaseUnit: 'kg', currentStock: 18, minimumStock: 8, averageCost: 5.20 },
  ],

  clientes: [
    { id: 'c1', documentType: '6', documentNumber: '20605678912', name: 'CONSULTORA EMPRESARIAL DEL PACÍFICO SAC', email: 'admin@consultorapacifico.pe', phone: '987515253', address: 'Av. La Marina 2500, San Miguel' },
    { id: 'c2', documentType: '6', documentNumber: '20558912345', name: 'CLÍNICA SAN GABRIEL EIRL', email: 'logistica@clinicasangabriel.pe', phone: '987545556', address: 'Av. Universitaria 3400, San Miguel' },
    { id: 'c3', documentType: '1', documentNumber: '42345678', name: 'Rocío Delgado Fuentes', phone: '987575859', address: 'Jr. Chira 240, San Miguel' },
    { id: 'c4', documentType: '1', documentNumber: '05678901', name: 'Álvaro Benites Cruz', phone: '987606162', address: 'Av. Precursores 890, San Miguel' },
    { id: 'c5', documentType: '1', documentNumber: '44567890', name: 'Milagros Paredes León', phone: '987636465', address: 'Calle Mantaro 130, Pueblo Libre' },
  ],

  proveedores: [
    { id: 'p1', name: 'TERMINAL PESQUERO VILLA MARÍA SAC', ruc: '20333444555', phone: '01-2223344', email: 'ventas@pesqueravm.pe', address: 'Terminal Pesquero, Villa María del Triunfo' },
    { id: 'p2', name: 'DISTRIBUIDORA DE ABARROTES EL MAYORISTA EIRL', ruc: '20666777888', phone: '01-4445566', email: 'pedidos@elmayorista.pe', address: 'Mercado Mayorista, Santa Anita' },
    { id: 'p3', name: 'BEBIDAS Y LICORES DEL PERÚ SRL', ruc: '20999111222', phone: '01-6667788', email: 'contacto@bebidasperu.pe', address: 'Av. Argentina 3100, Callao' },
  ],

  gastos: [
    { category: 'servicios', description: 'Gas para cocina', amount: 620 },
    { category: 'planilla', description: 'Sueldo de cocineros y mozos', amount: 3800 },
    { category: 'otros', description: 'Menaje y descartables', amount: 340 },
  ],
}
