import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginWithEmail, logout as logoutService, onAuthChange } from '@/services/authService'
import { isUserAdmin } from '@/services/adminService'
import { getSubscription, hasActiveAccess } from '@/services/subscriptionService'

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
    // Observar cambios en el estado de autenticación de Firebase
    const unsubscribe = onAuthChange(async (firebaseUser) => {
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

        // Verificar si es administrador
        const adminStatus = await isUserAdmin(firebaseUser.uid)
        setIsAdmin(adminStatus)

        // Obtener suscripción
        try {
          const userSubscription = await getSubscription(firebaseUser.uid)
          setSubscription(userSubscription)

          // Verificar acceso activo (admin siempre tiene acceso)
          const accessStatus = adminStatus ? true : hasActiveAccess(userSubscription)
          setHasAccess(accessStatus)
        } catch (error) {
          console.error('Error al obtener suscripción:', error)
          // Si es admin, darle acceso aunque falle la suscripción
          setHasAccess(adminStatus)
        }
      } else {
        // Usuario no autenticado
        setUser(null)
        setIsAuthenticated(false)
        setIsAdmin(false)
        setSubscription(null)
        setHasAccess(false)
      }
      setIsLoading(false)
    })

    // Cleanup subscription
    return () => unsubscribe()
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
