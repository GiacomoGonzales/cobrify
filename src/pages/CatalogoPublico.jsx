import { useState, useEffect, useMemo, useRef } from 'react'
import { optimizeImageUrl } from '@/utils/cloudinary'
import ProductModal from '@/components/catalog/ProductModal'
import CartDrawer, { TableAccountModal } from '@/components/catalog/CartDrawer'
import CategoryScroller from '@/components/catalog/CategoryScroller'
import CustomerAuthModal from '@/components/catalog/CustomerAuthModal'
import CustomerAccountDrawer from '@/components/catalog/CustomerAccountDrawer'
import { useCatalogCustomer } from '@/components/catalog/useCatalogCustomer'
import { FeaturedCard, CarouselCard, GridCard, ListCard } from '@/components/catalog/ProductCards'
import AnnouncementBar from '@/components/catalog/AnnouncementBar'
import HeroCarousel from '@/components/catalog/HeroCarousel'
import FlashSaleBar from '@/components/catalog/FlashSaleBar'
import TrustBadges from '@/components/catalog/TrustBadges'
import ReservarCitaSection from '@/components/catalog/ReservarCitaSection'
import ReservarHabitacionModal from '@/components/catalog/ReservarHabitacionModal'
import { ProductSkeleton } from '@/components/catalog/CatalogImages'
import {
  getShortUnitLabel,
  normalizeForSearch,
  formatQty,
  isBusinessOpen,
  isProductOutOfStock,
} from '@/components/catalog/catalogHelpers'
import { DEMO_CATALOG_DATA, DEMO_RESTAURANT_DATA } from '@/components/catalog/catalogDemoData'
import { getCatalogThemeClasses, getCatalogAccent, getCatalogTheme } from '@/themes/catalogThemes'
import { CatalogThemeProvider, buildCatalogCssVars } from '@/components/catalog/CatalogThemeProvider'
import CatalogSearchModal from '@/components/catalog/CatalogSearchModal'
import { usePublicPageChrome } from '@/hooks/usePublicPageChrome'
import CatalogFooter from '@/components/catalog/CatalogFooter'
import HeroMondrian from '@/components/catalog/HeroMondrian'
import HeroZine from '@/components/catalog/HeroZine'
import CatalogAmbience from '@/components/catalog/CatalogAmbience'
import { useParams, useSearchParams } from 'react-router-dom'
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, startAfter, documentId } from 'firebase/firestore'
// CATALOGO = catalogDb (SIN cache persistente), a proposito (14-ago-2026):
// la instancia principal `db` usa persistencia multi-pestana en IndexedDB, y
// cuando esa cache se corrompe Firestore revienta con "INTERNAL ASSERTION
// FAILED" ASINCRONO (no lo atrapa ningun try/catch) y el catalogo queda en
// esqueletos para siempre — le paso al dueno con varias pestanas abiertas.
// Un catalogo es una visita efimera: la cache persistente no le aporta nada.
// El alias `catalogDb as db` cubre todos los usos del archivo sin renombrar.
// OJO: las reglas de orders/tables/counters del catalogo son agnosticas al
// auth (chequean catalogEnabled + campos), asi que leer/escribir con la
// sesion del COMPRADOR (catalogAuth) o sin sesion funciona igual que antes.
import { catalogDb as db } from '@/lib/firebase'
import { getCatalogMinQty, formatCurrency } from '@/lib/utils'
import { isMultiCurrencyEnabled, convertFromBase, normalizeCurrency, BASE_CURRENCY } from '@/utils/currency'
import { getRateForDate } from '@/services/exchangeRateService'
import { BedDouble,
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
  Grid3X3,
  List,
  UtensilsCrossed,
  Info,
  User,
  LogOut,
  Menu,
  Heart,
  ChevronLeft,
  ChevronRight,
  BookOpen
} from 'lucide-react'
import { repreciarPorCantidad } from '@/utils/autoPriceByQty'
import { promoParaProducto, precioConPromo, CANAL_CATALOGO } from '@/services/scheduledDiscountService'

// Estilos de animacion para fade-in escalonado
const fadeInStyle = `
.catalog-fade-in {
  opacity: 1;
}
/* Temas oscuros (Velvet / Hologram): respiracion de los brillos y barrido del
   espectro. Quien pidio menos movimiento las ve quietas, no apagadas. */
@keyframes catalog-glow-pulse-kf {
  0%, 100% { opacity: .6; }
  50%      { opacity: 1; }
}
.catalog-glow-pulse { animation: catalog-glow-pulse-kf 5s ease-in-out infinite; }
@keyframes catalog-holo-sweep-kf {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.catalog-holo-sweep { animation: catalog-holo-sweep-kf 6s ease-in-out infinite; }
/* Texto pintado con el espectro. Sin el recorte al texto se veria una barra
   de colores, asi que los tres prefijos van juntos a proposito. */
.catalog-spectrum-text {
  background-image: linear-gradient(90deg,#ff0050,#ff8800,#ffff00,#00ff66,#00bbff,#8800ff,#ff00cc,#ff0050);
  background-size: 400% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: catalog-holo-sweep-kf 4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .catalog-glow-pulse, .catalog-holo-sweep, .catalog-spectrum-text { animation: none; }
}
/* Efecto "aparecer al hacer scroll" (F2.7). El catálogo ya monta las tarjetas
   de forma incremental a medida que bajas (40 en 40), así que una animación
   de entrada al MONTAR se percibe como reveal al hacer scroll — sin observers
   por tarjeta. Se respeta prefers-reduced-motion. */
@keyframes catalog-reveal-kf {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
.catalog-reveal {
  animation: catalog-reveal-kf 0.45s ease-out both;
}
@media (prefers-reduced-motion: reduce) {
  .catalog-reveal { animation: none; }
}
/* Drawer de producto (A2 del rediseño): en móvil sube desde abajo a pantalla
   completa; en desktop entra deslizándose desde la derecha como panel lateral. */
@keyframes catalog-drawer-up {
  from { transform: translateY(6%); opacity: 0.6; }
  to   { transform: translateY(0); opacity: 1; }
}
@keyframes catalog-drawer-left {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
.catalog-drawer-panel {
  animation: catalog-drawer-up 0.28s ease-out both;
}
@media (min-width: 768px) {
  .catalog-drawer-panel {
    animation: catalog-drawer-left 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
}
@media (prefers-reduced-motion: reduce) {
  .catalog-drawer-panel { animation: none; }
}
/* Swap de imagen al pasar el mouse (F2.7): la 2da foto se revela encima. */
.catalog-swap-second {
  opacity: 0;
  transition: opacity 0.3s ease;
}
.group:hover .catalog-swap-second { opacity: 1; }
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
// Ruido de fotocopia para el tema Zine. Es un SVG en linea (data URI): pesa
// unos cientos de bytes y no agrega una peticion de red.
const TEXTURA_PAPEL = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.95' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.10' /%3E%3C/svg%3E")`

export default function CatalogoPublico({ isDemo = false, isRestaurantMenu = false, customDomain = null, preloadedBusiness = null }) {
  const { slug, rubro: rubroDemo } = useParams()
  const [searchParams] = useSearchParams()
  const tableFromUrl = searchParams.get('mesa') || searchParams.get('table') || ''
  // `t` = ID del documento de la mesa. Es lo unico que identifica una mesa sin
  // ambiguedad: dos sucursales pueden tener ambas "Mesa 5" y el numero solo no
  // alcanza. Los QR impresos antes no lo traen -> se cae al match por numero.
  const tableIdFromUrl = searchParams.get('t') || ''

  // Resolver la mesa del QR entre los docs de mesas del negocio.
  const findTableDoc = (docs) => {
    if (tableIdFromUrl) {
      const porId = docs.find(d => d.id === tableIdFromUrl)
      if (porId) return porId
    }
    const num = tableFromUrl.trim()
    if (!num) return null
    return docs.find(d => String(d.data().number) === num) || null
  }
  // Modo vista previa: si la URL trae ?previewTheme=tech, sobrescribimos el tema guardado.
  // Lo usa el modal de Settings para que el dueño del negocio pruebe temas sin guardar.
  const previewThemeFromUrl = searchParams.get('previewTheme') || ''

  // Vista previa de tema (?previewTheme=): se pisa catalogTheme EN el objeto
  // business al cargarlo, así el acento por tema (getCatalogAccent lee
  // business.catalogTheme) y los componentes hijos (modal, carrito, tarjetas)
  // previsualizan coherente sin cambiar sus firmas. Solo visual, no persiste.
  const applyPreviewTheme = (biz) =>
    previewThemeFromUrl && biz ? { ...biz, catalogTheme: previewThemeFromUrl } : biz

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
  // Paginacion 'pages' (numerada): pagina actual. Los otros modos usan
  // visibleCount (incremental) o muestran todo.
  const [currentPage, setCurrentPage] = useState(1)
  const loadMoreSentinelRef = useRef(null)
  // Inicio de la lista de productos: al cambiar de pagina se sube HASTA AQUI,
  // no al tope absoluto (que mostraria de nuevo portada, buscador y categorias).
  const productsTopRef = useRef(null)
  const [categories, setCategories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  // Panel de busqueda (port shopifree): la lupa junto a las categorias lo
  // abre; la barra ancha bajo el hero ya no existe.
  const [searchOpen, setSearchOpen] = useState(false)
  // Reservas de citas desde el catalogo (veterinaria / General con agenda).
  const [showReservarHabitacion, setShowReservarHabitacion] = useState(false)
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
  // Orden de los productos elegido por el visitante. Por defecto A-Z: antes se
  // mostraban en el orden en que Firestore los devuelve (por ID), que para el
  // cliente se ve aleatorio.
  const [sortBy, setSortBy] = useState('name_asc') // name_asc | name_desc | price_asc | price_desc
  // Fase 2 (port shopifree): el header reacciona al scroll — sombra que
  // aparece, o filete del acento en el tema bold.
  // Barra del navegador con el color del negocio + sin banner de instalar
  // Cobrify: el visitante de una tienda no tiene nada que instalar.
  usePublicPageChrome(business?.catalogColor || null)

  const [headerScrolled, setHeaderScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // Diseño de grilla (F2.3 + motor v2): la config del negocio manda; si no
  // eligió, el TEMA propone su grilla; fallback 'masonry'. Se resuelve más
  // abajo (catalogLayout) porque depende del tema efectivo.
  const layoutAppliedRef = useRef(false)
  useEffect(() => {
    if (!business || layoutAppliedRef.current) return
    layoutAppliedRef.current = true
    if (business.catalogLayout === 'list') setViewMode('list')
  }, [business])
  const [isLogoHorizontal, setIsLogoHorizontal] = useState(false)
  // Cuenta OPCIONAL del comprador (Ola 1). Si no inicia sesión, el catálogo
  // funciona exactamente igual que siempre (pedido como invitado).
  // Cuentas de comprador: el negocio puede desactivarlas en Configuración.
  // Default ON (solo aporta comodidades y nunca obliga a registrarse).
  const customerAccountsOn = business?.catalogCustomerAccounts !== false
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountTab, setAccountTab] = useState('orders')
  const { user: catalogUser, profile: catalogProfile, setProfile: setCatalogProfile, signOut: catalogLogout } = useCatalogCustomer(customerAccountsOn ? business?.id : null)

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
          // /demo/:rubro/catalogo → el catálogo de ESE rubro. Sin rubro se
          // mantiene el catálogo demo de siempre.
          if (rubroDemo) {
            const [registro, motor] = await Promise.all([
              import('@/data/demo/rubros'),
              import('@/data/demo/motor'),
            ])
            const def = await registro.cargarRubro(rubroDemo)
            if (def) {
              const datos = motor.construirDatosDemo(def)
              setBusiness(applyPreviewTheme(datos.business))
              setProducts(datos.products.map((p) => ({ ...p, catalogVisible: true })))
              setCategories(datos.categories)
              setLoading(false)
              return
            }
          }
          const demoData = isRestaurantMenu ? DEMO_RESTAURANT_DATA : DEMO_CATALOG_DATA
          setBusiness(applyPreviewTheme(demoData.business))
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
          setBusiness(applyPreviewTheme(businessData))
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
          setBusiness(applyPreviewTheme(businessData))
          await fetchCatalogRate(businessData)
        }

        // Negocio suspendido -> pantalla "fuera de servicio". El flag
        // catalogSuspended vive en el DOC DEL NEGOCIO (ya cargado): antes se
        // leia subscriptions/, cuyas reglas exigen sesion del dueno, asi que
        // para compradores anonimos la verificacion fallaba en silencio y la
        // pantalla nunca aparecia. Lo espejan suspendUser/reactivateUser/
        // registerPayment (admin) y el panel de resellers.
        if (!isDemo && businessData?.catalogSuspended === true) {
          setBusinessSuspended(true)
          setLoading(false)
          return
        }

        // Cargar categorías ANTES que los productos (vienen del doc del negocio,
        // ya en memoria) para que los chips pinten con el primer lote.
        setCategories(businessData.productCategories || [])

        // Cargar productos visibles EN LOTES (carga progresiva): con catálogos de
        // cientos de productos, esperar a que baje todo dejaba la pantalla en
        // "cargando" varios segundos. El primer lote pinta el catálogo de una y
        // el resto sigue llegando en background. Se pagina con orderBy(documentId())
        // (índice single-field de Firestore — no requiere índices compuestos).
        /**
         * PROMOCIONES DEL CATÁLOGO.
         *
         * Se cargan ANTES que los productos para que el primer lote ya salga
         * con el precio de oferta puesto: si llegaran después, el cliente vería
         * el precio de lista y un parpadeo al corregirse.
         *
         * El descuento se aplica sobre la ficha del producto (precio nuevo, y el
         * de lista pasa a `catalogComparePrice`). Así el precio tachado, la
         * pastilla de "-10%", el detalle, el carrito y el pedido salen todos
         * bien sin tocar cada pantalla — y el precio que ve el cliente es el que
         * viaja al POS cuando el cajero abre el pedido.
         */
        let promosDelCatalogo = []
        try {
          const promosSnap = await getDocs(collection(db, 'businesses', businessData.id, 'scheduledDiscounts'))
          const ahora = new Date()
          promosDelCatalogo = promosSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => p.active && (!p.endsAt || p.endsAt.toDate() >= ahora))
        } catch {
          // Sin promociones el catálogo vende igual, a precio de lista.
        }

        const conPromo = (producto) => {
          const promo = promoParaProducto(producto, promosDelCatalogo, new Date(), CANAL_CATALOGO)
          if (!promo) return producto

          const precioLista = Number(producto.price) || 0
          const precioOferta = precioConPromo(precioLista, promo)
          if (!(precioOferta < precioLista)) return producto

          const listaUSD = Number(producto.priceUSD)
          return {
            ...producto,
            price: precioOferta,
            // Si el negocio ya tenía un "antes" más alto, ese manda: sigue
            // siendo cierto y el ahorro que muestra es el real.
            catalogComparePrice: Math.max(Number(producto.catalogComparePrice) || 0, precioLista),
            ...(Number.isFinite(listaUSD) && listaUSD > 0 ? { priceUSD: precioConPromo(listaUSD, promo) } : {}),
            ...(Array.isArray(producto.variants) && producto.variants.length > 0 ? {
              variants: producto.variants.map(v => ({ ...v, price: precioConPromo(v.price, promo) })),
            } : {}),
            promoPercent: promo.percent,
            promoName: promo.name || '',
          }
        }

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
          accumulated = accumulated.concat(snap.docs.map(d => conPromo({ id: d.id, ...d.data() })))
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
  }, [slug, isDemo, isRestaurantMenu, customDomain, rubroDemo])

  // Detectar mesa ocupada y cargar orden existente
  useEffect(() => {
    if (!business || !tableFromUrl || !isRestaurantMenu || isDemo) return

    async function checkActiveTable() {
      try {
        setLoadingTableOrder(true)
        const tablesRef = collection(db, 'businesses', business.id, 'tables')
        const allTablesSnap = await getDocs(tablesRef)

        const matchedTableDoc = findTableDoc(allTablesSnap.docs)

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
  }, [business, tableFromUrl, tableIdFromUrl, isRestaurantMenu, isDemo])

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

  // Foto representativa de cada categoría raíz para la variante 'circles'
  // (motor v2): las categorías no tienen imagen propia, así que se usa la del
  // primer producto con foto de la categoría (o de sus subcategorías).
  const categoryImageMap = useMemo(() => {
    const map = {}
    for (const cat of rootCategories) {
      const ids = new Set([cat.id, ...getAllDescendantCategoryIds(cat.id)])
      const withImg = products.find(p => ids.has(p.category) && p.imageUrl && p.isActive !== false)
      map[cat.id] = withImg?.imageUrl || null
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootCategories, products, categories])

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

  /**
   * Lo que el catálogo PUBLICA, antes de que el visitante filtre nada.
   *
   * Está separado de `filteredProducts` a propósito: aquel además aplica la
   * búsqueda y la categoría elegida, así que no sirve para alimentar otras
   * vistas. El buscador de la lupa recibía la lista CRUDA y por ahí se colaban
   * los productos desactivados, que sí estaban excluidos del grid.
   */
  const publicProducts = useMemo(() => {
    return products.filter(product => {
      // Excluir productos desactivados (isActive === false) del catálogo público.
      if (product.isActive === false) return false

      // Excluir productos sin stock si la opción está activa (y no se ignora el stock)
      if (hideOutOfStock && !ignoreStockSetting && isProductOutOfStock(product, false)) {
        return false
      }

      // Excluir productos de categorías ocultas
      if (product.category && hiddenCategoryIds.has(product.category)) return false

      return true
    })
  }, [products, hiddenCategoryIds, hideOutOfStock, ignoreStockSetting])

  const filteredProducts = useMemo(() => {
    const list = publicProducts.filter(product => {
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
    // Orden elegido por el visitante. Por defecto A-Z: sin esto los productos
    // salían en el orden de Firestore (por ID), que se ve aleatorio.
    // localeCompare 'es' con sensitivity 'base' → ignora tildes y mayúsculas
    // ("Ácido" junto a "Acido", "ñ" después de "n").
    const byName = (a, b) =>
      (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base', numeric: true })

    // Precio comparable: el que realmente ve el visitante. Si el catálogo está
    // en USD y el producto tiene precio fijo en dólares, se usa ese; si no, se
    // convierte el precio PEN con el TC del catálogo (misma regla que fmtProductMain).
    const catalogIsUSD = isMultiCurrencyEnabled(business) && normalizeCurrency(business?.defaultCurrency) === 'USD'
    const sortPriceOf = (p) => {
      const fixedUSD = Number(p?.priceUSD)
      if (catalogIsUSD && Number.isFinite(fixedUSD) && fixedUSD > 0) return fixedUSD
      const pen = Number(p?.price) || 0
      if (!catalogIsUSD || pen === 0) return pen
      return convertFromBase(pen, 'USD', catalogExchangeRate || 1)
    }

    const sorted = [...list]
    switch (sortBy) {
      case 'name_desc':
        sorted.sort((a, b) => byName(b, a))
        break
      case 'price_asc':
        // Empate de precio → alfabético, para que el orden sea estable y predecible
        sorted.sort((a, b) => (sortPriceOf(a) - sortPriceOf(b)) || byName(a, b))
        break
      case 'price_desc':
        sorted.sort((a, b) => (sortPriceOf(b) - sortPriceOf(a)) || byName(a, b))
        break
      default:
        sorted.sort(byName)
    }
    return sorted
  }, [publicProducts, searchQuery, selectedCategory, selectedSubcategory, categories, sortBy, business, catalogExchangeRate])

  // Productos destacados
  const featuredProducts = useMemo(() => {
    return filteredProducts.filter(p => p.isFeatured)
  }, [filteredProducts])

  // Paginacion configurable (port shopifree): 'infinite' (sentinel, default
  // = comportamiento historico), 'load-more' (solo boton), 'pages' (numerada)
  // y 'none' (todo de una — ojo con catalogos grandes).
  const paginationMode = ['none', 'load-more', 'infinite', 'pages'].includes(business?.catalogPagination)
    ? business.catalogPagination
    : 'infinite'
  const PAGE_SIZE = 24
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const displayedProducts = useMemo(() => {
    if (paginationMode === 'none') return filteredProducts
    if (paginationMode === 'pages') {
      const start = (currentPage - 1) * PAGE_SIZE
      return filteredProducts.slice(start, start + PAGE_SIZE)
    }
    return filteredProducts.slice(0, visibleCount)
  }, [filteredProducts, visibleCount, paginationMode, currentPage])

  const goToPage = (p) => {
    const clamped = Math.min(Math.max(1, p), totalPages)
    setCurrentPage(clamped)
    // Subir al comienzo de los productos, descontando el header y la barra de
    // categorias (ambos sticky): si no, la primera fila queda tapada.
    const nodo = productsTopRef.current
    if (!nodo) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const header = document.querySelector('header')
    const barraCategorias = document.querySelector('[data-catalog-categories]')
    const offset = (header?.offsetHeight || 0) + (barraCategorias?.offsetHeight || 0) + 8
    const top = nodo.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }

  useEffect(() => {
    setVisibleCount(40)
    setCurrentPage(1)
  }, [searchQuery, selectedCategory, selectedSubcategory, viewMode])

  useEffect(() => {
    if (paginationMode !== 'infinite') return
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
  }, [visibleCount, filteredProducts.length, viewMode, paginationMode])

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

  // 'sections' (diseño estilo carta de restaurante) agrupa por categoría. El
  // flag viejo catalogGroupByCategory se sigue respetando: 40 tiendas lo
  // tenían activo antes de que esto fuera un diseño más del selector.
  // Agrupar por categoria solo tiene sentido si HAY categorias con productos.
  // Sin esta guarda, un negocio sin categorias que elegia un diseno agrupado
  // veia su tienda VACIA: las secciones no pintaban (no hay categorias) y la
  // lista completa quedaba oculta por onlyCarousels. Le paso a COCISEL, que
  // tiene 13 productos y ninguna categoria (24-ago-2026).
  const hayCategoriasConProductos = rootCategories.length > 0 && rootCategories.some(raiz => {
    // Cuentan los productos de la raiz y los de sus subcategorias, que es lo
    // mismo que agrupa la vista de secciones.
    const idsDeLaRama = [raiz.id, ...categories.filter(c => c.parentId === raiz.id).map(c => c.id)]
    return filteredProducts.some(p => idsDeLaRama.includes(p.category))
  })
  const pideAgrupar = business?.catalogLayout === 'sections'
    || business?.catalogLayout === 'sections-grid'
    || business?.catalogGroupByCategory === true
  const groupByCategory = pideAgrupar && hayCategoriasConProductos
  // 'sections-grid': cada categoria muestra TODOS sus productos en grilla,
  // una debajo de otra — sin scroll horizontal y sin la lista repetida al
  // final. 'sections' (con carrusel) sigue existiendo.
  const seccionesEnGrilla = groupByCategory && business?.catalogLayout === 'sections-grid'
  // Solo aplica si también está activo groupByCategory.
  // Oculta el botón "Todos" y la lista flat al final → fuerza a entrar por categoría.
  // Sin lista completa al final: en 'sections-grid' ya se mostraron todos los
  // productos dentro de sus categorias, repetirlos seria duplicar el catalogo.
  // El flag viejo catalogOnlyCarousels se sigue respetando.
  const onlyCarousels = groupByCategory
    && (seccionesEnGrilla || business?.catalogOnlyCarousels === true)
  // Tema del catálogo (registro centralizado en src/themes/catalogThemes.js).
  // Si la URL trae ?previewTheme=, sobrescribe lo guardado (vista previa desde Settings).
  const effectiveTheme = previewThemeFromUrl || business?.catalogTheme
  const themeClasses = getCatalogThemeClasses(effectiveTheme)
  // Motor v2 (A3): tema completo con fuentes y variantes de layout por sección.
  const themeFull = getCatalogTheme(effectiveTheme)
  const themeFonts = themeFull.fonts || {}
  const themeLayout = themeFull.layout || {}
  // Fase 1 del port shopifree: variables CSS del tema en la raiz. Inertes
  // hasta que una pieza las consuma (var(--ct-*)) — hoy no cambian ni un pixel.
  const themeCssVars = buildCatalogCssVars(themeFull, getCatalogAccent(business, effectiveTheme))
  // Chrome del tema (Fase 2): header/hero propios. {} = tema sin chrome →
  // todas las ramas caen al markup clasico original.
  const themeChrome = themeFull.chrome || {}
  // Varias piezas se pintan distinto sobre fondo oscuro (velos, halos).
  const themeEsOscuro = !!themeFull.tokens?.effects?.darkMode
  const themeAccent = getCatalogAccent(business, effectiveTheme)
  // Guardas de contraste (caso real: CAPITAN BLACK con acento #1F2937 casi
  // negro). Si el acento es muy oscuro, el texto pintado con el en un tema
  // oscuro seria invisible → se cae al blanco. Y el icono del carrito
  // cuadrado elige blanco/negro segun la luminancia del acento.
  const accentLuma = (() => {
    const h = (themeAccent || '').replace('#', '')
    if (h.length < 6) return 255
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
    return 0.299 * r + 0.587 * g + 0.114 * b
  })()
  const themeIsDark = !!themeFull.tokens?.effects?.darkMode
  const themeAccentText = themeIsDark && accentLuma < 90 ? '#FFFFFF' : themeAccent
  const accentIconColor = accentLuma < 140 ? '#FFFFFF' : '#0F0F12'
  // Variante de las píldoras de categorías: 'pills' (default) | 'underline' | 'circles'
  // Default 'underline': las pastillas rellenas se veian pesadas con muchas
  // categorias (reporte del 24-ago) — texto plano y subrayado en la activa.
  // 'pills' sigue existiendo como variante por si un tema la pide.
  const categoriesVariant = themeLayout.categories || 'underline'
  // Variante del hero: 'classic' | 'full-bleed' (portada alta con contenido centrado)
  const heroVariant = themeLayout.hero || 'classic'
  // Navegación en ESCRITORIO: 'top' (barra de categorías arriba, clásico) o
  // 'sidebar' (columna fija de categorías a la izquierda + contenido a la
  // derecha, estilo menus.pe / apps de delivery). En móvil siempre es la barra
  // superior: el sidebar es exclusivo de pantallas md+.
  const desktopNav = business?.catalogDesktopNav === 'sidebar' ? 'sidebar' : 'top'
  const sidebarNav = desktopNav === 'sidebar'
  // Grilla efectiva: config del negocio > propuesta del tema > masonry.
  // 'magazine' = cuadrícula uniforme donde la 1ra tarjeta ocupa 2x2 (revista).
  const catalogLayoutRaw = business?.catalogLayout || themeLayout.grid || 'masonry'
  // 'sections' organiza la PÁGINA (por categorías), no la tarjeta: sus grillas
  // internas se pintan como cuadrícula.
  const catalogLayout = (catalogLayoutRaw === 'sections' || catalogLayoutRaw === 'sections-grid')
    ? 'grid' : catalogLayoutRaw

  // Clases/estilo de los botones de categoría según la variante del tema.
  // 'pills': píldora rellena (comportamiento clásico). 'underline': tabs con
  // subrayado del acento (estilo editorial/revista), sin fondo.
  // Como resalta el tema la categoria ACTIVA. Tres formas, elegidas por
  // layout.categories: un filete debajo, una pastilla redonda, o un bloque
  // lleno con el radio del tema (los temas que hablan en bloques de color).
  const catBtnClass = (active) => {
    if (categoriesVariant === 'underline') {
      return `px-3 py-2 text-sm font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors bg-transparent ${
        active ? 'font-semibold' : `border-transparent ${themeClasses.textMuted}`
      }`
    }
    if (categoriesVariant === 'solid') {
      return `px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap flex-shrink-0 ${
        active ? '' : themeClasses.catInactive
      }`
    }
    return `px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
      active ? '' : themeClasses.catInactive
    }`
  }
  const catBtnStyle = (active) => {
    if (categoriesVariant === 'underline') {
      return active
        ? { borderColor: getCatalogAccent(business), color: getCatalogAccent(business) }
        : {}
    }
    if (!active) return {}
    // El texto NO puede ser blanco fijo: sobre el amarillo de Bold o el lima
    // de Urban no se lee. `accentIconColor` ya resuelve esto por luminancia.
    const base = { backgroundColor: getCatalogAccent(business), color: accentIconColor }
    return categoriesVariant === 'solid'
      ? { ...base, borderRadius: 'var(--ct-radius-md, 0.375rem)' }
      : base
  }

  const thBg = themeClasses.bg
  // Fondo del hero cuando el negocio no subio portada (lo define cada tema).
  const thHeroFallbackBg = themeClasses.heroFallbackBg || themeClasses.bg
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
  /**
   * BUSCADOR: lupa o barra a la vista.
   *
   * La barra ancha bajo el hero se cambio por la lupa (bd0b99e4). A varios les
   * gusto, pero hay tiendas donde el cliente busca por nombre casi siempre y la
   * lupa les agrega un clic de por medio. Con esto cada negocio elige.
   *
   * La barra va en la MISMA fila de las categorias, donde estaba la lupa: es el
   * unico sitio comun a todos los disenos de portada, y ademas queda fija
   * arriba al desplazarse, que es cuando mas se necesita.
   */
  const barraDeBusquedaVisible = business?.catalogSearchBar === true

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
        return repreciarCarrito(prev.map(item =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: newQty, unitPrice: updatedPrice, priceLevelLabel: updatedLabel }
            : item
        ))
      }
      // Multi-divisa: si el producto tiene priceUSD definido Y NO se aplicó
      // un nivel de precio (price2/3/4), guardamos fixedPriceUSD para que
      // el carrito/checkout muestre ese precio en sesiones USD sin depender
      // del TC. Si se aplicó un nivel de precio, ese precio (PEN) se convierte.
      const fixedUSD = Number(product.priceUSD)
      const hasFixedUSD = !finalPriceLabel && Number.isFinite(fixedUSD) && fixedUSD > 0
      // Reprecia el carrito ENTERO al sumar una talla nueva: es el caso del
      // cliente que arma la docena juntando tallas de a una. Sin esto, cada
      // línea se quedaba con el precio que tenía cuando entró.
      return repreciarCarrito([...prev, {
        ...product,
        cartItemId,
        quantity,
        selectedModifiers,
        unitPrice: finalUnitPrice,
        originalUnitPrice: unitPrice || product.price,
        priceLevelLabel: finalPriceLabel,
        ...(hasFixedUSD && { fixedPriceUSD: fixedUSD }),
      }])
    })
  }

  /**
   * Reprecia TODO el carrito con el mismo criterio que el mostrador.
   *
   * Antes cada línea se repreciaba sola y con los precios del producto PADRE.
   * En un producto con variantes el padre no tiene price2/3/4 —los precios se
   * cargan en cada talla— así que el carrito público no aplicaba el descuento
   * NUNCA, ni con cantidad de sobra en una sola talla. Y aunque los hubiera
   * tenido, mirar la línea sola tampoco alcanza: doce polos repartidos entre
   * tres tallas son doce polos, y así lo cobra el POS.
   */
  const repreciarCarrito = (items) => {
    if (!business?.multiplePricesEnabled) return items

    // La ficha del producto viaja dentro del propio item (se agregó con
    // ...product), así que no hace falta volver a buscarla en Firestore.
    const fichaPorId = new Map()
    for (const it of items) if (it?.id && !fichaPorId.has(it.id)) fichaPorId.set(it.id, it)

    const repreciado = repreciarPorCantidad(items, {
      productoPorId: (id) => fichaPorId.get(id),
      businessSettings: business,
      // El catálogo nunca exigió el flag por producto: hay tiendas que dan
      // mayorista solo por el mínimo global del negocio.
      exigirFlag: false,
      // Precio anclado en dólares: se fijó a propósito y los niveles están en
      // soles.
      excluir: (it) => !!it.fixedPriceUSD,
    })

    return repreciado.map(({ linea, precio, nivel }) => {
      if (precio == null) return linea
      const base = linea.originalUnitPrice || linea.price
      return {
        ...linea,
        unitPrice: nivel ? precio : base,
        priceLevelLabel: nivel ? (business.priceLabels?.[nivel] || nivel) : null,
      }
    })
  }

  const updateCartQuantity = (cartItemId, quantity) => {
    if (quantity <= 0) {
      // Quitar una talla puede dejar al producto por debajo del mínimo, así que
      // el resto del carrito también se reprecia.
      setCart(prev => repreciarCarrito(prev.filter(item => (item.cartItemId || item.id) !== cartItemId)))
    } else {
      setCart(prev => repreciarCarrito(
        prev.map(item => ((item.cartItemId || item.id) === cartItemId ? { ...item, quantity } : item)),
      ))
    }
  }

  const removeFromCart = (cartItemId) => {
    setCart(prev => repreciarCarrito(prev.filter(item => (item.cartItemId || item.id) !== cartItemId)))
  }

  const getCartQuantity = (productId) => {
    // Sumar cantidad de todos los items de este producto (con diferentes modificadores)
    return cart.filter(i => i.id === productId).reduce((sum, item) => sum + item.quantity, 0)
  }

  // Checkout por WhatsApp. `cupon` llega del CartDrawer si el comprador
  // aplicó uno ({ id, type, value, discount } — discount ya en la moneda del
  // catálogo): se muestra en el mensaje y el total va neto.
  const handleCheckout = (cupon = null) => {
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
      const lineaCupon = cupon
        ? `\n🎟️ *Cupón ${cupon.id}:* − ${formatCurrency(cupon.discount, catalogCurrency)}`
        : ''
      const totalFinal = cupon ? Math.max(0, totalDisplay - cupon.discount) : totalDisplay
      message = encodeURIComponent(
        `¡Hola! Me gustaría hacer un pedido:\n\n${items}${lineaCupon}\n\n*Total: ${formatCurrency(totalFinal, catalogCurrency)}*\n\nGracias!`
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
    // Efectos activables (F2.7): reveal al scroll + swap de imagen en hover
    effects: {
      scrollReveal: business?.catalogEffects?.scrollReveal === true,
      imageSwapOnHover: business?.catalogEffects?.imageSwapOnHover === true,
    },
    th: {
      cardRadius: thCardRadius, cardShadowEffect: thCardShadowEffect, cardShadow: thCardShadow,
      cardFrame: themeClasses.cardFrame || '',
      productName: thProductName, text: thText, textMuted: thTextMuted, price: thPrice,
      catBadge: thCatBadge, listBadge: thListBadge,
    },
    // Motor v2 (A4): variante de tarjeta del tema ('classic' | 'overlay')
    cardVariant: themeLayout.card || 'classic',
  }

  return (
    <CatalogThemeProvider business={business} themeId={effectiveTheme}>
    <div
      className={`min-h-screen ${thBg} ${thFontWrapper}`}
      style={{
        ...themeCssVars,
        ...(themeFonts.body ? { fontFamily: themeFonts.body } : {}),
        // Grano de fotocopia (Zine): ruido SVG en linea, sin pedir ninguna
        // imagen al servidor. Va en la raiz para que cubra toda la tienda.
        ...(themeChrome.pageTexture === 'paper' ? { backgroundImage: TEXTURA_PAPEL } : {}),
      }}
    >
      <style>{fadeInStyle}</style>
      {/* Capas decorativas de los temas oscuros. Puro adorno: si no se montan,
          la tienda funciona igual. */}
      {themeChrome.ambience && (
        <CatalogAmbience variant={themeChrome.ambience} accent={themeAccent} />
      )}
      {/* Fuentes Google del tema (motor v2): solo si el tema las define.
          Los 3 temas clásicos no cargan nada (usan las fuentes del bundle). */}
      {themeFonts.googleFontsUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={themeFonts.googleFontsUrl} />
        </>
      )}
      {/* Fuente de títulos del tema como CSS var (la usan .catalog-heading) */}
      {themeFonts.heading && (
        <style>{`.catalog-heading { font-family: ${themeFonts.heading}; }`}</style>
      )}
      {/* Tira publicitaria (F2.1) + oferta con countdown (F2.5) — activables */}
      <AnnouncementBar config={business?.catalogAnnouncement} />
      <FlashSaleBar config={business?.catalogFlashSale} />
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

      {/* Franja numerada (Bauhaus): la referencia tipografica que encabeza la
          composicion. Solo la piden los temas que la declaran. */}
      {themeChrome.topStrip && (
        <div className={`border-b-2 ${thBorderColor}`}>
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-1.5 flex items-center justify-between text-[10px] tracking-widest uppercase font-bold">
            <span className={thText}>01 / {String(filteredProducts.length || products.length || 1).padStart(2, '0')}</span>
            <span className={`hidden md:inline ${thTextMuted}`}>{themeChrome.topStripText || ''}</span>
            <span className={thText}>{new Date().getFullYear()}</span>
          </div>
        </div>
      )}

      {/* Header — chrome por tema (Fase 2): sombra que aparece al scrollear
          (o filete del acento en bold), nombre con la voz tipografica del
          tema y carrito en la forma que el tema pide. */}
      <header
        className={`${thHeaderBg} sticky ${isRestaurantMenu && tableFromUrl ? 'top-[41px]' : 'top-0'} z-40 transition-shadow duration-300 ${headerScrolled ? 'shadow-md' : 'shadow-sm'}`}
        style={themeChrome.headerScrollFx === 'accent-border' ? { borderBottom: `2px solid ${headerScrolled ? themeAccent : 'transparent'}` } : undefined}
      >
        {/* Con menú lateral el header usa el MISMO contenedor que el layout de
            dos columnas, para que el logo quede alineado con la columna de
            categorías (como en menus.pe) y no flotando al centro. */}
        <div className={sidebarNav ? 'max-w-[1360px] mx-auto px-4 md:px-8' : 'max-w-7xl mx-auto px-4'}>
          <div className="flex items-center justify-between gap-2 md:gap-3 h-16 md:h-20">
            {/* Logo y nombre — landscape tiene prioridad y oculta el nombre */}
            {(() => {
              const headerLogoSrc = business?.catalogLogoLandscape || business?.catalogLogoUrl || business?.logoUrl
              const headerIsLandscape = !!business?.catalogLogoLandscape || isLogoHorizontal
              const headerLogoSize = headerIsLandscape ? 'logo_landscape' : 'logo_square'
              return (
            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
              {/* Hamburguesa (solo móvil): abre el menú del catálogo — cuenta,
                  categorías e info del negocio. Es el equivalente móvil del
                  menú lateral de escritorio. */}
              <button
                onClick={() => { setDrawerExpandedCategory(selectedCategory); setCategoryDrawerOpen(true) }}
                className={`md:hidden p-2 -ml-2 rounded-lg flex-shrink-0 ${thViewHover}`}
                aria-label="Abrir menú"
              >
                <Menu className="w-5 h-5" />
              </button>
              {headerLogoSrc ? (
                <img
                  src={optimizeImageUrl(headerLogoSrc, headerLogoSize)}
                  alt={business.name}
                  /* Logo CUADRADO (port shopifree): caja cuadrada forzada +
                     recorte con el radio del tema, para que el redondeo sea
                     parejo aunque la imagen no sea exactamente 1:1. El logo
                     horizontal se deja tal cual: recortarlo lo mutilaria. */
                  className={`${headerIsLandscape ? 'h-9 md:h-12 max-w-[200px] md:max-w-[300px] w-auto' : 'h-10 w-10 md:h-14 md:w-14 overflow-hidden'} object-contain flex-shrink-0`}
                  style={headerIsLandscape ? undefined : { borderRadius: themeChrome.headerLogoRound ? '9999px' : 'var(--ct-radius-lg, 0.75rem)' }}
                  onLoad={(e) => {
                    if (!business?.catalogLogoLandscape) {
                      const { naturalWidth, naturalHeight } = e.target
                      setIsLogoHorizontal(naturalWidth / naturalHeight > 1.8)
                    }
                  }}
                />
              ) : (
                <div
                  className="w-10 h-10 md:w-14 md:h-14 flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: themeAccent, borderRadius: themeChrome.headerLogoRound ? '9999px' : 'var(--ct-radius-lg, 0.75rem)' }}
                >
                  {isRestaurantMenu ? (
                    <UtensilsCrossed className="w-5 h-5 md:w-7 md:h-7 text-white" />
                  ) : (
                    <Store className="w-5 h-5 md:w-7 md:h-7 text-white" />
                  )}
                </div>
              )}
              {/* Si el logo es horizontal (incluye el nombre), ocultar texto */}
              {!headerIsLandscape && (
              <div className="min-w-0">
                <h1
                  className={`${themeChrome.headerName || 'font-bold'} text-lg md:text-2xl truncate ${themeChrome.headerNameSpectrum ? 'catalog-spectrum-text' : (themeChrome.headerNameStamp || themeChrome.headerNameGlow) ? '' : thText}`}
                  style={themeChrome.headerNameGlow
                    // Halo detras del nombre: en fondo oscuro es lo que le da
                    // cuerpo a una serif fina.
                    ? { color: themeAccentText, textShadow: `0 0 40px ${themeAccent}66, 0 0 80px ${themeAccent}33` }
                    : themeChrome.headerNameStamp
                    // Recortado y pegado (Zine): tinta llena, ladeado un grado.
                    ? {
                      backgroundColor: 'var(--ct-text, #0A0A0A)',
                      color: 'var(--ct-text-inverted, #EFEDE6)',
                      padding: '2px 8px',
                      transform: 'rotate(-1deg)',
                      display: 'inline-block',
                    }
                    : (themeChrome.headerNameAccent ? { color: themeAccentText } : undefined)}
                >
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

            {/* CUENTA DEL COMPRADOR (escritorio). En movil no va: la
                hamburguesa ya la tiene, y dos accesos a lo mismo en una barra
                de 360px es ruido. */}
            {customerAccountsOn && (
              catalogUser ? (
                <button
                  onClick={() => { setAccountTab('orders'); setAccountOpen(true) }}
                  className="hidden md:flex flex-shrink-0 items-center justify-center transition-transform hover:scale-105"
                  title={catalogProfile?.name || catalogUser.displayName || 'Mi cuenta'}
                  aria-label="Mi cuenta"
                >
                  {catalogUser.photoURL ? (
                    <img
                      src={catalogUser.photoURL}
                      alt=""
                      className="w-10 h-10 object-cover"
                      style={{ borderRadius: 'var(--ct-radius-full, 9999px)' }}
                    />
                  ) : (
                    <span
                      className="w-10 h-10 flex items-center justify-center text-sm font-bold"
                      style={{
                        backgroundColor: themeAccent,
                        color: accentIconColor,
                        borderRadius: 'var(--ct-radius-full, 9999px)',
                      }}
                    >
                      {(catalogProfile?.name || catalogUser.displayName || catalogUser.email || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className={`hidden md:flex flex-shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${thTextMuted} ${thViewHover}`}
                  style={{ borderRadius: 'var(--ct-radius-md, 0.5rem)' }}
                >
                  <User className="w-[18px] h-[18px]" />
                  <span className="hidden lg:inline">Iniciar sesión</span>
                </button>
              )
            )}

            {/* Carrito — la forma la decide el chrome del tema. Todas las
                variantes disparan el mismo setCartOpen; solo cambia la piel. */}
            {themeChrome.headerCart === 'glow' ? (
              /* Se enciende al tener algo dentro: en fondo oscuro el halo dice
                 "hay productos" mejor que un numerito. */
              <button
                onClick={() => setCartOpen(true)}
                className="relative flex items-center gap-2 px-3 md:px-4 py-2 font-medium flex-shrink-0 transition-all hover:scale-105"
                style={{
                  borderRadius: 'var(--ct-radius-md, 0.625rem)',
                  background: cartItemsCount > 0
                    ? `linear-gradient(135deg, ${themeAccent}, ${themeAccent}AA)`
                    : 'var(--ct-surface, rgba(255,255,255,.06))',
                  color: cartItemsCount > 0 ? accentIconColor : 'var(--ct-text, #fff)',
                  border: cartItemsCount > 0 ? 'none' : '1px solid var(--ct-border, rgba(255,255,255,.12))',
                  boxShadow: cartItemsCount > 0 ? `0 0 25px ${themeAccent}80, 0 0 50px ${themeAccent}40` : 'none',
                }}
                aria-label={isRestaurantMenu ? 'Ver pedido' : 'Ver carrito'}
              >
                <ShoppingBag className="w-5 h-5" />
                {cartItemsCount > 0 && <span className="text-sm font-semibold">{cartItemsCount}</span>}
              </button>
            ) : themeChrome.headerCart === 'zine' ? (
              /* Recuadro rojo con sombra dura; se ladea al pasar el mouse. */
              <button
                onClick={() => setCartOpen(true)}
                className="px-3 md:px-4 py-2 uppercase text-xs md:text-sm font-bold flex-shrink-0 transition-transform hover:rotate-1"
                style={{
                  backgroundColor: themeAccent,
                  color: accentIconColor,
                  border: '2px solid var(--ct-text, #0A0A0A)',
                  boxShadow: '3px 3px 0 0 var(--ct-text, #0A0A0A)',
                  letterSpacing: '0.1em',
                }}
                aria-label={isRestaurantMenu ? 'Ver pedido' : 'Ver carrito'}
              >
                {isRestaurantMenu ? 'Pedido' : 'Bolsa'} [{cartItemsCount}]
              </button>
            ) : themeChrome.headerCart === 'brutal' ? (
              /* Borde grueso + sombra dura; se pinta del acento en cuanto hay
                 algo dentro, como el original de shopifree. */
              <button
                onClick={() => setCartOpen(true)}
                className="px-3 py-2 text-sm uppercase tracking-wider font-bold border-[3px] border-black flex-shrink-0 transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
                style={{
                  backgroundColor: cartItemsCount > 0 ? themeAccent : '#FFFFFF',
                  color: cartItemsCount > 0 ? accentIconColor : '#000000',
                  boxShadow: '3px 3px 0 #000000',
                }}
                aria-label={isRestaurantMenu ? 'Ver pedido' : 'Ver carrito'}
              >
                {isRestaurantMenu ? 'Pedido' : 'Bolsa'} ({cartItemsCount})
              </button>
            ) : themeChrome.headerCart === 'outline' ? (
              <button
                onClick={() => setCartOpen(true)}
                className={`px-3 py-2 text-sm uppercase tracking-wider font-bold border-2 transition-colors flex-shrink-0 ${thBorderColor} ${thText} hover:bg-[#0E0E0E] hover:text-white`}
                aria-label={isRestaurantMenu ? 'Ver pedido' : 'Ver carrito'}
              >
                {isRestaurantMenu ? 'Pedido' : 'Bolsa'} ({cartItemsCount})
              </button>
            ) : themeChrome.headerCart === 'square' ? (
              <button
                onClick={() => setCartOpen(true)}
                className="relative w-12 h-12 md:w-14 md:h-14 flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105"
                style={{ backgroundColor: themeAccent }}
                aria-label={isRestaurantMenu ? 'Ver pedido' : 'Ver carrito'}
              >
                <ShoppingBag className="w-5 h-5 md:w-6 md:h-6" style={{ color: accentIconColor }} />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-white text-black text-xs font-black flex items-center justify-center">
                    {cartItemsCount}
                  </span>
                )}
              </button>
            ) : themeChrome.headerCart === 'bubble' ? (
              <button
                onClick={() => setCartOpen(true)}
                className="relative w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105"
                style={{ backgroundColor: 'var(--ct-surface-hover, #FCE7F0)' }}
                aria-label={isRestaurantMenu ? 'Ver pedido' : 'Ver carrito'}
              >
                <ShoppingBag className="w-5 h-5" style={{ color: themeAccent }} />
                {cartItemsCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-5 h-5 text-white text-[11px] font-bold rounded-full flex items-center justify-center"
                    style={{ backgroundColor: themeAccent }}
                  >
                    {cartItemsCount}
                  </span>
                )}
              </button>
            ) : themeChrome.headerCart === 'ghost' ? (
              <button
                onClick={() => setCartOpen(true)}
                className={`relative w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${thViewHover}`}
                aria-label={isRestaurantMenu ? 'Ver pedido' : 'Ver carrito'}
              >
                <ShoppingBag className={`w-[22px] h-[22px] ${thText}`} />
                {cartItemsCount > 0 && (
                  <span
                    className="absolute top-0 right-0 w-5 h-5 text-[11px] font-semibold rounded-full flex items-center justify-center"
                    style={{ backgroundColor: thCartBadgeBg, color: thCartBadgeColor }}
                  >
                    {cartItemsCount}
                  </span>
                )}
              </button>
            ) : (
              /* pastilla clasica: fallback para un tema sin chrome */
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
            )}
          </div>
        </div>
      </header>

      {/* Layout de dos columnas en escritorio (catalogDesktopNav='sidebar'):
          columna fija de categorías a la izquierda + hero/productos a la derecha.
          En móvil el wrapper es transparente (display:contents) para no alterar
          nada del flujo actual. */}
      <div className={sidebarNav ? 'contents md:max-w-[1360px] md:mx-auto md:px-8 md:flex md:gap-8 lg:gap-10 md:items-start' : 'contents'}>
        {sidebarNav && (
          <aside className="hidden md:block w-60 flex-shrink-0 sticky top-24 self-start max-h-[calc(100vh-7rem)] overflow-y-auto catalog-scrollbar py-6 pr-1">
            {/* Columna de CUENTA (las categorías viven arriba como pastillas,
                igual que menus.pe: el sidebar navega, las pastillas filtran). */}
            {!customerAccountsOn ? null : catalogUser ? (
              <>
                <div className="flex items-center gap-2.5 px-3 mb-4">
                  {catalogUser.photoURL ? (
                    <img src={catalogUser.photoURL} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <span
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: getCatalogAccent(business) }}
                    >
                      {(catalogProfile?.name || catalogUser.displayName || catalogUser.email || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${thText}`}>
                      {catalogProfile?.name || catalogUser.displayName || 'Mi cuenta'}
                    </p>
                    <p className={`text-[11px] truncate ${thTextFaint}`}>{catalogUser.email}</p>
                  </div>
                </div>

                <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] mb-2 px-3 ${thTextFaint}`}>Mi cuenta</p>
                <nav className="space-y-1">
                  {[
                    { id: 'orders', label: 'Mis pedidos', icon: Package },
                    { id: 'addresses', label: 'Mis direcciones', icon: MapPin },
                    { id: 'data', label: 'Mis datos', icon: User },
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setAccountTab(item.id); setAccountOpen(true) }}
                      className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${thTextMuted} ${thViewHover}`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {item.label}
                    </button>
                  ))}
                  <button
                    onClick={catalogLogout}
                    className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${thTextMuted} ${thViewHover}`}
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    Cerrar sesión
                  </button>
                </nav>
              </>
            ) : (
              <div className="px-3">
                <p className={`text-sm font-semibold mb-1 ${thText}`}>Tu cuenta</p>
                <p className={`text-xs mb-3 ${thTextFaint}`}>
                  Guarda tus pedidos y direcciones. Puedes seguir comprando sin registrarte.
                </p>
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: getCatalogAccent(business) }}
                >
                  <User className="w-4 h-4" />
                  Iniciar sesión
                </button>
              </div>
            )}

            {/* Info del negocio al pie de la columna (en modo sidebar el footer
                ancho se oculta: hacía "saltar" el scroll al llegar abajo). */}
            <div className={`mt-5 pt-5 border-t ${thBorderColor} space-y-4`}>
              {business?.address && (
                <p className={`text-xs flex items-start gap-1.5 px-3 ${thTextMuted}`}>
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{business.address}</span>
                </p>
              )}

              {/* Horario: solo el estado de hoy; el detalle completo se
                  mantiene en el footer móvil. */}
              {business?.businessHours?.enabled && (() => {
                const status = isBusinessOpen(business.businessHours)
                const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })).getDay()
                const config = business.businessHours.days?.[today]
                return (
                  <div className="px-3">
                    <div className="flex items-center gap-2">
                      <Clock className={`w-3.5 h-3.5 ${thTextMuted}`} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {status.open ? 'Abierto' : 'Cerrado'}
                      </span>
                    </div>
                    {config?.open && (
                      <p className={`text-xs mt-1.5 ${thTextFaint}`}>Hoy {config.from} - {config.to}</p>
                    )}
                  </div>
                )
              })()}

              <div className="px-3 space-y-2">
                {(business?.catalogWhatsapp || business?.whatsapp || business?.phone) && (
                  <a
                    href={`https://wa.me/${(business.catalogWhatsapp || business.whatsapp || business.phone).replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 text-white rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                    style={{ backgroundColor: getCatalogAccent(business) }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </a>
                )}
                {business?.phone && (
                  <a
                    href={`tel:${business.phone}`}
                    className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${thBorderColor} ${thTextMuted} ${thViewHover}`}
                  >
                    <Phone className="w-4 h-4" />
                    Llamar
                  </a>
                )}
              </div>

              <p className={`text-[11px] px-3 pt-1 ${thFooterPowered}`}>
                Powered by <a href="https://cobrifyperu.com" className={`hover:underline ${thFooterLink}`}>Cobrify</a>
              </p>
            </div>
          </aside>
        )}
        {/* Columna de contenido (en modo clásico no envuelve nada: display:contents) */}
        <div className={sidebarNav ? 'contents md:block md:flex-1 md:min-w-0' : 'contents'}>

      {/* Hero / Búsqueda — carrusel (F2.2) si está activado, banner cuando hay
          portada única, clásico (gradient) si no hay nada */}
      {themeChrome.heroCover === 'collage' ? (
        /* Collage de fanzine (Zine): reemplaza a portada y carrusel — la foto
           va DENTRO del collage, recortada y pegada, no como banner. */
        <>
          <HeroZine
            business={business}
            accent={themeAccent}
            tinta={themeFull.tokens?.colors?.text || '#0A0A0A'}
            papel={themeFull.tokens?.colors?.textInverted || '#EFEDE6'}
          />
          {themeChrome.sectionRule === 'zine' && (
            <div className="max-w-7xl mx-auto px-4 md:px-6 pt-2 pb-4 flex items-center gap-3">
              <span
                className="catalog-heading px-3 py-1 uppercase text-sm md:text-base font-bold inline-block"
                style={{
                  backgroundColor: 'var(--ct-text, #0A0A0A)',
                  color: 'var(--ct-text-inverted, #EFEDE6)',
                  transform: 'rotate(-1deg)',
                }}
              >
                {'// '}{isRestaurantMenu ? 'La carta' : 'El botín'}
              </span>
              <span className={`text-[11px] truncate ${thTextMuted}`}>
                ░░░░░░░░ {filteredProducts.length} ░░░░░░░░
              </span>
            </div>
          )}
        </>
      ) : themeChrome.heroCover === 'mondrian' ? (
        /* Composicion geometrica (Bauhaus): reemplaza a portada y carrusel —
           la foto vive DENTRO de la composicion, no encima de ella. */
        <>
          <HeroMondrian business={business} palette={themeFull.palette} accent={themeAccent} />
          {/* Cabecera de seccion con linea y contador */}
          {themeChrome.sectionRule && (
            <div className="max-w-7xl mx-auto px-4 md:px-6 pt-2 pb-4 flex items-center gap-4">
              <h3 className={`catalog-heading text-xl md:text-3xl uppercase tracking-tight font-extrabold ${thText}`}>
                {isRestaurantMenu ? 'Carta' : 'Catálogo'}
                <span className="ml-2 inline-block w-3 h-3 rounded-full align-middle" style={{ backgroundColor: themeAccent }} />
              </h3>
              <div className={`h-1 flex-1 ${thText.replace('text-', 'bg-')}`} />
              <span className={`text-xs uppercase tracking-widest font-bold ${thText}`}>{filteredProducts.length}</span>
            </div>
          )}
        </>
      ) : business?.catalogHero?.enabled && (business?.catalogHero?.slides || []).filter(s => s.imageUrl).length > 0 ? (
        /* === CARRUSEL HERO: slides promocionales con autoplay. Es una
            portada con mas fotos, asi que recibe el MISMO trato que la
            portada del tema: en 'card' (Estandar) va dentro de la tarjeta
            redondeada con margenes; en los demas temas, a pantalla completa
            como su portada. === */
        themeChrome.heroCover === 'card' ? (
          <div className={sidebarNav ? 'relative md:pt-6' : 'relative'}>
            <div className={sidebarNav ? '' : 'max-w-7xl mx-auto px-4 pt-4'}>
              <div className="overflow-hidden rounded-2xl md:rounded-3xl shadow-sm">
                <HeroCarousel slides={business.catalogHero.slides.filter(s => s.imageUrl)} />
              </div>
              {business?.catalogWelcome && (
                <p className={`pt-3 text-sm md:text-base ${thTextMuted}`}>{business.catalogWelcome}</p>
              )}
            </div>
          </div>
        ) : (
        <div className={sidebarNav ? 'relative md:pt-6' : 'relative overflow-hidden'}>
          <div className={sidebarNav ? 'md:rounded-2xl md:overflow-hidden md:shadow-sm' : ''}>
            <HeroCarousel slides={business.catalogHero.slides.filter(s => s.imageUrl)} />
          </div>
        </div>
        )
      ) : business?.catalogCoverImage ? (
        themeChrome.heroCover === 'card' && heroVariant !== 'full-bleed' ? (
          /* === PORTADA EN TARJETA (tema claro, estilo minimal): imagen limpia
              con esquinas redondeadas y SIN texto encima — el nombre ya vive
              en el header. La bienvenida va debajo, alineada a la izquierda. === */
          <div className={sidebarNav ? 'relative md:pt-6' : 'relative'}>
            <div className={sidebarNav ? '' : 'max-w-7xl mx-auto px-4 pt-4'}>
              <div className="relative h-44 md:h-72 overflow-hidden rounded-2xl md:rounded-3xl shadow-sm">
                <picture>
                  <source
                    media="(max-width: 767px)"
                    srcSet={optimizeImageUrl(business.catalogCoverImageMobile || business.catalogCoverImage, 'cover_mobile')}
                  />
                  <img
                    src={optimizeImageUrl(business.catalogCoverImage, 'cover_desktop')}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    // eslint-disable-next-line react/no-unknown-property -- minuscula a proposito (React 18 la pasa tal cual al DOM)
                    fetchpriority="high"
                    decoding="async"
                  />
                </picture>
              </div>
              {business?.catalogWelcome && (
                <p className={`pt-3 text-sm md:text-base ${thTextMuted}`}>{business.catalogWelcome}</p>
              )}
            </div>
          </div>
        ) : themeChrome.heroCover === 'overlay' && heroVariant !== 'full-bleed' ? (
          /* === PORTADA CON VELO (boutique): degradado oscuro suave y nombre
              serif abajo a la izquierda, sin chip de logo. === */
          <div className={sidebarNav ? 'relative md:pt-6' : 'relative overflow-hidden'}>
            <div className={`relative h-48 md:h-72 ${sidebarNav ? 'overflow-hidden md:rounded-2xl md:shadow-sm' : ''}`}>
              <picture>
                  <source
                    media="(max-width: 767px)"
                    srcSet={optimizeImageUrl(business.catalogCoverImageMobile || business.catalogCoverImage, 'cover_mobile')}
                  />
                  <img
                    src={optimizeImageUrl(business.catalogCoverImage, 'cover_desktop')}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    // eslint-disable-next-line react/no-unknown-property -- minuscula a proposito (React 18 la pasa tal cual al DOM)
                    fetchpriority="high"
                    decoding="async"
                  />
                </picture>
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-0 left-0 right-0 p-5 md:p-8">
                <div className={sidebarNav ? '' : 'max-w-7xl mx-auto'}>
                  <h2 className="font-serif text-white text-3xl md:text-5xl drop-shadow-lg">
                    {business?.name || business?.businessName}
                  </h2>
                  {(business?.catalogWelcome || business?.catalogTagline) && (
                    <p className="text-white/90 text-sm md:text-lg font-light mt-1.5 truncate drop-shadow">
                      {business?.catalogWelcome || business?.catalogTagline}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : themeChrome.heroCover === 'fade' && heroVariant !== 'full-bleed' ? (
          /* === PORTADA FUNDIDA (temas oscuros): la foto se apaga hacia abajo
              hasta el color del fondo, sin borde ni recuadro. El nombre no va
              encima: ya esta en el header y aca competiria con la imagen. === */
          <div className={sidebarNav ? 'relative md:pt-6' : 'relative'}>
            <div className={`relative h-52 md:h-80 overflow-hidden ${sidebarNav ? 'md:rounded-2xl' : ''}`}>
              <picture>
                <source
                  media="(max-width: 767px)"
                  srcSet={optimizeImageUrl(business.catalogCoverImageMobile || business.catalogCoverImage, 'cover_mobile')}
                />
                <img
                  src={optimizeImageUrl(business.catalogCoverImage, 'cover_desktop')}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ filter: themeChrome.heroCoverFilter || 'brightness(0.75)' }}
                  // eslint-disable-next-line react/no-unknown-property -- minuscula a proposito (React 18 la pasa tal cual al DOM)
                  fetchpriority="high"
                  decoding="async"
                />
              </picture>
              <div
                className="absolute inset-0 pointer-events-none"
                // El velo baja hasta el color del fondo. No se le puede pegar
                // alfa a una var() de CSS, asi que abajo cierra con el fondo
                // del tema. Arriba solo oscurece en temas OSCUROS: sobre papel
                // crema ese negro le ensucia la foto al negocio.
                style={{
                  background: `linear-gradient(180deg, ${themeEsOscuro ? 'rgba(0,0,0,.5)' : 'transparent'} 0%, transparent 35%, transparent 55%, var(--ct-bg) 100%)`,
                }}
              />
            </div>
            {business?.catalogWelcome && (
              <div className={`px-4 pt-3 ${sidebarNav ? 'md:px-0' : 'max-w-7xl mx-auto'}`}>
                <p className={`text-sm ${thTextMuted}`}>{business.catalogWelcome}</p>
              </div>
            )}
          </div>
        ) : themeChrome.heroCover === 'raw' && heroVariant !== 'full-bleed' ? (
          /* === PORTADA CRUDA (brutalist): la foto tal cual, con el contraste
              subido y un filete grueso abajo. Sin degradado ni texto encima:
              el nombre ya vive en el header y taparlo seria "decorar". === */
          <div className={sidebarNav ? 'relative md:pt-6' : 'relative'}>
            <div className={`relative h-44 md:h-72 overflow-hidden border-b-[3px] border-black ${sidebarNav ? 'md:border-[3px]' : ''}`}>
              <picture>
                <source
                  media="(max-width: 767px)"
                  srcSet={optimizeImageUrl(business.catalogCoverImageMobile || business.catalogCoverImage, 'cover_mobile')}
                />
                <img
                  src={optimizeImageUrl(business.catalogCoverImage, 'cover_desktop')}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ filter: 'contrast(110%)' }}
                  // eslint-disable-next-line react/no-unknown-property -- minuscula a proposito (React 18 la pasa tal cual al DOM)
                  fetchpriority="high"
                  decoding="async"
                />
              </picture>
            </div>
            {business?.catalogWelcome && (
              <div className={`px-4 pt-3 ${sidebarNav ? 'md:px-0' : 'max-w-7xl mx-auto'}`}>
                <p className={`text-xs md:text-sm uppercase tracking-widest ${thTextMuted}`}>
                  {'// '}{business.catalogWelcome}
                </p>
              </div>
            )}
          </div>
        ) : themeChrome.heroCover === 'impact' && heroVariant !== 'full-bleed' ? (
          /* === PORTADA DE IMPACTO (bold): degradado 135° del acento al negro
              y nombre display gigante en mayusculas. === */
          <div className={sidebarNav ? 'relative md:pt-6' : 'relative overflow-hidden'}>
            <div className={`relative h-48 md:h-80 ${sidebarNav ? 'overflow-hidden md:rounded-2xl md:shadow-sm' : ''}`}>
              <picture>
                  <source
                    media="(max-width: 767px)"
                    srcSet={optimizeImageUrl(business.catalogCoverImageMobile || business.catalogCoverImage, 'cover_mobile')}
                  />
                  <img
                    src={optimizeImageUrl(business.catalogCoverImage, 'cover_desktop')}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    // eslint-disable-next-line react/no-unknown-property -- minuscula a proposito (React 18 la pasa tal cual al DOM)
                    fetchpriority="high"
                    decoding="async"
                  />
                </picture>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `linear-gradient(135deg, ${themeAccent}B3 0%, transparent 45%, rgba(0,0,0,0.9) 100%)` }}
              />
              <div className="absolute bottom-0 left-0 right-0 p-5 md:p-8">
                <div className={sidebarNav ? '' : 'max-w-7xl mx-auto'}>
                  <h2 className="text-white font-black uppercase tracking-tighter leading-none text-3xl md:text-6xl drop-shadow-lg">
                    {business?.name || business?.businessName}
                  </h2>
                  {(business?.catalogWelcome || business?.catalogTagline) && (
                    <p className="text-white/80 uppercase tracking-wide font-medium text-xs md:text-base mt-2 truncate">
                      {business?.catalogWelcome || business?.catalogTagline}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
        /* === ESTILO BANNER: imagen hero. Variante 'full-bleed' (motor v2):
            más alta, overlay más oscuro y contenido CENTRADO (restaurantes). === */
        <div className={sidebarNav ? 'relative md:pt-6' : 'relative overflow-hidden'}>
          <div className={`relative ${heroVariant === 'full-bleed' ? 'h-72 md:h-[26rem]' : 'h-48 md:h-72'} ${sidebarNav ? 'overflow-hidden md:rounded-2xl md:shadow-sm' : ''}`}>
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
            <div className={`absolute inset-0 ${heroVariant === 'full-bleed'
              ? 'bg-gradient-to-t from-black/80 via-black/45 to-black/30'
              : 'bg-gradient-to-t from-black/70 via-black/20 to-transparent'}`} />
            {heroVariant === 'full-bleed' && (
              /* Contenido centrado sobre la portada */
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                {(() => {
                  const heroLogo = business?.catalogLogoLandscape || business?.catalogLogoUrl || business?.logoUrl
                  if (!heroLogo) return null
                  return (
                    <img
                      src={optimizeImageUrl(heroLogo, business?.catalogLogoLandscape ? 'logo_landscape' : 'logo_square')}
                      alt={business?.name}
                      className="h-14 md:h-20 w-auto object-contain mb-4 drop-shadow-xl"
                    />
                  )
                })()}
                <h2 className="catalog-heading text-white font-bold text-3xl md:text-5xl drop-shadow-lg">
                  {business?.name || business?.businessName}
                </h2>
                {(business?.catalogWelcome || business?.catalogTagline) && (
                  <p className="text-white/85 text-sm md:text-base mt-3 max-w-xl drop-shadow">
                    {business?.catalogWelcome || business?.catalogTagline}
                  </p>
                )}
              </div>
            )}
            {/* Info sobre el banner (variante clásica) */}
            <div className={`absolute bottom-0 left-0 right-0 p-4 md:p-6 max-w-7xl mx-auto ${heroVariant === 'full-bleed' ? 'hidden' : ''}`}>
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
          {/* Barra de búsqueda debajo del banner. Se oculta si el negocio activó
              la barra fija: esa vive en la fila de categorías y son la misma. */}
          <div className={`${themeClasses.bg} px-4 py-3 ${sidebarNav ? 'md:px-0 md:pt-5' : ''} ${barraDeBusquedaVisible ? 'hidden' : ''}`}>
            <div className={`relative ${sidebarNav ? '' : 'max-w-7xl mx-auto'}`}>
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
        )
      ) : themeChrome.heroEmpty === 'clean' ? (
        /* === SIN PORTADA, tema claro: hero tipografico limpio. El gradiente
            generico de color se va — era lo que se veia "de plantilla". === */
        <div className={sidebarNav ? 'md:mt-6' : ''}>
          <div className="max-w-7xl mx-auto px-4 pt-10 pb-4 md:pt-16 md:pb-8 text-center">
            <h2 className={`font-light tracking-tight text-3xl md:text-5xl ${thText}`}>
              {business?.name || business?.businessName}
            </h2>
            {(business?.catalogWelcome || business?.catalogTagline) && (
              <p className={`mt-3 text-base md:text-lg max-w-2xl mx-auto ${thTextMuted}`}>
                {business?.catalogWelcome || business?.catalogTagline}
              </p>
            )}
          </div>
        </div>
      ) : themeChrome.heroEmpty === 'romantic' ? (
        /* === SIN PORTADA, boutique: pastilla con corazon, nombre serif y
            lema en italica entre comillas. === */
        <div className={sidebarNav ? 'md:mt-6' : ''}>
          <div className="pt-10 pb-4 md:pt-16 md:pb-8 text-center" style={{ background: 'linear-gradient(to bottom, var(--ct-surface, #fff), var(--ct-bg, #FFF7F8))' }}>
            <div className="max-w-3xl mx-auto px-6">
              <div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-5"
                style={{ backgroundColor: 'var(--ct-surface-hover, #FCE7F0)', color: themeAccent }}
              >
                <Heart className="w-4 h-4" fill="currentColor" />
                {business?.catalogWelcome || 'Bienvenidos'}
              </div>
              <h2 className={`font-serif text-4xl md:text-6xl ${thText}`}>
                {business?.name || business?.businessName}
              </h2>
              {business?.catalogTagline && (
                <p className={`mt-4 text-lg md:text-xl font-light italic ${thTextMuted}`}>
                  "{business.catalogTagline}"
                </p>
              )}
            </div>
          </div>
        </div>
      ) : themeChrome.heroEmpty === 'editorial' ? (
        /* === SIN PORTADA, Libreria: portada de catalogo impreso — sello con
            el lema, nombre en serif de imprenta y un filete de tinta. === */
        <div className={`${sidebarNav ? 'md:mt-6' : ''} ${thHeroFallbackBg}`}>
          <div className="max-w-4xl mx-auto px-6 py-12 md:py-20 text-center">
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 text-xs md:text-sm font-medium mb-6"
              style={{ backgroundColor: themeAccent, color: accentIconColor }}
            >
              <BookOpen className="w-4 h-4" />
              Lee, sueña, descubre
            </span>
            <h2 className={`catalog-heading text-3xl md:text-5xl font-bold break-words ${thText}`}>
              {business?.name || business?.businessName}
            </h2>
            {(business?.catalogWelcome || business?.catalogTagline) && (
              <p className="catalog-heading mt-3 text-lg md:text-xl italic" style={{ color: 'var(--ct-badge, #8B2232)' }}>
                {business?.catalogWelcome || business?.catalogTagline}
              </p>
            )}
            <span className="block w-24 h-px mx-auto mt-7" style={{ backgroundColor: themeAccent }} />
          </div>
        </div>
      ) : themeChrome.heroEmpty === 'opulent' ? (
        /* === SIN PORTADA, Velvet: el nombre en serif itálica entre dos
            filetes con un punto de luz. La opulencia es el ESPACIO. === */
        <div className={`relative overflow-hidden ${sidebarNav ? 'md:mt-6 md:rounded-2xl' : ''}`}>
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[340px] pointer-events-none catalog-glow-pulse"
            style={{ background: `radial-gradient(ellipse, ${themeAccent}33 0%, transparent 70%)` }}
          />
          <div className="relative max-w-4xl mx-auto px-6 py-16 md:py-24 text-center">
            <div className="flex items-center justify-center gap-4 mb-7">
              <span className="h-px w-14 md:w-20" style={{ background: `linear-gradient(90deg, transparent, ${themeAccent}66)` }} />
              <span className="w-2 h-2 rounded-full" style={{ background: themeAccent, boxShadow: `0 0 10px ${themeAccent}99` }} />
              <span className="h-px w-14 md:w-20" style={{ background: `linear-gradient(90deg, ${themeAccent}66, transparent)` }} />
            </div>
            <h2
              className={`catalog-heading text-4xl md:text-7xl font-semibold italic break-words ${thText}`}
              style={{ textShadow: `0 0 60px ${themeAccent}4D`, letterSpacing: '0.05em' }}
            >
              {business?.name || business?.businessName}
            </h2>
            {(business?.catalogWelcome || business?.catalogTagline) && (
              <p className="mt-6 text-xs md:text-sm uppercase tracking-[0.4em] font-light" style={{ color: themeAccentText }}>
                {business?.catalogWelcome || business?.catalogTagline}
              </p>
            )}
          </div>
        </div>
      ) : themeChrome.heroEmpty === 'spectrum' ? (
        /* === SIN PORTADA, Hologram: el nombre pintado con el espectro sobre
            un estallido iridiscente desenfocado. === */
        <div className={`relative overflow-hidden ${sidebarNav ? 'md:mt-6 md:rounded-2xl' : ''}`}>
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full pointer-events-none catalog-holo-sweep"
            style={{
              background: 'conic-gradient(from 0deg, rgba(255,0,80,.10), rgba(255,165,0,.10), rgba(0,255,100,.10), rgba(0,180,255,.10), rgba(130,0,255,.10), rgba(255,0,80,.10))',
              filter: 'blur(60px)',
            }}
          />
          <div className="relative max-w-4xl mx-auto px-6 py-16 md:py-24 text-center">
            <h2 className="catalog-heading catalog-spectrum-text text-4xl md:text-7xl font-bold uppercase tracking-[0.15em] break-words">
              {business?.name || business?.businessName}
            </h2>
            {(business?.catalogWelcome || business?.catalogTagline) && (
              <p className={`mt-6 text-xs md:text-sm uppercase tracking-[0.4em] font-light ${thTextMuted}`}>
                {business?.catalogWelcome || business?.catalogTagline}
              </p>
            )}
          </div>
        </div>
      ) : themeChrome.heroEmpty === 'manifiesto' ? (
        /* === SIN PORTADA, brutalist: el nombre a tamano de cartel y el lema
            como comentario de codigo. Fondo blanco, filete grueso abajo: la
            pagina como manifiesto impreso. === */
        <div className={`${sidebarNav ? 'md:mt-6' : ''} border-b-[3px] border-black`}>
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-16 text-center">
            <h2
              className={`catalog-heading font-bold uppercase tracking-tighter leading-none text-4xl md:text-7xl break-words ${thText}`}
            >
              {business?.name || business?.businessName}
            </h2>
            {(business?.catalogWelcome || business?.catalogTagline) && (
              <p className={`mt-5 text-sm md:text-base uppercase tracking-[0.2em] ${thTextMuted}`}>
                {'// '}{business?.catalogWelcome || business?.catalogTagline}
              </p>
            )}
          </div>
        </div>
      ) : themeChrome.heroEmpty === 'impact' ? (
        /* === SIN PORTADA, bold: nombre display gigante en el acento sobre
            fondo oscuro con glow — el hero tipografico de shopifree. === */
        <div className={`relative overflow-hidden ${sidebarNav ? 'md:mt-6 md:rounded-2xl' : ''}`}>
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 blur-[100px] opacity-25 pointer-events-none"
            style={{ backgroundColor: themeAccentText }}
          />
          <div className="relative max-w-7xl mx-auto px-4 pt-12 pb-4 md:pt-20 md:pb-8 text-center">
            <h2 className="font-black uppercase tracking-tighter leading-none text-4xl md:text-7xl break-words" style={{ color: themeAccentText }}>
              {business?.name || business?.businessName}
            </h2>
            {(business?.catalogWelcome || business?.catalogTagline) && (
              <p className={`mt-4 text-sm md:text-lg uppercase tracking-[0.2em] ${thTextMuted}`}>
                {business?.catalogWelcome || business?.catalogTagline}
              </p>
            )}
            <div className="w-24 h-1 mx-auto mt-6" style={{ backgroundColor: themeAccentText }} />
          </div>
        </div>
      ) : (
        /* === ESTILO CLÁSICO: solo cuando NO hay portada (gradient sólido) === */
        <div
          className={`relative text-white overflow-hidden ${sidebarNav ? 'md:mt-6 md:rounded-2xl' : ''}`}
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

            {/* Barra de búsqueda (oculta si el negocio activó la barra fija) */}
            <div className={`relative max-w-2xl mx-auto md:mx-0 ${barraDeBusquedaVisible ? 'hidden' : ''}`}>
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

      {/* Sellos de confianza (F2.6) — debajo del hero, activables */}
      <TrustBadges
        config={business?.catalogTrustBadges}
        accent={getCatalogAccent(business)}
        themeClasses={{ card: thCard, border: thBorderColor, text: thText }}
      />

      {/* Reservar cita: SECCION de ancho completo (no un boton que abre un
          modal) — servicios, calendario, horas y formulario a la vista a la
          vez. Solo si el negocio lo activo en Configuracion > Catalogo; la
          carta de restaurante no la muestra: ahi el flujo es pedir, no
          agendar. */}
      {!isRestaurantMenu && business?.appointmentsBooking?.enabled === true && (
        <ReservarCitaSection
          business={business}
          accent={getCatalogAccent(business)}
          themeClasses={themeClasses}
        />
      )}

      {/* Reservar habitacion (modo hotel). Lo que se envia es una SOLICITUD
          que el hotel confirma — el modal lo dice sin rodeos. */}
      {!isRestaurantMenu && business?.businessMode === 'hotel' && business?.hotelBooking?.enabled === true && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <button
            type="button"
            onClick={() => setShowReservarHabitacion(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: getCatalogAccent(business) }}
          >
            <BedDouble className="w-5 h-5" />
            Reservar una habitación
          </button>
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

      {/* Categorías — barra superior. Con navegación lateral (sidebar) se oculta
          en escritorio: las categorías viven en la columna izquierda. La fila
          existe aunque no haya categorías: la LUPA vive aquí (port shopifree). */}
      {(rootCategories.length > 0 || products.length > 0) && (
        <div data-catalog-categories className={`${thCard} ${thBorderColor} border-b sticky top-16 md:top-20 z-30 ${sidebarNav ? 'md:bg-transparent md:border-0 md:static' : ''}`}>
          <div className={sidebarNav ? 'px-4 md:px-0' : 'max-w-7xl mx-auto px-4'}>
            {/* Categorías raíz — SIEMPRE una fila con scroll horizontal (A1 del
                rediseño): en desktop el wrap multilínea comía media pantalla con
                muchas categorías. Flechas + fade en bordes via CategoryScroller. */}
            {/* La lupa va FUERA del carrusel: dentro se desplazaba con las
                categorias y desaparecia al deslizar a la derecha — justo cuando
                mas se necesita, porque quien desliza buscando su categoria es
                el que no la encuentra. */}
            <div className={barraDeBusquedaVisible ? '' : 'flex items-stretch gap-1'}>
              {barraDeBusquedaVisible ? (
                /* Barra a la vista: filtra la grilla mientras se escribe, sin abrir nada. */
                <div className="relative py-3">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar productos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-11 pr-10 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${thSearchClassic} ${thBorderColor}`}
                    aria-label="Buscar productos"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center ${thViewHover}`}
                      aria-label="Limpiar búsqueda"
                    >
                      <X className={`w-4 h-4 ${thTextMuted}`} />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setSearchOpen(true)}
                  className={`flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${thViewHover} ${categoriesVariant === 'circles' ? 'w-14 h-14 self-start mt-3' : 'w-10 h-10 self-center'}`}
                  aria-label="Buscar productos"
                >
                  <Search className={`w-[18px] h-[18px] ${thTextMuted}`} />
                </button>
              )}
              <div className="min-w-0 flex-1">
            <CategoryScroller className="-mx-4 px-4 md:mx-0 md:px-0" innerClassName="gap-2 py-3">
              {/* Botón "Todos": oculto en modo onlyCarousels cuando estamos en la vista principal,
                  para forzar al cliente a entrar a una categoría. Dentro de una categoría sí se muestra. */}
              {categoriesVariant === 'circles' ? (
                <>
                  {/* Variante CÍRCULOS (motor v2): foto de la categoría (o inicial)
                      en círculo + nombre debajo, estilo apps de delivery/mercado. */}
                  {/* "Todos" SIEMPRE visible. Antes se ocultaba en el modo
                      antiguo "solo carruseles" para empujar al cliente a entrar
                      a una categoria, y el efecto era el contrario: desde la
                      vista principal no habia forma de ver el catalogo entero. */}
                  <button
                    onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null) }}
                    className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16 group/cat"
                  >
                      <span
                        className="w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all"
                        style={{
                          borderColor: !selectedCategory ? getCatalogAccent(business) : 'transparent',
                          backgroundColor: `${getCatalogAccent(business)}15`,
                          color: getCatalogAccent(business),
                        }}
                      >
                        <Grid3X3 className="w-6 h-6" />
                      </span>
                    <span className={`text-[11px] font-medium truncate w-full text-center ${!selectedCategory ? thText : thTextMuted}`}>Todos</span>
                  </button>
                  {rootCategories.map(category => {
                    const active = selectedCategory === category.id
                    const img = categoryImageMap[category.id]
                    return (
                      <button
                        key={category.id}
                        onClick={() => { setSelectedCategory(category.id); setSelectedSubcategory(null) }}
                        className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16"
                      >
                        <span
                          className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center border-2 transition-all"
                          style={{
                            borderColor: active ? getCatalogAccent(business) : 'transparent',
                            backgroundColor: img ? undefined : `${getCatalogAccent(business)}15`,
                          }}
                        >
                          {img ? (
                            <img
                              src={optimizeImageUrl(img, 'thumbnail')}
                              alt={category.name}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-lg font-bold" style={{ color: getCatalogAccent(business) }}>
                              {(category.name || '?').charAt(0).toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span className={`text-[11px] font-medium truncate w-full text-center ${active ? thText : thTextMuted}`}>
                          {category.name}
                        </span>
                      </button>
                    )
                  })}
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null) }}
                    className={catBtnClass(!selectedCategory)}
                    style={catBtnStyle(!selectedCategory)}
                  >
                    Todos
                  </button>
                  {rootCategories.map(category => {
                    const imgCat = categoryImageMap[category.id]
                    return (
                    <button
                      key={category.id}
                      onClick={() => { setSelectedCategory(category.id); setSelectedSubcategory(null) }}
                      className={`${catBtnClass(selectedCategory === category.id)} ${imgCat ? 'flex items-center gap-2' : ''}`}
                      style={catBtnStyle(selectedCategory === category.id)}
                    >
                      {/* Foto de la categoria (port shopifree): la primera foto
                          de producto de esa rama, en circulo. Sin foto, el
                          nombre va solo — un circulo vacio ensucia mas de lo
                          que ayuda. */}
                      {imgCat && (
                        <img
                          src={optimizeImageUrl(imgCat, 'thumbnail')}
                          alt=""
                          aria-hidden
                          loading="lazy"
                          className="w-7 h-7 object-cover flex-shrink-0"
                          // El recorte lo manda el tema: circulo en casi
                          // todos, cuadrado en Brutalist, donde no hay una
                          // sola esquina redondeada en toda la tienda.
                          style={{ borderRadius: 'var(--ct-radius-full, 9999px)' }}
                        />
                      )}
                      {category.name}
                    </button>
                    )
                  })}
                </>
              )}
            </CategoryScroller>
              </div>
            </div>
            {/* Subcategorías de la categoría seleccionada — misma fila deslizable
                que las raíz (el árbol completo vive en el menú lateral móvil). */}
            {activeSubcategories.length > 0 && (
              <CategoryScroller className="-mx-4 px-4 md:mx-0 md:px-0" innerClassName="gap-2 pb-3">
                {/* Subcategorias con el MISMO lenguaje que la fila principal:
                    texto plano y subrayado en la activa. Antes eran pastillas
                    rellenas, y una fila de tabs sobre una fila de pastillas se
                    veia como dos componentes distintos peleandose. */}
                <button
                  onClick={() => setSelectedSubcategory(null)}
                  className={`px-2 py-1.5 text-xs font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors bg-transparent ${!selectedSubcategory ? 'font-semibold' : `border-transparent ${thTextMuted}`}`}
                  style={!selectedSubcategory
                    ? { borderColor: getCatalogAccent(business), color: getCatalogAccent(business) }
                    : {}}
                >
                  Todas
                </button>
                {activeSubcategories.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setSelectedSubcategory(sub.id)}
                    className={`px-2 py-1.5 text-xs font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors bg-transparent ${selectedSubcategory === sub.id ? 'font-semibold' : `border-transparent ${thTextMuted}`}`}
                    style={selectedSubcategory === sub.id
                      ? { borderColor: getCatalogAccent(business), color: getCatalogAccent(business) }
                      : {}}
                  >
                    {sub.name}
                  </button>
                ))}
              </CategoryScroller>
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
              <span className="font-semibold">Menú</span>
              <button onClick={() => setCategoryDrawerOpen(false)} className="p-2 -mr-2" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {/* CUENTA — arriba de todo, igual que el sidebar de escritorio */}
              {!customerAccountsOn ? null : catalogUser ? (
                <div className={`px-4 pb-3 mb-2 border-b ${thBorderColor}`}>
                  <div className="flex items-center gap-2.5 mb-3">
                    {catalogUser.photoURL ? (
                      <img src={catalogUser.photoURL} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <span
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: getCatalogAccent(business) }}
                      >
                        {(catalogProfile?.name || catalogUser.displayName || catalogUser.email || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${thText}`}>
                        {catalogProfile?.name || catalogUser.displayName || 'Mi cuenta'}
                      </p>
                      <p className={`text-[11px] truncate ${thTextFaint}`}>{catalogUser.email}</p>
                    </div>
                  </div>
                  {[
                    { id: 'orders', label: 'Mis pedidos', icon: Package },
                    { id: 'addresses', label: 'Mis direcciones', icon: MapPin },
                    { id: 'data', label: 'Mis datos', icon: User },
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setCategoryDrawerOpen(false); setAccountTab(item.id); setAccountOpen(true) }}
                      className={`w-full flex items-center gap-2.5 text-left py-2 text-sm font-medium ${thTextMuted}`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {item.label}
                    </button>
                  ))}
                  <button
                    onClick={catalogLogout}
                    className={`w-full flex items-center gap-2.5 text-left py-2 text-sm font-medium ${thTextMuted}`}
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    Cerrar sesión
                  </button>
                </div>
              ) : (
                <div className={`px-4 pb-3 mb-2 border-b ${thBorderColor}`}>
                  <p className={`text-xs mb-2.5 ${thTextFaint}`}>
                    Guarda tus pedidos y direcciones. Puedes seguir comprando sin registrarte.
                  </p>
                  <button
                    onClick={() => { setCategoryDrawerOpen(false); setAuthModalOpen(true) }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ backgroundColor: getCatalogAccent(business) }}
                  >
                    <User className="w-4 h-4" />
                    Iniciar sesión
                  </button>
                </div>
              )}

              {/* CATEGORÍAS */}
              {rootCategories.length > 0 && (
                <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] px-4 pt-1 pb-1.5 ${thTextFaint}`}>Categorías</p>
              )}
              <button
                onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); setCategoryDrawerOpen(false) }}
                className="w-full text-left px-4 py-1.5 text-sm font-semibold"
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
                        className="flex-1 text-left px-4 py-1.5 text-sm font-semibold"
                        style={isActive ? { color: getCatalogAccent(business) } : {}}
                      >
                        {category.name}
                      </button>
                      {subs.length > 0 && (
                        <button
                          onClick={() => setDrawerExpandedCategory(isExpanded ? null : category.id)}
                          className="p-1.5 mr-2 flex-shrink-0"
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
                            className="w-full text-left pl-8 pr-4 py-1.5 text-sm opacity-90"
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
            {/* Info del negocio al pie del menú (igual que el sidebar de escritorio) */}
            <div className={`flex-shrink-0 border-t ${thBorderColor} p-4 space-y-3`}>
              {business?.address && (
                <p className={`text-xs flex items-start gap-1.5 ${thTextMuted}`}>
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{business.address}</span>
                </p>
              )}
              {business?.businessHours?.enabled && (() => {
                const status = isBusinessOpen(business.businessHours)
                return (
                  <div className="flex items-center gap-2">
                    <Clock className={`w-3.5 h-3.5 ${thTextMuted}`} />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {status.open ? 'Abierto' : 'Cerrado'}
                    </span>
                  </div>
                )
              })()}
              {(business?.catalogWhatsapp || business?.whatsapp || business?.phone) && (
                <a
                  href={`https://wa.me/${(business.catalogWhatsapp || business.whatsapp || business.phone).replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 text-white rounded-xl text-sm font-medium"
                  style={{ backgroundColor: getCatalogAccent(business) }}
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Productos */}
      {/* En modo sidebar el ancho y el padding lateral ya los da la columna:
          el main no debe volver a centrarse ni agregar su propio px-4. */}
      <main className={sidebarNav ? 'px-4 md:px-0 py-6 md:py-8' : 'max-w-7xl mx-auto px-4 py-6 md:py-8'}>
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
              {/* Orden de los productos. Las opciones de precio solo tienen
                  sentido si el catálogo muestra precios. */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Ordenar productos"
                className={`text-sm rounded-lg px-2 py-1.5 border border-gray-200 ${thSearchClassic} ${thBorderColor}`}
              >
                <option value="name_asc">Nombre: A - Z</option>
                <option value="name_desc">Nombre: Z - A</option>
                {showPrices && <option value="price_asc">Precio: menor a mayor</option>}
                {showPrices && <option value="price_desc">Precio: mayor a menor</option>}
              </select>
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
                    {/* Sin carrusel no hace falta "Ver todo": ya estan todos */}
                    {!seccionesEnGrilla && (
                      <button
                        onClick={() => { setSelectedCategory(category.id); setSelectedSubcategory(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                        className="text-sm font-medium hover:opacity-80 transition-opacity"
                        style={{ color: getCatalogAccent(business) }}
                      >
                        Ver todo →
                      </button>
                    )}
                    {seccionesEnGrilla && (
                      <span className={`text-sm ${thTextFaint}`}>{categoryProducts.length}</span>
                    )}
                  </div>
                  {seccionesEnGrilla ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                      {categoryProducts.map((product, idx) => (
                        <GridCard key={product.id} product={product} index={idx} uniform ctx={cardCtx} />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                      <div className="flex gap-4">
                        {categoryProducts.slice(0, 10).map(product => (
                          <CarouselCard key={product.id} product={product} ctx={cardCtx} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {/* Separador antes de mostrar todos — oculto en modo onlyCarousels */}
            {!onlyCarousels && (
              <div className="flex items-center gap-4 pt-2">
                <div className={`flex-1 border-t ${thBorderColor}`} />
                <span className={`text-sm font-medium ${thTextFaint}`}>Todos los productos</span>
                <div className="flex items-center gap-1.5">
                  {/* Mismo selector de orden que la vista por categoría */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    aria-label="Ordenar productos"
                    className={`text-xs rounded-lg px-2 py-1 border border-gray-200 ${thSearchClassic} ${thBorderColor}`}
                  >
                    <option value="name_asc">Nombre: A - Z</option>
                    <option value="name_desc">Nombre: Z - A</option>
                    {showPrices && <option value="price_asc">Precio: menor a mayor</option>}
                    {showPrices && <option value="price_desc">Precio: mayor a menor</option>}
                  </select>
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

        {/* Ancla del inicio de los productos (destino del cambio de pagina) */}
        <div ref={productsTopRef} aria-hidden className="scroll-mt-32" />

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
          // F2.3 + motor v2: 'masonry' = columnas con alturas naturales (default);
          // 'grid' = cuadrícula uniforme; 'magazine' = cuadrícula uniforme con la
          // PRIMERA tarjeta a doble ancho/alto (portada de revista).
          <div className={catalogLayout === 'masonry'
            ? 'columns-2 md:columns-3 lg:columns-4 gap-4 md:gap-6'
            : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6'}>
            {displayedProducts.map((product, index) => (
              catalogLayout === 'magazine' ? (
                <div key={product.id} className={index === 0 ? 'col-span-2 row-span-2' : ''}>
                  <GridCard product={product} index={index} uniform ctx={cardCtx} />
                </div>
              ) : (
                <GridCard key={product.id} product={product} index={index} uniform={catalogLayout !== 'masonry'} ctx={cardCtx} />
              )
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
        {/* Paginacion (port shopifree): boton "Ver mas" para infinite (con
            sentinel que auto-carga) y load-more (solo boton); numerada 1..n
            para pages; en none no hay nada que paginar. */}
        {!(onlyCarousels && groupByCategory && !selectedCategory && !searchQuery) && paginationMode !== 'pages' && displayedProducts.length < filteredProducts.length && (
          <div ref={paginationMode === 'infinite' ? loadMoreSentinelRef : undefined} className="text-center py-6">
            <button
              onClick={() => setVisibleCount(prev => prev + 40)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium ${thCatInactive}`}
            >
              Ver más productos ({filteredProducts.length - displayedProducts.length} restantes)
            </button>
          </div>
        )}
        {!(onlyCarousels && groupByCategory && !selectedCategory && !searchQuery) && paginationMode === 'pages' && totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-6">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className={`p-2 rounded-lg transition-colors disabled:opacity-30 ${thText}`}
              aria-label="Página anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(page => {
                if (totalPages <= 7) return true
                if (page === 1 || page === totalPages) return true
                if (Math.abs(page - currentPage) <= 1) return true
                return false
              })
              .reduce((acc, page, idx, arr) => {
                if (idx > 0 && page - arr[idx - 1] > 1) acc.push('dots')
                acc.push(page)
                return acc
              }, [])
              .map((item, idx) =>
                item === 'dots' ? (
                  <span key={`dots-${idx}`} className={`px-1 ${thTextMuted}`}>...</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => goToPage(item)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${item === currentPage ? 'text-white' : thText}`}
                    style={item === currentPage ? { backgroundColor: getCatalogAccent(business) } : undefined}
                  >
                    {item}
                  </button>
                )
              )}
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`p-2 rounded-lg transition-colors disabled:opacity-30 ${thText}`}
              aria-label="Página siguiente"
            >
              <ChevronRight className="w-5 h-5" />
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
        </div>{/* fin columna de contenido (layout sidebar) */}
      </div>{/* fin wrapper de dos columnas (layout sidebar) */}

      {/* Footer con info del negocio. Con menú lateral se oculta en escritorio:
          esa info vive al pie de la columna izquierda y así el scroll de la
          derecha no "salta" al llegar abajo. En móvil se muestra siempre. */}
      {/* Footer (port shopifree): 3 columnas — marca, contacto+horario y
          redes sociales (business.catalogSocial, se configuran en Mi Catalogo
          Online). Vive en su propio componente y se pinta con tokens. */}
      <CatalogFooter business={business} sidebarNav={sidebarNav} />

      {/* Sin barra flotante de carrito en movil: tapaba la ultima fila de
          productos justo cuando el cliente sigue comprando, y el carrito ya
          vive en el header, que es pegajoso. shopifree tambien la elimino
          (su CartBar devuelve null). */}

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
        themeClasses={themeClasses}
      />

      {/* Panel "Mi cuenta": pedidos, direcciones y datos */}
      {catalogUser && (
        <CustomerAccountDrawer
          isOpen={accountOpen}
          onClose={() => setAccountOpen(false)}
          businessId={business?.id}
          user={catalogUser}
          profile={catalogProfile}
          onProfileChange={setCatalogProfile}
          accent={getCatalogAccent(business)}
          currency={catalogCurrency}
          initialTab={accountTab}
        />
      )}

      {/* Login/registro OPCIONAL del comprador */}
      {customerAccountsOn && <CustomerAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        businessId={business?.id}
        accent={getCatalogAccent(business)}
      />}

      {/* Cart Drawer */}
      <ReservarHabitacionModal
        business={business}
        accent={getCatalogAccent(business)}
        isOpen={showReservarHabitacion}
        onClose={() => setShowReservarHabitacion(false)}
      />

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
        tableId={tableIdFromUrl}
        activeTableOrder={activeTableOrder}
        catalogCurrency={catalogCurrency}
        catalogExchangeRate={catalogExchangeRate}
        catalogUser={catalogUser}
        catalogProfile={catalogProfile}
        onOrderAdded={() => {
          // Recargar la orden activa después de agregar items
          if (business && tableFromUrl) {
            const reloadOrder = async () => {
              try {
                const tablesRef = collection(db, 'businesses', business.id, 'tables')
                const allTablesSnap = await getDocs(tablesRef)
                const matched = findTableDoc(allTablesSnap.docs)
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

      {/* Panel de busqueda (lupa junto a las categorias) */}
      {searchOpen && (
        <CatalogSearchModal
          products={publicProducts}
          showPrices={showPrices}
          formatPrice={fmtCatalog}
          onSelectProduct={(p) => setSelectedProduct(p)}
          onClose={() => { setSearchOpen(false); setSearchQuery('') }}
        />
      )}

      {/* Modal de cuenta de la mesa */}
      <TableAccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        activeTableOrder={activeTableOrder}
        business={business}
        onAddMore={() => {}}
      />
    </div>
    </CatalogThemeProvider>
  )
}
