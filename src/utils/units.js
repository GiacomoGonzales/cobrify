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
