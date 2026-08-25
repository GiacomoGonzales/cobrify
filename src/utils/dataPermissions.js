/**
 * PERMISOS DE DATOS de un sub-usuario.
 *
 * Antes existía una sola opción del negocio —"ocultar datos sensibles a
 * usuarios secundarios"— que con el tiempo se convirtió en un cajón de sastre:
 * escondía los totales de ventas, el Dashboard entero, los costos, la columna
 * "Total Gastado" de Clientes, los gráficos de Gastos y TODOS los botones de
 * exportar. Un dueño que solo quería tapar el margen terminaba dejando a su
 * encargado sin poder exportar nada.
 *
 * Ahora son tres, porque son tres preguntas distintas:
 *   - verTotales: ¿puede ver CUÁNTO SE VENDIÓ? (tarjetas, Dashboard, caja)
 *   - verCostos:  ¿puede ver CUÁNTO SE GANA?   (margen, utilidad, valor del inventario)
 *   - exportar:   ¿puede LLEVARSE la data?     (todos los Excel)
 *
 * COMPATIBILIDAD: los sub-usuarios que ya existen no tienen `dataPermissions`.
 * Para ellos los tres se derivan de la opción del negocio, o sea que se
 * comportan EXACTAMENTE como antes. Los permisos propios solo aparecen cuando
 * el dueño abre esa ficha y guarda.
 */

/** Los tres ejes, con su etiqueta y su explicación para la UI. */
export const EJES_DE_DATOS = [
  {
    id: 'verTotales',
    label: 'Ver totales de ventas',
    siPuede: 'Ve los totales vendidos, el Dashboard y los resúmenes de caja.',
    noPuede: 'No ve totales de ventas, ni el Dashboard, ni los resúmenes de caja.',
  },
  {
    id: 'verCostos',
    label: 'Ver costos y ganancias',
    siPuede: 'Ve el costo de los productos, el margen, la utilidad y el valor del inventario.',
    noPuede: 'No ve costos, márgenes, utilidad ni el valor del inventario.',
  },
  {
    id: 'exportar',
    label: 'Exportar a Excel',
    siPuede: 'Puede descargar los reportes y listados en Excel.',
    noPuede: 'No puede descargar ningún Excel del sistema.',
  },
]

export const IDS_DE_EJES = EJES_DE_DATOS.map((e) => e.id)

/** Todo permitido: lo que ve un dueño. */
export const PERMISOS_COMPLETOS = { verTotales: true, verCostos: true, exportar: true }

/**
 * Resuelve los tres permisos de un usuario.
 *
 * @param {object} params
 * @param {boolean} params.esSecundario      - ni admin ni dueño del negocio
 * @param {object}  [params.dataPermissions] - permisos propios del sub-usuario, si los tiene
 * @param {boolean} [params.ocultarPorDefecto] - `hideDashboardDataFromSecondary` del negocio
 * @returns {{verTotales: boolean, verCostos: boolean, exportar: boolean}}
 */
export function resolverPermisosDeDatos({ esSecundario, dataPermissions, ocultarPorDefecto }) {
  if (!esSecundario) return { ...PERMISOS_COMPLETOS }

  // Sin permisos propios: manda la opción del negocio, igual que siempre.
  if (!dataPermissions || typeof dataPermissions !== 'object') {
    const puede = !ocultarPorDefecto
    return { verTotales: puede, verCostos: puede, exportar: puede }
  }

  // Con permisos propios: cada eje ausente hereda el default del negocio, para
  // que agregar un eje nuevo en el futuro no le abra datos a nadie de golpe.
  const heredado = !ocultarPorDefecto
  return {
    verTotales: dataPermissions.verTotales ?? heredado,
    verCostos: dataPermissions.verCostos ?? heredado,
    exportar: dataPermissions.exportar ?? heredado,
  }
}
