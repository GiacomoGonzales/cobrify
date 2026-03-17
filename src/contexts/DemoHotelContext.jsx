import { createContext, useContext, useState } from 'react'

const DemoHotelContext = createContext(null)

// Datos de ejemplo para el demo de hotel
const generateHotelDemoData = () => {
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const dayAfterTomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)
  const twoDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2)
  const threeDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3)
  const fourDaysFromNow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4)
  const fiveDaysFromNow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5)

  return {
    user: {
      uid: 'demo-hotel',
      email: 'demo@hotel.com',
      displayName: 'Hotel Demo',
      photoURL: null,
    },
    business: {
      businessName: 'Hotel Sol & Luna',
      ruc: '20456789012',
      address: 'Av. El Sol 456, Cusco',
      phone: '084-234567',
      email: 'reservas@hotelsolyluna.com',
      businessMode: 'hotel',
    },
    products: [
      // Minibar
      { id: '1', code: 'MNB001', name: 'Agua Mineral 500ml', price: 5.00, cost: 3.00, stock: 100, unit: 'NIU', category: 'cat-minibar' },
      { id: '2', code: 'MNB002', name: 'Gaseosa 350ml', price: 6.00, cost: 3.60, stock: 100, unit: 'NIU', category: 'cat-minibar' },
      { id: '3', code: 'MNB003', name: 'Cerveza Cusqueña', price: 12.00, cost: 7.20, stock: 100, unit: 'NIU', category: 'cat-minibar' },
      { id: '4', code: 'MNB004', name: 'Pisco Sour', price: 25.00, cost: 15.00, stock: 100, unit: 'NIU', category: 'cat-minibar' },
      { id: '5', code: 'MNB005', name: 'Vino tinto copa', price: 18.00, cost: 10.80, stock: 100, unit: 'NIU', category: 'cat-minibar' },
      // Restaurante
      { id: '6', code: 'RST001', name: 'Desayuno Buffet', price: 35.00, cost: 21.00, stock: 100, unit: 'NIU', category: 'cat-restaurante' },
      { id: '7', code: 'RST002', name: 'Almuerzo Ejecutivo', price: 28.00, cost: 16.80, stock: 100, unit: 'NIU', category: 'cat-restaurante' },
      { id: '8', code: 'RST003', name: 'Cena 3 tiempos', price: 45.00, cost: 27.00, stock: 100, unit: 'NIU', category: 'cat-restaurante' },
      { id: '9', code: 'RST004', name: 'Sandwich Club', price: 22.00, cost: 13.20, stock: 100, unit: 'NIU', category: 'cat-restaurante' },
      { id: '10', code: 'RST005', name: 'Ensalada César', price: 18.00, cost: 10.80, stock: 100, unit: 'NIU', category: 'cat-restaurante' },
      // Servicios
      { id: '11', code: 'SRV001', name: 'Toalla extra', price: 5.00, cost: 3.00, stock: 100, unit: 'NIU', category: 'cat-servicios' },
      { id: '12', code: 'SRV002', name: 'Lavandería express', price: 15.00, cost: 9.00, stock: 100, unit: 'NIU', category: 'cat-servicios' },
      { id: '13', code: 'SRV003', name: 'Servicio a la habitación', price: 8.00, cost: 4.80, stock: 100, unit: 'NIU', category: 'cat-servicios' },
      { id: '14', code: 'SRV004', name: 'Estacionamiento día', price: 20.00, cost: 12.00, stock: 100, unit: 'NIU', category: 'cat-servicios' },
      { id: '15', code: 'SRV005', name: 'Late checkout', price: 50.00, cost: 30.00, stock: 100, unit: 'NIU', category: 'cat-servicios' },
    ],
    categories: [
      { id: 'cat-minibar', name: 'Minibar', parentId: null },
      { id: 'cat-restaurante', name: 'Restaurante', parentId: null },
      { id: 'cat-servicios', name: 'Servicios', parentId: null },
    ],
    customers: [
      { id: '1', documentType: '1', documentNumber: '45678912', name: 'María García', email: 'maria.garcia@email.com', phone: '984567123', address: 'Lima, Perú' },
      { id: '2', documentType: '6', documentNumber: '20345678901', name: 'Carlos López', email: 'carlos.lopez@empresa.com', phone: '987654321', address: 'Av. Pardo 123, Miraflores' },
      { id: '3', documentType: 'A', documentNumber: 'US789456', name: 'John Smith', email: 'john.smith@gmail.com', phone: '+1-555-1234', address: 'New York, USA' },
      { id: '4', documentType: '1', documentNumber: '78912345', name: 'Ana Torres', email: 'ana.torres@hotmail.com', phone: '976543210', address: 'Arequipa, Perú' },
      { id: '5', documentType: '1', documentNumber: '34567891', name: 'Roberto Díaz', email: 'roberto.diaz@gmail.com', phone: '965432109', address: 'Cusco, Perú' },
      { id: '6', documentType: 'A', documentNumber: 'DE456123', name: 'Sophie Müller', email: 'sophie.muller@web.de', phone: '+49-170-5678', address: 'Berlin, Alemania' },
      { id: '7', documentType: '1', documentNumber: '56789123', name: 'Pedro Huamán', email: 'pedro.huaman@yahoo.com', phone: '954321098', address: 'Cusco, Perú' },
      { id: '8', documentType: '6', documentNumber: '20567891234', name: 'Empresa TechCorp SAC', email: 'reservas@techcorp.pe', phone: '01-4567890', address: 'San Isidro, Lima' },
    ],
    hotelRooms: [
      { id: 'room-101', number: '101', type: 'Simple', floor: 1, capacity: 1, ratePerNight: 120.00, status: 'occupied', amenities: ['WiFi', 'TV', 'Baño privado'] },
      { id: 'room-102', number: '102', type: 'Simple', floor: 1, capacity: 1, ratePerNight: 120.00, status: 'available', amenities: ['WiFi', 'TV', 'Baño privado'] },
      { id: 'room-103', number: '103', type: 'Simple', floor: 1, capacity: 1, ratePerNight: 120.00, status: 'cleaning', amenities: ['WiFi', 'TV', 'Baño privado'] },
      { id: 'room-104', number: '104', type: 'Simple', floor: 1, capacity: 1, ratePerNight: 120.00, status: 'available', amenities: ['WiFi', 'TV', 'Baño privado'] },
      { id: 'room-201', number: '201', type: 'Doble', floor: 2, capacity: 2, ratePerNight: 180.00, status: 'occupied', amenities: ['WiFi', 'TV', 'Baño privado', 'Minibar'] },
      { id: 'room-202', number: '202', type: 'Doble', floor: 2, capacity: 2, ratePerNight: 180.00, status: 'available', amenities: ['WiFi', 'TV', 'Baño privado', 'Minibar'] },
      { id: 'room-203', number: '203', type: 'Doble', floor: 2, capacity: 2, ratePerNight: 180.00, status: 'occupied', amenities: ['WiFi', 'TV', 'Baño privado', 'Minibar'] },
      { id: 'room-204', number: '204', type: 'Doble', floor: 2, capacity: 2, ratePerNight: 180.00, status: 'maintenance', amenities: ['WiFi', 'TV', 'Baño privado', 'Minibar'] },
      { id: 'room-301', number: '301', type: 'Matrimonial', floor: 3, capacity: 2, ratePerNight: 220.00, status: 'occupied', amenities: ['WiFi', 'TV', 'Baño privado', 'Minibar', 'Vista al jardín'] },
      { id: 'room-302', number: '302', type: 'Matrimonial', floor: 3, capacity: 2, ratePerNight: 220.00, status: 'available', amenities: ['WiFi', 'TV', 'Baño privado', 'Minibar', 'Vista al jardín'] },
      { id: 'room-401', number: '401', type: 'Suite', floor: 4, capacity: 3, ratePerNight: 350.00, status: 'occupied', amenities: ['WiFi', 'TV', 'Baño privado', 'Minibar', 'Jacuzzi', 'Sala de estar'] },
      { id: 'room-402', number: '402', type: 'Familiar', floor: 4, capacity: 4, ratePerNight: 280.00, status: 'available', amenities: ['WiFi', 'TV', 'Baño privado', 'Minibar', 'Cocina pequeña'] },
    ],
    hotelReservations: [
      {
        id: 'res-001',
        guestName: 'María García',
        guestDocument: '45678912',
        guestDocumentType: '1',
        guestPhone: '984567123',
        roomId: 'room-101',
        roomNumber: '101',
        checkIn: twoDaysAgo,
        checkOut: tomorrow,
        nights: 3,
        ratePerNight: 120.00,
        totalAmount: 360.00,
        status: 'checked_in',
        notes: 'Huésped frecuente, prefiere piso bajo',
      },
      {
        id: 'res-002',
        guestName: 'John Smith',
        guestDocument: 'US789456',
        guestDocumentType: 'A',
        guestPhone: '+1-555-1234',
        roomId: 'room-201',
        roomNumber: '201',
        checkIn: yesterday,
        checkOut: fourDaysFromNow,
        nights: 5,
        ratePerNight: 180.00,
        totalAmount: 900.00,
        status: 'checked_in',
        notes: 'Turista americano, habla inglés',
      },
      {
        id: 'res-003',
        guestName: 'Sophie Müller',
        guestDocument: 'DE456123',
        guestDocumentType: 'A',
        guestPhone: '+49-170-5678',
        roomId: 'room-203',
        roomNumber: '203',
        checkIn: threeDaysAgo,
        checkOut: today,
        nights: 3,
        ratePerNight: 180.00,
        totalAmount: 540.00,
        status: 'checked_in',
        notes: 'Checkout hoy, solicita late checkout',
      },
      {
        id: 'res-004',
        guestName: 'Ana Torres',
        guestDocument: '78912345',
        guestDocumentType: '1',
        guestPhone: '976543210',
        roomId: 'room-301',
        roomNumber: '301',
        checkIn: yesterday,
        checkOut: dayAfterTomorrow,
        nights: 3,
        ratePerNight: 220.00,
        totalAmount: 660.00,
        status: 'checked_in',
        notes: 'Aniversario de bodas',
      },
      {
        id: 'res-005',
        guestName: 'Carlos López',
        guestDocument: '20345678901',
        guestDocumentType: '6',
        guestPhone: '987654321',
        roomId: 'room-401',
        roomNumber: '401',
        checkIn: today,
        checkOut: fiveDaysFromNow,
        nights: 5,
        ratePerNight: 350.00,
        totalAmount: 1750.00,
        status: 'checked_in',
        notes: 'Viaje corporativo, factura a nombre de empresa',
      },
      {
        id: 'res-006',
        guestName: 'Roberto Díaz',
        guestDocument: '34567891',
        guestDocumentType: '1',
        guestPhone: '965432109',
        roomId: 'room-302',
        roomNumber: '302',
        checkIn: tomorrow,
        checkOut: fourDaysFromNow,
        nights: 3,
        ratePerNight: 220.00,
        totalAmount: 660.00,
        status: 'confirmed',
        notes: 'Llega por la tarde',
      },
      {
        id: 'res-007',
        guestName: 'Pedro Huamán',
        guestDocument: '56789123',
        guestDocumentType: '1',
        guestPhone: '954321098',
        roomId: 'room-102',
        roomNumber: '102',
        checkIn: tomorrow,
        checkOut: dayAfterTomorrow,
        nights: 1,
        ratePerNight: 120.00,
        totalAmount: 120.00,
        status: 'confirmed',
        notes: 'Reserva de una noche',
      },
    ],
    hotelServices: [
      { id: 'hsrv-001', name: 'Piscina', pricePerUnit: 15.00, unitType: 'persona', type: 'pool', capacity: 30, active: true },
      { id: 'hsrv-002', name: 'Sala de Juegos', pricePerUnit: 10.00, unitType: 'hora', type: 'games', capacity: 15, active: true },
      { id: 'hsrv-003', name: 'Salón de Eventos', pricePerUnit: 500.00, unitType: 'fijo', type: 'events', capacity: 80, active: true },
      { id: 'hsrv-004', name: 'Gimnasio', pricePerUnit: 0.00, unitType: 'persona', type: 'other', capacity: 20, active: true },
    ],
    hotelFolioCharges: [
      { id: 'chg-001', reservationId: 'res-001', roomNumber: '101', description: 'Noche habitación Simple', chargeType: 'room_night', amount: 120.00, date: twoDaysAgo },
      { id: 'chg-002', reservationId: 'res-001', roomNumber: '101', description: 'Noche habitación Simple', chargeType: 'room_night', amount: 120.00, date: yesterday },
      { id: 'chg-003', reservationId: 'res-002', roomNumber: '201', description: 'Desayuno Buffet x2', chargeType: 'restaurant', amount: 70.00, date: today },
      { id: 'chg-004', reservationId: 'res-003', roomNumber: '203', description: 'Cerveza Cusqueña x3', chargeType: 'minibar', amount: 36.00, date: yesterday },
      { id: 'chg-005', reservationId: 'res-004', roomNumber: '301', description: 'Piscina x2', chargeType: 'pool', amount: 30.00, date: today },
      { id: 'chg-006', reservationId: 'res-005', roomNumber: '401', description: 'Noche habitación Suite', chargeType: 'room_night', amount: 350.00, date: today },
      { id: 'chg-007', reservationId: 'res-002', roomNumber: '201', description: 'Lavandería express', chargeType: 'minibar', amount: 15.00, date: today },
      { id: 'chg-008', reservationId: 'res-004', roomNumber: '301', description: 'Cena 3 tiempos x2', chargeType: 'restaurant', amount: 90.00, date: yesterday },
    ],
    invoices: [
      {
        id: '1',
        number: 'B001-00000001',
        series: 'B001',
        documentType: 'boleta',
        customer: { documentType: '1', documentNumber: '45678912', name: 'María García' },
        items: [
          { code: 'RST001', description: 'Desayuno Buffet', quantity: 2, price: 35.00 },
          { code: 'MNB001', description: 'Agua Mineral 500ml', quantity: 3, price: 5.00 },
        ],
        subtotal: 74.58,
        tax: 13.42,
        total: 88.00,
        status: 'paid',
        paymentMethod: 'Efectivo',
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3),
      },
      {
        id: '2',
        number: 'B001-00000002',
        series: 'B001',
        documentType: 'nota_de_venta',
        customer: { documentType: 'A', documentNumber: 'US789456', name: 'John Smith' },
        items: [
          { code: 'MNB004', description: 'Pisco Sour', quantity: 2, price: 25.00 },
          { code: 'RST003', description: 'Cena 3 tiempos', quantity: 2, price: 45.00 },
        ],
        subtotal: 118.64,
        tax: 21.36,
        total: 140.00,
        status: 'paid',
        paymentMethod: 'Tarjeta',
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2),
      },
      {
        id: '3',
        number: 'B001-00000003',
        series: 'B001',
        documentType: 'boleta',
        customer: { documentType: '1', documentNumber: '78912345', name: 'Ana Torres' },
        items: [
          { code: 'SRV002', description: 'Lavandería express', quantity: 1, price: 15.00 },
          { code: 'RST002', description: 'Almuerzo Ejecutivo', quantity: 2, price: 28.00 },
          { code: 'MNB005', description: 'Vino tinto copa', quantity: 2, price: 18.00 },
        ],
        subtotal: 91.53,
        tax: 16.47,
        total: 108.00,
        status: 'paid',
        paymentMethod: 'Efectivo',
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
      },
      {
        id: '4',
        number: 'B001-00000004',
        series: 'B001',
        documentType: 'nota_de_venta',
        customer: { documentType: 'A', documentNumber: 'DE456123', name: 'Sophie Müller' },
        items: [
          { code: 'MNB003', description: 'Cerveza Cusqueña', quantity: 3, price: 12.00 },
          { code: 'RST004', description: 'Sandwich Club', quantity: 1, price: 22.00 },
        ],
        subtotal: 49.15,
        tax: 8.85,
        total: 58.00,
        status: 'paid',
        paymentMethod: 'Tarjeta',
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
      },
      {
        id: '5',
        number: 'F001-00000001',
        series: 'F001',
        documentType: 'boleta',
        customer: { documentType: '6', documentNumber: '20345678901', name: 'Carlos López' },
        items: [
          { code: 'SRV005', description: 'Late checkout', quantity: 1, price: 50.00 },
          { code: 'SRV004', description: 'Estacionamiento día', quantity: 3, price: 20.00 },
          { code: 'RST001', description: 'Desayuno Buffet', quantity: 5, price: 35.00 },
        ],
        subtotal: 219.49,
        tax: 39.51,
        total: 259.00,
        status: 'paid',
        paymentMethod: 'Transferencia',
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      },
    ],
    warehouses: [
      {
        id: 'wh1',
        name: 'Almacén Hotel',
        location: 'Av. El Sol 456, Cusco',
        isDefault: true,
        isActive: true,
        createdAt: new Date(2024, 0, 1),
      },
    ],
    suppliers: [
      {
        id: 'sup1',
        documentType: '6',
        documentNumber: '20678901234',
        businessName: 'Distribuidora Cusco',
        contactName: 'Raúl Quispe',
        email: 'ventas@distribuidoracusco.com',
        phone: '984111222',
        address: 'Jr. Ayacucho 345, Cusco',
      },
      {
        id: 'sup2',
        documentType: '6',
        documentNumber: '20789012345',
        businessName: 'Lavandería Express',
        contactName: 'Carmen Flores',
        email: 'contacto@lavanderiaexpress.com',
        phone: '984222333',
        address: 'Av. Cultura 890, Cusco',
      },
    ],
  }
}

export function DemoHotelProvider({ children }) {
  const [demoData] = useState(generateHotelDemoData())
  const [isDemo] = useState(true)

  const value = {
    ...demoData,
    isDemo,
    user: demoData.user,
    getBusinessId: () => 'demo-hotel',
  }

  return (
    <DemoHotelContext.Provider value={value}>
      {children}
    </DemoHotelContext.Provider>
  )
}

export function useDemoHotel() {
  const context = useContext(DemoHotelContext)
  // No lanzar error si no está en el provider, simplemente retornar null
  // Esto permite usar el hook en cualquier lugar sin causar errores
  return context
}

export { DemoHotelContext }
