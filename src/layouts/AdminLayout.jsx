import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Search, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TituloAdminContext } from '@/components/admin/ui/tituloAdmin'
import { useTema } from '@/utils/temaOscuro'
import BotonTema from '@/components/BotonTema'

// Menu del panel: una lista, solo texto, sin titulos de bloque. El Resumen
// va primero; la bandeja de WhatsApp (que vive fuera del panel) al final.
const ITEMS = [
  { path: '/app/admin/resumen', label: 'Resumen' },
  { path: '/app/admin/users', label: 'Usuarios' },
  { path: '/app/admin/resellers', label: 'Resellers' },
  { path: '/app/admin/payments', label: 'Pagos' },
  { path: '/app/admin/cpe', label: 'Comprobantes' },
  { path: '/app/admin/notifications', label: 'Notificaciones' },
  { path: '/app/admin/settings', label: 'Configuración' },
]

// Rutas que ya no estan en el menu pero siguen existiendo (o redirigen):
// asi la cabecera les pone nombre igual.
const TITULOS_SUELTOS = {
  '/app/admin/dashboard': 'Resumen',
  '/app/admin/analytics': 'Resumen',
  '/app/admin/investor-report': 'Resumen',
  '/app/admin/plan-distribution': 'Resumen',
  '/app/admin/expirations': 'Usuarios',
}

function Item({ item, onClick }) {
  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'block px-2.5 py-1.5 rounded-md text-[13px] transition-colors',
          isActive ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )
      }
    >
      {item.label}
    </NavLink>
  )
}

// La bandeja de WhatsApp vive fuera del panel, a pantalla completa: en el
// navegador se abre en otra pestana para no perder el admin; dentro de la app
// nativa no hay pestanas (y la base es relativa), asi que ahi se navega igual.
function EnlaceWhatsapp({ onClick }) {
  const clases = 'mt-3 block px-2.5 py-1.5 rounded-md text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900'
  const contenido = <>WhatsApp <span className="text-gray-400">↗</span></>

  if (Capacitor.isNativePlatform()) {
    return (
      <NavLink to="/chat" onClick={onClick} className={clases}>
        {contenido}
      </NavLink>
    )
  }

  return (
    <a href="/chat" target="_blank" rel="noopener noreferrer" onClick={onClick} className={clases}>
      {contenido}
    </a>
  )
}

function Menu_({ onNavegar }) {
  return (
    <nav className="px-3 py-3 space-y-px">
      {ITEMS.map(item => (
        <Item key={item.path} item={item} onClick={onNavegar} />
      ))}
      <EnlaceWhatsapp onClick={onNavegar} />
    </nav>
  )
}

export default function AdminLayout() {
  const { isAdmin, isLoading, user, logout } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [tituloPagina, setTituloPagina] = useState(null)
  const [tema, cambiarTema] = useTema('adminTema')

  const [busqueda, setBusqueda] = useState('')
  const buscadorRef = useRef(null)
  const location = useLocation()
  const navigate = useNavigate()

  // Cabecera blanca: iconos del status bar en oscuro. El color de fondo se
  // pinta con CSS (setBackgroundColor no hace nada desde Android 15).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    StatusBar.setStyle({ style: Style.Light })
      .catch(error => console.warn('Error configurando StatusBar admin:', error))
  }, [])

  // "/" enfoca el buscador de cuentas, salvo que ya se este escribiendo en un campo.
  useEffect(() => {
    const alTeclear = e => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      buscadorRef.current?.focus()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [])

  useEffect(() => {
    setMenuAbierto(false)
  }, [location.pathname])

  const setTitulo = useCallback(t => setTituloPagina(t), [])
  const contextoTitulo = useMemo(() => ({ setTitulo }), [setTitulo])

  const tituloMenu = useMemo(() => {
    const item = ITEMS.find(i => location.pathname.startsWith(i.path))
    if (item) return item.label
    const suelto = Object.keys(TITULOS_SUELTOS).find(p => location.pathname.startsWith(p))
    return suelto ? TITULOS_SUELTOS[suelto] : 'Admin'
  }, [location.pathname])

  const buscar = e => {
    e.preventDefault()
    const q = busqueda.trim()
    navigate(q ? `/app/admin/users?q=${encodeURIComponent(q)}` : '/app/admin/users')
    buscadorRef.current?.blur()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 font-admin text-[13px] text-gray-500">
        Cargando el panel…
      </div>
    )
  }

  if (!isAdmin) {
    return <Navigate to="/app/dashboard" replace />
  }

  const titulo = tituloPagina || tituloMenu

  return (
    <TituloAdminContext.Provider value={contextoTitulo}>
      <div className={cn('admin min-h-screen bg-gray-50 font-admin text-[13px] text-gray-900 antialiased', tema === 'oscuro' && 'oscuro')}>
        {/* Franja del status bar (safe-area), del mismo color que la cabecera. */}
        {Capacitor.isNativePlatform() && (
          <div className="bg-white" style={{ height: 'env(safe-area-inset-top, 0px)' }} />
        )}

        {/* Cabecera movil */}
        <div className="lg:hidden sticky top-0 z-40 h-12 bg-white border-b border-gray-200 px-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuAbierto(v => !v)}
            className="p-2 -ml-1 rounded-md text-gray-600 hover:bg-gray-100"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
          >
            {menuAbierto ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="text-[14px] font-semibold text-gray-900 truncate">{titulo}</span>
          <BotonTema tema={tema} onCambiar={cambiarTema} className="ml-auto -mr-1" />
        </div>

        {menuAbierto && (
          <div className="lg:hidden fixed inset-0 z-50 bg-gray-900/40 pt-safe" onClick={() => setMenuAbierto(false)}>
            <div
              className="bg-white w-64 h-full pt-safe flex flex-col border-r border-gray-200"
              onClick={e => e.stopPropagation()}
            >
              <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200">
                <span className="text-[13px] font-semibold text-gray-900">
                  Cobrify <span className="font-normal text-gray-400">Admin</span>
                </span>
                <button
                  type="button"
                  onClick={() => setMenuAbierto(false)}
                  className="p-1.5 -mr-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                  aria-label="Cerrar menú"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={buscar} className="relative px-3 pt-3">
                <Search className="absolute left-[22px] top-[21px] w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar cuenta, RUC, teléfono"
                  className="h-8 w-full rounded-md border border-gray-300 bg-white pl-8 pr-2.5 text-[12.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
                  aria-label="Buscar cuenta"
                />
              </form>
              <div className="flex-1 overflow-y-auto sidebar-scrollbar">
                <Menu_ onNavegar={() => setMenuAbierto(false)} />
              </div>
              <PieMenu user={user} logout={logout} irApp={() => navigate('/app')} />
            </div>
          </div>
        )}

        {/* Menu lateral (escritorio) */}
        <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-gray-200">
          <div className="h-12 flex items-center px-5 border-b border-gray-200">
            <span className="text-[13px] font-semibold text-gray-900">Cobrify</span>
            <span className="text-[13px] text-gray-400 ml-1.5">Admin</span>
          </div>
          <div className="flex-1 overflow-y-auto sidebar-scrollbar">
            <Menu_ />
          </div>
          <PieMenu user={user} logout={logout} irApp={() => navigate('/app')} />
        </aside>

        <main className="lg:pl-56 min-h-screen min-w-0">
          {/* Cabecera: titulo de la pagina y buscador global de cuentas */}
          <header className="hidden lg:flex sticky top-0 z-20 h-12 bg-white border-b border-gray-200 px-5 items-center justify-between gap-4">
            {/* min-w-0: sin el, el titulo no se encoge y empuja al buscador
                fuera de la pantalla con una razon social larga. */}
            <h1 className="min-w-0 truncate text-[14px] font-semibold text-gray-900" title={titulo}>{titulo}</h1>
            <div className="flex flex-none items-center gap-2">
              <form onSubmit={buscar} className="relative w-80">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  ref={buscadorRef}
                  type="search"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar cuenta, RUC, teléfono…   /"
                  className="h-8 w-full rounded-md border border-gray-300 bg-white pl-8 pr-2.5 text-[12.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
                  aria-label="Buscar cuenta"
                />
              </form>
              <BotonTema tema={tema} onCambiar={cambiarTema} />
            </div>
          </header>

          <div className="p-3 sm:p-4 lg:p-5 w-full max-w-full overflow-x-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </TituloAdminContext.Provider>
  )
}

function PieMenu({ user, logout, irApp }) {
  return (
    <div className="border-t border-gray-200 px-5 py-3 text-[12px]">
      <p className="truncate text-gray-500" title={user?.email}>{user?.email}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <button type="button" onClick={irApp} className="text-gray-500 hover:text-gray-900">
          Ir a la app
        </button>
        <button type="button" onClick={logout} className="text-gray-500 hover:text-gray-900">
          Salir
        </button>
      </div>
    </div>
  )
}
