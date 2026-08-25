// Las 4 variantes de tarjeta de producto del catálogo público:
//  - FeaturedCard: carrusel "Destacados" (sin botón +)
//  - CarouselCard: carrusel por categoría (con quick-add)
//  - GridCard: grilla masonry/uniforme principal (badge de categoría, multi-precios)
//  - ListCard: vista lista (badge inline, botón "Agregar")
//
// ANATOMÍA (port shopifree-v2, 24-ago-2026): la tarjeta ya NO es una caja
// blanca con sombra. Es la imagen como loseta redondeada (radius del tema,
// fondo surfaceHover) directamente sobre el fondo de la página, con el badge
// de descuento y el quick-add DENTRO de la imagen (el + aparece al hover en
// escritorio y siempre en móvil), y nombre + precio como texto plano debajo.
// "Agotado" es un velo oscuro con pastilla blanca, no un cartel rojo.
// Toda la lógica de negocio se conserva: variantes/modificadores abren el
// modal, multi-precios por nivel, cantidad en carrito, efectos F2.7, y el
// pipeline de imágenes (CatalogImage + preload). ListCard mantiene su caja
// (equivale al variant "horizontal" de shopifree, que sí lleva superficie).
//
// `ctx` trae las dependencias del closure original: { business, showPrices,
// ignoreStock, categories, selectedCategory, fmtCatalog, fmtProductMain,
// getCartQuantity, setSelectedProduct, addToCart, th:{...clases del tema} }.
import { Package, Plus } from 'lucide-react'
import { optimizeImageUrl } from '@/utils/cloudinary'
import { CatalogImage, preloadProductDetail } from '@/components/catalog/CatalogImages'
import { getCatalogAccent } from '@/themes/catalogThemes'
import {
  isProductOutOfStock,
  getProductPrices,
  getProductPriceRange,
} from '@/components/catalog/catalogHelpers'

// Porcentaje de descuento cuando hay precio de comparación (tachado) mayor
// al precio real. null si no aplica (sin comparación, variantes, o <5% que
// visualmente no vale la pena).
function getDiscountPercent(product) {
  const compare = Number(product?.catalogComparePrice) || 0
  const price = Number(product?.price) || 0
  if (!(compare > 0) || !(price > 0) || compare <= price) return null
  if (product?.hasVariants) return null
  const pct = Math.round((1 - price / compare) * 100)
  return pct >= 5 ? pct : null
}

/* ============ piezas compartidas de la anatomía shopifree ============ */

// Velo de agotado: oscurece la imagen y centra una pastilla blanca discreta.
function SoldOutOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
      <span className="px-3 py-1 bg-white/90 text-gray-900 text-xs font-semibold rounded-full shadow-sm">
        Agotado
      </span>
    </div>
  )
}

// Badge de descuento dentro de la imagen (arriba-izquierda), con el acento.
function DiscountBadge({ pct, accent }) {
  return (
    <span
      className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white shadow-sm backdrop-blur-sm"
      style={{ backgroundColor: accent }}
    >
      -{pct}%
    </span>
  )
}

// Cantidad ya en el carrito (arriba-derecha), con el acento.
function CartQtyBadge({ qty, accent }) {
  return (
    <div
      className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg"
      style={{ backgroundColor: accent }}
    >
      {qty}
    </div>
  )
}

// Quick-add dentro de la imagen (abajo-derecha): burbuja con la superficie
// del tema. En escritorio aparece al hover (como shopifree); en móvil no hay
// hover, así que queda siempre visible.
function QuickAddButton({ product, priceRange, setSelectedProduct, addToCart, label }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (product.hasVariants || product.modifiers?.length > 0 || priceRange) {
          setSelectedProduct(product)
        } else {
          addToCart(product)
        }
      }}
      className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110 active:scale-95 md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0"
      style={{ backgroundColor: 'var(--ct-surface, #fff)', color: 'var(--ct-text, #111827)' }}
      aria-label={label || `Agregar ${product.name}`}
    >
      <Plus className="w-5 h-5" />
    </button>
  )
}

// Precio de la tarjeta: precio principal en negrita + comparación tachada AL
// LADO (línea base compartida, como shopifree). Con niveles de precio activos
// se apilan igual que antes.
function CardPrice({ product, ctx, compact = false }) {
  const { business, showPrices, fmtCatalog, fmtProductMain, th } = ctx
  if (!showPrices || product.catalogHidePrice) {
    return showPrices ? <span className={`text-sm italic ${th.textMuted}`}>Consultar</span> : null
  }
  const showAllPrices = business?.catalogShowAllPrices !== false
  const prices = compact ? [] : getProductPrices(product, business)
  if (!compact && showAllPrices && prices.length > 1) {
    return (
      <div className="flex flex-col">
        {prices.map(p => (
          <span key={p.key} className="text-sm leading-tight">
            <span className={`font-bold ${th.text}`}>{fmtCatalog(p.value)}</span>
            <span className={`text-xs ml-1 ${th.textMuted}`}>{p.label}</span>
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className={th.price}>
        {product.hasVariants && product.variants?.length > 0
          ? `Desde ${fmtCatalog(Math.min(...product.variants.map(v => v.price)))}`
          : (compact ? fmtCatalog(product.price) : fmtProductMain(product))
        }
      </span>
      {product.catalogComparePrice > 0 && (
        <span className={`text-sm line-through ${th.textMuted}`}>{fmtCatalog(product.catalogComparePrice)}</span>
      )}
    </div>
  )
}

/* ============ tarjetas ============ */

/**
 * Tarjetas de las filas horizontales (Destacados y los carruseles por
 * categoria). Son la MISMA tarjeta de la cuadricula dentro de una caja de
 * ancho fijo — no una version recortada.
 *
 * Antes eran una copia con la foto cuadrada, sin boton de agregar rapido, sin
 * el sello de descuento y sin la categoria: en la misma pagina convivian dos
 * anatomias distintas y las de arriba se veian mas chicas. Delegando en
 * GridCard no se pueden volver a separar.
 */
function FilaHorizontal({ product, index = 0, ctx }) {
  return (
    <div className="flex-shrink-0 w-44 md:w-56">
      <GridCard product={product} index={index} uniform ctx={ctx} />
    </div>
  )
}

export function FeaturedCard({ product, ctx }) {
  return <FilaHorizontal product={product} ctx={ctx} />
}

export function CarouselCard({ product, ctx }) {
  return <FilaHorizontal product={product} ctx={ctx} />
}

// uniform (F2.3): en el layout 'grid' (cuadrícula uniforme) la imagen va en
// contenedor de proporción fija 4:5 (retrato, como shopifree — sin salto de
// layout) y la tarjeta no usa las clases de masonry (break-inside/mb).
export function GridCard({ product, index, uniform = false, ctx }) {
  const { business, showPrices, ignoreStock, categories, selectedCategory, fmtCatalog, fmtProductMain, getCartQuantity, setSelectedProduct, addToCart, th, effects, cardVariant } = ctx
  const cartQty = getCartQuantity(product.id)
  const outOfStock = isProductOutOfStock(product, ignoreStock)
  const priceRange = getProductPriceRange(product, business)
  // Efectos F2.7 (opt-in): reveal al montar + 2da imagen al hover.
  const revealClass = effects?.scrollReveal ? 'catalog-reveal' : ''
  const secondImage = effects?.imageSwapOnHover
    && Array.isArray(product.imageUrls) && product.imageUrls[1]
    ? product.imageUrls[1] : null
  const discountPct = showPrices && !product.catalogHidePrice ? getDiscountPercent(product) : null
  const accent = getCatalogAccent(business)

  // ===== Variante OVERLAY (motor v2): la imagen ES la tarjeta y la
  // info va encima sobre un degradado inferior. La eligen los temas
  // con layout.card = 'overlay'. Sin imagen cae a la clásica.
  // La variante overlay aplica a TODOS los productos del tema, tengan
  // foto o no: si dependiera de la imagen, en un mismo catálogo
  // convivirían dos anatomías de tarjeta distintas (reporte de
  // Giacomo). Sin foto se pinta un marcador con el fondo del tema.
  if (cardVariant === 'overlay') {
    return (
      <div
        key={product.id}
        className={`catalog-fade-in ${revealClass} ${th.cardRadius} ${th.cardShadowEffect} relative overflow-hidden cursor-pointer group ${uniform ? '' : 'break-inside-avoid mb-4 md:mb-6'} ${th.cardShadow} ${outOfStock ? 'opacity-75' : ''}`}
        onClick={() => setSelectedProduct(product)}
        onMouseEnter={() => preloadProductDetail(product)}
      >
        <div className={`relative bg-gray-100 overflow-hidden ${uniform ? 'aspect-square' : 'aspect-[3/4]'}`}>
          {product.imageUrl ? (
            <CatalogImage
              src={product.imageUrl}
              alt={product.name}
              size="card"
              priority={index < 4}
              className={`w-full h-full object-cover md:group-hover:scale-105 md:transition-transform md:duration-500 ${outOfStock ? 'grayscale opacity-60' : ''}`}
            />
          ) : (
            // Sin foto: fondo con el acento del tema para que la
            // tarjeta conserve la misma anatomía (texto legible
            // sobre el degradado inferior).
            <div
              className={`w-full h-full flex items-center justify-center ${outOfStock ? 'opacity-50' : ''}`}
              style={{ background: `linear-gradient(135deg, ${accent}30, ${accent}10)` }}
            >
              <Package className="w-12 h-12" style={{ color: `${accent}80` }} />
            </div>
          )}
          {secondImage && !outOfStock && (
            <img
              src={optimizeImageUrl(secondImage, 'card')}
              alt=""
              aria-hidden
              loading="lazy"
              className="catalog-swap-second absolute inset-0 w-full h-full object-cover"
            />
          )}
          {/* Degradado inferior para legibilidad del texto */}
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/35 to-transparent pointer-events-none" />
          {/* Info sobre la imagen */}
          <div className="absolute inset-x-0 bottom-0 p-3.5 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className={`${th.productName} text-white line-clamp-2 drop-shadow-sm`}>{product.name}</h3>
              {showPrices && !product.catalogHidePrice ? (
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-base font-bold text-white drop-shadow-sm">
                    {product.hasVariants && product.variants?.length > 0
                      ? `Desde ${fmtCatalog(Math.min(...product.variants.map(v => v.price)))}`
                      : fmtProductMain(product)}
                  </span>
                  {discountPct && (
                    <span className="text-xs line-through text-white/60">{fmtCatalog(product.catalogComparePrice)}</span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-white/80">Consultar</span>
              )}
            </div>
            {!outOfStock && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (product.hasVariants || product.modifiers?.length > 0 || priceRange) {
                    setSelectedProduct(product)
                  } else {
                    addToCart(product)
                  }
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-lg hover:scale-110 transition-transform"
                style={{ backgroundColor: accent }}
                aria-label={`Agregar ${product.name}`}
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
          {/* Badges superiores */}
          {discountPct && !outOfStock && (
            <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-xs font-bold text-white shadow" style={{ backgroundColor: accent }}>
              -{discountPct}%
            </span>
          )}
          {cartQty > 0 && !outOfStock && <CartQtyBadge qty={cartQty} accent={accent} />}
          {outOfStock && <SoldOutOverlay />}
        </div>
      </div>
    )
  }

  // ===== Anatomía shopifree (clásica): loseta de imagen + texto debajo =====
  return (
    <div
      key={product.id}
      className={`catalog-fade-in ${revealClass} cursor-pointer group ${uniform ? '' : 'break-inside-avoid mb-5 md:mb-6'}`}
      onClick={() => setSelectedProduct(product)}
      onMouseEnter={() => preloadProductDetail(product)}
    >
      {/* Loseta de imagen: radius del tema, fondo surfaceHover, todo lo
          accionable vive dentro (badges + quick-add al hover). */}
      <div
        className={`relative overflow-hidden mb-3 ${th.cardRadius} ${th.cardFrame || ''} ${uniform ? 'aspect-[4/5]' : ''}`}
        style={{ backgroundColor: 'var(--ct-surface-hover, #F3F4F6)' }}
      >
        {product.imageUrl ? (
          <CatalogImage
            src={product.imageUrl}
            alt={product.name}
            size="card"
            priority={index < 4}
            className={`${uniform ? 'w-full h-full' : 'w-full h-auto'} object-cover md:group-hover:scale-105 md:transition-transform md:duration-500 ${outOfStock ? 'grayscale opacity-60' : ''}`}
          />
        ) : (
          <div className={`w-full ${uniform ? 'h-full' : 'aspect-[4/5]'} flex items-center justify-center ${outOfStock ? 'opacity-50' : ''}`}>
            <Package className="w-12 h-12" style={{ color: 'var(--ct-border, #E5E7EB)' }} />
          </div>
        )}
        {secondImage && !outOfStock && (
          <img
            src={optimizeImageUrl(secondImage, 'card')}
            alt=""
            aria-hidden
            loading="lazy"
            className="catalog-swap-second absolute inset-0 w-full h-full object-cover"
          />
        )}
        {discountPct && !outOfStock && <DiscountBadge pct={discountPct} accent={accent} />}
        {cartQty > 0 && !outOfStock && <CartQtyBadge qty={cartQty} accent={accent} />}
        {!selectedCategory && product.category && (() => {
          const cat = categories.find(c => c.id === product.category)
          if (!cat) return null
          const parentCat = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
          const displayCat = parentCat || cat
          return (
            <div className={`absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-full text-xs font-medium shadow-sm ${th.catBadge}`}>
              {displayCat.name}
            </div>
          )
        })()}
        {outOfStock ? (
          <SoldOutOverlay />
        ) : (
          <QuickAddButton
            product={product}
            priceRange={priceRange}
            setSelectedProduct={setSelectedProduct}
            addToCart={addToCart}
          />
        )}
      </div>
      {/* Info como texto plano debajo de la loseta (sin caja): nombre a dos
          líneas + precio con la comparación tachada al lado. La descripción
          vive en el modal — la grilla respira, como shopifree. */}
      <div className="space-y-0.5">
        <h3 className={`${th.productName} line-clamp-2 leading-snug ${th.text}`}>{product.name}</h3>
        <CardPrice product={product} ctx={ctx} />
      </div>
    </div>
  )
}

export function ListCard({ product, ctx }) {
  const { business, showPrices, ignoreStock, categories, selectedCategory, fmtCatalog, fmtProductMain, getCartQuantity, setSelectedProduct, addToCart, th, effects } = ctx
  const cartQty = getCartQuantity(product.id)
  const outOfStock = isProductOutOfStock(product, ignoreStock)
  const priceRange = getProductPriceRange(product, business)
  const revealClass = effects?.scrollReveal ? 'catalog-reveal' : ''
  return (
    <div
      key={product.id}
      className={`catalog-fade-in ${revealClass} ${th.cardRadius} ${th.cardShadowEffect} overflow-hidden transition-shadow cursor-pointer flex ${th.cardShadow} ${outOfStock ? 'opacity-75' : ''}`}
      onClick={() => setSelectedProduct(product)}
      onMouseEnter={() => preloadProductDetail(product)}
    >
      <div className="w-32 h-32 md:w-40 md:h-40 flex-shrink-0 bg-gray-100 relative">
        {product.imageUrl ? (
          <CatalogImage
            src={product.imageUrl}
            alt={product.name}
            size="thumbnail"
            className={`w-full h-full object-cover ${outOfStock ? 'grayscale opacity-60' : ''}`}
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${outOfStock ? 'opacity-50' : ''}`}>
            <Package className="w-10 h-10 text-gray-300" />
          </div>
        )}
        {outOfStock && <SoldOutOverlay />}
        {cartQty > 0 && !outOfStock && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: getCatalogAccent(business) }}>
            {cartQty}
          </div>
        )}
      </div>
      <div className="flex-1 p-4 flex flex-col justify-between">
        <div>
          <h3 className={`${th.productName} mb-1 ${th.text}`}>{product.name}</h3>
          {!selectedCategory && product.category && (() => {
            const cat = categories.find(c => c.id === product.category)
            if (!cat) return null
            const parentCat = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
            const displayCat = parentCat || cat
            return (
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-1 ${th.listBadge}`}>
                {displayCat.name}
              </span>
            )
          })()}
          {product.description && (
            <p className={`text-sm line-clamp-2 whitespace-pre-line ${th.textMuted}`}>{product.description}</p>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          {showPrices && !product.catalogHidePrice ? (
            <div className={outOfStock ? 'text-gray-400 line-through' : ''}>
              {product.catalogComparePrice > 0 && (
                <span className={`text-xs line-through block ${th.textMuted}`}>{fmtCatalog(product.catalogComparePrice)}</span>
              )}
              {(() => {
                const showAllPrices = business?.catalogShowAllPrices !== false
                const prices = getProductPrices(product, business)
                if (showAllPrices && prices.length > 1) {
                  return (
                    <div className="flex flex-col">
                      {prices.map(p => (
                        <span key={p.key} className="text-sm leading-tight">
                          <span className={`font-bold ${th.text}`}>{fmtCatalog(p.value)}</span>
                          <span className={`text-xs ml-1 ${th.textMuted}`}>{p.label}</span>
                        </span>
                      ))}
                    </div>
                  )
                }
                return (
                  <span className={`${th.price}`}>
                    {product.hasVariants && product.variants?.length > 0
                      ? `Desde ${fmtCatalog(Math.min(...product.variants.map(v => v.price)))}`
                      : fmtProductMain(product)
                    }
                  </span>
                )
              })()}
            </div>
          ) : (
            <span className="text-sm text-gray-500">Consultar precio</span>
          )}
          {outOfStock ? (
            <span className="px-4 py-2 rounded-full bg-red-50 text-red-500 text-sm font-semibold">
              Agotado
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (product.hasVariants || product.modifiers?.length > 0 || priceRange) {
                  setSelectedProduct(product)
                } else {
                  addToCart(product)
                }
              }}
              className="px-4 py-2 rounded-full flex items-center gap-2 transition-opacity text-white hover:opacity-80"
              style={{ backgroundColor: getCatalogAccent(business) }}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Agregar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
