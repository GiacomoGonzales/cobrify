/**
 * Script de migración para crear suscripciones para usuarios existentes
 *
 * INSTRUCCIONES DE USO:
 * 1. Abre la consola del navegador en tu aplicación (F12)
 * 2. Copia y pega este código en la consola
 * 3. Ejecuta: await migrateExistingUsers()
 *
 * NOTA: Solo los administradores pueden ejecutar este script
 */

import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createSubscription, getSubscription } from '../services/subscriptionService';

export async function migrateExistingUsers() {
  console.log('🚀 Iniciando migración de usuarios...');

  try {
    // Obtener todos los negocios (cada negocio representa un usuario)
    const businessesRef = collection(db, 'businesses');
    const businessesSnapshot = await getDocs(businessesRef);

    console.log(`📊 Se encontraron ${businessesSnapshot.size} negocios registrados`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const businessDoc of businessesSnapshot.docs) {
      const userId = businessDoc.id;
      const businessData = businessDoc.data();

      try {
        // Verificar si ya tiene suscripción
        const existingSubscription = await getSubscription(userId);

        if (existingSubscription) {
          console.log(`⏭️  Usuario ${businessData.businessName || userId} ya tiene suscripción, omitiendo...`);
          skipped++;
          continue;
        }

        // Crear suscripción con plan básico por defecto
        const email = businessData.email || `user_${userId}@cobrify.com`;
        const businessName = businessData.businessName || 'Sin nombre';

        // Crear con plan básico y 30 días de acceso
        await createSubscription(userId, email, businessName, 'basic');

        console.log(`✅ Suscripción creada para: ${businessName} (${email})`);
        migrated++;

      } catch (error) {
        console.error(`❌ Error al migrar usuario ${userId}:`, error);
        errors++;
      }
    }

    console.log('\n📈 Resumen de migración:');
    console.log(`   - Migrados: ${migrated}`);
    console.log(`   - Omitidos (ya existían): ${skipped}`);
    console.log(`   - Errores: ${errors}`);
    console.log(`   - Total procesados: ${businessesSnapshot.size}`);
    console.log('\n✨ Migración completada');

    return {
      success: true,
      migrated,
      skipped,
      errors,
      total: businessesSnapshot.size
    };

  } catch (error) {
    console.error('💥 Error fatal durante la migración:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// También exportar una función para crear admin manualmente
export async function createAdminUser(userId) {
  console.log(`🔐 Creando usuario administrador...`);

  try {
    const { doc: docRef, setDoc } = await import('firebase/firestore');
    const { db } = await import('../lib/firebase');
    const { serverTimestamp } = await import('firebase/firestore');

    // Obtener información del usuario
    const businessRef = docRef(db, 'businesses', userId);
    const businessSnap = await getDoc(businessRef);

    if (!businessSnap.exists()) {
      throw new Error('Usuario no encontrado');
    }

    const businessData = businessSnap.data();

    // Crear documento en la colección admins
    const adminRef = docRef(db, 'admins', userId);
    await setDoc(adminRef, {
      email: businessData.email || '',
      role: 'admin',
      createdAt: serverTimestamp()
    });

    console.log(`✅ Usuario ${businessData.email} ahora es administrador`);
    console.log('🔄 Recarga la página para que los cambios tomen efecto');

    return { success: true };

  } catch (error) {
    console.error('❌ Error al crear admin:', error);
    return { success: false, error: error.message };
  }
}

// Función helper para verificar el estado de migración
export async function checkMigrationStatus() {
  try {
    const businessesRef = collection(db, 'businesses');
    const subscriptionsRef = collection(db, 'subscriptions');

    const [businessesSnapshot, subscriptionsSnapshot] = await Promise.all([
      getDocs(businessesRef),
      getDocs(subscriptionsRef)
    ]);

    const totalBusinesses = businessesSnapshot.size;
    const totalSubscriptions = subscriptionsSnapshot.size;
    const pending = totalBusinesses - totalSubscriptions;

    console.log('📊 Estado de migración:');
    console.log(`   - Total de negocios: ${totalBusinesses}`);
    console.log(`   - Suscripciones creadas: ${totalSubscriptions}`);
    console.log(`   - Pendientes de migrar: ${pending}`);

    if (pending > 0) {
      console.log('\n⚠️  Hay usuarios pendientes de migración');
      console.log('   Ejecuta: await migrateExistingUsers()');
    } else {
      console.log('\n✅ Todos los usuarios han sido migrados');
    }

    return {
      totalBusinesses,
      totalSubscriptions,
      pending
    };

  } catch (error) {
    console.error('Error al verificar estado:', error);
    return null;
  }
}

// Hacer las funciones disponibles globalmente en desarrollo
if (import.meta.env.DEV) {
  window.migrateExistingUsers = migrateExistingUsers;
  window.createAdminUser = createAdminUser;
  window.checkMigrationStatus = checkMigrationStatus;
}
