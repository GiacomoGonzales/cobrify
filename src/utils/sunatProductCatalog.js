/**
 * Acceso al catálogo 25 de SUNAT (Código de Producto / UNSPSC).
 *
 * El dataset lo genera `scripts/build-sunat-product-catalog.mjs` desde el
 * archivo oficial de SUNAT. Son 2.4 MB (unos 310 KB servidos con compresión),
 * así que NO se importa: se descarga la primera vez que alguien abre el buscador
 * y queda en memoria y en la caché del navegador. Nada de esto se carga para el
 * usuario que nunca toca la sección.
 *
 * Un código es emitible desde el TERCER nivel jerárquico (OBS-4337). El nivel se
 * deduce del propio código, sin guardarlo:
 *
 *   10000000  segmento    termina en 000000    no emitible
 *   10100000  familia     termina en 0000      no emitible
 *   10101500  clase       termina en 00        emitible
 *   10101501  producto                         emitible
 */

const RUTA = '/data/catalogo-producto-sunat-v14.json'

/** Comodines que SUNAT acepta cuando el emisor no puede clasificar el ítem. */
export const CODIGOS_ESCAPE = ['00000000', '99999999']

/**
 * Cómo le decimos acá a las cosas, y cómo les dice el catálogo.
 *
 * El UNSPSC está traducido del inglés y no habla como habla un peruano: buscar
 * "gaseosa" no devuelve nada porque el catálogo dice "Refrescos", y "chompa" no
 * existe, es "Suéteres". Sin esta tabla el usuario concluye que su producto no
 * está en la lista —cuando sí está— y termina poniendo un código cualquiera.
 *
 * Cada equivalencia está comprobada contra el dataset: la palabra de la derecha
 * devuelve resultados razonables. Si agregas una, verifícala primero.
 */
export const SINONIMOS = {
  gaseosa: 'refrescos',
  gaseosas: 'refrescos',
  cola: 'refrescos',
  chompa: 'sueteres',
  chompas: 'sueteres',
  polo: 'camisetas',
  polos: 'camisetas',
  lapicero: 'boligrafos',
  lapiceros: 'boligrafos',
  mochila: 'morrales',
  mochilas: 'morrales',
  caramelo: 'confiteria',
  caramelos: 'confiteria',
  golosina: 'confiteria',
  golosinas: 'confiteria',
  dulce: 'confiteria',
  dulces: 'confiteria',
  llanta: 'neumaticos',
  llantas: 'neumaticos',
  celular: 'telefonos moviles',
  celulares: 'telefonos moviles',
  shampoo: 'champu',
  mascarilla: 'respiradores',
  mascarillas: 'respiradores',
  fierro: 'barras de acero',
  // Platos y servicios de restaurante: no existen como producto, el catálogo
  // los cubre por el tipo de establecimiento que los vende.
  almuerzo: 'restaurantes',
  menu: 'restaurantes',
  ceviche: 'restaurantes',
  anticucho: 'restaurantes',
  'pollo a la brasa': 'restaurantes',
  chifa: 'restaurantes',
  pollera: 'restaurantes',
  delivery: 'servicios de comida para llevar',
}

let promesaCarga = null
let indice = null

// Quita tildes para que "champu" encuentre "Champús", pero PROTEGE la ñ: sin
// esto "pañal" se convierte en "panal" y el buscador ofrece núcleos de panal de
// aluminio en vez de pañales.
// NFD parte la "ñ" en "n" + tilde combinante; la recomponemos antes de barrer
// el resto de marcas: así se van las tildes de las vocales y la ñ se queda.
const normalizar = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/ñ/g, 'ñ')
  .replace(/[̀-ͯ]/g, '')
  .trim()

/**
 * Nivel jerárquico de un código de 8 dígitos, deducido de sus ceros finales.
 */
export const nivelDeCodigo = (codigo) => {
  const c = String(codigo ?? '').trim()
  if (!/^\d{8}$/.test(c)) return null
  if (CODIGOS_ESCAPE.includes(c)) return 'escape'
  if (c.endsWith('000000')) return 'segmento'
  if (c.endsWith('0000')) return 'familia'
  if (c.endsWith('00')) return 'clase'
  return 'producto'
}

/**
 * Un código puede ir al XML si tiene 8 dígitos y llega al tercer nivel. No
 * comprueba que exista en el catálogo: para eso está `validarCodigo`, que
 * necesita el dataset cargado.
 */
export const tieneFormatoEmitible = (codigo) => {
  const nivel = nivelDeCodigo(codigo)
  return nivel === 'clase' || nivel === 'producto' || nivel === 'escape'
}

/**
 * Descarga el catálogo una sola vez por sesión. Las llamadas simultáneas
 * comparten la misma promesa; si falla, se descarta para poder reintentar.
 */
export const cargarCatalogo = async () => {
  if (indice) return indice
  if (!promesaCarga) {
    promesaCarga = (async () => {
      const res = await fetch(RUTA)
      if (!res.ok) throw new Error(`No se pudo cargar el catálogo SUNAT (${res.status})`)
      const datos = await res.json()

      // Se prepara una sola vez la lista con el texto ya normalizado; si no,
      // habría que normalizar 52 mil descripciones en cada tecla del buscador.
      const entradas = []
      for (const [codigo, nombre] of Object.entries(datos.clases || {})) {
        entradas.push({ codigo: `${codigo}00`, nombre, nivel: 'clase', busqueda: normalizar(nombre) })
      }
      for (const [codigo, nombre] of Object.entries(datos.productos || {})) {
        entradas.push({ codigo, nombre, nivel: 'producto', busqueda: normalizar(nombre) })
      }

      indice = {
        version: datos.version,
        segmentos: datos.segmentos || {},
        familias: datos.familias || {},
        clases: datos.clases || {},
        productos: datos.productos || {},
        entradas,
        porCodigo: new Map(entradas.map(e => [e.codigo, e])),
      }
      return indice
    })().catch(err => { promesaCarga = null; throw err })
  }
  return promesaCarga
}

/** El catálogo si ya se descargó, o null. No dispara la descarga. */
export const catalogoEnMemoria = () => indice

/**
 * Datos de un código: descripción, nivel y la ruta jerárquica para mostrarla.
 * Requiere el catálogo cargado.
 */
export const describirCodigo = (codigo) => {
  const c = String(codigo ?? '').trim()
  if (!indice || !/^\d{8}$/.test(c)) return null
  if (CODIGOS_ESCAPE.includes(c)) {
    return { codigo: c, nombre: 'Código genérico (sin clasificar)', nivel: 'escape', ruta: [] }
  }
  const entrada = indice.porCodigo.get(c)
  if (!entrada) return null
  const ruta = [
    indice.segmentos[c.slice(0, 2)],
    indice.familias[c.slice(0, 4)],
    indice.clases[c.slice(0, 6)],
  ].filter(Boolean)
  // La clase es su propio nombre; no la repetimos al final de su ruta.
  if (entrada.nivel === 'clase') ruta.pop()
  return { ...entrada, ruta }
}

/**
 * ¿El código existe en el catálogo y llega al tercer nivel? Es la validación que
 * hace imposible el ERR-3496: si nunca se guarda un código inválido, nunca se
 * emite uno. Requiere el catálogo cargado.
 */
export const validarCodigo = (codigo) => {
  const c = String(codigo ?? '').trim()
  if (!c) return { valido: true, vacio: true }
  if (!/^\d{8}$/.test(c)) return { valido: false, error: 'El código debe tener exactamente 8 dígitos' }
  if (CODIGOS_ESCAPE.includes(c)) return { valido: true }
  const nivel = nivelDeCodigo(c)
  if (nivel === 'segmento' || nivel === 'familia') {
    return { valido: false, error: 'El código debe llegar al menos al tercer nivel (clase); no se aceptan segmentos ni familias' }
  }
  if (!indice) return { valido: false, error: 'El catálogo aún no se ha cargado' }
  if (!indice.porCodigo.has(c)) return { valido: false, error: 'El código no existe en el catálogo 25 de SUNAT' }
  return { valido: true }
}

/**
 * Busca por descripción o por código. Prioriza, en ese orden: código exacto,
 * código que empieza igual, descripción que empieza con el texto, y por último
 * descripción que lo contiene. Requiere el catálogo cargado.
 */
export const buscar = (texto, limite = 40) => {
  if (!indice) return []
  const q = normalizar(texto)
  if (q.length < 2) return []

  // Si lo que escribió tiene un equivalente en el catálogo, esos resultados van
  // primero: quien busca "gaseosa" quiere ver "Refrescos" arriba, no nada.
  const equivalente = SINONIMOS[q]
  if (equivalente) {
    const porSinonimo = buscarDirecto(normalizar(equivalente), limite)
    const yaEstan = new Set(porSinonimo.map(e => e.codigo))
    return [...porSinonimo, ...buscarDirecto(q, limite).filter(e => !yaEstan.has(e.codigo))].slice(0, limite)
  }
  return buscarDirecto(q, limite)
}

const buscarDirecto = (q, limite) => {
  const esCodigo = /^\d+$/.test(q)
  const exactos = [], porPrefijo = [], porInicio = [], porContenido = []

  for (const e of indice.entradas) {
    if (esCodigo) {
      if (e.codigo === q) exactos.push(e)
      else if (e.codigo.startsWith(q)) porPrefijo.push(e)
      continue
    }
    const i = e.busqueda.indexOf(q)
    if (i === 0) porInicio.push(e)
    else if (i > 0) porContenido.push(e)
    if (porInicio.length + porContenido.length >= limite * 6) break
  }

  return [...exactos, ...porPrefijo, ...porInicio, ...porContenido].slice(0, limite)
}
