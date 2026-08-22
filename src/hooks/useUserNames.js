import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { getManagedUsers } from '@/services/userManagementService'

/**
 * Traduce el uid guardado en un registro al nombre de la persona.
 *
 * El sistema viene guardando quién hizo cada cosa desde hace tiempo, pero
 * guarda el uid pelado — que no le dice nada a nadie. Este hook arma el mapa
 * uid → nombre una sola vez (dueño + sub-usuarios) y devuelve la función para
 * resolverlo.
 *
 * Se resuelve al LEER y no se guarda el nombre al escribir, a propósito: así
 * los movimientos viejos —que solo tienen uid— también muestran un nombre, y
 * si alguien se cambia el nombre no quedan dos versiones dando vueltas.
 *
 * Aguanta las cuatro convenciones que conviven en la base:
 *   - uid puro           (movimientos de stock, comprobantes)
 *   - email              (gastos y anulaciones guardan `user.email || user.uid`)
 *   - vacío o inexistente (registros anteriores a que se guardara el autor)
 *
 * Uso:
 *   const nombreDe = useUserNames()
 *   <td>{nombreDe(movimiento.userId)}</td>
 */
export function useUserNames() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const [mapa, setMapa] = useState(() => new Map())

  useEffect(() => {
    if (isDemoMode) return
    const businessId = getBusinessId?.()
    if (!businessId) return

    let cancelado = false
    const cargar = async () => {
      const nuevo = new Map()

      // El dueño: si es quien está mirando, sale del contexto sin leer nada.
      if (user?.uid === businessId) {
        nuevo.set(businessId, user.displayName || user.email || 'Dueño')
      } else {
        try {
          const snap = await getDoc(doc(db, 'users', businessId))
          if (snap.exists()) {
            const d = snap.data()
            nuevo.set(businessId, d.displayName || d.email || 'Dueño')
          }
        } catch {
          // Un sub-usuario puede no tener permiso de leer el doc del dueño.
          // No es motivo para quedarse sin los demás nombres.
        }
      }

      try {
        const r = await getManagedUsers(businessId)
        for (const u of (r?.data || [])) {
          const uid = u.uid || u.id
          if (uid) nuevo.set(uid, u.displayName || u.email || 'Usuario')
        }
      } catch {
        // Sin permisos para listar usuarios: se sigue con lo que haya.
      }

      // El propio usuario siempre, por si no figura en ninguna de las dos vías.
      if (user?.uid && !nuevo.has(user.uid)) {
        nuevo.set(user.uid, user.displayName || user.email || 'Usuario')
      }

      if (!cancelado) setMapa(nuevo)
    }

    cargar()
    return () => { cancelado = true }
  }, [user?.uid, user?.displayName, user?.email, getBusinessId, isDemoMode])

  return useCallback((valor) => {
    if (!valor) return '—'
    const v = String(valor).trim()
    if (!v) return '—'
    // Los gastos y las anulaciones guardan el email cuando lo hay. Ya es
    // legible: mostrarlo tal cual antes que decir "—".
    if (v.includes('@')) return mapa.get(v) || v
    return mapa.get(v) || 'Usuario eliminado'
  }, [mapa])
}

export default useUserNames
