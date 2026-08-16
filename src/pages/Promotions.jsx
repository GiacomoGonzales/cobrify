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
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import LoyaltyManager from '@/components/loyalty/LoyaltyManager'
import { getProducts, createProduct } from '@/services/firestoreService'
import { createRecipe } from '@/services/recipeService'
import { getLoyaltyCards } from '@/services/loyaltyService'

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
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [tab, setTab] = useState('fidelidad') // 'fidelidad' | 'combos'

  // ── Fidelización ──
  const [isLoyaltyOpen, setIsLoyaltyOpen] = useState(false)
  const [cardStats, setCardStats] = useState({ tarjetas: 0, sellos: 0, canjes: 0, cargando: true })

  // ── Combos ──
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [isComboOpen, setIsComboOpen] = useState(false)
  const [comboName, setComboName] = useState('')
  const [comboPrice, setComboPrice] = useState('')
  const [parts, setParts] = useState([]) // [{ product, quantity }]
  const [partSearch, setPartSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const businessId = getBusinessId()

  useEffect(() => {
    if (!businessId) return
    // Las estadísticas y el catálogo cargan por separado: si una falla, la otra vive.
    getLoyaltyCards(businessId)
      .then((cards) => {
        setCardStats({
          tarjetas: cards.length,
          sellos: cards.reduce((s, c) => s + (c.stamps || 0), 0),
          canjes: cards.reduce((s, c) => s + (c.rewardsRedeemed || 0), 0),
          cargando: false,
        })
      })
      .catch(() => setCardStats((p) => ({ ...p, cargando: false })))
    getProducts(businessId)
      .then((r) => setProducts(r?.data || []))
      .catch(() => {})
      .finally(() => setLoadingProducts(false))
  }, [businessId])

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
    setParts([])
    setPartSearch('')
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
        isCombo: true,
        trackStock: false, // el stock vive en las partes, no en el combo
      })
      if (!prod.success) throw new Error(prod.error)

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
      setProducts((prev) => [...prev, { id: prod.id, name: comboName.trim(), price: precioCombo, isCombo: true, category: 'Combos' }])
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
        <h1 className="text-2xl font-bold text-gray-900">Promociones</h1>
        <p className="text-gray-600">
          Fideliza a tus clientes y arma ofertas — todo desde un solo lugar
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'fidelidad', label: 'Tarjeta de sellos', icon: CreditCard },
          { id: 'combos', label: 'Combos', icon: Package },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
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

          <Card>
            <CardContent className="py-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Tarjeta digital para Apple y Google Wallet
                </h3>
                <p className="text-sm text-gray-600 mt-1 max-w-xl">
                  Diseña la tarjeta con tu logo y colores. Se comparte por WhatsApp con un solo
                  link que funciona en iPhone y Android; los sellos se dan desde la ficha del
                  cliente o al cobrar en el POS.
                </p>
              </div>
              <Button onClick={() => setIsLoyaltyOpen(true)} className="shrink-0">
                <Gift className="w-4 h-4 mr-2" />
                Configurar tarjeta
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── COMBOS ── */}
      {tab === 'combos' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Agrupa productos a un precio especial. El stock se descuenta de cada parte al vender.
            </p>
            <Button onClick={() => setIsComboOpen(true)}>
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
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{c.name}</p>
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

      {/* Configuración de la tarjeta (el mismo gestor que vivía en Clientes) */}
      <LoyaltyManager isOpen={isLoyaltyOpen} onClose={() => setIsLoyaltyOpen(false)} />

      {/* Creador de combos */}
      <Modal isOpen={isComboOpen} onClose={cerrarCombo} title="Crear combo">
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
