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

      // Un documento con `ownerId` es SIEMPRE un sub-usuario, aunque además
      // traiga `isBusinessOwner: true` por un flag heredado (cuenta que fue
      // dueña y se convirtió en sub-usuario, o data inconsistente). Priorizar
      // ownerId evita escalar un sub-usuario a "dueño de su propio negocio
      // vacío": POS sin productos, Ventas en cero y menú lateral completo
      // (reporte real: sucursal Lamas de Gastromundo).
      if (userData.ownerId) return false;

      // Sin ownerId: dueño real (flag explícito o usuario legacy sin flags).
      if (userData.isBusinessOwner === true) return true;
      return true;
    }

    // ── Sin documento en `users` ──────────────────────────────────────────
    // Antes se devolvía `true` sin más: "es un usuario de antes de que
    // existiera esta colección, trátalo como dueño". Eso convertía en dueño de
    // un negocio vacío a CUALQUIERA que entrara sin documento, y el que entra
    // sin documento casi nunca es un cliente antiguo: es un empleado al que le
    // crearon el acceso y se le perdió la ficha, o alguien a quien le borraron
    // la cuenta y le quedó vivo el acceso. Con siete casos así en producción
    // —el más antiguo de febrero— cada uno aparecía en el admin como una
    // "cuenta a medio crear" y, al entrar, veía un POS sin productos.
    //
    // Ahora se le pide una prueba de que la cuenta existe: un plan o un negocio
    // a su nombre. El cliente antiguo de verdad los tiene; el fantasma no.
    //
    // La suscripción va primero porque su regla de lectura es la simple (cada
    // quien lee la suya). La del negocio además exige acceso vigente, así que
    // puede denegar en vez de responder "no existe": un fallo ahí se lee como
    // que no hay negocio, que es justo lo que queremos concluir.
    const tiene = async (coleccion) => {
      try {
        return (await getDoc(doc(db, coleccion, userId))).exists();
      } catch {
        return false;
      }
    };
    if (await tiene('subscriptions')) return true;
    return await tiene('businesses');
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
 * @param {string} displayName - Nombre del usuario (opcional)
 * @returns {Promise<object>}
 */
export const setAsBusinessOwner = async (userId, email, displayName = null) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userData = {
      uid: userId,
      email: email,
      isBusinessOwner: true,
      createdAt: serverTimestamp(),
      allowedPages: [], // Business owners tienen acceso total, no necesitan permisos
      isActive: true,
    };

    // Agregar displayName si se proporciona
    if (displayName) {
      userData.displayName = displayName;
    }

    await setDoc(userRef, userData, { merge: true });

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
