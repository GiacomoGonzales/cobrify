/**
 * LOS MODIFICADORES QUE EL NEGOCIO YA TIENE CREADOS.
 *
 * Las plantillas llegaron después. Antes, cada quien escribía los modificadores
 * producto por producto, así que un negocio con 60 platos puede tener "Cremas"
 * sesenta veces: es el MISMO modificador, tipeado sesenta veces. La pestaña de
 * Modificadores solo mostraba las plantillas —que en esos negocios están
 * vacías—, o sea que no mostraba nada de lo que realmente usan.
 *
 * Acá se junta todo lo que hay dentro de los productos y se agrupa por nombre,
 * para verlo UNA vez en vez de sesenta.
 *
 * ── Lo que hace falta distinguir ────────────────────────────────────────────
 * Que dos grupos se llamen igual NO quiere decir que sean iguales. "Cremas" en
 * la salchipapa puede tener cuatro opciones gratis y en el pollo tres con
 * recargo. Por eso cada nombre se abre en VERSIONES: copias con exactamente el
 * mismo contenido cuentan como una sola, y las que difieren se muestran por
 * separado con los productos de cada una.
 *
 * Esa diferencia es la que decide si unificar es seguro. Un nombre con una sola
 * versión se puede convertir en plantilla sin pensarlo. Uno con tres versiones
 * es una decisión del dueño: unificarlo cambia lo que se le cobra al cliente en
 * los productos que pierdan su versión.
 */
import { cleanText, normalizeText } from '@/lib/utils'
import { enlaceDeLaOpcion, conElEnlace } from '@/utils/modificadorInsumo'

/**
 * El nombre con el que se comparan dos modificadores: sin espacios de sobra,
 * sin tildes y en minúscula.
 *
 * Sin tildes a propósito: quien escribió "Termino de la carne" y quien escribió
 * "Término de la carne" crearon el mismo modificador, y el objetivo de esta
 * pantalla es justamente juntarlos.
 */
export const nombreComparable = (texto) => normalizeText(cleanText(texto))

/**
 * La firma del CONTENIDO de un grupo: dos grupos con la misma firma son la
 * misma cosa aunque estén en productos distintos y tengan otros ids.
 *
 * Las opciones se ordenan antes de comparar porque el orden en que se
 * escribieron no cambia lo que el cliente elige: "Ají, Mayonesa" y "Mayonesa,
 * Ají" son el mismo grupo.
 *
 * `trackUsage` queda FUERA de la firma. Es un flag de reporte interno, no algo
 * que el cliente vea ni que cambie el precio, y si entrara partiría en dos
 * versiones a grupos idénticos solo porque a uno le marcaron "Llevar control".
 */
export const firmaDelGrupo = (grupo) => JSON.stringify({
  obligatorio: !!grupo?.required,
  maximo: Number(grupo?.maxSelection) || 1,
  repite: !!grupo?.allowRepeat,
  opciones: (grupo?.options || [])
    .map((o) => {
      // El insumo enlazado SÍ entra: dos "Pieza extra" que descuentan cosas
      // distintas no son el mismo modificador, y unificarlas dejaría platos
      // descontando del insumo equivocado.
      const enlace = enlaceDeLaOpcion(o)
      return [
        nombreComparable(o?.name),
        Number(o?.priceAdjustment) || 0,
        enlace ? `${enlace.ingredientId}|${enlace.ingredientQuantity}|${enlace.ingredientUnit}` : '',
      ]
    })
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1] || a[2].localeCompare(b[2])),
})

/**
 * Junta los modificadores de todos los productos.
 *
 * @param {Array} productos Los productos del negocio, tal como vienen de
 *   Firestore (cada uno con su `modifiers`).
 * @returns {Array} Un elemento por nombre distinto, del más usado al menos
 *   usado. Cada uno trae:
 *   - `nombre`      cómo se escribe (gana la forma más repetida)
 *   - `clave`       el nombre comparable
 *   - `productos`   en cuántos productos aparece
 *   - `versiones`   las variantes de contenido, de la más usada a la menos
 *   - `esIgualEnTodos`  true si hay una sola versión
 *   - `llevaControl`    true si alguna copia tiene "Llevar control"
 */
export function modificadoresEnUso(productos) {
  const porNombre = new Map()

  for (const producto of productos || []) {
    for (const grupo of producto?.modifiers || []) {
      const clave = nombreComparable(grupo?.name)
      // Un grupo sin nombre no se puede agrupar ni mostrar: es basura de un
      // "Agregar modificador" que quedó a medio llenar.
      if (!clave) continue

      if (!porNombre.has(clave)) {
        porNombre.set(clave, { clave, escrituras: new Map(), versiones: new Map(), productos: new Set() })
      }
      const entrada = porNombre.get(clave)
      entrada.productos.add(producto.id)

      // Cómo está escrito. Se cuenta para mostrar la forma más habitual y no
      // la primera que aparezca, que puede ser la de un solo producto.
      const escrito = cleanText(grupo?.name)
      entrada.escrituras.set(escrito, (entrada.escrituras.get(escrito) || 0) + 1)

      const firma = firmaDelGrupo(grupo)
      if (!entrada.versiones.has(firma)) {
        entrada.versiones.set(firma, { firma, grupo, productos: [], llevaControl: false })
      }
      const version = entrada.versiones.get(firma)
      version.productos.push({ id: producto.id, nombre: cleanText(producto?.name) })
      if (grupo?.trackUsage) version.llevaControl = true
    }
  }

  const masUsado = (mapa) => [...mapa.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''

  return [...porNombre.values()]
    .map((entrada) => {
      const versiones = [...entrada.versiones.values()]
        .sort((a, b) => b.productos.length - a.productos.length)
      return {
        clave: entrada.clave,
        nombre: masUsado(entrada.escrituras),
        productos: entrada.productos.size,
        versiones,
        esIgualEnTodos: versiones.length === 1,
        llevaControl: versiones.some((v) => v.llevaControl),
      }
    })
    .sort((a, b) => b.productos - a.productos || a.nombre.localeCompare(b.nombre))
}

/**
 * Cuántos modificadores hay tipeados y cuántos son en realidad.
 *
 * Es el número que explica el problema de un vistazo: "137 modificadores
 * escritos, 9 distintos".
 */
export function resumenDeModificadores(enUso) {
  const escritos = (enUso || []).reduce(
    (total, m) => total + m.versiones.reduce((n, v) => n + v.productos.length, 0),
    0,
  )
  return {
    escritos,
    distintos: (enUso || []).length,
    divergentes: (enUso || []).filter((m) => !m.esIgualEnTodos).length,
  }
}

/**
 * ¿Este grupo de un producto es el de esta plantilla?
 *
 * Por `templateId` cuando lo tiene, porque es la referencia explícita que dejó
 * "Desde plantilla". Y si no lo tiene, por nombre: los modificadores viejos se
 * escribieron a mano años antes de que existieran las plantillas y no hay otra
 * forma de reconocerlos, que es justamente a los que hay que llegar.
 *
 * Un grupo con OTRO `templateId` no se toca aunque se llame igual: pertenece a
 * otra plantilla y no es de esta.
 */
export const grupoEsDeLaPlantilla = (grupo, plantilla) => {
  if (!grupo || !plantilla) return false
  if (grupo.templateId) return grupo.templateId === plantilla.id
  return !!nombreComparable(grupo.name)
    && nombreComparable(grupo.name) === nombreComparable(plantilla.name)
}

/**
 * El grupo que le queda al producto después de aplicarle la plantilla.
 *
 * Se conserva el `id` del grupo que ya tenía: es el que quedó guardado en los
 * comprobantes emitidos, y el reporte de modificadores cruza por ahí. Cambiarlo
 * dejaría el historial sin poder emparejarse con la definición actual.
 *
 * Los ids de las opciones se reaprovechan cuando la opción se sigue llamando
 * igual, por lo mismo. Las opciones nuevas estrenan id.
 */
export function grupoDesdePlantilla(plantilla, grupoActual = null) {
  const ts = Date.now()
  const idsLibres = new Map()
  for (const o of grupoActual?.options || []) {
    const clave = nombreComparable(o?.name)
    if (clave && o?.id && !idsLibres.has(clave)) idsLibres.set(clave, o.id)
  }
  const tomarId = (nombre, i) => {
    const clave = nombreComparable(nombre)
    const id = idsLibres.get(clave)
    // Se saca del mapa para que dos opciones que se normalizan igual no
    // terminen compartiendo el mismo id dentro del grupo.
    if (id) idsLibres.delete(clave)
    return id || `opt-${ts}-${i}`
  }
  return {
    id: grupoActual?.id || `mod-${ts}`,
    name: cleanText(plantilla?.name),
    required: !!plantilla?.required,
    maxSelection: Number(plantilla?.maxSelection) || 1,
    ...(plantilla?.allowRepeat ? { allowRepeat: true } : {}),
    ...(plantilla?.trackUsage ? { trackUsage: true } : {}),
    ...(plantilla?.id ? { templateId: plantilla.id } : {}),
    options: (plantilla?.options || []).map((o, i) => conElEnlace({
      id: tomarId(o?.name, i),
      name: cleanText(o?.name),
      priceAdjustment: Number(o?.priceAdjustment) || 0,
    }, o)),
  }
}

/**
 * Qué le pasaría a cada producto si se aplica la plantilla. NO escribe nada.
 *
 * Existe separado de la escritura para que la pantalla pueda mostrar los
 * números ANTES de confirmar: esto cambia lo que se le cobra al cliente en los
 * productos que hoy tienen otra cosa, y eso no se pregunta después.
 *
 * @param {Array} productos Todos los productos del negocio.
 * @param {object} plantilla La plantilla a aplicar.
 * @param {Iterable} idsDestino Los productos elegidos.
 * @returns {{cambios: Array, totales: object}} `cambios` trae solo los que hay
 *   que escribir, cada uno con el array `modifiers` completo del producto.
 */
export function planDeAplicacion(productos, plantilla, idsDestino) {
  const destino = new Set(idsDestino || [])
  const cambios = []
  const totales = { alcanzados: 0, iguales: 0, reemplazan: 0, agregan: 0 }

  for (const producto of productos || []) {
    if (!producto?.id || !destino.has(producto.id)) continue
    totales.alcanzados++

    const actuales = producto.modifiers || []
    const indice = actuales.findIndex((g) => grupoEsDeLaPlantilla(g, plantilla))
    const datos = { id: producto.id, nombre: cleanText(producto?.name) }

    if (indice === -1) {
      totales.agregan++
      cambios.push({
        producto: datos,
        tipo: 'agrega',
        modifiers: [...actuales, grupoDesdePlantilla(plantilla)],
      })
      continue
    }

    const actual = actuales[indice]
    // Si lo que el cliente ve ya es idéntico, no se escribe. Así aplicar dos
    // veces seguidas no hace nada la segunda, y el conteo dice la verdad.
    const yaEstaIgual = firmaDelGrupo(actual) === firmaDelGrupo(plantilla)
      && cleanText(actual.name) === cleanText(plantilla?.name)
    if (yaEstaIgual) {
      totales.iguales++
      continue
    }

    const modifiers = [...actuales]
    modifiers[indice] = grupoDesdePlantilla(plantilla, actual)
    totales.reemplazan++
    cambios.push({ producto: datos, tipo: 'reemplaza', antes: actual, modifiers })
  }

  return { cambios, totales }
}

/**
 * Convierte una versión en plantilla, lista para guardar.
 *
 * Los ids se generan nuevos: la plantilla es una cosa aparte del grupo que
 * vive dentro del producto, y compartir ids haría que "Desde plantilla"
 * insertara copias con el id del producto original.
 */
export function plantillaDesdeVersion(version, nombre) {
  const ts = Date.now()
  const grupo = version?.grupo || {}
  return {
    id: `mod-tpl-${ts}`,
    name: cleanText(nombre) || cleanText(grupo.name),
    required: !!grupo.required,
    maxSelection: Number(grupo.maxSelection) || 1,
    ...(grupo.allowRepeat ? { allowRepeat: true } : {}),
    // Si CUALQUIER copia llevaba control, la plantilla lo lleva: es más fácil
    // destildarlo una vez que descubrir por qué el reporte quedó vacío.
    ...(version?.llevaControl ? { trackUsage: true } : {}),
    options: (grupo.options || []).map((o, i) => conElEnlace({
      id: `opt-tpl-${ts}-${i}`,
      name: cleanText(o?.name),
      priceAdjustment: Number(o?.priceAdjustment) || 0,
    }, o)),
  }
}

/**
 * Qué productos quedaron con una versión vieja de las plantillas que usan.
 *
 * Es la pregunta que el dueño se hace después de editar una plantilla: "¿y los
 * platos que ya la tenían?". Editar la plantilla no los toca —cada producto
 * guarda su propia copia, que es lo que el POS lee— así que hace falta un
 * empujón explícito, y para darlo hay que saber a quiénes alcanza.
 *
 * Solo mira los productos que YA usan cada plantilla: sincronizar nunca le
 * agrega un modificador a un plato que no lo tenía. Para eso está aplicar por
 * categoría, que es una decisión distinta.
 *
 * Se encadena plantilla por plantilla sobre el mismo estado y no sobre el
 * catálogo original: un plato puede usar dos plantillas, y calculando cada una
 * por separado la segunda pisaría el cambio de la primera.
 *
 * @returns {{porPlantilla: Array, cambios: Array}} `cambios` trae UNA entrada
 *   por producto, con su array `modifiers` ya completo, lista para escribir.
 */
export function planDeSincronizacion(productos, plantillas) {
  const estado = new Map()
  for (const p of productos || []) {
    if (p?.id) estado.set(p.id, p)
  }

  const porPlantilla = []
  const porProducto = new Map()

  for (const plantilla of plantillas || []) {
    if (!plantilla?.id) continue
    const actuales = [...estado.values()]
    const laUsan = actuales
      .filter((p) => (p.modifiers || []).some((g) => grupoEsDeLaPlantilla(g, plantilla)))
      .map((p) => p.id)

    const { cambios, totales } = planDeAplicacion(actuales, plantilla, laUsan)
    porPlantilla.push({
      plantilla,
      usan: laUsan.length,
      desactualizados: totales.reemplazan,
    })

    for (const cambio of cambios) {
      const previo = estado.get(cambio.producto.id)
      const actualizado = { ...previo, modifiers: cambio.modifiers }
      estado.set(cambio.producto.id, actualizado)
      porProducto.set(cambio.producto.id, { producto: cambio.producto, modifiers: cambio.modifiers })
    }
  }

  return { porPlantilla, cambios: [...porProducto.values()] }
}

/**
 * Lo que distingue a una versión, además de sus opciones.
 *
 * En pantalla se ven los nombres y los precios, pero la comparación mira
 * también si el grupo es obligatorio, cuántas opciones deja elegir, si permite
 * repetir y qué insumo descuenta. Sin esto, dos versiones con las MISMAS
 * opciones aparecían separadas sin explicación y la pantalla parecía rota
 * (reporte con "Tamaño", 04-sep-2026: la Versión 1 y la 4 se veían idénticas).
 */
export const atributosDeLaVersion = (grupo) => ({
  obligatorio: !!grupo?.required,
  maximo: Number(grupo?.maxSelection) || 1,
  repite: !!grupo?.allowRepeat,
  insumos: (grupo?.options || [])
    .map((o) => {
      const enlace = enlaceDeLaOpcion(o)
      return enlace ? `${cleanText(o?.name)}: ${enlace.ingredientQuantity} ${enlace.ingredientUnit} de ${enlace.ingredientName}` : ''
    })
    .filter(Boolean),
})

/**
 * Cuáles de esos atributos NO son iguales en todas las versiones.
 *
 * Se muestran solo los que difieren: repetir "Máximo 1" en las cuatro
 * versiones no ayuda a elegir, y el que cambia se pierde entre el ruido.
 */
export function atributosQueDifieren(versiones) {
  const lista = (versiones || []).map((v) => atributosDeLaVersion(v?.grupo))
  if (lista.length < 2) return []
  const distinto = (leer) => new Set(lista.map((a) => JSON.stringify(leer(a)))).size > 1
  return [
    distinto((a) => a.obligatorio) && 'obligatorio',
    distinto((a) => a.maximo) && 'maximo',
    distinto((a) => a.repite) && 'repite',
    distinto((a) => a.insumos) && 'insumos',
  ].filter(Boolean)
}

/**
 * Dejar en UNA sola versión todos los modificadores que se llaman igual.
 *
 * Es la respuesta a "tengo el mismo modificador en cuatro versiones, ¿cómo hago
 * para que todos queden con esta?". Alcanza por NOMBRE, que es lo que el dueño
 * ve agrupado en pantalla, y no por plantilla: acá todavía puede no haber
 * ninguna.
 *
 * Cada producto conserva su `templateId` si lo tenía. Unificar es una decisión
 * sobre el CONTENIDO; a qué plantilla pertenece cada grupo es otra cosa y no
 * hay motivo para romperla de paso.
 *
 * @param {Array} productos Todos los productos del negocio.
 * @param {string} clave El nombre comparable del modificador.
 * @param {object} version La versión que queda como buena (de `modificadoresEnUso`).
 */
export function planDeUnificacion(productos, clave, version) {
  const buena = version?.grupo
  const cambios = []
  const totales = { alcanzados: 0, iguales: 0, reemplazan: 0 }
  if (!buena || !clave) return { cambios, totales }

  // Sin `id`, para que `grupoDesdePlantilla` no confunda el id del GRUPO con el
  // de una plantilla y lo estampe como `templateId`.
  const molde = { ...buena, id: undefined }
  const firmaBuena = firmaDelGrupo(buena)
  const nombreBueno = cleanText(buena.name)

  for (const producto of productos || []) {
    const actuales = producto?.modifiers || []
    let toco = false
    const nuevos = actuales.map((grupo) => {
      if (nombreComparable(grupo?.name) !== clave) return grupo
      totales.alcanzados++
      if (firmaDelGrupo(grupo) === firmaBuena && cleanText(grupo.name) === nombreBueno) {
        totales.iguales++
        return grupo
      }
      totales.reemplazan++
      toco = true
      const rehecho = grupoDesdePlantilla(molde, grupo)
      return grupo.templateId ? { ...rehecho, templateId: grupo.templateId } : rehecho
    })
    if (toco) {
      cambios.push({
        producto: { id: producto.id, nombre: cleanText(producto?.name) },
        modifiers: nuevos,
      })
    }
  }
  return { cambios, totales }
}
