import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'

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

// Configuración de Firebase desde variables de entorno
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

// Inicializar Firebase
let app
let auth
let db
let storage
let functions

try {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
  storage = getStorage(app)
  functions = getFunctions(app)

  // Conectar al emulador de Functions en desarrollo
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    connectFunctionsEmulator(functions, 'localhost', 5001)
    console.log('🔧 Usando emulador de Firebase Functions')
  }

  console.log('✅ Firebase inicializado correctamente')
} catch (error) {
  console.error('❌ Error al inicializar Firebase:', error)
}

export { app, auth, db, storage, functions }
