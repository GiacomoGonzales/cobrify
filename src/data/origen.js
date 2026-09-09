/**
 * El origen de cada cliente, para el navegador.
 *
 * Reexporta el archivo de `functions/` a propósito, igual que `semilla.js` y
 * `rubros.js`: una sola definición leída por los dos lados. Tener dos listas de
 * canales era pedir que un día dejaran de coincidir y los conteos no cuadraran.
 */
export {
  CANALES, NOMBRE_CANAL,
  origenDesdeLanding, origenDesdeAnuncio, origenDesdeReferido, limpiarOrigen,
} from '../../functions/src/data/origen.js'
