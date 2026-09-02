import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Campo, Selector } from '@/components/admin/ui'

export default function AsignarVendedorModal({ cuenta, vendedores, onClose, onGuardado }) {
  const toast = useToast()
  const [vendedorId, setVendedorId] = useState(cuenta.vendedorId || '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'subscriptions', cuenta.id), { vendedorId: vendedorId || null })
      toast.success(vendedorId ? 'Vendedor asignado' : 'Vendedor quitado')
      onGuardado?.({ vendedorId: vendedorId || null })
      onClose()
    } catch (error) {
      console.error('Error asignando vendedor:', error)
      toast.error('No se pudo asignar el vendedor')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      titulo="Vendedor"
      subtitulo={cuenta.businessName}
      onClose={onClose}
      ancho="sm"
      pie={
        <>
          <Boton onClick={onClose} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        </>
      }
    >
      <Campo
        etiqueta="Vendedor asignado"
        ayuda="Con vendedor, al suspenderse la cuenta ve los datos de pago del vendedor y las notificaciones de pago no muestran montos."
      >
        <Selector value={vendedorId} onChange={e => setVendedorId(e.target.value)} autoFocus>
          <option value="">Sin vendedor (Cobrify)</option>
          {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Selector>
      </Campo>
    </Modal>
  )
}
