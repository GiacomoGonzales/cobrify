// Script para verificar datos de usuario en Firestore
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDHpl5bu6-FNUSqI0DT6UDp60MJxX4JgPg",
  authDomain: "cobrify-395fe.firebaseapp.com",
  projectId: "cobrify-395fe",
  storageBucket: "cobrify-395fe.firebasestorage.app",
  messagingSenderId: "756057732358",
  appId: "1:756057732358:web:ca80f5dace44ef0e70a0ca"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkUser() {
  try {
    console.log('🔍 Buscando usuarios en la colección users...\n');

    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);

    console.log(`📊 Total de usuarios en Firestore: ${querySnapshot.size}\n`);

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('👤 Usuario ID:', doc.id);
      console.log('📧 Email:', data.email);
      console.log('👔 Display Name:', data.displayName);
      console.log('🏢 Is Business Owner:', data.isBusinessOwner);
      console.log('👨‍💼 Owner ID:', data.ownerId);
      console.log('📄 Allowed Pages:', data.allowedPages);
      console.log('✅ Is Active:', data.isActive);
      console.log('🕐 Created At:', data.createdAt?.toDate?.());
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

checkUser();
