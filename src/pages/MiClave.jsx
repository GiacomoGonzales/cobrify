/**
 * CAMBIAR MI CONTRASEÑA — para cualquier usuario, sin permisos de por medio.
 *
 * La misma operación existe en Configuración > Cuenta y seguridad, pero esa
 * pantalla está detrás del permiso de Configuración: un cajero o un mozo no la
 * ve. Hasta ahora, la única forma de que un empleado cambiara su clave era
 * pedírselo al dueño — o sea, una contraseña que su propio dueño no controla, y
 * que el jefe conoce. Lo pidió Mandil.
 *
 * Las reglas del cambio están en `utils/cambioDeContrasena`, compartidas con la
 * pantalla de Configuración.
 */
import { useState } from 'react'
import { KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react'
import { getAuth } from 'firebase/auth'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useToast } from '@/contexts/ToastContext'
import { useAppContext } from '@/hooks/useAppContext'
import { cambiarMiContrasena, LARGO_MINIMO } from '@/utils/cambioDeContrasena'

export default function MiClave() {
  const toast = useToast()
  const { user, isDemoMode } = useAppContext()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [verClaves, setVerClaves] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    if (isDemoMode) {
      toast.error('En el demo no se pueden cambiar contraseñas')
      return
    }
    setGuardando(true)
    try {
      const resultado = await cambiarMiContrasena(getAuth(), { actual, nueva, repetida })
      if (!resultado.ok) {
        toast.error(resultado.error)
        return
      }
      setActual('')
      setNueva('')
      setRepetida('')
      toast.success('Listo, tu contraseña quedó cambiada. Úsala la próxima vez que entres.')
    } finally {
      setGuardando(false)
    }
  }

  const tipo = verClaves ? 'text' : 'password'

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cambiar contraseña</h1>
        <p className="text-sm text-gray-500 mt-1">
          La contraseña con la que entras al sistema. Solo la cambias tú.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-gray-400" />
            {user?.email || 'Mi cuenta'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4">
            <Input
              type={tipo}
              label="Contraseña actual"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              autoComplete="current-password"
              placeholder="La que usas hoy"
            />
            <Input
              type={tipo}
              label="Contraseña nueva"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              autoComplete="new-password"
              placeholder={`Al menos ${LARGO_MINIMO} caracteres`}
            />
            <Input
              type={tipo}
              label="Repite la contraseña nueva"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              autoComplete="new-password"
              placeholder="La misma de arriba"
            />

            <button
              type="button"
              onClick={() => setVerClaves(v => !v)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            >
              {verClaves ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {verClaves ? 'Ocultar las contraseñas' : 'Ver lo que estoy escribiendo'}
            </button>

            <Button type="submit" disabled={guardando} className="w-full">
              {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {guardando ? 'Cambiando...' : 'Cambiar contraseña'}
            </Button>
          </form>

          <p className="text-xs text-gray-500 mt-4">
            Si no recuerdas tu contraseña actual, pídele al dueño del negocio que te ponga una
            nueva desde Gestión de usuarios.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
