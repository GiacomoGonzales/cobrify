import { Link } from 'react-router-dom'
import { FileText, ShoppingCart, BarChart3, Package, Users, TrendingUp, Check, Shield, Zap, Clock } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Header / Navigation */}
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-lg z-50 border-b border-gray-200/50">
        <nav className="container mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-primary-400 rounded-lg blur-md opacity-0 group-hover:opacity-50 transition-opacity"></div>
                <img
                  src="/logo.png"
                  alt="Cobrify"
                  className="w-10 h-10 object-contain relative z-10 transform group-hover:scale-110 transition-transform"
                  width="40"
                  height="40"
                />
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">Cobrify</span>
            </Link>

            {/* Navigation Links - Hidden on mobile, visible on desktop */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-700 hover:text-primary-600 font-medium transition-colors">
                Características
              </a>
              <a href="#benefits" className="text-gray-700 hover:text-primary-600 font-medium transition-colors">
                Beneficios
              </a>
              <Link to="/demo" className="text-gray-700 hover:text-primary-600 font-medium transition-colors">
                Demo
              </Link>
              <a href="#pricing" className="text-gray-700 hover:text-primary-600 font-medium transition-colors">
                Precios
              </a>
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center space-x-3">
              <Link to="/demo" className="hidden sm:block">
                <Button variant="ghost" className="hover:bg-primary-50 text-primary-700 font-semibold">
                  Demo Retail
                </Button>
              </Link>
              <Link to="/demorestaurant">
                <Button className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-lg shadow-primary-200/50 font-semibold">
                  Demo Restaurante
                </Button>
              </Link>
            </div>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 overflow-hidden">
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

        {/* Subtle wave effect */}
        <div className="absolute bottom-0 left-0 right-0 h-32 opacity-20">
          <svg className="w-full h-full" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M0,50 C300,100 600,0 900,50 C1050,75 1150,50 1200,50 L1200,120 L0,120 Z" fill="white" opacity="0.3"/>
            <path d="M0,70 C300,20 600,100 900,70 C1050,55 1150,70 1200,70 L1200,120 L0,120 Z" fill="white" opacity="0.2"/>
          </svg>
        </div>

        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-white">
              <h1 className="text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                Facturación Electrónica para tu Negocio
              </h1>
              <p className="text-xl text-primary-100 mb-8 leading-relaxed">
                Sistema completo de facturación homologado con SUNAT. Genera facturas, boletas,
                notas de crédito y gestiona tu negocio desde un solo lugar.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/demo">
                  <Button size="lg" className="bg-white text-primary-600 hover:bg-primary-50 w-full sm:w-auto font-semibold">
                    Ver Demo Retail
                  </Button>
                </Link>
                <Link to="/demorestaurant">
                  <Button size="lg" className="bg-primary-800 text-white hover:bg-primary-900 border-2 border-white/30 w-full sm:w-auto font-semibold">
                    Ver Demo Restaurante
                  </Button>
                </Link>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:space-x-6 text-sm text-primary-100">
                <div className="flex items-center space-x-2">
                  <Check className="w-5 h-5" />
                  <span>Modo Retail y Restaurante</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-5 h-5" />
                  <span>Prueba todas las funciones</span>
                </div>
              </div>
            </div>
            <div className="hidden lg:block">
              <img
                src="/hero-image.png"
                alt="Sistema de facturación Cobrify"
                className="w-full h-auto rounded-lg shadow-2xl"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 relative bg-gradient-to-b from-gray-50 via-white to-gray-50">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

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
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-primary-200 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-primary-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-primary-200">
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
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-green-200 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-green-200">
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
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-blue-200 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200">
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
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-purple-200 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-purple-200">
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
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-orange-200 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-orange-200">
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
            <div className="group relative bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-red-200 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-red-200">
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

      {/* Benefits Section */}
      <section id="benefits" className="py-20 px-4 relative overflow-hidden">
        {/* Background with gradient mesh */}
        <div className="absolute inset-0 bg-gradient-to-br from-white via-primary-50/30 to-blue-50/30"></div>
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, rgb(99 102 241) 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }}></div>
        </div>

        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              ¿Por qué elegir Cobrify?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Diseñado específicamente para negocios peruanos
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="group text-center">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <div className="relative w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mx-auto transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                  <Shield className="w-10 h-10 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">100% Homologado</h3>
              <p className="text-gray-600">Certificado por SUNAT</p>
            </div>

            <div className="group text-center">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-green-600 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <div className="relative w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                  <Zap className="w-10 h-10 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Rápido y Fácil</h3>
              <p className="text-gray-600">Interfaz intuitiva</p>
            </div>

            <div className="group text-center">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <div className="relative w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                  <Clock className="w-10 h-10 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">24/7 Disponible</h3>
              <p className="text-gray-600">Acceso en cualquier momento</p>
            </div>

            <div className="group text-center">
              <div className="relative inline-block mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
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
      <section id="pricing" className="py-20 px-4 bg-white">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Explora nuestras demos interactivas
          </h2>
          <p className="text-xl text-gray-600 mb-12">
            Prueba el sistema completo con datos de ejemplo
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Demo Retail */}
            <div className="relative bg-white p-8 rounded-2xl border-2 border-gray-200 hover:border-primary-300 transition-all hover:shadow-lg">
              <div className="mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ShoppingCart className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Demo Retail</h3>
                <p className="text-gray-600">Ideal para tiendas y comercios</p>
              </div>
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-center text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                  <span>Punto de venta completo</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                  <span>Gestión de inventario</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                  <span>Control de clientes</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                  <span>Reportes y análisis</span>
                </li>
              </ul>
              <Link to="/demo">
                <Button variant="outline" className="w-full border-2 border-primary-600 text-primary-700 hover:bg-primary-50">
                  Explorar Demo Retail
                </Button>
              </Link>
            </div>

            {/* Demo Restaurante */}
            <div className="relative bg-gradient-to-br from-primary-600 to-primary-700 p-8 rounded-2xl shadow-2xl transform md:scale-105">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-gray-900 px-4 py-1 rounded-full text-sm font-bold">
                Más Completo
              </div>
              <div className="mb-6">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Demo Restaurante</h3>
                <p className="text-primary-100">Especializado para restaurantes</p>
              </div>
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-center text-white">
                  <Check className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0" />
                  <span>Gestión de mesas</span>
                </li>
                <li className="flex items-center text-white">
                  <Check className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0" />
                  <span>Control de mozos</span>
                </li>
                <li className="flex items-center text-white">
                  <Check className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0" />
                  <span>Vista de cocina</span>
                </li>
                <li className="flex items-center text-white">
                  <Check className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0" />
                  <span>Comandas digitales</span>
                </li>
              </ul>
              <Link to="/demorestaurant">
                <Button className="w-full bg-white text-primary-700 hover:bg-primary-50 font-semibold shadow-lg">
                  Explorar Demo Restaurante
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full mix-blend-overlay filter blur-3xl animate-pulse"></div>
          <div className="absolute bottom-10 right-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-overlay filter blur-3xl animate-pulse animation-delay-1000"></div>
        </div>

        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <h2 className="text-4xl font-bold text-white mb-6">
            Prueba el sistema completo ahora
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Explora todas las funcionalidades con nuestras demos interactivas. Sin registros, sin complicaciones.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/demo">
              <Button size="lg" className="bg-white text-primary-600 hover:bg-primary-50 w-full sm:w-auto font-semibold">
                Ver Demo Retail
              </Button>
            </Link>
            <Link to="/demorestaurant">
              <Button size="lg" className="bg-primary-800 text-white hover:bg-primary-900 border-2 border-white/30 w-full sm:w-auto font-semibold">
                Ver Demo Restaurante
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-400 overflow-hidden">
        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '20px 20px'
          }}></div>
        </div>

        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <img
                  src="/logo.png"
                  alt="Cobrify"
                  className="w-8 h-8 object-contain"
                  width="32"
                  height="32"
                />
                <span className="text-xl font-bold text-white">Cobrify</span>
              </div>
              <p className="text-sm">
                Sistema completo de facturación electrónica para negocios en Perú
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Producto</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/demo" className="hover:text-white transition-colors">Demo</Link></li>
                <li><Link to="/login" className="hover:text-white transition-colors">Iniciar Sesión</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Términos de Servicio</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Política de Privacidad</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-800 text-center text-sm">
            <p>© 2025 Cobrify. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
