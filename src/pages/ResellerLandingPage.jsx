import { Link } from 'react-router-dom'
import { FileText, ShoppingCart, BarChart3, Package, Users, TrendingUp, Check, Shield, Zap, Clock, MessageCircle, Play, Store, UtensilsCrossed } from 'lucide-react'
import Button from '@/components/ui/Button'

/**
 * Landing page personalizada para resellers
 * Recibe los datos del reseller como props y muestra la landing con su branding
 */
export default function ResellerLandingPage({ reseller }) {
  // Datos del reseller con valores por defecto
  const brandName = reseller?.branding?.companyName || reseller?.companyName || 'Sistema de Facturación'
  const logoUrl = reseller?.branding?.logoUrl || '/logo.png'
  const primaryColor = reseller?.branding?.primaryColor || '#2563eb'
  const secondaryColor = reseller?.branding?.secondaryColor || '#1d4ed8'
  const whatsapp = reseller?.branding?.whatsapp || reseller?.phone || ''

  // Precios dinámicos
  const priceMonthly = reseller?.branding?.priceMonthly ?? 19.90
  const priceSemester = reseller?.branding?.priceSemester ?? 99.90
  const priceAnnual = reseller?.branding?.priceAnnual ?? 149.90

  // Calcular ahorros
  const savingSemester = (priceMonthly * 6) - priceSemester
  const savingSemesterPercent = Math.round((savingSemester / (priceMonthly * 6)) * 100)
  const savingAnnual = (priceMonthly * 12) - priceAnnual
  const savingAnnualPercent = Math.round((savingAnnual / (priceMonthly * 12)) * 100)

  // Formatear número de WhatsApp (quitar espacios, guiones, etc.)
  const whatsappNumber = whatsapp.replace(/[^0-9]/g, '')
  const whatsappLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber.startsWith('51') ? whatsappNumber : '51' + whatsappNumber}?text=Hola%2C%20quiero%20información%20sobre%20${encodeURIComponent(brandName)}`
    : null

  // Estilo dinámico para colores del reseller
  const heroStyle = {
    background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
  }

  const buttonPrimaryStyle = {
    backgroundColor: primaryColor,
    borderColor: primaryColor
  }

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* WhatsApp Floating Button */}
      {whatsappLink && (
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 group"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75"></div>
            <div className="absolute inset-0 bg-green-400 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <div className="relative w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-all duration-300 cursor-pointer">
              <MessageCircle className="w-8 h-8 text-white" fill="white" />
            </div>
          </div>
        </a>
      )}

      {/* Header / Navigation */}
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-lg z-50 border-b border-gray-200/50">
        <nav className="container mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center group">
              <img
                src={logoUrl}
                alt={brandName}
                className="h-24 w-auto object-contain transform group-hover:scale-105 transition-transform"
                onError={(e) => { e.target.src = '/logo.png' }}
              />
            </Link>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-700 hover:opacity-80 font-medium transition-colors" style={{ '--hover-color': primaryColor }}>
                Características
              </a>
              <a href="#demo" className="text-gray-700 hover:opacity-80 font-medium transition-colors">
                Demos
              </a>
              <a href="#benefits" className="text-gray-700 hover:opacity-80 font-medium transition-colors">
                Beneficios
              </a>
              <a href="#pricing" className="text-gray-700 hover:opacity-80 font-medium transition-colors">
                Precios
              </a>
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center space-x-3">
              <Link to="/login">
                <Button className="font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                  Iniciar Sesión
                </Button>
              </Link>
            </div>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="min-h-screen pt-36 pb-12 px-4 relative overflow-hidden flex items-center" style={heroStyle}>
        {/* Animated background patterns */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full">
            <svg className="absolute top-0 left-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" opacity="0.3"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        </div>

        <div className="container mx-auto max-w-6xl relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Hero Illustration */}
            <div className="flex justify-center items-center order-1 lg:order-2">
              <div className="relative w-[85%]">
                {/* Floating documents illustration */}
                <div className="relative">
                  {/* Background glow */}
                  <div className="absolute inset-0 bg-white/10 rounded-3xl blur-3xl"></div>

                  {/* Main document card */}
                  <div className="relative bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-6 transform hover:scale-105 transition-all duration-300 animate-float">
                    {/* Invoice header */}
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                          <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-800">FACTURA ELECTRÓNICA</div>
                          <div className="text-xs text-gray-500">F001-00001234</div>
                        </div>
                      </div>
                      <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        EMITIDA
                      </div>
                    </div>

                    {/* Invoice items mock */}
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gray-100 rounded"></div>
                          <div>
                            <div className="text-sm font-medium text-gray-700">Producto / Servicio</div>
                            <div className="text-xs text-gray-400">Cantidad: 2</div>
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-gray-800">S/ 150.00</div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gray-100 rounded"></div>
                          <div>
                            <div className="text-sm font-medium text-gray-700">Producto / Servicio</div>
                            <div className="text-xs text-gray-400">Cantidad: 1</div>
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-gray-800">S/ 85.00</div>
                      </div>
                    </div>

                    {/* Invoice total */}
                    <div className="pt-4 border-t border-gray-200">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-500">Subtotal</span>
                        <span className="text-sm text-gray-700">S/ 235.00</span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-500">IGV (18%)</span>
                        <span className="text-sm text-gray-700">S/ 42.30</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-base font-semibold text-gray-800">TOTAL</span>
                        <span className="text-xl font-bold" style={{ color: primaryColor }}>S/ 277.30</span>
                      </div>
                    </div>
                  </div>

                  {/* Floating elements around the card */}
                  <div className="absolute -top-4 -right-4 w-16 h-16 bg-white/90 rounded-xl shadow-lg flex items-center justify-center animate-bounce-slow">
                    <Check className="w-8 h-8 text-green-500" />
                  </div>

                  <div className="absolute -bottom-4 -left-4 w-14 h-14 bg-white/90 rounded-xl shadow-lg flex items-center justify-center animate-pulse">
                    <Shield className="w-7 h-7" style={{ color: primaryColor }} />
                  </div>

                  <div className="absolute top-1/2 -right-8 w-12 h-12 bg-white/80 rounded-lg shadow-lg flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-blue-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Text */}
            <div className="text-white order-2 lg:order-1">
              <h1 className="text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                Facturación Electrónica para tu Negocio
              </h1>
              <p className="text-xl opacity-90 mb-8 leading-relaxed">
                Sistema completo de facturación homologado con SUNAT. Genera facturas, boletas,
                notas de crédito y gestiona tu negocio desde un solo lugar.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                {whatsappLink && (
                  <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="lg" className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-lg w-full sm:w-auto font-semibold text-white">
                      Contáctanos por WhatsApp
                    </Button>
                  </a>
                )}
              </div>
              <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:space-x-6 text-sm opacity-90">
                <div className="flex items-center space-x-2">
                  <Check className="w-5 h-5" />
                  <span>Homologado con SUNAT</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-5 h-5" />
                  <span>Soporte personalizado</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 relative bg-gradient-to-b from-gray-50 via-white to-gray-50">
        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Todo lo que necesitas para tu negocio
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Una solución completa para gestionar ventas, inventario, clientes y mucho más
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:-translate-y-1">
              <div className="relative">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-6 shadow-lg"
                  style={{ backgroundColor: primaryColor }}
                >
                  <FileText className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Facturación SUNAT
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Genera facturas, boletas, notas de crédito y débito homologadas con SUNAT.
                  Firma electrónica incluida.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:-translate-y-1">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                  <ShoppingCart className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Punto de Venta (POS)
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Interfaz rápida e intuitiva para procesar ventas. Ideal para tiendas,
                  restaurantes y negocios al por menor.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:-translate-y-1">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                  <Package className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Gestión de Inventario
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Control total de tu inventario. Múltiples almacenes, movimientos automáticos
                  y alertas de stock bajo.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:-translate-y-1">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                  <Users className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Gestión de Clientes
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Base de datos completa de clientes con historial de compras,
                  estadísticas y análisis detallados.
                </p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:-translate-y-1">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                  <BarChart3 className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Reportes y Análisis
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Dashboards intuitivos con métricas en tiempo real. Reportes de ventas,
                  productos más vendidos y más.
                </p>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:-translate-y-1">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                  <TrendingUp className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Cotizaciones
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Crea cotizaciones profesionales y conviértelas en facturas con un solo clic.
                  Seguimiento de estado incluido.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-20 px-4 relative overflow-hidden" style={heroStyle}>
        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              Prueba el sistema ahora
            </h2>
            <p className="text-xl text-white/90 max-w-2xl mx-auto">
              Explora todas las funcionalidades sin necesidad de registrarte
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Demo Tienda */}
            <Link to="/demo" className="group">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border-2 border-white/20 hover:bg-white/20 hover:border-white/40 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
                    <Store className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Demo Tienda</h3>
                    <p className="text-white/80">Retail y comercio</p>
                  </div>
                </div>
                <p className="text-white/90 mb-6">
                  Ideal para tiendas, minimarkets, bodegas, ferreterías y cualquier negocio de venta al por menor.
                </p>
                <div className="flex items-center text-white font-semibold">
                  <Play className="w-5 h-5 mr-2" />
                  Probar Demo
                </div>
              </div>
            </Link>

            {/* Demo Restaurante */}
            <Link to="/demorestaurant" className="group">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border-2 border-white/20 hover:bg-white/20 hover:border-white/40 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
                    <UtensilsCrossed className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Demo Restaurante</h3>
                    <p className="text-white/80">Gastronomía y servicios</p>
                  </div>
                </div>
                <p className="text-white/90 mb-6">
                  Perfecto para restaurantes, cafeterías, pollerías y negocios gastronómicos con gestión de mesas.
                </p>
                <div className="flex items-center text-white font-semibold">
                  <Play className="w-5 h-5 mr-2" />
                  Probar Demo
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-gray-50 to-white"></div>

        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              ¿Por qué elegirnos?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Diseñado específicamente para negocios peruanos
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="group text-center">
              <div className="relative inline-block mb-4">
                <div
                  className="relative w-20 h-20 rounded-2xl flex items-center justify-center mx-auto transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Shield className="w-10 h-10 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">100% Homologado</h3>
              <p className="text-gray-600">Certificado por SUNAT</p>
            </div>

            <div className="group text-center">
              <div className="relative inline-block mb-4">
                <div className="relative w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                  <Zap className="w-10 h-10 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Rápido y Fácil</h3>
              <p className="text-gray-600">Interfaz intuitiva</p>
            </div>

            <div className="group text-center">
              <div className="relative inline-block mb-4">
                <div className="relative w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                  <Clock className="w-10 h-10 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">24/7 Disponible</h3>
              <p className="text-gray-600">Acceso en cualquier momento</p>
            </div>

            <div className="group text-center">
              <div className="relative inline-block mb-4">
                <div className="relative w-20 h-20 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                  <TrendingUp className="w-10 h-10 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Crece Contigo</h3>
              <p className="text-gray-600">Escalable a tu medida</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 bg-gradient-to-b from-white via-gray-50 to-white relative overflow-hidden">
        <div className="container mx-auto max-w-6xl text-center relative z-10">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Planes que se adaptan a tu negocio
          </h2>
          <p className="text-xl text-gray-600 mb-12">
            Todos los planes incluyen las mismas funcionalidades completas
          </p>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Plan Mensual */}
            <div className="relative bg-white p-8 rounded-2xl border-2 border-gray-200 hover:shadow-xl group">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Mensual</h3>
                <div className="flex items-baseline justify-center mb-2">
                  <span className="text-4xl font-bold text-gray-900">S/{priceMonthly.toFixed(2)}</span>
                  <span className="text-gray-600 ml-2">/mes</span>
                </div>
                <p className="text-sm text-gray-500">Pago mes a mes</p>
              </div>
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Facturación ilimitada SUNAT</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Control de stock completo</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Múltiples usuarios</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Soporte prioritario</span>
                </li>
              </ul>
              {whatsappLink ? (
                <a href={`${whatsappLink.replace('información', 'contratar el plan Mensual')}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full border-2 font-semibold" style={{ borderColor: primaryColor, color: primaryColor }}>
                    Contratar Plan
                  </Button>
                </a>
              ) : (
                <Link to="/login">
                  <Button variant="outline" className="w-full border-2 font-semibold" style={{ borderColor: primaryColor, color: primaryColor }}>
                    Comenzar
                  </Button>
                </Link>
              )}
            </div>

            {/* Plan Semestral - Destacado */}
            <div className="relative p-8 rounded-2xl shadow-2xl transform md:scale-105 border-4" style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`, borderColor: primaryColor }}>
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-gray-900 px-6 py-1.5 rounded-full text-sm font-bold shadow-lg">
                Más Popular
              </div>
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">Semestral</h3>
                <div className="flex items-baseline justify-center mb-2">
                  <span className="text-4xl font-bold text-white">S/{priceSemester.toFixed(2)}</span>
                  <span className="text-white/80 ml-2">/6 meses</span>
                </div>
                <p className="text-sm text-white/80">Ahorra S/{savingSemester.toFixed(2)} ({savingSemesterPercent}%)</p>
              </div>
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-start text-white">
                  <Check className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Facturación ilimitada SUNAT</span>
                </li>
                <li className="flex items-start text-white">
                  <Check className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Control de stock completo</span>
                </li>
                <li className="flex items-start text-white">
                  <Check className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Múltiples usuarios</span>
                </li>
                <li className="flex items-start text-white">
                  <Check className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Soporte prioritario</span>
                </li>
              </ul>
              {whatsappLink ? (
                <a href={`${whatsappLink.replace('información', 'contratar el plan Semestral')}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" className="w-full bg-white font-semibold shadow-lg" style={{ color: primaryColor }}>
                    Contratar Plan
                  </Button>
                </a>
              ) : (
                <Link to="/login">
                  <Button variant="ghost" className="w-full bg-white font-semibold shadow-lg" style={{ color: primaryColor }}>
                    Comenzar
                  </Button>
                </Link>
              )}
            </div>

            {/* Plan Anual */}
            <div className="relative bg-white p-8 rounded-2xl border-2 hover:shadow-xl group" style={{ borderColor: primaryColor }}>
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-1 rounded-full text-sm font-bold">
                Mejor Ahorro
              </div>
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Anual</h3>
                <div className="flex items-baseline justify-center mb-2">
                  <span className="text-4xl font-bold text-gray-900">S/{priceAnnual.toFixed(2)}</span>
                  <span className="text-gray-600 ml-2">/año</span>
                </div>
                <p className="text-sm text-green-600 font-semibold">Ahorra S/{savingAnnual.toFixed(2)} ({savingAnnualPercent}%)</p>
              </div>
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Facturación ilimitada SUNAT</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Control de stock completo</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Múltiples usuarios</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                  <span>Soporte prioritario</span>
                </li>
              </ul>
              {whatsappLink ? (
                <a href={`${whatsappLink.replace('información', 'contratar el plan Anual')}`} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full font-semibold shadow-lg text-white" style={{ backgroundColor: primaryColor }}>
                    Contratar Plan
                  </Button>
                </a>
              ) : (
                <Link to="/login">
                  <Button className="w-full font-semibold shadow-lg text-white" style={{ backgroundColor: primaryColor }}>
                    Comenzar
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 relative overflow-hidden" style={heroStyle}>
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <h2 className="text-4xl font-bold text-white mb-6">
            ¿Listo para empezar?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Contáctanos ahora y te ayudamos a configurar tu sistema de facturación en minutos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {whatsappLink && (
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="lg" className="bg-white hover:bg-gray-100 w-full sm:w-auto font-semibold" style={{ color: primaryColor }}>
                  Contactar por WhatsApp
                </Button>
              </a>
            )}
            <Link to="/login">
              <Button variant="ghost" size="lg" className="bg-white/20 text-white hover:bg-white/30 border-2 border-white/30 w-full sm:w-auto font-semibold">
                Iniciar Sesión
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-400 overflow-hidden">
        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="mb-4">
                <img
                  src={logoUrl}
                  alt={brandName}
                  className="h-16 w-auto object-contain"
                  onError={(e) => { e.target.src = '/logo.png' }}
                />
              </div>
              <p className="text-sm">
                Sistema completo de facturación electrónica para negocios en Perú
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Acceso</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/login" className="hover:text-white transition-colors">Iniciar Sesión</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/terminos-y-condiciones" className="hover:text-white transition-colors">Términos y Condiciones</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-800 text-center text-sm">
            <p>© 2025 {brandName}. Todos los derechos reservados.</p>
            <p className="text-xs mt-2 text-gray-500">Powered by Cobrify</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
