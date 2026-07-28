// Las 4 variantes de tarjeta de producto del catálogo público:
//  - FeaturedCard: carrusel "Destacados" (sin botón +)
//  - CarouselCard: carrusel por categoría (con botón +; precio via fmtCatalog)
//  - GridCard: grilla masonry principal (badge de categoría, multi-precios)
//  - ListCard: vista lista (badge inline, botón "Agregar")
// Extraídas VERBATIM de CatalogoPublico.jsx (F1.4 del plan de rediseño) — la
// unificación real vendrá con los layouts seleccionables de la Fase 2. `ctx`
// trae las dependencias del closure original: { business, showPrices,
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

export function FeaturedCard({ product, ctx }) {
  const { business, showPrices, ignoreStock, fmtCatalog, fmtProductMain, getCartQuantity, setSelectedProduct, th } = ctx
                      const cartQty = getCartQuantity(product.id)
                      const outOfStock = isProductOutOfStock(product, ignoreStock)
                      return (
                        <div
                          key={`featured-${product.id}`}
                          className={`flex-shrink-0 w-40 md:w-48 ${th.cardRadius} ${th.cardShadowEffect} overflow-hidden transition-shadow cursor-pointer group ${th.cardShadow} ${outOfStock ? 'opacity-75' : ''}`}
                          onClick={() => setSelectedProduct(product)}
                  onMouseEnter={() => preloadProductDetail(product)}
                        >
                          <div className="relative bg-gray-100 overflow-hidden aspect-square">
                            {product.imageUrl ? (
                              <CatalogImage
                                src={product.imageUrl}
                                alt={product.name}
                                size="thumbnail"
                                className={`w-full h-full object-cover md:group-hover:scale-105 md:transition-transform md:duration-300 ${outOfStock ? 'grayscale opacity-60' : ''}`}
                              />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center ${outOfStock ? 'opacity-50' : ''}`}>
                                <Package className="w-10 h-10 text-gray-300" />
                              </div>
                            )}
                            {outOfStock && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="bg-red-600 text-white px-2 py-0.5 rounded-md text-xs font-bold shadow-lg">AGOTADO</span>
                              </div>
                            )}
                            {cartQty > 0 && !outOfStock && (
                              <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg" style={{ backgroundColor: getCatalogAccent(business) }}>
                                {cartQty}
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <h3 className={`${th.productName} mb-1 line-clamp-2 ${th.text}`}>{product.name}</h3>
                            <div className="flex items-center justify-between">
                              {showPrices && !product.catalogHidePrice ? (
                                <div className={outOfStock ? 'line-through text-gray-400' : ''}>
                                  {product.catalogComparePrice > 0 && (
                                    <span className={`text-xs line-through block ${th.textMuted}`}>{fmtCatalog(product.catalogComparePrice)}</span>
                                  )}
                                  <span className={`${th.price}`}>
                                    {product.hasVariants && product.variants?.length > 0
                                      ? fmtCatalog(Math.min(...product.variants.map(v => v.price)))
                                      : fmtProductMain(product)
                                    }
                                  </span>
                                </div>
                              ) : showPrices ? (
                                <span className={`text-sm italic ${th.textMuted}`}>Consultar</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )
}

export function CarouselCard({ product, ctx }) {
  const { business, showPrices, ignoreStock, fmtCatalog, getCartQuantity, setSelectedProduct, addToCart, th } = ctx
                        const cartQty = getCartQuantity(product.id)
                        const outOfStock = isProductOutOfStock(product, ignoreStock)
                        const priceRange = getProductPriceRange(product, business)
                        return (
                          <div
                            key={product.id}
                            className={`flex-shrink-0 w-40 md:w-48 ${th.cardRadius} ${th.cardShadowEffect} overflow-hidden transition-shadow cursor-pointer group ${th.cardShadow} ${outOfStock ? 'opacity-75' : ''}`}
                            onClick={() => setSelectedProduct(product)}
                  onMouseEnter={() => preloadProductDetail(product)}
                          >
                            <div className="relative bg-gray-100 overflow-hidden aspect-square">
                              {product.imageUrl ? (
                                <CatalogImage
                                  src={product.imageUrl}
                                  alt={product.name}
                                  size="thumbnail"
                                  className={`w-full h-full object-cover md:group-hover:scale-105 md:transition-transform md:duration-300 ${outOfStock ? 'grayscale opacity-60' : ''}`}
                                />
                              ) : (
                                <div className={`w-full h-full flex items-center justify-center ${outOfStock ? 'opacity-50' : ''}`}>
                                  <Package className="w-10 h-10 text-gray-300" />
                                </div>
                              )}
                              {outOfStock && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="bg-red-600 text-white px-2 py-0.5 rounded-md text-xs font-bold shadow-lg">AGOTADO</span>
                                </div>
                              )}
                              {cartQty > 0 && !outOfStock && (
                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg" style={{ backgroundColor: getCatalogAccent(business) }}>
                                  {cartQty}
                                </div>
                              )}
                            </div>
                            <div className="p-3">
                              <h3 className={`${th.productName} mb-1 line-clamp-2 ${th.text}`}>{product.name}</h3>
                              <div className="flex items-center justify-between">
                                {showPrices && !product.catalogHidePrice ? (
                                  <div className={outOfStock ? 'line-through text-gray-400' : ''}>
                                    {product.catalogComparePrice > 0 && (
                                      <span className={`text-xs line-through block ${th.textMuted}`}>{fmtCatalog(product.catalogComparePrice)}</span>
                                    )}
                                    <span className={`${th.price}`}>
                                      {product.hasVariants && product.variants?.length > 0
                                        ? fmtCatalog(Math.min(...product.variants.map(v => v.price)))
                                        : fmtCatalog(product.price)
                                      }
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-500">Consultar</span>
                                )}
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
                                    className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity text-white hover:opacity-80"
                                    style={{ backgroundColor: getCatalogAccent(business) }}
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
}

// uniform (F2.3): en el layout 'grid' (cuadrícula uniforme) la imagen va en
// contenedor cuadrado fijo (sin salto de layout) y la tarjeta no usa las
// clases de masonry (break-inside/mb — el gap lo maneja el grid contenedor).
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
              // A4: badge de descuento (-X%) cuando hay precio de comparación
              const discountPct = showPrices && !product.catalogHidePrice ? getDiscountPercent(product) : null
              const accent = getCatalogAccent(business)

              // ===== Variante OVERLAY (motor v2): la imagen ES la tarjeta y la
              // info va encima sobre un degradado inferior. La eligen los temas
              // con layout.card = 'overlay'. Sin imagen cae a la clásica.
              if (cardVariant === 'overlay' && product.imageUrl) {
                return (
                  <div
                    key={product.id}
                    className={`catalog-fade-in ${revealClass} ${th.cardRadius} ${th.cardShadowEffect} relative overflow-hidden cursor-pointer group ${uniform ? '' : 'break-inside-avoid mb-4 md:mb-6'} ${th.cardShadow} ${outOfStock ? 'opacity-75' : ''}`}
                    onClick={() => setSelectedProduct(product)}
                    onMouseEnter={() => preloadProductDetail(product)}
                  >
                    <div className={`relative bg-gray-100 overflow-hidden ${uniform ? 'aspect-square' : 'aspect-[3/4]'}`}>
                      <CatalogImage
                        src={product.imageUrl}
                        alt={product.name}
                        size="card"
                        priority={index < 4}
                        className={`w-full h-full object-cover md:group-hover:scale-105 md:transition-transform md:duration-500 ${outOfStock ? 'grayscale opacity-60' : ''}`}
                      />
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
                      {cartQty > 0 && !outOfStock && (
                        <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg" style={{ backgroundColor: accent }}>
                          {cartQty}
                        </div>
                      )}
                      {outOfStock && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="bg-red-600 text-white px-3 py-1 rounded-md text-xs font-bold shadow-lg tracking-wide">
                            AGOTADO
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={product.id}
                  className={`catalog-fade-in ${revealClass} ${th.cardRadius} ${th.cardShadowEffect} overflow-hidden transition-shadow cursor-pointer group ${uniform ? '' : 'break-inside-avoid mb-4 md:mb-6'} ${th.cardShadow} ${outOfStock ? 'opacity-75' : ''}`}
                  onClick={() => setSelectedProduct(product)}
                  onMouseEnter={() => preloadProductDetail(product)}
                >
                  <div className={`relative bg-gray-100 overflow-hidden ${uniform ? 'aspect-square' : ''}`}>
                    {product.imageUrl ? (
                      <CatalogImage
                        src={product.imageUrl}
                        alt={product.name}
                        size="card"
                        priority={index < 4}
                        className={`${uniform ? 'w-full h-full' : 'w-full h-auto'} object-cover md:group-hover:scale-105 md:transition-transform md:duration-300 ${outOfStock ? 'grayscale opacity-60' : ''}`}
                      />
                    ) : (
                      <div className={`w-full aspect-square flex items-center justify-center ${outOfStock ? 'opacity-50' : ''}`}>
                        <Package className="w-12 h-12 text-gray-300" />
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
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-red-600 text-white px-3 py-1 rounded-md text-xs font-bold shadow-lg tracking-wide">
                          AGOTADO
                        </span>
                      </div>
                    )}
                    {cartQty > 0 && !outOfStock && (
                      <div className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg" style={{ backgroundColor: getCatalogAccent(business) }}>
                        {cartQty}
                      </div>
                    )}
                    {/* A4: badge de descuento cuando hay precio de comparación */}
                    {discountPct && !outOfStock && (
                      <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-bold text-white shadow" style={{ backgroundColor: accent }}>
                        -{discountPct}%
                      </span>
                    )}
                    {!selectedCategory && product.category && (() => {
                      const cat = categories.find(c => c.id === product.category)
                      if (!cat) return null
                      const parentCat = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
                      const displayCat = parentCat || cat
                      return (
                        <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium shadow-sm ${th.catBadge}`}>
                          {displayCat.name}
                        </div>
                      )
                    })()}
                  </div>
                  <div className="p-4">
                    <h3 className={`${th.productName} mb-1 line-clamp-2 ${th.text}`}>{product.name}</h3>
                    {product.description && (
                      <p className={`text-sm mb-2 line-clamp-2 whitespace-pre-line ${th.textMuted}`}>{product.description}</p>
                    )}
                    <div className="flex items-center justify-between">
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
                        <span className="text-sm text-gray-500">Consultar</span>
                      )}
                      {outOfStock ? (
                        <span className="text-xs font-semibold text-red-500">Sin stock</span>
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
                          className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity text-white hover:opacity-80"
                          style={{ backgroundColor: getCatalogAccent(business) }}
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      )}
                    </div>
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
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-red-600 text-white px-2 py-1 rounded-md text-xs font-bold shadow-lg tracking-wide">
                          AGOTADO
                        </span>
                      </div>
                    )}
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
