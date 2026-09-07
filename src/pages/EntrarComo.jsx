import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'

/**
 * La pantalla que recibe el pase de soporte y entra a la cuenta del cliente.
 *
 * El pase viene detrás del `#` del enlace: eso NO viaja al servidor, así que
 * no queda en los registros del hosting. Se borra de la barra de direcciones
 * en cuanto se lee, para que no quede tampoco en el historial.
 *
 * Deja anotado en la pestaña de quién es la cuenta, y así la app pinta la
 * franja de aviso mientras dure la sesión. Al cerrar la ventana se va todo.
 */
export default function EntrarComo() {
  const navigate = useNavigate()
  const yaCorrio = useRef(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (yaCorrio.current) return
    yaCorrio.current = true

    const token = new URLSearchParams(window.location.hash.slice(1)).get('t')
    // Fuera de la barra de direcciones antes de hacer nada más.
    window.history.replaceState(null, '', window.location.pathname)

    if (!token) {
      setError('Al enlace le falta el pase. Pide uno nuevo desde el admin.')
      return
    }

    signInWithCustomToken(auth, token)
      .then((credencial) => credencial.user.getIdTokenResult())
      .then((resultado) => {
        try {
          sessionStorage.setItem('sesionSoporte', resultado.claims?.soporteNegocio || 'este cliente')
        } catch { /* sin sessionStorage la franja sale igual por el token */ }
        navigate('/app', { replace: true })
      })
      .catch((e) => {
        console.error('Error entrando con el pase de soporte:', e)
        setError(
          e?.code === 'auth/invalid-custom-token' || e?.code === 'auth/custom-token-mismatch'
            ? 'Ese pase no vale. Pide uno nuevo desde el admin.'
            : 'El pase venció. Duran una hora; pide uno nuevo desde el admin.',
        )
      })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900">No se pudo entrar</h1>
            <p className="mt-2 text-sm text-gray-600">{error}</p>
          </>
        ) : (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary-600" />
            <p className="mt-4 text-sm text-gray-600">Entrando a la cuenta…</p>
          </>
        )}
      </div>
    </div>
  )
}
