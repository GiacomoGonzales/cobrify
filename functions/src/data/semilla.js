/**
 * Cómo nace una cuenta nueva.
 *
 * Hasta hoy nadie decidió esto: 40 opciones quedaban encendidas o apagadas
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
 * Las 40 opciones, con el valor con el que arranca toda cuenta nueva.
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

  // ---- Punto de venta (16) — lo que se toca cien veces al día ----
  /** Una cuenta nueva no tiene stock: bloqueada, el POS parece roto. */
  allowNegativeStock: true,
  /** El compañero del anterior: vende, pero avisa qué falta cargar. */
  confirmSaleWithoutStock: true,
  /** Cobrar algo que no está en el catálogo, sin tener que crearlo antes. */
  allowCustomProducts: true,
  /** Un descuento en el mostrador. Al nacer, el dueño es el cajero. */
  allowPriceEdit: true,
  /** Renombrar al vuelo descuadra inventario y reportes. */
  allowNameEdit: false,
  /** La nota de venta no va a SUNAT: corregirla no rompe nada. */
  allowEditNotaVenta: true,
  /** Sin impresora configurada, cada venta abriría un diálogo que estorba. */
  autoPrintTicket: false,
  /** Terminada una venta, el mostrador queda limpio para la siguiente. */
  autoResetPOS: true,
  /** Con el catálogo chico del primer día, verlos todos es más rápido. */
  showAllProductsInPOS: true,
  /** Alarga las tarjetas y la mayoría usa nombres que se entienden solos. */
  showDescriptionInPOS: false,
  /** Una ventanita más en cada venta. */
  showChangeReminder: false,
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

  // ---- Inventario y productos (6) — cargar el catálogo sin pelear ----
  /** Sin esto, crear un producto pide un código que nadie sabe inventar. */
  autoSku: true,
  /** Se ven en el POS y en el catálogo; es de lo que más vende en una demo. */
  enableProductImages: true,
  /** Al cargar el inventario inicial lo va a necesitar sí o sí. */
  enableManualStockEdit: true,
  /** Útil con almacén grande; ruido con diez productos. */
  enableProductLocation: false,
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
  /** Para quien traslada mercadería; al resto solo le agrega un menú. */
  dispatchGuidesEnabled: false,
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

/** Las series de la sucursal número `n` (la primera es la 001). */
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
 * Las opciones con las que nace una cuenta de ESTE rubro: la semilla común más
 * los ajustes propios del rubro (una farmacia y una veterinaria no arrancan
 * igual). El catálogo entra por parámetro para que este archivo no dependa de
 * nada y lo puedan leer igual Node y el navegador.
 *
 * @param {string|null} rubroId
 * @param {Array<{id:string, modo:string, ajustes?:Object}>} catalogoRubros
 */
export function opcionesDelRubro(rubroId, catalogoRubros = []) {
  const rubro = catalogoRubros.find((r) => r.id === rubroId)
  return { ...OPCIONES_SEMILLA, ...(rubro?.ajustes || {}) }
}

/** El modo de negocio (el motor) que le toca a un rubro. `retail` si no se sabe. */
export function modoDelRubro(rubroId, catalogoRubros = []) {
  return catalogoRubros.find((r) => r.id === rubroId)?.modo || 'retail'
}
