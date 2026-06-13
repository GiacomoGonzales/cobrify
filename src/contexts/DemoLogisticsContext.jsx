import { createContext, useContext, useState, useEffect } from 'react'

const DemoLogisticsContext = createContext(null)

// Simula un Timestamp de Firestore (las páginas de logística leen createdAt con
// .toDate()/.seconds). Así las fechas demo se muestran sin tocar esas páginas.
const ts = (d) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000) })

// Datos de ejemplo para el demo de logística (empresa de obras / construcción)
const generateLogisticsDemoData = () => {
  const today = new Date()
  const daysAgo = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n, 9, 30, 0)

  return {
    user: {
      uid: 'demo-logistics-user',
      email: 'demo@logistica.com',
      displayName: 'Usuario Demo Logística',
      photoURL: null,
    },
    business: {
      businessName: 'CONSTRUCTORA Y LOGÍSTICA ANDINA SAC',
      name: 'CONSTRUCTORA ANDINA',
      ruc: '20512345678',
      address: 'Av. Industrial 1450, Ate',
      district: 'Ate',
      province: 'Lima',
      department: 'Lima',
      phone: '01-7654321',
      email: 'contacto@constructoraandina.com',
      mode: 'logistics',
      businessMode: 'logistics',
    },
    subscription: { status: 'active', plan: 'unlimited_12_months', currentPeriodEnd: new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()), accessBlocked: false },

    // Almacenes
    warehouses: [
      { id: 'w1', name: 'Almacén Central', location: 'Av. Industrial 1450, Ate', isDefault: true, isActive: true, createdAt: daysAgo(200) },
      { id: 'w2', name: 'Almacén de Obra', location: 'Patio de maniobras', isDefault: false, isActive: true, createdAt: daysAgo(120) },
    ],

    // Categorías de materiales
    categories: [
      { id: 'cat-cemento', name: 'Cemento y Agregados', parentId: null },
      { id: 'cat-acero', name: 'Fierro y Acero', parentId: null },
      { id: 'cat-tuberias', name: 'Tuberías y Sanitarios', parentId: null },
      { id: 'cat-electrico', name: 'Material Eléctrico', parentId: null },
      { id: 'cat-epp', name: 'Seguridad (EPP)', parentId: null },
    ],

    // Productos / materiales
    products: [
      { id: 'prod1', code: 'CEM-001', name: 'Cemento Sol Tipo I 42.5 kg', marca: 'Sol', price: 28.50, cost: 24.00, stock: 480, unit: 'BOLSA', category: 'cat-cemento', trackStock: true, warehouseStocks: [{ warehouseId: 'w1', stock: 480, minStock: 100 }] },
      { id: 'prod2', code: 'FIE-012', name: 'Fierro Corrugado 1/2" x 9m', marca: 'Aceros Arequipa', price: 38.00, cost: 32.50, stock: 320, unit: 'VARILLA', category: 'cat-acero', trackStock: true, warehouseStocks: [{ warehouseId: 'w1', stock: 320, minStock: 50 }] },
      { id: 'prod3', code: 'LAD-018', name: 'Ladrillo King Kong 18 huecos', marca: 'Lark', price: 1.20, cost: 0.95, stock: 12000, unit: 'UNIDAD', category: 'cat-cemento', trackStock: true, warehouseStocks: [{ warehouseId: 'w1', stock: 12000, minStock: 2000 }] },
      { id: 'prod4', code: 'PVC-004', name: 'Tubería PVC 4" Desagüe x 3m', marca: 'Pavco', price: 24.90, cost: 19.50, stock: 180, unit: 'UNIDAD', category: 'cat-tuberias', trackStock: true, warehouseStocks: [{ warehouseId: 'w1', stock: 180, minStock: 30 }] },
      { id: 'prod5', code: 'CAB-014', name: 'Cable THW 14 AWG (rollo 100m)', marca: 'Indeco', price: 145.00, cost: 120.00, stock: 60, unit: 'ROLLO', category: 'cat-electrico', trackStock: true, warehouseStocks: [{ warehouseId: 'w1', stock: 60, minStock: 10 }] },
      { id: 'prod6', code: 'AGR-001', name: 'Arena Gruesa', marca: '', price: 55.00, cost: 42.00, stock: 90, unit: 'M3', category: 'cat-cemento', trackStock: true, warehouseStocks: [{ warehouseId: 'w1', stock: 90, minStock: 15 }] },
      { id: 'prod7', code: 'PIN-001', name: 'Pintura Látex Blanco 1 gal', marca: 'CPP', price: 42.00, cost: 33.00, stock: 75, unit: 'GALON', category: 'cat-cemento', trackStock: true, warehouseStocks: [{ warehouseId: 'w1', stock: 75, minStock: 20 }] },
      { id: 'prod8', code: 'ALA-016', name: 'Alambre Negro #16', marca: 'Aceros Arequipa', price: 6.50, cost: 5.20, stock: 210, unit: 'KG', category: 'cat-acero', trackStock: true, warehouseStocks: [{ warehouseId: 'w1', stock: 210, minStock: 40 }] },
      { id: 'prod9', code: 'TUB-002', name: 'Tubo Cuadrado 2"x2" x 6m', marca: 'Precor', price: 58.00, cost: 47.00, stock: 95, unit: 'UNIDAD', category: 'cat-acero', trackStock: true, warehouseStocks: [{ warehouseId: 'w1', stock: 95, minStock: 20 }] },
      { id: 'prod10', code: 'EPP-001', name: 'Casco de Seguridad', marca: 'Steelpro', price: 18.00, cost: 12.00, stock: 140, unit: 'UNIDAD', category: 'cat-epp', trackStock: true, warehouseStocks: [{ warehouseId: 'w1', stock: 140, minStock: 30 }] },
    ],

    // Clientes
    customers: [
      { id: 'c1', documentType: '6', documentNumber: '20100200300', name: 'INMOBILIARIA DEL SUR SAC', businessName: 'INMOBILIARIA DEL SUR SAC', address: 'Av. El Sol 980, Surco', phone: '014445566', email: 'compras@inmosur.com' },
      { id: 'c2', documentType: '6', documentNumber: '20455667788', name: 'CONSORCIO VIAL LIMA NORTE', businessName: 'CONSORCIO VIAL LIMA NORTE', address: 'Panamericana Norte Km 25', phone: '013334455', email: 'logistica@vialnorte.com' },
      { id: 'c3', documentType: '1', documentNumber: '41258963', name: 'Roberto Salazar Quispe', businessName: '', address: 'Jr. Las Acacias 230, Ate', phone: '987654321', email: '' },
    ],

    // Proveedores
    suppliers: [
      { id: 's1', documentType: '6', documentNumber: '20331122334', businessName: 'DISTRIBUIDORA DE ACEROS DEL PERÚ SAC', contactName: 'Luis Vega', email: 'ventas@acerosperu.com', phone: '015551234' },
      { id: 's2', documentType: '6', documentNumber: '20447788991', businessName: 'CEMENTOS Y AGREGADOS LIMA EIRL', contactName: 'Ana Ramos', email: 'pedidos@cementoslima.com', phone: '015559876' },
    ],

    // Proyectos / Obras
    projects: [
      { id: 'p1', code: 'OB-001', name: 'Edificio Multifamiliar Los Olivos', address: 'Av. Universitaria 3200, Los Olivos', city: 'Lima', description: 'Edificio de 8 pisos, 32 departamentos', responsibleName: 'Ing. Carlos Paredes', responsiblePhone: '987111222', startDate: '2026-02-01', endDate: '2026-12-20', status: 'active', createdAt: ts(daysAgo(130)) },
      { id: 'p2', code: 'OB-002', name: 'Centro Comercial Plaza Norte', address: 'Av. Alfredo Mendiola 1400', city: 'Lima', description: 'Ampliación de food court y estacionamientos', responsibleName: 'Ing. Mariana Torres', responsiblePhone: '987333444', startDate: '2026-03-15', endDate: '2026-10-30', status: 'active', createdAt: ts(daysAgo(90)) },
      { id: 'p3', code: 'OB-003', name: 'Remodelación Oficinas San Isidro', address: 'Calle Las Begonias 450, San Isidro', city: 'Lima', description: 'Remodelación integral piso 12', responsibleName: 'Ing. Carlos Paredes', responsiblePhone: '987111222', startDate: '2026-05-02', endDate: '2026-08-15', status: 'active', createdAt: ts(daysAgo(40)) },
      { id: 'p4', code: 'OB-004', name: 'Condominio Surco Etapa 1', address: 'Av. El Derby 250, Surco', city: 'Lima', description: 'Movimiento de tierras y cimentación', responsibleName: 'Ing. Diego Flores', responsiblePhone: '987555666', startDate: '2026-01-10', endDate: '2026-06-30', status: 'paused', createdAt: ts(daysAgo(150)) },
      { id: 'p5', code: 'OB-005', name: 'Colegio San Martín - Ate', address: 'Av. Nicolás Ayllón 5600, Ate', city: 'Lima', description: 'Construcción de pabellón de aulas', responsibleName: 'Ing. Mariana Torres', responsiblePhone: '987333444', startDate: '2025-08-01', endDate: '2026-01-30', status: 'finished', createdAt: ts(daysAgo(300)) },
    ],

    // Salidas de almacén
    warehouseExits: [
      { id: 'e1', number: 'SAL-00001', exitType: 'project', projectId: 'p1', projectName: 'Edificio Multifamiliar Los Olivos', projectCode: 'OB-001', warehouseId: 'w1', warehouseName: 'Almacén Central', userName: 'Usuario Demo Logística', createdAt: ts(daysAgo(28)), notes: 'Material para vaciado de columnas piso 3',
        items: [
          { productId: 'prod1', productName: 'Cemento Sol Tipo I 42.5 kg', productCode: 'CEM-001', quantity: 80, unit: 'BOLSA' },
          { productId: 'prod2', productName: 'Fierro Corrugado 1/2" x 9m', productCode: 'FIE-012', quantity: 40, unit: 'VARILLA' },
          { productId: 'prod6', productName: 'Arena Gruesa', productCode: 'AGR-001', quantity: 12, unit: 'M3' },
        ], totalItems: 132 },
      { id: 'e2', number: 'SAL-00002', exitType: 'project', projectId: 'p2', projectName: 'Centro Comercial Plaza Norte', projectCode: 'OB-002', warehouseId: 'w1', warehouseName: 'Almacén Central', userName: 'Usuario Demo Logística', createdAt: ts(daysAgo(21)), notes: '',
        items: [
          { productId: 'prod3', productName: 'Ladrillo King Kong 18 huecos', productCode: 'LAD-018', quantity: 3000, unit: 'UNIDAD' },
          { productId: 'prod8', productName: 'Alambre Negro #16', productCode: 'ALA-016', quantity: 25, unit: 'KG' },
        ], totalItems: 3025 },
      { id: 'e3', number: 'SAL-00003', exitType: 'project', projectId: 'p3', projectName: 'Remodelación Oficinas San Isidro', projectCode: 'OB-003', warehouseId: 'w1', warehouseName: 'Almacén Central', userName: 'Usuario Demo Logística', createdAt: ts(daysAgo(14)), notes: 'Instalaciones eléctricas',
        items: [
          { productId: 'prod5', productName: 'Cable THW 14 AWG (rollo 100m)', productCode: 'CAB-014', quantity: 8, unit: 'ROLLO' },
          { productId: 'prod7', productName: 'Pintura Látex Blanco 1 gal', productCode: 'PIN-001', quantity: 20, unit: 'GALON' },
        ], totalItems: 28 },
      { id: 'e4', number: 'SAL-00004', exitType: 'simple', reason: 'office_use', reasonLabel: 'Uso en oficina', warehouseId: 'w1', warehouseName: 'Almacén Central', userName: 'Usuario Demo Logística', createdAt: ts(daysAgo(9)), notes: 'EPP para personal nuevo',
        items: [
          { productId: 'prod10', productName: 'Casco de Seguridad', productCode: 'EPP-001', quantity: 12, unit: 'UNIDAD' },
        ], totalItems: 12 },
      { id: 'e5', number: 'SAL-00005', exitType: 'project', projectId: 'p1', projectName: 'Edificio Multifamiliar Los Olivos', projectCode: 'OB-001', warehouseId: 'w1', warehouseName: 'Almacén Central', userName: 'Usuario Demo Logística', createdAt: ts(daysAgo(5)), notes: 'Instalaciones sanitarias',
        items: [
          { productId: 'prod4', productName: 'Tubería PVC 4" Desagüe x 3m', productCode: 'PVC-004', quantity: 35, unit: 'UNIDAD' },
          { productId: 'prod9', productName: 'Tubo Cuadrado 2"x2" x 6m', productCode: 'TUB-002', quantity: 18, unit: 'UNIDAD' },
        ], totalItems: 53 },
      { id: 'e6', number: 'SAL-00006', exitType: 'project', projectId: 'p2', projectName: 'Centro Comercial Plaza Norte', projectCode: 'OB-002', warehouseId: 'w1', warehouseName: 'Almacén Central', userName: 'Usuario Demo Logística', createdAt: ts(daysAgo(2)), notes: '',
        items: [
          { productId: 'prod1', productName: 'Cemento Sol Tipo I 42.5 kg', productCode: 'CEM-001', quantity: 120, unit: 'BOLSA' },
        ], totalItems: 120 },
    ],

    // Retornos a almacén
    warehouseReturns: [
      { id: 'r1', number: 'RET-00001', projectId: 'p1', projectName: 'Edificio Multifamiliar Los Olivos', projectCode: 'OB-001', warehouseId: 'w1', warehouseName: 'Almacén Central', receivedBy: 'Jorge Núñez (almacenero)', createdAt: ts(daysAgo(20)), notes: 'Sobrante de vaciado',
        items: [
          { productId: 'prod1', productName: 'Cemento Sol Tipo I 42.5 kg', productCode: 'CEM-001', quantity: 10, unit: 'BOLSA', condition: 'good', conditionNotes: '' },
          { productId: 'prod2', productName: 'Fierro Corrugado 1/2" x 9m', productCode: 'FIE-012', quantity: 3, unit: 'VARILLA', condition: 'damaged', conditionNotes: 'Dobladas' },
        ], totalItems: 13, goodItems: 10, damagedItems: 3, lostItems: 0 },
      { id: 'r2', number: 'RET-00002', projectId: 'p3', projectName: 'Remodelación Oficinas San Isidro', projectCode: 'OB-003', warehouseId: 'w1', warehouseName: 'Almacén Central', receivedBy: 'Jorge Núñez (almacenero)', createdAt: ts(daysAgo(8)), notes: '',
        items: [
          { productId: 'prod7', productName: 'Pintura Látex Blanco 1 gal', productCode: 'PIN-001', quantity: 4, unit: 'GALON', condition: 'good', conditionNotes: '' },
          { productId: 'prod5', productName: 'Cable THW 14 AWG (rollo 100m)', productCode: 'CAB-014', quantity: 1, unit: 'ROLLO', condition: 'lost', conditionNotes: 'No retornó de obra' },
        ], totalItems: 5, goodItems: 4, damagedItems: 0, lostItems: 1 },
      { id: 'r3', number: 'RET-00003', projectId: 'p2', projectName: 'Centro Comercial Plaza Norte', projectCode: 'OB-002', warehouseId: 'w1', warehouseName: 'Almacén Central', receivedBy: 'Jorge Núñez (almacenero)', createdAt: ts(daysAgo(3)), notes: 'Devolución por cambio de plano',
        items: [
          { productId: 'prod3', productName: 'Ladrillo King Kong 18 huecos', productCode: 'LAD-018', quantity: 400, unit: 'UNIDAD', condition: 'good', conditionNotes: '' },
        ], totalItems: 400, goodItems: 400, damagedItems: 0, lostItems: 0 },
    ],

    // Comprobantes (ventas a clientes/inmobiliarias)
    invoices: [
      { id: '1', number: 'F001-00000001', series: 'F001', documentType: 'factura', customerName: 'INMOBILIARIA DEL SUR SAC', customerDocumentNumber: '20100200300', customer: { name: 'INMOBILIARIA DEL SUR SAC', documentNumber: '20100200300' }, items: [{ name: 'Cemento Sol Tipo I 42.5 kg', quantity: 200, price: 28.50 }], subtotal: 4830.51, tax: 869.49, total: 5700.00, status: 'paid', paymentMethod: 'Transferencia', createdAt: daysAgo(18), issueDate: daysAgo(18) },
      { id: '2', number: 'F001-00000002', series: 'F001', documentType: 'factura', customerName: 'CONSORCIO VIAL LIMA NORTE', customerDocumentNumber: '20455667788', customer: { name: 'CONSORCIO VIAL LIMA NORTE', documentNumber: '20455667788' }, items: [{ name: 'Fierro Corrugado 1/2" x 9m', quantity: 100, price: 38.00 }], subtotal: 3220.34, tax: 579.66, total: 3800.00, status: 'pending', paymentMethod: '', createdAt: daysAgo(6), issueDate: daysAgo(6) },
    ],

    // Gastos
    expenses: [
      { id: 'exp1', date: daysAgo(15), description: 'Flete de materiales a obra Los Olivos', category: 'transporte', supplier: 'Transportes RZ', reference: 'G-001', paymentMethod: 'efectivo', amount: 450.00 },
      { id: 'exp2', date: daysAgo(7), description: 'Alquiler de andamios', category: 'alquileres', supplier: 'Andamios Lima', reference: 'REC-552', paymentMethod: 'transferencia', amount: 1200.00 },
    ],

    // Personal
    employees: [
      { id: 'lemp1', uid: 'lemp1', displayName: 'Jorge Núñez', email: 'jnunez@constructoraandina.com', department: 'Almacén', jobTitle: 'Almacenero', hrStatus: 'active', employmentType: 'full_time' },
      { id: 'lemp2', uid: 'lemp2', displayName: 'Ing. Carlos Paredes', email: 'cparedes@constructoraandina.com', department: 'Operaciones', jobTitle: 'Residente de Obra', hrStatus: 'active', employmentType: 'full_time' },
    ],
    attendanceRecords: [
      { id: 'latt1', userId: 'lemp1', userName: 'Jorge Núñez', branchId: 'main', branchName: 'Principal', type: 'in', timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 7, 55), approvalStatus: 'approved', notes: '' },
      { id: 'latt2', userId: 'lemp2', userName: 'Ing. Carlos Paredes', branchId: 'main', branchName: 'Principal', type: 'in', timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 5), approvalStatus: 'approved', notes: '' },
    ],

    getBusinessId: () => 'demo-logistics-user',
  }
}

export const DemoLogisticsProvider = ({ children }) => {
  const [demoData] = useState(generateLogisticsDemoData())

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__DEMO_DATA__ = demoData
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__DEMO_DATA__
      }
    }
  }, [demoData])

  const value = { isDemoMode: true, demoData }

  return <DemoLogisticsContext.Provider value={value}>{children}</DemoLogisticsContext.Provider>
}

export const useDemoLogistics = () => useContext(DemoLogisticsContext)

export default DemoLogisticsContext
