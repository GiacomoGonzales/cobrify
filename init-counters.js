/**
 * Script para inicializar contadores de documentos
 * Ejecutar con: node init-counters.js
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBu_lT5mV-xtG-gqHlDMbNQqxhz8N0tGV0",
  authDomain: "cobrify-395fe.firebaseapp.com",
  projectId: "cobrify-395fe",
  storageBucket: "cobrify-395fe.firebasestorage.app",
  messagingSenderId: "738066412299",
  appId: "1:738066412299:web:e9ad6f062ffe7e74c2ce4f"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const businessId = 'qzq65tS0HDWHC7y68RH66S5ad2S2'; // El ID del usuario

async function initializeCounters() {
  try {
    console.log('🔧 Inicializando contadores para:', businessId);

    // Contador para Facturas
    const facturaRef = doc(db, 'businesses', businessId, 'counters', 'factura');
    await setDoc(facturaRef, {
      series: 'F001',
      lastNumber: 0,
      lastUpdated: new Date()
    });
    console.log('✅ Contador de facturas creado: F001-00000000');

    // Contador para Boletas
    const boletaRef = doc(db, 'businesses', businessId, 'counters', 'boleta');
    await setDoc(boletaRef, {
      series: 'B001',
      lastNumber: 0,
      lastUpdated: new Date()
    });
    console.log('✅ Contador de boletas creado: B001-00000000');

    // Contador para Notas de Venta
    const notaVentaRef = doc(db, 'businesses', businessId, 'counters', 'nota_venta');
    await setDoc(notaVentaRef, {
      series: 'NV01',
      lastNumber: 0,
      lastUpdated: new Date()
    });
    console.log('✅ Contador de notas de venta creado: NV01-00000000');

    console.log('🎉 Todos los contadores inicializados correctamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al inicializar contadores:', error);
    process.exit(1);
  }
}

initializeCounters();
