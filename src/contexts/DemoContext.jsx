import { createContext, useContext, useState } from 'react'

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
    subscription: {
      status: 'active',
      plan: 'unlimited_12_months',
      currentPeriodEnd: new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()),
      accessBlocked: false,
    },
  }
}

export const DemoProvider = ({ children }) => {
  const [demoData] = useState(generateDemoData())

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
