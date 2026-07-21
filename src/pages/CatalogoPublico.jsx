import { useState, useEffect, useMemo, useRef } from 'react'
import { optimizeImageUrl } from '@/utils/cloudinary'
import ProductModal from '@/components/catalog/ProductModal'
import CartDrawer, { TableAccountModal } from '@/components/catalog/CartDrawer'
import { FeaturedCard, CarouselCard, GridCard, ListCard } from '@/components/catalog/ProductCards'
import AnnouncementBar from '@/components/catalog/AnnouncementBar'
import HeroCarousel from '@/components/catalog/HeroCarousel'
import { ProductSkeleton } from '@/components/catalog/CatalogImages'
import {
  DAY_SHORT,
  getShortUnitLabel,
  normalizeForSearch,
  formatQty,
  isBusinessOpen,
  isProductOutOfStock,
} from '@/components/catalog/catalogHelpers'
import { DEMO_CATALOG_DATA, DEMO_RESTAURANT_DATA } from '@/components/catalog/catalogDemoData'
import { getCatalogThemeClasses, getCatalogAccent } from '@/themes/catalogThemes'
import { useParams, useSearchParams } from 'react-router-dom'
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, startAfter, documentId } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getCatalogMinQty, formatCurrency } from '@/lib/utils'
import { isMultiCurrencyEnabled, convertFromBase, normalizeCurrency, BASE_CURRENCY } from '@/utils/currency'
import { getRateForDate } from '@/services/exchangeRateService'
import {
  Search,
  ShoppingBag,
  X,
  MessageCircle,
  Phone,
  MapPin,
  Clock,
  ChevronDown,
  Package,
  Loader2,
  Store,
  Filter,
  Grid3X3,
  List,
  UtensilsCrossed,
  Info,
  Mail
} from 'lucide-react'

// Estilos de animacion para fade-in escalonado
const fadeInStyle = `
.catalog-fade-in {
  opacity: 1;
}
.catalog-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.catalog-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.catalog-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(150, 150, 150, 0.3);
  border-radius: 4px;
}
.catalog-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(150, 150, 150, 0.5);
}
.catalog-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(150,150,150,0.3) transparent;
}
html::-webkit-scrollbar {
  width: 6px;
}
html::-webkit-scrollbar-track {
  background: transparent;
}
html::-webkit-scrollbar-thumb {
  background: rgba(150, 150, 150, 0.25);
  border-radius: 6px;
}
html::-webkit-scrollbar-thumb:hover {
  background: rgba(150, 150, 150, 0.45);
}
html {
  scrollbar-width: thin;
  scrollbar-color: rgba(150,150,150,0.25) transparent;
}
`


// Componente principal
export default function CatalogoPublico({ isDemo = false, isRestaurantMenu = false, customDomain = null, preloadedBusiness = null }) {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const tableFromUrl = searchParams.get('mesa') || searchParams.get('table') || ''
  // Modo vista previa: si la URL trae ?previewTheme=tech, sobrescribimos el tema guardado.
  // Lo usa el modal de Settings para que el dueño del negocio pruebe temas sin guardar.
  const previewThemeFromUrl = searchParams.get('previewTheme') || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [business, setBusiness] = useState(null)
  // Multi-divisa: TC del día para mostrar el catálogo en USD si el
  // negocio configuró defaultCurrency='USD' con la flag activa.
  const [catalogExchangeRate, setCatalogExchangeRate] = useState(1)
  // Negocio con suscripción suspendida: mostramos pantalla "fuera de servicio"
  // en lugar del catálogo, para no dejar al cliente final ver productos / hacer
  // pedidos cuando el dueño tiene el servicio cortado.
  const [businessSuspended, setBusinessSuspended] = useState(false)
  const [products, setProducts] = useState([])
  // Carga progresiva: true mientras siguen llegando lotes de productos en background
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false)
  // Render incremental: cuántas tarjetas se pintan (crece con el scroll). Con
  // catálogos de cientos de productos, pintar todo de una congela el móvil.
  const [visibleCount, setVisibleCount] = useState(40)
  const loadMoreSentinelRef = useRef(null)
  const [categories, setCategories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState(null)
  // Menú lateral de categorías (móvil): árbol completo de categorías/subcategorías
  // sin ocupar pantalla; complementa la fila deslizable de chips.
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false)
  const [drawerExpandedCategory, setDrawerExpandedCategory] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  // Carrito persistido en localStorage por catálogo (slug): sin esto se borraba
  // al recargar/actualizar la página. Se expira a las 24h para no resucitar
  // pedidos abandonados hace días.
  const cartStorageKey = `catalog_cart_${slug || 'default'}`
  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem(`catalog_cart_${slug || 'default'}`)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.items) && typeof parsed.savedAt === 'number'
          && Date.now() - parsed.savedAt < 24 * 60 * 60 * 1000) {
        return parsed.items
      }
      return []
    } catch {
      return []
    }
  })
  const [cartOpen, setCartOpen] = useState(false)

  // Persistir el carrito en localStorage ante cualquier cambio (agregar, quitar,
  // cambiar cantidad). Al vaciarse (pedido enviado) se limpia la clave.
  useEffect(() => {
    try {
      if (cart.length > 0) {
        localStorage.setItem(cartStorageKey, JSON.stringify({ items: cart, savedAt: Date.now() }))
      } else {
        localStorage.removeItem(cartStorageKey)
      }
    } catch {
      // localStorage no disponible (modo incógnito/bloqueado): ignorar.
    }
  }, [cart, cartStorageKey])

  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  // Diseño de grilla configurado por el negocio (F2.3): 'masonry' (default,
  // alturas naturales tipo Pinterest) | 'grid' (cuadrícula uniforme) | 'list'.
  // El visitante puede seguir alternando grilla/lista con los botones; esto
  // define el estilo de la grilla y la vista inicial.
  const catalogLayout = business?.catalogLayout || 'masonry'
  const layoutAppliedRef = useRef(false)
  useEffect(() => {
    if (!business || layoutAppliedRef.current) return
    layoutAppliedRef.current = true
    if (business.catalogLayout === 'list') setViewMode('list')
  }, [business])
  const [isLogoHorizontal, setIsLogoHorizontal] = useState(false)

  // Estado para mesa activa (orden existente del mozo)
  const [activeTableOrder, setActiveTableOrder] = useState(null) // { orderId, tableId, items, total }
  const [loadingTableOrder, setLoadingTableOrder] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)

  // Cargar datos del negocio y productos
  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true)
        setError(null)

        // Si es modo demo, usar datos estáticos
        if (isDemo) {
          const demoData = isRestaurantMenu ? DEMO_RESTAURANT_DATA : DEMO_CATALOG_DATA
          setBusiness(demoData.business)
          setProducts(demoData.products)
          setCategories(demoData.categories)
          setLoading(false)
          return
        }

        // Multi-divisa: si el negocio activó USD por default, fetchamos
        // el TC del día UNA vez para todo el catálogo. Cache local 24h.
        const fetchCatalogRate = async (biz) => {
          try {
            if (biz?.multiCurrencyEnabled === true && biz?.defaultCurrency === 'USD') {
              const result = await getRateForDate(new Date())
              if (result && result.sell > 0) {
                setCatalogExchangeRate(Number(result.sell.toFixed(4)))
              }
            }
          } catch (e) {
            console.warn('No se pudo obtener TC para catálogo:', e?.message)
          }
        }

        // Usar datos precargados del negocio si están disponibles (dominio personalizado)
        let businessData
        if (preloadedBusiness) {
          businessData = preloadedBusiness
          setBusiness(businessData)
          await fetchCatalogRate(businessData)
        } else {
          // Buscar negocio por catalogSlug o por customDomain
          let businessesSnap
          if (customDomain) {
            const domainQuery = query(
              collection(db, 'businesses'),
              where('customDomain', '==', customDomain),
              where('catalogEnabled', '==', true)
            )
            businessesSnap = await getDocs(domainQuery)
          } else {
            const slugQuery = query(
              collection(db, 'businesses'),
              where('catalogSlug', '==', slug),
              where('catalogEnabled', '==', true)
            )
            businessesSnap = await getDocs(slugQuery)
          }

          if (businessesSnap.empty) {
            setError(isRestaurantMenu ? 'Menú no encontrado' : 'Catálogo no encontrado')
            return
          }

          const businessDoc = businessesSnap.docs[0]
          businessData = { id: businessDoc.id, ...businessDoc.data() }
          setBusiness(businessData)
          await fetchCatalogRate(businessData)
        }

        // Verificar estado de la suscripción del dueño del negocio. Si está
        // suspendida o bloqueada, mostrar la pantalla "fuera de servicio"
        // en lugar del catálogo. No es modo demo (esos no tienen subscription).
        if (!isDemo && businessData?.id) {
          try {
            const { doc: docRef, getDoc: getDocFn } = await import('firebase/firestore')
            const subRef = docRef(db, 'subscriptions', businessData.id)
            const subSnap = await getDocFn(subRef)
            if (subSnap.exists()) {
              const sub = subSnap.data()
              if (sub.accessBlocked === true || sub.status === 'suspended') {
                setBusinessSuspended(true)
                setLoading(false)
                return
              }
            }
          } catch (e) {
            // Si falla la lectura de la suscripción no bloqueamos el catálogo.
            console.warn('No se pudo verificar suscripción:', e)
          }
        }

        // Cargar categorías ANTES que los productos (vienen del doc del negocio,
        // ya en memoria) para que los chips pinten con el primer lote.
        setCategories(businessData.productCategories || [])

        // Cargar productos visibles EN LOTES (carga progresiva): con catálogos de
        // cientos de productos, esperar a que baje todo dejaba la pantalla en
        // "cargando" varios segundos. El primer lote pinta el catálogo de una y
        // el resto sigue llegando en background. Se pagina con orderBy(documentId())
        // (índice single-field de Firestore — no requiere índices compuestos).
        const productsRef = collection(db, 'businesses', businessData.id, 'products')
        const BATCH = 120
        let lastDoc = null
        let accumulated = []
        let firstBatch = true
        while (true) {
          const constraints = [where('catalogVisible', '==', true), orderBy(documentId())]
          if (lastDoc) constraints.push(startAfter(lastDoc))
          constraints.push(limit(BATCH))
          const snap = await getDocs(query(productsRef, ...constraints))
          accumulated = accumulated.concat(snap.docs.map(d => ({ id: d.id, ...d.data() })))
          setProducts(accumulated)
          if (firstBatch) {
            setLoading(false) // el catálogo ya es usable con el primer lote
            firstBatch = false
          }
          if (snap.docs.length < BATCH) break
          setLoadingMoreProducts(true)
          lastDoc = snap.docs[snap.docs.length - 1]
        }
        setLoadingMoreProducts(false)

      } catch (err) {
        console.error('Error loading catalog:', err)
        setError(isRestaurantMenu ? 'Error al cargar el menú' : 'Error al cargar el catálogo')
      } finally {
        setLoading(false)
        setLoadingMoreProducts(false)
      }
    }

    if (slug || isDemo || customDomain) {
      loadCatalog()
    }
  }, [slug, isDemo, isRestaurantMenu, customDomain])

  // Detectar mesa ocupada y cargar orden existente
  useEffect(() => {
    if (!business || !tableFromUrl || !isRestaurantMenu || isDemo) return

    async function checkActiveTable() {
      try {
        setLoadingTableOrder(true)
        const tablesRef = collection(db, 'businesses', business.id, 'tables')
        const allTablesSnap = await getDocs(tablesRef)
        const trimmedNumber = tableFromUrl.trim()

        const matchedTableDoc = allTablesSnap.docs.find(d => {
          const num = d.data().number
          return String(num) === trimmedNumber
        })

        if (!matchedTableDoc) {
          setActiveTableOrder(null)
          return
        }

        const tableData = matchedTableDoc.data()

        if (tableData.status === 'occupied' && tableData.currentOrder) {
          // Mesa ocupada: cargar la orden existente
          const orderRef = doc(db, 'businesses', business.id, 'orders', tableData.currentOrder)
          const orderSnap = await getDoc(orderRef)

          if (orderSnap.exists()) {
            const orderData = orderSnap.data()
            setActiveTableOrder({
              orderId: orderSnap.id,
              tableId: matchedTableDoc.id,
              items: orderData.items || [],
              total: orderData.total || 0,
              orderNumber: orderData.orderNumber || '',
              waiter: orderData.waiterName || tableData.waiter || '',
            })
          } else {
            setActiveTableOrder(null)
          }
        } else {
          setActiveTableOrder(null)
        }
      } catch (err) {
        console.warn('Error checking active table:', err)
        setActiveTableOrder(null)
      } finally {
        setLoadingTableOrder(false)
      }
    }

    checkActiveTable()
  }, [business, tableFromUrl, isRestaurantMenu, isDemo])

  // Actualizar título y favicon de la pestaña con datos del negocio
  useEffect(() => {
    if (!business) return
    const businessName = business.name || business.businessName || ''
    if (businessName) {
      document.title = isRestaurantMenu
        ? `${businessName} - Menú Digital`
        : `${businessName} - Catálogo`
    }
    const displayLogo = business.catalogLogoUrl || business.logoUrl
    if (displayLogo) {
      const favicons = document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]')
      favicons.forEach(el => el.setAttribute('href', displayLogo))
    }
    // Restaurar al desmontar
    return () => {
      document.title = 'Sistema de Facturación Electrónica SUNAT | Retail y Restaurantes en Perú'
      const favicons = document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]')
      favicons.forEach(el => el.setAttribute('href', '/logo.png'))
    }
  }, [business, isRestaurantMenu])

  // Obtener categorías raíz (sin parentId) para mostrar en el catálogo, ordenadas
  const rootCategories = useMemo(() => {
    return categories
      .filter(cat => !cat.parentId && cat.showInCatalog !== false)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  }, [categories])

  // Obtener subcategorías visibles de la categoría raíz seleccionada, ordenadas
  const activeSubcategories = useMemo(() => {
    if (!selectedCategory) return []
    return categories
      .filter(cat => cat.parentId === selectedCategory && cat.showInCatalog !== false)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  }, [categories, selectedCategory])

  // Subcategorías visibles de CUALQUIER categoría (para el árbol del menú lateral)
  const getVisibleSubcategories = (parentId) => categories
    .filter(cat => cat.parentId === parentId && cat.showInCatalog !== false)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))


  // Función para obtener todos los IDs de subcategorías de una categoría
  const getAllDescendantCategoryIds = (parentId) => {
    const descendants = []
    const findChildren = (id) => {
      categories.forEach(cat => {
        if (cat.parentId === id) {
          descendants.push(cat.id)
          findChildren(cat.id) // Recursivo para subcategorías anidadas
        }
      })
    }
    findChildren(parentId)
    return descendants
  }

  // Filtrar productos
  // IDs de categorías ocultas en el catálogo
  const hiddenCategoryIds = useMemo(() => {
    const hidden = new Set()
    categories.forEach(cat => {
      if (cat.showInCatalog === false) {
        hidden.add(cat.id)
      }
    })
    return hidden
  }, [categories])

  // Si el negocio activó "Ocultar productos sin stock", omitir productos agotados
  // del catálogo público (en vez de mostrarlos con badge "Agotado").
  // No aplica si "Ignorar stock" está activo (en ese caso todos son disponibles).
  const hideOutOfStock = business?.catalogHideOutOfStock === true
  const ignoreStockSetting = business?.catalogIgnoreStock === true

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Excluir productos desactivados (isActive === false) del catálogo público.
      if (product.isActive === false) return false

      // Excluir productos sin stock si la opción está activa (y no se ignora el stock)
      if (hideOutOfStock && !ignoreStockSetting && isProductOutOfStock(product, false)) {
        return false
      }

      // Búsqueda flexible e insensible a tildes/acentos: cada palabra (parcial) del término
      // debe aparecer en algún campo del producto. Ej: "POL ROJ" encuentra "Polo Adidas Rojo"
      // y "camion" encuentra "Camión".
      const matchesSearch = (() => {
        if (!searchQuery) return true
        const terms = normalizeForSearch(searchQuery).split(/\s+/).filter(Boolean)
        if (terms.length === 0) return true
        const variantText = (product.variants || [])
          .map(v => Object.values(v?.attributes || {}).join(' '))
          .join(' ')
        const haystack = normalizeForSearch(
          [product.name, product.description, product.marca, product.code, product.sku, variantText]
            .filter(Boolean).join(' ')
        )
        return terms.every(term => haystack.includes(term))
      })()

      // Excluir productos de categorías ocultas
      if (product.category && hiddenCategoryIds.has(product.category)) {
        return false
      }

      // Incluir productos de la categoría/subcategoría seleccionada
      let matchesCategory = !selectedCategory
      if (selectedSubcategory) {
        // Si hay subcategoría seleccionada, filtrar solo por esa subcategoría y sus descendientes
        const descendantIds = getAllDescendantCategoryIds(selectedSubcategory)
        const allCategoryIds = [selectedSubcategory, ...descendantIds]
        matchesCategory = allCategoryIds.includes(product.category)
      } else if (selectedCategory) {
        // Si solo hay categoría raíz, incluir todos sus descendientes
        const descendantIds = getAllDescendantCategoryIds(selectedCategory)
        const allCategoryIds = [selectedCategory, ...descendantIds]
        matchesCategory = allCategoryIds.includes(product.category)
      }

      return matchesSearch && matchesCategory
    })
  }, [products, searchQuery, selectedCategory, selectedSubcategory, categories, hiddenCategoryIds, hideOutOfStock, ignoreStockSetting])

  // Productos destacados
  const featuredProducts = useMemo(() => {
    return filteredProducts.filter(p => p.isFeatured)
  }, [filteredProducts])

  // Render incremental: solo se pintan `visibleCount` tarjetas; al llegar al
  // final (sentinel) se suman 40 más. Reset al cambiar búsqueda/categoría.
  const displayedProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  )

  useEffect(() => {
    setVisibleCount(40)
  }, [searchQuery, selectedCategory, selectedSubcategory, viewMode])

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel) return
    if (visibleCount >= filteredProducts.length) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        setVisibleCount(prev => prev + 40)
      }
    }, { rootMargin: '600px' }) // empezar a cargar antes de que el usuario llegue al final
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleCount, filteredProducts.length, viewMode])

  // Configuración de visibilidad de precios
  const showPrices = business?.catalogShowPrices !== false
  const ignoreStock = business?.catalogIgnoreStock === true

  // ===== Multi-divisa: moneda del catálogo público =====
  // El catálogo respeta defaultCurrency del negocio solo si activó la
  // flag multiCurrencyEnabled. Para 99% de negocios (sin flag) → PEN.
  const catalogCurrency = isMultiCurrencyEnabled(business)
    ? normalizeCurrency(business?.defaultCurrency)
    : BASE_CURRENCY

  // Convierte un precio del catálogo (siempre PEN en Firestore) a la
  // moneda activa del catálogo público.
  const toCatalogDisplay = (priceInPen) => {
    const n = Number(priceInPen) || 0
    if (catalogCurrency === BASE_CURRENCY || n === 0) return n
    return Number(convertFromBase(n, 'USD', catalogExchangeRate || 1).toFixed(2))
  }

  // Formatea un precio del catálogo (acepta PEN nativo del producto).
  const fmtCatalog = (priceInPen) => formatCurrency(toCatalogDisplay(priceInPen), catalogCurrency)

  // Multi-divisa: precio principal del producto formateado. Si el catálogo
  // está en USD y el producto tiene `priceUSD` definido, se usa ese precio
  // directamente (sin conversión TC). En PEN o sin priceUSD: convierte
  // product.price con TC normalmente. Para productos con variantes mantiene
  // la lógica anterior (variantes no soportan priceUSD por ahora).
  const fmtProductMain = (product) => {
    if (!product) return formatCurrency(0, catalogCurrency)
    if (catalogCurrency === 'USD') {
      const fixedUSD = Number(product.priceUSD)
      if (Number.isFinite(fixedUSD) && fixedUSD > 0) {
        return formatCurrency(fixedUSD, 'USD')
      }
    }
    return fmtCatalog(product.price)
  }

  const groupByCategory = business?.catalogGroupByCategory === true
  // Solo aplica si también está activo groupByCategory.
  // Oculta el botón "Todos" y la lista flat al final → fuerza a entrar por categoría.
  const onlyCarousels = groupByCategory && business?.catalogOnlyCarousels === true
  // Tema del catálogo (registro centralizado en src/themes/catalogThemes.js).
  // Si la URL trae ?previewTheme=, sobrescribe lo guardado (vista previa desde Settings).
  const effectiveTheme = previewThemeFromUrl || business?.catalogTheme
  const themeClasses = getCatalogThemeClasses(effectiveTheme)

  const thBg = themeClasses.bg
  const thCard = themeClasses.card
  const thCardShadow = themeClasses.cardShadow
  const thText = themeClasses.text
  const thTextMuted = themeClasses.textMuted
  const thTextFaint = themeClasses.textFaint
  const thHeaderBg = themeClasses.headerBg
  const thCatInactive = themeClasses.catInactive
  const thViewActive = themeClasses.viewActive
  const thViewHover = themeClasses.viewHover
  const thCatBadge = themeClasses.catBadge
  const thListBadge = themeClasses.listBadge
  const thSearchBanner = themeClasses.searchBanner
  const thSearchClassic = themeClasses.searchClassic
  const thObsText = themeClasses.obsText
  const thBorderColor = themeClasses.borderColor
  const thFooterPowered = themeClasses.footerPowered
  const thFooterLink = themeClasses.footerLink
  const thCartBadgeBg = themeClasses.cartBadgeBg
  const thCartBadgeColor = themeClasses.cartBadgeColor
  // Forma + tipografía (tokens del tema)
  const thCardRadius = themeClasses.cardRadius || 'rounded-xl'
  const thCardShadowEffect = themeClasses.cardShadowEffect || 'shadow-sm hover:shadow-md'
  const thProductName = themeClasses.productNameClass || 'font-semibold text-sm'
  const thPrice = themeClasses.priceClass || 'text-base font-bold'
  const thFontWrapper = themeClasses.fontWrapper || 'font-sans'

  // Funciones del carrito
  const addToCart = (product, quantity = 1, selectedModifiers = [], unitPrice = null, priceLevelLabel = null) => {
    // No permitir agregar productos agotados
    if (isProductOutOfStock(product, ignoreStock)) return

    // Determinar precio según cantidad: para cada nivel de precio (price2/3/4)
    // que cumpla su cantidad mínima propia, elegimos el MÁS BARATO. Si ninguno
    // aplica, usamos product.price (o el unitPrice explícito que pasó el caller).
    const computeBestPriceFor = (qty) => {
      if (!business?.multiplePricesEnabled) return null
      const candidates = ['price2', 'price3', 'price4']
        .map(key => {
          const v = parseFloat(product[key])
          if (!Number.isFinite(v) || v <= 0) return null
          const min = getCatalogMinQty(business, key, product)
          if (min <= 1) return null // requiere umbral configurado
          if (qty < min) return null
          return { key, value: v, label: business.priceLabels?.[key] || key }
        })
        .filter(Boolean)
      if (candidates.length === 0) return null
      candidates.sort((a, b) => a.value - b.value)
      return candidates[0]
    }

    let finalUnitPrice = unitPrice || product.price
    let finalPriceLabel = priceLevelLabel
    if (!unitPrice) {
      const best = computeBestPriceFor(quantity)
      if (best) {
        finalUnitPrice = best.value
        finalPriceLabel = best.label
      }
    }

    setCart(prev => {
      // Generar un ID único para el item del carrito basado en producto + variante + modificadores (sin precio)
      const variantKey = product.isVariant ? product.variantSku : ''
      const modifiersKey = selectedModifiers.length > 0
        ? JSON.stringify(selectedModifiers.map(m => ({ id: m.modifierId, opts: m.options.map(o => o.optionId).sort() })))
        : ''
      const cartItemId = `${product.id}-${variantKey}-${modifiersKey}`

      const existing = prev.find(item => item.cartItemId === cartItemId)
      if (existing) {
        const newQty = existing.quantity + quantity
        // Recalcular precio al acumular cantidad: aplica el mejor nivel para newQty
        let updatedPrice = existing.unitPrice
        let updatedLabel = existing.priceLevelLabel
        if (!unitPrice) {
          const best = computeBestPriceFor(newQty)
          if (best) {
            updatedPrice = best.value
            updatedLabel = best.label
          } else {
            updatedPrice = product.price
            updatedLabel = null
          }
        }
        return prev.map(item =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: newQty, unitPrice: updatedPrice, priceLevelLabel: updatedLabel }
            : item
        )
      }
      // Multi-divisa: si el producto tiene priceUSD definido Y NO se aplicó
      // un nivel de precio (price2/3/4), guardamos fixedPriceUSD para que
      // el carrito/checkout muestre ese precio en sesiones USD sin depender
      // del TC. Si se aplicó un nivel de precio, ese precio (PEN) se convierte.
      const fixedUSD = Number(product.priceUSD)
      const hasFixedUSD = !finalPriceLabel && Number.isFinite(fixedUSD) && fixedUSD > 0
      return [...prev, {
        ...product,
        cartItemId,
        quantity,
        selectedModifiers,
        unitPrice: finalUnitPrice,
        originalUnitPrice: unitPrice || product.price,
        priceLevelLabel: finalPriceLabel,
        ...(hasFixedUSD && { fixedPriceUSD: fixedUSD }),
      }]
    })
  }

  const updateCartQuantity = (cartItemId, quantity) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => (item.cartItemId || item.id) !== cartItemId))
    } else {
      setCart(prev => prev.map(item => {
        if ((item.cartItemId || item.id) !== cartItemId) return item
        const updated = { ...item, quantity }

        // Auto-cambiar precio según el nivel más barato aplicable a la nueva cantidad
        if (business?.multiplePricesEnabled) {
          const candidates = ['price2', 'price3', 'price4']
            .map(key => {
              const v = parseFloat(item[key])
              if (!Number.isFinite(v) || v <= 0) return null
              // item ya tiene useAutoPriceByQty y priceMinQtys porque se creó con ...product
              const min = getCatalogMinQty(business, key, item)
              if (min <= 1 || quantity < min) return null
              return { key, value: v, label: business.priceLabels?.[key] || key }
            })
            .filter(Boolean)
          candidates.sort((a, b) => a.value - b.value)
          if (candidates.length > 0) {
            updated.unitPrice = candidates[0].value
            updated.priceLevelLabel = candidates[0].label
          } else {
            updated.unitPrice = item.originalUnitPrice || item.price
            updated.priceLevelLabel = null
          }
        }

        return updated
      }))
    }
  }

  const removeFromCart = (cartItemId) => {
    setCart(prev => prev.filter(item => (item.cartItemId || item.id) !== cartItemId))
  }

  const getCartQuantity = (productId) => {
    // Sumar cantidad de todos los items de este producto (con diferentes modificadores)
    return cart.filter(i => i.id === productId).reduce((sum, item) => sum + item.quantity, 0)
  }

  // Checkout por WhatsApp
  const handleCheckout = () => {
    // Verificar horario de atención
    const hoursStatus = isBusinessOpen(business?.businessHours)
    if (!hoursStatus.open) {
      alert(`🕐 ${hoursStatus.message}. No se pueden realizar pedidos fuera del horario de atención.`)
      return
    }

    if (!business?.catalogWhatsapp && !business?.whatsapp && !business?.phone) {
      alert('Este negocio no tiene WhatsApp configurado')
      return
    }

    const phone = (business.catalogWhatsapp || business.whatsapp || business.phone).replace(/\D/g, '')
    // Multi-divisa: helper para convertir el precio de un item a la moneda
    // del catálogo. Respeta fixedPriceUSD (priceUSD del producto) si aplica.
    const itemDisplay = (item) => {
      const fixedUSD = Number(item.fixedPriceUSD)
      if (catalogCurrency === 'USD' && Number.isFinite(fixedUSD) && fixedUSD > 0) {
        return fixedUSD
      }
      const pricePen = Number(item.unitPrice || item.price) || 0
      if (catalogCurrency === 'PEN') return pricePen
      return Number(convertFromBase(pricePen, 'USD', catalogExchangeRate || 1).toFixed(2))
    }
    const items = cart.map(item => {
      // Para productos por peso (kg, L, etc.) usamos "1.5 kg" en vez de "1.5x"
      const qtyDisplay = item.allowDecimalQuantity
        ? `${formatQty(item.quantity)} ${getShortUnitLabel(item.unit)}`
        : `${formatQty(item.quantity)}x`
      let itemText = `• ${qtyDisplay} ${item.name}`
      // Agregar nivel de precio si no es el default
      if (item.priceLevelLabel) {
        itemText += ` (${item.priceLevelLabel})`
      }
      // Agregar variante si existe
      if (item.isVariant && item.variantAttributes) {
        const attrs = Object.entries(item.variantAttributes).map(([k, v]) => `${k}: ${v}`).join(', ')
        itemText += ` (${attrs})`
      }
      // Agregar modificadores si existen
      if (item.selectedModifiers?.length > 0) {
        const modsText = item.selectedModifiers
          .map(mod => `  - ${mod.modifierName}: ${mod.options.map(o => o.quantity > 1 ? `${o.quantity}x ${o.optionName}` : o.optionName).join(', ')}`)
          .join('\n')
        itemText += `\n${modsText}`
      }
      // Respetar flag por-producto "catalogHidePrice" además del global showPrices
      if (showPrices && !item.catalogHidePrice) {
        const lineDisplay = itemDisplay(item) * item.quantity
        itemText += ` - ${formatCurrency(lineDisplay, catalogCurrency)}`
      } else {
        itemText += ' - (A consultar)'
      }
      return itemText
    }).join('\n')

    const hasHidden = cart.some(i => i.catalogHidePrice)
    const showTotal = showPrices && !hasHidden
    let message
    if (showTotal) {
      // Total ya en moneda del catálogo, respeta priceUSD por item.
      const totalDisplay = cart.reduce((sum, item) => sum + itemDisplay(item) * item.quantity, 0)
      message = encodeURIComponent(
        `¡Hola! Me gustaría hacer un pedido:\n\n${items}\n\n*Total: ${formatCurrency(totalDisplay, catalogCurrency)}*\n\nGracias!`
      )
    } else {
      message = encodeURIComponent(
        `¡Hola! Me gustaría hacer un pedido:\n\n${items}\n\n*Total: A consultar*\n\nGracias!`
      )
    }

    window.open(`https://wa.me/${phone}?text=${message}`, '_blank')
  }

  // Total items en carrito
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  // Pantalla "Temporalmente fuera de servicio" — se muestra cuando la
  // suscripción del negocio está suspendida/bloqueada. El cliente final
  // ve un mensaje neutro y profesional, sin productos ni opción de pedir.
  if (businessSuspended) {
    const displayName = business?.businessName || business?.name || ''
    const logo = business?.catalogLogoUrl || business?.logoUrl || null
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${thBg}`}>
        <div className="max-w-md w-full">
          <div className={`rounded-2xl shadow-lg ${thCard} p-8 text-center`}>
            {logo ? (
              <img
                src={logo}
                alt={displayName}
                className="w-20 h-20 mx-auto mb-4 object-contain rounded-lg"
              />
            ) : (
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock className="w-10 h-10 text-amber-600" />
              </div>
            )}

            {displayName && (
              <h1 className={`text-xl font-bold mb-1 ${thText}`}>{displayName}</h1>
            )}

            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-sm font-medium mb-4 border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Temporalmente fuera de servicio
            </div>

            <h2 className={`text-lg font-semibold mb-2 ${thText}`}>
              {isRestaurantMenu ? 'Menú no disponible' : 'Catálogo no disponible'}
            </h2>
            <p className={`text-sm ${thTextFaint}`}>
              {isRestaurantMenu
                ? 'En este momento no estamos tomando pedidos. Por favor intentá más tarde o contactanos directamente.'
                : 'En este momento no estamos atendiendo pedidos. Por favor intentá más tarde o contactanos directamente.'}
            </p>

            {business?.phone && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Contacto</p>
                <a
                  href={`tel:${business.phone}`}
                  className="text-sm font-medium text-primary-600 hover:underline"
                >
                  {business.phone}
                </a>
              </div>
            )}
          </div>

          <p className="text-center text-[11px] text-gray-400 mt-4">
            Powered by Cobrify
          </p>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className={`min-h-screen ${thBg}`}>
        <div className={`shadow-sm ${thCard}`}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-48 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-32" />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {[...Array(8)].map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${thBg}`}>
        <div className="text-center">
          {isRestaurantMenu ? (
            <UtensilsCrossed className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          ) : (
            <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          )}
          <h1 className={`text-2xl font-bold mb-2 ${thText}`}>{error}</h1>
          <p className={thTextFaint}>
            {isRestaurantMenu
              ? 'El menú que buscas no existe o no está disponible'
              : 'El catálogo que buscas no existe o no está disponible'}
          </p>
        </div>
      </div>
    )
  }

  // Contexto compartido de las tarjetas de producto (F1.4): las 4 variantes
  // viven en components/catalog/ProductCards.jsx y reciben esto como prop.
  const cardCtx = {
    business, showPrices, ignoreStock, categories, selectedCategory,
    fmtCatalog, fmtProductMain, getCartQuantity, setSelectedProduct, addToCart,
    th: {
      cardRadius: thCardRadius, cardShadowEffect: thCardShadowEffect, cardShadow: thCardShadow,
      productName: thProductName, text: thText, textMuted: thTextMuted, price: thPrice,
      catBadge: thCatBadge, listBadge: thListBadge,
    },
  }

  return (
    <div className={`min-h-screen ${thBg} ${thFontWrapper}`}>
      <style>{fadeInStyle}</style>
      {/* Tira publicitaria (F2.1) — activable desde Configuración */}
      <AnnouncementBar config={business?.catalogAnnouncement} />
      {/* Banner de mesa (si viene de QR con número de mesa) */}
      {isRestaurantMenu && tableFromUrl && (
        <div className="text-white py-2.5 px-4 sticky top-0 z-50" style={{ backgroundColor: getCatalogAccent(business) }}>
          {activeTableOrder ? (
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center gap-2 min-w-0">
                <UtensilsCrossed className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium truncate">
                  Mesa {tableFromUrl} • Orden {activeTableOrder.orderNumber}
                </span>
              </div>
              <button
                onClick={() => setAccountModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-sm font-semibold transition-colors flex-shrink-0"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Ver mi cuenta
              </button>
            </div>
          ) : (
            <div className="text-center text-sm font-medium">
              <UtensilsCrossed className="w-4 h-4 inline mr-2" />
              Mesa {tableFromUrl} - Haz tu pedido desde tu celular
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <header className={`${thHeaderBg} shadow-sm sticky ${isRestaurantMenu && tableFromUrl ? 'top-[41px]' : 'top-0'} z-40`}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo y nombre — landscape tiene prioridad y oculta el nombre */}
            {(() => {
              const headerLogoSrc = business?.catalogLogoLandscape || business?.catalogLogoUrl || business?.logoUrl
              const headerIsLandscape = !!business?.catalogLogoLandscape || isLogoHorizontal
              const headerLogoSize = headerIsLandscape ? 'logo_landscape' : 'logo_square'
              return (
            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
              {headerLogoSrc ? (
                <img
                  src={optimizeImageUrl(headerLogoSrc, headerLogoSize)}
                  alt={business.name}
                  className={`${headerIsLandscape ? 'h-8 md:h-10 max-w-[180px] md:max-w-[260px]' : 'h-9 md:h-12 max-w-[100px] md:max-w-[200px]'} w-auto object-contain flex-shrink-0`}
                  onLoad={(e) => {
                    if (!business?.catalogLogoLandscape) {
                      const { naturalWidth, naturalHeight } = e.target
                      setIsLogoHorizontal(naturalWidth / naturalHeight > 1.8)
                    }
                  }}
                />
              ) : (
                <div
                  className="w-9 h-9 md:w-12 md:h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: getCatalogAccent(business) }}
                >
                  {isRestaurantMenu ? (
                    <UtensilsCrossed className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  ) : (
                    <Store className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  )}
                </div>
              )}
              {/* Si el logo es horizontal (incluye el nombre), ocultar texto */}
              {!headerIsLandscape && (
              <div className="min-w-0">
                <h1 className={`font-bold text-base md:text-xl truncate ${thText}`}>
                  {business?.name || business?.businessName}
                </h1>
                {business?.catalogTagline && (
                  <p className={`text-sm hidden md:block ${thTextMuted}`}>{business.catalogTagline}</p>
                )}
              </div>
              )}
            </div>
              )
            })()}

            {/* Carrito */}
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-full transition-opacity text-white hover:opacity-80"
              style={{ backgroundColor: getCatalogAccent(business) }}
            >
              <ShoppingBag className="w-5 h-5" />
              <span className="hidden md:inline font-medium">{isRestaurantMenu ? 'Pedido' : 'Carrito'}</span>
              {cartItemsCount > 0 && (
                <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: thCartBadgeBg, color: thCartBadgeColor }}
                >
                  {cartItemsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero / Búsqueda — carrusel (F2.2) si está activado, banner cuando hay
          portada única, clásico (gradient) si no hay nada */}
      {business?.catalogHero?.enabled && (business?.catalogHero?.slides || []).filter(s => s.imageUrl).length > 0 ? (
        /* === CARRUSEL HERO: slides promocionales con autoplay === */
        <div className="relative overflow-hidden">
          <HeroCarousel slides={business.catalogHero.slides.filter(s => s.imageUrl)} />
          {/* Barra de búsqueda debajo del carrusel (mismo estilo que el banner) */}
          <div className={`${themeClasses.bg} px-4 py-3`}>
            <div className="relative max-w-7xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-12 pr-4 py-3 rounded-xl shadow-sm focus:outline-none focus:ring-2 ${thSearchBanner}`}
              />
            </div>
          </div>
        </div>
      ) : business?.catalogCoverImage ? (
        /* === ESTILO BANNER: Imagen hero grande === */
        <div className="relative overflow-hidden">
          <div className="relative h-48 md:h-72">
            <picture>
              <source
                media="(max-width: 767px)"
                srcSet={optimizeImageUrl(business.catalogCoverImageMobile || business.catalogCoverImage, 'cover_mobile')}
              />
              <img
                src={optimizeImageUrl(business.catalogCoverImage, 'cover_desktop')}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                fetchpriority="high"
                decoding="async"
              />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            {/* Info sobre el banner */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 max-w-7xl mx-auto">
              <div className="flex items-end gap-4">
                {(() => {
                  const overlayLogo = business?.catalogLogoLandscape || business?.catalogLogoUrl || business?.logoUrl
                  const overlayIsLandscape = !!business?.catalogLogoLandscape
                  if (!overlayLogo) return null
                  return (
                  <img
                    src={optimizeImageUrl(overlayLogo, overlayIsLandscape ? 'logo_landscape' : 'logo_square')}
                    alt={business.name}
                    className={`${overlayIsLandscape ? 'h-12 md:h-16 max-w-[180px] md:max-w-[240px]' : 'h-14 md:h-20 max-w-[120px] md:max-w-[180px]'} w-auto object-contain bg-white/90 rounded-xl p-1.5 shadow-lg flex-shrink-0`}
                  />
                  )
                })()}
                <div className="min-w-0 pb-1">
                  {business?.catalogWelcome && (
                    <p className="text-white/80 text-sm mb-1 truncate">{business.catalogWelcome}</p>
                  )}
                  {!business?.catalogLogoLandscape && (
                    <h2 className="text-white font-bold text-lg md:text-2xl truncate drop-shadow-lg">
                      {business?.name || business?.businessName}
                    </h2>
                  )}
                  {business?.catalogTagline && (
                    <p className="text-white/70 text-sm mt-0.5 truncate">{business.catalogTagline}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Barra de búsqueda debajo del banner */}
          <div className={`${themeClasses.bg} px-4 py-3`}>
            <div className="relative max-w-7xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-12 pr-4 py-3 rounded-xl shadow-sm focus:outline-none focus:ring-2 ${thSearchBanner}`}
              />
            </div>
          </div>
        </div>
      ) : (
        /* === ESTILO CLÁSICO: solo cuando NO hay portada (gradient sólido) === */
        <div
          className="relative text-white overflow-hidden"
          style={{
            background: business?.catalogColor
              ? `linear-gradient(135deg, ${business.catalogColor} 0%, ${business.catalogColor}dd 100%)`
              : 'linear-gradient(135deg, #1F2937 0%, #111827 100%)'
          }}
        >
          <div className="relative max-w-7xl mx-auto px-4 py-8 md:py-12">
            {business?.catalogWelcome && (
              <p className="text-white/80 mb-4 text-center md:text-left">
                {business.catalogWelcome}
              </p>
            )}

            {/* Barra de búsqueda */}
            <div className="relative max-w-2xl mx-auto md:mx-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-12 pr-4 py-4 rounded-2xl shadow-lg focus:outline-none focus:ring-4 focus:ring-white/30 ${thSearchClassic}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Observaciones del catálogo */}
      {business?.catalogObservations && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          {/* Los ramales isDark/isCafe eran de temas que ya no existen en el
              registro ('dark'/'tech'/'cafe') — siempre caían al caso base. */}
          <div
            className="rounded-xl p-4 flex items-start gap-3"
            style={{
              backgroundColor: `${getCatalogAccent(business)}10`,
              borderLeft: `4px solid ${getCatalogAccent(business)}`
            }}
          >
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: getCatalogAccent(business) }} />
            <p className={`text-sm whitespace-pre-wrap ${thObsText}`}>{business.catalogObservations}</p>
          </div>
        </div>
      )}

      {/* Categorías */}
      {rootCategories.length > 0 && (
        <div className={`${thCard} ${thBorderColor} border-b sticky top-16 md:top-20 z-30`}>
          <div className="max-w-7xl mx-auto px-4">
            {/* Categorías raíz - móvil: 1 fila scroll edge-to-edge, desktop: wrap centrado */}
            <div className="flex md:flex-wrap md:justify-center overflow-x-auto md:overflow-x-visible gap-2 py-3 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
              {/* Menú lateral de categorías (solo móvil): abre el árbol completo de
                  categorías y subcategorías sin ocupar pantalla. */}
              <button
                onClick={() => { setDrawerExpandedCategory(selectedCategory); setCategoryDrawerOpen(true) }}
                className={`md:hidden px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${thCatInactive}`}
                aria-label="Ver todas las categorías"
              >
                <Filter className="w-4 h-4" />
              </button>
              {/* Botón "Todos": oculto en modo onlyCarousels cuando estamos en la vista principal,
                  para forzar al cliente a entrar a una categoría. Dentro de una categoría sí se muestra. */}
              {(!onlyCarousels || selectedCategory || searchQuery) && (
                <button
                  onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null) }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                    !selectedCategory
                      ? 'text-white'
                      : thCatInactive
                  }`}
                  style={!selectedCategory ? { backgroundColor: getCatalogAccent(business) } : {}}
                >
                  Todos
                </button>
              )}
              {rootCategories.map(category => (
                <button
                  key={category.id}
                  onClick={() => { setSelectedCategory(category.id); setSelectedSubcategory(null) }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                    selectedCategory === category.id
                      ? 'text-white'
                      : thCatInactive
                  }`}
                  style={selectedCategory === category.id ? { backgroundColor: getCatalogAccent(business) } : {}}
                >
                  {category.name}
                </button>
              ))}
            </div>
            {/* Subcategorías de la categoría seleccionada.
                Móvil: UNA fila deslizable (el wrap multilínea comía media pantalla
                con negocios de muchas subcategorías); el árbol completo se ve en el
                menú lateral (botón de filtro). Desktop: wrap, hay espacio de sobra. */}
            {activeSubcategories.length > 0 && (
              <div className="flex flex-nowrap md:flex-wrap overflow-x-auto md:overflow-x-visible gap-2 pb-3 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                {/* Subcategorías con el color del catálogo (antes: azul fijo
                    bg-primary-* que rompía la estética). Seleccionada = fondo
                    sólido del acento + texto blanco; inactiva = tinte claro del
                    mismo acento (~8%) con el acento como texto. */}
                <button
                  onClick={() => setSelectedSubcategory(null)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0"
                  style={!selectedSubcategory
                    ? { backgroundColor: getCatalogAccent(business), color: '#fff' }
                    : { backgroundColor: `${getCatalogAccent(business)}15`, color: getCatalogAccent(business) }}
                >
                  Todas
                </button>
                {activeSubcategories.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setSelectedSubcategory(sub.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0"
                    style={selectedSubcategory === sub.id
                      ? { backgroundColor: getCatalogAccent(business), color: '#fff' }
                      : { backgroundColor: `${getCatalogAccent(business)}15`, color: getCatalogAccent(business) }}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Menú lateral de categorías (móvil): árbol Todos → categorías → subcategorías.
          Tocar el nombre selecciona y cierra; el chevron expande las subcategorías. */}
      {categoryDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCategoryDrawerOpen(false)} />
          <div className={`absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] ${thCard} shadow-2xl flex flex-col`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${thBorderColor} flex-shrink-0`}>
              <span className="font-semibold">Categorías</span>
              <button onClick={() => setCategoryDrawerOpen(false)} className="p-2 -mr-2" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <button
                onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); setCategoryDrawerOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold"
                style={!selectedCategory ? { color: getCatalogAccent(business) } : {}}
              >
                Todos
              </button>
              {rootCategories.map(category => {
                const subs = getVisibleSubcategories(category.id)
                const isExpanded = drawerExpandedCategory === category.id
                const isActive = selectedCategory === category.id
                return (
                  <div key={category.id}>
                    <div className="flex items-center">
                      <button
                        onClick={() => { setSelectedCategory(category.id); setSelectedSubcategory(null); setCategoryDrawerOpen(false) }}
                        className="flex-1 text-left px-4 py-2.5 text-sm font-semibold"
                        style={isActive ? { color: getCatalogAccent(business) } : {}}
                      >
                        {category.name}
                      </button>
                      {subs.length > 0 && (
                        <button
                          onClick={() => setDrawerExpandedCategory(isExpanded ? null : category.id)}
                          className="p-2.5 mr-2 flex-shrink-0"
                          aria-label={isExpanded ? 'Contraer subcategorías' : 'Ver subcategorías'}
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                    {isExpanded && subs.length > 0 && (
                      <div className="pb-1">
                        {subs.map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => { setSelectedCategory(category.id); setSelectedSubcategory(sub.id); setCategoryDrawerOpen(false) }}
                            className="w-full text-left pl-8 pr-4 py-2 text-sm opacity-90"
                            style={isActive && selectedSubcategory === sub.id ? { color: getCatalogAccent(business), fontWeight: 600, opacity: 1 } : {}}
                          >
                            {sub.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Productos */}
      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Header de resultados (sin carruseles o con categoría seleccionada) */}
        {(!groupByCategory || selectedCategory || searchQuery) && (
          <div className="flex items-center justify-between mb-6">
            <p className={thTextFaint}>
              {filteredProducts.length} {filteredProducts.length === 1 ? 'producto' : 'productos'}
              {selectedCategory && rootCategories.find(c => c.id === selectedCategory) && (
                <span> en <strong>
                  {rootCategories.find(c => c.id === selectedCategory).name}
                  {selectedSubcategory && activeSubcategories.find(c => c.id === selectedSubcategory) && (
                    <> &rsaquo; {activeSubcategories.find(c => c.id === selectedSubcategory).name}</>
                  )}
                </strong></span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg ${viewMode === 'grid' ? thViewActive : thViewHover}`}
              >
                <Grid3X3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg ${viewMode === 'list' ? thViewActive : thViewHover}`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Vista agrupada por categoría con scroll horizontal */}
        {groupByCategory && !selectedCategory && !searchQuery && filteredProducts.length > 0 && rootCategories.length > 0 && (
          <div className="space-y-8 mb-10">
            {/* Carrusel de productos destacados */}
            {featuredProducts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">⭐</span>
                  <h2 className={`text-lg font-bold ${thText}`}>Destacados</h2>
                </div>
                <div className="overflow-x-auto scrollbar-hide -mx-4 px-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                  <div className="flex gap-4">
                    {featuredProducts.slice(0, 15).map(product => (
                      <FeaturedCard key={`featured-${product.id}`} product={product} ctx={cardCtx} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {rootCategories.map(category => {
              const categoryIds = [category.id, ...categories.filter(c => c.parentId === category.id).map(c => c.id)]
              const categoryProducts = filteredProducts.filter(p => categoryIds.includes(p.category))
              if (categoryProducts.length === 0) return null
              return (
                <div key={category.id}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className={`text-lg font-bold ${thText}`}>{category.name}</h2>
                    <button
                      onClick={() => { setSelectedCategory(category.id); setSelectedSubcategory(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                      className="text-sm font-medium hover:opacity-80 transition-opacity"
                      style={{ color: getCatalogAccent(business) }}
                    >
                      Ver todo →
                    </button>
                  </div>
                  <div className="overflow-x-auto scrollbar-hide -mx-4 px-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                    <div className="flex gap-4">
                      {categoryProducts.slice(0, 10).map(product => (
                        <CarouselCard key={product.id} product={product} ctx={cardCtx} />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
            {/* Separador antes de mostrar todos — oculto en modo onlyCarousels */}
            {!onlyCarousels && (
              <div className="flex items-center gap-4 pt-2">
                <div className={`flex-1 border-t ${thBorderColor}`} />
                <span className={`text-sm font-medium ${thTextFaint}`}>Todos los productos</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg ${viewMode === 'grid' ? thViewActive : thViewHover}`}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg ${viewMode === 'list' ? thViewActive : thViewHover}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
                <div className={`flex-1 border-t ${thBorderColor}`} />
              </div>
            )}
          </div>
        )}

        {/* Lista plana de productos — oculta en modo onlyCarousels cuando es vista principal.
            Al entrar a una categoría o buscar, sigue mostrándose normal. */}
        {onlyCarousels && groupByCategory && !selectedCategory && !searchQuery ? null : filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className={`text-lg font-medium mb-2 ${thText}`}>No se encontraron productos</h3>
            <p className={thTextFaint}>Intenta con otra búsqueda o categoría</p>
          </div>
        ) : viewMode === 'grid' ? (
          // Vista Grid (render incremental: displayedProducts crece con el scroll).
          // F2.3: 'masonry' = columnas con alturas naturales (default, como
          // siempre); 'grid' = cuadrícula uniforme con imágenes cuadradas
          // (además elimina el salto de layout al cargar imágenes).
          <div className={catalogLayout === 'grid'
            ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6'
            : 'columns-2 md:columns-3 lg:columns-4 gap-4 md:gap-6'}>
            {displayedProducts.map((product, index) => (
              <GridCard key={product.id} product={product} index={index} uniform={catalogLayout === 'grid'} ctx={cardCtx} />
            ))}
          </div>
        ) : (
          // Vista Lista (render incremental: displayedProducts crece con el scroll)
          <div className="space-y-4">
            {displayedProducts.map(product => (
              <ListCard key={product.id} product={product} ctx={cardCtx} />
            ))}
          </div>
        )}

        {/* Sentinel del scroll infinito + fallback "Ver más" (por si el
            IntersectionObserver no dispara en algún navegador antiguo).
            Solo cuando la grilla/lista está visible (no en modo solo-carruseles). */}
        {!(onlyCarousels && groupByCategory && !selectedCategory && !searchQuery) && displayedProducts.length < filteredProducts.length && (
          <div ref={loadMoreSentinelRef} className="text-center py-6">
            <button
              onClick={() => setVisibleCount(prev => prev + 40)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium ${thCatInactive}`}
            >
              Ver más productos ({filteredProducts.length - displayedProducts.length} restantes)
            </button>
          </div>
        )}

        {/* Indicador de carga en background (siguen llegando productos) */}
        {loadingMoreProducts && (
          <p className={`text-center text-xs py-3 flex items-center justify-center gap-1.5 ${thTextFaint}`}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Cargando más productos…
          </p>
        )}
      </main>

      {/* Footer con info del negocio */}
      <footer className={`${thCard} ${thBorderColor} border-t mt-12`}>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              {(() => {
                const footerLogo = business?.catalogLogoLandscape || business?.catalogLogoUrl || business?.logoUrl
                const footerIsLandscape = !!business?.catalogLogoLandscape
                if (!footerLogo) {
                  return (
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: getCatalogAccent(business) }}
                    >
                      <Store className="w-6 h-6 text-white" />
                    </div>
                  )
                }
                return (
                  <img
                    src={optimizeImageUrl(footerLogo, footerIsLandscape ? 'logo_landscape' : 'logo_square')}
                    alt={business.name}
                    className={`${footerIsLandscape ? 'h-10 max-w-[240px]' : 'h-12 max-w-[200px]'} object-contain`}
                  />
                )
              })()}
              <div>
                <h2 className={`font-bold ${thText}`}>
                  {business?.name || business?.businessName}
                </h2>
                {business?.address && (
                  <p className={`text-sm flex items-center gap-1 ${thTextMuted}`}>
                    <MapPin className="w-4 h-4" />
                    {business.address}
                  </p>
                )}
              </div>
            </div>

            {/* Horario de atención */}
            {business?.businessHours?.enabled && (
              <div className={`w-full md:w-auto ${thTextFaint}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-semibold">Horario de atención</span>
                  {(() => {
                    const status = isBusinessOpen(business.businessHours)
                    return (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {status.open ? 'Abierto' : 'Cerrado'}
                      </span>
                    )
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                  {[1, 2, 3, 4, 5, 6, 0].map(day => {
                    const config = business.businessHours.days?.[day]
                    const isToday = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })).getDay() === day
                    return (
                      <div key={day} className={`flex justify-between gap-2 ${isToday ? 'font-bold' : ''}`}>
                        <span>{DAY_SHORT[day]}</span>
                        <span className={config?.open ? '' : 'text-red-400'}>
                          {config?.open ? `${config.from} - ${config.to}` : 'Cerrado'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-4">
              {(business?.catalogWhatsapp || business?.whatsapp || business?.phone) && (
                <a
                  href={`https://wa.me/${(business.catalogWhatsapp || business.whatsapp || business.phone).replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 text-white rounded-full transition-opacity hover:opacity-80"
                  style={{ backgroundColor: getCatalogAccent(business) }}
                >
                  <MessageCircle className="w-5 h-5" />
                  WhatsApp
                </a>
              )}
              {business?.phone && (
                <a
                  href={`tel:${business.phone}`}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                >
                  <Phone className="w-5 h-5" />
                  Llamar
                </a>
              )}
            </div>
          </div>

          <div className={`mt-8 pt-6 border-t text-center text-sm ${thFooterPowered}`}>
            Catálogo powered by <a href="https://cobrifyperu.com" className={`hover:underline ${thFooterLink}`}>Cobrify</a>
          </div>
        </div>
      </footer>

      {/* Floating cart button (mobile) */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-6 left-4 right-4 md:hidden z-40">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full py-4 rounded-2xl font-semibold shadow-2xl flex items-center justify-center gap-3 text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: getCatalogAccent(business) }}
          >
            {isRestaurantMenu ? <UtensilsCrossed className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
            {isRestaurantMenu ? `Ver pedido (${cartItemsCount})` : `Ver carrito (${cartItemsCount})`}
            {showPrices && (
              <span className="bg-white/20 px-3 py-1 rounded-full">
                S/ {cart.reduce((sum, item) => sum + ((item.unitPrice || item.price) * item.quantity), 0).toFixed(2)}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Product Modal */}
      <ProductModal
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={addToCart}
        cartQuantity={selectedProduct ? getCartQuantity(selectedProduct.id) : 0}
        showPrices={showPrices}
        business={business}
        ignoreStock={ignoreStock}
        catalogCurrency={catalogCurrency}
        catalogExchangeRate={catalogExchangeRate}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onUpdateQuantity={updateCartQuantity}
        onRemove={removeFromCart}
        business={business}
        onCheckout={handleCheckout}
        showPrices={showPrices}
        isRestaurantMenu={isRestaurantMenu}
        tableNumber={tableFromUrl}
        activeTableOrder={activeTableOrder}
        catalogCurrency={catalogCurrency}
        catalogExchangeRate={catalogExchangeRate}
        onOrderAdded={() => {
          // Recargar la orden activa después de agregar items
          if (business && tableFromUrl) {
            const reloadOrder = async () => {
              try {
                const tablesRef = collection(db, 'businesses', business.id, 'tables')
                const allTablesSnap = await getDocs(tablesRef)
                const matched = allTablesSnap.docs.find(d => String(d.data().number) === tableFromUrl.trim())
                if (matched) {
                  const td = matched.data()
                  if (td.currentOrder) {
                    const orderSnap = await getDoc(doc(db, 'businesses', business.id, 'orders', td.currentOrder))
                    if (orderSnap.exists()) {
                      const od = orderSnap.data()
                      setActiveTableOrder({
                        orderId: orderSnap.id,
                        tableId: matched.id,
                        items: od.items || [],
                        total: od.total || 0,
                        orderNumber: od.orderNumber || '',
                        waiter: od.waiterName || td.waiter || '',
                      })
                    }
                  }
                }
              } catch (e) { console.warn('Error reloading order:', e) }
            }
            reloadOrder()
          }
        }}
      />

      {/* Modal de cuenta de la mesa */}
      <TableAccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        activeTableOrder={activeTableOrder}
        business={business}
        onAddMore={() => {}}
      />
    </div>
  )
}
