/**
 * Script para inicializar contadores de uso en suscripciones existentes
 * Ejecutar con: node init-usage-counters.js
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBu_lT5mV-xtG-gqHlDMbNQqxhz8N0tGV0",
  authDomain: "cobrify-395fe.firebaseapp.com",
  projectId: "cobrify-395fe",
  storageBucket: "cobrify-395fe.firebasestorage.app",
  messagingSenderId: "738066412299",
  appId: "1:738066412299:web:e9ad6f062ffe7e74c2ce4f"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function initializeUsageCounters() {
  try {
    console.log('🔧 Inicializando contadores de uso...\n');

    // Obtener todas las suscripciones
    const subscriptionsRef = collection(db, 'subscriptions');
    const snapshot = await getDocs(subscriptionsRef);

    let updated = 0;
    let skipped = 0;

    for (const docSnapshot of snapshot.docs) {
      const subscription = docSnapshot.data();
      const userId = docSnapshot.id;

      // Si ya tiene usage, saltar
      if (subscription.usage) {
        console.log(`⏭️  ${userId}: Ya tiene contador inicializado`);
        skipped++;
        continue;
      }

      // Inicializar contador
      const subscriptionRef = doc(db, 'subscriptions', userId);
      await updateDoc(subscriptionRef, {
        usage: {
          invoicesThisMonth: 0,
          totalCustomers: 0,
          totalProducts: 0
        }
      });

      console.log(`✅ ${userId}: Contador inicializado (${subscription.email || 'sin email'})`);
      updated++;
    }

    console.log('\n🎉 Proceso completado:');
    console.log(`   - Actualizados: ${updated}`);
    console.log(`   - Omitidos: ${skipped}`);
    console.log(`   - Total: ${updated + skipped}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error al inicializar contadores:', error);
    process.exit(1);
  }
}

initializeUsageCounters();
