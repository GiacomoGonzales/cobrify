import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Verifica si un usuario es administrador
 * @param {string} userId - UID del usuario
 * @returns {Promise<boolean>} - true si es admin, false si no
 */
export const isUserAdmin = async (userId) => {
  try {
    if (!userId) return false;

    const adminRef = doc(db, 'admins', userId);
    const adminSnap = await getDoc(adminRef);

    return adminSnap.exists();
  } catch (error) {
    console.error('Error al verificar admin:', error);
    return false;
  }
};

/**
 * Para convertir un usuario en administrador, debes:
 * 1. Ir a Firebase Console
 * 2. Abrir Firestore Database
 * 3. Crear una colección llamada "admins"
 * 4. Agregar un documento con el UID del usuario como ID
 * 5. El contenido del documento puede ser:
 *    {
 *      email: "tu@email.com",
 *      role: "admin",
 *      createdAt: [timestamp actual]
 *    }
 */
