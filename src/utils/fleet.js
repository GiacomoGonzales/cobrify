/**
 * Criterios de CONDUCTORES Y VEHÍCULOS que no tocan la base.
 *
 * Viven aparte del servicio (src/services/fleetService.js) porque los usa la
 * pantalla para pintar los avisos, y acá se pueden probar sin arrastrar
 * Firebase.
 *
 * Los vencimientos —licencia del conductor, TUCE del vehículo— no viajan al
 * XML de SUNAT: son para el negocio. Emitir una guía con la licencia vencida
 * es un problema que se descubre tarde, cuando el vehículo ya está en la
 * carretera y alguien lo para.
 */

/** Una fecha (Date) como 'YYYY-MM-DD' en la zona de quien mira. */
const comoDia = (fecha) => {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  if (isNaN(d.getTime())) return null
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** ¿Ya venció? Sin fecha = no se sabe, y no se inventa un problema. */
export const estaVencido = (fecha, hoy = new Date()) => {
  if (!fecha) return false
  const limite = String(fecha).slice(0, 10)
  const hoyDia = comoDia(hoy)
  if (!hoyDia || !/^\d{4}-\d{2}-\d{2}$/.test(limite)) return false
  // El mismo día NO está vencido: la licencia vale hasta el final de su fecha.
  return limite < hoyDia
}

/** ¿Vence dentro de los próximos `dias`? (y todavía no venció) */
export const vencePronto = (fecha, dias = 30, hoy = new Date()) => {
  if (!fecha || estaVencido(fecha, hoy)) return false
  const limite = String(fecha).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limite)) return false
  const tope = comoDia(new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000))
  return limite <= tope
}

/**
 * El aviso que corresponde a un vencimiento, o null si no hay nada que decir.
 * Un solo criterio para la licencia y para la TUCE.
 */
export const avisoDeVencimiento = (fecha, { que = 'El documento', dias = 30, hoy = new Date() } = {}) => {
  if (estaVencido(fecha, hoy)) return { tono: 'vencido', texto: `${que} está vencida` }
  if (vencePronto(fecha, dias, hoy)) return { tono: 'porVencer', texto: `${que} vence pronto` }
  return null
}

/** El nombre completo del conductor, para listas y selectores. */
export const nombreDeConductor = (d) =>
  [d?.name, d?.lastName].map((x) => String(x || '').trim()).filter(Boolean).join(' ') || 'Sin nombre'

/** Cómo se lee un vehículo en una lista: "Bus 1 · ABC123" o solo la placa. */
export const nombreDeVehiculo = (v) => {
  const placa = String(v?.plate || '').trim()
  const alias = String(v?.nickname || '').trim()
  if (alias && placa) return `${alias} · ${placa}`
  return alias || placa || 'Sin placa'
}
