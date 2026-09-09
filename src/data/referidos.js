/**
 * El programa de referidos, para el navegador.
 *
 * Reexporta el archivo de `functions/`, igual que la semilla y el origen: los
 * meses de regalo se deciden en UN solo sitio. Tener la tabla repetida en el
 * servidor y en la pantalla es como se termina prometiendo dos meses y
 * regalando uno.
 */
export {
  MESES_DE_REGALO, MESES_PARA_QUIEN_REFIERE, TOPE_DE_MESES,
  aplicaAlPrograma, mesesDeRegalo, mesesTotales, textoDelRegalo,
} from '../../functions/src/data/referidos.js'
