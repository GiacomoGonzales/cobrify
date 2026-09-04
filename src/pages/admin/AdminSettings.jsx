import React, { useState, useEffect } from 'react'
import { db, auth } from '@/lib/firebase'
import { nombreRubro, sugerirRubroDeCuenta } from '@/data/rubros'
import { doc, collection, getDocs, deleteDoc, writeBatch, query, limit } from 'firebase/firestore'
import { PLANS, SELLABLE_PLAN_IDS } from '@/services/subscriptionService'
import {
  RefreshCw,
  Shield,
  Database,
  CheckCircle,
  Info,
  Clock,
  Trash2,
  Image as ImageIcon, Hash, Tag } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import { Boton, Seccion, Tabla, Th, Td, Fila, FilaVacia } from '@/components/admin/ui'
import { leerMantenimiento, guardarMantenimiento, MANTENIMIENTO_APAGADO } from '@/services/mantenimientoService'
import { VERSION, COMMIT, versionDetallada } from '@/utils/versionApp'
/**
 * Configuración del admin: tres pestañas.
 *
 * Ya no hay nada que "guardar" acá arriba. Había un botón Guardar global que
 * escribía `config/adminSettings`, pero de ese documento no queda nada vivo:
 * los planes se leen del código, el mantenimiento se guarda solo al prenderlo
 * y las herramientas de Mantenimiento actúan directo.
 */
export default function AdminSettings() {
  const [activeSection, setActiveSection] = useState('plans')

  const sections = [
    { id: 'plans', label: 'Planes' },
    { id: 'system', label: 'Sistema' },
    { id: 'maintenance', label: 'Mantenimiento' }
  ]

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex items-center gap-1 border-b border-gray-200 px-2 overflow-x-auto">
          {sections.map(section => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`px-3 py-2.5 text-[13px] border-b-2 -mb-px whitespace-nowrap ${
                activeSection === section.id ? 'border-gray-900 text-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        <div className="p-3 sm:p-6">
          {activeSection === 'plans' && <PlansSection plans={PLANS} />}
          {activeSection === 'system' && <SystemSection />}
          {activeSection === 'maintenance' && <MaintenanceSection />}
        </div>
      </div>
    </div>
  )
}

/**
 * Planes.
 *
 * Solo existen dos cosas: los 6 que se VENDEN y el interno ENTERPRISE. Los dos
 * viven escritos en `subscriptionService.js`, asi que esta pantalla los muestra
 * y no los edita.
 *
 * NO hay planes personalizados. Los hubo: se creaban en la base y se mezclaban
 * con el catalogo, y encima el boton de editar un plan del catalogo guardaba un
 * personalizado con el MISMO id, dejando dos definiciones del mismo plan
 * compitiendo. Se quitaron a pedido de Giacomo — un precio pactado se resuelve
 * con `renewalPrice` en la ficha de la cuenta, que es lo que ya hace el sistema
 * al registrar un pago distinto al de catalogo.
 *
 * Los ANTIGUOS (migraciones viejas y `trial`) se pueden consultar plegados: hay
 * cuentas vivas paradas en ellos.
 */

const numeroOIlimitado = v => (v === -1 || v === 0 || v == null ? 'Ilimitados' : new Intl.NumberFormat('es-PE').format(v))
const sucursales = v => (v === -1 ? 'Ilimitadas' : v ?? 1)
const duracion = m => (m >= 999 ? 'Sin vencimiento' : m === 1 ? '1 mes' : `${m} meses`)
const soles = v => `S/ ${Number(v || 0).toFixed(2)}`

function PlansSection({ plans }) {
  const [verAntiguos, setVerAntiguos] = useState(false)

  const catalogo = plans && Object.keys(plans).length ? plans : PLANS
  const vendibles = SELLABLE_PLAN_IDS.map(id => [id, catalogo[id]]).filter(([, p]) => p)
  const enterprise = catalogo.enterprise ? [['enterprise', catalogo.enterprise]] : []
  const antiguos = Object.entries(catalogo)
    .filter(([id]) => !SELLABLE_PLAN_IDS.includes(id) && id !== 'enterprise')
    .sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="flex flex-col gap-4">
      <Seccion
        titulo={`Planes que se venden (${vendibles.length})`}
        descripcion="El catálogo vigente. Viven en el código, así que se cambian ahí y no desde esta pantalla."
        sinRelleno
      >
        <TablaDePlanes filas={vendibles} />
        <div className="px-4 py-3 border-t border-gray-200">
          <p className="text-[12.5px] text-gray-600">
            Cualquiera de estos planes puede emitir por QPse o por SUNAT directo. El método no
            depende del plan: se pacta con cada cliente y se configura en su ficha, en «Emisión
            electrónica».
          </p>
        </div>
      </Seccion>

      <Seccion
        titulo="Plan interno"
        descripcion="Para cuentas de la casa: todo ilimitado y sin fecha de vencimiento."
        sinRelleno
      >
        <TablaDePlanes filas={enterprise} vacio="No está definido en el catálogo." />
        <div className="px-4 py-3 border-t border-gray-200">
          <p className="text-[12.5px] text-gray-600">
            Se asigna desde la ficha de la cuenta, en «Cambiar plan». No se cobra, no vence y no
            recibe avisos de renovación. No hay planes personalizados: si a un cliente le pactaste
            otro precio, se registra el pago con el monto real y queda como precio pactado de esa
            cuenta.
          </p>
        </div>
      </Seccion>

      {!verAntiguos ? (
        <button
          type="button"
          onClick={() => setVerAntiguos(true)}
          className="self-start text-[12.5px] text-gray-500 hover:text-gray-900 underline underline-offset-2"
        >
          Ver planes antiguos ({antiguos.length})
        </button>
      ) : (
        <Seccion
          titulo={`Planes antiguos (${antiguos.length})`}
          descripcion="No se venden, pero hay cuentas que todavía los tienen. Solo para consultar."
          sinRelleno
          acciones={<Boton tamano="sm" variante="enlace" onClick={() => setVerAntiguos(false)}>Ocultar</Boton>}
        >
          <TablaDePlanes filas={antiguos} />
        </Seccion>
      )}
    </div>
  )
}

/** Los planes en filas, y en tarjetas en el celular. */
function TablaDePlanes({ filas, vacio = 'Sin planes' }) {
  const dato = plan => ({
    duracion: duracion(plan.months || 1),
    precio: plan.totalPrice > 0 ? soles(plan.totalPrice) : 'Sin costo',
    comprobantes: numeroOIlimitado(plan.limits?.maxInvoicesPerMonth),
    sucursales: sucursales(plan.limits?.maxBranches),
  })

  return (
    <>
      <div className="sm:hidden divide-y divide-gray-100">
        {filas.length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-gray-500">{vacio}</p>}
        {filas.map(([id, plan]) => {
          const d = dato(plan)
          return (
            <div key={id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-gray-900 break-words">{plan.name || id}</p>
                  <p className="font-mono text-[11px] text-gray-400">{id}</p>
                </div>
                <span className="shrink-0 text-[12.5px] font-medium text-gray-900">{d.precio}</span>
              </div>
              <dl className="mt-1 space-y-0.5">
                {[['Duración', d.duracion], ['Comprobantes', d.comprobantes], ['Sucursales', d.sucursales]].map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-[11.5px]">
                    <dt className="w-24 shrink-0 text-gray-500">{k}</dt>
                    <dd className="min-w-0 flex-1 text-gray-700">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>

      <div className="hidden sm:block">
        <Tabla>
          <thead>
            <tr>
              <Th>Plan</Th>
              <Th>Duración</Th>
              <Th alinear="der">Precio</Th>
              <Th alinear="der">Comprobantes/mes</Th>
              <Th alinear="der">Sucursales</Th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <FilaVacia colSpan={5}>{vacio}</FilaVacia>}
            {filas.map(([id, plan]) => {
              const d = dato(plan)
              return (
                <Fila key={id}>
                  <Td>
                    <span className="font-medium">{plan.name || id}</span>
                    <span className="block font-mono text-[11px] text-gray-400">{id}</span>
                  </Td>
                  <Td apagado>{d.duracion}</Td>
                  <Td numero className="font-medium">{d.precio}</Td>
                  <Td numero apagado>{d.comprobantes}</Td>
                  <Td numero apagado>{d.sucursales}</Td>
                </Fila>
              )
            })}
          </tbody>
        </Tabla>
      </div>
    </>
  )
}

/**
 * Sistema.
 *
 * Antes vivían acá cuatro cosas y tres no hacían nada: "permitir nuevos
 * registros" y "modo mantenimiento" no los leía nadie, y las "excepciones" a la
 * pausa de SUNAT tampoco — el negocio que agregabas seguía pausado igual.
 *
 * La pausa de SUNAT sí se leía, pero solo en el POS y encima fallaba: las
 * reglas dan `config/*` solo a los admins, así que el cliente al que había que
 * pausar era el único que no podía leer el interruptor. Se quitó a pedido de
 * Giacomo: ya no la usa (Ley 31556).
 *
 * Queda una sola cosa, y funciona de verdad: el modo mantenimiento.
 */
function SystemSection() {
  const [estado, setEstado] = useState(MANTENIMIENTO_APAGADO)
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    leerMantenimiento().then(m => {
      setEstado(m)
      setMensaje(m.mensaje)
      setCargando(false)
    })
  }, [])

  async function cambiar(activo) {
    if (activo && !window.confirm('¿Cerrar Cobrify a todos los clientes ahora mismo?\n\nDejan de poder facturar hasta que lo apagues. Tú sigues entrando al panel.')) return
    setGuardando(true)
    setError(null)
    try {
      await guardarMantenimiento({ activo, mensaje })
      setEstado({ activo, mensaje: mensaje.trim() })
    } catch (e) {
      setError(e.message || 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function guardarMensaje() {
    setGuardando(true)
    setError(null)
    try {
      await guardarMantenimiento({ activo: estado.activo, mensaje })
      setEstado(e => ({ ...e, mensaje: mensaje.trim() }))
    } catch (e) {
      setError(e.message || 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Seccion
        titulo="Modo mantenimiento"
        descripcion="Cierra Cobrify a los clientes mientras trabajas. Se aplica al instante en las sesiones abiertas, y al apagarlo vuelven solas sin recargar. A ti no te bloquea: el panel sigue funcionando."
      >
        {cargando ? (
          <p className="py-2 text-gray-500">Cargando…</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 py-1">
              <div>
                <p className="font-medium text-gray-900">
                  {estado.activo ? 'Cobrify está cerrado' : 'Cobrify está abierto'}
                </p>
                <p className="text-gray-500">
                  {estado.activo
                    ? 'Tus clientes ven la pantalla de mantenimiento y no pueden facturar.'
                    : 'Todo funciona con normalidad.'}
                </p>
              </div>
              <Boton
                variante={estado.activo ? 'primario' : 'peligro'}
                tamano="sm"
                onClick={() => cambiar(!estado.activo)}
                disabled={guardando}
              >
                {guardando ? 'Guardando…' : estado.activo ? 'Abrir de nuevo' : 'Cerrar ahora'}
              </Boton>
            </div>

            <div className="mt-4 border-t border-gray-100 pt-4">
              <label className="block font-medium text-gray-900">Mensaje para el cliente</label>
              <p className="mb-2 text-gray-500">Si lo dejas vacío, se muestra un aviso genérico.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mensaje}
                  onChange={e => setMensaje(e.target.value)}
                  maxLength={200}
                  placeholder="Volvemos a las 3 de la tarde."
                  className="h-8 flex-1 rounded-md border border-gray-300 px-2.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
                <Boton tamano="sm" onClick={guardarMensaje} disabled={guardando || mensaje === estado.mensaje}>
                  Guardar
                </Boton>
              </div>
            </div>

            {error && <p className="mt-3 text-red-600">{error}</p>}
          </>
        )}
      </Seccion>

      <Seccion titulo="Información">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Versión</span>
            <span className="font-mono text-gray-900" title={versionDetallada()}>v{VERSION}{COMMIT ? ` · ${COMMIT}` : ''}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Entorno</span>
            <span className="font-mono text-gray-900">{import.meta.env.MODE === 'production' ? 'Producción' : 'Desarrollo'}</span>
          </div>
        </div>
      </Seccion>
    </div>
  )
}

/**
 * Productos con IGV 10% que deberían ser 10.5%. Es una reparación puntual de
 * cuando cambió la Ley 31556, no una configuración: por eso vive acá y ya no
 * en la pestaña Sistema. Borra el `igvRate` del producto para que herede el
 * del negocio.
 */
function ProductosIgv10Card() {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [migrating, setMigrating] = useState(false)
  const [migrateMsg, setMigrateMsg] = useState(null)

  async function scanProducts() {
    setScanning(true)
    setScanResult(null)
    setMigrateMsg(null)
    try {
      // Buscar negocios con IGV reducido
      const { collection: colRef, getDocs: getDocsSnap, query, where } = await import('firebase/firestore')
      const businessesSnap = await getDocsSnap(colRef(db, 'businesses'))
      const results = []

      for (const bizDoc of businessesSnap.docs) {
        const bizData = bizDoc.data()

        // Buscar productos con igvRate = 10 en TODOS los negocios
        const productsQuery = query(colRef(db, 'businesses', bizDoc.id, 'products'), where('igvRate', '==', 10))
        const productsSnap = await getDocsSnap(productsQuery)
        if (productsSnap.empty) continue

        const tc = bizData.emissionConfig?.taxConfig
        results.push({
          businessId: bizDoc.id,
          businessName: bizData.razonSocial || bizData.businessName || bizDoc.id,
          configIgv: tc?.igvRate ?? 18,
          taxType: tc?.taxType || 'standard',
          products: productsSnap.docs.map(p => ({ id: p.id, name: p.data().name }))
        })
      }
      setScanResult(results)
    } catch (error) {
      setMigrateMsg({ success: false, message: error.message })
    } finally {
      setScanning(false)
    }
  }

  async function fixProducts(businessId, productIds) {
    setMigrating(true)
    try {
      const { doc: docRef, updateDoc, deleteField } = await import('firebase/firestore')
      for (const pid of productIds) {
        await updateDoc(docRef(db, 'businesses', businessId, 'products', pid), { igvRate: deleteField() })
      }
      // Quitar del resultado
      setScanResult(prev => prev.map(r => r.businessId === businessId ? { ...r, products: [] } : r).filter(r => r.products.length > 0))
      setMigrateMsg({ success: true, message: `${productIds.length} productos corregidos` })
    } catch (error) {
      setMigrateMsg({ success: false, message: error.message })
    } finally {
      setMigrating(false)
    }
  }

  async function fixAll() {
    if (!scanResult?.length) return
    setMigrating(true)
    let total = 0
    try {
      const { doc: docRef, updateDoc, deleteField } = await import('firebase/firestore')
      for (const biz of scanResult) {
        for (const p of biz.products) {
          await updateDoc(docRef(db, 'businesses', biz.businessId, 'products', p.id), { igvRate: deleteField() })
          total++
        }
      }
      setScanResult([])
      setMigrateMsg({ success: true, message: `${total} productos corregidos en total` })
    } catch (error) {
      setMigrateMsg({ success: false, message: error.message })
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Productos con IGV 10% (deben ser 10.5%)</p>
            <p className="text-sm text-gray-500">Detecta negocios con IGV reducido cuyos productos aún tienen 10% guardado</p>
          </div>
          <button
            onClick={scanProducts}
            disabled={scanning}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm font-medium"
          >
            {scanning ? 'Escaneando...' : 'Escanear'}
          </button>
        </div>

        {/* Resultados del escaneo */}
        {scanResult !== null && (
          <div className="mt-3 p-3 bg-white rounded-lg border text-sm max-h-80 overflow-y-auto">
            {scanResult.length === 0 ? (
              <p className="text-gray-700 font-medium">Todo correcto. No hay productos con IGV 10%.</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium text-gray-900">
                    {scanResult.reduce((sum, r) => sum + r.products.length, 0)} productos en {scanResult.length} negocios
                  </p>
                  <button
                    onClick={fixAll}
                    disabled={migrating}
                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-xs font-medium"
                  >
                    {migrating ? 'Corrigiendo...' : 'Corregir todos'}
                  </button>
                </div>
                {scanResult.map(biz => (
                  <div key={biz.businessId} className="mb-3 pb-3 border-b last:border-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-800">{biz.businessName}</p>
                        <p className="text-xs text-gray-500">Config actual: IGV {biz.configIgv}% ({biz.taxType}) — {biz.products.length} productos con 10%</p>
                      </div>
                      <button
                        onClick={() => fixProducts(biz.businessId, biz.products.map(p => p.id))}
                        disabled={migrating}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 disabled:opacity-50 shrink-0"
                      >
                        Corregir
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {biz.products.map(p => (
                        <span key={p.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{p.name}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Mensaje */}
        {migrateMsg && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${migrateMsg.success ? 'bg-gray-50 text-gray-900' : 'bg-red-50 text-red-800'}`}>
            <p className="font-medium">{migrateMsg.message}</p>
          </div>
        )}
      </div>
  )
}

function MaintenanceSection() {
  const [cleaning, setCleaning] = useState(false)
  const [result, setResult] = useState(null)

  async function cleanupSubUserSubscriptions() {
    setCleaning(true)
    setResult(null)

    try {
      // 1. Obtener todos los usuarios con ownerId (sub-usuarios)
      const usersSnapshot = await getDocs(collection(db, 'users'))
      const subUserIds = new Set()

      usersSnapshot.forEach(docSnap => {
        const data = docSnap.data()
        if (data.ownerId) {
          subUserIds.add(docSnap.id)
        }
      })

      console.log(`Encontrados ${subUserIds.size} sub-usuarios`)

      // 2. Buscar suscripciones que pertenecen a sub-usuarios
      const subscriptionsSnapshot = await getDocs(collection(db, 'subscriptions'))
      const toDelete = []

      subscriptionsSnapshot.forEach(docSnap => {
        if (subUserIds.has(docSnap.id)) {
          toDelete.push({
            id: docSnap.id,
            email: docSnap.data().email,
            plan: docSnap.data().plan
          })
        }
      })

      console.log(`Suscripciones a eliminar: ${toDelete.length}`)

      // 3. Eliminar las suscripciones incorrectas
      let deleted = 0
      for (const sub of toDelete) {
        try {
          await deleteDoc(doc(db, 'subscriptions', sub.id))
          deleted++
          console.log(`Eliminada suscripción de: ${sub.email}`)
        } catch (error) {
          console.error(`Error al eliminar ${sub.email}:`, error)
        }
      }

      setResult({
        success: true,
        message: `Limpieza completada: ${deleted} suscripciones de sub-usuarios eliminadas`,
        details: toDelete
      })

    } catch (error) {
      console.error('Error en limpieza:', error)
      setResult({
        success: false,
        message: `Error: ${error.message}`
      })
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Herramientas de Mantenimiento</h3>

        <div className="space-y-4">
          {/* Limpieza de suscripciones de sub-usuarios */}
          <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
            <div className="flex items-start gap-3">
              <Trash2 className="w-6 h-6 text-gray-700 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">Limpiar suscripciones de sub-usuarios</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Elimina suscripciones "trial" que fueron creadas incorrectamente para sub-usuarios.
                  Los sub-usuarios deben usar la suscripción de su negocio principal.
                </p>

                <button
                  onClick={cleanupSubUserSubscriptions}
                  disabled={cleaning}
                  className="mt-3 flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {cleaning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Limpiando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Ejecutar limpieza
                    </>
                  )}
                </button>

                {result && (
                  <div className={`mt-3 p-3 rounded-lg ${result.success ? 'bg-gray-100 text-gray-900' : 'chip-error'}`}>
                    <p className="font-medium">{result.message}</p>
                    {result.details && result.details.length > 0 && (
                      <ul className="mt-2 text-sm">
                        {result.details.map((d, i) => (
                          <li key={i}>• {d.email} (plan: {d.plan})</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Limpiar Cloudinary: borrar lo ya migrado a R2 (paso final del cierre, irreversible) */}
          <CloudinaryCleanupCard />

          {/* Inventario para migración a Cloudflare R2 (solo lectura, no modifica nada) */}
          <CloudinaryInventoryCard />

          {/* Migración Cloudinary → Cloudflare R2, un negocio a la vez (piloto) */}
          <R2MigrationCard />

          {/* Migración de credenciales SUNAT a subcolección protegida (cierre de exposición pública) */}
          <EmissionSecretsMigrationCard />
          <CodigoClienteCard />
          <RubroSugeridoCard />

          {/* Productos con IGV 10% que deberían ser 10.5% (Ley 31556). Vivía en Sistema. */}
          <ProductosIgv10Card />

          {/* Info */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center gap-2 text-gray-900">
              <Info className="w-5 h-5" />
              <p className="text-sm">
                Estas herramientas son para uso administrativo. Úsalas con precaución.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatBytes(b) {
  if (!b || b < 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0; let n = b
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 ? 2 : 1)} ${u[i]}`
}

// Dispara la Cloud Function migrateEmissionSecrets (admin-only) que mueve el
// certificado/claves SUNAT/QPse del doc público a /businesses/{id}/secrets/emission.
// Orden: Probar (dry-run) → Copiar → (deploy del cliente) → Borrar del doc público.
/**
 * Código de cliente: numera de una vez las cuentas que ya existen, por orden
 * de alta (la más antigua es la 1000001). Las nuevas se numeran solas al
 * nacer (trigger `asignarCodigoCliente`). Primero "Simular" para ver cuántas
 * y cuáles; "Numerar" recién cuando el reporte cuadre.
 */
function CodigoClienteCard() {
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const URL = 'https://us-central1-cobrify-395fe.cloudfunctions.net/numerarClientes'

  async function run(mode) {
    if (mode === 'real' && !window.confirm('¿Numerar todas las cuentas que todavía no tienen código? El número se asigna una sola vez y no se cambia después.')) return
    setBusy(mode)
    setResult(null)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch(URL + (mode === 'dry' ? '?dryRun=1' : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({}),
      })
      setResult(await res.json())
    } catch (e) {
      setResult({ success: false, error: e.message })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
      <div className="flex items-start gap-3">
        <Hash className="w-6 h-6 text-gray-700 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">Códigos de cliente</h4>
          <p className="text-sm text-gray-600 mt-1">
            Da a cada cuenta su código de cliente (desde <b>1000001</b>, por orden de alta). Se asigna una sola
            vez y no cambia. Las cuentas nuevas lo reciben solas al crearse; esto es solo para las que ya existen.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => run('dry')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-100 disabled:opacity-50">
              {busy === 'dry' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />} Simular
            </button>
            <button onClick={() => run('real')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {busy === 'real' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />} Numerar ahora
            </button>
          </div>
          {result && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${result.success ? 'bg-white border border-gray-200' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {result.success ? (
                <>
                  <p className="text-gray-800">
                    {result.dryRun ? 'Simulación: ' : 'Listo: '}
                    <b>{result.total}</b> cuentas en total ·{' '}
                    {result.dryRun
                      ? <><b>{result.yaNumerados}</b> ya tenían código · <b>{result.porNumerar}</b> por numerar{result.fechaDesdeAuth ? <> · <b>{result.fechaDesdeAuth}</b> con fecha tomada de Auth</> : null}{result.sinFechaDeAlta ? <> · <b>{result.sinFechaDeAlta}</b> sin fecha de alta (van al final)</> : null}</>
                      : <><b>{result.asignados}</b> numeradas · último código <b>{result.ultimoCodigo}</b></>}
                  </p>
                  {Array.isArray(result.muestra) && result.muestra.length > 0 && (
                    <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
                      {result.muestra.map((m) => (
                        <li key={m.id}><span className="text-gray-400">{m.alta || 'sin fecha'}</span> · {m.nombre}{m.ruc ? ` · RUC ${m.ruc}` : ''}</li>
                      ))}
                      {result.dryRun && result.porNumerar > result.muestra.length && <li className="text-gray-400">… y {result.porNumerar - result.muestra.length} más</li>}
                    </ul>
                  )}
                </>
              ) : <p>{result.error || 'Error'}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Rubro sugerido. Propone el rubro de cada cuenta con lo que ya tenemos: el
 * modo de negocio, el nombre y, para las que no se dejan adivinar, lo que
 * venden. No consulta a nadie de afuera: es gratis.
 *
 * La versión anterior le preguntaba la actividad económica a SUNAT vía
 * apiperu.dev y devolvía 709 de 709 "sin datos": esa API no entrega el CIIU
 * por ningún endpoint, y cada intento gastaba un crédito. Ver el comentario
 * de `functions/src/data/clasificador.js`.
 *
 * Escribe solo `rubroSugerido`. El rubro de verdad (`rubro`) se confirma a
 * mano en la ficha del cliente: esto es para llegar ahí con la mayoría ya
 * resuelta, no para decidir por el dueño.
 */
function RubroSugeridoCard() {
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const [progreso, setProgreso] = useState(null)
  const [conProductos, setConProductos] = useState(true)

  /** Lee hasta 60 nombres de producto de una cuenta. Con eso sobra para votar. */
  async function nombresDeProductos(businessId) {
    try {
      const snap = await getDocs(query(collection(db, 'businesses', businessId, 'products'), limit(60)))
      return snap.docs.map((d) => d.data()?.name).filter(Boolean)
    } catch {
      return []
    }
  }

  /** De a 10 en paralelo: 700 cuentas de una sola vez ahoga al navegador. */
  async function enTandas(items, tam, fn, alAvanzar) {
    const salida = []
    for (let i = 0; i < items.length; i += tam) {
      salida.push(...await Promise.all(items.slice(i, i + tam).map(fn)))
      alAvanzar?.(Math.min(i + tam, items.length))
    }
    return salida
  }

  async function run(mode) {
    if (mode === 'save' && !window.confirm('¿Guardar el rubro sugerido en cada cuenta? No toca el rubro confirmado, solo la sugerencia.')) return
    setBusy(mode)
    setResult(null)
    setProgreso(null)
    try {
      // El nombre del negocio está repartido en tres colecciones según por
      // dónde se creó la cuenta: el reseller escribe `razonSocial`/`tradeName`
      // en businesses, el alta normal deja `businessName` en users, y
      // subscriptions guarda su propia copia. Leer solo businesses dejaba
      // decenas de cuentas "sin nombre" que sí lo tienen. Es la misma cadena
      // que usa el listado de Admin > Usuarios.
      const [snap, usersSnap, subsSnap] = await Promise.all([
        getDocs(collection(db, 'businesses')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'subscriptions')),
      ])
      const porId = (s) => new Map(s.docs.map((d) => [d.id, d.data()]))
      const usuarios = porId(usersSnap)
      const suscripciones = porId(subsSnap)

      // Primera pasada: nombre y modo. Es instantánea y resuelve la mayoría.
      const cuentas = snap.docs.map((d) => {
        const b = d.data()
        const u = usuarios.get(d.id) || {}
        const sub = suscripciones.get(d.id) || {}
        const nombre = [b.razonSocial, b.tradeName, b.businessName, b.nombreComercial, b.name,
                        u.businessName, u.razonSocial, sub.businessName]
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(' · ')
        const base = { nombre, modo: b.businessMode, actividadSunat: b.actividadSunat, estacionServicio: b.serviceStationConfig?.enabled === true }
        // `nombre` y `correo` van también aquí afuera: el reporte los lee de
        // este nivel, y tenerlos solo dentro de `base` hacía que la lista de
        // sin clasificar saliera entera como "(cuenta sin nombre)".
        return {
          id: d.id,
          nombre,
          correo: u.email || sub.email || b.email || '',
          ruc: String(b.ruc || u.ruc || '').trim(),
          rubroSugerido: b.rubroSugerido || null,
          base,
          ...sugerirRubroDeCuenta(base),
        }
      })

      // Segunda pasada: solo las que quedaron sin rubro o con una suposición.
      // Al resto no hay para qué leerle el inventario.
      let mirados = 0
      if (conProductos) {
        const dudosas = cuentas.filter((c) => !c.rubro || c.motivo === 'modo-supuesto' || c.motivo === 'nombre-generico')
        mirados = dudosas.length
        setProgreso({ hecho: 0, total: dudosas.length })
        await enTandas(dudosas, 10, async (c) => {
          const productos = await nombresDeProductos(c.id)
          c.cuantosProductos = productos.length
          c.ejemplos = productos.slice(0, 4)
          Object.assign(c, sugerirRubroDeCuenta({ ...c.base, productos }))
        }, (hecho) => setProgreso({ hecho, total: dudosas.length }))
        setProgreso(null)
      }

      const cuenta = { total: cuentas.length, sugeridos: {}, motivos: {}, sinClasificar: 0, guardadas: 0, mirados }
      // Las que quedan sin rubro se parten en dos, porque no tienen arreglo
      // parecido: al RUC 10 (persona natural) la razón social ES el nombre de
      // la persona y ningún patrón lo va a sacar; el RUC 20 sin pistas sí se
      // rescata agregando patrones al catálogo.
      const huerfanas = { persona: 0, empresa: 0, sinRuc: 0 }
      // ¿El techo es que falta vocabulario o que la cuenta no vendió nunca?
      // Sin esto uno se pone a inventar patrones para inventarios vacíos.
      const inventario = { vacio: 0, pocos: 0, sinMayoria: 0 }
      // Qué venden las que sí tienen inventario y aun así no se dejan
      // clasificar. Es lo único que hace falta para ampliar el vocabulario.
      const muestraInventarios = []
      const sinPistas = []
      const cambios = []

      for (const c of cuentas) {
        if (c.rubro) {
          cuenta.sugeridos[c.rubro] = (cuenta.sugeridos[c.rubro] || 0) + 1
          cuenta.motivos[c.motivo] = (cuenta.motivos[c.motivo] || 0) + 1
        } else {
          cuenta.sinClasificar += 1
          if (c.cuantosProductos === 0) inventario.vacio += 1
          else if (c.cuantosProductos < 3) inventario.pocos += 1
          else if (c.cuantosProductos >= 3) {
            inventario.sinMayoria += 1
            if (muestraInventarios.length < 14) {
              muestraInventarios.push({ nombre: c.nombre || c.correo || c.id, productos: c.ejemplos })
            }
          }
          if (c.ruc.startsWith('10')) huerfanas.persona += 1
          else if (c.ruc.startsWith('20')) {
            huerfanas.empresa += 1
            if (sinPistas.length < 25) sinPistas.push(c.nombre || `sin nombre · ${c.correo || c.id}`)
          } else huerfanas.sinRuc += 1
        }
        if (c.rubroSugerido !== c.rubro) cambios.push({ id: c.id, rubro: c.rubro })
      }

      if (mode === 'save' && cambios.length) {
        // De a 400 por lote: el tope de Firestore es 500 operaciones.
        for (let i = 0; i < cambios.length; i += 400) {
          const lote = writeBatch(db)
          for (const c of cambios.slice(i, i + 400)) {
            lote.update(doc(db, 'businesses', c.id), { rubroSugerido: c.rubro, rubroSugeridoEn: new Date() })
          }
          await lote.commit()
          cuenta.guardadas += Math.min(400, cambios.length - i)
        }
      }

      setResult({ success: true, mode, porGuardar: cambios.length, sinPistas, huerfanas, inventario, muestraInventarios, ...cuenta })
    } catch (e) {
      setResult({ success: false, error: e.message })
    } finally {
      setBusy('')
      setProgreso(null)
    }
  }

  const etiquetaMotivo = {
    nombre: 'por el nombre',
    modo: 'por el modo (solo admite ese rubro)',
    productos: 'por lo que venden',
    'nombre-generico': 'por una palabra genérica del nombre (flojo)',
    'modo-supuesto': 'ASUMIDOS por el modo, sin más pistas',
    grifo: 'por tener el modo grifo prendido',
    sunat: 'por la actividad de SUNAT',
  }

  return (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
      <div className="flex items-start gap-3">
        <Tag className="w-6 h-6 text-gray-700 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">Rubro sugerido</h4>
          <p className="text-sm text-gray-600 mt-1">
            Propone el rubro de cada cuenta leyendo el <b>nombre del negocio</b> y su modo. No consulta SUNAT
            ni gasta créditos: es instantáneo. <b>No cambia el rubro confirmado</b>, solo deja la sugerencia
            para revisarla en la ficha.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => run('dry')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-100 disabled:opacity-50">
              {busy === 'dry' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />} Simular
            </button>
            <button onClick={() => run('save')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {busy === 'save' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />} Guardar sugerencias
            </button>
          </div>
          {progreso && (
            <p className="mt-2 text-sm text-gray-600">
              <RefreshCw className="inline w-4 h-4 animate-spin mr-1" />
              Revisando inventarios: {progreso.hecho} de {progreso.total}…
            </p>
          )}
          {result && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${result.success ? 'bg-white border border-gray-200' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {result.success ? (
                <>
                  <p className="text-gray-800">
                    {result.mode === 'dry' ? 'Simulación: ' : 'Listo: '}
                    <b>{result.total}</b> cuentas · <b>{result.total - result.sinClasificar}</b> con rubro sugerido ·{' '}
                    <b>{result.sinClasificar}</b> sin clasificar
                    {result.mode === 'dry'
                      ? <> · <b>{result.porGuardar}</b> por guardar</>
                      : <> · <b>{result.guardadas}</b> guardadas</>}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {Object.entries(result.motivos).map(([m, n]) => `${n} ${etiquetaMotivo[m] || m}`).join(' · ')}
                  </p>
                  <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
                    {Object.entries(result.sugeridos).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                      <li key={id}><b>{n}</b> · {nombreRubro(id)} <span className="text-gray-400">({id})</span></li>
                    ))}
                  </ul>
                  {result.sinClasificar > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-700">
                        Sin clasificar: <b>{result.huerfanas.persona}</b> personas naturales (RUC 10, la razón social
                        es el nombre de la persona: no hay patrón que valga) · <b>{result.huerfanas.empresa}</b> empresas
                        · <b>{result.huerfanas.sinRuc}</b> sin RUC.
                      </p>
                      {result.mirados > 0 && (
                        <p className="mt-1 text-xs text-gray-700">
                          Y por inventario: <b>{result.inventario.vacio}</b> nunca cargaron un producto ·{' '}
                          <b>{result.inventario.pocos}</b> tienen menos de tres ·{' '}
                          <b>{result.inventario.sinMayoria}</b> sí venden pero el catálogo no reconoce lo suficiente
                          (esas son las que se arreglan con más patrones).
                        </p>
                      )}
                      {result.muestraInventarios?.length > 0 && (
                        <>
                          <p className="mt-3 text-xs text-gray-500">
                            Qué venden las que tienen inventario y aun así no se dejan clasificar. Esto es lo que sirve para
                            ampliar el vocabulario:
                          </p>
                          <ul className="mt-1 text-xs text-gray-600 space-y-1">
                            {result.muestraInventarios.map((m, i) => (
                              <li key={i}>
                                <span className="text-gray-400">{m.nombre}</span><br />
                                {m.productos.join(' · ')}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {result.sinPistas.length > 0 && (
                        <>
                          <p className="mt-3 text-xs text-gray-500">
                            Empresas cuyo nombre no dice a qué se dedican. Si aquí ves un patrón que falta, se agrega al catálogo:
                          </p>
                          <ul className="mt-1 text-xs text-gray-600 space-y-0.5">
                            {result.sinPistas.map((n, i) => <li key={i}>· {n}</li>)}
                            {result.huerfanas.empresa > result.sinPistas.length && (
                              <li className="text-gray-400">… y {result.huerfanas.empresa - result.sinPistas.length} más</li>
                            )}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : <p>{result.error || 'Error'}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EmissionSecretsMigrationCard() {
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const [businessId, setBusinessId] = useState('')

  const MIGRATE_URL = 'https://us-central1-cobrify-395fe.cloudfunctions.net/migrateEmissionSecrets'

  async function run(mode) {
    if (mode === 'delete' && !window.confirm('¿Borrar las credenciales del doc público? Hacelo SOLO después de desplegar el cliente que lee del subcolección.')) return
    setBusy(mode)
    setResult(null)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const body = {}
      const v = businessId.trim()
      if (v) { if (v.includes('@')) body.email = v; else body.businessId = v }
      if (mode === 'dryRun') body.dryRun = true
      if (mode === 'delete') body.deleteTopLevel = true
      const res = await fetch(MIGRATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify(body),
      })
      setResult(await res.json())
    } catch (e) {
      setResult({ success: false, error: e.message })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="bg-red-50 rounded-lg p-5 border border-red-200">
      <div className="flex items-start gap-3">
        <Shield className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">Migrar credenciales SUNAT a subcolección protegida</h4>
          <p className="text-sm text-gray-600 mt-1">
            Mueve el certificado .p12, claves SOL y credenciales QPse del doc público del negocio a la
            subcolección protegida <code>secrets/emission</code>. Orden: <b>Probar</b> → <b>Copiar</b> →
            (tras el deploy del cliente) <b>Borrar del doc público</b>.
          </p>
          <input
            type="text"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            placeholder="businessId o email (opcional: para probar un solo negocio)"
            className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => run('dryRun')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
              {busy === 'dryRun' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />} Probar (dry-run)
            </button>
            <button onClick={() => run('copy')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {busy === 'copy' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Copiar al subcolección
            </button>
            <button onClick={() => run('delete')} disabled={!!busy}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              {busy === 'delete' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Borrar del doc público
            </button>
          </div>
          {result && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${result.success ? 'bg-gray-100 text-gray-900' : 'chip-error'}`}>
              <p className="font-medium">{result.success ? `OK (${result.mode})` : `Error: ${result.error}`}</p>
              {result.stats && (
                <p className="mt-1">Total: {result.stats.total} · con secretos: {result.stats.withSecrets} · copiados: {result.stats.copied} · borrados: {result.stats.deleted} · sin secretos: {result.stats.skipped}</p>
              )}
              {result.details && (
                <pre className="mt-2 text-xs overflow-auto max-h-40">{JSON.stringify(result.details, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CloudinaryCleanupCard() {
  const [scanning, setScanning] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [cleanResult, setCleanResult] = useState(null)
  const [error, setError] = useState(null)

  async function runDryRun() {
    setScanning(true)
    setError(null)
    setScanResult(null)
    try {
      const fn = httpsCallable(functions, 'cleanupOrphanedCloudinaryAssets', { timeout: 540000 })
      const r = await fn({ dryRun: true })
      setScanResult(r.data)
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    } finally {
      setScanning(false)
    }
  }

  async function runCleanup() {
    if (!confirm(
      'Esto va a BORRAR de Cloudinary todos los assets que ya no estén referenciados ' +
      'desde Firestore. Es irreversible.\n\n' +
      'Solo apretá esto cuando TODOS los negocios estén migrados a Cloudflare R2 y verificados.\n\n' +
      '¿Confirmar?'
    )) return

    setCleaning(true)
    setError(null)
    setCleanResult(null)
    try {
      const fn = httpsCallable(functions, 'cleanupOrphanedCloudinaryAssets', { timeout: 540000 })
      const r = await fn({ dryRun: false })
      setCleanResult(r.data)
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="bg-red-50 rounded-lg p-5 border border-red-200">
      <div className="flex items-start gap-3">
        <Trash2 className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">Limpiar Cloudinary · borrar lo ya migrado a R2</h4>
          <p className="text-sm text-gray-600 mt-1">
            Borra de Cloudinary los assets del folder <code>cobrify/</code> que ya no
            están referenciados desde Firestore (lo que ya migraste a Cloudflare R2).
            Solo correr <strong>cuando TODOS los negocios estén migrados a R2 y verificados</strong>.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Siempre apretá primero "Escanear (dry run)" para ver cuántos assets serían
            borrados y cuántos GB liberarías, sin tocar nada.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={runDryRun}
              disabled={scanning || cleaning}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {scanning ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Escaneando...</>
              ) : (
                <><Info className="w-4 h-4" /> Escanear (dry run)</>
              )}
            </button>
            <button
              onClick={runCleanup}
              disabled={scanning || cleaning}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {cleaning ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Limpiando...</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Borrar huérfanos</>
              )}
            </button>
          </div>

          {scanResult && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-red-200 text-sm space-y-1">
              <p><strong>URLs vivas en Firestore:</strong> {scanResult.liveUrlsCollected}</p>
              <p><strong>Assets en Cloudinary:</strong> {scanResult.cloudinaryAssetsScanned}</p>
              <p><strong>Huérfanos (a borrar):</strong> {scanResult.orphansFound}</p>
              <p><strong>Storage que se liberaría:</strong> {formatBytes(scanResult.bytesFreed)}</p>
              {scanResult.sampleOrphans?.length > 0 && (
                <details className="text-xs text-gray-600 mt-1">
                  <summary className="cursor-pointer">Ver muestra</summary>
                  <ul className="mt-1 space-y-0.5">
                    {scanResult.sampleOrphans.map((o, i) => (
                      <li key={i} className="truncate">
                        • {o.publicId} ({o.format}, {formatBytes(o.bytes)})
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {cleanResult && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm space-y-1">
              <p className="font-medium text-gray-900">
                {cleanResult.doneAt ? '✓ Cleanup completado' : 'Cleanup en progreso'}
              </p>
              <p>Borrados: <strong>{cleanResult.orphansDeleted}</strong> de {cleanResult.orphansFound} huérfanos</p>
              <p>Storage liberado: <strong>{formatBytes(cleanResult.bytesFreed)}</strong></p>
              {cleanResult.errors > 0 && (
                <p className="text-gray-700">⚠ Errores: {cleanResult.errors} (revisá los logs)</p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CloudinaryInventoryCard() {
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function runInventory() {
    setAnalyzing(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      const { analyzeCloudinaryAssets } = await import('@/utils/cloudinary')
      const r = await analyzeCloudinaryAssets((p) => setProgress(p))
      setResult(r)
    } catch (e) {
      console.error(e)
      setError(e.message || String(e))
    } finally {
      setAnalyzing(false)
      setProgress(null)
    }
  }

  // Candidatos a piloto: negocios con assets en Cloudinary, de menor a mayor.
  const candidates = result?.perBusiness?.filter(b => b.cloudinaryImages > 0) || []

  return (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
      <div className="flex items-start gap-3">
        <ImageIcon className="w-6 h-6 text-gray-700 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">Inventario Cloudinary → Cloudflare R2 (solo lectura)</h4>
          <p className="text-sm text-gray-600 mt-1">
            Cuenta cuántas imágenes de <code className="mx-1">res.cloudinary.com</code>
            usa cada negocio (productos + logos/portadas), para elegir el negocio más chico
            como <strong>piloto</strong> de la migración a R2. No descarga, sube ni borra nada.
          </p>

          <div className="mt-3">
            <button
              onClick={runInventory}
              disabled={analyzing}
              className="flex items-center gap-2 px-4 py-2 border border-primary-600 text-gray-700 bg-white rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {analyzing ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Analizando...</>
              ) : (
                <><Info className="w-4 h-4" /> Analizar inventario (read-only)</>
              )}
            </button>
          </div>

          {progress && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 text-sm">
              <p>
                <strong>Analizando {progress.businessIndex} / {progress.totalBusinesses}:</strong>{' '}
                <span className="text-gray-700">{progress.businessName}</span>
              </p>
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {result && !analyzing && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 text-sm space-y-1">
              <p className="font-medium text-gray-900">Resultado</p>
              <p>Negocios analizados: <strong>{result.totalBusinesses}</strong></p>
              <p>Negocios con imágenes en Cloudinary: <strong>{result.businessesWithCloudinary}</strong></p>
              <p>Imágenes en Cloudinary (total): <strong>{result.totalCloudinaryImages}</strong></p>
              <p className="text-gray-600">
                (productos: {result.totalProductImages} · logos/portadas: {result.totalBusinessImages})
              </p>

              {candidates.length > 0 ? (
                <div className="mt-2">
                  <p className="font-medium text-gray-900">Candidatos a piloto (de menor a mayor):</p>
                  <div className="mt-1 max-h-72 overflow-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 font-medium text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="text-left px-2 py-1">Negocio</th>
                          <th className="text-right px-2 py-1">Cloudinary</th>
                          <th className="text-right px-2 py-1">Productos</th>
                          <th className="text-right px-2 py-1">Logos/portadas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {candidates.map((b) => (
                          <tr key={b.businessId} className="hover:bg-gray-50">
                            <td className="px-2 py-1">
                              <span className="text-gray-900">{b.businessName}</span>
                              {b.failed && <span className="text-red-600"> (error)</span>}
                              <div className="text-gray-400">{b.businessId}</div>
                            </td>
                            <td className="text-right px-2 py-1 font-medium">{b.cloudinaryImages}</td>
                            <td className="text-right px-2 py-1">{b.productImages}</td>
                            <td className="text-right px-2 py-1">{b.businessImages}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-gray-700 mt-1">✓ Ningún negocio tiene imágenes en Cloudinary.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function R2MigrationCard() {
  const CACHE_KEY = 'cobrify_r2_migration_status_v1'
  const [loadingList, setLoadingList] = useState(false)
  // items: [{ businessId, businessName, status, candidates, migrated, bytes, error }]
  //   status: 'idle' (sin escanear) | 'scanning' | 'pending' (faltan) | 'done' (migrada) | 'migrating' | 'error'
  const [items, setItems] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [scanningAll, setScanningAll] = useState(false)
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 })
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, name: '' })
  const [filter, setFilter] = useState('')
  const [globalError, setGlobalError] = useState(null)

  // --- Memoria liviana en el navegador (localStorage). Guardamos solo el
  // estado 'pending'/'done' para que al recargar la página el tablero recuerde
  // qué ya migraste, sin re-escanear todo. La VERDAD real siempre la da el
  // "escaneo" (dry run), que lee Firestore en vivo.
  function persist(list) {
    try {
      const map = {}
      for (const it of list || []) {
        if (it.status === 'done' || it.status === 'pending') {
          map[it.businessId] = {
            status: it.status,
            candidates: it.candidates ?? 0,
            migrated: it.migrated ?? 0,
            bytes: it.bytes ?? 0,
          }
        }
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(map))
    } catch { /* localStorage lleno o bloqueado: lo ignoramos */ }
  }

  function patchItem(businessId, patch) {
    setItems((prev) => {
      if (!prev) return prev
      const next = prev.map((it) => (it.businessId === businessId ? { ...it, ...patch } : it))
      persist(next)
      return next
    })
  }

  async function loadBusinesses() {
    setLoadingList(true)
    setGlobalError(null)
    try {
      const { collection, getDocs } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const snap = await getDocs(collection(db, 'users'))
      let cache = {}
      try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { cache = {} }
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => !u.ownerId) // solo dueños, no sub-usuarios
        .map((u) => {
          const c = cache[u.id] || {}
          return {
            businessId: u.id,
            businessName: u.businessName || u.razonSocial || u.email || u.id,
            status: c.status === 'done' || c.status === 'pending' ? c.status : 'idle',
            candidates: c.candidates ?? null,
            migrated: c.migrated ?? 0,
            bytes: c.bytes ?? 0,
            error: null,
          }
        })
        .sort((a, b) => a.businessName.localeCompare(b.businessName))
      setItems(list)
      setSelectedIds(new Set())
    } catch (e) {
      console.error(e)
      setGlobalError(e.message || String(e))
    } finally {
      setLoadingList(false)
    }
  }

  // Escanea UN negocio (dry run, solo lectura). Marca 'done' si no le falta
  // ninguna imagen, o 'pending' con cuántas faltan.
  async function scanOne(businessId) {
    patchItem(businessId, { status: 'scanning', error: null })
    try {
      const fn = httpsCallable(functions, 'migrateBusinessImagesToR2', { timeout: 540000 })
      const r = await fn({ businessId, dryRun: true })
      const candidates = r.data?.candidates ?? 0
      patchItem(businessId, { status: candidates > 0 ? 'pending' : 'done', candidates, error: null })
      return candidates
    } catch (e) {
      console.error(e)
      patchItem(businessId, { status: 'error', error: e.message || String(e) })
      return null
    }
  }

  // Escanea TODOS los que no estén ya migrados, de a 4 en paralelo.
  async function scanAll() {
    if (!items) return
    const targets = items
      .filter((it) => it.status !== 'done' && it.status !== 'migrating')
      .map((it) => it.businessId)
    if (targets.length === 0) return
    setScanningAll(true)
    setGlobalError(null)
    setScanProgress({ done: 0, total: targets.length })
    let done = 0
    let idx = 0
    const CONCURRENCY = 4
    const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
      while (idx < targets.length) {
        const my = idx++
        await scanOne(targets[my])
        done++
        setScanProgress({ done, total: targets.length })
      }
    })
    try {
      await Promise.all(workers)
    } finally {
      setScanningAll(false)
    }
  }

  // Migra UN negocio (copia real a R2 + reescribe URLs). Reutiliza el bucle
  // resumeFrom por si tiene muchas imágenes y no entran en una sola corrida.
  async function migrateOne(businessId) {
    patchItem(businessId, { status: 'migrating', error: null, migrated: 0, bytes: 0 })
    let cumulative = { migrated: 0, errors: 0, bytes: 0 }
    let resumeFrom = null
    let calls = 0
    const MAX_CALLS = 50
    try {
      const fn = httpsCallable(functions, 'migrateBusinessImagesToR2', { timeout: 540000 })
      do {
        calls++
        const r = await fn({ businessId, dryRun: false, resumeFrom })
        const d = r.data || {}
        cumulative.migrated += d.migrated || 0
        cumulative.errors += d.errors || 0
        cumulative.bytes += d.bytes || 0
        patchItem(businessId, { migrated: cumulative.migrated, bytes: cumulative.bytes })
        resumeFrom = d.resumeFrom
      } while (resumeFrom && calls < MAX_CALLS)

      if (cumulative.errors > 0) {
        patchItem(businessId, {
          status: 'error',
          error: `Migrado con ${cumulative.errors} error(es) — revisá los logs y volvé a escanear.`,
        })
        return false
      }
      patchItem(businessId, { status: 'done', candidates: 0, error: null })
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(businessId); return n })
      return true
    } catch (e) {
      console.error(e)
      patchItem(businessId, { status: 'error', error: e.message || String(e) })
      return false
    }
  }

  // Migra en tanda las seleccionadas (una tras otra, lo más seguro).
  async function migrateSelected() {
    if (!items) return
    const targets = items.filter(
      (it) => selectedIds.has(it.businessId) && it.status !== 'done' && it.status !== 'migrating'
    )
    if (targets.length === 0) return
    if (!confirm(
      `Vas a COPIAR a Cloudflare R2 las imágenes de ${targets.length} negocio(s) seleccionado(s) ` +
      `(las que hoy están en Cloudinary o Firebase Storage) y reescribir sus URLs en Firestore.\n\n` +
      `NO borra nada del origen (queda como respaldo) y guarda las URLs viejas por si hay que revertir.\n\n` +
      `¿Continuar?`
    )) return

    setBatchRunning(true)
    setGlobalError(null)
    setBatchProgress({ done: 0, total: targets.length, name: '' })
    try {
      for (let i = 0; i < targets.length; i++) {
        setBatchProgress({ done: i, total: targets.length, name: targets[i].businessName })
        await migrateOne(targets[i].businessId)
      }
      setBatchProgress({ done: targets.length, total: targets.length, name: '' })
    } finally {
      setBatchRunning(false)
    }
  }

  function toggleSelect(businessId) {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(businessId)) n.delete(businessId)
      else n.add(businessId)
      return n
    })
  }

  // Selecciona las primeras N pendientes (para migrar "de a 2" o "de a 3").
  function selectFirst(n) {
    const ids = pendingItems
      .filter((it) => it.status !== 'migrating')
      .slice(0, n)
      .map((it) => it.businessId)
    setSelectedIds(new Set(ids))
  }

  function clearSelection() { setSelectedIds(new Set()) }

  // --- Derivados para pintar las dos columnas ---
  const q = filter.trim().toLowerCase()
  const filtered = (items || []).filter(
    (it) => !q || it.businessName.toLowerCase().includes(q) || it.businessId.toLowerCase().includes(q)
  )
  const pendingItems = filtered.filter((it) => it.status !== 'done')
  const doneItems = filtered.filter((it) => it.status === 'done')
  const selectedCount = pendingItems.filter((it) => selectedIds.has(it.businessId)).length
  const totalPending = (items || []).filter((it) => it.status !== 'done').length
  const totalDone = (items || []).filter((it) => it.status === 'done').length
  const anyBusy = (items || []).some((it) => it.status === 'migrating' || it.status === 'scanning')
  const busy = scanningAll || batchRunning || anyBusy

  return (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
      <div className="flex items-start gap-3">
        <ImageIcon className="w-6 h-6 text-gray-700 flex-shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900">Migrar imágenes a Cloudflare R2 (tablero por negocio)</h4>
          <p className="text-sm text-gray-600 mt-1">
            Copia las imágenes de cada negocio desde Cloudinary o Firebase Storage a R2 y reescribe
            las URLs en Firestore para servirlas sin costo de tráfico. <strong>No borra nada del
            origen</strong> y guarda un respaldo de las URLs viejas para poder revertir. Escaneá
            todos, migrá de a poco (uno, o varios seleccionados) y verificá que se vean bien.
          </p>

          {/* Paso 1: cargar negocios */}
          {!items && (
            <div className="mt-3">
              <button
                onClick={loadBusinesses}
                disabled={loadingList}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingList ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Cargando negocios...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Cargar lista de negocios</>
                )}
              </button>
            </div>
          )}

          {items && items.length === 0 && (
            <p className="mt-3 text-gray-600 text-sm">No se encontraron negocios.</p>
          )}

          {items && items.length > 0 && (
            <div className="mt-4 space-y-3">
              {/* Barra de herramientas */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={scanAll}
                  disabled={busy}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                  {scanningAll ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Escaneando {scanProgress.done}/{scanProgress.total}...</>
                  ) : (
                    <><Info className="w-4 h-4" /> Escanear pendientes</>
                  )}
                </button>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Buscar negocio..."
                  className="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={loadBusinesses}
                  disabled={busy || loadingList}
                  title="Recargar la lista de negocios"
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Selección rápida + migrar seleccionadas */}
              <div className="flex flex-wrap items-center gap-2 p-2 bg-white rounded-lg border border-gray-200">
                <span className="text-sm text-gray-600">Seleccionar:</span>
                <button onClick={() => selectFirst(2)} disabled={busy} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">primeras 2</button>
                <button onClick={() => selectFirst(3)} disabled={busy} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">primeras 3</button>
                <button onClick={clearSelection} disabled={busy || selectedCount === 0} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">limpiar</button>
                <div className="flex-1" />
                <button
                  onClick={migrateSelected}
                  disabled={busy || selectedCount === 0}
                  className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm"
                >
                  {batchRunning ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Migrando {batchProgress.done}/{batchProgress.total}...</>
                  ) : (
                    <><ImageIcon className="w-4 h-4" /> Migrar seleccionadas ({selectedCount})</>
                  )}
                </button>
              </div>

              {batchRunning && batchProgress.name && (
                <p className="text-xs text-gray-600">Copiando <strong>{batchProgress.name}</strong>...</p>
              )}

              {/* Dos columnas */}
              <div className="grid md:grid-cols-2 gap-3">
                {/* Pendientes */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-100 text-gray-900 text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Pendientes</span>
                    <span className="text-gray-700">{totalPending}</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {pendingItems.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-gray-500 text-center">Nada pendiente {q ? 'con ese filtro' : '🎉'}</p>
                    ) : pendingItems.map((it) => (
                      <div key={it.businessId} className="px-3 py-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(it.businessId)}
                          onChange={() => toggleSelect(it.businessId)}
                          disabled={busy || it.status === 'migrating'}
                          className="flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-gray-900" title={it.businessName}>{it.businessName}</p>
                          <p className="text-xs">
                            {it.status === 'idle' && <span className="text-gray-400">sin escanear</span>}
                            {it.status === 'scanning' && <span className="text-gray-700">escaneando...</span>}
                            {it.status === 'pending' && <span className="text-gray-700">{it.candidates} imagen(es) a copiar</span>}
                            {it.status === 'migrating' && <span className="text-gray-700">copiando... ({it.migrated})</span>}
                            {it.status === 'error' && <span className="text-red-600" title={it.error}>error: {it.error}</span>}
                          </p>
                        </div>
                        <button
                          onClick={() => scanOne(it.businessId)}
                          disabled={busy || it.status === 'scanning' || it.status === 'migrating'}
                          title="Escanear (ver cuántas faltan)"
                          className="flex-shrink-0 px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => migrateOne(it.businessId)}
                          disabled={busy || it.status === 'migrating'}
                          title="Migrar este negocio a R2"
                          className="flex-shrink-0 px-2 py-1 text-xs rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40"
                        >
                          {it.status === 'migrating' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Migrar'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Migradas */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-100 text-gray-900 text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Migradas</span>
                    <span className="text-gray-700">{totalDone}</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                    {doneItems.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-gray-500 text-center">Todavía ninguna</p>
                    ) : doneItems.map((it) => (
                      <div key={it.businessId} className="px-3 py-2 flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-gray-900" title={it.businessName}>{it.businessName}</p>
                          <p className="text-xs text-gray-500">
                            {it.migrated > 0 ? `${it.migrated} copiada(s) · ${formatBytes(it.bytes)}` : 'sin imágenes pendientes'}
                          </p>
                        </div>
                        <button
                          onClick={() => scanOne(it.businessId)}
                          disabled={busy}
                          title="Volver a revisar (por si subieron imágenes nuevas)"
                          className="flex-shrink-0 px-2 py-1 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Después de migrar un negocio, abrí su catálogo y verificá que las imágenes se vean
                igual (ya servidas desde R2). El original sigue en Cloudinary/Storage como respaldo
                hasta el cleanup. El tablero recuerda lo migrado aunque cierres la página.
              </p>
            </div>
          )}

          {globalError && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-800">
              {globalError}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
