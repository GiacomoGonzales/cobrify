/**
 * Script para resetear facturas atascadas con errores temporales de SUNAT
 *
 * Errores temporales típicos:
 * - 0109: El servicio de autenticación no está disponible
 * - Timeout de conexión
 * - Servicio no disponible
 *
 * Este script cambia el estado de 'rejected' a 'pending' para permitir reenvío
 */

const admin = require('firebase-admin');
const path = require('path');

// Configuración
const BUSINESS_ID = 'Xx9jB6SJMsPufJ6KceVKS1VhAa52';

// Errores temporales que permiten reenvío (no son rechazos reales de SUNAT)
const TRANSIENT_ERRORS = [
  '0109', // Servicio de autenticación no disponible
  'soap-env:Client.0109',
  'timeout',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'no está disponible',
  'servicio de autenticación',
  'service unavailable',
  'connection refused',
];

// Inicializar Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin inicializado');
} catch (error) {
  console.error('❌ Error al cargar serviceAccountKey.json:', error.message);
  console.log('\n📋 Instrucciones:');
  console.log('1. Ve a Firebase Console > Project Settings > Service Accounts');
  console.log('2. Click en "Generate new private key"');
  console.log('3. Guarda el archivo como "serviceAccountKey.json" en la raíz del proyecto');
  process.exit(1);
}

const db = admin.firestore();

/**
 * Verifica si un error es temporal (permite reenvío)
 */
function isTransientError(errorMessage) {
  if (!errorMessage) return false;
  const lowerError = errorMessage.toLowerCase();
  return TRANSIENT_ERRORS.some(err => lowerError.includes(err.toLowerCase()));
}

/**
 * Busca y lista facturas atascadas
 */
async function findStuckInvoices() {
  console.log('\n🔍 Buscando facturas atascadas en negocio:', BUSINESS_ID);

  const invoicesRef = db.collection('businesses').doc(BUSINESS_ID).collection('invoices');

  // Buscar facturas rechazadas
  const rejectedQuery = await invoicesRef.where('sunatStatus', '==', 'rejected').get();

  // Buscar facturas en estado "sending" (posiblemente atascadas)
  const sendingQuery = await invoicesRef.where('sunatStatus', '==', 'sending').get();

  const stuckInvoices = [];

  // Procesar rechazadas
  rejectedQuery.forEach(doc => {
    const data = doc.data();
    const errorMsg = data.sunatDescription || data.sunatResponseCode || '';

    if (isTransientError(errorMsg)) {
      stuckInvoices.push({
        id: doc.id,
        number: `${data.series}-${data.correlativeNumber}`,
        type: data.documentType,
        status: data.sunatStatus,
        error: errorMsg,
        reason: 'Error temporal de SUNAT',
        date: data.createdAt?.toDate?.() || 'N/A'
      });
    }
  });

  // Procesar "sending" que llevan mucho tiempo (más de 5 minutos)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  sendingQuery.forEach(doc => {
    const data = doc.data();
    const sendingStarted = data.sunatSendingStartedAt?.toDate?.();

    if (!sendingStarted || sendingStarted < fiveMinutesAgo) {
      stuckInvoices.push({
        id: doc.id,
        number: `${data.series}-${data.correlativeNumber}`,
        type: data.documentType,
        status: data.sunatStatus,
        error: 'Timeout - quedó en "sending"',
        reason: 'Proceso interrumpido',
        date: data.createdAt?.toDate?.() || 'N/A'
      });
    }
  });

  return stuckInvoices;
}

/**
 * Resetea las facturas atascadas a estado 'pending'
 */
async function resetStuckInvoices(invoices) {
  console.log(`\n🔄 Reseteando ${invoices.length} facturas...`);

  const batch = db.batch();

  for (const invoice of invoices) {
    const invoiceRef = db.collection('businesses').doc(BUSINESS_ID)
      .collection('invoices').doc(invoice.id);

    batch.update(invoiceRef, {
      sunatStatus: 'pending',
      sunatDescription: `[RESET] Error anterior: ${invoice.error}`,
      sunatResponseCode: null,
      sunatSendingStartedAt: null,
      resetAt: admin.firestore.FieldValue.serverTimestamp(),
      resetReason: 'Error temporal de SUNAT - permitir reenvío'
    });

    console.log(`  📄 ${invoice.number} (${invoice.type}) - ${invoice.error}`);
  }

  await batch.commit();
  console.log('\n✅ Facturas reseteadas exitosamente');
}

/**
 * Función principal
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  RESET DE FACTURAS ATASCADAS POR ERRORES TEMPORALES');
  console.log('═══════════════════════════════════════════════════════');

  try {
    // 1. Buscar facturas atascadas
    const stuckInvoices = await findStuckInvoices();

    if (stuckInvoices.length === 0) {
      console.log('\n✅ No se encontraron facturas atascadas con errores temporales');
      process.exit(0);
    }

    // 2. Mostrar resumen
    console.log(`\n📊 Encontradas ${stuckInvoices.length} facturas atascadas:\n`);
    console.log('┌─────────────────────┬──────────────┬─────────────┬────────────────────────────────────────┐');
    console.log('│ Número              │ Tipo         │ Estado      │ Error                                  │');
    console.log('├─────────────────────┼──────────────┼─────────────┼────────────────────────────────────────┤');

    for (const inv of stuckInvoices) {
      const num = inv.number.padEnd(19);
      const type = inv.type.padEnd(12);
      const status = inv.status.padEnd(11);
      const error = (inv.error || '').substring(0, 38).padEnd(38);
      console.log(`│ ${num} │ ${type} │ ${status} │ ${error} │`);
    }

    console.log('└─────────────────────┴──────────────┴─────────────┴────────────────────────────────────────┘');

    // 3. Confirmar y resetear
    console.log('\n⚠️  Estas facturas serán cambiadas a estado "pending" para permitir reenvío');

    // Auto-confirmar (puedes cambiar esto si quieres confirmación manual)
    await resetStuckInvoices(stuckInvoices);

    console.log('\n📋 Próximos pasos:');
    console.log('1. Ve a la lista de facturas en la app');
    console.log('2. Las facturas ahora mostrarán el botón "Enviar a SUNAT"');
    console.log('3. Haz clic para reenviarlas');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

// Ejecutar
main();
