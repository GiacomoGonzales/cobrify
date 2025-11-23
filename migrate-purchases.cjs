const admin = require('firebase-admin');

// Inicializar Firebase Admin usando Application Default Credentials
// O puedes configurar GOOGLE_APPLICATION_CREDENTIALS en las variables de entorno
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: 'cobrify-395fe'
    });
  } catch (error) {
    console.error('❌ Error al inicializar Firebase Admin.');
    console.error('Por favor, ejecuta primero:');
    console.error('  gcloud auth application-default login');
    console.error('O configura la variable de entorno GOOGLE_APPLICATION_CREDENTIALS\n');
    process.exit(1);
  }
}

const db = admin.firestore();

async function migratePurchases() {
  console.log('🔄 Iniciando migración de compras...\n');

  try {
    // 1. Obtener todos los usuarios
    const usersSnapshot = await db.collection('users').get();
    console.log(`📋 Total de usuarios encontrados: ${usersSnapshot.size}\n`);

    let totalPurchasesMigrated = 0;
    let usersWithPurchases = 0;

    // 2. Para cada usuario secundario (que tiene ownerId)
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;

      // Solo procesar usuarios secundarios
      if (!userData.ownerId) {
        continue;
      }

      const ownerId = userData.ownerId;
      console.log(`\n👤 Usuario secundario: ${userData.email || userId}`);
      console.log(`   └─ Owner ID: ${ownerId}`);

      // 3. Obtener las compras del usuario secundario
      const purchasesRef = db.collection('businesses').doc(userId).collection('purchases');
      const purchasesSnapshot = await purchasesRef.get();

      if (purchasesSnapshot.empty) {
        console.log(`   └─ ✓ No tiene compras para migrar`);
        continue;
      }

      console.log(`   └─ 📦 Compras encontradas: ${purchasesSnapshot.size}`);
      usersWithPurchases++;

      // 4. Migrar cada compra a la colección del dueño
      const batch = db.batch();
      let batchCount = 0;
      const MAX_BATCH_SIZE = 500;

      for (const purchaseDoc of purchasesSnapshot.docs) {
        const purchaseData = purchaseDoc.data();
        const purchaseId = purchaseDoc.id;

        // Crear la compra en la ubicación correcta (colección del dueño)
        const newPurchaseRef = db.collection('businesses').doc(ownerId).collection('purchases').doc(purchaseId);
        batch.set(newPurchaseRef, purchaseData);

        // Eliminar de la ubicación incorrecta
        batch.delete(purchaseDoc.ref);

        batchCount++;
        totalPurchasesMigrated++;

        // Ejecutar batch si alcanzamos el límite
        if (batchCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          console.log(`      └─ Batch de ${batchCount} compras migradas`);
          batchCount = 0;
        }
      }

      // Ejecutar el batch restante si hay operaciones pendientes
      if (batchCount > 0) {
        await batch.commit();
        console.log(`      └─ ✓ ${purchasesSnapshot.size} compras migradas correctamente`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRACIÓN COMPLETADA');
    console.log('='.repeat(60));
    console.log(`📊 Estadísticas:`);
    console.log(`   - Usuarios con compras migradas: ${usersWithPurchases}`);
    console.log(`   - Total de compras migradas: ${totalPurchasesMigrated}`);
    console.log('='.repeat(60) + '\n');

    if (totalPurchasesMigrated === 0) {
      console.log('ℹ️  No se encontraron compras para migrar. Todas las compras ya están en la ubicación correcta.\n');
    }

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  }
}

// Ejecutar la migración
migratePurchases()
  .then(() => {
    console.log('✅ Script finalizado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
