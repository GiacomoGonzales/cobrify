/**
 * PESTAÑA INTEGRACIONES — Rappi, Tienda Online (Shopifree) y Meta Ads.
 *
 * Antes cada integración vivía en un lugar distinto de Settings.jsx: el
 * interruptor en Preferencias (guardaba al instante) y, al encenderlo,
 * aparecía una pestaña nueva de primer nivel con la configuración. Aquí es
 * una sección por integración: el interruptor arriba y, cuando está
 * encendido, su configuración desplegada debajo.
 *
 * Qué guarda esta pestaña (y nada más):
 *   - Con la barra Guardar: `rappiEnabled` (solo restaurante), `shopifreeEnabled`,
 *     `metaAdsEnabled`, `metaAdsPhonePrefix`, `metaAdsOrderIdPrefix`.
 *   - Al instante, porque son el estado de la integración y no una preferencia:
 *     `rappiConfig` (mapa: clientId, clientSecret, storeId, storeName) desde las
 *     herramientas de diagnóstico, y `shopifreeConfig.pollingEnabled`.
 *   Todo pasa por `useGuardado` con merge, así que los mapas se fusionan clave
 *   por clave y no pisan lo que escriben las Cloud Functions (merchantToken,
 *   storeIntegrationStatus, apiKey...).
 *
 * Hallazgos de la auditoría aplicados aquí:
 *   - `rappiConfig.autoAccept` y `rappiConfig.pollingEnabled` no los leía nadie
 *     (ni src/ ni functions/; no existe un job de polling de Rappi). Fuera.
 *   - Tres botones escribían `rappiConfig` con tres payloads distintos. Ahora
 *     un solo `armarRappiConfig()`.
 *   - La "Configuración manual (legacy / pruebas)" volcaba JSON, códigos HTTP y
 *     un cartel "Integración en desarrollo" al comerciante. Solo `isAdmin`,
 *     plegada bajo "Herramientas de diagnóstico".
 *   - "Ver estado en Rappi" mandaba el resultado a console.log. Ahora se lee
 *     en pantalla.
 *   - La "Actividad reciente" de Shopifree es observabilidad: plegada por
 *     defecto y el JSON de cada evento solo para `isAdmin`.
 */
import { useState, useEffect, useRef } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useGuardado } from '@/components/settings/useGuardado'
import { Seccion, Ajuste, Campo, Fila, Nota, BarraGuardar, Separador } from '@/components/settings/kit'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  validateShopifreeApiKey,
  connectShopifree,
  disconnectShopifree,
  pingShopifree,
  getShopifreeStoreUrl,
  getShopifreeIntegrationLogs,
  computeShopifreeStats,
  getLogActionLabel,
} from '@/services/shopifreeService'

// Lo que escribe el webhook STORE_PROVISIONING_STATUS en `rappiConfig`
// (functions/rappi/selfOnboarding.js), traducido para el comerciante.
const ESTADOS_TIENDA_RAPPI = {
  pending: 'Pendiente de confirmación de Rappi',
  active: 'Activa',
  inactive: 'Inactiva',
  failed: 'Falló',
}
const OPERACIONES_RAPPI = {
  PROVISION: 'Alta de la tienda',
  DEPROVISION: 'Baja de la tienda',
}

/** Timestamp de Firestore, Date, número o ISO → texto en es-PE. */
function fechaLegible(valor) {
  if (!valor) return ''
  const d = valor?.toDate ? valor.toDate() : valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(d?.getTime?.()) ? String(valor) : d.toLocaleString('es-PE')
}

// Rappi devuelve la lista de tiendas del comercio con su estado de integración
// (GET /v2/stores/integration-status). No tenemos el contrato exacto, así que
// buscamos los nombres habituales y, si no están, mostramos cada campo escalar
// tal cual: se lee igual, sin abrir la consola.
const CLAVES_LEGIBLES_RAPPI = [
  ['Tienda', ['store_id', 'storeId', 'id']],
  ['Nombre', ['name', 'store_name', 'storeName']],
  ['Estado', ['integration_status', 'integrationStatus', 'status']],
  ['Última operación', ['last_operation', 'lastOperation', 'operation']],
  ['Fecha', ['updated_at', 'updatedAt', 'last_update', 'created_at', 'createdAt', 'date']],
]
function resumirEstadoRappi(data) {
  const lista = Array.isArray(data)
    ? data
    : Array.isArray(data?.stores)
      ? data.stores
      : data && typeof data === 'object'
        ? [data]
        : []
  return lista.map((item) => {
    if (!item || typeof item !== 'object') return [{ etiqueta: 'Respuesta', valor: String(item) }]
    const usadas = new Set()
    const filas = []
    for (const [etiqueta, claves] of CLAVES_LEGIBLES_RAPPI) {
      const clave = claves.find((k) => item[k] !== undefined && item[k] !== null && item[k] !== '')
      if (!clave) continue
      usadas.add(clave)
      filas.push({ etiqueta, valor: etiqueta === 'Fecha' ? fechaLegible(item[clave]) : String(item[clave]) })
    }
    for (const [k, v] of Object.entries(item)) {
      if (usadas.has(k) || v === null || v === undefined || typeof v === 'object') continue
      filas.push({ etiqueta: k, valor: String(v) })
    }
    return filas
  })
}

/** Una fila etiqueta/valor dentro de una Nota. */
function FilaDato({ etiqueta, children }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="w-36 shrink-0 text-gray-500">{etiqueta}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

/**
 * Resultado de `testRappiConnection`. Solo lo ve el admin (vive dentro de las
 * herramientas de diagnóstico), por eso conserva códigos HTTP, dominios y JSON.
 */
function ResultadoPruebaRappi({ r }) {
  if (!r) return null
  if (!r.ok) {
    return (
      <Nota titulo="No se pudo conectar">
        <p className="text-xs">
          Paso fallido: <strong>{r.step}</strong>
          {r.status ? ` · HTTP ${r.status}` : ''}
        </p>
        <p className="text-xs">{r.message}</p>
        {r.data && (
          <details className="text-xs mt-1">
            <summary className="cursor-pointer">Detalles</summary>
            <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-64">
              {JSON.stringify(r.data, null, 2)}
            </pre>
          </details>
        )}
      </Nota>
    )
  }
  return (
    <Nota titulo={`Conexión exitosa con Rappi ${r.env === 'production_pe' ? '(Producción)' : '(Sandbox)'} · Store ${r.storeId}`}>
      <div className="space-y-2 text-xs">
        {r.tokenInfo && (
          <div>
            <p className="font-medium">Identidad del token (azp)</p>
            <p>azp: <code>{r.clientIdUsed || '—'}</code></p>
            <p>
              {r.tokenInfo.matchesConfiguredClientId
                ? 'Coincide con el Client ID configurado.'
                : 'El azp del token no coincide con el Client ID configurado (para el webhook se usa el azp).'}
            </p>
          </div>
        )}

        {r.webhookRegister && (
          <div>
            <p className="font-medium">Webhook STORE_PROVISIONING_STATUS (registro)</p>
            {r.webhookDomain ? (
              <p>Registrado correctamente en <code>{r.webhookDomain}</code>.</p>
            ) : (
              <>
                <p>Falló en ambos dominios:</p>
                <p>services.rappi.pe → HTTP {r.webhookRegister.status || '?'} · {r.webhookRegister.message}</p>
                <p>api.rappi.pe → HTTP {r.webhookRegisterAlt?.status || '?'} · {r.webhookRegisterAlt?.message}</p>
                {(r.webhookRegister.data || r.webhookRegisterAlt?.data) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer">Cuerpo del error de Rappi</summary>
                    <pre className="mt-1 bg-gray-100 p-2 rounded overflow-auto max-h-48">
                      {JSON.stringify({ services: r.webhookRegister.data, api: r.webhookRegisterAlt?.data }, null, 2)}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        )}

        {r.newOrderWebhook && (
          <div>
            <p className="font-medium">Webhook de pedidos (NEW_ORDER)</p>
            {r.newOrderWebhook.ok ? (
              <p>Configurado: Rappi enviará los pedidos a Cobrify.</p>
            ) : (
              <p>Aún no configurado (HTTP {r.newOrderWebhook.status || '?'}). Usa "Activar recepción de pedidos".</p>
            )}
          </div>
        )}

        {r.v1 && (
          <div>
            <p className="font-medium">REST v1 (/restaurants/orders/v1/stores/{r.storeId}/orders)</p>
            {r.v1.ok ? <p>{r.v1.count} pedido(s)</p> : <p>HTTP {r.v1.status || '?'} · {r.v1.message}</p>}
          </div>
        )}
        {r.v2 && (
          <div>
            <p className="font-medium">Public API v2 (/api/v2/restaurants-integrations-public-api/orders)</p>
            {r.v2.ok ? <p>{r.v2.count} pedido(s)</p> : <p>HTTP {r.v2.status || '?'} · {r.v2.message}</p>}
          </div>
        )}
        {r.sample?.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer">Ver muestra del payload</summary>
            <pre className="mt-1 bg-gray-100 p-2 rounded overflow-auto max-h-64">
              {JSON.stringify(r.sample, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </Nota>
  )
}

export default function Integraciones() {
  const { user, getBusinessId, isDemoMode, businessSettings, refreshBusinessSettings, businessMode, isAdmin } = useAppContext()
  const toast = useToast()
  const { guardar, guardando } = useGuardado()

  const esRestaurante = businessMode === 'restaurant'

  // ── Interruptores y Meta Ads: se guardan con la barra de abajo ──────────────
  const [rappiEnabled, setRappiEnabled] = useState(false)
  const [shopifreeEnabled, setShopifreeEnabled] = useState(false)
  const [metaAdsEnabled, setMetaAdsEnabled] = useState(false)
  const [metaAdsPhonePrefix, setMetaAdsPhonePrefix] = useState('+51')
  const [metaAdsOrderIdPrefix, setMetaAdsOrderIdPrefix] = useState('')

  // ── Rappi ────────────────────────────────────────────────────────────────────
  const [rappiClientId, setRappiClientId] = useState('')
  const [rappiClientSecret, setRappiClientSecret] = useState('')
  const [rappiStoreId, setRappiStoreId] = useState('')
  const [rappiStoreName, setRappiStoreName] = useState('')
  const [showRappiSecret, setShowRappiSecret] = useState(false)
  const [isSavingRappi, setIsSavingRappi] = useState(false)
  const [isTestingRappi, setIsTestingRappi] = useState(false)
  const [rappiTestResult, setRappiTestResult] = useState(null)
  const [isEnablingRappiOrders, setIsEnablingRappiOrders] = useState(false)
  // Antes el fallo de "Activar recepción" iba a console.log; ahora queda en pantalla.
  const [rappiEnableResult, setRappiEnableResult] = useState(null)
  // Self-Onboarding (OAuth merchant + provisioning)
  const [isConnectingRappiOAuth, setIsConnectingRappiOAuth] = useState(false)
  const [isProvisioningRappiStore, setIsProvisioningRappiStore] = useState(false)
  const [isCheckingRappiStatus, setIsCheckingRappiStatus] = useState(false)
  const [rappiProvisioningResult, setRappiProvisioningResult] = useState(null)
  // Respuesta de "Ver estado en Rappi" (antes solo se veía en la consola).
  const [rappiEstadoRemoto, setRappiEstadoRemoto] = useState(null)
  const [mostrarDiagnosticoRappi, setMostrarDiagnosticoRappi] = useState(false)

  // ── Shopifree ────────────────────────────────────────────────────────────────
  const [shopifreeApiKeyInput, setShopifreeApiKeyInput] = useState('')
  const [showShopifreeKey, setShowShopifreeKey] = useState(false)
  const [isConnectingShopifree, setIsConnectingShopifree] = useState(false)
  const [isPingingShopifree, setIsPingingShopifree] = useState(false)
  const [shopifreeConnectionResult, setShopifreeConnectionResult] = useState(null)
  const [isResyncingShopifree, setIsResyncingShopifree] = useState(false)
  const [shopifreeResyncResult, setShopifreeResyncResult] = useState(null)
  const [isTogglingShopifreePolling, setIsTogglingShopifreePolling] = useState(false)
  const [isPollingShopifreeNow, setIsPollingShopifreeNow] = useState(false)
  const [shopifreePollResult, setShopifreePollResult] = useState(null)
  const [shopifreeLogs, setShopifreeLogs] = useState([])
  const [shopifreeLogsLoading, setShopifreeLogsLoading] = useState(false)
  const [shopifreeLogFilter, setShopifreeLogFilter] = useState('all') // all|orders|products|errors
  const [mostrarActividadShopifree, setMostrarActividadShopifree] = useState(false)

  // Lo que escriben las Cloud Functions se lee directo del documento, no de un
  // estado local: merchantToken, estado de la tienda, apiKey, último poll...
  const rappiCfg = businessSettings?.rappiConfig
  const rappiConectado = !!rappiCfg?.merchantToken
  const shopifreeCfg = businessSettings?.shopifreeConfig
  const shopifreeConectado = !!shopifreeCfg?.apiKey && !!shopifreeCfg?.storeId
  const shopifreeStoreUrl = shopifreeConectado ? getShopifreeStoreUrl(shopifreeCfg) : null

  // Estado local desde el documento, UNA sola vez (cuando llega). Si se
  // resincronizara en cada refresco, "Conectar con Rappi" (que refresca el
  // contexto al volver del popup) apagaría un interruptor que el usuario
  // encendió y aún no guardó, y le cerraría la configuración en la cara.
  const inicializadoRef = useRef(false)
  useEffect(() => {
    if (inicializadoRef.current || !businessSettings) return
    inicializadoRef.current = true
    setRappiEnabled(businessSettings.rappiEnabled === true)
    setShopifreeEnabled(businessSettings.shopifreeEnabled === true)
    setMetaAdsEnabled(businessSettings.metaAdsEnabled === true)
    if (businessSettings.metaAdsPhonePrefix !== undefined) setMetaAdsPhonePrefix(businessSettings.metaAdsPhonePrefix)
    if (businessSettings.metaAdsOrderIdPrefix !== undefined) setMetaAdsOrderIdPrefix(businessSettings.metaAdsOrderIdPrefix)
    const rc = businessSettings.rappiConfig
    if (rc) {
      setRappiClientId(rc.clientId || '')
      setRappiClientSecret(rc.clientSecret || '')
      setRappiStoreId(rc.storeId || '')
      setRappiStoreName(rc.storeName || '')
    }
  }, [businessSettings])

  // Logs de Shopifree: antes se cargaban al entrar a la pestaña; como la
  // actividad ahora está plegada, se cargan al desplegarla (y se refrescan
  // tras un resync o un poll manual, ver handlers).
  useEffect(() => {
    if (!mostrarActividadShopifree || !shopifreeConectado) return
    if (!user?.uid || isDemoMode) return
    let cancelled = false
    setShopifreeLogsLoading(true)
    getShopifreeIntegrationLogs(getBusinessId(), 50).then((logs) => {
      if (!cancelled) setShopifreeLogs(logs)
    }).finally(() => {
      if (!cancelled) setShopifreeLogsLoading(false)
    })
    return () => { cancelled = true }
    // getBusinessId cambia de identidad por render; el negocio lo fija user.uid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarActividadShopifree, shopifreeConectado, user?.uid, isDemoMode])

  const refreshShopifreeLogs = async () => {
    if (!user?.uid || isDemoMode) return
    setShopifreeLogsLoading(true)
    try {
      const logs = await getShopifreeIntegrationLogs(getBusinessId(), 50)
      setShopifreeLogs(logs)
    } finally {
      setShopifreeLogsLoading(false)
    }
  }

  // ── Guardado general (interruptores + Meta Ads) ─────────────────────────────
  const guardarIntegraciones = () => {
    const payload = { shopifreeEnabled, metaAdsEnabled, metaAdsPhonePrefix, metaAdsOrderIdPrefix }
    // rappiEnabled solo cuando su interruptor está en pantalla (restaurante):
    // no escribimos lo que el usuario no ve.
    if (esRestaurante) payload.rappiEnabled = rappiEnabled
    return guardar(payload, 'Integraciones guardadas')
  }

  // ── Rappi: un solo armado de rappiConfig ────────────────────────────────────
  // Antes tres botones armaban tres payloads distintos (uno con
  // autoAccept/pollingEnabled, otro sin). Ahora es lo que está en pantalla y
  // nada más. autoAccept y pollingEnabled ya no van: nadie los lee.
  const armarRappiConfig = () => ({
    clientId: rappiClientId.trim(),
    clientSecret: rappiClientSecret.trim(),
    storeId: rappiStoreId.trim(),
    storeName: rappiStoreName.trim(),
  })
  const guardarRappiConfig = (mensaje = 'Configuración de Rappi guardada') =>
    guardar({ rappiConfig: armarRappiConfig() }, mensaje)

  const conectarRappiOAuth = async () => {
    setIsConnectingRappiOAuth(true)
    try {
      const startFn = httpsCallable(functions, 'rappiOAuthStart')
      const result = await startFn({ businessId: getBusinessId(), env: 'production_pe' })
      const oauthUrl = result.data?.url
      if (!oauthUrl) throw new Error('No se recibió URL de OAuth')

      // Listener para postMessage del popup
      const onMessage = (evt) => {
        if (evt.data?.source !== 'rappi-oauth') return
        window.removeEventListener('message', onMessage)
        if (evt.data.ok) {
          toast.success('Conectado con Rappi')
          if (refreshBusinessSettings) refreshBusinessSettings()
        } else {
          toast.error('No se pudo conectar: ' + (evt.data.error || ''))
        }
        setIsConnectingRappiOAuth(false)
      }
      window.addEventListener('message', onMessage)

      const popup = window.open(oauthUrl, 'rappi-oauth', 'width=520,height=700')
      // Si el popup se cierra sin enviar postMessage, libera el botón
      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval)
          window.removeEventListener('message', onMessage)
          setIsConnectingRappiOAuth(false)
        }
      }, 500)
    } catch (err) {
      console.error('Error iniciando OAuth Rappi:', err)
      toast.error('Error: ' + (err.message || 'desconocido'))
      setIsConnectingRappiOAuth(false)
    }
  }

  const provisionarTiendaRappi = async () => {
    setIsProvisioningRappiStore(true)
    setRappiProvisioningResult(null)
    try {
      const fn = httpsCallable(functions, 'rappiProvisionStore')
      const result = await fn({
        businessId: getBusinessId(),
        storeId: rappiStoreId.trim(),
        name: rappiStoreName.trim(),
      })
      setRappiProvisioningResult(result.data)
      if (result.data?.ok) {
        toast.success('Solicitud de provisioning enviada')
        if (refreshBusinessSettings) refreshBusinessSettings()
      } else {
        toast.error('Provisioning falló: ' + (result.data?.message || ''))
      }
    } catch (err) {
      console.error('Error provisioning:', err)
      toast.error('Error: ' + err.message)
      setRappiProvisioningResult({ ok: false, message: err.message })
    } finally {
      setIsProvisioningRappiStore(false)
    }
  }

  const consultarEstadoRappi = async () => {
    setIsCheckingRappiStatus(true)
    try {
      const fn = httpsCallable(functions, 'rappiGetStoreStatus')
      const result = await fn({ businessId: getBusinessId() })
      // Antes: console.log + toast "revisa la consola". Ahora queda en la
      // nota de estado, con los campos legibles.
      setRappiEstadoRemoto({ ...(result.data || {}), consultadoEn: new Date() })
      if (result.data?.ok) {
        toast.success('Estado consultado')
      } else {
        toast.error('No se pudo consultar: ' + (result.data?.message || ''))
      }
    } catch (err) {
      setRappiEstadoRemoto({ ok: false, message: err.message, consultadoEn: new Date() })
      toast.error('Error: ' + err.message)
    } finally {
      setIsCheckingRappiStatus(false)
    }
  }

  const probarConexionRappi = async () => {
    setIsTestingRappi(true)
    setRappiTestResult(null)
    try {
      // Guardar primero para que la function lea las credenciales actuales
      const guardado = await guardarRappiConfig('Credenciales guardadas')
      if (!guardado) return
      const testFn = httpsCallable(functions, 'testRappiConnection')
      const result = await testFn({ businessId: getBusinessId(), env: 'production_pe' })
      setRappiTestResult(result.data)
      if (result.data?.ok) {
        toast.success('Conexión con Rappi OK')
      } else {
        toast.error('Conexión fallida: ' + (result.data?.message || 'ver detalles'))
      }
    } catch (error) {
      console.error('Error testing Rappi:', error)
      setRappiTestResult({ ok: false, step: 'client', message: error.message })
      toast.error('Error: ' + error.message)
    } finally {
      setIsTestingRappi(false)
    }
  }

  const activarRecepcionRappi = async () => {
    setIsEnablingRappiOrders(true)
    setRappiEnableResult(null)
    try {
      // Guardar primero para asegurar credenciales actuales
      const guardado = await guardarRappiConfig('Credenciales guardadas')
      if (!guardado) return
      const fn = httpsCallable(functions, 'rappiEnableOrderReception')
      const result = await fn({ businessId: getBusinessId(), env: 'production_pe' })
      if (result.data?.ok) {
        toast.success('Recepción de pedidos activada: Rappi enviará los pedidos a Cobrify')
        if (refreshBusinessSettings) refreshBusinessSettings()
      } else {
        const ne = result.data?.results?.NEW_ORDER
        toast.error('No se pudo activar: ' + (ne?.message || result.data?.message || 'ver detalles'))
        setRappiEnableResult(result.data)
      }
    } catch (err) {
      console.error('Error activando recepción Rappi:', err)
      toast.error('Error: ' + err.message)
      setRappiEnableResult({ ok: false, message: err.message })
    } finally {
      setIsEnablingRappiOrders(false)
    }
  }

  const guardarCredencialesRappi = async () => {
    setIsSavingRappi(true)
    try {
      await guardarRappiConfig()
    } finally {
      setIsSavingRappi(false)
    }
  }

  // ── Shopifree ────────────────────────────────────────────────────────────────
  const conectarShopifree = async () => {
    if (isDemoMode) {
      toast.error('No disponible en modo demo')
      return
    }
    const key = shopifreeApiKeyInput.trim()
    if (!key.startsWith('sfk_')) {
      setShopifreeConnectionResult({ ok: false, error: 'El API key debe empezar con "sfk_"' })
      return
    }
    setIsConnectingShopifree(true)
    setShopifreeConnectionResult(null)
    try {
      const result = await validateShopifreeApiKey(getBusinessId(), key)
      if (result.ok && result.store) {
        await connectShopifree(getBusinessId(), key, result.store)
        setShopifreeConnectionResult({ ok: true, store: result.store })
        setShopifreeApiKeyInput('')
        toast.success(`Conectado a ${result.store.name}`)
        if (refreshBusinessSettings) await refreshBusinessSettings()
      } else {
        setShopifreeConnectionResult(result)
        toast.error(result.error || 'No se pudo conectar')
      }
    } catch (err) {
      console.error('Error conectando Shopifree:', err)
      setShopifreeConnectionResult({ ok: false, error: err.message || 'Error' })
      toast.error('Error al conectar')
    } finally {
      setIsConnectingShopifree(false)
    }
  }

  const verificarShopifree = async () => {
    if (isDemoMode) {
      toast.error('No disponible en modo demo')
      return
    }
    setIsPingingShopifree(true)
    try {
      const result = await pingShopifree(getBusinessId())
      if (result.ok) {
        toast.success('Conexión verificada')
        if (refreshBusinessSettings) await refreshBusinessSettings()
      } else {
        toast.error('Error: ' + (result.error || 'No se pudo verificar'))
      }
    } catch (err) {
      console.error(err)
      toast.error('Error al verificar')
    } finally {
      setIsPingingShopifree(false)
    }
  }

  const desconectarShopifree = async () => {
    if (isDemoMode) {
      toast.error('No disponible en modo demo')
      return
    }
    if (!window.confirm('¿Desconectar la tienda de Shopifree? El catálogo dejará de sincronizarse.')) return
    try {
      await disconnectShopifree(getBusinessId())
      toast.success('Tienda desconectada')
      if (refreshBusinessSettings) await refreshBusinessSettings()
    } catch (err) {
      console.error(err)
      toast.error('Error al desconectar')
    }
  }

  const resincronizarProductosShopifree = async () => {
    if (isDemoMode) {
      toast.error('No disponible en modo demo')
      return
    }
    if (!window.confirm('¿Sincronizar todos los productos del inventario con Shopifree? Esto puede tardar varios minutos si tienes muchos productos.')) {
      return
    }
    setIsResyncingShopifree(true)
    setShopifreeResyncResult(null)
    try {
      const fn = httpsCallable(functions, 'resyncShopifreeProducts')
      const result = await fn({ businessId: getBusinessId() })
      setShopifreeResyncResult(result.data)
      if (result.data?.ok) {
        toast.success(`Sincronizados ${result.data.totalPushed} productos`)
      } else {
        toast.error(`Sincronización con errores: ${result.data?.errorCount || 0}`)
      }
      if (refreshBusinessSettings) await refreshBusinessSettings()
      refreshShopifreeLogs()
    } catch (err) {
      console.error('Error resincronizando productos:', err)
      toast.error('Error: ' + (err.message || 'desconocido'))
      setShopifreeResyncResult({ ok: false, error: err.message })
    } finally {
      setIsResyncingShopifree(false)
    }
  }

  // Es el estado de la integración (arranca o pausa el cron de pedidos), no
  // una preferencia: se guarda al instante, como siempre. Va anidado en
  // shopifreeConfig y el merge deja el resto del mapa intacto.
  const cambiarPollingShopifree = async (enabled) => {
    setIsTogglingShopifreePolling(true)
    try {
      await guardar(
        { shopifreeConfig: { pollingEnabled: enabled } },
        enabled ? 'Captación de pedidos activada' : 'Captación de pedidos pausada',
      )
    } finally {
      setIsTogglingShopifreePolling(false)
    }
  }

  const buscarPedidosShopifreeAhora = async () => {
    if (isDemoMode) {
      toast.error('No disponible en modo demo')
      return
    }
    setIsPollingShopifreeNow(true)
    setShopifreePollResult(null)
    try {
      const fn = httpsCallable(functions, 'pollShopifreeOrdersNow')
      const result = await fn({ businessId: getBusinessId() })
      setShopifreePollResult(result.data)
      if (result.data?.ok && result.data?.created > 0) {
        toast.success(`${result.data.created} pedido(s) nuevo(s) importado(s)`)
      } else if (result.data?.processed === 0) {
        toast.info('No hay pedidos nuevos')
      } else if (result.data?.ok) {
        toast.success('Sin pedidos nuevos para procesar')
      } else {
        toast.error('Error: ' + (result.data?.error || 'Desconocido'))
      }
      if (refreshBusinessSettings) await refreshBusinessSettings()
      refreshShopifreeLogs()
    } catch (err) {
      console.error('Error polling Shopifree:', err)
      toast.error('Error: ' + (err.message || 'desconocido'))
      setShopifreePollResult({ ok: false, error: err.message })
    } finally {
      setIsPollingShopifreeNow(false)
    }
  }

  // Actividad reciente: stats y filtro sobre los logs cargados.
  const shopifreeStats = computeShopifreeStats(shopifreeLogs)
  const shopifreeLogsFiltrados = shopifreeLogs.filter((log) => {
    if (shopifreeLogFilter === 'all') return true
    if (shopifreeLogFilter === 'orders') return log.action === 'orders_poll'
    if (shopifreeLogFilter === 'products') return log.action?.startsWith('product') || log.action === 'products_resync_all'
    if (shopifreeLogFilter === 'errors') return log.ok === false || (log.errorCount || 0) > 0
    return true
  })

  const tiendasRappiRemotas = rappiEstadoRemoto?.ok ? resumirEstadoRappi(rappiEstadoRemoto.data) : []
  const fechaEstadoRappi = rappiCfg?.lastProvisioningAt || rappiCfg?.provisioningRequestedAt

  return (
    <div className="space-y-6">
      {/* ── Rappi (solo restaurante) ─────────────────────────────────────────── */}
      {esRestaurante && (
        <>
          <Seccion id="rappi" titulo="Rappi" descripcion="Recibe en Cobrify los pedidos que entran por Rappi.">
            <Ajuste
              id="opcion-rappiEnabled"
              checked={rappiEnabled}
              onChange={(e) => setRappiEnabled(e.target.checked)}
              titulo="Habilitar integración con Rappi"
              descripcion='Muestra el módulo "Pedidos Rappi" en el menú lateral y permite vincular tu tienda con la integración de Cobrify.'
            />

            {rappiEnabled && (
              <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Conectar tienda con Rappi</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Vincula tu tienda mediante el flujo de Self-Onboarding de Rappi.
                    Necesitas tener tu tienda creada en el Portal Partners de Rappi.
                  </p>
                </div>

                {/* Estado OAuth */}
                <Nota titulo={rappiConectado ? 'Tienda autenticada con Rappi' : 'Tienda no conectada'}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-xs">
                      {rappiConectado
                        ? 'Ya puedes provisionar tu tienda en la integración.'
                        : 'Inicia sesión con tu cuenta de Rappi para autorizar a Cobrify.'}
                    </p>
                    <Button
                      type="button"
                      variant={rappiConectado ? 'outline' : 'primary'}
                      size="sm"
                      className="shrink-0"
                      disabled={isConnectingRappiOAuth || isDemoMode}
                      onClick={conectarRappiOAuth}
                    >
                      {isConnectingRappiOAuth ? 'Conectando...' : rappiConectado ? 'Reconectar' : 'Conectar con Rappi'}
                    </Button>
                  </div>
                </Nota>

                {/* Provisioning: solo si ya hay merchantToken */}
                {rappiConectado && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Provisionar tienda</h3>
                      <Fila>
                        <Campo etiqueta="Store ID">
                          <Input
                            value={rappiStoreId}
                            onChange={(e) => setRappiStoreId(e.target.value)}
                            placeholder="Ej: 10"
                          />
                        </Campo>
                        <Campo etiqueta="Nombre de la tienda">
                          <Input
                            value={rappiStoreName}
                            onChange={(e) => setRappiStoreName(e.target.value)}
                            placeholder="Mi Tienda Principal"
                          />
                        </Campo>
                      </Fila>
                    </div>

                    {/* Estado de la tienda: lo que dejó el webhook + lo que responde Rappi al consultar */}
                    {(rappiCfg?.storeIntegrationStatus || rappiEstadoRemoto) && (
                      <Nota titulo="Estado de la tienda">
                        {rappiCfg?.storeIntegrationStatus && (
                          <div className="space-y-0.5">
                            <FilaDato etiqueta="Estado">
                              {ESTADOS_TIENDA_RAPPI[rappiCfg.storeIntegrationStatus] || rappiCfg.storeIntegrationStatus}
                            </FilaDato>
                            {rappiCfg.lastProvisioningOperation && (
                              <FilaDato etiqueta="Última operación">
                                {OPERACIONES_RAPPI[rappiCfg.lastProvisioningOperation] || rappiCfg.lastProvisioningOperation}
                              </FilaDato>
                            )}
                            {fechaEstadoRappi && (
                              <FilaDato etiqueta="Fecha">{fechaLegible(fechaEstadoRappi)}</FilaDato>
                            )}
                          </div>
                        )}

                        {rappiEstadoRemoto && (
                          <div className={`text-xs space-y-1 ${rappiCfg?.storeIntegrationStatus ? 'mt-2 pt-2 border-t border-gray-200' : ''}`}>
                            <p className="font-medium">
                              Respuesta de Rappi · {fechaLegible(rappiEstadoRemoto.consultadoEn)}
                            </p>
                            {rappiEstadoRemoto.ok ? (
                              tiendasRappiRemotas.length === 0 ? (
                                <p>Rappi no devolvió tiendas para este comercio.</p>
                              ) : (
                                tiendasRappiRemotas.map((filas, i) => (
                                  <div key={i} className={`space-y-0.5 ${i > 0 ? 'pt-1' : ''}`}>
                                    {filas.map((f) => (
                                      <FilaDato key={f.etiqueta} etiqueta={f.etiqueta}>{f.valor}</FilaDato>
                                    ))}
                                  </div>
                                ))
                              )
                            ) : (
                              <p>
                                No se pudo consultar: {rappiEstadoRemoto.message || 'error desconocido'}
                                {isAdmin && rappiEstadoRemoto.status ? ` (HTTP ${rappiEstadoRemoto.status})` : ''}
                              </p>
                            )}
                            {isAdmin && rappiEstadoRemoto.data && (
                              <details className="mt-1">
                                <summary className="cursor-pointer">Respuesta completa</summary>
                                <pre className="mt-1 bg-gray-100 p-2 rounded overflow-auto max-h-64">
                                  {JSON.stringify(rappiEstadoRemoto.data, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        )}
                      </Nota>
                    )}

                    {rappiProvisioningResult && (
                      <Nota>
                        {rappiProvisioningResult.ok
                          ? 'Solicitud enviada. Esperando la confirmación de Rappi.'
                          : `No se pudo provisionar: ${rappiProvisioningResult.message || 'Error'}${
                            isAdmin && rappiProvisioningResult.status ? ` (HTTP ${rappiProvisioningResult.status})` : ''
                          }`}
                      </Nota>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={provisionarTiendaRappi}
                        disabled={isProvisioningRappiStore || isDemoMode || !rappiStoreId.trim() || !rappiStoreName.trim()}
                      >
                        {isProvisioningRappiStore ? 'Provisionando...' : 'Provisionar tienda'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={consultarEstadoRappi}
                        disabled={isCheckingRappiStatus || isDemoMode}
                      >
                        {isCheckingRappiStatus ? 'Consultando...' : 'Ver estado en Rappi'}
                      </Button>
                    </div>
                  </>
                )}

                {/* Herramientas de diagnóstico: credenciales legacy por tienda y
                    pruebas de conexión con JSON crudo. Es una consola de
                    ingeniería, no configuración del comerciante: solo admin. */}
                {isAdmin && (
                  <div className="pt-2 border-t border-gray-200">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMostrarDiagnosticoRappi((v) => !v)}
                    >
                      {mostrarDiagnosticoRappi ? 'Ocultar herramientas de diagnóstico' : 'Herramientas de diagnóstico'}
                    </Button>

                    {mostrarDiagnosticoRappi && (
                      <div className="mt-4 space-y-4">
                        <Nota titulo="Configuración manual (legacy / pruebas)">
                          Si Rappi entregó credenciales propias por tienda (modo legacy), se guardan
                          aquí y se prueba la conexión directamente. Para el flujo nuevo usa la
                          sección de arriba.
                        </Nota>

                        <Campo etiqueta="Client ID">
                          <Input
                            value={rappiClientId}
                            onChange={(e) => setRappiClientId(e.target.value)}
                            placeholder="Identificador único otorgado por Rappi"
                          />
                        </Campo>

                        <Campo etiqueta="Client Secret" ayuda="Solo lo usa el servidor para autenticarse con Rappi.">
                          <div className="flex gap-2">
                            <div className="flex-1 min-w-0">
                              <Input
                                type={showRappiSecret ? 'text' : 'password'}
                                value={rappiClientSecret}
                                onChange={(e) => setRappiClientSecret(e.target.value)}
                                placeholder="Secret otorgado por Rappi"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => setShowRappiSecret(!showRappiSecret)}
                            >
                              {showRappiSecret ? 'Ocultar' : 'Mostrar'}
                            </Button>
                          </div>
                        </Campo>

                        <Campo
                          etiqueta="Store ID (ID de tienda en Rappi)"
                          ayuda="Si manejas varias sucursales, esta es la principal."
                        >
                          <Input
                            value={rappiStoreId}
                            onChange={(e) => setRappiStoreId(e.target.value)}
                            placeholder="ID de tu tienda Rappi"
                          />
                        </Campo>

                        <ResultadoPruebaRappi r={rappiTestResult} />

                        {rappiEnableResult && !rappiEnableResult.ok && (
                          <Nota titulo="No se pudo activar la recepción de pedidos">
                            <p className="text-xs">
                              {rappiEnableResult.results?.NEW_ORDER?.message || rappiEnableResult.message || 'Sin detalle'}
                            </p>
                            <details className="text-xs mt-1">
                              <summary className="cursor-pointer">Respuesta completa</summary>
                              <pre className="mt-1 bg-gray-100 p-2 rounded overflow-auto max-h-64">
                                {JSON.stringify(rappiEnableResult, null, 2)}
                              </pre>
                            </details>
                          </Nota>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={probarConexionRappi}
                            disabled={isTestingRappi || isDemoMode || !rappiClientId || !rappiClientSecret}
                          >
                            {isTestingRappi ? 'Probando...' : 'Probar conexión'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={activarRecepcionRappi}
                            disabled={isEnablingRappiOrders || isDemoMode || !rappiClientId || !rappiClientSecret || !rappiStoreId}
                          >
                            {isEnablingRappiOrders ? 'Activando...' : 'Activar recepción de pedidos'}
                          </Button>
                          <Button
                            type="button"
                            onClick={guardarCredencialesRappi}
                            disabled={isSavingRappi || isDemoMode}
                          >
                            {isSavingRappi ? 'Guardando...' : 'Guardar credenciales'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Seccion>

          <Separador />
        </>
      )}

      {/* ── Tienda Online (Shopifree): todos los modos ───────────────────────── */}
      <Seccion
        id="shopifree"
        titulo="Tienda Online (Shopifree)"
        descripcion="Sincroniza tu catálogo con tu tienda online en Shopifree y recibe sus pedidos en Cobrify."
      >
        <Ajuste
          id="opcion-shopifreeEnabled"
          checked={shopifreeEnabled}
          onChange={(e) => setShopifreeEnabled(e.target.checked)}
          titulo="Habilitar integración con Shopifree"
          descripcion="Conecta tu catálogo con tu tienda online: los productos se sincronizan solos y los pedidos llegan a Pedidos Online."
        />

        {shopifreeEnabled && (
          <div className="border border-gray-200 rounded-lg p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Conexión</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Necesitas un API key generado desde tu dashboard de Shopifree.
              </p>
            </div>

            {/* Estado de conexión */}
            <Nota titulo={shopifreeConectado ? `Conectado a: ${shopifreeCfg.storeName}` : 'Tienda no conectada'}>
              {shopifreeConectado ? (
                <div className="text-xs space-y-2">
                  {shopifreeStoreUrl && (
                    <a href={shopifreeStoreUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {shopifreeStoreUrl.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {shopifreeCfg.currency && <div><strong>Moneda:</strong> {shopifreeCfg.currency}</div>}
                    {shopifreeCfg.plan && <div><strong>Plan:</strong> {shopifreeCfg.plan}</div>}
                    {shopifreeCfg.country && <div><strong>País:</strong> {shopifreeCfg.country}</div>}
                    {shopifreeCfg.connectedAt && (
                      <div className="col-span-2"><strong>Conectado el:</strong> {fechaLegible(shopifreeCfg.connectedAt)}</div>
                    )}
                    {shopifreeCfg.lastPingAt && (
                      <div className="col-span-2"><strong>Última verificación:</strong> {fechaLegible(shopifreeCfg.lastPingAt)}</div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs">Pega tu API key abajo para conectarla.</p>
              )}
            </Nota>

            {/* Formulario de conexión / desconexión */}
            {!shopifreeConectado ? (
              <>
                <Campo
                  etiqueta="API Key de Shopifree"
                  ayuda={
                    <>
                      Genera tu API key desde{' '}
                      <a
                        href="https://shopifree.app/es/dashboard/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        tu dashboard de Shopifree
                      </a>.
                    </>
                  }
                >
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <Input
                        type={showShopifreeKey ? 'text' : 'password'}
                        value={shopifreeApiKeyInput}
                        onChange={(e) => {
                          setShopifreeApiKeyInput(e.target.value)
                          setShopifreeConnectionResult(null)
                        }}
                        placeholder="sfk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="font-mono"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setShowShopifreeKey(!showShopifreeKey)}
                    >
                      {showShopifreeKey ? 'Ocultar' : 'Mostrar'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0"
                      disabled={isConnectingShopifree || !shopifreeApiKeyInput.trim() || isDemoMode}
                      onClick={conectarShopifree}
                    >
                      {isConnectingShopifree ? 'Conectando...' : 'Conectar'}
                    </Button>
                  </div>
                </Campo>

                {shopifreeConnectionResult && !shopifreeConnectionResult.ok && (
                  <Nota titulo="No se pudo conectar">
                    <p className="text-xs">{shopifreeConnectionResult.error}</p>
                  </Nota>
                )}
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPingingShopifree || isDemoMode}
                  onClick={verificarShopifree}
                >
                  {isPingingShopifree ? 'Verificando...' : 'Verificar conexión'}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={isConnectingShopifree || isDemoMode}
                  onClick={desconectarShopifree}
                >
                  Desconectar
                </Button>
              </div>
            )}

            {/* Sincronización de productos (Fase 1) */}
            {shopifreeConectado && (
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Sincronización de productos</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Tus productos se sincronizan solos con Shopifree cuando los creas, editas o
                    eliminas. Si necesitas resincronizar todo (primera carga o reparación), usa el botón.
                  </p>
                </div>

                {shopifreeCfg?.lastProductsResyncAt && (
                  <p className="text-xs text-gray-600">
                    <strong>Última resincronización completa:</strong>{' '}
                    {fechaLegible(shopifreeCfg.lastProductsResyncAt) || '—'}
                  </p>
                )}

                <Button
                  type="button"
                  variant="outline"
                  disabled={isResyncingShopifree || isDemoMode}
                  onClick={resincronizarProductosShopifree}
                >
                  {isResyncingShopifree ? 'Sincronizando...' : 'Sincronizar todos los productos'}
                </Button>

                {shopifreeResyncResult && (
                  <Nota titulo={shopifreeResyncResult.ok ? 'Sincronización exitosa' : 'Sincronización con errores'}>
                    {typeof shopifreeResyncResult.totalChecked === 'number' && (
                      <div className="text-xs space-y-0.5">
                        <div>Procesados: {shopifreeResyncResult.totalChecked}</div>
                        <div>Enviados: {shopifreeResyncResult.totalPushed}</div>
                        {(shopifreeResyncResult.totalCreated || 0) > 0 && (
                          <div>Creados nuevos: {shopifreeResyncResult.totalCreated}</div>
                        )}
                        {(shopifreeResyncResult.totalUpdated || 0) > 0 && (
                          <div>Actualizados: {shopifreeResyncResult.totalUpdated}</div>
                        )}
                        {(shopifreeResyncResult.errorCount || 0) > 0 && (
                          <div>Errores: {shopifreeResyncResult.errorCount}</div>
                        )}
                      </div>
                    )}
                    {shopifreeResyncResult.error && (
                      <p className="text-xs">{shopifreeResyncResult.error}</p>
                    )}
                    {shopifreeResyncResult.errors?.length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer underline">Ver detalle de errores</summary>
                        <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                          {shopifreeResyncResult.errors.map((e, idx) => (
                            <li key={idx} className="font-mono text-[11px]">
                              {e.externalId ? `[${e.externalId}] ` : ''}
                              {e.error || JSON.stringify(e)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </Nota>
                )}

                <Nota titulo="Cómo funciona">
                  <ul className="text-xs space-y-0.5 list-disc pl-4">
                    <li>Cada vez que creas, editas o eliminas un producto en Cobrify, se envía a Shopifree.</li>
                    <li>Los productos con variantes (talla/color) se envían como producto único sin variantes (el API v1 de Shopifree no las soporta).</li>
                    <li>Los productos ocultos del catálogo o desactivados se mandan como inactivos.</li>
                  </ul>
                </Nota>
              </div>
            )}

            {/* Captación de pedidos (Fase 2) */}
            {shopifreeConectado && (
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Captación de pedidos</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Cuando está activado, Cobrify revisa Shopifree cada 3 minutos en busca de
                    pedidos nuevos y los registra en la sección Pedidos Online.
                  </p>
                </div>

                <Ajuste
                  id="opcion-shopifreeConfig.pollingEnabled"
                  checked={shopifreeCfg?.pollingEnabled === true}
                  disabled={isTogglingShopifreePolling || isDemoMode}
                  onChange={(e) => cambiarPollingShopifree(e.target.checked)}
                  titulo="Captar pedidos automáticamente desde Shopifree"
                  descripcion="Activado: el sistema busca pedidos nuevos cada 3 minutos. Desactivado: la sincronización queda en pausa (los pedidos existentes en Shopifree no se pierden, se recuperan al reactivar)."
                />

                {shopifreeCfg?.lastPollAt && (
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>
                      <strong>Última búsqueda:</strong> {fechaLegible(shopifreeCfg.lastPollAt) || '—'}
                    </div>
                    {/* El cursor es un dato interno de paginación: solo le sirve a quien depura. */}
                    {isAdmin && shopifreeCfg.lastOrderCursor && (
                      <div>
                        <strong>Cursor:</strong>{' '}
                        <span className="font-mono text-[11px]">{shopifreeCfg.lastOrderCursor}</span>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  disabled={isPollingShopifreeNow || isDemoMode}
                  onClick={buscarPedidosShopifreeAhora}
                >
                  {isPollingShopifreeNow ? 'Buscando...' : 'Buscar pedidos ahora'}
                </Button>

                {shopifreePollResult && (
                  <Nota titulo={shopifreePollResult.ok ? 'Búsqueda completada' : 'Búsqueda con errores'}>
                    <div className="text-xs space-y-0.5">
                      {typeof shopifreePollResult.processed === 'number' && (
                        <>
                          <div>Pedidos revisados: {shopifreePollResult.processed}</div>
                          <div>Importados nuevos: <strong>{shopifreePollResult.created || 0}</strong></div>
                          {(shopifreePollResult.alreadySynced || 0) > 0 && (
                            <div>Ya sincronizados: {shopifreePollResult.alreadySynced}</div>
                          )}
                          {(shopifreePollResult.errors?.length || 0) > 0 && (
                            <div>Errores: {shopifreePollResult.errors.length}</div>
                          )}
                        </>
                      )}
                      {shopifreePollResult.error && <div>{shopifreePollResult.error}</div>}
                      {shopifreePollResult.errors?.length > 0 && (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer underline">Detalle de errores</summary>
                          <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                            {shopifreePollResult.errors.map((e, idx) => (
                              <li key={idx} className="font-mono text-[11px]">
                                {e.shopifreeOrderId ? `[${e.shopifreeOrderId}] ` : ''}{e.error}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  </Nota>
                )}

                <Nota titulo="Cómo funciona">
                  <ul className="text-xs space-y-0.5 list-disc pl-4">
                    <li>Los pedidos se importan en estado <strong>Pendiente</strong> y aparecen en <strong>Pedidos Online</strong>.</li>
                    <li>Desde ahí puedes aceptar, preparar, generar boleta o factura y completar.</li>
                    <li>Una vez importado, el pedido queda marcado en Shopifree y no se vuelve a traer.</li>
                    <li>Los ítems que coinciden con tu catálogo se enlazan al producto interno; los creados a mano en Shopifree quedan marcados como externos.</li>
                  </ul>
                </Nota>
              </div>
            )}

            {/* Actividad reciente (Fase 3): observabilidad, plegada por defecto */}
            {shopifreeConectado && (
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMostrarActividadShopifree((v) => !v)}
                  >
                    {mostrarActividadShopifree ? 'Ocultar actividad reciente' : 'Ver actividad reciente'}
                  </Button>
                  {mostrarActividadShopifree && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={refreshShopifreeLogs}
                      disabled={shopifreeLogsLoading || isDemoMode}
                    >
                      {shopifreeLogsLoading ? 'Cargando...' : 'Actualizar'}
                    </Button>
                  )}
                </div>

                {mostrarActividadShopifree && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">
                      Últimos {shopifreeLogs.length} eventos de la integración.
                    </p>

                    {/* Stats agregadas */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        ['Pedidos hoy', shopifreeStats.ordersImportedToday],
                        ['Pedidos 7 días', shopifreeStats.ordersImportedWeek],
                        ['Productos 7 días', shopifreeStats.productsSyncedWeek],
                        ['Errores hoy', shopifreeStats.errorsToday],
                      ].map(([etiqueta, valor]) => (
                        <div key={etiqueta} className="border border-gray-200 rounded-lg p-2.5 text-center">
                          <div className="text-xs text-gray-500">{etiqueta}</div>
                          <div className="text-xl font-semibold text-gray-900 tabular-nums mt-0.5">{valor}</div>
                        </div>
                      ))}
                    </div>

                    {/* Filtros */}
                    <div className="flex flex-wrap gap-1">
                      {[
                        { id: 'all', label: 'Todos' },
                        { id: 'orders', label: 'Pedidos' },
                        { id: 'products', label: 'Productos' },
                        { id: 'errors', label: 'Errores' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setShopifreeLogFilter(f.id)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            shopifreeLogFilter === f.id
                              ? 'bg-primary-600 border-primary-600 text-white'
                              : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* Lista de eventos */}
                    {shopifreeLogsLoading ? (
                      <p className="text-center py-6 text-sm text-gray-500">Cargando...</p>
                    ) : shopifreeLogsFiltrados.length === 0 ? (
                      <p className="text-center py-6 text-sm text-gray-500">
                        {shopifreeLogs.length === 0
                          ? 'Aún no hay actividad registrada.'
                          : 'No hay eventos que coincidan con el filtro.'}
                      </p>
                    ) : (
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-96 overflow-y-auto">
                        {shopifreeLogsFiltrados.map((log) => {
                          const ts = log.createdAt?.toDate ? log.createdAt.toDate() : null
                          const isError = log.ok === false || (log.errorCount || 0) > 0
                          const resumen = (
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-gray-900 truncate">
                                  {getLogActionLabel(log.action)}
                                  {isError && <span className="font-normal text-gray-500"> · con errores</span>}
                                </span>
                                <span className="text-[11px] text-gray-500 whitespace-nowrap">
                                  {ts ? ts.toLocaleString('es-PE', {
                                    day: '2-digit', month: '2-digit',
                                    hour: '2-digit', minute: '2-digit',
                                  }) : '—'}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 mt-0.5 truncate">
                                {log.productName && <span>{log.productName} </span>}
                                {typeof log.created === 'number' && log.action === 'orders_poll' && (
                                  <span>· {log.created} pedido{log.created !== 1 ? 's' : ''} importado{log.created !== 1 ? 's' : ''}</span>
                                )}
                                {typeof log.totalChecked === 'number' && log.action === 'products_resync_all' && (
                                  <span>· {log.totalPushed}/{log.totalChecked} productos</span>
                                )}
                                {log.error && <span> · {log.error}</span>}
                              </div>
                            </div>
                          )
                          // El JSON del evento es para depurar: solo admin.
                          return isAdmin ? (
                            <details key={log.id}>
                              <summary className="cursor-pointer p-3 hover:bg-gray-50">{resumen}</summary>
                              <pre className="text-[10px] font-mono bg-gray-50 p-2 mx-3 mb-3 rounded overflow-x-auto text-gray-700">
                                {JSON.stringify({
                                  ...log,
                                  createdAt: ts ? ts.toISOString() : undefined,
                                }, null, 2)}
                              </pre>
                            </details>
                          ) : (
                            <div key={log.id} className="p-3">{resumen}</div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Seccion>

      <Separador />

      {/* ── Meta Ads ─────────────────────────────────────────────────────────── */}
      <Seccion
        id="meta-ads"
        titulo="Meta Ads"
        descripcion="Exporta tus ventas en el formato del Administrador de Eventos de Meta (Facebook Conversions)."
      >
        <Ajuste
          id="opcion-metaAdsEnabled"
          checked={metaAdsEnabled}
          onChange={(e) => setMetaAdsEnabled(e.target.checked)}
          titulo="Habilitar exportación para Meta Ads"
          descripcion='Muestra la sección "Meta Ads" en el menú, donde ingresas la hora real de cada venta y exportas en el formato exacto de Meta (event_name, event_time, phone, value, currency, Order_id).'
        />

        {metaAdsEnabled && (
          <div className="border border-gray-200 rounded-lg p-4">
            <Fila>
              <Campo
                id="opcion-metaAdsPhonePrefix"
                etiqueta="Prefijo de país (teléfono)"
                ayuda="Se antepone al teléfono del cliente si no lo tiene ya. Ej: +51"
              >
                <Input
                  value={metaAdsPhonePrefix}
                  onChange={(e) => setMetaAdsPhonePrefix(e.target.value)}
                  placeholder="+51"
                />
              </Campo>
              <Campo
                id="opcion-metaAdsOrderIdPrefix"
                etiqueta="Prefijo del Order ID (opcional)"
                ayuda={`El Order ID se formará así: ${(metaAdsOrderIdPrefix || 'PREFIJO') + '_YYYYMMDD_NN'}`}
              >
                <Input
                  value={metaAdsOrderIdPrefix}
                  onChange={(e) => setMetaAdsOrderIdPrefix(e.target.value.toUpperCase())}
                  placeholder="HDT"
                />
              </Campo>
            </Fila>
          </div>
        )}
      </Seccion>

      <BarraGuardar onClick={guardarIntegraciones} guardando={guardando} />
    </div>
  )
}
