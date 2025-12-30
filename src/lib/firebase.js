import { initializeApp } from 'firebase/app'
import { getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth'
import { getFirestore, enableIndexedDbPersistence, CACHE_SIZE_UNLIMITED } from 'firebase/firestore'
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

try {
  app = initializeApp(firebaseConfig)

  // Inicializar Auth con persistencia local explícita
  // Esto asegura que la sesión se mantenga incluso después de cerrar la app
  if (isNative) {
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

  db = getFirestore(app)
  storage = getStorage(app)
  functions = getFunctions(app)

  // Habilitar persistencia offline de Firestore
  // Esto permite que los datos se cacheen localmente y funcionen sin internet
  enableIndexedDbPersistence(db, { cacheSizeBytes: CACHE_SIZE_UNLIMITED })
    .then(() => {
      console.log('📱 Firestore offline persistence habilitada')
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        // Múltiples tabs abiertos, solo puede haber una con persistencia
        console.warn('⚠️ Firestore offline: Múltiples tabs detectadas, persistencia deshabilitada en esta tab')
      } else if (err.code === 'unimplemented') {
        // El navegador no soporta IndexedDB
        console.warn('⚠️ Firestore offline: Navegador no soporta persistencia offline')
      } else {
        console.error('❌ Error habilitando Firestore offline:', err)
      }
    })

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
  secondaryAuth = getAuth(secondaryApp)
  console.log('🔐 Secondary Auth inicializado para crear usuarios')
} catch (error) {
  // Si ya existe, obtenerla
  console.log('⚠️ Secondary app ya existe o error:', error.message)
}

export { app, auth, db, storage, functions, secondaryAuth }
