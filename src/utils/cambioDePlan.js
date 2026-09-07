/**
 * Subir de plan a mitad de ciclo, pagando solo la diferencia.
 *
 * Es una operación distinta de la renovación, y confundirlas sale caro. Si un
 * pago de S/ 10 se registra como renovación del plan nuevo:
 *
 *   - se le suma un MES ENTERO al vencimiento, por S/ 10;
 *   - **`renewalPrice` queda en 10**, así que la próxima renovación le cobra
 *     S/ 10 en vez del precio del plan — y eso no se nota hasta que pasa;
 *   - se le reinicia el contador de comprobantes a mitad de ciclo;
 *   - se le mueve el día de corte.
 *
 * En un cambio de plan no se paga tiempo, se paga una mejora: el vencimiento y
 * el día de corte no se tocan, y lo que se congela como precio de renovación es
 * **el precio del plan nuevo**, no lo que entregó de diferencia.
 *
 * El contador de comprobantes tampoco se reinicia (decisión de Giacomo): pagó
 * por un tope más alto, no por borrar lo que ya consumió. Si iba 80 de 100 y
 * pasa a 500, queda 80 de 500 y vuelve a cero en su día de corte de siempre.
 */

/**
 * Lo que se sugiere cobrar: la diferencia entre los dos planes.
 *
 * Es una sugerencia editable — el monto real lo negocia el admin. Si el plan
 * nuevo es más barato devuelve 0: un cambio a la baja no se cobra.
 */
export function diferenciaSugerida({ planActual, planNuevo, precioPactado = null }) {
  const precioDe = (p) => Number(p?.totalPrice ?? p?.price ?? 0) || 0
  // Lo que hoy paga de verdad: el pactado manda sobre el del catálogo, porque
  // hay clientes antiguos con precio congelado.
  const actual = precioPactado != null ? Number(precioPactado) || 0 : precioDe(planActual)
  const nuevo = precioDe(planNuevo)
  return Math.max(0, Number((nuevo - actual).toFixed(2)))
}

/**
 * ¿Se puede registrar este cambio de plan?
 *
 * @returns {{puede: boolean, motivo: string|null}}
 */
export function validarCambioDePlan({ planActualId, planNuevoId, planNuevoConfig }) {
  if (!planNuevoConfig) {
    return { puede: false, motivo: `Plan no válido: ${planNuevoId}` }
  }
  if (planNuevoConfig.isAddon) {
    return { puede: false, motivo: 'Un paquete adicional no es un cambio de plan: se registra como add-on.' }
  }
  if (planNuevoId === planActualId) {
    return { puede: false, motivo: 'Es el mismo plan que ya tiene. Para extender el período, registra una renovación.' }
  }
  return { puede: true, motivo: null }
}

/**
 * El registro que va al historial de pagos.
 *
 * Deja escrito de dónde a dónde fue el cambio: sin eso, en el historial queda
 * un pago de S/ 10 contra un plan de S/ 39.90 y nadie entiende qué pasó.
 */
export function registroDeCambioDePlan({ monto, metodo, planActualId, planNuevoId, planNuevoConfig, fecha, igvInfo = null }) {
  return {
    date: fecha,
    amount: monto,
    method: metodo,
    plan: planNuevoId,
    planName: planNuevoConfig?.name || planNuevoId,
    // Marca el tipo de operación: no es una renovación, no suma tiempo.
    tipo: 'cambio_de_plan',
    planAnterior: planActualId || null,
    months: 0,
    status: 'completed',
    registeredBy: 'admin',
    ...(igvInfo ? {
      includesIgv: true,
      baseAmount: igvInfo.baseAmount ?? null,
      igvAmount: igvInfo.igvAmount ?? null,
    } : {}),
  }
}
