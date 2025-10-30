// Script simple para configurar giiacomo@gmail.com como admin
// NO requiere serviceAccountKey.json
// Ejecutar: node setup-admin-simple.js

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBKRnXbahmNyYs7-KNQnHOxDAbo90veto4",
  authDomain: "cobrify-395fe.firebaseapp.com",
  projectId: "cobrify-395fe",
  storageBucket: "cobrify-395fe.firebasestorage.app",
  messagingSenderId: "685843504415",
  appId: "1:685843504415:web:5802605930a93494e7642a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function setupAdmin() {
  console.log('🚀 Configurando usuario administrador para giiacomo@gmail.com\n');

  try {
    // 1. Iniciar sesión con el usuario
    console.log('🔐 Iniciando sesión...');
    const userCredential = await signInWithEmailAndPassword(
      auth,
      'giiacomo@gmail.com',
      'holahola'
    );
    const userId = userCredential.user.uid;

    console.log('✅ Sesión iniciada correctamente!');
    console.log(`   UID: ${userId}\n`);

    // 2. Crear documento de administrador
    console.log('👑 Configurando como administrador...');
    await setDoc(doc(db, 'admins', userId), {
      email: 'giiacomo@gmail.com',
      role: 'admin',
      createdAt: serverTimestamp()
    });
    console.log('✅ Usuario configurado como administrador\n');

    // 3. Verificar si ya tiene suscripción
    console.log('📋 Verificando suscripción...');
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscriptionDoc = await getDoc(subscriptionRef);

    const now = new Date();
    const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    if (subscriptionDoc.exists()) {
      // Actualizar suscripción existente
      console.log('📝 Actualizando suscripción existente...');
      await setDoc(subscriptionRef, {
        status: 'active',
        accessBlocked: false,
        blockReason: null,
        blockedAt: null,
        plan: 'enterprise',
        monthlyPrice: 0,
        currentPeriodEnd: Timestamp.fromDate(oneYearLater),
        nextPaymentDate: Timestamp.fromDate(oneYearLater),
        updatedAt: serverTimestamp()
      }, { merge: true });
      console.log('✅ Suscripción actualizada\n');
    } else {
      // Crear nueva suscripción
      console.log('📝 Creando nueva suscripción...');
      await setDoc(subscriptionRef, {
        userId: userId,
        email: 'giiacomo@gmail.com',
        businessName: 'Administrador Principal',
        plan: 'enterprise',
        status: 'active',
        startDate: Timestamp.fromDate(now),
        currentPeriodStart: Timestamp.fromDate(now),
        currentPeriodEnd: Timestamp.fromDate(oneYearLater),
        trialEndsAt: null,
        lastPaymentDate: Timestamp.fromDate(now),
        nextPaymentDate: Timestamp.fromDate(oneYearLater),
        paymentMethod: 'Administrador',
        monthlyPrice: 0,
        accessBlocked: false,
        blockReason: null,
        blockedAt: null,
        limits: {
          maxInvoicesPerMonth: -1,
          maxCustomers: -1,
          maxProducts: -1,
          sunatIntegration: true,
          multiUser: true
        },
        usage: {
          invoicesThisMonth: 0,
          totalCustomers: 0,
          totalProducts: 0
        },
        paymentHistory: [{
          date: Timestamp.fromDate(now),
          amount: 0,
          method: 'Admin Setup',
          status: 'completed',
          registeredBy: 'system'
        }],
        notes: 'Cuenta de administrador principal - Acceso ilimitado',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log('✅ Suscripción creada\n');
    }

    console.log('═══════════════════════════════════════════\n');
    console.log('🎉 ¡CONFIGURACIÓN COMPLETADA EXITOSAMENTE!\n');
    console.log('═══════════════════════════════════════════\n');
    console.log('📊 Resumen de la configuración:\n');
    console.log('  ✅ Email: giiacomo@gmail.com');
    console.log('  ✅ UID:', userId);
    console.log('  ✅ Rol: ADMINISTRADOR');
    console.log('  ✅ Plan: Enterprise (Ilimitado)');
    console.log('  ✅ Precio: S/ 0 (Gratis)');
    console.log('  ✅ Válido hasta:', oneYearLater.toLocaleDateString('es-PE'));
    console.log('  ✅ Estado: ACTIVO');
    console.log('  ✅ Acceso bloqueado: NO\n');
    console.log('═══════════════════════════════════════════\n');
    console.log('🚀 Próximos pasos:\n');
    console.log('  1. Recarga la página en tu navegador (Ctrl + Shift + R)');
    console.log('  2. Inicia sesión con:');
    console.log('     Email: giiacomo@gmail.com');
    console.log('     Contraseña: holahola');
    console.log('  3. Deberías ver el menú "Gestión de Usuarios"\n');
    console.log('═══════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR:', error.message, '\n');

    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
      console.error('🔴 La contraseña es incorrecta o el usuario no existe.');
      console.error('   Verifica que la contraseña sea: holahola');
      console.error('   O actualízala en Firebase Console → Authentication\n');
    } else if (error.code === 'auth/network-request-failed') {
      console.error('🔴 Error de conexión a Firebase.');
      console.error('   Verifica tu conexión a internet.\n');
    } else {
      console.error('Detalles del error:', error);
    }

    console.error('💡 Posibles soluciones:');
    console.error('  1. Verifica que el usuario giiacomo@gmail.com existe en Firebase Authentication');
    console.error('  2. Actualiza la contraseña a "holahola" en Firebase Console');
    console.error('  3. Verifica que las variables de entorno de Firebase estén configuradas');
    console.error('  4. Verifica tu archivo .env o .env.local\n');

    process.exit(1);
  }
}

setupAdmin();
