/**
 * CUANDO LE TOCA A UNA SUSCRIPCION VOLVER A CERO.
 *
 * El limite de comprobantes NO va por mes calendario: va por mes desde el alta.
 * Quien se dio de alta un dia 5 vuelve a cero cada dia 5.
 *
 * Lo que hacia antes era comparar el dia de corte con el dia de hoy, exacto:
 *
 *     if (periodStartDay === dayOfMonth) { resetear }
 *
 * y eso falla cuando el dia de corte NO EXISTE en el mes. Al 6-set-2026 habia
 * **16 suscripciones con corte el dia 31**: en abril, junio, septiembre y
 * noviembre —y en febrero— ese dia no llega nunca, asi que no se reseteaban y
 * arrastraban el contador al mes siguiente. Otras 32 con corte 29 o 30 se
 * saltaban febrero. Y **34 clientes de intermediarios no se reseteaban jamas**
 * porque guardan la fecha en `startDate`, no en `currentPeriodStart`: una
 * llevaba ocho meses sumando.
 *
 * Ahora el criterio es "¿ya paso el corte y todavia no se reseteo?", que ademas
 * hace el reseteo AUTO-REPARABLE: si la tarea no corre un dia (o falla), al dia
 * siguiente lo detecta y lo hace igual. Antes, un dia perdido era un mes perdido.
 */

/** Cuantos dias tiene el mes de esa fecha (en UTC). */
export function diasDelMes(fecha) {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).getUTCDate()
}

/**
 * La fecha en la que arranco el ciclo de esta suscripcion.
 *
 * `currentPeriodStart` es lo normal; `startDate` lo usan los clientes dados de
 * alta por un intermediario, y `createdAt` queda de ultimo recurso. Mirar solo
 * el primero era lo que dejaba fuera a los clientes de intermediarios.
 */
export function inicioDeCiclo(suscripcion) {
  for (const campo of ['currentPeriodStart', 'startDate', 'createdAt']) {
    const valor = suscripcion?.[campo]
    if (!valor) continue
    const fecha = valor?.toDate ? valor.toDate() : new Date(valor)
    if (!isNaN(fecha?.getTime?.())) return fecha
  }
  return null
}

/**
 * El corte mas reciente que YA ocurrio, contando desde `hoy` hacia atras.
 *
 * Si el dia de corte no existe en el mes (un 31 en septiembre), cae en el
 * ultimo dia del mes: el cliente no pierde su reseteo por vivir en un mes corto.
 */
export function ultimoCorte(hoy, diaCorte) {
  const corteDelMes = (anio, mes) => {
    const dias = diasDelMes(new Date(Date.UTC(anio, mes, 1)))
    return new Date(Date.UTC(anio, mes, Math.min(diaCorte, dias)))
  }
  const esteMes = corteDelMes(hoy.getUTCFullYear(), hoy.getUTCMonth())
  if (esteMes <= hoy) return esteMes
  return corteDelMes(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1)
}

/**
 * ¿Hay que poner el contador de esta suscripcion en cero?
 *
 * @param {Object} suscripcion - El documento de `subscriptions`
 * @param {Date} hoy - Momento de la corrida (la tarea usa la medianoche de Peru)
 * @returns {{resetear: boolean, corte: Date|null, motivo: string}}
 */
export function tocaResetear(suscripcion, hoy) {
  const inicio = inicioDeCiclo(suscripcion)
  if (!inicio) return { resetear: false, corte: null, motivo: 'sin fecha de inicio' }

  const corte = ultimoCorte(hoy, inicio.getUTCDate())
  const crudo = suscripcion?.lastCounterReset
  const ultimo = crudo ? (crudo.toDate ? crudo.toDate() : new Date(crudo)) : null
  const hayUltimo = !!ultimo && !isNaN(ultimo.getTime())
  // Una RENOVACION mueve el inicio del ciclo hacia adelante. Si el ultimo
  // reseteo es anterior a ese inicio, el contador viene del periodo anterior y
  // hay que ponerlo en cero sin esperar al proximo corte. Antes del 6-set-2026
  // registrar un pago no reseteaba, y la guarda de abajo tomaba la renovacion
  // por un alta: 160 cuentas quedaron arrastrando el cupo un mes entero, y una
  // (MAMANI, 140/100) con la emision a SUNAT bloqueada por un cupo que no era.
  if (hayUltimo && ultimo < inicio) {
    return { resetear: true, corte, motivo: 'el ciclo se renovo despues del ultimo reseteo' }
  }
  // Un corte anterior al alta no es un corte de esta suscripcion. Sin esto, a
  // quien se da de alta un dia 20 se le borraria el contador el mismo dia.
  if (corte <= inicio) return { resetear: false, corte, motivo: 'el ciclo todavia no cumple un mes' }
  if (hayUltimo && ultimo >= corte) {
    return { resetear: false, corte, motivo: 'ya se reseteo en este ciclo' }
  }

  return {
    resetear: true,
    corte,
    motivo: ultimo ? 'el corte ya paso y el contador viene del ciclo anterior' : 'nunca se habia reseteado',
  }
}
