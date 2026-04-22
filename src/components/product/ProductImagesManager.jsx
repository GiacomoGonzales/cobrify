import { useState, useRef, useEffect } from 'react'
import { Upload, Camera, X, Star } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useToast } from '@/contexts/ToastContext'
import { createImagePreview, revokeImagePreview } from '@/services/productImageService'

/**
 * Grilla multi-foto para productos. Soporta drag & drop para reordenar,
 * máximo 5 imágenes, portada = primera imagen.
 *
 * Estado controlado: cada imagen es { id, file: File|null, previewUrl, uploadedUrl: string|null }.
 * - file !== null → imagen nueva pendiente de subir (previewUrl es un blob:).
 * - uploadedUrl !== null → imagen ya en Cloudinary.
 */
export default function ProductImagesManager({ images, onChange, maxImages = 5, disabled = false }) {
  const toast = useToast()
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const fileInputRef = useRef(null)

  // Limpiar blobs al desmontar
  useEffect(() => {
    return () => {
      images.forEach(img => {
        if (img.previewUrl?.startsWith('blob:')) {
          revokeImagePreview(img.previewUrl)
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remainingSlots = maxImages - images.length

  const validateFile = (file) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
    const fileName = (file.name || '').toLowerCase()
    const hasValidType = validTypes.includes(file.type)
    const hasValidExt = validExtensions.some(ext => fileName.endsWith(ext))
    if (!hasValidType && !hasValidExt) {
      toast.error('Formato no válido. Usa JPG, PNG, WebP o GIF')
      return false
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar 5MB')
      return false
    }
    return true
  }

  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const valid = files.filter(validateFile).slice(0, remainingSlots)
    if (!valid.length) return

    if (files.length > remainingSlots) {
      toast.info(`Solo se agregaron ${valid.length} imagen(es). Máximo ${maxImages} por producto.`)
    }

    const newItems = valid.map((file, i) => ({
      id: `pending-${Date.now()}-${i}`,
      file,
      previewUrl: createImagePreview(file),
      uploadedUrl: null,
    }))

    onChange([...images, ...newItems])
    // Resetear input para permitir reseleccionar el mismo archivo
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleTakePhoto = async () => {
    if (!Capacitor.isNativePlatform()) return
    if (remainingSlots <= 0) {
      toast.info(`Máximo ${maxImages} imágenes por producto`)
      return
    }
    try {
      const photo = await CapacitorCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      })
      if (photo.webPath) {
        const response = await fetch(photo.webPath)
        const blob = await response.blob()
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
        const item = {
          id: `pending-${Date.now()}`,
          file,
          previewUrl: photo.webPath,
          uploadedUrl: null,
        }
        onChange([...images, item])
      }
    } catch (error) {
      if (!error.message?.includes('cancelled')) {
        console.error('Error taking photo:', error)
        toast.error('Error al tomar foto')
      }
    }
  }

  const handleRemove = (index) => {
    const removed = images[index]
    if (removed?.previewUrl?.startsWith('blob:')) {
      revokeImagePreview(removed.previewUrl)
    }
    onChange(images.filter((_, i) => i !== index))
  }

  const handleDragStart = (index) => {
    if (disabled) return
    setDragIndex(index)
  }

  const handleDragOver = (e, index) => {
    if (disabled) return
    e.preventDefault()
    setOverIndex(index)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

  const handleDrop = (e, dropIndex) => {
    if (disabled) return
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIndex) {
      handleDragEnd()
      return
    }
    const reordered = [...images]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    onChange(reordered)
    handleDragEnd()
  }

  return (
    <div className="space-y-2">
      {/* Grilla de imágenes */}
      {images.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((img, index) => {
            const isCover = index === 0
            const isDragging = dragIndex === index
            const isOver = overIndex === index && dragIndex !== index
            return (
              <div
                key={img.id}
                draggable={!disabled}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={() => setOverIndex(null)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 group transition-all ${
                  isCover ? 'border-primary-500' : 'border-gray-300'
                } ${isDragging ? 'opacity-40' : ''} ${
                  isOver ? 'ring-2 ring-primary-400 ring-offset-1' : ''
                } ${disabled ? '' : 'cursor-move'}`}
                title={isCover ? 'Portada (se muestra primero)' : `Imagen ${index + 1}`}
              >
                <img
                  src={img.previewUrl}
                  alt={`Imagen ${index + 1}`}
                  className="w-full h-full object-cover pointer-events-none"
                />
                {isCover && (
                  <div className="absolute top-1 left-1 bg-primary-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    Portada
                  </div>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Eliminar imagen"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )
          })}
          {/* Slot "+" para agregar más si hay espacio */}
          {!disabled && remainingSlots > 0 && (
            <label className="aspect-square cursor-pointer rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-400 hover:bg-gray-100 flex flex-col items-center justify-center bg-gray-50 transition-colors">
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-[10px] text-gray-500 mt-1">Agregar</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleFilesSelected}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}

      {/* Estado inicial: sin imágenes */}
      {images.length === 0 && !disabled && (
        <div className={`flex gap-3 ${Capacitor.isNativePlatform() ? 'flex-col' : ''}`}>
          <label className="cursor-pointer flex-1 h-24 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-400 hover:bg-gray-100 flex items-center justify-center bg-gray-50 transition-colors">
            <div className="text-center flex items-center gap-2">
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-500">Subir imágenes</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />
          </label>
          {Capacitor.isNativePlatform() && (
            <button
              type="button"
              onClick={handleTakePhoto}
              className="flex-1 h-24 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-400 hover:bg-gray-100 flex items-center justify-center bg-gray-50 transition-colors"
            >
              <div className="text-center flex items-center gap-2">
                <Camera className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-500">Tomar foto</span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Pie con conteo y ayuda */}
      {images.length > 0 && (
        <p className="text-xs text-gray-500">
          {images.length} / {maxImages} · Arrastra para reordenar. La primera es la portada.
        </p>
      )}

      {/* Botón "Tomar foto" extra cuando ya hay imágenes y estamos en móvil */}
      {images.length > 0 && Capacitor.isNativePlatform() && remainingSlots > 0 && !disabled && (
        <button
          type="button"
          onClick={handleTakePhoto}
          className="w-full h-10 rounded-lg border border-dashed border-gray-300 hover:border-primary-400 flex items-center justify-center gap-2 text-sm text-gray-600"
        >
          <Camera className="w-4 h-4" />
          Tomar foto
        </button>
      )}
    </div>
  )
}

/**
 * Convierte un producto cargado desde Firestore a la forma que espera el componente.
 * Acepta `imageUrls` (array nuevo) o `imageUrl` (campo legacy).
 */
export const productToImageItems = (product) => {
  if (!product) return []
  const urls = Array.isArray(product.imageUrls) && product.imageUrls.length > 0
    ? product.imageUrls
    : (product.imageUrl ? [product.imageUrl] : [])
  return urls.map((url, i) => ({
    id: `existing-${i}-${url.slice(-16)}`,
    file: null,
    previewUrl: url,
    uploadedUrl: url,
  }))
}

/**
 * Sube las imágenes pendientes y retorna el array final de URLs.
 * uploadFn: (file) => Promise<string>
 */
export const resolveImageUrls = async (items, uploadFn) => {
  const urls = []
  for (const item of items) {
    if (item.uploadedUrl) {
      urls.push(item.uploadedUrl)
    } else if (item.file) {
      const url = await uploadFn(item.file)
      urls.push(url)
    }
  }
  return urls
}
