/**
 * ESTADO DE AVISO DE VENCIMIENTO — 16-ago-2026.
 *
 * ÚNICA FUENTE DE VERDAD de "¿hay que avisarle, y con qué urgencia?". La usan
 * el banner del layout y las notificaciones de la campanita: si el criterio
 * viviera en los dos lados, un día el banner diría una cosa y la campanita
 * otra.
 *
 * QUÉ ARREGLA (auditoría del reporte "a algunos no les sale nada"):
 *
 *  1. ANTES NO HABÍA AVISO PREVIO. El banner solo aparecía DESPUÉS de vencer
 *     (durante las 24h de gracia) y la campanita a 1 día o menos. Ahora se
 *     avisa desde 4 días antes, escalando.
 *
 *  2. LOS CLIENTES DE RESELLER NO VEÍAN NADA. El banner dependía de
 *     `isInGracePeriod`, y para ellos ese estado NUNCA ocurre: su suscripción
 *     no tiene gracia (ver hasActiveAccess), se suspende al vencer. Pasaban de
 *     trabajar a estar bloqueados sin una sola advertencia. Acá se calcula
 *     sobre la FECHA DE VENCIMIENTO, no sobre el estado de gracia, así que les
 *     aplica igual — con el matiz de que a ellos se les avisa que NO hay
 *     margen después del corte.
 */

/** A partir de cuántos días antes se empieza a avisar. */
export const DIAS_DE_AVISO = 4

/**
 * @param {Object} subscription  doc de suscripción (currentPeriodEnd, resellerId…)
 * @param {Object} [opts]
 * @param {Date}   [opts.ahora]  para poder probarlo sin depender del reloj
 * @returns {null | {
 *   nivel: 'info'|'urgente'|'vencido',
 *   diasRestantes: number,   // 0 = vence hoy; negativo = ya venció
 *   fechaFin: Date,
 *   sinGracia: boolean,      // true en cuentas de reseller: al vencer, corta
 *   titulo: string,
 *   mensaje: string,
 * }}
 */
export const getSubscriptionWarning = (subscription, { ahora = new Date() } = {}) => {
  if (!subscription) return null
  // Una cuenta ya bloqueada o inactiva no necesita "aviso de vencimiento":
  // tiene su propia pantalla de sin acceso.
  if (subscription.accessBlocked === true) return null
  if (subscription.status !== 'active') return null

  const fin = subscription.currentPeriodEnd?.toDate?.() || subscription.currentPeriodEnd
  if (!fin) return null
  const fechaFin = new Date(fin)
  if (isNaN(fechaFin.getTime())) return null

  // Días entre HOY y el vencimiento, contados por día calendario y no por
  // horas: si vence hoy a las 23:00, el usuario tiene que leer "vence hoy",
  // no "vence en 0.4 días".
  const aDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diasRestantes = Math.round((aDia(fechaFin) - aDia(ahora)) / 86400000)

  if (diasRestantes > DIAS_DE_AVISO) return null

  const sinGracia = !!subscription.resellerId
  const fechaTexto = fechaFin.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })

  if (diasRestantes < 0) {
    return {
      nivel: 'vencido',
      diasRestantes,
      fechaFin,
      sinGracia,
      titulo: 'Tu suscripción venció',
      mensaje: sinGracia
        ? `Tu suscripción venció el ${fechaTexto} y el servicio está suspendido. Renueva para reactivarlo.`
        : `Tu suscripción venció el ${fechaTexto}. Renueva hoy para no perder el acceso.`,
    }
  }

  if (diasRestantes <= 1) {
    const cuando = diasRestantes === 0 ? 'HOY' : 'MAÑANA'
    return {
      nivel: 'urgente',
      diasRestantes,
      fechaFin,
      sinGracia,
      titulo: `Tu suscripción vence ${cuando.toLowerCase()}`,
      mensaje: sinGracia
        // Sin gracia: el corte es inmediato y hay que decirlo sin rodeos.
        ? `Tu suscripción vence ${cuando.toLowerCase()} (${fechaTexto}). Al vencer, el servicio se suspende de inmediato: renueva antes para no quedarte sin sistema.`
        : `Tu suscripción vence ${cuando.toLowerCase()} (${fechaTexto}). Renueva ahora para no interrumpir tus ventas.`,
    }
  }

  return {
    nivel: 'info',
    diasRestantes,
    fechaFin,
    sinGracia,
    titulo: `Tu suscripción vence en ${diasRestantes} días`,
    mensaje: `Tu suscripción vence el ${fechaTexto} (en ${diasRestantes} días). Renueva con tiempo para no interrumpir tus ventas.`,
  }
}

/** Colores del banner según urgencia. Ámbar informa; rojo interrumpe. */
export const ESTILO_AVISO = {
  info: 'bg-amber-500',
  urgente: 'bg-red-600',
  vencido: 'bg-red-700',
}
