// Componentes de imagen del catálogo público + skeleton de carga.
// Extraídos de CatalogoPublico.jsx (F1.1) sin cambios de lógica.
import { useState } from 'react'
import { optimizeImageUrl } from '@/utils/cloudinary'

// Componente de skeleton para carga
export function ProductSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden animate-pulse">
      <div className="aspect-square bg-gray-200" />
      <div className="p-4">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
        <div className="h-6 bg-gray-200 rounded w-1/3" />
      </div>
    </div>
  )
}

// srcSet 2x (F0.2): en pantallas retina el navegador pide el preset del
// siguiente tamaño (misma escalera thumbnail→card→detail que ya usa el modal,
// así el 2x de la card ES la imagen que el modal reutiliza — doble beneficio).
// En pantallas normales no cambia nada (sigue el 1x).
const SIZE_2X = { thumbnail: 'card', card: 'detail' }

// Imagen optimizada con blur placeholder para carga rápida
export function CatalogImage({ src, alt, className = '', size = 'card', priority = false }) {
  const [loaded, setLoaded] = useState(false)
  const optimizedSrc = optimizeImageUrl(src, size)
  const blurSrc = optimizeImageUrl(src, 'blur')
  const isCloudinary = src?.includes('res.cloudinary.com')
  const src2x = isCloudinary && SIZE_2X[size] ? optimizeImageUrl(src, SIZE_2X[size]) : null

  return (
    <div className="relative w-full h-full">
      {isCloudinary && !loaded && (
        <img src={blurSrc} alt="" aria-hidden className={`absolute inset-0 w-full h-full object-cover scale-110 blur-sm ${className}`} />
      )}
      <img
        src={optimizedSrc}
        srcSet={src2x ? `${optimizedSrc} 1x, ${src2x} 2x` : undefined}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchpriority={priority ? 'high' : undefined}
        decoding={priority ? 'sync' : 'async'}
        onLoad={() => setLoaded(true)}
        className={`${className} transition-opacity duration-300 ${loaded || !isCloudinary ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

// Imagen principal del MODAL de producto. Antes era un <img> crudo con el
// preset 'detail' (w_800): como la grilla usa 'card' (w_400), la URL era
// distinta y el navegador descargaba la imagen desde cero → el modal se abría
// "recargando" en blanco. Ahora se pinta AL INSTANTE la versión 'card' (misma
// URL de la tarjeta → ya está en caché) y encima carga la 'detail' con
// fade-in. Montar con key={src} para resetear el estado al cambiar de imagen.
// fallbackSize: preset del "puente" cacheado — 'card' para la imagen principal
// (misma URL que la tarjeta de la grilla) y 'thumbnail' para las secundarias
// (misma URL que la tira de miniaturas del propio modal).
export function CatalogDetailImage({ src, alt, className = '', fallbackSize = 'card' }) {
  const [detailLoaded, setDetailLoaded] = useState(false)
  const isCloudinary = src?.includes('res.cloudinary.com')
  if (!isCloudinary) {
    return <img src={src} alt={alt} className={className} />
  }
  return (
    <>
      {!detailLoaded && (
        <img
          src={optimizeImageUrl(src, fallbackSize)}
          alt=""
          aria-hidden
          className={`absolute inset-0 ${className}`}
        />
      )}
      <img
        src={optimizeImageUrl(src, 'detail')}
        alt={alt}
        decoding="async"
        onLoad={() => setDetailLoaded(true)}
        className={`relative ${className} transition-opacity duration-300 ${detailLoaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  )
}

// Precarga en caliente de la imagen 'detail' de un producto (al pasar el mouse
// por su tarjeta). Así, cuando el usuario abre el modal, la versión grande ya
// está en caché y el fade card→detail es imperceptible. Set para no repetir.
export const preloadedDetails = new Set()
export function preloadProductDetail(product) {
  const url = (Array.isArray(product?.imageUrls) && product.imageUrls[0]) || product?.imageUrl
  if (!url || !url.includes('res.cloudinary.com') || preloadedDetails.has(url)) return
  preloadedDetails.add(url)
  const img = new Image()
  img.src = optimizeImageUrl(url, 'detail')
}
