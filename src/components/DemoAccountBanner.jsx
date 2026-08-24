import { useState } from 'react'
import { AlertTriangle, X, LogOut } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { esCuentaDemo, logout } from '@/services/authService'

/**
 * Aviso permanente cuando la sesión abierta es la cuenta de DEMOSTRACIÓN.
 *
 * La cuenta demo es compartida y se abre en el celular de cualquiera durante
 * una venta o una prueba. Sin este aviso, quien la encuentra abierta cree que
 * está viendo SU negocio: pasó con una clienta que reportó "me apareció una
 * cuenta que no era mía" (24-ago-2026). Las ventas que veía eran las de la
 * demo, con RUC 20000000000.
 *
 * Se puede ocultar por si estorba en una demostración en vivo, pero vuelve a
 * aparecer en la siguiente carga: es un aviso, no una notificación.
 */
export default function DemoAccountBanner() {
  const { user } = useAppContext()
  const [oculto, setOculto] = useState(false)

  if (!user?.email || !esCuentaDemo(user.email) || oculto) return null

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center gap-3 text-sm">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <p className="flex-1 min-w-0">
        <strong>Cuenta de demostración.</strong>{' '}
        <span className="hidden sm:inline">
          Lo que ves aquí son datos de prueba, no tu negocio. Cierra sesión y entra con tu usuario para ver tus ventas.
        </span>
        <span className="sm:hidden">Datos de prueba, no es tu negocio.</span>
      </p>
      <button
        type="button"
        onClick={() => logout()}
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/10 hover:bg-amber-950/20 font-medium transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
        Salir
      </button>
      <button
        type="button"
        onClick={() => setOculto(true)}
        className="flex-shrink-0 p-1 rounded hover:bg-amber-950/10"
        aria-label="Ocultar aviso"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
