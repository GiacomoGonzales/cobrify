import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDdTH5sH-VcPZ_ju_-tP0Wme4w5pPKcxWw",
  authDomain: "cobrify-395fe.firebaseapp.com",
  projectId: "cobrify-395fe",
  storageBucket: "cobrify-395fe.firebasestorage.app",
  messagingSenderId: "685843504415",
  appId: "1:685843504415:web:67399f00a1e56d65e6c17b"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)

async function configureSeries() {
  try {
    // Obtener el usuario actual del auth
    const user = auth.currentUser

    if (!user) {
      console.error('❌ No hay usuario autenticado')
      console.log('Por favor, inicia sesión en la aplicación primero')
      process.exit(1)
    }

    const userId = user.uid
    console.log(`📝 Configurando series para usuario: ${userId}`)

    const businessRef = doc(db, 'businesses', userId)

    await setDoc(businessRef, {
      series: {
        factura: {
          serie: 'F001',
          lastNumber: 0
        },
        boleta: {
          serie: 'B001',
          lastNumber: 0
        },
        notaCredito: {
          serie: 'FC01',
          lastNumber: 0
        },
        notaDebito: {
          serie: 'FD01',
          lastNumber: 0
        }
      },
      updatedAt: serverTimestamp()
    }, { merge: true })

    console.log('✅ Series configuradas exitosamente:')
    console.log('   - Facturas: F001-00000001')
    console.log('   - Boletas: B001-00000001')
    console.log('   - Notas de Crédito: FC01-00000001')
    console.log('   - Notas de Débito: FD01-00000001')
    console.log('')
    console.log('🎉 ¡Listo! Ya puedes emitir comprobantes.')

    process.exit(0)

  } catch (error) {
    console.error('❌ Error al configurar series:', error)
    process.exit(1)
  }
}

// Esperar a que Firebase inicialice
setTimeout(() => {
  configureSeries()
}, 1000)
