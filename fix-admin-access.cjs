const admin = require('firebase-admin');
const serviceAccount = require('./cobrify-395fe-firebase-adminsdk-i35qr-b6b0c1f668.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixAdminAccess() {
  try {
    // Tu email de administrador
    const adminEmail = 'giiacomo@gmail.com';
    
    // Buscar el UID del usuario por email
    const userRecord = await admin.auth().getUserByEmail(adminEmail);
    console.log('✅ Usuario encontrado:', userRecord.uid);
    
    // Actualizar la suscripción para reactivar el acceso
    const subscriptionRef = db.collection('subscriptions').doc(userRecord.uid);
    const subscriptionDoc = await subscriptionRef.get();
    
    if (subscriptionDoc.exists()) {
      const currentData = subscriptionDoc.data();
      console.log('📋 Estado actual:', {
        plan: currentData.plan,
        status: currentData.status,
        accessBlocked: currentData.accessBlocked,
        blockReason: currentData.blockReason
      });
      
      // Reactivar la cuenta
      await subscriptionRef.update({
        status: 'active',
        accessBlocked: false,
        blockReason: null,
        blockedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('✅ Cuenta reactivada exitosamente');
      console.log('✅ accessBlocked: false');
      console.log('✅ status: active');
    } else {
      console.log('❌ No se encontró suscripción para este usuario');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixAdminAccess();
