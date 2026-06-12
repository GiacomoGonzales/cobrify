import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, secondaryAuth, db } from '@/lib/firebase'
import { createSubscription } from './subscriptionService'
import { setAsBusinessOwner } from './adminService'
import { createWarehouse } from './warehouseService'

/**
 * Servicio de autenticación con Firebase
 * Usa SDK web en todas las plataformas (web y móvil)
 */

/**
 * Iniciar sesión con email y contraseña
 */
export const loginWithEmail = async (email, password) => {
  try {
    console.log('🔐 Intentando login con:', email)
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    console.log('✅ Login exitoso:', userCredential.user.email)
    return { success: true, user: userCredential.user }
  } catch (error) {
    console.error('❌ Error en login:', error)
    console.error('❌ Error code:', error.code)
    console.error('❌ Error message:', error.message)
    return { success: false, error: getErrorMessage(error.code || error.message) }
  }
}

/**
 * Registrar nuevo usuario con datos del negocio
 */
export const registerUser = async (email, password, displayName, businessData = null) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)

    // Actualizar perfil con nombre
    if (displayName) {
      await updateProfile(userCredential.user, { displayName })
    }

    // Marcar como Business Owner (dueño del negocio) automáticamente
    try {
      await setAsBusinessOwner(userCredential.user.uid, email, displayName)
      console.log('✅ Usuario marcado como Business Owner automáticamente')
    } catch (ownerError) {
      console.error('Error al marcar como business owner:', ownerError)
      // Continuar aunque falle
    }

    // Guardar datos del negocio si se proporcionaron
    if (businessData) {
      try {
        const businessRef = doc(db, 'businesses', userCredential.user.uid)
        await setDoc(businessRef, {
          ruc: businessData.ruc || '',
          businessName: businessData.businessName || '',
          name: businessData.tradeName || businessData.businessName || '',
          phone: businessData.phone || '',
          email: email,
          address: businessData.address || '',
          district: businessData.district || '',
          province: businessData.province || '',
          department: businessData.department || '',
          ubigeo: businessData.ubigeo || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
        console.log('✅ Datos del negocio guardados')
      } catch (businessError) {
        console.error('Error al guardar datos del negocio:', businessError)
        // Continuar aunque falle
      }
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
    return { success: false, error: getErrorMessage(error.code || error.message) }
  }
}

/**
 * Crear una cuenta de negocio COMPLETA desde el panel de administración, SIN
 * desloguear al admin actual.
 *
 * Usa la instancia secundaria de Firebase (`secondaryAuth`, con inMemoryPersistence)
 * para crear el usuario de Auth — igual que el flujo de sub-usuarios — y luego escribe
 * todos los documentos desde la sesión del admin (las reglas permiten a isAdmin escribir
 * users/businesses/subscriptions). Crea el negocio COMPLETO (series + datos) y el almacén
 * principal, porque el nuevo usuario NO pasará por el flujo de BusinessCreate.
 */
export const registerBusinessAsAdmin = async (email, password, displayName, businessData = null) => {
  try {
    // 1. Crear el usuario en la instancia SECUNDARIA (no afecta la sesión del admin).
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    const newUid = userCredential.user.uid
    if (displayName) {
      try { await updateProfile(userCredential.user, { displayName }) } catch (e) { /* no crítico */ }
    }
    // Cerrar la sesión secundaria de inmediato.
    try { await signOut(secondaryAuth) } catch (e) { /* no crítico */ }

    // 2. Marcar como Business Owner (users/{uid}).
    try {
      await setAsBusinessOwner(newUid, email, displayName)
    } catch (ownerError) {
      console.error('Error al marcar como business owner:', ownerError)
    }

    // 3. Crear el negocio COMPLETO con TODAS las series por defecto (mismo set que
    //    BusinessCreate), para que la cuenta quede lista sin pasos extra.
    try {
      const businessRef = doc(db, 'businesses', newUid)
      await setDoc(businessRef, {
        ruc: businessData?.ruc || '',
        businessName: businessData?.businessName || '',
        name: businessData?.tradeName || businessData?.businessName || '',
        phone: businessData?.phone || '',
        email,
        address: businessData?.address || '',
        district: businessData?.district || '',
        province: businessData?.province || '',
        department: businessData?.department || '',
        ubigeo: businessData?.ubigeo || '',
        series: {
          factura: { serie: 'F001', lastNumber: 0 },
          boleta: { serie: 'B001', lastNumber: 0 },
          nota_venta: { serie: 'N001', lastNumber: 0 },
          cotizacion: { serie: 'C001', lastNumber: 0 },
          nota_credito_factura: { serie: 'FN01', lastNumber: 0 },
          nota_credito_boleta: { serie: 'BN01', lastNumber: 0 },
          nota_debito_factura: { serie: 'FD01', lastNumber: 0 },
          nota_debito_boleta: { serie: 'BD01', lastNumber: 0 },
          guia_remision: { serie: 'T001', lastNumber: 0 },
          guia_transportista: { serie: 'V001', lastNumber: 0 },
        },
        sunat: { enabled: false, environment: 'beta', solUser: '', homologated: false },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
    } catch (businessError) {
      console.error('Error al guardar datos del negocio:', businessError)
    }

    // 4. Suscripción de prueba.
    try {
      await createSubscription(newUid, email, displayName || email, 'trial')
    } catch (subscriptionError) {
      console.error('Error al crear suscripción de prueba:', subscriptionError)
    }

    // 5. Almacén principal por defecto.
    try {
      await createWarehouse(newUid, { name: 'Almacén Principal', isDefault: true })
    } catch (whError) {
      console.error('Error al crear almacén principal:', whError)
    }

    return { success: true, userId: newUid }
  } catch (error) {
    console.error('Error en registro (admin):', error)
    return { success: false, error: getErrorMessage(error.code || error.message) }
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
    return { success: false, error: getErrorMessage(error.code || error.message) }
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
