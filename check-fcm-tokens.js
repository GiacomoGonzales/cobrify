// Script para verificar tokens FCM en Firestore
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Cargar service account key
const serviceAccount = JSON.parse(
  readFileSync('./serviceAccountKey.json', 'utf8')
);

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkFCMTokens() {
  try {
    console.log('🔍 Buscando tokens FCM en Firestore...\n');

    // Obtener todos los usuarios
    const usersSnapshot = await db.collection('users').get();

    if (usersSnapshot.empty) {
      console.log('❌ No hay usuarios en la colección "users"');
      return;
    }

    console.log(`📊 Total de usuarios: ${usersSnapshot.size}\n`);

    let totalTokens = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      // Obtener tokens FCM del usuario
      const tokensSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('fcmTokens')
        .get();

      if (!tokensSnapshot.empty) {
        console.log(`✅ Usuario: ${userId}`);
        console.log(`   Email: ${userData.email || 'N/A'}`);
        console.log(`   Tokens encontrados: ${tokensSnapshot.size}`);

        tokensSnapshot.forEach((tokenDoc) => {
          const tokenData = tokenDoc.data();
          console.log(`   📱 Token: ${tokenData.token.substring(0, 30)}...`);
          console.log(`      Platform: ${tokenData.platform}`);
          console.log(`      Created: ${tokenData.createdAt?.toDate?.() || 'N/A'}`);
        });

        console.log('');
        totalTokens += tokensSnapshot.size;
      }
    }

    if (totalTokens === 0) {
      console.log('❌ No se encontraron tokens FCM en ningún usuario');
      console.log('\n💡 Solución:');
      console.log('   1. Asegúrate de haber hecho login en la app móvil');
      console.log('   2. Verifica que aparezca el alert "Notificaciones activadas"');
      console.log('   3. Revisa los logs de Logcat en Android Studio');
    } else {
      console.log(`✅ Total de tokens encontrados: ${totalTokens}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkFCMTokens();
