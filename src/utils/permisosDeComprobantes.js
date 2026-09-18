/**
 * QUÉ PUEDE HACER un sub-usuario con un comprobante YA EMITIDO — y, con la
 * misma regla, con el stock y los precios del POS (ACCIONES_DE_OPERACION).
 *
 * Emitir lo emite cualquiera que tenga el POS. Lo que preocupa al dueño es lo
 * que viene después: que el cajero abra una venta de ayer y la cambie, que
 * anule una factura aceptada por SUNAT, o que saque otra copia de un
 * comprobante. Un cliente lo pidió con estas palabras (ACEROS RAMOS,
 * 9-set-2026): "ese acceso de anular quisiera que solo yo pueda tenerlo". Y el
 * 14-set la misma dueña pidió que sus vendedoras no puedan reimprimir tickets
 * ni PDFs, ni cambiar cómo se pagó una venta.
 *
 * Son acciones distintas y se manejan por separado, porque no son la misma
 * preocupación:
 *   - editar: corregir una venta ya hecha (cambia importes, stock y caja).
 *   - anular: dar de baja o eliminar una venta ya hecha.
 *   - reimprimir: volver a imprimir el ticket, sacar el PDF o mandarlo por
 *     WhatsApp desde Ventas. El ticket de la venta que acaba de hacer en el POS
 *     sale igual: eso es vender, no reimprimir.
 *   - cambiarPago: cambiar el método (Efectivo, Yape...) o el estado de pago de
 *     una venta ya hecha, desde Ver detalles. Mueve la caja: pasar un efectivo a
 *     Yape cambia lo que tiene que haber en el cajón. Cobrar un saldo pendiente
 *     sigue permitido: eso es cobrar, no cambiar.
 *
 * Hay negocios donde el encargado sí corrige notas de venta todo el día pero
 * nadie más que el dueño anula, y al revés.
 *
 * POR DEFECTO TODAS ESTÁN PERMITIDAS. Es una restricción que el dueño ENCIENDE,
 * no un permiso que tenga que repartir: los sub-usuarios que ya existen no
 * tienen el campo y siguen trabajando exactamente igual que ayer. Es la
 * diferencia con `dataPermissions`, que hereda de una opción del negocio.
 *
 * El dueño y el admin nunca están restringidos.
 */

/** Las acciones, con su etiqueta y su explicación para la ficha del usuario. */
export const ACCIONES_DE_COMPROBANTES = [
  {
    id: 'editar',
    label: 'Editar comprobantes emitidos',
    siPuede: 'Puede abrir una venta ya emitida y corregirla.',
    noPuede: 'No le aparece "Editar documento" en Ventas. Sigue pudiendo vender.',
  },
  {
    id: 'anular',
    label: 'Anular comprobantes emitidos',
    siPuede: 'Puede anular y eliminar ventas ya emitidas.',
    noPuede: 'No le aparecen "Anular" ni "Eliminar" en Ventas. Sigue pudiendo vender.',
  },
  {
    id: 'reimprimir',
    label: 'Reimprimir comprobantes',
    siPuede: 'Puede volver a imprimir el ticket, sacar el PDF o mandarlo por WhatsApp desde Ventas.',
    noPuede: 'No le aparecen "Imprimir ticket", el PDF ni WhatsApp en Ventas. El ticket de la venta que acaba de hacer en el POS sí sale.',
  },
  {
    id: 'cambiarPago',
    label: 'Cambiar el pago de una venta',
    siPuede: 'Puede cambiar el método de pago (Efectivo, Yape...) y el estado de pago de una venta ya hecha.',
    noPuede: 'Ve cómo se pagó la venta, pero no lo puede cambiar. Sigue pudiendo vender y cobrar saldos pendientes.',
  },
]

/**
 * Dos acciones más, FUERA de Ventas, con la MISMA regla (permitidas salvo que
 * el dueño las apague; el dueño nunca restringido) y guardadas en el mismo
 * mapa del usuario. Pedido de GLOBAL TELEAUDIO (18-set-2026): "que en ambos
 * casos solo nosotros (usuario principal) podamos tener acceso a editar
 * inventario y descuentos". "Ocultar descuentos en POS" ya existía, pero con
 * "Permitir modificar precio" encendido el cajero bajaba el precio igual; y el
 * stock se tocaba sin comprobante desde Productos e Inventario.
 *
 * `donde` dice en qué parte de la ficha del usuario se muestra cada una.
 */
export const ACCIONES_DE_OPERACION = [
  {
    id: 'modificarStock',
    donde: 'inventario',
    label: 'Modificar el stock',
    siPuede: 'Puede cargar stock inicial, importar productos y, en Inventario, hacer recuentos, consumo interno, mermas, producción y traslados.',
    noPuede: 'Ve el stock pero no lo toca: los productos que crea nacen en 0, no puede importar y en Inventario no le aparecen esas opciones. Vender y comprar siguen moviendo el stock.',
  },
  {
    id: 'cambiarPrecios',
    donde: 'pos',
    label: 'Cambiar precios en el POS',
    siPuede: 'Puede modificar el precio de un producto en el carrito (si el negocio lo permite).',
    noPuede: 'Vende a los precios de la lista: no puede tocar el precio en el carrito.',
  },
]

export const IDS_DE_ACCIONES = [...ACCIONES_DE_COMPROBANTES, ...ACCIONES_DE_OPERACION].map((a) => a.id)

/** Lo que puede el dueño, y también el default de quien no tiene nada guardado. */
export const ACCIONES_COMPLETAS = Object.fromEntries(IDS_DE_ACCIONES.map((id) => [id, true]))

/**
 * Resuelve las acciones para un usuario.
 *
 * @param {object} params
 * @param {boolean} params.esSecundario         - ni admin ni dueño del negocio
 * @param {object}  [params.invoicePermissions] - `{ editar, anular, reimprimir, cambiarPago }` del sub-usuario
 * @returns {{editar: boolean, anular: boolean, reimprimir: boolean, cambiarPago: boolean}}
 */
export function resolverPermisosDeComprobantes({ esSecundario, invoicePermissions }) {
  if (!esSecundario) return { ...ACCIONES_COMPLETAS }

  const guardado = invoicePermissions
  if (!guardado || typeof guardado !== 'object') return { ...ACCIONES_COMPLETAS }

  // `!== false` y no `?? true`: solo un false explícito restringe. Un campo que
  // no existe —porque se agregó después de crear al usuario— no puede quitarle
  // de golpe algo que venía haciendo.
  return Object.fromEntries(IDS_DE_ACCIONES.map((id) => [id, guardado[id] !== false]))
}

/** ¿Este usuario tiene alguna restricción puesta? Para avisarlo en la ficha. */
export function tieneAlgunaRestriccion(invoicePermissions) {
  const p = invoicePermissions
  if (!p || typeof p !== 'object') return false
  return IDS_DE_ACCIONES.some((id) => p[id] === false)
}
