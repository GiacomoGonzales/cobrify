/**
 * Demo de TIENDA DE ROPA.
 *
 * El rubro se define por las VARIANTES: la misma prenda en varias tallas y
 * colores, cada una con su propio stock y su propio código. Por eso acá los
 * productos importantes van con `hasVariants` — es lo primero que una tienda
 * de ropa quiere ver funcionando.
 *
 * `attributes` usa las mismas claves que el sistema real ({ Talla, Color }).
 */

/** Arma las variantes de una prenda: una por cada talla × color. */
const variantes = (base, tallas, colores, precio, stockPorVariante) => {
  const lista = []
  colores.forEach((color, ci) => {
    tallas.forEach((talla, ti) => {
      lista.push({
        sku: `${base}-${color.slice(0, 3).toUpperCase()}-${talla}`,
        attributes: { Color: color, Talla: talla },
        price: precio,
        stock: Math.max(0, stockPorVariante - ci - ti * 2),
      })
    })
  })
  return lista
}

const sumaStock = (vs) => vs.reduce((s, v) => s + (v.stock || 0), 0)

const conVariantes = (p, vs) => ({
  ...p,
  hasVariants: true,
  variants: vs,
  stock: sumaStock(vs),
})

export default {
  slug: 'ropa',
  nombre: 'Tienda de ropa',
  businessMode: 'retail',

  negocio: {
    businessName: 'BOUTIQUE ESTILO URBANO SAC',
    ruc: '20556677889',
    address: 'Av. La Marina 2450, San Miguel',
    phone: '01-5678901',
    email: 'ventas@estilourbano.pe',
    website: 'www.estilourbano.pe',
    companySlogan: 'ROPA URBANA PARA HOMBRE Y MUJER — TEMPORADA 2026',
    catalogTagline: 'Lo nuevo de la temporada',
    catalogWelcome: 'Envíos a todo el Perú. Cambios sin costo dentro de los 7 días.',
    catalogColor: '#7C3AED',
    catalogWhatsapp: '51987654321',
  },

  /**
   * Sin cocina ni citas. Se queda el catálogo online y los envíos: una tienda
   * de ropa vende por redes y despacha a provincia.
   */
  menusOcultos: [
    'vet-agenda', 'tables', 'kitchen', 'orders', 'recipes', 'production',
    'ingredients', 'purchase-history', 'requirements', 'expiry-alerts',
    'batch-control', 'student-payments', 'loans', 'rappi-orders', 'meta-ads',
    'certificates', 'carrier-dispatch-guides', 'my-schedule', 'attendance',
  ],

  /** Envíos a domicilio: buena parte de la venta viene de redes. */
  reparto: ['Diana Alarcón', 'Kevin Soto'],

  almacenes: [
    { name: 'Tienda La Marina', location: 'Av. La Marina 2450, San Miguel' },
    { name: 'Depósito', location: 'Jr. Castilla 180, San Miguel' },
  ],

  categorias: [
    { id: 'cat-mujer', name: 'Mujer', parentId: null },
    { id: 'cat-hombre', name: 'Hombre', parentId: null },
    { id: 'cat-calzado', name: 'Calzado', parentId: null },
    { id: 'cat-accesorios', name: 'Accesorios', parentId: null },
    { id: 'cat-polos-m', name: 'Polos y blusas', parentId: 'cat-mujer' },
    { id: 'cat-pantalones-m', name: 'Pantalones', parentId: 'cat-mujer' },
    { id: 'cat-polos-h', name: 'Polos y camisas', parentId: 'cat-hombre' },
    { id: 'cat-pantalones-h', name: 'Pantalones', parentId: 'cat-hombre' },
  ],

  productos: [
    // — Mujer, con variantes de talla y color —
    conVariantes(
      { id: 'r1', code: 'BLU-SAT-001', sku: 'BLU-SAT-001', name: 'Blusa satinada manga larga', description: 'Tela satinada, corte regular', price: 89.90, cost: 42.00, unit: 'UNIDAD', category: 'cat-polos-m', ventaTipica: 2, minStock: 6 },
      variantes('BLU', ['S', 'M', 'L'], ['Negro', 'Vino', 'Beige'], 89.90, 9),
    ),
    conVariantes(
      { id: 'r2', code: 'JEA-MOM-002', sku: 'JEA-MOM-002', name: 'Jean mom fit tiro alto', description: 'Denim rígido, tiro alto', price: 129.90, cost: 62.00, unit: 'UNIDAD', category: 'cat-pantalones-m', ventaTipica: 1, minStock: 5 },
      variantes('JEA', ['26', '28', '30', '32'], ['Azul', 'Celeste'], 129.90, 8),
    ),
    conVariantes(
      { id: 'r3', code: 'VES-FLO-003', sku: 'VES-FLO-003', name: 'Vestido midi estampado', price: 149.90, cost: 71.00, unit: 'UNIDAD', category: 'cat-mujer', ventaTipica: 1, minStock: 4 },
      variantes('VES', ['S', 'M', 'L'], ['Floral', 'Negro'], 149.90, 6),
    ),

    // — Hombre —
    conVariantes(
      { id: 'r4', code: 'POL-BAS-004', sku: 'POL-BAS-004', name: 'Polo básico algodón pima', description: 'Algodón pima 100%', price: 59.90, cost: 24.00, unit: 'UNIDAD', category: 'cat-polos-h', ventaTipica: 3, minStock: 10 },
      variantes('POL', ['S', 'M', 'L', 'XL'], ['Blanco', 'Negro', 'Azul'], 59.90, 12),
    ),
    conVariantes(
      { id: 'r5', code: 'CAM-OXF-005', sku: 'CAM-OXF-005', name: 'Camisa oxford manga larga', price: 119.90, cost: 55.00, unit: 'UNIDAD', category: 'cat-polos-h', ventaTipica: 1, minStock: 5 },
      variantes('CAM', ['M', 'L', 'XL'], ['Celeste', 'Blanco'], 119.90, 7),
    ),
    conVariantes(
      { id: 'r6', code: 'PAN-CHI-006', sku: 'PAN-CHI-006', name: 'Pantalón chino slim', price: 139.90, cost: 66.00, unit: 'UNIDAD', category: 'cat-pantalones-h', ventaTipica: 1, minStock: 5 },
      variantes('PAN', ['30', '32', '34', '36'], ['Beige', 'Negro'], 139.90, 7),
    ),
    conVariantes(
      { id: 'r7', code: 'CAS-DEN-007', sku: 'CAS-DEN-007', name: 'Casaca denim clásica', price: 199.90, cost: 96.00, unit: 'UNIDAD', category: 'cat-hombre', ventaTipica: 1, minStock: 3 },
      variantes('CAS', ['M', 'L', 'XL'], ['Azul'], 199.90, 5),
    ),

    // — Calzado: variantes solo de talla —
    conVariantes(
      { id: 'r8', code: 'ZAP-URB-008', sku: 'ZAP-URB-008', name: 'Zapatilla urbana unisex', price: 179.90, cost: 88.00, unit: 'PAR', category: 'cat-calzado', ventaTipica: 1, minStock: 4 },
      variantes('ZAP', ['37', '38', '39', '40', '41', '42'], ['Blanco', 'Negro'], 179.90, 6),
    ),
    conVariantes(
      { id: 'r9', code: 'BOT-CUE-009', sku: 'BOT-CUE-009', name: 'Botín de cuero mujer', price: 229.90, cost: 112.00, unit: 'PAR', category: 'cat-calzado', ventaTipica: 1, minStock: 3 },
      variantes('BOT', ['35', '36', '37', '38'], ['Camel', 'Negro'], 229.90, 4),
    ),

    // — Accesorios: sin variantes, alta rotación —
    { id: 'r10', code: 'CIN-CUE-010', sku: 'CIN-CUE-010', barcode: '7751234000107', name: 'Correa de cuero clásica', price: 69.90, cost: 28.00, stock: 34, unit: 'UNIDAD', category: 'cat-accesorios', ventaTipica: 2, minStock: 8 },
    { id: 'r11', code: 'GOR-URB-011', sku: 'GOR-URB-011', barcode: '7751234000114', name: 'Gorra urbana bordada', price: 45.00, cost: 17.00, stock: 60, unit: 'UNIDAD', category: 'cat-accesorios', ventaTipica: 3, minStock: 15 },
    { id: 'r12', code: 'MED-PAC-012', sku: 'MED-PAC-012', barcode: '7751234000121', name: 'Pack 3 medias deportivas', price: 29.90, cost: 11.00, stock: 120, unit: 'PACK', category: 'cat-accesorios', ventaTipica: 4, minStock: 25 },
    { id: 'r13', code: 'BIL-CUE-013', sku: 'BIL-CUE-013', name: 'Billetera de cuero', price: 79.90, cost: 34.00, stock: 28, unit: 'UNIDAD', category: 'cat-accesorios', ventaTipica: 1, minStock: 8 },
    { id: 'r14', code: 'MOC-TEL-014', sku: 'MOC-TEL-014', barcode: '7751234000145', name: 'Mochila de tela impermeable', price: 119.90, cost: 52.00, stock: 22, unit: 'UNIDAD', category: 'cat-accesorios', ventaTipica: 1, minStock: 6 },

    // — Servicio del rubro —
    { id: 'r15', code: 'SER-BAS-015', name: 'Ajuste de basta', description: 'Servicio de sastrería', price: 15.00, cost: 0, stock: null, trackStock: false, unit: 'SERVICIO', category: 'cat-accesorios', ventaTipica: 2 },
  ],

  clientes: [
    { id: 'c1', documentType: '6', documentNumber: '20601234567', name: 'CORPORACIÓN TEXTIL DEL PACÍFICO SAC', email: 'compras@textilpacifico.pe', phone: '987121314', address: 'Av. Aviación 3400, San Borja' },
    { id: 'c2', documentType: '6', documentNumber: '20587654321', name: 'UNIFORMES EMPRESARIALES LIMA EIRL', email: 'pedidos@uniformeslima.pe', phone: '987151617', address: 'Jr. Gamarra 850, La Victoria' },
    { id: 'c3', documentType: '1', documentNumber: '46789012', name: 'Andrea Campos Ruiz', phone: '987181920', address: 'Av. Brasil 1200, Jesús María' },
    { id: 'c4', documentType: '1', documentNumber: '08765432', name: 'Marco Zevallos Lira', phone: '987212223', address: 'Calle Bolívar 560, Pueblo Libre' },
    { id: 'c5', documentType: '1', documentNumber: '47890123', name: 'Lucía Ferrer Ávila', phone: '987242526', address: 'Av. Universitaria 4100, San Miguel' },
  ],

  proveedores: [
    { id: 'p1', name: 'TEXTILES GAMARRA IMPORT SAC', ruc: '20345678912', phone: '01-3216549', email: 'ventas@textilesgamarra.pe', address: 'Jr. Antonio Bazo 720, La Victoria' },
    { id: 'p2', name: 'CALZADO ANDINO DISTRIBUCIONES EIRL', ruc: '20678912345', phone: '01-6543219', email: 'pedidos@calzadoandino.pe', address: 'Av. Grau 1450, Trujillo' },
    { id: 'p3', name: 'ACCESORIOS Y COMPLEMENTOS PERÚ SRL', ruc: '20891234567', phone: '01-9876543', email: 'contacto@accesoriosperu.pe', address: 'Av. Abancay 890, Lima' },
  ],

  gastos: [
    { category: 'marketing', description: 'Publicidad en redes sociales', amount: 600 },
    { category: 'otros', description: 'Bolsas y etiquetas de marca', amount: 240 },
  ],
}
