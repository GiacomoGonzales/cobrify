import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { normalizeForSearch } from '@/components/catalog/catalogHelpers'
import { optimizeImageUrl } from '@/utils/cloudinary'
import { useCatalogTheme } from '@/components/catalog/CatalogThemeProvider'

/**
 * Panel de búsqueda del catálogo (port del SearchModal de shopifree-v2).
 *
 * Reemplaza a la barra de búsqueda ancha bajo el hero: la lupa vive junto a
 * las categorías y abre este panel — pantalla completa en móvil, panel
 * lateral derecho en escritorio — con resultados en vivo. Tocar un resultado
 * abre el modal de producto de siempre (onSelectProduct es el mismo
 * setSelectedProduct del storefront: variantes, modificadores y carrito
 * funcionan igual que desde la grilla).
 *
 * Primer consumidor real del CatalogThemeProvider (Fase 1): se pinta con
 * tokens (surface/text/border), así que cada tema lo viste solo.
 *
 * El filtro replica el criterio flexible de la grilla del catálogo: cada
 * palabra (parcial, sin tildes) debe aparecer en nombre, descripción, marca,
 * código, SKU o atributos de variante — "POL ROJ" encuentra "Polo Adidas Rojo".
 */
export default function CatalogSearchModal({ products, onSelectProduct, onClose, showPrices = true, formatPrice }) {
  const { tokens } = useCatalogTheme()
  const [term, setTerm] = useState('')
  const inputRef = useRef(null)

  // Bloqueo de scroll del body, a prueba de iOS: fijar el body conserva la
  // posición y evita que el fondo se desplace bajo el panel.
  useEffect(() => {
    const scrollY = window.scrollY
    const { body } = document
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.width = prev.width
      body.style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [])

  // Autofocus con una pausa mínima para que iOS pinte el panel primero
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const resultados = useMemo(() => {
    const lista = Array.isArray(products) ? products : []
    const terms = normalizeForSearch(term).split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []
    return lista.filter(p => {
      const variantText = (p.variants || [])
        .map(v => Object.values(v?.attributes || {}).join(' '))
        .join(' ')
      const haystack = normalizeForSearch(
        [p.name, p.description, p.marca, p.code, p.sku, variantText].filter(Boolean).join(' ')
      )
      return terms.every(t => haystack.includes(t))
    }).slice(0, 60)
  }, [products, term])

  const elegir = (p) => {
    onSelectProduct(p)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: 'rgba(0,0,0,0.72)' }} />

      {/* Móvil: pantalla completa. Escritorio: panel lateral derecho. */}
      <div
        className="absolute inset-0 md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-full md:max-w-md flex flex-col shadow-2xl"
        style={{ backgroundColor: tokens.colors.surface, color: tokens.colors.text }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera con el input — safe area para el notch */}
        <div
          className="flex items-center gap-3 p-4 flex-shrink-0"
          style={{
            borderBottom: `1px solid ${tokens.colors.border}`,
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          }}
        >
          <Search className="w-5 h-5 flex-shrink-0" style={{ color: tokens.colors.textMuted }} />
          <input
            ref={inputRef}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar productos..."
            className="flex-1 bg-transparent outline-none text-base min-w-0"
            style={{ color: tokens.colors.text }}
          />
          <button
            onClick={term ? () => setTerm('') : onClose}
            className="w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-full transition-opacity hover:opacity-70"
            style={{ color: tokens.colors.textMuted }}
            aria-label={term ? 'Limpiar búsqueda' : 'Cerrar'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {term.trim() === '' ? (
            <p className="p-6 text-sm text-center" style={{ color: tokens.colors.textMuted }}>
              Escribe para buscar en el catálogo
            </p>
          ) : resultados.length === 0 ? (
            <p className="p-6 text-sm text-center" style={{ color: tokens.colors.textMuted }}>
              Sin resultados para "{term}"
            </p>
          ) : (
            <ul>
              {resultados.map(p => (
                <li key={p.id}>
                  <button
                    onClick={() => elegir(p)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:opacity-80"
                    style={{ borderBottom: `1px solid ${tokens.colors.border}` }}
                  >
                    {p.imageUrl ? (
                      <img
                        src={optimizeImageUrl(p.imageUrl, 'thumbnail')}
                        alt=""
                        loading="lazy"
                        className="w-12 h-12 object-cover flex-shrink-0"
                        style={{ borderRadius: tokens.radius.md, backgroundColor: tokens.colors.surfaceHover }}
                      />
                    ) : (
                      <span
                        className="w-12 h-12 flex items-center justify-center flex-shrink-0"
                        style={{ borderRadius: tokens.radius.md, backgroundColor: tokens.colors.surfaceHover }}
                      >
                        <Search className="w-4 h-4" style={{ color: tokens.colors.textMuted }} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{p.name}</span>
                      {p.marca && (
                        <span className="block text-xs truncate" style={{ color: tokens.colors.textMuted }}>{p.marca}</span>
                      )}
                    </span>
                    {showPrices && typeof formatPrice === 'function' && Number(p.price) > 0 && (
                      <span className="text-sm font-bold flex-shrink-0" style={{ color: tokens.colors.primary }}>
                        {formatPrice(p.price)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
