import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginWithEmail, logout as logoutService, onAuthChange } from '@/services/authService'
import { isUserAdmin } from '@/services/adminService'
import { getSubscription, hasActiveAccess, createSubscription } from '@/services/subscriptionService'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [subscription, setSubscription] = useState(null)
  const [hasAccess, setHasAccess] = useState(false)
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

          // Verificar si es administrador con timeout
          let adminStatus = false
          try {
            const adminPromise = Promise.race([
              isUserAdmin(firebaseUser.uid),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Admin check timeout')), 5000))
            ])
            adminStatus = await adminPromise
          } catch (error) {
            console.error('Error al verificar admin:', error)
            adminStatus = false
          }
          setIsAdmin(adminStatus)

          // Obtener suscripción con timeout
          try {
            const subscriptionPromise = Promise.race([
              getSubscription(firebaseUser.uid),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Subscription timeout')), 5000))
            ])
            let userSubscription = await subscriptionPromise

            // Si no tiene suscripción, crear una de prueba automáticamente
            if (!userSubscription && !adminStatus) {
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

            // Verificar acceso activo (admin siempre tiene acceso)
            const accessStatus = adminStatus ? true : hasActiveAccess(userSubscription)
            setHasAccess(accessStatus)
          } catch (error) {
            console.error('Error al obtener suscripción:', error)
            // Si es admin, darle acceso aunque falle la suscripción
            setHasAccess(adminStatus)
            setSubscription(null)
          }
        } else {
          // Usuario no autenticado
          setUser(null)
          setIsAuthenticated(false)
          setIsAdmin(false)
          setSubscription(null)
          setHasAccess(false)
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
      setSubscription(null)
      setHasAccess(false)
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

  const value = {
    user,
    isAuthenticated,
    isLoading,
    isAdmin,
    subscription,
    hasAccess,
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
