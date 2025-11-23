// Script de migración de compras para ejecutar desde la consola del navegador
// INSTRUCCIONES:
// 1. Abre tu app en el navegador y logueate como administrador
// 2. Abre la consola del navegador (F12)
// 3. Copia y pega todo este código
// 4. Presiona Enter

(async function migratePurchases() {
  console.log('🔄 Iniciando migración de compras desde el navegador...\n');

  try {
    const { collection, getDocs, doc, writeBatch, getFirestore } = window.firebase?.firestore
      ? window.firebase.firestore
      : await import('firebase/firestore');

    const db = getFirestore();

    // 1. Obtener todos los usuarios
    const usersSnapshot = await getDocs(collection(db, 'users'));
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
      const purchasesRef = collection(db, 'businesses', userId, 'purchases');
      const purchasesSnapshot = await getDocs(purchasesRef);

      if (purchasesSnapshot.empty) {
        console.log(`   └─ ✓ No tiene compras para migrar`);
        continue;
      }

      console.log(`   └─ 📦 Compras encontradas: ${purchasesSnapshot.size}`);
      usersWithPurchases++;

      // 4. Migrar cada compra a la colección del dueño
      const batch = writeBatch(db);
      let batchCount = 0;

      for (const purchaseDoc of purchasesSnapshot.docs) {
        const purchaseData = purchaseDoc.data();
        const purchaseId = purchaseDoc.id;

        // Crear la compra en la ubicación correcta (colección del dueño)
        const newPurchaseRef = doc(db, 'businesses', ownerId, 'purchases', purchaseId);
        batch.set(newPurchaseRef, purchaseData);

        // Eliminar de la ubicación incorrecta
        batch.delete(purchaseDoc.ref);

        batchCount++;
        totalPurchasesMigrated++;

        // Firestore tiene un límite de 500 operaciones por batch
        if (batchCount >= 500) {
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
    } else {
      console.log('🎉 ¡Recarga la página para ver las compras migradas!\n');
    }

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    console.error('Detalles:', error.message);
  }
})();
