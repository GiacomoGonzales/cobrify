/**
 * EL GUARDADO DE UNA PESTAÑA DE CONFIGURACIÓN.
 *
 * Cada pestaña escribe SOLO sus propios campos. Es la regla que salió de la
 * auditoría: había 21 puntos de escritura sobre el mismo documento, y el
 * botón de Mi Empresa escribía 46 campos —25 de otras pestañas— con el valor
 * que cargó al abrir la página. Guardar el RUC revertía el color del PDF que
 * otra caja acababa de cambiar.
 *
 * Con este hook el payload es un objeto chico y explícito, `merge: true`
 * deja intacto todo lo demás, y el contexto se refresca siempre (faltaba en
 * tres de los guardados viejos, y el menú lateral seguía leyendo lo viejo
 * hasta recargar).
 *
 * Se llama `useGuardado` y no `usarGuardado` porque React —y el plugin de
 * lint— identifican un hook por el prefijo `use`; con otro nombre, la regla
 * `rules-of-hooks` no puede verificar que se use bien.
 *
 * Uso:
 *   const { guardar, guardando } = useGuardado()
 *   await guardar({ allowNegativeStock, autoPrintTicket }, 'Ventas guardadas')
 */
import { useState, useCallback } from 'react'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'

export function useGuardado() {
  const { getBusinessId, isDemoMode, refreshBusinessSettings } = useAppContext()
  const toast = useToast()
  const [guardando, setGuardando] = useState(false)

  /**
   * @param {object} payload  Solo los campos de esta pestaña.
   * @param {string} [mensaje] Lo que confirma el toast.
   * @returns {Promise<boolean>} true si quedó guardado.
   */
  const guardar = useCallback(async (payload, mensaje = 'Configuración guardada') => {
    if (isDemoMode) {
      toast.error('No se pueden guardar cambios en modo demo. Crea una cuenta para configurar tu empresa.')
      return false
    }
    const businessId = getBusinessId()
    if (!businessId) return false

    setGuardando(true)
    try {
      await setDoc(
        doc(db, 'businesses', businessId),
        { ...payload, updatedAt: serverTimestamp() },
        { merge: true },
      )
      if (refreshBusinessSettings) await refreshBusinessSettings()
      toast.success(mensaje)
      return true
    } catch (error) {
      console.error('Error al guardar configuración:', error)
      toast.error('No se pudo guardar. Inténtalo de nuevo.')
      return false
    } finally {
      setGuardando(false)
    }
    // `toast` fuera de las dependencias a propósito: el provider devuelve un
    // objeto nuevo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getBusinessId, isDemoMode, refreshBusinessSettings])

  return { guardar, guardando }
}
