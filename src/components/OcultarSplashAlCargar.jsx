import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/contexts/AuthContext'
import { ocultarSplashNativo } from '@/utils/splashNativo'

// Las esperas del arranque que el splash tiene que tapar: la de React
// (EsperaDeArranque) y el puente de index.html.
const ESPERAS = '[data-espera-arranque], #puente-carga'

/**
 * Retira el splash nativo cuando la app YA ESTÁ: la sesión resuelta y ninguna
 * pantalla de espera a la vista. Recién ahí lo que queda debajo es la pantalla
 * de verdad (el panel, el login, lo que toque), y el splash sale con un
 * fundido directo hacia ella. Ver utils/splashNativo.js.
 *
 * Mira el DOM y no una lista de pantallas a propósito: sirva para el panel,
 * el login, el admin o la que se agregue mañana, sin tener que acordarse de
 * avisar desde cada una.
 */
export default function OcultarSplashAlCargar() {
  const { isLoading } = useAuth()

  useEffect(() => {
    if (isLoading || !Capacitor.isNativePlatform()) return undefined
    if (!document.querySelector(ESPERAS)) {
      ocultarSplashNativo()
      return undefined
    }
    const observador = new MutationObserver(() => {
      if (document.querySelector(ESPERAS)) return
      observador.disconnect()
      ocultarSplashNativo()
    })
    observador.observe(document.body, { childList: true, subtree: true })
    return () => observador.disconnect()
  }, [isLoading])

  return null
}
