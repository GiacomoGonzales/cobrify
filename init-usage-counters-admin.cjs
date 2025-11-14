/**
 * Script para inicializar contadores de uso en suscripciones existentes
 * Ejecutar con: node init-usage-counters-admin.cjs
 */

const admin = require('firebase-admin');

// Inicializar Firebase Admin con las credenciales por defecto
admin.initializeApp({
  projectId: 'cobrify-395fe'
});

const db = admin.firestore();

async function initializeUsageCounters() {
  try {
    console.log('🔧 Inicializando contadores de uso...\n');

    // Obtener todas las suscripciones
    const snapshot = await db.collection('subscriptions').get();

    let updated = 0;
    let skipped = 0;

    for (const docSnapshot of snapshot.docs) {
      const subscription = docSnapshot.data();
      const userId = docSnapshot.id;

      // Si ya tiene usage, saltar
      if (subscription.usage) {
        console.log(`⏭️  ${userId}: Ya tiene contador (${subscription.email || 'sin email'})`);
        skipped++;
        continue;
      }

      // Inicializar contador
      await docSnapshot.ref.update({
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
