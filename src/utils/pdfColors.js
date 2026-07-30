/**
 * Helpers de color compartidos por los generadores de PDF.
 *
 * El color de acento lo elige cada negocio en Configuración > Documentos, y se
 * usa como FONDO de encabezados, del recuadro del RUC y de la fila TOTAL. El
 * texto encima era siempre blanco, así que quien elegía un acento claro
 * (amarillo, celeste, beige) terminaba con esas zonas ilegibles.
 */

/**
 * Devuelve el color de texto legible sobre un fondo dado:
 * negro si el fondo es claro, blanco si es oscuro.
 *
 * Usa la luminancia relativa de la WCAG, no el promedio simple de los canales:
 * el ojo percibe el verde mucho más que el azul, y un promedio plano trataría
 * al amarillo (#FFD700) como oscuro cuando es de los colores más claros que
 * existen. El umbral 0.5 es donde el contraste contra blanco y contra negro
 * se equipara.
 *
 * @param {number[]} rgb - [r, g, b] de 0 a 255
 * @returns {number[]} [0,0,0] o [255,255,255]
 */
export const contrastTextColor = (rgb) => {
  const [r, g, b] = rgb || []
  if (![r, g, b].every(c => Number.isFinite(c))) return [255, 255, 255]
  // Linealizar cada canal (sRGB → lineal) antes de ponderar
  const toLinear = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance > 0.5 ? [0, 0, 0] : [255, 255, 255]
}
