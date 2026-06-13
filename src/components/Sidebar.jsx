import { memo, useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Settings,
  ShoppingCart,
  Warehouse,
  BarChart3,
  Truck,
  ShoppingBag,
  Wallet,
  CreditCard,
  Shield,
  FileCheck,
  UserCog,
  ClipboardList,
  History,
  Building2,
  Landmark,
  Receipt,
  TrendingUp,
  GraduationCap,
  Bike,
  // Iconos para modo restaurante
  UtensilsCrossed,
  Grid3x3,
  ChefHat,
  ListOrdered,
  Carrot,
  CookingPot,
  Cog,
  // Iconos para modo farmacia
  Pill,
  FlaskConical,
  AlertTriangle,
  Calendar,
  // Iconos para modo inmobiliaria
  Home,
  Key,
  Handshake,
  MapPin,
  DollarSign,
  UserCheck,
  Award,
  BookOpen,
  // Iconos para modo logística
  HardHat,
  ArrowUpFromLine,
  ArrowDownToLine,
  // Iconos para modo hotel
  BedDouble,
  CalendarCheck,
  ConciergeBell,
  Waves,
  ClipboardCheck,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  Globe,
  ShoppingBasket,
  Factory,
  Briefcase,
  // Iconos para modo veterinaria
  PawPrint,
  Stethoscope,
  Syringe,
  Heart,
  Bell,
  Facebook,
} from 'lucide-react'
import { useStore } from '@/stores/useStore'
import { useAppContext } from '@/hooks/useAppContext'
import { useBranding } from '@/contexts/BrandingContext'

function Sidebar() {
  const { mobileMenuOpen, setMobileMenuOpen, sidebarCollapsed, toggleSidebar, orderAlertCount } = useStore()
  const { isAdmin, isBusinessOwner, isReseller, isDemoMode, hasPageAccess, businessMode, businessSettings, hasFeature } = useAppContext()
  const { branding } = useBranding()
  const location = useLocation()

  // Estado de grupos colapsables del sidebar (persistido en localStorage para no
  // resetearse en cada navegación). Solo aplica a items con `groupId` y `children`.
  const [openGroups, setOpenGroups] = useState(() => {
    try {
      const raw = localStorage.getItem('sidebar_open_groups')
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })
  const toggleGroup = (groupId) => {
    setOpenGroups(prev => {
      const next = { ...prev, [groupId]: !prev[groupId] }
      try { localStorage.setItem('sidebar_open_groups', JSON.stringify(next)) } catch {}
      return next
    })
  }

  // Si estamos en modo demo, añadir prefijo /demo, /demorestaurant o /demopharmacy a las rutas
  // Si no, añadir prefijo /app para rutas protegidas
  const getPath = (path) => {
    if (isDemoMode) {
      // Detectar qué tipo de demo estamos usando
      if (location.pathname.startsWith('/demorestaurant')) {
        return `/demorestaurant${path}`
      }
      if (location.pathname.startsWith('/demopharmacy')) {
        return `/demopharmacy${path}`
      }
      if (location.pathname.startsWith('/demohotel')) {
        return `/demohotel${path}`
      }
      if (location.pathname.startsWith('/demoveterinary')) {
        return `/demoveterinary${path}`
      }
      if (location.pathname.startsWith('/demologistics')) {
        return `/demologistics${path}`
      }
      return `/demo${path}`
    }
    // Para rutas normales (no demo), agregar prefijo /app
    return `/app${path}`
  }

  // Menú para modo RETAIL (tiendas, comercios)
  // menuId: ID para personalización del menú (hiddenMenuItems)
  // pageId: ID para control de acceso de usuarios secundarios
  const retailMenuItems = [
    // === Operación diaria (siempre visibles) ===
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
    },
    {
      path: '/pos',
      icon: ShoppingCart,
      label: 'Punto de Venta',
      badge: 'POS',
      pageId: 'pos',
    },
    {
      path: '/pedidos-online',
      icon: ShoppingBag,
      label: 'Pedidos Online',
      pageId: 'online-orders',
      menuId: 'online-orders',
    },
    {
      path: '/caja',
      icon: Wallet,
      label: 'Control de Caja',
      pageId: 'cash-register',
      menuId: 'cash-register',
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Ventas',
      pageId: 'invoices',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
      pageId: 'customers',
    },
    {
      path: '/productos',
      icon: Package,
      label: 'Productos',
      pageId: 'products',
    },
    {
      path: '/inventario',
      icon: ClipboardList,
      label: 'Inventario',
      pageId: 'inventory',
      menuId: 'inventory',
    },

    // === Mi Catálogo Online (acceso directo a la pestaña de Settings) ===
    {
      path: '/configuracion?tab=catalogo',
      icon: Globe,
      label: 'Mi Catálogo Online',
      pageId: 'settings',
      menuId: 'public-catalog',
      activePathMatch: '/configuracion', // marcado como activo cuando la ruta es /configuracion
    },

    // === GRUPO: Documentos ===
    {
      groupId: 'documentos',
      icon: FileCheck,
      label: 'Documentos',
      children: [
        {
          path: '/cotizaciones',
          icon: FileCheck,
          label: 'Cotizaciones',
          pageId: 'quotations',
          menuId: 'quotations',
        },
        {
          path: '/guias-remision',
          icon: Truck,
          label: 'GRE Remitente',
          pageId: 'dispatch-guides',
          menuId: 'dispatch-guides',
        },
        {
          path: '/guias-transportista',
          icon: Truck,
          label: 'GRE Transportista',
          pageId: 'carrier-dispatch-guides',
          menuId: 'carrier-dispatch-guides',
          hideInDemo: true,
        },
      ],
    },

    // === GRUPO: Compras y Proveedores ===
    {
      groupId: 'compras',
      icon: ShoppingBasket,
      label: 'Compras',
      children: [
        {
          path: '/compras',
          icon: ShoppingBag,
          label: 'Compras',
          pageId: 'purchases',
          menuId: 'purchases',
        },
        {
          path: '/ordenes-compra',
          icon: ClipboardList,
          label: 'Órdenes de Compra',
          pageId: 'purchase-orders',
          menuId: 'purchase-orders',
        },
        {
          path: '/proveedores',
          icon: Truck,
          label: 'Proveedores',
          pageId: 'suppliers',
          menuId: 'suppliers',
        },
        {
          path: '/ingredientes/historial',
          icon: History,
          label: 'Historial de Compras',
          pageId: 'purchase-history',
          menuId: 'purchase-history',
        },
      ],
    },

    // === GRUPO: Producción (insumos, recetas, producción) ===
    {
      groupId: 'produccion',
      icon: Factory,
      label: 'Producción',
      children: [
        {
          path: '/ingredientes',
          icon: Package,
          label: 'Insumos',
          pageId: 'ingredients',
          menuId: 'ingredients',
        },
        {
          path: '/recetas',
          icon: ClipboardList,
          label: 'Composición',
          pageId: 'recipes',
          menuId: 'recipes',
        },
        {
          path: '/produccion',
          icon: Cog,
          label: 'Producción',
          pageId: 'production',
          menuId: 'production',
        },
      ],
    },

    // === GRUPO: Inventario avanzado ===
    {
      groupId: 'inventario-avanzado',
      icon: Warehouse,
      label: 'Almacenes & Stock',
      children: [
        {
          path: '/almacenes',
          icon: Warehouse,
          label: 'Almacenes',
          pageId: 'warehouses',
          menuId: 'warehouses',
        },
        {
          path: '/movimientos',
          icon: History,
          label: 'Movimientos',
          pageId: 'stock-movements',
          menuId: 'stock-movements',
        },
        {
          path: '/control-lotes',
          icon: Package,
          label: 'Control de Lotes',
          pageId: 'batch-control',
          menuId: 'batch-control',
          requiresBatchControl: true,
        },
        {
          path: '/alertas-vencimiento',
          icon: AlertTriangle,
          label: 'Alertas de Vencimiento',
          pageId: 'expiry-alerts',
          menuId: 'expiry-alerts',
          requiresBatchControl: true,
        },
        {
          path: '/envios',
          icon: Truck,
          label: 'Envíos',
          pageId: 'envios',
          menuId: 'envios',
        },
      ],
    },

    // === GRUPO: Equipo y Operaciones ===
    {
      groupId: 'equipo',
      icon: Briefcase,
      label: 'Equipo',
      children: [
        {
          path: '/vendedores',
          icon: UserCog,
          label: 'Vendedores',
          pageId: 'sellers',
          menuId: 'sellers',
        },
        // Control de Asistencia:
        // - Sub-usuarios solo ven el link en la app nativa (marcan con QR/GPS).
        // - Owner/Admin lo ven siempre (gestionan configuración y marcaciones).
        ...(((isBusinessOwner || isAdmin) || Capacitor.isNativePlatform())
          ? [{
              path: '/asistencia',
              icon: UserCheck,
              label: (isBusinessOwner || isAdmin) ? 'Personal' : 'Marcar Asistencia',
              menuId: 'attendance',
              pageId: 'attendance',
            }]
          : []),
        // Mi Horario: portal del empleado (sub-usuarios) — Capa 4 del módulo Personal
        ...((!isBusinessOwner && !isAdmin)
          ? [{
              path: '/mi-horario',
              icon: Calendar,
              label: 'Mi Horario',
              menuId: 'my-schedule',
            }]
          : []),
        {
          path: '/control-pagos-alumnos',
          icon: GraduationCap,
          label: 'Control de Alumnos',
          pageId: 'customers',
          menuId: 'student-payments',
          requiresStudentField: true,
          hideInDemo: true,
        },
      ],
    },

    // === GRUPO: Reportes y Finanzas ===
    {
      groupId: 'finanzas',
      icon: BarChart3,
      label: 'Reportes & Finanzas',
      children: [
        {
          path: '/reportes',
          icon: BarChart3,
          label: 'Reportes',
          pageId: 'reports',
          menuId: 'reports',
        },
        {
          path: '/gastos',
          icon: Receipt,
          label: 'Gastos',
          pageId: 'expenses',
          menuId: 'expenses',
        },
        {
          path: '/flujo-caja',
          icon: TrendingUp,
          label: 'Flujo de Caja',
          pageId: 'cash-flow',
          menuId: 'cash-flow',
        },
        {
          path: '/contabilidad',
          icon: FileCheck,
          label: 'Contabilidad',
          pageId: 'accounting',
          menuId: 'accounting',
        },
        {
          path: '/meta-ads',
          icon: Facebook,
          label: 'Meta Ads',
          pageId: 'meta-ads',
          menuId: 'meta-ads',
          requiresMetaAds: true,
        },
      ],
    },

    // === GRUPO: Otros (uso poco frecuente) ===
    {
      groupId: 'otros',
      icon: BookOpen,
      label: 'Otros',
      children: [
        {
          path: '/reclamos',
          icon: BookOpen,
          label: 'Libro de Reclamos',
          pageId: 'complaints',
          menuId: 'complaints',
        },
        {
          path: '/prestamos',
          icon: Landmark,
          label: 'Préstamos',
          pageId: 'loans',
          menuId: 'loans',
          hideInDemo: true,
        },
        {
          path: '/certificados',
          icon: Award,
          label: 'Certificados',
          pageId: 'certificates',
          menuId: 'certificates',
          requiresFeature: 'certificates',
          hideInDemo: true,
        },
      ],
    },

    // === Configuración (siempre al final) ===
    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Menú para modo RESTAURANT (restaurantes, cafeterías, bares)
  const restaurantMenuItems = [
    // === Operación diaria del restaurante ===
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
    },
    {
      path: '/pos',
      icon: ShoppingCart,
      label: 'Punto de Venta',
      badge: 'POS',
      pageId: 'pos',
    },
    {
      path: '/caja',
      icon: Wallet,
      label: 'Caja',
      pageId: 'cash-register',
      menuId: 'cash-register',
    },
    {
      path: '/mesas',
      icon: Grid3x3,
      label: 'Mesas',
      pageId: 'tables',
      menuId: 'tables',
    },
    {
      path: '/ordenes',
      icon: ListOrdered,
      label: 'Órdenes',
      pageId: 'orders',
      menuId: 'orders',
    },
    {
      path: '/cocina',
      icon: ChefHat,
      label: 'Cocina',
      pageId: 'kitchen',
      menuId: 'kitchen',
    },
    {
      path: '/pedidos-rappi',
      icon: Bike,
      label: 'Pedidos Rappi',
      pageId: 'rappi-orders',
      menuId: 'rappi-orders',
      requiresRappi: true,
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Ventas',
      pageId: 'invoices',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
      pageId: 'customers',
    },
    {
      path: '/productos',
      icon: UtensilsCrossed,
      label: 'Menú',
      pageId: 'products',
    },
    {
      path: '/inventario',
      icon: ClipboardList,
      label: 'Inventario',
      pageId: 'inventory',
      menuId: 'inventory',
    },

    // === Mi Carta Digital (acceso directo a la pestaña catálogo de Settings) ===
    {
      path: '/configuracion?tab=catalogo',
      icon: UtensilsCrossed,
      label: 'Mi Carta Digital',
      pageId: 'settings',
      menuId: 'public-catalog',
      activePathMatch: '/configuracion',
    },

    // === GRUPO: Documentos ===
    {
      groupId: 'documentos',
      icon: FileCheck,
      label: 'Documentos',
      children: [
        {
          path: '/cotizaciones',
          icon: FileCheck,
          label: 'Cotizaciones',
          pageId: 'quotations',
          menuId: 'quotations',
        },
      ],
    },

    // === GRUPO: Cocina & Producción ===
    {
      groupId: 'cocina-prod',
      icon: CookingPot,
      label: 'Cocina & Producción',
      children: [
        {
          path: '/ingredientes',
          icon: Carrot,
          label: 'Ingredientes',
          pageId: 'ingredients',
          menuId: 'ingredients',
        },
        {
          path: '/recetas',
          icon: CookingPot,
          label: 'Recetas',
          pageId: 'recipes',
          menuId: 'recipes',
        },
        {
          path: '/produccion',
          icon: Cog,
          label: 'Producción',
          pageId: 'production',
          menuId: 'production',
        },
      ],
    },

    // === GRUPO: Compras y Proveedores ===
    {
      groupId: 'compras',
      icon: ShoppingBasket,
      label: 'Compras',
      children: [
        {
          path: '/compras',
          icon: ShoppingBag,
          label: 'Compras',
          pageId: 'purchases',
          menuId: 'purchases',
        },
        {
          path: '/proveedores',
          icon: Truck,
          label: 'Proveedores',
          pageId: 'suppliers',
          menuId: 'suppliers',
        },
        {
          path: '/ingredientes/historial',
          icon: History,
          label: 'Historial de Compras',
          pageId: 'purchase-history',
          menuId: 'purchase-history',
        },
      ],
    },

    // === GRUPO: Almacenes & Envíos ===
    {
      groupId: 'almacenes',
      icon: Warehouse,
      label: 'Almacenes & Stock',
      children: [
        {
          path: '/almacenes',
          icon: Warehouse,
          label: 'Almacenes',
          pageId: 'warehouses',
          menuId: 'warehouses',
        },
        {
          path: '/envios',
          icon: Truck,
          label: 'Envíos',
          pageId: 'envios',
          menuId: 'envios',
        },
      ],
    },

    // === GRUPO: Equipo ===
    {
      groupId: 'equipo',
      icon: Briefcase,
      label: 'Equipo',
      children: [
        {
          path: '/mozos',
          icon: Users,
          label: 'Mozos',
          pageId: 'waiters',
          menuId: 'waiters',
        },
        {
          path: '/vendedores',
          icon: UserCog,
          label: 'Vendedores',
          pageId: 'sellers',
          menuId: 'sellers',
        },
        ...(((isBusinessOwner || isAdmin) || Capacitor.isNativePlatform())
          ? [{
              path: '/asistencia',
              icon: UserCheck,
              label: (isBusinessOwner || isAdmin) ? 'Personal' : 'Marcar Asistencia',
              menuId: 'attendance',
              pageId: 'attendance',
            }]
          : []),
        // Mi Horario: portal del empleado (sub-usuarios) — Capa 4 del módulo Personal
        ...((!isBusinessOwner && !isAdmin)
          ? [{
              path: '/mi-horario',
              icon: Calendar,
              label: 'Mi Horario',
              menuId: 'my-schedule',
            }]
          : []),
      ],
    },

    // === GRUPO: Reportes & Finanzas ===
    {
      groupId: 'finanzas',
      icon: BarChart3,
      label: 'Reportes & Finanzas',
      children: [
        {
          path: '/reportes',
          icon: BarChart3,
          label: 'Reportes',
          pageId: 'reports',
          menuId: 'reports',
        },
        {
          path: '/gastos',
          icon: Receipt,
          label: 'Gastos',
          pageId: 'expenses',
          menuId: 'expenses',
        },
        {
          path: '/flujo-caja',
          icon: TrendingUp,
          label: 'Flujo de Caja',
          pageId: 'cash-flow',
          menuId: 'cash-flow',
        },
        {
          path: '/contabilidad',
          icon: FileCheck,
          label: 'Contabilidad',
          pageId: 'accounting',
          menuId: 'accounting',
        },
        {
          path: '/meta-ads',
          icon: Facebook,
          label: 'Meta Ads',
          pageId: 'meta-ads',
          menuId: 'meta-ads',
          requiresMetaAds: true,
        },
      ],
    },

    // === GRUPO: Otros ===
    {
      groupId: 'otros',
      icon: BookOpen,
      label: 'Otros',
      children: [
        {
          path: '/reclamos',
          icon: BookOpen,
          label: 'Libro de Reclamos',
          pageId: 'complaints',
          menuId: 'complaints',
        },
      ],
    },

    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Menú para modo FARMACIA (farmacias, boticas, droguerías)
  const pharmacyMenuItems = [
    // === Operación diaria ===
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
    },
    {
      path: '/pos',
      icon: ShoppingCart,
      label: 'Punto de Venta',
      badge: 'POS',
      pageId: 'pos',
    },
    {
      path: '/pedidos-online',
      icon: ShoppingBag,
      label: 'Pedidos Online',
      pageId: 'online-orders',
      menuId: 'online-orders',
    },
    {
      path: '/caja',
      icon: Wallet,
      label: 'Control de Caja',
      pageId: 'cash-register',
      menuId: 'cash-register',
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Ventas',
      pageId: 'invoices',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
      pageId: 'customers',
    },
    {
      path: '/productos',
      icon: Pill,
      label: 'Medicamentos',
      pageId: 'products',
    },
    {
      path: '/inventario',
      icon: ClipboardList,
      label: 'Inventario',
      pageId: 'inventory',
      menuId: 'inventory',
    },

    // === Mi Catálogo Online ===
    {
      path: '/configuracion?tab=catalogo',
      icon: Globe,
      label: 'Mi Catálogo Online',
      pageId: 'settings',
      menuId: 'public-catalog',
      activePathMatch: '/configuracion',
    },

    // === GRUPO: Documentos ===
    {
      groupId: 'documentos',
      icon: FileCheck,
      label: 'Documentos',
      children: [
        {
          path: '/cotizaciones',
          icon: FileCheck,
          label: 'Cotizaciones',
          pageId: 'quotations',
          menuId: 'quotations',
        },
        {
          path: '/guias-remision',
          icon: Truck,
          label: 'GRE Remitente',
          pageId: 'dispatch-guides',
          menuId: 'dispatch-guides',
        },
      ],
    },

    // === GRUPO: Control de Lotes & Vencimientos (clave en farmacia) ===
    {
      groupId: 'lotes',
      icon: Package,
      label: 'Lotes & Vencimientos',
      children: [
        {
          path: '/control-lotes',
          icon: Package,
          label: 'Control de Lotes',
          pageId: 'batch-control',
          menuId: 'batch-control',
        },
        {
          path: '/alertas-vencimiento',
          icon: AlertTriangle,
          label: 'Alertas Vencimiento',
          pageId: 'expiry-alerts',
          menuId: 'expiry-alerts',
        },
        {
          path: '/laboratorios',
          icon: FlaskConical,
          label: 'Laboratorios',
          pageId: 'laboratories',
          menuId: 'laboratories',
        },
      ],
    },

    // === GRUPO: Almacenes & Stock ===
    {
      groupId: 'almacenes',
      icon: Warehouse,
      label: 'Almacenes & Stock',
      children: [
        {
          path: '/almacenes',
          icon: Warehouse,
          label: 'Almacenes',
          pageId: 'warehouses',
          menuId: 'warehouses',
        },
        {
          path: '/movimientos',
          icon: History,
          label: 'Movimientos',
          pageId: 'stock-movements',
          menuId: 'stock-movements',
        },
      ],
    },

    // === GRUPO: Compras y Proveedores ===
    {
      groupId: 'compras',
      icon: ShoppingBasket,
      label: 'Compras',
      children: [
        {
          path: '/compras',
          icon: ShoppingBag,
          label: 'Compras',
          pageId: 'purchases',
          menuId: 'purchases',
        },
        {
          path: '/ordenes-compra',
          icon: ClipboardList,
          label: 'Órdenes de Compra',
          pageId: 'purchase-orders',
          menuId: 'purchase-orders',
        },
        {
          path: '/proveedores',
          icon: Truck,
          label: 'Proveedores',
          pageId: 'suppliers',
          menuId: 'suppliers',
        },
        {
          path: '/ingredientes/historial',
          icon: History,
          label: 'Historial de Compras',
          pageId: 'purchase-history',
          menuId: 'purchase-history',
        },
      ],
    },

    // === GRUPO: Equipo ===
    {
      groupId: 'equipo',
      icon: Briefcase,
      label: 'Equipo',
      children: [
        {
          path: '/vendedores',
          icon: UserCog,
          label: 'Vendedores',
          pageId: 'sellers',
          menuId: 'sellers',
        },
        ...(((isBusinessOwner || isAdmin) || Capacitor.isNativePlatform())
          ? [{
              path: '/asistencia',
              icon: UserCheck,
              label: (isBusinessOwner || isAdmin) ? 'Personal' : 'Marcar Asistencia',
              menuId: 'attendance',
              pageId: 'attendance',
            }]
          : []),
        // Mi Horario: portal del empleado (sub-usuarios) — Capa 4 del módulo Personal
        ...((!isBusinessOwner && !isAdmin)
          ? [{
              path: '/mi-horario',
              icon: Calendar,
              label: 'Mi Horario',
              menuId: 'my-schedule',
            }]
          : []),
      ],
    },

    // === GRUPO: Reportes & Finanzas ===
    {
      groupId: 'finanzas',
      icon: BarChart3,
      label: 'Reportes & Finanzas',
      children: [
        {
          path: '/reportes',
          icon: BarChart3,
          label: 'Reportes',
          pageId: 'reports',
          menuId: 'reports',
        },
        {
          path: '/gastos',
          icon: Receipt,
          label: 'Gastos',
          pageId: 'expenses',
          menuId: 'expenses',
        },
        {
          path: '/flujo-caja',
          icon: TrendingUp,
          label: 'Flujo de Caja',
          pageId: 'cash-flow',
          menuId: 'cash-flow',
        },
        {
          path: '/contabilidad',
          icon: FileCheck,
          label: 'Contabilidad',
          pageId: 'accounting',
          menuId: 'accounting',
        },
        {
          path: '/meta-ads',
          icon: Facebook,
          label: 'Meta Ads',
          pageId: 'meta-ads',
          menuId: 'meta-ads',
          requiresMetaAds: true,
        },
      ],
    },

    // === GRUPO: Otros ===
    {
      groupId: 'otros',
      icon: BookOpen,
      label: 'Otros',
      children: [
        {
          path: '/reclamos',
          icon: BookOpen,
          label: 'Libro de Reclamos',
          pageId: 'complaints',
          menuId: 'complaints',
        },
        {
          path: '/prestamos',
          icon: Landmark,
          label: 'Préstamos',
          pageId: 'loans',
          menuId: 'loans',
          hideInDemo: true,
        },
      ],
    },

    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Menú para modo INMOBILIARIA (agencias, corredores)
  const realEstateMenuItems = [
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
    },
    {
      path: '/propiedades',
      icon: Home,
      label: 'Propiedades',
      pageId: 'properties',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
      pageId: 'customers',
    },
    {
      path: '/agentes',
      icon: UserCheck,
      label: 'Agentes',
      pageId: 'agents',
    },
    {
      path: '/operaciones',
      icon: Handshake,
      label: 'Operaciones',
      pageId: 'operations',
    },
    {
      path: '/comisiones',
      icon: DollarSign,
      label: 'Comisiones',
      pageId: 'commissions',
    },
    ...(((isBusinessOwner || isAdmin) || Capacitor.isNativePlatform())
      ? [{
          path: '/asistencia',
          icon: UserCheck,
          label: (isBusinessOwner || isAdmin) ? 'Personal' : 'Marcar Asistencia',
          menuId: 'attendance',
          pageId: 'attendance',
        }]
      : []),
    // Mi Horario: portal del empleado (sub-usuarios) — Capa 4 del módulo Personal
    ...((!isBusinessOwner && !isAdmin)
      ? [{
          path: '/mi-horario',
          icon: Calendar,
          label: 'Mi Horario',
          menuId: 'my-schedule',
        }]
      : []),

    {
      path: '/contabilidad',
      icon: FileCheck,
      label: 'Contabilidad',
      pageId: 'accounting',
      menuId: 'accounting',
    },

    {
      path: '/reportes',
      icon: BarChart3,
      label: 'Reportes',
      pageId: 'reports',
    },
    {
      path: '/meta-ads',
      icon: Facebook,
      label: 'Meta Ads',
      pageId: 'meta-ads',
      menuId: 'meta-ads',
      requiresMetaAds: true,
    },
    {
      path: '/usuarios',
      icon: UserCog,
      label: 'Gestión de Usuarios',
      pageId: 'users',
    },
    {
      path: '/reclamos',
      icon: BookOpen,
      label: 'Libro de Reclamos',
      pageId: 'complaints',
      menuId: 'complaints',
    },
    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Menú para modo HOTEL
  const hotelMenuItems = [
    // === Operación diaria del hotel ===
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
    },
    {
      path: '/habitaciones',
      icon: BedDouble,
      label: 'Habitaciones',
      pageId: 'hotel-rooms',
      menuId: 'hotel-rooms',
    },
    {
      path: '/reservas',
      icon: CalendarCheck,
      label: 'Reservas',
      pageId: 'hotel-reservations',
      menuId: 'hotel-reservations',
    },
    {
      path: '/housekeeping',
      icon: ClipboardCheck,
      label: 'Housekeeping',
      pageId: 'hotel-housekeeping',
      menuId: 'hotel-housekeeping',
    },
    {
      path: '/servicios-hotel',
      icon: ConciergeBell,
      label: 'Servicios',
      pageId: 'hotel-services',
      menuId: 'hotel-services',
    },
    {
      path: '/auditoria-hotel',
      icon: CalendarCheck,
      label: 'Auditoría y Tarifas',
      pageId: 'hotel-audit',
      menuId: 'hotel-audit',
    },
    {
      path: '/pos',
      icon: ShoppingCart,
      label: 'Punto de Venta',
      badge: 'POS',
      pageId: 'pos',
    },
    {
      path: '/caja',
      icon: Wallet,
      label: 'Caja',
      pageId: 'cash-register',
      menuId: 'cash-register',
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Comprobantes',
      pageId: 'invoices',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Huéspedes',
      pageId: 'customers',
    },
    {
      path: '/productos',
      icon: Package,
      label: 'Productos',
      pageId: 'products',
      menuId: 'products',
    },
    {
      path: '/inventario',
      icon: ClipboardList,
      label: 'Inventario',
      pageId: 'inventory',
      menuId: 'inventory',
    },

    // === Mi Catálogo Online ===
    {
      path: '/configuracion?tab=catalogo',
      icon: Globe,
      label: 'Mi Catálogo Online',
      pageId: 'settings',
      menuId: 'public-catalog',
      activePathMatch: '/configuracion',
    },

    // === GRUPO: Almacenes & Stock ===
    {
      groupId: 'almacenes',
      icon: Warehouse,
      label: 'Almacenes & Stock',
      children: [
        {
          path: '/almacenes',
          icon: Warehouse,
          label: 'Almacenes',
          pageId: 'warehouses',
          menuId: 'warehouses',
        },
      ],
    },

    // === GRUPO: Equipo ===
    {
      groupId: 'equipo',
      icon: Briefcase,
      label: 'Equipo',
      children: [
        ...(((isBusinessOwner || isAdmin) || Capacitor.isNativePlatform())
          ? [{
              path: '/asistencia',
              icon: UserCheck,
              label: (isBusinessOwner || isAdmin) ? 'Personal' : 'Marcar Asistencia',
              menuId: 'attendance',
              pageId: 'attendance',
            }]
          : []),
        // Mi Horario: portal del empleado (sub-usuarios) — Capa 4 del módulo Personal
        ...((!isBusinessOwner && !isAdmin)
          ? [{
              path: '/mi-horario',
              icon: Calendar,
              label: 'Mi Horario',
              menuId: 'my-schedule',
            }]
          : []),
      ],
    },

    // === GRUPO: Reportes & Finanzas ===
    {
      groupId: 'finanzas',
      icon: BarChart3,
      label: 'Reportes & Finanzas',
      children: [
        {
          path: '/reportes',
          icon: BarChart3,
          label: 'Reportes',
          pageId: 'reports',
        },
        ...(hasFeature && hasFeature('expenseManagement') ? [{
          path: '/gastos',
          icon: Receipt,
          label: 'Gastos',
          pageId: 'expenses',
          menuId: 'expenses',
        }] : []),
        {
          path: '/contabilidad',
          icon: FileCheck,
          label: 'Contabilidad',
          pageId: 'accounting',
          menuId: 'accounting',
        },
        {
          path: '/meta-ads',
          icon: Facebook,
          label: 'Meta Ads',
          pageId: 'meta-ads',
          menuId: 'meta-ads',
          requiresMetaAds: true,
        },
      ],
    },

    // === GRUPO: Otros ===
    {
      groupId: 'otros',
      icon: BookOpen,
      label: 'Otros',
      children: [
        {
          path: '/reclamos',
          icon: BookOpen,
          label: 'Libro de Reclamos',
          pageId: 'complaints',
          menuId: 'complaints',
        },
      ],
    },

    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Menú para modo LOGÍSTICA (construcción, obras, proyectos)
  const logisticsMenuItems = [
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
    },
    {
      path: '/pos',
      icon: ShoppingCart,
      label: 'Punto de Venta',
      badge: 'POS',
      pageId: 'pos',
    },
    {
      path: '/caja',
      icon: Wallet,
      label: 'Control de Caja',
      pageId: 'cash-register',
      menuId: 'cash-register',
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Ventas',
      pageId: 'invoices',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
      pageId: 'customers',
    },
    {
      path: '/productos',
      icon: Package,
      label: 'Productos',
      pageId: 'products',
    },
    {
      path: '/proyectos',
      icon: HardHat,
      label: 'Proyectos / Obras',
      pageId: 'projects',
      menuId: 'projects',
    },
    {
      path: '/salidas-almacen',
      icon: ArrowUpFromLine,
      label: 'Salidas de Almacén',
      pageId: 'warehouse-exits',
      menuId: 'warehouse-exits',
    },
    {
      path: '/retornos-almacen',
      icon: ArrowDownToLine,
      label: 'Retornos a Almacén',
      pageId: 'warehouse-returns',
      menuId: 'warehouse-returns',
    },
    {
      path: '/reportes-logisticos',
      icon: BarChart3,
      label: 'Reportes Logísticos',
      pageId: 'logistics-reports',
      menuId: 'logistics-reports',
    },
    {
      path: '/inventario',
      icon: ClipboardList,
      label: 'Inventario',
      pageId: 'inventory',
      menuId: 'inventory',
    },
    {
      path: '/almacenes',
      icon: Warehouse,
      label: 'Almacenes',
      pageId: 'warehouses',
      menuId: 'warehouses',
    },
    {
      path: '/movimientos',
      icon: History,
      label: 'Movimientos de Stock',
      pageId: 'stock-movements',
      menuId: 'stock-movements',
    },
    {
      path: '/guias-remision',
      icon: Truck,
      label: 'Guías de Remisión',
      pageId: 'dispatch-guides',
      menuId: 'dispatch-guides',
    },
    {
      path: '/compras',
      icon: ShoppingBag,
      label: 'Compras',
      pageId: 'purchases',
      menuId: 'purchases',
    },
    {
      path: '/proveedores',
      icon: Truck,
      label: 'Proveedores',
      pageId: 'suppliers',
      menuId: 'suppliers',
    },
    ...(((isBusinessOwner || isAdmin) || Capacitor.isNativePlatform())
      ? [{
          path: '/asistencia',
          icon: UserCheck,
          label: (isBusinessOwner || isAdmin) ? 'Personal' : 'Marcar Asistencia',
          menuId: 'attendance',
          pageId: 'attendance',
        }]
      : []),
    // Mi Horario: portal del empleado (sub-usuarios) — Capa 4 del módulo Personal
    ...((!isBusinessOwner && !isAdmin)
      ? [{
          path: '/mi-horario',
          icon: Calendar,
          label: 'Mi Horario',
          menuId: 'my-schedule',
        }]
      : []),

    {
      path: '/contabilidad',
      icon: FileCheck,
      label: 'Contabilidad',
      pageId: 'accounting',
      menuId: 'accounting',
    },

    {
      path: '/reportes',
      icon: BarChart3,
      label: 'Reportes',
      pageId: 'reports',
      menuId: 'reports',
    },
    {
      path: '/meta-ads',
      icon: Facebook,
      label: 'Meta Ads',
      pageId: 'meta-ads',
      menuId: 'meta-ads',
      requiresMetaAds: true,
    },
    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Menú para modo VETERINARIA (clínicas veterinarias, pet shops)
  // Ordenado por frecuencia de uso: Operación diaria → Ventas → Inventario → Compras → Finanzas → Config
  const veterinaryMenuItems = [
    // === Operación diaria (lo que usa el veterinario todos los días) ===
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
    },
    {
      path: '/pos',
      icon: ShoppingCart,
      label: 'Punto de Venta',
      badge: 'POS',
      pageId: 'pos',
    },
    {
      path: '/pedidos-online',
      icon: ShoppingBag,
      label: 'Pedidos Online',
      pageId: 'online-orders',
      menuId: 'online-orders',
    },
    {
      path: '/caja',
      icon: Wallet,
      label: 'Control de Caja',
      pageId: 'cash-register',
      menuId: 'cash-register',
    },
    {
      path: '/agenda-veterinaria',
      icon: Calendar,
      label: 'Agenda de Citas',
      pageId: 'vet-agenda',
      menuId: 'vet-agenda',
    },
    {
      path: '/alertas-veterinaria',
      icon: Bell,
      label: 'Recordatorios',
      pageId: 'vet-alerts',
      menuId: 'vet-alerts',
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Ventas',
      pageId: 'invoices',
    },
    {
      path: '/clientes',
      icon: PawPrint,
      label: 'Pacientes',
      pageId: 'customers',
    },
    {
      path: '/productos',
      icon: Heart,
      label: 'Productos y Servicios',
      pageId: 'products',
    },
    {
      path: '/inventario',
      icon: ClipboardList,
      label: 'Inventario',
      pageId: 'inventory',
      menuId: 'inventory',
    },

    // === Mi Catálogo Online ===
    {
      path: '/configuracion?tab=catalogo',
      icon: Globe,
      label: 'Mi Catálogo Online',
      pageId: 'settings',
      menuId: 'public-catalog',
      activePathMatch: '/configuracion',
    },

    // === GRUPO: Documentos ===
    {
      groupId: 'documentos',
      icon: FileCheck,
      label: 'Documentos',
      children: [
        {
          path: '/cotizaciones',
          icon: FileCheck,
          label: 'Cotizaciones',
          pageId: 'quotations',
          menuId: 'quotations',
        },
      ],
    },

    // === GRUPO: Lotes & Vencimientos (medicamentos veterinarios) ===
    {
      groupId: 'lotes',
      icon: Package,
      label: 'Lotes & Vencimientos',
      children: [
        {
          path: '/control-lotes',
          icon: Package,
          label: 'Control de Lotes',
          pageId: 'batch-control',
          menuId: 'batch-control',
        },
        {
          path: '/alertas-vencimiento',
          icon: AlertTriangle,
          label: 'Alertas Vencimiento',
          pageId: 'expiry-alerts',
          menuId: 'expiry-alerts',
        },
      ],
    },

    // === GRUPO: Almacenes & Stock ===
    {
      groupId: 'almacenes',
      icon: Warehouse,
      label: 'Almacenes & Stock',
      children: [
        {
          path: '/almacenes',
          icon: Warehouse,
          label: 'Almacenes',
          pageId: 'warehouses',
          menuId: 'warehouses',
        },
        {
          path: '/movimientos',
          icon: History,
          label: 'Movimientos',
          pageId: 'stock-movements',
          menuId: 'stock-movements',
        },
      ],
    },

    // === GRUPO: Compras y Proveedores ===
    {
      groupId: 'compras',
      icon: ShoppingBasket,
      label: 'Compras',
      children: [
        {
          path: '/compras',
          icon: ShoppingBag,
          label: 'Compras',
          pageId: 'purchases',
          menuId: 'purchases',
        },
        {
          path: '/ordenes-compra',
          icon: ClipboardList,
          label: 'Órdenes de Compra',
          pageId: 'purchase-orders',
          menuId: 'purchase-orders',
        },
        {
          path: '/proveedores',
          icon: Truck,
          label: 'Proveedores',
          pageId: 'suppliers',
          menuId: 'suppliers',
        },
        {
          path: '/ingredientes/historial',
          icon: History,
          label: 'Historial de Compras',
          pageId: 'purchase-history',
          menuId: 'purchase-history',
        },
      ],
    },

    // === GRUPO: Equipo (veterinarios + asistencia) ===
    {
      groupId: 'equipo',
      icon: Briefcase,
      label: 'Equipo',
      children: [
        {
          path: '/vendedores',
          icon: Stethoscope,
          label: 'Veterinarios',
          pageId: 'sellers',
          menuId: 'sellers',
        },
        ...(((isBusinessOwner || isAdmin) || Capacitor.isNativePlatform())
          ? [{
              path: '/asistencia',
              icon: UserCheck,
              label: (isBusinessOwner || isAdmin) ? 'Personal' : 'Marcar Asistencia',
              menuId: 'attendance',
              pageId: 'attendance',
            }]
          : []),
        // Mi Horario: portal del empleado (sub-usuarios) — Capa 4 del módulo Personal
        ...((!isBusinessOwner && !isAdmin)
          ? [{
              path: '/mi-horario',
              icon: Calendar,
              label: 'Mi Horario',
              menuId: 'my-schedule',
            }]
          : []),
      ],
    },

    // === GRUPO: Reportes & Finanzas ===
    {
      groupId: 'finanzas',
      icon: BarChart3,
      label: 'Reportes & Finanzas',
      children: [
        {
          path: '/reportes',
          icon: BarChart3,
          label: 'Reportes',
          pageId: 'reports',
          menuId: 'reports',
        },
        {
          path: '/gastos',
          icon: Receipt,
          label: 'Gastos',
          pageId: 'expenses',
          menuId: 'expenses',
        },
        {
          path: '/flujo-caja',
          icon: TrendingUp,
          label: 'Flujo de Caja',
          pageId: 'cash-flow',
          menuId: 'cash-flow',
        },
        {
          path: '/contabilidad',
          icon: FileCheck,
          label: 'Contabilidad',
          pageId: 'accounting',
          menuId: 'accounting',
        },
        {
          path: '/meta-ads',
          icon: Facebook,
          label: 'Meta Ads',
          pageId: 'meta-ads',
          menuId: 'meta-ads',
          requiresMetaAds: true,
        },
      ],
    },

    // === GRUPO: Otros ===
    {
      groupId: 'otros',
      icon: BookOpen,
      label: 'Otros',
      children: [
        {
          path: '/reclamos',
          icon: BookOpen,
          label: 'Libro de Reclamos',
          pageId: 'complaints',
          menuId: 'complaints',
        },
      ],
    },

    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Seleccionar menú según el modo de negocio
  // Si businessMode es null (cargando), no mostrar nada aún
  const menuItems = businessMode === 'restaurant'
    ? restaurantMenuItems
    : businessMode === 'pharmacy'
      ? pharmacyMenuItems
      : businessMode === 'real_estate'
        ? realEstateMenuItems
        : businessMode === 'hotel'
          ? hotelMenuItems
          : businessMode === 'logistics'
            ? logisticsMenuItems
            : businessMode === 'veterinary'
              ? veterinaryMenuItems
              : (businessMode === 'retail' || businessMode === 'transport')
                ? retailMenuItems
                : [] // Si es null, array vacío mientras carga

  // Agregar opciones adicionales según el rol
  const additionalItems = [
    {
      path: '/mi-suscripcion',
      icon: CreditCard,
      label: 'Mi Suscripción',
      adminOnly: false,
      businessOwnerOnly: true, // Solo visible para el usuario principal/owner
      pageId: null,
      hideOnIOS: true, // Ocultar en iOS por política de Apple (Guideline 3.1.1)
    },
    {
      path: '/usuarios',
      icon: UserCog,
      label: 'Gestión de Usuarios',
      businessOwnerOnly: true, // Solo para business owners, NO para super admins
      pageId: 'users',
    },
    {
      path: '/reseller/dashboard',
      icon: Building2,
      label: 'Panel Reseller',
      resellerOnly: true, // Solo para resellers
      isExternalPath: true, // No usar getPath, es ruta absoluta
      pageId: null,
    },
    {
      path: '/admin/dashboard',
      icon: Shield,
      label: 'Panel Admin',
      adminOnly: true, // Solo para super admins
      pageId: null,
    },
  ]

  // Obtener lista de items ocultos por el usuario
  const hiddenMenuItems = businessSettings?.hiddenMenuItems || []

  // Comprueba acceso a UN item simple (no grupo)
  const itemPasses = (item) => {
    if (item.menuId && hiddenMenuItems.includes(item.menuId) && !isDemoMode) return false
    if (item.requiresFeature) {
      const featureEnabled = hasFeature && hasFeature(item.requiresFeature)
      if (!featureEnabled && !isDemoMode) return false
    }
    if (item.requiresStudentField) {
      const studentFieldEnabled = businessSettings?.posCustomFields?.showStudentField
      if (!studentFieldEnabled && !isDemoMode) return false
    }
    if (item.requiresBatchControl) {
      const batchEnabled = businessSettings?.posCustomFields?.showBatchExpiryInPurchase
      if (!batchEnabled && !isDemoMode) return false
    }
    if (item.requiresMetaAds) {
      const metaAdsEnabled = businessSettings?.metaAdsEnabled === true
      if (!metaAdsEnabled && !isDemoMode) return false
      if (isDemoMode) return false
    }
    if (item.requiresRappi) {
      const rappiEnabled = businessSettings?.rappiEnabled === true
      if (!rappiEnabled) return false
      if (isDemoMode) return false
    }
    if (item.businessOwnerOnly && !isBusinessOwner) return false
    if (item.hideInDemo && isDemoMode) return false
    if (isDemoMode) return true
    if (isAdmin || isBusinessOwner) return true
    if (!item.pageId) return true
    return hasPageAccess && hasPageAccess(item.pageId)
  }

  // Filtrar items del menú según permisos. Soporta grupos: si un item tiene
  // `children`, filtramos sus hijos y descartamos el grupo si quedan 0 hijos.
  const filteredMenuItems = menuItems
    .map((item) => {
      if (item.children) {
        const visibleChildren = item.children.filter(itemPasses)
        if (visibleChildren.length === 0) return null
        return { ...item, children: visibleChildren }
      }
      return itemPasses(item) ? item : null
    })
    .filter(Boolean)

  console.log('✅ Items filtrados:', filteredMenuItems.length, 'de', menuItems.length)

  // Detectar si estamos en iOS nativo
  const isIOSNative = Capacitor.getPlatform() === 'ios'

  const filteredAdditionalItems = additionalItems.filter((item) => {
    // Ocultar en iOS si tiene la bandera hideOnIOS (política Apple Guideline 3.1.1)
    if (item.hideOnIOS && isIOSNative) return false

    // Si es solo para admin y el usuario no es admin, no mostrar
    if (item.adminOnly && !isAdmin) return false

    // Si es solo para business owner y el usuario no lo es (o es super admin), no mostrar
    if (item.businessOwnerOnly && (!isBusinessOwner || isAdmin)) return false

    // Si es solo para reseller y el usuario no es reseller, no mostrar
    if (item.resellerOnly && !isReseller) return false

    // Si estamos en modo demo, mostrar todo excepto reseller
    if (isDemoMode && !item.resellerOnly) return true

    // Si no tiene pageId, permitir acceso
    if (!item.pageId) return true

    // Verificar si tiene permiso
    return hasPageAccess && hasPageAccess(item.pageId)
  })

  return (
    <>
      {/* Overlay para móvil */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen h-[100dvh] bg-white border-r border-gray-200 transition-all duration-300 z-50 w-64 ${sidebarCollapsed ? 'md:w-16' : ''} sidebar-ios flex flex-col overflow-hidden
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0`}
      >
      {/* Logo + botón colapsar */}
      <div className={`h-16 flex-shrink-0 flex items-center justify-between border-b border-gray-200 ${sidebarCollapsed ? 'md:px-2' : 'px-4'}`}>
        <div className="flex items-center space-x-3">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={`${branding.companyName} - Sistema de facturación electrónica`}
              className="w-10 h-10 object-contain"
              width="40"
              height="40"
              loading="eager"
            />
          ) : (
            <img
              src="/logo.png"
              alt={`${branding.companyName} - Sistema de facturación electrónica`}
              className="w-10 h-10 object-contain"
              width="40"
              height="40"
              loading="eager"
            />
          )}
          <span
            className={`text-xl font-bold ${sidebarCollapsed ? 'md:hidden' : ''}`}
            style={{ color: branding.primaryColor || '#111827' }}
          >
            {branding.companyName}
          </span>
        </div>
        <button
          onClick={toggleSidebar}
          className="hidden md:flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {sidebarCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-3 space-y-1 flex-1 min-h-0 overflow-y-auto overscroll-contain sidebar-scrollbar" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
        {/* Skeleton loader mientras carga businessMode */}
        {!businessMode && (
          <div className="space-y-2 animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center space-x-3 px-3 py-2">
                <div className="w-5 h-5 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded w-24" />
              </div>
            ))}
          </div>
        )}
        {filteredMenuItems.map(item => {
          // === Render de GRUPO colapsable ===
          if (item.groupId && item.children) {
            const isOpen = !!openGroups[item.groupId]
            // Auto-expandir si la ruta actual está dentro del grupo
            const someChildActive = item.children.some(c => {
              const childPath = (c.path || '').split('?')[0]
              return location.pathname.includes(childPath)
            })
            const expanded = isOpen || someChildActive

            return (
              <div key={item.groupId} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(item.groupId)}
                  title={item.label}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-100 ${sidebarCollapsed ? 'md:justify-center md:px-2' : ''}`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" style={{ color: '#6B7280' }} />
                  {/* Label oculto solo en desktop colapsado (md:hidden), igual que los items normales.
                      En móvil el drawer siempre es ancho completo, el label debe verse siempre. */}
                  <span className={`font-medium text-sm flex-1 text-left ${sidebarCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                  {expanded
                    ? <ChevronDown className={`w-4 h-4 text-gray-400 ${sidebarCollapsed ? 'md:hidden' : ''}`} />
                    : <ChevronRight className={`w-4 h-4 text-gray-400 ${sidebarCollapsed ? 'md:hidden' : ''}`} />}
                </button>
                {expanded && (
                  <div className={`ml-3 pl-3 border-l border-gray-200 space-y-0.5 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                    {item.children.map(child => (
                      <NavLink
                        key={child.path}
                        to={getPath(child.path)}
                        onClick={() => setMobileMenuOpen(false)}
                        title={child.label}
                        className={({ isActive }) =>
                          `flex items-center space-x-3 px-3 py-1.5 rounded-lg transition-colors text-sm ${
                            isActive ? '' : 'text-gray-600 hover:bg-gray-100'
                          }`
                        }
                        style={({ isActive }) => isActive ? {
                          backgroundColor: `${branding.primaryColor}15`,
                          color: branding.primaryColor,
                        } : {}}
                      >
                        {({ isActive }) => (
                          <>
                            <child.icon
                              className="w-4 h-4 flex-shrink-0"
                              style={isActive ? { color: branding.primaryColor } : { color: '#9CA3AF' }}
                            />
                            <span className="font-medium">{child.label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
                {/* En modo collapsed mostramos los children como tooltip al hover (simple: lista expandida vertical sin border) */}
                {expanded && sidebarCollapsed && (
                  <div className="hidden md:flex flex-col items-center space-y-0.5">
                    {item.children.map(child => (
                      <NavLink
                        key={child.path}
                        to={getPath(child.path)}
                        onClick={() => setMobileMenuOpen(false)}
                        title={child.label}
                        className={({ isActive }) =>
                          `p-2 rounded-lg transition-colors ${isActive ? '' : 'text-gray-600 hover:bg-gray-100'}`
                        }
                        style={({ isActive }) => isActive ? {
                          backgroundColor: `${branding.primaryColor}15`,
                          color: branding.primaryColor,
                        } : {}}
                      >
                        {({ isActive }) => (
                          <child.icon
                            className="w-4 h-4"
                            style={isActive ? { color: branding.primaryColor } : { color: '#9CA3AF' }}
                          />
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          // === Render de ITEM normal ===
          const hasOrderAlerts = (item.pageId === 'orders' || item.pageId === 'online-orders') && orderAlertCount > 0
          return (
          <NavLink
            key={item.path}
            to={getPath(item.path)}
            onClick={() => setMobileMenuOpen(false)}
            title={item.label}
            className={({ isActive }) => {
              // Para items con activePathMatch (ej: /configuracion?tab=catalogo
              // que debe estar activo solo cuando estamos en /configuracion?tab=catalogo)
              let realActive = isActive
              if (item.activePathMatch) {
                const params = new URLSearchParams(location.search)
                const queryFromItem = (item.path.split('?')[1] || '')
                const itemParams = new URLSearchParams(queryFromItem)
                const itemTab = itemParams.get('tab')
                const currentTab = params.get('tab')
                realActive = location.pathname.endsWith(item.activePathMatch) && (!itemTab || itemTab === currentTab)
              }
              return `relative flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors group ${sidebarCollapsed ? 'md:justify-center md:px-2' : ''} ${
                realActive
                  ? ''
                  : hasOrderAlerts
                    ? 'text-orange-700 bg-orange-50 hover:bg-orange-100 animate-pulse'
                    : 'text-gray-700 hover:bg-gray-100'
              }`
            }}
            style={({ isActive }) => {
              let realActive = isActive
              if (item.activePathMatch) {
                const params = new URLSearchParams(location.search)
                const queryFromItem = (item.path.split('?')[1] || '')
                const itemParams = new URLSearchParams(queryFromItem)
                const itemTab = itemParams.get('tab')
                const currentTab = params.get('tab')
                realActive = location.pathname.endsWith(item.activePathMatch) && (!itemTab || itemTab === currentTab)
              }
              return realActive ? {
                backgroundColor: `${branding.primaryColor}15`,
                color: branding.primaryColor
              } : hasOrderAlerts ? {
                backgroundColor: '#FFF7ED',
              } : {}
            }}
          >
            {({ isActive }) => {
              let realActive = isActive
              if (item.activePathMatch) {
                const params = new URLSearchParams(location.search)
                const queryFromItem = (item.path.split('?')[1] || '')
                const itemParams = new URLSearchParams(queryFromItem)
                const itemTab = itemParams.get('tab')
                const currentTab = params.get('tab')
                realActive = location.pathname.endsWith(item.activePathMatch) && (!itemTab || itemTab === currentTab)
              }
              return (
              <>
                <item.icon
                  className={`w-5 h-5 flex-shrink-0 ${hasOrderAlerts && !realActive ? 'animate-bounce' : ''}`}
                  style={realActive ? { color: branding.primaryColor } : hasOrderAlerts ? { color: '#EA580C' } : { color: '#6B7280' }}
                />
                <span className={`font-medium text-sm ${sidebarCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                {hasOrderAlerts && (
                  <span className={`ml-auto bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                    {orderAlertCount}
                  </span>
                )}
                {hasOrderAlerts && sidebarCollapsed && (
                  <span className="absolute top-0 right-0 md:block hidden bg-orange-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {orderAlertCount}
                  </span>
                )}
              </>
              )
            }}
          </NavLink>
          )
        })}

        {/* Separador */}
        <div className="pt-2 border-t border-gray-200 mt-2 space-y-1">
          {filteredAdditionalItems.map(item => {
            const itemPath = item.isExternalPath ? item.path : getPath(item.path)
            return (
              <NavLink
                key={item.path}
                to={itemPath}
                onClick={() => setMobileMenuOpen(false)}
                title={item.label}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors group ${sidebarCollapsed ? 'md:justify-center md:px-2' : ''} ${
                    isActive
                      ? ''
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
                style={({ isActive }) => isActive ? {
                  backgroundColor: `${branding.primaryColor}15`,
                  color: branding.primaryColor
                } : {}}
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className="w-5 h-5 flex-shrink-0"
                      style={isActive ? { color: branding.primaryColor } : { color: '#6B7280' }}
                    />
                    <span className={`font-medium text-sm ${sidebarCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                    {item.adminOnly && (
                      <span className={`ml-auto text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                        Admin
                      </span>
                    )}
                    {item.resellerOnly && (
                      <span className={`ml-auto text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                        Reseller
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </div>

        {/* Espaciador inferior para iOS - permite que el scroll muestre la última opción */}
        <div style={{ height: '34px', flexShrink: 0 }} />
      </nav>

    </aside>
    </>
  )
}

export default memo(Sidebar)
