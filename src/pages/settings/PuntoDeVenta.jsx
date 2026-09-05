/**
 * PUNTO DE VENTA — cómo se vende: comprobantes, métodos de pago, impuestos,
 * stock, lo que puede hacer el cajero, la caja, los campos del cliente y la
 * operación propia de cada rubro (restaurante, veterinaria, grifo).
 *
 * Es la ex pestaña "Ventas" de Settings.jsx, partida en secciones y escrita
 * con el kit. La lógica se movió tal cual; lo que cambió es dónde está cada
 * cosa y cómo se ve:
 *
 *   - Entran acá "Envío automático a SUNAT" y "Permitir eliminar comprobantes"
 *     (antes en Documentos) y, desde Preferencias, la afectación IGV, los
 *     ajustes de stock del catálogo, el control de lotes, el costo de envío
 *     sugerido y las fuentes de pedido: todos se leen o se aplican al vender.
 *   - Entran también, de Documentos, las observaciones por defecto de las
 *     órdenes de compra y las plantillas de términos de las cotizaciones
 *     (sección "Compras y cotizaciones").
 *   - Se van a Impresión los ajustes de ticket y de comanda; a Módulos los
 *     precios y el catálogo por sucursal, los niveles de precio y la
 *     multi-divisa.
 *   - "Requerir caja abierta" y "Comisión por tarjeta" estaban bajo "Notas de
 *     Venta" por error: ahora tienen su sección, Caja.
 *   - "Mostrar todos los productos en el POS" parecía contradecir a "Ocultar
 *     productos sin stock" y no: controla la paginación. Ahora se llama
 *     "Cargar todo el catálogo de una vez".
 *   - El costo de envío guardaba solo al salir del campo (onBlur); ahora va
 *     con el botón Guardar, como todo lo demás.
 *
 * ── Qué escribe ─────────────────────────────────────────────────────────────
 * Solo sus campos, con `useGuardado` (merge). Esta pestaña es la dueña de
 * `posCustomFields`, `serviceStationConfig` y `restaurantConfig`, SALVO las
 * tres claves de impresión de `restaurantConfig` (`autoPrintKitchenComanda`,
 * `autoPrintByStation`, `combineStationsOnWebPrint`), que administra
 * Impresión: acá ni se cargan ni se escriben. Como el guardado es con merge y
 * Firestore fusiona los mapas anidados, un `restaurantConfig` sin esas claves
 * las deja intactas.
 *
 * Los campos que solo existen para un rubro (`restaurantConfig`, fuentes de
 * pedido, costo de envío, días de recordatorio veterinario) se escriben
 * únicamente cuando el negocio está en ese modo: si no están en pantalla, no
 * se editan, y lo que no se edita no se escribe.
 */
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useGuardado } from '@/components/settings/useGuardado'
import { Seccion, Ajuste, Campo, Nota, BarraGuardar, Separador } from '@/components/settings/kit'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { formatCurrency, matchesPrebuilt } from '@/lib/utils'
import { filtrarVendibles } from '@/utils/productSale'
import { recuerdaServicios } from '@/utils/businessModes'
import { buildProductHaystack } from '@/utils/productSearch'
import { getProducts, getProductCategories } from '@/services/firestoreService'
import { getActiveBranches } from '@/services/branchService'
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from '@/utils/documentTypes'
import { getBuiltinPaymentMethodsForMode, getVisiblePaymentMethods } from '@/utils/paymentMethods'
import { BUILTIN_ORDER_SOURCES } from '@/utils/orderSources'
import { diasPorDefectoDelNegocio } from '@/utils/vetReminders'

// Las tres claves de `restaurantConfig` que administra la pestaña Impresión.
// Esta pestaña no las lee ni las escribe: se filtran al cargar el estado y,
// por lo tanto, nunca llegan al payload.
const CLAVES_DE_IMPRESION = ['autoPrintKitchenComanda', 'autoPrintByStation', 'combineStationsOnWebPrint']

const sinImpresion = (restaurantConfig) => Object.fromEntries(
  Object.entries(restaurantConfig || {}).filter(([clave]) => !CLAVES_DE_IMPRESION.includes(clave))
)

// Etiqueta corta para los botones "por defecto" (DOCUMENT_TYPE_LABELS trae la
// larga, que es la del selector del POS).
const ETIQUETA_CORTA = { boleta: 'Boleta', factura: 'Factura', nota_venta: 'Nota de Venta' }

// Los mismos valores de arranque que tenía Settings.jsx. Se fusionan con lo
// que traiga el documento: un negocio con esquema viejo no debe perder en
// pantalla los sub-campos que se agregaron después.
const RESTAURANTE_POR_DEFECTO = {
  tablesEnabled: true,
  waitersEnabled: true,
  kitchenEnabled: true,
  deliveryEnabled: false,
  itemStatusTracking: false, // Seguimiento de estado por item (false = por orden completa)
  enableKitchenStations: false, // Modo multi-estación de cocina
  kitchenStations: [], // Configuración de estaciones de cocina
  requirePaymentBeforeKitchen: false, // Requerir pago antes de enviar a cocina
  deliveryPersons: [], // Lista de repartidores
  brands: [], // Lista de marcas (para dark kitchens / multi-marca)
  posCreatesKitchenOrder: false, // La venta directa del POS crea la orden en Cocina (patio de comidas / dark kitchen)
  // Recargo al Consumo (Decreto Ley N° 25988)
  recargoConsumoEnabled: false,
  recargoConsumoRate: 10, // Porcentaje del recargo (1-13%)
  // POR CONSUMO: el comprobante sale con una sola línea en vez del detalle
  // de platos. Adentro no cambia nada (ver comprobantePorConsumo.js).
  porConsumoEnabled: false,
  porConsumoTexto: 'POR CONSUMO',
}

const CAMPOS_POS_POR_DEFECTO = {
  showStudentField: false, // Campo "Alumno" en el POS
  showVehiclePlateField: false, // Campo "Placa de Vehículo" en el POS
  showLicenseNumberField: false, // Campo "Licencia / Resolución" en el POS
  showPropertyCardField: false, // Campo "Tarjeta de Propiedad" en el POS
  // Ficha de atención en el CLIENTE (no en el POS): último procedimiento,
  // fecha de la última atención, tratamiento y quién lo recomendó.
  showServiceCardFields: false,
  // Campos para transporte de carga (sin interruptor acá: los enciende el modo)
  showOriginAddressField: false,
  showDestinationAddressField: false,
  showTripDetailField: false,
  showServiceReferenceValueField: false,
  showEffectiveLoadValueField: false,
  showUsefulLoadValueField: false,
  showBankAccountField: false,
  showDetractionField: false,
  showGoodsServiceCodeField: false,
  // Control de lotes y vencimientos en compras
  showBatchExpiryInPurchase: false,
  hideOutOfStockInPOS: false, // Ocultar productos con stock 0 en el POS
}

// Modo estación de servicio (grifo). `fuelIds` son los productos que salen
// como botones grandes en el POS, en el orden en que se eligieron.
const GRIFO_POR_DEFECTO = { enabled: false, fuelIds: [] }

/**
 * El estado de la pestaña a partir del documento del negocio. Los defaults
 * son los mismos que aplicaba Settings.jsx al cargar (`|| false`, `=== true`,
 * `!== false`), campo por campo, para que nada cambie de valor por la mudanza.
 */
function leerConfig(bs) {
  const d = bs || {}
  return {
    // Comprobantes. Vacío en enabledDocumentTypes = todos (los negocios que
    // nunca tocaron la opción siguen igual).
    enabledDocumentTypes: d.enabledDocumentTypes || [],
    defaultDocumentType: d.defaultDocumentType || 'boleta',
    autoSendToSunat: d.autoSendToSunat || false,
    allowEditNotaVenta: d.allowEditNotaVenta || false,
    allowDeleteInvoices: d.allowDeleteInvoices || false,
    notaVentaCreditTerms: d.notaVentaCreditTerms || false,
    // Métodos de pago
    hiddenPaymentMethods: d.hiddenPaymentMethods || [],
    customPaymentMethods: d.customPaymentMethods || [],
    defaultPaymentMethod: d.defaultPaymentMethod || '', // '' = ninguno
    // Impuestos ('10' gravado, '20' exonerado, '30' inafecto)
    defaultTaxAffectation: d.defaultTaxAffectation || '10',
    allowManualTaxAffectation: d.allowManualTaxAffectation === true,
    // Stock
    allowNegativeStock: d.allowNegativeStock || false,
    confirmSaleWithoutStock: d.confirmSaleWithoutStock || false,
    showOtherBranchesStock: d.showOtherBranchesStock === true,
    enableManualStockEdit: d.enableManualStockEdit || false,
    enableProductLocation: d.enableProductLocation || false,
    // Punto de venta
    allowPriceEdit: d.allowPriceEdit || false,
    allowNameEdit: d.allowNameEdit || false,
    allowCustomProducts: d.allowCustomProducts || false,
    autoSaveCustomProducts: d.autoSaveCustomProducts === true,
    // Default true (comportamiento histórico): la búsqueda se limpia al agregar
    posClearSearchOnAdd: d.posClearSearchOnAdd !== false,
    autoResetPOS: d.autoResetPOS || false,
    showAllProductsInPOS: d.showAllProductsInPOS || false,
    showDescriptionInPOS: d.showDescriptionInPOS || false,
    showChangeReminder: d.showChangeReminder || false,
    // Caja
    requireOpenCashRegister: d.requireOpenCashRegister || false,
    cardCommissionEnabled: d.cardCommissionEnabled || false,
    cardCommissionRate: Number(d.cardCommissionRate) || 5,
    lockCashRegisterHistory: d.lockCashRegisterHistory || false,
    // Compras y cotizaciones: texto precargado en las órdenes de compra y
    // plantillas de términos para las cotizaciones
    purchaseOrderDefaultNotes: d.purchaseOrderDefaultNotes || '',
    termsTemplates: Array.isArray(d.termsTemplates) ? d.termsTemplates : [],
    // Veterinaria: días que se recuerda una venta cuando el producto no dice otra cosa
    vetReminderDefaultDays: diasPorDefectoDelNegocio(d),
    // Restaurante: fuentes de pedido y costo de envío sugerido. El costo se
    // guarda como texto mientras se escribe y se redondea al guardar.
    hiddenOrderSources: d.hiddenOrderSources || [],
    customOrderSources: d.customOrderSources || [],
    defaultDeliveryFee: Number(d.defaultDeliveryFee) || '',
    // Los tres objetos de los que esta pestaña es dueña
    restaurantConfig: sinImpresion({ ...RESTAURANTE_POR_DEFECTO, ...(d.restaurantConfig || {}) }),
    posCustomFields: { ...CAMPOS_POS_POR_DEFECTO, ...(d.posCustomFields || {}) },
    serviceStationConfig: { ...GRIFO_POR_DEFECTO, ...(d.serviceStationConfig || {}) },
  }
}

/** Botón de un grupo de opciones excluyentes (comprobante / método por defecto). */
function BotonOpcion({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 border-2 rounded-lg text-sm font-medium transition-colors ${
        activo
          ? 'border-primary-500 bg-primary-50 text-primary-700'
          : 'border-gray-200 text-gray-700 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Una casilla de una grilla (comprobantes, métodos de pago, fuentes). Neutra:
 * el color va solo en el check. `fija` = no se puede desmarcar.
 */
function Casilla({ marcada, fija = false, onChange, etiqueta, title }) {
  return (
    <label
      title={title}
      className={`flex items-center gap-2 p-2 rounded-md border border-gray-200 text-sm transition-colors ${
        fija ? 'cursor-default bg-gray-50 text-gray-500' : 'cursor-pointer hover:bg-gray-50 text-gray-700'
      }`}
    >
      <input
        type="checkbox"
        checked={marcada}
        disabled={fija}
        onChange={onChange}
        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      <span className="truncate">{etiqueta}</span>
    </label>
  )
}

/**
 * Un elemento propio del negocio en la misma grilla que los de fábrica (un
 * método de pago o una fuente de pedido que el usuario creó). No lleva
 * casilla porque quitarlo ES desactivarlo.
 */
function Propio({ nombre, etiqueta, title, onQuitar }) {
  return (
    <div title={title} className="flex items-center gap-2 p-2 rounded-md border border-gray-200 text-sm text-gray-700">
      <span className="truncate flex-1">{nombre}</span>
      {etiqueta && <span className="text-xs text-gray-400 shrink-0">{etiqueta}</span>}
      <button
        type="button"
        onClick={onQuitar}
        className="text-gray-400 hover:text-red-600 shrink-0"
        aria-label={`Quitar ${nombre}`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

/** La casilla punteada "Agregar ..." al final de una grilla. */
function AgregarEnGrilla({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center p-2 rounded-md border border-dashed border-gray-300 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
    >
      {children}
    </button>
  )
}

export default function PuntoDeVenta() {
  const { getBusinessId, isDemoMode, businessSettings, businessMode, branchScope } = useAppContext()
  const toast = useToast()
  const { guardar, guardando } = useGuardado()

  const esRestaurante = businessMode === 'restaurant'
  const esClinica = businessMode === 'clinic'
  // Veterinaria y clinica recuerdan sus servicios: el plazo por defecto vive aca.
  const conRecordatorios = recuerdaServicios(businessMode)
  const esFarmacia = businessMode === 'pharmacy'

  // ── Estado ──────────────────────────────────────────────────────────────────
  const [cfg, setCfg] = useState(() => leerConfig(businessSettings))

  // Re-sincronizar cuando cambie el documento (tras guardar, o si otra pestaña
  // guardó y el contexto se refrescó). En demo NO: los contextos demo arman
  // `businessSettings` como objeto literal nuevo en cada render, y sincronizar
  // con él sería un bucle de renders sin fin.
  useEffect(() => {
    if (isDemoMode) return
    setCfg(leerConfig(businessSettings))
  }, [businessSettings, isDemoMode])

  const poner = (campo, valor) => setCfg(prev => ({ ...prev, [campo]: valor }))
  const ponerRestaurante = (parcial) => setCfg(prev => ({
    ...prev,
    restaurantConfig: { ...prev.restaurantConfig, ...parcial },
  }))
  const ponerCamposPOS = (parcial) => setCfg(prev => ({
    ...prev,
    posCustomFields: { ...prev.posCustomFields, ...parcial },
  }))
  const ponerGrifo = (parcial) => setCfg(prev => ({
    ...prev,
    serviceStationConfig: { ...prev.serviceStationConfig, ...parcial },
  }))
  // Marcar/desmarcar una clave en una lista de ocultos (métodos de pago, fuentes).
  const alternarEnLista = (campo, clave) => setCfg(prev => ({
    ...prev,
    [campo]: prev[campo].includes(clave)
      ? prev[campo].filter(x => x !== clave)
      : [...prev[campo], clave],
  }))
  // Quitar un elemento propio (método de pago o fuente creados por el negocio).
  const quitarPropio = (campo, id) => setCfg(prev => ({
    ...prev,
    [campo]: prev[campo].filter(x => x.id !== id),
  }))

  const rc = cfg.restaurantConfig
  const camposPOS = cfg.posCustomFields
  const grifo = cfg.serviceStationConfig

  // ── Datos auxiliares (solo cuando la sección los necesita) ──────────────────
  // Categorías de productos (para asignar a estaciones de cocina) y sucursales
  // (para la sede de cada estación). Solo en restaurante y nunca en demo.
  const [categoriasDeProductos, setCategoriasDeProductos] = useState([])
  const [sucursales, setSucursales] = useState([])
  useEffect(() => {
    if (!esRestaurante || isDemoMode) return
    const businessId = getBusinessId()
    getProductCategories(businessId)
      .then(r => { if (r?.success) setCategoriasDeProductos(r.data || []) })
      .catch(() => {})
    getActiveBranches(businessId)
      .then(r => { if (r?.success) setSucursales(r.data || []) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esRestaurante])

  // Picker de combustibles: el catálogo se trae recién cuando la sección se
  // abre, porque Configuración no lo necesita para nada más.
  const [productosCombustible, setProductosCombustible] = useState(null) // null = sin cargar
  const [busquedaCombustible, setBusquedaCombustible] = useState('')
  useEffect(() => {
    if (!grifo.enabled || productosCombustible !== null || isDemoMode) return
    getProducts(getBusinessId()).then(r => {
      setProductosCombustible(r?.success ? filtrarVendibles(r.data) : [])
    }).catch(() => setProductosCombustible([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grifo.enabled])

  // ── Modales: método de pago propio y fuente de pedido propia ────────────────
  // Se crean cada varios meses: no justifican ocupar espacio permanente.
  const [modalMetodo, setModalMetodo] = useState(false)
  const [nuevoMetodoNombre, setNuevoMetodoNombre] = useState('')
  const [nuevoMetodoComportamiento, setNuevoMetodoComportamiento] = useState('transfer')
  const [modalFuente, setModalFuente] = useState(false)
  const [nuevaFuenteNombre, setNuevaFuenteNombre] = useState('')
  // Plantilla de términos (crear / editar). `plantillaEnEdicion` es null al crear.
  const [modalPlantilla, setModalPlantilla] = useState(false)
  const [plantillaEnEdicion, setPlantillaEnEdicion] = useState(null)
  const [plantillaNombre, setPlantillaNombre] = useState('')
  const [plantillaContenido, setPlantillaContenido] = useState('')

  const abrirPlantilla = (plantilla = null) => {
    setPlantillaEnEdicion(plantilla)
    setPlantillaNombre(plantilla?.name || '')
    setPlantillaContenido(plantilla?.content || '')
    setModalPlantilla(true)
  }
  const cerrarPlantilla = () => {
    setModalPlantilla(false)
    setPlantillaNombre('')
    setPlantillaContenido('')
    setPlantillaEnEdicion(null)
  }
  const guardarPlantilla = () => {
    if (!plantillaNombre.trim() || !plantillaContenido.trim()) {
      toast.error('El nombre y contenido son obligatorios')
      return
    }
    if (plantillaEnEdicion) {
      // Editar plantilla existente
      poner('termsTemplates', cfg.termsTemplates.map(t =>
        t.id === plantillaEnEdicion.id
          ? { ...t, name: plantillaNombre, content: plantillaContenido }
          : t
      ))
      toast.success('Plantilla actualizada')
    } else {
      // Crear nueva plantilla
      poner('termsTemplates', [
        ...cfg.termsTemplates,
        { id: Date.now().toString(), name: plantillaNombre, content: plantillaContenido },
      ])
      toast.success('Plantilla creada')
    }
    cerrarPlantilla()
  }
  const eliminarPlantilla = (id) => {
    if (window.confirm('¿Eliminar esta plantilla?')) {
      poner('termsTemplates', cfg.termsTemplates.filter(t => t.id !== id))
    }
  }

  const cerrarModalMetodo = () => {
    setModalMetodo(false)
    setNuevoMetodoNombre('')
    setNuevoMetodoComportamiento('transfer')
  }
  const cerrarModalFuente = () => {
    setModalFuente(false)
    setNuevaFuenteNombre('')
  }

  const agregarMetodoPropio = () => {
    const nombre = nuevoMetodoNombre.trim()
    if (!nombre) return
    // Nombre repetido = dos métodos indistinguibles en los reportes y en el
    // cierre de caja, que guardan la etiqueta.
    const yaExiste = [
      ...getBuiltinPaymentMethodsForMode(businessMode).map(m => m.label),
      ...cfg.customPaymentMethods.map(m => m.name),
    ].some(l => l.toLowerCase() === nombre.toLowerCase())
    if (yaExiste) {
      toast.error('Ya existe un método de pago con ese nombre')
      return
    }
    setCfg(prev => ({
      ...prev,
      customPaymentMethods: [
        ...prev.customPaymentMethods,
        { id: `pm${Date.now()}`, name: nombre, behavesLike: nuevoMetodoComportamiento },
      ],
    }))
    cerrarModalMetodo()
    toast.success(`"${nombre}" agregado. No olvides guardar los cambios.`)
  }

  const agregarFuentePropia = () => {
    const nombre = nuevaFuenteNombre.trim()
    if (!nombre) {
      toast.error('Escribe el nombre de la fuente')
      return
    }
    const yaExiste = [
      ...BUILTIN_ORDER_SOURCES.map(s => s.label),
      ...cfg.customOrderSources.map(s => s.name),
    ].some(n => n.toLowerCase() === nombre.toLowerCase())
    if (yaExiste) {
      toast.error('Ya existe una fuente con ese nombre')
      return
    }
    setCfg(prev => ({
      ...prev,
      customOrderSources: [...prev.customOrderSources, { id: `os_${Date.now()}`, name: nombre }],
    }))
    cerrarModalFuente()
  }

  // ── Comprobantes ────────────────────────────────────────────────────────────
  const alternarComprobante = (tipo) => {
    // Al desmarcar el primero hay que materializar la lista completa: hasta
    // ahora estaba vacía ("todos").
    const actuales = cfg.enabledDocumentTypes.length === 0 ? [...DOCUMENT_TYPES] : cfg.enabledDocumentTypes
    const nuevos = actuales.includes(tipo)
      ? actuales.filter(t => t !== tipo)
      : [...actuales, tipo]
    if (nuevos.length === 0) return
    // Si quedaron todos, volver a "vacío = todos".
    const siguiente = { enabledDocumentTypes: nuevos.length === DOCUMENT_TYPES.length ? [] : nuevos }
    // El default no puede apuntar a uno desactivado.
    if (!nuevos.includes(cfg.defaultDocumentType) && cfg.defaultDocumentType !== 'none') {
      siguiente.defaultDocumentType = nuevos[0]
    }
    setCfg(prev => ({ ...prev, ...siguiente }))
  }
  const comprobanteDisponible = (tipo) =>
    cfg.enabledDocumentTypes.length === 0 || cfg.enabledDocumentTypes.includes(tipo)

  // ── Estaciones de cocina y marcas ───────────────────────────────────────────
  const estaciones = rc.kitchenStations || []
  const marcas = rc.brands || []

  const agregarEstacion = () => {
    const nueva = {
      id: `station_${Date.now()}`,
      name: '',
      categories: [],
      color: '#EF4444',
      order: estaciones.length + 1,
      isPase: false,
      printerIp: '',
      // Sede: hereda la del header. null = imprime en TODAS (valor de las
      // estaciones anteriores al campo).
      branchId: (branchScope && branchScope !== 'all') ? branchScope : null,
    }
    ponerRestaurante({ kitchenStations: [...estaciones, nueva] })
  }
  const actualizarEstacion = (index, cambios) => {
    const updated = [...estaciones]
    updated[index] = { ...updated[index], ...cambios }
    ponerRestaurante({ kitchenStations: updated })
  }
  const quitarEstacion = (index) => {
    ponerRestaurante({ kitchenStations: estaciones.filter((_, i) => i !== index) })
  }

  const agregarMarca = () => {
    ponerRestaurante({ brands: [...marcas, { id: `brand_${Date.now()}`, name: '', color: '#8B5CF6', active: true }] })
  }
  const actualizarMarca = (index, cambios) => {
    const updated = [...marcas]
    updated[index] = { ...updated[index], ...cambios }
    ponerRestaurante({ brands: updated })
  }
  const quitarMarca = (index) => {
    ponerRestaurante({ brands: marcas.filter((_, i) => i !== index) })
  }

  // ── Guardar ─────────────────────────────────────────────────────────────────
  const guardarTodo = async () => {
    const payload = {
      // Comprobantes
      enabledDocumentTypes: cfg.enabledDocumentTypes,
      defaultDocumentType: cfg.defaultDocumentType,
      autoSendToSunat: cfg.autoSendToSunat,
      allowEditNotaVenta: cfg.allowEditNotaVenta,
      allowDeleteInvoices: cfg.allowDeleteInvoices,
      notaVentaCreditTerms: cfg.notaVentaCreditTerms,
      // Métodos de pago
      hiddenPaymentMethods: cfg.hiddenPaymentMethods,
      customPaymentMethods: cfg.customPaymentMethods,
      defaultPaymentMethod: cfg.defaultPaymentMethod || '',
      // Impuestos
      defaultTaxAffectation: cfg.defaultTaxAffectation,
      allowManualTaxAffectation: cfg.allowManualTaxAffectation,
      // Stock
      allowNegativeStock: cfg.allowNegativeStock,
      confirmSaleWithoutStock: cfg.confirmSaleWithoutStock,
      showOtherBranchesStock: cfg.showOtherBranchesStock,
      enableManualStockEdit: cfg.enableManualStockEdit,
      enableProductLocation: cfg.enableProductLocation,
      // Punto de venta
      allowPriceEdit: cfg.allowPriceEdit,
      allowNameEdit: cfg.allowNameEdit,
      allowCustomProducts: cfg.allowCustomProducts,
      autoSaveCustomProducts: cfg.autoSaveCustomProducts,
      posClearSearchOnAdd: cfg.posClearSearchOnAdd,
      autoResetPOS: cfg.autoResetPOS,
      showAllProductsInPOS: cfg.showAllProductsInPOS,
      showDescriptionInPOS: cfg.showDescriptionInPOS,
      showChangeReminder: cfg.showChangeReminder,
      // Caja
      requireOpenCashRegister: cfg.requireOpenCashRegister,
      cardCommissionEnabled: cfg.cardCommissionEnabled,
      cardCommissionRate: Number(cfg.cardCommissionRate) || 0,
      lockCashRegisterHistory: cfg.lockCashRegisterHistory,
      // Compras y cotizaciones
      purchaseOrderDefaultNotes: cfg.purchaseOrderDefaultNotes || '',
      termsTemplates: cfg.termsTemplates,
      // Objetos de los que esta pestaña es dueña. posCustomFields va siempre:
      // "Ocultar productos sin stock" aplica a todos los modos.
      posCustomFields: cfg.posCustomFields,
      serviceStationConfig: cfg.serviceStationConfig,
    }
    // Lo que solo existe para un rubro se escribe solo en ese rubro.
    if (esRestaurante) {
      payload.restaurantConfig = sinImpresion(cfg.restaurantConfig)
      payload.hiddenOrderSources = cfg.hiddenOrderSources
      payload.customOrderSources = cfg.customOrderSources
      payload.defaultDeliveryFee = Math.max(0, Math.round((Number(cfg.defaultDeliveryFee) || 0) * 100) / 100)
    }
    if (conRecordatorios) {
      payload.vetReminderDefaultDays = Number(cfg.vetReminderDefaultDays) || 0
    }
    await guardar(payload, 'Punto de venta guardado')
  }

  return (
    <>
      <Card>
        <CardContent className="py-6 space-y-6">
          {/* ══ Comprobantes ═══════════════════════════════════════════════ */}
          <Seccion
            id="comprobantes"
            titulo="Comprobantes"
            descripcion="Qué comprobantes emite el negocio, cuál sale por defecto y qué se puede hacer con ellos después."
          >
            {/* Cuáles hay y cuál arranca, en una sola tarjeta: primero se
                eligen los disponibles y recién después el que viene marcado.
                El id es el ancla del enlace profundo del manual. */}
            <div id="opcion-enabledDocumentTypes" className="p-4 border border-gray-200 rounded-lg scroll-mt-24">
              <span className="text-sm font-medium text-gray-900 block">Comprobantes disponibles en el POS</span>
              <p className="text-xs text-gray-500 mt-1 mb-3 leading-relaxed">
                Desmarca los que tu negocio no emite y dejarán de aparecer en el Punto de Venta.
                Por ejemplo, en el RUS no se emiten facturas.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DOCUMENT_TYPES.map(tipo => {
                  // Vacío = todos habilitados, así que "marcado" es estar en
                  // la lista O que la lista esté vacía.
                  const marcado = comprobanteDisponible(tipo)
                  const esElUltimo = marcado && cfg.enabledDocumentTypes.length === 1
                  return (
                    <Casilla
                      key={tipo}
                      marcada={marcado}
                      fija={esElUltimo}
                      title={esElUltimo ? 'Debe quedar al menos un comprobante disponible' : ''}
                      onChange={() => alternarComprobante(tipo)}
                      etiqueta={DOCUMENT_TYPE_LABELS[tipo]}
                    />
                  )
                })}
              </div>
              {cfg.enabledDocumentTypes.length > 0 && !cfg.enabledDocumentTypes.includes('factura') && (
                <div className="mt-3">
                  <Nota>La Factura no aparecerá en el Punto de Venta. Las ya emitidas no se ven afectadas.</Nota>
                </div>
              )}

              <div id="opcion-defaultDocumentType" className="border-t border-gray-100 pt-3 mt-4 scroll-mt-24">
                <span className="text-sm font-medium text-gray-900 block">Comprobante por defecto en el POS</span>
                <p className="text-xs text-gray-500 mt-1 mb-3 leading-relaxed">
                  Cuál aparece seleccionado al abrir el Punto de Venta. Elige Ninguno para que el
                  cajero deba escogerlo en cada venta (evita emitir el tipo equivocado por descuido).
                </p>
                <div className="flex flex-wrap gap-2">
                  <BotonOpcion
                    activo={cfg.defaultDocumentType === 'none'}
                    onClick={() => poner('defaultDocumentType', 'none')}
                  >
                    Ninguno
                  </BotonOpcion>
                  {DOCUMENT_TYPES.filter(comprobanteDisponible).map(tipo => (
                    <BotonOpcion
                      key={tipo}
                      activo={cfg.defaultDocumentType === tipo}
                      onClick={() => poner('defaultDocumentType', tipo)}
                    >
                      {ETIQUETA_CORTA[tipo]}
                    </BotonOpcion>
                  ))}
                </div>
              </div>
            </div>

            <Ajuste
              id="opcion-autoSendToSunat"
              checked={cfg.autoSendToSunat}
              onChange={e => poner('autoSendToSunat', e.target.checked)}
              titulo="Envío automático a SUNAT desde el POS"
              descripcion="Cuando está activado, los comprobantes se envían automáticamente a SUNAT al completar una venta en el punto de venta. Si está desactivado, deberás enviarlos manualmente desde la lista de comprobantes."
            />

            <Ajuste
              id="opcion-allowEditNotaVenta"
              checked={cfg.allowEditNotaVenta}
              onChange={e => poner('allowEditNotaVenta', e.target.checked)}
              titulo="Permitir editar notas de venta"
              descripcion={cfg.allowEditNotaVenta
                ? 'Habilitado: aparece la opción "Editar documento" en las notas de venta. Al cambiar cantidades el inventario se ajusta solo por la diferencia y queda un movimiento de ajuste como rastro. No se pueden editar las ya convertidas ni las anuladas.'
                : 'Deshabilitado: las notas de venta no se pueden editar. Para corregir una, anúlala y emite otra.'}
            />

            <Ajuste
              id="opcion-allowDeleteInvoices"
              checked={cfg.allowDeleteInvoices}
              onChange={e => poner('allowDeleteInvoices', e.target.checked)}
              titulo="Permitir eliminar comprobantes"
              descripcion={cfg.allowDeleteInvoices
                ? 'Habilitado: se mostrará el botón "Eliminar" para notas de venta y comprobantes no enviados a SUNAT. Útil para corregir errores de captura, pero menos seguro desde el punto de vista contable.'
                : 'Deshabilitado: solo se podrán ANULAR las notas de venta (se mantiene el registro y se devuelve el stock). Las facturas y boletas aceptadas por SUNAT solo se pueden anular mediante Nota de Crédito. Recomendado para mayor control y seguridad contable.'}
            />

            <Ajuste
              id="opcion-notaVentaCreditTerms"
              checked={cfg.notaVentaCreditTerms}
              onChange={e => poner('notaVentaCreditTerms', e.target.checked)}
              titulo="Vencimiento y cuotas en notas de venta al crédito"
              descripcion={cfg.notaVentaCreditTerms
                ? 'Habilitado: al marcar "Pago parcial o al crédito" en una nota de venta podrás fijar una fecha de vencimiento y dividir el saldo en cuotas, igual que en las facturas. Se imprimen en el PDF y el ticket, y aparecen en el reporte de Pagos Pendientes.'
                : 'Deshabilitado: las notas de venta al crédito solo registran el saldo pendiente, sin fecha de compromiso ni cuotas.'}
            />
          </Seccion>

          <Separador />

          {/* ══ Métodos de pago ════════════════════════════════════════════ */}
          <Seccion
            id="metodos-de-pago"
            titulo="Métodos de pago"
            descripcion="Con qué se cobra en el Punto de Venta y cuál viene marcado al abrirlo."
          >
            {/* Cuáles están disponibles, los propios y cuál viene por defecto,
                todo en una tarjeta, igual que los comprobantes. */}
            <div id="opcion-hiddenPaymentMethods" className="p-4 border border-gray-200 rounded-lg scroll-mt-24">
              <span className="text-sm font-medium text-gray-900 block">Métodos de pago disponibles</span>
              <p className="text-xs text-gray-500 mt-1 mb-3 leading-relaxed">
                Desmarca los que no uses para que no aparezcan en el Punto de Venta. Efectivo no se
                puede quitar. Con Agregar método creas uno propio —un vale, un convenio— con su propio
                nombre. Esto no afecta a las ventas ya registradas.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {getBuiltinPaymentMethodsForMode(businessMode).map(m => (
                  <Casilla
                    key={m.permKey}
                    marcada={m.fixed || !cfg.hiddenPaymentMethods.includes(m.permKey)}
                    fija={m.fixed}
                    onChange={() => alternarEnLista('hiddenPaymentMethods', m.permKey)}
                    etiqueta={m.label}
                  />
                ))}
                {/* Los propios van en la MISMA grilla que los de fábrica: son
                    métodos de pago igual. Se quitan con la x. */}
                {cfg.customPaymentMethods.map(m => (
                  <Propio
                    key={m.id}
                    nombre={m.name}
                    etiqueta={m.behavesLike === 'cash' ? 'cajón' : ''}
                    title={m.behavesLike === 'cash'
                      ? 'Efectivo físico: entra al cajón y suma al arqueo'
                      : 'No entra al cajón (se cuadra aparte)'}
                    onQuitar={() => quitarPropio('customPaymentMethods', m.id)}
                  />
                ))}
                <AgregarEnGrilla onClick={() => setModalMetodo(true)}>Agregar método</AgregarEnGrilla>
              </div>

              {/* Por defecto: al final, cuando ya se sabe cuáles están
                  disponibles (incluidos los propios). El id es el ancla de
                  la guía del POS. */}
              <div id="opcion-defaultPaymentMethod" className="border-t border-gray-100 pt-3 mt-4 scroll-mt-24">
                <span className="text-sm font-medium text-gray-900 block">Método de pago por defecto en el POS</span>
                <p className="text-xs text-gray-500 mt-1 mb-3 leading-relaxed">
                  Aparecerá seleccionado al abrir el Punto de Venta. El cajero puede cambiarlo en cualquier momento.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: '', label: 'Ninguno' },
                    ...getVisiblePaymentMethods(
                      { hiddenPaymentMethods: cfg.hiddenPaymentMethods, customPaymentMethods: cfg.customPaymentMethods },
                      businessMode
                    ).map(m => ({ key: m.key, label: m.label })),
                  ].map(opt => (
                    <BotonOpcion
                      key={opt.key || 'none'}
                      activo={cfg.defaultPaymentMethod === opt.key}
                      onClick={() => poner('defaultPaymentMethod', opt.key)}
                    >
                      {opt.label}
                    </BotonOpcion>
                  ))}
                </div>
              </div>
            </div>
          </Seccion>

          <Separador />

          {/* ══ Impuestos ══════════════════════════════════════════════════ */}
          <Seccion
            id="impuestos"
            titulo="Impuestos"
            descripcion="Con qué afectación de IGV nacen los productos y si el cajero puede cambiarla en cada venta."
          >
            <Campo
              id="opcion-defaultTaxAffectation"
              etiqueta="Afectación IGV por defecto"
              ayuda="Afectación con la que nacen los productos nuevos (creación, importación, compras) y los productos personalizados del punto de venta. Útil si vendes mayormente exonerado (ej. zona de selva) y solo gravas algunos productos. Cada producto se puede cambiar individualmente después."
            >
              <div className="max-w-xs">
                <Select
                  value={cfg.defaultTaxAffectation}
                  onChange={e => poner('defaultTaxAffectation', e.target.value)}
                  className="text-sm"
                >
                  <option value="10">Gravado (IGV)</option>
                  <option value="20">Exonerado</option>
                  <option value="30">Inafecto</option>
                </Select>
              </div>
            </Campo>
            {cfg.defaultTaxAffectation !== '10' && (
              <Nota>
                Los productos ya creados no cambian: usa la acción masiva "Afectación IGV" en
                Productos para convertirlos.
              </Nota>
            )}

            {/* Va junto a la afectación por defecto porque resuelve el caso
                que esa NO cubre: no que unos productos sean gravados y otros
                exonerados, sino que el MISMO producto cambie según a quién se
                le venda. */}
            <Ajuste
              id="opcion-allowManualTaxAffectation"
              checked={cfg.allowManualTaxAffectation}
              onChange={e => poner('allowManualTaxAffectation', e.target.checked)}
              titulo="Elegir el IGV en cada venta"
              descripcion={cfg.allowManualTaxAffectation
                ? 'Habilitado: en el punto de venta aparece un selector para emitir esa venta como gravada o exonerada. La elección manda sobre lo que diga cada producto: si eliges Gravado, va gravado todo el comprobante aunque haya productos marcados exonerados. El total no cambia — solo cambia cómo se declara a SUNAT. No aplica al Nuevo RUS, que por su régimen no cobra IGV.'
                : 'Agrega un selector en el punto de venta para decidir, venta por venta, si el comprobante sale gravado o exonerado, sin importar cómo esté configurado cada producto. Pensado para negocios de la Amazonía (Ley 27037): están exonerados por lo que se consume en la región, pero cuando venden fuera la operación sí lleva IGV.'}
            />
          </Seccion>

          <Separador />

          {/* ══ Stock ══════════════════════════════════════════════════════ */}
          <Seccion
            id="stock"
            titulo="Stock"
            descripcion="Qué pasa cuando un producto no tiene stock y cómo se administra el inventario desde el catálogo."
          >
            <Ajuste
              id="opcion-allowNegativeStock"
              checked={cfg.allowNegativeStock}
              onChange={e => poner('allowNegativeStock', e.target.checked)}
              titulo="Permitir vender productos sin stock"
              descripcion={cfg.allowNegativeStock
                ? 'Habilitado: los productos se pueden vender incluso si el stock está en 0 o negativo. El stock puede quedar en números negativos. Útil para negocios bajo pedido o dropshipping.'
                : 'Deshabilitado: los productos con stock en 0 aparecerán deshabilitados en el punto de venta y no se podrán agregar al carrito. Recomendado para control estricto de inventario.'}
            />

            {/* Punto medio entre bloquear y dejar pasar: se puede vender sin
                stock, pero el sistema PREGUNTA antes de agregarlo. Nace de un
                caso real: escanea productos pequeños en serie y el aviso rojo
                pasaba desapercibido, así que terminaba cobrando sin ese item. */}
            <Ajuste
              id="opcion-confirmSaleWithoutStock"
              checked={cfg.confirmSaleWithoutStock}
              onChange={e => poner('confirmSaleWithoutStock', e.target.checked)}
              titulo="Preguntar antes de vender un producto sin stock"
              descripcion={cfg.confirmSaleWithoutStock
                ? 'Habilitado: al escanear o tocar un producto sin stock, el punto de venta muestra un aviso que debes confirmar para agregarlo. Ideal si escaneas rápido y no quieres que se te pase por alto.'
                : 'Deshabilitado: los productos sin stock muestran solo un aviso pasajero y no se agregan (salvo que actives la opción de arriba).'}
            />

            {/* Consulta pura: el cajero ve dónde más hay, pero la venta sigue
                saliendo del almacén seleccionado. */}
            <Ajuste
              id="opcion-showOtherBranchesStock"
              checked={cfg.showOtherBranchesStock}
              onChange={e => poner('showOtherBranchesStock', e.target.checked)}
              titulo="Ver el stock de otras sucursales en el punto de venta"
              descripcion={cfg.showOtherBranchesStock
                ? 'Habilitado: al tocar el stock de un producto en el POS se abre el detalle de cuánto hay en cada sucursal. Sirve para responderle al cliente "acá no me queda, pero en la otra tienda sí". Es solo consulta: la venta sigue descontando del almacén seleccionado.'
                : 'Deshabilitado: en el POS cada usuario solo ve el stock del almacén con el que está trabajando.'}
            />

            <Ajuste
              id="opcion-hideOutOfStockInPOS"
              checked={camposPOS.hideOutOfStockInPOS}
              onChange={e => ponerCamposPOS({ hideOutOfStockInPOS: e.target.checked })}
              titulo="Ocultar productos sin stock"
              descripcion="Los productos con stock 0 no aparecen en el catálogo del Punto de Venta."
            />

            <Ajuste
              id="opcion-enableManualStockEdit"
              checked={cfg.enableManualStockEdit}
              onChange={e => poner('enableManualStockEdit', e.target.checked)}
              titulo="Permitir editar stock manualmente (productos e insumos)"
              descripcion={cfg.enableManualStockEdit
                ? 'Habilitado: al editar un producto o insumo podrás ajustar su stock por almacén (y por variante si tiene). Cada ajuste queda registrado como movimiento auditable. Los productos con control de lotes se siguen modificando desde Control de Lotes para preservar la trazabilidad.'
                : 'Deshabilitado: el stock de productos e insumos solo se modifica vía ventas, compras, transferencias y movimientos en su página específica. Recomendado para mantener historial limpio.'}
            />

            <Ajuste
              id="opcion-enableProductLocation"
              checked={cfg.enableProductLocation}
              onChange={e => poner('enableProductLocation', e.target.checked)}
              titulo="Habilitar ubicación de productos"
              descripcion={cfg.enableProductLocation
                ? 'Habilitado: podrás asignar una ubicación física a cada producto (ej: P1-3A-4R para Pasillo 1, Estante 3A, Fila 4). La ubicación se mostrará en productos, inventario y punto de venta.'
                : 'Deshabilitado: los productos no mostrarán información de ubicación física.'}
            />

            {/* Control de lotes: en farmacia viene siempre activo, no se elige. */}
            {!esFarmacia && (
              <Ajuste
                id="opcion-showBatchExpiryInPurchase"
                checked={camposPOS.showBatchExpiryInPurchase}
                onChange={e => ponerCamposPOS({ showBatchExpiryInPurchase: e.target.checked })}
                titulo="Control de lotes y vencimientos"
                descripcion="Habilita control de lotes, fechas de vencimiento, alertas y selección de lotes en ventas, compras e inventario."
              />
            )}
          </Seccion>

          <Separador />

          {/* ══ Punto de venta ═════════════════════════════════════════════ */}
          <Seccion
            id="punto-de-venta"
            titulo="Punto de venta"
            descripcion="Lo que el cajero puede hacer en el carrito y cómo se comporta la pantalla de venta."
          >
            <Ajuste
              id="opcion-allowPriceEdit"
              checked={cfg.allowPriceEdit}
              onChange={e => poner('allowPriceEdit', e.target.checked)}
              titulo="Permitir modificar precio de productos en el POS"
              descripcion={cfg.allowPriceEdit
                ? 'Habilitado: podrás editar el precio de venta de cualquier producto directamente desde el carrito del punto de venta. Útil para aplicar descuentos personalizados, promociones especiales o ajustar precios según el cliente.'
                : 'Deshabilitado: los productos se venderán siempre al precio registrado en el catálogo sin posibilidad de modificarlo. Recomendado para mantener precios fijos y evitar errores de digitación.'}
            />

            <Ajuste
              id="opcion-allowNameEdit"
              checked={cfg.allowNameEdit}
              onChange={e => poner('allowNameEdit', e.target.checked)}
              titulo="Permitir modificar nombre de productos en el POS"
              descripcion={cfg.allowNameEdit
                ? 'Habilitado: podrás editar el nombre de cualquier producto directamente desde el carrito del punto de venta. Útil para personalizar la descripción según el cliente o agregar detalles específicos al comprobante.'
                : 'Deshabilitado: los productos se mostrarán siempre con el nombre registrado en el catálogo sin posibilidad de modificarlo. Recomendado para mantener consistencia en los comprobantes.'}
            />

            <Ajuste
              id="opcion-allowCustomProducts"
              checked={cfg.allowCustomProducts}
              onChange={e => poner('allowCustomProducts', e.target.checked)}
              titulo="Permitir agregar productos personalizados en el POS"
              descripcion={cfg.allowCustomProducts
                ? 'Habilitado: aparecerá un botón "Producto Personalizado" en el punto de venta que permite agregar productos con nombre y precio personalizado sin necesidad de crearlos previamente. Ideal para servicios variables, trabajos por encargo o productos únicos.'
                : 'Deshabilitado: solo se pueden vender productos previamente creados en el catálogo. Recomendado para negocios con inventario fijo y control estricto de productos.'}
            />

            {/* Lo que crea es un producto, aunque se dispare desde el POS. */}
            <Ajuste
              id="opcion-autoSaveCustomProducts"
              checked={cfg.autoSaveCustomProducts}
              onChange={e => poner('autoSaveCustomProducts', e.target.checked)}
              titulo="Guardar los productos personalizados en el catálogo"
              descripcion={cfg.autoSaveCustomProducts
                ? 'Habilitado: cuando en el Punto de Venta agregas un producto escrito a mano, queda guardado en tu catálogo para la próxima vez, con su precio y su costo. Nace sin control de stock (suele ser un servicio) y no se guarda dos veces el mismo nombre. La venta en curso no cambia.'
                : 'Deshabilitado: los productos escritos a mano valen solo para esa venta y hay que volver a escribirlos la próxima vez.'}
            />

            <Ajuste
              id="opcion-posClearSearchOnAdd"
              checked={cfg.posClearSearchOnAdd}
              onChange={e => poner('posClearSearchOnAdd', e.target.checked)}
              titulo="Reiniciar búsqueda al agregar un producto al carrito"
              descripcion={cfg.posClearSearchOnAdd
                ? 'Habilitado: cuando agregues un producto al carrito, el campo de búsqueda se limpia automáticamente. Recomendado para flujos con pistola lectora o cuando agregas productos diferentes uno por uno.'
                : 'Deshabilitado: el término de búsqueda se mantiene después de agregar un producto. Útil cuando agregas varias unidades del mismo producto o varios productos similares (ej. "coca cola", "coca cola light").'}
            />

            <Ajuste
              id="opcion-autoResetPOS"
              checked={cfg.autoResetPOS}
              onChange={e => poner('autoResetPOS', e.target.checked)}
              titulo="Reiniciar el POS automáticamente después de imprimir o descargar"
              descripcion={cfg.autoResetPOS
                ? 'Habilitado: al imprimir ticket, descargar PDF, ver vista previa o enviar por WhatsApp, el POS se reiniciará automáticamente para una nueva venta.'
                : 'Deshabilitado: después de emitir una venta, deberás presionar "Nueva Venta" manualmente para continuar.'}
            />

            {/* No contradice a "Ocultar productos sin stock": esto es la
                paginación del catálogo del POS, no qué productos entran. */}
            <Ajuste
              id="opcion-showAllProductsInPOS"
              checked={cfg.showAllProductsInPOS}
              onChange={e => poner('showAllProductsInPOS', e.target.checked)}
              titulo="Cargar todo el catálogo de una vez (sin botón Ver más)"
              descripcion={cfg.showAllProductsInPOS
                ? 'Habilitado: el catálogo del POS muestra todos los productos de una vez, sin botón "Ver más". Recomendado para catálogos de hasta 300 productos; con muchos más, la pantalla puede sentirse lenta.'
                : 'Deshabilitado: el POS muestra los productos por partes y carga el resto con el botón "Ver más".'}
            />

            <Ajuste
              id="opcion-showDescriptionInPOS"
              checked={cfg.showDescriptionInPOS}
              onChange={e => poner('showDescriptionInPOS', e.target.checked)}
              titulo="Mostrar la descripción del producto en el POS"
              descripcion={cfg.showDescriptionInPOS
                ? 'Habilitado: se mostrará la descripción completa del producto en la tarjeta del punto de venta.'
                : 'Deshabilitado: solo se muestra el nombre, precio y stock en la tarjeta del POS.'}
            />

            <Ajuste
              id="opcion-showChangeReminder"
              checked={cfg.showChangeReminder}
              onChange={e => poner('showChangeReminder', e.target.checked)}
              titulo="Recordatorio de vuelto en efectivo"
              descripcion={cfg.showChangeReminder
                ? 'Habilitado: cuando una venta se pague en efectivo y haya vuelto, aparecerá un aviso indicando cuánto entregar al cliente (con qué pagó, total y vuelto).'
                : 'Deshabilitado: no se mostrará ningún aviso de vuelto al completar la venta.'}
            />

            {/* El programa de fidelización se administra COMPLETO desde
                Clientes. Acá queda solo el puntero (y su ancla) para quien lo
                venga a buscar donde estaba antes. */}
            <div id="opcion-loyaltyEnabled" className="scroll-mt-24">
              <Nota titulo="Programa de fidelización (tarjeta de sellos)">
                Se configura desde Clientes → Fidelización: ahí activas el programa, eliges el
                diseño de la tarjeta de Google Wallet y ves las tarjetas de tus clientes.
              </Nota>
            </div>
          </Seccion>

          <Separador />

          {/* ══ Caja ═══════════════════════════════════════════════════════ */}
          <Seccion
            id="caja"
            titulo="Caja"
            descripcion="La caja diaria y lo que se cobra de más al pagar con tarjeta."
          >
            <Ajuste
              id="opcion-requireOpenCashRegister"
              checked={cfg.requireOpenCashRegister}
              onChange={e => poner('requireOpenCashRegister', e.target.checked)}
              titulo="Requerir caja diaria abierta para vender"
              descripcion={cfg.requireOpenCashRegister
                ? 'Habilitado: no se podrán emitir ventas en el POS si la caja diaria no está aperturada. El usuario deberá abrir caja antes de realizar ventas.'
                : 'Deshabilitado: se pueden emitir ventas sin necesidad de tener la caja diaria abierta.'}
            />

            {/* Comisión por pago con tarjeta: activación + porcentaje. El
                porcentaje va DENTRO del Ajuste (que es un <label>): el
                preventDefault evita que hacer clic en él marque/desmarque la
                casilla, igual que hace el Regulador del kit. */}
            <Ajuste
              id="opcion-cardCommissionEnabled"
              checked={cfg.cardCommissionEnabled}
              onChange={e => poner('cardCommissionEnabled', e.target.checked)}
              titulo="Cobrar comisión por pago con tarjeta"
              descripcion={cfg.cardCommissionEnabled
                ? `Habilitado: cuando el pago sea 100% con tarjeta, se sube el precio ${cfg.cardCommissionRate || 0}% (queda incluido en boletas, facturas y notas de venta). El cliente paga el total con el recargo ya incluido, sin una línea aparte.`
                : 'Deshabilitado: no se agrega recargo por pagos con tarjeta.'}
            >
              {cfg.cardCommissionEnabled && (
                <div className="mt-3 flex flex-wrap items-center gap-3" onClick={e => e.preventDefault()}>
                  <span className="text-sm text-gray-700">Porcentaje</span>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="0"
                      max="20"
                      step="0.1"
                      value={cfg.cardCommissionRate}
                      onChange={e => {
                        const value = Math.min(20, Math.max(0, parseFloat(e.target.value) || 0))
                        poner('cardCommissionRate', value)
                      }}
                      className="text-center"
                    />
                  </div>
                  <span className="text-sm text-gray-600">%</span>
                  <span className="text-xs text-gray-500">se suma al total al pagar con tarjeta</span>
                </div>
              )}
            </Ajuste>

            <Ajuste
              id="opcion-lockCashRegisterHistory"
              checked={cfg.lockCashRegisterHistory}
              onChange={e => poner('lockCashRegisterHistory', e.target.checked)}
              titulo="Bloquear edición del cuadre de caja"
              descripcion={cfg.lockCashRegisterHistory
                ? 'Habilitado: en el historial de caja diario NO se puede editar el monto inicial, el efectivo contado ni los movimientos de una sesión cerrada. Protege la integridad del cierre.'
                : 'Deshabilitado: se puede editar el cuadre de una sesión cerrada desde el historial de caja.'}
            />
          </Seccion>

          <Separador />

          {/* ══ Compras y cotizaciones ═════════════════════════════════════ */}
          <Seccion
            id="compras-y-cotizaciones"
            titulo="Compras y cotizaciones"
            descripcion="Textos que se repiten en cada orden de compra y en cada cotización, escritos una sola vez."
          >
            {/* Observaciones fijas de las órdenes de compra. Mismo problema que
                resolvían los términos: un texto que se repite en cada documento
                y que había que copiar a mano de una orden a otra. */}
            <Campo
              id="opcion-purchaseOrderDefaultNotes"
              etiqueta="Observaciones por defecto en órdenes de compra"
              ayuda="Texto que aparece ya escrito al crear una orden de compra nueva: tus requisitos al proveedor, horarios de atención, condiciones. Lo escribes una vez acá y en cada orden puedes editarlo o borrarlo. Déjalo vacío si no lo necesitas. El lugar de entrega ya no va acá: se elige en la orden desde tus almacenes."
            >
              <textarea
                value={cfg.purchaseOrderDefaultNotes}
                onChange={e => poner('purchaseOrderDefaultNotes', e.target.value.slice(0, 1000))}
                rows={5}
                maxLength={1000}
                placeholder={'Ej: TODO PRODUCTO DEBE CUMPLIR CON:\n*FECHA MÍNIMA DE VENCIMIENTO MAYOR A 18 MESES.\n*ADJUNTAR PROTOCOLO Y REGISTRO SANITARIO VIGENTE.\n*HORARIO DE ATENCIÓN: LUNES A VIERNES DE 8:30 A 17:00'}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="text-xs text-gray-400 text-right mt-1">{cfg.purchaseOrderDefaultNotes.length}/1000</p>
            </Campo>

            {/* Plantillas de términos y condiciones para las cotizaciones. */}
            <div id="opcion-termsTemplates" className="p-4 border border-gray-200 rounded-lg scroll-mt-24">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="text-sm font-medium text-gray-900 block">Plantillas de términos</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Términos y condiciones listos para elegir en cada cotización. Ideal para
                    distintos tipos de servicio (transporte, montacargas, grúas, etc.).
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => abrirPlantilla(null)}>
                  Nueva plantilla
                </Button>
              </div>

              {cfg.termsTemplates.length === 0 ? (
                <div className="text-center py-6 rounded-lg border border-dashed border-gray-300">
                  <p className="text-sm text-gray-500">No hay plantillas creadas.</p>
                  <button
                    type="button"
                    onClick={() => abrirPlantilla(null)}
                    className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    Crear primera plantilla
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {cfg.termsTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between gap-4 p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{template.name}</p>
                        <p className="text-xs text-gray-500 truncate">{template.content.substring(0, 80)}...</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={() => abrirPlantilla(template)}
                          className="text-sm text-gray-600 hover:text-gray-900"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarPlantilla(template.id)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Seccion>

          {/* ══ Campos del cliente ═════════════════════════════════════════ */}
          {/* No aplica a restaurante (alumno / vehículo / suscripciones). */}
          {!esRestaurante && (
            <>
              <Separador />
              <Seccion
                id="campos-del-cliente"
                titulo="Campos del cliente"
                descripcion="Campos adicionales para capturar información del cliente en el POS y en los comprobantes."
              >
                <Ajuste
                  id="opcion-showStudentField"
                  checked={camposPOS.showStudentField}
                  onChange={e => ponerCamposPOS({ showStudentField: e.target.checked })}
                  titulo={'Campo "Alumno"'}
                  descripcion="Muestra un campo para ingresar el nombre del alumno en el POS y comprobantes."
                />
                <Ajuste
                  id="opcion-showVehiclePlateField"
                  checked={camposPOS.showVehiclePlateField}
                  onChange={e => ponerCamposPOS({ showVehiclePlateField: e.target.checked })}
                  titulo={'Campo "Placa de Vehículo"'}
                  descripcion="Muestra un campo para ingresar la placa del vehículo en el POS y comprobantes."
                />
                <Ajuste
                  id="opcion-showVehicleModelField"
                  checked={camposPOS.showVehicleModelField}
                  onChange={e => ponerCamposPOS({ showVehicleModelField: e.target.checked })}
                  titulo={'Campo "Modelo de Vehículo"'}
                  descripcion="Muestra un campo para ingresar el modelo del vehículo en el POS y comprobantes."
                />
                <Ajuste
                  id="opcion-showVehicleYearField"
                  checked={camposPOS.showVehicleYearField}
                  onChange={e => ponerCamposPOS({ showVehicleYearField: e.target.checked })}
                  titulo={'Campo "Año de Vehículo"'}
                  descripcion="Muestra un campo para ingresar el año del vehículo en el POS y comprobantes."
                />
                <Ajuste
                  id="opcion-showLicenseNumberField"
                  checked={camposPOS.showLicenseNumberField}
                  onChange={e => ponerCamposPOS({ showLicenseNumberField: e.target.checked })}
                  titulo={'Campo "Licencia / Resolución"'}
                  descripcion="Muestra un campo para el número de licencia (persona natural) o de resolución (empresa) del cliente en el POS y comprobantes."
                />
                <Ajuste
                  id="opcion-showPropertyCardField"
                  checked={camposPOS.showPropertyCardField}
                  onChange={e => ponerCamposPOS({ showPropertyCardField: e.target.checked })}
                  titulo={'Campo "Tarjeta de Propiedad"'}
                  descripcion="Muestra un campo para ingresar la tarjeta de propiedad del vehículo en el POS y comprobantes."
                />
                {/* En Clínica la ficha viene de fábrica (ver tieneFichaDeAtencion):
                    la casilla se muestra encendida y sin interruptor. */}
                <Ajuste
                  id="opcion-showServiceCardFields"
                  checked={esClinica || camposPOS.showServiceCardFields}
                  disabled={esClinica}
                  onChange={e => ponerCamposPOS({ showServiceCardFields: e.target.checked })}
                  titulo="Ficha de atención en el cliente"
                  descripcion={esClinica
                    ? 'En modo Clínica la ficha viene siempre activa: alergias, antecedentes, quién lo recomendó y el historial de atenciones de cada paciente.'
                    : camposPOS.showServiceCardFields
                      ? 'Habilitado: la ficha del cliente suma alergias, antecedentes, quién lo recomendó y el historial de atenciones (procedimiento, tratamiento, especialista, próximo control). Para consultorios, clínicas, salones y todo el que atienda a la misma persona cada tanto.'
                      : 'Deshabilitado: la ficha del cliente muestra solo los datos básicos.'}
                />
                <Ajuste
                  id="opcion-showSubscriptionFields"
                  checked={camposPOS.showSubscriptionFields}
                  onChange={e => ponerCamposPOS({ showSubscriptionFields: e.target.checked })}
                  titulo="Gestión de suscripciones"
                  descripcion="Agrega campos de plan, precio y fecha de vencimiento en la página de Clientes para controlar suscripciones."
                />
              </Seccion>
            </>
          )}

          {/* ══ Restaurante ════════════════════════════════════════════════ */}
          {esRestaurante && (
            <>
              <Separador />
              <Seccion
                id="restaurante"
                titulo="Restaurante"
                descripcion="Cómo fluyen las órdenes entre el salón, la caja y la cocina. Lo que se imprime (comandas, impresión por estación) se configura en Impresión."
              >
                <Ajuste
                  id="opcion-itemStatusTracking"
                  checked={rc.itemStatusTracking}
                  onChange={e => ponerRestaurante({ itemStatusTracking: e.target.checked })}
                  titulo="Seguimiento de estado por item individual"
                  descripcion={rc.itemStatusTracking
                    ? 'Habilitado: cada plato/item de la orden se marca individualmente (Pendiente → Preparando → Listo → Entregado). Los platos pueden estar listos en diferentes momentos. Ideal para restaurantes con múltiples estaciones de cocina o menús extensos.'
                    : 'Deshabilitado: la orden completa se marca como un todo (Pendiente → En preparación → Lista → Entregada). Más simple y rápido para operaciones pequeñas, cafeterías o negocios con preparación rápida.'}
                />

                <Ajuste
                  id="opcion-skipWaiterForSecondary"
                  checked={rc.skipWaiterForSecondary || false}
                  onChange={e => ponerRestaurante({ skipWaiterForSecondary: e.target.checked })}
                  titulo="Omitir mozos a usuarios secundarios"
                  descripcion={rc.skipWaiterForSecondary
                    ? 'Habilitado: los usuarios secundarios ocupan la mesa directamente, sin seleccionar un mozo. Útil cuando cada usuario secundario ES el mozo. El dueño y administradores siguen seleccionando mozo normalmente.'
                    : 'Deshabilitado: todos los usuarios deben seleccionar un mozo al ocupar una mesa.'}
                />

                <Ajuste
                  id="opcion-requireReceiptForSecondary"
                  checked={rc.requireReceiptForSecondary || false}
                  onChange={e => ponerRestaurante({ requireReceiptForSecondary: e.target.checked })}
                  titulo="Usuarios secundarios siempre con comprobante"
                  descripcion={rc.requireReceiptForSecondary
                    ? 'Habilitado: los usuarios secundarios no pueden cerrar una mesa u orden sin emitir comprobante (se oculta la opción "Cerrar sin comprobante"). El dueño y administradores sí pueden.'
                    : 'Deshabilitado: los usuarios secundarios pueden cerrar mesas u órdenes sin comprobante (con motivo registrado).'}
                />

                <Ajuste
                  id="opcion-requirePaymentBeforeKitchen"
                  checked={rc.requirePaymentBeforeKitchen || false}
                  onChange={e => ponerRestaurante({ requirePaymentBeforeKitchen: e.target.checked })}
                  titulo="Requerir pago antes de enviar a cocina"
                  descripcion={rc.requirePaymentBeforeKitchen
                    ? 'Habilitado: las órdenes no se pueden enviar a cocina hasta que estén pagadas. Ideal para restaurantes de comida rápida, food courts o delivery donde el pago es por adelantado.'
                    : 'Deshabilitado: las órdenes se pueden enviar a cocina sin necesidad de pago previo. El cliente puede pagar después de recibir su pedido.'}
                />

                {/* Recargo al Consumo (Decreto Ley N° 25988) */}
                <Ajuste
                  id="opcion-recargoConsumoEnabled"
                  checked={rc.recargoConsumoEnabled || false}
                  onChange={e => ponerRestaurante({ recargoConsumoEnabled: e.target.checked })}
                  titulo="Recargo al consumo"
                  descripcion={rc.recargoConsumoEnabled
                    ? `Habilitado: se aplica ${rc.recargoConsumoRate}% adicional sobre el subtotal. Este recargo se distribuye entre los trabajadores según Decreto Ley N° 25988.`
                    : 'Deshabilitado: no se aplica recargo al consumo en las ventas.'}
                >
                  {rc.recargoConsumoEnabled && (
                    <div className="mt-3 flex flex-wrap items-center gap-3" onClick={e => e.preventDefault()}>
                      <span className="text-sm text-gray-700">Porcentaje</span>
                      <div className="w-20">
                        <Input
                          type="number"
                          min="1"
                          max="13"
                          step="1"
                          value={rc.recargoConsumoRate || 10}
                          onChange={e => {
                            const value = Math.min(13, Math.max(1, parseInt(e.target.value) || 10))
                            ponerRestaurante({ recargoConsumoRate: value })
                          }}
                          className="text-center"
                        />
                      </div>
                      <span className="text-sm text-gray-600">%</span>
                      <span className="text-xs text-gray-500">(máximo 13% por ley)</span>
                    </div>
                  )}
                </Ajuste>

                {/* POR CONSUMO: el comprobante con una sola línea */}
                <Ajuste
                  id="opcion-porConsumo"
                  checked={rc.porConsumoEnabled === true}
                  onChange={e => ponerRestaurante({ porConsumoEnabled: e.target.checked })}
                  titulo="Emitir POR CONSUMO"
                  descripcion={rc.porConsumoEnabled
                    ? `Habilitado: al cobrar aparece una casilla para emitir el comprobante con una sola línea que dice "${(rc.porConsumoTexto || '').trim() || 'POR CONSUMO'}", en vez del detalle de platos. Viene DESMARCADA: se marca solo en las ventas donde el cliente lo pide. Adentro del sistema no cambia nada — el stock, los insumos y los reportes siguen viendo cada plato.`
                    : 'Deshabilitado: el comprobante sale con el detalle de cada plato.'}
                >
                  {rc.porConsumoEnabled && (
                    <div className="mt-3" onClick={e => e.preventDefault()}>
                      <div className="max-w-xs">
                        <Input
                          label="Qué dice la línea"
                          type="text"
                          maxLength={80}
                          value={rc.porConsumoTexto ?? 'POR CONSUMO'}
                          onChange={e => ponerRestaurante({ porConsumoTexto: e.target.value.toUpperCase() })}
                          placeholder="POR CONSUMO"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Algunos negocios usan "CONSUMO DE ALIMENTOS Y BEBIDAS". Si lo dejas vacío se emite como POR CONSUMO.
                      </p>
                    </div>
                  )}
                </Ajuste>

                {/* Venta directa del POS -> orden (patio de comidas, dark kitchen) */}
                <Ajuste
                  id="opcion-posCreatesKitchenOrder"
                  checked={rc.posCreatesKitchenOrder === true}
                  onChange={e => ponerRestaurante({ posCreatesKitchenOrder: e.target.checked })}
                  titulo="La venta del POS genera la orden en Cocina"
                  descripcion={rc.posCreatesKitchenOrder === true
                    ? 'Habilitado: al cobrar una venta directa en el POS se crea la orden en Cocina (ya pagada) y se imprime la comanda junto con el comprobante. Ideal para patio de comidas o mostrador: un solo paso. Las ventas que vienen de una mesa o de una orden existente no se duplican.'
                    : 'Deshabilitado: la venta directa del POS no pasa por Cocina. Los pedidos a cocina se toman desde Mesas u Órdenes.'}
                />

                {/* Modo multi-estación de cocina */}
                <Ajuste
                  id="opcion-enableKitchenStations"
                  checked={rc.enableKitchenStations || false}
                  onChange={e => ponerRestaurante({ enableKitchenStations: e.target.checked })}
                  titulo="Modo multi-estación de cocina"
                  descripcion={rc.enableKitchenStations
                    ? 'Habilitado: los pedidos se dividen automáticamente por estaciones (Cocina caliente, Cocina fría, Bebidas, etc.). Cada estación ve solo los items que le corresponden.'
                    : 'Deshabilitado: todos los items del pedido se muestran juntos en una sola vista de cocina.'}
                />

                {/* El editor de estaciones va FUERA del Ajuste (que es un
                    <label>): tiene casillas, selectores y un color, y adentro
                    de un label sus clics se confundirían con el interruptor. */}
                {rc.enableKitchenStations && (
                  <div id="opcion-kitchenStations" className="p-4 border border-gray-200 rounded-lg scroll-mt-24">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900 block">Estaciones de cocina</span>
                        <p className="text-xs text-gray-500 mt-0.5">Define las estaciones y asigna categorías de productos a cada una.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={agregarEstacion}>
                        Agregar estación
                      </Button>
                    </div>

                    <div className="mb-4">
                      <Nota>
                        Aquí van las impresoras de Cocina y Bar (comandas), cada una con su IP. La
                        Impresora de Caja (comprobantes y precuentas), la principal y la impresión
                        automática por estación se configuran en Configuración → Impresión.
                      </Nota>
                    </div>

                    {estaciones.length === 0 ? (
                      <div className="text-center py-6 text-sm text-gray-500">
                        <p>No hay estaciones configuradas.</p>
                        <p className="text-xs">Agrega estaciones como "Cocina Caliente", "Bebidas", etc.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {estaciones.map((station, index) => (
                          <div key={station.id} className="p-4 rounded-lg border border-gray-200">
                            <div className="flex items-start gap-3">
                              <input
                                type="color"
                                value={station.color || '#EF4444'}
                                onChange={e => actualizarEstacion(index, { color: e.target.value })}
                                className="w-8 h-8 rounded cursor-pointer border-0 shrink-0"
                                title="Color de la estación"
                              />

                              <div className="flex-1 min-w-0 space-y-3">
                                <Input
                                  type="text"
                                  value={station.name}
                                  onChange={e => actualizarEstacion(index, { name: e.target.value })}
                                  placeholder="Nombre de la estación (ej: Cocina Caliente)"
                                />

                                <div>
                                  <span className="block text-xs font-medium text-gray-700 mb-1">Categorías asignadas</span>
                                  {categoriasDeProductos.length === 0 ? (
                                    <p className="text-xs text-gray-500">
                                      No hay categorías de productos. Crea categorías en la sección de Productos.
                                    </p>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {categoriasDeProductos.map((category) => {
                                        // Soportar tanto strings como objetos {id, name, parentId}
                                        const categoryId = typeof category === 'string' ? category : category.id
                                        const categoryName = typeof category === 'string' ? category : category.name
                                        // Verificar si está seleccionada por nombre O por ID (para compatibilidad)
                                        const isSelected = (station.categories || []).some(c =>
                                          c === categoryName || c === categoryId
                                        )
                                        return (
                                          <button
                                            key={categoryId}
                                            type="button"
                                            onClick={() => {
                                              const currentCategories = station.categories || []
                                              actualizarEstacion(index, {
                                                categories: isSelected
                                                  // Filtrar tanto por nombre como por ID para compatibilidad
                                                  ? currentCategories.filter(c => c !== categoryName && c !== categoryId)
                                                  // Guardar el NOMBRE de la categoría para que coincida con item.category
                                                  : [...currentCategories, categoryName],
                                              })
                                            }}
                                            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                                              isSelected
                                                ? 'bg-primary-600 text-white'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                          >
                                            {categoryName}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={station.isPase || false}
                                    onChange={e => actualizarEstacion(index, { isPase: e.target.checked })}
                                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                  />
                                  <span className="text-xs text-gray-700">
                                    Estación de Pase/Despacho (ve todos los items para consolidar)
                                  </span>
                                </label>

                                {/* Impresora asignada a la estación */}
                                <div>
                                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                                    <input
                                      type="checkbox"
                                      checked={station.useBuiltInPrinter || false}
                                      onChange={e => actualizarEstacion(index, {
                                        useBuiltInPrinter: e.target.checked,
                                        ...(e.target.checked ? { printerIp: '' } : {}),
                                      })}
                                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                    />
                                    <span className="text-xs text-gray-700">
                                      Usar impresora integrada del dispositivo (iMin)
                                    </span>
                                  </label>
                                  {!station.useBuiltInPrinter && (
                                    <Input
                                      label="Impresora WiFi (IP)"
                                      type="text"
                                      value={station.printerIp || ''}
                                      onChange={e => actualizarEstacion(index, { printerIp: e.target.value })}
                                      placeholder="Ej: 192.168.1.100"
                                    />
                                  )}
                                  <p className="text-xs text-gray-500 mt-1">
                                    Imprime automáticamente comandas al enviar a cocina.
                                  </p>
                                </div>

                                {/* Sede de la estación (solo con sucursales configuradas) */}
                                {sucursales.length > 0 && (
                                  <div>
                                    <Select
                                      label="Sucursal"
                                      value={station.branchId || ''}
                                      onChange={e => actualizarEstacion(index, { branchId: e.target.value || null })}
                                      className="text-sm"
                                    >
                                      <option value="">Todas las sucursales</option>
                                      <option value="main">{businessSettings?.mainBranchName || 'Sucursal Principal'}</option>
                                      {sucursales.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                      ))}
                                    </Select>
                                    <p className="text-xs text-gray-500 mt-1">
                                      Solo recibirá las comandas de esta sede. Con "Todas" imprime los
                                      pedidos de cualquier local.
                                    </p>
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => quitarEstacion(index)}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors shrink-0"
                                title="Eliminar estación"
                                aria-label="Eliminar estación"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {estaciones.length > 0 && (
                      <div className="mt-4">
                        <Nota titulo="Cómo funciona">
                          Cada estación ve solo los items de las categorías asignadas. En la pantalla de
                          Cocina se puede filtrar por estación. La estación de Pase ve todos los items
                          para coordinar la entrega.
                        </Nota>
                      </div>
                    )}
                  </div>
                )}

                {/* Marcas (multi-marca / dark kitchen) */}
                <div id="opcion-brands" className="p-4 border border-gray-200 rounded-lg scroll-mt-24">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <span className="text-sm font-medium text-gray-900 block">Marcas / Dark Kitchen</span>
                      <p className="text-xs text-gray-500 mt-0.5">Gestiona múltiples marcas desde la misma cocina.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={agregarMarca}>
                      Agregar marca
                    </Button>
                  </div>

                  {marcas.length === 0 ? (
                    <div className="text-center py-4 text-sm text-gray-500">
                      <p>No hay marcas configuradas.</p>
                      <p className="text-xs">Agrega marcas si operas varias desde la misma cocina.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {marcas.map((brand, index) => (
                        <div key={brand.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200">
                          <input
                            type="color"
                            value={brand.color || '#8B5CF6'}
                            onChange={e => actualizarMarca(index, { color: e.target.value })}
                            className="w-8 h-8 rounded cursor-pointer border-0 shrink-0"
                            title="Color de la marca"
                          />
                          <div className="flex-1 min-w-0">
                            <Input
                              type="text"
                              value={brand.name}
                              onChange={e => actualizarMarca(index, { name: e.target.value })}
                              placeholder="Nombre de la marca"
                            />
                          </div>
                          <label className="flex items-center gap-1 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={brand.active !== false}
                              onChange={e => actualizarMarca(index, { active: e.target.checked })}
                              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                            />
                            <span className="text-xs text-gray-600">Activa</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => quitarMarca(index)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors shrink-0"
                            title="Eliminar marca"
                            aria-label="Eliminar marca"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fuentes de pedido: de dónde llega cada pedido. Es lo que se
                    elige al crear una orden y lo que después separa las ventas
                    por canal en los reportes. Misma grilla que los métodos de
                    pago. */}
                <div id="opcion-hiddenOrderSources" className="p-4 border border-gray-200 rounded-lg scroll-mt-24">
                  <span className="text-sm font-medium text-gray-900 block">Fuentes de pedido</span>
                  <p className="text-xs text-gray-500 mt-1 mb-3 leading-relaxed">
                    De dónde llega cada pedido: se elige al crear una orden y separa las ventas por
                    canal en los reportes. Desmarca las que no uses para que no aparezcan. Mostrador
                    no se puede quitar. Con Agregar fuente creas la tuya —Instagram, TikTok, un
                    convenio—. Esto no afecta a los pedidos ya registrados.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {BUILTIN_ORDER_SOURCES.map(s => (
                      <Casilla
                        key={s.key}
                        marcada={s.fixed || !cfg.hiddenOrderSources.includes(s.key)}
                        fija={s.fixed}
                        onChange={() => alternarEnLista('hiddenOrderSources', s.key)}
                        etiqueta={s.label}
                      />
                    ))}
                    {cfg.customOrderSources.map(s => (
                      <Propio
                        key={s.id}
                        nombre={s.name}
                        onQuitar={() => quitarPropio('customOrderSources', s.id)}
                      />
                    ))}
                    <AgregarEnGrilla onClick={() => setModalFuente(true)}>Agregar fuente</AgregarEnGrilla>
                  </div>
                </div>

                {/* Costo de envío sugerido. Antes guardaba solo al salir del
                    campo; ahora va con el botón Guardar como todo lo demás. */}
                <Campo
                  id="opcion-defaultDeliveryFee"
                  etiqueta="Costo de envío sugerido (S/)"
                  ayuda="Viene precargado al crear un pedido de delivery, para no volver a escribirlo cada vez. Se puede cambiar en cada pedido, o borrar si esa entrega no cobra envío. Déjalo en 0 si prefieres escribirlo siempre a mano. El costo del envío se cobra como una línea más del pedido."
                >
                  <div className="max-w-[180px]">
                    <Input
                      type="number"
                      min="0"
                      step="0.10"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={cfg.defaultDeliveryFee}
                      onChange={e => poner('defaultDeliveryFee', e.target.value)}
                    />
                  </div>
                </Campo>
              </Seccion>
            </>
          )}

          {/* ══ Recordatorios ══════════════════════════════════════════════ */}
          {/* Solo en los rubros que recuerdan sus servicios: veterinaria y clinica. */}
          {conRecordatorios && (
            <>
              <Separador />
              <Seccion
                id="veterinaria"
                titulo="Recordatorios"
                descripcion="Los recordatorios que nacen de cada venta a un cliente registrado."
              >
                <Campo
                  id="opcion-vetReminderDefaultDays"
                  etiqueta="Recordar cada venta a los (días)"
                  ayuda="Todo lo que cobres a un cliente registrado aparecerá en Recordatorios pasados esos días. Si un producto necesita otro plazo, ponle el suyo en su ficha (Productos y Servicios); si no debe recordarse nunca, ponle 0 ahí. Las ventas sin cliente no generan recordatorio. Con 0 acá, solo se recuerdan los productos que tengan su plazo configurado."
                >
                  <div className="w-28">
                    <Input
                      type="number"
                      min="0"
                      value={cfg.vetReminderDefaultDays}
                      onChange={e => poner('vetReminderDefaultDays', e.target.value)}
                      className="text-center"
                    />
                  </div>
                </Campo>
              </Seccion>
            </>
          )}

          <Separador />

          {/* ══ Estación de servicio ═══════════════════════════════════════ */}
          {/* No es un modo de negocio: es un atajo ENCIMA del POS normal,
              porque el grifo también tiene minimarket y necesita el catálogo
              de siempre. */}
          <Seccion
            id="estacion-de-servicio"
            titulo="Estación de servicio"
            descripcion="Para grifos: vender combustible por monto, encima del punto de venta de siempre."
          >
            <Ajuste
              id="opcion-serviceStation"
              checked={grifo.enabled}
              onChange={e => ponerGrifo({ enabled: e.target.checked })}
              titulo="Modo estación de servicio (grifo)"
              descripcion={grifo.enabled
                ? 'Habilitado: arriba del catálogo del POS aparecen los combustibles como botones grandes. Al tocar uno se abre un teclado para cobrar por monto ("50 soles") y los galones se calculan solos. El resto del POS no cambia: el minimarket, el cobro y la impresión siguen igual.'
                : 'Deshabilitado: el POS funciona normal, vendiendo por cantidad.'}
            />

            {/* Qué productos son combustible. Fuera del Ajuste: tiene casillas. */}
            {grifo.enabled && (
              <div className="p-4 border border-gray-200 rounded-lg">
                <span className="text-sm font-medium text-gray-900 block">Combustibles que vendes</span>
                <p className="text-xs text-gray-500 mt-1 mb-3 leading-relaxed">
                  Elige los productos que aparecen como botones en el POS. Salen en el orden en que
                  los marcas, y el precio del galón es el del producto: cuando lo cambies en
                  Productos, el botón cambia solo.
                </p>

                {/* Los elegidos, en orden */}
                {grifo.fuelIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {grifo.fuelIds.map((id, i) => {
                      const p = (productosCombustible || []).find(x => x.id === id)
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-primary-200 bg-primary-50 rounded-md text-sm text-primary-800"
                        >
                          <span className="text-xs font-bold text-primary-500">{i + 1}</span>
                          {p?.name || 'Producto eliminado'}
                          <button
                            type="button"
                            onClick={() => ponerGrifo({ fuelIds: grifo.fuelIds.filter(x => x !== id) })}
                            className="text-gray-400 hover:text-red-600"
                            aria-label={'Quitar ' + (p?.name || '')}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                <Input
                  placeholder="Buscar producto..."
                  value={busquedaCombustible}
                  onChange={e => setBusquedaCombustible(e.target.value)}
                  className="mb-2"
                />

                {productosCombustible === null ? (
                  <p className="text-sm text-gray-500 py-3">Cargando productos...</p>
                ) : productosCombustible.length === 0 ? (
                  <p className="text-sm text-gray-500 py-3">
                    No hay productos todavía. Crea uno por cada combustible en Productos, con unidad
                    Galón y su precio por galón.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                    {productosCombustible
                      .filter(p => matchesPrebuilt(busquedaCombustible, buildProductHaystack(p)))
                      .slice(0, 50)
                      .map(p => {
                        const marcado = grifo.fuelIds.includes(p.id)
                        return (
                          <label
                            key={p.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                          >
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => ponerGrifo({
                                fuelIds: marcado
                                  ? grifo.fuelIds.filter(x => x !== p.id)
                                  : [...grifo.fuelIds, p.id],
                              })}
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="flex-1 min-w-0 truncate text-gray-800">{p.name}</span>
                            <span className="text-xs text-gray-500 shrink-0">
                              {formatCurrency(p.price)}
                            </span>
                          </label>
                        )
                      })}
                  </div>
                )}
              </div>
            )}
          </Seccion>

          <BarraGuardar onClick={guardarTodo} guardando={guardando} />
        </CardContent>
      </Card>

      {/* Nuevo método de pago propio. */}
      <Modal
        isOpen={modalMetodo}
        onClose={cerrarModalMetodo}
        title="Nuevo método de pago"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Si cobras de una forma que no está en la lista —un vale, un convenio— agrégala acá.
            Aparece con su propio nombre en el punto de venta, el control de caja, los reportes
            y el detalle de cada venta.
          </p>

          <Input
            label="Nombre del método"
            value={nuevoMetodoNombre}
            onChange={e => setNuevoMetodoNombre(e.target.value)}
            placeholder="Ej: FISE"
            maxLength={24}
            autoFocus
          />

          <div>
            {/* behavesLike quedó SOLO para el arqueo: el desglose ya es
                independiente en caja, reportes y ventas. */}
            <Select
              label="¿Entra al cajón?"
              value={nuevoMetodoComportamiento}
              onChange={e => setNuevoMetodoComportamiento(e.target.value)}
              className="text-sm"
            >
              <option value="cash">Sí, es efectivo físico (entra al cajón)</option>
              <option value="transfer">No entra al cajón</option>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              Si es efectivo físico, esa plata entra al cajón y suma al arqueo del cierre.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={cerrarModalMetodo} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button disabled={!nuevoMetodoNombre.trim()} onClick={agregarMetodoPropio} className="w-full sm:w-auto">
              Agregar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Nueva fuente de pedido propia. */}
      <Modal
        isOpen={modalFuente}
        onClose={cerrarModalFuente}
        title="Nueva fuente de pedido"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Si recibes pedidos por un canal que no está en la lista —Instagram, TikTok, un
            convenio con una empresa— agrégalo acá. Aparecerá al crear una orden y separará
            esas ventas en los reportes.
          </p>

          <Input
            label="Nombre de la fuente"
            value={nuevaFuenteNombre}
            onChange={e => setNuevaFuenteNombre(e.target.value)}
            placeholder="Instagram"
            maxLength={30}
            autoFocus
          />

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={cerrarModalFuente} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={agregarFuentePropia} className="w-full sm:w-auto">
              Agregar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Crear o editar una plantilla de términos. */}
      <Modal
        isOpen={modalPlantilla}
        onClose={cerrarPlantilla}
        title={plantillaEnEdicion ? 'Editar plantilla' : 'Nueva plantilla de términos'}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <Input
            label="Nombre de la plantilla"
            value={plantillaNombre}
            onChange={e => setPlantillaNombre(e.target.value)}
            placeholder="Ej: Servicio de Transporte"
            autoFocus
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Términos y condiciones</label>
            <textarea
              value={plantillaContenido}
              onChange={e => setPlantillaContenido(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Escribe aquí los términos y condiciones para este tipo de servicio..."
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={cerrarPlantilla} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button type="button" onClick={guardarPlantilla} className="w-full sm:w-auto">
              {plantillaEnEdicion ? 'Guardar cambios' : 'Crear plantilla'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
