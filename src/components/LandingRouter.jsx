import { useState, useEffect } from 'react'
import { getResellerByHostname } from '@/services/brandingService'
import LandingPage from '@/pages/LandingPage'
import ResellerLandingPage from '@/pages/ResellerLandingPage'
import { Loader2 } from 'lucide-react'

/**
 * LandingRouter - Detecta si el dominio actual es de un reseller
 * y muestra la landing personalizada del reseller o la landing de Cobrify
 */
export default function LandingRouter() {
  const [loading, setLoading] = useState(true)
  const [reseller, setReseller] = useState(null)

  useEffect(() => {
    async function detectReseller() {
      try {
        const hostname = window.location.hostname
        console.log('🌐 LandingRouter: Checking hostname:', hostname)

        // Obtener reseller por hostname (subdominio o dominio personalizado)
        const resellerData = await getResellerByHostname(hostname)

        if (resellerData) {
          console.log('✅ LandingRouter: Found reseller:', resellerData.branding?.companyName)
          setReseller(resellerData)
        } else {
          console.log('ℹ️ LandingRouter: No reseller found, showing default landing')
        }
      } catch (error) {
        console.error('Error detecting reseller:', error)
      } finally {
        setLoading(false)
      }
    }

    detectReseller()
  }, [])

  // Mostrar loading mientras detectamos
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-800">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white/80">Cargando...</p>
        </div>
      </div>
    )
  }

  // Si hay reseller, mostrar su landing personalizada
  if (reseller) {
    return <ResellerLandingPage reseller={reseller} />
  }

  // Si no hay reseller, mostrar landing de Cobrify
  return <LandingPage />
}
