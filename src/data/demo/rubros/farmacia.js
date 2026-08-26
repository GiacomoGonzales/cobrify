/**
 * Demo de BOTICA / FARMACIA.
 *
 * Lo que define al rubro son los LOTES con fecha de vencimiento: es la razón
 * por la que una botica compra un sistema. Con `conLotes: true` el motor le
 * arma a cada producto sus lotes, y deja unos cuantos próximos a vencer para
 * que la alerta de vencimientos tenga algo que mostrar — vacía no vende nada.
 *
 * Lo otro propio del rubro es el laboratorio del producto y la marca
 * comercial: una botica busca por "Panadol", no por "paracetamol".
 */
export default {
  slug: 'farmacia',
  nombre: 'Botica / Farmacia',
  businessMode: 'pharmacy',
  conLotes: true,

  negocio: {
    businessName: 'BOTICA SALUD TOTAL EIRL',
    ruc: '20567891234',
    address: 'Av. Túpac Amaru 1450, Comas',
    phone: '01-5231144',
    email: 'contacto@boticasaludtotal.pe',
    website: 'www.boticasaludtotal.pe',
    companySlogan: 'MEDICAMENTOS, GENÉRICOS Y CUIDADO PERSONAL — ATENCIÓN 24 HORAS',
    catalogTagline: 'Tu botica de confianza',
    catalogWelcome: 'Delivery de medicamentos en Comas y Los Olivos. Consulta disponibilidad por WhatsApp.',
    catalogColor: '#059669',
    catalogWhatsapp: '51987654321',
  },

  /**
   * Se quedan las alertas de vencimiento y el control de lotes: son el rubro.
   * Fuera cocina, mesas, recetas de cocina y citas.
   */
  menusOcultos: [
    'vet-agenda', 'tables', 'kitchen', 'orders', 'recipes', 'production',
    'ingredients', 'purchase-history', 'requirements', 'student-payments',
    'loans', 'rappi-orders', 'meta-ads', 'certificates',
    'carrier-dispatch-guides', 'my-schedule', 'attendance',
  ],

  almacenes: [
    { name: 'Mostrador', location: 'Av. Túpac Amaru 1450, Comas' },
    { name: 'Almacén', location: 'Av. Túpac Amaru 1450, Comas' },
  ],

  laboratorios: [
    { id: 'lab1', name: 'MEDIFARMA', country: 'Perú', isActive: true },
    { id: 'lab2', name: 'FARMINDUSTRIA', country: 'Perú', isActive: true },
    { id: 'lab3', name: 'GENFAR', country: 'Colombia', isActive: true },
    { id: 'lab4', name: 'BAYER', country: 'Alemania', isActive: true },
    { id: 'lab5', name: 'PFIZER', country: 'Estados Unidos', isActive: true },
    { id: 'lab6', name: 'ABBOTT', country: 'Estados Unidos', isActive: true },
  ],

  categorias: [
    { id: 'cat-analgesicos', name: 'Analgésicos', parentId: null },
    { id: 'cat-antibioticos', name: 'Antibióticos', parentId: null },
    { id: 'cat-gastro', name: 'Gastrointestinales', parentId: null },
    { id: 'cat-respiratorio', name: 'Vías respiratorias', parentId: null },
    { id: 'cat-vitaminas', name: 'Vitaminas y suplementos', parentId: null },
    { id: 'cat-cuidado', name: 'Cuidado personal', parentId: null },
    { id: 'cat-primeros', name: 'Primeros auxilios', parentId: null },
  ],

  productos: [
    // — Analgésicos (la rotación diaria de una botica) —
    { id: 'fa1', code: 'MED-PAR-500', sku: 'MED-PAR-500', barcode: '7755001000018', name: 'Paracetamol 500mg x 100 tabletas', description: 'Analgésico y antipirético', price: 8.50, cost: 4.00, stock: 200, unit: 'CAJA', category: 'cat-analgesicos', laboratoryId: 'lab1', laboratoryName: 'MEDIFARMA', marca: 'PANADOL', requiresPrescription: false, ventaTipica: 3, minStock: 40 },
    { id: 'fa2', code: 'MED-IBU-400', sku: 'MED-IBU-400', barcode: '7755001000025', name: 'Ibuprofeno 400mg x 50 tabletas', price: 12.00, cost: 6.00, stock: 140, unit: 'CAJA', category: 'cat-analgesicos', laboratoryId: 'lab2', laboratoryName: 'FARMINDUSTRIA', marca: 'DOLOFLAM', requiresPrescription: false, ventaTipica: 3, minStock: 30 },
    { id: 'fa3', code: 'MED-NAP-550', sku: 'MED-NAP-550', barcode: '7755001000032', name: 'Naproxeno sódico 550mg x 20 tab', price: 18.00, cost: 9.50, stock: 90, unit: 'CAJA', category: 'cat-analgesicos', laboratoryId: 'lab3', laboratoryName: 'GENFAR', marca: 'FLANAX', requiresPrescription: false, ventaTipica: 2, minStock: 20 },
    { id: 'fa4', code: 'MED-ASP-100', sku: 'MED-ASP-100', barcode: '7755001000049', name: 'Aspirina 100mg x 30 tabletas', price: 14.50, cost: 7.80, stock: 75, unit: 'CAJA', category: 'cat-analgesicos', laboratoryId: 'lab4', laboratoryName: 'BAYER', marca: 'ASPIRINA', requiresPrescription: false, ventaTipica: 2, minStock: 18 },

    // — Antibióticos (con receta: el rubro lo controla) —
    { id: 'fa5', code: 'MED-AMO-500', sku: 'MED-AMO-500', barcode: '7755001000056', name: 'Amoxicilina 500mg x 21 cápsulas', price: 22.00, cost: 12.00, stock: 60, unit: 'CAJA', category: 'cat-antibioticos', laboratoryId: 'lab1', laboratoryName: 'MEDIFARMA', marca: 'AMOXIL', requiresPrescription: true, ventaTipica: 1, minStock: 15 },
    { id: 'fa6', code: 'MED-AZI-500', sku: 'MED-AZI-500', barcode: '7755001000063', name: 'Azitromicina 500mg x 3 tabletas', price: 28.00, cost: 16.50, stock: 45, unit: 'CAJA', category: 'cat-antibioticos', laboratoryId: 'lab5', laboratoryName: 'PFIZER', marca: 'ZITHROMAX', requiresPrescription: true, ventaTipica: 1, minStock: 12 },
    { id: 'fa7', code: 'MED-CIP-500', sku: 'MED-CIP-500', name: 'Ciprofloxacino 500mg x 10 tab', price: 19.50, cost: 10.20, stock: 52, unit: 'CAJA', category: 'cat-antibioticos', laboratoryId: 'lab3', laboratoryName: 'GENFAR', marca: 'CIPROXINA', requiresPrescription: true, ventaTipica: 1, minStock: 12 },

    // — Gastrointestinales —
    { id: 'fa8', code: 'MED-OME-20', sku: 'MED-OME-20', barcode: '7755001000087', name: 'Omeprazol 20mg x 30 cápsulas', price: 16.00, cost: 8.20, stock: 110, unit: 'CAJA', category: 'cat-gastro', laboratoryId: 'lab2', laboratoryName: 'FARMINDUSTRIA', marca: 'OMEPRAZOL', requiresPrescription: false, ventaTipica: 2, minStock: 25 },
    { id: 'fa9', code: 'MED-SAL-SOB', sku: 'MED-SAL-SOB', barcode: '7755001000094', name: 'Sales de rehidratación oral x 10 sobres', price: 11.00, cost: 5.40, stock: 130, unit: 'CAJA', category: 'cat-gastro', laboratoryId: 'lab1', laboratoryName: 'MEDIFARMA', marca: 'ELECTROLIT', requiresPrescription: false, ventaTipica: 3, minStock: 30 },
    { id: 'fa10', code: 'MED-DIM-10', sku: 'MED-DIM-10', name: 'Dimenhidrinato 50mg x 10 tab', price: 9.50, cost: 4.60, stock: 85, unit: 'CAJA', category: 'cat-gastro', laboratoryId: 'lab6', laboratoryName: 'ABBOTT', marca: 'GRAVOL', requiresPrescription: false, ventaTipica: 2, minStock: 20 },

    // — Vías respiratorias —
    { id: 'fa11', code: 'MED-LOR-10', sku: 'MED-LOR-10', barcode: '7755001000117', name: 'Loratadina 10mg x 20 tabletas', price: 13.00, cost: 6.30, stock: 95, unit: 'CAJA', category: 'cat-respiratorio', laboratoryId: 'lab3', laboratoryName: 'GENFAR', marca: 'CLARITYNE', requiresPrescription: false, ventaTipica: 2, minStock: 22 },
    { id: 'fa12', code: 'MED-JAR-TOS', sku: 'MED-JAR-TOS', barcode: '7755001000124', name: 'Jarabe para la tos 120ml', price: 21.00, cost: 11.00, stock: 70, unit: 'FRASCO', category: 'cat-respiratorio', laboratoryId: 'lab2', laboratoryName: 'FARMINDUSTRIA', marca: 'NOTUSIN', requiresPrescription: false, ventaTipica: 2, minStock: 18 },
    { id: 'fa13', code: 'MED-SAL-INH', sku: 'MED-SAL-INH', name: 'Salbutamol inhalador 100mcg', price: 32.00, cost: 19.00, stock: 38, unit: 'UNIDAD', category: 'cat-respiratorio', laboratoryId: 'lab5', laboratoryName: 'PFIZER', marca: 'VENTOLIN', requiresPrescription: true, ventaTipica: 1, minStock: 10 },

    // — Vitaminas —
    { id: 'fa14', code: 'VIT-COM-B', sku: 'VIT-COM-B', barcode: '7755001000148', name: 'Complejo B x 30 tabletas', price: 24.00, cost: 12.50, stock: 88, unit: 'FRASCO', category: 'cat-vitaminas', laboratoryId: 'lab4', laboratoryName: 'BAYER', marca: 'BEROCCA', requiresPrescription: false, ventaTipica: 2, minStock: 20 },
    { id: 'fa15', code: 'VIT-C-1000', sku: 'VIT-C-1000', barcode: '7755001000155', name: 'Vitamina C 1000mg x 30 tabletas', price: 27.00, cost: 14.00, stock: 105, unit: 'FRASCO', category: 'cat-vitaminas', laboratoryId: 'lab4', laboratoryName: 'BAYER', marca: 'REDOXON', requiresPrescription: false, ventaTipica: 2, minStock: 25 },
    { id: 'fa16', code: 'VIT-SUL-FER', sku: 'VIT-SUL-FER', name: 'Sulfato ferroso x 30 tabletas', price: 15.00, cost: 7.20, stock: 72, unit: 'FRASCO', category: 'cat-vitaminas', laboratoryId: 'lab1', laboratoryName: 'MEDIFARMA', marca: 'FERRANIN', requiresPrescription: false, ventaTipica: 2, minStock: 18 },

    // — Cuidado personal (el margen alto de una botica) —
    { id: 'fa17', code: 'CUI-ALC-70', sku: 'CUI-ALC-70', barcode: '7755001000179', name: 'Alcohol medicinal 70° 250ml', price: 7.50, cost: 3.20, stock: 160, unit: 'FRASCO', category: 'cat-cuidado', requiresPrescription: false, ventaTipica: 3, minStock: 35 },
    { id: 'fa18', code: 'CUI-PAN-XG', sku: 'CUI-PAN-XG', barcode: '7755001000186', name: 'Pañales talla G x 40 unidades', price: 48.00, cost: 32.00, stock: 55, unit: 'PAQUETE', category: 'cat-cuidado', marca: 'HUGGIES', requiresPrescription: false, ventaTipica: 1, minStock: 12 },
    { id: 'fa19', code: 'CUI-TOA-FEM', sku: 'CUI-TOA-FEM', barcode: '7755001000193', name: 'Toallas higiénicas x 10 unidades', price: 9.00, cost: 4.80, stock: 140, unit: 'PAQUETE', category: 'cat-cuidado', marca: 'NOSOTRAS', requiresPrescription: false, ventaTipica: 3, minStock: 30 },
    { id: 'fa20', code: 'CUI-PRE-X3', sku: 'CUI-PRE-X3', name: 'Preservativos x 3 unidades', price: 12.00, cost: 6.00, stock: 120, unit: 'CAJA', category: 'cat-cuidado', requiresPrescription: false, ventaTipica: 2, minStock: 25 },

    // — Primeros auxilios —
    { id: 'fa21', code: 'PRI-CUR-X10', sku: 'PRI-CUR-X10', barcode: '7755001000216', name: 'Curitas x 10 unidades', price: 5.50, cost: 2.40, stock: 180, unit: 'CAJA', category: 'cat-primeros', requiresPrescription: false, ventaTipica: 4, minStock: 40 },
    { id: 'fa22', code: 'PRI-GAS-EST', sku: 'PRI-GAS-EST', name: 'Gasa estéril 10x10 x 5 sobres', price: 8.00, cost: 3.60, stock: 95, unit: 'PAQUETE', category: 'cat-primeros', requiresPrescription: false, ventaTipica: 2, minStock: 22 },
    { id: 'fa23', code: 'PRI-TER-DIG', sku: 'PRI-TER-DIG', name: 'Termómetro digital', price: 25.00, cost: 13.00, stock: 42, unit: 'UNIDAD', category: 'cat-primeros', requiresPrescription: false, ventaTipica: 1, minStock: 10 },

    // — Servicio: lo que una botica de barrio cobra aparte —
    { id: 'fa24', code: 'SER-INY-APL', name: 'Aplicación de inyectable', description: 'Servicio de enfermería', price: 10.00, cost: 0, stock: null, trackStock: false, unit: 'SERVICIO', category: 'cat-primeros', ventaTipica: 2 },
    { id: 'fa25', code: 'SER-PRE-ART', name: 'Control de presión arterial', price: 5.00, cost: 0, stock: null, trackStock: false, unit: 'SERVICIO', category: 'cat-primeros', ventaTipica: 3 },
  ],

  clientes: [
    { id: 'c1', documentType: '6', documentNumber: '20606789123', name: 'POLICLÍNICO SAN JOSÉ SAC', email: 'compras@policlinicosanjose.pe', phone: '987666768', address: 'Av. Túpac Amaru 2100, Comas' },
    { id: 'c2', documentType: '6', documentNumber: '20559123456', name: 'CENTRO GERIÁTRICO LOS ALAMOS EIRL', email: 'admin@geriatricolosalamos.pe', phone: '987697071', address: 'Av. Universitaria 5600, Los Olivos' },
    { id: 'c3', documentType: '1', documentNumber: '41234567', name: 'Teresa Huamán Ccahuana', phone: '987727374', address: 'Jr. Los Cedros 240, Comas' },
    { id: 'c4', documentType: '1', documentNumber: '04567890', name: 'Julio Espinoza Ramos', phone: '987757677', address: 'Av. Belaúnde 1120, Comas' },
    { id: 'c5', documentType: '1', documentNumber: '43456789', name: 'Norma Vílchez Ayala', phone: '987787980', address: 'Calle Las Gardenias 85, Los Olivos' },
  ],

  proveedores: [
    { id: 'p1', name: 'DROGUERÍA DISTRIBUIDORA PERUANA SAC', ruc: '20112233445', phone: '01-3332211', email: 'ventas@drogueriaperuana.pe', address: 'Av. Argentina 1450, Lima' },
    { id: 'p2', name: 'ALBIS DISTRIBUCIONES EIRL', ruc: '20556677889', phone: '01-5554433', email: 'pedidos@albisdist.pe', address: 'Av. Colonial 2800, Callao' },
    { id: 'p3', name: 'CUIDADO PERSONAL IMPORTACIONES SRL', ruc: '20998877665', phone: '01-7776655', email: 'contacto@cuidadoimport.pe', address: 'Av. Venezuela 3200, Lima' },
  ],

  gastos: [
    { category: 'planilla', description: 'Sueldo del químico farmacéutico', amount: 2800 },
    { category: 'otros', description: 'Baja de productos vencidos', amount: 280 },
  ],
}
