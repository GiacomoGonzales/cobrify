import React, { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import {
  DEFAULT_BRANDING,
  getBrandingForClient,
  getResellerBranding,
  applyBrandingColors,
  removeBrandingColors
} from '@/services/brandingService'

const BrandingContext = createContext({
  branding: DEFAULT_BRANDING,
  isLoading: true,
  refreshBranding: () => {},
})

export function BrandingProvider({ children }) {
  const { user, userRole, resellerData } = useAuth()
  const [branding, setBranding] = useState(DEFAULT_BRANDING)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadBranding()
  }, [user, userRole, resellerData])

  async function loadBranding() {
    console.log('🎨 BrandingContext loadBranding called')
    console.log('   user:', user?.uid)
    console.log('   userRole:', userRole)

    if (!user) {
      // No user logged in, use default branding
      setBranding(DEFAULT_BRANDING)
      removeBrandingColors()
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      let loadedBranding = DEFAULT_BRANDING

      if (userRole === 'reseller') {
        // Si es reseller, cargar su propio branding
        const resellerId = resellerData?.docId || user.uid
        console.log('🏢 Loading reseller branding for:', resellerId)
        loadedBranding = await getResellerBranding(resellerId)
      } else if (userRole === 'user') {
        // Si es usuario normal, verificar si fue creado por un reseller
        console.log('👤 Loading client branding for:', user.uid)
        loadedBranding = await getBrandingForClient(user.uid)
      } else {
        console.log('⚠️ userRole not user or reseller:', userRole)
      }
      // Si es admin o superadmin, usar branding por defecto

      setBranding(loadedBranding)

      // Aplicar colores CSS solo si no es el branding por defecto
      if (loadedBranding.primaryColor !== DEFAULT_BRANDING.primaryColor ||
          loadedBranding.secondaryColor !== DEFAULT_BRANDING.secondaryColor) {
        applyBrandingColors(loadedBranding)
      } else {
        removeBrandingColors()
      }
    } catch (error) {
      console.error('Error loading branding:', error)
      setBranding(DEFAULT_BRANDING)
      removeBrandingColors()
    } finally {
      setIsLoading(false)
    }
  }

  async function refreshBranding() {
    await loadBranding()
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
