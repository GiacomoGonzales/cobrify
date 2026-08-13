/**
 * Preguntas sobre el RUBRO del negocio que se responden igual en varias
 * pantallas.
 *
 * La idea es no repartir `businessMode === 'x' || businessMode === 'y'` por el
 * código: cuando ese criterio queda copiado, tarde o temprano una pantalla se
 * actualiza y la otra no, y el usuario ve la función a medias.
 */

/**
 * ¿Este rubro maneja fichas de MEDICAMENTO?
 *
 * Farmacia y veterinaria venden lo mismo desde el punto de vista del producto:
 * principio activo, concentración, laboratorio, registro sanitario, condición de
 * venta y control de lotes con vencimiento. Cambia a quién se le vende, no lo
 * que se registra.
 *
 * Este criterio ya vivía suelto dentro del modal de importación —que arma la
 * plantilla "de medicamentos" para los dos rubros— mientras el FORMULARIO de
 * producto solo lo aplicaba a farmacia. Resultado: un veterinario descargaba una
 * plantilla con columnas de medicamento que su ficha de producto no tenía dónde
 * mostrar, así que esos datos solo podían cargarse importando.
 *
 * @param {string} businessMode
 * @returns {boolean}
 */
export const isPharmaLikeMode = (businessMode) =>
  businessMode === 'pharmacy' || businessMode === 'veterinary'
