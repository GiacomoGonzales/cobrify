/**
 * Nombre del LABORATORIO de un producto, para mostrarlo en los buscadores del
 * modo farmacia.
 *
 * POR QUÉ EXISTE (caso real, 12-ago-2026): una farmacia pidió ver el
 * laboratorio al registrar una compra. Al buscar "CLONAZEPAM" le salían tres
 * productos casi idénticos y no tenía con qué distinguirlos; el laboratorio es
 * lo que los separa.
 *
 * POR QUÉ SE RESUELVE POR ID Y NO SE USA EL NOMBRE GUARDADO A SECAS: el
 * producto guarda `laboratoryName` como una COPIA del momento en que se creó, y
 * renombrar un laboratorio (página Laboratorios) actualiza solo el documento del
 * laboratorio — no recorre los productos. O sea que esa copia queda vieja. El
 * `laboratoryId` en cambio sigue siendo correcto, así que manda el ID y la copia
 * queda como respaldo para productos antiguos que nunca guardaron el id.
 *
 * Vive acá y no dentro de cada pantalla porque lo usan Compras y Cotizaciones:
 * si el criterio cambia, tiene que cambiar en los dos a la vez.
 *
 * @param {object} product      producto (o ítem del buscador)
 * @param {Array}  laboratories laboratorios del negocio ya cargados
 * @returns {string} '' cuando no hay laboratorio que mostrar
 */
export const getProductLaboratoryName = (product, laboratories = []) => {
  // Los insumos no tienen laboratorio.
  if (!product || product.itemType === 'ingredient') return ''

  const porId = product.laboratoryId
    ? (laboratories || []).find(l => l.id === product.laboratoryId)
    : null

  return String(porId?.name || product.laboratoryName || '').trim()
}
