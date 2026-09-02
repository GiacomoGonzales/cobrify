/**
 * Adivina el rubro de una cuenta que ya existe.
 *
 * Por qué no se pregunta a SUNAT: la actividad económica (el CIIU de la ficha
 * RUC) no viene en apiperu.dev. Ni `/api/ruc` la trae, ni el campo
 * `actividad_economica` de los establecimientos anexos llega con algo: se
 * probaron RUCs con cientos de locales y vino vacío en todos. Por eso la
 * herramienta que consultaba SUNAT devolvía 709 de 709 "sin datos".
 *
 * Lo que sí tenemos, gratis y ya guardado: el nombre del negocio y su modo.
 * En Perú el nombre casi siempre dice el rubro ("FERRETERIA…", "BOTICA…",
 * "POLLERIA…"), y el modo (`businessMode`) es una decisión deliberada del
 * dueño, no un dato heredado. Con eso alcanza para proponer; confirmar sigue
 * siendo a mano en la ficha.
 *
 * El archivo no importa nada: recibe el catálogo por parámetro. Así lo usan
 * igual el navegador (Vite) y las Functions (Node), sin duplicar reglas.
 */

/** Sin tildes y en mayúsculas. La Ñ queda como N, igual que en SUNAT. */
export const normalizarTexto = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Busca el patrón como PALABRA COMPLETA, no como pedazo. Es la diferencia
 * entre acertar y hacer el ridículo: "BAR" está dentro de BARBERIA, BARRANCO
 * y BARATO.
 *
 * El número no importa: al patrón se le quita la S final y luego se admite
 * plural. Así "MULTISERVICIOS" encuentra "MULTISERVICIO BETANIA" y al revés,
 * que es justo lo que se escapaba antes.
 */
const tienePalabra = (texto, patron) => {
  const p = normalizarTexto(patron)
  if (!p) return false
  const raiz = p.endsWith('S') ? p.slice(0, -1) : p
  return new RegExp(`(^|[^A-Z0-9])${escapar(raiz)}(?:ES|S)?([^A-Z0-9]|$)`).test(texto)
}

/**
 * Primer rubro cuyos patrones aparecen en el texto. El orden del catálogo es
 * el orden de prioridad: lo específico antes que lo genérico. "Otro comercio"
 * se mira al final para que "COMERCIAL FERRETERA" caiga en ferretería.
 */
const primerRubroQueCalza = (rubros, texto, campo) => {
  if (!texto) return null
  const candidatos = rubros.filter((r) => r.id !== 'otro-comercio')
  const generico = rubros.find((r) => r.id === 'otro-comercio')
  for (const r of [...candidatos, ...(generico ? [generico] : [])]) {
    const patrones = r[campo] || []
    if (patrones.some((p) => tienePalabra(texto, p))) return r.id
  }
  return null
}

/** Rubro sugerido por el nombre del negocio (razón social o comercial). */
export const rubroPorNombre = (rubros, nombre) =>
  primerRubroQueCalza(rubros, normalizarTexto(nombre), 'patronesNombre')

/** Rubro sugerido por el texto de actividad económica de SUNAT, si algún día llega. */
export const rubroPorActividad = (rubros, actividad) =>
  primerRubroQueCalza(rubros, normalizarTexto(actividad), 'patronesSunat')

/**
 * Rubro por lo que VENDE. Es la señal que salva a las personas naturales,
 * donde la razón social es el nombre del titular y no dice nada.
 *
 * Aquí no vale el primero que calza: una lista de productos es ruidosa (la
 * bodega que vende un paracetamol, el restaurante que vende cerveza). Se
 * VOTA: cada producto que calza le suma uno a su rubro y gana el más votado,
 * siempre que gane de verdad. Si no hay mayoría clara devuelve null, que es
 * una respuesta legítima.
 *
 * `soloModo` limita a los rubros de un modo. Sirve para afinar una cuenta en
 * modo restaurant entre restaurante, cafetería y bar sin que se escape a otro
 * modo por un par de productos sueltos.
 */
export function rubroPorProductos(rubros, productos, { soloModo } = {}) {
  const candidatos = soloModo ? rubros.filter((r) => r.modo === soloModo) : rubros
  const textos = (productos || []).map(normalizarTexto).filter(Boolean)
  if (textos.length < 3) return null

  const votos = {}
  for (const t of textos) {
    for (const r of candidatos) {
      const patrones = r.patronesProducto || []
      if (patrones.length && patrones.some((p) => tienePalabra(t, p))) {
        votos[r.id] = (votos[r.id] || 0) + 1
      }
    }
  }

  const orden = Object.entries(votos).sort((a, b) => b[1] - a[1])
  if (!orden.length) return null
  const [ganador, suyos] = orden[0]
  const segundo = orden[1]?.[1] || 0
  const total = orden.reduce((s, [, n]) => s + n, 0)

  // Tres productos es el mínimo para no clasificar por casualidad; tiene que
  // ganarle al segundo y llevarse al menos el 40% de los votos.
  if (suyos < 3 || suyos <= segundo || suyos / total < 0.4) return null
  return { rubro: ganador, votos: suyos, mirados: textos.length }
}

/**
 * La sugerencia, con el motivo a la vista para poder auditarla.
 *
 * 1. Si el modo solo admite un rubro (farmacia, veterinaria, hotel…), ese es,
 *    sin mirar el nombre: nadie pone su cuenta en modo botica por descuido.
 * 2. Si SUNAT dio actividad, manda sobre el nombre.
 * 3. El nombre del negocio.
 * 4. Lo que vende, por votación (ver arriba).
 * 4b. Si el nombre solo daba "otro comercio", recién ahí se usa, marcado
 *    `nombre-generico`: es un rubro que no informa nada y no debe tapar al
 *    inventario.
 * 5. Un modo distinto de `retail` con varios rubros posibles cae en el primero
 *    de su modo (restaurant → restaurante). `retail` no: es el modo por
 *    defecto de toda cuenta nueva, así que no dice nada. Esto sale marcado
 *    como `modo-supuesto` y NO es evidencia: un modo restaurant sin más
 *    pistas puede ser cafetería o bar. Se separa en el reporte para no
 *    confundir una suposición con un dato.
 *
 * Devuelve `{ rubro: null, motivo: null }` cuando no hay con qué. Queda "sin
 * clasificar" a propósito: es mejor un hueco visible que un rubro inventado.
 */
export function sugerirRubroDeCuenta(rubros, { nombre, modo, actividadSunat, estacionServicio, productos } = {}) {
  // Tener prendido el modo estación de servicio no se presta a interpretación:
  // esa cuenta despacha combustible.
  if (estacionServicio && rubros.some((r) => r.id === 'grifo')) return { rubro: 'grifo', motivo: 'grifo' }

  const delModo = modo ? rubros.filter((r) => r.modo === modo) : []

  if (delModo.length === 1) return { rubro: delModo[0].id, motivo: 'modo' }

  const porSunat = rubroPorActividad(rubros, actividadSunat)
  if (porSunat) return { rubro: porSunat, motivo: 'sunat' }

  const porNombre = rubroPorNombre(rubros, nombre)
  // "Otro comercio" es un cajón de sastre: lo ganan palabras como COMERCIAL o
  // INVERSIONES, que no dicen qué vende nadie. No vale más que el inventario,
  // así que se guarda y se usa solo si los productos no deciden.
  if (porNombre && porNombre !== 'otro-comercio') return { rubro: porNombre, motivo: 'nombre' }

  // Modo con varios rubros posibles: los productos deciden entre ellos, y si
  // no alcanza queda el primero del modo como suposición declarada.
  if (delModo.length > 1 && modo !== 'retail') {
    const entreLosDelModo = rubroPorProductos(rubros, productos, { soloModo: modo })
    if (entreLosDelModo) return { rubro: entreLosDelModo.rubro, motivo: 'productos' }
    return { rubro: delModo[0].id, motivo: 'modo-supuesto' }
  }

  const porProductos = rubroPorProductos(rubros, productos)
  if (porProductos) return { rubro: porProductos.rubro, motivo: 'productos' }

  if (porNombre) return { rubro: porNombre, motivo: 'nombre-generico' }

  return { rubro: null, motivo: null }
}
