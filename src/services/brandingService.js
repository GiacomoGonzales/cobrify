import { doc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'

// Dominio base para subdominios de resellers
export const BASE_DOMAIN = 'cobrifyperu.com'

// Branding por defecto (Cobrify) - Azul según Tailwind primary
export const DEFAULT_BRANDING = {
  companyName: 'Cobrify',
  logoUrl: null,
  primaryColor: '#2563eb',    // primary-600 (blue)
  secondaryColor: '#1d4ed8',  // primary-700 (blue)
  accentColor: '#3b82f6',     // primary-500 (blue)
}

/**
 * Obtiene el branding de un reseller
 */
export async function getResellerBranding(resellerId) {
  if (!resellerId) return DEFAULT_BRANDING

  try {
    const resellerDoc = await getDoc(doc(db, 'resellers', resellerId))
    if (resellerDoc.exists()) {
      const data = resellerDoc.data()
      return {
        ...DEFAULT_BRANDING,
        companyName: data.branding?.companyName || data.companyName || DEFAULT_BRANDING.companyName,
        logoUrl: data.branding?.logoUrl || null,
        primaryColor: data.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
        secondaryColor: data.branding?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
        accentColor: data.branding?.accentColor || DEFAULT_BRANDING.accentColor,
      }
    }
  } catch (error) {
    console.error('Error getting reseller branding:', error)
  }

  return DEFAULT_BRANDING
}

/**
 * Obtiene el branding para un cliente basado en su suscripción
 * El branding se guarda en la suscripción cuando el reseller crea al cliente
 * Para clientes antiguos, se obtiene del documento del reseller
 */
export async function getBrandingForClient(userId) {
  console.log('🎨 getBrandingForClient called with userId:', userId)
  if (!userId) return DEFAULT_BRANDING

  try {
    // Obtener la suscripción del cliente
    const subscriptionDoc = await getDoc(doc(db, 'subscriptions', userId))
    console.log('📋 Subscription exists:', subscriptionDoc.exists())

    if (subscriptionDoc.exists()) {
      const subscription = subscriptionDoc.data()
      console.log('📋 Subscription data:', {
        createdByReseller: subscription.createdByReseller,
        hasResellerBranding: !!subscription.resellerBranding,
        resellerId: subscription.resellerId
      })

      // Si fue creado por un reseller
      if (subscription.createdByReseller) {
        // Opción 1: Branding guardado en la suscripción (clientes nuevos)
        if (subscription.resellerBranding) {
          console.log('✅ Using branding from subscription:', subscription.resellerBranding)
          return {
            ...DEFAULT_BRANDING,
            ...subscription.resellerBranding
          }
        }

        // Opción 2: Obtener del reseller (clientes antiguos)
        if (subscription.resellerId) {
          console.log('🔍 Fetching branding from reseller:', subscription.resellerId)
          const branding = await getResellerBranding(subscription.resellerId)
          console.log('✅ Loaded branding from reseller:', branding)
          return branding
        }
      }
    }
  } catch (error) {
    console.error('Error getting branding for client:', error)
  }

  console.log('⚠️ Using default branding')
  return DEFAULT_BRANDING
}

/**
 * Actualiza el branding de un reseller
 */
export async function updateResellerBranding(resellerId, branding) {
  if (!resellerId) throw new Error('Reseller ID is required')

  try {
    await updateDoc(doc(db, 'resellers', resellerId), {
      branding: {
        companyName: branding.companyName || '',
        logoUrl: branding.logoUrl || null,
        primaryColor: branding.primaryColor || DEFAULT_BRANDING.primaryColor,
        secondaryColor: branding.secondaryColor || DEFAULT_BRANDING.secondaryColor,
        accentColor: branding.accentColor || DEFAULT_BRANDING.accentColor,
      },
      updatedAt: Timestamp.now()
    })
    return true
  } catch (error) {
    console.error('Error updating reseller branding:', error)
    throw error
  }
}

/**
 * Sube el logo del reseller a Firebase Storage
 * @param {string} storageUserId - El UID de Firebase Auth (para la ruta de Storage)
 * @param {File} file - El archivo a subir
 * @returns {Promise<string>} - La URL de descarga del logo
 *
 * Nota: Esta función solo sube el archivo a Storage y retorna la URL.
 * El caller debe guardar la URL en Firestore usando updateResellerBranding.
 */
export async function uploadResellerLogo(storageUserId, file) {
  if (!storageUserId || !file) throw new Error('User ID and file are required')

  try {
    // Crear referencia en storage usando el UID de Auth (coincide con las reglas de Storage)
    const fileExtension = file.name.split('.').pop()
    const fileName = `reseller-logos/${storageUserId}/logo.${fileExtension}`
    const storageRef = ref(storage, fileName)

    // Subir archivo
    await uploadBytes(storageRef, file)

    // Obtener URL de descarga
    const downloadUrl = await getDownloadURL(storageRef)

    return downloadUrl
  } catch (error) {
    console.error('Error uploading reseller logo:', error)
    throw error
  }
}

/**
 * Aplica los colores del branding como CSS variables
 */
export function applyBrandingColors(branding) {
  const root = document.documentElement

  root.style.setProperty('--brand-primary', branding.primaryColor || DEFAULT_BRANDING.primaryColor)
  root.style.setProperty('--brand-secondary', branding.secondaryColor || DEFAULT_BRANDING.secondaryColor)
  root.style.setProperty('--brand-accent', branding.accentColor || DEFAULT_BRANDING.accentColor)

  // Calcular versiones claras para backgrounds
  root.style.setProperty('--brand-primary-light', hexToRgba(branding.primaryColor || DEFAULT_BRANDING.primaryColor, 0.1))
  root.style.setProperty('--brand-primary-medium', hexToRgba(branding.primaryColor || DEFAULT_BRANDING.primaryColor, 0.2))
}

/**
 * Remueve los colores de branding personalizados
 */
export function removeBrandingColors() {
  const root = document.documentElement
  root.style.removeProperty('--brand-primary')
  root.style.removeProperty('--brand-secondary')
  root.style.removeProperty('--brand-accent')
  root.style.removeProperty('--brand-primary-light')
  root.style.removeProperty('--brand-primary-medium')
}

/**
 * Convierte hex a rgba
 */
function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(37, 99, 235, ${alpha})` // primary-600 (blue) default

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (result) {
    const r = parseInt(result[1], 16)
    const g = parseInt(result[2], 16)
    const b = parseInt(result[3], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return `rgba(37, 99, 235, ${alpha})`
}

/**
 * Genera un subdomain slug a partir del nombre de la empresa
 * Por ejemplo: "Factu Perú SAC" -> "factuperu"
 */
export function generateSubdomain(companyName) {
  if (!companyName) return ''
  return companyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9]/g, '') // Solo letras y números
    .slice(0, 20) // Máximo 20 caracteres
}

/**
 * Obtiene el reseller por hostname (subdominio o dominio personalizado)
 * @param {string} hostname - El hostname actual (ej: factuperu.cobrifyperu.com o factuperu.com)
 * @returns {Promise<{resellerId: string, branding: object} | null>}
 */
export async function getResellerByHostname(hostname) {
  if (!hostname) return null

  // Ignorar localhost y dominios de desarrollo
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    return null
  }

  try {
    // Caso 1: Es un subdominio de cobrifyperu.com (factuperu.cobrifyperu.com)
    if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
      const subdomain = hostname.replace(`.${BASE_DOMAIN}`, '')
      console.log('🔍 Searching reseller by subdomain:', subdomain)

      // Buscar reseller por subdomain
      const q = query(
        collection(db, 'resellers'),
        where('subdomain', '==', subdomain)
      )
      const snapshot = await getDocs(q)

      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0]
        const data = docSnap.data()
        console.log('✅ Found reseller by subdomain:', data.companyName)
        return {
          resellerId: docSnap.id,
          branding: {
            ...DEFAULT_BRANDING,
            companyName: data.branding?.companyName || data.companyName || DEFAULT_BRANDING.companyName,
            logoUrl: data.branding?.logoUrl || null,
            primaryColor: data.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
            secondaryColor: data.branding?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
            accentColor: data.branding?.accentColor || DEFAULT_BRANDING.accentColor,
          }
        }
      }
    }

    // Caso 2: Es un dominio personalizado (factuperu.com)
    // Buscar por customDomain
    console.log('🔍 Searching reseller by custom domain:', hostname)
    const q = query(
      collection(db, 'resellers'),
      where('customDomain', '==', hostname)
    )
    const snapshot = await getDocs(q)

    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0]
      const data = docSnap.data()
      console.log('✅ Found reseller by custom domain:', data.companyName)
      return {
        resellerId: docSnap.id,
        branding: {
          ...DEFAULT_BRANDING,
          companyName: data.branding?.companyName || data.companyName || DEFAULT_BRANDING.companyName,
          logoUrl: data.branding?.logoUrl || null,
          primaryColor: data.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
          secondaryColor: data.branding?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
          accentColor: data.branding?.accentColor || DEFAULT_BRANDING.accentColor,
        }
      }
    }

    console.log('⚠️ No reseller found for hostname:', hostname)
    return null
  } catch (error) {
    console.error('Error getting reseller by hostname:', error)
    return null
  }
}

/**
 * Verifica si un subdomain está disponible
 */
export async function isSubdomainAvailable(subdomain, excludeResellerId = null) {
  if (!subdomain) return false

  try {
    const q = query(
      collection(db, 'resellers'),
      where('subdomain', '==', subdomain)
    )
    const snapshot = await getDocs(q)

    // Si no hay resultados, está disponible
    if (snapshot.empty) return true

    // Si hay resultado pero es el mismo reseller, está disponible
    if (excludeResellerId && snapshot.docs[0].id === excludeResellerId) {
      return true
    }

    return false
  } catch (error) {
    console.error('Error checking subdomain:', error)
    return false
  }
}

/**
 * Colores predefinidos para elegir
 */
export const PRESET_COLORS = [
  { name: 'Esmeralda', primary: '#10B981', secondary: '#059669' },
  { name: 'Azul', primary: '#3B82F6', secondary: '#2563EB' },
  { name: 'Violeta', primary: '#8B5CF6', secondary: '#7C3AED' },
  { name: 'Rosa', primary: '#EC4899', secondary: '#DB2777' },
  { name: 'Naranja', primary: '#F97316', secondary: '#EA580C' },
  { name: 'Rojo', primary: '#EF4444', secondary: '#DC2626' },
  { name: 'Cyan', primary: '#06B6D4', secondary: '#0891B2' },
  { name: 'Indigo', primary: '#6366F1', secondary: '#4F46E5' },
]
