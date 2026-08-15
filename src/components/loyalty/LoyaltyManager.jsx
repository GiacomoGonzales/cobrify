import { useState, useEffect, useMemo } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { Loader2, Send, Gift, MapPin, Search } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import {
  WALLET_THEMES, resolveTheme, textoDeSellos, esColorClaro,
} from '@/data/walletThemes'
import {
  DEFAULT_LOYALTY_CONFIG, getLoyaltyCards, redeemReward, getWalletPassLink,
} from '@/services/loyaltyService'

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
 * Vista previa de la tarjeta, imitando la composición real de Google Wallet:
 * logo redondo + nombre arriba, el contador de sellos como protagonista.
 * Sirve tanto de muestra de la galería (chica) como de vista previa grande.
 */
function TarjetaPreview({ colorFondo, sellosComoPuntos, negocio, logoUrl, meta, premio, grande = false }) {
  const claro = esColorClaro(colorFondo)
  const texto = claro ? 'text-gray-900' : 'text-white'
  const tenue = claro ? 'text-gray-500' : 'text-white/70'
  const demo = textoDeSellos(3, Math.min(meta || 10, 10), sellosComoPuntos)
  return (
    <div
      className={`rounded-2xl shadow-sm border border-black/10 ${grande ? 'p-4' : 'p-3'} w-full`}
      style={{ backgroundColor: colorFondo }}
    >
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
  const [tarjetas, setTarjetas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [accionandoId, setAccionandoId] = useState(null)

  const logoUrl = businessSettings?.logoUrl || null
  const nombreNegocio = businessSettings?.tradeName || businessSettings?.businessName || businessSettings?.name || ''

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

  if (!isOpen) return null

  const tema = config.walletTheme || resolveTheme()

  const elegirTema = (temaId) => {
    // Al cambiar de tema se toma SU color; el color personalizado es un ajuste
    // sobre el tema elegido, no un valor que sobrevive de tema en tema.
    setConfig({ ...config, walletTheme: resolveTheme({ temaId }) })
  }

  const cambiarColor = (colorFondo) => {
    setConfig({ ...config, walletTheme: resolveTheme({ temaId: tema.id, colorFondo }) })
  }

  const guardar = async () => {
    if (isDemoMode) { toast.error('En modo demo no se guardan cambios'); return }
    setGuardando(true)
    try {
      await setDoc(doc(db, 'businesses', getBusinessId()), {
        loyaltyConfig: {
          enabled: !!config.enabled,
          goal: Math.max(2, Number(config.goal) || 10),
          reward: (config.reward || '').trim(),
          minAmount: Number(config.minAmount) || 0,
          stampOnlineOrders: config.stampOnlineOrders !== false,
          walletTheme: resolveTheme({ temaId: tema.id, colorFondo: tema.colorFondo }),
          walletNearby: config.walletNearby !== false,
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

  const enviarTarjeta = async (tarjeta) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    setAccionandoId(`wa_${tarjeta.id}`)
    try {
      const idToken = await getAuth().currentUser?.getIdToken()
      const res = await getWalletPassLink(getBusinessId(), tarjeta.phone, idToken)
      if (!res.success) { toast.error(res.error || 'No se pudo generar la tarjeta'); return }
      const texto = `Hola! Esta es tu tarjeta de sellos de ${nombreNegocio || 'nuestro negocio'}. ` +
        `Ya tienes ${res.stamps} de ${res.goal}. Agregala a tu celular: ${res.url}`
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
      const res = await redeemReward(getBusinessId(), tarjeta.phone)
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
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Sellos para el premio"
                  type="number" min="2" max="50"
                  value={config.goal}
                  onChange={(e) => setConfig({ ...config, goal: e.target.value })}
                />
                <Input
                  label="Compra mínima (S/)"
                  type="number" min="0" step="0.01"
                  value={config.minAmount}
                  onChange={(e) => setConfig({ ...config, minAmount: e.target.value })}
                  placeholder="0 = cualquier compra"
                />
                <Input
                  label="Premio"
                  value={config.reward}
                  onChange={(e) => setConfig({ ...config, reward: e.target.value })}
                  placeholder="Ej: 1 pizza mediana gratis"
                />
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
                        title="Enviar su tarjeta por WhatsApp"
                        disabled={accionandoId === `wa_${t.id}`}
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
