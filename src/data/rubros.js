/**
 * Catálogo de rubros. La fuente de verdad es UN solo archivo, el del
 * servidor (`functions/src/data/rubros.json`): así la web, la app del chat y
 * la semilla de cuenta nueva leen exactamente la misma lista. Agregar un
 * rubro es agregar una fila allá, no tocar código.
 */
import catalogo from '../../functions/src/data/rubros.json'
import { sugerirRubroDeCuenta as sugerirRubroBase } from '../../functions/src/data/clasificador.js'

export const RUBROS = catalogo.rubros

/**
 * La misma lista, en orden alfabético, para MOSTRAR.
 *
 * `RUBROS` no se puede ordenar: su orden ES la prioridad del clasificador (lo
 * específico antes que lo genérico, y "Otro comercio" al final). Ordenar el
 * catálogo haría que "Abarrotes" le ganara a "Panadería" y todo se caiga.
 * Por eso hay dos vistas de lo mismo: una para decidir y otra para elegir.
 */
export const RUBROS_ALFABETICOS = [...catalogo.rubros].sort((a, b) =>
  a.nombre.localeCompare(b.nombre, 'es')
)

export const RUBRO_SIN_CLASIFICAR = { id: null, nombre: 'Sin clasificar' }

export const nombreRubro = (id) => RUBROS.find((r) => r.id === id)?.nombre || RUBRO_SIN_CLASIFICAR.nombre

/** Rubros de un modo, para el selector (p.ej. solo los de retail). */
export const rubrosDelModo = (modo) => RUBROS_ALFABETICOS.filter((r) => r.modo === modo)

/**
 * Rubro sugerido para una cuenta que ya existe. Las reglas están junto al
 * catálogo (mismo archivo que usan las Functions) para que la web y el
 * servidor no se contradigan.
 */
export { normalizarTexto } from '../../functions/src/data/clasificador.js'
export const sugerirRubroDeCuenta = (negocio) => sugerirRubroBase(RUBROS, negocio)
