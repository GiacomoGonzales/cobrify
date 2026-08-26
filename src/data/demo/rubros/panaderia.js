/**
 * Demo de PANADERÍA.
 *
 * Se parece a la pastelería en que produce lo que vende —harina y levadura
 * entran, pan sale— pero el negocio es otro: rotación altísima, ticket bajo y
 * venta por unidad o por kilo desde temprano. Por eso los panes llevan
 * `ventaTipica` alta: nadie compra un pan, compra ocho.
 */
export default {
  slug: 'panaderia',
  nombre: 'Panadería',
  businessMode: 'retail',

  negocio: {
    businessName: 'PANADERÍA SAN ANTONIO EIRL',
    ruc: '20589123456',
    address: 'Av. Los Próceres 780, San Juan de Lurigancho',
    phone: '01-3358899',
    email: 'ventas@panaderiasanantonio.pe',
    website: 'www.panaderiasanantonio.pe',
    companySlogan: 'PAN FRESCO DESDE LAS 5 A.M. — PANADERÍA Y PASTELERÍA',
    catalogTagline: 'Pan caliente todos los días',
    catalogWelcome: 'Horneamos tres veces al día. Pedidos por adelantado para eventos.',
    catalogColor: '#B45309',
    catalogWhatsapp: '51987654321',
  },

  /**
   * Se quedan Insumos, Recetas y Producción: una panadería vive de eso.
   * Fuera mesas, cocina de salón y citas.
   */
  menusOcultos: [
    'vet-agenda', 'tables', 'kitchen', 'orders', 'expiry-alerts',
    'batch-control', 'student-payments', 'loans', 'rappi-orders', 'meta-ads',
    'certificates', 'carrier-dispatch-guides', 'dispatch-guides',
    'my-schedule', 'attendance',
  ],

  reparto: ['Wilmer Rojas'],

  almacenes: [
    { name: 'Mostrador', location: 'Av. Los Próceres 780, San Juan de Lurigancho' },
    { name: 'Depósito de insumos', location: 'Av. Los Próceres 780, San Juan de Lurigancho' },
  ],

  categorias: [
    { id: 'cat-panes', name: 'Panes', parentId: null },
    { id: 'cat-dulces', name: 'Dulces y bizcochos', parentId: null },
    { id: 'cat-salados', name: 'Salados', parentId: null },
    { id: 'cat-abarrotes', name: 'Abarrotes', parentId: null },
    { id: 'cat-bebidas', name: 'Bebidas', parentId: null },
    { id: 'cat-diario', name: 'Del día', parentId: 'cat-panes' },
    { id: 'cat-especial', name: 'Especiales', parentId: 'cat-panes' },
  ],

  productos: [
    // — Panes del día (el volumen del negocio: se venden por decenas) —
    { id: 'pn1', code: 'PAN-FRA-UNI', imageUrl: 'https://images.unsplash.com/photo-1549413468-cd78edb7e75c?w=400&h=400&fit=crop', name: 'Pan francés', description: 'Horneado cada 3 horas', price: 0.50, cost: 0.16, stock: 800, unit: 'UNIDAD', category: 'cat-diario', ventaTipica: 20, minStock: 200 },
    { id: 'pn2', code: 'PAN-CIA-UNI', imageUrl: 'https://images.unsplash.com/photo-1613396874083-2d5fbe59ae79?w=400&h=400&fit=crop', name: 'Pan ciabatta', price: 1.20, cost: 0.42, stock: 240, unit: 'UNIDAD', category: 'cat-diario', ventaTipica: 8, minStock: 60 },
    { id: 'pn3', code: 'PAN-YEM-UNI', name: 'Pan de yema', price: 0.80, cost: 0.26, stock: 300, unit: 'UNIDAD', category: 'cat-diario', ventaTipica: 12, minStock: 80 },
    { id: 'pn4', code: 'PAN-INT-UNI', imageUrl: 'https://images.unsplash.com/photo-1598373182133-52452f7691ef?w=400&h=400&fit=crop', name: 'Pan integral', price: 1.00, cost: 0.35, stock: 180, unit: 'UNIDAD', category: 'cat-diario', ventaTipica: 10, minStock: 50 },

    // — Panes especiales (se venden por unidad o por kilo) —
    { id: 'pn5', code: 'PAN-MOL-KG', imageUrl: 'https://images.unsplash.com/photo-1534620808146-d33bb39128b2?w=400&h=400&fit=crop', name: 'Pan de molde artesanal', description: 'Bolsa de 500g rebanado', price: 9.50, cost: 3.60, stock: 60, unit: 'UNIDAD', category: 'cat-especial', ventaTipica: 2, minStock: 15 },
    { id: 'pn6', code: 'PAN-CAM-KG', imageUrl: 'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?w=400&h=400&fit=crop', name: 'Pan campesino x kilo', price: 12.00, cost: 4.80, stock: 40, unit: 'KG', category: 'cat-especial', ventaTipica: 2, minStock: 10 },
    { id: 'pn7', code: 'PAN-CHA-UNI', imageUrl: 'https://images.unsplash.com/photo-1586765501019-cbe3973ef8fa?w=400&h=400&fit=crop', name: 'Chapla serrana', price: 1.50, cost: 0.52, stock: 150, unit: 'UNIDAD', category: 'cat-especial', ventaTipica: 6, minStock: 40 },
    { id: 'pn8', code: 'PAN-BAG-UNI', imageUrl: 'https://images.unsplash.com/photo-1556471013-0001958d2f12?w=400&h=400&fit=crop', name: 'Baguette', price: 4.50, cost: 1.60, stock: 90, unit: 'UNIDAD', category: 'cat-especial', ventaTipica: 3, minStock: 25 },

    // — Dulces y bizcochos —
    { id: 'pn9', code: 'DUL-BIZ-CHO', name: 'Bizcocho de chocolate x porción', price: 5.50, cost: 1.90, stock: 70, unit: 'PORCION', category: 'cat-dulces', ventaTipica: 3, minStock: 20 },
    { id: 'pn10', code: 'DUL-QUE-UNI', name: 'Queque de vainilla familiar', price: 22.00, cost: 8.40, stock: 24, unit: 'UNIDAD', category: 'cat-dulces', ventaTipica: 1, minStock: 6 },
    { id: 'pn11', code: 'DUL-DON-UNI', name: 'Dona glaseada', price: 3.50, cost: 1.10, stock: 120, unit: 'UNIDAD', category: 'cat-dulces', ventaTipica: 4, minStock: 30 },
    { id: 'pn12', code: 'DUL-ALF-UNI', name: 'Alfajor de maicena', price: 3.00, cost: 0.95, stock: 140, unit: 'UNIDAD', category: 'cat-dulces', ventaTipica: 5, minStock: 40 },

    // — Salados —
    { id: 'pn13', code: 'SAL-EMP-CAR', name: 'Empanada de carne', price: 6.00, cost: 2.10, stock: 80, unit: 'UNIDAD', category: 'cat-salados', ventaTipica: 3, minStock: 25 },
    { id: 'pn14', code: 'SAL-EMP-POL', name: 'Empanada de pollo', price: 6.00, cost: 2.05, stock: 80, unit: 'UNIDAD', category: 'cat-salados', ventaTipica: 3, minStock: 25 },
    { id: 'pn15', code: 'SAL-PIZ-POR', name: 'Pizza al paso x porción', price: 7.50, cost: 2.60, stock: 50, unit: 'PORCION', category: 'cat-salados', ventaTipica: 2, minStock: 15 },
    { id: 'pn16', code: 'SAL-SAN-MIX', name: 'Sándwich mixto', price: 8.50, cost: 3.10, stock: 45, unit: 'UNIDAD', category: 'cat-salados', ventaTipica: 2, minStock: 15 },

    // — Abarrotes: lo que la panadería de barrio vende de paso —
    { id: 'pn17', code: 'ABA-LEC-1L', sku: 'ABA-LEC-1L', barcode: '7757001000178', name: 'Leche evaporada 400g', price: 4.50, cost: 3.40, stock: 200, unit: 'UNIDAD', category: 'cat-abarrotes', ventaTipica: 3, minStock: 48 },
    { id: 'pn18', code: 'ABA-MAN-200', sku: 'ABA-MAN-200', barcode: '7757001000185', name: 'Mantequilla 200g', price: 9.90, cost: 7.20, stock: 90, unit: 'UNIDAD', category: 'cat-abarrotes', ventaTipica: 2, minStock: 24 },
    { id: 'pn19', code: 'ABA-HUE-KG', name: 'Huevos x kilo', price: 8.50, cost: 6.80, stock: 120, unit: 'KG', category: 'cat-abarrotes', ventaTipica: 2, minStock: 30 },

    // — Bebidas —
    { id: 'pn20', code: 'BEB-CAF-TAZ', name: 'Café pasado en taza', price: 3.50, cost: 0.90, stock: null, trackStock: false, unit: 'TAZA', category: 'cat-bebidas', ventaTipica: 4 },
    { id: 'pn21', code: 'BEB-EMO-VAS', name: 'Emoliente en vaso', price: 2.50, cost: 0.60, stock: null, trackStock: false, unit: 'VASO', category: 'cat-bebidas', ventaTipica: 4 },
    { id: 'pn22', code: 'BEB-GAS-500', sku: 'BEB-GAS-500', barcode: '7757001000222', name: 'Gaseosa 500ml', price: 5.50, cost: 2.40, stock: 130, unit: 'UNIDAD', category: 'cat-bebidas', ventaTipica: 3, minStock: 36 },

    // — Encargos —
    { id: 'pn23', code: 'SER-PAN-EVE', name: 'Pan para evento (por ciento)', description: 'Con 24 horas de anticipación', price: 45.00, cost: 16.00, stock: null, trackStock: false, unit: 'CIENTO', category: 'cat-especial', ventaTipica: 1 },
  ],

  /** La materia prima del horno: es lo que define al rubro. */
  insumos: [
    { id: 'pni1', name: 'Harina especial para pan', category: 'secos', purchaseUnit: 'kg', currentStock: 450, minimumStock: 150, averageCost: 3.20 },
    { id: 'pni2', name: 'Levadura fresca', category: 'secos', purchaseUnit: 'kg', currentStock: 22, minimumStock: 8, averageCost: 11.00 },
    { id: 'pni3', name: 'Manteca vegetal', category: 'grasas', purchaseUnit: 'kg', currentStock: 60, minimumStock: 20, averageCost: 7.80 },
    { id: 'pni4', name: 'Azúcar blanca', category: 'secos', purchaseUnit: 'kg', currentStock: 140, minimumStock: 50, averageCost: 4.10 },
    { id: 'pni5', name: 'Sal industrial', category: 'secos', purchaseUnit: 'kg', currentStock: 80, minimumStock: 25, averageCost: 1.40 },
    { id: 'pni6', name: 'Mejorador de masa', category: 'secos', purchaseUnit: 'kg', currentStock: 14, minimumStock: 5, averageCost: 18.50 },
    { id: 'pni7', name: 'Huevos', category: 'frescos', purchaseUnit: 'kg', currentStock: 55, minimumStock: 20, averageCost: 6.90 },
    { id: 'pni8', name: 'Leche fresca', category: 'lácteos', purchaseUnit: 'litro', currentStock: 40, minimumStock: 15, averageCost: 4.30 },
    { id: 'pni9', name: 'Ajonjolí', category: 'secos', purchaseUnit: 'kg', currentStock: 9, minimumStock: 3, averageCost: 16.00 },
    { id: 'pni10', name: 'Bolsas de papel', category: 'empaque', purchaseUnit: 'unidad', currentStock: 900, minimumStock: 300, averageCost: 0.12 },
  ],

  clientes: [
    { id: 'c1', documentType: '6', documentNumber: '20608912345', name: 'CAFETERÍA EL MIRADOR SAC', email: 'compras@cafeelmirador.pe', phone: '987939495', address: 'Av. Próceres 1450, SJL' },
    { id: 'c2', documentType: '6', documentNumber: '20560123456', name: 'COLEGIO PARROQUIAL SANTA ROSA EIRL', email: 'admin@santarosasjl.edu.pe', phone: '987969798', address: 'Jr. Las Lomas 220, SJL' },
    { id: 'c3', documentType: '1', documentNumber: '40123456', name: 'Doris Palomino Ccorahua', phone: '987990001', address: 'Jr. Las Flores 88, SJL' },
    { id: 'c4', documentType: '1', documentNumber: '02345678', name: 'Hugo Ventura Ramos', phone: '987020304', address: 'Av. Canto Grande 3100, SJL' },
    { id: 'c5', documentType: '1', documentNumber: '46012345', name: 'Yeni Alarcón Huanca', phone: '987050607', address: 'Calle Los Jazmines 45, SJL' },
  ],

  proveedores: [
    { id: 'p1', name: 'MOLINERA DEL CENTRO SAC', ruc: '20445566778', phone: '01-5551122', email: 'ventas@molineracentro.pe', address: 'Av. Argentina 4200, Callao' },
    { id: 'p2', name: 'INSUMOS PANADEROS PERÚ EIRL', ruc: '20778899001', phone: '01-7773344', email: 'pedidos@insumospanaderos.pe', address: 'Av. Nicolás Arriola 1450, La Victoria' },
    { id: 'p3', name: 'DISTRIBUIDORA DE ABARROTES SJL SRL', ruc: '20112233445', phone: '01-3335566', email: 'contacto@abarrotessjl.pe', address: 'Av. Wiesse 2200, SJL' },
  ],

  gastos: [
    { category: 'servicios', description: 'Gas para el horno', amount: 890 },
    { category: 'planilla', description: 'Sueldo de panaderos', amount: 3200 },
    { category: 'otros', description: 'Bolsas y empaques', amount: 180 },
  ],
}
