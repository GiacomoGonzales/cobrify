/**
 * Alto de letra de una línea de comanda, en la escala de ESC/POS.
 *
 * La comanda se imprime por cuatro caminos distintos (WiFi, estación,
 * Bluetooth clásico y BLE/iOS) y cada uno tenía su propia idea de cómo aplicar
 * el tamaño configurado. El de WiFi lo perdía entero: la letra grande de la
 * comanda no se veía por red aunque la opción estuviera puesta.
 *
 * El detalle que lo causa: en ESC/POS, `ESC ! n` y `GS ! n` escriben el MISMO
 * registro de tamaño de carácter. Un `ESC ! 0` para "quitar el negrita/doble
 * alto de esta línea" borra también el `GS ! n` del tamaño base. Por eso el
 * tamaño no se pone una vez al principio: se recompone en CADA línea, con un
 * solo comando que ya trae todo.
 */

/**
 * @param {number} escala  tamaño elegido para la comanda (0 = normal, 1 = alto
 *                         x2, 2 = x3, 3 = x4)
 * @param {boolean} big    si la línea pide doble alto por sí misma (títulos)
 * @returns {number} nibble de alto para `GS ! n`
 */
export function altoDeLinea(escala, big) {
  // El mayor de los dos, no la suma: una línea que ya pedía doble alto no debe
  // crecer otra vez sobre una comanda configurada en grande.
  return Math.max(Number(escala) || 0, big ? 1 : 0) & 0x07
}

/**
 * Ancho de letra de una línea de comanda.
 *
 * El ticket de VENTA escala solo el alto, porque tiene columnas: el nombre a
 * la izquierda y el importe a la derecha, y al ensanchar la letra se desarman.
 * La comanda no tiene ese problema —no lleva precios ni columnas, es una lista
 * que se lee de lejos y apurado— y dejarla en ancho x1 la volvía alta y
 * flaca: eso es lo que se veía poco legible por WiFi y Bluetooth por más que
 * se subiera el tamaño.
 *
 * Dos límites a propósito:
 *  - Solo ensancha si el usuario ELIGIÓ un tamaño mayor. En "Normal" queda
 *    todo igual que siempre, incluidos los títulos de doble alto.
 *  - Nunca pasa de x2. En 58 mm el ancho x3 deja 8 caracteres por línea y el
 *    nombre de cualquier plato se parte en tres pedazos.
 */
export function anchoDeLinea(escala, big) {
  if ((Number(escala) || 0) <= 0) return 0
  return Math.min(altoDeLinea(escala, big), 1)
}

/** Cuántas veces más ancha sale la letra: 1 (normal) o 2. */
export function factorDeAncho(escala) {
  return anchoDeLinea(escala, false) + 1
}

/**
 * El byte de `GS ! n`: nibble alto = ancho-1, nibble bajo = alto-1.
 *
 * El ALTO crece en todas las líneas, como siempre. El ANCHO solo en las que lo
 * piden (`ensanchar`): el nombre del plato, sus modificadores y los títulos
 * —lo que la cocina lee de lejos—. Los datos del pedido (número, hora,
 * cliente, dirección) se quedan en ancho normal porque son largos: en 58 mm el
 * ancho doble deja 12 caracteres por línea y una dirección se parte en cuatro.
 */
export function nibbleDeTamano(escala, big, ensanchar = false) {
  const ancho = ensanchar ? anchoDeLinea(escala, big) : 0
  return ((ancho & 0x07) << 4) | (altoDeLinea(escala, big) & 0x07)
}

/** El comando `GS ! n` listo para mandar. */
export function comandoDeTamano(escala, big, ensanchar = false) {
  return new Uint8Array([0x1D, 0x21, nibbleDeTamano(escala, big, ensanchar)])
}
