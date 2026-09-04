import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PLANS, SELLABLE_PLAN_IDS } from '@/services/subscriptionService'
import { getCustomPlans } from '@/services/customPlanService'
import { getVendedores } from '@/services/vendedorService'
import { cargarCuentas, diasParaVencer } from '@/services/adminCuentasService'
import { RUBROS_ALFABETICOS, nombreRubro } from '@/data/rubros'
import { MODOS_NEGOCIO } from '@/utils/businessModes'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import { matchesPrebuilt } from '@/lib/utils'
import { origenDeCuenta, ORIGEN_DIRECTO, ORIGEN_RESELLER, ORIGEN_VENDEDOR } from '@/utils/subscriptionOwnership'
import { buildAccountHaystack } from '@/utils/adminSearch'
import VendedoresModal from '@/components/admin/cuenta/VendedoresModal'
import {
  Pagina, Seccion, Tabla, Th, Td, Fila, FilaVacia, Filtros, FiltroSelect, Buscador, Estado, Pastilla, Boton,
  useMenuDeFila, BotonDeFila, CajaMenu, ItemMenu,
} from '@/components/admin/ui'

// Lista de cuentas: buscador, filtros y tabla. Clic en una fila abre la ficha
// (/app/admin/users/:id); el menu de la derecha tiene los atajos.

const STATUS_LABELS = { active: 'Activo', suspended: 'Suspendido', expired: 'Vencido' }
const PAGE_SIZE = 10

// Nombre del plan con su precio
const getPlanDisplay = user => {
  const plan = PLANS[user.plan]
  const name = user.planName || plan?.name || user.plan
  const price = plan?.totalPrice
  return price && price > 0 ? `${name} · S/ ${price.toFixed(2)}` : name
}

/**
 * El plan partido en tres lineas cortas: "Basico" / "1 mes" / "S/ 19.90".
 *
 * En una sola linea ("Plan Basico - 1 Mes · S/ 19.90") la columna se comia el
 * ancho de dos y obligaba a desplazar la tabla de lado. El nombre pierde el
 * "Plan " de adelante y el " - 1 Mes" de atras, que se repiten en cada fila y
 * no distinguen nada; el periodo sale de `months`, que es el dato de verdad.
 */
const planEnLineas = (user, customPlans) => {
  const plan = PLANS[user.plan] || customPlans?.[user.plan]
  const bruto = String(user.planName || plan?.name || user.plan || '—')
  const nombre = bruto.split(' - ')[0].replace(/^Plan\s+/i, '') || bruto
  const meses = plan?.months
  return {
    nombre,
    periodo: meses ? (meses === 1 ? '1 mes' : `${meses} meses`) : null,
    precio: plan?.totalPrice > 0 ? `S/ ${plan.totalPrice.toFixed(2)}` : null,
  }
}

const formatDate = date => (date ? date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export default function AdminUsers() {
  const toast = useToast()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const [searchParams] = useSearchParams()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [resellers, setResellers] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [customPlans, setCustomPlans] = useState({})

  // El buscador de la cabecera del admin manda aqui con ?q=; si cambia estando
  // ya en la pagina (otra busqueda), tambien se aplica.
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') || '')
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setSearchTerm(q)
  }, [searchParams])

  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  // POR DONDE LLEGO la cuenta. Un solo filtro con tres origenes y su desglose:
  // 'all' | 'directo' | 'vendedor' | 'vendedor:<id>' | 'reseller' | 'reseller:<id>'
  //
  // Usa `origenDeCuenta`, el mismo criterio que "Mi Suscripcion" y el Resumen.
  // Antes preguntaba solo por `createdByReseller`, asi que las cuentas vendidas
  // por un vendedor caian dentro de "Cobrify" y no habia forma de separarlas.
  const [sourceFilter, setSourceFilter] = useState('all')
  const [modeFilter, setModeFilter] = useState('all')
  const [rubroFilter, setRubroFilter] = useState('all')
  // Filtra el REGIMEN del negocio, no la tasa suelta: el regimen manda sobre la
  // afectacion de cada producto (un RUS no cobra IGV aunque el producto diga
  // gravado). Se llamaba "IGV" y eso hacia pensar en un dato por producto.
  const [igvFilter, setIgvFilter] = useState('all') // 'all' | 'reduced' | 'exempt' | 'nrus' | 'standard'
  // Vencimientos: antes era una pagina aparte; ahora es este filtro
  // (la ruta vieja /expirations llega con ?vence=week).
  const [venceFilter, setVenceFilter] = useState(() => searchParams.get('vence') || 'all')
  const [editandoRubro, setEditandoRubro] = useState(null)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDirection, setSortDirection] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)
  // En el celular los nueve filtros van plegados detras de un boton
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Un solo modal abierto a la vez: { tipo, cuenta }
  const [modal, setModal] = useState(null)

  // Menu de acciones de una fila. Es `position: fixed` (para salir del
  // overflow de la tabla), asi que al hacer scroll se recalcula contra su boton.
  // El menu de fila (posicion, medicion y cierre) vive en el kit: lo comparten
  // esta pantalla y Resellers.
  const menu = useMenuDeFila()

  // ── Carga ──────────────────────────────────────────────────────────────────

  async function loadUsers(planes = customPlans) {
    setLoading(true)
    try {
      const { cuentas, resellers: lista } = await cargarCuentas({ customPlans: planes })
      setUsers(cuentas)
      setResellers(lista)
    } catch (error) {
      console.error('Error cargando cuentas:', error)
      toast.error('No se pudieron cargar las cuentas')
    } finally {
      setLoading(false)
    }
  }

  async function loadVendedores() {
    try {
      const result = await getVendedores()
      if (result.success) setVendedores(result.data)
    } catch (e) {
      console.error('Error cargando vendedores:', e)
    }
  }

  useEffect(() => {
    // Los planes personalizados van primero: la fila los necesita para
    // calcular limites y precios.
    ;(async () => {
      let planes = {}
      try {
        planes = await getCustomPlans()
        setCustomPlans(planes)
      } catch (e) {
        console.error('Error cargando planes personalizados:', e)
      }
      await loadUsers(planes)
    })()
    loadVendedores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Busqueda, filtros, orden y paginacion ───────────────────────────────────

  // Un texto normalizado por cuenta, armado una sola vez por lista (son miles).
  // matchesPrebuilt exige todas las palabras, en cualquier orden y sin tildes.
  const indiceDeBusqueda = useMemo(() => {
    const map = new Map()
    for (const u of users) map.set(u.id, buildAccountHaystack(u))
    return map
  }, [users])

  const filteredUsers = useMemo(() => {
    let result = [...users]

    if (searchTerm) result = result.filter(u => matchesPrebuilt(searchTerm, indiceDeBusqueda.get(u.id) || ''))
    if (statusFilter !== 'all') result = result.filter(u => u.status === statusFilter)
    if (planFilter !== 'all') result = result.filter(u => u.plan === planFilter)
    if (modeFilter !== 'all') {
      result = modeFilter === 'retail'
        ? result.filter(u => u.businessMode === 'retail' || !u.businessMode)
        : result.filter(u => u.businessMode === modeFilter)
    }
    // Rubro: vale el confirmado y, si no hay, el sugerido.
    if (rubroFilter !== 'all') {
      result = rubroFilter === 'none' ? result.filter(u => !u.rubroEfectivo) : result.filter(u => u.rubroEfectivo === rubroFilter)
    }
    if (igvFilter === 'reduced') result = result.filter(u => u.taxType === 'reduced' || u.igvRate === 10.5)
    else if (igvFilter === 'exempt') result = result.filter(u => u.taxType === 'exempt' || (u.igvRate === 0 && u.taxType !== 'nrus'))
    else if (igvFilter === 'nrus') result = result.filter(u => u.taxType === 'nrus')
    else if (igvFilter === 'standard') result = result.filter(u => u.taxType === 'standard' && u.igvRate === 18)



    if (sourceFilter === 'directo') result = result.filter(u => origenDeCuenta(u) === ORIGEN_DIRECTO)
    else if (sourceFilter === 'vendedor') result = result.filter(u => origenDeCuenta(u) === ORIGEN_VENDEDOR)
    else if (sourceFilter.startsWith('vendedor:')) {
      const vendedorId = sourceFilter.replace('vendedor:', '')
      result = result.filter(u => u.vendedorId === vendedorId)
    }
    else if (sourceFilter === 'reseller') result = result.filter(u => origenDeCuenta(u) === ORIGEN_RESELLER)
    else if (sourceFilter.startsWith('reseller:')) {
      const resellerId = sourceFilter.replace('reseller:', '')
      result = result.filter(u => u.resellerId === resellerId)
    }

    // Vencimiento (lo que era la pagina Vencimientos). Los archivados solo
    // salen en su propia opcion.
    if (venceFilter !== 'all') {
      result = result.filter(u => {
        if (venceFilter === 'archived') return u.archived
        if (u.archived) return false
        const d = diasParaVencer(u)
        const suspendida = u.status === 'suspended'
        if (venceFilter === 'overdue') return suspendida || (d !== null && d < 0)
        if (d === null || suspendida || d < 0) return false
        if (venceFilter === 'today') return d === 0
        if (venceFilter === 'week') return d <= 7
        if (venceFilter === 'month') return d <= 30
        return true
      })
    }

    // "Uso" ordena por que tan LLENO esta el cupo (usados / limite), no por la
    // cantidad bruta: asi salen primero a quienes se les acaban los
    // comprobantes. Los ilimitados van al final.
    const getSortValue = u => {
      if (sortField === 'usage') {
        if (u.limit === -1 || u.limit === 0) return -1
        return (u.usage?.invoicesThisMonth || 0) / u.limit
      }
      let val = u[sortField]
      if (val instanceof Date) val = val.getTime()
      return val
    }
    result.sort((a, b) => {
      const aVal = getSortValue(a)
      const bVal = getSortValue(b)
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return result
  }, [users, indiceDeBusqueda, searchTerm, statusFilter, planFilter, sourceFilter, modeFilter, rubroFilter, igvFilter, venceFilter, sortField, sortDirection])

  // Solo se pinta la pagina actual: cientos de filas lagueaban la pantalla.
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const displayedUsers = useMemo(
    () => filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredUsers, currentPage]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, planFilter, sourceFilter, modeFilter, rubroFilter, igvFilter, venceFilter, sortField, sortDirection])

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(1)
  }, [pageCount, currentPage])

  // Cifras del resumen. Los archivados quedan fuera de todos los grupos.
  const stats = useMemo(() => {
    const now = new Date()
    const vigente = u => {
      const pEnd = u.currentPeriodEnd?.toDate?.() ? u.currentPeriodEnd.toDate() : u.currentPeriodEnd instanceof Date ? u.currentPeriodEnd : null
      return pEnd && pEnd > now && u.status !== 'suspended'
    }
    const activos = users.filter(u => !u.archived)
    return {
      total: activos.length,
      active: activos.filter(vigente).length,
      suspended: activos.filter(u => u.status === 'suspended').length,
      expired: activos.filter(u => !vigente(u) && u.status !== 'suspended').length,
      directo: activos.filter(u => origenDeCuenta(u) === ORIGEN_DIRECTO).length,
      vendedor: activos.filter(u => origenDeCuenta(u) === ORIGEN_VENDEDOR).length,
      reseller: activos.filter(u => origenDeCuenta(u) === ORIGEN_RESELLER).length,
      archived: users.filter(u => u.archived).length,
    }
  }, [users])

  // ── Acciones ────────────────────────────────────────────────────────────────

  const actualizarCuenta = (id, cambios) => setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...cambios } : u)))
  const abrirModal = (tipo, cuenta) => {
    menu.cerrar()
    setModal({ tipo, cuenta })
  }
  const cerrarModal = () => setModal(null)
  const irAFicha = cuenta => navigate(`/app/admin/users/${cuenta.id}`)

  // El rubro confirmado se pone a mano desde la tabla. La sugerencia queda
  // intacta: sirve para saber de donde salio la propuesta.
  async function guardarRubro(user, rubroId) {
    setEditandoRubro(null)
    const valor = rubroId || null
    if (valor === (user.rubro || null)) return
    try {
      await updateDoc(doc(db, 'businesses', user.id), { rubro: valor, rubroConfirmadoEn: valor ? new Date() : null })
      const efectivo = valor || user.rubroSugerido || null
      actualizarCuenta(user.id, { rubro: valor, rubroEfectivo: efectivo, rubroNombre: efectivo ? nombreRubro(efectivo) : '' })
      toast.success(valor ? `Rubro: ${nombreRubro(valor)}` : 'Rubro quitado')
    } catch (e) {
      toast.error('No se pudo guardar el rubro')
    }
  }

  function handleSort(field) {
    if (sortField === field) setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  async function toggleUserAccess(userId, block) {
    menu.cerrar()
    try {
      await updateDoc(doc(db, 'subscriptions', userId), { accessBlocked: block, status: block ? 'suspended' : 'active' })
      toast.success(block ? 'Cuenta suspendida' : 'Cuenta reactivada')
      loadUsers()
    } catch (error) {
      console.error('Error cambiando el acceso:', error)
      toast.error('No se pudo cambiar el acceso')
    }
  }

  // Cobra el precio PACTADO del cliente (congelado en su suscripcion); el del


  // Archivar = dejar de contar la cuenta en vencimientos y tasas de renovacion.
  async function archivar(user, valor) {
    menu.cerrar()
    if (valor && !window.confirm(`¿Archivar a ${user.businessName}? Queda fuera de los vencimientos y de las tasas de renovación.`)) return
    try {
      await updateDoc(doc(db, 'subscriptions', user.id), valor
        ? { archived: true, archivedAt: serverTimestamp(), archivedBy: currentUser?.uid || null }
        : { archived: false, archivedAt: null, archivedBy: null })
      actualizarCuenta(user.id, { archived: valor })
      toast.success(valor ? 'Cuenta archivada' : 'Cuenta desarchivada')
    } catch (error) {
      console.error('Error al archivar:', error)
      toast.error('No se pudo cambiar el archivado')
    }
  }


  function exportToCSV() {
    const headers = ['Código', 'Email', 'Negocio', 'Rubro', 'RUC', 'Plan', 'Estado', 'Creado', 'Uso', 'Límite']
    const rows = filteredUsers.map(u => [
      u.codigoCliente || '',
      u.email,
      u.businessName,
      u.rubro ? nombreRubro(u.rubro) : u.rubroSugerido ? `${nombreRubro(u.rubroSugerido)} (sugerido)` : '',
      u.ruc,
      getPlanDisplay(u),
      STATUS_LABELS[u.status],
      u.createdAt?.toLocaleDateString() || 'N/A',
      u.usage?.invoicesThisMonth || 0,
      u.limit === -1 || u.limit === 0 ? 'Ilimitado' : u.limit,
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `usuarios_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  // Un solo valor para el select de Situacion, que por dentro sigue moviendo dos
  // filtros distintos (el estado de la cuenta y el horizonte de vencimiento).
  const situacion = statusFilter !== 'all' ? `estado:${statusFilter}` : venceFilter !== 'all' ? `vence:${venceFilter}` : 'all'

  const cambiarSituacion = valor => {
    if (valor === 'all') { setStatusFilter('all'); cambiarVence('all'); return }
    const [tipo, v] = valor.split(':')
    if (tipo === 'estado') { cambiarVence('all'); setStatusFilter(v) }
    else { setStatusFilter('all'); cambiarVence(v) }
  }

  function limpiarFiltros() {
    setSearchTerm('')
    setStatusFilter('all')
    setPlanFilter('all')
    setSourceFilter('all')
    setModeFilter('all')
    setRubroFilter('all')
    setIgvFilter('all')
    setVenceFilter('all')
  }

  // Al filtrar por vencimiento conviene ver primero lo mas urgente.
  function cambiarVence(valor) {
    setVenceFilter(valor)
    if (valor !== 'all' && valor !== 'archived') {
      setSortField('periodEnd')
      setSortDirection('asc')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const orden = { campo: sortField, direccion: sortDirection }
  const cuantosFiltros = [statusFilter, planFilter, sourceFilter, modeFilter, rubroFilter, igvFilter, venceFilter].filter(f => f !== 'all').length
  const hayFiltros = Boolean(searchTerm) || cuantosFiltros > 0
  const resumen = loading
    ? 'Cargando cuentas…'
    : `${filteredUsers.length} de ${users.length} cuentas · ${stats.active} activas · ${stats.expired} vencidas · ${stats.suspended} suspendidas${stats.archived ? ` · ${stats.archived} archivadas` : ''}`

  // Menu ⋯ de una cuenta. Es `position: fixed` (se ancla al boton que lo
  // abrio), asi que sirve igual desde la tabla y desde las tarjetas del celular.
  // Es una funcion y no un componente para que no se remonte en cada render.
  const menuAcciones = (user, vencida) => (
            <CajaMenu posicion={menu.posicion} refMenu={menu.refMenu}>
              {user.status !== 'suspended' ? (
                <ItemMenu onClick={() => toggleUserAccess(user.id, true)}>Suspender</ItemMenu>
              ) : (
                <ItemMenu onClick={() => toggleUserAccess(user.id, false)}>Reactivar</ItemMenu>
              )}
              {(user.status === 'suspended' || vencida || user.archived) && (
                <ItemMenu onClick={() => archivar(user, !user.archived)}>{user.archived ? 'Desarchivar' : 'Archivar'}</ItemMenu>
              )}
            </CajaMenu>
  )

  return (
    <Pagina
      resumen={resumen}
      acciones={
        <>
          <Boton tamano="sm" onClick={() => loadUsers()} disabled={loading}>{loading ? 'Cargando…' : 'Recargar'}</Boton>
          <Boton tamano="sm" onClick={() => abrirModal('vendedores')}>Vendedores</Boton>
          <Boton tamano="sm" onClick={exportToCSV}>Exportar CSV</Boton>
        </>
      }
    >
      {/* El buscador va en su propia fila: es lo que mas se usa y competia por
          el ancho con seis selects. Debajo, los filtros. */}
      <Filtros>
        <Buscador ancho="flex-1 min-w-[220px]" placeholder="Nombre, correo, RUC, teléfono, dirección" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <button
          type="button"
          onClick={() => setMostrarFiltros(v => !v)}
          className="sm:hidden h-8 px-2.5 rounded-md border border-gray-300 bg-white text-[12.5px] text-gray-700 shrink-0"
        >
          {mostrarFiltros ? 'Ocultar filtros' : `Filtros${cuantosFiltros ? ` (${cuantosFiltros})` : ''}`}
        </button>
      </Filtros>

      <Filtros>
        <div className={`${mostrarFiltros ? 'flex' : 'hidden'} sm:contents w-full flex-wrap items-center gap-2`}>
        {/* Estado y Vence eran dos preguntas sobre lo mismo, y ademas se
            repetian: "Vencidas o suspendidas" y "Archivadas" son estados, no
            fechas. Van juntos, con el estado arriba y el horizonte abajo. */}
        <FiltroSelect
          value={situacion}
          onChange={e => cambiarSituacion(e.target.value)}
          activo={statusFilter !== 'all' || venceFilter !== 'all'}
        >
          <option value="all">Situación</option>
          <optgroup label="Estado">
            <option value="estado:active">Activas ({stats.active})</option>
            <option value="estado:expired">Vencidas ({stats.expired})</option>
            <option value="estado:suspended">Suspendidas ({stats.suspended})</option>
            <option value="vence:archived">Archivadas{stats.archived ? ` (${stats.archived})` : ''}</option>
          </optgroup>
          <optgroup label="Por vencer">
            <option value="vence:today">Vence hoy</option>
            <option value="vence:week">Vence en 7 días</option>
            <option value="vence:month">Vence en 30 días</option>
          </optgroup>
        </FiltroSelect>
        <FiltroSelect value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
          <option value="all">Plan</option>
          {/* Solo el catalogo vigente: tras la migracion (15-jul-2026) no quedan cuentas en planes legacy */}
          {Object.entries(PLANS)
            .filter(([key]) => SELLABLE_PLAN_IDS.includes(key) || key === 'enterprise')
            .map(([key, plan]) => <option key={key} value={key}>{plan.name}</option>)}
        </FiltroSelect>
        <FiltroSelect value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="all">Origen</option>
          <option value="directo">Directo de Cobrify ({stats.directo})</option>
          <option value="vendedor">Por vendedor ({stats.vendedor})</option>
          <option value="reseller">Por reseller ({stats.reseller})</option>
          {vendedores.length > 0 && (
            <optgroup label="Vendedor">
              {vendedores.map(v => (
                <option key={v.id} value={`vendedor:${v.id}`}>{v.name} ({users.filter(u => u.vendedorId === v.id).length})</option>
              ))}
            </optgroup>
          )}
          {resellers.length > 0 && (
            <optgroup label="Por reseller">
              {resellers.map(r => (
                <option key={r.id} value={`reseller:${r.id}`}>{r.name} ({users.filter(u => u.resellerId === r.id).length})</option>
              ))}
            </optgroup>
          )}
        </FiltroSelect>
        <FiltroSelect value={modeFilter} onChange={e => setModeFilter(e.target.value)}>
          <option value="all">Modo</option>
          {/* Generado del catalogo: escrita a mano, la lista se quedo en cinco
              de los nueve modos y las cuentas de hotel, veterinaria, logistica
              y prestamos no se podian filtrar. */}
          {MODOS_NEGOCIO.map(m => {
            // Una cuenta sin modo guardado es General, como en el resto del panel.
            const cuantos = users.filter(u => (u.businessMode || 'retail') === m.id).length
            return <option key={m.id} value={m.id}>{m.nombre} ({cuantos})</option>
          })}
        </FiltroSelect>
        <FiltroSelect value={rubroFilter} onChange={e => setRubroFilter(e.target.value)}>
          <option value="all">Rubro</option>
          <option value="none">Sin rubro ({users.filter(u => !u.rubroEfectivo).length})</option>
          {RUBROS_ALFABETICOS.map(r => {
            const cuantos = users.filter(u => u.rubroEfectivo === r.id).length
            return cuantos > 0 ? <option key={r.id} value={r.id}>{r.nombre} ({cuantos})</option> : null
          })}
        </FiltroSelect>
        <FiltroSelect value={igvFilter} onChange={e => setIgvFilter(e.target.value)}>
          <option value="all">Régimen</option>
          <option value="standard">General · 18% ({users.filter(u => u.taxType === 'standard' && u.igvRate === 18).length})</option>
          <option value="reduced">Restaurantes · 10.5% ({users.filter(u => u.taxType === 'reduced' || u.igvRate === 10.5).length})</option>
          <option value="exempt">Amazonía · exonerado ({users.filter(u => u.taxType === 'exempt' || (u.igvRate === 0 && u.taxType !== 'nrus')).length})</option>
          <option value="nrus">NRUS ({users.filter(u => u.taxType === 'nrus').length})</option>
        </FiltroSelect>
        </div>
        {hayFiltros && (
          <button type="button" onClick={limpiarFiltros} className="h-8 px-2 text-[12.5px] text-gray-500 hover:text-gray-900">Limpiar</button>
        )}
      </Filtros>

      <Seccion sinRelleno className="overflow-hidden">
        {/* Celular: una tarjeta por cuenta (la tabla no cabe) */}
        <div className="sm:hidden divide-y divide-gray-100">
          {loading ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-gray-500">Cargando cuentas…</p>
          ) : filteredUsers.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-gray-500">Ninguna cuenta coincide con la búsqueda y los filtros</p>
          ) : (
            displayedUsers.map(user => {
              const dias = diasParaVencer(user)
              const vencida = dias !== null && dias < 0
              const usados = user.usage?.invoicesThisMonth || 0
              const ilimitado = user.limit === -1 || user.limit === 0
              return (
                <div key={user.id} className={`px-3 py-2.5 ${user.archived ? 'text-gray-400' : ''}`} onClick={() => irAFicha(user)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">{user.businessName}</div>
                      <div className="truncate text-[11.5px] text-gray-500">
                        {user.email}{user.ruc ? ` · ${user.ruc}` : ''}{user.codigoCliente ? ` · ${user.codigoCliente}` : ''}
                      </div>
                    </div>
                    <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                      <BotonDeFila onClick={el => menu.alternar(user.id, el)} />
                      {menu.abiertoEn === user.id && menuAcciones(user, vencida)}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-gray-500">
                    <Estado valor={user.status} etiqueta={STATUS_LABELS[user.status] || user.status} />
                    <span>{getPlanDisplay(user)}</span>
                    {user.nuncaVence
                      ? <span>Sin vencimiento</span>
                      : user.periodEnd && <span className={vencida ? 'text-red-600 font-medium' : ''}>Vence {formatDate(user.periodEnd)}</span>}
                    <span>{usados}/{ilimitado ? '∞' : user.limit}</span>
                    {user.rubroEfectivo && <span>{nombreRubro(user.rubroEfectivo)}{user.rubro ? '' : ' (sugerido)'}</span>}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="hidden sm:block">
        <Tabla>
          <thead>
            <tr>
              <Th campo="codigoCliente" orden={orden} onOrdenar={handleSort} ancho={84}>Código</Th>
              <Th campo="businessName" orden={orden} onOrdenar={handleSort}>Negocio</Th>
              <Th>Contacto</Th>
              <Th campo="plan" orden={orden} onOrdenar={handleSort}>Plan</Th>
              <Th campo="status" orden={orden} onOrdenar={handleSort}>Estado</Th>
              <Th campo="usage" orden={orden} onOrdenar={handleSort} alinear="der">Uso · emisión</Th>
              <Th campo="department" orden={orden} onOrdenar={handleSort}>Ubicación</Th>
              <Th campo="periodEnd" orden={orden} onOrdenar={handleSort} alinear="der">Vence · alta</Th>
              <Th ancho={44}><span className="sr-only">Acciones</span></Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <FilaVacia colSpan={9}>Cargando cuentas…</FilaVacia>
            ) : filteredUsers.length === 0 ? (
              <FilaVacia colSpan={9}>Ninguna cuenta coincide con la búsqueda y los filtros</FilaVacia>
            ) : (
              displayedUsers.map(user => {
                const usados = user.usage?.invoicesThisMonth || 0
                const ilimitado = user.limit === -1 || user.limit === 0
                const lleno = !ilimitado && user.limit > 0 && usados / user.limit >= 0.9
                const dias = diasParaVencer(user)
                const vencida = dias !== null && dias < 0
                const urlTienda = user.catalogEnabled && (user.customDomain || user.catalogSlug)
                  ? user.customDomain ? `https://${user.customDomain}` : `${window.location.origin}/catalogo/${user.catalogSlug}`
                  : null
                const plan3 = planEnLineas(user, customPlans)
                const nombreVendedor = user.vendedorId ? vendedores.find(v => v.id === user.vendedorId)?.name || '—' : null
                return (
                  <Fila key={user.id} onClick={() => irAFicha(user)} apagada={user.archived}>
                    <Td apagado className="font-mono text-[12px]">{user.codigoCliente || '—'}</Td>
                    <Td className="max-w-[250px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate font-medium">{user.businessName}</span>
                        {urlTienda && (
                          <a href={urlTienda} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                            className="shrink-0 text-[11px] text-primary-700 hover:underline" title={`Abrir la tienda: ${urlTienda}`}>
                            tienda ↗
                          </a>
                        )}
                      </div>
                      <div className="truncate text-[11.5px] text-gray-500">{user.email}{user.ruc ? ` · ${user.ruc}` : ''}</div>
                      {/* Rubro debajo del RUC, y en la misma linea de quien
                          vendio la cuenta: son tres datos cortos que no
                          merecian columnas propias. Un clic cambia el rubro. */}
                      <div className="flex items-center gap-1.5 min-w-0 text-[11.5px] text-gray-500" onClick={e => e.stopPropagation()}>
                        {editandoRubro === user.id ? (
                          <select
                            autoFocus
                            defaultValue={user.rubro || user.rubroSugerido || ''}
                            onBlur={() => setEditandoRubro(null)}
                            onChange={e => guardarRubro(user, e.target.value)}
                            className="h-6 w-36 rounded-md border border-gray-300 bg-white px-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                          >
                            <option value="">Sin rubro</option>
                            {RUBROS_ALFABETICOS.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditandoRubro(user.id)}
                            className="min-w-0 text-left"
                            title={user.rubro ? `${nombreRubro(user.rubro)}. Clic para cambiarlo` : user.rubroSugerido ? `Sugerido: ${nombreRubro(user.rubroSugerido)}. Clic para confirmarlo o cambiarlo` : 'Sin rubro. Clic para ponerle uno'}
                          >
                            {user.rubro ? (
                              <Pastilla tono="neutro" className="max-w-full truncate">{nombreRubro(user.rubro)}</Pastilla>
                            ) : user.rubroSugerido ? (
                              <Pastilla tono="punteado" className="max-w-full truncate">{nombreRubro(user.rubroSugerido)}</Pastilla>
                            ) : (
                              <span className="text-gray-400">sin rubro</span>
                            )}
                          </button>
                        )}
                        {(user.createdByReseller || nombreVendedor) && (
                          <span className="min-w-0 truncate">
                            {user.createdByReseller ? `· ${user.resellerName}` : ''}
                            {nombreVendedor ? ` · ${nombreVendedor}` : ''}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="max-w-[150px]">
                      <div className="truncate">{user.contactName || <span className="text-gray-400">—</span>}</div>
                      {(user.contactPhone || user.phone) && <div className="truncate text-[11.5px] text-gray-500">{user.contactPhone || user.phone}</div>}
                    </Td>
                    <Td>
                      <div className="text-gray-900">{plan3.nombre}</div>
                      {plan3.periodo && <div className="text-[11.5px] text-gray-500">{plan3.periodo}</div>}
                      {plan3.precio && <div className="text-[11.5px] text-gray-500 tabular-nums">{plan3.precio}</div>}
                    </Td>
                    <Td>
                      <Estado valor={user.status} etiqueta={STATUS_LABELS[user.status] || user.status} />
                      {user.archived && <span className="ml-1.5 text-[11.5px] text-gray-400">archivada</span>}
                    </Td>
                    <Td numero>
                      <div className={lleno ? 'text-red-600 font-medium' : ''}>{usados}/{ilimitado ? '∞' : user.limit}</div>
                      <div className="text-[11.5px] font-normal text-gray-400">
                        {user.emissionMethod && user.emissionMethod !== 'none'
                          ? user.emissionMethod === 'qpse' ? 'QPse' : user.emissionMethod === 'sunat_direct' ? 'Directo' : user.emissionMethod
                          : 'sin emisión'}
                      </div>
                    </Td>
                    <Td apagado className="max-w-[110px]">
                      <div className="truncate">{user.department || '—'}{user.province && user.province !== user.department ? ` · ${user.province}` : ''}</div>
                    </Td>
                    <Td
                      numero
                      className={vencida ? 'text-red-600 font-medium' : dias !== null && dias <= 7 ? 'text-gray-900 font-medium' : 'text-gray-500'}
                      title={dias === null ? undefined : vencida ? `Venció hace ${Math.abs(dias)} días` : dias === 0 ? 'Vence hoy' : `Vence en ${dias} días`}
                    >
                      <div>{user.nuncaVence ? 'Sin vencimiento' : formatDate(user.periodEnd)}</div>
                      <div className="text-[11.5px] font-normal text-gray-400">alta {formatDate(user.createdAt)}</div>
                    </Td>
                    <Td alinear="centro" onClick={e => e.stopPropagation()}>
                      <BotonDeFila onClick={el => menu.alternar(user.id, el)} />
                      {menu.abiertoEn === user.id && menuAcciones(user, vencida)}
                    </Td>
                  </Fila>
                )
              })
            )}
          </tbody>
        </Tabla>
        </div>

        {!loading && filteredUsers.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-gray-200 text-[12.5px] text-gray-500">
            <span>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredUsers.length)} de {filteredUsers.length}</span>
            <div className="flex items-center gap-2">
              <Boton tamano="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>Anterior</Boton>
              <span>Página {currentPage} de {pageCount}</span>
              <Boton tamano="sm" onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount}>Siguiente</Boton>
            </div>
          </div>
        )}
      </Seccion>

      {menu.abiertoEn && <div className="fixed inset-0 z-40" onClick={menu.cerrar} />}

      {modal?.tipo === 'vendedores' && <VendedoresModal vendedores={vendedores} cuentas={users} onClose={cerrarModal} onCambio={loadVendedores} />}
    </Pagina>
  )
}
