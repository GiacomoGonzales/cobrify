import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PLANS, registerPayment } from '@/services/subscriptionService'
import { getCustomPlans } from '@/services/customPlanService'
import { getVendedores } from '@/services/vendedorService'
import { getBranches } from '@/services/branchService'
import { resumenDeUso } from '@/services/adminUsoService'
import { cargarCuenta, diasParaVencer, enlaceRecordatorioWhatsapp } from '@/services/adminCuentasService'
import { RUBROS_ALFABETICOS, nombreRubro } from '@/data/rubros'
import { nombreModo } from '@/utils/businessModes'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import UserDetailsModal from '@/components/admin/UserDetailsModal'
import SunatModal from '@/components/admin/cuenta/SunatModal'
import FuncionesModal, { FUNCIONES } from '@/components/admin/cuenta/FuncionesModal'
import SucursalesModal from '@/components/admin/cuenta/SucursalesModal'
import ContactoModal from '@/components/admin/cuenta/ContactoModal'
import AsignarVendedorModal from '@/components/admin/cuenta/AsignarVendedorModal'
import EliminarCuentaModal from '@/components/admin/cuenta/EliminarCuentaModal'
import {
  Pagina, Seccion, Tabla, Th, Td, Fila, FilaVacia, Estado, Pastilla, Boton, ListaDatos, Dato, Cifras, Cifra, Aviso,
  Selector, Entrada, AreaTexto, useTituloAdmin,
} from '@/components/admin/ui'

// Ficha de una cuenta: todo lo que hay que saber de un negocio en una sola
// pagina, con las acciones a mano. Reemplaza al modal de "Detalles del
// usuario" y a los modales sueltos de la lista.

const ESTADOS = { active: 'Activa', suspended: 'Suspendida', expired: 'Vencida' }
// Se nombra el regimen y despues la tasa: lo que distingue a una cuenta es
// estar en Amazonia o ser NRUS, no el numero suelto.
const REGIMENES = {
  standard: 'General · IGV 18 %',
  reduced: 'Restaurantes · IGV 10,5 % (Ley 31556)',
  exempt: 'Amazonía · exonerado (Ley 27037)',
  nrus: 'NRUS · Nuevo RUS',
}
const METODOS = { qpse: 'QPse', sunat_direct: 'SUNAT directo', none: 'Sin configurar' }
const TIPOS_DOC = { factura: 'Facturas', boleta: 'Boletas', nota_venta: 'Notas de venta', nota_credito: 'Notas de crédito', nota_debito: 'Notas de débito' }

const moneda = v => `S/ ${(Number(v) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const entero = v => (Number(v) || 0).toLocaleString('es-PE')
const toDate = v => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)
const fecha = d => (toDate(d) ? toDate(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const fechaHora = d => (toDate(d) ? toDate(d).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const limite = v => (v === -1 || v === undefined || v === null ? '∞' : entero(v))

export default function AdminCuenta() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user: admin } = useAuth()

  const [cuenta, setCuenta] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [noExiste, setNoExiste] = useState(false)
  const [customPlans, setCustomPlans] = useState({})
  const [vendedores, setVendedores] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [uso, setUso] = useState(null)
  const [cargandoUso, setCargandoUso] = useState(false)
  const [modal, setModal] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const [editandoLimite, setEditandoLimite] = useState(false)
  const [nuevoLimite, setNuevoLimite] = useState('')
  const [notas, setNotas] = useState('')
  const [guardandoNotas, setGuardandoNotas] = useState(false)

  useTituloAdmin(cuenta ? cuenta.businessName : 'Cuenta')

  async function cargar(planes = customPlans) {
    try {
      const c = await cargarCuenta(id, { customPlans: planes })
      if (!c) {
        setNoExiste(true)
        return
      }
      setCuenta(c)
      setNotas(c.notasAdmin || '')
    } catch (error) {
      console.error('Error cargando la cuenta:', error)
      toast.error('No se pudo cargar la cuenta')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setNoExiste(false)
    setCuenta(null)
    setUso(null)
    ;(async () => {
      let planes = {}
      try {
        planes = await getCustomPlans()
        if (vivo) setCustomPlans(planes)
      } catch (e) {
        console.error('Error cargando planes personalizados:', e)
      }
      if (vivo) await cargar(planes)
    })()
    getVendedores().then(r => { if (vivo && r.success) setVendedores(r.data) }).catch(() => {})
    getBranches(id).then(r => { if (vivo && r.success) setSucursales(r.data) }).catch(() => {})
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Uso real (agregaciones en el servidor, no descarga comprobantes): despues de la cuenta.
  useEffect(() => {
    if (!cuenta || uso || cargandoUso) return
    let vivo = true
    setCargandoUso(true)
    resumenDeUso(id)
      .then(s => { if (vivo) setUso(s) })
      .catch(e => console.error('Error cargando el uso:', e))
      .finally(() => { if (vivo) setCargandoUso(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta?.id])

  const parchar = cambios => setCuenta(prev => (prev ? { ...prev, ...cambios } : prev))
  const cerrarModal = () => setModal(null)

  // ── Acciones ────────────────────────────────────────────────────────────────

  async function registrarPago(userId, amount, method, planKey, customEndDate = null, options = {}) {
    setProcesando(true)
    try {
      const r = await registerPayment(userId, parseFloat(amount), method, planKey, customEndDate, options)
      toast.success(r?.newPeriodEnd ? `Pago registrado. Nuevo vencimiento: ${r.newPeriodEnd.toLocaleDateString('es-PE')}` : 'Pago registrado')
      cerrarModal()
      await cargar()
    } catch (error) {
      console.error('Error al registrar pago:', error)
      toast.error(error.message || 'No se pudo registrar el pago')
    } finally {
      setProcesando(false)
    }
  }

  // Renovar sin abrir nada: mismo plan, mismo precio, un paso.
  async function renovarRapido() {
    const planConfig = PLANS[c.plan] || customPlans[c.plan]
    if (!planConfig) {
      toast.error('Esta cuenta no tiene un plan válido')
      return
    }
    const monto = c.renewalPrice != null ? c.renewalPrice : planConfig.totalPrice
    if (!window.confirm(`¿Renovar ${c.businessName} con ${planConfig.name} por S/ ${monto}?`)) return
    setProcesando(true)
    try {
      await registerPayment(c.id, monto, 'Admin - Renovación rápida', c.plan)
      toast.success('Renovación registrada')
      await cargar()
    } catch (error) {
      console.error('Error al renovar:', error)
      toast.error('No se pudo renovar')
    } finally {
      setProcesando(false)
    }
  }

  async function cambiarPlan(userId, planKey) {
    const plan = PLANS[planKey] || customPlans[planKey]
    if (!plan) {
      toast.error('Plan no válido')
      return
    }
    try {
      await updateDoc(doc(db, 'subscriptions', userId), { plan: planKey, planName: plan.name, limits: plan.limits, updatedAt: Timestamp.now() })
      toast.success(`Plan cambiado a ${plan.name}`)
      cerrarModal()
      await cargar()
    } catch (error) {
      console.error('Error al cambiar plan:', error)
      toast.error('No se pudo cambiar el plan')
    }
  }

  async function cambiarAcceso(bloquear) {
    if (bloquear && !window.confirm(`¿Suspender a ${cuenta.businessName}? Pierde el acceso hasta que se reactive.`)) return
    try {
      await updateDoc(doc(db, 'subscriptions', id), {
        accessBlocked: bloquear,
        status: bloquear ? 'suspended' : 'active',
        // El motivo acompaña a la suspensión: al reactivar se borra. Antes se
        // quedaba grabado y la ficha seguía mostrando el recuadro rojo.
        blockReason: bloquear ? 'Suspendida por el administrador' : null,
        blockedAt: bloquear ? Timestamp.now() : null,
      })
      toast.success(bloquear ? 'Cuenta suspendida' : 'Cuenta reactivada')
      await cargar()
    } catch (error) {
      console.error('Error cambiando el acceso:', error)
      toast.error('No se pudo cambiar el acceso')
    }
  }

  async function archivar(valor) {
    if (valor && !window.confirm(`¿Archivar a ${cuenta.businessName}? Queda fuera de los vencimientos y de las tasas de renovación.`)) return
    try {
      await updateDoc(doc(db, 'subscriptions', id), valor
        ? { archived: true, archivedAt: serverTimestamp(), archivedBy: admin?.uid || null }
        : { archived: false, archivedAt: null, archivedBy: null })
      toast.success(valor ? 'Cuenta archivada' : 'Cuenta desarchivada')
      await cargar()
    } catch (error) {
      console.error('Error al archivar:', error)
      toast.error('No se pudo cambiar el archivado')
    }
  }

  function abrirWhatsApp() {
    const url = enlaceRecordatorioWhatsapp(cuenta)
    if (!url) {
      toast.error('Esta cuenta no tiene teléfono registrado')
      return
    }
    window.open(url, '_blank', 'noopener')
  }

  async function guardarRubro(rubroId) {
    const valor = rubroId || null
    if (valor === (cuenta.rubro || null)) return
    try {
      await updateDoc(doc(db, 'businesses', id), { rubro: valor, rubroConfirmadoEn: valor ? new Date() : null })
      const efectivo = valor || cuenta.rubroSugerido || null
      parchar({ rubro: valor, rubroEfectivo: efectivo, rubroNombre: efectivo ? nombreRubro(efectivo) : '', rubroConfirmadoEn: valor ? new Date() : null })
      toast.success(valor ? `Rubro: ${nombreRubro(valor)}` : 'Rubro quitado')
    } catch (e) {
      toast.error('No se pudo guardar el rubro')
    }
  }

  async function guardarLimite() {
    const valor = nuevoLimite === '' || Number(nuevoLimite) === -1 ? -1 : parseInt(nuevoLimite, 10) || 500
    try {
      await updateDoc(doc(db, 'subscriptions', id), { 'limits.maxInvoicesPerMonth': valor, updatedAt: serverTimestamp() })
      parchar({ limit: valor, limits: { ...(cuenta.limits || {}), maxInvoicesPerMonth: valor } })
      toast.success(`Límite: ${valor === -1 ? 'ilimitado' : `${valor} comprobantes al mes`}`)
      setEditandoLimite(false)
    } catch (error) {
      console.error('Error guardando el límite:', error)
      toast.error('No se pudo guardar el límite')
    }
  }

  async function guardarNotas() {
    setGuardandoNotas(true)
    try {
      await updateDoc(doc(db, 'subscriptions', id), { notasAdmin: notas, notasAdminEn: serverTimestamp() })
      parchar({ notasAdmin: notas })
      toast.success('Notas guardadas')
    } catch (error) {
      console.error('Error guardando las notas:', error)
      toast.error('No se pudieron guardar las notas')
    } finally {
      setGuardandoNotas(false)
    }
  }

  // ── Historial: todo lo fechado que se sabe de la cuenta ─────────────────────
  const historial = useMemo(() => {
    if (!cuenta) return []
    const eventos = []
    const agregar = (f, evento, detalle = '') => {
      const d = toDate(f)
      if (d) eventos.push({ fecha: d, evento, detalle })
    }
    agregar(cuenta.createdAt, 'Alta de la cuenta', cuenta.createdByReseller ? `Por el reseller ${cuenta.resellerName}` : '')
    for (const p of cuenta.paymentHistory) {
      agregar(p.date, `Pago de ${moneda(p.amount)}`, [
        p.planName || PLANS[p.plan]?.name || p.plan,
        p.months ? `${p.months} ${p.months === 1 ? 'mes' : 'meses'}` : null,
        p.method,
        p.status && p.status !== 'completed' ? p.status : null,
      ].filter(Boolean).join(' · '))
    }
    agregar(cuenta.codigoClienteAsignadoEn, `Código de cliente ${cuenta.codigoCliente}`)
    agregar(cuenta.rubroConfirmadoEn, `Rubro confirmado: ${cuenta.rubro ? nombreRubro(cuenta.rubro) : '—'}`)
    agregar(cuenta.archivedAt, 'Cuenta archivada')
    agregar(cuenta.currentPeriodStart, 'Inicio del periodo actual', `Hasta ${fecha(cuenta.periodEnd)}`)
    agregar(cuenta.lastCounterReset, 'Reinicio del contador de comprobantes')
    for (const s of sucursales) agregar(s.createdAt, `Sucursal creada: ${s.name}`)
    for (const u of cuenta.subUsers) agregar(u.createdAt, `Sub-usuario creado: ${u.email}`)
    eventos.sort((a, b) => b.fecha - a.fecha)
    return eventos
  }, [cuenta, sucursales])

  // ── Render ──────────────────────────────────────────────────────────────────

  const volver = <Link to="/app/admin/users" className="hover:text-gray-900 hover:underline">← Usuarios</Link>

  if (cargando) {
    return <Pagina resumen={volver}><Seccion><p className="py-8 text-center text-gray-500">Cargando la cuenta…</p></Seccion></Pagina>
  }
  if (noExiste || !cuenta) {
    return (
      <Pagina resumen={volver}>
        <Aviso tono="rojo" titulo="Esta cuenta no existe">No hay ninguna suscripción con el id {id}.</Aviso>
      </Pagina>
    )
  }

  const c = cuenta
  const dias = diasParaVencer(c)
  const vencida = dias !== null && dias < 0
  const usados = c.usage?.invoicesThisMonth || 0
  const ilimitado = c.limit === -1 || c.limit === 0
  const urlTienda = c.catalogEnabled && (c.customDomain || c.catalogSlug)
    ? c.customDomain ? `https://${c.customDomain}` : `${window.location.origin}/catalogo/${c.catalogSlug}`
    : null
  const vendedor = c.vendedorId ? vendedores.find(v => v.id === c.vendedorId) : null
  const textoVence = c.nuncaVence
    ? 'Sin vencimiento (cuenta interna)'
    : c.periodEnd
    ? `${vencida ? 'Venció' : 'Vence'} el ${fecha(c.periodEnd)}${dias === 0 ? ' (hoy)' : vencida ? ` (hace ${Math.abs(dias)} días)` : ` (en ${dias} días)`}`
    : 'Sin fecha de vencimiento'
  const sucursalesActivas = sucursales.filter(s => s.isActive !== false)

  return (
    <Pagina
      resumen={volver}
      acciones={
        <>
          <Boton tamano="sm" variante="primario" onClick={() => setModal('pago')}>Registrar pago</Boton>
          <Boton tamano="sm" onClick={renovarRapido} disabled={procesando}>Renovar con el mismo plan</Boton>
          <Boton tamano="sm" onClick={() => setModal('plan')}>Cambiar plan</Boton>
          <Boton tamano="sm" onClick={() => setModal('vencimiento')}>Cambiar vencimiento</Boton>
          <Boton tamano="sm" onClick={abrirWhatsApp}>Recordar por WhatsApp</Boton>
          {c.status !== 'suspended' ? (
            <Boton tamano="sm" onClick={() => cambiarAcceso(true)}>Suspender</Boton>
          ) : (
            <Boton tamano="sm" onClick={() => cambiarAcceso(false)}>Reactivar</Boton>
          )}
          {(c.status === 'suspended' || vencida || c.archived) && (
            <Boton tamano="sm" onClick={() => archivar(!c.archived)}>{c.archived ? 'Desarchivar' : 'Archivar'}</Boton>
          )}
        </>
      }
    >
      {/* Cabecera de la cuenta */}
      <Seccion>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[16px] font-semibold text-gray-900">{c.businessName}</h2>
          {c.codigoCliente && <span className="font-mono text-[12.5px] text-gray-500">{c.codigoCliente}</span>}
          {urlTienda && (
            <a href={urlTienda} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-primary-700 hover:underline">tienda online ↗</a>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] text-gray-500">
          {[c.tradeName, c.ruc ? `RUC ${c.ruc}` : null, c.email !== 'N/A' ? c.email : null].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-2 text-[12.5px] text-gray-700">
          <Estado valor={c.status} etiqueta={ESTADOS[c.status] || c.status} />
          {c.archived && <span className="text-gray-400"> · archivada</span>}
          <span className="text-gray-400"> · </span>
          {c.planName || PLANS[c.plan]?.name || customPlans[c.plan]?.name || c.plan}
          <span className="text-gray-400"> · </span>
          <span className={vencida ? 'text-red-600 font-medium' : ''}>{textoVence}</span>
          <span className="text-gray-400"> · </span>
          Alta el {fecha(c.createdAt)}
        </p>
        {c.status === 'suspended' && c.blockReason && (
          <Aviso tono="rojo" titulo="Motivo de la suspensión" className="mt-3">{c.blockReason}</Aviso>
        )}
      </Seccion>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Seccion titulo="Negocio">
          <ListaDatos>
            <Dato etiqueta="Razón social" apilar>{c.businessName}</Dato>
            <Dato etiqueta="Nombre comercial" apilar>{c.tradeName}</Dato>
            <Dato etiqueta="RUC">{c.ruc}</Dato>
            <Dato etiqueta="Dirección" apilar>{c.address}</Dato>
            <Dato etiqueta="Ubicación">{[c.district, c.province, c.department].filter(Boolean).join(', ')}</Dato>
            <Dato etiqueta="Teléfono del local">{c.phone}</Dato>
            <Dato etiqueta="Modo">{nombreModo(c.businessMode)}</Dato>
            <Dato etiqueta="Rubro" recortar={false}>
              <span className="inline-flex items-center gap-2">
                {!c.rubro && c.rubroSugerido && <Pastilla tono="punteado" title="Sugerido por la herramienta; falta confirmarlo">sugerido: {nombreRubro(c.rubroSugerido)}</Pastilla>}
                <Selector value={c.rubro || ''} onChange={e => guardarRubro(e.target.value)} className="h-7 w-44 text-[12px]">
                  <option value="">Sin rubro</option>
                  {RUBROS_ALFABETICOS.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </Selector>
              </span>
            </Dato>
            <Dato etiqueta="Sucursal principal">{c.mainBranchName || 'Sucursal Principal'}</Dato>
            <Dato etiqueta="Id de la cuenta"><span className="font-mono text-[11.5px]">{c.id}</span></Dato>
          </ListaDatos>
        </Seccion>

        <Seccion
          titulo="Dueño y contacto"
          acciones={
            <>
              <Boton tamano="sm" onClick={() => setModal('contacto')}>Editar contacto</Boton>
              <Boton tamano="sm" onClick={() => setModal('vendedor')}>Vendedor</Boton>
            </>
          }
        >
          <ListaDatos>
            <Dato etiqueta="Nombre">{c.contactName}</Dato>
            <Dato etiqueta="WhatsApp del dueño">{c.contactPhone}</Dato>
            <Dato etiqueta="Correo">{c.email !== 'N/A' ? c.email : null}</Dato>
            <Dato etiqueta="Origen">{c.createdByReseller ? `Reseller: ${c.resellerName}` : 'Cobrify'}</Dato>
            <Dato etiqueta="Vendedor">{vendedor ? vendedor.name : c.vendedorId ? c.vendedorId : null}</Dato>
            <Dato etiqueta="Sub-usuarios">{c.subUsersCount ? entero(c.subUsersCount) : '0'}</Dato>
          </ListaDatos>
        </Seccion>

        <Seccion titulo="Suscripción">
          <ListaDatos>
            <Dato etiqueta="Plan">{c.planName || PLANS[c.plan]?.name || customPlans[c.plan]?.name || c.plan}<span className="ml-1.5 font-mono text-[11px] text-gray-400">{c.plan}</span></Dato>
            {/* Una cuenta interna no paga: el precio que tenga guardado es un resto de antes. */}
            <Dato etiqueta="Precio pactado">{c.renewalPrice != null && !c.nuncaVence ? moneda(c.renewalPrice) : null}</Dato>
            <Dato etiqueta="Precio mensual del plan">{c.monthlyPrice ? moneda(c.monthlyPrice) : null}</Dato>
            <Dato etiqueta="Periodo actual">
              {c.nuncaVence
                ? 'Sin vencimiento'
                : c.currentPeriodStart ? `${fecha(c.currentPeriodStart)} → ${fecha(c.periodEnd)}` : fecha(c.periodEnd)}
            </Dato>
            <Dato etiqueta="Comprobantes este mes"><span className={!ilimitado && c.limit > 0 && usados / c.limit >= 0.9 ? 'text-red-600 font-medium' : ''}>{entero(usados)} / {ilimitado ? '∞' : entero(c.limit)}</span></Dato>
            <Dato etiqueta="Comprobantes extra (bonus)">{c.bonusInvoices ? entero(c.bonusInvoices) : '0'}</Dato>
            <Dato etiqueta="Clientes permitidos">{limite(c.limits?.maxCustomers)}</Dato>
            <Dato etiqueta="Productos permitidos">{limite(c.limits?.maxProducts)}</Dato>
            <Dato etiqueta="Sucursales permitidas">{limite(c.limits?.maxBranches ?? 1)}</Dato>
            <Dato etiqueta="Último pago">{c.lastPayment ? fecha(c.lastPayment) : null}</Dato>
            <Dato etiqueta="Último reinicio del contador">{c.lastCounterReset ? fechaHora(c.lastCounterReset) : null}</Dato>
          </ListaDatos>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
            {editandoLimite ? (
              <>
                <span className="text-gray-500">Límite mensual:</span>
                <Entrada type="number" min="-1" value={nuevoLimite} onChange={e => setNuevoLimite(e.target.value)} placeholder="vacío = ilimitado" className="w-36" autoFocus />
                <Boton tamano="sm" variante="primario" onClick={guardarLimite}>Guardar</Boton>
                <Boton tamano="sm" onClick={() => setEditandoLimite(false)}>Cancelar</Boton>
              </>
            ) : (
              <Boton tamano="sm" onClick={() => { setNuevoLimite(ilimitado ? '' : String(c.limit)); setEditandoLimite(true) }}>
                Cambiar límite mensual
              </Boton>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Emisión electrónica" acciones={<Boton tamano="sm" onClick={() => setModal('sunat')}>Configurar</Boton>}>
          <ListaDatos>
            <Dato etiqueta="Método">{METODOS[c.emissionMethod] || c.emissionMethod}</Dato>
            <Dato etiqueta="Régimen">{REGIMENES[c.taxType] || c.taxType}{c.igvRate != null ? ` · ${c.igvRate} %` : ''}</Dato>
            <Dato etiqueta="Boletas y facturas sin SUNAT">{c.allowInvoicingWithoutSunat ? 'Permitido' : 'No'}</Dato>
            {uso && (
              <>
                <Dato etiqueta="Aceptados por SUNAT">{entero(uso.invoices.bySunatStatus?.accepted)}</Dato>
                <Dato etiqueta="Rechazados"><span className={uso.invoices.bySunatStatus?.rejected ? 'text-red-600 font-medium' : ''}>{entero(uso.invoices.bySunatStatus?.rejected)}</span></Dato>
                <Dato etiqueta="Pendientes de envío">{entero(uso.invoices.bySunatStatus?.pending)}</Dato>
                <Dato etiqueta="Sin enviar">{entero(uso.invoices.bySunatStatus?.not_sent)}</Dato>
              </>
            )}
          </ListaDatos>
        </Seccion>

        <Seccion titulo="Uso" descripcion="Comprobantes, clientes y productos del negocio, contados en el servidor.">
          {uso ? (
            <>
              <Cifras>
                <Cifra etiqueta="Comprobantes" valor={entero(uso.invoices.total)} nota={`${entero(uso.invoices.thisMonth)} este mes`} />
                <Cifra etiqueta="Facturado" valor={moneda(uso.invoices.totalAmount)} nota={`${moneda(uso.invoices.totalAmountThisMonth)} este mes`} />
                <Cifra etiqueta="Ticket promedio" valor={moneda(uso.invoices.total ? uso.invoices.totalAmount / uso.invoices.total : 0)} />
                <Cifra etiqueta="Clientes" valor={entero(uso.customers.total)} nota={`de ${limite(c.limits?.maxCustomers)}`} />
                <Cifra etiqueta="Productos" valor={entero(uso.products.total)} nota={`de ${limite(c.limits?.maxProducts)}`} />
              </Cifras>
              <p className="mt-3 text-[12px] text-gray-500">
                {Object.entries(TIPOS_DOC).map(([k, n]) => `${n}: ${entero(uso.invoices.byType?.[k])}`).join(' · ')}
              </p>
            </>
          ) : (
            <p className="text-[12.5px] text-gray-500">{cargandoUso ? 'Contando comprobantes…' : 'Sin datos de uso.'}</p>
          )}
        </Seccion>

        <Seccion titulo="Funciones especiales" acciones={<Boton tamano="sm" onClick={() => setModal('funciones')}>Cambiar</Boton>}>
          <ListaDatos>
            {FUNCIONES.map(f => (
              <Dato key={f.clave} etiqueta={f.etiqueta} apagado={!c.features?.[f.clave]}>{c.features?.[f.clave] ? 'Activa' : 'No'}</Dato>
            ))}
          </ListaDatos>
        </Seccion>
      </div>

      <Seccion titulo={`Sucursales (${sucursalesActivas.length + 1})`} sinRelleno acciones={<Boton tamano="sm" onClick={() => setModal('sucursales')}>Gestionar</Boton>}>
        {/* En el celular, tarjetas: una tabla de cinco columnas obliga a
            desplazar de lado para leer una sola fila. */}
        <div className="sm:hidden divide-y divide-gray-100">
          <FichaEnTarjeta
            titulo={`${c.mainBranchName || 'Sucursal Principal'} · principal`}
            datos={[
              ['Dirección', c.address],
              ['Teléfono', c.phone],
              ['Modo', nombreModo(c.businessMode)],
              ['Creada', fecha(c.createdAt)],
            ]}
          />
          {sucursalesActivas.map(s => (
            <FichaEnTarjeta
              key={s.id}
              titulo={s.name}
              datos={[
                ['Dirección', s.address],
                ['Teléfono', s.phone],
                ['Modo', s.businessMode ? nombreModo(s.businessMode) : 'Hereda'],
                ['Creada', fecha(s.createdAt)],
              ]}
            />
          ))}
        </div>
        <div className="hidden sm:block">
        <Tabla>
          <thead>
            <tr>
              <Th>Sucursal</Th>
              <Th>Dirección</Th>
              <Th>Teléfono</Th>
              <Th>Modo</Th>
              <Th alinear="der">Creada</Th>
            </tr>
          </thead>
          <tbody>
            <Fila>
              <Td className="font-medium">{c.mainBranchName || 'Sucursal Principal'} <span className="text-gray-400 font-normal">· principal</span></Td>
              <Td apagado className="whitespace-normal">{c.address || '—'}</Td>
              <Td apagado>{c.phone || '—'}</Td>
              <Td apagado>{nombreModo(c.businessMode)}</Td>
              <Td numero apagado>{fecha(c.createdAt)}</Td>
            </Fila>
            {sucursalesActivas.map(s => (
              <Fila key={s.id}>
                <Td className="font-medium">{s.name}</Td>
                <Td apagado className="whitespace-normal">{s.address || '—'}</Td>
                <Td apagado>{s.phone || '—'}</Td>
                <Td apagado>{s.businessMode ? nombreModo(s.businessMode) : 'Hereda'}</Td>
                <Td numero apagado>{fecha(s.createdAt)}</Td>
              </Fila>
            ))}
          </tbody>
        </Tabla>
        </div>
      </Seccion>

      {c.subUsers.length > 0 && (
        <Seccion titulo={`Sub-usuarios (${c.subUsers.length})`} sinRelleno>
          <div className="sm:hidden divide-y divide-gray-100">
            {c.subUsers.map(u => (
              <FichaEnTarjeta
                key={u.id}
                titulo={u.displayName || u.email}
                estado={<Estado valor={u.isActive ? 'active' : 'inactive'} etiqueta={u.isActive ? 'Activo' : 'Inactivo'} />}
                datos={[
                  ['Correo', u.email],
                  ['Páginas', u.allowedPages.length],
                  ['Creado', fecha(u.createdAt)],
                ]}
              />
            ))}
          </div>
          <div className="hidden sm:block">
          <Tabla>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Correo</Th>
                <Th>Estado</Th>
                <Th alinear="der">Páginas permitidas</Th>
                <Th alinear="der">Creado</Th>
              </tr>
            </thead>
            <tbody>
              {c.subUsers.map(u => (
                <Fila key={u.id}>
                  <Td className="font-medium">{u.displayName || '—'}</Td>
                  <Td apagado>{u.email}</Td>
                  <Td><Estado valor={u.isActive ? 'active' : 'inactive'} etiqueta={u.isActive ? 'Activo' : 'Inactivo'} /></Td>
                  <Td numero apagado>{u.allowedPages.length}</Td>
                  <Td numero apagado>{fecha(u.createdAt)}</Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
          </div>
        </Seccion>
      )}

      <Seccion titulo={`Pagos (${c.paymentHistory.length})`} sinRelleno>
        <div className="sm:hidden divide-y divide-gray-100">
          {c.paymentHistory.length === 0 && (
            <p className="px-4 py-6 text-center text-[12.5px] text-gray-500">Todavía no hay pagos registrados</p>
          )}
          {[...c.paymentHistory].reverse().map((p, i) => (
            <FichaEnTarjeta
              key={i}
              titulo={moneda(p.amount)}
              estado={<Estado valor={p.status || 'completed'} etiqueta={p.status === 'pending' ? 'Pendiente' : p.status === 'failed' ? 'Fallido' : 'Completado'} />}
              datos={[
                ['Fecha', fechaHora(p.date)],
                ['Plan', p.planName || (p.plan && (PLANS[p.plan]?.name || customPlans[p.plan]?.name)) || p.plan],
                ['Duración', p.months ? `${p.months} ${p.months === 1 ? 'mes' : 'meses'}` : null],
                ['Método', p.method],
              ]}
            />
          ))}
        </div>
        <div className="hidden sm:block">
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Plan</Th>
              <Th>Duración</Th>
              <Th>Método</Th>
              <Th>Estado</Th>
              <Th alinear="der">Monto</Th>
            </tr>
          </thead>
          <tbody>
            {c.paymentHistory.length === 0 && <FilaVacia colSpan={6}>Todavía no hay pagos registrados</FilaVacia>}
            {[...c.paymentHistory].reverse().map((p, i) => (
              <Fila key={i}>
                <Td>{fechaHora(p.date)}</Td>
                <Td apagado>{p.planName || (p.plan && (PLANS[p.plan]?.name || customPlans[p.plan]?.name)) || p.plan || '—'}</Td>
                <Td apagado>{p.months ? `${p.months} ${p.months === 1 ? 'mes' : 'meses'}` : '—'}</Td>
                <Td apagado>{p.method || '—'}</Td>
                <Td><Estado valor={p.status || 'completed'} etiqueta={p.status === 'pending' ? 'Pendiente' : p.status === 'failed' ? 'Fallido' : 'Completado'} /></Td>
                <Td numero className="font-medium">{moneda(p.amount)}</Td>
              </Fila>
            ))}
          </tbody>
        </Tabla>
        </div>
      </Seccion>

      <Seccion titulo="Historial" descripcion="Todo lo fechado que se sabe de la cuenta, de lo más reciente a lo más antiguo." sinRelleno>
        <div className="sm:hidden divide-y divide-gray-100">
          {historial.length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-gray-500">Sin eventos</p>}
          {historial.map((e, i) => (
            <div key={i} className="px-4 py-2.5">
              <p className="text-[12.5px] font-medium text-gray-900">{e.evento}</p>
              <p className="text-[11.5px] text-gray-500">{fechaHora(e.fecha)}</p>
              {e.detalle && <p className="mt-0.5 text-[12px] text-gray-600 break-words">{e.detalle}</p>}
            </div>
          ))}
        </div>
        <div className="hidden sm:block">
        <Tabla>
          <tbody>
            {historial.length === 0 && <FilaVacia colSpan={3}>Sin eventos</FilaVacia>}
            {historial.map((e, i) => (
              <Fila key={i}>
                <Td apagado className="w-44">{fechaHora(e.fecha)}</Td>
                <Td className="font-medium">{e.evento}</Td>
                <Td apagado className="whitespace-normal">{e.detalle}</Td>
              </Fila>
            ))}
          </tbody>
        </Tabla>
        </div>
      </Seccion>

      <Seccion titulo="Notas internas" descripcion="Solo las ve el equipo de Cobrify.">
        <AreaTexto rows={4} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Acuerdos, contexto, cosas a recordar de esta cuenta…" />
        <div className="mt-2 flex justify-end">
          <Boton tamano="sm" variante="primario" onClick={guardarNotas} disabled={guardandoNotas || notas === (c.notasAdmin || '')}>
            {guardandoNotas ? 'Guardando…' : 'Guardar notas'}
          </Boton>
        </div>
      </Seccion>

      {/* Al final y aparte: borrar una cuenta no se deshace. */}
      <Seccion titulo="Eliminar la cuenta" descripcion="Se borra el negocio con todos sus comprobantes, clientes y productos. No se puede deshacer.">
        <Boton tamano="sm" variante="peligro" onClick={() => setModal('eliminar')}>Eliminar esta cuenta</Boton>
      </Seccion>

      {modal === 'pago' && (
        <UserDetailsModal user={c} type="payment" onClose={cerrarModal} onRegisterPayment={registrarPago} loading={procesando} toast={toast} customPlans={customPlans} />
      )}
      {modal === 'plan' && (
        <UserDetailsModal user={c} type="edit" onClose={cerrarModal} onChangePlan={cambiarPlan} loading={procesando} toast={toast} customPlans={customPlans} />
      )}
      {modal === 'vencimiento' && (
        <UserDetailsModal user={c} type="expiry" onClose={cerrarModal} onUserUpdated={() => cargar()} toast={toast} />
      )}
      {modal === 'sunat' && <SunatModal cuenta={c} onClose={cerrarModal} onGuardado={() => cargar()} />}
      {modal === 'funciones' && <FuncionesModal cuenta={c} onClose={cerrarModal} onGuardado={features => parchar({ features })} />}
      {modal === 'sucursales' && (
        <SucursalesModal
          cuenta={c}
          onClose={() => { cerrarModal(); getBranches(id).then(r => { if (r.success) setSucursales(r.data) }) }}
          onCambio={cambios => parchar(cambios)}
        />
      )}
      {modal === 'contacto' && <ContactoModal cuenta={c} onClose={cerrarModal} onGuardado={cambios => parchar(cambios)} />}
      {modal === 'vendedor' && <AsignarVendedorModal cuenta={c} vendedores={vendedores} onClose={cerrarModal} onGuardado={cambios => parchar(cambios)} />}
      {modal === 'eliminar' && <EliminarCuentaModal cuenta={c} onClose={cerrarModal} onEliminada={() => navigate('/app/admin/users')} />}
    </Pagina>
  )
}

/**
 * Una fila de tabla convertida en tarjeta, para el celular.
 *
 * Las secciones de la ficha tienen de cinco a seis columnas; en un telefono eso
 * es desplazarse de lado para leer un solo renglon. Aca cada dato lleva su
 * etiqueta y lo que no tiene valor no ocupa linea.
 */
function FichaEnTarjeta({ titulo, estado, datos }) {
  const llenos = datos.filter(([, v]) => v !== null && v !== undefined && v !== '')
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[12.5px] font-medium text-gray-900 break-words">{titulo}</p>
        {estado && <span className="shrink-0 text-[11.5px]">{estado}</span>}
      </div>
      {llenos.length > 0 && (
        <dl className="mt-1 space-y-0.5">
          {llenos.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex gap-2 text-[11.5px]">
              <dt className="w-20 shrink-0 text-gray-500">{etiqueta}</dt>
              <dd className="min-w-0 flex-1 text-gray-700 break-words">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
