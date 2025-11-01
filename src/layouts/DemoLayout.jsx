import { Outlet, Link } from 'react-router-dom'
import { DemoProvider } from '@/contexts/DemoContext'
import { LogIn, UserPlus } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import { useEffect } from 'react'

export default function DemoLayout() {
  // Forzar overflow hidden en body y root
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    const root = document.getElementById('root')
    if (root) {
      root.style.overflow = 'hidden'
    }

    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
      if (root) {
        root.style.overflow = ''
      }
    }
  }, [])

  return (
    <DemoProvider>
      <div className="flex flex-col h-screen bg-gray-50" style={{ height: '100dvh' }}>
        {/* Demo Mode Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg z-50 flex-shrink-0 md:ml-64">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-center flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-full px-3 py-1 text-sm font-semibold">
                  MODO DEMO
                </div>
                <p className="text-sm sm:text-base">
                  Explorando Cobrify con datos de ejemplo
                </p>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Link
                  to="/login"
                  className="inline-flex items-center px-3 sm:px-4 py-2 border border-white/30 rounded-md text-xs sm:text-sm font-medium text-white hover:bg-white/10 transition-colors"
                >
                  <LogIn className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Iniciar Sesión</span>
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center px-3 sm:px-4 py-2 bg-white text-blue-600 rounded-md text-xs sm:text-sm font-medium hover:bg-blue-50 transition-colors shadow-md"
                >
                  <UserPlus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Crear Cuenta</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Same as MainLayout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <Sidebar />

          {/* Main Content */}
          <div className="flex-1 flex flex-col h-full overflow-hidden md:ml-64">
            {/* Navbar */}
            <Navbar />

            {/* Page Content */}
            <main className="flex-1 overflow-y-auto overscroll-none p-4 sm:p-6 custom-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <div className="max-w-7xl mx-auto">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>
    </DemoProvider>
  )
}
