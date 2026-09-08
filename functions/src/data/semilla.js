/**
 * Cómo nace una cuenta nueva.
 *
 * Hasta hoy nadie decidió esto: las opciones quedaban encendidas o apagadas
 * solo porque el campo existía o no existía en el documento, y ni el registro
 * normal ni el del reseller creaban la sucursal ni el almacén. Cada camino que
 * creaba cuentas lo hacía a su manera.
 *
 * Este archivo es la decisión escrita, y es UNO solo para todos: lo leen el
 * servidor (Node) y la web (Vite), igual que `rubros.json`. Cambiar cómo nace
 * una cuenta es cambiar una línea aquí, no buscarla en tres sitios.
 *
 * NO importa nada a propósito — el catálogo de rubros entra por parámetro,
 * como en `clasificador.js`.
 */

/**
 * Las 45 opciones, con el valor con el que arranca toda cuenta nueva.
 *
 * El criterio, en una línea: **que venda desde el primer minuto y no se meta
 * en líos**. Lo que hace falta para vender el día uno va encendido; lo que
 * necesita un aparato, un flujo o una decisión del negocio va apagado, porque
 * prenderlo es un clic y descubrirlo prendido es una sorpresa.
 */
export const OPCIONES_SEMILLA = {
  // ---- Comprobantes y SUNAT (3) — aquí un mal valor cuesta plata o multa ----
  /** Es para lo que compran el sistema. Apagado, todo queda pendiente. */
  autoSendToSunat: true,
  /** Un comprobante enviado se anula, no se borra: deja huecos que SUNAT nota. */
  allowDeleteInvoices: false,
  /** Excepción con reglas propias. Que la pida quien sabe lo que hace. */
  allowCustomEmissionDate: false,

  // ---- Punto de venta (17) — lo que se toca cien veces al día ----
  /** Una cuenta nueva no tiene stock: bloqueada, el POS parece roto. */
  allowNegativeStock: true,
  /** El compañero del anterior: vende, pero avisa qué falta cargar. */
  confirmSaleWithoutStock: true,
  /** Cobrar algo que no está en el catálogo, sin tener que crearlo antes. */
  allowCustomProducts: true,
  /** Un descuento en el mostrador. Al nacer, el dueño es el cajero. */
  allowPriceEdit: true,
  /** Renombrar al vuelo descuadra inventario y reportes, pero al cargar el
   *  catálogo el primer mes se necesita corregir nombres sin salir del POS. */
  allowNameEdit: true,
  /** Aunque la nota de venta no vaya a SUNAT, editarla descuadra el arqueo
   *  del día y el cajero se acostumbra a arreglar en vez de anular. */
  allowEditNotaVenta: false,
  /** Limpiar la búsqueda sola obliga a volver a escribir cuando se cargan
   *  varias unidades del mismo producto, que es lo normal sin pistola. */
  posClearSearchOnAdd: false,
  /** Sin impresora configurada, cada venta abriría un diálogo que estorba. */
  autoPrintTicket: false,
  /** Terminada una venta, el mostrador queda limpio para la siguiente. */
  autoResetPOS: true,
  /** Cargar el catálogo entero de golpe pone lento el POS apenas pasa de unos
   *  cientos de productos, y el botón Ver más está a un clic. */
  showAllProductsInPOS: false,
  /** Alarga las tarjetas y en retail los nombres se entienden solos; en
   *  restaurante la descripción ES la carta, así que ahí va encendida
   *  (ver `AJUSTES_POR_MODO`). */
  showDescriptionInPOS: false,
  /** Es una ventanita más, pero el vuelto mal dado sale del bolsillo del dueño. */
  showChangeReminder: true,
  /** Disciplina de negocio andando, no de arranque. */
  requireOpenCashRegister: false,
  /** Un cuadre cerrado no se retoca: protege al dueño de su propio cajero. */
  lockCashRegisterHistory: true,
  /** Función de quien fía con calendario. */
  notaVentaCreditTerms: false,
  /** Decisión comercial de cada negocio; nadie quiere un recargo sorpresa. */
  cardCommissionEnabled: false,
  /** Necesita un aparato que la mayoría no tiene. */
  enableCustomerDisplay: false,

  // ---- Inventario y productos (7) — cargar el catálogo sin pelear ----
  /** Sin esto, crear un producto pide un código que nadie sabe inventar. */
  autoSku: true,
  /** Se ven en el POS y en el catálogo; es de lo que más vende en una demo. */
  enableProductImages: true,
  /** El stock se mueve con compras y ventas; tocarlo a mano tapa los descuadres
   *  en vez de mostrarlos. Se prende para el inventario inicial y se apaga. */
  enableManualStockEdit: false,
  /** Útil con almacén grande; ruido con diez productos. */
  enableProductLocation: false,
  /** Con una sola sucursal no muestra nada, y el día que abra la segunda ya
   *  está lista: no hay que acordarse de prenderla. */
  showOtherBranchesStock: true,
  /** Movimientos entre almacenes, y al nacer hay uno solo. */
  stockDischargeEnabled: false,
  /** Herramienta de obras y almacenes con control de salidas. */
  exitNoteEnabled: false,

  // ---- Catálogo online (8) — apagado hasta que elijan publicarlo ----
  /** Antes de eso no hay catálogo: hay una página vacía con su nombre. */
  catalogEnabled: false,
  /** Cuando lo prendan, agrupado se ve ordenado desde el primer día. */
  catalogGroupByCategory: true,
  /** Estilo de presentación, no necesidad. */
  catalogOnlyCarousels: false,
  /** Al nacer todo tiene stock cero: prendido dejaría el catálogo vacío. */
  catalogHideOutOfStock: false,
  /** Por lo mismo: sin esto todo saldría como "Agotado". */
  catalogIgnoreStock: true,
  /** Enseñar cuántas quedan es decisión del negocio, y hoy mostraría cero. */
  catalogShowStock: false,
  /** Solo tiene sentido con más de una sucursal. */
  branchCatalogEnabled: false,
  /** Igual: con una sola sucursal solo agrega confusión. */
  branchPricingEnabled: false,

  // ---- Cómo salen impresos los comprobantes (3) ----
  /** El código es de uso interno: al cliente le ocupa una columna del ticket
   *  y no le dice nada. */
  showProductCodeInInvoices: false,
  /** En una cotización sí sirve: es con lo que el cliente pide después. */
  showProductCodeInQuotation: true,
  /** Lote y vencimiento son control interno; impresos confunden al cliente y
   *  alargan el ticket. Los rubros que los necesitan lo prenden. */
  hideBatchAndExpiryInDocuments: true,

  // ---- Notas de venta (3) — todo visible; ocultar es una elección ----
  hideCompanyDataInNotaVenta: false,
  hideRucIgvInNotaVenta: false,
  hideOnlyIgvInNotaVenta: false,

  // ---- Sub-usuarios (2) — cuando los haya, que arranquen viendo poco ----
  /** El empleado nuevo no debería ver la caja completa por defecto. */
  hideDashboardDataFromSecondary: true,
  /** Mismo principio: relajarlo es una decisión consciente del dueño. */
  showOnlyOwnSalesToSecondary: true,

  // ---- Módulos (2) ----
  /** Casi todo negocio con productos mueve mercadería alguna vez; el
   *  restaurante no, y ahí el menú sobra (ver `AJUSTES_POR_MODO`). */
  dispatchGuidesEnabled: true,
  /** Según rubro: encendida donde la agenda ES el negocio (ver ajustes). */
  appointmentsEnabled: false,
}

/**
 * Valores que no son interruptores pero que también hay que dejar escritos,
 * porque leerlos "en blanco" es justo lo que hacía que cada pantalla supusiera
 * una cosa distinta.
 */
export const VALORES_SEMILLA = {
  /** 10 = gravado con IGV, que es el caso de casi todos. */
  defaultTaxAffectation: '10',
  allowManualTaxAffectation: false,
  /** La cuenta nace con SUNAT apagado: si arrancara en boleta, cada venta
   *  dejaría un comprobante pendiente de enviar. La nota de venta cobra igual
   *  y no va a SUNAT. Se cambia a boleta el día que se configure SUNAT. */
  defaultDocumentType: 'nota_venta',
  /** Vacío = ninguno: el cajero elige con qué cobró. Marcar efectivo de fábrica
   *  hace que todo lo pagado con Yape se registre como efectivo por descuido. */
  defaultPaymentMethod: '',
  /** 80 % del ancho: el logo se lee y no se come el ticket. */
  logoPrintScale: 80,
  posCustomFields: {},
  hiddenMenuItems: [],
}

/** Las series del negocio. Doble letra a propósito: no chocan con las de sucursal. */
export const SERIES_NEGOCIO = {
  factura: { serie: 'FF01', lastNumber: 0 },
  boleta: { serie: 'BB01', lastNumber: 0 },
  nota_venta: { serie: 'NN01', lastNumber: 0 },
  cotizacion: { serie: 'CC01', lastNumber: 0 },
  nota_credito_factura: { serie: 'FC01', lastNumber: 0 },
  nota_credito_boleta: { serie: 'BC01', lastNumber: 0 },
  nota_debito_factura: { serie: 'FD01', lastNumber: 0 },
  nota_debito_boleta: { serie: 'BD01', lastNumber: 0 },
  guia_remision: { serie: 'TT01', lastNumber: 0 },
  guia_transportista: { serie: 'VV01', lastNumber: 0 },
}

/**
 * Las series de una sucursal ADICIONAL (`n` = 1 para la primera que se cree).
 *
 * La semilla NO las usa: la Sucursal Principal es el negocio y sus series son
 * las de arriba. Esto es para cuando el cliente cree su segunda sede.
 */
export function seriesDeSucursal(n = 1) {
  const s = String(n).padStart(3, '0')
  return {
    factura: { serie: `F${s}`, lastNumber: 0 },
    boleta: { serie: `B${s}`, lastNumber: 0 },
    nota_venta: { serie: `N${s}`, lastNumber: 0 },
    cotizacion: { serie: `C${s}`, lastNumber: 0 },
    nota_credito_factura: { serie: `FC${s}`, lastNumber: 0 },
    nota_credito_boleta: { serie: `BC${s}`, lastNumber: 0 },
    nota_debito_factura: { serie: `FD${s}`, lastNumber: 0 },
    nota_debito_boleta: { serie: `BD${s}`, lastNumber: 0 },
    guia_remision: { serie: `T${s}`, lastNumber: 0 },
  }
}

/** El estado inicial de SUNAT: apagado hasta que se configure desde el admin. */
export const SUNAT_SEMILLA = { enabled: false, environment: 'beta', solUser: '', homologated: false }

/**
 * Lo que cambia por MOTOR, no por rubro.
 *
 * Hay opciones que no dependen de si el negocio vende tortas o cemento sino de
 * con qué motor trabaja: en un restaurante la descripción del plato ES la
 * carta, y las guías de remisión no las va a usar nunca. Ponerlo acá y no en
 * los `ajustes` de cada rubro de `rubros.json` es para que un rubro nuevo de
 * comida nazca bien sin que nadie se acuerde de copiarle estas dos líneas.
 *
 * El rubro sigue mandando: sus `ajustes` se aplican después y pueden
 * contradecir a su motor.
 */
export const AJUSTES_POR_MODO = {
  restaurant: {
    /** La descripción del plato es lo que el mozo necesita leer. */
    showDescriptionInPOS: true,
    /** Un restaurante no traslada mercadería: el menú solo estorba. */
    dispatchGuidesEnabled: false,
  },
}

/**
 * Las opciones con las que nace una cuenta de ESTE rubro: la semilla común,
 * encima lo que cambia su motor (`AJUSTES_POR_MODO`) y encima los ajustes
 * propios del rubro (una farmacia y una veterinaria no arrancan igual). El
 * catálogo entra por parámetro para que este archivo no dependa de nada y lo
 * puedan leer igual Node y el navegador.
 *
 * @param {string|null} rubroId
 * @param {Array<{id:string, modo:string, ajustes?:Object}>} catalogoRubros
 */
export function opcionesDelRubro(rubroId, catalogoRubros = []) {
  const rubro = catalogoRubros.find((r) => r.id === rubroId)
  return {
    ...OPCIONES_SEMILLA,
    ...(AJUSTES_POR_MODO[rubro?.modo] || {}),
    ...(rubro?.ajustes || {}),
  }
}

/** El modo de negocio (el motor) que le toca a un rubro. `retail` si no se sabe. */
export function modoDelRubro(rubroId, catalogoRubros = []) {
  return catalogoRubros.find((r) => r.id === rubroId)?.modo || 'retail'
}
