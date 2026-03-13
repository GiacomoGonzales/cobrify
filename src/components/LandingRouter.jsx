import { useState, useEffect } from 'react'
import { useSearchParams, Navigate } from 'react-router-dom'
import { getResellerByHostname, getResellerBranding, DEFAULT_BRANDING } from '@/services/brandingService'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import LandingPage from '@/pages/LandingPage'
import ResellerLandingPage from '@/pages/ResellerLandingPage'
import CatalogoPublico from '@/pages/CatalogoPublico'
import { Loader2 } from 'lucide-react'

/**
 * Detecta si la app está corriendo como PWA instalada (standalone)
 */
function isPWA() {
  // Detectar modo standalone (PWA instalada)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  // iOS Safari
  const isIOSStandalone = window.navigator.standalone === true
  return isStandalone || isIOSStandalone
}

/**
 * Actualiza el título de la página y el favicon dinámicamente
 */
function updatePageBranding(brandName, logoUrl, primaryColor) {
  // Actualizar título
  if (brandName) {
    document.title = `${brandName} - Sistema de Facturación Electrónica`
  }

  // Actualizar favicon si hay logo personalizado
  if (logoUrl) {
    const existingFavicon = document.querySelector('link[rel="icon"]')
    const existingAppleIcon = document.querySelector('link[rel="apple-touch-icon"]')
    const existingShortcut = document.querySelector('link[rel="shortcut icon"]')

    if (existingFavicon) existingFavicon.href = logoUrl
    if (existingAppleIcon) existingAppleIcon.href = logoUrl
    if (existingShortcut) existingShortcut.href = logoUrl
  }

  // Actualizar theme-color
  if (primaryColor) {
    const themeColor = document.querySelector('meta[name="theme-color"]')
    if (themeColor) themeColor.content = primaryColor
  }
}

/**
 * LandingRouter - Detecta si el dominio actual es de un reseller
 * y muestra la landing personalizada del reseller o la landing de Cobrify
 *
 * También soporta ?preview=RESELLER_ID para previsualizar en desarrollo
 *
 * Si es PWA instalada, redirige a login o dashboard según autenticación
 */
export default function LandingRouter() {
  const [loading, setLoading] = useState(true)
  const [reseller, setReseller] = useState(null)
  const [catalogDomain, setCatalogDomain] = useState(null) // hostname del dominio personalizado de catálogo
  const [searchParams] = useSearchParams()
  const [pwaRedirect, setPwaRedirect] = useState(null) // null, '/login', '/app/dashboard'

  useEffect(() => {
    // Si es PWA, verificar autenticación y redirigir
    if (isPWA()) {
      console.log('📱 LandingRouter: PWA detectada, verificando autenticación...')
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          console.log('✅ LandingRouter: Usuario autenticado en PWA, redirigiendo a dashboard')
          setPwaRedirect('/app/dashboard')
        } else {
          console.log('🔐 LandingRouter: Usuario no autenticado en PWA, redirigiendo a login')
          setPwaRedirect('/login')
        }
        setLoading(false)
      })
      return () => unsubscribe()
    }

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
                heroImageUrl: data.branding?.heroImageUrl || null,
                primaryColor: data.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
                secondaryColor: data.branding?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
                accentColor: data.branding?.accentColor || DEFAULT_BRANDING.accentColor,
                whatsapp: data.branding?.whatsapp || data.phone || '',
                // Precios de la landing page
                priceMonthly: data.branding?.priceMonthly ?? 29.90,
                priceSemester: data.branding?.priceSemester ?? 149.90,
                priceAnnual: data.branding?.priceAnnual ?? 199.90,
              }
            }
            console.log('✅ LandingRouter: Preview reseller loaded:', resellerData.branding?.companyName)
            // Actualizar título y favicon inmediatamente
            updatePageBranding(
              resellerData.branding.companyName,
              resellerData.branding.logoUrl,
              resellerData.branding.primaryColor
            )
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
          // Actualizar título y favicon inmediatamente
          updatePageBranding(
            resellerData.branding?.companyName,
            resellerData.branding?.logoUrl,
            resellerData.branding?.primaryColor
          )
          setReseller(resellerData)
        } else if (!['localhost', '127.0.0.1', 'vercel.app', 'firebaseapp.com', 'web.app', 'cobrifyperu.com', 'cobrify.com'].some(d => hostname.includes(d))) {
          // No es reseller ni dominio conocido — verificar si es dominio personalizado de catálogo
          let normalizedHost = hostname.toLowerCase()
          if (normalizedHost.startsWith('www.')) {
            normalizedHost = normalizedHost.substring(4)
          }
          const catalogQuery = query(
            collection(db, 'businesses'),
            where('customDomain', '==', normalizedHost),
            where('catalogEnabled', '==', true)
          )
          const catalogSnap = await getDocs(catalogQuery)
          if (!catalogSnap.empty) {
            console.log('✅ LandingRouter: Found catalog domain:', normalizedHost)
            setCatalogDomain(normalizedHost)
          } else {
            console.log('ℹ️ LandingRouter: No reseller or catalog found, showing default landing')
          }
        }
      } catch (error) {
        console.error('Error detecting reseller:', error)
      } finally {
        setLoading(false)
      }
    }

    detectReseller()
  }, [searchParams])

  // Mostrar loading mientras detectamos (neutro para no mostrar branding de Cobrify)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-gray-400 animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  // Si es PWA y hay redirect definido, redirigir
  if (pwaRedirect) {
    return <Navigate to={pwaRedirect} replace />
  }

  // Si hay reseller, mostrar su landing personalizada
  if (reseller) {
    return <ResellerLandingPage reseller={reseller} />
  }

  // Si es dominio personalizado de catálogo, mostrar catálogo directamente
  if (catalogDomain) {
    return <CatalogoPublico customDomain={catalogDomain} />
  }

  // Si no hay reseller ni catálogo, mostrar landing de Cobrify
  return <LandingPage />
}
