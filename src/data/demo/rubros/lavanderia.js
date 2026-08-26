/**
 * Demo de LAVANDERÍA.
 *
 * Es el rubro más distinto de todos: casi no vende productos, vende SERVICIOS.
 * Por eso la mayoría del catálogo va con `trackStock: false` — no tiene sentido
 * llevar inventario de "lavado por kilo". Lo que sí lleva stock son los
 * insumos (detergente, suavizante) y los pocos productos de mostrador.
 *
 * Sirve para mostrar que el sistema no es solo para quien mueve mercadería.
 */
export default {
  slug: 'lavanderia',
  nombre: 'Lavandería',
  businessMode: 'retail',

  negocio: {
    businessName: 'LAVANDERÍA BURBUJAS EXPRESS EIRL',
    ruc: '20591234567',
    address: 'Av. Aviación 2860, San Borja',
    phone: '01-2264488',
    email: 'contacto@burbujasexpress.pe',
    website: 'www.burbujasexpress.pe',
    companySlogan: 'LAVADO, PLANCHADO Y TINTORERÍA — RECOJO Y ENTREGA A DOMICILIO',
    catalogTagline: 'Tu ropa lista en 24 horas',
    catalogWelcome: 'Recojo y entrega a domicilio en San Borja, Surco y La Victoria.',
    catalogColor: '#0284C7',
    catalogWhatsapp: '51987654321',
  },

  /**
   * Un negocio de servicios no cocina, no produce ni maneja lotes. Se quedan
   * Envíos (recojo y entrega a domicilio, que es medio negocio), Insumos y
   * las Cotizaciones para los contratos con hoteles.
   */
  menusOcultos: [
    'vet-agenda', 'tables', 'kitchen', 'orders', 'recipes', 'production',
    'purchase-history', 'requirements', 'expiry-alerts', 'batch-control',
    'student-payments', 'loans', 'rappi-orders', 'meta-ads', 'certificates',
    'carrier-dispatch-guides', 'dispatch-guides', 'my-schedule', 'attendance',
  ],

  reparto: ['Julio Espinoza', 'Marisol Tapia'],

  almacenes: [
    { name: 'Mostrador', location: 'Av. Aviación 2860, San Borja' },
    { name: 'Depósito de insumos', location: 'Av. Aviación 2860, San Borja' },
  ],

  categorias: [
    { id: 'cat-lavado', name: 'Lavado', parentId: null },
    { id: 'cat-planchado', name: 'Planchado', parentId: null },
    { id: 'cat-tintoreria', name: 'Tintorería', parentId: null },
    { id: 'cat-especiales', name: 'Prendas especiales', parentId: null },
    { id: 'cat-hogar', name: 'Ropa de hogar', parentId: null },
    { id: 'cat-productos', name: 'Productos', parentId: null },
  ],

  productos: [
    // — Lavado por kilo: el servicio que sostiene el negocio —
    { id: 'lv1', code: 'LAV-KIL-STD', imageUrl: 'https://images.unsplash.com/photo-1648627667032-d02d79b28066?w=400&h=400&fit=crop', name: 'Lavado por kilo', description: 'Lavado, secado y doblado. Mínimo 3 kilos', price: 9.00, cost: 3.10, stock: null, trackStock: false, unit: 'KG', category: 'cat-lavado', ventaTipica: 6 },
    { id: 'lv2', code: 'LAV-KIL-EXP', imageUrl: 'https://images.unsplash.com/photo-1611878821586-eb39c951c236?w=400&h=400&fit=crop', name: 'Lavado express por kilo', description: 'Entrega en 6 horas', price: 14.00, cost: 4.80, stock: null, trackStock: false, unit: 'KG', category: 'cat-lavado', ventaTipica: 4 },
    { id: 'lv3', code: 'LAV-KIL-DEL', name: 'Lavado delicado por kilo', description: 'Agua fría, ciclo suave', price: 16.00, cost: 5.60, stock: null, trackStock: false, unit: 'KG', category: 'cat-lavado', ventaTipica: 3 },
    { id: 'lv4', code: 'LAV-SEC-KIL', name: 'Solo secado por kilo', price: 5.00, cost: 1.70, stock: null, trackStock: false, unit: 'KG', category: 'cat-lavado', ventaTipica: 5 },

    // — Planchado —
    { id: 'lv5', code: 'PLA-CAM-UNI', imageUrl: 'https://images.unsplash.com/photo-1764117379509-6d1e3e966cc0?w=400&h=400&fit=crop', name: 'Planchado de camisa', price: 6.00, cost: 1.80, stock: null, trackStock: false, unit: 'PRENDA', category: 'cat-planchado', ventaTipica: 5 },
    { id: 'lv6', code: 'PLA-PAN-UNI', name: 'Planchado de pantalón', price: 7.00, cost: 2.10, stock: null, trackStock: false, unit: 'PRENDA', category: 'cat-planchado', ventaTipica: 4 },
    { id: 'lv7', code: 'PLA-KIL-GEN', name: 'Planchado por kilo', price: 12.00, cost: 4.00, stock: null, trackStock: false, unit: 'KG', category: 'cat-planchado', ventaTipica: 3 },

    // — Tintorería (lavado en seco: el ticket alto) —
    { id: 'lv8', code: 'TIN-TER-2PZ', imageUrl: 'https://images.unsplash.com/photo-1775210727648-9456f74dee90?w=400&h=400&fit=crop', name: 'Terno 2 piezas en seco', price: 45.00, cost: 15.00, stock: null, trackStock: false, unit: 'PRENDA', category: 'cat-tintoreria', ventaTipica: 1 },
    { id: 'lv9', code: 'TIN-SAC-UNI', name: 'Saco o blazer en seco', price: 28.00, cost: 9.40, stock: null, trackStock: false, unit: 'PRENDA', category: 'cat-tintoreria', ventaTipica: 1 },
    { id: 'lv10', code: 'TIN-ABR-UNI', name: 'Abrigo en seco', price: 38.00, cost: 12.80, stock: null, trackStock: false, unit: 'PRENDA', category: 'cat-tintoreria', ventaTipica: 1 },
    { id: 'lv11', code: 'TIN-COR-UNI', name: 'Corbata en seco', price: 12.00, cost: 3.60, stock: null, trackStock: false, unit: 'PRENDA', category: 'cat-tintoreria', ventaTipica: 2 },

    // — Prendas especiales —
    { id: 'lv12', code: 'ESP-VES-NOV', name: 'Vestido de novia', description: 'Incluye funda y percha especial', price: 180.00, cost: 62.00, stock: null, trackStock: false, unit: 'PRENDA', category: 'cat-especiales', ventaTipica: 1 },
    { id: 'lv13', code: 'ESP-VES-FIE', name: 'Vestido de fiesta', price: 65.00, cost: 22.00, stock: null, trackStock: false, unit: 'PRENDA', category: 'cat-especiales', ventaTipica: 1 },
    { id: 'lv14', code: 'ESP-CUE-CHA', name: 'Chaqueta de cuero', price: 85.00, cost: 30.00, stock: null, trackStock: false, unit: 'PRENDA', category: 'cat-especiales', ventaTipica: 1 },
    { id: 'lv15', code: 'ESP-ZAP-LIM', name: 'Limpieza de zapatillas', price: 35.00, cost: 11.00, stock: null, trackStock: false, unit: 'PAR', category: 'cat-especiales', ventaTipica: 1 },

    // — Ropa de hogar (lo que traen los hoteles y las familias) —
    { id: 'lv16', code: 'HOG-EDR-2PL', name: 'Edredón 2 plazas', price: 42.00, cost: 14.50, stock: null, trackStock: false, unit: 'UNIDAD', category: 'cat-hogar', ventaTipica: 1 },
    { id: 'lv17', code: 'HOG-COB-1PL', name: 'Cobertor 1 plaza', price: 28.00, cost: 9.60, stock: null, trackStock: false, unit: 'UNIDAD', category: 'cat-hogar', ventaTipica: 2 },
    { id: 'lv18', code: 'HOG-JUE-SAB', name: 'Juego de sábanas', price: 22.00, cost: 7.40, stock: null, trackStock: false, unit: 'JUEGO', category: 'cat-hogar', ventaTipica: 2 },
    { id: 'lv19', code: 'HOG-COR-M2', name: 'Cortinas por m²', price: 18.00, cost: 6.20, stock: null, trackStock: false, unit: 'M2', category: 'cat-hogar', ventaTipica: 3 },
    { id: 'lv20', code: 'HOG-ALF-M2', name: 'Alfombras por m²', price: 25.00, cost: 8.80, stock: null, trackStock: false, unit: 'M2', category: 'cat-hogar', ventaTipica: 2 },

    // — Productos de mostrador: lo único con stock de verdad —
    { id: 'lv21', code: 'PRO-DET-1L', sku: 'PRO-DET-1L', barcode: '7758001000215', name: 'Detergente líquido 1L', price: 18.00, cost: 11.00, stock: 60, unit: 'UNIDAD', category: 'cat-productos', ventaTipica: 1, minStock: 15 },
    { id: 'lv22', code: 'PRO-SUA-900', sku: 'PRO-SUA-900', barcode: '7758001000222', name: 'Suavizante 900ml', price: 14.00, cost: 8.40, stock: 55, unit: 'UNIDAD', category: 'cat-productos', ventaTipica: 1, minStock: 15 },
    { id: 'lv23', code: 'PRO-QUI-MAN', name: 'Quitamanchas en barra', price: 9.50, cost: 5.20, stock: 80, unit: 'UNIDAD', category: 'cat-productos', ventaTipica: 2, minStock: 20 },
    { id: 'lv24', code: 'PRO-BOL-ROP', name: 'Bolsa de tela reutilizable', price: 12.00, cost: 6.00, stock: 45, unit: 'UNIDAD', category: 'cat-productos', ventaTipica: 1, minStock: 12 },

    // — Recojo y entrega: se cobra aparte fuera de la zona —
    { id: 'lv25', code: 'SER-REC-DOM', name: 'Recojo y entrega a domicilio', price: 8.00, cost: 0, stock: null, trackStock: false, unit: 'SERVICIO', category: 'cat-lavado', ventaTipica: 1 },
  ],

  /** Lo que se consume lavando: acá sí hay stock que controlar. */
  insumos: [
    { id: 'lvi1', name: 'Detergente industrial', category: 'quimicos', purchaseUnit: 'kg', currentStock: 180, minimumStock: 60, averageCost: 8.90 },
    { id: 'lvi2', name: 'Suavizante industrial', category: 'quimicos', purchaseUnit: 'litro', currentStock: 120, minimumStock: 40, averageCost: 7.40 },
    { id: 'lvi3', name: 'Percloroetileno (lavado en seco)', category: 'quimicos', purchaseUnit: 'litro', currentStock: 45, minimumStock: 20, averageCost: 26.00 },
    { id: 'lvi4', name: 'Quitamanchas profesional', category: 'quimicos', purchaseUnit: 'litro', currentStock: 28, minimumStock: 10, averageCost: 18.50 },
    { id: 'lvi5', name: 'Blanqueador sin cloro', category: 'quimicos', purchaseUnit: 'litro', currentStock: 60, minimumStock: 20, averageCost: 6.20 },
    { id: 'lvi6', name: 'Almidón para planchado', category: 'quimicos', purchaseUnit: 'litro', currentStock: 22, minimumStock: 8, averageCost: 9.80 },
    { id: 'lvi7', name: 'Ganchos de alambre', category: 'empaque', purchaseUnit: 'unidad', currentStock: 1200, minimumStock: 400, averageCost: 0.22 },
    { id: 'lvi8', name: 'Fundas plásticas para prendas', category: 'empaque', purchaseUnit: 'unidad', currentStock: 800, minimumStock: 250, averageCost: 0.35 },
  ],

  clientes: [
    { id: 'c1', documentType: '6', documentNumber: '20609123456', name: 'HOTEL BOUTIQUE LA CASONA SAC', email: 'housekeeping@hotellacasona.pe', phone: '987080910', address: 'Calle Los Nogales 220, San Borja' },
    { id: 'c2', documentType: '6', documentNumber: '20561234567', name: 'CLÍNICA DENTAL SONRISAS EIRL', email: 'admin@clinicasonrisas.pe', phone: '987111213', address: 'Av. San Luis 1980, San Borja' },
    { id: 'c3', documentType: '6', documentNumber: '20523456789', name: 'RESTAURANTE MAR Y TIERRA SRL', email: 'gerencia@marytierra.pe', phone: '987141516', address: 'Av. Aviación 3200, San Borja' },
    { id: 'c4', documentType: '1', documentNumber: '45012345', name: 'Cecilia Núñez Barrantes', phone: '987171819', address: 'Av. San Borja Norte 640, San Borja' },
    { id: 'c5', documentType: '1', documentNumber: '01234567', name: 'Arturo Meléndez Soto', phone: '987202122', address: 'Calle Las Artes Sur 380, San Borja' },
  ],

  proveedores: [
    { id: 'p1', name: 'QUÍMICOS INDUSTRIALES DEL PERÚ SAC', ruc: '20556677001', phone: '01-4442200', email: 'ventas@quimicosperu.pe', address: 'Av. Argentina 3400, Callao' },
    { id: 'p2', name: 'SUMINISTROS PARA LAVANDERÍA EIRL', ruc: '20889900112', phone: '01-6663300', email: 'pedidos@sumlavanderia.pe', address: 'Av. Colonial 1720, Lima' },
    { id: 'p3', name: 'EMPAQUES Y GANCHOS LIMA SRL', ruc: '20223344556', phone: '01-8884400', email: 'contacto@empaqueslima.pe', address: 'Jr. Huaraz 890, Breña' },
  ],

  gastos: [
    { category: 'servicios', description: 'Agua y desagüe', amount: 780 },
    { category: 'servicios', description: 'Electricidad de secadoras', amount: 1250 },
    { category: 'otros', description: 'Mantenimiento de máquinas', amount: 420 },
  ],
}
