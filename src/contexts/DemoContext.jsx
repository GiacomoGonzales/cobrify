import { createContext, useContext, useState, useEffect } from 'react'

const DemoContext = createContext(null)

// Datos de ejemplo para el demo
const generateDemoData = () => {
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)

  return {
    user: {
      uid: 'demo-user',
      email: 'demo@cobrifyperu.com',
      displayName: 'Usuario Demo',
      photoURL: null,
    },
    business: {
      businessName: 'SPA BELLEZA NATURAL SAC',
      ruc: '20123456789',
      address: 'Av. Larco 1234, Miraflores',
      phone: '01-2345678',
      email: 'reservas@spabellezanatural.com',
      website: 'www.spabellezanatural.com',
    },
    products: [
      // Productos físicos de spa/salón
      {
        id: '1',
        code: 'PROD001',
        name: 'Crema Hidratante Facial Premium',
        description: 'Crema hidratante profesional para tratamientos faciales',
        price: 85.00,
        cost: 45.00,
        stock: 24,
        unit: 'UNIDAD',
        category: 'Productos',
        hasVariants: false,
      },
      {
        id: '2',
        code: 'PROD002',
        name: 'Aceite Esencial de Lavanda',
        description: 'Aceite esencial puro para aromaterapia',
        price: 65.00,
        cost: 28.00,
        stock: 18,
        unit: 'UNIDAD',
        category: 'Productos',
        hasVariants: false,
      },
      {
        id: '3',
        code: 'PROD003',
        name: 'Mascarilla de Arcilla',
        description: 'Mascarilla facial purificante de arcilla verde',
        price: 55.00,
        cost: 22.00,
        stock: 30,
        unit: 'UNIDAD',
        category: 'Productos',
        hasVariants: false,
      },
      {
        id: '4',
        code: 'PROD004',
        name: 'Kit Cera Depilatoria',
        description: 'Kit completo de cera para depilación profesional',
        price: 120.00,
        cost: 65.00,
        stock: 15,
        unit: 'UNIDAD',
        category: 'Productos',
        hasVariants: false,
      },
      {
        id: '5',
        code: 'PROD005',
        name: 'Gel Conductor Ultrasonido',
        description: 'Gel conductor para tratamientos de ultrasonido',
        price: 45.00,
        cost: 18.00,
        stock: 20,
        unit: 'UNIDAD',
        category: 'Productos',
        hasVariants: false,
      },
      // Servicios de spa/salón (con composición de insumos)
      {
        id: 'srv1',
        code: 'SERV001',
        name: 'Limpieza Facial Profunda',
        description: 'Tratamiento completo de limpieza facial con productos premium',
        price: 120.00,
        cost: 35.00,
        stock: null,
        unit: 'SERVICIO',
        category: 'Servicios Faciales',
        hasVariants: false,
        hasRecipe: true,
      },
      {
        id: 'srv2',
        code: 'SERV002',
        name: 'Masaje Relajante con Aromaterapia',
        description: 'Masaje de 60 minutos con aceites esenciales',
        price: 180.00,
        cost: 25.00,
        stock: null,
        unit: 'SERVICIO',
        category: 'Masajes',
        hasVariants: false,
        hasRecipe: true,
      },
      {
        id: 'srv3',
        code: 'SERV003',
        name: 'Depilación con Cera',
        description: 'Depilación profesional con cera caliente',
        price: 80.00,
        cost: 15.00,
        stock: null,
        unit: 'SERVICIO',
        category: 'Depilación',
        hasVariants: false,
        hasRecipe: true,
      },
      {
        id: 'srv4',
        code: 'SERV004',
        name: 'Tratamiento Reductivo con Ultrasonido',
        description: 'Sesión de ultrasonido para reducción de medidas',
        price: 250.00,
        cost: 40.00,
        stock: null,
        unit: 'SERVICIO',
        category: 'Tratamientos Corporales',
        hasVariants: false,
        hasRecipe: true,
      },
    ],
    customers: [
      {
        id: '1',
        documentType: '1',
        documentNumber: '45678901',
        name: 'María Fernández López',
        email: 'maria.fernandez@email.com',
        phone: '987654321',
        address: 'Av. Larco 890, Miraflores',
      },
      {
        id: '2',
        documentType: '1',
        documentNumber: '32165498',
        name: 'Carmen Ruiz Torres',
        email: 'carmen.ruiz@email.com',
        phone: '987654322',
        address: 'Jr. Cusco 456, San Isidro',
      },
      {
        id: '3',
        documentType: '1',
        documentNumber: '78945612',
        name: 'Ana García Mendoza',
        email: 'ana.garcia@email.com',
        phone: '987654323',
        address: 'Av. Pardo 234, Miraflores',
      },
      {
        id: '4',
        documentType: '6',
        documentNumber: '20567890123',
        name: 'HOTEL LIMA PALACE SAC',
        email: 'spa@hotellima.com',
        phone: '987654324',
        address: 'Av. La Marina 1234, San Miguel',
      },
    ],
    invoices: [
      {
        id: '1',
        number: 'B001-00000001',
        series: 'B001',
        documentType: 'boleta',
        customer: {
          documentType: '1',
          documentNumber: '45678901',
          name: 'María Fernández López',
          phone: '987654321',
          email: 'maria.fernandez@email.com',
          address: 'Av. Larco 890, Miraflores',
        },
        items: [
          {
            code: 'SERV001',
            description: 'Limpieza Facial Profunda',
            quantity: 1,
            price: 120.00,
          },
          {
            code: 'SERV002',
            description: 'Masaje Relajante con Aromaterapia',
            quantity: 1,
            price: 180.00,
          },
        ],
        subtotal: 300.00,
        tax: 54.00,
        total: 354.00,
        status: 'paid',
        paymentMethod: 'Tarjeta',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 15),
      },
      {
        id: '2',
        number: 'B001-00000002',
        series: 'B001',
        documentType: 'boleta',
        customer: {
          documentType: '1',
          documentNumber: '32165498',
          name: 'Carmen Ruiz Torres',
          phone: '987654322',
          email: 'carmen.ruiz@email.com',
          address: 'Jr. Cusco 456, San Isidro',
        },
        items: [
          {
            code: 'SERV003',
            description: 'Depilación con Cera',
            quantity: 2,
            price: 80.00,
          },
          {
            code: 'PROD001',
            description: 'Crema Hidratante Facial Premium',
            quantity: 1,
            price: 85.00,
          },
        ],
        subtotal: 245.00,
        tax: 44.10,
        total: 289.10,
        status: 'paid',
        paymentMethod: 'Efectivo',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 18),
      },
      {
        id: '3',
        number: 'F001-00000001',
        series: 'F001',
        documentType: 'factura',
        customer: {
          documentType: '6',
          documentNumber: '20567890123',
          name: 'HOTEL LIMA PALACE SAC',
          phone: '987654324',
          email: 'spa@hotellima.com',
          address: 'Av. La Marina 1234, San Miguel',
        },
        items: [
          {
            code: 'SERV004',
            description: 'Tratamiento Reductivo con Ultrasonido',
            quantity: 10,
            price: 250.00,
          },
          {
            code: 'SERV002',
            description: 'Masaje Relajante con Aromaterapia',
            quantity: 10,
            price: 180.00,
          },
        ],
        subtotal: 4300.00,
        tax: 774.00,
        total: 5074.00,
        status: 'pending',
        paymentMethod: 'Transferencia',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 20),
      },
      // Ventas del mes pasado
      {
        id: '4',
        number: 'B001-00000003',
        series: 'B001',
        documentType: 'boleta',
        customer: {
          documentType: '1',
          documentNumber: '78945612',
          name: 'Ana García Mendoza',
        },
        items: [
          {
            code: 'SERV001',
            description: 'Limpieza Facial Profunda',
            quantity: 1,
            price: 120.00,
          },
          {
            code: 'SERV004',
            description: 'Tratamiento Reductivo con Ultrasonido',
            quantity: 2,
            price: 250.00,
          },
        ],
        subtotal: 620.00,
        tax: 111.60,
        total: 731.60,
        status: 'paid',
        paymentMethod: 'Tarjeta',
        createdAt: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 10),
      },
      {
        id: '5',
        number: 'B001-00000004',
        series: 'B001',
        documentType: 'boleta',
        customer: {
          documentType: '1',
          documentNumber: '45678901',
          name: 'María Fernández López',
        },
        items: [
          {
            code: 'SERV002',
            description: 'Masaje Relajante con Aromaterapia',
            quantity: 2,
            price: 180.00,
          },
        ],
        subtotal: 360.00,
        tax: 64.80,
        total: 424.80,
        status: 'paid',
        paymentMethod: 'Efectivo',
        createdAt: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 25),
      },
    ],
    quotations: [
      {
        id: '1',
        quotationNumber: 'COT001-00000001',
        series: 'COT001',
        customer: {
          documentType: '6',
          documentNumber: '20567890123',
          name: 'HOTEL LIMA PALACE SAC',
          email: 'spa@hotellima.com',
          phone: '987654324',
          address: 'Av. La Marina 1234, San Miguel',
        },
        items: [
          {
            code: 'SERV004',
            description: 'Tratamiento Reductivo con Ultrasonido',
            quantity: 20,
            price: 250.00,
          },
          {
            code: 'SERV002',
            description: 'Masaje Relajante con Aromaterapia',
            quantity: 20,
            price: 180.00,
          },
        ],
        subtotal: 8600.00,
        tax: 1548.00,
        total: 10148.00,
        status: 'pending',
        notes: 'Paquete corporativo para huéspedes del hotel',
        validityDays: 15,
        expiryDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15),
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5),
        isSent: false,
        isConverted: false,
      },
      {
        id: '2',
        quotationNumber: 'COT001-00000002',
        series: 'COT001',
        customer: {
          documentType: '1',
          documentNumber: '78945612',
          name: 'Ana García Mendoza',
          email: 'ana.garcia@email.com',
          phone: '987654323',
          address: 'Av. Pardo 234, Miraflores',
        },
        items: [
          {
            code: 'SERV001',
            description: 'Limpieza Facial Profunda',
            quantity: 4,
            price: 120.00,
          },
          {
            code: 'SERV002',
            description: 'Masaje Relajante con Aromaterapia',
            quantity: 4,
            price: 180.00,
          },
        ],
        subtotal: 1200.00,
        tax: 216.00,
        total: 1416.00,
        status: 'sent',
        notes: 'Paquete mensual de tratamientos',
        validityDays: 30,
        expiryDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 25),
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2),
        isSent: true,
        sentAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
        isConverted: false,
      },
      {
        id: '3',
        quotationNumber: 'COT001-00000003',
        series: 'COT001',
        customer: {
          documentType: '1',
          documentNumber: '45678901',
          name: 'María Fernández López',
          email: 'maria.fernandez@email.com',
          phone: '987654321',
          address: 'Av. Larco 890, Miraflores',
        },
        items: [
          {
            code: 'SERV003',
            description: 'Depilación con Cera',
            quantity: 6,
            price: 80.00,
          },
        ],
        subtotal: 480.00,
        tax: 86.40,
        total: 566.40,
        status: 'approved',
        notes: 'Paquete de 6 sesiones con 10% de descuento',
        validityDays: 7,
        expiryDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5),
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
        isSent: true,
        sentAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
        isConverted: false,
      },
    ],
    suppliers: [
      {
        id: '1',
        documentType: '6',
        documentNumber: '20123456789',
        businessName: 'COSMÉTICOS NATURALES SAC',
        contactName: 'Laura Mendoza',
        email: 'ventas@cosmeticosnaturales.com',
        phone: '987123456',
        address: 'Av. Brasil 456, Jesús María',
      },
      {
        id: '2',
        documentType: '6',
        documentNumber: '20987654321',
        businessName: 'DISTRIBUIDORA BELLEZA TOTAL SRL',
        contactName: 'Roberto Sánchez',
        email: 'pedidos@bellezatotal.com',
        phone: '987123457',
        address: 'Jr. Comercio 890, Cercado de Lima',
      },
      {
        id: '3',
        documentType: '6',
        documentNumber: '20456789123',
        businessName: 'EQUIPOS SPA PERU SAC',
        contactName: 'Andrea Vásquez',
        email: 'contacto@equiposspaper.com',
        phone: '987123458',
        address: 'Av. La Marina 567, San Miguel',
      },
      {
        id: '4',
        documentType: '6',
        documentNumber: '20789123456',
        businessName: 'AROMAS Y ESENCIAS EIRL',
        contactName: 'Patricia Luna',
        email: 'ventas@aromasyesencias.com',
        phone: '987123459',
        address: 'Av. Primavera 123, Surco',
      },
    ],
    purchases: [
      {
        id: '1',
        invoiceNumber: 'F001-00125',
        supplier: {
          id: '1',
          documentType: '6',
          documentNumber: '20123456789',
          businessName: 'COSMÉTICOS NATURALES SAC',
        },
        items: [
          {
            productId: '1',
            productName: 'Crema Hidratante Facial Premium',
            quantity: 24,
            unitPrice: 45.00,
          },
          {
            productId: '3',
            productName: 'Mascarilla de Arcilla',
            quantity: 30,
            unitPrice: 22.00,
          },
        ],
        subtotal: 1740.00,
        igv: 313.20,
        total: 2053.20,
        notes: 'Reposición de productos faciales',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 5),
      },
      {
        id: '2',
        invoiceNumber: 'F001-00234',
        supplier: {
          id: '2',
          documentType: '6',
          documentNumber: '20987654321',
          businessName: 'DISTRIBUIDORA BELLEZA TOTAL SRL',
        },
        items: [
          {
            productId: '4',
            productName: 'Kit Cera Depilatoria',
            quantity: 15,
            unitPrice: 65.00,
          },
          {
            productId: '5',
            productName: 'Gel Conductor Ultrasonido',
            quantity: 20,
            unitPrice: 18.00,
          },
        ],
        subtotal: 1335.00,
        igv: 240.30,
        total: 1575.30,
        notes: 'Insumos para tratamientos corporales',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 12),
      },
      {
        id: '3',
        invoiceNumber: 'F002-00089',
        supplier: {
          id: '4',
          documentType: '6',
          documentNumber: '20789123456',
          businessName: 'AROMAS Y ESENCIAS EIRL',
        },
        items: [
          {
            productId: '2',
            productName: 'Aceite Esencial de Lavanda',
            quantity: 18,
            unitPrice: 28.00,
          },
        ],
        subtotal: 504.00,
        igv: 90.72,
        total: 594.72,
        notes: 'Aceites para aromaterapia',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 18),
      },
      // Compra del mes pasado
      {
        id: '4',
        invoiceNumber: 'F001-00098',
        supplier: {
          id: '1',
          documentType: '6',
          documentNumber: '20123456789',
          businessName: 'COSMÉTICOS NATURALES SAC',
        },
        items: [
          {
            productId: '1',
            productName: 'Crema Hidratante Facial Premium',
            quantity: 12,
            unitPrice: 45.00,
          },
        ],
        subtotal: 540.00,
        igv: 97.20,
        total: 637.20,
        notes: 'Pedido mensual regular',
        createdAt: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 20),
      },
    ],
    subscription: {
      status: 'active',
      plan: 'unlimited_12_months',
      currentPeriodEnd: new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()),
      accessBlocked: false,
    },
    warehouses: [
      {
        id: '1',
        name: 'Almacén de Insumos',
        location: 'Av. Larco 1234, Miraflores',
        isDefault: true,
        isActive: true,
        createdAt: new Date(today.getFullYear(), today.getMonth() - 2, 1),
      },
      {
        id: '2',
        name: 'Almacén Productos Venta',
        location: 'Av. Larco 1234, Miraflores',
        isDefault: false,
        isActive: true,
        createdAt: new Date(today.getFullYear(), today.getMonth() - 1, 15),
      },
    ],
  }
}

export const DemoProvider = ({ children }) => {
  const [demoData] = useState(generateDemoData())

  // Inyectar datos de demo en window para que los servicios puedan acceder
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

  const value = {
    isDemoMode: true,
    demoData,
  }

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export const useDemo = () => {
  const context = useContext(DemoContext)
  // No lanzar error si no está en un provider, simplemente retornar null
  // Esto permite usar el hook condicionalmente
  return context
}
