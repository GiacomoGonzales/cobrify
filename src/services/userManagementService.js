import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore'
import { db, secondaryAuth } from '@/lib/firebase'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'

/**
 * Servicio de gestión de usuarios con permisos personalizados
 */

// Lista de todas las páginas/módulos disponibles en el sistema
// Páginas comunes a ambos modos
export const COMMON_PAGES = [
  { id: 'dashboard', name: 'Dashboard', path: '/dashboard', mode: 'both' },
  { id: 'pos', name: 'Punto de Venta (POS)', path: '/pos', mode: 'both' },
  { id: 'invoices', name: 'Facturas/Boletas', path: '/invoices', mode: 'both' },
  { id: 'customers', name: 'Clientes', path: '/customers', mode: 'both' },
  { id: 'products', name: 'Productos/Servicios', path: '/products', mode: 'both' },
  { id: 'reports', name: 'Reportes', path: '/reports', mode: 'both' },
  { id: 'cash-register', name: 'Control de Caja', path: '/cash-register', mode: 'both' },
  { id: 'settings', name: 'Configuración', path: '/settings', mode: 'both' },
  { id: 'users', name: 'Gestión de Usuarios', path: '/users', mode: 'both' },
]

// Páginas específicas de modo retail
export const RETAIL_PAGES = [
  { id: 'purchases', name: 'Compras', path: '/purchases', mode: 'retail' },
  { id: 'inventory', name: 'Inventario', path: '/inventory', mode: 'retail' },
  { id: 'suppliers', name: 'Proveedores', path: '/suppliers', mode: 'retail' },
  { id: 'quotations', name: 'Cotizaciones', path: '/quotations', mode: 'retail' },
]

// Páginas específicas de modo restaurante
export const RESTAURANT_PAGES = [
  { id: 'tables', name: 'Mesas', path: '/tables', mode: 'restaurant' },
  { id: 'waiters', name: 'Mozos', path: '/waiters', mode: 'restaurant' },
  { id: 'orders', name: 'Órdenes Activas', path: '/orders', mode: 'restaurant' },
  { id: 'kitchen', name: 'Vista de Cocina', path: '/kitchen', mode: 'restaurant' },
  { id: 'ingredients', name: 'Ingredientes', path: '/ingredients', mode: 'restaurant' },
  { id: 'recipes', name: 'Recetas', path: '/recipes', mode: 'restaurant' },
]

// Páginas específicas de modo farmacia
export const PHARMACY_PAGES = [
  { id: 'purchases', name: 'Compras', path: '/purchases', mode: 'pharmacy' },
  { id: 'inventory', name: 'Inventario', path: '/inventory', mode: 'pharmacy' },
  { id: 'suppliers', name: 'Proveedores', path: '/suppliers', mode: 'pharmacy' },
  { id: 'laboratories', name: 'Laboratorios', path: '/laboratories', mode: 'pharmacy' },
  { id: 'batch-control', name: 'Control de Lotes', path: '/batch-control', mode: 'pharmacy' },
  { id: 'expiry-alerts', name: 'Alertas de Vencimiento', path: '/expiry-alerts', mode: 'pharmacy' },
]

// Páginas específicas de modo inmobiliaria
export const REAL_ESTATE_PAGES = [
  { id: 'properties', name: 'Propiedades', path: '/propiedades', mode: 'real_estate' },
  { id: 'agents', name: 'Agentes/Corredores', path: '/agentes', mode: 'real_estate' },
  { id: 'operations', name: 'Operaciones', path: '/operaciones', mode: 'real_estate' },
  { id: 'commissions', name: 'Comisiones', path: '/comisiones', mode: 'real_estate' },
]

// Lista completa de todas las páginas
export const AVAILABLE_PAGES = [
  ...COMMON_PAGES,
  ...RETAIL_PAGES,
  ...RESTAURANT_PAGES,
  ...PHARMACY_PAGES,
  ...REAL_ESTATE_PAGES,
]

/**
 * Obtener páginas disponibles según el modo del negocio
 * @param {string} businessMode - 'retail', 'restaurant', 'pharmacy' o 'real_estate'
 * @returns {array} - Array de páginas disponibles
 */
export const getAvailablePagesByMode = (businessMode) => {
  if (businessMode === 'restaurant') {
    return [...COMMON_PAGES, ...RESTAURANT_PAGES]
  } else if (businessMode === 'pharmacy') {
    return [...COMMON_PAGES, ...PHARMACY_PAGES]
  } else if (businessMode === 'real_estate') {
    return [...COMMON_PAGES, ...REAL_ESTATE_PAGES]
  } else {
    // Modo retail o por defecto
    return [...COMMON_PAGES, ...RETAIL_PAGES]
  }
}

/**
 * Crear un nuevo usuario con permisos personalizados
 * @param {string} ownerId - ID del usuario dueño/administrador
 * @param {object} userData - Datos del nuevo usuario
 * @returns {Promise<object>}
 */
export const createManagedUser = async (ownerId, userData) => {
  try {
    const { email, password, displayName, allowedPages, allowedWarehouses } = userData

    // 1. Crear usuario en Firebase Auth usando secondaryAuth para no desloguear al owner
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    const newUserId = userCredential.user.uid

    // Cerrar sesión en el auth secundario inmediatamente
    await signOut(secondaryAuth)

    // 2. Crear documento en Firestore con permisos
    const userDocRef = doc(db, 'users', newUserId)
    const userDocData = {
      uid: newUserId,
      email,
      displayName,
      role: 'user', // Rol genérico para usuarios creados
      allowedPages: allowedPages || [], // Array de IDs de páginas permitidas
      allowedWarehouses: allowedWarehouses || [], // Array de IDs de almacenes permitidos (vacío = todos)
      ownerId, // ID del usuario que lo creó (dueño del negocio)
      isActive: true,
      createdAt: serverTimestamp(),
      createdBy: ownerId,
      lastLogin: null,
    }

    await setDoc(userDocRef, userDocData)

    return {
      success: true,
      userId: newUserId,
      message: 'Usuario creado exitosamente'
    }
  } catch (error) {
    console.error('❌ Error al crear usuario:', error)
    return {
      success: false,
      error: getErrorMessage(error.code)
    }
  }
}

/**
 * Obtener todos los usuarios creados por un dueño
 * @param {string} ownerId - ID del usuario dueño
 * @returns {Promise<object>}
 */
export const getManagedUsers = async (ownerId) => {
  try {
    const usersRef = collection(db, 'users')
    const q = query(usersRef, where('ownerId', '==', ownerId))
    const querySnapshot = await getDocs(q)

    const users = []
    querySnapshot.forEach((doc) => {
      users.push({
        id: doc.id,
        ...doc.data(),
      })
    })

    return { success: true, data: users }
  } catch (error) {
    console.error('Error al obtener usuarios:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Obtener datos de un usuario específico
 * @param {string} userId - ID del usuario
 * @returns {Promise<object>}
 */
export const getUserData = async (userId) => {
  try {
    const userDocRef = doc(db, 'users', userId)
    const userSnap = await getDoc(userDocRef)

    if (userSnap.exists()) {
      return {
        success: true,
        data: { id: userSnap.id, ...userSnap.data() }
      }
    } else {
      return {
        success: false,
        error: 'Usuario no encontrado',
        data: null
      }
    }
  } catch (error) {
    console.error('Error al obtener usuario:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Actualizar permisos de un usuario
 * @param {string} userId - ID del usuario a actualizar
 * @param {array} allowedPages - Array de IDs de páginas permitidas
 * @returns {Promise<object>}
 */
export const updateUserPermissions = async (userId, allowedPages) => {
  try {
    const userDocRef = doc(db, 'users', userId)
    await updateDoc(userDocRef, {
      allowedPages,
      updatedAt: serverTimestamp(),
    })

    return { success: true, message: 'Permisos actualizados' }
  } catch (error) {
    console.error('Error al actualizar permisos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar datos de un usuario
 * @param {string} userId - ID del usuario
 * @param {object} updates - Datos a actualizar
 * @returns {Promise<object>}
 */
export const updateUserData = async (userId, updates) => {
  try {
    const userDocRef = doc(db, 'users', userId)
    await updateDoc(userDocRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })

    return { success: true, message: 'Usuario actualizado' }
  } catch (error) {
    console.error('Error al actualizar usuario:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Activar/desactivar un usuario
 * @param {string} userId - ID del usuario
 * @param {boolean} isActive - Estado activo/inactivo
 * @returns {Promise<object>}
 */
export const toggleUserStatus = async (userId, isActive) => {
  try {
    const userDocRef = doc(db, 'users', userId)
    await updateDoc(userDocRef, {
      isActive,
      updatedAt: serverTimestamp(),
    })

    return {
      success: true,
      message: isActive ? 'Usuario activado' : 'Usuario desactivado'
    }
  } catch (error) {
    console.error('Error al cambiar estado de usuario:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un usuario
 * @param {string} userId - ID del usuario a eliminar
 * @returns {Promise<object>}
 */
export const deleteManagedUser = async (userId) => {
  try {
    const userDocRef = doc(db, 'users', userId)
    await deleteDoc(userDocRef)

    // Nota: No eliminamos el usuario de Firebase Auth por seguridad
    // Solo lo removemos de Firestore

    return { success: true, message: 'Usuario eliminado' }
  } catch (error) {
    console.error('Error al eliminar usuario:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Verificar si un usuario tiene permiso para acceder a una página
 * @param {string} userId - ID del usuario
 * @param {string} pageId - ID de la página
 * @returns {Promise<boolean>}
 */
export const hasPagePermission = async (userId, pageId) => {
  try {
    const userData = await getUserData(userId)

    if (!userData.success || !userData.data) {
      return false
    }

    // Si el usuario no está activo, no tiene acceso
    if (!userData.data.isActive) {
      return false
    }

    // Si el usuario no tiene allowedPages o está vacío, no tiene acceso
    if (!userData.data.allowedPages || userData.data.allowedPages.length === 0) {
      return false
    }

    // Verificar si la página está en la lista de permitidas
    return userData.data.allowedPages.includes(pageId)
  } catch (error) {
    console.error('Error al verificar permisos:', error)
    return false
  }
}

/**
 * Traducir códigos de error
 */
const getErrorMessage = (errorCode) => {
  const errorMessages = {
    'auth/email-already-in-use': 'Este correo electrónico ya está registrado',
    'auth/invalid-email': 'Correo electrónico inválido',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
    'permission-denied': 'No tienes permisos para realizar esta acción',
  }

  return errorMessages[errorCode] || 'Error al procesar la solicitud'
}
