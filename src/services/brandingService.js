import { doc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'

// Branding por defecto (Cobrify) - Azul según Tailwind primary
export const DEFAULT_BRANDING = {
  companyName: 'Cobrify',
  logoUrl: null,
  primaryColor: '#2563eb',    // primary-600 (blue)
  secondaryColor: '#1d4ed8',  // primary-700 (blue)
  accentColor: '#3b82f6',     // primary-500 (blue)
  whatsapp: '',               // Número de WhatsApp para la landing
  supportEmail: '',            // Email de contacto para términos/soporte
  websiteUrl: '',              // URL del sitio web
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
      // websiteUrl: si el reseller no configuró branding.websiteUrl explícitamente,
      // usar su customDomain (más útil que un fallback a Cobrify). Se usa en footers
      // de PDFs, tickets, etc. Limpiamos protocolo y trailing slash.
      const cleanDomain = (data.customDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
      return {
        ...DEFAULT_BRANDING,
        companyName: data.branding?.companyName || data.companyName || DEFAULT_BRANDING.companyName,
        logoUrl: data.branding?.logoUrl || null,
        primaryColor: data.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
        secondaryColor: data.branding?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
        accentColor: data.branding?.accentColor || DEFAULT_BRANDING.accentColor,
        whatsapp: data.branding?.whatsapp || data.phone || '',
        supportEmail: data.branding?.supportEmail || data.email || '',
        websiteUrl: data.branding?.websiteUrl || cleanDomain || '',
        customDomain: cleanDomain || '',
      }
    }
  } catch (error) {
    console.error('Error getting reseller branding:', error)
  }

  return DEFAULT_BRANDING
}

/**
 * Datos de COBRO del reseller, para mostrarlos cuando vence la suscripción de uno de SUS
 * clientes (así el cliente le paga al reseller, no a Cobrify). El reseller los configura
 * en su panel (ResellerSettings). yapeName/titular caen al nombre de la empresa si faltan.
 * Devuelve { success, data: { yapeNumber, yapeName, bcpAccount, bcpCci, titular, phone, whatsapp } }.
 */
export async function getResellerPaymentInfo(resellerId) {
  if (!resellerId) return { success: false, data: null }
  try {
    const resellerDoc = await getDoc(doc(db, 'resellers', resellerId))
    if (resellerDoc.exists()) {
      const d = resellerDoc.data()
      const pay = d.paymentInfo || {}
      return {
        success: true,
        data: {
          yapeNumber: pay.yapeNumber || '',
          yapeName: pay.yapeName || d.companyName || '',
          bcpAccount: pay.bcpAccount || '',
          bcpCci: pay.bcpCci || '',
          titular: pay.titular || d.companyName || '',
          phone: d.phone || '',
          whatsapp: d.branding?.whatsapp || d.phone || '',
        },
      }
    }
  } catch (error) {
    console.error('Error getting reseller payment info:', error)
  }
  return { success: false, data: null }
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
        // Priorizar SIEMPRE el branding ACTUAL del reseller. Si el reseller cambió su marca
        // (nombre/logo/colores) DESPUÉS de crear al cliente, el snapshot `resellerBranding`
        // guardado en la suscripción queda viejo (el cliente seguía viendo "Cobrify").
        // Leer el vigente hace que el cliente siempre vea la marca actual del reseller
        // (nombre, logo, colores, dominio y contacto de soporte).
        if (subscription.resellerId) {
          try {
            const fresh = await getResellerBranding(subscription.resellerId)
            if (fresh && fresh.companyName && fresh.companyName !== DEFAULT_BRANDING.companyName) {
              console.log('✅ Using CURRENT reseller branding for client:', fresh.companyName)
              return fresh
            }
          } catch (e) {
            console.warn('No se pudo obtener branding actual del reseller:', e.message)
          }
        }

        // Fallback: snapshot guardado en la suscripción (si no hay resellerId, el fetch
        // falló, o el reseller aún no configuró su marca).
        if (subscription.resellerBranding) {
          console.log('✅ Using branding snapshot from subscription (fallback)')
          return { ...DEFAULT_BRANDING, ...subscription.resellerBranding }
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
        socialImageUrl: branding.socialImageUrl || null,
        heroImageUrl: branding.heroImageUrl || null,
        primaryColor: branding.primaryColor || DEFAULT_BRANDING.primaryColor,
        secondaryColor: branding.secondaryColor || DEFAULT_BRANDING.secondaryColor,
        accentColor: branding.accentColor || DEFAULT_BRANDING.accentColor,
        whatsapp: branding.whatsapp || '',
        supportEmail: branding.supportEmail || '',
        websiteUrl: branding.websiteUrl || '',
        description: branding.description || '',
        // Precios de la landing page
        priceMonthly: branding.priceMonthly ?? 29.90,
        priceSemester: branding.priceSemester ?? 149.90,
        priceAnnual: branding.priceAnnual ?? 199.90,
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
 * @param {string} type - Tipo de imagen: 'logo', 'social' o 'hero'
 * @returns {Promise<string>} - La URL de descarga del logo
 *
 * Nota: Esta función solo sube el archivo a Storage y retorna la URL.
 * El caller debe guardar la URL en Firestore usando updateResellerBranding.
 */
export async function uploadResellerLogo(storageUserId, file, type = 'logo') {
  if (!storageUserId || !file) throw new Error('User ID and file are required')

  try {
    // Crear referencia en storage usando el UID de Auth (coincide con las reglas de Storage)
    const fileExtension = file.name.split('.').pop()
    const imageName = type === 'social' ? 'social-image' : type === 'hero' ? 'hero-image' : 'logo'
    const fileName = `reseller-logos/${storageUserId}/${imageName}.${fileExtension}`
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
 * Obtiene el reseller por hostname (dominio personalizado)
 * @param {string} hostname - El hostname actual (ej: factuperu.com)
 * @returns {Promise<{resellerId: string, branding: object} | null>}
 */
export async function getResellerByHostname(hostname) {
  if (!hostname) return null

  // Ignorar localhost y dominios de desarrollo
  const ignoredDomains = [
    'localhost',
    '127.0.0.1',
    'vercel.app',
    'firebaseapp.com',
    'web.app',
    'cobrifyperu.com',
    'cobrify.com'
  ]

  if (ignoredDomains.some(domain => hostname.includes(domain))) {
    console.log('ℹ️ Ignored domain:', hostname)
    return null
  }

  try {
    // Normalizar hostname: quitar www. si existe y convertir a minúsculas
    let normalizedHostname = hostname.toLowerCase()
    if (normalizedHostname.startsWith('www.')) {
      normalizedHostname = normalizedHostname.substring(4)
    }

    console.log('🔍 Searching reseller by custom domain:', normalizedHostname, '(original:', hostname, ')')

    // Buscar reseller por customDomain (sin www)
    const q = query(
      collection(db, 'resellers'),
      where('customDomain', '==', normalizedHostname)
    )
    const snapshot = await getDocs(q)

    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0]
      const data = docSnap.data()
      console.log('✅ Found reseller by custom domain:', data.companyName)
      return {
        resellerId: docSnap.id,
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
          supportEmail: data.branding?.supportEmail || data.email || '',
          websiteUrl: data.branding?.websiteUrl || normalizedHostname || '',
          // Precios de la landing page
          priceMonthly: data.branding?.priceMonthly ?? 29.90,
          priceSemester: data.branding?.priceSemester ?? 149.90,
          priceAnnual: data.branding?.priceAnnual ?? 199.90,
        }
      }
    }

    console.log('⚠️ No reseller found for hostname:', normalizedHostname)
    return null
  } catch (error) {
    console.error('Error getting reseller by hostname:', error)
    return null
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
