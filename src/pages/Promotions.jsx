import { useState, useEffect, useMemo } from 'react'
import {
  Gift,
  Package,
  Plus,
  Trash2,
  Search,
  Loader2,
  CreditCard,
  Stamp,
  Trophy,
  ChevronRight,
  Send,
  Settings,
  Ticket,
  Power,
  Clock,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import LoyaltyManager from '@/components/loyalty/LoyaltyManager'
import GuideLink from '@/components/guide/GuideLink'
import { getProducts, createProduct, updateProduct } from '@/services/firestoreService'
import { createRecipe } from '@/services/recipeService'
import { uploadProductImage, createImagePreview, revokeImagePreview } from '@/services/productImageService'
import ProductModifiersSection from '@/components/ProductModifiersSection'
import { getLoyaltyCards, getWalletPassLink, redeemReward, WALLET_EN_APROBACION } from '@/services/loyaltyService'
import { getCoupons, createCoupon, setCouponActive, deleteCoupon, normalizeCouponCode } from '@/services/couponService'
import { getGiftCertificates, createGiftCertificate, cancelGiftCertificate } from '@/services/giftCertificateService'
import { getOpenCashSessions } from '@/services/firestoreService'
import {
  getScheduledDiscounts, createScheduledDiscount, setScheduledDiscountActive,
  deleteScheduledDiscount, promoVigente, DIAS,
} from '@/services/scheduledDiscountService'

/**
 * Promociones: el escaparate de marketing del negocio en un solo lugar.
 *
 * Fase 1 (esta): tarjeta de sellos (antes escondida dentro de Clientes) y
 * combos (antes había que crear un producto, entrar a Composición y armarle
 * la receta a mano — tres pantallas para un combo).
 *
 * El creador de combos NO inventa un mecanismo nuevo: por detrás crea el
 * producto y su receta con productos-como-componentes (ingredientType:
 * 'product'), exactamente lo que se armaba a mano. Así el POS, el stock y la
 * facturación lo tratan como cualquier producto compuesto ya probado.
 *
 * Fases siguientes (plan acordado con Giacomo): cupones, luego descuentos
 * programados. Puntos NO por ahora: los sellos ya cumplen ese rol.
 */
export default function Promotions() {
  const { getBusinessId, isDemoMode, businessSettings, businessMode, user, branchScope } = useAppContext()
  const toast = useToast()

  const [tab, setTab] = useState('fidelidad') // 'fidelidad' | 'combos'
  // ── Certificados de regalo ──
  const [certificados, setCertificados] = useState([])
  const [cargandoCerts, setCargandoCerts] = useState(true)
  const [isCertOpen, setIsCertOpen] = useState(false)
  const [savingCert, setSavingCert] = useState(false)
  const [accionandoCert, setAccionandoCert] = useState(null)
  const [certForm, setCertForm] = useState({ amount: '', beneficiary: '', expiresAt: '', paymentMethod: 'cash' })
  const [ultimoCertVendido, setUltimoCertVendido] = useState(null)

  // ── Fidelización ──
  const [isLoyaltyOpen, setIsLoyaltyOpen] = useState(false)
  const [tarjetas, setTarjetas] = useState([])
  const [cargandoTarjetas, setCargandoTarjetas] = useState(true)
  const [buscarTarjeta, setBuscarTarjeta] = useState('')
  const [accionandoId, setAccionandoId] = useState(null)

  const nombreNegocio = businessSettings?.name || businessSettings?.tradeName || businessSettings?.businessName || ''
  const metaDefault = businessSettings?.loyaltyConfig?.goal || 10

  // ── Cupones ──
  const [cupones, setCupones] = useState([])
  const [cargandoCupones, setCargandoCupones] = useState(true)
  const [isCuponOpen, setIsCuponOpen] = useState(false)
  const [cuponForm, setCuponForm] = useState({ code: '', type: 'percent', value: '', expiresAt: '', maxUses: '' })
  const [savingCupon, setSavingCupon] = useState(false)
  const [accionandoCupon, setAccionandoCupon] = useState(null)

  // ── Descuentos programados ──
  const FORM_PROMO_VACIO = {
    name: '', percent: '', scope: 'all', category: '', productIds: [],
    days: [1, 2, 3, 4, 5, 6, 0], startTime: '00:00', endTime: '23:59', endsAt: '',
  }
  const [promos, setPromos] = useState([])
  const [cargandoPromos, setCargandoPromos] = useState(true)
  const [isPromoOpen, setIsPromoOpen] = useState(false)
  const [promoForm, setPromoForm] = useState(FORM_PROMO_VACIO)
  const [promoProductSearch, setPromoProductSearch] = useState('')
  const [savingPromo, setSavingPromo] = useState(false)
  const [accionandoPromo, setAccionandoPromo] = useState(null)

  // ── Combos ──
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [isComboOpen, setIsComboOpen] = useState(false)
  const [comboName, setComboName] = useState('')
  const [comboPrice, setComboPrice] = useState('')
  const [comboCode, setComboCode] = useState('')
  const [comboImage, setComboImage] = useState(null) // { file, preview }
  const [comboModifiers, setComboModifiers] = useState([]) // solo restaurante
  const [parts, setParts] = useState([]) // [{ product, quantity }]
  const [partSearch, setPartSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const businessId = getBusinessId()

  useEffect(() => {
    if (!businessId) return
    // Las tarjetas y el catálogo cargan por separado: si una falla, la otra vive.
    getLoyaltyCards(businessId)
      .then((res) => setTarjetas(res?.success ? res.data : []))
      .catch(() => {})
      .finally(() => setCargandoTarjetas(false))
    getProducts(businessId)
      .then((r) => setProducts(r?.data || []))
      .catch(() => {})
      .finally(() => setLoadingProducts(false))
    getCoupons(businessId)
      .then((res) => setCupones(res?.success ? res.data : []))
      .catch(() => {})
      .finally(() => setCargandoCupones(false))
    getGiftCertificates(businessId)
      .then((res) => setCertificados(res?.success ? res.data : []))
      .catch(() => {})
      .finally(() => setCargandoCerts(false))
    getScheduledDiscounts(businessId)
      .then((res) => setPromos(res?.success ? res.data : []))
      .catch(() => {})
      .finally(() => setCargandoPromos(false))
  }, [businessId])

  const categorias = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products]
  )

  // ── Certificados de regalo: vender, listar, anular ──
  // La decision tributaria (Giacomo, 16-ago): el comprobante se emite AL
  // CANJE. Vender el certificado registra un INGRESO DE CAJA por el medio
  // real de pago — por eso exige una caja abierta.
  const venderCertificado = async () => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    const monto = parseFloat(certForm.amount)
    if (!(monto > 0)) { toast.error('Pon el valor del certificado'); return }
    setSavingCert(true)
    try {
      // Sesion de caja abierta: la del usuario actual si tiene, o la primera
      // de la sucursal. Sin caja no se vende (el dinero debe entrar al arqueo).
      const sesiones = await getOpenCashSessions(businessId, branchScope || null)
      const abiertas = sesiones?.data || sesiones || []
      const sesion = abiertas.find?.(x => x.openedByUserId === user?.uid) || abiertas[0]
      if (!sesion?.id) {
        toast.error('Abre tu caja antes de vender un certificado: el dinero entra al arqueo del dia')
        return
      }
      const res = await createGiftCertificate(businessId, {
        amount: monto,
        beneficiary: certForm.beneficiary,
        expiresAt: certForm.expiresAt ? new Date(`${certForm.expiresAt}T23:59:59`) : null,
        paymentMethod: certForm.paymentMethod,
        sessionId: sesion.id,
        soldBy: user?.email || '',
      })
      if (!res.success) { toast.error(res.error); return }
      if (res.warning) toast.error(res.warning, 9000)
      setCertificados((prev) => [{
        id: res.code, amount: monto, balance: monto, status: 'active',
        beneficiary: certForm.beneficiary.trim(),
        expiresAt: certForm.expiresAt ? { toDate: () => new Date(`${certForm.expiresAt}T23:59:59`) } : null,
        createdAt: { toDate: () => new Date() },
      }, ...prev])
      setUltimoCertVendido({ code: res.code, amount: monto })
      setIsCertOpen(false)
      setCertForm({ amount: '', beneficiary: '', expiresAt: '', paymentMethod: 'cash' })
      toast.success(`Certificado ${res.code} vendido: entrego el codigo al cliente`)
    } finally {
      setSavingCert(false)
    }
  }

  const anularCertificado = async (cert) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    if (!window.confirm(`Anular el certificado ${cert.id}? Si ya cobraste el dinero, recuerda devolverlo y registrar el egreso en caja.`)) return
    setAccionandoCert(cert.id)
    try {
      const res = await cancelGiftCertificate(businessId, cert.id)
      if (!res.success) { toast.error('No se pudo anular'); return }
      setCertificados((prev) => prev.map((c) => c.id === cert.id ? { ...c, status: 'cancelled' } : c))
    } finally {
      setAccionandoCert(null)
    }
  }

  const guardarPromo = async () => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setSavingPromo(true)
    try {
      const res = await createScheduledDiscount(businessId, {
        ...promoForm,
        endsAt: promoForm.endsAt ? new Date(`${promoForm.endsAt}T23:59:59`) : null,
      })
      if (!res.success) { toast.error(res.error); return }
      toast.success(`Promoción "${promoForm.name.trim()}" creada`)
      setPromos((prev) => [{
        id: res.id, ...promoForm, name: promoForm.name.trim(), percent: Number(promoForm.percent),
        endsAt: promoForm.endsAt ? { toDate: () => new Date(`${promoForm.endsAt}T23:59:59`) } : null,
        active: true,
      }, ...prev])
      setIsPromoOpen(false)
      setPromoForm(FORM_PROMO_VACIO)
      setPromoProductSearch('')
    } finally {
      setSavingPromo(false)
    }
  }

  const alternarPromo = async (promo) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setAccionandoPromo(promo.id)
    try {
      const res = await setScheduledDiscountActive(businessId, promo.id, !promo.active)
      if (!res.success) { toast.error('No se pudo cambiar la promoción'); return }
      setPromos((prev) => prev.map((p) => p.id === promo.id ? { ...p, active: !promo.active } : p))
    } finally {
      setAccionandoPromo(null)
    }
  }

  const eliminarPromo = async (promo) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setAccionandoPromo(promo.id)
    try {
      const res = await deleteScheduledDiscount(businessId, promo.id)
      if (!res.success) { toast.error('No se pudo eliminar'); return }
      setPromos((prev) => prev.filter((p) => p.id !== promo.id))
      toast.success(`Promoción "${promo.name}" eliminada`)
    } finally {
      setAccionandoPromo(null)
    }
  }

  const candidatosPromo = useMemo(() => {
    const q = promoProductSearch.trim().toLowerCase()
    if (!q) return []
    return products
      .filter((p) => !promoForm.productIds.includes(p.id))
      .filter((p) => (p.name || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [promoProductSearch, products, promoForm.productIds])

  const guardarCupon = async () => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setSavingCupon(true)
    try {
      const res = await createCoupon(businessId, {
        code: cuponForm.code,
        type: cuponForm.type,
        value: cuponForm.value,
        // La fecha del input es local; el cupón vence al FINAL de ese día.
        expiresAt: cuponForm.expiresAt ? new Date(`${cuponForm.expiresAt}T23:59:59`) : null,
        maxUses: cuponForm.maxUses || null,
      })
      if (!res.success) { toast.error(res.error); return }
      toast.success(`Cupón ${res.id} creado`)
      setCupones((prev) => [{
        id: res.id, type: cuponForm.type, value: Number(cuponForm.value),
        expiresAt: cuponForm.expiresAt ? { toDate: () => new Date(`${cuponForm.expiresAt}T23:59:59`) } : null,
        maxUses: cuponForm.maxUses ? Number(cuponForm.maxUses) : null, uses: 0, active: true,
      }, ...prev])
      setIsCuponOpen(false)
      setCuponForm({ code: '', type: 'percent', value: '', expiresAt: '', maxUses: '' })
    } finally {
      setSavingCupon(false)
    }
  }

  const alternarCupon = async (cupon) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setAccionandoCupon(cupon.id)
    try {
      const res = await setCouponActive(businessId, cupon.id, !cupon.active)
      if (!res.success) { toast.error('No se pudo cambiar el cupón'); return }
      setCupones((prev) => prev.map((c) => c.id === cupon.id ? { ...c, active: !cupon.active } : c))
    } finally {
      setAccionandoCupon(null)
    }
  }

  // Tarjeta del cupón para el celular del cliente (Google/Apple Wallet según
  // el equipo que abra el link). Se comparte por WhatsApp sin destinatario
  // fijo: el comercio elige el chat, o se lo copia a un afiche.
  const compartirTarjetaCupon = async (cupon) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setAccionandoCupon(cupon.id)
    try {
      const { getCouponPassLink } = await import('@/services/couponService')
      const { getAuth } = await import('firebase/auth')
      const idToken = await getAuth().currentUser?.getIdToken()
      const res = await getCouponPassLink(businessId, cupon.id, idToken)
      if (!res.success) { toast.error(res.error || 'No se pudo generar la tarjeta'); return }

      const negocio = businessSettings?.name || businessSettings?.tradeName || 'nuestro negocio'
      const texto = `${negocio}: ${res.titulo} con el cupon ${cupon.id}. ` +
        `Agrega el cupon a tu celular y muestralo al pagar: ${res.shortUrl}`
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
    } finally {
      setAccionandoCupon(null)
    }
  }

  const eliminarCupon = async (cupon) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setAccionandoCupon(cupon.id)
    try {
      const res = await deleteCoupon(businessId, cupon.id)
      if (!res.success) { toast.error('No se pudo eliminar'); return }
      setCupones((prev) => prev.filter((c) => c.id !== cupon.id))
      toast.success(`Cupón ${cupon.id} eliminado`)
    } finally {
      setAccionandoCupon(null)
    }
  }

  // Las estadísticas se derivan de la misma lista que se muestra abajo.
  const cardStats = useMemo(() => ({
    tarjetas: tarjetas.length,
    sellos: tarjetas.reduce((s, c) => s + (c.stamps || 0), 0),
    canjes: tarjetas.reduce((s, c) => s + (c.rewardsRedeemed || 0), 0),
    cargando: cargandoTarjetas,
  }), [tarjetas, cargandoTarjetas])

  const tarjetasFiltradas = useMemo(() => {
    const q = buscarTarjeta.trim().toLowerCase()
    if (!q) return tarjetas
    return tarjetas.filter((t) =>
      (t.customerName || '').toLowerCase().includes(q) || String(t.phone || t.id).includes(q))
  }, [tarjetas, buscarTarjeta])

  // Mismos flujos que el gestor (LoyaltyManager): un solo link cbrfy.link
  // que sirve para Apple y Google Wallet según el celular del cliente.
  const enviarTarjeta = async (tarjeta) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setAccionandoId(`wa_${tarjeta.id}`)
    try {
      const { getAuth } = await import('firebase/auth')
      const idToken = await getAuth().currentUser?.getIdToken()
      const res = await getWalletPassLink(businessId, tarjeta.phone || tarjeta.id, idToken)
      if (!res.success) { toast.error(res.error || 'No se pudo generar la tarjeta'); return }
      const texto = `Hola! Esta es tu tarjeta de sellos de ${nombreNegocio || 'nuestro negocio'}. ` +
        `Ya tienes ${res.stamps} de ${res.goal}. Agregala a tu celular: ${res.shortUrl || res.url}`
      const digitos = String(tarjeta.phone || tarjeta.id).replace(/\D/g, '')
      const numero = digitos.length === 9 ? `51${digitos}` : digitos
      window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank')
    } finally {
      setAccionandoId(null)
    }
  }

  const canjear = async (tarjeta) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setAccionandoId(`canje_${tarjeta.id}`)
    try {
      const res = await redeemReward(businessId, tarjeta.phone || tarjeta.id, { config: businessSettings?.loyaltyConfig })
      if (!res.success) { toast.error(res.error || 'No se pudo canjear'); return }
      toast.success(`Premio canjeado. Le quedan ${res.stamps} sellos`)
      setTarjetas((prev) => prev.map((t) => t.id === tarjeta.id
        ? { ...t, stamps: res.stamps, rewardsRedeemed: (t.rewardsRedeemed || 0) + 1 }
        : t))
    } finally {
      setAccionandoId(null)
    }
  }

  const combos = useMemo(() => products.filter((p) => p.isCombo), [products])

  const candidatos = useMemo(() => {
    const q = partSearch.trim().toLowerCase()
    if (!q) return []
    return products
      .filter((p) => !p.isCombo && !parts.some((x) => x.product.id === p.id))
      .filter((p) => (p.name || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [partSearch, products, parts])

  const sumaPartes = useMemo(
    () => parts.reduce((s, x) => s + (Number(x.product.price) || 0) * x.quantity, 0),
    [parts]
  )
  const precioCombo = Number(comboPrice) || 0
  const ahorro = sumaPartes - precioCombo

  const cerrarCombo = () => {
    setIsComboOpen(false)
    setComboName('')
    setComboPrice('')
    setComboCode('')
    if (comboImage?.preview) revokeImagePreview(comboImage.preview)
    setComboImage(null)
    setComboModifiers([])
    setParts([])
    setPartSearch('')
  }

  const elegirImagenCombo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (comboImage?.preview) revokeImagePreview(comboImage.preview)
    setComboImage({ file, preview: createImagePreview(file) })
    e.target.value = '' // permite volver a elegir el mismo archivo
  }

  const guardarCombo = async () => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    if (!comboName.trim()) { toast.error('Ponle un nombre al combo'); return }
    if (parts.length < 2) { toast.error('Un combo necesita al menos 2 productos'); return }
    if (!(precioCombo > 0)) { toast.error('Ingresa el precio del combo'); return }

    setSaving(true)
    try {
      // 1. El producto que se vende (el POS lo ve como uno más)
      const prod = await createProduct(businessId, {
        name: comboName.trim(),
        description: parts.map((x) => `${x.quantity}x ${x.product.name}`).join(' + '),
        price: precioCombo,
        cost: 0, // lo sincroniza la receta (syncProductCostFromRecipe)
        unit: 'NIU',
        category: 'Combos',
        code: comboCode.trim(),
        isCombo: true,
        trackStock: false, // el stock vive en las partes, no en el combo
        // Modificadores (solo restaurante): mismos que un producto normal —
        // el POS y la carta digital los ofrecen al elegir el combo.
        ...(businessMode === 'restaurant' && comboModifiers.length > 0 ? { modifiers: comboModifiers } : {}),
      })
      if (!prod.success) throw new Error(prod.error)

      // 1b. Imagen (opcional). Se sube con el ID real del producto y se
      // completa el doc. Si falla, el combo queda sin foto — no se frena.
      let imageUrl = null
      if (comboImage?.file) {
        try {
          imageUrl = await uploadProductImage(businessId, prod.id, comboImage.file)
          if (imageUrl) await updateProduct(businessId, prod.id, { imageUrl, imageUrls: [imageUrl] })
        } catch (imgError) {
          console.error('No se pudo subir la imagen del combo:', imgError)
          toast.error('El combo se creó, pero la imagen no se pudo subir')
        }
      }

      // 2. Su composición: cada parte es un producto-componente. deductOnSale
      //    hace que vender el combo descuente el stock de las partes.
      const receta = await createRecipe(businessId, {
        productId: prod.id,
        productName: comboName.trim(),
        ingredients: parts.map((x) => ({
          ingredientId: x.product.id,
          ingredientName: x.product.name,
          ingredientType: 'product',
          quantity: x.quantity,
          unit: x.product.unit || 'NIU',
          cost: 0,
        })),
        deductOnSale: true,
        portions: 1,
      })
      if (!receta.success) throw new Error(receta.error)

      toast.success(`Combo "${comboName.trim()}" creado. Ya puedes venderlo desde el POS.`)
      setProducts((prev) => [...prev, {
        id: prod.id, name: comboName.trim(), price: precioCombo, isCombo: true,
        category: 'Combos', code: comboCode.trim(), imageUrl,
      }])
      cerrarCombo()
    } catch (error) {
      console.error('Error al crear combo:', error)
      toast.error(error.message || 'No se pudo crear el combo')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent'

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Promociones</h1>
          <GuideLink />
        </div>
        <p className="text-gray-600">
          Fideliza a tus clientes y arma ofertas — todo desde un solo lugar
        </p>
      </div>

      {/* Pestañas. En móvil son un CARRUSEL: la fila se desliza dentro de sí
          misma (overflow-x-auto) en vez de empujar el ancho de la página —
          sin esto, las 4 pestañas provocaban scroll horizontal en celulares. */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto scrollbar-hide">
        {[
          { id: 'fidelidad', label: 'Tarjeta de sellos', icon: CreditCard },
          { id: 'combos', label: 'Combos', icon: Package },
          { id: 'cupones', label: 'Cupones', icon: Ticket },
          { id: 'certificados', label: 'Certificados', icon: Gift },
          { id: 'descuentos', label: 'Descuentos', icon: Clock },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap ${
              tab === id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── TARJETA DE SELLOS ── */}
      {tab === 'fidelidad' && (
        <div className="space-y-6">
          {/* El motivo real (aprobación de Google pendiente) es interno: hacia
              los comercios solo "próximamente", sin más detalle. */}
          {WALLET_EN_APROBACION && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <Stamp className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm font-medium text-amber-900">
                El envío de la tarjeta digital estará disponible próximamente
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Tarjetas emitidas', value: cardStats.tarjetas, icon: CreditCard },
              { label: 'Sellos activos', value: cardStats.sellos, icon: Stamp },
              { label: 'Premios canjeados', value: cardStats.canjes, icon: Trophy },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="flex items-center gap-4 py-5">
                  <div className="p-3 rounded-full bg-primary-50">
                    <Icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {cardStats.cargando ? '—' : value}
                    </p>
                    <p className="text-sm text-gray-500">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Clientes con tarjeta: la lista vive AQUÍ, a la vista — no dentro
              del configurador (pedido de Giacomo). Configurar queda para el
              diseño y las reglas del programa. */}
          <Card>
            <CardContent className="py-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <h3 className="font-semibold text-gray-900">Clientes con tarjeta</h3>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      value={buscarTarjeta}
                      onChange={(e) => setBuscarTarjeta(e.target.value)}
                      placeholder="Buscar por nombre o teléfono..."
                      className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent w-full sm:w-64"
                    />
                  </div>
                  <Button variant="outline" onClick={() => setIsLoyaltyOpen(true)} className="shrink-0">
                    <Settings className="w-4 h-4 mr-2" />
                    Configurar
                  </Button>
                </div>
              </div>

              {cargandoTarjetas ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : tarjetasFiltradas.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-600">
                    {tarjetas.length === 0 ? 'Todavía no hay tarjetas' : 'Sin resultados para esa búsqueda'}
                  </p>
                  {tarjetas.length === 0 && (
                    <p className="text-sm text-gray-400 mt-1">
                      Se crean solas: activa el programa y vende con cliente seleccionado en el POS
                    </p>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {tarjetasFiltradas.map((t) => {
                    const meta = t.goal || metaDefault
                    const sellos = t.stamps || 0
                    const completa = sellos >= meta
                    return (
                      <li key={t.id} className="flex items-center gap-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {t.customerName || 'Sin nombre'}
                          </p>
                          <p className="text-xs text-gray-500">{t.phone || t.id}</p>
                        </div>
                        <span className={`text-sm font-semibold whitespace-nowrap ${completa ? 'text-green-600' : 'text-gray-700'}`}>
                          {sellos}/{meta}
                        </span>
                        {completa && (
                          <Button
                            size="sm" variant="outline"
                            disabled={accionandoId === `canje_${t.id}`}
                            onClick={() => canjear(t)}
                          >
                            {accionandoId === `canje_${t.id}`
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <><Gift className="w-3.5 h-3.5 mr-1" />Canjear</>}
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost"
                          title={WALLET_EN_APROBACION
                            ? 'Disponible próximamente'
                            : 'Enviar su tarjeta por WhatsApp'}
                          disabled={WALLET_EN_APROBACION || accionandoId === `wa_${t.id}`}
                          onClick={() => enviarTarjeta(t)}
                        >
                          {accionandoId === `wa_${t.id}`
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Send className="w-3.5 h-3.5" />}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── COMBOS ── */}
      {tab === 'combos' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <p className="text-sm text-gray-600">
              Agrupa productos a un precio especial. El stock se descuenta de cada parte al vender.
            </p>
            <Button onClick={() => setIsComboOpen(true)} className="w-full sm:w-auto shrink-0 whitespace-nowrap">
              <Plus className="w-4 h-4 mr-2" />
              Crear combo
            </Button>
          </div>

          {loadingProducts ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : combos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Todavía no tienes combos</p>
                <p className="text-sm text-gray-400 mt-1">
                  Crea el primero: elige productos, ponle precio y listo — se vende desde el POS
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {combos.map((c) => (
                <Card key={c.id}>
                  <CardContent className="py-4">
                    <div className="flex justify-between items-start gap-3">
                      {c.imageUrl && (
                        <img src={c.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-100 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                        {c.code && <p className="text-xs text-gray-400 font-mono">{c.code}</p>}
                        {c.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.description}</p>
                        )}
                      </div>
                      <p className="font-bold text-primary-600 whitespace-nowrap">
                        S/ {(Number(c.price) || 0).toFixed(2)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CUPONES ── */}
      {tab === 'cupones' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <p className="text-sm text-gray-600">
              Códigos de descuento que el cajero aplica en el POS. Se descuentan del total de la venta.
            </p>
            <Button onClick={() => setIsCuponOpen(true)} className="w-full sm:w-auto shrink-0 whitespace-nowrap">
              <Plus className="w-4 h-4 mr-2" />
              Crear cupón
            </Button>
          </div>

          {cargandoCupones ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : cupones.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Ticket className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Todavía no tienes cupones</p>
                <p className="text-sm text-gray-400 mt-1">
                  Crea uno (ej: VERANO10) y compártelo en redes o WhatsApp — el cajero lo escribe al cobrar
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-2">
                <ul className="divide-y divide-gray-100">
                  {cupones.map((c) => {
                    const vencido = c.expiresAt && c.expiresAt.toDate() < new Date()
                    const agotado = c.maxUses && (c.uses || 0) >= c.maxUses
                    const estado = !c.active ? 'Desactivado' : vencido ? 'Vencido' : agotado ? 'Agotado' : 'Activo'
                    const estadoCls = estado === 'Activo'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                    return (
                      <li key={c.id} className="flex items-center gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-mono font-semibold text-gray-900">{c.id}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoCls}`}>{estado}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {c.type === 'percent' ? `${c.value}% de descuento` : `S/ ${Number(c.value).toFixed(2)} de descuento`}
                            {' · '}{c.uses || 0}{c.maxUses ? `/${c.maxUses}` : ''} usos
                            {c.expiresAt ? ` · vence ${c.expiresAt.toDate().toLocaleDateString('es-PE')}` : ''}
                          </p>
                        </div>
                        {/* Tarjeta para el celular: el link cbrfy sirve Google
                            Wallet en Android y el .pkpass en iPhone. Solo para
                            cupones utilizables — una tarjeta de un cupon
                            muerto seria repartir decepcion. */}
                        {estado === 'Activo' && (
                          <Button
                            size="sm" variant="ghost"
                            title="Compartir tarjeta para el celular"
                            disabled={accionandoCupon === c.id}
                            onClick={() => compartirTarjetaCupon(c)}
                          >
                            <Send className="w-4 h-4 text-primary-600" />
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost"
                          title={c.active ? 'Desactivar' : 'Activar'}
                          disabled={accionandoCupon === c.id}
                          onClick={() => alternarCupon(c)}
                        >
                          <Power className={`w-4 h-4 ${c.active ? 'text-green-600' : 'text-gray-400'}`} />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          title="Eliminar"
                          disabled={accionandoCupon === c.id}
                          onClick={() => eliminarCupon(c)}
                        >
                          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── DESCUENTOS PROGRAMADOS ── */}
      {/* ── CERTIFICADOS DE REGALO ── */}
      {tab === 'certificados' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <p className="text-sm text-gray-600">
              Saldo prepagado que el cliente regala. El comprobante sale al CANJE, no al venderlo:
              la venta del certificado entra como ingreso de caja.
            </p>
            <Button onClick={() => setIsCertOpen(true)} className="w-full sm:w-auto shrink-0 whitespace-nowrap">
              <Plus className="w-4 h-4 mr-2" />
              Vender certificado
            </Button>
          </div>

          {/* El codigo recien vendido, en grande: es lo que se entrega al cliente */}
          {ultimoCertVendido && (
            <div className="p-4 bg-violet-50 border border-violet-200 rounded-lg flex flex-wrap items-center gap-3">
              <Gift className="w-5 h-5 text-violet-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-violet-900">
                  Certificado vendido por <strong>S/ {ultimoCertVendido.amount.toFixed(2)}</strong>.
                  Entrega este codigo al cliente (lo escribe el cajero al canjear):
                </p>
                <p className="font-mono text-2xl font-bold text-violet-800 tracking-wider mt-1">{ultimoCertVendido.code}</p>
              </div>
              <button onClick={() => setUltimoCertVendido(null)} className="text-violet-400 hover:text-violet-600 text-sm shrink-0">
                Cerrar
              </button>
            </div>
          )}

          {cargandoCerts ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : certificados.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-gray-500">
                Todavia no vendes certificados. El primero se vende con el boton de arriba — necesitas tu caja abierta.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-2">
                <ul className="divide-y divide-gray-100">
                  {certificados.map((c) => {
                    const vencido = c.expiresAt && c.expiresAt.toDate() < new Date()
                    const estado = c.status === 'cancelled' ? 'Anulado'
                      : c.status === 'exhausted' || !(c.balance > 0) ? 'Agotado'
                      : vencido ? 'Vencido' : 'Activo'
                    const estadoCls = estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    return (
                      <li key={c.id} className="flex items-center gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-mono font-semibold text-gray-900">{c.id}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoCls}`}>{estado}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Saldo S/ {Number(c.balance).toFixed(2)} de S/ {Number(c.amount).toFixed(2)}
                            {c.beneficiary ? ` · para ${c.beneficiary}` : ''}
                            {c.expiresAt ? ` · vence ${c.expiresAt.toDate().toLocaleDateString('es-PE')}` : ''}
                          </p>
                        </div>
                        {estado === 'Activo' && (
                          <Button
                            size="sm" variant="ghost"
                            title="Anular certificado"
                            disabled={accionandoCert === c.id}
                            onClick={() => anularCertificado(c)}
                          >
                            <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'descuentos' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <p className="text-sm text-gray-600">
              Ofertas por horario y día — el POS las aplica solo al agregar el producto. Ej: 20% en bebidas de 5 a 7pm.
            </p>
            <Button onClick={() => setIsPromoOpen(true)} className="w-full sm:w-auto shrink-0 whitespace-nowrap">
              <Plus className="w-4 h-4 mr-2" />
              Crear promoción
            </Button>
          </div>

          {cargandoPromos ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : promos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Todavía no tienes promociones programadas</p>
                <p className="text-sm text-gray-400 mt-1">
                  Crea una "hora feliz" o una oferta por día — el POS la aplica y la quita solo, según el reloj
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-2">
                <ul className="divide-y divide-gray-100">
                  {promos.map((p) => {
                    const vencida = p.endsAt && p.endsAt.toDate() < new Date()
                    const estado = !p.active ? 'Desactivada' : vencida ? 'Vencida' : promoVigente(p) ? 'Activa ahora' : 'Programada'
                    const estadoCls = estado === 'Activa ahora'
                      ? 'bg-green-100 text-green-700'
                      : estado === 'Programada' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    const alcance = p.scope === 'all' ? 'todos los productos'
                      : p.scope === 'category' ? `categoría ${p.category}`
                      : `${p.productIds?.length || 0} producto${(p.productIds?.length || 0) === 1 ? '' : 's'}`
                    const dias = (p.days || []).length === 7 ? 'todos los días'
                      : (p.days || []).map((d) => DIAS[d]).join(' ')
                    return (
                      <li key={p.id} className="flex items-center gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${estadoCls}`}>{estado}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            −{p.percent}% en {alcance} · {dias} · {p.startTime}–{p.endTime}
                            {p.endsAt ? ` · hasta ${p.endsAt.toDate().toLocaleDateString('es-PE')}` : ''}
                          </p>
                        </div>
                        <Button
                          size="sm" variant="ghost"
                          title={p.active ? 'Desactivar' : 'Activar'}
                          disabled={accionandoPromo === p.id}
                          onClick={() => alternarPromo(p)}
                        >
                          <Power className={`w-4 h-4 ${p.active ? 'text-green-600' : 'text-gray-400'}`} />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          title="Eliminar"
                          disabled={accionandoPromo === p.id}
                          onClick={() => eliminarPromo(p)}
                        >
                          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Crear promoción programada */}
      <Modal isOpen={isPromoOpen} onClose={() => setIsPromoOpen(false)} title="Crear promoción" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                value={promoForm.name}
                onChange={(e) => setPromoForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Hora feliz"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descuento (%)</label>
              <input
                type="number" min="1" max="99"
                value={promoForm.percent}
                onChange={(e) => setPromoForm((f) => ({ ...f, percent: e.target.value }))}
                placeholder="20"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Se aplica a</label>
            <select
              value={promoForm.scope}
              onChange={(e) => setPromoForm((f) => ({ ...f, scope: e.target.value }))}
              className={inputCls}
            >
              <option value="all">Todos los productos</option>
              <option value="category">Una categoría</option>
              <option value="products">Productos específicos</option>
            </select>
          </div>

          {promoForm.scope === 'category' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              <select
                value={promoForm.category}
                onChange={(e) => setPromoForm((f) => ({ ...f, category: e.target.value }))}
                className={inputCls}
              >
                <option value="">Elige una categoría...</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {promoForm.scope === 'products' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Productos</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  value={promoProductSearch}
                  onChange={(e) => setPromoProductSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className={`${inputCls} pl-9`}
                />
                {candidatosPromo.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                    {candidatosPromo.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setPromoForm((f) => ({ ...f, productIds: [...f.productIds, p.id] }))
                          setPromoProductSearch('')
                        }}
                        className="w-full flex justify-between items-center px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <span className="truncate text-gray-900">{p.name}</span>
                        <span className="text-gray-500 shrink-0 ml-2">S/ {(Number(p.price) || 0).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {promoForm.productIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {promoForm.productIds.map((id) => {
                    const prod = products.find((x) => x.id === id)
                    return (
                      <span key={id} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                        {prod?.name || id}
                        <button
                          onClick={() => setPromoForm((f) => ({ ...f, productIds: f.productIds.filter((x) => x !== id) }))}
                          className="text-gray-400 hover:text-red-500"
                        >
                          ×
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Días</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button
                  key={d}
                  onClick={() => setPromoForm((f) => ({
                    ...f,
                    days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d],
                  }))}
                  className={`w-9 h-9 rounded-full text-sm font-semibold transition-colors ${
                    promoForm.days.includes(d)
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {DIAS[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <input
                type="time"
                value={promoForm.startTime}
                onChange={(e) => setPromoForm((f) => ({ ...f, startTime: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
              <input
                type="time"
                value={promoForm.endTime}
                onChange={(e) => setPromoForm((f) => ({ ...f, endTime: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Termina el (opcional)</label>
              <input
                type="date"
                value={promoForm.endsAt}
                onChange={(e) => setPromoForm((f) => ({ ...f, endsAt: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsPromoOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={guardarPromo} disabled={savingPromo} className="flex-1">
              {savingPromo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Clock className="w-4 h-4 mr-2" />}
              Crear promoción
            </Button>
          </div>
        </div>
      </Modal>

      {/* Crear cupón */}
      {/* Vender certificado de regalo. Exige caja abierta: el dinero entra
          como ingreso de caja (el comprobante saldra recien al canje). */}
      <Modal isOpen={isCertOpen} onClose={() => setIsCertOpen(false)} title="Vender certificado de regalo">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor (S/)</label>
            <input
              type="number"
              value={certForm.amount}
              onChange={(e) => setCertForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="Ej: 100.00"
              min="1"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Con que pagaron</label>
            <div className="grid grid-cols-3 gap-2">
              {[['cash', 'Efectivo'], ['yape', 'Yape'], ['plin', 'Plin']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCertForm((f) => ({ ...f, paymentMethod: id }))}
                  className={`py-2 px-2 text-sm rounded-lg border-2 transition-colors ${
                    certForm.paymentMethod === id
                      ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              El dinero entra al arqueo de tu caja abierta por este medio.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Para quien es (opcional)</label>
            <input
              type="text"
              value={certForm.beneficiary}
              onChange={(e) => setCertForm((f) => ({ ...f, beneficiary: e.target.value }))}
              placeholder="Ej: Maria Torres"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vence el (opcional)</label>
            <input
              type="date"
              value={certForm.expiresAt}
              onChange={(e) => setCertForm((f) => ({ ...f, expiresAt: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsCertOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={venderCertificado} disabled={savingCert} className="flex-1">
              {savingCert ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Vender'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isCuponOpen} onClose={() => setIsCuponOpen(false)} title="Crear cupón">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
            <input
              type="text"
              value={cuponForm.code}
              onChange={(e) => setCuponForm((f) => ({ ...f, code: normalizeCouponCode(e.target.value) }))}
              placeholder="Ej: VERANO10"
              className={`${inputCls} font-mono uppercase`}
            />
            <p className="text-xs text-gray-400 mt-1">Solo letras y números; el cajero lo escribirá al cobrar</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={cuponForm.type}
                onChange={(e) => setCuponForm((f) => ({ ...f, type: e.target.value }))}
                className={inputCls}
              >
                <option value="percent">Porcentaje (%)</option>
                <option value="amount">Monto fijo (S/)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {cuponForm.type === 'percent' ? 'Descuento (%)' : 'Descuento (S/)'}
              </label>
              <input
                type="number"
                min="0"
                step={cuponForm.type === 'percent' ? '1' : '0.10'}
                value={cuponForm.value}
                onChange={(e) => setCuponForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={cuponForm.type === 'percent' ? '10' : '5.00'}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vence el (opcional)</label>
              <input
                type="date"
                value={cuponForm.expiresAt}
                onChange={(e) => setCuponForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Límite de usos (opcional)</label>
              <input
                type="number"
                min="1"
                value={cuponForm.maxUses}
                onChange={(e) => setCuponForm((f) => ({ ...f, maxUses: e.target.value }))}
                placeholder="Sin límite"
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsCuponOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={guardarCupon} disabled={savingCupon} className="flex-1">
              {savingCupon ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Ticket className="w-4 h-4 mr-2" />}
              Crear cupón
            </Button>
          </div>
        </div>
      </Modal>

      {/* Configuración de la tarjeta (el mismo gestor que vivía en Clientes) */}
      <LoyaltyManager isOpen={isLoyaltyOpen} onClose={() => setIsLoyaltyOpen(false)} />

      {/* Creador de combos */}
      <Modal isOpen={isComboOpen} onClose={cerrarCombo} title="Crear combo" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del combo
            </label>
            <input
              type="text"
              value={comboName}
              onChange={(e) => setComboName(e.target.value)}
              placeholder="Ej: Combo familiar"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Productos que lo componen
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
                placeholder="Buscar producto..."
                className={`${inputCls} pl-9`}
              />
              {candidatos.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                  {candidatos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setParts((prev) => [...prev, { product: p, quantity: 1 }])
                        setPartSearch('')
                      }}
                      className="w-full flex justify-between items-center px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="truncate text-gray-900">{p.name}</span>
                      <span className="text-gray-500 shrink-0 ml-2">S/ {(Number(p.price) || 0).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {parts.length > 0 && (
              <div className="mt-3 space-y-2">
                {parts.map((x, i) => (
                  <div key={x.product.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm text-gray-900 truncate">{x.product.name}</span>
                    <input
                      type="number"
                      min="1"
                      value={x.quantity}
                      onChange={(e) => {
                        const q = Math.max(1, parseInt(e.target.value) || 1)
                        setParts((prev) => prev.map((y, j) => (j === i ? { ...y, quantity: q } : y)))
                      }}
                      className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded bg-white text-gray-900"
                    />
                    <span className="text-sm text-gray-500 w-20 text-right">
                      S/ {((Number(x.product.price) || 0) * x.quantity).toFixed(2)}
                    </span>
                    <button
                      onClick={() => setParts((prev) => prev.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio del combo (S/)
              </label>
              <input
                type="number"
                min="0"
                step="0.10"
                value={comboPrice}
                onChange={(e) => setComboPrice(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código (opcional)
              </label>
              <input
                type="text"
                value={comboCode}
                onChange={(e) => setComboCode(e.target.value)}
                placeholder="Ej: COMBO01"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Imagen (opcional)
            </label>
            {comboImage ? (
              <div className="flex items-center gap-3">
                <img src={comboImage.preview} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                <button
                  onClick={() => { revokeImagePreview(comboImage.preview); setComboImage(null) }}
                  className="text-sm text-red-500 hover:text-red-700 font-medium"
                >
                  Quitar imagen
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 cursor-pointer hover:border-gray-400 hover:text-gray-600">
                <Plus className="w-4 h-4" />
                Subir foto del combo
                <input type="file" accept="image/*" onChange={elegirImagenCombo} className="hidden" />
              </label>
            )}
          </div>

          {/* Modificadores: solo restaurante. El mismo editor que usa Productos
              — el POS y la carta digital los ofrecen al elegir el combo. */}
          {businessMode === 'restaurant' && (
            <ProductModifiersSection
              modifiers={comboModifiers}
              onChange={setComboModifiers}
            />
          )}

          {/* El vendedor ve al instante si el combo tiene sentido comercial */}
          {parts.length > 0 && (
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>Las partes por separado suman</span>
                <span>S/ {sumaPartes.toFixed(2)}</span>
              </div>
              {precioCombo > 0 && (
                <div className={`flex justify-between font-medium ${ahorro >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  <span>{ahorro >= 0 ? 'El cliente ahorra' : 'El combo cuesta MÁS que las partes'}</span>
                  <span>S/ {Math.abs(ahorro).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={cerrarCombo} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={guardarCombo} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ChevronRight className="w-4 h-4 mr-2" />}
              Crear combo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
