import { Capacitor } from '@capacitor/core'
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence,
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
import { getStoredAttribution } from '@/utils/attribution'

/**
 * La semilla de cuenta nueva vive en el servidor: es la MISMA para el alta del
 * admin, la del reseller, el formulario del cliente y el chat. Ver
 * `functions/src/services/semillaService.js`.
 */
const URL_SEMILLA = 'https://us-central1-cobrify-395fe.cloudfunctions.net/sembrarCuentaNueva'

/**
 * Servicio de autenticación con Firebase
 * Usa SDK web en todas las plataformas (web y móvil)
 */

/**
 * Iniciar sesión con email y contraseña
 */
/**
 * Cuentas de DEMOSTRACIÓN: su sesión NO debe sobrevivir al navegador.
 *
 * Son cuentas compartidas que se abren en el celular de cualquiera durante una
 * venta o una prueba. Con la persistencia normal esa sesión quedaba viva para
 * siempre: una clienta abrió el enlace de su sistema y le apareció la cuenta
 * demo ya iniciada, con datos que no eran suyos (reporte del 24-ago-2026).
 * Con persistencia de sesión, al cerrar el navegador la demo se cierra sola.
 */
export const esCuentaDemo = (email) => /@cobrifyperu\.com$/i.test(String(email || '').trim())
  && /^(juanperez|demo)/i.test(String(email || '').trim())

export const loginWithEmail = async (email, password) => {
  try {
    console.log('🔐 Intentando login con:', email)
    // Se fija ANTES de entrar: la persistencia se aplica a la sesión que nace.
    //
    // En la APP, una cuenta normal debe usar IndexedDB — que es con lo que se
    // inicializa `auth` en lib/firebase.js. `browserLocalPersistence` es
    // localStorage, y en el WebView de Android no siempre sobrevive al cierre
    // de la app: la sesión se perdía y había que volver a entrar cada vez
    // (reporte del 25-ago-2026). Este setPersistence estaba degradando la
    // persistencia que firebase.js ya había elegido bien.
    //
    // EN WEB NO SE TOCA, y esa es la corrección del 02-sep-2026. Acá se fijaba
    // `browserLocalPersistence` (localStorage) mientras que lib/firebase.js
    // arranca con `getAuth(app)`, o sea la cadena por defecto, que usa
    // IndexedDB primero. Con una sola pestaña da igual —la instancia que hizo
    // login es la misma que lee—, pero con DOS no: la del login quedaba
    // anclada a localStorage y la nueva arrancaba con la cadena por defecto.
    // Firebase terminaba moviendo la sesión entre almacenes, así que la
    // pestaña vieja veía desaparecer al usuario y se cerraba, y en la nueva
    // las lecturas de Firestore salían sin token — "Missing or insufficient
    // permissions" en absolutamente todo.
    //
    // Se deja la de por defecto (no una explícita) porque esa cadena TAMBIÉN
    // lee localStorage: las sesiones ya abiertas ahí siguen valiendo. Fijar
    // una sola habría echado a todos una vez.
    //
    // La cuenta demo es la excepción a propósito: es compartida y tiene que
    // morir al cerrar, en app y en web por igual.
    try {
      if (esCuentaDemo(email)) {
        await setPersistence(auth, browserSessionPersistence)
      } else if (Capacitor.isNativePlatform()) {
        await setPersistence(auth, indexedDBLocalPersistence)
      }
      // Web con cuenta normal: la de por defecto, la misma del arranque.
    } catch (e) {
      // Si el navegador no soporta cambiarla, se sigue con la de por defecto:
      // mejor entrar que bloquear el acceso por esto.
      console.warn('No se pudo fijar la persistencia de sesión:', e?.message)
    }
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
/**
 * subscriptionOptions (opcional): { plan, initialPayment: { amount, method }, renewalPrice }.
 * Sin esto la cuenta nace en trial (compatibilidad). Desde la página de registro
 * (uso interno del superadmin) se pasa el plan que el cliente YA pagó manualmente,
 * para que la cuenta nazca activa con su precio pactado congelado — sin trial.
 */
export const registerUser = async (email, password, displayName, businessData = null, subscriptionOptions = null) => {
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
          // De dónde vino este cliente (Google, publicidad, referido...). Se
          // capturó en su primera visita a la landing y se conserva acá para
          // poder medir qué canal trae clientes que pagan, no solo visitas.
          ...(getStoredAttribution() ? { acquisition: getStoredAttribution() } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
        console.log('✅ Datos del negocio guardados')
      } catch (businessError) {
        console.error('Error al guardar datos del negocio:', businessError)
        // Continuar aunque falle
      }
    }

    // Crear la suscripción: con el plan pagado si viene del alta manual del
    // superadmin, o trial de 1 día si no se indicó plan (compatibilidad).
    try {
      await createSubscription(
        userCredential.user.uid,
        email,
        displayName || email,
        subscriptionOptions?.plan || 'trial',
        subscriptionOptions || {}
      )
      console.log('✅ Suscripción creada:', subscriptionOptions?.plan || 'trial')
    } catch (subscriptionError) {
      console.error('Error al crear suscripción:', subscriptionError)
      // No fallar el registro si hay error en la suscripción
    }

    return { success: true, user: userCredential.user }
  } catch (error) {
    console.error('Error en registro:', error)
    return { success: false, error: getErrorMessage(error.code || error.message) }
  }
}

/**
 * Series por defecto de una cuenta nueva.
 *
 * Van DUPLICADAS (FF01, BB01…) a propósito, no F001/B001: casi todos los
 * clientes vienen de otro sistema donde ya emitieron con las series estándar,
 * y arrancar de nuevo en F001-00000001 duplicaría números ya declarados —
 * SUNAT rechaza el comprobante. Las series de notas deben empezar con F o B
 * según el documento que afectan (regla SUNAT), así que esas no se duplican.
 * Todas son de 4 caracteres: letra + 3 alfanuméricos.
 *
 * La lista vive en la semilla, no aquí: es el mismo juego que escribe el
 * servidor al crear una cuenta. Tener dos listas era pedir que un día dejaran
 * de coincidir.
 */
export { SERIES_NEGOCIO as DEFAULT_SERIES } from '@/data/semilla'

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
export const registerBusinessAsAdmin = async (email, password, displayName, businessData = null, subscriptionOptions = null) => {
  try {
    // 1. Crear el usuario en la instancia SECUNDARIA (no afecta la sesión del admin).
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    const newUid = userCredential.user.uid
    if (displayName) {
      try { await updateProfile(userCredential.user, { displayName }) } catch (e) { /* no crítico */ }
    }
    // Cerrar la sesión secundaria de inmediato.
    try { await signOut(secondaryAuth) } catch (e) { /* no crítico */ }

    // 2. La SEMILLA, en el servidor: usuario, negocio con sus 40 opciones ya
    //    decididas, sucursal Principal, su almacén y las series. Antes esto se
    //    escribía aquí a mano, y el del reseller lo escribía distinto: por eso
    //    había cuentas sin sucursal y con el nombre en campos que no coincidían.
    //    Ahora los dos caminos llaman al mismo sitio.
    try {
      const idToken = await auth.currentUser.getIdToken()
      const r = await fetch(URL_SEMILLA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid: newUid, datos: { ...(businessData || {}), email, displayName } }),
      })
      const semilla = await r.json()
      if (!semilla.success) throw new Error(semilla.error || 'La semilla no respondió')
    } catch (semillaError) {
      // Sin semilla la cuenta nace coja, que es justo lo que se venía
      // arrastrando. Mejor decirlo que dejarlo pasar en silencio.
      console.error('Error al sembrar la cuenta:', semillaError)
      return {
        success: false,
        error: 'Se creó el acceso pero no se pudo configurar la cuenta. Avísale a soporte con el correo del cliente.',
      }
    }

    // 3. Suscripción: con el plan ya pagado si se indicó, o trial si no. Esta
    //    NO la toca la semilla: los planes, límites y precios pactados tienen
    //    su propia lógica y ya viven en un solo servicio.
    try {
      await createSubscription(
        newUid,
        email,
        displayName || email,
        subscriptionOptions?.plan || 'trial',
        subscriptionOptions || {}
      )
    } catch (subscriptionError) {
      console.error('Error al crear suscripción:', subscriptionError)
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
