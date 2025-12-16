import React, { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import {
  DEFAULT_BRANDING,
  getBrandingForClient,
  getResellerBranding,
  getResellerByHostname,
  applyBrandingColors,
  removeBrandingColors
} from '@/services/brandingService'

const BrandingContext = createContext({
  branding: DEFAULT_BRANDING,
  isLoading: true,
  refreshBranding: () => {},
})

export function BrandingProvider({ children }) {
  const { user, isReseller, isAdmin, resellerData, isLoading: authLoading } = useAuth()
  const [branding, setBranding] = useState(DEFAULT_BRANDING)
  const [isLoading, setIsLoading] = useState(true)
  const [brandingLoaded, setBrandingLoaded] = useState(false)

  useEffect(() => {
    // Esperar a que auth termine de cargar antes de cargar branding
    if (authLoading) {
      console.log('🎨 BrandingContext: Waiting for auth to load...')
      return
    }

    // Solo cargar una vez después de que auth esté listo
    if (!brandingLoaded) {
      loadBranding()
    }
  }, [user, isReseller, isAdmin, resellerData, authLoading, brandingLoaded])

  // Reset brandingLoaded cuando el usuario cambia (logout/login)
  useEffect(() => {
    setBrandingLoaded(false)
  }, [user?.uid])

  async function loadBranding() {
    console.log('🎨 BrandingContext loadBranding called')
    console.log('   user:', user?.uid)
    console.log('   isReseller:', isReseller)
    console.log('   isAdmin:', isAdmin)

    if (!user) {
      // No user logged in, check if we're on a reseller domain
      const hostname = window.location.hostname
      console.log('🔍 No user, checking hostname for branding:', hostname)

      try {
        const resellerData = await getResellerByHostname(hostname)
        if (resellerData) {
          console.log('✅ Found reseller branding by hostname (no user):', resellerData.branding.companyName)
          setBranding(resellerData.branding)
          applyBrandingColors(resellerData.branding)
        } else {
          setBranding(DEFAULT_BRANDING)
          removeBrandingColors()
        }
      } catch (error) {
        console.error('Error loading branding by hostname:', error)
        setBranding(DEFAULT_BRANDING)
        removeBrandingColors()
      }

      setIsLoading(false)
      setBrandingLoaded(true)
      return
    }

    setIsLoading(true)

    try {
      let loadedBranding = DEFAULT_BRANDING

      if (isReseller) {
        // Si es reseller, cargar su propio branding
        const resellerId = resellerData?.docId || user.uid
        console.log('🏢 Loading reseller branding for:', resellerId)
        loadedBranding = await getResellerBranding(resellerId)
      } else if (!isAdmin) {
        // Si es usuario normal (no admin, no reseller), verificar si fue creado por un reseller
        console.log('👤 Loading client branding for:', user.uid)
        loadedBranding = await getBrandingForClient(user.uid)

        // Si no tiene branding del reseller en su suscripción, verificar por hostname
        if (loadedBranding.primaryColor === DEFAULT_BRANDING.primaryColor) {
          const hostname = window.location.hostname
          console.log('🔍 Checking hostname for branding:', hostname)
          const resellerData = await getResellerByHostname(hostname)
          if (resellerData) {
            console.log('✅ Found branding by hostname:', resellerData.branding.companyName)
            loadedBranding = resellerData.branding
          }
        }
      } else {
        console.log('👑 Admin user, using default branding')
      }

      console.log('🎨 Final branding:', loadedBranding)
      setBranding(loadedBranding)

      // Aplicar colores CSS solo si no es el branding por defecto
      if (loadedBranding.primaryColor !== DEFAULT_BRANDING.primaryColor ||
          loadedBranding.secondaryColor !== DEFAULT_BRANDING.secondaryColor) {
        console.log('🎨 Applying custom branding colors')
        applyBrandingColors(loadedBranding)
      } else {
        console.log('🎨 Using default branding colors')
        removeBrandingColors()
      }
    } catch (error) {
      console.error('Error loading branding:', error)
      setBranding(DEFAULT_BRANDING)
      removeBrandingColors()
    } finally {
      setIsLoading(false)
      setBrandingLoaded(true)
    }
  }

  async function refreshBranding() {
    setBrandingLoaded(false)
    await loadBranding()
  }

  // Mostrar loading mientras se carga el branding (evita flash de Cobrify)
  if (!brandingLoaded && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
      </div>
    )
  }

  return (
    <BrandingContext.Provider value={{ branding, isLoading, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  const context = useContext(BrandingContext)
  if (!context) {
    throw new Error('useBranding must be used within a BrandingProvider')
  }
  return context
}

export default BrandingContext
