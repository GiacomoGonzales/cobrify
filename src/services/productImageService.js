import { storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { uploadToCloudinary } from '@/utils/cloudinary'

// Detección única de soporte WebP en el navegador
const supportsWebP = (() => {
  try {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    return c.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
})()

/**
 * Comprime y redimensiona una imagen antes de subirla.
 * Por default exporta a WebP (mejor compresión que JPEG/PNG, soporta alpha).
 * Fallback a JPEG si el navegador no soporta WebP, o a PNG si la imagen
 * tiene transparencia y JPEG es la única alternativa.
 *
 * No hace upscale: si la imagen original es menor que maxWidth/maxHeight,
 * conserva el tamaño original.
 *
 * @param {File} file
 * @param {Object} [options]
 * @param {number} [options.maxWidth=1280]
 * @param {number} [options.maxHeight=null]
 * @param {number} [options.quality=0.82]  0–1
 * @param {boolean} [options.preferWebP=true]
 * @returns {Promise<File>} archivo comprimido (con nombre y MIME apropiados)
 */
export const compressImage = (file, options = {}) => {
  const {
    maxWidth = 1280,
    maxHeight = null,
    quality = 0.82,
    preferWebP = true,
  } = options

  return new Promise((resolve, reject) => {
    // SVG no se maneja consistentemente con canvas → subir original.
    if (!file || (file.type && file.type.includes('svg'))) {
      return resolve(file)
    }

    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new window.Image()
      img.src = event.target.result
      img.onload = () => {
        const ratioW = img.width > maxWidth ? maxWidth / img.width : 1
        const ratioH = (maxHeight && img.height > maxHeight) ? maxHeight / img.height : 1
        const ratio = Math.min(ratioW, ratioH, 1) // sin upscale
        const width = Math.round(img.width * ratio)
        const height = Math.round(img.height * ratio)

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        const hasAlpha =
          file.type === 'image/png' ||
          file.type === 'image/gif' ||
          file.type === 'image/webp'

        let outMime = 'image/jpeg'
        if (preferWebP && supportsWebP) outMime = 'image/webp'
        else if (hasAlpha) outMime = 'image/png'

        const outQuality = outMime === 'image/png' ? undefined : quality

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Error al comprimir imagen'))
            }
            const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')
            const ext =
              outMime === 'image/webp' ? 'webp' :
              outMime === 'image/png'  ? 'png'  : 'jpg'
            resolve(new File([blob], `${baseName}.${ext}`, { type: outMime }))
          },
          outMime,
          outQuality
        )
      }
      img.onerror = () => reject(new Error('Error al cargar imagen'))
    }
    reader.onerror = () => reject(new Error('Error al leer archivo'))
  })
}

/**
 * Comprime con fallback: si la compresión falla por cualquier motivo,
 * devuelve el archivo original para no bloquear al usuario.
 */
export const compressWithFallback = async (file, options) => {
  try {
    return await compressImage(file, options)
  } catch (e) {
    console.warn('⚠️ Compresión falló, subiendo original:', e?.message || e)
    return file
  }
}

// Presets por caso de uso — usados en uploadProductImage y en Settings.jsx
export const compressForProduct        = (file) => compressWithFallback(file, { maxWidth: 1280, quality: 0.82 })
export const compressForLogoSquare     = (file) => compressWithFallback(file, { maxWidth: 600,  quality: 0.85 })
export const compressForLogoLandscape  = (file) => compressWithFallback(file, { maxWidth: 800,  quality: 0.85 })
export const compressForCoverDesktop   = (file) => compressWithFallback(file, { maxWidth: 1920, maxHeight: 800, quality: 0.85 })
export const compressForCoverMobile    = (file) => compressWithFallback(file, { maxWidth: 800,  maxHeight: 600, quality: 0.85 })

/**
 * Sube una imagen de producto a Firebase Storage
 * @param {string} businessId - ID del negocio
 * @param {string} productId - ID del producto
 * @param {File} file - Archivo de imagen
 * @returns {Promise<string>} - URL de descarga de la imagen
 */
export const uploadProductImage = async (businessId, productId, file) => {
  try {
    // Validar tipo de archivo (flexible para Android donde file.type puede estar vacío)
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
    const fileName = (file.name || '').toLowerCase()
    const hasValidType = validTypes.includes(file.type)
    const hasValidExt = validExtensions.some(ext => fileName.endsWith(ext))
    if (!hasValidType && !hasValidExt) {
      throw new Error('Tipo de archivo no válido. Use JPG, PNG, WebP o GIF.')
    }

    // Validar tamaño (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      throw new Error('La imagen es muy grande. Máximo 5MB.')
    }

    // Comprimir cliente-side antes de subir (WebP, máx 1280px, q≈0.82).
    // Esto reduce drásticamente el storage usado en Cloudinary.
    const compressed = await compressForProduct(file)
    if (compressed !== file) {
      console.log(
        `🗜️ Imagen comprimida: ${(file.size / 1024).toFixed(1)}KB → ${(compressed.size / 1024).toFixed(1)}KB`
      )
    }

    console.log('☁️ Subiendo imagen a Cloudinary...')
    const cloudinaryUrl = await uploadToCloudinary(compressed)
    console.log('✅ Imagen subida exitosamente:', cloudinaryUrl)

    return cloudinaryUrl
  } catch (error) {
    console.error('❌ Error al subir imagen:', error)
    throw error
  }
}

/**
 * Elimina una imagen de producto de Firebase Storage
 * @param {string} imageUrl - URL de la imagen a eliminar
 */
export const deleteProductImage = async (imageUrl) => {
  try {
    if (!imageUrl || !imageUrl.includes('firebase')) {
      console.log('No hay imagen válida para eliminar')
      return
    }

    // Extraer la ruta del storage desde la URL
    const storageRef = ref(storage, imageUrl)
    await deleteObject(storageRef)
    console.log('🗑️ Imagen eliminada del storage')
  } catch (error) {
    // Si el archivo no existe, ignorar el error
    if (error.code === 'storage/object-not-found') {
      console.log('Imagen ya no existe en storage')
      return
    }
    console.error('Error al eliminar imagen:', error)
    // No lanzar error para no bloquear otras operaciones
  }
}

/**
 * Genera una URL de preview local para una imagen
 * @param {File} file - Archivo de imagen
 * @returns {string} - URL de preview
 */
export const createImagePreview = (file) => {
  return URL.createObjectURL(file)
}

/**
 * Libera la memoria de una URL de preview
 * @param {string} url - URL de preview
 */
export const revokeImagePreview = (url) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}
