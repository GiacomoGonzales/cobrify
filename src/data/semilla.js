/**
 * Cómo nace una cuenta nueva. La fuente de verdad es UN solo archivo, el del
 * servidor (`functions/src/data/semilla.js`), igual que con los rubros: así la
 * semilla que escribe el servidor y lo que muestra la web nunca se separan.
 *
 * Cambiar cómo nace una cuenta se hace allá, no aquí.
 */
export {
  OPCIONES_SEMILLA,
  VALORES_SEMILLA,
  SERIES_NEGOCIO,
  SUNAT_SEMILLA,
  seriesDeSucursal,
  opcionesDelRubro,
  modoDelRubro,
} from '../../functions/src/data/semilla.js'
