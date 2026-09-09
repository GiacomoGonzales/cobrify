/**
 * ¿La marcación de asistencia se hizo dentro de la zona configurada?
 *
 * La regla que importa: **no saber dónde está alguien NO es lo mismo que saber
 * que está dentro**. Hasta el 8-set-2026 el servicio arrancaba en "válido" y
 * solo lo bajaba si conseguía una ubicación y quedaba lejos. Si el teléfono no
 * daba ubicación —permiso denegado, sin señal, el navegador la bloquea— la
 * marcación se aprobaba sola desde cualquier lugar. Un cliente (Braineer,
 * Arequipa) marcó a kilómetros de su local y le salió "Aprobado": sus cuatro
 * marcaciones de ese día llegaron sin ubicación.
 *
 * Con un geofence configurado, la falta de ubicación deja la marcación
 * PENDIENTE de aprobación. No se rechaza: perder un fichaje real de alguien que
 * sí fue a trabajar es peor que darle una revisión al encargado.
 *
 * Un negocio que no configuró zona sigue igual: no hay nada que validar.
 */

const RADIO_TIERRA_M = 6371000
const rad = (g) => (g * Math.PI) / 180

/** Distancia en metros entre dos coordenadas (Haversine). */
export function distanciaEnMetros(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(RADIO_TIERRA_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

/** ¿La sucursal exige estar en una zona? */
export function tieneGeofence(attendance) {
  const a = attendance || {}
  return Number.isFinite(Number(a.gpsLat)) &&
    Number.isFinite(Number(a.gpsLng)) &&
    Number(a.gpsRadius) > 0
}

/** ¿La lectura del GPS sirve? */
export function hayUbicacion(gps) {
  return Number.isFinite(Number(gps?.lat)) && Number.isFinite(Number(gps?.lng))
}

/**
 * @returns {{ valido: boolean, motivo: string, distancia: number|null }}
 *   motivo: 'sin_geofence' | 'dentro' | 'fuera' | 'sin_ubicacion'
 */
export function validarUbicacion(attendance, gps) {
  if (!tieneGeofence(attendance)) {
    return { valido: true, motivo: 'sin_geofence', distancia: null }
  }
  if (!hayUbicacion(gps)) {
    // El caso del reporte: sin esto, marcaba aprobado desde cualquier lado.
    return { valido: false, motivo: 'sin_ubicacion', distancia: null }
  }
  const distancia = distanciaEnMetros(
    Number(attendance.gpsLat), Number(attendance.gpsLng),
    Number(gps.lat), Number(gps.lng),
  )
  const dentro = distancia <= Number(attendance.gpsRadius)
  return { valido: dentro, motivo: dentro ? 'dentro' : 'fuera', distancia }
}

/**
 * Cómo se llama esto en pantalla y en el Excel. Un solo texto para los tres
 * lugares donde aparece: el aviso al marcar, la etiqueta del historial y la
 * columna exportada.
 */
export function etiquetaDeUbicacion(registro) {
  const r = registro || {}
  if (r.gpsMotivo === 'sin_ubicacion') return 'Sin ubicación'
  if (r.gpsMotivo === 'sin_geofence') return 'Sin zona configurada'
  if (r.gpsValid === false) return 'Fuera de zona'
  return 'Dentro de zona'
}

/** El aviso que se le muestra a quien acaba de marcar. */
export function avisoDeMarcacion(motivo) {
  if (motivo === 'sin_ubicacion') {
    return 'No pudimos leer tu ubicación, así que queda pendiente de aprobación. Activa el permiso de ubicación en tu teléfono y vuelve a marcar.'
  }
  if (motivo === 'fuera') {
    return 'Estás fuera de la zona configurada, así que queda pendiente de aprobación.'
  }
  return ''
}
