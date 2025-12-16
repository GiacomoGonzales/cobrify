import { Outlet } from 'react-router-dom'
import { DemoRestaurantProvider } from '@/contexts/DemoRestaurantContext'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import { useEffect } from 'react'
import { useBranding } from '@/contexts/BrandingContext'

export default function DemoRestaurantLayout() {
  const { branding } = useBranding()

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
    <DemoRestaurantProvider>
      <div className="flex flex-col h-screen bg-gray-50" style={{ height: '100dvh' }}>
        {/* iOS Status Bar - Gradiente moderno */}
        <div
          className="ios-status-bar md:hidden flex-shrink-0"
          style={{ background: `linear-gradient(to right, ${branding.primaryColor}, ${branding.secondaryColor || branding.primaryColor})` }}
        />

        {/* Demo Mode Banner */}
        <div
          className="text-white shadow-sm z-50 flex-shrink-0 md:ml-64"
          style={{ background: `linear-gradient(to right, ${branding.primaryColor}, ${branding.secondaryColor || branding.primaryColor})` }}
        >
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2">
                <div className="bg-white/20 rounded-full px-2 py-0.5 text-xs font-semibold">
                  DEMO RESTAURANTE
                </div>
                <p className="text-xs sm:text-sm">
                  Explorando {branding.companyName} - Modo Restaurante
                </p>
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
            <main className="flex-1 overflow-y-auto overscroll-none p-2 sm:p-4 custom-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </DemoRestaurantProvider>
  )
}
