import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'

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
 * Obtiene el branding para un cliente basado en su resellerId
 */
export async function getBrandingForClient(userId) {
  console.log('🎨 getBrandingForClient called with userId:', userId)
  if (!userId) return DEFAULT_BRANDING

  try {
    // Obtener la suscripción del cliente para ver si tiene reseller
    const subscriptionDoc = await getDoc(doc(db, 'subscriptions', userId))
    console.log('📋 Subscription exists:', subscriptionDoc.exists())

    if (subscriptionDoc.exists()) {
      const subscription = subscriptionDoc.data()
      console.log('📋 Subscription data:', {
        createdByReseller: subscription.createdByReseller,
        resellerId: subscription.resellerId
      })

      // Si fue creado por un reseller, obtener el branding del reseller
      if (subscription.createdByReseller && subscription.resellerId) {
        console.log('🔍 Fetching reseller branding for:', subscription.resellerId)
        const branding = await getResellerBranding(subscription.resellerId)
        console.log('✅ Loaded branding:', branding)
        return branding
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
