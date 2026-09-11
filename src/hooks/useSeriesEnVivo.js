import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Las series del negocio EN VIVO, para anunciar en el POS el siguiente número
 * ("Siguiente: B001-00000124"). Cuando otra caja emite, el contador sube en el
 * doc del negocio y el aviso se corre solo.
 *
 * Cuesta una lectura cada vez que cambia el doc del negocio (al numerar o al
 * tocar la configuración), por cada POS abierto.
 *
 * @param {string|null} businessId
 * @param {boolean} [activo]  apagado (demo, sin negocio) no escucha nada
 * @returns {{series: object, branchSeries: object, warehouseSeries: object, emisorSeries: object} | null}
 *   null mientras no hay nada que mostrar: cargando, sin permiso o sin el doc
 */
export function useSeriesEnVivo(businessId, activo = true) {
  // Lo leído va con el negocio al que pertenece: si el negocio cambia (p. ej.
  // un sub-usuario cuyos permisos llegan después), lo del anterior no vale.
  const [leido, setLeido] = useState(null)

  useEffect(() => {
    if (!businessId || !activo) return undefined
    return onSnapshot(
      doc(db, 'businesses', businessId),
      (snap) => {
        const d = snap.exists() ? snap.data() : null
        setLeido({
          de: businessId,
          series: d && {
            series: d.series || {},
            branchSeries: d.branchSeries || {},
            warehouseSeries: d.warehouseSeries || {},
            emisorSeries: d.emisorSeries || {},
          },
        })
      },
      // Sin permiso o sin red: sin aviso. El cobro numera igual.
      () => setLeido({ de: businessId, series: null }),
    )
  }, [businessId, activo])

  return activo && leido?.de === businessId ? leido.series : null
}
