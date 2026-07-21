// Data DEMO del catálogo público (retail y restaurante).
// Extraída de CatalogoPublico.jsx (F1.1) sin cambios.
// Datos demo para el catálogo
export const DEMO_CATALOG_DATA = {
  business: {
    id: 'demo',
    businessName: 'EMPRESA DEMO SAC',
    name: 'EMPRESA DEMO SAC',
    ruc: '20123456789',
    address: 'Av. Larco 1234, Miraflores',
    phone: '01-2345678',
    email: 'ventas@empresademo.com',
    website: 'www.empresademo.com',
    logoUrl: '/demologo.png',
    catalogEnabled: true,
    catalogSlug: 'demo',
    catalogTagline: 'Tu tienda de tecnología y belleza',
    catalogWelcome: 'Bienvenido a nuestra tienda demo. Explora nuestros productos de electrónica y belleza.',
    catalogColor: '#10B981',
    catalogWhatsapp: '51987654321',
    catalogShowPrices: true,
    catalogAllowOrders: true,
    catalogShowStock: true,
    catalogObservations: 'Pagos: BCP Cta. Ahorros 123-456789-0-12\nYape / Plin: 987 654 321\nWhatsApp ventas: 987 654 321',
  },
  products: [
    { id: '1', code: 'PROD001', name: 'Laptop HP 15"', description: 'Laptop HP 15 pulgadas, Intel Core i5, 8GB RAM', price: 2500.00, stock: 15, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '2', code: 'PROD002', name: 'Mouse Inalámbrico', description: 'Mouse inalámbrico Logitech', price: 45.00, stock: 50, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '3', code: 'PROD003', name: 'Teclado Mecánico', description: 'Teclado mecánico RGB', price: 180.00, stock: 25, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '4', code: 'PROD004', name: 'Monitor 24"', description: 'Monitor LED 24 pulgadas Full HD', price: 650.00, stock: 12, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '5', code: 'PROD005', name: 'Crema Hidratante Facial', description: 'Crema hidratante profesional para tratamientos faciales', price: 85.00, stock: 24, category: 'cat-belleza', imageUrl: 'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '6', code: 'PROD006', name: 'Aceite Esencial Lavanda', description: 'Aceite esencial puro para aromaterapia', price: 65.00, stock: 18, category: 'cat-belleza', imageUrl: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '7', code: 'PROD007', name: 'Audífonos Bluetooth', description: 'Audífonos inalámbricos con cancelación de ruido', price: 250.00, stock: 35, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '8', code: 'PROD008', name: 'Webcam HD 1080p', description: 'Cámara web Full HD con micrófono integrado', price: 180.00, stock: 28, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1587826080692-f439cd0b70da?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '9', code: 'PROD009', name: 'Hub USB 7 puertos', description: 'Hub USB 3.0 de 7 puertos con alimentación', price: 85.00, stock: 42, category: 'cat-electronica', imageUrl: 'https://images.unsplash.com/photo-1625723044792-44de16ccb4e9?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '10', code: 'PROD010', name: 'Mascarilla Facial', description: 'Mascarilla hidratante de colágeno', price: 35.00, stock: 60, category: 'cat-belleza', imageUrl: 'https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '11', code: 'PROD011', name: 'Sérum Vitamina C', description: 'Sérum antioxidante con vitamina C pura', price: 95.00, stock: 32, category: 'cat-belleza', imageUrl: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop', catalogVisible: true },
    { id: '12', code: 'PROD012', name: 'Kit Manicure Profesional', description: 'Set completo de herramientas para manicure', price: 120.00, stock: 20, category: 'cat-belleza', imageUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=400&fit=crop', catalogVisible: true },
  ],
  categories: [
    { id: 'cat-electronica', name: 'Electrónica' },
    { id: 'cat-belleza', name: 'Belleza' },
  ]
}

// Datos demo para el menú de restaurante
export const DEMO_RESTAURANT_DATA = {
  business: {
    id: 'demo-restaurant',
    businessName: 'RESTAURANTE DEMO',
    name: 'La Buena Mesa',
    ruc: '20123456789',
    address: 'Av. Gastronómica 456, Lima',
    phone: '01-9876543',
    email: 'reservas@labuenamesa.com',
    logoUrl: '/demologo.png',
    catalogEnabled: true,
    menuEnabled: true,
    catalogSlug: 'demo',
    menuSlug: 'demo',
    catalogTagline: 'Sabores que enamoran',
    catalogWelcome: '¡Bienvenido! Descubre nuestra carta y haz tu pedido.',
    catalogColor: '#F97316',
    catalogShowPrices: true,
    catalogObservations: 'Horario: Lun-Sáb 12:00 - 22:00 | Dom 12:00 - 18:00\nReservas: 01-9876543 / WhatsApp 987 654 321',
    taxConfig: { igvRate: 18, igvExempt: false }
  },
  products: [
    // Entradas
    { id: 'r1', code: 'ENT001', name: 'Ceviche Clásico', description: 'Pescado fresco marinado en limón con cebolla, camote y choclo', price: 38.00, category: 'cat-entradas', imageUrl: 'https://images.unsplash.com/photo-1535399831218-d5bd36d1a6b3?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r2', code: 'ENT002', name: 'Causa Limeña', description: 'Capas de papa amarilla con pollo, palta y mayonesa', price: 28.00, category: 'cat-entradas', imageUrl: 'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r3', code: 'ENT003', name: 'Tequeños de Queso', description: '6 unidades con salsa huancaína', price: 18.00, category: 'cat-entradas', imageUrl: 'https://images.unsplash.com/photo-1541014741259-de529411b96a?w=400&h=400&fit=crop', catalogVisible: true },
    // Platos de fondo
    { id: 'r4', code: 'PLT001', name: 'Lomo Saltado', description: 'Lomo fino salteado con cebolla, tomate, papas fritas y arroz', price: 42.00, category: 'cat-platos', imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r5', code: 'PLT002', name: 'Arroz con Mariscos', description: 'Arroz con camarones, pulpo, calamar y conchas', price: 48.00, category: 'cat-platos', imageUrl: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r6', code: 'PLT003', name: 'Pollo a la Brasa', description: '1/4 de pollo con papas fritas, ensalada y cremas', price: 28.00, category: 'cat-platos', imageUrl: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r7', code: 'PLT004', name: 'Ají de Gallina', description: 'Pechuga deshilachada en crema de ají amarillo con arroz y papa', price: 32.00, category: 'cat-platos', imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=400&fit=crop', catalogVisible: true },
    // Bebidas
    { id: 'r8', code: 'BEB001', name: 'Chicha Morada', description: 'Refresco tradicional de maíz morado (1 litro)', price: 12.00, category: 'cat-bebidas', imageUrl: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r9', code: 'BEB002', name: 'Pisco Sour', description: 'Cóctel clásico peruano con pisco, limón y clara de huevo', price: 22.00, category: 'cat-bebidas', imageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r10', code: 'BEB003', name: 'Limonada Frozen', description: 'Limonada helada refrescante', price: 10.00, category: 'cat-bebidas', imageUrl: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400&h=400&fit=crop', catalogVisible: true },
    // Postres
    { id: 'r11', code: 'POS001', name: 'Suspiro a la Limeña', description: 'Dulce de leche con merengue de oporto', price: 15.00, category: 'cat-postres', imageUrl: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop', catalogVisible: true },
    { id: 'r12', code: 'POS002', name: 'Picarones', description: '6 picarones con miel de chancaca', price: 18.00, category: 'cat-postres', imageUrl: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=400&fit=crop', catalogVisible: true },
  ],
  categories: [
    { id: 'cat-entradas', name: 'Entradas' },
    { id: 'cat-platos', name: 'Platos de Fondo' },
    { id: 'cat-bebidas', name: 'Bebidas' },
    { id: 'cat-postres', name: 'Postres' },
  ]
}
