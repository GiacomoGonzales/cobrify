import { Outlet } from 'react-router-dom'
import { DemoLogisticsProvider } from '@/contexts/DemoLogisticsContext'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import { useEffect } from 'react'
import { useBranding } from '@/contexts/BrandingContext'
import { useStore } from '@/stores/useStore'

export default function DemoLogisticsLayout() {
  const { branding } = useBranding()
  const sidebarCollapsed = useStore(state => state.sidebarCollapsed)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const root = document.getElementById('root')
    if (root) root.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
      if (root) root.style.overflow = ''
    }
  }, [])

  return (
    <DemoLogisticsProvider>
      <div className="flex flex-col h-screen bg-gray-50" style={{ height: '100dvh' }}>
        <div
          className="ios-status-bar md:hidden flex-shrink-0"
          style={{ background: `linear-gradient(to right, ${branding.primaryColor}, ${branding.secondaryColor || branding.primaryColor})` }}
        />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <div className={`flex-1 flex flex-col h-full overflow-hidden ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
            <Navbar />
            <main className="flex-1 overflow-y-auto overscroll-none p-2 sm:p-4 custom-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </DemoLogisticsProvider>
  )
}
