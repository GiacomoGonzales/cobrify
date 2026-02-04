import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { loginWithEmail, logout as logoutService, onAuthChange } from '@/services/authService'
import { isUserAdmin, isBusinessAdmin, setAsBusinessOwner } from '@/services/adminService'
import { getSubscription, hasActiveAccess, createSubscription } from '@/services/subscriptionService'
import { getUserData } from '@/services/userManagementService'
import { initializePushNotifications, cleanupPushNotifications } from '@/services/notificationService'
import { setBusinessInfo, clearBusinessInfo } from '@/plugins/businessStorage'
import SubscriptionBlockedModal from '@/components/SubscriptionBlockedModal'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false) // Super admin (giiacomo@gmail.com)
  const [isBusinessOwner, setIsBusinessOwner] = useState(false) // Admin del negocio
  const [isReseller, setIsReseller] = useState(false) // Reseller
  const [resellerData, setResellerData] = useState(null) // Datos del reseller
  const [subscription, setSubscription] = useState(null)
  const [hasAccess, setHasAccess] = useState(false)
  const [isInGracePeriod, setIsInGracePeriod] = useState(false)
  const [userPermissions, setUserPermissions] = useState(null) // Permisos del usuario
  const [allowedPages, setAllowedPages] = useState([]) // Páginas permitidas
  const [allowedWarehouses, setAllowedWarehouses] = useState([]) // Almacenes permitidos (vacío = todos)
  const [allowedBranches, setAllowedBranches] = useState([]) // Sucursales permitidas (vacío = todas)
  const [businessMode, setBusinessMode] = useState(null) // Modo de negocio: 'retail' | 'restaurant' | 'pharmacy' (null mientras carga)
  const [businessSettings, setBusinessSettings] = useState(null) // Configuración completa del negocio
  const [userFeatures, setUserFeatures] = useState({ productImages: false }) // Features especiales habilitadas
  const [subscriptionOwnerId, setSubscriptionOwnerId] = useState(null) // ID del owner para escuchar cambios en suscripción
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Timeout de seguridad para evitar loading infinito
    const safetyTimeout = setTimeout(() => {
      console.warn('⚠️ Auth timeout - forzando fin de loading')
      setIsLoading(false)
    }, 10000) // 10 segundos máximo

    // Observar cambios en el estado de autenticación de Firebase
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Usuario autenticado
          const userData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          }
          setUser(userData)
          setIsAuthenticated(true)

          // Verificar si es SUPER ADMIN (giiacomo@gmail.com)
          let superAdminStatus = false
          try {
            const adminPromise = Promise.race([
              isUserAdmin(firebaseUser.uid),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Admin check timeout')), 5000))
            ])
            superAdminStatus = await adminPromise
          } catch (error) {
            console.error('Error al verificar super admin:', error)
            superAdminStatus = false
          }
          setIsAdmin(superAdminStatus)

          // Verificar si es RESELLER (buscar por UID o por email)
          let resellerStatus = false
          let resellerDocId = null
          if (!superAdminStatus) {
            try {
              // Primero buscar por UID
              const resellerRef = doc(db, 'resellers', firebaseUser.uid)
              let resellerDoc = await getDoc(resellerRef)

              if (resellerDoc.exists()) {
                resellerDocId = firebaseUser.uid
              } else {
                // Si no existe por UID, buscar por email
                const resellersQuery = query(
                  collection(db, 'resellers'),
                  where('email', '==', firebaseUser.email)
                )
                const resellersSnapshot = await getDocs(resellersQuery)
                if (!resellersSnapshot.empty) {
                  resellerDoc = resellersSnapshot.docs[0]
                  resellerDocId = resellerDoc.id
                }
              }

              if (resellerDoc && resellerDoc.exists()) {
                const data = resellerDoc.data()
                if (data.isActive !== false) {
                  resellerStatus = true
                  setResellerData({ ...data, docId: resellerDocId })
                  console.log('🤝 Usuario es Reseller:', data.companyName)
                }
              }
            } catch (error) {
              console.error('Error al verificar reseller:', error)
            }
          }
          setIsReseller(resellerStatus)

          // Verificar si es BUSINESS OWNER (dueño del negocio)
          let businessOwnerStatus = false
          if (!superAdminStatus) {
            try {
              businessOwnerStatus = await isBusinessAdmin(firebaseUser.uid)

              // Si es un usuario legacy sin documento, crear su documento de Business Owner
              if (businessOwnerStatus) {
                const userDataCheck = await getUserData(firebaseUser.uid)
                if (!userDataCheck.success || !userDataCheck.data) {
                  try {
                    await setAsBusinessOwner(firebaseUser.uid, firebaseUser.email)
                  } catch (error) {
                    console.error('Error al crear documento de Business Owner:', error)
                  }
                }
              }
            } catch (error) {
              console.error('Error al verificar business owner:', error)
              businessOwnerStatus = false
            }
          }
          setIsBusinessOwner(businessOwnerStatus)

          // Cargar permisos del usuario (si no es super admin ni business owner)
          let subUserOwnerId = null
          if (!superAdminStatus && !businessOwnerStatus) {
            try {
              const userDataResult = await getUserData(firebaseUser.uid)
              console.log('📋 Datos del usuario secundario:', userDataResult)
              if (userDataResult.success && userDataResult.data) {
                const userData = userDataResult.data
                subUserOwnerId = userData.ownerId || null
                setUserPermissions(userData)
                setAllowedPages(userData.allowedPages || [])
                setAllowedWarehouses(userData.allowedWarehouses || [])
                setAllowedBranches(userData.allowedBranches || [])
                console.log('✅ Permisos cargados:', userData.allowedPages)
                console.log('🏪 Almacenes permitidos:', userData.allowedWarehouses || 'Todos')
                console.log('🏢 Sucursales permitidas:', userData.allowedBranches || 'Todas')

                // Si el usuario no está activo, cerrar sesión
                if (!userData.isActive) {
                  console.warn('Usuario inactivo, cerrando sesión')
                  await logoutService()
                  return
                }
              } else {
                console.warn('⚠️ No se encontraron datos de usuario en Firestore')
                // Usuario no tiene datos en Firestore, permitir acceso total temporalmente
                setAllowedPages([])
                setAllowedWarehouses([])
              }
            } catch (error) {
              console.error('Error al cargar permisos:', error)
              setAllowedPages([])
              setAllowedWarehouses([])
            }
          } else {
            // Super Admin o Business Owner tienen acceso total
            setAllowedPages([])
            setAllowedWarehouses([])
            console.log('👑 Business Owner o Admin - Acceso total a todos los almacenes')
          }

          // Obtener suscripción con timeout
          try {
            // Primero verificar si es sub-usuario (tiene ownerId)
            const userDataForSub = await getUserData(firebaseUser.uid)
            const isSubUser = userDataForSub.success && userDataForSub.data?.ownerId
            const ownerIdForSubscription = isSubUser ? userDataForSub.data.ownerId : firebaseUser.uid

            console.log(`📋 Usuario: ${isSubUser ? 'Sub-usuario (owner: ' + ownerIdForSubscription + ')' : 'Principal'}`)

            const subscriptionPromise = Promise.race([
              getSubscription(ownerIdForSubscription),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Subscription timeout')), 5000))
            ])
            let userSubscription = await subscriptionPromise

            // Si no tiene suscripción, crear una de prueba SOLO si es usuario principal (no sub-usuario)
            if (!userSubscription && !superAdminStatus && !isSubUser) {
              try {
                await createSubscription(
                  firebaseUser.uid,
                  firebaseUser.email,
                  firebaseUser.displayName || 'Mi Negocio',
                  'trial'
                )
                // Obtener la suscripción recién creada
                userSubscription = await getSubscription(firebaseUser.uid)
              } catch (createError) {
                console.error('Error al crear suscripción de prueba:', createError)
              }
            }

            setSubscription(userSubscription)
            setSubscriptionOwnerId(ownerIdForSubscription) // Guardar el ownerId para el listener en tiempo real

            // Cargar features del usuario (del owner si es sub-usuario)
            console.log('🎯 Features de la suscripción:', userSubscription?.features)
            console.log('🎯 hidePaymentMethods:', userSubscription?.features?.hidePaymentMethods)
            if (userSubscription?.features) {
              setUserFeatures(userSubscription.features)
              console.log('✅ Features establecidos:', userSubscription.features)
            } else {
              setUserFeatures({ productImages: false })
              console.log('⚠️ No hay features, usando defaults')
            }

            // Verificar acceso activo (super admin y business owner siempre tienen acceso)
            if (superAdminStatus || businessOwnerStatus) {
              setHasAccess(true)
              setIsInGracePeriod(false)
            } else {
              const accessResult = hasActiveAccess(userSubscription)
              if (accessResult === 'grace') {
                setHasAccess(true)
                setIsInGracePeriod(true)
              } else {
                setHasAccess(accessResult)
                setIsInGracePeriod(false)
              }
            }
          } catch (error) {
            console.error('Error al obtener suscripción:', error)
            // Si es admin o business owner, darle acceso aunque falle la suscripción
            setHasAccess(superAdminStatus || businessOwnerStatus)
            setSubscription(null)
            setSubscriptionOwnerId(null)
          }

          // Cargar configuración del negocio (businessMode y settings completos)
          try {
            let businessId

            if (businessOwnerStatus || superAdminStatus) {
              businessId = firebaseUser.uid
              console.log('👑 Owner/Admin - usando propio UID como businessId:', businessId)
            } else {
              // Para usuarios secundarios, usar el ownerId ya obtenido de los permisos
              businessId = subUserOwnerId || firebaseUser.uid
              console.log('👤 Usuario secundario - businessId:', businessId)
            }

            console.log('🔍 Intentando cargar documento de businesses/' + businessId)
            const businessRef = doc(db, 'businesses', businessId)
            const businessDoc = await getDoc(businessRef)

            console.log('🔍 Documento existe?', businessDoc.exists())

            if (businessDoc.exists()) {
              const businessData = businessDoc.data()
              console.log('🏢 Configuración del negocio cargada completa:', businessData)
              console.log('🏢 businessMode específico:', businessData.businessMode)
              console.log('🏢 dispatchGuidesEnabled:', businessData.dispatchGuidesEnabled)

              // Validar que el modo sea uno de los permitidos
              const validModes = ['retail', 'restaurant', 'pharmacy', 'real_estate', 'transport']
              const mode = validModes.includes(businessData.businessMode)
                ? businessData.businessMode
                : 'retail'

              setBusinessMode(mode)
              setBusinessSettings(businessData) // Guardar toda la configuración

              console.log('✅ businessMode establecido a:', mode)

              // Guardar businessId en almacenamiento nativo para NotificationService
              try {
                await setBusinessInfo(
                  businessId,
                  firebaseUser.uid,
                  businessData.name || businessData.businessName || ''
                )
                console.log('📱 BusinessInfo guardado en almacenamiento nativo')
              } catch (storageError) {
                console.warn('⚠️ Error guardando BusinessInfo en nativo:', storageError)
              }
            } else {
              console.warn('⚠️ No se encontró documento del negocio en businesses/', businessId)
              console.warn('⚠️ Verificar que existe el documento en Firestore')
              // Para usuarios nuevos sin documento, usar retail como default
              // Pero solo después de confirmar que realmente no existe el documento
              setBusinessMode('retail')
              setBusinessSettings(null)
            }
          } catch (error) {
            console.error('❌ Error al cargar configuración del negocio:', error)
            console.error('❌ Stack trace:', error.stack)
            // Mantener null en caso de error para que el sidebar muestre skeleton
            // hasta que se resuelva. Esto evita mostrar retail incorrectamente.
            setBusinessMode(null)
            setBusinessSettings(null)
          }

          // Inicializar notificaciones push en móvil (para sesión restaurada)
          try {
            console.log('📱 Inicializando notificaciones push para usuario:', firebaseUser.uid)
            await initializePushNotifications(firebaseUser.uid)
          } catch (error) {
            console.error('Error al inicializar notificaciones push:', error)
            // No bloquear si fallan las notificaciones
          }
        } else {
          // Usuario no autenticado
          setUser(null)
          setIsAuthenticated(false)
          setIsAdmin(false)
          setIsReseller(false)
          setResellerData(null)
          setIsBusinessOwner(false)
          setSubscription(null)
          setHasAccess(false)
          setIsInGracePeriod(false)
          setUserPermissions(null)
          setAllowedPages([])
          setAllowedWarehouses([])
          setBusinessMode(null) // null cuando no hay usuario
          setBusinessSettings(null)
          setUserFeatures({ productImages: false })
          setSubscriptionOwnerId(null)
        }
      } catch (error) {
        console.error('Error en AuthContext:', error)
      } finally {
        clearTimeout(safetyTimeout)
        setIsLoading(false)
      }
    })

    // Cleanup subscription
    return () => {
      unsubscribe()
      clearTimeout(safetyTimeout)
    }
  }, [])

  // Listener en tiempo real para cambios en la suscripción (features)
  useEffect(() => {
    if (!subscriptionOwnerId) return

    console.log('🔔 Iniciando listener en tiempo real para suscripción de:', subscriptionOwnerId)

    const subscriptionRef = doc(db, 'subscriptions', subscriptionOwnerId)
    const unsubscribeSnapshot = onSnapshot(subscriptionRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const subscriptionData = docSnapshot.data()
        console.log('🔄 Suscripción actualizada en tiempo real')
        console.log('🔄 Features:', subscriptionData.features)
        console.log('🔄 hidePaymentMethods:', subscriptionData.features?.hidePaymentMethods)

        // Actualizar features en tiempo real
        if (subscriptionData.features) {
          setUserFeatures(subscriptionData.features)
        } else {
          setUserFeatures({ productImages: false })
        }

        // Actualizar la suscripción completa
        setSubscription(subscriptionData)
      }
    }, (error) => {
      console.error('Error en listener de suscripción:', error)
    })

    return () => {
      console.log('🔕 Limpiando listener de suscripción')
      unsubscribeSnapshot()
    }
  }, [subscriptionOwnerId])

  const login = async (email, password) => {
    try {
      const result = await loginWithEmail(email, password)

      if (result.success) {
        // Inicializar notificaciones push en móvil
        if (result.user?.uid) {
          try {
            await initializePushNotifications(result.user.uid)
          } catch (error) {
            console.error('Error al inicializar notificaciones push:', error)
            // No bloquear el login si fallan las notificaciones
          }
        }

        // El onAuthChange se encargará de actualizar el estado
        // Redirigir según tipo de usuario - sub-usuarios van al POS por defecto
        const userDataCheck = await getUserData(result.user.uid)
        if (userDataCheck.success && userDataCheck.data && userDataCheck.data.allowedPages) {
          const pages = userDataCheck.data.allowedPages
          if (pages.includes('pos')) {
            navigate('/app/pos')
          } else if (pages.length > 0) {
            // Ir a la primera página permitida
            const pageRouteMap = {
              'dashboard': '/app/dashboard',
              'pos': '/app/pos',
              'invoices': '/app/facturas',
              'customers': '/app/clientes',
              'products': '/app/productos',
              'cash-register': '/app/caja',
              'reports': '/app/reportes',
              'expenses': '/app/gastos',
              'cash-flow': '/app/flujo-caja',
              'settings': '/app/configuracion',
              'sellers': '/app/vendedores',
              'quotations': '/app/cotizaciones',
              'dispatch-guides': '/app/guias-remision',
              'carrier-dispatch-guides': '/app/guias-transportista',
              'inventory': '/app/inventario',
              'warehouses': '/app/almacenes',
              'stock-movements': '/app/movimientos',
              'purchases': '/app/compras',
              'purchase-orders': '/app/ordenes-compra',
              'suppliers': '/app/proveedores',
              'complaints': '/app/reclamos',
              'tables': '/app/mesas',
              'orders': '/app/ordenes',
              'kitchen': '/app/cocina',
              'waiters': '/app/mozos',
              'loans': '/app/prestamos',
              'certificates': '/app/certificados',
            }
            const firstRoute = pageRouteMap[pages[0]] || '/app/pos'
            navigate(firstRoute)
          } else {
            navigate('/app/dashboard')
          }
        } else {
          navigate('/app/dashboard')
        }
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  const logout = async () => {
    try {
      // Limpiar listeners y eliminar token FCM del usuario antes de cerrar sesión
      await cleanupPushNotifications(user?.uid)

      // Limpiar businessInfo del almacenamiento nativo
      try {
        await clearBusinessInfo()
        console.log('📱 BusinessInfo limpiado del almacenamiento nativo')
      } catch (storageError) {
        console.warn('⚠️ Error limpiando BusinessInfo:', storageError)
      }

      await logoutService()
      setUser(null)
      setIsAuthenticated(false)
      setIsAdmin(false)
      setIsReseller(false)
      setResellerData(null)
      setIsBusinessOwner(false)
      setSubscription(null)
      setHasAccess(false)
      setIsInGracePeriod(false)
      setUserPermissions(null)
      setAllowedPages([])
      setAllowedWarehouses([])
      setBusinessMode(null) // null para que muestre skeleton hasta que se cargue el nuevo modo
      setBusinessSettings(null)
      setUserFeatures({ productImages: false })
      navigate('/')
    } catch (error) {
      console.error('Error al cerrar sesión:', error)
    }
  }

  // Función para refrescar datos del reseller
  const refreshResellerData = async () => {
    if (user && isReseller) {
      try {
        // Usar el docId existente si lo hay, si no usar el uid
        const currentDocId = resellerData?.docId || user.uid
        const resellerRef = doc(db, 'resellers', currentDocId)
        const resellerDoc = await getDoc(resellerRef)
        if (resellerDoc.exists()) {
          setResellerData({ ...resellerDoc.data(), docId: currentDocId })
        }
      } catch (error) {
        console.error('Error al refrescar datos de reseller:', error)
      }
    }
  }

  // Función para refrescar la suscripción
  const refreshSubscription = async () => {
    if (user) {
      try {
        const userSubscription = await getSubscription(user.uid)
        setSubscription(userSubscription)
        if (isAdmin) {
          setHasAccess(true)
          setIsInGracePeriod(false)
        } else {
          const accessResult = hasActiveAccess(userSubscription)
          if (accessResult === 'grace') {
            setHasAccess(true)
            setIsInGracePeriod(true)
          } else {
            setHasAccess(accessResult)
            setIsInGracePeriod(false)
          }
        }
      } catch (error) {
        console.error('Error al refrescar suscripción:', error)
      }
    }
  }

  // Función helper para verificar si el usuario tiene acceso a una página
  const hasPageAccess = (pageId) => {
    // Super Admin siempre tiene acceso

    // Business Owner siempre tiene acceso
    if (isBusinessOwner) return true

    // Si no hay permisos cargados, denegar acceso (mientras carga)
    if (userPermissions === null) return false

    // Si allowedPages está vacío y no es admin, permitir acceso (usuario sin restricciones)
    if (allowedPages.length === 0 && !userPermissions) return true

    // Verificar si la página está en la lista de permitidas
    return allowedPages.includes(pageId)
  }

  // Función helper para verificar si el usuario tiene acceso a un almacén
  const hasWarehouseAccess = (warehouseId) => {
    // Super Admin siempre tiene acceso
    if (isAdmin) return true

    // Business Owner siempre tiene acceso a todos los almacenes
    if (isBusinessOwner) return true

    // Si allowedWarehouses está vacío, tiene acceso a todos (sin restricciones)
    if (!allowedWarehouses || allowedWarehouses.length === 0) return true

    // Verificar si el almacén está en la lista de permitidos
    return allowedWarehouses.includes(warehouseId)
  }

  // Función para filtrar lista de almacenes según permisos
  const filterWarehousesByAccess = (warehouses) => {
    // Super Admin o Business Owner ven todos
    if (isAdmin || isBusinessOwner) return warehouses

    // Si no hay restricciones, mostrar todos
    if (!allowedWarehouses || allowedWarehouses.length === 0) return warehouses

    // Filtrar solo los permitidos
    return warehouses.filter(w => allowedWarehouses.includes(w.id))
  }

  // Función helper para verificar si el usuario tiene acceso a una sucursal
  const hasBranchAccess = (branchId) => {
    // Super Admin siempre tiene acceso
    if (isAdmin) return true

    // Business Owner siempre tiene acceso a todas las sucursales
    if (isBusinessOwner) return true

    // Si allowedBranches está vacío, tiene acceso a todas (sin restricciones)
    if (!allowedBranches || allowedBranches.length === 0) return true

    // Verificar si la sucursal está en la lista de permitidas
    return allowedBranches.includes(branchId)
  }

  // Función para filtrar lista de sucursales según permisos
  const filterBranchesByAccess = (branches) => {
    // Super Admin o Business Owner ven todas
    if (isAdmin || isBusinessOwner) return branches

    // Si no hay restricciones, mostrar todas
    if (!allowedBranches || allowedBranches.length === 0) return branches

    // Filtrar solo las permitidas
    return branches.filter(b => allowedBranches.includes(b.id))
  }

  // Función helper para obtener el Business ID (owner del negocio)
  // Si es sub-usuario, retorna el ownerId; si es business owner o admin, retorna su propio uid
  const getBusinessId = () => {
    if (!user) return null

    // Si es business owner o super admin, su businessId es su propio uid
    // Esto permite que los super admins también tengan sus propios datos
    if (isBusinessOwner || isAdmin) return user.uid

    // Si es sub-usuario, usar el ownerId de userPermissions
    if (userPermissions && userPermissions.ownerId) return userPermissions.ownerId

    // Fallback: usar el uid del usuario
    return user.uid
  }

  // Función helper para verificar si un feature está habilitado
  const hasFeature = (featureName) => {
    const result = userFeatures?.[featureName] === true
    console.log(`🔍 hasFeature('${featureName}'):`, result, '| userFeatures:', userFeatures)
    return result
  }

  const value = {
    user,
    isAuthenticated,
    isLoading,
    isAdmin, // Super Admin (giiacomo@gmail.com)
    isBusinessOwner, // Admin del negocio (usuarios registrados)
    isReseller, // Reseller
    resellerData, // Datos del reseller
    subscription,
    hasAccess,
    isInGracePeriod,
    userPermissions,
    allowedPages,
    allowedWarehouses, // Almacenes permitidos para el usuario
    allowedBranches, // Sucursales permitidas para el usuario
    hasPageAccess,
    hasWarehouseAccess, // Función para verificar acceso a un almacén
    filterWarehousesByAccess, // Función para filtrar almacenes según permisos
    hasBranchAccess, // Función para verificar acceso a una sucursal
    filterBranchesByAccess, // Función para filtrar sucursales según permisos
    getBusinessId, // Función para obtener el ID del negocio (owner)
    businessMode, // Modo de negocio: 'retail' | 'restaurant'
    businessSettings, // Configuración completa del negocio (incluye dispatchGuidesEnabled)
    userFeatures, // Features especiales habilitadas
    hasFeature, // Función helper para verificar features
    login,
    logout,
    refreshSubscription,
    refreshResellerData, // Función para refrescar datos del reseller
  }

  // Verificar si la cuenta está bloqueada
  const isBlocked = subscription?.accessBlocked === true && !isAdmin

  // Solo mostrar el modal en rutas protegidas (/app), no en landing, login, o demos
  const isProtectedRoute = location.pathname.startsWith('/app')
  const shouldShowBlockedModal = isBlocked && isProtectedRoute

  return (
    <AuthContext.Provider value={value}>
      {children}

      {/* Modal de cuenta suspendida - Solo para usuarios NO admin en rutas protegidas */}
      {shouldShowBlockedModal && (
        <SubscriptionBlockedModal
          isOpen={shouldShowBlockedModal}
          subscription={subscription}
          businessName={subscription?.businessName || user?.email}
        />
      )}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
