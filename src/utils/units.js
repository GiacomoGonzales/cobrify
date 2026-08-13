// Catálogo de unidades de medida (códigos SUNAT) + helpers para mostrarlas.
//
// Antes este array vivía como const local en Products.jsx y no se podía reusar,
// por eso otras vistas (Inventario, historial de movimientos) terminaban
// hardcodeando "und"/"uds" en vez de la unidad real del producto. Centralizado
// aquí para que cualquier pantalla traduzca el código a una etiqueta legible.

export const UNITS = [
  { value: 'NIU', label: 'Unidad' },
  { value: 'ZZ', label: 'Servicio' },
  { value: 'KGM', label: 'Kilogramo' },
  { value: 'GRM', label: 'Gramo' },
  { value: 'LTR', label: 'Litro' },
  { value: 'MTR', label: 'Metro' },
  { value: 'MTK', label: 'Metro cuadrado' },
  { value: 'MTQ', label: 'Metro cúbico' },
  { value: 'BX', label: 'Caja' },
  { value: 'DISPLAY', label: 'Display' },
  { value: 'PK', label: 'Paquete' },
  { value: 'SET', label: 'Juego' },
  { value: 'HUR', label: 'Hora' },
  { value: 'DZN', label: 'Docena' },
  { value: 'PR', label: 'Par' },
  { value: 'MIL', label: 'Millar' },
  { value: 'TNE', label: 'Tonelada' },
  { value: 'BJ', label: 'Balde' },
  { value: 'BLL', label: 'Barril' },
  { value: 'BG', label: 'Bolsa' },
  { value: 'BO', label: 'Botella' },
  { value: 'CT', label: 'Cartón' },
  { value: 'CMK', label: 'Centímetro cuadrado' },
  { value: 'CMQ', label: 'Centímetro cúbico' },
  { value: 'CMT', label: 'Centímetro' },
  { value: 'CEN', label: 'Ciento de unidades' },
  { value: 'CY', label: 'Cilindro' },
  { value: 'BE', label: 'Fardo' },
  { value: 'GLL', label: 'Galón' },
  { value: 'GLI', label: 'Galón inglés' },
  { value: 'LEF', label: 'Hoja' },
  { value: 'KTM', label: 'Kilómetro' },
  { value: 'KWH', label: 'Kilovatio hora' },
  { value: 'KT', label: 'Kit' },
  { value: 'CA', label: 'Lata' },
  { value: 'LBR', label: 'Libra' },
  { value: 'MWH', label: 'Megavatio hora' },
  { value: 'MGM', label: 'Miligramo' },
  { value: 'MLT', label: 'Mililitro' },
  { value: 'MMT', label: 'Milímetro' },
  { value: 'MMK', label: 'Milímetro cuadrado' },
  { value: 'MMQ', label: 'Milímetro cúbico' },
  { value: 'UM', label: 'Millón de unidades' },
  { value: 'ONZ', label: 'Onza' },
  { value: 'PF', label: 'Paleta' },
  { value: 'FOT', label: 'Pie' },
  { value: 'FTK', label: 'Pie cuadrado' },
  { value: 'FTQ', label: 'Pie cúbico' },
  { value: 'C62', label: 'Pieza' },
  { value: 'PG', label: 'Placa' },
  { value: 'ST', label: 'Pliego' },
  { value: 'INH', label: 'Pulgada' },
  { value: 'TU', label: 'Tubo' },
  { value: 'YRD', label: 'Yarda' },
  { value: 'QD', label: 'Cuarto de docena' },
  { value: 'HD', label: 'Media docena' },
  { value: 'JG', label: 'Jarra' },
  { value: 'JR', label: 'Frasco' },
  { value: 'CH', label: 'Envase' },
  { value: 'AV', label: 'Cápsula' },
  { value: 'SA', label: 'Saco' },
  { value: 'BT', label: 'Tornillo' },
  { value: 'U2', label: 'Tableta/Blister' },
  { value: 'DZP', label: 'Docena de paquetes' },
  { value: 'HT', label: 'Media hora' },
  { value: 'RL', label: 'Carrete' },
  { value: 'SEC', label: 'Segundo' },
  { value: 'RD', label: 'Varilla' },
]

// Mapa código → etiqueta para lookup O(1).
const UNIT_LABEL_BY_CODE = UNITS.reduce((acc, u) => {
  acc[u.value] = u.label
  return acc
}, {})

/**
 * Etiqueta legible de un código de unidad SUNAT.
 * - 'NIU' → 'Unidad', 'MTR' → 'Metro', etc.
 * - Si el código no está en el catálogo, devuelve el mismo código (algunos
 *   negocios guardan texto libre). Si viene vacío, devuelve `fallback`.
 *
 * @param {string} code  Código de unidad (ej. 'NIU').
 * @param {string} [fallback='und']  Qué devolver si no hay código.
 */
export function getUnitLabel(code, fallback = 'und') {
  if (!code) return fallback
  return UNIT_LABEL_BY_CODE[code] || code
}

// Abreviaturas para textos compactos ("49 kg", "240 und"). Mismo criterio que
// el carrito del POS; lo que no tenga abreviatura cae a la etiqueta larga.
const UNIT_SHORT_LABELS = {
  KGM: 'kg', GRM: 'g', LTR: 'lt', MTR: 'm', MTK: 'm²', MTQ: 'm³',
  NIU: 'und', ZZ: 'srv', BX: 'caja', PK: 'paq', TNE: 'ton',
  GLL: 'gal', MLT: 'ml', ONZ: 'oz', LBR: 'lb', DZN: 'doc',
}

/**
 * Abreviatura de un código de unidad SUNAT ('KGM' → 'kg', 'NIU' → 'und').
 * Sin abreviatura definida, cae a la etiqueta larga en minúsculas.
 */
export function getUnitShortLabel(code, fallback = 'und') {
  if (!code) return fallback
  return UNIT_SHORT_LABELS[code] || getUnitLabel(code, fallback).toLowerCase()
}

/**
 * Etiqueta de unidad para un item de inventario, que puede ser PRODUCTO o
 * INSUMO. Los productos guardan un código SUNAT en `unit`; los insumos guardan
 * texto libre en `purchaseUnit` (ej. 'cajas'). Resuelve el correcto según el
 * tipo de item.
 *
 * @param {object} item  Producto o insumo.
 * @param {string} [fallback='und']  Qué devolver si no hay unidad.
 */
export function getItemUnitLabel(item, fallback = 'und') {
  if (!item) return fallback
  if (item.isIngredient || item.itemType === 'ingredient') {
    return item.purchaseUnit || fallback
  }
  return getUnitLabel(item.unit, fallback)
}

/**
 * Equivalencia del stock en presentaciones: "5 × Saco x 49 kg + 5 kg".
 *
 * Un producto a granel (245 KGM con presentación "Saco x49") se entiende mejor
 * como "5 sacos" que como un número suelto de kilos. Criterio compartido entre
 * Inventario y Productos para que ambos digan lo mismo.
 *
 * - Se muestra UNA sola presentación: la de mayor factor que entre al menos una
 *   vez. Antes se listaban todas unidas con " · " y el resultado era ruido: son
 *   lecturas distintas del MISMO número, así que repetirlas no agrega nada y
 *   alarga la fila ("3 × 1/2 kg + 1 und · 1 × 1 kg + 3 und" para 7 unidades).
 *   La de mayor factor es la lectura natural: "2 cajas y sobran 73" dice más que
 *   "27 blísters y sobran 3".
 * - Se descartan las presentaciones que no entran ninguna vez. "0 × Caja + 7 und"
 *   no informa nada —es el mismo 7 que ya está al lado— y ensuciaba la lista.
 * - El sobrante se expresa en la unidad base solo si existe.
 * - Devuelve '' para insumos, productos con variantes (su stock vive en la
 *   variante, no en la base) o sin presentaciones aplicables.
 *
 * @param {object} item   Producto con `presentations[]` y `unit`.
 * @param {number} stock  Stock en unidad base sobre el que se calcula.
 */
export function formatPresentationEquivalence(item, stock) {
  if (!item || item.isIngredient || item.itemType === 'ingredient' || item.hasVariants) return ''
  const s = Number(stock)
  if (!Number.isFinite(s) || s <= 0) return ''
  const presentaciones = (Array.isArray(item.presentations) ? item.presentations : [])
    .filter(p => Number(p.factor) > 1)
  if (presentaciones.length === 0) return ''
  const base = getUnitShortLabel(item.unit)

  // De mayor a menor factor: la primera que entre al menos una vez es la que
  // mejor describe la cantidad.
  const elegida = [...presentaciones]
    .sort((a, b) => Number(b.factor) - Number(a.factor))
    .find(p => Math.floor(s / Number(p.factor)) >= 1)

  if (!elegida) return ''

  const factor = Number(elegida.factor)
  const enteras = Math.floor(s / factor)
  const sobra = Number((s - enteras * factor).toFixed(2))
  return `${enteras} × ${elegida.name}${sobra > 0 ? ` + ${sobra} ${base}` : ''}`
}
