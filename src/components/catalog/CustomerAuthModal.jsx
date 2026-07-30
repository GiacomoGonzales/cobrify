import { useState } from 'react'
import { X, Loader2, Mail, Lock, User, Phone, AlertCircle } from 'lucide-react'
import {
  catalogSignInWithGoogle,
  catalogSignInWithEmail,
  catalogRegisterWithEmail,
  catalogSendPasswordReset,
} from '@/services/catalogCustomerService'

/**
 * Login/registro OPCIONAL del comprador en el catálogo público.
 * Métodos: Google y correo+contraseña (decisión 28-jul-2026).
 *
 * Nunca bloquea la compra: se abre solo si el cliente lo pide desde el menú.
 * El texto deja claro que puede seguir comprando sin cuenta.
 */
export default function CustomerAuthModal({ isOpen, onClose, businessId, accent = '#10B981', onSuccess }) {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (!isOpen) return null

  const reset = () => {
    setEmail(''); setPassword(''); setName(''); setPhone('')
    setError(''); setInfo(''); setBusy(false); setMode('login')
  }

  const handleClose = () => {
    if (busy) return
    reset()
    onClose()
  }

  const finish = (result) => {
    if (result.success) {
      reset()
      onSuccess?.(result.user)
      onClose()
    } else {
      setError(result.error)
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    setBusy(true); setError(''); setInfo('')
    finish(await catalogSignInWithGoogle(businessId))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(''); setInfo('')

    if (mode === 'reset') {
      const result = await catalogSendPasswordReset(email)
      if (result.success) {
        setInfo('Te enviamos un correo para crear una contraseña nueva.')
        setBusy(false)
      } else {
        setError(result.error)
        setBusy(false)
      }
      return
    }

    if (mode === 'register') {
      if (!name.trim()) { setError('Escribe tu nombre'); setBusy(false); return }
      const result = await catalogRegisterWithEmail(businessId, { email, password, name: name.trim(), phone: phone.trim() })
      // El correo ya existía y la contraseña no coincidió (o la cuenta usa
      // Google): pasamos a modo iniciar sesión conservando el correo escrito,
      // en vez de dejarlo trabado en un error que no entiende.
      if (result.needsLogin) {
        setMode('login')
        setPassword('')
        setError(result.error)
        setBusy(false)
        return
      }
      finish(result)
      return
    }

    finish(await catalogSignInWithEmail(businessId, email, password))
  }

  const title = mode === 'register' ? 'Crear cuenta' : mode === 'reset' ? 'Recuperar contraseña' : 'Iniciar sesión'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={handleClose} className="p-1.5 -mr-1.5 text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="px-5 mt-1 text-xs text-gray-500">
          Tu cuenta guarda tus pedidos y direcciones. Puedes seguir comprando sin registrarte.
        </p>

        <div className="p-5 space-y-4">
          {mode !== 'reset' && (
            <>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                {/* Logo oficial de Google */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continuar con Google
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">o con tu correo</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && (
              <>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="Celular (opcional)"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                </div>
              </>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                required
                placeholder="Correo electrónico"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              />
            </div>

            {mode !== 'reset' && (
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  required
                  placeholder="Contraseña"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
            )}

            {error && (
              <p className="flex items-start gap-1.5 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </p>
            )}
            {info && <p className="text-xs text-emerald-700">{info}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: accent }}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'register' ? 'Crear cuenta' : mode === 'reset' ? 'Enviar correo' : 'Entrar'}
            </button>
          </form>

          <div className="text-center text-xs text-gray-500 space-y-1.5">
            {mode === 'login' && (
              <>
                <p>
                  ¿No tienes cuenta?{' '}
                  <button type="button" onClick={() => { setMode('register'); setError('') }} className="font-semibold" style={{ color: accent }}>
                    Regístrate
                  </button>
                </p>
                <p>
                  <button type="button" onClick={() => { setMode('reset'); setError('') }} className="hover:underline">
                    Olvidé mi contraseña
                  </button>
                </p>
              </>
            )}
            {mode !== 'login' && (
              <button type="button" onClick={() => { setMode('login'); setError(''); setInfo('') }} className="hover:underline">
                Volver a iniciar sesión
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
