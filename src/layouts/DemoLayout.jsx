import { Outlet, useParams } from 'react-router-dom'
import { DemoProvider } from '@/contexts/DemoContext'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import { useEffect } from 'react'
import { useBranding } from '@/contexts/BrandingContext'
import { useStore } from '@/stores/useStore'

export default function DemoLayout() {
  // /demo/:rubro → el demo se arma con el catálogo de ese rubro.
  // /demo a secas → rubro undefined → demo genérico de siempre.
  const { rubro } = useParams()
  const { branding } = useBranding()
  const sidebarCollapsed = useStore(state => state.sidebarCollapsed)
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
    <DemoProvider rubro={rubro || null}>
      <div className="flex flex-col h-screen bg-gray-50" style={{ height: '100dvh' }}>
        {/* iOS Status Bar - Gradiente moderno */}
        <div
          className="ios-status-bar md:hidden flex-shrink-0"
          style={{ background: `linear-gradient(to right, ${branding.primaryColor}, ${branding.secondaryColor || branding.primaryColor})` }}
        />

        {/* El indicador de modo demo ahora vive dentro del Navbar (badge sutil),
            no como una cinta aparte que ocupaba una fila y descuadraba el layout. */}

        {/* Main Content - Same as MainLayout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <Sidebar />

          {/* Main Content */}
          <div className={`flex-1 flex flex-col h-full overflow-hidden ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
            {/* Navbar */}
            <Navbar />

            {/* Page Content */}
            <main className="flex-1 overflow-y-auto overscroll-none p-2 sm:p-4 custom-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </DemoProvider>
  )
}
