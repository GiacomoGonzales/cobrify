import React, { createContext, useContext, useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuth } from './AuthContext'
import { esDominioReseller } from '@/utils/resellerDomain'
import {
  DEFAULT_BRANDING,
  getBrandingForClient,
  getResellerBranding,
  getResellerByHostname,
  applyBrandingColors,
  removeBrandingColors
} from '@/services/brandingService'

// Memoria local de la marca por dominio: permite pintar el splash con el
// logo y color del reseller ANTES de que Firestore responda. Sin esto, cada
// arranque frio mostraba un spinner neutro (y antes, el logo de Cobrify).
const llaveMarcaCache = () => 'marcaCache:' + window.location.hostname.toLowerCase()

function leerMarcaCache() {
  try {
    const raw = localStorage.getItem(llaveMarcaCache())
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function guardarMarcaCache(b) {
  try {
    localStorage.setItem(llaveMarcaCache(), JSON.stringify({
      companyName: b.companyName || '',
      logoUrl: b.logoUrl || null,
      primaryColor: b.primaryColor || '#2563eb',
    }))
  } catch { /* almacenamiento lleno o bloqueado: el splash cae al neutro */ }
}

const BrandingContext = createContext({
  branding: DEFAULT_BRANDING,
  isLoading: true,
  refreshBranding: () => {},
})

export function BrandingProvider({ children }) {
  const { user, isReseller, isAdmin, resellerData, isLoading: authLoading, getBusinessId } = useAuth()
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

  // Al resolverse una marca REAL en dominio de reseller, se memoriza para que
  // el proximo splash salga con ella. La por defecto no se guarda: pisar la
  // memoria con Cobrify (p. ej. por un fallo de red) volveria a filtrar la
  // marca equivocada en el proximo arranque.
  useEffect(() => {
    if (!brandingLoaded || !esDominioReseller()) return
    const esRealDelReseller = branding.primaryColor !== DEFAULT_BRANDING.primaryColor || branding.logoUrl
    if (esRealDelReseller) guardarMarcaCache(branding)
  }, [branding, brandingLoaded])

  async function loadBranding() {
    console.log('🎨 BrandingContext loadBranding called')
    console.log('   user:', user?.uid)
    console.log('   isReseller:', isReseller)
    console.log('   isAdmin:', isAdmin)

    if (!user) {
      // No user logged in, check for preview param or reseller domain
      const urlParams = new URLSearchParams(window.location.search)
      const previewId = urlParams.get('preview')
      const hostname = window.location.hostname

      try {
        // Prioridad 1: Parámetro ?preview=RESELLER_ID (para desarrollo)
        if (previewId) {
          console.log('🔍 Preview mode, loading branding for:', previewId)
          const previewBranding = await getResellerBranding(previewId)
          if (previewBranding && previewBranding.primaryColor !== DEFAULT_BRANDING.primaryColor) {
            console.log('✅ Found reseller branding by preview param:', previewBranding.companyName)
            setBranding(previewBranding)
            applyBrandingColors(previewBranding)
            setIsLoading(false)
            setBrandingLoaded(true)
            return
          }
        }

        // Prioridad 2: Detectar por hostname
        console.log('🔍 No user, checking hostname for branding:', hostname)
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
        console.error('Error loading branding:', error)
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
        // La marca se resuelve con el uid del DUEÑO, no con el de quien inició
        // sesión: un sub-usuario no tiene documento de suscripción propio, así
        // que buscarlo por su uid devolvía la marca por defecto y el cajero de
        // un cliente de reseller terminaba viendo "Cobrify" (logo, nombre y
        // contacto) en vez de la marca de su proveedor.
        const idDelNegocio = getBusinessId?.() || user.uid
        console.log('👤 Loading client branding for:', idDelNegocio)
        loadedBranding = await getBrandingForClient(idDelNegocio)

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

  // Actualizar título y favicon cuando cambia el branding
  useEffect(() => {
    if (!brandingLoaded) return

    // No pisar título/favicon en rutas públicas de catálogo/menú (lo maneja CatalogoPublico)
    const path = window.location.pathname
    if (path.startsWith('/catalogo/') || path.startsWith('/menu/')) return

    // Actualizar título de la pestaña
    if (branding.companyName && branding.companyName !== DEFAULT_BRANDING.companyName) {
      document.title = `${branding.companyName} - Sistema de Facturación Electrónica`
    } else {
      document.title = 'Sistema de Facturación Electrónica SUNAT | Retail y Restaurantes en Perú'
    }

    // Actualizar favicon si hay logo personalizado
    if (branding.logoUrl) {
      const updateFavicon = (selector, attr = 'href') => {
        const element = document.querySelector(selector)
        if (element) {
          element.setAttribute(attr, branding.logoUrl)
        }
      }

      updateFavicon('link[rel="icon"]')
      updateFavicon('link[rel="apple-touch-icon"]')
      updateFavicon('link[rel="shortcut icon"]')
    } else {
      // Restaurar favicon por defecto
      const updateFavicon = (selector) => {
        const element = document.querySelector(selector)
        if (element) {
          element.setAttribute('href', '/logo.png')
        }
      }

      updateFavicon('link[rel="icon"]')
      updateFavicon('link[rel="apple-touch-icon"]')
      updateFavicon('link[rel="shortcut icon"]')
    }

    // Actualizar theme-color meta tag
    if (branding.primaryColor && branding.primaryColor !== DEFAULT_BRANDING.primaryColor) {
      const themeColorMeta = document.querySelector('meta[name="theme-color"]')
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', branding.primaryColor)
      }
    }

    console.log('🎨 Updated page title and favicon for:', branding.companyName)
  }, [branding, brandingLoaded])

  // Mostrar loading mientras se carga el branding (evita flash de Cobrify)
  // También mostrar loading para dominios de reseller sin usuario logueado
  const isResellerDomain = esDominioReseller

  // Solo mostrar splash en apps móviles nativas, no en web
  if (!brandingLoaded && (user || isResellerDomain()) && Capacitor.isNativePlatform()) {
    // En el dominio de un reseller NO puede aparecer el logo de Cobrify: es
    // la marca de otro. Si este dispositivo ya resolvio la marca alguna vez,
    // el splash sale con SU logo y color al instante (memoria local); solo la
    // primera apertura de la vida de la app muestra el indicador neutro. En
    // los dominios propios se conserva el logo de siempre.
    if (isResellerDomain()) {
      const cache = leerMarcaCache()
      if (cache?.primaryColor) {
        return (
          <div
            className="fixed inset-0 flex items-center justify-center"
            style={{ backgroundColor: cache.primaryColor }}
          >
            {cache.logoUrl ? (
              <img src={cache.logoUrl} alt="" className="w-[140px] h-[140px] object-contain" />
            ) : (
              <span className="text-white text-3xl font-bold tracking-wide">
                {cache.companyName}
              </span>
            )}
          </div>
        )
      }
      return (
        <div className="fixed inset-0 bg-white flex items-center justify-center">
          <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-gray-400" />
        </div>
      )
    }
    return (
      <div className="fixed inset-0 bg-[#2563EB] flex items-center justify-center">
        <img src="/logo.png" alt="Cobrify" className="w-[140px] h-[140px] object-contain" />
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
