import { initializeApp } from 'firebase/app'
import { getAuth, indexedDBLocalPersistence, initializeAuth, inMemoryPersistence, browserLocalPersistence } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { Capacitor } from '@capacitor/core'

// Silenciar warnings internos de Firestore en desarrollo
if (import.meta.env.DEV) {
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args) => {
    const message = args[0]?.toString() || '';
    // Filtrar warnings específicos de BloomFilter y otros internos de Firestore
    if (message.includes('BloomFilter') ||
        message.includes('@firebase/firestore') && message.includes('error:')) {
      return;
    }
    originalWarn.apply(console, args);
  };

  console.error = (...args) => {
    const message = args[0]?.toString() || '';
    // Filtrar errores específicos de BloomFilter
    if (message.includes('BloomFilter')) {
      return;
    }
    originalError.apply(console, args);
  };
}

// Detectar si estamos en una plataforma nativa (Android/iOS)
const isNative = Capacitor.isNativePlatform()

// Configuración de Firebase
// En plataformas nativas (Android/iOS), usamos la API key de Android que no tiene restricciones HTTP
// En web, usamos la API key con restricciones HTTP configuradas
const firebaseConfig = {
  apiKey: isNative
    ? 'AIzaSyBwo1ZQisEzdehrLFATBVzQtgXI5aBJi_k'  // API Key de Android (sin restricciones HTTP)
    : import.meta.env.VITE_FIREBASE_API_KEY,        // API Key de Web (con restricciones HTTP)
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

console.log('🔥 Firebase config:', {
  platform: isNative ? 'Native (Android/iOS)' : 'Web',
  apiKey: firebaseConfig.apiKey.substring(0, 20) + '...',
  projectId: firebaseConfig.projectId
})

// Inicializar Firebase
let app
let auth
let db
let storage
let functions

/**
 * ¿Esta copia de la app corre dentro de un iframe?
 *
 * La vista previa de temas del catálogo (Configuración > Mi Catálogo Online)
 * carga la app REAL dentro de un iframe del mismo origen. Ahí Firebase Auth
 * arranca otra vez sobre el MISMO almacenamiento de sesión que la pestaña, y
 * las dos instancias se sincronizan entre sí: si la del iframe concluye que no
 * hay usuario, la pestaña se entera y manda al login. Ese era el síntoma —
 * tocar "Vista previa" y aparecer en la pantalla de inicio de sesión.
 *
 * Dentro de un iframe la sesión va EN MEMORIA: el catálogo es público y no
 * necesita ninguna, y así no toca la del usuario que está trabajando.
 */
const dentroDeIframe = (() => {
  try {
    return typeof window !== 'undefined' && window.self !== window.top
  } catch {
    // Comparar ya lanzó cross-origin: estamos embebidos.
    return true
  }
})()

try {
  app = initializeApp(firebaseConfig)

  if (dentroDeIframe) {
    auth = initializeAuth(app, { persistence: inMemoryPersistence })
    console.log('🔐 Auth en memoria: la app corre embebida (vista previa)')
  } else if (isNative) {
    // En plataformas nativas (Android/iOS), usar persistencia IndexedDB
    auth = initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
    })
    console.log('🔐 Auth inicializado con persistencia LOCAL (IndexedDB) para móvil')
  } else {
    // En web, usar la inicialización estándar (persistencia por defecto)
    auth = getAuth(app)
    console.log('🔐 Auth inicializado con persistencia estándar para web')
  }

  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: 100 * 1024 * 1024 // 100MB límite
    })
  })
  storage = getStorage(app)
  functions = getFunctions(app)

  // Conectar al emulador de Functions en desarrollo
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    connectFunctionsEmulator(functions, 'localhost', 5001)
    console.log('🔧 Usando emulador de Firebase Functions')
  }
} catch (error) {
  console.error('❌ Error al inicializar Firebase:', error)
}

// Segunda instancia de Firebase para crear usuarios sin afectar la sesión actual
// Esto es necesario porque createUserWithEmailAndPassword automáticamente hace login
let secondaryApp
let secondaryAuth

try {
  secondaryApp = initializeApp(firebaseConfig, 'secondary')
  // Usar inMemoryPersistence para el auth secundario — no necesitamos persistir sesión
  // ya que solo se usa para crear usuarios y se hace signOut inmediatamente.
  // En iOS, getAuth() usa Keychain por defecto y puede trabarse con una segunda instancia.
  secondaryAuth = initializeAuth(secondaryApp, {
    persistence: inMemoryPersistence
  })
  console.log('🔐 Secondary Auth inicializado para crear usuarios')
} catch (error) {
  // Si ya existe, obtenerla
  console.log('⚠️ Secondary app ya existe o error:', error.message)
  try {
    secondaryAuth = getAuth(secondaryApp)
  } catch (e) {
    console.error('❌ No se pudo obtener secondaryAuth:', e.message)
  }
}

// ============================================================================
// AUTH DEL CATÁLOGO PÚBLICO (clientes compradores)
// ============================================================================
// Instancia SEPARADA de la sesión de la app. Motivo: el catálogo es público y
// los compradores que se registran NO son usuarios del sistema. Si compartieran
// la instancia principal, AuthContext los tomaría por usuarios de negocio (hoy,
// sin doc en `users/{uid}`, igual abre sesión con permisos vacíos) y además
// registrarse en el catálogo cerraría la sesión del dueño en la misma pestaña.
//
// Comparten el mismo pool de Firebase Auth (misma cuenta de Google sirve para
// ambos), pero la SESIÓN es independiente: cada instancia guarda su token por
// separado, así que iniciar sesión aquí no toca la sesión de la app.
let catalogApp
let catalogAuth

try {
  catalogApp = initializeApp(firebaseConfig, 'catalog')
  catalogAuth = initializeAuth(catalogApp, {
    // El comprador espera seguir logueado entre visitas (a diferencia del auth
    // secundario, que es efímero). Web usa browserLocalPersistence.
    // En una vista previa embebida tampoco se guarda la sesión del comprador:
    // es una muestra del tema, no una tienda para comprar.
    persistence: dentroDeIframe
      ? inMemoryPersistence
      : (Capacitor.isNativePlatform() ? indexedDBLocalPersistence : browserLocalPersistence),
  })
} catch (error) {
  try {
    catalogAuth = getAuth(catalogApp)
  } catch (e) {
    console.error('❌ No se pudo obtener catalogAuth:', e.message)
  }
}

// Firestore ATADO a la app del catálogo. CRÍTICO: cada instancia de Firestore
// toma el token de la app con la que se inicializó. `db` cuelga de la app
// principal, así que las escrituras del comprador hechas con `db` viajarían
// SIN su sesión (request.auth = null) y las reglas las rechazarían.
// Todo lo que dependa de la identidad del comprador (su perfil, direcciones,
// historial de pedidos) debe usar `catalogDb`.
// Sin persistencia local: la caché multi-pestaña ya la usa la app principal y
// dos instancias persistentes en el mismo navegador se pelean por el lock.
let catalogDb
try {
  catalogDb = getFirestore(catalogApp)
} catch (e) {
  console.error('❌ No se pudo obtener catalogDb:', e.message)
}

export { app, auth, db, storage, functions, secondaryAuth, catalogAuth, catalogDb }
