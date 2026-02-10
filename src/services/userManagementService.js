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
// Organizados por categorías para mejor visualización

// ============ PÁGINAS COMUNES (todos los modos) ============
export const COMMON_PAGES = [
  // Principales
  { id: 'dashboard', name: 'Dashboard', path: '/dashboard', category: 'principal' },
  { id: 'pos', name: 'Punto de Venta (POS)', path: '/pos', category: 'principal' },
  { id: 'invoices', name: 'Ventas', path: '/facturas', category: 'principal' },
  { id: 'customers', name: 'Clientes', path: '/clientes', category: 'principal' },
  { id: 'products', name: 'Productos', path: '/productos', category: 'principal' },
  // Finanzas
  { id: 'cash-register', name: 'Control de Caja', path: '/caja', category: 'finanzas' },
  { id: 'reports', name: 'Reportes', path: '/reportes', category: 'finanzas' },
  { id: 'expenses', name: 'Gastos', path: '/gastos', category: 'finanzas' },
  { id: 'cash-flow', name: 'Flujo de Caja', path: '/flujo-caja', category: 'finanzas' },
  // Sistema
  { id: 'settings', name: 'Configuración', path: '/configuracion', category: 'sistema' },
  { id: 'users', name: 'Gestión de Usuarios', path: '/usuarios', category: 'sistema' },
  // Otros
  { id: 'complaints', name: 'Libro de Reclamos', path: '/reclamos', category: 'otros' },
]

// ============ PÁGINAS MODO RETAIL ============
export const RETAIL_PAGES = [
  // Documentos
  { id: 'quotations', name: 'Cotizaciones', path: '/cotizaciones', category: 'documentos' },
  { id: 'dispatch-guides', name: 'Guías de Remisión', path: '/guias-remision', category: 'documentos' },
  { id: 'carrier-dispatch-guides', name: 'GRE Transportista', path: '/guias-transportista', category: 'documentos' },
  // Inventario
  { id: 'inventory', name: 'Inventario', path: '/inventario', category: 'inventario' },
  { id: 'warehouses', name: 'Almacenes', path: '/almacenes', category: 'inventario' },
  { id: 'stock-movements', name: 'Movimientos de Stock', path: '/movimientos', category: 'inventario' },
  // Compras y Proveedores
  { id: 'purchases', name: 'Compras', path: '/compras', category: 'compras' },
  { id: 'purchase-orders', name: 'Órdenes de Compra', path: '/ordenes-compra', category: 'compras' },
  { id: 'suppliers', name: 'Proveedores', path: '/proveedores', category: 'compras' },
  // Ventas
  { id: 'sellers', name: 'Vendedores', path: '/vendedores', category: 'ventas' },
  // Producción
  { id: 'ingredients', name: 'Insumos', path: '/ingredientes', category: 'produccion' },
  { id: 'recipes', name: 'Composición', path: '/recetas', category: 'produccion' },
  { id: 'production', name: 'Producción', path: '/produccion', category: 'produccion' },
  // Otros
  { id: 'loans', name: 'Préstamos', path: '/prestamos', category: 'otros' },
  { id: 'certificates', name: 'Certificados', path: '/certificados', category: 'otros' },
]

// ============ PÁGINAS MODO RESTAURANTE ============
export const RESTAURANT_PAGES = [
  // Operaciones
  { id: 'tables', name: 'Mesas', path: '/mesas', category: 'operaciones' },
  { id: 'orders', name: 'Órdenes', path: '/ordenes', category: 'operaciones' },
  { id: 'kitchen', name: 'Cocina', path: '/cocina', category: 'operaciones' },
  { id: 'waiters', name: 'Mozos', path: '/mozos', category: 'operaciones' },
  // Inventario y Producción
  { id: 'inventory', name: 'Inventario', path: '/inventario', category: 'inventario' },
  { id: 'ingredients', name: 'Ingredientes', path: '/ingredientes', category: 'produccion' },
  { id: 'recipes', name: 'Recetas', path: '/recetas', category: 'produccion' },
  { id: 'production', name: 'Producción', path: '/produccion', category: 'produccion' },
  { id: 'purchase-history', name: 'Historial de Compras', path: '/ingredientes/historial', category: 'produccion' },
  // Compras
  { id: 'purchases', name: 'Compras', path: '/compras', category: 'compras' },
  { id: 'suppliers', name: 'Proveedores', path: '/proveedores', category: 'compras' },
]

// ============ PÁGINAS MODO FARMACIA ============
export const PHARMACY_PAGES = [
  // Inventario
  { id: 'inventory', name: 'Inventario', path: '/inventario', category: 'inventario' },
  { id: 'warehouses', name: 'Almacenes', path: '/almacenes', category: 'inventario' },
  { id: 'stock-movements', name: 'Movimientos de Stock', path: '/movimientos', category: 'inventario' },
  { id: 'batch-control', name: 'Control de Lotes', path: '/control-lotes', category: 'inventario' },
  { id: 'expiry-alerts', name: 'Alertas de Vencimiento', path: '/alertas-vencimiento', category: 'inventario' },
  { id: 'laboratories', name: 'Laboratorios', path: '/laboratorios', category: 'inventario' },
  // Documentos
  { id: 'quotations', name: 'Cotizaciones', path: '/cotizaciones', category: 'documentos' },
  { id: 'dispatch-guides', name: 'GRE Remitente', path: '/guias-remision', category: 'documentos' },
  // Ventas
  { id: 'sellers', name: 'Vendedores', path: '/vendedores', category: 'ventas' },
  // Compras
  { id: 'purchases', name: 'Compras', path: '/compras', category: 'compras' },
  { id: 'purchase-orders', name: 'Órdenes de Compra', path: '/ordenes-compra', category: 'compras' },
  { id: 'suppliers', name: 'Proveedores', path: '/proveedores', category: 'compras' },
  // Otros
  { id: 'loans', name: 'Préstamos', path: '/prestamos', category: 'otros' },
  { id: 'certificates', name: 'Certificados', path: '/certificados', category: 'otros' },
]

// ============ PÁGINAS MODO INMOBILIARIA ============
export const REAL_ESTATE_PAGES = [
  { id: 'properties', name: 'Propiedades', path: '/propiedades', category: 'principal' },
  { id: 'agents', name: 'Agentes/Corredores', path: '/agentes', category: 'equipo' },
  { id: 'operations', name: 'Operaciones', path: '/operaciones', category: 'ventas' },
  { id: 'commissions', name: 'Comisiones', path: '/comisiones', category: 'finanzas' },
]

// ============ PÁGINAS MODO TRANSPORTE ============
// Hereda las mismas páginas que retail
export const TRANSPORT_PAGES = [
  // Documentos
  { id: 'quotations', name: 'Cotizaciones', path: '/cotizaciones', category: 'documentos' },
  { id: 'dispatch-guides', name: 'Guías de Remisión', path: '/guias-remision', category: 'documentos' },
  { id: 'carrier-dispatch-guides', name: 'GRE Transportista', path: '/guias-transportista', category: 'documentos' },
  // Inventario
  { id: 'inventory', name: 'Inventario', path: '/inventario', category: 'inventario' },
  { id: 'warehouses', name: 'Almacenes', path: '/almacenes', category: 'inventario' },
  { id: 'stock-movements', name: 'Movimientos de Stock', path: '/movimientos', category: 'inventario' },
  // Compras y Proveedores
  { id: 'purchases', name: 'Compras', path: '/compras', category: 'compras' },
  { id: 'purchase-orders', name: 'Órdenes de Compra', path: '/ordenes-compra', category: 'compras' },
  { id: 'suppliers', name: 'Proveedores', path: '/proveedores', category: 'compras' },
  // Ventas
  { id: 'sellers', name: 'Vendedores', path: '/vendedores', category: 'ventas' },
  // Producción
  { id: 'ingredients', name: 'Insumos', path: '/insumos', category: 'produccion' },
  { id: 'recipes', name: 'Composición de Productos', path: '/recetas', category: 'produccion' },
  { id: 'production', name: 'Producción', path: '/produccion', category: 'produccion' },
  // Otros
  { id: 'loans', name: 'Préstamos', path: '/prestamos', category: 'otros' },
]

// Nombres de categorías para mostrar en la UI
export const CATEGORY_NAMES = {
  principal: 'Principal',
  documentos: 'Documentos',
  inventario: 'Inventario',
  compras: 'Compras y Proveedores',
  ventas: 'Ventas',
  produccion: 'Producción',
  operaciones: 'Operaciones',
  finanzas: 'Finanzas',
  equipo: 'Equipo',
  sistema: 'Sistema',
  otros: 'Otros',
}

// Lista completa de todas las páginas
export const AVAILABLE_PAGES = [
  ...COMMON_PAGES,
  ...RETAIL_PAGES,
  ...RESTAURANT_PAGES,
  ...PHARMACY_PAGES,
  ...REAL_ESTATE_PAGES,
  ...TRANSPORT_PAGES,
]

/**
 * Obtener páginas disponibles según el modo del negocio
 * @param {string} businessMode - 'retail', 'restaurant', 'pharmacy', 'real_estate' o 'transport'
 * @returns {array} - Array de páginas disponibles
 */
export const getAvailablePagesByMode = (businessMode) => {
  if (businessMode === 'restaurant') {
    return [...COMMON_PAGES, ...RESTAURANT_PAGES]
  } else if (businessMode === 'pharmacy') {
    return [...COMMON_PAGES, ...PHARMACY_PAGES]
  } else if (businessMode === 'real_estate') {
    return [...COMMON_PAGES, ...REAL_ESTATE_PAGES]
  } else if (businessMode === 'transport') {
    return [...COMMON_PAGES, ...TRANSPORT_PAGES]
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
      allowedDocumentTypes: userData.allowedDocumentTypes || [], // Tipos de comprobante permitidos en POS (vacío = todos)
      allowedPaymentMethods: userData.allowedPaymentMethods || [], // Métodos de pago permitidos en POS (vacío = todos)
      assignedSellerId: userData.assignedSellerId || null, // Vendedor asignado al sub-usuario en POS
      assignedSellerName: userData.assignedSellerName || null,
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
