import { useState } from 'react'
import { updateUserFeatures } from '@/services/subscriptionService'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Casilla } from '@/components/admin/ui'

// Funciones especiales de una cuenta, adicionales al plan contratado.
// (expenseManagement se elimino el 14-ago-2026: Gastos es para todos.)
export const FUNCIONES = [
  { clave: 'productImages', etiqueta: 'Fotos de productos', ayuda: 'Permite subir fotos a los productos.' },
  { clave: 'hidePaymentMethods', etiqueta: 'Ocultar métodos de pago', ayuda: 'Solo efectivo en el POS; se oculta el selector.' },
  { clave: 'loans', etiqueta: 'Préstamos', ayuda: 'Módulo de préstamos bancarios y de terceros.' },
  { clave: 'certificates', etiqueta: 'Certificados', ayuda: 'Certificados de extintores (operatividad y capacitación).' },
  { clave: 'bulkDelete', etiqueta: 'Eliminación masiva', ayuda: 'Limpieza masiva de productos, ventas, clientes… Peligroso.' },
]

export default function FuncionesModal({ cuenta, onClose, onGuardado }) {
  const toast = useToast()
  const [form, setForm] = useState(() =>
    Object.fromEntries(FUNCIONES.map(f => [f.clave, cuenta.features?.[f.clave] || false]))
  )
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    try {
      await updateUserFeatures(cuenta.id, form)
      toast.success('Funciones actualizadas')
      onGuardado?.(form)
      onClose()
    } catch (error) {
      console.error('Error guardando funciones:', error)
      toast.error('No se pudieron guardar las funciones')
    } finally {
      setGuardando(false)
    }
  }

  const pie = (
    <>
      <Boton onClick={onClose} disabled={guardando}>Cancelar</Boton>
      <Boton variante="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
    </>
  )

  return (
    <Modal titulo="Funciones especiales" subtitulo={cuenta.businessName} onClose={onClose} pie={pie} ancho="sm">
      <div className="space-y-3">
        {FUNCIONES.map(f => (
          <Casilla
            key={f.clave}
            etiqueta={f.etiqueta}
            ayuda={f.ayuda}
            checked={!!form[f.clave]}
            onChange={e => setForm(prev => ({ ...prev, [f.clave]: e.target.checked }))}
          />
        ))}
      </div>
    </Modal>
  )
}
