const admin = require('firebase-admin');
const readline = require('readline');

// Inicializar Firebase Admin
const serviceAccount = require('./cobrify-395fe-firebase-adminsdk-uz0j1-6a1ddf02bf.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'cobrify-395fe'
});

const db = admin.firestore();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function configureSeries() {
  rl.question('Ingresa el User ID (email o UID del usuario): ', async (input) => {
    try {
      let userId = input.trim();

      // Si ingresó un email, buscar el UID
      if (userId.includes('@')) {
        console.log(`🔍 Buscando usuario con email: ${userId}`);
        const userRecord = await admin.auth().getUserByEmail(userId);
        userId = userRecord.uid;
        console.log(`✅ Usuario encontrado: ${userId}`);
      }

      console.log(`\n📝 Configurando series para usuario: ${userId}`);

      const businessRef = db.collection('businesses').doc(userId);

      await businessRef.set({
        series: {
          factura: {
            serie: 'F001',
            lastNumber: 0
          },
          boleta: {
            serie: 'B001',
            lastNumber: 0
          },
          nota_credito_factura: {
            serie: 'FN01',
            lastNumber: 0
          },
          nota_credito_boleta: {
            serie: 'BN01',
            lastNumber: 0
          },
          nota_debito_factura: {
            serie: 'FD01',
            lastNumber: 0
          },
          nota_debito_boleta: {
            serie: 'BD01',
            lastNumber: 0
          }
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log('\n✅ Series configuradas exitosamente:');
      console.log('   📄 Facturas: F001-00000001');
      console.log('   🧾 Boletas: B001-00000001');
      console.log('   📝 Notas de Crédito (Facturas): FN01-00000001');
      console.log('   📝 Notas de Crédito (Boletas): BN01-00000001');
      console.log('   📋 Notas de Débito (Facturas): FD01-00000001');
      console.log('   📋 Notas de Débito (Boletas): BD01-00000001');
      console.log('\n🎉 ¡Listo! Ya puedes emitir comprobantes.\n');

      rl.close();
      process.exit(0);

    } catch (error) {
      console.error('❌ Error:', error.message);
      rl.close();
      process.exit(1);
    }
  });
}

configureSeries();
