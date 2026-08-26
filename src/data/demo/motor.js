/**
 * MOTOR DE DATOS DEL DEMO POR RUBRO.
 *
 * Antes cada demo era un archivo de ~1.600 líneas escritas a mano, y los datos
 * eran siempre los mismos: una ferretería entraba, veía laptops y cremas, y se
 * iba pensando que el sistema no era para ella.
 *
 * Acá cada rubro aporta SOLO lo que lo distingue —negocio, categorías,
 * productos, clientes, proveedores— y este motor arma el resto: ventas del mes
 * con los productos de ESE catálogo, cotizaciones, compras, gastos, almacenes y
 * suscripción. Agregar "panadería" es escribir su catálogo, no otro archivo de
 * 1.600 líneas.
 *
 * Las ventas se GENERAN, no se escriben: los comprobantes guardan el nombre y
 * el precio del ítem adentro (así los guarda el sistema real), así que armarlos
 * desde el catálogo da datos coherentes sin trabajo manual.
 */

/** Aleatorio con semilla: el mismo rubro da SIEMPRE el mismo demo. */
const generador = (semilla) => {
  let s = semilla
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const semillaDe = (texto) => {
  let h = 7
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) % 2147483647
  return h
}

const redondear = (n) => Math.round(n * 100) / 100

/** Los precios del catálogo van CON IGV, como en el POS. */
const desglosarIGV = (totalConIGV) => {
  const subtotal = redondear(totalConIGV / 1.18)
  return { subtotal, tax: redondear(totalConIGV - subtotal), total: redondear(totalConIGV) }
}

const NOMBRES_PERSONA = [
  'Juan Pérez García', 'María Quispe Flores', 'Carlos Huamán Ríos',
  'Rosa Mamani Torres', 'Luis Chávez Vega', 'Ana Ramírez Soto',
  'Pedro Castillo Núñez', 'Carmen Vargas Díaz', 'Jorge Aliaga Paredes',
  'Silvia Rojas Medina',
]

const METODOS = ['Efectivo', 'Yape', 'Efectivo', 'Tarjeta', 'Plin', 'Efectivo', 'Transferencia']

/**
 * Ítem con la MISMA forma que guarda el POS real.
 *
 * Importa más de lo que parece: el Dashboard arma el top de productos leyendo
 * `item.name`, los PDF y las impresoras leen `unitPrice`, y los reportes leen
 * `subtotal`. Con solo `description` y `price` —como estaban los demos
 * viejos— el top salía como "Producto sin nombre".
 */
const itemDeVenta = (producto, cantidad, precio) => ({
  productId: producto.id,
  code: producto.code,
  name: producto.name,
  description: producto.name,
  quantity: cantidad,
  unit: producto.unit || 'UNIDAD',
  price: precio,
  unitPrice: precio,
  subtotal: redondear(precio * cantidad),
  total: redondear(precio * cantidad),
})

/**
 * Ventas de los últimos 45 días: alcanza para que el Dashboard tenga "hoy",
 * "este mes" y "mes anterior" con qué comparar.
 */
function generarVentas(rubro, hoy, azar) {
  const productos = rubro.productos.filter((p) => Number(p.price) > 0)
  if (productos.length === 0) return []

  const facturas = []
  let correlativoF = 0
  let correlativoB = 0

  for (let diasAtras = 45; diasAtras >= 0; diasAtras--) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - diasAtras)
    const domingo = fecha.getDay() === 0
    const ventasDelDia = domingo ? Math.floor(azar() * 2) : 1 + Math.floor(azar() * 4)

    for (let v = 0; v < ventasDelDia; v++) {
      const esFactura = azar() < 0.3
      const cantidadItems = 1 + Math.floor(azar() * 3)
      const items = []
      let totalConIGV = 0

      for (let i = 0; i < cantidadItems; i++) {
        const p = productos[Math.floor(azar() * productos.length)]
        if (items.some((it) => it.code === p.code)) continue
        const cantidad = 1 + Math.floor(azar() * (p.ventaTipica || 2))
        items.push(itemDeVenta(p, cantidad, p.price))
        totalConIGV += p.price * cantidad
      }
      if (items.length === 0) continue

      const montos = desglosarIGV(totalConIGV)
      const empresas = rubro.clientes.filter((c) => c.documentType === '6')
      const cliente = esFactura && empresas.length > 0
        ? empresas[Math.floor(azar() * empresas.length)]
        : null
      const hora = 9 + Math.floor(azar() * 11)

      facturas.push({
        id: `inv-${facturas.length + 1}`,
        number: esFactura
          ? `F001-${String(++correlativoF).padStart(8, '0')}`
          : `B001-${String(++correlativoB).padStart(8, '0')}`,
        series: esFactura ? 'F001' : 'B001',
        documentType: esFactura ? 'factura' : 'boleta',
        customer: cliente
          ? {
            documentType: '6',
            documentNumber: cliente.documentNumber,
            name: cliente.name,
            phone: cliente.phone || '',
            email: cliente.email || '',
            address: cliente.address || '',
          }
          : {
            documentType: '1',
            documentNumber: String(40000000 + Math.floor(azar() * 9999999)),
            name: NOMBRES_PERSONA[Math.floor(azar() * NOMBRES_PERSONA.length)],
            phone: `9${String(10000000 + Math.floor(azar() * 89999999))}`,
            email: '',
            address: '',
          },
        items,
        subtotal: montos.subtotal,
        tax: montos.tax,
        total: montos.total,
        status: 'paid',
        paymentStatus: 'completed',
        paymentMethod: METODOS[Math.floor(azar() * METODOS.length)],
        createdAt: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), hora, Math.floor(azar() * 60)),
      })
    }
  }

  return facturas
}

/** Compras al proveedor: el costo que le da sentido a los reportes de margen. */
function generarCompras(rubro, hoy, azar) {
  const proveedores = rubro.proveedores || []
  const conCosto = rubro.productos.filter((p) => Number(p.cost) > 0)
  if (proveedores.length === 0 || conCosto.length === 0) return []

  return [0, 1, 2].map((i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 3 + Math.floor(azar() * 10))
    const prov = proveedores[i % proveedores.length]
    const items = []
    let total = 0
    const cuantos = 2 + Math.floor(azar() * 3)
    for (let k = 0; k < cuantos; k++) {
      const p = conCosto[Math.floor(azar() * conCosto.length)]
      if (!p || items.some((it) => it.code === p.code)) continue
      const cantidad = 5 + Math.floor(azar() * 20)
      items.push(itemDeVenta(p, cantidad, p.cost))
      total += p.cost * cantidad
    }
    const montos = desglosarIGV(total)
    return {
      id: `com-${i + 1}`,
      number: `COMPRA-${String(i + 1).padStart(4, '0')}`,
      supplierName: prov.name,
      supplierRuc: prov.ruc,
      documentType: 'factura',
      documentNumber: `F${100 + i}-${String(2000 + i).padStart(6, '0')}`,
      items,
      subtotal: montos.subtotal,
      tax: montos.tax,
      total: montos.total,
      status: 'received',
      createdAt: fecha,
      date: fecha,
    }
  })
}

/** Gastos fijos de cualquier negocio, más los propios del rubro. */
function generarGastos(rubro, hoy, azar) {
  const base = [
    { category: 'alquiler', description: 'Alquiler del local', amount: 1200 },
    { category: 'servicios', description: 'Luz y agua', amount: 280 },
    { category: 'servicios', description: 'Internet', amount: 120 },
    { category: 'planilla', description: 'Sueldo del personal', amount: 1500 },
    ...(rubro.gastos || []),
  ]
  const gastos = []
  for (let mes = 1; mes >= 0; mes--) {
    base.forEach((g, i) => {
      const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - mes, 5 + i)
      if (fecha > hoy) return
      gastos.push({
        id: `gas-${mes}-${i}`,
        ...g,
        amount: redondear(g.amount * (0.95 + azar() * 0.1)),
        paymentMethod: azar() < 0.5 ? 'Efectivo' : 'Transferencia',
        date: fecha,
        createdAt: fecha,
      })
    })
  }
  return gastos
}

/** Cotizaciones pendientes: lo que el negocio tiene "en el aire". */
function generarCotizaciones(rubro, hoy, azar) {
  const productos = rubro.productos.filter((p) => Number(p.price) > 0)
  const empresas = rubro.clientes.filter((c) => c.documentType === '6')
  if (productos.length === 0 || empresas.length === 0) return []

  return [0, 1, 2].map((i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (2 + i * 4))
    const cliente = empresas[i % empresas.length]
    const items = []
    let total = 0
    for (let k = 0; k < 2 + Math.floor(azar() * 2); k++) {
      const p = productos[Math.floor(azar() * productos.length)]
      if (items.some((it) => it.code === p.code)) continue
      const cantidad = 2 + Math.floor(azar() * 8)
      items.push(itemDeVenta(p, cantidad, p.price))
      total += p.price * cantidad
    }
    const montos = desglosarIGV(total)
    return {
      id: `cot-${i + 1}`,
      number: `COT-${String(i + 1).padStart(5, '0')}`,
      customer: {
        documentType: '6',
        documentNumber: cliente.documentNumber,
        name: cliente.name,
        address: cliente.address || '',
      },
      items,
      subtotal: montos.subtotal,
      tax: montos.tax,
      total: montos.total,
      status: ['sent', 'accepted', 'sent'][i],
      validUntil: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 15),
      createdAt: fecha,
      date: fecha,
    }
  })
}

/**
 * Salón de un restaurante: mesas con su estado, mozos y las órdenes abiertas.
 *
 * Una mesa "ocupada" tiene que tener SU orden y SU monto, o el mapa del salón
 * muestra mesas ocupadas en cero y el tablero no cuadra.
 */
function generarSalon(rubro, hoy, azar) {
  const salon = rubro.salon
  if (!salon) return { tables: [], waiters: [], orders: [] }

  const waiters = (salon.mozos || []).map((nombre, i) => ({
    id: `w${i + 1}`,
    code: `MOZ${String(i + 1).padStart(3, '0')}`,
    name: nombre,
    phone: `9871234${String(50 + i)}`,
    status: 'active',
    createdAt: new Date(hoy.getFullYear() - 1, 0, 15),
  }))

  const platos = rubro.productos.filter((p) => Number(p.price) > 0)
  const tables = []
  const orders = []
  let nOrden = 0

  ;(salon.zonas || []).forEach((zona) => {
    for (let n = 1; n <= zona.mesas; n++) {
      const numero = tables.length + 1
      // Alrededor de un tercio del salón ocupado: un salón vacío no vende, y
      // uno lleno tapa el mapa.
      const ocupada = azar() < 0.35 && waiters.length > 0
      const mesa = {
        id: String(numero),
        number: numero,
        capacity: zona.capacidad || 4,
        zone: zona.nombre,
        status: ocupada ? 'occupied' : 'available',
      }

      if (ocupada) {
        const mozo = waiters[Math.floor(azar() * waiters.length)]
        const items = []
        let total = 0
        for (let k = 0; k < 1 + Math.floor(azar() * 3); k++) {
          const p = platos[Math.floor(azar() * platos.length)]
          if (!p || items.some((it) => it.productId === p.id)) continue
          const cantidad = 1 + Math.floor(azar() * 3)
          items.push({
            productId: p.id,
            name: p.name,
            code: p.code,
            price: p.price,
            quantity: cantidad,
            total: redondear(p.price * cantidad),
          })
          total += p.price * cantidad
        }
        if (items.length > 0) {
          const montos = desglosarIGV(total)
          const abierta = new Date(hoy.getTime() - (10 + Math.floor(azar() * 70)) * 60000)
          nOrden += 1
          const orden = {
            id: `order${nOrden}`,
            orderNumber: `#${String(nOrden).padStart(3, '0')}`,
            tableId: mesa.id,
            tableNumber: mesa.number,
            waiterName: mozo.name,
            waiterId: mozo.id,
            status: azar() < 0.5 ? 'pending' : 'preparing',
            items,
            subtotal: montos.subtotal,
            tax: montos.tax,
            total: montos.total,
            createdAt: abierta,
          }
          orders.push(orden)
          mesa.waiter = mozo.name
          mesa.waiterId = mozo.id
          mesa.startTime = abierta
          mesa.amount = montos.total
          mesa.currentOrder = orden.id
        } else {
          mesa.status = 'available'
        }
      }

      tables.push(mesa)
    }
  })

  return { tables, waiters, orders }
}

/**
 * Lotes con fecha de vencimiento (farmacia).
 *
 * Se reparten en tres tramos a propósito: uno vencido, uno por vencer y el
 * resto lejano. Sin un lote por vencer, la alerta de vencimientos —que es LA
 * razón por la que una botica compra el sistema— sale vacía.
 */
function generarLotes(producto, hoy, azar, indice) {
  const total = Number(producto.stock) || 0
  if (total <= 0) return []
  const dia = (dias) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias)

  // Uno de cada seis productos arrastra un lote próximo a vencer.
  const porVencer = indice % 6 === 0
  const lejano = Math.ceil(total * (porVencer ? 0.7 : 1))
  // warehouseId: sin él las alertas muestran el lote como "Sin asignar" y no
  // se puede filtrar por almacén, que es como trabaja una botica con
  // mostrador y depósito.
  const lotes = [{
    id: `${producto.id}-l1`,
    lotNumber: `LOT-${String(1000 + indice)}`,
    warehouseId: '1',
    expiryDate: dia(240 + Math.floor(azar() * 400)),
    quantity: lejano,
    isExpired: false,
  }]
  if (porVencer && total - lejano > 0) {
    lotes.push({
      id: `${producto.id}-l2`,
      lotNumber: `LOT-${String(2000 + indice)}`,
      warehouseId: '2',
      expiryDate: dia(10 + Math.floor(azar() * 40)),
      quantity: total - lejano,
      isExpired: false,
    })
  }
  return lotes
}

/**
 * Reparto: repartidores y entregas del día.
 *
 * Solo para los rubros que reparten (`rubro.reparto`). Sin datos, la pantalla
 * de Envíos sale vacía y el visitante no entiende para qué sirve.
 */
function generarReparto(rubro, hoy, azar, facturas) {
  const nombres = rubro.reparto
  if (!nombres || nombres.length === 0) return { motoristas: [], deliveries: [] }

  const motoristas = nombres.map((nombre, i) => ({
    id: `mot${i + 1}`,
    code: `REP${String(i + 1).padStart(3, '0')}`,
    name: nombre,
    phone: `9876543${String(20 + i)}`,
    vehicleType: 'moto',
    plate: `M${String(1 + i)}A-${String(100 + i * 7)}`,
    status: 'active',
    isActive: true,
    createdAt: new Date(hoy.getFullYear() - 1, 5, 10),
  }))

  // Los mismos que usa el servicio real: con otros, el filtro no encuentra
  // nada y las tarjetas cuentan cero.
  const ESTADOS = ['delivered', 'delivered', 'in_transit', 'assigned', 'delivered']
  const DIRECCIONES = [
    'Av. Los Álamos 340, Dpto. 502', 'Jr. Las Gardenias 128', 'Calle Los Robles 76',
    'Av. Central 1890, Of. 302', 'Jr. Amazonas 455', 'Av. Las Palmeras 620',
    'Calle Los Cedros 233', 'Av. Los Próceres 1180',
  ]

  // Se arman sobre las ventas de HOY: una entrega tiene que corresponder a un
  // pedido real, o los montos no cuadran con nada.
  const hoyISO = hoy.toDateString()
  const delHoy = facturas.filter((f) => f.createdAt.toDateString() === hoyISO).slice(0, 6)

  const deliveries = delHoy.map((f, i) => {
    const estado = ESTADOS[i % ESTADOS.length]
    const mot = motoristas[i % motoristas.length]
    const contado = f.paymentMethod === 'Efectivo'
    return {
      id: `del${i + 1}`,
      orderNumber: f.number,
      invoiceId: f.id,
      customerName: f.customer.name,
      customerPhone: f.customer.phone || '',
      customerAddress: DIRECCIONES[i % DIRECCIONES.length],
      customerCoords: null,
      motoristaId: mot.id,
      motoristaName: mot.name,
      status: estado,
      amount: f.total,
      paymentMethod: f.paymentMethod,
      // Cobrado solo lo ya entregado: lo que sigue en la calle todavía no
      // llegó a la caja, que es justo lo que el arqueo del repartidor mide.
      paymentStatus: estado === 'delivered' ? 'paid' : 'pending',
      cashCollected: estado === 'delivered' && contado ? f.total : 0,
      createdAt: new Date(f.createdAt.getTime() + 30 * 60000),
    }
  })

  return { motoristas, deliveries }
}

/**
 * Arma el paquete completo de datos del demo para un rubro.
 * @param {object} rubro - definición del rubro (src/data/demo/rubros/*.js)
 */
export function construirDatosDemo(rubro) {
  const hoy = new Date()
  const azar = generador(semillaDe(rubro.slug))

  const almacenes = (rubro.almacenes || [
    { name: 'Almacén Principal' },
    { name: 'Tienda' },
  ]).map((a, i) => ({
    id: String(i + 1),
    name: a.name,
    location: a.location || rubro.negocio.address,
    isDefault: i === 0,
    isActive: true,
    createdAt: new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1),
  }))

  // El stock vive POR ALMACÉN y el total del producto es la suma: así lo
  // guarda el sistema real, y así el demo muestra bien Inventario y traslados.
  const repartir = (total) => {
    const enPrincipal = Math.ceil((Number(total) || 0) * 0.6)
    return [
      { warehouseId: '1', warehouseName: almacenes[0].name, stock: enPrincipal },
      { warehouseId: '2', warehouseName: almacenes[1]?.name || 'Tienda', stock: (Number(total) || 0) - enPrincipal },
    ]
  }

  const productos = rubro.productos.map((p, i) => {
    // Con variantes el stock vive en CADA VARIANTE, no en el padre: sin
    // repartirlo ahí, Inventario avisa "302 unidades sin asignar a almacén" y
    // el POS no las ofrece.
    if (p.hasVariants && p.variants?.length > 0) {
      const variants = p.variants.map((v) => ({ ...v, warehouseStocks: repartir(v.stock) }))
      const total = variants.reduce((suma, v) => suma + (Number(v.stock) || 0), 0)
      return {
        ...p,
        variants,
        stock: total,
        unit: p.unit || 'UNIDAD',
        // El padre acumula lo de sus variantes: es lo que leen los tableros.
        warehouseStocks: repartir(total),
      }
    }
    // Sin control de stock (servicios): no se le inventa reparto por almacén.
    if (p.stock === null || p.trackStock === false) {
      return { ...p, unit: p.unit || 'SERVICIO' }
    }
    return {
      ...p,
      stock: Number(p.stock) || 0,
      unit: p.unit || 'UNIDAD',
      warehouseStocks: repartir(p.stock),
      // Lotes solo donde el rubro los usa (farmacia): en una ferretería
      // inventar fechas de vencimiento sería ruido.
      ...(rubro.conLotes ? { batches: generarLotes(p, hoy, azar, i) } : {}),
    }
  })

  const conProductos = { ...rubro, productos }
  const salon = generarSalon(conProductos, hoy, azar)
  const facturas = generarVentas(conProductos, hoy, azar)
  const reparto = generarReparto(rubro, hoy, azar, facturas)

  return {
    user: {
      uid: 'demo-user',
      email: rubro.negocio.email || 'demo@cobrify.pe',
      displayName: 'Usuario Demo',
      photoURL: null,
    },
    business: {
      ...rubro.negocio,
      name: rubro.negocio.businessName,
      businessMode: rubro.businessMode || 'retail',
      catalogEnabled: true,
      catalogSlug: rubro.slug,
      catalogShowPrices: true,
      catalogAllowOrders: true,
      // Ajustes del rubro: encienden o apagan módulos del menú. Una ferretería
      // no quiere Agenda de Citas; una pastelería sí quiere Producción.
      ajustesDemo: {
        hiddenMenuItems: rubro.menusOcultos || [],
        ...(rubro.ajustes || {}),
      },
      featuresDemo: rubro.features || ['expenseManagement'],
    },
    products: productos,
    categories: rubro.categorias,
    customers: rubro.clientes,
    suppliers: rubro.proveedores || [],
    warehouses: almacenes,
    invoices: facturas,
    quotations: generarCotizaciones(conProductos, hoy, azar),
    purchases: generarCompras(conProductos, hoy, azar),
    expenses: generarGastos(rubro, hoy, azar),
    // Insumos: solo los rubros que producen (panadería, restaurante) los
    // traen. Una ferretería no tiene materia prima y su pestaña queda vacía,
    // que es lo honesto.
    ingredients: rubro.insumos || [],
    recipes: rubro.recetas || [],
    // Salón: vacío en los rubros que no atienden mesas.
    tables: salon.tables,
    waiters: salon.waiters,
    orders: salon.orders,
    laboratories: rubro.laboratorios || [],
    motoristas: reparto.motoristas,
    deliveries: reparto.deliveries,
    financialMovements: [],
    onlineOrders: [],
    employees: [],
    attendanceRecords: [],
    productions: [],
    subscription: {
      status: 'active',
      plan: 'unlimited_12_months',
      currentPeriodEnd: new Date(hoy.getFullYear() + 1, hoy.getMonth(), hoy.getDate()),
      accessBlocked: false,
    },
  }
}
