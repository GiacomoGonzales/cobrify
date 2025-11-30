import { storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'

/**
 * Comprime y redimensiona una imagen antes de subirla
 * @param {File} file - El archivo de imagen
 * @param {number} maxWidth - Ancho máximo (default 800px)
 * @param {number} quality - Calidad JPEG (0-1, default 0.8)
 * @returns {Promise<Blob>} - Blob de la imagen comprimida
 */
const compressImage = (file, maxWidth = 800, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new window.Image()
      img.src = event.target.result
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Redimensionar si es más ancha que maxWidth
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Error al comprimir imagen'))
            }
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => reject(new Error('Error al cargar imagen'))
    }
    reader.onerror = () => reject(new Error('Error al leer archivo'))
  })
}

/**
 * Sube una imagen de producto a Firebase Storage
 * @param {string} businessId - ID del negocio
 * @param {string} productId - ID del producto
 * @param {File} file - Archivo de imagen
 * @returns {Promise<string>} - URL de descarga de la imagen
 */
export const uploadProductImage = async (businessId, productId, file) => {
  try {
    // Validar tipo de archivo
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      throw new Error('Tipo de archivo no válido. Use JPG, PNG, WebP o GIF.')
    }

    // Validar tamaño (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      throw new Error('La imagen es muy grande. Máximo 5MB.')
    }

    // Comprimir imagen
    console.log('📸 Comprimiendo imagen...')
    const compressedBlob = await compressImage(file)

    // Generar nombre único
    const timestamp = Date.now()
    const fileName = `${productId}_${timestamp}.jpg`
    const storagePath = `products/${businessId}/${fileName}`

    // Subir a Storage
    console.log('☁️ Subiendo imagen a Storage...')
    const storageRef = ref(storage, storagePath)
    await uploadBytes(storageRef, compressedBlob, {
      contentType: 'image/jpeg',
      customMetadata: {
        productId,
        businessId,
        uploadedAt: new Date().toISOString()
      }
    })

    // Obtener URL de descarga
    const downloadURL = await getDownloadURL(storageRef)
    console.log('✅ Imagen subida exitosamente:', downloadURL)

    return downloadURL
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
