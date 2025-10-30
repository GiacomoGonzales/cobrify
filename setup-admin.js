// Script para configurar giiacomo@gmail.com como administrador
// Ejecutar con: node setup-admin.js

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Leer la configuración de Firebase desde las variables de entorno o serviceAccount
const serviceAccount = JSON.parse(
  readFileSync('./serviceAccountKey.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function setupAdmin() {
  console.log('🚀 Configurando usuario administrador...\n');

  try {
    // 1. Buscar el usuario por email
    console.log('📧 Buscando usuario: giiacomo@gmail.com');
    const userRecord = await admin.auth().getUserByEmail('giiacomo@gmail.com');
    const userId = userRecord.uid;

    console.log('✅ Usuario encontrado!');
    console.log(`   UID: ${userId}\n`);

    // 2. Crear documento de administrador
    console.log('🔐 Creando documento de administrador...');
    await db.collection('admins').doc(userId).set({
      email: 'giiacomo@gmail.com',
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Usuario configurado como administrador\n');

    // 3. Verificar si ya tiene suscripción
    console.log('📋 Verificando suscripción...');
    const subscriptionDoc = await db.collection('subscriptions').doc(userId).get();

    if (subscriptionDoc.exists()) {
      // Actualizar suscripción existente
      console.log('📝 Actualizando suscripción existente...');
      await db.collection('subscriptions').doc(userId).update({
        status: 'active',
        accessBlocked: false,
        blockReason: null,
        blockedAt: null,
        plan: 'enterprise',
        monthlyPrice: 0,
        currentPeriodEnd: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // +1 año
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✅ Suscripción actualizada\n');
    } else {
      // Crear nueva suscripción
      console.log('📝 Creando nueva suscripción...');
      const now = new Date();
      const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      await db.collection('subscriptions').doc(userId).set({
        userId: userId,
        email: 'giiacomo@gmail.com',
        businessName: 'Administrador',
        plan: 'enterprise',
        status: 'active',
        startDate: admin.firestore.Timestamp.fromDate(now),
        currentPeriodStart: admin.firestore.Timestamp.fromDate(now),
        currentPeriodEnd: admin.firestore.Timestamp.fromDate(oneYearLater),
        trialEndsAt: null,
        lastPaymentDate: admin.firestore.Timestamp.fromDate(now),
        nextPaymentDate: admin.firestore.Timestamp.fromDate(oneYearLater),
        paymentMethod: 'Admin',
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
        paymentHistory: [],
        notes: 'Cuenta de administrador principal',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✅ Suscripción creada\n');
    }

    console.log('🎉 ¡CONFIGURACIÓN COMPLETADA!\n');
    console.log('Resumen:');
    console.log('  ✅ Usuario: giiacomo@gmail.com');
    console.log('  ✅ Rol: Administrador');
    console.log('  ✅ Plan: Enterprise (Ilimitado)');
    console.log('  ✅ Válido hasta:', oneYearLater.toLocaleDateString());
    console.log('  ✅ Acceso: ACTIVO\n');
    console.log('👉 Ahora puedes iniciar sesión con:');
    console.log('   Email: giiacomo@gmail.com');
    console.log('   Contraseña: holahola\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nPosibles soluciones:');
    console.error('1. Asegúrate de tener el archivo serviceAccountKey.json');
    console.error('2. Verifica que el email existe en Firebase Authentication');
    console.error('3. Verifica las credenciales de Firebase Admin');
    process.exit(1);
  }
}

setupAdmin();
