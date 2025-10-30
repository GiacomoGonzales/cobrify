import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Search, User, LogOut, Menu, FileText, Users, Package, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useStore } from '@/stores/useStore'
import { getInvoices, getCustomers, getProducts } from '@/services/firestoreService'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getUnreadNotifications, checkAndCreateSubscriptionNotifications } from '@/services/notificationService'
import NotificationPanel from './NotificationPanel'
import Button from './ui/Button'

export default function Navbar() {
  const { user, logout, subscription } = useAuth()
  const { toggleMobileMenu } = useStore()
  const navigate = useNavigate()

  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState({ invoices: [], customers: [], products: [] })
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showMobileSearch, setShowMobileSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const desktopSearchRef = useRef(null)
  const mobileSearchRef = useRef(null)
  const notificationRef = useRef(null)

  // Cargar notificaciones no leídas
  useEffect(() => {
    const loadUnreadCount = async () => {
      if (!user?.uid) return;

      try {
        const unreadNotifications = await getUnreadNotifications(user.uid);
        setUnreadCount(unreadNotifications.length);
      } catch (error) {
        console.error('Error al cargar notificaciones:', error);
      }
    };

    loadUnreadCount();

    // Verificar y crear notificaciones de suscripción
    if (user?.uid && subscription) {
      checkAndCreateSubscriptionNotifications(user.uid, subscription);
    }

    // Actualizar cada 5 minutos
    const interval = setInterval(loadUnreadCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.uid, subscription]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (desktopSearchRef.current && !desktopSearchRef.current.contains(event.target)) {
        setShowResults(false)
      }
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(event.target)) {
        setShowMobileSearch(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced search
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setSearchResults({ invoices: [], customers: [], products: [] })
      setShowResults(false)
      return
    }

    const timeoutId = setTimeout(() => {
      performSearch(searchTerm)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchTerm, user?.uid])

  const performSearch = async (term) => {
    if (!user?.uid) return

    setIsSearching(true)
    try {
      const [invoicesResult, customersResult, productsResult] = await Promise.all([
        getInvoices(user.uid),
        getCustomers(user.uid),
        getProducts(user.uid),
      ])

      const lowerTerm = term.toLowerCase()

      // Filter invoices
      const filteredInvoices = (invoicesResult.data || [])
        .filter(inv =>
          inv.number?.toLowerCase().includes(lowerTerm) ||
          inv.customerName?.toLowerCase().includes(lowerTerm) ||
          inv.customerDocumentNumber?.includes(lowerTerm) ||
          inv.total?.toString().includes(lowerTerm)
        )
        .slice(0, 5)

      // Filter customers
      const filteredCustomers = (customersResult.data || [])
        .filter(customer =>
          customer.name?.toLowerCase().includes(lowerTerm) ||
          customer.documentNumber?.includes(lowerTerm) ||
          customer.businessName?.toLowerCase().includes(lowerTerm) ||
          customer.email?.toLowerCase().includes(lowerTerm)
        )
        .slice(0, 5)

      // Filter products
      const filteredProducts = (productsResult.data || [])
        .filter(product =>
          product.name?.toLowerCase().includes(lowerTerm) ||
          product.code?.toLowerCase().includes(lowerTerm)
        )
        .slice(0, 5)

      setSearchResults({
        invoices: filteredInvoices,
        customers: filteredCustomers,
        products: filteredProducts,
      })

      setShowResults(true)
    } catch (error) {
      console.error('Error al buscar:', error)
    } finally {
      setIsSearching(false)
    }
  }

  const handleResultClick = useCallback((type, id) => {
    setSearchTerm('')
    setShowResults(false)
    setShowMobileSearch(false)

    if (type === 'invoice') {
      navigate('/facturas')
    } else if (type === 'customer') {
      navigate('/clientes')
    } else if (type === 'product') {
      navigate('/productos')
    }
  }, [navigate])

  const hasResults = searchResults.invoices.length > 0 ||
                     searchResults.customers.length > 0 ||
                     searchResults.products.length > 0

  // Render results dropdown
  const renderResults = () => {
    if (!showResults || !searchTerm) return null

    return (
      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
        {isSearching ? (
          <div className="p-4 text-center text-gray-500">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-sm">Buscando...</p>
          </div>
        ) : hasResults ? (
          <>
            {/* Invoices */}
            {searchResults.invoices.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 uppercase flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Facturas ({searchResults.invoices.length})
                  </p>
                </div>
                {searchResults.invoices.map((invoice) => (
                  <button
                    key={invoice.id}
                    onClick={() => handleResultClick('invoice', invoice.id)}
                    className="w-full px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-100 last:border-b-0"
                  >
                    <p className="font-medium text-gray-900">{invoice.number}</p>
                    <p className="text-sm text-gray-600">{invoice.customerName || 'Sin cliente'}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(invoice.total)}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Customers */}
            {searchResults.customers.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 uppercase flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Clientes ({searchResults.customers.length})
                  </p>
                </div>
                {searchResults.customers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => handleResultClick('customer', customer.id)}
                    className="w-full px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-100 last:border-b-0"
                  >
                    <p className="font-medium text-gray-900">{customer.name}</p>
                    <p className="text-sm text-gray-600">{customer.documentNumber}</p>
                    {customer.email && (
                      <p className="text-sm text-gray-500">{customer.email}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Products */}
            {searchResults.products.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 uppercase flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Productos ({searchResults.products.length})
                  </p>
                </div>
                {searchResults.products.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleResultClick('product', product.id)}
                    className="w-full px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-100 last:border-b-0"
                  >
                    <p className="font-medium text-gray-900">{product.name}</p>
                    <p className="text-sm text-gray-600">Código: {product.code || 'N/A'}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(product.price)}</p>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="p-4 text-center text-gray-500">
            <p className="text-sm">No se encontraron resultados para "{searchTerm}"</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <header className="sticky top-0 z-40 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
      {/* Left Side - Mobile Menu Button */}
      <div className="flex items-center space-x-3 flex-1">
        <button
          onClick={toggleMobileMenu}
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-6 h-6 text-gray-600" />
        </button>

        {/* Search Bar - Hidden on small mobile */}
        <div className="hidden sm:block flex-1 max-w-md">
          <div className="relative" ref={desktopSearchRef}>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar facturas, clientes, productos..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {renderResults()}
          </div>
        </div>
      </div>

      {/* Mobile Search Modal */}
      {showMobileSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 sm:hidden">
          <div className="bg-white p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1">
                <div className="relative" ref={mobileSearchRef}>
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar facturas, clientes, productos..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    autoFocus
                  />
                  {renderResults()}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowMobileSearch(false)
                  setSearchTerm('')
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right Side */}
      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Search Button for Mobile */}
        <button
          onClick={() => setShowMobileSearch(true)}
          className="sm:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Search className="w-5 h-5 text-gray-600" />
        </button>

        {/* Notifications */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-5 h-5 text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            )}
          </button>

          {/* Panel de notificaciones */}
          <NotificationPanel
            userId={user?.uid}
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
          />
        </div>

        {/* User Menu */}
        <div className="flex items-center space-x-2 sm:space-x-3 pl-2 sm:pl-4 border-l border-gray-200">
          {/* User info - Hidden on mobile */}
          <div className="hidden md:block text-right">
            <p className="text-sm font-medium text-gray-900">{user?.displayName || user?.email?.split('@')[0] || 'Usuario'}</p>
            <p className="text-xs text-gray-500">{user?.email || 'usuario@ejemplo.com'}</p>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2">
            <button className="p-2 rounded-lg bg-primary-100 text-primary-600">
              <User className="w-5 h-5" />
            </button>

            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
