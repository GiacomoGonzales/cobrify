import { useState } from 'react'
import { createVendedor, updateVendedor, deleteVendedor } from '@/services/vendedorService'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Campo, Entrada, Selector, Tabla, Th, Td, Fila, FilaVacia } from '@/components/admin/ui'

const FORM_VACIO = { name: '', phone: '', yapeNumber: '', yapeName: '', bcpAccount: '', bcpCci: '', titular: '', linkedUserId: '' }

// Vendedores (agentes de venta): alta, edicion y baja, con sus datos de cobro.
// cuentas se usa para vincular un vendedor a una cuenta de usuario.
export default function VendedoresModal({ vendedores, cuentas, onClose, onCambio }) {
  const toast = useToast()
  const [form, setForm] = useState(FORM_VACIO)
  const [editando, setEditando] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  function editar(v) {
    setEditando(v)
    setForm({
      name: v.name || '',
      phone: v.phone || '',
      yapeNumber: v.yapeNumber || '',
      yapeName: v.yapeName || '',
      bcpAccount: v.bcpAccount || '',
      bcpCci: v.bcpCci || '',
      titular: v.titular || '',
      linkedUserId: v.linkedUserId || '',
    })
  }

  async function guardar() {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setGuardando(true)
    try {
      const result = editando ? await updateVendedor(editando.id, form) : await createVendedor(form)
      if (result.success) {
        toast.success(editando ? 'Vendedor actualizado' : 'Vendedor creado')
        setEditando(null)
        setForm(FORM_VACIO)
        onCambio?.()
      } else {
        toast.error(result.error || 'No se pudo guardar')
      }
    } catch (error) {
      console.error('Error guardando vendedor:', error)
      toast.error('No se pudo guardar el vendedor')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar este vendedor?')) return
    try {
      const result = await deleteVendedor(id)
      if (result.success) {
        toast.success('Vendedor eliminado')
        onCambio?.()
      } else {
        toast.error(result.error || 'No se pudo eliminar')
      }
    } catch (error) {
      console.error('Error eliminando vendedor:', error)
      toast.error('No se pudo eliminar el vendedor')
    }
  }

  return (
    <Modal titulo="Vendedores" subtitulo="Agentes de venta y sus datos de cobro" onClose={onClose} ancho="lg" pie={<Boton onClick={onClose}>Cerrar</Boton>}>
      <div className="space-y-5">
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <Tabla>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>WhatsApp</Th>
                <Th>Yape</Th>
                <Th>Vinculado</Th>
                <Th ancho={130}></Th>
              </tr>
            </thead>
            <tbody>
              {vendedores.length === 0 && <FilaVacia colSpan={5}>Todavía no hay vendedores</FilaVacia>}
              {vendedores.map(v => (
                <Fila key={v.id} seleccionada={editando?.id === v.id}>
                  <Td className="font-medium">{v.name}</Td>
                  <Td apagado>{v.phone || '—'}</Td>
                  <Td apagado>{v.yapeNumber || '—'}</Td>
                  <Td apagado>{v.linkedUserId ? 'Sí' : '—'}</Td>
                  <Td alinear="der">
                    <div className="flex justify-end gap-1">
                      <Boton tamano="sm" onClick={() => editar(v)}>Editar</Boton>
                      <Boton tamano="sm" variante="peligro" onClick={() => eliminar(v.id)}>Eliminar</Boton>
                    </div>
                  </Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
        </div>

        <div className="space-y-3 border-t border-gray-200 pt-4">
          <p className="text-[12.5px] font-medium text-gray-900">{editando ? `Editar ${editando.name}` : 'Nuevo vendedor'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo etiqueta="Nombre"><Entrada value={form.name} onChange={e => set('name', e.target.value)} placeholder="Luis Huamán" /></Campo>
            <Campo etiqueta="WhatsApp (con código de país)"><Entrada value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="51987654321" /></Campo>
            <Campo etiqueta="Número Yape"><Entrada value={form.yapeNumber} onChange={e => set('yapeNumber', e.target.value)} placeholder="987 654 321" /></Campo>
            <Campo etiqueta="Nombre en Yape"><Entrada value={form.yapeName} onChange={e => set('yapeName', e.target.value)} /></Campo>
            <Campo etiqueta="Cuenta BCP"><Entrada value={form.bcpAccount} onChange={e => set('bcpAccount', e.target.value)} /></Campo>
            <Campo etiqueta="CCI"><Entrada value={form.bcpCci} onChange={e => set('bcpCci', e.target.value)} /></Campo>
            <Campo etiqueta="Titular de la cuenta"><Entrada value={form.titular} onChange={e => set('titular', e.target.value)} /></Campo>
            <Campo etiqueta="Cuenta de usuario vinculada" ayuda="Así el vendedor ve sus clientes en «Mi suscripción».">
              <Selector value={form.linkedUserId} onChange={e => set('linkedUserId', e.target.value)}>
                <option value="">Sin vincular</option>
                {cuentas.map(c => (
                  <option key={c.id} value={c.id}>{c.businessName || c.email}{c.ruc ? ` (${c.ruc})` : ''}</option>
                ))}
              </Selector>
            </Campo>
          </div>
          <div className="flex justify-end gap-2">
            {editando && <Boton onClick={() => { setEditando(null); setForm(FORM_VACIO) }}>Cancelar</Boton>}
            <Boton variante="primario" onClick={guardar} disabled={guardando || !form.name.trim()}>
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear vendedor'}
            </Boton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
