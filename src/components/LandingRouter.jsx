import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getResellerByHostname, getResellerBranding, DEFAULT_BRANDING } from '@/services/brandingService'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import LandingPage from '@/pages/LandingPage'
import ResellerLandingPage from '@/pages/ResellerLandingPage'
import { Loader2 } from 'lucide-react'

/**
 * LandingRouter - Detecta si el dominio actual es de un reseller
 * y muestra la landing personalizada del reseller o la landing de Cobrify
 *
 * También soporta ?preview=RESELLER_ID para previsualizar en desarrollo
 */
export default function LandingRouter() {
  const [loading, setLoading] = useState(true)
  const [reseller, setReseller] = useState(null)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    async function detectReseller() {
      try {
        // Prioridad 1: Parámetro ?preview=RESELLER_ID (para desarrollo)
        const previewId = searchParams.get('preview')
        if (previewId) {
          console.log('🔍 LandingRouter: Preview mode for reseller:', previewId)

          // Cargar datos del reseller por ID
          const resellerDoc = await getDoc(doc(db, 'resellers', previewId))
          if (resellerDoc.exists()) {
            const data = resellerDoc.data()
            const resellerData = {
              resellerId: previewId,
              companyName: data.companyName,
              phone: data.phone,
              branding: {
                ...DEFAULT_BRANDING,
                companyName: data.branding?.companyName || data.companyName || DEFAULT_BRANDING.companyName,
                logoUrl: data.branding?.logoUrl || null,
                primaryColor: data.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
                secondaryColor: data.branding?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
                accentColor: data.branding?.accentColor || DEFAULT_BRANDING.accentColor,
                whatsapp: data.branding?.whatsapp || data.phone || '',
              }
            }
            console.log('✅ LandingRouter: Preview reseller loaded:', resellerData.branding?.companyName)
            setReseller(resellerData)
            setLoading(false)
            return
          } else {
            console.log('⚠️ LandingRouter: Preview reseller not found:', previewId)
          }
        }

        // Prioridad 2: Detectar por hostname
        const hostname = window.location.hostname
        console.log('🌐 LandingRouter: Checking hostname:', hostname)

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
  }, [searchParams])

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
