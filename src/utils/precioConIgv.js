/**
 * PRECIOS DE COBRIFY, SIN Y CON IGV.
 *
 * Lo que se publica es SIN IGV. Con IGV es lo que paga quien pide factura, y se
 * publica redondeado a 10 céntimos (19.90 da 23.48, pero lo publicado es 23.50):
 * ver el comentario de `functions/src/data/planes.js`. La página /precios y Mi
 * Suscripción muestran los dos.
 */

/** × 1.18 redondeado a 10 céntimos, como los precios publicados. */
export const conIgvPublicado = (sinIgv) => Math.round(Number(sinIgv) * 11.8) / 10

/**
 * Separa un precio pactado (`renewalPrice`) en sin y con IGV.
 *
 * El pactado a veces quedó guardado CON IGV: la casilla "Agregar IGV" del panel
 * congela lo cobrado (19.90 × 1.18 = 23.48), y hay altas registradas al precio
 * publicado con IGV (23.50). Se lo reconoce porque coincide con uno de los
 * precios sin IGV que existen × 1.18, exacto o redondeado. Si no coincide con
 * ninguno, es sin IGV, como todo lo publicado.
 *
 * @param {number} monto
 * @param {number[]} bases  los precios sin IGV que existen o existieron
 * @returns {{sinIgv: number, conIgv: number}}
 */
export function desglosarIgv(monto, bases = []) {
  const m = Number(monto)
  if (!(m > 0)) return { sinIgv: 0, conIgv: 0 }
  for (const b of bases) {
    if (!(b > 0)) continue
    const exacto = Math.round(b * 118) / 100
    if (Math.abs(m - exacto) < 0.005 || Math.abs(m - conIgvPublicado(b)) < 0.005) {
      return { sinIgv: b, conIgv: m }
    }
  }
  return { sinIgv: m, conIgv: conIgvPublicado(m) }
}
