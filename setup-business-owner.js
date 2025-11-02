// Script para configurar un usuario como Business Owner
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Inicializar Firebase Admin (necesitas las credenciales de servicio)
// Por ahora usaremos la configuración del cliente
import { initializeApp as initializeClientApp } from 'firebase/app';
import { getFirestore as getClientFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth as getClientAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDHpl5bu6-FNUSqI0DT6UDp60MJxX4JgPg",
  authDomain: "cobrify-395fe.firebaseapp.com",
  projectId: "cobrify-395fe",
  storageBucket: "cobrify-395fe.firebasestorage.app",
  messagingSenderId: "756057732358",
  appId: "1:756057732358:web:ca80f5dace44ef0e70a0ca"
};

const app = initializeClientApp(firebaseConfig);
const db = getClientFirestore(app);
const auth = getClientAuth(app);

async function setupBusinessOwner() {
  try {
    // Necesitamos autenticarnos primero
    const email = 'valeryrutte@lapatotashop.com';
    const password = prompt('Ingresa la contraseña de valeryrutte@lapatotashop.com: ');

    console.log('🔐 Iniciando sesión...');
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userId = userCredential.user.uid;

    console.log('✅ Sesión iniciada. UID:', userId);
    console.log('📝 Creando documento de Business Owner...');

    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      uid: userId,
      email: email,
      isBusinessOwner: true,
      createdAt: serverTimestamp(),
      allowedPages: [], // Business owners tienen acceso total
      isActive: true,
    }, { merge: true });

    console.log('✅ Documento creado exitosamente!');
    console.log('🎉 valeryrutte@lapatotashop.com ahora es Business Owner');

  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

setupBusinessOwner();
