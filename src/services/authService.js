import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { createSubscription } from './subscriptionService'
import { setAsBusinessOwner } from './adminService'

/**
 * Servicio de autenticación con Firebase
 */

/**
 * Iniciar sesión con email y contraseña
 */
export const loginWithEmail = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    return { success: true, user: userCredential.user }
  } catch (error) {
    console.error('Error en login:', error)
    return { success: false, error: getErrorMessage(error.code) }
  }
}

/**
 * Registrar nuevo usuario
 */
export const registerUser = async (email, password, displayName) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)

    // Actualizar perfil con nombre
    if (displayName) {
      await updateProfile(userCredential.user, { displayName })
    }

    // Marcar como Business Owner (dueño del negocio) automáticamente
    try {
      await setAsBusinessOwner(userCredential.user.uid, email)
      console.log('✅ Usuario marcado como Business Owner automáticamente')
    } catch (ownerError) {
      console.error('Error al marcar como business owner:', ownerError)
      // Continuar aunque falle
    }

    // Crear suscripción de prueba de 1 día automáticamente
    try {
      await createSubscription(
        userCredential.user.uid,
        email,
        displayName || email,
        'trial'
      )
      console.log('✅ Suscripción de prueba creada automáticamente')
    } catch (subscriptionError) {
      console.error('Error al crear suscripción de prueba:', subscriptionError)
      // No fallar el registro si hay error en la suscripción
    }

    return { success: true, user: userCredential.user }
  } catch (error) {
    console.error('Error en registro:', error)
    return { success: false, error: getErrorMessage(error.code) }
  }
}

/**
 * Cerrar sesión
 */
export const logout = async () => {
  try {
    await signOut(auth)
    return { success: true }
  } catch (error) {
    console.error('Error al cerrar sesión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar email de recuperación de contraseña
 */
export const resetPassword = async email => {
  try {
    await sendPasswordResetEmail(auth, email)
    return { success: true }
  } catch (error) {
    console.error('Error al enviar email:', error)
    return { success: false, error: getErrorMessage(error.code) }
  }
}

/**
 * Observar cambios en el estado de autenticación
 */
export const onAuthChange = callback => {
  return onAuthStateChanged(auth, callback)
}

/**
 * Obtener usuario actual
 */
export const getCurrentUser = () => {
  return auth.currentUser
}

/**
 * Traducir códigos de error de Firebase a mensajes en español
 */
const getErrorMessage = errorCode => {
  const errorMessages = {
    'auth/user-not-found': 'No existe una cuenta con este correo electrónico',
    'auth/wrong-password': 'Contraseña incorrecta',
    'auth/email-already-in-use': 'Este correo electrónico ya está registrado',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
    'auth/invalid-email': 'Correo electrónico inválido',
    'auth/user-disabled': 'Esta cuenta ha sido deshabilitada',
    'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
    'auth/network-request-failed': 'Error de conexión. Verifica tu internet',
  }

  return errorMessages[errorCode] || 'Error de autenticación. Intenta nuevamente'
}
