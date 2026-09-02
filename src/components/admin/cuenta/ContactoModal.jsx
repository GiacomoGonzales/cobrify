import { useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Campo, Entrada } from '@/components/admin/ui'

// Nombre del contacto (users.displayName) y WhatsApp del dueno
// (businesses.contactPhone, uso interno: no es el telefono del ticket).
export default function ContactoModal({ cuenta, onClose, onGuardado }) {
  const toast = useToast()
  const [nombre, setNombre] = useState(cuenta.contactName || '')
  const [telefono, setTelefono] = useState(cuenta.contactPhone || '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    try {
      await setDoc(doc(db, 'users', cuenta.id), { displayName: nombre.trim() }, { merge: true })
      await setDoc(doc(db, 'businesses', cuenta.id), { contactPhone: telefono.trim() }, { merge: true })
      toast.success('Contacto guardado')
      onGuardado?.({ contactName: nombre.trim(), contactPhone: telefono.trim() })
      onClose()
    } catch (error) {
      console.error('Error guardando el contacto:', error)
      toast.error('No se pudo guardar el contacto')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      titulo="Contacto del dueño"
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
      <div className="space-y-3">
        <Campo etiqueta="Nombre">
          <Entrada value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Juan Pérez" autoFocus />
        </Campo>
        <Campo etiqueta="WhatsApp del dueño" ayuda="Para contactarlo. No se imprime en el ticket.">
          <Entrada type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="987654321" />
        </Campo>
        <p className="text-[11.5px] text-gray-500">
          Correo: {cuenta.email}{cuenta.phone ? ` · Teléfono del local (ticket): ${cuenta.phone}` : ''}
        </p>
      </div>
    </Modal>
  )
}
