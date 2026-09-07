/**
 * Impresión compacta: las decisiones de qué se acorta en un ticket térmico.
 *
 * La opción "Impresión compacta (ahorro de papel)" de Configuración > Impresión
 * ya existía, pero **solo llegaba a la impresión web y al PDF**
 * (`InvoiceTicket`, `KitchenTicket`). El ticket que sale por Bluetooth se arma
 * en `blePrinterService` y nunca miró ese ajuste, así que quien imprime desde
 * el celular activaba la opción y no cambiaba nada.
 *
 * Acá viven las decisiones, separadas del envío, para poder probarlas: en un
 * ticket lo que se ahorra son LÍNEAS, y cada línea es papel.
 *
 * ---
 *
 * QUÉ NO SE TOCA, aunque ahorre papel:
 *
 * - **El avance final para cortar** (`cutFeedLines`). No es desperdicio: es lo
 *   que deja sacar el ticket sin cortar el contenido. Quien tiene guillotina lo
 *   baja desde Configuración.
 * - **El RUC, el número de documento, los totales y el desglose de IGV**: son
 *   obligatorios en un comprobante.
 * - **Los datos del cliente en una factura**: SUNAT los exige. En una boleta a
 *   "Cliente General" no hay nada que mostrar y esa sección se cae sola.
 */

/** Un separador cuesta una línea entera: en compacto se usa uno más corto. */
export function separadorDeTicket(charsPerLine, compacto) {
  const ancho = Math.max(8, Math.floor(charsPerLine))
  return '-'.repeat(compacto ? Math.max(8, Math.floor(ancho / 2)) : ancho)
}

/**
 * Fecha y hora: dos líneas sueltas o una sola.
 * @returns {string[]} las líneas a imprimir
 */
export function lineasDeFechaYHora(fecha, hora, compacto) {
  if (!compacto) return [`Fecha: ${fecha}`, `Hora: ${hora}`]
  return [`${fecha} ${hora}`]
}

/**
 * Los títulos de sección ("DATOS DEL CLIENTE", "DETALLE") cuestan una línea
 * cada uno y no dicen nada que el ticket no muestre solo.
 */
export function mostrarTitulosDeSeccion(compacto) {
  return !compacto
}

/**
 * En la cabecera, lo que se puede omitir sin que el comprobante deje de serlo.
 * El email y las redes sociales no van en un comprobante y son dos líneas.
 */
export function mostrarContactoDelNegocio(compacto) {
  return !compacto
}

/**
 * La línea de un ítem.
 *
 * Normal son DOS líneas: el nombre, y debajo "2x S/ 5.00 ... S/ 10.00".
 * En compacto se juntan en una sola **si entran**; si no entran, se vuelve a
 * partir en dos, porque un nombre cortado a la mitad no sirve de nada.
 *
 * @returns {string[]} una o dos líneas, ya alineadas al ancho del papel
 */
export function lineasDeItem({ nombre, cantidadYPrecio, total, charsPerLine, compacto }) {
  const ancho = Math.max(16, Math.floor(charsPerLine))
  const derecha = (izq, der) => {
    const hueco = ancho - izq.length - der.length
    return izq + ' '.repeat(Math.max(1, hueco)) + der
  }

  if (!compacto) return [nombre, derecha(cantidadYPrecio, total)]

  // Una sola línea: "Coca Cola 2x 5.00      S/ 10.00". Se necesita al menos un
  // espacio de separación para que no quede pegado.
  const izquierda = `${nombre} ${cantidadYPrecio}`
  if (izquierda.length + total.length + 1 <= ancho) return [derecha(izquierda, total)]
  return [nombre, derecha(cantidadYPrecio, total)]
}

/**
 * Cuántas líneas ocupa un texto en el papel, contando el corte por ancho.
 * Sirve para medir lo que se ahorra: es la unidad real de papel.
 */
export function lineasQueOcupa(texto, charsPerLine) {
  const ancho = Math.max(1, Math.floor(charsPerLine))
  return String(texto || '')
    .split('\n')
    .filter((l, i, todas) => i < todas.length - 1 || l !== '')
    .reduce((total, linea) => total + Math.max(1, Math.ceil(linea.length / ancho)), 0)
}
