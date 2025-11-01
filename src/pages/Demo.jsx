import { DemoProvider } from '@/contexts/DemoContext'
import Dashboard from './Dashboard'
import { Link } from 'react-router-dom'
import { LogIn, UserPlus } from 'lucide-react'

export default function Demo() {
  return (
    <DemoProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Demo Mode Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-full px-3 py-1 text-sm font-semibold">
                  MODO DEMO
                </div>
                <p className="text-sm sm:text-base">
                  Estás explorando Cobrify con datos de ejemplo
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="inline-flex items-center px-4 py-2 border border-white/30 rounded-md text-sm font-medium text-white hover:bg-white/10 transition-colors"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Iniciar Sesión
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center px-4 py-2 bg-white text-blue-600 rounded-md text-sm font-medium hover:bg-blue-50 transition-colors shadow-md"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Crear Cuenta Gratis
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Demo Layout - Similar to MainLayout but without auth */}
        <div className="flex h-[calc(100vh-60px)] bg-gray-50 overflow-hidden">
          {/* Sidebar will be handled by Dashboard's MainLayout wrapper */}
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Page Content */}
            <main className="flex-1 overflow-y-auto overscroll-none p-4 sm:p-6 custom-scrollbar">
              <div className="max-w-7xl mx-auto">
                <Dashboard isDemoMode={true} />
              </div>
            </main>
          </div>
        </div>

        {/* Info Footer */}
        <div className="bg-white border-t border-gray-200 py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center text-sm text-gray-600">
              <p className="mb-2">
                💡 <strong>Nota:</strong> Los datos que veas y las acciones que realices en este demo no se guardarán.
              </p>
              <p>
                ¿Listo para comenzar?{' '}
                <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
                  Crea tu cuenta gratis
                </Link>{' '}
                y empieza a facturar en minutos.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DemoProvider>
  )
}
