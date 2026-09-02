/**
 * Catálogo de rubros. La fuente de verdad es UN solo archivo, el del
 * servidor (`functions/src/data/rubros.json`): así la web, la app del chat y
 * la semilla de cuenta nueva leen exactamente la misma lista. Agregar un
 * rubro es agregar una fila allá, no tocar código.
 */
import catalogo from '../../functions/src/data/rubros.json'

export const RUBROS = catalogo.rubros

export const RUBRO_SIN_CLASIFICAR = { id: null, nombre: 'Sin clasificar' }

export const nombreRubro = (id) => RUBROS.find((r) => r.id === id)?.nombre || RUBRO_SIN_CLASIFICAR.nombre

/** Rubros de un modo, para el selector (p.ej. solo los de retail). */
export const rubrosDelModo = (modo) => RUBROS.filter((r) => r.modo === modo)
