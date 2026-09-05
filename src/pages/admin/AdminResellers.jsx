import React, { useMemo, useState, useEffect } from 'react'
import { db, auth } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import {
  collection,
  getDocs,
  getCountFromServer,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  where
} from 'firebase/firestore'
import { getTiersConfig, calculateTier } from '@/services/resellerTierService'
import { normalizeCustomDomain } from '@/services/brandingService'
import { matchesPrebuilt } from '@/lib/utils'
import { buildAccountHaystack } from '@/utils/adminSearch'
import {
  Search,
  RefreshCw,
  X,
  Save,
  Loader2,
  DollarSign,
  AlertTriangle,
  UserCheck,
  Globe,
} from 'lucide-react'
import {
  Pagina, Seccion, Filtros, Buscador, FiltroSelect, Boton,
  Tabla, Th, Td, Fila, FilaVacia, Estado, Pastilla,
  useMenuDeFila, BotonDeFila, CajaMenu, ItemMenu, SeparadorMenu,
} from '@/components/admin/ui'

// URL de las Cloud Functions (Cloud Run)
const FUNCTIONS_BASE_URL = 'https://us-central1-cobrify-395fe.cloudfunctions.net'
// URLs específicas de Cloud Run (2nd Gen)
const GET_USER_URL = 'https://getuserbyemail-tb5ph5ddsq-uc.a.run.app'
const CREATE_RESELLER_URL = 'https://createreseller-tb5ph5ddsq-uc.a.run.app'

export default function AdminResellers() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [resellers, setResellers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('all')
  const [modeloFiltro, setModeloFiltro] = useState('all')
  const [orden, setOrden] = useState({ campo: 'empresa', direccion: 'asc' })
  const [showModal, setShowModal] = useState(false)
  // APK de marca blanca: se sube por reseller y le aparece en su panel.
  const [apkReseller, setApkReseller] = useState(null)
  const [apkFile, setApkFile] = useState(null)
  const [apkVersion, setApkVersion] = useState('')
  const [apkNotas, setApkNotas] = useState('')
  const [subiendoApk, setSubiendoApk] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [selectedReseller, setSelectedReseller] = useState(null)
  const [saving, setSaving] = useState(false)

  // Estados para buscar usuario por email
  const [searchingUser, setSearchingUser] = useState(false)
  const [foundUser, setFoundUser] = useState(null)
  const [userSearchError, setUserSearchError] = useState('')

  const [formData, setFormData] = useState({
    email: '',
    companyName: '',
    ruc: '',
    phone: '',
    contactName: '',
    discountOverride: '',  // Vacío = usar tier automático
    isActive: true,
    customDomain: '',  // Solo admin puede configurar esto
    pricingModel: 'v2' // Modelo de precios: 'v2' (nuevo) o 'legacy'
  })

  const [depositAmount, setDepositAmount] = useState('')
  // Algunos resellers pagan el monto mas IGV y otros no, asi que va suelto.
  const [depositoConIgv, setDepositoConIgv] = useState(false)
  const [depositNote, setDepositNote] = useState('')

  useEffect(() => {
    loadResellers()
  }, [])

  async function loadResellers() {
    setLoading(true)
    try {
      const [resellersSnapshot, tiers] = await Promise.all([
        getDocs(collection(db, 'resellers')),
        getTiersConfig()
      ])
      // Conteo de clientes por reseller.
      //
      // Antes esto era un for...await secuencial que, por CADA reseller, traía
      // TODOS sus documentos de suscripción (dos veces: total y activos) solo
      // para leer el .size. Con N resellers eran 2N consultas una detrás de otra,
      // cada una con su ida y vuelta a la red y descargando documentos completos
      // que nunca se usaban → la página tardaba muchísimo en abrir.
      //
      // Ahora: agregación en el servidor (getCountFromServer devuelve solo el
      // número, sin documentos) y todas las consultas en PARALELO. Pasa de N
      // viajes encadenados a uno solo, con payload mínimo.
      const counts = await Promise.all(
        resellersSnapshot.docs.map(async (docSnap) => {
          const subsRef = collection(db, 'subscriptions')
          const [totalSnap, activeSnap] = await Promise.all([
            getCountFromServer(query(subsRef, where('resellerId', '==', docSnap.id))),
            getCountFromServer(query(
              subsRef,
              where('resellerId', '==', docSnap.id),
              where('status', '==', 'active')
            ))
          ])
          return {
            clientsCount: totalSnap.data().count,
            activeClientsCount: activeSnap.data().count
          }
        })
      )

      const resellersList = resellersSnapshot.docs.map((docSnap, i) => {
        const data = docSnap.data()
        const { clientsCount, activeClientsCount } = counts[i]

        // Calcular tier basado en clientes activos
        const currentTier = calculateTier(activeClientsCount, tiers)
        const effectiveDiscount = data.discountOverride !== undefined && data.discountOverride !== null
          ? data.discountOverride
          : currentTier.discount

        return {
          id: docSnap.id,
          ...data,
          clientsCount,
          activeClientsCount,
          currentTier,
          effectiveDiscount,
          hasOverride: data.discountOverride !== undefined && data.discountOverride !== null,
          customDomain: data.customDomain || ''
        }
      })

      setResellers(resellersList)
    } catch (error) {
      console.error('Error loading resellers:', error)
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setSelectedReseller(null)
    setFoundUser(null)
    setUserSearchError('')
    setFormData({
      email: '',
      companyName: '',
      ruc: '',
      phone: '',
      contactName: '',
      discountOverride: '',
      isActive: true,
      customDomain: '',
      pricingModel: 'v2'
    })
    setShowModal(true)
  }

  // Buscar usuario existente por email
  async function searchUserByEmail() {
    if (!formData.email || !formData.email.includes('@')) {
      setUserSearchError('Ingresa un email válido')
      return
    }

    setSearchingUser(true)
    setUserSearchError('')
    setFoundUser(null)

    try {
      const idToken = await auth.currentUser.getIdToken()
      const response = await fetch(GET_USER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          email: formData.email,
          adminUid: user?.uid
        })
      })

      const data = await response.json()

      if (data.success) {
        if (data.isAlreadyReseller) {
          setUserSearchError('Este usuario ya es reseller')
          return
        }

        setFoundUser(data)
        // Auto-llenar datos si tiene suscripción
        if (data.subscription?.businessName) {
          setFormData(prev => ({
            ...prev,
            companyName: data.subscription.businessName
          }))
        }
      } else {
        setUserSearchError(data.error || 'Usuario no encontrado')
      }
    } catch (error) {
      console.error('Error searching user:', error)
      setUserSearchError('Error al buscar usuario')
    } finally {
      setSearchingUser(false)
    }
  }

  function openEditModal(reseller) {
    setSelectedReseller(reseller)
    setFormData({
      email: reseller.email || '',
      companyName: reseller.companyName || '',
      ruc: reseller.ruc || '',
      phone: reseller.phone || '',
      contactName: reseller.contactName || '',
      discountOverride: reseller.discountOverride !== undefined && reseller.discountOverride !== null
        ? reseller.discountOverride.toString()
        : '',
      isActive: reseller.isActive !== false,
      customDomain: reseller.customDomain || '',
      pricingModel: reseller.pricingModel || 'legacy'
    })
    setShowModal(true)
  }

  function openApkModal(reseller) {
    setApkReseller(reseller)
    setApkFile(null)
    setApkVersion(reseller.androidApp?.version || '')
    setApkNotas(reseller.androidApp?.notas || '')
  }

  async function handleSubirApk() {
    if (!apkFile) return
    setSubiendoApk(true)
    try {
      const { subirApkReseller } = await import('@/services/resellerApkService')
      const res = await subirApkReseller(apkReseller.id, apkFile, {
        version: apkVersion,
        notas: apkNotas,
      })
      if (res.success) {
        setApkReseller(null)
        loadResellers()
      } else {
        alert('No se pudo subir: ' + res.error)
      }
    } finally {
      setSubiendoApk(false)
    }
  }

  async function handleQuitarApk() {
    if (!apkReseller) return
    setSubiendoApk(true)
    try {
      const { quitarApkReseller } = await import('@/services/resellerApkService')
      const res = await quitarApkReseller(apkReseller.id)
      if (res.success) {
        setApkReseller(null)
        loadResellers()
      } else {
        alert('No se pudo quitar: ' + res.error)
      }
    } finally {
      setSubiendoApk(false)
    }
  }

  function openDepositModal(reseller) {
    setSelectedReseller(reseller)
    setDepositAmount('')
    setDepositNote('')
    setDepositoConIgv(false)
    setShowDepositModal(true)
  }

  async function saveReseller() {
    if (!formData.companyName) {
      alert('El nombre de empresa es requerido')
      return
    }

    // Para crear nuevo, necesitamos haber encontrado el usuario
    if (!selectedReseller && !foundUser) {
      alert('Primero busca y verifica el usuario por email')
      return
    }

    setSaving(true)
    try {
      // discountOverride: vacío = null (usar tier automático), número = override manual
      const discountOverride = formData.discountOverride.trim() === ''
        ? null
        : parseInt(formData.discountOverride)

      const resellerData = {
        email: formData.email,
        companyName: formData.companyName,
        ruc: formData.ruc,
        phone: formData.phone,
        contactName: formData.contactName,
        discountOverride: discountOverride,
        isActive: formData.isActive,
        // Normalizar SIEMPRE: si se pega la URL del navegador
        // ("https://www.x.com/") no coincidiria con el hostname y el reseller
        // veria la landing de Cobrify sin ningun aviso.
        customDomain: normalizeCustomDomain(formData.customDomain) || null,
        pricingModel: formData.pricingModel || 'legacy'
      }

      if (selectedReseller) {
        // Actualizar reseller existente. Ojo: el saldo NO va aca a proposito.
        // Escribirlo lo REEMPLAZABA, asi que guardar la ficha con un valor viejo
        // borraba los consumos hechos mientras estaba abierta. El saldo se mueve
        // solo por "Recargar saldo", que ademas deja el movimiento registrado.
        await updateDoc(doc(db, 'resellers', selectedReseller.id), {
          ...resellerData,
          updatedAt: Timestamp.now()
        })
        setShowModal(false)
        loadResellers()
      } else {
        // Crear nuevo usando Cloud Function (con UID real)
        const idToken = await auth.currentUser.getIdToken()
        const response = await fetch(CREATE_RESELLER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            adminUid: user?.uid,
            resellerData: {
              uid: foundUser.user.uid,
              ...resellerData,
              // Arranca sin saldo: la plata entra por "Recargar saldo", que la
              // registra como movimiento y por eso aparece en Pagos.
              balance: 0,
              totalSpent: 0
            }
          })
        })

        const data = await response.json()

        if (data.success) {
          setShowModal(false)
          setFoundUser(null)
          loadResellers()
        } else {
          alert('Error al crear reseller: ' + data.error)
        }
      }
    } catch (error) {
      console.error('Error saving reseller:', error)
      alert('Error al guardar: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function addDeposit() {
    const amount = parseFloat(depositAmount)
    if (!amount || amount <= 0) {
      alert('Ingresa un monto válido')
      return
    }

    // Con IGV, el monto escrito es lo que entra al saldo y el reseller paga 18%
    // más. Se guardan los dos: `amount` es lo que pagó (lo que cuenta Pagos como
    // ingreso) y `baseAmount` lo que se le acreditó. Sin IGV son el mismo número.
    const igv = depositoConIgv ? Number((amount * 0.18).toFixed(2)) : 0
    const pagado = Number((amount + igv).toFixed(2))

    setSaving(true)
    try {
      // Actualizar balance
      const newBalance = (selectedReseller.balance || 0) + amount
      await updateDoc(doc(db, 'resellers', selectedReseller.id), {
        balance: newBalance,
        updatedAt: Timestamp.now()
      })

      // Registrar transacción
      await setDoc(doc(collection(db, 'resellerTransactions')), {
        resellerId: selectedReseller.id,
        type: 'deposit',
        amount: pagado,
        description: depositNote || 'Recarga de saldo por admin',
        createdAt: Timestamp.now(),
        addedBy: 'admin',
        ...(depositoConIgv ? { includesIgv: true, baseAmount: amount, igvAmount: igv } : {})
      })

      setShowDepositModal(false)
      loadResellers()
    } catch (error) {
      console.error('Error adding deposit:', error)
      alert('Error al agregar depósito: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleResellerStatus(reseller) {
    try {
      await updateDoc(doc(db, 'resellers', reseller.id), {
        isActive: !reseller.isActive,
        updatedAt: Timestamp.now()
      })
      loadResellers()
    } catch (error) {
      console.error('Error toggling status:', error)
    }
  }

  // Mismo criterio que la lista de Usuarios (@/utils/adminSearch).
  // Mismo trato que Usuarios: filtros arriba, orden por columna y menu de fila.
  const menu = useMenuDeFila()

  const filteredResellers = useMemo(() => {
    let lista = resellers.filter(r => matchesPrebuilt(searchTerm, buildAccountHaystack(r)))
    if (estadoFiltro !== 'all') {
      const activo = estadoFiltro === 'activos'
      lista = lista.filter(r => (r.isActive !== false) === activo)
    }
    if (modeloFiltro !== 'all') lista = lista.filter(r => (r.pricingModel === 'v2' ? 'v2' : 'legacy') === modeloFiltro)

    const valor = r => {
      switch (orden.campo) {
        case 'saldo': return r.balance || 0
        case 'clientes': return r.activeClientsCount || 0
        case 'descuento': return r.effectiveDiscount || 0
        default: return (r.companyName || '').toLowerCase()
      }
    }
    return [...lista].sort((a, b) => {
      const av = valor(a)
      const bv = valor(b)
      if (av < bv) return orden.direccion === 'asc' ? -1 : 1
      if (av > bv) return orden.direccion === 'asc' ? 1 : -1
      return 0
    })
  }, [resellers, searchTerm, estadoFiltro, modeloFiltro, orden])

  const ordenarPor = campo => setOrden(o => ({
    campo,
    direccion: o.campo === campo && o.direccion === 'asc' ? 'desc' : 'asc',
  }))

  const hayFiltros = Boolean(searchTerm) || estadoFiltro !== 'all' || modeloFiltro !== 'all'

  const stats = {
    total: resellers.length,
    active: resellers.filter(r => r.isActive !== false).length,
    totalBalance: resellers.reduce((sum, r) => sum + (r.balance || 0), 0),
    totalClients: resellers.reduce((sum, r) => sum + (r.clientsCount || 0), 0)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando resellers...</p>
        </div>
      </div>
    )
  }

  // Las acciones de cada reseller. Es una funcion y no un componente para que
  // se cierre sobre el reseller de la fila sin pasarle diez props.
  const accionesDe = r => (
    <CajaMenu posicion={menu.posicion} refMenu={menu.refMenu}>
      <ItemMenu onClick={() => { menu.cerrar(); openDepositModal(r) }}>Agregar saldo</ItemMenu>
      <SeparadorMenu />
      <ItemMenu onClick={() => { menu.cerrar(); openApkModal(r) }}>
        {r.androidApp?.url ? 'App Android (publicada)' : 'Subir app Android'}
      </ItemMenu>
      {r.customDomain && (
        <ItemMenu onClick={() => { menu.cerrar(); window.open(`https://${r.customDomain}`, '_blank', 'noopener') }}>
          Abrir su dominio ↗
        </ItemMenu>
      )}
      <SeparadorMenu />
      <ItemMenu rojo={r.isActive !== false} onClick={() => { menu.cerrar(); toggleResellerStatus(r) }}>
        {r.isActive !== false ? 'Desactivar' : 'Reactivar'}
      </ItemMenu>
    </CajaMenu>
  )

  return (
    <Pagina
      resumen={`${stats.total} resellers · ${stats.active} activos · S/ ${stats.totalBalance.toFixed(2)} de saldo · ${stats.totalClients} clientes`}
      acciones={
        <>
          <Boton tamano="sm" onClick={loadResellers}>Recargar</Boton>
          <Boton tamano="sm" variante="primario" onClick={openCreateModal}>Nuevo reseller</Boton>
        </>
      }
    >
      <Filtros>
        <Buscador ancho="w-full sm:w-80" placeholder="Nombre, correo, RUC, dominio" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <FiltroSelect value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
          <option value="all">Estado</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </FiltroSelect>
        <FiltroSelect value={modeloFiltro} onChange={e => setModeloFiltro(e.target.value)}>
          <option value="all">Modelo</option>
          <option value="v2">v2</option>
          <option value="legacy">Legacy</option>
        </FiltroSelect>
        {hayFiltros && (
          <button
            type="button"
            onClick={() => { setSearchTerm(''); setEstadoFiltro('all'); setModeloFiltro('all') }}
            className="h-8 px-2 text-[12.5px] text-gray-500 hover:text-gray-900"
          >
            Limpiar
          </button>
        )}
      </Filtros>

      <Seccion sinRelleno className="overflow-hidden">
        {/* En el celular, tarjetas; la tabla desde tablet. Igual que Usuarios. */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filteredResellers.length === 0 ? (
            <p className="p-6 text-center text-[12.5px] text-gray-500">
              {hayFiltros ? 'Ningún reseller coincide con el filtro.' : 'Todavía no hay resellers.'}
            </p>
          ) : filteredResellers.map(r => (
            <div key={r.id} className="p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openEditModal(r)}>
                  <p className="font-medium text-gray-900 text-[13px] truncate">{r.companyName}</p>
                  <p className="text-[11.5px] text-gray-500 truncate">{r.email}</p>
                  {r.ruc && <p className="text-[11.5px] text-gray-500">RUC {r.ruc}</p>}
                </div>
                <div className="relative shrink-0">
                  <BotonDeFila onClick={el => menu.alternar(r.id, el)} />
                  {menu.abiertoEn === r.id && accionesDe(r)}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-gray-500">
                <Estado valor={r.isActive !== false ? 'active' : 'suspended'} etiqueta={r.isActive !== false ? 'Activo' : 'Inactivo'} />
                <span>{r.currentTier?.name || '—'} · {r.effectiveDiscount}% desc.</span>
                <span className="font-medium text-gray-900">S/ {(r.balance || 0).toFixed(2)}</span>
                <span>{r.activeClientsCount || 0} de {r.clientsCount || 0} clientes</span>
                {r.customDomain && <span className="truncate">{r.customDomain}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden sm:block">
          <Tabla>
            <thead>
              <tr>
                <Th campo="empresa" orden={orden} onOrdenar={ordenarPor}>Empresa</Th>
                <Th>Contacto</Th>
                <Th campo="descuento" orden={orden} onOrdenar={ordenarPor}>Nivel</Th>
                <Th campo="saldo" orden={orden} onOrdenar={ordenarPor} alinear="der">Saldo</Th>
                <Th campo="clientes" orden={orden} onOrdenar={ordenarPor} alinear="der">Clientes</Th>
                <Th>Estado</Th>
                <Th ancho="44px" />
              </tr>
            </thead>
            <tbody>
              {filteredResellers.length === 0 ? (
                <FilaVacia colSpan={7}>
                  {hayFiltros ? 'Ningún reseller coincide con el filtro.' : 'Todavía no hay resellers.'}
                </FilaVacia>
              ) : filteredResellers.map(r => (
                <Fila key={r.id} onClick={() => openEditModal(r)}>
                  <Td>
                    <p className="font-medium text-gray-900">{r.companyName}</p>
                    <p className="text-gray-500">{r.ruc || '—'}</p>
                  </Td>
                  <Td>
                    <p className="text-gray-900">{r.contactName || '—'}</p>
                    <p className="text-gray-500">{r.email}</p>
                    {r.customDomain && <p className="text-primary-600">{r.customDomain}</p>}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-900">{r.currentTier?.name || '—'}</span>
                      {r.hasOverride && <Pastilla tono="punteado">manual</Pastilla>}
                    </div>
                    <p className="text-gray-500">
                      {r.effectiveDiscount}% desc. · {r.pricingModel === 'v2' ? 'v2' : 'Legacy'}
                    </p>
                  </Td>
                  <Td numero>S/ {(r.balance || 0).toFixed(2)}</Td>
                  <Td numero>
                    {r.activeClientsCount || 0}
                    <span className="text-gray-400"> / {r.clientsCount || 0}</span>
                  </Td>
                  <Td>
                    <Estado valor={r.isActive !== false ? 'active' : 'suspended'} etiqueta={r.isActive !== false ? 'Activo' : 'Inactivo'} />
                  </Td>
                  <Td alinear="centro">
                    <div className="relative">
                      <BotonDeFila onClick={el => menu.alternar(r.id, el)} />
                      {menu.abiertoEn === r.id && accionesDe(r)}
                    </div>
                  </Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
        </div>
      </Seccion>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {selectedReseller ? 'Editar Reseller' : 'Nuevo Reseller'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Paso 1: Buscar usuario (solo para crear nuevo) */}
              {!selectedReseller && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Paso 1: Buscar usuario existente por email *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => {
                        setFormData({ ...formData, email: e.target.value })
                        setFoundUser(null)
                        setUserSearchError('')
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="usuario@ejemplo.com"
                      disabled={foundUser}
                    />
                    <button
                      onClick={searchUserByEmail}
                      disabled={searchingUser || foundUser}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {searchingUser ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      Buscar
                    </button>
                  </div>

                  {/* Error de búsqueda */}
                  {userSearchError && (
                    <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                      <AlertTriangle className="w-4 h-4" />
                      {userSearchError}
                    </div>
                  )}

                  {/* Usuario encontrado */}
                  {foundUser && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="bg-gray-100 p-2 rounded-full">
                          <UserCheck className="w-5 h-5 text-gray-700" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">Usuario encontrado</p>
                          <p className="text-sm text-gray-700">{foundUser.user.email}</p>
                          <p className="text-xs text-gray-700 mt-1">UID: {foundUser.user.uid}</p>
                          {foundUser.subscription && (
                            <div className="mt-2 text-xs text-gray-700">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-200 rounded-full">
                                Plan: {foundUser.subscription.plan} • {foundUser.subscription.status}
                              </span>
                              {foundUser.subscription.businessName && (
                                <p className="mt-1">Negocio: {foundUser.subscription.businessName}</p>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setFoundUser(null)
                            setFormData({ ...formData, email: '', companyName: '' })
                          }}
                          className="text-gray-700 hover:text-gray-900"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Paso 2: Datos del reseller (visible cuando hay usuario o es edición) */}
              {(foundUser || selectedReseller) && (
                <>
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">
                      {selectedReseller ? 'Datos del Reseller' : 'Paso 2: Datos del Reseller'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {selectedReseller && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          value={formData.email}
                          disabled
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                        />
                      </div>
                    )}
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Empresa *</label>
                      <input
                        type="text"
                        value={formData.companyName}
                        onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Mi Empresa SAC"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">RUC</label>
                      <input
                        type="text"
                        value={formData.ruc}
                        onChange={e => setFormData({ ...formData, ruc: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="20123456789"
                        maxLength={11}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="987654321"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Contacto</label>
                      <input
                        type="text"
                        value={formData.contactName}
                        onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Juan Pérez"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Descuento Manual (%)
                        <span className="text-xs text-gray-400 ml-1">Opcional</span>
                      </label>
                      <input
                        type="number"
                        value={formData.discountOverride}
                        onChange={e => setFormData({ ...formData, discountOverride: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        min="0"
                        max="100"
                        placeholder="Automático por nivel"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Vacío = automático por nivel (v2: 10/20/30%, legacy: 20/30/40%)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Modelo de precios</label>
                      <select
                        value={formData.pricingModel}
                        onChange={e => setFormData({ ...formData, pricingModel: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="v2">Nuevo (v2) — Básico/Mensual/Semestral/Anual · desc. 10/20/30%</option>
                        <option value="legacy">Antiguo (legacy) — QPse/SUNAT 1/6/12 · desc. 20/30/40%</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Define el catálogo que ve el reseller. Cambiar uno existente afecta sus próximas renovaciones/altas (sus clientes ya creados no cambian hasta renovar).
                      </p>
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                          className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Reseller activo</span>
                      </label>
                    </div>
                  </div>

                  {/* Sección de Dominio (solo admin) */}
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary-500" />
                      Dominio Personalizado
                    </h3>

                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Dominio del Reseller
                        <span className="text-xs text-primary-500 ml-1">(requiere configuración DNS)</span>
                      </label>
                      <input
                        type="text"
                        value={formData.customDomain}
                        onChange={e => setFormData({ ...formData, customDomain: e.target.value.toLowerCase() })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="facturacion.miempresa.com"
                      />
                      {formData.customDomain && (
                        <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700">
                          <strong>Configuración requerida:</strong>
                          <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                            <li>Se guardará como: <strong>{normalizeCustomDomain(formData.customDomain)}</strong></li>
                            <li>Agregar dominio en Vercel: {normalizeCustomDomain(formData.customDomain)}</li>
                            <li>Configurar DNS: CNAME → cname.vercel-dns.com</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Información */}
              {!selectedReseller && !foundUser && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-sm text-gray-900">
                    <strong>¿Cómo funciona?</strong><br />
                    1. Busca un usuario existente por su email<br />
                    2. El usuario debe tener una cuenta activa en Cobrify<br />
                    3. Al agregarlo como reseller, podrá acceder al panel de revendedores
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowModal(false)
                    setFoundUser(null)
                    setUserSearchError('')
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveReseller}
                  disabled={saving || (!selectedReseller && !foundUser)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {selectedReseller ? 'Guardar Cambios' : 'Crear Reseller'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {/* App Android de marca blanca. Se sube UNA por reseller: subir de nuevo
          reemplaza la anterior, asi el reseller siempre reparte la ultima. */}
      {apkReseller && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 w-full max-w-md">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-gray-900">App Android</h2>
                <p className="text-sm text-gray-500 truncate">{apkReseller.companyName}</p>
              </div>
              <button
                onClick={() => setApkReseller(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {apkReseller.androidApp?.url && (
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm">
                  <p className="font-medium text-gray-900">Ya tiene una publicada</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {[
                      apkReseller.androidApp.version ? `v${apkReseller.androidApp.version}` : null,
                      apkReseller.androidApp.sizeMb ? `${apkReseller.androidApp.sizeMb} MB` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Archivo .apk
                </label>
                <input
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  onChange={e => setApkFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
                {apkFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    {apkFile.name} · {Math.round((apkFile.size / 1048576) * 10) / 10} MB
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Versión</label>
                  <input
                    type="text"
                    value={apkVersion}
                    onChange={e => setApkVersion(e.target.value)}
                    placeholder="1.0"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
                  <input
                    type="text"
                    value={apkNotas}
                    onChange={e => setApkNotas(e.target.value)}
                    placeholder="Qué cambió"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                Le aparece al reseller en Configuración → App Android, con las instrucciones
                para instalarla en el celular de sus clientes.
              </p>

              <div className="flex items-center justify-between gap-2 pt-2">
                {apkReseller.androidApp?.url ? (
                  <button
                    onClick={handleQuitarApk}
                    disabled={subiendoApk}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Quitar
                  </button>
                ) : <span />}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setApkReseller(null)}
                    disabled={subiendoApk}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubirApk}
                    disabled={!apkFile || subiendoApk}
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {subiendoApk ? 'Subiendo...' : 'Publicar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDepositModal && selectedReseller && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 w-full max-w-md">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Agregar Saldo</h2>
              <button
                onClick={() => setShowDepositModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">Reseller</p>
                <p className="font-medium text-gray-900">{selectedReseller.companyName}</p>
                <p className="text-sm text-gray-500 mt-2">Saldo actual</p>
                <p className="text-2xl font-semibold text-gray-900">S/ {(selectedReseller.balance || 0).toFixed(2)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto a agregar</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">S/</span>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* IGV opcional: unos resellers lo pagan y otros no. Lo escrito
                    arriba es siempre lo que entra al saldo. */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={depositoConIgv}
                      onChange={e => setDepositoConIgv(e.target.checked)}
                      className="w-4 h-4 text-gray-700 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Agregar IGV (18%)</span>
                  </label>
                  {depositoConIgv && (
                    <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-3 py-2 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Entra al saldo:</span>
                        <span>S/ {(parseFloat(depositAmount) || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>IGV (18%):</span>
                        <span>S/ {((parseFloat(depositAmount) || 0) * 0.18).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-gray-700 pt-1 border-t border-gray-200">
                        <span>Paga el reseller:</span>
                        <span>S/ {((parseFloat(depositAmount) || 0) * 1.18).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={e => setDepositNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ej: Yape 12345, Transferencia BCP"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowDepositModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={addDeposit}
                  disabled={saving || !depositAmount}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4" />
                      Agregar Saldo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {menu.abiertoEn && <div className="fixed inset-0 z-40" onClick={menu.cerrar} />}
    </Pagina>
  )
}
