// El criterio de "cuánto le queda por acreditar a una factura" vive en
// functions/src/utils/notasDeCredito.js: lo aplican esta pantalla y el
// servidor antes de firmar, y las functions no pueden importar de src.
export * from '../../functions/src/utils/notasDeCredito.js'
