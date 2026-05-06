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
 * Returns true if the URL points to something other than Cloudinary
 * (e.g. Firebase Storage, Unsplash, etc.) and is therefore a migration candidate.
 */
function needsMigration(url) {
  return typeof url === 'string' && url.length > 0 && !url.includes('res.cloudinary.com')
}

/**
 * Download a non-Cloudinary URL and re-upload to Cloudinary.
 * Returns the new Cloudinary URL, or null if the source can't be fetched.
 */
async function migrateOneUrl(url) {
  const response = await fetch(url)
  if (!response.ok) return null
  const blob = await response.blob()
  return await uploadToCloudinary(blob)
}

/**
 * Migrate product images from Firebase Storage to Cloudinary for a specific business.
 * Handles both legacy `imageUrl` (string) and modern `imageUrls` (array) fields.
 * @param {string} businessId
 * @param {function} onProgress - callback({ current, total, productName })
 * @returns {Promise<{ migrated: number, skipped: number, errors: number, total: number }>}
 */
export async function migrateBusinessImages(businessId, onProgress) {
  const { collection, getDocs, doc, updateDoc } = await import('firebase/firestore')
  const { db } = await import('@/lib/firebase')

  const productsRef = collection(db, 'businesses', businessId, 'products')
  const snapshot = await getDocs(productsRef)

  const products = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => {
      const legacyNeedsMigration = needsMigration(p.imageUrl)
      const arrayNeedsMigration = Array.isArray(p.imageUrls) && p.imageUrls.some(needsMigration)
      return legacyNeedsMigration || arrayNeedsMigration
    })

  const total = products.length
  let migrated = 0, skipped = 0, errors = 0

  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    onProgress?.({ current: i + 1, total, productName: product.name || product.id })

    try {
      const updates = {}
      let anyImageMigrated = false
      let anyImageSkipped = false

      // Migrar campo legacy `imageUrl` (string)
      if (needsMigration(product.imageUrl)) {
        const newUrl = await migrateOneUrl(product.imageUrl)
        if (newUrl) {
          updates.imageUrl = newUrl
          anyImageMigrated = true
        } else {
          anyImageSkipped = true
        }
      }

      // Migrar campo moderno `imageUrls` (array) — preserva orden, sólo reemplaza las que no son Cloudinary
      if (Array.isArray(product.imageUrls) && product.imageUrls.length > 0) {
        const newArray = []
        let arrayChanged = false
        for (const url of product.imageUrls) {
          if (needsMigration(url)) {
            const newUrl = await migrateOneUrl(url)
            if (newUrl) {
              newArray.push(newUrl)
              arrayChanged = true
              anyImageMigrated = true
            } else {
              newArray.push(url) // mantener original si falla la descarga
              anyImageSkipped = true
            }
          } else {
            newArray.push(url)
          }
        }
        if (arrayChanged) updates.imageUrls = newArray
      }

      if (Object.keys(updates).length > 0) {
        const productRef = doc(db, 'businesses', businessId, 'products', product.id)
        await updateDoc(productRef, updates)
      }

      if (anyImageMigrated) migrated++
      else if (anyImageSkipped) skipped++
    } catch (err) {
      console.error(`Error migrando ${product.name}:`, err)
      errors++
    }
  }

  return { migrated, skipped, errors, total }
}

/**
 * Migrate Firebase Storage images to Cloudinary across ALL businesses.
 * Iterates over every top-level user (excluding sub-users) and runs
 * `migrateBusinessImages` for each.
 *
 * @param {function} onProgress - callback({
 *   businessIndex, totalBusinesses, businessId, businessName,
 *   imageCurrent, imageTotal, productName
 * })
 * @returns {Promise<{
 *   totalBusinesses: number,
 *   businessesProcessed: number,
 *   businessesWithMigrations: number,
 *   businessesWithErrors: number,
 *   totalMigrated: number,
 *   totalSkipped: number,
 *   totalErrors: number,
 *   perBusiness: Array<{ businessId, businessName, migrated, skipped, errors, total, failed?: boolean, errorMessage?: string }>
 * }>}
 */
export async function migrateAllBusinessImages(onProgress) {
  const { collection, getDocs } = await import('firebase/firestore')
  const { db } = await import('@/lib/firebase')

  const usersSnapshot = await getDocs(collection(db, 'users'))
  const businessOwners = usersSnapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u => !u.ownerId) // excluir sub-usuarios

  const totalBusinesses = businessOwners.length
  let businessesProcessed = 0
  let businessesWithMigrations = 0
  let businessesWithErrors = 0
  let totalMigrated = 0
  let totalSkipped = 0
  let totalErrors = 0
  const perBusiness = []

  for (let bi = 0; bi < businessOwners.length; bi++) {
    const owner = businessOwners[bi]
    const businessId = owner.id
    const businessName = owner.businessName || owner.razonSocial || owner.email || businessId

    onProgress?.({
      businessIndex: bi + 1,
      totalBusinesses,
      businessId,
      businessName,
      imageCurrent: 0,
      imageTotal: 0,
      productName: '',
    })

    try {
      const result = await migrateBusinessImages(businessId, (p) => {
        onProgress?.({
          businessIndex: bi + 1,
          totalBusinesses,
          businessId,
          businessName,
          imageCurrent: p.current,
          imageTotal: p.total,
          productName: p.productName,
        })
      })

      totalMigrated += result.migrated
      totalSkipped += result.skipped
      totalErrors += result.errors
      if (result.migrated > 0) businessesWithMigrations++
      perBusiness.push({ businessId, businessName, ...result })
    } catch (err) {
      console.error(`Error migrando negocio ${businessName} (${businessId}):`, err)
      businessesWithErrors++
      perBusiness.push({
        businessId,
        businessName,
        migrated: 0,
        skipped: 0,
        errors: 0,
        total: 0,
        failed: true,
        errorMessage: err.message,
      })
    } finally {
      businessesProcessed++
    }
  }

  return {
    totalBusinesses,
    businessesProcessed,
    businessesWithMigrations,
    businessesWithErrors,
    totalMigrated,
    totalSkipped,
    totalErrors,
    perBusiness,
  }
}
