/**
 * Cloudinary image upload and optimization utilities
 */

const CLOUD_NAME = 'dnrj1guvs'
const UPLOAD_PRESET = 'cobrify_unsigned'

/**
 * Upload a file to Cloudinary via unsigned upload
 * @param {File|Blob} file
 * @returns {Promise<string>} Cloudinary secure URL
 */
export async function uploadToCloudinary(file) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', UPLOAD_PRESET)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || 'Error al subir imagen a Cloudinary')
  }

  const data = await response.json()
  return data.secure_url
}

/**
 * Optimize a Cloudinary URL with transformation parameters
 * Returns original URL unchanged if it's not a Cloudinary URL
 * @param {string} url
 * @param {'card'|'thumbnail'|'detail'|'blur'|'logo_square'|'logo_landscape'|'cover_desktop'|'cover_mobile'} size
 * @returns {string}
 */
export function optimizeImageUrl(url, size = 'card') {
  if (!url || !url.includes('res.cloudinary.com')) return url || ''

  const configs = {
    // Producto
    thumbnail: 'c_fill,w_200,h_200,q_auto:low,f_auto,dpr_auto',
    card: 'c_limit,w_400,q_auto:eco,f_auto,dpr_auto',
    detail: 'c_limit,w_800,q_auto,f_auto,dpr_auto',
    blur: 'c_fill,w_40,h_40,q_10,f_auto,e_blur:500',
    // Catálogo público — logos (c_limit no agranda si el original es más chico)
    logo_square: 'c_limit,w_400,q_auto,f_auto,dpr_auto',
    logo_landscape: 'c_limit,w_640,q_auto,f_auto,dpr_auto',
    // Catálogo público — portadas (c_fill recorta para llenar el área)
    cover_desktop: 'c_fill,w_1920,h_600,q_auto:good,f_auto,dpr_auto',
    cover_mobile: 'c_fill,w_800,h_500,q_auto:good,f_auto,dpr_auto',
  }

  const transforms = configs[size] || configs.card
  return url.replace('/upload/', `/upload/${transforms}/`)
}

/**
 * Migrate product images from Firebase Storage to Cloudinary for a specific business
 * @param {string} businessId
 * @param {function} onProgress - callback({ current, total, productName })
 * @returns {Promise<{ migrated: number, skipped: number, errors: number }>}
 */
export async function migrateBusinessImages(businessId, onProgress) {
  const { collection, getDocs, doc, updateDoc } = await import('firebase/firestore')
  const { db } = await import('@/lib/firebase')

  const productsRef = collection(db, 'businesses', businessId, 'products')
  const snapshot = await getDocs(productsRef)

  const products = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.imageUrl && !p.imageUrl.includes('res.cloudinary.com'))

  const total = products.length
  let migrated = 0, skipped = 0, errors = 0

  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    onProgress?.({ current: i + 1, total, productName: product.name || product.id })

    try {
      // Descargar imagen desde Firebase Storage
      const response = await fetch(product.imageUrl)
      if (!response.ok) { skipped++; continue }
      const blob = await response.blob()

      // Subir a Cloudinary
      const cloudinaryUrl = await uploadToCloudinary(blob)

      // Actualizar Firestore
      const productRef = doc(db, 'businesses', businessId, 'products', product.id)
      await updateDoc(productRef, { imageUrl: cloudinaryUrl })

      migrated++
    } catch (err) {
      console.error(`Error migrando ${product.name}:`, err)
      errors++
    }
  }

  return { migrated, skipped, errors, total }
}
