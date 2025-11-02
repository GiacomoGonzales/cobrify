import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginWithEmail, logout as logoutService, onAuthChange } from '@/services/authService'
import { isUserAdmin, isBusinessAdmin } from '@/services/adminService'
import { getSubscription, hasActiveAccess, createSubscription } from '@/services/subscriptionService'
import { getUserData } from '@/services/userManagementService'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false) // Super admin (giiacomo@gmail.com)
  const [isBusinessOwner, setIsBusinessOwner] = useState(false) // Admin del negocio
  const [subscription, setSubscription] = useState(null)
  const [hasAccess, setHasAccess] = useState(false)
  const [userPermissions, setUserPermissions] = useState(null) // Permisos del usuario
  const [allowedPages, setAllowedPages] = useState([]) // Páginas permitidas
  const navigate = useNavigate()

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

          // Verificar si es BUSINESS OWNER (dueño del negocio)
          let businessOwnerStatus = false
          if (!superAdminStatus) {
            try {
              businessOwnerStatus = await isBusinessAdmin(firebaseUser.uid)
              console.log('🔍 DEBUG - isBusinessAdmin result:', businessOwnerStatus, 'for user:', firebaseUser.email)
            } catch (error) {
              console.error('Error al verificar business owner:', error)
              businessOwnerStatus = false
            }
          }
          console.log('🔍 DEBUG - Setting isBusinessOwner to:', businessOwnerStatus)
          setIsBusinessOwner(businessOwnerStatus)

          // Cargar permisos del usuario (si no es super admin ni business owner)
          if (!superAdminStatus && !businessOwnerStatus) {
            try {
              const userDataResult = await getUserData(firebaseUser.uid)
              if (userDataResult.success && userDataResult.data) {
                const userData = userDataResult.data
                setUserPermissions(userData)
                setAllowedPages(userData.allowedPages || [])

                // Si el usuario no está activo, cerrar sesión
                if (!userData.isActive) {
                  console.warn('Usuario inactivo, cerrando sesión')
                  await logoutService()
                  return
                }
              } else {
                // Usuario no tiene datos en Firestore, permitir acceso total temporalmente
                setAllowedPages([])
              }
            } catch (error) {
              console.error('Error al cargar permisos:', error)
              setAllowedPages([])
            }
          } else {
            // Super Admin o Business Owner tienen acceso total
            setAllowedPages([])
          }

          // Obtener suscripción con timeout
          try {
            const subscriptionPromise = Promise.race([
              getSubscription(firebaseUser.uid),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Subscription timeout')), 5000))
            ])
            let userSubscription = await subscriptionPromise

            // Si no tiene suscripción, crear una de prueba automáticamente
            if (!userSubscription && !superAdminStatus) {
              console.log('📝 Usuario sin suscripción, creando trial automático')
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

            // Verificar acceso activo (super admin y business owner siempre tienen acceso)
            const accessStatus = superAdminStatus || businessOwnerStatus ? true : hasActiveAccess(userSubscription)
            setHasAccess(accessStatus)
          } catch (error) {
            console.error('Error al obtener suscripción:', error)
            // Si es admin o business owner, darle acceso aunque falle la suscripción
            setHasAccess(superAdminStatus || businessOwnerStatus)
            setSubscription(null)
          }
        } else {
          // Usuario no autenticado
          setUser(null)
          setIsAuthenticated(false)
          setIsAdmin(false)
          setIsBusinessOwner(false)
          setSubscription(null)
          setHasAccess(false)
          setUserPermissions(null)
          setAllowedPages([])
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

  const login = async (email, password) => {
    try {
      const result = await loginWithEmail(email, password)

      if (result.success) {
        // El onAuthChange se encargará de actualizar el estado
        navigate('/dashboard')
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
      await logoutService()
      setUser(null)
      setIsAuthenticated(false)
      setIsAdmin(false)
      setIsBusinessOwner(false)
      setSubscription(null)
      setHasAccess(false)
      setUserPermissions(null)
      setAllowedPages([])
      navigate('/login')
    } catch (error) {
      console.error('Error al cerrar sesión:', error)
    }
  }

  // Función para refrescar la suscripción
  const refreshSubscription = async () => {
    if (user) {
      try {
        const userSubscription = await getSubscription(user.uid)
        setSubscription(userSubscription)
        const accessStatus = isAdmin ? true : hasActiveAccess(userSubscription)
        setHasAccess(accessStatus)
      } catch (error) {
        console.error('Error al refrescar suscripción:', error)
      }
    }
  }

  // Función helper para verificar si el usuario tiene acceso a una página
  const hasPageAccess = (pageId) => {
    // Super Admin siempre tiene acceso
    if (isAdmin) return true

    // Business Owner siempre tiene acceso
    if (isBusinessOwner) return true

    // Si no hay permisos cargados, denegar acceso (mientras carga)
    if (userPermissions === null) return false

    // Si allowedPages está vacío y no es admin, permitir acceso (usuario sin restricciones)
    if (allowedPages.length === 0 && !userPermissions) return true

    // Verificar si la página está en la lista de permitidas
    return allowedPages.includes(pageId)
  }

  const value = {
    user,
    isAuthenticated,
    isLoading,
    isAdmin, // Super Admin (giiacomo@gmail.com)
    isBusinessOwner, // Admin del negocio (usuarios registrados)
    subscription,
    hasAccess,
    userPermissions,
    allowedPages,
    hasPageAccess,
    login,
    logout,
    refreshSubscription,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
