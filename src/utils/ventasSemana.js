/**
 * "VENTAS DE LOS ÚLTIMOS 7 DÍAS, COMPARADO CON LA SEMANA ANTERIOR" — el cálculo.
 *
 * Existe porque el gráfico dejó de funcionar sin que nadie lo notara
 * (reporte de Foody, 8-set-2026): desde que el mes lo resuelve el servidor
 * (27-ago) el Dashboard ya no descargaba los 13 días previos, y el gráfico,
 * que sumaba las facturas en memoria, se quedó con ayer y hoy. La semana
 * anterior salía en cero todos los días; esta semana, en cero salvo dos.
 *
 * Ahora el gráfico no depende de qué haya en memoria: recibe una función
 * `totalPorFecha('YYYY-MM-DD')`, y quien la provea decide de dónde sale —la
 * serie diaria que devuelve el servidor, o las facturas descargadas cuando la
 * agregación no aplica (multi-divisa, usuario limitado, sede elegida).
 *
 * Todos los días se cuentan en hora de Perú, que no tiene horario de verano:
 * por eso restar 24 horas es restar un día.
 */

const DIA_MS = 24 * 60 * 60 * 1000
const NOMBRES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** Una fecha -> 'YYYY-MM-DD' en hora de Perú (la clave que usa todo el sistema). */
export const claveDia = (fecha) => new Date(fecha).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

/** El inicio del día N días antes de `inicioDeHoy`. */
export const diasAtras = (inicioDeHoy, n) => new Date(inicioDeHoy.getTime() - n * DIA_MS)

/**
 * Suma de facturas por día, para cuando no hay serie del servidor.
 *
 * @param {Array} facturas
 * @param {{ fechaDe: Function, totalDe: Function, desde: Date, hasta: Date }} o
 *   fechaDe(f) -> Date | null; totalDe(f) -> número; el rango es inclusivo.
 * @returns {Object} { 'YYYY-MM-DD': total }
 */
export function mapaPorDia(facturas, { fechaDe, totalDe, desde, hasta }) {
  const mapa = {}
  for (const f of facturas || []) {
    const fecha = fechaDe(f)
    if (!fecha || fecha < desde || fecha > hasta) continue
    const k = claveDia(fecha)
    mapa[k] = (mapa[k] || 0) + (Number(totalDe(f)) || 0)
  }
  return mapa
}

/**
 * Los 7 días hasta hoy, cada uno con su venta y la del mismo día de la semana
 * anterior (exactamente 7 días antes: lunes contra lunes).
 *
 * @param {{ totalPorFecha: Function, inicioDeHoy: Date }} o
 * @returns {Array<{ name, fecha, fechaAnterior, ventas, ventasAnterior }>}
 */
export function serieUltimos7Dias({ totalPorFecha, inicioDeHoy }) {
  const filas = []
  for (let i = 6; i >= 0; i--) {
    const dia = diasAtras(inicioDeHoy, i)
    const anterior = diasAtras(inicioDeHoy, i + 7)
    const fecha = claveDia(dia)
    const fechaAnterior = claveDia(anterior)
    filas.push({
      name: NOMBRES[dia.getDay()],
      fecha,
      fechaAnterior,
      ventas: Number(totalPorFecha(fecha)) || 0,
      ventasAnterior: Number(totalPorFecha(fechaAnterior)) || 0,
    })
  }
  return filas
}
