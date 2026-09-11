/**
 * Con qué RUC se emite un comprobante cuando una cuenta tiene más de uno.
 *
 * Hay negocios con un solo local y una sola gestión que venden con dos RUC
 * (la SAC emite las facturas, la persona natural en NRUS las boletas, o dos
 * empresas de la misma familia comparten la tienda). Stock, precios y clientes
 * son los mismos; lo único que cambia es quién firma el documento.
 *
 * Hasta setiembre de 2026 el sistema daba por hecho que negocio = emisor: el
 * RUC vivía en `businesses/{id}.ruc`, las credenciales en su subcolección
 * `secrets`, y todo lo que firma, imprime o cuenta leía de ahí. Este módulo es
 * la costura que faltaba.
 *
 * Vive acá porque las functions no pueden importar de `src`, pero `src` sí
 * puede importar de acá — el mismo camino que `creditoDelComprobante.js`. Lo
 * leen el servidor (para firmar y anular) y el cliente (para numerar, imprimir
 * y filtrar). Si cada uno decidiera por su cuenta, el XML y el papel dirían
 * RUC distintos.
 *
 * Las reglas:
 *  1. Un comprobante SIN `emisorId` es del principal. Es la misma regla que
 *     las sucursales: los 177.000 comprobantes anteriores a esto no llevan el
 *     campo y no se van a tocar.
 *  2. El principal ES el doc del negocio. No hay doc de emisor para él.
 *  3. Un emisor adicional se aplica ENCIMA del negocio (`empresaEfectiva`).
 *     Lo que lo identifica y lo firma sale siempre del emisor, aunque esté
 *     vacío; lo que es del local (teléfono, logo, nombre comercial) cae al
 *     negocio cuando el emisor no lo define.
 *  4. Una serie pertenece a un solo RUC en toda la cuenta. Es lo que permite
 *     deducir el RUC por la serie cuando un camino olvidó el campo, y lo que
 *     evita que dos RUC se pisen el correlativo.
 */

export const EMISOR_PRINCIPAL = 'principal'

/** Las series que tiene un emisor adicional. Las guías, cuando se pidan. */
export const TIPOS_DE_SERIE_DE_EMISOR = [
  'factura',
  'boleta',
  'nota_venta',
  'nota_credito_factura',
  'nota_credito_boleta',
  'nota_debito_factura',
  'nota_debito_boleta',
]

/**
 * Campos que salen SIEMPRE del emisor, aunque estén vacíos.
 *
 * Son los que lo identifican ante SUNAT y ante el banco. Si cayeran al negocio
 * cuando el emisor no los tiene, una factura del segundo RUC saldría firmada
 * con las credenciales del primero, o con sus cuentas bancarias para que el
 * cliente le pague a la empresa equivocada.
 */
export const SIEMPRE_DEL_EMISOR = [
  'ruc',
  'businessName',
  'emissionMethod',
  'emissionConfig',
  'sunat',
  'qpse',
  'enabledDocumentTypes',
  'bankAccountsList',
  'bankAccounts',
  'establishments',
  'mtcRegistration',
]

/** Campos administrativos del doc del emisor: no se sobreponen a nada. */
const NO_SE_SOBREPONEN = new Set([
  'id', 'activo', 'orden', 'creadoEn', 'actualizadoEn', 'creadoPor',
  'series', 'emisorSeries', 'branchSeries', 'warehouseSeries',
])

const limpio = (v) => String(v ?? '').trim()

const vacio = (v) =>
  v === undefined || v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0)

export function esPrincipal(emisorId) {
  return vacio(emisorId) || limpio(emisorId) === EMISOR_PRINCIPAL
}

/** El emisor de un documento. Sin campo, o vacío, es el principal. */
export function emisorIdDe(documento) {
  const id = documento?.emisorId
  return typeof id === 'string' && !esPrincipal(id) ? id.trim() : EMISOR_PRINCIPAL
}

/** ¿Este documento es de este emisor? Los dos lados normalizan al principal. */
export function esDelEmisor(documento, emisorId) {
  return emisorIdDe(documento) === (esPrincipal(emisorId) ? EMISOR_PRINCIPAL : limpio(emisorId))
}

/**
 * El negocio con el emisor encima: el objeto que reciben los generadores de
 * XML, los PDF y los tickets sin enterarse de que hay más de un RUC.
 *
 * Sin emisor (o con el principal) devuelve el negocio tal cual, el MISMO
 * objeto: el camino de las cuentas de un solo RUC no cambia ni un byte.
 *
 * @param {object} negocio  el doc de `businesses/{id}`
 * @param {object|null} emisor  el doc de `emisores/{eid}` (con `id`), o null
 */
export function empresaEfectiva(negocio, emisor) {
  if (!emisor || esPrincipal(emisor.id) && vacio(emisor.ruc)) return negocio

  const base = negocio || {}
  const efectivo = { ...base }

  for (const [campo, valor] of Object.entries(emisor)) {
    if (NO_SE_SOBREPONEN.has(campo)) continue
    if (SIEMPRE_DEL_EMISOR.includes(campo) || !vacio(valor)) efectivo[campo] = valor
  }
  // Lo que el emisor no trae de su identidad NO se hereda del negocio.
  for (const campo of SIEMPRE_DEL_EMISOR) {
    if (!(campo in emisor)) delete efectivo[campo]
  }

  // Un emisor siempre tiene RUC.
  efectivo.sinRuc = false
  // Sin credenciales propias, sin firma: nunca las del negocio.
  efectivo.sunat = emisor.sunat ?? { enabled: false }
  efectivo.qpse = emisor.qpse ?? { enabled: false }
  // El régimen viejo de raíz acompaña al de `emissionConfig`, que es el que
  // leen el POS y el XML; así ningún lector antiguo ve el del negocio.
  if (emisor.emissionConfig?.taxConfig) efectivo.taxConfig = emisor.emissionConfig.taxConfig
  else delete efectivo.taxConfig
  // El nombre comercial propio del emisor manda en las dos formas en que se
  // guarda (`tradeName` y el `name` de las cuentas viejas). Sin uno propio,
  // el local es el mismo y se queda con el nombre de la tienda.
  if (!vacio(emisor.tradeName)) efectivo.name = emisor.tradeName

  // Sus series, y no las del negocio ni las de una sede: el emisor numera solo.
  const id = limpio(emisor.id)
  efectivo.emisorId = id || undefined
  efectivo.series = (id && base.emisorSeries?.[id]) || {}
  delete efectivo.branchSeries
  delete efectivo.warehouseSeries

  return efectivo
}

/**
 * Lo que se congela en el comprobante al emitir. Es lo que imprime un
 * documento viejo aunque el emisor cambie de dirección o se desactive, igual
 * que los campos `branch*` congelan la sede.
 */
export function snapshotDeEmisor(emisor) {
  if (!emisor) return null
  return {
    ruc: limpio(emisor.ruc),
    razonSocial: limpio(emisor.businessName),
    nombreComercial: limpio(emisor.tradeName),
    direccion: limpio(emisor.address),
  }
}

/** Nombre corto para un desplegable: el comercial, o la razón social. */
export function nombreDelEmisor(emisor) {
  return limpio(emisor?.tradeName) || limpio(emisor?.businessName) || limpio(emisor?.ruc)
}

/** Las series de un emisor: las del negocio para el principal, `emisorSeries.{id}` para el resto. */
export function seriesDelEmisor(negocio, emisorId) {
  if (esPrincipal(emisorId)) return negocio?.series || {}
  return negocio?.emisorSeries?.[limpio(emisorId)] || null
}

const igual = (a, b) => limpio(a).toUpperCase() === limpio(b).toUpperCase()

/**
 * A quién pertenece una serie dentro de la cuenta.
 *
 * Las series del negocio, de sus sucursales y de sus almacenes son todas del
 * principal: una sede es el mismo RUC en otra dirección.
 *
 * @returns {{emisorId: string, tipo: string, donde: string}|null}
 */
export function duenoDeLaSerie(serie, negocio) {
  if (vacio(serie) || !negocio) return null
  const buscar = (mapa, emisorId, donde) => {
    for (const [tipo, datos] of Object.entries(mapa || {})) {
      if (datos && igual(datos.serie, serie)) return { emisorId, tipo, donde }
    }
    return null
  }
  return (
    buscar(negocio.series, EMISOR_PRINCIPAL, 'negocio') ||
    Object.values(negocio.branchSeries || {}).reduce((r, m) => r || buscar(m, EMISOR_PRINCIPAL, 'sucursal'), null) ||
    Object.values(negocio.warehouseSeries || {}).reduce((r, m) => r || buscar(m, EMISOR_PRINCIPAL, 'almacen'), null) ||
    Object.entries(negocio.emisorSeries || {}).reduce((r, [eid, m]) => r || buscar(m, eid, 'emisor'), null)
  )
}

/** El emisor al que pertenece una serie, o null si nadie la tiene. */
export function emisorPorSerie(serie, negocio) {
  return duenoDeLaSerie(serie, negocio)?.emisorId ?? null
}

/** La guardia del servidor: ¿esta serie es de este emisor? */
export function laSerieEsDelEmisor(serie, negocio, emisorId) {
  const dueno = emisorPorSerie(serie, negocio)
  if (dueno === null) return false
  return dueno === (esPrincipal(emisorId) ? EMISOR_PRINCIPAL : limpio(emisorId))
}

/** El formato que SUNAT exige por tipo: F o B más tres alfanuméricos. Nota de venta: cuatro. */
const FORMATO = {
  factura: /^F[A-Z0-9]{3}$/,
  boleta: /^B[A-Z0-9]{3}$/,
  nota_venta: /^[A-Z0-9]{4}$/,
  nota_credito_factura: /^F[A-Z0-9]{3}$/,
  nota_credito_boleta: /^B[A-Z0-9]{3}$/,
  nota_debito_factura: /^F[A-Z0-9]{3}$/,
  nota_debito_boleta: /^B[A-Z0-9]{3}$/,
}

export function serieValida(tipo, serie) {
  const patron = FORMATO[tipo]
  return Boolean(patron) && patron.test(limpio(serie).toUpperCase())
}

/**
 * Qué series de un juego nuevo ya están tomadas, o se repiten entre sí.
 *
 * @param {Array<{tipo: string, serie: string}>} seriesNuevas
 * @param {object} negocio
 * @param {{salvo?: string}} [opciones]  el emisor que se está editando: sus
 *   propias series no cuentan como tomadas
 * @returns {Array<{tipo: string, serie: string, motivo: string}>}
 */
export function seriesRepetidas(seriesNuevas, negocio, { salvo } = {}) {
  const problemas = []
  const vistas = new Map()
  for (const { tipo, serie } of seriesNuevas || []) {
    const s = limpio(serie).toUpperCase()
    if (!s) continue
    if (vistas.has(s)) {
      problemas.push({ tipo, serie: s, motivo: `repetida con ${vistas.get(s)}` })
      continue
    }
    vistas.set(s, tipo)
    const dueno = duenoDeLaSerie(s, negocio)
    if (!dueno) continue
    if (salvo && !esPrincipal(salvo) && dueno.emisorId === limpio(salvo)) continue
    problemas.push({
      tipo,
      serie: s,
      motivo: dueno.emisorId === EMISOR_PRINCIPAL
        ? `ya la usa el RUC principal (${dueno.tipo})`
        : `ya la usa otro emisor (${dueno.tipo})`,
    })
  }
  return problemas
}

/**
 * Un juego de series para el emisor adicional número `n` (1 = el primero).
 * Distinto de los juegos del negocio (FF01, F001…) y de las sedes (F002…)
 * para que se lea a simple vista de quién es cada documento.
 */
export function seriesSugeridas(n = 1) {
  const c = n >= 1 && n <= 9 ? String(n) : String.fromCharCode(55 + Math.min(Math.max(n, 10), 35))
  return {
    factura: `F${c}01`,
    boleta: `B${c}01`,
    nota_venta: `N${c}01`,
    nota_credito_factura: `FC${c}1`,
    nota_credito_boleta: `BC${c}1`,
    nota_debito_factura: `FD${c}1`,
    nota_debito_boleta: `BD${c}1`,
  }
}

// ---------------------------------------------------------------------------
// El servidor: con qué RUC se firma, se anula o se consulta cada documento.
// ---------------------------------------------------------------------------

/** ¿La cuenta tiene más de un RUC? Sin series de emisor, nadie más pudo haber emitido. */
export function hayVariosRuc(negocio) {
  return Object.keys(negocio?.emisorSeries || {}).length > 0
}

/**
 * Milisegundos de una fecha como venga guardada: Timestamp de Firestore (con
 * `toMillis`, o serializado como `seconds`/`_seconds`), Date, texto o número.
 * null si no hay forma de leerla.
 */
export function aMilisegundos(valor) {
  if (valor === undefined || valor === null || valor === '') return null
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (typeof valor === 'string') {
    const t = Date.parse(valor)
    return Number.isNaN(t) ? null : t
  }
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.getTime()
  if (typeof valor.toMillis === 'function') return valor.toMillis()
  if (typeof valor.toDate === 'function') return valor.toDate().getTime()
  const segundos = valor.seconds ?? valor._seconds
  if (typeof segundos === 'number') {
    return segundos * 1000 + Math.floor((valor.nanoseconds ?? valor._nanoseconds ?? 0) / 1e6)
  }
  return null
}

/**
 * De qué emisor es un documento que se va a firmar, anular o consultar.
 *
 * - Lleva `emisorId`: ese. Al firmarlo por primera vez (`paraFirmar`), su serie
 *   no puede ser de OTRO RUC de la cuenta: sería un documento numerado con el
 *   contador de un RUC que se quiere firmar con el otro. Al anular manda el
 *   campo: el documento ya salió con ese RUC, aunque después se hayan
 *   cambiado las series.
 * - No lo lleva: el principal, salvo que su serie sea de un emisor adicional
 *   (un camino que se olvidó del campo). Entonces es de ese emisor, y
 *   `deducido` pide confirmarlo con las fechas (`confirmarEmisorDeducido`).
 *
 * @returns {{emisorId: string, deducido: boolean} | {error: string}}
 */
export function emisorDelDocumento(documento, negocio, { paraFirmar = false } = {}) {
  const declarado = emisorIdDe(documento)
  const conCampo = !vacio(documento?.emisorId)
  const serie = limpio(documento?.series).toUpperCase()
  const dueno = serie ? emisorPorSerie(serie, negocio) : null

  if (conCampo) {
    if (paraFirmar && dueno !== null && dueno !== declarado) {
      return {
        error: `La serie ${serie} es de otro RUC de la cuenta: este comprobante no se envía para no firmarlo con el RUC equivocado. Comunícate con soporte.`,
      }
    }
    return { emisorId: declarado, deducido: false }
  }
  if (dueno !== null && dueno !== EMISOR_PRINCIPAL) return { emisorId: dueno, deducido: true }
  return { emisorId: EMISOR_PRINCIPAL, deducido: false }
}

/**
 * Una serie es del emisor desde que el emisor existe. Un documento sin
 * `emisorId` anterior al emisor es del principal: es de cuando la cuenta usaba
 * esa serie, antes de dársela al emisor. Sin las dos fechas no se adivina:
 * firmar con el RUC equivocado no tiene vuelta.
 *
 * @param {object} documento
 * @param {object} emisor  el doc del emisor, con `id` y `creadoEn`
 * @returns {{emisorId: string} | {error: string}}
 */
export function confirmarEmisorDeducido(documento, emisor) {
  const delDocumento = aMilisegundos(documento?.createdAt)
  const delEmisor = aMilisegundos(emisor?.creadoEn)
  if (delDocumento === null || delEmisor === null) {
    return {
      error: `No se puede saber con qué RUC se emitió este comprobante: su serie ${limpio(documento?.series).toUpperCase()} es del RUC ${limpio(emisor?.ruc)}, pero el comprobante no lo dice. Comunícate con soporte.`,
    }
  }
  return { emisorId: delDocumento < delEmisor ? EMISOR_PRINCIPAL : limpio(emisor.id) }
}

/**
 * El negocio con el que se firma, se anula o se consulta un documento.
 *
 * Una cuenta de un solo RUC sale por el primer `return`, sin leer nada y con
 * el MISMO objeto que entró: el camino de siempre no cambia. Con un emisor
 * adicional devuelve el negocio con el emisor encima (`empresaEfectiva`), que
 * es lo que leen los generadores de XML, el router y los clientes de SUNAT y
 * QPse sin enterarse de que hay otro RUC.
 *
 * Nunca cae al principal "por las dudas": si el emisor no existe, o la serie
 * es de otro RUC, devuelve `error`. `transitorio` = no se pudo leer; vale la
 * pena reintentar.
 *
 * @param {object} documento
 * @param {object} negocio  el doc del negocio, ya con sus credenciales
 * @param {object} opciones
 * @param {(emisorId: string) => Promise<object|null>} opciones.cargarEmisor
 *   trae el emisor con sus credenciales, o null si no existe. El servidor lo
 *   lee de Firestore; las pruebas, de un objeto.
 * @param {boolean} [opciones.paraFirmar]
 * @returns {Promise<{negocio: object, emisorId: string, emisor?: object, deducido?: boolean} | {error: string, transitorio?: boolean}>}
 */
export async function negocioParaElDocumento(documento, negocio, { cargarEmisor, paraFirmar = false } = {}) {
  const decision = emisorDelDocumento(documento, negocio, { paraFirmar })
  if (decision.error) return { error: decision.error }
  if (esPrincipal(decision.emisorId)) return { negocio, emisorId: EMISOR_PRINCIPAL }

  let emisor
  try {
    emisor = await cargarEmisor(decision.emisorId)
  } catch {
    return { error: 'No se pudo leer el RUC de este comprobante. Vuelve a intentarlo en unos minutos.', transitorio: true }
  }
  if (!emisor) {
    return { error: 'El RUC con el que se emitió este comprobante ya no está configurado en la cuenta. Comunícate con soporte.' }
  }
  emisor = { ...emisor, id: decision.emisorId }

  if (decision.deducido) {
    const confirmado = confirmarEmisorDeducido(documento, emisor)
    if (confirmado.error) return { error: confirmado.error }
    if (esPrincipal(confirmado.emisorId)) return { negocio, emisorId: EMISOR_PRINCIPAL }
  }
  return {
    negocio: empresaEfectiva(negocio, emisor),
    emisorId: decision.emisorId,
    emisor,
    deducido: decision.deducido,
  }
}

/**
 * Una nota de crédito o de débito la firma el MISMO RUC que emitió el
 * comprobante que modifica. Solo se mira en cuentas con más de un RUC: con
 * uno solo son del mismo por definición, y no se lee nada.
 *
 * Ante la duda (la referencia no está, o no se puede resolver) no se frena:
 * que conteste SUNAT, como con la nota de crédito de más.
 *
 * @param {object} nota
 * @param {string} emisorDeLaNota  el que ya se resolvió para firmarla
 * @param {object} negocio
 * @param {{cargarReferencia: (id: string) => Promise<object|null>, cargarEmisor: Function}} fuentes
 * @returns {Promise<string|null>}  el motivo para no firmarla, o null
 */
export async function motivoPorRucDeLaReferencia(nota, emisorDeLaNota, negocio, { cargarReferencia, cargarEmisor } = {}) {
  const referenciaId = limpio(nota?.referencedInvoiceFirestoreId)
  if (!referenciaId) return null
  if (!hayVariosRuc(negocio) && esPrincipal(nota?.emisorId)) return null

  let referencia
  try {
    referencia = await cargarReferencia(referenciaId)
  } catch {
    return null
  }
  if (!referencia) return null

  const suya = await negocioParaElDocumento(referencia, negocio, { cargarEmisor })
  if (suya.error) return null
  const deLaNota = esPrincipal(emisorDeLaNota) ? EMISOR_PRINCIPAL : limpio(emisorDeLaNota)
  if (suya.emisorId === deLaNota) return null

  const numero = limpio(referencia.number) || `${limpio(referencia.series)}-${limpio(referencia.correlativeNumber)}`
  return `Esta nota modifica el comprobante ${numero}, que es del RUC ${limpio(suya.negocio?.ruc)}. Una nota se emite con el mismo RUC de su comprobante; comunícate con soporte.`
}

/**
 * El contador del día de las comunicaciones de baja (RA) y de los resúmenes
 * diarios (RC). Cada RUC numera los suyos: el `RA-20260910-1` del RUC A y el
 * del RUC B son documentos distintos para SUNAT. El principal sigue con el
 * contador de siempre.
 */
export function idDelContadorDelDia(fecha, emisorId) {
  return esPrincipal(emisorId) ? `counter_${fecha}` : `counter_${limpio(emisorId)}_${fecha}`
}

/**
 * Lo que se guarda en la baja o en el resumen para saber después con qué RUC
 * se mandó: la consulta del ticket la tiene que hacer el mismo RUC. El
 * principal no lleva nada, igual que los comprobantes.
 */
export function campoDeEmisor(emisorId) {
  return esPrincipal(emisorId) ? {} : { emisorId: limpio(emisorId) }
}

// ---------------------------------------------------------------------------
// El cliente: con qué datos se imprime cada comprobante.
// ---------------------------------------------------------------------------

/**
 * La empresa que va impresa en un comprobante: la de SU RUC.
 *
 * - Sin `emisorId`: el negocio tal cual, el MISMO objeto. El ticket, el PDF y
 *   el XML de las cuentas de un solo RUC no cambian.
 * - Con su emisor a mano (activo o no): el negocio con el emisor encima, con
 *   sus cuentas bancarias y su dirección.
 * - Con el emisor fuera de alcance (se borró, o la función se apagó y ya no se
 *   carga): lo que el comprobante congeló al emitirse (`emisor`). Nunca el RUC
 *   ni las cuentas del principal: una factura del segundo RUC con las cuentas
 *   del primero hace que el cliente le pague a la empresa equivocada.
 *
 * @param {object} comprobante
 * @param {object} negocio  la empresa que se imprimiría hoy, con la sede ya resuelta
 * @param {Array<object>} [emisores]  los emisores de la cuenta, cada uno con `id`
 */
export function empresaDelComprobante(comprobante, negocio, emisores = []) {
  const id = emisorIdDe(comprobante)
  if (id === EMISOR_PRINCIPAL) return negocio
  const emisor = (emisores || []).find((e) => limpio(e?.id) === id)
  if (emisor) return empresaEfectiva(negocio, emisor)
  const congelado = comprobante?.emisor || {}
  return empresaEfectiva(negocio, {
    id,
    ruc: limpio(congelado.ruc),
    businessName: limpio(congelado.razonSocial),
    tradeName: limpio(congelado.nombreComercial),
    address: limpio(congelado.direccion),
  })
}
