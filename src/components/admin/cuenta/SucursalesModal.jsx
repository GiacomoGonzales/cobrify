import { useEffect, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getBranches, createBranch, updateBranch, deleteBranch } from '@/services/branchService'
import { createWarehouse, getWarehouses, deleteWarehouse } from '@/services/warehouseService'
import { updateMaxBranches } from '@/services/subscriptionService'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Campo, Entrada, Selector, Casilla } from '@/components/admin/ui'

// Sucursales de una cuenta: una tarjeta por sucursal con sus datos, un boton
// para agregar y el maximo permitido por la suscripcion. onCambio recibe lo que
// cambio en la cuenta (mainBranchName, datos del negocio o limits) para que la
// ficha se actualice sin recargar.
//
// LA PRINCIPAL TAMBIEN SE EDITA DESDE AQUI. No es un documento de `branches`:
// es el negocio mismo, asi que sus datos viven en `businesses/{id}` y antes
// solo se tocaban entrando a la Configuracion de esa cuenta.
//
// OJO CON LA UBICACION, que se guarda distinto en cada sitio:
//   - sucursal adicional -> department/province/district son CODIGOS de ubigeo
//   - negocio (principal) -> son NOMBRES, mas `ubigeo` con el codigo completo
// Es asi desde antes; el formulario trabaja siempre con codigos y traduce al
// guardar y al cargar la principal.

const FORM_VACIO = {
  name: '',
  address: '',
  phone: '',
  email: '',
  location: '',
  businessMode: '', // '' = hereda el modo del negocio
  isDefault: false,
  department: '',
  province: '',
  district: '',
  ubigeo: '',
}

const MODOS = [
  ['', 'Heredar del negocio'],
  ['retail', 'Comercio / retail'],
  ['restaurant', 'Restaurante'],
  ['pharmacy', 'Farmacia'],
  ['hotel', 'Hotel'],
  ['veterinary', 'Veterinaria'],
  ['lending', 'Préstamos'],
  ['transport', 'Transporte'],
  ['logistics', 'Logística / construcción'],
  ['real_estate', 'Inmobiliaria'],
]

export default function SucursalesModal({ cuenta, onClose, onCambio }) {
  const toast = useToast()
  const [sucursales, setSucursales] = useState([])
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState(FORM_VACIO)
  const [editando, setEditando] = useState(null)
  const [guardando, setGuardando] = useState(false)
  // Que se esta editando, si algo: una sucursal adicional (`editando`), el
  // negocio (`editandoPrincipal`) o una nueva (`creando`). Se edita de a una.
  const [editandoPrincipal, setEditandoPrincipal] = useState(false)
  const [creando, setCreando] = useState(false)
  const [principal, setPrincipal] = useState({
    name: cuenta.mainBranchName || 'Sucursal Principal',
    address: cuenta.address || '',
    phone: cuenta.phone || '',
    department: cuenta.department || '',
    province: cuenta.province || '',
    district: cuenta.district || '',
  })
  const [maximo, setMaximo] = useState(cuenta.limits?.maxBranches ?? 1)
  const [editandoMaximo, setEditandoMaximo] = useState(false)
  const [guardandoMaximo, setGuardandoMaximo] = useState(false)
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  // Con algo abierto no se ofrece abrir otra cosa: se edita de a una.
  const formAbierto = creando || Boolean(editando) || editandoPrincipal

  async function recargar() {
    const result = await getBranches(cuenta.id)
    if (result.success) setSucursales(result.data)
  }

  useEffect(() => {
    let vivo = true
    getBranches(cuenta.id)
      .then(r => { if (vivo && r.success) setSucursales(r.data) })
      .catch(e => { console.error('Error cargando sucursales:', e); toast.error('No se pudieron cargar las sucursales') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta.id])

  const activas = sucursales.filter(b => b.isActive !== false)
  const provincias = PROVINCIAS[form.department] || []
  const distritos = DISTRITOS[`${form.department}${form.province}`] || []

  // El ubigeo se arma con los tres codigos; cambiar uno resetea los de abajo.
  const cambiarUbigeo = (campo, valor) => {
    const nuevo = { ...form, [campo]: valor }
    if (campo === 'department') Object.assign(nuevo, { province: '', district: '', ubigeo: '' })
    else if (campo === 'province') Object.assign(nuevo, { district: '', ubigeo: '' })
    else if (campo === 'district') nuevo.ubigeo = nuevo.department && nuevo.province && valor ? `${nuevo.department}${nuevo.province}${valor}` : ''
    setForm(nuevo)
  }

  /**
   * Guardar la sucursal principal, que es el negocio.
   *
   * La ubicacion se convierte de codigos a NOMBRES, que es como la guarda la
   * Configuracion de la cuenta; escribir codigos ahi dejaria "15" donde el
   * comprobante espera "LIMA".
   */
  async function guardarPrincipal() {
    const nombre = form.name.trim()
    if (!nombre) {
      toast.error('El nombre de la sucursal es obligatorio')
      return
    }
    setGuardando(true)
    try {
      const dept = DEPARTAMENTOS.find(d => d.code === form.department)
      const prov = (PROVINCIAS[form.department] || []).find(x => x.code === form.province)
      const dist = (DISTRITOS[`${form.department}${form.province}`] || []).find(x => x.code === form.district)
      const datos = {
        mainBranchName: nombre,
        address: form.address || '',
        phone: form.phone || '',
        department: dept?.name || '',
        province: prov?.name || '',
        district: dist?.name || '',
        ubigeo: form.ubigeo || '',
      }
      // El nombre lo lee el negocio desde users; el resto vive en businesses.
      await updateDoc(doc(db, 'users', cuenta.id), { mainBranchName: nombre })
      await updateDoc(doc(db, 'businesses', cuenta.id), datos)
      setPrincipal({
        name: nombre,
        address: datos.address,
        phone: datos.phone,
        department: datos.department,
        province: datos.province,
        district: datos.district,
      })
      onCambio?.({ mainBranchName: nombre, address: datos.address, phone: datos.phone, department: datos.department, province: datos.province, district: datos.district })
      toast.success('Sucursal principal guardada')
      cerrarFormulario()
    } catch (error) {
      console.error('Error guardando la principal:', error)
      toast.error('No se pudo guardar la sucursal principal')
    } finally {
      setGuardando(false)
    }
  }

  /** Abrir el formulario con los datos del negocio, traduciendo nombres a codigos. */
  function editarPrincipal() {
    const dept = DEPARTAMENTOS.find(d => d.name === principal.department)
    const prov = dept ? (PROVINCIAS[dept.code] || []).find(x => x.name === principal.province) : null
    const dist = dept && prov ? (DISTRITOS[`${dept.code}${prov.code}`] || []).find(x => x.name === principal.district) : null
    setEditando(null)
    setEditandoPrincipal(true)
    setCreando(false)
    setForm({
      ...FORM_VACIO,
      name: principal.name,
      address: principal.address,
      phone: principal.phone,
      department: dept?.code || '',
      province: prov?.code || '',
      district: dist?.code || '',
      ubigeo: dept && prov && dist ? `${dept.code}${prov.code}${dist.code}` : '',
    })
  }

  function cerrarFormulario() {
    setEditando(null)
    setEditandoPrincipal(false)
    setCreando(false)
    setForm(FORM_VACIO)
  }

  async function guardarMaximo() {
    setGuardandoMaximo(true)
    try {
      await updateMaxBranches(cuenta.id, maximo)
      onCambio?.({ limits: { ...(cuenta.limits || {}), maxBranches: maximo } })
      toast.success('Límite de sucursales guardado')
      setEditandoMaximo(false)
    } catch (error) {
      console.error('Error guardando el límite:', error)
      toast.error('No se pudo guardar el límite')
    } finally {
      setGuardandoMaximo(false)
    }
  }

  async function guardarSucursal() {
    if (!form.name.trim()) {
      toast.error('El nombre de la sucursal es obligatorio')
      return
    }
    setGuardando(true)
    try {
      if (editando) {
        await updateBranch(cuenta.id, editando.id, form)
        toast.success('Sucursal actualizada')
      } else {
        const limite = maximo ?? 1
        if (limite !== -1 && activas.length >= limite) {
          toast.error(`Límite alcanzado: ${activas.length}/${limite} sucursales. Sube el límite arriba.`)
          return
        }
        const creada = await createBranch(cuenta.id, { ...form, createdBy: 'admin' })
        // Cada sucursal nace con su almacen por defecto
        if (creada.success && creada.id) {
          await createWarehouse(cuenta.id, {
            name: form.name,
            address: form.address || '',
            location: form.location || '',
            branchId: creada.id,
            isDefault: true,
          })
        }
        toast.success('Sucursal creada con su almacén')
      }
      await recargar()
      cerrarFormulario()
    } catch (error) {
      console.error('Error guardando la sucursal:', error)
      toast.error('No se pudo guardar la sucursal')
    } finally {
      setGuardando(false)
    }
  }

  function editar(sucursal) {
    setEditando(sucursal)
    setEditandoPrincipal(false)
    setCreando(false)
    setForm({
      name: sucursal.name || '',
      address: sucursal.address || '',
      phone: sucursal.phone || '',
      email: sucursal.email || '',
      location: sucursal.location || '',
      businessMode: sucursal.businessMode || '',
      isDefault: sucursal.isDefault || false,
      department: sucursal.department || '',
      province: sucursal.province || '',
      district: sucursal.district || '',
      ubigeo: sucursal.ubigeo || '',
    })
  }

  async function eliminar(sucursalId) {
    if (!window.confirm('¿Eliminar esta sucursal? También se eliminan sus almacenes.')) return
    try {
      const almacenes = await getWarehouses(cuenta.id)
      if (almacenes.success) {
        for (const a of almacenes.data.filter(w => w.branchId === sucursalId)) {
          await deleteWarehouse(cuenta.id, a.id)
        }
      }
      await deleteBranch(cuenta.id, sucursalId)
      toast.success('Sucursal y almacenes eliminados')
      await recargar()
    } catch (error) {
      console.error('Error eliminando la sucursal:', error)
      toast.error('No se pudo eliminar la sucursal')
    }
  }

  const limiteTexto = maximo === -1 ? '∞' : maximo

  return (
    <Modal
      titulo="Sucursales"
      subtitulo={`${cuenta.businessName} · ${activas.length + 1} de ${limiteTexto}`}
      onClose={onClose}
      ancho="lg"
      pie={<Boton onClick={onClose}>Cerrar</Boton>}
    >
      <div className="space-y-5">
        {/* Maximo permitido */}
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-gray-500">Máximo de sucursales:</span>
          {editandoMaximo ? (
            <>
              <Entrada type="number" min="-1" value={maximo} onChange={e => setMaximo(parseInt(e.target.value) || 1)} className="w-24" />
              <span className="text-[11.5px] text-gray-500">-1 = ilimitado</span>
              <Boton tamano="sm" variante="primario" onClick={guardarMaximo} disabled={guardandoMaximo}>{guardandoMaximo ? '…' : 'Guardar'}</Boton>
              <Boton tamano="sm" onClick={() => { setEditandoMaximo(false); setMaximo(cuenta.limits?.maxBranches ?? 1) }}>Cancelar</Boton>
            </>
          ) : (
            <>
              <span className="font-medium text-gray-900">{limiteTexto}</span>
              <Boton tamano="sm" onClick={() => setEditandoMaximo(true)}>Cambiar</Boton>
            </>
          )}
        </div>

        {/* Una tarjeta por sucursal. Al editar, la MISMA tarjeta se abre en
            campos: nada de un formulario aparte al final del modal. */}
        <div className="space-y-2">
          {editandoPrincipal ? (
            <TarjetaEditor
              titulo={`${principal.name} · principal`}
              nota="Son los datos del negocio: los mismos que salen en sus comprobantes y que el dueño ve en su Configuración."
              esPrincipal
              form={form}
              set={set}
              cambiarUbigeo={cambiarUbigeo}
              provincias={provincias}
              distritos={distritos}
              guardando={guardando}
              onGuardar={guardarPrincipal}
              onCancelar={cerrarFormulario}
            />
          ) : (
            <TarjetaSucursal
              nombre={principal.name}
              esPrincipal
              direccion={principal.address}
              telefono={principal.phone}
              ubicacion={[principal.district, principal.province, principal.department].filter(Boolean).join(' · ')}
              modo="Del negocio"
              nota="Usa las series globales del negocio"
              onEditar={editarPrincipal}
            />
          )}

          {cargando ? (
            <p className="text-[12.5px] text-gray-500 py-3">Cargando sucursales…</p>
          ) : (
            activas.map(su => (
              editando?.id === su.id ? (
                <TarjetaEditor
                  key={su.id}
                  titulo={`Editar ${su.name}`}
                  form={form}
                  set={set}
                  cambiarUbigeo={cambiarUbigeo}
                  provincias={provincias}
                  distritos={distritos}
                  guardando={guardando}
                  onGuardar={guardarSucursal}
                  onCancelar={cerrarFormulario}
                />
              ) : (
                <TarjetaSucursal
                  key={su.id}
                  nombre={su.name}
                  direccion={su.address}
                  telefono={su.phone}
                  correo={su.email}
                  ubicacion={su.location}
                  modo={MODOS.find(([v]) => v === (su.businessMode || ''))?.[1] || su.businessMode}
                  onEditar={() => editar(su)}
                  onEliminar={() => eliminar(su.id)}
                />
              )
            ))
          )}

          {/* La nueva sucursal es otra tarjeta mas, al final de la lista. */}
          {creando && (
            <TarjetaEditor
              titulo="Nueva sucursal"
              nota="Al crearla se generan sus series de documentos (F001, B001…), correlativas a las anteriores."
              form={form}
              set={set}
              cambiarUbigeo={cambiarUbigeo}
              provincias={provincias}
              distritos={distritos}
              guardando={guardando}
              onGuardar={guardarSucursal}
              onCancelar={cerrarFormulario}
              extra={sucursales.length > 0 && (
                <Casilla etiqueta="Marcar como sucursal por defecto" checked={form.isDefault} onChange={e => set('isDefault', e.target.checked)} />
              )}
            />
          )}

          {!cargando && !formAbierto && (
            <Boton
              variante="primario"
              onClick={() => { setEditando(null); setEditandoPrincipal(false); setForm(FORM_VACIO); setCreando(true) }}
            >
              Agregar sucursal
            </Boton>
          )}
        </div>
      </div>
    </Modal>
  )
}

/**
 * Una sucursal como bloque, no como fila de tabla.
 *
 * En la tabla, la direccion larga y el aviso de las series partian el texto en
 * cinco lineas y empujaban los botones fuera del modal. Aca cada dato tiene su
 * etiqueta y el ancho no pelea con nada.
 */
function TarjetaSucursal({ nombre, esPrincipal = false, direccion, telefono, correo, ubicacion, modo, nota, editando = false, onEditar, onEliminar }) {
  const datos = [
    ['Dirección', direccion],
    ['Teléfono', telefono],
    ['Correo', correo],
    ['Ubicación', ubicacion],
    ['Modo', modo],
  ].filter(([, v]) => v)

  return (
    <div className={`rounded-md border p-3 ${editando ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-900 truncate">
            {nombre}
            {esPrincipal && <span className="ml-1.5 text-[11.5px] font-normal text-gray-400">· principal</span>}
          </p>
          {nota && <p className="text-[11.5px] text-gray-500">{nota}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Boton tamano="sm" onClick={onEditar}>Editar</Boton>
          {onEliminar && <Boton tamano="sm" variante="peligro" onClick={onEliminar}>Eliminar</Boton>}
        </div>
      </div>
      {datos.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {datos.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex gap-2 text-[12px] min-w-0">
              <dt className="w-20 shrink-0 text-gray-500">{etiqueta}</dt>
              <dd className="min-w-0 flex-1 text-gray-900 break-words">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/**
 * La misma tarjeta, pero abierta en campos.
 *
 * Editar ocurre DONDE esta la sucursal, no en un formulario al final del modal:
 * asi se ve cual se esta tocando y el boton de guardar queda al lado de lo que
 * se cambio, no debajo del borde de la ventana.
 */
function TarjetaEditor({ titulo, nota, esPrincipal = false, form, set, cambiarUbigeo, provincias, distritos, guardando, onGuardar, onCancelar, extra }) {
  return (
    <div className="rounded-md border border-primary-500 bg-primary-50 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-900 truncate">{titulo}</p>
          {nota && <p className="text-[11.5px] text-gray-500">{nota}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Boton tamano="sm" onClick={onCancelar}>Cancelar</Boton>
          <Boton tamano="sm" variante="primario" onClick={onGuardar} disabled={guardando || !form.name.trim()}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </div>

      <Campo etiqueta="Nombre">
        <Entrada autoFocus value={form.name} onChange={e => set('name', e.target.value)} placeholder="Tienda Centro, Sucursal Norte…" />
      </Campo>
      <Campo etiqueta="Dirección" ayuda="Sale en los comprobantes.">
        <Entrada value={form.address} onChange={e => set('address', e.target.value)} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Campo etiqueta="Teléfono"><Entrada value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="01-1234567" /></Campo>
        {!esPrincipal && (
          <Campo etiqueta="Correo"><Entrada type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="sucursal@empresa.com" /></Campo>
        )}
        {!esPrincipal && (
          <Campo etiqueta="Ciudad"><Entrada value={form.location} onChange={e => set('location', e.target.value)} placeholder="Lima, Arequipa…" /></Campo>
        )}
      </div>
      <div>
        <p className="mb-1 text-[12px] font-medium text-gray-700">
          Ubigeo (para guías de remisión){form.ubigeo ? <span className="ml-2 font-normal text-gray-500">{form.ubigeo}</span> : null}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Selector value={form.department} onChange={e => cambiarUbigeo('department', e.target.value)}>
            <option value="">Departamento</option>
            {DEPARTAMENTOS.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
          </Selector>
          <Selector value={form.province} onChange={e => cambiarUbigeo('province', e.target.value)} disabled={!form.department}>
            <option value="">Provincia</option>
            {provincias.map(pr => <option key={pr.code} value={pr.code}>{pr.name}</option>)}
          </Selector>
          <Selector value={form.district} onChange={e => cambiarUbigeo('district', e.target.value)} disabled={!form.province}>
            <option value="">Distrito</option>
            {distritos.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
          </Selector>
        </div>
      </div>
      {!esPrincipal && (
        <Campo etiqueta="Modo de negocio (plantilla)" ayuda="Menú y pantallas cuando esta sucursal está activa. En «Heredar» usa el modo general del negocio.">
          <Selector value={form.businessMode || ''} onChange={e => set('businessMode', e.target.value)}>
            {MODOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selector>
        </Campo>
      )}
      {extra}
    </div>
  )
}
