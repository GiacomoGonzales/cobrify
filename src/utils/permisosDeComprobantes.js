/**
 * QUÉ PUEDE HACER un sub-usuario con un comprobante YA EMITIDO.
 *
 * Emitir lo emite cualquiera que tenga el POS. Lo que preocupa al dueño es lo
 * que viene después: que el cajero abra una venta de ayer y la cambie, que
 * anule una factura aceptada por SUNAT, o que saque otra copia de un
 * comprobante. Un cliente lo pidió con estas palabras (ACEROS RAMOS,
 * 9-set-2026): "ese acceso de anular quisiera que solo yo pueda tenerlo". Y el
 * 14-set la misma dueña pidió que sus vendedoras no puedan reimprimir tickets
 * ni PDFs.
 *
 * Son acciones distintas y se manejan por separado, porque no son la misma
 * preocupación:
 *   - editar: corregir una venta ya hecha (cambia importes, stock y caja).
 *   - anular: dar de baja o eliminar una venta ya hecha.
 *   - reimprimir: volver a imprimir el ticket, sacar el PDF o mandarlo por
 *     WhatsApp desde Ventas. El ticket de la venta que acaba de hacer en el POS
 *     sale igual: eso es vender, no reimprimir.
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
]

export const IDS_DE_ACCIONES = ACCIONES_DE_COMPROBANTES.map((a) => a.id)

/** Lo que puede el dueño, y también el default de quien no tiene nada guardado. */
export const ACCIONES_COMPLETAS = Object.fromEntries(IDS_DE_ACCIONES.map((id) => [id, true]))

/**
 * Resuelve las acciones para un usuario.
 *
 * @param {object} params
 * @param {boolean} params.esSecundario         - ni admin ni dueño del negocio
 * @param {object}  [params.invoicePermissions] - `{ editar, anular, reimprimir }` del sub-usuario
 * @returns {{editar: boolean, anular: boolean, reimprimir: boolean}}
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
