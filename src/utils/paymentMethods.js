/**
 * Métodos de pago del negocio: los de siempre, los que se ocultan y los propios.
 *
 * Antes la lista estaba escrita a mano en cada pantalla. Ahora se arma acá y
 * todos leen de la misma fuente.
 *
 * ── Por qué un método propio declara "se comporta como" ──────────────────────
 * El cierre de caja NO clasifica con una lista: tiene una VARIABLE por método
 * (`salesCash`, `salesYape`, `salesPlin`…) y un `switch` que reparte cada pago.
 * Un método que el switch no conoce no cae en ningún lado: el dinero
 * desaparecería del cierre sin error ni aviso, y aparecería después como un
 * descuadre que nadie sabe explicar.
 *
 * Por eso un método propio no es un tipo nuevo desde cero, sino una ETIQUETA
 * sobre un comportamiento que ya existe. "FISE" se muestra como FISE en el POS,
 * en el comprobante y en los reportes, pero para la caja suma donde diga
 * `behavesLike`. Además de barato, es más honesto: un vale FISE no es plata en
 * el cajón, y agruparlo con transferencias refleja lo que realmente pasa.
 */

/** Comportamientos disponibles para un método propio. */
export const PAYMENT_BEHAVIORS = [
  { id: 'cash', label: 'Efectivo', help: 'Entra al cajón. Suma al efectivo esperado del cierre de caja.' },
  { id: 'card', label: 'Tarjeta', help: 'No entra al cajón. Se agrupa con los cobros por tarjeta.' },
  { id: 'transfer', label: 'Transferencia', help: 'No entra al cajón. Se agrupa con las transferencias.' },
]

/**
 * Métodos de siempre. `permKey` es el id que ya usaban los permisos por
 * sub-usuario (`allowedPaymentMethods`); se reutiliza para ocultar, así no
 * conviven dos vocabularios para lo mismo.
 *
 * `fixed: true` = no se puede ocultar. Efectivo se queda siempre: sin ningún
 * método visible el POS no podría cobrar.
 */
export const BUILTIN_PAYMENT_METHODS = [
  { key: 'CASH', label: 'Efectivo', permKey: 'cash', behavesLike: 'cash', fixed: true },
  { key: 'CARD', label: 'Tarjeta', permKey: 'card', behavesLike: 'card' },
  { key: 'TRANSFER', label: 'Transferencia', permKey: 'transfer', behavesLike: 'transfer' },
  { key: 'YAPE', label: 'Yape', permKey: 'yape', behavesLike: 'transfer' },
  { key: 'PLIN', label: 'Plin', permKey: 'plin', behavesLike: 'transfer' },
  { key: 'RAPPI', label: 'Rappi', permKey: 'rappiPay', behavesLike: 'transfer', onlyModes: ['restaurant'] },
  { key: 'PEDIDOSYA', label: 'PedidosYa', permKey: 'pedidosYa', behavesLike: 'transfer', onlyModes: ['restaurant'] },
  { key: 'DIDIFOOD', label: 'DiDiFood', permKey: 'didifood', behavesLike: 'transfer', onlyModes: ['restaurant'] },
  { key: 'ROOM', label: 'Habitación', permKey: 'chargeToRoom', behavesLike: 'transfer', onlyModes: ['hotel'] },
]

const CUSTOM_PREFIX = 'CUSTOM_'

/**
 * Los de siempre que aplican a un modo de negocio, INCLUYENDO los ocultos.
 * Es lo que necesita Configuración para poder volver a mostrarlos.
 */
export const getBuiltinPaymentMethodsForMode = (businessMode) =>
  BUILTIN_PAYMENT_METHODS.filter(m => !m.onlyModes || m.onlyModes.includes(businessMode))

/** Los métodos propios del negocio, saneados (sin nombre = se descarta). */
export const getCustomPaymentMethods = (companySettings) =>
  (companySettings?.customPaymentMethods || [])
    .filter(m => m && String(m.name || '').trim())
    .map(m => ({
      key: `${CUSTOM_PREFIX}${m.id}`,
      // El permiso por sub-usuario usa la misma key: así un método propio se
      // puede conceder o negar igual que los de siempre, en vez de quedar
      // fuera del sistema de permisos y visible para todos a la fuerza.
      permKey: `${CUSTOM_PREFIX}${m.id}`,
      id: m.id,
      label: String(m.name).trim(),
      behavesLike: PAYMENT_BEHAVIORS.some(b => b.id === m.behavesLike) ? m.behavesLike : 'transfer',
      isCustom: true,
    }))

export const isCustomPaymentKey = (key) => String(key || '').startsWith(CUSTOM_PREFIX)

/**
 * Métodos que el POS debe ofrecer: los de siempre que no estén ocultos y
 * apliquen al modo de negocio, más los propios.
 *
 * NO aplica el filtro por sub-usuario (`allowedPaymentMethods`): eso es un
 * permiso de persona, se resuelve aparte y encima de este.
 */
export const getVisiblePaymentMethods = (companySettings, businessMode) => {
  const ocultos = new Set(companySettings?.hiddenPaymentMethods || [])
  const base = BUILTIN_PAYMENT_METHODS.filter(m => {
    if (m.onlyModes && !m.onlyModes.includes(businessMode)) return false
    if (m.fixed) return true
    return !ocultos.has(m.permKey)
  })
  return [...base, ...getCustomPaymentMethods(companySettings)]
}

/** Etiqueta que se guarda en el comprobante para una key dada. */
export const getPaymentLabel = (key, companySettings) => {
  if (!key) return ''
  if (isCustomPaymentKey(key)) {
    return getCustomPaymentMethods(companySettings).find(m => m.key === key)?.label || ''
  }
  return BUILTIN_PAYMENT_METHODS.find(m => m.key === key)?.label || ''
}

/**
 * Key a partir de la etiqueta guardada. Se usa al recargar un comprobante en el
 * POS (convertir una nota de venta, editar) para volver a marcar su método;
 * sin esto un pago con método propio se recargaba sin método seleccionado.
 */
export const getPaymentKeyByLabel = (label, companySettings) => {
  const l = String(label || '').trim()
  if (!l) return ''
  const builtin = BUILTIN_PAYMENT_METHODS.find(m => m.label === l)
  if (builtin) return builtin.key
  return getCustomPaymentMethods(companySettings).find(m => m.label === l)?.key || ''
}

/**
 * A qué balde del cierre de caja pertenece un pago, a partir de la ETIQUETA que
 * quedó guardada en el comprobante (que es lo que persiste, no la key).
 *
 * Devuelve la etiqueta del método de siempre equivalente: 'Efectivo',
 * 'Tarjeta' o 'Transferencia'. Para los de siempre devuelve su propia etiqueta,
 * así el `switch` del cierre sigue funcionando igual que antes.
 *
 * El fallback es 'Transferencia' —nunca efectivo— a propósito: si algún día
 * llega una etiqueta desconocida, es preferible que no infle el efectivo
 * esperado y provoque un arqueo que no cuadra.
 */
export const getPaymentBucketLabel = (methodLabel, companySettings) => {
  const label = String(methodLabel || '').trim()
  if (!label) return ''

  const builtin = BUILTIN_PAYMENT_METHODS.find(m => m.label === label)
  if (builtin) return label

  const propio = getCustomPaymentMethods(companySettings).find(m => m.label === label)
  if (propio) {
    return PAYMENT_BEHAVIORS.find(b => b.id === propio.behavesLike)?.label || 'Transferencia'
  }
  // Etiqueta que ya no existe (método borrado tras usarse en ventas viejas).
  return 'Transferencia'
}
