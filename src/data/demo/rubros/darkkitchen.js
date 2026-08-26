/**
 * Demo de DARK KITCHEN (cocina oculta / delivery puro).
 *
 * Es un restaurante SIN salón: no hay mesas ni mozos, todo entra por apps y
 * por WhatsApp y sale en moto. Por eso lleva `posCreatesKitchenOrder`: cada
 * venta del mostrador genera la comanda en Cocina automáticamente, que es
 * exactamente el flujo del rubro — se toma el pedido y se manda a cocinar sin
 * pasar por una mesa.
 *
 * Sin `salon`: el motor no genera mesas y el menú las oculta.
 */
export default {
  slug: 'darkkitchen',
  nombre: 'Dark kitchen',
  businessMode: 'restaurant',

  negocio: {
    businessName: 'CRAVE KITCHEN DELIVERY SAC',
    ruc: '20578912345',
    address: 'Jr. Los Talleres 480, Surquillo',
    phone: '01-7712233',
    email: 'pedidos@cravekitchen.pe',
    website: 'www.cravekitchen.pe',
    companySlogan: 'HAMBURGUESAS Y POLLO CRUJIENTE — SOLO DELIVERY',
    catalogTagline: 'Pide y te llega en 30 minutos',
    catalogWelcome: 'Cocina exclusiva para delivery. Pide por WhatsApp o desde la carta.',
    catalogColor: '#EA580C',
    catalogWhatsapp: '51987654321',
  },

  /**
   * Fuera las mesas y los mozos: no hay salón. Se quedan Órdenes, Cocina,
   * Insumos, Recetas y Envíos, que es todo el negocio.
   */
  menusOcultos: [
    'tables', 'waiters', 'vet-agenda', 'expiry-alerts', 'batch-control',
    'student-payments', 'loans', 'meta-ads', 'certificates',
    'carrier-dispatch-guides', 'dispatch-guides', 'quotations', 'sellers',
    'my-schedule', 'attendance',
  ],

  /** El POS manda la comanda a cocina solo: no hay mesa de por medio. */
  ajustes: { posCreatesKitchenOrder: true },

  reparto: ['Brayan Quiñones', 'Andrea Salas', 'Kevin Ramos'],

  almacenes: [
    { name: 'Cocina', location: 'Jr. Los Talleres 480, Surquillo' },
    { name: 'Cámara y despensa', location: 'Jr. Los Talleres 480, Surquillo' },
  ],

  categorias: [
    { id: 'cat-burgers', name: 'Hamburguesas', parentId: null },
    { id: 'cat-pollo', name: 'Pollo crujiente', parentId: null },
    { id: 'cat-combos', name: 'Combos', parentId: null },
    { id: 'cat-acomp', name: 'Acompañamientos', parentId: null },
    { id: 'cat-bebidas', name: 'Bebidas', parentId: null },
  ],

  productos: [
    // — Hamburguesas (el plato estrella del rubro) —
    { id: 'dk1', code: 'BUR-CLA-SIM', imageUrl: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400&h=400&fit=crop', name: 'Hamburguesa clásica', description: 'Carne 150g, queso, lechuga y tomate', price: 18.90, cost: 6.80, stock: null, trackStock: false, unit: 'UNIDAD', category: 'cat-burgers', ventaTipica: 2 },
    { id: 'dk2', code: 'BUR-DOB-QUE', imageUrl: 'https://images.unsplash.com/photo-1655895176036-bf1a11326e5c?w=400&h=400&fit=crop', name: 'Hamburguesa doble queso', price: 26.90, cost: 10.20, stock: null, trackStock: false, unit: 'UNIDAD', category: 'cat-burgers', ventaTipica: 2 },
    { id: 'dk3', code: 'BUR-BAC-BBQ', imageUrl: 'https://images.unsplash.com/photo-1615297928064-24977384d0da?w=400&h=400&fit=crop', name: 'Hamburguesa BBQ con tocino', price: 29.90, cost: 11.50, stock: null, trackStock: false, unit: 'UNIDAD', category: 'cat-burgers', ventaTipica: 2 },
    { id: 'dk4', code: 'BUR-VEG-POR', imageUrl: 'https://images.unsplash.com/photo-1620646146961-fb8c077b6b61?w=400&h=400&fit=crop', name: 'Hamburguesa vegetariana', price: 22.90, cost: 8.40, stock: null, trackStock: false, unit: 'UNIDAD', category: 'cat-burgers', ventaTipica: 1 },

    // — Pollo crujiente —
    { id: 'dk5', code: 'POL-SAN-CRU', imageUrl: 'https://images.unsplash.com/photo-1637710847214-f91d99669e18?w=400&h=400&fit=crop', name: 'Sándwich de pollo crujiente', price: 21.90, cost: 8.10, stock: null, trackStock: false, unit: 'UNIDAD', category: 'cat-pollo', ventaTipica: 2 },
    { id: 'dk6', code: 'POL-TEN-X6', imageUrl: 'https://images.unsplash.com/photo-1695427038693-7b055c1a63e3?w=400&h=400&fit=crop', name: 'Chicken tenders x6 con salsas', price: 24.90, cost: 9.60, stock: null, trackStock: false, unit: 'PORCION', category: 'cat-pollo', ventaTipica: 2 },
    { id: 'dk7', code: 'POL-ALI-X8', name: 'Alitas BBQ x8', price: 27.90, cost: 11.00, stock: null, trackStock: false, unit: 'PORCION', category: 'cat-pollo', ventaTipica: 2 },

    // — Combos (el ticket que sube el promedio) —
    { id: 'dk8', code: 'COM-BUR-PER', imageUrl: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400&h=400&fit=crop', name: 'Combo hamburguesa + papas + gaseosa', price: 29.90, cost: 11.80, stock: null, trackStock: false, unit: 'COMBO', category: 'cat-combos', ventaTipica: 3 },
    { id: 'dk9', code: 'COM-POL-PER', imageUrl: 'https://images.unsplash.com/photo-1637710847214-f91d99669e18?w=400&h=400&fit=crop', name: 'Combo pollo + papas + gaseosa', price: 31.90, cost: 12.60, stock: null, trackStock: false, unit: 'COMBO', category: 'cat-combos', ventaTipica: 3 },
    { id: 'dk10', code: 'COM-FAM-4P', name: 'Combo familiar 4 personas', description: '4 hamburguesas, papas grandes y gaseosa 1.5L', price: 99.90, cost: 41.00, stock: null, trackStock: false, unit: 'COMBO', category: 'cat-combos', ventaTipica: 1 },

    // — Acompañamientos —
    { id: 'dk11', code: 'ACO-PAP-CLA', imageUrl: 'https://images.unsplash.com/photo-1620646146961-fb8c077b6b61?w=400&h=400&fit=crop', name: 'Papas fritas clásicas', price: 9.90, cost: 2.80, stock: null, trackStock: false, unit: 'PORCION', category: 'cat-acomp', ventaTipica: 3 },
    { id: 'dk12', code: 'ACO-PAP-QUE', name: 'Papas con queso y tocino', price: 15.90, cost: 5.40, stock: null, trackStock: false, unit: 'PORCION', category: 'cat-acomp', ventaTipica: 2 },
    { id: 'dk13', code: 'ACO-ARO-CEB', name: 'Aros de cebolla x8', price: 12.90, cost: 4.20, stock: null, trackStock: false, unit: 'PORCION', category: 'cat-acomp', ventaTipica: 2 },
    { id: 'dk14', code: 'ACO-SAL-EXT', name: 'Salsa extra', price: 2.50, cost: 0.60, stock: null, trackStock: false, unit: 'UNIDAD', category: 'cat-acomp', ventaTipica: 4 },

    // — Bebidas: SÍ llevan stock (son latas y botellas) —
    { id: 'dk15', code: 'BEB-GAS-500', sku: 'BEB-GAS-500', barcode: '7756001000156', name: 'Gaseosa 500ml', price: 6.00, cost: 2.40, stock: 240, unit: 'UNIDAD', category: 'cat-bebidas', ventaTipica: 4, minStock: 60 },
    { id: 'dk16', code: 'BEB-GAS-15L', sku: 'BEB-GAS-15L', barcode: '7756001000163', name: 'Gaseosa 1.5L', price: 11.00, cost: 5.20, stock: 90, unit: 'UNIDAD', category: 'cat-bebidas', ventaTipica: 2, minStock: 24 },
    { id: 'dk17', code: 'BEB-AGU-625', sku: 'BEB-AGU-625', barcode: '7756001000170', name: 'Agua mineral 625ml', price: 4.00, cost: 1.20, stock: 160, unit: 'UNIDAD', category: 'cat-bebidas', ventaTipica: 3, minStock: 40 },
    { id: 'dk18', code: 'BEB-LIM-JAR', name: 'Limonada frozen 500ml', price: 9.90, cost: 3.10, stock: null, trackStock: false, unit: 'VASO', category: 'cat-bebidas', ventaTipica: 2 },

    // — Servicio: el delivery se cobra aparte fuera de la zona —
    { id: 'dk19', code: 'SER-DEL-EXT', name: 'Delivery fuera de zona', price: 6.00, cost: 0, stock: null, trackStock: false, unit: 'SERVICIO', category: 'cat-combos', ventaTipica: 1 },
  ],

  /** Insumos de la cocina: lo que consumen las recetas de cada plato. */
  insumos: [
    { id: 'dki1', name: 'Carne de res molida', category: 'carnes', purchaseUnit: 'kg', currentStock: 42, minimumStock: 15, averageCost: 26.00 },
    { id: 'dki2', name: 'Pechuga de pollo', category: 'carnes', purchaseUnit: 'kg', currentStock: 38, minimumStock: 15, averageCost: 14.50 },
    { id: 'dki3', name: 'Pan de hamburguesa', category: 'panaderia', purchaseUnit: 'unidad', currentStock: 320, minimumStock: 100, averageCost: 1.10 },
    { id: 'dki4', name: 'Queso cheddar en láminas', category: 'lácteos', purchaseUnit: 'kg', currentStock: 18, minimumStock: 6, averageCost: 32.00 },
    { id: 'dki5', name: 'Papa precortada congelada', category: 'congelados', purchaseUnit: 'kg', currentStock: 65, minimumStock: 25, averageCost: 8.40 },
    { id: 'dki6', name: 'Tocino ahumado', category: 'carnes', purchaseUnit: 'kg', currentStock: 12, minimumStock: 5, averageCost: 34.00 },
    { id: 'dki7', name: 'Lechuga americana', category: 'verduras', purchaseUnit: 'kg', currentStock: 15, minimumStock: 6, averageCost: 5.20 },
    { id: 'dki8', name: 'Tomate', category: 'verduras', purchaseUnit: 'kg', currentStock: 20, minimumStock: 8, averageCost: 4.10 },
    { id: 'dki9', name: 'Aceite para freidora', category: 'abarrotes', purchaseUnit: 'litro', currentStock: 48, minimumStock: 20, averageCost: 9.20 },
    { id: 'dki10', name: 'Empaques de delivery', category: 'empaque', purchaseUnit: 'unidad', currentStock: 400, minimumStock: 150, averageCost: 0.90 },
  ],

  clientes: [
    { id: 'c1', documentType: '6', documentNumber: '20607891234', name: 'COWORKING LIMA CENTRO SAC', email: 'admin@coworkinglima.pe', phone: '987818283', address: 'Av. Canaval y Moreyra 480, San Isidro' },
    { id: 'c2', documentType: '1', documentNumber: '48901234', name: 'Sebastián Ugarte Ríos', phone: '987848586', address: 'Av. Angamos Este 1290, Surquillo' },
    { id: 'c3', documentType: '1', documentNumber: '03456789', name: 'Karina Bustamante Vera', phone: '987878889', address: 'Calle Dante 340, Surquillo' },
    { id: 'c4', documentType: '1', documentNumber: '47012345', name: 'Renzo Figueroa Pinto', phone: '987909192', address: 'Av. Tomás Marsano 2100, Surco' },
  ],

  proveedores: [
    { id: 'p1', name: 'CARNES Y EMBUTIDOS SELECTOS SAC', ruc: '20334455667', phone: '01-4448899', email: 'ventas@carnesselectos.pe', address: 'Av. Nicolás Ayllón 1800, Ate' },
    { id: 'p2', name: 'PANIFICADORA INDUSTRIAL DEL SUR EIRL', ruc: '20667788990', phone: '01-6667700', email: 'pedidos@panisur.pe', address: 'Av. Los Frutales 920, Ate' },
    { id: 'p3', name: 'EMPAQUES PARA DELIVERY PERÚ SRL', ruc: '20990011223', phone: '01-8889900', email: 'contacto@empaquesdelivery.pe', address: 'Av. Argentina 2650, Callao' },
  ],

  gastos: [
    { category: 'marketing', description: 'Comisión de apps de delivery', amount: 1450 },
    { category: 'servicios', description: 'Gas para freidoras', amount: 480 },
    { category: 'otros', description: 'Empaques y descartables', amount: 620 },
  ],
}
