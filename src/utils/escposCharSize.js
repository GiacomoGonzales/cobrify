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
 * El comando `GS ! n` listo para mandar. Solo escala el ALTO: el ancho queda
 * en x1 para no romper la alineación por columnas del papel de 58/80 mm.
 */
export function comandoDeTamano(escala, big) {
  return new Uint8Array([0x1D, 0x21, altoDeLinea(escala, big)])
}
