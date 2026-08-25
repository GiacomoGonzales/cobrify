/**
 * Huellas de idempotencia para las emisiones masivas (comprobantes y guías).
 *
 * Sirven para una sola cosa: que volver a subir un Excel NO re-emita lo que ya
 * salió. La primera versión las calculaba con el nombre del archivo, la
 * cantidad de operaciones y sus números — nada de eso cambia cuando el usuario
 * CORRIGE una fila, así que un archivo arreglado se veía idéntico al anterior y
 * el lote entero se saltaba con "ya se emitió antes". Pasó en producción.
 *
 * La huella va por OPERACIÓN y sobre su CONTENIDO. Con eso:
 *  - subir el mismo archivo dos veces no duplica nada;
 *  - un lote que se cortó a la mitad se reanuda y omite solo lo ya emitido;
 *  - corregir una operación la vuelve una operación distinta y se emite,
 *    mientras las que no tocaste se siguen omitiendo.
 */

/** Huella corta y estable (djb2 en base36). No es criptográfica ni lo necesita. */
export const huellaDe = (texto) => {
  let h = 5381
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/**
 * Serializa con las claves ORDENADAS: dos objetos con los mismos datos en
 * distinto orden tienen que dar la misma huella.
 */
const estable = (valor) => {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor).sort().map((k) => `${k}:${estable(valor[k])}`).join(',')}}`
  }
  if (valor === undefined || valor === null || valor === '') return ''
  if (typeof valor === 'number') return String(Number(valor.toFixed(6)))
  return String(valor).trim()
}

/** Huella del contenido de un objeto, insensible al orden de sus claves. */
export const huellaDeContenido = (objeto) => huellaDe(estable(objeto))
