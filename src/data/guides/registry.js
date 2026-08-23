/**
 * Registro de GUÍAS DE USO del sistema.
 *
 * Cada página del sistema puede tener una guía. Acá vive solo la METADATA
 * (título, categoría, ruta, palabras de búsqueda); el CONTENIDO de cada guía
 * vive en su propio archivo de esta carpeta y se carga bajo demanda con
 * import() dinámico, para que el manual no engorde el bundle principal.
 *
 * La guía se consume desde dos lugares:
 *  - El panel lateral de ayuda (botón "?" del Navbar) muestra la guía de la
 *    página ACTUAL, resuelta por ruta con getGuideByPath().
 *  - La página /app/manual lista todas las guías del modo de negocio activo,
 *    con búsqueda, y muestra cada una completa en /app/manual/:guideId.
 *
 * REGLA DEL EQUIPO: toda funcionalidad nueva entra al repo con su sección de
 * guía en el mismo commit. Para agregar una guía nueva: crear el archivo de
 * contenido y registrar una entrada acá. Nada más.
 *
 * ENLACES PROFUNDOS A CONFIGURACIÓN: los bloques `enlace` y `requiereOpcion.ruta`
 * aceptan `/app/configuracion?tab=<pestaña>&opcion=<flag>` — Settings abre esa
 * pestaña, hace scroll hasta la opción y la resalta. El ancla es `opcion-<flag>`
 * (el `id` del SettingToggle, mismo nombre del flag en businessSettings).
 */

/** Orden fijo de las categorías en el índice del manual. */
export const GUIDE_CATEGORIES = [
  'Primeros pasos',
  // Recorridos que cruzan varias pantallas. Las demas categorias agrupan guias
  // POR PANTALLA; estas responden a un TRABAJO ("como manejo el stock de mis
  // insumos"), que es como pregunta el usuario y no como esta partido el sistema.
  'Cómo hacer',
  'Ventas',
  'Inventario',
  'Operación',
  'Finanzas',
  'Configuración',
]

export const GUIDES = [
  {
    id: 'flujo-insumos',
    route: null, // recorrido: no pertenece a una pantalla
    title: 'Manejar el stock de tus insumos',
    category: 'Cómo hacer',
    description: 'De punta a punta: crear el insumo, comprarlo, definir la composición, vender o producir, y revisar qué falta.',
    keywords: 'insumo ingrediente materia prima stock minimo receta composicion costo promedio compra producir produccion merma unidad kilo litro recuento cuadrar descuento automatico plato pack combo',
    modos: ['restaurant', 'retail', 'transport', 'veterinary'],
    load: () => import('./flujo-insumos.js'),
  },
  {
    id: 'vender-al-credito',
    route: null, // recorrido: cruza POS, Ventas, Clientes y Reportes
    title: 'Vender al crédito y cobrar después',
    category: 'Cómo hacer',
    description: 'El circuito completo: emitir con vencimiento y cuotas, registrar cada cobro y vigilar quién te debe.',
    keywords: 'credito fiado deuda deber vencimiento cuotas cronograma registrar pago abono parcial saldo pendiente por cobrar vencidas cliente debe estados de pago cobranza',
    modos: null,
    load: () => import('./vender-al-credito.js'),
  },
  {
    id: 'corregir-comprobante',
    route: null, // recorrido: la tabla de decision vive tambien en la guia de Ventas
    title: 'Corregir o anular un comprobante emitido',
    category: 'Cómo hacer',
    description: 'Qué corresponde según qué pasó: nota de crédito, comunicación de baja, editar y reenviar, o anular la nota de venta.',
    keywords: 'corregir anular equivocacion error borrar eliminar comprobante factura boleta nota de credito debito motivo devolucion comunicacion de baja 7 dias rechazado sunat reenviar reemitir stock devolver dinero egreso',
    modos: null,
    load: () => import('./corregir-comprobante.js'),
  },
  {
    id: 'varias-sucursales',
    route: null, // recorrido: selector del header, series, precios, usuarios y stock
    title: 'Trabajar con varias sucursales',
    category: 'Cómo hacer',
    description: 'Sucursal vs almacén, el selector del encabezado, series por local, precios y catálogo por sede, personal y transferencias.',
    keywords: 'sucursal sucursales sede local multi tienda almacen selector encabezado series por sucursal precios por sucursal catalogo por sucursal usuarios acceso transferencia stock entre locales consolidado mesas por sede',
    modos: null,
    load: () => import('./varias-sucursales.js'),
  },
  {
    id: 'cuanto-gano',
    route: null, // recorrido: costos + gastos -> Ganancia Final
    title: 'Saber cuánto ganas de verdad',
    category: 'Cómo hacer',
    description: 'Cargar costos, registrar gastos y leer la Ganancia Final — y por qué Rentabilidad no es tu margen.',
    keywords: 'ganancia utilidad margen cuanto gane gano rentabilidad costo de productos cargar costos gastos registrar ganancia final resumen general excel contador stock inicial compras del periodo activo equipamiento margen inflado 100',
    modos: null,
    load: () => import('./cuanto-gano.js'),
  },
  {
    id: 'prestamos-cartera',
    route: '/app/prestamos-cartera',
    title: 'Préstamos (Cartera)',
    category: 'Finanzas',
    description: 'Registrar préstamos, cobrar cuotas con desglose mora/interés/capital y entregar constancias.',
    keywords: 'prestamos cartera prestar capital interes cuota fija solo interes mora modalidad diario semanal quincenal mensual constancia pago amortizar',
    modos: ['lending'],
    load: () => import('./prestamos-cartera.js'),
  },
  {
    id: 'dashboard',
    route: '/app/dashboard',
    title: 'Dashboard',
    category: 'Primeros pasos',
    description: 'La pantalla de inicio: ventas del día y del mes, ticket promedio, gráficos, top productos y clientes.',
    keywords: 'dashboard inicio resumen ventas del dia del mes ticket promedio grafico ultimos 7 dias 12 meses metodos de pago top productos clientes facturas recientes ocultar montos sucursal consolidada',
    modos: null,
    load: () => import('./dashboard.js'),
  },
  {
    id: 'pos',
    route: '/app/pos',
    title: 'Punto de Venta (POS)',
    category: 'Ventas',
    description: 'Cobrar una venta, elegir el comprobante, medios de pago, impresión del ticket y qué hacer si se corta el internet.',
    keywords: 'vender cobrar caja boleta factura nota de venta ticket vuelto efectivo yape plin tarjeta credito cuotas escaner codigo de barras cliente ruc dni fecha de emision producto personalizado limpiar aparcar en espera descuento bonificacion whatsapp pdf referencias',
    modos: null, // null = aplica a todos los modos de negocio
    load: () => import('./pos.js'),
  },
  {
    id: 'facturas',
    route: '/app/facturas',
    title: 'Ventas (historial de comprobantes)',
    category: 'Ventas',
    description: 'Buscar comprobantes, cobrar lo pendiente, anular o corregir con nota de crédito, convertir notas de venta y exportar a Excel.',
    keywords: 'ventas facturas boletas historial comprobantes anular nota de credito nota de debito baja sunat cdr xml pdf convertir nota de venta registrar pago pagos pendientes cuentas por cobrar credito cuotas vencida exportar excel archivados rechazado reenviar guia de remision whatsapp duplicar editar eliminar nota de salida alumno placa vuelto lote',
    modos: null,
    load: () => import('./facturas.js'),
  },
  {
    id: 'promociones',
    route: '/app/promociones',
    title: 'Promociones',
    category: 'Ventas',
    description: 'Fidelizar y vender más: tarjeta de sellos digital, combos a precio especial y cupones de descuento.',
    keywords: 'promociones marketing fidelizacion tarjeta de sellos sello premio canjear meta wallet apple google combo precio especial ahorro cupon codigo descuento porcentaje monto vencimiento limite de usos VERANO10 campaña redes whatsapp hora feliz happy hour descuento programado por horario dia oferta 2x1',
    modos: ['retail', 'restaurant', 'pharmacy', 'veterinary'],
    load: () => import('./promociones.js'),
  },
  {
    id: 'clientes',
    route: '/app/clientes',
    title: 'Clientes',
    category: 'Ventas',
    description: 'Registrar clientes con búsqueda automática en SUNAT/RENIEC, ver quién te debe, importar en Excel y asignar niveles de precio.',
    keywords: 'clientes cartera ruc dni reniec sunat importar exportar excel por cobrar vencidas nivel de precio mayorista mascotas vehiculo alumno cumpleanos deuda',
    modos: null,
    load: () => import('./clientes.js'),
  },
  {
    id: 'productos',
    route: '/app/productos',
    title: 'Productos',
    category: 'Inventario',
    description: 'Crear productos, códigos de barras, variantes y presentaciones, precios, acciones masivas, etiquetas e importación.',
    keywords: 'productos catalogo crear precio costo sku codigo de barras ean variantes tallas colores presentaciones caja docena categoria marca igv afectacion etiquetas zebra importar exportar excel acciones masivas activar desactivar decimales servicio',
    modos: null,
    load: () => import('./productos.js'),
  },
  {
    id: 'inventario',
    route: '/app/inventario',
    title: 'Inventario',
    category: 'Inventario',
    description: 'Cuadrar el stock: mermas, traslados entre almacenes, recuento físico, historial de movimientos, lotes y series.',
    keywords: 'inventario stock merma perdida robo vencido dañado transferir traslado almacen sucursal recuento fisico conteo diferencia faltante sobrante movimientos entradas salidas lotes vencimiento series valor costo stock bajo agotados negativo',
    modos: null,
    load: () => import('./inventario.js'),
  },
  {
    id: 'caja',
    route: '/app/caja',
    title: 'Control de Caja',
    category: 'Finanzas',
    description: 'Abrir y cerrar caja, registrar ingresos y egresos, arqueo, diferencias, cierre a ciegas e historial de sesiones.',
    keywords: 'caja apertura cierre arqueo monto inicial efectivo contado esperado diferencia faltante sobrante descuadre no cuadra ingreso egreso movimientos sesion constancia reporte pdf excel historial yape plin tarjeta transferencia rappi pedidosya didifood delivery metodos personalizados dolares usd turno cajero a ciegas requerir caja abierta selector mi caja todos sucursal',
    modos: null,
    load: () => import('./caja.js'),
  },
  {
    id: 'gastos',
    route: '/app/gastos',
    title: 'Gastos',
    category: 'Finanzas',
    description: 'Registrar y categorizar los gastos del negocio, ver en qué se va el dinero y exportar para el contador.',
    keywords: 'gastos egresos categorias servicios luz agua internet sueldos salarios transporte alquiler proveedor comprobante recibo dolares tipo de cambio sbs excel promedio diario evolucion',
    modos: null,
    load: () => import('./gastos.js'),
  },
  {
    id: 'reportes',
    route: '/app/reportes',
    title: 'Reportes',
    category: 'Finanzas',
    description: 'Los diez reportes explicados: qué se vende, quién compra, de dónde vienen y cuánto ganas de verdad.',
    keywords: 'reportes estadisticas resumen general ventas productos marcas clientes zonas vendedores gastos rentabilidad hotel ticket promedio utilidad bruta operativa margen operativo costo de ventas distribucion del ingreso evolucion utilidad neta top productos categorias variantes tallas colores mapa departamento distrito comisiones ventas por hora que dias se vende mas metodo de pago efectivo estados de pago pagadas pendientes tipos de pedido distribucion comprobantes exportar excel descargar periodo hoy semana mes trimestre año personalizado sucursal moneda dolares costo congelado receta',
    modos: null,
    load: () => import('./reportes.js'),
  },
  {
    id: 'compras',
    route: '/app/compras',
    title: 'Compras',
    category: 'Inventario',
    description: 'Registrar la mercadería que entra, importar la factura del proveedor por XML, costos, lotes y cuentas por pagar.',
    keywords: 'compras proveedor factura xml importar costo con igv sin igv stock entrada lote vencimiento serie registro sanitario presentacion caja unidad de compra credito contado cuentas por pagar abonos dolares sbs no afectar inventario revertir',
    modos: null,
    load: () => import('./compras.js'),
  },
  {
    id: 'proveedores',
    route: '/app/proveedores',
    title: 'Proveedores',
    category: 'Inventario',
    description: 'Registrar a quién le compras, con búsqueda automática por RUC, e importar tu lista completa.',
    keywords: 'proveedores ruc razon social sunat contacto telefono importar cuentas por pagar compras',
    modos: null,
    load: () => import('./proveedores.js'),
  },
  {
    id: 'ordenes-compra',
    route: '/app/ordenes-compra',
    title: 'Órdenes de Compra',
    category: 'Inventario',
    description: 'Pedidos formales al proveedor: estados, PDF para enviar y conversión en compra cuando llega la mercadería.',
    keywords: 'orden de compra pedido proveedor borrador enviada recibida cancelada convertir en compra pdf observaciones en camino',
    modos: null,
    load: () => import('./ordenes-compra.js'),
  },
  {
    id: 'emision-masiva',
    route: '/app/emision-masiva',
    title: 'Emisión Masiva',
    category: 'Ventas',
    description: 'Crear muchos documentos de una vez desde un Excel: comprobantes con vista previa validada, y GRE Transportista con emisión del lote a SUNAT.',
    keywords: 'emision masiva excel plantilla lote importar comprobantes facturas boletas guias transportista gre masivo carga masiva subir archivo validar errores por fila ubigeo',
    modos: ['retail', 'pharmacy', 'transport'],
    load: () => import('./emision-masiva.js'),
  },
  {
    id: 'cotizaciones',
    route: '/app/cotizaciones',
    title: 'Cotizaciones',
    category: 'Ventas',
    description: 'Armar propuestas de precio, compartirlas en PDF o ticket, hacerles seguimiento y convertirlas en venta.',
    keywords: 'cotizacion proforma presupuesto propuesta validez vence duplicar aceptada rechazada convertida convertir a factura pdf ticket guia remitente no descuenta stock',
    modos: null,
    load: () => import('./cotizaciones.js'),
  },
  {
    id: 'almacenes',
    route: '/app/almacenes',
    title: 'Almacenes',
    category: 'Inventario',
    description: 'Definir dónde guardas la mercadería, cuándo conviene tener más de uno y cómo afecta al POS y a las compras.',
    keywords: 'almacenes deposito trastienda principal activo inactivo codigo sucursal stock por almacen transferencia eliminar',
    modos: null,
    load: () => import('./almacenes.js'),
  },
  {
    id: 'consumo-interno',
    route: '/app/inventario',
    title: 'Consumo Interno',
    category: 'Inventario',
    description: 'Descontar lo que sale sin venderse: consumo del personal, merma, cortesías, muestras. Con su costo y su motivo.',
    keywords: 'consumo interno personal empleados almuerzo comida merma desperdicio malogrado vencido cortesia regalo invitacion muestra degustacion rotura daño uso interno costo salida sin venta retiro de bienes autoconsumo',
    modos: null,
    load: () => import('./consumo-interno.js'),
  },
  {
    id: 'movimientos',
    route: '/app/movimientos',
    title: 'Movimientos de Inventario',
    category: 'Inventario',
    description: 'El historial de todo lo que movió tu stock: entradas, salidas, transferencias y ajustes, con el saldo resultante.',
    keywords: 'movimientos historial stock entradas salidas sin ventas transferencias ajustes produccion motivo saldo descuadre auditar entre sucursales',
    modos: null,
    load: () => import('./movimientos.js'),
  },
  {
    id: 'guias-remision',
    route: '/app/guias-remision',
    title: 'Guías de Remisión',
    category: 'Operación',
    description: 'Emitir la GRE del traslado: origen y destino, datos del transporte, descuento de stock, anulación y rechazos frecuentes.',
    keywords: 'guia de remision gre remitente traslado despacho transporte placa conductor licencia dni modalidad origen destino peso motivo venta consignacion anular clonar xml cdr sunat rechazo',
    modos: null,
    load: () => import('./guias-remision.js'),
  },
  {
    id: 'mesas',
    route: '/app/mesas',
    title: 'Mesas',
    category: 'Operación',
    description: 'El tablero del salón: mesas y zonas, reservas, juntar/mover/dividir, precuenta y las dos formas de cobrar por separado.',
    keywords: 'mesas salon zona terraza piso ocupada disponible reservada reservar cancelar reserva mantenimiento consumo precuenta descuento imprimir por persona cobrar cerrar cuenta cobro individual dividir cuenta entre personas asignar items dividir mesa mover transferir juntar unir separar agrupar liberar servido marcar servidos barra cuenta de barra mozo comanda cocina sin comprobante cortesia restaurante',
    modos: ['restaurant'],
    load: () => import('./mesas.js'),
  },
  {
    id: 'ordenes',
    route: '/app/ordenes',
    title: 'Órdenes',
    category: 'Operación',
    description: 'La bandeja de todo lo que está en curso: mesa, para llevar, delivery y en local, con sus estados y el repartidor.',
    keywords: 'ordenes activas pendiente preparando lista despachada entregada marcar lista marcar entregada despachar estados delivery repartidor asignar para llevar en local mostrador patio de comidas barra en mesa nueva orden editar orden cerrar cuenta sin comprobante cortesia menu digital pedidos online cocina restaurante',
    modos: ['restaurant'],
    load: () => import('./ordenes.js'),
  },
  {
    id: 'cocina',
    route: '/app/cocina',
    title: 'Cocina',
    category: 'Operación',
    description: 'La pantalla de producción: pendientes, en preparación y listas, ordenadas por tiempo de llegada.',
    keywords: 'cocina comanda pendientes en preparacion listas iniciar marcar como lista entregado estacion filtro tablet monitor restaurante',
    modos: ['restaurant'],
    load: () => import('./cocina.js'),
  },
  {
    id: 'agenda-citas',
    route: '/app/agenda-veterinaria',
    title: 'Agenda de Citas',
    category: 'Operación',
    description: 'Agendar citas viendo la disponibilidad del día, atender walk-ins y cobrar cada atención en el POS.',
    keywords: 'agenda cita citas agendar programar calendario disponibilidad horario mascota paciente veterinaria consultorio podologia estetica taller confirmar no asistio walk-in atender ahora en atencion finalizar y cobrar recordatorio whatsapp',
    modos: ['veterinary', 'retail'],
    load: () => import('./agenda-citas.js'),
  },
  {
    id: 'recordatorios-veterinaria',
    route: '/app/alertas-veterinaria',
    title: 'Recordatorios',
    category: 'Operación',
    description: 'Qué mascota toca esta semana y cuál se pasó de fecha, con el recordatorio que se agenda solo al cobrar el servicio.',
    keywords: 'recordatorio recordatorios alerta alertas veterinaria mascota bano spa desparasitacion vacuna refuerzo vencido proximo whatsapp frecuencia dias servicio recurrente cada cuanto repetir agendar',
    modos: ['veterinary'],
    load: () => import('./recordatorios-veterinaria.js'),
  },
  {
    id: 'ingredientes',
    route: '/app/ingredientes',
    title: 'Insumos / Ingredientes',
    category: 'Inventario',
    description: 'La materia prima: registrar insumos, controlar su stock y costo promedio, compras de insumos y modificadores.',
    keywords: 'insumos ingredientes materia prima stock bajo costo promedio valor total solo para costos compras de insumos modificadores extras receta descuento',
    modos: ['restaurant', 'retail', 'transport', 'veterinary'],
    load: () => import('./ingredientes.js'),
  },
  {
    id: 'recetas',
    route: '/app/recetas',
    title: 'Recetas / Composición',
    category: 'Inventario',
    description: 'Cuánto insumo lleva cada producto: descuento automático al vender y costo real de cada plato.',
    keywords: 'recetas composicion producto compuesto ingredientes insumos cantidad costo total descontar insumos al vender rentabilidad plato margen',
    modos: ['restaurant', 'retail', 'transport', 'veterinary'],
    load: () => import('./recetas.js'),
  },
  {
    id: 'vendedores',
    route: '/app/vendedores',
    title: 'Vendedores',
    category: 'Operación',
    description: 'Registrar a quién se le atribuyen las ventas, metas y comisiones, y por qué un vendedor no es lo mismo que un usuario.',
    keywords: 'vendedores comision meta ventas hoy ordenes codigo activo inactivo sin vendedor asignado reporte por vendedor atribuir venta',
    modos: null,
    load: () => import('./vendedores.js'),
  },
  {
    id: 'usuarios',
    route: '/app/usuarios',
    title: 'Usuarios y permisos',
    category: 'Configuración',
    description: 'Crear cuentas para tu equipo y decidir qué páginas ve cada uno, a qué sucursal accede y qué información se le oculta.',
    keywords: 'usuarios permisos acceso paginas sucursales almacenes sub-usuario cajero ocultar descuentos ocultar stock caja independiente tipos de comprobante vendedor asignado desactivar contrasena email',
    modos: null,
    load: () => import('./usuarios.js'),
  },
  {
    id: 'catalogo-online',
    // Sin ruta propia: es la pestaña "catalogo" de Configuración. Guía de solo manual.
    route: null,
    title: 'Mi Catálogo Online',
    category: 'Operación',
    description: 'Tu tienda web armada con los productos que ya tienes: activarla, compartir el enlace y el QR, y recibir pedidos.',
    keywords: 'catalogo online tienda web vitrina enlace qr compartir whatsapp mostrar precios ignorar stock recepcion de pedidos delivery para llevar carta digital menu qr por mesa',
    modos: null,
    load: () => import('./catalogo-online.js'),
  },
  {
    id: 'envios',
    route: '/app/envios',
    title: 'Envíos',
    category: 'Operación',
    description: 'Repartidores, asignación de entregas, la dirección que abre el mapa y el arqueo del efectivo cobrado.',
    keywords: 'envios delivery repartidor motorista motorizado entrega direccion mapa google maps ubicacion gps ruta arqueo efectivo cobrar al entregar asignar repartidor usuario',
    modos: null,
    load: () => import('./envios.js'),
  },
  {
    id: 'pedidos-online',
    route: '/app/pedidos-online',
    title: 'Pedidos Online',
    category: 'Operación',
    description: 'La bandeja de pedidos del catálogo digital: cómo te avisan, cómo atenderlos y cómo convertirlos en venta.',
    keywords: 'pedidos online catalogo digital alerta sonido notas del cliente historial desde hasta convertir en venta auto-aceptar delivery para llevar stock',
    modos: null,
    load: () => import('./pedidos-online.js'),
  },
  {
    id: 'configuracion',
    route: '/app/configuracion',
    title: 'Configuración',
    category: 'Configuración',
    description: 'Las once pestañas explicadas: datos de empresa, qué puede hacer tu cajero, precios y monedas, comprobantes, series, impresora y privacidad de datos.',
    keywords: 'configuracion ajustes empresa ruc razon social nombre comercial logo ubigeo distrito establecimientos anexos series numeracion correlativo impresora termica ancho papel 58 80 compacta modulos menu ocultar preferencias documentos seguridad notificaciones limpieza borrado masivo editar precio cajero producto personalizado stock negativo vender sin stock imprimir automatico vuelto varios precios nivel precio sucursal multidivisa dolares tipo cambio comprobantes habilitados metodo pago nota de venta ocultar igv ruc credito cuotas comanda cocina estacion recargo consumo caja abierta arqueo ciegas efectivo esperado sub-usuario secundario sunat envio automatico eliminar comprobantes guias remision gre nota salida lotes vencimiento afectacion igv exonerado amazonia ubicacion productos pantalla cliente',
    modos: null,
    load: () => import('./configuracion.js'),
  },
]

/**
 * Normaliza la ruta actual para poder resolver la guía también dentro de los
 * demos: /demo/pos, /demorestaurant/pos, etc. → /app/pos.
 */
const normalizePath = (pathname = '') => pathname.replace(/^\/demo[a-z]*(\/|$)/, '/app$1')

/**
 * Guía correspondiente a la ruta actual (o null si la página aún no tiene).
 *
 * Una guía con `route: null` es de SOLO MANUAL: cubre una función que no vive
 * en una página propia (p. ej. el catálogo online, que es una pestaña de
 * Configuración) y por eso no debe secuestrar el panel de ayuda de otra página.
 */
export const getGuideByPath = (pathname) => {
  const path = normalizePath(pathname)
  return (
    GUIDES.find(g => g.route && (g.route === path || path.startsWith(g.route + '/'))) || null
  )
}

export const getGuideById = (id) => GUIDES.find(g => g.id === id) || null

/** Guías visibles para un modo de negocio. */
export const getGuidesForMode = (businessMode) =>
  GUIDES.filter(g => !g.modos || g.modos.includes(businessMode))

/**
 * Secciones visibles de una guía para el modo activo.
 * `soloModos` OCULTA la sección en modos ajenos (a un minimarket no le hablamos
 * de comandas). Las opciones de configuración NO ocultan: la sección se muestra
 * con una nota "requiere activar X" (ver GuideRenderer), para que el usuario
 * descubra que la función existe.
 */
export const getVisibleSections = (content, businessMode) =>
  (content?.sections || []).filter(s => !s.soloModos || s.soloModos.includes(businessMode))
