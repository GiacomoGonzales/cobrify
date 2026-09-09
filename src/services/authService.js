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
import { createSubscription, PLANS } from './subscriptionService'
import { setAsBusinessOwner } from './adminService'
import { getStoredAttribution } from '@/utils/attribution'

/**
 * La semilla de cuenta nueva vive en el servidor: es la MISMA para el alta del
 * admin, la del reseller, el formulario del cliente y el chat. Ver
 * `functions/src/services/semillaService.js`.
 */
const URL_SEMILLA = 'https://us-central1-cobrify-395fe.cloudfunctions.net/sembrarCuentaNueva'
/** Crea la cuenta entera —acceso, semilla y plan— o no crea nada. */
const URL_CREAR_CUENTA = 'https://us-central1-cobrify-395fe.cloudfunctions.net/crearCuentaCompleta'

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

    // A partir de acá, si algo falla se DESHACE el acceso recién creado.
    //
    // Antes cada paso iba en su propio try/catch que anotaba el error y seguía
    // adelante: la cuenta de Firebase quedaba viva sin ficha, sin negocio o sin
    // plan, y el registro respondía "listo". Así nacieron 101 accesos huérfanos
    // en diez meses. Un registro a medias es peor que un registro fallido: el
    // correo queda ocupado, la persona cree que tiene cuenta, y al entrar cae en
    // un sistema vacío.
    const deshacer = async (paso, error) => {
      console.error(`Registro fallido en "${paso}":`, error)
      try {
        await userCredential.user.delete()
        console.log('🧹 Acceso deshecho: el correo queda libre para reintentar')
      } catch (e) {
        // Si ni siquiera se puede borrar el acceso, al menos que quede dicho:
        // es el caso que hay que ir a limpiar a mano.
        console.error('No se pudo deshacer el acceso, queda huérfano:', userCredential.user.uid, e)
      }
    }

    // Marcar como Business Owner (dueño del negocio)
    try {
      await setAsBusinessOwner(userCredential.user.uid, email, displayName)
      console.log('✅ Usuario marcado como Business Owner automáticamente')
    } catch (ownerError) {
      await deshacer('marcar como dueño', ownerError)
      return { success: false, error: 'No se pudo crear la cuenta. Vuelve a intentarlo.' }
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
        await deshacer('guardar el negocio', businessError)
        return { success: false, error: 'No se pudieron guardar los datos del negocio. Vuelve a intentarlo.' }
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
      // Sin plan la cuenta no abre: es justo el estado "a medio crear" que se ve
      // en el admin. Mejor no dejarla nacer.
      await deshacer('crear la suscripción', subscriptionError)
      return { success: false, error: 'No se pudo activar el plan. Vuelve a intentarlo.' }
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
 * Crear una cuenta de negocio COMPLETA desde el panel de administración.
 *
 * UNA sola llamada al servidor, que hace las tres cosas —el acceso, la semilla
 * y el plan— y las deshace todas si alguna falla.
 *
 * Antes se hacían aquí, en tres pasos: se creaba el acceso con la instancia
 * secundaria de Auth y luego se escribían los documentos. El acceso va primero
 * porque de él sale el identificador que necesita el resto, así que cuando algo
 * fallaba después quedaba un acceso sin cuenta. Y esas cuentas son INVISIBLES
 * en el panel, que lista por suscripción: el 07-sep-2026 había diez, la más
 * vieja de febrero. Por eso el trabajo se mudó entero al servidor.
 */
export const registerBusinessAsAdmin = async (email, password, displayName, businessData = null, subscriptionOptions = null) => {
  try {
    const idToken = await auth.currentUser.getIdToken()
    const plan = subscriptionOptions?.plan ? PLANS[subscriptionOptions.plan] : null
    const r = await fetch(URL_CREAR_CUENTA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        email,
        password,
        // De dónde vino el cliente, capturado por la landing en su primera
        // visita. Viajaba hasta el navegador y ahí moría: el único sitio que lo
        // guardaba era `registerUser`, que no lo llama nadie.
        datos: { ...(businessData || {}), email, displayName, acquisition: getStoredAttribution() },
        plan: {
          id: subscriptionOptions?.plan || 'trial',
          meses: plan?.months || 1,
          // El monto pagado manda sobre el de catálogo: queda congelado como
          // su precio de renovación.
          precio: subscriptionOptions?.renewalPrice
            ?? subscriptionOptions?.initialPayment?.amount
            ?? null,
          limites: plan?.limits || null,
          metodo: subscriptionOptions?.initialPayment?.method || 'manual',
        },
      }),
    })
    const datos = await r.json()
    if (!datos.success) {
      console.error('Error creando la cuenta:', datos.motivo || datos.error)
      return { success: false, error: datos.error || 'No se pudo crear la cuenta' }
    }
    return { success: true, userId: datos.uid }
  } catch (error) {
    console.error('Error en registro (admin):', error)
    return { success: false, error: 'No se pudo crear la cuenta. Revisa tu conexión.' }
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
