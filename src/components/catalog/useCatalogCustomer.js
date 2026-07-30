import { useState, useEffect, useCallback } from 'react'
import {
  onCatalogAuthChanged,
  getCatalogCustomerProfile,
  ensureCatalogCustomerProfile,
  catalogSignOut,
} from '@/services/catalogCustomerService'

/**
 * Sesión del COMPRADOR en el catálogo público. Siempre opcional: si no hay
 * sesión, `customer` es null y el catálogo funciona exactamente igual que
 * siempre (pedido como invitado).
 *
 * Devuelve { user, profile, loading, refreshProfile, signOut }.
 */
export function useCatalogCustomer(businessId) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  // `loading` arranca en true solo hasta saber si HAY sesión guardada; no
  // bloquea el catálogo (el render no espera por esto).
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onCatalogAuthChanged((u) => {
      setUser(u || null)
      setLoading(false)
    })
    return unsub
  }, [])

  // Cargar el perfil del comprador EN ESTE negocio cuando hay sesión.
  // Si la cuenta existe pero nunca compró aquí, se le crea el perfil.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!user?.uid || !businessId) {
        setProfile(null)
        return
      }
      const result = await getCatalogCustomerProfile(businessId, user.uid)
      if (cancelled) return
      if (result.success) {
        setProfile(result.data)
      } else {
        const created = await ensureCatalogCustomerProfile(businessId, user)
        if (!cancelled && created.success) setProfile(created.data)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user, businessId])

  const refreshProfile = useCallback(async () => {
    if (!user?.uid || !businessId) return
    const result = await getCatalogCustomerProfile(businessId, user.uid)
    if (result.success) setProfile(result.data)
  }, [user, businessId])

  const signOut = useCallback(async () => {
    await catalogSignOut()
    setProfile(null)
  }, [])

  // setProfile se expone para que el panel de cuenta refleje los cambios al
  // instante (editar datos / direcciones) sin volver a leer de Firestore.
  return { user, profile, setProfile, loading, refreshProfile, signOut }
}
