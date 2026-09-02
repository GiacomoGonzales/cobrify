import { useEffect, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getBranches, createBranch, updateBranch, deleteBranch } from '@/services/branchService'
import { createWarehouse, getWarehouses, deleteWarehouse } from '@/services/warehouseService'
import { updateMaxBranches } from '@/services/subscriptionService'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Campo, Entrada, Selector, Casilla, Tabla, Th, Td, Fila, FilaVacia } from '@/components/admin/ui'

// Sucursales de una cuenta: la principal (implicita, solo se renombra), las
// adicionales (crear/editar/borrar, cada una con su almacen) y el maximo
// permitido por la suscripcion. onCambio recibe lo que cambio en la cuenta
// (mainBranchName o limits) para que la lista o la ficha se actualicen.

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
  const [nombrePrincipal, setNombrePrincipal] = useState(cuenta.mainBranchName || 'Sucursal Principal')
  const [editandoPrincipal, setEditandoPrincipal] = useState(false)
  const [guardandoPrincipal, setGuardandoPrincipal] = useState(false)
  const [maximo, setMaximo] = useState(cuenta.limits?.maxBranches ?? 1)
  const [editandoMaximo, setEditandoMaximo] = useState(false)
  const [guardandoMaximo, setGuardandoMaximo] = useState(false)
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

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

  async function guardarPrincipal() {
    const nombre = nombrePrincipal.trim()
    if (!nombre) {
      toast.error('El nombre de la sucursal es obligatorio')
      return
    }
    setGuardandoPrincipal(true)
    try {
      // En users lo lee el negocio; en businesses, companySettings.
      await updateDoc(doc(db, 'users', cuenta.id), { mainBranchName: nombre })
      await updateDoc(doc(db, 'businesses', cuenta.id), { mainBranchName: nombre })
      onCambio?.({ mainBranchName: nombre })
      toast.success('Nombre de la sucursal principal guardado')
      setEditandoPrincipal(false)
    } catch (error) {
      console.error('Error guardando el nombre:', error)
      toast.error('No se pudo guardar el nombre')
    } finally {
      setGuardandoPrincipal(false)
    }
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
      setEditando(null)
      setForm(FORM_VACIO)
    } catch (error) {
      console.error('Error guardando la sucursal:', error)
      toast.error('No se pudo guardar la sucursal')
    } finally {
      setGuardando(false)
    }
  }

  function editar(sucursal) {
    setEditando(sucursal)
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

        {/* Lista */}
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <Tabla>
            <thead>
              <tr>
                <Th>Sucursal</Th>
                <Th>Dirección</Th>
                <Th>Teléfono</Th>
                <Th>Modo</Th>
                <Th ancho={120}></Th>
              </tr>
            </thead>
            <tbody>
              <Fila>
                <Td>
                  {editandoPrincipal ? (
                    <div className="flex items-center gap-2">
                      <Entrada value={nombrePrincipal} onChange={e => setNombrePrincipal(e.target.value)} autoFocus className="w-48" />
                      <Boton tamano="sm" variante="primario" onClick={guardarPrincipal} disabled={guardandoPrincipal}>{guardandoPrincipal ? '…' : 'Guardar'}</Boton>
                      <Boton tamano="sm" onClick={() => { setEditandoPrincipal(false); setNombrePrincipal(cuenta.mainBranchName || 'Sucursal Principal') }}>Cancelar</Boton>
                    </div>
                  ) : (
                    <span className="font-medium">{nombrePrincipal} <span className="text-gray-400 font-normal">· principal</span></span>
                  )}
                </Td>
                <Td apagado className="whitespace-normal">Usa las series globales del negocio</Td>
                <Td apagado>—</Td>
                <Td apagado>Del negocio</Td>
                <Td alinear="der">{!editandoPrincipal && <Boton tamano="sm" onClick={() => setEditandoPrincipal(true)}>Renombrar</Boton>}</Td>
              </Fila>
              {cargando ? (
                <FilaVacia colSpan={5}>Cargando sucursales…</FilaVacia>
              ) : (
                activas.map(s => (
                  <Fila key={s.id} seleccionada={editando?.id === s.id}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td apagado className="whitespace-normal">{s.address || '—'}</Td>
                    <Td apagado>{s.phone || '—'}</Td>
                    <Td apagado>{MODOS.find(([v]) => v === (s.businessMode || ''))?.[1] || s.businessMode}</Td>
                    <Td alinear="der">
                      <div className="flex justify-end gap-1">
                        <Boton tamano="sm" onClick={() => editar(s)}>Editar</Boton>
                        <Boton tamano="sm" variante="peligro" onClick={() => eliminar(s.id)}>Eliminar</Boton>
                      </div>
                    </Td>
                  </Fila>
                ))
              )}
            </tbody>
          </Tabla>
        </div>

        {/* Formulario */}
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <p className="text-[12.5px] font-medium text-gray-900">{editando ? `Editar ${editando.name}` : 'Nueva sucursal adicional'}</p>
          <Campo etiqueta="Nombre">
            <Entrada value={form.name} onChange={e => set('name', e.target.value)} placeholder="Tienda Centro, Sucursal Norte…" />
          </Campo>
          <Campo etiqueta="Dirección" ayuda="Sale en los comprobantes.">
            <Entrada value={form.address} onChange={e => set('address', e.target.value)} />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Campo etiqueta="Teléfono"><Entrada value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="01-1234567" /></Campo>
            <Campo etiqueta="Correo"><Entrada type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="sucursal@empresa.com" /></Campo>
            <Campo etiqueta="Ciudad"><Entrada value={form.location} onChange={e => set('location', e.target.value)} placeholder="Lima, Arequipa…" /></Campo>
          </div>
          <div>
            <p className="mb-1 text-[12px] font-medium text-gray-700">Ubigeo (para guías de remisión){form.ubigeo ? <span className="ml-2 font-normal text-gray-500">{form.ubigeo}</span> : null}</p>
            <div className="grid grid-cols-3 gap-2">
              <Selector value={form.department} onChange={e => cambiarUbigeo('department', e.target.value)}>
                <option value="">Departamento</option>
                {DEPARTAMENTOS.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
              </Selector>
              <Selector value={form.province} onChange={e => cambiarUbigeo('province', e.target.value)} disabled={!form.department}>
                <option value="">Provincia</option>
                {provincias.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
              </Selector>
              <Selector value={form.district} onChange={e => cambiarUbigeo('district', e.target.value)} disabled={!form.province}>
                <option value="">Distrito</option>
                {distritos.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
              </Selector>
            </div>
          </div>
          <Campo etiqueta="Modo de negocio (plantilla)" ayuda="Menú y pantallas cuando esta sucursal está activa. En «Heredar» usa el modo general del negocio.">
            <Selector value={form.businessMode || ''} onChange={e => set('businessMode', e.target.value)}>
              {MODOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </Selector>
          </Campo>
          {!editando && sucursales.length > 0 && (
            <Casilla etiqueta="Marcar como sucursal por defecto" checked={form.isDefault} onChange={e => set('isDefault', e.target.checked)} />
          )}
          <div className="flex justify-end gap-2">
            {editando && <Boton onClick={() => { setEditando(null); setForm(FORM_VACIO) }}>Cancelar</Boton>}
            <Boton variante="primario" onClick={guardarSucursal} disabled={guardando || !form.name.trim()}>
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear sucursal'}
            </Boton>
          </div>
          <p className="text-[11.5px] text-gray-500">
            Al crear una sucursal se generan sus series de documentos (F001, B001…), correlativas a las anteriores.
          </p>
        </div>
      </div>
    </Modal>
  )
}
