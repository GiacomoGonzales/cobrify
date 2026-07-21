// Modal de producto del catálogo público (galería, variantes, precios por
// nivel/mayorista, modificadores, cantidad con decimales, multi-divisa).
// Extraído de CatalogoPublico.jsx (F1.2 del plan de rediseño) SIN cambios de
// lógica; solo se hicieron explícitos los imports.
import { useState, useEffect, useMemo } from 'react'
import { optimizeImageUrl } from '@/utils/cloudinary'
import { getCatalogMinQty, formatCurrency } from '@/lib/utils'
import { convertFromBase } from '@/utils/currency'
import { CatalogDetailImage } from '@/components/catalog/CatalogImages'
import { getCatalogAccent } from '@/themes/catalogThemes'
import {
  getShortUnitLabel,
  formatQty,
  isProductOutOfStock,
  getAvailableStock,
  getProductPrices,
  getVariantPriceForLevel,
  getVariantPrices,
} from '@/components/catalog/catalogHelpers'
import {
  X,
  Plus,
  Minus,
  Package,
  ShoppingBag,
  AlertCircle,
  Info,
} from 'lucide-react'

// Modal de producto con soporte para modificadores
export default function ProductModal({ product, isOpen, onClose, onAddToCart, cartQuantity, showPrices: globalShowPrices = true, business, ignoreStock = false, catalogCurrency = 'PEN', catalogExchangeRate = 1 }) {
  // Helpers locales para mostrar precios en la moneda del catálogo
  const toCatalogDisplay = (priceInPen) => {
    const n = Number(priceInPen) || 0
    if (catalogCurrency === 'PEN' || n === 0) return n
    return Number(convertFromBase(n, 'USD', catalogExchangeRate || 1).toFixed(2))
  }
  const fmtCatalog = (priceInPen) => formatCurrency(toCatalogDisplay(priceInPen), catalogCurrency)
  // Función original con firma inalterada para minimizar diff (ver llamadas
  // existentes `S/ X.toFixed(2)` → fmtCatalog(X)).
  const showPrices = globalShowPrices && !product?.catalogHidePrice
  const [quantity, setQuantity] = useState(1)
  const [selectedModifiers, setSelectedModifiers] = useState({})
  const [modifierErrors, setModifierErrors] = useState({})
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [variantError, setVariantError] = useState(false)
  const [selectedPriceLevel, setSelectedPriceLevel] = useState('price1')
  const [activeImageIdx, setActiveImageIdx] = useState(0)

  // Galería: usa imageUrls si existe, si no cae a imageUrl (legacy)
  const productImages = useMemo(() => {
    if (!product) return []
    if (Array.isArray(product.imageUrls) && product.imageUrls.length > 0) {
      return product.imageUrls
    }
    return product.imageUrl ? [product.imageUrl] : []
  }, [product])

  // Inicializar modificadores cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setQuantity(1)
      // Preseleccionar la primera variante disponible para evitar mostrar
      // S/ 0.00 al abrir el modal. Prioriza la primera con stock > 0;
      // si todas están agotadas, igual selecciona la primera.
      if (product?.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
        const inStock = product.variants.find(v =>
          v.stock === null || v.stock === undefined || v.stock > 0
        )
        setSelectedVariant(inStock || product.variants[0])
      } else {
        setSelectedVariant(null)
      }
      setVariantError(false)
      setSelectedPriceLevel('price1')
      setActiveImageIdx(0)
      document.body.style.overflow = 'hidden'
      // Inicializar estado de modificadores
      if (product?.modifiers?.length > 0) {
        const initial = {}
        product.modifiers.forEach(mod => {
          initial[mod.id] = mod.allowRepeat ? {} : []
        })
        setSelectedModifiers(initial)
      } else {
        setSelectedModifiers({})
      }
      setModifierErrors({})
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, product])

  if (!isOpen || !product) return null

  const outOfStock = isProductOutOfStock(product, ignoreStock)
  const hasModifiers = product.modifiers?.length > 0

  // Helper: obtener total de selecciones para un modificador
  const getModSelectedCount = (modifier) => {
    const sel = selectedModifiers[modifier.id]
    if (!sel) return 0
    if (modifier.allowRepeat) return Object.values(sel).reduce((sum, c) => sum + c, 0)
    return sel.length
  }

  // Manejar selección de opción de modificador (modo normal)
  const handleOptionToggle = (modifierId, optionId) => {
    const modifier = product.modifiers.find(m => m.id === modifierId)
    if (!modifier) return

    setSelectedModifiers(prev => {
      const current = prev[modifierId] || []
      const isSelected = current.includes(optionId)

      let updated
      if (isSelected) {
        updated = current.filter(id => id !== optionId)
      } else {
        if (modifier.maxSelection === 1) {
          updated = [optionId]
        } else if (current.length < (modifier.maxSelection || 99)) {
          updated = [...current, optionId]
        } else {
          return prev
        }
      }

      return { ...prev, [modifierId]: updated }
    })

    clearModifierError(modifierId)
  }

  // Manejar incremento (modo multi-opción)
  const handleRepeatIncrement = (modifierId, optionId) => {
    const modifier = product.modifiers.find(m => m.id === modifierId)
    if (!modifier) return
    setSelectedModifiers(prev => {
      const current = prev[modifierId] || {}
      const totalCount = Object.values(current).reduce((sum, c) => sum + c, 0)
      if (totalCount >= modifier.maxSelection) return prev
      return { ...prev, [modifierId]: { ...current, [optionId]: (current[optionId] || 0) + 1 } }
    })
    clearModifierError(modifierId)
  }

  // Manejar decremento (modo multi-opción)
  const handleRepeatDecrement = (modifierId, optionId) => {
    setSelectedModifiers(prev => {
      const current = { ...(prev[modifierId] || {}) }
      if (!current[optionId] || current[optionId] <= 0) return prev
      current[optionId] = current[optionId] - 1
      if (current[optionId] === 0) delete current[optionId]
      return { ...prev, [modifierId]: current }
    })
  }

  const clearModifierError = (modifierId) => {
    if (modifierErrors[modifierId]) {
      setModifierErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[modifierId]
        return newErrors
      })
    }
  }

  const hasVariants = product.hasVariants && product.variants?.length > 0

  // Precios disponibles (mayorista, VIP, etc.) — para variantes, mostrar precios de la variante seleccionada
  const availablePrices = (hasVariants && selectedVariant)
    ? getVariantPrices(selectedVariant, business)
    : getProductPrices(product, business)
  const hasMultiplePrices = availablePrices.length > 1

  // Dada una cantidad, devuelve el priceKey del nivel MÁS BARATO cuyo umbral
  // de cantidad mínima ya se cumpla. Si ninguno aplica, devuelve 'price1'.
  // Usado por los botones +/− del modal para auto-ajustar el precio según
  // la cantidad (sube y baja escalonadamente entre todos los niveles).
  const computeBestPriceLevelFor = (qty) => {
    if (!hasMultiplePrices) return 'price1'
    const candidates = availablePrices
      .filter(p => {
        if (p.key === 'price1') return false
        const min = getCatalogMinQty(business, p.key, product)
        return min > 1 && qty >= min
      })
      .sort((a, b) => a.value - b.value)
    return candidates.length > 0 ? candidates[0].key : 'price1'
  }

  // Calcular precio total con modificadores, variante y nivel de precio
  const calculateTotalPrice = () => {
    let total
    if (hasVariants) {
      if (hasMultiplePrices && selectedPriceLevel && selectedVariant) {
        total = getVariantPriceForLevel(selectedVariant, product, selectedPriceLevel)
      } else {
        total = selectedVariant?.price || product.basePrice || 0
      }
    } else if (hasMultiplePrices && selectedPriceLevel) {
      const selected = availablePrices.find(p => p.key === selectedPriceLevel)
      total = selected?.value || product.price || 0
    } else {
      total = product.price || 0
    }
    if (hasModifiers) {
      Object.keys(selectedModifiers).forEach(modifierId => {
        const modifier = product.modifiers.find(m => m.id === modifierId)
        if (!modifier) return
        const sel = selectedModifiers[modifierId]
        if (modifier.allowRepeat) {
          Object.entries(sel || {}).forEach(([optionId, count]) => {
            const option = modifier.options?.find(o => o.id === optionId)
            if (option?.priceAdjustment && count > 0) total += option.priceAdjustment * count
          })
        } else {
          (sel || []).forEach(optionId => {
            const option = modifier.options?.find(o => o.id === optionId)
            if (option?.priceAdjustment) total += option.priceAdjustment
          })
        }
      })
    }
    return total
  }

  // Validar y agregar al carrito
  const handleAddToCart = () => {
    // Validar selección de variante
    if (hasVariants && !selectedVariant) {
      setVariantError(true)
      return
    }

    // Validar modificadores obligatorios
    if (hasModifiers) {
      const errors = {}
      product.modifiers.forEach(mod => {
        if (mod.required) {
          const count = getModSelectedCount(mod)
          if (count === 0) {
            errors[mod.id] = `Selecciona una opción`
          }
        }
      })
      if (Object.keys(errors).length > 0) {
        setModifierErrors(errors)
        return
      }
    }

    // Preparar datos de modificadores para el carrito
    let modifiersData = []
    if (hasModifiers) {
      modifiersData = product.modifiers
        .map(mod => {
          const sel = selectedModifiers[mod.id]
          let options = []

          if (mod.allowRepeat) {
            Object.entries(sel || {}).forEach(([optId, count]) => {
              if (count > 0) {
                const opt = mod.options?.find(o => o.id === optId)
                options.push({
                  optionId: optId,
                  optionName: opt?.name || '',
                  priceAdjustment: opt?.priceAdjustment || 0,
                  quantity: count
                })
              }
            })
          } else {
            options = (sel || []).map(optId => {
              const opt = mod.options?.find(o => o.id === optId)
              return {
                optionId: optId,
                optionName: opt?.name || '',
                priceAdjustment: opt?.priceAdjustment || 0
              }
            })
          }

          if (options.length === 0) return null
          return {
            modifierId: mod.id,
            modifierName: mod.name,
            allowRepeat: mod.allowRepeat || false,
            options
          }
        })
        .filter(Boolean)
    }

    const totalPrice = calculateTotalPrice()
    const priceLevelLabel = hasMultiplePrices
      ? availablePrices.find(p => p.key === selectedPriceLevel)?.label || null
      : null
    // Si tiene variante, pasar producto con datos de variante
    if (hasVariants && selectedVariant) {
      const variantProduct = {
        ...product,
        variantSku: selectedVariant.sku,
        variantAttributes: selectedVariant.attributes,
        isVariant: true,
      }
      onAddToCart(variantProduct, quantity, modifiersData, totalPrice, priceLevelLabel)
    } else {
      onAddToCart(product, quantity, modifiersData, totalPrice, priceLevelLabel)
    }
    onClose()
  }

  const unitPrice = calculateTotalPrice()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto catalog-scrollbar shadow-2xl">
        {/* Botón cerrar flotante */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        {cartQuantity > 0 && (
          <div className="absolute top-4 left-4 z-10 text-white px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: getCatalogAccent(business) }}>
            {cartQuantity} en carrito
          </div>
        )}

        {/* Galería (tipo Amazon): imagen grande + thumbnails */}
        <div className="bg-gray-100">
          {/* Imagen principal cuadrada 1:1 */}
          <div className="relative aspect-square">
            {productImages.length > 0 ? (
              <CatalogDetailImage
                key={productImages[activeImageIdx] || productImages[0]}
                src={productImages[activeImageIdx] || productImages[0]}
                alt={product.name}
                fallbackSize={activeImageIdx === 0 ? 'card' : 'thumbnail'}
                className={`w-full h-full object-cover ${outOfStock ? 'opacity-50 grayscale' : ''}`}
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center ${outOfStock ? 'opacity-50' : ''}`}>
                <Package className="w-24 h-24 text-gray-300" />
              </div>
            )}
            {outOfStock && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg tracking-wide">
                  AGOTADO
                </span>
              </div>
            )}
          </div>
          {/* Thumbnails (solo si hay más de una) */}
          {productImages.length > 1 && (
            <div className="px-4 py-3 flex gap-2 overflow-x-auto catalog-scrollbar bg-white">
              {productImages.map((url, idx) => {
                const isActive = idx === activeImageIdx
                return (
                  <button
                    key={`${url}-${idx}`}
                    type="button"
                    onClick={() => setActiveImageIdx(idx)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                      isActive
                        ? 'ring-2 ring-offset-1'
                        : 'border-gray-200 hover:border-gray-400 opacity-70 hover:opacity-100'
                    }`}
                    style={isActive ? { borderColor: getCatalogAccent(business) } : undefined}
                    aria-label={`Ver imagen ${idx + 1}`}
                  >
                    <img
                      src={optimizeImageUrl(url, 'thumbnail')}
                      alt={`${product.name} ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Contenido */}
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{product.name}</h2>
            {product.description && (
              <p className="text-gray-600 whitespace-pre-line">{product.description}</p>
            )}
          </div>

          <div className="flex items-center justify-between mb-6">
            {showPrices ? (
              <div>
                {product.catalogComparePrice > 0 && (
                  <span className="text-sm line-through block text-gray-400">{fmtCatalog(product.catalogComparePrice)}</span>
                )}
                {(() => {
                  const showAllPrices = business?.catalogShowAllPrices !== false
                  // Si hay múltiples precios con selección activa (botones radio abajo), solo mostrar el precio seleccionado
                  if (showAllPrices && hasMultiplePrices && !hasVariants) {
                    const selected = availablePrices.find(p => p.key === selectedPriceLevel) || availablePrices[0]
                    return (
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">{fmtCatalog(selected.value)}</span>
                        <span className="text-sm text-gray-500">{selected.label}</span>
                      </div>
                    )
                  }
                  if (showAllPrices && hasMultiplePrices && hasVariants && !selectedVariant) {
                    return (
                      <div className="flex flex-col gap-0.5">
                        {availablePrices.map(p => {
                          const min = getCatalogMinQty(business, p.key, product)
                          return (
                            <div key={p.key} className="flex items-baseline gap-2">
                              <span className="text-xl font-bold text-gray-900">{fmtCatalog(p.value)}</span>
                              <span className="text-sm text-gray-500">
                                {p.label}
                                {p.key !== 'price1' && min > 1 && (
                                  <span className="text-xs text-gray-400 ml-1">(min. {min} un.)</span>
                                )}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  }
                  return (
                    <div className="text-3xl font-bold text-gray-900">
                      {fmtCatalog(unitPrice)}
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div className="text-lg text-gray-500">Consultar precio</div>
            )}
            {!hasVariants && product.stock !== undefined && product.stock !== null && product.trackStock !== false && product.stock <= 0 && (
              <span className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded-full font-medium">
                Agotado
              </span>
            )}
          </div>

          {/* Tabla de precios por mayor — productos SIN variantes */}
          {!hasVariants && hasMultiplePrices && showPrices && business?.catalogShowAllPrices !== false && (
            <div className="mb-6">
              <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-200">
                {availablePrices.map((priceItem) => {
                  const isSelected = selectedPriceLevel === priceItem.key
                  return (
                    <button
                      key={priceItem.key}
                      onClick={() => {
                        setSelectedPriceLevel(priceItem.key)
                        const min = getCatalogMinQty(business, priceItem.key, product)
                        if (priceItem.key !== 'price1' && min > 1 && quantity < min) {
                          setQuantity(min)
                        }
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                        isSelected ? '' : 'hover:bg-gray-50'
                      }`}
                      style={isSelected ? { backgroundColor: `${getCatalogAccent(business)}10` } : {}}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${!isSelected ? 'border-gray-300' : ''}`}
                          style={isSelected ? { borderColor: getCatalogAccent(business), backgroundColor: getCatalogAccent(business) } : {}}
                        >
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <span className="font-medium" style={isSelected ? { color: getCatalogAccent(business) } : { color: '#374151' }}>
                          {priceItem.label}
                          {priceItem.key !== 'price1' && getCatalogMinQty(business, priceItem.key, product) > 1 && (
                            <span className="text-xs text-gray-400 ml-1.5">(desde {getCatalogMinQty(business, priceItem.key, product)} un.)</span>
                          )}
                        </span>
                      </div>
                      <span className="font-bold" style={isSelected ? { color: getCatalogAccent(business) } : { color: '#111827' }}>
                        {fmtCatalog(priceItem.value)}
                      </span>
                    </button>
                  )
                })}
              </div>
              {selectedPriceLevel && selectedPriceLevel !== 'price1' && getCatalogMinQty(business, selectedPriceLevel, product) > 1 && (
                <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mt-2 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  Precio aplica desde {getCatalogMinQty(business, selectedPriceLevel, product)} unidades
                </p>
              )}
            </div>
          )}

          {/* Variantes */}
          {hasVariants && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">
                  {product.variantAttributes?.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(' / ')}
                </h3>
                {variantError && (
                  <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
                    Selecciona una opción
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {product.variants.map((variant, index) => {
                  const isSelected = selectedVariant?.sku === variant.sku
                  const outOfStock = variant.stock !== null && variant.stock <= 0
                  const attrsLabel = Object.values(variant.attributes).join(' / ')
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        if (!outOfStock) {
                          setSelectedVariant(variant)
                          setVariantError(false)
                          setSelectedPriceLevel('price1')
                        }
                      }}
                      disabled={outOfStock}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                        outOfStock
                          ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                          : isSelected
                            ? ''
                            : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={isSelected && !outOfStock ? { borderColor: getCatalogAccent(business), backgroundColor: `${getCatalogAccent(business)}10` } : {}}
                    >
                      <span className="font-medium" style={isSelected ? { color: getCatalogAccent(business) } : { color: '#374151' }}>
                        {attrsLabel}
                        {outOfStock && <span className="ml-2 text-xs text-gray-400">(Agotado)</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        {showPrices && (
                          <span className="text-sm font-medium text-gray-600">
                            {fmtCatalog(variant.price)}
                          </span>
                        )}
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${!isSelected ? 'border-gray-300' : ''}`}
                          style={isSelected ? { borderColor: getCatalogAccent(business), backgroundColor: getCatalogAccent(business) } : {}}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

          )}

          {/* Tabla de precios por mayor — variantes (aparece después de seleccionar variante) */}
          {hasVariants && selectedVariant && availablePrices.length > 1 && showPrices && business?.catalogShowAllPrices !== false && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Precios disponibles</h3>
              <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-200">
                {availablePrices.map((priceItem) => {
                  const isSelected = selectedPriceLevel === priceItem.key
                  return (
                    <button
                      key={priceItem.key}
                      onClick={() => {
                        setSelectedPriceLevel(priceItem.key)
                        const min = getCatalogMinQty(business, priceItem.key, product)
                        if (priceItem.key !== 'price1' && min > 1 && quantity < min) {
                          setQuantity(min)
                        }
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                        isSelected ? '' : 'hover:bg-gray-50'
                      }`}
                      style={isSelected ? { backgroundColor: `${getCatalogAccent(business)}10` } : {}}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${!isSelected ? 'border-gray-300' : ''}`}
                          style={isSelected ? { borderColor: getCatalogAccent(business), backgroundColor: getCatalogAccent(business) } : {}}
                        >
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <span className="font-medium" style={isSelected ? { color: getCatalogAccent(business) } : { color: '#374151' }}>
                          {priceItem.label}
                          {priceItem.key !== 'price1' && getCatalogMinQty(business, priceItem.key, product) > 1 && (
                            <span className="text-xs text-gray-400 ml-1.5">(desde {getCatalogMinQty(business, priceItem.key, product)} un.)</span>
                          )}
                        </span>
                      </div>
                      <span className="font-bold" style={isSelected ? { color: getCatalogAccent(business) } : { color: '#111827' }}>
                        {fmtCatalog(priceItem.value)}
                      </span>
                    </button>
                  )
                })}
              </div>
              {selectedPriceLevel && selectedPriceLevel !== 'price1' && getCatalogMinQty(business, selectedPriceLevel, product) > 1 && (
                <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mt-2 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  Precio aplica desde {getCatalogMinQty(business, selectedPriceLevel, product)} unidades
                </p>
              )}
            </div>
          )}

          {/* Modificadores */}
          {hasModifiers && (
            <div className="mb-6 space-y-4">
              {product.modifiers.map(modifier => {
                const modSelCount = getModSelectedCount(modifier)
                const accentColor = getCatalogAccent(business)
                return (
                <div key={modifier.id} className="border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{modifier.name}</h3>
                      <p className="text-sm text-gray-500">
                        {modifier.required ? 'Obligatorio' : 'Opcional'}
                        {modifier.maxSelection > 1 && ` - Máx. ${modifier.maxSelection}`}
                        {modifier.allowRepeat && ' (puedes repetir)'}
                        {modSelCount > 0 && (
                          <span className="ml-1 font-medium" style={{ color: accentColor }}>
                            ({modSelCount} seleccionada{modSelCount > 1 ? 's' : ''})
                          </span>
                        )}
                      </p>
                    </div>
                    {modifierErrors[modifier.id] && (
                      <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
                        {modifierErrors[modifier.id]}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {modifier.options?.map(option => {
                      if (modifier.allowRepeat) {
                        // Modo multi-opción con +/-
                        const count = (selectedModifiers[modifier.id] || {})[option.id] || 0
                        const canIncrement = modSelCount < modifier.maxSelection
                        return (
                          <div
                            key={option.id}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${count > 0 ? '' : 'border-gray-200'}`}
                            style={count > 0 ? { borderColor: accentColor, backgroundColor: `${accentColor}10` } : {}}
                          >
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-sm" style={count > 0 ? { color: accentColor } : { color: '#374151' }}>
                                {option.name}
                              </span>
                              {showPrices && option.priceAdjustment > 0 && (
                                <span className="text-xs text-gray-500 block">+{fmtCatalog(option.priceAdjustment)} c/u</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {showPrices && count > 0 && option.priceAdjustment > 0 && (
                                <span className="text-xs font-medium" style={{ color: accentColor }}>
                                  +{fmtCatalog(option.priceAdjustment * count)}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRepeatDecrement(modifier.id, option.id)}
                                disabled={count === 0}
                                className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all"
                                style={count > 0 ? { borderColor: accentColor, color: accentColor } : { borderColor: '#D1D5DB', color: '#D1D5DB' }}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
                              </button>
                              <span className="w-6 text-center text-sm font-bold" style={{ color: count > 0 ? accentColor : '#9CA3AF' }}>
                                {count}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRepeatIncrement(modifier.id, option.id)}
                                disabled={!canIncrement}
                                className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all"
                                style={canIncrement ? { borderColor: accentColor, color: accentColor } : { borderColor: '#D1D5DB', color: '#D1D5DB' }}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                              </button>
                            </div>
                          </div>
                        )
                      }

                      // Modo normal - toggle
                      const isSelected = selectedModifiers[modifier.id]?.includes(option.id)
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleOptionToggle(modifier.id, option.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${
                            isSelected ? '' : 'border-gray-200 hover:border-gray-300'
                          }`}
                          style={isSelected ? { borderColor: accentColor, backgroundColor: `${accentColor}10` } : {}}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm" style={isSelected ? { color: accentColor } : { color: '#374151' }}>
                              {option.name}
                            </span>
                            {showPrices && option.priceAdjustment > 0 && (
                              <span className="text-xs text-gray-500 block">+{fmtCatalog(option.priceAdjustment)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${!isSelected ? 'border-gray-300' : ''}`}
                              style={isSelected ? { borderColor: accentColor, backgroundColor: accentColor } : {}}
                            >
                              {isSelected && (
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
                )
              })}
            </div>
          )}

          {/* Selector de cantidad */}
          {(() => {
            // Productos con `allowDecimalQuantity` (ej. avena por kilo, pollo por kilo)
            // muestran input editable + saltos de 0.5. Resto: comportamiento entero clásico.
            const allowsDecimals = !!product.allowDecimalQuantity
            const step = allowsDecimals ? 0.5 : 1
            const minQty = allowsDecimals ? 0.01 : 1
            const unitLabel = getShortUnitLabel(product.unit)

            // Stock disponible para limitar el selector. Si `catalogIgnoreStock` está
            // activo (trabajan bajo pedido) o el producto no trackea stock, queda null
            // y no se aplica tope. Para productos con variantes, usa el stock de la
            // variante actualmente seleccionada (cae a null si aún no eligió).
            const ignoreStock = !!business?.catalogIgnoreStock
            const showStock = !!business?.catalogShowStock && !ignoreStock
            const availableStock = ignoreStock ? null : getAvailableStock(product, hasVariants ? selectedVariant : null)
            const hasStockCap = availableStock !== null && Number.isFinite(availableStock) && availableStock > 0

            const applyQty = (newQty) => {
              let clamped = Math.max(minQty, Number(newQty.toFixed(3)))
              if (hasStockCap && clamped > availableStock) clamped = availableStock
              if (hasMultiplePrices) {
                setSelectedPriceLevel(computeBestPriceLevelFor(clamped))
              }
              setQuantity(clamped)
            }

            return (
              <div className="flex items-center gap-4 mb-6">
                <span className="text-gray-600">Cantidad:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => applyQty(quantity - step)}
                    className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-gray-300 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  {allowsDecimals ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatQty(quantity)}
                      onChange={(e) => {
                        // Permitir tipear libremente — validamos en blur.
                        const raw = e.target.value.replace(',', '.')
                        // Solo dígitos y un punto
                        if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                          const num = parseFloat(raw)
                          if (!Number.isNaN(num) && num > 0) {
                            if (hasMultiplePrices) {
                              setSelectedPriceLevel(computeBestPriceLevelFor(num))
                            }
                            setQuantity(num)
                          } else if (raw === '' || raw === '.') {
                            // Mientras está editando, dejarlo borrar — se recupera en blur
                            setQuantity(0)
                          }
                        }
                      }}
                      onBlur={() => {
                        // Si quedó en 0 o vacío al perder foco, restaurar mínimo.
                        if (!quantity || quantity < minQty) applyQty(minQty)
                      }}
                      className="w-20 text-center text-xl font-semibold border-2 border-gray-200 rounded-lg py-1 focus:border-primary-500 focus:outline-none"
                    />
                  ) : (
                    <span className="w-12 text-center text-xl font-semibold">{quantity}</span>
                  )}
                  <button
                    onClick={() => applyQty(quantity + step)}
                    className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-gray-300 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  {allowsDecimals && unitLabel && (
                    <span className="text-sm font-medium text-gray-500 ml-1">{unitLabel}</span>
                  )}
                </div>
                {showStock && hasStockCap && (
                  <span
                    className={`text-xs font-medium ml-auto ${
                      quantity >= availableStock
                        ? 'text-orange-600'
                        : availableStock <= 5
                          ? 'text-amber-600'
                          : 'text-gray-500'
                    }`}
                    title={quantity >= availableStock ? 'Has alcanzado el stock disponible' : `${availableStock} ${unitLabel || 'unidades'} disponibles`}
                  >
                    {availableStock} {unitLabel || 'disponibles'}
                  </span>
                )}
              </div>
            )
          })()}

          {/* Botón agregar */}
          <button
            onClick={handleAddToCart}
            disabled={outOfStock}
            className={`w-full py-4 rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 transition-opacity ${
              outOfStock
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'text-white hover:opacity-80'
            }`}
            style={!outOfStock ? { backgroundColor: getCatalogAccent(business) } : {}}
          >
            {outOfStock ? (
              <>
                <AlertCircle className="w-5 h-5" />
                Producto agotado
              </>
            ) : (
              <>
                <ShoppingBag className="w-5 h-5" />
                {showPrices ? `Agregar al carrito - ${fmtCatalog(unitPrice * quantity)}` : 'Agregar al carrito'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
