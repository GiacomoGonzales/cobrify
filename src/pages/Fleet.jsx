import { useState, useEffect, useMemo } from 'react'
import {
  Truck, User, Plus, Edit, Trash2, Loader2, Search, Star, AlertTriangle, Phone, CreditCard,
} from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  getDrivers, createDriver, updateDriver, deleteDriver,
  getVehicles, createVehicle, updateVehicle, deleteVehicle,
} from '@/services/fleetService'
import { avisoDeVencimiento, nombreDeConductor, nombreDeVehiculo } from '@/utils/fleet'
import { validatePlate, PLATE_MAX_LENGTH, PLATE_EXAMPLE } from '@/utils/vehiclePlate'
import { matchesSearchQuery } from '@/lib/utils'

/**
 * CONDUCTORES Y VEHÍCULOS.
 *
 * Pedido de JMC: los datos del conductor y del vehículo se escribían a mano en
 * CADA guía de remisión, y siempre son los mismos tres o cuatro. Acá se guardan
 * una vez y en la guía se eligen de una lista.
 *
 * Dos listas separadas y no "un conductor con su vehículo": en la calle un
 * conductor maneja distintas unidades y una unidad la manejan distintos
 * conductores. Ver src/services/fleetService.js.
 */

const TIPOS_DOC = [
  { value: '1', label: 'DNI' },
  { value: '4', label: 'Carnet de extranjería' },
  { value: '7', label: 'Pasaporte' },
]

const DRIVER_VACIO = {
  documentType: '1', documentNumber: '', name: '', lastName: '',
  license: '', licenseExpiry: '', phone: '', notes: '', isDefault: false,
}
const VEHICLE_VACIO = {
  plate: '', nickname: '', mtcEntity: '', mtcAuthorization: '',
  tuce: '', tuceExpiry: '', notes: '', isDefault: false,
}

/** La etiqueta de un vencimiento, o nada si falta mucho. */
function AvisoVencimiento({ fecha, que }) {
  const aviso = avisoDeVencimiento(fecha, { que })
  if (!aviso) return null
  const vencido = aviso.tono === 'vencido'
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
      vencido ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'
    }`}>
      <AlertTriangle className="w-3 h-3" />
      {aviso.texto}
    </span>
  )
}

export default function Fleet() {
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [tab, setTab] = useState('drivers')
  const [drivers, setDrivers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const [modal, setModal] = useState(null) // { tipo: 'driver'|'vehicle', datos, id }
  const [guardando, setGuardando] = useState(false)
  const [aBorrar, setABorrar] = useState(null)

  const businessId = getBusinessId()

  const cargar = async () => {
    if (isDemoMode) { setCargando(false); return }
    setCargando(true)
    const [d, v] = await Promise.all([getDrivers(businessId), getVehicles(businessId)])
    if (d.success) setDrivers(d.data)
    if (v.success) setVehicles(v.data)
    setCargando(false)
  }

  useEffect(() => {
    if (businessId) cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  // El predeterminado primero: es el que la guía va a preseleccionar.
  const ordenar = (lista, texto) => [...lista]
    .filter((x) => matchesSearchQuery(busqueda, texto(x)))
    .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))

  const conductores = useMemo(
    () => ordenar(drivers, (d) => `${nombreDeConductor(d)} ${d.documentNumber} ${d.license}`),
    [drivers, busqueda],
  )
  const unidades = useMemo(
    () => ordenar(vehicles, (v) => `${v.plate} ${v.nickname} ${v.mtcAuthorization}`),
    [vehicles, busqueda],
  )

  const abrir = (tipo, registro = null) => {
    if (isDemoMode) { toast.info('Esta función no está disponible en modo demo'); return }
    const vacio = tipo === 'driver' ? DRIVER_VACIO : VEHICLE_VACIO
    setModal({ tipo, id: registro?.id || null, datos: { ...vacio, ...(registro || {}) } })
  }

  const guardar = async () => {
    if (!modal || guardando) return
    const { tipo, id, datos } = modal

    if (tipo === 'vehicle') {
      const r = validatePlate(datos.plate)
      if (!r.valid) { toast.error(r.error); return }
    }

    setGuardando(true)
    try {
      const fn = tipo === 'driver'
        ? (id ? updateDriver : createDriver)
        : (id ? updateVehicle : createVehicle)
      const res = id ? await fn(businessId, id, datos) : await fn(businessId, datos)
      if (!res.success) { toast.error(res.error || 'No se pudo guardar'); return }
      toast.success(id ? 'Cambios guardados' : (tipo === 'driver' ? 'Conductor agregado' : 'Vehículo agregado'))
      setModal(null)
      await cargar()
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async () => {
    if (!aBorrar) return
    const { tipo, id } = aBorrar
    const res = tipo === 'driver' ? await deleteDriver(businessId, id) : await deleteVehicle(businessId, id)
    if (res.success) {
      toast.success('Eliminado')
      await cargar()
    } else {
      toast.error('No se pudo eliminar')
    }
    setABorrar(null)
  }

  const campo = (k, v) => setModal((m) => ({ ...m, datos: { ...m.datos, [k]: v } }))

  const enConductores = tab === 'drivers'
  const lista = enConductores ? conductores : unidades

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Conductores y vehículos</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Guárdalos una vez y elígelos al emitir una guía de remisión, en vez de escribirlos cada vez
          </p>
        </div>
        <Button onClick={() => abrir(enConductores ? 'driver' : 'vehicle')} className="w-full lg:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          {enConductores ? 'Agregar conductor' : 'Agregar vehículo'}
        </Button>
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'drivers', label: 'Conductores', icon: User, n: drivers.length },
          { id: 'vehicles', label: 'Vehículos', icon: Truck, n: vehicles.length },
        ].map(({ id, label, icon: Icon, n }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {n > 0 && <span className="text-xs text-gray-400">({n})</span>}
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={enConductores ? 'Buscar por nombre, documento o licencia…' : 'Buscar por placa o nombre…'}
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {cargando ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            {enConductores ? <User className="w-10 h-10 mx-auto text-gray-300" /> : <Truck className="w-10 h-10 mx-auto text-gray-300" />}
            <p className="text-gray-900 font-medium mt-3">
              {busqueda ? 'Sin resultados' : (enConductores ? 'Todavía no hay conductores' : 'Todavía no hay vehículos')}
            </p>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              {busqueda
                ? 'Prueba con otro texto.'
                : 'Agrega los que usas habitualmente. Después, al emitir una guía, los eliges de una lista en vez de escribir sus datos.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lista.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">
                        {enConductores ? nombreDeConductor(r) : nombreDeVehiculo(r)}
                      </p>
                      {r.isDefault && (
                        <Badge variant="primary" className="inline-flex items-center gap-1">
                          <Star className="w-3 h-3" /> El de siempre
                        </Badge>
                      )}
                    </div>

                    {enConductores ? (
                      <div className="mt-1.5 space-y-0.5 text-sm text-gray-600">
                        <p className="flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                          {TIPOS_DOC.find((t) => t.value === r.documentType)?.label || 'Doc'} {r.documentNumber}
                        </p>
                        <p>Licencia: <span className="font-medium text-gray-900">{r.license}</span></p>
                        {r.phone && (
                          <p className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />{r.phone}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1.5 space-y-0.5 text-sm text-gray-600">
                        {r.mtcAuthorization && <p>Autorización MTC: <span className="font-medium text-gray-900">{r.mtcAuthorization}</span></p>}
                        {r.mtcEntity && <p>Entidad: {r.mtcEntity}</p>}
                        {r.tuce && <p>TUCE: <span className="font-medium text-gray-900">{r.tuce}</span></p>}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <AvisoVencimiento
                        fecha={enConductores ? r.licenseExpiry : r.tuceExpiry}
                        que={enConductores ? 'La licencia' : 'La TUCE'}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => abrir(enConductores ? 'driver' : 'vehicle', r)}
                      className="p-2 text-gray-500 hover:text-primary-600 rounded-lg hover:bg-gray-50"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setABorrar({ tipo: enConductores ? 'driver' : 'vehicle', id: r.id, nombre: enConductores ? nombreDeConductor(r) : nombreDeVehiculo(r) })}
                      className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-50"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ===== Alta / edición ===== */}
      <Modal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        title={modal?.tipo === 'driver'
          ? (modal?.id ? 'Editar conductor' : 'Nuevo conductor')
          : (modal?.id ? 'Editar vehículo' : 'Nuevo vehículo')}
        size="md"
      >
        {modal && (
          <div className="space-y-4">
            {modal.tipo === 'driver' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select label="Tipo de documento" value={modal.datos.documentType} onChange={(e) => campo('documentType', e.target.value)}>
                    {TIPOS_DOC.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                  <Input label="Número *" value={modal.datos.documentNumber} onChange={(e) => campo('documentNumber', e.target.value)} placeholder="Ej: 45678912" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Nombres *" value={modal.datos.name} onChange={(e) => campo('name', e.target.value)} placeholder="Ej: Juan Carlos" />
                  <Input label="Apellidos" value={modal.datos.lastName} onChange={(e) => campo('lastName', e.target.value)} placeholder="Ej: Ramírez Soto" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Licencia de conducir *" value={modal.datos.license} onChange={(e) => campo('license', e.target.value)} placeholder="Ej: Q45678912" />
                  <Input type="date" label="Vence el" value={modal.datos.licenseExpiry || ''} onChange={(e) => campo('licenseExpiry', e.target.value)} />
                </div>
                <Input label="Teléfono" value={modal.datos.phone} onChange={(e) => campo('phone', e.target.value)} placeholder="Opcional" />
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Placa *"
                    value={modal.datos.plate}
                    onChange={(e) => campo('plate', e.target.value.toUpperCase())}
                    maxLength={PLATE_MAX_LENGTH}
                    placeholder={`Ej: ${PLATE_EXAMPLE}`}
                  />
                  <Input label="Nombre interno" value={modal.datos.nickname} onChange={(e) => campo('nickname', e.target.value)} placeholder="Ej: Bus 1, Camión rojo" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="N.° de autorización MTC" value={modal.datos.mtcAuthorization} onChange={(e) => campo('mtcAuthorization', e.target.value)} placeholder="Opcional" />
                  <Input label="Entidad emisora" value={modal.datos.mtcEntity} onChange={(e) => campo('mtcEntity', e.target.value)} placeholder="Ej: MTC" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="TUCE" value={modal.datos.tuce} onChange={(e) => campo('tuce', e.target.value)} placeholder="Opcional" />
                  <Input type="date" label="TUCE vence el" value={modal.datos.tuceExpiry || ''} onChange={(e) => campo('tuceExpiry', e.target.value)} />
                </div>
              </>
            )}

            <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={!!modal.datos.isDefault}
                onChange={(e) => campo('isDefault', e.target.checked)}
                className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">Es el de siempre</span>
                <p className="text-xs text-gray-600 mt-0.5">
                  Viene preseleccionado al crear una guía. Solo puede haber uno.
                </p>
              </div>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModal(null)} disabled={guardando}>Cancelar</Button>
              <Button onClick={guardar} disabled={guardando}>
                {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===== Confirmar borrado ===== */}
      <Modal isOpen={!!aBorrar} onClose={() => setABorrar(null)} title="Eliminar" size="sm">
        <p className="text-sm text-gray-700">
          ¿Eliminar <span className="font-semibold">{aBorrar?.nombre}</span>? Las guías ya emitidas no
          cambian: guardan sus datos propios.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setABorrar(null)}>Cancelar</Button>
          <Button variant="danger" onClick={borrar}>Eliminar</Button>
        </div>
      </Modal>
    </div>
  )
}
