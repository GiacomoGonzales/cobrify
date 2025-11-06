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
      businessName: 'EMPRESA DEMO SAC',
      ruc: '20123456789',
      address: 'Av. Larco 1234, Miraflores',
      phone: '01-2345678',
      email: 'ventas@empresademo.com',
      website: 'www.empresademo.com',
    },
    products: [
      {
        id: '1',
        code: 'PROD001',
        name: 'Laptop HP 15"',
        description: 'Laptop HP 15 pulgadas, Intel Core i5, 8GB RAM',
        price: 2500.00,
        cost: 1800.00,
        stock: 15,
        unit: 'UNIDAD',
        category: 'Electrónica',
        hasVariants: false,
      },
      {
        id: '2',
        code: 'PROD002',
        name: 'Mouse Inalámbrico',
        description: 'Mouse inalámbrico Logitech',
        price: 45.00,
        cost: 25.00,
        stock: 50,
        unit: 'UNIDAD',
        category: 'Electrónica',
        hasVariants: false,
      },
      {
        id: '3',
        code: 'PROD003',
        name: 'Teclado Mecánico',
        description: 'Teclado mecánico RGB',
        price: 180.00,
        cost: 120.00,
        stock: 25,
        unit: 'UNIDAD',
        category: 'Electrónica',
        hasVariants: false,
      },
      {
        id: '4',
        code: 'SERV001',
        name: 'Servicio de Instalación',
        description: 'Instalación de software y configuración',
        price: 120.00,
        cost: 0,
        stock: null,
        unit: 'SERVICIO',
        category: 'Servicios',
        hasVariants: false,
      },
      {
        id: '5',
        code: 'PROD004',
        name: 'Monitor 24"',
        description: 'Monitor LED 24 pulgadas Full HD',
        price: 650.00,
        cost: 450.00,
        stock: 12,
        unit: 'UNIDAD',
        category: 'Electrónica',
        hasVariants: false,
      },
    ],
    customers: [
      {
        id: '1',
        documentType: '6',
        documentNumber: '20456789012',
        name: 'TECNOLOGÍA DEL PERÚ SAC',
        email: 'ventas@tecnologia.com',
        phone: '987654321',
        address: 'Av. Arequipa 2580, Lima',
      },
      {
        id: '2',
        documentType: '1',
        documentNumber: '45678901',
        name: 'Juan Pérez García',
        email: 'juan.perez@email.com',
        phone: '987654322',
        address: 'Jr. Cusco 456, San Isidro',
      },
      {
        id: '3',
        documentType: '6',
        documentNumber: '20567890123',
        name: 'COMERCIAL LIMA SRL',
        email: 'compras@comerciallima.com',
        phone: '987654323',
        address: 'Av. Venezuela 1234, Lima',
      },
    ],
    invoices: [
      {
        id: '1',
        number: 'F001-00000001',
        series: 'F001',
        documentType: 'factura',
        customer: {
          documentType: '6',
          documentNumber: '20456789012',
          name: 'TECNOLOGÍA DEL PERÚ SAC',
          phone: '987654321',
          email: 'ventas@tecnologia.com',
          address: 'Av. Arequipa 2580, Lima',
        },
        items: [
          {
            code: 'PROD001',
            description: 'Laptop HP 15"',
            quantity: 2,
            price: 2500.00,
          },
          {
            code: 'PROD002',
            description: 'Mouse Inalámbrico',
            quantity: 2,
            price: 45.00,
          },
        ],
        subtotal: 5090.00,
        tax: 916.20,
        total: 6006.20,
        status: 'paid',
        paymentMethod: 'Transferencia',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 15),
      },
      {
        id: '2',
        number: 'B001-00000001',
        series: 'B001',
        documentType: 'boleta',
        customer: {
          documentType: '1',
          documentNumber: '45678901',
          name: 'Juan Pérez García',
          phone: '987654322',
          email: 'juan.perez@email.com',
          address: 'Jr. Cusco 456, San Isidro',
        },
        items: [
          {
            code: 'PROD003',
            description: 'Teclado Mecánico',
            quantity: 1,
            price: 180.00,
          },
          {
            code: 'PROD002',
            description: 'Mouse Inalámbrico',
            quantity: 1,
            price: 45.00,
          },
        ],
        subtotal: 225.00,
        tax: 40.50,
        total: 265.50,
        status: 'paid',
        paymentMethod: 'Efectivo',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 18),
      },
      {
        id: '3',
        number: 'F001-00000002',
        series: 'F001',
        documentType: 'factura',
        customer: {
          documentType: '6',
          documentNumber: '20567890123',
          name: 'COMERCIAL LIMA SRL',
          phone: '987654323',
          email: 'compras@comerciallima.com',
          address: 'Av. Venezuela 1234, Lima',
        },
        items: [
          {
            code: 'PROD004',
            description: 'Monitor 24"',
            quantity: 5,
            price: 650.00,
          },
          {
            code: 'SERV001',
            description: 'Servicio de Instalación',
            quantity: 1,
            price: 120.00,
          },
        ],
        subtotal: 3370.00,
        tax: 606.60,
        total: 3976.60,
        status: 'pending',
        paymentMethod: 'Transferencia',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 20),
      },
      // Ventas del mes pasado
      {
        id: '4',
        number: 'B001-00000002',
        series: 'B001',
        documentType: 'boleta',
        customer: {
          documentType: '1',
          documentNumber: '45678901',
          name: 'Juan Pérez García',
        },
        items: [
          {
            code: 'PROD001',
            description: 'Laptop HP 15"',
            quantity: 1,
            price: 2500.00,
          },
        ],
        subtotal: 2500.00,
        tax: 450.00,
        total: 2950.00,
        status: 'paid',
        paymentMethod: 'Tarjeta',
        createdAt: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 10),
      },
      {
        id: '5',
        number: 'F001-00000003',
        series: 'F001',
        documentType: 'factura',
        customer: {
          documentType: '6',
          documentNumber: '20456789012',
          name: 'TECNOLOGÍA DEL PERÚ SAC',
        },
        items: [
          {
            code: 'PROD003',
            description: 'Teclado Mecánico',
            quantity: 10,
            price: 180.00,
          },
        ],
        subtotal: 1800.00,
        tax: 324.00,
        total: 2124.00,
        status: 'paid',
        paymentMethod: 'Transferencia',
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
          documentNumber: '20456789012',
          name: 'TECNOLOGÍA DEL PERÚ SAC',
          email: 'ventas@tecnologia.com',
          phone: '987654321',
          address: 'Av. Arequipa 2580, Lima',
        },
        items: [
          {
            code: 'PROD001',
            description: 'Laptop HP 15"',
            quantity: 3,
            price: 2500.00,
          },
          {
            code: 'PROD002',
            description: 'Mouse Inalámbrico',
            quantity: 3,
            price: 45.00,
          },
        ],
        subtotal: 7635.00,
        tax: 1374.30,
        total: 9009.30,
        status: 'pending',
        notes: 'Cotización válida por 15 días',
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
          documentType: '6',
          documentNumber: '20567890123',
          name: 'COMERCIAL LIMA SRL',
          email: 'compras@comerciallima.com',
          phone: '987654323',
          address: 'Av. Venezuela 1234, Lima',
        },
        items: [
          {
            code: 'PROD004',
            description: 'Monitor 24"',
            quantity: 10,
            price: 650.00,
          },
          {
            code: 'SERV001',
            description: 'Servicio de Instalación',
            quantity: 2,
            price: 120.00,
          },
        ],
        subtotal: 6740.00,
        tax: 1213.20,
        total: 7953.20,
        status: 'sent',
        notes: 'Incluye garantía de 1 año',
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
          name: 'Juan Pérez García',
          email: 'juan.perez@email.com',
          phone: '987654322',
          address: 'Jr. Cusco 456, San Isidro',
        },
        items: [
          {
            code: 'PROD003',
            description: 'Teclado Mecánico',
            quantity: 2,
            price: 180.00,
          },
        ],
        subtotal: 360.00,
        tax: 64.80,
        total: 424.80,
        status: 'approved',
        notes: 'Cliente aprobó la cotización',
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
        businessName: 'DISTRIBUIDORA TECH SAC',
        contactName: 'Carlos Rodríguez',
        email: 'ventas@distribuidoratech.com',
        phone: '987123456',
        address: 'Av. Industrial 245, Ate',
      },
      {
        id: '2',
        documentType: '6',
        documentNumber: '20987654321',
        businessName: 'IMPORTACIONES GLOBAL SRL',
        contactName: 'María Fernández',
        email: 'compras@importacionesglobal.com',
        phone: '987123457',
        address: 'Jr. Comercio 890, Cercado de Lima',
      },
      {
        id: '3',
        documentType: '6',
        documentNumber: '20456789123',
        businessName: 'ELECTRÓNICA PERUANA SAC',
        contactName: 'Jorge Vásquez',
        email: 'contacto@electronicaperuana.com',
        phone: '987123458',
        address: 'Av. Grau 567, Breña',
      },
      {
        id: '4',
        documentType: '1',
        documentNumber: '43567890',
        businessName: 'SERVICIOS TÉCNICOS LÓPEZ',
        contactName: 'Luis López',
        email: 'luis.lopez@serviciotecnico.com',
        phone: '987123459',
        address: 'Av. Canadá 123, La Victoria',
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
          businessName: 'DISTRIBUIDORA TECH SAC',
        },
        items: [
          {
            productId: '1',
            productName: 'Laptop HP 15"',
            quantity: 10,
            unitPrice: 2000.00,
          },
          {
            productId: '2',
            productName: 'Mouse Inalámbrico',
            quantity: 50,
            unitPrice: 30.00,
          },
        ],
        subtotal: 21500.00,
        igv: 3870.00,
        total: 25370.00,
        notes: 'Primera compra del mes',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 5),
      },
      {
        id: '2',
        invoiceNumber: 'F001-00234',
        supplier: {
          id: '2',
          documentType: '6',
          documentNumber: '20987654321',
          businessName: 'IMPORTACIONES GLOBAL SRL',
        },
        items: [
          {
            productId: '4',
            productName: 'Monitor 24"',
            quantity: 20,
            unitPrice: 550.00,
          },
        ],
        subtotal: 11000.00,
        igv: 1980.00,
        total: 12980.00,
        notes: 'Compra de monitores para stock',
        createdAt: new Date(today.getFullYear(), today.getMonth(), 12),
      },
      {
        id: '3',
        invoiceNumber: 'F002-00089',
        supplier: {
          id: '3',
          documentType: '6',
          documentNumber: '20456789123',
          businessName: 'ELECTRÓNICA PERUANA SAC',
        },
        items: [
          {
            productId: '3',
            productName: 'Teclado Mecánico',
            quantity: 30,
            unitPrice: 150.00,
          },
          {
            productId: '2',
            productName: 'Mouse Inalámbrico',
            quantity: 30,
            unitPrice: 30.00,
          },
        ],
        subtotal: 5400.00,
        igv: 972.00,
        total: 6372.00,
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
          businessName: 'DISTRIBUIDORA TECH SAC',
        },
        items: [
          {
            productId: '1',
            productName: 'Laptop HP 15"',
            quantity: 5,
            unitPrice: 2000.00,
          },
        ],
        subtotal: 10000.00,
        igv: 1800.00,
        total: 11800.00,
        notes: 'Reposición de stock',
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
        name: 'Almacén Principal',
        location: 'Av. Larco 1234, Miraflores',
        isDefault: true,
        isActive: true,
        createdAt: new Date(today.getFullYear(), today.getMonth() - 2, 1),
      },
      {
        id: '2',
        name: 'Almacén Secundario',
        location: 'Jr. Comercio 567, San Isidro',
        isDefault: false,
        isActive: true,
        createdAt: new Date(today.getFullYear(), today.getMonth() - 1, 15),
      },
      {
        id: '3',
        name: 'Almacén de Productos Tecnológicos',
        location: 'Av. Arequipa 890, Lince',
        isDefault: false,
        isActive: true,
        createdAt: new Date(today.getFullYear(), today.getMonth(), 5),
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
