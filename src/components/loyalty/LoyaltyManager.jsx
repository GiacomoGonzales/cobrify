import { useState, useEffect, useMemo } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { Loader2, Send, Gift, MapPin, Search, Copy, Download, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import QRCode from 'qrcode'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import {
  WALLET_THEMES, resolveTheme, textoDeSellos, esColorClaro,
  MOTIVOS_PORTADA, celdasDeCuadricula, SELLOS_TARJETA,
} from '@/data/walletThemes'
import {
  DEFAULT_LOYALTY_CONFIG, getLoyaltyCards, redeemReward, getWalletPassLink,
  WALLET_EN_APROBACION, rewardLabel, programaVigente, vigenciaLegible,
} from '@/services/loyaltyService'
import { getProducts } from '@/services/firestoreService'
import { shortenUrl } from '@/services/urlShortenerService'
import { matchesSearchQuery } from '@/lib/utils'

/**
 * FIDELIZACIÓN — el panel completo, en la página de CLIENTES (15-ago-2026).
 *
 * Todo el programa vive acá y no en Configuración, a pedido: la tarjeta es un
 * asunto de clientes — acá está el teléfono (la llave), acá se busca al
 * cliente cuando viene a canjear, y acá se le manda su tarjeta por WhatsApp.
 *
 * El diseño de la tarjeta de Google Wallet se elige por TEMAS (galería), no
 * campo por campo: el comercio ve cuatro tarjetas pintadas, toca una y quedó
 * bien. Los valores se guardan RESUELTOS en loyaltyConfig.walletTheme
 * (ver src/data/walletThemes.js — única fuente de verdad de la tabla).
 */

/**
 * La franja de portada, dibujada en vivo con los MISMOS trazos que usa el
 * servidor para la imagen real (ver walletThemes.js). El logo va sobre una
 * pastilla blanca, igual que en la portada generada.
 */
function PortadaPreview({ colorFondo, motivo, logoUrl, sellos = 3, meta = 10, sello = 'check', className = '' }) {
  if (motivo === 'logo') {
    // La portada de logo es el logo apaisado tal cual, sobre blanco (así lo
    // sirve el servidor). Sin logo no hay franja que mostrar.
    return (
      <div className={`flex items-center justify-center bg-white ${className}`}>
        {logoUrl
          ? <img src={logoUrl} alt="" className="max-h-[70%] max-w-[70%] object-contain" />
          : <span className="text-[10px] text-gray-400">Sube tu logo en Configuración</span>}
      </div>
    )
  }
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ backgroundColor: colorFondo }}>
      {motivo === 'cuadricula' && (
        // La cuadrícula trae sus colores por elemento; el aspecto se preserva
        // (meet) para que los casilleros nunca salgan recortados.
        <svg viewBox="0 0 1032 336" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <g dangerouslySetInnerHTML={{ __html: celdasDeCuadricula(sellos, meta, colorFondo, sello) }} />
        </svg>
      )}
    </div>
  )
}

/**
 * Vista previa de la tarjeta, imitando la composición real de Google Wallet:
 * logo redondo + nombre arriba, el contador de sellos como protagonista y la
 * franja de portada. Sirve tanto de muestra de la galería (chica) como de
 * vista previa grande.
 */
function TarjetaPreview({ colorFondo, sellosComoPuntos, negocio, logoUrl, meta, premio, motivo, sello, grande = false }) {
  const claro = esColorClaro(colorFondo)
  const texto = claro ? 'text-gray-900' : 'text-white'
  const tenue = claro ? 'text-gray-500' : 'text-white/70'
  // Con la cuadrícula de portada el contador es numérico: el progreso ya está
  // dibujado abajo, repetirlo en puntos sería decirlo dos veces.
  const demo = motivo === 'cuadricula'
    ? `3 de ${Math.max(2, Number(meta) || 10)}`
    : textoDeSellos(3, Math.min(meta || 10, 10), sellosComoPuntos)
  return (
    <div
      className="rounded-2xl shadow-sm border border-black/10 w-full overflow-hidden"
      style={{ backgroundColor: colorFondo }}
    >
      <div className={grande ? 'p-4' : 'p-3'}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`${grande ? 'w-9 h-9' : 'w-7 h-7'} rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0 border border-black/10`}>
            {logoUrl
              ? <img src={logoUrl} alt="" className="w-full h-full object-contain" />
              : <span className="text-[10px] font-bold text-gray-600">{(negocio || 'N')[0]}</span>}
          </div>
          <div className="min-w-0">
            <p className={`${texto} ${grande ? 'text-sm' : 'text-xs'} font-semibold truncate`}>{negocio || 'Tu negocio'}</p>
            <p className={`${tenue} ${grande ? 'text-xs' : 'text-[10px]'} truncate`}>Tarjeta de sellos</p>
          </div>
        </div>
        <div className={grande ? 'mt-4' : 'mt-3'}>
          <p className={`${tenue} ${grande ? 'text-xs' : 'text-[10px]'}`}>Tus sellos</p>
          <p className={`${texto} ${grande ? 'text-xl' : 'text-sm'} font-semibold tracking-wide whitespace-nowrap overflow-hidden`}>
            {demo}
          </p>
        </div>
        {grande && premio && (
          <p className={`${tenue} text-xs mt-2 truncate`}>Premio: {premio}</p>
        )}
      </div>
      {/* La franja de portada solo en la vista grande: en las muestras de la
          galería competiría con lo que ahí se compara, que es el color. */}
      {grande && motivo && motivo !== 'none' && (
        <PortadaPreview
          colorFondo={colorFondo}
          motivo={motivo}
          logoUrl={logoUrl}
          sellos={3}
          meta={Math.max(2, Number(meta) || 10)}
          sello={sello}
          className={`${motivo === 'cuadricula' ? 'h-24' : 'h-14'} border-t ${esColorClaro(colorFondo) ? 'border-black/10' : 'border-white/15'}`}
        />
      )}
    </div>
  )
}

export default function LoyaltyManager({ isOpen, onClose }) {
  // TODOS los hooks antes de cualquier return condicional (React #310: un
  // hook bajo `if (!isOpen) return null` compila bien y revienta en runtime).
  const { getBusinessId, isDemoMode, businessSettings } = useAppContext()
  const toast = useToast()

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [config, setConfig] = useState({ ...DEFAULT_LOYALTY_CONFIG })
  // Buscador de producto para el premio (tipos 'product' y 'product_discount')
  const [productos, setProductos] = useState(null) // null = aún no cargados
  const [buscaPremio, setBuscaPremio] = useState('')
  const [buscandoPremio, setBuscandoPremio] = useState(false)
  const [tarjetas, setTarjetas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [accionandoId, setAccionandoId] = useState(null)
  // Link corto del formulario de registro ('' mientras se pide)
  const [linkCortoRegistro, setLinkCortoRegistro] = useState('')

  const logoUrl = businessSettings?.logoUrl || null
  // El nombre comercial vive en `name` (Settings guarda name = tradeName ||
  // businessName); `businessName` es la razon social y va al final.
  const nombreNegocio = businessSettings?.name || businessSettings?.tradeName || businessSettings?.businessName || ''

  useEffect(() => {
    if (!isOpen) return
    let cancelado = false
    const cargar = async () => {
      setCargando(true)
      try {
        const businessId = getBusinessId()
        const [snap, res] = await Promise.all([
          getDoc(doc(db, 'businesses', businessId)),
          getLoyaltyCards(businessId),
        ])
        if (cancelado) return
        const data = snap.exists() ? snap.data() : {}
        setConfig({
          ...DEFAULT_LOYALTY_CONFIG,
          ...(data.loyaltyConfig || {}),
          walletTheme: resolveTheme({
            temaId: data.loyaltyConfig?.walletTheme?.id,
            colorFondo: data.loyaltyConfig?.walletTheme?.colorFondo,
            // resolveTheme normaliza: sin guardar (o con un valor de los
            // patrones eliminados) cae a la cuadrícula.
            motivo: data.loyaltyConfig?.walletTheme?.motivo,
            sello: data.loyaltyConfig?.walletTheme?.sello,
          }),
        })
        setTarjetas(res.success ? res.data : [])
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [isOpen, getBusinessId])

  const tarjetasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return tarjetas
    return tarjetas.filter(t =>
      (t.customerName || '').toLowerCase().includes(q) || String(t.phone || '').includes(q))
  }, [tarjetas, busqueda])

  // Catálogo para el buscador del premio. Se carga UNA vez y solo cuando el
  // premio es un producto — la mayoría de negocios nunca paga esta consulta.
  // OJO: hook ANTES del early return de abajo (regla del proyecto, React #310).
  useEffect(() => {
    const esProducto = config.rewardType === 'product' || config.rewardType === 'product_discount'
    if (!isOpen || !esProducto || productos !== null) return
    let cancelado = false
    ;(async () => {
      setBuscandoPremio(true)
      try {
        const r = await getProducts(getBusinessId())
        if (!cancelado) {
          setProductos((r.success ? r.data : [])
            .filter(p => p.active !== false)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '')))
        }
      } finally {
        if (!cancelado) setBuscandoPremio(false)
      }
    })()
    return () => { cancelado = true }
  }, [isOpen, config.rewardType, productos, getBusinessId])

  // Link corto del formulario de registro. Se pide UNA vez por apertura y solo
  // si el programa está activo (la sección del QR ni se muestra si no).
  // createShortUrl reutiliza el código cuando la URL ya existe, así que el
  // cbrfy.link es SIEMPRE el mismo para el negocio: el QR que imprimió el mes
  // pasado sigue sirviendo. Si el acortador falla, shortenUrl devuelve la URL
  // larga y el QR funciona igual — solo se ve más feo.
  // OJO: hook ANTES del early return (regla del proyecto, React #310).
  useEffect(() => {
    if (!isOpen || isDemoMode || !config.enabled || linkCortoRegistro) return
    let cancelado = false
    const businessId = getBusinessId()
    ;(async () => {
      const corto = await shortenUrl(`${window.location.origin}/registro/${businessId}`, businessId)
      if (!cancelado) setLinkCortoRegistro(corto)
    })()
    return () => { cancelado = true }
  }, [isOpen, isDemoMode, config.enabled, linkCortoRegistro, getBusinessId])

  if (!isOpen) return null

  const tema = config.walletTheme || resolveTheme()

  const elegirTema = (temaId) => {
    // Al cambiar de tema se toma SU color; el color personalizado es un ajuste
    // sobre el tema elegido, no un valor que sobrevive de tema en tema. El
    // motivo sí sobrevive: es una elección aparte del color.
    setConfig({ ...config, walletTheme: resolveTheme({ temaId, motivo: tema.motivo, sello: tema.sello }) })
  }

  const cambiarColor = (colorFondo) => {
    setConfig({ ...config, walletTheme: resolveTheme({ temaId: tema.id, colorFondo, motivo: tema.motivo, sello: tema.sello }) })
  }

  const elegirMotivo = (motivo) => {
    setConfig({ ...config, walletTheme: resolveTheme({ temaId: tema.id, colorFondo: tema.colorFondo, motivo, sello: tema.sello }) })
  }

  const elegirSello = (sello) => {
    setConfig({ ...config, walletTheme: resolveTheme({ temaId: tema.id, colorFondo: tema.colorFondo, motivo: tema.motivo, sello }) })
  }

  const guardar = async () => {
    if (isDemoMode) { toast.error('En modo demo no se guardan cambios'); return }

    // Validación del premio estructurado: guardar un premio a medias dejaría
    // al cajero con un botón de canje que no sabe qué aplicar.
    if (config.enabled) {
      const t = config.rewardType || 'text'
      if ((t === 'product' || t === 'product_discount') && !config.rewardProductId) {
        toast.error('Elige el producto del premio'); return
      }
      if (t === 'product_discount' && !(Number(config.rewardSpecialPrice) > 0)) {
        toast.error('Indica el precio especial de canje'); return
      }
      if (t === 'discount') {
        const v = Number(config.rewardDiscountValue) || 0
        if (v <= 0) { toast.error('Indica el valor del descuento'); return }
        if (config.rewardDiscountType !== 'amount' && v > 100) { toast.error('El descuento no puede pasar de 100%'); return }
      }
      if (t === 'text' && !(config.reward || '').trim()) {
        toast.error('Describe el premio'); return
      }
      if (config.earnMode === 'amount' && !(Number(config.amountPerStamp) > 0)) {
        toast.error('Indica cuántos soles valen un sello'); return
      }
    }

    setGuardando(true)
    try {
      const tipoPremio = config.rewardType || 'text'
      // La etiqueta visible se genera desde el tipo (texto libre manda la suya).
      const etiqueta = tipoPremio === 'text'
        ? (config.reward || '').trim()
        : rewardLabel(config)
      await setDoc(doc(db, 'businesses', getBusinessId()), {
        loyaltyConfig: {
          enabled: !!config.enabled,
          goal: Math.max(2, Number(config.goal) || 10),
          reward: etiqueta,
          rewardType: tipoPremio,
          rewardProductId: (tipoPremio === 'product' || tipoPremio === 'product_discount') ? (config.rewardProductId || null) : null,
          rewardProductName: (tipoPremio === 'product' || tipoPremio === 'product_discount') ? (config.rewardProductName || '') : '',
          rewardSpecialPrice: tipoPremio === 'product_discount' ? (Number(config.rewardSpecialPrice) || 0) : 0,
          rewardDiscountType: config.rewardDiscountType === 'amount' ? 'amount' : 'percent',
          rewardDiscountValue: tipoPremio === 'discount' ? (Number(config.rewardDiscountValue) || 0) : 0,
          earnMode: config.earnMode === 'amount' ? 'amount' : 'visit',
          amountPerStamp: Number(config.amountPerStamp) || 20,
          maxStampsPerSale: Number(config.maxStampsPerSale) || 0,
          minAmount: Number(config.minAmount) || 0,
          programEndDate: (config.programEndDate || '').trim(),
          stampExpiryMonths: Number(config.stampExpiryMonths) || 0,
          stampOnlineOrders: config.stampOnlineOrders !== false,
          // Formulario público de registro (el QR de mesa)
          welcomeStamps: Math.max(0, Math.min(5, Number(config.welcomeStamps) || 0)),
          registerIncentiveText: (config.registerIncentiveText || '').trim(),
          walletTheme: resolveTheme({ temaId: tema.id, colorFondo: tema.colorFondo, motivo: tema.motivo, sello: tema.sello }),
          walletNearby: config.walletNearby !== false,
          walletMessage: (config.walletMessage || '').trim(),
        },
      }, { merge: true })
      toast.success('Programa de fidelización guardado')
    } catch (error) {
      console.error('Error al guardar fidelización:', error)
      toast.error('No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  // ── Registro público: el link del QR de mesa ──
  // El id del negocio en la URL no es un secreto (ya viaja en el catálogo y
  // en los links de Wallet); la función del servidor valida todo igual. Se
  // muestra el cbrfy.link — cabe en un afiche y se dicta por teléfono — y
  // mientras llega se usa la URL larga, que ya es válida.
  const linkRegistroLargo = isDemoMode ? '' : `${window.location.origin}/registro/${getBusinessId()}`
  const linkRegistro = linkCortoRegistro || linkRegistroLargo

  const copiarLinkRegistro = async () => {
    try {
      await navigator.clipboard.writeText(linkRegistro)
      toast.success('Link copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const descargarQrRegistro = async () => {
    try {
      // PNG grande (nítido para imprimir en la mesa) con margen blanco.
      const dataUrl = await QRCode.toDataURL(linkRegistro, { width: 1024, margin: 2 })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = 'qr-registro-sellos.png'
      a.click()
    } catch {
      toast.error('No se pudo generar el QR')
    }
  }

  const enviarTarjeta = async (tarjeta) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setAccionandoId(`wa_${tarjeta.id}`)
    try {
      const idToken = await getAuth().currentUser?.getIdToken()
      const res = await getWalletPassLink(getBusinessId(), tarjeta.phone, idToken)
      if (!res.success) { toast.error(res.error || 'No se pudo generar la tarjeta'); return }
      // El link corto (cbrfy.link, el mismo acortador de los PDFs); el largo
      // es un JWT de ~800 caracteres.
      const texto = `Hola! Esta es tu tarjeta de sellos de ${nombreNegocio || 'nuestro negocio'}. ` +
        `Ya tienes ${res.stamps} de ${res.goal}. Agregala a tu celular: ${res.shortUrl || res.url}`
      const digitos = String(tarjeta.phone).replace(/\D/g, '')
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
      const res = await redeemReward(getBusinessId(), tarjeta.phone, { config })
      if (!res.success) { toast.error(res.error || 'No se pudo canjear'); return }
      toast.success(`Premio canjeado. Le quedan ${res.stamps} sellos`)
      setTarjetas(prev => prev.map(t => t.id === tarjeta.id
        ? { ...t, stamps: res.stamps, rewardsRedeemed: (t.rewardsRedeemed || 0) + 1 }
        : t))
    } finally {
      setAccionandoId(null)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Fidelización — tarjeta de sellos" size="xl" fullScreenMobile>
      {cargando ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Programa ─────────────────────────────────────────────── */}
          <section>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                checked={!!config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Programa activado</span>
                <span className="block text-xs text-gray-500">
                  Cada compra suma un sello a la tarjeta del cliente (se identifica por su teléfono).
                  Al llegar a la meta gana el premio.
                </span>
              </span>
            </label>

            {config.enabled && (
              <div className="mt-4 space-y-4">
                {/* ── Cómo se ganan los sellos ────────────────────────── */}
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-2">Cómo se ganan los sellos</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { k: 'visit', titulo: 'Por visita', detalle: 'Cada compra suma 1 sello. Premia que el cliente vuelva (cafetería, barbería, restaurante).' },
                      { k: 'amount', titulo: 'Por monto de compra', detalle: 'Un sello por cada S/ X de compra. Premia cuánto gasta (botica, ferretería, ropa).' },
                    ].map(m => (
                      <button
                        key={m.k}
                        type="button"
                        onClick={() => setConfig({ ...config, earnMode: m.k })}
                        className={`text-left p-3 rounded-lg border transition-colors ${(config.earnMode || 'visit') === m.k ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}
                      >
                        <span className="block text-sm font-medium text-gray-900">{m.titulo}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">{m.detalle}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      label="Sellos para el premio"
                      type="number" min="2" max="50"
                      value={config.goal}
                      onChange={(e) => setConfig({ ...config, goal: e.target.value })}
                    />
                    {(config.earnMode || 'visit') === 'visit' ? (
                      <Input
                        label="Compra mínima (S/)"
                        type="number" min="0" step="0.01"
                        value={config.minAmount}
                        onChange={(e) => setConfig({ ...config, minAmount: e.target.value })}
                        placeholder="0 = cualquier compra"
                      />
                    ) : (
                      <>
                        <Input
                          label="Soles por sello (S/)"
                          type="number" min="1" step="0.01"
                          value={config.amountPerStamp}
                          onChange={(e) => setConfig({ ...config, amountPerStamp: e.target.value })}
                          placeholder="Ej: 20 = 1 sello por cada S/ 20"
                        />
                        <Input
                          label="Tope de sellos por venta"
                          type="number" min="0" step="1"
                          value={config.maxStampsPerSale}
                          onChange={(e) => setConfig({ ...config, maxStampsPerSale: e.target.value })}
                          placeholder="0 = sin tope"
                        />
                      </>
                    )}
                  </div>
                  {(config.earnMode || 'visit') === 'amount' && (
                    <p className="mt-1.5 text-xs text-gray-500">
                      El vuelto no se arrastra: una compra de S/ {Number(config.amountPerStamp) > 0 ? (Number(config.amountPerStamp) * 2 + Number(config.amountPerStamp) / 2).toFixed(0) : 50} con
                      sellos de S/ {Number(config.amountPerStamp) || 20} da 2 sellos.
                    </p>
                  )}
                </div>

                {/* ── El premio ───────────────────────────────────────── */}
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-2">El premio al completar la tarjeta</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { k: 'product', label: 'Producto gratis' },
                      { k: 'product_discount', label: 'Producto a precio especial' },
                      { k: 'discount', label: 'Descuento en la compra' },
                      { k: 'text', label: 'Otro (texto libre)' },
                    ].map(t => (
                      <button
                        key={t.k}
                        type="button"
                        onClick={() => setConfig({ ...config, rewardType: t.k })}
                        className={`px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${(config.rewardType || 'text') === t.k ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Producto (gratis o a precio especial): buscador sobre el catálogo */}
                  {(config.rewardType === 'product' || config.rewardType === 'product_discount') && (
                    <div className="mt-3 space-y-2">
                      {config.rewardProductId ? (
                        <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg px-3 py-2">
                          <span className="text-sm font-medium text-gray-900 truncate">{config.rewardProductName}</span>
                          <button
                            type="button"
                            onClick={() => { setConfig({ ...config, rewardProductId: null, rewardProductName: '' }); setBuscaPremio('') }}
                            className="text-xs text-primary-600 hover:underline flex-shrink-0 ml-2"
                          >
                            Cambiar
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={buscaPremio}
                            onChange={(e) => setBuscaPremio(e.target.value)}
                            placeholder={buscandoPremio ? 'Cargando tu catálogo…' : 'Busca el producto del premio…'}
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          {buscaPremio.trim() && (productos || []).length > 0 && (
                            <div className="absolute z-20 mt-1 w-full max-h-44 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg divide-y">
                              {(productos || []).filter(p => matchesSearchQuery(buscaPremio, p.name)).slice(0, 8).map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    setConfig({ ...config, rewardProductId: p.id, rewardProductName: p.name || '' })
                                    setBuscaPremio('')
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2"
                                >
                                  <span className="truncate">{p.name}</span>
                                  {p.price != null && <span className="text-xs text-gray-400 flex-shrink-0">S/ {Number(p.price).toFixed(2)}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {config.rewardType === 'product_discount' && (
                        <Input
                          label="Precio especial de canje (S/)"
                          type="number" min="0.1" step="0.01"
                          value={config.rewardSpecialPrice}
                          onChange={(e) => setConfig({ ...config, rewardSpecialPrice: e.target.value })}
                          placeholder="Lo que paga el cliente al canjear"
                        />
                      )}
                    </div>
                  )}

                  {/* Descuento en la compra */}
                  {config.rewardType === 'discount' && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                          {[{ k: 'percent', l: '%' }, { k: 'amount', l: 'S/' }].map(o => (
                            <button
                              key={o.k}
                              type="button"
                              onClick={() => setConfig({ ...config, rewardDiscountType: o.k })}
                              className={`flex-1 px-2 py-1.5 text-sm font-medium rounded-md transition-colors ${(config.rewardDiscountType || 'percent') === o.k ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}
                            >
                              {o.l}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Input
                        label={config.rewardDiscountType === 'amount' ? 'Descuento (S/)' : 'Descuento (%)'}
                        type="number" min="0.1" step="0.01"
                        value={config.rewardDiscountValue}
                        onChange={(e) => setConfig({ ...config, rewardDiscountValue: e.target.value })}
                      />
                    </div>
                  )}

                  {/* Texto libre (premios fuera del sistema: "una clase gratis") */}
                  {(config.rewardType || 'text') === 'text' && (
                    <div className="mt-3">
                      <Input
                        label="Premio"
                        value={config.reward}
                        onChange={(e) => setConfig({ ...config, reward: e.target.value })}
                        placeholder="Ej: 1 pizza mediana gratis"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Con texto libre el canje es manual: el sistema descuenta los sellos y el cajero entrega el premio.
                        Con los otros tipos, el premio se aplica solo a la venta.
                      </p>
                    </div>
                  )}

                  {config.rewardType && config.rewardType !== 'text' && (
                    <p className="mt-2 text-xs text-gray-500">
                      En la tarjeta y el POS se mostrará: <span className="font-medium text-gray-700">{rewardLabel(config) || '—'}</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {config.enabled && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  <Input
                    label="Válido hasta (opcional)"
                    type="date"
                    value={config.programEndDate || ''}
                    onChange={(e) => setConfig({ ...config, programEndDate: e.target.value })}
                  />
                  <Input
                    label="Los sellos vencen a los (meses)"
                    type="number" min="0" max="60" step="1"
                    value={config.stampExpiryMonths}
                    onChange={(e) => setConfig({ ...config, stampExpiryMonths: e.target.value })}
                    placeholder="0 = no vencen"
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {Number(config.stampExpiryMonths) > 0
                    ? <span>Cada sello muere a los <strong>{config.stampExpiryMonths} meses</strong> de ganado, uno por uno. Al canjear se usan primero los más viejos. El cliente ve en su tarjeta cuándo vencen los suyos — es lo que lo hace volver antes.</span>
                    : <span>Con 0 los sellos no vencen. Puedes usar esto en vez de (o junto a) la fecha fija: es más justo con el cliente nuevo, porque su reloj empieza el día que compra.</span>}
                </p>
                <div className="mt-3">
                  <div className="text-xs text-gray-500">
                    {config.programEndDate ? (
                      programaVigente(config)
                        ? <span>Pasado el <strong>{vigenciaLegible(config)}</strong> no se suman sellos ni se canjean premios. La fecha sale impresa en la tarjeta del cliente.</span>
                        : <span className="text-red-600 font-medium">El programa está vencido desde el {vigenciaLegible(config)}: no se suman sellos ni se canjean premios.</span>
                    ) : (
                      <span>Déjalo vacío y el programa no vence. Con fecha, evitas que alguien aparezca años después con una tarjeta llena a reclamar el premio.</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {config.enabled && (
              <label className="mt-3 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={config.stampOnlineOrders !== false}
                  onChange={(e) => setConfig({ ...config, stampOnlineOrders: e.target.checked })}
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">Sellar también los pedidos online</span>
                  <span className="block text-xs text-gray-500">
                    Al completar un pedido del catálogo, el cliente suma su sello por el teléfono del pedido.
                  </span>
                </span>
              </label>
            )}
          </section>

          {/* ── Registro de clientes: el QR de mesa ──────────────────── */}
          {config.enabled && (
            <section className="border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-gray-400" />
                Registro de clientes (QR de mesa)
              </h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">
                Imprime este QR y ponlo en tus mesas o en el mostrador. El cliente se registra
                solo desde su celular, queda en tu lista de clientes y recibe al instante su
                tarjeta de sellos para agregarla a Google Wallet o Apple Wallet.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div>
                  <Input
                    label="Sellos de regalo al registrarse (0 a 5)"
                    type="number" min="0" max="5" step="1"
                    value={config.welcomeStamps ?? 0}
                    onChange={(e) => setConfig({ ...config, welcomeStamps: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Con 0 no se regala nada: el registro igual crea la tarjeta.
                  </p>
                </div>
                <div>
                  <Input
                    label="Gancho del formulario (opcional)"
                    value={config.registerIncentiveText || ''}
                    onChange={(e) => setConfig({ ...config, registerIncentiveText: e.target.value })}
                    placeholder="Ej: Regístrate y participa del sorteo mensual"
                    maxLength={90}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Texto libre que se muestra arriba del formulario. Si lo dejas vacío y regalas
                    sellos, el formulario anuncia los sellos de regalo.
                  </p>
                </div>
              </div>

              {!isDemoMode && (
                <div className="mt-4 flex flex-col sm:flex-row gap-4 items-start">
                  <div className="bg-white border border-gray-200 rounded-xl p-3 shrink-0 w-[152px] h-[152px] flex items-center justify-center">
                    {linkCortoRegistro
                      ? <QRCodeSVG value={linkRegistro} size={128} />
                      : <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500 mb-1">Link de registro</p>
                    <p className="text-sm text-gray-800 break-all bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      {linkCortoRegistro || 'Generando el link corto...'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm"
                        onClick={copiarLinkRegistro} disabled={!linkCortoRegistro}>
                        <Copy className="w-4 h-4 mr-1.5" />
                        Copiar link
                      </Button>
                      <Button type="button" variant="outline" size="sm"
                        onClick={descargarQrRegistro} disabled={!linkCortoRegistro}>
                        <Download className="w-4 h-4 mr-1.5" />
                        Descargar QR
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Recuerda <span className="font-medium text-gray-700">guardar</span> después de
                      cambiar el regalo o el gancho: el formulario muestra lo guardado.
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Diseño de la tarjeta (Google Wallet) ─────────────────── */}
          {config.enabled && (
            <section className="border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-900">Diseño de la tarjeta</h3>
              <p className="text-xs text-gray-500 mb-3">
                Así se ve en Google Wallet, en el celular del cliente. Elige un tema; el logo y los
                datos salen solos de tu negocio.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {WALLET_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => elegirTema(t.id)}
                    className={`text-left rounded-2xl transition ring-offset-2 ${tema.id === t.id ? 'ring-2 ring-primary-500' : 'hover:ring-2 hover:ring-gray-200'}`}
                    title={t.descripcion}
                  >
                    <TarjetaPreview
                      colorFondo={t.id === tema.id ? tema.colorFondo : t.colorFondo}
                      sellosComoPuntos={t.sellosComoPuntos}
                      negocio={nombreNegocio}
                      logoUrl={logoUrl}
                      meta={config.goal}
                    />
                    <p className="text-xs text-center text-gray-600 mt-1">{t.nombre}</p>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  Color de la tarjeta
                  <input
                    type="color"
                    value={tema.colorFondo}
                    onChange={(e) => cambiarColor(e.target.value)}
                    className="h-8 w-12 rounded border border-gray-200 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400 font-mono">{tema.colorFondo}</span>
                </label>
              </div>

              {/* Portada: la franja de la tarjeta. La cuadrícula es la opción
                  fuerte — dibuja los sellos del cliente y se actualiza en cada
                  compra; con ella el contador pasa a número. */}
              <div className="mt-5">
                <p className="text-sm font-medium text-gray-900">Portada de la tarjeta</p>
                <p className="text-xs text-gray-500 mb-2">
                  La cuadrícula muestra los sellos del cliente como casilleros y se actualiza sola en cada compra.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {MOTIVOS_PORTADA.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => elegirMotivo(m.id)}
                      className={`rounded-xl overflow-hidden text-left transition ring-offset-1 ${tema.motivo === m.id ? 'ring-2 ring-primary-500' : 'hover:ring-2 hover:ring-gray-200'}`}
                    >
                      <PortadaPreview
                        colorFondo={tema.colorFondo}
                        motivo={m.id}
                        logoUrl={logoUrl}
                        sellos={3}
                        meta={Math.max(2, Number(config.goal) || 10)}
                        sello={tema.sello}
                        className="h-14 rounded-xl border border-gray-200"
                      />
                      <p className="text-[11px] text-center text-gray-600 mt-1">{m.nombre}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* El icono del sello, solo con cuadrícula: es lo que se estampa
                  en los casilleros llenos. */}
              {tema.motivo === 'cuadricula' && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-900 mb-2">Tu sello</p>
                  <div className="flex flex-wrap gap-2">
                    {SELLOS_TARJETA.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        title={s.nombre}
                        onClick={() => elegirSello(s.id)}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition border ${tema.sello === s.id
                          ? 'border-primary-500 ring-2 ring-primary-200'
                          : 'border-gray-200 hover:border-gray-300'}`}
                        style={{ backgroundColor: tema.colorFondo }}
                      >
                        <svg viewBox="0 0 64 64" className="w-7 h-7">
                          <g
                            fill="none"
                            stroke={esColorClaro(tema.colorFondo) ? '#1f2937' : '#ffffff'}
                            strokeWidth={s.grosor}
                            strokeLinecap="round" strokeLinejoin="round"
                            dangerouslySetInnerHTML={{ __html: s.trazo }}
                          />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <Input
                  label="Mensaje en la tarjeta (opcional)"
                  value={config.walletMessage || ''}
                  onChange={(e) => setConfig({ ...config, walletMessage: e.target.value })}
                  placeholder="Ej: Gracias por tu preferencia. Presenta este QR al pagar."
                  maxLength={120}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Sale como una fila más en la tarjeta, con el nombre de tu negocio de título.
                </p>
              </div>

              {/* Vista previa completa: cuerpo + portada, como queda en el celular */}
              <div className="mt-5">
                <p className="text-sm font-medium text-gray-900 mb-2">Así queda tu tarjeta</p>
                <div className="max-w-xs">
                  <TarjetaPreview
                    colorFondo={tema.colorFondo}
                    sellosComoPuntos={tema.sellosComoPuntos}
                    negocio={nombreNegocio}
                    logoUrl={logoUrl}
                    meta={config.goal}
                    premio={config.rewardType && config.rewardType !== 'text' ? rewardLabel(config) : config.reward}
                    motivo={tema.motivo}
                    sello={tema.sello}
                    grande
                  />
                </div>
              </div>

              <label className="mt-4 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={config.walletNearby !== false}
                  onChange={(e) => setConfig({ ...config, walletNearby: e.target.checked })}
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                    <MapPin className="w-3.5 h-3.5" />
                    Aparecer cuando el cliente esté cerca
                  </span>
                  <span className="block text-xs text-gray-500">
                    La tarjeta asoma sola en la pantalla de bloqueo del cliente cuando pasa cerca de tu
                    local. Usa la dirección de tu negocio; si no se puede ubicar con precisión,
                    simplemente no se activa.
                  </span>
                </span>
              </label>
            </section>
          )}

          {/* ── Tarjetas de los clientes ─────────────────────────────── */}
          <section className="border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Tarjetas de clientes
                {tarjetas.length > 0 && <span className="ml-2 text-xs font-normal text-gray-400">{tarjetas.length}</span>}
              </h3>
              {tarjetas.length > 3 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Nombre o teléfono"
                    className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              )}
            </div>

            {tarjetasFiltradas.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                {tarjetas.length === 0
                  ? 'Todavía no hay tarjetas. Se crean solas con la primera compra de un cliente con teléfono.'
                  : 'Ninguna tarjeta coincide con la búsqueda.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {tarjetasFiltradas.map((t) => {
                  const meta = t.goal || Number(config.goal) || 10
                  const listo = (t.stamps || 0) >= meta
                  return (
                    <li key={t.id} className="py-2.5 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {t.customerName || 'Sin nombre'}
                          {listo && <Badge variant="warning" className="ml-2">Premio listo</Badge>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t.phone} · <span className="tracking-wide">{textoDeSellos(t.stamps || 0, meta, tema.sellosComoPuntos)}</span>
                          {(t.rewardsRedeemed || 0) > 0 && ` · ${t.rewardsRedeemed} ${t.rewardsRedeemed === 1 ? 'canje' : 'canjes'}`}
                        </p>
                      </div>
                      {listo && (
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
          </section>

          {/* ── Guardar ──────────────────────────────────────────────── */}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <Button variant="outline" onClick={onClose}>Cerrar</Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Guardar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
