import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'

// Función HTTP TEMPORAL para migrar compras de usuarios secundarios
// NO REQUIERE AUTENTICACIÓN - SOLO PARA MIGRACIÓN ÚNICA
export const migratePurchasesHTTP = onRequest({
  cors: true,
  invoker: 'public'
}, async (req, res) => {
  const db = getFirestore()

  // Solo permitir método POST para mayor seguridad
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const uid = 'migration-script' // Identificador para logs

  try {
    console.log(`🔄 Migración iniciada por usuario: ${uid}`);

    // Verificar que el usuario es admin o business owner
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    // Si tiene ownerId, es usuario secundario y no puede ejecutar la migración
    if (userData && userData.ownerId) {
      throw new HttpsError(
        'permission-denied',
        'Solo administradores pueden ejecutar esta migración.'
      );
    }

    // 1. Obtener todos los usuarios
    const usersSnapshot = await db.collection('users').get();
    console.log(`📋 Total de usuarios encontrados: ${usersSnapshot.size}`);

    let totalPurchasesMigrated = 0;
    let usersWithPurchases = 0;
    const logs = [];

    logs.push(`📋 Total de usuarios encontrados: ${usersSnapshot.size}`);

    // 2. Para cada usuario secundario (que tiene ownerId)
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;

      // Solo procesar usuarios secundarios
      if (!userData.ownerId) {
        continue;
      }

      const ownerId = userData.ownerId;
      console.log(`👤 Usuario secundario: ${userData.email || userId}`);
      logs.push(`👤 Usuario secundario: ${userData.email || userId}`);
      logs.push(`   └─ Owner ID: ${ownerId}`);

      // 3. Obtener las compras del usuario secundario
      const purchasesRef = db.collection('businesses').doc(userId).collection('purchases');
      const purchasesSnapshot = await purchasesRef.get();

      if (purchasesSnapshot.empty) {
        console.log(`   └─ ✓ No tiene compras para migrar`);
        logs.push(`   └─ ✓ No tiene compras para migrar`);
        continue;
      }

      console.log(`   └─ 📦 Compras encontradas: ${purchasesSnapshot.size}`);
      logs.push(`   └─ 📦 Compras encontradas: ${purchasesSnapshot.size}`);
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
          logs.push(`      └─ Batch de ${batchCount} compras migradas`);
          batchCount = 0;
        }
      }

      // Ejecutar el batch restante si hay operaciones pendientes
      if (batchCount > 0) {
        await batch.commit();
        console.log(`      └─ ✓ ${purchasesSnapshot.size} compras migradas correctamente`);
        logs.push(`      └─ ✓ ${purchasesSnapshot.size} compras migradas correctamente`);
      }
    }

    const stats = {
      usersWithPurchases,
      totalPurchasesMigrated,
    };

    console.log('✅ MIGRACIÓN COMPLETADA');
    console.log(`📊 Estadísticas:`, stats);

    res.status(200).json({
      success: true,
      stats,
      logs,
      message: totalPurchasesMigrated > 0
        ? `Migración completada: ${totalPurchasesMigrated} compras migradas de ${usersWithPurchases} usuarios.`
        : 'No se encontraron compras para migrar.'
    });

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
