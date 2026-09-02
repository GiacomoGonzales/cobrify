import { useState } from 'react'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Casilla, Aviso } from '@/components/admin/ui'

const URL_ELIMINAR = 'https://us-central1-cobrify-395fe.cloudfunctions.net/deleteUser'

// Borra la cuenta de Auth y sus documentos con la funcion deleteUser; con
// "tambien los datos" se lleva facturas, productos, clientes, almacenes…
export default function EliminarCuentaModal({ cuenta, onClose, onEliminada }) {
  const toast = useToast()
  const { user: admin } = useAuth()
  const [conDatos, setConDatos] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  async function eliminar() {
    if (!admin) return
    setEliminando(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const respuesta = await fetch(URL_ELIMINAR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ adminUid: admin.uid, userIdToDelete: cuenta.id, deleteData: conDatos }),
      })
      const resultado = await respuesta.json()
      if (resultado.success) {
        toast.success('Cuenta eliminada')
        onEliminada?.(cuenta.id)
        onClose()
      } else {
        toast.error(resultado.error || 'No se pudo eliminar la cuenta')
      }
    } catch (error) {
      console.error('Error eliminando la cuenta:', error)
      toast.error('No se pudo eliminar la cuenta')
    } finally {
      setEliminando(false)
    }
  }

  return (
    <Modal
      titulo="Eliminar cuenta"
      subtitulo={cuenta.businessName}
      onClose={onClose}
      ancho="sm"
      pie={
        <>
          <Boton onClick={onClose} disabled={eliminando}>Cancelar</Boton>
          <Boton variante="peligro" onClick={eliminar} disabled={eliminando}>{eliminando ? 'Eliminando…' : 'Eliminar cuenta'}</Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Aviso tono="rojo" titulo="No se puede deshacer">
          Se elimina la cuenta de acceso (Firebase Auth) y el documento del usuario.
        </Aviso>
        <p className="text-[12.5px] text-gray-700">
          {cuenta.businessName} · {cuenta.email}{cuenta.ruc ? ` · RUC ${cuenta.ruc}` : ''}
        </p>
        <Casilla
          etiqueta="Eliminar también los datos del negocio"
          ayuda="Facturas, productos, clientes, almacenes y demás información."
          checked={conDatos}
          onChange={e => setConDatos(e.target.checked)}
        />
      </div>
    </Modal>
  )
}
