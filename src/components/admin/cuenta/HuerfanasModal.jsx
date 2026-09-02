import { useState } from 'react'
import { doc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Tabla, Th, Td, Fila, FilaVacia } from '@/components/admin/ui'

// Suscripciones sin negocio ni usuario: casi siempre sub-usuarios mal creados.
export default function HuerfanasModal({ huerfanas, onClose, onEliminada }) {
  const toast = useToast()
  const [eliminando, setEliminando] = useState(null)

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar esta suscripción huérfana? No se puede deshacer.')) return
    setEliminando(id)
    try {
      await deleteDoc(doc(db, 'subscriptions', id))
      onEliminada?.(id)
      toast.success('Suscripción eliminada')
    } catch (error) {
      console.error('Error eliminando la suscripción huérfana:', error)
      toast.error('No se pudo eliminar')
    } finally {
      setEliminando(null)
    }
  }

  return (
    <Modal
      titulo={`Suscripciones huérfanas (${huerfanas.length})`}
      subtitulo="Sin negocio o sin documento de usuario"
      onClose={onClose}
      ancho="lg"
      pie={<Boton onClick={onClose}>Cerrar</Boton>}
    >
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <Tabla>
          <thead>
            <tr>
              <Th>Correo</Th>
              <Th>Plan</Th>
              <Th>Estado</Th>
              <Th>Motivo</Th>
              <Th alinear="der">Creada</Th>
              <Th ancho={90}></Th>
            </tr>
          </thead>
          <tbody>
            {huerfanas.length === 0 && <FilaVacia colSpan={6}>No hay suscripciones huérfanas</FilaVacia>}
            {huerfanas.map(h => (
              <Fila key={h.id}>
                <Td>
                  <div className="font-medium">{h.email || h.displayName || '(sin correo)'}</div>
                  <div className="font-mono text-[11px] text-gray-400">{h.id}</div>
                </Td>
                <Td apagado>{h.plan || '—'}</Td>
                <Td apagado>{h.status || '—'}</Td>
                <Td apagado className="whitespace-normal">{h.reason}</Td>
                <Td numero apagado>{h.createdAt ? h.createdAt.toLocaleDateString('es-PE') : '—'}</Td>
                <Td alinear="der">
                  <Boton tamano="sm" variante="peligro" onClick={() => eliminar(h.id)} disabled={eliminando === h.id}>
                    {eliminando === h.id ? '…' : 'Eliminar'}
                  </Boton>
                </Td>
              </Fila>
            ))}
          </tbody>
        </Tabla>
      </div>
    </Modal>
  )
}
