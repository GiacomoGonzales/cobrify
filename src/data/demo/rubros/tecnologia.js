/**
 * Demo de TIENDA DE TECNOLOGÍA.
 *
 * Lo que distingue al rubro: ticket alto, garantías y equipos que se venden
 * por número de serie. Por eso varios productos van con `serialNumbers` — es
 * la función que una tienda de celulares o laptops pregunta primero.
 */
export default {
  slug: 'tecnologia',
  nombre: 'Tienda de tecnología',
  businessMode: 'retail',

  negocio: {
    businessName: 'TECNO IMPORT PERÚ SAC',
    ruc: '20534567891',
    address: 'Av. Wilson 1250, Cercado de Lima',
    phone: '01-4567123',
    email: 'ventas@tecnoimport.pe',
    website: 'www.tecnoimport.pe',
    companySlogan: 'LAPTOPS, CELULARES Y ACCESORIOS — GARANTÍA OFICIAL',
    catalogTagline: 'Tecnología con garantía y factura',
    catalogWelcome: 'Equipos nuevos y sellados. Garantía oficial y envío a todo el Perú.',
    catalogColor: '#2563EB',
    catalogWhatsapp: '51987654321',
  },

  /**
   * Sin cocina ni citas. Se quedan guías de remisión (despacho de equipos) y
   * cotizaciones, que es como se le vende a empresas y colegios.
   */
  menusOcultos: [
    'vet-agenda', 'tables', 'kitchen', 'orders', 'recipes', 'production',
    'ingredients', 'purchase-history', 'requirements', 'expiry-alerts',
    'batch-control', 'student-payments', 'loans', 'rappi-orders', 'meta-ads',
    'certificates', 'carrier-dispatch-guides', 'my-schedule', 'attendance',
  ],

  /** Despacho de equipos a domicilio y a oficina. */
  reparto: ['Renzo Palacios'],

  almacenes: [
    { name: 'Tienda Wilson', location: 'Av. Wilson 1250, Cercado de Lima' },
    { name: 'Almacén Central', location: 'Av. Argentina 1820, Callao' },
  ],

  categorias: [
    { id: 'cat-computo', name: 'Cómputo', parentId: null },
    { id: 'cat-celulares', name: 'Celulares', parentId: null },
    { id: 'cat-accesorios', name: 'Accesorios', parentId: null },
    { id: 'cat-impresion', name: 'Impresión', parentId: null },
    { id: 'cat-servicios', name: 'Servicio técnico', parentId: null },
    { id: 'cat-laptops', name: 'Laptops', parentId: 'cat-computo' },
    { id: 'cat-componentes', name: 'Componentes', parentId: 'cat-computo' },
  ],

  productos: [
    // — Laptops (ticket alto, se venden de a una) —
    { id: 't1', code: 'LAP-HP-15I5', sku: 'LAP-HP-15I5', barcode: '7752001000015', name: 'Laptop HP 15" Core i5 8GB 512GB SSD', description: 'Intel Core i5 12va gen, Windows 11', price: 2790.00, cost: 2180.00, stock: 14, unit: 'UNIDAD', category: 'cat-laptops', ventaTipica: 1, minStock: 4 },
    { id: 't2', code: 'LAP-LEN-I7', sku: 'LAP-LEN-I7', barcode: '7752001000022', name: 'Laptop Lenovo IdeaPad Core i7 16GB', price: 3990.00, cost: 3120.00, stock: 8, unit: 'UNIDAD', category: 'cat-laptops', ventaTipica: 1, minStock: 3 },
    { id: 't3', code: 'LAP-ASU-GAM', sku: 'LAP-ASU-GAM', name: 'Laptop gamer ASUS TUF RTX 3050', price: 5490.00, cost: 4350.00, stock: 5, unit: 'UNIDAD', category: 'cat-laptops', ventaTipica: 1, minStock: 2 },

    // — Celulares —
    { id: 't4', code: 'CEL-SAM-A55', sku: 'CEL-SAM-A55', barcode: '7752001000039', name: 'Samsung Galaxy A55 256GB', description: 'Liberado, garantía oficial 1 año', price: 1699.00, cost: 1340.00, stock: 22, unit: 'UNIDAD', category: 'cat-celulares', ventaTipica: 1, minStock: 6 },
    { id: 't5', code: 'CEL-XIA-14', sku: 'CEL-XIA-14', barcode: '7752001000046', name: 'Xiaomi Redmi Note 14 128GB', price: 999.00, cost: 760.00, stock: 30, unit: 'UNIDAD', category: 'cat-celulares', ventaTipica: 1, minStock: 8 },
    { id: 't6', code: 'CEL-IPH-15', sku: 'CEL-IPH-15', name: 'iPhone 15 128GB', price: 4290.00, cost: 3580.00, stock: 6, unit: 'UNIDAD', category: 'cat-celulares', ventaTipica: 1, minStock: 2 },

    // — Componentes —
    { id: 't7', code: 'SSD-KIN-1TB', sku: 'SSD-KIN-1TB', barcode: '7752001000053', name: 'SSD Kingston NV2 1TB NVMe', price: 289.00, cost: 205.00, stock: 45, unit: 'UNIDAD', category: 'cat-componentes', ventaTipica: 2, minStock: 12 },
    { id: 't8', code: 'RAM-COR-16', sku: 'RAM-COR-16', barcode: '7752001000060', name: 'Memoria RAM Corsair 16GB DDR4', price: 219.00, cost: 158.00, stock: 38, unit: 'UNIDAD', category: 'cat-componentes', ventaTipica: 2, minStock: 10 },
    { id: 't9', code: 'MON-LG-24', sku: 'MON-LG-24', name: 'Monitor LG 24" Full HD 75Hz', price: 549.00, cost: 420.00, stock: 18, unit: 'UNIDAD', category: 'cat-componentes', ventaTipica: 1, minStock: 5 },

    // — Accesorios (rotación alta, ticket bajo) —
    { id: 't10', code: 'MOU-LOG-M170', sku: 'MOU-LOG-M170', barcode: '7752001000077', name: 'Mouse inalámbrico Logitech M170', price: 59.00, cost: 36.00, stock: 120, unit: 'UNIDAD', category: 'cat-accesorios', ventaTipica: 3, minStock: 30 },
    { id: 't11', code: 'TEC-MEC-RGB', sku: 'TEC-MEC-RGB', barcode: '7752001000084', name: 'Teclado mecánico RGB switch azul', price: 189.00, cost: 128.00, stock: 34, unit: 'UNIDAD', category: 'cat-accesorios', ventaTipica: 1, minStock: 8 },
    { id: 't12', code: 'AUD-BT-INA', sku: 'AUD-BT-INA', barcode: '7752001000091', name: 'Audífonos Bluetooth con estuche', price: 129.00, cost: 74.00, stock: 65, unit: 'UNIDAD', category: 'cat-accesorios', ventaTipica: 2, minStock: 15 },
    { id: 't13', code: 'CAR-USB-65', sku: 'CAR-USB-65', name: 'Cargador USB-C 65W carga rápida', price: 89.00, cost: 48.00, stock: 80, unit: 'UNIDAD', category: 'cat-accesorios', ventaTipica: 3, minStock: 20 },
    { id: 't14', code: 'CAB-HDM-2M', sku: 'CAB-HDM-2M', barcode: '7752001000114', name: 'Cable HDMI 2.0 4K x 2m', price: 35.00, cost: 17.00, stock: 150, unit: 'UNIDAD', category: 'cat-accesorios', ventaTipica: 4, minStock: 40 },
    { id: 't15', code: 'MOC-LAP-15', sku: 'MOC-LAP-15', name: 'Mochila para laptop 15.6"', price: 119.00, cost: 62.00, stock: 42, unit: 'UNIDAD', category: 'cat-accesorios', ventaTipica: 1, minStock: 10 },

    // — Impresión —
    { id: 't16', code: 'IMP-EPS-L3250', sku: 'IMP-EPS-L3250', barcode: '7752001000138', name: 'Impresora Epson L3250 multifuncional', price: 849.00, cost: 690.00, stock: 16, unit: 'UNIDAD', category: 'cat-impresion', ventaTipica: 1, minStock: 4 },
    { id: 't17', code: 'TIN-EPS-664', sku: 'TIN-EPS-664', barcode: '7752001000145', name: 'Tinta Epson 664 negra 70ml', price: 42.00, cost: 26.00, stock: 95, unit: 'UNIDAD', category: 'cat-impresion', ventaTipica: 3, minStock: 25 },
    { id: 't18', code: 'PAP-A4-75', sku: 'PAP-A4-75', name: 'Papel bond A4 75g millar', price: 24.90, cost: 16.00, stock: 110, unit: 'MILLAR', category: 'cat-impresion', ventaTipica: 2, minStock: 30 },

    // — Servicios: el rubro vive tanto del servicio como del equipo —
    { id: 't19', code: 'SER-MAN-PC', name: 'Mantenimiento preventivo de PC', description: 'Limpieza física y de software', price: 80.00, cost: 0, stock: null, trackStock: false, unit: 'SERVICIO', category: 'cat-servicios', ventaTipica: 2 },
    { id: 't20', code: 'SER-INS-WIN', name: 'Instalación de Windows y programas', price: 60.00, cost: 0, stock: null, trackStock: false, unit: 'SERVICIO', category: 'cat-servicios', ventaTipica: 2 },
    { id: 't21', code: 'SER-CAM-PAN', name: 'Cambio de pantalla de celular', description: 'Mano de obra, repuesto aparte', price: 150.00, cost: 0, stock: null, trackStock: false, unit: 'SERVICIO', category: 'cat-servicios', ventaTipica: 1 },
  ],

  clientes: [
    { id: 'c1', documentType: '6', documentNumber: '20602345678', name: 'ESTUDIO CONTABLE ANDRADE SAC', email: 'admin@estudioandrade.pe', phone: '987212223', address: 'Av. Petit Thouars 2100, Lince' },
    { id: 'c2', documentType: '6', documentNumber: '20549876543', name: 'COLEGIO SAN AGUSTÍN EIRL', email: 'logistica@sanagustin.edu.pe', phone: '987242526', address: 'Av. Javier Prado 980, San Isidro' },
    { id: 'c3', documentType: '6', documentNumber: '20517654321', name: 'IMPORTACIONES DEL CENTRO SRL', email: 'compras@impcentro.pe', phone: '987272829', address: 'Jr. Paruro 1180, Lima' },
    { id: 'c4', documentType: '1', documentNumber: '44556677', name: 'Diego Salcedo Márquez', phone: '987303132', address: 'Av. Colonial 3200, Callao' },
    { id: 'c5', documentType: '1', documentNumber: '07788990', name: 'Patricia Ochoa Rivas', phone: '987333435', address: 'Jr. Huancavelica 450, Lima' },
  ],

  proveedores: [
    { id: 'p1', name: 'DISTRIBUIDORA TECNOLÓGICA ANDINA SAC', ruc: '20111222333', phone: '01-3334455', email: 'ventas@tecandina.pe', address: 'Av. Argentina 2100, Callao' },
    { id: 'p2', name: 'IMPORT CELULARES PERÚ EIRL', ruc: '20444555666', phone: '01-5556677', email: 'pedidos@importcel.pe', address: 'Jr. Paruro 1250, Lima' },
    { id: 'p3', name: 'SUMINISTROS DE OFICINA DEL SUR SRL', ruc: '20777888999', phone: '01-7778899', email: 'contacto@sumsur.pe', address: 'Av. Aviación 2800, San Borja' },
  ],

  gastos: [
    { category: 'servicios', description: 'Garantías y devoluciones a proveedor', amount: 380 },
    { category: 'marketing', description: 'Publicidad en Marketplace', amount: 450 },
  ],
}
