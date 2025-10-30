import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC65h2CU7C9jKH6Vp0r5TQ8lYPHiJd0HZo",
  authDomain: "cobrify-395fe.firebaseapp.com",
  projectId: "cobrify-395fe",
  storageBucket: "cobrify-395fe.firebasestorage.app",
  messagingSenderId: "783072856846",
  appId: "1:783072856846:web:ba13e5d52a9a43fec64ca8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixAdminAccess() {
  try {
    // UID del administrador (necesitas obtenerlo de la consola de Firebase)
    // O puedes ir a /get-my-uid cuando estés logueado
    const adminUID = 'VBbPIgvuxHNlwW5bQPYdAgjnIgV2'; // Reemplaza con tu UID
    
    console.log('🔄 Actualizando suscripción para UID:', adminUID);
    
    const subscriptionRef = doc(db, 'subscriptions', adminUID);
    const subscriptionDoc = await getDoc(subscriptionRef);
    
    if (subscriptionDoc.exists()) {
      const currentData = subscriptionDoc.data();
      console.log('📋 Estado actual:', {
        plan: currentData.plan,
        status: currentData.status,
        accessBlocked: currentData.accessBlocked,
        blockReason: currentData.blockReason
      });
      
      await updateDoc(subscriptionRef, {
        status: 'active',
        accessBlocked: false,
        blockReason: null,
        blockedAt: null,
        updatedAt: serverTimestamp()
      });
      
      console.log('✅ Cuenta reactivada exitosamente');
      console.log('✅ Recarga la página para ver los cambios');
    } else {
      console.log('❌ No se encontró suscripción');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixAdminAccess();
