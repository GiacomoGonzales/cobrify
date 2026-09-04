import React, { createContext, useContext, useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuth } from './AuthContext'
import { esDominioReseller } from '@/utils/resellerDomain'
import { leerMarcaCache, guardarMarcaCache } from '@/utils/marcaCache'
import SplashMarca from '@/components/SplashMarca'
import {
  DEFAULT_BRANDING,
  getBrandingForClient,
  getResellerBranding,
  getResellerByHostname,
  applyBrandingColors,
  removeBrandingColors
} from '@/services/brandingService'
import { useLocation } from 'react-router-dom'
import { estaEnElChat, MARCA_CHAT } from '@/utils/dominioChat'

const BrandingContext = createContext({
  branding: DEFAULT_BRANDING,
  isLoading: true,
  refreshBranding: () => {},
})

export function BrandingProvider({ children }) {
  // La ruta importa para la marca: /chat lleva la de Cobrify Chat.
  const location = useLocation()
  const { user, isReseller, isAdmin, resellerData, isLoading: authLoading, getBusinessId } = useAuth()
  // ARRANCA desde la marca memorizada, no desde Cobrify: asi el login y el
  // navbar salen con la marca del reseller desde el primer render, sin el
  // parpadeo Cobrify->reseller mientras Firestore responde.
  const [branding, setBranding] = useState(() => {
    if (esDominioReseller()) {
      const cache = leerMarcaCache()
      if (cache?.primaryColor) {
        try { applyBrandingColors({ ...DEFAULT_BRANDING, ...cache }) } catch { /* SSR */ }
        return { ...DEFAULT_BRANDING, ...cache }
      }
    }
    return DEFAULT_BRANDING
  })
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

  // Al resolverse una marca REAL en dominio de reseller, se memoriza para el
  // proximo arranque, y se retira el puente pre-React que pinta index.html.
  // La marca por defecto no se guarda: pisar la memoria con Cobrify (p. ej.
  // por un fallo de red) filtraria la marca equivocada al proximo arranque.
  useEffect(() => {
    if (!brandingLoaded) return
    document.getElementById('puente-marca')?.remove()
    if (!esDominioReseller()) return
    const esRealDelReseller = branding.primaryColor !== DEFAULT_BRANDING.primaryColor || branding.logoUrl
    if (esRealDelReseller) guardarMarcaCache(branding)
  }, [branding, brandingLoaded, location.pathname])

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

    // La bandeja del chat tiene marca propia y no la resuelve este contexto:
    // sin esta salida, al terminar de cargar la marca por defecto se volvia a
    // poner el titulo y el favicon de Cobrify encima de los de Cobrify Chat.
    //
    // Se mira la RUTA y no solo el host: /chat existe en cualquier dominio, y
    // entrando por cobrifyperu.com/chat la pestana quedaba con el favicon del
    // sistema de facturacion.
    if (estaEnElChat()) {
      document.title = MARCA_CHAT.nombre
      const ponerIcono = (selector, href) => {
        const el = document.querySelector(selector)
        if (el) el.setAttribute('href', href)
      }
      ponerIcono('link[rel="icon"]', MARCA_CHAT.favicon)
      ponerIcono('link[rel="shortcut icon"]', MARCA_CHAT.favicon)
      ponerIcono('link[rel="apple-touch-icon"]', MARCA_CHAT.iconoApple)
      const theme = document.querySelector('meta[name="theme-color"]')
      if (theme) theme.setAttribute('content', MARCA_CHAT.color)
      return
    }

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
    // Pieza única SplashMarca: la marca del reseller en su dominio (o neutro
    // sin memoria), el logo de Cobrify solo en los dominios propios.
    return <SplashMarca />
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
