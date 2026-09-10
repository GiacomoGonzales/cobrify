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
