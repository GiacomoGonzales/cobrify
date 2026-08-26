/**
 * Demo de FERRETERÍA.
 *
 * Solo lo que distingue al rubro: el motor (../motor.js) arma con esto las
 * ventas, compras, cotizaciones y gastos.
 *
 * `ventaTipica` es cuántas unidades se llevan de una: de una bolsa de cemento
 * salen ocho, de un taladro sale uno. Sin ese dato las ventas generadas
 * quedaban irreales.
 */
export default {
  slug: 'ferreteria',
  nombre: 'Ferretería',
  businessMode: 'retail',

  negocio: {
    businessName: 'FERRETERÍA EL CONSTRUCTOR SAC',
    ruc: '20512345678',
    address: 'Av. Los Constructores 1450, Ate',
    phone: '01-3456789',
    email: 'ventas@elconstructor.pe',
    website: 'www.elconstructor.pe',
    companySlogan: 'MATERIALES DE CONSTRUCCIÓN, HERRAMIENTAS Y ACABADOS',
    catalogTagline: 'Todo para tu obra en un solo lugar',
    catalogWelcome: 'Materiales, herramientas y acabados con entrega a obra.',
    catalogColor: '#EA580C',
    catalogWhatsapp: '51987654321',
  },

  /**
   * Módulos que NO tienen sentido en el rubro. Una ferretería no agenda citas
   * ni cocina: verlos en el menú le dice al lead "esto no es para mí".
   * Se queda todo lo demás, incluidas guías de remisión (reparto a obra) y
   * cotizaciones, que en ferretería son el pan de cada día.
   */
  menusOcultos: [
    'vet-agenda', 'tables', 'kitchen', 'orders', 'recipes', 'production',
    'ingredients', 'purchase-history', 'requirements', 'expiry-alerts',
    'batch-control', 'student-payments', 'loans', 'rappi-orders', 'meta-ads',
    'certificates', 'my-schedule', 'attendance',
  ],

  /** Reparte a obra: la ferretería vive del despacho de material. */
  reparto: ['Luis Quispe', 'Marco Tello'],

  almacenes: [
    { name: 'Almacén Principal', location: 'Av. Los Constructores 1450, Ate' },
    { name: 'Tienda Mostrador', location: 'Av. Los Constructores 1450, Ate' },
  ],

  categorias: [
    { id: 'cat-construccion', name: 'Construcción', parentId: null },
    { id: 'cat-herramientas', name: 'Herramientas', parentId: null },
    { id: 'cat-electricidad', name: 'Electricidad', parentId: null },
    { id: 'cat-gasfiteria', name: 'Gasfitería', parentId: null },
    { id: 'cat-pinturas', name: 'Pinturas y acabados', parentId: null },
    { id: 'cat-manuales', name: 'Manuales', parentId: 'cat-herramientas' },
    { id: 'cat-electricas', name: 'Eléctricas', parentId: 'cat-herramientas' },
  ],

  productos: [
    // — Construcción (alta rotación, se venden por bulto) —
    { id: 'f1', code: 'CEM-SOL-42', sku: 'CEM-SOL-42', barcode: '7750182000012', name: 'Cemento Sol Tipo I 42.5 kg', description: 'Bolsa de 42.5 kg', price: 32.90, cost: 27.50, stock: 240, unit: 'BOLSA', category: 'cat-construccion', ventaTipica: 10, minStock: 40 },
    { id: 'f2', code: 'FIE-1-2', sku: 'FIE-1-2', barcode: '7750182000029', name: 'Fierro corrugado 1/2" x 9m', description: 'Varilla de acero corrugado', price: 38.50, cost: 32.00, stock: 180, unit: 'UNIDAD', category: 'cat-construccion', ventaTipica: 6, minStock: 30 },
    { id: 'f3', code: 'LAD-KK-18', sku: 'LAD-KK-18', barcode: '7750182000036', name: 'Ladrillo King Kong 18 huecos', description: 'Unidad', price: 1.20, cost: 0.85, stock: 5000, unit: 'UNIDAD', category: 'cat-construccion', ventaTipica: 100, minStock: 500 },
    { id: 'f4', code: 'ARE-GRU-M3', sku: 'ARE-GRU-M3', name: 'Arena gruesa x m³', description: 'Metro cúbico puesto en obra', price: 75.00, cost: 55.00, stock: 30, unit: 'M3', category: 'cat-construccion', ventaTipica: 2, minStock: 5 },
    { id: 'f5', code: 'YES-SIN-25', sku: 'YES-SIN-25', barcode: '7750182000043', name: 'Yeso Sinttac 25 kg', price: 18.50, cost: 14.00, stock: 90, unit: 'BOLSA', category: 'cat-construccion', ventaTipica: 4, minStock: 20 },

    // — Herramientas eléctricas (ticket alto) —
    { id: 'f6', code: 'TAL-BOS-13', sku: 'TAL-BOS-13', barcode: '7750182000050', name: 'Taladro percutor Bosch 1/2" 750W', description: 'Con maletín y juego de brocas', price: 389.00, cost: 295.00, stock: 12, unit: 'UNIDAD', category: 'cat-electricas', ventaTipica: 1, minStock: 3 },
    { id: 'f7', code: 'AMO-DEW-45', sku: 'AMO-DEW-45', barcode: '7750182000067', name: 'Amoladora DeWalt 4 1/2" 900W', price: 445.00, cost: 340.00, stock: 8, unit: 'UNIDAD', category: 'cat-electricas', ventaTipica: 1, minStock: 2 },
    { id: 'f8', code: 'SIE-STA-CIR', sku: 'SIE-STA-CIR', name: 'Sierra circular Stanley 7 1/4"', price: 529.00, cost: 410.00, stock: 5, unit: 'UNIDAD', category: 'cat-electricas', ventaTipica: 1, minStock: 2 },

    // — Herramientas manuales —
    { id: 'f9', code: 'MAR-UNA-16', sku: 'MAR-UNA-16', barcode: '7750182000074', name: 'Martillo uña 16 oz mango fibra', price: 42.00, cost: 28.00, stock: 45, unit: 'UNIDAD', category: 'cat-manuales', ventaTipica: 2, minStock: 10 },
    { id: 'f10', code: 'JUE-LLA-8', sku: 'JUE-LLA-8', name: 'Juego de llaves mixtas 8 piezas', price: 89.00, cost: 62.00, stock: 22, unit: 'JUEGO', category: 'cat-manuales', ventaTipica: 1, minStock: 5 },
    { id: 'f11', code: 'CIN-MET-5', sku: 'CIN-MET-5', barcode: '7750182000081', name: 'Cinta métrica 5m Stanley', price: 24.90, cost: 15.00, stock: 60, unit: 'UNIDAD', category: 'cat-manuales', ventaTipica: 2, minStock: 15 },
    { id: 'f12', code: 'ESC-ALU-7', sku: 'ESC-ALU-7', name: 'Escalera de aluminio 7 pasos', price: 189.00, cost: 138.00, stock: 9, unit: 'UNIDAD', category: 'cat-manuales', ventaTipica: 1, minStock: 3 },

    // — Electricidad —
    { id: 'f13', code: 'CAB-THW-14', sku: 'CAB-THW-14', barcode: '7750182000098', name: 'Cable THW 14 AWG x 100m', description: 'Rollo Indeco', price: 165.00, cost: 128.00, stock: 34, unit: 'ROLLO', category: 'cat-electricidad', ventaTipica: 2, minStock: 8 },
    { id: 'f14', code: 'INT-SIM-BTI', sku: 'INT-SIM-BTI', name: 'Interruptor simple Bticino', price: 12.50, cost: 7.80, stock: 150, unit: 'UNIDAD', category: 'cat-electricidad', ventaTipica: 6, minStock: 40 },
    { id: 'f15', code: 'FOC-LED-12', sku: 'FOC-LED-12', barcode: '7750182000104', name: 'Foco LED 12W luz fría', price: 8.90, cost: 4.50, stock: 320, unit: 'UNIDAD', category: 'cat-electricidad', ventaTipica: 8, minStock: 60 },
    { id: 'f16', code: 'TAB-DIS-8', sku: 'TAB-DIS-8', name: 'Tablero de distribución 8 polos', price: 78.00, cost: 55.00, stock: 16, unit: 'UNIDAD', category: 'cat-electricidad', ventaTipica: 1, minStock: 4 },

    // — Gasfitería —
    { id: 'f17', code: 'TUB-PVC-4', sku: 'TUB-PVC-4', barcode: '7750182000111', name: 'Tubo PVC desagüe 4" x 3m', price: 28.50, cost: 20.00, stock: 120, unit: 'UNIDAD', category: 'cat-gasfiteria', ventaTipica: 5, minStock: 25 },
    { id: 'f18', code: 'LLA-PAS-1-2', sku: 'LLA-PAS-1-2', name: 'Llave de paso 1/2" bronce', price: 22.00, cost: 13.50, stock: 85, unit: 'UNIDAD', category: 'cat-gasfiteria', ventaTipica: 3, minStock: 20 },
    { id: 'f19', code: 'PEG-PVC-1-4', sku: 'PEG-PVC-1-4', barcode: '7750182000128', name: 'Pegamento PVC 1/4 gl', price: 26.90, cost: 18.00, stock: 48, unit: 'UNIDAD', category: 'cat-gasfiteria', ventaTipica: 2, minStock: 12 },
    { id: 'f20', code: 'GRI-LAV-CRO', sku: 'GRI-LAV-CRO', name: 'Grifería para lavatorio cromada', price: 119.00, cost: 82.00, stock: 18, unit: 'UNIDAD', category: 'cat-gasfiteria', ventaTipica: 1, minStock: 5 },

    // — Pinturas —
    { id: 'f21', code: 'PIN-LAT-GL', sku: 'PIN-LAT-GL', barcode: '7750182000135', name: 'Pintura látex American Colors 1 gl', description: 'Blanco humo', price: 62.00, cost: 44.00, stock: 75, unit: 'GALON', category: 'cat-pinturas', ventaTipica: 3, minStock: 15 },
    { id: 'f22', code: 'THI-ACR-GL', sku: 'THI-ACR-GL', name: 'Thinner acrílico 1 gl', price: 34.00, cost: 24.00, stock: 40, unit: 'GALON', category: 'cat-pinturas', ventaTipica: 2, minStock: 10 },
    { id: 'f23', code: 'ROD-9-FEL', sku: 'ROD-9-FEL', barcode: '7750182000142', name: 'Rodillo 9" con felpa', price: 16.50, cost: 9.00, stock: 95, unit: 'UNIDAD', category: 'cat-pinturas', ventaTipica: 3, minStock: 20 },
    { id: 'f24', code: 'LIJ-AGU-120', sku: 'LIJ-AGU-120', name: 'Lija al agua #120', price: 2.50, cost: 1.20, stock: 400, unit: 'UNIDAD', category: 'cat-pinturas', ventaTipica: 10, minStock: 80 },

    // — Servicio: existe en el rubro y muestra que se puede vender sin stock —
    { id: 'f25', code: 'SER-COR-VID', name: 'Corte de vidrio y melamina', description: 'Servicio por corte', price: 5.00, cost: 0, stock: null, trackStock: false, unit: 'SERVICIO', category: 'cat-herramientas', ventaTipica: 6 },
  ],

  clientes: [
    { id: 'c1', documentType: '6', documentNumber: '20603456789', name: 'CONSTRUCTORA ANDINA SAC', email: 'compras@constructoraandina.pe', phone: '987111222', address: 'Av. Javier Prado 3200, San Borja' },
    { id: 'c2', documentType: '6', documentNumber: '20548123456', name: 'INMOBILIARIA LOS PINOS EIRL', email: 'logistica@lospinos.pe', phone: '987333444', address: 'Calle Las Begonias 450, San Isidro' },
    { id: 'c3', documentType: '6', documentNumber: '20512987654', name: 'MAESTRO DE OBRA SERVICIOS SRL', email: 'admin@maestroservicios.pe', phone: '987555666', address: 'Av. Nicolás Ayllón 2100, Ate' },
    { id: 'c4', documentType: '1', documentNumber: '45678901', name: 'Ricardo Salazar Ponce', phone: '987777888', address: 'Jr. Puno 340, Ate' },
    { id: 'c5', documentType: '1', documentNumber: '09876543', name: 'Elena Torres Quispe', phone: '987999000', address: 'Av. Metropolitana 120, Santa Anita' },
  ],

  proveedores: [
    { id: 'p1', name: 'DISTRIBUIDORA CEMENTOS DEL SUR SAC', ruc: '20100123456', phone: '01-4567890', email: 'ventas@cementosdelsur.pe', address: 'Carretera Central Km 12, Ate' },
    { id: 'p2', name: 'IMPORTACIONES FERRETERAS PERÚ SAC', ruc: '20456789123', phone: '01-2345678', email: 'pedidos@iferreteras.pe', address: 'Av. Argentina 2340, Callao' },
    { id: 'p3', name: 'PINTURAS Y ACABADOS DEL NORTE EIRL', ruc: '20789456123', phone: '01-7654321', email: 'contacto@acabadosnorte.pe', address: 'Av. Colonial 1890, Lima' },
  ],

  gastos: [
    { category: 'transporte', description: 'Flete de reparto a obra', amount: 450 },
    { category: 'otros', description: 'Mantenimiento del montacargas', amount: 320 },
  ],
}
