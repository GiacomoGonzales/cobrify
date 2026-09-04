/**
 * MI CATÁLOGO ONLINE — la tienda pública del negocio: su enlace, lo que se
 * muestra, cómo se ve y qué promociona.
 *
 * Es la ex pestaña "catalogo" de Settings.jsx movida TAL CUAL: las mismas tres
 * sub-pestañas (Configuración, Apariencia, Avanzado), las mismas secciones,
 * los mismos textos y los mismos controles. A diferencia del resto de la
 * reorganización, acá no se rediseñó nada: es la pestaña más grande y el
 * objetivo era que se viera y se comportara igual.
 *
 * Lo único que cambió es de dónde sale el estado y por dónde escribe:
 *
 *   - El estado se inicializa UNA sola vez desde `businessSettings` (el
 *     documento del negocio que ya trae el contexto) en vez de releer
 *     `businesses/{id}` al montar. La marca la lleva un `useRef` y no hay
 *     re-sincronización: en modo demo el contexto puede devolver un objeto
 *     nuevo en cada render y un efecto con setState entraría en bucle; y acá,
 *     además, las imágenes recién subidas viven en el estado hasta que se
 *     toca Guardar — un re-sync las borraría a mitad de edición.
 *   - El guardado va por `useGuardado` (merge), con exactamente los mismos
 *     campos que escribía el botón viejo: ni uno más, ni uno menos.
 *
 * `catalogWholesaleMinQty` / `catalogWholesaleMinQtys` NO se escriben desde
 * acá: la cantidad mínima por nivel de precio se configura AHORA EN CADA
 * PRODUCTO (useAutoPriceByQty + priceMinQtys) y el valor que tengan los
 * negocios antiguos se respeta tal cual (ver getCatalogMinQty).
 *
 * El título de la página ("Mi Catálogo Online") lo pone la cáscara de
 * Configuración cuando se llega con ?tab=catalogo: acá solo va el contenido.
 */
import { useState, useEffect, useRef } from 'react'
import {
  ArrowDown, Bell, Bike, CalendarDays, Check, ChevronDown, ChevronsUpDown, ChevronUp, Clock,
  Cog, Copy, Download, ExternalLink, Eye, FileText, Globe, Image, Info, LayoutGrid, Loader2,
  MessageCircle, Package, Palette, QrCode, Save, ShoppingCart, Store, Trash2, User, X,
} from 'lucide-react'
import QRCode from 'qrcode'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useGuardado } from '@/components/settings/useGuardado'
import { Ajuste } from '@/components/settings/kit'
import ImageDropZone from '@/components/settings/ImageDropZone'
import ThemeThumb, { THUMB_W, THUMB_H } from '@/components/settings/ThemeThumb'
import CatalogThemePreview from '@/components/CatalogThemePreview'
import { CATALOG_THEMES, getCatalogThemesList } from '@/themes/catalogThemes'
import Button from '@/components/ui/Button'
import { uploadImage } from '@/services/imageUploadService'
import {
  compressForLogoSquare,
  compressForLogoLandscape,
  compressForCoverDesktop,
  compressForCoverMobile,
} from '@/services/productImageService'
import { downloadDataUrl, saveFilesToDevice } from '@/utils/nativeDownload'
import { getProducts } from '@/services/firestoreService'
import { getActiveBranches } from '@/services/branchService'
import { getTables } from '@/services/tableService'
import { filtrarVendibles } from '@/utils/productSale'

// URL base de producción para el catálogo público
const PRODUCTION_URL = 'https://cobrifyperu.com'

export default function Catalogo() {
  const { getBusinessId, isDemoMode, businessSettings, businessMode, subscription } = useAppContext()
  const toast = useToast()
  const { guardar, guardando } = useGuardado()

  const currentBusinessId = getBusinessId()

  // Del documento del negocio, de solo lectura acá: el logo lo administra Mi
  // Empresa y la Agenda de Citas se enciende en Módulos. El catálogo los
  // consulta (el logo como respaldo del suyo, la agenda para saber si puede
  // ofrecer reservas) pero nunca los escribe.
  const logoUrl = businessSettings?.logoUrl || ''
  const appointmentsEnabled = businessSettings?.appointmentsEnabled || false

  // Preview de tema del catálogo
  const [previewThemeId, setPreviewThemeId] = useState(null)
  // Galeria de temas: se muestran los primeros y el resto tras "Ver mas".
  const [temasExpandidos, setTemasExpandidos] = useState(false)

  // Estados para catálogo público
  const [catalogEnabled, setCatalogEnabled] = useState(false)
  // Reservas de citas desde el catalogo publico (veterinaria / General con agenda)
  const [appointmentsBooking, setAppointmentsBooking] = useState({
    enabled: false, days: [1, 2, 3, 4, 5, 6], startHour: 9, endHour: 19, stepMinutes: 30,
    // staff: quien atiende (OPCIONAL). Vacio = el catalogo no pregunta por
    // profesional y la agenda es una sola, como hasta ahora.
    staff: [], staffLabel: '',
  })
  // Solicitudes de reserva de habitaciones desde el catalogo (modo hotel)
  const [hotelBooking, setHotelBooking] = useState({ enabled: false })
  // Picker de servicios reservables: productos del negocio, cargados recien
  // cuando la seccion se abre (Configuración no necesita el catalogo para nada mas).
  const [productosReservables, setProductosReservables] = useState(null) // null = sin cargar
  const [busquedaServicio, setBusquedaServicio] = useState('')

  useEffect(() => {
    if (!appointmentsBooking.enabled || productosReservables !== null || isDemoMode) return
    getProducts(getBusinessId()).then(r => {
      setProductosReservables(r?.success ? filtrarVendibles(r.data) : [])
    }).catch(() => setProductosReservables([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentsBooking.enabled])

  const [catalogSlug, setCatalogSlug] = useState('')
  const [catalogCustomDomain, setCatalogCustomDomain] = useState('')

  const [catalogColor, setCatalogColor] = useState('#10B981')
  const [catalogTheme, setCatalogTheme] = useState('light')
  const [catalogCoverImage, setCatalogCoverImage] = useState('')          // hero desktop
  const [catalogCoverImageMobile, setCatalogCoverImageMobile] = useState('') // hero móvil (opcional)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingCoverMobile, setUploadingCoverMobile] = useState(false)
  const [catalogWelcome, setCatalogWelcome] = useState('')
  const [catalogTagline, setCatalogTagline] = useState('')
  const [catalogShowPrices, setCatalogShowPrices] = useState(true)
  const [catalogIgnoreStock, setCatalogIgnoreStock] = useState(false)
  const [catalogHideOutOfStock, setCatalogHideOutOfStock] = useState(false)
  const [catalogShowStock, setCatalogShowStock] = useState(false)
  // Cuentas de comprador en el catálogo. Default ON: solo agrega comodidades
  // (historial y direcciones) y nunca obliga a registrarse para comprar.
  const [catalogCustomerAccounts, setCatalogCustomerAccounts] = useState(true)
  const [catalogWhatsapp, setCatalogWhatsapp] = useState('')
  // Redes sociales del catalogo (footer "Siguenos"): usuario o URL completa
  const [catalogSocial, setCatalogSocial] = useState({ instagram: '', facebook: '', tiktok: '' })
  const [catalogObservations, setCatalogObservations] = useState('')
  // Tira publicitaria del catálogo (F2.1): banner superior activable
  const [catalogAnnouncement, setCatalogAnnouncement] = useState({
    enabled: false, text: '', mode: 'static', backgroundColor: '#111827', textColor: '#FFFFFF',
  })
  // Carrusel de portada del catálogo (F2.2): slides con imagen/texto/enlace
  const [catalogHero, setCatalogHero] = useState({ enabled: false, slides: [] })
  const [uploadingHeroSlide, setUploadingHeroSlide] = useState(null) // índice del slide subiendo
  // Diseño de la grilla de productos (F2.3): masonry | grid | list
  const [catalogLayout, setCatalogLayout] = useState('masonry')
  // Paginacion del catalogo (port shopifree): none | load-more | infinite | pages
  const [catalogPagination, setCatalogPagination] = useState('infinite')
  // Recepcion de pedidos online (el carrito ya lo respeta; faltaba el interruptor)
  const [catalogOnlineOrders, setCatalogOnlineOrders] = useState(true)
  // Pestana interna de Mi Catalogo Online: tienda | contenido | avanzado
  const [catalogTab, setCatalogTab] = useState('configuracion')
  // Fotos del negocio para las miniaturas de tema: sin imagenes propias, las
  // tarjetas son bloques grises y no dejan comparar nada. Se cargan una sola
  // vez, recien cuando se abre Apariencia.
  const [fotosMiniatura, setFotosMiniatura] = useState(null)
  useEffect(() => {
    if (catalogTab !== 'apariencia' || fotosMiniatura !== null || isDemoMode) return
    setFotosMiniatura([])
    getProducts(getBusinessId()).then(r => {
      const urls = (r?.success ? (r.data || []) : [])
        .map(pr => pr?.imageUrl)
        .filter(Boolean)
        .slice(0, 4)
      setFotosMiniatura(urls)
    }).catch(() => setFotosMiniatura([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogTab])
  // Navegación en escritorio del catálogo: 'top' (barra arriba) | 'sidebar'
  const [catalogDesktopNav, setCatalogDesktopNav] = useState('top')
  // Oferta con countdown (F2.5)
  const [catalogFlashSale, setCatalogFlashSale] = useState({
    enabled: false, text: '', endDate: '', backgroundColor: '#DC2626', textColor: '#FFFFFF',
  })
  // Sellos de confianza (F2.6)
  const [catalogTrustBadges, setCatalogTrustBadges] = useState({ enabled: false, badges: [] })
  // Efectos del catálogo (F2.7)
  const [catalogEffects, setCatalogEffects] = useState({ scrollReveal: false, imageSwapOnHover: false })
  // Buscador del catalogo: lupa (por defecto) o barra siempre a la vista.
  const [catalogSearchBar, setCatalogSearchBar] = useState(false)
  const [catalogLogoUrl, setCatalogLogoUrl] = useState('')                // logo cuadrado
  const [catalogLogoLandscape, setCatalogLogoLandscape] = useState('')    // logo horizontal (opcional, reemplaza cuadrado+nombre)
  const [uploadingCatalogLogo, setUploadingCatalogLogo] = useState(false)
  const [uploadingCatalogLogoLandscape, setUploadingCatalogLogoLandscape] = useState(false)
  const [businessHours, setBusinessHours] = useState({
    enabled: false,
    days: {
      1: { open: true, from: '09:00', to: '18:00' }, // Lunes
      2: { open: true, from: '09:00', to: '18:00' },
      3: { open: true, from: '09:00', to: '18:00' },
      4: { open: true, from: '09:00', to: '18:00' },
      5: { open: true, from: '09:00', to: '18:00' },
      6: { open: true, from: '09:00', to: '14:00' }, // Sábado
      0: { open: false, from: '09:00', to: '14:00' }, // Domingo
    }
  })
  const [catalogShowAllPrices, setCatalogShowAllPrices] = useState(true)
  const [catalogAllowTakeaway, setCatalogAllowTakeaway] = useState(true)
  const [catalogAllowDelivery, setCatalogAllowDelivery] = useState(true)
  const [catalogGroupByCategory, setCatalogGroupByCategory] = useState(false)
  const [catalogOnlyCarousels, setCatalogOnlyCarousels] = useState(false)
  const [catalogQrDataUrl, setCatalogQrDataUrl] = useState('')
  const [resellerCustomDomain, setResellerCustomDomain] = useState(null) // Dominio personalizado del reseller

  // Estados para QR de mesas (carta digital restaurante)
  const [tableQrCodes, setTableQrCodes] = useState([])
  // Nombre de sucursal -> parte de nombre de archivo (sin tildes ni espacios).
  const slugSede = (nombre) => String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const [generatingTableQrs, setGeneratingTableQrs] = useState(false)

  // Sucursales activas: acá solo sirven para agrupar los QR de mesa por local.
  const [branches, setBranches] = useState([])

  // ── Carga inicial ───────────────────────────────────────────────────────────
  // Una sola vez, desde el documento que ya trae el contexto. El `useRef` es
  // deliberado: sin él, en modo demo `businessSettings` puede llegar como un
  // objeto nuevo en cada render y el efecto quedaría en bucle.
  const yaCargado = useRef(false)
  useEffect(() => {
    if (yaCargado.current || !businessSettings) return
    yaCargado.current = true
    const businessData = businessSettings

    // Cargar configuración de catálogo
    setCatalogEnabled(businessData.catalogEnabled || false)
    if (businessData.appointmentsBooking) {
      setAppointmentsBooking(prev => ({ ...prev, ...businessData.appointmentsBooking }))
    }
    if (businessData.hotelBooking) {
      setHotelBooking(prev => ({ ...prev, ...businessData.hotelBooking }))
    }
    setCatalogSlug(businessData.catalogSlug || '')
    setCatalogCustomDomain(businessData.customDomain || '')
    setCatalogColor(businessData.catalogColor || '#10B981')
    setCatalogTheme(businessData.catalogTheme || 'light')
    setCatalogCoverImage(businessData.catalogCoverImage || '')
    setCatalogCoverImageMobile(businessData.catalogCoverImageMobile || '')
    setCatalogWelcome(businessData.catalogWelcome || '')
    setCatalogTagline(businessData.catalogTagline || '')
    setCatalogShowPrices(businessData.catalogShowPrices !== false) // Por defecto true
    setCatalogIgnoreStock(businessData.catalogIgnoreStock || false)
    setCatalogHideOutOfStock(businessData.catalogHideOutOfStock || false)
    setCatalogShowStock(businessData.catalogShowStock || false)
    setCatalogCustomerAccounts(businessData.catalogCustomerAccounts !== false)
    setCatalogWhatsapp(businessData.catalogWhatsapp || '')
    setCatalogPagination(businessData.catalogPagination || 'infinite')
    setCatalogOnlineOrders(businessData.catalogOnlineOrders !== false)
    setCatalogSocial({ instagram: '', facebook: '', tiktok: '', ...(businessData.catalogSocial || {}) })
    setCatalogObservations(businessData.catalogObservations || '')
    setCatalogAnnouncement({
      enabled: false, text: '', mode: 'static', backgroundColor: '#111827', textColor: '#FFFFFF',
      ...(businessData.catalogAnnouncement || {}),
    })
    setCatalogHero({
      enabled: businessData.catalogHero?.enabled === true,
      slides: Array.isArray(businessData.catalogHero?.slides) ? businessData.catalogHero.slides : [],
    })
    // Las tiendas que agrupaban por categoria con el flag viejo se ven
    // en el selector como 'Secciones por categoria'.
    setCatalogLayout(
      businessData.catalogLayout
      || (businessData.catalogGroupByCategory === true
        ? 'sections'
        : 'masonry')
    )
    setCatalogDesktopNav(businessData.catalogDesktopNav || 'top')
    setCatalogFlashSale({
      enabled: false, text: '', endDate: '', backgroundColor: '#DC2626', textColor: '#FFFFFF',
      ...(businessData.catalogFlashSale || {}),
    })
    setCatalogTrustBadges({
      enabled: businessData.catalogTrustBadges?.enabled === true,
      badges: Array.isArray(businessData.catalogTrustBadges?.badges) ? businessData.catalogTrustBadges.badges : [],
    })
    setCatalogEffects({
      scrollReveal: businessData.catalogEffects?.scrollReveal === true,
      imageSwapOnHover: businessData.catalogEffects?.imageSwapOnHover === true,
    })
    setCatalogSearchBar(businessData.catalogSearchBar === true)
    setCatalogLogoUrl(businessData.catalogLogoUrl || '')
    setCatalogLogoLandscape(businessData.catalogLogoLandscape || '')
    setCatalogShowAllPrices(businessData.catalogShowAllPrices !== false)
    setCatalogAllowTakeaway(businessData.catalogAllowTakeaway !== false)
    setCatalogAllowDelivery(businessData.catalogAllowDelivery !== false)
    setCatalogGroupByCategory(businessData.catalogGroupByCategory || false)
    setCatalogOnlyCarousels(businessData.catalogOnlyCarousels || false)
    if (businessData.businessHours) {
      setBusinessHours(prev => ({ ...prev, ...businessData.businessHours }))
    }
  }, [businessSettings])

  // Cargar sucursales activas (para agrupar los QR de mesa por local).
  // La dependencia es el id del negocio y no `user`: para un sub-usuario los
  // permisos llegan después y con `user` solo se cargaría de más o de menos.
  useEffect(() => {
    if (!currentBusinessId || isDemoMode) return
    let vigente = true
    getActiveBranches(currentBusinessId).then(r => {
      if (vigente && r?.success) setBranches(r.data || [])
    }).catch(error => console.error('Error al cargar sucursales:', error))
    return () => { vigente = false }
  }, [currentBusinessId, isDemoMode])

  // Generar QR del catálogo cuando cambie el slug
  useEffect(() => {
    if (catalogSlug && catalogEnabled) {
      // Usar dominio personalizado del reseller si está disponible
      const baseUrl = resellerCustomDomain
        ? `https://${resellerCustomDomain}`
        : PRODUCTION_URL
      const catalogUrl = businessMode === 'restaurant'
        ? `${baseUrl}/menu/${catalogSlug}`
        : `${baseUrl}/catalogo/${catalogSlug}`
      QRCode.toDataURL(catalogUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }).then(url => {
        setCatalogQrDataUrl(url)
      }).catch(err => {
        console.error('Error generating QR:', err)
      })
    } else {
      setCatalogQrDataUrl('')
    }
  }, [catalogSlug, catalogEnabled, resellerCustomDomain, businessMode])

  // Auto-generar QRs de mesas cuando el catálogo esté habilitado y sea restaurante
  useEffect(() => {
    if (!catalogSlug || !catalogEnabled || businessMode !== 'restaurant') {
      setTableQrCodes([])
      return
    }
    const generateTableQrs = async () => {
      setGeneratingTableQrs(true)
      try {
        const result = await getTables(getBusinessId())
        if (!result.success || !result.data || result.data.length === 0) {
          setTableQrCodes([])
          return
        }
        const baseUrl = resellerCustomDomain ? `https://${resellerCustomDomain}` : PRODUCTION_URL
        const qrs = []
        for (const mesa of result.data) {
          // `t` = ID del documento de la mesa, unico en todo el negocio. Sin el,
          // dos sucursales con "Mesa 5" generaban el MISMO QR y el pedido caia
          // en la que apareciera primero. `mesa` se mantiene para mostrar el
          // numero y para que los QR ya impresos sigan funcionando.
          const url = `${baseUrl}/menu/${catalogSlug}?mesa=${mesa.number}&t=${mesa.id}`
          const dataUrl = await QRCode.toDataURL(url, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
          })
          const sede = mesa.branchId
            ? (branches.find(b => b.id === mesa.branchId)?.name || 'Sucursal')
            : (businessSettings?.mainBranchName || 'Sucursal Principal')
          qrs.push({
            id: mesa.id,
            table: mesa.number,
            zone: mesa.zone || '',
            branchId: mesa.branchId || null,
            branchName: sede,
            url,
            dataUrl,
          })
        }
        setTableQrCodes(qrs)
      } catch (error) {
        console.error('Error generating table QR codes:', error)
      } finally {
        setGeneratingTableQrs(false)
      }
    }
    generateTableQrs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogSlug, catalogEnabled, businessMode, resellerCustomDomain, branches])

  // Obtener dominio personalizado del reseller cuando hay suscripción
  useEffect(() => {
    const fetchResellerDomain = async () => {
      if (!subscription?.resellerId) {
        setResellerCustomDomain(null)
        return
      }

      try {
        const resellerDoc = await getDoc(doc(db, 'resellers', subscription.resellerId))
        if (resellerDoc.exists()) {
          const resellerData = resellerDoc.data()
          if (resellerData.customDomain) {
            setResellerCustomDomain(resellerData.customDomain)
          }
        }
      } catch (error) {
        console.error('Error fetching reseller domain:', error)
      }
    }

    fetchResellerDomain()
  }, [subscription?.resellerId])

  // ── Guardado ────────────────────────────────────────────────────────────────
  // Los mismos campos que escribía el botón viejo, uno por uno. El modo demo lo
  // corta `useGuardado`.
  const guardarCatalogo = async () => {
    if (catalogEnabled && !catalogSlug) {
      toast.error(businessMode === 'restaurant' ? 'Ingresa una URL para tu carta digital' : 'Ingresa una URL para tu catálogo')
      return
    }

    await guardar({
      catalogEnabled,
      // Las personas sin nombre no se publican: una fila vacia
      // en el catalogo seria un boton sin etiqueta.
      appointmentsBooking: {
        ...appointmentsBooking,
        staffLabel: (appointmentsBooking.staffLabel || '').trim(),
        staff: (appointmentsBooking.staff || [])
          .map(x => ({ ...x, name: (x.name || '').trim() }))
          .filter(x => x.name),
      },
      hotelBooking,
      catalogSlug: catalogSlug.toLowerCase().trim(),
      customDomain: catalogCustomDomain.toLowerCase().trim().replace(/^www\./, '') || null,
      catalogColor,
      catalogTheme,
      catalogCoverImage,
      catalogCoverImageMobile: catalogCoverImageMobile || null,
      catalogWelcome,
      catalogTagline,
      catalogShowPrices,
      catalogIgnoreStock,
      catalogHideOutOfStock,
      catalogShowStock,
      catalogCustomerAccounts,
      catalogWhatsapp: catalogWhatsapp.trim(),
      catalogPagination,
      catalogOnlineOrders,
      catalogSocial: {
        instagram: (catalogSocial.instagram || '').trim(),
        facebook: (catalogSocial.facebook || '').trim(),
        tiktok: (catalogSocial.tiktok || '').trim(),
      },
      catalogObservations: catalogObservations.trim(),
      catalogAnnouncement: { ...catalogAnnouncement, text: (catalogAnnouncement.text || '').trim() },
      // Carrusel hero: solo slides con imagen (los vacíos no cuentan)
      catalogHero: {
        enabled: catalogHero.enabled,
        slides: (catalogHero.slides || []).filter(s => s.imageUrl).map(s => ({
          id: s.id,
          imageUrl: s.imageUrl,
          title: (s.title || '').trim(),
          subtitle: (s.subtitle || '').trim(),
          link: (s.link || '').trim(),
        })),
      },
      catalogLayout,
      catalogDesktopNav,
      catalogFlashSale: { ...catalogFlashSale, text: (catalogFlashSale.text || '').trim() },
      catalogTrustBadges: {
        enabled: catalogTrustBadges.enabled,
        badges: (catalogTrustBadges.badges || []).filter(b => (b.text || '').trim()).map(b => ({
          id: b.id, icon: b.icon || 'shield', text: (b.text || '').trim(),
        })),
      },
      catalogEffects,
      catalogSearchBar,
      catalogLogoUrl: catalogLogoUrl || null,
      catalogLogoLandscape: catalogLogoLandscape || null,
      // La cantidad minima por nivel de precio se configura AHORA EN
      // CADA PRODUCTO (useAutoPriceByQty + priceMinQtys). El campo del
      // negocio ya no se escribe desde aca: el valor que tengan los
      // negocios antiguos se respeta tal cual (ver getCatalogMinQty).
      catalogShowAllPrices,
      catalogAllowTakeaway,
      catalogAllowDelivery,
      catalogGroupByCategory,
      catalogOnlyCarousels: catalogGroupByCategory ? catalogOnlyCarousels : false,
      businessHours,
    }, catalogEnabled
      ? (businessMode === 'restaurant' ? 'Carta digital configurada exitosamente' : 'Catálogo configurado exitosamente')
      : (businessMode === 'restaurant' ? 'Carta digital deshabilitada' : 'Catálogo deshabilitado'))
  }

  return (
    <div className="space-y-6 pb-20">
      {/* ===== CATÁLOGO ===== */}
      <>
          {/* Cabecera + interruptor, con el mismo lenguaje visual del resto
              del sistema: tarjeta neutra, sin bloques de color. */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">
                  {businessMode === 'restaurant' ? 'Carta digital' : 'Catálogo online'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                  {businessMode === 'restaurant'
                    ? 'Tus clientes ven el menú desde su celular y hacen pedidos directo a cocina. Ideal con un QR en cada mesa.'
                    : 'Tus clientes ven tus productos, arman su carrito y te hacen el pedido. Sin app ni registro.'}
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={catalogEnabled}
                  onChange={(e) => setCatalogEnabled(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  {catalogEnabled ? 'Activo' : 'Activar'}
                </span>
              </label>
            </div>
          </div>

          {/* Configuración del catálogo (solo si está habilitado) */}
          {catalogEnabled && (
            <>
              {/* Dos pestanas espejo de shopifree (CONFIGURACION y
                  APARIENCIA) + AVANZADO para lo que casi nadie toca. */}
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex gap-6 overflow-x-auto scrollbar-hide">
                  {[
                    { id: 'configuracion', label: 'Configuración' },
                    { id: 'apariencia', label: 'Apariencia' },
                    { id: 'avanzado', label: 'Avanzado' },
                  ].map(sub => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setCatalogTab(sub.id)}
                      className={`py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                        catalogTab === sub.id
                          ? 'border-primary-500 text-primary-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </nav>
              </div>

              {catalogTab === 'configuracion' && (
                <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Tu enlace</h3>
                      <p className="text-xs text-gray-500">La dirección de tu tienda y el código QR</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
{/* URL del catálogo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {businessMode === 'restaurant' ? 'URL de tu carta digital' : 'URL de tu catálogo'}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center bg-gray-100 rounded-lg overflow-hidden">
                        <span className="px-3 py-2.5 text-gray-500 text-sm bg-gray-200">
                          {resellerCustomDomain || 'cobrifyperu.com'}/{businessMode === 'restaurant' ? 'menu' : 'catalogo'}/
                        </span>
                        <input
                          type="text"
                          value={catalogSlug}
                          onChange={(e) => setCatalogSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                          placeholder={businessMode === 'restaurant' ? 'mi-restaurante' : 'mi-tienda'}
                          className="flex-1 px-3 py-2.5 bg-white border-0 focus:ring-2 focus:ring-primary-500 text-gray-900"
                        />
                      </div>
                      {catalogSlug && (
                        <button
                          type="button"
                          onClick={() => window.open(`${resellerCustomDomain ? `https://${resellerCustomDomain}` : PRODUCTION_URL}/${businessMode === 'restaurant' ? 'menu' : 'catalogo'}/${catalogSlug}`, '_blank')}
                          className="p-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-600 transition-colors"
                          title={businessMode === 'restaurant' ? 'Ver carta digital' : 'Ver catálogo'}
                        >
                          <ExternalLink className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {businessMode === 'restaurant'
                        ? 'Solo letras minúsculas, números y guiones. Ejemplo: mi-restaurante, la-buena-mesa'
                        : 'Solo letras minúsculas, números y guiones. Ejemplo: mi-tienda, ferreteria-lopez'}
                    </p>
                  </div>

{/* Vista previa del enlace */}
                  {catalogSlug && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 mb-1">
                            {businessMode === 'restaurant' ? 'Enlace de tu carta digital:' : 'Enlace de tu catálogo:'}
                          </p>
                          <p className="text-sm font-medium text-primary-600 truncate">
                            {resellerCustomDomain ? `https://${resellerCustomDomain}` : PRODUCTION_URL}/{businessMode === 'restaurant' ? 'menu' : 'catalogo'}/{catalogSlug}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${resellerCustomDomain ? `https://${resellerCustomDomain}` : PRODUCTION_URL}/${businessMode === 'restaurant' ? 'menu' : 'catalogo'}/${catalogSlug}`)
                            toast.success('Enlace copiado al portapapeles')
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                        >
                          <Copy className="w-4 h-4" />
                          Copiar
                        </button>
                      </div>
                    </div>
                  )}

{/* Código QR */}
                  {catalogSlug && catalogQrDataUrl && (
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex items-center gap-2 mb-3">
                        <QrCode className="w-5 h-5 text-primary-600" />
                        <h4 className="font-medium text-gray-900">
                          {businessMode === 'restaurant' ? 'Código QR de tu Carta Digital' : 'Código QR de tu Catálogo'}
                        </h4>
                      </div>
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="bg-white p-3 rounded-xl shadow-sm">
                          <img
                            src={catalogQrDataUrl}
                            alt={businessMode === 'restaurant' ? 'QR de carta digital' : 'QR del catálogo'}
                            className="w-40 h-40"
                          />
                        </div>
                        <div className="flex-1 text-center sm:text-left">
                          <p className="text-sm text-gray-600 mb-3">
                            Descarga este código QR para compartirlo en tu negocio, tarjetas de presentación, o redes sociales.
                          </p>
                          <button
                            onClick={async () => {
                              try {
                                const filename = `${businessMode === 'restaurant' ? 'menu' : 'catalogo'}-${catalogSlug}-qr.png`
                                await downloadDataUrl(catalogQrDataUrl, filename, {
                                  title: filename,
                                  dialogTitle: businessMode === 'restaurant' ? 'Guardar QR de la carta' : 'Guardar QR del catálogo'
                                })
                                toast.success('QR descargado exitosamente')
                              } catch (err) {
                                console.error('Error descargando QR:', err)
                                toast.error('No se pudo descargar el QR')
                              }
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                          >
                            <Download className="w-4 h-4" />
                            Descargar QR
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

{/* QR por Mesa — solo restaurantes */}
                  {businessMode === 'restaurant' && catalogSlug && (
                    <div className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-200">
                      <div className="border-t border-orange-200 pt-4 mt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <QrCode className="w-5 h-5 text-orange-600" />
                          <h5 className="font-medium text-gray-900">Códigos QR por Mesa</h5>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                          Genera códigos QR para cada mesa. Al escanear, el cliente verá la carta con su número de mesa pre-cargado.
                        </p>

                        {generatingTableQrs && (
                          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generando QRs de mesas...
                          </div>
                        )}

                        {!generatingTableQrs && tableQrCodes.length === 0 && (
                          <p className="text-sm text-gray-500 italic mb-4">
                            No hay mesas configuradas. Ve a la página de Mesas para crearlas.
                          </p>
                        )}

                        {tableQrCodes.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">{tableQrCodes.length} códigos generados</span>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    // Con varias sedes el nombre lleva la sucursal:
                                    // "mesa-5-qr.png" repetido no distingue cual imprimir.
                                    const files = tableQrCodes.map(qr => ({
                                      dataUrl: qr.dataUrl,
                                      filename: branches.length > 0
                                        ? `${slugSede(qr.branchName)}-mesa-${qr.table}-qr.png`
                                        : `mesa-${qr.table}-qr.png`
                                    }))
                                    const result = await saveFilesToDevice(files)
                                    if (result.nativeFolder) {
                                      toast.success(`${result.count} QRs guardados en ${result.nativeFolder}`)
                                    } else {
                                      toast.success('Descargando todos los QRs...')
                                    }
                                  } catch (err) {
                                    console.error('Error descargando QRs de mesas:', err)
                                    toast.error('No se pudieron descargar los QRs')
                                  }
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
                              >
                                <Download className="w-4 h-4" />
                                Descargar todos
                              </button>
                            </div>

                            <div className="max-h-96 overflow-y-auto p-2 bg-white rounded-lg space-y-4">
                              {(() => {
                                // Agrupado por sucursal: con dos locales, una grilla plana
                                // con "Mesa 5" repetida no dice cual QR va en cual local.
                                const grupos = []
                                const principal = tableQrCodes.filter(q => !q.branchId)
                                if (principal.length > 0) {
                                  grupos.push({ key: 'main', nombre: principal[0].branchName, qrs: principal })
                                }
                                branches.forEach(b => {
                                  const suyos = tableQrCodes.filter(q => q.branchId === b.id)
                                  if (suyos.length > 0) grupos.push({ key: b.id, nombre: b.name, qrs: suyos })
                                })

                                const tarjeta = (qr) => (
                                  <div key={qr.id} className="flex flex-col items-center p-2 border rounded-lg hover:border-orange-300 transition-colors">
                                    <img src={qr.dataUrl} alt={`${qr.zone ? `${qr.zone} - ` : ''}Mesa ${qr.table}`} className="w-24 h-24" />
                                    <span className="text-sm font-semibold text-gray-900 mt-1">
                                      {qr.zone ? `${qr.zone} - ` : ''}Mesa {qr.table}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          const filename = branches.length > 0
                                            ? `${slugSede(qr.branchName)}-mesa-${qr.table}-qr.png`
                                            : `mesa-${qr.table}-qr.png`
                                          await downloadDataUrl(qr.dataUrl, filename, {
                                            title: filename,
                                            dialogTitle: `Guardar QR de la mesa ${qr.table}`
                                          })
                                        } catch (err) {
                                          console.error('Error descargando QR de mesa:', err)
                                          toast.error('No se pudo descargar el QR')
                                        }
                                      }}
                                      className="mt-1 text-xs text-orange-600 hover:text-orange-700"
                                    >
                                      Descargar
                                    </button>
                                  </div>
                                )

                                // Sin sucursales configuradas no hay nada que agrupar.
                                if (branches.length === 0) {
                                  return (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                      {tableQrCodes.map(tarjeta)}
                                    </div>
                                  )
                                }

                                return grupos.map(g => (
                                  <div key={g.key}>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <Store className="w-3.5 h-3.5 text-gray-400" />
                                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate" title={g.nombre}>
                                        {g.nombre}
                                      </span>
                                      <span className="text-xs text-gray-400">({g.qrs.length})</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                      {g.qrs.map(tarjeta)}
                                    </div>
                                  </div>
                                ))
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Sobre tu tienda</h3>
                      <p className="text-xs text-gray-500">El mensaje de bienvenida y tu lema</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
{/* Mensaje de bienvenida */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Mensaje de bienvenida (opcional)
                    </label>
                    <input
                      type="text"
                      value={catalogWelcome}
                      onChange={(e) => setCatalogWelcome(e.target.value)}
                      placeholder="¡Bienvenido! Explora nuestros productos"
                      maxLength={100}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

{/* Tagline */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Eslogan o descripción corta (opcional)
                    </label>
                    <input
                      type="text"
                      value={catalogTagline}
                      onChange={(e) => setCatalogTagline(e.target.value)}
                      placeholder="Los mejores productos al mejor precio"
                      maxLength={60}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">{catalogTagline.length}/60 caracteres</p>
                  </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <ShoppingCart className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Recepción de pedidos</h3>
                      <p className="text-xs text-gray-500">Si tu catálogo recibe pedidos y de qué tipo</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
                  {/* Recepcion de pedidos: el flag ya lo respeta el carrito
                      (catalogOnlineOrders !== false), pero no tenia
                      interruptor — shopifree si lo expone. */}
                  <label className="flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                    <div className="flex-1 pr-3">
                      <span className="text-sm font-medium text-gray-900 block">Recibir pedidos desde el catálogo</span>
                      <span className="text-xs text-gray-500">Si lo apagas, tu catálogo queda como vitrina: los clientes ven productos y precios, pero el carrito solo escribe por WhatsApp.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={catalogOnlineOrders}
                      onChange={(e) => setCatalogOnlineOrders(e.target.checked)}
                      className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                  </label>

{/* Tipos de pedido en menú digital (solo restaurante) */}
                  {businessMode === 'restaurant' && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">Tipos de pedido en carta digital</p>
                      <label className="flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900 block">Permitir pedidos Para Llevar</span>
                          <span className="text-xs text-gray-500">Los clientes pueden hacer pedidos para recoger desde la carta digital</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={catalogAllowTakeaway}
                          onChange={(e) => setCatalogAllowTakeaway(e.target.checked)}
                          className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900 block">Permitir pedidos Delivery</span>
                          <span className="text-xs text-gray-500">Los clientes pueden hacer pedidos con delivery desde la carta digital</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={catalogAllowDelivery}
                          onChange={(e) => setCatalogAllowDelivery(e.target.checked)}
                          className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      </label>
                    </div>
                  )}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <Bike className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Entrega y envío</h3>
                      <p className="text-xs text-gray-500">Cómo le llega el pedido a tu cliente</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
                  {/* Costos de envío: existe en shopifree, en Cobrify todavia no.
                      Se muestra DESHABILITADO y etiquetado para que nadie
                      lo configure creyendo que ya funciona. */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Costos de envío</label>
                    <p className="text-xs text-gray-500 mb-2">Cobrar el delivery según la zona del cliente. Por ahora el costo se coordina por WhatsApp.</p>
                    <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-500">Costo de envío fijo</p>
                        <p className="text-xs text-gray-400">Un monto único para todos los pedidos</p>
                      </div>
                      <span className="text-[11px] font-medium text-gray-400 border border-gray-300 rounded-full px-2 py-0.5 flex-shrink-0">Próximamente</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-500">Envío gratis desde un monto</p>
                        <p className="text-xs text-gray-400">Ej: gratis en compras sobre S/ 100</p>
                      </div>
                      <span className="text-[11px] font-medium text-gray-400 border border-gray-300 rounded-full px-2 py-0.5 flex-shrink-0">Próximamente</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-500">Cobertura por distritos</p>
                        <p className="text-xs text-gray-400">Elegir a qué distritos llegas</p>
                      </div>
                      <span className="text-[11px] font-medium text-gray-400 border border-gray-300 rounded-full px-2 py-0.5 flex-shrink-0">Próximamente</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-500">Costos por zona</p>
                        <p className="text-xs text-gray-400">Un precio distinto por departamento, provincia o distrito</p>
                      </div>
                      <span className="text-[11px] font-medium text-gray-400 border border-gray-300 rounded-full px-2 py-0.5 flex-shrink-0">Próximamente</span>
                    </div>
                    </div>
                  </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Qué se muestra</h3>
                      <p className="text-xs text-gray-500">Precios, stock y qué productos aparecen</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
                  <div className="space-y-3">
                    <label className="flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 block">Mostrar precios</span>
                        <span className="text-xs text-gray-500">Si desactivas esta opción, los productos se mostrarán sin precio</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={catalogShowPrices}
                        onChange={(e) => setCatalogShowPrices(e.target.checked)}
                        className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 block">Ignorar stock en catálogo</span>
                        <span className="text-xs text-gray-500">Los productos nunca se mostrarán como "Agotado". Ideal para negocios que trabajan bajo pedido</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={catalogIgnoreStock}
                        onChange={(e) => setCatalogIgnoreStock(e.target.checked)}
                        className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 block">Ocultar productos sin stock</span>
                        <span className="text-xs text-gray-500">Los productos sin stock no aparecerán en el catálogo (en vez de mostrarse como "Agotado"). Útil si no quieres que los clientes los vean.</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={catalogHideOutOfStock}
                        onChange={(e) => setCatalogHideOutOfStock(e.target.checked)}
                        className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </label>
                    <label className={`flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors ${catalogIgnoreStock ? 'opacity-50' : ''}`}>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 block">Mostrar stock disponible</span>
                        <span className="text-xs text-gray-500">Muestra las unidades disponibles de cada producto en el catálogo y limita la cantidad que el cliente puede pedir a lo que hay en stock. {catalogIgnoreStock && '(Se ignora cuando "Ignorar stock en catálogo" está activo)'}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={catalogShowStock}
                        onChange={(e) => setCatalogShowStock(e.target.checked)}
                        disabled={catalogIgnoreStock}
                        className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </label>
                  </div>

                  {/* Mayorista es configuracion avanzada: plegada para que
                      no se mezcle con los toggles del dia a dia. */}
                  <details className="border border-gray-200 rounded-lg">
                    <summary className="px-3 py-3 text-sm font-medium text-gray-900 cursor-pointer select-none hover:bg-gray-50">
                      Precios mayoristas <span className="text-gray-400 font-normal">(avanzado)</span>
                    </summary>
                    <div className="px-3 pb-3 space-y-4">
                    <label className="flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 block">Mostrar todos los precios en catálogo</span>
                        <span className="text-xs text-gray-500">Muestra precio público, mayorista, etc. en la tarjeta del producto. Si desactivas, solo se mostrará el precio público</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={catalogShowAllPrices}
                        onChange={(e) => setCatalogShowAllPrices(e.target.checked)}
                        className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </label>

                    </div>
                  </details>

{/* Productos en el catálogo */}
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-900">¿Cómo agrego productos al catálogo?</h4>
                        <p className="text-sm text-blue-700 mt-1">
                          Ve a <strong>Productos</strong>, edita un producto y activa la opción <strong>"Mostrar en catálogo"</strong>. Solo los productos con esta opción activada aparecerán en tu catálogo público.
                        </p>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <MessageCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Contacto y horario</h3>
                      <p className="text-xs text-gray-500">WhatsApp, redes sociales y horario de atención</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
{/* WhatsApp del catálogo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      WhatsApp para pedidos del catálogo
                    </label>
                    <input
                      type="text"
                      value={catalogWhatsapp}
                      onChange={(e) => setCatalogWhatsapp(e.target.value.replace(/[^\d+]/g, ''))}
                      placeholder="Ej: 51987654321"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Número con código de país (ej: 51 para Perú). Si se deja vacío se usará el teléfono de la empresa.
                    </p>
                  </div>

{/* Redes sociales (footer "Síguenos" del catálogo) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Redes sociales
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Aparecen como botones al pie de tu catálogo, en la sección "Síguenos". Escribe el usuario (ej: mitienda) o pega el enlace completo. Deja vacío lo que no uses.
                    </p>
                    <div className="space-y-2 max-w-md">
                      {[
                        { key: 'instagram', label: 'Instagram' },
                        { key: 'facebook', label: 'Facebook' },
                        { key: 'tiktok', label: 'TikTok' },
                      ].map(red => (
                        <div key={red.key} className="flex items-center gap-2">
                          <span className="w-24 text-sm text-gray-600 flex-shrink-0">{red.label}</span>
                          <input
                            type="text"
                            value={catalogSocial[red.key] || ''}
                            onChange={(e) => setCatalogSocial(prev => ({ ...prev, [red.key]: e.target.value.trim() }))}
                            placeholder={red.key === 'tiktok' ? '@mitienda' : 'mitienda'}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

{/* Horario de atención */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Horario de atención
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={businessHours.enabled}
                          onChange={(e) => setBusinessHours(prev => ({ ...prev, enabled: e.target.checked }))}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-600">Activar</span>
                      </label>
                    </div>
                    {businessHours.enabled && (
                      <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                        {[
                          { key: 1, name: 'Lunes' },
                          { key: 2, name: 'Martes' },
                          { key: 3, name: 'Miércoles' },
                          { key: 4, name: 'Jueves' },
                          { key: 5, name: 'Viernes' },
                          { key: 6, name: 'Sábado' },
                          { key: 0, name: 'Domingo' },
                        ].map(day => (
                          <div key={day.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <label className="flex items-center gap-2 w-24 sm:w-28 flex-shrink-0">
                              <input
                                type="checkbox"
                                checked={businessHours.days[day.key]?.open || false}
                                onChange={(e) => setBusinessHours(prev => ({
                                  ...prev,
                                  days: { ...prev.days, [day.key]: { ...prev.days[day.key], open: e.target.checked } }
                                }))}
                                className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                              />
                              <span className={`text-sm ${businessHours.days[day.key]?.open ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                                {day.name}
                              </span>
                            </label>
                            {businessHours.days[day.key]?.open && (
                              <div className="flex items-center gap-1">
                                <input
                                  type="time"
                                  value={businessHours.days[day.key]?.from || '09:00'}
                                  onChange={(e) => setBusinessHours(prev => ({
                                    ...prev,
                                    days: { ...prev.days, [day.key]: { ...prev.days[day.key], from: e.target.value } }
                                  }))}
                                  className="px-1.5 sm:px-2 py-1 border border-gray-300 rounded text-xs sm:text-sm w-[6.5rem] sm:w-auto"
                                />
                                <span className="text-gray-400 text-xs sm:text-sm">a</span>
                                <input
                                  type="time"
                                  value={businessHours.days[day.key]?.to || '18:00'}
                                  onChange={(e) => setBusinessHours(prev => ({
                                    ...prev,
                                    days: { ...prev.days, [day.key]: { ...prev.days[day.key], to: e.target.value } }
                                  }))}
                                  className="px-1.5 sm:px-2 py-1 border border-gray-300 rounded text-xs sm:text-sm w-[6.5rem] sm:w-auto"
                                />
                              </div>
                            )}
                            {!businessHours.days[day.key]?.open && (
                              <span className="text-xs text-red-400">Cerrado</span>
                            )}
                          </div>
                        ))}
                        <p className="text-xs text-gray-500 mt-2">Se muestra en el catálogo y bloquea pedidos fuera de horario</p>
                      </div>
                    )}
                  </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Cuentas de clientes</h3>
                      <p className="text-xs text-gray-500">Deja que tus compradores se registren</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
                  <div className="space-y-3">
                    <label className="flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 block">Permitir cuentas de clientes</span>
                        <span className="text-xs text-gray-500">Tus clientes pueden crear una cuenta con Google o correo para ver su historial de pedidos y guardar sus direcciones (el checkout se autocompleta). Siempre es opcional: quien no quiera registrarse compra igual.</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={catalogCustomerAccounts}
                        onChange={(e) => setCatalogCustomerAccounts(e.target.checked)}
                        className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </label>
                  </div>
                  </div>
                </div>
                </div>
              )}

              {catalogTab === 'apariencia' && (
                <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <Palette className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Tema y color</h3>
                      <p className="text-xs text-gray-500">El estilo general de tu tienda</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
{/* Tema del catálogo — galería estilo shopifree: cada tarjeta muestra
      una MINIATURA de la tienda pintada con los tokens del propio tema
      (ThemeThumb), no un archivo de imagen: si el tema cambia, la
      miniatura cambia sola. Los temas viven en src/themes/catalogThemes.js */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Tema visual
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      Cambia colores, tipografía y forma de las tarjetas. La miniatura ya usa tu color; toca "Vista previa" para verlo con tus productos.
                    </p>

                    {(() => {
                    const TEMAS_VISIBLES = 6
                    const listaTemas = getCatalogThemesList()
                    const hayDeMas = listaTemas.length > TEMAS_VISIBLES
                    const iActual = listaTemas.findIndex(t => t.id === catalogTheme)
                    // Si el tema aplicado quedo fuera del corte, ocupa el
                    // ultimo lugar visible: nadie deberia tener que abrir
                    // "Ver mas" para saber cual esta usando.
                    const temasMostrados = (!hayDeMas || temasExpandidos)
                      ? listaTemas
                      : (iActual >= TEMAS_VISIBLES
                        ? [...listaTemas.slice(0, TEMAS_VISIBLES - 1), listaTemas[iActual]]
                        : listaTemas.slice(0, TEMAS_VISIBLES))
                    return (
                    <>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
                      {temasMostrados.map((theme) => {
                        const isSelected = catalogTheme === theme.id
                        return (
                          <div
                            key={theme.id}
                            className={`group relative rounded-xl overflow-hidden transition-all ${
                              isSelected
                                ? 'ring-2 ring-primary-500 ring-offset-1 border border-primary-500'
                                : 'border border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setCatalogTheme(theme.id)}
                              className="block w-full text-left"
                              title={theme.description}
                            >
                              <div
                                className="relative overflow-hidden"
                                style={{
                                  aspectRatio: `${THUMB_W} / ${THUMB_H}`,
                                }}
                              >
                                <ThemeThumb
                                  themeId={theme.id}
                                  colorNegocio={catalogColor}
                                  nombre={businessSettings?.name || businessSettings?.businessName || 'Tu tienda'}
                                  logoUrl={catalogLogoUrl || logoUrl || ''}
                                  portadaUrl={catalogCoverImage || (catalogHero?.slides || []).find(sl => sl?.imageUrl)?.imageUrl || ''}
                                  fotos={fotosMiniatura || []}
                                />
                                {/* Velo con "Vista previa" al pasar el mouse */}
                                <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => { e.stopPropagation(); setPreviewThemeId(theme.id) }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setPreviewThemeId(theme.id) } }}
                                    className="px-3 py-1.5 bg-white rounded-lg text-xs font-semibold text-gray-900 hover:bg-gray-50 cursor-pointer flex items-center gap-1.5"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    Vista previa
                                  </span>
                                </span>
                              </div>
                              <div className="px-2 py-1.5 bg-white border-t border-gray-200/70">
                                <p className="text-[11px] font-semibold text-gray-900 truncate">{theme.name}</p>
                              </div>
                            </button>

                            {theme.isNew && !isSelected && (
                              <span className="absolute top-1.5 left-1.5 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-gray-900/80 text-white rounded">
                                Nuevo
                              </span>
                            )}
                            {isSelected && (
                              <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white bg-primary-600 shadow">
                                En uso
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {hayDeMas && (
                      <button
                        type="button"
                        onClick={() => setTemasExpandidos(v => !v)}
                        className="mt-3 w-full py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        {temasExpandidos
                          ? 'Ver menos'
                          : `Ver ${listaTemas.length - TEMAS_VISIBLES} tema${listaTemas.length - TEMAS_VISIBLES === 1 ? '' : 's'} más`}
                      </button>
                    )}
                    </>
                    )
                    })()}
                  </div>

{/* Color */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Color principal del catálogo
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { color: '#10B981', name: 'Esmeralda' },
                        { color: '#3B82F6', name: 'Azul' },
                        { color: '#8B5CF6', name: 'Violeta' },
                        { color: '#F59E0B', name: 'Ámbar' },
                        { color: '#EF4444', name: 'Rojo' },
                        { color: '#EC4899', name: 'Rosa' },
                        { color: '#14B8A6', name: 'Teal' },
                        { color: '#1F2937', name: 'Oscuro' },
                      ].map((option) => (
                        <button
                          key={option.color}
                          type="button"
                          onClick={() => setCatalogColor(option.color)}
                          className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                            catalogColor === option.color
                              ? 'border-gray-900 shadow-md'
                              : 'border-transparent hover:border-gray-300'
                          }`}
                        >
                          <div
                            className="w-10 h-10 rounded-full shadow-sm flex items-center justify-center"
                            style={{ backgroundColor: option.color }}
                          >
                            {catalogColor === option.color && (
                              <Check className="w-5 h-5 text-white" />
                            )}
                          </div>
                          <span className="text-xs text-gray-600">{option.name}</span>
                        </button>
                      ))}
                      <div className="flex flex-col items-center gap-1 p-2">
                        <input
                          type="color"
                          value={catalogColor}
                          onChange={(e) => setCatalogColor(e.target.value)}
                          onInput={(e) => setCatalogColor(e.target.value)}
                          onBlur={(e) => setCatalogColor(e.target.value)}
                          className="w-10 h-10 rounded-full cursor-pointer border-2 border-gray-300"
                        />
                        <span className="text-xs text-gray-600">Otro</span>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <Image className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Logo</h3>
                      <p className="text-xs text-gray-500">Tu logo cuadrado y el horizontal</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
{/* Logo del catálogo — cuadrado + horizontal. La foto es el control:
      se toca para cambiar, se arrastra para subir y la X (al pasar el
      mouse) la quita. Antes eran dos botones por logo y una miniatura
      de 80px que no dejaba ver nada. */}
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500">
                      Recomendado: PNG con fondo transparente. Toca la imagen para cambiarla o arrastra una encima. Se optimizan solas.
                    </p>

                    <div className="flex flex-wrap gap-8">
                      {/* Logo cuadrado */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-800">Logo cuadrado</p>
                        <ImageDropZone
                          value={catalogLogoUrl || logoUrl || ''}
                          uploading={uploadingCatalogLogo}
                          className="w-36 h-36"
                          label="Toca o arrastra tu logo"
                          hint="Se muestra junto al nombre del negocio en el header."
                          onClear={() => { setCatalogLogoUrl(''); toast.success('Logo cuadrado quitado') }}
                          onFile={async (file) => {
                            setUploadingCatalogLogo(true)
                            try {
                              const url = await uploadImage(await compressForLogoSquare(file), { folder: 'cobrify/branding', businessId: getBusinessId() })
                              setCatalogLogoUrl(url)
                              toast.success('Logo cuadrado subido')
                            } catch (err) {
                              console.error('Error subiendo logo cuadrado:', err)
                              toast.error('Error al subir el logo')
                            } finally {
                              setUploadingCatalogLogo(false)
                            }
                          }}
                        />
                      </div>

                      {/* Logo horizontal (opcional) */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-800">
                          Logo horizontal <span className="text-xs font-normal text-gray-500">(opcional)</span>
                        </p>
                        <ImageDropZone
                          value={catalogLogoLandscape}
                          uploading={uploadingCatalogLogoLandscape}
                          className="w-64 h-36"
                          label="Toca o arrastra tu logo horizontal"
                          hint="Si lo subes, reemplaza al cuadrado y oculta el nombre del negocio en el header."
                          onClear={() => { setCatalogLogoLandscape(''); toast.success('Logo horizontal quitado') }}
                          onFile={async (file) => {
                            setUploadingCatalogLogoLandscape(true)
                            try {
                              const url = await uploadImage(await compressForLogoLandscape(file), { folder: 'cobrify/branding', businessId: getBusinessId() })
                              setCatalogLogoLandscape(url)
                              toast.success('Logo horizontal subido')
                            } catch (err) {
                              console.error('Error subiendo logo horizontal:', err)
                              toast.error('Error al subir el logo')
                            } finally {
                              setUploadingCatalogLogoLandscape(false)
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <Image className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Portada</h3>
                      <p className="text-xs text-gray-500">La imagen grande de la cabecera</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
{/* Imagen de portada — desktop + móvil. Mismo control que el logo:
      tocar para cambiar, arrastrar para subir, X para quitar. */}
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">
                      Se muestra como fondo en la cabecera del catálogo. Toca la imagen para cambiarla o arrastra una encima.
                    </p>

                    <div className="flex flex-wrap gap-6">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-800">
                          Escritorio <span className="text-xs font-normal text-gray-500">(1920×600)</span>
                        </p>
                        <ImageDropZone
                          value={catalogCoverImage}
                          uploading={uploadingCover}
                          className="w-80 h-28"
                          objectFit="cover"
                          label="Toca o arrastra tu portada"
                          onClear={() => { setCatalogCoverImage(''); toast.success('Portada de escritorio quitada') }}
                          onFile={async (file) => {
                            setUploadingCover(true)
                            try {
                              const url = await uploadImage(await compressForCoverDesktop(file), { folder: 'cobrify/branding', businessId: getBusinessId() })
                              setCatalogCoverImage(url)
                              toast.success('Portada de escritorio subida')
                            } catch (err) {
                              console.error('Error uploading cover desktop:', err)
                              toast.error('Error al subir imagen')
                            } finally {
                              setUploadingCover(false)
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-800">
                          Móvil <span className="text-xs font-normal text-gray-500">(opcional)</span>
                        </p>
                        <ImageDropZone
                          value={catalogCoverImageMobile}
                          uploading={uploadingCoverMobile}
                          className="w-44 h-28"
                          objectFit="cover"
                          label="Toca o arrastra"
                          hint="Si no la subes, en móvil se usa la de escritorio."
                          onClear={() => { setCatalogCoverImageMobile(''); toast.success('Portada móvil quitada') }}
                          onFile={async (file) => {
                            setUploadingCoverMobile(true)
                            try {
                              const url = await uploadImage(await compressForCoverMobile(file), { folder: 'cobrify/branding', businessId: getBusinessId() })
                              setCatalogCoverImageMobile(url)
                              toast.success('Portada móvil subida')
                            } catch (err) {
                              console.error('Error uploading cover mobile:', err)
                              toast.error('Error al subir imagen')
                            } finally {
                              setUploadingCoverMobile(false)
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

{/* Carrusel de portada (F2.2): reemplaza la portada única
                      con slides promocionales (imagen + texto + enlace) */}
                  <div className="p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900">Carrusel de portada</span>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Varios banners rotando automáticamente (promociones, novedades). Si está activo, reemplaza la imagen de portada.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCatalogHero(prev => ({ ...prev, enabled: !prev.enabled }))}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                          catalogHero.enabled ? 'bg-primary-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          catalogHero.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    {catalogHero.enabled && (
                      <div className="space-y-3">
                        {(catalogHero.slides || []).map((slide, idx) => (
                          <div key={slide.id || idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                            <div className="flex items-start gap-3">
                              {/* Imagen del slide: mismo control que el logo
                                  y la portada (tocar, arrastrar, X) */}
                              <div className="flex-shrink-0">
                                <ImageDropZone
                                  value={slide.imageUrl || ''}
                                  uploading={uploadingHeroSlide === idx}
                                  disabled={uploadingHeroSlide !== null && uploadingHeroSlide !== idx}
                                  className="w-36 h-20"
                                  objectFit="cover"
                                  label="Toca o arrastra (1920×600)"
                                  onClear={() => setCatalogHero(prev => ({
                                    ...prev,
                                    slides: prev.slides.map((sl, i) => i === idx ? { ...sl, imageUrl: '' } : sl),
                                  }))}
                                  onFile={async (file) => {
                                    setUploadingHeroSlide(idx)
                                    try {
                                      const url = await uploadImage(await compressForCoverDesktop(file), { folder: 'cobrify/branding', businessId: getBusinessId() })
                                      setCatalogHero(prev => ({
                                        ...prev,
                                        slides: prev.slides.map((sl, i) => i === idx ? { ...sl, imageUrl: url } : sl),
                                      }))
                                      toast.success('Imagen del slide subida')
                                    } catch (err) {
                                      console.error('Error subiendo slide:', err)
                                      toast.error('Error al subir imagen')
                                    } finally {
                                      setUploadingHeroSlide(null)
                                    }
                                  }}
                                />
                              </div>
                              {/* Textos del slide */}
                              <div className="flex-1 space-y-1.5 min-w-0">
                                <input
                                  type="text"
                                  value={slide.title || ''}
                                  onChange={(e) => setCatalogHero(prev => ({ ...prev, slides: prev.slides.map((s, i) => i === idx ? { ...s, title: e.target.value } : s) }))}
                                  placeholder="Título (opcional)"
                                  maxLength={60}
                                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500"
                                />
                                <input
                                  type="text"
                                  value={slide.subtitle || ''}
                                  onChange={(e) => setCatalogHero(prev => ({ ...prev, slides: prev.slides.map((s, i) => i === idx ? { ...s, subtitle: e.target.value } : s) }))}
                                  placeholder="Subtítulo (opcional)"
                                  maxLength={90}
                                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500"
                                />
                                <input
                                  type="url"
                                  value={slide.link || ''}
                                  onChange={(e) => setCatalogHero(prev => ({ ...prev, slides: prev.slides.map((s, i) => i === idx ? { ...s, link: e.target.value } : s) }))}
                                  placeholder="Enlace al tocar el slide (opcional, ej: https://...)"
                                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500"
                                />
                              </div>
                              {/* Acciones: subir/bajar/eliminar */}
                              <div className="flex flex-col gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => setCatalogHero(prev => {
                                    const slides = [...prev.slides]
                                    ;[slides[idx - 1], slides[idx]] = [slides[idx], slides[idx - 1]]
                                    return { ...prev, slides }
                                  })}
                                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                                  title="Subir"
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === (catalogHero.slides.length - 1)}
                                  onClick={() => setCatalogHero(prev => {
                                    const slides = [...prev.slides]
                                    ;[slides[idx], slides[idx + 1]] = [slides[idx + 1], slides[idx]]
                                    return { ...prev, slides }
                                  })}
                                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                                  title="Bajar"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCatalogHero(prev => ({ ...prev, slides: prev.slides.filter((_, i) => i !== idx) }))}
                                  className="p-1 text-red-400 hover:text-red-600"
                                  title="Eliminar slide"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}

                        {(catalogHero.slides || []).length < 5 && (
                          <button
                            type="button"
                            onClick={() => setCatalogHero(prev => ({
                              ...prev,
                              slides: [...(prev.slides || []), { id: `slide-${Date.now()}`, imageUrl: '', title: '', subtitle: '', link: '' }],
                            }))}
                            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                          >
                            + Agregar slide ({(catalogHero.slides || []).length}/5)
                          </button>
                        )}
                        <p className="text-[11px] text-gray-500">
                          Los slides rotan cada 5 segundos. Recomendado 1920×600 (mismo formato que la portada). Los slides sin imagen no se muestran.
                        </p>
                      </div>
                    )}
                  </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <LayoutGrid className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Diseño de los productos</h3>
                      <p className="text-xs text-gray-500">Cómo se ve y se recorre tu catálogo</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
{/* Diseño de los productos (set de shopifree: incluye 'sections',
      que reemplaza a los dos checkboxes de agrupar por categoria) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Diseño de los productos
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      Cómo se muestran los productos en tu tienda. El visitante igual puede alternar entre grilla y lista.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { id: 'grid', label: 'Cuadrícula', desc: 'Clásico en columnas' },
                        { id: 'masonry', label: 'Mosaico', desc: 'Alturas naturales' },
                        { id: 'magazine', label: 'Magazine', desc: 'Producto destacado' },
                        { id: 'list', label: 'Lista', desc: 'Filas horizontales' },
                        { id: 'sections', label: 'Secciones por categoría', desc: 'Cada categoría con su título y sus productos, estilo carta' },
                        { id: 'sections-grid', label: 'Agrupado por categoría', desc: 'Cada categoría con todos sus productos en grilla, sin carrusel' },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setCatalogLayout(opt.id)
                            // El flag viejo sigue existiendo (40 tiendas lo tenian):
                            // se sincroniza con el selector para que nadie elija
                            // "Cuadricula" y siga viendo secciones.
                            const esSecciones = opt.id === 'sections' || opt.id === 'sections-grid'
                            setCatalogGroupByCategory(esSecciones)
                            // El flag viejo de "solo carruseles" solo aplica al
                            // diseño CON carrusel: en grilla no hay carrusel que
                            // ocultar y la lista final ya se omite sola.
                            if (opt.id !== 'sections') setCatalogOnlyCarousels(false)
                          }}
                          className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                            catalogLayout === opt.id
                              ? 'border-primary-500 bg-primary-50/60'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {catalogLayout === opt.id && (
                            <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </span>
                          )}
                          {/* Mini-mockup del diseño */}
                          <div className="h-12 mb-2 flex items-center gap-1">
                            {opt.id === 'grid' && (
                              <div className="grid grid-cols-2 gap-1 w-12">
                                {[0, 1, 2, 3].map(k => <div key={k} className="bg-gray-300 rounded-sm aspect-square" />)}
                              </div>
                            )}
                            {opt.id === 'masonry' && (
                              <>
                                <div className="flex flex-col gap-1 w-4"><div className="bg-gray-300 rounded-sm h-6" /><div className="bg-gray-300 rounded-sm h-3" /></div>
                                <div className="flex flex-col gap-1 w-4"><div className="bg-gray-300 rounded-sm h-3" /><div className="bg-gray-300 rounded-sm h-6" /></div>
                                <div className="flex flex-col gap-1 w-4"><div className="bg-gray-300 rounded-sm h-5" /><div className="bg-gray-300 rounded-sm h-4" /></div>
                              </>
                            )}
                            {opt.id === 'magazine' && (
                              <div className="flex gap-1">
                                <div className="bg-gray-300 rounded-sm w-8 h-8" />
                                <div className="flex flex-col gap-1"><div className="bg-gray-300 rounded-sm w-3.5 h-3.5" /><div className="bg-gray-300 rounded-sm w-3.5 h-3.5" /></div>
                              </div>
                            )}
                            {opt.id === 'list' && (
                              <div className="flex flex-col gap-1 w-12">
                                {[0, 1, 2].map(k => (
                                  <div key={k} className="flex items-center gap-1">
                                    <div className="bg-gray-300 rounded-sm w-3 h-3" />
                                    <div className="bg-gray-200 rounded-sm h-1.5 flex-1" />
                                  </div>
                                ))}
                              </div>
                            )}
                            {opt.id === 'sections' && (
                              <div className="flex flex-col gap-1.5 w-14">
                                {[0, 1].map(k => (
                                  <div key={k} className="space-y-0.5">
                                    <div className="bg-gray-400 rounded-sm h-1 w-6" />
                                    <div className="flex gap-1">
                                      <div className="bg-gray-300 rounded-sm w-3.5 h-3.5" />
                                      <div className="bg-gray-300 rounded-sm w-3.5 h-3.5" />
                                      <div className="bg-gray-300 rounded-sm w-3.5 h-3.5 opacity-50" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {opt.id === 'sections-grid' && (
                              <div className="flex flex-col gap-1.5 w-14">
                                {[0, 1].map(k => (
                                  <div key={k} className="space-y-0.5">
                                    <div className="bg-gray-400 rounded-sm h-1 w-6" />
                                    <div className="grid grid-cols-4 gap-0.5">
                                      {[0, 1, 2, 3, 4, 5, 6, 7].map(j => <div key={j} className="bg-gray-300 rounded-sm aspect-square" />)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
{/* Paginación de productos (port shopifree) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Paginación de productos
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      Elige cómo se cargan los productos cuando hay muchos.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { id: 'none', label: 'Sin paginación', desc: 'Muestra todos los productos', Icon: LayoutGrid },
                        { id: 'load-more', label: 'Cargar más', desc: 'Botón para cargar más', Icon: ArrowDown },
                        { id: 'infinite', label: 'Scroll infinito', desc: 'Carga automática al scroll', Icon: Clock },
                        { id: 'pages', label: 'Páginas', desc: 'Navegación numerada', Icon: ChevronsUpDown },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setCatalogPagination(opt.id)}
                          className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                            catalogPagination === opt.id
                              ? 'border-primary-500 bg-primary-50/60'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {catalogPagination === opt.id && (
                            <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 text-white" />
                            </span>
                          )}
                          <opt.Icon className="w-5 h-5 text-gray-400 mb-2" />
                          <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                    {catalogPagination === 'none' && (
                      <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mt-2">
                        Con catálogos grandes (cientos de productos), "Sin paginación" puede hacer lenta la primera carga.
                      </p>
                    )}
                  </div>

{/* Navegación en escritorio: barra superior vs menú lateral */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Navegación en computadora
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      Dónde se muestran las categorías cuando el cliente entra desde una computadora. En celular siempre van arriba.
                    </p>
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      {[
                        { id: 'top', label: 'Barra superior', desc: 'Categorías arriba, a lo ancho' },
                        { id: 'sidebar', label: 'Menú lateral', desc: 'Categorías fijas a la izquierda' },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setCatalogDesktopNav(opt.id)}
                          className={`p-3 rounded-xl border-2 transition-all text-center ${
                            catalogDesktopNav === opt.id
                              ? 'border-primary-500 bg-primary-50/60'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {/* Mini-mockup */}
                          <div className="h-14 mb-2 flex items-center justify-center">
                            {opt.id === 'top' ? (
                              <div className="w-16 flex flex-col gap-1">
                                <div className="flex gap-1">
                                  <div className="bg-gray-400 rounded-sm h-2 flex-1" />
                                  <div className="bg-gray-300 rounded-sm h-2 flex-1" />
                                  <div className="bg-gray-300 rounded-sm h-2 flex-1" />
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                  <div className="bg-gray-200 rounded-sm aspect-square" />
                                  <div className="bg-gray-200 rounded-sm aspect-square" />
                                  <div className="bg-gray-200 rounded-sm aspect-square" />
                                </div>
                              </div>
                            ) : (
                              <div className="w-16 flex gap-1">
                                <div className="flex flex-col gap-1 w-4">
                                  <div className="bg-gray-400 rounded-sm h-1.5" />
                                  <div className="bg-gray-300 rounded-sm h-1.5" />
                                  <div className="bg-gray-300 rounded-sm h-1.5" />
                                  <div className="bg-gray-300 rounded-sm h-1.5" />
                                </div>
                                <div className="grid grid-cols-2 gap-1 flex-1">
                                  <div className="bg-gray-200 rounded-sm aspect-square" />
                                  <div className="bg-gray-200 rounded-sm aspect-square" />
                                  <div className="bg-gray-200 rounded-sm aspect-square" />
                                  <div className="bg-gray-200 rounded-sm aspect-square" />
                                </div>
                              </div>
                            )}
                          </div>
                          <span className="block text-xs font-semibold text-gray-800">{opt.label}</span>
                          <span className="block text-[10px] text-gray-500">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

{/* Buscador: lupa (por defecto) o barra siempre a la vista */}
                  <div className="p-4 border border-gray-200 rounded-lg space-y-2.5">
                    <span className="text-sm font-medium text-gray-900">Buscador</span>
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-sm text-gray-700">
                        Barra de búsqueda siempre visible
                        <span className="block text-xs text-gray-500">
                          En vez de la lupa, una barra a la vista que va filtrando los productos mientras el cliente escribe.
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setCatalogSearchBar(v => !v)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${catalogSearchBar ? 'bg-primary-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${catalogSearchBar ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </label>
                  </div>

{/* Efectos del catálogo (F2.7) */}
                  <div className="p-4 border border-gray-200 rounded-lg space-y-2.5">
                    <span className="text-sm font-medium text-gray-900">Efectos</span>
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-sm text-gray-700">
                        Aparición al hacer scroll
                        <span className="block text-xs text-gray-500">Los productos se deslizan suavemente al aparecer.</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setCatalogEffects(prev => ({ ...prev, scrollReveal: !prev.scrollReveal }))}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${catalogEffects.scrollReveal ? 'bg-primary-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${catalogEffects.scrollReveal ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-sm text-gray-700">
                        Segunda foto al pasar el mouse
                        <span className="block text-xs text-gray-500">En productos con 2+ imágenes, muestra la segunda al hover.</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setCatalogEffects(prev => ({ ...prev, imageSwapOnHover: !prev.imageSwapOnHover }))}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${catalogEffects.imageSwapOnHover ? 'bg-primary-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${catalogEffects.imageSwapOnHover ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </label>
                  </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <Bell className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Promociones y conversión</h3>
                      <p className="text-xs text-gray-500">Anuncios, ofertas, sellos y avisos</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
                  {/* Cada promocion sale en un lugar distinto de la tienda:
                      sin este mapa nadie sabe cual es cual. */}
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 leading-relaxed">
                    El <strong className="text-gray-900">anuncio</strong> es la tira de color arriba de todo, la <strong className="text-gray-900">oferta flash</strong> es la barra con cuenta regresiva,
                    los <strong className="text-gray-900">sellos</strong> van debajo de la portada y las <strong className="text-gray-900">observaciones</strong> al pie, antes de los productos. Deja vacío lo que no uses.
                  </div>

{/* Tira publicitaria (banner superior del catálogo) */}
                  <div className="p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900">Tira publicitaria</span>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Banner en la parte superior del catálogo para promociones o avisos (ej: "Envío gratis desde S/ 100").
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCatalogAnnouncement(prev => ({ ...prev, enabled: !prev.enabled }))}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                          catalogAnnouncement.enabled ? 'bg-primary-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          catalogAnnouncement.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                    {catalogAnnouncement.enabled && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={catalogAnnouncement.text}
                          onChange={(e) => setCatalogAnnouncement(prev => ({ ...prev, text: e.target.value }))}
                          placeholder="Ej: Envío gratis en pedidos desde S/ 100"
                          maxLength={120}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setCatalogAnnouncement(prev => ({ ...prev, mode: 'static' }))}
                              className={`px-3 py-1.5 text-sm font-medium ${
                                catalogAnnouncement.mode !== 'marquee' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              Fija
                            </button>
                            <button
                              type="button"
                              onClick={() => setCatalogAnnouncement(prev => ({ ...prev, mode: 'marquee' }))}
                              className={`px-3 py-1.5 text-sm font-medium ${
                                catalogAnnouncement.mode === 'marquee' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              En movimiento
                            </button>
                          </div>
                          <label className="flex items-center gap-1.5 text-xs text-gray-600">
                            Fondo
                            <input
                              type="color"
                              value={catalogAnnouncement.backgroundColor}
                              onChange={(e) => setCatalogAnnouncement(prev => ({ ...prev, backgroundColor: e.target.value }))}
                              className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-gray-600">
                            Texto
                            <input
                              type="color"
                              value={catalogAnnouncement.textColor}
                              onChange={(e) => setCatalogAnnouncement(prev => ({ ...prev, textColor: e.target.value }))}
                              className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                            />
                          </label>
                        </div>
                        {/* Vista previa en vivo */}
                        {catalogAnnouncement.text.trim() && (
                          <div className="rounded-lg overflow-hidden border border-gray-200">
                            <div className="py-2 px-4 text-center" style={{ backgroundColor: catalogAnnouncement.backgroundColor }}>
                              <p className="text-sm font-medium" style={{ color: catalogAnnouncement.textColor }}>
                                {catalogAnnouncement.text.trim()}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

{/* Oferta con cuenta regresiva (F2.5) */}
                  <div className="p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900">Oferta con cuenta regresiva</span>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Barra con temporizador hacia una fecha límite (crea urgencia). Al llegar a cero desaparece sola.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCatalogFlashSale(prev => ({ ...prev, enabled: !prev.enabled }))}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${catalogFlashSale.enabled ? 'bg-primary-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${catalogFlashSale.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {catalogFlashSale.enabled && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={catalogFlashSale.text}
                          onChange={(e) => setCatalogFlashSale(prev => ({ ...prev, text: e.target.value }))}
                          placeholder="Ej: ¡Cyber días! Hasta 40% de descuento"
                          maxLength={80}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-gray-600">
                            Termina el
                            <input
                              type="datetime-local"
                              value={catalogFlashSale.endDate}
                              onChange={(e) => setCatalogFlashSale(prev => ({ ...prev, endDate: e.target.value }))}
                              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-gray-600">
                            Fondo
                            <input type="color" value={catalogFlashSale.backgroundColor} onChange={(e) => setCatalogFlashSale(prev => ({ ...prev, backgroundColor: e.target.value }))} className="w-8 h-8 rounded border border-gray-300 cursor-pointer" />
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-gray-600">
                            Texto
                            <input type="color" value={catalogFlashSale.textColor} onChange={(e) => setCatalogFlashSale(prev => ({ ...prev, textColor: e.target.value }))} className="w-8 h-8 rounded border border-gray-300 cursor-pointer" />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

{/* Sellos de confianza (F2.6) */}
                  <div className="p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900">Sellos de confianza</span>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Fila de mensajes con ícono (envío, pago seguro, garantía…) debajo de la portada.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCatalogTrustBadges(prev => ({ ...prev, enabled: !prev.enabled }))}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${catalogTrustBadges.enabled ? 'bg-primary-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${catalogTrustBadges.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {catalogTrustBadges.enabled && (
                      <div className="space-y-2">
                        {(catalogTrustBadges.badges || []).map((badge, idx) => (
                          <div key={badge.id || idx} className="flex items-center gap-2">
                            <select
                              value={badge.icon || 'shield'}
                              onChange={(e) => setCatalogTrustBadges(prev => ({ ...prev, badges: prev.badges.map((b, i) => i === idx ? { ...b, icon: e.target.value } : b) }))}
                              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm flex-shrink-0"
                            >
                              <option value="truck">Envío</option>
                              <option value="shield">Seguro</option>
                              <option value="card">Pago</option>
                              <option value="return">Devolución</option>
                              <option value="support">Soporte</option>
                              <option value="quality">Garantía</option>
                              <option value="clock">Rapidez</option>
                              <option value="tag">Ofertas</option>
                            </select>
                            <input
                              type="text"
                              value={badge.text || ''}
                              onChange={(e) => setCatalogTrustBadges(prev => ({ ...prev, badges: prev.badges.map((b, i) => i === idx ? { ...b, text: e.target.value } : b) }))}
                              placeholder="Ej: Envío gratis desde S/ 100"
                              maxLength={40}
                              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary-500"
                            />
                            <button type="button" onClick={() => setCatalogTrustBadges(prev => ({ ...prev, badges: prev.badges.filter((_, i) => i !== idx) }))} className="p-1 text-red-400 hover:text-red-600 flex-shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        {(catalogTrustBadges.badges || []).length < 4 && (
                          <button
                            type="button"
                            onClick={() => setCatalogTrustBadges(prev => ({ ...prev, badges: [...(prev.badges || []), { id: `badge-${Date.now()}`, icon: 'shield', text: '' }] }))}
                            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                          >
                            + Agregar sello ({(catalogTrustBadges.badges || []).length}/4)
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Prueba social: existe en shopifree, en Cobrify todavia no.
                      Se muestra DESHABILITADO y etiquetado para que nadie
                      lo configure creyendo que ya funciona. */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Prueba social</label>
                    <p className="text-xs text-gray-500 mb-2">Avisos tipo "Ana acaba de comprar" que empujan a decidir.</p>
                    <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-500">Notificaciones de compra</p>
                        <p className="text-xs text-gray-400">Aparecen abajo mientras el cliente navega</p>
                      </div>
                      <span className="text-[11px] font-medium text-gray-400 border border-gray-300 rounded-full px-2 py-0.5 flex-shrink-0">Próximamente</span>
                    </div>
                    </div>
                  </div>

{/* Observaciones del catálogo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Observaciones del catálogo (opcional)
                    </label>
                    <textarea
                      value={catalogObservations}
                      onChange={(e) => setCatalogObservations(e.target.value)}
                      placeholder="Ej: Cuentas de pago, WhatsApp de vendedores, horarios..."
                      maxLength={500}
                      rows={3}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">{catalogObservations.length}/500 caracteres — Se muestra arriba de las categorías en el catálogo</p>
                  </div>
                  </div>
                </div>
                </div>
              )}

              {catalogTab === 'avanzado' && (
                <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <Cog className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Dominio propio</h3>
                      <p className="text-xs text-gray-500">Usa tu propia dirección web</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
{/* Dominio personalizado */}
                  {catalogSlug && (
                    <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Globe className="w-5 h-5 text-blue-600" />
                        <h4 className="font-medium text-gray-900">Dominio personalizado</h4>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Opcional</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        Conecta tu propio dominio para que tus clientes accedan a tu {businessMode === 'restaurant' ? 'carta digital' : 'catálogo'} desde tu propia dirección web.
                      </p>
                      <input
                        type="text"
                        value={catalogCustomDomain}
                        onChange={(e) => setCatalogCustomDomain(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
                        placeholder="mitienda.com"
                        className="w-full px-4 py-2.5 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      />
                      {catalogCustomDomain && (
                        <div className="mt-3 p-3 bg-white rounded-lg border border-blue-100">
                          <p className="text-xs font-medium text-gray-700 mb-2">Para activar tu dominio, configura estos registros DNS:</p>
                          <div className="space-y-1.5 text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">CNAME</span>
                              <span className="text-gray-500">www</span>
                              <span className="text-gray-400">&rarr;</span>
                              <span className="text-blue-600">cname.vercel-dns.com</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">A</span>
                              <span className="text-gray-500">@</span>
                              <span className="text-gray-400">&rarr;</span>
                              <span className="text-blue-600">76.76.21.21</span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            Contacta a soporte para que activemos tu dominio. La propagación DNS puede tardar hasta 48 horas.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                    <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Reservas</h3>
                      <p className="text-xs text-gray-500">Deja que te reserven desde el catálogo</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-5">
                  {/* Reservas de citas desde el catalogo. Solo para los modos que
                      tienen agenda: veterinaria (de fabrica) y General con la
                      agenda activada en el menu. El horario que se define aca es el
                      que el SERVIDOR usa para validar cada reserva publica — el
                      catalogo solo lo pinta. */}
                  {(businessMode === 'veterinary' || (businessMode === 'retail' && appointmentsEnabled)) && (
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 mb-1">Reservas de citas</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Deja que tus clientes reserven su cita desde el catálogo, eligiendo un horario libre. Cada reserva aparece sola en tu Agenda de Citas y te llega una notificación.
                      </p>
                      <Ajuste
                        id="opcion-appointmentsBookingEnabled"
                        checked={appointmentsBooking.enabled}
                        onChange={e => setAppointmentsBooking(prev => ({ ...prev, enabled: e.target.checked }))}
                        titulo="Recibir reservas desde el catálogo"
                        descripcion={appointmentsBooking.enabled
                          ? 'Habilitado: en tu catálogo aparece el botón "Reservar cita". El cliente solo ve horas libres y ocupadas — nunca los datos de otros clientes.'
                          : 'Deshabilitado: las citas solo se agendan desde tu Agenda.'}
                      />
                      {appointmentsBooking.enabled && (
                        <div className="mt-4 space-y-4 pl-1">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Días que atiendes con cita</label>
                            <div className="flex flex-wrap gap-2">
                              {[['D', 0], ['L', 1], ['M', 2], ['X', 3], ['J', 4], ['V', 5], ['S', 6]].map(([letra, dia]) => (
                                <button
                                  key={dia}
                                  type="button"
                                  onClick={() => setAppointmentsBooking(prev => ({
                                    ...prev,
                                    days: prev.days.includes(dia)
                                      ? prev.days.filter(d => d !== dia)
                                      : [...prev.days, dia].sort(),
                                  }))}
                                  className={'w-9 h-9 rounded-lg border text-sm font-semibold transition-colors ' + (
                appointmentsBooking.days.includes(dia)
                                      ? 'bg-primary-600 border-primary-600 text-white'
                                      : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'
                                  )}
                                >
                                  {letra}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3 max-w-md">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">Desde</label>
                              <select
                                value={appointmentsBooking.startHour}
                                onChange={e => setAppointmentsBooking(prev => ({ ...prev, startHour: Number(e.target.value) }))}
                                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                              >
                                {Array.from({ length: 17 }, (_, i) => i + 6).map(h => (
                                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">Hasta</label>
                              <select
                                value={appointmentsBooking.endHour}
                                onChange={e => setAppointmentsBooking(prev => ({ ...prev, endHour: Number(e.target.value) }))}
                                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                              >
                                {Array.from({ length: 17 }, (_, i) => i + 7).map(h => (
                                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">Cada</label>
                              <select
                                value={appointmentsBooking.stepMinutes}
                                onChange={e => setAppointmentsBooking(prev => ({ ...prev, stepMinutes: Number(e.target.value) }))}
                                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                              >
                                <option value={15}>15 min</option>
                                <option value={20}>20 min</option>
                                <option value={30}>30 min</option>
                                <option value={60}>1 hora</option>
                              </select>
                            </div>
                          </div>
                          {appointmentsBooking.endHour <= appointmentsBooking.startHour && (
                            <p className="text-xs text-red-600">La hora de cierre debe ser mayor que la de inicio.</p>
                          )}

                          {/* Servicios que se ofrecen al reservar. Se guardan como
                              snapshot {id, nombre, precio}: el precio que ve el
                              cliente es el que el negocio publico al guardar, y el
                              SERVIDOR usa este mismo snapshot al crear la cita —
                              nadie puede mandarle otro precio. */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                              Servicios que se pueden reservar
                            </label>
                            <p className="text-xs text-gray-500 mb-2">
                              El cliente elige uno al reservar (baño, consulta, podología, masaje...). Si no agregas ninguno, la reserva llega sin servicio y lo coordinas tú.
                            </p>
                            {(appointmentsBooking.services || []).length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {appointmentsBooking.services.map(svc => (
                                  <span key={svc.id} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-800">
                                    {svc.name}
                                    <span className="text-gray-400 text-xs">S/ {Number(svc.price || 0).toFixed(2)}</span>
                                    <button
                                      type="button"
                                      onClick={() => setAppointmentsBooking(prev => ({
                                        ...prev,
                                        services: (prev.services || []).filter(x => x.id !== svc.id),
                                      }))}
                                      className="p-0.5 text-gray-400 hover:text-red-500"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="relative max-w-md">
                              <input
                                type="text"
                                value={busquedaServicio}
                                onChange={e => setBusquedaServicio(e.target.value)}
                                placeholder={productosReservables === null ? 'Cargando productos...' : 'Buscar un producto o servicio para agregarlo'}
                                disabled={productosReservables === null}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                              {busquedaServicio.trim().length >= 2 && productosReservables && (
                                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                                  {productosReservables
                                    .filter(pr => (pr.name || '').toLowerCase().includes(busquedaServicio.trim().toLowerCase()))
                                    .filter(pr => !(appointmentsBooking.services || []).some(x => x.id === pr.id))
                                    .slice(0, 8)
                                    .map(pr => (
                                      <button
                                        key={pr.id}
                                        type="button"
                                        onClick={() => {
                                          setAppointmentsBooking(prev => ({
                                            ...prev,
                                            services: [...(prev.services || []), {
                                              id: pr.id,
                                              name: pr.name || '',
                                              price: Number(pr.price) || 0,
                                            }],
                                          }))
                                          setBusquedaServicio('')
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2"
                                      >
                                        <span className="truncate text-gray-800">{pr.name}</span>
                                        <span className="text-gray-400 text-xs flex-none">S/ {Number(pr.price || 0).toFixed(2)}</span>
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1.5">
                              El precio queda fijado al guardar: si lo cambias en Productos, vuelve a guardar acá.
                            </p>
                          </div>

                          {/* Profesionales que atienden (OPCIONAL). Solo si el
                              negocio los configura aparece el selector en el
                              catalogo, y la agenda pasa a ser POR profesional:
                              dos clientes pueden tomar las 10:00 con doctores
                              distintos sin pisarse. */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                              Quién atiende <span className="text-gray-400 font-normal">(opcional)</span>
                            </label>
                            <p className="text-xs text-gray-500 mb-2">
                              Si agregas personas, el cliente elige con quién quiere su cita y cada una lleva su propia agenda. Déjalo vacío si no aplica en tu negocio.
                            </p>
                            <div className="max-w-md space-y-2">
                              <input
                                type="text"
                                value={appointmentsBooking.staffLabel || ''}
                                onChange={(e) => setAppointmentsBooking(prev => ({ ...prev, staffLabel: e.target.value }))}
                                placeholder="Cómo se llama en tu rubro: Doctor, Terapeuta, Estilista..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                maxLength={30}
                              />
                              {(appointmentsBooking.staff || []).map((persona, idx) => (
                                <div key={persona.id} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={persona.name}
                                    onChange={(e) => setAppointmentsBooking(prev => {
                                      const lista = [...(prev.staff || [])]
                                      lista[idx] = { ...lista[idx], name: e.target.value }
                                      return { ...prev, staff: lista }
                                    })}
                                    placeholder="Nombre"
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    maxLength={60}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setAppointmentsBooking(prev => ({
                                      ...prev,
                                      staff: (prev.staff || []).filter(x => x.id !== persona.id),
                                    }))}
                                    className="p-2 text-gray-400 hover:text-red-500"
                                    aria-label="Quitar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => setAppointmentsBooking(prev => ({
                                  ...prev,
                                  staff: [...(prev.staff || []), { id: `st-${Date.now().toString(36)}`, name: '' }],
                                }))}
                                className="text-sm font-medium text-primary-600 hover:text-primary-700"
                              >
                                + Agregar persona
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Solicitudes de reserva (modo hotel). Lo que llega del catalogo
                      NO bloquea la habitacion: es una solicitud que se confirma o
                      rechaza en la pantalla de Reservas. */}
                  {businessMode === 'hotel' && (
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 mb-1">Reservas de habitaciones</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Deja que tus huéspedes pidan una habitación desde el catálogo, viendo fechas y tarifas. Cada solicitud te llega con una notificación y la confirmas o rechazas desde Reservas — nada se bloquea solo.
                      </p>
                      <Ajuste
                        id="opcion-hotelBookingEnabled"
                        checked={hotelBooking.enabled}
                        onChange={e => setHotelBooking(prev => ({ ...prev, enabled: e.target.checked }))}
                        titulo="Recibir solicitudes de reserva desde el catálogo"
                        descripcion={hotelBooking.enabled
                          ? 'Habilitado: en tu catálogo aparece el botón "Reservar una habitación". El huésped ve solo habitaciones y tarifas — nunca los datos de otros huéspedes. Solo tarifas por noche.'
                          : 'Deshabilitado: las reservas solo se crean desde tu pantalla de Reservas.'}
                      />
                    </div>
                  )}
                  </div>
                </div>
                </div>
              )}
              {/* FIN PESTAÑAS DEL CATÁLOGO */}
            </>
          )}

          {/* Save Button for Catalogo — ancho completo */}
          {/* Boton de guardar FLOTANTE: antes era una barra blanca de ancho
              completo pegada abajo, y con formularios largos tapaba el campo
              que se estaba escribiendo. Ahora es solo el boton, fijo en la
              esquina; el contenido lleva padding para que nunca lo cubra. */}
          <div
            className="fixed right-4 md:right-8 z-30"
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <Button
              className="shadow-xl shadow-gray-900/20"
              onClick={guardarCatalogo}
              disabled={guardando}
            >
              {guardando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Catálogo
                </>
              )}
            </Button>
          </div>
        </>

      {/* Vista previa del tema del catálogo (iframe sobre el catálogo real) */}
      {previewThemeId && CATALOG_THEMES[previewThemeId] && (
        <CatalogThemePreview
          theme={CATALOG_THEMES[previewThemeId]}
          slug={businessSettings?.catalogSlug || ''}
          enabled={!!businessSettings?.catalogEnabled}
          isRestaurantMenu={businessMode === 'restaurant'}
          isCurrent={catalogTheme === previewThemeId}
          onClose={() => setPreviewThemeId(null)}
          onApply={() => {
            setCatalogTheme(previewThemeId)
            setPreviewThemeId(null)
            toast.success(`Tema "${CATALOG_THEMES[previewThemeId].name}" aplicado. No olvides guardar.`)
          }}
        />
      )}
    </div>
  )
}
