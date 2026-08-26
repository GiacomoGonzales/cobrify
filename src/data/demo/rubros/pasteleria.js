/**
 * Demo de PASTELERÍA.
 *
 * El rubro se distingue por lo que NO se ve en la vitrina: los insumos. Una
 * pastelería compra harina y azúcar por saco, produce tortas con una receta, y
 * cada torta que sale descuenta esos insumos del stock. Por eso este es el
 * primer rubro que trae `insumos` — es lo que hace que el módulo de Producción
 * tenga algo que mostrar.
 *
 * Va en modo retail (mostrador y pedidos por encargo), no restaurante: una
 * pastelería vende en vitrina, no atiende mesas. Para pastelería CON cafetería
 * y salón, el demo que corresponde es el de restaurante.
 */
export default {
  slug: 'pasteleria',
  nombre: 'Pastelería',
  businessMode: 'retail',

  negocio: {
    businessName: 'PASTELERÍA DULCE AURORA EIRL',
    ruc: '20545678912',
    address: 'Av. Benavides 2340, Miraflores',
    phone: '01-4478899',
    email: 'pedidos@dulceaurora.pe',
    website: 'www.dulceaurora.pe',
    companySlogan: 'TORTAS, POSTRES Y BOCADITOS POR ENCARGO — REPOSTERÍA ARTESANAL',
    catalogTagline: 'Tortas por encargo con 48 horas de anticipación',
    catalogWelcome: 'Endulzamos tus celebraciones. Pedidos por WhatsApp o desde el catálogo.',
    catalogColor: '#DB2777',
    catalogWhatsapp: '51987654321',
  },

  /**
   * Acá SÍ se quedan Insumos, Recetas y Producción: es el corazón del rubro
   * (una torta consume harina y azúcar del stock). Fuera las mesas y la
   * cocina de restaurante: se vende en vitrina y por encargo, no se atiende
   * salón.
   */
  menusOcultos: [
    'vet-agenda', 'tables', 'kitchen', 'orders', 'expiry-alerts',
    'batch-control', 'student-payments', 'loans', 'rappi-orders', 'meta-ads',
    'certificates', 'carrier-dispatch-guides', 'dispatch-guides',
    'my-schedule', 'attendance',
  ],

  almacenes: [
    { name: 'Vitrina y mostrador', location: 'Av. Benavides 2340, Miraflores' },
    { name: 'Cámara y despensa', location: 'Av. Benavides 2340, Miraflores' },
  ],

  categorias: [
    { id: 'cat-tortas', name: 'Tortas', parentId: null },
    { id: 'cat-postres', name: 'Postres individuales', parentId: null },
    { id: 'cat-bocaditos', name: 'Bocaditos', parentId: null },
    { id: 'cat-panaderia', name: 'Panadería', parentId: null },
    { id: 'cat-bebidas', name: 'Bebidas', parentId: null },
    { id: 'cat-encargo', name: 'Por encargo', parentId: 'cat-tortas' },
    { id: 'cat-vitrina', name: 'De vitrina', parentId: 'cat-tortas' },
  ],

  productos: [
    // — Tortas por encargo (el ticket alto del rubro) —
    { id: 'pa1', code: 'TOR-CHO-20', sku: 'TOR-CHO-20', name: 'Torta de chocolate 20 porciones', description: 'Bizcocho de cacao, manjar y fudge', price: 145.00, cost: 62.00, stock: 6, unit: 'UNIDAD', category: 'cat-encargo', ventaTipica: 1, minStock: 2 },
    { id: 'pa2', code: 'TOR-TRE-20', sku: 'TOR-TRE-20', name: 'Torta tres leches 20 porciones', price: 155.00, cost: 68.00, stock: 5, unit: 'UNIDAD', category: 'cat-encargo', ventaTipica: 1, minStock: 2 },
    { id: 'pa3', code: 'TOR-RED-30', sku: 'TOR-RED-30', name: 'Torta red velvet 30 porciones', price: 215.00, cost: 95.00, stock: 3, unit: 'UNIDAD', category: 'cat-encargo', ventaTipica: 1, minStock: 1 },
    { id: 'pa4', code: 'TOR-TEM-INF', sku: 'TOR-TEM-INF', name: 'Torta temática infantil personalizada', description: 'Diseño a pedido, mínimo 48 horas', price: 280.00, cost: 118.00, stock: 2, unit: 'UNIDAD', category: 'cat-encargo', ventaTipica: 1, minStock: 1 },

    // — Vitrina (rotación diaria) —
    { id: 'pa5', code: 'POR-TOR-CHO', sku: 'POR-TOR-CHO', barcode: '7753001000058', name: 'Porción de torta de chocolate', price: 12.00, cost: 4.20, stock: 40, unit: 'PORCION', category: 'cat-vitrina', ventaTipica: 3, minStock: 12 },
    { id: 'pa6', code: 'POR-CHE-FRE', sku: 'POR-CHE-FRE', barcode: '7753001000065', name: 'Porción de cheesecake de fresa', price: 14.00, cost: 5.10, stock: 32, unit: 'PORCION', category: 'cat-vitrina', ventaTipica: 3, minStock: 10 },
    { id: 'pa7', code: 'PIE-LIM-POR', sku: 'PIE-LIM-POR', name: 'Porción de pie de limón', price: 11.00, cost: 3.80, stock: 28, unit: 'PORCION', category: 'cat-vitrina', ventaTipica: 2, minStock: 10 },

    // — Postres individuales —
    { id: 'pa8', code: 'ALF-MAI-UNI', sku: 'ALF-MAI-UNI', barcode: '7753001000089', name: 'Alfajor de maicena grande', price: 4.50, cost: 1.40, stock: 120, unit: 'UNIDAD', category: 'cat-postres', ventaTipica: 6, minStock: 30 },
    { id: 'pa9', code: 'BRO-NUE-UNI', sku: 'BRO-NUE-UNI', barcode: '7753001000096', name: 'Brownie con nuez', price: 6.00, cost: 2.10, stock: 90, unit: 'UNIDAD', category: 'cat-postres', ventaTipica: 4, minStock: 25 },
    { id: 'pa10', code: 'CUP-VAI-UNI', sku: 'CUP-VAI-UNI', name: 'Cupcake decorado', price: 7.50, cost: 2.60, stock: 75, unit: 'UNIDAD', category: 'cat-postres', ventaTipica: 6, minStock: 24 },
    { id: 'pa11', code: 'SUS-LIM-VAS', sku: 'SUS-LIM-VAS', name: 'Suspiro a la limeña en vaso', price: 9.00, cost: 3.20, stock: 45, unit: 'VASO', category: 'cat-postres', ventaTipica: 3, minStock: 15 },

    // — Bocaditos (se venden por ciento: pedidos de empresa) —
    { id: 'pa12', code: 'BOC-DUL-CTO', sku: 'BOC-DUL-CTO', name: 'Ciento de bocaditos dulces', description: 'Surtido de 100 unidades', price: 190.00, cost: 82.00, stock: 8, unit: 'CIENTO', category: 'cat-bocaditos', ventaTipica: 1, minStock: 2 },
    { id: 'pa13', code: 'BOC-SAL-CTO', sku: 'BOC-SAL-CTO', name: 'Ciento de bocaditos salados', price: 210.00, cost: 95.00, stock: 6, unit: 'CIENTO', category: 'cat-bocaditos', ventaTipica: 1, minStock: 2 },

    // — Panadería —
    { id: 'pa14', code: 'PAN-CHA-UNI', sku: 'PAN-CHA-UNI', barcode: '7753001000140', name: 'Pan chapla artesanal', price: 0.80, cost: 0.28, stock: 300, unit: 'UNIDAD', category: 'cat-panaderia', ventaTipica: 12, minStock: 80 },
    { id: 'pa15', code: 'CRO-MAN-UNI', sku: 'CRO-MAN-UNI', barcode: '7753001000157', name: 'Croissant de mantequilla', price: 5.50, cost: 1.80, stock: 85, unit: 'UNIDAD', category: 'cat-panaderia', ventaTipica: 4, minStock: 20 },
    { id: 'pa16', code: 'EMP-CAR-UNI', sku: 'EMP-CAR-UNI', name: 'Empanada de carne', price: 7.00, cost: 2.40, stock: 60, unit: 'UNIDAD', category: 'cat-panaderia', ventaTipica: 3, minStock: 20 },

    // — Bebidas (acompañan la vitrina) —
    { id: 'pa17', code: 'CAF-PAS-TAZ', sku: 'CAF-PAS-TAZ', name: 'Café pasado en taza', price: 8.00, cost: 2.00, stock: null, trackStock: false, unit: 'TAZA', category: 'cat-bebidas', ventaTipica: 4 },
    { id: 'pa18', code: 'JUG-NAR-VAS', sku: 'JUG-NAR-VAS', name: 'Jugo de naranja natural', price: 10.00, cost: 3.50, stock: null, trackStock: false, unit: 'VASO', category: 'cat-bebidas', ventaTipica: 2 },
    { id: 'pa19', code: 'AGU-MIN-625', sku: 'AGU-MIN-625', barcode: '7753001000195', name: 'Agua mineral 625ml', price: 3.00, cost: 1.20, stock: 140, unit: 'UNIDAD', category: 'cat-bebidas', ventaTipica: 3, minStock: 40 },

    // — Servicio del rubro —
    { id: 'pa20', code: 'SER-DEL-TOR', name: 'Delivery de torta en Lima', description: 'Traslado refrigerado', price: 20.00, cost: 0, stock: null, trackStock: false, unit: 'SERVICIO', category: 'cat-encargo', ventaTipica: 1 },
  ],

  /**
   * Insumos: la materia prima que consumen las recetas. Es lo que distingue a
   * una pastelería de una tienda que solo revende.
   */
  insumos: [
    { id: 'ins1', name: 'Harina sin preparar', category: 'secos', purchaseUnit: 'kg', currentStock: 180, minimumStock: 50, averageCost: 3.60 },
    { id: 'ins2', name: 'Azúcar rubia', category: 'secos', purchaseUnit: 'kg', currentStock: 120, minimumStock: 40, averageCost: 4.20 },
    { id: 'ins3', name: 'Mantequilla sin sal', category: 'lácteos', purchaseUnit: 'kg', currentStock: 45, minimumStock: 15, averageCost: 28.00 },
    { id: 'ins4', name: 'Huevos', category: 'frescos', purchaseUnit: 'kg', currentStock: 60, minimumStock: 20, averageCost: 7.80 },
    { id: 'ins5', name: 'Leche evaporada', category: 'lácteos', purchaseUnit: 'lata', currentStock: 96, minimumStock: 24, averageCost: 4.10 },
    { id: 'ins6', name: 'Cacao en polvo', category: 'secos', purchaseUnit: 'kg', currentStock: 18, minimumStock: 6, averageCost: 32.00 },
    { id: 'ins7', name: 'Manjar blanco', category: 'preparados', purchaseUnit: 'kg', currentStock: 25, minimumStock: 10, averageCost: 14.50 },
    { id: 'ins8', name: 'Crema de leche', category: 'lácteos', purchaseUnit: 'litro', currentStock: 32, minimumStock: 12, averageCost: 12.90 },
    { id: 'ins9', name: 'Queso crema', category: 'lácteos', purchaseUnit: 'kg', currentStock: 22, minimumStock: 8, averageCost: 24.00 },
    { id: 'ins10', name: 'Fresas frescas', category: 'frescos', purchaseUnit: 'kg', currentStock: 14, minimumStock: 6, averageCost: 9.50 },
    { id: 'ins11', name: 'Levadura fresca', category: 'secos', purchaseUnit: 'kg', currentStock: 8, minimumStock: 3, averageCost: 11.00 },
    { id: 'ins12', name: 'Cajas para torta', category: 'empaque', purchaseUnit: 'unidad', currentStock: 150, minimumStock: 50, averageCost: 2.80 },
  ],

  clientes: [
    { id: 'c1', documentType: '6', documentNumber: '20604567891', name: 'EVENTOS Y CATERING LA CASONA SAC', email: 'compras@lacasonaeventos.pe', phone: '987363738', address: 'Av. La Molina 1450, La Molina' },
    { id: 'c2', documentType: '6', documentNumber: '20551234987', name: 'CORPORACIÓN EDUCATIVA SAN MARTÍN EIRL', email: 'administracion@cesanmartin.pe', phone: '987394041', address: 'Av. Angamos 890, Surquillo' },
    { id: 'c3', documentType: '1', documentNumber: '43219876', name: 'Claudia Mendoza Peña', phone: '987424344', address: 'Calle Berlín 340, Miraflores' },
    { id: 'c4', documentType: '1', documentNumber: '06543210', name: 'Fernando Ríos Zegarra', phone: '987454647', address: 'Av. Benavides 1890, Miraflores' },
    { id: 'c5', documentType: '1', documentNumber: '45123789', name: 'Gabriela Ponce Ubillús', phone: '987484950', address: 'Jr. Independencia 220, Barranco' },
  ],

  proveedores: [
    { id: 'p1', name: 'DISTRIBUIDORA DE INSUMOS PASTELEROS SAC', ruc: '20222333444', phone: '01-4443322', email: 'ventas@insumospasteleros.pe', address: 'Av. Nicolás Arriola 1200, La Victoria' },
    { id: 'p2', name: 'LÁCTEOS Y DERIVADOS DEL VALLE EIRL', ruc: '20555666777', phone: '01-6665544', email: 'pedidos@lacteosdelvalle.pe', address: 'Carretera Central Km 18, Chosica' },
    { id: 'p3', name: 'EMPAQUES Y DESCARTABLES LIMA SRL', ruc: '20888999111', phone: '01-8887766', email: 'contacto@empaqueslima.pe', address: 'Av. Colonial 2450, Callao' },
  ],

  gastos: [
    { category: 'servicios', description: 'Gas para hornos', amount: 380 },
    { category: 'transporte', description: 'Delivery de pedidos', amount: 520 },
  ],
}
