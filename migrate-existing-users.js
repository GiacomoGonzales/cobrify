/**
 * Script para migrar usuarios existentes a Business Owners
 *
 * Este script marca todos los usuarios que no tienen documento en la colección 'users'
 * como Business Owners (isBusinessOwner: true)
 *
 * EJECUTAR UNA SOLA VEZ:
 * node migrate-existing-users.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateUsers() {
  try {
    console.log('🔄 Iniciando migración de usuarios...\n');

    // 1. Obtener todos los usuarios de Firebase Auth
    const listUsersResult = await admin.auth().listUsers();
    const authUsers = listUsersResult.users;

    console.log(`📊 Total usuarios en Firebase Auth: ${authUsers.length}\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 2. Para cada usuario de Auth, verificar si existe en Firestore
    for (const authUser of authUsers) {
      const userId = authUser.uid;
      const email = authUser.email;

      try {
        // Verificar si ya existe en la colección 'users'
        const userDocRef = db.collection('users').doc(userId);
        const userDoc = await userDocRef.get();

        if (userDoc.exists()) {
          const userData = userDoc.data();

          // Si ya tiene isBusinessOwner o ownerId, skip
          if (userData.isBusinessOwner === true) {
            console.log(`⏭️  ${email} - Ya es Business Owner (skip)`);
            skippedCount++;
            continue;
          }

          if (userData.ownerId) {
            console.log(`⏭️  ${email} - Es sub-usuario (skip)`);
            skippedCount++;
            continue;
          }

          // Si existe pero no tiene ninguno de los dos, actualizar
          await userDocRef.update({
            isBusinessOwner: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          console.log(`✅ ${email} - Actualizado a Business Owner`);
          migratedCount++;
        } else {
          // No existe en Firestore, crear documento
          await userDocRef.set({
            uid: userId,
            email: email,
            isBusinessOwner: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            allowedPages: [], // Business owners tienen acceso total
            isActive: true,
            migratedFrom: 'auth', // Flag para identificar usuarios migrados
          });

          console.log(`✅ ${email} - Creado como Business Owner`);
          migratedCount++;
        }
      } catch (error) {
        console.error(`❌ Error con ${email}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n========================================');
    console.log('📊 RESUMEN DE MIGRACIÓN:');
    console.log('========================================');
    console.log(`✅ Migrados: ${migratedCount}`);
    console.log(`⏭️  Omitidos: ${skippedCount}`);
    console.log(`❌ Errores: ${errorCount}`);
    console.log(`📊 Total procesados: ${authUsers.length}`);
    console.log('========================================\n');

    if (migratedCount > 0) {
      console.log('🎉 Migración completada exitosamente!');
      console.log('👉 Todos los usuarios ahora pueden acceder a sus páginas.');
    } else {
      console.log('ℹ️  No se encontraron usuarios para migrar.');
    }

  } catch (error) {
    console.error('💥 Error fatal durante la migración:', error);
  } finally {
    // Cerrar la conexión
    process.exit(0);
  }
}

// Ejecutar migración
migrateUsers();
