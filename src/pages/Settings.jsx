/**
 * CONFIGURACIÓN — la cáscara.
 *
 * Solo la barra de pestañas, el título y el enrutado. Cada pestaña vive en su
 * propio archivo bajo `src/pages/settings/`, carga bajo demanda, y guarda
 * SOLO sus propios campos con `useGuardado`.
 *
 * ── Por qué se partió ───────────────────────────────────────────────────────
 * Hasta setiembre de 2026 esto era un solo componente de 14.100 líneas con
 * 268 `useState` y 21 puntos de escritura sobre el mismo documento. Cada
 * botón "Guardar" escribía campos que no le pertenecían con el valor que
 * cargó al abrir la página, así que guardar el RUC podía revertir el color
 * del PDF que otra caja acababa de cambiar. Y el catálogo del menú lateral
 * estaba escrito ocho veces. La auditoría del 4-sep-2026 está en el manual
 * de decisiones; el resumen: no se desordenaba por cómo estaban agrupadas
 * las cajas, sino por cómo se guardaban.
 *
 * ── Las siete pestañas ──────────────────────────────────────────────────────
 * Cada una responde a una pregunta del usuario, y un ajuste vive donde
 * responde esa pregunta, no donde encaje en el código:
 *
 *   empresa        ¿Quién soy ante SUNAT?         identidad y datos legales
 *   series         ¿Cómo numero?                  correlativos, con riesgo fiscal propio
 *   ventas         ¿Cómo se comporta mi caja?     punto de venta
 *   impresion      ¿Cómo se ve mi comprobante?    ticket, PDF, impresora
 *   modulos        ¿Qué partes de la app tengo?   tipo de negocio, opcionales, menú
 *   integraciones  ¿Con qué me conecto?           Rappi, Tienda Online, Meta Ads
 *   cuenta         ¿Quién entra y qué ve?         usuario, sub-usuarios, avisos
 *
 * `catalogo` no va en la barra: se llega por su propio ítem del menú lateral
 * y se muestra como página aparte (modo standalone), como siempre.
 *
 * ── Enlaces viejos ──────────────────────────────────────────────────────────
 * El manual enlaza a `?tab=X&opcion=<flag>` con los nombres de antes. Se
 * traducen acá (`PESTANA_VIEJA` y `OPCION_A_PESTANA`) para que ningún enlace
 * de una guía se rompa por la reorganización.
 */
import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import GuideLink from '@/components/guide/GuideLink'
import { Nota } from '@/components/settings/kit'
import { useAppContext } from '@/hooks/useAppContext'

const MiEmpresa = lazy(() => import('./settings/MiEmpresa'))
const Series = lazy(() => import('./settings/Series'))
const PuntoDeVenta = lazy(() => import('./settings/PuntoDeVenta'))
const Impresion = lazy(() => import('./settings/Impresion'))
const Modulos = lazy(() => import('./settings/Modulos'))
const Integraciones = lazy(() => import('./settings/Integraciones'))
const Cuenta = lazy(() => import('./settings/Cuenta'))
const Catalogo = lazy(() => import('./settings/Catalogo'))

const PESTANAS = [
  { id: 'empresa', label: 'Mi Empresa', Componente: MiEmpresa },
  { id: 'series', label: 'Series', Componente: Series },
  { id: 'ventas', label: 'Punto de venta', Componente: PuntoDeVenta },
  { id: 'impresion', label: 'Impresión', Componente: Impresion },
  { id: 'modulos', label: 'Módulos', Componente: Modulos },
  { id: 'integraciones', label: 'Integraciones', Componente: Integraciones },
  { id: 'cuenta', label: 'Cuenta y seguridad', Componente: Cuenta },
]

/** Los ids de antes de la reorganización → a dónde fue a parar cada pestaña. */
const PESTANA_VIEJA = {
  informacion: 'empresa',
  preferencias: 'modulos',
  documentos: 'impresion',
  impresora: 'impresion',
  seguridad: 'cuenta',
  notificaciones: 'cuenta',
  limpieza: 'cuenta',
  rappi: 'integraciones',
  shopifree: 'integraciones',
}

/**
 * Los ajustes que cambiaron de pestaña. Cuando el enlace trae `opcion`, esto
 * manda por encima del `tab`: la guía puede decir `tab=documentos`, pero si
 * el ajuste ahora vive en Cuenta, se abre Cuenta.
 */
const OPCION_A_PESTANA = {
  // Ventas → Impresión
  autoPrintTicket: 'impresion',
  hideCompanyDataInNotaVenta: 'impresion',
  hideRucIgvInNotaVenta: 'impresion',
  hideOnlyIgvInNotaVenta: 'impresion',
  // Ventas → Módulos
  branchPricingEnabled: 'modulos',
  branchCatalogEnabled: 'modulos',
  multiplePricesEnabled: 'modulos',
  multiCurrencyEnabled: 'modulos',
  reportsCurrency: 'modulos',
  defaultCurrency: 'modulos',
  stockDischargeEnabled: 'modulos',
  // Preferencias → Punto de venta
  enableManualStockEdit: 'ventas',
  defaultTaxAffectation: 'ventas',
  enableProductLocation: 'ventas',
  allowManualTaxAffectation: 'ventas',
  showBatchExpiryInPurchase: 'ventas',
  defaultDeliveryFee: 'ventas',
  // Preferencias → Impresión
  enableCustomerDisplay: 'impresion',
  showCustomerDataOnKitchenTicket: 'impresion',
  // Preferencias → Integraciones
  metaAdsEnabled: 'integraciones',
  rappiEnabled: 'integraciones',
  shopifreeEnabled: 'integraciones',
  // Documentos → Cuenta
  hideDashboardDataFromSecondary: 'cuenta',
  hideCashExpectedFromCashier: 'cuenta',
  showOnlyOwnSalesToSecondary: 'cuenta',
  // Documentos → Punto de venta
  autoSendToSunat: 'ventas',
  allowDeleteInvoices: 'ventas',
  purchaseOrderDefaultNotes: 'ventas',
  // Documentos → Módulos
  dispatchGuidesEnabled: 'modulos',
  exitNoteEnabled: 'modulos',
  // Mi Empresa → Impresión
  logoPrintScale: 'impresion',
  companySlogan: 'impresion',
}

const IDS_VALIDOS = new Set([...PESTANAS.map(p => p.id), 'catalogo'])

/** Resuelve `?tab=` y `?opcion=` a una pestaña de las de ahora. */
function pestanaDesde(search) {
  let params
  try { params = new URLSearchParams(search) } catch { return 'empresa' }
  const opcion = params.get('opcion')
  const tab = params.get('tab')
  if (opcion && OPCION_A_PESTANA[opcion]) return OPCION_A_PESTANA[opcion]
  if (tab && PESTANA_VIEJA[tab]) return PESTANA_VIEJA[tab]
  if (tab && IDS_VALIDOS.has(tab)) return tab
  return 'empresa'
}

export default function Settings() {
  const location = useLocation()
  const { isDemoMode } = useAppContext()
  const [activa, setActiva] = useState(() => pestanaDesde(location.search))

  // La URL manda: el menú lateral y el manual entran por `?tab=`.
  useEffect(() => {
    setActiva(pestanaDesde(location.search))
  }, [location.search])

  // Enlace profundo del manual: `?opcion=<flag>` hace scroll hasta el ancla
  // `opcion-<flag>` y la resalta unos segundos. El reintento cubre el tiempo
  // que tarda en cargar la pestaña bajo demanda.
  const ultimaOpcionRef = useRef(null)
  useEffect(() => {
    let opcion = null
    try { opcion = new URLSearchParams(location.search).get('opcion') } catch { /* sin query */ }
    if (!opcion) return
    if (ultimaOpcionRef.current === location.search) return

    let intentos = 0
    let timer = null
    const intentar = () => {
      const el = document.getElementById(`opcion-${opcion}`)
      if (el) {
        ultimaOpcionRef.current = location.search
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-primary-500', 'ring-offset-2')
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary-500', 'ring-offset-2'), 2500)
        return
      }
      if (intentos++ < 15) timer = setTimeout(intentar, 250)
    }
    timer = setTimeout(intentar, 250)
    return () => clearTimeout(timer)
  }, [location.search, activa])

  // "Mi Catálogo Online" entra por su propio ítem del menú y se ve como una
  // página aparte: sin la barra de pestañas y con su propio título.
  const esCatalogo = activa === 'catalogo'
  const pestana = PESTANAS.find(p => p.id === activa)
  const Componente = esCatalogo ? Catalogo : (pestana?.Componente || MiEmpresa)

  return (
    <div className="space-y-6 animate-fade-in" style={{ zoom: 0.8 }}>
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {esCatalogo ? 'Mi Catálogo Online' : 'Configuración'}
          </h1>
          <GuideLink />
        </div>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          {esCatalogo
            ? 'Comparte tu catálogo digital con tus clientes y recibe pedidos por WhatsApp'
            : 'Tu empresa, tu punto de venta y cómo se ven tus comprobantes'}
        </p>
      </div>

      {isDemoMode && (
        <Nota titulo="Modo demo">
          Estás explorando Cobrify en modo demostración. Para configurar tu empresa y
          personalizar tus comprobantes necesitas{' '}
          <a href="/register" className="font-semibold underline">crear una cuenta</a>.
        </Nota>
      )}

      {!esCatalogo && (
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6 overflow-x-auto">
            {PESTANAS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiva(p.id)}
                className={`py-3 px-1 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activa === p.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      <Suspense
        fallback={(
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Cargando...
          </div>
        )}
      >
        <Componente />
      </Suspense>
    </div>
  )
}
