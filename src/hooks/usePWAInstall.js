import { useState, useEffect } from 'react'

/**
 * Hook para manejar la instalación de PWA
 * Captura el evento beforeinstallprompt y permite instalación manual
 */
export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Detectar si ya está instalada como PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isIOSStandalone = window.navigator.standalone === true

    if (isStandalone || isIOSStandalone) {
      setIsInstalled(true)
      return
    }

    // Capturar evento beforeinstallprompt
    const handleBeforeInstallPrompt = (e) => {
      // Prevenir que el navegador muestre su propio prompt
      e.preventDefault()
      // Guardar el evento para usarlo después
      setInstallPrompt(e)
      setIsInstallable(true)
      console.log('📲 PWA: Instalación disponible')
    }

    // Detectar cuando se instala
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setIsInstallable(false)
      setInstallPrompt(null)
      console.log('✅ PWA: App instalada exitosamente')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // Función para triggear la instalación
  const promptInstall = async () => {
    if (!installPrompt) {
      console.log('⚠️ PWA: No hay prompt de instalación disponible')
      return false
    }

    // Mostrar el prompt de instalación
    installPrompt.prompt()

    // Esperar la respuesta del usuario
    const { outcome } = await installPrompt.userChoice
    console.log(`📲 PWA: Usuario eligió: ${outcome}`)

    // Limpiar el prompt (solo se puede usar una vez)
    setInstallPrompt(null)
    setIsInstallable(false)

    return outcome === 'accepted'
  }

  return {
    isInstallable,  // true si se puede instalar
    isInstalled,    // true si ya está instalada
    promptInstall,  // función para mostrar el prompt de instalación
  }
}
