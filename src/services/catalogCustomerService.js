/**
 * Cuentas de CLIENTES del catálogo público (compradores).
 *
 * Modelo elegido (28-jul-2026): cuenta POR NEGOCIO.
 *   - La identidad (uid de Firebase Auth) es única a nivel proyecto: la misma
 *     cuenta de Google sirve en cualquier catálogo.
 *   - El PERFIL vive dentro del negocio: `businesses/{businessId}/catalogCustomers/{uid}`
 *     Así cada comercio ve solo a sus propios clientes y no comparte datos con
 *     otros comercios de la red.
 *
 * La sesión usa `catalogAuth` (instancia aislada, ver src/lib/firebase.js): un
 * comprador que inicia sesión aquí NO afecta la sesión del dueño en la app.
 *
 * IMPORTANTE: la cuenta es SIEMPRE OPCIONAL. El checkout de invitado sigue
 * funcionando igual; esto solo agrega comodidades (historial, direcciones).
 */
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, query, where, orderBy, limit, getDocs,
} from 'firebase/firestore'
import { catalogAuth, catalogDb } from '@/lib/firebase'

// ==================== Sesión ====================

/** Suscribe a cambios de sesión del comprador. Devuelve la función de baja. */
export const onCatalogAuthChanged = (callback) => {
  if (!catalogAuth) return () => {}
  return onAuthStateChanged(catalogAuth, callback)
}

export const catalogSignOut = async () => {
  if (!catalogAuth) return { success: false, error: 'Auth no disponible' }
  try {
    await fbSignOut(catalogAuth)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Traduce los códigos de Firebase Auth a mensajes que entienda un comprador
 * (no un desarrollador). Sin esto salen cosas como "auth/invalid-credential".
 */
const friendlyAuthError = (error) => {
  switch (error?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos'
    case 'auth/email-already-in-use':
      return 'Ese correo ya tiene una cuenta. Inicia sesión.'
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres'
    case 'auth/invalid-email':
      return 'El correo no es válido'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Se cerró la ventana de Google antes de terminar'
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana de Google. Habilita las ventanas emergentes.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
    case 'auth/network-request-failed':
      return 'Sin conexión. Revisa tu internet.'
    default:
      return error?.message || 'No se pudo completar la operación'
  }
}

export const catalogSignInWithGoogle = async (businessId) => {
  if (!catalogAuth) return { success: false, error: 'Auth no disponible' }
  try {
    const provider = new GoogleAuthProvider()
    // Forzar el selector de cuenta: en un equipo compartido (bodega, tablet)
    // no queremos que entre solo con la última cuenta usada.
    provider.setCustomParameters({ prompt: 'select_account' })
    const result = await signInWithPopup(catalogAuth, provider)
    await ensureCatalogCustomerProfile(businessId, result.user)
    return { success: true, user: result.user }
  } catch (error) {
    console.error('Error en login con Google (catálogo):', error)
    return { success: false, error: friendlyAuthError(error) }
  }
}

export const catalogSignInWithEmail = async (businessId, email, password) => {
  if (!catalogAuth) return { success: false, error: 'Auth no disponible' }
  try {
    const result = await signInWithEmailAndPassword(catalogAuth, email.trim(), password)
    await ensureCatalogCustomerProfile(businessId, result.user)
    return { success: true, user: result.user }
  } catch (error) {
    return { success: false, error: friendlyAuthError(error) }
  }
}

/**
 * Registro por correo, con un detalle importante de experiencia:
 *
 * La identidad es única en todo Cobrify, así que un comprador que ya se
 * registró en OTRA tienda de la red va a chocar con "correo en uso" en una
 * tienda donde jamás estuvo — y para él las tiendas son negocios
 * independientes, no entendería el mensaje.
 *
 * Solución: si el correo ya existe, intentamos iniciar sesión con la MISMA
 * contraseña que acaba de escribir. Si es la suya, entra sin fricción y se le
 * crea su perfil en ESTE negocio (los datos de la otra tienda no se comparten).
 * Si no coincide, lo mandamos a iniciar sesión con un mensaje claro.
 */
export const catalogRegisterWithEmail = async (businessId, { email, password, name, phone }) => {
  if (!catalogAuth) return { success: false, error: 'Auth no disponible' }
  try {
    const result = await createUserWithEmailAndPassword(catalogAuth, email.trim(), password)
    if (name) {
      try { await updateProfile(result.user, { displayName: name }) } catch { /* no crítico */ }
    }
    await ensureCatalogCustomerProfile(businessId, result.user, { name, phone })
    return { success: true, user: result.user, created: true }
  } catch (error) {
    if (error?.code === 'auth/email-already-in-use') {
      try {
        const signed = await signInWithEmailAndPassword(catalogAuth, email.trim(), password)
        // Es la misma persona: se le crea su perfil en este negocio con los
        // datos que acaba de escribir (su perfil de la otra tienda no se toca).
        await ensureCatalogCustomerProfile(businessId, signed.user, { name, phone })
        return { success: true, user: signed.user, existingAccount: true }
      } catch {
        // Contraseña distinta, o la cuenta existe pero con Google (no tiene
        // contraseña). No podemos distinguir el caso de forma fiable cuando
        // está activa la protección contra enumeración de correos, así que
        // ofrecemos las dos salidas.
        return {
          success: false,
          needsLogin: true,
          error: 'Ya existe una cuenta con este correo. Inicia sesión con tu contraseña o entra con Google.',
        }
      }
    }
    return { success: false, error: friendlyAuthError(error) }
  }
}

export const catalogSendPasswordReset = async (email) => {
  if (!catalogAuth) return { success: false, error: 'Auth no disponible' }
  try {
    await sendPasswordResetEmail(catalogAuth, email.trim())
    return { success: true }
  } catch (error) {
    return { success: false, error: friendlyAuthError(error) }
  }
}

// ==================== Perfil por negocio ====================

const profileRef = (businessId, uid) =>
  doc(catalogDb, 'businesses', businessId, 'catalogCustomers', uid)

/**
 * Crea el perfil del comprador en ESTE negocio si aún no existe (merge, nunca
 * pisa datos que el cliente ya editó). Se llama tras cada login: si la misma
 * cuenta entra por primera vez a otro catálogo, se le crea su perfil ahí.
 */
export const ensureCatalogCustomerProfile = async (businessId, user, extra = {}) => {
  if (!businessId || !user?.uid) return { success: false, error: 'Faltan datos' }
  try {
    const ref = profileRef(businessId, user.uid)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      // Solo refrescamos la marca de última visita
      await setDoc(ref, { lastLoginAt: serverTimestamp() }, { merge: true })
      return { success: true, created: false, data: { id: snap.id, ...snap.data() } }
    }
    const profile = {
      uid: user.uid,
      name: extra.name || user.displayName || '',
      email: user.email || '',
      phone: extra.phone || user.phoneNumber || '',
      photoURL: user.photoURL || null,
      provider: user.providerData?.[0]?.providerId || 'password',
      addresses: [],
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    }
    await setDoc(ref, profile, { merge: true })
    return { success: true, created: true, data: profile }
  } catch (error) {
    console.error('Error al crear perfil de cliente del catálogo:', error)
    return { success: false, error: error.message }
  }
}

export const getCatalogCustomerProfile = async (businessId, uid) => {
  if (!businessId || !uid) return { success: false, error: 'Faltan datos' }
  try {
    const snap = await getDoc(profileRef(businessId, uid))
    if (!snap.exists()) return { success: false, error: 'Perfil no encontrado' }
    return { success: true, data: { id: snap.id, ...snap.data() } }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/** Actualiza datos del perfil (nombre, teléfono, direcciones). Merge parcial. */
export const updateCatalogCustomerProfile = async (businessId, uid, updates) => {
  if (!businessId || !uid) return { success: false, error: 'Faltan datos' }
  try {
    await setDoc(profileRef(businessId, uid), { ...updates, updatedAt: serverTimestamp() }, { merge: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ==================== Direcciones ====================
// Se guardan como array dentro del perfil (son pocas por cliente; no ameritan
// subcolección). Cada una: { id, label, address, reference, coords, isDefault }.

export const saveCatalogCustomerAddress = async (businessId, uid, address, currentAddresses = []) => {
  const list = [...currentAddresses]
  const entry = {
    id: address.id || `addr-${Date.now()}`,
    label: (address.label || '').trim() || 'Mi dirección',
    address: (address.address || '').trim(),
    reference: (address.reference || '').trim(),
    coords: address.coords || null,
    isDefault: !!address.isDefault,
  }
  const idx = list.findIndex(a => a.id === entry.id)
  if (idx >= 0) list[idx] = entry
  else list.push(entry)
  // Solo una puede ser la predeterminada
  if (entry.isDefault) {
    for (const a of list) if (a.id !== entry.id) a.isDefault = false
  } else if (!list.some(a => a.isDefault) && list.length > 0) {
    list[0].isDefault = true
  }
  const result = await updateCatalogCustomerProfile(businessId, uid, { addresses: list })
  return result.success ? { success: true, addresses: list } : result
}

export const deleteCatalogCustomerAddress = async (businessId, uid, addressId, currentAddresses = []) => {
  const list = currentAddresses.filter(a => a.id !== addressId)
  if (list.length > 0 && !list.some(a => a.isDefault)) list[0].isDefault = true
  const result = await updateCatalogCustomerProfile(businessId, uid, { addresses: list })
  return result.success ? { success: true, addresses: list } : result
}

// ==================== Historial de pedidos ====================

/**
 * Pedidos que el comprador hizo EN ESTE negocio con su cuenta.
 * Los pedidos de invitado (sin catalogCustomerId) no aparecen: no hay forma
 * seria de atribuirlos sin arriesgar mostrar pedidos de otra persona.
 */
export const getCatalogCustomerOrders = async (businessId, uid, max = 20) => {
  if (!businessId || !uid) return { success: false, error: 'Faltan datos' }
  try {
    const q = query(
      collection(catalogDb, 'businesses', businessId, 'orders'),
      where('catalogCustomerId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(max)
    )
    const snap = await getDocs(q)
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al obtener pedidos del comprador:', error)
    return { success: false, error: error.message }
  }
}
