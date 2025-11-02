import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Verifica si un usuario es SUPER ADMIN (admin de la plataforma)
 * Solo giiacomo@gmail.com y otros super admins designados
 * @param {string} userId - UID del usuario
 * @returns {Promise<boolean>} - true si es super admin, false si no
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
 * Verifica si un usuario es BUSINESS ADMIN (dueño de su negocio)
 * Estos usuarios pueden crear sub-usuarios y gestionar su negocio
 * @param {string} userId - UID del usuario
 * @returns {Promise<boolean>}
 */
export const isBusinessAdmin = async (userId) => {
  try {
    if (!userId) return false;

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      // Si tiene el documento y es business owner
      if (userData.isBusinessOwner === true) {
        return true;
      }
      // Si tiene el documento pero NO es business owner (es un sub-usuario)
      if (userData.ownerId) {
        return false;
      }
      // Si tiene documento pero no tiene ni isBusinessOwner ni ownerId
      // Es un usuario viejo, tratarlo como business owner
      return true;
    }

    // Si NO existe en la colección users, es un usuario registrado directamente
    // antes de la implementación del sistema. Tratarlo como business owner.
    return true;
  } catch (error) {
    console.error('Error al verificar business admin:', error);
    return false;
  }
};

/**
 * Marca a un usuario como Business Admin (dueño del negocio)
 * Se llama automáticamente cuando un usuario se registra
 * @param {string} userId - UID del usuario
 * @param {string} email - Email del usuario
 * @returns {Promise<object>}
 */
export const setAsBusinessOwner = async (userId, email) => {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(
      userRef,
      {
        uid: userId,
        email: email,
        isBusinessOwner: true,
        createdAt: serverTimestamp(),
        allowedPages: [], // Business owners tienen acceso total, no necesitan permisos
        isActive: true,
      },
      { merge: true } // Merge para no sobrescribir otros datos
    );

    return { success: true };
  } catch (error) {
    console.error('Error al establecer business owner:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Para convertir un usuario en SUPER ADMIN:
 * 1. Ir a Firebase Console
 * 2. Abrir Firestore Database
 * 3. Crear una colección llamada "admins"
 * 4. Agregar un documento con el UID del usuario como ID
 * 5. El contenido del documento puede ser:
 *    {
 *      email: "giiacomo@gmail.com",
 *      role: "super_admin",
 *      createdAt: [timestamp actual]
 *    }
 */
