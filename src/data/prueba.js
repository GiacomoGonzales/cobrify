/**
 * El criterio de "esto es una prueba", para el navegador.
 *
 * Reexporta el de `functions/`, igual que la semilla, los planes y los
 * referidos: el servidor y la pantalla tienen que estar de acuerdo en esto,
 * porque el servidor bloquea y la pantalla avisa.
 */
export {
  DIAS_DE_PRUEBA, esPrueba, puedeEnviarASunat, LEYENDA_SIN_VALIDEZ,
} from '../../functions/src/data/prueba.js'
